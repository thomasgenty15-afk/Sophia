/**
 * ══════════════════════════════════════════════════════════════════════════
 * UN SOUVENIR PORTE SA CLÉ — et sans elle, il ne fait rien. Lot A.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LA MESURE QUI IMPOSE CE MODULE ───────────────────────────────────────
 * Mesuré le 2026-09-22 avec `resolveIngredient` contre le référentiel RÉEL
 * (945 slugs, 2 739 alias, 4 faux amis), sur les 9 souvenirs durables du seul
 * compte réel: **5 résolvent, 4 non.**
 *
 *   ✓ fruit · flocons d'avoines · lait d'avoine · graines · amendes
 *   ⛔ lesoeufs · bol de muesli · petit suisse · « tofu, poissons au petit
 *     déjeuné » (le composite, fermé la veille)
 *
 * Les quatre échecs ne sont pas de la même nature, et c'est ce qui décide de
 * la réponse:
 *   · `lesoeufs` — UNE FAUTE. `les œufs` ET `oeufs` résolvent tous deux vers
 *     `whole_eggs`: seule la faute bloque.
 *   · `bol de muesli` — UN MOT DE CONTENANT. `muesli` résout vers `granola`;
 *     « bol de » suffit à tout perdre.
 *   · `petit suisse` — UNE VRAIE ABSENCE. Ni `petit suisse` ni `petit-suisse`
 *     ne sont dans les 945 slugs. Aucune consigne n'y peut rien.
 *
 * ⛔ CE QUE ÇA IMPOSE, ET QUI EST LE LOT: la consigne de prompt AIDE (elle
 * ferme les deux premiers) mais ne PROUVE rien — le modèle n'a ni les 945
 * slugs ni les 2 739 alias en tête, et il écrira toujours des formes
 * plausibles dont certaines ne résolvent pas. La résolution est donc
 * DÉTERMINISTE, et ce qui ne résout pas se COMPTE au lieu de passer pour un
 * souvenir qui agit.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildCompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import {
  parseRetainedItem,
  type RetainedItem,
  type RetainedKind,
} from "./retained_item.ts";
import { RESOLVABLE_KINDS, resolveRetainedRefs } from "./retained_resolve.ts";

// ---------------------------------------------------------------------------
// LE RÉFÉRENTIEL DE TEST — les lignes RÉELLES que la mesure a nommées
// ---------------------------------------------------------------------------

function ref(slug: string): CompositionRef {
  return {
    slug,
    foodGroupRef: "poultry",
    label: slug,
    source: "ciqual",
    energyKcal: 100,
    proteinG: 10,
    carbsG: null,
    fatG: null,
    fiberG: null,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: "neutral",
    yieldFactor: null,
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
  };
}

/**
 * ⚠️ LES SLUGS ET LES ALIAS SONT CEUX MESURÉS EN BASE le 2026-09-22, pas des
 * inventions: `oeufs → whole_eggs`, `flocons d'avoine → oats`,
 * `muesli → granola`, `lait d'avoine → oat_milk`.
 */
const INDEX = buildCompositionIndex(
  ["whole_eggs", "oats", "granola", "oat_milk", "almonds", "tofu"].map(ref),
  [
    { alias: "oeufs", slug: "whole_eggs" },
    { alias: "flocons d'avoine", slug: "oats" },
    { alias: "muesli", slug: "granola" },
    { alias: "lait d'avoine", slug: "oat_milk" },
    { alias: "amandes", slug: "almonds" },
  ],
);

function item(args: {
  kind?: RetainedKind;
  text: string;
  ref?: string | null;
}): RetainedItem {
  const kind = args.kind ?? "food.exclude";
  const wants = kind === "food.prefer" || kind === "method.prefer";
  const parsed = parseRetainedItem({
    kind,
    scope: kind === "craving" ? "next_plan" : "durable",
    subject: "household",
    text: args.text,
    value: kind === "portion.adjust"
      ? { direction: "down", magnitude: "slight" }
      : null,
    source: kind === "portion.adjust" ? "questionnaire" : "draft_note",
    at: "2026-09-22",
    item: "",
    confidence: null,
    quote: args.text,
    ...(kind === "portion.adjust" || kind === "craving"
      ? {}
      : { occasion: null, ...(wants ? {} : { force: "never" }), ref: args.ref ?? null }),
  });
  assert(parsed !== null, `item illisible: ${kind} / ${args.text}`);
  return parsed;
}

const refOf = (it: RetainedItem): string | null =>
  "ref" in it ? it.ref ?? null : null;

// ===========================================================================
// CE QUE LA RÉSOLUTION DOIT DONNER
// ===========================================================================

