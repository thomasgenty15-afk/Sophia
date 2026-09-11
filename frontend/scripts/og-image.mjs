// KEEL — LA PLANCHE D'APERÇU DE LIEN, RÉGÉNÉRABLE.
//
//   node scripts/og-image.mjs        (depuis `frontend/`)
//
// ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
// `public/og-image.png` est la seule image que voient WhatsApp, Messenger,
// LinkedIn, Slack, iMessage et X quand quelqu'un partage une page. Un binaire
// sans source est un binaire que personne n'ose retoucher: le fichier qu'on
// vient de remplacer était un visuel « IKIZEN » violet d'une marque
// ANTÉRIEURE, resté dans `public/` sans qu'aucun écrivain ne le cite — donc
// jamais vu, jamais corrigé. La source vit ici pour que la prochaine
// correction soit une édition, pas un travail d'archéologie.
//
// ── CE QUE LA PLANCHE DOIT DIRE, ET DANS QUEL ORDRE ────────────────────────
// Le titre du hall MOT POUR MOT, puis la figure « une cuisson, la part de
// chacun » — la seule image que les concurrents ne peuvent pas produire
// (BRIEF-LANDING-FOYER §6).
//
// ⚠️ LA COPIE EST LUE DANS `i18n/fr.ts`, PLUS RECOPIÉE ICI — ET C'EST LA
// CORRECTION DU 2026-09-10. Recopiée, elle a divergé exactement comme prévu:
// la planche servie annonçait encore « Une semaine de repas, décidée. / Ce
// qu'on mange, quand on cuisine, ce qu'il faut acheter. », c'est-à-dire le
// hall d'AVANT la refonte du 2026-09-08, en vouvoiement, sur un site qui
// tutoie et qui vend un objectif individuel. Personne ne l'a vu: un aperçu de
// lien ne se regarde que depuis WhatsApp.
//
// Les clés sont extraites du fichier EN TEXTE (une expression régulière), et
// non importées: `fr.ts` est du TypeScript, et ce script tourne sous un `node`
// nu. Une clé renommée fait échouer le script au lieu de le laisser écrire une
// planche périmée.
//
// ── LES CONTRAINTES DE LA CHARTE QUI S'APPLIQUENT ICI ──────────────────────
// `docs/keel/CHARTE-VITRINE.md` §5: deux épaisseurs de trait (2 pour le
// contour d'une chose réelle, 1 pour l'annotation), les cinq jetons
// d'illustration et pas un de plus, UNE seule pièce chaude. Et surtout: on ne
// dessine jamais une proportion que le produit ne calcule pas pour l'écran —
// d'où quatre assiettes de MÊME taille dont seule la PART diffère.
//
// Les jetons sont recopiés en dur: cette planche est rendue par Playwright,
// hors de Vite, donc elle ne peut pas lire `src/tokens.css`. Les valeurs
// doivent rester égales à celles de `@theme`.

import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// `@playwright/test` et PAS `playwright`: seul le premier est une dépendance
// DÉCLARÉE de `package.json`. Le second n'est présent que par transitivité —
// il marche aujourd'hui et disparaît le jour où l'arbre est reconstruit.
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, "..");
const FONT_DIR = path.join(FRONTEND, "src/assets/fonts");
const OUT = path.join(FRONTEND, "public/og-image.png");

// ── LA COPIE, LUE DE `i18n/fr.ts` ──────────────────────────────────────────
const FR = fs.readFileSync(path.join(FRONTEND, "src/keel/i18n/fr.ts"), "utf8");
/** La valeur d'une clé du pack français, ou un échec bruyant. */
function message(key) {
  const m = FR.match(new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*\n?\\s*"([^"]*)"`));
  if (!m) throw new Error(`clé absente de i18n/fr.ts: ${key}`);
  return m[1];
}
const TITLE_1 = message("home.hero.title_1");
const TITLE_2 = message("home.hero.title_2");
const LEDE = message("home.hero.lede");

/** Le symbole de la marque — le MÊME tracé que `public/brand/sophia-mark.svg`. */
const MARK = fs.readFileSync(path.join(FRONTEND, "public/brand/sophia-mark.svg"), "utf8")
  .replace(/<\?xml[^>]*\?>/, "")
  .replace(/style="color:[^"]*"/, 'style="color:#632C4C"');

/** 1.91:1, le rapport qu'attendent les aperçus. Rendu à 2× pour la netteté. */
const WIDTH = 1200;
const HEIGHT = 630;
const SCALE = 2;

