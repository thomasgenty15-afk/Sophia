/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LE CANAL DÉTERMINISTE → PAROLE, ET SA CEINTURE DE SORTIE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, ET IL N'EN FAIT QU'UN ────────────────────────────────────────
 * Le chantier de nuit du 2026-08-08 a nommé son propre motif structurel, après
 * que cinq fiches indépendantes aient buté dessus :
 *
 *      « Le déterministe décide, la couche qui parle ne le sait pas
 *        et n'est pas contrainte. »
 *
 * Ce ne sont pas cinq bugs, c'est une couture inachevée entre la couche qui
 * CALCULE et la couche qui RÉPOND. Les symptômes mesurés :
 *
 *   T-1  · « Got it — 78, not 87 » pendant que la base porte 87 ; « 78 kg is
 *          now your current weight » à un MINEUR dont rien n'a été écrit (3/3).
 *          Le plancher FF-008 écrit — ou refuse — directement en base, hors
 *          `direct_effects` ; le composeur ne voit ni l'un ni l'autre.
 *   T-6  · le composeur écrit sa PROPRE demande de photo, hors budget (~1/25).
 *          La lane gate correctement, puis la couche qui parle ajoute sa
 *          sollicitation sans passer par le compteur (`daily_ask_budget.ts`).
 *   T-7  · sous plancher, le repas déclaré est écrit EN SILENCE
 *          (`floor_silenced_write.ts`, arbitrage humain du 2026-08-08 : « écrire
 *          le fait, taire la réponse »). Le module dit lui-même que son lecteur
 *          manque. Le voici : la moitié « taire » n'existait pas.
 *   T-16 · un MINEUR obtient « 56.3 g of sugar per 100 g » (2/3). La règle qui
 *          l'interdit vit dans le prompt.
 *
 * ── LA LEÇON, ÉCRITE UNE FOIS ───────────────────────────────────────────────
 * ⚠️ **UNE RÈGLE DE PROMPT N'EST PAS UNE CEINTURE.** C'est la leçon littérale
 * de T-16, et elle vaut pour les quatre. Ce qui n'est pas vérifié sur le TEXTE
 * SORTANT n'est pas garanti.
 *
 * ── DEUX MOITIÉS, ET LES DEUX SONT NÉCESSAIRES ──────────────────────────────
 *  1. LE CANAL (`TurnLedger`) — ce que les planchers ont ÉCRIT et ce qu'ils ont
 *     REFUSÉ, avec le motif, devient une donnée du tour. Il voyage sur
 *     `KeelTurnContext`, qui est passé OBLIGATOIREMENT à `finalVisibleText` sur
 *     les six chemins de sortie : le compilateur refuse d'en oublier un.
 *  2. LA CEINTURE (`enforceTurnLedger`) — le texte sortant est vérifié contre
 *     le canal.
 *
 * ⚠️ ORDRE IMPOSÉ, ET IL EST DANS CE FICHIER : le canal se remplit AVANT que la
 * ceinture ne lise. Une ceinture sans canal ne peut rien vérifier et bloquerait
 * tout — cicatrice `guards-need-a-passing-case` : « une garde cassée bloque
 * TOUT, et c'est indiscernable d'une garde qui marche si on ne teste que le cas
 * bloqué ». C'est pourquoi CHAQUE règle ci-dessous est gardée par une PRÉMISSE
 * tirée du ledger : sans entrée, la règle ne s'arme pas. Un tour ordinaire ne
 * peut pas être touché, et c'est prouvé par test.
 *
 * ── CE QUE LE CANAL N'EXPOSE PAS ────────────────────────────────────────────
 * Le ledger porte des JETONS (`subject`, `outcome`, `reason_code`) et une
 * valeur relue. Il ne porte AUCUNE prose, et il n'entre dans AUCUN prompt : il
 * est lu par une fonction pure, sur le texte final, et rien de son contenu ne
 * peut atteindre la bulle. Un motif de plancher (« refus TCA ») est une
 * information de sécurité ; la ceinture s'en sert pour RETIRER du texte, jamais
 * pour en écrire.
 */

import { containsAcknowledgementClaim } from "../../sophia-brain/skills/_shared/keel_ack_without_effect_guard.ts";
import { isFrenchLocale } from "./locale.ts";

