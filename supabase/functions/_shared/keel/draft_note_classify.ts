/**
 * LE RETOUR SUR LE BROUILLON, CLASSÉ VERS TROIS PORTES — lot A du chantier
 * « la mémoire à trois destinations » (2026-09-03). Le PROMPT et la RELECTURE.
 * **Rien d'autre.**
 *
 * Autorité produit: `docs/keel/NOMENCLATURE-MEMOIRE.md` §2 (deux sources,
 * trois destinations), §5 (matrice, ligne ①), §8.1 (les dix phrases).
 * Socle: `retained_item.ts` (ce fichier ne le modifie pas et n'en réécrit rien).
 * Magasins: `retained_items` (①, durable), `memo` (③), `retained_next_plan`
 * (l'encart). Porte d'écriture: `retained_items_io.ts`. L'appel modèle et la
 * persistance vivent dans `draft_note_classify_io.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QU'IL FERME — « UN RETOUR DIT DANS LE CHAT VIT LE TEMPS DU TOUR »
 * ═══════════════════════════════════════════════════════════════════════════
 * La phrase écrite sur un brouillon (`body.draft_note`) part au modèle par
 * `plan_draft_note.ts::draftNoteInstruction`, compose UN plan, et **disparaît
 * avec la requête**. Ce module transforme cette phrase en mémoire, une fois,
 * au moment où le plan est ÉCRIT — dans la bonne destination.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ TROIS PORTES, ESSAYÉES DANS L'ORDRE, ET JAMAIS DEUX
 * ═══════════════════════════════════════════════════════════════════════════
 *   ① `preferences` — réductible à (personne, aliment | préparation, exclure |
 *      revoir) sans perdre de sens → `retained_items`, **DURABLE**. « Mon fils
 *      n'aime pas le poisson » n'est pas pour une semaine (matrice §5,
 *      renversée le 2026-09-03: avant, tout ce que ce producteur écrivait
 *      était `next_plan`, et la personne le redisait à chaque plan — mesuré).
 *   ② un DEGRÉ (« trop gros », « trop long », « trop compliqué ») → **RIEN**.
 *      Un indice se bouge depuis une question fermée du bilan, jamais depuis
 *      une phrase (§2.3). La phrase a déjà agi sur le plan qu'elle annotait.
 *      Le modèle le DIT (`skipped.why = degree`), et c'est compté.
 *   ③ `notes` — ni ① ni ②, et le générateur en a besoin: « Léa a danse le
 *      mardi soir » → le mémo, avec sa PERSONNE et son `when`.
 *   + `next_plan` — ce que la phrase DATE elle-même (« cette semaine »), et
 *      les envies → l'encart, forme inchangée.
 *
 * ⛔ LE REPLI « TOUT LE MONDE » EST INTERDIT quand la phrase nomme quelqu'un.
 * Le sujet est `household` (le défaut) ou `member:<uuid>`, joint PAR
 * IDENTIFIANT au rôle — jamais un prénom, jamais une ressemblance. Un id hors
 * rôle est un REFUS compté. Deux enfants du même sexe rendent « mon fils »
 * indécidable: l'abstention est la bonne réponse, et elle est dite au modèle.
 *
 * ⛔ LES DESCRIPTIONS SONT RENDUES DEPUIS `canProduce`, JAMAIS RETAPÉES. Le
 * 2026-09-01, le prompt enseignait `logistics.set` trois lignes sous la ligne
 * qui l'interdisait, et le retour de la personne a brûlé en silence. Fermer
 * une famille dans la matrice la retire du prompt AU MÊME INSTANT.
 *
 * ⚠️ LA PROMESSE ET LA CLÉ DE SCHÉMA SE TOUCHENT, PAR PORTE. Cicatrice
 * chiffrée: 0 % de conformité quand elles sont éloignées. Un test d'adjacence
 * par porte (< 300 caractères, même message).
 *
 * PURE MODULE: no I/O, no clock, no randomness. Le jour, l'ancre et l'instant
 * d'écriture arrivent TOUJOURS en paramètre.
 */

import {
  canProduce,
  HOUSEHOLD_SUBJECT,
  memberSubject,
  parseRetainedDay,
  parseRetainedItem,
  parseRetainedKind,
  RETAINED_KINDS,
  type RetainedItem,
  type RetainedKind,
  type RetainedSubject,
  EXCLUSION_FORCES,
  type ExclusionForce,
  RHYTHM_OCCASIONS,
  type RhythmOccasion,
} from "./retained_item.ts";
import {
  DRAFT_NOTE_DIETS,
  DRAFT_NOTE_SAFETY_KINDS,
  type DraftNoteSafetyReading,
  EMPTY_DRAFT_NOTE_SAFETY,
  readDraftNoteSafety,
} from "./draft_note_safety.ts";
import {
  MEMORY_CLARIFICATION_ABOUTS,
  MEMORY_CLARIFICATION_MAX_OPTIONS,
  type ClarificationAbout,
  type PendingClarification,
} from "./memory_clarification.ts";
import {
  isoMondayOf,
  type NextPlanEntry,
  parseIsoInstant,
} from "./retained_next_plan.ts";
import {
  type MemoLine,
  type MemoWhen,
  parseMemoLine,
  parseMemoWhen,
} from "./memo.ts";
import { DRAFT_NOTE_MAX_CHARS } from "./plan_draft_note.ts";
// ⟳ 2026-09-09 (chirurgie locale, pièce 3) — LE LECTEUR DES CASES est celui
// du générateur (`readCellEdits`): même vocabulaire, même plafond, mêmes refus.
// Un second lecteur ici divergerait au premier jeton ajouté.
import { type CellEdit, readCellEdits } from "./cell_edit.ts";
import { DAY_TOKENS } from "./tokens.ts";
// ⛔ `LIGHT_BEARING_SLOTS`, ET PAS `RHYTHM_OCCASIONS`, POUR LE TIROIR ⑥.
//
// Seuls trois moments portent la marque « léger », et c'est arithmétique: une
// collation pèse déjà 0,10 de la journée, la marquer légère demanderait au plan
// de composer ≈ 40 kcal — rien, servi comme une décision. Proposer les six au
// modèle fabriquerait un TIROIR MUET: il rangerait « léger au goûter », le
// lecteur le garderait, et `parseMemberLight` le jetterait sans un mot.
//
// ✅ `meal_extras.ts` N'IMPORTE RIEN (vérifié): le lire ne peut pas fermer de
// cycle. C'est la même précaution que l'en-tête de `household_habits.ts`, dont
// le premier jet a fait tomber six fichiers de test d'un coup.
import { LIGHT_BEARING_SLOTS } from "./meal_extras.ts";
// ⟳ 2026-09-23 — LE TIROIR ⑪, LES À-CÔTÉS: le vocabulaire vient du socle.
// ✅ `side_courses_types.ts` n'importe qu'un TYPE (`tokens.ts`): aucun cycle.
import {
  SIDE_COURSE_KINDS,
  SIDE_COURSE_SLOTS,
  type SideCourseKind,
  type SideCourseSlot,
} from "./side_courses_types.ts";

// ===========================================================================
// LE JETON DE LA MATRICE
// ===========================================================================

/**
 * ⛔ `"draft_note"`, ET JAMAIS `"written"`.
 *
 * `canProduce("written", …)` rend `true` pour LES HUIT familles. Un producteur
 * serveur qui se déclarerait `written` contournerait donc **la matrice entière
 * par un seul mot**, et la ligne s'afficherait ensuite « tu l'as écrit ».
 * Épinglé à son littéral par le test.
 */
export const DRAFT_NOTE_PRODUCER = "draft_note" as const;

/**
 * ⟳ 2026-09-22 · LOT B — COMBIEN DE SOUVENIRS UNE SEULE PHRASE PEUT LAISSER.
 *
 * ── LE DÉFAUT QU'IL MESURE, VU EN BASE SUR LE SEUL COMPTE RÉEL ──────────
 * Une phrase — « mets des bols de flocons d'avoines avec du lait d'avoine et
 * des choses dedans genre graines amendes etc.. » — a produit **cinq
 * souvenirs durables**, chacun une règle permanente du foyer. La personne a
 * demandé UNE chose: changer son petit-déjeuner. Le produit en a retenu cinq,
 * indépendantes, pour toujours — et le plan peut désormais servir des amandes
 * au dîner en se croyant fidèle.
 *
 * ⛔ CE PLAFOND NE RÉPARE PAS ÇA. La réparation est dans la consigne (une
 * recette est UN plat, pas N préférences). Celui-ci est ce qui le MESURE:
 * `over_cap > 0` dit que la consigne ne tient pas sur ce cas, et c'est le seul
 * moyen de le savoir sans relire des notes une par une.
 *
 * ── ⚠️ POURQUOI SIX, ET PAS UN NOMBRE MIEUX FONDÉ ───────────────────
 * Parce qu'il n'y en a pas. La note la plus chargée du corpus des 50 en
 * produit QUATRE légitimement (`composite-taille-et-aliment`); six laisse donc
 * une marge d'une phrase qu'on n'a pas encore écrite, et refuse la liste
 * d'ingrédients. C'est un réglage, il est nommé, il est épinglé, et le changer
 * doit se lire ici.
 *
 * ── ⛔ IL COUPE PAR LA QUEUE, ET ÇA SE COMPTE ──────────────────────
 * Le même geste que `buildHouseholdVoices` et pour la même raison: « les k
 * premiers » est la seule règle qui se raconte. Jeter au hasard, ou refuser la
 * note entière, coûterait à la personne des mots qu'elle a vraiment écrits.
 */
export const DRAFT_NOTE_MAX_RETAINED = 6;

/** LES FAMILLES QUE CE PRODUCTEUR A LE DROIT D'ÉCRIRE — **CALCULÉES**. */
export const DRAFT_NOTE_KINDS: readonly RetainedKind[] = RETAINED_KINDS
  .filter((kind) => canProduce(DRAFT_NOTE_PRODUCER, kind));

/** LES FAMILLES INTERDITES À CE PRODUCTEUR — le complément, sur la même source. */
export const DRAFT_NOTE_FORBIDDEN_KINDS: readonly RetainedKind[] = RETAINED_KINDS
  .filter((kind) => !canProduce(DRAFT_NOTE_PRODUCER, kind));

/**
 * ⟳ 2026-09-08 — CE QU'UNE PHRASE PEUT DIRE D'UNE PART: **le sens, et qui**.
 *
 * ⛔ CE N'EST PAS UN `RetainedItem`, ET C'EST LA DÉCISION DU PROPRIÉTAIRE.
 * « Ma mère ne mange pas autant » déplace `household_member_bodies.appetite`
 * d'un cran — un CHAMP que la personne voit sur sa fiche, donc l'écran et le
 * plan lisent la même valeur. Un `portion.adjust` en mémoire serait une seconde
 * vérité à côté de l'écran, et les deux s'empileraient (−10 % et −5 % = −14,5 %
 * sur une seule phrase), puisqu'ils visent la même cible du jour.
 *
 * ⛔ AUCUNE AMPLITUDE, JAMAIS. Le modèle ne rend que `down` / `up`; de combien
 * ça bouge appartient au code, et vaut un cran. Le prompt ne lui propose même
 * pas la clé.
 *
 * ⚠️ CE MODULE NE L'APPLIQUE PAS. Il CLASSE. L'écriture de l'appétit demande
 * une RPC `_for` (celle qui existe lit `auth.uid()`, NULL en service_role) et
 * appartient à l'appelant — comme tout le reste ici.
 */
/**
 * ⟳ 2026-09-08 (lot 4) — UNE PART SANS BOUCHE, ET LES BOUCHES QUE ÇA PEUT ÊTRE.
 * Le sens est déjà lu (jamais une amplitude); les options sont des ids du rôle,
 * vérifiés. La réponse de la personne en fait un `PortionMove`.
 */
export interface PortionQuestion {
  readonly text: string;
  readonly direction: "down" | "up";
  readonly options: readonly string[];
}

export interface PortionMove {
  /** L'uuid de la bouche visée. ⛔ Jamais `household`: voir le lecteur. */
  readonly memberId: string;
  readonly direction: "down" | "up";
}

/** Les trois axes de la CUISINE qu'une phrase peut pousser d'un cran. */
export const SETTING_AXES = ["time", "difficulty", "variety"] as const;
export type SettingAxis = (typeof SETTING_AXES)[number];

/**
 * ⟳ 2026-09-08 — CE QU'UNE PHRASE PEUT DIRE DU TRAVAIL DE CUISINE: **l'axe,
 * et le sens**. « C'est trop long à cuisiner » ⇒ `{time, down}`.
 *
 * ⛔ CE N'EST PAS UN `logistics.set`, ET LA DIFFÉRENCE EST CELLE QUI A FERMÉ
 * `logistics.set` AU LOT M5. Un item retenu était une COPIE du réglage, relue
 * au moment de composer: l'écran disait 45 min, le plan était fait sur 35.
 * Ici la phrase déplace **le champ lui-même** (`practical_constraints`), par la
 * même porte que le bilan (`persistFieldChangesFor`), avec la même trace —
 * l'écran et le plan lisent la même valeur. Décision du propriétaire.
 *
 * ⛔ AUCUNE VALEUR, JAMAIS. Ni minutes, ni nom de cran: le modèle ne rend que
 * `down` / `up`, et QUEL champ bouge (le style s'il est déclaré, sinon le
 * temps ou la difficulté) est décidé par le code du bilan, pas par lui.
 *
 * ⚠️ PAS DE `member_id`: ce sont les réglages de la CUISINE, pas d'une
 * personne. Le prompt le dit, et le lecteur n'en lit pas.
 */
export interface SettingMove {
  readonly about: SettingAxis;
  readonly direction: "down" | "up";
}

/**
 * ⟳ 2026-09-21 — CE QU'UNE PHRASE DIT DE LA TAILLE D'UN REPAS: **le moment,
 * et s'il est léger**. « très léger le matin » ⇒ `{breakfast, light: true}`.
 *
 * ⛔ CE N'EST PAS UN `RetainedItem`, ET C'EST LA MÊME RAISON QU'AU LOT M5.
 * Un souvenir serait une COPIE du réglage, relue au moment de composer:
 * l'écran dirait « petit-déjeuner léger » et le plan serait fait sur autre
 * chose. Ici la phrase déplace LE CHAMP que la personne voit et peut
 * décocher — `household_member_habits.light`, celui que
 * `LIGHT_SLOT_WEIGHT` lit déjà.
 *
 * ⛔ AUCUNE AMPLITUDE, JAMAIS. Le modèle rend `true` ou `false`; ce que pèse
 * un repas léger appartient au code (0,15 · 0,25 · 0,20 de la journée, selon
 * le moment). Le prompt ne lui propose même pas de nombre.
 *
 * ⚠️ CE MODULE NE L'APPLIQUE PAS. Il CLASSE. L'écriture appartient à
 * l'appelant, comme pour la part et pour les réglages de cuisine.
 *
 * ⚠️ MESURÉ LE 2026-09-21: sans ce tiroir, « le matin c'est plutôt quelque
 * chose de très léger » n'avait AUCUNE destination — le levier existait et
 * aucun producteur ne l'écrivait. Petit-déjeuner resté à 500 kcal.
 */
