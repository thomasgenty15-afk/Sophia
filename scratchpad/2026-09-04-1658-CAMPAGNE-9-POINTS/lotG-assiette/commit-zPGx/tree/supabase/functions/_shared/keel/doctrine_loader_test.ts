// PIVOT NUTRITION §3.3 — doctrine_loader.ts.
//
// The test that carries the absence arbitration:
//   * "no method loaded still ANSWERS the student"
//     -- the first version of this block told the model to withhold advice and
//        send the student to their coach. Measured in a real conversation, that
//        is a student who asks for food advice and gets nothing, pointed at a
//        1:1 channel that does not exist. Absence of a method is not a reason
//        to go quiet; it is only a reason not to speak in the coach's name.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  doctrineBeliefsFor,
  doctrineBlockFor,
  loadPublishedDoctrine,
  NO_COACH_METHOD_BLOCK,
  NO_DOCTRINE_FOR_THIS_GOAL_BLOCK,
} from "./doctrine_loader.ts";

type Outcome = { data?: unknown; error?: unknown; throws?: boolean };

/**
 * Fake matching the two chains the loader uses:
 *   from(t).select(c).eq(a,b)[.eq|.not](...).limit(n).maybeSingle()
 *   from(t).select(c).eq(a,b).eq(a,b)                  ← awaited directly
 *
 * Le second est THENABLE, comme un vrai constructeur de requête PostgREST: la
 * lecture des aliments écartés n'appelle ni `limit` ni `maybeSingle`, elle
 * attend la chaîne. Un faux qui ne rendrait que des nœuds laisserait ce chemin
 * silencieusement vide, donc non testé.
 */
function fakeDb(byTable: Record<string, Outcome>) {
  const calls: string[] = [];
  const chain = (table: string) => {
    const outcome = byTable[table] ?? { data: null };
    const settle = () => {
      calls.push(table);
      if (outcome.throws) throw new Error("connection reset");
      return Promise.resolve({
        data: outcome.data ?? null,
        error: outcome.error ?? null,
      });
    };
    const node: Record<string, unknown> = {
      eq: () => node,
      not: () => node,
      order: () => node,
      limit: () => node,
      maybeSingle: settle,
      then: (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown,
      ) => {
        try {
          return settle().then(resolve, reject);
        } catch (err) {
          return Promise.resolve().then(() => reject(err));
        }
      },
    };
    return node;
  };
  return {
    db: { from: (table: string) => ({ select: () => chain(table) }) },
    calls,
  };
}

const DOCTRINE_ROW = {
  coach_id: "coach-1",
  version: 3,
  beliefs: [{ key: "intermittent_fasting_is_the_backbone", claim: "Intermittent fasting is the backbone", goalScope: [] }],
  forbidden: [{ token: "six_small_meals", surface_forms: ["6 petits repas"] }],
  vocabulary: [],
  arbitrations: [],
  voice: { address: "tu", length: "short" },
  content_locale: "fr-FR",
  published_at: "2026-08-01T10:00:00Z",
};

Deno.test("loads the published doctrine of the student's live coach", async () => {
  const { db } = fakeDb({
    coach_clients: { data: { coach_id: "coach-1" } },
    coach_doctrines: { data: DOCTRINE_ROW },
  });
  const loaded = await loadPublishedDoctrine(db, "student-1");
  assertEquals(loaded.reason, "loaded");
  assertEquals(loaded.coachId, "coach-1");
  assertEquals(loaded.doctrine?.forbidden[0].token, "six_small_meals");
  assert(loaded.compiled?.text.includes("six_small_meals"));
  assert(loaded.compiled?.hash);
  // And the injected block IS the doctrine, not the fallback.
  assertEquals(doctrineBlockFor(loaded), loaded.compiled?.text);
});

// ── LES ALIMENTS ÉCARTÉS VIENNENT DE L'ÉCRAN ALIMENTS ─────────────────────
//
// Ils étaient demandés en prose dans l'entretien de doctrine ET posés en
// pastilles sur `/coach/protocol`. Une seule source désormais:
// `coach_food_items` en `stance='excluded'` — « Never » à l'écran.

