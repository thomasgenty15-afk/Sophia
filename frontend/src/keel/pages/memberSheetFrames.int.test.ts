import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SheetFrame } from "./HouseholdPage";
import { PAGE_NAMESPACES } from "../i18n/catalog";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";
import { sourceFamily } from "../../test/sourceFamily";

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
  return sourceFamily(new URL(rel, import.meta.url))
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
  /**
   * ⚠️ ON DÉCOUPE `MemberRow`, ET C'EST DEVENU NÉCESSAIRE (A5 point 3).
   * La fenêtre d'ajout porte MAINTENANT son propre `SheetFrame` (l'accordéon
   * des préférences), et il est écrit AVANT `MemberRow` dans le fichier: un
   * `indexOf("<SheetFrame")` sur le fichier entier viserait le sien. Ce qui est
   * gardé ici est le partage de la FICHE D'UNE BOUCHE — on lit donc sa
   * fonction, et rien d'autre.
   */
  const whole = source("./HouseholdPage.tsx");
  // ⟳ 2026-09-24 (lot 4c) — `MemberRow` VIT DANS `household/MemberRow.tsx`.
  // Dans le texte de la famille, les modules passent AVANT la page: « depuis
  // `function MemberRow(` jusqu'à la fin » courrait sur les modules suivants
  // puis sur la page entière. On découpe dans le module seul (hors registre,
  // `source` le rend tel quel), où la ligne est la dernière fonction — comme
  // elle l'était du fichier.
  const rowModule = source("./household/MemberRow.tsx");
  const rowAt = rowModule.indexOf("function MemberRow(");
  const src = rowModule.slice(rowAt);

  /**
   * ⟳ 2026-09-19 — LES DEUX CADRES SONT DEVENUS DEUX FENÊTRES.
   *
   * Ils étaient deux `SheetFrame` repliables DANS une fenêtre (A5, D5.1), et
   * sous eux vivaient encore quatre blocs: le déjeuner en semaine, les deux
   * cartes du compte, la grille d'absences. Décision du propriétaire: deux
   * fenêtres, deux contenus, rien d'autre dedans.
   *
   * ⚠️ CE QUI EST GARDÉ N'A PAS CHANGÉ D'UN MOT — c'est la GARDE DE LECTURE.
   * `BodyFields` et le brouillon de goûts figent leurs champs au montage, et
   * les portes de cette page REMPLACENT ce qu'elles trouvent: une fenêtre
   * montée sur une lecture non faite affiche du vide non lu, puis l'écrit.
   * Cicatrice `mount-snapshot-forms-need-a-loading-gate`. Ce qui a changé est
   * l'endroit où la garde est posée: le `SheetFrame` la portait, c'est la
   * fenêtre qui la porte.
   */
  it("la fenêtre des informations est gardée par la lecture des CORPS", () => {
    const i = src.indexOf('open={sheet === "identity"}');
    expect(i, "la fenêtre d'identité n'existe plus").toBeGreaterThan(0);
    const body = src.slice(i, src.indexOf('open={sheet === "preferences"}', i));
    expect(body, "la fenêtre d'identité n'est plus gardée par la lecture des corps")
      .toContain("{bodiesLoaded ? (");
    expect(body, "la garde ne dit pas qu'elle lit").toContain(
      't("household.mouth.frame_loading")',
    );
  });

  it("la fenêtre des préférences est gardée par la lecture des HABITUDES", () => {
    const i = src.indexOf('open={sheet === "preferences"}');
    expect(i, "la fenêtre des goûts n'existe plus").toBeGreaterThan(0);
    expect(src.slice(i, i + 2000)).toContain("{habitsLoaded ? (");
  });

  /**
   * ⛔ ET LES DEUX S'ATTEIGNENT DEPUIS LA LIGNE, SANS PASSER PAR L'AUTRE —
   * demandé le 2026-09-19. Un seul « Modifier » ouvrait une fenêtre sur ses
   * deux cadres dépliés: la question qu'on venait poser était à un défilement.
   *
   * ⛔ UN ÉTAT À TROIS VALEURS, ET LE CAS LE MESURE: deux booléens auraient un
   * quatrième état — les deux fenêtres ouvertes —, c'est-à-dire deux
   * `createPortal` empilés, que ce dépôt n'a jamais essayés.
   */
  it("la ligne porte les deux portes, et chacune ouvre SA fenêtre", () => {
    expect(src).toContain('onClick={() => openSheet("identity")}');
    expect(src).toContain('onClick={() => openSheet("preferences")}');
    expect(src).toContain(
      'const [sheet, setSheet] = React.useState<"identity" | "preferences" | null>',
    );
    expect(src, "les deux fenêtres peuvent être ouvertes ensemble")
      .not.toContain("const [prefsOpen, setPrefsOpen]");
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
    // ⚠️ SUR LE FICHIER ENTIER: l'état et son passage vivent dans la PAGE, pas
    // dans la ligne — `src` est découpé sur `MemberRow`.
    expect(whole, "`bodies` est reparti d'une Map vide")
      .toMatch(/const \[bodies, setBodies\] = React\.useState<\s*Map<string, MemberBodyView> \| null\s*>\(null\)/);
    expect(whole).toContain("bodiesLoaded={bodies !== null}");
  });

  /**
   * ⟳ 2026-09-21 — LE RÉCAPITULATIF DE LA LIGNE N'EXISTE PLUS.
   *
   * Il disait, une fois par bouche: « Rien de renseigné — le plan se compose
   * sans. Ça se remplit plus tard. » ou « Déjà renseigné : ses dégoûts et son
   * régime. » Retiré sur demande, avec celui de la carte du titulaire.
   *
   * ⛔ CE CAS TENAIT « il réutilise le compteur de la fiche, pas un compte
   * maison ». Il ne peut plus le tenir, mais la propriété SOUS-JACENTE reste à
   * garder: le compteur et ses deux phrases vivent encore, et c'est le cadre
   * repliable du FORMULAIRE qui les emploie — là où le résumé est vraiment la
   * contrepartie d'un repli. Ce qui est mesuré ici est donc devenu: la ligne
   * n'en a plus, et personne n'a recopié un compte à la main pour compenser.
   */
  it("⛔ la ligne n'a plus de récapitulatif, et n'en a pas refait un à la main", () => {
    expect(src).not.toContain('t("household.mouth.preferences_empty")');
    expect(src).not.toContain('t("household.mouth.preferences_filled"');
    // ⛔ ET SURTOUT PAS UN COMPTE MAISON À LA PLACE. `filledPreferenceBlocks`
    // porte deux cicatrices (« une bulle éteinte compte si son moment a été
    // RÉPONDU », « `allergiesNone` EST une réponse »); un second compteur
    // écrit ici les perdrait toutes les deux en silence.
    expect(src).not.toContain("filledPreferenceBlocks({");
  });

  /**
   * ⚠️ ET LE COMPTEUR N'EST PAS MORT POUR AUTANT. Le retirer « puisque la
   * ligne ne s'en sert plus » casserait le cadre repliable du formulaire, où
   * le résumé EST la contrepartie du repli — on y referme un bloc qu'on vient
   * de remplir.
   */
  it("le compteur et ses deux phrases vivent encore, dans le CADRE", () => {
    // ⚠️ `filledPreferenceBlocks(draft)` ET PAS `({`: le cadre le nourrit du
    // brouillon NU, là où les cartes lui passaient un objet recomposé
    // (`{...draft, allergies, allergiesNone}`). C'est la forme d'appel qui a
    // disparu avec elles, pas la fonction.
    expect(whole).toContain("filledPreferenceBlocks(draft)");
    expect(whole).toContain('t("household.mouth.preferences_empty")');
    expect(whole).toContain("blocks: blockList(");
  });

  /**
   * ⛔ CE QUI EST UN GESTE RESTE DEHORS. Un `indexOf` sur la fermeture du
   * second cadre sépare les deux moitiés du panneau: la présence et les deux
   * retraits doivent tomber APRÈS.
   */
  it("⟳ la grille de présence n'est plus montée par cette page", () => {
    // ⛔ ELLE N'EST PAS « SORTIE DU CADRE », ELLE EST PARTIE. « Quand cette
    // bouche n'est pas là » était le troisième bloc que la fiche posait en plus
    // de ses deux moitiés; il a été retiré le 2026-09-19.
    //
    // ⚠️ LA FONCTIONNALITÉ VIT: `MealPickerGrid` est montée par `/app/plan`,
    // par l'entonnoir et par `MealBuilder`, et `keel_household_set_member_away`
    // n'a pas bougé. C'est la troisième porte qui part.
    expect(whole).not.toContain("<MemberAwayOpener");
    expect(whole).not.toContain("<MealPickerGrid");
  });

  /**
   * ⛔ CE QUI EST UN GESTE NE VA PAS DANS UNE FENÊTRE DE QUESTIONS — sauf
   * quand le sortir le rend plus facile. « Retirer du foyer » DÉTRUIT la
   * ligne: il reste AU FOND de la fenêtre qu'on a ouverte, jamais sur la ligne
   * qu'on parcourt.
   */
  it("« Retirer du foyer » reste au fond de la fenêtre, pas sur la ligne", () => {
    const at = src.indexOf('t("household.member.remove")');
    expect(at, "le retrait a disparu").toBeGreaterThan(0);
    const firstModal = src.indexOf('open={sheet === "identity"}');
    expect(at, "le retrait est remonté sur la ligne").toBeGreaterThan(firstModal);
  });

  /**
   * ⛔ ET « RETIRER L'ACCÈS » N'EST OFFERT QU'UNE FOIS. Il vivait au fond de la
   * fiche; il vit maintenant dans l'en-tête, avec l'état qu'il inverse. Le
   * laisser aux DEUX endroits ferait d'un geste irréversible un geste qu'on
   * fait par accident au second.
   */
  it("« Retirer l'accès » n'est rendu qu'à un seul endroit", () => {
    const hits = [...whole.matchAll(/t\("household\.member\.detach"\)/g)];
    expect(hits.length, "le geste de détachement est offert deux fois").toBe(1);
  });

  /**
   * ⟳ 2026-09-19 — LE CAS « LE DÉJEUNER RESTE AU-DESSUS DE LA GRILLE » EST
   * PARTI AVEC SES DEUX BLOCS. Les deux sont retirés de cette page; leur ordre
   * relatif n'a plus de sujet. L'absence de la carte est gardée là où la
   * question vit — `components/memberWorkLunchCard.int.test.ts`.
   */
});

describe("le renversement est écrit là où vit la phrase inverse", () => {
  it("`MouthFormDialog` porte le renversement, daté et borné", () => {
    const raw = sourceFamily(
      new URL("../components/MouthFormDialog.tsx", import.meta.url),
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