export interface SlotSizeMove {
  readonly slot: RhythmOccasion;
  /** `true` = ce moment est un petit repas; `false` = il ne l'est plus. */
  readonly light: boolean;
  /** ⚠️ `null` EST UNE RÉPONSE: toute la table mange léger à ce moment. */
  readonly memberId: string | null;
}

/**
 * ⟳ 2026-09-23 — CE QU'UNE PHRASE DIT D'UN À-CÔTÉ: **le type, le moment, et
 * si la personne le prend**. « il ne prend jamais de dessert » ⇒
 * `{kind: dessert, slot: null, takes: false}`.
 *
 * ⛔ CE N'EST PAS UN `RetainedItem`, POUR LA RAISON DU LOT M5 ET DU TIROIR ⑥.
 * Le réglage a un CHAMP que la personne voit et change elle-même
 * (`household_member_habits.slots[].side_courses`, lu par
 * `parseMemberSideCourses`). Un souvenir « pas de dessert » serait une copie
 * de ce champ, relue pendant que la fiche dirait autre chose.
 *
 * ⛔ UN À-CÔTÉ N'EST PAS UN ALIMENT. « pas de fromage le soir » reste un
 * `food.exclude` au dîner (tiroir ①): il retire le fromage de TOUT ce qui est
 * servi le soir, plat compris, et le moteur retire alors l'à-côté fromage du
 * dîner. Seule une phrase qui parle de PRENDRE le plat d'à côté vient ici.
 *
 * ⚠️ `slot: null` = LES DEUX MOMENTS (déjeuner et dîner): une phrase qui ne
 * nomme pas le repas vaut pour les deux, et l'appelant la déplie.
 * ⚠️ `memberId: null` = TOUTE LA TABLE, déplié sur le rôle par l'appelant —
 * comme le tiroir ⑥, et pour la même raison: retirer un dessert à chacun ne
 * retire pas d'énergie (le plat reprend ce que l'à-côté ne porte plus).
 */
export interface SideCourseMove {
  readonly kind: SideCourseKind;
  readonly slot: SideCourseSlot | null;
  /** `true` = la personne veut ce type; `false` = elle ne le prend pas. */
  readonly takes: boolean;
  readonly memberId: string | null;
}

/**
 * LA PORTE ① — les familles qui sont une PRÉFÉRENCE. Calculées: tout ce que
 * la matrice permet, sauf l'envie, qui est `next_plan` par construction du
 * socle (`craving ⇒ next_plan`).
 */
export const DRAFT_NOTE_PREFERENCE_KINDS: readonly RetainedKind[] = DRAFT_NOTE_KINDS
  .filter((kind) => kind !== "craving");

/** L'ENCART — tout ce que la matrice permet, l'envie comprise. */
export const DRAFT_NOTE_NEXT_PLAN_KINDS: readonly RetainedKind[] = DRAFT_NOTE_KINDS;

/**
 * POURQUOI LE MODÈLE N'A RIEN RANGÉ — liste FERMÉE, et chaque motif est compté.
 *
 * ⚠️ « Champ déclaré par le modèle = compteur obligatoire ». Sans ce vocabulaire,
 * « la phrase 1 n'a rien produit » se lirait comme un prompt cassé, alors que
 * c'est LA réponse attendue sur « c'est trop long à cuisiner » (§8.1).
 */
export const DRAFT_NOTE_SKIP_REASONS = [
  /** Un degré — trop gros, trop long, trop dur, pas assez varié. L'indice se bouge au bilan. */
  "degree",
  /** Un réglage — les repas qu'on prend, les jours de cuisine, le budget. Écran. */
  "setting",
  /** Ce qui a été mangé. Aucune destination. */
  "meal_story",
  /** Un merci, une question, une remarque sur la longueur du plan. */
  "other",
] as const;
export type DraftNoteSkipReason = (typeof DRAFT_NOTE_SKIP_REASONS)[number];

/** Les trois portes, telles que le journal les nomme. */
export const DRAFT_NOTE_GATES = ["preferences", "notes", "next_plan"] as const;
export type DraftNoteGate = (typeof DRAFT_NOTE_GATES)[number];

/**
 * ⟳ 2026-09-08 (lot 4) — LES PORTES QU'UNE QUESTION PEUT NOMMER: les trois du
 * journal, PLUS la part. « Ma mère ne mange pas autant » sans prénom
 * reconnaissable n'a nulle part où aller: le tiroir 4 refuse le foyer, et une
 * question `who` sur `gate: "preferences"` avec `kind: "portion.adjust"`
 * tombait en `forbidden_kind` — mesuré: la phrase mourait en silence, comptée
 * mais jamais posée. Une part se demande donc par SA porte, et sa réponse
 * déplace un appétit (`answerDraftNotePortion`), jamais un item retenu.
 */
export const DRAFT_NOTE_CLARIFY_GATES = [...DRAFT_NOTE_GATES, "portions"] as const;
export type DraftNoteClarifyGate = (typeof DRAFT_NOTE_CLARIFY_GATES)[number];

/**
 * CE QU'EST CHAQUE FAMILLE, **UNE PHRASE PAR FAMILLE ET LES HUIT PRÉSENTES**.
 * `Record<RetainedKind, …>` EXHAUSTIF: une neuvième famille ne compile plus
 * tant que personne ne lui a écrit sa phrase. Le rendu ne parcourt que les
 * listes calculées: fermer une case dans `canProduce` retire son enseignement
 * du prompt au même instant.
 */
const KIND_BLURBS: Readonly<Record<RetainedKind, string>> = {
  "food.exclude": "a food or a dish they do not want any more.",
  "food.prefer": "a food or a dish they want to see again.",
  "method.avoid": "a preparation that does not work for them (fried, raw, spicy).",
  "method.prefer": "a preparation they like.",
  "portion.adjust": "how big a serving was.",
  "rhythm.set": "which meals of the day they take, and when.",
  "logistics.set": "which days they cook, how long, how hard, how varied, what they spend.",
  craving: "one specific thing they want soon: \"fajitas this week\".",
};

/**
 * CE QUI DOIT ÊTRE DIT **JUSTE APRÈS** UNE FAMILLE. La règle de direction a été
 * mesurée en run réel: sans elle, « Plus de poisson cette semaine » ressortait
 * en `food.prefer` — l'INVERSE. Attachée à `food.prefer`, pas posée à un index.
 */
const KIND_NOTES: Partial<Readonly<Record<RetainedKind, string>>> = {
  "food.prefer":
    "  DIRECTION FIRST, AND WHEN IN DOUBT DROP IT. These two are opposites, and getting them backwards makes the next plan serve MORE of the very thing they just rejected. French « plus de X » means BOTH \"no more X\" and \"more X\" — the negation is routinely dropped in speech, and the sentence alone does not always say which. ⚠️ BUT A REASON IN THE SENTENCE DECIDES IT: « plus de fruits à coque, ça me rend malade », « plus de poulet, on en a marre » can only mean NO MORE — nobody asks for more of what makes them ill or tired of it. The doubt is only when NOTHING else in the sentence says which: « plus de saumon » alone. When you cannot tell the direction, leave the item out of every drawer AND name it in \"skipped\" (7) with \"other\" — an answer with every list empty and no reason reads as a note nobody read. Being asked once more costs them a sentence; being served more of what they rejected costs them a week.",
};

/** POURQUOI CHAQUE FAMILLE INTERDITE L'EST — une raison PAR famille. */
const FORBIDDEN_REASONS: Readonly<Record<RetainedKind, string>> = {
  "food.exclude": "",
  "food.prefer": "",
  "method.avoid": "",
  "method.prefer": "",
  craving: "",
  // ⟳ 2026-09-08 — LA FAMILLE RESTE INTERDITE **COMME `kind`**, et pourtant la
  // part se range: elle a son propre tiroir (4), qui n'a pas de clé `kind` du
  // tout — il a `direction`. Les deux phrases ne se contredisent donc pas, et
  // le motif doit le DIRE, sinon le modèle lit un refus sans issue et range en
  // `skipped` ce que le tiroir 4 attend.
  "portion.adjust":
    "a share is not a preference — it has its own drawer (4), where you give the direction and nothing else",
  "rhythm.set": "a rhythm is a standing fact, not a mood about one week",
  "logistics.set":
    "these are SETTINGS they can see and change on their own screen — filing a copy here would let their settings say one thing while their plan is built on another",
};

/** Ce que la porte « degree » couvre, mot pour mot dans le prompt. */
const SKIP_BLURBS: Readonly<Record<DraftNoteSkipReason, string>> = {
  // ⟳ 2026-09-08 — « TROP GROS » ET « TROP PETIT » SONT SORTIS D'ICI: ils ont
  // le tiroir 4. Ce qui reste sont les degrés qui n'ont TOUJOURS pas de canal
  // par-phrase — la difficulté, le temps, la variété — et qui se règlent sur
  // leur écran ou en question fermée au bilan.
  // ⟳ 2026-09-08 — LE DEGRÉ N'A PRESQUE PLUS RIEN: la part a le tiroir 4, le
  // travail de cuisine a le tiroir 5. Reste ce qui juge le PLAN ENTIER sans
  // nommer un axe — et qui ne se règle nulle part.
  degree:
    "a judgement on the plan as a whole with no axis to move — \"too much food overall\", \"the plan is too long\", \"not enough meals\". ⛔ NOT a share on someone's plate (drawer 4), NOT the cooking being long, hard, or repetitive (drawer 5)",
  setting:
    "which meals of the day they take, which days they cook, what they spend, how often they shop — SETTINGS with no drawer here, that they change on their own screen. ⛔ NOT the cooking time, difficulty, or variety: those have drawer 5",
  meal_story: "what they ate, or did not eat. That is not filed anywhere",
  other: "a thank-you, a question, a remark about the plan being long or short",
};

// ===========================================================================
// LE PROMPT — la promesse TOUCHE la clé de schéma, PORTE PAR PORTE
// ===========================================================================

const WHO_RULES = [
  'WHO — "member_id", on every entry of "preferences", "next_plan" and "notes":',
  "  null when it is for everyone at the table — that is the normal answer when the note names nobody. An id COPIED EXACTLY from the roster below when the note names that person. NEVER a first name. ⚠️ « nous », « on », « pour nous », « chez nous », \"we\", \"us\" ARE the whole table: in (1), (2) and (3) that is ONE entry with null — never one per person. Only (4) and (10) split the table into one entry per person, because a share and an allergy belong to one body.",
  '  ⚠️ A REASON IN THE FIRST PERSON DOES NOT NAME A PERSON. "no more nuts, they make ME ill", "I can\'t stand fennel" — the "me" is WHY, not WHO the rule is for. The rule itself names nobody, so it is for everyone at the table: member_id: null. ⛔ NEVER "clarify" here — there is nothing to ask, and asking costs them a tap to learn what they already wrote.',
  '  ⚠️ THE ONE WHO WRITES SPEAKS FOR THE WHOLE TABLE BY DEFAULT. "no tofu in the morning", "I don\'t want fish at breakfast", "I fancy fajitas this week", "fish in the morning is fine by me" are the cook deciding the menu: they name nobody in particular, and they stay null. A first-person verb alone does not name a person. ⛔ "ME" IS THE PERSON WRITING ONLY WHEN THE SENTENCE SETS THEM APART FROM THE OTHERS, OR IS ABOUT THEIR OWN BODY OR PLATE — "for me", "me, I…", "my breakfast", "not for me", "I\'m still hungry after dinner": then it is the roster line with "writes": true, copy that id. "breakfast is just a coffee for me" is that one person\'s breakfast; "me, no starch at night" is that one person\'s dinner. Filed as null it puts four breakfasts on a coffee; and a menu rule filed on the writer leaves the rest of the table free to be served the very thing the cook just banned. ⛔ THIS DOES NOT UNDO THE RULE ABOVE — "they make ME ill" is still a REASON, and the rule it explains is for the table. "X and me" when X is the one who writes cannot name two people: "clarify" with "about": "who". When no roster line has "writes": true, "me" eats alone at this table: null.',
  '  A RELATIVE WORD IS THE NORMAL WAY PEOPLE WRITE: "my son", "my daughter", "my wife". Resolve it against the roster using "age" (minor/adult) and "sex". "my son" is the MINOR whose sex is male; "my wife" is an ADULT whose sex is female. If exactly ONE person at the table fits, copy that id.',
  '  ⛔ A PLURAL IS NOT AN AMBIGUITY, IT IS SEVERAL PEOPLE — AND THIS IS THE RULE THE NEXT ONE IS MOST OFTEN MISREAD AS OVERRIDING. "the kids", "the little ones", "the girls", "both of them", "everyone but Tom" name MORE THAN ONE person ON PURPOSE. File ONE ENTRY PER PERSON they cover, each with that person\'s own id. Never member_id: null (that would add the adults nobody mentioned), and NEVER "clarify" — there is nothing to ask, they already told you who. A question here can only take ONE of them, so asking DESTROYS what they said.',
  '  Only a SINGULAR word that fits more than one person is ambiguous ("my daughter" when two daughters are at the table). That, and only that, is what the next rule is about.',
  '  ⛔ IF TWO PEOPLE FIT, OR NONE, OR EITHER "age" OR "sex" IS null FOR THE ONE YOU WOULD PICK: do NOT file it, and do NOT fall back to member_id: null, which means EVERYONE at the table and would apply one person\'s fact to all of them. Put that entry in "clarify" (see 8) with "about": "who", and in "options" the ids of the people it could be — the ones who fit, or everyone at the table when nobody clearly fits. Being asked which one costs them one tap; taking a food away from the whole table because one child dislikes it costs them the week.',
] as const;

/**
 * QUAND L'ALIMENT LUI-MÊME N'EST PAS RÉSOLU — la seconde moitié de `clarify`.
 *
 * ⚠️ ELLE NE VAUT QUE POUR UNE RÉFÉRENCE, JAMAIS POUR UN ALIMENT NOMMÉ. « Les
 * enfants ont détesté le curry » nomme le curry: on le range, même s'il n'est
 * pas au plan. « J'ai pas aimé la viande » ne nomme rien — et sans la question,
 * le produit exclut « viande » pour toute la table, c'est-à-dire une catégorie
 * que personne n'a demandée. C'est le même défaut, mesuré, que « pain complet »
 * découpé en « pain ».
 */
const WHAT_RULES = [
  'WHAT — on the same three drawers, when the note points at a food they were SERVED only by a CATEGORY or a PRONOUN ("the meat", "it", "that dish", "the thing on Tuesday") and MORE THAN ONE food in the plan below could be what they mean:',
  '  Put that entry in "clarify" (see 8) with "about": "what", and in "options" the plan foods it could mean, each copied EXACTLY from the list of plan foods given below. Never a food you rephrase, never one that is not in that list.',
  '  If exactly ONE plan food fits, do not ask: file it normally, with that food as "text".',
  '  ⛔ A CATEGORY STATED AS A RULE IS NOT A "what", AND IT IS FILED AS THE CATEGORY — never swapped for the one plan food that fits and never asked about: "the kids never eat fish" is "poisson", not the one fish dish in this plan; "less red meat" is "viande rouge", not the beef on Thursday. The category is what they said, it covers next week\'s fish too, and the plan check unfolds it into every species on its own. Narrowed to one dish, the rule lets every other fish through. The "what" is for a note that REACTS to a dish on the plan ("I did not like the meat"), where the category stands for the dish they ate.',
  '  ⛔ A food they NAMED is never a "what", even when it is not in the plan: "no more curry" is a preference, not a question.',
  '  ⛔ If the list of plan foods below is empty, never use "about": "what" at all.',
] as const;