Deno.test("les aliments 'Never' arment le verrou depuis coach_food_items", async () => {
  const { db } = fakeDb({
    coach_clients: { data: { coach_id: "coach-1" } },
    coach_doctrines: { data: DOCTRINE_ROW },
    coach_food_items: { data: [{ label: "Seed oil" }, { label: "Protein bars" }] },
  });
  const loaded = await loadPublishedDoctrine(db, "student-1");
  assertEquals(
    loaded.doctrine?.foods.discouraged.map((f) => f.term),
    ["Seed oil", "Protein bars"],
  );
});

// LA COLONNE `coach_doctrines.foods` N'EST PLUS LA SOURCE. On la REMPLACE, on
// ne fusionne pas: deux sources pour une liste, c'est la divergence garantie le
// jour où un coach retire un aliment d'un écran et le voit rester actif parce
// que l'autre le porte encore.
Deno.test("la colonne foods de la doctrine ne survit pas à la lecture", async () => {
  const { db } = fakeDb({
    coach_clients: { data: { coach_id: "coach-1" } },
    coach_doctrines: {
      data: { ...DOCTRINE_ROW, foods: { discouraged: [{ term: "Stale entry" }] } },
    },
    coach_food_items: { data: [{ label: "Seed oil" }] },
  });
  const loaded = await loadPublishedDoctrine(db, "student-1");
  assertEquals(loaded.doctrine?.foods.discouraged.map((f) => f.term), ["Seed oil"]);
});

// ── LE GABARIT D'UNE EXCLUSION VOYAGE AVEC ELLE ────────────────────────────
//
// MESURÉ LE 2026-08-13 (run `doctrine5`): le `select` ne prenait que `label`,
// donc « Viande rouge au dîner » posé en `not_after 19:00` arrivait dans le
// bloc sous « Never suggest these to the student » — le coach a écrit « pas
// après 19h », l'agent lisait « jamais ». Sur une doctrine dont le parti pris
// EST une heure, la doctrine sortait déformée.
//
// ⚠️ LA BORNE VA DANS `reason`, JAMAIS DANS `term`: `term` est la chaîne que le
// verrou déterministe de sortie cherche dans la prose générée. La déplacer
// désarmerait le verrou sur l'aliment lui-même.
Deno.test("une exclusion BORNÉE porte sa borne, et pas dans le terme", async () => {
  const { db } = fakeDb({
    coach_clients: { data: { coach_id: "coach-1" } },
    coach_doctrines: { data: DOCTRINE_ROW },
    coach_food_items: {
      data: [
        {
          label: "Viande rouge au dîner",
          why: "après 19h, plus rien de dense",
          frequency_template: "not_after",
          cutoff_local: "19:00:00",
          slot_key: null,
        },
        {
          label: "Café",
          why: null,
          frequency_template: "at_slot",
          cutoff_local: null,
          slot_key: "on_waking",
        },
      ],
    },
  });
  const loaded = await loadPublishedDoctrine(db, "student-1");
  const foods = loaded.doctrine?.foods.discouraged ?? [];
  // Le TERME est intact — c'est lui que le verrou matche.
  assertEquals(foods.map((f) => f.term), ["Viande rouge au dîner", "Café"]);
  // La borne est dans le `reason`, avec le « pourquoi » du coach quand il existe.
  // « fine before that » n'est pas décoratif: sans lui, le modèle lit une heure
  // dans une section intitulée « Never suggest these » et garde le « jamais ».
  assertEquals(
    foods[0].reason,
    "not after 19:00, fine before that — après 19h, plus rien de dense",
  );
  assertEquals(foods[1].reason, "at the on waking slot only");
  // Et elle atteint le PROMPT: sans ça la lecture serait juste et le bloc faux.
  const block = doctrineBlockFor(loaded);
  assert(
    block.includes("Viande rouge au dîner — not after 19:00"),
    `la borne n'atteint pas le bloc:\n${block}`,
  );
});

