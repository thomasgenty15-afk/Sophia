/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE CORPUS DE LA MÉMOIRE — 40 notes, et ce que chacune DOIT retenir.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS ──────────────────────────
 * C'est une TABLE DE DÉCISION écrite à la main: une note telle que les gens la
 * tapent (fautes comprises), la sortie que le modèle DEVRAIT rendre, et les
 * souvenirs attendus. Rien ici n'appelle un modèle, et aucun test qui le lit
 * n'en appelle un: la sortie modèle est une FIXTURE en dur.
 *
 * ⛔ IL DÉCRIT LA CIBLE, PAS L'ÉTAT DU JOUR. Deux colonnes de `expected` sont
 * rouges sur le code du 2026-09-21, et c'est le point:
 *
 *   ① `occasion` — une exclusion peut porter UN MOMENT. Mesuré le 2026-09-21
 *      sur un foyer réel: « Je veux pas de choses genre tofu, poissons au petit
 *      déjeuné » est devenue UN seul `food.exclude` dont le `text` était
 *      « tofu, poissons au petit déjeuné ». Deux conséquences, toutes deux
 *      vérifiées: la ceinture n'a rien pu chercher (le texte n'est pas un
 *      aliment, et `isBarePhrase` le rend `phrase: true`, donc il faut TOUS
 *      ses mots dans le plat pour mordre), et le modèle a lu la phrase en
 *      prose sur la carte du titulaire. Tofu servi au petit-déjeuner deux
 *      jours plus tard.
 *   ② `slots` — la TAILLE d'un moment. « le matin c'est plutôt quelque chose
 *      de très léger » n'a aujourd'hui aucune destination: le levier existe
 *      (`household_member_habits.light`, `LIGHT_SLOT_WEIGHT`, la case « repas
 *      léger » de la fiche) et AUCUN producteur ne l'écrit. Le petit-déjeuner
 *      de la personne est resté à 500 kcal.
 *
 * ── POURQUOI UN SIXIÈME TIROIR PLUTÔT QU'UNE NEUVIÈME FAMILLE ─────────────
 * Parce que le dépôt a DÉJÀ tranché cette question au lot M5, en fermant
 * `logistics.set` aux prompts: un item retenu était une COPIE du réglage,
 * relue au moment de composer — « l'écran disait 45 min, le plan était fait
 * sur 35 ». La taille d'un moment est exactement ce cas: elle a un CHAMP que
 * la personne voit et peut décocher elle-même. Un `slot.size` en mémoire
 * serait la seconde vérité que M5 a fermée. Le tiroir `slots` déplace donc le
 * CHAMP, comme le tiroir 4 (`portions` → `household_member_bodies.appetite`)
 * et le tiroir 5 (`settings` → `practical_constraints`).
 *
 * ── LE RÔLE, FIGÉ ET MINUSCULE ────────────────────────────────────────────
 * Quatre bouches. DEUX FILLES MINEURES, exprès: « ma fille » ne se résout pas,
 * et c'est le seul cas où `clarify: who` est la bonne réponse. Aucun fils, et
 * c'est exprès aussi: « mon fils » ne désigne personne, et le repli interdit
 * (`member_id: null`) appliquerait une phrase à toute la table.
 *
 * PURE: no I/O, no clock, no randomness.
 */

import type { RetainedKind } from "./retained_item.ts";
import type { RhythmOccasion } from "./retained_item.ts";
import type { DraftNoteSkipReason } from "./draft_note_classify.ts";
import type { DayToken } from "./tokens.ts";
import type { SideCourseKind, SideCourseSlot } from "./side_courses_types.ts";

// ===========================================================================
// LE RÔLE
// ===========================================================================

/** Les clés lisibles du rôle. Le corpus ne nomme JAMAIS un uuid à la main. */
export const CORPUS_MOUTHS = ["thomas", "christele", "lea", "zoe"] as const;
export type CorpusMouth = (typeof CORPUS_MOUTHS)[number];

/**
 * Les uuids, en dur et bien formés (`parseRetainedSubject` exige la forme).
 * Ils ne désignent personne: ce sont des chiffres répétés.
 */
export const CORPUS_MEMBER_IDS: Readonly<Record<CorpusMouth, string>> = Object.freeze({
  thomas: "11111111-1111-4111-8111-111111111111",
  christele: "22222222-2222-4222-8222-222222222222",
  lea: "33333333-3333-4333-8333-333333333333",
  zoe: "44444444-4444-4444-8444-444444444444",
});

/** Le rôle tel que `buildDraftNoteClassifyPrompt` et le lecteur l'attendent. */
export const CORPUS_MEMBERS = Object.freeze([
  {
    memberId: CORPUS_MEMBER_IDS.thomas,
    label: "Thomas",
    ageState: "adult",
    sex: "male",
    writes: true,
  },
  {
    memberId: CORPUS_MEMBER_IDS.christele,
    label: "Christèle",
    ageState: "adult",
    sex: "female",
    writes: false,
  },
  { memberId: CORPUS_MEMBER_IDS.lea, label: "Léa", ageState: "minor", sex: "female", writes: false },
  { memberId: CORPUS_MEMBER_IDS.zoe, label: "Zoé", ageState: "minor", sex: "female", writes: false },
] as const);

/** Le titulaire — celui qui compose, et qui porte les lignes de la table. */
export const CORPUS_OWNER: CorpusMouth = "thomas";

/**
 * LES ALIMENTS DU PLAN QU'ELLE VIENT DE LIRE. Requis par le lecteur: sans eux
 * le modèle n'a pas le droit de demander « lequel ? » (`about: "what"`).
 */
export const CORPUS_PLAN_FOODS: readonly string[] = Object.freeze([
  "Poulet rôti",
  "Bœuf braisé",
  "Cabillaud vapeur",
  "Gratin de courgettes",
]);

/** Le jour de la note, et la semaine visée. En dur, jamais une horloge. */
export const CORPUS_TODAY = "2026-09-21";
export const CORPUS_TARGET_WEEK = "2026-09-28";

// ===========================================================================
// CE QU'UNE NOTE DOIT RETENIR
// ===========================================================================

/** Les huit destinations qu'une note peut atteindre, plus les deux refus. */
export const CORPUS_DRAWERS = [
  "preferences",
  "next_plan",
  "notes",
  "portions",
  "settings",
  "slots",
  "cells",
  "skipped",
  "clarify",
  "safety",
] as const;
export type CorpusDrawer = (typeof CORPUS_DRAWERS)[number];

/**
 * UN SOUVENIR ATTENDU. Tous les champs sont REQUIS et nullables — jamais `?`.
 *
 * ⚠️ C'est la cicatrice « paramètre de garde optionnel = garde désarmée »,
 * appliquée à une table d'attentes: un `occasion?` oublié dans une ligne du
 * corpus ferait passer le cas qu'il est censé tenir, en silence.
 */
