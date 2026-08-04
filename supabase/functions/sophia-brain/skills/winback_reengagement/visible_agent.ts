// Chantier réengagement (2026-07-19) — agent VISIBLE du flow
// winback_reengagement_v1. Sépare la décision (local_flow) de la rédaction :
// cet agent écrit le tour visible à partir du stage décidé, du grounding
// (actions au point mort + leur pourquoi, épisodes passés) et des contraintes
// de parité claim/ledger. Il ne décide rien et ne mute rien.

import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../router/response_style_policy.ts";
import type { WinbackReengagementLocalDecision } from "./local_flow.ts";
import type { WinbackReengagementLocalState } from "./state.ts";

export type WinbackReengagementVisibleAgent = (input: {
  userId: string;
  requestId: string | null;
  userMessage: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  state: WinbackReengagementLocalState;
  decision: WinbackReengagementLocalDecision;
  userFirstName: string | null;
}) => Promise<string>;

const STAGE_GUIDANCE: Record<string, string> = {
  opening:
    "Accueille sa réponse avec chaleur sobre, zéro culpabilisation, zéro reproche. Prends appui sur ce qu'il vient de dire. Ne lance PAS de bilan.",
  diagnose:
    "Cherche à comprendre pourquoi ça a lâché — UNE question simple et ouverte, pas un questionnaire. Si le contexte indique un épisode récent confirmable, confirme la raison passée au lieu de re-demander (« la dernière fois c'était X — c'est encore ça ? »).",
  reanchor:
    "Relie ce qu'il vit à pourquoi SES actions comptent pour LUI, avec ses propres mots (why_it_matters du grounding). Rappelle-lui explicitement qu'il peut te parler quand ça flanche, même juste pour dire que ça flanche. Jamais de tendresse non groundée.",
  solution:
    "Propose UNE porte adaptée à sa raison, en une ou deux phrases : ajuster son plan directement dans l'appli (dis « ton Plan », « dans l'appli » — jamais « surface », c'est du vocabulaire interne), une carte de défense (si c'est dur SUR LE MOMENT, en plein mouvement) ou d'attaque (s'il n'y pense pas, oublie, manque d'élan ou de cadre — rien ne le pousse, il a perdu de vue pourquoi ça compte) à créer dans l'appli, une pause assumée, ou simplement continuer à en parler ici. Ne crée RIEN, ne modifie RIEN : tu orientes.",
  closure:
    "Scelle un micro-engagement concret et léger (« on se retrouve ce soir au bilan ? »), ou acte simplement la suite s'il a accepté une porte. Court et chaleureux.",
};

export async function runWinbackReengagementVisibleAgent(input: {
  userId: string;
  requestId: string | null;
  userMessage: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  state: WinbackReengagementLocalState;
  decision: WinbackReengagementLocalDecision;
  userFirstName: string | null;
}): Promise<string> {
  const stage = input.decision.stage_next;
  const system = [
    "Tu es Sophia, coach de transformation personnelle sur WhatsApp. L'utilisateur avait décroché de son plan pendant plusieurs jours et vient de répondre à ton message de reprise. Tu es dans une conversation de réengagement.",
    "",
    `CONSIGNE DU TOUR (stage: ${stage}):`,
    STAGE_GUIDANCE[stage] ?? STAGE_GUIDANCE.opening,
    ...(input.decision.visible_focus
      ? ["", `FOCUS DÉCIDÉ POUR CE TOUR: ${input.decision.visible_focus}`]
      : []),
    "",
    "RÈGLES DURES:",
    "- Si recent_episode_confirmable=true et que la raison de CE décrochage n'est pas encore exprimée: ouvre en confirmant la raison du dernier épisode avec ses mots (« la dernière fois c'était X — c'est encore ça ? »), jamais une question ouverte à froid.",
    "- Si les épisodes passés partagent la même raison: nomme la récurrence avec douceur (« c'est la troisième fois que X te fait décrocher ») et propose de repenser le format ou le rythme des actions depuis son Plan dans l'appli, plutôt que de re-servir le même « on repart petit » qui n'a pas tenu.",
    "- Une seule question maximum par message.",
    "- Zéro culpabilisation, zéro « pourquoi tu n'as pas… », zéro récap de ce qu'il a raté.",
    "- Ne lance PAS de bilan, ne liste pas ses actions en attente.",
    "- Ne dis JAMAIS qu'une carte a été créée, que le plan a été ajusté, qu'un rappel a été posé ou que quoi que ce soit a été modifié : tu ne fais qu'orienter vers la plateforme.",
    "- Ne promets pas d'arrêter ou de modifier les messages de relance.",
    "- Si tu proposes une carte : défense = pour tenir sur le moment, en plein mouvement ; attaque = pour ne plus oublier, retrouver l'élan ou se construire un cadre quand rien d'externe ne pousse (mantra, texte à écrire). Elles se créent dans l'appli (côté Cartes), pas ici.",
    "- Message court (2-4 phrases), ton humain, pas procédural.",
    "",
    VISIBLE_OUTPUT_STYLE_RULES,
  ].join("\n");

  const user = JSON.stringify({
    user_first_name: input.userFirstName,
    current_user_message: input.userMessage,
    recent_messages: input.recentMessages.slice(-8),
    grounding: {
      stalled_actions: input.state.context.stalled_actions,
      past_episodes: input.state.context.past_episodes,
      recent_episode_confirmable:
        input.state.context.recent_episode_confirmable,
      working_reason_note: input.decision.working_reason_note,
      solution_kind: input.decision.solution_kind,
      days_inactive_at_send: input.state.days_inactive_at_send,
      winback_step: input.state.winback_step,
    },
  });

  const raw = await generateWithGemini(
    system,
    user,
    0.6,
    false,
    [],
    "auto",
    {
      requestId: input.requestId ?? undefined,
      userId: input.userId,
      source: "winback-reengagement-visible-v1",
      model: getGlobalAiModel(),
      maxRetries: 1,
      httpTimeoutMs: 25_000,
      reasoningEffort: "low",
    },
  );
  return typeof raw === "string" ? raw.trim() : "";
}
