// KEEL W3.3 — student safety constraints: every-turn load OUTSIDE the memory
// path, and the deterministic medical validator.
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  assertNoMedicalConstraintViolation,
  findMedicalConstraintViolations,
  loadStudentSafetyConstraints,
  medicalConstraintTokens,
  safetyConstraintsPromptBlock,
  MedicalConstraintViolationError,
  SafetyConstraintsLoadError,
  type StudentSafetyConstraint,
} from "./safety_constraints.ts";

function constraint(
  patch: Partial<StudentSafetyConstraint> = {},
): StudentSafetyConstraint {
  return {
    id: "c1",
    userId: "u1",
    kind: "allergy",
    allergenRef: "peanut",
    substanceRef: null,
    medicationClass: null,
    conditionRef: null,
    dietRef: null,
    severity: "medical",
    declaredBy: "student",
    notes: null,
    contentLocale: "en",
    ...patch,
  };
}

// ---------------------------------------------------------------------------
// Loading — every turn, no cache, no memory
// ---------------------------------------------------------------------------

// La forme que `SafetyConstraintsQuery` promet. Recopiée ici plutôt
// qu'importée: `StudentSafetyConstraintRow` n'est pas exporté, et l'exporter
// pour un test élargirait la surface publique d'un module de sécurité.
type SettledRow = {
  id: string;
  user_id: string;
  kind: string;
  allergen_ref: string | null;
  substance_ref: string | null;
  medication_class: string | null;
  condition_ref: string | null;
  diet_ref: string | null;
  severity: string;
  declared_by: string;
  notes: string | null;
  content_locale: string;
};
type Settled = { data: SettledRow[] | null; error: unknown };

function fakeDb(outcome: {
  rows?: Record<string, unknown>[] | null;
  error?: unknown;
  throws?: boolean;
}) {
  const calls: Array<{ table: string; userId: string }> = [];
  // Le faux client est CHAÎNABLE depuis que le loader filtre aussi sur
  // `status='active'` (migration 20260803160000: une rétractation invalide,
  // elle ne supprime pas). Un `eq` qui rendait directement une promesse
  // décrivait une requête à un seul filtre — c'est-à-dire plus la requête de
  // production. `filters` capture la chaîne pour que le test puisse l'asserter
  // plutôt que de faire confiance.
  const filters: Array<[string, string]> = [];
  const settle = () => {
    if (outcome.throws) throw new Error("connection reset");
    return Promise.resolve({
      data: (outcome.rows ?? null) as never,
      error: outcome.error ?? null,
    });
  };
  const query = {
    eq(column: string, value: string) {
      filters.push([column, value]);
      if (column === "user_id") calls.push({ table: currentTable, userId: value });
      return query;
    },
    // La signature est GÉNÉRIQUE, et pas `(resolve: unknown, reject: unknown)`:
    // `PromiseLike<T>.then` l'est, donc un faux qui ne l'est pas ne satisfait
    // pas `SafetyConstraintsDb` — 8 erreurs TS2345 qui empêchaient toute la
    // suite `_shared/keel/` de tourner (elle échouait au typecheck avant
    // d'exécuter un seul test).
    then<TResult1 = Settled, TResult2 = never>(
      resolve?:
        | ((value: Settled) => TResult1 | PromiseLike<TResult1>)
        | null,
      reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      let promise: Promise<Settled>;
      try {
        promise = settle();
      } catch (error) {
        promise = Promise.reject(error);
      }
      return promise.then(resolve, reject);
    },
  };
  let currentTable = "";
  const db = {
    from(table: string) {
      currentTable = table;
      return { select(_columns: string) { return query; } };
    },
  };
  return { db, calls, filters };
}

const ROW = {
  id: "c9",
  user_id: "u1",
  kind: "allergy",
  allergen_ref: "peanut",
  substance_ref: null,
  medication_class: null,
  condition_ref: null,
  diet_ref: null,
  severity: "medical",
  declared_by: "student",
  notes: "anaphylaxis",
  content_locale: "en",
};

