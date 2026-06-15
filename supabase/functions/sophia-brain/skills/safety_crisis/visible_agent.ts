import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../router/response_style_policy.ts";
import type {
  SafetyCrisisVisibleTask,
  SafetyCrisisVisibleTaskKind,
} from "./contract.ts";

export type SafetyCrisisVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  visible_task: SafetyCrisisVisibleTask;
};

export type SafetyCrisisVisibleAgent = (
  input: SafetyCrisisVisibleAgentInput,
) => Promise<string | null>;

export type SafetyCrisisVisibleAgentResult = {
  ok: boolean;
  message: string | null;
  visible_agent_ok: boolean;
  visible_fallback_used: false;
  failure_reason: string | null;
};

let visibleAgentForTest: SafetyCrisisVisibleAgent | null = null;

export function setSafetyCrisisVisibleAgentForTest(
  visibleAgent: SafetyCrisisVisibleAgent | null,
) {
  visibleAgentForTest = visibleAgent;
}

function cleanMessage(value: unknown): string | null {
  const text = String(value ?? "").replaceAll("\r\n", "\n").trim();
  return text ? text : null;
}

function parseVisibleMessage(raw: unknown): string | null {
  try {
    const root = typeof raw === "string" ? JSON.parse(raw) : raw as any;
    return cleanMessage(root?.message);
  } catch {
    return cleanMessage(raw);
  }
}

const STAGE_PROMPTS: Record<SafetyCrisisVisibleTaskKind, string> = {
  immediate_risk_check: [
    "Stage immediate_risk_check.",
    "Verifier la securite immediate avec une formulation courte et directe.",
    "Utilise seulement conversation_context. Termine par la question la plus utile pour savoir si le user est en danger maintenant ou seul.",
  ].join("\n"),
  acute_grounding: [
    "Stage acute_grounding.",
    "Prioriser une seule action immediate: eloigner ce qui peut blesser si possible sans danger, contacter une aide humaine, ou appeler les urgences selon conversation_context.",
    "Pas de respiration longue, pas de coaching, pas d'explication produit.",
  ].join("\n"),
  support_contact: [
    "Stage support_contact.",
    "Aider le user a contacter ou garder une personne humaine reelle.",
    "Tu peux proposer une phrase simple a dire/envoyer si conversation_context indique que le support manque.",
  ].join("\n"),
  stabilizing: [
    "Stage stabilizing.",
    "Maintenir la stabilisation en reconnaissant seulement les faits securisants presents dans conversation_context.",
    "Garder le lien avec l'aide humaine et les moyens hors de portee.",
    "Utiliser 2 ou 3 consignes maximum, avec des termes simples et standards: respiration 4/6, rester assis, garder la personne au telephone, rester loin des moyens.",
  ].join("\n"),
  exit_check: [
    "Stage exit_check.",
    "Faire un dernier check simple avant resolution.",
    "Ne dis pas que c'est termine. Demande une confirmation sobre sur l'absence de danger immediat.",
  ].join("\n"),
  resolved_exit: [
    "Stage resolved_exit.",
    "Dire sobrement que l'immediat est stabilise parce que conversation_context indique que le reducer l'a decide.",
    "Ne relance aucune action produit, outil, plan, potion, carte, rappel ou statut.",
  ].join("\n"),
  repeat_current_step: [
    "Stage repeat_current_step.",
    "Repeter seulement le pas safety courant depuis conversation_context.handoff_data.current_step.",
    "Ne reprends pas tout l'historique.",
  ].join("\n"),
  product_tool_boundary: [
    "Stage product_tool_boundary.",
    "Differer la demande produit, outil, plan, potion, carte, rappel ou statut mentionnee dans conversation_context.handoff_data.deferred_product_or_tool_request.",
    "Ne redige pas le contenu demande: aucune carte, aucun plan, aucune potion, aucun statut, aucun texte pret a copier-coller, aucun titre d'artefact, aucune liste de personnalisation produit.",
    "Ne demande pas d'horaire, de details produit, de destination plateforme ou de confirmation pour cette demande differee.",
    "Dis simplement que tu le gardes de cote pour apres la stabilisation, puis reviens a une seule prochaine action safety.",
    "Exception: les rappels ponctuels explicitement autorises ne passent pas par ce stage; si tu es dans ce stage, aucun rappel ne doit etre confirme.",
  ].join("\n"),
  stop_or_cancel: [
    "Stage stop_or_cancel.",
    "Le user veut arreter localement sans nouveau sujet clair.",
    "Reponds tres court, sans question finale, sans appeler le dispatcher global, en gardant une ressource safety si conversation_context l'exige.",
  ].join("\n"),
  safety_transition: [
    "Stage safety_transition.",
    "Le tour vient d'un autre flow mais safety reprend.",
    "N'expose pas la note source. Recentre directement sur la securite immediate.",
  ].join("\n"),
  safety_escalation: [
    "Stage safety_escalation.",
    "Prioriser l'urgence avec les ressources fournies dans conversation_context.safety_resources.",
    "Une phrase courte et une action immediate vers urgences ou aide humaine.",
  ].join("\n"),
};

