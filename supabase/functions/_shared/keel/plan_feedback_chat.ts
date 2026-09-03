/**
 * FF-054 §3.2 — LE RETOUR DE FIN DE PLAN, DANS LA CONVERSATION. PUR.
 *
 * ── LE DÉFAUT QUE CE MODULE FERME ──────────────────────────────────────────
 * Le questionnaire n'existait que dans `/app/plan`. Quelqu'un qui n'ouvre pas
 * cet écran après la fin de sa fenêtre n'était JAMAIS interrogé — c'est-à-dire
 * exactement la personne dont le plan s'est défait, et dont le retour vaut le
 * plus. La fiche prévoyait le chat depuis le premier jour (§3.2, « à câbler »);
 * il ne l'a jamais été.
 *
 * ── LE VÉHICULE EST LE MESSAGE DU SOIR, ET C'EST UNE DÉCISION ──────────────
 * Arbitré le 2026-09-01. Quand le retour est dû, la bande du soir laisse sa
 * place à la première question. AUCUNE notification de plus: T4 dit « une seule
 * demande par jour, toutes surfaces confondues », et un questionnaire qui
 * s'ajouterait au message du soir en serait une deuxième.
 *
 * Ce que ça coûte, écrit ici pour que personne ne le redécouvre: le soir où le
 * retour part, la bande du soir ne part pas. Les coches de ce soir-là se posent
 * donc à l'écran, ou pas du tout. C'est le bon sens de l'échange — une fenêtre
 * qui s'achève vaut plus qu'une soirée de coches.
 *
 * ── T3 (« le chat n'initie jamais une collecte »), ET POURQUOI CE N'EN EST
 *    PAS UNE VIOLATION ─────────────────────────────────────────────────────
 * T3 interdit de RÉCLAMER À FROID ce que la personne n'a pas donné. Ici la
 * personne a composé un plan, l'a vécu une semaine, et la fenêtre vient de se
 * fermer: la question est adossée à un fait qu'elle a produit (T5), au moment
 * exact où il s'achève. C'est la même frontière que l'invitation photo — et
 * comme elle, la demande porte son droit de refus DANS le message: « pas
 * maintenant » est offert dès la première question.
 *
 * ── L'ÉTAT DU QUESTIONNAIRE EST LA LIGNE, PAS UNE TABLE ────────────────────
 * `meal_plan_feedback` porte `unique (meal_id)`: une ligne par plan. La
 * prochaine question se DÉRIVE de ce que cette ligne porte déjà. Un second
 * état à invalider est un état dont l'écrivain finit par disparaître, et ce
 * dépôt paie cette faute en boucle (`grocery_waves.ts`, `accident.ts`).
 *
 * ── CE QUE LE CHAT NE POSE PAS, ET POURQUOI ────────────────────────────────
 * « Une envie pour la suite ? » (`newEnvyIsAsked`) reste à l'écran. Elle
 * n'écrit pas dans cette table mais dans `household_envy_submissions`, en TEXTE
 * LIBRE — et §3.2 interdit le champ libre ici, parce qu'il inviterait à
 * raconter ce qui a été mangé. Une envie tapée à trois boutons ne serait pas
 * une envie.
 *
 * ── UN SEUL PLAT PAR QUESTION DE PLAT, ET C'EST UNE RÉDUCTION ASSUMÉE ──────
 * L'écran laisse cocher plusieurs plats dans `never_again` / `make_again`; ici
 * on en prend UN, ou « aucun ». Enchaîner « et un autre ? » après chaque tap
 * serait l'interrogatoire que §3.2 refuse, pour une précision que le lecteur
 * (`food_preferences`) exploite à peine — il range des titres, il ne les
 * pondère pas. La personne qui veut en nommer trois a l'écran pour ça.
 *
 * PURE MODULE: ni base, ni horloge, ni aléatoire.
 */

