import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import {
  committedOneShotReminderKnown,
  directEffectContextCommittedThisTurn,
  oneShotReminderCanonicalVisiblePromptLines,
  oneShotReminderVisibleContextPresent,
} from "../../router/one_shot_reminder_prompt_contract.ts";
import {
  VISIBLE_CONVERSATION_FLOW_RULES,
  VISIBLE_OUTPUT_STYLE_RULES,
} from "../../router/response_style_policy.ts";
import { userIdentityVisiblePromptLines } from "../../context/user_identity.ts";
import type {
  PlanRealignmentConversationContext,
  PlanRealignmentVisibleTaskKind,
} from "./contract.ts";

export type PlanRealignmentVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: PlanRealignmentVisibleTaskKind;
  conversation_context: PlanRealignmentConversationContext;
  visible_runtime_context?: {
    style_rules: string;
    recent_messages: Array<{
      role: "user" | "assistant";
      content: string;
      created_at?: string | null;
    }>;
    recent_effects_summary?: string | null;
    user_identity?: {
      first_name: string | null;
      age: number | null;
      gender: "male" | "female" | "other" | null;
    } | null;
  };
};

export type PlanRealignmentVisibleAgent = (
  input: PlanRealignmentVisibleAgentInput,
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
    return cleanMessage(raw);
  }
}

function fallbackMessage(
  context: PlanRealignmentConversationContext,
): string {
  if (context.product_execution_allowed) {
    return "Le bon mouvement est de reprendre ton Plan depuis la plateforme, pas depuis le chat.";
  }
  if (context.scope === "week" || context.drift_type === "plan_too_heavy") {
    return "Ok, là le sujet n'est pas de rattraper toute la semaine d'un coup. Le plus utile est d'aller dans Dashboard > Plan > Ajuster mon plan, puis d'expliquer franchement ce qui n'a pas tenu, pourquoi, et ce que tu aimerais avoir à la place.";
  }
  return "Ok, ça ressemble surtout à un décrochage du Plan. Le bon appui est d'aller dans Dashboard > Plan > Ajuster mon plan, sans essayer de tout compenser d'un coup.";
}

function visibleInstruction(stage: PlanRealignmentVisibleTaskKind): string {
  switch (stage) {
    case "plan_realignment_platform_guidance":
      return "Explique ou aller dans Sophia et quels axes de reflexion ouvrir dans Ajuster mon plan, sans promettre d'execution depuis le chat.";
    case "plan_realignment_followup":
      return "Reponds au suivi du user dans le cadre du realignement du Plan.";
    case "plan_realignment_close":
      return "Clos sobrement le realignement, sans action produit.";
    case "exit_ack":
      return "Accuse reception tres brievement, sans lancer un nouveau sujet.";
    case "plan_realignment_support":
    default:
      return "Rassure, reformule le decrochage du Plan et recommande Dashboard > Plan > Ajuster mon plan.";
  }
}

