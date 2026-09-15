/**
 * LE BROUILLON — DEMANDER À VOIR SANS RIEN ÉCRIRE.
 *
 * Contrat: `scratchpad/PLAN-ECRAN-DEMANDE-CONTRAT.md` §4.3.
 * Moitié serveur: `scratchpad/RAPPORT-LOT-C-BACKEND-20260813.md`.
 *
 * ── CE QUE `intent: "draft"` FAIT, ET CE QU'IL NE FAIT PAS ─────────────────
 * TOUTES les gardes amont mordent à l'identique — gel, objectif requis, méthode
 * publiée, fenêtre, chevauchement, plancher TCA, doctrine, règles de maison. Le
 * SEUL saut est l'écriture: `write_student_meal_plan` n'est pas appelée, aucune
 * `member_portions` n'est posée, aucun quota de fusion n'est consommé. Mesuré en
 * réel côté serveur: `select count(*) from student_generated_meals` INCHANGÉ
 * après trois tours de brouillon.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ AUCUNE GARDE N'EST RECOPIÉE ICI, ET C'EST LA RÈGLE DU FICHIER.
 *
 * La phrase écrite sur un brouillon (`draft_note`) est jugée par
 * `_shared/keel/plan_draft_note.ts`, côté serveur, et par lui SEUL. Ce module
 * ne sait pas ce qu'est une cible chiffrée, un interdit de doctrine, un plancher
 * TCA ni une consigne au modèle — et il ne doit pas l'apprendre. Une garde en
 * double est « la cicatrice la plus chère de ce dépôt »: les deux moitiés
 * divergent, et c'est celle qu'on regarde le moins qui décide.
 *
 * Le compteur de signes de `noteLength` est la SEULE exception, et ce n'est pas
 * une garde: il COMPTE, il ne refuse pas. Voir son en-tête.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ AUCUN IMPORT D'i18n. Aucun module de `frontend/src/keel/api/` n'importe
 * `i18n/t`, et c'est ce qui les rend montables des deux côtés d'une couture de
 * namespace (`i18n/pageSeams.int.test.ts`). Les phrases sont à l'écran.
 */

import { supabase } from "../../lib/supabase";
// LOT B — le TYPE seul. La règle du plafond vit côté serveur, et aucune garde
// n'est recopiée ici: c'est la règle de ce fichier.
import { type CookingShape } from "./cookingShape";
import { readEdgeRefusal } from "./edgeErrors";
import {
  type GeneratedMealResult,
  PLAN_CLIENT_TIMEOUT_MS,
  PLAN_LEASE_DEADLINE_MS,
  PLAN_RECOVERY_WAIT_MS,
  readDayProperties,
  readDishes,
  readFixedIntakes,
  readMemberPortions,
  readPlanTiming,
  readPreparations,
  readSessions,
  readShopping,
} from "./mealGeneration";
import { type MealWindowRequest } from "./mealWindow";
// ⟳ 2026-09-12 · ÉTAPE C5 — le MÊME lecteur que la ligne écrite. Deux lecteurs
// du même objet divergeraient au premier champ ajouté, et c'est celui qu'on
// regarde le moins qui garderait l'ancien comportement.
import { readPlanValidation } from "./planValidation";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE PLAFOND DE TOURS, ET IL SE DIT AVANT QU'ON LE HEURTE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Trois COMPOSITIONS par brouillon, l'aperçu initial COMPRIS — donc deux
 * reprises. Ce n'est pas une limite de coût déguisée en règle produit: chaque
 * tour est un appel modèle de 100 à 200 secondes (mesuré: 133,7 s / 100,3 s /
 * 194,3 s en réel), et un champ de commentaire sans plafond invite à négocier
 * avec un plan au lieu de le composer.
 *
 * ⚠️ IL EST AFFICHÉ AVANT LE DERNIER TOUR, JAMAIS DÉCOUVERT EN LE HEURTANT.
 * Un bouton qui se désactive sans prévenir se lit comme une panne, et quelqu'un
 * qui aurait su qu'il lui restait UNE reprise aurait écrit une autre phrase.
 * C'est `draftTurnsLeft` qui porte le chiffre, et l'écran le dit à chaque tour.
 */
export const DRAFT_MAX_TURNS = 3;

/**
 * Combien de compositions il RESTE. Jamais négatif: un compteur qui descend
 * sous zéro ferait afficher « −1 » à quelqu'un.
 *
 * `used` est le nombre de compositions DÉJÀ rendues, aperçu initial compris.
 * REQUIS, et jamais optionnel: `0` par défaut dirait « personne n'a rien
 * composé », ce qui est une AFFIRMATION — et la mauvaise, puisqu'on ne compte
 * qu'après avoir composé au moins une fois.
 */
export function draftTurnsLeft(used: number): number {
  if (!Number.isFinite(used) || used <= 0) return DRAFT_MAX_TURNS;
  return Math.max(0, DRAFT_MAX_TURNS - Math.floor(used));
}

/** Reste-t-il un tour ? Un seul lecteur pour la règle, à un seul endroit. */
export function canRemix(used: number): boolean {
  return draftTurnsLeft(used) > 0;
}

/**
 * LE PLAFOND DE SIGNES, TEL QUE LE SERVEUR LE MESURE.
 *
 * Miroir de `DRAFT_NOTE_MAX_CHARS` (`_shared/keel/plan_draft_note.ts:83`).
 *
 * ⚠️ CE N'EST PAS UNE GARDE, ET L'ÉCRAN NE DOIT PAS S'EN SERVIR POUR BLOQUER.
 * Le serveur reste le SEUL juge: il refuse à 281 signes avec `note_unusable`,
 * en moins d'un dixième de seconde et sans payer d'appel modèle. Ce nombre-ci
 * sert à AFFICHER « il te reste n signes », ce qui évite un aller-retour.
 *
 * ⚠️ ET LES DEUX COMPTES NE SONT PAS IDENTIQUES: le serveur mesure APRÈS repli
 * des blancs, donc il est toujours plus permissif que ce compteur. Bloquer sur
 * ce chiffre refuserait donc localement des phrases que le serveur accepte —
 * exactement la divergence qu'une garde en double produit. D'où: on compte, on
 * prévient, on n'empêche pas.
 */
export const DRAFT_NOTE_MAX_CHARS = 280;

/** Le nombre de signes écrits. Brut: c'est ce que la personne voit à l'écran. */
export function noteLength(raw: string): number {
  return raw.length;
}

/** Le compteur a-t-il dépassé ? Un AVERTISSEMENT d'écran, pas un verdict. */
export function noteOverflows(raw: string): boolean {
  return noteLength(raw) > DRAFT_NOTE_MAX_CHARS;
}

/**
 * A-t-on écrit quelque chose ?
 *
 * Miroir de `hasDraftNote` du serveur, et de lui SEUL: « aucun champ » et
 * « une phrase illisible » ne sont pas la même chose. Le premier ne doit rien
 * refuser, le second doit rendre `note_unusable` — donc une note vide n'est
 * PAS envoyée, et « ... » l'est, pour que le serveur la refuse nommément.
 */
