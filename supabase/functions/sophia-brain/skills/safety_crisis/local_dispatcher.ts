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
  localOneShotDirectEffectPromptLines,
  normalizeLocalOneShotDirectEffectRequest,
  oneShotDirectEffectFromLocalRequest,
  turnFrameHasOneShotReminderDirectEffect,
} from "../../router/one_shot_local_direct_effect.ts";
import type { RunSkillInput } from "../_shared/skill_helpers.ts";
import type { NoteInformation } from "../../contracts/note_information.v1.ts";
import { RECENT_MESSAGE_LIMITS } from "../../context/recent_messages_policy.ts";
import {
  emptySafetySignal,
  type SafetyCrisisLocalDispatcherOutput,
  type SafetyCrisisLocalFlowAction,
  type SafetyCrisisProductToolAttemptKind,
  type SafetyCrisisResolutionFact,
  type SafetyCrisisSnapshot,
  type SafetySignal,
} from "./contract.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";

export type SafetyCrisisLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: RunSkillInput["context"]["recent_messages"];
  source_safety_context: {
    risk_band: SafetyCrisisSnapshot["source_risk_band"];
    reason_codes?: string[];
    evidence?: unknown[];
  };
  previous_active_safety_state: RunSkillInput["context"][
    "active_skill_working_state"
  ];
  note_information_inbound?: NoteInformation | null;
  prior_phase: string | null;
  prior_known_facts: Record<string, unknown>;
  channel?: string | null;
  timezone?: string | null;
  turn_frame: unknown;
};

export type SafetyCrisisLocalDispatcher = (
  input: SafetyCrisisLocalDispatcherInput,
) => Promise<SafetyCrisisLocalDispatcherOutput | null>;

const FLOW_ACTIONS = new Set([
  "answer_safety_check",
  "provide_means_status",
  "provide_alone_status",
  "provide_support_status",
  "provide_emergency_status",
  "provide_deescalation_evidence",
  "needs_grounding",
  "repeat_current_step",
  "product_or_tool_attempt",
  "wants_to_exit",
  "exit_to_global_dispatcher",
  "exit_to_global_dispatcher",
  "safety_escalate",
]);

const CURRENT_NEEDS = new Set([
  "immediate_risk_check",
  "grounding",
  "move_means_away",
  "contact_human",
  "stay_with_support",
  "exit_request",
  "unclear",
]);

const PRODUCT_TOOL_ATTEMPTS = new Set([
  "product_question",
  "tool_creation",
  "plan_work",
  "status_request",
  "none",
]);

