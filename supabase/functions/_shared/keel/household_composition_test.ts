// FF-043 — LA RÉSOLUTION FOYER. Ce que ces tests protègent, dans l'ordre de ce
// qui coûte le plus cher quand ça casse:
//
//   * LE TRONC DIMENSIONNÉ SUR QUELQU'UN — une personne protégée par un
//     plancher qui mange la restriction d'un autre. C'est le défaut fatal que
//     deux designs candidats portaient;
//   * LE VERROU QUI DEVIENT UN SIGNAL — si un foyer sous verrou se distinguait
//     d'un foyer sans enveloppe, la table saurait que quelqu'un est protégé;
//   * L'OPINION QUI GOUVERNE L'ASSIETTE COMMUNE — les `discouraged` d'un coach
//     imposés à des élèves d'autres coachs;
//   * LE MESSAGE QUI NOMME QUELQU'UN — un refus qui transforme une contrainte
//     en accusation, et le fait à table.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  DELTA_CHANNELS,
  type HouseholdMember,
  householdLaneMode,
  memberDeltasPayload,
  referenceMemberId,
  resolveHousehold,
  TRUNK_UNSATISFIABLE,
  trunkSafety,
  trunkSizing,
  trunkUnsatisfiableMessage,
} from "./household_composition.ts";
import type { Envelope } from "./meal_envelope.ts";

const DEGRADED: Envelope = { mode: "per_portion", proteinPortionPerMeal: true };

function perKg(low: number, high: number): Envelope {
  return {
    mode: "per_kg",
    energy: { low, high },
    proteinFloorG: 160,
    proteinPerMealG: null,
    densityCeiling: 1.8,
  };
}

function member(over: Partial<HouseholdMember> & { memberId: string }): HouseholdMember {
  return {
    displayName: over.memberId,
    ageState: "adult",
    goal: "health",
    envelope: null,
    ...over,
  };
}

function resolve(members: HouseholdMember[], over: Record<string, unknown> = {}) {
  return resolveHousehold({
    members,
    declaredReferenceMemberId: null,
    composerMemberId: null,
    daysCovered: 7,
    ...over,
  });
}

// ---------------------------------------------------------------------------
// 1. LE VERROU DE LANE — le premier pas, jamais un `if` de fin
// ---------------------------------------------------------------------------

Deno.test("UN SEUL membre dégradé fait passer TOUTE la lane en per_portion", () => {
  // Le tronc qu'une personne protégée mange ne peut pas être dimensionné sur
  // les enveloppes de déficit de ses co-membres.
  const members = [
    member({ memberId: "a", envelope: perKg(2000, 2300) }),
    member({ memberId: "b", envelope: perKg(1800, 2000) }),
    member({ memberId: "c", envelope: DEGRADED }),
  ];
  assertEquals(householdLaneMode(members), "per_portion");
  const r = resolve(members);
  assertEquals(r.mode, "per_portion");
  assertEquals(r.trunk.energy, null);
  assertEquals(r.deltas, []);
});

Deno.test("un foyer sous verrou est INDISCERNABLE d'un foyer sans enveloppe", () => {
  // Sinon le verrou devient un signal: « pourquoi notre foyer n'a plus de
  // portions ? » se demande au premier repas, et la réponse désigne quelqu'un.
  const locked = resolve([
    member({ memberId: "a", envelope: perKg(2000, 2300) }),
    member({ memberId: "b", envelope: DEGRADED }),
  ]);
  const noEnvelopes = resolve([
    member({ memberId: "a", envelope: null }),
    member({ memberId: "b", envelope: null }),
  ]);
  // ── LE MODE EN FAIT PARTIE, ET C'EST LE POINT ───────────────────────────
  // La première version rendait `per_kg` pour le foyer sans enveloppe et
  // `per_portion` pour le foyer protégé: l'enum lui-même disait « quelqu'un
  // ici est protégé ». Les deux doivent coïncider, mode compris.
  const shape = (r: ReturnType<typeof resolve>) =>
    JSON.stringify({ mode: r.mode, trunk: r.trunk.energy, deltas: r.deltas });
  assertEquals(shape(locked), shape(noEnvelopes));
});

Deno.test("le verrou se lit sur le MODE, jamais sur un drapeau séparé", () => {
  // `envelopeFor` a déjà mélangé les deux populations (plancher TCA et corps
  // inconnu) dans `per_portion`. Relire un flag ici recréerait la distinction
  // que l'enveloppe existe pour effacer.
  const flagged = [member({ memberId: "a", envelope: DEGRADED })];
  assertEquals(householdLaneMode(flagged), "per_portion");
  // …et le mode MÉLANGE: un foyer sans aucune enveloppe calculable rend la
  // même valeur, donc l'enum ne désigne personne.
  assertEquals(householdLaneMode([member({ memberId: "a", envelope: null })]), "per_portion");
  assertEquals(
    householdLaneMode([member({ memberId: "a", envelope: perKg(2000, 2300) })]),
    "per_kg",
  );
});

