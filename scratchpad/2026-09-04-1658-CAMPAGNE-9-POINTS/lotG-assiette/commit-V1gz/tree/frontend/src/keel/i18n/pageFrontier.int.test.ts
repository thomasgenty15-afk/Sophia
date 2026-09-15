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
  isDeclaredPagePath,
  isLocaleRoutedPath,
  isTranslatedNamespace,
  LOCALE_ROUTED_PATHS,
  namespacesForPath,
  PAGE_NAMESPACES,
  PENDING_TRANSLATION_NAMESPACES,
  type UiLocale,
} from "./catalog";
import { en } from "./en";
import { fr } from "./fr";
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
    const declared = new Set(Object.values(PAGE_NAMESPACES).flat());
    const orphans = PENDING_TRANSLATION_NAMESPACES
      .filter((ns) => !declared.has(ns));
    expect(orphans).toEqual([]);
  });

  it("chaque namespace nommé par une page existe VRAIMENT dans le seed", () => {
    // Miroir de la ceinture d'à côté sur la liste d'attente: une table qui
    // nomme un namespace supprimé est une garde qui protège un écran mort.
    const missing = Object.entries(PAGE_NAMESPACES).flatMap(
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
    for (const [path, namespaces] of Object.entries(PAGE_NAMESPACES)) {
      // ⚠️ LA CONDITION A CHANGÉ DE CÔTÉ AU LOT 2: c'était « aucun namespace
      // n'est EN ATTENTE », c'est maintenant « tous sont TRADUITS ». La
      // différence est un namespace ni traduit ni inscrit dans la liste
      // d'attente — un oubli, donc — qui passait l'ancienne garde et laissait
      // sa page se rendre en français à moitié.
      const whole = namespaces.every(isTranslatedNamespace);
      expectChromeIn(path, whole ? "fr" : "en");
    }
  });

  it("un visiteur anglais lit tout en anglais, SAUF là où l'URL tranche", () => {
    // La direction inverse, et elle n'est pas symétrique: rien ne doit pouvoir
    // FORCER le français — À UNE EXCEPTION PRÈS, et elle est nommée.
    //
    // ⚠️ CE TEST DISAIT « page traduite comprise », SANS EXCEPTION, ET C'ÉTAIT
    // LE CONTRAT D'AVANT LE 2026-09-03. Les quatre surfaces de vente tirent
    // désormais leur langue de leur ADRESSE (`LOCALE_ROUTED_PATHS` dans
    // `catalog.ts`): `/couples` est française pour tout le monde, `/en/couples`
    // est anglaise pour tout le monde. C'est ce qui rend une balise `hreflang`
    // possible — une alternative se déclare par son URL, et il n'y en avait
    // qu'une. Le prix est écrit dans `catalog.ts`: la détection automatique ne
    // s'applique plus à ces quatre chemins.
    setChosenUiLocaleForTest("en");
    for (const path of Object.keys(PAGE_NAMESPACES)) {
      if (isLocaleRoutedPath(path)) continue;
      expectChromeIn(path, "en");
    }
  });

  it("les quatre surfaces de vente tirent leur langue de leur URL, pas du visiteur", () => {
    // LA GARDE DE LA NOUVELLE RÈGLE, dans les DEUX sens — c'est la moitié qui
    // compte. Un `isLocaleRoutedPath` qui rendrait `true` partout ferait passer
    // la boucle ci-dessus en ne mesurant plus rien; ici, chaque chemin est
    // nommé et chaque langue est attendue.
    for (const chosen of ["en", "fr"] as const) {
      setChosenUiLocaleForTest(chosen);
      for (const path of LOCALE_ROUTED_PATHS) {
        expect(uiLocaleForPath(path), `${path} (choix: ${chosen})`).toBe("fr");
        const english = path === "/" ? "/en" : `/en${path}`;
        expect(uiLocaleForPath(english), `${english} (choix: ${chosen})`).toBe("en");
      }
    }
  });

  it("le préfixe /en ne fabrique pas de page: il porte celle du chemin nu", () => {
    // Sans ça, `/en/nimporte-quoi` hériterait silencieusement des namespaces
    // d'une page déclarée, et une URL inventée se rendrait comme une vraie.
    expect(namespacesForPath("/en/couples")).toEqual(namespacesForPath("/couples"));
    expect(namespacesForPath("/en")).toEqual(namespacesForPath("/"));
    expect(namespacesForPath("/en/page-qui-nexiste-pas")).toBeNull();
  });

  it("/start est ENTIÈREMENT française — le défaut mesuré, referme", () => {
    // GARDE DE VALEUR, attente écrite en dur. Remettre `start` dans la liste
    // d'attente fait rougir cette ligne: c'est le seul endroit d'où un retour
    // en arrière sur la traduction se verrait.
    setChosenUiLocaleForTest("fr");
    expectChromeIn("/start", "fr");
  });

  it("/coach/weekly est ENTIÈREMENT anglaise — la frontière tenue", () => {
    // LE CAS QUI PASSE DE L'AUTRE CÔTÉ. Sans lui, un compteur cassé rendrait
    // « aucun mot français » partout et le test verdirait en ne mesurant rien.
    //
    // ⚠️ CE TEST A DÉJÀ DÉMÉNAGÉ QUATRE FOIS, ET IL DÉMÉNAGERA ENCORE — C'EST
    // SA NATURE. `/gyms` d'abord (traduite le 2026-08-12 avec la refonte du
    // site), `/join` ensuite (lot 2), `/app/household` ensuite (lot 3, puis
    // traduite au lot 4 quand `api/mealLabels.ts` a rejoint le seed), `/coach`
    // ensuite (traduite au lot 5).
    //
    // ⚠️ IL VIT MAINTENANT SUR UN CAS D'UNE AUTRE ESPÈCE, ET C'EST CE QUI LE
    // REND PLUS SOLIDE. `/coach/weekly` n'est pas « pas encore traduite »: ses
    // namespaces le sont TOUS, son pack français est écrit, et elle reste
    // anglaise parce que son paragraphe central vient d'une fonction edge qui
    // LÈVE sur toute locale autre que l'anglais. C'est donc la preuve que la
    // frontière est portée par `PAGE_NAMESPACES` et par rien d'autre — pas par
    // « ce qui se trouve traduit ».
    //
    // Ce qu'il prouve n'a pas changé: un chemin que la frontière rend en
    // anglais rend AUSSI son chrome en anglais, drapeau FR ou pas.
    setChosenUiLocaleForTest("fr");
    expectChromeIn("/coach/weekly", "en");
  });

  it("un chemin NON DÉCLARÉ rend l'anglais, et ne suit plus le visiteur", () => {
    // ⚠️ CE TEST DISAIT L'INVERSE, ET C'EST LE CHANGEMENT DE CONTRAT DU LOT 2.
    // Il affirmait que l'app connectée et `/legal` « suivent le choix du
    // visiteur, exactement comme avant ce lot » — ce qui était sans effet tant
    // qu'aucun namespace d'app n'était traduit: `t()` repliait sur l'anglais de
    // toute façon, et le défaut ne se voyait pas.
    //
    // Depuis que `household.*` est traduit (pour `/app/setup`), la même règle
    // produirait une couture: `/account` rend `household.plan.*` à travers
    // `api/householdPlanTrace.ts`, donc une phrase française serait apparue au
    // milieu d'un écran anglais, sans qu'aucun test ne bouge. L'anglais par
    // défaut est le seul repli qui ne peut pas coudre — il reste dans la langue
    // source.
    setChosenUiLocaleForTest("fr");
    for (const path of ["/coach/import", "/coach/weekly", "/account", "/nimporte"]) {
      expect(uiLocaleForPath(path), path).toBe("en");
    }
  });

  it("/legal reste anglaise: son corps est en dur, la promesse serait fausse", () => {
    // Le cas qui a failli passer. Déclarer `/legal` avec une liste VIDE rendait
    // son chrome en français — « tous ses namespaces sont traduits » est vrai
    // sur l'ensemble vide — et c'est ce qui a été essayé. Vérifié à l'écran: la
    // page affichait alors un en-tête et un pied de page français autour de
    // « Legal notice & terms / Who publishes sophia-coach.ai… », mille lignes
    // d'anglais en dur. Une déclaration est une PROMESSE de page entière; sur
    // un écran juridique, la tenir à moitié est pire qu'ailleurs.
    setChosenUiLocaleForTest("fr");
    expect(uiLocaleForPath("/legal")).toBe("en");
  });

  it("une page DÉCLARÉE et entièrement traduite suit le choix du visiteur", () => {
    // La direction que la règle ci-dessus ne doit pas emporter avec elle: ce
    // qui est déclaré ET traduit se rend bien en français.
    setChosenUiLocaleForTest("fr");
    for (const path of ["/auth", "/start", "/join", "/join-household", "/app/setup"]) {
      expect(uiLocaleForPath(path), path).toBe("fr");
    }
  });

  it("les CINQ écrans coach déclarés se rendent en français, les quatre autres non", () => {
    // ⚠️ CE TEST NOMME LES NEUF ROUTES UNE PAR UNE, ET C'EST VOULU. La ceinture
    // générique d'au-dessus (« aucune page cousue ») dérive son attente de la
    // table: elle vérifie la COHÉRENCE de ce qu'on a déclaré, jamais le
    // CONTENU de la déclaration. Une route coach oubliée dans `PAGE_NAMESPACES`
    // y passerait sans bruit — c'est exactement le silence par lequel `/start`
    // est restée à moitié anglaise pendant des mois.
    //
    // ⚠️ LES QUATRE DERNIÈRES NE SONT PAS UNE DETTE DE TRADUCTION, et c'est la
    // moitié du test: leurs namespaces sont écrits DES DEUX CÔTÉS. Ce qui les
    // retient est un texte anglais qui ne vient pas du seed — la synthèse du
    // lundi et l'extraction d'un plan (fonctions edge), les débats de doctrine
    // (modules Deno partagés), le catalogue d'aliments (données de migration).
    // Une future session qui « finirait la traduction » les verrait passer au
    // vert sans que rien ne soit réparé si cette liste n'existait pas.
    setChosenUiLocaleForTest("fr");
    for (
      const path of [
        "/coach",
        "/coach/meals",
        "/coach/templates",
        "/coach/billing",
        "/coach/clients/9d1c0e40-0000-4000-8000-000000000000",
      ]
    ) {
      expect(uiLocaleForPath(path), path).toBe("fr");
    }
    for (
      const path of [
        "/coach/doctrine",
        "/coach/protocol",
        "/coach/weekly",
        "/coach/import",
      ]
    ) {
      expect(uiLocaleForPath(path), path).toBe("en");
    }
  });

  it("`/join` ne capture pas `/join-household`, ni l'inverse", () => {
    // La résolution est passée de l'égalité de chaîne à `matchPath` pour que
    // les routes paramétrées de l'app soient déclarables. Le risque du
    // changement est le PRÉFIXE: deux pages voisines, deux namespaces
    // différents, et un motif trop large qui les confond.
    expect(namespacesForPath("/join")).toEqual(["join", "invite"]);
    expect(namespacesForPath("/join-household")).toEqual([
      "household_claim",
      "household",
      "start",
      "auth",
    ]);
    // Et la racine, qui capturerait tout si `matchPath` était appelé sans son
    // `end: true` par défaut.
    expect(namespacesForPath("/app/setup")).not.toEqual(
      namespacesForPath("/"),
    );
    expect(namespacesForPath("/")).toContain("home");
  });

  it("un chemin inconnu n'a pas de namespace, et n'est pas déclaré", () => {
    // Les deux fonctions doivent répondre du MÊME écran: une page qui dit
    // « oui, je suis déclarée » à `t()` (donc qui fait lever en DEV sur une clé
    // hors périmètre) et que la locale n'a pas servie en français est la
    // situation où le détecteur de couture accuse à tort.
    expect(namespacesForPath("/nimporte")).toBeNull();
    expect(isDeclaredPagePath("/nimporte")).toBe(false);
    expect(isDeclaredPagePath("/app/setup")).toBe(true);
  });

  it("ignore un slash final: /app/household/ est la même page", () => {
    // Une route qui gagne un slash ne doit pas silencieusement changer de côté
    // — c'est le genre de trou qu'on ne découvre que par un lien partagé.
    // `matchPath` s'en charge lui-même depuis le lot 2; la ceinture reste,
    // parce que c'est un comportement de bibliothèque et pas une décision à
    // nous.
    //
    // ⚠️ `/app/household/` ATTEND MAINTENANT LE FRANÇAIS, et c'est le sens fort
    // du test: la page est déclarée depuis le lot 4, donc un slash oublié qui
    // ne matcherait pas la ferait retomber en anglais — le repli sûr, donc
    // celui qu'aucune assertion « toBe("en") » ne saurait distinguer d'un
    // succès. `/coach/weekly/` tient l'autre bord (`/coach/` est déclarée
    // depuis le lot 5).
    //
    // ⚠️ `/coach/clients/x/` EST LE CAS QUI MANQUAIT, ET C'EST LE SEUL MOTIF
    // PARAMÉTRÉ DE LA TABLE. `matchPath` gère le slash final sur un chemin
    // fixe; le vérifier aussi sur `/coach/clients/:id` est ce qui empêche un
    // lien partagé vers la fiche d'un élève de retomber en anglais.
    setChosenUiLocaleForTest("fr");
    expect(uiLocaleForPath("/app/household/")).toBe("fr");
    expect(uiLocaleForPath("/coach/")).toBe("fr");
    expect(uiLocaleForPath("/coach/clients/1f8e/")).toBe("fr");
    expect(uiLocaleForPath("/coach/weekly/")).toBe("en");
    expect(uiLocaleForPath("/start/")).toBe("fr");
    expect(uiLocaleForPath("/join/")).toBe("fr");
  });
});