export const DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT = [
  "You read ONE short note someone wrote on a DRAFT meal plan, and you FILE what it says into the right drawer. You are a filing clerk. You are not a nutritionist, you do not write the plan, and you have no opinion on what they want.",
  "",
  "The plan has ALREADY been composed with their note in front of it. Your only job is to keep what the note says for the NEXT plans. Nothing you return changes the plan they are looking at.",
  "",
  "Return ONE JSON object, and nothing else. No prose, no code fence.",
  "",
  '{ "preferences": [ ... ], "next_plan": [ ... ], "notes": [ ... ], "portions": [ ... ], "settings": [ ... ], "slots": [ ... ], "cells": [ ... ], "skipped": [ ... ], "clarify": [ ... ], "safety": [ ... ], "side_courses": [ ... ] }',
  "",
  "For each thing the note says, try the drawers IN THIS ORDER and file it in the FIRST one that fits. Never in two. Every drawer may be empty, and an empty drawer is a correct answer.",
  "",
  // ── PORTE ① — la promesse est SUR la ligne de `"kind"` ──────────────────
  '1. "preferences" — a food or a preparation they do not want any more, or want to see again. LASTING, a STANDING FACT and never a mood — see (2): "my son doesn\'t like fish". Each entry is exactly:',
  "{",
  `  "kind": exactly one of ${
    DRAFT_NOTE_PREFERENCE_KINDS.join(" | ")
  } — NEVER craving here (an urge for this week goes in "next_plan"), and NEVER ${
    DRAFT_NOTE_FORBIDDEN_KINDS.join(", NEVER ")
  }: those are not preferences, they go in "skipped" (see 7). NEVER a share that is too big or too small either — that has its own drawer (4). NEVER the cooking being too long, too hard, or not varied — that has its own drawer (5). ⛔ NEVER A COURSE someone takes or skips at lunch or dinner — "he never has dessert", "no starter in the evening", "no bread at the table": that is their switch in "side_courses" (11). "no cheese in the evening" names a FOOD, and stays here with dinner as its meal. ⛔ AND NEVER A FOOD RULE TIED TO A DAY OF THE WEEK: "never fish on Thursdays", "no red meat on Mondays" is a fact with a day, and it goes in "notes" (3) with its "when". Filed here it would ban that food EVERY day — six days they never asked for. ⛔ AND NEVER AN ALLERGY, AN INTOLERANCE OR A DIET STATED WITH ITS WORD ("allergic", "intolerant", "is vegetarian"): those go in "safety" (10). Without the word, it is a taste and it stays here,`,
  '  "text": the thing you are filing, in THEIR language and as close to THEIR OWN WORDS as you can. This is the line they will read on their own memory card, and they can edit it. Never a sentence you invented, never longer than what they wrote. ⛔ ONE FOOD PER ENTRY when the sentence LISTS foods: "no tofu or fish" is two entries, "tofu" and "fish". They share the same note, and each is checked on its own; a list kept in ONE line is checked as a whole, so it matches nothing and protects nobody. ⛔ BUT ONE ENTRY — NOT ONE PER INGREDIENT — WHEN THEY DESCRIBE ONE DISH: "oat bowls with oat milk and seeds and almonds" is ONE thing they want at that meal, and the words that join it (with, in it, on top, and some) say so. File the dish ("oat bowl"), not four foods. Four entries would be four standing rules, each checked on its own, and the plan could then serve almonds at dinner and call it honoured — which is not what they asked. ⚠️ THE FOOD ALONE, WITHOUT WHAT HOLDS IT OR MEASURES IT: "a bowl of muesli" is "muesli", "130 g of wholemeal bread" is "wholemeal bread". The container and the quantity belong to one meal; the memory is about the food. ⚠️ THE FOOD, NOT THE VERDICT AND NOT THE PERSON: "kind" already carries what they think of it, and "member_id" who it is about. "lesoeuf ça convient pas à Christèle" files as "les œufs" — never the whole sentence. A sentence kept whole is searched whole in the plan: it matches nothing, and the rule never bites. ⚠️ AND SPELLED THE WAY THE FOOD IS SPELLED, not the way they typed it: "lesoeuf" becomes "les œufs". This line is SEARCHED in the plan — a misspelling matches nothing and the rule never bites — and they read it on their card. Their exact words are kept in the quote, so nothing of what they wrote is lost,',
  '  "member_id": see WHO below,',
  `  "occasion": exactly one of ${
    RHYTHM_OCCASIONS.join(" | ")
  } when the note says the rule holds AT ONE MEAL OF THE DAY only — "no fish AT BREAKFAST", "nothing fried IN THE EVENING" — or null when it holds all day. ⛔ NEVER A MEAL THEY DID NOT NAME: null is the normal answer, and a meal you invent turns a morning rule into an all-day ban nobody asked for. ⛔ AND NEVER LEAVE THE MEAL INSIDE "text": a moment written into the sentence is a moment nothing can read — the plan cannot check it, and the same food comes back at that very meal,`,
  `  "force": ON ${
    DRAFT_NOTE_PREFERENCE_KINDS.filter((k) => k === "food.exclude" || k === "method.avoid")
      .join(" AND ")
  } ONLY — exactly one of ${
    EXCLUSION_FORCES.join(" | ")
  }. "never" when they want it GONE: "no more curry", "he can't stand fish". "less" when they want LESS OF IT, not none: "not so much cheese", "too much pasta lately", "a bit less bread". ⛔ THIS ONE DECIDES WHETHER THE FOOD IS TAKEN OFF THEIR PLATE. "less" filed as "never" removes for good what they only wanted reduced, and they find out by noticing an absence — so when the sentence is about HOW MUCH, answer "less". ⛔ AND A COMPARISON IS NOT A BAN: "muesli rather than a bowl of cereal" files "muesli" as "food.prefer" and files NOTHING for the cereal — neither "never" nor "less". They ranked two foods; they did not reject one. Filed as "never", the cereal is gone every morning for good, and nobody asked for that. Omit the key on ${
    DRAFT_NOTE_PREFERENCE_KINDS.filter((k) => k === "food.prefer" || k === "method.prefer")
      .join(" and ")
  }: wanting something has no degree here,`,
  "}",
  "WHAT EACH KIND IS FOR:",
  ...DRAFT_NOTE_PREFERENCE_KINDS.flatMap((k) => {
    const note = KIND_NOTES[k];
    return note ? [`- ${k} — ${KIND_BLURBS[k]}`, note] : [`- ${k} — ${KIND_BLURBS[k]}`];
  }),
  "",
  // ── L'ENCART — la promesse est SUR la ligne du titre ────────────────────
  '2. "next_plan" — what the note DATES ITSELF, in either of two ways. ① It names the window: "no fish THIS WEEK", "I fancy fajitas". ② ⛔ OR IT GIVES A REASON THAT WILL STOP BEING TRUE — a season, a mood, a passing state: "not in the mood for tartiflette, it is only early September", "I am fed up with chicken at the moment", "no soup, it is still warm out". The reason is the date: September ends, a mood passes, the weather turns. Filing these in (1) would turn "not right now" into "never again" — and they would never find out, because the only sign is a food that quietly stops appearing. When in doubt between (1) and (2), choose (2): being asked again costs them one sentence, a silent ban costs them the food. ⛔ BUT A TASTE IS NOT A MOOD: "my son doesn\'t like fish" gives no reason that expires, and it belongs in (1). Same entries as "preferences", and one more kind:',
  `  "kind": exactly one of ${DRAFT_NOTE_NEXT_PLAN_KINDS.join(" | ")},`,
  ...DRAFT_NOTE_NEXT_PLAN_KINDS.filter((k) => k === "craving").map((k) =>
    `- ${k} — ${KIND_BLURBS[k]}`
  ),
  "",
  // ── PORTE ③ — la promesse est SUR la ligne du titre, et la clé `when` juste après
  '3. "notes" — a FACT about a person that no drawer above can hold and that matters for composing: a rehearsal, a late dinner, a day that is not like the others. NEVER a food or a preparation they like or dislike (that is a preference), NEVER a degree about the WORK such as too long or too complicated (that is "skipped"), NEVER a share that is too big or too small (that is "portions"), and NEVER a request to change ONE meal of THIS plan that names both its day and its moment (that is "cells", 9). A food someone ALWAYS has at one meal ("apple compote every afternoon") is a FACT with a slot, not a taste: it goes here, with "when". Each entry is exactly:',
  "{",
  '  "text": their fact, in THEIR language and their own words, one line,',
  '  "member_id": see WHO below,',
  `  "when": { "weekday": one of ${DAY_TOKENS.join(" | ")} or null, "slot": one of ${
    RHYTHM_OCCASIONS.join(" | ")
  } or null } when the fact is about one day or one meal — or null when it is about every day. NEVER invent a day or a slot they did not write.`,
  "}",
  "",
  // ── PORTE ④ — LA PART DE QUELQU'UN. Le sens, jamais l'amplitude.
  //
  // ⛔ LA PROMESSE TOUCHE LA CLÉ. « Tu ne donnes que la direction » est écrit
  // SUR la ligne de `"direction"`, pas trois paragraphes plus bas: une consigne
  // séparée de sa clé n'est pas lue (mesuré à 0 % dans ce dépôt).
  '4. "portions" — the note says someone\'s SHARE on the plate is too big or too small: "my mother doesn\'t eat that much", "way too much for her", "I am still hungry after dinner". Each entry is exactly:',
  "{",
  '  "direction": exactly one of down | up — "down" when they say it is too much, "up" when they say it is not enough. ⛔ THE DIRECTION AND NOTHING ELSE. Never a number, never a percentage, never a word of size, never "a bit" or "a lot": HOW FAR it moves is not yours to say. It is always ONE notch, and the code sets it — the same one notch a closed question moves at the end of a plan,',
  '  "text": their own words, exactly as in "preferences" above — this is the line they will read on their memory card,',
  '  "member_id": see WHO below. ⛔ AND HERE IT MATTERS MORE THAN ANYWHERE: a share belongs to ONE person. When the note does not say clearly whose plate it is about, do NOT guess and do NOT use null — put it in "clarify" with "about": "who" and "gate": "portions", the entry carrying this same "direction" and "text". Taking food off the whole table because one person said they eat less is the exact harm this drawer exists to avoid,',
  "}",
  '  ⚠️ A SENTENCE THAT NAMES A MEAL OF THE DAY IS NOT THIS. "in the evening I don\'t eat that much", "very light in the morning" are about that ONE meal, not about their whole day: they go in "slots" (6). This drawer is for the size of someone\'s day, at EVERY meal.',
  '  ⚠️ "WE EAT LESS", "ON MANGE MOINS", "WE ARE ALL EATING A BIT LESS" IS THE WHOLE TABLE, and the whole table is SEVERAL PEOPLE: ONE ENTRY PER PERSON on the roster, each with their own id and the same direction — the plural rule of WHO, applied here. Never member_id: null (refused, and they are told nothing was changed), never "clarify" (there is nothing to ask), never "skipped" as a degree (it names a direction, not a size).',
  '  ⛔ NOT a remark about the plan being long to cook, complicated, or repetitive. Those are about the WORK, and they have their own drawer (5).',
  "",
  // ── PORTE ⑤ — LE TRAVAIL DE CUISINE. L'axe et le sens, jamais une valeur.
  //
  // ⛔ LA PROMESSE TOUCHE LA CLÉ, comme au tiroir 4: « la direction et rien
  // d'autre » est SUR la ligne de `"direction"`.
  '5. "settings" — the note says the COOKING itself was too much or too little, for the whole table: "too long to cook", "too complicated", "not varied enough", "I had more time this week", "too many different dishes". Each entry is exactly:',
  "{",
  `  "about": exactly one of ${SETTING_AXES.join(" | ")} — time is how long cooking takes, difficulty is how hard the recipes are, variety is how many different dishes,`,
  '  "direction": exactly one of down | up — "down" when they want LESS of it (less time, simpler, more repetition), "up" when they want MORE (more time, more ambitious, more variety). ⛔ THE DIRECTION AND NOTHING ELSE. Never a number of minutes, never the name of a level: it moves ONE notch, and the code decides which setting that notch lands on,',
  "}",
  '  ⚠️ NO "member_id" here: these are settings of the KITCHEN, not of a person. "my son finds it too complicated" is still about the cooking — file it, without a person.',
  '  ⛔ NOT how many days they cook, what they spend, how often they shop, or which meals of the day they take. Those have no drawer here and go in "skipped" (7).',
  "",
  // ── PORTE ⑥ — LA TAILLE D'UN REPAS QU'ILS PRENNENT DÉJÀ (2026-09-21).
  //
  // ⛔ LA PROMESSE TOUCHE LA CLÉ, comme aux tiroirs 4 et 5: « vrai ou faux et
  // rien d'autre » est SUR la ligne de `"light"`.
  //
  // ⛔ ET CE N'EST PAS UN ITEM RETENU, POUR LA RAISON DU LOT M5. Un souvenir
  // serait une COPIE du réglage, relue au moment de composer: l'écran dirait
  // « petit-déjeuner léger » et le plan serait fait sur autre chose. Ici la
  // phrase déplace LE CHAMP que la personne voit et peut décocher
  // (`household_member_habits.light`), par la même porte que le bilan.
  //
  // ⚠️ MESURÉ LE 2026-09-21: « le matin c'est plutôt quelque chose de très
  // léger » n'avait AUCUNE destination. Le levier existait (la case de la
  // fiche, `LIGHT_SLOT_WEIGHT`) et aucun producteur ne l'écrivait: le
  // petit-déjeuner de la personne est resté à 500 kcal.
  '6. "slots" — the note says ONE MEAL OF THE DAY is a small one, or is not a small one any more, for someone who ALREADY takes that meal: "breakfast is just a fruit", "very light in the morning", "he needs a big dinner". Each entry is exactly:',
  "{",
  `  "slot": exactly one of ${LIGHT_BEARING_SLOTS.join(" | ")} — the meal they NAMED, never guessed. ⛔ THESE THREE ONLY: a snack already weighs a tenth of the day, and calling it light would ask the plan for about forty calories — nothing, served as a decision. "she skips her afternoon snack" is a setting, and it goes in "skipped" (7),`,
  '  "light": true when that meal is a small one for them, false when it is NOT a small one any more. ⛔ TRUE OR FALSE AND NOTHING ELSE. Never a number, never calories, never a word of size, never "a bit": this is the "light meal" box on their own sheet, and the code alone decides what a light meal weighs,',
  '  "member_id": see WHO below. null when the whole table eats light at that meal,',
  "}",
  '  ⛔ NOT WHICH MEALS THEY TAKE. "she does not have dinner", "we should add an afternoon snack" say that a meal exists or does not — that is a setting on their own screen, and it goes in "skipped" (7). This drawer is ONLY about a meal they ALREADY take being small, or not small any more.',
  '  ⛔ NOT the size of someone\'s whole DAY. "my mother doesn\'t eat that much" is their share at EVERY meal — drawer 4.',
  '  ⚠️ THE FOODS NAMED WITH THE SIZE ARE FILED TOO, in (1): "very light in the morning, fruit or muesli, but no eggs" is this drawer (breakfast, light) AND three entries in (1) — fruit and muesli preferred at breakfast, eggs excluded at breakfast. The size says HOW MUCH, the foods say WHAT, and neither absorbs the other: a light breakfast with no idea what she likes at it is half of what she wrote.',
  "",
  // ── CE QU'ON NE RANGE PAS — dit, et compté ──────────────────────────────
  '7. "skipped" — what you read and deliberately did NOT file, one entry each, so it can be counted. EVERY thing the note says that you did not file in 1, 2, 3, 4, 5, 6, 9, 10 or 11 MUST appear here, once: never return eight empty lists without saying why. Each entry is exactly:',
  `{ "why": exactly one of ${DRAFT_NOTE_SKIP_REASONS.join(" | ")} }`,
  ...DRAFT_NOTE_SKIP_REASONS.map((why) => `- ${why} — ${SKIP_BLURBS[why]},`),
  `  The families you never file, each for its own reason:${
    DRAFT_NOTE_FORBIDDEN_KINDS.map((k) => `\n    · ${k} — ${KIND_BLURBS[k]} ${FORBIDDEN_REASONS[k]};`).join("")
  }`,
  '  ⛔ NEVER use "skipped" for something you could not attribute to a person or to a food. That is not a thing you chose not to file — it is a thing you could not file yet, and it goes in "clarify" (8).',
  "",
  // ── PORTE ⑤ — ce qu'on n'a pas pu ranger FAUTE D'UNE PRÉCISION ──────────
  // La promesse est SUR la ligne du titre, et le schéma juste après: une
  // consigne séparée de sa clé par trois paragraphes n'est pas lue.
  '8. "clarify" — one thing the note says that you could NOT file because you do not know WHO it is about or WHICH food it means. One entry per thing. Everything you put here is filed NOWHERE ELSE — not in 1, 2, 3, 4, 5, 6 or 7. They will be asked, once, with buttons; if they do not answer, nothing is kept. Each entry is exactly:',
  "{",
  `  "about": exactly one of ${MEMORY_CLARIFICATION_ABOUTS.join(" | ")},`,
  `  "gate": exactly one of ${DRAFT_NOTE_CLARIFY_GATES.join(" | ")} — the drawer it WOULD have gone to; "portions" only with "about": "who",`,
  '  "entry": the entry exactly as you would have written it in that drawer (same keys), with "member_id": null when you are asking who,',
  `  "options": between 1 and ${MEMORY_CLARIFICATION_MAX_OPTIONS} candidates — member ids from the roster when "about" is "who", plan foods copied EXACTLY when it is "what". Never a first name, never a food you rephrased, never more than ${MEMORY_CLARIFICATION_MAX_OPTIONS}.`,
  "}",
  "",
  // ── PORTE ⑧ — LA CASE DE CE PLAN-CI (2026-09-09). Jour ET moment, ou rien.
  //
  // ⛔ LA PROMESSE TOUCHE LA CLÉ: « BOTH » est sur la ligne du titre, et le
  // repli est nommé à côté (« the evening » sans jour = une note; « Thursday »
  // sans moment = skipped). Rien n'est écrit pour une case: c'est une
  // instruction pour CE plan, que le front rend au composeur (`edit_cells`).
  '9. "cells" — the note asks to change ONE meal of THIS plan and names BOTH its day AND its moment: "Friday dinner, chicken instead", "jeudi midi c\'était trop lourd", "Saturday breakfast: something without eggs". Filed NOWHERE else — not in 1, 2, 3 or "skipped": it is a request for this plan, not a fact to remember. Each entry is exactly:',
  "{",
  `  "day": exactly one of ${DAY_TOKENS.join(" | ")} — the day they NAMED. Never guessed, never today by default,`,
  `  "slot": exactly one of ${RHYTHM_OCCASIONS.join(" | ")} — the moment they NAMED,`,
  '  "text": what they want for THAT meal, in THEIR language and their own words, one line,',
  "}",
  '  ⛔ BOTH or nothing: "in the evening I eat less" has no day — it is a note (3) with "when"; "Thursday is a mess" has no moment — it is "skipped" (other). A rule said for good ("never fish on Thursdays") is a note (3) with "when", not a cell.',
  '  ⚠️ ONE entry per meal named. "Thursday and Friday dinner" is two entries.',
  "",
  ...WHO_RULES,
  "",
  ...WHAT_RULES,
  "",
  "",
  // ── PORTE ⑩ — LA SÉCURITÉ (2026-09-23). Rouverte sur décision du
  // propriétaire, supprimée le 2026-09-09. ⛔ LA PROMESSE TOUCHE LA CLÉ: la
  // condition (« le mot, sinon rien ») est sur la ligne du titre ET sur
  // celle de `because`, qui est ce que la relecture VÉRIFIE.
  '10. "safety" — an ALLERGY, an INTOLERANCE or a DIET, stated AS SUCH. This is the only list that reaches their medical sheet: what goes here is checked against every food served, for good, and only the sheet takes it back. So it takes CERTAINTY, and certainty means THE WORD. An allergy or an intolerance: "allergic", "allergy", "intolerant", "intolerance", "can\'t tolerate", "coeliac" — « allergique », « allergie », « intolérant(e) », « ne tolère pas », « cœliaque ». A diet: "vegetarian", "vegan", "pescatarian", "gluten-free" said of WHO SOMEONE IS OR HAS BECOME — « je suis végétarienne », « Léa est devenue vegan », « on est végétariens ». ⛔ WITHOUT THAT WORD IT IS NOT HERE: "it makes me ill", "it doesn\'t agree with her", « je supporte pas », « ça passe pas », « elle ne mange plus de viande » are tastes — (1), food.exclude. WHEN IN DOUBT, (1): a taste filed as an allergy locks a food out of the house for good; an allergy filed as a taste is still kept off the plan. Each entry is exactly:',
  "{",
  `  "kind": exactly one of ${DRAFT_NOTE_SAFETY_KINDS.join(" | ")},`,
  '  "member_id": see WHO below — and here it is NEVER null: an allergy belongs to a person. "I" is the person writing (the roster line with "writes": true). "we are all allergic to…", « on est végétariens » is ONE ENTRY PER PERSON. If you cannot tell who ("my daughter" with two daughters), do NOT file it here: it becomes ONE entry in "clarify" (8) with "about": "who", "gate": "preferences" and the food as a food.exclude — and NOTHING in (1): filed there with member_id null it would ban the food for the whole table instead of asking,',
  '  "text": for an allergy or an intolerance, the allergen alone, spelled the way it is spelled ("arachides", "lactose", "fruits à coque") — never the verdict, never the person. For a diet, null,',
  `  "diet": for a diet only, exactly one of ${DRAFT_NOTE_DIETS.join(" | ")} — "omnivore" when they say someone is NO LONGER on a diet (« Léa n\'est plus végétarienne », « on remange de la viande »). null on an allergy or an intolerance,`,
  '  "because": ⛔ THE WORDS OF THE NOTE THAT SAY IT, COPIED LETTER FOR LETTER, a few words: « allergique aux arachides », « intolérante au lactose », « est devenue vegan ». It is CHECKED against the note: an entry whose words are not in the note is dropped, and nothing is written,',
  "}",
  '  ⛔ A DIET TIED TO A DAY, A MEAL OR A FREQUENCY IS NOT A DIET: "vegetarian on Monday nights", « sans viande au dîner », « on essaie de manger végé » — a note (3) with its "when", or a preference (1).',
  '  ⛔ AN ALLERGY IS NEVER TAKEN OFF BY A NOTE: « Zoé n\'est plus allergique » goes in "skipped" as "setting" — the sheet is where it comes off.',
  '  ⛔ FILED HERE, IT IS FILED NOWHERE ELSE — not also in (1). The same food twice is the same rule twice.',
  '  Return "safety": [] when the note says none of this. That is the normal answer.',
  "",
  // ── PORTE ⑪ — LES À-CÔTÉS (2026-09-23). Le type, le moment, oui ou non.
  //
  // ⛔ LA PROMESSE TOUCHE LA CLÉ, comme aux tiroirs 4, 5 et 6: « vrai ou faux
  // et rien d'autre » est SUR la ligne de `"takes"`, et « jamais le matin »
  // SUR celle de `"slot"`.
  //
  // ⛔ ET CE N'EST PAS UN ITEM RETENU: la phrase déplace le réglage que la
  // personne voit sur sa fiche (`household_member_habits.side_courses`).
  //
  // ⚠️ LE PIÈGE EST « fromage » ET « pain »: ce sont aussi des ALIMENTS.
  // « pas de fromage le soir » reste une exclusion au dîner (①), qui retire le
  // fromage du plat ET de l'à-côté. Seule une phrase sur le fait de PRENDRE le
  // plat d'à côté vient ici — d'où l'exemple nommé dans les deux tiroirs.
  '11. "side_courses" — the note says someone TAKES or SKIPS a whole COURSE served next to the dish at lunch or dinner: a starter, a cheese course, a dessert, bread at the table. "he never has dessert", "no starter in the evening", "she loves to finish with cheese", "no bread at the table". The app serves one small course next to the dish, and this is the switch on their own sheet that says which. Each entry is exactly:',
  "{",
  `  "kind": exactly one of ${SIDE_COURSE_KINDS.join(" | ")} — the COURSE they named: starter is something before the dish (a salad, raw vegetables, a soup), cheese is a cheese course, dessert is what ends the meal (a fruit, a yogurt, a sweet), bread is bread on the table,`,
  `  "slot": exactly one of ${SIDE_COURSE_SLOTS.join(" | ")} when they named that meal, or null when they named none — null means BOTH lunch and dinner. ⛔ NEVER breakfast or a snack: there is no course there, and "no bread in the morning" is a FOOD, in (1),`,
  '  "takes": true when they WANT that course, false when they do NOT take it. ⛔ TRUE OR FALSE AND NOTHING ELSE. Never a size, never a food, never "sometimes": which food, how much and how often belong to the app,',
  '  "member_id": see WHO above. null when the whole table takes it or skips it ("at home we never have dessert in the evening"). ⛔ When a singular word could be two people, do NOT file it here and do NOT use null: name it in "skipped" (7) with "other" — this drawer has no question, and one person\'s dessert is not the whole table\'s,',
  "}",
  '  ⛔ A FOOD IS NOT A COURSE. "no cheese in the evening", "less bread", "no more yogurt" name a FOOD: they go in (1), with their meal — and the app then keeps that food off the side course too. Only a sentence about TAKING the course itself comes here: "never has dessert", "to finish the meal", "as a starter", "on the table".',
  '  ⚠️ THE FOOD NAMED WITH THE COURSE IS FILED TOO: "no dessert for Léa, she hates yogurt" is this drawer (dessert, false) AND a food in (1) (yogurt). Neither absorbs the other.',
  '  Return "side_courses": [] when the note says none of this. That is the normal answer.',
].join("\n");

