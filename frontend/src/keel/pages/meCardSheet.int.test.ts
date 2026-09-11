import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MeFiche, MeSheetForm } from "./HouseholdPage";
import {
  draftFromKnown,
  type KnownMouth,
  knownMouthForOwner,
} from "../lib/mouthForm";
import type { HouseholdMemberView } from "../api/household";
import { en } from "../i18n/en";

// ===========================================================================
// D5 (2026-08-18) — LA FICHE DU MAÎTRE EST UNE FENÊTRE, SUR LA VALEUR RENDUE
//
// « Il s'ouvre à chaque ajout de personne, ET pour le compte maître lui-même:
//   sans quoi celui qui tient la maison serait le seul dont on ne sait rien. »
//                       — conception §1
//
// ⟳ 2026-09-09 — LA FICHE EN LIGNE EST REDEVENUE UNE FENÊTRE, ET CE FICHIER
// GARDE LE MÊME ARBITRAGE D'UN CRAN PLUS HAUT. Ce qui était mesuré ici est
// « deux formulaires qui écrivent les mêmes trois colonnes ne coexistent
// jamais sur cette carte »; la carte n'en porte plus AUCUN — elle porte un
// résumé (prénom, direction) et une seule porte. Les six blocs se prouvent donc
// sur le CORPS de la fenêtre (`MeSheetForm`), comme la fiche d'ajout prouve le
// sien sur `AddMouthForm`: `renderToStaticMarkup` ne rend rien d'un portail, et
// une assertion posée à travers le chrome serait verte quoi qu'il arrive.
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ, et le fichier
// entier serait un silence vert.
//
// ⚠️ LA FENÊTRE RESTE FERMÉE DANS CE FICHIER. `Modal` passe par
// `createPortal(…, document.body)` et la suite tourne en environnement `node`:
// l'ouvrir lèverait `document is not defined`. Ce que ce fichier garde est
// l'ARBITRAGE de la carte — quel formulaire elle montre — et le contenu des six
// blocs est déjà tenu par `mouthFormDialog.int.test.ts`.
// ===========================================================================

const ME: HouseholdMemberView = {
  memberId: "m-1",
  userId: "u-1",
  displayName: "Ahmed",
  role: "owner",
  ageState: "adult",
  goal: "fat_loss",
  awayHousehold: [],
  awaySelf: [],
  eatingSlots: null,
  diet: null,
};

const KNOWN: KnownMouth = {
  firstName: "Ahmed",
  birthDate: "1988-02-03",
  goal: "fat_loss",
  targetWeightKg: 72,
  paceKgPerWeek: 0.4,
  heightCm: 178,
  weightKg: 80,
  gender: "male",
  activityLevel: "trains_some",
  habits: { breakfast: "un café" },
};

function render(
  sheet: KnownMouth | null,
  needsGoalRow = false,
): string {
  return renderToStaticMarkup(
    createElement(MeFiche, {
      me: ME,
      fiche: {
        sheet: sheet === null ? null : {
          known: sheet,
          todayLocalIso: "2026-08-18",
          failure: null,
          onSave: () => Promise.resolve(true),
        },
        slots: ["breakfast", "lunch", "dinner"] as const,
        needsGoalRow,
        goalEditable: false,
        onSave: () => Promise.resolve(true),
      },
      allergies: [],
      busy: false,
      rhythm: [],
      awayWindow: { tokens: [], dates: [] },
      // L'âge du formulaire de repli se lit sur la date TAPÉE (P3): la fiche
      // reçoit le jour, elle ne le lit pas.
      todayLocalIso: "2026-08-18",
      workLunch: null,
      workLunchError: null,
      practicalConstraints: null,
      hasGoal: true,
      onSavedOwnConstraints: () => {},
      onSaveWorkLunch: () => Promise.resolve({ ok: true, reason: null }),
      onSaveAway: () => Promise.resolve(true),
      onRemoveAllergy: () => {},
    }),
  );
}

function sheetBody(known: KnownMouth): string {
  return renderToStaticMarkup(
    createElement(MeSheetForm, {
      draft: draftFromKnown(known),
      onChange: () => {},
      todayLocalIso: "2026-08-18",
      busy: false,
      failure: null,
      slots: ["breakfast", "lunch", "dinner"] as const,
      onSubmit: () => {},
    }),
  );
}

