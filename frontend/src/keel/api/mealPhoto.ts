// KEEL W5.4 — the student app's meal-photo client.
//
// WHY A FUNCTION CALL AND NOT A DIRECT BUCKET UPLOAD: `keelClient.ts` already
// states the W1 arbitration — there is NO policy on `storage.objects`, so the
// browser cannot touch `meal-photos` at all. Every file access is an edge
// function in service_role that has already checked ownership. This module is
// that call, and it is the only place in the app that knows a bucket exists.
//
// WHAT THIS MODULE MUST NEVER SURFACE (CONTRACT non-input #4 + the display
// gate): a calorie figure, a macro figure, or ANY percentage. The types below
// carry `portion_band` and `confidence_band` — tokens — and deliberately do NOT
// declare a numeric confidence field. `recognition_confidence` is not even
// fetched by `keelClient`: the number the UI must not show does not reach the
// UI. That is a structural gate, not a styling rule.

import { supabase } from "../../lib/supabase";

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** Mirrors `_shared/keel/meal_analysis.ts`. R1: tokens, never translated. */
export type PortionBand = "small" | "moderate" | "large" | "unclear";
export type MatchVerdict = "consistent" | "partial" | "inconsistent" | "not_visible";
export type ConfidenceBand = "low" | "moderate" | "high";
export type ImageQuality = "clear" | "partial" | "unusable";
/**
 * Ce que la photographie MONTRE, et non ce qu'on peut en lire. Deux axes
 * distincts: un menu de restaurant peut être parfaitement net (`image_quality`
 * "clear") et n'être aucun repas (`subject_kind` "food_not_eaten").
 */
export type SubjectKind = "eaten_meal" | "food_not_eaten" | "not_food";
/** Pourquoi un fait photo ne compte pas. `null` = il compte. */
export type DisqualifiedReason = "not_food" | "food_not_eaten" | "unreadable";

export const ACCEPTED_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** 8 MB decoded — the server's own ceiling, checked here to fail before upload. */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export interface MealPhotoDetectedFood {
  /**
   * LE NOM ANGLAIS, ET IL LE RESTE — un matcher le lit côté serveur
   * (`planned_dish_match.ts`, contre le catalogue anglais `food_items`). Ce
   * champ n'est PAS celui qu'on affiche à un élève francophone.
   */
  label: string;
  /**
   * LE MÊME ALIMENT DANS LA LANGUE DE L'ÉLÈVE, quand le modèle l'a rendu.
   *
   * Optionnel et nullable exprès: les lignes analysées avant
   * `meal_analysis.v4` ne le portent pas, et rien ne les réécrit — ce sont des
   * lectures faites à une date, pas des données à normaliser. Tout affichage
   * retombe donc sur `label`.
   */
  label_localized?: string | null;
  food_group_ref: string | null;
}

/**
 * Le nom À MONTRER pour un aliment détecté.
 *
 * UNE fonction plutôt qu'un `??` recopié: il y a deux surfaces qui affichent
 * ces libellés (`TodayPage`, et la carte de la semaine), et c'est exactement le
 * genre de repli qu'une seule des deux finit par oublier.
 */
export function detectedFoodLabel(food: MealPhotoDetectedFood): string {
  return String(food.label_localized ?? "").trim() || food.label;
}

/**
 * D'OÙ VIENT UN CHIFFRE D'ÉNERGIE. Miroir de `EnergyBasis` côté serveur.
 *
 * ⚠️ LES DEUX VALEURS NE VALENT PAS PAREIL, ET L'ÉCRAN DOIT LE DIRE.
 * `photo_estimate` a été mesurée sur ce produit à −26,6 % de biais,
 * systématique, toujours du même côté et pire sur les gros repas — un élève en
 * excédent y lit un chiffre rassurant. `declared_quantities` vaut 2,3 % de
 * MAPE. Les rendre de la même façon mentirait sur la fiabilité de l'une des
 * deux, et ce serait celle qui rassure à tort.
 */
export type EnergyBasis = "declared_quantities" | "photo_estimate";