Deno.test("loadStudentSafetyConstraints — reads the constraints table, mapped", async () => {
  const { db, calls } = fakeDb({ rows: [ROW] });
  const rows = await loadStudentSafetyConstraints(db, "u1");
  assertEquals(calls, [{ table: "student_safety_constraints", userId: "u1" }]);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].allergenRef, "peanut");
  assertEquals(rows[0].severity, "medical");
});

Deno.test("loadStudentSafetyConstraints — NO cache: every turn hits the table", async () => {
  // The whole point of this module: an allergy declared at 14:02 protects at
  // 14:03. A memoized loader would reintroduce exactly the staleness the
  // memory path has.
  const { db, calls } = fakeDb({ rows: [ROW] });
  await loadStudentSafetyConstraints(db, "u1");
  await loadStudentSafetyConstraints(db, "u1");
  await loadStudentSafetyConstraints(db, "u1");
  assertEquals(calls.length, 3);
});

Deno.test("loadStudentSafetyConstraints — a query error THROWS, never 'no allergies'", async () => {
  await assertRejects(
    () => loadStudentSafetyConstraints(fakeDb({ error: { message: "boom" } }).db, "u1"),
    SafetyConstraintsLoadError,
  );
  await assertRejects(
    () => loadStudentSafetyConstraints(fakeDb({ throws: true }).db, "u1"),
    SafetyConstraintsLoadError,
  );
  await assertRejects(
    () => loadStudentSafetyConstraints(fakeDb({ rows: [] }).db, ""),
    SafetyConstraintsLoadError,
  );
});

Deno.test("loadStudentSafetyConstraints — an empty set is a legitimate answer", async () => {
  const rows = await loadStudentSafetyConstraints(fakeDb({ rows: [] }).db, "u1");
  assertEquals(rows, []);
});

