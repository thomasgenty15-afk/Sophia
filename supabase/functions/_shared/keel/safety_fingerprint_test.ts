// L'EMPREINTE DE CE QUI PROTÈGE — ce que ces tests empêchent.
//
//   1. QU'UN PLAN COMPOSÉ HIER S'ÉCRIVE SUR LE FOYER D'AUJOURD'HUI. Entre
//      l'aperçu et le tap il peut s'écouler 24 h; une allergie déclarée entre
//      les deux ne repasse par AUCUNE garde, puisque l'adoption n'appelle plus
//      le modèle. Une empreinte qui diffère doit refuser (`draft_stale`).
//   2. QUE LA GARDE BLOQUE TOUT. PostgREST ne promet aucun ordre: sans tri
//      canonique, deux chargements du même foyer donneraient deux empreintes,
//      donc un refus permanent — qui ressemble à une garde qui marche
//      (cicatrice `guards-need-a-passing-case`).
//   3. QUE LA SÉVÉRITÉ SOIT INVISIBLE. `preference` → `medical` ne change pas
//      la liste des allergènes; il change ce que la ceinture de sortie regarde.

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";

import {
  SAFETY_FINGERPRINT_VERSION,
  safetyFingerprintCanonical,
  safetyFingerprintOf,
} from "./safety_fingerprint.ts";
import type { SafetyFingerprintInput } from "./safety_fingerprint.ts";
import { sourceFamily } from "./source_family.ts";

const LEA = "11111111-1111-4111-8111-111111111111";
const MARC = "22222222-2222-4222-8222-222222222222";
const TOM = "33333333-3333-4333-8333-333333333333";

const household: SafetyFingerprintInput = {
  lane: "household",
  members: [
    {
      memberId: LEA,
      ageState: "adult",
      gender: "female",
      regime: "vegetarian",
      goal: "maintenance",
      paceKgPerWeek: 0.5,
      away: [{ day: "wed", slot: "lunch" }],
      eatingRhythm: { breakfast: "normal", lunch: "normal", dinner: "light" },
      lightSlots: ["dinner"],
      body: {
        heightCm: 168,
        weightKg: 62,
        ageYears: 34,
        activityLevel: "moderate",
        activityAxes: { walking: 3, sport: 2 },
        appetite: "small",
      },
      allergies: [
        { ref: "peanut", label: "arachide", severity: "medical" },
        { ref: "gluten", label: "gluten", severity: "preference" },
      ],
    },
    { memberId: MARC, ageState: "adult", gender: "male", regime: null, allergies: [] },
    {
      memberId: TOM,
      ageState: "minor",
      gender: "male",
      regime: null,
      allergies: [{ ref: "milk", label: "lait", severity: "medical" }],
    },
  ],
  houseRules: [
    { memberId: TOM, label: "pas de sodas" },
    { memberId: null, label: "pas de porc" },
  ],
  ownerConstraints: [
    { kind: "allergy", ref: "peanut", label: "arachide", severity: "medical" },
  ],
};

// ===========================================================================
// 1. LE CAS QUI PASSE
// ===========================================================================

Deno.test("LE CAS QUI PASSE: deux chargements identiques s'accordent", async () => {
  const a = await safetyFingerprintOf(household);
  const b = await safetyFingerprintOf(structuredClone(household) as SafetyFingerprintInput);
  assertEquals(a, b);
  assert(/^[0-9a-f]{64}$/.test(a), a);
});

// ===========================================================================
// 2. L'ORDRE N'EST PAS UNE DIFFÉRENCE
// ===========================================================================

Deno.test("⛔ LE MÊME ROSTER DANS UN AUTRE ORDRE DONNE LA MÊME EMPREINTE", async () => {
  const shuffled: SafetyFingerprintInput = {
    ...household,
    members: [...(household.members ?? [])].reverse().map((m) => ({
      ...m,
      allergies: [...(m.allergies ?? [])].reverse(),
    })),
    houseRules: [...(household.houseRules ?? [])].reverse(),
  };
  assertEquals(await safetyFingerprintOf(shuffled), await safetyFingerprintOf(household));
});

Deno.test("la casse et les espaces de bord ne sont pas des changements de foyer", async () => {
  const noisy: SafetyFingerprintInput = {
    ...household,
    members: (household.members ?? []).map((m) => ({
      ...m,
      regime: m.regime ? ` ${m.regime.toUpperCase()} ` : m.regime,
      allergies: (m.allergies ?? []).map((a) => ({ ...a, label: ` ${a.label?.toUpperCase()} ` })),
    })),
  };
  assertEquals(await safetyFingerprintOf(noisy), await safetyFingerprintOf(household));
});

