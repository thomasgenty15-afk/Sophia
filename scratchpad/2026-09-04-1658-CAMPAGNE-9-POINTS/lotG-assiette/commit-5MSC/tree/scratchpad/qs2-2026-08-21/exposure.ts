// Q-S2 — LA MESURE DE REPLI, LECTURE SEULE.
//
// Le rejeu nominal rend 0 nouveau mordu, mais UNIQUEMENT parce que les 6
// contraintes `strict` porteuses de jeton appartiennent à 5 comptes qui ont
// entre 1 et 7 tours archivés. Le chiffre mesure donc autant la maigreur du
// banc que l'innocuité de l'élargissement.
//
// Cette passe-ci mesure l'EXPOSITION DU VOCABULAIRE : sur les 5 701 tours
// assistant archivés, combien nommeraient chaque jeton — si le porteur de la
// contrainte était celui qui parle. C'est le majorant, et il nomme l'écart.
//
// Même moteur de production, mêmes formes de surface, même politique de
// négation. Aucune écriture.

import {
  findForbiddenMatches,
  type ForbiddenTerm,
} from "../../supabase/functions/_shared/keel/forbidden_matcher.ts";
import { surfaceFormsFor } from "../../supabase/functions/_shared/keel/allergen_surface_forms.ts";

type MessageRow = { id: string; user_id: string; role: string; content: string };
const here = new URL(".", import.meta.url);
const messages: MessageRow[] = JSON.parse(
  Deno.readTextFileSync(new URL("messages.json", here)),
);
const turns = messages.filter((m) => m.role === "assistant");

const STRICT_TOKENS = [
  "dairy",
  "fructose",
  "fruits_de_mer",
  "gluten",
  "lactose",
  "mustard",
];
const MEDICAL_TOKENS = [
  "celeriac",
  "peanut",
  "sesame",
  "shellfish",
  "tree_nut",
  "levothyroxine",
  "warfarin",
];

function exposure(token: string) {
  const term: ForbiddenTerm = {
    ruleId: "counterfactual",
    token,
    surfaceForms: surfaceFormsFor(token),
  };
  let hits = 0;
  let hitsAbsolute = 0; // sans les exceptions de négation (mode audit)
  for (const t of turns) {
    const text = String(t.content ?? "");
    if (findForbiddenMatches(text, [term], {}).length > 0) hits++;
    if (
      findForbiddenMatches(text, [term], { allowNegatedMentions: false })
        .length > 0
    ) hitsAbsolute++;
  }
  return {
    token,
    formes_de_surface: surfaceFormsFor(token).length,
    tours_mordus: hits,
    pct: (100 * hits / turns.length).toFixed(2),
    tours_mordus_sans_exception_de_negation: hitsAbsolute,
  };
}

// Le majorant collectif : un seul élève qui porterait LES SIX.
function unionExposure(tokens: string[]) {
  const terms = tokens.map((token) => ({
    ruleId: `cf:${token}`,
    token,
    surfaceForms: surfaceFormsFor(token),
  }));
  let hits = 0;
  for (const t of turns) {
    if (findForbiddenMatches(String(t.content ?? ""), terms, {}).length > 0) {
      hits++;
    }
  }
  return { tours_mordus: hits, pct: (100 * hits / turns.length).toFixed(2) };
}

console.log(JSON.stringify({
  tours_assistant: turns.length,
  strict: STRICT_TOKENS.map(exposure),
  strict_union_un_seul_porteur: unionExposure(STRICT_TOKENS),
  medical_pour_comparaison: MEDICAL_TOKENS.map(exposure),
  medical_union: unionExposure(MEDICAL_TOKENS),
}, null, 2));
