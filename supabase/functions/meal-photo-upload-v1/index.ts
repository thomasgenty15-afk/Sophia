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
import { CHAT_SCOPE, deliverChatMessage } from "../_shared/chat/delivery.ts";
import { claimInbound } from "../_shared/chat/inbound_pipeline.ts";
import { openMealPrecisionFlow } from "../_shared/keel/meal_precision_flow.ts";
import { openMealPrecisionFlowState } from "../_shared/keel/meal_precision_flow_state.ts";
import { protocolEventComponentKey } from "../_shared/keel/protocol_event_key.ts";
import { studentBindingIn } from "../_shared/keel/meal_analysis.ts";

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
  /**
   * DE-WHATSAPP — LA COUTURE VERS LA BULLE.
   *
   * Présent = cette photo a été envoyée DANS la conversation, et non depuis
   * l'écran du jour. La fonction écrit alors deux lignes dans `chat_messages`:
   * la photo de l'élève, puis l'accusé.
   *
   * ── POURQUOI ICI ET PAS DANS `chat-inbound-v1` ────────────────────────────
   * L'accusé (`analysis.student_message`) est rendu par `analyze-meal-photo-v1`
   * à partir de la LIAISON et du CRÉDIT réellement écrits — deux choses que
   * seule cette chaîne connaît. Le faire re-rendre par la bulle demanderait de
   * reconstruire la liaison depuis la ligne, c'est-à-dire une SECONDE
   * implémentation de « qu'est-ce qui a été crédité » — précisément la classe
   * de mensonge que `renderMealPhotoAck` a été refondu pour rendre impossible
   * (voir `MealPhotoAckArgs.binding`, « an argument that is absent cannot be
   * forgotten by a caller; an optional one can »).
   *
   * C'est aussi l'identifiant d'idempotence du tour côté conversation: le même
   * envoi rejoué n'écrit qu'un message.
   */
  chat_client_message_id: z.string().trim().min(8).max(128).optional(),
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

/**
 * SHA-256 des octets, en hexadécimal minuscule.
 *
 * C'est l'étage DÉTERMINISTE de la déduplication. Deux envois du même fichier
 * par le même élève le même jour local sont le même repas — une certitude, pas
 * une probabilité: aucun modèle, aucun seuil, aucun faux positif possible.
 *
 * Ce que ça ne couvre pas, volontairement: deux photos DIFFÉRENTES du même
 * repas (un autre angle). Ce cas-là est incertain, et l'incertitude ne se règle
 * pas dans une contrainte d'unicité — elle se règle en demandant à l'élève.
 *
 * Le format est contraint côté base (`^[0-9a-f]{64}$`), donc une implémentation
 * qui rendrait autre chose serait refusée à l'écriture plutôt que stockée.
 */
/**
 * Les colonnes du fait, lues au même endroit par les trois chemins: l'INSERT,
 * la relecture d'idempotence, et la détection de doublon. Remontée au niveau
 * module parce que la déduplication interroge la table AVANT l'upload — et
 * qu'une seconde liste de colonnes est une liste qui diverge.
 */
