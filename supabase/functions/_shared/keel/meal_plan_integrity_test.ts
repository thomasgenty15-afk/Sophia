import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

import {
  firstBlockingPlan,
  lastNameableStart,
  planOverlapVerdict,
  windowStartsBeyondDayTokens,
} from "./meal_plan_window.ts";
import {
  buildMergeBlock,
  buildUnmergeBlock,
  mergeWindowWritable,
} from "./household_merge.ts";
import {
  emptySlotsIn,
  emptySlotsLine,
  parseGeneratedMeal,
} from "./meal_generation.ts";

// ===========================================================================
// C2 — L'INTÉGRITÉ DU PLAN: CE QUI SE DÉCIDE AVANT LE MODÈLE, ET LES TROUS
//
// Quatre défauts, tous MESURÉS EN HTTP RÉEL le 2026-08-12:
//
//   ② une fenêtre qui démarre au-delà de dimanche fabrique une consigne
//      contradictoire (« today is: wed » à côté de « days to fill: tue »), et
//      le modèle refuse — après 6,2 s FACTURÉES;
//   ③ une fenêtre strictement intérieure à un plan vivant se paie
//      `409 plan_overlaps_existing` APRÈS le modèle (16,1 s côté fusion);
//   ④ un plat rejeté ne rebouche jamais sa case, et la défusion recopie le
//      trou (5 petits-déjeuners perdus, puis 14 titres recopiés sur 14);
//   ⑤ des préparations recopiées dans `dishes`, sans jour ni créneau, en
//      silence (7 entrées sur 16, les mêmes 7 titres que `preparations`).
//
// Ce que ce fichier N'EST PAS: un banc de fenêtres. La table de cas partagée
// avec le navigateur vit dans `meal_plan_window_test.ts`, et les octets des
// blocs de fusion dans `household_merge_test.ts`. Ici, uniquement ce que C2
// ajoute — et son cas qui PASSE, sans quoi chaque garde ci-dessous serait
// indiscernable d'une garde qui refuse tout.
// ===========================================================================

// Un mercredi. Le jour même du défaut mesuré.
const WED = "2026-08-12";
const THU = "2026-08-13";
const SUN = "2026-08-16";
const NEXT_MON = "2026-08-17";
const NEXT_TUE = "2026-08-18";

// ---------------------------------------------------------------------------
// ② — LES JETONS DE JOUR NE VONT PAS AU-DELÀ DE DIMANCHE
// ---------------------------------------------------------------------------

Deno.test("② le départ MESURÉ — 2026-08-26 demandé un mercredi — est refusé", () => {
  // ⚠️ LE CAS EXACT, ET IL EST LA RAISON D'ÊTRE DE LA GARDE. `starts_on =
  // 2026-08-26` est un MARDI, quatorze jours plus tard: le message portait
  // « today is: wed » et « days to fill, in this order: tue, wed ». Le modèle a
  // refusé en toutes lettres, `422 empty_meal`, après 6,2 s facturées.
  assert(windowStartsBeyondDayTokens("2026-08-26", WED));
});

Deno.test("② LE CAS QUI PASSE — aujourd'hui, demain, et jusqu'à dimanche", () => {
  // ⚠️ SANS CETTE MOITIÉ, LA GARDE POURRAIT REFUSER TOUT et ressembler à une
  // garde qui marche. Ces trois-là sont les gestes du produit: « jusqu'à
  // dimanche » démarre aujourd'hui, le sélecteur de dates démarre où l'élève
  // clique, et le dimanche est le dernier jour que les jetons savent nommer.
  for (const start of [WED, THU, "2026-08-15", SUN]) {
    assertEquals(
      windowStartsBeyondDayTokens(start, WED),
      false,
      `${start} doit rester composable`,
    );
  }
});

