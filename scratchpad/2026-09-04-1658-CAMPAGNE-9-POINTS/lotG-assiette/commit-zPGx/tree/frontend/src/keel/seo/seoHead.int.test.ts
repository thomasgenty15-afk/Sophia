// LES DEUX ÉCRIVAINS DU `<head>` DISENT-ILS LA MÊME CHOSE ?
//
// ── CE QUE CE FICHIER GARDE ───────────────────────────────────────────────
// L'en-tête d'une page publique est écrit deux fois, par deux programmes qui
// ne se rencontrent jamais: `components/SEO.tsx` au runtime, et
// `scripts/prerender.mjs` au build (à partir de `index.html`). Rien dans le
// langage ne les oblige à s'accorder, et ils ont DÉJÀ divergé: mesuré le
// 2026-09-01, la `description` du HTML statique était juste pendant que ses
// `og:` vendaient, en anglais, un produit B2B supprimé — sur les quatre pages
// du foyer. Trois mois d'aperçus faux, invisibles depuis le navigateur parce
// que `SEO` corrigeait tout au premier rendu.
//
// Ces tests lisent les FICHIERS, pas un rendu: c'est la seule façon de voir ce
// qu'un robot qui n'exécute rien recevra.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { isLocaleRoutedPath, LOCALE_ROUTED_PATHS, localePath } from "../i18n/localeRoutes";
import { DEFAULT_ROBOTS, pageTitle, SEO_IMAGE, TITLE_MAX } from "./head";
import { INDEXED_PAGES } from "./indexedPages";

const INDEX_HTML = readFileSync(resolve(__dirname, "../../../index.html"), "utf8");

/** La valeur d'un `content=` pour une balise identifiée par son attribut. */
function metaContent(html: string, selector: string): string | null {
  const re = new RegExp(`<meta ${selector}[^>]*content="([^"]*)"`, "i");
  return re.exec(html)?.[1] ?? null;
}

/**
 * La valeur d'une clé dans un pack, ou `null`.
 *
 * ⚠️ POURQUOI CE DÉTOUR PLUTÔT QU'UN `fr[key]` DIRECT. `fr` est typé
 * `TranslatedMessages` — le SOUS-ENSEMBLE des clés dont le pack français est
 * écrit — pendant que `MessageKey` les nomme toutes. Indexer l'un par l'autre
 * ne typecheck pas, et le `as Record<string, string>` qui « répare » ça
 * désarmerait précisément ce que ces tests vérifient: qu'une clé nommée par
 * `INDEXED_PAGES` existe VRAIMENT des deux côtés. Ici la vérification est faite
 * à l'exécution, ce qui est la seule qui vaille pour une donnée de catalogue.
 */
