import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../../router/response_style_policy.ts";
import type {
  CreateRecurringReminderVisibleTask,
  CreateRecurringReminderVisibleTaskKind,
  RecurringReminderHandoffDraft,
  RecurringReminderHandoffState,
} from "./contract.ts";

export type CreateRecurringReminderVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: CreateRecurringReminderVisibleTaskKind;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  local_state: RecurringReminderHandoffState | null;
  visible_task: CreateRecurringReminderVisibleTask;
  handoff_draft: RecurringReminderHandoffDraft | null;
  inline_reply?: string | null;
  blocked_reason?: string | null;
};

export type CreateRecurringReminderVisibleAgent = (
  input: CreateRecurringReminderVisibleAgentInput,
) => Promise<string | null>;

function cleanMessage(value: unknown): string | null {
  const text = String(value ?? "").replaceAll("\r\n", "\n").trim();
  return text ? text : null;
}

function parseVisibleMessage(raw: unknown): string | null {
  try {
    const root = typeof raw === "string" ? JSON.parse(raw) : raw as any;
    return cleanMessage(root?.message);
  } catch {
    return null;
  }
}

function baseStageRules(): string[] {
  return [
    "Tu écris uniquement le prochain message visible de Sophia.",
    "Tu ne décides aucun slot, aucune cadence, aucune destination et aucun routing.",
    "Tu ne remplis aucun champ et tu ne lis aucune DB ni mémoire brute.",
    "Tu écris seulement depuis visible_task.conversation_context.",
    "Le chat ne crée jamais de rappel récurrent.",
    "Ne dis jamais que le rappel récurrent est créé, programmé, actif, calé, enregistré, ni que tu relanceras le user.",
    "Ne mentionne jamais JSON, dispatcher, reducer, DB, table, confirmation token ou pending confirmation.",
    "N'écris pas un template fixe ni une fiche à libellés.",
    VISIBLE_OUTPUT_STYLE_RULES,
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ];
}

function askRecurrencePrompt(): string {
  return [
    "Tu es l'agent visible local stage-specific ask_recurrence du flow create_recurring_reminder.",
    ...baseStageRules(),
    "Fonction: poser une seule question naturelle pour clarifier le rythme récurrent.",
    "Données reçues: conversation_context.known_values, missing_or_weak_values, question_to_ask, evidence_used.",
    "Sortie attendue: une question courte; ne demande pas l'heure si seul le rythme manque.",
    "Ne jamais faire: proposer une création, choisir la cadence à la place du dispatcher, ajouter plusieurs questions.",
  ].join("\n");
}

function askTimePrompt(): string {
  return [
    "Tu es l'agent visible local stage-specific ask_time du flow create_recurring_reminder.",
    ...baseStageRules(),
    "Fonction: demander une heure concrète pour le rappel récurrent.",
    "Données reçues: conversation_context.known_values, missing_or_weak_values, question_to_ask, timezone dans collected_state si présent.",
    "Sortie attendue: une seule question, sans reposer la cadence ni le contenu déjà stabilisés.",
    "Ne jamais faire: inventer une heure, dire que le rappel sera créé, demander une destination.",
  ].join("\n");
}

function askContentPrompt(): string {
  return [
    "Tu es l'agent visible local stage-specific ask_content du flow create_recurring_reminder.",
    ...baseStageRules(),
    "Fonction: demander le message exact ou l'action à rappeler.",
    "Données reçues: conversation_context.known_values, missing_or_weak_values, question_to_ask.",
    "Sortie attendue: une seule question utile et conversationnelle.",
    "Ne jamais faire: remplir le message toi-même, demander cadence/heure si elles sont déjà dans known_values.",
  ].join("\n");
}

function askDestinationBindingPrompt(): string {
  return [
    "Tu es l'agent visible local stage-specific ask_destination_binding du flow create_recurring_reminder.",
    ...baseStageRules(),
    "Fonction: clarifier brièvement si le rappel appartient au plan courant ou à la base de vie.",
    "Données reçues: conversation_context.known_values, collected_state.destination, unresolved_questions.",
    "Sortie attendue: une question courte uniquement si le dispatcher a marqué cette décision comme nécessaire.",
    "Ne jamais faire: demander une destination pour une routine générale déjà classée base_de_vie.",
  ].join("\n");
}

