// BANC D'ESSAI · LE TEST DE LA NOTATION.
//
//   deno run --allow-read scratchpad/banc-modeles/scoring_test.ts
//
// La colonne d'adhérence négative EST le banc: si elle se trompe, le classement
// s'inverse. Deux façons de se tromper, et le harnais s'est trompé des DEUX
// avant que ces cas n'existent:
//
//   * compter comme faute le modèle qui CITE l'interdit pour l'écarter
//     (« pas de grignotage » dans un `why`) — cicatrice nommée du dépôt,
//     « négation après le terme = morsure ». Coût: une campagne jetée;
//   * compter comme faute le modèle qui SUBSTITUE correctement (« almond milk »
//     à un intolérant au lactose, « gluten-free bread » à un cœliaque). Celui-là
//     est pire: il classe la bonne réponse en dessous de l'absence de réponse.
//
// Ces huit cas sont écrits à la main, dans les deux langues, et ils sont la
// seule raison de croire le tableau du rapport.

import { scoreNegativeAdherence } from "./scoring.ts";
import { FIXTURES } from "./fixtures.ts";

const f09 = FIXTURES.find((f) => f.id === "f09_medical_allergy_en")!;
const f12 = FIXTURES.find((f) => f.id === "f12_household_no_coach_en")!;
const f02 = FIXTURES.find((f) => f.id === "f02_muscle_gain_fr")!;
const f01 = FIXTURES.find((f) => f.id === "f01_fat_loss_en")!;

const cases: [string, unknown, typeof f09, number, number][] = [
  ["substitution CORRECTE (almond milk) ne compte pas",
    { dishes: [{ title: "Oats", ingredients: [{ term: "almond milk" }] }] }, f09, 0, 0],
  ["le vrai lait COMPTE",
    { dishes: [{ title: "Oats", ingredients: [{ term: "whole milk" }] }] }, f09, 1, 0],
  ["l'arachide dans une MÉTHODE compte",
    { dishes: [{ title: "Stir fry", method: "Top with crushed peanut." }] }, f09, 1, 0],
  // ── ZÉRO ET ZÉRO, ET C'EST MIEUX QU'UN ÉCHO ──────────────────────────────
  // Avec le matcher du produit, « No milk here » est BLANCHI en amont par la
  // liste fermée de négations: il n'y a plus rien à signaler, même pas un écho.
  // L'attente d'origine (echo=1) était écrite pour le matcher maison; la garder
  // ferait échouer le test sur une amélioration.
  ["une négation reconnue ne laisse RIEN — ni faute, ni écho",
    { dishes: [{ title: "Oats", why: "No milk here — you said lactose." }] }, f09, 0, 0],
  ["le pain sans gluten ne compte pas, le pain oui",
    { dishes: [{ ingredients: [{ term: "gluten-free bread" }] }] }, f12, 0, 0],
  ["le pain ordinaire COMPTE",
    { dishes: [{ ingredients: [{ term: "sourdough bread" }] }] }, f12, 1, 0],
  ["« pas de grignotage » est blanchi en français aussi",
    { dishes: [{ title: "Poulet rôti", why: "Trois vrais repas, pas de grignotage." }] }, f02, 0, 0],
  // L'écho SUBSISTE quand la mention n'est pas une négation reconnue — c'est ce
  // qui justifie de garder les deux seaux malgré le bon matcher.
  ["une mention non niée dans un `why` reste un ÉCHO, pas une faute",
    { dishes: [{ title: "Bowl", why: "Unlike a meal replacement, this is a plate." }] }, f01, 0, 1],
  ["« grignotage » dans un TITRE est une faute",
    { dishes: [{ title: "Plateau de grignotage", why: "" }] }, f02, 1, 0],
];

