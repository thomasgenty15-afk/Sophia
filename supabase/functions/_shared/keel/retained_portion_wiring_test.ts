// ═══════════════════════════════════════════════════════════════════════════
// LOT 1G — LE CÂBLAGE DE `portion.adjust`, ÉPINGLÉ
//
// ⚠️ CE FICHIER EXISTE À CAUSE D'UN DÉFAUT NOMMÉ PAR LE LOT 1C SUR SON PROPRE
// LOT: « aucun test ne rougirait si on supprimait mes blocs des trois
// index.ts ». Mesuré au début de ce lot: avec les deux générateurs passant
// `null` à `envelopeFor`, les trois suites nommées au contrat rendaient
// 113 passed | 0 failed — exactement le même nombre qu'une fois branchées.
// Un lot débranché était donc INDISCERNABLE d'un lot qui marche.
//
// Ce que ces tests tiennent, dans l'ordre de ce qui coûte le plus cher:
//
//   * LE CÂBLAGE LUI-MÊME — les deux `index.ts` passent une VRAIE bouche à
//     `envelopeFor`, et remettre `null` doit être ROUGE. C'est un test de
//     SOURCE, comme `household_voices_test.ts` (« LA LANE INDIVIDUELLE N'A PAS
//     BOUGÉ »): on ne peut pas monter un générateur edge dans un test unitaire,
//     et une propriété qu'aucun test ne tient n'est pas une propriété.
//   * L'ORDRE DE LA LANE FOYER — la lecture des items retenus doit précéder la
//     résolution du foyer. C'était TOUT le défaut de cette lane: le lecteur
//     existait, la donnée existait, et elle était lue 430 lignes trop tard.
//   * LE DÉFAUT D'ÂGE DE LA LANE INDIVIDUELLE — `unknown`, jamais `adult`.
//     C'est le seul endroit du câblage où un raccourci « pour faire passer le
//     cas » retirerait de la nourriture à un enfant, en silence.
//   * LA RÈGLE DU §2 AXE 3, DE BOUT EN BOUT — un `down`/`clear` sur un foyer
//     d'un adulte et d'un mineur baisse la bande de l'adulte, et SEULEMENT la
//     sienne. Les deux moitiés dans le même test: une garde sans cas passant
//     est une garde cassée qui ressemble à une garde qui marche.
//
// ⚠️ LES NOMBRES ATTENDUS SONT ÉCRITS EN DUR, jamais dérivés de
// `PORTION_ADJUST_STEP`: un test paramétré par sa propre constante reste vert
// quand on change la constante.
// ═══════════════════════════════════════════════════════════════════════════

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  envelopeFor,
  type PortionAdjustFor,
  winningPortionAdjust,
} from "./meal_envelope.ts";
import type { MealBodyContext } from "./meal_body.ts";
import { parseRetainedItem, type PortionAdjustItem } from "./retained_item.ts";
import { ageStateFromVerdict, type MemberAgeState } from "./household.ts";

// ---------------------------------------------------------------------------
// LES SOURCES — lues, décommentées, puis interrogées
// ---------------------------------------------------------------------------

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

/**
 * ⚠️ LES COMMENTAIRES PARTENT D'ABORD, ET C'EST UNE CICATRICE DU DÉPÔT
 * (« Audit d'appelants: retirer les commentaires »). Les deux fichiers visés
 * ici PARLENT abondamment de `portion.adjust`, de `null` et de
 * `subjectsForPortionAdjust` dans leurs blocs de tête: un grep naïf rendrait
 * vert un produit entièrement débranché, sur la seule foi de sa prose.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(
    /(^|[^:])\/\/[^\n]*/g,
    "$1",
  );
}

async function source(rel: string): Promise<string> {
  return stripComments(await Deno.readTextFile(new URL(rel, FUNCTIONS_DIR)));
}

