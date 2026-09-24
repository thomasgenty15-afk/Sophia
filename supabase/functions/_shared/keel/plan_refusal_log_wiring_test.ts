// LOT R — LE JOURNAL DES REFUS EST CÂBLÉ, DES DEUX CÔTÉS DU 202.
//
// Ce test lit la SOURCE du handler : un journal qu'on croit branché et qui ne
// l'est pas ressemble exactement à un journal branché — jusqu'au prochain
// « pourquoi ce plan a été refusé ? » sans réponse (mesuré le 2026-09-15).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { sourceFamily } from "./source_family.ts";

const ROOT = new URL("../../../", import.meta.url);
const HANDLER = await sourceFamily(
  new URL("functions/generate-household-meal-v1/index.ts", ROOT),
);
const EXPORT = await Deno.readTextFile(
  new URL("functions/account-export-v1/index.ts", ROOT),
);
const SCOPE = await Deno.readTextFile(
  new URL("functions/account-export-v1/export_scope.ts", ROOT),
);
const MIGRATION = await Deno.readTextFile(
  new URL("migrations/20260915190000_les_refus_de_plan_ont_une_table.sql", ROOT),
);

Deno.test("le wrapper consigne un refus rendu tout de suite ET un refus rendu après le 202", () => {
  assert(HANDLER.includes('keepWorking(journalRefusalWithBody(winner.response, "sync", null));'));
  assert(HANDLER.includes('await journalRefusalWithBody(late, "async", winner.draftId);'));
  // Un seul écrivain : `recordPlanRefusal` n'est appelé que par le wrapper.
  assertEquals(HANDLER.split("recordPlanRefusal(").length - 1, 1);
});

Deno.test("le handler pose QUI demandait dès l'admission, avec la tentative", () => {
  assert(HANDLER.includes("ctx.who = { userId, householdId, intent, attempt: relaunchOf ? 2 : 1 };"));
  const who = HANDLER.indexOf("ctx.who = {");
  const model = HANDLER.indexOf('await appelModele("composition"');
  assert(who > 0 && model > 0 && who < model, "`who` doit précéder le premier appel modèle");
});

Deno.test("le contrôle final pose les motifs EXACTS et le candidat avant son 422", () => {
  const site = HANDLER.indexOf('error: "plan_not_deliverable",\n        // ⛔ LES MOTIFS EXACTS');
  assert(site > 0, "le 422 du contrôle final a bougé");
  const before = HANDLER.slice(Math.max(0, site - 1_800), site);
  assert(before.includes("refusals: publication.delivery.blocking,"), "le détail non masqué n'est pas posé");
  assert(before.includes("plan: { dishes: meal.dishes, preparations: meal.preparations, cooking_sessions: meal.cooking_sessions },"));
  assert(before.includes("rounds: c4Round + 1,"));
  assert(before.includes("callsMade: c4CallsMade,"));
  // ⛔ PAS `refusal:` NI `model:` — deux épingles voisines lisent ces mots-clés.
  assertEquals(HANDLER.includes("ctx.refusal"), false);
  assertEquals(HANDLER.includes("model: keelGenerationModel()"), false);
  assert(HANDLER.includes("generationModel: keelGenerationModel(),"));
});

Deno.test("la table est réclamée par l'export RGPD dès sa migration, et verrouillée", () => {
  assert(SCOPE.includes("planRefusals:"));
  assert(EXPORT.includes('"keel_plan_refusals",'));
  assert(EXPORT.includes("refus_de_composition: planRefusals,"));
  assert(MIGRATION.includes("alter table public.keel_plan_refusals enable row level security;"));
  assert(MIGRATION.includes("revoke all on table public.keel_plan_refusals from public, anon, authenticated;"));
  assert(MIGRATION.includes("references auth.users(id) on delete cascade"));
});