import {
  cookingQuestionsAreAsked,
  type FeedbackQuestion,
  OPTION_LABELS,
  PORTION_SUBJECT_LABEL,
  QUESTION_LABELS,
  QUESTION_OPTIONS,
} from "./plan_feedback.ts";

export type FeedbackLanguage = "en" | "fr";

/**
 * Le préfixe de cette famille.
 *
 * DISJOINT des cinq autres (`KEEL_RECO_`, `KEEL_STRIP_`, `KEEL_FIX_`,
 * `KEEL_DIV_`, `KEEL_PULSE_`): chaque lecteur rend « rien » sur ce qui ne le
 * concerne pas, et l'ordre de lecture dans `deterministic_buttons.ts` est donc
 * sans conséquence. Une famille ajoutée sans être listée dans
 * `DETERMINISTIC_BUTTON_PREFIXES` retombe au dispatcher sur charge cassée,
 * c'est-à-dire qu'elle redevient interprétable par un modèle.
 */
export const FEEDBACK_BUTTON_PREFIX = "KEEL_FEEDBACK_";

/** `|` sépare les niveaux; l'identifiant de plan est un uuid, sans `|`. */
const SEP = "|";

/** Les deux questions dont les options sont des TITRES DE PLATS. */
export const DISH_QUESTIONS = ["never_again", "make_again"] as const;
export type DishQuestion = (typeof DISH_QUESTIONS)[number];

export function isDishQuestion(q: FeedbackQuestion): q is DishQuestion {
  return (DISH_QUESTIONS as readonly string[]).includes(q);
}

/** Le jeton « aucun de ces plats ». Il vaut réponse, jamais absence. */
export const NONE_TOKEN = "none";

/**
 * Le nombre de plats proposés au maximum.
 *
 * Un plan de sept jours porte cinq à huit plats distincts; au-delà la liste
 * devient un mur de boutons dans une bulle. Les plats sont pris dans l'ordre du
 * plan, donc la coupure retire la FIN de la semaine — celle dont on se souvient
 * le mieux, ce qui est un défaut. Il est nommé plutôt que caché: la personne
 * qui veut nommer un plat coupé a l'écran, où la liste est entière.
 */
export const MAX_DISH_BUTTONS = 8;

// ---------------------------------------------------------------------------
// LES IDENTIFIANTS
// ---------------------------------------------------------------------------

export function feedbackAnswerId(
  mealId: string,
  question: FeedbackQuestion,
  value: string,
): string {
  return `${FEEDBACK_BUTTON_PREFIX}${mealId}${SEP}${question}${SEP}${value}`;
}

/**
 * Une réponse de plat voyage par son INDEX, jamais par son titre.
 *
 * Un titre dans une charge utile serait du texte libre qui revient — avec ses
 * accents, ses apostrophes et sa longueur — et il faudrait le rapprocher du
 * plan à l'arrivée, c'est-à-dire deviner. L'index se relit exactement, et
 * `dishTitlesOf` est la SEULE dérivation de la liste: les deux côtés lisent la
 * même fonction.
 */
export function feedbackDishId(
  mealId: string,
  question: DishQuestion,
  dishIndex: number,
): string {
  return `${FEEDBACK_BUTTON_PREFIX}${mealId}${SEP}${question}${SEP}#${dishIndex}`;
}

export function feedbackSubjectId(mealId: string, subject: string): string {
  return `${FEEDBACK_BUTTON_PREFIX}${mealId}${SEP}portions_subject${SEP}${subject}`;
}

/**
 * « POUR QUI ? » SUR UN ALIMENT — lot B.
 *
 * ⛔ UN IDENTIFIANT PAR QUESTION, et pas un seul partagé: « plus de saumon pour
 * Tom » et « du brocoli pour Léa » sont deux assiettes, et un sujet unique
 * rangerait les deux sur la même bouche. Le jeton porte donc la question à
 * laquelle il répond, comme `feedbackDishId`.
 */
