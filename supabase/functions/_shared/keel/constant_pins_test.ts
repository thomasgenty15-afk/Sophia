// LES CONSTANTES ÉPINGLÉES — ce fichier ne teste AUCUN comportement, et c'est
// exprès.
//
// ⛔ CE QU'IL PROTÈGE, ET POURQUOI CE N'EST PAS UNE REDONDANCE. Un test qui
// écrit `assertEquals(calcul(x), x * MA_CONSTANTE)` **importe** la constante et
// recalcule l'attendu avec elle: changer sa valeur change les DEUX côtés de
// l'égalité, et le test reste VERT. C'est la cicatrice mesurée du dépôt
// — « un test paramétré par sa propre constante reste vert quand on change la
// constante » —, et `mouth_anchor_test.ts` la porte en entier: 35 tests, 0
// échec en 31 ms, et `COMPOSED_DISH_MEAL_SHARE` passé de 0,42 à 1,0 n'en fait
// rougir aucun.
//
// UN ÉPINGLAGE EST DONC LA SEULE ASSERTION QUI NE PEUT PAS ÊTRE COMPLICE:
// la constante d'un côté, un LITTÉRAL de l'autre. Elle ne dit pas que la valeur
// est juste — elle dit qu'on ne la change pas SANS LE SAVOIR.
//
// ⚠️ AUCUNE DE CES VALEURS N'EST DÉFENDUE ICI. Les changer est permis; ce qui
// est interdit est de les changer en silence. Une valeur qui bouge fait rougir
// UNE ligne, et cette ligne nomme le lot qui devait la déplacer.
//
// ⛔ `KEEL_MINOR_AGE` EST ÉPINGLÉE, PAS DÉFENDUE — et la différence compte:
// épingler l'âge du mineur n'affaiblit aucun plancher, ça rend son
// déplacement VISIBLE. C'est le seul rapport de ce fichier à la sécurité.
//
// La règle de dépôt qui EXIGE ces épinglages vit dans
// `constant_pinning_gate_test.ts`; ce fichier-ci en est la première fournée.

import { assertEquals } from "jsr:@std/assert@1";

import {
  DENSITY_CEILING_DEFAULT,
  DENSITY_CEILING_FAT_LOSS,
  MAX_SURPLUS_FRACTION,
} from "./meal_envelope.ts";
import { KEEL_MINOR_AGE } from "./student_age.ts";
import { BOX_FACTOR_MAX, BOX_FACTOR_MIN } from "./household_portions.ts";
import { MAX_KG_PER_WEEK, PACE_WARN_UP_KG_PER_WEEK } from "./weight_pace.ts";
import {
  MIN_RESOLUTION_FOR_VERDICT,
  PER_PORTION_PROTEIN_G,
} from "./meal_verdict.ts";
import { FILL_REQUEST_CAP } from "./composition_fill.ts";
// ── la fournée du lot `X2″` (2026-08-23): ce que le scanner élargi fait entrer
import { ACTIVITY_FACTORS, APPETITE_FACTORS } from "./meal_envelope.ts";
import {
  MAX_DOCUMENT_BASE64_CHARS,
  MAX_DOCUMENT_BYTES,
} from "./doctrine_document.ts";
import { HABIT_SLOTS_MAX } from "./household_habits.ts";
import {
  TARGET_WEIGHT_KG_MAX,
  TARGET_WEIGHT_KG_MIN,
} from "./energy_target.ts";
import { PROTEIN_REFERENCE_CEILING_KG_PER_M2 } from "./protein_reference_weight.ts";
import {
  ANCHOR_FACTOR_MAX,
  ANCHOR_FACTOR_MIN,
  COMPOSED_DISH_KCAL,
  COMPOSED_DISH_MEAL_SHARE,
  MEAL_COMPONENT_KCAL,
  MEAL_MAX_GRAMS_PER_KG,
  SLOT_DAY_WEIGHT,
} from "./mouth_anchor.ts";

