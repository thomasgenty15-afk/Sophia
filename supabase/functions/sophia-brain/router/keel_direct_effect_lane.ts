// ═══════════════════════════════════════════════════════════════════════════
// LES EFFETS DURABLES KEEL — LEUR LIGNE DE LEDGER ET LEUR LANE D'EXÉCUTION
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `run.ts` (découpage des gros fichiers,
// lot 5a). Aucune logique changée. `run.ts` ré-exporte tout ce qui est
// exporté ici : les appelants et les tests continuent d'importer depuis lui.
// Ce module n'importe jamais `run.ts`.
//
// Ce qui est ici : le ledger des effets KEEL (`recordKeelDirectEffectsInLedger`,
// `effectLedgerForOperationRuntime`, `persistEffectLedgerForRuntimeTurn`),
// la lane d'exécution (MAILLON 3 : `runKeelDirectEffectLane`, le filet du
// plancher repas `mealFloorNetArms`) et `readKeelDayResolution`, que seule
// cette lane lit. `readKeelDayResolution` était plus bas dans `run.ts`,
// entre le runtime de `plan_question` et `keelOutageTemplate`.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import {
  type OperationRuntimeResult,
  recordToolSkillEffectsInLedger,
} from "./effect_ledger_adapter.ts";
import {
  createEffectLedger,
  type EffectLedger,
  summarizeEffectLedgerForTrace,
} from "./effect_ledger.ts";
import { persistEffectLedgerForTurn } from "./effect_ledger_persistence.ts";
import type { KeelPlanContext } from "../context/keel_plan_context.ts";
import { slotKeyNamedIn } from "../../_shared/keel/slot_from_message.ts";
import { createProtocolEventWrite } from "../tools/always_on/log_protocol_event/db.ts";
import { runLogProtocolEventDirectEffect } from "../tools/always_on/log_protocol_event/router.ts";
import { createSafetyConstraintWrite } from "../tools/always_on/declare_safety_constraint/db.ts";
import { runDeclareSafetyConstraintDirectEffect } from "../tools/always_on/declare_safety_constraint/router.ts";
import { createPlannedDeviationWrite } from "../tools/always_on/declare_deviation/db.ts";
import { runDeclareDeviationDirectEffect } from "../tools/always_on/declare_deviation/router.ts";
import type { DayResolution } from "../tools/always_on/declare_deviation/contract.ts";
import { isTrackProgressFutureIntent } from "../tools/always_on/track_progress_plan_item/intake.ts";
import {
  isMealForSomeoneElse,
  isNoMealDeclared,
  type MealDeclarationHit,
} from "../../_shared/keel/meal_declaration_floor.ts";
import {
  recordAllowedEffect,
  recordBlockedEffect,
  recordCommittedEffect,
  recordFailedEffect,
  recordRequestedEffect,
} from "./effect_ledger.ts";
import type { KeelTurnContext } from "./keel_turn_context.ts";

// ===========================================================================
// W4.7 — KEEL: le ledger des deux effets durables
//
// `effect_ledger_adapter.ts` mappe les effets par table fermée
// (`OPERATION_TYPE_BY_EFFECT_TYPE`) et `continue` en silence sur un type
// inconnu: un `log_protocol_event` committé y serait donc INVISIBLE du ledger
// — un commit réel sans ligne de comptabilité, exactement le trou que la
// doctrine « execution truth » interdit. Le mapping KEEL vit ici, à côté du
// seul point qui construit le ledger du tour, et il est ADDITIF: les deux
// recorders ne peuvent pas se marcher dessus puisque l'adaptateur legacy
// ignore ces deux types.
// ===========================================================================

const KEEL_LEDGER_EFFECT_TYPES: Readonly<
  Record<string, { effect_type: string; table: string; id_field: string }>
> = {
  log_protocol_event: {
    effect_type: "protocol_event.log",
    table: "protocol_events",
    id_field: "protocol_event_id",
  },
  declare_deviation: {
    effect_type: "planned_deviation.declare",
    table: "planned_deviations",
    id_field: "planned_deviation_id",
  },
  declare_safety_constraint: {
    effect_type: "safety_constraint.declare",
    table: "student_safety_constraints",
    id_field: "constraint_id",
  },
};

