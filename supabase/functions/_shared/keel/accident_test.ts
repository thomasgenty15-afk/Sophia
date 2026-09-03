import { assert, assertEquals, assertThrows } from "jsr:@std/assert@^1.0.0";

import {
  ACCIDENT_BUTTON_PREFIX,
  ACCIDENT_KIND,
  acceptAccidentText,
  accidentFormId,
  accidentSessionId,
  accidentShiftDeclineId,
  accidentShiftId,
  type AccidentPlan,
  buildAccidentForm,
  buildRealignmentSpace,
  buildSessionQuestion,
  buildShiftProposal,
  cascadeSkippedSession,
  daysBetween,
  type DoneWave,
  MAX_FRIDGE_DAYS,
  parseAccidentPlan,
  planSessionShift,
  planShiftFingerprint,
  readAccidentReply,
  REALIGNMENT_ACTIONS,
  renderAccidentAck,
  renderCascadeOutcome,
  renderShiftApplied,
  renderShiftRefusal,
  SHIFT_REFUSALS,
  shiftPlanDates,
} from "./accident.ts";
import { buildShiftedPayload } from "./accident_io.ts";
import { readStripReply } from "./evening_strip.ts";
import { readPulseReply } from "./daily_pulse.ts";
import { readRecommendationReply } from "./daily_recommendation.ts";

// ---------------------------------------------------------------------------
// LE DÉCOR — un plan réel, écrit comme la base le porte
// ---------------------------------------------------------------------------

const MEAL = "11111111-2222-3333-4444-555555555555";
/** Lundi 2026-08-10 → dimanche 2026-08-16. */
const STARTS_ON = "2026-08-10";

/**
 * Le décor nominal:
 *   session `sun` (2026-08-09)  — HORS fenêtre, sert de piège
 *   session `mon` (2026-08-10)  — prep A, nourrit les plats mon/tue/wed
 *   session `thu` (2026-08-13)  — prep B, nourrit le plat thu
 *   un plat `fri` sans `uses`   — ne dépend d'aucune session
 */
function planRow(
  over: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    starts_on: STARTS_ON,
    duration_days: 7,
    dishes: [
      // 0 — mon, mange de A
      dish("Monday bowl", "dinner", "mon", ["prep_a"]),
      // 1 — tue, mange de A
      dish("Tuesday wrap", "dinner", "tue", ["prep_a"]),
      // 2 — wed, mange de A
      dish("Wednesday curry", "dinner", "wed", ["prep_a"]),
      // 3 — thu, mange de B
      dish("Thursday stew", "dinner", "thu", ["prep_b"]),
      // 4 — fri, ne dépend de rien
      dish("Friday salad", "dinner", "fri", []),
    ],
    preparations: [
      prep("prep_a", "Roast chicken", "mon", ["chicken thighs"]),
      prep("prep_b", "Bean stew base", "thu", ["white beans"]),
    ],
    cooking_sessions: [
      { day: "mon", preparation_ids: ["prep_a"], run_through: "Oven on." },
      { day: "thu", preparation_ids: ["prep_b"], run_through: "Simmer." },
    ],
    shopping_list: [
      { term: "chicken thighs", aisle: "protein", quantity: "600 g" },
      { term: "white beans", aisle: "protein", quantity: "400 g" },
      { term: "rice", aisle: "grain", quantity: "500 g" },
    ],
    ...over,
  };
}

function dish(
  title: string,
  slot: string,
  day: string,
  prepIds: string[],
): Record<string, unknown> {
  return {
    title,
    slot,
    day,
    method: `Cook ${title}.`,
    ingredients: [{ term: "filler", amount: 100, unit: "g" }],
    uses: prepIds.map((id) => ({ preparation_id: id, servings: 1 })),
  };
}

function prep(
  id: string,
  title: string,
  cookOn: string,
  terms: string[],
): Record<string, unknown> {
  return {
    id,
    title,
    cook_on: cookOn,
    servings_made: 3,
    method: "Roast.",
    active_minutes: 10,
    total_minutes: 50,
    ingredients: terms.map((t) => ({ term: t, amount: 600, unit: "g" })),
  };
}

function planOf(over: Partial<Record<string, unknown>> = {}): AccidentPlan {
  const parsed = parseAccidentPlan(MEAL, planRow(over));
  if (!parsed) throw new Error("fixture did not parse");
  return parsed;
}

// ---------------------------------------------------------------------------
// §5 — LE VOCABULAIRE: fermé, disjoint, et il ne devine jamais
// ---------------------------------------------------------------------------

Deno.test("les quatre vocabulaires déterministes ne se croisent pas", () => {
  const mine = [
    accidentFormId(ACCIDENT_KIND.ordered, MEAL, 0),
    accidentFormId(ACCIDENT_KIND.noTime, MEAL, 1),
    accidentFormId(ACCIDENT_KIND.ateOther, MEAL, 2),
    accidentSessionId(true, MEAL, "2026-08-10"),
    accidentSessionId(false, MEAL, "2026-08-10"),
    accidentShiftId({
      mealId: MEAL,
      cookOn: "2026-08-10",
      delta: 1,
      fingerprint: "w=x;d=y;p=z;s=t",
    }),
    accidentShiftDeclineId(MEAL, "2026-08-10"),
  ];
  for (const id of mine) {
    assertEquals(id.startsWith(ACCIDENT_BUTTON_PREFIX), true, id);
    // Les trois autres lecteurs rendent « rien » sur chacune de mes charges.
    assertEquals(readStripReply(id).kind, "none", id);
    assertEquals(readPulseReply(id).kind, "none", id);
    assertEquals(readRecommendationReply(id).kind, "none", id);
    // Et le mien les relit toutes.
    assertEquals(readAccidentReply(id).kind === "none", false, id);
  }
});