export function feedbackFoodSubjectId(
  mealId: string,
  question: DishQuestion,
  subject: string,
): string {
  return `${FEEDBACK_BUTTON_PREFIX}${mealId}${SEP}${question}_subject${SEP}${subject}`;
}

export function feedbackDismissId(mealId: string): string {
  return `${FEEDBACK_BUTTON_PREFIX}${mealId}${SEP}dismiss`;
}

export type FeedbackReply =
  | { kind: "answer"; mealId: string; question: FeedbackQuestion; value: string }
  | {
    kind: "dish";
    mealId: string;
    question: DishQuestion;
    /** `null` ⇒ « aucun », qui est une réponse. */
    dishIndex: number | null;
  }
  | { kind: "subject"; mealId: string; subject: string }
  /** LOT B — « pour qui ? » sur l'aliment qui vient d'être nommé. */
  | {
    kind: "food_subject";
    mealId: string;
    question: DishQuestion;
    subject: string;
  }
  | { kind: "dismiss"; mealId: string }
  | { kind: "none" };

const NONE: FeedbackReply = { kind: "none" };

/**
 * Un sujet BIEN FORMÉ — `household` ou `member:<uuid>`.
 *
 * La forme est aussi vérifiée par le CHECK en base
 * (`meal_plan_feedback_portions_subject_shape`); ici on refuse seulement ce qui
 * ne peut pas être un sujet, pour ne pas faire un aller-retour de base sur une
 * charge forgée. ⛔ Jamais un prénom.
 */
function isSubjectToken(value: string): boolean {
  return value === "household" ||
    /^member:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      .test(value);
}

/**
 * Interprète un `button_payload`. Rend `{kind:"none"}` sur tout ce qui n'est
 * pas de cette famille — jamais une exception, et jamais une devinette sur une
 * charge cassée.
 */
export function readFeedbackReply(payload: unknown): FeedbackReply {
  const raw = String(payload ?? "").trim();
  if (!raw.startsWith(FEEDBACK_BUTTON_PREFIX)) return NONE;
  const parts = raw.slice(FEEDBACK_BUTTON_PREFIX.length).split(SEP);
  const mealId = String(parts[0] ?? "").trim();
  if (!mealId) return NONE;

  if (parts.length === 2 && parts[1] === "dismiss") {
    return { kind: "dismiss", mealId };
  }
  if (parts.length !== 3) return NONE;
  const question = String(parts[1] ?? "").trim();
  const value = String(parts[2] ?? "").trim();
  if (!question || !value) return NONE;

  // ── LOT B · « POUR QUI ? » SUR UN ALIMENT ────────────────────────────
  // ⚠️ TESTÉ AVANT `portions_subject` ET AVANT LES QUESTIONS, parce que le
  // jeton est composé (`never_again_subject`): sans ce test, il tomberait dans
  // la dernière branche, ne trouverait aucune option, et se lirait `none` —
  // c'est-à-dire un tap perdu en silence.
  if (question.endsWith("_subject") && question !== "portions_subject") {
    const dish = question.slice(0, -"_subject".length);
    if (!isDishQuestion(dish as FeedbackQuestion)) return NONE;
    if (!isSubjectToken(value)) return NONE;
    return {
      kind: "food_subject",
      mealId,
      question: dish as DishQuestion,
      subject: value,
    };
  }

  if (question === "portions_subject") {
    // La forme est vérifiée par le CHECK en base
    // (`meal_plan_feedback_portions_subject_shape`); ici on refuse seulement ce
    // qui ne peut pas être un sujet, pour ne pas faire un aller-retour de base
    // sur une charge forgée.
    if (!isSubjectToken(value)) return NONE;
    return { kind: "subject", mealId, subject: value };
  }

  if (isDishQuestion(question as FeedbackQuestion)) {
    const dish = question as DishQuestion;
    if (value === NONE_TOKEN) {
      return { kind: "dish", mealId, question: dish, dishIndex: null };
    }
    if (!value.startsWith("#")) return NONE;
    const index = Number(value.slice(1));
    if (!Number.isInteger(index) || index < 0) return NONE;
    return { kind: "dish", mealId, question: dish, dishIndex: index };
  }

  // Une question du vocabulaire, avec une valeur de SON énumération. Une valeur
  // d'une AUTRE question est refusée: `cooked=often` s'archiverait sous un
  // CHECK plus permissif et le lecteur n'en tirerait rien, en silence.
  const options = QUESTION_OPTIONS[question as FeedbackQuestion];
  if (!options || !options.includes(value)) return NONE;
  return {
    kind: "answer",
    mealId,
    question: question as FeedbackQuestion,
    value,
  };
}