Deno.test("⟳ LA MISE EN FORME EST CE QUI MANQUAIT — trois échecs mesurés, résolus", () => {
  // Les trois formes que la base porte aujourd'hui et qui ne résolvent pas,
  // écrites comme le référentiel les connaît.
  const out = resolveRetainedRefs({
    items: [
      item({ text: "oeufs" }),
      item({ text: "flocons d'avoine", kind: "food.prefer" }),
      item({ text: "muesli", kind: "food.prefer" }),
    ],
    index: INDEX,
  });
  assertEquals(out.items.map(refOf), ["whole_eggs", "oats", "granola"]);
  assertEquals(out.askable, 3);
  assertEquals(out.resolved, 3);
  assertEquals(out.unresolved, []);
});

Deno.test("⟳ LA FAUTE EST LE SEUL OBSTACLE — `lesoeufs` échoue, `les œufs` passe", () => {
  // ── CE CAS EST LA MESURE QUI A LANCÉ LE LOT ───────────────────────────
  // `lesoeufs` est en base depuis le 2026-09-20 et ne résout rien. Les DEUX
  // formes correctes résolvent — avec l'article et la ligature, ou sans:
  // `resolveIngredient` normalise (il dépose l'article, replie `œ` sur `oe`).
  //
  // ⚠️ DONC LA CONSIGNE D'ORTHOGRAPHE SERT, et c'est important de le dire:
  // elle ferme ce cas-là. Ce qu'elle ne peut pas faire, c'est le PROUVER — le
  // modèle ne sait pas ce que le référentiel connaît. C'est la résolution
  // déterministe qui tranche, et le compteur qui le dit.
  const fautif = resolveRetainedRefs({ items: [item({ text: "lesoeufs" })], index: INDEX });
  assertEquals(refOf(fautif.items[0]), null);
  assertEquals(fautif.unresolved, ["lesoeufs"]);

  for (const forme of ["les œufs", "oeufs", "les oeufs"]) {
    const out = resolveRetainedRefs({ items: [item({ text: forme })], index: INDEX });
    assertEquals(refOf(out.items[0]), "whole_eggs", forme);
  }
});

Deno.test("⟳ UN MOT DE CONTENANT SUFFIT À TOUT PERDRE — « bol de muesli »", () => {
  // Mesuré: `bol de muesli` ne résout rien, `muesli` résout vers `granola`.
  // La consigne demande l'ALIMENT, pas la phrase qui l'entoure; le compteur
  // dit quand elle n'a pas été suivie.
  const avec = resolveRetainedRefs({ items: [item({ text: "bol de muesli" })], index: INDEX });
  assertEquals(refOf(avec.items[0]), null);
  const sans = resolveRetainedRefs({ items: [item({ text: "muesli" })], index: INDEX });
  assertEquals(refOf(sans.items[0]), "granola");
});

Deno.test("⛔ LE TEXTE DE LA PERSONNE N'EST JAMAIS RÉÉCRIT", () => {
  // La carte affiche `text`. Le remplacer par la forme du référentiel lui
  // ferait lire `whole_eggs` à la place de ses mots — et « Défaire »
  // porterait sur une phrase qu'elle n'a pas écrite.
  const out = resolveRetainedRefs({ items: [item({ text: "oeufs" })], index: INDEX });
  assertEquals(out.items[0].text, "oeufs");
  assertEquals(out.items[0].quote, "oeufs");
});

Deno.test("ce qui ne résout pas est NOMMÉ, pas perdu", () => {
  // `petit suisse` est une VRAIE absence, mesurée: ni `petit suisse` ni
  // `petit-suisse` ne sont dans les 945 slugs. Aucune consigne n'y peut rien.
  // La forme part au sas (`food_composition_pending_aliases`), qui est comment
  // le référentiel apprend — et où la chaîne de composition l'a DÉJÀ posée.
  const out = resolveRetainedRefs({
    items: [item({ text: "petit suisse" }), item({ text: "oeufs" })],
    index: INDEX,
  });
  assertEquals(out.unresolved, ["petit suisse"]);
  assertEquals(out.askable, 2);
  assertEquals(out.resolved, 1);
  // ⛔ ET L'ITEM SURVIT. Un souvenir qu'on ne sait pas résoudre reste un
  // souvenir: la personne l'a donné, et la carte doit le montrer.
  assertEquals(out.items.length, 2);
  assertEquals(out.items[0].text, "petit suisse");
});

Deno.test("⛔ UNE FORME EN DOUBLE NE REMPLIT PAS LE SAS DEUX FOIS", () => {
  const out = resolveRetainedRefs({
    items: [item({ text: "petit suisse" }), item({ text: "petit suisse", kind: "food.prefer" })],
    index: INDEX,
  });
  assertEquals(out.unresolved, ["petit suisse"]);
});

// ===========================================================================
// ⛔ CE QUI N'A PAS DE CLÉ, ET N'EN AURA PAS
// ===========================================================================