// ---------------------------------------------------------------------------
// 2. LE RÉFÉRENT
// ---------------------------------------------------------------------------

Deno.test("le référent DÉCLARÉ gagne, le compositeur est le défaut", () => {
  const members = [
    member({ memberId: "a" }),
    member({ memberId: "b" }),
  ];
  assertEquals(referenceMemberId(members, "b", "a"), "b");
  assertEquals(referenceMemberId(members, null, "a"), "a");
  assertEquals(referenceMemberId(members, null, null), null);
  // Un référent déclaré qui n'habite plus là retombe sur le compositeur.
  assertEquals(referenceMemberId(members, "ghost", "a"), "a");
});

Deno.test("un MINEUR n'est jamais référent, ni déclaré ni par défaut", () => {
  const members = [
    member({ memberId: "kid", ageState: "minor", goal: null }),
    member({ memberId: "dad" }),
  ];
  assertEquals(referenceMemberId(members, "kid", null), null);
  assertEquals(referenceMemberId(members, null, "kid"), null);
  assertEquals(referenceMemberId(members, "kid", "dad"), "dad");
});

Deno.test("une bouche d'âge INCONNU peut être référente", () => {
  // La garde porte sur le mineur, pas sur l'ignorance: refuser aussi
  // `unknown` laisserait sans référent un foyer où personne n'a de date, et le
  // défaut « le compositeur » ne servirait plus à rien.
  const members = [member({ memberId: "a", ageState: "unknown" })];
  assertEquals(referenceMemberId(members, null, "a"), "a");
});

// ---------------------------------------------------------------------------
// 3. LE TRONC — le MIN, jamais le référent
// ---------------------------------------------------------------------------

Deno.test("le tronc prend le MIN des enveloppes adultes calculables", () => {
  const t = trunkSizing([
    member({ memberId: "a", envelope: perKg(2400, 2700) }),
    member({ memberId: "b", envelope: perKg(1800, 2000) }),
  ]);
  assertEquals(t.energy, { low: 1800, high: 2000 });
  assertEquals(t.adultsCounted, 2);
});

Deno.test("un adulte SANS enveloppe compte STANDARD, jamais réduit", () => {
  // Ne pas savoir n'est pas une raison de servir moins.
  const withUnknown = trunkSizing([
    member({ memberId: "a", envelope: perKg(2400, 2700) }),
    member({ memberId: "b", envelope: null }),
  ]);
  assertEquals(withUnknown.energy, { low: 2400, high: 2700 });
  assertEquals(withUnknown.adultsStandard, 1);
});

Deno.test("ZÉRO enveloppe calculable est le cas NOMINAL", () => {
  const t = trunkSizing([
    member({ memberId: "a", envelope: null }),
    member({ memberId: "b", envelope: null }),
  ]);
  assertEquals(t.energy, null);
  const r = resolve([member({ memberId: "a" }), member({ memberId: "b" })]);
  // Le MODE dit `per_portion` — non pas parce que quelqu'un est protégé, mais
  // parce que rien n'est dimensionnable. C'est le mélange voulu: le cas
  // nominal et le cas protégé se ressemblent, et c'est ce qui rend le second
  // illisible.
  assertEquals(r.mode, "per_portion");
  assertEquals(r.deltas, []);
});

Deno.test("un MINEUR ne pèse pas dans le tronc et ne reçoit aucun delta", () => {
  // `goal: null` par construction. Aucune enveloppe, aucun delta dérivé d'un
  // objectif — et surtout, aucune lecture de ses objectifs.
  const r = resolve([
    member({ memberId: "dad", envelope: perKg(1800, 2000) }),
    member({ memberId: "son", envelope: perKg(2600, 2900) }),
    member({ memberId: "kid", ageState: "minor", goal: null, envelope: perKg(9999, 9999) }),
  ]);
  assertEquals(r.trunk.energy, { low: 1800, high: 2000 }, "le mineur ne pèse pas");
  assert(!r.deltas.some((d) => d.memberId === "kid"));
  assert(!r.residualGaps.some((g) => g.memberId === "kid"));
});

// ---------------------------------------------------------------------------
// 4. LA SÉCURITÉ DU TRONC
// ---------------------------------------------------------------------------

Deno.test("les INTERDITS s'unissent sur le tronc, les DÉCONSEILLÉS non", () => {
  // Des opinions d'un coach n'ont pas prise sur l'assiette commune d'élèves
  // d'autres coachs — elles gouvernent les add-ons de leur propre membre.
  const s = trunkSafety([
    { memberId: "a", forbidden: ["peanut"], discouraged: ["seed oil"] },
    { memberId: "b", forbidden: ["shellfish"], discouraged: ["dairy"] },
  ]);
  assertEquals(s.forbidden, ["peanut", "shellfish"]);
  assertEquals(s.discouragedByMember.get("a"), ["seed oil"]);
  assertEquals(s.discouragedByMember.get("b"), ["dairy"]);
  // Aucun `discouraged` n'a fui dans l'union du tronc.
  for (const d of ["seed oil", "dairy"]) assert(!s.forbidden.includes(d));
});