export interface CorpusExpected {
  readonly drawer: CorpusDrawer;
  /** ① et ② seulement. `null` partout ailleurs. */
  readonly kind: RetainedKind | null;
  /** Le texte DÉCOUPÉ — un aliment par souvenir. `null` hors ①②③④⑧. */
  readonly text: string | null;
  /** Le MOMENT porté par le souvenir. `null` = la phrase n'en nomme aucun. */
  readonly occasion: RhythmOccasion | null;
  /**
   * ⛔ LA FORCE D'UN REFUS — `never` retire, `less` réduit. `null` sur tout
   * ce qui n'est pas `food.exclude` / `method.avoid`.
   *
   * ⚠️ MESURÉ LE 2026-09-22 SUR LE SEUL COMPTE RÉEL: « Pas **autant** de
   * petit suisse le matin » était rangée en interdiction totale. La ceinture
   * a retiré l'aliment de toutes les boîtes, pour toujours, sur une phrase qui
   * demandait *moins*.
   */
  readonly force: "never" | "less" | null;
  /** De qui on parle. `null` = le foyer, tout le monde à table. */
  readonly who: CorpusMouth | null;
  /** ④ `portions` — le sens, jamais une amplitude. */
  readonly direction: "down" | "up" | null;
  /** ⑤ `settings` — l'axe. */
  readonly about: "time" | "difficulty" | "variety" | null;
  /** ⑥ `slots` — `true` = ce moment est léger, `false` = il ne l'est plus. */
  readonly light: boolean | null;
  /** ③ `notes` et ⑧ `cells` — le jour nommé. */
  readonly weekday: DayToken | null;
  /** ⑥ `skipped` — le motif, compté. */
  readonly why: DraftNoteSkipReason | null;
  /** ⑦ `clarify` — ce qu'on demande, et à propos de quelle porte. */
  readonly ask: "who" | "what" | null;
  readonly gate: string | null;
  /**
   * ⟳ 2026-09-23 — ⑩: `allergy`, `intolerance`, ou `diet:<jeton>` (le régime
   * fait partie de ce qu'on attend: « végétarien » et « vegan » ne sont pas
   * la même fiche).
   */
  readonly safety: string | null;
}

/** Le squelette d'un attendu: tout à `null`, on ne remplit que ce qui compte. */
const NOTHING: CorpusExpected = Object.freeze({
  drawer: "skipped",
  kind: null,
  text: null,
  occasion: null,
  force: null,
  who: null,
  direction: null,
  about: null,
  light: null,
  weekday: null,
  why: null,
  ask: null,
  gate: null,
  safety: null,
});

const expect = (patch: Partial<CorpusExpected> & { drawer: CorpusDrawer }): CorpusExpected =>
  Object.freeze({ ...NOTHING, ...patch });

export interface CorpusEntry {
  /** L'identifiant du cas — il se lit dans le nom du test qui échoue. */
  readonly id: string;
  /** Pourquoi ce cas est dans le corpus. Une phrase. */
  readonly why: string;
  /** La note, TELLE QUE LA PERSONNE LA TAPE. Fautes comprises. */
  readonly note: string;
  /**
   * CE QUE LE MODÈLE DEVRAIT RENDRE sous la consigne CIBLE. Fixture en dur:
   * aucun test qui lit ce champ n'appelle un modèle.
   */
  readonly model: Record<string, unknown>;
  /** Les souvenirs attendus, dans n'importe quel ordre. */
  readonly expected: readonly CorpusExpected[];
}

const id = (m: CorpusMouth): string => CORPUS_MEMBER_IDS[m];

// ===========================================================================
// LES 40 NOTES
// ===========================================================================

