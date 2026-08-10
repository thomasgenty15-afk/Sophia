import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { buildMealPrompt } from "./meal_generation.ts";

// ===========================================================================
// LA SAISON — une préférence, et qui doit le RESTER
//
// LE DÉFAUT QUE ÇA FERMAIT. Le prompt ne portait aucune date, seulement un jour
// de semaine. « mercredi » ne dit pas si on est en février ou en août, donc
// rien ne permettait au modèle de savoir ce qui pousse: on obtenait des plats
// d'hiver en plein été, et des produits qui n'existent pas au marché ce mois-là.
//
// LE RISQUE QUE ÇA OUVRE, et qu'on teste ici. Ce prompt porte de VRAIES
// interdictions — allergènes, doctrine du coach — et une consigne de saison lue
// avec le même poids ferait REFUSER des plats. « Pas de tomates, ce n'est pas
// la saison » est exactement ce qu'on ne veut pas: on ne regarde pas dans leurs
// magasins, et le coach n'a jamais interdit une tomate.
//
// Ces tests portent donc autant sur ce que le bloc DIT que sur ce qu'il
// s'interdit de faire dire.
// ===========================================================================

function promptWith(args: { today?: string | null; country?: string | null }): string {
  return buildMealPrompt({
    safetyConstraints: null,
    body: null,
    focusAxis: null,
    doctrineBlock: "== METHOD ==",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    protocolBlock: "",
    beliefKeys: [],
    goal: "health",
    situation: null,
    context: null,
    mode: "to_shop",
    scope: "day",
    slot: null,
    servings: 1,
    pantry: [],
    todayToken: "wed",
    today: args.today ?? null,
    country: args.country ?? null,
  }).userMessage;
}

Deno.test("la date et le pays arrivent au modèle, en clair", () => {
  const prompt = promptWith({ today: "2026-08-05", country: "FR" });
  assertStringIncludes(prompt, "2026-08-05");
  assertStringIncludes(prompt, "FR");
  // On donne des FAITS, pas notre déduction: nulle part on n'affirme la saison.
  // Août est l'été en France et l'hiver en Argentine, et sous l'équateur la
  // question ne se pose pas dans ces termes — c'est au modèle de trancher, il
  // connaît les calendriers agricoles mieux qu'une table qu'on maintiendrait.
  assertEquals(/it is (currently )?(summer|winter|spring|autumn)/i.test(prompt), false);
});

Deno.test("la saison est une préférence, jamais un veto", () => {
  const prompt = promptWith({ today: "2026-08-05", country: "FR" });
  // Dit comme une préférence...
  assertStringIncludes(prompt, "PREFERENCE and never a rule");
  // ... et les trois dérives nommées une par une. Une consigne qualitative dans
  // ce dépôt est une consigne que le modèle applique quand ça l'arrange; celles
  // qui comptent sont donc écrites en toutes lettres.
  assertStringIncludes(prompt, "never refuse an ingredient the student asked for");
  assertStringIncludes(prompt, "never tell them a food is unavailable");
  assertStringIncludes(prompt, "Never drop a dish the method calls for");
});

Deno.test("la lourdeur du plat suit la saison — la blanquette d'août", () => {
  // La demande d'origine, mot pour mot: « pas de blanquette en été ». Ce n'est
  // pas une question d'ingrédient mais de POIDS du plat, et le prompt doit le
  // dire: un ragoût mijoté trois heures un 5 août n'est pas un plat qu'on
  // cuisine, quelles que soient les carottes qu'il contient.
  const prompt = promptWith({ today: "2026-08-05", country: "FR" });
  assertStringIncludes(prompt, "WEIGHT of a dish");
});

Deno.test("sans pays ni date, le prompt le DIT au lieu de faire semblant", () => {
  const prompt = promptWith({ today: null, country: null });
  // `profiles.country` est nullable et l'est en pratique — un élève sur deux
  // n'a jamais rempli le sien. Inventer « FR » par défaut composerait une
  // semaine bretonne pour quelqu'un à Dakar.
  assertStringIncludes(prompt, "today's date: not known.");
  assertStringIncludes(prompt, "where they shop: not known");
  // Le bloc existe quand même: « privilégie ce qui est de saison » reste une
  // consigne vraie et utile sans savoir où on est.
  assertStringIncludes(prompt, "WHAT IS IN SEASON WHERE THEY ARE");
});

Deno.test("le pays seul, sans date, ne fabrique pas de saison", () => {
  const prompt = promptWith({ today: null, country: "AR" });
  assertStringIncludes(prompt, "AR");
  assertStringIncludes(prompt, "today's date: not known.");
  // Un hémisphère sud sans date ne dit rien: on ne comble pas le trou.
  assert(!/2026-/.test(prompt));
});