/** Une bouche, réduite à ce dont ce prompt a besoin. */
export type DraftNoteMember = {
  /** L'uuid du membre. C'est LUI que le modèle recopie, jamais le prénom. */
  readonly memberId: string;
  /** Comment la personne l'appelle. Sert au modèle à LIRE la note, pas à écrire. */
  readonly label: string;
  /**
   * ADULTE OU MINEUR, ET `null` QUAND ON NE SAIT PAS.
   * ⚠️ `ageState` ET PAS `ageBand`: `ageBandOf` rend `null` sous 18 ans — donc
   * précisément `null` pour les bouches qu'il s'agit d'identifier.
   */
  readonly ageState: "adult" | "minor" | null;
  /** LE SEXE DÉCLARÉ, ou `null`. REQUIS, jamais `?`. */
  readonly sex: "male" | "female" | "other" | null;
  /**
   * LA PERSONNE DONT LE COMPTE ÉCRIT LA NOTE (`household_members.role =
   * 'owner'`). REQUIS, jamais `?`.
   *
   * ⚠️ MESURÉ LE 2026-09-23, sur des notes hors corpus: sans ce champ, « le
   * petit dej c'est juste un café POUR MOI » cochait « léger » pour TOUTE LA
   * TABLE (6/6) et « moi le soir je mange pas de féculents » retirait les
   * féculents à quatre personnes (3/3). Le rôle ne disait pas qui écrit, et la
   * règle « une raison à la première personne ne nomme personne » débordait
   * sur le SUJET de la phrase. `true` sur une seule ligne du rôle, jamais
   * plusieurs; aucune ligne à `true` = un compte qui mange seul.
   */
  readonly writes: boolean;
};

/**
 * LE TOUR « UTILISATEUR »: la note, la langue, et le rôle.
 *
 * ⚠️ `members` EST REQUIS, ET `[]` EST UNE RÉPONSE. `[]` dit « personne d'autre
 * à table »; `undefined` dirait « je n'ai pas su lire le foyer ».
 */
/**
 * ⟳ 2026-09-24 — UN PLAT BARRÉ SUR L'APERÇU (« Remplacer »), ET QUI LE MANGE.
 * Les bouches viennent des boîtes du brouillon rangé (`resolveRejections`),
 * jamais de l'écran.
 */
export interface RejectedDishContext {
  readonly title: string;
  readonly eaterIds: readonly string[];
}

/**
 * ⟳ 2026-09-24 — LES QUESTIONS DE PRÉCISION POSÉES EN UNE FOIS. L'écran les
 * pose dans une couche, cochées; au-delà, la question n'est pas posée et rien
 * n'est écrit pour elle (le serveur ne devine jamais).
 */
export const DRAFT_NOTE_QUESTIONS_MAX = 3;

