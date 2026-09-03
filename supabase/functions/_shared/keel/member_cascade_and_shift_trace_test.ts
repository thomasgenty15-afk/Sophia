/**
 * A8.0 · LES DEUX GARDES QUE LE LOT AVAIT ARMÉES SANS LES TENIR.
 *
 * ══ POURQUOI CE FICHIER EXISTE ═══════════════════════════════════════════
 *
 * Le vérificateur d'A8.0 (2026-09-03) a rendu ROUGE sur deux défauts de la même
 * famille: **une garde réelle que rien ne tient**. Dans les deux cas il a joué
 * la mutation lui-même et la suite Deno du domaine est restée VERTE — 4 936
 * passés, 0 échec. Une garde que sa propre mutation ne fait pas rougir n'est pas
 * une garde: c'est un commentaire.
 *
 *   · **D1 — la cascade du maître sur la bande du membre.** `statesOwnerId` est
 *     un paramètre REQUIS, donc `deno check` attrape l'appelant qui l'OUBLIE.
 *     Il n'attrape pas celui qui passe la MAUVAISE VALEUR: remettre
 *     `args.userId` à la place de `args.statesOwnerId` restaure exactement le
 *     défaut d'avant le lot, et rien ne bouge. Or c'est la seule raison d'être
 *     de l'ordre du cron (`PULSE_AUDIENCES`, maîtres d'abord): l'ordre était
 *     prouvé, pas ce qu'il sert.
 *
 *   · **D2 — `generated_from.shifts[]`.** Écrit par `applyPlanShift`, et cité
 *     nulle part dans une épreuve. C'est une clause du contrat §5.10: la lane
 *     SUIVI compte « plans modifiés » dessus. Le jour où une édition perd la
 *     clé, rien ne rougit et le compteur tombe à zéro EN SILENCE — la cicatrice
 *     « lecteur sans écrivain » réintroduite dans le contrat lui-même.
 *
 * Chaque garde a ici **un cas qui passe et un cas qui refuse**. Le cas qui
 * refuse est celui qui distingue la bonne valeur de la mauvaise; sans lui on ne
 * tient que la présence d'un paramètre, ce qui est précisément ce qui a manqué.
 */
import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

import {
  applyPlanShift,
  computeSessionShift,
  loadSkippedDishIndexes,
  withShiftTrace,
} from "./accident_io.ts";
import {
  type AccidentPlan,
  parseAccidentPlan,
  planShiftFingerprint,
} from "./accident.ts";

/** LA PERSONNE qui mange — le profil réclamé. Ses coches sont à elle. */
const MEMBER = "11111111-1111-4111-8111-111111111111";
/** LE MAÎTRE — c'est SOUS SON COMPTE que les états de cuisson sont écrits. */
const MASTER = "22222222-2222-4222-8222-222222222222";
const MEAL = "33333333-3333-4333-8333-333333333333";
const STARTS_ON = "2026-03-09"; // lundi

function dish(title: string, day: string, prepIds: string[]) {
  return {
    title,
    slot: "dinner",
    day,
    method: `Cook ${title}.`,
    ingredients: [{ term: "filler", amount: 100, unit: "g" }],
    uses: prepIds.map((id) => ({ preparation_id: id, servings: 1 })),
  };
}

function planRow(): Record<string, unknown> {
  return {
    id: MEAL,
    starts_on: STARTS_ON,
    duration_days: 7,
    dishes: [
      dish("Mercredi", "wed", ["prep_a"]), // 0 — dépend de la cuisson de mercredi
      dish("Jeudi", "thu", ["prep_a"]), // 1 — idem
      dish("Vendredi", "fri", []), // 2 — ne dépend de rien
    ],
    preparations: [{
      id: "prep_a",
      title: "Roast chicken",
      cook_on: "wed",
      servings_made: 3,
      method: "Roast.",
      active_minutes: 10,
      total_minutes: 50,
      ingredients: [{ term: "chicken thighs", amount: 600, unit: "g" }],
    }],
    cooking_sessions: [
      { day: "wed", preparation_ids: ["prep_a"], run_through: "Oven on." },
    ],
    shopping_list: [
      { term: "chicken thighs", aisle: "protein", quantity: "600 g", food_group: "poultry" },
    ],
  };
}

function planOf(): AccidentPlan {
  const parsed = parseAccidentPlan(MEAL, planRow());
  if (!parsed) throw new Error("fixture did not parse");
  return parsed;
}

