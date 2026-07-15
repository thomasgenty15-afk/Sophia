import {
  createNoteInformation,
  normalizeNoteInformation,
  type NoteInformation,
} from "../../contracts/note_information.v1.ts";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import {
  directEffectTimeContextFromTurnFrame,
  directEffectLocalDispatcherPromptLines,
  withDirectEffectLocalContext,
} from "../../router/direct_effect_local_context.ts";
import {
  LOCAL_ONE_SHOT_DIRECT_EFFECT_EXPECTED_JSON_SHAPE,
  localOneShotDirectEffectPromptLines,
  normalizeLocalOneShotDirectEffectRequest,
} from "../../router/one_shot_local_direct_effect.ts";
import { noteReconciliationPromptLines } from "../_shared/note_reconciliation.ts";
import {
  flowEntryWindow,
  RECENT_MESSAGE_LIMITS,
} from "../../context/recent_messages_policy.ts";
import type {
  FeatureOpportunityConversationContext,
  FeatureOpportunityFlowAction,
  FeatureOpportunityKind,
  FeatureOpportunityLocalDispatcherOutput,
  FeatureOpportunityLocalState,
  FeatureOpportunityReducerResult,
  FeatureOpportunityVisibleTaskKind,
} from "./contract.ts";

const FEATURES = new Set<FeatureOpportunityKind>([
  "initiatives",
  "coach_preferences",
]);

const FLOW_ACTIONS = new Set<FeatureOpportunityFlowAction>([
  "recommend_feature",
  "clarify_opportunity",
  "answer_followup",
  "close_flow",
  "exit_to_global_dispatcher",
]);

const VISIBLE_TASKS = new Set<FeatureOpportunityVisibleTaskKind>([
  "recommend_feature",
  "ask_opportunity_clarification",
  "answer_followup",
  "close_opportunity",
  "exit_ack",
]);

export type FeatureOpportunityLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  previous_state: FeatureOpportunityLocalState | null;
  inbound_note_information?: NoteInformation | null;
  turn_frame?: unknown;
  /** Vrai au tout premier tour possédé par ce flow (aucun état persisté). */
  is_flow_entry?: boolean;
  dispatcher_signal_context: FeatureOpportunityLocalState[
    "dispatcher_signal_context"
  ];
};

export type FeatureOpportunityLocalDispatcher = (
  input: FeatureOpportunityLocalDispatcherInput,
) => Promise<FeatureOpportunityLocalDispatcherOutput | null>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function withoutLegacyPayloadFields(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const { constraints: _constraints, user_words: _userWords, ...rest } = value;
  return rest;
}

function text(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max);
}

function stringArray(value: unknown, max = 8): string[] {
  return Array.isArray(value)
    ? value.map((item) => text(item, 160)).filter(Boolean).slice(0, max)
    : [];
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function riskScore(value: unknown): number {
  const score = Number(value ?? 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
}

function parseObject(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) return raw;
  const source = text(raw, 50_000);
  const unfenced = source.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("feature_opportunity_not_json");
  }
  const parsed = JSON.parse(unfenced.slice(start, end + 1));
  if (!isRecord(parsed)) throw new Error("feature_opportunity_not_object");
  return parsed;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: Set<T>,
  fallback: T,
): T {
  const candidate = text(value);
  return allowed.has(candidate as T) ? candidate as T : fallback;
}

function feature(value: unknown): FeatureOpportunityKind | null {
  const candidate = text(value);
  return FEATURES.has(candidate as FeatureOpportunityKind)
    ? candidate as FeatureOpportunityKind
    : null;
}