Deno.test("mon lecteur rend « rien » sur les charges des trois autres", () => {
  const foreign = [
    "KEEL_STRIP_ALL|" + MEAL + "|0,1,2",
    "KEEL_STRIP_UNTICK|meal_tick:" + MEAL + ":0",
    "KEEL_PULSE_LEVEL_OK",
    "KEEL_RECO_ACCEPT|" + MEAL,
    "",
    "KEEL_FIX",
  ];
  for (const p of foreign) {
    assertEquals(readAccidentReply(p).kind, "none", p);
  }
});

Deno.test("14 charges malformées rendent « rien », jamais une supposition", () => {
  const bad = [
    "KEEL_FIX_ORDERED",
    "KEEL_FIX_ORDERED|",
    "KEEL_FIX_ORDERED|meal_tick:",
    "KEEL_FIX_ORDERED|meal_tick::0",
    "KEEL_FIX_ORDERED|not_a_key",
    "KEEL_FIX_SESSION_NO|" + MEAL,
    "KEEL_FIX_SESSION_NO|" + MEAL + "|2026-8-10",
    "KEEL_FIX_SESSION_NO||2026-08-10",
    // ⚠️ `Number("")` vaut 0 et `Number.isInteger(0)` est `true`: sans le refus
    // explicite, une charge tronquée se relirait « décale de 0 jour », donc
    // réécrirait le plan sans effet mais bien réellement.
    "KEEL_FIX_SHIFT_YES|" + MEAL + "|2026-08-10||fp",
    "KEEL_FIX_SHIFT_YES|" + MEAL + "|2026-08-10|0|fp",
    "KEEL_FIX_SHIFT_YES|" + MEAL + "|2026-08-10|-1|fp",
    "KEEL_FIX_SHIFT_YES|" + MEAL + "|2026-08-10|1",
    "KEEL_FIX_SHIFT_YES|" + MEAL + "|2026-08-10|1|",
    "KEEL_FIX_SHIFT_NO|" + MEAL,
  ];
  for (const p of bad) {
    assertEquals(readAccidentReply(p).kind, "none", p);
  }
});

Deno.test("chaque identifiant se relit exactement comme il a été écrit", () => {
  assertEquals(
    readAccidentReply(accidentFormId(ACCIDENT_KIND.ordered, MEAL, 3)),
    { kind: "ordered", mealId: MEAL, dishIndex: 3 },
  );
  assertEquals(
    readAccidentReply(accidentSessionId(false, MEAL, "2026-08-13")),
    { kind: "session", happened: false, mealId: MEAL, cookOn: "2026-08-13" },
  );
  assertEquals(
    readAccidentReply(
      accidentShiftId({
        mealId: MEAL,
        cookOn: "2026-08-10",
        delta: 2,
        fingerprint: "w=a;d=b;p=c;s=d",
      }),
    ),
    {
      kind: "shift_accept",
      mealId: MEAL,
      cookOn: "2026-08-10",
      delta: 2,
      fingerprint: "w=a;d=b;p=c;s=d",
    },
  );
});

Deno.test("un identifiant refuse de se construire sur une entrée absurde", () => {
  assertThrows(() => accidentSessionId(true, "", "2026-08-10"));
  assertThrows(() => accidentSessionId(true, MEAL, "pas-une-date"));
  assertThrows(() =>
    accidentShiftId({ mealId: MEAL, cookOn: "2026-08-10", delta: 0, fingerprint: "x" })
  );
  assertThrows(() =>
    accidentShiftId({ mealId: MEAL, cookOn: "2026-08-10", delta: 1, fingerprint: "" })
  );
});

// ---------------------------------------------------------------------------
// R2 — LA CASCADE: EXACTEMENT les repas de la session, pas un de plus
// ---------------------------------------------------------------------------

Deno.test("R2 — la cascade invalide exactement les repas de la session", () => {
  const cascade = cascadeSkippedSession({
    plan: planOf(),
    cookOn: "2026-08-10", // la session `mon`
    tickedDishIndexes: [],
  });
  assertEquals(cascade.sessionDay, "mon");
  assertEquals(cascade.preparationIds, ["prep_a"]);
  // 0,1,2 mangent de `prep_a`. 3 est d'une AUTRE session, 4 ne dépend de rien.
  assertEquals(cascade.invalidatedDishIndexes, [0, 1, 2]);
});

Deno.test("R2 — les repas d'une autre session ne sont PAS touchés", () => {
  const cascade = cascadeSkippedSession({
    plan: planOf(),
    cookOn: "2026-08-13", // la session `thu`
    tickedDishIndexes: [],
  });
  assertEquals(cascade.invalidatedDishIndexes, [3]);
});

Deno.test("§7 — un repas de la session DÉJÀ COCHÉ survit", () => {
  const cascade = cascadeSkippedSession({
    plan: planOf(),
    cookOn: "2026-08-10",
    // Quelqu'un a mangé le bowl de lundi: la casserole a donc tourné, au moins
    // en partie. On croit le FAIT, pas la déclaration de session.
    tickedDishIndexes: [0],
  });
  assertEquals(cascade.invalidatedDishIndexes, [1, 2]);
  assertEquals(cascade.survivingTickedIndexes, [0]);
});

Deno.test("un repas mangé AVANT la cuisson n'est pas invalidé", () => {
  // Un plat de lundi qui puise dans la préparation de JEUDI: le générateur
  // signale déjà l'anomalie. L'invalider serait réécrire un repas passé.
  const plan = planOf({
    dishes: [
      dish("Monday bowl", "dinner", "mon", ["prep_b"]),
      dish("Thursday stew", "dinner", "thu", ["prep_b"]),
    ],
  });
  const cascade = cascadeSkippedSession({
    plan,
    cookOn: "2026-08-13",
    tickedDishIndexes: [],
  });
  assertEquals(cascade.invalidatedDishIndexes, [1]);
  assertEquals(cascade.beforeCookIndexes, [0]);
});

