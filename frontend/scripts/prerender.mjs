// UN FICHIER HTML PAR SURFACE PUBLIQUE, AVEC SON PROPRE `<head>`.
//
// ── LE DÉFAUT QUE CE SCRIPT FERME, ET IL A COÛTÉ TROIS MOIS ───────────────
// Cette application est une SPA: Vercel réécrit toute URL sans extension vers
// `index.html`, donc les NEUF surfaces publiques étaient servies avec le MÊME
// en-tête — celui du hall, en français. `components/SEO.tsx` réécrit bien
// titre, description, `og:`, `canonical` et `hreflang` page par page, mais dans
// un `useEffect`.
//
// WhatsApp, Messenger, LinkedIn, Slack, iMessage et X n'exécutent PAS le
// JavaScript. Ils lisent le HTML servi, et rien d'autre. Un `SEO` correct au
// runtime ne répare donc RIEN sur un lien partagé: mesuré le 2026-09-01, les
// quatre pages de vente du foyer annonçaient encore, en anglais, un produit
// B2B supprimé. Googlebot, lui, rend le JS — mais il le rend TARD, et il a
// d'abord besoin d'un `hreflang` qu'il ne peut lire que dans le HTML servi
// pour découvrir la variante anglaise.
//
// ── CE QUE ÇA N'EST PAS ───────────────────────────────────────────────────
// ⚠️ CE N'EST PAS DU RENDU CÔTÉ SERVEUR. Le CORPS de chaque fichier reste la
// coquille vide de Vite; seul le `<head>` est écrit. C'est délibéré: rendre le
// corps demanderait un runtime React au build, avec ses `AuthProvider`, ses
// appels Supabase et ses `useEffect` — pour un gain nul sur Google, qui rend le
// JS. Ce qui manquait n'était pas le contenu, c'était l'EN-TÊTE.
//
// ── CE QUI LE REND SÛR ────────────────────────────────────────────────────
// Le script échoue bruyamment (`process.exit(1)`) sur toute clé manquante ou
// tout marqueur introuvable. Un en-tête à moitié réécrit est pire que pas de
// prérendu du tout: il serait invisible et servirait un titre faux.
//
// Lancé par `npm run build`, après `vite build`.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DIST = join(ROOT, "dist");

const { fr } = await import(join(ROOT, "src/keel/i18n/fr.ts"));
const { en } = await import(join(ROOT, "src/keel/i18n/en.ts"));
const { pageTitle, SEO_IMAGE, SEO_IMAGE_WIDTH, SEO_IMAGE_HEIGHT, DEFAULT_ROBOTS, SITE_URL } =
  await import(join(ROOT, "src/keel/seo/head.ts"));
// ⚠️ IMPORTÉ D'ICI ET DE NULLE PART D'AUTRE. La table vit dans son propre
// fichier parce qu'elle nomme les quatre namespaces de vente: dans `head.ts`,
// que `SEO.tsx` importe, elle faisait atteindre à chaque page les clés des
// trois autres — douze coutures relevées par `pageSeams.int.test.ts`.
const { INDEXED_PAGES } = await import(join(ROOT, "src/keel/seo/indexedPages.ts"));
// ⚠️ `localeRoutes.ts` ET PAS `catalog.ts`. Le second importe `react-router-dom`
// et un `./en` sans extension — Node ne résout ni l'un ni l'autre. Le premier
// n'a aucun import de valeur, exprès, et `catalog` le réexporte.
const { localePath } = await import(join(ROOT, "src/keel/i18n/localeRoutes.ts"));

const PACKS = { fr, en };

function message(locale, key) {
  const value = PACKS[locale]?.[key];
  if (typeof value !== "string" || value.trim() === "") {
    console.error(`[prerender] clé absente ou vide: ${locale}.${key}`);
    process.exit(1);
  }
  return value;
}