function defaultConversationContext(
  patch: Partial<FeatureOpportunityConversationContext> = {},
): FeatureOpportunityConversationContext {
  return {
    feature: patch.feature ?? null,
    user_problem_summary: patch.user_problem_summary ?? null,
    trigger_context: patch.trigger_context ?? null,
    known_values: patch.known_values ?? {},
    direct_effect_confirmation_context:
      patch.direct_effect_confirmation_context ?? null,
    missing_or_weak_values: patch.missing_or_weak_values ?? [],
    recommendation: patch.recommendation ?? {
      feature: patch.feature ?? null,
      why: null,
      user_facing_next_step: null,
    },
    evidence_used: patch.evidence_used ?? [],
    tone_constraints: [
      ...new Set(["concise", "natural", ...(patch.tone_constraints ?? [])]),
    ],
    do_not_say: [
      ...new Set([
        "Ne cite jamais les noms internes des anciennes surfaces de rappel.",
        "Ne dis jamais que Sophia a cree, modifie, programme ou enregistre quelque chose.",
        "Ne mentionne pas JSON, dispatcher, reducer, DB, note_information ou outil interne.",
        ...(patch.do_not_say ?? []),
      ]),
    ],
  };
}

function normalizeConversationContext(
  raw: unknown,
  fallback: FeatureOpportunityConversationContext,
): FeatureOpportunityConversationContext {
  const root = isRecord(raw) ? raw : {};
  return defaultConversationContext({
    feature: feature(root.feature) ?? fallback.feature,
    user_problem_summary: text(root.user_problem_summary) ||
      fallback.user_problem_summary,
    trigger_context: text(root.trigger_context) || fallback.trigger_context,
    known_values: isRecord(root.known_values) ? root.known_values : {},
    direct_effect_confirmation_context: isRecord(
        root.direct_effect_confirmation_context,
      )
      ? root.direct_effect_confirmation_context
      : fallback.direct_effect_confirmation_context ?? null,
    missing_or_weak_values: stringArray(root.missing_or_weak_values, 8),
    recommendation: fallback.recommendation,
    evidence_used: stringArray(root.evidence_used, 8),
    tone_constraints: stringArray(root.tone_constraints, 8),
    do_not_say: stringArray(root.do_not_say, 8),
  });
}

export function readFeatureOpportunityState(
  activeSkillState: unknown,
): FeatureOpportunityLocalState | null {
  if (!isRecord(activeSkillState)) return null;
  if (activeSkillState.skill_id !== "feature_opportunity") return null;
  const working = isRecord(activeSkillState.working_state)
    ? activeSkillState.working_state
    : activeSkillState;
  const local = isRecord(working.feature_opportunity_local_state)
    ? working.feature_opportunity_local_state
    : working;
  return normalizeStoredState(local);
}

function normalizeStoredState(
  value: unknown,
): FeatureOpportunityLocalState | null {
  if (!isRecord(value)) return null;
  return {
    feature: feature(value.feature),
    opportunity_kind: text(value.opportunity_kind) || null,
    user_problem_summary: text(value.user_problem_summary) || null,
    trigger_context: text(value.trigger_context) || null,
    dispatcher_signal_context: isRecord(value.dispatcher_signal_context)
      ? value.dispatcher_signal_context as FeatureOpportunityLocalState[
        "dispatcher_signal_context"
      ]
      : null,
    turn_count: Math.max(0, Number(value.turn_count ?? 0) || 0),
    max_turns: 3,
  };
}

function noteForExit(args: {
  outputNote: unknown;
  userMessage: string;
  state: FeatureOpportunityLocalState | null;
  output: FeatureOpportunityLocalDispatcherOutput;
}): NoteInformation | null {
  const target = "global";
  const structured_context = {
    user_message_summary: args.output.user_problem_summary ?? args.userMessage,
    active_flow_summary:
      "feature_opportunity recommends a product surface and never executes tools.",
    collected_state: {
      feature: args.output.feature ?? args.state?.feature ?? null,
      opportunity_kind: args.output.opportunity_kind ??
        args.state?.opportunity_kind ?? null,
      trigger_context: args.output.trigger_context ??
        args.state?.trigger_context ?? null,
      dispatcher_signal_context: args.state?.dispatcher_signal_context ??
        args.output.visible_task.conversation_context.known_values
          ?.dispatcher_signal_context ??
        null,
    },
    unresolved_questions: [],
    recommended_next_focus: target,
    evidence: args.output.evidence,
  };
  const fallback = createNoteInformation({
    source_flow_id: "feature_opportunity",
    handoff_reason: "topic_change",
    target_dispatcher: target,
    handoff_context_for_next_dispatcher: JSON.stringify(structured_context),
    user_words: [args.userMessage, ...args.output.evidence].filter(Boolean)
      .slice(0, 3),
    structured_context,
    confidence: args.output.confidence,
  });
  return isRecord(args.outputNote)
    ? normalizeNoteInformation(
      {
        ...args.outputNote,
        user_words: fallback.user_words,
        structured_context: withoutLegacyPayloadFields(
          isRecord(args.outputNote.structured_context)
            ? args.outputNote.structured_context
            : structured_context,
        ),
      },
      fallback,
    )
    : fallback;
}

