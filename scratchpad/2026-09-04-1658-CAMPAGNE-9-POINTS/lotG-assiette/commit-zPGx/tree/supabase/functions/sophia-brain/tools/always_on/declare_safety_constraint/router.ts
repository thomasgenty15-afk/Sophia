/**
 * `declare_safety_constraint` — intake -> exécution -> ledger -> rendu.
 *
 * Même forme de retour que `runLogProtocolEventDirectEffect` et
 * `runDeclareDeviationDirectEffect`, pour que `runKeelDirectEffectLane` les
 * absorbe tous les trois avec le même `absorb()`.
 *
 * INVARIANT, et c'est le seul qui compte ici: `committed_effects` ne contient
 * que des effets construits à partir d'une ligne RELUE. Le renderer ne lit que
 * `committed_effects`. Il est donc structurellement impossible d'accuser
 * réception d'une contrainte que la base n'a pas — le défaut d'origine.
 */

import { hasSurfaceFormCoverage } from "../../../../_shared/keel/allergen_catalog.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type {
  BlockedSafetyConstraintEffect,
  CommittedSafetyConstraintEffect,
  RequestedSafetyConstraintEffect,
  SafetyConstraintWrite,
  SurfaceFormCoverage,
} from "./contract.ts";
import { intakeSafetyConstraintEffect } from "./intake.ts";
import { renderSafetyConstraintAck } from "./renderer.ts";

export type SafetyConstraintDirectEffectResult = {
  detected: boolean;
  status: "ignored" | "recorded" | "blocked" | "failed";
  reply: string | null;
  executed_tools: readonly string[];
  requested_effects: readonly unknown[];
  allowed_effects: readonly unknown[];
  committed_effects: readonly unknown[];
  blocked_effects: readonly unknown[];
  debug: { reason_code: string };
};

const IGNORED: SafetyConstraintDirectEffectResult = {
  detected: false,
  status: "ignored",
  reply: null,
  executed_tools: [],
  requested_effects: [],
  allowed_effects: [],
  committed_effects: [],
  blocked_effects: [],
  debug: { reason_code: "no_effect_requested" },
};

export async function runDeclareSafetyConstraintDirectEffect(args: {
  turn_frame: TurnFrame;
  user_id: string;
  content_locale: string | null;
  write_safety_constraint: SafetyConstraintWrite;
}): Promise<SafetyConstraintDirectEffectResult> {
  const effects = (args.turn_frame.direct_effects ?? []).filter(
    (e) => e.effect_type === "declare_safety_constraint",
  );
  if (effects.length === 0) return IGNORED;

  // MONO-ENTRÉE, comme les deux autres effets KEEL. Un élève peut nommer deux
  // allergies dans une phrase, mais la cardinalité se porterait alors dans le
  // payload (comme `components` côté protocol_events), jamais en dupliquant
  // l'effet: N demandes annoncées pour 1 ligne écrite est la classe
  // `fanout-reminder-phantom-commit`, et ici elle porterait sur une allergie.
  const first = effects[0];
  const sourceMessageId = String(
    args.turn_frame.source_message_id ?? args.turn_frame.turn_id ?? "",
  );

  const intake = intakeSafetyConstraintEffect({
    payload_hint: first.payload_hint,
    user_id: args.user_id,
    content_locale: args.content_locale,
    source_message_id: sourceMessageId,
  });

  if (!intake.ok) {
    return {
      detected: true,
      status: "blocked",
      reply: null,
      executed_tools: [],
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [intake.blocked],
      debug: { reason_code: intake.blocked.reason_code },
    };
  }

  const requested: RequestedSafetyConstraintEffect = intake.effect;

  let result;
  try {
    result = await args.write_safety_constraint(requested);
  } catch (error) {
    // Une écriture ratée ne produit AUCUN accusé. Bruyant dans les logs,
    // silencieux pour l'élève — plutôt qu'un « c'est noté » sur rien.
    console.error("keel.declare_safety_constraint.write_failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
    const blocked: BlockedSafetyConstraintEffect = {
      type: "declare_safety_constraint",
      reason_code: "write_failed",
    };
    return {
      detected: true,
      status: "failed",
      reply: null,
      executed_tools: [],
      requested_effects: [requested],
      allowed_effects: [requested],
      committed_effects: [],
      blocked_effects: [blocked],
      debug: { reason_code: "write_failed" },
    };
  }

  if (result.outcome === "nothing_to_retract") {
    return {
      detected: true,
      status: "blocked",
      reply: renderSafetyConstraintAck([], { nothing_to_retract: true }),
      executed_tools: [],
      requested_effects: [requested],
      allowed_effects: [requested],
      committed_effects: [],
      blocked_effects: [{
        type: "declare_safety_constraint",
        reason_code: "nothing_to_retract",
      } satisfies BlockedSafetyConstraintEffect],
      debug: { reason_code: "nothing_to_retract" },
    };
  }

  const row = result.row;

  // CE QUE LE VERROU TIENDRA SUR CETTE LIGNE — décidé ICI, sur la colonne
  // relue, et porté jusqu'au renderer.
  //
  // Sans ce calcul, l'accusé disait « I'll check anything I suggest against it
  // from here on » aussi bien sur `peanut` (reconnu sous « satay », « PB »,
  // « nut butter ») que sur `kiwi` ou `fruits_de_mer` (reconnus sous ce mot et
  // sous aucun autre). La phrase était vraie dans un cas et trop large dans
  // l'autre, et c'est le second qui coûte: un élève rassuré ne redit pas son
  // allergie sous un autre nom.
  //
  // On lit `row.allergen_ref` et pas `constraint_ref`: une classe de
  // médicament n'a pas de formes de surface alimentaires, et lui répondre
  // « seulement sous ce mot » serait une inquiétude sans objet.
  const surfaceFormCoverage: SurfaceFormCoverage = row.allergen_ref === null
    ? "not_applicable"
    : hasSurfaceFormCoverage(row.allergen_ref)
    ? "wide"
    : "word_only";

  // Le coach est la seule personne qui puisse élargir une contrainte étroite
  // (en convenant du terme standard avec l'élève). Il la voit déjà sur sa
  // fiche; ce log la rend comptable côté moteur. Pas de slug: un allergène est
  // une donnée de santé, et `constraint_id` suffit à retrouver la ligne.
  if (requested.intent === "declare" && surfaceFormCoverage === "word_only") {
    console.log("keel.declare_safety_constraint.word_only_coverage", {
      constraint_id: row.id,
      kind: row.kind,
      severity: row.severity,
    });
  }

  const committed: CommittedSafetyConstraintEffect = {
    type: "declare_safety_constraint",
    intent: requested.intent,
    constraint_id: row.id,
    // RELU, pas demandé: si un trigger ou une contrainte avait nulled la
    // colonne, l'accusé porterait un identifiant que la base ne tient pas.
    constraint_ref: row.allergen_ref ?? row.substance_ref ??
      row.medication_class ?? "",
    kind: row.kind,
    severity: row.severity,
    status: row.status,
    already_recorded: result.outcome === "already_recorded",
    surface_form_coverage: surfaceFormCoverage,
  };

  return {
    detected: true,
    status: "recorded",
    reply: renderSafetyConstraintAck([committed], { nothing_to_retract: false }),
    executed_tools: ["declare_safety_constraint"],
    requested_effects: [requested],
    allowed_effects: [requested],
    committed_effects: [committed],
    blocked_effects: [],
    debug: { reason_code: result.outcome },
  };
}