function keelLedgerPayloadSummary(
  effect: Record<string, unknown>,
): Record<string, unknown> {
  // Uniquement des valeurs RELUES ou des tokens: aucune prose de l'élève ne
  // transite par le ledger (le `student_note` reste dans `protocol_events`).
  return {
    local_date: effect.local_date ?? undefined,
    slot_key: effect.slot_key ?? undefined,
    source: effect.source ?? undefined,
    kind: effect.kind ?? undefined,
    already_logged: effect.already_logged ?? undefined,
    already_declared: effect.already_declared ?? undefined,
    coach_authorized_backdate: effect.coach_authorized_backdate ?? undefined,
    consumed_flex: effect.consumed_flex ?? undefined,
  };
}

export function recordKeelDirectEffectsInLedger(args: {
  ledger: EffectLedger;
  toolSkillRun: Record<string, unknown> | null | undefined;
}): void {
  const run = args.toolSkillRun;
  if (!run || typeof run !== "object" || Array.isArray(run)) return;
  const status = String(run.status ?? "").trim() || null;
  const lists: Array<
    [
      string,
      (
        ledger: EffectLedger,
        entry: Parameters<typeof recordRequestedEffect>[1],
      ) => unknown,
      "router" | "executor",
    ]
  > = [
    ["requested_effects", recordRequestedEffect, "router"],
    ["allowed_effects", recordAllowedEffect, "router"],
    ["committed_effects", recordCommittedEffect, "executor"],
    ["failed_effects", recordFailedEffect, "executor"],
    ["blocked_effects", recordBlockedEffect, "executor"],
  ];
  for (const [key, record, source] of lists) {
    const effects = Array.isArray(run[key]) ? run[key] as unknown[] : [];
    for (const [index, raw] of effects.entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const effect = raw as Record<string, unknown>;
      const operationType = String(effect.type ?? "").trim();
      const mapping = KEEL_LEDGER_EFFECT_TYPES[operationType];
      if (!mapping) continue;
      const committedId = key === "committed_effects"
        ? String(effect[mapping.id_field] ?? "").trim() || null
        : null;
      record(args.ledger, {
        effect_id:
          `${args.ledger.turn_id}:${key}:${mapping.effect_type}:${index}`,
        effect_type: mapping.effect_type,
        operation_type: operationType,
        operation_id: null,
        committed_id: committedId,
        tool_id: operationType,
        source,
        reason_code: String(effect.reason_code ?? status ?? "") || null,
        payload_summary: keelLedgerPayloadSummary(effect),
        db_ref: committedId
          ? { table: mapping.table, id: committedId }
          : null,
      });
    }
  }
}

function effectLedgerForOperationRuntime(
  turnId: string,
  operationRuntime: OperationRuntimeResult | null | undefined,
) {
  const effectLedger = createEffectLedger(turnId);
  recordToolSkillEffectsInLedger({
    ledger: effectLedger,
    toolSkillRun: operationRuntime?.toolSkillRun,
    toolExecution: operationRuntime?.toolExecution ?? "none",
  });
  recordKeelDirectEffectsInLedger({
    ledger: effectLedger,
    toolSkillRun: operationRuntime?.toolSkillRun,
  });
  return effectLedger;
}

async function persistEffectLedgerForRuntimeTurn(args: {
  supabase: SupabaseClient;
  effectLedger: EffectLedger;
  userId: string;
  sourceMessageId?: string | null;
  requestId?: string | null;
  channel: "web" | "whatsapp" | string;
  scope: string;
}) {
  const result = await persistEffectLedgerForTurn({
    supabase: args.supabase,
    ledger: args.effectLedger,
    userId: args.userId,
    sourceMessageId: args.sourceMessageId ?? null,
    requestId: args.requestId ?? null,
    channel: args.channel,
    scope: args.scope,
  });
  if (result.error) {
    console.warn("[Router] persistEffectLedgerForTurn failed", result.error);
  }
}

export function effectLedgerTraceForTest(args: {
  turnId: string;
  operationRuntime?: OperationRuntimeResult | null;
}) {
  return summarizeEffectLedgerForTrace(
    effectLedgerForOperationRuntime(args.turnId, args.operationRuntime),
  );
}