function lookup(pack: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = pack[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function decode(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

describe("le HTML statique ne peut pas s'écarter du catalogue", () => {
  // ⚠️ LA RÈGLE ÉCRITE DANS `index.html` DEPUIS LE 2026-09-01 — « toute phrase
  // ici est une COPIE MOT POUR MOT de `home.seo_*` » — ÉTAIT DÉJÀ VIOLÉE quand
  // on l'a mesurée: le fichier portait « Ce qu'on mange, quand on cuisine… »
  // pendant que `home.seo_description` disait « Repas, équilibre, objectifs… ».
  // Une règle en commentaire ne garde rien. Celle-ci, si.
  it("le titre du hall est celui du catalogue français", () => {
    const title = /<title>([^<]*)<\/title>/.exec(INDEX_HTML)?.[1];
    expect(title).toBe(pageTitle(fr["home.seo_title"]));
  });

  it("les quatre descriptions du hall sont la même phrase, celle du catalogue", () => {
    // `description`, `og:description` et `twitter:description` sont trois
    // balises pour une phrase. Elles ont divergé; on vérifie les trois.
    const expected = fr["home.seo_description"];
    for (const selector of [
      'name="description"',
      'property="og:description"',
      'name="twitter:description"',
    ]) {
      const found = metaContent(INDEX_HTML, selector);
      expect(found, selector).not.toBeNull();
      expect(decode(found!), selector).toBe(expected);
    }
  });

  it("les trois titres du hall aussi", () => {
    const expected = pageTitle(fr["home.seo_title"]);
    for (const selector of [
      'property="og:title"',
      'name="twitter:title"',
      'property="og:image:alt"',
    ]) {
      expect(decode(metaContent(INDEX_HTML, selector) ?? ""), selector).toBe(expected);
    }
  });

  it("l'image de partage n'est pas l'icône carrée, et porte ses dimensions", () => {
    // LE DÉFAUT NOMMÉ DANS `SEO.tsx`: `apple-touch-icon.png` est une icône
    // carrée de 1024; servie en `summary_large_image`, tout aperçu rendait un
    // carré rogné dans un cadre 1.91:1. La production le fait ENCORE.
    expect(metaContent(INDEX_HTML, 'property="og:image"')).toBe(SEO_IMAGE);
    expect(INDEX_HTML).not.toContain('og:image" content="https://sophia-coach.ai/apple-touch-icon.png"');
    expect(metaContent(INDEX_HTML, 'property="og:image:width"')).toBeTruthy();
    expect(metaContent(INDEX_HTML, 'property="og:image:height"')).toBeTruthy();
  });

  it("le hall se déclare indexable, et son robots est celui du code", () => {
    expect(metaContent(INDEX_HTML, 'name="robots"')).toBe(DEFAULT_ROBOTS);
  });

  it("les marqueurs du prérendu sont présents — sans eux, chaque page reprend cet en-tête", () => {
    // La garde la plus bête et la plus utile: `scripts/prerender.mjs` sort en
    // erreur si les bornes disparaissent, mais il sort en erreur AU BUILD, dans
    // un journal de déploiement que personne ne lit. Ici, ça rougit avant.
    expect(INDEX_HTML).toContain("<!-- PRERENDER:HEAD:START -->");
    expect(INDEX_HTML).toContain("<!-- PRERENDER:HEAD:END -->");
    expect(INDEX_HTML.indexOf("<!-- PRERENDER:HEAD:START -->"))
      .toBeLessThan(INDEX_HTML.indexOf("<!-- PRERENDER:HEAD:END -->"));
  });

  it("le hall déclare ses alternatives de langue, réciproques", () => {
    expect(INDEX_HTML).toContain('hreflang="fr-FR" href="https://sophia-coach.ai/"');
    expect(INDEX_HTML).toContain('hreflang="en" href="https://sophia-coach.ai/en"');
    expect(INDEX_HTML).toContain('hreflang="x-default" href="https://sophia-coach.ai/en"');
  });
});

describe("la table du prérendu et les pages routées par langue se recouvrent", () => {
  it("chaque page indexée est routée par langue, et réciproquement", () => {
    // ⚠️ LES DEUX LISTES SONT LA MÊME VUE SOUS DEUX ANGLES: `LOCALE_ROUTED_PATHS`
    // dit « ces pages tirent leur langue de leur URL », `INDEXED_PAGES` dit
    // « voici ce que dit leur en-tête ». Une page dans l'une et pas dans
    // l'autre est un trou silencieux — soit une page routée que le prérendu
    // sert avec l'en-tête du hall, soit une page prérendue dont la langue
    // dépend encore du navigateur du visiteur.
    const indexed = INDEXED_PAGES.map((p) => p.path).sort();
    expect(indexed).toEqual([...LOCALE_ROUTED_PATHS].sort());
    for (const page of INDEXED_PAGES) {
      expect(isLocaleRoutedPath(page.path), page.path).toBe(true);
    }
  });

  it("chaque clé nommée existe dans LES DEUX packs", () => {
    // Une clé absente d'un pack fait sortir `prerender.mjs` en erreur et casse
    // le déploiement. Mieux vaut le savoir ici.
    const missing: string[] = [];
    for (const page of INDEXED_PAGES) {
      for (const key of [page.titleKey, page.descriptionKey]) {
        if (lookup(fr, key) === null) missing.push(`fr.${key}`);
        if (lookup(en, key) === null) missing.push(`en.${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("les deux langues d'une page ont des URL distinctes et bien formées", () => {
    for (const page of INDEXED_PAGES) {
      const frPath = localePath(page.path, "fr");
      const enPath = localePath(page.path, "en");
      expect(frPath, page.path).toBe(page.path);
      expect(enPath, page.path).not.toBe(frPath);
      expect(enPath.startsWith("/en"), page.path).toBe(true);
      // Aller-retour: la variante anglaise doit se ramener au chemin français.
      expect(localePath(enPath, "fr"), page.path).toBe(page.path);
    }
  });

  it("aucun titre ne dépasse ce qu'un résultat de recherche affiche", () => {
    // ⚠️ SEUIL INDICATIF, ET ASSUMÉ COMME TEL. Google coupe en PIXELS (~600px),
    // pas en caractères; `TITLE_MAX` est la borne prudente correspondante, et
    // `pageTitle` s'en sert pour décider s'il ajoute la marque. Ce test
    // n'existe pas pour être exact, il existe pour qu'un titre qui double de
    // longueur se fasse remarquer avant d'être en ligne — c'est exactement ce
    // que le suffixe « | Sophia » inconditionnel faisait au hall.
    const long: string[] = [];
    for (const page of INDEXED_PAGES) {
      for (const [locale, pack] of [["fr", fr], ["en", en]] as const) {
        const raw = lookup(pack, page.titleKey);
        // Une clé absente est le sujet du test d'à côté, pas de celui-ci.
        if (raw === null) continue;
        const title = pageTitle(raw);
        if (title.length > TITLE_MAX) long.push(`${locale} ${page.path}: ${title.length} — ${title}`);
      }
    }
    expect(long).toEqual([]);
  });
});
