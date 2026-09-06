/**
 * ══════════════════════════════════════════════════════════════════════════
 * KEEL — LE MAGASIN DES BROUILLONS. Le plan adopté est CELUI qui a été relu.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Table: `student_meal_drafts` (migration 20260906230000).
 *
 * ── LE DÉFAUT QUE CE MODULE FERME, ET IL A ÉTÉ MESURÉ ────────────────────
 * L'aperçu (`draft`) n'était persisté nulle part. Adopter re-postait la MÊME
 * requête avec `adopting_draft: true`, ce qui déclenchait un SECOND appel
 * modèle complet — avec les cinq relances de qualité DÉSARMÉES, puisque le
 * chemin d'adoption ne doit pas faire attendre.
 *
 * En run réel: aperçu = **6 boîtes**, ligne écrite en base = **0 boîte**,
 * HTTP **200**. Personne n'a menti; ce sont deux plans. La personne a relu le
 * premier et a reçu le second.
 *
 * Ce module écrit l'aperçu. L'adoption cesse d'être « recomposer » pour
 * devenir « écrire ce qui a déjà été relu ».
 *
 * ── POURQUOI UNE LIGNE EST À LA FOIS L'APERÇU ET LE JOB ──────────────────
 * Une file de travail d'un côté et un cache d'aperçu de l'autre feraient DEUX
 * vérités sur un seul geste, et le dépôt porte déjà la cicatrice de l'écriture
 * double (`stale-current-erases-the-previous-write`: la seconde écriture,
 * périmée, efface la première). L'objet est unique — « la composition que
 * cette personne a demandée ». Elle est `pending`, puis `running`, puis
 * `done`, et ce que `done` porte EST l'aperçu (`response`) plus, mot pour mot,
 * ce qui partira en `p_payload` de `write_student_meal_plan`
 * (`write_payload`).
 *
 * ── POURQUOI L'INDEX UNIQUE, ET PAS UN CONTRÔLE ICI ──────────────────────
 * Le plafond est « une composition en vol par personne ». Écrit en TypeScript,
 * il LIT puis ÉCRIT: deux taps à 80 ms d'écart (le bouton qui ne répond pas,
 * le mobile qui rejoue) traversent tous les deux la lecture et lancent DEUX
 * appels modèle facturés, dont un dont personne n'attend plus la réponse.
 * `student_meal_drafts_one_inflight_per_user` arbitre DANS l'instruction
 * d'insertion: le second `insert` rend `23505`, et c'est `openDraft` qui
 * décide alors s'il s'agit de la MÊME demande (réutilisation) ou d'une autre
 * (conflit). Le code ne compte pas; il lit un refus.
 *
 * ── LA RÈGLE DE LECTURE, ET ELLE EST UNE CICATRICE ───────────────────────
 * ⛔ CHAQUE LECTURE PORTE `.eq("user_id", …)`. Le client passé ici est en
 * `service_role`: RLS ne le contraint PAS, et la policy propriétaire de la
 * migration ne protège que le port `authenticated`. Charger par l'identifiant
 * reçu du client sans le propriétaire rendrait le brouillon d'un autre —
 * cicatrice `rls-is-not-a-substitute-for-eq-user-id`, où la ligne d'un élève
 * avait été rendue à un coach.
 *
 * ⛔ ET CE MODULE NE CRÉE JAMAIS DE CLIENT. Il en reçoit un. Un module qui
 * fabrique son propre `service_role` est un module qu'aucun test ne peut faire
 * échouer.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { sha256Hex, stableStringify } from "../memory/memorizer/utils.ts";

/** La table. Le nom vit ici et dans sa migration, nulle part ailleurs. */
export const STUDENT_MEAL_DRAFTS_TABLE = "student_meal_drafts";

/**
 * LE MILLÉSIME DU MAGASIN. Il entre dans `source_version` À CÔTÉ de la version
 * de prompt: un brouillon composé avant un correctif de FORME (ce qui entre
 * dans `write_payload`) est aussi périmé qu'un brouillon composé avant un
 * correctif de prompt, et la version de prompt seule ne le dirait pas.
 */