// ---------------------------------------------------------------------------
// LES TITRES DE PLATS — UNE seule dérivation, partagée par les deux côtés
// ---------------------------------------------------------------------------

/**
 * LES ALIMENTS DISTINCTS D'UN PLAN, dans l'ordre — lot B.
 *
 * ⚠️ LES PRÉPARATIONS SONT PLIÉES DANS LES PLATS. En cuisine par lots, les
 * ingrédients ne sont PAS dans le plat: le plat dit « une portion du poulet
 * rôti de mercredi », et le kilo de cuisses vit dans la préparation. Ne lire
 * que les plats proposerait des garnitures et tairait la protéine — cicatrice
 * `preparations-must-be-folded-into-dishes`.
 *
 * ⚠️ LE DÉDOUBLONNAGE N'EST PAS COSMÉTIQUE, et c'est la même raison que pour
 * les titres: le moteur étend un plat en lot sur chacun de ses jours, et sans
 * lui la personne aurait quatre boutons « poulet » pour une seule intention.
 *
 * ⛔ C'EST LA SEULE DÉRIVATION, et les deux côtés la lisent — sinon les INDEX
 * cesseraient de désigner le même aliment de part et d'autre du tap.
 */
export function foodTermsOf(dishes: unknown, preparations: unknown): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const list of [dishes, preparations]) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const ingredients = ((entry ?? {}) as Record<string, unknown>).ingredients;
      if (!Array.isArray(ingredients)) continue;
      for (const raw of ingredients) {
        const term = String(((raw ?? {}) as Record<string, unknown>).term ?? "")
          .trim();
        if (!term || seen.has(term)) continue;
        seen.add(term);
        terms.push(term);
      }
    }
  }
  return terms;
}

/**
 * Les titres DISTINCTS d'un plan, dans l'ordre.
 *
 * ⚠️ LE DÉDOUBLONNAGE N'EST PAS COSMÉTIQUE. Le moteur étend un plat en lot sur
 * chacun des jours qu'il couvre: sans lui, la liste porterait « Poulet et riz »
 * quatre fois et la personne aurait quatre boutons pour une seule intention.
 * C'est le même geste que `planFeedback.ts` côté écran, et c'est pour ça qu'il
 * vit ici: deux dédoublonnages divergeraient, et les INDEX cesseraient de
 * désigner le même plat des deux côtés.
 */
export function dishTitlesOf(dishes: unknown): string[] {
  if (!Array.isArray(dishes)) return [];
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const entry of dishes) {
    if (!entry || typeof entry !== "object") continue;
    const title = String((entry as Record<string, unknown>).title ?? "").trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    titles.push(title);
  }
  return titles;
}

// ---------------------------------------------------------------------------
// L'ÉTAT — dérivé de la ligne, jamais stocké à côté
// ---------------------------------------------------------------------------

/**
 * Ce que la ligne `meal_plan_feedback` porte déjà.
 *
 * ⚠️ `answered` EST LA SEULE SOURCE POUR LES QUESTIONS DE PLATS, et ce n'est
 * pas un raffinement. `never_again` et `make_again` sont `not null default
 * '[]'` en base: une ligne insérée pour répondre à `cooked` les porte DÉJÀ
 * vides. Les lire directement ferait sauter les deux questions de plats dès le
 * deuxième tap — un questionnaire à trois questions sur cinq, sans une seule
 * erreur nulle part. La migration `20260901160000` pose le marqueur et en écrit
 * le motif en entier.
 */