function visibleSystemPrompt(input: SafetyCrisisVisibleAgentInput): string {
  const stage = input.visible_task.kind;
  return [
    "Tu ecris le prochain message visible de Sophia dans le flow safety_crisis.",
    STAGE_PROMPTS[stage],
    "Tu recois uniquement visible_task.conversation_context. Tu n'utilises pas le message brut, les recent_messages, la DB brute, ni la memoire brute.",
    "Tu ne routes pas, tu ne decides pas le risque, tu ne modifies pas l'etat.",
    "Pas de produit, pas d'outil, pas de plan, pas de potion, pas de carte, pas de rappel, pas de statut.",
    "Ne cree aucune confirmation et ne dis jamais qu'une action a ete faite, activee, programmee ou enregistree.",
    "Ne mentionne jamais JSON, dispatcher, reducer, prompt, table, DB ou outil interne.",
    "Si conversation_context.safety_resources.must_include_emergency_numbers=true, inclure exactement emergency_numbers et suicide_prevention_number.",
    "Respecte max_questions strictement.",
    "Ne dis pas que tout est resolu sauf si stage=resolved_exit.",
    "Ne presente jamais Sophia comme une aide humaine.",
    "Qualite safety stricte: phrases courtes, pas de mot coupe, pas de terme invente, pas de formulation creative pour les techniques de respiration ou d'ancrage.",
    VISIBLE_OUTPUT_STYLE_RULES,
    "Reste court, naturel et concret: maximum 120 mots sauf urgence critique exigeant les numeros.",
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

export function visibleSystemPromptForSafetyCrisisTest(
  input: SafetyCrisisVisibleAgentInput,
): string {
  return visibleSystemPrompt(input);
}

function questionCount(message: string): number {
  return message.split("?").length - 1;
}

function validateVisibleMessage(
  message: string,
  task: SafetyCrisisVisibleTask,
): { ok: boolean; reason: string | null } {
  const context = task.conversation_context;
  const resources = context.safety_resources;
  if (questionCount(message) > context.max_questions) {
    return { ok: false, reason: "too_many_questions" };
  }
  if (
    resources.must_include_emergency_numbers &&
    (message.indexOf(resources.emergency_numbers) < 0 ||
      message.indexOf(resources.suicide_prevention_number) < 0)
  ) {
    return { ok: false, reason: "missing_required_emergency_numbers" };
  }
  if (
    task.kind !== "resolved_exit" &&
    message.normalize("NFD").toLowerCase().indexOf("c'est resolu") >= 0
  ) {
    return { ok: false, reason: "premature_resolution_claim" };
  }
  if (task.kind === "product_tool_boundary") {
    const normalized = message.normalize("NFD").toLowerCase();
    const blockedArtifactMarkers = [
      "carte -",
      "carte –",
      "carte:",
      "plan -",
      "plan –",
      "potion -",
      "potion –",
      "statut -",
      "statut –",
      "prete a copier",
      "pret a copier",
      "copier-coller",
    ];
    if (blockedArtifactMarkers.some((marker) => normalized.includes(marker))) {
      return { ok: false, reason: "product_artifact_generated" };
    }
  }
  return { ok: true, reason: null };
}

export async function runSafetyCrisisVisibleAgentResult(
  input: SafetyCrisisVisibleAgentInput,
): Promise<SafetyCrisisVisibleAgentResult> {
  if (visibleAgentForTest) {
    const message = cleanMessage(await visibleAgentForTest(input));
    if (!message) {
      return {
        ok: false,
        message: null,
        visible_agent_ok: false,
        visible_fallback_used: false,
        failure_reason: "test_visible_agent_empty",
      };
    }
    const validation = validateVisibleMessage(message, input.visible_task);
    return {
      ok: validation.ok,
      message: validation.ok ? message : null,
      visible_agent_ok: validation.ok,
      visible_fallback_used: false,
      failure_reason: validation.reason,
    };
  }
  const userPrompt = JSON.stringify({
    task: "write_safety_crisis_visible_message",
    stage: input.visible_task.kind,
    visible_task: {
      kind: input.visible_task.kind,
      conversation_context: input.visible_task.conversation_context,
    },
    hard_constraints: {
      product_help: "blocked",
      status_recap: "blocked",
      tool_skill_runtime: "blocked",
      operation_suggestions: [],
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      pending_confirmation: null,
      max_questions: input.visible_task.conversation_context.max_questions,
    },
  });
  try {
    console.info("safety_crisis.visible_prompt_called", {
      "visible_task.kind": input.visible_task.kind,
      phase: input.visible_task.conversation_context.known_values.phase,
      risk_band: input.visible_task.conversation_context.known_values.risk_band,
      no_tooling: true,
      conversation_context_only: true,
    });
    const raw = await generateWithGemini(
      visibleSystemPrompt(input),
      userPrompt,
      0.35,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: `safety_crisis.visible.${input.visible_task.kind}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const message = parseVisibleMessage(raw);
    if (!message) {
      return {
        ok: false,
        message: null,
        visible_agent_ok: false,
        visible_fallback_used: false,
        failure_reason: "empty_visible_message",
      };
    }
    const validation = validateVisibleMessage(message, input.visible_task);
    return {
      ok: validation.ok,
      message: validation.ok ? message : null,
      visible_agent_ok: validation.ok,
      visible_fallback_used: false,
      failure_reason: validation.reason,
    };
  } catch (error) {
    console.warn("[SafetyCrisis] visible agent failed", error);
    return {
      ok: false,
      message: null,
      visible_agent_ok: false,
      visible_fallback_used: false,
      failure_reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runSafetyCrisisVisibleAgent(
  input: SafetyCrisisVisibleAgentInput,
): Promise<string | null> {
  return (await runSafetyCrisisVisibleAgentResult(input)).message;
}