const RESOLUTION_FACTS = new Set([
  "immediate_danger_absent",
  "means_safe",
  "human_support_available",
  "not_alone",
  "no_fresh_risk_signal",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableString(value: unknown, max = 320): string | null {
  const text = stringValue(value).slice(0, max);
  return text || null;
}

function stringArray(value: unknown, max = 12): string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean).slice(0, max)
    : [];
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) return raw;
  const text = String(raw ?? "").trim();
  let cleaned = text;
  if (cleaned.startsWith("```")) {
    const firstLineEnd = cleaned.indexOf("\n");
    cleaned = firstLineEnd >= 0 ? cleaned.slice(firstLineEnd + 1) : "";
  }
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("safety_crisis_local_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!isRecord(parsed)) {
    throw new Error("safety_crisis_local_dispatcher_not_object");
  }
  return parsed;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: Set<string>,
  fallback: T,
): T {
  const raw = stringValue(value);
  return allowed.has(raw) ? raw as T : fallback;
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

function booleanOrFalse(value: unknown): boolean {
  return value === true;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function uncertainty(value: unknown): SafetySignal["uncertainty"] {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : "high";
}

function rejectForbiddenMutations(root: Record<string, unknown>) {
  for (
    const key of [
      "operation_suggestions",
      "requested_effects",
      "allowed_effects",
      "committed_effects",
    ]
  ) {
    const value = root[key];
    if (Array.isArray(value) && value.length > 0) {
      throw new Error(`safety_crisis_local_dispatcher_forbidden_${key}`);
    }
  }
  if (isRecord(root.pending_confirmation)) {
    throw new Error("safety_crisis_local_dispatcher_forbidden_confirmation");
  }
}

function normalizeNoTooling(
  value: unknown,
): SafetyCrisisLocalDispatcherOutput["no_tooling"] {
  const root = isRecord(value) ? value : {};
  const noTooling = {
    product_help_called: false,
    status_lookup_called: false,
    legacy_operation_called: false,
    operation_route_created: false,
    pending_confirmation_created: false,
    db_write_committed: false,
  } as const;
  for (const key of Object.keys(noTooling)) {
    if (root[key] === true) {
      throw new Error(`safety_crisis_local_dispatcher_tooling_${key}`);
    }
  }
  return noTooling;
}

export function normalizeSafetyCrisisLocalDispatcherOutput(
  raw: unknown,
): SafetyCrisisLocalDispatcherOutput {
  const root = parseJsonObject(raw);
  rejectForbiddenMutations(root);
  const signalsRoot = isRecord(root.safety_signals) ? root.safety_signals : {};
  const summaryRoot = isRecord(root.user_state_summary)
    ? root.user_state_summary
    : {};
  const boundaryRoot = isRecord(root.product_tool_boundary)
    ? root.product_tool_boundary
    : {};
  const exitRoot = isRecord(root.exit_request) ? root.exit_request : {};
  const hintsRoot = isRecord(root.state_hints) ? root.state_hints : {};
  const flowAction = enumValue<SafetyCrisisLocalFlowAction>(
    root.flow_action,
    FLOW_ACTIONS,
    "answer_safety_check",
  );
  const attempted = boundaryRoot.attempted === true ||
    flowAction === "product_or_tool_attempt";

  return {
    flow_action: flowAction,
    confidence: confidence(root.confidence),
    risk_score: riskScore(root.risk_score),
    safety_signals: emptySafetySignal({
      suicidal_ideation: booleanOrFalse(signalsRoot.suicidal_ideation),
      self_harm_intent: booleanOrFalse(signalsRoot.self_harm_intent),
      immediate_danger: booleanOrNull(signalsRoot.immediate_danger),
      has_means_nearby: booleanOrNull(signalsRoot.has_means_nearby),
      means_moved_away: booleanOrNull(signalsRoot.means_moved_away),
      user_currently_alone: booleanOrNull(signalsRoot.user_currently_alone),
      human_support_available: booleanOrNull(
        signalsRoot.human_support_available,
      ),
      emergency_help_contacted: booleanOrNull(
        signalsRoot.emergency_help_contacted,
      ),
      clarified_non_immediate: booleanOrFalse(
        signalsRoot.clarified_non_immediate,
      ),
      deescalation_evidence: booleanOrFalse(
        signalsRoot.deescalation_evidence,
      ),
      uncertainty: uncertainty(signalsRoot.uncertainty),
    }),
    user_state_summary: {
      paraphrase: nullableString(summaryRoot.paraphrase),
      current_need: enumValue(
        summaryRoot.current_need,
        CURRENT_NEEDS,
        "unclear",
      ),
      what_changed_since_previous_turn: nullableString(
        summaryRoot.what_changed_since_previous_turn,
      ),
    },
    product_tool_boundary: {
      attempted,
      attempt_kind: enumValue<SafetyCrisisProductToolAttemptKind>(
        boundaryRoot.attempt_kind,
        PRODUCT_TOOL_ATTEMPTS,
        attempted ? "tool_creation" : "none",
      ),
      defer_reason: nullableString(boundaryRoot.defer_reason),
    },
    direct_effect_request: normalizeLocalOneShotDirectEffectRequest(
      root.direct_effect_request,
    ),
    exit_request: {
      requested: exitRoot.requested === true ||
        flowAction === "wants_to_exit",
      why_user_thinks_safe: nullableString(exitRoot.why_user_thinks_safe),
      missing_resolution_facts: stringArray(
        exitRoot.missing_resolution_facts,
        8,
      ).filter((fact): fact is SafetyCrisisResolutionFact =>
        RESOLUTION_FACTS.has(fact)
      ),
    },
    state_hints: {
      suggested_trigger_summary: nullableString(
        hintsRoot.suggested_trigger_summary,
      ),
      suggested_last_user_safety_signal: nullableString(
        hintsRoot.suggested_last_user_safety_signal,
      ),
    },
    no_tooling: normalizeNoTooling(root.no_tooling),
    modified_fields: stringArray(root.modified_fields, 12),
    clear_fields: stringArray(root.clear_fields, 12),
    evidence: stringArray(root.evidence, 12),
  };
}

export type SafetyCrisisOneShotDirectEffectDecision = {
  effect: TurnFrame["direct_effects"][number] | null;
  /** Demande explicite non admise ce tour, a differer HONNETEMENT via le stage
   * product_tool_boundary (jamais en silence). null = rien a differer. */
  deferred_reason: string | null;
};

/** Admission safety d'un rappel demande pendant une crise (eva-r9 B01).
 * Arbitrage acte 2026-07-08: la demande explicite reste servie (jamais de
 * blocage total), MAIS (a) jamais sur un tour safety_escalate ou avec danger
 * immediat — differee honnetement; (b) confiance high exigee (plus strict que
 * la porte partagee); (c) contenu juge "safe" par le dispatcher local exige —
 * fail-closed: sans jugement, pas de rappel pendant une crise. Un contenu
 * flagged n'est ni cree ni promis pour apres: le besoin se traite dans la
 * conversation safety. */
export function safetyCrisisOneShotDirectEffectDecision(
  output: SafetyCrisisLocalDispatcherOutput | null,
  options?: {
    turnFrame?: Pick<TurnFrame, "direct_effects"> | null;
  },
): SafetyCrisisOneShotDirectEffectDecision {
  const request = output?.direct_effect_request ?? null;
  const effect = oneShotDirectEffectFromLocalRequest(request, {
    turnFrame: options?.turnFrame ?? null,
  });
  const escalated = output?.flow_action === "safety_escalate" ||
    output?.safety_signals.immediate_danger === true;
  // P3-A (alex-safety-escalation R1-B01): AUCUN effet durable ne se committe
  // depuis un tour de crise safety — jamais. L'ancienne admission (bénin +
  // haute confiance + non-escalade) committait un rappel trivial au milieu
  // d'une crise suicidaire (« mets-moi un rappel de racheter des capsules »
  // au tour qui suit l'idéation). L'exception V5-1 vit UNIQUEMENT sur la
  // route détresse medium NON-crise (distress_support, hors de ce flow).
  // Ici: différé honnête systématique quand la demande est explicite et le
  // contenu sain; sinon silence (le contrat de refus des contenus flaggés
  // reste inchangé).
  void effect;
  const explicitRequest = request?.requested === true &&
    request.effect_type === "create_one_shot_reminder" &&
    request.explicitness === "explicit";
  const deferrable = explicitRequest && !escalated &&
    request.content_risk !== "flagged";
  return {
    effect: null,
    deferred_reason: deferrable
      ? "rappel ponctuel demande pendant la crise, mis de cote pour apres la stabilisation"
      : null,
  };
}

export function oneShotDirectEffectFromSafetyCrisisLocalDispatcherOutput(
  output: SafetyCrisisLocalDispatcherOutput | null,
  options?: {
    turnFrame?: Pick<TurnFrame, "direct_effects"> | null;
  },
): TurnFrame["direct_effects"][number] | null {
  return safetyCrisisOneShotDirectEffectDecision(output, options).effect;
}

let dispatcherForTest: SafetyCrisisLocalDispatcher | null = null;

export function setSafetyCrisisLocalDispatcherForTest(
  dispatcher: SafetyCrisisLocalDispatcher | null,
) {
  dispatcherForTest = dispatcher;
}

function compactRecentMessages(
  recentMessages: SafetyCrisisLocalDispatcherInput["recent_messages"],
) {
  return recentMessages.slice(-RECENT_MESSAGE_LIMITS.conversationRepair).map((
    message,
  ) => ({
    role: message.role,
    content: String(message.content ?? "").replace(/\s+/g, " ").trim().slice(
      0,
      280,
    ),
  }));
}

export function dispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local structure du flow safety_crisis.",
    "Le flow safety_crisis est actif ou vient d'etre selectionne par la couche safety. Tu n'es pas le dispatcher global.",
    "Tu ne reponds jamais directement au user. Tu retournes uniquement un JSON strict conforme au contrat.",
    "Mission: comprendre ce que le message user apporte au flow safety: danger immediat, auto-agression, moyens dangereux proches ou eloignes, solitude, aide humaine, aide d'urgence, desescalade, grounding, repetition, tentative produit/outil/plan/statut, demande de sortie.",
    "Tu ne choisis pas la phase finale et tu ne declares jamais le flow resolved. Le reducer safety choisira la phase et la prochaine tache visible.",
    "L'assistant IA ne compte jamais comme aide humaine.",
    '"Je vais mieux" ne suffit pas a resoudre le flow sans faits sur danger immediat, moyens, solitude/support.',
    "Si le user demande explicitement un rappel ponctuel pendant safety, remplis direct_effect_request pour create_one_shot_reminder seulement si turn_frame.direct_effects ne contient pas deja create_one_shot_reminder. Si le global l'a deja flagge, garde direct_effect_request.requested=false et continue safety sur le besoin restant. Pour potion, carte, plan, preference, statut ou aide produit, retourne product_or_tool_attempt. Ne route pas.",
    "Si le user veut arreter le flow ou apporte un nouveau sujet clair, retourne exit_to_global_dispatcher seulement si les faits solides de securite actuelle permettent une sortie. Sinon, reste dans safety avec wants_to_exit ou une action safety.",
    "Tu peux demander le direct_effect standard create_one_shot_reminder via direct_effect_request; tu ne l'executes jamais toi-meme, tu ne confirmes jamais sa creation, et tu ne crees aucune confirmation.",
    'Si une information est absente, retourne null. Si la formulation est contradictoire ou ambigue, uncertainty="high".',
    "no_tooling.* doit toujours etre false.",
    "",
    "Field Completion Rules:",
    "- flow_action: decision principale de ce tour. Elle doit refleter le message courant dans l'etat safety, pas seulement prior_phase. Utilise answer_safety_check pour une reponse safety generale; provide_means_status quand le user donne une info sur moyens proches/eloignes; provide_alone_status pour solitude/presence; provide_support_status pour aide humaine; provide_emergency_status pour urgence appelee/contactee; provide_deescalation_evidence quand le user donne des preuves concretes de securite actuelle; needs_grounding quand il reste submerge sans fait exploitable; repeat_current_step quand il demande de repeter; product_or_tool_attempt quand il demande produit, statut, plan, potion, carte ou outil hors rappel ponctuel; wants_to_exit quand il veut sortir mais que les faits de resolution manquent; exit_to_global_dispatcher quand il veut arreter ou apporte un nouveau sujet clair ET que les faits solides de securite actuelle permettent une sortie; safety_escalate si danger immediat, moyen proche avec risque d'acte, ou besoin d'urgence. Pour un rappel ponctuel explicite, garde une action safety pertinente et remplis direct_effect_request uniquement si le global ne l'a pas deja flagge dans turn_frame.direct_effects. N'invente pas legacy local handoff action: cette action n'existe pas dans ce contrat.",
    "- confidence: high si l'intention et les faits safety sont explicites; medium si l'intention est probable mais incomplete; low si le message est vague, contradictoire, ou demande prudence. La confidence aide le reducer a rester conservateur via uncertainty/evidence; elle ne suffit jamais a resoudre le flow.",
    "- risk_score: score local 0-10 raccord avec le risque du tour. 0-2 seulement si absence de danger actuelle explicitement et aucun signal frais; 3-5 pour ideation passive, doute ou sortie incomplete; 6-7 pour risque actif non immediat ou moyens/incertitude; 8-10 pour danger immediat, moyens proches avec intention, urgence ou safety_escalate. Ne cree pas de safety fictive, mais ne minimise pas une formulation de danger.",
    "- safety_signals: faits safety extraits du message courant. suicidal_ideation/self_harm_intent true seulement si exprime ou clairement implique; immediate_danger true si risque maintenant/prochain geste; has_means_nearby true/false selon proximite actuelle des moyens; means_moved_away true seulement si le user dit les avoir eloignes/confies/rendus inaccessibles; user_currently_alone true/false selon presence humaine reelle; human_support_available true seulement pour personne humaine disponible/presente/en appel; emergency_help_contacted true seulement si urgences/3114/service d'urgence contacte; clarified_non_immediate true si le user clarifie explicitement pas d'acte immediat; deescalation_evidence true seulement avec faits concrets de securite. Laisse null/false quand absent; ne transforme pas une hypothese en fait.",
    "- Consommation du triage (rose-r5 B02): quand le message courant REPOND aux questions de triage ('non pas de danger', 'oui je suis seule', 'personne avec moi'), remplis immediate_danger et user_currently_alone avec la valeur repondue — ne laisse JAMAIS null une reponse claire. Une reponse consommee ne se redemande jamais: le reducer bascule vers le soutien.",
    "- safety_signals.uncertainty: low si les faits sont nets et coherents; medium si partiels; high si absents, contradictoires, vagues ou si le message peut cacher un danger. Le reducer utilise cette prudence pour choisir le stage visible.",
    "- user_state_summary: paraphrase courte du besoin safety courant, sans diagnostic. current_need doit etre le besoin dominant parmi immediate_risk_check, grounding, move_means_away, contact_human, stay_with_support, exit_request, unclear. what_changed_since_previous_turn resume seulement le changement utile pour le reducer/visible context. Null si rien de fiable.",
    "- product_tool_boundary: attempted=true uniquement si le user essaie d'obtenir produit/statut/outil/plan/potion/carte pendant safety. Ne l'utilise pas pour un rappel ponctuel explicite: utilise direct_effect_request. attempt_kind doit etre product_question, tool_creation, plan_work ou status_request; none si aucun attempt. defer_reason explique en une phrase pourquoi c'est differe. Ce champ influence visible_task product_tool_boundary; il ne route jamais vers product_help/status/tool.",
    ...localOneShotDirectEffectPromptLines("safety"),
    "- Specificite direct_effect_request safety: instruction_hint = uniquement ce qu'il faut rappeler sans absorber le besoin safety restant.",
    "- direct_effect_request.content_risk: juge le CONTENU du rappel demande dans le contexte de crise. 'safe' uniquement si l'instruction est benigne et soutenante (appeler un proche, couper le telephone, boire de l'eau, aller se coucher). 'flagged' si elle touche de pres ou de loin aux moyens de se blesser, aux substances (medicaments, alcool), a l'automutilation, a un comportement a risque, ou si son execution pourrait aggraver la crise. En cas de doute, 'flagged'. Un rappel flagged n'est jamais cree: le besoin se traite dans la conversation safety, sans promesse de le programmer plus tard.",
    "- Meme si la demande de rappel est explicite, sur un tour safety_escalate ou avec immediate_danger=true, garde requested=true et remplis les champs honnetement: le runtime differera le rappel lui-meme. Ne choisis jamais une flow_action plus faible pour faire passer un rappel.",
    "- exit_request: requested=true si le user veut partir, arreter, ou affirme que c'est bon. why_user_thinks_safe reprend seulement les raisons donnees. missing_resolution_facts liste les faits manquants parmi immediate_danger_absent, means_safe, human_support_available, not_alone, no_fresh_risk_signal. Ne marque pas resolved; le reducer decide.",
    "- state_hints: suggested_trigger_summary et suggested_last_user_safety_signal sont des resumes compacts pour l'etat local. Garde seulement ce qui aide le flow safety; pas de profil global, pas de diagnostic, pas de memoire brute.",
    '- note_information: dans ce contrat dispatcher, retourne {"needed":false}. Les notes de premiere activation et de sortie sont produites par le runtime/reducer safety. Ne mets jamais la note brute dans un message visible.',
    "- no_tooling: tous les champs doivent rester false. direct_effect_request n'est pas une execution: tu peux le remplir, mais tu ne crees aucun effet, confirmation, DB write, operation_suggestion ou pending.",
    "- visible_task.kind: ce champ n'est pas dans ta sortie JSON. Le reducer le choisit depuis flow_action, risk_score, safety_signals, product_tool_boundary et exit_request. Tes champs doivent donc permettre un stage precis: immediate_risk_check, acute_grounding, support_contact, stabilizing, exit_check, resolved_exit, repeat_current_step, product_tool_boundary, stop_or_cancel ou safety_escalation.",
    "- visible_task.conversation_context: tu ne le remplis pas directement. Le reducer le construit depuis tes signaux, summaries, boundary, exit_request, state_hints et evidence. Fournis des faits courts, pas de DB brute, pas de memoire brute, pas de note_information brute, pas de texte visible.",
    "- exit_memo et response_contract: absents de ta sortie JSON. Ils sont produits par le reducer uniquement quand les faits safety permettent une sortie ou quand le stage visible impose des contraintes. Ne les invente pas.",
    "- evidence: liste courte d'indices semantiques reellement utilises. Cite des fragments ou observations du message, pas de pseudo-preuves, pas de raisonnement cache, pas d'evidence inventee.",
    "",
    "Transition Rules:",
    "- exit_to_global_dispatcher: user veut stopper/abandonner ou apporte un nouveau sujet clair seulement apres faits solides de securite actuelle. Le reducer/runtime doit produire une note exploitable vers global avant toute reprise globale. Si les faits safety manquent, utilise wants_to_exit ou continue safety.",
    "- safety_escalate: danger immediat, intention d'acte, moyens dangereux proches avec solitude/incertitude, ou besoin d'urgence. Le global normal ne reprend jamais pour safety.",
    "- product_or_tool_attempt: boundary interne pendant safety; differer produit/statut/outil hors rappel ponctuel et revenir a la securite.",
    "- create_one_shot_reminder via direct_effect_request: rappel ponctuel explicite. Le runtime direct_effect standard decide allow/clarify/commit. Le visible safety ne confirme jamais avant le ledger.",
    "- Aucun handoff local autre que safety n'est autorise par ce contrat.",
    ...directEffectLocalDispatcherPromptLines(),
    "- Specificite safety: create_one_shot_reminder est le seul direct effect autorise a rester disponible pendant safety. track_progress_plan_item et les autres effets restent bloques.",
    "",
    "EXAMPLE_JSON_NORMAL_CONTINUATION:",
    '{"flow_action":"provide_means_status","confidence":"high","risk_score":6,"safety_signals":{"suicidal_ideation":false,"self_harm_intent":false,"immediate_danger":false,"has_means_nearby":false,"means_moved_away":true,"user_currently_alone":null,"human_support_available":null,"emergency_help_contacted":null,"clarified_non_immediate":true,"deescalation_evidence":true,"uncertainty":"medium"},"user_state_summary":{"paraphrase":"Le user dit avoir eloigne les moyens et ne pas etre en danger immediat.","current_need":"contact_human","what_changed_since_previous_turn":"moyens eloignes; support humain encore inconnu"},"product_tool_boundary":{"attempted":false,"attempt_kind":"none","defer_reason":null},"direct_effect_request":{"requested":false,"effect_type":null,"explicitness":"none","target_status":"none","confidence_band":"low","payload_hint":{"raw_text":null,"when_hint":null,"UTC_time":null,"local_label":null,"instruction_hint":null},"reason":null},"exit_request":{"requested":false,"why_user_thinks_safe":null,"missing_resolution_facts":["human_support_available","not_alone"]},"state_hints":{"suggested_trigger_summary":null,"suggested_last_user_safety_signal":"moyens eloignes; danger immediat nie; support inconnu"},"note_information":{"needed":false},"no_tooling":{"product_help_called":false,"status_lookup_called":false,"legacy_operation_called":false,"operation_route_created":false,"pending_confirmation_created":false,"db_write_committed":false},"evidence":["dit avoir eloigne les medicaments","dit ne pas etre en danger immediat"]}',
    "EXAMPLE_JSON_CRITICAL_TRANSITION:",
    '{"flow_action":"safety_escalate","confidence":"high","risk_score":10,"safety_signals":{"suicidal_ideation":true,"self_harm_intent":true,"immediate_danger":true,"has_means_nearby":true,"means_moved_away":false,"user_currently_alone":true,"human_support_available":false,"emergency_help_contacted":false,"clarified_non_immediate":false,"deescalation_evidence":false,"uncertainty":"low"},"user_state_summary":{"paraphrase":"Le user indique un danger immediat avec moyens proches et solitude.","current_need":"move_means_away","what_changed_since_previous_turn":"danger immediat explicite avec moyens proches"},"product_tool_boundary":{"attempted":false,"attempt_kind":"none","defer_reason":null},"direct_effect_request":{"requested":false,"effect_type":null,"explicitness":"none","target_status":"none","confidence_band":"low","payload_hint":{"raw_text":null,"when_hint":null,"UTC_time":null,"local_label":null,"instruction_hint":null},"reason":null},"exit_request":{"requested":false,"why_user_thinks_safe":null,"missing_resolution_facts":["immediate_danger_absent","means_safe","human_support_available","not_alone","no_fresh_risk_signal"]},"state_hints":{"suggested_trigger_summary":"danger immediat avec moyens proches","suggested_last_user_safety_signal":"risque actif; seul; moyens proches"},"note_information":{"needed":false},"no_tooling":{"product_help_called":false,"status_lookup_called":false,"legacy_operation_called":false,"operation_route_created":false,"pending_confirmation_created":false,"db_write_committed":false},"evidence":["danger immediat exprime","moyens proches","seul"]}',
    "EXAMPLE_JSON_SAFETY_WITH_ONE_SHOT_DIRECT_EFFECT:",
    '{"flow_action":"provide_support_status","confidence":"high","risk_score":4,"safety_signals":{"suicidal_ideation":false,"self_harm_intent":false,"immediate_danger":false,"has_means_nearby":false,"means_moved_away":true,"user_currently_alone":false,"human_support_available":true,"emergency_help_contacted":false,"clarified_non_immediate":true,"deescalation_evidence":true,"uncertainty":"low"},"user_state_summary":{"paraphrase":"Le user dit etre avec sa soeur, avoir eloigne les moyens et demande un rappel ponctuel pour l appeler demain.","current_need":"stay_with_support","what_changed_since_previous_turn":"support humain present; rappel ponctuel explicite"},"product_tool_boundary":{"attempted":false,"attempt_kind":"none","defer_reason":null},"direct_effect_request":{"requested":true,"effect_type":"create_one_shot_reminder","explicitness":"explicit","target_status":"identified","confidence_band":"high","content_risk":"safe","payload_hint":{"raw_text":"rappelle-moi demain a 9h d appeler ma soeur","when_hint":"demain a 9h","UTC_time":"2026-06-25T07:00:00.000Z","local_label":"demain a 09:00","instruction_hint":"appeler ma soeur"},"reason":"rappel ponctuel explicite avec heure exploitable"},"exit_request":{"requested":false,"why_user_thinks_safe":null,"missing_resolution_facts":[]},"state_hints":{"suggested_trigger_summary":null,"suggested_last_user_safety_signal":"support present; moyens eloignes; pas de danger immediat"},"note_information":{"needed":false},"no_tooling":{"product_help_called":false,"status_lookup_called":false,"legacy_operation_called":false,"operation_route_created":false,"pending_confirmation_created":false,"db_write_committed":false},"evidence":["avec ma soeur","moyens eloignes","rappelle-moi demain a 9h"]}',
    "",
    'Retourne exactement ce JSON: {"flow_action":"answer_safety_check|provide_means_status|provide_alone_status|provide_support_status|provide_emergency_status|provide_deescalation_evidence|needs_grounding|repeat_current_step|product_or_tool_attempt|wants_to_exit|exit_to_global_dispatcher|safety_escalate","confidence":"low|medium|high","risk_score":0,"safety_signals":{"suicidal_ideation":false,"self_harm_intent":false,"immediate_danger":true,"has_means_nearby":true,"means_moved_away":false,"user_currently_alone":true,"human_support_available":false,"emergency_help_contacted":false,"clarified_non_immediate":false,"deescalation_evidence":false,"uncertainty":"low|medium|high"},"user_state_summary":{"paraphrase":"string|null","current_need":"immediate_risk_check|grounding|move_means_away|contact_human|stay_with_support|exit_request|unclear","what_changed_since_previous_turn":"string|null"},"product_tool_boundary":{"attempted":false,"attempt_kind":"product_question|tool_creation|plan_work|status_request|none","defer_reason":"string|null"},"direct_effect_request":{"requested":false,"effect_type":"create_one_shot_reminder|null","explicitness":"explicit|implied|weak|none","target_status":"identified|ambiguous|missing|none","confidence_band":"low|medium|high","content_risk":"safe|flagged","payload_hint":{"raw_text":"string|null","when_hint":"string|null","UTC_time":"string|null","local_label":"string|null","instruction_hint":"string|null"},"reason":"string|null"},"exit_request":{"requested":false,"why_user_thinks_safe":"string|null","missing_resolution_facts":["immediate_danger_absent|means_safe|human_support_available|not_alone|no_fresh_risk_signal"]},"state_hints":{"suggested_trigger_summary":"string|null","suggested_last_user_safety_signal":"string|null"},"note_information":{"needed":false},"no_tooling":{"product_help_called":false,"status_lookup_called":false,"legacy_operation_called":false,"operation_route_created":false,"pending_confirmation_created":false,"db_write_committed":false},"evidence":["string"]}',
  ].join("\n");
}

