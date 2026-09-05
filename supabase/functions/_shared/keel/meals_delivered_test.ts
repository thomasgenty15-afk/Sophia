import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  mealsDelivered,
  restoreHeldOff,
  unfedRetryInstruction,
} from "./meals_delivered.ts";
import { memberMealCells } from "./household_presence.ts";
import type { EatingOccasion } from "./meal_generation.ts";

const CLAIRE = "m-claire";
const MARC = "m-marc";
const LEA = "m-lea";

const WED_DINNER = { day: "wed", slot: "dinner" } as const;
const THU_DINNER = { day: "thu", slot: "dinner" } as const;

type Dish = Parameters<typeof mealsDelivered>[0][number];

function dish(over: Partial<Dish> = {}): Dish {
  return {
    title: "Rice bowl",
    day: "wed",
    slot: "dinner",
    memberId: null,
    boxes: [{ id: "box_table", memberIds: [CLAIRE, MARC, LEA] }],
    heldOff: [],
    ...over,
  };
}

type Cell = { day: string; slot: string };

function mouths(ids: readonly string[], cells: readonly Cell[] = [WED_DINNER]) {
  return ids.map((memberId) => ({ memberId, cells: [...cells] }));
}

Deno.test("une boîte commune nourrit tout le monde", () => {
  const out = mealsDelivered([dish()], mouths([CLAIRE, MARC, LEA]));
  assertEquals(out.expected, 3);
  assertEquals(out.fed, 3);
  assertEquals(out.missing, 0);
  assertEquals(out.allFed, true);
  assertEquals(out.mouths.every((m) => m.missing.length === 0), true);
});

Deno.test("DEUX BOÎTES sur un plat: l'échange nourrit les deux groupes", () => {
  const out = mealsDelivered([
    dish({
      boxes: [
        { id: "box_table", memberIds: [CLAIRE, MARC] },
        { id: "box_lea", memberIds: [LEA] },
      ],
    }),
  ], mouths([CLAIRE, MARC, LEA]));
  assertEquals(out.allFed, true);
  assertEquals(out.fed, 3);
});

Deno.test("un plat SANS boîte nourrit tout le monde: rien n'a été pesé d'avance", () => {
  const out = mealsDelivered([dish({ boxes: [] })], mouths([CLAIRE, MARC]));
  assertEquals(out.allFed, true);
  assertEquals(out.expected, 2);
});

Deno.test("un plat DÉDIÉ nourrit son propriétaire, et lui seul", () => {
  const out = mealsDelivered([
    dish({ boxes: [{ id: "box_table", memberIds: [CLAIRE, MARC] }] }),
    dish({ title: "Salade de thon", memberId: LEA, boxes: [{ id: "box_lea", memberIds: [LEA] }] }),
  ], mouths([CLAIRE, MARC, LEA]));
  assertEquals(out.allFed, true);
  assertEquals(out.fed, 3);
});

Deno.test("⛔ RETIRÉE PAR SON RÉGIME: la cause est nommée, et la boîte aussi", () => {
  const out = mealsDelivered([
    dish({
      boxes: [{ id: "box_table", memberIds: [CLAIRE, MARC] }],
      heldOff: [{ memberId: LEA, cause: "regime", boxId: "box_table", via: "items", preparationId: null, matched: null }],
    }),
  ], mouths([CLAIRE, MARC, LEA]));

  assertEquals(out.missing, 1);
  assertEquals(out.allFed, false);
  assertEquals(out.byCause.held_off_regime, 1);
  const lea = out.mouths.find((m) => m.memberId === LEA);
  assertEquals(lea?.fed, 0);
  assertEquals(lea?.missing[0], {
    memberId: LEA,
    day: "wed",
    slot: "dinner",
    cause: "held_off_regime",
    boxId: "box_table",
    dish: "Rice bowl",
    via: "items",
    preparationId: null,
    matched: null,
  });
});

Deno.test("⛔ RETIRÉE PAR UN DÉGOÛT: autre cause, autre recours", () => {
  const out = mealsDelivered([
    dish({
      boxes: [{ id: "box_table", memberIds: [CLAIRE, LEA] }],
      heldOff: [{ memberId: MARC, cause: "exclusion", boxId: "box_table", via: "items", preparationId: null, matched: null }],
    }),
  ], mouths([CLAIRE, MARC, LEA]));

  assertEquals(out.byCause.held_off_exclusion, 1);
  assertEquals(out.byCause.held_off_regime, 0);
  assertEquals(out.mouths.find((m) => m.memberId === MARC)?.missing[0].boxId, "box_table");
});

