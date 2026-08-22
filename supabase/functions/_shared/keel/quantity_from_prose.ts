/**
 * LA QUANTITÉ QUE LE MODÈLE A ÉCRITE EN CLAIR — lot `L-1-b`, 2026-08-22.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE MODULE FRÔLE UN REFUS ÉCRIT DU DÉPÔT, ET SON PÉRIMÈTRE EST LA GARDE
 * ══════════════════════════════════════════════════════════════════════════
 * `meal_generation.ts` porte, au-dessus de `unquantified_dish_ingredients`, un
 * refus en toutes lettres, et il faut le lire AVANT ce fichier:
 *
 *     « ⛔ DÉTERMINISTE, ET AUCUN MATCHER. Le champ `amount` est DÉJÀ structuré
 *       (FF-038). […] Lire "une poignée de" dans `quantity` serait exactement
 *       le matcher maison que ce dépôt refuse — "laitue" ≠ "lait", douze faux
 *       positifs sur douze mesurés. »
 *
 * ⛔ CE REFUS N'EST PAS RENVERSÉ. Il vise la lecture SÉMANTIQUE de la prose, et
 * ce module ne lit JAMAIS un mot. La différence tient en une phrase:
 *
 *     un matcher DEVINE CE QU'UN MOT VEUT DIRE;
 *     ici on LIT UN NOMBRE QUE LE MODÈLE A ÉCRIT, ou on ne lit rien.
 *
 * Trois clauses rendent la frontière falsifiable, et elles sont testées une par
 * une dans `quantity_from_prose_test.ts`:
 *
 *   ① AUCUN MOT N'EST JAMAIS LU. Pas `handful`, pas `poignée`, pas `some`, pas
 *     `large`, pas `can`, pas `pinch`, pas `slices`, pas `tranches`. Le motif
 *     est **un nombre suivi d'une unité de mesure littérale, ancré des deux
 *     bouts**, ou **un nombre seul**. Rien d'autre n'existe pour ce module.
 *   ② TOUTE CHAÎNE COMPOSITE EST UNE ABSTENTION, pas une occasion.
 *     `1 can (400 g)`, `2 tbsp`, `1 large onion`, `75 g dry`, `3/4 cup cooked`
 *     rendent `null`. La cuillère demande une CONVENTION, et une convention est
 *     une décision produit — pas une lecture. (Voir le bloc « CE QUE CE MODULE
 *     REFUSE EXPRÈS » plus bas: la poche `tbsp`/`tsp` est chiffrée, et elle est
 *     laissée fermée délibérément.)
 *   ③ LE REFUS SE PROUVE. Le test ne se contente pas de cas qui passent: il
 *     tient une liste de chaînes qui DOIVENT rendre `null`, et il rougit si
 *     l'une d'elles se met à rendre un nombre. Une garde qui n'a que des cas
 *     qui passent est une garde à moitié armée — ce dépôt l'a payé six fois
 *     cette campagne, et aucune de ces six n'a été trouvée par une relecture.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ LE DÉFAUT QUE CE MODULE RÉPARE, MESURÉ
 * ══════════════════════════════════════════════════════════════════════════
 * Le prompt demande la quantité DEUX FOIS (`== SAY THE SAME QUANTITY TWICE ==`,
 * FF-038): une fois en prose (`quantity`), une fois structurée (`amount` +
 * `unit`). Mesuré le 2026-08-22 à 12:53 CEST sur tout le corpus, plats ET
 * préparations — 10 053 lignes d'ingrédient:
 *
 *     `amount is null`                              3 850
 *     dont `quantity` textuel NON VIDE              3 833   (99,6 %)
 *       · grammes littéraux  (`150 g`)                634
 *       · volumes littéraux  (`200 ml`)                32
 *       · nombres nus        (`1`, `2`)               498
 *       · fractions nues     (`1/2`, `1/4`)           195
 *       · le reste (composite ou non chiffrable)    2 474
 *
 * ⇒ **1 359 lignes portent leur quantité en clair et le produit les compte
 * comme « aucune quantité ».** Le modèle a écrit la copie en prose et pas la
 * copie structurée, et l'écriture ne garde que celle qui manque. C'est la forme
 * EXACTE de `L17-0`, sur un champ différent: le modèle a obéi, l'écriture a
 * jeté.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ DEUX POPULATIONS, ET LA NÉGATIVE EST ÉCRITE D'AVANCE
 * ══════════════════════════════════════════════════════════════════════════
 * `unquantified_dish_ingredients` et `structured_quantity_missing` comptent la
 * PROSE, c'est-à-dire la DÉSOBÉISSANCE du modèle à FF-038. Réparer la lecture
 * ne doit RIEN leur faire: sinon un modèle qui cesserait d'obéir deviendrait
 * indiscernable d'une lecture réparée, et les deux appellent des corrections
 * opposées (durcir la consigne d'un côté, réparer un lecteur de l'autre).
 *
 * ⛔ C'EST TENU STRUCTURELLEMENT, PAS PAR UNE PROMESSE:
 *   · `amount` et `unit` du payload restent EXACTEMENT ce que le modèle a
 *     déclaré — ce module n'y touche jamais, et la mesure SQL `amount is null`
 *     reste reproductible pour toujours;
 *   · la quantité récupérée voyage à côté (`readAmount` / `readUnit`), avec sa
 *     PROVENANCE (`quantity_source`), et c'est elle qui pèse;
 *   · `quantityReadCounts()` rend les deux populations côte à côte, plus leur
 *     dénominateur — patron `foodGroupWriteCounts` de `L17-0`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE QUE CE MODULE REFUSE EXPRÈS, ET CE QUE LE REFUS COÛTE
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠️ `tbsp` / `tsp` — LA POCHE EST CHIFFRÉE ET ELLE RESTE FERMÉE. Sur les
 * lignes sans `amount`, `1 tbsp` ×256, `1 tsp` ×241, `2 tbsp` ×63, `3 tbsp`
 * ×24, `1/2 tsp` ×28, `2 tsp` ×13 — ~630 lignes. Et `gramsRawOf` SAIT déjà les
 * convertir (`TBSP_ML`, `TSP_ML`) quand elles arrivent par le champ structuré.
 * Les lire ici serait donc techniquement gratuit. **On ne le fait pas**, pour
 * une raison et une seule: une cuillère est une CONVENTION de volume rase ou
 * bombée, et décider qu'une cuillère d'huile pèse 15 ml est une décision
 * PRODUIT. Le champ structuré la porte parce qu'un modèle l'a explicitement
 * choisie; la prose ne l'a pas choisie. Le jour où quelqu'un veut cette poche,
 * il l'ouvre en §⑨ du plan, pas dans une regex.
 *
 * ⚠️ `kg` — 2 lignes sur tout le corpus. Hors du vocabulaire fermé
 * `COMPOSITION_UNITS`, et deux lignes ne paient pas une unité de plus.
 *
 * ⚠️ LES UNITÉS COMPTÉES (`2 slices` ×76, `2 cloves` ×43, `4 tranches` ×9,
 * ~97 lignes) — elles demandent de lire un MOT, et c'est exactement la clause
 * ①. Elles restent non lues, et c'est pourquoi la ventilation « 1 456 lignes
 * lisibles » du plan est réduite à **1 359** ici: les 97 comptées en étaient.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠️ CE QUE LIRE UN NOMBRE NE SUFFIT PAS À FAIRE
 * ══════════════════════════════════════════════════════════════════════════
 * Un nombre nu rend `unit: "unit"`, et `gramsRawOf` n'en tire des grammes que
 * si le RÉFÉRENTIEL sait ce que pèse une unité de cet aliment (`unit_grams`,
 * lot `L-1`). Sans ligne au référentiel, la lecture réussit et la pesée
 * s'abstient quand même — ce qui est le bon comportement: on n'invente pas la
 * masse d'un oignon.
 *
 * De même, `state` n'est JAMAIS deviné. « 150 g » de riz sans `state` reste non
 * pesé (`stateMattersFor`), parce que deviner « raw » fausse d'un facteur 2,6
 * et toujours dans le sens qui gonfle.
 *
 * PURE: no I/O, no clock, no randomness.
 */