export function planRealignmentVisiblePrompt(
  stage: PlanRealignmentVisibleTaskKind,
  opts?: {
    oneShotReminderContextPresent?: boolean;
    committedOneShotReminderThisTurn?: boolean;
    committedOneShotReminderKnown?: boolean;
  },
): string {
  return [
    "Tu es l'agent visible du skill plan_realignment.",
    "Tu aides le user quand il s'est deconnecte de son plan: retard, plan non suivi, rythme perdu, semaine trop lourde ou contexte qui a change.",
    "Ton role: rassurer sans culpabiliser, expliquer que le plan sert a etre realigne, puis guider vers Dashboard > Plan > Ajuster mon plan.",
    "Le produit ne permet pas d'ajuster, modifier, alleger, deplacer, reprioriser ou enregistrer le plan depuis le chat.",
    "Tu ne dis jamais que Sophia a ajuste, va ajuster, a modifie, a deplace, a enregistre ou a applique un changement au plan.",
    "Tu ne dis jamais que le user peut supprimer, decaler, diminuer, alleger ou reprioriser directement les actions depuis ce flow.",
    "Destination canonique: Dashboard > Plan > Ajuster mon plan.",
    "Fonctionnement produit: le user remplit le cadre Ajuster mon plan avec son input; l'IA prendra automatiquement en compte ce qu'il ecrit pour adapter la suite du plan.",
    "But conversationnel: ouvrir les horizons du user pour qu'il donne le plus d'informations utiles depuis lui, sans sur-formater, sans inventer une modification precise du plan et sans faire la reponse a sa place.",
    "Ne formule pas la guidance comme 'raconter a Sophia' ou 'dire a Sophia': parle plutot d'ecrire dans Ajuster mon plan, de donner du contexte dans le cadre, ou de decrire sa situation pour que le plan soit realigne.",
    "Ne donne pas par defaut une petite phrase a copier, une liste fermee de choses a dire ou des exemples au hasard comme si c'etait la bonne reponse du user.",
    "Quand le user demande quoi ecrire, donne plutot des directions de reflexion: parler de ce qui n'a pas tenu, pourquoi il pense que c'est arrive, ce qu'il aimerait avoir a la place, ce qu'il veut absolument garder, les actions devenues irrealisables ou trop lourdes, ses contraintes de temps ou d'energie, le contexte qui a change, son niveau de retard, le rythme qui serait plus tenable, et les arbitrages qu'il accepte ou refuse.",
    "Si le user demande explicitement une formulation a copier, propose une trame de depart personnalisable et invite-le a remplacer/ajouter ses vrais details; ne presente jamais ce brouillon comme la reponse finale ideale.",
    "Si le user demande seulement 'tu peux le faire ici ?', reponds clairement non: le realignement se fait dans Dashboard > Plan > Ajuster mon plan.",
    "Si visible_runtime_context.recent_effects_summary contient un effet recent, utilise-le seulement si le user demande ce qui vient d'etre fait, programme, note, valide ou annule, ou pour eviter de contredire un effet recent. Ne nomme jamais EffectLedger et ne le mentionne pas spontanement.",
    ...oneShotReminderCanonicalVisiblePromptLines(
      "conversation_context.direct_effect_confirmation_context",
      {
        present: opts?.oneShotReminderContextPresent === true,
        committedThisTurn: opts?.committedOneShotReminderThisTurn === true,
        committedKnown: opts?.committedOneShotReminderKnown === true,
      },
    ),
    "Ne mentionne jamais route, dispatcher, JSON, DB, note_information ou outil interne.",
    "Pose au maximum une question, seulement si elle est indispensable.",
    ...userIdentityVisiblePromptLines(),
    VISIBLE_OUTPUT_STYLE_RULES,
    VISIBLE_CONVERSATION_FLOW_RULES,
    visibleInstruction(stage),
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

export async function runPlanRealignmentVisibleAgent(
  input: PlanRealignmentVisibleAgentInput,
): Promise<string | null> {
  const prompt = planRealignmentVisiblePrompt(input.stage, {
    oneShotReminderContextPresent: oneShotReminderVisibleContextPresent(
      input.conversation_context?.direct_effect_confirmation_context,
    ),
    committedOneShotReminderThisTurn: directEffectContextCommittedThisTurn(
      input.conversation_context?.direct_effect_confirmation_context,
    ),
    committedOneShotReminderKnown: committedOneShotReminderKnown({
      directEffectConfirmationContext:
        input.conversation_context?.direct_effect_confirmation_context,
      recentEffectsSummary:
        input.visible_runtime_context?.recent_effects_summary,
    }),
  });
  try {
    const raw = await generateWithGemini(
      prompt,
      JSON.stringify({
        stage: input.stage,
        visible_runtime_context: input.visible_runtime_context ?? {
          style_rules: VISIBLE_OUTPUT_STYLE_RULES,
          recent_messages: [],
        },
        conversation_context: input.conversation_context,
      }),
      0.35,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: `plan_realignment.visible.${input.stage}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return parseVisibleMessage(raw) ?? fallbackMessage(
      input.conversation_context,
    );
  } catch (error) {
    console.warn("[PlanRealignment] visible agent failed", error);
    return fallbackMessage(input.conversation_context);
  }
}