/**
 * LES ARGUMENTS D'UN APPEL, DÉCOUPÉS AU NIVEAU SUPÉRIEUR.
 *
 * ── POURQUOI PAS UNE EXPRESSION RÉGULIÈRE ─────────────────────────────────
 * L'appel visé porte des arguments qui contiennent eux-mêmes des virgules,
 * des parenthèses et des accolades (`lineBodies.get(m.memberId)?.activityLevel
 * ?? null`). Une regex qui « trouve `null` quelque part dans l'appel » serait
 * verte sur les six premiers paramètres, dont trois valent légitimement `null`
 * — c'est-à-dire verte sur le défaut exact que ce fichier existe pour tenir.
 *
 * On équilibre donc les délimiteurs et on rend le N-ième argument, celui-là et
 * pas un autre.
 */
function callArgs(src: string, callee: string, from = 0): string[] {
  const open = src.indexOf(`${callee}(`, from);
  if (open === -1) throw new Error(`appel introuvable: ${callee}(`);
  let depth = 0;
  let start = open + callee.length + 1;
  const args: string[] = [];
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0 && c === ")") {
        args.push(src.slice(start, i).trim());
        // La virgule finale du style du dépôt laisse un argument VIDE. On le
        // retire ici plutôt que dans chaque assertion: une position d'argument
        // qui dépendrait d'un détail de formatage serait une position fausse le
        // jour où `deno fmt` change d'avis.
        if (args.length > 0 && args[args.length - 1] === "") args.pop();
        return args;
      }
      depth -= 1;
    } else if (c === "," && depth === 0) {
      args.push(src.slice(start, i).trim());
      start = i + 1;
    }
  }
  throw new Error(`appel non refermé: ${callee}(`);
}

/**
 * La position des `portion.adjust` dans `envelopeFor` — le 8ᵉ paramètre.
 *
 * ⚠️ C'ÉTAIT LE 7ᵉ JUSQU'AU 2026-08-20. Les deux axes d'activité (journée x
 * sport) se sont insérés JUSTE APRÈS le cran, donc avant celui-ci. La position
 * est nommée plutôt que recopiée pour que ce genre de décalage se corrige en un
 * seul endroit — et le test d'arité juste en dessous est ce qui l'attrape.
 */
const PORTION_ARG = 8;

/** La position des deux axes journée x sport — le 7ᵉ paramètre (2026-08-20). */
const AXES_ARG = 6;

/** La position de l'appétit — le 8ᵉ paramètre (lot ⑤, 2026-08-20). */
const APPETITE_ARG = 7;

Deno.test("LE CÂBLAGE — les DEUX générateurs passent une bouche à `envelopeFor`", async () => {
  // ⚠️ LA MOITIÉ QUI REND CE TEST UTILE: il doit rougir si quelqu'un remet
  // `null`. Vérifié par mutation (voir le rapport du lot): remettre `null` au
  // 7ᵉ argument de l'une OU l'autre lane fait tomber cette assertion, et elle
  // seule — donc l'échec DÉSIGNE le fichier débranché.
  for (
    const [lane, rel] of [
      ["foyer", "generate-household-meal-v1/index.ts"],
      ["individuelle", "generate-meal-v1/index.ts"],
    ] as const
  ) {
    const src = await source(rel);
    const args = callArgs(src, "envelopeFor");
    assertEquals(
      args.length,
      9,
      `lane ${lane}: \`envelopeFor\` n'est plus appelée avec ses 9 paramètres`,
    );
    assert(
      args[PORTION_ARG] !== "null",
      `LANE ${lane.toUpperCase()} DÉBRANCHÉE: \`envelopeFor\` reçoit \`null\` en ` +
        `7ᵉ argument. Le lecteur du lot 1E est construit et rien ne lui ` +
        `arrive: un \`portion.adjust\` retenu n'a AUCUN effet, en silence.`,
    );
  }
});