import type { CompositionUnit } from "./food_composition.ts";

/**
 * LES UNITÉS DE MESURE LITTÉRALES QUE CE MODULE LIT. Liste FERMÉE, et courte.
 *
 * ⛔ `g` ET `ml`, RIEN D'AUTRE. Ce sont les deux seules unités du vocabulaire
 * `COMPOSITION_UNITS` dont la lecture n'engage AUCUNE convention: un gramme est
 * un gramme, un millilitre passe aux grammes par la densité déjà écrite
 * (`ML_TO_G`), et le champ structuré fait exactement la même conversion sur les
 * mêmes symboles. `tbsp` et `tsp` sont dans `COMPOSITION_UNITS` et sont
 * volontairement ABSENTS d'ici — voir l'en-tête, la poche est chiffrée.
 *
 * ⚠️ `unit` n'y est pas non plus, et pour une autre raison: on n'y arrive
 * jamais par un symbole écrit, seulement par un NOMBRE SEUL (branche ②).
 */
const LITERAL_MEASURE_UNITS = ["g", "ml"] as const;

/**
 * ① UN NOMBRE, UNE UNITÉ DE MESURE LITTÉRALE, ANCRÉS DES DEUX BOUTS.
 *
 * ⛔ LES DEUX ANCRES SONT LA MOITIÉ DE LA GARDE. Sans `$`, `1 can (400 g)`
 * matcherait par son début et `75 g dry` rendrait 75 g d'un aliment sec compté
 * comme cuit. Sans `^`, « environ 150 g » passerait — et « environ » est un mot.
 *
 * ⚠️ La virgule décimale est acceptée (`1,5 g`): c'est une forme d'ÉCRITURE du
 * même nombre, pas un mot. Insensible à la casse sur le symbole seulement — une
 * majuscule n'est pas un mot de plus.
 */
