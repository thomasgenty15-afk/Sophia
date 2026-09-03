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
  | { kind: "dismiss"; mealId: string }
  | { kind: "none" };

const NONE: FeedbackReply = { kind: "none" };

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

  if (question === "portions_subject") {
    // La forme est vérifiée par le CHECK en base
    // (`meal_plan_feedback_portions_subject_shape`); ici on refuse seulement ce
    // qui ne peut pas être un sujet, pour ne pas faire un aller-retour de base
    // sur une charge forgée.
    if (
      value !== "household" &&
      !/^member:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        .test(value)
    ) {
      return NONE;
    }
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
  axisQuestion: null,
  axisAnswer: null,
  answered: [],
  dismissedAt: null,
};

export type NextStep =
  | { step: "question"; question: FeedbackQuestion }
  | { step: "portions_subject" }
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
    if (question === "never_again" || question === "make_again") {
      if (!answered.has(question)) return { step: "question", question };
      continue;
    }
    // La question d'axe: UNE seule par personne, identifiée par son jeton —
    // c'est ce jeton-là qui entre dans `answered`, pas le mot « axis ».
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
  /** Les titres distincts du plan — requis, même vide, pour les deux questions de plat. */
  dishTitles: readonly string[];
  /** Le « pas maintenant » n'est offert QUE sur la première question (§3.2). */
  offerDismiss: boolean;
}): FeedbackPrompt | null {
  const { language } = args;
  const label = QUESTION_LABELS[args.question];
  if (!label) return null;

  const buttons: FeedbackButton[] = [];

  if (isDishQuestion(args.question)) {
    const titles = args.dishTitles.slice(0, MAX_DISH_BUTTONS);
    // Un plan sans titre citable ne peut pas poser cette question: trois
    // boutons « #1 #2 #3 » ne demandent rien. On la saute, et l'appelant passe
    // à la suivante — la ligne portera `[]`, c'est-à-dire « aucun ».
    if (titles.length === 0) return null;
    for (const [index, title] of titles.entries()) {
      buttons.push({
        id: feedbackDishId(args.mealId, args.question, index),
        title,
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
