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

import { UNANSWERED_EXTRAS_SHARE } from "./meal_extras.ts";
import { MAX_DISH_BUTTONS } from "./plan_feedback_chat.ts";
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
  COMPOSED_DISH_MIN_MEAL_SHARE,
  MEAL_MAX_GRAMS_PER_KG,
  SLOT_DAY_WEIGHT,
} from "./mouth_anchor.ts";
import { FIELD_CHANGES_MAX } from "./field_change.ts";
import {
  INDEX_MAX,
  INDEX_MIN,
  NOTCHES_PER_ANSWER,
} from "./feedback_index.ts";
import { MEMO_LINE_MAX_CHARS, MEMO_MAX_LINES_PER_SUBJECT } from "./memo.ts";
import {
  WEIGH_IN_INTERVAL_DAYS,
  WEIGH_IN_WINDOW_END_HOUR,
  WEIGH_IN_WINDOW_START_HOUR,
} from "./weigh_in.ts";
import { SLOT_MEAL_GRACE_HOURS } from "./slot_meal_ask.ts";
import { ENERGY_KCAL_MAX, ENERGY_KCAL_MIN } from "./meal_analysis.ts";
import { RETAINED_QUOTE_MAX_CHARS } from "./retained_item.ts";
import { MEMORY_CLARIFICATION_DAILY_CAP } from "./daily_ask_budget.ts";
import { MEMORY_CLARIFICATION_MAX_OPTIONS } from "./memory_clarification.ts";

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

Deno.test("épinglage — le repli d'un moment NON RENSEIGNÉ vaut 0,58", () => {
  // ⟳ 2026-09-01 — TROIS ÉPINGLES ONT DISPARU D'ICI, ET UNE LES REMPLACE.
  // `COMPOSED_DISH_MEAL_SHARE` (0,42), `COMPOSED_DISH_KCAL` (300) et
  // `MEAL_COMPONENT_KCAL` (120/120/80) décrivaient un RATIO — « le plat porte
  // 42 % du repas » — appliqué à la journée entière. Le forfait, lui, est
  // retranché en valeur absolue et moment par moment; les kcal viennent
  // désormais de CIQUAL (`meal_extras.ts`), pas d'une table écrite ici.
  //
  // ⛔ CE QUI SURVIT EST LA CONVENTION, PAS SA DÉCOMPOSITION. Une fiche muette
  // ne dit pas « je ne prends rien »: retrancher zéro multiplierait sa cible
  // par 2,4. `0,58` est le complément exact de l'ancien `0,42`, et c'est ce qui
  // rend le lot sans régression sur un déjeuner et un dîner.
  assertEquals(UNANSWERED_EXTRAS_SHARE, 0.58);
  assertEquals(Number((1 - UNANSWERED_EXTRAS_SHARE).toFixed(2)), 0.42);
});

Deno.test("épinglage — le plat garde au moins 30 % de son repas", () => {
  // ⚠️ BORNE NEUVE, ET ELLE N'EXISTAIT PAS AVANT: l'ancien ratio ne pouvait
  // pas descendre sous `300/620 = 0,48` par construction. Une somme de
  // forfaits, si. Cinq extras sur un petit déjeuner laisseraient 49 kcal au
  // plat — une cuillère servie comme un repas.
  assertEquals(COMPOSED_DISH_MIN_MEAL_SHARE, 0.30);
});