export function hasNote(raw: string): boolean {
  return raw.trim().length > 0;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * L'ENVELOPPE D'UN BROUILLON — CE QUE LE SERVEUR DIT AUTOUR DU PLAN.
 * ══════════════════════════════════════════════════════════════════════════
 */
export interface DraftEnvelope {
  /**
   * LE SERVEUR CONFIRME QU'IL N'A RIEN ÉCRIT.
   *
   * ⚠️ LU, JAMAIS SUPPOSÉ. On a DEMANDÉ `intent: "draft"`, mais c'est la
   * réponse qui dit ce qui s'est passé. Un `false` ici sur une demande
   * d'aperçu veut dire qu'un plan a été écrit — et l'écran doit pouvoir ne pas
   * proposer « adopter » un plan qui existe déjà.
   */
  draft: boolean;
  /**
   * LES PHRASES DE « POURQUOI CES JOURS-LÀ » — assemblées CÔTÉ SERVEUR.
   *
   * ⛔ AUCUN GABARIT CÔTÉ ÉCRAN. Elles arrivent finies, dans la langue du
   * contenu, exactement comme celles de `request_report_gate.ts`. L'écran les
   * AFFICHE; il ne décide ni de leur nombre, ni de leur ordre, ni de leur
   * existence. Vide = il n'y avait rien à expliquer, et ce n'est pas un manque.
   */
  rationale: readonly string[];
  /**
   * POURQUOI IL N'Y A PAS DE PHRASES, quand il n'y en a pas. `null` = il n'y a
   * rien à dire de plus. `guilt_tripping` est un BUG de nos propres gabarits;
   * `nothing_to_explain` est le produit qui fonctionne. Les deux se ressemblent
   * à l'écran et n'appellent pas la même action — d'où un motif nommé.
   */
  rationaleRefusal: string | null;
  /** LE COMPTE RENDU DE LA DEMANDE (FF-061). Mêmes règles que `rationale`. */
  requestReport: readonly string[];
  requestReportRefusal: string | null;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * CE QUE LE PLAN A DÛ PESER — la seule prose du MODÈLE sur ses arbitrages.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ ELLE N'EST PAS DU MÊME AUTEUR QUE `rationale`, ET C'EST TOUT LE SUJET.
   * `rationale` et `requestReport` sont des GABARITS déterministes assemblés
   * par le serveur sur des faits que le code connaît — calendrier, courses,
   * sort des envies. Ces lignes-ci sont écrites par le modèle, sur les choix
   * que LUI a faits en composant: une envie qui tire contre une direction, un
   * plat demandé qui porte un aliment qu'une bouche évite, un plat partagé
   * aligné sur la ligne la plus stricte. Aucun des deux ne peut dire ce que
   * dit l'autre.
   *
   * ⛔ ET ELLES NE REMPLACENT RIEN. Les phrases déterministes sortent comme
   * avant, même quand ce bloc est refusé par sa garde: c'est le PLANCHER, et
   * un plancher ne dépend pas d'un modèle.
   *
   * ⚠️ VIDE EST DEUX CHOSES, et l'écran les rend pareil parce qu'il n'a rien à
   * en faire: « il n'y avait rien à arbitrer » (le cas fréquent, honnête) et
   * « la garde a tout jeté » (`explanationRefusal` le nomme). Le SERVEUR, lui,
   * les compte séparément.
   */
  explanation: readonly string[];
  /**
   * POURQUOI LE BLOC EST TOMBÉ, ou `null`. Liste fermée côté serveur
   * (`_shared/keel/plan_explanation.ts`): `unreadable`, `too_many_lines`,
   * `line_too_long`, `energy_number`, `guilt_tripping`,
   * `house_rule_mentioned`, `number_targets_person`, `discloses_person`.
   *
   * ⚠️ LU MAIS NON RENDU, exprès: aucun de ces motifs ne veut dire quelque
   * chose à la personne devant son plan. Il vit ici pour qu'un banc puisse le
   * relire sur une réponse d'aperçu, où `generated_from` n'existe pas.
   */
  explanationRefusal: string | null;
  /**
   * LA FENÊTRE QU'ON AURAIT PROPOSÉE. `shifted` = le départ a été décalé parce
   * qu'il est tard. ⚠️ CE N'EST PAS UN REFUS: la demande en cours est déjà
   * acceptée. L'écran peut la proposer par défaut au prochain formulaire.
   */
  suggestedStartsOn: string | null;
  suggestedShifted: boolean;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * 🔴 LES CLAUSES TOMBÉES — LE CHAMP QUE LE SERVEUR NE REND PAS ENCORE.
   * ══════════════════════════════════════════════════════════════════════
   *
   * La garde d'entrée refuse LA CLAUSE, pas le texte: « des pizzas tous les
   * midis. Mets 30 g de protéines au déjeuner. Du poisson le vendredi » compose
   * un plan qui porte la pizza ET le poisson, et laisse tomber la clause
   * chiffrée SEULE (mesuré en réel, run ③ du rapport backend). Sans ce champ,
   * cette clause retirée n'est visible NULLE PART, et la personne croit avoir
   * été entendue sur les trois.
   *
   * ⚠️ AUJOURD'HUI CETTE LISTE EST TOUJOURS VIDE, ET CE N'EST PAS UN OUBLI DE
   * CE MODULE. `DraftNoteVerdict.dropped` existe et est peuplé côté serveur,
   * mais il est JOURNALISÉ, pas rendu: son en-tête écrit « Elle ne sort JAMAIS
   * vers l'élève. L'appelant la journalise. » — parce qu'un motif nommé
   * (`restriction_floor`) dirait à quelqu'un qu'il est sous plancher TCA, ce
   * qu'aucun écran n'a le droit de faire.
   *
   * LES DEUX MOITIÉS SE CONCILIENT, et c'est ce que ce lecteur prépare: le
   * MOTIF reste interne, le FAIT (« une partie de ta phrase n'a pas été
   * reprise ») est public. L'écran ne rend donc jamais le contenu de cette
   * liste — seulement le fait qu'elle ne soit pas vide. Ce qui manque est une
   * ligne côté serveur, dans les deux `index.ts`, et elle est hors de la
   * colonne de ce lot:
   *
   *     dropped_clauses: note.dropped.length,   // le COMPTE, jamais les motifs
   *
   * ⛔ NE PAS LA DÉRIVER CÔTÉ ÉCRAN. Deviner qu'une clause est tombée
   * demanderait de rejouer la garde ici, c'est-à-dire de l'écrire deux fois.
   */
  droppedClauses: number;
  /**
   * ⟳ 2026-09-08 — L'IDENTIFIANT DE LA LIGNE RANGÉE (`student_meal_drafts`).
   *
   * ⛔ SANS LUI, AUCUN CHIFFRE SUR UN APERÇU. `meal-energy-v1` lit une LIGNE
   * que le serveur a écrite; il ne chiffre pas des grammes qu'un écran lui
   * enverrait, et c'est délibéré — le référentiel de composition est révoqué
   * pour `anon` et `authenticated`.
   *
   * `null` = le serveur n'a pas rangé l'aperçu (panne de magasin, ou version
   * antérieure au 2026-09-08). L'écran montre alors le plan sans ses chiffres,
   * ce qui est le comportement d'hier.
   */
  draftId: string | null;
  /**
   * ⟳ 2026-09-09 — CE QU'UNE REPRISE LOCALE A PRIS ET LAISSÉ. `null` sur une
   * composition : « pas une reprise » n'est pas « rien pris ».
   */
  edit: DraftEdit | null;
}

/** L'issue d'une note lue par `keel-read-note-v1`. */
export interface NoteOutcome {
  ok: boolean;
  reason: string;
  announced: ReadonlyArray<{ text: string; who: string | null; kind: string }>;
  /** Combien d'entrées le modèle a proposées, et combien ont été gardées. */
  proposed: number;
  kept: number;
  /** Une part dont on ne sait pas la bouche: refusée, jamais devinée. */
  whoUnknown: number;
  /**
   * ⟳ 2026-09-08 — DEUX ISSUES QUI NE SONT NI « RIEN » NI UN ÉCHEC, mesurées
   * au banc de phrases. `atEdge`: compris, mais déjà au bout de l'échelle
   * (« trop compliqué » sur un style déjà minimal). `skipped`: lu et
   * volontairement pas rangé (les jours de cuisine, un objectif de poids, un
   * merci).
   */
  atEdge: number;
  skipped: number;
  /**
   * ⟳ 2026-09-08 (lot 4) — CE QUE LE SERVEUR DEMANDE AVANT D'ÉCRIRE. Une part
   * dont il ne sait pas la bouche: rien n'a été écrit pour elle, et rien ne
   * le sera sans réponse (`answerNote`). Le dialogue la pose SOUS LE CHAMP,
   * avec un bouton par bouche — et ne compose pas tant qu'elle est ouverte:
   * composer avant la réponse ferait un plan pour la mauvaise assiette.
   */
  questions: ReadonlyArray<NoteQuestion>;
  /**
   * ⟳ 2026-09-09 (chirurgie locale, pièce 4) — LES CASES DE CE PLAN-CI que la
   * phrase désigne (jour ET moment). Rien n'a été écrit pour elles : le
   * dialogue les donne au composeur par `editCells`, qui ne refait que ces
   * cases et garde le reste. Mesuré : une recomposition ne garde RIEN (0 plat
   * commun sur 6 entre deux runs identiques).
   */
  cells: ReadonlyArray<NoteCell>;
}

export interface NoteCell {
  day: string;
  slot: string;
  text: string;
}

/** Ce qu'une reprise locale a pris et laissé — `DraftEnvelope.edit`. */
export interface DraftEdit {
  /** Les cases refaites, `day/slot`. */
  taken: ReadonlyArray<string>;
  notRendered: ReadonlyArray<string>;
  unknown: ReadonlyArray<string>;
  /** Les plats du plan de départ gardés tels quels. */
  untouched: number;
}

export interface NoteQuestion {
  kind: "portion";
  /** Le morceau de phrase sur lequel le serveur a buté — cité, jamais la note entière. */
  text: string;
  direction: "down" | "up";
  options: ReadonlyArray<{ memberId: string; label: string }>;
}

/** Un tap sur une question: la bouche choisie, et le sens déjà lu. */
export interface NoteAnswer {
  kind: "portion";
  memberId: string;
  direction: "down" | "up";
}

/** Un brouillon: le plan tel qu'il serait, et ce que le serveur en dit. */
export interface PlanDraft {
  plan: GeneratedMealResult;
  envelope: DraftEnvelope;
}

export type RecoverablePlanDraft =
  | { state: "done"; draft: PlanDraft }
  | { state: "in_flight"; draftId: string }
  | null;

type DraftRecovery =
  | { kind: "done"; response: Record<string, unknown> }
  | { kind: "written"; mealId: string }
  | { kind: "in_flight" }
  /**
   * ⟳ 2026-09-15 · BÊTA 2C — LE TRAVAIL EST MORT, ET ON LE DIT. Au-delà de
   * `PLAN_LEASE_DEADLINE_MS`, le worker n'existe plus: son bail est balayé à la
   * prochaine prise et personne n'écrira. C'est terminal, comme `failed`.
   */
  | { kind: "expired" }
  | { kind: "failed"; errorCode: string }
  | { kind: "unavailable" };

/** Une ligne en vol dont l'âge dépasse l'échéance n'a plus d'écrivain. */
function outOfLease(startedAt: unknown): boolean {
  const started = Date.parse(String(startedAt ?? ""));
  // ⚠️ Une date ILLISIBLE ne périme pas: c'est un défaut de lecture, pas une
  // échéance — même règle qu'`adoptability` côté serveur.
  if (!Number.isFinite(started)) return false;
  return Date.now() - started > PLAN_LEASE_DEADLINE_MS;
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/**
 * Relit l'issue durable d'une requête dont le transport s'est interrompu.
 * `unavailable` reste distinct de `in_flight`: sans ligne effectivement lue,
 * l'écran n'a pas le droit d'affirmer que le serveur travaille encore.
 */
async function recoverRequest(requestId: string): Promise<DraftRecovery> {
  const { data: meal } = await supabase
    .from("student_generated_meals")
    .select("id")
    .filter("generated_from->>request_id", "eq", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const mealId = String((meal as { id?: unknown } | null)?.id ?? "").trim();
  if (mealId) return { kind: "written", mealId };

  const { data, error } = await supabase
    .from("student_meal_drafts")
    .select("id,status,response,error_code,expires_at,adopted_meal_id,created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!error && data) {
    const row = data as Record<string, unknown>;
    const expires = Date.parse(String(row.expires_at ?? ""));
    const status = String(row.status ?? "");
    const adopted = String(row.adopted_meal_id ?? "").trim();
    if (status === "adopted" && adopted) return { kind: "written", mealId: adopted };
    if (Number.isFinite(expires) && expires <= Date.now()) {
      return { kind: "unavailable" };
    }
    if ((status === "done" || status === "adopted") && row.response &&
      typeof row.response === "object" && !Array.isArray(row.response)) {
      return { kind: "done", response: row.response as Record<string, unknown> };
    }
    if (status === "pending" || status === "running") {
      return outOfLease(row.created_at) ? { kind: "expired" } : { kind: "in_flight" };
    }
    if (status === "failed") {
      const errorCode = String(row.error_code ?? "").trim();
      return { kind: "failed", errorCode: errorCode || "composition_unavailable" };
    }
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "keel_household_request_status",
    { p_request: requestId },
  );
  if (!rpcError) {
    const status = asRecord(rpcData);
    const kind = String(status?.kind ?? "");
    if (kind === "written") {
      const id = String(status?.meal_id ?? "").trim();
      if (id) return { kind: "written", mealId: id };
    }
    if (kind === "in_flight") return { kind: "in_flight" };
    if (kind === "expired") return { kind: "expired" };
    if (kind === "failed") {
      const errorCode = String(status?.error_code ?? "").trim();
      return { kind: "failed", errorCode: errorCode || "composition_unavailable" };
    }
    if (kind === "done") {
      const { data: again } = await supabase
        .from("student_meal_drafts")
        .select("response")
        .eq("request_id", requestId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const response = (again as { response?: unknown } | null)?.response;
      if (response && typeof response === "object" && !Array.isArray(response)) {
        return { kind: "done", response: response as Record<string, unknown> };
      }
    }
  }
  return { kind: "unavailable" };
}

async function awaitDurableRequest(requestId: string): Promise<DraftRecovery> {
  const until = Date.now() + PLAN_RECOVERY_WAIT_MS;
  let recovered = await recoverRequest(requestId);
  while (recovered.kind === "in_flight" && Date.now() < until) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 2_000));
    recovered = await recoverRequest(requestId);
  }
  return recovered;
}

function planDraftFromResponse(response: Record<string, unknown>): PlanDraft {
  return {
    plan: { ...readDraftPlan(response), planKind: "household" },
    envelope: readDraftEnvelope(response),
  };
}

function recoverableRow(raw: unknown): RecoverablePlanDraft {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const status = String(row.status ?? "");
  if ((status === "pending" || status === "running") && id) {
    // ⟳ 2026-09-15 — UN RECHARGEMENT NE ROUVRE PAS UNE ATTENTE MORTE. Sans ce
    // filtre, chaque visite relançait 235 s de poll sur un brouillon dont le
    // worker était parti depuis des heures.
    if (outOfLease(row.created_at)) return null;
    return { state: "in_flight", draftId: id };
  }
  if (status === "done" && row.response && typeof row.response === "object" &&
    !Array.isArray(row.response)) {
    return { state: "done", draft: planDraftFromResponse(row.response as Record<string, unknown>) };
  }
  return null;
}

/** Reprend, après rechargement, le dernier brouillon encore valable du compte. */
export async function recoverLatestDraft(): Promise<RecoverablePlanDraft> {
  const { data, error } = await supabase
    .from("student_meal_drafts")
    .select("id,status,response,error_code,expires_at,created_at")
    .in("status", ["pending", "running", "done"])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("composition_unavailable");
  return recoverableRow(data);
}

/** Attend la ligne déjà en vol; cette boucle ne déclenche aucune génération. */
export async function waitForDraft(
  draftId: string,
  timeoutMs = PLAN_RECOVERY_WAIT_MS,
): Promise<PlanDraft> {
  const deadline = Date.now() + timeoutMs;
  do {
    const { data, error } = await supabase
      .from("student_meal_drafts")
      .select("id,status,response,error_code,expires_at,created_at")
      .eq("id", draftId)
      .maybeSingle();
    if (error || !data) throw new Error("composition_unavailable");
    const row = data as Record<string, unknown>;
    const state = recoverableRow(row);
    if (state?.state === "done") return state.draft;
    if (String(row.status ?? "") === "failed") {
      const code = String(row.error_code ?? "").trim();
      throw new Error(code || "composition_unavailable");
    }
    // ⛔ ET SURTOUT PAS ATTENDRE JUSQU'AU BOUT: `recoverableRow` a déjà rendu
    // `null` sur une ligne périmée, donc la boucle tournerait 235 s pour finir
    // sur `plan_still_composing` — la phrase exactement fausse.
    if (
      (String(row.status ?? "") === "pending" ||
        String(row.status ?? "") === "running") && outOfLease(row.created_at)
    ) {
      throw new Error("plan_expired");
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 2_000));
  } while (Date.now() < deadline);
  throw new Error("plan_still_composing");
}

