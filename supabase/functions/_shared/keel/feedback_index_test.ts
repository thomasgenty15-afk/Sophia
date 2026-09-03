// LES INDICES — une position qui converge — lot M3.
//
// Ce que ces tests existent pour empêcher, dans l'ordre où ça coûte:
//
//   1. QUE LA BORNE SAUTE. Sans elle, accumuler EST la dérive sans borne que
//      l'ancienne règle refusait — et elle aurait eu raison. « Quelqu'un qui dit
//      toujours trop long enverrait l'indice au plancher et les plans
//      deviendraient triviaux. »
//   2. QUE LE PIRE CAS S'ÉLARGISSE. `INDEX_MAX × slight` doit valoir `clear`,
//      exactement. Si ce n'est plus vrai, l'indice atteint des assiettes que ce
//      produit n'a jamais servies, et la borne devient FABRIQUÉE — celle que la
//      cicatrice du facteur composé interdit.
//   3. QUE LE FACTEUR SE COMPOSE. C'est le refus qui vaut, et il vaut toujours:
//      rien ne se multiplie, la position est un entier et le facteur en sort en
//      UNE opération.
//   4. QU'UNE QUESTION NON POSÉE BOUGE QUELQUE CHOSE. `portions` est retirée
//      sous plancher TCA: chez ces personnes il n'existe aucun ajustement, et
//      l'indice doit rester au milieu.
//
// env purgé: env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
//   deno test --allow-read --allow-env --no-check \
//   supabase/functions/_shared/keel/feedback_index_test.ts

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  INDEX_MAX,
  INDEX_MIN,
  NOTCHES_PER_ANSWER,
  portionFactorFor,
  portionIndexFor,
  portionIndexMoves,
} from "./feedback_index.ts";
import {
  PORTION_ADJUST_STEP,
  winningPortionAdjust,
} from "./meal_envelope.ts";
import {
  HOUSEHOLD_SUBJECT,
  type PortionAdjustItem,
  type PortionAdjustMember,
} from "./retained_item.ts";

const ADULT: PortionAdjustMember = {
  memberId: "aaaaaaaa-0000-4000-8000-000000000001",
  ageState: "adult",
};

function adjust(
  direction: "down" | "up",
  magnitude: "slight" | "clear",
  over: Partial<PortionAdjustItem> = {},
): PortionAdjustItem {
  return {
    kind: "portion.adjust",
    scope: "durable",
    subject: HOUSEHOLD_SUBJECT,
    text: "les parts",
    value: { direction, magnitude },
    source: "questionnaire",
    at: "2026-09-01",
    item: "",
    confidence: null,
    quote: "« Les portions du plan étaient : » → « Un peu trop »",
    ...over,
  } as PortionAdjustItem;
}

function indexOf(items: PortionAdjustItem[]) {
  return portionIndexFor({ mouth: ADULT, items });
}

// ===========================================================================
// 1. ⛔ LA BORNE, ET SA VALEUR N'EST PAS CHOISIE
// ===========================================================================

Deno.test("⛔ LE PIRE CAS NE BOUGE PAS: INDEX_MAX × slight === clear", () => {
  // ⚠️ C'EST LA PROPRIÉTÉ QUI REND LA BORNE NON FABRIQUÉE, et donc qui répond à
  // la cicatrice du facteur composé. Si elle tombe, l'indice sert des assiettes
  // que ce module n'a jamais servies, et le lot devient exactement ce que
  // l'ancienne règle refusait.
  assertEquals(
    INDEX_MAX * PORTION_ADJUST_STEP.slight,
    PORTION_ADJUST_STEP.clear,
    "la borne haute ne correspond plus au pire cas d'avant",
  );
  assertEquals(INDEX_MIN, -INDEX_MAX, "l'échelle n'est plus symétrique");
  // Un cran de `clear` vaut deux crans de `slight`: la table des crans et celle
  // des pas disent la même chose.
  assertEquals(
    NOTCHES_PER_ANSWER.clear * PORTION_ADJUST_STEP.slight,
    PORTION_ADJUST_STEP.clear,
  );
});