function clarifyOneShotPrompt(): string {
  return [
    "Tu es l'agent visible local stage-specific clarify_one_shot_vs_recurring du flow create_recurring_reminder.",
    ...baseStageRules(),
    "Fonction: distinguer rappel ponctuel et rappel récurrent quand le dispatcher a gardé une ambiguïté.",
    "Données reçues: conversation_context.known_values, current_user_message_summary, evidence_used.",
    "Sortie attendue: une seule question qui oppose ponctuel vs récurrent sans trancher.",
    "Ne jamais faire: basculer toi-même vers un autre flow ou promettre une création.",
  ].join("\n");
}

function handoffReadyPrompt(): string {
  return [
    "Tu es l'agent visible local stage-specific handoff_ready du flow create_recurring_reminder.",
    ...baseStageRules(),
    "Fonction: présenter la version à reprendre dans Initiatives.",
    "Données reçues: conversation_context.handoff et known_values.",
    "Sortie attendue: un message naturel avec contenu, cadence, heure et destination plateforme, et une phrase claire que ce n'est pas créé depuis le chat.",
    "Ne jamais faire: utiliser une fiche à libellés, dire que c'est programmé, demander une confirmation finale.",
  ].join("\n");
}

function reviseHandoffPrompt(): string {
  return [
    "Tu es l'agent visible local stage-specific revise_handoff du flow create_recurring_reminder.",
    ...baseStageRules(),
    "Fonction: présenter la version révisée à reprendre dans Initiatives.",
    "Données reçues: conversation_context.handoff, known_values, evidence_used.",
    "Sortie attendue: un message court qui reflète la révision et rappelle que le chat ne l'applique pas.",
    "Ne jamais faire: dire que la modification est appliquée ou enregistrée.",
  ].join("\n");
}

function repeatHandoffPrompt(): string {
  return [
    "Tu es l'agent visible local stage-specific repeat_handoff du flow create_recurring_reminder.",
    ...baseStageRules(),
    "Fonction: redonner brièvement les éléments à reprendre dans Initiatives.",
    "Données reçues: conversation_context.handoff et known_values.",
    "Sortie attendue: un rappel compact, sans nouvelle décision.",
    "Ne jamais faire: ajouter une question finale ou inventer un champ absent.",
  ].join("\n");
}

function platformDestinationFollowupPrompt(): string {
  return [
    "Tu es l'agent visible local stage-specific platform_destination_followup du flow create_recurring_reminder.",
    ...baseStageRules(),
    "Fonction: expliquer où reprendre la version dans la surface Initiatives.",
    "Données reçues: conversation_context.handoff, known_values.platform_destination.",
    "Sortie attendue: un message bref centré sur la destination plateforme et les étapes disponibles dans le contexte.",
    "Ne jamais faire: prétendre ouvrir la surface ou programmer le rappel.",
  ].join("\n");
}

function applyAttemptPrompt(): string {
  return [
    "Tu es l'agent visible local stage-specific apply_attempt du flow create_recurring_reminder.",
    ...baseStageRules(),
    "Fonction: répondre quand le user demande de programmer/appliquer depuis le chat.",
    "Données reçues: conversation_context.handoff et known_values.",
    "Sortie attendue: dire clairement que tu ne peux pas programmer un rappel récurrent depuis le chat, puis redonner le chemin plateforme.",
    "Ne jamais faire: ajouter une question finale, demander si ça convient, ni laisser entendre qu'une action a été exécutée.",
  ].join("\n");
}

function handoffToOneShotPrompt(): string {
  return [
    "Tu es l'agent visible local stage-specific handoff_to_one_shot du flow create_recurring_reminder.",
    ...baseStageRules(),
    "Fonction: faire une transition courte vers le flow de rappel ponctuel.",
    "Données reçues: conversation_context.note_information_summary et current_user_message_summary.",
    "Sortie attendue: un ack très court, sans exécution et sans détails internes.",
    "Ne jamais faire: traiter toi-même le rappel ponctuel.",
  ].join("\n");
}

function inlineToolReturnPrompt(): string {
  return [
    "Tu es l'agent visible local stage-specific inline_tool_return du flow create_recurring_reminder.",
    ...baseStageRules(),
    "Fonction: restituer la réponse d'un outil inline produit/status puis revenir implicitement au flow parent.",
    "Données reçues: conversation_context.inline_tool_result, note_information_summary, active_flow_summary.",
    "Sortie attendue: répondre à la question inline depuis le résultat fourni. Si le résultat fourni est vide ou non fiable, dire sobrement que le statut n'a pas pu être vérifié dans ce tour, sans inventer de DB.",
    "Ne jamais faire: modifier le brouillon, perdre l'état parent, appeler le global, ou affirmer un nombre/état non fourni.",
  ].join("\n");
}