export function buildDraftNoteClassifyPrompt(args: {
  note: string;
  contentLocale: string;
  members: readonly DraftNoteMember[];
  planFoods: readonly string[];
  /**
   * ⟳ 2026-09-24 — LES PLATS BARRÉS DONT LA NOTE PORTE LES RAISONS. REQUIS,
   * jamais `?`: `[]` dit « une note ordinaire », et le prompt est alors
   * identique à l'octet près à celui d'avant ce lot.
   */
  rejectedDishes: readonly RejectedDishContext[];
}): string {
  const lines: string[] = [];
  lines.push(
    `The note, exactly as they typed it: ${JSON.stringify(String(args.note ?? ""))}`,
  );
  lines.push(
    `They write in ${
      String(args.contentLocale ?? "").trim() || "en"
    }. Write "text" in that language.`,
  );
  const roster = (args.members ?? []).filter((m) =>
    String(m?.memberId ?? "").trim() !== ""
  );
  if (roster.length === 0) {
    // ⚠️ DIT EXPLICITEMENT, PAS OMIS. Un rôle absent laisserait le modèle
    // supposer qu'il existe des convives dont on ne lui a pas donné la liste.
    lines.push(
      'There is nobody else at this table. "member_id" is null on every entry.',
    );
  } else {
    lines.push(
      'The people at this table — copy an id EXACTLY, never a name. "writes": true marks the person whose account this note is written from: ' +
        roster
          .map((m) =>
            JSON.stringify({
              member_id: m.memberId,
              called: String(m.label ?? ""),
              // ⚠️ LES CLÉS SONT ÉCRITES MÊME À `null`. Une clé absente laisse
              // le modèle supposer qu'on la lui a cachée; une clé à `null` dit
              // « personne ne l'a renseigné », ce qui doit le faire s'abstenir.
              age: m.ageState,
              sex: m.sex,
              // ⚠️ ÉCRIT À `false` AUSSI: « moi » se résout contre la ligne à
              // `true`, et une clé absente sur les autres laisserait le modèle
              // deviner qui écrit — c'est ce qu'il faisait (« Thomas et moi »
              // → Christèle, parce que Thomas était nommé à part).
              writes: m.writes === true,
            })
          )
          .join(", "),
    );
  }
    // ── LES ALIMENTS DU PLAN — dits, ou dits ABSENTS ───────────────────────
  // ⚠️ LE CAS VIDE EST ÉCRIT, PAS OMIS. Même arbitrage que le rôle vide juste
  // au-dessus: une liste absente laisserait le modèle supposer qu'il existe des
  // plats qu'on ne lui a pas donnés, et proposer comme option un aliment qu'il
  // aurait inventé — que la relecture refuserait, après l'appel.
  const foods = (args.planFoods ?? [])
    .map((t) => String(t ?? "").trim())
    .filter((t) => t !== "");
  if (foods.length === 0) {
    lines.push(
      'The foods of the plan they annotated are not available. Never use "about": "what".',
    );
  } else {
    lines.push(
      "The foods in the plan they annotated — copy a term EXACTLY, never rephrase: " +
        JSON.stringify(foods),
    );
  }
  // ── ⟳ 2026-09-24 · LES PLATS BARRÉS — la règle et la liste sur UNE ligne ──
  // Une ligne de la note qui ne nomme personne parle de ceux qui MANGENT ce
  // plat: sans cette ligne, « trop sucré » sous le plat de Paul se rangeait
  // pour la personne qui écrit.
  const rejected = (args.rejectedDishes ?? []).filter((d) => String(d?.title ?? "").trim() !== "");
  if (rejected.length > 0) {
    lines.push(
      'Each line of the note is about ONE dish they turned down in this plan, written «dish» : what they said. A line that names nobody is about the people who eat that dish — use their member_id; everyone at the table ⇒ null: ' +
        JSON.stringify(rejected.map((d) => ({ dish: d.title.trim(), eaten_by: [...d.eaterIds] }))),
    );
  }
return lines.join("\n");
}

// ===========================================================================
// LA RELECTURE — trois portes, trois dénominateurs, et rien ne se perd en silence
// ===========================================================================

/** CE QUI N'EST PAS ENTRÉ PAR UNE PORTE, motif par motif. */
export interface DraftNoteRefusals {
  readonly total: number;
  /** `kind` hors de la liste fermée des huit. */
  readonly unknownKind: number;
  /** `canProduce(draft_note, kind)` a mordu, ou la famille n'est pas de cette porte. */
  readonly forbiddenKind: number;
  /** QUELLES familles, triées, dédoublonnées. */
  readonly forbiddenKinds: readonly string[];
  /** `member_id` qui n'est dans le rôle d'aucune bouche de ce foyer. */
  readonly unknownMember: number;
  /** `text` vide, ou plus long que la note dont il est censé sortir. */
  readonly badText: number;
  /** `when` présent mais hors vocabulaire (porte ③ seulement). */
  readonly badWhen: number;
  /** Le socle a refusé l'objet assemblé (`value`, forme, invariants). */
  readonly malformed: number;
  /** `about` hors des deux valeurs (porte ⑤ seulement). */
  readonly badAbout: number;
  /** `gate` hors des trois portes (porte ⑤ seulement). */
  readonly badGate: number;
  /**
   * `options` inutilisable (porte ⑤ seulement): liste vide, plus de quatre,
   * doublons, un id hors rôle sur un `who`, ou un aliment hors du plan sur un
   * `what`.
   *
   * ⚠️ C'EST LE REFUS LE PLUS IMPORTANT DE CETTE PORTE. Une question dont les
   * options ne sont pas vérifiables serait une question dont le tap écrit ce
   * que le modèle a inventé — un prénom mal orthographié devenu un sujet, un
   * aliment reformulé devenu une exclusion. Les options sont la seule chose que
   * le tap peut désigner, donc la seule chose qui doit être vraie.
   */
  readonly badOptions: number;
  /**
   * ⟳ 2026-09-22 · LOT B — CE QUE LE PLAFOND A COUPÉ.
   *
   * ⚠️ `over_cap > 0` NE DIT PAS « la note était trop longue »: il dit que la
   * consigne « une recette est UN plat » n'a pas tenu sur ce cas, et que la
   * phrase a été lue comme une liste d'ingrédients. C'est le seul moyen de le
   * savoir sans relire des notes une par une.
   */
  readonly overCap: number;
}

export interface DraftNoteGateCount {
  /** Ce que le modèle a proposé dans cette liste — la longueur brute. */
  readonly proposed: number;
  /** Ce qui est ressorti, prêt pour la porte. */
  readonly kept: number;
  /** `proposed - kept`, ventilé. */
  readonly refused: DraftNoteRefusals;
}

/** Ce que le modèle a LU et n'a PAS rangé — compté par motif. */
export interface DraftNoteSkipped {
  readonly total: number;
  readonly degree: number;
  readonly setting: number;
  readonly mealStory: number;
  readonly other: number;
  /** Un `why` hors liste: le prompt ne tient pas sur ce point. */
  readonly unknown: number;
}

/**
 * UNE ENTRÉE QU'ON N'A PAS PU RANGER, ET LA QUESTION QUI LA DÉBLOQUE.
 *
 * ⚠️ ELLE PORTE TOUT CE QU'IL FAUT POUR L'ÉCRIRE PLUS TARD, et rien de plus.
 * Ce qui manque à l'appel — la note, le jour, l'ancre — est ajouté par l'io au
 * moment d'ouvrir la question: ce module ne les répète pas, il les a déjà en
 * argument et les recopier ici les ferait diverger.
 */
export interface DraftNoteClarifyEntry {
  readonly about: ClarificationAbout;
  readonly gate: DraftNoteGate;
  /** `null` pour une note: le mémo n'a pas de famille. */
  readonly kind: RetainedKind | null;
  readonly text: string;
  /** Le sujet DÉJÀ connu. `null` quand c'est justement ce qu'on demande. */
  readonly subject: RetainedSubject | null;
  readonly when: MemoWhen | null;
  /**
   * ⟳ 2026-09-23 — LE MOMENT ET LA FORCE SURVIVENT À LA QUESTION. Le prompt
   * demande « l'entrée exactement comme dans son tiroir (mêmes clés) », et le
   * lecteur les JETAIT: « pas de poisson LE MATIN pour ma fille », une fois la
   * fille désignée, serait devenu « pas de poisson » toute la journée. Lus par
   * `parseRetainedItem` avec un sujet de passage — un jeton hors liste fait
   * tomber l'entrée (`malformed`), jamais un repli. `null` sur un mémo.
   */
  readonly occasion: RhythmOccasion | null;
  readonly force: ExclusionForce | null;
  /** Les candidats — ids du rôle ou aliments du plan. Vérifiés, jamais crus. */
  readonly options: readonly string[];
}

export interface DraftNoteClassification {
  /** Les trois nombres AGRÉGÉS sur les trois portes. Se lisent d'un bloc. */
  readonly proposed: number;
  readonly kept: number;
  readonly refused: DraftNoteRefusals;
  /** ① — DURABLE, `retained_items`. */
  readonly preferences: DraftNoteGateCount & { readonly items: readonly RetainedItem[] };
  /** ③ — le mémo, « ce que Sophia sait ». */
  readonly notes: DraftNoteGateCount & { readonly lines: readonly MemoLine[] };
  /** L'encart — `{item, anchor, writtenAt}`, forme inchangée. */
  readonly nextPlan: DraftNoteGateCount & { readonly entries: readonly NextPlanEntry[] };
  /**
   * ④ — LA PART DE QUELQU'UN (2026-09-08). Un MOUVEMENT, pas un item retenu:
   * l'appelant en fait un cran d'appétit sur la fiche de cette bouche.
   */
  readonly portions: DraftNoteGateCount & { readonly moves: readonly PortionMove[] };
  /**
   * ⑤ — LE TRAVAIL DE CUISINE (2026-09-08). Un MOUVEMENT par axe, jamais une
   * valeur: l'appelant le passe à la porte du BILAN, qui décide quel champ
   * bouge et refuse les bords. Voir `SettingMove`.
   */
  readonly settings: DraftNoteGateCount & { readonly moves: readonly SettingMove[] };
  /**
   * ⑥ — LA TAILLE D'UN MOMENT (2026-09-21). Un MOUVEMENT, pas un item
   * retenu: l'appelant coche (ou décoche) la case « repas léger » de la fiche
   * de cette bouche. Voir `SlotSizeMove`.
   */
  readonly slots: DraftNoteGateCount & { readonly moves: readonly SlotSizeMove[] };
  /**
   * ⑪ — LES À-CÔTÉS (2026-09-23). Un MOUVEMENT, pas un item retenu:
   * l'appelant pose (ou retire) le réglage d'un type d'à-côté sur la fiche de
   * cette bouche. Voir `SideCourseMove`.
   */
  readonly sideCourses: DraftNoteGateCount & { readonly moves: readonly SideCourseMove[] };
  /**
   * ⑧ — LA CASE DE CE PLAN-CI (2026-09-09). Rien n'est ÉCRIT pour elle: c'est
   * une instruction que `keel-read-note-v1` rend au front, qui la donne au
   * composeur (`operation: "edit_cells"`). Lue par le lecteur du générateur.
   */
  readonly cells: DraftNoteGateCount & { readonly requests: readonly CellEdit[] };
  readonly skipped: DraftNoteSkipped;
  /**
   * ⑤ — ce qui attend UNE précision. Chaque entrée est rangée nulle part
   * ailleurs: elle n'est ni dans ①, ni dans l'encart, ni dans ③, ni comptée
   * dans `skipped`. Sans réponse, elle n'existera jamais.
   */
  readonly clarify: DraftNoteGateCount & {
    readonly entries: readonly DraftNoteClarifyEntry[];
    /**
     * ⟳ 2026-09-08 (lot 4) — LES PARTS DONT ON NE SAIT PAS LA BOUCHE. À part
     * des `entries`: une réponse ici ne fabrique pas un item retenu, elle
     * déplace un appétit. Comptées dans `kept`, rangées nulle part ailleurs.
     */
    readonly portions: readonly PortionQuestion[];
    /** Combien portaient sur la personne, et combien sur l'aliment. */
    readonly who: number;
    readonly what: number;
  };
  /**
   * Les listes que le modèle a OMISES (clé absente). `[]` est une réponse;
   * une clé absente est un prompt que le modèle a lu de travers, et ça se
   * compte à part d'un vide.
   */
  /**
   * ⟳ 2026-09-23 — ⑩ LA SÉCURITÉ: allergie, intolérance, régime, DITS comme
   * tels dans la note, chacun avec sa preuve (`because`) vérifiée présente
   * dans la note. Écrits par `draft_note_safety_io.ts`, pas par la porte des
   * souvenirs: ce ne sont pas des souvenirs, c'est la fiche.
   */
  readonly safety: DraftNoteSafetyReading;
  readonly listsMissing: readonly string[];
}

/** Un refus de la classification ENTIÈRE, avant même de regarder les listes. */
export type DraftNoteClassifyRefusal =
  /** La charge n'est pas un objet portant au moins une des listes attendues. */
  | "unreadable_payload"
  /** `at` n'est pas un jour propre: on ne saurait pas dire « retenu de mardi ». */
  | "bad_day"
  /** La semaine visée n'est pas lisible: on ne saurait pas l'afficher. */
  | "bad_anchor";

export interface DraftNoteClassifyOutcome {
  readonly ok: boolean;
  readonly refusal: DraftNoteClassifyRefusal | null;
  readonly classification: DraftNoteClassification;
}

const EMPTY_REFUSALS: DraftNoteRefusals = {
  total: 0,
  unknownKind: 0,
  forbiddenKind: 0,
  forbiddenKinds: [],
  unknownMember: 0,
  badText: 0,
  badWhen: 0,
  malformed: 0,
  badAbout: 0,
  badGate: 0,
  badOptions: 0,
  overCap: 0,
};

const EMPTY_SKIPPED: DraftNoteSkipped = {
  total: 0,
  degree: 0,
  setting: 0,
  mealStory: 0,
  other: 0,
  unknown: 0,
};

export const EMPTY_DRAFT_NOTE_CLASSIFICATION: DraftNoteClassification = {
  proposed: 0,
  kept: 0,
  refused: EMPTY_REFUSALS,
  preferences: { proposed: 0, kept: 0, refused: EMPTY_REFUSALS, items: [] },
  notes: { proposed: 0, kept: 0, refused: EMPTY_REFUSALS, lines: [] },
  nextPlan: { proposed: 0, kept: 0, refused: EMPTY_REFUSALS, entries: [] },
  portions: { proposed: 0, kept: 0, refused: EMPTY_REFUSALS, moves: [] },
  settings: { proposed: 0, kept: 0, refused: EMPTY_REFUSALS, moves: [] },
  slots: { proposed: 0, kept: 0, refused: EMPTY_REFUSALS, moves: [] },
  sideCourses: { proposed: 0, kept: 0, refused: EMPTY_REFUSALS, moves: [] },
  cells: { proposed: 0, kept: 0, refused: EMPTY_REFUSALS, requests: [] },
  skipped: EMPTY_SKIPPED,
  clarify: {
    proposed: 0,
    kept: 0,
    refused: EMPTY_REFUSALS,
    entries: [],
    portions: [],
    who: 0,
    what: 0,
  },
  safety: EMPTY_DRAFT_NOTE_SAFETY,
  listsMissing: [],
};

/** Un compteur de refus MUTABLE, le temps d'une relecture. */
class Refusals {
  unknownKind = 0;
  forbiddenKind = 0;
  forbiddenKinds = new Set<string>();
  unknownMember = 0;
  badText = 0;
  badWhen = 0;
  malformed = 0;
  badAbout = 0;
  badGate = 0;
  badOptions = 0;
  /** ⟳ 2026-09-22 · LOT B — au-delà de `DRAFT_NOTE_MAX_RETAINED`. */
  overCap = 0;
  freeze(): DraftNoteRefusals {
    return {
      total: this.unknownKind + this.forbiddenKind + this.unknownMember +
        this.badText + this.badWhen + this.malformed + this.badAbout +
        this.badGate + this.badOptions + this.overCap,
      unknownKind: this.unknownKind,
      forbiddenKind: this.forbiddenKind,
      forbiddenKinds: [...this.forbiddenKinds].sort(),
      unknownMember: this.unknownMember,
      badText: this.badText,
      badWhen: this.badWhen,
      malformed: this.malformed,
      badAbout: this.badAbout,
      badGate: this.badGate,
      badOptions: this.badOptions,
      overCap: this.overCap,
    };
  }
}