const EVENT_COLUMNS =
  "id, user_id, occurred_at, local_date, slot_key, source, media_path, " +
  "food_group_ref, portion_band, recognized, recognition_confidence, " +
  "disqualified_reason, media_sha256, source_message_id";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // La copie n'est pas décorative: `crypto.subtle` n'accepte pas une vue dont
  // le buffer pourrait être partagé (`SharedArrayBuffer`), et le type de
  // `bytes` ne l'exclut pas. Sur une photo de 8 Mo au maximum, la copie coûte
  // moins qu'un cast qui mentirait au compilateur.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes).buffer,
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
      //
      // ── DE-WHATSAPP: DANS LA CONVERSATION, UN REFUS SE DIT ─────────────────
      // Le 409 reste le contrat de l'API, et l'écran du jour le lit très bien.
      // Mais un élève qui vient d'envoyer une photo DANS LA BULLE ne lit pas un
      // code HTTP: sans un mot, il voit sa photo partir et rien revenir, ce qui
      // est indiscernable d'une panne. On lui répond, dans la bulle, ce que le
      // 409 dit à l'API — et sans lui reprocher quoi que ce soit: ne pas avoir
      // encore de plan n'est pas sa faute.
      if (body.chat_client_message_id) {
        await deliverChatMessage(admin, {
          userId,
          content:
            "I can't file that photo yet — your coach hasn't published your plan, " +
            "so there's nothing for it to count toward. Send it again once your " +
            "plan is live and I'll log it.",
          isReply: true,
          purpose: "keel_meal_photo_no_plan",
          requestId,
        }).catch(() => {});
      }
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

    // L'IDENTITÉ DE CET ENVOI, calculée avant la déduplication parce qu'elle
    // sert à la déduplication: `source_message_id` est ce qui distingue « le
    // MÊME envoi rejoué » (retry réseau) de « un AUTRE envoi portant la même
    // image » (l'élève renvoie sa photo). Les deux sont des doublons, ils
    // n'ont pas le même nom, et l'appelant lit les deux.
    const uploadId = body.client_upload_id ?? crypto.randomUUID();
    const path = objectPath({
      userId,
      localDate,
      uploadId,
      mimeType: declaredMime,
    });
    const sourceMessageId = `web_photo:${path}`;

    // ---- 5bis. LA DÉDUPLICATION EXACTE ------------------------------------
    // AVANT l'upload, et pas après l'INSERT: un doublon détecté ici ne coûte ni
    // un objet de plus dans le bucket, ni un appel au modèle de vision.
    //
    // L'index unique `protocol_events_media_dedup_idx` reste l'arbitre — ce
    // SELECT est l'optimisation, pas la garantie. Deux taps simultanés sur
    // envoyer passeraient tous les deux ici; c'est Postgres qui tranche, au
    // rattrapage de violation d'unicité plus bas.
    const mediaSha256 = await sha256Hex(bytes);
    const priorSame = await admin
      .from("protocol_events")
      .select(EVENT_COLUMNS)
      .eq("user_id", userId)
      .eq("local_date", localDate)
      .eq("media_sha256", mediaSha256)
      .maybeSingle();
    if (priorSame.error) {
      throw new Error(
        `protocol_events dedup lookup failed: ${priorSame.error.message}`,
      );
    }
    if (priorSame.data) {
      const priorRow = priorSame.data as Record<string, unknown>;
      const priorPath = String(priorRow.media_path ?? "");
      // Le MÊME envoi rejoué porte le même `source_message_id` — c'est un
      // retry réseau, et l'appelant doit continuer de lire `idempotent`. Un
      // envoi différent portant la même image est un `duplicate`. Confondre
      // les deux ferait mentir la réponse sur ce qui vient de se passer.
      const sameUpload = String(priorRow.source_message_id ?? "") === sourceMessageId;
      // On répond dans la bulle, on ne reste pas muet: l'élève qui renvoie sa
      // photo le fait presque toujours parce qu'il n'a pas vu la réponse
      // arriver. Un silence le ferait recommencer une troisième fois.
      let dupDelivered: string | null = null;
      if (body.chat_client_message_id) {
        try {
          const claim = await claimInbound(admin, {
            message: {
              client_message_id: body.chat_client_message_id,
              user_id: userId,
              kind: "media",
              text: String(body.student_note ?? "").trim(),
              media_ref: {
                path: priorPath,
                content_type: sniffed,
                size_bytes: bytes.length,
              },
              button_payload: null,
              form_response: null,
              form_token: null,
              reply_to: null,
              received_at: new Date().toISOString(),
            },
            requestId,
          });
          if (claim.status === "fresh") {
            const res = await deliverChatMessage(admin, {
              userId,
              content:
                "I already have that photo — it is the same one, so I have not logged it twice.",
              isReply: true,
              purpose: "keel_meal_photo_ack",
              requestId,
              metadata: {
                media_path: priorPath,
                event_id: String(priorRow.id ?? ""),
                duplicate_of: String(priorRow.id ?? ""),
              },
            });
            dupDelivered = res.chatMessageId;
          }
        } catch (chatError) {
          console.warn(JSON.stringify({
            tag: "meal_photo_duplicate_chat_delivery_failed",
            user_id: userId,
            error: chatError instanceof Error
              ? chatError.message
              : String(chatError),
          }));
        }
      }
      return jsonResponse(req, {
        ok: true,
        // `duplicate` est distinct d'`idempotent`: `idempotent` dit « ce MÊME
        // envoi était déjà traité » (rejeu réseau), `duplicate` dit « un AUTRE
        // envoi portait déjà cette image ». L'appelant ne doit présenter ni
        // l'un ni l'autre comme un fait neuf.
        duplicate: !sameUpload,
        idempotent: sameUpload,
        chat_message_id: dupDelivered,
        event: priorRow,
        food_group_ref: priorRow.food_group_ref ?? null,
        portion_band: priorRow.portion_band ?? null,
        media_path: priorPath,
        local_date: localDate,
        slot_key: slotKey,
        analysis: null,
        request_id: requestId,
      });
    }

    // ---- 6. upload, read the object back ----------------------------------
    // `uploadId`, `path` et `sourceMessageId` sont calculés plus haut: la
    // déduplication en a besoin avant d'écrire quoi que ce soit.
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
      // L'empreinte des octets. C'est elle que `protocol_events_media_dedup_idx`
      // contraint: à partir d'ici, deux envois du même fichier le même jour ne
      // peuvent plus produire deux faits, même s'ils arrivent en même temps.
      media_sha256: mediaSha256,
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
        // DEUX index uniques mordent sur cette table maintenant, et ils ne
        // disent pas la même chose. Le premier est le rejeu du MÊME envoi
        // (`source_message_id`); le second est la course perdue contre un AUTRE
        // envoi portant la même image (`media_sha256`) — deux taps simultanés
        // sur le bouton, que le SELECT de l'étape 5bis a tous les deux laissés
        // passer. Sans ce second rattrapage, cette course rendait une 500 à un
        // élève dont la photo était pourtant bien enregistrée.
        const sameMedia = await admin
          .from("protocol_events")
          .select(EVENT_COLUMNS)
          .eq("user_id", userId)
          .eq("local_date", localDate)
          .eq("media_sha256", mediaSha256)
          .maybeSingle();
        if (sameMedia.error) {
          throw new Error(
            `protocol_events media read-back failed: ${sameMedia.error.message}`,
          );
        }
        eventRow = sameMedia.data as Record<string, unknown> | null;
      }
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

    // ── DE-WHATSAPP — LA PHOTO ENTRE DANS LA CONVERSATION ────────────────────
    // Après tout le reste, jamais avant: un échec ici ne doit pas défaire un
    // fait déjà écrit et déjà analysé. Une photo enregistrée sans message dans
    // la bulle est un défaut visible et réparable; une photo perdue ne l'est pas.
    let chatDelivered: string | null = null;
    if (body.chat_client_message_id) {
      try {
        const claim = await claimInbound(admin, {
          message: {
            client_message_id: body.chat_client_message_id,
            user_id: userId,
            kind: "media",
            text: String(body.student_note ?? "").trim(),
            button_payload: null,
            media_ref: {
              path,
              // Le type SNIFFÉ (octets magiques), jamais celui déclaré: le
              // déclaré a déjà été refusé s'il divergeait, mais c'est le sniffé
              // qui décrit le fichier réellement stocké.
              content_type: sniffed,
              size_bytes: bytes.length,
            },
            form_response: null,
            form_token: null,
            reply_to: null,
            received_at: new Date().toISOString(),
          },
          requestId,
        });
        // Rejeu du même envoi: la photo est déjà dans la bulle, on n'y remet ni
        // le message ni l'accusé. `idempotent` dit déjà la même chose du fait.
        if (claim.status === "fresh") {
          await admin.from("chat_messages").insert({
            user_id: userId,
            scope: CHAT_SCOPE,
            role: "user",
            // Une photo sans légende a quand même besoin d'un texte lisible
            // dans le journal; la légende de l'élève gagne quand il y en a une.
            content: String(body.student_note ?? "").trim() || "[photo]",
            metadata: {
              channel: "in_app",
              kind: "media",
              client_message_id: body.chat_client_message_id,
              media_ref: { path, content_type: sniffed, size_bytes: bytes.length },
              request_id: requestId,
            },
          } as never);

          const ack = String(
            (analysis as { student_message?: unknown } | null)?.student_message ?? "",
          ).trim();
          // Pas d'accusé rendu = l'analyse n'a pas tourné. On le DIT au lieu de
          // laisser un silence qui ressemble à une photo ignorée.
          const body_text = ack ||
            "Saved. I could not analyse it just now — it is on file either way.";
          const res = await deliverChatMessage(admin, {
            userId,
            content: body_text,
            isReply: true,
            purpose: "keel_meal_photo_ack",
            requestId,
            metadata: { media_path: path, event_id: eventId },
          });
          chatDelivered = res.chatMessageId;
        }
      } catch (chatError) {
        console.warn(JSON.stringify({
          tag: "meal_photo_chat_delivery_failed",
          user_id: userId,
          error: chatError instanceof Error ? chatError.message : String(chatError),
        }));
      }
    }

    // ── LE FLOW DE CORRECTION S'OUVRE ICI ────────────────────────────────────
    // Sophia vient de dire ce qu'elle a vu. Le tour suivant — « non c'était du
    // poulet » — doit AMENDER cette ligne, pas en écrire une seconde. Sans cet
    // état, la correction repart dans le routeur global, `log_protocol_event`
    // y voit une information alimentaire, et l'élève qui a mangé une fois en a
    // deux au compteur de son coach.
    //
    // Conditions, toutes nécessaires:
    //  - un accusé est réellement parti dans la bulle (`chatDelivered`): sans
    //    message à quoi répondre, il n'y a pas de correction possible;
    //  - le fait COMPTE (`disqualified_reason` null): il n'y a rien à corriger
    //    sur une photo qui n'est pas un repas — et rien à en retirer non plus.
    //
    // Best-effort par contrat: un échec ici ne défait pas une photo déjà
    // enregistrée et déjà analysée.
    if (chatDelivered) {
      const recognized =
        (analysis as { recognized?: Record<string, unknown> } | null)?.recognized ??
          null;
      const disqualified =
        (eventRow as { disqualified_reason?: unknown }).disqualified_reason ?? null;
      if (recognized && disqualified === null) {
        const foods = Array.isArray(recognized.detected_foods)
          ? (recognized.detected_foods as Array<Record<string, unknown>>)
            .map((f) => String(f?.label ?? "").trim())
            .filter((l) => l !== "")
          : [];
        const question = typeof recognized.clarifying_question === "string"
          ? recognized.clarifying_question
          : null;
        const now = new Date();
        const opened = await openMealPrecisionFlowState(admin, {
          userId,
          scope: CHAT_SCOPE,
          flow: openMealPrecisionFlow({
            source: "photo",
            eventIds: [eventId],
            // L'IDENTITÉ DÉJÀ ÉCRITE, calculée par la MÊME fonction que
            // l'écriture texte. C'est ce qui empêchera « oui, du poulet grillé »
            // de refaire un poulet: la réponse à la question de précision ne
            // réécrit jamais ce qu'elle précise.
            componentKeys: [
              protocolEventComponentKey({
                food_group_ref:
                  (eventRow as { food_group_ref?: unknown }).food_group_ref ===
                      null ||
                    (eventRow as { food_group_ref?: unknown }).food_group_ref ===
                      undefined
                    ? null
                    : String(
                      (eventRow as { food_group_ref?: unknown }).food_group_ref,
                    ),
                substance_ref: null,
                commitment_id: studentBindingIn(recognized),
              }),
            ],
            question,
            now,
          }),
          detectedFoods: foods,
          now,
        });
        if (!opened) {
          // On le DIT. Un flow qui ne s'ouvre pas ne casse rien de visible —
          // il rend juste au tour suivant le comportement d'avant, celui qui
          // double le repas. Le silence rendrait ça indétectable.
          console.warn(JSON.stringify({
            tag: "meal_photo_flow_open_failed",
            user_id: userId,
            event_id: eventId,
          }));
        }
      }
    }

    return jsonResponse(req, {
      ok: true,
      // `idempotent: true` means this exact upload was already on file. The
      // caller must not present it as a new fact.
      idempotent,
      chat_message_id: chatDelivered,
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