// ===========================================================================
// W4.7 — MAILLON 3: la lane d'EXÉCUTION des deux effets durables KEEL
//
// Même passage que `track_progress_plan_item`: la ROUTE décide (la liste
// `direct_effects_to_run` sort de `routers.ts` puis du gate orchestrateur,
// default-deny), l'exécuteur write-through écrit et RELIT, le ledger compte,
// le renderer n'accuse que ce qui est committé. Rien n'est court-circuité ici:
// les routers de `log_protocol_event` / `declare_deviation` repassent eux-mêmes
// par `runDirectEffectGate` — deux portes du même verrou, toutes deux
// default-deny, jamais une seule qui contredirait l'autre.
// ===========================================================================

function keelToolExecutionFor(
  status: string,
): OperationRuntimeResult["toolExecution"] {
  if (
    status === "logged" || status === "declared" || status === "recorded"
  ) return "success";
  if (status === "failed") return "failed";
  if (status === "ignored") return "none";
  return "blocked";
}

/**
 * Titre de cible du ledger et du contrat de confirmation, construit
 * EXCLUSIVEMENT depuis la ligne RELUE. Les échos de la requête portés par
 * l'effet committé (`substance_ref`, `quantity`) sont volontairement exclus:
 * ils n'ont pas traversé la base, et un accusé de réception ne cite que ce
 * que la base a rendu.
 */
/**
 * Les `commitment_id` qu'une liaison explicite peut légitimement citer ce tour.
 *
 * INVARIANT: c'est le MÊME ensemble que celui rendu par
 * `keelPlanContextPromptBlock` — `today` + `week`. Le bloc est la seule chose
 * que le modèle voit; accepter moins que ce qu'on montre transforme une
 * recopie fidèle en `needs_clarify`, accepter plus rouvre la porte aux id
 * devinés que `resolveCommitmentId` existe pour fermer.
 *
 * Les lignes `week` en font partie: elles apparaissent dans le bloc sous
 * « WEEK GRAIN », et un élève peut parfaitement rapporter aujourd'hui un fait
 * qui s'y rattache.
 */
export function keelBindableCommitmentIds(
  context: KeelPlanContext | null,
): string[] {
  if (!context) return [];
  const ids = [
    ...context.today.map((line) => line.commitment_id),
    ...context.week.map((line) => line.commitment_id),
  ].filter((id) => typeof id === "string" && id.trim() !== "");
  return [...new Set(ids)];
}

function keelCommittedTargetTitle(
  type: string,
  effect: Record<string, unknown>,
): string {
  const localDate = String(effect.local_date ?? "").trim();
  const slot = String(effect.slot_key ?? "").trim();
  const scope = slot ? `${localDate} (${slot})` : localDate;
  if (type === "declare_deviation") {
    const kind = String(effect.kind ?? "").trim();
    return `planned_deviations ${scope}${kind ? ` — ${kind}` : ""}`;
  }
  return `protocol_events ${scope}`;
}

export type KeelDirectEffectLaneInput = {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  turnFrame: TurnFrame;
  routeDecision: RouteDecision;
  tempMemory: unknown;
  keel: KeelTurnContext;
  /**
   * Les identités déjà écrites pour le repas que ce tour PRÉCISE. Elles sont
   * interdites à l'intake: « du poulet avec du riz » en réponse à « et avec
   * quoi ? » ne doit pas refaire un poulet.
   */
  suppressComponentKeys?: readonly string[];
  /** La ligne d'origine à laquelle rattacher un composant ajouté. */
  precisionAnswerTo?: string | null;
  /**
   * L2 — cette exécution est l'ÉCRITURE SILENCIEUSE sous plancher.
   *
   * Elle change UNE chose et une seule: le gate cesse de refuser
   * `log_protocol_event` sur la bande safety (`safetyBandBlocksEffect`). Elle
   * n'ouvre aucun genre de demande, elle ne rend aucun texte, et son runtime
   * ne rejoint jamais le frame — voir le bloc « L2 » de `processMessage`.
   * Absente ⇒ comportement d'avant, gardes fermées.
   */
  floorSilencedWrite?: boolean;
};

