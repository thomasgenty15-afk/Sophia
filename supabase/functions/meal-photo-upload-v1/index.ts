/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  createClient,
  type SupabaseClient,
} from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  badRequest,
  getRequestId,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { resolveResponseLocale } from "../_shared/keel/locale.ts";
import { parseSlotKey } from "../_shared/keel/tokens.ts";

/**
 * KEEL W5 — `meal-photo-upload-v1`: the WEB path for a meal photo.
 *
 * Authority: docs/keel/CONTRACT.md non-input #4, docs/keel/BUILD_PLAN.md W5.4.
 * The WhatsApp equivalent is `whatsapp-webhook/handlers_meal_photo.ts` (W5.1);
 * the two paths differ only in how the bytes arrive. Everything after that --
 * bucket key convention, write-through row, analysis call -- is deliberately
 * the same sequence, in the same order.
 *
 * WHY THIS FUNCTION EXISTS AT ALL (it looks like something the browser could do
 * directly): migration 20260727130000 states, and W1.4 R3 re-affirms, that there
 * are NO `storage.objects` policies. Both `anon` and `authenticated` are
 * structurally unable to touch these buckets. Every file access is an edge
 * function in service_role that has already checked ownership. That is the
 * arbitration; this function is its consequence, not a preference.
 *
 * THE SEQUENCE, and what each step refuses to skip:
 *   1. authenticate the STUDENT (their JWT), never a service call. The row's
 *      user_id is `auth.uid()` and nothing else -- a body-supplied user_id would
 *      let any authenticated account write facts into someone else's protocol.
 *   2. rate-limit PER USER, after auth. A vision call costs money; the limit is
 *      keyed on the identity, not on an IP a phone changes every hour.
 *   3. verify the mime by MAGIC BYTES, not by the declared header. A client that
 *      says "image/png" over an arbitrary payload must not get it stored and fed
 *      to a model.
 *   4. resolve the local date SERVER-SIDE from the plan timezone. A client-
 *      supplied date is a client-supplied fact: it would let a student file
 *      today's plate on a day the evaluator has not closed yet.
 *   5. upload, then READ THE OBJECT BACK, then insert the row, then read THAT
 *      back. Nothing is announced that is not a re-read row (execution truth).
 *   6. call `analyze-meal-photo-v1`. Its failure NEVER fails the upload: the
 *      fact is already committed and the response says plainly that the analysis
 *      did not run. A saved photo with no verdict beats a lost photo.
 *   7. re-read the row. The analysis UPDATES the fact it was given
 *      (`recognized`, `recognition_confidence`, `food_group_ref`), so the
 *      `event` returned by step 5 is stale by the time we answer. Returning it
 *      would tell the caller `food_group_ref: null` on a photo that just
 *      credited a line -- a response that contradicts the database.
 *
 * NON-INPUT #4, restated where the insert is: this function writes
 * `quantity=null`, `unit=null`, `substance_ref=null`. A photo evidences; it
 * does not measure, and no code path here can put a number on the row.
 *
 * `food_group_ref` is inserted null and is NOT a measurement: it is the
 * IDENTITY of what is on the plate. It stays null here because at insert time
 * the image has not been read yet; `analyze-meal-photo-v1` fills it from
 * `resolveFoodGroupCredit` (the group the plate SHOWS; the day's plan is
 * consulted only to break a tie between several detected groups, and an
 * unresolvable tie stays null). Hardcoding it null for good was the defect that
 * made the photo the most expensive gesture in the product for zero credit.
 */

const MEAL_PHOTO_BUCKET = "meal-photos";
/** SCHEMA.md evidence ladder: photo 1.0 / detailed text 0.8 / thumbs-up 0.4. */
const PHOTO_EVIDENCE_WEIGHT = 1.0;
const MAX_DECODED_BYTES = 8 * 1024 * 1024;
const UNIQUE_VIOLATION = "23505";

/**
 * Per-user windows. Mirrors `handlers_meal_photo.ts::MEAL_PHOTO_RATE_WINDOWS`
 * so the two surfaces cost the same: a burst window (double-tap, a hostile
 * loop) and a daily ceiling.
 */
const PHOTO_RATE_WINDOWS = [
  { limit: 6, windowSeconds: 600 },
  { limit: 40, windowSeconds: 86_400 },
];

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const REQUEST_SCHEMA = z.object({
  mime_type: z.string().trim().min(1).max(80),
  base64: z.string().min(1).max(12_000_000),
  slot_key: z.string().trim().min(1).max(40).nullable().optional(),
  /**
   * The line the student tapped the camera on, if any. Verified below against
   * THEIR published plan -- an id from anywhere else is refused, the same
   * discipline the analyzer applies to the model's output.
   */
  commitment_id: z.string().uuid().nullable().optional(),
  student_note: z.string().trim().max(2000).nullable().optional(),
  /**
   * IDEMPOTENCE KEY, generated once per selected file by the client. It keys
   * both the object path and `source_message_id`, so a retry of the same upload
   * overwrites the same object and collides on the same partial unique index
   * instead of creating a second fact. Optional: without it a retry is a new
   * photo, which is the honest reading of a request that carries no identity.
   */
  client_upload_id: z.string().trim().min(8).max(64).optional(),
});

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function internalSecret(): string {
  return (Deno.env.get("INTERNAL_FUNCTION_SECRET")?.trim() ||
    Deno.env.get("SECRET_KEY")?.trim() || "");
}

