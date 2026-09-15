import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

import { accidentFormAfterUntick } from "./accident_tap.ts";

/**
 * R9 — LE PLANCHER TCA DE LA PROCÉDURE ACCIDENT, TENU PAR SON EFFET.
 *
 * ══ LE DÉFAUT QUE CE FICHIER EXISTE POUR FERMER ═══════════════════════════
 *
 * Du 2026-08-08 au 2026-09-01, `accident_tap.ts` portait cette ligne:
 *
 *     const RESTRICTION_FLAG_HAS_NO_PRODUCER = false;
 *
 * Elle était HONNÊTE — son pavé disait exactement ce qu'elle valait — et elle
 * était quand même le pire des deux mondes: la garde R9 vivait dans
 * `buildAccidentForm` / `buildSessionQuestion` / `buildShiftProposal`, armée,
 * testée dans les deux langues, avec ses tests VERTS... et elle ne recevait
 * jamais `true`. Le formulaire d'accident s'ouvrait en entier pour quelqu'un
 * sous plancher de restriction alimentaire.
 *
 * ⛔ AUCUNE ÉPREUVE D'ICI NE CHERCHE UNE CHAÎNE DANS LA SOURCE. La cicatrice
 * est nommée dans `safety_wiring_executed_test.ts`: une garde qui lit du texte
 * voit que l'appel est écrit, jamais ce qu'on lui donne. `restrictionFlag:
 * evaluateRestrictionForStudent(...)` et `restrictionFlag: false` sont deux
 * lignes différentes, mais `restrictionFlag: floor.restriction_flag === false`
 * ne le serait pas — et c'est exactement le genre d'inversion qu'une épingle
 * textuelle laisse passer.
 *
 * ⟳ CE QUE CES ÉPREUVES FONT À LA PLACE: elles appellent la VRAIE fonction
 * exportée avec une base doublée, et elles assertent l'EFFET OBSERVÉ. La
 * mutation « remettre un littéral » fait tomber deux des trois.
 *
 * ── LE SIGNAL CHOISI, ET POURQUOI CELUI-LÀ ────────────────────────────────
 * Le vocabulaire compensatoire (`compensatory_language`), parce que c'est le
 * déclencheur dont la source est la plus certainement VIVANTE dans le modèle
 * pivot: la prose que l'élève écrit lui-même. Le poids (`rapid_weight_loss`)
 * l'est aussi (`student_body_measures`, FF-031), mais il demande deux semaines
 * de mesures en fixture pour un gain de preuve nul.
 */

// ---------------------------------------------------------------------------
// LA BASE DOUBLÉE — chaînable, et `thenable` comme l'est un query builder
// ---------------------------------------------------------------------------

type TableRows = Record<string, unknown[]>;

/**
 * Un faux client PostgREST.
 *
 * Il rend les mêmes lignes quel que soit le filtre: ce fichier n'éprouve PAS
 * les requêtes (leurs propres tests le font), il éprouve QUI décide du drapeau.
 * `throwOn` fait jeter une table nommée — c'est la seule façon d'observer le
 * fail-closed, qui est une décision et pas un accident.
 */
function stubDb(rows: TableRows, throwOn: string | null = null) {
  const builder = (table: string) => {
    const result = throwOn === table
      ? { data: null, error: { message: `stub failure on ${table}` } }
      : { data: rows[table] ?? [], error: null };
    // deno-lint-ignore no-explicit-any
    const b: any = {};
    for (
      const method of [
        "select",
        "eq",
        "neq",
        "gt",
        "gte",
        "lt",
        "lte",
        "in",
        "is",
        "not",
        "order",
        "limit",
      ]
    ) {
      b[method] = () => b;
    }
    b.maybeSingle = () =>
      Promise.resolve(
        throwOn === table ? result : {
          data: (rows[table] ?? [])[0] ?? null,
          error: null,
        },
      );
    b.single = b.maybeSingle;
    // deno-lint-ignore no-explicit-any
    b.then = (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject);
    return b;
  };
  return { from: (table: string) => builder(table) };
}

const USER = "11111111-1111-4111-8111-111111111111";
const MEAL = "22222222-2222-4222-8222-222222222222";
const TODAY = "2026-03-11"; // un mercredi
const STARTS_ON = "2026-03-09"; // le lundi de cette semaine

function planRow(): Record<string, unknown> {
  return {
    id: MEAL,
    starts_on: STARTS_ON,
    duration_days: 7,
    content_locale: "en-GB",
    updated_at: "2026-03-09T08:00:00.000Z",
    dishes: [
      {
        title: "Monday bowl",
        slot: "dinner",
        day: "mon",
        method: "Cook it.",
        ingredients: [{ term: "filler", amount: 100, unit: "g" }],
        uses: [{ preparation_id: "prep_a", servings: 1 }],
      },
    ],
    preparations: [
      {
        id: "prep_a",
        title: "Roast chicken",
        cook_on: "mon",
        servings_made: 3,
        method: "Roast.",
        active_minutes: 10,
        total_minutes: 50,
        ingredients: [{ term: "chicken thighs", amount: 600, unit: "g" }],
      },
    ],
    cooking_sessions: [
      { day: "mon", preparation_ids: ["prep_a"], run_through: "Oven on." },
    ],
    shopping_list: [
      { term: "chicken thighs", aisle: "protein", quantity: "600 g" },
    ],
  };
}

/** Une note d'élève, telle que `loadStudentTextSamples` la lit. */
function note(text: string): Record<string, unknown> {
  return { student_note: text, content_locale: "en-GB", local_date: TODAY };
}

// ---------------------------------------------------------------------------

Deno.test("le formulaire s'ouvre quand rien ne lève le plancher", async () => {
  const db = stubDb({
    student_generated_meals: [planRow()],
    protocol_events: [note("Had the chicken, it was good.")],
  });
  const form = await accidentFormAfterUntick(db as never, {
    userId: USER,
    mealId: MEAL,
    dishIndex: 0,
    language: "en",
    localDate: TODAY,
  });
  assert(form !== null, "le cas nominal doit rendre un formulaire");
  assertEquals(form.buttons.length, 3);
});

Deno.test("le plancher levé referme le formulaire — c'est R9, et il MORD", async () => {
  // La MÊME base, à un mot près. Ce mot est un motif `strong` de
  // `COMPENSATORY_PATTERNS`: il mord seul, sans contexte.
  const db = stubDb({
    student_generated_meals: [planRow()],
    protocol_events: [note("I didn't deserve dinner tonight.")],
  });
  const form = await accidentFormAfterUntick(db as never, {
    userId: USER,
    mealId: MEAL,
    dishIndex: 0,
    language: "en",
    localDate: TODAY,
  });
  assertEquals(
    form,
    null,
    "sous plancher, la procédure accident ne s'ouvre pas — un littéral `false` " +
      "rendrait ici les trois boutons",
  );
});

Deno.test("une évaluation en panne se ferme, elle ne s'ouvre pas", async () => {
  // Fail-closed: « je ne peux pas vérifier » et « c'est bon » ne doivent pas
  // produire le même comportement (`daily_ask_budget.ts` porte la même règle).
  const db = stubDb(
    {
      student_generated_meals: [planRow()],
      protocol_events: [note("Had the chicken, it was good.")],
    },
    "protocol_events",
  );
  const form = await accidentFormAfterUntick(db as never, {
    userId: USER,
    mealId: MEAL,
    dishIndex: 0,
    language: "en",
    localDate: TODAY,
  });
  assertEquals(form, null, "une lecture en panne ne doit pas ouvrir la porte");
});
