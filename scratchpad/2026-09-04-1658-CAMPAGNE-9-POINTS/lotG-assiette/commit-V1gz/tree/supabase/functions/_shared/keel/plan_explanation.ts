/**
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUE LE PLAN A DÛ PESER — la seule prose du modèle sur ses arbitrages.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── CE LOT RENVERSE TROIS REFUS ÉCRITS, ET LE MOTIF EST UNE DEMANDE ───────
 * `plan_rationale.ts`, `plan_tradeoffs.ts` et `request_report.ts` refusent tous
 * les trois, en toutes lettres, qu'un modèle explique une décision. Chacun a
 * raison sur SON objet: le calendrier, les compromis du moteur, et le sort des
 * envies sont des faits que le CODE connaît — une phrase inventée sur eux serait
 * fausse un jour, et « une explication fausse est PIRE que pas d'explication ».
 *
 * Ce module ne touche à aucun des trois. Il ouvre une quatrième surface, sur ce
 * qu'AUCUN d'eux ne peut dire: les arbitrages que le MODÈLE a faits en
 * composant. Une envie de pizza sous un objectif de perte, un plat demandé qui
 * porte un aliment qu'une bouche évite, un plat partagé aligné sur la ligne la
 * plus stricte — ces choix-là sont les siens, et lui seul sait lequel il a pris.
 *
 * ⛔ LE PLANCHER RESTE DÉTERMINISTE. Les phrases de `plan_rationale` sortent
 * comme avant, même quand ce bloc est refusé. On AJOUTE une voix, on n'en
 * remplace aucune — et le prompt dit au modèle qui porte quoi, pour qu'il ne
 * redise pas le calendrier sous ses propres mots.
 *
 * ── POURQUOI UNE GARDE, ET POURQUOI ELLE JETTE TOUT ───────────────────────
 * Le modèle écrit ici du texte lu par la personne, à côté de sa semaine. Cinq
 * choses n'ont rien à y faire, et chacune a déjà été payée ailleurs dans ce
 * dépôt: un chiffre d'énergie, une phrase qui culpabilise, une règle de maison
 * commentée (`household_restriction_lock`: le prompt l'interdisait DÉJÀ et le
 * modèle a écrit « SANS NUTELLA »), un prénom collé à un nombre, un fait de
 * corps collé à un prénom.
 *
 * ⛔ ET LA GARDE JETTE LE BLOC ENTIER, jamais la ligne fautive. Retirer une
 * ligne au milieu d'un raisonnement rend un texte amputé qui se lit comme un
 * bug — et surtout, ce qui reste a été écrit EN SUPPOSANT ce qu'on vient de
 * retirer. Le refus est NOMMÉ et compté; un bloc absent est une absence,
 * lisible comme telle.
 *
 * ⚠️ `[]` N'EST PAS UN REFUS, ET C'EST L'ÉCHAPPATOIRE NOMMÉE. « Je n'ai eu
 * aucun arbitrage à faire » est une réponse vraie et fréquente. Sans elle, le
 * modèle inventerait une tension pour remplir la clé — la cicatrice
 * `promise-and-schema-key-must-be-adjacent` dit que nommer la sortie est le
 * geste le plus rentable, et c'est celui-ci.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import { findForbiddenMatches, type ForbiddenTerm } from "./forbidden_matcher.ts";
import { findGuiltTripping } from "./reengagement.ts";
import { FORBIDDEN_PORTION_TERMS } from "./household_portions.ts";

/**
 * HUIT LIGNES, ET C'EST UNE DEMANDE, PAS UNE MESURE.
 *
 * Le nombre vient du propriétaire (« 8 lignes max »). Il vit ici pour que le
 * prompt et la garde lisent LE MÊME, et un test compare les deux: une consigne
 * qui promet huit et une garde qui en accepte neuf laisseraient passer une
 * ligne que personne n'a demandée.
 */
export const EXPLANATION_MAX_LINES = 8;

/**
 * ⟳ 2026-09-06 — LA LANE SOLO AUSSI. Campagne du 05/09 : `explanation` n'existait
 * que sur le foyer ; une personne seule n'avait jamais une ligne du modèle sur ce
 * qu'il avait dû trancher (la demande répétée de l'utilisateur). Même contrat que
 * le bloc du foyer (`EXPLANATION_SCHEMA_BLOCK`, household_meal_generation.ts) :
 * huit lignes au plus, un arbitrage par ligne, jamais un chiffre ni le calendrier.
 */
