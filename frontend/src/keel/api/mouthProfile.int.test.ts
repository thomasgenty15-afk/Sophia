import { describe, expect, it } from "vitest";

import {
  type MouthToPersist,
  type MouthWriters,
  persistMouth,
  shakerIntakeJson,
} from "./mouthProfile";
import {
  emptyMouthDraft,
  type MouthFormDraft,
  mouthToPersist,
} from "../lib/mouthForm";
import { parseFixedIntakes } from "../../../../supabase/functions/_shared/keel/fixed_intakes.ts";

// ===========================================================================
// L5-A (2026-08-18) — CE QUI PART EN BASE, ET DANS QUEL ORDRE
//
// ⚠️ AUCUN CLIENT SUPABASE ICI. Les six portes sont INJECTÉES (`MouthWriters`),
// donc ce fichier prouve l'ORCHESTRATION — l'ordre des marches et l'arrêt à la
// première qui casse — sans réseau et sans fixture. C'est la seule façon de
// tenir « la marche 3 ne part jamais avant la marche 2 »: une orchestration
// dont on ne peut pas prouver l'ordre est une orchestration dont on découvre
// l'ordre en production.
// ===========================================================================

const TODAY = "2026-08-18";
const ADULT_BIRTH = "1990-05-04";

const OK = { ok: true, reason: "" };

/** Enregistre chaque appel, dans l'ordre, et rend ce qu'on lui dit. */
function spyWriters(
  overrides: Partial<Record<keyof MouthWriters, unknown>> = {},
): { writers: MouthWriters; calls: string[] } {
  const calls: string[] = [];
  const make = (name: keyof MouthWriters) => (...args: unknown[]) => {
    calls.push(name);
    const override = overrides[name];
    void args;
    return Promise.resolve(
      (override ?? { ...OK, member_id: "m-1" }) as {
        ok: boolean;
        reason: string;
      },
    );
  };
  return {
    calls,
    writers: {
      addMember: make("addMember") as MouthWriters["addMember"],
      setTarget: make("setTarget") as MouthWriters["setTarget"],
      setBody: make("setBody") as MouthWriters["setBody"],
      setHabits: make("setHabits") as MouthWriters["setHabits"],
      addAllergy: make("addAllergy") as MouthWriters["addAllergy"],
      addRestriction: make("addRestriction") as MouthWriters["addRestriction"],
      setDiet: make("setDiet") as MouthWriters["setDiet"],
    },
  };
}

const MOUTH: MouthToPersist = {
  memberId: null,
  firstName: "Zoe",
  birthDate: ADULT_BIRTH,
  goal: "fat_loss",
  heightCm: 165,
  weightKg: 60,
  gender: "female",
  activityLevel: "sedentary",
  targetWeightKg: 55,
  paceKgPerWeek: 0.45,
  habits: [{ slot: "breakfast", kind: "own_usual", usual: "une pomme" }],
  allergies: ["peanut"],
  dislikes: ["champignons"],
  diet: "vegetarian",
};

function draftOf(patch: Partial<MouthFormDraft>): MouthFormDraft {
  return { ...emptyMouthDraft(), ...patch };
}

// ---------------------------------------------------------------------------
// L'ORDRE DES MARCHES
// ---------------------------------------------------------------------------