function sumRefusals(parts: readonly DraftNoteRefusals[]): DraftNoteRefusals {
  const kinds = new Set<string>();
  for (const p of parts) for (const k of p.forbiddenKinds) kinds.add(k);
  const sum = (pick: (r: DraftNoteRefusals) => number) =>
    parts.reduce((n, r) => n + pick(r), 0);
  return {
    total: sum((r) => r.total),
    unknownKind: sum((r) => r.unknownKind),
    forbiddenKind: sum((r) => r.forbiddenKind),
    forbiddenKinds: [...kinds].sort(),
    unknownMember: sum((r) => r.unknownMember),
    badText: sum((r) => r.badText),
    badWhen: sum((r) => r.badWhen),
    malformed: sum((r) => r.malformed),
    badAbout: sum((r) => r.badAbout),
    badGate: sum((r) => r.badGate),
    badOptions: sum((r) => r.badOptions),
    overCap: sum((r) => r.overCap),
  };
}

/**
 * LIT CE QUE LE MODÈLE A RENDU, ET N'EN GARDE QUE CE QUE LA MATRICE PERMET.
 *
 * ── L'ORDRE DES PORTES, ET IL COMPTE ──────────────────────────────────────
 *  1. le jour et l'ancre, une fois pour toute la charge;
 *  2. par liste, par entrée: `kind` dans la liste fermée ET dans les familles
 *     de CETTE porte (`canProduce` d'abord — c'est là que `portion.adjust`
 *     tombe, et c'est le nombre qu'on regarde);
 *  3. le sujet, JOINT PAR IDENTIFIANT au rôle — un id hors rôle est un REFUS,
 *     jamais un repli sur `household`;
 *  4. `text`, non vide et pas plus long que la note d'où il sort;
 *  5. LE SOCLE EST LE DERNIER MOT: `parseRetainedItem` pour ① et l'encart,
 *     `parseMemoLine` pour ③. Ce module ne réécrit aucune de leurs règles.
 *
 * @param today le jour LOCAL de la personne, `YYYY-MM-DD`.
 * @param targetWeek un jour de la SEMAINE VISÉE — le premier jour du plan
 *   qu'on vient d'écrire. L'ancre stockée en est le lundi ISO (affichage).
 * @param writtenAt l'INSTANT de l'écriture (ISO), fourni par l'appelant — la
 *   règle de vie de l'encart le compare à `validated_at`. `null` est accepté et
 *   fait retomber la ligne sur la règle du jour; un appelant vivant le passe.
 * @param note la note d'origine — elle borne `text` et devient la citation.
 */
/**
 * ⟳ 2026-09-05 — `{ "weekday": null, "slot": null }` VEUT DIRE « pas de moment ».
 *
 * Mesuré au troisième tir réel de la question de portée: le modèle a rendu le
 * schéma de `when` avec ses deux clés à `null` au lieu de `null` tout court,
 * et `parseMemoWhen` l'a lu `unreadable` (à raison: un objet sans jour ni
 * moment ne dit rien). Ici, avant la porte, un objet dont AUCUNE clé ne porte
 * de valeur est la même réponse que `null` — le modèle a rempli le gabarit,
 * pas inventé un moment. Un objet qui porte un jour ou un moment illisible
 * reste un refus `badWhen`.
 */
function whenOrNull(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    // ⚠️ LES DEUX CLÉS PRÉSENTES ET EXPLICITEMENT `null` — le gabarit rempli.
    // `{}` reste un refus: « rien dedans » n'est pas « pas de moment ».
    if (
      "weekday" in row && "slot" in row && row.weekday === null &&
      row.slot === null
    ) {
      return null;
    }
  }
  return value;
}

