import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type {
  SafetyCrisisVisibleTask,
  SafetyCrisisVisibleTaskKind,
} from "./contract.ts";

export type SafetyCrisisVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  visible_task: SafetyCrisisVisibleTask;
};

export type SafetyCrisisVisibleAgent = (
  input: SafetyCrisisVisibleAgentInput,
) => Promise<string | null>;

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

function taskInstruction(stage: SafetyCrisisVisibleTaskKind): string {
  switch (stage) {
    case "immediate_risk_check":
      return "Verifier la securite immediate avec une formulation courte et directe. Termine par la question la plus utile.";
    case "acute_grounding":
      return "Prioriser une seule action immediate: eloigner ce qui peut blesser si possible sans danger, ne pas rester seul, ou contacter une aide humaine/urgence selon les donnees.";
    case "support_contact":
      return "Aider le user a contacter ou garder une personne humaine. Propose une phrase simple qu'il peut dire ou envoyer.";
    case "stabilizing":
      return "Maintenir la stabilisation en reconnaissant seulement les faits securisants fournis et en gardant le lien humain.";
    case "exit_check":
      return "Faire un dernier check simple avant resolution, sans dire que c'est termine.";
    case "resolved_exit":
      return "Dire sobrement que l'immediat est stabilise parce que le reducer l'a decide, sans relancer d'action.";
    case "repeat_current_step":
      return "Repeter courtement le dernier pas safety utile, pas tout l'historique.";
    case "product_tool_boundary":
      return "Differer la demande produit/outil/plan/statut en une phrase et revenir a une seule prochaine action safety.";
    case "safety_escalation":
      return "Prioriser l'urgence avec les ressources fournies: une phrase courte et une action immediate.";
  }
}

function visibleSystemPrompt(input: SafetyCrisisVisibleAgentInput): string {
  const stage = input.visible_task.kind;
  return [
    "Tu ecris le prochain message visible de Sophia dans le flow safety_crisis.",
    `Stage: ${stage}.`,
    taskInstruction(stage),
    "Tu ne routes pas, tu ne decides pas le risque, tu ne modifies pas l'etat.",
    "Pas de produit, pas d'outil, pas de plan, pas de potion, pas de carte, pas de rappel, pas de statut.",
    "Ne cree aucune confirmation et ne dis jamais qu'une action a ete faite, activee, programmee ou enregistree.",
    "Ne mentionne jamais JSON, dispatcher, reducer, prompt, table, DB ou outil interne.",
    "Si must_include_emergency_numbers=true, inclure exactement emergency_numbers et suicide_prevention_number fournis dans visible_task.required_data.",
    "Respecte max_questions strictement.",
    "Ne dis pas que tout est resolu sauf si stage=resolved_exit.",
    "Ne presente jamais Sophia comme une aide humaine.",
    "Reste court, naturel et concret.",
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

function questionCount(message: string): number {
  return message.split("?").length - 1;
}

function hasForbiddenProductOrToolWording(message: string): boolean {
  const normalized = message.normalize("NFD").toLowerCase();
  const forbidden = [
    "produit",
    "outil",
    "plan",
    "potion",
    "carte",
    "rappel",
    "statut",
    "dashboard",
  ];
  return forbidden.some((word) => normalized.indexOf(word) >= 0);
}

function passesVisibleGuards(
  message: string,
  task: SafetyCrisisVisibleTask,
): boolean {
  const data = task.required_data;
  if (questionCount(message) > data.max_questions) return false;
  if (hasForbiddenProductOrToolWording(message)) return false;
  if (
    data.must_include_emergency_numbers &&
    (message.indexOf(data.emergency_numbers) < 0 ||
      message.indexOf(data.suicide_prevention_number) < 0)
  ) {
    return false;
  }
  if (
    task.kind !== "resolved_exit" &&
    message.normalize("NFD").toLowerCase().indexOf("c'est resolu") >= 0
  ) {
    return false;
  }
  return true;
}

export async function runSafetyCrisisVisibleAgent(
  input: SafetyCrisisVisibleAgentInput,
): Promise<string | null> {
  if (visibleAgentForTest) return await visibleAgentForTest(input);
  const userPrompt = JSON.stringify({
    task: "write_safety_crisis_visible_message",
    stage: input.visible_task.kind,
    current_user_message: input.user_message,
    recent_messages: input.recent_messages.slice(-8),
    visible_task: input.visible_task,
    hard_constraints: {
      product_help: "blocked",
      status_recap: "blocked",
      tool_skill_runtime: "blocked",
      operation_suggestions: [],
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      pending_confirmation: null,
      max_questions: input.visible_task.required_data.max_questions,
    },
  });
  try {
    console.info("safety_crisis.visible_prompt_called", {
      "visible_task.kind": input.visible_task.kind,
      phase: input.visible_task.required_data.phase,
      risk_band: input.visible_task.required_data.risk_band,
      no_tooling: true,
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
    return message && passesVisibleGuards(message, input.visible_task)
      ? message
      : null;
  } catch (error) {
    console.warn("[SafetyCrisis] visible agent failed", error);
    return null;
  }
}