// ===========================================================================
// 3. CE QUI DOIT FAIRE BOUGER L'EMPREINTE
// ===========================================================================

Deno.test("⛔ UNE SÉVÉRITÉ QUI CHANGE CHANGE L'EMPREINTE", async () => {
  const harder: SafetyFingerprintInput = {
    ...household,
    members: (household.members ?? []).map((m) =>
      m.memberId !== LEA ? m : {
        ...m,
        allergies: (m.allergies ?? []).map((a) =>
          a.ref === "gluten" ? { ...a, severity: "medical" } : a
        ),
      }
    ),
  };
  assertNotEquals(await safetyFingerprintOf(harder), await safetyFingerprintOf(household));
});

Deno.test("⛔ UNE BOUCHE RETIRÉE CHANGE L'EMPREINTE", async () => {
  const smaller: SafetyFingerprintInput = {
    ...household,
    members: (household.members ?? []).filter((m) => m.memberId !== TOM),
  };
  assertNotEquals(await safetyFingerprintOf(smaller), await safetyFingerprintOf(household));
});

Deno.test("une allergie AJOUTÉE change l'empreinte", async () => {
  const wider: SafetyFingerprintInput = {
    ...household,
    members: (household.members ?? []).map((m) =>
      m.memberId !== MARC
        ? m
        : { ...m, allergies: [{ ref: "shellfish", label: "crustacés", severity: "medical" }] }
    ),
  };
  assertNotEquals(await safetyFingerprintOf(wider), await safetyFingerprintOf(household));
});

Deno.test("un régime, un âge ou un sexe qui change, change l'empreinte", async () => {
  const base = await safetyFingerprintOf(household);
  for (const patch of [{ regime: "vegan" }, { ageState: "minor" }, { gender: "male" }]) {
    const moved: SafetyFingerprintInput = {
      ...household,
      members: (household.members ?? []).map((m) => (m.memberId === LEA ? { ...m, ...patch } : m)),
    };
    assertNotEquals(await safetyFingerprintOf(moved), base, JSON.stringify(patch));
  }
});

Deno.test("objectif, présence, rythme et dîner léger périment chacun le brouillon", async () => {
  const base = await safetyFingerprintOf(household);
  for (
    const patch of [
      { goal: "weight_loss" },
      { away: [{ day: "thu", slot: "dinner" }] },
      { eatingRhythm: { breakfast: "small", lunch: "normal", dinner: "normal" } },
      { lightSlots: [] },
    ]
  ) {
    const moved: SafetyFingerprintInput = {
      ...household,
      members: (household.members ?? []).map((m) =>
        m.memberId === LEA ? { ...m, ...patch } : m
      ),
    };
    assertNotEquals(await safetyFingerprintOf(moved), base, JSON.stringify(patch));
  }
});

Deno.test(
  "⟳ BÊTA 2C — L'ALLURE PÉRIME LE BROUILLON, comme la direction qu'elle chiffre",
  async () => {
    // ⛔ LE DÉFAUT R3, EN UNE LIGNE. `goal` disait « perdre » des deux côtés du
    // tap; `target_pace_kg_per_week` passait de 0,5 à 0,8 sans que rien ne le
    // voie. Les cibles, elles, sont GELÉES avec le brouillon: la personne
    // activait donc des portions calculées contre la demande d'avant.
    const base = await safetyFingerprintOf(household);
    for (const pace of [0.8, 0.25, null]) {
      const moved: SafetyFingerprintInput = {
        ...household,
        members: (household.members ?? []).map((m) =>
          m.memberId === LEA ? { ...m, paceKgPerWeek: pace } : m
        ),
      };
      assertNotEquals(
        await safetyFingerprintOf(moved),
        base,
        `allure ${String(pace)}`,
      );
    }
  },
);

