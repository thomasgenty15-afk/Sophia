import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  EXPLANATION_MAX_CHARS,
  EXPLANATION_MAX_LINES,
  extractExplanation,
  gatePlanExplanation,
} from "./plan_explanation.ts";
import { HOUSEHOLD_PROMPT_VERSION } from "./household_meal_generation.ts";

// ===========================================================================
// LA GARDE DE L'EXPLICATION — un cas qui PASSE et un cas qui REFUSE par porte
//
// ⛔ « UNE GARDE A BESOIN D'UN CAS QUI PASSE. » Une garde cassée bloque tout et
// ressemble trait pour trait à une garde qui marche: chaque porte a donc ici sa
// paire, et le cas nominal est le premier test du fichier.
// ===========================================================================

const OK = ["Tu voulais des pizzas, il y en a vendredi soir."];
const NAMES = ["Marc", "Lea", "Zoe"];

const gate = (raw: unknown, over: {
  names?: readonly string[];
  houseRuleLabels?: readonly string[];
} = {}) =>
  gatePlanExplanation({
    raw,
    names: over.names ?? NAMES,
    houseRuleLabels: over.houseRuleLabels ?? [],
  });

Deno.test("LE CAS QUI PASSE — huit lignes ordinaires traversent", () => {
  const lines = Array.from({ length: 8 }, (_, i) => `Ligne ${"a".repeat(i + 1)}.`);
  const out = gate(lines);
  assertEquals(out.refused, null);
  assertEquals(out.lines.length, 8);
  assertEquals(out.declared, 8);
});

Deno.test("⚠️ `[]` N'EST PAS UN REFUS — c'est l'échappatoire nommée", () => {
  // « Je n'ai eu aucun arbitrage à faire » est une réponse vraie et fréquente.
  // Sans elle, le modèle inventerait une tension pour remplir la clé.
  const out = gate([]);
  assertEquals(out, { lines: [], declared: 0, refused: null });
});

Deno.test("la clé ABSENTE n'est pas un refus non plus — c'est un taux", () => {
  // Le modèle n'a pas écrit la clé. `declared: 0` avec `refused: null` sépare
  // « il n'écrit rien » (travail de prompt) de « on a tout jeté » (travail de
  // garde). Les deux rendent le même écran, et seul le premier appelle un lot.
  assertEquals(gate(null), { lines: [], declared: 0, refused: null });
  assertEquals(gate(undefined), { lines: [], declared: 0, refused: null });
});

Deno.test("① la FORME — ce qui n'est pas une liste de chaînes est illisible", () => {
  assertEquals(gate("une phrase").refused, "unreadable");
  assertEquals(gate({ lines: OK }).refused, "unreadable");
  assertEquals(gate([1, 2]).refused, "unreadable");
  // ⚠️ ET `declared` SURVIT AU REFUS: on veut savoir combien il en avait écrit.
  assertEquals(gate([1, 2]).declared, 2);
});

Deno.test("① la FORME — neuf lignes, et le vide ne compte pas", () => {
  const neuf = Array.from({ length: 9 }, (_, i) => `L${i}.`);
  assertEquals(gate(neuf).refused, "too_many_lines");
  // Huit lignes plus deux vides PASSENT: le vide est retiré avant le compte,
  // parce qu'un modèle qui met une ligne blanche n'a pas écrit une neuvième.
  assertEquals(gate([...neuf.slice(0, 8), "", "   "]).refused, null);
  assertEquals(EXPLANATION_MAX_LINES, 8);
});

Deno.test("① la FORME — une ligne trop longue n'est plus une ligne", () => {
  assertEquals(gate(["x".repeat(EXPLANATION_MAX_CHARS + 1)]).refused, "line_too_long");
  assertEquals(gate(["x".repeat(EXPLANATION_MAX_CHARS)]).refused, null);
});

Deno.test("② AUCUN CHIFFRE DE NUTRITION — et la contre-épreuve compte autant", () => {
  for (
    const bad of [
      "Il te faut 1 800 kcal ce jour-là.",
      "On vise 2000 calories.",
      "Compte 140 g de poulet.",
      "Tu perds 0,5 kg par semaine.",
      "150g de riz.",
    ]
  ) {
    assertEquals(gate([bad]).refused, "energy_number", bad);
  }
  // ⛔ LA CONTRE-ÉPREUVE. Un chiffre NU n'est pas un chiffre de nutrition, et
  // refuser « deux sessions plutôt que trois » retirerait la phrase la plus
  // utile du bloc.
  for (
    const good of [
      "Le plan pose 2 sessions plutôt que 3.",
      "Sur 7 jours, les lentilles reviennent 2 fois.",
      "La pizza tombe vendredi, et le reste de la semaine reste léger.",
    ]
  ) {
    assertEquals(gate([good]).refused, null, good);
  }
});