export const DRAFT_STORE_VERSION = "draft_store.v1";

/** Sept minutes, le même nombre que la balayeuse SQL. */
export const DRAFT_STUCK_AFTER_MS = 7 * 60 * 1000;

export const DRAFT_STATUSES = [
  "pending",
  "running",
  "done",
  "failed",
  "adopted",
] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const DRAFT_LANES = ["meal", "household_meal"] as const;
export type DraftLane = (typeof DRAFT_LANES)[number];

export const DRAFT_PLAN_KINDS = ["personal", "household"] as const;
export type DraftPlanKind = (typeof DRAFT_PLAN_KINDS)[number];

export const DRAFT_MODES = ["sync", "async"] as const;
export type DraftMode = (typeof DRAFT_MODES)[number];

/**
 * POURQUOI UNE ADOPTION EST REFUSÉE. Liste FERMÉE — un motif inventé au point
 * d'appel est un motif que personne ne cherchera jamais dans les journaux, et
 * l'écran n'aurait rien à en dire.
 *
 * ⚠️ `draft_stale` N'EST PAS ICI: il ne se décide pas sur la LIGNE mais sur la
 * comparaison de `safety_fingerprint` avec le foyer d'aujourd'hui
 * (`safety_fingerprint.ts`). Le mélanger ici ferait croire qu'`adoptability`
 * l'a regardé.
 */
export const DRAFT_REFUSALS = [
  "draft_not_found",
  "draft_not_ready",
  "draft_failed",
  "draft_expired",
  "draft_already_adopted",
] as const;
export type DraftRefusal = (typeof DRAFT_REFUSALS)[number];

/**
 * LES CLÉS QUI DÉCRIVENT LE GESTE, PAS LE PLAN.
 *
 * `launch` dit d'où on part, `adopting_draft` dit qu'on adopte, `replaces` dit
 * quelle ligne serait retirée. Aucune des trois ne change UN SEUL mot de ce que
 * le modèle compose — les laisser dans l'empreinte ferait deux clés différentes
 * pour une seule et même demande, donc deux appels modèle pour un plan.
 *
 * ⚠️ RETIRÉES À TOUTE PROFONDEUR, et c'est délibéré: le jour où un appelant
 * enveloppe sa requête (`{request: {...}}`), une clé de geste nichée
 * ressusciterait la divergence sans que rien ne le dise.
 */
export const DRAFT_IDEMPOTENCY_IGNORED_KEYS: readonly string[] = [
  "launch",
  "adopting_draft",
  "replaces",
];

// ===========================================================================
// 1. LA PARTIE PURE — aucune E/S, testable seule
// ===========================================================================

/** `<version de prompt>|draft_store.vN`. Les deux, jamais l'une des deux. */
export function sourceVersionOf(promptVersion: string): string {
  const version = String(promptVersion ?? "").trim() || "unknown";
  return `${version}|${DRAFT_STORE_VERSION}`;
}

function stripGestureKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripGestureKeys);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (DRAFT_IDEMPOTENCY_IGNORED_KEYS.includes(key)) continue;
    out[key] = stripGestureKeys(inner);
  }
  return out;
}

/**
 * L'EMPREINTE DE LA DEMANDE.
 *
 * ⚠️ ASYNCHRONE, et ce n'est pas un choix de style: `crypto.subtle.digest` rend
 * une promesse, et c'est le seul SHA-256 disponible en edge sans dépendance.
 * `sha256Hex`/`stableStringify` sont RÉUTILISÉS (memory/memorizer/utils.ts,
 * zéro import) — une seconde implémentation de « JSON canonique » divergerait
 * de la première au premier tri de tableau.
 *
 * L'identifiant de la personne entre dans le hachage: deux personnes qui
 * demandent la même chose ne partagent pas une clé, et une clé qui fuirait ne
 * dirait rien de la demande d'un autre.
 */