describe("la fiche du titulaire — un résumé, et une seule porte", () => {
  it("⛔ AUCUN FORMULAIRE SUR LA CARTE, dans les DEUX cas", () => {
    // Ce que la carte montrait: trente champs déjà remplis, à quelqu'un qui
    // vient lire qui mange chez lui. Ce qu'elle montre: qui c'est, ce qui
    // gouverne sa part, et le bouton qui ouvre le reste.
    //
    // ⚠️ LES DEUX BRANCHES SONT MESURÉES. `sheet === null` est le repli des
    // trois champs (une lecture n'a pas abouti, ou ce n'est pas le maître): il
    // vit dans la MÊME fenêtre, sinon la carte porterait un formulaire dans un
    // cas et pas dans l'autre.
    for (const html of [render(KNOWN), render(null)]) {
      expect(html, "la fiche est encore en ligne").not.toContain(
        'id="mouth-first-name"',
      );
      expect(
        html.split(en["household.member.first_name"]).length - 1,
        "un formulaire écrit le prénom sur la carte",
      ).toBe(0);
      expect(html, "la porte de la fiche a disparu").toContain(
        en["household.member.edit"],
      );
    }
  });

  it("elle dit qui c'est et ce qui gouverne sa part — rien d'autre", () => {
    const html = render(KNOWN);
    expect(html).toContain("Ahmed");
    expect(html, "la direction ne se lit plus sans ouvrir la fiche")
      .toContain(en["setup.goal.fat_loss"]);
    // ⛔ AUCUN CHIFFRE DE CORPS À CÔTÉ D'UN PRÉNOM. C'est la phrase que la fiche
    // donne elle-même sous « ton corps », et `KNOWN` en porte trois: 178, 80,
    // et la cible à 72.
    for (const figure of ["178", "80", "72"]) {
      expect(html, `un chiffre de corps (${figure}) est énoncé à côté du prénom`)
        .not.toContain(figure);
    }
  });

  /**
   * ⛔ LE CAS QUI PASSE, et sans lui les deux gardes du dessus seraient vertes
   * sur une carte qui n'ouvre plus rien du tout.
   *
   * ⚠️ LA FICHE EST SEMÉE SUR CE QUE LA BASE SAIT DÉJÀ: sans ça, la fenêtre
   * montrerait du vide non lu — et le Save l'écrirait par-dessus.
   */
  it("⛔ …ET LE CORPS DE LA FENÊTRE PORTE BIEN LA FICHE, semée", () => {
    const html = sheetBody(KNOWN);
    expect(html).toContain('id="mouth-first-name"');
    expect(html).toContain('value="Ahmed"');
    expect(html).toContain('value="1988-02-03"');
    expect(html).toContain('value="72"');
    // ⚠️ LA JUMELLE « tu »: c'est MA fiche, et elle parle à la deuxième
    // personne depuis le 2026-08-19. Voir `lib/mouthVoice.ts`.
    expect(html, "le bouton des préférences a disparu").toContain(
      en["household.mouth.preferences_open_you"],
    );
  });

  it("⛔ ET IL N'OUVRE PAS UNE SECONDE FENÊTRE", () => {
    // Deux `createPortal` empilés n'ont jamais été essayés dans ce dépôt — ni le
    // piège du focus, ni celui d'Échap (laquelle ferme ?). Les préférences sont
    // un accordéon DEDANS, exactement comme dans la fenêtre d'ajout.
    const src = readFileSync(
      new URL("./HouseholdPage.tsx", import.meta.url),
      "utf8",
    );
    const at = src.indexOf("export function MeSheetForm(");
    expect(at, "le corps de la fiche a disparu").toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("\n/**", at));
    expect(body, "une fenêtre est imbriquée dans la fiche")
      .not.toContain("<Modal");
    expect(body, "l'ancienne fenêtre des goûts est encore montée")
      .not.toContain("<MouthFormDialog");
    expect(body).toContain("onOpenPreferences={() => setPrefsOpen((v) => !v)}");
  });

  /**
   * ⛔ LA FALAISE SE DIT SUR LA FICHE, ET ELLE EST LA SEULE CHOSE QUI CHANGE LE
   * BOUTON. Tant que la ligne `student_goals` n'existe pas,
   * `generate-household-meal-v1` rend `goal_required` (409) — et on le
   * découvrait après avoir saisi tout le foyer.
   */
  it("sans ligne d'objectif, la fiche le DIT et promeut sa porte", () => {
    const html = render(KNOWN, true);
    expect(html).toContain(en["household.me.unlock"]);
    expect(html).toContain(en["household.me.open"]);
    // ⚠️ ET LE RÉCAPITULATIF LUI CÈDE LA PLACE: deux lignes sous un prénom,
    // dont une qui compte des blocs facultatifs, noieraient celle qui dit que
    // rien ne peut être composé.
    expect(html).not.toContain(en["household.mouth.preferences_empty"]);
  });

  it("⚠️ LA FENÊTRE EST FERMÉE AU DÉPART — elle ne prend pas l'écran", () => {
    // Une fenêtre montée ouverte serait la fenêtre captive que la conception
    // refuse: « un pop-up qu'on ne peut pas fermer fait abandonner l'ajout ».
    expect(render(KNOWN)).not.toContain(
      en["household.mouth.preferences_open_you"],
    );
  });
});