function functionsBaseUrl(): string {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  if (!supabaseUrl) return "http://kong:8000";
  if (supabaseUrl.includes("http://kong:8000")) return "http://kong:8000";
  return supabaseUrl.replace(/\/+$/, "");
}

function decodeBase64(value: string): Uint8Array {
  const cleaned = value.trim().replace(/^data:[^;]+;base64,/, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * THE mime check: what the bytes ARE, not what the caller says they are.
 *
 * Returns the sniffed mime, or null when the payload matches no supported
 * signature. The declared header is then compared against it -- a mismatch is a
 * refusal, not a correction, because the two disagreeing is itself the signal.
 */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && PNG.every((b, i) => bytes[i] === b)) {
    return "image/png";
  }
  // RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * YYYY-MM-DD in the plan's timezone. Same technique as
 * `provision-day-v1/provisioning.ts::localDateInTimezone` and
 * `handlers_meal_photo.ts::localDateInZone`; R7 -- an unknown zone throws rather
 * than silently resolving to UTC and filing the fact on the wrong day.
 */
function localDateInZone(timezone: string, now: Date): string {
  const zone = String(timezone ?? "").trim();
  if (!zone) throw new Error("[meal-photo-upload] empty plan timezone (R7)");
  let formatted: string;
  try {
    formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch (error) {
    throw new Error(
      `[meal-photo-upload] unknown timezone ${JSON.stringify(zone)}`,
      { cause: error },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(formatted)) {
    throw new Error(
      `[meal-photo-upload] unresolvable local date for ${JSON.stringify(zone)}`,
    );
  }
  return formatted;
}

/**
 * Object key. TWO invariants, both load-bearing and both stated in migration
 * 20260727130000:
 *  - it STARTS with the owner's auth user id -- the RGPD export bundles
 *    `<user_id>/` and the purge deletes `<user_id>/`. A key that does not start
 *    with it survives account deletion. That is an RGPD defect, not a cosmetic
 *    one.
 *  - it is a deterministic function of `client_upload_id`, so a retry overwrites
 *    the same object instead of littering the bucket.
 */
function objectPath(args: {
  userId: string;
  localDate: string;
  uploadId: string;
  mimeType: string;
}): string {
  const ext = MIME_EXTENSIONS[args.mimeType] ?? "bin";
  const safeUploadId = args.uploadId.replace(/[^A-Za-z0-9_-]/g, "");
  if (!safeUploadId) {
    throw new Error("[meal-photo-upload] empty upload id after sanitization");
  }
  return `${args.userId}/${args.localDate}/${safeUploadId}.${ext}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  const requestId = getRequestId(req);

  try {
    const parsed = await parseJsonBody(req, REQUEST_SCHEMA, requestId);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    // ---- 1. WHO. The student's own JWT, never a body-supplied id ----------
    const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    const user = authData?.user ?? null;
    if (authError || !user) {
      return jsonResponse(req, {
        error: "Authentication required",
        request_id: requestId,
      }, { status: 401 });
    }
    const userId = user.id;

    // ---- 2. rate limit, keyed on the identity -----------------------------
    const limited = await enforceRateLimit(req, requestId, {
      key: `meal-photo-upload-v1:${userId}`,
      windows: PHOTO_RATE_WINDOWS,
    });
    if (limited) return limited;

    // ---- 3. the bytes ARE what they claim to be ---------------------------
    const declaredMime = body.mime_type.trim().toLowerCase();
    if (!MIME_EXTENSIONS[declaredMime]) {
      return badRequest(
        req,
        requestId,
        `Unsupported image type: ${declaredMime} (allowed: image/jpeg, image/png, image/webp)`,
      );
    }
    let bytes: Uint8Array;
    try {
      bytes = decodeBase64(body.base64);
    } catch {
      return badRequest(req, requestId, "base64 payload is not decodable");
    }
    if (bytes.length === 0) {
      return badRequest(req, requestId, "Empty image payload");
    }
    if (bytes.length > MAX_DECODED_BYTES) {
      return badRequest(
        req,
        requestId,
        `Image too large: ${bytes.length} bytes (max ${MAX_DECODED_BYTES})`,
      );
    }
    const sniffed = sniffImageMime(bytes);
    if (!sniffed) {
      return badRequest(
        req,
        requestId,
        "The uploaded bytes are not a JPEG, PNG or WebP image",
      );
    }
    if (sniffed !== declaredMime) {
      // Refused, not silently corrected: the disagreement is the signal.
      return badRequest(
        req,
        requestId,
        `Declared type ${declaredMime} does not match the actual image type ${sniffed}`,
      );
    }

    const admin = adminClient();

    // ---- 4. the day, resolved in the PLAN's timezone -----------------------
    const planRead = await admin
      .from("plan_versions")
      .select("id, timezone")
      .eq("student_id", userId)
      .eq("status", "published")
      .maybeSingle();
    if (planRead.error) {
      throw new Error(`plan_versions read failed: ${planRead.error.message}`);
    }
    const planVersion = planRead.data as { id: string; timezone: string } | null;
    if (!planVersion) {
      // Without a published plan there is no timezone to resolve the day in and
      // no line to evidence. Trusting a client date instead would be a fact
      // whose origin is the browser clock.
      return jsonResponse(req, {
        error: "No published plan: there is nothing to log this photo against yet.",
        request_id: requestId,
      }, { status: 409 });
    }
    const localDate = localDateInZone(planVersion.timezone, new Date());

    // ---- 5. the two client-supplied tokens, both verified ------------------
    let slotKey: string | null = null;
    if (body.slot_key !== null && body.slot_key !== undefined) {
      try {
        slotKey = parseSlotKey(body.slot_key); // R7: throws on an unknown slot
      } catch (err) {
        return badRequest(
          req,
          requestId,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    const commitmentId = body.commitment_id ?? null;
    if (commitmentId) {
      // The same principle the analyzer applies to the model applies to the
      // client: a commitment id that is not on THIS student's published plan is
      // rejected, because `recognized.commitment_id` is the evaluator's explicit
      // binding and would otherwise write a grade onto an arbitrary line.
      const check = await admin
        .from("plan_commitments")
        .select("id")
        .eq("id", commitmentId)
        .eq("plan_version_id", planVersion.id)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (check.error) {
        throw new Error(`plan_commitments check failed: ${check.error.message}`);
      }
      if (!check.data) {
        return badRequest(
          req,
          requestId,
          "commitment_id is not an active commitment of your published plan",
        );
      }
    }

    // ---- 6. upload, read the object back ----------------------------------
    const uploadId = body.client_upload_id ?? crypto.randomUUID();
    const path = objectPath({
      userId,
      localDate,
      uploadId,
      mimeType: declaredMime,
    });
    const uploaded = await admin.storage
      .from(MEAL_PHOTO_BUCKET)
      .upload(path, bytes, { contentType: declaredMime, upsert: true });
    if (uploaded.error) {
      throw new Error(`meal-photos upload failed: ${uploaded.error.message}`);
    }
    const dir = path.slice(0, path.lastIndexOf("/"));
    const filename = path.slice(path.lastIndexOf("/") + 1);
    const listed = await admin.storage
      .from(MEAL_PHOTO_BUCKET)
      .list(dir, { search: filename, limit: 100 });
    if (listed.error) {
      throw new Error(`meal-photos read-back failed: ${listed.error.message}`);
    }
    const objectExists = (listed.data ?? []).some(
      (o: { name?: string }) => o?.name === filename,
    );
    if (!objectExists) {
      // The upload reported success and the object is not listable. Never write
      // a row whose media_path points at nothing.
      throw new Error(
        `meal-photos object ${path} not readable after upload (write-through violated)`,
      );
    }

    // ---- 7. the fact, inserted AND read back ------------------------------
    const sourceMessageId = `web_photo:${path}`;
    const insertPayload: Record<string, unknown> = {
      user_id: userId,
      occurred_at: new Date().toISOString(),
      local_date: localDate,
      slot_key: slotKey,
      source: "photo",
      media_path: path,
      // non-input #4: a photo is evidence, not a measurement. These three are
      // null HERE and they are null FOREVER -- nothing downstream writes them.
      // `portion_band` (written by the analysis at step 8) is NOT an exception
      // to this: it is an ordinal token under a CHECK, not a number, and it sits
      // beside these three nulls rather than filling them.
      quantity: null,
      unit: null,
      substance_ref: null,
      // Null at insert because nothing has been read from the image yet, NOT
      // as a policy. `analyze-meal-photo-v1` (step 8) writes the identity of
      // the food group when exactly one detected group is on the day's plan.
      food_group_ref: null,
      student_note: body.student_note ?? null,
      // R2: every row carrying prose states its language. R3: the locale comes
      // from the single resolver, never hardcoded at a call site.
      content_locale: resolveResponseLocale({}),
      evidence_weight: PHOTO_EVIDENCE_WEIGHT,
      source_message_id: sourceMessageId,
    };
    if (commitmentId) {
      // The student's own binding, written BEFORE any analysis so that a vision
      // outage cannot lose it. TWO keys on purpose:
      //   `commitment_id`         -- what the evaluator reads (the binding);
      //   `student_commitment_id` -- who said so. The analysis overwrites the
      //     first every run; only the second tells a re-analysis that this line
      //     came from the student and must not be replaced by the model's
      //     reading. Without it, `force: true` silently downgrades a human
      //     statement to a machine one.
      insertPayload.recognized = {
        commitment_id: commitmentId,
        student_commitment_id: commitmentId,
      };
    }

    const EVENT_COLUMNS =
      "id, user_id, occurred_at, local_date, slot_key, source, media_path, " +
      "food_group_ref, portion_band, recognized, recognition_confidence, " +
      "source_message_id";

    let eventRow: Record<string, unknown> | null = null;
    let idempotent = false;
    const inserted = await admin
      .from("protocol_events")
      .insert(insertPayload)
      .select(EVENT_COLUMNS)
      .single();
    if (inserted.error) {
      if ((inserted.error as { code?: string }).code !== UNIQUE_VIOLATION) {
        throw new Error(
          `protocol_events insert failed: ${inserted.error.message}`,
        );
      }
      // Idempotence lives in the schema's partial unique index, not in a
      // client-side "have I seen this?" check that races with itself.
      const existing = await admin
        .from("protocol_events")
        .select(EVENT_COLUMNS)
        .eq("user_id", userId)
        .eq("source_message_id", sourceMessageId)
        .maybeSingle();
      if (existing.error) {
        throw new Error(
          `protocol_events read-back failed: ${existing.error.message}`,
        );
      }
      eventRow = existing.data as Record<string, unknown> | null;
      idempotent = true;
      if (!eventRow) {
        throw new Error(
          "protocol_events unique violation with no readable existing row",
        );
      }
    } else {
      eventRow = inserted.data as Record<string, unknown>;
    }
    const eventId = String(eventRow.id ?? "");
    if (!eventId) {
      throw new Error("protocol_events returned no readable id");
    }

    // ---- 8. the analysis. Its failure costs the verdict, never the fact ----
    let analysis: Record<string, unknown> = {
      status: "skipped",
      reason: "internal_secret_missing",
    };
    const secret = internalSecret();
    if (secret) {
      try {
        const res = await fetch(
          `${functionsBaseUrl()}/functions/v1/analyze-meal-photo-v1`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Secret": secret,
              "x-request-id": requestId,
              ...(anonKey
                ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
                : {}),
            },
            body: JSON.stringify({
              protocol_event_id: eventId,
              // The bytes are already in hand: skip a bucket round-trip.
              base64: body.base64,
              mime_type: declaredMime,
            }),
          },
        );
        const data = await res.json().catch(() => ({}));
        analysis = res.ok
          ? (data as Record<string, unknown>)
          : {
            status: "failed",
            http_status: res.status,
            error: (data as { error?: unknown })?.error ?? "analysis failed",
          };
      } catch (err) {
        analysis = {
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // ---- 9. the row as it stands NOW --------------------------------------
    // The analysis updated the very row we inserted. Answering with the
    // pre-analysis copy would report `food_group_ref: null` on a photo that
    // just credited a line -- a response contradicting the database, which is
    // the same defect class as an acknowledgement without a committed effect.
    // A failed re-read costs the freshness, never the upload: we fall back to
    // the row we already read back at step 7.
    const refreshed = await admin
      .from("protocol_events")
      .select(EVENT_COLUMNS)
      .eq("id", eventId)
      .maybeSingle();
    if (!refreshed.error && refreshed.data) {
      eventRow = refreshed.data as Record<string, unknown>;
    }

    return jsonResponse(req, {
      ok: true,
      // `idempotent: true` means this exact upload was already on file. The
      // caller must not present it as a new fact.
      idempotent,
      event: eventRow,
      // Read from the row, not from the analysis response: this is what the
      // evaluator will see.
      food_group_ref: (eventRow as { food_group_ref?: unknown }).food_group_ref ?? null,
      // Same rule for the ordinal magnitude: the COLUMN as the database holds it
      // after the analysis, never `recognized.portion_band` (that copy is jsonb,
      // and jsonb is what the evaluator is forbidden to read -- R5).
      portion_band: (eventRow as { portion_band?: unknown }).portion_band ?? null,
      media_path: path,
      local_date: localDate,
      slot_key: slotKey,
      analysis,
      request_id: requestId,
    });
  } catch (err) {
    await logEdgeFunctionError({
      functionName: "meal-photo-upload-v1",
      error: err,
      requestId,
    });
    return serverError(req, requestId, "meal-photo-upload-v1 failed");
  }
});