export interface FeedbackRowState {
  cooked: string | null;
  portions: string | null;
  portionsSubject: string | null;
  /** Le contenu, pour l'appelant. L'ÉTAT, lui, se lit dans `answered`. */
  neverAgain: readonly string[];
  makeAgain: readonly string[];
  /**
   * ── LOT B · LES ALIMENTS DÉJÀ NOMMÉS, avec leur sujet s'il a été demandé.
   *
   * ⚠️ LA RELANCE « POUR QUI ? » LES LIT: elle ne peut porter que sur
   * l'aliment qu'on vient d'écrire, et le chat n'en nomme qu'un par question.
   * Un `subject: null` sur une ligne présente veut dire « nommé, sujet pas
   * encore demandé » — c'est exactement l'état où la relance est due.
   */
  neverAgainFoods: readonly { food: string; subject: string | null }[];
  makeAgainFoods: readonly { food: string; subject: string | null }[];
  /** ── LOT B · les trois réponses neuves. `null` = pas encore répondue. */
  difficulty: string | null;
  speed: string | null;
  variety: string | null;
  /** ── LOT B · le champ libre. `null` = pas encore répondu. */
  anythingElse: string | null;
  /** ⚠️ HÉRITÉS, lus et jamais écrits — la quatrième question d'avant. */
  axisQuestion: string | null;
  axisAnswer: string | null;
  /**
   * Les jetons auxquels un humain a RÉPONDU. Jamais « posé »: une question
   * posée et ignorée doit rester posable, sinon un tap raté la perd à vie.
   */
  answered: readonly string[];
  dismissedAt: string | null;
}

export const EMPTY_FEEDBACK_ROW: FeedbackRowState = {
  cooked: null,
  portions: null,
  portionsSubject: null,
  neverAgain: [],
  makeAgain: [],
  neverAgainFoods: [],
  makeAgainFoods: [],
  difficulty: null,
  speed: null,
  variety: null,
  anythingElse: null,
  axisQuestion: null,
  axisAnswer: null,
  answered: [],
  dismissedAt: null,
};

export type NextStep =
  | { step: "question"; question: FeedbackQuestion }
  | { step: "portions_subject" }
  /** LOT B — « pour qui ? » sur l'aliment qui vient d'être nommé. */
  | { step: "food_subject"; question: DishQuestion }
  | { step: "done" };

/**
 * La prochaine chose à demander, dérivée de la ligne.
 *
 * @param questions la sortie de `questionsFor(goal, restrictionFlag)` — c'est
 *   ELLE qui décide quelles questions existent pour cette personne, plancher
 *   TCA compris. Ce module ne re-décide rien: une seconde liste divergerait au
 *   premier ajout.
 * @param subjectDue le résultat de `portionSubjectIsAsked` — passé plutôt que
 *   recalculé, parce qu'il dépend du nombre de bouches, qui est une lecture.
 *
 * L'ORDRE EST CELUI DE `questions`, avec la relance « pour qui ? » JUSTE APRÈS
 * la question de portion: une relance posée trois questions plus loin ne se
 * rattacherait plus à rien dans la tête de la personne.
 */