Deno.test("LANE FOYER — les deux axes d'activité viennent de la FICHE, pas d'un littéral", async () => {
  // ⛔ LA MOITIÉ QUI REND CE TEST UTILE, ET ELLE EST ASYMÉTRIQUE ENTRE LES DEUX
  // LANES. Le lot ② du 2026-08-20 pose la journée et le sport sur la fiche
  // d'une bouche de FOYER; la lane individuelle n'a pas ces colonnes et passe
  // le littéral neutre, en le disant. Si la lane foyer se mettait à passer le
  // même littéral, le lot serait construit, migré, affiché — et désarmé, sans
  // qu'aucun autre test ne rougisse: le produit rendrait exactement les nombres
  // d'avant, ce qui est précisément le mode d'échec n°1 de ce dépôt.
  const household = await source("generate-household-meal-v1/index.ts");
  const args = callArgs(household, "envelopeFor");
  assert(
    /lineBodies\.get\(m\.memberId\)\?\.activityAxes/.test(args[AXES_ARG]),
    "LANE FOYER DÉBRANCHÉE: `envelopeFor` ne reçoit plus les axes LUS sur la " +
      "fiche (`lineBodies…activityAxes`), donc la journée et le sport " +
      `collectés n'atteignent aucune équation. Reçu: ${args[AXES_ARG]}`,
  );
  // ⑤ — MÊME GARDE, MÊME RAISON. L'appétit est TRANSITOIRE (le lot ⑦ le
  // remplace), ce qui le rend d'autant plus facile à débrancher « en passant »
  // le jour où ⑦ arrive: un littéral `null` ici et les trois crans deviennent
  // décoratifs pour toutes les bouches SANS COMPTE, qui sont précisément celles
  // que ⑦ ne couvrira jamais.
  assert(
    /lineBodies\.get\(m\.memberId\)\?\.appetite/.test(args[APPETITE_ARG]),
    "LANE FOYER DÉBRANCHÉE: `envelopeFor` ne reçoit plus l'appétit LU sur la " +
      `fiche. Reçu: ${args[APPETITE_ARG]}`,
  );
});

Deno.test("LANE FOYER — la bouche porte son `ageState`, et la liste n'est pas pré-filtrée", async () => {
  const household = await source("generate-household-meal-v1/index.ts");
  const args = callArgs(household, "envelopeFor");
  assertEquals(
    args[PORTION_ARG],
    "portionAdjustFor(m)",
    "la lane foyer ne construit plus la bouche par `portionAdjustFor`: si le " +
      "couple {bouche, items} est recopié en ligne, il finira par partir sans " +
      "`ageState`, et la règle du §2 axe 3 sera désarmée sans qu'une ligne ne " +
      "le dise.",
  );
  assert(
    /const portionAdjustFor = \([\s\S]{0,200}?ageState: MemberAgeState[\s\S]{0,200}?\): PortionAdjustFor/
      .test(household),
    "`portionAdjustFor` ne prend plus une bouche avec son `ageState`: une " +
      "bouche sans état d'âge rendrait « personne n'est concerné », " +
      "indiscernable d'une garde débranchée.",
  );
  // ⚠️ `routedRetained.portion` ET PAS `retainedPortion`. Passer l'audience
  // déjà calculée reviendrait à appliquer la règle DEUX fois — une première
  // ici, sur le roster du foyer, une seconde dans `winningPortionAdjust` sur
  // le roster d'une bouche. Deux applications d'une même règle divergent.
  assert(
    /items: routedRetained\.portion/.test(household),
    "la lane foyer ne passe plus la liste ENTIÈRE des ajustements: elle " +
      "pré-filtre, donc elle applique la règle du mineur une seconde fois, " +
      "en amont de celle qui fait autorité.",
  );
});

