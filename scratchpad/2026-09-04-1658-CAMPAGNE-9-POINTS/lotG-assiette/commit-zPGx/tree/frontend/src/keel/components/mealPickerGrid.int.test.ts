import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MealPickerGridBody } from "./MealPickerGrid";
import {
  type AwayMark,
  awayKindOf,
  type PresenceState,
  presenceStateOf,
} from "../lib/presenceMarks";
import { en as EN } from "../i18n/en";

// ===========================================================================
// L3 (2026-08-18) — LA GRILLE À TROIS ÉTATS, SUR LA VALEUR RENDUE
//
// ⚠️ CE FICHIER MONTE LE COMPOSANT ET LIT SON HTML. Un test de source serait
// vert sur du code mort — deux vérificateurs de ce chantier en ont trouvé. La
// seule question qui compte est « QU'EST-CE QUE LE LECTEUR VOIT ».
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: le glob de `vitest.config.ts` est
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ, et le fichier
// entier serait un silence vert.
//
// CE QUE CES TESTS GARDENT:
//
//   1. LE DEUX-ÉTATS EST INTACT. Trois écrans montent cette grille et n'ont pas
//      tous à connaître le troisième état: sans `onSaveMarks`, l'écran est
//      celui d'hier, à la case à cocher près.
//   2. LE TROIS-ÉTATS MONTRE CE QUI EST ENREGISTRÉ — « dehors » se relit
//      « dehors », pas « absent ». Sans ça, on aurait coché et relu autre chose.
//   3. LA PHRASE QUI SÉPARE LES DEUX ÉTATS est là quand il y a un repas dehors,
//      et seulement là.
// ===========================================================================

const DAYS = ["mon", "tue"];
const DATES = ["2026-08-17", "2026-08-18"];
const RHYTHM = [
  { slot: "lunch" as const, size: null },
  { slot: "dinner" as const, size: null },
];

/**
 * ⚠️ ON MONTE LE CORPS, PAS LA FENÊTRE. `Modal` passe par `createPortal` vers
 * `document.body`, et ce dépôt n'a ni jsdom ni testing-library: monter la
 * fenêtre entière tomberait sur « document is not defined ». Le corps est
 * exporté pour ça, et l'état qu'on lui passe ici est CELUI QUE LE COMPOSANT DU
 * DESSUS CALCULE — la même `presenceStateOf`, sur la même colonne relue.
 */
function render(over: {
  away?: readonly AwayMark[];
  threeState?: boolean;
  /**
   * D4 ④ — LES MIDIS « DEHORS » POSÉS HORS DE LA FENÊTRE MONTRÉE.
   *
   * ⚠️ IL A FALLU L'AJOUTER ICI, ET C'EST UN TROU QUE CE LOT A TROUVÉ: les
   * fichiers de test sont EXCLUS de `tsconfig.app.json` (motif `test`), donc
   * une prop devenue obligatoire ne fait rougir NI `tsc` NI vitest — elle
   * arrive `undefined`, la comparaison `> 0` est fausse, et la ligne ne se
   * rend jamais pendant que le test reste vert.
   */
  outsideWindow?: number;
} = {}): string {
  const marks = (over.away ?? []).map((a) => ({
    day: a.day,
    slots: a.slots,
    kind: awayKindOf(a),
  }));
  const state = new Map<string, PresenceState>();
  for (const day of DAYS) {
    for (const r of RHYTHM) {
      const at = presenceStateOf(marks, day, r.slot);
      if (at !== "at_table") state.set(`${day}|${r.slot}`, at);
    }
  }
  return renderToStaticMarkup(
    createElement(MealPickerGridBody, {
      days: DAYS,
      dates: DATES,
      rhythm: RHYTHM,
      state,
      threeState: Boolean(over.threeState),
      outsideWindow: over.outsideWindow ?? 0,
      setCell: () => {},
      toggle: () => {},
      save: () => {},
      onClose: () => {},
      busy: false,
    }),
  );
}