describe("l'ordre des écritures est une garde", () => {
  it("la bouche EXISTE avant tout le reste, et le CORPS avant la cible", () => {
    const { writers, calls } = spyWriters();
    return persistMouth(MOUTH, writers).then((res) => {
      expect(res.ok).toBe(true);
      expect(calls).toEqual([
        "addMember",
        // ⚠️ LE CORPS PORTE LE CRAN D'ACTIVITÉ dans le même geste depuis le lot
        // L0: une seule porte, l'ancienne signature à quatre a été droppée.
        "setBody",
        // La cible EXIGE que `goal` soit déjà en base, sinon
        // `target_needs_direction`.
        "setTarget",
        "setHabits",
        "addAllergy",
        "addRestriction",
        "setDiet",
      ]);
    });
  });

  it("le cran d'activité part AVEC le corps, pas dans un appel à part", async () => {
    const seen: unknown[][] = [];
    const { writers } = spyWriters();
    writers.setBody = ((...args: unknown[]) => {
      seen.push(args);
      return Promise.resolve(OK);
    }) as MouthWriters["setBody"];
    await persistMouth(MOUTH, writers);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(["m-1", 165, 60, "female", "sedentary"]);
  });

  it("⚠️ il S'ARRÊTE à la première marche qui casse", async () => {
    const { writers, calls } = spyWriters({
      setBody: { ok: false, reason: "bad_weight" },
    });
    const res = await persistMouth(MOUTH, writers);
    expect(res).toEqual({ ok: false, reason: "bad_weight" });
    // Rien après le corps n'a été tenté: une fiche à moitié écrite dont
    // personne ne sait ce qui manque est pire qu'un refus.
    expect(calls).toEqual(["addMember", "setBody"]);
  });

  it("un `ok` SANS `member_id` est un ÉCHEC, pas un succès sans suite", async () => {
    // Sans ça, les cinq marches suivantes viseraient la chaîne vide, que la
    // base lirait `not_a_member` — cinq refus au lieu d'une cause.
    const { writers, calls } = spyWriters({ addMember: { ...OK } });
    const res = await persistMouth(MOUTH, writers);
    expect(res).toEqual({ ok: false, reason: "no_member_id" });
    expect(calls).toEqual(["addMember"]);
  });

  it("une bouche qui EXISTE déjà n'est pas recréée", async () => {
    const { writers, calls } = spyWriters();
    await persistMouth({ ...MOUTH, memberId: "m-9" }, writers);
    expect(calls).not.toContain("addMember");
    expect(calls[0]).toBe("setBody");
  });

  it("le régime n'est tenté QUE s'il a été répondu", async () => {
    const { writers, calls } = spyWriters();
    await persistMouth({ ...MOUTH, diet: null }, writers);
    expect(calls).not.toContain("setDiet");
  });

  it("les habitudes s'écrivent MÊME VIDES — sinon on ne peut rien retirer", async () => {
    const { writers, calls } = spyWriters();
    await persistMouth({ ...MOUTH, habits: [] }, writers);
    expect(calls).toContain("setHabits");
  });
});

// ---------------------------------------------------------------------------
// DU BROUILLON AU PAYLOAD
// ---------------------------------------------------------------------------

