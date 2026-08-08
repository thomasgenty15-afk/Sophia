import type { DirectEffectGateOutcome } from "../contracts/direct_effect_gate.v1.ts";
import type {
  DirectEffectType,
  TurnFrame,
} from "../contracts/turn_frame.v1.ts";
import { blocksDirectEffects } from "../safety/safety_thresholds.ts";

/**
 * W3.3 — vocabulaire d'effets KEEL, préparé AVANT que W4 ne l'ouvre.
 *
 * W4.3 ajoutera `log_protocol_event` et `declare_deviation` à
 * `DirectEffectType` (contracts/turn_frame.v1.ts). Ces deux effets écrivent
 * des FAITS (`protocol_events`, `planned_deviations`) : ils sont exactement du
 * même genre que `track_progress_plan_item`, donc la safety doit les bloquer
 * en bande >= medium comme les deux effets existants — pas « aussi », mais
 * PAR DÉFAUT : la règle ci-dessous est une liste d'EXEMPTIONS fermée, si bien
 * qu'un effet neuf est bloqué tant que personne ne l'exempte explicitement.
 * L'inverse (liste de blocages) laisserait passer en silence tout effet ajouté
 * plus tard sans y penser.
 *
 * Le test `direct_effect_gate_keel_test.ts` fige les deux propriétés et
 * échouera (ignore levé) le jour où W4 étend l'union de types.
 */
export const KEEL_DIRECT_EFFECT_TYPES = [
  "log_protocol_event",
  "declare_deviation",
  "declare_safety_constraint",
] as const;

/**
 * W4.3 — vocabulaire COMPLET des effets durables reconnus par le runtime.
 *
 * Source unique : le gate le déclare, l'orchestrateur le consomme. Avant W4.3,
 * `effect_gate_orchestrator.ts` recopiait la liste dans un prédicat local ;
 * l'union de `DirectEffectType` et la liste de l'orchestrateur pouvaient donc
 * diverger en silence — un effet ajouté au contrat était rejeté en
 * `unknown_effect_type` sans que rien ne le dise. Un seul tableau, désormais.
 *
 * L'ordre n'a pas de sens ; l'appartenance, si.
 */
export const KNOWN_DIRECT_EFFECT_TYPES = [
  "create_one_shot_reminder",
  "track_progress_plan_item",
  ...KEEL_DIRECT_EFFECT_TYPES,
] as const;

const KNOWN_DIRECT_EFFECT_TYPE_SET: ReadonlySet<string> = new Set(
  KNOWN_DIRECT_EFFECT_TYPES,
);

export function isKnownDirectEffectType(
  value: string,
): value is DirectEffectType {
  return KNOWN_DIRECT_EFFECT_TYPE_SET.has(value);
}

/**
 * Liste FERMÉE des effets qui survivent à une bande safety >= medium.
 *
 * `create_one_shot_reminder` y figure parce que le rappel est un acte de soin
 * demandé explicitement par l'utilisateur en crise (arbitrage V5 « safety +
 * rappel explicit only »), pas parce qu'il est inoffensif. Rien d'autre n'y
 * entre sans une décision produit écrite.
 */
const SAFETY_BLOCK_EXEMPT_EFFECT_TYPES: ReadonlySet<string> = new Set([
  "create_one_shot_reminder",
  // DÉCISION PRODUIT ÉCRITE (QA agent 4, 2026-08-03), exigée par le paragraphe
  // ci-dessus. `declare_safety_constraint` survit à une bande safety >= medium.
  //
  // Le raisonnement est le même que pour le rappel explicite, et il est plus
  // fort: enregistrer une allergie est un ACTE DE PROTECTION, pas un effet de
  // confort. Un élève en crise qui dit « je suis allergique aux arachides »
  // doit être protégé au tour suivant — le bloquer laisserait le coffre vide
  // précisément quand l'élève est le plus vulnérable, et la ceinture de sortie
  // n'aurait toujours rien à comparer.
  //
  // L'asymétrie qui tranche: une contrainte enregistrée à tort SUR-BLOQUE
  // (récupérable, et l'élève peut la rétracter), une contrainte manquante
  // sert l'allergène (irrécupérable). C'est la même asymétrie qui gouverne
  // `allergen_bridge.ts` et `allergen_surface_forms.ts`.
  "declare_safety_constraint",
]);