describe("D4 ④ — le compteur dit ce que la fenêtre ne montre pas", () => {
  it("⛔ LE DÉFAUT — les midis hors fenêtre sont NOMMÉS", () => {
    // L'étape 3 annonce cinq midis « dehors »; une fenêtre ouverte un mardi
    // n'en montre que quatre. Le compteur d'à côté n'était pas faux — il
    // comptait ce qui est à l'écran — mais il démentait la phrase d'avant d'une
    // unité, et un nombre faux d'un cran est pire qu'absent.
    const html = render({
      threeState: true,
      away: [{ day: "tue", slots: ["lunch"], kind: "eating_out" }],
      outsideWindow: 1,
    });
    expect(html).toContain(EN["meals.picker.some_out_hidden_one"]);
    // ⚠️ ET ON N'ADDITIONNE PAS: le compteur des cases visibles reste à 1.
    expect(html).toContain(EN["meals.picker.some_out_one"].replace("{n}", "1"));
  });

  it("le pluriel sort au-delà d'un, avec son nombre", () => {
    const html = render({
      threeState: true,
      away: [{ day: "tue", slots: ["lunch"], kind: "eating_out" }],
      outsideWindow: 3,
    });
    expect(html).toContain(
      EN["meals.picker.some_out_hidden_many"].replace("{n}", "3"),
    );
  });

  it("⛔ LE CAS QUI PASSE — rien hors fenêtre, AUCUNE des deux formes", () => {
    // ⚠️ FIXTURE DURCIE APRÈS UNE MUTATION QUI NE MORDAIT PAS. Retirer le
    // `> 0` de la garde laissait ce test VERT: `plural(0, …)` rend la forme
    // PLURIELLE, donc chercher la forme au singulier ne prouvait rien. L'écran
    // aurait alors affiché « 0 autres sont cochés des jours que ce plan ne
    // couvre pas » — un compteur qui annonce zéro, c'est-à-dire le piège du
    // 0–0 déjà payé sur le chiffre du jour: une phrase qui restreint son sujet
    // en avouant qu'il n'y a aucune raison de le restreindre.
    const html = render({
      threeState: true,
      away: [{ day: "tue", slots: ["lunch"], kind: "eating_out" }],
      outsideWindow: 0,
    });
    expect(html).not.toContain(EN["meals.picker.some_out_hidden_one"]);
    expect(html).not.toContain(
      EN["meals.picker.some_out_hidden_many"].replace("{n}", "0"),
    );
    // La moitié invariable de la phrase, celle que les deux formes partagent:
    // aucune des deux ne peut passer sans elle.
    expect(html).not.toContain("this plan does not cover");
  });

  it("le deux-états ne la rend pas: il ne connaît pas « dehors »", () => {
    const html = render({
      away: [{ day: "tue", slots: ["lunch"], kind: "eating_out" }],
      outsideWindow: 2,
    });
    expect(html).not.toContain(
      EN["meals.picker.some_out_hidden_many"].replace("{n}", "2"),
    );
  });
});

describe("L3 — le deux-états reste l'écran d'hier", () => {
  it("sans `onSaveMarks`: des cases à cocher, aucun choix à trois", () => {
    const html = render();
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain(EN["meals.picker.state_eating_out"]);
    expect(html).not.toContain(EN["meals.picker.state_away"]);
  });

  it("une case marquée « dehors » y reste DÉCOCHÉE, jamais cochée", () => {
    // Elle n'est pas à table: un écran qui ne connaît pas le troisième état
    // doit quand même dire « pas de repas ici ». La montrer cochée ferait
    // attendre une part que le plan ne composera pas.
    const html = render({
      away: [{ day: "tue", slots: ["lunch"], kind: "eating_out" }],
    });
    // Deux jours × deux moments = quatre cases; trois cochées, une non.
    expect(html.split('checked=""').length - 1).toBe(3);
  });
});