/**
 * L'EFFET DU PLANCHER DE REPAS — une seule écriture de ce payload, parce qu'il
 * a maintenant DEUX appelants: l'ajout sur silence du dispatcher, et le FILET
 * qui le rejoue quand la demande du dispatcher a été refusée. Deux copies
 * auraient divergé au premier champ ajouté, et la divergence serait invisible
 * (le filet ne se déclenche qu'une fois sur dix).
 */
export function mealDeclarationFloorEffect(
  hit: MealDeclarationHit,
): TurnFrame["direct_effects"][number] {
  return {
    effect_type: "log_protocol_event",
    explicitness: "explicit",
    target_status: "identified",
    confidence_band: "high",
    payload_hint: {
      // `components` porte la CARDINALITÉ (règle D2 de l'intake): un message
      // qui nomme trois aliments écrit trois lignes, jamais « l'entrée la plus
      // porteuse ».
      components: hit.components.map((c) => ({
        food_group_ref: c.food_group_ref,
      })),
      student_note: hit.studentNote,
      // FF-009. Absente quand le message ne porte aucun marqueur: `null` reste
      // `null`, et ne devient JAMAIS `as_planned`.
      ...(hit.planRelation ? { plan_relation: hit.planRelation } : {}),
    },
  };
}

/**
 * FF-009 — LES REFUS QUI ARMENT LE FILET DU PLANCHER, et EUX SEULS.
 *
 * Ce sont les quatre refus de FORME du payload (`log_protocol_event/router.ts`
 * les range déjà ensemble en `needs_clarify`): le modèle a écrit quelque chose
 * que l'intake ne sait pas lire. Ce sont exactement les cas où un plancher
 * déterministe doit tenir, et ce sont les seuls.
 *
 * ⚠️ CONDITION DE DÉSARMEMENT (P9), et elle est la moitié de la ceinture.
 * `future_intent` (« je vais commander »), `components_already_logged` (la
 * lane de précision a déjà écrit ces composants) et `duplicate_db` sont des
 * refus JUSTES: rejouer dessus écrirait un fait sur une intention, ou un
 * doublon sur un fait déjà en base. Le filet ne les touche pas.
 */
const MEAL_FLOOR_NET_REASONS: ReadonlySet<string> = new Set([
  "unknown_token",
  "unknown_commitment",
  "too_many_components",
  "empty_payload",
]);

export function mealFloorNetArms(args: {
  /** Le fait que le plancher a reconnu, ou `null` s'il n'a rien reconnu. */
  floorHit: MealDeclarationHit | null;
  committedEffects: readonly unknown[];
  blockedEffects: readonly unknown[];
  /** La lane de précision a-t-elle retiré l'effet EXPRÈS ? */
  suppressedByPrecision: boolean;
}): boolean {
  if (args.floorHit === null) return false;
  if (args.suppressedByPrecision) return false;
  const typeOf = (effect: unknown): string =>
    Boolean(effect) && typeof effect === "object" && !Array.isArray(effect)
      ? String((effect as Record<string, unknown>).type ?? "")
      : "";
  // Une seule ligne écrite suffit à désarmer: le fait existe, et le filet ne
  // sert qu'à l'absence totale.
  if (args.committedEffects.some((e) => typeOf(e) === "log_protocol_event")) {
    return false;
  }
  return args.blockedEffects.some((effect) => {
    if (typeOf(effect) !== "log_protocol_event") return false;
    const reason = String(
      (effect as Record<string, unknown>).reason_code ?? "",
    );
    return MEAL_FLOOR_NET_REASONS.has(reason);
  });
}

