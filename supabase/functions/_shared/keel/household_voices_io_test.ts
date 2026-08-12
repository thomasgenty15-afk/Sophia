// LE BRANCHEMENT DES VOIX — et c'est là que D4 se joue vraiment.
//
// Le module pur (`household_voices.ts`) décide ce qui entre et ce qui est
// coupé; il ne sait rien de QUI est lu. Le défaut que ce lot répare est
// entièrement de ce côté-ci: `reconcileFoodPreferencesFor` était paramétré par
// utilisateur depuis toujours, et le générateur du foyer ne l'appelait que pour
// le maître. Un module pur parfait n'aurait rien changé à ça.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  applyFoodPreferenceDecision,
  FOOD_PREFERENCES_KEY,
} from "./food_preference_promotion.ts";
import { loadHouseholdVoices } from "./household_voices_io.ts";

const OLD = "aaaaaaaa-0000-4000-8000-000000000001";

type Row = Record<string, unknown>;

interface Trace {
  /** Chaque `.in(col, ids)` observé, table par table — le SCOPE des lectures. */
  inCalls: Array<{ table: string; column: string; ids: unknown[] }>;
  tablesRead: string[];
  updates: Array<{ table: string; patch: Record<string, unknown> }>;
}

/**
 * Un faux client qui suit les chaînes des DEUX modules traversés:
 *   from("student_goals").select(..).in("user_id", ids)   -> await   (ce module)
 *   from("memory_items").select(..).eq(..).in("id", ids)  -> await   (le pont)
 *   from("profiles").select(..).eq(..).maybeSingle()                 (le pont)
 *   from("student_goals").update(..).eq(..)               -> await   (le pont)
 */
function fakeAdmin(opts: {
  goalsByUser?: Record<string, Row>;
  itemsById?: Record<string, Row>;
  failGoalsRead?: boolean;
}) {
  const trace: Trace = { inCalls: [], tablesRead: [], updates: [] };

  const from = (table: string) => ({
    select: (_cols: string) => {
      trace.tablesRead.push(table);
      let ids: unknown[] = [];
      const node: Record<string, unknown> = {
        eq: () => node,
        in: (column: string, values: unknown[]) => {
          ids = values;
          trace.inCalls.push({ table, column, ids: values });
          return node;
        },
        maybeSingle: () =>
          Promise.resolve({ data: { full_name: "Theo" }, error: null }),
        then: (resolve: (v: unknown) => unknown) => {
          if (table === "student_goals" && opts.failGoalsRead) {
            return resolve({ data: null, error: { message: "boom" } });
          }
          const source = table === "student_goals"
            ? (opts.goalsByUser ?? {})
            : (opts.itemsById ?? {});
          const rows = ids.map((id) => source[String(id)]).filter(Boolean);
          return resolve({ data: rows, error: null });
        },
      };
      return node;
    },
    update: (patch: Record<string, unknown>) => {
      trace.updates.push({ table, patch });
      const node: Record<string, unknown> = {
        eq: () => node,
        then: (resolve: (v: unknown) => unknown) => resolve({ error: null }),
      };
      return node;
    },
  });

  return { admin: { from } as never, trace };
}

/** Une ligne gardée avec son origine datée, comme la carte l'écrit. */
function kept(text: string, at: string) {
  return applyFoodPreferenceDecision({}, {
    kind: "keep",
    text,
    memoryItemId: OLD,
    seenAt: at,
  });
}

function goalRow(userId: string, text: string, at: string): Row {
  return { user_id: userId, practical_constraints: kept(text, at) };
}

// ---------------------------------------------------------------------------

Deno.test("D4 — un SECONDAIRE est lu, et sa ligne arrive au prompt", async () => {
  // ⚠️ LE DÉFAUT MESURÉ, ET IL SE MESURE EN EUROS. Avant L6 cette lecture
  // n'existait pas: un compte secondaire pouvait avoir confirmé dix préférences
  // sur son propre écran, la composition du foyer n'en voyait aucune.
  const { admin, trace } = fakeAdmin({
    goalsByUser: { "u-zoe": goalRow("u-zoe", "no fish", "2026-08-01") },
    itemsById: { [OLD]: { id: OLD, status: "active", normalized_summary: "no fish" } },
  });
  const out = await loadHouseholdVoices(admin, {
    members: [
      { memberId: "m-zoe", userId: "u-zoe", displayName: "Zoé", constraints: null },
    ],
    source: "test",
  });
  assertEquals(out.voices.length, 1);
  assertEquals(out.voices[0].memberId, "m-zoe");
  assertEquals(out.voices[0].lines, ["2026-08-01 — no fish"]);
  assertEquals(out.reads, 1);
  assertEquals(out.issues, []);
  // ⚠️ LE SCOPE. Sous `service_role` il n'y a pas de RLS: ce filtre est la SEULE
  // chose qui empêche ce chargeur de rendre la ligne de n'importe qui.
  const goalsRead = trace.inCalls.filter((c) => c.table === "student_goals");
  assertEquals(goalsRead.length, 1);
  assertEquals(goalsRead[0].column, "user_id");
  assertEquals(goalsRead[0].ids, ["u-zoe"]);
});