// ═══════════════════════════════════════════════════════════════════════════
// 1. LE CANAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Les faits dont un plancher décide et dont la réponse parle. Liste FERMÉE :
 * un sujet sans règle de ceinture est un canal qui fuit sans contrainte, ce qui
 * est le défaut d'origine avec une structure de données en plus.
 */
export type TurnLedgerSubject =
  /** FF-008 — la mesure corporelle annoncée en conversation. */
  | "body_measure"
  /** FF-017 / FF-009 — la déclaration de repas. */
  | "meal_declaration"
  /** FF-025 — l'invitation à la photo, seule sollicitation photo autorisée. */
  | "photo_invitation";

/**
 * `written_silently` N'EST PAS `written`, et la distinction EST le lot T-7.
 *
 * Sous plancher (safety ou restriction), `floor_silenced_write.ts` écrit le
 * fait et le runtime est muselé (`content: ""`). L'arbitrage humain était
 * « écrire le fait, TAIRE la réponse » : la première moitié est livrée depuis
 * le commit `45a42e90`, la seconde n'avait pas de mécanisme. Un `written` tout
 * court autoriserait l'accusé, ce qui est exactement la pression d'adhérence
 * que le plancher existe pour suspendre.
 */
export type TurnLedgerOutcome =
  | "written"
  | "written_silently"
  | "refused"
  | "failed";

export type TurnLedgerEntry = {
  subject: TurnLedgerSubject;
  outcome: TurnLedgerOutcome;
  /** Jeton ASCII snake_case (R1). Le motif du plancher, jamais de la prose. */
  reason_code: string;
  /**
   * La valeur RELUE EN BASE, en unité SI, ou `null`.
   *
   * ⚠️ RELUE, jamais celle qu'on a envoyée. C'est la moitié qui répare T-1 :
   * « Got it — 78, not 87 » était vrai du point de vue du composeur (l'élève
   * avait dit 78) et faux du point de vue de la personne (la base porte 87).
   * Seule la valeur relue tranche.
   */
  stored_value_si: number | null;
};

export type TurnLedger = TurnLedgerEntry[];

/**
 * Le ledger d'un tour NON-KEEL. Gelé, partagé, et il ne doit jamais recevoir
 * de ligne : `LEGACY_KEEL_TURN_CONTEXT` est un const de module, donc un tableau
 * mutable partagé y fuirait d'un tour à l'autre. `recordTurnLedger` refuse
 * d'écrire hors élève KEEL — le gel est le filet sous cette règle, pas le
 * mécanisme.
 */
const frozenEmptyLedger: TurnLedger = [];
Object.freeze(frozenEmptyLedger);
export const EMPTY_TURN_LEDGER: TurnLedger = frozenEmptyLedger;

/**
 * Poser une ligne au ledger du tour.
 *
 * @param isKeelStudent REQUIS, jamais optionnel — cicatrice
 *   `optional-gate-params-are-disarmed-gates`. Hors élève KEEL il n'y a ni
 *   plancher ni ceinture, et écrire dans le ledger gelé du contexte legacy
 *   lèverait au milieu d'un tour.
 */
export function recordTurnLedger(args: {
  ledger: TurnLedger;
  isKeelStudent: boolean;
  entry: TurnLedgerEntry;
}): void {
  if (args.isKeelStudent !== true) return;
  if (Object.isFrozen(args.ledger)) return;
  args.ledger.push(args.entry);
}