// ---------------------------------------------------------------------------
// CE QUI DÉCIDE D'OUVRIR — ET SES TROIS `null`
// ---------------------------------------------------------------------------

describe("`knownMouthForOwner` — le `null` est la garde", () => {
  const OWN = {
    birthDate: "1988-02-03",
    goal: "fat_loss",
    targetWeightKg: 72,
    paceKgPerWeek: 0.4,
  };
  const BODY = {
    heightCm: 178,
    weightKg: 80,
    gender: "male" as const,
    activityLevel: "trains_some" as const,
  };
  const HABITS = [{ slot: "breakfast", usual: "un café" }];

  const base = {
    isOwner: true,
    displayName: "Ahmed",
    ownMouth: OWN,
    body: BODY,
    habits: HABITS,
  };

  it("⛔ LE CAS QUI PASSE — tout lu, la fenêtre s'ouvre", () => {
    const known = knownMouthForOwner(base);
    expect(known).not.toBeNull();
    expect(known?.birthDate).toBe("1988-02-03");
    expect(known?.targetWeightKg).toBe(72);
    expect(known?.habits).toEqual({ breakfast: "un café" });
  });

  it("⛔ PAS MAÎTRE = PAS DE FENÊTRE — sa deuxième marche répond `not_owner`", () => {
    expect(knownMouthForOwner({ ...base, isOwner: false })).toBeNull();
  });

  it("⛔ CIBLE NON LUE = PAS DE FENÊTRE — sinon `persistMouth` l'efface", () => {
    expect(knownMouthForOwner({ ...base, ownMouth: null })).toBeNull();
  });

  it("⛔ HABITUDES NON LUES = PAS DE FENÊTRE — la porte REMPLACE la liste", () => {
    expect(knownMouthForOwner({ ...base, habits: null })).toBeNull();
  });

  it("⚠️ `[]` N'EST PAS `null` — un foyer sans habitude est un fait qu'on a lu", () => {
    const known = knownMouthForOwner({ ...base, habits: [] });
    expect(known).not.toBeNull();
    expect(known?.habits).toEqual({});
  });

  it("un corps jamais saisi laisse ses champs vides, pas à zéro", () => {
    const known = knownMouthForOwner({ ...base, body: null });
    expect(known?.heightCm).toBeNull();
    expect(known?.weightKg).toBeNull();
    expect(draftFromKnown(known!).heightCm).toBe("");
  });

  it("⛔ UN JETON HÉRITÉ NE SE FAIT PAS PASSER POUR UNE DIRECTION", () => {
    // `health`, `performance`, `recomposition` ont existé; le CHECK de la base
    // ne les accepte plus. Les caster ferait proposer une valeur refusée.
    for (const legacy of ["health", "performance", "recomposition", "wat"]) {
      const known = knownMouthForOwner({
        ...base,
        ownMouth: { ...OWN, goal: legacy },
      });
      expect(known?.goal).toBeNull();
    }
  });

  it("⛔ LE TIRET DU ROSTER N'EST PAS UN PRÉNOM", () => {
    // `loadHousehold` rend « — » pour un prénom vide. Le semer écrirait « — »
    // comme prénom au premier Save, et il survivrait à toutes les lectures.
    const known = knownMouthForOwner({ ...base, displayName: "—" });
    expect(known?.firstName).toBeNull();
    expect(draftFromKnown(known!).firstName).toBe("");
  });
});