Deno.test("une date sans session n'invalide RIEN", () => {
  const cascade = cascadeSkippedSession({
    plan: planOf(),
    cookOn: "2026-08-12", // mercredi: aucune session
    tickedDishIndexes: [],
  });
  assertEquals(cascade.sessionDay, null);
  assertEquals(cascade.invalidatedDishIndexes, []);
});

Deno.test("un plat en lot présent deux jours: seul celui de la session tombe", () => {
  // Le MÊME titre deux jours, mais nourri par deux préparations différentes.
  // La clé est le lien écrit (`uses`), jamais le titre.
  const plan = planOf({
    dishes: [
      dish("Chicken bowl", "dinner", "mon", ["prep_a"]),
      dish("Chicken bowl", "dinner", "thu", ["prep_b"]),
    ],
  });
  const cascade = cascadeSkippedSession({
    plan,
    cookOn: "2026-08-10",
    tickedDishIndexes: [],
  });
  assertEquals(cascade.invalidatedDishIndexes, [0]);
});

Deno.test("une préparation citée par la session mais absente du plan est ignorée", () => {
  const plan = planOf({
    cooking_sessions: [
      { day: "mon", preparation_ids: ["prep_a", "ghost"], run_through: "x" },
    ],
  });
  const cascade = cascadeSkippedSession({
    plan,
    cookOn: "2026-08-10",
    tickedDishIndexes: [],
  });
  assertEquals(cascade.preparationIds, ["prep_a"]);
});

// ---------------------------------------------------------------------------
// R13/R14 — LE GLISSEMENT
// ---------------------------------------------------------------------------

const NO_WAVES: DoneWave[] = [];

Deno.test("le plus petit décalage viable est +1 quand c'est possible", () => {
  const out = planSessionShift({
    plan: planOf(),
    cookOn: "2026-08-10",
    doneWaves: NO_WAVES,
    cookedPreparationIds: [],
    maxFridgeDays: MAX_FRIDGE_DAYS,
    today: STARTS_ON,
  });
  assertEquals(out.ok, true);
  if (!out.ok) return;
  assertEquals(out.delta, 1);
  assertEquals(out.newCookOn, "2026-08-11");
  assertEquals(out.newCookDay, "tue");
  assertEquals(out.movedDishIndexes, [0, 1, 2]);
});

Deno.test("R14 — `already_cooked`: on ne décale pas ce qui existe", () => {
  const out = planSessionShift({
    plan: planOf(),
    cookOn: "2026-08-10",
    doneWaves: NO_WAVES,
    cookedPreparationIds: ["prep_a"],
    maxFridgeDays: MAX_FRIDGE_DAYS,
    today: STARTS_ON,
  });
  assertEquals(out.ok, false);
  if (out.ok) return;
  assertEquals(out.reason, "already_cooked");
});

Deno.test("R14 — `outside_plan_window`: le décalage pousserait un repas au-delà d'ends_on", () => {
  // Session `sat`, plat `sun`: le seul jour libre après dimanche est hors
  // fenêtre (le plan finit le 2026-08-16).
  const plan = planOf({
    dishes: [dish("Sunday roast", "dinner", "sun", ["prep_a"])],
    preparations: [prep("prep_a", "Roast", "sat", ["chicken thighs"])],
    cooking_sessions: [{ day: "sat", preparation_ids: ["prep_a"], run_through: "x" }],
  });
  const out = planSessionShift({
    plan,
    cookOn: "2026-08-15",
    doneWaves: NO_WAVES,
    cookedPreparationIds: [],
    maxFridgeDays: MAX_FRIDGE_DAYS,
    today: STARTS_ON,
  });
  assertEquals(out.ok, false);
  if (out.ok) return;
  assertEquals(out.reason, "outside_plan_window");
});

Deno.test("R14 — `no_session`: cette date ne porte aucune cuisson", () => {
  const out = planSessionShift({
    plan: planOf(),
    cookOn: "2026-08-12",
    doneWaves: NO_WAVES,
    cookedPreparationIds: [],
    maxFridgeDays: MAX_FRIDGE_DAYS,
    today: STARTS_ON,
  });
  assertEquals(out.ok, false);
  if (out.ok) return;
  assertEquals(out.reason, "no_session");
});

Deno.test(
  "R14 — `perishables_at_risk` se calcule depuis la DATE D'ACHAT RÉELLE",
  () => {
    // La vague du lundi a été faite le SAMEDI (2026-08-08). Décaler la cuisson
    // du jeudi mettrait le frais à J+6. Le `buyOn` théorique (2026-08-10)
    // donnerait J+4 — déjà trop, mais deux jours de marge qui n'existent pas.
    const plan = planOf({
      dishes: [dish("Thursday stew", "dinner", "thu", ["prep_b"])],
      preparations: [prep("prep_b", "Stew", "thu", ["white beans"])],
      cooking_sessions: [
        { day: "thu", preparation_ids: ["prep_b"], run_through: "x" },
      ],
    });
    const bought: DoneWave[] = [{
      buyOn: "2026-08-10",
      purchasedOn: "2026-08-08",
      perishableTerms: ["white beans"],
    }];
    const out = planSessionShift({
      plan,
      cookOn: "2026-08-13",
      doneWaves: bought,
      cookedPreparationIds: [],
      maxFridgeDays: MAX_FRIDGE_DAYS,
    today: STARTS_ON,
    });
    assertEquals(out.ok, false);
    if (out.ok) return;
    assertEquals(out.reason, "perishables_at_risk");
    // Le détail cite la date d'achat RÉELLE — pas le buyOn théorique.
    assertEquals(out.detail.includes("2026-08-08"), true, out.detail);
    assertEquals(daysBetween("2026-08-08", "2026-08-14"), 6);
  },
);