Deno.test("⛔ LA BORNE MORD, dans les deux sens", () => {
  const deep = indexOf([
    adjust("down", "clear"),
    adjust("down", "clear"),
    adjust("down", "clear"),
  ]);
  assertEquals(deep.position, INDEX_MIN);
  // ⚠️ `raw` GARDE LA POUSSÉE, et ce n'est pas décoratif: `position === MIN` ne
  // dit pas si la personne est arrivée pile au plancher ou si elle pousse
  // dessus depuis six bilans — et la seconde signale un réglage déclaré
  // franchement faux, que l'indice ne peut pas corriger seul.
  assertEquals(deep.raw, -6);

  const high = indexOf([adjust("up", "clear"), adjust("up", "clear")]);
  assertEquals(high.position, INDEX_MAX);
  assertEquals(high.raw, 4);
});

// ===========================================================================
// 2. LA CONVERGENCE — ce que « le dernier mot » ne pouvait pas faire
// ===========================================================================

Deno.test("deux réponses OPPOSÉES s'annulent, et l'ordre n'y change rien", () => {
  const a = indexOf([adjust("down", "slight"), adjust("up", "slight")]);
  const b = indexOf([adjust("up", "slight"), adjust("down", "slight")]);
  assertEquals(a.position, 0);
  assertEquals(b.position, 0);
  // ⚠️ UNE SOMME EST COMMUTATIVE, et c'est la seule propriété qui rende la
  // position indépendante du tri du magasin — donc reproductible.
  assertEquals(a.position, b.position);
  // Elles ont bien été LUES: `answers` distingue « annulé » de « rien ».
  assertEquals(a.answers, 2);
});

Deno.test("deux `slight` avancent là où « le dernier mot » stagnait", () => {
  // LE DÉFAUT FERMÉ. Avant: −5 %, puis −5 % du plan DÉJÀ corrigé, c'est-à-dire
  // le même −5 %. La personne n'avançait jamais.
  assertEquals(indexOf([adjust("down", "slight")]).position, -1);
  assertEquals(
    indexOf([adjust("down", "slight"), adjust("down", "slight")]).position,
    -2,
  );
});

// ===========================================================================
// 3. ⛔ RIEN NE SE MULTIPLIE
// ===========================================================================

Deno.test("⛔ le facteur sort de la position en UNE opération", () => {
  const step = PORTION_ADJUST_STEP.slight;
  assertEquals(portionFactorFor(indexOf([]), step), 1);
  assertEquals(portionFactorFor(indexOf([adjust("down", "slight")]), step), 0.95);
  assertEquals(
    portionFactorFor(indexOf([adjust("down", "clear")]), step),
    0.9,
  );
  // ⛔ 0,95² = 0,9025 RESTE INATTEIGNABLE — non parce qu'on l'a plafonné, mais
  // parce que rien ne se compose. C'est la réponse à la cicatrice du facteur
  // composé, et elle se mesure.
  const two = portionFactorFor(
    indexOf([adjust("down", "slight"), adjust("down", "slight")]),
    step,
  );
  assertEquals(two, 0.9);
  assert(two !== 0.95 * 0.95, "le facteur s'est composé");

  // Un pas absurde ne fabrique pas de facteur: on rend l'identité.
  assertEquals(portionFactorFor(indexOf([adjust("down", "clear")]), 0), 1);
  assertEquals(portionFactorFor(indexOf([adjust("down", "clear")]), NaN), 1);
});

// ===========================================================================
// 4. ⛔ CE QUI NE DOIT RIEN BOUGER
// ===========================================================================

Deno.test("⛔ aucune réponse ⇒ le milieu, et `answers` le dit", () => {
  // ⚠️ C'EST LA GARDE DU PLANCHER TCA, prise par le seul bout qui ne ment pas.
  // `portions` est RETIRÉE à ces personnes (`RESTRICTED_OUT`): il n'existe donc
  // aucun `portion.adjust`, et l'indice reste au milieu. La garde ne repose PAS
  // sur une lecture de la réponse — « ce qu'il fallait » et « la question n'a
  // pas été posée » rendent le même `null` en amont, et les confondre ferait
  // bouger un indice sur la population la plus vulnérable.
  const empty = indexOf([]);
  assertEquals(empty.position, 0);
  assertEquals(empty.answers, 0);
  assertEquals(portionFactorFor(empty, PORTION_ADJUST_STEP.slight), 1);
});

Deno.test("un ajustement qui vise une AUTRE bouche ne compte pas", () => {
  const other = indexOf([
    adjust("down", "clear", {
      subject: "member:bbbbbbbb-0000-4000-8000-000000000002",
    }),
  ]);
  assertEquals(other.position, 0);
  assertEquals(other.answers, 0);
});