Deno.test("③ AUCUNE CULPABILISATION — la MÊME porte que la rationale", () => {
  // On ne recopie pas les motifs: on éprouve que la porte est BRANCHÉE, avec
  // deux phrases que `findGuiltTripping` attrape — une par langue, parce que
  // ce dépôt a déjà payé « garde testée dans une seule langue ».
  assertEquals(gate(["Tu as raté trois dîners cette semaine."]).refused, "guilt_tripping");
  assertEquals(gate(["You missed lunch twice, no excuses."]).refused, "guilt_tripping");
  // ⛔ LA CONTRE-ÉPREUVE: la phrase ordinaire du bloc ne doit PAS être prise
  // pour de la culpabilisation, sinon la garde éteint la fonctionnalité.
  assertEquals(gate(OK).refused, null);
  assertEquals(
    gate(["La pizza tombe vendredi, et le reste de la semaine reste léger."]).refused,
    null,
  );
});

Deno.test("④ UNE RÈGLE DE MAISON NE SE COMMENTE PAS, MÊME NIÉE", () => {
  // ⛔ LA PHRASE MESURÉE QUI A MOTIVÉ LE VERROU ÉTAIT UNE NÉGATION: « honore la
  // demande de pâtes de Lea … SANS NUTELLA ». Nommer l'interdit pour dire qu'on
  // l'a respecté, c'est encore le nommer.
  const opts = { houseRuleLabels: ["nutella"] };
  assertEquals(gate(["Les pâtes de Lea, sans nutella."], opts).refused, "house_rule_mentioned");
  assertEquals(gate(["J'ai mis du nutella."], opts).refused, "house_rule_mentioned");
  // Le cas qui passe: la même phrase sans la règle déclarée, et la même règle
  // déclarée sans la phrase.
  assertEquals(gate(["Les pâtes de Lea, avec une sauce tomate."], opts).refused, null);
  assertEquals(gate(["Les pâtes de Lea, sans nutella."]).refused, null);
});

Deno.test("⑤ UN PRÉNOM NE SE COLLE NI À UN NOMBRE NI À UN CORPS", () => {
  assertEquals(gate(["Marc reçoit 3 parts."]).refused, "number_targets_person");
  assertEquals(gate(["Pour 2 repas, Zoe a sa propre boîte."]).refused, "number_targets_person");
  assertEquals(gate(["Marc veut maigrir, donc sa part est plus petite."]).refused, "discloses_person");
  // ⛔ LE CAS QUI PASSE, ET IL EST LE POINT DU LOT: le bloc DOIT pouvoir nommer
  // quelqu'un à côté de son goût. Ce n'est pas « pas de prénom ».
  assertEquals(gate(["Les raviolis de Lea sont là, sans champignons."]).refused, null);
  assertEquals(gate(["Le plan pose 2 sessions."]).refused, null);
  // Et un mot de corps LOIN de tout prénom ne vise personne.
  assertEquals(gate(["Le poids des courses tient dans un sac."]).refused, null);
});

Deno.test("⛔ L'ORDRE DES PORTES — le motif rendu est la cause la plus GROSSE", () => {
  // Un texte illisible qui porterait aussi un kcal doit se lire « illisible ».
  assertEquals(gate("1 800 kcal").refused, "unreadable");
  // Neuf lignes dont une culpabilisante: c'est la forme qui est nommée.
  const neuf = Array.from({ length: 8 }, (_, i) => `L${i}.`);
  assertEquals(
    gate([...neuf, "You said you would cook, and you didn't."]).refused,
    "too_many_lines",
  );
});

Deno.test("les deux listes sont REQUISES — `[]` dit « aucun », `undefined` ne dit rien", () => {
  assertThrows(() =>
    gatePlanExplanation({
      raw: OK,
      names: undefined as unknown as string[],
      houseRuleLabels: [],
    })
  );
  assertThrows(() =>
    gatePlanExplanation({
      raw: OK,
      names: [],
      houseRuleLabels: undefined as unknown as string[],
    })
  );
});

Deno.test("PURETÉ — l'entrée n'est pas mutée, et deux appels rendent pareil", () => {
  const raw = [" une ligne ", ""];
  const before = JSON.stringify(raw);
  const a = gate(raw);
  const b = gate(raw);
  assertEquals(JSON.stringify(raw), before);
  assertEquals(a, b);
});

Deno.test("`extractExplanation` lit la clé sur le TEXTE BRUT, comme sa jumelle", () => {
  const text = '```json\n{"dishes": [], "explanation": ["a", "b"]}\n```';
  assertEquals(extractExplanation(text), ["a", "b"]);
  assertEquals(extractExplanation("pas du json"), null);
  assertEquals(extractExplanation('{"dishes": []}'), null);
});

Deno.test("⚠️ LE MILLÉSIME DU PROMPT DIT CE LOT", () => {
  // Un bloc ajouté au prompt sans bump ferait une population « v25 » dont une
  // partie a vu une consigne que l'autre n'a jamais reçue — et la comparaison
  // que le millésime existe pour permettre deviendrait fausse sans rien casser.
  assertEquals(HOUSEHOLD_PROMPT_VERSION, "v30_every_meal_follows_the_line");
});