Deno.test("② la borne est DIMANCHE, pas « sept jours »", () => {
  // ⚠️ C'EST LE CHOIX DU LOT, ET IL SE MESURE ICI. Une borne à `today + 6`
  // aurait laissé passer « je prépare lundi prochain », demandé un mercredi:
  // lundi (`mon`) précède mercredi (`wed`) dans la semaine, donc le message
  // aurait dit « days to fill: mon » sous « do not start earlier than today » —
  // exactement la contradiction mesurée, à six jours au lieu de quatorze.
  assertEquals(lastNameableStart(WED), SUN);
  assert(windowStartsBeyondDayTokens(NEXT_MON, WED), "lundi prochain");
  assert(windowStartsBeyondDayTokens(NEXT_TUE, WED), "mardi prochain");
  // Un dimanche, la semaine tient en UN jour: tout le reste est « la semaine
  // prochaine », et c'est le même mot que `until_sunday` rend déjà.
  assertEquals(lastNameableStart(SUN), SUN);
  assert(windowStartsBeyondDayTokens(NEXT_MON, SUN));
  // Un lundi, elle tient en sept.
  assertEquals(lastNameableStart("2026-08-10"), SUN);
});

Deno.test("② `today + 7` porte le jeton d'AUJOURD'HUI, et se refuse aussi", () => {
  // La seconde moitié structurelle: à sept jours, le jeton n'est pas « en
  // arrière », il est DÉJÀ PRIS. Le modèle lirait « days to fill: wed » sous
  // « today is: wed » et composerait pour aujourd'hui.
  assert(windowStartsBeyondDayTokens("2026-08-19", WED));
});

Deno.test("② une date illisible ne fabrique pas un refus", () => {
  // La garde ne se prononce que sur deux dates lisibles: `resolveRequestedWindow`
  // a déjà refusé le reste, nommément, et doubler son refus par un motif
  // différent enverrait l'élève chercher la mauvaise chose.
  assertEquals(windowStartsBeyondDayTokens("pas-une-date", WED), false);
  assertEquals(windowStartsBeyondDayTokens(WED, ""), false);
});

// ---------------------------------------------------------------------------
// ③ — LA RÈGLE D'ÉCRITURE DE LA BASE, LUE AVANT LE MODÈLE
// ---------------------------------------------------------------------------

const HOUSE = { startsOn: "2026-08-10", durationDays: 7 } as const; // lun → dim

Deno.test("③ les quatre verdicts de la boucle de chevauchement", () => {
  // ① « commence le même jour ou après » ⇒ refus.
  assertEquals(
    planOverlapVerdict(HOUSE, { startsOn: "2026-08-10", durationDays: 3 }),
    "starts_at_or_after",
  );
  // ② « commence avant ET finit après » ⇒ refus. C'EST LE DÉFAUT MESURÉ: la
  //    fenêtre demandée est strictement INTÉRIEURE au plan vivant, et sa queue
  //    se retrouverait sans aucun plan.
  assertEquals(
    planOverlapVerdict(HOUSE, { startsOn: WED, durationDays: 3 }),
    "encloses",
  );
  // ③ « commence avant et finit dedans » ⇒ tronqué, légitimement (D15).
  assertEquals(
    planOverlapVerdict(HOUSE, { startsOn: WED, durationDays: 5 }),
    "truncated",
  );
  // Et ce que la RPC ne voit même pas: son `&&` de `daterange`.
  assertEquals(
    planOverlapVerdict(HOUSE, { startsOn: NEXT_MON, durationDays: 3 }),
    "no_overlap",
  );
});

Deno.test("③ LE CAS QUI PASSE — la ligne REMPLACÉE ne bloque rien", () => {
  // ⚠️ SANS `replacesId`, CE TEST SERAIT LE PRODUIT CASSÉ. « Remplace le plan
  // courant » démarre TOUJOURS le même jour que lui: la RPC le retire avant sa
  // boucle, et un prédicat qui l'ignorerait refuserait la composition la plus
  // banale du produit.
  const live = [{ id: "current", ...HOUSE }];
  const window = { startsOn: "2026-08-10", durationDays: 3 };
  assertEquals(firstBlockingPlan({ live, window, replacesId: "current" }), null);
  // Et sans le remplacement annoncé, la base refuse — donc nous aussi.
  assertEquals(
    firstBlockingPlan({ live, window, replacesId: null })?.verdict,
    "starts_at_or_after",
  );
});