export function readDraftNoteClassification(args: {
  raw: unknown;
  today: string;
  targetWeek: string;
  members: readonly DraftNoteMember[];
  note: string;
  writtenAt: string | null;
  /**
   * LES ALIMENTS DU PLAN QU'ELLE VIENT DE LIRE — requis, jamais optionnel.
   *
   * ⚠️ REQUIS ET NULLABLE-PAR-LE-VIDE, jamais `?`. Un appelant qui l'oublierait
   * ne verrait rien tomber: le modèle n'aurait simplement plus le droit de
   * demander « laquelle ? », et le produit rangerait de nouveau « la viande »
   * pour toute la table. Un paramètre de garde optionnel est une garde
   * désarmée, et ce dépôt le paie en boucle.
   *
   * `[]` est une RÉPONSE (une lane sans plat, un plan illisible): le prompt le
   * dit alors explicitement au modèle, qui n'a plus le droit d'utiliser `what`.
   */
  planFoods: readonly string[];
}): DraftNoteClassifyOutcome {
  const at = parseRetainedDay(args.today);
  if (!at) {
    return { ok: false, refusal: "bad_day", classification: EMPTY_DRAFT_NOTE_CLASSIFICATION };
  }
  const anchor = isoMondayOf(args.targetWeek);
  if (!anchor) {
    return { ok: false, refusal: "bad_anchor", classification: EMPTY_DRAFT_NOTE_CLASSIFICATION };
  }
  const lists = listsOf(args.raw);
  if (lists === null) {
    return {
      ok: false,
      refusal: "unreadable_payload",
      classification: EMPTY_DRAFT_NOTE_CLASSIFICATION,
    };
  }
  const writtenAt = parseIsoInstant(args.writtenAt);

  // Le rôle, réduit à un ENSEMBLE D'IDENTIFIANTS. C'est une jointure: égalité
  // de chaînes sur un uuid. ⛔ Aucun rapprochement par le prénom ni par le texte.
  const roster = new Set<string>();
  for (const member of args.members ?? []) {
    const id = String(member?.memberId ?? "").trim().toLowerCase();
    if (id) roster.add(id);
  }

  // Les aliments du plan, en ENSEMBLE et à l'identique: c'est une égalité, pas
  // une ressemblance. Un `trim` et rien d'autre — reformuler ici ferait
  // diverger ce qu'on propose de ce que la ceinture cherchera ensuite.
  const planFoods = new Set<string>();
  for (const term of args.planFoods ?? []) {
    const value = String(term ?? "").trim();
    if (value) planFoods.add(value);
  }

  const noteText = String(args.note ?? "").trim();
  // La borne de `text` est DÉRIVÉE, pas inventée: un `text` plus long que sa
  // source ne peut pas être « ses mots à elle ».
  const textMax = Math.min(
    DRAFT_NOTE_MAX_CHARS,
    noteText.length > 0 ? noteText.length : DRAFT_NOTE_MAX_CHARS,
  );

  /** Le sujet d'une entrée, ou `null` = REFUS (id hors rôle, jamais un repli). */
  const subjectOf = (record: Record<string, unknown>): string | null => {
    const rawMember = String(record.member_id ?? "").trim().toLowerCase();
    if (rawMember === "" || rawMember === "null") return HOUSEHOLD_SUBJECT;
    if (!roster.has(rawMember)) return null;
    return memberSubject(rawMember);
  };
  const textOf = (record: Record<string, unknown>): string | null => {
    const text = typeof record.text === "string" ? record.text.trim() : "";
    return text === "" || text.length > textMax ? null : text;
  };
  const asRecord = (row: unknown): Record<string, unknown> | null =>
    row && typeof row === "object" && !Array.isArray(row)
      ? row as Record<string, unknown>
      : null;

  // ── ① et l'encart: la même relecture, deux portes, deux scopes ──────────
  /**
   * ⟳ 2026-09-22 · LOT B — LE PLAFOND EST PARTAGÉ PAR LES DEUX PORTES.
   *
   * ⛔ UN PLAFOND PAR PORTE AURAIT LAISSÉ PASSER DOUZE SOUVENIRS: six
   * préférences plus six envies, pour une seule phrase. Ce qu'on borne est ce
   * qu'une phrase LAISSE DERRIÈRE ELLE, pas ce que chaque tiroir accepte.
   */
  let retainedKept = 0;

  const readItems = (
    rows: readonly unknown[],
    allowed: readonly RetainedKind[],
    scope: "durable" | "next_plan",
  ): { items: RetainedItem[]; refused: DraftNoteRefusals } => {
    const refusals = new Refusals();
    const items: RetainedItem[] = [];
    for (const row of rows) {
      const record = asRecord(row);
      if (!record) {
        refusals.malformed += 1;
        continue;
      }
      const kind = parseRetainedKind(record.kind);
      if (!kind) {
        refusals.unknownKind += 1;
        continue;
      }
      // ⛔ `canProduce` D'ABORD, puis la porte. Une famille que la matrice
      // refuse est l'échappatoire mesurée; une famille permise mais d'une
      // autre porte (craving dans ①) est un rangement de travers. Les deux
      // sont comptés sous le même nombre, et `forbiddenKinds` dit laquelle.
      if (!canProduce(DRAFT_NOTE_PRODUCER, kind) || !allowed.includes(kind)) {
        refusals.forbiddenKind += 1;
        refusals.forbiddenKinds.add(kind);
        continue;
      }
      const subject = subjectOf(record);
      if (!subject) {
        refusals.unknownMember += 1;
        continue;
      }
      const text = textOf(record);
      if (!text) {
        refusals.badText += 1;
        continue;
      }
      // ⚠️ ON N'ASSEMBLE PAS UN `RetainedItem` À LA MAIN. L'objet nu passe par
      // `parseRetainedItem`, qui revérifie la matrice et les invariants de
      // `scope` (craving ⇒ next_plan) — et refuse ce que ce module aurait
      // laissé passer.
      // ⛔ LE MOMENT PASSE PAR LE SOCLE, ET UN JETON HORS LISTE FAIT TOMBER
      // L'ITEM. On ne replie pas sur `null`: « je n'ai pas su lire le moment »
      // deviendrait « la règle vaut toute la journée », c'est-à-dire une
      // règle PLUS LARGE que la phrase de la personne. C'est `parseRetainedItem`
      // qui refuse, pas ce module: une seconde lecture divergerait.
      const item = parseRetainedItem({
        kind,
        scope,
        subject,
        text,
        occasion: record.occasion ?? null,
        // ⛔ LA FORCE PASSE PAR LE SOCLE, COMME LE MOMENT, ET SON REPLI VA DANS
        // L'AUTRE SENS: une clé absente vaut `never`. C'est délibéré — un
        // modèle qui oublie la clé doit produire la règle FORTE, celle qui
        // protège. L'erreur coûte alors un plat évité de trop; l'inverse
        // servirait à quelqu'un ce qu'il vient de refuser.
        force: record.force ?? null,
        value: null,
        source: DRAFT_NOTE_PRODUCER,
        at,
        // `""` — ce producteur ne cite AUCUNE ligne de `memory_items`.
        item: "",
        confidence: null,
        // ⛔ LA NOTE BRUTE, PAS LE `text` EXTRAIT (lot M2): la citation est ce
        // que la PERSONNE a écrit, pas ce que le modèle en a retenu.
        quote: noteText,
      });
      if (!item || item.scope !== scope) {
        refusals.malformed += 1;
        continue;
      }
      // ⛔ LE PLAFOND, APRÈS TOUTES LES AUTRES GARDES. Le poser avant ferait
      // compter `over_cap` sur des lignes que le socle aurait refusées de
      // toute façon — c'est-à-dire un chiffre qui accuse la consigne d'une
      // faute qu'elle n'a pas commise.
      if (retainedKept >= DRAFT_NOTE_MAX_RETAINED) {
        refusals.overCap += 1;
        continue;
      }
      retainedKept += 1;
      items.push(item);
    }
    return { items, refused: refusals.freeze() };
  };

  // ── ④ LA PART DE QUELQU'UN — le sens du modèle, le cran du code ────────
  //
  // ⛔ CE LECTEUR NE CONSTRUIT PAS DE `RetainedItem`, et c'est la décision du
  // 2026-09-08: la phrase déplace `appetite` sur la FICHE de cette bouche, pas
  // une ligne de mémoire. Voir `PortionMove`.
  //
  // ⛔ ET LE FOYER EST REFUSÉ. Partout ailleurs `member_id: null` veut dire
  // « tout le monde à table », et c'est le bon défaut pour un goût. Un appétit
  // est un fait de CORPS: l'appliquer à tout le monde changerait la fiche de
  // chaque personne sur une phrase qui n'en nommait aucune. On refuse, et on
  // compte — c'est la même règle que « ne jamais retirer un aliment à toute la
  // table parce qu'un enfant ne l'aime pas », dans l'autre sens.
  const readPortions = (
    rows: readonly unknown[],
  ): { moves: PortionMove[]; refused: DraftNoteRefusals } => {
    const refusals = new Refusals();
    const moves: PortionMove[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const record = asRecord(row);
      if (!record) {
        refusals.malformed += 1;
        continue;
      }
      const direction = String(record.direction ?? "").trim().toLowerCase();
      if (direction !== "down" && direction !== "up") {
        // Un sens illisible n'est PAS un demi-sens: on ne devine pas « moins ».
        refusals.malformed += 1;
        continue;
      }
      const memberId = String(record.member_id ?? "").trim().toLowerCase();
      if (memberId === "" || memberId === "null" || !roster.has(memberId)) {
        refusals.unknownMember += 1;
        continue;
      }
      // ⚠️ UNE BOUCHE, UN MOUVEMENT. Deux entrées sur la même personne
      // voudraient dire deux crans depuis une seule phrase — l'amplitude que
      // ce tiroir refuse justement de laisser dire au modèle.
      if (seen.has(memberId)) {
        refusals.malformed += 1;
        continue;
      }
      seen.add(memberId);
      moves.push({ memberId, direction });
    }
    return { moves, refused: refusals.freeze() };
  };

  // ── ⑤ LE TRAVAIL DE CUISINE — l'axe et le sens, un par axe ─────────────
  //
  // ⛔ AUCUN `member_id` LU, même si le modèle en met un: un réglage de cuisine
  // est celui de la table. Le lire ferait exister, en silence, un réglage par
  // personne que ni l'écran ni le générateur ne connaissent.
  //
  // ⚠️ UN AXE, UN MOUVEMENT. « Trop long » et « pas assez de temps » sont la
  // même demande: deux entrées sur `time` voudraient dire deux crans depuis une
  // seule phrase, l'amplitude que ce tiroir refuse de laisser dire au modèle.
  const readSettings = (
    rows: readonly unknown[],
  ): { moves: SettingMove[]; refused: DraftNoteRefusals } => {
    const refusals = new Refusals();
    const moves: SettingMove[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const record = asRecord(row);
      if (!record) {
        refusals.malformed += 1;
        continue;
      }
      const about = String(record.about ?? "").trim().toLowerCase();
      const direction = String(record.direction ?? "").trim().toLowerCase();
      if (
        !(SETTING_AXES as readonly string[]).includes(about) ||
        (direction !== "down" && direction !== "up")
      ) {
        refusals.malformed += 1;
        continue;
      }
      if (seen.has(about)) {
        refusals.malformed += 1;
        continue;
      }
      seen.add(about);
      moves.push({ about: about as SettingAxis, direction });
    }
    return { moves, refused: refusals.freeze() };
  };

  // ── ⑥ LA TAILLE D'UN MOMENT — le moment et le sens, jamais un nombre ──
  //
  // ⛔ CE LECTEUR NE CONSTRUIT PAS DE `RetainedItem`. La phrase coche la case
  // « repas léger » de la fiche, pas une ligne de mémoire.
  //
  // ⚠️ ET LE FOYER EST ACCEPTÉ ICI, À L'INVERSE DE LA PART. Une table qui
  // déjeune léger est une phrase ordinaire (« le midi on mange léger »), et
  // l'appliquer à tout le monde ne retire de nourriture à personne: les parts
  // sont RENORMALISÉES sur les moments déclarés — un repas léger DÉPLACE la
  // journée, il ne la fait pas maigrir. C'est ce qui sépare ce tiroir du
  // tiroir 4, où `member_id: null` retirerait vraiment une part à chacun.
  const readSlots = (
    rows: readonly unknown[],
  ): { moves: SlotSizeMove[]; refused: DraftNoteRefusals } => {
    const refusals = new Refusals();
    const moves: SlotSizeMove[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const record = asRecord(row);
      if (!record) {
        refusals.malformed += 1;
        continue;
      }
      const slot = String(record.slot ?? "").trim().toLowerCase();
      // ⛔ LA LISTE DES MOMENTS QUI PORTENT LA MARQUE, PAS LES SIX. Un moment
      // hors liste n'est pas un demi-moment: on ne devine pas « le matin », et
      // on ne garde pas un « goûter léger » que l'écrivain jettera en silence.
      if (!(LIGHT_BEARING_SLOTS as readonly string[]).includes(slot)) {
        refusals.badWhen += 1;
        continue;
      }
      // ⛔ BOOLÉEN STRICT. `"true"`, `1`, `"oui"` sont refusés — la même
      // règle que `parseRhythmSetValue`, et pour la même raison: un repas
      // rendu léger par une chaîne de caractères est une part retirée à
      // quelqu'un par une coërcition.
      if (typeof record.light !== "boolean") {
        refusals.malformed += 1;
        continue;
      }
      const subject = subjectOf(record);
      if (!subject) {
        refusals.unknownMember += 1;
        continue;
      }
      const memberId = subject === HOUSEHOLD_SUBJECT
        ? null
        : String(subject).slice("member:".length);
      // ⚠️ UNE BOUCHE, UN MOMENT, UN MOUVEMENT. Deux entrées sur la même case
      // voudraient dire deux verdicts contraires tirés d'une seule phrase.
      const key = `${memberId ?? "household"}|${slot}`;
      if (seen.has(key)) {
        refusals.malformed += 1;
        continue;
      }
      seen.add(key);
      moves.push({ slot: slot as RhythmOccasion, light: record.light, memberId });
    }
    return { moves, refused: refusals.freeze() };
  };

  // ── ⑪ LES À-CÔTÉS — le type, le moment, oui ou non; jamais un aliment ─
  //
  // ⛔ CE LECTEUR NE CONSTRUIT PAS DE `RetainedItem`: la phrase déplace le
  // réglage de la fiche, pas une ligne de mémoire.
  //
  // ⚠️ LE FOYER EST ACCEPTÉ, comme au tiroir ⑥: « chez nous pas de dessert le
  // soir » est une phrase ordinaire, et retirer un dessert à chacun ne retire
  // pas d'énergie — le plat reprend ce que l'à-côté ne porte plus.
  const readSideCourses = (
    rows: readonly unknown[],
  ): { moves: SideCourseMove[]; refused: DraftNoteRefusals } => {
    const refusals = new Refusals();
    const moves: SideCourseMove[] = [];
    const taken = new Set<string>();
    for (const row of rows) {
      const record = asRecord(row);
      if (!record) {
        refusals.malformed += 1;
        continue;
      }
      const kind = String(record.kind ?? "").trim().toLowerCase();
      // ⛔ LA LISTE FERMÉE DU SOCLE. « soupe », « salade », « yaourt » ne sont
      // pas des types: un aliment n'a rien à faire dans ce tiroir.
      if (!(SIDE_COURSE_KINDS as readonly string[]).includes(kind)) {
        refusals.unknownKind += 1;
        continue;
      }
      // ⛔ `null` — ET SEULEMENT `null` — VEUT DIRE « les deux repas ». Une
      // clé OUBLIÉE (`undefined`) n'est pas cette réponse: elle entre dans la
      // branche ci-dessous et tombe en `badWhen`, sinon « pas de dessert le
      // soir » lu sans son moment retirerait aussi celui du midi. D'où
      // `!== null` STRICT, jamais `!= null`.
      let slot: SideCourseSlot | null = null;
      if (record.slot !== null) {
        const value = String(record.slot ?? "").trim().toLowerCase();
        // ⛔ DEUX MOMENTS, PAS SIX: la contrainte SQL refuserait le reste, et
        // l'écriture compterait un `failed` que personne ne saurait lire.
        if (!(SIDE_COURSE_SLOTS as readonly string[]).includes(value)) {
          refusals.badWhen += 1;
          continue;
        }
        slot = value as SideCourseSlot;
      }
      // ⛔ BOOLÉEN STRICT — `"false"`, `0`, `"non"` sont refusés, comme au
      // tiroir ⑥ et pour la même raison.
      if (typeof record.takes !== "boolean") {
        refusals.malformed += 1;
        continue;
      }
      const subject = subjectOf(record);
      if (!subject) {
        refusals.unknownMember += 1;
        continue;
      }
      const memberId = subject === HOUSEHOLD_SUBJECT
        ? null
        : String(subject).slice("member:".length);
      // ⚠️ UNE BOUCHE, UN MOMENT, UN TYPE, UN MOUVEMENT. `null` couvre les
      // deux moments: « pas de dessert » puis « du dessert le midi » tirés
      // d'une seule phrase sont deux verdicts sur la même case, et le second
      // tombe.
      const keys = (slot === null ? SIDE_COURSE_SLOTS : [slot])
        .map((s) => `${memberId ?? "household"}|${s}|${kind}`);
      if (keys.some((k) => taken.has(k))) {
        refusals.malformed += 1;
        continue;
      }
      for (const k of keys) taken.add(k);
      moves.push({ kind: kind as SideCourseKind, slot, takes: record.takes, memberId });
    }
    return { moves, refused: refusals.freeze() };
  };

  const prefRows = lists.preferences;
  const pref = readItems(prefRows, DRAFT_NOTE_PREFERENCE_KINDS, "durable");
  const portionRows = lists.portions;
  const portionRead = readPortions(portionRows);
  const settingRows = lists.settings;
  const settingRead = readSettings(settingRows);
  const slotRows = lists.slots;
  const slotRead = readSlots(slotRows);
  const sideRows = lists.side_courses;
  const sideRead = readSideCourses(sideRows);
  // ── ⑧ LA CASE — par le lecteur du générateur, ses refus rangés ici ─────
  // `badDay`/`badSlot` sont un `when` illisible (même famille que la note);
  // doublon et plafond sont `malformed`: deux entrées pour une case veulent
  // dire deux demandes pour un seul repas.
  const cellRows = lists.cells;
  const cellRead = readCellEdits(cellRows);
  const cellRefusals = new Refusals();
  cellRefusals.malformed = cellRead.refused.malformed + cellRead.refused.duplicate +
    cellRead.refused.tooMany;
  cellRefusals.badWhen = cellRead.refused.badDay + cellRead.refused.badSlot;
  cellRefusals.badText = cellRead.refused.badText;
  const nextRows = lists.next_plan;
  const next = readItems(nextRows, DRAFT_NOTE_NEXT_PLAN_KINDS, "next_plan");
  const nextEntries: NextPlanEntry[] = next.items.map((item) => ({
    item,
    anchor,
    writtenAt,
  }));

  // ── ③ les notes: sujet, texte, `when` — et le socle du mémo en dernier ───
  const noteRefusals = new Refusals();
  const noteLines: MemoLine[] = [];
  for (const row of lists.notes) {
    const record = asRecord(row);
    if (!record) {
      noteRefusals.malformed += 1;
      continue;
    }
    const subject = subjectOf(record);
    if (!subject) {
      noteRefusals.unknownMember += 1;
      continue;
    }
    const text = textOf(record);
    if (!text) {
      noteRefusals.badText += 1;
      continue;
    }
    // `when` hors vocabulaire ⇒ REFUS de la ligne, jamais `null`: replier
    // servirait « gros repas » tous les jours au lieu du mardi.
    const whenRaw = whenOrNull(record.when);
    const probe = parseMemoLine({
      text,
      at,
      source: DRAFT_NOTE_PRODUCER,
      quote: noteText,
      subject,
      when: whenRaw ?? null,
    });
    if (!probe) {
      const withoutWhen = parseMemoLine({
        text,
        at,
        source: DRAFT_NOTE_PRODUCER,
        quote: noteText,
        subject,
        when: null,
      });
      if (withoutWhen && whenRaw !== null && whenRaw !== undefined) noteRefusals.badWhen += 1;
      else noteRefusals.malformed += 1;
      continue;
    }
    noteLines.push(probe);
  }

  // ── ce que le modèle a LU et n'a PAS rangé ──────────────────────────────
  let degree = 0, setting = 0, mealStory = 0, other = 0, unknownSkip = 0;
  for (const row of lists.skipped) {
    const record = asRecord(row);
    const why = String(record?.why ?? "").trim().toLowerCase();
    if (why === "degree") degree += 1;
    else if (why === "setting") setting += 1;
    else if (why === "meal_story") mealStory += 1;
    else if (why === "other") other += 1;
    else unknownSkip += 1;
  }

  // ── ⑤ CE QUI ATTEND UNE PRÉCISION ──────────────────────────────────────
  //
  // ⛔ CETTE PORTE NE RANGE RIEN. Elle relit une entrée que le modèle n'a PAS
  // pu classer et vérifie qu'on saura la reprendre plus tard: la porte visée,
  // ce qu'on demande, et surtout des candidats qui existent VRAIMENT. Une
  // question dont les options ne sont pas vérifiables serait une question dont
  // le tap écrit ce que le modèle a inventé.
  //
  // ⚠️ L'ORDRE DES REFUS EST CELUI DU COÛT: la forme, puis ce qu'on demande,
  // puis la famille, puis le texte, puis les options — le plus cher en dernier
  // parce qu'il exige de croiser le rôle ou le plan.
  const clarifyRefusals = new Refusals();
  const clarifyEntries: DraftNoteClarifyEntry[] = [];
  const portionQuestions: PortionQuestion[] = [];
  let clarifyWho = 0;
  let clarifyWhat = 0;

  /**
   * LES CANDIDATS D'UNE QUESTION, OU `null` — ET C'EST LE REFUS QUI COMPTE.
   * Sur `who`: des ids du rôle, jamais un prénom (jointure par identifiant,
   * comme partout). Sur `what`: égalité EXACTE avec un aliment du plan —
   * « ne jamais écrire un matcher maison »: « laitue » n'est pas « lait ».
   * Vide, trop long, un doublon, un inconnu: `null`, et l'appelant compte.
   */
  const optionsOf = (raw: unknown, kind: "who" | "what"): string[] | null => {
    const rawOptions = Array.isArray(raw) ? raw : [];
    if (rawOptions.length === 0 || rawOptions.length > MEMORY_CLARIFICATION_MAX_OPTIONS) {
      return null;
    }
    const options: string[] = [];
    const seen = new Set<string>();
    for (const item of rawOptions) {
      const value = String(item ?? "").trim();
      if (!value) return null;
      const key = kind === "who" ? value.toLowerCase() : value;
      const known = kind === "who" ? roster.has(key) : planFoods.has(key);
      if (!known || seen.has(key)) return null;
      seen.add(key);
      options.push(key);
    }
    return options;
  };

  for (const row of lists.clarify) {
    const record = asRecord(row);
    const entry = record ? asRecord(record.entry) : null;
    if (!record || !entry) {
      clarifyRefusals.malformed += 1;
      continue;
    }

    const about = String(record.about ?? "").trim().toLowerCase();
    if (!(MEMORY_CLARIFICATION_ABOUTS as readonly string[]).includes(about)) {
      clarifyRefusals.badAbout += 1;
      continue;
    }
    const gate = String(record.gate ?? "").trim().toLowerCase();
    if (!(DRAFT_NOTE_CLARIFY_GATES as readonly string[]).includes(gate)) {
      clarifyRefusals.badGate += 1;
      continue;
    }
    const asked = about as ClarificationAbout;

    // ── ⟳ 2026-09-08 (lot 4) — LA PART SANS BOUCHE ───────────────────────
    //
    // Même lecture que le tiroir 4 (le sens, et rien d'autre), sauf la bouche:
    // ici elle est CE QU'ON DEMANDE, donc `member_id` doit être vide et les
    // candidats viennent de `options`, vérifiés contre le rôle. Une part ne
    // se demande que sur `who`: « laquelle ? » n'a pas de sens pour une assiette.
    if (gate === "portions") {
      if (asked !== "who") {
        clarifyRefusals.badAbout += 1;
        continue;
      }
      const direction = String(entry.direction ?? "").trim().toLowerCase();
      if (direction !== "down" && direction !== "up") {
        clarifyRefusals.malformed += 1;
        continue;
      }
      const declared = String(entry.member_id ?? "").trim().toLowerCase();
      if (declared !== "" && declared !== "null") {
        clarifyRefusals.badOptions += 1;
        continue;
      }
      const text = textOf(entry);
      if (text === null) {
        clarifyRefusals.badText += 1;
        continue;
      }
      const options = optionsOf(record.options, "who");
      if (options === null) {
        clarifyRefusals.badOptions += 1;
        continue;
      }
      clarifyWho += 1;
      portionQuestions.push({ text, direction, options });
      continue;
    }
    const drawer = gate as DraftNoteGate;

    // La famille — sauf pour une note, qui n'en a pas.
    let kind: RetainedKind | null = null;
    if (drawer !== "notes") {
      const parsed = parseRetainedKind(entry.kind);
      if (!parsed) {
        clarifyRefusals.unknownKind += 1;
        continue;
      }
      const allowed = drawer === "next_plan"
        ? DRAFT_NOTE_NEXT_PLAN_KINDS
        : DRAFT_NOTE_PREFERENCE_KINDS;
      if (
        !canProduce(DRAFT_NOTE_PRODUCER, parsed) ||
        !(allowed as readonly RetainedKind[]).includes(parsed)
      ) {
        clarifyRefusals.forbiddenKind += 1;
        clarifyRefusals.forbiddenKinds.add(parsed);
        continue;
      }
      kind = parsed;
    }

    const text = textOf(entry);
    if (text === null) {
      clarifyRefusals.badText += 1;
      continue;
    }

    // Le sujet DÉJÀ connu. Sur un `who` on exige qu'il soit absent: demander
    // pour qui c'est alors qu'on le sait est une question qui fait douter.
    let subject: RetainedSubject | null = null;
    if (asked === "who") {
      const declared = String(entry.member_id ?? "").trim().toLowerCase();
      if (declared !== "" && declared !== "null") {
        clarifyRefusals.badOptions += 1;
        continue;
      }
    } else {
      const resolved = subjectOf(entry);
      if (resolved === null) {
        clarifyRefusals.unknownMember += 1;
        continue;
      }
      subject = resolved as RetainedSubject;
    }

    // ── LE MOMENT D'UNE NOTE ─────────────────────────────────────────────
    //
    // ⛔ `parseMemoWhen` ET PAS UNE LIGNE DE MÉMO FACTICE. La porte ③ sonde en
    // construisant une `MemoLine` complète, parce qu'elle en a une à
    // construire. Ici on n'a pas encore de sujet — c'est justement ce qu'on
    // demande — et fabriquer une ligne avec un sujet de complaisance pour
    // valider autre chose serait écrire, dans le code, le repli sur
    // `household` que tout ce module refuse. On valide donc exactement ce
    // qu'on veut valider, et rien d'autre.
    let when: MemoWhen | null = null;
    if (drawer === "notes") {
      const parsed = parseMemoWhen(whenOrNull(entry.when));
      if (parsed === "unreadable") {
        clarifyRefusals.badWhen += 1;
        continue;
      }
      when = parsed;
    }

    // ── LES CANDIDATS, ET C'EST LE REFUS QUI COMPTE ───────────────────────
    const options = optionsOf(record.options, asked === "who" ? "who" : "what");
    if (options === null) {
      clarifyRefusals.badOptions += 1;
      continue;
    }

    // ⟳ 2026-09-23 — le moment et la force, par LA MÊME porte que le tiroir
    // visé (`parseRetainedItem`), avec un sujet de passage: ce qu'on vérifie
    // ici est le jeton, pas la bouche — elle est justement ce qu'on demande.
    let occasion: RhythmOccasion | null = null;
    let force: ExclusionForce | null = null;
    if (drawer !== "notes" && kind !== null) {
      const probe = parseRetainedItem({
        kind,
        scope: drawer === "next_plan" ? "next_plan" : "durable",
        subject: HOUSEHOLD_SUBJECT,
        text,
        occasion: entry.occasion ?? null,
        force: entry.force ?? null,
        value: null,
        source: DRAFT_NOTE_PRODUCER,
        at,
        item: "",
        confidence: null,
        quote: noteText,
      });
      if (!probe) {
        clarifyRefusals.malformed += 1;
        continue;
      }
      occasion = probe.occasion ?? null;
      force = probe.force ?? null;
    }

    if (asked === "who") clarifyWho += 1;
    else clarifyWhat += 1;
    clarifyEntries.push({ about: asked, gate: drawer, kind, text, subject, when, occasion, force, options });
  }

  const preferences = {
    proposed: prefRows.length,
    kept: pref.items.length,
    refused: pref.refused,
    items: pref.items,
  };
  const notes = {
    proposed: lists.notes.length,
    kept: noteLines.length,
    refused: noteRefusals.freeze(),
    lines: noteLines,
  };
  const nextPlan = {
    proposed: nextRows.length,
    kept: nextEntries.length,
    refused: next.refused,
    entries: nextEntries,
  };
  const portions = {
    proposed: portionRows.length,
    kept: portionRead.moves.length,
    refused: portionRead.refused,
    moves: portionRead.moves,
  };
  const settings = {
    proposed: settingRows.length,
    kept: settingRead.moves.length,
    refused: settingRead.refused,
    moves: settingRead.moves,
  };
  const slots = {
    proposed: slotRows.length,
    kept: slotRead.moves.length,
    refused: slotRead.refused,
    moves: slotRead.moves,
  };
  const sideCourses = {
    proposed: sideRows.length,
    kept: sideRead.moves.length,
    refused: sideRead.refused,
    moves: sideRead.moves,
  };
  const cells = {
    proposed: cellRows.length,
    kept: cellRead.cells.length,
    refused: cellRefusals.freeze(),
    requests: cellRead.cells,
  };
  const clarify = {
    proposed: lists.clarify.length,
    kept: clarifyEntries.length + portionQuestions.length,
    refused: clarifyRefusals.freeze(),
    entries: clarifyEntries,
    portions: portionQuestions,
    who: clarifyWho,
    what: clarifyWhat,
  };
  const refused = sumRefusals([
    preferences.refused,
    notes.refused,
    nextPlan.refused,
    cells.refused,
    portions.refused,
    settings.refused,
    slots.refused,
    sideCourses.refused,
    clarify.refused,
  ]);

  return {
    ok: true,
    refusal: null,
    classification: {
      proposed: preferences.proposed + notes.proposed + nextPlan.proposed +
        portions.proposed + settings.proposed + slots.proposed +
        sideCourses.proposed + cells.proposed + clarify.proposed,
      kept: preferences.kept + notes.kept + nextPlan.kept + portions.kept +
        settings.kept + slots.kept + sideCourses.kept + cells.kept + clarify.kept,
      refused,
      preferences,
      notes,
      nextPlan,
      portions,
      settings,
      slots,
      sideCourses,
      cells,
      skipped: {
        total: degree + setting + mealStory + other + unknownSkip,
        degree,
        setting,
        mealStory,
        other,
        unknown: unknownSkip,
      },
      clarify,
      // ⟳ 2026-09-23 — ⑩, relue à part: ses refus ne sont pas ceux des
      // souvenirs (`noEvidence` n'existe qu'ici), donc hors de `refused`.
      safety: readDraftNoteSafety({ rows: lists.safety, roster, note: noteText, textMax }),
      listsMissing: lists.missing,
    },
  };
}