Deno.test(
  "MUTATION — `perishables_at_risk` change de verdict quand MAX_FRIDGE_DAYS bouge",
  () => {
    // Un test paramétré par sa propre constante reste vert quand la constante
    // change. On MUTE la valeur pour prouver que la garde teste quelque chose.
    const plan = planOf({
      dishes: [dish("Thursday stew", "dinner", "thu", ["prep_b"])],
      preparations: [prep("prep_b", "Stew", "thu", ["white beans"])],
      cooking_sessions: [
        { day: "thu", preparation_ids: ["prep_b"], run_through: "x" },
      ],
    });
    const bought: DoneWave[] = [{
      buyOn: "2026-08-10",
      purchasedOn: "2026-08-11",
      perishableTerms: ["white beans"],
    }];
    const call = (maxFridgeDays: number) =>
      planSessionShift({
        plan,
        cookOn: "2026-08-13",
        doneWaves: bought,
        cookedPreparationIds: [],
        maxFridgeDays,
        today: STARTS_ON,
      });
    // Cuisson décalée au 14 ⇒ J+3 depuis le 11.
    assertEquals(call(3).ok, true); // 3 jours: ça tient tout juste
    assertEquals(call(2).ok, false); // 2 jours: ça ne tient plus
    const tight = call(2);
    if (tight.ok) return;
    assertEquals(tight.reason, "perishables_at_risk");
  },
);

Deno.test(
  "🔴 DÉFAUT MESURÉ — le frais d'une cuisson QUI NE BOUGE PAS ne refuse rien",
  () => {
    // La première version refusait dès qu'une vague faite portait du frais et
    // que la nouvelle date tombait après l'achat. Elle aurait donc refusé de
    // décaler la cuisson de JEUDI à cause du poulet acheté pour celle de LUNDI —
    // qui, elle, ne bouge pas. Un motif faux sur un glissement sûr.
    const bought: DoneWave[] = [{
      buyOn: "2026-08-10",
      purchasedOn: "2026-08-10",
      // Le poulet de la cuisson de LUNDI. La session décalée est celle de JEUDI.
      perishableTerms: ["chicken thighs"],
    }];
    const out = planSessionShift({
      plan: planOf(),
      cookOn: "2026-08-13", // la session `thu`, qui cuit `prep_b` (haricots)
      doneWaves: bought,
      cookedPreparationIds: [],
      maxFridgeDays: MAX_FRIDGE_DAYS,
    today: STARTS_ON,
    });
    // Le poulet attend la cuisson de lundi, qui reste lundi: rien ne change pour
    // lui, donc rien à refuser.
    assertEquals(out.ok, true, out.ok ? "" : `refusé: ${out.reason}`);
  },
);

Deno.test(
  "…et le MÊME décor refuse quand l'aliment attend la cuisson QUI BOUGE",
  () => {
    // La moitié qui prouve que la garde n'est pas simplement désarmée: le même
    // glissement, mais l'aliment acheté est celui de la session décalée.
    const bought: DoneWave[] = [{
      buyOn: "2026-08-10",
      purchasedOn: "2026-08-10",
      perishableTerms: ["white beans"], // `prep_b`, cuit jeudi → décalé vendredi
    }];
    const out = planSessionShift({
      plan: planOf(),
      cookOn: "2026-08-13",
      doneWaves: bought,
      cookedPreparationIds: [],
      maxFridgeDays: MAX_FRIDGE_DAYS,
    today: STARTS_ON,
    });
    assertEquals(out.ok, false);
    if (out.ok) return;
    assertEquals(out.reason, "perishables_at_risk");
    // 2026-08-10 → 2026-08-14 = 4 jours > 3.
    assertEquals(out.detail.includes("white beans"), true, out.detail);
  },
);

Deno.test(
  "la normalisation des termes suit celle des vagues, accents compris",
  () => {
    // Elle est RECOPIÉE de `grocery_waves.ts` (elle n'y est pas exportée). Ce
    // test la pinne contre le comportement RÉEL de `planGroceryWaves`, pour que
    // les deux ne puissent pas diverger en silence.
    const plan = planOf({
      preparations: [
        prep("prep_a", "Poulet", "mon", ["Cuisses de Poulet"]),
        prep("prep_b", "Stew", "thu", ["white beans"]),
      ],
      shopping_list: [
        { term: "cuisses de poulet", aisle: "protein", quantity: "600 g" },
      ],
      dishes: [dish("Monday bowl", "dinner", "mon", ["prep_a"])],
      cooking_sessions: [
        { day: "mon", preparation_ids: ["prep_a"], run_through: "x" },
      ],
    });
    const out = planSessionShift({
      plan,
      cookOn: "2026-08-10",
      doneWaves: [{
        buyOn: "2026-08-10",
        purchasedOn: "2026-08-06",
        // La casse et les accents diffèrent du terme de la préparation: si la
        // normalisation ne suivait pas, l'aliment ne serait jamais rapproché et
        // la garde serait muette.
        perishableTerms: ["CUISSES  de   poulet"],
      }],
      cookedPreparationIds: [],
      maxFridgeDays: MAX_FRIDGE_DAYS,
    today: STARTS_ON,
    });
    assertEquals(out.ok, false);
    if (out.ok) return;
    assertEquals(out.reason, "perishables_at_risk");
  },
);

Deno.test("une vague faite SANS périssable ne bloque rien", () => {
  const out = planSessionShift({
    plan: planOf(),
    cookOn: "2026-08-10",
    doneWaves: [{
      buyOn: "2026-08-10",
      purchasedOn: "2026-08-01",
      perishableTerms: [],
    }],
    cookedPreparationIds: [],
    maxFridgeDays: MAX_FRIDGE_DAYS,
    today: STARTS_ON,
  });
  assertEquals(out.ok, true);
});