Deno.test("③ la fenêtre ENGLOBÉE est refusée même en remplaçant une AUTRE ligne", () => {
  // Le cas du produit: deux plans vivants (le courant et le suivant, ce que
  // `prepare_next` produit), et l'élève en remplace un pendant que l'autre
  // mord. Retirer la mauvaise ligne du calcul rendrait le refus muet.
  const live = [
    { id: "current", ...HOUSE },
    { id: "next", startsOn: NEXT_MON, durationDays: 7 },
  ];
  const blocking = firstBlockingPlan({
    live,
    window: { startsOn: WED, durationDays: 3 },
    replacesId: "next",
  });
  assertEquals(blocking?.plan.id, "current");
  assertEquals(blocking?.verdict, "encloses");
});

Deno.test("③ le prédicat de la FUSION rend exactement ce qu'il rendait", () => {
  // ⚠️ `mergeWindowWritable` est devenu un APPELANT de la règle partagée, et
  // son comportement ne doit pas avoir bougé d'un cas: son banc de propriété de
  // 400 formes (`household_merge_test.ts`) en dépend, et c'est lui qui prouve
  // que toute fenêtre de fusion est écrivable.
  assertEquals(mergeWindowWritable(HOUSE, { startsOn: WED, durationDays: 5 }), true);
  assertEquals(mergeWindowWritable(HOUSE, { startsOn: WED, durationDays: 4 }), false);
  assertEquals(
    mergeWindowWritable(HOUSE, { startsOn: "2026-08-10", durationDays: 1 }),
    true,
  );
});

// ---------------------------------------------------------------------------
// ④ — LA CASE VIDE, VISIBLE
// ---------------------------------------------------------------------------

const RHYTHM = [
  { slot: "breakfast" as const, size: null },
  { slot: "lunch" as const, size: null },
  { slot: "dinner" as const, size: null },
];

Deno.test("④ le petit-déjeuner qui manque est NOMMÉ, jour par jour", () => {
  // ⚠️ LE DÉFAUT MESURÉ, EN PETIT. Un plat citant « whey protein 90 g » est
  // rejeté ENTIER par le verrou numérique — qui est juste, et antérieur — et
  // les cinq petits-déjeuners du foyer tombent d'un coup. La seule trace était
  // la ligne du plat REJETÉ: « ce plat est tombé » et « il n'y a plus aucun
  // petit-déjeuner » ne sont pas la même information.
  const gaps = emptySlotsIn({
    days: ["wed", "thu"],
    rhythm: RHYTHM,
    dishes: [
      { day: "wed", slot: "lunch" },
      { day: "wed", slot: "dinner" },
      { day: "thu", slot: "lunch" },
      { day: "thu", slot: "dinner" },
    ],
    awayDays: [],
    fixedIntakes: [],
  });
  assertEquals(gaps, [
    { day: "wed", slot: "breakfast" },
    { day: "thu", slot: "breakfast" },
  ]);
  assertEquals(emptySlotsLine(gaps), "wed/breakfast, thu/breakfast");
});

Deno.test("④ LE CAS QUI PASSE — une grille complète ne rend AUCUN trou", () => {
  // ⚠️ SANS LUI, UN CONSTAT QUI CRIE TOUJOURS RESSEMBLE À UN CONSTAT QUI MARCHE
  // — et il partirait ensuite dans le prompt de défusion, où il ferait
  // fabriquer des plats sur des cases pleines.
  const full = [];
  for (const day of ["wed", "thu"]) {
    for (const slot of ["breakfast", "lunch", "dinner"]) full.push({ day, slot });
  }
  assertEquals(
    emptySlotsIn({
      days: ["wed", "thu"],
      rhythm: RHYTHM,
      dishes: full,
      awayDays: [],
      fixedIntakes: [],
    }),
    [],
  );
});

