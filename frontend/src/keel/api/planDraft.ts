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
import { COOKING_SHAPES, type CookingShape } from "./cookingShape";
import { type CookingSessionCount, readCookingSessions } from "./cookingPlan";
import { readEdgeRefusal } from "./edgeErrors";
import {
  type GeneratedMealResult,
  PLAN_CLIENT_TIMEOUT_MS,
  PLAN_LEASE_DEADLINE_MS,
  PLAN_RECOVERY_WAIT_MS,
  PLAN_RELAUNCH_GRACE_MS,
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
import { daysBetween } from "./dates";
// ⟳ 2026-09-12 · ÉTAPE C5 — le MÊME lecteur que la ligne écrite. Deux lecteurs
// du même objet divergeraient au premier champ ajouté, et c'est celui qu'on
// regarde le moins qui garderait l'ancien comportement.
import { readPlanValidation } from "./planValidation";

// ⟳ 2026-09-25 — LE PLAFOND DE TOURS EST PARTI (`DRAFT_MAX_TURNS`,
// `draftTurnsLeft`, `canRemix`). Décision produit : « il ne doit pas y avoir
// de limite de reprises dans les faits ». Plus de compteur à l'écran, plus de
// bouton éteint au troisième tour.

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
  /**
   * ⟳ 2026-09-24 — `sense` : le genre de l'item rangé (`food.exclude`,
   * `food.prefer`…), `null` pour une ligne qui n'en a pas. C'est lui qui dit
   * qu'une note n'est QU'UNE exclusion (`noteIsExclusionOnly`), et donc qu'on
   * modifie le brouillon au lieu de le recomposer.
   */
  announced: ReadonlyArray<{ text: string; who: string | null; kind: string; sense: string | null }>;
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
   * ⟳ 2026-09-23 — CE QUE LA NOTE A DIT DE LA SANTÉ ET QUI N'A PAS PU ENTRER
   * DANS LA FICHE (une allergie, un régime). Rendu sous le champ avec l'endroit
   * où l'ajouter: un refus tu ferait croire qu'une allergie d'enfant est
   * enregistrée. Ce qui EST entré arrive dans `announced`, `kind: "safety"`.
   */
  safetyNotWritten: ReadonlyArray<{ text: string; who: string | null }>;
  /**
   * ⟳ 2026-09-09 (chirurgie locale, pièce 4) — LES CASES DE CE PLAN-CI que la
   * phrase désigne (jour ET moment). Rien n'a été écrit pour elles : le
   * dialogue les donne au composeur par `editCells`, qui ne refait que ces
   * cases et garde le reste. Mesuré : une recomposition ne garde RIEN (0 plat
   * commun sur 6 entre deux runs identiques).
   */
  cells: ReadonlyArray<NoteCell>;
  /**
   * ⟳ 2026-09-24 — COMBIEN DE PLATS ONT REJOINT LA LISTE DES PLATS REFUSÉS
   * (lecture des raisons de « Remplacer »). `0` sur une note.
   */
  rejectedFiled: number;
  /**
   * ⟳ 2026-09-25 — « À LA PLACE DE X, METS Y », POUR CE PLAN SEULEMENT
   * (décision du propriétaire). Rien n'est écrit pour X; Y est rangé comme
   * préférence (et arrive dans `announced`). Le dialogue les donne à la
   * retouche locale (`editExclusions`), qui refait les plats où X est servi.
   */
  swaps: ReadonlyArray<NoteSwap>;
}

export interface NoteSwap {
  from: string;
  to: string;
  /** `null` = toute la table. */
  memberId: string | null;
}

export interface NoteCell {
  day: string;
  slot: string;
  text: string;
}