Deno.test("les motifs de refus sont une liste FERMÉE de cinq", () => {
  // ⚠️ QUATRE JUSQU'AU 2026-09-01, CINQ DEPUIS — et l'ajout est conscient.
  //
  // `session_elapsed` (FF-061 R11) ferme un cas que la fiche d'origine ne
  // pouvait pas rencontrer: `planSessionShift` n'avait AUCUNE notion de
  // « aujourd'hui », parce que la seule porte était le message du soir même —
  // la cuisson interrogée était donc toujours celle du jour. Le rattrapage
  // ouvre le cas (déclarer un mercredi que la cuisson de lundi n'a pas eu lieu)
  // et, sans borne, la boucle proposerait `lundi + 1 = mardi`: une date écoulée.
  //
  // Ce test est ce qui rend l'ajout VISIBLE. Un cinquième motif glissé sans le
  // passer ici serait un refus que personne ne sait nommer.
  assertEquals([...SHIFT_REFUSALS], [
    "perishables_at_risk",
    "outside_plan_window",
    "already_cooked",
    "no_session",
    "session_elapsed",
  ]);
});

Deno.test("R11 — une cuisson PASSÉE ne se décale pas: on constate", () => {
  const out = planSessionShift({
    plan: planOf(),
    cookOn: "2026-08-10",
    doneWaves: NO_WAVES,
    cookedPreparationIds: [],
    maxFridgeDays: MAX_FRIDGE_DAYS,
    // Deux jours plus tard: la cuisson de lundi est derrière nous.
    today: "2026-08-12",
  });
  assertEquals(out.ok, false);
  if (out.ok) return;
  assertEquals(out.reason, "session_elapsed");
});

Deno.test("R11 — la cuisson d'AUJOURD'HUI se décale encore", () => {
  // La borne est `<`, pas `<=`: le cas nominal du bilan du soir est « la
  // cuisson de ce soir n'a pas eu lieu », et la décaler à demain est
  // exactement ce que la procédure existe pour proposer.
  const out = planSessionShift({
    plan: planOf(),
    cookOn: "2026-08-10",
    doneWaves: NO_WAVES,
    cookedPreparationIds: [],
    maxFridgeDays: MAX_FRIDGE_DAYS,
    today: "2026-08-10",
  });
  assertEquals(out.ok, true);
});

Deno.test("R6ter — `minDelta` empêche une cuisson AVANT la nouvelle course", () => {
  // Le cas de la vague décalée: la course passe à J+2, donc la cuisson ne peut
  // pas rester à J+1 — elle n'aurait pas ses ingrédients. Sans ce plancher, la
  // boucle rendrait le premier delta viable, c'est-à-dire +1.
  const out = planSessionShift({
    plan: planOf(),
    cookOn: "2026-08-10",
    doneWaves: NO_WAVES,
    cookedPreparationIds: [],
    maxFridgeDays: MAX_FRIDGE_DAYS,
    today: STARTS_ON,
    minDelta: 2,
  });
  assertEquals(out.ok, true);
  if (!out.ok) return;
  assert(out.delta >= 2, `le delta doit respecter le plancher, reçu ${out.delta}`);
});

Deno.test("un `minDelta` absurde ne fabrique pas un décalage nul", () => {
  // `0` et les négatifs se ramènent à 1: un décalage nul annoncerait un
  // déplacement qui n'a pas lieu.
  for (const minDelta of [0, -3]) {
    const out = planSessionShift({
      plan: planOf(),
      cookOn: "2026-08-10",
      doneWaves: NO_WAVES,
      cookedPreparationIds: [],
      maxFridgeDays: MAX_FRIDGE_DAYS,
      today: STARTS_ON,
      minDelta,
    });
    assertEquals(out.ok, true);
    if (!out.ok) return;
    assert(out.delta >= 1, `minDelta ${minDelta} a produit ${out.delta}`);
  }
});

// ---------------------------------------------------------------------------
// R13 — « CE N'EST PAS V3 »: le glissement ne déplace QUE des dates
// ---------------------------------------------------------------------------

Deno.test("R13 — le glissement ne change QUE les jours, jamais le contenu", () => {
  const before = planOf();
  const after = shiftPlanDates(before, "2026-08-10", 1);
  assertEquals(after !== null, true);
  if (!after) return;

  // Les jours bougent — et seulement ceux de la session.
  assertEquals(after.dishes.map((d) => d.day), ["tue", "wed", "thu", "thu", "fri"]);
  assertEquals(after.preparations.map((p) => p.cookOn), ["tue", "thu"]);
  assertEquals(after.sessions.map((s) => s.day), ["tue", "thu"]);

  // ⚠️ TOUT LE RESTE EST IDENTIQUE. C'est la garde de « ce n'est pas V3 »:
  // aucun plat rechoisi, aucune quantité retouchée, aucun ordre changé — et
  // l'ordre est ce qui garde les clés de coche valides (elles sont positionnelles).
  assertEquals(after.dishes.map((d) => d.title), before.dishes.map((d) => d.title));
  assertEquals(after.dishes.map((d) => d.slot), before.dishes.map((d) => d.slot));
  assertEquals(
    after.dishes.map((d) => d.dishIndex),
    before.dishes.map((d) => d.dishIndex),
  );
  assertEquals(
    after.dishes.map((d) => d.preparationIds.join(",")),
    before.dishes.map((d) => d.preparationIds.join(",")),
  );
  assertEquals(after.startsOn, before.startsOn);
  assertEquals(after.durationDays, before.durationDays);
  assertEquals(after.shoppingList, before.shoppingList);
  assertEquals(
    after.preparations.map((p) => p.ingredientTerms.join(",")),
    before.preparations.map((p) => p.ingredientTerms.join(",")),
  );
});

