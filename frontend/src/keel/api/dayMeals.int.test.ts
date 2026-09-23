import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { dayMealsMissedDate } from "./dayMeals";

// ⟳ 2026-09-23 — LE « NON » DE LA QUESTION DU SOIR OUVRE LA JOURNÉE.
//
// Le jeton est fabriqué par le serveur (`day_meals_ask.ts`) et reconnu ici. Si
// les deux formes divergent, « Non » part au serveur sans que la journée ne
// s'ouvre — un bouton qui répond une phrase et n'ouvre rien.

const DENO_SOURCE = new URL(
  "../../../../supabase/functions/_shared/keel/day_meals_ask.ts",
  import.meta.url,
);

describe("le « Non » de la question du soir", () => {
  it("lit la date que porte le jeton", () => {
    expect(dayMealsMissedDate("KEEL_DAYMEALS_no|2026-09-23")).toBe("2026-09-23");
  });

  it("ne lit ni le « Oui », ni une charge tronquée, ni un autre vocabulaire", () => {
    expect(
      dayMealsMissedDate(
        "KEEL_DAYMEALS_yes|2026-09-23|11111111-2222-4333-8444-555555555555@0",
      ),
    ).toBeNull();
    expect(dayMealsMissedDate("KEEL_DAYMEALS_no|2026-09")).toBeNull();
    expect(dayMealsMissedDate("KEEL_SLOTMEAL_skip|2026-09-23|lunch")).toBeNull();
    expect(dayMealsMissedDate(null)).toBeNull();
  });

  it("le serveur fabrique exactement cette forme", () => {
    const src = readFileSync(DENO_SOURCE, "utf8");
    expect(src).toContain('DAY_MEALS_BUTTON_PREFIX = "KEEL_DAYMEALS_"');
    expect(src).toContain('export const DAY_MEALS_ACTIONS = ["yes", "no"] as const;');
    // « Non » ne porte pas de segment de plan: `tail` est vide pour lui.
    expect(src).toContain(
      "return `${DAY_MEALS_BUTTON_PREFIX}${args.action}|${args.localDate}${tail}`;",
    );
    expect(src).toContain('if (args.action === "no" && plan)');
  });
});
