// PIVOT NUTRITION §3.3 — the output belt, tested AT THE RUNTIME SEAM.
//
// Why this file exists separately from keel_output_locks_test.ts: that one
// proves the belt WORKS. This one proves the belt is actually REACHED by the
// function every visible message passes through. The defect being fixed was
// never a broken validator — it was a correct validator wired into one skill
// out of N, while the contract stated the guarantee globally. A module test
// alone would not have caught that, and would not catch its return.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  finalVisibleText,
  type KeelTurnContext,
  withKeelDoctrineBlock,
} from "./run.ts";
import {
  DOCTRINE_BLOCK_FALLBACK_EN,
  MEDICAL_BLOCK_FALLBACK_EN,
} from "../skills/_shared/keel_output_locks.ts";
import { NO_COACH_METHOD_BLOCK } from "../../_shared/keel/doctrine_loader.ts";
import { compileDoctrineBlock } from "../../_shared/keel/doctrine.ts";
import { compileProtocol } from "../../_shared/keel/protocol_compiler.ts";

function keel(over: Partial<KeelTurnContext> = {}): KeelTurnContext {
  return {
    role: "student",
    is_student: true,
    country: "FR",
    content_locale: "fr-FR",
    local_date: "2026-08-03",
    plan_context: null,
    plan_version_id: null,
    plan_block: null,
    plan_context_reason_code: "keel_student_plan_context",
    restriction: null,
    restriction_unavailable_reason: null,
    declared_medical_condition: null,
    safety_constraints: [
      {
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
      },
    ],
    safety_constraints_unavailable_reason: null,
    doctrine: null,
    // FF-016 — absent par défaut: le bloc mapping ne doit rien pousser chez un
    // élève dont le coach n'a pas publié de protocole.
    protocol: null,
    coach_note: null,
    week_review: null,
    ...over,
  };
}

const DOCTRINE_CTX = keel({
  safety_constraints: [],
  doctrine: {
    doctrine: {
      coachId: "coach-1",
      version: 1,
      coachDisplayName: "Marc",
      beliefs: [],
      forbidden: [
        { token: "six_small_meals", surfaceForms: ["6 petits repas"], reason: null },
      ],
      vocabulary: [],
      arbitrations: [],
      voice: {},
      // `foods` est devenu un champ REQUIS de `CoachDoctrine` (aliments
      // recommandés / déconseillés, vérifiés par le même verrou que les
      // interdits). Cette fixture ne l'avait pas et `compileDoctrineBlock`
      // levait sur `doctrine.foods.recommended`.
      foods: { discouraged: [] },
      qa: [],
      contentLocale: "fr-FR",
    },
    compiled: null,
    coachId: "coach-1",
    coachDisplayName: "Marc",
    reason: "loaded",
    issues: [],
    goal: null,
    goalSource: "none",
  },
});

Deno.test("the medical lock is reached on the GENERAL reply path", () => {
  // Before this wiring, only skills/plan_question ran this check. Any other
  // route — normal reply, meal photo ack, proactive — delivered untouched.
  const out = finalVisibleText(
    "Add a spoon of peanut butter to your oats.",
    null,
    null,
    "what should I eat",
    [],
    keel(),
  );
  assertEquals(out, MEDICAL_BLOCK_FALLBACK_EN);
});

Deno.test("the doctrine lock is reached on the GENERAL reply path", () => {
  const out = finalVisibleText(
    "Essaie 6 petits repas dans la journée.",
    null,
    null,
    "j'ai faim tout le temps",
    [],
    DOCTRINE_CTX,
  );
  assertEquals(out, DOCTRINE_BLOCK_FALLBACK_EN);
});

Deno.test("the belt runs on a SAFETY route too", () => {
  // A crisis turn is the last place to suggest a medical allergen, so the belt
  // sits OUTSIDE the `if (!isSafetyRoute(...))` block that skips the cosmetic
  // guards.
  const out = finalVisibleText(
    "Have some peanut butter, it will help.",
    { response_owner: "safety_crisis" } as never,
    null,
    "je vais mal",
    [],
    keel(),
  );
  assertEquals(out, MEDICAL_BLOCK_FALLBACK_EN);
});

Deno.test("a legitimate message is untouched by the belt", () => {
  const out = finalVisibleText(
    "Nice plate - that is what your coach asks for this week.",
    null,
    null,
    "voilà mon dej",
    [],
    keel(),
  );
  assert(out.includes("Nice plate"));
});