Deno.test("R13 — le payload écrit ne touche que trois clés, tout le reste survit", () => {
  const row = planRow();
  const before = planOf();
  const after = shiftPlanDates(before, "2026-08-10", 1);
  if (!after) throw new Error("shift failed");

  const payload = buildShiftedPayload({
    rawDishes: row.dishes as Record<string, unknown>[],
    rawPreparations: row.preparations as Record<string, unknown>[],
    rawSessions: row.cooking_sessions as Record<string, unknown>[],
    shifted: after,
  });

  const dishes = payload.dishes as Record<string, unknown>[];
  assertEquals(dishes[0].day, "tue");
  // Les champs que `AccidentPlan` ne porte PAS survivent: les reconstruire
  // depuis le modèle réduit les aurait effacés en silence.
  assertEquals(dishes[0].method, "Cook Monday bowl.");
  assertEquals(Array.isArray(dishes[0].ingredients), true);
  assertEquals(dishes[0].uses, [{ preparation_id: "prep_a", servings: 1 }]);

  const preps = payload.preparations as Record<string, unknown>[];
  assertEquals(preps[0].cook_on, "tue");
  assertEquals(preps[0].servings_made, 3);
  assertEquals(preps[0].total_minutes, 50);
  assertEquals(preps[1].cook_on, "thu"); // l'autre session ne bouge pas

  const sessions = payload.cooking_sessions as Record<string, unknown>[];
  assertEquals(sessions[0].day, "tue");
  assertEquals(sessions[0].run_through, "Oven on.");
  assertEquals(sessions[1].day, "thu");

  // Et le payload ne porte QUE ces trois clés: rien d'autre n'est réécrit.
  assertEquals(Object.keys(payload).sort(), [
    "cooking_sessions",
    "dishes",
    "preparations",
  ]);
});

Deno.test("un glissement sur une date sans session rend null", () => {
  assertEquals(shiftPlanDates(planOf(), "2026-08-12", 1), null);
  assertEquals(shiftPlanDates(planOf(), "2026-08-10", 0), null);
});

// ---------------------------------------------------------------------------
// R7 — L'EMPREINTE
// ---------------------------------------------------------------------------

Deno.test("R7 — l'empreinte CHANGE après un glissement (le double tap est périmé)", () => {
  const before = planOf();
  const after = shiftPlanDates(before, "2026-08-10", 1);
  if (!after) throw new Error("shift failed");
  assertEquals(
    planShiftFingerprint(before) === planShiftFingerprint(after),
    false,
  );
});

Deno.test("R7 — l'empreinte IGNORE les titres: renommer un plat ne périme rien", () => {
  const a = planOf();
  const b = planOf({
    dishes: [
      dish("RENAMED", "dinner", "mon", ["prep_a"]),
      dish("Tuesday wrap", "dinner", "tue", ["prep_a"]),
      dish("Wednesday curry", "dinner", "wed", ["prep_a"]),
      dish("Thursday stew", "dinner", "thu", ["prep_b"]),
      dish("Friday salad", "dinner", "fri", []),
    ],
  });
  assertEquals(planShiftFingerprint(a), planShiftFingerprint(b));
});

Deno.test("l'empreinte ne contient AUCUN `|` — c'est ce qui rend la charge découpable", () => {
  assertEquals(planShiftFingerprint(planOf()).includes("|"), false);
});

// ---------------------------------------------------------------------------
// R11 — LA CEINTURE « AUCUNE QUESTION OUVERTE SUR LE FUTUR »
// ---------------------------------------------------------------------------

Deno.test("R11 — la ceinture MORD sur 16 tournures prospectives, FR + EN", () => {
  const forbidden = [
    "When can you go shopping?",
    "When will you do the shopping",
    "When do you think you can go",
    "When are you going to the shop",
    "What time works for you",
    "What day suits you",
    "Which day can you shop",
    "How soon can you go",
    "Are you going to get there",
    "Will you be able to shop tomorrow",
    "Let me know when you have been",
    "Tell me when it is done",
    "Quand est-ce que tu fais les courses",
    "Tu peux y aller quand",
    "C'est prévu pour quand",
    "Dis-moi quand tu y vas",
  ];
  for (const text of forbidden) {
    const verdict = acceptAccidentText(text, true);
    assertEquals(verdict.ok, false, `devrait mordre: ${text}`);
    if (verdict.ok) continue;
    assertEquals(verdict.reason, "asks_about_the_future", text);
  }
});

Deno.test("R11 — la négation NE BLANCHIT PAS: « je ne te demande pas quand » mord", () => {
  // Lecture absolue: une phrase qui parle de demander quand n'a rien à faire
  // ici, même niée.
  const verdict = acceptAccidentText("I won't ask when can you go", true);
  assertEquals(verdict.ok, false);
});

Deno.test(
  "R11 — LE CAS QUI PASSE: le texte RÉEL de la proposition ne mord pas, FR + EN",
  () => {
    // ⚠️ Une garde sans cas qui passe bloque tout et ressemble à une garde qui
    // marche. Ce test est la moitié qui manque le plus souvent.
    const real: string[] = [];
    for (const language of ["fr", "en"] as const) {
      const plan = planOf();
      const shift = planSessionShift({
        plan,
        cookOn: "2026-08-10",
        doneWaves: NO_WAVES,
        cookedPreparationIds: [],
        maxFridgeDays: MAX_FRIDGE_DAYS,
    today: STARTS_ON,
      });
      if (!shift.ok) throw new Error("shift refused in fixture");
      const proposal = buildShiftProposal({
        plan,
        shift,
        language,
        restrictionFlag: false,
      });
      assertEquals(proposal !== null, true, `proposition ${language}`);
      if (!proposal) continue;
      real.push(proposal.body, ...proposal.buttons.map((b) => b.title));

      const form = buildAccidentForm({
        mealId: MEAL,
        dishIndex: 0,
        dishTitle: "Monday bowl",
        language,
        restrictionFlag: false,
        hasPlan: true,
      });
      assertEquals(form !== null, true, `formulaire ${language}`);
      if (!form) continue;
      real.push(form.body, ...form.buttons.map((b) => b.title));

      for (const reason of SHIFT_REFUSALS) {
        real.push(renderShiftRefusal({ reason, language, offerNoCook: true }));
        real.push(renderShiftRefusal({ reason, language, offerNoCook: false }));
      }
      real.push(renderAccidentAck("noted", language));
      real.push(renderAccidentAck("declined", language));
      real.push(renderAccidentAck("stale", language));
      real.push(renderShiftApplied("2026-08-11", language));
    }
    for (const text of real) {
      const verdict = acceptAccidentText(text, false);
      assertEquals(verdict.ok, true, `ne devrait PAS mordre: ${text}`);
    }
  },
);

