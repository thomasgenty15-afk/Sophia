import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SelfStep } from "./SetupPage";
import { emptyMouthDraft, type MouthFormDraft } from "../lib/mouthForm";
import { en } from "../i18n/en";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

// ===========================================================================
// 2026-09-20 — LA CARTE DU TITULAIRE SE REPLIE UNE FOIS ENREGISTRÉE
//
// Demandé à l'écran: « une fois que le compte maître a enregistré ses
// informations, il faudrait que ça se rétracte comme quand on fait ajouter une
// personne, comme ça ça continue pas de prendre trop de place ».
//
// ── CE QUE CE FICHIER GARDE, ET POURQUOI IL EXISTE À PART ────────────────
// `SelfStep` est monté par deux autres fichiers de test, et TOUS DEUX passent
// ses props derrière un `as unknown as Parameters<typeof SelfStep>[0]`. Aucun
// tsconfig ne couvre les tests (`tsconfig.app.json` exclut `**/*.test.*`), donc
// une prop requise ajoutée à ce composant n'y fait échouer NI la compilation NI
// le rendu: elle arrive `undefined`, et `undefined` est faux — c'est-à-dire
// « replié ». Les deux fichiers restent verts parce qu'ils passent `onSave:
// null`, où le repli est désarmé par construction. C'est une coïncidence, pas
// une preuve, et ce fichier-ci est la preuve.
//
// ── LES DEUX ÉTATS SE PROUVENT L'UN CONTRE L'AUTRE ───────────────────────
// Un test qui ne vérifierait QUE le repli resterait vert sur une carte qui ne
// montre jamais ses champs. Chaque assertion a donc son contraire dans l'autre
// état — c'est « une garde a besoin d'un cas qui passe ».
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ.
// ===========================================================================

const PATH = "/app/setup";
const TODAY = "2026-09-20";

const BODY: MouthFormDraft = {
  ...emptyMouthDraft(),
  firstName: "Ada",
  birthDate: "1990-05-04",
  goal: "fat_loss",
  heightCm: "170",
  weightKg: "72",
  gender: "female",
};

/**
 * LA CARTE « MOI », DANS LA BRANCHE QUI A UN BOUTON D'ENREGISTREMENT.
 *
 * ⛔ `branch` N'EST PAS « solo », ET CE N'EST PAS UN DÉTAIL: en solo `onSave`
 * vaut `null`, la carte force `editing` à vrai, et il n'y a rien à mesurer.
 */
function html(
  { editing, saved, legacyActivityOnly = false, noTargetRead = false }: {
    editing: boolean;
    saved: boolean;
    /** Un compte d'avant le 2026-08-20: le cran seul, aucun axe. */
    legacyActivityOnly?: boolean;
    /** La fenêtre où la lecture de la cible n'a pas encore rendu. */
    noTargetRead?: boolean;
  },
): string {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest("en");
  return renderToStaticMarkup(
    createElement(SelfStep, {
      draft: {
        firstName: BODY.firstName,
        birthDate: BODY.birthDate,
        heightCm: BODY.heightCm,
        weightKg: BODY.weightKg,
        gender: BODY.gender,
        activityLevel: null,
        goal: BODY.goal,
        diet: "",
        allergies: [],
        allergiesNone: false,
      },
      onChange: () => {},
      branch: "pair",
      onSave: () => {},
      busy: false,
      target: noTargetRead ? null : {
        draft: BODY,
        onChange: () => {},
        todayLocalIso: TODAY,
      },
      onOpenPreferences: noTargetRead ? null : () => {},
      editing,
      onToggleEdit: () => {},
      saved: saved
        ? {
          person: {
            firstName: "Ada",
            heightCm: 170,
            weightKg: 72,
            gender: "female",
            activityLevel: "sedentary",
            dayActivity: legacyActivityOnly ? null : "seated",
            sportFrequency: legacyActivityOnly ? null : "1_2",
            appetite: null,
            kind: "adult",
            birthDate: "1990-05-04",
            goal: "fat_loss",
          },
          target: { targetWeightKg: 65, paceKgPerWeek: 0.45 },
        }
        : null,
    } as unknown as Parameters<typeof SelfStep>[0]),
  );
}

/** Le champ du prénom: présent seulement quand la carte est ouverte. */
const FIRST_NAME_INPUT = 'id="setup-first-name"';