/** Ce qu'une reprise locale a pris et laissé — `DraftEnvelope.edit`. */
export interface DraftEdit {
  /**
   * ⟳ 2026-09-24 — QUELLE REPRISE: des CASES désignées par une phrase
   * (`edit_cells`, « refais le vendredi soir »), ou des PLATS barrés
   * (`replace_dishes`, le geste « Remplacer »). Absent du serveur ⇒
   * `edit_cells`, la seule qui existait avant.
   */
  operation: "edit_cells" | "replace_dishes";
  /** Les cases refaites (`day/slot`), ou les plats refaits (clé de plat). */
  taken: ReadonlyArray<string>;
  notRendered: ReadonlyArray<string>;
  unknown: ReadonlyArray<string>;
  /** Les plats du plan de départ gardés tels quels. */
  untouched: number;
  /**
   * ⟳ 2026-09-24 — LES PLATS REFAITS EN PLUS DE CEUX QU'ON A BARRÉS: ils
   * contenaient un aliment qu'une raison vient d'écarter pour quelqu'un qui
   * les mange. Sans eux, la garde d'exclusion aurait retiré cette personne du
   * plat sans rien lui reposer. `[]` sur `edit_cells`.
   */
  extended: ReadonlyArray<{ title: string }>;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-24 — « REMPLACER » UN PLAT DE L'APERÇU.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Une OCCURRENCE d'un plat barré: la case où il est servi, pour qui, son titre
 * tel qu'affiché, et la raison écrite. Toutes les occurrences d'un même titre
 * partent ensemble, avec la même raison.
 *
 * ⛔ AUCUNE DÉCISION ICI SUR QUI MANGE LE PLAT: le serveur relit le brouillon
 * rangé et prend les mangeurs dans ses boîtes. Le navigateur ne dit que la
 * case et le titre — ce qu'il a sous les yeux.
 */
export interface DishRejection {
  day: string;
  slot: string;
  /** `null` = le plat de la table. */
  memberId: string | null;
  title: string;
  reason: string;
}

/**
 * LE PLAFOND D'UN REMPLACEMENT, EN OCCURRENCES. Au-delà, ce n'est plus refaire
 * des plats, c'est recomposer le plan en le faisant passer pour une retouche.
 * ⚠️ Même valeur que `DISH_REPLACE_MAX` côté serveur (`dish_replace.ts`).
 */
export const DISH_REPLACE_MAX = 24;

/** Les questions de précision posées en une fois (`DRAFT_NOTE_QUESTIONS_MAX` côté serveur). */
export const NOTE_QUESTIONS_MAX = 3;

/**
 * LA CLÉ D'UN TITRE — ce qui fait que deux plats sont « le même repas » pour
 * « Remplacer ». Même règle que `dishTitleKey` côté serveur: NFC, espaces
 * repliés, minuscules. Les ACCENTS RESTENT: « pâtes » n'est pas « pâté ».
 */
export function dishTitleKey(title: string): string {
  return title.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

export interface NotePortionQuestion {
  kind: "portion";
  /** Le morceau de phrase sur lequel le serveur a buté — cité, jamais la note entière. */
  text: string;
  direction: "down" | "up";
  options: ReadonlyArray<{ memberId: string; label: string }>;
}

/**
 * ⟳ 2026-09-23 — « POUR QUI ? » SUR UN GOÛT, UNE ENVIE OU UN MÉMO. Le morceau
 * que le serveur écrira une fois la bouche connue voyage DANS la question et
 * repart tel quel avec le tap (`NoteWhoAnswer`): le front ne le lit pas, ne le
 * corrige pas, ne l'invente pas — le serveur le relit par le lecteur de la
 * note avant d'écrire. Opaque ici, exprès.
 */
export interface NotePendingEntry {
  gate: string;
  kind: string | null;
  text: string;
  /** La phrase entière — la citation de ce qui sera écrit. Portée, jamais relue ici. */
  note: string;
  occasion: string | null;
  force: string | null;
  when: { weekday: string | null; slot: string | null } | null;
}

export interface NoteWhoQuestion {
  kind: "who";
  text: string;
  entry: NotePendingEntry;
  options: ReadonlyArray<{ memberId: string; label: string }>;
}

export type NoteQuestion = NotePortionQuestion | NoteWhoQuestion;

/** Un tap sur une question: la bouche choisie, et ce qui était déjà lu. */
export interface NotePortionAnswer {
  kind: "portion";
  memberId: string;
  direction: "down" | "up";
}

export interface NoteWhoAnswer {
  kind: "who";
  memberId: string;
  entry: NotePendingEntry;
}

export type NoteAnswer = NotePortionAnswer | NoteWhoAnswer;

/** Un brouillon: le plan tel qu'il serait, et ce que le serveur en dit. */
export interface PlanDraft {
  plan: GeneratedMealResult;
  envelope: DraftEnvelope;
}

/**
 * ⟳ 2026-09-21 — CE QU'UNE LIGNE REPRISE SAIT ENCORE D'ELLE-MÊME. `origin` :
 * la surface qui l'a demandée. `replaces` : le plan qu'elle remplacerait à
 * l'adoption (`request_body.replaces`) — sans lui, l'aperçu rouvert après un
 * rechargement s'adoptait en `prepare_next` et le serveur refusait le
 * chevauchement : la fenêtre revenait, mais son bouton était mort.
 */
export type RecoverablePlanDraft =
  | {
    state: "done";
    draft: PlanDraft;
    origin: DraftOrigin | null;
    replaces: string | null;
    /**
     * ⟳ 2026-09-22 — LA DEMANDE QUI A PRODUIT CE BROUILLON, relue dans
     * `request_body`. Mesuré à 00:00 : l'aperçu repris se recomposait avec
     * `draftInput()` de la page — la fenêtre SUIVANTE (26 → 2 oct) sur un
     * brouillon qui remplaçait le plan courant (21 → 25), ou « aujourd'hui »
     * calculé avant minuit et refusé `bad_window` après. Une reprise
     * recompose CE que le brouillon demandait, pas ce que la page devine.
     */
    input: ComposeDraftInput | null;
  }
  | {
    state: "in_flight";
    draftId: string;
    origin: DraftOrigin | null;
    replaces: string | null;
    input: ComposeDraftInput | null;
  }
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

  // ⟳ LOT C — la fille porte le MÊME `request_id` que sa mère et est plus
  // récente : « la dernière ligne de cette demande » est la bonne, sans rien
  // savoir de la relance.
  const { data, error } = await supabase
    .from("student_meal_drafts")
    .select(`id,status,response,error_code,expires_at,adopted_meal_id,created_at,${RELAUNCH_COLUMNS}`)
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
    // Une mère morte dont la relance peut encore venir reste « en vol » le
    // temps d'un tick ; la fille, plus récente, prendra sa place à la lecture
    // suivante.
    const awaitingRelaunch = relaunchable(row) && Date.now() < relaunchDeadline(row);
    if (status === "pending" || status === "running") {
      if (!outOfLease(row.created_at)) return { kind: "in_flight" };
      return awaitingRelaunch ? { kind: "in_flight" } : { kind: "expired" };
    }
    if (status === "failed") {
      const errorCode = rowFailureToken(String(row.error_code ?? ""));
      if (errorCode === "plan_expired" && awaitingRelaunch) return { kind: "in_flight" };
      return { kind: "failed", errorCode };
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
      return { kind: "failed", errorCode: rowFailureToken(String(status?.error_code ?? "")) };
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
    // ⟳ LOT C — sauf si sa relance peut encore venir (une mère `async`, dans
    // la grâce d'un tick) : `waitForDraft` suivra alors la fille.
    if (outOfLease(row.created_at) && !(relaunchable(row) && Date.now() < relaunchDeadline(row))) {
      return null;
    }
    return {
      state: "in_flight",
      draftId: id,
      origin: readDraftOrigin(row.origin),
      replaces: readReplaces(row.replaces),
      input: readComposeInput(row.request_body),
    };
  }
  if (status === "done" && row.response && typeof row.response === "object" &&
    !Array.isArray(row.response)) {
    return {
      state: "done",
      draft: planDraftFromResponse(row.response as Record<string, unknown>),
      origin: readDraftOrigin(row.origin),
      replaces: readReplaces(row.replaces),
      input: readComposeInput(row.request_body),
    };
  }
  return null;
}

/**
 * Reprend, après rechargement, le dernier brouillon encore valable du compte.
 *
 * ⟳ 2026-09-23 — UNE ADOPTION FERME LES BROUILLONS QUI LA PRÉCÈDENT. Signalé :
 * « j'ai validé un plan, et dès que je retourne sur le plan de ma semaine ça
 * me demande de le revalider ». Mesuré en base locale : le brouillon adopté
 * (00:30) était exclu de la lecture, qui retombait sur un brouillon `done` de
 * 23:34 — une version d'avant, jamais validée — et le rouvrait. `adopted` est
 * donc LU : s'il est le plus récent, il n'y a rien à reprendre
 * (`recoverableRow` le rend `null`). `failed` reste ignoré : une reprise qui
 * échoue depuis la fenêtre laisse l'aperçu d'avant en place, et c'est lui
 * qu'on rouvre.
 *
 * ⟳ 2026-09-23 — « LAISSER TOMBER » AUSSI. Même défaut, l'autre réponse :
 * la ligne restait `done` et revenait à chaque retour sur l'onglet.
 * `discarded` est lu pour la même raison qu'`adopted` — l'exclure ferait
 * retomber la lecture sur un brouillon plus ancien.
 */
export async function recoverLatestDraft(): Promise<RecoverablePlanDraft> {
  // Un « Laisser tomber » encore en route doit arriver avant cette lecture :
  // changer d'onglet juste après le clic relirait la ligne encore `done`.
  if (pendingDiscard) await pendingDiscard;
  const { data, error } = await supabase
    .from("student_meal_drafts")
    .select(`id,status,response,error_code,expires_at,created_at,${RELAUNCH_COLUMNS}`)
    .in("status", ["pending", "running", "done", "adopted", "discarded"])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("composition_unavailable");
  return recoverableRow(data);
}

/**
 * ⟳ 2026-09-25 — L'APERÇU QU'UN AJUSTEMENT EN COURS VA REMPLACER.
 *
 * Signalé dans l'entonnoir : un rechargement pendant « Ajuster le plan »
 * fermait la fenêtre d'aperçu et affichait la carte « Ton plan se compose ».
 * L'aperçu d'avant existe pourtant encore (un brouillon ne passe `discarded`
 * qu'au moment où un autre devient `done`) : c'est lui qu'on rouvre, pendant
 * que la page attend la composition en vol.
 *
 * Le brouillon le plus récent AVANT la ligne en vol, parmi `done`, `adopted`
 * et `discarded` — même règle que `recoverLatestDraft` : si le plus récent a
 * déjà eu sa réponse, il n'y a rien à rouvrir (`null`). `null` aussi pour une
 * première composition : rien n'était affiché avant elle.
 */
export async function recoverPreviewBehind(inFlightDraftId: string): Promise<PlanDraft | null> {
  const head = await supabase
    .from("student_meal_drafts")
    .select("created_at")
    .eq("id", inFlightDraftId)
    .maybeSingle();
  const createdAt = String((head.data as { created_at?: unknown } | null)?.created_at ?? "");
  if (head.error || !createdAt) return null;
  const { data, error } = await supabase
    .from("student_meal_drafts")
    .select(`id,status,response,error_code,expires_at,created_at,${RELAUNCH_COLUMNS}`)
    .in("status", ["done", "adopted", "discarded"])
    .gt("expires_at", new Date().toISOString())
    .lt("created_at", createdAt)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  const behind = recoverableRow(data);
  return behind !== null && behind.state === "done" ? behind.draft : null;
}

let pendingDiscard: Promise<boolean> | null = null;

/**
 * « LAISSER TOMBER » — la ligne passe à `discarded` (20260923130000) et ne se
 * rouvre plus. Rend `false` sans lever quand l'appel échoue : l'écran se
 * ferme quand même, et le brouillon reviendra au prochain passage, où il
 * pourra être laissé tomber de nouveau.
 */
export function discardDraft(draftId: string | null): Promise<boolean> {
  if (!draftId) return Promise.resolve(false);
  const call = (async () => {
    const { data, error } = await supabase.rpc("keel_discard_meal_draft", { p_draft: draftId });
    return !error && asRecord(data)?.ok === true;
  })().catch(() => false);
  pendingDiscard = call;
  void call.finally(() => {
    if (pendingDiscard === call) pendingDiscard = null;
  });
  return call;
}

/**
 * ⟳ 2026-09-15 · LOT B — OÙ EN EST LA COMPOSITION, LU DANS LA LIGNE.
 *
 * Vocabulaire fermé, miroir de `DRAFT_STAGES` (`_shared/keel/draft_store.ts`),
 * écrit par le worker à chaque frontière. Un stade inconnu se lit `null` :
 * l'écran garde alors sa phrase d'attente, il n'en invente pas une.
 */
export const DRAFT_STAGES = ["composing", "checking", "repairing", "writing"] as const;
export type DraftStage = (typeof DRAFT_STAGES)[number];

export interface DraftProgress {
  stage: DraftStage | null;
  /** Depuis l'ouverture de la ligne (`created_at`), pas depuis le clic. */
  elapsedMs: number;
  /** ⟳ LOT C — 1, ou 2 quand on suit la relance d'une mère morte. */
  attempt: number;
}

/**
 * ⟳ 2026-09-15 · LOT C — UNE MÈRE MORTE DONT LA RELANCE PEUT ENCORE VENIR.
 *
 * Le relanceur SQL (`keel-relaunch-meal-drafts`, un tick par minute) ne
 * relance qu'une ligne `async`, `attempt = 1`, qui n'est pas une reprise
 * locale. Pour celles-là, « morte » n'est pas terminal tout de suite : on
 * cherche la fille, et sinon on laisse passer un tick (`PLAN_RELAUNCH_GRACE_MS`)
 * avant de dire `plan_expired`.
 */
function relaunchable(row: Record<string, unknown>): boolean {
  // ⟳ 2026-09-24 — `replace_dishes` est une reprise locale aussi: le relanceur
  // SQL l'exclut de la même façon (migration du 2026-09-24).
  const operation = String(row.operation ?? "compose");
  return String(row.mode ?? "") === "async" &&
    Number(row.attempt ?? 1) === 1 &&
    operation !== "edit_cells" &&
    operation !== "replace_dishes";
}

/** L'instant où la grâce de relance expire, pour une ligne morte. */
function relaunchDeadline(row: Record<string, unknown>): number {
  const failedAt = Date.parse(String(row.finished_at ?? row.relaunched_at ?? ""));
  const created = Date.parse(String(row.created_at ?? ""));
  const deadAt = Number.isFinite(failedAt)
    ? failedAt
    : Number.isFinite(created)
    ? created + PLAN_LEASE_DEADLINE_MS
    : Date.now();
  return deadAt + PLAN_RELAUNCH_GRACE_MS;
}

/** La fille d'une mère relancée, si elle existe déjà. */
async function childOf(motherId: string): Promise<string | null> {
  const { data } = await supabase
    .from("student_meal_drafts")
    .select("id")
    .eq("relaunch_of", motherId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const id = String((data as { id?: unknown } | null)?.id ?? "").trim();
  return id === "" ? null : id;
}

/** Les colonnes que la relance ajoute à chaque lecture d'une ligne. */
const RELAUNCH_COLUMNS = "mode,attempt,relaunched_at,finished_at,operation:request_body->>operation,origin:request_body->>origin,replaces:request_body->>replaces,request_body";

export interface WaitForDraftOptions {
  onProgress?: (progress: DraftProgress) => void;
  timeoutMs?: number;
  /**
   * ⟳ 2026-09-21 — LE PLAN QUE CE BROUILLON REMPLACERAIT À L'ADOPTION.
   *
   * Un brouillon n'écrit toujours rien : le serveur ne s'en sert que pour
   * exclure ce plan-là de sa garde de chevauchement. Sans lui, « Composer un
   * autre plan » sur des jours déjà couverts rendait `plan_overlaps_existing`
   * avant même que l'adoption — la seule qui remplace — puisse dire quoi.
   */
  replaces?: string | null;
}

function stageOf(raw: unknown): DraftStage | null {
  const s = String(raw ?? "");
  return (DRAFT_STAGES as ReadonlyArray<string>).includes(s) ? (s as DraftStage) : null;
}

/**
 * LE JETON D'UNE LIGNE `failed`, DANS LES MOTS QUE L'ÉCRAN SAIT DIRE.
 *
 * `timed_out` est posé par les balayeuses (un worker mort, plus personne
 * n'écrit) et `compose_failed` par le `catch` du handler : aucun des deux n'a
 * de phrase, et `planRefusals` refuse une clé edge sans émetteur. Les deux
 * jetons qui EN ONT une disent exactement la même chose — on traduit ici,
 * une fois, plutôt que d'ajouter deux clés pour deux synonymes.
 */
function rowFailureToken(code: string): string {
  const token = code.trim();
  if (token === "timed_out") return "plan_expired";
  if (token === "compose_failed" || token === "") return "composition_unavailable";
  return token;
}

/** Attend la ligne déjà en vol; cette boucle ne déclenche aucune génération. */
export async function waitForDraft(
  draftId: string,
  opts: WaitForDraftOptions = {},
): Promise<PlanDraft> {
  return planDraftFromResponse(await waitForDraftRow(draftId, opts));
}

/**
 * LA RÉPONSE BRUTE DE LA LIGNE, UNE FOIS `done`.
 *
 * ⟳ 2026-09-15 · LOT E — C'EST LE CHEMIN NORMAL, plus le chemin de secours. Le
 * serveur répond 202 en quelques secondes (`accepted`) et compose en
 * arrière-plan ; la ligne est la seule vérité, et le navigateur la relit
 * toutes les 2 s en rapportant son stade à l'écran.
 *
 * LA FIN EST DÉCIDÉE PAR LA LIGNE, PAS PAR L'HORLOGE D'ICI : `done`, `failed`,
 * ou un âge au-delà du bail (`plan_expired` — plus personne n'écrit).
 * `plan_still_composing` ne reste que pour une échéance locale que rien n'a
 * tranchée ; elle est plus longue que deux baux, donc jamais atteinte en
 * pratique. Avant ce lot, la relecture s'arrêtait 60 s AVANT le bail et cette
 * phrase-là était la seule issue possible d'un worker mort.
 */
async function waitForDraftRow(
  draftId: string,
  opts: WaitForDraftOptions = {},
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + (opts.timeoutMs ?? PLAN_RECOVERY_WAIT_MS);
  // ⟳ LOT C — la ligne suivie peut changer : la mère meurt, on suit sa fille.
  let current = draftId;
  do {
    const { data, error } = await supabase
      .from("student_meal_drafts")
      .select(`id,status,response,error_code,expires_at,created_at,stage,stage_at,${RELAUNCH_COLUMNS}`)
      .eq("id", current)
      .maybeSingle();
    if (error || !data) throw new Error("composition_unavailable");
    const row = data as Record<string, unknown>;
    const created = Date.parse(String(row.created_at ?? ""));
    opts.onProgress?.({
      stage: stageOf(row.stage),
      elapsedMs: Number.isFinite(created) ? Math.max(0, Date.now() - created) : 0,
      attempt: Number(row.attempt ?? 1) || 1,
    });
    const status = String(row.status ?? "");
    if (
      (status === "done" || status === "adopted") && row.response &&
      typeof row.response === "object" && !Array.isArray(row.response)
    ) {
      return row.response as Record<string, unknown>;
    }
    const dead = status === "failed" ||
      ((status === "pending" || status === "running") && outOfLease(row.created_at));
    if (dead) {
      const token = status === "failed" ? rowFailureToken(String(row.error_code ?? "")) : "plan_expired";
      // ⛔ UNE MORT N'EST TERMINALE QUE SI PERSONNE NE PEUT RELANCER. Une mère
      // `async` a droit à UNE fille : on la cherche ; sinon on attend un tick.
      if (token === "plan_expired" && relaunchable(row)) {
        const child = await childOf(current);
        if (child) {
          current = child;
          await new Promise((resolve) => globalThis.setTimeout(resolve, 2_000));
          continue;
        }
        if (Date.now() < relaunchDeadline(row)) {
          await new Promise((resolve) => globalThis.setTimeout(resolve, 2_000));
          continue;
        }
      }
      throw new Error(token);
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
  const extended = Array.isArray(e.extended)
    ? e.extended
      .map((x) => String(((x ?? {}) as Record<string, unknown>).title ?? "").trim())
      .filter((title) => title !== "")
      .map((title) => ({ title }))
    : [];
  return {
    operation: e.operation === "replace_dishes" ? "replace_dishes" : "edit_cells",
    taken: list(e.taken),
    notRendered: list(e.not_rendered),
    unknown: list(e.unknown),
    untouched: Number(e.untouched_dishes) || 0,
    extended,
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
   * ⟳ 2026-09-25 — « COMBIEN DE FOIS TU VEUX CUISINER », 1 à 4. Il remplace
   * `oneCookingSession` (« tout dans une session de cuisine », 2026-09-01):
   * « une fois » est une réponse comme les autres.
   *
   * ⚠️ REQUIS ET NULLABLE, jamais `?`. Un champ facultatif ici n'aurait fait
   * remonter AUCUN appelant au compilateur — « paramètre de garde optionnel =
   * garde désarmée », payée sept fois par ce dépôt. `null` = pas de réponse:
   * le moteur ne dérive alors aucun plan de cuisine (`resolveCookingCapacity`).
   *
   * ⛔ LE SERVEUR RELÈVE UN NOMBRE IMPOSSIBLE (une session sur sept jours sans
   * congélateur) et le DIT (`plan_rationale`). L'écran grise déjà ces options;
   * ce n'est pas une garde en double — le corps de la requête est écrit par le
   * réseau, pas par l'écran.
   */
  cookingSessions: CookingSessionCount | null;
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
  /**
   * ⟳ 2026-09-21 — D'OÙ L'APERÇU A ÉTÉ DEMANDÉ : l'entonnoir (`/app/setup`)
   * ou la plateforme (`/app/plan`). Rangé dans `request_body` avec le reste
   * de la demande ; c'est ce qui permet, au rechargement, de rouvrir la
   * fenêtre SUR LA SURFACE OÙ ON ÉTAIT — et donc que « Laisser tomber »
   * ramène là où on était, pas sur l'autre page. Requis, jamais `?`.
   */
  origin: DraftOrigin;
}

/** Les deux surfaces qui composent. Vocabulaire fermé, rangé en base. */
export const DRAFT_ORIGINS = ["setup", "plan"] as const;
export type DraftOrigin = (typeof DRAFT_ORIGINS)[number];
export const DRAFT_ORIGIN_PATH: Record<DraftOrigin, string> = {
  setup: "/app/setup",
  plan: "/app/plan",
};
/**
 * `request_body` → `ComposeDraftInput`. `null` dès qu'une fenêtre n'est pas
 * lisible : la page repart alors de sa propre entrée, comme avant ce lot.
 */
export function readComposeInput(raw: unknown): ComposeDraftInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const w = (body.window ?? null) as Record<string, unknown> | null;
  if (!w || typeof w !== "object") return null;
  const kind = String(w.kind ?? "");
  let window: MealWindowRequest;
  if (kind === "exact") {
    const startsOn = String(w.starts_on ?? "").trim();
    const durationDays = Number(w.duration_days);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !Number.isInteger(durationDays) || durationDays < 1) return null;
    window = { kind: "exact", startsOn, durationDays };
  } else if (kind === "days") {
    const count = Number(w.count);
    if (!Number.isInteger(count) || count < 1) return null;
    window = { kind: "days", count };
  } else if (kind === "until_sunday") {
    window = { kind: "until_sunday" };
  } else {
    return null;
  }
  const shape = String(body.cooking_shape ?? "");
  const context = body.context === null || body.context === undefined ? null : String(body.context);
  const preferences = body.preferences === null || body.preferences === undefined ? null : String(body.preferences);
  return {
    window,
    cookingShape: (COOKING_SHAPES as readonly string[]).includes(shape) ? (shape as CookingShape) : null,
    cookingSessions: readCookingSessions(body.cooking_sessions),
    context,
    preferences,
    origin: readDraftOrigin(body.origin) ?? "plan",
  };
}

/**
 * ⟳ 2026-09-22 — UNE RECOMPOSITION PART D'AUJOURD'HUI. Un brouillon qui
 * remplaçait le plan courant porte la fenêtre de ce plan ; le lendemain,
 * elle commence hier et le serveur la refuse (`bad_window`, « start in the
 * past »). On avance le départ et on raccourcit d'autant : les jours passés
 * sont passés. Une fenêtre qui serait vide n'est pas touchée — le refus du
 * serveur est alors le bon.
 */
export function windowFromToday(input: ComposeDraftInput, today: string): ComposeDraftInput {
  const w = input.window;
  if (w.kind !== "exact" || w.startsOn >= today) return input;
  const spent = daysBetween(w.startsOn, today);
  if (spent >= w.durationDays) return input;
  return { ...input, window: { kind: "exact", startsOn: today, durationDays: w.durationDays - spent } };
}

function readReplaces(raw: unknown): string | null {
  const id = String(raw ?? "").trim();
  return id === "" ? null : id;
}
function readDraftOrigin(raw: unknown): DraftOrigin | null {
  const token = String(raw ?? "").trim();
  return (DRAFT_ORIGINS as readonly string[]).includes(token) ? (token as DraftOrigin) : null;
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
 * ⟳ 2026-09-24 — LIRE LES RAISONS DES PLATS BARRÉS (« Remplacer »).
 *
 * Même fonction edge que la note, en mode « plats refusés »: le serveur relit
 * le brouillon `draftId`, range la liste des plats refusés AVEC ceux qui les
 * mangeaient (pris dans les boîtes du brouillon, jamais ici), puis classe
 * chaque raison comme une phrase de note — un goût, une allergie dite, ce que
 * Sophia sait. Rend la même issue que `readNote`, questions comprises.
 *
 * ⛔ AUCUNE RECOMPOSITION ICI: c'est `replaceDishes` qui refait les plats,
 * une fois les questions répondues.
 */
export async function readRejections(
  draftId: string,
  rejections: ReadonlyArray<DishRejection>,
  window: MealWindowRequest,
): Promise<NoteOutcome> {
  const startsOn = window.kind === "exact" ? window.startsOn : null;
  const { data, error } = await supabase.functions.invoke("keel-read-note-v1", {
    body: {
      draft_id: draftId,
      rejections: rejections.map(rejectionBody),
      today: localTodayIso(),
      ...(startsOn ? { starts_on: startsOn } : {}),
    },
  });
  if (error) {
    throw new Error(await refusalOf(error, "composition_unavailable"));
  }
  return readNoteOutcome((data ?? {}) as Record<string, unknown>);
}

/** Le corps d'une occurrence, en clés serveur — le même pour les deux appels. */
function rejectionBody(r: DishRejection): Record<string, unknown> {
  return { day: r.day, slot: r.slot, member_id: r.memberId, title: r.title, reason: r.reason };
}

/**
 * ⟳ 2026-09-24 — UN AUTRE PLAT DU BROUILLON À QUI LA MÊME RAISON S'APPLIQUE,
 * proposé par `keel-read-note-v1` (mode `match`). Un titre, et toutes ses
 * occurrences.
 */
export interface DishMatch {
  title: string;
  occurrences: ReadonlyArray<{ day: string; slot: string; memberId: string | null }>;
}

/** La réponse du mode `match`, relue: un titre vide ou sans occurrence tombe. */
export function readDishMatchesResponse(raw: unknown): DishMatch[] {
  const list = (raw as { matches?: unknown } | null)?.matches;
  if (!Array.isArray(list)) return [];
  const out: DishMatch[] = [];
  for (const item of list) {
    const m = (item ?? {}) as Record<string, unknown>;
    const title = String(m.title ?? "").trim();
    const occurrences = (Array.isArray(m.occurrences) ? m.occurrences : [])
      .map((o) => (o ?? {}) as Record<string, unknown>)
      .map((o) => ({
        day: String(o.day ?? ""),
        slot: String(o.slot ?? ""),
        memberId: o.member_id === null || o.member_id === undefined ? null : String(o.member_id),
      }))
      .filter((o) => o.day !== "" && o.slot !== "");
    if (title === "" || occurrences.length === 0) continue;
    out.push({ title, occurrences });
  }
  return out;
}

/**
 * « ÇA VAUT AUSSI POUR… » — après la raison d'UN plat barré, les autres plats
 * du même brouillon à qui elle s'applique (un appel rapide, côté serveur).
 *
 * ⛔ NE JETTE JAMAIS: c'est une suggestion. Une panne, un refus, un modèle
 * lent rendent `[]` — le plat est déjà barré, et la personne continue.
 */
export async function matchDishes(
  draftId: string,
  target: DishRejection,
  window: MealWindowRequest,
): Promise<DishMatch[]> {
  try {
    const startsOn = window.kind === "exact" ? window.startsOn : null;
    const { data, error } = await supabase.functions.invoke("keel-read-note-v1", {
      body: {
        draft_id: draftId,
        match: rejectionBody(target),
        today: localTodayIso(),
        ...(startsOn ? { starts_on: startsOn } : {}),
      },
    });
    if (error) return [];
    return readDishMatchesResponse(data);
  } catch {
    return [];
  }
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
      answer: answer.kind === "portion"
        ? { kind: "portion", member_id: answer.memberId, direction: answer.direction }
        // ⟳ 2026-09-23 — le morceau repart tel qu'il est arrivé; `today` et
        // `starts_on` comme à la lecture, pour l'ancre de l'encart.
        : { kind: "who", member_id: answer.memberId, entry: answer.entry },
      today: localTodayIso(),
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
  const readLines = (list: unknown) =>
    (Array.isArray(list) ? list : []).map((a) => {
      const row = (a ?? {}) as Record<string, unknown>;
      return {
        text: String(row.text ?? ""),
        who: row.who === null || row.who === undefined ? null : String(row.who),
        kind: String(row.kind ?? ""),
        sense: row.sense === null || row.sense === undefined ? null : String(row.sense),
      };
    }).filter((a) => a.text !== "");
  // ⟳ 2026-09-25 — `known` : ce que la note redit et que la mémoire portait
  // déjà (rien d'écrit, donc absent d'`announced` côté serveur). Versé ici
  // dans `announced`, parce que c'est lui qui AIGUILLE : sans ça, « J'aime pas
  // le tofu » redit sur un aperçu qui portait encore du tofu recomposait toute
  // la semaine (mesuré sur un vrai compte) au lieu de refaire les plats au
  // tofu. « J'ai noté : tofu » reste vrai — c'est noté.
  const written = readLines(raw.announced);
  const seen = new Set(written.map((a) => `${a.kind}|${a.sense ?? ""}|${a.who ?? ""}|${a.text}`));
  const announced = [
    ...written,
    ...readLines(raw.known).filter((a) => !seen.has(`${a.kind}|${a.sense ?? ""}|${a.who ?? ""}|${a.text}`)),
  ];
  const questions: NoteQuestion[] = [];
  for (const q of Array.isArray(raw.questions) ? raw.questions : []) {
    const row = (q ?? {}) as Record<string, unknown>;
    const direction = String(row.direction ?? "");
    const text = String(row.text ?? "").trim();
    if (!text) continue;
    const options = (Array.isArray(row.options) ? row.options : [])
      .map((o) => {
        const opt = (o ?? {}) as Record<string, unknown>;
        return { memberId: String(opt.memberId ?? "").trim(), label: String(opt.label ?? "").trim() };
      })
      .filter((o) => o.memberId !== "" && o.label !== "");
    if (options.length === 0) continue;
    if (row.kind === "portion") {
      if (direction !== "down" && direction !== "up") continue;
      questions.push({ kind: "portion", text, direction, options });
      continue;
    }
    // ⟳ 2026-09-23 — `who`: le morceau est gardé tel quel, pour repartir tel quel.
    if (row.kind === "who" && row.entry && typeof row.entry === "object") {
      const e = row.entry as Record<string, unknown>;
      const when = e.when && typeof e.when === "object" ? e.when as Record<string, unknown> : null;
      questions.push({
        kind: "who",
        text,
        entry: {
          gate: String(e.gate ?? ""),
          kind: typeof e.kind === "string" ? e.kind : null,
          text: String(e.text ?? text),
          note: String(e.note ?? ""),
          occasion: typeof e.occasion === "string" ? e.occasion : null,
          force: typeof e.force === "string" ? e.force : null,
          when: when === null ? null : {
            weekday: typeof when.weekday === "string" ? when.weekday : null,
            slot: typeof when.slot === "string" ? when.slot : null,
          },
        },
        options,
      });
    }
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
  const safetyNotWritten: { text: string; who: string | null }[] = [];
  for (const r of Array.isArray(raw.safety_not_written) ? raw.safety_not_written : []) {
    const row = (r ?? {}) as Record<string, unknown>;
    const text = String(row.text ?? "").trim();
    if (!text) continue;
    const who = typeof row.who === "string" && row.who.trim() !== "" ? row.who.trim() : null;
    safetyNotWritten.push({ text, who });
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
    safetyNotWritten,
    cells,
    rejectedFiled: Number(raw.rejected_filed) || 0,
    swaps: (Array.isArray(raw.swaps) ? raw.swaps : []).flatMap((w): NoteSwap[] => {
      const row = (w ?? {}) as Record<string, unknown>;
      const from = typeof row.from === "string" ? row.from.trim() : "";
      const to = typeof row.to === "string" ? row.to.trim() : "";
      if (!from || !to) return [];
      const member = typeof row.member_id === "string" && row.member_id.trim() !== "" ? row.member_id.trim() : null;
      return [{ from, to, memberId: member }];
    }),
  };
}

/** Le jour LOCAL de la personne, `YYYY-MM-DD` — celui que le serveur ancre. */
function localTodayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export async function composeDraft(
  input: ComposeDraftInput,
  opts: WaitForDraftOptions = {},
): Promise<PlanDraft> {
  // ⛔ AUCUNE NOTE ICI, NI DANS LE CORPS NI AVANT (lot 4). La phrase est lue
  // par `readNote` depuis le DIALOGUE, qui attend la réponse à une éventuelle
  // question avant d'appeler ceci. Lire ici « au cas où » a déjà coûté un
  // double cran: la reprise lisait, puis l'adoption relisait la même phrase.
  // ⟳ 2026-09-20 — LE BOUTON REPREND LA MAIN. Ce geste est le seul à passer
  // `takeover: true` : si une composition tourne encore pour ce foyer (onglet
  // fermé, note qui a relancé, worker mort avant son `catch`), le serveur la
  // ferme et repart, au lieu de rendre `generation_in_flight` et de laisser le
  // bouton muet jusqu'à la péremption. `editCells` et l'adoption ne le passent
  // pas : une reprise locale ou une écriture ne doivent rien évincer.
  const payload = await callGenerator(
    input,
    "draft",
    opts.replaces ?? null,
    { takeover: true },
    opts.onProgress,
  );
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
 * ⟳ 2026-09-25 — UNE RETOUCHE IMPOSSIBLE DEVIENT UNE RECOMPOSITION, DÉCIDÉE ICI.
 *
 * Décision produit du 2026-09-25 : un ajustement se fait en local, ou le plan
 * se recompose parce que le système le décide. Jamais « refais tout le plan »
 * demandé à la personne (le bouton `recomposeStale` du dialogue est parti).
 *
 * Quatre refus disent que la retouche locale ne peut pas aboutir :
 *   · l'aperçu de départ n'est plus utilisable — absent, pas prêt (fermé par
 *     une autre composition), ou sans plan rangé ;
 *   · `plan_not_deliverable` : le plan retouché ne passe pas la porte finale.
 *     Mesuré le 2026-09-25 : un plat NON touché de l'aperçu d'hier (poisson
 *     cru que rien ne cuit, `raw_protein_uncooked`) faisait refuser toute la
 *     retouche — l'aperçu a été composé avant cette règle, la retouche le
 *     recopie, et une retouche ne relance pas d'amélioration.
 * On recompose alors, avec la même entrée. L'effet de la note ou des plats
 * barrés est déjà rangé en amont (`readNote`, `readRejections`), donc la
 * recomposition le porte.
 *
 * ⚠️ SEULEMENT CES QUATRE JETONS. Tout autre refus (une case illisible, aucun
 * plat concerné) garde l'aperçu courant et se dit tel quel.
 */
const EDIT_FALLS_BACK_TO_COMPOSE: ReadonlySet<string> = new Set([
  "draft_not_found",
  "draft_not_done",
  "draft_has_no_source",
  "plan_not_deliverable",
]);

async function editOrRecompose(
  input: ComposeDraftInput,
  opts: WaitForDraftOptions,
  edit: () => Promise<PlanDraft>,
): Promise<PlanDraft> {
  try {
    return await edit();
  } catch (error) {
    const token = (error instanceof Error ? error.message : String(error)).split(":")[0].trim();
    if (!EDIT_FALLS_BACK_TO_COMPOSE.has(token)) throw error;
    return await composeDraft(input, opts);
  }
}

/**
 * ⟳ 2026-09-24 — REMPLACER LES PLATS BARRÉS, ET SEULEMENT EUX.
 *
 * La reprise locale (`operation: "edit_cells"`) en mode `cells_from:
 * "rejections"`: le serveur retrouve les plats barrés sur le brouillon
 * `draftId`, ne demande au modèle que leurs cases, ne prend de sa réponse que
 * CES PLATS (plus ceux qu'une exclusion toute neuve aurait vidés —
 * `envelope.edit.extended`), recopie tout le reste, rejoue ses ceintures, et
 * range un nouveau brouillon. Une reprise locale n'est jamais relancée.
 *
 * ⛔ UN REFUS LÈVE (`dish_unknown`, `dish_not_rendered`…) et l'aperçu courant
 * reste, plats toujours barrés: on peut relancer. Une retouche qui ne peut
 * pas aboutir recompose (`editOrRecompose`).
 */
export async function replaceDishes(
  input: ComposeDraftInput,
  draftId: string,
  rejections: ReadonlyArray<DishRejection>,
  opts: WaitForDraftOptions = {},
): Promise<PlanDraft> {
  // Même corps que `editCells`: le plan remplacé voyage (`replaces`), sinon la
  // garde de chevauchement refuserait avant tout tour de modèle.
  return await editOrRecompose(input, opts, async () => {
    const payload = await callGenerator(input, "draft", opts.replaces ?? null, {
      operation: "edit_cells",
      draft_id: draftId,
      cells_from: "rejections",
      rejections: rejections.map(rejectionBody),
    }, opts.onProgress);
    return {
      plan: { ...readDraftPlan(payload), planKind: "household" as const },
      envelope: readDraftEnvelope(payload),
    };
  });
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
 * ⛔ UN REFUS LÈVE (`cell_not_rendered`, `cell_unknown`…) et l'aperçu courant
 * reste : rien n'a été composé à la place.
 *
 * ⟳ 2026-09-25 — SAUF QUAND LA RETOUCHE NE PEUT PAS ABOUTIR
 * (`editOrRecompose`) : décision produit, le système recompose au lieu de
 * demander à la personne de le faire. Ce n'est pas le repli silencieux retiré
 * au lot 7 : `edit` est `null` et la recomposition se lit comme telle.
 */
export async function editCells(
  input: ComposeDraftInput,
  draftId: string,
  cells: ReadonlyArray<NoteCell>,
  opts: WaitForDraftOptions = {},
): Promise<PlanDraft> {
  // ⟳ 2026-09-21 — LE PLAN REMPLACÉ VOYAGE AUSSI SUR LA REPRISE DE CASE.
  // Mesuré : « il n'y a pas de repas mardi midi » classée en case, la lane
  // `edit_cells` appelée sans `replaces`, refusée en 600 ms par la garde de
  // chevauchement (`plan_overlaps_existing`) — aucun tour de modèle, et la
  // personne lit « ça n'a rien fait ». Même corps que `composeDraft`.
  return await editOrRecompose(input, opts, async () => {
    const payload = await callGenerator(input, "draft", opts.replaces ?? null, {
      operation: "edit_cells",
      draft_id: draftId,
      cells: cells.map((c) => ({ day: c.day, slot: c.slot, text: c.text })),
    }, opts.onProgress);
    return {
      plan: { ...readDraftPlan(payload), planKind: "household" as const },
      envelope: readDraftEnvelope(payload),
    };
  });
}

/**
 * ⟳ 2026-09-24 — LA NOTE N'EST QU'UNE EXCLUSION : on MODIFIE le brouillon.
 *
 * « Je n'aime pas le tofu » ne nomme aucune case. Elle partait donc en
 * recomposition complète : un autre plan, rien de gardé, et sur le foyer
 * `326427ff…` (staging, 2026-09-23) un plan vide 5 fois sur 8. Ici le
 * serveur relit le brouillon, trouve lui-même les plats qui servent un
 * aliment exclu (`cells_from: "exclusions"`), ne refait que ceux-là et garde
 * le reste à l'identique. Aucun plat concerné ⇒ `edit_nothing_to_change`,
 * sans appel au modèle.
 *
 * ⚠️ Seulement quand TOUT ce que la note a rangé est une exclusion
 * (`noteIsExclusionOnly`). Un goût, une envie, un mémo changent la
 * composition de toute la semaine : ceux-là recomposent.
 */
export function noteIsExclusionOnly(outcome: Pick<NoteOutcome, "announced">): boolean {
  return outcome.announced.length > 0 &&
    outcome.announced.every((a) =>
      (a.kind === "preference" || a.kind === "next_plan") && a.sense === "food.exclude"
    );
}

/**
 * ⟳ 2026-09-25 — LA RETOUCHE EST LOCALE QUAND LA NOTE NE DEMANDE QUE ÇA.
 * Une exclusion seule (`noteIsExclusionOnly`), ou un remplacement « à la place
 * de X, mets Y » accompagné de ses préférences (Y est rangé en `food.prefer`,
 * une autre exclusion peut l'accompagner). Tout le reste — un goût seul, une
 * envie, un mémo, une portion — change la semaine : recomposition.
 */
export function noteIsLocalEdit(outcome: Pick<NoteOutcome, "announced" | "swaps">): boolean {
  if (outcome.swaps.length > 0) {
    return outcome.announced.every((a) =>
      (a.kind === "preference" || a.kind === "next_plan") &&
      (a.sense === "food.exclude" || a.sense === "food.prefer")
    );
  }
  return noteIsExclusionOnly(outcome);
}

export async function editExclusions(
  input: ComposeDraftInput,
  draftId: string,
  opts: WaitForDraftOptions = {},
  /** ⟳ 2026-09-25 — les remplacements pour CE plan (`[]` = aucun). */
  swaps: ReadonlyArray<NoteSwap> = [],
): Promise<PlanDraft> {
  // Même corps que `editCells` (plan remplacé compris), sans case nommée.
  return await editOrRecompose(input, opts, async () => {
    const payload = await callGenerator(input, "draft", opts.replaces ?? null, {
      operation: "edit_cells",
      draft_id: draftId,
      cells: [],
      cells_from: "exclusions",
      swaps: swaps.map((w) => ({ from: w.from, to: w.to, member_id: w.memberId })),
    }, opts.onProgress);
    return {
      plan: { ...readDraftPlan(payload), planKind: "household" as const },
      envelope: readDraftEnvelope(payload),
    };
  });
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
  /** ⟳ 2026-09-15 · LOT B — le stade de la ligne, pour l'écran qui attend. */
  onProgress?: (progress: DraftProgress) => void,
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

  // ⟳ 2026-09-21 — `replaces` PASSE AUSSI AVEC `draft`, et il n'écrit rien :
  // le serveur exclut ce plan de sa garde de chevauchement, c'est tout.
  // L'adoption qui suit le renomme avec `replace_current`, et c'est elle qui
  // retire l'ancien plan.
  const replacing = replaces;

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
    // ⛔ SUR LES TROIS GESTES AUSSI. Le nombre de sessions se pose exactement
    // pareil à qui mange seul. Sans lui sur l'adoption, le plan ÉCRIT ne
    // serait pas celui qu'on vient de montrer.
    cooking_sessions: input.cookingSessions,
    preferences: input.preferences,
    origin: input.origin,
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
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-15 · LOT E — L'ACCEPTATION, ET LA LIGNE QUI DÉCIDE DE LA SUITE.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Le serveur ne compose plus dans la requête : il ouvre la ligne, répond 202
  // en quelques secondes — `accepted`, ou `draft_in_flight` avec l'identifiant
  // de la MÊME demande déjà en vol — et finit en arrière-plan. Supabase coupe
  // toute fonction qui n'a pas répondu en 150 s ; une composition de foyer en
  // prend 244 à 281. Mesuré le 2026-09-15 : la première tentée en hébergé est
  // morte sans rien écrire.
  //
  // ⛔ AVANT CE LOT, LE 202 `draft_in_flight` ÉTAIT LU COMME UN PLAN VIDE (un
  // 2xx arrive dans `data`, pas dans `error`). Les deux 202 mènent au même
  // endroit : la ligne, relue jusqu'à `done`.
  const early = asRecord(data);
  const earlyDraftId = typeof early?.draft_id === "string" ? early.draft_id.trim() : "";
  if (
    !error && earlyDraftId !== "" &&
    (early?.accepted === true || early?.error === "draft_in_flight")
  ) {
    return await waitForDraftRow(earlyDraftId, { onProgress });
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