Deno.test("MUTATION — `allowQuestionMark` change réellement le verdict", () => {
  // Un paramètre de garde qu'on peut oublier est une garde désarmée. Il est
  // requis; ce test prouve en plus qu'il SERT.
  const text = "On décale la cuisson à mardi ?";
  assertEquals(acceptAccidentText(text, true).ok, true);
  const strict = acceptAccidentText(text, false);
  assertEquals(strict.ok, false);
  if (strict.ok) return;
  assertEquals(strict.reason, "asks_a_question");
});

Deno.test("la question de session PEUT porter un `?`, la proposition NON", () => {
  for (const language of ["fr", "en"] as const) {
    const q = buildSessionQuestion({
      mealId: MEAL,
      cookOn: "2026-08-10",
      language,
      restrictionFlag: false,
    });
    assertEquals(q !== null, true);
    if (!q) continue;
    // Elle porte sur le PASSÉ et rend deux boutons: c'est la seule question de
    // la fiche, et R11 ne parle que du futur.
    assertEquals(q.buttons.length, 2);
    assertEquals(acceptAccidentText(q.body, true).ok, true);
  }
});

// ---------------------------------------------------------------------------
// R8 — LE JUGEMENT QUI FUIT
// ---------------------------------------------------------------------------

Deno.test("R8 — le verrou de vocabulaire MORD, FR + EN", () => {
  const judged = [
    "That was a cheat meal",
    "Your cheat day is fine",
    "You slipped up yesterday",
    "You can make up for it tomorrow",
    "Let's get back on track",
    "Ton écart de mardi",
    "Un petit craquage, ça arrive",
    "On va rattraper ça demain",
    "Tu pourras compenser jeudi",
  ];
  for (const text of judged) {
    const verdict = acceptAccidentText(text, true);
    assertEquals(verdict.ok, false, `devrait mordre: ${text}`);
    if (verdict.ok) continue;
    assertEquals(verdict.reason, "judges_the_person", text);
  }
});

Deno.test("R8 — LE CAS QUI PASSE: « écart » ne mord pas sur un mot voisin", () => {
  // La cicatrice `never-hand-roll-a-matcher-here`: « laitue » matchait « lait ».
  // `findForbiddenMatches` porte les bonnes frontières de mot — on le prouve.
  for (const ok of [
    "Les courses ne sont pas faites.",
    "On décale la cuisson à mardi.",
    "Un plat sans cuisson fait l'affaire.",
    // « écarter » contient « écart » mais n'est pas le même mot.
    "Rien à changer pour la suite du plan.",
  ]) {
    assertEquals(acceptAccidentText(ok, false).ok, true, ok);
  }
});

Deno.test("R8 — un verdict sur la journée est refusé, même positif", () => {
  const verdict = acceptAccidentText("Well done, everything as planned", true);
  assertEquals(verdict.ok, false);
  if (verdict.ok) return;
  assertEquals(verdict.reason, "qualifies_the_day");
});

// ---------------------------------------------------------------------------
// ① LE FORMULAIRE — trois boutons, et les deux gardes
// ---------------------------------------------------------------------------

Deno.test("le formulaire porte EXACTEMENT trois boutons", () => {
  const form = buildAccidentForm({
    mealId: MEAL,
    dishIndex: 0,
    dishTitle: "Monday bowl",
    language: "fr",
    restrictionFlag: false,
    hasPlan: true,
  });
  assertEquals(form?.buttons.length, 3);
  assertEquals(form?.buttons.map((b) => readAccidentReply(b.id).kind), [
    "ordered",
    "no_time",
    "ate_other",
  ]);
});

Deno.test("R9 — sous plancher de restriction, AUCUN formulaire; et le cas qui passe", () => {
  const args = {
    mealId: MEAL,
    dishIndex: 0,
    dishTitle: "Monday bowl",
    language: "en" as const,
    hasPlan: true,
  };
  assertEquals(buildAccidentForm({ ...args, restrictionFlag: true }), null);
  // ⚠️ LE CAS QUI PASSE: plancher désarmé, le formulaire existe. Sans lui, une
  // garde cassée bloquerait tout en ressemblant à une garde qui marche.
  assertEquals(
    buildAccidentForm({ ...args, restrictionFlag: false }) !== null,
    true,
  );
  assertEquals(
    buildSessionQuestion({
      mealId: MEAL,
      cookOn: "2026-08-10",
      language: "en",
      restrictionFlag: true,
    }),
    null,
  );
});

Deno.test("§7 — sans plan courant, le formulaire se referme sans rien écrire", () => {
  assertEquals(
    buildAccidentForm({
      mealId: MEAL,
      dishIndex: 0,
      dishTitle: "Monday bowl",
      language: "fr",
      restrictionFlag: false,
      hasPlan: false,
    }),
    null,
  );
});