Deno.test("⛔ LE RÉGIME PRIME sur le dégoût quand les deux ont mordu", () => {
  const out = mealsDelivered([
    dish({
      boxes: [{ id: "box_table", memberIds: [CLAIRE] }],
      heldOff: [
        { memberId: MARC, cause: "exclusion", boxId: "box_table", via: "items", preparationId: null, matched: null },
        { memberId: MARC, cause: "regime", boxId: "box_table", via: "items", preparationId: null, matched: null },
      ],
    }),
  ], mouths([CLAIRE, MARC]));
  assertEquals(out.byCause.held_off_regime, 1);
  assertEquals(out.byCause.held_off_exclusion, 0);
});

Deno.test("⛔ OUBLIÉE PAR LE MODÈLE: personne ne l'a retirée, elle n'est nulle part", () => {
  const out = mealsDelivered([
    dish({ boxes: [{ id: "box_table", memberIds: [CLAIRE, MARC] }] }),
  ], mouths([CLAIRE, MARC, LEA]));
  assertEquals(out.byCause.not_named, 1);
  assertEquals(out.mouths.find((m) => m.memberId === LEA)?.missing[0].boxId, null);
});

Deno.test("⛔ SUR DEUX BOÎTES d'un même repas: deux contenants pour une personne", () => {
  const out = mealsDelivered([
    dish({
      boxes: [
        { id: "box_a", memberIds: [CLAIRE, MARC] },
        { id: "box_b", memberIds: [MARC] },
      ],
    }),
  ], mouths([CLAIRE, MARC]));
  assertEquals(out.byCause.double, 1);
  assertEquals(out.allFed, false);
});

Deno.test("une case SANS aucun plat n'est pas un repas manqué: c'est un trou du plan", () => {
  const out = mealsDelivered([dish()], mouths([CLAIRE], [WED_DINNER, THU_DINNER]));
  assertEquals(out.expected, 1, "la case sans plat a été comptée comme attendue");
  assertEquals(out.missing, 0);
  assertEquals(out.cellsWithoutDish, 1);
  assertEquals(out.allFed, true);
});

Deno.test("une bouche ABSENTE à une case n'y est pas attendue", () => {
  const out = mealsDelivered(
    [dish(), dish({ day: "thu" })],
    [
      { memberId: CLAIRE, cells: [WED_DINNER, THU_DINNER] },
      { memberId: MARC, cells: [WED_DINNER] },
    ],
  );
  assertEquals(out.expected, 3);
  assertEquals(out.missing, 0);
});

Deno.test("un plat sans jour ou sans moment est compté à part, jamais nourrissant", () => {
  const out = mealsDelivered([
    dish({ day: null }),
    dish({ slot: null }),
  ], mouths([CLAIRE]));
  assertEquals(out.unplacedDishes, 2);
  assertEquals(out.cellsWithoutDish, 1);
  assertEquals(out.expected, 0);
});

Deno.test("PROPRIÉTÉ — attendu = nourri + manquant, sur chaque bouche et sur le total", () => {
  const out = mealsDelivered([
    dish({
      boxes: [{ id: "box_table", memberIds: [CLAIRE] }],
      heldOff: [{ memberId: LEA, cause: "regime", boxId: "box_table", via: "items", preparationId: null, matched: null }],
    }),
    dish({ day: "thu", boxes: [{ id: "box_thu", memberIds: [CLAIRE, LEA] }] }),
  ], mouths([CLAIRE, MARC, LEA], [WED_DINNER, THU_DINNER]));

  assertEquals(out.expected, out.fed + out.missing);
  for (const m of out.mouths) assertEquals(m.expected, m.fed + m.missing.length);
  assertEquals(
    Object.values(out.byCause).reduce((a, b) => a + b, 0),
    out.missing,
  );
});

Deno.test("LA RELANCE nomme la bouche, la case, le plat, la cause ET le remède", () => {
  const text = unfedRetryInstruction([
    { name: "Léa", memberId: LEA, day: "wed", slot: "dinner", cause: "held_off_regime", dish: "Rice bowl" },
  ]);
  assert(text !== null);
  assert(text.includes("Léa"), text);
  assert(text.includes(LEA), "l'id exact manque: le modèle ne peut pas écrire le couvercle");
  assert(text.includes("wed") && text.includes("dinner"), text);
  assert(text.includes("Rice bowl"), text);
  assert(text.includes("box of their OWN"), text);
  assert(text.includes("swapped"), text);
  assert(
    text.includes("do NOT shorten the plan"),
    "rien n'interdit de réparer en retirant des journées",
  );
});

