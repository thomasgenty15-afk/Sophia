import { describe, expect, it } from "vitest";

import {
  activityIsRequired,
  ageStateOfDraft,
  bodyOfDraft,
  emptyMouthDraft,
  missingRequiredBlocks,
  MOUTH_FORM_BLOCKS,
  type MouthFormDraft,
  numberOrNull,
  PACE_STEP_KG,
  paceControlFor,
  REQUIRED_MOUTH_FORM_BLOCKS,
  shakerIsComplete,
  shakerIsForeground,
  submitIsHeld,
  targetPayloadOf,
  targetWeightStateFor,
} from "./mouthForm";
import {
  MAX_KG_PER_WEEK,
  PACE_WARN_UP_KG_PER_WEEK,
  roundPace,
} from "../../../../supabase/functions/_shared/keel/weight_pace.ts";
import { GOAL_TOKENS } from "../../../../supabase/functions/_shared/keel/tokens.ts";

// ===========================================================================
// L5-A (2026-08-18) — LA DÉCISION DU POP-UP « UNE BOUCHE », SUR LA VALEUR
//
// Ce fichier ne regarde AUCUN HTML: il regarde ce que le module DÉCIDE. Le
// rendu est prouvé à côté (`components/mouthFormDialog.int.test.ts`), et les
// deux ensemble tiennent les deux bouts — ce qui est décidé, et ce qui est vu.
//
// ⚠️ `.ts` ET PAS `.tsx`: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts`. Un `.tsx` ne serait JAMAIS COLLECTÉ, donc un fichier
// entier de silence vert.
// ===========================================================================

/** 2026-08-18, la date des décisions produit de ce chantier. */
const TODAY = "2026-08-18";
/** 36 ans au 18/08/2026. */
const ADULT_BIRTH = "1990-05-04";
/** 10 ans au 18/08/2026. */
const MINOR_BIRTH = "2016-05-04";

function draftOf(patch: Partial<MouthFormDraft>): MouthFormDraft {
  return { ...emptyMouthDraft(), ...patch };
}

/** Une adulte de 60 kg — le CAS DU DESIGN de `weight_pace.ts`. */
const SIXTY_KG_WOMAN: Partial<MouthFormDraft> = {
  firstName: "Zoe",
  birthDate: ADULT_BIRTH,
  heightCm: "165",
  weightKg: "60",
  gender: "female",
  activityLevel: "sedentary",
};

/**
 * UN CORPS SANS AUCUNE MARGE DE PERTE — mesuré, pas supposé.
 * 25 kg / 140 cm / sédentaire: son besoin estimé touche déjà le plancher
 * d'énergie, donc `paceCeilingFor` rend `maxKgPerWeek: 0`.
 */
const NO_MARGIN_BODY: Partial<MouthFormDraft> = {
  firstName: "Ada",
  birthDate: ADULT_BIRTH,
  heightCm: "140",
  weightKg: "25",
  gender: "female",
  activityLevel: "sedentary",
};

// ---------------------------------------------------------------------------
// LES SIX BLOCS
// ---------------------------------------------------------------------------

