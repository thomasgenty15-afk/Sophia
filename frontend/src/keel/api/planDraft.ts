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
  type MealMode,
  type MealSlot,
  type PantryItem,
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
  // `mode`, `meal_slot`, `servings` et `pantry` n'ont donc rien à faire ici.
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
  //
  // ⚠️ EFFET RÉEL AUJOURD'HUI: NUL, et c'est dit exprès. Les deux appelants de
  // `composeDraft` (`SetupPage`, `StudentWeekPlanPage`) passent
  // `preferences: null` en dur — l'aperçu n'a pas encore de champ d'envie. Le
  // corps cesse simplement de MENTIR sur ce que la fonction lit; le jour où un
  // écran d'aperçu pose la question, elle arrive.
  const body: Record<string, unknown> = input.lane === "household"
    ? {
      operation: "compose",
      window,
      intent,
      replaces: replacing,
      context: input.context,
      // ── LOT B · LE MODE DE CUISSON DEMANDÉ ───────────────────────────
      // ⛔ IL PART SUR LES TROIS GESTES, ET C'EST LA MOITIÉ QUI COMPTE.
      // L'aperçu, la reprise et l'adoption passent tous par ici: sans lui
      // sur l'adoption, le plan ÉCRIT ne serait pas celui qu'on vient de
      // montrer — le défaut exact que la fenêtre d'aperçu existe pour
      // empêcher, et qui est déjà écrit noir sur blanc pour `draft_note`.
      //
      // ⚠️ LA LANE INDIVIDUELLE NE LE REÇOIT PAS, et c'est le contrat: une
      // bouche n'a jamais eu la question « un plat ou deux ». L'envoyer
      // quand même laisserait croire ici qu'il compte.
      cooking_shape: input.cookingShape,
      // ⛔ SUR LES DEUX LANES, ET SUR LES TROIS GESTES. Contrairement à
      // `cooking_shape` (qui n'a de sujet qu'à plusieurs bouches), « tout dans
      // une session » vaut aussi pour quelqu'un qui mange seul: c'est une
      // question de CONSERVATION, pas de nombre d'assiettes. Et sans lui sur
      // l'adoption, le plan ÉCRIT ne serait pas celui qu'on vient de montrer.
      one_cooking_session: input.oneCookingSession,
      // L'ENVIE — LE MÊME NOM QUE SUR LA LANE INDIVIDUELLE, parce que c'est le
      // nom que le serveur lit. Les deux lanes traversent `buildMealPrompt`.
      preferences: input.preferences,
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
      one_cooking_session: input.oneCookingSession,
    };
  // Une adoption vient après un aperçu déjà validé par la personne. Le
  // serveur doit encore recomposer aujourd'hui, mais il ne doit pas lancer
  // ensuite une seconde génération d'amélioration: sur une semaine complète,
  // les deux appels dépassent la durée de vie de la fonction avant l'écriture.
  if (intent !== "draft") body.adopting_draft = true;
  // LA NOTE N'EST POSÉE QUE SI ELLE EXISTE. Un `draft_note: ""` serait lu comme
  // une phrase illisible et rendrait `note_unusable` au premier aperçu, avant
  // que quiconque ait écrit quoi que ce soit.
  if (input.note !== null && hasNote(input.note)) body.draft_note = input.note;

  const { data, error } = await supabase.functions.invoke(fn, {
    body,
    // La borne du modèle côté serveur est plus courte. Celle-ci garde une
    // marge pour ses lectures et son écriture, et garantit surtout que le
    // bouton redevient cliquable si une connexion ne se ferme pas.
    ...(intent === "draft" ? {} : { timeout: 120_000 }),
  });
  if (error) {
    const refusal = await readEdgeRefusal(error);
    const named = refusal
      ? (refusal.detail ? `${refusal.token}: ${refusal.detail}` : refusal.token)
      : "";
    throw new Error(named || `[keel/planDraft] ${error.message}`);
  }
  return (data ?? {}) as Record<string, unknown>;
}