export function nextFeedbackStep(args: {
  row: FeedbackRowState;
  questions: readonly FeedbackQuestion[];
  subjectDue: boolean;
  /**
   * LOT B — y a-t-il plus d'une bouche à table ? Passé plutôt que recalculé,
   * pour la même raison que `subjectDue`: c'est une LECTURE, et ce module est
   * pur.
   */
  foodSubjectDue: boolean;
}): NextStep {
  const { row } = args;
  if (row.dismissedAt) return { step: "done" };

  // ⚠️ `answered` D'ABORD, LA COLONNE ENSUITE — et jamais l'inverse.
  //
  // Une ligne écrite par un client d'AVANT le marqueur (l'écran, jusqu'à la
  // migration `20260901160000`) porte `answered = []` et des colonnes pleines:
  // le repli sur la colonne évite de lui reposer `cooked` et `portions`. Les
  // deux questions de plats, elles, n'ont pas de repli possible — c'est le
  // défaut que le marqueur existe pour fermer — et une ligne d'avant se voit
  // donc reposer ces deux-là. Redemander est le bon côté pour se tromper.
  const answered = new Set(row.answered);

  for (const question of args.questions) {
    if (question === "cooked") {
      if (!answered.has("cooked") && row.cooked === null) {
        return { step: "question", question };
      }
      continue;
    }
    if (question === "portions") {
      if (!answered.has("portions") && row.portions === null) {
        return { step: "question", question };
      }
      // La relance, immédiatement après — et seulement si elle est due ET pas
      // déjà répondue.
      if (args.subjectDue && row.portionsSubject === null) {
        return { step: "portions_subject" };
      }
      continue;
    }
    // ── LOT B · LES DEUX QUESTIONS DE CUISINE, GATÉES PAR `cooked` ───────
    // ⛔ LA RÈGLE VIENT DU MODULE, pas d'un second test ici: demander
    // « c'était trop long ? » à quelqu'un qui n'a pas cuisiné déplacerait un
    // réglage réel sur une supposition, et la base le REFUSE
    // (`cooking_answer_without_cooking`). Une bulle qui mène à un refus est
    // pire qu'une bulle qu'on ne pose pas.
    //
    // ⚠️ ET LA GARDE SE LIT SUR LA COLONNE, PAS SUR `answered`: `cooked` peut
    // être répondu sans que la colonne soit relue, mais c'est SA VALEUR qui
    // décide. Un `answered` qui porte « cooked » sans valeur ne dit pas si on
    // a cuisiné.
    if (question === "difficulty" || question === "speed") {
      if (!cookingQuestionsAreAsked(row.cooked)) continue;
      const value = question === "difficulty" ? row.difficulty : row.speed;
      if (!answered.has(question) && value === null) {
        return { step: "question", question };
      }
      continue;
    }
    if (question === "enough_variety") {
      // ⚠️ LE REPLI SUR L'HÉRITÉ: une ligne d'avant le lot B porte cette
      // réponse dans `axis_answer`. Lui reposer la question serait la lui
      // poser deux fois pour une seule intention.
      if (
        !answered.has(question) && row.variety === null && row.axisAnswer === null
      ) {
        return { step: "question", question };
      }
      continue;
    }
    if (question === "anything_else") {
      // ⛔ LE CHAMP LIBRE EST FACULTATIF, ET C'EST SA GARDE. Il n'a pas de
      // bouton: on le pose UNE fois, et son absence de réponse ferme le
      // questionnaire. Le reposer ferait d'une question facultative une
      // question obligatoire — c'est-à-dire l'interrogatoire que §3.2 refuse.
      if (!answered.has(question)) return { step: "question", question };
      continue;
    }
    if (question === "never_again" || question === "make_again") {
      if (!answered.has(question)) return { step: "question", question };
      // ── LOT B · LA RELANCE, IMMÉDIATEMENT APRÈS ────────────────────────
      // Même place et même raison que « pour qui ? » sur les portions: une
      // relance posée trois questions plus loin ne se rattacherait plus à rien
      // dans la tête de la personne.
      //
      // ⛔ TROIS CONDITIONS, ET AUCUNE N'EST OPTIONNELLE: un aliment a été
      // nommé (« aucun » n'a personne à désigner), son sujet n'a pas encore
      // été demandé (`subject === null`), et il y a plus d'une bouche (un solo
      // EST toute sa table — lui poser la question serait un choix à une seule
      // issue).
      const named = question === "never_again"
        ? row.neverAgainFoods
        : row.makeAgainFoods;
      const first = named[0];
      if (args.foodSubjectDue && first && first.subject === null) {
        return { step: "food_subject", question };
      }
      continue;
    }
    // ⚠️ BRANCHE HÉRITÉE: une question d'axe d'avant le lot B, si une ligne en
    // porte une. Elle ne se pose plus (le vocabulaire ne la contient plus),
    // mais un `questions` construit ailleurs ne doit pas tomber en silence.
    if (!answered.has(question) && row.axisAnswer === null) {
      return { step: "question", question };
    }
  }
  return { step: "done" };
}