describe("la carte du titulaire, ouverte", () => {
  it("montre ses champs", () => {
    expect(html({ editing: true, saved: true })).toContain(FIRST_NAME_INPUT);
  });

  it("propose d'enregistrer, et rien à modifier", () => {
    const out = html({ editing: true, saved: true });
    expect(out).toContain(en["household.member.save"]);
    expect(out).not.toContain(en["setup.mouths.edit"]);
  });
});

describe("la carte du titulaire, repliée", () => {
  it("retire ses champs", () => {
    expect(html({ editing: false, saved: true })).not.toContain(
      FIRST_NAME_INPUT,
    );
  });

  /**
   * ⚠️ UN RÉSUMÉ, PAS UN BLANC. C'est la règle que la ligne d'une bouche
   * applique déjà: « il n'y a rien ici » et « ça se règle derrière Modifier »
   * ne sont pas la même phrase.
   */
  it("rend à la place ce qu'on sait de lui", () => {
    const out = html({ editing: false, saved: true });
    expect(out).toContain(en["setup.people.goal"]);
    expect(out).toContain(en["setup.mouths.body"]);
    expect(out).toContain("170 cm");
    expect(out).toContain("65 kg");
  });

  /**
   * ⛔ LA VOIX DU RÉSUMÉ EST CELLE DE LA CARTE. Les deux libellés à la
   * troisième personne de la ligne d'une bouche (« Ce qu'il ou elle vise »,
   * « Ses journées ») ne doivent pas se lire sur sa propre fiche.
   */
  it("parle à la deuxième personne", () => {
    const out = html({ editing: false, saved: true });
    expect(out).not.toContain(en["setup.mouths.goal"]);
    expect(out).not.toContain(en["setup.activity.member_label"]);
  });

  it("offre de rouvrir, et plus d'enregistrer", () => {
    const out = html({ editing: false, saved: true });
    expect(out).toContain(en["setup.mouths.edit"]);
    expect(out).not.toContain(en["household.member.save"]);
  });

  /**
   * ── « MODIFIER » EST EN HAUT, PAS EN BAS ────────────────────────────────
   *
   * Demandé à l'écran: « la carte du compte maître en étant rétractée doit
   * avoir "modifier" en haut à droite comme la carte des gens qui mangent dans
   * la famille ». Le premier jet le mettait au BAS de la carte, à la place
   * qu'occupait « Enregistrer ».
   *
   * ⚠️ ON MESURE L'ORDRE DANS LE MARQUAGE, PAS LA POSITION EN PIXELS. Le rendu
   * est statique (`renderToStaticMarkup`), il n'y a ni CSS ni mise en page —
   * mais « avant le premier libellé du résumé » suffit à distinguer un en-tête
   * d'un pied de carte, et c'est très exactement ce qui avait été inversé.
   */
  it("porte « Modifier » AVANT le résumé, donc en tête de carte", () => {
    const out = html({ editing: false, saved: true });
    const edit = out.indexOf(en["setup.mouths.edit"]);
    const firstRow = out.indexOf(en["setup.people.birth_date"]);
    expect(edit).toBeGreaterThan(-1);
    expect(firstRow).toBeGreaterThan(-1);
    expect(edit).toBeLessThan(firstRow);
  });

  /** Et il disparaît pendant l'édition: la carte est déjà ouverte. */
  it("ne propose pas « Modifier » quand la carte est ouverte", () => {
    expect(html({ editing: true, saved: true })).not.toContain(
      en["setup.mouths.edit"],
    );
  });

  /**
   * ⟳ 2026-09-20 — LA PORTE DES PRÉFÉRENCES PART AVEC LES CHAMPS.
   *
   * Elle survivait au repli au premier jet, par symétrie avec la ligne d'une
   * bouche où elle vivait hors du bloc d'édition. Le rendu mesuré a tranché:
   * sous un résumé de six lignes, elle ajoutait un bouton PLUS son
   * récapitulatif, par personne — sur un écran replié exactement pour tenir.
   * « Il faut que ce soit hyper simple et clair. »
   *
   * Les deux moitiés se prouvent l'une contre l'autre: absente repliée,
   * présente ouverte. Sans la seconde, on aurait pu la supprimer tout court et
   * ce fichier serait resté vert.
   */
  it("n'affiche plus la porte des préférences", () => {
    expect(html({ editing: false, saved: true })).not.toContain(
      en["household.mouth.preferences_open_you"],
    );
  });

  it("mais « Modifier » la rouvre", () => {
    expect(html({ editing: true, saved: true })).toContain(
      en["household.mouth.preferences_open_you"],
    );
  });

  /**
   * ── LA BARRE DE FIN: LA PORTE À GAUCHE, L'AVANCE À DROITE ──────────────
   *
   * Cette page a une règle datée du 2026-08-19 — « Retour » à gauche,
   * l'avance à droite —, et c'est pour elle que la barre de bas d'écran a été
   * séparée en deux. « Enregistrer » est l'avance de la carte; la porte
   * facultative ne doit pas occuper la position que l'écran réserve à ce qui
   * fait avancer, quelques dizaines de pixels au-dessus du « Continuer » de
   * l'étape.
   *
   * ⚠️ ON MESURE L'ORDRE DANS LE MARQUAGE. Le rendu est statique, il n'y a ni
   * CSS ni mise en page — mais les deux boutons sont frères dans un
   * `justify-between`, donc l'ordre du marquage EST l'ordre à l'écran. Ce qui
   * ne se teste pas ici, c'est qu'ils soient sur la même ligne.
   */
  it("met la porte des préférences avant « Enregistrer »", () => {
    const out = html({ editing: true, saved: true });
    const door = out.indexOf(en["household.mouth.preferences_open_you"]);
    const save = out.indexOf(en["household.member.save"]);
    expect(door).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(-1);
    expect(door).toBeLessThan(save);
  });

  /**
   * ⛔ ET « Enregistrer » SURVIT À L'ABSENCE DE LA PORTE.
   *
   * Il voyage jusqu'à la barre par le `action` de la porte, et la porte
   * demande une lecture faite (`target`). Le plier DANS elle le ferait
   * disparaître pendant la fenêtre où la lecture n'a pas rendu — un
   * formulaire rempli sans bouton pour l'écrire. C'est le cas que ce test
   * garde, et il tombe dès qu'on simplifie le ternaire de la carte.
   */
  it("garde « Enregistrer » quand la lecture n'a pas rendu la cible", () => {
    const out = html({ editing: true, saved: true, noTargetRead: true });
    expect(out).not.toContain(en["household.mouth.preferences_open_you"]);
    expect(out).toContain(en["household.member.save"]);
  });

  /**
   * ── LE DÉFAUT QUE CE CAS FERME, MESURÉ À L'ÉCRAN LE 2026-09-20 ──────────
   *
   * Le résumé lisait `activityLevel`, un cran que l'entonnoir ne demande plus
   * depuis le 2026-08-20 — il rendait donc « — » pour TOUT LE MONDE. Ses mots:
   * « quand c'est rétracté, "vos journées elles sont comment ?" ne remonte pas
   * sur la carte ». Ce qui est posé à l'écran, ce sont les DEUX AXES.
   */
  it("remonte les deux axes d'activité, pas le cran mort", () => {
    const out = html({ editing: false, saved: true });
    expect(out).toContain(en["setup.day_activity.label"]);
    expect(out).toContain(en["setup.day_activity.seated"]);
    expect(out).toContain(en["setup.sport.label"]);
    expect(out).toContain(en["setup.sport.1_2"]);
  });

  /**
   * ⛔ ET LE CRAN D'AVANT RESTE LE REPLI NOMMÉ. Un compte ouvert avant le
   * 2026-08-20 ne porte QUE `profiles.activity_level`, et c'est cette
   * valeur-là que le moteur applique pour lui. Rendre deux tirets pendant que
   * le calcul utilise un vrai cran serait la même faute dans l'autre sens.
   */
  it("retombe sur le cran d'avant quand les deux axes sont muets", () => {
    const out = html({ editing: false, saved: true, legacyActivityOnly: true });
    expect(out).toContain(en["setup.activity.label"]);
    expect(out).toContain(en["setup.activity.sedentary"]);
    expect(out).not.toContain(en["setup.day_activity.label"]);
  });

  /**
   * ⚠️ LA LECTURE PAS FAITE NE SE RABAT PAS SUR LE BROUILLON. `saved` à `null`
   * veut dire « on ne sait pas encore ce qui est en base »; afficher le
   * brouillon à la place ferait passer pour enregistré ce qui ne l'est pas.
   */
  it("n'invente rien quand la lecture n'a pas rendu", () => {
    const out = html({ editing: false, saved: false });
    expect(out).not.toContain(FIRST_NAME_INPUT);
    expect(out).not.toContain("170 cm");
  });
});
