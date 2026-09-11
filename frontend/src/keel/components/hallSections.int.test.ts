import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";
import { PublicHeader } from "./PublicHeader";

// LES ANCRES DE L'EN-TÊTE POINTENT-ELLES SUR QUELQUE CHOSE ?
//
// ── LE DÉFAUT QUE CE FICHIER EXISTE POUR ATTRAPER ──────────────────────────
// Depuis le 2026-09-08, la seconde rangée de `PublicHeader` porte les trois
// sections du hall (`#experience`, `#a-table`, `#offre`). Le lien et sa cible
// vivent dans DEUX fichiers qui ne se connaissent pas: la table
// `HALL_SECTIONS` ici, et les `id` des `<Section>` de `HomePage`. Renommer un
// `id` — ce qui arrive au premier remaniement de la page — donne trois liens
// qui ne font RIEN. Aucun typecheck ne le voit, aucune erreur console ne le
// dit: on clique, et il ne se passe rien.
//
// ⚠️ CE TEST LIT LA SORTIE RENDUE DE L'EN-TÊTE, pas sa table: c'est ce qui
// garantit qu'on vérifie les ancres RÉELLEMENT servies. La cible, elle, est
// cherchée dans la SOURCE de `HomePage` — la monter demanderait le routeur,
// le contexte d'authentification et un appel réseau, pour vérifier un
// attribut. La limite est assumée et nommée: si quelqu'un déplaçait un `id`
// dans une variable, ce test verdirait à tort.
//
// ⚠️ IL NE GARDE PAS `#top` ni `#questions`. Ce sont des ancres INTERNES à la
// page (le retour en haut, le lien vers la FAQ); elles ne traversent pas de
// frontière de fichier, et c'est la traversée qui casse.

const HOME_SOURCE = readFileSync(
  resolve(__dirname, "../pages/HomePage.tsx"),
  "utf8",
);

function renderHeaderAt(pathname: string): string {
  Object.defineProperty(globalThis, "location", {
    value: { pathname, search: "", href: `http://localhost${pathname}` },
    configurable: true,
    writable: true,
  });
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [pathname] },
      createElement(PublicHeader, null),
    ),
  );
}

function hashesIn(markup: string): string[] {
  return [...markup.matchAll(/href="(#[a-z-]+)"/g)].map((m) => m[1]);
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "location");
  setChosenUiLocaleForTest("en");
});

describe("les ancres que l'en-tête sert sur le hall", () => {
  it("existent toutes comme `id` d'une section de `HomePage`", () => {
    const hashes = hashesIn(renderHeaderAt("/"));
    // La ceinture de la ceinture: zéro ancre rendrait la boucle vide et le
    // test vert sur un en-tête qui n'en sert aucune.
    expect(hashes.length).toBe(3);
    for (const hash of hashes) {
      expect(HOME_SOURCE, `${hash} ne désigne aucune section`)
        .toContain(`id="${hash.slice(1)}"`);
    }
  });

  it("sont les mêmes sur `/en`, et leurs libellés sont traduits", () => {
    expect(hashesIn(renderHeaderAt("/en"))).toEqual(hashesIn(renderHeaderAt("/")));
    const french = renderHeaderAt("/");
    const english = renderHeaderAt("/en");
    for (const key of ["public.nav.experience", "public.nav.household", "public.nav.offer"] as const) {
      expect(french, key).toContain(fr[key].replace(/'/g, "&#x27;"));
      expect(english, key).toContain(en[key]);
    }
  });

  it("ne se rendent PAS ailleurs que sur le hall", () => {
    // ⛔ `/legal` monte le même en-tête sous l'audience par défaut. Une ancre
    // vers `#offre` y désignerait une section que la page n'a pas: un lien qui
    // ne fait rien au clic, sur la seule page publique où l'on vérifie qui
    // nous sommes.
    for (const path of ["/legal", "/start", "/join"]) {
      expect(hashesIn(renderHeaderAt(path)), path).toEqual([]);
    }
  });
});