Deno.test("⟳ LA RELANCE NOMME LE LIEN FAUTIF quand la boîte existe déjà", () => {
  // Le cas mesuré 60 fois sur 89: la boîte de tofu est là, ses items sont
  // propres, et un item cite `prep_chicken`. « Écris-lui une boîte » ferait
  // tout réécrire; on nomme la préparation et on interdit le reste.
  const text = unfedRetryInstruction([
    {
      name: "Léa", memberId: LEA, day: "wed", slot: "dinner", cause: "held_off_regime",
      dish: "Rice bowl", via: "preparation", preparationId: "prep_chicken", matched: "chicken",
    },
  ]);
  assert(text !== null);
  assert(text.includes('"prep_chicken"'), "la préparation fautive n'est pas nommée:\n" + text);
  assert(text.includes("preparation of its OWN"), text);
  assert(text.includes("keep their box and its items exactly as they are"), "rien n'interdit de réécrire la boîte qui existe:\n" + text);
  assert(text.includes('"chicken"'), "le terme mordu n'est pas dit:\n" + text);
  assert(!text.includes("write them a box of their OWN"), "on redemande une boîte qui existe déjà:\n" + text);
  // Et le remède générique reste celui des items qui mordent EUX-MÊMES.
  const items = unfedRetryInstruction([
    { name: "Léa", memberId: LEA, day: "wed", slot: "dinner", cause: "held_off_regime", dish: "Rice bowl", via: "items", preparationId: null, matched: "chicken" },
  ]);
  assert(items !== null && items.includes("box of their OWN"), items ?? "null");
});

Deno.test("⟳ LA RELANCE PARTIELLE ne demande QUE les cellules nommées, et seulement quand on le lui demande", () => {
  // Mesuré: 36 relances réelles à 10–12 k jetons et 85 s chacune pour changer
  // une ou deux cases. La fusion par parties sait prendre les seules cellules
  // réparées; la relance n'a plus à rendre le reste.
  const row = { name: "Léa", memberId: LEA, day: "wed", slot: "dinner", cause: "held_off_regime" as const, dish: "Rice bowl" };
  const whole = unfedRetryInstruction([row]);
  const partial = unfedRetryInstruction([row], { partial: true });
  assert(whole !== null && partial !== null);
  assert(!whole.includes("RETURN ONLY"), "sans option, la relance demande déjà un plan partiel");
  assert(partial.includes("RETURN ONLY THE MEALS NAMED ABOVE"), partial);
  assert(partial.includes('"dishes" holds ONLY the dishes of those day/slot cells'), partial);
  assert(partial.includes("FULL recipes"), "une préparation partielle sans recette serait une casserole vide");
  assert(partial.includes("cooked apart"), "la préparation à part ne survit pas au bloc partiel");
  assert(partial.includes("will be discarded"), partial);
  // Le bloc vient APRÈS les lignes par bouche: la consigne d'abord, le format ensuite.
  assert(partial.indexOf("Léa") < partial.indexOf("RETURN ONLY"), partial);
});

Deno.test("CÂBLAGE — la relance est PARTIELLE dans le générateur", async () => {
  const src = await generatorSource();
  const at = src.indexOf("const instruction = unfedRetryInstruction(");
  const call = src.slice(at, src.indexOf(");", at) + 2);
  assert(/\{ partial: true \}/.test(call), "la relance rend encore un plan entier: 85 s et 12 k jetons par tour\n" + call);
});

Deno.test("LA RELANCE dit un remède DIFFÉRENT par cause", () => {
  const named = unfedRetryInstruction([
    { name: "Léa", memberId: LEA, day: "wed", slot: "dinner", cause: "not_named", dish: "Rice bowl" },
  ]);
  const twice = unfedRetryInstruction([
    { name: "Marc", memberId: MARC, day: "wed", slot: "dinner", cause: "double", dish: "Rice bowl" },
  ]);
  assert(named !== null && twice !== null);
  assert(named.includes("exactly one box"), named);
  assert(twice.includes("ONE box only"), twice);
  assert(!named.includes("swapped"), "un oubli n'appelle pas un échange");
});

