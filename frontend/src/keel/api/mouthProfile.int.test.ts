import { describe, expect, it } from "vitest";

import {
  type MouthToPersist,
  type MouthWriters,
  ownTargetWriter,
  persistMouth,
  type setOwnTarget,
  shakerIntakeJson,
} from "./mouthProfile";
import {
  draftFromKnown,
  emptyMouthDraft,
  type MouthFormDraft,
  mouthToPersist,
} from "../lib/mouthForm";
import {
  fixedIntakePromptLines,
  parseFixedIntakes,
} from "../../../../supabase/functions/_shared/keel/fixed_intakes.ts";
// ⚠️ LE LECTEUR DU FOYER, IMPORTÉ ICI EXPRÈS. C'est le seul endroit du dépôt
// d'où l'écrivain ET le lecteur sont atteignables dans le même processus, donc
// le seul où « la donnée traverse » se prouve sans base et sans modèle.
import { loadHouseholdFixedIntakes } from "../../../../supabase/functions/_shared/keel/household_fixed_intakes.ts";
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
      // Les moments, depuis le 2026-08-19: la question a quitté l'étape 3 pour
      // la fiche. Branchée par défaut, même raison que le shaker.
      setRhythm: make("setRhythm") as MouthWriters["setRhythm"],
      // D1 (2026-08-18) — LA SEPTIÈME PORTE. Le harnais la BRANCHE par défaut:
      // « appelée avec quoi » est le sujet des tests d'en bas, et « jamais
      // appelée sans shaker » n'a de sens que si elle était appelable.
      setShaker: make("setShaker") as NonNullable<MouthWriters["setShaker"]>,
      // D5 (2026-08-18) — LES TROIS PORTES DE LA MARCHE 1 BIS. Branchées par
      // défaut pour la même raison que le shaker: « jamais appelées sur une
      // bouche qu'on AJOUTE » ne prouve rien si elles n'étaient pas appelables.
      setName: make("setName") as NonNullable<MouthWriters["setName"]>,
      setBirthDate: make("setBirthDate") as NonNullable<
        MouthWriters["setBirthDate"]
      >,
      setGoal: make("setGoal") as NonNullable<MouthWriters["setGoal"]>,
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
  dayActivity: "seated",
  sportFrequency: "1_2",
  takesDessert: true,
  takesCheese: false,
  takesBread: null,
  appetite: "large",
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
        "setRhythm",
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
    // ⚠️ LES CINQ QUESTIONS DU 2026-08-20 PARTENT DANS LE MÊME APPEL, et le
    // test l'épingle pour la même raison que le cran: il n'y a qu'UNE porte de
    // corps, et un second appel finirait par écraser ce que le premier écrit.
    //
    // ⛔ ET LES DEUX DRAPEAUX SONT `true`. Ils ne disent pas « elle a répondu »
    // — `takesBread` vaut `null` juste au-dessus — mais « le pop-up a posé les
    // questions ». C'est eux qui autorisent la base à écrire un `null`, donc à
    // dé-répondre, et eux qui séparent `not_answered` de `not_asked`.
    expect(seen[0]).toEqual(["m-1", 165, 60, "female", "sedentary", {
      dayActivity: "seated",
      sportFrequency: "1_2",
      axesAsked: true,
      takesDessert: true,
      takesCheese: false,
      takesBread: null,
      structureAsked: true,
      // ⑤ — même appel, même drapeau. Une seconde porte pour l'appétit
      // finirait par écraser ce que celle-ci écrit.
      appetite: "large",
      appetiteAsked: true,
    }]);
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
  });

  it("⛔ …ET LES TROIS PORTES DE L'AJOUT NE SONT PAS APPELÉES POUR RIEN", async () => {
    // Le cas qui PASSE de la garde d'en dessous: sur une bouche qu'on AJOUTE,
    // `addMember` écrit déjà prénom, date et direction. Y rejouer les trois
    // portes de mise à jour ferait trois écritures de plus pour la même valeur,
    // et masquerait le jour où `addMember` cesse de les prendre.
    const { writers, calls } = spyWriters();
    await persistMouth(MOUTH, writers);
    expect(calls).toContain("addMember");
    for (const door of ["setName", "setBirthDate", "setGoal"]) {
      expect(calls).not.toContain(door);
    }
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
// D5 (2026-08-18) — LA MARCHE 1 BIS: METTRE À JOUR UNE BOUCHE QUI EXISTE
//
// ⚠️ C'EST LE TROU QUE CE BLOC SOLDE, ET IL SE MESURE EN UNE PHRASE: avant, si
// `memberId` n'était pas `null`, `addMember` n'était pas appelé — donc
// `firstName`, `birthDate` et `goal` n'étaient écrits NULLE PART. Une bouche qui
// existe est TOUJOURS le cas du compte maître, et monter la fenêtre sur sa fiche
// jetait sa direction en silence.
// ---------------------------------------------------------------------------

/** Enregistre les ARGUMENTS, pas seulement les noms. */
function argSpy(): {
  writers: MouthWriters;
  seen: { door: string; args: unknown[] }[];
} {
  const seen: { door: string; args: unknown[] }[] = [];
  const { writers } = spyWriters();
  for (const door of Object.keys(writers) as (keyof MouthWriters)[]) {
    const inner = writers[door];
    if (inner === null) continue;
    const table = writers as unknown as Record<
      string,
      (...a: unknown[]) => unknown
    >;
    table[door] = (...args: unknown[]) => {
      seen.push({ door, args });
      return Promise.resolve(
        door === "addMember" ? { ...OK, member_id: "m-1" } : { ...OK },
      );
    };
  }
  return { writers, seen };
}

const EXISTING: MouthToPersist = { ...MOUTH, memberId: "m-9" };

describe("la marche 1 bis — une bouche qui EXISTE s'écrit quand même", () => {
  it("⛔ LE TROU — prénom, date et direction ARRIVENT à une porte", async () => {
    const { writers, seen } = argSpy();
    const res = await persistMouth(
      { ...EXISTING, firstName: "Ahmed", birthDate: "1988-02-03", goal: "muscle_gain" },
      writers,
    );
    expect(res.ok).toBe(true);
    // ⚠️ ON EXIGE LA VALEUR TAPÉE, PAS SEULEMENT L'APPEL. Une porte appelée
    // avec la mauvaise variable serait le même silence, sous un nom rassurant.
    expect(seen.find((c) => c.door === "setName")?.args)
      .toEqual(["m-9", "Ahmed"]);
    expect(seen.find((c) => c.door === "setBirthDate")?.args)
      .toEqual(["m-9", "1988-02-03"]);
    expect(seen.find((c) => c.door === "setGoal")?.args)
      .toEqual(["m-9", "muscle_gain"]);
  });

  it("l'ordre complet, et la cible EFFACÉE avant la direction", async () => {
    const { writers, seen } = argSpy();
    await persistMouth(EXISTING, writers);
    expect(seen.map((c) => c.door)).toEqual([
      // ⚠️ L'EFFACEMENT D'ABORD. Les CHECK croisés refusent une cible orpheline:
      // repasser en « maintenir » rendrait la ligne INÉCRIVABLE, et la violation
      // remonterait en erreur PostgreSQL brute au milieu du formulaire.
      "setTarget",
      "setName",
      "setBirthDate",
      "setGoal",
      "setBody",
      // …et REPOSÉE ensuite, parce que la porte exige que la direction soit
      // déjà en base (`target_needs_direction`).
      "setTarget",
      "setHabits",
      "addAllergy",
      "addRestriction",
      "setRhythm",
      "setDiet",
    ]);
  });

  it("⚠️ le PREMIER passage EFFACE, le SECOND repose ce qui a été saisi", async () => {
    const { writers, seen } = argSpy();
    await persistMouth({ ...EXISTING, targetWeightKg: 55, paceKgPerWeek: 0.45 }, writers);
    const targets = seen.filter((c) => c.door === "setTarget");
    expect(targets).toHaveLength(2);
    // Sans cette seconde ligne, l'effacement serait une PERTE: la cible saisie
    // disparaîtrait dans le geste censé l'enregistrer.
    expect(targets[0].args).toEqual(["m-9", null, null]);
    expect(targets[1].args).toEqual(["m-9", 55, 0.45]);
  });

  it("⛔ SANS PORTE, ON LÈVE — jamais un champ collecté puis jeté", async () => {
    for (const hole of ["setName", "setBirthDate", "setGoal"] as const) {
      const { writers } = spyWriters();
      await expect(
        persistMouth(EXISTING, { ...writers, [hole]: null }),
        // ⚠️ LES MOTS DE LA GARDE, PAS SON SUJET — la leçon du shaker: désarmer
        // le `throw` laisserait un `TypeError` du moteur JS qui NOMME lui aussi
        // la porte manquante, et la garde serait prouvée par la panne qu'elle
        // existe pour remplacer.
      ).rejects.toThrow(/collected and dropped/);
    }
  });

  it("le refus d'une des trois ARRÊTE la chaîne", async () => {
    for (
      const [door, reason] of [
        ["setName", "bad_first_name"],
        ["setBirthDate", "bad_birth_date"],
        ["setGoal", "has_account"],
      ] as const
    ) {
      const { writers, calls } = spyWriters({ [door]: { ok: false, reason } });
      const res = await persistMouth(EXISTING, writers);
      expect(res).toEqual({ ok: false, reason });
      // Le corps, les habitudes et le reste ne partent pas: une fiche à moitié
      // écrite dont personne ne sait ce qui manque est ce que l'arrêt évite.
      expect(calls).not.toContain("setBody");
    }
  });

  it("l'effacement REFUSÉ arrête tout — on ne force pas la direction par-dessus", async () => {
    const { writers, calls } = spyWriters({
      setTarget: { ok: false, reason: "not_owner" },
    });
    const res = await persistMouth(EXISTING, writers);
    expect(res).toEqual({ ok: false, reason: "not_owner" });
    expect(calls).toEqual(["setTarget"]);
  });
});

// ---------------------------------------------------------------------------
// LA PORTE DE LA CIBLE D'UN COMPTE — ET SA SEULE TOLÉRANCE
// ---------------------------------------------------------------------------

describe("`ownTargetWriter` — effacer ce qui n'existe pas est un succès", () => {
  const noRow = () => Promise.resolve({ ok: false, reason: "no_goal_row" });

  it("⛔ SANS ELLE, LE PREMIER ENREGISTREMENT DU MAÎTRE EST UN BOUTON MORT", async () => {
    // `persistMouth` EFFACE la cible avant la direction. Sur un compte dont la
    // ligne `student_goals` n'existe pas encore — le tout premier passage — le
    // refus arrêterait la chaîne, et la direction qui aurait CRÉÉ la ligne ne
    // serait jamais posée.
    const res = await ownTargetWriter("u-1", noRow)("m-9", null, null);
    expect(res).toEqual({ ok: true, reason: "" });
  });

  it("⚠️ …ET LA TOLÉRANCE S'ARRÊTE LÀ — une cible RÉELLE reste refusée", async () => {
    const res = await ownTargetWriter("u-1", noRow)("m-9", 70, 0.5);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("no_goal_row");
  });

  it("un AUTRE refus n'est jamais avalé, même en effaçant", async () => {
    const denied = () => Promise.resolve({ ok: false, reason: "not_your_line" });
    const res = await ownTargetWriter("u-1", denied)("m-9", null, null);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not_your_line");
  });

  it("le compte visé est CELUI DE LA PORTE, pas le `member_id` reçu", async () => {
    // La cible d'un compte est clé sur `user_id`; passer le `member_id` ferait
    // écrire la ligne de quelqu'un d'autre, ou de personne.
    const seen: unknown[] = [];
    const spy = (...args: unknown[]) => {
      seen.push(args);
      return Promise.resolve({ ok: true, reason: "" });
    };
    await ownTargetWriter("u-1", spy as typeof setOwnTarget)("m-9", 70, 0.5);
    expect(seen[0]).toEqual(["u-1", 70, 0.5]);
  });
});

// ---------------------------------------------------------------------------
// REPRENDRE UNE FICHE — LA SEMENCE EST UNE GARDE
// ---------------------------------------------------------------------------

describe("`draftFromKnown` — ce qui n'est pas semé est EFFACÉ au Save", () => {
  const KNOWN = {
    firstName: "Ahmed",
    birthDate: "1988-02-03",
    goal: "fat_loss" as const,
    targetWeightKg: 72,
    paceKgPerWeek: 0.4,
    heightCm: 178,
    weightKg: 80,
    gender: "male" as const,
    activityLevel: "trains_some" as const,
    habits: { breakfast: "un café" },
  };

  it("⛔ LA CIBLE SEMÉE SURVIT À L'EFFACEMENT DE `persistMouth`", async () => {
    // Sans semence, `targetPayloadOf` rendrait `(null, null)` et le second
    // passage de `setTarget` reposerait du vide: le poids visé réglé sur
    // `/app/plan` disparaîtrait dans le geste censé compléter la fiche.
    const payload = mouthToPersist(draftFromKnown(KNOWN), TODAY, "m-9");
    expect(payload.targetWeightKg).toBe(72);
    expect(payload.paceKgPerWeek).toBe(0.4);
  });

  it("⛔ LES HABITUDES SEMÉES SURVIVENT — la porte REMPLACE la liste", async () => {
    const payload = mouthToPersist(draftFromKnown(KNOWN), TODAY, "m-9");
    expect(payload.habits).toEqual([
      { slot: "breakfast", kind: "own_usual", usual: "un café" },
    ]);
    // …et le brouillon VIDE, lui, les efface. C'est le fait que la semence
    // existe pour empêcher, et il est prouvé ici plutôt que supposé.
    expect(mouthToPersist(emptyMouthDraft(), TODAY, "m-9").habits).toEqual([]);
  });

  it("le corps, la direction et l'identité arrivent tels qu'ils sont lus", () => {
    const payload = mouthToPersist(draftFromKnown(KNOWN), TODAY, "m-9");
    expect(payload.firstName).toBe("Ahmed");
    expect(payload.birthDate).toBe("1988-02-03");
    expect(payload.goal).toBe("fat_loss");
    expect(payload.heightCm).toBe(178);
    expect(payload.weightKg).toBe(80);
    expect(payload.gender).toBe("male");
    expect(payload.activityLevel).toBe("trains_some");
  });

  it("⚠️ UN CHAMP NON LU RESTE VIDE — jamais un zéro de complaisance", () => {
    const draft = draftFromKnown({
      firstName: null,
      birthDate: null,
      goal: null,
      targetWeightKg: null,
      paceKgPerWeek: null,
      heightCm: null,
      weightKg: null,
      gender: null,
      activityLevel: null,
      dayActivity: null,
      sportFrequency: null,
      takesDessert: null,
      takesCheese: null,
      takesBread: null,
      appetite: null,
      habits: {},
    });
    // `String(null)` rendrait « null », `Number(null)` rendrait 0 — et un zéro
    // traverse `targetWeightRefusal` comme un poids réel.
    expect(draft).toEqual(emptyMouthDraft());
  });

  it("⛔ CE QUI S'AJOUTE N'EST PAS SEMÉ — sinon on le rejoue à chaque Save", () => {
    // Les allergies et les dégoûts passent par des portes `add_*`: les semer
    // les réécrirait à chaque enregistrement, et ne pas les semer ne perd rien.
    const draft = draftFromKnown(KNOWN);
    expect(draft.allergies).toEqual([]);
    expect(draft.dislikes).toEqual([]);
    // Le régime n'existe pas pour une bouche qui a un compte (`has_account`).
    expect(draft.diet).toBe("");
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
      // ⚠️ ON EXIGE LES MOTS DE LA GARDE, PAS SEULEMENT SON SUJET — UNE
      // MUTATION L'A DIT. Ce test cherchait `/setShaker/`; désarmer le `throw`
      // le laissait VERT, parce que la ligne d'après appelle `null` comme une
      // fonction et que le `TypeError` du moteur JS dit lui aussi
      // « setShaker ». La garde était donc prouvée par la panne qu'elle existe
      // pour remplacer — et elle aurait pu disparaître sans un rouge.
    ).rejects.toThrow(/needs an account/);
  });

  it("⛔ LA SOUDURE — du champ tapé à la LIGNE DE CONSIGNE DU FOYER", async () => {
    // ⚠️ LE SEUL TEST QUI TRAVERSE LES DEUX MOITIÉS DU LOT, ET IL EXISTE PARCE
    // QUE LE JOINT EST INVISIBLE DES DEUX CÔTÉS. L'écrivain prouve que son
    // jsonb est relisible; le lecteur prouve qu'il fabrique une consigne — sur
    // une ligne de décor ÉCRITE À LA MAIN. Entre les deux, la forme réelle
    // pourrait dériver d'un nom de clé sans qu'un seul test rougisse, et le
    // shaker retomberait exactement là où il était: collecté, écrit, jamais lu.
    //
    // La chaîne, sans réseau ni modèle: brouillon → `mouthToPersist` →
    // `persistMouth` → la porte du compte → `shakerIntakeJson` → LA COLONNE →
    // `loadHouseholdFixedIntakes` → la ligne que le générateur reçoit.
    let column: unknown = null;
    const { writers } = spyWriters();
    await persistMouth(mouthToPersist(draftOf(TYPED), TODAY), {
      ...writers,
      setShaker: (shaker) => {
        column = [shakerIntakeJson(shaker)];
        return Promise.resolve({ ok: true, reason: "" });
      },
    });

    const loaded = await loadHouseholdFixedIntakes({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { practical_constraints: { fixed_intakes: column } },
                error: null,
              }),
          }),
        }),
      }),
    }, {
      mouths: [{ memberId: "m-1", userId: "u-1", displayName: "Zoe" }],
    });

    const prose = fixedIntakePromptLines(loaded.intakes).join("\n");
    // LE NOM QU'ELLE A TAPÉ, PRÉCÉDÉ DU SIEN, ET LA QUANTITÉ QU'ELLE A LUE SUR
    // LE POT. C'est ce que le générateur reçoit, mot pour mot.
    expect(prose).toContain("Zoe: mon shaker (30 g) at afternoon snack");
    // ⛔ ET AUCUNE CALORIE. Les 120 kcal et les 24 g de protéine servent au
    // calcul; ils ne se lisent nulle part dans un plan.
    expect(prose).not.toMatch(/120|kcal|calorie|protein/i);
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