Deno.test("④ un vide VOULU n'est pas un trou: l'absence et l'apport fixe", () => {
  // Les deux moments que le parseur JETTE déjà, exprès (L2 et FF-051). Les
  // compter comme des trous ferait réclamer au modèle exactement ce que la
  // consigne lui interdit — et un plan sans absence n'existerait plus.
  const gaps = emptySlotsIn({
    days: ["wed"],
    rhythm: RHYTHM,
    dishes: [{ day: "wed", slot: "dinner" }],
    // Mercredi midi, il n'est pas là.
    awayDays: [{ day: "wed", slots: ["lunch"] }],
    // Et son petit-déjeuner est un shaker qui REMPLACE le repas.
    fixedIntakes: [{
      foodRef: "whey",
      label: "shaker",
      amount: 30,
      unit: "g",
      placement: "at_slot",
      slot: "breakfast",
      replacesMeal: true,
      days: [],
    }],
  });
  assertEquals(gaps, []);
});

Deno.test("④ un plat sans jour couvre la fenêtre, un plat sans moment la journée", () => {
  // Deviner lequel de ses repas est un plat sans créneau fabriquerait un trou
  // qui n'existe pas. `windowSplit` range déjà un plat sans jour dans la
  // fenêtre entière; on lit la même chose.
  assertEquals(
    emptySlotsIn({
      days: ["wed", "thu"],
      rhythm: [{ slot: "dinner", size: null }],
      dishes: [{ day: null, slot: "dinner" }],
      awayDays: [],
      fixedIntakes: [],
    }),
    [],
  );
  assertEquals(
    emptySlotsIn({
      days: ["wed"],
      rhythm: RHYTHM,
      dishes: [{ day: "wed", slot: null }],
      awayDays: [],
      fixedIntakes: [],
    }),
    [],
  );
});

Deno.test("④ sans rythme déclaré, la grille est celle du PROMPT", () => {
  // `occasionList([])` dit « breakfast, lunch and dinner » au modèle. Un
  // constat qui compterait autre chose réclamerait un repas que la consigne
  // n'a pas demandé.
  assertEquals(
    emptySlotsIn({
      days: ["wed"],
      rhythm: [],
      dishes: [],
      awayDays: [],
      fixedIntakes: [],
    }).map((g) => g.slot),
    ["breakfast", "lunch", "dinner"],
  );
});

// ---------------------------------------------------------------------------
// ④ + ⑤ — LE PARSEUR, SUR DE VRAIS OCTETS
// ---------------------------------------------------------------------------

const PARSE_ARGS = {
  doctrine: null,
  safetyConstraints: null,
  mode: "to_shop" as const,
  pantry: [],
  beliefKeys: [],
  eatingRhythm: [{ slot: "dinner" as const, size: null }],
  awayDays: [],
  cookingTimeMin: null,
  composition: null,
  fixedIntakes: [],
  dayProperties: [],
  merge: null,
  boxMemberIds: [],
};

function parse(raw: unknown, over: Record<string, unknown> = {}) {
  return parseGeneratedMeal(raw, {
    ...PARSE_ARGS,
    scope: "several_days" as const,
    daysToFill: ["wed", "thu"],
    ...over,
  });
}

Deno.test("⑤ un plat SANS jour, sur une fenêtre de plusieurs jours, est nommé et jeté", () => {
  // ⚠️ LE DÉFAUT MESURÉ: un plan portait 16 entrées `dishes` pour 3 jours, dont
  // SEPT sans `day` ni `slot` — les mêmes sept titres que `preparations`. Le
  // modèle avait rendu ses préparations une seconde fois, le budget relevé par
  // la fusion avait laissé la place, et `issues` ne disait rien. Ces sept-là
  // occupent le plafond, donc elles coûtent de VRAIS repas de fin de fenêtre.
  const meal = parse({
    dishes: [
      { day: "wed", slot: "dinner", title: "Poulet rôti" },
      { title: "Quinoa" },
      { slot: "dinner", title: "Riz cuit" },
      { day: "jeudi", slot: "dinner", title: "Jeton inconnu" },
    ],
  });
  assertEquals(meal.dishes.map((d) => d.title), ["Poulet rôti"]);
  assertEquals(
    meal.issues.filter((i) => i.includes("no day token")).length,
    3,
    "les trois plats sans jour utilisable doivent être nommés un par un",
  );
  // Le jeton INCONNU garde son propre motif: « il a écrit jeudi » et « il n'a
  // rien écrit » se réparent différemment.
  assert(meal.issues.some((i) => i.includes("unknown day token")));
});