/** Toutes les lignes d'un sujet, dans l'ordre où les planchers ont décidé. */
export function ledgerEntriesFor(
  ledger: readonly TurnLedgerEntry[] | null | undefined,
  subject: TurnLedgerSubject,
): TurnLedgerEntry[] {
  return (Array.isArray(ledger) ? ledger : []).filter((entry) =>
    entry?.subject === subject
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LES DÉTECTEURS — bornés au MOT, et bilingues
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ Cicatrice `never-hand-roll-a-matcher-here` : une recherche de sous-chaîne
// produit une mesure INVERSÉE, pas approximative (« laitue » comptée comme
// « lait », 12 faux positifs sur 12 mesurés). Elle vise les TERMES INTERDITS,
// dont le matcher est `forbidden_matcher.ts`. Ici on ne cherche aucun aliment :
// on cherche des FORMES (un nombre collé à une unité, une sollicitation
// adressée à l'élève). Les bornes de mot par lookaround sont donc reprises
// telles quelles, parce que c'est la partie de la leçon qui s'applique.
//
// ⚠️ Cicatrice `guard-tested-in-one-language-only` : chaque lexique porte ses
// deux langues, et les tests interrogent les deux. `not` ne couvre pas
// `doesn't`, et `\b` ne mord pas après « é ».

/**
 * ── LE DÉCOUPAGE EN PHRASES, ET POURQUOI CE MODULE EN A UN À LUI ────────────
 *
 * `keel_ack_without_effect_guard.ts` découpe sur `(?<=[.!?\n✅✔☑🟢])`. MESURÉ en
 * écrivant ce fichier : « Nutella has 56.3 g of sugar per 100 g. » se découpe
 * en `["Nutella has 56.", "3 g of sugar per 100 g."]` — LE POINT DÉCIMAL EST
 * PRIS POUR UNE FIN DE PHRASE. Retirer la « phrase » fautive laissait donc
 * « Nutella has 56. » dans la bulle : un chiffre tronqué, servi à un mineur,
 * par la ceinture censée l'interdire.
 *
 * Le lookahead `(?!\d)` est toute la différence : on ne coupe après un `.` que
 * s'il n'est pas suivi d'un chiffre. Les terminateurs non ambigus (retour à la
 * ligne, glyphes de coche) coupent inconditionnellement, comme chez le voisin —
 * et pour la même raison, écrite là-bas : le composeur pose « ...c'est pris en
 * compte ✅ Continue comme ça ! » sans ponctuation intercalaire.
 *
 * ⚠️ ET C'EST POURQUOI CE MODULE N'UTILISE PAS `acknowledgementClaimSentenceIndexes`:
 * ses index sont ceux de SON découpage. Deux découpages, deux numérotations, et
 * la ceinture retirerait la mauvaise phrase. On appelle donc
 * `containsAcknowledgementClaim` PHRASE PAR PHRASE — un seul lexique d'accusé
 * dans le dépôt, et un seul découpage par ceinture.
 *
 * Le défaut du voisin n'est PAS corrigé ici: sa ceinture est « la garde la plus
 * importante du produit », épinglée par 7 tests, et la toucher en passant est
 * exactement ce que ce lot ne fait pas. Il est consigné au rapport.
 */
export function splitBeltSentences(text: string): string[] {
  return String(text ?? "").split(/(?<=[.!?])(?!\d)|(?<=[\n✅✔☑🟢])/u);
}

/** Sans diacritiques, minuscule, apostrophes normalisées. */
function fold(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’'`]/g, " ")
    .toLowerCase();
}

/** Borne de mot qui survit aux accents repliés et aux chiffres collés. */
function wordPattern(alternatives: readonly string[]): RegExp {
  const body = [...alternatives]
    .sort((a, b) => b.length - a.length)
    .map((value) => fold(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(`(?<![a-z0-9])(?:${body})(?![a-z0-9])`, "u");
}

// ── Mesure corporelle ───────────────────────────────────────────────────────

/** `78 kg`, `78,4 kg`, `172 lbs`, `12 st` — le nombre ET son unité de masse. */
const MASS_QUANTITY =
  /(?<![a-z0-9])(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilo|kilos|kilogram|kilograms|kilogramme|kilogrammes|lb|lbs|pound|pounds|livre|livres)(?![a-z0-9])/gu;

/** Le SUJET « poids », sans nombre : « ton poids », « your weight ». */
const WEIGHT_WORD = wordPattern([
  "poids",
  "peses",
  "pese",
  "peser",
  "weight",
  "weigh",
  "weighs",
  "weighed",
  "scale",
  "balance",
]);

const POUND_TO_KG = 0.45359237;

/** Toute masse de la phrase, convertie en SI. Vide ⇒ aucune masse citée. */
export function massQuantitiesSi(text: string): number[] {
  const folded = fold(text);
  MASS_QUANTITY.lastIndex = 0;
  const out: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = MASS_QUANTITY.exec(folded)) !== null) {
    const value = Number(match[1].replace(",", "."));
    if (!Number.isFinite(value)) continue;
    const unit = match[2];
    const isPound = unit.startsWith("lb") || unit.startsWith("pound") ||
      unit.startsWith("livre");
    out.push(isPound ? value * POUND_TO_KG : value);
  }
  return out;
}

/**
 * La phrase parle-t-elle de la mesure corporelle de l'élève ?
 *
 * Un nombre + une unité de masse, OU le mot « poids ». Le second terme est
 * nécessaire : « c'est enregistré » juste après « je fais 78 » ne porte aucune
 * unité, et c'est pourtant l'accusé le plus courant.
 */
function mentionsBodyMeasure(sentence: string): boolean {
  const folded = fold(sentence);
  return massQuantitiesSi(sentence).length > 0 || WEIGHT_WORD.test(folded);
}

/**
 * La phrase parle-t-elle d'une VARIATION plutôt que d'une mesure ?
 *
 * ── POURQUOI CETTE LISTE EXISTE, ET CE QU'ELLE ÉVITE ────────────────────────
 * « Tu as pris 3 kg cette semaine » porte une masse qui n'est PAS la valeur
 * stockée, et elle est parfaitement vraie. Sans cette distinction, la règle
 * « pas de chiffre faux » mordrait sur toutes les phrases de progression du
 * produit — et le repli deviendrait le cas nominal, ce qui est un composeur
 * mort déguisé en composeur prudent.
 *
 * La première rédaction gardait la règle derrière le lexique d'accusé
 * (`containsAcknowledgementClaim`). MESURÉ : « Got it — 78 kg, not 87 kg. » ne
 * le déclenche pas — `isDirectiveGotIt` plafonne à six jetons et la phrase en
 * fait sept. La garde était donc désarmée sur LA phrase que T-1 cite. La
 * distinction juste n'est pas « accusé ou pas », c'est « mesure ou écart ».
 */
const DELTA_WORD = wordPattern([
  "de plus",
  "de moins",
  "en plus",
  "en moins",
  "perdu",
  "perdue",
  "pris",
  "prise",
  "gagne",
  "gagnee",
  "up",
  "down",
  "more",
  "less",
  "lost",
  "gained",
  "since",
  "depuis",
  "difference",
  "ecart",
]);

function statesADelta(sentence: string): boolean {
  return DELTA_WORD.test(fold(sentence));
}

// ── Sollicitation de photo ──────────────────────────────────────────────────

const PHOTO_WORD = wordPattern([
  "photo",
  "photos",
  "picture",
  "pictures",
  "pic",
  "pics",
  "snap",
  "snapshot",
  "cliche",
  "cliches",
  "image",
  "images",
]);

/** Impératifs et modaux de demande, adressés à l'élève. FR + EN. */
const PHOTO_REQUEST_SHAPE = [
  wordPattern(["envoie", "envoyer", "envoies", "montre", "montrer", "montres"]),
  wordPattern(["prends", "prendre", "poste", "poster", "partage", "partager"]),
  wordPattern(["send", "share", "post", "snap", "upload", "show"]),
  wordPattern(["peux", "pourrais", "veux", "can", "could", "would", "feel"]),
  wordPattern(["hesite", "hesites", "libre"]),
];

/**
 * La phrase SOLLICITE-t-elle une photo ?
 *
 * DEUX conditions, et la seconde est ce qui empêche la règle de mordre sur une
 * réponse légitime (« tu peux envoyer une photo depuis l'écran des repas » est
 * une explication, pas une demande — mais elle en a la forme, donc elle est
 * couverte par le désarmement `l'élève a parlé de photo` côté appelant) :
 *   1. un mot de photo ;
 *   2. une forme de demande (impératif, modal, ou question directe).
 */
export function solicitsAPhoto(sentence: string): boolean {
  const folded = fold(sentence);
  if (!PHOTO_WORD.test(folded)) return false;
  const isQuestion = sentence.trim().endsWith("?");
  return isQuestion || PHOTO_REQUEST_SHAPE.some((shape) => shape.test(folded));
}

// ── Chiffre de nutriment ────────────────────────────────────────────────────

/**
 * Les unités qui font d'un nombre un COMPTE DE NUTRIMENT, et rien d'autre.
 *
 * `g` seul n'y est PAS : « 200 g de riz » est une quantité de cuisine, une
 * information utile, et l'interdire priverait un mineur de sa recette. C'est la
 * PROXIMITÉ avec un nom de nutriment qui transforme un gramme en compte
 * nutritionnel — sauf pour l'énergie, dont l'unité est déjà un verdict.
 */
const ENERGY_QUANTITY =
  /(?<![a-z0-9])(\d+(?:[.,]\d+)?)\s*(kcal|cal|calorie|calories|kj|kilojoule|kilojoules)(?![a-z0-9])/u;

const MASS_OR_PERCENT_QUANTITY =
  /(?<![a-z0-9])(\d+(?:[.,]\d+)?)\s*(g|gr|gramme|grammes|gram|grams|mg|milligramme|milligrammes|milligram|milligrams|%|pour cent|percent)(?![a-z0-9])/u;

const NUTRIENT_WORD = wordPattern([
  "sucre",
  "sucres",
  "sugar",
  "sugars",
  "gras",
  // « grasse » et « grasses » sont des ENTRÉES À PART, pas une négligence:
  // les bornes de mot font que « gras » ne matche pas dans « matière grasse »
  // — c'est la protection qui empêche « laitue » de compter pour « lait », et
  // elle coupe dans les deux sens. Mesuré en écrivant ce fichier: « 30 % de
  // matière grasse » passait à travers la ceinture mineur.
  "grasse",
  "grasses",
  "graisse",
  "graisses",
  "lipide",
  "lipides",
  "fat",
  "fats",
  "sature",
  "satures",
  "saturated",
  "protein",
  "proteins",
  "proteine",
  "proteines",
  "glucide",
  "glucides",
  "carb",
  "carbs",
  "carbohydrate",
  "carbohydrates",
  "fibre",
  "fibres",
  "fiber",
  "fibers",
  "sel",
  "sodium",
  "salt",
  "cholesterol",
  "macro",
  "macros",
  "nutriment",
  "nutriments",
  "nutrient",
  "nutrients",
]);

/**
 * La phrase porte-t-elle un CHIFFRE DE NUTRIMENT ?
 *
 * FF-010 O1, mot pour mot : « quand l'interlocuteur est mineur,
 * `finalVisibleText` refuse tout chiffre de nutriment (g de sucre/gras, kcal,
 * %) ». Deux formes, parce qu'elles ne se ressemblent pas :
 *   · l'énergie porte son verdict dans son unité (« about 200 calories ») ;
 *   · la masse et le pourcentage ne le portent QUE devant un nutriment
 *     (« 56.3 g of sugar » mord, « 200 g de riz » non).
 */
export function statesANutrientFigure(sentence: string): boolean {
  const folded = fold(sentence);
  if (ENERGY_QUANTITY.test(folded)) return true;
  return MASS_OR_PERCENT_QUANTITY.test(folded) && NUTRIENT_WORD.test(folded);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LA CEINTURE
// ═══════════════════════════════════════════════════════════════════════════

export type TurnLedgerBiteReason =
  /** Un accusé pour un fait que le plancher a REFUSÉ ou n'a pas pu écrire. */
  | "ack_of_unwritten_fact"
  /** Le fait est écrit, mais le chiffre cité n'est pas celui de la base. */
  | "number_contradicts_stored_fact"
  /** Le plancher a écrit EN SILENCE : la réponse ne doit pas en parler. */
  | "ack_under_floor_silence"
  /** Une demande de photo qui n'est pas passée par le compteur (T-6). */
  | "unbudgeted_photo_request"
  /** Un chiffre de nutriment chez un mineur (T-16). */
  | "minor_nutrient_figure";

export type TurnLedgerBeltResult = {
  text: string;
  /** Les motifs de morsure. JAMAIS le contenu retiré (R9 de FF-007). */
  reasons: TurnLedgerBiteReason[];
  /** Combien de phrases sont tombées. */
  stripped_sentences: number;
};

export type TurnLedgerBeltInput = {
  /** Le texte FINAL, tel que l'élève le lirait. */
  text: string;
  ledger: readonly TurnLedgerEntry[] | null | undefined;
  /** REQUIS. Hors élève KEEL, aucune de ces règles n'a de sujet. */
  isKeelStudent: boolean;
  /**
   * REQUIS. `assessBirthDate` est la SEULE définition du mineur de ce dépôt ;
   * l'appelant passe son verdict, il n'en recalcule pas un second.
   */
  isMinor: boolean;
  /** Le message de l'élève, VERBATIM. Désarme la règle photo (voir plus bas). */
  userMessage: string;
  /** La locale de la réponse, pour la langue du repli. */
  locale: string;
};

/**
 * Le repli, quand la ceinture a tout emporté.
 *
 * Un tour VIDE est le seul résultat qu'une ceinture de sortie ne doit jamais
 * produire (R5 de FF-020, même famille). Deux chaînes, closes, sans chiffre et
 * sans question : une question ici serait une sollicitation, et l'une des
 * quatre règles existe précisément pour en retirer une.
 */
function beltFallback(locale: string): string {
  return isFrenchLocale(locale)
    ? "Je te réponds à côté de ça, dis-m'en un peu plus."
    : "Let's stay with what you told me — tell me a bit more.";
}

/**
 * LA CEINTURE. Pure : aucune I/O, aucun throw, aucune lecture d'horloge.
 *
 * Elle rend le texte et les motifs plutôt que de lever, pour la raison que
 * `acceptComposedRecap` donne déjà : l'appelant doit pouvoir COMPTER les
 * morsures. Une exception l'obligerait à l'attraper pour ne rien en faire, ce
 * qui finit toujours en `catch {}`.
 *
 * ⚠️ SI LE TAUX DE MORSURE EST ÉLEVÉ SUR DES TOURS ORDINAIRES, C'EST LE PROMPT
 * QU'IL FAUT CORRIGER, PAS LA CEINTURE QU'IL FAUT DESSERRER. Un repli devenu
 * nominal est un composeur mort, et il est invisible autrement. C'est pourquoi
 * l'appelant journalise `reasons`.
 */
export function enforceTurnLedger(
  input: TurnLedgerBeltInput,
): TurnLedgerBeltResult {
  const source = String(input.text ?? "");
  const untouched: TurnLedgerBeltResult = {
    text: source,
    reasons: [],
    stripped_sentences: 0,
  };
  if (input.isKeelStudent !== true || !source.trim()) return untouched;

  const ledger = Array.isArray(input.ledger) ? input.ledger : [];
  const measures = ledgerEntriesFor(ledger, "body_measure");
  const meals = ledgerEntriesFor(ledger, "meal_declaration");
  const invitations = ledgerEntriesFor(ledger, "photo_invitation");

  // ── LES PRÉMISSES, ET ELLES SONT LE MÉCANISME ────────────────────────────
  //
  // Chaque règle est armée par une ligne du LEDGER (ou par le verdict d'âge),
  // jamais par le texte seul. Sans plancher qui a décidé quelque chose, il n'y
  // a rien à faire respecter : la ceinture rend le texte tel quel. C'est ce qui
  // garantit qu'un tour nominal la traverse — et c'est testé comme tel.
  const measureUnwritten = measures.some((entry) =>
    entry.outcome === "refused" || entry.outcome === "failed"
  );
  const measureStoredSi = measures
    .filter((entry) => entry.outcome === "written")
    .map((entry) => entry.stored_value_si)
    .filter((value): value is number => typeof value === "number");
  const mealSilenced = meals.some((entry) =>
    entry.outcome === "written_silently"
  );
  const mealUnwritten = meals.some((entry) =>
    entry.outcome === "refused" || entry.outcome === "failed"
  );
  // T-6 — LE BUDGET EST LE SEUL ARMEUR D'UNE SOLLICITATION PHOTO.
  //
  // `armPhotoInvitation` a lu le compteur partagé (`daily_ask_budget.ts`,
  // `DAILY_ASK_BUDGET = 1`) et a décidé. Si elle n'a pas armé, aucune phrase de
  // ce tour n'a le droit de demander une photo — c'est exactement le
  // contournement « par le haut » que T-6 mesure à ~1/25.
  const invitationArmed = invitations.some((entry) =>
    entry.outcome === "written"
  );
  // DÉSARMEMENT : l'élève a parlé de photo lui-même. Sa question mérite une
  // réponse, et une réponse qui explique comment envoyer une photo n'est pas
  // une sollicitation — c'est la distinction que R6 de FF-025 pose entre
  // l'utilité et le contrôle.
  const studentRaisedPhoto = PHOTO_WORD.test(fold(input.userMessage));
  const photoRuleArmed = !invitationArmed && !studentRaisedPhoto;

  if (
    !measureUnwritten && measureStoredSi.length === 0 && !mealSilenced &&
    !mealUnwritten && !photoRuleArmed && input.isMinor !== true
  ) {
    return untouched;
  }

  const sentences = splitBeltSentences(source);
  const reasons = new Set<TurnLedgerBiteReason>();
  const dropped = new Set<number>();

  sentences.forEach((sentence, index) => {
    if (!sentence.trim()) return;
    // Le lexique d'accusé du dépôt, appelé PHRASE PAR PHRASE. Voir
    // `splitBeltSentences`: on ne peut pas emprunter ses index sans emprunter
    // son découpage, et son découpage casse les décimales.
    const isAck = containsAcknowledgementClaim(sentence);
    const drop = (reason: TurnLedgerBiteReason) => {
      dropped.add(index);
      reasons.add(reason);
    };

    // R1 — PAS D'ACCUSÉ D'UN FAIT NON ÉCRIT (T-1).
    //
    // La règle ne demande PAS d'accusé au sens du lexique : « 78 kg is now your
    // current weight » n'en est pas un, et c'est pourtant la phrase mesurée
    // 3/3 chez un mineur. La prémisse est déjà étroite — le plancher a vu une
    // mesure annoncée CE TOUR-CI et l'a refusée — donc toute phrase qui la
    // reprend comme un fait établi tombe. FF-008 §7 : « la mesure n'est pas
    // enregistrée ET n'est pas mentionnée ».
    if (measureUnwritten && mentionsBodyMeasure(sentence)) {
      drop("ack_of_unwritten_fact");
      return;
    }

    // R2 — PAS DE CHIFFRE FAUX SUR UN FAIT ÉCRIT (T-1).
    //
    // Le composeur répète la valeur que l'ÉLÈVE a dite ; la base porte celle
    // qui a été relue. « Got it — 78 kg, not 87 kg » avec 87 en base est le cas
    // mesuré : vrai du point de vue du composeur, faux du point de vue de la
    // personne.
    //
    // Gardée par `statesADelta` À DESSEIN, et pas par le lexique d'accusé (voir
    // l'en-tête de `DELTA_WORD` : la phrase de T-1 ne déclenche pas ce lexique,
    // la garde y était donc désarmée sur son propre cas). Un écart n'est pas
    // une mesure, et « tu as pris 3 kg » doit traverser.
    if (measureStoredSi.length > 0 && !statesADelta(sentence)) {
      const quoted = massQuantitiesSi(sentence);
      const contradicts = quoted.some((value) =>
        measureStoredSi.every((stored) => Math.abs(stored - value) > 0.05)
      );
      if (contradicts) {
        drop("number_contradicts_stored_fact");
        return;
      }
    }

    // R3 — LE SILENCE DU PLANCHER (T-7).
    //
    // `floor_silenced_write.ts` a écrit le fait ET muselé son runtime. Ce qui
    // restait ouvert, c'est la prose du skill clinique, que rien ne contraint :
    // `guardKeelAckWithoutCommittedEffect` est DÉSARMÉE sur ces deux routes
    // (`disarmed_safety_turn`, `disarmed_restriction_floor_turn`) — pour une
    // bonne raison, son dégradé pose une question de liage de plan, soit de la
    // pression d'adhérence. Cette règle-ci ne pose rien : elle retire.
    if ((mealSilenced || mealUnwritten) && isAck) {
      drop(mealSilenced ? "ack_under_floor_silence" : "ack_of_unwritten_fact");
      return;
    }

    // R4 — PAS DE DEMANDE DE PHOTO HORS BUDGET (T-6).
    if (photoRuleArmed && solicitsAPhoto(sentence)) {
      drop("unbudgeted_photo_request");
      return;
    }

    // R5 — AUCUN CHIFFRE DE NUTRIMENT CHEZ UN MINEUR (T-16).
    //
    // Elle est la seule des cinq à ne pas être armée par le ledger : sa
    // prémisse est le VERDICT D'ÂGE, qui est une propriété de la personne et
    // pas une décision du tour. Elle est aussi la seule à mordre sur un chiffre
    // INVENTÉ — le `minor_quantity` du message du soir n'interdit que le
    // `target`, et c'est le RED résiduel de T-16.
    if (input.isMinor === true && statesANutrientFigure(sentence)) {
      drop("minor_nutrient_figure");
    }
  });

  if (dropped.size === 0) return untouched;

  const kept = sentences
    .filter((_sentence, index) => !dropped.has(index))
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return {
    text: kept || beltFallback(input.locale),
    reasons: [...reasons],
    stripped_sentences: dropped.size,
  };
}

/** Le nom sous lequel les morsures se journalisent. */
export const TURN_LEDGER_BELT_NAME = "keel_turn_ledger_belt";
