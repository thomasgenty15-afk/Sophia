// KEEL — LA FRONTIÈRE DE LANGUE PASSE-T-ELLE AU BORD DE LA PAGE, OU AU MILIEU ?
//
// ── LE DÉFAUT QUE CE FICHIER EMPÊCHE DE REVENIR ────────────────────────────
// `catalog.ts` a affirmé pendant des mois que les pages non traduites
// « restent en anglais quand la vitrine est en français », et que c'était
// « une frontière VISIBLE et déclarée, pas un repli silencieux au milieu d'une
// page ». C'était faux, et ça se voyait à l'œil nu: mesuré le 2026-08-12,
// `/start` rendait un en-tête et un pied de page FRANÇAIS (« Langue »,
// « Mentions légales », « Ta méthode, qui répond en ton absence. ») autour d'un
// corps entièrement ANGLAIS. Le chrome vit dans `public.*`, qui est traduit;
// le corps vivait dans `start.*`, qui ne l'était pas. Cinq namespaces étaient
// dans ce cas, pas un.
//
// Une phrase dans un commentaire ne peut pas tenir cette promesse. Ce fichier
// la tient: il REND le chrome des pages publiques et compte, mot par mot, de
// quel côté de la frontière chacun tombe.
//
// ── DEUX GARDES, ET ELLES NE FONT PAS LE MÊME TRAVAIL ──────────────────────
// 1. La garde de CLASSE (« aucune page mi-française »): son attente est
//    dérivée du catalogue, donc elle suit automatiquement le prochain
//    namespace ajouté ou traduit. C'est elle qui couvre ce qu'on écrira
//    demain — et c'est aussi pour ça qu'elle ne peut PAS rougir quand on
//    change le catalogue: elle vérifie la cohérence, pas une valeur.
// 2. Les deux gardes de VALEUR (`/start` est française, `/gyms` est anglaise):
//    leur attente est écrite en dur. Remettre `start` en attente de traduction
//    fait rougir la première; c'est le seul moyen qu'un retour en arrière sur
//    le lot de traduction se voie.
//
// Cicatrice du dépôt: une garde a besoin d'un cas qui PASSE, sinon elle bloque
// tout en ressemblant à une garde qui marche. D'où `/gyms`, qui prouve que
// l'anglais forcé est bien atteint — et pas que le test ne trouve jamais rien.
//
// `createElement` plutôt que du JSX, et `renderToStaticMarkup` plutôt que
// jsdom: même raison qu'en face dans `components/weeklyCheckInDialog.int.test.ts`
// — le glob partagé est `src/**/*.int.test.ts`, et ce dépôt n'a ni jsdom ni
// testing-library. La langue d'un chrome est un rendu, pas une interaction.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import {
  isPendingTranslationNamespace,
  PUBLIC_NAMESPACES_PENDING_TRANSLATION,
  PUBLIC_PAGE_NAMESPACES,
  type UiLocale,
} from "./catalog";
import { en } from "./en";
import { fr } from "./fr.public";
import { setChosenUiLocaleForTest, uiLocaleForPath } from "./runtime";

/**
 * `uiLocale()` lit `location.pathname` à l'appel — c'est ce qui permet à la
 * frontière de tenir sans qu'aucune page n'ait à se déclarer. En Node il n'y a
 * pas de `location`, donc on la pose.
 */
function atPath(pathname: string): void {
  Object.defineProperty(globalThis, "location", {
    value: { pathname, search: "", href: `http://localhost${pathname}` },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "location");
  setChosenUiLocaleForTest("en");
});

/** L'échappement de React, pour retrouver une apostrophe dans le markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Le chrome public d'une page: en-tête + pied de page, rendus au chemin donné.
 *
 * L'`audience` n'est pas passée (donc « coach », le défaut): elle décide quels
 * liens s'affichent, jamais dans quelle langue. En prendre une seule rend le
 * test lisible, et en rend même DAVANTAGE — la nav des portes commerciales
 * ajoute des mots à compter.
 */
function renderChrome(pathname: string): string {
  atPath(pathname);
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [pathname] },
      createElement(PublicHeader, null),
      createElement(PublicFooter, null),
    ),
  );
}

/**
 * De quel côté de la frontière tombe chaque mot du chrome.
 *
 * Générique par construction: on parcourt TOUTES les clés `public.*`/`brand.*`
 * du seed dont la traduction diffère de l'anglais, et on regarde laquelle des
 * deux est dans le markup. Épingler trois libellés à la main aurait vieilli au
 * premier renommage — et l'en-tête est en cours de refonte pendant ce lot.
 */
function chromeHits(markup: string): {
  fr: string[];
  en: string[];
} {
  const frHits: string[] = [];
  const enHits: string[] = [];
  for (const key of Object.keys(en) as Array<keyof typeof en>) {
    if (!key.startsWith("public.") && !key.startsWith("brand.")) continue;
    const english = en[key];
    const french = (fr as Record<string, string>)[key];
    // Une valeur identique dans les deux langues (un nom de marque, « Contact »)
    // ne distingue rien: elle ne peut ni accuser ni disculper.
    if (french === undefined || french === english) continue;
    if (markup.includes(escapeHtml(french))) frHits.push(key);
    else if (markup.includes(escapeHtml(english))) enHits.push(key);
  }
  return { fr: frHits, en: enHits };
}

