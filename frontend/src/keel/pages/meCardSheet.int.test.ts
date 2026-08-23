import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MeCard } from "./HouseholdPage";
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

function render(sheet: KnownMouth | null): string {
  return renderToStaticMarkup(
    createElement(MeCard, {
      me: ME,
      needsGoalRow: false,
      goalEditable: false,
      busy: false,
      onSave: () => Promise.resolve(true),
      sheet: sheet === null ? null : {
        known: sheet,
        todayLocalIso: "2026-08-18",
        failure: null,
        onSave: () => Promise.resolve(true),
      },
    }),
  );
}

describe("la fiche du maître — quel formulaire la carte montre", () => {
  it("⛔ AVEC LA FICHE, LES TROIS CHAMPS EN LIGNE DISPARAISSENT", () => {
    // Deux formulaires qui écrivent les mêmes trois colonnes sur la même carte,
    // c'est la garantie qu'un jour l'un des deux cessera d'écrire ce que
    // l'autre écrit.
    //
    // ⚠️ D6 (2026-08-18) — CE N'EST PLUS UNE FENÊTRE QUI LES REMPLACE, C'EST LA
    // FICHE EN LIGNE. Les trois blocs qui structurent (qui c'est · la direction
    // avec son poids visé et son curseur · le corps) étaient derrière
    // « Fill in my details »; ils sont maintenant dans la carte, sans clic. Ce
    // qui reste derrière un bouton, ce sont les préférences alimentaires.
    const html = render(KNOWN);
    expect(html, "la fiche en ligne n'est pas rendue").toContain(
      'id="mouth-first-name"',
    );
    expect(html, "le bouton des préférences a disparu").toContain(
      // ⚠️ LA JUMELLE « tu »: c'est MA carte, et la fiche parle à la deuxième
      // personne depuis le 2026-08-19. Voir `lib/mouthVoice.ts`.
      en["household.mouth.preferences_open_you"],
    );
    // ⚠️ L'ANCRE EST UN COMPTE, PAS UNE ABSENCE, ET C'EST MESURÉ. Les deux
    // formulaires disent les MÊMES MOTS — « First name », « Save » —, donc
    // toute assertion d'absence sur un libellé rougit sur la fiche neuve,
    // c'est-à-dire sur le cas nominal. Ce qui distingue « un formulaire » de
    // « deux formulaires » est COMBIEN DE FOIS le champ apparaît.
    expect(
      html.split(en["household.member.first_name"]).length - 1,
      "deux formulaires écrivent le prénom sur la même carte",
    ).toBe(1);
  });

  /**
   * ⚠️ LA FICHE EST SEMÉE DÈS LE PREMIER RENDU, pas à un `useEffect` qui ne
   * tourne pas ici. Sans ça, la carte montrerait du vide non lu — et le Save
   * l'écrirait par-dessus ce que la base savait déjà.
   */
  it("et elle s'ouvre sur ce que la base sait déjà", () => {
    const html = render(KNOWN);
    expect(html).toContain('value="Ahmed"');
    expect(html).toContain('value="1988-02-03"');
    expect(html).toContain('value="72"');
  });

  it("⛔ …ET LE CAS QUI PASSE — sans fenêtre, les trois champs sont là", () => {
    // Sans cette moitié, la garde du dessus serait vraie d'une carte qui ne
    // rend plus rien du tout.
    const html = render(null);
    expect(html).toContain(en["household.member.first_name"]);
    expect(html).toContain(en["household.member.birth_date"]);
    expect(html).not.toContain(en["household.me.open"]);
  });

  it("la carte dit ce que la fenêtre demande, pas la phrase des trois champs", () => {
    expect(render(KNOWN)).toContain(en["household.me.sheet"]);
    expect(render(null)).toContain(en["household.me.body"]);
  });

  it("⚠️ LA FENÊTRE EST FERMÉE AU DÉPART — elle ne prend pas l'écran", () => {
    // Une fenêtre montée ouverte serait la fenêtre captive que la conception
    // refuse: « un pop-up qu'on ne peut pas fermer fait abandonner l'ajout ».
    expect(render(KNOWN)).not.toContain(en["household.mouth.later"]);
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