Deno.test("LANE FOYER — LA LECTURE PRÉCÈDE LA RÉSOLUTION (c'était TOUT le défaut)", async () => {
  // ⚠️ SANS CE TEST, LE PRÉCÉDENT SE RÉPARE EN REMETTANT LE DÉFAUT. Le bloc de
  // résolution peut remonter au-dessus de la lecture des items retenus: le
  // fichier ne compilerait plus (`routedRetained` non défini), mais RIEN dans
  // le dépôt ne dirait POURQUOI l'ordre compte, ni ne l'empêcherait de repartir
  // avec un `null` remis « en attendant ». Ces deux nombres le disent.
  const household = await source("generate-household-meal-v1/index.ts");
  const read = household.indexOf("const routedRetained = routeRetainedItems(");
  const resolve = household.indexOf("const resolution = resolveHousehold(");
  assert(read !== -1, "la lane foyer ne route plus ses items retenus.");
  assert(resolve !== -1, "la lane foyer ne résout plus son foyer.");
  assert(
    read < resolve,
    "LA RÉSOLUTION DU FOYER EST REPASSÉE AU-DESSUS DE LA LECTURE DES ITEMS " +
      "RETENUS. C'est l'ordre exact que le lot 1G a repris: l'enveloppe se " +
      "construisait avant que le magasin ne soit lu, donc elle ne pouvait " +
      "recevoir que `null`.",
  );
});

