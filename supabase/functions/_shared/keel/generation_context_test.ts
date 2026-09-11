/**
 * LOT 2 · LES QUATRE SITUATIONS DE LA TABLE DU PLAN PASSENT PAR UNE PORTE.
 *
 * Ce fichier éprouve la RÉSOLUTION, pas les lectures: c'est tout l'intérêt de
 * l'avoir rendue pure. Les lectures elles-mêmes sont éprouvées en base par
 * `personal_household_test.sql` et `personal_household_departure_test.sql`.
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  contextForRoster,
  GENERATION_REFUSAL_STATUS,
  type GenerationAdmissionReads,
  resolveGenerationAdmission,
  type RosterSeat,
} from "./generation_context.ts";

const MAITRE = "11111111-1111-4111-8111-111111111111";
const SECOND = "22222222-2222-4222-8222-222222222222";
const FOYER = "33333333-3333-4333-8333-333333333333";

function reads(
  over: Partial<GenerationAdmissionReads> = {},
): GenerationAdmissionReads {
  return {
    actorUserId: MAITRE,
    seat: { householdId: FOYER, memberId: "m-maitre", role: "owner" },
    covered: true,
    ...over,
  };
}

const SEUL: RosterSeat[] = [{
  memberId: "m-maitre",
  userId: MAITRE,
  role: "owner",
}];

Deno.test("① personne seule: un foyer d'une bouche, et elle en est maître", () => {
  const out = resolveGenerationAdmission(reads());
  assertEquals(out.ok, true);
  if (!out.ok) return;
  const ctx = contextForRoster(out.actor, SEUL);
  assertEquals(ctx.householdSize, 1);
  assertEquals(ctx.masterUserId, MAITRE);
  assertEquals(ctx.planOwnerUserId, MAITRE);
  assertEquals(ctx.writeScope, "household");
  assertEquals(ctx.servedMemberIds, ["m-maitre"]);
});

Deno.test("② plusieurs bouches: MÊME contrat, seule la taille change", () => {
  const admis = resolveGenerationAdmission(reads());
  assertEquals(admis.ok, true);
  if (!admis.ok) return;
  // ⛔ LE CŒUR DU LOT: LA MÊME ADMISSION sert les deux tailles. Le roster
  // n'ouvre aucun droit — il ne fait qu'ajouter des bouches.
  const solo = contextForRoster(admis.actor, SEUL);
  const famille = contextForRoster(admis.actor, [
    ...SEUL,
    { memberId: "m-second", userId: SECOND, role: "member" },
    { memberId: "m-bebe", userId: null, role: "member" },
  ]);
  const sansBouches = (c: typeof solo) => ({
    ...c,
    servedMemberIds: [],
    householdSize: 0,
  });
  assertEquals(sansBouches(famille), sansBouches(solo));
  assertEquals(famille.householdSize, 3);
  assertEquals(solo.householdSize, 1);
});

Deno.test("③ membre secondaire: `not_owner`, même pour un plan à lui seul", () => {
  const out = resolveGenerationAdmission(reads({
    actorUserId: SECOND,
    seat: { householdId: FOYER, memberId: "m-second", role: "member" },
  }));
  assertEquals(out.ok, false);
  if (out.ok) return;
  assertEquals(out.refusal, "not_owner");
  assertEquals(out.status, 403);
});

Deno.test("④ aucun siège: `no_household` — le rattrapage du lot 1 a échoué", () => {
  const out = resolveGenerationAdmission(reads({ seat: null }));
  assertEquals(out.ok, false);
  if (out.ok) return;
  assertEquals(out.refusal, "no_household");
});

Deno.test("l'ORDRE des refus: un secondaire n'apprend pas le gel du foyer d'autrui", () => {
  // ⛔ SI CE TEST S'INVERSE, un membre secondaire lit l'état de facturation
  // d'un foyer qu'il n'a pas le droit de composer.
  const out = resolveGenerationAdmission(reads({
    actorUserId: SECOND,
    seat: { householdId: FOYER, memberId: "m-second", role: "member" },
    covered: false,
  }));
  assertEquals(out.ok, false);
  if (out.ok) return;
  assertEquals(out.refusal, "not_owner");
});

Deno.test("le gel mord le maître, et SEULEMENT sur un `false` lu", () => {
  const gele = resolveGenerationAdmission(reads({ covered: false }));
  assertEquals(gele.ok, false);
  if (!gele.ok) assertEquals(gele.refusal, "household_frozen");

  // ⚠️ LA PANNE PASSE, ET C'EST L'ARBITRAGE ÉCRIT. `!covered` gèlerait ici.
  const panne = resolveGenerationAdmission(reads({ covered: null }));
  assertEquals(panne.ok, true);
  if (panne.ok) assertEquals(panne.actor.coverageUnreadable, true);
});

Deno.test("sans acteur, rien — et le statut est celui d'un jeton, pas d'un droit", () => {
  for (const vide of [null, "", "   "]) {
    const out = resolveGenerationAdmission(reads({ actorUserId: vide }));
    assertEquals(out.ok, false);
    if (out.ok) return;
    assertEquals(out.refusal, "not_authenticated");
    assertEquals(out.status, 401);
  }
});

Deno.test("une ligne sans identifiant ne fabrique pas de bouche", () => {
  const out = resolveGenerationAdmission(reads());
  assertEquals(out.ok, true);
  if (!out.ok) return;
  const ctx = contextForRoster(out.actor, [
    ...SEUL,
    { memberId: "  ", userId: null, role: "member" },
  ]);
  assertEquals(ctx.servedMemberIds, ["m-maitre"]);
  assertEquals(ctx.householdSize, 1);
});

Deno.test("le vocabulaire des refus est FERMÉ, avec son statut", () => {
  assertEquals(Object.keys(GENERATION_REFUSAL_STATUS).sort(), [
    "household_frozen",
    "no_household",
    "not_authenticated",
    "not_owner",
  ]);
});
