import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

import { appendNextStep, nextDayReviewStep } from "./day_review_io.ts";
import { parseSlotMealButton } from "./slot_meal_ask.ts";
import { readAccidentReply } from "./accident.ts";
import { readStripReply } from "./evening_strip.ts";

/**
 * FF-061 — LA CHAÎNE, EXÉCUTÉE CONTRE UNE BASE DOUBLÉE.
 *
 * ══ LE DÉFAUT QUE CES ÉPREUVES FERMENT ═══════════════════════════════════
 *
 * 🔴 **LA QUESTION DE CUISSON N'AVAIT AUCUN ÉMETTEUR.** `buildSessionQuestion`
 * existe depuis FF-057, `handleSessionAnswer` aussi, `cascadeSkippedSession`
 * aussi — et rien n'a JAMAIS posé « tu as fait la session de cuisine ? » dans
 * le message du soir. La seule façon de l'atteindre était de décocher un plat,
 * ce qui suppose d'avoir déjà ouvert la conversation. Un lecteur sans écrivain,
 * la cicatrice n°1 de ce dépôt, dans l'autre sens.
 *
 * ⚠️ CES ÉPREUVES EXÉCUTENT LE VRAI CHEMIN. Une épingle textuelle sur
 * `buildSessionQuestion(` dans le job aurait été verte sur un appel dont on a
 * coupé une condition — la cicatrice `safety_wiring_executed_test.ts`.
 */

const USER = "44444444-4444-4444-8444-444444444444";
const MEAL = "55555555-5555-4555-8555-555555555555";
const STARTS_ON = "2026-03-09"; // lundi
const MONDAY = "2026-03-09";

function planRow(): Record<string, unknown> {
  return {
    id: MEAL,
    starts_on: STARTS_ON,
    duration_days: 7,
    content_locale: "fr-FR",
    created_at: `${STARTS_ON}T08:00:00Z`,
    dishes: [
      {
        title: "Poulet-riz",
        slot: "dinner",
        day: "mon",
        method: "Cook.",
        ingredients: [{ term: "filler", amount: 100, unit: "g" }],
        uses: [{ preparation_id: "prep_a", servings: 1 }],
      },
    ],
    preparations: [{
      id: "prep_a",
      title: "Roast chicken",
      cook_on: "mon",
      servings_made: 3,
      method: "Roast.",
      active_minutes: 10,
      total_minutes: 50,
      ingredients: [{ term: "chicken thighs", amount: 600, unit: "g" }],
    }],
    cooking_sessions: [
      { day: "mon", preparation_ids: ["prep_a"], run_through: "Oven on." },
    ],
    shopping_list: [
      {
        term: "chicken thighs",
        aisle: "protein",
        quantity: "600 g",
        food_group: "poultry",
      },
    ],
  };
}

/**
 * Une base doublée: chaque table rend ce qu'on lui donne, quel que soit le
 * filtre. Ces épreuves n'éprouvent pas les requêtes (leurs propres tests le
 * font), elles éprouvent QUI est lu et QUOI est rendu.
 */
function stubDb(rows: Record<string, unknown[]>) {
  const builder = (table: string) => {
    const result = { data: rows[table] ?? [], error: null };
    // deno-lint-ignore no-explicit-any
    const b: any = {};
    for (
      const m of [
        "select", "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "not",
        "like", "ilike", "order", "limit",
      ]
    ) b[m] = () => b;
    b.maybeSingle = () =>
      Promise.resolve({ data: (rows[table] ?? [])[0] ?? null, error: null });
    b.single = b.maybeSingle;
    // deno-lint-ignore no-explicit-any
    b.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
    return b;
  };
  return { from: (t: string) => builder(t) };
}