export async function runKeelDirectEffectLane(
  input: KeelDirectEffectLaneInput,
): Promise<OperationRuntimeResult | null> {
  if (!input.keel.is_student) return null;
  const toRun = new Set(input.routeDecision.direct_effects_to_run);
  const runLog = toRun.has("log_protocol_event");
  const runDeviation = toRun.has("declare_deviation");
  const runConstraint = toRun.has("declare_safety_constraint");
  if (!runLog && !runDeviation && !runConstraint) return null;

  const handlers: string[] = [];
  const replies: string[] = [];
  const requested: unknown[] = [];
  const allowed: unknown[] = [];
  const committed: unknown[] = [];
  const blocked: unknown[] = [];
  const executedTools: string[] = [];
  const statuses: string[] = [];
  const reasons: string[] = [];

  const absorb = (
    handler: string,
    result: {
      detected: boolean;
      status: string;
      reply: string | null;
      executed_tools: readonly string[];
      requested_effects: readonly unknown[];
      allowed_effects: readonly unknown[];
      committed_effects: readonly unknown[];
      blocked_effects: readonly unknown[];
      debug: { reason_code: string };
    },
  ) => {
    if (!result.detected) return;
    handlers.push(handler);
    statuses.push(result.status);
    reasons.push(result.debug.reason_code);
    if (result.reply) replies.push(result.reply);
    requested.push(...result.requested_effects);
    allowed.push(...result.allowed_effects);
    committed.push(
      ...result.committed_effects.map((effect) => ({
        ...(effect as Record<string, unknown>),
        target_title: keelCommittedTargetTitle(
          handler,
          effect as Record<string, unknown>,
        ),
      })),
    );
    blocked.push(...result.blocked_effects);
    // Parité stricte: un outil n'est « exécuté » que s'il a produit une ligne.
    if (result.committed_effects.length > 0) {
      executedTools.push(...result.executed_tools);
    }
  };

  // CEINTURE INTENTION FUTURE — déterministe, sur le MESSAGE, pas sur le frame.
  //
  // La règle 3k-a(1) du prompt dit « jamais sur une intention future », mais un
  // prompt est une intention, pas une garantie: `rose-hard25` a déjà payé une
  // demi-coche committée en silence sur « je vais tester ce soir » côté
  // track_progress, et `p8-revalidation-rose-reds` a montré que les correctifs
  // prompt-only régressent en run réel. Ici l'enjeu est pire: `protocol_events`
  // est APPEND-ONLY — une ligne écrite sur une intention ne se retire pas
  // depuis le chat, et elle nourrira l'évaluateur ce soir.
  //
  // CONDITION DE DÉSARMEMENT (P9), et elle est essentielle: la ceinture ne vaut
  // QUE pour `log_protocol_event`, qui écrit un FAIT. Elle ne touche jamais
  // `declare_deviation`, dont l'objet même est le futur — l'y appliquer
  // rendrait la fonctionnalité impossible à utiliser.
  const futureIntentTurn = isTrackProgressFutureIntent(input.userMessage);
  if (runLog && futureIntentTurn) {
    handlers.push("log_protocol_event");
    statuses.push("blocked");
    reasons.push("future_intent");
    blocked.push({ type: "log_protocol_event", reason_code: "future_intent" });
  }

  // CEINTURE « LE REPAS DE QUELQU'UN D'AUTRE » — FF-009 §7, même forme et même
  // place que la ceinture d'intention future juste au-dessus.
  //
  // MESURÉ (run réel 2026-08-08, 1 tour sur 3): « on a commandé pour les
  // enfants » écrivait une ligne `protocol_events` sans aliment ni créneau. Le
  // plancher avait bien désarmé — son `DISARM` porte le motif — mais désarmer
  // le plancher n'est pas un veto sur le dispatcher: le plancher est un
  // MINIMUM. La ligne dit « l'élève a mangé » là où le message dit le
  // contraire, dans une table APPEND-ONLY, et le coach la lira comme un fait.
  //
  // CONDITION DE DÉSARMEMENT: portée par `isMealForSomeoneElse` (un « j'ai
  // mangé » au passé retire la ceinture), et comme sa voisine, elle ne vaut QUE
  // pour `log_protocol_event`.
  const forSomeoneElseTurn = isMealForSomeoneElse(input.userMessage);
  if (runLog && !futureIntentTurn && forSomeoneElseTurn) {
    handlers.push("log_protocol_event");
    statuses.push("blocked");
    reasons.push("meal_for_someone_else");
    blocked.push({
      type: "log_protocol_event",
      reason_code: "meal_for_someone_else",
    });
  }

  // CEINTURE « JE N'AI RIEN MANGÉ » — FF-017 §7, premier mode de défaillance,
  // et troisième membre de la même famille que ses deux voisines.
  //
  // MESURÉ (run réel 2026-08-08, 1 tour sur 3 dans CHAQUE langue):
  //   élève  : « je n'ai rien mangé aujourd'hui » / « I didn't eat anything today »
  //   base   : une ligne `protocol_events`
  //   réponse: une question de précision — « And what did you have with it? »
  // On demande donc à l'élève avec quoi il a mangé le repas qu'il vient de dire
  // n'avoir pas pris, et le coach lira lundi un repas qui n'a pas eu lieu. Le
  // plancher désarme sur la négation depuis le premier jour; ça n'a jamais été
  // un veto sur le dispatcher.
  //
  // CONDITION DE DÉSARMEMENT: portée par `isNoMealDeclared` — « je n'ai rien
  // mangé ce matin mais j'ai pris du poulet à midi » porte les deux, et c'est le
  // repas qui gagne. Comme ses voisines, elle ne vaut QUE pour
  // `log_protocol_event`.
  const noMealTurn = isNoMealDeclared(input.userMessage);
  if (runLog && !futureIntentTurn && !forSomeoneElseTurn && noMealTurn) {
    handlers.push("log_protocol_event");
    statuses.push("blocked");
    reasons.push("no_meal_declared");
    blocked.push({
      type: "log_protocol_event",
      reason_code: "no_meal_declared",
    });
  }

  if (runLog && !futureIntentTurn && !forSomeoneElseTurn && !noMealTurn) {
    absorb(
      "log_protocol_event",
      await runLogProtocolEventDirectEffect({
        turn_frame: input.turnFrame,
        content_locale: input.keel.content_locale,
        // Le tour de chat EST la source: ni photo ni tap. `evidence_weight`
        // en découle (0.8), il n'est jamais choisi à la main.
        default_source: "chat",
        // L2 — l'unique effet de ce drapeau: le gate cesse de refuser sur la
        // bande safety. Tout le reste du chemin est identique, y compris
        // l'intake, l'idempotence et l'exécuteur write-through.
        floor_silenced_write: input.floorSilencedWrite === true,
        // Le créneau que l'élève a NOMMÉ, lu dans son message. Repli seulement:
        // `payload_hint.slot_key` prime quand le modèle l'émet. Mesuré 0/3 sans
        // ce repli — « for lunch », « at breakfast », « for dinner » écrivaient
        // tous `slot_key = NULL`, ce qui aurait livré le correctif B2 sur une
        // colonne vide.
        slot_named_in_message: slotKeyNamedIn(input.userMessage),
        // L'ALLOWLIST DES LIAISONS EXPLICITES, et elle n'était pas passée.
        //
        // `resolveCommitmentId` (intake.ts) refuse tout `commitment_id` quand
        // la liste est vide — c'est la bonne posture R7 (« une liaison
        // invérifiable est refusée, jamais supposée »). Mais le seul appelant de
        // production ne la fournissait pas: la liste était TOUJOURS vide, donc
        // TOUT `commitment_id` était refusé en `needs_clarify`, donc toute ligne
        // sans `substance_ref` ni `food_group_ref` (mouvement, lumière,
        // sommeil, respiration, écrans, mesure) était INECRIVABLE depuis le
        // chat. Mesuré: « j'ai fait ma marche de 30 minutes » →
        // `status=needs_clarify committed=0 blocked=1`, la ligne mouvement
        // clôturait la journée en `missed`, et la réponse disait « c'est pris
        // en compte ».
        //
        // La liste est EXACTEMENT l'ensemble des lignes que le bloc a montrées
        // au modèle (`today` + `week`, cf. `keelPlanContextPromptBlock`). Toute
        // divergence entre ce qu'on affiche et ce qu'on accepte reproduit le
        // même défaut à l'envers: le modèle recopie fidèlement un id qu'on lui
        // a montré et le runtime le rejette.
        allowed_commitment_ids: keelBindableCommitmentIds(input.keel.plan_context),
        suppress_component_keys: input.suppressComponentKeys ?? null,
        precision_answer_to: input.precisionAnswerTo ?? null,
        write_protocol_event: createProtocolEventWrite({
          supabase: input.supabase,
        }),
      }),
    );
  }

  // QA agent 4 — L'ÉCRITURE DE LA CONTRAINTE DURE.
  //
  // Elle ne porte AUCUNE des deux ceintures des effets voisins, et chacune de
  // ces absences est une décision:
  //   * pas de ceinture « intention future »: « je vais être allergique » n'a
  //     pas de sens. La contrainte est un état, pas un événement daté.
  //   * pas de dépendance au plan: `plan_context` peut être null. Une allergie
  //     déclarée par un élève sans plan publié doit être enregistrée quand
  //     même — c'est précisément le moment où le coach ne l'a pas encore vue.
  if (runConstraint) {
    absorb(
      "declare_safety_constraint",
      await runDeclareSafetyConstraintDirectEffect({
        turn_frame: input.turnFrame,
        user_id: input.userId,
        content_locale: input.keel.content_locale,
        write_safety_constraint: createSafetyConstraintWrite({
          supabase: input.supabase,
        }),
      }),
    );
  }

  if (runDeviation) {
    absorb(
      "declare_deviation",
      await runDeclareDeviationDirectEffect({
        turn_frame: input.turnFrame,
        plan_version_id: input.keel.plan_version_id,
        content_locale: input.keel.content_locale,
        declared_via: "chat",
        read_day_resolution: (localDate: string) =>
          readKeelDayResolution({
            supabase: input.supabase,
            userId: input.userId,
            localDate,
          }),
        // Jamais lu depuis la conversation (contract.ts): une autorisation
        // qu'une couche probabiliste peut affirmer n'est pas une autorisation.
        // Le canal coach n'existe pas encore → aucune dérogation possible.
        coach_backdate_grant: null,
        write_planned_deviation: createPlannedDeviationWrite({
          supabase: input.supabase,
        }),
      }),
    );
  }

  if (handlers.length === 0) return null;

  const selectedHandler = handlers.length === 1
    ? handlers[0]
    : "keel_direct_effects";
  const toolExecution = statuses.some((status) =>
      keelToolExecutionFor(status) === "success"
    )
    ? "success" as const
    : keelToolExecutionFor(statuses[0] ?? "ignored");

  return {
    content: replies.join("\n").trim(),
    nextTempMemory: input.tempMemory,
    toolExecution,
    executedTools: [...new Set(executedTools)],
    toolSkillRun: {
      selected_handler: selectedHandler,
      status: statuses.join("+"),
      reason: reasons.join("+"),
      requested_effects: requested,
      allowed_effects: allowed,
      committed_effects: committed,
      blocked_effects: blocked,
    },
  };
}