export const DRAFT_NOTE_CORPUS: readonly CorpusEntry[] = Object.freeze([
  // ── ① LES DEUX CAS MESURÉS LE 2026-09-21 ─────────────────────────────────
  {
    id: "liste-et-moment",
    why:
      "MESURÉ 2026-09-21: rangé en UN `food.exclude` dont le texte portait le moment. " +
      "La ceinture n'a rien pu chercher, et le tofu est revenu au petit-déjeuner.",
    note: "Je veux pas de choses genre tofu, poissons au petit déjeuné",
    model: {
      preferences: [
        { kind: "food.exclude", text: "tofu", member_id: null, occasion: "breakfast" },
        { kind: "food.exclude", text: "poisson", member_id: null, occasion: "breakfast" },
      ],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "preferences", kind: "food.exclude", text: "tofu", occasion: "breakfast", force: "never" }),
      expect({ drawer: "preferences", kind: "food.exclude", text: "poisson", occasion: "breakfast", force: "never" }),
    ],
  },
  {
    id: "matin-leger",
    why:
      "MESURÉ 2026-09-21: aucune famille ne porte la taille d'un moment. Le levier " +
      "existe (`household_member_habits.light`) et aucun producteur ne l'écrit.",
    note: "le matin pour Christèle c'est plutôt quelque chose de très léger",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [{ slot: "breakfast", light: true, member_id: id("christele") }],
      cells: [], skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "slots", occasion: "breakfast", light: true, who: "christele" }),
    ],
  },
  {
    id: "gros-diner",
    why: "L'AUTRE SENS du même tiroir: retirer la marque « léger », jamais l'ajouter deux fois.",
    note: "Thomas a besoin d'un gros dîner le soir",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [{ slot: "dinner", light: false, member_id: id("thomas") }],
      cells: [], skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "slots", occasion: "dinner", light: false, who: "thomas" }),
    ],
  },
  {
    id: "midi-leger-pour-tous",
    why: "Le foyer EST une réponse pour un moment: une table qui déjeune léger.",
    note: "le midi on mange léger à la maison",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [{ slot: "lunch", light: true, member_id: null }],
      cells: [], skipped: [], clarify: [],
    },
    expected: [expect({ drawer: "slots", occasion: "lunch", light: true, who: null })],
  },

  // ── ② L'APPÉTIT — le tiroir 4, et son refus du foyer ─────────────────────
  {
    id: "appetit-nomme",
    why: "Une part nommée déplace `appetite` d'un cran. Jamais un chiffre.",
    note: "Christèle ne mange pas autant que nous",
    model: {
      preferences: [], next_plan: [], notes: [],
      portions: [{
        direction: "down",
        text: "Christèle ne mange pas autant que nous",
        member_id: id("christele"),
      }],
      settings: [], slots: [], cells: [], skipped: [], clarify: [],
    },
    expected: [expect({ drawer: "portions", direction: "down", who: "christele" })],
  },
  {
    id: "appetit-sans-bouche",
    why:
      "⛔ LE REPLI INTERDIT. `member_id: null` sur une part retirerait de la " +
      "nourriture à toute la table sur une phrase qui ne nomme personne.",
    note: "elle mange pas autant que nous",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [], cells: [], skipped: [],
      clarify: [{
        about: "who",
        gate: "portions",
        entry: { direction: "down", text: "elle mange pas autant que nous", member_id: null },
        options: [id("christele"), id("lea"), id("zoe")],
      }],
    },
    expected: [expect({ drawer: "clarify", ask: "who", gate: "portions" })],
  },
  {
    id: "encore-faim",
    why:
      "⟳ 2026-09-23: le rôle porte `writes`. « j'ai encore faim » est la faim de " +
      "CELUI QUI ÉCRIT — on ne demande plus « pour qui ? » à quelqu'un qui vient " +
      "de dire « je ». Avant, c'était une question, faute de savoir qui écrit.",
    note: "j'ai encore faim après le dîner",
    model: {
      preferences: [], next_plan: [], notes: [],
      portions: [{ direction: "up", member_id: id("thomas") }],
      settings: [], slots: [], cells: [], skipped: [], clarify: [],
    },
    expected: [expect({ drawer: "portions", direction: "up", who: "thomas" })],
  },

  // ── ③ L'ALLERGIE — une préférence périssable, JAMAIS la table de sécurité ─
  {
    id: "allergie-sur-un-retour",
    why:
      "⟳ 2026-09-23 — SANS LE MOT, C'EST UN GOÛT. « ça me rend malade » ne dit " +
      "ni « allergique » ni « intolérant »: la liste ⑩ (la fiche santé) exige " +
      "le mot, et une preuve citée. Ici: `food.exclude`, que le plan tient à " +
      "l'écart quand même.",
    note: "plus de fruits à coque, ça me rend malade",
    model: {
      preferences: [{
        kind: "food.exclude",
        text: "fruits à coque",
        member_id: null,
        occasion: null,
      }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "preferences", kind: "food.exclude", text: "fruits à coque", force: "never" }),
    ],
  },

  // ── ④ LA FAUTE DE FRAPPE — citation intacte, texte lisible ───────────────
  {
    id: "faute-de-frappe",
    why:
      "« lesoeuf » est ce qu'elle a tapé. La CITATION garde ses mots; le `text` " +
      "est ce qu'elle lira sur sa carte. ⛔ Aucun matcher maison ne répare une " +
      "faute ici: c'est le modèle qui lit, jamais une distance d'édition.",
    note: "lesoeuf ça convient pas à Christèle",
    model: {
      preferences: [{
        kind: "food.exclude",
        text: "les œufs",
        member_id: id("christele"),
        occasion: null,
      }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [
      expect({
        drawer: "preferences",
        kind: "food.exclude",
        text: "les œufs",
        who: "christele", force: "never" }),
    ],
  },

  // ── ⑤ CE QUI N'EST PAS UN SOUVENIR ───────────────────────────────────────
  {
    id: "pas-un-souvenir",
    why: "⛔ Un vide DOIT être nommé. Six listes vides sans motif = un prompt mal lu.",
    note: "c'était bien merci",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [], cells: [], skipped: [{ why: "other" }], clarify: [],
    },
    expected: [expect({ drawer: "skipped", why: "other" })],
  },
  {
    id: "remerciement",
    why: "Le même motif, une autre forme: rien ne se range, et ça se compte.",
    note: "merci beaucoup pour le plan, c'est top",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [], cells: [], skipped: [{ why: "other" }], clarify: [],
    },
    expected: [expect({ drawer: "skipped", why: "other" })],
  },

  // ── ⑥ LE PRÉNOM AMBIGU — deux filles, donc une question ──────────────────
  {
    id: "prenom-ambigu",
    why:
      "DEUX filles mineures au rôle: « ma fille » ne se résout pas. Le repli " +
      "`member_id: null` retirerait le poisson à toute la table.",
    note: "ma fille n'aime pas le poisson",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [], cells: [], skipped: [],
      clarify: [{
        about: "who",
        gate: "preferences",
        entry: { kind: "food.exclude", text: "poisson", member_id: null, occasion: null },
        options: [id("lea"), id("zoe")],
      }],
    },
    expected: [expect({ drawer: "clarify", ask: "who", gate: "preferences" })],
  },
  {
    id: "mot-relatif-sans-personne",
    why:
      "⛔ « mon fils » ne désigne AUCUNE bouche du rôle. On demande, on ne range " +
      "pas sur la table entière.",
    note: "mon fils déteste les épinards",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [], cells: [], skipped: [],
      clarify: [{
        about: "who",
        gate: "preferences",
        entry: { kind: "food.exclude", text: "épinards", member_id: null, occasion: null },
        options: [id("thomas"), id("christele"), id("lea"), id("zoe")],
      }],
    },
    expected: [expect({ drawer: "clarify", ask: "who", gate: "preferences" })],
  },
  {
    id: "pluriel-deux-bouches",
    why:
      "⛔ UN PLURIEL N'EST PAS UNE AMBIGUÏTÉ. « les filles » nomme DEUX personnes: " +
      "deux souvenirs, jamais une question — une question n'en prendrait qu'une.",
    note: "les filles détestent les courgettes",
    model: {
      preferences: [
        { kind: "food.exclude", text: "courgettes", member_id: id("lea"), occasion: null },
        { kind: "food.exclude", text: "courgettes", member_id: id("zoe"), occasion: null },
      ],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "preferences", kind: "food.exclude", text: "courgettes", who: "lea", force: "never" }),
      expect({ drawer: "preferences", kind: "food.exclude", text: "courgettes", who: "zoe", force: "never" }),
    ],
  },

  // ── ⑦ LE CONTRE-ORDRE — la phrase qui ROUVRE ce qu'une autre a fermé ─────
  {
    id: "contre-ordre",
    why:
      "Elle rouvre le petit-déjeuner que `liste-et-moment` a fermé. Sans `occasion`, " +
      "les deux lignes se contredisent sans qu'aucun lecteur puisse les départager.",
    note: "finalement du poisson le matin ça me va",
    model: {
      preferences: [{
        kind: "food.prefer",
        text: "poisson",
        member_id: null,
        occasion: "breakfast",
      }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [
      expect({
        drawer: "preferences",
        kind: "food.prefer",
        text: "poisson",
        occasion: "breakfast",
      }),
    ],
  },
  {
    id: "direction-indecidable",
    why:
      "MESURÉ: « plus de X » dit les DEUX en français. La consigne ordonne de " +
      "laisser tomber — être redemandé coûte une phrase, servir l'inverse coûte " +
      "une semaine.",
    note: "plus de saumon",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [], cells: [], skipped: [{ why: "other" }], clarify: [],
    },
    expected: [expect({ drawer: "skipped", why: "other" })],
  },

  // ── ⑧ LES FAMILLES QUI RESTENT ───────────────────────────────────────────
  {
    id: "methode-evitee",
    why:
      "`method.avoid` — une préparation, pas un aliment. ⟳ CORRIGÉ APRÈS LE " +
      "BANC DU 2026-09-22: j'attendais `never`, le modèle a rendu `less` DEUX " +
      "TIRS DE SUITE, et c'est LUI qui a raison — « TROP de fritures » est une " +
      "quantité, pas un bannissement. Ma fixture datait d'avant la force.",
    note: "trop de fritures pour nous",
    model: {
      preferences: [{
        kind: "method.avoid",
        text: "friture",
        member_id: null,
        occasion: null,
        force: "less",
      }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [expect({ drawer: "preferences", kind: "method.avoid", text: "friture", force: "less" })],
  },
  {
    id: "methode-aimee",
    why: "`method.prefer` — le même axe, l'autre sens.",
    note: "on adore tout ce qui est rôti au four",
    model: {
      preferences: [{ kind: "method.prefer", text: "rôti au four", member_id: null, occasion: null }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [expect({ drawer: "preferences", kind: "method.prefer", text: "rôti au four" })],
  },
  {
    id: "methode-par-moment",
    why: "Une préparation peut elle aussi ne valoir que pour un moment.",
    note: "pas de cru le soir",
    model: {
      preferences: [{ kind: "method.avoid", text: "cru", member_id: null, occasion: "dinner" }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "preferences", kind: "method.avoid", text: "cru", occasion: "dinner", force: "never" }),
    ],
  },
  {
    id: "envie",
    why: "`craving` ⇒ TOUJOURS `next_plan`. Une envie durable cesse d'être une envie.",
    note: "j'ai envie de fajitas cette semaine",
    model: {
      preferences: [], notes: [],
      next_plan: [{ kind: "craving", text: "fajitas", member_id: null, occasion: null }],
      portions: [], settings: [], slots: [], cells: [], skipped: [], clarify: [],
    },
    expected: [expect({ drawer: "next_plan", kind: "craving", text: "fajitas" })],
  },
  {
    id: "envie-avec-bouche",
    why: "Une envie nommée reste l'envie d'UNE bouche, pas une règle de table.",
    note: "Léa voudrait des pâtes cette semaine",
    model: {
      preferences: [], notes: [],
      next_plan: [{ kind: "craving", text: "pâtes", member_id: id("lea"), occasion: null }],
      portions: [], settings: [], slots: [], cells: [], skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "next_plan", kind: "craving", text: "pâtes", who: "lea" }),
    ],
  },
  {
    id: "cette-semaine-seulement",
    why: "La note DATE elle-même la portée: `next_plan`, pas une préférence.",
    note: "pas de poisson cette semaine",
    model: {
      preferences: [], notes: [],
      next_plan: [{ kind: "food.exclude", text: "poisson", member_id: null, occasion: null }],
      portions: [], settings: [], slots: [], cells: [], skipped: [], clarify: [],
    },
    expected: [expect({ drawer: "next_plan", kind: "food.exclude", text: "poisson", force: "never" })],
  },
  {
    id: "liste-sans-moment",
    why:
      "Le DÉCOUPAGE vaut sans moment aussi: deux aliments, deux souvenirs, une " +
      "seule citation. Une virgule ne se découpe jamais par le code.",
    note: "ni brocolis ni choux-fleurs s'il vous plait",
    model: {
      preferences: [
        { kind: "food.exclude", text: "brocolis", member_id: null, occasion: null },
        { kind: "food.exclude", text: "choux-fleurs", member_id: null, occasion: null },
      ],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "preferences", kind: "food.exclude", text: "brocolis", force: "never" }),
      expect({ drawer: "preferences", kind: "food.exclude", text: "choux-fleurs", force: "never" }),
    ],
  },
  {
    id: "un-aliment-deux-moments",
    why: "Le même aliment refusé à DEUX moments fait DEUX souvenirs, un par moment.",
    note: "pas de fromage le soir ni au petit déjeuner",
    model: {
      preferences: [
        { kind: "food.exclude", text: "fromage", member_id: null, occasion: "dinner" },
        { kind: "food.exclude", text: "fromage", member_id: null, occasion: "breakfast" },
      ],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "preferences", kind: "food.exclude", text: "fromage", occasion: "dinner", force: "never" }),
      expect({ drawer: "preferences", kind: "food.exclude", text: "fromage", occasion: "breakfast", force: "never" }),
    ],
  },
  {
    id: "plat-nomme-hors-plan",
    why: "⛔ Un aliment NOMMÉ n'est jamais une question, même absent du plan.",
    note: "plus jamais de curry",
    model: {
      preferences: [{ kind: "food.exclude", text: "curry", member_id: null, occasion: null }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [expect({ drawer: "preferences", kind: "food.exclude", text: "curry", force: "never" })],
  },
  {
    id: "plat-compose",
    why:
      "MESURÉ: « rougaille saucisse » est UN plat. Le découper en deux règles " +
      "faisait mordre « lentilles aux saucisses ». Un seul souvenir.",
    // ⟳ CORRIGÉ APRÈS LE BANC: la note disait « j'aime pas TROP », que le
    // modèle a lu comme une quantité (`less`) — lecture défendable. Ce cas
    // porte le PLAT COMPOSÉ, pas la force: la note ne doit dire qu'une chose.
    note: "le rougaille saucisse on n'en veut plus",
    model: {
      preferences: [{
        kind: "food.exclude",
        text: "rougaille saucisse",
        member_id: null,
        occasion: null,
      }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "preferences", kind: "food.exclude", text: "rougaille saucisse", force: "never" }),
    ],
  },
  {
    id: "categorie-ambigue",
    why:
      "« la viande » peut être deux plats du plan: on demande LEQUEL. Sans la " +
      "question, le produit exclut une catégorie que personne n'a nommée.",
    note: "j'ai pas aimé la viande",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [], cells: [], skipped: [],
      clarify: [{
        about: "what",
        gate: "preferences",
        entry: { kind: "food.exclude", text: "la viande", member_id: null, occasion: null },
        options: ["Poulet rôti", "Bœuf braisé"],
      }],
    },
    expected: [expect({ drawer: "clarify", ask: "what", gate: "preferences" })],
  },
  {
    id: "pronom-sans-referent",
    why: "« ça » ne nomme rien: la bouche est connue, l'aliment ne l'est pas.",
    note: "Thomas n'aime pas ça du tout",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [], cells: [], skipped: [],
      clarify: [{
        about: "what",
        gate: "preferences",
        entry: { kind: "food.exclude", text: "ça", member_id: id("thomas"), occasion: null },
        options: ["Poulet rôti", "Bœuf braisé", "Cabillaud vapeur", "Gratin de courgettes"],
      }],
    },
    expected: [expect({ drawer: "clarify", ask: "what", gate: "preferences" })],
  },
  {
    id: "demande-de-legumes",
    why: "Une question polie reste une préférence: le point d'interrogation ne change rien.",
    // ⟳ CORRIGÉ APRÈS LE BANC: « PLUS DE légumes » dit les DEUX en français,
    // et la consigne ordonne de laisser tomber — ce que `direction-indecidable`
    // exige justement. Le modèle a suivi MA règle; ma fixture la contredisait.
    // Ce cas porte la QUESTION POLIE, pas la direction.
    note: "est-ce qu'on peut avoir des légumes plus souvent ?",
    model: {
      preferences: [{ kind: "food.prefer", text: "légumes", member_id: null, occasion: null }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [expect({ drawer: "preferences", kind: "food.prefer", text: "légumes" })],
  },

  // ── ⑨ LE MÉMO — un FAIT, avec son jour et son moment ─────────────────────
  {
    id: "fait-avec-jour-et-moment",
    why: "Un fait qui n'est ni un goût ni un réglage: il se range avec son `when`.",
    note: "jeudi soir on rentre tard du sport",
    model: {
      preferences: [], next_plan: [],
      notes: [{
        text: "jeudi soir on rentre tard du sport",
        member_id: null,
        when: { weekday: "thu", slot: "dinner" },
      }],
      portions: [], settings: [], slots: [], cells: [], skipped: [], clarify: [],
    },
    expected: [
      expect({
        drawer: "notes",
        text: "jeudi soir on rentre tard du sport",
        weekday: "thu",
        occasion: "dinner",
      }),
    ],
  },
  {
    id: "habitude-a-un-moment",
    why:
      "Un aliment qu'on prend TOUJOURS à un moment est un fait avec un créneau, " +
      "pas un goût: il se range en mémo, avec `when.slot`.",
    note: "Léa prend une compote de pommes tous les après-midis",
    model: {
      preferences: [], next_plan: [],
      notes: [{
        text: "compote de pommes tous les après-midis",
        member_id: id("lea"),
        when: { weekday: null, slot: "snack_pm" },
      }],
      portions: [], settings: [], slots: [], cells: [], skipped: [], clarify: [],
    },
    expected: [
      expect({
        drawer: "notes",
        text: "compote de pommes tous les après-midis",
        occasion: "snack_pm",
        who: "lea",
      }),
    ],
  },
  {
    id: "regle-permanente-avec-jour",
    why: "⛔ Une règle dite pour toujours n'est PAS une case: c'est un mémo avec `when`.",
    note: "jamais de poisson le jeudi chez nous",
    model: {
      preferences: [], next_plan: [],
      notes: [{
        text: "jamais de poisson le jeudi",
        member_id: null,
        when: { weekday: "thu", slot: null },
      }],
      portions: [], settings: [], slots: [], cells: [], skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "notes", text: "jamais de poisson le jeudi", weekday: "thu" }),
    ],
  },

  // ── ⑩ LA CASE DE CE PLAN-CI — jour ET moment, ou rien ────────────────────
  {
    id: "case-jour-et-moment",
    why: "Une demande pour CE plan: rien n'est retenu, le composeur la reçoit.",
    note: "vendredi midi, du poulet plutôt",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [], slots: [],
      cells: [{ day: "fri", slot: "lunch", text: "du poulet plutôt" }],
      skipped: [], clarify: [],
    },
    expected: [
      expect({
        drawer: "cells",
        text: "du poulet plutôt",
        weekday: "fri",
        occasion: "lunch",
      }),
    ],
  },
  {
    id: "jour-sans-moment",
    why: "⛔ LES DEUX OU RIEN. Un jour sans moment n'est pas une case.",
    note: "jeudi c'est la galère",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [], cells: [], skipped: [{ why: "other" }], clarify: [],
    },
    expected: [expect({ drawer: "skipped", why: "other" })],
  },
  {
    id: "deux-cases",
    why: "⚠️ UNE ENTRÉE PAR REPAS NOMMÉ. « jeudi et vendredi soir » en fait deux.",
    note: "jeudi et vendredi soir, quelque chose de rapide",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [], slots: [],
      cells: [
        { day: "thu", slot: "dinner", text: "quelque chose de rapide" },
        { day: "fri", slot: "dinner", text: "quelque chose de rapide" },
      ],
      skipped: [], clarify: [],
    },
    expected: [
      expect({
        drawer: "cells",
        text: "quelque chose de rapide",
        weekday: "thu",
        occasion: "dinner",
      }),
      expect({
        drawer: "cells",
        text: "quelque chose de rapide",
        weekday: "fri",
        occasion: "dinner",
      }),
    ],
  },

  // ── ⑪ LE TRAVAIL DE CUISINE — l'axe et le sens, jamais une valeur ────────
  {
    id: "reglage-temps",
    why: "⛔ AUCUNE MINUTE. Le modèle rend l'axe et le sens; le code met le cran.",
    note: "c'est trop long à cuisiner tout ça",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [],
      settings: [{ about: "time", direction: "down" }],
      slots: [], cells: [], skipped: [], clarify: [],
    },
    expected: [expect({ drawer: "settings", about: "time", direction: "down" })],
  },
  {
    id: "reglage-difficulte",
    why: "⚠️ PAS DE `member_id`: ce sont les réglages de la CUISINE, pas d'une personne.",
    note: "les recettes sont trop compliquées pour moi",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [],
      settings: [{ about: "difficulty", direction: "down" }],
      slots: [], cells: [], skipped: [], clarify: [],
    },
    expected: [expect({ drawer: "settings", about: "difficulty", direction: "down" })],
  },
  {
    id: "reglage-variete",
    why: "L'axe variété, vers le HAUT: on veut plus de plats différents.",
    note: "on mange toujours la même chose",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [],
      settings: [{ about: "variety", direction: "up" }],
      slots: [], cells: [], skipped: [], clarify: [],
    },
    expected: [expect({ drawer: "settings", about: "variety", direction: "up" })],
  },
  {
    id: "plus-de-temps-cette-fois",
    why: "L'autre sens de l'axe temps — il existe, et il n'est pas un refus.",
    note: "j'avais plus de temps cette semaine, je peux cuisiner davantage",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [],
      settings: [{ about: "time", direction: "up" }],
      slots: [], cells: [], skipped: [], clarify: [],
    },
    expected: [expect({ drawer: "settings", about: "time", direction: "up" })],
  },

  // ── ⑫ CE QU'ON NE RANGE PAS, ET SON MOTIF ────────────────────────────────
  {
    id: "histoire-de-repas",
    why: "Ce qui a été mangé n'a aucune destination. Compté, jamais rangé.",
    note: "hier on a mangé au resto avec les collègues",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [], cells: [], skipped: [{ why: "meal_story" }], clarify: [],
    },
    expected: [expect({ drawer: "skipped", why: "meal_story" })],
  },
  {
    id: "degre-du-plan-entier",
    why: "Un jugement sur le PLAN, sans axe: ni le tiroir 4 ni le tiroir 5.",
    note: "il y a beaucoup trop à manger en général",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [], cells: [], skipped: [{ why: "degree" }], clarify: [],
    },
    expected: [expect({ drawer: "skipped", why: "degree" })],
  },
  {
    id: "reglage-sans-tiroir",
    why: "Les courses n'ont pas de tiroir ici: c'est l'écran de la personne.",
    note: "on fait les courses qu'une fois par semaine",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [], cells: [], skipped: [{ why: "setting" }], clarify: [],
    },
    expected: [expect({ drawer: "skipped", why: "setting" })],
  },
  {
    id: "moment-qui-existe-ou-pas",
    why:
      "⛔ `rhythm.set` EST INTERDIT À CE PRODUCTEUR. Quels repas on prend est un " +
      "réglage de l'écran — à ne pas confondre avec la TAILLE d'un moment, qui a " +
      "le tiroir `slots`.",
    note: "Zoé ne dîne pas le soir",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [], cells: [], skipped: [{ why: "setting" }], clarify: [],
    },
    expected: [expect({ drawer: "skipped", why: "setting" })],
  },
  {
    id: "gouter-a-ajouter",
    why: "Le même interdit, dans l'autre sens: ajouter un moment reste un réglage.",
    note: "il faudrait un goûter pour Léa l'après-midi",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [], cells: [], skipped: [{ why: "setting" }], clarify: [],
    },
    expected: [expect({ drawer: "skipped", why: "setting" })],
  },
  {
    id: "budget",
    why: "Le budget non plus n'a pas de tiroir: c'est `practical_constraints`, par l'écran.",
    note: "faudrait dépenser moins par semaine",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [],
      slots: [], cells: [], skipped: [{ why: "setting" }], clarify: [],
    },
    expected: [expect({ drawer: "skipped", why: "setting" })],
  },

  // ── ⑬ LES NOTES COMPOSITES — plusieurs choses dans une phrase ────────────
  {
    id: "composite-taille-et-aliment",
    why:
      "LA NOTE DU 2026-09-20, ENTIÈRE. Elle dit DEUX choses: la taille d'un " +
      "moment (tiroir `slots`) et un aliment refusé (tiroir ①). Aucune des deux " +
      "n'absorbe l'autre.",
    note:
      "le matin c'est plutôt quelque chose de très léger pour Christèle, fruit ou " +
      "bol de muesli, mais les oeufs ça lui convient pas",
    model: {
      preferences: [
        { kind: "food.prefer", text: "fruit", member_id: id("christele"), occasion: "breakfast" },
        {
          kind: "food.prefer",
          text: "bol de muesli",
          member_id: id("christele"),
          occasion: "breakfast",
        },
        {
          kind: "food.exclude",
          text: "les œufs",
          member_id: id("christele"),
          occasion: "breakfast",
        },
      ],
      next_plan: [], notes: [], portions: [], settings: [],
      slots: [{ slot: "breakfast", light: true, member_id: id("christele") }],
      cells: [], skipped: [], clarify: [],
    },
    expected: [
      expect({
        drawer: "preferences",
        kind: "food.prefer",
        text: "fruit",
        occasion: "breakfast",
        who: "christele",
      }),
      expect({
        drawer: "preferences",
        kind: "food.prefer",
        text: "bol de muesli",
        occasion: "breakfast",
        who: "christele",
      }),
      expect({
        drawer: "preferences",
        kind: "food.exclude",
        text: "les œufs",
        // ⟳ CORRIGÉ APRÈS LE BANC: j'attendais `occasion: null`, le modèle a
        // rendu `breakfast` deux tirs de suite — et la phrase entière parle du
        // matin. Le sien est le MEILLEUR souvenir: il ne bannit pas les œufs
        // du dîner.
        occasion: "breakfast",
        who: "christele",
        force: "never",
      }),
      expect({ drawer: "slots", occasion: "breakfast", light: true, who: "christele" }),
    ],
  },
  // ── ⓪ LA FORCE D'UN REFUS — mesurée le 2026-09-22 sur le seul compte réel
  {
    id: "moins-pas-jamais",
    why:
      "MESURÉ 2026-09-22, LA NOTE RÉELLE, À L'OCTET PRÈS. « Pas AUTANT de petit " +
      "suisse » est devenue un `food.exclude` sans nuance: la ceinture a retiré " +
      "l'aliment de toutes les boîtes, pour toujours, sur une phrase qui " +
      "demandait MOINS. La personne l'apprend en remarquant une absence.",
    note:
      "Pas autant de petit suisse le matin, mets des bols de flocons d'avoines " +
      "avec du lait d'avoine et des choses dedans genre graines amendes etc..",
    model: {
      preferences: [
        {
          kind: "food.exclude",
          text: "petit suisse",
          member_id: null,
          occasion: "breakfast",
          force: "less",
        },
        {
          kind: "food.prefer",
          text: "bol de flocons d'avoine",
          member_id: null,
          occasion: "breakfast",
        },
      ],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [
      expect({
        drawer: "preferences",
        kind: "food.exclude",
        text: "petit suisse",
        occasion: "breakfast",
        force: "less",
      }),
      // ⟳ CORRIGÉ APRÈS LE BANC: j'attendais DEUX préférences (flocons + lait),
      // le modèle en a rendu UNE — et c'est la règle du lot B qu'il applique:
      // « des bols de flocons d'avoine AVEC du lait d'avoine » est UN plat. Mon
      // attendu datait d'avant cette règle, écrite le matin même.
      expect({
        drawer: "preferences",
        kind: "food.prefer",
        text: "bol de flocons d'avoine",
        occasion: "breakfast",
      }),
    ],
  },
  {
    id: "jamais-explicite",
    why:
      "L'AUTRE MOITIÉ, ET ELLE COMPTE AUTANT. Une garde qui rendrait tout " +
      "« moins » désarmerait la ceinture entière, et ressemblerait trait pour " +
      "trait à une garde qui marche.",
    // ⟳ CORRIGÉ APRÈS LE BANC DU 2026-09-22: la note disait « elle supporte
    // pas ». « elle » désigne TROIS bouches possibles, et le modèle a demandé
    // laquelle — ce qui est la bonne réponse, et ce que `prenom-ambigu` teste
    // déjà. Ma fixture mélangeait deux cas; celui-ci porte la FORCE.
    note: "plus jamais de coriandre à la maison",
    model: {
      preferences: [{
        kind: "food.exclude",
        text: "coriandre",
        member_id: null,
        occasion: null,
        force: "never",
      }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "preferences", kind: "food.exclude", text: "coriandre", force: "never" }),
    ],
  },
  {
    id: "moins-sur-une-preparation",
    why:
      "« Moins » vaut aussi pour une préparation: `method.avoid` porte la même " +
      "force, et pour la même raison.",
    note: "un peu moins de fritures ce serait bien",
    model: {
      preferences: [{
        kind: "method.avoid",
        text: "friture",
        member_id: null,
        occasion: null,
        force: "less",
      }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "preferences", kind: "method.avoid", text: "friture", force: "less" }),
    ],
  },
  // ── ⓪ UNE RECETTE N'EST PAS N PRÉFÉRENCES — mesuré le 2026-09-22 ───────
  {
    id: "un-plat-pas-quatre-aliments",
    why:
      "MESURÉ EN BASE: cette phrase a produit CINQ souvenirs durables, chacun " +
      "une règle permanente du foyer. La personne a demandé UNE chose — changer " +
      "son petit-déjeuner. Quatre préférences indépendantes autorisent le plan " +
      "à servir des amandes au dîner en se croyant fidèle.",
    note:
      "mets des bols de flocons d'avoine avec du lait d'avoine et des choses " +
      "dedans genre graines et amandes",
    // ⟳ CORRIGÉ APRÈS LE BANC DU 2026-09-22: j'attendais `breakfast`, et la
    // note ne nomme AUCUN moment — j'avais recopié l'attendu de la note réelle
    // en coupant son « le matin ». Le modèle a rendu `null`, exactement.
    model: {
      preferences: [{
        kind: "food.prefer",
        text: "bol d'avoine",
        member_id: null,
        occasion: null,
      }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "preferences", kind: "food.prefer", text: "bol d'avoine" }),
    ],
  },
  {
    id: "une-liste-reste-une-liste",
    why:
      "⛔ L'AUTRE MOITIÉ, ET ELLE COMPTE AUTANT. Une garde qui fondrait toute " +
      "énumération en un seul souvenir referait le défaut du composite: « tofu, " +
      "poissons » redeviendrait une ligne que rien ne peut chercher.",
    note: "pas de tofu ni de poisson, et pas de lentilles non plus",
    model: {
      preferences: [
        { kind: "food.exclude", text: "tofu", member_id: null, occasion: null, force: "never" },
        { kind: "food.exclude", text: "poisson", member_id: null, occasion: null, force: "never" },
        { kind: "food.exclude", text: "lentilles", member_id: null, occasion: null, force: "never" },
      ],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "preferences", kind: "food.exclude", text: "tofu", force: "never" }),
      expect({ drawer: "preferences", kind: "food.exclude", text: "poisson", force: "never" }),
      expect({ drawer: "preferences", kind: "food.exclude", text: "lentilles", force: "never" }),
    ],
  },
  {
    id: "l-aliment-sans-son-contenant",
    why:
      "MESURÉ: `bol de muesli` ne résout rien, `muesli` résout vers `granola`. " +
      "Le contenant et la quantité appartiennent à UN repas; le souvenir porte " +
      "l'aliment.",
    // ⟳ CORRIGÉ APRÈS LE BANC: « elle » était ambigu, et le modèle a demandé
    // qui. Ce cas porte le CONTENANT, pas la résolution d'un pronom.
    // ⟳ CORRIGÉ APRÈS LE BANC (2e tir): « PREND un bol de muesli le matin » est
    // une HABITUDE, et la consigne l'envoie au mémo avec son créneau — c'est
    // ce que fait `habitude-a-un-moment`. Ma fixture décrivait un usage, pas
    // un goût. Reformulée en goût, elle teste ce qu'elle dit tester.
    note: "Christèle aimerait du muesli le matin, plutôt qu\'un bol de céréales, et du pain complet le midi",
    model: {
      preferences: [
        {
          kind: "food.prefer",
          text: "muesli",
          member_id: id("christele"),
          occasion: "breakfast",
        },
        {
          kind: "food.prefer",
          text: "pain complet",
          member_id: id("christele"),
          occasion: "lunch",
        },
      ],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [
      expect({
        drawer: "preferences",
        kind: "food.prefer",
        text: "muesli",
        occasion: "breakfast",
        who: "christele",
      }),
      expect({
        drawer: "preferences",
        kind: "food.prefer",
        text: "pain complet",
        occasion: "lunch",
        who: "christele",
      }),
    ],
  },
  // ── ⓪ UNE CIRCONSTANCE EST DATÉE PAR SA RAISON — lot C, 2026-09-22 ─────
  {
    id: "circonstance-la-saison",
    why:
      "LE CAS QUI A LANCÉ LE LOT. « on est que début septembre » est une RAISON " +
      "QUI CESSERA D'ÊTRE VRAIE: septembre finit. Rangée en durable, la phrase " +
      "devient une interdiction définitive de la tartiflette — et la personne " +
      "ne le découvre jamais, parce que le seul signe est un plat qui cesse " +
      "d'apparaître.",
    note: "j'ai pas envie d'une tartiflette, on est que début septembre",
    model: {
      preferences: [], notes: [],
      next_plan: [{
        kind: "food.exclude",
        text: "tartiflette",
        member_id: null,
        occasion: null,
        force: "never",
      }],
      portions: [], settings: [], slots: [], cells: [], skipped: [], clarify: [],
    },
    expected: [
      expect({
        drawer: "next_plan",
        kind: "food.exclude",
        text: "tartiflette",
        force: "never",
      }),
    ],
  },
  {
    id: "circonstance-l-humeur",
    why:
      "« en ce moment » date la phrase aussi sûrement que « cette semaine ». " +
      "Une lassitude passe; un goût non.",
    note: "j'en ai marre du poulet en ce moment",
    model: {
      preferences: [], notes: [],
      next_plan: [{
        kind: "food.exclude",
        text: "poulet",
        member_id: null,
        occasion: null,
        force: "never",
      }],
      portions: [], settings: [], slots: [], cells: [], skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "next_plan", kind: "food.exclude", text: "poulet", force: "never" }),
    ],
  },
  {
    id: "gout-sans-date-reste-durable",
    why:
      "⛔ L'AUTRE MOITIÉ, ET ELLE COMPTE AUTANT. Une consigne qui daterait tout " +
      "ferait réécrire à la personne, chaque semaine, ce qu'elle a dit une fois — " +
      "et c'est exactement le défaut renversé le 2026-09-03.",
    // ⟳ CORRIGÉ APRÈS LE BANC: la note disait « mon fils » — et le rôle n'a
    // AUCUN fils, exprès. Le modèle a demandé qui, ce que `mot-relatif-sans-
    // personne` exige justement. Ma fixture se contredisait avec une autre.
    note: "Léa n'aime pas le poisson, ça a toujours été comme ça",
    model: {
      preferences: [{
        kind: "food.exclude",
        text: "poisson",
        member_id: id("lea"),
        occasion: null,
        force: "never",
      }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    expected: [
      expect({
        drawer: "preferences",
        kind: "food.exclude",
        text: "poisson",
        force: "never",
        who: "lea",
      }),
    ],
  },
  {
    id: "composite-trois-tiroirs",
    why:
      "Une note qui touche ① ⑤ et ⑥ à la fois: chaque chose dite va dans le " +
      "PREMIER tiroir qui la tient, jamais dans deux.",
    note:
      "trop long à cuisiner, et pas de champignons s'il te plait, hier c'était " +
      "parfait sinon",
    model: {
      preferences: [{
        kind: "food.exclude",
        text: "champignons",
        member_id: null,
        occasion: null,
      }],
      next_plan: [], notes: [], portions: [],
      settings: [{ about: "time", direction: "down" }],
      slots: [], cells: [],
      // ⟳ CORRIGÉ APRÈS LE BANC: j'attendais `meal_story`, le modèle a rendu
      // `other` deux tirs de suite — et c'est LUI qui a raison.
      // « hier c'était parfait » est un compliment sur le plan, pas ce qui a
      // été mangé.
      skipped: [{ why: "other" }],
      clarify: [],
    },
    expected: [
      expect({ drawer: "preferences", kind: "food.exclude", text: "champignons", force: "never" }),
      expect({ drawer: "settings", about: "time", direction: "down" }),
      expect({ drawer: "skipped", why: "other" }),
    ],
  },
  // ── ⑩ « MOI » EST LA PERSONNE QUI ÉCRIT, JAMAIS TOUTE LA TABLE ────────────
  {
    id: "moi-est-celui-qui-ecrit",
    why:
      "MESURÉ 2026-09-23 sur des notes HORS corpus: « pour moi » cochait « léger » " +
      "pour TOUTE LA TABLE, 6/6 — le rôle ne disait pas qui écrit. Il porte " +
      "désormais `writes`, et « moi » se résout dessus: un seul petit-déjeuner.",
    note: "le petit dej c'est juste un café pour moi, pas la peine de prévoir quoi que ce soit",
    model: {
      preferences: [{ kind: "food.prefer", text: "café", member_id: id("thomas"), occasion: "breakfast" }],
      next_plan: [], notes: [], portions: [], settings: [],
      slots: [{ slot: "breakfast", light: true, member_id: id("thomas") }],
      cells: [], skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "preferences", kind: "food.prefer", text: "café", occasion: "breakfast", who: "thomas" }),
      expect({ drawer: "slots", occasion: "breakfast", light: true, who: "thomas" }),
    ],
  },
  {
    id: "je-au-diner",
    why:
      "L'AUTRE FORME, même mesure: « moi le soir je mange pas de féculents » " +
      "retirait les féculents à quatre personnes (3/3). C'est SON dîner.",
    note: "moi le soir je mange pas de féculents",
    model: {
      preferences: [{
        kind: "food.exclude", text: "féculents", member_id: id("thomas"), occasion: "dinner", force: "never",
      }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [], skipped: [], clarify: [],
    },
    expected: [
      expect({
        drawer: "preferences", kind: "food.exclude", text: "féculents", occasion: "dinner",
        who: "thomas", force: "never" }),
    ],
  },
  // ── ⑪ « ON MANGE MOINS » — la table entière, une part par personne ─────────
  {
    id: "on-mange-moins",
    why:
      "MESURÉ 2026-09-23 hors corpus: « on mange moins » tombait 3 fois sur 3 — " +
      "2× rangé sans bouche (refusé, `unknownMember`), 1× lu comme un degré. " +
      "« On » est la table, et la table est plusieurs personnes: un cran chacun.",
    note: "on mange moins",
    model: {
      preferences: [], next_plan: [], notes: [],
      portions: [
        { direction: "down", member_id: id("thomas") },
        { direction: "down", member_id: id("christele") },
        { direction: "down", member_id: id("lea") },
        { direction: "down", member_id: id("zoe") },
      ],
      settings: [], slots: [], cells: [], skipped: [], clarify: [],
    },
    expected: [
      expect({ drawer: "portions", direction: "down", who: "thomas" }),
      expect({ drawer: "portions", direction: "down", who: "christele" }),
      expect({ drawer: "portions", direction: "down", who: "lea" }),
      expect({ drawer: "portions", direction: "down", who: "zoe" }),
    ],
  },
  // ── ⑫ LA SÉCURITÉ DITE (2026-09-23) — le mot, et une preuve citée ─────────
  {
    id: "allergie-dite",
    why: "Le mot est là: « allergique ». La fiche de Zoé, par la RPC `_for` — jamais une préférence.",
    note: "Zoé est allergique aux arachides",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
      safety: [{ kind: "allergy", member_id: id("zoe"), text: "arachides", diet: null, because: "allergique aux arachides" }],
    },
    expected: [expect({ drawer: "safety", safety: "allergy", text: "arachides", who: "zoe" })],
  },
  {
    id: "intolerance-de-celui-qui-ecrit",
    why: "« je » + « intolérant » = la ligne de la personne qui écrit (`writes`), dans sa fiche santé.",
    note: "je suis intolérant au lactose",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
      safety: [{ kind: "intolerance", member_id: id("thomas"), text: "lactose", diet: null, because: "intolérant au lactose" }],
    },
    expected: [expect({ drawer: "safety", safety: "intolerance", text: "lactose", who: "thomas" })],
  },
  {
    id: "regime-devenu",
    why: "Un régime dit de QUI ELLE EST devenue — sa fiche, pas une liste d'exclusions sur la carte.",
    note: "Léa est devenue végétarienne",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
      safety: [{ kind: "diet", member_id: id("lea"), text: null, diet: "vegetarian", because: "est devenue végétarienne" }],
    },
    expected: [expect({ drawer: "safety", safety: "diet:vegetarian", who: "lea" })],
  },
  {
    id: "regime-de-la-table",
    why: "« on est végétariens » = la table, donc UNE ENTRÉE PAR PERSONNE — jamais `null`.",
    note: "on est végétariens",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
      safety: (["thomas", "christele", "lea", "zoe"] as const).map((m) => ({
        kind: "diet", member_id: id(m), text: null, diet: "vegetarian", because: "végétariens",
      })),
    },
    expected: (["thomas", "christele", "lea", "zoe"] as const).map((m) =>
      expect({ drawer: "safety", safety: "diet:vegetarian", who: m })
    ),
  },
  {
    id: "sans-le-mot-reste-un-gout",
    why: "⛔ LA MOITIÉ QUI COMPTE AUTANT: « je supporte pas », « ça me rend malade » n'est pas « allergique ». Un goût, pour la table (la raison à la première personne ne nomme personne).",
    note: "je supporte pas les oignons, ça me rend malade",
    model: {
      preferences: [{ kind: "food.exclude", text: "oignons", member_id: null, occasion: null, force: "never" }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [], skipped: [], clarify: [], safety: [],
    },
    expected: [expect({ drawer: "preferences", kind: "food.exclude", text: "oignons", force: "never" })],
  },
  {
    id: "regime-un-soir",
    why: "Un régime tenu UN soir n'est pas un régime: un mémo avec son jour et son moment, jamais la fiche.",
    note: "on mange végétarien le lundi soir",
    model: {
      preferences: [], next_plan: [],
      notes: [{ text: "on mange végétarien le lundi soir", member_id: null, when: { weekday: "mon", slot: "dinner" } }],
      portions: [], settings: [], slots: [], cells: [], skipped: [], clarify: [], safety: [],
    },
    expected: [expect({ drawer: "notes", text: "on mange végétarien le lundi soir", weekday: "mon", occasion: "dinner" })],
  },
  {
    id: "allergie-fille-ambigue",
    why: "Deux filles, « ma fille »: on ne pose pas une allergie sur la mauvaise enfant. L'aliment passe par ① et sa question « pour qui ? ».",
    note: "ma fille est allergique au kiwi",
    model: {
      preferences: [], next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [], skipped: [],
      clarify: [{
        about: "who", gate: "preferences",
        entry: { kind: "food.exclude", text: "kiwi", member_id: null, occasion: null, force: "never" },
        options: [id("lea"), id("zoe")],
      }],
      safety: [],
    },
    expected: [expect({ drawer: "clarify", ask: "who", gate: "preferences" })],
  },

  // ── ⑬ ⟳ 2026-09-23 — LE PIÈGE DES À-CÔTÉS: un ALIMENT n'est pas un plat ─────
  {
    id: "pas-de-fromage-le-soir",
    why:
      "⟳ 2026-09-23: le moteur sert désormais un à-côté fromage. « pas de fromage le " +
      "soir » RESTE une exclusion d'aliment au dîner (①): elle retire le fromage du " +
      "plat ET de l'à-côté. Rangée dans ⑪, le gratin du soir garderait son fromage.",
    note: "pas de fromage le soir pour Christèle",
    model: {
      preferences: [{
        kind: "food.exclude", text: "fromage", member_id: id("christele"), occasion: "dinner", force: "never",
      }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [], skipped: [], clarify: [],
      safety: [], side_courses: [],
    },
    expected: [
      expect({
        drawer: "preferences", kind: "food.exclude", text: "fromage", occasion: "dinner", force: "never",
        who: "christele",
      }),
    ],
  },
]);