const NO_STATES = {
  student_generated_meals: [planRow()],
  // ⚠️ UN CATALOGUE VIDE FAIT ÉCHOUER `loadPlannedDishContext`
  // (`if (catalogue.length === 0) return EMPTY("load_failed")`), et le contexte
  // du soir rendrait alors « pas de plan ». Une ligne suffit, et il en faut une.
  food_items: [{ slug: "poultry", label: "Poultry", food_group_ref: "poultry" }],
  grocery_wave_states: [],
  cooking_session_states: [],
  protocol_events: [],
  // Aucune ligne de foyer ⇒ la personne est son propre maître (R9).
  household_members: [],
};

// ---------------------------------------------------------------------------
// LE DÉFAUT PRINCIPAL: ② EXISTE ENFIN
// ---------------------------------------------------------------------------

Deno.test("🔴 APRÈS LES COURSES, LA QUESTION DE CUISSON PART ENFIN", async () => {
  // LE CŒUR DU LOT. Avant aujourd'hui, aucun chemin du message du soir
  // n'atteignait `buildSessionQuestion`.
  const next = await nextDayReviewStep(stubDb(NO_STATES) as never, {
    userId: USER,
    answered: "shopping",
    localDate: MONDAY,
    language: "fr",
    restrictionFlag: false,
  });
  assert(next, "l'étape suivante doit exister");
  if (!next) return;
  assertEquals(next.step, "cooking");
  assertEquals(next.buttons.length, 2);
  // ⚠️ ET LES BOUTONS SONT CEUX DE LA PROCÉDURE ACCIDENT, pas un vocabulaire
  // neuf: c'est `handleSessionAnswer` qui les lira, avec sa cascade.
  for (const b of next.buttons) {
    assertEquals(
      readAccidentReply(b.id).kind,
      "session",
      `${b.id} n'est pas lu comme une réponse de session`,
    );
  }
});

Deno.test("après la cuisson, ce sont les REPAS", async () => {
  const next = await nextDayReviewStep(stubDb(NO_STATES) as never, {
    userId: USER,
    answered: "cooking",
    localDate: MONDAY,
    language: "fr",
    restrictionFlag: false,
  });
  assert(next);
  if (!next) return;
  assertEquals(next.step, "meals");
  // ⛔ ET LA LIGNE DE COURSES N'Y EST PLUS. Elle est l'étape ①, qui a son
  // propre tour: la rendre ici la ferait réapparaître APRÈS avoir été répondue.
  for (const b of next.buttons) {
    const strip = readStripReply(b.id);
    assert(
      strip.kind !== "shopping",
      `l'étape des repas porte encore un bouton de courses: ${b.id}`,
    );
  }
});

Deno.test("après les repas, la chaîne s'arrête", async () => {
  assertEquals(
    await nextDayReviewStep(stubDb(NO_STATES) as never, {
      userId: USER,
      answered: "meals",
      localDate: MONDAY,
      language: "fr",
      restrictionFlag: false,
    }),
    null,
  );
});

// ---------------------------------------------------------------------------
// LES GARDES
// ---------------------------------------------------------------------------

Deno.test("⛔ SOUS PLANCHER, LA CHAÎNE NE CONTINUE PAS (R12)", async () => {
  // Et elle sort AVANT toute lecture: le plancher prime sur tout (T7).
  assertEquals(
    await nextDayReviewStep(stubDb(NO_STATES) as never, {
      userId: USER,
      answered: "shopping",
      localDate: MONDAY,
      language: "fr",
      restrictionFlag: true,
    }),
    null,
  );
});

Deno.test("une cuisson DÉJÀ déclarée ne se redemande pas", async () => {
  // « Une fois par session », sans compteur: la PRÉSENCE d'une ligne ferme la
  // question, quelle que soit sa valeur.
  const next = await nextDayReviewStep(
    stubDb({
      ...NO_STATES,
      cooking_session_states: [{ cook_on: MONDAY, happened: true }],
    }) as never,
    {
      userId: USER,
      answered: "shopping",
      localDate: MONDAY,
      language: "fr",
      restrictionFlag: false,
    },
  );
  assert(next);
  if (!next) return;
  assertEquals(next.step, "meals", "on saute ② et on offre ③");
});

