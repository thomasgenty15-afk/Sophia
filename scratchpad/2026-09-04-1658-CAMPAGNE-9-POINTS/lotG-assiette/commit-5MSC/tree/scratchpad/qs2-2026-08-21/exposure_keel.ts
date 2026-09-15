// Q-S2 — exposition restreinte aux tours d'élèves KEEL (la seule population
// où la ceinture est ARMÉE : `isKeelStudent: keel.is_student === true`).
// Lecture seule, aucun I/O réseau.
import {
  findForbiddenMatches,
  type ForbiddenTerm,
} from "../../supabase/functions/_shared/keel/forbidden_matcher.ts";
import { surfaceFormsFor } from "../../supabase/functions/_shared/keel/allergen_surface_forms.ts";

const here = new URL(".", import.meta.url);
const msgs: { user_id: string; role: string; content: string }[] = JSON.parse(
  Deno.readTextFileSync(new URL("messages.json", here)),
);
const students = new Set<string>(
  JSON.parse(Deno.readTextFileSync(new URL("keel_students.json", here))),
);
const turns = msgs.filter((m) => m.role === "assistant" && students.has(m.user_id));

const term = (token: string): ForbiddenTerm => ({
  ruleId: token,
  token,
  surfaceForms: surfaceFormsFor(token),
});
const one = (token: string) => {
  const t = [term(token)];
  let hits = 0;
  const forms: Record<string, number> = {};
  for (const m of turns) {
    const found = findForbiddenMatches(String(m.content ?? ""), t, {});
    if (found.length > 0) {
      hits++;
      for (const f of new Set(found.map((x) => x.token))) {
        forms[f] = (forms[f] ?? 0) + 1;
      }
    }
  }
  return { token, tours: hits, pct: (100 * hits / turns.length).toFixed(2), par_forme: forms };
};
const union = (tokens: string[]) => {
  const t = tokens.map(term);
  let hits = 0;
  for (const m of turns) if (findForbiddenMatches(String(m.content ?? ""), t, {}).length > 0) hits++;
  return { tours: hits, pct: (100 * hits / turns.length).toFixed(2) };
};
const STRICT = ["dairy", "fructose", "fruits_de_mer", "gluten", "lactose", "mustard"];
console.log(JSON.stringify({
  tours_assistant_eleves_keel: turns.length,
  strict: STRICT.map(one),
  strict_union: union(STRICT),
}, null, 2));