Deno.test("⑤ LE CAS QUI PASSE — sur UN seul jour, un plat sans jour est gardé", () => {
  // ⚠️ SANS CETTE MOITIÉ, LA GARDE RETIRERAIT UN REPAS À QUELQU'UN pour une clé
  // absente d'un plan qui n'en a pas besoin: il n'y a qu'un jour, le plat est
  // situé sans ambiguïté, et `windowSplit` le range déjà dans la fenêtre.
  const meal = parse(
    { dishes: [{ slot: "dinner", title: "Poulet rôti" }] },
    { scope: "day", daysToFill: ["wed"] },
  );
  assertEquals(meal.dishes.map((d) => d.title), ["Poulet rôti"]);
  assertEquals(meal.issues.filter((i) => i.includes("no day token")).length, 0);
});

Deno.test("④ le parseur NOMME la case que le plat rejeté laisse vide", () => {
  // ⚠️ LE DÉFAUT, DE BOUT EN BOUT, SUR LE VERROU RÉEL. « whey protein 90 g »
  // est une cible chiffrée: le plat tombe ENTIER, et c'est juste. Ce qui
  // manquait est la ligne qui dit que jeudi soir n'a plus rien.
  const meal = parse({
    dishes: [
      { day: "wed", slot: "dinner", title: "Poulet rôti" },
      {
        day: "thu",
        slot: "dinner",
        title: "Bol protéiné",
        ingredients: [{ term: "whey protein", quantity: "90 g" }],
      },
    ],
  });
  assertEquals(meal.dishes.map((d) => d.title), ["Poulet rôti"]);
  assertEquals(meal.empty_slots, [{ day: "thu", slot: "dinner" }]);
  assert(
    meal.issues.some((i) => i === "empty_slots: thu/dinner"),
    `la case vide n'est pas nommée: ${JSON.stringify(meal.issues)}`,
  );
  // ⚠️ LE VERROU N'EST PAS AFFAIBLI, et c'est la moitié qui compte: le plat
  // reste rejeté, avec son motif.
  assert(meal.rejected_numeric.length > 0);
});

Deno.test("④ LE CAS QUI PASSE — un plan complet ne porte aucune case vide", () => {
  const meal = parse({
    dishes: [
      { day: "wed", slot: "dinner", title: "Poulet rôti" },
      { day: "thu", slot: "dinner", title: "Curry" },
    ],
  });
  assertEquals(meal.empty_slots, []);
  assertEquals(meal.issues.filter((i) => i.startsWith("empty_slots:")), []);
});

// ---------------------------------------------------------------------------
// ④ — LE TROU N'EST PAS HÉRITABLE: CE QUE LES DEUX BLOCS DISENT
// ---------------------------------------------------------------------------

const GAP_HEADER = "These moments have NO dish in the plan above:";

const MATERIAL = [{ day: "wed", slot: "dinner", title: "Curry de pois chiches" }];
const BASE = [{ day: "wed", slot: "dinner", title: "Gratin de courgettes" }];

Deno.test("④ la DÉFUSION dit le trou du plan de base plutôt que de le recopier", () => {
  // ⚠️ LE CHEMIN MESURÉ, ET C'EST LE PIRE PARCE QUE LA CONSIGNE MARCHE. « Reste
  // au plus près du plan de base » est la phrase la mieux honorée de tout ce
  // chantier — 14 titres identiques sur 14 — donc c'est aussi celle qui recopie
  // le mieux une case vide. Mesuré: deux plans du foyer consécutifs sans
  // petit-déjeuner mercredi.
  const block = buildUnmergeBlock({
    displayName: "Zoe",
    window: { startsOn: WED, durationDays: 2 },
    dishes: BASE,
    gaps: [{ day: "wed", slot: "breakfast" }],
  });
  assert(block.includes(GAP_HEADER), block);
  assert(block.includes("- wed breakfast"), block);
  assert(block.includes("That is a GAP, not a choice"), block);
  // ET EN DERNIER: la phrase qu'il corrige (« reste au plus près ») vient
  // d'être écrite, et sans cette précision le trou en fait partie.
  assert(
    block.indexOf("The base plan over these days:") < block.indexOf(GAP_HEADER),
    "le trou doit être dit APRÈS la liste qu'il corrige",
  );
});