// ---------------------------------------------------------------------------
// LE RENDU
// ---------------------------------------------------------------------------

export interface FeedbackButton {
  id: string;
  title: string;
}

export interface FeedbackPrompt {
  body: string;
  buttons: FeedbackButton[];
}

const DISMISS_LABEL: Record<FeedbackLanguage, string> = {
  en: "Not now",
  fr: "Pas maintenant",
};

/**
 * ⚠️ AUCUNE PHRASE D'INTRODUCTION, ET C'EST DÉLIBÉRÉ.
 *
 * « Ta semaine est finie, j'ai quelques questions » annonce un questionnaire,
 * c'est-à-dire fait fuir. La question EST le message. C'est la même règle que
 * la bande du soir: on n'emballe pas une affordance dans une préface.
 */
export function renderFeedbackQuestion(args: {
  mealId: string;
  question: FeedbackQuestion;
  language: FeedbackLanguage;
  /** Les ALIMENTS distincts du plan — requis, même vide, pour les deux questions de plat. */
  foodTerms: readonly string[];
  /** Le « pas maintenant » n'est offert QUE sur la première question (§3.2). */
  offerDismiss: boolean;
}): FeedbackPrompt | null {
  const { language } = args;
  const label = QUESTION_LABELS[args.question];
  if (!label) return null;

  const buttons: FeedbackButton[] = [];

  if (isDishQuestion(args.question)) {
    const foods = args.foodTerms.slice(0, MAX_DISH_BUTTONS);
    // Un plan sans aliment citable ne peut pas poser cette question: trois
    // boutons « #1 #2 #3 » ne demandent rien. On la saute, et l'appelant passe
    // à la suivante — la ligne portera `[]`, c'est-à-dire « aucun ».
    if (foods.length === 0) return null;
    for (const [index, food] of foods.entries()) {
      buttons.push({
        id: feedbackDishId(args.mealId, args.question, index),
        title: food,
      });
    }
    buttons.push({
      id: feedbackAnswerId(args.mealId, args.question, NONE_TOKEN),
      title: OPTION_LABELS[NONE_TOKEN][language],
    });
  } else {
    for (const option of QUESTION_OPTIONS[args.question]) {
      const optionLabel = OPTION_LABELS[option];
      // R7 par délégation: une option sans libellé est un défaut de livraison,
      // pas un bouton à fabriquer. On la saute et le test de parité tombe.
      if (!optionLabel) continue;
      buttons.push({
        id: feedbackAnswerId(args.mealId, args.question, option),
        title: optionLabel[language],
      });
    }
    if (buttons.length === 0) return null;
  }

  if (args.offerDismiss) {
    buttons.push({
      id: feedbackDismissId(args.mealId),
      title: DISMISS_LABEL[language],
    });
  }

  return { body: label[language], buttons };
}