Deno.test("épinglage — SLOT_DAY_WEIGHT, l'objet ENTIER", () => {
  // ⟳ 2026-09-01 — DE TROIS CLÉS À SEPT, ET CET ÉPINGLAGE A FAIT SON TRAVAIL:
  // il a arrêté le lot et obligé à écrire pourquoi.
  //
  // ⛔ CE QUE LES QUATRE CLÉS NEUVES RÉPARENT. Les trois collations et le jeton
  // legacy `snack` tombaient sur le `?? 0` de `dayCoverageOf`. Zéro n'est pas
  // neutre: l'énergie d'une habitude composée à l'après-midi entre au
  // DÉNOMINATEUR du facteur (`day.kcal`) en comptant pour rien au NUMÉRATEUR,
  // donc `cible × couverture / livré` rétrécit — systématiquement, dans le sens
  // qui sous-nourrit.
  //
  // ⚠️ LA SOMME NE FAIT PLUS 1, ET C'EST SANS CONSÉQUENCE. `dayCoverageOf` rend
  // `couvert / total` où le total porte sur les moments DÉCLARÉS: un rapport,
  // jamais une valeur absolue. Une bouche qui ne déclare que les trois repas
  // n'atteint aucune clé neuve — sa couverture est identique au bit près, et un
  // test le tient en premier dans `mouth_anchor_test.ts`.
  //
  // ⛔ ET `snack` VAUT 0,10 SANS QU'ON PRÉTENDE SAVOIR QUAND. Il arrive de la
  // base (`MEAL_SLOTS` l'accepte sur un plat), pas du modèle; le mapper sur le
  // matin ou l'après-midi inventerait une heure que personne n'a écrite.
  assertEquals(SLOT_DAY_WEIGHT, {
    breakfast: 0.25,
    snack_am: 0.10,
    lunch: 0.40,
    snack_pm: 0.10,
    dinner: 0.35,
    before_bed: 0.10,
    snack: 0.10,
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

Deno.test("épinglage — MAX_DISH_BUTTONS vaut 8", () => {
  // FF-054 §3.2 — le nombre de plats proposés dans une question de plat du
  // questionnaire de fin de plan, dans la conversation.
  //
  // ⚠️ CE N'EST PAS UNE MESURE, C'EST UN ARBITRAGE, et il coupe la FIN de la
  // semaine — celle dont on se souvient le mieux. Le monter fait un mur de
  // boutons dans une bulle; le descendre retire des plats à nommer. Un plan de
  // sept jours porte cinq à huit plats distincts, donc 8 ne coupe rien dans le
  // cas nominal — c'est cette phrase-là qui devient fausse si la fenêtre de
  // plan s'allonge, et c'est pour ça que la valeur est épinglée ici.
  assertEquals(MAX_DISH_BUTTONS, 8);
});

Deno.test("épinglage — FIELD_CHANGES_MAX vaut 20", () => {
  // LOT M5 — le plafond du journal des champs que l'IA a changés
  // (`field_change.ts`).
  //
  // ⚠️ C'EST UN PLAFOND DE CONSERVATION, PAS D'AFFICHAGE, et c'est ce qui le
  // rend arbitrable ici. Le fil « ce qui vient de changer » (lot M2) est une
  // VUE: il coupe l'affichage et rien ne se perd. Ce journal-ci JETTE — il est
  // la seule chose de ce chantier qui grossisse sans que la personne l'ait
  // demandé, dans une colonne que cinq lecteurs traversent.
  //
  // 20: un bilan produit au plus cinq changements, donc quatre bilans
  // d'affilée entrent entiers. Ce qui tombe est le plus ANCIEN, et ce qui tombe
  // n'est plus défaisable EN UN CLIC — la personne garde la porte ② du design:
  // le champ, qu'elle voit et qu'elle édite. Descendre ce nombre retire des
  // « défaire »; le monter fait un historique dans un profil.
  assertEquals(FIELD_CHANGES_MAX, 20);
});

Deno.test("épinglage — l'échelle de l'indice des portions vaut −2 … +2", () => {
  // LOT M3 — les bornes de la position accumulée (`feedback_index.ts`).
  //
  // ⛔ CES NOMBRES NE SONT PAS CHOISIS, ILS SONT DÉRIVÉS, et c'est ce qui rend
  // la borne défendable. `INDEX_MAX × PORTION_ADJUST_STEP.slight` = 2 × 0,05 =
  // 0,10 = `PORTION_ADJUST_STEP.clear`: le pire cas que l'enveloppe servait
  // DÉJÀ avant l'indice. Changer `INDEX_MAX` sans changer le pas déplacerait ce
  // pire cas au-delà de tout ce que ce produit a servi — et la borne
  // deviendrait alors FABRIQUÉE, celle que la cicatrice du facteur composé
  // interdit en toutes lettres.
  //
  // ⚠️ `feedback_index_test.ts` prouve l'ÉGALITÉ (`INDEX_MAX × slight ===
  // clear`); cette ligne-ci épingle les VALEURS. Les deux sont nécessaires:
  // l'égalité seule resterait vraie si on doublait les deux ensemble, et le
  // pire cas aurait quand même bougé.
  assertEquals(INDEX_MIN, -2);
  assertEquals(INDEX_MAX, 2);
  // ⚠️ LA TABLE ENTIÈRE, PAS SES PROPRIÉTÉS. Un troisième cran ajouté au socle
  // doit faire ROUGIR ici — épingler `slight` et `clear` un par un le laisserait
  // entrer sans que personne ne lui donne sa valeur en crans.
  assertEquals(NOTCHES_PER_ANSWER, { slight: 1, clear: 2 });
});

Deno.test("épinglage — une citation tient 280 caractères", () => {
  // LOT M2 (`retained_item.ts`). C'est le plafond de la phrase de la personne
  // qui a causé une ligne — *« sans la citation, "Défaire" est un pari »*.
  //
  // ⚠️ IL VAUT CELUI DE LA NOTE DE BROUILLON (`DRAFT_NOTE_MAX_CHARS`), et ce
  // n'est pas un hasard: la plus longue source légitime d'une citation est la
  // note elle-même, donc elle doit entrer ENTIÈRE. Le descendre ferait tronquer
  // dans le cas nominal — et une citation tronquée au milieu d'une phrase se
  // lit comme une citation déformée.
  //
  // ⛔ ET UNE CITATION SE TRONQUE, ELLE NE SE RÉSUME PAS: couper garde des mots
  // exacts, résumer fabriquerait une phrase que la personne n'a jamais écrite.
  assertEquals(RETAINED_QUOTE_MAX_CHARS, 280);
});

Deno.test("épinglage — le mémo tient CINQ lignes", () => {
  // LOT M4 (`memo.ts`). ⚠️ C'EST UN ARBITRAGE, PAS UNE MESURE, et le dire est la
  // moitié utile: personne n'a mesuré ce que vaut une cinquième consigne.
  //
  // Ce qui est VRAI et vérifiable, c'est ce que le nombre FAIT: à la sixième on
  // REFUSE, donc la personne doit en retirer une. Le monter rendrait ce refus
  // indolore — donc inutile —, et le mémo redeviendrait le champ texte sans
  // plafond que ce lot existe pour empêcher. Le descendre à un en ferait une
  // case, pas un mémo.
  //
  // ⛔ ET LE PLAFOND REFUSE, IL NE JETTE PAS. C'est la différence assumée avec
  // le journal de M5 (`FIELD_CHANGES_MAX`), qui laisse tomber le plus ancien:
  // perdre une trace coûte un « défaire », perdre une consigne change
  // l'assiette.
  assertEquals(MEMO_MAX_LINES_PER_SUBJECT, 5);

  // ⚠️ ET LA LONGUEUR D'UNE LIGNE EST CELLE D'UNE CITATION, PAS UN NOMBRE À
  // ELLE. Une ligne de mémo est de la prose que la personne relit sur sa carte;
  // plus longue que la note dont elle sort, ce ne serait plus une ligne mais un
  // paragraphe injecté à chaque plan. L'égalité est épinglée ici parce que les
  // deux constantes vivent dans deux fichiers: les laisser diverger ferait un
  // mémo qui accepte ce qu'aucune citation ne peut porter.
  assertEquals(MEMO_LINE_MAX_CHARS, 280);
  assertEquals(MEMO_LINE_MAX_CHARS, RETAINED_QUOTE_MAX_CHARS);
});

// ═══════════════════════════════════════════════════════════════════════════
// FF-062 — LES DEUX CANAUX NEUFS (lot 6)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("épinglage — la cadence de pesée: 2 jours, 2 jours, 5 jours", () => {
  // C2. ⚠️ CE SONT DES ARBITRAGES ADOSSÉS À UNE MESURE, et la mesure est le
  // BRUIT DE LA BALANCE. Une perte de 0,5 kg/semaine fait 70 g/jour, soit moins
  // que `WEIGHT_NOISE_KG`: un point quotidien n'ajoute aucun signal, il ajoute
  // une question. Deux jours donnent 140 g — encore dans le bruit point à
  // point, mais assez de POINTS pour qu'une tendance existe.
  //
  // La prise de masse avance deux à trois fois plus lentement: cinq jours y
  // produisent le même signal que deux en perte, pour deux fois et demie moins
  // de questions.
  //
  // ⛔ `maintenance` EST À DEUX JOURS COMME LA PERTE, ET CE N'EST PAS UNE
  // COPIE PARESSEUSE. La bande de maintien se juge sur la DISPERSION, qui a
  // besoin de points, pas sur une pente — l'espacer la rendrait illisible.
  //
  // Les monter, c'est piloter l'enveloppe sur une valeur périmée (le défaut que
  // ce canal existe pour fermer: six jours sur sept avant lui). Les descendre,
  // c'est demander son poids tous les jours à quelqu'un qui perd 70 g — la
  // forme même du tracker que ce produit refuse d'être.
  //
  // ⛔ L'OBJET ENTIER, PAS TROIS ACCÈS. Trois `assertEquals` par clé restent
  // verts le jour où un QUATRIÈME objectif entre dans `GOAL_TOKENS` avec sa
  // cadence — c'est-à-dire le jour où un chiffre neuf apparaît sans que
  // personne l'apprenne. La même règle que `SLOT_DAY_WEIGHT` et
  // `ACTIVITY_FACTORS` plus haut, pour la même raison.
  assertEquals(WEIGH_IN_INTERVAL_DAYS, {
    fat_loss: 2,
    maintenance: 2,
    muscle_gain: 5,
  });
});

Deno.test("épinglage — la fenêtre de pesée est 17h-19h, bornes comprises/exclue", () => {
  // C2. ⚠️ CES DEUX NOMBRES SONT UNE DÉCISION DE COORDINATION, pas un goût.
  // §1 de la fiche nomme le défaut qu'ils évitent: deux canaux se coordonnaient
  // par une convention écrite dans le commentaire d'UN des deux crons, et un
  // troisième ajouté sans la connaître produisait deux notifications le même
  // soir.
  //
  // 17h-19h ne croise AUCUN autre canal, et c'est vérifiable: C1 tombe à 10h,
  // 14h et 21h (heures de repas écoulées), C3 tient 20h-22h. Bouger l'une des
  // deux bornes recouvre un voisin.
  //
  // ⛔ ET PAS LE MATIN. Une pesée se fait au lever: une question posée à 8h
  // arrive AVANT le geste qu'elle demande. 17h attrape le geste du matin.
  assertEquals(WEIGH_IN_WINDOW_START_HOUR, 17);
  assertEquals(WEIGH_IN_WINDOW_END_HOUR, 19);
});

Deno.test("épinglage — la question d'un créneau se rattrape 2 heures, pas plus", () => {
  // C1. Le balayage est HORAIRE: sans fenêtre de rattrapage, un tick raté — un
  // déploiement, un 502 de Kong — perdrait le repas définitivement.
  //
  // ⚠️ ET PAS QUATRE. À 18h, un déjeuner demandé n'obtient plus un souvenir mais
  // une reconstitution — et une reconstitution est précisément ce que la photo
  // et la déclaration existent pour éviter.
  //
  // ⛔ DEUX HEURES NE PEUVENT PAS FAIRE SE CHEVAUCHER DEUX CRÉNEAUX aux heures
  // de repli (10h, 14h, 21h — quatre heures d'écart au minimum). Le monter à
  // quatre le pourrait, et la décision « le plus récent gagne » deviendrait
  // alors le chemin nominal au lieu du cas de bord qu'elle est.
  assertEquals(SLOT_MEAL_GRACE_HOURS, 2);
});

Deno.test("épinglage — un repas plausible tient entre 1 et 5 000 kcal", () => {
  // CALORIE_REVERSAL. ⚠️ CE NE SONT PAS UN JUGEMENT SUR UN REPAS: elles
  // attrapent une faute de frappe et une unité mal lue, rien d'autre —
  // volontairement larges, comme `WEIGHT_KG_MIN/MAX` le sont pour un corps.
  //
  // Elles bornent DEUX chemins, et c'est pour ça qu'elles sont ici plutôt que
  // recopiées: `parseEnergyEstimate` (ce que le modèle propose) et
  // `correctEnergy` (ce que la personne tape, FF-062 R11). Deux jeux de bornes
  // pour la même grandeur divergeraient, et un chiffre accepté d'un côté puis
  // refusé de l'autre se lit comme une panne.
  //
  // ⛔ ET HORS BORNES = REFUSÉ ET NOMMÉ, jamais ramené au bord. Un 50 000
  // ramené à 5 000 produit une donnée fausse qui a l'air vraie — et sur le
  // chemin de la correction, elle remplacerait un chiffre qui était au moins
  // honnête sur son origine.
  assertEquals(ENERGY_KCAL_MIN, 1);
  assertEquals(ENERGY_KCAL_MAX, 5000);
});

Deno.test("épinglage — au plus DEUX clarifications par jour local", () => {
  // MEMORY_CLARIFICATION_DAILY_CAP. La clarification est exemptée du budget
  // partagé (elle répond à un geste), donc c'est ce nombre — et lui seul — qui
  // borne le cumul. Une exemption sans plafond propre est une porte ouverte.
  //
  // ⚠️ DEUX PARCE QUE LE JOUR TYPIQUE EN PORTE DEUX: le bilan du plan qui se
  // termine, puis la composition du plan suivant. Plafonner à un ferait taire
  // la seconde source, c'est-à-dire jeter une entrée en silence — ce que ce lot
  // existe pour empêcher.
  assertEquals(MEMORY_CLARIFICATION_DAILY_CAP, 2);
});

Deno.test("épinglage — au plus QUATRE options dans une clarification", () => {
  // MEMORY_CLARIFICATION_MAX_OPTIONS. ⚠️ MIROIR D'UN CHECK EN BASE
  // (`options between 1 and 4`, migration 20260904090000): les laisser diverger
  // ferait composer une question que la base refuse au moment de l'écrire —
  // c'est-à-dire une question perdue APRÈS l'appel modèle qui l'a produite.
  //
  // Au-delà de quatre ce n'est plus une clarification, c'est un formulaire.
  assertEquals(MEMORY_CLARIFICATION_MAX_OPTIONS, 4);
});