Deno.test("LA RELANCE ne dit rien quand il n'y a rien à dire", () => {
  assertEquals(unfedRetryInstruction([]), null);
});

Deno.test("LE DERNIER RECOURS remet la bouche sur SA boîte, et sur elle seule", () => {
  const dishes = [{
    boxes: [
      { id: "box_table", memberIds: [CLAIRE] },
      { id: "box_other", memberIds: [LEA] },
    ],
  }];
  const restored = restoreHeldOff(dishes, [{ memberId: MARC, boxId: "box_table" }]);
  assertEquals(restored, { restored: 1, fallback: 0, rows: ["restored"] });
  assertEquals(dishes[0].boxes[0].memberIds, [CLAIRE, MARC]);
  assertEquals(dishes[0].boxes[1].memberIds, [LEA], "une autre boîte a été touchée");
});

Deno.test("LE DERNIER RECOURS ne remet pas deux fois, et ne crée aucune boîte", () => {
  const dishes = [{ boxes: [{ id: "box_table", memberIds: [CLAIRE, MARC] }] }];
  assertEquals(restoreHeldOff(dishes, [{ memberId: MARC, boxId: "box_table" }]), { restored: 0, fallback: 0, rows: ["none"] });
  // Sans jour ni moment, une boîte absente ne se remplace pas: on ne devine pas la case.
  assertEquals(restoreHeldOff(dishes, [{ memberId: MARC, boxId: "box_absent" }]), { restored: 0, fallback: 0, rows: ["none"] });
  assertEquals(dishes[0].boxes.length, 1);
  assertEquals(dishes[0].boxes[0].memberIds, [CLAIRE, MARC]);
});

Deno.test("⟳ LE DERNIER RECOURS remplace une boîte JETÉE par la boîte de table du même plat, et le compte à part", () => {
  // Le cas réel: Zoé avait sa boîte, la ceinture l'a retirée, la boîte s'est
  // vidée et a été jetée. Le recours ne trouve plus `box_zoe`: il la remet sur
  // la boîte de table de ce plat, à cette case — jamais sur un plat dédié à
  // quelqu'un d'autre, jamais sur une autre case.
  const dishes = [
    { day: "sun", slot: "dinner", memberId: null, boxes: [{ id: "box_table", memberIds: [CLAIRE, MARC] }, { id: "box_lea", memberIds: [LEA] }] },
    { day: "sun", slot: "dinner", memberId: CLAIRE, boxes: [{ id: "box_claire_own", memberIds: [CLAIRE] }] },
    { day: "mon", slot: "lunch", memberId: null, boxes: [{ id: "box_mon", memberIds: [CLAIRE, MARC, LEA] }] },
  ];
  const out = restoreHeldOff(dishes, [{ memberId: "m-zoe", boxId: "box_zoe", day: "sun", slot: "dinner" }]);
  assertEquals(out, { restored: 0, fallback: 1, rows: ["fallback"] });
  assertEquals(dishes[0].boxes[0].memberIds, [CLAIRE, MARC, "m-zoe"], "pas sur la boîte de table la plus large");
  assertEquals(dishes[0].boxes[1].memberIds, [LEA]);
  assertEquals(dishes[1].boxes[0].memberIds, [CLAIRE], "un plat dédié à quelqu'un d'autre a été pris pour sa table");
  assertEquals(dishes[2].boxes[0].memberIds, [CLAIRE, MARC, LEA], "une autre case a été touchée");
  // Une bouche DÉJÀ nommée sur une boîte de cette case n'est pas doublée.
  const twice = restoreHeldOff(dishes, [{ memberId: "m-zoe", boxId: "box_zoe", day: "sun", slot: "dinner" }]);
  assertEquals(twice, { restored: 0, fallback: 0, rows: ["none"] });
  // Sans plat de table à cette case, rien — et c'est dit par le zéro.
  const none = restoreHeldOff(dishes, [{ memberId: "m-zoe", boxId: "box_zoe", day: "tue", slot: "dinner" }]);
  assertEquals(none, { restored: 0, fallback: 0, rows: ["none"] });
});

// ---------------------------------------------------------------------------
// LE CÂBLAGE — un module pur que personne n'appelle est un module mort
// ---------------------------------------------------------------------------

