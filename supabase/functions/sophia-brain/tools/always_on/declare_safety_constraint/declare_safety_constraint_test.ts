/**
 * `declare_safety_constraint` — LA PORTÉE DE CE QU'ON PROMET À L'ÉLÈVE.
 *
 * ── LE DÉFAUT QUE CES TESTS PINNENT ───────────────────────────────────────
 * L'accusé disait, mot pour mot et quel que soit le token écrit:
 *
 *     "That's on your file now, and I'll check anything I suggest against it
 *      from here on."
 *
 * Vrai sur `peanut`, que le verrou reconnaît sous « satay », « PB », « nut
 * butter » (le défaut mesuré du 2026-08-03: « the nut butter option » servi à
 * un élève anaphylactique avec `reason: "clean"`). Trop large sur `kiwi` ou
 * `fruits_de_mer`, que le verrou ne reconnaît QUE sous ce mot-là.
 *
 * Le coût n'est pas symétrique: un élève rassuré ne redit pas son allergie
 * sous un autre nom. `hasSurfaceFormCoverage` existait, testé et documenté,
 * avec zéro appelant — la nuance était écrite partout sauf là où elle se dit.
 *
 * ── ET UNE CHOSE QUE CE FICHIER NE DIT PAS ────────────────────────────────
 * Aucun test ici ne prouve « l'élève est protégé ». `word_only` n'est PAS
 * « non protégé »: le matcher compare toujours le token lui-même, pluriels et
 * séparateurs compris. La distinction testée est « reconnu sous ses autres
 * noms » contre « reconnu sous ce mot seul », et c'est la seule qui soit vraie.
 */

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type {
  CommittedSafetyConstraintEffect,
  SafetyConstraintRow,
  SafetyConstraintWrite,
  SafetyConstraintWriteResult,
} from "./contract.ts";
import { intakeSafetyConstraintEffect } from "./intake.ts";
import { renderSafetyConstraintAck } from "./renderer.ts";
import { runDeclareSafetyConstraintDirectEffect } from "./router.ts";

const USER = "11111111-1111-1111-1111-111111111111";

function turnFrame(payload: Record<string, unknown>): TurnFrame {
  return {
    user_id: USER,
    source_message_id: "msg-1",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [{
      effect_type: "declare_safety_constraint",
      explicitness: "explicit",
      confidence_band: "high",
      payload_hint: payload,
    }],
    skill_signals: {},
  } as unknown as TurnFrame;
}

/**
 * La base rend CE QU'ON LUI DIT DE RENDRE, indépendamment de la demande.
 *
 * C'est tout l'intérêt du double: il permet de faire diverger la ligne relue de
 * l'effet demandé, et donc de prouver laquelle des deux le routeur écoute.
 */
function writeReturning(
  row: Partial<SafetyConstraintRow>,
  outcome: "inserted" | "already_recorded" | "retracted" = "inserted",
): SafetyConstraintWrite {
  return (input) => {
    const full: SafetyConstraintRow = {
      id: "c-1",
      user_id: USER,
      kind: input.kind,
      allergen_ref: null,
      substance_ref: null,
      medication_class: null,
      condition_ref: null,
      severity: input.severity,
      status: outcome === "retracted" ? "retracted" : "active",
      declared_by: "student",
      content_locale: input.content_locale,
      ...row,
    };
    // Trois retours écrits en toutes lettres plutôt qu'un `as`: un cast ici
    // désarmerait le typecheck sur exactement la forme que ces tests
    // prétendent éprouver.
    const result: SafetyConstraintWriteResult = outcome === "retracted"
      ? { outcome: "retracted", row: full }
      : outcome === "already_recorded"
      ? { outcome: "already_recorded", row: full }
      : { outcome: "inserted", row: full };
    return Promise.resolve(result);
  };
}

async function run(args: {
  payload: Record<string, unknown>;
  write: SafetyConstraintWrite;
}) {
  return await runDeclareSafetyConstraintDirectEffect({
    turn_frame: turnFrame(args.payload),
    user_id: USER,
    content_locale: "en-GB",
    write_safety_constraint: args.write,
  });
}

