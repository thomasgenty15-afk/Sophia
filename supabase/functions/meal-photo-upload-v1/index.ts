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
import { localePackKey, resolveArtifactLocale } from "../_shared/keel/locale.ts";
import {
  renderPhotoDuplicate,
  renderPhotoSavedUnanalysed,
} from "../_shared/keel/meal_analysis.ts";
import { parseSlotKey } from "../_shared/keel/tokens.ts";
import {
  inferSlotFromLocalHour,
  SLOT_INFERRED_KEY,
} from "../_shared/keel/photo_slot_inference.ts";
import { CHAT_SCOPE, deliverChatMessage } from "../_shared/chat/delivery.ts";
// FF-062 R11 — « modifier » le chiffre d'énergie d'une photo.
import { claimInbound } from "../_shared/chat/inbound_pipeline.ts";
import { openMealPrecisionFlow } from "../_shared/keel/meal_precision_flow.ts";
import {
  blocksDurableWrite,
  readLastTurnSafetyBand,
} from "../_shared/keel/safety_band_io.ts";
import { evaluateRestrictionForStudent } from "../_shared/keel/restriction_runtime.ts";
import { openMealPrecisionFlowState } from "../_shared/keel/meal_precision_flow_state.ts";
import { protocolEventComponentKey } from "../_shared/keel/protocol_event_key.ts";
import { studentBindingIn } from "../_shared/keel/meal_analysis.ts";
import { sniffImageMime } from "../_shared/keel/image_sniff.ts";
import {
  attachPhotoToInvitedFact,
  decidePhotoAttachment,
  findInvitedOffPlanFact,
  PHOTO_INVITATION_ATTACH_WINDOW_MINUTES,
} from "../_shared/keel/photo_invitation_attach.ts";

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
 *   4. resolve the local date SERVER-SIDE from the student's timezone (their
 *      published plan when one exists, else `profiles.timezone`). A client-
 *      supplied date is a client-supplied fact: it would let a student file
 *      today's plate on a day the evaluator has not closed yet. NOTHING here
 *      requires a published plan any more -- see the block at step 4.
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

/**
 * L'ACTION DE LECTURE — rendre affichables des photos déjà envoyées.
 *
 * ── POURQUOI ELLE VIT ICI ET PAS DANS UNE FONCTION À ELLE ─────────────────
 * L'en-tête de ce fichier énonce déjà l'arbitrage: il n'existe AUCUNE policy
 * sur `storage.objects`, donc tout accès au bucket est une fonction edge en
 * service_role qui a déjà vérifié la propriété. Ça vaut dans les deux sens —
 * écrire ET lire. Une seconde fonction aurait dupliqué l'authentification, la
 * constante de bucket et la règle de propriété; `coach-recipe-image-v1` a
 * tranché la même question de la même façon (upload + sign réunis).
 *
 * LE DÉFAUT QUE ÇA CORRIGE: `meal-photo-upload-v1` écrivait déjà
 * `metadata.media_ref` sur la ligne de conversation, et personne ne pouvait le
 * relire. L'élève envoyait son assiette et voyait « [photo] » en texte — le
 * geste central du produit ne laissait aucune trace de ce qu'il avait envoyé.
 *
 * LA PROPRIÉTÉ EST LUE, JAMAIS DÉDUITE. Le chemin commence par l'id du
 * propriétaire (invariant RGPD d'`objectPath`), et il serait tentant de s'en
 * contenter: un préfixe est une AFFIRMATION du client sur la forme d'une
 * chaîne, pas une preuve. La liste signable vient de `protocol_events` pour CE
 * user_id. Un chemin absent est OMIS — pas de 403, parce que « ce chemin
 * existe mais n'est pas à toi » est déjà une information sur un autre élève.
 */
const SIGN_SCHEMA = z.object({
  action: z.literal("sign"),
  paths: z.array(z.string().trim().min(1).max(300)).min(1).max(100),
});

/**
 * Courte, et ré-émise à chaque affichage. La stocker la ferait expirer dans le
 * stockage; l'allonger la ferait survivre à une suppression de compte —
 * `purge-deleted-accounts` efface l'objet, pas les liens déjà distribués.
 */
const SIGNED_URL_TTL_SECONDS = 3600;

/** Signer ne coûte ni stockage ni appel modèle: bien plus large que l'upload. */
const SIGN_RATE_WINDOWS = [
  { limit: 120, windowSeconds: 600 },
  { limit: 1000, windowSeconds: 86_400 },
];