describe("L3 — le trois-états", () => {
  it("offre les trois choix, nommés par ce que le plan FAIT", () => {
    const html = render({ threeState: true });
    expect(html).toContain(EN["meals.picker.state_at_table"]);
    expect(html).toContain(EN["meals.picker.state_eating_out"]);
    expect(html).toContain(EN["meals.picker.state_away"]);
    // Et plus aucune case à cocher: deux contrôles pour une même case seraient
    // deux façons de dire la même chose.
    expect(html).not.toContain('type="checkbox"');
  });

  it("« dehors » se RELIT « dehors », et « absent » se relit « absent »", () => {
    // ⚠️ LA GARDE CENTRALE DE CET ÉCRAN. Si la relecture perdait le jeton, la
    // personne aurait fait le geste et retrouverait autre chose — et le
    // premier enregistrement écrirait cet autre chose.
    const html = render({
      threeState: true,
      away: [
        { day: "tue", slots: ["lunch"], kind: "eating_out" },
        { day: "mon", slots: ["dinner"], kind: "away" },
      ],
    });
    // ⚠️ L'ORDRE DES ATTRIBUTS EST CELUI QUE REACT ÉMET (`value` puis
    // `selected`), et il est lu tel quel: le réécrire « proprement » ferait un
    // test qui ne mesure plus rien.
    const selected = [...html.matchAll(/<option value="([a-z_]+)" selected=""/g)]
      .map((m) => m[1]);
    // Quatre cases, dans l'ordre de rendu: lundi/midi, mardi/midi (dehors),
    // lundi/dîner (absent), mardi/dîner.
    expect(selected).toEqual([
      "at_table",
      "eating_out",
      "away",
      "at_table",
    ]);
  });

  it("dit ce que « dehors » veut dire, et SEULEMENT quand il y en a", () => {
    const none = render({ threeState: true });
    expect(none).not.toContain("leaves the plan");

    const some = render({
      threeState: true,
      away: [{ day: "tue", slots: ["lunch"], kind: "eating_out" }],
    });
    // « Sort du plan, pas de la journée » est la phrase qui sépare les deux
    // états. Sans elle, on lit deux mots pour une seule idée.
    expect(some).toContain("leaves the plan, not the day");

    // Une absence seule ne la déclenche PAS: elle ne sort pas du plan, elle
    // sort de la semaine.
    const away = render({
      threeState: true,
      away: [{ day: "tue", slots: ["lunch"], kind: "away" }],
    });
    expect(away).not.toContain("leaves the plan");
  });

  it("laisse la place de LIRE les trois libellés, et le deux-états garde la sienne", () => {
    // ⚠️ MESURÉ AU NAVIGATEUR À 320 px, LE 2026-08-18 (L3-B). À `min-w-[26rem]`
    // une colonne fait 49 px; « Eating here » demande 64 px de texte plus la
    // flèche du `select`. Les deux libellés se rendaient donc « Eating » — les
    // DEUX ÉTATS QUE CE LOT EXISTE POUR SÉPARER devenaient identiques à l'œil,
    // sur le seul écran où on les choisit.
    //
    // Le conteneur défile (`overflow-x-auto`), donc la page ne part pas de
    // travers pour autant: `document.scrollWidth` reste à 320, vérifié.
    expect(render({ threeState: true })).toContain("min-w-[52rem]");
    // Et la case à cocher, elle, n'a jamais eu ce besoin: l'élargir ferait
    // défiler un tableau qui tenait, pour trois écrans qui n'ont rien demandé.
    expect(render()).toContain("min-w-[26rem]");
    expect(render()).not.toContain("min-w-[52rem]");
  });

  it("une JOURNÉE ENTIÈRE se déplie sur tous les moments du rythme", () => {
    // La grille n'a pas de case « toute la journée » — en avoir une ferait deux
    // façons de dire la même chose.
    const html = render({
      threeState: true,
      away: [{ day: "mon", slots: [], kind: "eating_out" }],
    });
    // ⚠️ L'ORDRE DES ATTRIBUTS EST CELUI QUE REACT ÉMET (`value` puis
    // `selected`), et il est lu tel quel: le réécrire « proprement » ferait un
    // test qui ne mesure plus rien.
    const selected = [...html.matchAll(/<option value="([a-z_]+)" selected=""/g)]
      .map((m) => m[1]);
    expect(selected).toEqual([
      "eating_out",
      "at_table",
      "eating_out",
      "at_table",
    ]);
  });
});
