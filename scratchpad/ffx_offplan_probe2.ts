/**
 * Le SECOND étage du RED: la phrase qui dit « ce n'était pas prévu » ne rate pas
 * seulement le marqueur — elle fait disparaître LA DÉCLARATION ELLE-MÊME.
 * On isole la cause en variant une seule chose à la fois.
 */
import { detectDeclaredMeal } from "../supabase/functions/_shared/keel/meal_declaration_floor.ts";
const CASES = [
  ["I had a pizza for dinner.", "en-GB"],
  ["I had a pizza for dinner, it was good.", "en-GB"],
  ["I had a pizza for dinner, it wasn't great.", "en-GB"],
  ["I had a pizza for dinner, it wasn't on the plan at all.", "en-GB"],
  ["I had a pizza for dinner. It wasn't on the plan at all.", "en-GB"],
  ["It wasn't on the plan at all. I had a pizza for dinner.", "en-GB"],
  ["J'ai mangé une pizza hier soir.", "fr-FR"],
  ["J'ai mangé une pizza hier soir, c'était bon.", "fr-FR"],
  ["J'ai mangé une pizza hier soir, ce n'était pas prévu.", "fr-FR"],
] as const;
for (const [text, locale] of CASES) {
  const h = detectDeclaredMeal(text, locale);
  console.log(
    `${h ? "déclaré  " : "🔴 RIEN  "} gate=${String(h?.gate ?? "-").padEnd(20)} ` +
      `rel=${String(h?.planRelation ?? "-").padEnd(9)} ` +
      `composants=${h?.components?.length ?? 0}  « ${text} »`,
  );
}