/**
 * Une base doublée QUI REGARDE LE `user_id` DEMANDÉ.
 *
 * ⚠️ C'EST TOUT L'INTÉRÊT, ET C'EST CE QUI MANQUAIT. Les doublures existantes
 * (`missed_wave_reader_test.ts`) rendent leurs lignes quel que soit le filtre,
 * et passent `userId === statesOwnerId`: échanger les deux y est invisible. Ici
 * la déclaration de cuisson n'existe QUE sous le maître, et la coche QUE sous
 * le membre — donc lire la mauvaise clé rend un résultat différent.
 */
function twoAccountDb(rows: {
  /** `cooking_session_states`, par `user_id`. */
  sessionStates: Record<string, Array<Record<string, unknown>>>;
  /** `protocol_events` (les coches vivantes), par `user_id`. */
  ticks: Record<string, Array<Record<string, unknown>>>;
  /** `grocery_wave_states`, par `user_id`. */
  waveStates?: Record<string, Array<Record<string, unknown>>>;
}) {
  return {
    from(table: string) {
      let askedUser = "";
      // deno-lint-ignore no-explicit-any
      const b: any = {};
      for (const m of ["select", "order", "limit", "is", "like", "not", "gt", "lt", "gte", "lte", "in"]) {
        b[m] = () => b;
      }
      b.eq = (col: string, value: unknown) => {
        if (col === "user_id") askedUser = String(value ?? "");
        return b;
      };
      const settle = () => {
        const byUser = table === "cooking_session_states"
          ? rows.sessionStates
          : table === "protocol_events"
          ? rows.ticks
          : table === "grocery_wave_states"
          ? (rows.waveStates ?? {})
          : null;
        if (byUser === null) {
          return {
            data: table === "student_generated_meals" ? [planRow()] : [],
            error: null,
          };
        }
        return { data: byUser[askedUser] ?? [], error: null };
      };
      b.maybeSingle = () => Promise.resolve({ data: settle().data[0] ?? null, error: null });
      b.single = b.maybeSingle;
      // deno-lint-ignore no-explicit-any
      b.then = (res: any, rej: any) => Promise.resolve(settle()).then(res, rej);
      return b;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// D1 — LA CASCADE DU MAÎTRE AMPUTE LA BANDE DU MEMBRE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test(
  "⛔ D1 · LE CAS QUI PASSE — la cuisson ratée du MAÎTRE fait tomber les plats du MEMBRE",
  async () => {
    // Le maître a déclaré à 20h05 « je n'ai pas cuisiné mercredi ». La bande ③
    // du conjoint, servie à 20h06, ne doit plus annoncer les deux plats qui en
    // descendent. C'est le produit que `PULSE_AUDIENCES` sert dans cet ordre.
    //
    // ⚠️ LA DÉCLARATION N'EXISTE QUE SOUS LE MAÎTRE. C'est le fait réel: les
    // états de cuisson sont des faits de FOYER (FF-058 R10), écrits par celui
    // qui a composé le plan. Lire sous le membre rend `[]`.
    const db = twoAccountDb({
      sessionStates: { [MASTER]: [{ cook_on: "2026-03-11", happened: false }] },
      ticks: {},
    });

    const skipped = await loadSkippedDishIndexes(db as never, {
      userId: MEMBER,
      statesOwnerId: MASTER,
      plan: planOf(),
    });

    assertEquals(
      skipped,
      [0, 1],
      "les deux plats qui puisent dans la cuisson de mercredi doivent tomber",
    );
  },
);

Deno.test(
  "⛔ D1 · LE CAS QUI REFUSE — lire les états SOUS LE MEMBRE ne trouve rien",
  async () => {
    // ══════════════════════════════════════════════════════════════════════
    // C'EST L'ÉPREUVE QUE LE VÉRIFICATEUR A DEMANDÉE, ET LA SEULE QUI
    // DISTINGUE LA BONNE VALEUR DE LA MAUVAISE.
    //
    // `statesOwnerId` est requis, donc `deno check` attrape l'appelant qui
    // l'OUBLIE. Il n'attrape pas celui qui passe `args.userId` — c'est-à-dire
    // exactement le défaut d'avant A8.0: la cascade n'amputait jamais la bande
    // du membre, et le plan lui annonçait un plat que personne n'avait
    // cuisiné.
    //
    // MUTATION QUI DOIT ROUGIR: dans `loadSkippedDishIndexes`, remettre
    // `args.userId` à la place de `args.statesOwnerId` sur `loadSessionStates`
    // ou sur `loadMissedWaveBuyOns`.
    // ══════════════════════════════════════════════════════════════════════
    const db = twoAccountDb({
      sessionStates: { [MASTER]: [{ cook_on: "2026-03-11", happened: false }] },
      ticks: {},
    });

    assertEquals(
      await loadSkippedDishIndexes(db as never, {
        userId: MEMBER,
        statesOwnerId: MEMBER, // ⛔ la mauvaise clé, passée exprès
        plan: planOf(),
      }),
      [],
      "sous le compte du MEMBRE il n'y a aucune déclaration de cuisson: si " +
        "cette lecture rend quand même [0,1], c'est que le lecteur ignore " +
        "`statesOwnerId` et lit sous une clé qu'on ne lui a pas donnée",
    );
  },
);

Deno.test(
  "⛔ D1 · LES DEUX CLÉS SONT DEUX FAITS — la coche du MEMBRE fait survivre SON plat",
  async () => {
    // FF-058 R10, les deux moitiés dans la même lecture: la cuisson est un fait
    // de FOYER (clé maître), la consommation un fait de PERSONNE (clé membre).
    // Le membre a coché « mangé » sur le plat 0 malgré la cuisson ratée — sa
    // déclaration vivante gagne, et ce plat NE tombe pas.
    //
    // MUTATION QUI DOIT ROUGIR: passer `statesOwnerId` à `loadLiveTickIndexes`
    // — la coche serait cherchée sous le maître, qui n'en a aucune, et le plat
    // du membre tomberait alors qu'il a dit l'avoir mangé.
    const db = twoAccountDb({
      sessionStates: { [MASTER]: [{ cook_on: "2026-03-11", happened: false }] },
      ticks: { [MEMBER]: [{ source_message_id: `meal_tick:${MEAL}:0` }] },
    });

    assertEquals(
      await loadSkippedDishIndexes(db as never, {
        userId: MEMBER,
        statesOwnerId: MASTER,
        plan: planOf(),
      }),
      [1],
      "le plat 0 survit par la coche du MEMBRE; le plat 1 tombe par la " +
        "déclaration du MAÎTRE. Deux clés, deux faits.",
    );
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// D2 — `generated_from.shifts[]`, LA CLAUSE DU CONTRAT §5.10
// ═══════════════════════════════════════════════════════════════════════════

const TRACE = {
  cook_on: "2026-03-11",
  delta: 1,
  new_cook_on: "2026-03-12",
  moved_dish_indexes: [0, 1],
  applied_on: "2026-03-11",
};

Deno.test("⛔ D2 · LE CAS QUI PASSE — la trace est APPOSÉE, jamais substituée", () => {
  const before = {
    prompt_version: "v24",
    belief_keys: ["b1"],
    shifts: [{ ...TRACE, cook_on: "2026-03-10", applied_on: "2026-03-10" }],
  };
  const after = withShiftTrace(before, TRACE);

  // TOUT CE QUE LA COLONNE PORTAIT SURVIT. `generated_from` porte la version de
  // prompt et les convictions citées: les écraser ferait perdre la traçabilité
  // de la génération pour tracer un glissement.
  assertEquals(after.prompt_version, "v24");
  assertEquals(after.belief_keys, ["b1"]);
  assertEquals(
    (after.shifts as unknown[]).length,
    2,
    "un second glissement s'AJOUTE au premier; le remplacer perdrait " +
      "l'histoire que la page de suivi compte",
  );
  assertEquals((after.shifts as unknown[])[1], TRACE);
  // ET LA FORME, pas seulement la clé: la lane SUIVI lit ces champs.
  const last = (after.shifts as Array<Record<string, unknown>>)[1];
  for (const field of ["cook_on", "delta", "new_cook_on", "moved_dish_indexes", "applied_on"]) {
    assert(field in last, `\`shifts[].${field}\` a disparu de la trace`);
  }
});

Deno.test("⛔ D2 · LE CAS QUI REFUSE — une colonne illisible est REMPLACÉE, pas accumulée", () => {
  // On ne pousse pas dans une valeur qu'on ne sait pas lire. Un `shifts` qui
  // n'est pas un tableau (donnée ancienne, écriture d'un autre outil) est
  // remplacé par un tableau propre; un `generated_from` qui n'est pas un objet
  // ne fait pas jeter.
  for (const broken of [null, undefined, 42, "x", ["a"]]) {
    const out = withShiftTrace(broken, TRACE);
    assertEquals(out.shifts, [TRACE], `\`${JSON.stringify(broken)}\` mal traité`);
  }
  assertEquals(
    withShiftTrace({ shifts: "pas un tableau" }, TRACE).shifts,
    [TRACE],
    "un `shifts` non-tableau doit être remplacé, jamais poussé dedans",
  );
});

Deno.test(
  "⛔ D2 · `applyPlanShift` ÉCRIT VRAIMENT LA TRACE — et sans toucher aux trois clés de date",
  async () => {
    // ══════════════════════════════════════════════════════════════════════
    // LA MOITIÉ QUI MANQUAIT. `withShiftTrace` peut être parfaite et n'être
    // appelée nulle part: c'est exactement la mutation que le vérificateur a
    // jouée (`withShiftTrace` rendant `{...base}`), et rien n'a rougi.
    //
    // MUTATION QUI DOIT ROUGIR: retirer `generated_from:` du payload de
    // `applyPlanShift`, ou faire rendre `{...base}` à `withShiftTrace`.
    // ══════════════════════════════════════════════════════════════════════
    let written: Record<string, unknown> | null = null;
    // ⚠️ LA DOUBLURE EST ÉTATIQUE, ET IL LE FAUT. `applyPlanShift` RELIT la
    // ligne après l'écriture et compare l'empreinte à celle du plan glissé
    // (« une vraie relecture »): une doublure qui rendrait toujours la ligne
    // d'origine ferait rendre `unverified` — un vert de façade sur un chemin
    // qui n'atteint jamais le payload.
    let row: Record<string, unknown> = {
      ...planRow(),
      content_locale: "fr-FR",
      updated_at: "2026-03-11T10:00:00Z",
      generated_from: { prompt_version: "v24" },
    };
    const db = {
      from(table: string) {
        // deno-lint-ignore no-explicit-any
        const b: any = {};
        for (
          const m of ["select", "eq", "is", "order", "limit", "not", "lte", "gte", "like", "ilike", "in", "gt", "lt", "neq"]
        ) b[m] = () => b;
        b.update = (payload: Record<string, unknown>) => {
          written = payload;
          row = { ...row, ...payload };
          return b;
        };
        b.maybeSingle = () =>
          Promise.resolve({
            data: table === "student_generated_meals" ? row : null,
            error: null,
          });
        b.single = b.maybeSingle;
        // deno-lint-ignore no-explicit-any
        b.then = (res: any, rej: any) =>
          Promise.resolve({
            data: table === "student_generated_meals" ? [{ id: MEAL }] : [],
            error: null,
          }).then(res, rej);
        return b;
      },
    };

    // LE DELTA ET L'EMPREINTE VIENNENT DU PRODUIT, PAS DE CE FICHIER. Les
    // écrire en dur ferait une épreuve paramétrée par sa propre constante:
    // elle resterait verte le jour où le calcul change (cicatrice
    // `test-parameterized-by-its-own-constant`).
    const plan = planOf();
    const shift = await computeSessionShift(db as never, {
      userId: MASTER,
      plan,
      cookOn: "2026-03-11",
      today: "2026-03-11",
    });
    assert(shift.ok, `la fixture ne produit aucun glissement: ${JSON.stringify(shift)}`);

    const outcome = await applyPlanShift(db as never, {
      userId: MASTER,
      mealId: MEAL,
      cookOn: "2026-03-11",
      delta: shift.delta,
      fingerprint: planShiftFingerprint(plan),
      today: "2026-03-11",
    });
    assertEquals(outcome.outcome, "applied", `glissement refusé: ${JSON.stringify(outcome)}`);

    const payload = written as Record<string, unknown> | null;
    assert(payload, "aucune écriture n'a eu lieu");
    const generatedFrom = payload!.generated_from as Record<string, unknown> | undefined;
    assert(
      generatedFrom && Array.isArray(generatedFrom.shifts),
      "`generated_from.shifts[]` n'est PAS écrit par `applyPlanShift`. C'est " +
        "une clause du contrat §5.10: la lane SUIVI compte « plans modifiés » " +
        "dessus, et sans écrivain son compteur tombe à zéro en silence.",
    );
    assertEquals((generatedFrom!.shifts as unknown[]).length, 1);
    assertEquals(
      generatedFrom!.prompt_version,
      "v24",
      "la trace a ÉCRASÉ ce que la colonne portait",
    );
    const entry = (generatedFrom!.shifts as Array<Record<string, unknown>>)[0];
    for (const field of ["cook_on", "delta", "new_cook_on", "moved_dish_indexes", "applied_on"]) {
      assert(field in entry, `\`shifts[].${field}\` manque à la trace écrite`);
    }

    // ⚠️ R13 — ET RIEN D'AUTRE N'EST ENTRÉ DANS LE PAYLOAD. `starts_on`,
    // `duration_days`, les titres, l'ORDRE des plats: intouchés. L'ordre est ce
    // qui garde les clés de coche valides, puisqu'elles sont positionnelles.
    assertEquals(
      Object.keys(payload!).sort(),
      ["cooking_sessions", "dishes", "generated_from", "preparations"],
      "le payload d'un glissement a gagné une clé: R13 tenait à ces quatre-là",
    );
  },
);