export function normalizeFeatureOpportunityLocalDispatcherOutput(
  raw: unknown,
): FeatureOpportunityLocalDispatcherOutput {
  const root = parseObject(raw);
  const rawAction = text(root.flow_action);
  const action = rawAction === "handoff_to_product_help" ||
      rawAction === "safety_preempt"
    ? "exit_to_global_dispatcher"
    : enumValue<FeatureOpportunityFlowAction>(
      root.flow_action,
      FLOW_ACTIONS,
      "recommend_feature",
    );
  const recommendationRoot = isRecord(root.recommendation)
    ? root.recommendation
    : {};
  const selectedFeature = feature(root.feature) ??
    feature(recommendationRoot.feature);
  const recommendation = {
    feature: feature(recommendationRoot.feature) ?? selectedFeature,
    why: text(recommendationRoot.why, 300) || null,
    user_facing_next_step:
      text(recommendationRoot.user_facing_next_step, 240) || null,
  };
  const stateRoot = isRecord(root.state_updates) ? root.state_updates : {};
  const visibleRoot = isRecord(root.visible_task) ? root.visible_task : {};
  const fallbackContext = defaultConversationContext({
    feature: selectedFeature,
    user_problem_summary: text(root.user_problem_summary) || null,
    trigger_context: text(root.trigger_context) || null,
    recommendation,
    evidence_used: stringArray(root.evidence, 8),
  });
  const visibleKindFallback: FeatureOpportunityVisibleTaskKind =
    action === "clarify_opportunity"
      ? "ask_opportunity_clarification"
      : action === "answer_followup"
      ? "answer_followup"
      : action === "close_flow"
      ? "close_opportunity"
      : action === "exit_to_global_dispatcher"
      ? "exit_ack"
      : "recommend_feature";
  return {
    flow_action: action,
    confidence: confidence(root.confidence),
    risk_score: riskScore(root.risk_score),
    feature: selectedFeature,
    opportunity_kind: text(root.opportunity_kind, 120) || null,
    user_problem_summary: text(root.user_problem_summary) || null,
    trigger_context: text(root.trigger_context) || null,
    recommendation,
    direct_effect_request: normalizeLocalOneShotDirectEffectRequest(
      root.direct_effect_request,
    ),
    state_updates: {
      status: enumValue(
        stateRoot.status,
        new Set(["active", "closing", "closed", "exit_to_global"]),
        action === "close_flow" ? "closed" : "active",
      ),
      turn_count_increment: Math.max(
        0,
        Math.min(1, Number(stateRoot.turn_count_increment ?? 1) || 1),
      ),
      close_after_visible: stateRoot.close_after_visible === true,
    },
    visible_task: {
      kind: enumValue<FeatureOpportunityVisibleTaskKind>(
        visibleRoot.kind,
        VISIBLE_TASKS,
        visibleKindFallback,
      ),
      instruction: text(visibleRoot.instruction),
      conversation_context: normalizeConversationContext(
        isRecord(visibleRoot) ? visibleRoot.conversation_context : null,
        fallbackContext,
      ),
    },
    note_information: null,
    session_style_commitment: text(root.session_style_commitment, 200) || null,
    evidence: stringArray(root.evidence, 8),
  };
}