Deno.test("LE MAÎTRE N'EST PAS RELU — ses contraintes arrivent déjà réconciliées", async () => {
  // Sa ligne est lue bien plus haut, pour le rythme de repas et la capacité de
  // cuisine. La relire ici coûterait un aller-retour de plus vers la mémoire
  // pour un résultat identique — et une seconde écriture possible sur la même
  // ligne dans la même requête.
  const { admin, trace } = fakeAdmin({});
  const out = await loadHouseholdVoices(admin, {
    members: [
      {
        memberId: "m-dad",
        userId: "u-dad",
        displayName: "Marc",
        constraints: kept("hates broccoli", "2026-08-02"),
      },
    ],
    source: "test",
  });
  assertEquals(out.voices[0].lines, ["2026-08-02 — hates broccoli"]);
  assertEquals(out.reads, 0);
  assertEquals(trace.tablesRead, [], "la ligne du maître a été relue");
  assertEquals(trace.updates, []);
});

Deno.test("UNE BOUCHE SANS COMPTE N'EST JAMAIS LUE (D3)", async () => {
  // Pas de `student_goals`, pas de mémoire: ce n'est pas un manque. Une lecture
  // sur un `user_id` vide serait une requête sur une clé nulle, c'est-à-dire au
  // mieux du bruit et au pire une ligne rendue au hasard.
  const { admin, trace } = fakeAdmin({});
  const out = await loadHouseholdVoices(admin, {
    members: [
      { memberId: "m-kid", userId: "", displayName: "Léa", constraints: null },
    ],
    source: "test",
  });
  assertEquals(out.voices, []);
  assertEquals(out.issues, []);
  assertEquals(trace.tablesRead, []);
});

Deno.test("UN COMPTE SANS LIGNE `student_goals` N'EST PAS UNE PANNE", async () => {
  // Le cas nominal d'un secondaire tout neuf. Laisser une `issue` ici ferait
  // ressembler « il n'a rien confirmé » à « la lecture a échoué », et les deux
  // demandent des réactions opposées.
  const { admin } = fakeAdmin({ goalsByUser: {} });
  const out = await loadHouseholdVoices(admin, {
    members: [
      { memberId: "m-new", userId: "u-new", displayName: "Nina", constraints: null },
    ],
    source: "test",
  });
  assertEquals(out.voices, []);
  assertEquals(out.issues, []);
});

Deno.test("UNE LECTURE EN PANNE NE COÛTE PAS UN DÎNER — fail-open TRACÉ", async () => {
  // Posture de `food_preference_promotion_io.ts` mot pour mot, et c'est
  // l'inverse de celle des allergies (qui THROW): on parle ici de goûts. Un
  // foyer dont la mémoire est illisible compose quand même — comme avant ce lot.
  const { admin } = fakeAdmin({ failGoalsRead: true });
  const out = await loadHouseholdVoices(admin, {
    members: [
      { memberId: "m-zoe", userId: "u-zoe", displayName: "Zoé", constraints: null },
      { memberId: "m-tom", userId: "u-tom", displayName: "Tom", constraints: null },
    ],
    source: "test",
  });
  assertEquals(out.voices, []);
  assertEquals(out.issues, ["voice_goals_unreadable:2"]);
});

Deno.test("LE MAÎTRE PRÉCHARGÉ ET UN SECONDAIRE CHARGÉ COHABITENT, DANS L'ORDRE REÇU", async () => {
  const { admin, trace } = fakeAdmin({
    goalsByUser: { "u-zoe": goalRow("u-zoe", "no fish", "2026-08-01") },
    itemsById: { [OLD]: { id: OLD, status: "active", normalized_summary: "no fish" } },
  });
  const out = await loadHouseholdVoices(admin, {
    members: [
      {
        memberId: "m-dad",
        userId: "u-dad",
        displayName: "Marc",
        constraints: kept("hates broccoli", "2026-08-02"),
      },
      { memberId: "m-zoe", userId: "u-zoe", displayName: "Zoé", constraints: null },
    ],
    source: "test",
  });
  assertEquals(out.voices.map((v) => v.displayName), ["Marc", "Zoé"]);
  // Une SEULE requête `student_goals`, et elle ne porte que le compte à charger.
  const goalsRead = trace.inCalls.filter((c) => c.table === "student_goals");
  assertEquals(goalsRead.length, 1);
  assertEquals(goalsRead[0].ids, ["u-zoe"]);
});

Deno.test("LA RÉTRACTATION D'UN SECONDAIRE EST HONORÉE, ET PERSISTÉE", async () => {
  // ⚠️ C'EST LA MOITIÉ « MÉMOIRE » DE D4, et elle ne marche que parce qu'on
  // passe par le pont existant. Le memorizer a enregistré que Zoé est revenue
  // sur ce qu'elle avait dit (`invalidated`); sans la réconciliation, la
  // préférence démentie serait servie au modèle pour toujours, puisque rien
  // d'autre sur ce chemin ne relit la mémoire.
  const { admin, trace } = fakeAdmin({
    goalsByUser: { "u-zoe": goalRow("u-zoe", "no fish", "2026-08-01") },
    itemsById: {
      [OLD]: { id: OLD, status: "invalidated", normalized_summary: "no fish" },
    },
  });
  const out = await loadHouseholdVoices(admin, {
    members: [
      { memberId: "m-zoe", userId: "u-zoe", displayName: "Zoé", constraints: null },
    ],
    source: "test",
  });
  assertEquals(out.voices, [], "une préférence rétractée est encore servie");
  // ELLE PERSISTE, ELLE NE FILTRE PAS: la correction est écrite une fois et les
  // deux autres générateurs en profitent.
  assertEquals(trace.updates.length, 1);
  assertEquals(trace.updates[0].table, "student_goals");
  assertEquals(
    (trace.updates[0].patch.practical_constraints as Record<string, unknown>)[
      FOOD_PREFERENCES_KEY
    ],
    [],
  );
  assert(trace.tablesRead.includes("memory_items"));
});