Deno.test("le refus nomme des ALIMENTS, jamais des gens", () => {
  const msg = trunkUnsatisfiableMessage(["peanut", "shellfish", "gluten"]);
  assertEquals(TRUNK_UNSATISFIABLE, "household_trunk_unsatisfiable");
  assert(msg.includes("peanut") && msg.includes("gluten"));
  // Un message qui nomme un membre transforme une contrainte en accusation.
  for (const forbidden of ["Marc", "Léa", "coach", "fat_loss", "goal", "member"]) {
    assert(!msg.toLowerCase().includes(forbidden.toLowerCase()), forbidden);
  }
});

// ---------------------------------------------------------------------------
// 5. LES DELTAS — A3, et l'instrumentation qui l'armera
// ---------------------------------------------------------------------------

Deno.test("A3: il n'y a QUE deux canaux, et pas de slot de dressage", () => {
  assertEquals([...DELTA_CHANNELS], ["more_of_the_same", "usual_side"]);
  assert(!(DELTA_CHANNELS as readonly string[]).includes("plating_slot"));
});

Deno.test("un adulte au-dessus du tronc reçoit un add-on, jamais un plat séparé", () => {
  const r = resolve([
    member({ memberId: "small", envelope: perKg(1800, 2000) }),
    member({ memberId: "big", envelope: perKg(2800, 3100) }),
  ]);
  assertEquals(r.trunk.energy, { low: 1800, high: 2000 });
  const forBig = r.deltas.filter((d) => d.memberId === "big");
  assert(forBig.length > 0, "l'écart de 1000 kcal doit produire un add-on");
  for (const d of forBig) {
    assert(d.grams > 0);
    assert((DELTA_CHANNELS as readonly string[]).includes(d.channel));
  }
  // Celui qui EST le tronc ne reçoit rien: on ajoute, on ne retire jamais.
  assertEquals(r.deltas.filter((d) => d.memberId === "small"), []);
});

Deno.test("l'écart RÉSIDUEL est instrumenté — c'est la condition d'armement d'A3", () => {
  // Sans lui, la décision d'ajouter le slot de dressage se prendrait à
  // l'aveugle. C'est la contrainte que l'arbitrage impose au code.
  const r = resolve([
    member({ memberId: "small", envelope: perKg(1800, 2000) }),
    member({ memberId: "big", envelope: perKg(2800, 3100) }),
  ]);
  const gap = r.residualGaps.find((g) => g.memberId === "big");
  assert(gap !== undefined, "chaque adulte doit avoir son écart mesuré");
  assert(gap!.gapKcalPerDay >= 0, "on n'ôte jamais: l'écart ne peut pas être négatif");
});

Deno.test("un écart minuscule ne produit AUCUN delta", () => {
  const r = resolve([
    member({ memberId: "a", envelope: perKg(2000, 2300) }),
    member({ memberId: "b", envelope: perKg(2050, 2350) }),
  ]);
  assertEquals(r.deltas, [], "50 kcal ne valent pas une ligne sur une assiette");
  assertEquals(r.residualGaps.find((g) => g.memberId === "b")?.gapKcalPerDay, 50);
});

Deno.test("un MINEUR à table fait passer les add-ons en SERVICE FAMILIAL", () => {
  // Satter: l'adulte décide quoi/quand/où, l'enfant décide combien. Un add-on
  // dressé en cuisine devant un enfant est la divergence rendue visible.
  const r = resolve([
    member({ memberId: "small", envelope: perKg(1800, 2000) }),
    member({ memberId: "big", envelope: perKg(2800, 3100) }),
    member({ memberId: "kid", ageState: "minor", goal: null }),
  ]);
  assert(r.familyService);
  for (const d of r.deltas) assertEquals(d.moment, "plating");
});

Deno.test("le payload d'un delta ne porte NI raison, NI objectif, NI corps", () => {
  const r = resolve([
    member({ memberId: "small", envelope: perKg(1800, 2000) }),
    member({ memberId: "big", envelope: perKg(2800, 3100) }),
  ]);
  const payload = memberDeltasPayload(r.deltas);
  assert(payload.length > 0);
  for (const row of payload) {
    assertEquals(
      Object.keys(row).sort(),
      ["channel", "food_ref", "grams", "member_id", "moment"],
    );
    const json = JSON.stringify(row).toLowerCase();
    for (const leak of ["goal", "reason", "deficit", "weight", "flag", "restriction"]) {
      assert(!json.includes(leak), `« ${leak} » dans ${json}`);
    }
  }
});

Deno.test("sous verrou de lane, AUCUN delta n'est dimensionné", () => {
  const r = resolve([
    member({ memberId: "small", envelope: perKg(1800, 2000) }),
    member({ memberId: "big", envelope: perKg(2800, 3100) }),
    member({ memberId: "protected", envelope: DEGRADED }),
  ]);
  assertEquals(r.deltas, []);
  assertEquals(r.residualGaps, []);
});
