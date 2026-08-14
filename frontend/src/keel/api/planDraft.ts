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
import { readEdgeRefusal } from "./edgeErrors";
import {
  type GeneratedMealResult,
  type MealMode,
  type MealSlot,
  type PantryItem,
  readDayProperties,
  readDishes,
  readFixedIntakes,
  readPreparations,
  readSessions,
} from "./mealGeneration";
import { type MealWindowRequest } from "./mealWindow";

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
}

/** Un brouillon: le plan tel qu'il serait, et ce que le serveur en dit. */
export interface PlanDraft {
  plan: GeneratedMealResult;
  envelope: DraftEnvelope;
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
export function readDraftEnvelope(raw: unknown): DraftEnvelope {
  const payload = (raw ?? {}) as Record<string, unknown>;
  const rationale = readLines(payload.rationale);
  const report = readLines(payload.request_report);
  const suggested = (payload.suggested_window ?? {}) as Record<string, unknown>;
  const startsOn = String(suggested.starts_on ?? "").trim();
  // `dropped_clauses` est lu S'IL ARRIVE. Un `Number(undefined)` vaut `NaN`, et
  // un `NaN` comparé à `> 0` est `false`: l'absence se lit donc « rien n'est
  // tombé », qui est la direction sûre — on ne montre pas un avertissement à
  // quelqu'un dont la phrase est passée entière.
  const dropped = Number(payload.dropped_clauses);
  return {
    draft: payload.draft === true,
    rationale: rationale.lines,
    rationaleRefusal: rationale.refusal,
    requestReport: report.lines,
    requestReportRefusal: report.refusal,
    suggestedStartsOn: startsOn === "" ? null : startsOn,
    suggestedShifted: suggested.shifted === true,
    droppedClauses: Number.isFinite(dropped) && dropped > 0 ? Math.floor(dropped) : 0,
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
    // Le brouillon ne montre pas de courses: `PlanResult` n'en rend pas, et la
    // liste se lit sur le plan adopté. Vide plutôt qu'un lecteur inutilisé.
    shoppingList: [],
    fixedIntakes: readFixedIntakes(payload.fixed_intakes),
    dayProperties: readDayProperties(payload.day_properties),
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

/** Sur quelle lane le brouillon se compose. Décidé par `chooseGenerator`. */
export type DraftLane = "personal" | "household";

export interface ComposeDraftInput {
  /**
   * LA LANE. REQUISE, jamais déduite ici: `chooseGenerator` (`api/planRouting`)
   * porte la règle, et une seconde décision à cet endroit en ferait deux.
   */
  lane: DraftLane;
  window: MealWindowRequest;
  /**
   * LA PHRASE ÉCRITE SUR LE BROUILLON. `null` = premier tour, rien à reprendre.
   *
   * ⚠️ ELLE NE REMPLACE RIEN. Côté serveur elle s'ajoute en queue du message,
   * par le même point de composition que la relance de correction: les blocs
   * corps / objectif / doctrine / allergies / budget / rythme sont byte-
   * identiques à ceux du tour 1. C'est ce qui fait que « je veux des pizzas
   * tous les midis » SE HEURTE à l'objectif au lieu de le remplacer.
   *
   * ⛔ NE JAMAIS N'ENVOYER QUE LA NOTE AU SECOND TOUR. Un sous-ensemble des
   * entrées ferait composer un plan pour une vie que la personne n'a pas.
   */
  note: string | null;
  /** Les entrées de la lane individuelle. Ignorées sur la lane foyer. */
  mode: MealMode;
  slot: MealSlot | null;
  servings: number;
  context: string | null;
  preferences: string | null;
  pantry: PantryItem[];
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
export async function composeDraft(input: ComposeDraftInput): Promise<PlanDraft> {
  const payload = await callGenerator(input, "draft");
  return {
    plan: {
      ...readDraftPlan(payload),
      planKind: input.lane === "household" ? "household" : "personal",
    },
    envelope: readDraftEnvelope(payload),
  };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 ADOPTER — ET CE QUE CE MOT NE PEUT PAS VOULOIR DIRE AUJOURD'HUI.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * L'intention du chantier est « l'adoption écrit EXACTEMENT ce qui a été
 * montré, pas de regénération ». **Ce n'est pas atteignable depuis le
 * navigateur**, et le vérifier tient en deux faits:
 *
 *   1. Le seul écrivain d'un plan est la RPC `write_student_meal_plan`, dont
 *      l'`EXECUTE` est RÉVOQUÉ à `anon` ET `authenticated` — trois fois, dans
 *      trois migrations (`20260807090000`, `20260811080000`, `20260811140000`).
 *      Aucun client ne peut donc poser un plan déjà composé.
 *   2. Aucune fonction edge n'accepte un plan tout fait: les deux générateurs
 *      COMPOSENT, et le chemin `draft` se distingue uniquement par le fait
 *      qu'il saute l'écriture à la toute fin.
 *
 * Ce qu'on peut faire — et ce que fait cette fonction — est de **recomposer à
 * partir de la MÊME demande et de la MÊME phrase**. Le serveur relit la note
 * sur TOUS les `intent`, exprès: « une adoption qui perdrait la phrase écrirait
 * un plan qui n'est pas celui qu'on a montré ». Le résultat reste néanmoins un
 * SECOND appel modèle, donc un plan qui peut différer de l'aperçu.
 *
 * ⚠️ C'EST DIT À L'ÉCRAN AVANT LE CLIC (`plan.draft.adopt_recomposes`). Une
 * adoption silencieuse qui recompose montrerait un plan et en écrirait un
 * autre — exactement ce que la fenêtre d'aperçu existe pour empêcher.
 *
 * Fermer le trou pour de bon demande un chemin serveur qui écrive un payload
 * déjà composé (« adopt this draft »), avec ses propres gardes de sortie. C'est
 * du backend, et c'est hors de la colonne de ce lot.
 */
export async function writeFromDraft(
  input: ComposeDraftInput,
  intent: "replace_current" | "prepare_next",
  replaces: string | null,
): Promise<{ ok: boolean; mealId: string | null }> {
  const payload = await callGenerator(input, intent, replaces);
  const meal = (payload.meal ?? null) as Record<string, unknown> | null;
  return {
    // Un 200 qui dit `ok: false` n'est pas une panne de transport, et il ne
    // doit pas non plus atterrir comme un succès.
    ok: payload.ok === true,
    mealId: typeof meal?.id === "string" ? meal.id : null,
  };
}

/**
 * L'APPEL, ET UN SEUL CORPS DE REQUÊTE POUR LES DEUX GESTES.
 *
 * ⛔ NE JAMAIS N'ENVOYER QUE LA NOTE AU SECOND TOUR. C'est la raison pour
 * laquelle l'aperçu et l'adoption partagent ce constructeur: deux corps écrits
 * séparément divergeraient, et la divergence se paierait dans le sens le plus
 * cher — un plan composé pour une vie que la personne n'a pas, parce que
 * l'adoption aurait « oublié » le mode, le garde-manger ou le créneau.
 */
async function callGenerator(
  input: ComposeDraftInput,
  intent: "draft" | "replace_current" | "prepare_next",
  replaces: string | null = null,
): Promise<Record<string, unknown>> {
  const fn = input.lane === "household"
    ? "generate-household-meal-v1"
    : "generate-meal-v1";
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

  // LE CORPS DE LA LANE FOYER EST PLUS ÉTROIT, et c'est le contrat de la
  // fonction: elle relit le mode, les bouches et les règles de maison en base.
  // Lui envoyer les champs de la lane individuelle ne les ferait pas lire, mais
  // laisserait croire ici qu'ils comptent.
  const body: Record<string, unknown> = input.lane === "household"
    ? {
      operation: "compose",
      window,
      intent,
      replaces: replacing,
      context: input.context,
    }
    : {
      mode: input.mode,
      window,
      intent,
      replaces: replacing,
      meal_slot: input.slot,
      servings: input.servings,
      context: input.context,
      preferences: input.preferences,
      pantry: input.pantry,
    };
  // LA NOTE N'EST POSÉE QUE SI ELLE EXISTE. Un `draft_note: ""` serait lu comme
  // une phrase illisible et rendrait `note_unusable` au premier aperçu, avant
  // que quiconque ait écrit quoi que ce soit.
  if (input.note !== null && hasNote(input.note)) body.draft_note = input.note;

  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    const refusal = await readEdgeRefusal(error);
    const named = refusal
      ? (refusal.detail ? `${refusal.token}: ${refusal.detail}` : refusal.token)
      : "";
    throw new Error(named || `[keel/planDraft] ${error.message}`);
  }
  return (data ?? {}) as Record<string, unknown>;
}