Deno.test("a non-KEEL turn is not touched at all", () => {
  const out = finalVisibleText(
    "Add a spoon of peanut butter to your oats.",
    null,
    null,
    "hello",
    [],
    keel({ is_student: false, role: null, safety_constraints: null }),
  );
  assert(out.includes("peanut butter"));
});

// ---------------------------------------------------------------------------
// THE OTHER HALF OF THE DOUBLE LOCK: the doctrine must actually reach the
// composer. Without it the belt is a bouncer in front of an empty room -- it
// stops the agent contradicting the coach, it does not make it speak like him.
// ---------------------------------------------------------------------------

Deno.test("the doctrine block is injected AT THE HEAD of the composer context", () => {
  const doctrine = DOCTRINE_CTX.doctrine!.doctrine!;
  const compiled = compileDoctrineBlock(doctrine, null);
  const ctx = withKeelDoctrineBlock("=== PLAN ===\nweek 2", {
    ...DOCTRINE_CTX,
    doctrine: { ...DOCTRINE_CTX.doctrine!, compiled },
  });
  assert(ctx.includes("six_small_meals"));
  // AT THE HEAD: the prompt budget truncates by the TAIL, so a doctrine
  // appended at the end vanishes silently on exactly the richest turns.
  assert(
    ctx.indexOf("MARC'S METHOD") < ctx.indexOf("=== PLAN ==="),
    "the doctrine must precede the plan, or truncation eats it first",
  );
});

Deno.test("no doctrine loaded -> the NO-METHOD block, never an empty layer", () => {
  // The layer is still injected, but for the opposite reason it used to be. The
  // model IS meant to answer from its own nutrition knowledge here; what the
  // block adds is the frame — answer in your own name, never in the coach's.
  const ctx = withKeelDoctrineBlock("=== PLAN ===", {
    ...DOCTRINE_CTX,
    doctrine: {
      doctrine: null,
      compiled: null,
      coachId: null,
      // Pas de doctrine publiee ⇒ pas de nom de coach a poser. `null` est la
      // valeur utile: un coach sans nom affiche ne se signe pas.
      coachDisplayName: null,
      reason: "no_published_doctrine",
      issues: [],
      goal: null,
      goalSource: "none",
    },
  });
  assert(ctx.includes(NO_COACH_METHOD_BLOCK));
  assert(ctx.includes("ANSWER THE QUESTION"));
});

// ---------------------------------------------------------------------------
// FF-016 — LES ALIMENTS RECOMMANDÉS DU COACH, et leur RANG.
//
// `protocolFoodBlock` avait deux appelants, les deux générateurs de repas, et
// zéro dans `sophia-brain`: le chat connaissait les interdits du coach et
// jamais ses encouragés. Ces trois tests tiennent le branchement ET sa place
// dans l'ordre de survie — le budget tronque par la queue, donc le rang EST la
// garantie.
// ---------------------------------------------------------------------------

const PROTOCOL_LOADED = {
  compiled: compileProtocol(
    {
      coachId: "coach-1",
      contentLocale: "en-GB",
      foodRules: [
        {
          food_group_ref: "eggs" as const,
          stance: "encouraged" as const,
          goal_scope: [],
          rationale: "cheapest complete protein",
        },
      ],
      timingRules: [],
      terms: [],
    },
    null,
  ),
  coachId: "coach-1",
  protocolId: "p-1",
  reason: "loaded" as const,
  goal: null,
};

Deno.test("FF-016: le mapping alimentaire du coach atteint le composeur", () => {
  const compiled = compileDoctrineBlock(DOCTRINE_CTX.doctrine!.doctrine!, null);
  const ctx = withKeelDoctrineBlock("=== PLAN ===", {
    ...DOCTRINE_CTX,
    doctrine: { ...DOCTRINE_CTX.doctrine!, compiled },
    protocol: PROTOCOL_LOADED,
  });
  assert(ctx.includes("REACH FOR THESE FIRST"), "le bloc mapping n'est pas injecté");
  assert(ctx.includes("eggs"), "l'aliment encouragé du coach n'atteint pas le tour");
  // LE NOM VIENT DE LA DOCTRINE, pas d'une seconde lecture de `coaches`: deux
  // sources pour le même nom, c'est un prompt qui nomme la même personne de
  // deux façons dans deux blocs voisins.
  assert(ctx.includes("MARC'S FOOD MAPPING"));
});