/**
 * LES LIGNES D'UN BLOC `{ lines, refusal }`. Défensif dans une seule
 * direction, comme tous les lecteurs de ce dépôt: ce qu'on ne sait pas lire
 * tombe SEUL, et les phrases vides ne s'affichent pas comme des puces vides.
 */
function readLines(raw: unknown): { lines: string[]; refusal: string | null } {
  const block = (raw ?? {}) as Record<string, unknown>;
  const lines = Array.isArray(block.lines)
    ? block.lines.map((l) => String(l ?? "").trim()).filter((l) => l !== "")
    : [];
  const refusal = typeof block.refusal === "string" && block.refusal.trim() !== ""
    ? block.refusal.trim()
    : null;
  return { lines, refusal };
}

/**
 * L'ENVELOPPE, LUE D'UN PAYLOAD BRUT. PURE — c'est ce qui la rend testable
 * sans pile, et c'est là que vivent les décisions de lecture.
 */
/** `edit`, lu s'il arrive ; absent ou illisible ⇒ `null` (pas une reprise). */
function readDraftEdit(raw: unknown): DraftEdit | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const list = (v: unknown) => Array.isArray(v) ? v.map((x) => String(x ?? "")).filter((x) => x !== "") : [];
  return {
    taken: list(e.taken),
    notRendered: list(e.not_rendered),
    unknown: list(e.unknown),
    untouched: Number(e.untouched_dishes) || 0,
  };
}