/**
 * ⛔ CE BLOC EXISTE PARCE QUE LES DIX-HUIT TESTS AU-DESSUS PASSERAIENT ENCORE
 * SI LE GÉNÉRATEUR N'APPELAIT JAMAIS CE MODULE.
 *
 * C'est la cicatrice la plus chère de ce dépôt: un moteur écrit, juste, testé,
 * et débranché. Le défaut que ce lot ferme en est lui-même un exemple — le
 * compteur « sans boîte » existait, il tournait, et il sautait justement les
 * cas qui comptaient.
 */
/**
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS, ET C'EST UNE CICATRICE DU DÉPÔT: un grep
 * naïf compte un appel cité dans un pavé d'explication comme un appel VIVANT.
 * Un module débranché dont le commentaire dit « appelé ici » passerait ces
 * gardes sans qu'une seule ligne ne tourne.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|\s)\/\/.*$/, "$1"))
    .join("\n");
}

async function generatorSource(): Promise<string> {
  return stripComments(
    await Deno.readTextFile(
      new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
    ),
  );
}

Deno.test("CÂBLAGE — la lane foyer APPELLE l'invariant, et avant d'écrire", async () => {
  const src = await generatorSource();

  // ⛔ TOUS LES APPELS, PAS LE PREMIER TROUVÉ. Le patron est celui de
  // `assertSpeaksForIsNeverEmpty`: un `mealsDelivered([])` compile, ne casse
  // rien, ne journalise rien, et rend « tout le monde est servi » sur un plan
  // qu'il n'a pas regardé. Chercher UNE occurrence valide laisserait passer
  // exactement ça, parce qu'un autre appel plus bas répondrait pour elle.
  const calls = [...src.matchAll(/mealsDelivered\(([^,]+),/g)].map((m) =>
    m[1].trim()
  );
  assert(calls.length >= 2, `${calls.length} appel(s) à l'invariant, 2 attendus`);
  for (const arg of calls) {
    assert(
      arg.startsWith("deliveredViewOf("),
      `un appel à l'invariant ne lit pas les plats du plan (\`${arg}\`)`,
    );
  }
  const call = src.indexOf("mealsDelivered(");

  // ⚠️ AVANT LA RATIONALE ET AVANT L'ARCHIVE. Un invariant posé après ce qui
  // lit le plan juge un plan que la suite modifie encore.
  const rationale = src.indexOf("explainPlanChoices(");
  assert(rationale > call, "l'invariant passe APRÈS la phrase servie à l'écran");
  const trace = src.indexOf("const boxTrace = {");
  assert(trace > call, "l'invariant passe APRÈS l'archive");
});

Deno.test("CÂBLAGE — le dénominateur est celui de la composition, pas un second", async () => {
  const src = await generatorSource();
  const block = src.slice(
    src.indexOf("const mouthCells = platedMembers.map"),
    src.indexOf("const deliveredViewOf"),
  );
  assert(block.length > 0, "le bloc des cases a disparu");
  assert(
    block.includes("away: m.away.effective"),
    "les cases ignorent les absences et les repas pris dehors: une bouche au " +
      "restaurant serait comptée comme sans repas",
  );
  assert(
    block.includes("windowDays: daysToFill"),
    "les cases ne suivent plus la fenêtre du plan",
  );
  // ── ⛔ LE RYTHME EST CELUI DE LA BOUCHE (2026-09-04) ────────────────────
  // Cette garde nommait DEUX de ses trois entrées, donc elle n'en gardait que
  // deux: le rythme pouvait redevenir l'union sans qu'une ligne bouge. C'est
  // exactement ce qui était arrivé — « une liste-garde nommée ne garde que ce
  // qu'elle nomme ».
  assert(
    block.includes("rhythm: m.eatingSlots ??"),
    "les cases reprennent le rythme de la MAISON: l'union attend chaque bouche " +
      "aux moments de toutes, donc un goûter déclaré par une seule rend la " +
      "table entière `not_named` — puis 422 `mouth_unfed`",
  );
  assert(
    !block.includes("ownMealSlots"),
    "les cases filtrent sur les HABITUDES: `ownMealSlots` dit à quelles cases " +
      "il faut cuisiner un plat à elle, jamais à quelles cases elle mange — la " +
      "garde s'éteindrait au lieu de se corriger, et resterait verte",
  );
});

Deno.test("⛔ LE CAS QUI MORD — une bouche n'est PAS attendue au goûter d'une autre", () => {
  // La forme mesurée en base le 2026-09-04: 13 foyers sur 52 portent au moins
  // une bouche dont le rythme n'est pas celui des autres.
  const window = ["mon", "tue"] as const;
  const rythme = (...slots: EatingOccasion[]) =>
    slots.map((slot) => ({ slot, size: null }));
  const troisRepas = rythme("breakfast", "lunch", "dinner");
  const avecGouter = rythme("breakfast", "lunch", "snack_pm", "dinner");

  const sansGouter = memberMealCells({
    away: [],
    rhythm: troisRepas,
    windowDays: [...window],
  });
  const gourmande = memberMealCells({
    away: [],
    rhythm: avecGouter,
    windowDays: [...window],
  });

  // ⚠️ LES DEUX DÉNOMINATEURS DIFFÈRENT, ET C'EST TOUT LE LOT. Si un jour ce
  // test devient `assertEquals`, c'est que l'union est revenue.
  assertEquals(sansGouter.length, 6);
  assertEquals(gourmande.length, 8);
  assert(
    !sansGouter.some((c) => c.slot === "snack_pm"),
    "une bouche qui mange trois fois est attendue au goûter d'une autre",
  );
});

Deno.test("CÂBLAGE — la relance remplace le TEXTE SOURCE en même temps que le plan", async () => {
  const src = await generatorSource();
  // ⛔ LA CICATRICE, ET ELLE EST RÉELLE: la relance d'exclusion faisait
  // `meal = retried` sans `mealSourceText = retryResult`, et `reconcilePortions`
  // relisait les parts de la réponse d'AVANT. Les deux vont ensemble.
  const block = src.slice(
    src.indexOf("unfed retry failed") - 3000,
    src.indexOf("unfed retry failed"),
  );
  assert(block.includes("meal = retried;"), "la relance n'adopte plus son plan");
  assert(
    block.includes("mealSourceText = retryResult;"),
    "la relance adopte le plan sans son texte source: les parts réconciliées " +
      "seront celles de la réponse d'avant",
  );
  assert(
    block.includes("retried.dishes.length >= meal.dishes.length"),
    "rien n'empêche la relance de « nourrir tout le monde » en retirant des jours",
  );
});

Deno.test("CÂBLAGE — le refus existe, et il ne tombe pas sur un aperçu", async () => {
  const src = await generatorSource();
  assert(
    src.includes('error: "mouth_unfed"'),
    "le refus a disparu: un plan où quelqu'un ne mange pas s'écrirait en base",
  );
  // ⟳ 2026-09-04 : la liste est résolue plus haut (`stillUnfedBeforeRefusal`),
  // parce que la classification de la note en dépend AUSSI — elle doit
  // survivre au refus.
  const block = src.slice(
    src.indexOf("const stillUnfedBeforeRefusal ="),
    src.indexOf('error: "mouth_unfed"') + 400,
  );
  assert(
    block.includes("!isDraft"),
    "le refus tombe aussi sur un aperçu: l'écran ne pourrait plus montrer le trou",
  );
});

Deno.test("CÂBLAGE — le dernier recours ne rend son repas QUE pour un dégoût", async () => {
  const src = await generatorSource();
  const block = src.slice(
    src.indexOf("const restorable ="),
    src.indexOf("const restorable =") + 700,
  );
  assert(block.includes('m.cause === "held_off_exclusion"'), block);
  assert(
    !block.includes('m.cause === "held_off_regime"'),
    "le recours rend son repas à quelqu'un en lui servant ce que son régime " +
      "interdit: ce n'est pas un recours, c'est le défaut d'origine",
  );
});

Deno.test("CÂBLAGE — le journal part AVANT tout refus", async () => {
  const src = await generatorSource();
  const log = src.indexOf('tag: "keel.household_meal.meals_delivered"');
  const refusal = src.indexOf('error: "mouth_unfed"');
  assert(log > 0 && refusal > 0, "le journal ou le refus a disparu");
  assert(
    log < refusal,
    "un refus qui sort sans avoir journalisé rend le défaut invisible au " +
      "moment précis où il compte le plus",
  );
});

Deno.test("CÂBLAGE — le compteur « sans boîte » ne saute plus les bouches retirées", async () => {
  const src = stripComments(
    await Deno.readTextFile(new URL("./meal_generation.ts", import.meta.url)),
  );
  assert(
    !/heldOff\.has\(memberId\)\) continue/.test(src),
    "la sortie est revenue: une bouche retirée redevient invisible au compteur, " +
      "et c'est très exactement le défaut du 2026-09-04",
  );
  assert(
    src.includes("boxMouthSlots += boxMembers.size;"),
    "le dénominateur se creuse encore de la part des bouches retirées",
  );
});

// ---------------------------------------------------------------------------
// ⟳ 2026-09-04 · CE QUE LA CAMPAGNE DE TROIS MOIS A TROUVÉ AU PREMIER TIR
// ---------------------------------------------------------------------------

Deno.test("CÂBLAGE — la relance INSISTE, et elle s'arrête quand elle n'améliore plus", async () => {
  const src = await generatorSource();
  // ── LE FAIT MESURÉ ────────────────────────────────────────────────────
  // Fenêtre de cinq jours, foyer de cinq bouches: `missing_before: 6` →
  // `missing: 5` après UNE relance, puis 422. Une relance réécrit le plan
  // ENTIER: elle répare des cases et en casse d'autres. Il faut insister sur
  // ce qui manque ENCORE.
  assert(
    /const UNFED_RETRIES_MAX = 3;/.test(src),
    "la relance ne fait plus ses trois tours: une relance partielle est bon marché, un refus non",
  );
  assert(
    /attempt <= UNFED_RETRIES_MAX && !delivered\.allFed/.test(src),
    "la boucle ne s'arrête plus dès que tout le monde est servi: elle " +
      "dépenserait un appel modèle pour rien",
  );
  // ⛔ ET LE PLAFOND N'EST PAS UNE GARANTIE DE PROGRÈS. Un tour qui n'améliore
  // rien doit couper la série, sinon on paie une minute pour la même réponse.
  const block = src.slice(
    src.indexOf("const UNFED_RETRIES_MAX"),
    src.indexOf("LE DERNIER RECOURS, ET IL DÉPEND DE LA CAUSE"),
  );
  // ⟳ 2026-09-05: `break;` en fin de ligne aussi — la fusion par parties a deux
  // sorties sur une ligne (`if (…) break;`). Quatre sorties désormais: rien à
  // fusionner, fusion qui n'améliore pas, exception, instruction vide.
  assertEquals(
    (block.match(/\bbreak;/g) || []).length >= 4,
    true,
    "la boucle n'a plus ses quatre sorties (rien à fusionner, fusion sans gain, " +
      "exception, instruction vide)\n" + block.slice(-400),
  );
  assert(/if \(merge\.cells\.length === 0\) break;/.test(block), "la sortie « rien à fusionner » a disparu");
  assert(/if \(!\(merged\.missing < delivered\.missing\)\) break;/.test(block), "la sortie « fusion sans gain » a disparu");
});

Deno.test("CÂBLAGE — CE QUE LA PERSONNE A ÉCRIT SURVIT AU REFUS", async () => {
  const src = await generatorSource();
  // ── LE DÉFAUT, ET IL ÉTAIT PIRE QUE LE PLAN REFUSÉ ────────────────────
  // Le refus sortait ~2800 lignes AVANT la classification de la note. Donc la
  // personne écrit « mon fils n'aime pas le poisson », le plan est refusé pour
  // une raison sans rapport, et sa phrase est perdue: pas de mémoire, pas de
  // notification, pas de question. Elle a parlé dans le vide.
  const refusal = src.indexOf('error: "mouth_unfed"');
  const rescue = src.indexOf("stillUnfedBeforeRefusal.length > 0 && !isDraft && draftNoteVerdict");
  assert(rescue > 0, "la note n'est plus classée sur le chemin du refus");
  assert(
    rescue < refusal,
    "la note est classée APRÈS le refus: le `return` part avant, et la phrase " +
      "de la personne est perdue",
  );

  // ⛔ `planFoods: []` SUR CE CHEMIN, ET C'EST LA DIFFÉRENCE QUI COMPTE.
  // Proposer les aliments d'un plan que la personne ne verra jamais serait lui
  // demander d'arbitrer sur du vide. La liste vide ferme les questions QUOI et
  // laisse passer les questions QUI.
  const block = src.slice(rescue, rescue + 1400);
  assert(
    /planFoods: \[\],/.test(block),
    "le chemin du refus propose les aliments d'un plan qui n'existe pas\n" + block,
  );
  assert(
    /source: "draft_note",/.test(block),
    "la source n'est plus déclarée sur le chemin du refus",
  );
});

Deno.test("CÂBLAGE — LA RELANCE COMPTE SES TENTATIVES, PAS SEULEMENT SES SUCCÈS", async () => {
  const src = await generatorSource();
  // ── LE DÉFAUT, MESURÉ SUR DEUX FOYERS INDÉPENDANTS (2026-09-04) ───────
  // `unfedRetried` n'était posé que dans la branche d'acceptation. Il rendait
  // donc `false` dans deux états opposés: « aucune relance tentée » et
  // « relance tentée, revenue, puis REJETÉE ». Un tir réel affichait
  // `{missing: 12, missing_before: 12, retried: false}` pendant que le journal
  // du modèle portait un `unfed_retry` bien parti.
  //
  // ⛔ CE QU'UN BOOLÉEN NE PEUT PAS DIRE est exactement l'état intéressant:
  // « j'ai essayé deux fois et j'ai tout rejeté ». Il distingue une relance
  // INUTILE d'une relance NON APPELÉE, et les deux demandent l'inverse l'un de
  // l'autre.
  assert(
    /unfedRetryAttempts \+= 1;/.test(src),
    "les tentatives de relance ne sont plus comptées: un booléen ne peut pas " +
      "distinguer « pas tentée » de « tentée puis rejetée »",
  );
  assert(
    /unfedRetryAccepted \+= 1;/.test(src),
    "les relances ACCEPTÉES ne sont plus comptées à part",
  );
  // ⛔ ET LA TENTATIVE SE COMPTE AVANT LE VERDICT. Posée dans la branche
  // d'acceptation, elle recréerait le défaut sous un autre nom.
  const attempt = src.indexOf("unfedRetryAttempts += 1;");
  const verdict = src.indexOf("after.missing < delivered.missing");
  assert(attempt > 0 && verdict > attempt, "la tentative est comptée après son verdict");
  // Les deux nombres sortent, dans le journal ET dans l'archive.
  assertEquals(
    (src.match(/retry_attempts: unfedRetryAttempts,/g) || []).length,
    2,
    "les tentatives ne sortent pas sur les deux surfaces (journal et archive)",
  );
  // ⛔ ET SUR QUELLE CAUSE. « La relance a échoué » ne dit pas quoi faire;
  // « elle échoue systématiquement sur les trous de RÉGIME » désigne le geste.
  assertEquals(
    (src.match(/retry_on: unfedRetryOn,/g) || []).length,
    2,
    "la cause sur laquelle la relance a été dépensée ne sort pas",
  );
  // ⟳ 2026-09-04 — ET LE REPLI SUR LA BOÎTE DE TABLE est compté à part, sur les deux surfaces.
  assertEquals((src.match(/restored_fallback: unfedRestoredFallback,/g) || []).length, 2, "le repli n'est pas compté sur le journal ET l'archive");
  assert(/boxId: m\.boxId, day: m\.day, slot: m\.slot/.test(src), "le recours ne reçoit plus la case: il ne peut plus remplacer une boîte jetée");
});

// ⟳ 2026-09-05 — R2-D. Une relance « Poulet, riz » rendue SANS boîtes faisait
// passer la végétarienne de manquante à nourrie: la ceinture par boîte n'avait
// rien à retirer, et la règle ③ nourrissait tout le monde.
Deno.test("⛔ UN PLAT SANS BOÎTE NE NOURRIT PAS LA BOUCHE DONT LA LIGNE LE MORD", () => {
  const chicken = dish({ title: "Poulet, riz", boxes: [], regimeBites: ["vegetarian"] });
  const table = [
    { memberId: CLAIRE, cells: [WED_DINNER], regime: null },
    { memberId: LEA, cells: [WED_DINNER], regime: "vegetarian" },
  ];
  const out = mealsDelivered([chicken], table);
  assertEquals(out.fed, 1, "Claire mange le poulet");
  assertEquals(out.missing, 1, "Léa devant un poulet sans boîte n'est pas nourrie");
  const lea = out.mouths.find((m) => m.memberId === LEA)!;
  assertEquals(lea.missing[0].cause, "held_off_regime");
  assertEquals(lea.missing[0].dish, "Poulet, riz");
  assertEquals(lea.missing[0].boxId, null);
  // Un second plat sans boîte que sa ligne ne mord pas la nourrit.
  const withRice = mealsDelivered([chicken, dish({ title: "Riz aux légumes", boxes: [], regimeBites: [] })], table);
  assertEquals(withRice.missing, 0);
  // Et sans `regimeBites` (lecteur ancien), la règle d'hier: tout le monde.
  assertEquals(mealsDelivered([dish({ boxes: [] })], table).missing, 0);
});