export const EXPLANATION_SCHEMA_BLOCK_SOLO = [
  "== ONE MORE OUTPUT FIELD: WHAT YOU HAD TO WEIGH UP ==",
  "Add ONE more top-level key to the JSON you return:",
  '  "explanation": [ "<one short line>", ... ]',
  "At most 8 lines, one sentence each, in the CONTENT LANGUAGE named at the",
  "end of the user message.",
  "Write a line ONLY where you had to CHOOSE between two things this person",
  "asked for, or between a wish and the direction this plan follows: a craving",
  "that pulls against that direction, a dish they asked for that carries food",
  "they avoid, a habit that does not fit the cooking time they gave. Say what",
  "you did, and in a few words why it is a reasonable choice for this week --",
  "half information, half education.",
  'If you had nothing to weigh up, return "explanation": [].',
  "Never invent a tension to fill the list.",
  "NEVER in these lines: a calorie, gram or kilo figure; their weight, body,",
  "goal, diet, allergy or medical line; a coach rule (not yours to explain).",
  "The calendar -- which days, which cooking session, which shop -- is",
  "explained by the app in fixed sentences under your text. Do not restate it.",
] as const;

/**
 * ⚠️ UNE BORNE PAR LIGNE, PARCE QUE LE PLAFOND DE LIGNES NE BORNE RIEN.
 * Huit paragraphes tiennent en huit lignes. 220 caractères est une phrase
 * longue et lisible; au-delà, ce n'est plus « une ligne ».
 */
export const EXPLANATION_MAX_CHARS = 220;

/** Pourquoi le bloc a été jeté. Liste FERMÉE, et chaque valeur est comptée. */
export const EXPLANATION_REFUSALS = [
  "unreadable",
  "too_many_lines",
  "line_too_long",
  "energy_number",
  "guilt_tripping",
  "house_rule_mentioned",
  "number_targets_person",
  "discloses_person",
] as const;
export type ExplanationRefusal = (typeof EXPLANATION_REFUSALS)[number];

export interface PlanExplanationVerdict {
  /** Ce qui sort à l'écran. VIDE dès qu'un refus a mordu — jamais partiel. */
  lines: string[];
  /**
   * COMBIEN LE MODÈLE EN A ÉCRIT, avant toute garde. Sans ce nombre, « le
   * modèle n'a rien écrit » et « on a tout jeté » rendent le même écran, et
   * seule la première appelle un travail de prompt.
   */
  declared: number;
  /** Le motif, ou `null`. `null` avec `lines: []` = il n'avait rien à arbitrer. */
  refused: ExplanationRefusal | null;
}

/**
 * UN CHIFFRE D'ÉNERGIE OU DE MASSE, DANS LES DEUX LANGUES.
 *
 * ⛔ FAIL-CLOSED, ET SANS CONDITION. La porte d'énergie (`energy_gate.ts`)
 * n'a AUCUN appelant dans le générateur de foyer — ni `canShowEnergy`, ni
 * `energySafetyGates`. Faire dépendre cette garde d'une porte qu'il faudrait
 * d'abord câbler la rendrait désarmée le jour de sa livraison. Un chiffre
 * d'énergie ne sort donc JAMAIS de cette surface, pour personne.
 *
 * ⚠️ « 2 sessions » et « 3 jours » PASSENT: ce ne sont pas des unités de
 * nutrition. La garde vise l'unité, jamais le chiffre nu — sinon elle
 * refuserait la phrase la plus utile du bloc (« deux sessions plutôt que
 * trois »).
 */
const ENERGY_NUMBER =
  /\d[\d\s.,]*\s*(k?cal(?:orie|ories)?|calories?|grammes?|kilos?|kg|g)\b/i;

function houseRuleTerms(labels: readonly string[]): ForbiddenTerm[] {
  return labels
    .map((l) => String(l ?? "").trim())
    .filter(Boolean)
    .map((label) => ({
      ruleId: `house.${label.toLowerCase().replace(/\s+/g, "_")}`,
      token: label,
    }));
}

/**
 * UN PRÉNOM COLLÉ À UN NOMBRE, OU À UN FAIT DE CORPS.
 *
 * La règle est celle de `plan_tradeoffs.ts`, rendue vérifiable: ce n'est pas
 * « pas de prénom » (le bloc DOIT pouvoir dire « les raviolis de Léa »), c'est
 * « jamais un prénom à côté d'un chiffre ou d'un mot qui parle de son corps ».
 * 40 caractères de voisinage: au-delà, deux phrases voisines ne se visent plus.
 */
const ADJACENCY = 40;

function targetsAPerson(
  text: string,
  names: readonly string[],
): "number_targets_person" | "discloses_person" | null {
  const bodyTerms = FORBIDDEN_PORTION_TERMS;
  for (const raw of names) {
    const name = String(raw ?? "").trim();
    if (name.length < 2) continue;
    const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const near = `[^.\\n]{0,${ADJACENCY}}`;
    if (
      new RegExp(`${n}${near}\\d|\\d${near}${n}`, "i").test(text)
    ) {
      return "number_targets_person";
    }
    // ⚠️ ON NE CHERCHE LE CORPS QUE PRÈS D'UN PRÉNOM. Le mot « poids » seul
    // dans « le poids des courses » n'est pas un fait sur quelqu'un; collé à
    // « Marc », il l'est. Chercher le terme partout refuserait des phrases
    // vraies et apprendrait à ignorer le refus.
    const window = new RegExp(`${n}${near}|${near}${n}`, "gi");
    const around = (text.match(window) ?? []).join("\n");
    if (around && findForbiddenMatches(around, bodyTerms, {
      allowNegatedMentions: false,
    }).length > 0) {
      return "discloses_person";
    }
  }
  return null;
}

