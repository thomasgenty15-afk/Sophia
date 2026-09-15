/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

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
import {
  sniffImageMime,
  SUPPORTED_IMAGE_MIMES,
} from "../_shared/keel/image_sniff.ts";

/**
 * LA PHOTO D'UNE RECETTE DU COACH.
 *
 * POURQUOI UNE FONCTION EDGE ALORS QUE LE NAVIGATEUR POURRAIT UPLOADER.
 * Migration 20260727130000 et W1.4 R3: il n'existe AUCUNE policy sur
 * `storage.objects`. `anon` et `authenticated` sont structurellement incapables
 * de toucher un bucket. Tout accès fichier est une fonction edge en service_role
 * qui a DÉJÀ vérifié la propriété. C'est l'arbitrage; cette fonction en est la
 * conséquence, pas une préférence.
 *
 * DEUX ACTIONS, DEUX PUBLICS
 * --------------------------
 *   upload — le COACH seul, sur une recette qui est la sienne. Le mime est
 *            vérifié par OCTETS MAGIQUES, jamais par l'en-tête déclaré: un
 *            client qui annonce « image/png » sur une charge arbitraire ne doit
 *            pas la voir stockée.
 *   sign   — le coach ET l'élève. Le bucket est privé, donc la lecture passe par
 *            une URL signée, émise à la demande et courte. Qui a le droit de
 *            voir quoi est décidé ICI, jamais par le chemin demandé.
 *
 * LE CHEMIN PORTE LE PROPRIÉTAIRE: `<coach_id>/<recipe_id>.<ext>`. Ce n'est pas
 * cosmétique — c'est ce qui rend une fuite d'identifiant inexploitable, et la
 * CHECK de `meal_ideas.image_path` impose la forme en base.
 *
 * CE QU'ELLE N'ÉCRIT JAMAIS: rien dans les données d'un élève. Le coach reste
 * structurellement propriétaire de SA bibliothèque et de rien d'autre.
 */

const BUCKET = "recipe-images";
const MAX_DECODED_BYTES = 5 * 1024 * 1024;

/** Par coach. Un upload coûte du stockage, pas un appel modèle: plus large. */
const UPLOAD_RATE_WINDOWS = [
  { limit: 20, windowSeconds: 600 },
  { limit: 200, windowSeconds: 86_400 },
];

/**
 * Une URL signée courte. Elle est ré-émise à chaque affichage: la stocker
 * quelque part la ferait expirer dans le stockage, et l'allonger la ferait
 * survivre au retrait d'un élève de la cohorte.
 */
const SIGNED_URL_TTL_SECONDS = 600;

const UPLOAD_SCHEMA = z.object({
  action: z.literal("upload"),
  recipe_id: z.string().uuid(),
  mime_type: z.string().trim().min(1).max(80),
  base64: z.string().min(1).max(8_000_000),
});

const SIGN_SCHEMA = z.object({
  action: z.literal("sign"),
  /** Les chemins à signer. Chacun est vérifié, aucun n'est signé sur parole. */
  paths: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
});

const REQUEST_SCHEMA = z.union([UPLOAD_SCHEMA, SIGN_SCHEMA]);

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function adminClient(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function callerUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return null;
  const userClient = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return null;
  return user.id;
}