describe("les six blocs, et lesquels retiennent", () => {
  it("six blocs, dont exactement trois obligatoires", () => {
    // ⚠️ `body` AVANT `direction` DEPUIS LE 2026-08-18, sur une mesure au
    // navigateur: le curseur de rythme est retenu tant que le corps manque, et
    // il était demandé AVANT lui — « ni poids visé ni rythme », rapporté par
    // l'utilisateur. Voir la note de `MOUTH_FORM_BLOCKS`.
    expect([...MOUTH_FORM_BLOCKS]).toEqual([
      "identity",
      "body",
      "direction",
      "habits",
      "allergies",
      "tastes",
    ]);
    expect([...REQUIRED_MOUTH_FORM_BLOCKS]).toEqual([
      "identity",
      "body",
      "direction",
    ]);
  });

  it("un brouillon vide retient les trois obligatoires, et eux seuls", () => {
    // ET DANS L'ORDRE DE L'ÉCRAN: la phrase « il manque… » les nomme dans
    // l'ordre où ils sont posés, sinon elle envoie chercher au mauvais endroit.
    expect([...missingRequiredBlocks(emptyMouthDraft())]).toEqual([
      "identity",
      "body",
      "direction",
    ]);
  });

  it("les trois blocs SAUTABLES ne retiennent jamais rien", () => {
    // Les trois obligatoires remplis, les trois autres vides: rien ne retient.
    const complete = draftOf({ ...SIXTY_KG_WOMAN, goal: "maintenance" });
    expect([...missingRequiredBlocks(complete)]).toEqual([]);
    expect(submitIsHeld(complete, TODAY)).toBe(false);
    // Et le brouillon N'A AUCUNE habitude, aucune allergie, aucun goût.
    expect(Object.keys(complete.habits)).toEqual([]);
    expect([...complete.allergies]).toEqual([]);
    expect([...complete.dislikes]).toEqual([]);
    expect(complete.shaker).toBeNull();
    expect(complete.diet).toBe("");
  });

  it("le prénom n'est jamais facultatif — une part sans prénom est écartée", () => {
    const noName = draftOf({
      ...SIXTY_KG_WOMAN,
      firstName: "   ",
      goal: "maintenance",
    });
    expect([...missingRequiredBlocks(noName)]).toContain("identity");
  });

  it("le CRAN D'ACTIVITÉ retient le bloc 3 SOUS UNE DIRECTION QUI BOUGE", () => {
    // D1 (2026-08-18) — sans lui, `energy_target.ts` multiplie un métabolisme
    // par une constante devinée pour VISER un rythme.
    for (const goal of ["fat_loss", "muscle_gain"] as const) {
      const noActivity = draftOf({
        ...SIXTY_KG_WOMAN,
        activityLevel: "",
        goal,
      });
      expect([...missingRequiredBlocks(noActivity)]).toEqual(["body"]);
      expect(submitIsHeld(noActivity, TODAY)).toBe(true);
    }
  });

  it("…ET IL EST FACULTATIF POUR QUI VEUT MAINTENIR — le cas qui PASSE", () => {
    // ⚠️ D1 (2026-08-18) — LA MOITIÉ QUI PROUVE LA CONDITION. L'assertion
    // voisine reste verte si `activityIsRequired` rend `true` en dur: elle ne
    // regarde que des directions qui bougent. Celle-ci est le seul cas où la
    // condition DÉCIDE — et le blocage de sortie est vérifié avec, parce qu'un
    // champ déclaré facultatif au-dessus d'un bouton qui retient quand même
    // serait un mensonge, pas un assouplissement.
    const held = draftOf({
      ...SIXTY_KG_WOMAN,
      activityLevel: "",
      goal: "maintenance",
    });
    expect([...missingRequiredBlocks(held)]).toEqual([]);
    expect(submitIsHeld(held, TODAY)).toBe(false);
  });

  it("les trois AUTRES champs du bloc 3 retiennent, direction ou pas", () => {
    // La condition ne porte QUE sur le cran. Taille, poids et sexe dimensionnent
    // une part à toute personne à table, y compris à qui ne vise rien.
    for (const patch of [
      { heightCm: "" },
      { weightKg: "" },
      { gender: "" as const },
    ]) {
      const draft = draftOf({
        ...SIXTY_KG_WOMAN,
        goal: "maintenance",
        ...patch,
      });
      expect([...missingRequiredBlocks(draft)]).toEqual(["body"]);
    }
  });

  it("la direction NON CHOISIE ne réclame pas encore le cran", () => {
    // Elle retient déjà le bouton par SON bloc. Empiler `body` nommerait un
    // manque que la personne ne peut pas comprendre: on lui réclamerait son
    // activité pour un objectif qu'elle n'a pas posé.
    const noGoal = draftOf({ ...SIXTY_KG_WOMAN, activityLevel: "", goal: "" });
    expect([...missingRequiredBlocks(noGoal)]).toEqual(["direction"]);
  });

  it("`activityIsRequired` couvre les TROIS directions, plus le vide", () => {
    // Les trois jetons, pas un seul: une correspondance codée sur une valeur ne
    // dit rien des deux autres. `GOAL_TOKENS` est la liste que la base porte.
    expect([...GOAL_TOKENS].sort()).toEqual(
      ["fat_loss", "maintenance", "muscle_gain"],
    );
    expect(activityIsRequired("fat_loss")).toBe(true);
    expect(activityIsRequired("muscle_gain")).toBe(true);
    expect(activityIsRequired("maintenance")).toBe(false);
    expect(activityIsRequired("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ⛔ ON NE DEMANDE JAMAIS « ADULTE OU ENFANT »
// ---------------------------------------------------------------------------

describe("l'âge se déduit, il ne se demande pas", () => {
  it("le brouillon n'a AUCUN champ qui demande adulte ou enfant", () => {
    // Une clé `kind` rouvrirait la porte à deux réponses qui se contredisent,
    // et c'est la tapée à la main qui gagnerait — elle est plus récente.
    expect(Object.keys(emptyMouthDraft())).not.toContain("kind");
    expect(Object.keys(emptyMouthDraft())).not.toContain("ageState");
  });

  it("trois états, et `unknown` n'est ni un enfant ni un adulte", () => {
    expect(ageStateOfDraft(draftOf({ birthDate: ADULT_BIRTH }), TODAY))
      .toBe("adult");
    expect(ageStateOfDraft(draftOf({ birthDate: MINOR_BIRTH }), TODAY))
      .toBe("minor");
    // Absente, illisible, future: on ne sait pas.
    expect(ageStateOfDraft(draftOf({ birthDate: "" }), TODAY)).toBe("unknown");
    expect(ageStateOfDraft(draftOf({ birthDate: "pas une date" }), TODAY))
      .toBe("unknown");
    expect(ageStateOfDraft(draftOf({ birthDate: "2030-01-01" }), TODAY))
      .toBe("unknown");
  });

  it("un MINEUR reçoit la même liste d'objectifs qu'un majeur", () => {
    // Renversement du 2026-08-18: les six blocs sont les mêmes pour tout le
    // monde. Le brouillon ne porte aucune restriction de liste; celle-ci est
    // `GOAL_TOKENS`, et elle vaut pour les deux.
    expect([...GOAL_TOKENS]).toEqual(["fat_loss", "maintenance", "muscle_gain"]);
    for (const goal of GOAL_TOKENS) {
      const minor = draftOf({
        firstName: "Kid",
        birthDate: MINOR_BIRTH,
        heightCm: "140",
        weightKg: "35",
        gender: "male",
        activityLevel: "trains_some",
        goal,
      });
      expect([...missingRequiredBlocks(minor)]).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// BLOC 2 — LES QUATRE ÉTATS DU CURSEUR
// ---------------------------------------------------------------------------

describe("le curseur, et les trois écrans qui n'en sont pas un", () => {
  it("`maintenance` REPLIE les deux champs", () => {
    const control = paceControlFor(
      draftOf({ ...SIXTY_KG_WOMAN, goal: "maintenance" }),
      TODAY,
    );
    expect(control.kind).toBe("folded");
  });

  it("aucune direction choisie: replié aussi", () => {
    expect(paceControlFor(draftOf(SIXTY_KG_WOMAN), TODAY).kind).toBe("folded");
  });

  it("⚠️ `null` = « je ne connais pas ce corps » → on DEMANDE le corps", () => {
    const noBody = draftOf({
      firstName: "Zoe",
      birthDate: ADULT_BIRTH,
      goal: "fat_loss",
    });
    expect(paceControlFor(noBody, TODAY).kind).toBe("needs_body");
  });

  it("⚠️ `0` = « je le connais, et il n'a pas de marge » → PAS DE CURSEUR", () => {
    // D3 de la vérification du socle: `null` et `0` sont DEUX écrans
    // différents. Les confondre donnerait un curseur de 0,05 à 0.
    const control = paceControlFor(
      draftOf({ ...NO_MARGIN_BODY, goal: "fat_loss" }),
      TODAY,
    );
    expect(control.kind).toBe("no_margin");
  });

  it("les deux états ne sont pas le même — un corps connu, un corps inconnu", () => {
    const known = paceControlFor(
      draftOf({ ...NO_MARGIN_BODY, goal: "fat_loss" }),
      TODAY,
    );
    const unknown = paceControlFor(
      draftOf({ ...NO_MARGIN_BODY, weightKg: "", goal: "fat_loss" }),
      TODAY,
    );
    expect(known.kind).not.toBe(unknown.kind);
    expect(unknown.kind).toBe("needs_body");
  });

  it("le cas du DESIGN: 60 kg → 0,45 kg/sem, borne `energy_floor`", () => {
    const control = paceControlFor(
      draftOf({ ...SIXTY_KG_WOMAN, goal: "fat_loss" }),
      TODAY,
    );
    expect(control.kind).toBe("slider");
    if (control.kind !== "slider") return;
    expect(control.max).toBe(0.45);
    expect(control.bound).toBe("energy_floor");
    expect(control.min).toBe(PACE_STEP_KG);
    expect(control.step).toBe(PACE_STEP_KG);
    // Le défaut est le MAXIMUM, pas le minimum: partir du plus lent ferait
    // d'un formulaire jamais touché une déclaration de prudence.
    expect(control.value).toBe(0.45);
  });

  it("un cran demandé AU-DELÀ du maximum est rabattu, jamais rendu tel quel", () => {
    // Sans rabattage, l'écran montrerait une valeur que le CHECK de la base
    // refuse, et le refus arriverait au Save — loin du geste.
    const control = paceControlFor(
      draftOf({ ...SIXTY_KG_WOMAN, goal: "fat_loss", paceKgPerWeek: "0.95" }),
      TODAY,
    );
    expect(control.kind).toBe("slider");
    if (control.kind !== "slider") return;
    expect(control.value).toBe(0.45);
    expect(control.value).toBeLessThanOrEqual(control.max);
  });

  it("le maximum ne dépasse JAMAIS 1 kg/semaine", () => {
    for (const weight of ["40", "60", "90", "120", "180", "250"]) {
      for (const goal of ["fat_loss", "muscle_gain"] as const) {
        const control = paceControlFor(
          draftOf({
            ...SIXTY_KG_WOMAN,
            weightKg: weight,
            activityLevel: "trains_hard",
            goal,
          }),
          TODAY,
        );
        if (control.kind !== "slider") continue;
        expect(control.max).toBeLessThanOrEqual(MAX_KG_PER_WEEK);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// ⚠️ LE SEUIL DE 0,5 EST UN AVERTISSEMENT, PAS UNE BORNE
// ---------------------------------------------------------------------------

describe("en prise, le curseur DIT sans interdire", () => {
  const HEAVY_LIFTER: Partial<MouthFormDraft> = {
    firstName: "Theo",
    birthDate: ADULT_BIRTH,
    heightCm: "185",
    weightKg: "110",
    gender: "male",
    activityLevel: "trains_hard",
  };

  it("le curseur MONTE au-delà de 0,5 kg/sem — l'avertissement n'est pas une butée", () => {
    const control = paceControlFor(
      draftOf({ ...HEAVY_LIFTER, goal: "muscle_gain" }),
      TODAY,
    );
    expect(control.kind).toBe("slider");
    if (control.kind !== "slider") return;
    expect(control.max).toBeGreaterThan(PACE_WARN_UP_KG_PER_WEEK);
  });

  it("au-delà du seuil, il PORTE la phrase — et elle vient du module", () => {
    const control = paceControlFor(
      draftOf({
        ...HEAVY_LIFTER,
        goal: "muscle_gain",
        paceKgPerWeek: "0.75",
      }),
      TODAY,
    );
    if (control.kind !== "slider") throw new Error("attendu: un curseur");
    expect(control.value).toBe(0.75);
    // Le jeton, pas une phrase réécrite ici: le seuil et son mot sont une
    // seule décision (`PACE_WARNING_LABELS`).
    expect(control.warning).toBe("surplus_becomes_fat");
  });

  it("le seuil est FRANCHI, pas atteint: à 0,50 pile on ne dit rien", () => {
    const control = paceControlFor(
      draftOf({ ...HEAVY_LIFTER, goal: "muscle_gain", paceKgPerWeek: "0.5" }),
      TODAY,
    );
    if (control.kind !== "slider") throw new Error("attendu: un curseur");
    expect(control.value).toBe(0.5);
    expect(control.warning).toBeNull();
  });

  it("une PERTE ne reçoit jamais l'avertissement — trois bornes dures y suffisent", () => {
    const control = paceControlFor(
      draftOf({ ...HEAVY_LIFTER, goal: "fat_loss" }),
      TODAY,
    );
    if (control.kind !== "slider") throw new Error("attendu: un curseur");
    expect(control.warning).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// LE POIDS VISÉ
// ---------------------------------------------------------------------------

describe("le poids visé — le refus est NOMMÉ", () => {
  const LOSING = { ...SIXTY_KG_WOMAN, goal: "fat_loss" as const };

  it("`maintenance` ne juge AUCUNE cible — la balance ne bouge pas", () => {
    // ⚠️ CE TEST EST LA SEULE CEINTURE DE CETTE BRANCHE, et il a été écrit
    // APRÈS une mutation qui n'a pas mordu: `targetPayloadOf` n'émet rien sur
    // `maintenance` parce que `paceControlFor` y rend `folded`, donc muter la
    // lecture de direction D'ICI restait vert. Ce sont deux décisions
    // différentes — celle-ci décide de la PHRASE rendue à côté du champ, celle
    // de `targetPayloadOf` décide de ce qui part en base — et chacune a
    // maintenant son cas.
    const state = targetWeightStateFor(
      draftOf({ ...SIXTY_KG_WOMAN, goal: "maintenance", targetWeightKg: "55" }),
      TODAY,
    );
    expect(state).toEqual({ kind: "idle" });
  });

  it("rien tant qu'il manque le poids ACTUEL: on n'accuse pas sur une ignorance", () => {
    const state = targetWeightStateFor(
      draftOf({ ...LOSING, weightKg: "", targetWeightKg: "55" }),
      TODAY,
    );
    expect(state.kind).toBe("idle");
  });

  it("hors des bornes de plausibilité → `implausible`", () => {
    const state = targetWeightStateFor(
      draftOf({ ...LOSING, targetWeightKg: "12" }),
      TODAY,
    );
    expect(state).toEqual({ kind: "refused", refusal: "implausible" });
  });

  it("à contresens de la direction → `wrong_direction`", () => {
    const state = targetWeightStateFor(
      draftOf({ ...LOSING, targetWeightKg: "70" }),
      TODAY,
    );
    expect(state).toEqual({ kind: "refused", refusal: "wrong_direction" });
  });

  it("sous le plancher d'énergie → `below_energy_floor`", () => {
    // ⚠️ CE REFUS EST UN BACKSTOP RARE, ET IL FAUT UN PETIT CORPS POUR
    // L'ATTEINDRE: `implausible` (sous 25 kg) attrape d'abord la plupart des
    // cas. Mesuré: 140 cm / sédentaire / femme, cible 28 kg. À 165 cm, aucune
    // cible plausible ne passe sous 1 200 kcal, et le test aurait été vert sur
    // la mauvaise branche.
    const state = targetWeightStateFor(
      draftOf({
        ...LOSING,
        heightCm: "140",
        weightKg: "45",
        targetWeightKg: "28",
      }),
      TODAY,
    );
    expect(state).toEqual({
      kind: "refused",
      refusal: "below_energy_floor",
    });
  });

  it("accepté → la DATE D'ARRIVÉE, en semaines", () => {
    const state = targetWeightStateFor(
      draftOf({ ...LOSING, targetWeightKg: "55" }),
      TODAY,
    );
    expect(state.kind).toBe("accepted");
    if (state.kind !== "accepted") return;
    // 5 kg à 0,45 kg/semaine = 11,1 → 12 semaines, ARRONDI AU SUPÉRIEUR: une
    // date annoncée trop tôt est une déception programmée.
    expect(state.weeks).toBe(12);
  });

  it("un refus RETIENT le bouton — sinon le refus arriverait du serveur", () => {
    const refused = draftOf({ ...LOSING, targetWeightKg: "70" });
    expect([...missingRequiredBlocks(refused)]).toEqual([]);
    expect(submitIsHeld(refused, TODAY)).toBe(true);
  });

  it("⚠️ un MINEUR n'a pas de plancher ADULTE à franchir", () => {
    // Sa garde est ailleurs: son besoin est calculé sur son âge, et le plafond
    // de son rythme est une fraction de ce besoin. Lui opposer 1 200 kcal
    // ferait refuser une cible ordinaire à un enfant de vingt-cinq kilos.
    const kid = draftOf({
      firstName: "Kid",
      birthDate: MINOR_BIRTH,
      heightCm: "140",
      weightKg: "40",
      gender: "male",
      activityLevel: "trains_some",
      goal: "fat_loss",
      targetWeightKg: "36",
    });
    const state = targetWeightStateFor(kid, TODAY);
    expect(state.kind).toBe("accepted");
  });
});

// ---------------------------------------------------------------------------
// CE QUI PART EN BASE
// ---------------------------------------------------------------------------

describe("la cible et le rythme ne partent qu'ensemble", () => {
  it("`maintenance` n'envoie NI cible NI rythme — miroir du CHECK", () => {
    // `household_members_target_needs_direction_check` refuse une cible hors
    // de `fat_loss` / `muscle_gain`. Un écran qui l'enverrait recevrait une
    // violation de contrainte PostgreSQL dans un entonnoir d'accueil.
    const payload = targetPayloadOf(
      draftOf({
        ...SIXTY_KG_WOMAN,
        goal: "maintenance",
        targetWeightKg: "55",
        paceKgPerWeek: "0.3",
      }),
      TODAY,
    );
    expect(payload).toEqual({ targetWeightKg: null, paceKgPerWeek: null });
  });

  it("un poids visé REFUSÉ n'est jamais envoyé", () => {
    const payload = targetPayloadOf(
      draftOf({ ...SIXTY_KG_WOMAN, goal: "fat_loss", targetWeightKg: "70" }),
      TODAY,
    );
    expect(payload).toEqual({ targetWeightKg: null, paceKgPerWeek: null });
  });

  it("accepté: les DEUX, et le rythme est celui du cran affiché", () => {
    const draft = draftOf({
      ...SIXTY_KG_WOMAN,
      goal: "fat_loss",
      targetWeightKg: "55",
      paceKgPerWeek: "0.30",
    });
    expect(targetPayloadOf(draft, TODAY)).toEqual({
      targetWeightKg: 55,
      paceKgPerWeek: 0.3,
    });
  });

  it("le rythme envoyé respecte la borne DURE de la base (0 < p ≤ 1)", () => {
    const draft = draftOf({
      ...SIXTY_KG_WOMAN,
      goal: "fat_loss",
      targetWeightKg: "55",
      paceKgPerWeek: "9",
    });
    const payload = targetPayloadOf(draft, TODAY);
    expect(payload.paceKgPerWeek).not.toBeNull();
    expect(payload.paceKgPerWeek!).toBeGreaterThan(0);
    expect(payload.paceKgPerWeek!).toBeLessThanOrEqual(1);
  });

  it("un corps SANS MARGE n'envoie rien — il n'y a pas de rythme à écrire", () => {
    const payload = targetPayloadOf(
      draftOf({ ...NO_MARGIN_BODY, goal: "fat_loss", targetWeightKg: "26" }),
      TODAY,
    );
    expect(payload).toEqual({ targetWeightKg: null, paceKgPerWeek: null });
  });
});

// ---------------------------------------------------------------------------
// LE SHAKER
// ---------------------------------------------------------------------------

describe("le shaker demande CE QU'IL APPORTE", () => {
  it("mis en avant pour qui PREND du poids, proposé aux autres", () => {
    expect(shakerIsForeground("muscle_gain")).toBe(true);
    expect(shakerIsForeground("fat_loss")).toBe(false);
    expect(shakerIsForeground("maintenance")).toBe(false);
    expect(shakerIsForeground("")).toBe(false);
  });

  it("incomplet sans le nom, ou sans L'UN des trois nombres", () => {
    const full = {
      label: "mon shaker",
      servingGrams: "30",
      proteinGPerServing: "24",
      energyKcalPerServing: "120",
      slot: "",
    };
    expect(shakerIsComplete(full)).toBe(true);
    expect(shakerIsComplete(null)).toBe(false);
    expect(shakerIsComplete({ ...full, label: "  " })).toBe(false);
    expect(shakerIsComplete({ ...full, servingGrams: "" })).toBe(false);
    // ⚠️ L'ÉNERGIE EST REQUISE, PAS OPTIONNELLE. Sans le champ elle entrerait à
    // zéro, et un zéro traverse toutes les additions sans rien signaler.
    expect(shakerIsComplete({ ...full, energyKcalPerServing: "" }))
      .toBe(false);
    expect(shakerIsComplete({ ...full, proteinGPerServing: "" })).toBe(false);
  });

  it("une portion de ZÉRO gramme n'est pas une portion; zéro protéine si", () => {
    const base = {
      label: "eau aromatisée",
      servingGrams: "0",
      proteinGPerServing: "0",
      energyKcalPerServing: "0",
      slot: "",
    };
    expect(shakerIsComplete(base)).toBe(false);
    expect(shakerIsComplete({ ...base, servingGrams: "250" })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LES PARSEURS
// ---------------------------------------------------------------------------

describe("le parseur ne fabrique pas de zéro", () => {
  it("`\"\"` rend `null`, pas `0`", () => {
    expect(numberOrNull("")).toBeNull();
    expect(numberOrNull("   ")).toBeNull();
    expect(numberOrNull("abc")).toBeNull();
    expect(numberOrNull("0")).toBe(0);
    expect(numberOrNull("60.5")).toBe(60.5);
  });

  it("le corps du brouillon rend `null` sur ce qui n'a pas été répondu", () => {
    expect(bodyOfDraft(emptyMouthDraft(), TODAY)).toEqual({
      heightCm: null,
      weightKg: null,
      gender: null,
      ageYears: null,
      // ⚠️ AUCUN DÉFAUT: un défaut ferait d'une non-réponse une réponse, et
      // cette réponse pèserait dans une estimation d'énergie.
      activityLevel: null,
    });
  });

  it("le pas du curseur est celui de `roundPace`", () => {
    expect(PACE_STEP_KG).toBe(0.05);
    expect(roundPace(0.4750)).toBe(0.45);
  });
});