function mergeState(args: {
  previous: FeatureOpportunityLocalState | null;
  output: FeatureOpportunityLocalDispatcherOutput;
  status: FeatureOpportunityReducerResult["status"];
}): FeatureOpportunityLocalState | null {
  if (args.status !== "continue") return null;
  const previousTurns = args.previous?.turn_count ?? 0;
  return {
    feature: args.output.feature ?? args.previous?.feature ?? null,
    opportunity_kind: args.output.opportunity_kind ??
      args.previous?.opportunity_kind ?? null,
    user_problem_summary: args.output.user_problem_summary ??
      args.previous?.user_problem_summary ?? null,
    trigger_context: args.output.trigger_context ??
      args.previous?.trigger_context ?? null,
    dispatcher_signal_context: args.previous?.dispatcher_signal_context ??
      null,
    turn_count: Math.min(
      3,
      previousTurns + args.output.state_updates.turn_count_increment,
    ),
    max_turns: 3,
  };
}

export function reduceFeatureOpportunityLocalDispatcherOutput(args: {
  previous: FeatureOpportunityLocalState | null;
  output: FeatureOpportunityLocalDispatcherOutput;
  userMessage: string;
}): FeatureOpportunityReducerResult {
  let output = args.output;
  const nextTurnCount = (args.previous?.turn_count ?? 0) +
    output.state_updates.turn_count_increment;
  if (nextTurnCount >= 3 && output.flow_action === "clarify_opportunity") {
    output = {
      ...output,
      flow_action: output.recommendation.feature
        ? "recommend_feature"
        : "close_flow",
      state_updates: {
        ...output.state_updates,
        status: output.recommendation.feature ? "active" : "closed",
        close_after_visible: !output.recommendation.feature,
      },
      visible_task: {
        ...output.visible_task,
        kind: output.recommendation.feature
          ? "recommend_feature"
          : "close_opportunity",
      },
    };
  }
  if (
    output.flow_action === "exit_to_global_dispatcher" || output.risk_score >= 7
  ) {
    return {
      status: "exit",
      reason_code: "feature_opportunity_exit_to_global",
      local_state: null,
      visible_task: "exit_ack",
      conversation_context: output.visible_task.conversation_context,
      note_information: noteForExit({
        outputNote: output.note_information,
        userMessage: args.userMessage,
        state: args.previous,
        output,
      }),
      effects: { requested: [], allowed: [], blocked: [], committed: [] },
    };
  }
  const complete = output.flow_action === "close_flow" ||
    output.state_updates.close_after_visible ||
    output.state_updates.status === "closed";
  const status = complete ? "complete" : "continue";
  const signalContext = args.previous?.dispatcher_signal_context ?? null;
  return {
    status,
    reason_code: complete
      ? "feature_opportunity_complete"
      : "feature_opportunity_continue",
    local_state: mergeState({ previous: args.previous, output, status }),
    visible_task: output.visible_task.kind,
    conversation_context: defaultConversationContext({
      ...output.visible_task.conversation_context,
      feature: output.feature ?? signalContext?.feature ?? null,
      user_problem_summary: output.user_problem_summary ??
        signalContext?.user_problem_summary ?? null,
      trigger_context: output.trigger_context ??
        signalContext?.trigger_context ?? null,
      recommendation: output.recommendation.feature ? output.recommendation : {
        ...output.recommendation,
        feature: signalContext?.feature ?? null,
      },
      known_values: {
        ...output.visible_task.conversation_context.known_values,
        dispatcher_signal_context: signalContext,
      },
      evidence_used: output.evidence,
    }),
    note_information: null,
    effects: { requested: [], allowed: [], blocked: [], committed: [] },
  };
}