/** Le chrome rendu au chemin donné est-il entièrement dans la langue attendue ? */
function expectChromeIn(pathname: string, expected: UiLocale): void {
  const hits = chromeHits(renderChrome(pathname));
  const [wanted, other] = expected === "fr"
    ? [hits.fr, hits.en]
    : [hits.en, hits.fr];
  // Le « rien de l'autre langue » est l'assertion qui compte: c'est ce que
  // « moitié française, moitié anglaise » viole. Le « au moins un » est la
  // ceinture contre un test qui ne trouverait plus rien du tout et verdirait.
  expect(other, `${pathname}: mots de l'autre langue dans le chrome`).toEqual([]);
  expect(
    wanted.length,
    `${pathname}: aucun mot de chrome reconnu — le compteur ne mesure plus rien`,
  ).toBeGreaterThan(0);
}

describe("la frontière de langue passe au bord des pages, jamais au milieu", () => {
  it("chaque namespace en attente est porté par une page déclarée", () => {
    // Sans ça, la garde ne couvre rien: un namespace peut être « en attente »
    // sans qu'aucune page ne soit forcée en anglais, et la couture revient sur
    // l'écran de quelqu'un. C'est le test qui rougit le jour où on ajoute un
    // namespace à la liste d'attente sans dire quelle page l'affiche.
    const declared = new Set(Object.values(PUBLIC_PAGE_NAMESPACES).flat());
    const orphans = PUBLIC_NAMESPACES_PENDING_TRANSLATION
      .filter((ns) => !declared.has(ns));
    expect(orphans).toEqual([]);
  });

  it("chaque namespace nommé par une page existe VRAIMENT dans le seed", () => {
    // Miroir de la ceinture d'à côté sur la liste d'attente: une table qui
    // nomme un namespace supprimé est une garde qui protège un écran mort.
    const missing = Object.entries(PUBLIC_PAGE_NAMESPACES).flatMap(
      ([path, namespaces]) =>
        namespaces
          .filter((ns) => !Object.keys(en).some((k) => k.startsWith(`${ns}.`)))
          .map((ns) => `${path} -> ${ns}`),
    );
    expect(missing).toEqual([]);
  });

  it("un visiteur français ne voit AUCUNE page cousue", () => {
    // LA GARDE DE CLASSE. L'attente est dérivée du catalogue, donc elle vaut
    // aussi pour la page qu'on ajoutera demain: si l'un de ses namespaces est
    // en attente, la page entière est anglaise; sinon elle est entièrement
    // française. Ce qu'elle interdit, c'est le mélange — dans les deux sens.
    setChosenUiLocaleForTest("fr");
    for (const [path, namespaces] of Object.entries(PUBLIC_PAGE_NAMESPACES)) {
      const pending = namespaces.some(isPendingTranslationNamespace);
      expectChromeIn(path, pending ? "en" : "fr");
    }
  });

  it("un visiteur anglais lit tout en anglais, page traduite comprise", () => {
    // La direction inverse, et elle n'est pas symétrique: rien ne doit pouvoir
    // FORCER le français. Une page traduite reste anglaise pour qui n'a pas
    // choisi le français.
    setChosenUiLocaleForTest("en");
    for (const path of Object.keys(PUBLIC_PAGE_NAMESPACES)) {
      expectChromeIn(path, "en");
    }
  });

  it("/start est ENTIÈREMENT française — le défaut mesuré, referme", () => {
    // GARDE DE VALEUR, attente écrite en dur. Remettre `start` dans la liste
    // d'attente fait rougir cette ligne: c'est le seul endroit d'où un retour
    // en arrière sur la traduction se verrait.
    setChosenUiLocaleForTest("fr");
    expectChromeIn("/start", "fr");
  });

  it("/join est ENTIÈREMENT anglaise — la frontière déclarée, tenue", () => {
    // LE CAS QUI PASSE DE L'AUTRE CÔTÉ. Sans lui, un compteur cassé rendrait
    // « aucun mot français » partout et le test verdirait en ne mesurant rien.
    //
    // ⚠️ C'ÉTAIT `/gyms` JUSQU'AU 2026-08-12. La refonte du site a réécrit
    // `/gyms` et `/communities` et livré leur pack français dans le même geste,
    // donc elles ont quitté `PUBLIC_NAMESPACES_PENDING_TRANSLATION` — et ce
    // test, qui a besoin d'une page RÉELLEMENT en attente pour prouver qu'il
    // mesure quelque chose, s'est déplacé sur `/join` (`join.*` + `invite.*`,
    // tous deux encore en attente).
    // Le jour où plus AUCUNE page publique n'est en attente, ce test n'a plus
    // de sujet: il faudra le supprimer, pas lui inventer une page.
    setChosenUiLocaleForTest("fr");
    expectChromeIn("/join", "en");
  });

  it("ne touche à rien en dehors de la vitrine", () => {
    // L'app connectée et les pages sans namespace (`/legal`, `/auth`) suivent
    // le choix du visiteur, exactement comme avant ce lot.
    setChosenUiLocaleForTest("fr");
    for (const path of ["/app/today", "/legal", "/auth", "/coach", "/nimporte"]) {
      expect(uiLocaleForPath(path), path).toBe("fr");
    }
  });

  it("ignore un slash final: /join/ est la même page que /join", () => {
    // Une route qui gagne un slash ne doit pas silencieusement retrouver la
    // couture — c'est le genre de trou qu'on ne découvre que par un lien
    // partagé. (L'exemple était `/gyms` avant sa traduction — voir le test
    // ci-dessus.)
    setChosenUiLocaleForTest("fr");
    expect(uiLocaleForPath("/join/")).toBe("en");
    expect(uiLocaleForPath("/start/")).toBe("fr");
  });
});