/**
 * LE NOMBRE DE NOTES, ÉPINGLÉ. Une ligne retirée du corpus doit faire ROUGIR:
 * sans ce nombre, vider le corpus rendrait la suite verte et silencieuse.
 */
export const DRAFT_NOTE_CORPUS_SIZE = 67;

// ===========================================================================
// ⟳ 2026-09-23 — ⑪ LES À-CÔTÉS: CE QU'UNE PHRASE DOIT RÉGLER
// ===========================================================================
//
// ── POURQUOI UNE TABLE À PART ─────────────────────────────────────────────
// `draft_note_classify_corpus_test.ts` aplatit une classification en lignes
// `CorpusExpected`, et ce type n'a pas de colonne pour un à-côté (le type, oui
// ou non). L'y ajouter demanderait de changer l'aplatisseur d'un fichier qui
// n'est pas de ce lot. Les phrases d'à-côtés vivent donc ICI, avec leur propre
// forme, et `draft_note_classify_test.ts` les rejoue. Le piège (« pas de
// fromage le soir ») est dans la table principale ci-dessus, parce qu'il ne
// règle AUCUN à-côté: c'est une exclusion, que l'aplatisseur sait lire.
//
// ⛔ MÊME DISCIPLINE: la sortie modèle est une FIXTURE en dur, aucun test qui
// lit cette table n'appelle un modèle.