/** L'échappement d'un attribut HTML. Les descriptions portent des apostrophes. */
function attr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function headFor({ path, locale }) {
  const title = pageTitle(message(locale, INDEXED_PAGES.find((p) => p.path === path).titleKey));
  const description = message(locale, INDEXED_PAGES.find((p) => p.path === path).descriptionKey);
  const frUrl = `${SITE_URL}${localePath(path, "fr")}`;
  const enUrl = `${SITE_URL}${localePath(path, "en")}`;
  const self = locale === "fr" ? frUrl : enUrl;
  const ogLocale = locale === "fr" ? "fr_FR" : "en_GB";
  const ogAlternate = locale === "fr" ? "en_GB" : "fr_FR";

  return `    <title>${attr(title)}</title>
    <meta name="description" content="${attr(description)}" />
    <meta name="robots" content="${DEFAULT_ROBOTS}" />
    <link rel="canonical" href="${self}" />

    <!-- LES ALTERNATIVES DE LANGUE. Réciproques et se contenant elles-mêmes:
         une paire dont un membre ne nomme pas l'autre est ignorée en entier. -->
    <link rel="alternate" hreflang="fr-FR" href="${frUrl}" />
    <link rel="alternate" hreflang="en" href="${enUrl}" />
    <link rel="alternate" hreflang="x-default" href="${enUrl}" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${self}" />
    <meta property="og:title" content="${attr(title)}" />
    <meta property="og:description" content="${attr(description)}" />
    <meta property="og:site_name" content="Sophia" />
    <meta property="og:locale" content="${ogLocale}" />
    <meta property="og:locale:alternate" content="${ogAlternate}" />
    <meta property="og:image" content="${SEO_IMAGE}" />
    <meta property="og:image:width" content="${SEO_IMAGE_WIDTH}" />
    <meta property="og:image:height" content="${SEO_IMAGE_HEIGHT}" />
    <meta property="og:image:alt" content="${attr(title)}" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${attr(title)}" />
    <meta name="twitter:description" content="${attr(description)}" />
    <meta name="twitter:image" content="${SEO_IMAGE}" />
    <meta name="twitter:image:alt" content="${attr(title)}" />`;
}

// ── LES BORNES DU BLOC REMPLACÉ ───────────────────────────────────────────
// `index.html` porte deux commentaires-marqueurs autour de tout ce qui est
// propre à une page. Tout ce qui est HORS de ces bornes (polices, manifeste,
// couleur de thème, vérification Search Console) est identique partout et
// n'est jamais touché.
const OPEN = "<!-- PRERENDER:HEAD:START -->";
const CLOSE = "<!-- PRERENDER:HEAD:END -->";

const shell = readFileSync(join(DIST, "index.html"), "utf8");
const start = shell.indexOf(OPEN);
const end = shell.indexOf(CLOSE);
if (start === -1 || end === -1 || end < start) {
  console.error(
    `[prerender] marqueurs introuvables dans dist/index.html. ` +
      `Ils viennent de \`index.html\` à la racine de \`frontend/\` — si quelqu'un ` +
      `les a retirés, chaque page repart avec l'en-tête du hall.`,
  );
  process.exit(1);
}

/**
 * Les fichiers à écrire, et l'URL que chacun sert.
 *
 * ⚠️ LE NOM DE FICHIER EST PLAT (`en-couples.html`) ET PAS IMBRIQUÉ. Vercel
 * sert `dist/` tel quel; un `dist/en/couples.html` marcherait aussi, mais la
 * réécriture de `vercel.json` doit alors nommer un dossier qui n'existe que si
 * ce script a tourné. Un fichier plat rend l'échec visible: la réécriture
 * pointe sur un fichier absent, et Vercel le dit au déploiement.
 */
const targets = [];
for (const page of INDEXED_PAGES) {
  for (const locale of ["fr", "en"]) {
    const urlPath = localePath(page.path, locale);
    const file = urlPath === "/"
      ? "index.html"
      : `${urlPath.replace(/^\//, "").replaceAll("/", "-")}.html`;
    targets.push({ file, urlPath, path: page.path, locale });
  }
}

for (const target of targets) {
  const html = shell.slice(0, start + OPEN.length) +
    "\n" + headFor(target) + "\n    " +
    shell.slice(end);
  // ⚠️ `lang` DU DOCUMENT AUSSI. Un robot qui lit `lang="fr"` sur une page
  // dont le titre et la description sont anglais reçoit deux réponses
  // contradictoires — c'est exactement l'état de la production aujourd'hui.
  const withLang = html.replace(/<html lang="[^"]*"/, `<html lang="${target.locale}"`);
  writeFileSync(join(DIST, target.file), withLang, "utf8");
  console.log(`[prerender] ${target.urlPath.padEnd(18)} -> dist/${target.file} (${target.locale})`);
}

console.log(`[prerender] ${targets.length} pages écrites.`);