/**
 * L2 (2026-08-08) — LES EFFETS QU'UNE ÉCRITURE SOUS PLANCHER PEUT DÉBLOQUER.
 *
 * Liste FERMÉE, et volontairement séparée de `SAFETY_BLOCK_EXEMPT_EFFECT_TYPES`
 * ci-dessus: l'exemption du rappel et de l'allergie vaut pour TOUT le tour, y
 * compris quand la lane parle. Celle-ci ne vaut que pour le chemin d'écriture
 * SILENCIEUX de `run.ts` — le fait entre en base, et la restitution n'existe
 * pas. Les mélanger reviendrait à laisser un accusé de repas remonter dans un
 * tour de crise, ce qui est exactement ce que le lot interdit.
 *
 * DÉCISION PRODUIT ÉCRITE, exigée par le paragraphe de
 * `SAFETY_BLOCK_EXEMPT_EFFECT_TYPES` (« rien d'autre n'y entre sans une
 * décision produit écrite »): arbitrage humain du 2026-08-08, « écrire le fait,
 * taire la réponse ». Mesuré 3/3 (FF-017) puis 6/6 FR+EN (FF-020): sous
 * `safety_band`, une déclaration de repas produisait ZÉRO ligne — le fait
 * disparaissait au moment exact où le message le portait, et la revue du coach
 * devenait aveugle précisément sur la semaine qui compte.
 *
 * L'asymétrie qui tranche, et c'est la même que pour l'allergie: un fait écrit
 * de trop se corrige (l'élève rétracte, la ligne se disqualifie), un fait
 * perdu ne revient jamais — `protocol_events` est APPEND-ONLY et personne ne
 * redemande à quelqu'un en crise ce qu'il a mangé.
 */
const FLOOR_SILENCED_WRITE_EXEMPT_EFFECT_TYPES: ReadonlySet<string> = new Set([
  "log_protocol_event",
]);

/**
 * Un effet durable est-il bloqué par la bande safety de ce tour ?
 * Défaut-deny : tout ce qui n'est pas explicitement exempté est bloqué.
 *
 * @param floorSilencedWrite ce tour est-il l'écriture SILENCIEUSE de `run.ts`
 *   sous plancher ? Le défaut est `false`, et la POLARITÉ est ce qui rend ce
 *   défaut sûr: un appelant qui l'oublie garde la garde FERMÉE. C'est l'inverse
 *   exact de la cicatrice `optional-gate-params-are-disarmed-gates`, où l'oubli
 *   ouvrait. Un paramètre requis ici forcerait l'édition des quatre chaînes
 *   d'effet pour un drapeau qui n'en concerne qu'une.
 */
export function safetyBandBlocksEffect(
  effectType: string,
  riskBand: TurnFrame["safety"]["risk_band"],
  floorSilencedWrite = false,
): boolean {
  if (!blocksDirectEffects(riskBand)) return false;
  if (
    floorSilencedWrite === true &&
    FLOOR_SILENCED_WRITE_EXEMPT_EFFECT_TYPES.has(effectType)
  ) return false;
  return !SAFETY_BLOCK_EXEMPT_EFFECT_TYPES.has(effectType);
}

export type DirectEffectGateInput = {
  effect_type: DirectEffectType;
  turn_frame: TurnFrame;
  recent_writes_idempotency: { source_message_ids: string[] };
  db_idempotency_check: (key: string) => Promise<boolean>;
  /**
   * L2 — ce tour est l'écriture SILENCIEUSE sous plancher (`run.ts`,
   * `floorSilencedWriteForTurn`). Voir `safetyBandBlocksEffect`: absent ⇒ la
   * garde reste fermée.
   */
  floor_silenced_write?: boolean;
};

type GateBlockedReason = Extract<
  DirectEffectGateOutcome,
  { decision: "blocked" }
>["reason_code"];
type GateClarifyReason = Extract<
  DirectEffectGateOutcome,
  { decision: "needs_clarify" }
>[
  "reason_code"
];

function idempotencyKey(
  effectType: DirectEffectType,
  turnFrame: TurnFrame,
): string {
  return `${turnFrame.user_id}:${turnFrame.source_message_id}:${effectType}`;
}

function blocked(
  toolId: DirectEffectType,
  reasonCode: GateBlockedReason,
  message: string,
): DirectEffectGateOutcome {
  return {
    decision: "blocked",
    tool_id: toolId,
    reason_code: reasonCode,
    message,
  };
}