Deno.test("un profil RÉCLAMÉ ne reçoit ni ① ni ② — seulement ses repas (R9)", async () => {
  const next = await nextDayReviewStep(
    stubDb({ ...NO_STATES, household_members: [{ role: "member" }] }) as never,
    {
      userId: USER,
      answered: "shopping",
      localDate: MONDAY,
      language: "fr",
      restrictionFlag: false,
    },
  );
  assert(next);
  if (!next) return;
  assertEquals(
    next.step,
    "meals",
    "la cuisson est un fait de FOYER: un membre n'en répond pas",
  );
});

Deno.test("une panne de lecture rend un accusé SANS suite, jamais une erreur", async () => {
  const failing = {
    from: () => {
      // deno-lint-ignore no-explicit-any
      const b: any = {};
      for (
        const m of [
          "select", "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "not",
          "like", "ilike", "order", "limit",
        ]
      ) b[m] = () => b;
      const result = { data: null, error: { message: "boom" } };
      b.maybeSingle = () => Promise.resolve(result);
      b.single = b.maybeSingle;
      // deno-lint-ignore no-explicit-any
      b.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
      return b;
    },
  };
  assertEquals(
    await nextDayReviewStep(failing as never, {
      userId: USER,
      answered: "shopping",
      localDate: MONDAY,
      language: "fr",
      restrictionFlag: false,
    }),
    null,
    "la personne vient de répondre: son fait est écrit, et une panne de suite " +
      "ne doit pas transformer un tap réussi en erreur",
  );
});

// ---------------------------------------------------------------------------
// LA COMPOSITION — une bulle, deux blocs
// ---------------------------------------------------------------------------

Deno.test("⛔ LA SUITE SE COLLE SOUS L'ACCUSÉ, EN UNE SEULE BULLE (R1)", () => {
  // Un second message serait une seconde notification, et R1 n'en autorise
  // qu'une par jour. ② et ③ sont des RÉPONSES à un tap.
  const out = appendNextStep(
    { body: "C'est noté.", buttons: [] },
    {
      step: "cooking",
      line: "La session de cuisine de lundi a eu lieu ?",
      buttons: [{ id: "KEEL_FIX_SESSION_YES|x|2026-03-09", title: "Oui" }],
    },
  );
  assertEquals(out.body, "C'est noté.\n\nLa session de cuisine de lundi a eu lieu ?");
  // ⚠️ ET LA CONVERSION DE FORME EST FAITE ICI, une fois: les renderers parlent
  // `{id,title}`, la livraison parle `{payload,label}`. Un bouton sans
  // `payload` est un bouton muet, pas une erreur.
  assertEquals(out.buttons, [{
    payload: "KEEL_FIX_SESSION_YES|x|2026-03-09",
    label: "Oui",
  }]);
});

Deno.test("sans suite, l'accusé part tel quel", () => {
  const ack = { body: "C'est noté.", buttons: [] };
  assertEquals(appendNextStep(ack, null), ack);
});

Deno.test("les vocabulaires de la chaîne restent DISJOINTS", () => {
  // ①, ② et ③ viennent de trois familles (`KEEL_STRIP_`, `KEEL_FIX_`,
  // `KEEL_STRIP_`), et la chaîne les met dans la MÊME bulle. Chaque lecteur
  // doit continuer à rendre « rien » sur ce qui ne le concerne pas.
  const session = "KEEL_FIX_SESSION_YES|x|2026-03-09";
  const strip = "KEEL_STRIP_ALL|x|0";
  assertEquals(readStripReply(session).kind, "none");
  assertEquals(readAccidentReply(strip).kind, "none");
  assertEquals(parseSlotMealButton(session), null);
  assertEquals(parseSlotMealButton(strip), null);
});
