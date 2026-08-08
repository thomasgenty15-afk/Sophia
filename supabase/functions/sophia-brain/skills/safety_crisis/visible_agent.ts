import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
// W9/R3 — la langue de la reponse VISIBLE est RECUE (`input.response_locale`),
// resolue une seule fois par le proprietaire du tour. Ce module appelait
// `resolveResponseLocale({})`: une chaine de priorite sans aucune entree, donc
// une langue decidee par son repli. Le bloc RESPONSE_LANGUAGE part en DERNIERE
// instruction du prompt (la position est le mecanisme: la recence gagne).
import { appendResponseLanguageBlock } from "../../../_shared/keel/locale.ts";
import {
  committedOneShotReminderKnown,
  directEffectContextCommittedThisTurn,
  oneShotReminderCanonicalVisiblePromptLines,
  oneShotReminderVisibleContextPresent,
} from "../../router/one_shot_reminder_prompt_contract.ts";
import {
  VISIBLE_OUTPUT_STYLE_RULES,
  VISIBLE_SAFETY_CONVERSATION_FLOW_RULES,
} from "../../router/response_style_policy.ts";
import type {
  SafetyCrisisVisibleTask,
  SafetyCrisisVisibleTaskKind,
} from "./contract.ts";
import { resolveSafetyResourceNumbers } from "../../../_shared/keel/crisis_resources.ts";

