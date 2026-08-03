/**
 * KEEL W5.1 — inbound meal photo over WhatsApp.
 *
 * Authority: docs/keel/CONTRACT.md, docs/keel/SCHEMA.md, docs/keel/BUILD_PLAN.md (W5.1/W5.2).
 *
 * WHAT THIS FILE IS
 * -----------------
 * The turn a student sends a photo. It ends with ONE fact in the database
 * (`protocol_events(source='photo', media_path=...)`) and an acknowledgement
 * that quotes that row. Nothing else.
 *
 * THE FOUR THINGS THAT WOULD OTHERWISE GO WRONG, AND WHERE THEY ARE HANDLED
 * ------------------------------------------------------------------------
 * 1. THE PAYWALL IS BEHIND US. The tier/trial gate in `whatsapp-webhook/index.ts`
 *    sits ~120 lines AFTER the media branch this handler is called from. A photo
 *    handler wired at the media branch without re-checking the gate is a free,
 *    cost-bearing model call for every non-paying number that knows the phone
 *    number. `gateAllowsPhoto()` below is that check, deliberately a VERBATIM
 *    recopy of the index.ts predicate (trial active OR tier in
 *    alliance/architecte) rather than a "similar" one.
 *
 *    On denial this handler returns `false` — the turn is NOT consumed, and the
 *    caller's existing unsupported-media fallback answers. That keeps the
 *    paywall copy, its anti-spam cooldown and its chat_messages bookkeeping in
 *    exactly one place (index.ts). We refuse the work; we do not duplicate the
 *    messaging.
 *
 * 2. NOTHING IS ACKNOWLEDGED THAT IS NOT IN THE DATABASE. This repo has paid for
 *    phantom commits at least five times (`reminder-phantom-commit-on-flow-exit`,
 *    `fanout-reminder-phantom-commit`, `p0-write-through-reminders`). So: the
 *    object is uploaded AND read back, the row is inserted AND read back
 *    (reusing `log_protocol_event/db.ts`, which already owns that discipline and
 *    the `(user_id, source_message_id)` idempotence index), and only then does a
 *    single acknowledgement go out. A failure at any step returns `false` and
 *    says nothing — the student sees the generic fallback, which is honest.
 *
 * 3. THE MEDIA URL DIES IN SECONDS. `fetchWhatsAppMedia` does both Graph hops in
 *    this invoke and hands back bytes (see the header in `_shared/whatsapp_graph.ts`).
 *    There is no deferred-download path here, on purpose.
 *
 * 4. A PHOTO IS NEVER A QUANTITY. CONTRACT non-input #4: the row is written with
 *    `quantity`, `unit`, `substance_ref` NULL, and NOTHING downstream fills
 *    them. The analysis pass (W5.2) may propose a commitment match; it does not
 *    get to invent a measured value here.
 *
 *    `food_group_ref` is also inserted NULL, but for a different reason and with
 *    a different fate: at this point the image has not been read yet. The credit
 *    by content is applied by `analyze-meal-photo-v1`, called at step 7 below,
 *    which is the only place that knows BOTH the plate and the day's plan. The
 *    rule is the same on both surfaces because it lives in one pure function,
 *    `_shared/keel/meal_analysis.ts::resolveFoodGroupCredit`: the group the
 *    plate SHOWS is written, and the day's plan only breaks a tie when several
 *    groups are detected and the column can hold one. That is an identity,
 *    never a magnitude.
 *
 *    `portion_band` follows the same path and is the one MAGNITUDE this surface
 *    now carries: inserted NULL here (nothing has been read yet), written by
 *    `analyze-meal-photo-v1` as an ORDINAL TOKEN under a CHECK -- small,
 *    moderate, large, unclear. It is not a breach of the paragraph above: the
 *    value the coach gets is "a large plate", never "620 kcal" and never
 *    "2 servings". `quantity` and `unit` stay NULL beside it, forever. Before
 *    migration 20260727220000 the analyzer already computed this band and buried
 *    it in `recognized` jsonb, which R5 forbids the evaluator to read: the
 *    signal was produced and thrown away on every WhatsApp photo.
 *
 *    `slot_key` IS written NULL, and that one is a decision, not a gap -- see
 *    "THE SLOT, FOR WHOEVER OWNS matchEvent" at the bottom of this header.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * The analysis itself. It lives in W5.2 (`_shared/keel/meal_analysis.ts` +
 * `analyze-meal-photo-v1`), which owns the day's commitment allowlist, the
 * anti-hallucination filter on `matched_commitment_id` and the two
 * measurement filters. This handler only calls it, AFTER the fact is on file,
 * and appends the one sentence it returns (`student_message`). Every failure
 * mode of that call — missing secret, HTTP error, timeout, exception — degrades
 * to "no verdict", never to "no fact": a stored photo with no reading beats a
 * lost photo. The seam is the `analyze_meal_photo` port, so a test can drive
 * both branches without a model.
 *
 * THE SLOT, FOR WHOEVER OWNS `matchEvent`
 * ---------------------------------------
 * VERIFIED STATE of `protocol_events.slot_key` on the two photo paths:
 *
 *   - WEB (`meal-photo-upload-v1`): filled from the slot the student tapped the
 *     camera on. `TodayPage.tsx` sends `pendingPhoto.slotKey`, the function
 *     validates it with `parseSlotKey` (R7, throws on an unknown token) and
 *     writes it on the row. It is the student's statement, never a clock
 *     reading.
 *   - WHATSAPP (this file): NULL, always. An inbound photo message carries no
 *     slot, and deriving one from the wall clock ("19:10 therefore dinner")
 *     would be an inference dressed as a fact -- what the schema refuses
 *     everywhere else. `unknown` is first-class; a guessed slot is not.
 *
 * The consequence, stated for the agent fixing the slot-aliasing defect
 * (Q6_NUTRITION_LAYER.md B2 -- `evaluator.ts::matchEvent` never compares
 * `event.slotKey` to `commitment.slotKey`, so an egg at breakfast makes
 * "protein at dinner" met + off_window): a slot filter added to `matchEvent`
 * MUST treat `event.slotKey === null` as "contradicts no slot", not as "matches
 * no slot". Filtering null slots out would make every WhatsApp photo -- the
 * primary gesture of the product -- unmatchable overnight, trading a false
 * `met` for a total, silent loss of credit. `timingFor` already takes exactly
 * that posture (a match whose events carry no slot returns `unknown`, never
 * `off_window`); the match filter has to agree with it.
 */

