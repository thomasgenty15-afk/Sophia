/**
 * R3 — LA RÉPONSE VISIBLE DE `plan_question` SUIT LA LOCALE DE L'ÉLÈVE.
 *
 * Ce renderer passait déjà un `LocalePack` à ses étiquettes de groupe et
 * écrivait ses PHRASES en anglais dur. Mesuré le 2026-08-13 (run `doctrine5`,
 * rapport `qa-run-reports/2026-08-13-doctrine-5-coachs.md`): 16 tours sur 42,
 * tous chez des élèves `fr-FR`, ont reçu une phrase anglaise avec deux
 * étiquettes françaises encastrées dedans —
 * « volaille is outside what your coach set for the protéines maigres line ».
 *
 * Les trois formes de test que la charte exige:
 *   POSITIF          — la même décision, en français, ne porte aucun anglais;
 *   PARAPHRASE       — les trois décisions (allowed / escalate / denied) et les
 *                      deux formes d'escalade sont couvertes, pas seulement
 *                      celle qui a été mesurée;
 *   ANTI-FAUX-POSITIF — l'anglais n'a pas bougé d'un octet.
 */
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { renderPlanQuestion } from "./renderer.ts";

const NO_CONSTRAINTS: never[] = [];

/** Les marqueurs anglais du fichier, ceux qui ont réellement été servis en FR. */
const ENGLISH_MARKERS = [
  "is outside what your coach set",
  "That one sits outside",
  "green-light",
  "Your question is with them now",
  "Nothing in your plan has changed",
  "Log it as usual",
  "works here",
  "I cannot clear that one",
];

function assertNoEnglish(reply: string, where: string): void {
  for (const marker of ENGLISH_MARKERS) {
    assert(
      !reply.includes(marker),
      `${where}: reste de l'anglais dans une réponse fr-FR — ${JSON.stringify(marker)}\n${reply}`,
    );
  }
}

Deno.test("fr-FR: l'escalade NOMMÉE est entièrement française", () => {
  const render = renderPlanQuestion({
    verdict: {
      decision: "escalate",
      tier: 0,
      reason_code: "different_class",
      prescribed_food_group: "lean_protein",
      requested_food_group: "poultry",
      detail: "poultry is protein, the line prescribes lean_protein",
    },
    change_request: null,
    safety_constraints: NO_CONSTRAINTS,
    locale: "fr-FR",
  });
  assertNoEnglish(render.reply, "escalade nommée");
  // La forme mesurée: les DEUX étiquettes sont là, dans une phrase française.
  assert(/en dehors de ce que ton coach a posé/.test(render.reply), render.reply);
  assert(/Ta question part chez lui, mot pour mot/.test(render.reply), render.reply);
});

Deno.test("fr-FR: l'escalade SANS groupe nommé est entièrement française", () => {
  const render = renderPlanQuestion({
    verdict: {
      decision: "escalate",
      tier: 0,
      reason_code: "unresolved_food_group",
      prescribed_food_group: null,
      requested_food_group: null,
      detail: "no requested food group captured",
    },
    change_request: null,
    safety_constraints: NO_CONSTRAINTS,
    locale: "fr-FR",
  });
  assertNoEnglish(render.reply, "escalade anonyme");
  assert(/Ça sort de ce que ton coach a posé sur cette ligne/.test(render.reply), render.reply);
});

Deno.test("fr-FR: les trois OUI et le refus dur sont français eux aussi", () => {
  const identical = renderPlanQuestion({
    verdict: {
      decision: "allowed",
      tier: 0,
      reason_code: "identical_group",
      swap_applied: false,
      prescribed_food_group: "lean_protein",
      requested_food_group: "lean_protein",
      matched_class: "protein",
    },
    change_request: null,
    safety_constraints: NO_CONSTRAINTS,
    locale: "fr-FR",
  });
  assertNoEnglish(identical.reply, "identical_group");
  assert(identical.reply.startsWith("Oui —"), identical.reply);

  const allowlist = renderPlanQuestion({
    verdict: {
      decision: "allowed",
      tier: 0,
      reason_code: "explicit_allowlist",
      swap_applied: true,
      prescribed_food_group: "lean_protein",
      requested_food_group: "eggs",
      matched_class: "protein",
    },
    change_request: null,
    safety_constraints: NO_CONSTRAINTS,
    locale: "fr-FR",
  });
  assertNoEnglish(allowlist.reply, "explicit_allowlist");
  assert(/à la place de/.test(allowlist.reply), allowlist.reply);

  const classEq = renderPlanQuestion({
    verdict: {
      decision: "allowed",
      tier: 0,
      reason_code: "class_equivalent",
      swap_applied: true,
      prescribed_food_group: "lean_protein",
      requested_food_group: "eggs",
      matched_class: "protein",
    },
    change_request: null,
    safety_constraints: NO_CONSTRAINTS,
    locale: "fr-FR",
  });
  assertNoEnglish(classEq.reply, "class_equivalent");

  const denied = renderPlanQuestion({
    verdict: {
      decision: "denied",
      tier: 0,
      reason_code: "allergen_violation",
      constraint_ref: "peanut",
      constraint_severity: "medical",
      requested_food_group: "nuts_seeds",
    },
    change_request: null,
    safety_constraints: NO_CONSTRAINTS,
    locale: "fr-FR",
  });
  assertNoEnglish(denied.reply, "hard deny");
  assert(denied.reply.startsWith("Non —"), denied.reply);
  // Le refus dur ne nomme AUCUN aliment, en français comme en anglais.
  assert(!/nuts|noix|arachide|cacahu/i.test(denied.reply), denied.reply);
});

Deno.test("ANTI-FAUX-POSITIF: l'anglais est inchangé, octet pour octet", () => {
  const render = renderPlanQuestion({
    verdict: {
      decision: "escalate",
      tier: 0,
      reason_code: "different_class",
      prescribed_food_group: "lean_protein",
      requested_food_group: "poultry",
      detail: "",
    },
    change_request: null,
    safety_constraints: NO_CONSTRAINTS,
    locale: "en-GB",
  });
  assertEquals(
    render.reply,
    "poultry is outside what your coach set for the lean protein line, so I " +
      "am not going to green-light it myself. Your question is with them now, " +
      "word for word. Nothing in your plan has changed, so keep following the " +
      "line as written; if they open it up, you will see it in your plan.",
  );
});