// ANTI-FAUX-POSITIF: une exclusion ABSOLUE — le cas de loin le plus courant —
// ne gagne RIEN. Le bloc de tous les coachs qui n'ont pas touché aux gabarits
// doit rester identique octet pour octet, sinon le hash de cache de chacun
// bouge pour un lot qui ne les concerne pas.
Deno.test("une exclusion ABSOLUE ne gagne aucune borne", async () => {
  const { db } = fakeDb({
    coach_clients: { data: { coach_id: "coach-1" } },
    coach_doctrines: { data: DOCTRINE_ROW },
    coach_food_items: {
      data: [{ label: "Lentilles", why: null, frequency_template: null }],
    },
  });
  const loaded = await loadPublishedDoctrine(db, "student-1");
  assertEquals(loaded.doctrine?.foods.discouraged[0].reason, null);
  assert(
    doctrineBlockFor(loaded).includes("- Lentilles\n") ||
      doctrineBlockFor(loaded).endsWith("- Lentilles"),
    "une exclusion absolue doit rester une ligne nue",
  );
});

// R7: un gabarit connu dont la colonne obligatoire manque ne produit PAS une
// demi-borne. Une exclusion qu'on n'a pas su lire reste ABSOLUE — on ne relâche
// jamais une exclusion sur une donnée incomplète.
Deno.test("un gabarit sans sa colonne retombe sur l'exclusion absolue", async () => {
  const { db } = fakeDb({
    coach_clients: { data: { coach_id: "coach-1" } },
    coach_doctrines: { data: DOCTRINE_ROW },
    coach_food_items: {
      data: [{ label: "Pâtes", why: null, frequency_template: "not_after", cutoff_local: null }],
    },
  });
  const loaded = await loadPublishedDoctrine(db, "student-1");
  assertEquals(loaded.doctrine?.foods.discouraged[0].reason, null);
});

// NE THROW JAMAIS. Une lecture d'aliments cassée dégrade la liste; elle ne doit
// pas coûter sa doctrine au coach — sinon une panne sur une table secondaire
// prive toute une cohorte de la méthode qu'elle paie.
Deno.test("une lecture d'aliments cassée ne coûte pas la doctrine", async () => {
  const { db } = fakeDb({
    coach_clients: { data: { coach_id: "coach-1" } },
    coach_doctrines: { data: DOCTRINE_ROW },
    coach_food_items: { throws: true },
  });
  const loaded = await loadPublishedDoctrine(db, "student-1");
  assertEquals(loaded.reason, "loaded");
  assertEquals(loaded.doctrine?.foods.discouraged.length, 0);
  assertEquals(loaded.doctrine?.forbidden[0].token, "six_small_meals");
});