Deno.test("⛔ LES PRÉPARATIONS NE SE RÉSOLVENT PAS, et ce n'est pas un échec", () => {
  // « friture », « cru », « rôti au four » sont des FAÇONS DE CUISINER. Le
  // référentiel est une table d'ALIMENTS: y chercher « friture » rendrait au
  // mieux rien, au pire un aliment frit précis — une règle sur un plat au lieu
  // d'une règle sur une préparation.
  const out = resolveRetainedRefs({
    items: [
      item({ kind: "method.avoid", text: "friture" }),
      item({ kind: "method.prefer", text: "rôti au four" }),
    ],
    index: INDEX,
  });
  assertEquals(out.askable, 0, "une préparation a été comptée comme résolvable");
  assertEquals(out.unresolved, [], "une préparation est partie au sas");
  for (const it of out.items) assertEquals(refOf(it), null);
});

Deno.test("⛔ LES FAMILLES QUI NE DÉSIGNENT AUCUN ALIMENT TRAVERSENT INCHANGÉES", () => {
  const items = [
    item({ kind: "craving", text: "fajitas" }),
    item({ kind: "portion.adjust", text: "un peu trop" }),
  ];
  const out = resolveRetainedRefs({ items, index: INDEX });
  assertEquals(out.askable, 0);
  assertEquals(out.items, items);
});

Deno.test("⛔ LES DEUX FAMILLES RÉSOLVABLES SONT NOMMÉES, et ce sont celles-là", () => {
  // Une liste qui grandirait sans qu'on le veuille ferait chercher un slug
  // pour une préparation ou une envie.
  assertEquals([...RESOLVABLE_KINDS].sort(), ["food.exclude", "food.prefer"]);
});

// ===========================================================================
// LE RÉFÉRENTIEL ABSENT
// ===========================================================================

Deno.test("⛔ SANS RÉFÉRENTIEL, RIEN NE RÉSOUT — et le ZÉRO N'EST PAS AMBIGU", () => {
  // `resolved: 0` seul rend le même zéro pour « aucun souvenir d'aliment » et
  // « le référentiel n'a pas pu être chargé ». `askable` sépare les deux, et
  // c'est le nombre qui dit si la mémoire agit ou décore.
  const out = resolveRetainedRefs({
    items: [item({ text: "oeufs" }), item({ kind: "craving", text: "fajitas" })],
    index: null,
  });
  assertEquals(out.resolved, 0);
  assertEquals(out.askable, 1, "le dénominateur ne dit plus ce qu'on aurait pu résoudre");
  assertEquals(refOf(out.items[0]), null);
  // ⚠️ ET AUCUN SOUVENIR N'EST PERDU: un référentiel en panne ne doit jamais
  // coûter une ligne à quelqu'un.
  assertEquals(out.items.length, 2);
});

// ===========================================================================
// ⛔ LA GARDE QUI COMPTE LE PLUS — la forme d'un slug
// ===========================================================================

Deno.test("⛔ UN `ref` QUI N'EST PAS UN SLUG FAIT TOMBER L'ITEM", () => {
  // Un `ref` qui porterait des espaces ou des accents serait du TEXTE déguisé
  // en identifiant, c'est-à-dire exactement le rapprochement approximatif que
  // ce lot existe pour retirer. Et replier sur `null` ferait mentir le
  // compteur de résolution dans le sens qui rassure.
  for (const bad of ["petit suisse", "Œufs", "oats!", "flocons-d'avoine"]) {
    const parsed = parseRetainedItem({
      kind: "food.exclude",
      scope: "durable",
      subject: "household",
      text: "x",
      value: null,
      source: "draft_note",
      at: "2026-09-22",
      item: "",
      confidence: null,
      quote: "x",
      occasion: null,
      force: "never",
      ref: bad,
    });
    assertEquals(parsed, null, `\`ref: ${JSON.stringify(bad)}\` a été gardé`);
  }
  // Et la forme légitime passe: une garde qui bloque tout ressemble à une
  // garde qui marche.
  assert(
    parseRetainedItem({
      kind: "food.exclude",
      scope: "durable",
      subject: "household",
      text: "x",
      value: null,
      source: "draft_note",
      at: "2026-09-22",
      item: "",
      confidence: null,
      quote: "x",
      occasion: null,
      force: "never",
      ref: "whole_eggs",
    }) !== null,
  );
});

Deno.test("le slug traverse l'écriture et se relit", () => {
  const out = resolveRetainedRefs({ items: [item({ text: "oeufs" })], index: INDEX });
  const reread = parseRetainedItem(
    JSON.parse(JSON.stringify({ ...out.items[0] })),
  );
  assertEquals(refOf(reread!), "whole_eggs");
});