/** Un réglage attendu. Tous les champs REQUIS, jamais `?`. */
export interface SideCourseCorpusExpected {
  readonly kind: SideCourseKind;
  /** `null` = les deux repas. */
  readonly slot: SideCourseSlot | null;
  readonly takes: boolean;
  /** `null` = toute la table. */
  readonly who: CorpusMouth | null;
}

/** Un aliment attendu en ① À CÔTÉ du réglage (« elle déteste les yaourts »). */
export interface SideCourseCorpusFood {
  readonly text: string;
  readonly occasion: RhythmOccasion | null;
  readonly who: CorpusMouth | null;
}

export interface SideCourseCorpusEntry {
  readonly id: string;
  readonly why: string;
  readonly note: string;
  readonly model: Record<string, unknown>;
  /** ⑪ — les réglages attendus, dans n'importe quel ordre. */
  readonly sides: readonly SideCourseCorpusExpected[];
  /** ① — les exclusions d'aliment attendues, dans n'importe quel ordre. */
  readonly foods: readonly SideCourseCorpusFood[];
  /** ⑦ — combien de `skipped: other` (la bouche indécidable). */
  readonly skippedOther: number;
}

const NO_LISTS = Object.freeze({
  preferences: [], next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
  skipped: [], clarify: [], safety: [], side_courses: [],
});