/**
 * LA GARDE, DANS SON ORDRE — et l'ordre EST l'algorithme.
 *
 * La première porte qui mord nomme le refus et le bloc tombe. L'ordre va du
 * plus structurel (on ne sait pas lire) au plus fin (une adjacence), pour que
 * le motif rendu décrive la cause la plus GROSSE — un texte illisible qui
 * porterait aussi un kcal doit se lire « illisible », pas « chiffre ».
 */
export function gatePlanExplanation(input: {
  raw: unknown;
  /** Les prénoms du foyer, pour la garde d'adjacence. `[]` en solo. */
  names: readonly string[];
  /** Les libellés de `household_food_restrictions`. `[]` s'il n'y en a pas. */
  houseRuleLabels: readonly string[];
}): PlanExplanationVerdict {
  if (!Array.isArray(input.names) || !Array.isArray(input.houseRuleLabels)) {
    throw new Error(
      "[keel/plan_explanation] `names` et `houseRuleLabels` sont REQUIS — " +
        "`[]` dit « aucun », `undefined` ne dit rien",
    );
  }
  // ── ① LA FORME ────────────────────────────────────────────────────────
  if (input.raw === null || input.raw === undefined) {
    // Le modèle n'a pas écrit la clé. Ce n'est PAS un refus: c'est un taux
    // d'obéissance, et il se lit sur `declared: 0` avec `refused: null`.
    return { lines: [], declared: 0, refused: null };
  }
  if (!Array.isArray(input.raw)) {
    return { lines: [], declared: 0, refused: "unreadable" };
  }
  const declared = input.raw.length;
  if (input.raw.some((l) => typeof l !== "string")) {
    return { lines: [], declared, refused: "unreadable" };
  }
  const lines = (input.raw as string[])
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    // ⚠️ L'ÉCHAPPATOIRE NOMMÉE: « rien à arbitrer » est une réponse vraie.
    return { lines: [], declared, refused: null };
  }
  if (lines.length > EXPLANATION_MAX_LINES) {
    return { lines: [], declared, refused: "too_many_lines" };
  }
  if (lines.some((l) => l.length > EXPLANATION_MAX_CHARS)) {
    return { lines: [], declared, refused: "line_too_long" };
  }

  const text = lines.join("\n");

  // ── ② AUCUN CHIFFRE DE NUTRITION ──────────────────────────────────────
  if (ENERGY_NUMBER.test(text)) {
    return { lines: [], declared, refused: "energy_number" };
  }

  // ── ③ AUCUNE CULPABILISATION ──────────────────────────────────────────
  // La MÊME porte que `request_report_gate` et `plan_rationale`: une seconde
  // implémentation divergerait, et c'est la garde qu'on veut la plus stable.
  if (findGuiltTripping(text).length > 0) {
    return { lines: [], declared, refused: "guilt_tripping" };
  }

  // ── ④ AUCUNE RÈGLE DE MAISON COMMENTÉE ────────────────────────────────
  // ⛔ `allowNegatedMentions: false`, CONTRE le réglage de la substance. Là-bas
  // « sans nutella » ne SERT rien, donc ne viole rien. Ici c'est l'inverse: la
  // phrase mesurée qui a motivé le verrou était précisément une NÉGATION
  // (« honore la demande de pâtes de Lea … SANS NUTELLA »). Nommer l'interdit
  // pour dire qu'on l'a respecté, c'est encore le nommer.
  const houseTerms = houseRuleTerms(input.houseRuleLabels);
  if (
    houseTerms.length > 0 &&
    findForbiddenMatches(text, houseTerms, { allowNegatedMentions: false })
        .length > 0
  ) {
    return { lines: [], declared, refused: "house_rule_mentioned" };
  }

  // ── ⑤ AUCUN PRÉNOM COLLÉ À UN NOMBRE NI À UN CORPS ────────────────────
  const targeted = targetsAPerson(text, input.names);
  if (targeted !== null) {
    return { lines: [], declared, refused: targeted };
  }

  return { lines, declared, refused: null };
}

/**
 * Extraire `explanation` d'une réponse de modèle déjà décodée.
 *
 * ⛔ MÊME PATRON QUE `extractMemberPortions`, ET SUR LE MÊME TEXTE BRUT.
 * `parseGeneratedMeal` décode déjà ce corps; re-décoder ailleurs produirait
 * deux tolérances aux blocs de code et aux virgules finales, donc un jour deux
 * verdicts sur la même réponse.
 *
 * ⚠️ REND `null` PLUTÔT QUE DE LEVER: une semaine composée ne se perd pas pour
 * un champ annexe.
 */
export function extractExplanation(rawJsonText: string): unknown {
  const text = String(rawJsonText ?? "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    return parsed?.explanation ?? null;
  } catch {
    return null;
  }
}
