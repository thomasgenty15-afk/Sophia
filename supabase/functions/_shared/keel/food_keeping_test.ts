/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA CONSERVATION — UNE SEULE LECTURE, ET LES DEUX LECTEURS LA SUIVENT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT MESURÉ, TIR 3 RÉEL DU 2026-09-12. La DATATION lisait le rayon,
 * la GARDE FINALE lisait le groupe. Le thon EN CONSERVE partait au rayon
 * `pantry` (donc daté comme stable) et gardait le groupe `white_fish` (donc
 * refusé avec la fenêtre du poisson frais) : « thon en conserve acheté le
 * 2026-09-12, tenu 1 jour, attendu cuisiné le 2026-09-14 — sans congélation ».
 * Un plan entier refusé pour une phrase fausse.
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  keepingCounts,
  keepingOf,
  keepingWindowDays,
} from "./food_keeping.ts";
import { planGroceryWaves } from "./grocery_waves.ts";
import {
  finalPlanGate,
  FINAL_GATE_POLICY_LOT_4,
} from "./final_plan_gate.ts";
import {
  CLEAN_HOUSEHOLD_CONTEXT,
  CLEAN_HOUSEHOLD_PLAN,
} from "./final_plan_gate_fixtures.ts";
import { RAW_WINDOW_DAYS } from "./fridge_window.ts";
import { SHELF_STABLE_SLUGS } from "./shopping_identity.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LES QUATRE NATURES, ET ELLES NE SE CONFONDENT PAS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("① la conserve NOMMÉE se garde, malgré le groupe du poisson frais", () => {
  const boite = keepingOf({ ref: "tuna_tinned", group: "white_fish" });
  assertEquals(boite.kind, "stable");
  assertEquals(boite.rawWindowDays, null);
  assertEquals(boite.why, "shelf_stable_slug");
  // ⛔ ET LE FRAIS, SOUS LE MÊME GROUPE, GARDE SA FENÊTRE D'UN JOUR.
  const filet = keepingOf({ ref: "tuna_fresh", group: "white_fish" });
  assertEquals(filet.kind, "refrigerated");
  assertEquals(filet.rawWindowDays, RAW_WINDOW_DAYS.white_fish);
  assertEquals(filet.rawWindowDays, 1);
});

Deno.test("① bis — « inconnu » n'est PAS « stable », et les deux se lisent", () => {
  // ⛔ LA FAÇON DONT CES CONTRÔLES MEURENT: écrire « aucune contrainte » faute
  // de donnée. Une ligne sans groupe n'est pas réputée se garder.
  const rien = keepingOf({ ref: null, group: null });
  assertEquals(rien.kind, "unknown");
  assertEquals(rien.rawWindowDays, null);
  assertEquals(rien.why, "no_group");
  // Les deux rendent `null` en fenêtre; seul `kind` les sépare.
  assertEquals(keepingWindowDays({ ref: "tuna_tinned", group: "white_fish" }), null);
  assertEquals(keepingWindowDays({ ref: null, group: null }), null);
  assert(
    keepingOf({ ref: "tuna_tinned", group: "white_fish" }).kind !==
      keepingOf({ ref: null, group: null }).kind,
  );
});

Deno.test("① ter — le geste du CONGÉLATEUR gagne sur tout", () => {
  const gele = keepingOf({ ref: "tuna_fresh", group: "white_fish", frozen: true });
  assertEquals(gele.kind, "frozen");
  assertEquals(gele.rawWindowDays, null);
  assertEquals(gele.why, "freeze_declared");
});

Deno.test("① quater — les compteurs séparent les quatre natures", () => {
  assertEquals(
    keepingCounts([
      { ref: "tuna_tinned", food_group: "white_fish" },
      { ref: "tuna_fresh", food_group: "white_fish" },
      { ref: "chicken_breast", food_group: "poultry", freeze_on_purchase: true },
      { ref: null, food_group: null },
    ]),
    { stable: 1, refrigerated: 1, frozen: 1, unknown: 1 },
  );
});