// ── LE PLAFOND DE DENSITÉ (`meal_envelope.ts`) ───────────────────────────────
// Déplacées par les lots `L38` et `L9bis`. Une densité plafond qui monte
// laisse passer une assiette plus dense, dans le sens qui nourrit trop.
Deno.test("épinglage — DENSITY_CEILING_FAT_LOSS vaut 1,3 kcal/g", () => {
  assertEquals(DENSITY_CEILING_FAT_LOSS, 1.3);
});

Deno.test("épinglage — DENSITY_CEILING_DEFAULT vaut 1,8 kcal/g", () => {
  assertEquals(DENSITY_CEILING_DEFAULT, 1.8);
});

// ── ⛔ LA BANDE DE SURPLUS (`meal_envelope.ts`) — UN TROU DU SCANNER ─────────
// ⛔ CELLE-CI, LE SCANNER DE `constant_pinning_gate_test.ts` NE LA VOIT PAS,
// ET C'EST MESURÉ. Rejoué le 2026-08-22 à 18:47:41 CEST sur son propre
// répertoire: **140 constantes vues, `MAX_SURPLUS_FRACTION` absente, et
// `ENERGY_BANDS` absente aussi.** La cause est structurelle, pas un oubli:
// `SCALAR_RE` n'accepte que `export const NOM = <littéral numérique>;`, et
// cette constante-ci est DÉRIVÉE —
// `Math.round((ENERGY_BANDS.muscle_gain.high - 1) * 1000) / 1000`.
// ⇒ passer la bande `muscle_gain` de 1,10 à 1,20 ne faisait rougir AUCUN
// épinglage. Cette ligne-ci est la seule qui rougisse. ~~Le trou du scanner,
// lui, reste ouvert: fiche `X2″`.~~
// ⟳ **LE TROU EST REFERMÉ le 2026-08-23 par le lot `X2″`** — le scanner VOIT
// désormais les constantes dérivées, et `MAX_SURPLUS_FRACTION` est l'une des
// SENTINELLES de son anti-garde-morte: retirer la ligne ci-dessous fait
// désormais rougir `constant_pinning_gate_test.ts` PAR SON NOM.
// ⚠️ `ENERGY_BANDS`, elle, reste hors de portée de la règle — elle n'est pas
// exportée. Elle est fermée en bas de ce fichier, par un épinglage lu sur le
// disque, et c'est un correctif NOMMÉ, pas une règle.
//
// ⚠️ ÉPINGLÉE, PAS DÉFENDUE — même statut que `KEEL_MINOR_AGE`. Le lot `L37`
// a mesuré que l'élargir au-delà de **0,1055** ferait exécuter, à un adulte
// ordinaire, un rythme que le produit décrit lui-même comme partant surtout en
// gras (`surplus_band_bounds_test.ts`). C'est là que vit l'invariant; ici on
// dit seulement qu'elle ne bouge pas en silence.
Deno.test("épinglage — MAX_SURPLUS_FRACTION vaut 0,10 (bande `muscle_gain` à +10 %)", () => {
  assertEquals(MAX_SURPLUS_FRACTION, 0.10);
});

// ── L'ÂGE DU MINEUR (`student_age.ts`) ───────────────────────────────────────
// Lue par `S3` et `S4`. ⛔ L'épingler est autorisé; la CHANGER ne l'est pas.
Deno.test("épinglage — KEEL_MINOR_AGE vaut 18 ans", () => {
  assertEquals(KEEL_MINOR_AGE, 18);
});

// ── LES BORNES DU CONTENANT (`household_portions.ts`) ────────────────────────
// Déplacées par `L6′`. Elles bornent le facteur qui remplit un bac: une borne
// haute qui monte sert davantage à quelqu'un qui n'a rien demandé.
Deno.test("épinglage — BOX_FACTOR_MIN vaut 0,70", () => {
  assertEquals(BOX_FACTOR_MIN, 0.70);
});

Deno.test("épinglage — BOX_FACTOR_MAX vaut 1,25", () => {
  assertEquals(BOX_FACTOR_MAX, 1.25);
});