/** La relance « pour qui ? », avec les bouches du foyer. */
export function renderPortionSubjectQuestion(args: {
  mealId: string;
  language: FeedbackLanguage;
  /**
   * Les bouches, `member_id` + prénom. Le prénom sert D'ÉTIQUETTE et ne voyage
   * jamais dans la charge: c'est l'identifiant qui revient, et un renommage ne
   * casse donc rien.
   */
  members: readonly { memberId: string; firstName: string }[];
}): FeedbackPrompt | null {
  if (args.members.length === 0) return null;
  const buttons: FeedbackButton[] = [{
    id: feedbackSubjectId(args.mealId, "household"),
    title: OPTION_LABELS.everyone[args.language],
  }];
  for (const member of args.members) {
    const name = String(member.firstName ?? "").trim();
    if (!name || !member.memberId) continue;
    buttons.push({
      id: feedbackSubjectId(args.mealId, `member:${member.memberId}`),
      title: name,
    });
  }
  // Une seule option (« tout le monde ») ne demande rien: sans une seule bouche
  // nommable, la question est décorative et le défaut `household` la vaut.
  if (buttons.length < 2) return null;
  return { body: PORTION_SUBJECT_LABEL[args.language], buttons };
}

/**
 * « POUR QUI ? » SUR L'ALIMENT QUI VIENT D'ÊTRE NOMMÉ — lot B.
 *
 * ⛔ CE N'EST PAS UNE QUESTION DE PLUS: c'est la seconde moitié de la question
 * d'aliment, exactement comme « pour qui ? » l'est de `portions`. Et elle ne se
 * pose QUE si un aliment a été nommé (« aucun » n'a personne à désigner) et
 * QUE s'il y a plus d'une bouche — un solo EST toute sa table.
 *
 * ⚠️ C'EST ELLE QUI REND LA PRÉFÉRENCE ATTRIBUABLE, donc la ceinture par
 * bouche capable de mordre chez la bonne personne. Sans sujet, « plus de
 * saumon » retire le saumon à toute la table.
 */
export function renderFoodSubjectQuestion(args: {
  mealId: string;
  question: DishQuestion;
  language: FeedbackLanguage;
  food: string;
  // ⚠️ `firstName`, LA MÊME FORME QUE `renderPortionSubjectQuestion`. Deux
  // formes de bouche dans le même fichier finiraient par diverger.
  members: readonly { memberId: string; firstName: string }[];
}): FeedbackPrompt | null {
  const food = String(args.food ?? "").trim();
  if (!food || args.members.length === 0) return null;
  const buttons: FeedbackButton[] = [{
    // LE DÉFAUT DE L'AXE 3 EN PREMIER: « tout le monde à table ». C'est une
    // réponse, pas une absence de réponse.
    id: feedbackFoodSubjectId(args.mealId, args.question, "household"),
    title: OPTION_LABELS.everyone[args.language],
  }];
  for (const member of args.members) {
    // ⛔ LA CLÉ EST L'IDENTIFIANT, LE PRÉNOM EST L'AFFICHAGE.
    buttons.push({
      id: feedbackFoodSubjectId(
        args.mealId,
        args.question,
        `member:${member.memberId}`,
      ),
      title: member.firstName,
    });
  }
  // ⚠️ L'ALIMENT EST RAPPELÉ DANS LA QUESTION, et ce n'est pas cosmétique: la
  // bulle précédente en proposait huit, et « Pour qui ? » seul ne dit pas
  // lequel des huit on vient de nommer.
  return { body: `${PORTION_SUBJECT_LABEL[args.language]} (${food})`, buttons };
}

/**
 * L'ACCUSÉ D'UNE RÉPONSE — et il ne renvoie ni chiffre, ni verdict, ni merci
 * appuyé.
 *
 * Il n'existe que pour le DERNIER tap: entre deux questions, la question
 * suivante EST l'accusé (elle prouve que le tap a été reçu). Un « noté ! » à
 * chaque tap ferait cinq messages pour un questionnaire.
 */
export function renderFeedbackClosing(language: FeedbackLanguage): string {
  return language === "fr"
    ? "C'est noté — ça part dans la composition du prochain plan."
    : "Got it — this goes into how the next plan is composed.";
}

/** L'accusé d'un « pas maintenant ». Une phrase, et rien ne reste ouvert. */
export function renderFeedbackDismissed(language: FeedbackLanguage): string {
  return language === "fr"
    ? "Pas de souci, je n'en reparle pas."
    : "No problem, I will not bring it up again.";
}