const committedOf = (result: { committed_effects: readonly unknown[] }) =>
  result.committed_effects[0] as CommittedSafetyConstraintEffect;

// ---------------------------------------------------------------------------
// La couverture, calculée à l'écriture
// ---------------------------------------------------------------------------

Deno.test("un allergène de la table est annoncé comme reconnu sous ses autres noms", async () => {
  const result = await run({
    payload: { allergen_ref: "peanut", kind: "allergy", severity: "medical" },
    write: writeReturning({ allergen_ref: "peanut" }),
  });

  assertEquals(result.status, "recorded");
  assertEquals(committedOf(result).surface_form_coverage, "wide");
  // Aucune mise en garde: la promesse large est vraie ici, et la nuancer
  // apprendrait à l'élève à ne pas croire l'avertissement quand il compte.
  assert(
    !(result.reply ?? "").includes("that one name"),
    `couverture large mais accusé restrictif: ${result.reply}`,
  );
});

Deno.test("un allergène hors table est annoncé comme reconnu sur ce mot seul", async () => {
  const result = await run({
    payload: { allergen_ref: "kiwi", kind: "allergy", severity: "medical" },
    write: writeReturning({ allergen_ref: "kiwi" }),
  });

  assertEquals(committedOf(result).surface_form_coverage, "word_only");
  const reply = result.reply ?? "";
  assertStringIncludes(reply, "that one name");
  // La promesse large reste dite — la contrainte EST tenue, sur son mot. Ce
  // n'est pas un avertissement d'échec.
  assertStringIncludes(reply, "on your file");

  // ET ELLE NE NOMME PAS L'ALLERGÈNE. Même raison mécanique que le reste du
  // renderer: `kiwi` en position non niée dans l'accusé ferait mordre la
  // ceinture de sortie sur son propre message.
  assert(
    !reply.toLowerCase().includes("kiwi"),
    `l'accusé cite l'allergène et se fera remplacer par le verrou: ${reply}`,
  );
});

Deno.test("une classe de médicament ne reçoit aucune mise en garde de couverture", async () => {
  // `not_applicable`, pas `word_only`: une prescription n'a pas de formes de
  // surface alimentaires. Lui dire « je ne la connais que sous ce nom »
  // inventerait une inquiétude sans objet.
  const result = await run({
    payload: { medication_class: "metformin", kind: "medical", severity: "medical" },
    write: writeReturning({ medication_class: "metformin" }),
  });

  assertEquals(committedOf(result).surface_form_coverage, "not_applicable");
  assert(!(result.reply ?? "").includes("that one name"));
});

Deno.test("une maladie declaree ne recoit aucune mise en garde de couverture", async () => {
  // `condition_ref` est le QUATRIÈME identifiant, arrivé avec le chantier
  // maladie. Il tombe du bon côté sans code dédié: la couverture se lit sur
  // `allergen_ref`, donc une ligne portée par la seule maladie est
  // `not_applicable`. On le PIN plutôt que de le supposer — c'est exactement
  // le genre de croisement qui passe entre deux chantiers.
  const result = await run({
    payload: { condition_ref: "coeliac_disease", kind: "medical", severity: "medical" },
    write: writeReturning({ condition_ref: "coeliac_disease" }),
  });

  assertEquals(committedOf(result).surface_form_coverage, "not_applicable");
  assert(!(result.reply ?? "").includes("that one name"));
});

Deno.test("la couverture est lue sur la ligne RELUE, jamais sur la demande", async () => {
  // L'invariant signature du dossier, appliqué à la couverture. On demande
  // `kiwi` et la base rend `peanut` (un trigger, une contrainte, une
  // normalisation côté serveur — peu importe): l'accusé doit décrire ce que la
  // base tient, pas ce que le tour a demandé.
  const result = await run({
    payload: { allergen_ref: "kiwi", kind: "allergy", severity: "medical" },
    write: writeReturning({ allergen_ref: "peanut" }),
  });

  assertEquals(committedOf(result).surface_form_coverage, "wide");
  assertEquals(committedOf(result).constraint_ref, "peanut");
});

// ---------------------------------------------------------------------------
// Le renderer, isolé
// ---------------------------------------------------------------------------

