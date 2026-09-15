/**
 * ⟳ 2026-09-15 — LE GEL COUPE AUSSI LES CRONS (trou n° 7 de FF-049).
 *
 * Trois choses à tenir : la lecture est stricte (seul `frozen: true` gèle),
 * l'illisible passe et se compte, et les DEUX crons de production sont
 * branchés — avant de produire, pas après.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  HOUSEHOLD_COVERAGE_UNREADABLE,
  HOUSEHOLD_FROZEN_SKIP,
  householdProductionGate,
  readHouseholdCoverage,
} from "./household_production_gate.ts";

Deno.test("gel des crons — un foyer gelé se lit `frozen`, et rien d'autre ne gèle", () => {
  const gele = readHouseholdCoverage({
    in_household: true,
    household_id: "h1",
    role: "owner",
    // ⚠️ pas la date de fin d'essai ici : la porte ne la lit pas, et une garde
    // du dépôt interdit sa relecture hors du chemin de facturation.
    covered: false,
    frozen: true,
  });
  assertEquals(gele.frozen, true);
  assertEquals(gele.unreadable, false);
  assertEquals(gele.householdId, "h1");

  const couvert = readHouseholdCoverage({ in_household: true, household_id: "h1", covered: true, frozen: false });
  assertEquals(couvert.frozen, false);
  // Hors foyer : la majorité des comptes, jamais gelés.
  const horsFoyer = readHouseholdCoverage({ in_household: false, frozen: false });
  assertEquals(horsFoyer.frozen, false);
  assertEquals(horsFoyer.inHousehold, false);
});

Deno.test("gel des crons — l'illisible ne gèle PAS, et il se dit", () => {
  for (const raw of [null, undefined, "frozen", 42, [], { frozen: "true" }, { in_household: true }]) {
    const g = readHouseholdCoverage(raw);
    assertEquals(g.frozen, false, `${JSON.stringify(raw)} ne doit pas geler`);
    assertEquals(g.unreadable, true, `${JSON.stringify(raw)} est illisible`);
  }
});

Deno.test("gel des crons — la porte lit la RPC du serveur, et une erreur de lecture passe en le comptant", async () => {
  const appels: Array<{ fn: string; args?: Record<string, unknown> }> = [];
  const db = (reponse: { data: unknown; error: unknown }) => ({
    rpc(fn: string, args?: Record<string, unknown>) {
      appels.push({ fn, args });
      return Promise.resolve(reponse);
    },
  });
  const gele = await householdProductionGate(db({ data: { in_household: true, frozen: true }, error: null }), "u1");
  assertEquals(gele.frozen, true);
  assertEquals(appels[0], { fn: "keel_household_coverage_for_user", args: { p_user: "u1" } });

  const erreur = await householdProductionGate(db({ data: null, error: { message: "boom" } }), "u1");
  assertEquals(erreur.frozen, false);
  assertEquals(erreur.unreadable, true);

  const jette = await householdProductionGate({
    rpc() {
      throw new Error("réseau");
    },
  }, "u1");
  assertEquals(jette.frozen, false);
  assertEquals(jette.unreadable, true);
});

// ── LE CÂBLAGE : les deux crons de production passent par la porte ─────────

const SOURCES: Record<string, string> = {
  weekly: Deno.readTextFileSync(new URL("../../keel-weekly-flow-v1/index.ts", import.meta.url)),
  reengage: Deno.readTextFileSync(new URL("../../keel-reengage-v1/index.ts", import.meta.url)),
};

Deno.test("câblage — les deux crons importent la porte et comptent le saut sous la MÊME clé", () => {
  for (const [nom, src] of Object.entries(SOURCES)) {
    assert(
      src.includes('from "../_shared/keel/household_production_gate.ts"'),
      `${nom}: n'importe pas la porte`,
    );
    assert(src.includes("await householdProductionGate(admin,"), `${nom}: n'appelle pas la porte`);
    assert(src.includes(`[${"HOUSEHOLD_FROZEN_SKIP"}]`), `${nom}: ne compte pas le saut sous HOUSEHOLD_FROZEN_SKIP`);
    assert(src.includes(`[${"HOUSEHOLD_COVERAGE_UNREADABLE"}]`), `${nom}: ne compte pas l'illisible`);
  }
  assertEquals(HOUSEHOLD_FROZEN_SKIP, "household_frozen");
  assertEquals(HOUSEHOLD_COVERAGE_UNREADABLE, "household_coverage_unreadable");
});

Deno.test("câblage — la porte est AVANT la production, pas après", () => {
  const weekly = SOURCES.weekly;
  const porteW = weekly.indexOf("await householdProductionGate(admin,");
  assert(porteW > 0 && porteW < weekly.indexOf("resolveStudentFollowing(admin"), "weekly: la porte doit précéder le calcul du bilan");
  const reengage = SOURCES.reengage;
  const porteR = reengage.indexOf("await householdProductionGate(admin,");
  assert(porteR > 0 && porteR < reengage.indexOf("openReengagementEpisode(admin"), "reengage: la porte doit précéder l'ouverture d'un épisode");
  // Et elle mord AUSSI en `dryRun` : un compte gelé n'est pas « armé » pour une relance à blanc.
  assert(porteR < reengage.indexOf("if (dryRun) {"), "reengage: la porte doit précéder le tour à blanc");
});