let bad = 0;
for (const [name, payload, fx, wantV, wantE] of cases) {
  const r = scoreNegativeAdherence(payload, fx);
  const ok = r.violations.length === wantV && r.echoes.length === wantE;
  if (!ok) bad++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${name} — viol=${r.violations.length}/${wantV} echo=${r.echoes.length}/${wantE}` +
      (ok ? "" : ` :: ${JSON.stringify(r)}`),
  );
}
// ── LES CINQ FAUX POSITIFS MESURÉS LE 2026-08-11 ──────────────────────────
// Chacun a réellement été compté comme une violation par la première version
// de la notation, sur des générations réelles. Ce sont eux qui ont fait jeter
// le matcher maison au profit de celui du produit.
const f07 = FIXTURES.find((f) => f.id === "f07_vegan_fr")!;

const REGRESSIONS: [string, unknown, typeof f09][] = [
  ["« laitue » n'est pas « lait »",
    { dishes: [{ title: "Wrap de tofu rôti, laitue et houmous" }] }, f07],
  ["« yaourt de soja » est LA bonne réponse pour un végan",
    { dishes: [{ title: "Bol de yaourt de soja, avoine et pêche" }] }, f07],
  ["« muesli sans miel » est une négation, pas du miel",
    { dishes: [{ ingredients: [{ term: "muesli sans miel" }] }] }, f07],
  ["« certified gluten-free seeded bread » est la bonne réponse au coeliaque",
    { dishes: [{ ingredients: [{ term: "certified gluten-free seeded bread" }] }] }, f12],
  ["« suitable for a peanut allergy » nomme l'allergie, ne sert pas d'arachide",
    { dishes: [{ method: "Use soy yogurt, label confirmed suitable for a peanut allergy." }] }, f09],
  ["« soy yogurt » pour un intolérant au lactose est la substitution attendue",
    { dishes: [{ title: "Blueberry oat soy-yogurt bowl" }] }, f09],
];

for (const [name, payload, fx] of REGRESSIONS) {
  const r = scoreNegativeAdherence(payload, fx);
  const ok = r.violations.length === 0;
  if (!ok) bad++;
  console.log(
    `${ok ? "ok  " : "FAIL"} régression: ${name}` +
      (ok ? "" : ` :: ${JSON.stringify(r.violations)}`),
  );
}

// …et la contre-épreuve: le matcher doit TOUJOURS mordre sur les vraies fautes.
const REAL: [string, unknown, typeof f09][] = [
  ["du vrai lait de vache pour un végan", { dishes: [{ ingredients: [{ term: "lait entier" }] }] }, f07],
  ["du poulet pour un végan", { dishes: [{ title: "Cuisses de poulet rôties" }] }, f07],
  ["du pain ordinaire pour un coeliaque", { dishes: [{ ingredients: [{ term: "sourdough bread" }] }] }, f12],
];
for (const [name, payload, fx] of REAL) {
  const r = scoreNegativeAdherence(payload, fx);
  const ok = r.violations.length > 0;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} contre-épreuve: ${name}`);
}

console.log(bad === 0 ? "\nnotation validée (régressions comprises)" : `\n${bad} cas faux`);


// ── LA CLAUSE (b): LE RETOUR EN ARRIÈRE CONTRE LA FAUTE ────────────────────
// Neuf « violations » sur les 180 générations réelles étaient des retours en
// arrière. Ces deux cas les séparent de ce qu'il faut vraiment attraper.
const BACKREF: [string, unknown, typeof f09, number][] = [
  ["« verser le yaourt » est légitime quand l'ingrédient dit « yaourt de soja »",
    {
      dishes: [{
        title: "Bol de yaourt de soja",
        ingredients: [{ term: "yaourt de soja nature" }],
        method: "Verser le yaourt dans un bol, ajouter l'avoine.",
      }],
    }, f07, 0],
  ["« toast the bread » est légitime quand l'ingrédient dit « GF bread »",
    {
      dishes: [{
        title: "Toast",
        ingredients: [{ term: "GF bread" }],
        method: "Toast the bread and butter it.",
      }],
    }, f12, 0],
  ["…mais un yaourt NON expliqué reste une faute",
    {
      dishes: [{
        title: "Bol de fruits",
        ingredients: [{ term: "pêche" }],
        method: "Verser le yaourt dans un bol.",
      }],
    }, f07, 1],
  ["…et un pain NON expliqué aussi",
    {
      dishes: [{
        title: "Toast",
        ingredients: [{ term: "butter" }],
        method: "Toast the bread.",
      }],
    }, f12, 1],
];
for (const [name, payload, fx, want] of BACKREF) {
  const r = scoreNegativeAdherence(payload, fx);
  const ok = r.violations.length === want;
  if (!ok) bad++;
  console.log(
    `${ok ? "ok  " : "FAIL"} clause (b): ${name}` +
      (ok ? "" : ` :: ${JSON.stringify(r.violations)}`),
  );
}
console.log(bad === 0 ? "\nnotation validée (clause b comprise)" : `\n${bad} cas faux`);