/**
 * L'état de résolution d'un jour, lu depuis les FAITS persistés — la règle
 * « le flex se déclare à l'avance » se cale sur la même source de vérité que
 * la note qu'elle protège (`commitment_evaluations`), pas sur une horloge.
 *
 * Aucune ligne ⇒ NON résolu (D2 du `advance_rule`): un jour jamais évalué
 * n'est pas un jour noté, et refuser là punirait un cron en retard.
 * Lecture en échec ⇒ non résolu également, et c'est le bon sens du fail-open
 * pour CE prédicat: il n'ouvre rien, il autorise une déclaration de flex.
 */
async function readKeelDayResolution(args: {
  supabase: SupabaseClient;
  userId: string;
  localDate: string;
}): Promise<DayResolution | null> {
  try {
    const { data, error } = await args.supabase
      .from("commitment_evaluations")
      .select("status")
      .eq("user_id", args.userId)
      .eq("local_date", args.localDate);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ status?: unknown }>;
    if (rows.length === 0) {
      return { local_date: args.localDate, resolved: false };
    }
    const resolved = rows.every((row) => String(row.status ?? "") !== "unknown");
    return {
      local_date: args.localDate,
      resolved,
      resolved_by: resolved ? "commitment_evaluations" : null,
    };
  } catch (error) {
    console.warn("[keel] day resolution read failed", error);
    return null;
  }
}

// Exportés pour `run.ts` seulement (ils n'étaient pas exportés quand ils
// vivaient dans `run.ts`) ; `run.ts` ne les ré-exporte pas.
export { effectLedgerForOperationRuntime, persistEffectLedgerForRuntimeTurn };
