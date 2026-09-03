import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SheetFrame } from "./HouseholdPage";
import { PAGE_NAMESPACES } from "../i18n/catalog";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

// ===========================================================================
// A5 (2026-09-03) — LA FICHE D'UNE BOUCHE A DEUX CADRES NOMMÉS
//
// Ce que ce fichier garde tient en trois phrases, et les trois sont des
// défauts mesurés de ce dépôt, pas des préférences de mise en page:
//
//   · UN CADRE REPLIÉ DIT CE QU'IL CACHE. Le repli avait été retiré le
//     2026-08-19 (« il faut arrêter avec le dépliable ») sur le motif exact
//     « une réponse repliée est une réponse invisible ». Il revient PAYÉ: le
//     récapitulatif reste à l'écran quand le contenu n'y est plus, et les deux
//     cadres s'ouvrent par défaut. Le renversement est écrit là où vit la
//     phrase inverse — `components/MouthFormDialog.tsx`.
//
//   · UN CADRE MONTÉ SUR UNE LECTURE NON FAITE AFFICHE DU VIDE NON LU, PUIS
//     L'ÉCRIT. `BodyFields` et la carte des habitudes figent leurs champs AU
//     MONTAGE, et les portes de cette page REMPLACENT ce qu'elles trouvent.
//     C'est la cicatrice `mount-snapshot-forms-need-a-loading-gate`, et
//     `bodies` la portait à découvert: son état partait de `new Map()`, donc
//     « pas encore lu » et « lu, personne n'a de corps » étaient le même fait.
//
//   · CE QUI EST UN GESTE NE VA PAS DANS UN CADRE DE QUESTIONS. « Retirer
//     l'accès » et « Retirer du foyer » sont deux irréversibles distincts
//     (`cannot_remove_owner` / `cannot_detach_owner` côté base, deux libellés
//     côté écran); les ranger sous un titre de formulaire ferait d'un geste
//     brutal une case à cocher. Ils restent DEHORS, comme la fenêtre de
//     présence, qui est une date et pas un trait de la personne.
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait jamais collecté, et le fichier
// entier serait un silence vert.
//
// ⚠️ ON MONTE LE CADRE, PAS LA PAGE. `HouseholdPage` ne se rend pas sous
// `renderToStaticMarkup` (session, routeur, quatre lectures). Ce que le rendu
// ne peut pas dire — QUEL cadre reçoit QUELLE lecture — est lu dans la source,
// commentaires blanchis (cicatrice `caller-audit-must-strip-comments`: ce
// fichier-là PARLE longuement des cadres, et un grep naïf compterait ces
// morts-là comme des vivants).
// ===========================================================================

const PATH = "/app/household";

function onPage(): void {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest("en");
}

function frame(patch: Partial<Parameters<typeof SheetFrame>[0]> = {}): string {
  onPage();
  return renderToStaticMarkup(
    createElement(SheetFrame, {
      title: "TITRE",
      open: true,
      onToggle: () => {},
      loaded: true,
      children: createElement("p", null, "LE-CONTENU"),
      ...patch,
    }),
  );
}