Deno.test("④ LE CAS QUI PASSE — sans trou, les deux blocs sont ceux de v7", () => {
  // ⚠️ L'IDENTITÉ, ET C'EST CE QUI JUSTIFIE LA VERSION. `gaps: []` doit rendre
  // un bloc byte-identique à celui d'avant C2: sinon toute fusion et toute
  // défusion du produit changeraient de consigne pour un défaut qu'elles n'ont
  // pas — et on ferait fabriquer des plats sur des cases pleines.
  const unmerge = buildUnmergeBlock({
    displayName: "Zoe",
    window: { startsOn: WED, durationDays: 2 },
    dishes: BASE,
    gaps: [],
  });
  assert(!unmerge.includes(GAP_HEADER), unmerge);
  assert(!unmerge.includes("GAP"), unmerge);

  const merge = buildMergeBlock({
    displayName: "Zoe",
    window: { startsOn: WED, durationDays: 2 },
    shape: "one_session",
    dishes: MATERIAL,
    baseDishes: BASE,
    gaps: [],
  });
  assert(!merge.includes(GAP_HEADER), merge);
});

Deno.test("④ la FUSION dit aussi le trou de son ANCRE", () => {
  // L'ancre de C1 est le plan du foyer, et un plan du foyer peut porter le trou
  // — c'est même LÀ qu'il est né (les cinq petits-déjeuners tombés sur une
  // fusion). « Reste au plus près » y a la même conséquence.
  const block = buildMergeBlock({
    displayName: "Zoe",
    window: { startsOn: WED, durationDays: 2 },
    shape: "one_session",
    dishes: MATERIAL,
    baseDishes: BASE,
    gaps: [{ day: "wed", slot: "breakfast" }, { day: "thu", slot: "breakfast" }],
  });
  assert(block.includes(GAP_HEADER), block);
  assert(block.includes("- wed breakfast"), block);
  assert(block.includes("- thu breakfast"), block);
  // ⚠️ ET L'ANCRE DE C1 N'EST PAS DÉPLACÉE: elle reste avant sa liste, la
  // matière reste avant elle. Ce lot ajoute une troisième liste, il ne
  // rééquilibre rien — c'est un autre lot.
  assert(
    block.indexOf("was going to eat over these days, on their own:") <
      block.indexOf("THE HOUSEHOLD'S PLAN IS THE PLAN"),
    "l'ordre de C1 a bougé",
  );
  assert(
    block.indexOf("The household's plan over these days:") <
      block.indexOf(GAP_HEADER),
    "le trou doit venir après la liste qu'il corrige",
  );
});

// ===========================================================================
// LES TESTS DE POSITION — CE QUI SE DÉCIDE AVANT LE MODÈLE DOIT Y ÊTRE
//
// ⚠️ EN HTTP, UN REFUS TARDIF EST INDISCERNABLE D'UN REFUS PRÉCOCE: il est
// juste, et c'est ce qui le rend invisible. L1 a mesuré 28,6 s et 225 s
// brûlées exactement comme ça; C2 ② et ③ sont la même famille, 6,2 s et 16,1 s.
// ===========================================================================

async function edgeSource(fn: string): Promise<string> {
  return await Deno.readTextFile(
    new URL(`../../${fn}/index.ts`, import.meta.url),
  );
}