Deno.test("safety constraints are loaded OUTSIDE the LLM memory path", async () => {
  // Structural, not aspirational: this module must not reach the memorizer,
  // the embedding runtime, or anything that produces 'candidate' items.
  //
  // This assertion used to be "zero imports", which was the correct enforcement
  // while the module had no dependencies. It now has exactly one -- the shared
  // token matcher, extracted so that the coach-doctrine lock could not become a
  // second, divergent copy of these matching rules (see forbidden_matcher.ts).
  //
  // "Zero imports" is therefore replaced by the invariant it was standing in
  // for, checked TRANSITIVELY: every module reachable from this one is on a
  // closed allowlist, is itself import-free, and none of them names the memory
  // path. That is strictly stronger than the original -- the original only ever
  // looked at one file, and would have said nothing about what a dependency
  // dragged in.
  // La liste s'allonge d'UNE entrée: `allergen_surface_forms.ts`, la table
  // plate qui dit comment un allergène s'ÉCRIT (« nut butter », « satay »,
  // « PB »). Elle a été ajoutée parce que la ceinture ne matchait que le slug
  // nu et laissait donc sortir « the nut butter option » sur un élève
  // anaphylactique.
  //
  // Ce que cette assertion protège n'est pas « zéro dépendance », c'est « rien
  // sur le chemin mémoire ». Le module ajouté est une constante pure: aucun
  // import, aucune I/O, aucune horloge — la boucle transitive ci-dessous le
  // vérifie elle-même plutôt que de me croire sur parole.
  const ALLOWED_DEPS = [
    "./forbidden_matcher.ts",
    "./allergen_surface_forms.ts",
  ];

  const readImports = async (file: string): Promise<[string, string[]]> => {
    const source = await Deno.readTextFile(new URL(file, import.meta.url));
    return [source, [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1])];
  };

  const [rootSource, rootImports] = await readImports("./safety_constraints.ts");
  assertEquals(
    rootImports,
    ALLOWED_DEPS,
    "this module may only import the shared token matcher",
  );

  const sources: Array<[string, string]> = [["safety_constraints.ts", rootSource]];
  for (const dep of ALLOWED_DEPS) {
    const [depSource, depImports] = await readImports(dep);
    assertEquals(depImports, [], `${dep} must itself have zero imports`);
    sources.push([dep, depSource]);
  }

  for (const [name, source] of sources) {
    for (const forbidden of ["memory", "memorizer", "embedding", "pgvector"]) {
      assertEquals(
        source.toLowerCase().includes(`/${forbidden}`),
        false,
        `${name} must not reference the ${forbidden} path`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Deterministic medical validator
// ---------------------------------------------------------------------------

Deno.test("medicalConstraintTokens — only severity='medical', identifiers only", () => {
  const tokens = medicalConstraintTokens([
    constraint({ id: "a", allergenRef: "peanut" }),
    constraint({ id: "b", allergenRef: "shellfish", severity: "strict" }),
    constraint({
      id: "c",
      allergenRef: null,
      substanceRef: "st_johns_wort",
      medicationClass: "ssri",
    conditionRef: null,
    dietRef: null,
      notes: "gluten is fine actually",
    }),
  ]);
  assertEquals(tokens.sort(), ["peanut", "ssri", "st_johns_wort"]);
});

Deno.test("assertNoMedicalConstraintViolation — rejects a medical token", () => {
  const error = assertThrows(
    () =>
      assertNoMedicalConstraintViolation(
        "Add a spoon of peanut butter to your morning oats.",
        [constraint()],
      ),
    MedicalConstraintViolationError,
  ) as MedicalConstraintViolationError;
  assertEquals(error.violations.length, 1);
  assertEquals(error.violations[0].token, "peanut");
  assertEquals(error.violations[0].constraintId, "c1");
});

Deno.test("assertNoMedicalConstraintViolation — non-medical severities pass through", () => {
  assertNoMedicalConstraintViolation("Some peanut butter.", [
    constraint({ severity: "strict" }),
    constraint({ severity: "preference" }),
  ]);
});

Deno.test("validator — slug shapes: multiword, plural, hyphen, accents", () => {
  const c = constraint({ allergenRef: "tree_nut" });
  for (const text of ["tree nuts on top", "a TREE-NUT crumble", "tree_nut mix"]) {
    assertEquals(findMedicalConstraintViolations(text, [c]).length, 1, text);
  }
  const substance = constraint({
    allergenRef: null,
    substanceRef: "vitamin_d3",
  });
  assertEquals(
    findMedicalConstraintViolations("take vitamin d3 at breakfast", [substance])
      .length,
    1,
  );
  // Diacritics in the generated text do not hide a token.
  const proteine = constraint({ allergenRef: "proteine" });
  assertEquals(
    findMedicalConstraintViolations("ajoute de la proteine", [proteine]).length,
    1,
  );
});

Deno.test("validator — does not match inside an unrelated word", () => {
  const c = constraint({ allergenRef: "soy" });
  assertEquals(findMedicalConstraintViolations("soylent green", [c]).length, 0);
  assertEquals(findMedicalConstraintViolations("add soy sauce", [c]).length, 1);
});

Deno.test("validator — negated mentions are safe (the coeliac plan case)", () => {
  const gluten = constraint({ allergenRef: "gluten", kind: "medical" });
  const safe = [
    "gluten-free bread at breakfast",
    "choose a gluten free option",
    "no gluten this week",
    "without gluten",
    "avoid gluten entirely",
    "sans gluten",
    "pas de gluten ce soir",
    "you have a gluten allergy, so we skip it",
    "instead of gluten, use rice",
  ];
  for (const text of safe) {
    assertEquals(findMedicalConstraintViolations(text, [gluten]), [], text);
  }
  const unsafe = [
    "add gluten to the mix",
    "a slice of gluten bread",
    "try seitan, it is pure gluten",
  ];
  for (const text of unsafe) {
    assertEquals(
      findMedicalConstraintViolations(text, [gluten]).length > 0,
      true,
      text,
    );
  }
});

Deno.test("validator — audit mode: allowNegatedMentions=false rejects everything", () => {
  const gluten = constraint({ allergenRef: "gluten" });
  assertEquals(
    findMedicalConstraintViolations("gluten-free bread", [gluten], {
      allowNegatedMentions: false,
    }).length,
    1,
  );
});

Deno.test("validator — empty text and empty constraints are no-ops", () => {
  assertEquals(findMedicalConstraintViolations("", [constraint()]), []);
  assertEquals(findMedicalConstraintViolations("anything", []), []);
});

Deno.test("validator — reports every occurrence, from every constraint", () => {
  const violations = findMedicalConstraintViolations(
    "peanut sauce, then more peanut, plus shellfish",
    [
      constraint({ id: "a", allergenRef: "peanut" }),
      constraint({ id: "b", allergenRef: "shellfish" }),
    ],
  );
  assertEquals(violations.length, 3);
  assertEquals(violations.map((v) => v.constraintId).sort(), ["a", "a", "b"]);
});

Deno.test("validator — French determiners after a negation are safe (regression)", () => {
  // FOUND WHILE BUILDING THE COACH-DOCTRINE LOCK, and it was live here first.
  // The shared negation list stopped at `de`/`du`/`des`/`d'`, so the commonest
  // French determiners were missing and these sentences were all REJECTED:
  // a validator that rejects "évite les cacahuètes" is a validator that gets
  // switched off. Fixed once in forbidden_matcher.ts, which is why the fix
  // reaches this lock without anyone porting it.
  for (const safe of [
    "Évite les cacahuètes dans ce plat.",
    "Supprime le beurre de cacahuète du petit-déjeuner.",
    "On ne met jamais la cacahuète dans cette recette.",
    "Remplace les cacahuètes par des graines de courge.",
    "Avoid your peanut butter here.",
  ]) {
    assertEquals(
      findMedicalConstraintViolations(safe, [constraint()]).length,
      0,
      safe,
    );
  }

  // And the endorsement is still caught — the fix widened the negation list,
  // it did not open the gate.
  assertEquals(
    findMedicalConstraintViolations(
      "Ajoute des cacahuètes sur ton yaourt.",
      [constraint({ allergenRef: "cacahuete" })],
    ).length,
    1,
  );
});

Deno.test("adding 'cook with' to the negation list did NOT open the medical gate", () => {
  // Le verrou médical PARTAGE son moteur avec le verrou doctrine
  // (`forbidden_matcher.ts`). Quand la liste de négation s'est élargie pour que
  // l'agent puisse dire « ton coach ne cuisine pas avec X » — la phrase que la
  // liste d'ALIMENTS déconseillés rend courante — l'allergie a hérité du même
  // élargissement sans que personne l'ait demandé.
  //
  // C'est exactement la raison d'être du module partagé, et exactement son
  // risque. Ce test est le prix de ce partage: il épingle que la suggestion
  // reste bloquée des deux côtés de la nouvelle construction.
  const peanut = [constraint()];

  // La SUGGESTION mord toujours, avec le nouveau verbe et la nouvelle préposition.
  assertEquals(
    findMedicalConstraintViolations("Cook with peanut oil, it is great.", peanut).length,
    1,
  );
  // Et quand la négation porte sur AUTRE CHOSE, l'allergène reste attrapé:
  // la course négation→token est interrompue par « butter, so use ».
  assertEquals(
    findMedicalConstraintViolations(
      "I can't cook with butter, so use peanut oil.",
      peanut,
    ).length,
    1,
  );
  // Le désarmement légitime, lui, fonctionne.
  assertEquals(
    findMedicalConstraintViolations("Your coach doesn't cook with peanuts.", peanut).length,
    0,
  );
});

// ---------------------------------------------------------------------------
// QA agent 4 (2026-08-03) — LES FORMES DE SURFACE.
//
// Le défaut mesuré en run réel: élève `allergen_ref='peanut'`
// `severity='medical'` en base, et l'agent répond « the nut butter option is
// the stronger bag snack than plain nuts ». Message PARTI, `reason: "clean"`.
// La ceinture ne matchait que le slug nu.
// ---------------------------------------------------------------------------

Deno.test("validator — un allergène nommé AUTREMENT que par son slug mord", () => {
  const peanut = [constraint()];
  // La phrase RÉELLEMENT sortie en production le 05/08.
  assertEquals(
    findMedicalConstraintViolations(
      "If you're choosing between what you mentioned, the nut butter option " +
        "is the stronger bag snack than plain nuts.",
      peanut,
    ).length >= 1,
    true,
    "la sortie réelle du 05/08 doit être rejetée",
  );
  for (
    const dangerous of [
      "Nut butter on toast is a solid afternoon snack.",
      "Try PB on rice cakes.",
      "Groundnut paste is a good protein source.",
      "Satay sauce over chicken is a good option.",
      "A handful of groundnuts will do.",
    ]
  ) {
    assertEquals(
      findMedicalConstraintViolations(dangerous, peanut).length >= 1,
      true,
      dangerous,
    );
  }
});

Deno.test("validator — un slug hors table garde EXACTEMENT son comportement d'avant", () => {
  // `surfaceFormsFor` rend [] et non null: l'ajout des formes de surface ne
  // peut pas RÉDUIRE la couverture d'une contrainte qu'il ne connaît pas.
  const exotic = [constraint({ allergenRef: "lupin" })];
  assertEquals(
    findMedicalConstraintViolations("Lupin flour is fine here.", exotic).length,
    1,
  );
  assertEquals(
    findMedicalConstraintViolations("Avoid lupin flour.", exotic).length,
    0,
  );
});

Deno.test("validator — RETIRER ou SUBSTITUER un allergène reste licite (EN et FR)", () => {
  // Trou LIVE avant le 03/08, et il était anglais: la liste de négation avait
  // `supprime`/`remplace` mais ni `remove` ni `replace` ni `swap`. Ce sont les
  // phrases les plus normales d'un agent de nutrition — le vocabulaire même de
  // `autonomy='swap_within_policy'` — et chacune faisait remplacer le message
  // entier par le repli médical.
  const peanut = [constraint()];
  for (
    const safe of [
      "Replace the peanuts with pumpkin seeds.",
      "Remove the peanut butter from breakfast.",
      "Swap the peanuts for pumpkin seeds.",
      "Leave out the peanuts.",
      "Cut out the peanut butter.",
      // FR: la forme longue est blanchie par « supprime le », et la forme
      // courte imbriquée dedans doit l'être aussi — c'est la MÊME mention.
      "Supprime le beurre de cacahuète du petit-déjeuner.",
      "Remplace les cacahuètes par des graines de courge.",
    ]
  ) {
    assertEquals(
      findMedicalConstraintViolations(safe, peanut).length,
      0,
      safe,
    );
  }
  // Et la recommandation mord toujours: le blanchiment est étroit.
  assertEquals(
    findMedicalConstraintViolations("Replace the eggs, and add peanut butter.", peanut)
      .length,
    1,
    "une négation qui porte sur autre chose ne blanchit pas l'allergène",
  );
});

Deno.test("le bloc de prompt porte les contraintes, et autorise à les nommer pour les éviter", () => {
  const block = safetyConstraintsPromptBlock([
    constraint(),
    constraint({ id: "c2", allergenRef: "sesame", severity: "strict", kind: "intolerance" }),
  ]);
  assertEquals(typeof block, "string");
  const text = String(block);
  assertEquals(text.includes("peanut"), true);
  assertEquals(text.includes("sesame"), true);
  assertEquals(text.includes("severity=medical"), true);
  // La carve-out: sans elle, un modèle prudent refuse de répondre à « est-ce
  // que ce plat contient des arachides ? », qui est la question qu'un élève
  // allergique a le droit de poser. Elle doit rester alignée sur la condition
  // de désarmement `disarmed_negated_mention` de la ceinture.
  assertEquals(text.includes("MAY name them"), true);
});

Deno.test("le bloc de prompt distingue « rien à dire » de « lecture en panne »", () => {
  // `null` (panne) et `[]` (aucune contrainte) rendent tous deux `null`: on
  // n'écrit JAMAIS « cet élève n'a aucune contrainte » dans un prompt, parce
  // qu'on ne peut pas le prouver depuis une lecture ratée. Un bloc absent est
  // muet; un bloc qui affirme l'absence serait un mensonge.
  assertEquals(safetyConstraintsPromptBlock(null), null);
  assertEquals(safetyConstraintsPromptBlock([]), null);
  // Une contrainte sans aucun identifiant ne produit pas de ligne vide.
  assertEquals(
    safetyConstraintsPromptBlock([
      constraint({
        allergenRef: null,
        substanceRef: null,
        medicationClass: null,
        conditionRef: null,
        dietRef: null,
      }),
    ]),
    null,
  );
});