export async function draftIdempotencyKey(
  userId: string,
  body: unknown,
): Promise<string> {
  const canonical = stableStringify(stripGestureKeys(body));
  return await sha256Hex(`${String(userId ?? "")}\n${canonical}`);
}

/** La ligne, réduite à ce qu'`adoptability` regarde. */
export interface DraftRowForAdoption {
  readonly id?: string | null;
  readonly status?: string | null;
  readonly expires_at?: string | null;
  readonly write_payload?: unknown;
  readonly response?: unknown;
}

export type Adoptability =
  | { readonly ok: true }
  | { readonly ok: false; readonly refusal: DraftRefusal };

/**
 * CETTE LIGNE PEUT-ELLE S'ÉCRIRE ?
 *
 * ⚠️ L'ORDRE DES REFUS N'EST PAS COMMUTATIF. Un brouillon DÉJÀ adopté et
 * périmé doit dire `draft_already_adopted`: « il est trop tard » se répare en
 * ouvrant le plan, « il a expiré » se répare en recomposant. Dire le second
 * enverrait la personne payer un appel modèle pour un plan qu'elle a déjà.
 */
export function adoptability(
  row: DraftRowForAdoption | null | undefined,
  nowIso: string,
): Adoptability {
  if (!row) return { ok: false, refusal: "draft_not_found" };

  const status = String(row.status ?? "");
  if (status === "adopted") return { ok: false, refusal: "draft_already_adopted" };
  if (status === "failed") return { ok: false, refusal: "draft_failed" };
  if (status !== "done") return { ok: false, refusal: "draft_not_ready" };

  // ⚠️ `Date.parse` sur les DEUX bords, et une date illisible NE PÉRIME PAS:
  // un `expires_at` qu'on ne sait pas lire est un défaut de lecture, pas une
  // expiration, et refuser dessus ferait perdre un plan valide.
  const expiry = Date.parse(String(row.expires_at ?? ""));
  const now = Date.parse(String(nowIso ?? ""));
  if (Number.isFinite(expiry) && Number.isFinite(now) && expiry <= now) {
    return { ok: false, refusal: "draft_expired" };
  }

  // La base l'interdit déjà (`student_meal_drafts_done_has_plan`); si elle est
  // quand même là, c'est que quelqu'un a fabriqué la ligne autrement — et un
  // `done` sans payload n'a RIEN à écrire, ce qui est très exactement le défaut
  // de tête de fichier.
  if (row.write_payload === null || row.write_payload === undefined) {
    return { ok: false, refusal: "draft_not_ready" };
  }

  return { ok: true };
}

// ===========================================================================
// 2. LA PARTIE E/S — le client est un PARAMÈTRE
// ===========================================================================

/**
 * LE CLIENT EST LE VRAI TYPE, et c'est une décision MESURÉE.
 *
 * Un type structurel maison (`{from(t): {insert…}}`) aurait évité l'import,
 * mais un `SupabaseClient` réel ne lui est PAS assignable: le compilateur rend
 * `TS2589 Type instantiation is excessively deep` (vérifié le 2026-09-06 sur ce
 * lot). Le point d'appel aurait donc dû écrire `admin as unknown as …` — un
 * cast sur un type étranger, c'est-à-dire le typecheck DÉSARMÉ à l'endroit
 * exact où il servait (cicatrice `as-cast-on-foreign-type-disarms-typecheck`).
 *
 * On garde donc la convention des autres portes du dossier
 * (`memory_clarification_io.ts`, `draft_note_safety_io.ts`): la prod passe son
 * client tel quel, les tests injectent un faux avec `as never`.
 */
export type DraftStoreClient = SupabaseClient;

function log(event: string, extra: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: "keel.draft_store", event, ...extra }));
}

function errorCodeOf(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code ?? "");
  }
  return "";
}

function errorMessageOf(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return String(error ?? "");
}

/** Le résultat d'une écriture. Un `false` ne LÈVE pas: voir `completeDraft`. */
export interface DraftWriteOutcome {
  readonly ok: boolean;
  readonly reason: string | null;
}