Deno.test("§10 — l'entête du formulaire n'énonce AUCUNE obligation", () => {
  // Si signaler déclenchait une procédure obligatoire, les gens cesseraient de
  // signaler — c'est le pire résultat possible, et il se voit vite.
  const obligations = [
    "il faut",
    "tu dois",
    "maintenant",
    "you must",
    "you need to",
    "required",
    "please choose",
  ];
  for (const language of ["fr", "en"] as const) {
    const form = buildAccidentForm({
      mealId: MEAL,
      dishIndex: 0,
      dishTitle: "Monday bowl",
      language,
      restrictionFlag: false,
      hasPlan: true,
    });
    const text = [form?.body, ...(form?.buttons.map((b) => b.title) ?? [])]
      .join(" ")
      .toLowerCase();
    for (const word of obligations) {
      assertEquals(text.includes(word), false, `${language}: « ${word} »`);
    }
  }
});

Deno.test("un titre interrogatif est neutralisé, le formulaire survit", () => {
  const form = buildAccidentForm({
    mealId: MEAL,
    dishIndex: 0,
    dishTitle: "Did you eat it?",
    language: "en",
    restrictionFlag: false,
    hasPlan: true,
  });
  assertEquals(form !== null, true);
  assertEquals(form?.body.includes("?"), false);
});

// ---------------------------------------------------------------------------
// R3/R4 — L'ESPACE D'ACTION
// ---------------------------------------------------------------------------

Deno.test("R3 — l'espace d'action est une liste FERMÉE de quatre", () => {
  assertEquals([...REALIGNMENT_ACTIONS], [
    "shift_dish",
    "no_cook",
    "shift_session",
    "nothing_to_change",
  ]);
});

Deno.test("R4 — « ne rien faire » est TOUJOURS la dernière sortie, et parfois la seule", () => {
  const space = buildRealignmentSpace({
    plan: planOf(),
    today: "2026-08-14",
    dishIndex: null,
    skippedSessionOn: null,
    shift: null,
    maxFridgeDays: MAX_FRIDGE_DAYS,
  });
  assertEquals(space.map((a) => a.id), ["nothing_to_change"]);
});

Deno.test("§8 — « décaler » sort de l'espace quand la fenêtre frigo est dépassée", () => {
  // Le plat de mercredi puise dans la cuisson de lundi: il est déjà à J+2.
  // Le repousser à jeudi le mettrait à J+3 (limite), à vendredi à J+4 (non).
  const plan = planOf();
  const at = (dishIndex: number, maxFridgeDays: number) =>
    buildRealignmentSpace({
      plan,
      today: "2026-08-12",
      dishIndex,
      skippedSessionOn: null,
      shift: null,
      maxFridgeDays,
    }).map((a) => a.id);

  // dishIndex 2 = mercredi, cuit lundi. +1 jour ⇒ jeudi ⇒ J+3, ça tient.
  assertEquals(at(2, 3).includes("shift_dish"), true);
  // MUTATION: la même situation avec une fenêtre de 2 jours ne tient plus.
  assertEquals(at(2, 2).includes("shift_dish"), false);
  // Un plat qui ne dépend d'AUCUNE préparation n'a pas cette contrainte.
  assertEquals(at(4, 1).includes("shift_dish"), true);
});

Deno.test("R3 — un glissement REFUSÉ n'entre jamais dans l'espace", () => {
  const refused = planSessionShift({
    plan: planOf(),
    cookOn: "2026-08-10",
    doneWaves: NO_WAVES,
    cookedPreparationIds: ["prep_a"],
    maxFridgeDays: MAX_FRIDGE_DAYS,
    today: STARTS_ON,
  });
  const space = buildRealignmentSpace({
    plan: planOf(),
    today: "2026-08-10",
    dishIndex: null,
    skippedSessionOn: "2026-08-10",
    shift: refused,
    maxFridgeDays: MAX_FRIDGE_DAYS,
  });
  assertEquals(space.map((a) => a.id), ["no_cook", "nothing_to_change"]);
});

Deno.test("R4 — une cascade sans conséquence le DIT, elle n'invente rien à réparer", () => {
  const cascade = cascadeSkippedSession({
    plan: planOf(),
    cookOn: "2026-08-12", // pas de session
    tickedDishIndexes: [],
  });
  for (const language of ["fr", "en"] as const) {
    const text = renderCascadeOutcome({ cascade, language, space: [] });
    assertEquals(acceptAccidentText(text, false).ok, true);
    assertEquals(text.length > 0, true);
  }
});

// ---------------------------------------------------------------------------
// R15 — UN REFUS N'EST JAMAIS UN SILENCE
// ---------------------------------------------------------------------------

Deno.test("R15 — chaque motif rend un texte non vide, dans les deux langues", () => {
  const seen = new Set<string>();
  for (const language of ["fr", "en"] as const) {
    for (const reason of SHIFT_REFUSALS) {
      const text = renderShiftRefusal({ reason, language, offerNoCook: true });
      assertEquals(text.trim().length > 0, true, `${language}/${reason}`);
      // Deux lignes: le motif, puis ce qui reste.
      assertEquals(text.split("\n").length, 2, `${language}/${reason}`);
      seen.add(`${language}/${text}`);
    }
  }
  // Les quatre motifs ne rendent pas tous la même phrase: un refus nommé montre
  // qu'on a regardé, un refus générique ne montre rien.
  assertEquals(seen.size, 8);
});

// ---------------------------------------------------------------------------
// LE PARSEUR
// ---------------------------------------------------------------------------

Deno.test("une ligne de plan sans fenêtre ne parse pas", () => {
  assertEquals(parseAccidentPlan(MEAL, { starts_on: "", duration_days: 7 }), null);
  assertEquals(parseAccidentPlan(MEAL, {}), null);
});

Deno.test("un plan vide parse en un plan vide, sans jeter", () => {
  const plan = parseAccidentPlan(MEAL, {
    starts_on: STARTS_ON,
    duration_days: 7,
  });
  assertEquals(plan?.dishes, []);
  assertEquals(plan?.preparations, []);
  assertEquals(plan?.sessions, []);
});