import { getEffectiveTierForUser } from "../_shared/billing-tier.ts";
import {
  fetchWhatsAppMedia,
  type WhatsAppMediaFetchResult,
} from "../_shared/whatsapp_graph.ts";
import { resolveResponseLocale } from "../_shared/keel/locale.ts";
import { createProtocolEventWrite } from "../sophia-brain/tools/always_on/log_protocol_event/db.ts";
import type {
  ProtocolEventWrite,
} from "../sophia-brain/tools/always_on/log_protocol_event/contract.ts";
import type { WhatsAppInboundMedia } from "./wa_parse.ts";
import { sendWhatsAppTextTracked } from "./wa_whatsapp_api.ts";

// ---------------------------------------------------------------------------
// Tokens (R1: ASCII snake_case, compared by code, never translated)
// ---------------------------------------------------------------------------

export const MEAL_PHOTO_BUCKET = "meal-photos";
export const MEAL_PHOTO_PURPOSE = "keel_meal_photo_ack";
export const MEAL_PHOTO_RATE_LIMIT_PURPOSE = "keel_meal_photo_rate_limited";
export const MEAL_PHOTO_RATE_LIMIT_KEY_PREFIX = "keel_meal_photo";
/** SCHEMA.md evidence_weight ladder: photo 1.0 / detailed text 0.8 / thumbs-up 0.4. */
export const MEAL_PHOTO_EVIDENCE_WEIGHT = 1.0;

/**
 * Per-user windows. A burst window (accidental multi-send, a hostile loop) and
 * a daily cap (the cost ceiling). Both are cheap compared to one vision call.
 */
export const MEAL_PHOTO_RATE_WINDOWS: ReadonlyArray<
  { limit: number; window_seconds: number }
> = [
  { limit: 6, window_seconds: 600 },
  { limit: 40, window_seconds: 86_400 },
];

/** Tiers whose plan includes WhatsApp coaching. Recopied from index.ts. */
const PHOTO_ALLOWED_TIERS = new Set(["alliance", "architecte"]);

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