Deno.test("une liste absente ou difforme ne jette pas", () => {
  for (const broken of [undefined, null]) {
    const out = portionIndexFor({
      mouth: ADULT,
      items: broken as unknown as PortionAdjustItem[],
    });
    assertEquals(out.position, 0);
  }
});

// ===========================================================================
// 5. ⛔ LE CÂBLAGE — l'enveloppe lit la POSITION, plus le dernier mot
// ===========================================================================

Deno.test("LE CÂBLAGE — `applyPortionAdjust` lit l'indice", async () => {
  // ⚠️ SANS CE TEST, REVENIR À `winningPortionAdjust` NE FERAIT ROUGIR PERSONNE:
  // les deux rendent une enveloppe plausible, et la différence ne se voit que
  // sur DEUX réponses — c'est-à-dire jamais dans un test à une seule.
  const src = (await Deno.readTextFile(
    new URL("./meal_envelope.ts", import.meta.url),
  ))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
  const at = src.indexOf("function applyPortionAdjust");
  assert(at > -1, "`applyPortionAdjust` a disparu");
  const body = src.slice(at, src.indexOf("\n}", at));
  assert(
    body.includes("portionIndexFor("),
    "L'ENVELOPPE NE LIT PLUS L'INDICE: elle est revenue au dernier mot, et la " +
      "personne recommence à ne jamais avancer.",
  );
  assert(
    !body.includes("winningPortionAdjust("),
    "`winningPortionAdjust` est de retour DANS `applyPortionAdjust`: deux " +
      "règles pour une même décision, et c'est celle qu'on regarde le moins " +
      "qui gouvernera l'assiette.",
  );
  assert(
    body.includes("PORTION_ADJUST_STEP.slight"),
    "le pas n'est plus celui du module: un second nombre, qui divergera",
  );
});

// ===========================================================================
// 8. ⛔ LE DÉSACCORD AVEC L'ARBITRE D'AVANT — mesuré, pas supposé
//
// Entre M3 et le 2026-09-01, les deux compteurs de génération appelaient
// `winningPortionAdjust` en affirmant être « le MÊME arbitre que celui
// qu'`envelopeFor` applique ». Ce test dit combien cette phrase coûtait.
// ===========================================================================

Deno.test("⛔ DEUX RÉPONSES OPPOSÉES: l'ancien arbitre dit « servi », l'enveloppe ne bouge pas", () => {
  // C'est le scénario même du lot M3: quelqu'un dit « un peu trop », le plan
  // suivant est corrigé, il dit « un peu trop peu » DU PLAN CORRIGÉ.
  const items = [adjust("down", "slight"), adjust("up", "slight")];
  const index = indexOf(items);

  // L'enveloppe ne bouge pas — la position est revenue au neutre.
  assertEquals(index.position, 0);
  assertEquals(index.answers, 2);
  assertEquals(portionIndexMoves(index), false);
  assertEquals(portionFactorFor(index, PORTION_ADJUST_STEP.slight), 1);

  // ⛔ ET L'ANCIEN ARBITRE, LUI, REND UN GAGNANT. C'est le nombre exact que les
  // compteurs journalisaient: « appliqué » sur une bouche qu'on n'a pas servie.
  assert(
    winningPortionAdjust({ mouth: ADULT, items }) !== null,
    "le désaccord a disparu: ce test ne mesure plus rien — relire pourquoi " +
      "les deux compteurs ont menti avant de le supprimer",
  );
});

Deno.test("le cas qui PASSE — sans lui, la garde du dessus est indiscernable d'une garde cassée", () => {
  const index = indexOf([adjust("down", "slight")]);
  assertEquals(portionIndexMoves(index), true);
  assert(winningPortionAdjust({ mouth: ADULT, items: [adjust("down", "slight")] }) !== null);
  // Les deux d'accord ici: le désaccord ne porte QUE sur l'annulation.
});

Deno.test("⛔ `portionIndexMoves` est le SEUL arbitre — trois appelants, une ligne", async () => {
  // Le recopier est exactement ce qui a menti: la condition vivait en clair
  // dans `applyPortionAdjust` pendant que les compteurs lisaient ailleurs.
  const envelope = await Deno.readTextFile(
    new URL("./meal_envelope.ts", import.meta.url),
  );
  assert(
    envelope.includes("if (!portionIndexMoves(index))"),
    "`applyPortionAdjust` a réécrit la condition en clair: elle divergera " +
      "des compteurs, comme entre M3 et le 2026-09-01.",
  );
  assertEquals(portionIndexMoves(null), false);
});