function needsClarify(
  toolId: DirectEffectType,
  reasonCode: GateClarifyReason,
  suggestedClarification: string,
): DirectEffectGateOutcome {
  return {
    decision: "needs_clarify",
    tool_id: toolId,
    reason_code: reasonCode,
    suggested_clarification: suggestedClarification,
  };
}

/**
 * QA agent 6 (2026-08-03) — les clarifications de ce gate sont VISIBLES.
 *
 * `suggested_clarification` remonte telle quelle jusqu'au message envoyé
 * (`track_progress_plan_item/router.ts`: `gate.suggested_clarification ?? …`),
 * donc ces trois chaînes étaient du français rendu à un élève KEEL en-GB.
 *
 * Source de la locale: `direct_effect_time_context.user_locale`, la seule
 * réellement écrite en production (`turn_frame.user_locale` est déclaré au
 * contrat et n'a aucun écrivain — le lire aurait donné `undefined`, donc le
 * repli français, donc un correctif mort). Repli 'fr-FR': le legacy B2C est
 * francophone, l'absence de locale garde donc le comportement d'avant, ce qui
 * est la condition de désarmement de ce changement.
 */
function gateLocale(input: DirectEffectGateInput): string {
  return String(
    (input.turn_frame.direct_effect_time_context as
      | { user_locale?: string }
      | undefined)?.user_locale ?? "fr-FR",
  );
}

function gateClarification(
  input: DirectEffectGateInput,
  key: "intent_implied_weak" | "target_ambiguous" | "ambiguity_present",
): string {
  const fr = String(gateLocale(input)).trim().toLowerCase().startsWith("fr");
  if (key === "intent_implied_weak") {
    return fr ? "Tu veux que je le note vraiment ?" : "Do you want me to log that?";
  }
  if (key === "target_ambiguous") {
    return fr
      ? "Tu parles de quel element exactement ?"
      : "Which one exactly do you mean?";
  }
  return fr
    ? "Je prefere confirmer avant de l'ecrire."
    : "I'd rather check with you before I write it down.";
}

export async function runDirectEffectGate(
  input: DirectEffectGateInput,
): Promise<DirectEffectGateOutcome> {
  const toolId = input.effect_type;
  const effect = input.turn_frame.direct_effects.find((candidate) =>
    candidate.effect_type === input.effect_type
  );
  if (!effect) {
    return blocked(
      toolId,
      "duplicate_db",
      "No matching direct effect candidate.",
    );
  }
  // Cadence (alex-r1 B02): une demande RECURRENTE ne s'arme jamais en
  // one-shot — la meme classification que le tool (payload_hint.cardinality,
  // decidee par le dispatcher) se consomme ici, avant l'armement.
  if (
    input.effect_type === "create_one_shot_reminder" &&
    String((effect.payload_hint as Record<string, unknown>)?.cardinality) ===
      "recurring" &&
    String((effect.payload_hint as Record<string, unknown>)?.intent) !==
      "cancel"
  ) {
    return blocked(
      toolId,
      "recurring_not_supported",
      "Recurring reminder requests are never armed as one-shot effects.",
    );
  }
  if (
    safetyBandBlocksEffect(
      toolId,
      input.turn_frame.safety.risk_band,
      input.floor_silenced_write === true,
    )
  ) {
    return blocked(
      toolId,
      "safety_high",
      "Safety risk blocks direct effects.",
    );
  }
  if (effect.explicitness !== "explicit") {
    return needsClarify(
      toolId,
      "intent_implied_weak",
      gateClarification(input, "intent_implied_weak"),
    );
  }
  if (effect.target_status !== "identified") {
    return needsClarify(
      toolId,
      effect.target_status === "ambiguous"
        ? "target_ambiguous"
        : "missing_time",
      gateClarification(input, "target_ambiguous"),
    );
  }
  if (effect.confidence_band !== "high") {
    return needsClarify(
      toolId,
      "ambiguity_present",
      gateClarification(input, "ambiguity_present"),
    );
  }
  if (
    input.recent_writes_idempotency.source_message_ids.includes(
      input.turn_frame.source_message_id,
    )
  ) {
    return blocked(
      toolId,
      "duplicate_source_message",
      "This source message was already consumed.",
    );
  }
  const key = idempotencyKey(input.effect_type, input.turn_frame);
  if (await input.db_idempotency_check(key)) {
    return blocked(
      toolId,
      "duplicate_db",
      "Equivalent direct effect already exists.",
    );
  }
  return {
    decision: "allow",
    tool_id: toolId,
    effect_payload: effect.payload_hint,
    idempotency_key: key,
  };
}