export function readDraftEnvelope(raw: unknown): DraftEnvelope {
  const payload = (raw ?? {}) as Record<string, unknown>;
  const rationale = readLines(payload.rationale);
  const report = readLines(payload.request_report);
  // ⚠️ MÊME LECTEUR QUE LES DEUX AUTRES, et la même enveloppe `{lines, refusal}`:
  // une troisième forme de payload pour un troisième bloc de texte finirait par
  // diverger sur la seule chose qui compte — ce qui s'affiche quand c'est vide.
  const explanation = readLines(payload.explanation);
  const suggested = (payload.suggested_window ?? {}) as Record<string, unknown>;
  const startsOn = String(suggested.starts_on ?? "").trim();
  // `dropped_clauses` est lu S'IL ARRIVE. Un `Number(undefined)` vaut `NaN`, et
  // un `NaN` comparé à `> 0` est `false`: l'absence se lit donc « rien n'est
  // tombé », qui est la direction sûre — on ne montre pas un avertissement à
  // quelqu'un dont la phrase est passée entière.
  const dropped = Number(payload.dropped_clauses);
  return {
    draft: payload.draft === true,
    edit: readDraftEdit(payload.edit),
    rationale: rationale.lines,
    rationaleRefusal: rationale.refusal,
    requestReport: report.lines,
    requestReportRefusal: report.refusal,
    explanation: explanation.lines,
    explanationRefusal: explanation.refusal,
    suggestedStartsOn: startsOn === "" ? null : startsOn,
    // ══════════════════════════════════════════════════════════════════════
    // ⛔ `=== true` ÉTAIT TOUJOURS FAUX — corrigé le 2026-08-23.
    // ══════════════════════════════════════════════════════════════════════
    //
    // Le serveur n'envoie PAS un booléen. `suggested_window.shifted` porte un
    // MOTIF, `WindowShiftReason | null` = `"shopping_cutoff" | null`
    // (`_shared/keel/plan_hours.ts`), recopié tel quel par les deux lanes
    // (`generate-meal-v1/index.ts:1435-1438`,
    // `generate-household-meal-v1/index.ts:3094-3097`). Comparer une chaîne à
    // `true` rendait donc `false` sur 10 plans réels sur 10 (mesuré le
    // 2026-08-23), y compris les dix où le serveur DISAIT qu'il est trop tard
    // pour faire les courses.
    //
    // ⚠️ ET LE TEST NE POUVAIT PAS LE VOIR: sa fixture écrivait `shifted: true`
    // (`planDraft.int.test.ts`), une charge que le serveur n'a jamais produite.
    // Un test qui invente son entrée valide l'invention, pas le produit — la
    // fixture est corrigée dans le même lot.
    //
    // ⚠️ ON LIT LA PRÉSENCE D'UN MOTIF, PAS SA VALEUR. `shopping_cutoff` est
    // aujourd'hui le seul motif; en tester le contenu ici ferait de ce lecteur
    // le second endroit qui connaît la liste, et c'est le serveur qui la tient.
    suggestedShifted: typeof suggested.shifted === "string" &&
      suggested.shifted.trim() !== "",
    droppedClauses: Number.isFinite(dropped) && dropped > 0 ? Math.floor(dropped) : 0,
    // ⟳ 2026-09-08 — L'IDENTIFIANT DE LA LIGNE RANGÉE. Lu S'IL ARRIVE: une
    // réponse d'avant ce lot n'en porte pas, et l'aperçu s'affiche alors sans
    // ses chiffres — le comportement d'hier, jamais une erreur.
    draftId: typeof payload.draft_id === "string" && payload.draft_id.trim() !== ""
      ? payload.draft_id.trim()
      : null,
  };
}

/**
 * LE PLAN D'UN PAYLOAD DE BROUILLON. PURE.
 *
 * ⚠️ LES NORMALISEURS SONT CEUX DE `mealGeneration.ts`, PAS DES COPIES. Le
 * brouillon reçoit EXACTEMENT le même payload qu'un plan écrit et il se monte
 * dans le MÊME `PlanResult`: deux normaliseurs du même JSON divergent au
 * premier champ ajouté (`uses` est arrivé après des compositions déjà en base),
 * et c'est le lecteur qu'on regarde le moins qui garde l'ancien comportement.
 */
