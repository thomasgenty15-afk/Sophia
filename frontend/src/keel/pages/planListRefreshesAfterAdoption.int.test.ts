/**
 * ⟳ 2026-09-16 — « TES REPAS » SE MET À JOUR APRÈS UNE ADOPTION FAITE SUR LA PAGE.
 *
 * Mesuré sur staging : le brouillon adopté, le plan `c5815127` écrit, « Qui
 * mange quoi » à jour (la page relit) — et « Tes repas » sur « Rien de composé »
 * jusqu'à un rechargement, parce que `MealBuilder` ne chargeait ses plans qu'au
 * montage (`[userId]`). La page porte donc un compteur qu'elle incrémente à
 * chaque relecture de ses plans, et le builder relit dessus.
 *
 * Des épingles de SOURCE : monter la page entière (portails, supabase) n'est
 * pas possible dans cet environnement, et le défaut était précisément un
 * câblage absent — c'est ce qu'on fige.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const code = (rel: string) =>
  readFileSync(resolve(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("l'adoption sur /app/plan rafraîchit aussi « Tes repas »", () => {
  const page = code("frontend/src/keel/pages/StudentWeekPlanPage.tsx");
  const builder = code("frontend/src/keel/components/MealBuilder.tsx");

  it("la page tient un compteur et le monte à CHAQUE relecture de ses plans", () => {
    expect(page).toContain("const [plansVersion, setPlansVersion] = React.useState(0);");
    const refresh = page.slice(page.indexOf("const refreshLivePlans = React.useCallback("));
    const bump = refresh.indexOf("setPlansVersion((v) => v + 1);");
    const end = refresh.indexOf("}, [");
    expect(bump, "le compteur ne monte pas dans refreshLivePlans").toBeGreaterThan(0);
    expect(bump, "il monte APRÈS la lecture, réussie ou non").toBeLessThan(end);
  });

  it("l'adoption passe par cette relecture, et le builder reçoit le compteur", () => {
    const adopt = page.slice(page.indexOf("onAdopt={async () => {"));
    expect(adopt.slice(0, 1_500)).toContain("await refreshLivePlans(uid);");
    expect(page).toContain("plansVersion={plansVersion}");
  });

  it("le builder relit ses plans quand le compteur change", () => {
    expect(builder).toContain("plansVersion?: number;");
    expect(builder).toContain("}, [userId, props.plansVersion]);");
    // ⛔ ET PAS SEULEMENT AU MONTAGE : l'ancienne dépendance seule serait le bug.
    expect(builder.split("}, [userId]);").length - 1, "un effet ne dépend plus que de userId").toBe(0);
  });
});