// ── LE RYTHME DE POIDS (`weight_pace.ts`) ────────────────────────────────────
// La question `L37` porte sur ces deux-là. `MAX_KG_PER_WEEK` est un REFUS:
// au-delà, le rythme demandé n'est pas exécuté.
Deno.test("épinglage — PACE_WARN_UP_KG_PER_WEEK vaut 0,5 kg/semaine", () => {
  assertEquals(PACE_WARN_UP_KG_PER_WEEK, 0.5);
});

Deno.test("épinglage — MAX_KG_PER_WEEK vaut 1,0 kg/semaine", () => {
  assertEquals(MAX_KG_PER_WEEK, 1.0);
});

// ── LE VERDICT DU REPAS (`meal_verdict.ts`) ──────────────────────────────────
// Déplacées par `L9bis`. `MIN_RESOLUTION_FOR_VERDICT` décide de SE TAIRE:
// la baisser fait parler la porte sur une journée qu'elle n'a pas su lire.
Deno.test("épinglage — MIN_RESOLUTION_FOR_VERDICT vaut 0,8", () => {
  assertEquals(MIN_RESOLUTION_FOR_VERDICT, 0.8);
});

Deno.test("épinglage — PER_PORTION_PROTEIN_G vaut 20 g", () => {
  assertEquals(PER_PORTION_PROTEIN_G, 20);
});

// ── LE SAS DE COMPOSITION (`composition_fill.ts`) ────────────────────────────
// Déplacée par `L18b`. C'est un PLAFOND D'APPELS: le monter coûte de l'argent
// à chaque plan, et le silence est le même dans les deux sens.
Deno.test("épinglage — FILL_REQUEST_CAP vaut 24 demandes", () => {
  assertEquals(FILL_REQUEST_CAP, 24);
});

// ── L'ANCRAGE DE LA BOUCHE (`mouth_anchor.ts`) ───────────────────────────────
// ⛔ LE CŒUR DE LA CICATRICE. `mouth_anchor_test.ts` importe les six et
// recalcule ses attendus avec: aucune de ces six lignes n'a d'équivalent
// là-bas, et c'est la raison d'être de ce fichier.
Deno.test("épinglage — ANCHOR_FACTOR_MIN vaut 0,60", () => {
  assertEquals(ANCHOR_FACTOR_MIN, 0.60);
});

Deno.test("épinglage — ANCHOR_FACTOR_MAX vaut 3,00", () => {
  assertEquals(ANCHOR_FACTOR_MAX, 3.00);
});

Deno.test("épinglage — MEAL_MAX_GRAMS_PER_KG vaut 8 g/kg", () => {
  assertEquals(MEAL_MAX_GRAMS_PER_KG, 8);
});

Deno.test("épinglage — COMPOSED_DISH_MEAL_SHARE vaut 0,42", () => {
  assertEquals(COMPOSED_DISH_MEAL_SHARE, 0.42);
});

Deno.test("épinglage — COMPOSED_DISH_KCAL vaut 300 kcal", () => {
  assertEquals(COMPOSED_DISH_KCAL, 300);
});

// ⚠️ CES DEUX-LÀ SONT DES `Record`, PAS DES SCALAIRES. `assertEquals(X, 42)`
// ne s'y applique pas: on épingle L'OBJET ENTIER, sinon une clé AJOUTÉE
// passerait sous le radar — et une clé ajoutée à `MEAL_COMPONENT_KCAL` change
// la part du plat, donc l'assiette.
Deno.test("épinglage — MEAL_COMPONENT_KCAL, l'objet ENTIER", () => {
  assertEquals(MEAL_COMPONENT_KCAL, {
    dessert: 120,
    cheese: 120,
    bread: 80,
  });
});

Deno.test("épinglage — SLOT_DAY_WEIGHT, l'objet ENTIER", () => {
  assertEquals(SLOT_DAY_WEIGHT, {
    breakfast: 0.25,
    lunch: 0.40,
    dinner: 0.35,
  });
});