export function readDraftPlan(raw: unknown): GeneratedMealResult {
  const payload = (raw ?? {}) as Record<string, unknown>;
  const window = (payload.window ?? {}) as Record<string, unknown>;
  return {
    // ⚠️ TOUJOURS `null`, ET C'EST LE POINT. Le serveur rend `meal: null` sur un
    // aperçu, exprès: « un id inventé serait la première chose qu'un lecteur
    // prendrait pour une ligne réelle ». On ne fabrique donc rien ici non plus.
    mealId: null,
    dishes: readDishes(payload.dishes),
    preparations: readPreparations(payload.preparations),
    cookingSessions: readSessions(payload.cooking_sessions),
    // ⚠️ CETTE LIGNE A ÉTÉ `[]` EN DUR, ET SON COMMENTAIRE A SURVÉCU À SA
    // CAUSE. Il disait « le brouillon ne montre pas de courses: `PlanResult`
    // n'en rend pas » — vrai jusqu'au LOT 1, faux depuis: `PlanResult` rend
    // désormais LA VAGUE DU JOUR dans chaque bloc de jour, et
    // `PlanDraftDialog` lui passe `draft.shoppingList`. Vidée ici, cette prop
    // requise redevenait une garde désarmée: la carte « les courses du jour »
    // ne pouvait structurellement PAS apparaître à l'aperçu, alors qu'elle
    // apparaît sur le plan adopté — et l'aperçu doit montrer ce qu'adopter
    // donnerait (C8: les deux surfaces, un seul corps de plan).
    // Le serveur REND bien `shopping_list` sur `intent: "draft"`
    // (`generate-household-meal-v1/index.ts:3805`, dans la branche `isDraft`);
    // c'est le lecteur qui la jetait.
    shoppingList: readShopping(payload.shopping_list),
    // ⚠️ LOT 3 — MÊME LEÇON QUE LA LIGNE AU-DESSUS, SUR UN AUTRE CHAMP. Le
    // serveur REND `member_portions` sur `intent: "draft"`
    // (`generate-household-meal-v1/index.ts:3806`, dans la branche `isDraft`)
    // alors qu'il n'en ÉCRIT aucune. Sans cette lecture, l'aperçu ne pourrait
    // structurellement pas nommer les bouches d'un plat dédié ni poser les
    // parts sous un plat commun, alors que le plan adopté le fait — C8: les
    // deux surfaces, un seul corps de plan.
    // La lane individuelle n'en rend aucune: `[]`, et l'aperçu se tait.
    memberPortions: readMemberPortions(payload.member_portions),
    fixedIntakes: readFixedIntakes(payload.fixed_intakes),
    dayProperties: readDayProperties(payload.day_properties),
    // ⟳ A1 — MÊME LEÇON QUE `shoppingList` ET `memberPortions` CI-DESSUS, sur
    // un champ neuf: le serveur rend `timing` À LA RACINE sur `intent:
    // "draft"` comme sur un plan écrit. Le jeter ici ferait un aperçu muet sur
    // le fait le plus visible du plan — sa fenêtre a reculé d'un jour — alors
    // que le plan adopté le dit (C8: les deux surfaces, un seul corps de plan).
    timing: readPlanTiming(payload.timing),
    // ⟳ 2026-09-12 · ÉTAPE C5 — MÊME LEÇON QUE `timing` JUSTE AU-DESSUS. Le
    // serveur rend `validation` À LA RACINE sur `intent: "draft"` comme sur un
    // plan écrit, et c'est le MÊME objet que `generated_from.validation` de la
    // ligne. Le jeter ici ferait un aperçu qui se tait sur ses écarts pendant
    // que le plan adopté les dit — C8: les deux surfaces, un seul corps de plan.
    validation: readPlanValidation(payload.validation),
    context: null,
    preferences: null,
    createdAt: null,
    startsOn: String(window.starts_on ?? ""),
    durationDays: Number(window.duration_days) || 7,
    // La NATURE vient de la lane appelée, pas d'un champ: la réponse ne la rend
    // pas, et la deviner d'un champ absent la rendrait `undefined`.
    planKind: payload.plan_kind === "household" ? "household" : "personal",
    // Un aperçu n'est jamais validé: il n'existe pas.
    validatedAt: null,
  };
}

export interface ComposeDraftInput {
  /**
   * ⟳ 2026-09-10 · LOT 7 — `lane` A DISPARU DE CETTE INTERFACE.
   *
   * ⛔ Elle disait sur quel moteur composer, et il n'y en a plus qu'un:
   * `generate-household-meal-v1`. Le champ est retiré plutôt que figé à
   * `"household"` parce qu'un champ à valeur unique se relit comme un choix —
   * et le premier qui le relira essaiera de le rendre configurable.
   *
   * ⛔ ET LES QUATRE CHAMPS DE L'ANCIENNE LANE INDIVIDUELLE PARTENT AVEC
   * ELLE — `mode`, `slot`, `servings`, `pantry`. Ce n'est pas une perte de
   * fonctionnalité: VÉRIFIÉ le 2026-09-10, les trois sites de montage
   * (`SetupPage`, `StudentWeekPlanPage`, `MealBuilder`) les posaient tous les
   * trois en CONSTANTES (`"to_shop"`, `null`, `1`, `[]`) depuis que leurs
   * questions ont été retirées de l'écran. Aucun écran n'avait plus de quoi
   * les remplir; les garder aurait envoyé quatre champs inertes que le
   * serveur ne lit pas — la forme exacte du « champ visible qui ne va nulle
   * part », en pire, parce qu'invisible.
   */
  window: MealWindowRequest;
  // ⛔ PAS DE `note` ICI (lot 4, 2026-09-08). La phrase ne voyage plus dans
  // le corps de composition: elle est lue par `readNote` (et répondue par
  // `answerNote`) depuis le dialogue, et le composeur relit le magasin qui
  // porte déjà son effet. La remettre ici la ferait relire à l'adoption —
  // et un cran d'appétit relu est un cran appliqué deux fois.
  /**
   * ── LOT B · LE MODE DE CUISSON DEMANDÉ ──────────────────────────────────
   * `null` = rien n'est demandé, et le calcul du moteur gouverne seul.
   *
   * ⚠️ REQUIS ET NULLABLE, jamais optionnel. Ce dépôt a déjà payé sept fois
   * « paramètre de garde optionnel = garde désarmée »: un `?` ici aurait fait
   * passer les trois sites de montage sans un mot du compilateur, et le champ
   * de l'écran serait parti nulle part.
   *
   * ⚠️ IGNORÉ SUR LA LANE INDIVIDUELLE, qui n'a jamais eu la question.
   */
  cookingShape: CookingShape | null;
  /**
   * « TOUT DANS UNE SESSION DE CUISINE » — 2026-09-01.
   *
   * ⚠️ REQUIS, jamais `?`. Un champ facultatif ici n'aurait fait remonter AUCUN
   * appelant au compilateur, et l'option se serait construite sans être
   * branchée — c'est la forme exacte de « paramètre de garde optionnel = garde
   * désarmée », payée sept fois par ce dépôt.
   *
   * ⛔ LE SERVEUR LE REFUSE SANS CONGÉLATEUR DÉCLARÉ, et il le DIT
   * (`plan_rationale`). L'écran pose la même porte pour ne pas PROPOSER un
   * geste qui sera refusé; ce n'est pas une garde en double — le corps de la
   * requête est écrit par le réseau, pas par l'écran.
   */
  oneCookingSession: boolean;
  // ⟳ A1 (2026-09-03) — `cookTheDayBefore` A ÉTÉ RETIRÉ D'ICI, ET DU CORPS.
  // La veille n'est plus une case: `generate-meal-v1` et
  // `generate-household-meal-v1` la DÉRIVENT (`leadDayFor`) de la date de
  // départ et de l'heure locale, coupure à 18 h. Le navigateur ne connaît pas
  // l'heure (`local_date.ts` refuse tout repli UTC) — il ne peut donc pas
  // reproduire ce verdict, et il ne doit pas essayer. Ce que le serveur rend en
  // échange est `timing` (`{kind, reason, lead_day}`), que l'écran RÉPÈTE.
  /**
   * CE QUI SE PASSE CETTE SEMAINE — prose libre, lue par le serveur
   * (`String(body.context …)`). `null` = rien à dire.
   */
  context: string | null;
  /**
   * L'ENVIE DU MOMENT — prose libre. `generate-household-meal-v1` la relit à
   * TROIS endroits (la consigne `:3582`, le compte-rendu de la demande `:4569`,
   * la colonne écrite du plan `:4976`), et c'est MESURÉ: un commentaire de ce
   * fichier a longtemps affirmé le contraire, et l'affirmation avait survécu à
   * la lecture qu'elle déclarait impossible.
   */
  preferences: string | null;
}