/**
 * UN CHIFFRE D'ÉNERGIE, ET IL NE VOYAGE JAMAIS SANS SA BASE.
 *
 * ⚠️ LA SEULE FORME SOUS LAQUELLE UN KCAL A LE DROIT D'ATTEINDRE CET ÉCRAN.
 * `CALORIE_REVERSAL.md` §5 en fait une propriété du harnais: *« tout rendu qui
 * affiche `kcal` affiche aussi sa base »*. Un `number` nu ici — même
 * « temporairement », même « juste pour la tendance » — est le défaut que tout
 * ce chantier existe pour rendre impossible.
 *
 * ⛔ ET IL NE SE SOMME PAS. Le biais de −26,6 % n'est divisé que par 1,04 en
 * cumul hebdomadaire; les deltas sont 2,5× pires que les niveaux. Une courbe
 * construite là-dessus serait fausse dans une direction flatteuse.
 */
export interface MealPhotoEnergyEstimate {
  kcal: number;
  basis: EnergyBasis;
  confidence_band: ConfidenceBand;
}

export interface MealPhotoCommitmentMatch {
  commitment_id: string;
  verdict: MatchVerdict;
  rationale: string;
}

/** The `recognized` jsonb a photo event carries once analyzed. */
export interface MealPhotoRecognized {
  kind?: string;
  analysis_version?: string;
  binding?: string;
  commitment_id?: string;
  detected_foods?: MealPhotoDetectedFood[];
  food_groups_present?: string[];
  food_groups_absent?: string[];
  portion_band?: PortionBand;
  portion_rationale?: string;
  commitment_matches?: MealPhotoCommitmentMatch[];
  confidence_band?: ConfidenceBand;
  image_quality?: ImageQuality;
  subject_kind?: SubjectKind;
  /**
   * `null` est la réponse NORMALE, et c'est aussi ce qu'écrit une porte fermée
   * (plancher TCA, mineur, coach qui ne compte pas, affichage éteint). Les deux
   * cas sont indiscernables ICI, et c'est voulu: l'écran n'a pas à savoir
   * pourquoi il n'y a pas de chiffre — il n'en montre pas, point.
   *
   * Optionnel: les lignes analysées avant `meal_analysis.v5` ne le portent pas,
   * et rien ne les réécrit.
   */
  energy_estimate?: MealPhotoEnergyEstimate | null;
}

export interface MealPhotoUploadResult {
  ok: boolean;
  /** true when this exact upload was already on file: NOT a new fact. */
  idempotent: boolean;
  /**
   * true quand un AUTRE envoi portait déjà exactement cette image, le même jour.
   * Distinct d'`idempotent`, qui désigne le rejeu réseau du MÊME envoi. Dans ce
   * cas `analysis` vaut `null` — rien n'a été réanalysé, et `event` renvoie le
   * fait déjà en base.
   */
  duplicate?: boolean;
  event: {
    id: string;
    local_date: string;
    slot_key: string | null;
    /** `null` = ce fait compte. Sinon, pourquoi il ne compte pas. */
    disqualified_reason?: DisqualifiedReason | null;
  };
  media_path: string;
  local_date: string;
  slot_key: string | null;
  /** `null` sur un doublon exact: rien n'a été réanalysé. */
  analysis: {
    status?: string;
    binding?: string;
    student_message?: string;
    recognized?: MealPhotoRecognized;
    error?: unknown;
  } | null;
}

/**
 * Échange des chemins de bucket contre des URLs signées, pour AFFICHER les
 * photos déjà envoyées.
 *
 * MÊME ARBITRAGE QUE L'UPLOAD, dans l'autre sens, et MÊME FONCTION: une seule
 * fonction possède le bucket (`meal-photos` est privé et sans policy, donc le
 * navigateur ne peut pas lire un objet même en connaissant son chemin). La
 * propriété est vérifiée côté serveur dans `protocol_events` — ce module envoie
 * des chemins, il n'affirme aucun droit.
 *
 * Ne JETTE PAS sur un chemin refusé: il est simplement absent du retour, et la
 * bulle s'affiche sans image. Une conversation entière ne doit pas échouer
 * parce qu'une photo sur trente a été purgée.
 */