// ── LE POIDS DE RÉFÉRENCE PROTÉIQUE (`protein_reference_weight.ts`) ──────────
// Posée par `L1`. Elle ne se rend à personne et ne nomme aucune catégorie de
// corps: la baisser retire de la protéine à quelqu'un, la monter désarme le
// lot. Dans les deux cas, une seule ligne rougit.
Deno.test("épinglage — PROTEIN_REFERENCE_CEILING_KG_PER_M2 vaut 30", () => {
  assertEquals(PROTEIN_REFERENCE_CEILING_KG_PER_M2, 30);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ LA FOURNÉE DU LOT `X2″` — 2026-08-23
//
// Ces sept-là ne sont pas des constantes neuves: elles étaient là depuis
// toujours, et le scanner de `X2′` ne les VOYAIT pas. Mesuré: sur les 152
// constantes de son propre périmètre, il en ratait 12, pour six causes
// mécaniques (séparateur `_`, expression dérivée, alias, `.length`,
// ré-exportation, `Object` et `.freeze({` séparés par un saut de ligne).
//
// ⛔ ET LEURS TESTS SONT COMPLICES, TOUS, AU SENS EXACT DE CE FICHIER:
//   · `assertEquals(HABIT_SLOTS_MAX, EATING_OCCASIONS.length)` — deux dérivées
//     de la même liste, comparées l'une à l'autre;
//   · `assert(MAX_DOCUMENT_BASE64_CHARS >= Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4)`
//     — une RELATION entre les deux: le plafond d'envoi peut passer de 6 Mo à
//     60 Mo sans qu'une seule assertion bronche;
//   · `assertEquals(DAY_ACTIVITY_BASE.seated, ACTIVITY_FACTORS.sedentary)` —
//     deux tables comparées l'une à l'autre.
// C'est exactement la forme que ce fichier existe pour rendre impossible.
// ═══════════════════════════════════════════════════════════════════════════

// ── LES FACTEURS D'ACTIVITÉ ET D'APPÉTIT (`meal_envelope.ts`) ────────────────
// ⛔ CE SONT LES MULTIPLICATEURS DE LA MAINTENANCE. Monter `trains_hard` de
// 2,00 à 2,20 ajoute ~10 % d'énergie à toutes les assiettes d'un corps sportif,
// sans qu'aucune ligne de verdict ne change de forme. On épingle L'OBJET
// ENTIER: une clé AJOUTÉE est un niveau d'activité que personne n'a décidé.
Deno.test("épinglage — ACTIVITY_FACTORS, l'objet ENTIER", () => {
  assertEquals(ACTIVITY_FACTORS, {
    sedentary: 1.45,
    on_feet: 1.65,
    trains_some: 1.80,
    trains_hard: 2.00,
  });
});

Deno.test("épinglage — APPETITE_FACTORS, l'objet ENTIER", () => {
  assertEquals(APPETITE_FACTORS, {
    small: 0.90,
    average: 1.00,
    large: 1.10,
  });
});

// ── LES PLAFONDS DU DOCUMENT DE DOCTRINE (`doctrine_document.ts`) ────────────
// ⛔ Écrites `6_000_000` et `8_000_000`: le séparateur `_` suffisait à les
// rendre invisibles. Ce sont des plafonds — la famille que `X2′` a mesurée
// comme la plus souvent MUETTE (4 muettes sur 17, toutes des plafonds).
Deno.test("épinglage — MAX_DOCUMENT_BYTES vaut 6 000 000 octets", () => {
  assertEquals(MAX_DOCUMENT_BYTES, 6_000_000);
});

Deno.test("épinglage — MAX_DOCUMENT_BASE64_CHARS vaut 8 000 000 caractères", () => {
  assertEquals(MAX_DOCUMENT_BASE64_CHARS, 8_000_000);
});

// ── LE NOMBRE DE CRÉNEAUX D'HABITUDE (`household_habits.ts`) ─────────────────
// ⛔ `HABIT_SLOTS_MAX = HABIT_OCCASIONS.length`, et son test le compare à
// `EATING_OCCASIONS.length`. Retirer une occasion des DEUX listes laisse le
// test VERT et fait disparaître un moment de la journée. Le littéral est la
// seule assertion qui le voie.
Deno.test("épinglage — HABIT_SLOTS_MAX vaut 6 créneaux", () => {
  assertEquals(HABIT_SLOTS_MAX, 6);
});

// ── LES BORNES DE POIDS, SOUS LEUR NOM PUBLIC (`energy_target.ts`) ───────────
// ⛔ `X2′` les avait inscrites à la dette en écrivant « le jour où `X1′` les
// unifie, elles disparaissent du scan ». ⟳ **CE N'EST PAS CE QUI S'EST PASSÉ**:
// `X1′` a bien unifié la déclaration dans `weight_bounds.ts`, mais
// `energy_target.ts` les ré-exporte sous l'alias `TARGET_` — leur NOM PUBLIC —
// et le scanner élargi les revoit sous ce nom-là. Elles sortent donc de la
// dette par la porte prévue: un épinglage, pas une disparition.
Deno.test("épinglage — TARGET_WEIGHT_KG_MIN vaut 25 kg", () => {
  assertEquals(TARGET_WEIGHT_KG_MIN, 25);
});

Deno.test("épinglage — TARGET_WEIGHT_KG_MAX vaut 400 kg", () => {
  assertEquals(TARGET_WEIGHT_KG_MAX, 400);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⛔ `ENERGY_BANDS` — LE CORRECTIF NOMMÉ, PARCE QUE LA RÈGLE NE PEUT PAS
//
// `meal_envelope.ts:466` déclare `const ENERGY_BANDS` — SANS `export`. Elle est
// donc hors de portée de la règle de dépôt PAR CONSTRUCTION: on ne peut ni
// l'importer, ni l'épingler, et la seule réponse possible à un rouge serait
// « ajouter le nom à la dette » — une liste que personne ne pourrait refermer.
// Mesuré le 2026-08-23: `_shared/keel` porte **329** déclarations `const` non
// exportées. Élargir la règle jusque-là ferait entrer 329 noms d'un coup, tous
// insolubles. ⇒ ARBITRAGE: la règle s'arrête à l'exporté, et cette table-ci —
// qui est une table de VERDICT — est fermée à la main, par son nom.
//
// ⛔ CE QUE ÇA COÛTAIT: `MAX_SURPLUS_FRACTION` n'ancre QU'UNE des six valeurs
// (`muscle_gain.high`). Les cinq autres — dont `fat_loss.high`, qui décide de
// l'énergie de toute personne en PERTE — ne sont ancrées nulle part.
//
// ⚠️ L'ÉPINGLAGE SE FAIT SUR LE DISQUE, et c'est le seul chemin possible vers
// une constante privée. C'est le patron de la dent ③ de `X1′` (« les trois
// copies du front relues sur le disque »). Il ne défend aucune de ces valeurs:
// il interdit qu'elles bougent en silence.
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("épinglage — ENERGY_BANDS, les SIX nombres, lus sur le disque", async () => {
  const src = await Deno.readTextFile(
    new URL("./meal_envelope.ts", import.meta.url),
  );
  const bloc = /\bconst ENERGY_BANDS\b[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src);
  if (!bloc) {
    throw new Error(
      "⛔ `ENERGY_BANDS` est introuvable dans `meal_envelope.ts`. Cet épinglage " +
        "lit le DISQUE parce que la table n'est pas exportée: si elle a été " +
        "renommée, déplacée ou exportée, c'est ICI qu'on le décide — pas en " +
        "supprimant cette ligne.",
    );
  }
  const nombres = [...bloc[1].matchAll(/([a-z_]+)\s*:\s*(-?\d+(?:\.\d+)?)/g)]
    .map(([, cle, val]) => `${cle}=${val}`);
  assertEquals(nombres, [
    "low=0.75",
    "high=0.85", // fat_loss — la bande de TOUTE personne en perte
    "low=0.95",
    "high=1.05", // maintenance
    "low=1.05",
    "high=1.10", // muscle_gain — la seule que `MAX_SURPLUS_FRACTION` ancrait
  ]);
});