describe("le brouillon traduit en ce qui part", () => {
  const FULL = draftOf({
    firstName: "  Zoe  ",
    birthDate: ADULT_BIRTH,
    goal: "fat_loss",
    targetWeightKg: "55",
    paceKgPerWeek: "0.30",
    heightCm: "165",
    weightKg: "60",
    gender: "female",
    activityLevel: "sedentary",
    habits: { breakfast: "  une pomme ", lunch: "   " },
    allergies: ["peanut"],
    dislikes: ["champignons"],
    diet: "vegetarian",
  });

  it("le prénom est TAILLÉ, et la date part telle quelle", () => {
    const out = mouthToPersist(FULL, TODAY);
    expect(out.firstName).toBe("Zoe");
    expect(out.birthDate).toBe(ADULT_BIRTH);
  });

  it("une date VIDE part en `null`, jamais en chaîne vide", () => {
    // La porte SQL prend une `date`, et `''::date` lève.
    expect(mouthToPersist(draftOf({}), TODAY).birthDate).toBeNull();
  });

  it("une habitude BLANCHE n'est pas une habitude", () => {
    // La base refuse un `usual` vide (`bad_slots`), et surtout: un champ laissé
    // blanc veut dire « rien à dire », pas « elle ne mange rien ».
    expect(mouthToPersist(FULL, TODAY).habits).toEqual([
      { slot: "breakfast", kind: "own_usual", usual: "une pomme" },
    ]);
  });

  it("`diet` non répondu part en `null` — et `omnivore` est une RÉPONSE", () => {
    expect(mouthToPersist(draftOf({}), TODAY).diet).toBeNull();
    expect(
      mouthToPersist(draftOf({ diet: "omnivore" }), TODAY).diet,
    ).toBe("omnivore");
  });

  it("le cran non coché part en `null` — aucun défaut", () => {
    expect(mouthToPersist(draftOf({}), TODAY).activityLevel).toBeNull();
  });

  it("la cible et le rythme suivent la direction", () => {
    const out = mouthToPersist(FULL, TODAY);
    expect(out.targetWeightKg).toBe(55);
    expect(out.paceKgPerWeek).toBe(0.3);
    const held = mouthToPersist({ ...FULL, goal: "maintenance" }, TODAY);
    expect(held.targetWeightKg).toBeNull();
    expect(held.paceKgPerWeek).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// LE SHAKER, RELU PAR LE MOTEUR
// ---------------------------------------------------------------------------

describe("le shaker est relisible par le parseur du moteur", () => {
  const SHAKER = {
    label: "mon shaker",
    servingGrams: 30,
    proteinGPerServing: 24,
    energyKcalPerServing: 120,
    slot: null,
  };

  it("⚠️ `parseFixedIntakes` le GARDE, il ne le jette pas", () => {
    // C'est le seul test qui compte ici: un apport déclaré dont il manque un
    // nombre est écarté EN SILENCE, et la déclaration disparaît sans trace.
    const parsed = parseFixedIntakes([shakerIntakeJson(SHAKER)]);
    expect(parsed.discarded).toBe(0);
    expect(parsed.intakes).toHaveLength(1);
  });

  it("il porte les DEUX nombres, et la branche `declared`", () => {
    const parsed = parseFixedIntakes([shakerIntakeJson(SHAKER)]);
    const intake = parsed.intakes[0];
    expect(intake.label).toBe("mon shaker");
    // ⚠️ `declared` ET PAS `referential`: le référentiel ne connaît AUCUNE
    // poudre de protéine (mesuré: 911 références, zéro whey), et n'en
    // connaîtrait qu'une moyenne. Le pot de la personne est meilleur.
    if (!("nutrition" in intake) || intake.nutrition !== "declared") {
      throw new Error("attendu: une branche `declared`");
    }
    expect(intake.proteinGPerServing).toBe(24);
    expect(intake.energyKcalPerServing).toBe(120);
  });

  it("sans moment nommé, il est `loose` — il ne remplace RIEN", () => {
    const intake = parseFixedIntakes([shakerIntakeJson(SHAKER)]).intakes[0];
    expect(intake.placement).toBe("loose");
  });

  it("avec un moment nommé, il NE REMPLACE toujours PAS le repas (A5)", () => {
    // « Un shaker au goûter » nomme un moment et ne remplace rien. Le défaut
    // inverse punirait d'un repas en moins quelqu'un qui décrit honnêtement ce
    // qu'il mange déjà — et le pop-up ne pose pas la question, parce qu'elle
    // demande un arbitrage de composition à quelqu'un qui n'a pas vu de plan.
    const intake = parseFixedIntakes([
      shakerIntakeJson({ ...SHAKER, slot: "snack_pm" }),
    ]).intakes[0];
    if (intake.placement !== "at_slot") {
      throw new Error("attendu: un moment nommé");
    }
    expect(intake.replacesMeal).toBe(false);
  });

  it("son slug ne peut pas MASQUER un aliment du référentiel", () => {
    // `food_composition_refs.slug` vient de CIQUAL: aucune entrée ne commence
    // par `declared_`.
    const intake = parseFixedIntakes([shakerIntakeJson(SHAKER)]).intakes[0];
    expect(intake.foodRef.startsWith("declared_")).toBe(true);
  });
});