export interface OpenDraftArgs {
  readonly userId: string;
  readonly householdId?: string | null;
  readonly lane: DraftLane;
  readonly planKind: DraftPlanKind;
  readonly requestId: string;
  readonly body: unknown;
  readonly mode: DraftMode;
  /**
   * ⚠️ EXIGÉE, et la colonne l'est aussi. `source_version` est `not null` en
   * base: une valeur par défaut posée ici écrirait « unknown » sur chaque
   * brouillon, c'est-à-dire un champ déclaré que personne ne peut compter
   * (cicatrice `model-declared-fields-need-a-counter`). L'appelant nomme la
   * version de prompt qu'il vient d'utiliser; `sourceVersionOf` y colle le
   * millésime du magasin.
   */
  readonly promptVersion: string;
  /** Injectable pour les tests. Par défaut `new Date()`. */
  readonly now?: Date;
}

export type OpenDraftOutcome =
  | { readonly id: string; readonly reused: boolean }
  | { readonly conflict: { readonly draftId: string } };

/**
 * BALAIE LES LIGNES BLOQUÉES DE CETTE PERSONNE, puis rien d'autre.
 *
 * Le cron horaire fait le même geste; celui-ci existe parce qu'une personne
 * dont la composition s'est arrêtée net (runtime edge tué, 502 Kong) ne peut
 * PLUS RIEN COMPOSER tant que sa ligne tient la place de l'index — et lui dire
 * « attends l'heure pile » n'est pas un produit.
 *
 * ⚠️ `created_at` ET PAS `started_at`: `started_at` est nul tant que la ligne
 * est `pending`, et une comparaison sur une colonne nulle ne ramènerait jamais
 * la ligne qui n'a même pas démarré. La balayeuse SQL fait la même chose avec
 * `coalesce(started_at, created_at)`.
 */
export async function sweepStuckDrafts(
  admin: DraftStoreClient,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - DRAFT_STUCK_AFTER_MS).toISOString();
  const { data, error } = await admin
    .from(STUDENT_MEAL_DRAFTS_TABLE)
    .update({
      status: "failed",
      error_code: "timed_out",
      error: "draft_store: aucune fin apres 7 minutes",
      finished_at: now.toISOString(),
    })
    .eq("user_id", userId)
    .in("status", ["pending", "running"])
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    // ⚠️ ON NE LÈVE PAS. Le balayage est une COURTOISIE avant l'insertion; s'il
    // échoue, l'insertion refusera d'elle-même par l'index et l'appelant aura
    // un `conflict` — un motif que l'écran sait dire.
    log("sweep_failed", { userId, error: errorMessageOf(error) });
    return 0;
  }
  return Array.isArray(data) ? data.length : 0;
}

/**
 * OUVRE UN BROUILLON — ou rend celui qui est déjà en vol.
 *
 * TROIS SORTIES, et elles sont trois décisions produit différentes:
 *   · `{id, reused:false}` — c'est une demande neuve, la lane peut composer;
 *   · `{id, reused:true}`  — la MÊME demande est déjà en vol (double tap,
 *     rejeu réseau): on rend la ligne existante et on ne relance RIEN;
 *   · `{conflict}`         — une AUTRE demande est en vol. L'écran dit
 *     « une composition est en cours »; il ne la remplace pas en silence.
 *
 * ⛔ LÈVE sur toute panne qui n'est ni l'unicité ni un refus lisible. Une
 * `openDraft` qui rendrait `null` sur une base en panne ferait composer la lane
 * sans jamais persister l'aperçu — c'est-à-dire le défaut d'origine, remis en
 * place par le chemin d'erreur.
 */