function stopOrCancelPrompt(): string {
  return [
    "Tu es l'agent visible local stage-specific stop_or_cancel du flow create_recurring_reminder.",
    ...baseStageRules(),
    "Fonction: accuser réception de la sortie du flow si un message local est requis.",
    "Données reçues: conversation_context.current_user_message_summary et active_flow_summary.",
    "Sortie attendue: une phrase courte, sans question.",
    "Ne jamais faire: relancer le dispatcher global ou proposer un nouveau sujet.",
  ].join("\n");
}

function exitAckPrompt(): string {
  return [
    "Tu es l'agent visible local stage-specific exit_ack du flow create_recurring_reminder.",
    ...baseStageRules(),
    "Fonction: accuser réception de la sortie vers le dispatcher global.",
    "Données reçues: conversation_context.note_information_summary.",
    "Sortie attendue: une phrase courte qui met le brouillon de côté.",
    "Ne jamais faire: répondre au nouveau sujet; le dispatcher cible s'en chargera.",
  ].join("\n");
}

function safetyTransitionPrompt(): string {
  return [
    "Tu es l'agent visible local stage-specific safety du flow create_recurring_reminder.",
    ...baseStageRules(),
    "Fonction: laisser la prise en charge safety reprendre.",
    "Données reçues: conversation_context.note_information_summary et risk context filtré s'il existe.",
    "Sortie attendue: transition minimale, sans traiter le rappel.",
    "Ne jamais faire: donner des consignes safety détaillées ni continuer le flow de rappel.",
  ].join("\n");
}

function contractRecoveryPrompt(): string {
  return [
    "Tu es l'agent visible local stage-specific contract_recovery du flow create_recurring_reminder.",
    ...baseStageRules(),
    "Fonction: produire une récupération conversationnelle quand le contrat local est incomplet.",
    "Données reçues: conversation_context seulement.",
    "Sortie attendue: une phrase courte demandant la précision minimale utile ou indiquant que le brouillon ne peut pas être stabilisé dans ce tour.",
    "Ne jamais faire: utiliser un template technique, mentionner une erreur interne, ni créer un rappel.",
  ].join("\n");
}

function visibleSystemPrompt(
  input: CreateRecurringReminderVisibleAgentInput,
): string {
  switch (input.stage) {
    case "ask_recurrence":
      return askRecurrencePrompt();
    case "ask_time":
      return askTimePrompt();
    case "ask_content":
      return askContentPrompt();
    case "ask_destination_binding":
      return askDestinationBindingPrompt();
    case "clarify_one_shot_vs_recurring":
      return clarifyOneShotPrompt();
    case "handoff_ready":
      return handoffReadyPrompt();
    case "revise_handoff":
      return reviseHandoffPrompt();
    case "repeat_handoff":
      return repeatHandoffPrompt();
    case "platform_destination_followup":
      return platformDestinationFollowupPrompt();
    case "apply_attempt":
      return applyAttemptPrompt();
    case "handoff_to_one_shot":
      return handoffToOneShotPrompt();
    case "inline_tool_return":
      return inlineToolReturnPrompt();
    case "stop_or_cancel":
      return stopOrCancelPrompt();
    case "exit_ack":
      return exitAckPrompt();
    case "safety":
      return safetyTransitionPrompt();
    case "contract_recovery":
      return contractRecoveryPrompt();
  }
}

export async function runCreateRecurringReminderVisibleAgent(
  input: CreateRecurringReminderVisibleAgentInput,
): Promise<string | null> {
  const userPrompt = JSON.stringify({
    task: "write_create_recurring_reminder_visible_message",
    stage: input.stage,
    visible_task: {
      kind: input.visible_task.kind,
      conversation_context: input.visible_task.conversation_context,
    },
    hard_constraints: {
      recurring_reminder_created: false,
      forbidden_success_wording: [
        "créé",
        "créée",
        "programmé",
        "programmée",
        "actif",
        "active",
        "calé",
        "enregistré",
        "je te relancerai",
      ],
    },
    required_json_shape: { message: "string" },
  });
  try {
    const raw = await generateWithGemini(
      visibleSystemPrompt(input),
      userPrompt,
      0.45,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: `create_recurring_reminder.visible.${input.stage}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const message = parseVisibleMessage(raw);
    return message;
  } catch (error) {
    console.warn("[CreateRecurringReminder] visible agent failed", error);
    return null;
  }
}
