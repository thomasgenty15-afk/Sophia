// JETABLE — sonde du vérificateur 1B. Aucune base, aucun réseau, aucune écriture.
// Attaque LE CHEMIN DE LECTURE (pas seulement la fonction pure) :
//  · une famille NON-craving en next_plan remonte-t-elle ?
//  · un durable posé sur ce canal est-il refusé À LA LECTURE ?
//  · un portion.adjust (durable LITTÉRAL) posé là est-il refusé ?
//  · un subject `member:<uuid>` survit-il, et combien de lignes par foyer ?
import {
  NEXT_PLAN_ITEMS_COLUMN,
  nextPlanItemsWithLifeFor,
} from "../supabase/functions/_shared/keel/retained_next_plan.ts";

type Row = Record<string, unknown>;

function fake(rows: Row[], household: string | null = "H1") {
  const seen: Array<{ table: string; args: unknown[] }> = [];
  const client = {
    from(table: string) {
      if (table === "household_members") {
        return {
          select: () => ({
            eq: (...a: unknown[]) => {
              seen.push({ table, args: a });
              return {
                maybeSingle: () =>
                  Promise.resolve({
                    data: household ? { household_id: household } : null,
                    error: null,
                  }),
              };
            },
          }),
        };
      }
      return {
        select: (...s: unknown[]) => {
          seen.push({ table: `${table}.select`, args: s });
          return {
            eq: (...a: unknown[]) => {
              seen.push({ table, args: a });
              return {
                gte: (...g: unknown[]) => {
                  seen.push({ table: `${table}.gte`, args: g });
                  return Promise.resolve({ data: rows, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, seen };
}

const MEMBER = "11111111-2222-4333-8444-555555555555";

function item(over: Record<string, unknown>) {
  return {
    subject: "household",
    text: "x",
    value: null,
    source: "written",
    at: "2026-08-19",
    item: "",
    confidence: null,
    ...over,
  };
}

const rows: Row[] = [{
  week_start: "2026-08-17",
  [NEXT_PLAN_ITEMS_COLUMN]: [
    item({ kind: "craving", scope: "next_plan", text: "fajitas" }),
    item({
      kind: "food.exclude",
      scope: "next_plan",
      source: "draft_note",
      text: "pas de poisson",
    }),
    item({
      kind: "food.prefer",
      scope: "next_plan",
      source: "draft_note",
      text: "plus de lentilles",
    }),
    item({
      kind: "method.avoid",
      scope: "next_plan",
      source: "draft_note",
      text: "rien de frit",
    }),
    item({
      kind: "method.prefer",
      scope: "next_plan",
      source: "draft_note",
      text: "au four",
    }),
    item({
      kind: "logistics.set",
      scope: "next_plan",
      source: "draft_note",
      text: "30 min max",
      value: { field: "cooking_time_min", value: 30 },
    }),
    item({
      kind: "rhythm.set",
      scope: "next_plan",
      source: "written",
      text: "pas de petit dej",
      value: { occasion: "breakfast", present: false },
    }),
    // Les REFUS attendus :
    item({
      kind: "food.exclude",
      scope: "durable",
      source: "questionnaire",
      text: "DURABLE-NE-DOIT-PAS-REMONTER",
    }),
    item({
      kind: "portion.adjust",
      scope: "durable",
      source: "questionnaire",
      text: "PORTION-NE-DOIT-PAS-REMONTER",
      value: { direction: "down", magnitude: "slight" },
    }),
    // Un sujet PAR MEMBRE sur ce canal — autorisé par la nomenclature §2 axe 3.
    item({
      kind: "craving",
      scope: "next_plan",
      subject: `member:${MEMBER}`,
      text: "des pates pour Lea",
    }),
  ],
}];

const { client, seen } = fake(rows);
const dated = await nextPlanItemsWithLifeFor({
  admin: client,
  userId: "u-1",
  today: "2026-08-19",
});
console.log("--- ce qui remonte ---");
for (const d of dated) {
  console.log(`  ${d.kind ?? ""}`.trim(), JSON.stringify({
    kind: d.item.kind,
    scope: d.item.scope,
    subject: d.item.subject,
    text: d.item.text,
    lastDay: d.life.lastDay,
  }));
}
console.log("total remonté:", dated.length, "/ déposé:", 10);
console.log("--- appels observés (arguments réels) ---");
console.log(JSON.stringify(seen, null, 1));