export async function runSafetyCrisisLocalDispatcher(
  input: SafetyCrisisLocalDispatcherInput,
): Promise<SafetyCrisisLocalDispatcherOutput | null> {
  if (dispatcherForTest) return await dispatcherForTest(input);
  const userPrompt = JSON.stringify({
    task: "dispatch_safety_crisis_local_flow",
    current_user_message: input.user_message,
    recent_messages: compactRecentMessages(input.recent_messages),
    source_safety_context: input.source_safety_context,
    previous_active_safety_state: input.previous_active_safety_state,
    note_information_inbound: input.note_information_inbound ?? null,
    prior_phase: input.prior_phase,
    prior_known_facts: input.prior_known_facts,
    channel: input.channel ?? null,
    timezone: input.timezone ?? null,
    turn_frame: input.turn_frame,
    platform_context: withDirectEffectLocalContext(
      {},
      (input.turn_frame as any)?.plan_snapshot ?? null,
      undefined,
      directEffectTimeContextFromTurnFrame(input.turn_frame),
    ),
    direct_effect_lane: (input.turn_frame as any)?.direct_effect_lane ?? null,
    direct_effect_confirmation_context:
      (input.turn_frame as any)?.direct_effect_confirmation_context ?? null,
    no_tooling_constraints: {
      product_help: "blocked",
      status_lookup: "blocked",
      operation_runtime:
        "blocked_except_create_one_shot_reminder_direct_effect",
      operation_suggestions: "blocked",
      pending_confirmation: "blocked",
      db_write: "blocked",
      visible_message: "forbidden",
    },
  });
  try {
    console.info("safety_crisis.local_dispatcher_called", {
      source_risk_band: input.source_safety_context.risk_band,
      prior_phase: input.prior_phase,
      no_tooling: true,
    });
    const raw = await generateWithGemini(
      dispatcherSystemPrompt(),
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel(),
        source: "safety_crisis.local_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const output = normalizeSafetyCrisisLocalDispatcherOutput(raw);
    console.info("safety_crisis.local_dispatcher_result", {
      flow_action: output.flow_action,
      risk_score: output.risk_score,
      uncertainty: output.safety_signals.uncertainty,
      no_tooling: output.no_tooling,
    });
    return output;
  } catch (error) {
    console.warn("[SafetyCrisis] local dispatcher failed", error);
    return null;
  }
}