for (const fn of ["generate-meal-v1", "generate-household-meal-v1"]) {
  Deno.test(`② et ③ tombent AVANT le modèle, ARMÉES — ${fn}`, async () => {
    const src = await edgeSource(fn);
    const model = src.indexOf("generateWithGemini(");
    assert(model >= 0, "appel modèle introuvable — test à réviser");

    // ⚠️ LA POSITION NE SUFFIT PAS, ET UNE MUTATION L'A PROUVÉ. La première
    // rédaction de ce test cherchait `windowStartsBeyondDayTokens(` n'importe
    // où avant le modèle: `if (false && windowStartsBeyondDayTokens(…))`
    // laissait le marqueur exactement où il était, au bon rang, et le test
    // restait VERT sur une garde désarmée. On exige donc la FORME de la garde —
    // le prédicat en tête de son `if` — et pas seulement son nom quelque part.
    for (
      const [guard, token] of [
        // ② la fenêtre que les jetons ne savent pas nommer.
        [
          "if (windowStartsBeyondDayTokens(startsOn, todayDate)) {",
          '"window_beyond_this_week"',
        ],
        // ③ la règle d'écriture de la base, rejouée avant de la payer.
        ["if (blocking) {", '"plan_overlaps_existing"'],
      ] as const
    ) {
      const at = src.indexOf(guard);
      assert(
        at >= 0,
        `${fn}: la garde « ${guard} » a disparu ou a changé de forme. Si elle ` +
          `a été DÉSARMÉE (une condition ajoutée devant), c'est précisément ce ` +
          `que ce test existe pour attraper.`,
      );
      assert(
        at < model,
        `${fn}: « ${guard} » est APRÈS le premier appel modèle. Le refus reste ` +
          `juste, et c'est ce qui le rend invisible: il se paie désormais au ` +
          `prix d'une génération.`,
      );
      // Le refus NOMMÉ, dans le corps de cette garde-là — pas ailleurs dans le
      // fichier: un `if` qui ne rend rien est un `if` qui laisse passer.
      const body = src.slice(at, at + 1400);
      assert(
        body.includes(token) && body.includes("return jsonResponse("),
        `${fn}: la garde « ${guard} » ne rend plus ${token}.`,
      );
    }

    // Et le calcul qui l'alimente est bien AVANT lui.
    for (const marker of ["windowStartsBeyondDayTokens(", "firstBlockingPlan("]) {
      const at = src.indexOf(marker);
      assert(at >= 0 && at < model, `${fn}: ${marker} manque avant le modèle`);
    }
  });
}

Deno.test("③ la règle de la base n'est écrite qu'UNE fois, et c'est la fonction partagée", async () => {
  // ⚠️ CE QUE CE TEST GARDE N'EST PAS UN STYLE. `planOverlapVerdict` rejoue la
  // boucle de `write_student_meal_plan`; une seconde écriture de ses deux
  // conditions, dans un générateur, aurait divergé au premier ajustement de la
  // migration — et les deux réponses auraient été plausibles.
  await Promise.all(
    ["generate-meal-v1", "generate-household-meal-v1"].map(async (fn) => {
      const src = (await edgeSource(fn))
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      assert(
        !/starts_on\s*>=|startsOn\s*>=\s*\w+\.startsOn/.test(src),
        `${fn}: la première condition de la boucle de la RPC est réécrite ici.`,
      );
      assert(
        src.includes("firstBlockingPlan("),
        `${fn}: la règle partagée n'est plus appelée.`,
      );
    }),
  );
});

Deno.test("④ les trous CALCULÉS sont ceux qu'on passe aux deux blocs", async () => {
  // ⚠️ UNE MUTATION A EXIGÉ CE TEST, ET C'EST LE MODE D'ÉCHEC N°1 DE CE
  // CHANTIER: un module juste, testé, et jamais branché. Remplacer
  // `gaps: unmergeGaps` par `gaps: []` laissait TOUT vert — le module pur, ses
  // cas qui passent, les blocs — pendant que la défusion recopiait le trou
  // exactement comme avant.
  const src = (await edgeSource("generate-household-meal-v1"))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert(
    src.includes("emptySlotsIn("),
    "le générateur ne calcule plus les trous du plan montré.",
  );
  assert(
    /gaps:\s*mergeBaseGaps,/.test(src),
    "la FUSION ne reçoit plus les trous de son ancre: le plan du foyer troué " +
      "repart tel quel, et « reste au plus près » recopie la case vide.",
  );
  assert(
    /gaps:\s*unmergeGaps,/.test(src),
    "la DÉFUSION ne reçoit plus les trous du plan de base. C'est le chemin " +
      "MESURÉ: 14 titres recopiés sur 14, case vide comprise.",
  );
  // ET LE CAS QUI PASSE de l'autre côté: la grille comptée est celle du prompt,
  // pas une seconde définition. Un `fixedIntakes` qui divergerait de celui du
  // tronc réclamerait au modèle un repas que la consigne lui interdit.
  assert(
    src.includes("fixedIntakes: [],"),
    "la lane foyer ne passe plus la même grille au constat qu'au tronc.",
  );
});