const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" />
<style>
  @font-face { font-family:"Young Serif"; src:url("file://${FONT_DIR}/youngserif-latin.woff2") format("woff2"); font-weight:400; font-display:block; }
  @font-face { font-family:"Public Sans"; src:url("file://${FONT_DIR}/publicsans-latin.woff2") format("woff2"); font-weight:100 900; font-display:block; }
  :root {
    --paper:#FBF8FA; --ink:#23191F; --ink-soft:#6A5A64;
    --fig-100:#EFE0E9; --fig-700:#632C4C;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${WIDTH}px; height:${HEIGHT}px; }
  body {
    background:var(--paper); color:var(--ink);
    font-family:"Public Sans", system-ui, sans-serif;
    display:grid; grid-template-columns:1fr 400px; align-items:center;
    gap:40px; padding:64px 72px;
    /* La seule pièce saturée avec l'équerre — un filet, jamais un aplat. */
    border-bottom:10px solid var(--fig-700);
  }
  .left { min-width:0; }
  /* LE SYMBOLE DE LA MARQUE, ET PLUS L'ÉQUERRE. Même arbitrage que
     \`PublicHeader\`: le logo occupe la place que tenait la signature, et deux
     signatures collées au même mot en feraient une de trop. */
  .brand { display:inline-flex; align-items:center; gap:12px; margin-bottom:40px; }
  .brand svg { width:36px; height:36px; display:block; }
  .wordmark { font-family:"Young Serif", Georgia, serif; font-size:34px; letter-spacing:-0.01em; }
  h1 { font-family:"Young Serif", Georgia, serif; font-weight:400; font-size:78px;
       line-height:0.99; letter-spacing:-0.015em; max-width:15ch; text-wrap:balance; }
  .lede { margin-top:26px; font-size:25px; line-height:1.45; color:var(--ink-soft); max-width:30ch; }
  .fig { width:400px; }
</style></head>
<body>
  <div class="left">
    <div class="brand">${MARK}<span class="wordmark">Sophia</span></div>
    <h1>${TITLE_1}<br />${TITLE_2}</h1>
    <p class="lede">${LEDE}</p>
  </div>
  <svg class="fig" viewBox="0 0 400 330" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Les anses D'ABORD, la casserole PAR-DESSUS: son remplissage masque la
         moitié qui entre dans le récipient, et l'anse se lit comme une anse et
         non comme une bulle posée sur le bord. -->
    <rect x="134" y="48" width="30" height="16" rx="8" fill="var(--paper)" stroke="var(--ink)" stroke-width="2"/>
    <rect x="236" y="48" width="30" height="16" rx="8" fill="var(--paper)" stroke="var(--ink)" stroke-width="2"/>
    <circle cx="200" cy="56" r="40" fill="var(--fig-100)" stroke="var(--ink)" stroke-width="2"/>
    <g stroke="var(--ink-soft)" stroke-width="1">
      <path d="M200 96v42"/><path d="M56 138h288"/>
      <path d="M56 138v26M152 138v26M248 138v26M344 138v26"/>
    </g>
    <!-- Quatre assiettes de MÊME taille: la différence est dans la part, pas
         dans le contenant (CHARTE §5 — jamais une proportion que le produit ne
         calcule pas pour l'écran). -->
    <g stroke="var(--ink)" stroke-width="2">
      <circle cx="56" cy="196" r="30"/><circle cx="152" cy="196" r="30"/>
      <circle cx="248" cy="196" r="30"/><circle cx="344" cy="196" r="30"/>
    </g>
    <g fill="var(--fig-700)">
      <circle cx="56" cy="196" r="9"/><circle cx="152" cy="196" r="15"/>
      <circle cx="248" cy="196" r="7"/><circle cx="344" cy="196" r="12"/>
    </g>
    <g fill="var(--ink-soft)" font-family="Public Sans, sans-serif" font-size="13" text-anchor="middle">
      <text x="56" y="252">Toi</text><text x="152" y="252">Sami</text>
      <text x="248" y="252">Inès</text><text x="344" y="252">Jo</text>
    </g>
    <text x="200" y="300" fill="var(--ink)" font-family="Public Sans, sans-serif"
          font-size="14" font-weight="600" letter-spacing="1.4" text-anchor="middle">
      UNE CUISSON, LA PART DE CHACUN
    </text>
  </svg>
</body></html>`;

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "og-")), "card.html");
fs.writeFileSync(tmp, html);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: SCALE,
});
await page.goto(`file://${tmp}`);
// Sans cette attente, la planche part en police de repli une fois sur trois —
// et un aperçu de lien en Georgia ne se voit qu'une fois publié.
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
await browser.close();

console.log(
  `écrit ${OUT} — ${WIDTH * SCALE}×${HEIGHT * SCALE}. ` +
    "⚠️ `og:image:width`/`height` d'index.html annoncent ces dimensions-là.",
);
