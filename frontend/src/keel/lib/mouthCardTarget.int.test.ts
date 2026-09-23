import { describe, expect, it } from "vitest";

import { funnelMouthAgeState, mouthCardTargetPayload } from "./mouthCardTarget";
import { emptyMouthDraft, targetPayloadOf } from "./mouthForm";
import type { FunnelMouth } from "../api/onboarding";

// ===========================================================================
// 2026-09-20 — LA CIBLE D'UNE BOUCHE S'EFFAÇAIT À CHAQUE ENREGISTREMENT
//
// Signalé à l'écran: « pour Fabrice j'ai bien mis le poids visé mais il ne
// remonte pas ». Sa carte repliée rendait « POIDS VISÉ (KG) — » alors que la
// même carte affichait 80 kg une heure plus tôt.
//
// ── CE QUI REND CE DÉFAUT INVISIBLE, ET DONC CE QUE CE FICHIER GARDE ──────
// `keel_household_set_member_target` REMPLACE la paire, et elle répond `ok`
// en effaçant. Rien, à l'écran, ne distingue « la cible n'a pas été écrite »
// de « la cible vient d'être effacée »: pas de refus, pas de jaune, pas de
// bouton gris. Un test de rendu ne pouvait pas le voir — le seul endroit où
// le défaut existe est la VALEUR qu'on envoie.
//
// ⚠️ ET IL NE SE PROUVE QU'AVEC UN CAS QUI PASSE. Un fichier qui n'affirmerait
// que « la paire n'est pas nulle » resterait vert sur une fonction qui rend
// n'importe quel nombre; un fichier qui n'affirmerait que le cas nominal
// resterait vert sur celle d'avant, qui s'abstenait toujours. Les deux bouts
// sont ici.
// ===========================================================================

const TODAY = "2026-09-20";

/** Fabrice, tel que le roster le rend. */
const FABRICE: FunnelMouth = {
  memberId: "m-1",
  claimed: false,
  eatingSlots: null,
  away: [],
  firstName: "Fabrice",
  kind: "adult",
  birthDate: "on-file",
  goal: "fat_loss",
  allergiesReviewed: true,
  diet: null,
  heightCm: 173,
  weightKg: 93,
  gender: "male",
  activityLevel: null,
  dayActivity: "on_feet",
  sportFrequency: "none",
  appetite: null,
} as unknown as FunnelMouth;

/** Ce que sa carte tient à l'écran dans la capture du 2026-09-20. */
const ON_SCREEN = {
  birthDate: "1967-07-26",
  heightCm: "173",
  weightKg: "93",
  gender: "male" as const,
  targetWeightKg: "80",
  paceKgPerWeek: "0.5",
};