Deno.test("FF-016: le mapping passe APRÈS la sécurité et la doctrine, AVANT la note", () => {
  const compiled = compileDoctrineBlock(DOCTRINE_CTX.doctrine!.doctrine!, null);
  const ctx = withKeelDoctrineBlock("=== PLAN ===", {
    ...keel(), // celui-ci porte une contrainte médicale (peanut)
    doctrine: { ...DOCTRINE_CTX.doctrine!, compiled },
    protocol: PROTOCOL_LOADED,
    coach_note: { note: "Travaille de nuit.", reason: "loaded" },
  });
  // L'ORDRE EST LA GARANTIE, et il est un classement par COÛT DE PERTE.
  // Remonter le mapping au-dessus des contraintes dures apprendrait au modèle
  // qu'une aversion de méthode et une allergie sont le même registre.
  assert(ctx.indexOf("HARD CONSTRAINTS") < ctx.indexOf("MARC'S METHOD"));
  assert(ctx.indexOf("MARC'S METHOD") < ctx.indexOf("MARC'S FOOD MAPPING"));
  assert(ctx.indexOf("MARC'S FOOD MAPPING") < ctx.indexOf("Travaille de nuit."));
  assert(ctx.indexOf("Travaille de nuit.") < ctx.indexOf("=== PLAN ==="));
});

Deno.test("FF-016: pas de protocole publié ⇒ AUCUN bloc mapping", () => {
  // Et surtout pas « ton coach n'a pas de méthode alimentaire »: c'est la
  // doctrine qui porte « il n'a pas tranché » (SILENCE IS NOT A POSITION), et
  // le dire deux fois dans deux vocabulaires est comment un modèle finit par
  // choisir la formulation la plus flatteuse.
  for (
    const protocol of [
      null,
      { ...PROTOCOL_LOADED, reason: "no_published_protocol" as const },
      { ...PROTOCOL_LOADED, reason: "load_failed" as const },
      { ...PROTOCOL_LOADED, compiled: [], reason: "empty_protocol" as const },
    ]
  ) {
    const ctx = withKeelDoctrineBlock("=== PLAN ===", {
      ...DOCTRINE_CTX,
      protocol,
    });
    assert(
      !ctx.includes("FOOD MAPPING"),
      `un bloc mapping est sorti pour ${protocol?.reason ?? "null"}`,
    );
  }
});

// ---------------------------------------------------------------------------
// LA NOTE 1:1 DU COACH (2026-08-05) — troisième bloc, et le rang est le sujet.
// ---------------------------------------------------------------------------

Deno.test("la note du coach est injectée APRÈS la sécurité et la doctrine", () => {
  const compiled = compileDoctrineBlock(DOCTRINE_CTX.doctrine!.doctrine!, null);
  const ctx = withKeelDoctrineBlock("=== PLAN ===", {
    ...keel(), // celui-ci porte une contrainte médicale (peanut)
    doctrine: { ...DOCTRINE_CTX.doctrine!, compiled },
    coach_note: { note: "Travaille de nuit.", reason: "loaded" },
  });
  assert(ctx.includes("Travaille de nuit."));
  // L'ORDRE EST LA GARANTIE. Le budget tronque par la queue: la note est la
  // moins chère des trois à perdre, elle passe donc en dernier. Inverser cet
  // ordre ferait sauter l'allergène avant l'observation.
  assert(ctx.indexOf("HARD CONSTRAINTS") < ctx.indexOf("MARC'S METHOD"));
  assert(ctx.indexOf("MARC'S METHOD") < ctx.indexOf("Travaille de nuit."));
  assert(ctx.indexOf("Travaille de nuit.") < ctx.indexOf("=== PLAN ==="));
});

Deno.test("pas de note -> AUCUN bloc, pas même un en-tête vide", () => {
  const withoutRow = withKeelDoctrineBlock("=== PLAN ===", {
    ...DOCTRINE_CTX,
    coach_note: { note: null, reason: "no_note" },
  });
  const failed = withKeelDoctrineBlock("=== PLAN ===", {
    ...DOCTRINE_CTX,
    coach_note: { note: null, reason: "load_failed" },
  });
  // Un bloc « le coach n'a rien noté » apprendrait au modèle que la note existe
  // et qu'elle manque — c'est-à-dire la pression par élève que MODEL.md refuse.
  for (const ctx of [withoutRow, failed]) {
    assert(!ctx.includes("WHAT THEIR COACH HAS NOTED"));
  }
  // Et une lecture en panne ne se distingue pas d'une absence CÔTÉ PROMPT —
  // elle se distingue dans les logs. L'élève ne paie pas l'incident.
  assertEquals(withoutRow, failed);
});

Deno.test("a non-KEEL turn keeps its context byte-for-byte", () => {
  const ctx = "=== LEGACY FR CONTEXT ===";
  assertEquals(
    withKeelDoctrineBlock(ctx, keel({ is_student: false, role: null })),
    ctx,
  );
});