// ===========================================================================
// C5 ④ — UN REFUS DE SAISIE N'EST PAS UN INCIDENT
//
// `jsonResponse` journalise TOUT statut >= 400 dans `system_error_logs`, au
// niveau `error`, sauf `skipErrorLog`. Les deux refus que C2 a posés ne
// l'avaient pas — contrairement au 402 du gel et au 429 du plafond, qui l'ont
// AVEC leur motif écrit (« un impayé n'est pas un incident »).
//
// MESURÉ EN UNE SEULE SESSION: 5 lignes `window_beyond_this_week` + 2 lignes
// `plan_overlaps_existing`, severity `error`. Or `plan_overlaps_existing` est
// atteignable « en trois clics » depuis `MealBuilder`: chaque élève qui choisit
// une fenêtre intérieure à son plan vivant produisait une ligne d'incident.
//
// ⚠️ LE CRITÈRE, ÉTROIT ET ÉCRIT: se tait un refus causé par LA SAISIE DE
// L'UTILISATEUR. Un refus causé par une PANNE parle toujours — c'est pourquoi
// la seconde moitié de ce test exige que les 502 du modèle, eux, restent
// bruyants. Un `skipErrorLog` posé partout ne serait plus un arbitrage, ce
// serait un journal éteint.
// ===========================================================================

for (const fn of ["generate-meal-v1", "generate-household-meal-v1"]) {
  Deno.test(`C5 ④ — les deux refus de fenêtre se taisent — ${fn}`, async () => {
    const src = (await edgeSource(fn))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    for (
      const [token, status] of [
        ['"window_beyond_this_week"', 400],
        ['"plan_overlaps_existing"', 409],
      ] as const
    ) {
      const at = src.indexOf(token);
      assert(at >= 0, `${fn}: ${token} a disparu — test à réviser`);
      // L'objet d'options de CE `jsonResponse`-là, pas un `skipErrorLog`
      // ailleurs dans le fichier: il ne prouverait rien sur ce refus.
      const tail = src.slice(at, at + 900);
      const opts = new RegExp(`\\{\\s*status:\\s*${status}[^}]*\\}`).exec(tail);
      assert(
        opts,
        `${fn}: ${token} ne rend plus ${status} dans les 900 caractères qui ` +
          `suivent son motif — test à réviser.`,
      );
      assert(
        /skipErrorLog:\s*true/.test(opts[0]),
        `${fn}: ${token} repart dans \`system_error_logs\` au niveau ` +
          `\`error\`. C'est une DATE CHOISIE PAR L'UTILISATEUR, pas une ` +
          `panne — et ce refus est majoritaire dans le journal où l'on ` +
          `cherche les vraies pannes.`,
      );
    }
  });

  Deno.test(`C5 ④ — LE CAS QUI PARLE: une panne du modèle reste un incident — ${fn}`, async () => {
    // ⚠️ SANS CETTE MOITIÉ, LE TEST CI-DESSUS SERAIT SATISFAIT PAR UN JOURNAL
    // ÉTEINT. Le critère n'est pas « moins de lignes », c'est « la saisie se
    // tait, la panne parle ».
    const src = (await edgeSource(fn))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    const at = src.indexOf('"model_returned_tool_call"');
    assert(at >= 0, `${fn}: le refus modèle a disparu — test à réviser`);
    const tail = src.slice(at, at + 400);
    assert(
      !/skipErrorLog/.test(tail),
      `${fn}: une panne du modèle a été mise au silence. Le critère de C5 ④ ` +
        `est « la saisie se tait, la panne parle » — pas « le journal se vide ».`,
    );
    // Et le 500 général non plus.
    const catchAt = src.lastIndexOf("status: 500");
    assert(catchAt >= 0, `${fn}: le 500 général a disparu — test à réviser`);
    assert(
      !/skipErrorLog/.test(src.slice(catchAt - 200, catchAt + 200)),
      `${fn}: le 500 général ne journalise plus.`,
    );
  });
}