Deno.test(
  "une allure ABSENTE et une allure `null` sont le même état, pas deux",
  async () => {
    // « rien réglé » n'est pas une valeur: `paceByMember` n'entre que sur un
    // nombre utilisable, et le champ manquant doit donner la même empreinte.
    const sansChamp: SafetyFingerprintInput = {
      ...household,
      members: (household.members ?? []).map((m) => {
        if (m.memberId !== LEA) return m;
        const { paceKgPerWeek: _ignore, ...reste } = m;
        return reste;
      }),
    };
    const nul: SafetyFingerprintInput = {
      ...household,
      members: (household.members ?? []).map((m) =>
        m.memberId === LEA ? { ...m, paceKgPerWeek: null } : m
      ),
    };
    assertEquals(
      await safetyFingerprintOf(sansChamp),
      await safetyFingerprintOf(nul),
    );
  },
);

Deno.test(
  "⛔ LE CÂBLAGE: le handler passe `paceByMember` à l'empreinte, pas une seconde lecture",
  async () => {
    const src = await sourceFamily(
      new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
    );
    // Le constructeur `liveSafety` est le SEUL objet rangé avec le brouillon
    // (`p_safety_fingerprint`) et relu au tap: s'il ne cite pas la table des
    // allures, l'empreinte ne peut pas la contenir.
    assert(
      src.includes("paceKgPerWeek: paceByMember.get(member.memberId) ?? null,"),
      "liveSafety ne porte plus l'allure",
    );
    // ⚠️ DEUX `select` ET PAS TROIS. La ligne du foyer, puis le compte quand il
    // y en a un — `paceByMember` les fusionne une fois pour toutes. Un troisième
    // lecteur rendrait deux allures pour une même demande: la cible dirait l'une,
    // l'empreinte l'autre, et le désaccord ne se verrait nulle part.
    const selects = src.match(/\.select\("[^"]*target_pace_kg_per_week[^"]*"\)/g) ??
      [];
    assertEquals(
      selects.length,
      2,
      "une lecture par table (household_members, student_goals), pas plus",
    );
  },
);

Deno.test("mensurations, activité et appétit périment chacun le brouillon", async () => {
  const base = await safetyFingerprintOf(household);
  const lea = (household.members ?? []).find((m) => m.memberId === LEA)!;
  for (
    const bodyPatch of [
      { weightKg: 63 },
      { heightCm: 169 },
      { ageYears: 35 },
      { activityLevel: "high" },
      { activityAxes: { walking: 4, sport: 2 } },
      { appetite: "large" },
    ]
  ) {
    const moved: SafetyFingerprintInput = {
      ...household,
      members: (household.members ?? []).map((m) =>
        m.memberId === LEA ? { ...m, body: { ...lea.body, ...bodyPatch } } : m
      ),
    };
    assertNotEquals(await safetyFingerprintOf(moved), base, JSON.stringify(bodyPatch));
  }
});

Deno.test("un interdit de maison retiré change l'empreinte", async () => {
  const fewer: SafetyFingerprintInput = {
    ...household,
    houseRules: (household.houseRules ?? []).filter((r) => r.label !== "pas de porc"),
  };
  assertNotEquals(await safetyFingerprintOf(fewer), await safetyFingerprintOf(household));
});

Deno.test("une contrainte dure du titulaire retirée change l'empreinte", async () => {
  const fewer: SafetyFingerprintInput = { ...household, ownerConstraints: [] };
  assertNotEquals(await safetyFingerprintOf(fewer), await safetyFingerprintOf(household));
});

// ===========================================================================
// 4. LA LANE ET LE MILLÉSIME
// ===========================================================================

Deno.test("solo et foyer ne se confondent pas, même sur des entrées identiques", async () => {
  const solo: SafetyFingerprintInput = {
    lane: "solo",
    ownerConstraints: household.ownerConstraints,
  };
  const asHousehold: SafetyFingerprintInput = {
    lane: "household",
    ownerConstraints: household.ownerConstraints,
  };
  assertNotEquals(await safetyFingerprintOf(solo), await safetyFingerprintOf(asHousehold));
});

Deno.test("un foyer VIDE est une mesure, pas une absence de mesure", async () => {
  const empty = await safetyFingerprintOf({ lane: "household" });
  assertEquals(empty, await safetyFingerprintOf({ lane: "household", members: [] }));
  assertNotEquals(empty, await safetyFingerprintOf(household));
});

Deno.test("le millésime entre dans la forme canonique", () => {
  const canonical = safetyFingerprintCanonical({ lane: "solo" });
  assert(
    canonical.includes(SAFETY_FINGERPRINT_VERSION),
    "sans millésime, une entrée de sécurité ajoutée plus tard laisserait les vieux brouillons s'adopter",
  );
});