Deno.test("no method loaded still ANSWERS the student", () => {
  // THE REGRESSION THIS PINS, and it was shipped: the block used to say "Do NOT
  // give prescriptive nutrition advice ... say it is the coach's call and invite
  // the student to ask them". A student asking "I need some food advice" got a
  // refusal and a pointer to a channel that does not exist.
  assert(NO_COACH_METHOD_BLOCK.includes("ANSWER THE QUESTION"));
  assert(NO_COACH_METHOD_BLOCK.includes("your own nutrition knowledge"));
  // What stays forbidden is the narrow, real risk: speaking for the coach.
  assert(NO_COACH_METHOD_BLOCK.includes("Speak in your own name"));
  // And never again the two sentences that gagged the agent.
  assert(!/Do NOT give prescriptive nutrition advice/.test(NO_COACH_METHOD_BLOCK));
  assert(!/coach's call/.test(NO_COACH_METHOD_BLOCK));
  assert(NO_COACH_METHOD_BLOCK.trim().length > 0);
});

Deno.test("every failure mode is NAMED, and all inject the no-method block", async () => {
  const cases: Array<[string, Record<string, Outcome>, string]> = [
    ["no_coach", { coach_clients: { data: null } }, "no_coach"],
    [
      "coach lookup throws",
      { coach_clients: { throws: true } },
      "load_failed",
    ],
    [
      "coach lookup errors",
      { coach_clients: { error: { message: "boom" } } },
      "load_failed",
    ],
    [
      "no published doctrine",
      { coach_clients: { data: { coach_id: "c" } }, coach_doctrines: { data: null } },
      "no_published_doctrine",
    ],
    [
      "doctrine load throws",
      { coach_clients: { data: { coach_id: "c" } }, coach_doctrines: { throws: true } },
      "load_failed",
    ],
  ];
  for (const [label, tables, expected] of cases) {
    const { db } = fakeDb(tables);
    const loaded = await loadPublishedDoctrine(db, "student-1");
    assertEquals(loaded.reason, expected, label);
    assertEquals(doctrineBlockFor(loaded), NO_COACH_METHOD_BLOCK, label);
    // No half-loaded state ever escapes.
    assertEquals(loaded.compiled?.text ?? null, null, label);
  }
});

Deno.test("a published-but-EMPTY doctrine is not reported as loaded", async () => {
  // A real state: the coach clicked publish on a blank form. Reporting it as
  // 'loaded' would inject an empty block, which is the one thing the fallback
  // exists to prevent.
  const { db } = fakeDb({
    coach_clients: { data: { coach_id: "coach-1" } },
    coach_doctrines: {
      data: { ...DOCTRINE_ROW, beliefs: [], forbidden: [], voice: {} },
    },
  });
  const loaded = await loadPublishedDoctrine(db, "student-1");
  assertEquals(loaded.reason, "empty_doctrine");
  assertEquals(doctrineBlockFor(loaded), NO_COACH_METHOD_BLOCK);
});

Deno.test("an empty student id never reaches the database", async () => {
  const { db, calls } = fakeDb({ coach_clients: { data: { coach_id: "c" } } });
  const loaded = await loadPublishedDoctrine(db, "   ");
  assertEquals(loaded.reason, "no_coach");
  assertEquals(calls, []);
});

Deno.test("malformed doctrine entries are dropped AND reported", async () => {
  // The issues are the coach's feedback loop: a rule that could not be
  // enforced must be visible to the person who wrote it.
  const { db } = fakeDb({
    coach_clients: { data: { coach_id: "coach-1" } },
    coach_doctrines: {
      data: {
        ...DOCTRINE_ROW,
        forbidden: [{ token: "" }, { token: "keto" }],
      },
    },
  });
  const loaded = await loadPublishedDoctrine(db, "student-1");
  assertEquals(loaded.doctrine?.forbidden.length, 1);
  assert(loaded.issues.some((i) => i.includes("unenforceable")));
});

// ===========================================================================
// LA SÉLECTION DE VARIANTE — lot doctrine-by-goal
//
// Elle est DANS le chargeur et pas chez l'appelant, pour une raison que ce
// dépôt a déjà payée: « la doctrine ne gouvernait qu'une lane sur trois ». Un
// objectif passé en argument est un objectif qu'un quatrième consommateur
// oubliera. Ces tests tiennent l'invariant côté chargeur, donc pour tous.
// ===========================================================================

const SCOPED_ROW = {
  ...DOCTRINE_ROW,
  beliefs: [
    { claim: "Protein at every meal." },
    { claim: "Do not panic over a plateau.", goal_scope: ["fat_loss"] },
  ],
};

Deno.test("le chargeur lit l'objectif de l'élève et sert SA variante", async () => {
  const { db } = fakeDb({
    coach_clients: { data: { coach_id: "coach-1" } },
    coach_doctrines: { data: SCOPED_ROW },
    student_goals: { data: { goal: "fat_loss" } },
  });
  const loaded = await loadPublishedDoctrine(db, "student-1");
  assertEquals(loaded.goal, "fat_loss");
  assertEquals(loaded.goalSource, "student_goals");
  assert(doctrineBlockFor(loaded).includes("Do not panic over a plateau."));
});

Deno.test("deux élèves du MÊME coach dans le même intervalle reçoivent deux blocs", async () => {
  // L'épreuve du §7.2: aucun état ne survit d'un chargement à l'autre. Le
  // chargeur est sans mémoire, et c'est ce qui rend deux tours concurrents
  // indépendants.
  const doctrines = { coach_clients: { data: { coach_id: "coach-1" } }, coach_doctrines: { data: SCOPED_ROW } };
  const [a, b] = await Promise.all([
    loadPublishedDoctrine(fakeDb({ ...doctrines, student_goals: { data: { goal: "fat_loss" } } }).db, "s-a"),
    loadPublishedDoctrine(fakeDb({ ...doctrines, student_goals: { data: { goal: "maintenance" } } }).db, "s-b"),
  ]);
  assertEquals(a.goal, "fat_loss");
  assertEquals(b.goal, "maintenance");
  assert(doctrineBlockFor(a).includes("Do not panic"));
  assert(!doctrineBlockFor(b).includes("Do not panic"));
  // La voix, elle, est la même — c'est le même coach.
  assert(doctrineBlockFor(a).includes("Protein at every meal."));
  assert(doctrineBlockFor(b).includes("Protein at every meal."));
});

Deno.test("un élève SANS student_goals reçoit la variante default, jamais une ciblée", async () => {
  const { db } = fakeDb({
    coach_clients: { data: { coach_id: "coach-1" } },
    coach_doctrines: { data: SCOPED_ROW },
    student_goals: { data: null },
  });
  const loaded = await loadPublishedDoctrine(db, "student-1");
  assertEquals(loaded.goal, null);
  assertEquals(loaded.goalSource, "none");
  assert(doctrineBlockFor(loaded).includes("Protein at every meal."));
  assert(!doctrineBlockFor(loaded).includes("Do not panic"));
});

Deno.test("un objectif ILLISIBLE dégrade vers la default et n'interrompt pas le tour", async () => {
  for (const outcome of [{ throws: true }, { error: { message: "boom" } }, { data: { goal: "bulking" } }]) {
    const { db } = fakeDb({
      coach_clients: { data: { coach_id: "coach-1" } },
      coach_doctrines: { data: SCOPED_ROW },
      student_goals: outcome,
    });
    const loaded = await loadPublishedDoctrine(db, "student-1");
    // Le tour continue: la doctrine est bien chargée.
    assertEquals(loaded.reason, "loaded");
    assertEquals(loaded.goal, null);
    assertEquals(loaded.goalSource, "none");
    // Direction sûre: on perd les croyances ciblées, on n'en sert jamais une
    // qui ne vise pas cet élève.
    assert(!doctrineBlockFor(loaded).includes("Do not panic"));
  }
});

Deno.test("le mode test du coach choisit la variante, et ça se voit dans la trace", async () => {
  const tables = {
    coach_clients: { data: { coach_id: "coach-1" } },
    coach_doctrines: { data: SCOPED_ROW },
    // Volontairement contradictoire avec l'override: c'est le coach qui décide.
    student_goals: { data: { goal: "health" } },
  };
  const chosen = await loadPublishedDoctrine(fakeDb(tables).db, "student-1", {
    goalOverride: "fat_loss",
  });
  assertEquals(chosen.goal, "fat_loss");
  assertEquals(chosen.goalSource, "override");
  assert(doctrineBlockFor(chosen).includes("Do not panic"));

  // Et « default » est une variante qu'il peut demander explicitement.
  const asDefault = await loadPublishedDoctrine(fakeDb(tables).db, "student-1", {
    goalOverride: null,
  });
  assertEquals(asDefault.goal, null);
  assertEquals(asDefault.goalSource, "none");
  assert(!doctrineBlockFor(asDefault).includes("Do not panic"));
});

Deno.test("l'override n'existe QUE s'il est passé — l'oublier donne le comportement correct", async () => {
  // Une option dont l'omission désarme quelque chose est une option qui
  // désarme. Ici l'omission = le chemin normal.
  const { db } = fakeDb({
    coach_clients: { data: { coach_id: "coach-1" } },
    coach_doctrines: { data: SCOPED_ROW },
    student_goals: { data: { goal: "fat_loss" } },
  });
  const loaded = await loadPublishedDoctrine(db, "student-1", {});
  assertEquals(loaded.goalSource, "student_goals");
  assertEquals(loaded.goal, "fat_loss");
});

Deno.test("une doctrine entièrement ciblée ailleurs ne dit PAS qu'elle n'a pas pu être lue", async () => {
  const { db } = fakeDb({
    coach_clients: { data: { coach_id: "coach-1" } },
    coach_doctrines: {
      data: {
        ...DOCTRINE_ROW,
        beliefs: [{ claim: "Only for fat loss.", goal_scope: ["fat_loss"] }],
        forbidden: [],
        vocabulary: [],
        arbitrations: [],
        voice: {},
      },
    },
    student_goals: { data: { goal: "health" } },
  });
  const loaded = await loadPublishedDoctrine(db, "student-1");
  assertEquals(loaded.reason, "empty_for_goal");
  const block = doctrineBlockFor(loaded);
  assertEquals(block, NO_DOCTRINE_FOR_THIS_GOAL_BLOCK);
  // La phrase qui compte: on ne dit pas au modèle une cause fausse, parce
  // qu'il la répète mot pour mot à l'élève.
  assert(!block.includes("has not published"));
  // Et comme l'autre repli, celui-ci RÉPOND. Une doctrine qui vise d'autres
  // objectifs ne rend pas la question de l'élève sans réponse.
  assert(block.includes("ANSWER THE QUESTION"));
  assert(block.includes("Speak in your own name"));
});

Deno.test("les croyances RENDUES aux générateurs sont exactement celles du bloc", async () => {
  // Le trou que ça ferme: `generate-week-plan-v1` et `generate-meal-v1` ne
  // lisent pas le bloc, ils lisent la LISTE de convictions pour tracer chaque
  // ligne produite. Une liste non filtrée bâtirait le plan d'un élève `health`
  // sur une conviction écrite pour `fat_loss`.
  const tables = { coach_clients: { data: { coach_id: "coach-1" } }, coach_doctrines: { data: SCOPED_ROW } };

  const fatLoss = await loadPublishedDoctrine(
    fakeDb({ ...tables, student_goals: { data: { goal: "fat_loss" } } }).db,
    "s",
  );
  assertEquals(doctrineBeliefsFor(fatLoss).map((b) => b.claim), [
    "Protein at every meal.",
    "Do not panic over a plateau.",
  ]);

  const health = await loadPublishedDoctrine(
    fakeDb({ ...tables, student_goals: { data: { goal: "health" } } }).db,
    "s",
  );
  assertEquals(doctrineBeliefsFor(health).map((b) => b.claim), ["Protein at every meal."]);
  // La doctrine PARSÉE, elle, reste entière — c'est elle qui arme le verrou.
  assertEquals(health.doctrine?.beliefs.length, 2);

  // Toute lecture ratée rend une liste vide: un générateur ne peut pas citer
  // une conviction dont on n'a pas su lire la doctrine.
  const failed = await loadPublishedDoctrine(fakeDb({ coach_clients: { throws: true } }).db, "s");
  assertEquals(doctrineBeliefsFor(failed), []);
});

Deno.test("un changement d'objectif entre deux tours change le bloc, pas la mémoire", async () => {
  // §3.4: la variante servie change au tour suivant. Rien dans le chargeur ne
  // touche à la conversation — il rend un bloc, et c'est tout ce qu'il rend.
  const tables = { coach_clients: { data: { coach_id: "coach-1" } }, coach_doctrines: { data: SCOPED_ROW } };
  const turn1 = await loadPublishedDoctrine(
    fakeDb({ ...tables, student_goals: { data: { goal: "fat_loss" } } }).db,
    "student-1",
  );
  const turn2 = await loadPublishedDoctrine(
    fakeDb({ ...tables, student_goals: { data: { goal: "maintenance" } } }).db,
    "student-1",
  );
  assertEquals(turn1.goal, "fat_loss");
  assertEquals(turn2.goal, "maintenance");
  assert(turn1.compiled!.hash !== turn2.compiled!.hash, "la clé de cache doit suivre la variante");
  assertEquals(Object.keys(turn2).sort(), Object.keys(turn1).sort());
});