export async function signMealPhotoUrls(
  paths: readonly string[],
): Promise<Record<string, string>> {
  const wanted = [...new Set(paths.map((p) => p.trim()).filter(Boolean))];
  if (wanted.length === 0) return {};

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("[keel/api] no active session");

  // Le serveur plafonne à 100 chemins par appel: on découpe ici plutôt que de
  // laisser une conversation longue se faire refuser en bloc.
  const CHUNK = 100;
  const urls: Record<string, string> = {};
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const res = await fetch(`${FUNCTIONS_BASE}/meal-photo-upload-v1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action: "sign", paths: wanted.slice(i, i + CHUNK) }),
    });
    if (!res.ok) {
      throw new Error(`[keel/api] signMealPhotoUrls failed: HTTP ${res.status}`);
    }
    const json = await res.json().catch(() => ({}));
    const signed = (json as { urls?: Record<string, string> })?.urls ?? {};
    for (const [path, relative] of Object.entries(signed)) {
      // LE SERVEUR REND UN CHEMIN RELATIF, exprès: il compose ses URLs avec le
      // `SUPABASE_URL` qu'IL voit, qui en local est le nom d'hôte interne du
      // réseau Docker (`http://kong:8000`) — introuvable depuis un navigateur.
      // Le seul composant qui connaisse à coup sûr l'origine publique est
      // celui qui parle au navigateur: celui-ci.
      urls[path] = relative.startsWith("http")
        ? relative
        : `${import.meta.env.VITE_SUPABASE_URL}${relative}`;
    }
  }
  return urls;
}

/** Whether the analysis actually ran. `false` means: the photo is on file and
 *  nothing was read from it — say exactly that, never nothing. */
export function analysisSucceeded(result: MealPhotoUploadResult): boolean {
  const status = result.analysis?.status;
  return status === "analyzed" || status === "already_analyzed";
}

function fileToBase64(file: File): Promise<string> {
  return file.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let binary = "";
    // Chunked: String.fromCharCode(...bytes) blows the argument limit on a
    // multi-megabyte photo.
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  });
}

/**
 * Send one meal photo.
 *
 * `clientUploadId` is generated per SELECTED FILE, not per attempt: a retry of
 * the same photo must collide with the row already on file instead of writing a
 * second fact. The caller keeps it stable across retries.
 */
export async function uploadMealPhoto(args: {
  file: File;
  slotKey: string | null;
  commitmentId?: string | null;
  clientUploadId: string;
  /**
   * DE-WHATSAPP — présent quand la photo est envoyée DANS la conversation.
   * Le serveur écrit alors la photo et son accusé dans la bulle, en une seule
   * chaîne: l'accusé est rendu à partir de la liaison et du crédit réellement
   * écrits, et le faire re-rendre côté client serait une seconde
   * implémentation de « qu'est-ce qui a été crédité ».
   */
  chatClientMessageId?: string;
  /** La légende de l'élève. Facultative: une photo sans mot est le cas normal. */
  note?: string;
}): Promise<MealPhotoUploadResult> {
  const mimeType = args.file.type.toLowerCase();
  if (!(ACCEPTED_PHOTO_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new Error(`[keel/api] unsupported image type: ${mimeType || "unknown"}`);
  }
  if (args.file.size > MAX_PHOTO_BYTES) {
    throw new Error(`[keel/api] image too large: ${args.file.size} bytes`);
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error("[keel/api] no active session");
  }

  const base64 = await fileToBase64(args.file);
  const res = await fetch(`${FUNCTIONS_BASE}/meal-photo-upload-v1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      mime_type: mimeType,
      base64,
      slot_key: args.slotKey,
      commitment_id: args.commitmentId ?? null,
      client_upload_id: args.clientUploadId,
      ...(args.chatClientMessageId
        ? { chat_client_message_id: args.chatClientMessageId }
        : {}),
      ...(args.note?.trim() ? { student_note: args.note.trim() } : {}),
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // R7 at the network boundary: raised, never swallowed.
    throw new Error(
      `[keel/api] uploadMealPhoto failed: ${
        String((json as { error?: unknown })?.error ?? `HTTP ${res.status}`)
      }`,
    );
  }
  return json as MealPhotoUploadResult;
}