describe("la cible d'une bouche part avec son corps", () => {
  it("rend les deux nombres quand la carte les porte", () => {
    const payload = mouthCardTargetPayload(FABRICE, ON_SCREEN, TODAY);
    expect(payload.targetWeightKg).toBe(80);
    expect(payload.paceKgPerWeek).not.toBeNull();
  });

  /**
   * ⚠️ LE PLAFOND MORD, ET C'EST LE POINT. 0,5 demandé rend 0,45:
   * `paceControlFor` borne le rythme SUR CE CORPS-LÀ. Un payload qui rendrait
   * 0,5 prouverait que le corps n'a pas traversé — c'est-à-dire exactement le
   * défaut, sous une autre forme.
   */
  it("borne le rythme sur le corps, au lieu de recopier ce qui est tapé", () => {
    // ⟳ 2026-09-22 — A1 vaut 880 : 0,5 est dans la borne de ce corps (0,8), il
    // ne serait plus rabattu. Le cas qui MORD tape 0,95 et lit 0,8.
    expect(mouthCardTargetPayload(FABRICE, { ...ON_SCREEN, paceKgPerWeek: "0.95" }, TODAY).paceKgPerWeek)
      .toBe(0.8);
  });

  /**
   * ── LE DÉFAUT LUI-MÊME, REPRODUIT ──────────────────────────────────────
   * Voici ce que `saveMouthCard` envoyait: le brouillon VIDE plus les deux
   * nombres. Ce cas restera vert pour toujours — il décrit l'ancienne
   * construction, pas la nouvelle —, et il est ici pour que personne ne
   * « simplifie » la fonction en retirant les champs qui coûtent cher à
   * regarder. Le voisin du dessus tombe dès qu'on le fait.
   */
  it("⛔ sans le corps, la même paire s'abstient — donc EFFACE", () => {
    const asItWas = targetPayloadOf(
      {
        ...emptyMouthDraft(),
        goal: "fat_loss",
        targetWeightKg: "80",
        paceKgPerWeek: "0.5",
      },
      TODAY,
    );
    expect(asItWas).toEqual({ targetWeightKg: null, paceKgPerWeek: null });
  });

  /**
   * ⛔ ET SANS LA DATE NON PLUS. C'est la moitié la moins évidente: le corps
   * seul ne suffit pas, parce que l'entretien estimé se calcule sur une BANDE
   * D'ÂGE (cicatrice du 2026-09-19, « le curseur n'apparaît pas »).
   */
  it("⛔ le corps sans la date ne suffit pas", () => {
    const noDate = mouthCardTargetPayload(
      FABRICE,
      { ...ON_SCREEN, birthDate: "" },
      TODAY,
    );
    expect(noDate).toEqual({ targetWeightKg: null, paceKgPerWeek: null });
  });

  /**
   * L'EFFACEMENT VOLONTAIRE RESTE POSSIBLE — c'est la même paire nulle, et
   * c'est voulu: qui vide le champ efface sa cible.
   */
  it("efface quand la carte ne porte plus de poids visé", () => {
    expect(
      mouthCardTargetPayload(FABRICE, { ...ON_SCREEN, targetWeightKg: "" }, TODAY),
    ).toEqual({ targetWeightKg: null, paceKgPerWeek: null });
  });

  /**
   * ⛔ UNE DIRECTION QUI NE BOUGE PAS N'A PAS DE CIBLE, et la base la refuse
   * (`target_needs_direction_check`).
   */
  it("n'envoie rien sur une direction qui ne bouge pas", () => {
    expect(
      mouthCardTargetPayload(
        { ...FABRICE, goal: "maintenance" } as FunnelMouth,
        ON_SCREEN,
        TODAY,
      ),
    ).toEqual({ targetWeightKg: null, paceKgPerWeek: null });
  });

  /**
   * ⛔ ET LA DIRECTION EST PLIÉE À L'ÂGE TAPÉ, pas à celui du roster: une date
   * d'enfant saisie dans la carte replie la direction, donc la cible, AVANT
   * que la base ne réponde `target_not_for_minor` loin du geste.
   */
  it("replie la cible sur une date d'enfant tapée à l'instant", () => {
    expect(
      mouthCardTargetPayload(
        FABRICE,
        { ...ON_SCREEN, birthDate: "2016-04-02" },
        TODAY,
      ),
    ).toEqual({ targetWeightKg: null, paceKgPerWeek: null });
  });
});

describe("l'âge d'une ligne, date tapée comprise", () => {
  it("la date tapée gagne sur le roster", () => {
    expect(funnelMouthAgeState(FABRICE, "2016-04-02", TODAY)).toBe("minor");
    expect(funnelMouthAgeState(FABRICE, "1967-07-26", TODAY)).toBe("adult");
  });

  it("sans date tapée, le roster décide — et « on ne sait pas » vaut adulte", () => {
    expect(funnelMouthAgeState(FABRICE, "", TODAY)).toBe("adult");
    expect(
      funnelMouthAgeState({ ...FABRICE, kind: "child" } as FunnelMouth, "", TODAY),
    ).toBe("minor");
    expect(
      funnelMouthAgeState(
        { ...FABRICE, birthDate: null } as FunnelMouth,
        "",
        TODAY,
      ),
    ).toBe("unknown");
  });
});