/**
 * DEMANDE UN APERÇU. RIEN N'EST ÉCRIT.
 *
 * Le JWT décide de qui il s'agit: aucun `user_id` n'est envoyé, et le moteur
 * n'en accepterait pas.
 *
 * ── LES REFUS REMONTENT NOMMÉS ────────────────────────────────────────────
 * `note_unusable` (400, la phrase est inexploitable) et `draft_not_composed`
 * (l'aperçu n'a pas abouti) sont des motifs NOMMÉS, traduits par
 * `copy/planRefusals.ts`. Les aplatir en « une erreur est survenue » ferait
 * perdre la seule information utile — et `note_unusable` est le seul refus que
 * la personne peut réparer elle-même, en reformulant.
 *
 * ⚠️ LE MOTIF SORT SOUS LA FORME « jeton: détail », comme `generateMeal`:
 * l'appelant découpe sur le premier `:` et traduit le jeton. Ne pas inventer
 * une seconde convention pour un seul appelant.
 */
/**
 * LIRE LA NOTE, AVANT DE COMPOSER — `keel-read-note-v1` (2026-09-08).
 *
 * ⛔ C'EST LE GESTE QUI SORT LA PHRASE DU COMPOSEUR. Jusqu'ici `draft_note`
 * partait dans le corps de la composition, et le modèle qui compose la lisait
 * brute — c'est ce qui a produit le plan « en vrille » (les grammes des boîtes
 * sortis dans les phrases). Maintenant: on lit la phrase (~4 s), on l'applique
 * — goûts, appétit d'une bouche, réglages de cuisine — on répond ce qu'on a
 * fait, PUIS on compose sans elle. Le composeur relit le magasin, qui porte
 * déjà l'effet: c'est la recomposition immédiate.
 *
 * ⚠️ DEUX APPELS PARCE QUE C'EST UNE HORLOGE: un plan à quatre bouches met
 * 180–280 s et la passerelle coupe à 150 s. Lire la phrase dans le même appel
 * n'aurait fait qu'ajouter au dépassement.
 *
 * ⛔ UN REFUS DE LA NOTE (`note_unusable`) LÈVE, comme avant: c'est le seul
 * refus que la personne répare elle-même, et le dialogue le rend sous le champ.
 * Le reste (« rien à changer », « je n'ai pas compris de qui ») ne lève pas:
 * ce sont des issues, rendues avec l'aperçu.
 */
/**
 * UN ÉCHEC DE TRANSPORT DEVIENT UN JETON, JAMAIS UNE PHRASE DE BIBLIOTHÈQUE.
 *
 * ⛔ MESURÉ LE 2026-09-14, SUR L'ÉCRAN RÉEL. Le repli de ces trois appels
 * s'écrivait `[keel/planDraft] ${error.message}`, et une adoption dont le
 * délai client a expiré rendait, en toutes lettres, au pied du dialogue:
 *
 *     [keel/planDraft] Failed to send a request to the Edge Function
 *
 * Deux interdits d'un coup: le nom de code INTERNE sur une surface lue par une
 * personne, et la chaîne brute anglaise d'une bibliothèque comme seule sortie
 * d'une panne ordinaire. `planRefusals.ts` fait correspondre des JETONS — une
 * phrase libre n'en est pas un, donc elle n'avait aucune traduction et l'écran
 * rendait ce qu'il pouvait.
 *
 * ⚠️ LE DÉTAIL SURVIT, DERRIÈRE LE `:`. Même forme que les refus nommés
 * (`jeton: détail`): l'appelant coupe au premier `:` pour traduire, et le
 * reste part au journal du navigateur. Ce qui ne doit pas sortir, c'est qu'il
 * atteigne l'ÉCRAN.
 */
function refusalOf(error: unknown, fallback: string): Promise<string> {
  return readEdgeRefusal(error).then((refusal) => {
    if (refusal) {
      return refusal.detail ? `${refusal.token}: ${refusal.detail}` : refusal.token;
    }
    const detail = error instanceof Error ? error.message : String(error);
    return `${fallback}: ${detail}`;
  });
}

export async function readNote(
  note: string,
  window: MealWindowRequest,
): Promise<NoteOutcome> {
  const startsOn = window.kind === "exact" ? window.startsOn : null;
  const { data, error } = await supabase.functions.invoke("keel-read-note-v1", {
    body: {
      draft_note: note,
      today: localTodayIso(),
      ...(startsOn ? { starts_on: startsOn } : {}),
    },
  });
  if (error) {
    throw new Error(await refusalOf(error, "composition_unavailable"));
  }
  const raw = (data ?? {}) as Record<string, unknown>;
  const reason = String(raw.reason ?? "");
  if (raw.ok !== true && reason === "note_unusable") {
    throw new Error("note_unusable");
  }
  return readNoteOutcome(raw);
}

/**
 * ⟳ 2026-09-08 (lot 4) — RÉPONDRE À « C'EST POUR QUI ? ». Même fonction edge,
 * sans `draft_note` et sans appel modèle: la phrase a déjà été lue, il ne
 * manquait que la bouche. Rend la même issue que `readNote`, donc les mêmes
 * lignes sous le champ.
 */
export async function answerNote(answer: NoteAnswer): Promise<NoteOutcome> {
  const { data, error } = await supabase.functions.invoke("keel-read-note-v1", {
    body: {
      answer: { kind: answer.kind, member_id: answer.memberId, direction: answer.direction },
    },
  });
  if (error) {
    throw new Error(await refusalOf(error, "composition_unavailable"));
  }
  return readNoteOutcome((data ?? {}) as Record<string, unknown>);
}

/**
 * L'ISSUE, LUE D'UN PAYLOAD BRUT — UN SEUL LECTEUR pour la lecture et la
 * réponse. Défensif dans une seule direction: ce qu'on ne sait pas lire tombe
 * SEUL (une option sans prénom, une question sans option), jamais la réponse
 * entière.
 */
function readNoteOutcome(raw: Record<string, unknown>): NoteOutcome {
  const reason = String(raw.reason ?? "");
  const counters = (raw.counters ?? {}) as Record<string, unknown>;
  const announced = Array.isArray(raw.announced)
    ? raw.announced.map((a) => {
      const row = (a ?? {}) as Record<string, unknown>;
      return {
        text: String(row.text ?? ""),
        who: row.who === null || row.who === undefined ? null : String(row.who),
        kind: String(row.kind ?? ""),
      };
    }).filter((a) => a.text !== "")
    : [];
  const questions: NoteQuestion[] = [];
  for (const q of Array.isArray(raw.questions) ? raw.questions : []) {
    const row = (q ?? {}) as Record<string, unknown>;
    const direction = String(row.direction ?? "");
    const text = String(row.text ?? "").trim();
    if (row.kind !== "portion" || (direction !== "down" && direction !== "up") || !text) continue;
    const options = (Array.isArray(row.options) ? row.options : [])
      .map((o) => {
        const opt = (o ?? {}) as Record<string, unknown>;
        return { memberId: String(opt.memberId ?? "").trim(), label: String(opt.label ?? "").trim() };
      })
      .filter((o) => o.memberId !== "" && o.label !== "");
    if (options.length === 0) continue;
    questions.push({ kind: "portion", text, direction, options });
  }
  const cells: NoteCell[] = [];
  for (const c of Array.isArray(raw.cells) ? raw.cells : []) {
    const row = (c ?? {}) as Record<string, unknown>;
    const day = String(row.day ?? "").trim();
    const slot = String(row.slot ?? "").trim();
    const text = String(row.text ?? "").trim();
    if (!day || !slot || !text) continue;
    cells.push({ day, slot, text });
  }
  return {
    ok: raw.ok === true,
    reason,
    announced,
    proposed: Number(counters.proposed) || 0,
    kept: Number(counters.kept) || 0,
    whoUnknown: Number(counters.portions_refused_unknown_member) || 0,
    atEdge: Number(counters.at_edge) || 0,
    skipped: Number(counters.skipped) || 0,
    questions,
    cells,
  };
}