// ---------------------------------------------------------------------------
// Ports — every side effect is injectable, so the whole sequence is provable
// without a database, a bucket, or Meta.
// ---------------------------------------------------------------------------

export type MealPhotoRateDecision = {
  allowed: boolean;
  retry_after_seconds: number;
};

export type MealPhotoUploadResult =
  | { ok: true; path: string }
  | { ok: false; error: unknown };

export type MealPhotoStoragePort = {
  upload(input: {
    bucket: string;
    path: string;
    bytes: Uint8Array;
    content_type: string;
  }): Promise<MealPhotoUploadResult>;
  /** Read-back: the object must be listable before any row claims it exists. */
  exists(input: { bucket: string; path: string }): Promise<boolean>;
};

/**
 * W5.2's seam. Returns the student-facing sentence ALREADY validated by
 * `_shared/keel/meal_analysis.ts::renderMealPhotoAck` (no percentage, no
 * calorie, no evaluator status word). Returning null means "no verdict"; the
 * acknowledgement then says nothing about the content of the photo.
 */
export type MealPhotoAnalysisPort = (input: {
  user_id: string;
  protocol_event_id: string;
  media_path: string;
  local_date: string;
  bytes: Uint8Array;
  mime_type: string;
  caption: string | null;
}) => Promise<string | null>;

export type MealPhotoPorts = {
  check_rate_limit(input: {
    key: string;
    window_seconds: number;
    limit: number;
  }): Promise<MealPhotoRateDecision>;
  resolve_tier(user_id: string): Promise<string>;
  resolve_timezone(user_id: string): Promise<string>;
  fetch_media(media_id: string): Promise<WhatsAppMediaFetchResult>;
  storage: MealPhotoStoragePort;
  write_protocol_event: ProtocolEventWrite;
  send_reply(input: {
    body: string;
    purpose: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  analyze_meal_photo: MealPhotoAnalysisPort;
  now(): Date;
};

export type MealPhotoHandlerArgs = {
  admin: any;
  user_id: string;
  from_e164: string;
  request_id: string;
  wa_message_id: string;
  media: WhatsAppInboundMedia;
  /** `profiles.trial_end`, straight from the row index.ts already loaded. */
  trial_end: string | null;
  ports?: Partial<MealPhotoPorts>;
};

// ---------------------------------------------------------------------------
// Pure helpers (tested directly)
// ---------------------------------------------------------------------------

function logPhoto(tag: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag, ...fields }));
}

/** Chunked so a multi-megabyte photo does not blow the argument stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
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

/**
 * The tier gate, verbatim from `index.ts`: an active trial passes, otherwise the
 * effective tier must include WhatsApp coaching.
 * Kept as a named pure function so a test can assert the predicate itself, and
 * so a future change to the paywall has one obvious sibling to update.
 */
export function gateAllowsPhoto(input: {
  trial_end: string | null;
  tier: string | null;
  now: Date;
}): boolean {
  const raw = String(input.trial_end ?? "").trim();
  const ts = raw ? new Date(raw).getTime() : Number.NaN;
  if (Number.isFinite(ts) && input.now.getTime() < ts) return true;
  return PHOTO_ALLOWED_TIERS.has(String(input.tier ?? "").trim());
}

/** YYYY-MM-DD in the student's plan timezone. Same technique as
 * `provision-day-v1/provisioning.ts::localDateInTimezone`; R7 — an unknown zone
 * throws rather than silently resolving to UTC and filing the fact on the
 * wrong day. */
export function localDateInZone(timezone: string, now: Date): string {
  const zone = String(timezone ?? "").trim();
  if (!zone) {
    throw new Error("[keel/meal_photo] empty timezone (R7: fail loudly)");
  }
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
      `[keel/meal_photo] unknown timezone ${JSON.stringify(zone)}`,
      { cause: error },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(formatted)) {
    throw new Error(
      `[keel/meal_photo] unresolvable local date for ${JSON.stringify(zone)}`,
    );
  }
  return formatted;
}

export function extensionForMime(mimeType: string): string {
  return MIME_EXTENSIONS[String(mimeType ?? "").toLowerCase().trim()] ?? "bin";
}

