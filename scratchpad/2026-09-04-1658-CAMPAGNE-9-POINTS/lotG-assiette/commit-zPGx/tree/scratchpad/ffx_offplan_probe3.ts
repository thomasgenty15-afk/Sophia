/**
 * RED NEUF, énoncé PROPREMENT.
 *
 * Correction de ma propre sonde (T-15, 3e fois): mes premiers cas utilisaient
 * « pizza » et « burger », que le lexique fermé ne reconnaît PAS comme
 * composant — ils ne déclaraient donc RIEN, et j'aurais imputé au marqueur
 * hors-plan un défaut qui est celui, déjà consigné, de la décomposition des
 * plats composés (T-3). On refait avec des composants RECONNUS.
 *
 * La question isolée: quand un repas EST déclaré, l'énoncé par lequel l'élève
 * dit lui-même que ce repas sortait du plan produit-il `off_plan` ?
 */
import { detectDeclaredMeal } from "../supabase/functions/_shared/keel/meal_declaration_floor.ts";

const LITERAL = [
  ["I had chicken and rice for dinner, it wasn't on the plan at all.", "en-GB"],
  ["I ate eggs and toast this morning. That wasn't on the plan.", "en-GB"],
  ["I had chocolate at four, off plan I know.", "en-GB"],
  ["I had chicken at lunch, nothing to do with the plan.", "en-GB"],
  ["J'ai mangé du poulet et du riz hier soir, ce n'était pas prévu.", "fr-FR"],
  ["J'ai mangé des oeufs ce matin, c'était hors plan.", "fr-FR"],
  ["J'ai grignoté du chocolat, rien à voir avec le plan.", "fr-FR"],
  ["J'ai mangé du poulet à midi, pas du tout ce qui était prévu.", "fr-FR"],
] as const;
const WITNESS = [
  ["I had takeaway chicken and rice for dinner.", "en-GB"],
  ["J'ai mangé du poulet au restaurant à midi.", "fr-FR"],
] as const;

let declared = 0, offPlan = 0;
console.log("— ÉNONCÉS LITTÉRAUX —");
for (const [text, locale] of LITERAL) {
  const h = detectDeclaredMeal(text, locale);
  if (h) declared++;
  if (h?.planRelation === "off_plan") offPlan++;
  console.log(
    `${h?.planRelation === "off_plan" ? "  " : "🔴"} declare=${h ? "oui" : "NON"} ` +
      `gate=${String(h?.gate ?? "-").padEnd(20)} rel=${String(h?.planRelation ?? "null").padEnd(9)} ` +
      `« ${text} »`,
  );
}
console.log("— TÉMOINS (circonstance) —");
for (const [text, locale] of WITNESS) {
  const h = detectDeclaredMeal(text, locale);
  console.log(
    `${h?.planRelation === "off_plan" ? "  " : "🔴"} declare=${h ? "oui" : "NON"} ` +
      `gate=${String(h?.gate ?? "-").padEnd(20)} rel=${String(h?.planRelation ?? "null").padEnd(9)} ` +
      `marqueur=${h?.offPlanMatched ?? "-"} « ${text} »`,
  );
}
console.log(
  `\nsur ${LITERAL.length} énoncés littéraux: ${declared} déclarés, ${offPlan} en off_plan`,
);