/** Le jour LOCAL de la personne, `YYYY-MM-DD` — celui que le serveur ancre. */
function localTodayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export async function composeDraft(input: ComposeDraftInput): Promise<PlanDraft> {
  // ⛔ AUCUNE NOTE ICI, NI DANS LE CORPS NI AVANT (lot 4). La phrase est lue
  // par `readNote` depuis le DIALOGUE, qui attend la réponse à une éventuelle
  // question avant d'appeler ceci. Lire ici « au cas où » a déjà coûté un
  // double cran: la reprise lisait, puis l'adoption relisait la même phrase.
  const payload = await callGenerator(input, "draft");
  return {
    plan: {
      ...readDraftPlan(payload),
      // ⟳ 2026-09-10 · LOT 7 — TOUJOURS `household`, ET CE N'EST PAS UNE
      // CONSTANTE PARESSEUSE: c'est la nature de la LANE APPELÉE, et il n'y en
      // a plus qu'une. La réponse ne porte pas ce champ de façon fiable
      // (`readDraftPlan` le lisait de `plan_kind`, absent sur un aperçu), et le
      // déduire d'un champ absent le rendrait `undefined`.
      //
      // ⚠️ CE CHAMP NE REQUALIFIE AUCUN PLAN DÉJÀ ÉCRIT. Les plans personnels
      // d'avant ce lot gardent `plan_kind = 'personal'` en base et se lisent
      // tels quels; c'est ici la nature de ce qu'on vient de COMPOSER.
      planKind: "household" as const,
    },
    envelope: readDraftEnvelope(payload),
  };
}

/**
 * ⟳ 2026-09-09 — LA REPRISE LOCALE : une case refaite, le reste intact.
 *
 * `operation: "edit_cells"` sur le brouillon `draftId`, avec les cases que la
 * phrase désigne. Le serveur donne le plan entier au modèle, ne prend de sa
 * réponse que ces cases, recopie le reste depuis le plan de départ, rejoue ses
 * ceintures, et range un nouveau brouillon. `envelope.edit` dit ce qui a été
 * pris et laissé.
 *
 * ⟳ 2026-09-10 · LOT 7 — LE REPLI « RECOMPOSE TOUT » A DISPARU. Il existait
 * pour la lane individuelle, qui n'avait pas `edit_cells`; il n'y a plus de
 * lane individuelle. Le garder aurait laissé un chemin par lequel une reprise
 * locale se transforme en recomposition COMPLÈTE sans que rien ne le dise —
 * `edit` serait `null`, le dialogue dirait « refait », et personne ne saurait
 * pourquoi les autres cases ont bougé.
 *
 * ⛔ UN REFUS LÈVE (`cell_not_rendered`, `cell_unknown`, `draft_has_no_source`,
 * `draft_mismatch`…) et l'aperçu courant reste : rien n'a été composé à la
 * place.
 */