const MEASURE_RE = new RegExp(
  `^\\s*(\\d+(?:[.,]\\d+)?)\\s*(${LITERAL_MEASURE_UNITS.join("|")})\\s*$`,
  "i",
);

/**
 * ② UN NOMBRE SEUL — « 2 », « 1,5 ».
 *
 * Il rend `unit: "unit"`, c'est-à-dire un DÉNOMBREMENT, et sa conversion en
 * grammes reste entièrement suspendue à `unit_grams` du référentiel. C'est
 * exactement ce que le champ structuré fait d'un `amount: 2, unit: "unit"`.
 *
 * ⚠️ AUCUN PLAFOND, ET C'EST DÉLIBÉRÉ. Un plafond (« au-dessus de 12, ce n'est
 * plus un compte ») serait une CONVENTION, donc la chose que ce module refuse.
 * Mesuré sur le corpus: le plus grand nombre nu est **8**, sur des tomates
 * cerises. La borne réelle est ailleurs et elle existe déjà — le référentiel
 * doit connaître `unit_grams`, et le plafond de vraisemblance d'un repas servi
 * mord en aval.
 */
const BARE_NUMBER_RE = /^\s*(\d+(?:[.,]\d+)?)\s*$/;

/**
 * ③ UNE FRACTION SEULE — « 1/2 », « 1/4 ».
 *
 * Diviser deux entiers est de l'arithmétique, pas une devinette. Mesuré sur le
 * corpus: `1/2` ×179 et `1/4` ×16, et rien d'autre.
 *
 * ⚠️ `1 1/2` (nombre mixte) N'EST PAS LU: zéro occurrence mesurée, et le lire
 * demanderait de décider qu'un espace vaut une addition. Le jour où la forme
 * apparaît, elle s'ouvre ici avec son chiffre.
 */
const BARE_FRACTION_RE = /^\s*(\d+)\s*\/\s*(\d+)\s*$/;

/** La quantité lue dans la prose, quand elle s'y lit. */
export interface ProseQuantity {
  amount: number;
  unit: CompositionUnit;
}

/**
 * LA QUANTITÉ ÉCRITE EN CLAIR, OU RIEN.
 *
 * ⛔ AUCUN MOT N'EST LU. Trois formes, ancrées des deux bouts, et l'abstention
 * pour tout le reste. Une chaîne composite, une unité comptée, un article, un
 * adjectif, un « to taste » rendent `null` — et le test le prouve chaîne par
 * chaîne.
 *
 * ⚠️ `0` et les nombres négatifs rendent `null`: `gramsRawOf` refuse déjà
 * `amount <= 0`, et une quantité nulle n'est pas une quantité. Le motif ne
 * connaît pas le signe `-` (un tiret n'est pas un chiffre), donc seul `0` a
 * besoin de la garde explicite.
 */