/**
 * LES LISTES DE LA CHARGE, ou `null` quand la charge est illisible.
 *
 * ⚠️ `null` ET « quatre listes vides » NE SONT PAS LA MÊME CHOSE. Un objet qui
 * porte au moins une des clés attendues a été lu; une clé absente compte dans
 * `missing`. Un objet qui n'en porte AUCUNE — ou l'ancienne forme `{ items }`
 * d'avant le lot A — n'a pas rendu la forme demandée: c'est un prompt qui ne
 * tient pas, et le confondre avec « rien à ranger » ferait ressembler un
 * prompt cassé à un produit calme.
 */
function listsOf(raw: unknown): {
  preferences: unknown[];
  notes: unknown[];
  next_plan: unknown[];
  portions: unknown[];
  settings: unknown[];
  slots: unknown[];
  cells: unknown[];
  skipped: unknown[];
  clarify: unknown[];
  safety: unknown[];
  side_courses: unknown[];
  missing: string[];
} | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = [
    "preferences",
    "notes",
    "next_plan",
    "portions",
    "settings",
    "slots",
    "cells",
    "skipped",
    "clarify",
    "safety",
    // ⟳ 2026-09-23 — ⑪. Même raison que `clarify`: une clé absente est un
    // prompt lu de travers, et se compte à part d'un vide.
    "side_courses",
  ] as const;
  if (!keys.some((k) => k in record)) return null;
  const missing: string[] = [];
  const list = (k: (typeof keys)[number]): unknown[] => {
    const v = record[k];
    if (v === undefined) {
      missing.push(k);
      return [];
    }
    return Array.isArray(v) ? v : [];
  };
  return {
    preferences: list("preferences"),
    notes: list("notes"),
    next_plan: list("next_plan"),
    portions: list("portions"),
    settings: list("settings"),
    slots: list("slots"),
    cells: list("cells"),
    skipped: list("skipped"),
    clarify: list("clarify"),
    safety: list("safety"),
    side_courses: list("side_courses"),
    missing,
  };
}

/**
 * LA LIGNE DE JOURNAL, en un objet. Les nombres se lisent PAR PORTE.
 *
 * `pref_proposed > 0 && pref_kept === 0` = la porte ① ne tient pas.
 * `skipped_degree > 0` = le modèle a lu un degré et l'a DIT — la réponse
 *   attendue sur « c'est trop long à cuisiner ».
 * `proposed === 0 && skipped === 0` sur une note non vide = le modèle n'a
 *   rien vu, et ne l'a pas dit non plus: à regarder.
 */
export function draftNoteClassifyTrace(
  classification: DraftNoteClassification,
): Record<string, number | readonly string[]> {
  const gate = (name: string, g: DraftNoteGateCount): Record<string, number | readonly string[]> => ({
    [`${name}_proposed`]: g.proposed,
    [`${name}_kept`]: g.kept,
    [`${name}_refused`]: g.refused.total,
    [`${name}_refused_forbidden_kind`]: g.refused.forbiddenKind,
    [`${name}_refused_forbidden_kinds`]: g.refused.forbiddenKinds,
    [`${name}_refused_unknown_member`]: g.refused.unknownMember,
    [`${name}_refused_bad_text`]: g.refused.badText,
    [`${name}_refused_malformed`]: g.refused.malformed,
    // ⟳ 2026-09-22 · LOT B — CE QUE LE PLAFOND A COUPÉ, PAR PORTE.
    //
    // ⚠️ IL NE DIT PAS « la note était trop longue »: il dit que la phrase a
    // été lue comme une LISTE D'INGRÉDIENTS alors que la consigne demande un
    // plat. `over_cap > 0` de façon répétée est un prompt à durcir, pas un
    // plafond à lever — lever le plafond rendrait le défaut invisible au lieu
    // de le corriger.
    [`${name}_refused_over_cap`]: g.refused.overCap,
  });
  return {
    proposed: classification.proposed,
    kept: classification.kept,
    refused: classification.refused.total,
    refused_unknown_kind: classification.refused.unknownKind,
    refused_forbidden_kind: classification.refused.forbiddenKind,
    refused_forbidden_kinds: classification.refused.forbiddenKinds,
    refused_unknown_member: classification.refused.unknownMember,
    refused_bad_text: classification.refused.badText,
    refused_bad_when: classification.refused.badWhen,
    refused_malformed: classification.refused.malformed,
    refused_bad_about: classification.refused.badAbout,
    refused_bad_gate: classification.refused.badGate,
    refused_bad_options: classification.refused.badOptions,
    ...gate("pref", classification.preferences),
    ...gate("notes", classification.notes),
    notes_refused_bad_when: classification.notes.refused.badWhen,
    ...gate("next", classification.nextPlan),
    // ④ — LA PART. `portions_proposed > 0 && portions_kept === 0` est la
    // signature d'un tiroir ouvert dans le prompt et fermé dans le lecteur —
    // exactement le vert mort que ce lot existe pour éviter. Le sens dans
    // lequel elles vont se lit à part: sans lui, deux réponses opposées
    // (`down` puis `up`) ressemblent à deux crans servis alors que la position
    // ne bouge pas (`portionIndexMoves`).
    ...gate("portions", classification.portions),
    portions_down: classification.portions.moves.filter((m) => m.direction === "down").length,
    portions_up: classification.portions.moves.filter((m) => m.direction === "up").length,
    // ⑤ — LE TRAVAIL DE CUISINE. Par axe, parce que c'est l'axe qui dit quel
    // champ le bilan va déplacer: `time` et `difficulty` peuvent tomber sur le
    // MÊME champ (`cooking_style`) et se neutraliser (`bothPolarities`).
    ...gate("settings", classification.settings),
    settings_time: classification.settings.moves.filter((m) => m.about === "time").length,
    settings_difficulty: classification.settings.moves.filter((m) => m.about === "difficulty").length,
    settings_variety: classification.settings.moves.filter((m) => m.about === "variety").length,
    // ⑪ — LES À-CÔTÉS. Le sens se lit à part: `side_courses_skips` compte
    // les « ne prend pas », `side_courses_takes` les « veut »; un tiroir qui
    // ne rendrait que l'un des deux serait un prompt qui ne lit qu'une moitié.
    ...gate("side_courses", classification.sideCourses),
    side_courses_refused_unknown_kind: classification.sideCourses.refused.unknownKind,
    side_courses_refused_bad_when: classification.sideCourses.refused.badWhen,
    side_courses_takes: classification.sideCourses.moves.filter((m) => m.takes).length,
    side_courses_skips: classification.sideCourses.moves.filter((m) => !m.takes).length,
    // ⑤ — la porte qui ne range rien. `clarify_kept > 0` veut dire qu'une
    // question part; `clarify_refused_bad_options > 0` veut dire que le modèle
    // a proposé des candidats qui n'existent pas, et que la personne ne sera
    // donc PAS relancée — c'est le nombre à regarder quand une ambiguïté
    // disparaît en silence.
    // ⑧ — la case de ce plan-ci. `cells_kept` = ce que le front rendra au
    // composeur; `cells_refused_bad_when` = un jour ou un moment que le modèle
    // a inventé ou omis.
    ...gate("cells", classification.cells),
    cells_refused_bad_when: classification.cells.refused.badWhen,
    ...gate("clarify", classification.clarify),
    clarify_refused_bad_about: classification.clarify.refused.badAbout,
    clarify_refused_bad_gate: classification.clarify.refused.badGate,
    clarify_refused_bad_options: classification.clarify.refused.badOptions,
    clarify_refused_bad_when: classification.clarify.refused.badWhen,
    clarify_refused_unknown_kind: classification.clarify.refused.unknownKind,
    clarify_who: classification.clarify.who,
    // ⟳ 2026-09-08 (lot 4) — les parts à demander. `clarify_portions > 0` avec
    // `questions: 0` côté io = une question fabriquée et jamais posée.
    clarify_portions: classification.clarify.portions.length,
    clarify_what: classification.clarify.what,
    skipped: classification.skipped.total,
    skipped_degree: classification.skipped.degree,
    skipped_setting: classification.skipped.setting,
    skipped_meal_story: classification.skipped.mealStory,
    skipped_other: classification.skipped.other,
    skipped_unknown: classification.skipped.unknown,
    // ⟳ 2026-09-23 — ⑩. `safety_refused_no_evidence > 0` = le modèle a vu
    // une allergie ou un régime SANS le mot dans la note: la garde a tenu.
    safety_proposed: classification.safety.proposed,
    safety_kept: classification.safety.kept,
    safety_allergy: classification.safety.declarations.filter((d) => d.kind === "allergy").length,
    safety_intolerance: classification.safety.declarations.filter((d) => d.kind === "intolerance").length,
    safety_diet: classification.safety.declarations.filter((d) => d.kind === "diet").length,
    safety_refused_no_evidence: classification.safety.refused.noEvidence,
    safety_refused_unknown_member: classification.safety.refused.unknownMember,
    safety_refused_bad_text: classification.safety.refused.badText,
    safety_refused_bad_diet: classification.safety.refused.badDiet,
    safety_refused_unknown_kind: classification.safety.refused.unknownKind,
    lists_missing: classification.listsMissing,
  };
}

/** Le type d'un item ressorti d'ici, pour les appelants qui veulent l'écrire. */
export type DraftNoteItem = RetainedItem;