export async function editCells(
  input: ComposeDraftInput,
  draftId: string,
  cells: ReadonlyArray<NoteCell>,
): Promise<PlanDraft> {
  const payload = await callGenerator(input, "draft", null, {
    operation: "edit_cells",
    draft_id: draftId,
    cells: cells.map((c) => ({ day: c.day, slot: c.slot, text: c.text })),
  });
  return {
    plan: { ...readDraftPlan(payload), planKind: "household" },
    envelope: readDraftEnvelope(payload),
  };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ADOPTER — ÉCRIRE EXACTEMENT LE BROUILLON RELU.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le navigateur ne transmet que l'identifiant opaque. Le serveur relit le
 * `write_payload`, revalide l'empreinte et la garde Lot 4, puis l'écrit et
 * marque le brouillon adopté dans une seule transaction. Aucun appel modèle.
 */
export async function writeFromDraft(
  input: ComposeDraftInput,
  draftId: string,
  intent: "replace_current" | "prepare_next",
  replaces: string | null,
): Promise<{ ok: boolean; mealId: string | null }> {
  // ⛔ ET SURTOUT PAS DE `readNote` ICI (lot 4). Lire la phrase c'est
  // L'APPLIQUER (un cran d'appétit, un réglage): la relire à l'adoption
  // appliquait le même cran une seconde fois. La phrase a fait son effet à la
  // reprise; l'adoption relit le magasin, qui porte déjà le plan final.
  try {
    const payload = await callGenerator(input, intent, replaces, {
      draft_id: draftId,
      adopting_draft: true,
    });
    const meal = (payload.meal ?? null) as Record<string, unknown> | null;
    return {
      // Un 200 qui dit `ok: false` n'est pas une panne de transport, et il ne
      // doit pas non plus atterrir comme un succès.
      ok: payload.ok === true,
      mealId: typeof meal?.id === "string" ? meal.id : null,
    };
  } catch (error) {
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-15 · BÊTA 2C — LA RÉPONSE PERDUE APRÈS UNE ADOPTION RÉUSSIE.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ `callGenerator` A DÉJÀ TENTÉ SA REPRISE, ET ELLE NE PEUT PAS MARCHER
    // ICI: elle cherche par le `request_id` que CET appel vient de tirer, alors
    // que le plan écrit par adoption porte le `generated_from` du brouillon —
    // c'est-à-dire l'identifiant de la COMPOSITION, pas celui de l'adoption.
    // Une identité neuve à chaque tap ne peut retrouver aucun résultat.
    //
    // Le `draft_id`, lui, est stable: c'est la même ligne des deux côtés, et
    // elle porte `adopted_meal_id` dès que la transaction a commis.
    const written = await adoptedMealOf(draftId);
    if (written) return { ok: true, mealId: written };
    throw error;
  }
}

/**
 * LE PLAN ÉCRIT PAR CE BROUILLON, S'IL EXISTE.
 *
 * ⚠️ RIEN D'AUTRE. Pas de `status`, pas d'attente, pas de seconde adoption: on
 * répond à « est-ce déjà écrit ? », et un `null` laisse l'erreur d'origine
 * remonter telle quelle.
 */
async function adoptedMealOf(draftId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("student_meal_drafts")
    .select("adopted_meal_id")
    .eq("id", draftId)
    .maybeSingle();
  if (error || !data) return null;
  const id = String((data as { adopted_meal_id?: unknown }).adopted_meal_id ?? "").trim();
  return id || null;
}

/**
 * L'APPEL, ET UN SEUL CORPS DE REQUÊTE POUR LES DEUX GESTES.
 *
 * ⛔ NE JAMAIS N'ENVOYER QUE LA NOTE AU SECOND TOUR. C'est la raison pour
 * laquelle l'aperçu et l'adoption partagent ce constructeur: deux corps écrits
 * séparément divergeraient, et la divergence se paierait dans le sens le plus
 * cher — un plan composé pour une vie que la personne n'a pas, parce que
 * l'adoption aurait « oublié » la fenêtre, le mode de cuisson ou l'envie.
 */
async function callGenerator(
  input: ComposeDraftInput,
  intent: "draft" | "replace_current" | "prepare_next",
  replaces: string | null = null,
  /**
   * ⟳ 2026-09-09 — CE QUE LA REPRISE LOCALE AJOUTE AU MÊME CORPS : `operation`,
   * `draft_id`, `cells`. Le reste du corps est celui de la composition, par
   * construction : `edit_cells` est une composition à tous les autres égards.
   */
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  // ⟳ 2026-09-10 · LOT 7 — UN SEUL MOTEUR, ÉCRIT EN CONSTANTE.
  // Il n'y a plus de branche à se tromper: `generate-household-meal-v1` sert
  // une bouche comme il en sert six. Nommer la fonction dans une constante
  // plutôt qu'en ligne garde la chaîne grep-able — trois tests lisent ce
  // fichier pour vérifier qui est appelé.
  const fn = "generate-household-meal-v1";
  const window = input.window.kind === "exact"
    ? {
      kind: "exact",
      starts_on: input.window.startsOn,
      duration_days: input.window.durationDays,
    }
    : input.window;

  // ⚠️ `replaces` EST REFUSÉ AVEC `draft` (`unknown_intent`), et c'est cohérent:
  // un aperçu ne remplace rien, puisqu'il n'écrit rien.
  const replacing = intent === "draft" ? null : replaces;

  // ══════════════════════════════════════════════════════════════════════
  // LE CORPS — UN SEUL, PARCE QU'IL N'Y A PLUS QU'UN MOTEUR (lot 7).
  // ══════════════════════════════════════════════════════════════════════
  //
  // Il est ÉTROIT, et c'est le contrat de la fonction: elle relit le mode, les
  // bouches, les présences et les règles de maison EN BASE. C'est pour ça que
  // `mode`, `meal_slot`, `servings` et `pantry` ne sont pas ici — ils ont
  // quitté `ComposeDraftInput` avec l'ancienne lane, faute d'écran pour les
  // remplir.
  //
  // ⛔ CE COMMENTAIRE DISAIT AUSSI « lui envoyer les champs de la lane
  // individuelle ne les ferait pas lire ». C'ÉTAIT FAUX POUR `preferences`, ET
  // C'EST MESURÉ: `generate-household-meal-v1` relit `body.preferences` à
  // TROIS endroits — la consigne (`:3582`, la ligne « what they feel like
  // eating THIS TIME » de `buildMealPrompt`), le compte-rendu de la demande
  // (FF-061, `:4569`) et la colonne écrite du plan (`:4976`). Les trois
  // recevaient `null` parce que personne ne l'envoyait, et la justification
  // écrite ici est ce qui a fait tenir l'absence.
  //
  // ⚠️ LA LEÇON, PLUS QUE LE CHAMP: un commentaire qui EXPLIQUE une absence
  // est une affirmation à vérifier, pas une décision à respecter. Celui-ci a
  // survécu à la lecture qu'il déclarait impossible.
  const body: Record<string, unknown> = {
    operation: "compose",
    window,
    intent,
    replaces: replacing,
    context: input.context,
    // ── LOT B · LE MODE DE CUISSON DEMANDÉ ─────────────────────────────
    // ⛔ IL PART SUR LES TROIS GESTES, ET C'EST LA MOITIÉ QUI COMPTE.
    // L'aperçu, la reprise et l'adoption passent tous par ici: sans lui sur
    // l'adoption, le plan ÉCRIT ne serait pas celui qu'on vient de montrer —
    // le défaut exact que la fenêtre d'aperçu existe pour empêcher, et qui est
    // déjà écrit noir sur blanc pour `draft_note`.
    cooking_shape: input.cookingShape,
    // ⛔ SUR LES TROIS GESTES AUSSI. « Tout dans une session » est une question
    // de CONSERVATION, pas de nombre d'assiettes: elle se pose exactement
    // pareil à qui mange seul. Sans lui sur l'adoption, le plan ÉCRIT ne
    // serait pas celui qu'on vient de montrer.
    one_cooking_session: input.oneCookingSession,
    preferences: input.preferences,
  };
  Object.assign(body, extra);
  // LA NOTE N'EST POSÉE QUE SI ELLE EXISTE. Un `draft_note: ""` serait lu comme
  // une phrase illisible et rendrait `note_unusable` au premier aperçu, avant
  // que quiconque ait écrit quoi que ce soit.
  // ⛔ PLUS DE `draft_note` ICI — LA RÈGLE QUI TIENT TOUT LE DOCUMENT DES
  // RETOURS: « le composeur ne reçoit jamais la phrase ». Elle est lue AVANT,
  // par `readNote`, et appliquée; le composeur relit le magasin. Mesuré avant
  // ce lot: la phrase brute dans un prompt de 23 833 caractères.

  const deadline = new AbortController();
  const requestId = crypto.randomUUID();
  const timer = setTimeout(() => deadline.abort(), PLAN_CLIENT_TIMEOUT_MS);
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await supabase.functions.invoke(fn, {
      body,
      headers: { "x-request-id": requestId },
      // ══════════════════════════════════════════════════════════════════════
      // ⟳ 2026-09-14 · BÊTA 2B — LES DEUX INTENTIONS ONT LA MÊME BORNE
      // ══════════════════════════════════════════════════════════════════════
      //
      // ⛔ L'APERÇU N'EN AVAIT AUCUNE. `...(intent === "draft" ? {} : {timeout})`:
      // le geste le plus fréquent du produit — celui qui termine l'entonnoir —
      // attendait indéfiniment. Une connexion qui ne se ferme pas laissait le
      // bouton mort sans qu'aucune issue n'arrive jamais, et c'est très
      // exactement ce que la borne existe pour empêcher sur l'autre chemin.
      //
      // ⛔ ET CE N'EST PAS LA BORNE DU SERVEUR. Le serveur s'accorde
      // `PLAN_REQUEST_BUDGET_MS` (380 s) parce que le worker edge coupe à 400;
      // le CLIENT, lui, rend la main à 120 s parce que c'est le service que la
      // bêta promet. Les deux ne décrivent pas la même chose, et le plan de bêta
      // demande de les aligner en le SACHANT: un dépassement client n'arrête pas
      // le serveur — le foyer reste verrouillé (`generation_in_flight`) et la
      // relance est refusée avec l'identifiant de la demande en cours.
      //
      // ⚠️ 145 s, PAS 120: la passerelle coupe à 150 (`read_timeout` de Kong,
      // « to match hosted project ») et les durées réelles de cette lane sont de
      // 116 à 144 s. Une borne à 120 abandonnerait des générations qui
      // reviennent. Voir le pavé de `PLAN_CLIENT_TIMEOUT_MS`.
      // ⛔ NOTRE PROPRE `AbortController`, PAS L'OPTION `timeout` DE LA
      // BIBLIOTHÈQUE. Les deux coupent à la même seconde, mais l'option rend un
      // `FunctionsFetchError` dont le message est le MÊME que celui d'un réseau
      // coupé — et lire ce message pour les distinguer serait un matcher maison
      // sur du texte que nous n'écrivons pas (cicatrice mesurée de ce dépôt).
      // Le signal, lui, SAIT: `deadline.signal.aborted` ne dit qu'une chose.
      signal: deadline.signal,
    }));
  } finally {
    clearTimeout(timer);
  }
  if (error) {
    // ⛔ NOTRE DÉLAI N'EST PAS UNE PANNE, ET IL NE DOIT PAS SE LIRE COMME UNE.
    // Mesuré le 2026-09-14: le client rend la main à 145 s, LE SERVEUR
    // CONTINUE — il a 380 s — et il peut très bien écrire le plan après coup.
    // Dire « la composition n'a pas abouti » serait faux une fois sur deux, et
    // « relance » ferait taper sur un foyer encore verrouillé.
    const recovered = await settleInterruptedGeneration(requestId);
    if (recovered.kind === "done") return recovered.response;
    if (recovered.kind === "written") {
      return { ok: true, meal: { id: recovered.mealId }, request_id: requestId };
    }
    if (recovered.kind === "in_flight") throw new Error("plan_still_composing");
    if (recovered.kind === "expired") throw new Error("plan_expired");
    if (recovered.kind === "failed") throw new Error(recovered.errorCode);
    if (deadline.signal.aborted) throw new Error("composition_unavailable");
    throw new Error(await refusalOf(error, "composition_unavailable"));
  }
  return (data ?? {}) as Record<string, unknown>;
}

/**
 * Après un transport coupé: une lecture, puis une attente seulement si l'état
 * relu est réellement en vol. Exportée pour `generateHouseholdMeal`.
 */
export async function settleInterruptedGeneration(
  requestId: string,
): Promise<DraftRecovery> {
  const first = await recoverRequest(requestId);
  if (first.kind !== "in_flight") return first;
  return await awaitDurableRequest(requestId);
}