/**
 * Object key. TWO invariants, both load-bearing:
 *  - it STARTS with the owner's auth user id — the RGPD export bundles
 *    `<user_id>/` and the purge deletes `<user_id>/`; a key that does not start
 *    with it survives account deletion (20260727130000 says so explicitly);
 *  - it is a deterministic, injective function of the wamid, so a re-delivered
 *    webhook overwrites the same object instead of littering the bucket. The
 *    wamid is base64url-re-encoded because a raw wamid carries `.`, `+`, `/`
 *    and `=`; sanitizing by substitution would be deterministic but NOT
 *    injective, and two distinct messages could collide onto one key.
 */
export function mealPhotoObjectPath(input: {
  user_id: string;
  local_date: string;
  wa_message_id: string;
  mime_type: string;
}): string {
  const userId = String(input.user_id ?? "").trim();
  if (!userId) throw new Error("[keel/meal_photo] empty user_id for object path");
  const wamid = String(input.wa_message_id ?? "").trim();
  if (!wamid) throw new Error("[keel/meal_photo] empty wa_message_id for object path");
  const encoded = btoa(wamid)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${userId}/${input.local_date}/${encoded}.${extensionForMime(input.mime_type)}`;
}

// ---------------------------------------------------------------------------
// Student-facing copy. Content, not tokens (R1 does not apply). The locale comes
// from `resolveResponseLocale` — the single point of truth (R3); during the
// pilot it returns en-US for everyone.
// ---------------------------------------------------------------------------

const COPY: Record<string, { saved: string; rate_limited: string }> = {
  en: {
    saved: "Photo saved.",
    rate_limited:
      "That is a lot of photos in a short time — I have saved what I could. Send the next one a bit later.",
  },
  fr: {
    saved: "Photo enregistrée.",
    rate_limited:
      "Ça fait beaucoup de photos d'un coup — j'ai gardé ce que j'ai pu. Envoie la suivante un peu plus tard.",
  },
};

function copyFor(locale: string): { saved: string; rate_limited: string } {
  const prefix = String(locale ?? "").slice(0, 2).toLowerCase();
  return COPY[prefix] ?? COPY.en;
}

// ---------------------------------------------------------------------------
// Default ports (the only place that knows Supabase / Meta exist)
// ---------------------------------------------------------------------------

function defaultPorts(args: MealPhotoHandlerArgs): MealPhotoPorts {
  const admin = args.admin;
  return {
    async check_rate_limit(input) {
      const { data, error } = await admin.rpc("enforce_rate_limit", {
        p_key: input.key,
        p_window_seconds: input.window_seconds,
        p_limit: input.limit,
      });
      if (error) {
        // Fail OPEN, loudly — same posture as `_shared/rate-limit.ts`. A limiter
        // outage must not eat a student's meal photo.
        logPhoto("keel_meal_photo_rate_limit_backend_error", {
          request_id: args.request_id,
          key: input.key,
          error: String((error as any)?.message ?? error),
        });
        return { allowed: true, retry_after_seconds: 0 };
      }
      const row = Array.isArray(data) ? data[0] : data;
      return {
        allowed: row?.allowed !== false,
        retry_after_seconds: Number(row?.retry_after_seconds ?? 0),
      };
    },

    async resolve_tier(userId) {
      return String(await getEffectiveTierForUser(admin, userId));
    },

    async resolve_timezone(userId) {
      // The plan's timezone is the one the whole KEEL day is cut on
      // (provisioning, evaluation, rollover). Falling back to the profile — and
      // then to UTC — keeps a photo from being lost by a student who has no
      // published plan yet; the day boundary is the only thing at stake and the
      // fact stays correctable.
      const { data: planRows } = await admin
        .from("plan_versions")
        .select("timezone,published_at")
        .eq("student_id", userId)
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(1);
      const planTz = String(planRows?.[0]?.timezone ?? "").trim();
      if (planTz) return planTz;
      const { data: profile } = await admin
        .from("profiles")
        .select("timezone")
        .eq("id", userId)
        .maybeSingle();
      return String(profile?.timezone ?? "").trim() || "UTC";
    },

    fetch_media(mediaId) {
      return fetchWhatsAppMedia(mediaId, { expectedMimePrefix: "image/" });
    },

    storage: {
      async upload(input) {
        const { data, error } = await admin.storage
          .from(input.bucket)
          .upload(input.path, input.bytes, {
            contentType: input.content_type,
            upsert: true,
          });
        if (error) return { ok: false, error };
        const path = String((data as any)?.path ?? "").trim() || input.path;
        return { ok: true, path };
      },
      async exists(input) {
        const slash = input.path.lastIndexOf("/");
        const dir = slash >= 0 ? input.path.slice(0, slash) : "";
        const name = slash >= 0 ? input.path.slice(slash + 1) : input.path;
        const { data, error } = await admin.storage
          .from(input.bucket)
          .list(dir, { search: name, limit: 100 });
        if (error) return false;
        return (data ?? []).some((o: any) => String(o?.name ?? "") === name);
      },
    },

    write_protocol_event: createProtocolEventWrite({ supabase: admin }),

    /**
     * W5.2, called with the bytes already in hand — `analyze-meal-photo-v1`
     * accepts inline media precisely so this path skips a bucket round-trip.
     * Returns null on ANY failure: the fact is already committed and the
     * acknowledgement must degrade to "saved", never to silence.
     */
    async analyze_meal_photo(input) {
      const secret = internalSecret();
      if (!secret) {
        logPhoto("keel_meal_photo_analysis_skipped", {
          request_id: args.request_id,
          protocol_event_id: input.protocol_event_id,
          reason: "internal_secret_missing",
        });
        return null;
      }
      const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
      const res = await fetch(
        `${functionsBaseUrl()}/functions/v1/analyze-meal-photo-v1`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Secret": secret,
            "x-request-id": args.request_id,
            ...(anonKey
              ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
              : {}),
          },
          body: JSON.stringify({
            protocol_event_id: input.protocol_event_id,
            base64: bytesToBase64(input.bytes),
            mime_type: input.mime_type,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        logPhoto("keel_meal_photo_analysis_http_error", {
          request_id: args.request_id,
          protocol_event_id: input.protocol_event_id,
          http_status: res.status,
        });
        return null;
      }
      // What the analysis credited on the fact, for the trace. NOT recomputed
      // here and NOT reformatted into the reply: the sentence below already
      // names it, because `renderMealPhotoAck` is given the same credit object
      // that produced the column. Logging it is how this surface can be audited
      // without re-reading protocol_events.
      logPhoto("keel_meal_photo_credit", {
        request_id: args.request_id,
        protocol_event_id: input.protocol_event_id,
        food_group_ref: (data as any)?.food_group_ref ?? null,
        credit_reason: (data as any)?.food_group_credit?.reason ?? null,
        binding: (data as any)?.binding ?? null,
        // The ordinal magnitude the analysis wrote on the COLUMN (migration
        // 20260727220000). Logged here, next to the identity credit, because
        // these two are now the entirety of what a WhatsApp photo puts in front
        // of the evaluator -- and neither of them is a number. Read from the
        // analysis RESPONSE, which itself reads the row back: this trace can
        // therefore be audited without re-querying protocol_events.
        portion_band: (data as any)?.portion_band ?? null,
      });
      // Only the sentence W5.2 rendered. Nothing here reformats a verdict, and
      // an `already_analyzed` replay carries no `student_message` — which
      // correctly produces a plain "saved" acknowledgement rather than a
      // second, differently-worded reading of the same photo.
      const message = String((data as any)?.student_message ?? "").trim();
      return message === "" ? null : message;
    },

    async send_reply(input) {
      const sendResp = await sendWhatsAppTextTracked({
        admin,
        requestId: args.request_id,
        userId: args.user_id,
        toE164: args.from_e164,
        body: input.body,
        purpose: input.purpose,
        isProactive: false,
        replyToWaMessageId: args.wa_message_id,
        metadata: input.metadata ?? {},
      });
      await admin.from("chat_messages").insert({
        user_id: args.user_id,
        scope: "whatsapp",
        role: "assistant",
        content: input.body,
        agent_used: "companion",
        metadata: {
          channel: "whatsapp",
          wa_outbound_message_id: sendResp?.messages?.[0]?.id ?? null,
          outbound_tracking_id: sendResp?.outbound_tracking_id ?? null,
          is_proactive: false,
          purpose: input.purpose,
          ...(input.metadata ?? {}),
        },
      });
    },

    now: () => new Date(),
  };
}

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

/**
 * @returns `true` when the turn is consumed (the caller must `continue`),
 *          `false` when it declined — the caller's existing media fallback then
 *          answers, and NOTHING has been acknowledged.
 *
 * NEVER THROWS. The webhook's per-message `catch` logs and moves on, which would
 * skip the fallback and leave the student with total silence. An unexpected
 * exception here must degrade to "declined", not to "no answer at all".
 */
export async function handleInboundMealPhoto(
  args: MealPhotoHandlerArgs,
): Promise<boolean> {
  try {
    return await runInboundMealPhoto(args);
  } catch (error) {
    logPhoto("keel_meal_photo_unhandled_error", {
      request_id: args.request_id,
      user_id: args.user_id,
      wa_message_id: args.wa_message_id,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function runInboundMealPhoto(
  args: MealPhotoHandlerArgs,
): Promise<boolean> {
  const media = args.media;
  // Only photos. Voice notes, videos, documents and stickers keep their
  // existing fallback; widening this is a product decision, not a refactor.
  if (!media || media.media_type !== "image") return false;
  const mediaId = String(media.id ?? "").trim();
  if (!mediaId) return false;

  const base = defaultPorts(args);
  const ports: MealPhotoPorts = { ...base, ...(args.ports ?? {}) };
  const now = ports.now();
  const locale = resolveResponseLocale({});
  const copy = copyFor(locale);
  const logBase = {
    request_id: args.request_id,
    user_id: args.user_id,
    wa_message_id: args.wa_message_id,
  };

  // --- 1. Rate limit ------------------------------------------------------
  // Before the gate lookup and before any byte moves: this is the cheap wall.
  for (const w of MEAL_PHOTO_RATE_WINDOWS) {
    const decision = await ports.check_rate_limit({
      key: `${MEAL_PHOTO_RATE_LIMIT_KEY_PREFIX}:${args.user_id}:${w.window_seconds}`,
      window_seconds: w.window_seconds,
      limit: w.limit,
    });
    if (!decision.allowed) {
      logPhoto("keel_meal_photo_rate_limited", {
        ...logBase,
        window_seconds: w.window_seconds,
        retry_after_seconds: decision.retry_after_seconds,
      });
      await ports.send_reply({
        body: copy.rate_limited,
        purpose: MEAL_PHOTO_RATE_LIMIT_PURPOSE,
        metadata: { window_seconds: w.window_seconds },
      });
      // Consumed: the student got an answer, and the fallback must not pile a
      // second message on top of it.
      return true;
    }
  }

  // --- 2. Tier gate, recopied (see the header) ----------------------------
  let tier = "none";
  try {
    tier = await ports.resolve_tier(args.user_id);
  } catch (error) {
    // Unknown entitlement is not an entitlement. Fail CLOSED here — the
    // opposite posture from the rate limiter, because what is at stake is a
    // paid capability, not a cost ceiling.
    logPhoto("keel_meal_photo_tier_lookup_failed", {
      ...logBase,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
  if (!gateAllowsPhoto({ trial_end: args.trial_end, tier, now })) {
    logPhoto("keel_meal_photo_gate_denied", { ...logBase, tier });
    return false;
  }

  // --- 3. Download, in this invoke ---------------------------------------
  const fetched = await ports.fetch_media(mediaId);
  if (!fetched.ok) {
    logPhoto("keel_meal_photo_download_failed", {
      ...logBase,
      stage: fetched.stage,
      http_status: fetched.http_status,
      retryable: fetched.retryable,
    });
    return false;
  }

  // --- 4. Timezone + object key ------------------------------------------
  let localDate: string;
  let objectPath: string;
  try {
    const timezone = await ports.resolve_timezone(args.user_id);
    localDate = localDateInZone(timezone, now);
    objectPath = mealPhotoObjectPath({
      user_id: args.user_id,
      local_date: localDate,
      wa_message_id: args.wa_message_id,
      mime_type: fetched.mime_type,
    });
  } catch (error) {
    logPhoto("keel_meal_photo_path_failed", {
      ...logBase,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }

  // --- 5. Upload, then READ BACK -----------------------------------------
  const uploaded = await ports.storage.upload({
    bucket: MEAL_PHOTO_BUCKET,
    path: objectPath,
    bytes: fetched.bytes,
    content_type: fetched.mime_type,
  });
  if (!uploaded.ok) {
    logPhoto("keel_meal_photo_upload_failed", {
      ...logBase,
      path: objectPath,
      error: String((uploaded.error as any)?.message ?? uploaded.error),
    });
    return false;
  }
  const storedPath = uploaded.path;
  const present = await ports.storage.exists({
    bucket: MEAL_PHOTO_BUCKET,
    path: storedPath,
  });
  if (!present) {
    // The upload said "fine" and the bucket does not have it. A media_path
    // pointing at nothing is worse than no row: the coach's screen would show
    // an evidence link that 404s.
    logPhoto("keel_meal_photo_upload_not_readable", {
      ...logBase,
      path: storedPath,
    });
    return false;
  }

  // --- 6. The fact, inserted and READ BACK --------------------------------
  let row;
  let outcome: "inserted" | "already_logged";
  try {
    const written = await ports.write_protocol_event({
      user_id: args.user_id,
      occurred_at: now.toISOString(),
      local_date: localDate,
      // CONTRACT non-input #4 + "unknown is first-class": no slot guessed from
      // the wall clock, no quantity extracted from pixels.
      slot_key: null,
      source: "photo",
      media_path: storedPath,
      quantity: null,
      unit: null,
      substance_ref: null,
      // Null at INSERT because the image has not been read yet -- not a policy.
      // `analyze-meal-photo-v1` (step 7) writes the group when exactly one
      // detected group is on the day's plan. See header point 4.
      food_group_ref: null,
      // No explicit binding on this surface: an inbound WhatsApp photo carries
      // no tap on a plan line. The web path has one (`commitment_id` in the
      // upload body, verified against the student's published plan); here the
      // only binding that can exist is the analyzer's, written into
      // `recognized` at step 7 and never claimed before it is on the row.
      commitment_id: null,
      student_note: media.caption,
      // R2: the row states its own language. `resolveResponseLocale` is the
      // single point where that decision lives (pilot: en-US for everyone).
      content_locale: locale,
      evidence_weight: MEAL_PHOTO_EVIDENCE_WEIGHT,
      // Schema-level idempotence: partial unique (user_id, source_message_id).
      // A re-delivered webhook reads the existing row instead of duplicating it.
      source_message_id: args.wa_message_id,
    });
    row = written.row;
    outcome = written.outcome;
  } catch (error) {
    logPhoto("keel_meal_photo_event_write_failed", {
      ...logBase,
      path: storedPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }

  const protocolEventId = String(row?.id ?? "").trim();
  if (!protocolEventId || row.user_id !== args.user_id) {
    // Write-through: no readable, correctly-scoped row, no acknowledgement.
    logPhoto("keel_meal_photo_readback_mismatch", {
      ...logBase,
      path: storedPath,
      has_id: Boolean(protocolEventId),
    });
    return false;
  }

  logPhoto("keel_meal_photo_committed", {
    ...logBase,
    protocol_event_id: protocolEventId,
    // Everything below is the DATABASE's version of the fact, not the request's.
    local_date: row.local_date,
    outcome,
    transport: fetched.transport,
    byte_length: fetched.byte_length,
  });

  // --- 7. Analysis (W5.2) -------------------------------------------------
  // AFTER the commit, never before, and never able to undo it. `verdict` stays
  // null on every failure path, and a null verdict means the reply claims
  // nothing about the content of the photo — no calories, no "looks compliant",
  // no commitment match. The fact is stored and re-analyzable (W5.2 exposes
  // `force`), which is the part that must not be lost.
  let verdict: string | null = null;
  {
    try {
      verdict = await ports.analyze_meal_photo({
        user_id: args.user_id,
        protocol_event_id: protocolEventId,
        media_path: storedPath,
        local_date: row.local_date,
        bytes: fetched.bytes,
        mime_type: fetched.mime_type,
        caption: media.caption,
      });
    } catch (error) {
      // A failed analysis never un-commits the fact, and never blocks the
      // acknowledgement of what IS in the database.
      logPhoto("keel_meal_photo_analysis_failed", {
        ...logBase,
        protocol_event_id: protocolEventId,
        error: error instanceof Error ? error.message : String(error),
      });
      verdict = null;
    }
  }

  const body = [copy.saved, String(verdict ?? "").trim()]
    .filter((s) => s !== "")
    .join("\n\n");
  await ports.send_reply({
    body,
    purpose: MEAL_PHOTO_PURPOSE,
    metadata: {
      protocol_event_id: protocolEventId,
      local_date: row.local_date,
      media_path: storedPath,
      outcome,
      analyzed: verdict != null,
    },
  });

  return true;
}