export type SafetyCrisisVisibleAgentInput = {
  user_id: string;
  /** W9/R3 — résolue par le runtime, descendue par le skill. Jamais devinée. */
  response_locale: string;
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

/**
 * FF-020 §8 — LA LIGNE DE RESSOURCES DU REPLI.
 *
 * 🔴 DÉFAUT MESURÉ (run contrôlé 2026-08-08, vraie clé coupée, vrai visible
 * agent, 4 scénarios sur 5):
 *   bande `high`, « je pense a me suicider », modèle indisponible
 *   → reply = « Une chose d'abord : est-ce que tu es en danger immédiat, là,
 *     maintenant ? » — AUCUNE ressource.
 * §8 est explicite: « Étant donné un tour de crise et un modèle indisponible …
 * Alors la réponse visible existe ET ELLE CONTIENT DES RESSOURCES ».
 *
 * POURQUOI LE REPLI PERDAIT LES NUMÉROS. Le dispatcher local et le visible
 * agent partagent le MÊME modèle. Quand il tombe, les deux tombent: le reducer
 * ne reçoit plus aucun signal, la phase retombe sur `immediate_risk_check`, et
 * `must_include_emergency_numbers` passe à false. La panne du modèle
 * DÉCLASSAIT donc une crise aiguë en question de triage sans hotline — y
 * compris au deuxième tour, avec `immediate_danger: true` déjà PERSISTÉ dans
 * le working state (l'échelle de phase lit le signal du tour, pas le fait
 * acquis, et il n'y a plus de signal).
 *
 * LA RÈGLE: sur le chemin de REPLI, et seulement lui, le phasage de hotline
 * (R5-B01: ne pas ré-réciter les numéros à chaque tour) cède devant §8. Le
 * phasage est une préférence de confort; §1 dit qu'il n'existe « pas de version
 * dégradée acceptable ». Le modèle nominal, lui, garde son phasage: cette
 * fonction n'est appelée que quand il a échoué.
 *
 * R1 TENUE: concaténation de chaînes, rien d'autre. Aucun `await`, aucune
 * lecture, aucun throw — mettre le mode de panne dans le gestionnaire de panne
 * est précisément ce que §3 interdit.
 */
function withCrisisResourceLine(
  message: string,
  emergency: string,
  suicide: string,
): string {
  const contacts = [emergency, suicide].map((c) => c.trim()).filter(Boolean);
  if (contacts.length === 0) return message;
  // Déjà cité ? On n'empile pas. Le test porte sur le contact lui-même et pas
  // sur une phrase: `safety_escalation` et `acute_grounding` interpolent déjà
  // les deux, et une seconde ligne y serait un doublon.
  if (contacts.some((contact) => message.includes(contact))) return message;
  const listed = contacts.join(" · ");
  return `${message}\n\nEn cas de danger immédiat : ${listed}.`;
}

// Invariant anti-vide du rendu safety: si le visible agent echoue, le skill
// rend ce message deterministe au lieu d'une reponse vide (jamais de tour
// safety silencieux). L'echec reste observable via visible_generation_failed.
export function safetyCrisisDeterministicVisibleMessage(
  kind: SafetyCrisisVisibleTaskKind,
  safetyResources: {
    emergency_numbers: string;
    suicide_prevention_number: string;
  },
): string {
  // W3.3: no hardcoded country. If the reducer handed us empty strings, the
  // resource resolution upstream failed — degrade onto the documented
  // international set, LOUDLY (resolveSafetyResourceNumbers logs the
  // fallback), never onto a French number the caller may not be able to dial.
  const needsFallback = !safetyResources.emergency_numbers ||
    !safetyResources.suicide_prevention_number;
  const resolved = needsFallback
    ? resolveSafetyResourceNumbers(null, { conjunction: "ou" })
    : null;
  const emergency = safetyResources.emergency_numbers ||
    resolved?.emergency_numbers || "";
  const suicide = safetyResources.suicide_prevention_number ||
    resolved?.suicide_prevention_number || "";
  const messages: Record<SafetyCrisisVisibleTaskKind, string> = {
    immediate_risk_check:
      "Une chose d'abord : est-ce que tu es en danger immédiat, là, maintenant ?",
    acute_grounding:
      `Là, tout de suite : éloigne ce qui pourrait te blesser et rapproche-toi d'une personne. Si le danger est immédiat, appelle le ${emergency} ; le ${suicide} répond aussi 24h/24.`,
    support_contact:
      "Le plus utile maintenant : garder le lien avec une personne de confiance. Tu as quelqu'un que tu peux joindre là ?",
    stabilizing:
      "On reste sur l'essentiel : reste où tu es, garde le lien avec la personne qui te soutient, et respire calmement (4 secondes d'inspiration, 6 d'expiration).",
    exit_check:
      "Avant de reprendre : il n'y a bien aucun danger immédiat pour toi, là, maintenant ?",
    resolved_exit:
      "D'accord. L'immédiat est stabilisé, on peut reprendre là où tu veux.",
    repeat_current_step:
      "On reste sur le pas en cours, à ton rythme. Dis-moi où tu en es.",
    product_tool_boundary:
      "Je garde ta demande de côté pour après. Pour l'instant, on reste sur ta sécurité, une chose à la fois.",
    stop_or_cancel:
      `D'accord, on s'arrête là. Si besoin, le ${suicide} répond 24h/24.`,
    safety_transition:
      "On met le reste de côté un instant. Est-ce que tu es en sécurité, là, maintenant ?",
    safety_escalation:
      `Appelle maintenant le ${emergency}. Si c'est lié à des idées suicidaires, le ${suicide} répond 24h/24. Si tu peux, rapproche-toi d'une personne tout de suite.`,
  };
  // R5 — LE PLANCHER DU PLANCHER.
  //
  // `messages` est indexé par un type fermé, et le typecheck garantit
  // aujourd'hui la totalité de la table: `visibleTaskKindFor` mappe les sept
  // phases sur les onze `kind`, `resolved` et `entry` compris. Mais ce `??`
  // n'est pas de la ceinture décorative: le jour où un `kind` s'ajoute au
  // contrat sans sa copie ici, la version d'avant rendait `undefined`, donc
  // `decision.reply = ""` — UN TOUR DE SÉCURITÉ VIDE, l'unique chose que ce
  // module existe pour rendre impossible, et invisible au typecheck si le
  // `kind` arrive d'un état persisté. Et depuis §8 il rendrait pire qu'un
  // vide: un TypeError dans le gestionnaire de panne (§3).
  const template = messages[kind] ??
    "On reste sur ta sécurité, une chose à la fois.";
  // §8: la réponse de repli EXISTE **et contient des ressources**. Les onze
  // gabarits ci-dessus n'en portent que trois; les huit autres partaient nus.
  return withCrisisResourceLine(template, emergency, suicide);
}

const STAGE_PROMPTS: Record<SafetyCrisisVisibleTaskKind, string> = {
  immediate_risk_check: [
    "Stage immediate_risk_check.",
    "Commence par UNE phrase d'accueil qui reconnait ce que le user vient de confier (chaleureuse, sans dramatiser, sans consigne) — surtout au premier tour du flow.",
    "Puis verifier la securite immediate avec une formulation courte et directe.",
    "Utilise seulement conversation_context. Termine par la question la plus utile pour savoir si le user est en danger maintenant ou seul.",
    "Ne RE-POSE JAMAIS une question deja repondue: si known_values.immediate_danger ou known_values.user_not_alone porte deja une valeur (true/false), ce fait est acquis — la question porte UNIQUEMENT sur un fait encore null, avec une formulation nouvelle (jamais la meme phrase qu'au tour precedent).",
  ].join("\n"),
  acute_grounding: [
    "Stage acute_grounding.",
    "Prioriser une seule action immediate: eloigner ce qui peut blesser si possible sans danger, contacter une aide humaine, ou appeler les urgences selon conversation_context.",
    "Pas de respiration longue, pas de coaching, pas d'explication produit.",
  ].join("\n"),
  support_contact: [
    "Stage support_contact.",
    "Si known_values indique que le user vient de dire qu'il est SEUL, commence par accueillir cette solitude explicitement (une phrase de presence) — jamais une nouvelle question de triage.",
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
    "Exception (P7-A, paul-p6reval T16): si conversation_context.handoff_data.deferred_product_or_tool_request est non-null, la promesse tenue pendant la crise se SOLDE ici — mentionne en UNE ligne que ce qui avait ete mis de cote peut se poser maintenant ('ton rappel kine, on peut le poser maintenant si tu veux') sans le creer toi-meme ni redemander tous les details. L'ignorer en silence sur le tour de sortie est le bug observe.",
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
    "Pas de produit, pas d'outil, pas de plan, pas de potion, pas de carte, pas de statut.",
    "CO-DEMANDE BENIGNE (P7-A): si conversation_context.handoff_data.benign_recall_request.asked est vrai, le user vient de demander qu'on lui redise un fait qu'il avait confie. Ce n'est ni un produit ni un outil: JAMAIS un silence sur cette demande. Si benign_recall_request.facts est non vide, restitue fidelement le fait en UNE phrase en fin de reponse (le soutien vient d'abord). Si facts est vide, dis en une ligne honnete que tu le lui rediras juste apres ce moment — sans inventer de contenu. La regle vaut AUSSI pour un readout READ-ONLY de RAPPELS (P8-E, paul-untested22 T14: « redis-moi mes rappels de demain » avale sous le bucket produit/outil): les lignes 'Rappel en attente ...' de facts sont la liste REELLE (source DB) — restitue-les fidelement en fin de reponse (chaque label + consigne, sans en inventer ni en omettre); c'est une lecture, jamais un differe obligatoire.",
    ...oneShotReminderCanonicalVisiblePromptLines(
      "conversation_context.known_values.direct_effect_confirmation_context",
      {
        present: oneShotReminderVisibleContextPresent(
          (input.visible_task.conversation_context.known_values as
            | Record<string, unknown>
            | undefined)?.direct_effect_confirmation_context,
        ),
        committedThisTurn: directEffectContextCommittedThisTurn(
          (input.visible_task.conversation_context.known_values as
            | Record<string, unknown>
            | undefined)?.direct_effect_confirmation_context,
        ),
        committedKnown: committedOneShotReminderKnown({
          directEffectConfirmationContext:
            (input.visible_task.conversation_context.known_values as
              | Record<string, unknown>
              | undefined)?.direct_effect_confirmation_context,
        }),
      },
    ),
    "Ordre de rendu safety-first: si un rappel a ete commis ce tour, le contenu safety (accueil, verification, prochaine action) ouvre TOUJOURS ta reponse; la confirmation du rappel est UNE seule phrase sobre en toute FIN de message — jamais la premiere phrase, jamais avant la question safety du tour.",
    "Ne mentionne jamais JSON, dispatcher, reducer, prompt, table, DB ou outil interne.",
    "Si conversation_context.safety_resources.must_include_emergency_numbers=true, inclure exactement emergency_numbers et suicide_prevention_number.",
    "Si must_include_emergency_numbers=false et conversation_context.known_values.emergency_numbers_already_delivered=true, ne re-recite pas les numeros d'urgence (deja donnes): bascule vers un soutien emotionnel soutenu — presence, ancrage, renforcement du lien humain reel (la personne que le user va joindre) — sans repeter la hotline. Ne re-donne les numeros que si le user signale une nouvelle aggravation.",
    "Respecte max_questions strictement.",
    "Ne dis pas que tout est resolu sauf si stage=resolved_exit.",
    "Ne presente jamais Sophia comme une aide humaine.",
    "Qualite safety stricte: phrases courtes, pas de mot coupe, pas de terme invente, pas de formulation creative pour les techniques de respiration ou d'ancrage.",
    VISIBLE_SAFETY_CONVERSATION_FLOW_RULES,
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
      status_lookup: "blocked",
      operation_runtime: "blocked",
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
      appendResponseLanguageBlock(
        visibleSystemPrompt(input),
        input.response_locale,
      ),
      userPrompt,
      0.35,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel(),
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