function committed(
  overrides: Partial<CommittedSafetyConstraintEffect>,
): CommittedSafetyConstraintEffect {
  return {
    type: "declare_safety_constraint",
    intent: "declare",
    constraint_id: "c-1",
    constraint_ref: "kiwi",
    kind: "allergy",
    severity: "medical",
    status: "active",
    already_recorded: false,
    surface_form_coverage: "word_only",
    ...overrides,
  };
}

Deno.test("une rétractation ne parle jamais de couverture", () => {
  // On retire une contrainte: la portée du matching de la ligne qui part n'a
  // plus aucun intérêt pour l'élève, et l'évoquer ressemblerait à un refus.
  const reply = renderSafetyConstraintAck(
    [committed({ intent: "retract", status: "retracted" })],
    { nothing_to_retract: false },
  );
  assert(reply !== null);
  assert(!reply.includes("that one name"), reply);
  assertStringIncludes(reply, "taken that off your file");
});

Deno.test("la mise en garde vaut aussi hors severity medical", () => {
  // `medical` seul arme la ceinture de sortie, mais les deux phrases d'accusé
  // promettent une vérification. Gater la nuance sur la sévérité laisserait
  // une promesse large sans sa portée — le motif exact de
  // `optional-gate-params-are-disarmed-gates`.
  const reply = renderSafetyConstraintAck(
    [committed({ severity: "strict", kind: "religious" })],
    { nothing_to_retract: false },
  );
  assert(reply !== null);
  assertStringIncludes(reply, "Noted on your file");
  assertStringIncludes(reply, "that one name");
});

Deno.test("aucune mise en garde ne survit à zéro effet committé", () => {
  assertEquals(renderSafetyConstraintAck([], { nothing_to_retract: false }), null);
});

// ---------------------------------------------------------------------------
// L'intake, sur la règle de normalisation PARTAGÉE
// ---------------------------------------------------------------------------

Deno.test("l'intake normalise avec la règle du moteur, pas une copie locale", () => {
  // `intake.ts` portait sa propre `normalizeRef`, identique à
  // `normalizeAllergenRef` — donc inoffensive jusqu'au jour où l'une aurait
  // bougé. Ces cas sont ceux d'`allergen_catalog_test.ts`: ils passent ICI
  // parce que c'est la MÊME fonction, et ils tomberaient si une copie
  // réapparaissait avec une règle à elle.
  const result = intakeSafetyConstraintEffect({
    payload_hint: { allergen_ref: "  Tree-Nut ", kind: "allergy" },
    user_id: USER,
    content_locale: "en-GB",
    source_message_id: "msg-1",
  });
  assert(result.ok);
  assertEquals(result.effect.allergen_ref, "tree_nut");

  const accented = intakeSafetyConstraintEffect({
    payload_hint: { allergen_ref: "café  au lait", kind: "allergy" },
    user_id: USER,
    content_locale: "en-GB",
    source_message_id: "msg-2",
  });
  assert(accented.ok);
  // ⟳ `cafe_au_lait`, ET C'EST LA PREUVE QUE CE TEST FAIT SON TRAVAIL.
  //
  // Il épinglait `caf_au_lait` — l'ancienne règle, qui SUPPRIMAIT le caractère
  // accentué au lieu de le replier. `normalizeAllergenRef` a été corrigée le
  // 2026-08-19 (voir son pavé: « œuf » → `uf`, « blé » → `bl`, « céleri » →
  // `cleri` mutilaient cinq des quatorze allergènes majeurs en français), et
  // cette attente n'a pas suivi.
  //
  // ⚠️ LE ROUGE A VÉCU DEUX SEMAINES PARCE QUE LE GATE NE LANCE QUE
  // `_shared/keel/`. Ce répertoire-ci n'y est pas. Constaté le 2026-09-02.
  //
  // La valeur attendue est celle du MOTEUR, et elle est copiée de son propre
  // test (`allergen_catalog_test.ts:138`) — c'est tout l'objet de ce cas: ces
  // entrées passent ici parce que c'est la MÊME fonction.
  assertEquals(accented.effect.allergen_ref, "cafe_au_lait");
});