function source(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

describe("⛔ la garde de chargement d'un cadre", () => {
  it("`loaded` faux: aucun champ, et une phrase qui dit qu'on lit", () => {
    const html = frame({ loaded: false });
    expect(html, "un cadre s'est monté sur une lecture non faite")
      .not.toContain("LE-CONTENU");
    expect(html, "et il ne dit même pas qu'il lit")
      .toContain(en["household.mouth.frame_loading"]);
  });

  // LE CAS QUI PASSE, et sans lui la garde ci-dessus serait verte sur un cadre
  // qui ne rend JAMAIS rien — une garde qui bloque tout ressemble à une garde
  // qui marche.
  it("`loaded` vrai: le contenu est là", () => {
    const html = frame({ loaded: true });
    expect(html).toContain("LE-CONTENU");
    expect(html).not.toContain(en["household.mouth.frame_loading"]);
  });

  it("la garde passe AVANT le contenu, même ouvert", () => {
    expect(frame({ loaded: false, open: true })).not.toContain("LE-CONTENU");
  });
});

describe("⟳ le repli est payé par ce qu'il montre (D5.1)", () => {
  it("replié: le contenu est DÉMONTÉ, et le récapitulatif reste", () => {
    const html = frame({ open: false, summary: "TROIS-CHOSES" });
    expect(html, "un cadre replié garde ses champs dans le document")
      .not.toContain("LE-CONTENU");
    expect(html, "replié, il ne dit plus rien de ce qu'il cache")
      .toContain("TROIS-CHOSES");
  });

  it("ouvert: le contenu est là, et le récapitulatif ne double pas", () => {
    const html = frame({ open: true, summary: "TROIS-CHOSES" });
    expect(html).toContain("LE-CONTENU");
    expect(html, "le résumé répète à côté de ce qu'il résume")
      .not.toContain("TROIS-CHOSES");
  });

  it("l'état est porté par `aria-expanded`, pas par le seul chevron", () => {
    expect(frame({ open: true })).toContain('aria-expanded="true"');
    expect(frame({ open: false })).toContain('aria-expanded="false"');
  });

  it("l'aide du cadre ne s'affiche que déplié", () => {
    expect(frame({ open: true, hint: "AIDE" })).toContain("AIDE");
    expect(frame({ open: false, hint: "AIDE" })).not.toContain("AIDE");
  });
});

describe("les deux cadres de la fiche, et ce qui reste dehors", () => {
  const src = source("./HouseholdPage.tsx");

  it("« Informations personnelles » est gardé par la lecture des CORPS", () => {
    const i = src.indexOf('t("household.member.frame_identity")');
    expect(i, "le cadre d'identité n'existe plus").toBeGreaterThan(0);
    expect(
      src.slice(i, i + 400),
      "le cadre d'identité n'est plus gardé par la lecture des corps",
    ).toContain("loaded={bodiesLoaded}");
  });

  it("« Préférences alimentaires » est gardé par la lecture des HABITUDES", () => {
    const i = src.indexOf('t("household.member.frame_preferences")');
    expect(i).toBeGreaterThan(0);
    expect(src.slice(i, i + 400)).toContain("loaded={habitsLoaded}");
  });

  /**
   * ⛔ `bodies` NE PART PLUS DE `new Map()`.
   *
   * Les deux faits — « pas encore lu » et « lu, personne n'a de corps » —
   * étaient le MÊME état, et `BodyFields` fige ses trois champs au montage. Une
   * ligne ouverte avant le retour de la lecture affichait donc trois champs
   * vides sur une bouche renseignée. `bodiesLoaded` en dérive.
   */
  it("la lecture des corps sait dire qu'elle n'a pas eu lieu", () => {
    expect(src, "`bodies` est reparti d'une Map vide")
      .toMatch(/const \[bodies, setBodies\] = React\.useState<\s*Map<string, MemberBodyView> \| null\s*>\(null\)/);
    expect(src).toContain("bodiesLoaded={bodies !== null}");
  });

  it("les deux cadres s'ouvrent par défaut", () => {
    expect(src).toContain("const [identityOpen, setIdentityOpen] = React.useState(true)");
    expect(src).toContain("const [prefsOpen, setPrefsOpen] = React.useState(true)");
  });

  /**
   * LE RÉCAPITULATIF PASSE PAR LE COMPTEUR DE LA FICHE, pas par un compte
   * maison: `filledPreferenceBlocks` porte les deux cicatrices (« une bulle
   * éteinte compte si son moment a été RÉPONDU », « `allergiesNone` est une
   * réponse »), et les DEUX phrases sont celles du bouton de la fiche d'ajout.
   */
  it("le récapitulatif réutilise le compteur ET les phrases de la fiche", () => {
    expect(src).toContain("filledPreferenceBlocks({");
    expect(src).toContain('t("household.mouth.preferences_empty")');
    expect(src).toContain('t("household.mouth.preferences_filled"');
    expect(src, "la grammaire de liste a été recopiée au lieu d'être partagée")
      .toContain("blocks: blockList(");
  });

  /**
   * ⛔ CE QUI EST UN GESTE RESTE DEHORS. Un `indexOf` sur la fermeture du
   * second cadre sépare les deux moitiés du panneau: la présence et les deux
   * retraits doivent tomber APRÈS.
   */
  it("la présence et les deux retraits ne sont dans aucun cadre", () => {
    // ⚠️ « DANS UN CADRE » SE MESURE PAR ENCADREMENT, PAS PAR « APRÈS ». Depuis
    // A5 §5.5, « Retirer l'accès » vit dans l'EN-TÊTE de la ligne, avec l'état
    // qu'il inverse — donc AVANT le premier cadre. La propriété gardée est la
    // même: aucun de ces trois n'est entre l'ouverture et la fermeture des
    // cadres, parce qu'un geste n'est pas une réponse à un formulaire.
    const firstFrame = src.indexOf("<SheetFrame");
    const lastFrameEnd = src.lastIndexOf("</SheetFrame>");
    expect(firstFrame, "il n'y a plus de cadre").toBeGreaterThan(0);
    expect(lastFrameEnd).toBeGreaterThan(firstFrame);
    for (
      const key of [
        't("household.away.title")',
        't("household.member.detach")',
        't("household.member.remove")',
      ]
    ) {
      const at = src.indexOf(key);
      expect(at, `${key} a disparu`).toBeGreaterThan(0);
      const inside = at > firstFrame && at < lastFrameEnd;
      expect(inside, `${key} est rangé dans un cadre de questions`).toBe(false);
    }
  });

  /**
   * ⛔ ET « RETIRER L'ACCÈS » N'EST OFFERT QU'UNE FOIS. Il vivait au fond de la
   * fiche; il vit maintenant dans l'en-tête, avec l'état qu'il inverse. Le
   * laisser aux DEUX endroits ferait d'un geste irréversible un geste qu'on
   * fait par accident au second.
   */
  it("« Retirer l'accès » n'est rendu qu'à un seul endroit", () => {
    const hits = [...src.matchAll(/t\("household\.member\.detach"\)/g)];
    expect(hits.length, "le geste de détachement est offert deux fois").toBe(1);
  });

  /**
   * LA CARTE DU DÉJEUNER (A6) EST DANS LE CADRE DES PRÉFÉRENCES, et toujours
   * AU-DESSUS de la grille qu'elle pré-remplit — la propriété qu'A6 a posée ne
   * doit pas tomber en changeant la boîte qui l'entoure.
   */
  it("le déjeuner de semaine reste au-dessus de la grille de présence", () => {
    const card = src.indexOf("<MemberWorkLunchCard");
    const away = src.indexOf('t("household.away.title")');
    const lastFrameEnd = src.lastIndexOf("</SheetFrame>");
    expect(card).toBeGreaterThan(0);
    expect(card, "la carte du déjeuner est sortie du cadre des préférences")
      .toBeLessThan(lastFrameEnd);
    expect(card, "la grille est passée au-dessus de la question")
      .toBeLessThan(away);
  });
});

describe("le renversement est écrit là où vit la phrase inverse", () => {
  it("`MouthFormDialog` porte le renversement, daté et borné", () => {
    const raw = readFileSync(
      new URL("../components/MouthFormDialog.tsx", import.meta.url),
      "utf8",
    );
    expect(raw, "le renversement n'est pas écrit là où vit la décision d'avant")
      .toContain("RENVERSEMENT PARTIEL — A5 (D5.1), 2026-09-03");
    expect(raw, "le renversement ne dit pas ce qu'il NE renverse pas")
      .toContain("TIENT POUR\n * CETTE FENÊTRE-CI");
  });
});

describe("i18n: les clés du cadre existent dans les DEUX packs", () => {
  const keys = [
    "household.member.frame_identity",
    "household.member.frame_identity_hint",
    "household.member.frame_preferences",
    "household.member.frame_preferences_hint",
    "household.mouth.frame_loading",
  ] as const;

  it("aucune n'est absente, aucune n'est l'anglais recopié", () => {
    for (const k of keys) {
      expect(en[k], `${k} manque en anglais`).toBeTruthy();
      expect(fr[k], `${k} manque en français`).toBeTruthy();
      expect(fr[k], `${k} est l'anglais recopié`).not.toBe(en[k]);
    }
  });

  it("le namespace `household` est déclaré sur cette page", () => {
    expect(PAGE_NAMESPACES[PATH]).toContain("household");
  });
});