/** JWT -> `coaches` ACTIF. Aucun `coach_id` n'est jamais accepté du client. */
async function coachIdFor(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("coaches")
    .select("id, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { id: string; status: string } | null;
  if (!row || row.status !== "active") return null;
  return row.id;
}

function decodeBase64(input: string): Uint8Array {
  const cleaned = input.includes(",") ? input.slice(input.indexOf(",") + 1) : input;
  const binary = atob(cleaned.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Les chemins que CE demandeur a le droit de voir.
 *
 * Un coach voit son dossier. Un élève voit les recettes ACTIVES de ses coachs
 * actifs — la même définition du lien que `my_coach_ids()`, appliquée ici en
 * service_role parce que la lecture du bucket ne passe pas par RLS.
 *
 * Le filtrage part des LIGNES autorisées, jamais du chemin demandé: dériver le
 * droit du chemin (« ça commence par mon coach_id, donc c'est bon ») ferait
 * signer une photo archivée, ou celle d'un coach qu'on a quitté.
 */
async function readablePaths(
  admin: SupabaseClient,
  userId: string,
  requested: readonly string[],
): Promise<Set<string>> {
  const wanted = new Set(requested);
  const allowed = new Set<string>();

  const coachId = await coachIdFor(admin, userId);
  if (coachId) {
    const own = await admin
      .from("meal_ideas")
      .select("image_path")
      .eq("coach_id", coachId)
      .not("image_path", "is", null);
    if (own.error) throw own.error;
    for (const row of (own.data ?? []) as Array<{ image_path: string }>) {
      if (wanted.has(row.image_path)) allowed.add(row.image_path);
    }
  }

  const links = await admin
    .from("coach_clients")
    .select("coach_id, coaches!inner(id, status)")
    .eq("student_user_id", userId)
    .eq("status", "active");
  if (links.error) throw links.error;
  const linkRows = (links.data ?? []) as Array<
    { coach_id: string; coaches?: { status?: string } | null }
  >;
  const coachIds = [
    ...new Set(
      linkRows
        .filter((row) => row.coaches?.status === "active")
        .map((row) => String(row.coach_id)),
    ),
  ];
  if (coachIds.length > 0) {
    const shared = await admin
      .from("meal_ideas")
      .select("image_path")
      .in("coach_id", coachIds)
      .eq("status", "active")
      .not("image_path", "is", null);
    if (shared.error) throw shared.error;
    for (const row of (shared.data ?? []) as Array<{ image_path: string }>) {
      if (wanted.has(row.image_path)) allowed.add(row.image_path);
    }
  }

  return allowed;
}

Deno.serve(async (req: Request) => {
  const requestId = getRequestId(req);
  const preflight = handleCorsOptions(req);
  if (preflight) return preflight;
  const corsRefusal = enforceCors(req);
  if (corsRefusal) return corsRefusal;

  try {
    const userId = await callerUserId(req);
    if (!userId) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, {
        status: 401,
      });
    }

    const parsed = await parseJsonBody(req, REQUEST_SCHEMA, requestId);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const admin = adminClient();

    // ---- sign ------------------------------------------------------------
    if (body.action === "sign") {
      const allowed = await readablePaths(admin, userId, body.paths);
      const urls: Record<string, string> = {};
      for (const path of body.paths) {
        if (!allowed.has(path)) continue;
        const signed = await admin.storage.from(BUCKET)
          .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
        // Un chemin qui ne se signe pas est OMIS, jamais remplacé par une URL
        // vide: l'écran affichera une recette sans photo, ce qui est vrai.
        if (!signed.error && signed.data?.signedUrl) {
          urls[path] = signed.data.signedUrl;
        }
      }
      return jsonResponse(req, { ok: true, urls, request_id: requestId });
    }

    // ---- upload ----------------------------------------------------------
    const coachId = await coachIdFor(admin, userId);
    if (!coachId) {
      return jsonResponse(req, { error: "not_a_coach", request_id: requestId }, {
        status: 403,
      });
    }

    const limited = await enforceRateLimit(req, requestId, {
      key: `coach-recipe-image:${coachId}`,
      windows: UPLOAD_RATE_WINDOWS,
    });
    if (limited) return limited;

    // LA RECETTE EST-ELLE LA SIENNE. Lu en base, jamais déduit du corps: un
    // `recipe_id` d'un autre coach écraserait sa photo.
    const recipe = await admin
      .from("meal_ideas")
      .select("id, coach_id, image_path")
      .eq("id", body.recipe_id)
      .maybeSingle();
    if (recipe.error) throw recipe.error;
    const row = recipe.data as
      | { id: string; coach_id: string; image_path: string | null }
      | null;
    if (!row || row.coach_id !== coachId) {
      return jsonResponse(req, { error: "recipe_not_yours", request_id: requestId }, {
        status: 403,
      });
    }

    let bytes: Uint8Array;
    try {
      bytes = decodeBase64(body.base64);
    } catch {
      return badRequest(req, requestId, "invalid_base64");
    }
    if (bytes.length === 0) return badRequest(req, requestId, "empty_image");
    if (bytes.length > MAX_DECODED_BYTES) {
      return badRequest(
        req,
        requestId,
        `image_too_large: ${bytes.length} bytes (max ${MAX_DECODED_BYTES})`,
      );
    }

    // CE QUE LES OCTETS SONT, pas ce que l'appelant prétend. Un désaccord entre
    // les deux est un REFUS: le désaccord est lui-même le signal.
    const sniffed = sniffImageMime(bytes);
    if (!sniffed) return badRequest(req, requestId, "unsupported_image_format");
    if (body.mime_type.trim().toLowerCase() !== sniffed) {
      return badRequest(
        req,
        requestId,
        `mime_mismatch: declared ${body.mime_type}, bytes say ${sniffed}`,
      );
    }

    const ext = SUPPORTED_IMAGE_MIMES[sniffed];
    const path = `${coachId}/${row.id}.${ext}`;
    const uploaded = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: sniffed,
      // Une recette n'a qu'une photo: la remplacer écrase la précédente au même
      // chemin, ce qui évite d'accumuler des orphelins que personne ne purge.
      upsert: true,
    });
    if (uploaded.error) {
      throw new Error(`storage upload failed: ${uploaded.error.message}`);
    }

    // WRITE-THROUGH: on écrit le chemin ET on le relit. Rien n'est annoncé qui
    // n'a pas traversé la base.
    const written = await admin
      .from("meal_ideas")
      .update({ image_path: path })
      .eq("id", row.id)
      .eq("coach_id", coachId)
      .select("id, image_path")
      .single();
    if (written.error) {
      throw new Error(`meal_ideas update failed: ${written.error.message}`);
    }
    const stored = (written.data as { image_path: string | null }).image_path;
    if (stored !== path) {
      throw new Error(
        `read-back carries ${JSON.stringify(stored)}, expected ${JSON.stringify(path)}`,
      );
    }

    const signed = await admin.storage.from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    return jsonResponse(req, {
      ok: true,
      image_path: path,
      signed_url: signed.error ? null : (signed.data?.signedUrl ?? null),
      request_id: requestId,
    });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "coach-recipe-image-v1",
      requestId,
      error,
      metadata: { source: "edge" },
    });
    return serverError(req, requestId);
  }
});
