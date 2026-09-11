// KEEL — LES ICÔNES DE LA MARQUE, RÉGÉNÉRABLES.
//
//   node scripts/brand-icons.mjs        (depuis `frontend/`)
//
// ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
// Les icônes précédentes (`favicon.png`, `apple-touch-icon.png`) étaient le
// yin-yang VIOLET du produit grand public supprimé: 1024×1024, 267 Ko et
// 328 Ko, sans source, servies à chaque onglet, à chaque résultat Google et
// dans les données structurées de l'organisation. Un binaire sans source est
// un binaire que personne ne retouche — même quand la marque a changé, et même
// quand un commentaire du dépôt le signale depuis des semaines
// (`pages/UpgradePlan.tsx`: « signalé, pas réparé »).
//
// La source est désormais UNE seule: `public/brand/sophia-mark.svg`. Ce script
// la lit et compose les quatre fichiers servis. Retoucher le tracé se fait
// là-bas, jamais ici.
//
// ── CE QUI EST PRODUIT, ET POURQUOI CHAQUE FICHIER EXISTE ──────────────────
//   · `public/favicon.svg`      — l'onglet des navigateurs modernes. Vectoriel:
//     net à toutes les tailles, 1 Ko. Écrit en texte, pas rendu.
//   · `public/favicon.png`      — 192×192. Le repli, et la taille que Google
//     réclame pour l'icône du résultat de recherche: un CARRÉ dont le côté est
//     un multiple de 48.
//   · `public/apple-touch-icon.png` — 180×180, la taille d'iOS. PLEIN BORD et
//     SANS TRANSPARENCE: iOS applique son propre masque, et un PNG à coins
//     transparents y devient un carré noir.
//   · `public/icon-512.png`     — 512×512. L'icône d'installation
//     (`site.webmanifest`) et le `logo` de l'organisation dans les données
//     structurées, que Google lit pour son panneau de connaissance.
//
// ── LES DEUX ARBITRAGES DE DESSIN, ET ILS SE VOIENT À 16 px ────────────────
// 1. RÉSERVE, ET PAS FIGUE SUR PAPIER. Sur la page, le symbole est figue sur
//    papier — c'est la charte. Dans un onglet et dans un résultat Google, le
//    fond du porteur est déjà blanc: un symbole clair posé sur du presque
//    blanc n'a plus de silhouette, il flotte. La tuile figue lui en rend une.
// 2. LE TRAIT DE L'ANNEAU EST ÉPAISSI (3,5 → 4,2 sur la grille de 64) POUR
//    L'ICÔNE SEULEMENT. À 16 px, 3,5 unités valent 0,68 px: l'anneau
//    disparaît et il ne reste que trois taches. C'est une correction optique
//    de la variante icône, pas une modification du logo — `sophia-mark.svg`
//    et `BrandMark.tsx` gardent 3,5.

import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// `@playwright/test` et PAS `playwright`: seul le premier est une dépendance
// DÉCLARÉE de `package.json` (même règle que `og-image.mjs`).
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, "..");
const PUBLIC = path.join(FRONTEND, "public");
const SOURCE = path.join(PUBLIC, "brand/sophia-mark.svg");

/** Recopiés en dur: rendu hors de Vite, donc `tokens.css` est illisible ici. */
const FIG = "#632C4C";
const PAPER = "#FBF8FA";

/** La part de la tuile qu'occupe le symbole. 0,78 laisse 20% de marge. */
const SCALE = 0.78;
/** Le rayon des coins de la tuile, en unités de la grille de 64 (≈22%). */
const RADIUS = 14;

// ── LE TRACÉ, LU DE LA SOURCE ──────────────────────────────────────────────
// On extrait les `d=` du fichier de référence au lieu de les recopier: une
// copie de plus est une copie qui divergera. Le `circle` est reconstruit avec
// le trait épaissi (voir l'arbitrage 2 ci-dessus).
const source = fs.readFileSync(SOURCE, "utf8");
const paths = [...source.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
if (paths.length !== 3) {
  throw new Error(`sophia-mark.svg doit porter 3 tracés, ${paths.length} lus`);
}

/**
 * La tuile complète, en SVG.
 * @param {boolean} rounded  Coins arrondis (onglet) ou plein bord (iOS).
 */
function tile(rounded) {
  const t = (64 - 64 * SCALE) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Sophia">
  <title>Sophia</title>
  <rect x="0" y="0" width="64" height="64"${rounded ? ` rx="${RADIUS}" ry="${RADIUS}"` : ""} fill="${FIG}"/>
  <g transform="translate(${t.toFixed(3)} ${t.toFixed(3)}) scale(${SCALE})">
    <circle cx="32" cy="32" r="24" fill="none" stroke="${PAPER}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
    <g fill="${PAPER}">
${paths.map((d) => `      <path d="${d}"/>`).join("\n")}
    </g>
  </g>
</svg>
`;
}

// ── 1. LE SVG DE L'ONGLET, ÉCRIT ET NON RENDU ──────────────────────────────
fs.writeFileSync(path.join(PUBLIC, "favicon.svg"), tile(true));

// ── 2. LES TROIS PNG ───────────────────────────────────────────────────────
const RENDERS = [
  { file: "favicon.png", size: 192, rounded: true },
  { file: "apple-touch-icon.png", size: 180, rounded: false },
  { file: "icon-512.png", size: 512, rounded: false },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, rounded } of RENDERS) {
  const html = `<!doctype html><html><head><meta charset="utf-8" /><style>
    *{margin:0;padding:0}
    html,body{width:${size}px;height:${size}px;background:transparent}
    svg{display:block;width:${size}px;height:${size}px}
  </style></head><body>${tile(rounded)}</body></html>`;
  const tmp = path.join(os.tmpdir(), `sophia-icon-${size}.html`);
  fs.writeFileSync(tmp, html);
  await page.setViewportSize({ width: size, height: size });
  await page.goto(`file://${tmp}`);
  // `omitBackground` garde les coins TRANSPARENTS sur la tuile arrondie. Sur
  // la tuile pleine, il n'y a aucun pixel à trouer: le `rect` couvre tout.
  await page.screenshot({ path: path.join(PUBLIC, file), omitBackground: true });
  fs.unlinkSync(tmp);
  console.log(`✓ public/${file} — ${size}×${size}`);
}
await browser.close();
console.log("✓ public/favicon.svg");
