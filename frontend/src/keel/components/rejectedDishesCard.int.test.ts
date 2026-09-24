import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import RejectedDishesCard from "./RejectedDishesCard";
import { rejectedDishesFrom } from "../api/rejectedDishes";
import { en } from "../i18n/en";

// ⟳ 2026-09-24 — « PLATS REFUSÉS » DANS « CE QUE SOPHIA SAIT ».
// Chaque ligne dit le plat, pour qui, quand, et la raison citée; « tout le
// foyer » quand la table entière le mangeait; une bouche partie ne s'affiche
// pas. Vide, la section dit comment elle se remplit.
//
// ⚠️ `.ts` ET `createElement`: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts`.

const MEMBERS = new Map([["m-paul", "Paul"], ["m-lea", "Léa"]]);

function text(constraints: Record<string, unknown>): string {
  return renderToStaticMarkup(createElement(RejectedDishesCard, {
    entries: rejectedDishesFrom(constraints),
    members: MEMBERS,
    onRemove: async () => {},
  }))
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

describe("la liste des plats refusés", () => {
  it("vide: elle dit comment elle se remplit", () => {
    const out = text({});
    expect(out).toContain(en["known.rejected.title"]);
    expect(out).toContain(en["known.rejected.empty"]);
  });

  it("une ligne par plat: le titre, pour qui, la raison citée", () => {
    const out = text({
      rejected_dishes: [
        {
          key: "lait, pêche et avoine", title: "Lait, pêche et avoine", household: false,
          member_ids: ["m-paul", "m-gone"], reason: "trop sucré", at: "2026-09-24", draft_id: null,
        },
        {
          key: "soupe", title: "Soupe de courge", household: true,
          member_ids: [], reason: "fade", at: "2026-09-23", draft_id: null,
        },
      ],
    });
    expect(out).toContain("Lait, pêche et avoine");
    expect(out).toContain("Paul");
    // La bouche partie ne s'affiche pas (ni son identifiant).
    expect(out).not.toContain("m-gone");
    expect(out).toContain(en["known.rejected.said"].replace("{reason}", "trop sucré"));
    expect(out).toContain("Soupe de courge");
    expect(out).toContain(en["known.rejected.everyone"]);
    expect(out.split(en["known.remove"]).length - 1).toBe(2);
  });
});