const UPLOAD_SCHEMA = z.object({
  /**
   * Absent sur le chemin historique, et c'est voulu: le client d'upload n'a
   * jamais envoyé d'action, et lui en imposer une pour ajouter une LECTURE
   * casserait l'écriture. L'absence vaut « upload ».
   */
  action: z.literal("upload").optional(),
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

// L'ORDRE DE L'UNION EST LE CONTRAT: `sign` d'abord, parce qu'il est
// discriminé par une valeur littérale et que le schéma d'upload accepterait
// sinon une charge de signature en la trouvant simplement incomplète — donc
// avec un message d'erreur qui parlerait de `mime_type` manquant.
const REQUEST_SCHEMA = z.union([SIGN_SCHEMA, UPLOAD_SCHEMA]);

/**
 * L'URL signée, PRIVÉE DE SON ORIGINE — et c'est un correctif, pas un détail.
 *
 * `createSignedUrl` compose l'URL à partir du `SUPABASE_URL` que la FONCTION
 * voit. En local, c'est `http://kong:8000`: le nom d'hôte interne du réseau
 * Docker. Mesuré au navigateur — la signature réussissait, l'URL revenait, et
 * l'image ne chargeait jamais (`dns error: failed to lookup address
 * information: kong`). Le défaut est silencieux côté serveur: rien n'échoue là
 * où on regarde.
 *
 * Plutôt que d'introduire une variable « origine publique » de plus (qu'un
 * environnement futur oubliera de poser), on rend le chemin RELATIF. Le seul
 * composant qui connaisse à coup sûr son origine publique est celui qui a fait
 * la requête: le navigateur. Il recolle, et ça vaut dans tous les
 * environnements sans configuration.
 */
function relativeSignedUrl(signedUrl: string): string {
  try {
    const u = new URL(signedUrl);
    return `${u.pathname}${u.search}`;
  } catch {
    // Déjà relative (ou illisible): on rend tel quel plutôt que de perdre le
    // jeton. Le client ne joindra rien de plus qu'une chaîne déjà jointe.
    return signedUrl;
  }
}

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
 * Le contrôle par octets magiques a DÉMÉNAGÉ dans
 * `_shared/keel/image_sniff.ts`, et il est ré-exporté ici pour que les
 * appelants historiques (et les tests) ne bougent pas.
 *
 * Raison du déplacement, unique et suffisante: la bibliothèque de recettes du
 * coach a besoin du même contrôle, et une fonction edge ne peut importer que
 * `_shared`. Deux copies auraient divergé en silence.
 */
export { sniffImageMime };

/**
 * YYYY-MM-DD in the plan's timezone. Same technique as
 * `provision-day-v1/provisioning.ts::localDateInTimezone` and
 * `handlers_meal_photo.ts::localDateInZone`; R7 -- an unknown zone throws rather
 * than silently resolving to UTC and filing the fact on the wrong day.
 */
/**
 * L'HEURE PLEINE LOCALE, du même fuseau que la date.
 *
 * ⚠️ MÊME FUSEAU, MÊME INSTANT, MÊME FONCTION D'ORIGINE. Deux résolutions
 * séparées feraient un jour ranger une photo au dîner d'un jour dont la date
 * dit qu'il est déjà demain. `hour12: false` est explicite: sans lui, `en-CA`
 * peut rendre « 12 » pour minuit selon la plateforme.
 */
function localHourInZone(timezone: string, now: Date): number | null {
  const zone = String(timezone ?? "").trim();
  if (!zone) return null;
  try {
    const raw = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      hour12: false,
    }).format(now);
    const hour = Number(raw.slice(0, 2));
    return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
  } catch {
    return null;
  }
}

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
  // `analyzed_at` — AJOUTÉE POUR FF-025, et son absence était un défaut mesuré:
  // le rattachement demande « l'analyse a-t-elle tourné ET rendu un repas ? »,
  // il lisait `analyzed_at` sur une ligne qui ne la portait pas, et rendait
  // donc TOUJOURS « pas encore analysée ». Le rattachement ne s'est jamais
  // produit en run réel: 1 → 2 lignes sur le cas nominal, le double comptage
  // que R4 interdit, obtenu par une colonne absente d'un SELECT.
  "analyzed_at, disqualified_reason, media_sha256, source_message_id";

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

    // ---- 1bis. LA LECTURE — rendre affichables des photos déjà envoyées ----
    // Avant tout le reste: elle ne partage rien avec l'écriture au-delà de
    // l'identité, et elle ne doit surtout pas consommer le plafond d'upload
    // (afficher une conversation demande un lot d'URLs, envoyer une photo est
    // un geste rare et coûteux — deux compteurs, deux natures).
    if ("action" in body && body.action === "sign") {
      const signLimited = await enforceRateLimit(req, requestId, {
        key: `meal-photo-sign:${userId}`,
        windows: SIGN_RATE_WINDOWS,
      });
      if (signLimited) return signLimited;

      const admin = adminClient();
      // Dédupliqué: une conversation peut porter deux fois le même chemin
      // (rejeu, doublon exact accusé), et signer deux fois coûte deux fois.
      const wanted = [...new Set(body.paths)];
      const owned = await admin
        .from("protocol_events")
        .select("media_path")
        .eq("user_id", userId)
        .in("media_path", wanted);
      if (owned.error) {
        throw new Error(`protocol_events read failed: ${owned.error.message}`);
      }
      const allowed = new Set(
        ((owned.data ?? []) as Array<{ media_path: string | null }>)
          .map((r) => String(r.media_path ?? "").trim())
          .filter(Boolean),
      );

      const urls: Record<string, string> = {};
      for (const path of wanted) {
        if (!allowed.has(path)) continue;
        const signed = await admin.storage
          .from(MEAL_PHOTO_BUCKET)
          .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
        if (!signed.error && signed.data?.signedUrl) {
          urls[path] = relativeSignedUrl(signed.data.signedUrl);
        }
      }
      return jsonResponse(req, { ok: true, urls, request_id: requestId });
    }

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

    // ---- 4. the day, resolved in the STUDENT's timezone --------------------
    //
    // ── LE REFUS QUI ÉTAIT ICI, ET POURQUOI IL N'Y EST PLUS (2026-08-05) ─────
    // Cette fonction exigeait un `plan_versions` PUBLIÉ et répondait sinon un
    // 409 doublé, dans la bulle, de: « your coach hasn't published your plan,
    // so there's nothing for it to count toward ».
    //
    // C'est le modèle produit à l'envers (docs/keel/MODEL.md): LE COACH NE
    // PUBLIE PAS DE PLAN PAR ÉLÈVE. La condition attendue n'arrive donc jamais,
    // et la phrase demandait à l'élève d'attendre un geste que personne ne fera.
    // Autrement dit: le geste le plus coûteux du produit était refusé à tout
    // élève du modèle réel, avec pour motif l'absence d'un artefact hors modèle.
    //
    // Le plan n'était de toute façon requis ici que pour DEUX choses:
    //   - un fuseau, pour classer la photo au bon jour. Il y en a un autre, et
    //     il appartient à l'élève: `profiles.timezone` (écrit à l'inscription);
    //   - une ligne à créditer. Il n'y en a pas, et il n'y a plus à en chercher:
    //     une photo n'est comparée à rien (voir `analyze-meal-photo-v1`).
    //
    // R7 tient toujours sur le fuseau: on ne se replie JAMAIS sur une date
    // fournie par le client (l'horloge du navigateur n'est pas un fait), et un
    // fuseau illisible échoue bruyamment plutôt que de ranger un dîner la veille.
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
    // R2 — la lecture du profil est devenue INCONDITIONNELLE, et c'est un coût
    // assumé (un aller-retour de plus quand le plan porte déjà son fuseau).
    // Elle ne servait qu'au repli de fuseau; il lui faut maintenant aussi la
    // locale, parce que la ligne écrite plus bas porte de la prose
    // (`student_note`, les mots de l'élève) et que R2 interdit une colonne dont
    // la langue devrait être devinée après coup. La valeur précédente était
    // `resolveResponseLocale({})`, c'est-à-dire « en-US » pour tout le monde:
    // une langue déclarée que personne n'avait déclarée.
    const profileRead = await admin
      .from("profiles")
      .select("timezone, locale")
      .eq("id", userId)
      .maybeSingle();
    if (profileRead.error) {
      throw new Error(`profiles read failed: ${profileRead.error.message}`);
    }
    const profileRow = profileRead.data as
      | { timezone?: unknown; locale?: unknown }
      | null;
    // `let` et non `const`: le repli UTC ci-dessous RÉASSIGNE cette variable.
    let timezone = String(planVersion?.timezone ?? "").trim() ||
      String(profileRow?.timezone ?? "").trim();
    const studentProfileLocale = String(profileRow?.locale ?? "").trim() || null;
    // ⚠️ UNE SEULE RÉSOLUTION POUR TOUT CE QUI PART DE CETTE FONCTION. Deux
    // résolutions séparées finissent par diverger, et la cicatrice a un nom
    // ici même: un bouton français sous un accusé anglais. `resolveArtifactLocale`
    // clampe sur les langues LIVRÉES, donc `localePackKey` ne peut pas jeter.
    const ackPack = localePackKey(resolveArtifactLocale({
      studentProfile: studentProfileLocale,
      tenantDefault: null,
    }));
    if (!timezone) {
      // Ni plan ni profil: on ne SAIT pas quel jour il est pour cet élève. UTC
      // est le seul repli honnête — c'est « on ne sait pas » et non « il vit à
      // Paris » — et il est TRACÉ, parce qu'un profil sans fuseau est un défaut
      // d'inscription à corriger, pas un état normal.
      console.warn(JSON.stringify({
        tag: "meal_photo_timezone_unknown",
        user_id: userId,
        detail: "no published plan and no profiles.timezone; filing the day in UTC",
      }));
      timezone = "UTC";
    }
    const localDate = localDateInZone(timezone, new Date());

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

    // ---- 5bis. LE CRÉNEAU QUAND L'APPELANT N'EN DÉCLARE PAS -------------
    //
    // ⚠️ LE CHAT ENVOIE TOUJOURS `slot_key: null` (`ChatPage.tsx`), donc TOUTE
    // photo de la bulle arrivait sans créneau: ni l'évaluateur, ni la synthèse
    // coach, ni `matchPlannedDish` (qui exige « le créneau concorde » pour un
    // verdict franc) ne pouvaient en faire quoi que ce soit. FF-018 §11 posait
    // la question et la laissait ouverte; elle est tranchée le 2026-09-01.
    //
    // ── ON DÉDUIT, ET ON LE DIT. C'est §3.3bis, pas une exception à la règle
    // de `TodayPage` (« un créneau ne se devine jamais à l'horloge »): ce que
    // cette règle interdit est la déduction SILENCIEUSE. La marque
    // `slot_inferred` voyage sur la ligne, l'accusé la prononce, et la porte de
    // correction est dans la même phrase.
    //
    // ── ET SEULEMENT QUAND L'APPELANT SE TAIT. Un `slot_key` fourni est un
    // fait de l'élève: rien ici ne le remplace, ni ne le « corrige ».
    let slotInferred = false;
    if (slotKey === null) {
      const localHour = localHourInZone(timezone, new Date());
      if (localHour !== null) {
        // Le rythme DÉCLARÉ l'emporte sur le repli horaire: quelqu'un qui a dit
        // dîner à 22 h n'a pas raté son dîner à 21 h. Une lecture en panne
        // retombe sur le repli plutôt que de perdre l'inférence — l'heure de
        // référence reste vraie pour la grande majorité des gens.
        let rhythm: unknown = null;
        try {
          const goals = await admin
            .from("student_goals")
            .select("practical_constraints")
            .eq("user_id", userId)
            .maybeSingle();
          if (!goals.error) {
            const pc = (goals.data as { practical_constraints?: unknown } | null)
              ?.practical_constraints as Record<string, unknown> | null;
            rhythm = pc?.eating_rhythm ?? null;
          }
        } catch (error) {
          console.warn(JSON.stringify({
            tag: "meal_photo_eating_rhythm_unreadable",
            user_id: userId,
            error: error instanceof Error ? error.message : String(error),
            effect: "l'inference retombe sur SLOT_PASSED_HOUR",
          }));
        }
        const inferred = inferSlotFromLocalHour(localHour, rhythm);
        if (inferred) {
          slotKey = inferred.slot;
          slotInferred = inferred.inferred;
          console.info(JSON.stringify({
            tag: "meal_photo_slot_inferred",
            user_id: userId,
            local_hour: localHour,
            slot_key: slotKey,
            from_declared_rhythm: rhythm !== null,
          }));
        }
        // `inferred === null` — avant le premier créneau de la journée — laisse
        // `slot_key: null`, exactement comme avant. Une photo à 7 h n'a aucun
        // créneau écoulé derrière elle, et lui en coller un serait la
        // déduction silencieuse qu'on vient de refuser.
      }
    }

    const commitmentId = body.commitment_id ?? null;
    if (commitmentId) {
      // The same principle the analyzer applies to the model applies to the
      // client: a commitment id that is not on THIS student's published plan is
      // rejected, because `recognized.commitment_id` is the evaluator's explicit
      // binding and would otherwise write a grade onto an arbitrary line.
      //
      // Sans plan publié il n'existe AUCUNE ligne à lier: l'id est forcément
      // faux, et il est refusé — ce qui reste un 400 et non un blocage de la
      // photo, puisque seul le mode 1:1 en envoie un.
      if (!planVersion) {
        return badRequest(
          req,
          requestId,
          "commitment_id was supplied but you have no published plan to bind it to",
        );
      }
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
            // LA BULLE DE L'ÉLÈVE, comme sur le chemin frais.
            //
            // ── LE DÉFAUT MESURÉ 3/3 LE 2026-08-05 ──────────────────────────
            // Cette branche livrait l'accusé SANS insérer la ligne `role:'user'`
            // que le chemin frais écrit. Pendant la session l'aperçu local
            // (`createObjectURL`) masquait le trou; après rechargement il ne
            // restait que « I already have that photo… » suspendu au-dessus de
            // rien. Un élève qui renvoie sa photo le fait presque toujours
            // parce qu'il n'a pas vu la première partir — lui répondre à propos
            // d'une image qu'il ne voit pas est la pire réponse possible.
            await admin.from("chat_messages").insert({
              user_id: userId,
              scope: CHAT_SCOPE,
              role: "user",
              content: String(body.student_note ?? "").trim() || "[photo]",
              metadata: {
                channel: "in_app",
                kind: "media",
                client_message_id: body.chat_client_message_id,
                // Le chemin DÉJÀ stocké, pas un nouvel upload: c'est la même
                // image, et la dédupliquer côté storage est justement l'objet
                // de cette branche.
                media_ref: {
                  path: priorPath,
                  content_type: sniffed,
                  size_bytes: bytes.length,
                },
                request_id: requestId,
                duplicate_of: String(priorRow.id ?? ""),
              },
            } as never);

            const res = await deliverChatMessage(admin, {
              userId,
              content: renderPhotoDuplicate(ackPack),
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
      // R2: every row carrying prose states its language. R3: this row is a
      // stored ARTEFACT, not a reply — it takes `resolveArtifactLocale`, never
      // `resolveResponseLocale`. Conflating the two is the collapse R3 forbids:
      // the thread's answer language and the language a student typed their
      // note in are not the same fact.
      content_locale: resolveArtifactLocale({
        studentProfile: studentProfileLocale,
        tenantDefault: null,
      }),
      evidence_weight: PHOTO_EVIDENCE_WEIGHT,
      // L'empreinte des octets. C'est elle que `protocol_events_media_dedup_idx`
      // contraint: à partir d'ici, deux envois du même fichier le même jour ne
      // peuvent plus produire deux faits, même s'ils arrivent en même temps.
      media_sha256: mediaSha256,
      source_message_id: sourceMessageId,
    };
    if (slotInferred) {
      // LA MARQUE, ÉCRITE AVEC LE SLOT ET JAMAIS APRÈS. Un créneau déduit qui
      // ne porte pas sa marque est indiscernable d'un créneau déclaré — pour
      // l'accusé, pour le coach, et pour quiconque relira la ligne dans six
      // mois.
      insertPayload.recognized = {
        ...(insertPayload.recognized as Record<string, unknown> | undefined ?? {}),
        [SLOT_INFERRED_KEY]: true,
      };
    }
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
        ...(insertPayload.recognized as Record<string, unknown> | undefined ?? {}),
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
    // `let`, et FF-025 en est la raison: quand la photo répond à une invitation,
    // la ligne qui SURVIT est celle du repas déclaré, pas celle-ci. Tout l'aval
    // (l'accusé, la métadonnée du message, le flow de correction) doit alors
    // désigner la survivante — sinon la correction « non c'était du poulet »
    // amenderait une ligne qui n'existe plus.
    let eventId = String(eventRow.id ?? "");
    if (!eventId) {
      throw new Error("protocol_events returned no readable id");
    }
    const photoRowId = eventId;

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

    // ---- 9bis. FF-025 R4 — LA PHOTO ENRICHIT LE FAIT, ELLE NE LE DOUBLE PAS -
    //
    // Quand cette photo répond à une invitation partie il y a quelques minutes
    // (« j'ai commandé une pizza » → « si tu as une photo, envoie-la »), elle
    // n'est pas un second repas: c'est la MÊME soirée, montrée au lieu d'être
    // décrite. Deux lignes fausseraient tous les comptes du coach, et
    // l'invitation deviendrait le mécanisme qui fabrique l'erreur.
    //
    // APRÈS l'analyse, jamais avant: une photo de MENU doit rester son propre
    // fait disqualifié. Rattachée d'abord, sa disqualification tomberait sur la
    // ligne du repas hors plan et le ferait disparaître de la vue du coach —
    // la personne aurait dit la vérité et perdu son repas. Le raisonnement
    // complet est en tête de `photo_invitation_attach.ts`.
    let attachedToInvitedFact = false;
    try {
      const candidate = await findInvitedOffPlanFact(admin, { userId });
      const decision = decidePhotoAttachment({
        candidate,
        photoLocalDate: localDate,
        photoAt: new Date(),
        // La vérité de l'ANALYSE, relue sur la ligne (étape 9) et pas sur la
        // réponse HTTP de l'analyseur.
        photoIsAMeal:
          (eventRow as { disqualified_reason?: unknown }).disqualified_reason ==
            null &&
          (eventRow as { analyzed_at?: unknown }).analyzed_at != null,
        // Un doublon ou un rejeu désigne une ligne ANTÉRIEURE, que quelqu'un a
        // peut-être déjà lue. On ne déplace que ce que cette requête a créé.
        photoRowIsFresh: !idempotent,
        windowMinutes: PHOTO_INVITATION_ATTACH_WINDOW_MINUTES,
      });
      if (decision.attach) {
        const invitedRead = await admin
          .from("protocol_events")
          .select("id, food_group_ref, slot_key, student_note")
          .eq("id", decision.eventId)
          .eq("user_id", userId)
          .maybeSingle();
        const invited = (invitedRead.data ?? null) as
          | Record<string, unknown>
          | null;
        if (invited) {
          const attach = await attachPhotoToInvitedFact(admin, {
            userId,
            invitedEventId: decision.eventId,
            photoEventId: photoRowId,
            photo: {
              mediaPath: path,
              mediaSha256,
              recognized: (eventRow as { recognized?: unknown }).recognized ??
                null,
              recognitionConfidence: (() => {
                const raw =
                  (eventRow as { recognition_confidence?: unknown })
                    .recognition_confidence;
                return raw === null || raw === undefined ? null : Number(raw);
              })(),
              foodGroupRef:
                (eventRow as { food_group_ref?: unknown }).food_group_ref ==
                    null
                  ? null
                  : String((eventRow as { food_group_ref: unknown }).food_group_ref),
              portionBand:
                (eventRow as { portion_band?: unknown }).portion_band == null
                  ? null
                  : String((eventRow as { portion_band: unknown }).portion_band),
              analyzedAt: (eventRow as { analyzed_at?: unknown }).analyzed_at ==
                  null
                ? null
                : String((eventRow as { analyzed_at: unknown }).analyzed_at),
              slotKey: slotKey,
              studentNote: body.student_note ?? null,
            },
            invited: {
              foodGroupRef: invited.food_group_ref == null
                ? null
                : String(invited.food_group_ref),
              slotKey: invited.slot_key == null
                ? null
                : String(invited.slot_key),
              studentNote: invited.student_note == null
                ? null
                : String(invited.student_note),
            },
          });
          if (attach.ok) {
            attachedToInvitedFact = attach.photoRowRemoved;
            eventId = attach.eventId;
            const merged = await admin
              .from("protocol_events")
              .select(EVENT_COLUMNS)
              .eq("id", eventId)
              .maybeSingle();
            if (!merged.error && merged.data) {
              eventRow = merged.data as Record<string, unknown>;
            }
          }
          console.log(JSON.stringify({
            tag: "photo_invitation_attach",
            user_id: userId,
            invited_event_id: decision.eventId,
            photo_event_id: photoRowId,
            surviving_event_id: eventId,
            result: attach.reason,
          }));
        }
      } else {
        console.log(JSON.stringify({
          tag: "photo_invitation_attach_skipped",
          user_id: userId,
          reason: decision.reason,
        }));
      }
    } catch (attachError) {
      // Best-effort par contrat: un échec ici laisse les deux lignes en place —
      // c'est le comportement d'avant FF-025, visible et réparable. Il ne doit
      // jamais coûter une photo déjà enregistrée.
      console.warn(JSON.stringify({
        tag: "photo_invitation_attach_failed",
        user_id: userId,
        error: attachError instanceof Error
          ? attachError.message
          : String(attachError),
      }));
    }

    // ══════════════════════════════════════════════════════════════════════
    // L2 · SOUS PLANCHER, LE FAIT RESTE — C'EST L'ACCUSÉ QUI SE TAIT
    //
    // 🔴 MESURÉ 3/3 par FF-018 (E4), re-mesuré 2/2 par L2 sur LES DEUX
    //    planchers, le 2026-08-08:
    //      bande  : `__last_turn_risk_band = critical` (crise du tour d'avant)
    //      base   : 1 ligne `protocol_events` — le fait entre, très bien
    //      bulle  : « I see grilled chicken breast, brown rice, broccoli. […]
    //                tell me which one to count and I will log it. »
    //    Une copie enjouée sur le poulet et le riz, avec sa sollicitation, un
    //    tour après une réponse de crise suicidaire. Et le MÊME résultat sous
    //    plancher de restriction levé — que ce chemin ne lisait nulle part.
    //
    // L'en-tête de `safety_band_io.ts` (l. 13-27) nommait déjà les deux
    // survivants comme « un arbitrage produit » resté ouvert: le CRÉDIT écrit
    // sur la ligne photo, et la LIVRAISON de l'accusé. L'arbitrage humain du
    // 2026-08-08 tranche la seconde moitié — « écrire le fait, taire la
    // réponse » — et laisse la première ouverte (le crédit est de l'adhérence,
    // pas un fait déclaré; il n'est pas dans le périmètre décidé).
    //
    // ── CE QUE « SE TAIRE » VEUT DIRE ICI, EXACTEMENT ───────────────────────
    // La photo de l'élève entre dans la bulle comme d'habitude (sa propre
    // ligne `chat_messages` role=user): il voit ce qu'il a envoyé. Ce qui ne
    // part pas, c'est le commentaire sur son assiette. On ne demande pas à
    // quelqu'un en crise laquelle de ses lignes de plan compter.
    //
    // ── ET LE FLOW DE PRÉCISION RESTE FERMÉ, PAR CONSTRUCTION ──────────────
    // Il ne s'ouvre que `if (chatDelivered)`. Sans accusé, il n'y a rien à
    // corriger et rien à ouvrir — donc la garde de bande plus bas devient
    // redondante sur ce chemin, et on la garde quand même: elle couvre le cas
    // où l'accusé partirait pour une autre raison.
    //
    // ── LES DEUX PLANCHERS, LUS SÉPARÉMENT ────────────────────────────────
    // La bande safety se relit dans `user_chat_states` (déjà le cas plus bas);
    // le plancher de restriction se relit par le VRAI chargeur, celui que le
    // chat appelle — jamais une seconde définition. Les deux échouent en
    // « ouvert »: une panne de lecture ne doit pas faire taire toutes les
    // photos de tous les élèves (même arbitrage fail-open NOMMÉ que
    // `readLastTurnSafetyBand`), et elle est TRACÉE.
    // ══════════════════════════════════════════════════════════════════════
    const ackSafetyBand = await readLastTurnSafetyBand(admin, {
      userId,
      scope: CHAT_SCOPE,
    });
    let ackRestrictionFlag = false;
    try {
      const floor = await evaluateRestrictionForStudent(admin as never, {
        userId,
        asOfLocalDate: localDate,
        turnMessage: String(body.student_note ?? "").trim() || null,
        turnLocale: resolveArtifactLocale({
          studentProfile: studentProfileLocale,
          tenantDefault: null,
        }),
      });
      ackRestrictionFlag = floor.restriction_flag === true;
    } catch (floorError) {
      console.warn(JSON.stringify({
        tag: "meal_photo_restriction_floor_unreadable",
        user_id: userId,
        error: floorError instanceof Error
          ? floorError.message
          : String(floorError),
      }));
    }
    const ackSilenced = blocksDurableWrite(ackSafetyBand) || ackRestrictionFlag;
    if (ackSilenced) {
      console.log(JSON.stringify({
        tag: "meal_photo_ack_silenced",
        user_id: userId,
        safety_band: ackSafetyBand,
        restriction_flag: ackRestrictionFlag,
        detail:
          "le fait photo est écrit; l'accusé et sa sollicitation ne partent pas.",
      }));
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
          const body_text = ack || renderPhotoSavedUnanalysed(ackPack);
          // L2 — SOUS PLANCHER, RIEN NE PART. Voir le bloc du dessus: le fait
          // est déjà écrit, la photo est déjà dans la bulle, et le
          // commentaire sur l'assiette n'a pas sa place ici. `chatDelivered`
          // reste `null`, donc le flow de précision ne s'ouvre pas non plus.
          // ── FF-062 R11 · « MODIFIER », QUAND UN CHIFFRE EST LÀ ──────────
          //
          // Le bouton n'apparaît QUE si l'accusé porte un chiffre d'énergie —
          // c'est-à-dire seulement quand la porte des quatre gardes était
          // OUVERTE à l'ingestion. Un élève sous plancher TCA, un mineur, ou
          // quelqu'un qui a éteint l'affichage n'a pas de chiffre, donc pas de
          // bouton: la garde n'est pas rejouée ici, elle est déjà DANS la
          // donnée (`energy_estimate` vaut `null`).
          //
          // ⚠️ ON LIT LA LIGNE RELUE, PAS L'ANALYSE EN MÉMOIRE. C'est ce qui
          // est réellement en base qui est corrigible.
          const storedEnergy =
            ((analysis as { recognized?: Record<string, unknown> } | null)
              ?.recognized ?? {}) as Record<string, unknown>;
          // ⟳ LE BOUTON « CORRIGER LE CHIFFRE » A ÉTÉ RETIRÉ LE 2026-09-07.
          //
          // Il proposait de remplacer l'estimation de la photo par un nombre
          // déclaré. C'est une modification d'un fait déjà écrit, faite par un
          // bouton — la lane que le chantier de réduction du chat ferme.
          //
          // ⚠️ `storedEnergy` RESTE LU, et ce n'est pas un vestige: la ligne
          // relue est ce qui décide de l'accusé. Le chiffre continue d'être
          // estimé, rendu et rangé; c'est sa CORRECTION qui s'arrête.
          const fixButtons: { payload: string; label: string }[] = [];
          const res = ackSilenced
            ? { chatMessageId: null as string | null }
            : await deliverChatMessage(admin, {
              userId,
              content: body_text,
              isReply: true,
              purpose: "keel_meal_photo_ack",
              buttons: fixButtons,
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
      // LA CRISE FERME LA PORTE AVANT DE L'OUVRIR.
      //
      // `reduceMealPrecisionFlow` sort déjà d'un flow ouvert quand le band
      // n'est pas `none` — mais ici on OUVRAIT sans jamais regarder le band,
      // mesuré 6/6 le 2026-08-06. Le dégât restait borné (le reducer sortait au
      // tour suivant), et c'est exactement le genre d'écart qui rend une garde
      // décrite mais absente: `safety_band_io.ts` affirmait que cette ouverture
      // était gatée, elle ne l'était pas.
      //
      // On ne demande pas à quelqu'un en détresse s'il a mis de l'huile.
      const safetyBandNow = await readLastTurnSafetyBand(admin, {
        userId,
        scope: CHAT_SCOPE,
      });
      if (blocksDurableWrite(safetyBandNow)) {
        console.log(JSON.stringify({
          tag: "meal_precision_flow_not_opened_safety",
          user_id: userId,
          safety_band: safetyBandNow,
        }));
      }
      if (recognized && disqualified === null && !blocksDurableWrite(safetyBandNow)) {
        const foods = Array.isArray(recognized.detected_foods)
          ? (recognized.detected_foods as Array<Record<string, unknown>>)
            .map((f) => String(f?.label ?? "").trim())
            .filter((l) => l !== "")
          : [];
        const question = typeof recognized.clarifying_question === "string"
          ? recognized.clarifying_question
          : null;
        const now = new Date();
        // LA COCHE FAIT PARTIE DE CE QUI EST CORRIGIBLE.
        //
        // ── LE DÉFAUT MESURÉ 4/4 LE 2026-08-05 ────────────────────────────
        // Le flow ne portait que la ligne PHOTO. La coche automatique est une
        // ligne `quick_tap` distincte, écrite par `analyze-meal-photo-v1`, et
        // `amendMealPrecisionEvents` ne touche que `eventIds`. Résultat: à
        // « non, c'était autre chose », Sophia répondait « alors la ligne du
        // poulet ne s'applique pas » — et la coche restait, non disqualifiée,
        // continuant de nourrir la couverture que le coach lit. Un accusé de
        // rétractation sans ligne derrière lui: exactement le défaut d'accusé
        // fantôme que ce dépôt paie en boucle, à l'envers.
        //
        // On lit l'ID RELU rendu par l'analyse, jamais le titre de l'accusé:
        // seul un id prouve qu'une ligne existe.
        const tickEventId = String(
          (analysis as { planned_dish_tick_event_id?: unknown } | null)
            ?.planned_dish_tick_event_id ?? "",
        ).trim();
        const opened = await openMealPrecisionFlowState(admin, {
          userId,
          scope: CHAT_SCOPE,
          flow: openMealPrecisionFlow({
            source: "photo",
            eventIds: [eventId],
            // LISTE SÉPARÉE, pas un second `eventId`: `targetAmbiguous` se
            // calcule sur `eventIds`, et y verser la coche ferait passer toute
            // photo cochée pour une cible ambiguë — le crédit cesserait alors
            // d'être effacé sur correction. Mesuré 3/3.
            tickEventIds: tickEventId ? [tickEventId] : [],
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
      // FF-025 R4: `true` quand cette photo a ENRICHI un repas déjà déclaré au
      // lieu d'en écrire un second. L'appelant ne doit alors pas la présenter
      // comme un repas de plus — et un run de QA peut le vérifier sans lire
      // les logs.
      attached_to_declared_meal: attachedToInvitedFact,
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