export async function openDraft(
  admin: DraftStoreClient,
  args: OpenDraftArgs,
): Promise<OpenDraftOutcome> {
  const userId = String(args.userId ?? "").trim();
  if (!userId) throw new Error("draft_store: user_id requis");

  const now = args.now ?? new Date();
  const key = await draftIdempotencyKey(userId, args.body);

  await sweepStuckDrafts(admin, userId, now);

  const row: Record<string, unknown> = {
    user_id: userId,
    household_id: args.householdId ?? null,
    plan_kind: args.planKind,
    lane: args.lane,
    status: "pending",
    request_id: args.requestId,
    idempotency_key: key,
    mode: args.mode,
    request_body: args.body ?? {},
    source_version: sourceVersionOf(args.promptVersion),
  };

  const inserted = await admin
    .from(STUDENT_MEAL_DRAFTS_TABLE)
    .insert(row)
    .select("id")
    .maybeSingle();

  if (!inserted.error) {
    const id = String((inserted.data as { id?: unknown } | null)?.id ?? "");
    if (!id) throw new Error("draft_store: insertion sans identifiant rendu");
    log("opened", { userId, draftId: id, lane: args.lane, mode: args.mode });
    return { id, reused: false };
  }

  if (errorCodeOf(inserted.error) !== "23505") {
    throw new Error(`draft_store: insertion refusee (${errorMessageOf(inserted.error)})`);
  }

  // L'INDEX A ARBITRÉ. Reste à savoir si c'est la même demande.
  // ⛔ `.eq("user_id", …)` — RLS ne contraint pas `service_role`.
  const inflight = await admin
    .from(STUDENT_MEAL_DRAFTS_TABLE)
    .select("id, idempotency_key, status")
    .eq("user_id", userId)
    .in("status", ["pending", "running"])
    .maybeSingle();

  if (inflight.error) {
    throw new Error(
      `draft_store: relecture de la ligne en vol impossible (${errorMessageOf(inflight.error)})`,
    );
  }

  const found = inflight.data as
    | { id?: unknown; idempotency_key?: unknown }
    | null
    | undefined;
  const foundId = String(found?.id ?? "");
  if (!foundId) {
    // La ligne a disparu entre le refus et la relecture (balayée, adoptée). Ce
    // n'est pas un conflit: c'est une course, et la relancer est le seul geste
    // qui ne perd rien.
    throw new Error("draft_store: 23505 sans ligne en vol — reessayer");
  }

  if (String(found?.idempotency_key ?? "") === key) {
    log("reused", { userId, draftId: foundId });
    return { id: foundId, reused: true };
  }

  log("conflict", { userId, draftId: foundId });
  return { conflict: { draftId: foundId } };
}

/** La composition démarre. `started_at` est ce que la balayeuse regarde. */
export async function markRunning(
  admin: DraftStoreClient,
  id: string,
  now: Date = new Date(),
): Promise<DraftWriteOutcome> {
  const { error } = await admin
    .from(STUDENT_MEAL_DRAFTS_TABLE)
    .update({ status: "running", started_at: now.toISOString() })
    .eq("id", id);
  if (error) {
    log("mark_running_failed", { draftId: id, error: errorMessageOf(error) });
    return { ok: false, reason: errorMessageOf(error) };
  }
  return { ok: true, reason: null };
}

export interface CompleteDraftArgs {
  /** L'aperçu tel qu'il part à l'écran. */
  readonly response: unknown;
  /** ⚠️ LE `p_payload` EXACT de `write_student_meal_plan`, pas une forme voisine. */
  readonly writePayload: unknown;
  /** Le `GateContext` gelé — sans lui, l'adoption jugerait un autre plan. */
  readonly adoptionContext?: unknown;
  readonly safetyFingerprint?: string | null;
  readonly startsOn?: string | null;
  readonly durationDays?: number | null;
  readonly leadDays?: number | null;
  readonly wallMs?: number | null;
  readonly now?: Date;
}

/**
 * LE BROUILLON EST PRÊT.
 *
 * ⚠️ UN ÉCHEC ICI NE LÈVE PAS ET C'EST DÉLIBÉRÉ: la lane vient de composer, et
 * l'aperçu doit partir à l'écran même si la persistance a raté. Ce qui se perd
 * alors est l'ADOPTION (la ligne restera `running` puis `failed`), et
 * `adoptability` le dira — jamais une écriture silencieuse d'un plan que
 * personne n'a relu.
 */