export function dispatcherPrompt(input: FeatureOpportunityLocalDispatcherInput) {
  const conversationWindow = flowEntryWindow({
    recent_messages: input.recent_messages,
    user_message: input.user_message,
    is_cold_entry: input.is_flow_entry === true,
    continuation_limit: RECENT_MESSAGE_LIMITS.subskillHistory,
  });
  return [
    "Tu es le dispatcher local du skill feature_opportunity.",
    ...conversationWindow.framing,
    ...noteReconciliationPromptLines(),
    "Retourne uniquement le JSON demande. Ne reponds pas au user.",
    "Ce flow detecte une opportunite produit non-coaching: initiatives ou coach_preferences.",
    "Ce flow ne cree rien, ne modifie rien, ne programme rien, ne sauvegarde rien et n'appelle aucun executor.",
    "Priorise selon dispatcher_signal_context.feature et conserve dispatcher_signal_context dans le state jusqu'a la sortie.",
    "initiatives: contexte recurrent, rituel, soutien recurrent de Sophia, message recurrent, difficulte avant/apres un moment repete. Ces signaux font partie du scope feature_opportunity et ne doivent pas faire quitter le flow. Nom visible obligatoire: initiatives. Ne cite jamais les noms internes des anciennes surfaces de rappel.",
    "coach_preferences: feedback sur le style Sophia, trop de questions, trop long, ton inadequat, besoin de plus directif/doux.",
    "Preference de style DURABLE ('pour la suite', 'a partir de maintenant', alex-r2 B03): la reponse porte TOUJOURS les trois volets — (1) application immediate ('je le fais des maintenant'), (2) honnetete sur la portee (le reglage durable depuis le chat arrive dans une prochaine version), (3) renvoi vers Preferences coach pour le reglage durable. INTERDIT: acquitter seulement 'sur cette conversation' sans les volets 2-3 (le user croirait la preference perdue ensuite), et n'expose jamais un libelle de portee interne comme formule seche.",
    "session_style_commitment (eva-r7 B01): quand l'opportunite est une preference de STYLE que la reponse acquitte pour la session ('sans emojis', 'plus direct', 'reponses plus courtes'), remplis session_style_commitment avec la contrainte exacte en quelques mots (ex: 'sans emojis, ton sobre et direct'). Ce champ fait tenir l'engagement sur TOUS les tours suivants de la session, soutien compris. Laisse null si aucune contrainte de style n'est acquittee ce tour.",
    "Il n'y a aucun handoff local depuis feature_opportunity. Si le sujet sort de l'opportunite produit, question produit autonome incluse, utilise exit_to_global_dispatcher avec target_dispatcher=global.",
    "Sortent aussi du perimetre: une demande explicite de memorisation ('retiens que', 'garde-le en tete', 'je veux que tu le retiennes') et un report d'action accomplie/ratee ('c'est fait', 'marque-le'). Utilise exit_to_global_dispatcher: la memorisation et le tracking sont geres par le runtime global, jamais par une initiative.",
    "Sort aussi du perimetre: une demande d'INFORMATION ou de LECTURE ('montre-moi mon plan', 'mes actions actives', 'mes rappels en attente', 'où j'en suis ?', un recap). Utilise exit_to_global_dispatcher: la reponse normale possede la projection reelle du plan et des rappels. Ne tente jamais d'y repondre depuis ce flow et ne demande jamais au user de fournir sa propre liste.",
    "Si le user pose une question de comprehension directement liee a l'opportunite deja detectee, reste dans le flow et choisis answer_followup: le visible agent a les definitions produit utiles pour aiguiller.",
    "answer_followup est reserve a une question, clarification ou complement PORTANT sur l'opportunite deja detectee (initiatives ou coach_preferences). Une nouvelle intention explicite hors de cette opportunite ne doit jamais etre traitee en answer_followup, meme si elle parait thematiquement proche: utilise exit_to_global_dispatcher.",
    "Sortie obligatoire (exit_to_global_dispatcher, target_dispatcher=global) quand le message courant est: (a) une demande de revoir, ajuster, alleger, reorganiser ou refaire son plan, planning, semaine ou rythme; ou (b) un etat emotionnel, une detresse, un decouragement ou un 'a quoi bon' sans demande d'opportunite produit. Ne requalifie pas ces messages en opportunite initiatives ou coach_preferences.",
    "Sortie obligatoire sur REJET de la piste: si le user decline explicitement l'opportunite proposee ('non', 'pas ca', 'je veux pas d'initiative', 'c'est pas ce que je demande') ou demande a la place un levier/outil concret pour un moment precis ('aide-moi a gerer ce moment', 'un truc pour reperer le piege'), tu ne re-proposes JAMAIS la meme opportunite: utilise exit_to_global_dispatcher avec une note_information qui dit ce qui a ete propose, que le user l'a decline, et ce qu'il demande a la place (avec ses mots). Le dispatcher global re-route le tour. Anti-faux-positif: une question ou hesitation sur la MEME opportunite ('comment ca marche ?', 'tu la mettrais a quelle heure ?') n'est pas un rejet — continue le flow.",
    "FRONTIERE DE CAPACITE AVANT RELAIS (eva-global18 T8): quand la demande porte une capacite qui N'EXISTE PAS (bloquer/couper des apps, verrouiller le telephone, controler l'OS, agir a la place du user), la reponse ACTE d'abord l'impossibilite en une phrase claire ('je ne peux pas couper tes apps ni controler ton telephone') AVANT de proposer le relais reel, en nommant sa nature exacte (un rappel/nudge a heure fixe, pas un blocage). Reframer directement en initiative sans acter la limite laisse croire que l'initiative bloquera les apps — c'est l'erreur observee.",
    "Rappel recurrent explicite ('un rappel tous les jours a 18h', 'chaque matin'): c'est bien une opportunite initiatives (user-owned, aucun rappel recurrent ne s'ecrit depuis le chat), mais la reponse doit ACCOMPAGNER, pas renvoyer sec: explique en une phrase ce qu'est une initiative, donne la destination (Dashboard > Initiatives), et propose de garder le creneau exprime en tete pour la configuration. Ne dis jamais que tu l'as cree ni que ce n'est pas possible: c'est possible, c'est juste le user qui le configure.",
    ...directEffectLocalDispatcherPromptLines(),
    ...localOneShotDirectEffectPromptLines("feature_opportunity actif"),
    "Regle prioritaire create_one_shot_reminder pendant feature_opportunity: si current_user_message contient une demande explicite de rappel ponctuel avec un delai ou moment exploitable, tu dois remplir direct_effect_request.requested=true, meme si le reste du message demande de formuler, clarifier, recommander ou expliquer l'opportunite. Ne mets jamais cette demande seulement dans user_problem_summary, recommendation.user_facing_next_step, visible_task.instruction, evidence ou state_updates: ces champs narratifs ne declenchent pas la lane directe.",
    "Invariant feature direct-effect: les choix flow_action=recommend_feature, clarify_opportunity ou answer_followup ne peuvent jamais effacer un direct_effect_request explicite. Si le user dit 'rappelle-moi dans X minutes de Y' et ajoute 'aide-moi a formuler', 'dis-moi quoi regler', 'explique' ou une question feature, tu dois rendre les deux: direct_effect_request pour le rappel, et visible_task pour le besoin feature restant.",
    "Exemple direct_effect_request 1 - feature opportunity + rappel ponctuel dans le meme message: user='Oui, et rappelle-moi dans 42 minutes de noter cette idee dans Initiatives pendant que tu m'aides a la formuler.' => reste dans feature_opportunity pour formuler l'opportunite, et remplis direct_effect_request avec requested=true, effect_type=create_one_shot_reminder, explicitness=explicit, target_status=identified, payload_hint.raw_text='rappelle-moi dans 42 minutes de noter cette idee dans Initiatives', payload_hint.when_hint='dans 42 minutes', payload_hint.UTC_time=instant ISO UTC calcule depuis platform_context.direct_effect_time_context, payload_hint.local_label='dans 42 minutes', payload_hint.instruction_hint='noter cette idee dans Initiatives'.",
    "Exemple direct_effect_request 2 - rappel explicite avant de continuer feature opportunity: user='Cree d'abord le rappel: rappelle-moi dans 47 minutes de vider la tasse sur le bureau.' => ne sors pas vers global, ne redemande pas le rappel, continue feature_opportunity sur le besoin restant et remplis direct_effect_request avec requested=true, effect_type=create_one_shot_reminder, explicitness=explicit, target_status=identified, payload_hint.raw_text='rappelle-moi dans 47 minutes de vider la tasse sur le bureau', payload_hint.when_hint='dans 47 minutes', payload_hint.UTC_time=instant ISO UTC calcule depuis platform_context.direct_effect_time_context, payload_hint.local_label='dans 47 minutes', payload_hint.instruction_hint='vider la tasse sur le bureau'.",
    'Example JSON direct_effect_request feature - rappel + formulation dans le meme tour: user="Oui, et rappelle-moi dans 31 minutes de noter cette idee dans Initiatives pendant que tu m aides a la formuler." => inclure obligatoirement {"flow_action":"answer_followup","direct_effect_request":{"requested":true,"effect_type":"create_one_shot_reminder","explicitness":"explicit","target_status":"identified","confidence_band":"high","payload_hint":{"raw_text":"rappelle-moi dans 31 minutes de noter cette idee dans Initiatives","when_hint":"dans 31 minutes","UTC_time":"instant ISO UTC calcule depuis platform_context.direct_effect_time_context","local_label":"dans 31 minutes","instruction_hint":"noter cette idee dans Initiatives"},"reason":"rappel ponctuel explicite avec delai exploitable"},"visible_task":{"kind":"answer_followup","instruction":"aider a formuler l opportunite restante, sans confirmer le rappel avant commit"}}.',
    JSON.stringify({
      current_user_message: input.user_message,
      recent_messages: conversationWindow.messages,
      previous_state: input.previous_state,
      dispatcher_signal_context: input.dispatcher_signal_context,
      inbound_note_information: input.inbound_note_information ?? null,
      platform_context: withDirectEffectLocalContext(
        {},
        (input.turn_frame as any)?.plan_snapshot ?? null,
        undefined,
        directEffectTimeContextFromTurnFrame(input.turn_frame),
      ),
      direct_effect_lane: (input.turn_frame as any)?.direct_effect_lane ?? null,
      direct_effect_confirmation_context:
        (input.turn_frame as any)?.direct_effect_confirmation_context ?? null,
      expected_json_shape: {
        flow_action:
          "recommend_feature|clarify_opportunity|answer_followup|close_flow|exit_to_global_dispatcher",
        confidence: "low|medium|high",
        risk_score: 0,
        feature: "initiatives|coach_preferences|null",
        opportunity_kind: "string|null",
        user_problem_summary: "string|null",
        trigger_context: "string|null",
        recommendation: {
          feature: "initiatives|coach_preferences|null",
          why: "string|null",
          user_facing_next_step: "string|null",
        },
        direct_effect_request: LOCAL_ONE_SHOT_DIRECT_EFFECT_EXPECTED_JSON_SHAPE,
        state_updates: {
          status: "active|closing|closed|exit_to_global",
          turn_count_increment: 1,
          close_after_visible: false,
        },
        visible_task: {
          kind:
            "recommend_feature|ask_opportunity_clarification|answer_followup|close_opportunity|exit_ack",
          instruction: "string",
          conversation_context: {
            direct_effect_confirmation_context:
              "copie filtree du direct_effect_confirmation_context ou null",
          },
        },
        note_information: null,
        evidence: [],
      },
    }),
  ].join("\n");
}

export async function runFeatureOpportunityLocalDispatcher(
  input: FeatureOpportunityLocalDispatcherInput,
): Promise<FeatureOpportunityLocalDispatcherOutput | null> {
  try {
    const raw = await generateWithGemini(
      dispatcherPrompt(input),
      input.user_message,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel(),
        source: "feature_opportunity.local_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizeFeatureOpportunityLocalDispatcherOutput(raw);
  } catch (error) {
    console.warn("[FeatureOpportunity] local dispatcher failed", error);
    return null;
  }
}