Deno.test("LANE FOYER — le compteur du câblage est là, et il compte les BOUCHES", async () => {
  // « Champ déclaré = compteur obligatoire »: sans lui, un lot désarmé
  // ressemble à un lot qui marche. `portion_unapplied` comptait ce qui
  // N'ARRIVAIT PAS à l'enveloppe; le garder maintenant que le câblage existe
  // rendrait le même nombre pour « rien à appliquer » et « tout appliqué ».
  const household = await source("generate-household-meal-v1/index.ts");
  assert(
    !household.includes("portion_unapplied"),
    "la trace du foyer compte encore `portion_unapplied`: ce nombre disait " +
      "« l'enveloppe ne reçoit rien », ce qui est devenu faux.",
  );
  assert(
    /portion_applied: composedMembers\.filter\(/.test(household),
    "la trace du foyer ne compte plus les bouches servies: `portion` non nul " +
      "avec `portion_applied: 0` et `portion_excluded` vide est la seule " +
      "signature lisible d'un câblage rompu, et elle disparaît avec ce champ.",
  );
  // ⛔ CE TEST ÉPINGLAIT LE MENSONGE — corrigé le 2026-09-01. Il exigeait
  // `winningPortionAdjust`, et il est resté VERT à travers le lot M3, qui a
  // pourtant retiré à cet arbitre tout pouvoir sur l'enveloppe. Sa raison
  // d'être était juste (« il finira par dire autre chose que l'enveloppe »);
  // c'est le SYMBOLE nommé qui a vieilli. Un test qui nomme un arbitre le fixe
  // dans le temps: il faut nommer CELUI QUI DÉCIDE, et un seul le décide.
  assert(
    /portionIndexMoves\(portionIndexFor\(/.test(household),
    "le compteur ne passe plus par `portionIndexMoves`: il recompte à la " +
      "main ce que l'enveloppe décide, donc il finira par dire autre chose " +
      "qu'elle — c'est exactement ce qui est arrivé entre M3 et le 2026-09-01.",
  );
  // ⚠️ ET L'ANCIEN ARBITRE NE DOIT PAS REVENIR ICI. Le rebrancher « par
  // symétrie » ramènerait le désaccord sans qu'aucun test ne rougisse.
  assert(
    !/winningPortionAdjust\(portionAdjustFor\(m\)\)/.test(household),
    "le compteur du foyer est revenu à `winningPortionAdjust`, l'arbitre " +
      "d'AVANT M3: il compterait « servi » des bouches que l'enveloppe " +
      "n'a pas bougées.",
  );
});

Deno.test("LANE INDIVIDUELLE — son compteur lit LE MÊME arbitre", async () => {
  // Le défaut était SYMÉTRIQUE: les deux générateurs affirmaient lire
  // l'arbitre de l'enveloppe, les deux lisaient l'ancien.
  const individual = await source("generate-meal-v1/index.ts");
  assert(
    /applied: portionIndexMoves\(studentPortionIndex\)/.test(individual),
    "la lane individuelle ne compte plus par `portionIndexMoves`.",
  );
  assert(
    !/winningPortionAdjust\(/.test(individual),
    "la lane individuelle est revenue à l'arbitre d'AVANT M3.",
  );
  // ⚠️ ET LA POSITION EST DANS LA LIGNE, pas seulement le 0/1: « −1 après une
  // réponse » et « −1 après trois qui s'annulent presque » sont deux
  // histoires, et un booléen les rend identiques.
  for (const field of ["answers:", "position:", "raw:", "factor:"]) {
    assert(
      individual.includes(field),
      `le compteur de portions ne dit plus \`${field}\`: l'indice redevient ` +
        "illisible depuis les logs.",
    );
  }

  // ⛔ ET L'ENVELOPPE SORT AVEC SON CONTREFACTUEL. Sans lui, « l'ajustement
  // arrive à l'assiette » resterait une phrase qu'aucune mesure ne peut
  // démentir: comparer deux GÉNÉRATIONS mélangerait la variance du modèle avec
  // l'effet cherché. Le second appel, seul argument de portion mis à `null`,
  // est la seule forme où l'écart n'a qu'une cause possible.
  assert(
    individual.includes('tag: "keel.meal.envelope"'),
    "l'enveloppe n'est plus journalisée: c'est le nombre qui JUGE et qui MET " +
      "À L'ÉCHELLE, et il redevient invisible sur un `draft`.",
  );
  assert(
    /const unadjustedEnvelope = envelopeFor\(/.test(individual),
    "LE CONTREFACTUEL A DISPARU: sans lui, le facteur de portion n'est plus " +
      "observable en aval, seulement re-déclaré par le compteur qui le calcule.",
  );
});

Deno.test("LANE INDIVIDUELLE — l'âge est LU, et son défaut est `unknown`", async () => {
  const individual = await source("generate-meal-v1/index.ts");
  assertEquals(
    callArgs(individual, "envelopeFor")[PORTION_ARG],
    "studentPortionAdjust",
    "la lane individuelle ne passe plus sa bouche à l'enveloppe.",
  );
  assert(
    /studentAgeState = ageStateFromVerdict\(snapshot\.verdict\)/.test(
      individual,
    ),
    "la lane individuelle ne dérive plus l'état d'âge du verdict de " +
      "naissance: soit elle l'invente, soit elle ne l'a plus.",
  );
  // ⚠️ LE DÉFAUT, ÉPINGLÉ À SON LITTÉRAL. C'est LE point de bascule de tout ce
  // lot: `adult` par défaut retournerait le booléen que ce dépôt a retiré
  // exprès, et un compte de MINEUR atteint cette lane (contrairement à
  // `generate-week-plan-v1`, qui rend `409 minor_student`).
  assert(
    /let studentAgeState: MemberAgeState = "unknown";/.test(individual),
    "le défaut d'état d'âge de la lane individuelle n'est plus `unknown`: " +
      "« je ne sais pas » et « majeur » doivent produire des résultats " +
      "OPPOSÉS, et un corps illisible ne doit JAMAIS rendre un `down` " +
      "applicable.",
  );
  assert(
    !/ageState: "adult"/.test(individual),
    "la lane individuelle déclare une bouche `adult` en dur: c'est le " +
      "raccourci « pour faire passer le cas », et il retire de la nourriture " +
      "à un enfant sans qu'une seule ligne ne le dise.",
  );
  assert(
    /mouth: \{ memberId: userId, ageState: studentAgeState \}/.test(individual),
    "la bouche de la lane individuelle n'est plus construite depuis l'état " +
      "d'âge lu: elle est fabriquée.",
  );
});

// ---------------------------------------------------------------------------
// DE BOUT EN BOUT — la règle du §2 axe 3, sur le couple que la lane construit
// ---------------------------------------------------------------------------

const KID_ID = "11111111-1111-1111-1111-111111111111";
const ADULT_ID = "22222222-2222-2222-2222-222222222222";

function body(over: Partial<MealBodyContext> = {}): MealBodyContext {
  return {
    heightCm: 175,
    ageBand: "30_44",
    gender: "male",
    latestWeight: { weekStart: "2026-08-03", value: 80 },
    latestWaist: null,
    declaredWeightKg: null,
    restrictionFlag: false,
    ...over,
  };
}

/** Un item passé par le PARSEUR — jamais un `as`, qui désarmerait le typecheck. */
function adjust(subject = "household"): PortionAdjustItem {
  const parsed = parseRetainedItem({
    kind: "portion.adjust",
    scope: "durable",
    subject,
    text: "les portions étaient trop grosses",
    value: { direction: "down", magnitude: "clear" },
    // Le questionnaire est le SEUL producteur de cette famille (§5).
    source: "questionnaire",
    at: "2026-08-18",
    item: "",
    confidence: null,
  });
  if (parsed === null || parsed.kind !== "portion.adjust") {
    throw new Error("fixture illisible — le parseur a refusé l'item");
  }
  return parsed;
}

/**
 * ⚠️ LA MÊME CONSTRUCTION QUE `portionAdjustFor` DANS LA LANE FOYER: la liste
 * ENTIÈRE des items, et la bouche à côté. Un test qui pré-filtrerait ici
 * testerait un câblage que le générateur ne fait pas.
 */
function forMouth(
  ageState: MemberAgeState,
  memberId: string,
  items: PortionAdjustItem[],
): PortionAdjustFor {
  return { mouth: { memberId, ageState }, items };
}

Deno.test("DE BOUT EN BOUT — un `down`/`clear` de foyer baisse l'ADULTE, et LUI SEUL", () => {
  // Un seul item, `subject: "household"` — la remarque non attribuée d'un
  // adulte, exactement le cas de l'encadré du §2 axe 3.
  const items = [adjust()];

  // LE TÉMOIN, calculé et pas écrit à la main: c'est l'enveloppe que les deux
  // bouches auraient sans un seul `portion.adjust` en base.
  const baseline = envelopeFor(
    "maintenance",
    body(),
    "30_44",
    false,
    null,
    null,
    { day: null, sport: null, asked: false },
    null,
    null,
  );
  assert(baseline.mode === "per_kg");
  assertEquals(baseline.energy, { low: 2442, high: 2700 });

  // ── LA MOITIÉ QUI PASSE ────────────────────────────────────────────────
  // Sans elle, le test resterait vert sur un produit où PERSONNE ne reçoit
  // jamais d'ajustement — c'est-à-dire sur la garde cassée qui ressemble à une
  // garde qui marche.
  const adult = envelopeFor(
    "maintenance",
    body(),
    "30_44",
    false,
    null,
    null,
    { day: null, sport: null, asked: false },
    null,
    forMouth("adult", ADULT_ID, items),
  );
  assert(adult.mode === "per_kg");
  // −10 %, écrit en dur: 2442 × 0,90 = 2198, 2700 × 0,90 = 2430.
  assertEquals(adult.energy, { low: 2198, high: 2430 });

  // ── LA MOITIÉ QUI MORD ─────────────────────────────────────────────────
  // MÊME corps, MÊME bande d'âge, MÊME objectif, MÊME item: la SEULE
  // différence est l'état d'âge de la bouche. Une assiette d'enfant ne se
  // réduit pas sur une remarque que personne ne lui a attribuée.
  const kid = envelopeFor(
    "maintenance",
    body(),
    "30_44",
    false,
    null,
    null,
    { day: null, sport: null, asked: false },
    null,
    forMouth("minor", KID_ID, items),
  );
  assert(kid.mode === "per_kg");
  assertEquals(kid.energy, baseline.energy);

  // ── ET L'ÂGE NON SAISI EST TRAITÉ COMME UN MINEUR (contrat §3) ──────────
  // C'est le cas le PLUS COURANT — l'âge est facultatif à la saisie — donc
  // celui sans lequel la garde serait armée sur un coffre vide.
  const unknown = envelopeFor(
    "maintenance",
    body(),
    "30_44",
    false,
    null,
    null,
    { day: null, sport: null, asked: false },
    null,
    forMouth("unknown", KID_ID, items),
  );
  assert(unknown.mode === "per_kg");
  assertEquals(unknown.energy, baseline.energy);
});

Deno.test("DE BOUT EN BOUT — la lane individuelle: le verdict décide, pas un défaut", () => {
  // ⚠️ LE COUPLE EXACT QUE `generate-meal-v1` CONSTRUIT: `ageStateFromVerdict`
  // du verdict de naissance, et `memberId: userId`. On rejoue la chaîne
  // entière — date de naissance → verdict → état d'âge → enveloppe — parce que
  // c'est la seule façon de montrer que les trois populations se séparent.
  const items = [adjust()];
  const bandFor = (birthVerdictAge: MemberAgeState) => {
    const env = envelopeFor(
      "maintenance",
      body(),
      "30_44",
      false,
      null,
      null,
      { day: null, sport: null, asked: false },
      null,
      forMouth(birthVerdictAge, "u-solo", items),
    );
    assert(env.mode === "per_kg");
    return env.energy;
  };

  // La projection est celle du dépôt, appelée pour de vrai: si quelqu'un
  // faisait un jour dériver `absent` vers `adult`, cette ligne rougirait ici
  // avant de retirer de la nourriture à quelqu'un.
  assertEquals(
    ageStateFromVerdict({ status: "adult", isoDate: "1990-04-02", age: 36 }),
    "adult",
  );
  assertEquals(
    ageStateFromVerdict({ status: "minor", isoDate: "2015-01-01", age: 11 }),
    "minor",
  );
  assertEquals(ageStateFromVerdict({ status: "absent" }), "unknown");

  assertEquals(bandFor("adult"), { low: 2198, high: 2430 });
  assertEquals(bandFor("minor"), { low: 2442, high: 2700 });
  // ⚠️ LE PRIX ASSUMÉ DU LOT, ÉCRIT COMME UNE PROPRIÉTÉ ET PAS COMME UN
  // COMMENTAIRE: sans date de naissance au dossier, une personne seule ne peut
  // pas réduire sa propre part. Ce n'est pas un oubli, c'est la direction sûre
  // du socle — et le log `keel.meal.portion_adjust` la rend visible avec son
  // motif `age_unknown`. Le jour où quelqu'un veut renverser cet arbitrage,
  // c'est cette ligne qui doit le forcer à l'écrire.
  assertEquals(bandFor("unknown"), { low: 2442, high: 2700 });
});

Deno.test("À LA HAUSSE, PERSONNE N'EST RETIRÉ — y compris âge inconnu", () => {
  // La contre-épreuve de l'asymétrie: la règle protège d'un RETRAIT. Sans ce
  // test, on pourrait « durcir » la garde en excluant aussi les `up`, et la
  // seule chose qui marche aujourd'hui pour tout le monde disparaîtrait.
  const up = parseRetainedItem({
    kind: "portion.adjust",
    scope: "durable",
    subject: "household",
    text: "j'ai encore faim après le dîner",
    value: { direction: "up", magnitude: "clear" },
    source: "questionnaire",
    at: "2026-08-18",
    item: "",
    confidence: null,
  });
  if (up === null || up.kind !== "portion.adjust") {
    throw new Error("fixture illisible");
  }

  for (const ageState of ["adult", "minor", "unknown"] as const) {
    assert(
      winningPortionAdjust(forMouth(ageState, KID_ID, [up])) !== null,
      `une bouche \`${ageState}\` est retirée d'un ajustement À LA HAUSSE: ` +
        `la règle protège d'un RETRAIT de nourriture, pas d'un ajout.`,
    );
  }
});