export async function completeDraft(
  admin: DraftStoreClient,
  id: string,
  args: CompleteDraftArgs,
): Promise<DraftWriteOutcome> {
  const now = args.now ?? new Date();
  const { error } = await admin
    .from(STUDENT_MEAL_DRAFTS_TABLE)
    .update({
      status: "done",
      response: args.response ?? null,
      write_payload: args.writePayload ?? null,
      adoption_context: args.adoptionContext ?? null,
      safety_fingerprint: args.safetyFingerprint ?? null,
      starts_on: args.startsOn ?? null,
      duration_days: args.durationDays ?? null,
      lead_days: args.leadDays ?? null,
      wall_ms: args.wallMs ?? null,
      finished_at: now.toISOString(),
    })
    .eq("id", id);
  if (error) {
    log("complete_failed", { draftId: id, error: errorMessageOf(error) });
    return { ok: false, reason: errorMessageOf(error) };
  }
  return { ok: true, reason: null };
}

export interface FailDraftArgs {
  readonly errorCode: string;
  readonly error?: string | null;
  readonly wallMs?: number | null;
  readonly now?: Date;
}

export async function failDraft(
  admin: DraftStoreClient,
  id: string,
  args: FailDraftArgs,
): Promise<DraftWriteOutcome> {
  const now = args.now ?? new Date();
  const { error } = await admin
    .from(STUDENT_MEAL_DRAFTS_TABLE)
    .update({
      status: "failed",
      error_code: args.errorCode,
      error: args.error ?? null,
      wall_ms: args.wallMs ?? null,
      finished_at: now.toISOString(),
    })
    .eq("id", id);
  if (error) {
    log("fail_failed", { draftId: id, error: errorMessageOf(error) });
    return { ok: false, reason: errorMessageOf(error) };
  }
  return { ok: true, reason: null };
}

/** Tout ce que l'adoption relit. `*`, parce qu'elle relit tout. */
export interface LoadDraftArgs {
  readonly draftId: string;
  readonly userId: string;
}

/**
 * CHARGE LE BROUILLON PAR PROPRIÉTAIRE, jamais par le seul identifiant reçu.
 *
 * ⛔ LES DEUX `.eq` SONT LA GARDE. L'identifiant vient du client; le
 * propriétaire vient du jeton. Sans le second, n'importe qui adopterait le
 * brouillon d'un autre — et ce brouillon porte un plan complet, qui serait
 * écrit sur SA fenêtre.
 */
export async function loadDraftForAdoption(
  admin: DraftStoreClient,
  args: LoadDraftArgs,
): Promise<Record<string, unknown> | null> {
  const draftId = String(args.draftId ?? "").trim();
  const userId = String(args.userId ?? "").trim();
  if (!draftId || !userId) return null;

  const { data, error } = await admin
    .from(STUDENT_MEAL_DRAFTS_TABLE)
    .select("*")
    .eq("id", draftId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    log("load_failed", { draftId, error: errorMessageOf(error) });
    return null;
  }
  return (data as Record<string, unknown> | null) ?? null;
}

/**
 * LA LIGNE EST ÉCRITE, LE BROUILLON EST ADOPTÉ.
 *
 * `adopted_meal_id` est ce qui permet de répondre « ce plan-là vient de CE
 * brouillon » — donc de comparer, plus tard, l'aperçu relu et la ligne écrite.
 * C'est le compteur du défaut de tête de fichier.
 */
export async function markAdopted(
  admin: DraftStoreClient,
  id: string,
  mealId: string,
  now: Date = new Date(),
): Promise<DraftWriteOutcome> {
  const { error } = await admin
    .from(STUDENT_MEAL_DRAFTS_TABLE)
    .update({
      status: "adopted",
      adopted_meal_id: mealId,
      adopted_at: now.toISOString(),
    })
    .eq("id", id);
  if (error) {
    log("mark_adopted_failed", { draftId: id, error: errorMessageOf(error) });
    return { ok: false, reason: errorMessageOf(error) };
  }
  return { ok: true, reason: null };
}