export function readQuantityFromProse(quantity: unknown): ProseQuantity | null {
  if (typeof quantity !== "string") return null;
  const raw = quantity.trim();
  if (raw === "") return null;

  const measure = MEASURE_RE.exec(raw);
  if (measure) {
    const amount = decimalOf(measure[1]);
    const unit = measure[2].toLowerCase() as CompositionUnit;
    return amount === null ? null : { amount, unit };
  }

  const bare = BARE_NUMBER_RE.exec(raw);
  if (bare) {
    const amount = decimalOf(bare[1]);
    return amount === null ? null : { amount, unit: "unit" };
  }

  const fraction = BARE_FRACTION_RE.exec(raw);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
    if (denominator <= 0 || numerator <= 0) return null;
    return { amount: numerator / denominator, unit: "unit" };
  }

  return null;
}

/** « 1,5 » et « 1.5 » sont le même nombre. `null` sur zéro ou illisible. */
function decimalOf(text: string): number | null {
  const n = Number(text.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * D'OÙ VIENT LA QUANTITÉ QUI PÈSE.
 *
 * ⛔ TROIS VALEURS, ET PAS DEUX. `null` (« rien de lisible ») n'est PAS
 * `"prose"` avec un zéro: la cicatrice du zéro ambigu de ce dépôt est
 * exactement là — un compteur qui ne distingue pas « personne n'a écrit » de
 * « on n'a pas su lire » rend le même nombre dans les deux cas et n'oriente
 * aucune correction.
 */
export type QuantitySource = "structured" | "prose";

/** La quantité effectivement pesable, et sa provenance. */
export interface WeighableQuantity {
  amount: number | null;
  unit: CompositionUnit | null;
  source: QuantitySource | null;
}

/**
 * LA QUANTITÉ QUI PÈSE — LE SEUL SITE QUI ARBITRE ENTRE LES DEUX COPIES.
 *
 * ⛔ LE STRUCTURÉ GAGNE TOUJOURS, ET SANS CONDITION. La prose n'est lue que
 * lorsque la paire structurée est INUTILISABLE (`amount` absent OU `unit`
 * absent) — c'est-à-dire exactement quand `gramsRawOf` rendrait `null` sur
 * elle. Un modèle qui écrit `amount: 200, unit: "g"` et `quantity: "1 bowl"`
 * garde ses 200 g: on ne relit pas une déclaration qui tient debout.
 *
 * ⚠️ CE N'EST PAS UNE RÉPARATION DE LA DÉCLARATION. `amount` et `unit`
 * ressortent d'ici inchangés dans la branche structurée, et l'appelant doit
 * continuer d'écrire la DÉCLARATION en base, jamais ce qu'on vient de lire.
 * Sinon la mesure d'obéissance à FF-038 se dissout dans la mesure de lecture —
 * la cicatrice `model-declared-fields-need-a-counter`, dans l'autre sens.
 */
export function weighableQuantityOf(input: {
  amount?: number | null;
  unit?: CompositionUnit | null;
  quantity?: string | null;
}): WeighableQuantity {
  const amount = input.amount ?? null;
  const unit = input.unit ?? null;
  if (amount !== null && Number.isFinite(amount) && amount > 0 && unit !== null) {
    return { amount, unit, source: "structured" };
  }
  const prose = readQuantityFromProse(input.quantity ?? null);
  if (prose) return { amount: prose.amount, unit: prose.unit, source: "prose" };
  return { amount: null, unit: null, source: null };
}

/**
 * LE NOM DE LA CLÉ DE PROVENANCE, ÉCRIT UNE FOIS.
 *
 * L'écrivain et le compteur le lisent tous les deux ici — patron
 * `INGREDIENT_GROUP_KEY` de `L17-0`: c'est ce qui rend structurellement
 * impossible de compter une clé que personne n'écrit.
 */
export const QUANTITY_SOURCE_KEY = "quantity_source";

/**
 * LE FRAGMENT DE PAYLOAD QUI PORTE LA PROVENANCE. R1: clé ASCII, snake_case.
 *
 * ⚠️ ÉCRIT MÊME À `null`, comme `group` et `name`: une clé absente ne se
 * distingue pas d'un lot débranché. Conséquence à connaître avant de mesurer —
 * `ing ? 'quantity_source'` devient vrai partout, et la seule mesure qui dise
 * quelque chose est `ing->>'quantity_source' = 'prose'`.
 */
export function quantitySourcePayload(
  source: QuantitySource | null,
): Record<string, unknown> {
  return { [QUANTITY_SOURCE_KEY]: source };
}

/** La provenance lue sur une ligne ÉCRITE, validée contre la liste fermée. */
export function persistedQuantitySourceOf(row: unknown): QuantitySource | null {
  if (!row || typeof row !== "object") return null;
  const raw = (row as Record<string, unknown>)[QUANTITY_SOURCE_KEY];
  if (raw !== "structured" && raw !== "prose") return null;
  return raw;
}

/**
 * LES DEUX POPULATIONS DE LA QUANTITÉ, PLUS LEUR DÉNOMINATEUR.
 *
 * ⛔ `ecrit_structure` ET `recupere_en_prose` NE SE FONDENT JAMAIS. Le premier
 * mesure l'obéissance du modèle à FF-038; le second mesure ce que la lecture a
 * rattrapé. Un seul nombre pour les deux rendrait un modèle qui cesse d'obéir
 * indiscernable d'un lecteur qui marche.
 *
 * ⚠️ `illisible` est le troisième seau, et il est le seul qui appelle une
 * consigne plus dure: ce sont les lignes où NI la copie structurée NI la copie
 * en prose ne dit un nombre (`to taste`, `a handful`, `1 can`).
 */
export interface QuantityReadCounts {
  /** Le modèle a écrit `amount` + `unit`. La copie structurée de FF-038. */
  ecrit_structure: number;
  /** ⛔ La copie structurée manquait, et la prose portait un nombre lisible. */
  recupere_en_prose: number;
  /** Ni l'une ni l'autre. La seule population qui demande une consigne plus dure. */
  illisible: number;
  /** Lignes d'ingrédient réellement écrites, plats ET préparations. Le dénominateur. */
  lines: number;
}

/**
 * ⚠️ TOLÉRANT PAR CONSTRUCTION: on lit un `jsonb` qui part en base, pas une
 * structure typée. Une forme inattendue rend zéro ligne, elle ne lève pas — un
 * COMPTEUR n'a jamais le droit de faire tomber le plan qu'il mesure.
 */
function ingredientRowsOf(carrier: unknown): readonly unknown[] {
  const rows = carrier && typeof carrier === "object"
    ? (carrier as Record<string, unknown>).ingredients
    : null;
  return Array.isArray(rows) ? rows : [];
}

/**
 * LES TROIS SEAUX, SUR LE PAYLOAD RÉELLEMENT ÉCRIT.
 *
 * ⛔ ON LIT LA CHARGE, PAS LA STRUCTURE INTERNE — patron `foodGroupWriteCounts`.
 * `L17-0` a coûté deux jours de chantier parce qu'un compteur branché sur la
 * structure du parseur aurait rendu « 242 persistés » pendant que la base en
 * portait zéro.
 *
 * ⛔ LES PRÉPARATIONS COMPTENT AUTANT QUE LES PLATS: elles sont 32 % des lignes
 * d'ingrédient de la base (3 202 sur 10 053, mesuré le 2026-08-22). Un compteur
 * qui les oublierait sous-compterait d'un tiers sans jamais rien dire.
 */
export function quantityReadCounts(written: {
  dishes: readonly unknown[];
  preparations: readonly unknown[];
}): QuantityReadCounts {
  const counts: QuantityReadCounts = {
    ecrit_structure: 0,
    recupere_en_prose: 0,
    illisible: 0,
    lines: 0,
  };
  for (const carrier of [...written.dishes, ...written.preparations]) {
    for (const row of ingredientRowsOf(carrier)) {
      counts.lines++;
      switch (persistedQuantitySourceOf(row)) {
        case "structured":
          counts.ecrit_structure++;
          break;
        case "prose":
          counts.recupere_en_prose++;
          break;
        default:
          counts.illisible++;
      }
    }
  }
  return counts;
}