Deno.test("① quinquies — chaque slug nommé stable est bien lu comme tel", () => {
  // ⛔ LA LISTE EST UNE ÉNUMÉRATION, PAS UN MOTIF. Si quelqu'un y ajoute un
  // slug, ce cas le lit; s'il change la fonction, ce cas rougit.
  for (const slug of SHELF_STABLE_SLUGS) {
    assertEquals(
      keepingOf({ ref: slug, group: "white_fish" }).kind,
      "stable",
      slug,
    );
  }
  assert(SHELF_STABLE_SLUGS.size > 0, "la liste est vide: rien n'est protégé");
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LES DEUX LECTEURS DISENT LA MÊME CHOSE — c'est tout l'objet du lot
// ═══════════════════════════════════════════════════════════════════════════

// ⚠️ ON PART DU PLAN PROPRE DE LA GARDE, ET ON N'Y CHANGE QU'UNE LIGNE. Bâtir
// un plan à la main ici ferait un second jeu de fixtures qui divergerait du
// premier au premier champ ajouté — et c'est celui qu'on regarde le moins qui
// garderait l'ancienne forme.
function planAvecLigne(line: {
  term: string;
  aisle: string;
  food_group: string;
  ref: string;
  buy_on: string;
}) {
  const plan = structuredClone(CLEAN_HOUSEHOLD_PLAN) as unknown as {
    shopping_list: Record<string, unknown>[];
    dishes: { day: string | null; ingredients: Record<string, unknown>[] }[];
  };
  // ⛔ L'INGRÉDIENT VA SUR UN PLAT DU **LUNDI**, PAS SUR UNE CASSEROLE. Toutes
  // les casseroles de la fixture cuisent le dimanche — rang 0, c'est-à-dire le
  // jour même de l'achat: aucune fenêtre ne peut mordre là, et le cas ne
  // prouverait rien. Le besoin doit être DATÉ PLUS TARD que l'achat.
  plan.shopping_list.push({
    term: line.term,
    quantity: "200 g",
    aisle: line.aisle,
    food_group: line.food_group,
    ref: line.ref,
    buy_on: line.buy_on,
    freeze_on_purchase: false,
  });
  // ⛔ IL FAUT UN BESOIN AU RANG 2. Au rang 1, une fenêtre d'UN jour couvre
  // encore l'achat du rang 0 (`achat + 1 >= besoin`) — le cas ne prouverait
  // rien. On duplique donc le plat du lundi sur le MARDI, avec ses propres
  // identifiants de contenant, et on y met l'aliment sonde.
  const lundi = plan.dishes.find((d) => d.day === "mon");
  if (lundi === undefined) throw new Error("la fixture n'a plus de plat du lundi");
  const mardi = structuredClone(lundi) as typeof lundi & {
    title: string;
    name: string;
    boxes: { id: string }[];
    uses: unknown[];
  };
  mardi.day = "tue";
  mardi.title = "Sonde du mardi";
  mardi.name = "Sonde du mardi";
  mardi.ingredients = [{ term: line.term, group: line.food_group }];
  // ⚠️ SANS CASSEROLE, ET C'EST NÉCESSAIRE: la garde ne date les ingrédients
  // d'un plat que lorsqu'il ne puise dans AUCUNE préparation (le gap qu'elle
  // documente elle-même). Un plat qui tire un lot verrait son frais daté par
  // le lot, donc au rang du lot.
  mardi.uses = [];
  for (const b of mardi.boxes ?? []) b.id = `${b.id}_tue`;
  plan.dishes.push(mardi);
  return plan as unknown as Parameters<typeof finalPlanGate>[0];
}

Deno.test("② la DATATION ne fait pas attendre une conserve, et la GARDE ne la refuse pas", () => {
  // ── LA DATATION ────────────────────────────────────────────────────────
  const waves = planGroceryWaves({
    startsOn: "2026-09-14",
    durationDays: 7,
    runs: null,
    freezer: false,
    shoppingList: [{
      term: "thon en conserve",
      aisle: "pantry",
      food_group: "white_fish",
      ref: "tuna_tinned",
    }],
    preparations: [{ id: "p1", cookOn: "wed", ingredientTerms: ["thon en conserve"] }],
  });
  assertEquals(waves.length, 1);
  assertEquals(
    waves[0].buyOn,
    "2026-09-14",
    "la conserve attend comme du poisson frais",
  );

  // ── LA GARDE, SUR LA MÊME LECTURE ──────────────────────────────────────
  const verdict = finalPlanGate(
    planAvecLigne({
      term: "thon en conserve",
      aisle: "pantry",
      food_group: "white_fish",
      ref: "tuna_tinned",
      // ⛔ LE PREMIER JOUR DU PLAN, donc bien avant la cuisson.
      buy_on: CLEAN_HOUSEHOLD_CONTEXT.startsOn,
    }),
    { ...CLEAN_HOUSEHOLD_CONTEXT, policy: FINAL_GATE_POLICY_LOT_4 },
  );
  assertEquals(
    verdict.refusals.filter((r) => r.cause === "perishable_bought_too_early"),
    [],
    "la garde refuse encore une conserve achetée le premier jour",
  );
});

Deno.test("② bis — LA CONTRE-ÉPREUVE: le poisson FRAIS, lui, est toujours gardé", () => {
  // ⛔ UNE GARDE ÉPROUVÉE SEULEMENT SUR CE QU'ELLE LAISSE PASSER EST
  // INDISCERNABLE D'UNE GARDE DÉBRANCHÉE.
  assertEquals(FINAL_GATE_POLICY_LOT_4.perishable_bought_too_early, "refuse");
  const verdict = finalPlanGate(
    planAvecLigne({
      term: "thon frais",
      aisle: "protein",
      food_group: "white_fish",
      ref: "tuna_fresh",
      buy_on: CLEAN_HOUSEHOLD_CONTEXT.startsOn,
    }),
    { ...CLEAN_HOUSEHOLD_CONTEXT, policy: FINAL_GATE_POLICY_LOT_4 },
  );
  const morsure = verdict.refusals.filter((r) =>
    r.cause === "perishable_bought_too_early"
  );
  assertEquals(morsure.length, 1, "le poisson frais acheté trop tôt passe");
  assertEquals(morsure[0].severity, "refuse");

  // ⛔ ET LA DATATION NE L'AURAIT PAS DATÉ LÀ. C'est ce qui rend ce refus
  // impossible en pratique: `buyOn = max(début, cuisson − fenêtre)`.
  const waves = planGroceryWaves({
    startsOn: "2026-09-14",
    durationDays: 7,
    runs: null,
    freezer: false,
    shoppingList: [{
      term: "thon frais",
      aisle: "protein",
      food_group: "white_fish",
      ref: "tuna_fresh",
    }],
    preparations: [{ id: "p1", cookOn: "wed", ingredientTerms: ["thon frais"] }],
  });
  assertEquals(waves[0].buyOn, "2026-09-15", "la veille de la cuisson");
});
