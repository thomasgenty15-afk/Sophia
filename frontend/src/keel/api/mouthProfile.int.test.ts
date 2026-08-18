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
import { ACTIVITY_LEVELS } from "../../../../supabase/functions/_shared/keel/tokens.ts";

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
      // D1 (2026-08-18) — LA SEPTIÈME PORTE. Le harnais la BRANCHE par défaut:
      // « appelée avec quoi » est le sujet des tests d'en bas, et « jamais
      // appelée sans shaker » n'a de sens que si elle était appelable.
      setShaker: make("setShaker") as NonNullable<MouthWriters["setShaker"]>,
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
  shaker: null,
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

  it("⛔ …ET LE CRAN COCHÉ ARRIVE VRAIMENT — le cas qui PASSE", () => {
    // ⚠️ L5-B (2026-08-18) — LA MOITIÉ QUI MANQUAIT.
    //
    // L'assertion voisine ne prouve que l'ABSENCE: elle reste verte si le
    // traducteur écrit `activityLevel: null` en dur. Mesuré, exactement comme
    // ça: remplacer la ligne de `mouthToPersist` par `activityLevel: null`
    // laissait les 97 tests du lot VERTS. Le cran serait alors collecté à
    // l'écran, retenu par `missingRequiredBlocks` — donc RÉCLAMÉ à la personne
    // — et jeté avant la base: le champ décoratif exact que ce lot existe pour
    // supprimer, et que la conception appelle « le trou n°1 du produit »
    // (sans lui, `energy_target.ts` multiplie un métabolisme par une constante
    // devinée et « produit une cible fausse avec l'aplomb d'un tableau »).
    //
    // Les QUATRE crans, pas un seul: une correspondance codée sur une valeur
    // ne dit rien des trois autres.
    for (const level of ACTIVITY_LEVELS) {
      expect(mouthToPersist(draftOf({ activityLevel: level }), TODAY)
        .activityLevel).toBe(level);
    }
  });

  it("⛔ les DÉGOÛTS et les ALLERGIES restent DEUX listes distinctes", () => {
    // ⚠️ L5-B (2026-08-18). Elles partent sur deux portes différentes
    // (`addAllergy` / `addRestriction`), toutes deux clées sur `member_id` — et
    // c'est LA décision du bloc 6: `food_preferences` est indexée sur `user_id`,
    // donc inatteignable pour un enfant, le cas nominal du foyer. Les confondre
    // ferait d'un dégoût une allergie, c'est-à-dire d'une préférence un fait
    // médical que le produit traite en fail-closed.
    const out = mouthToPersist(FULL, TODAY);
    expect(out.allergies).toEqual(["peanut"]);
    expect(out.dislikes).toEqual(["champignons"]);
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

// ---------------------------------------------------------------------------
// D1 (2026-08-18) — LE SHAKER TRAVERSE, DU CHAMP TAPÉ À LA LIGNE DU MOTEUR
//
// ⚠️ CE BLOC EST LA MOITIÉ QUI MANQUAIT, ET LE TROU ÉTAIT MESURÉ:
// `mouthToPersist` JETAIT le shaker avant l'écriture, et `addShakerToOwnIntakes`
// avait ZÉRO appelant. Le formulaire demandait donc ses protéines et ses
// calories à quelqu'un pour rien. Les tests d'au-dessus prouvaient que la forme
// écrite est RELISIBLE; aucun ne prouvait qu'elle est ÉCRITE.
// ---------------------------------------------------------------------------

describe("le shaker saisi ARRIVE à la porte, tel qu'il a été tapé", () => {
  const TYPED: Partial<MouthFormDraft> = {
    firstName: "Zoe",
    birthDate: ADULT_BIRTH,
    goal: "muscle_gain",
    heightCm: "165",
    weightKg: "60",
    gender: "female",
    activityLevel: "trains_hard",
    shaker: {
      label: "  mon shaker  ",
      servingGrams: "30",
      proteinGPerServing: "24",
      energyKcalPerServing: "120",
      slot: "snack_pm",
    },
  };

  it("⛔ LE TRADUCTEUR NE LE JETTE PLUS — les trois nombres partent", () => {
    const out = mouthToPersist(draftOf(TYPED), TODAY);
    expect(out.shaker).toEqual({
      // Le libellé est TAILLÉ, comme le prénom: c'est le nom que la consigne
      // dira à la personne, pas une chaîne à comparer.
      label: "mon shaker",
      servingGrams: 30,
      proteinGPerServing: 24,
      energyKcalPerServing: 120,
      slot: "snack_pm",
    });
  });

  it("BOUT À BOUT — du champ tapé à la ligne que le MOTEUR relit", async () => {
    // La chaîne entière, sans réseau: brouillon → payload → porte injectée →
    // jsonb → parseur du moteur. C'est le seul test qui dit que la donnée
    // TRAVERSE; chaque maillon pris seul reste vert sur un maillon suivant mort.
    let arrived: unknown = null;
    const { writers } = spyWriters();
    const res = await persistMouth(
      mouthToPersist(draftOf(TYPED), TODAY),
      {
        ...writers,
        setShaker: (shaker) => {
          arrived = shakerIntakeJson(shaker);
          return Promise.resolve({ ok: true, reason: "" });
        },
      },
    );
    expect(res.ok).toBe(true);

    const parsed = parseFixedIntakes([arrived]);
    expect(parsed.discarded).toBe(0);
    const intake = parsed.intakes[0];
    if (!("nutrition" in intake) || intake.nutrition !== "declared") {
      throw new Error("attendu: une branche `declared`");
    }
    expect(intake.label).toBe("mon shaker");
    expect(intake.proteinGPerServing).toBe(24);
    expect(intake.energyKcalPerServing).toBe(120);
    // A5 — il nomme un moment et ne le PREND pas.
    if (intake.placement !== "at_slot") {
      throw new Error("attendu: un moment nommé");
    }
    expect(intake.slot).toBe("snack_pm");
    expect(intake.replacesMeal).toBe(false);
  });

  it("le shaker part APRÈS les habitudes — même bloc, deux portes", async () => {
    const { writers, calls } = spyWriters();
    await persistMouth(mouthToPersist(draftOf(TYPED), TODAY), writers);
    expect(calls.indexOf("setShaker")).toBe(calls.indexOf("setHabits") + 1);
  });

  it("PAS DE SHAKER = PAS D'APPEL — un `null` n'écrit pas une ligne vide", async () => {
    const { writers, calls } = spyWriters();
    await persistMouth(MOUTH, writers);
    expect(calls).not.toContain("setShaker");
  });

  it("⚠️ LA FRONTIÈRE — un shaker INCOMPLET est une habitude, pas un apport", async () => {
    // Un apport fixe est une quantité CONNUE; une habitude est une tendance.
    // Inventer la portion moyenne d'une poudre écrirait un fait que personne
    // n'a pesé — et le référentiel n'en connaît AUCUNE (911 références, zéro
    // whey), donc il n'y aurait même pas de moyenne à emprunter.
    for (
      const hole of [
        { servingGrams: "" },
        { proteinGPerServing: "" },
        { energyKcalPerServing: "" },
        { label: "   " },
        // Une portion de zéro gramme n'est pas une portion: rien ne se ramène
        // à 100 g, et la ligne ne peut rien peser.
        { servingGrams: "0" },
      ]
    ) {
      const draft = draftOf({
        ...TYPED,
        shaker: { ...TYPED.shaker!, ...hole },
      });
      expect(mouthToPersist(draft, TODAY).shaker).toBeNull();
      const { writers, calls } = spyWriters();
      await persistMouth(mouthToPersist(draft, TODAY), writers);
      expect(calls).not.toContain("setShaker");
    }
  });

  it("un shaker SANS PORTE LÈVE — jamais un silence", async () => {
    // C'est un défaut de CÂBLAGE: le pop-up ne montre le champ qu'à qui a un
    // compte. Y arriver veut dire qu'un écran a monté la fenêtre avec
    // `hasAccount: true` sans brancher la porte — et le silence est exactement
    // l'état d'avant ce lot.
    const { writers } = spyWriters();
    await expect(
      persistMouth(mouthToPersist(draftOf(TYPED), TODAY), {
        ...writers,
        setShaker: null,
      }),
    ).rejects.toThrow(/setShaker/);
  });

  it("le refus de la porte ARRÊTE la chaîne, il ne la traverse pas", async () => {
    const { writers, calls } = spyWriters({
      setShaker: { ok: false, reason: "no_goal_row" },
    });
    const res = await persistMouth(
      mouthToPersist(draftOf(TYPED), TODAY),
      writers,
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("no_goal_row");
    // Les marches d'après ne partent PAS: une fiche à moitié écrite dont
    // personne ne sait ce qui manque est ce que l'arrêt évite.
    expect(calls).not.toContain("addAllergy");
  });
});