export const SIDE_COURSE_NOTE_CORPUS: readonly SideCourseCorpusEntry[] = Object.freeze([
  {
    id: "jamais-de-dessert",
    why: "Le cas nommé par le propriétaire: un TYPE refusé, sans repas nommé ⇒ les deux.",
    note: "Christèle ne prend jamais de dessert",
    model: {
      ...NO_LISTS,
      side_courses: [{ kind: "dessert", slot: null, takes: false, member_id: id("christele") }],
    },
    sides: [{ kind: "dessert", slot: null, takes: false, who: "christele" }],
    foods: [],
    skippedOther: 0,
  },
  {
    id: "pas-d-entree-le-soir",
    why: "Un repas nommé, personne de nommé: toute la table, au dîner seulement.",
    note: "pas d'entrée le soir",
    model: {
      ...NO_LISTS,
      side_courses: [{ kind: "starter", slot: "dinner", takes: false, member_id: null }],
    },
    sides: [{ kind: "starter", slot: "dinner", takes: false, who: null }],
    foods: [],
    skippedOther: 0,
  },
  {
    id: "le-soir-pas-de-dessert",
    why: "La phrase du plan: « le soir on ne prend pas de dessert » ⇒ tout le foyer, dîner.",
    note: "le soir on ne prend pas de dessert",
    model: {
      ...NO_LISTS,
      side_courses: [{ kind: "dessert", slot: "dinner", takes: false, member_id: null }],
    },
    sides: [{ kind: "dessert", slot: "dinner", takes: false, who: null }],
    foods: [],
    skippedOther: 0,
  },
  {
    id: "finir-par-un-fromage",
    why: "L'autre sens: un type VOULU. « finir par » dit le plat d'à côté, pas l'aliment.",
    note: "Christèle adore finir par un fromage",
    model: {
      ...NO_LISTS,
      side_courses: [{ kind: "cheese", slot: null, takes: true, member_id: id("christele") }],
    },
    sides: [{ kind: "cheese", slot: null, takes: true, who: "christele" }],
    foods: [],
    skippedOther: 0,
  },
  {
    id: "pas-de-pain-a-table",
    why: "« à table » dit le plat d'à côté: le pain n'est pas retiré des recettes.",
    note: "pas de pain à table",
    model: {
      ...NO_LISTS,
      side_courses: [{ kind: "bread", slot: null, takes: false, member_id: null }],
    },
    sides: [{ kind: "bread", slot: null, takes: false, who: null }],
    foods: [],
    skippedOther: 0,
  },
  {
    id: "dessert-et-aliment",
    why: "Les deux à la fois: le réglage (pas de dessert) ET l'aliment (les yaourts). Aucun n'absorbe l'autre.",
    note: "pas de dessert pour Léa, elle déteste les yaourts",
    model: {
      ...NO_LISTS,
      preferences: [{ kind: "food.exclude", text: "yaourts", member_id: id("lea"), occasion: null, force: "never" }],
      side_courses: [{ kind: "dessert", slot: null, takes: false, member_id: id("lea") }],
    },
    sides: [{ kind: "dessert", slot: null, takes: false, who: "lea" }],
    foods: [{ text: "yaourts", occasion: null, who: "lea" }],
    skippedOther: 0,
  },
  {
    id: "fille-ambigue-dessert",
    why:
      "Deux filles, « ma fille »: le tiroir ⑪ n'a pas de question. On ne règle rien, et " +
      "on le DIT (`skipped: other`) — jamais le dessert de toute la table.",
    note: "ma fille ne prend jamais de dessert",
    model: { ...NO_LISTS, skipped: [{ why: "other" }] },
    sides: [],
    foods: [],
    skippedOther: 1,
  },
]);
