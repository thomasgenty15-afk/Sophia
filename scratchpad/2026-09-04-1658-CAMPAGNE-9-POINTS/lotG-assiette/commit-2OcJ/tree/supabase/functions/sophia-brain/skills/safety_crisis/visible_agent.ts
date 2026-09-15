import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
// W9/R3 — la langue de la reponse VISIBLE est RECUE (`input.response_locale`),
// resolue une seule fois par le proprietaire du tour. Ce module appelait
// `resolveResponseLocale({})`: une chaine de priorite sans aucune entree, donc
// une langue decidee par son repli. Le bloc RESPONSE_LANGUAGE part en DERNIERE
// instruction du prompt (la position est le mecanisme: la recence gagne).
import {
  appendResponseLanguageBlock,
  isFrenchLocale,
} from "../../../_shared/keel/locale.ts";
import {
  committedOneShotReminderKnown,
  directEffectContextCommittedThisTurn,
  oneShotReminderCanonicalVisiblePromptLines,
  oneShotReminderVisibleContextPresent,
} from "../../router/one_shot_reminder_prompt_contract.ts";
import {
  visibleOutputStyleRules,
  visibleSafetyConversationFlowRules,
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
  french: boolean,
): string {
  const contacts = [emergency, suicide].map((c) => c.trim()).filter(Boolean);
  if (contacts.length === 0) return message;
  // Déjà cité ? On n'empile pas. Le test porte sur le contact lui-même et pas
  // sur une phrase: `safety_escalation` et `acute_grounding` interpolent déjà
  // les deux, et une seconde ligne y serait un doublon.
  if (contacts.some((contact) => message.includes(contact))) return message;
  const listed = contacts.join(" · ");
  return french
    ? `${message}\n\nEn cas de danger immédiat : ${listed}.`
    : `${message}\n\nIf you are in immediate danger: ${listed}.`;
}

/**
 * Les onze gabarits, dans une langue, en fonction des deux contacts.
 *
 * Une fonction et pas deux `Record` littéraux: les contacts s'interpolent, et
 * deux tables construites séparément dérivent (l'une gagne un `kind`, l'autre
 * pas — exactement le trou que le `??` de R5 rattrape déjà en aval).
 */
function frenchTemplates(
  emergency: string,
  suicide: string,
): Record<SafetyCrisisVisibleTaskKind, string> {
  return {
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
}

function englishTemplates(
  emergency: string,
  suicide: string,
): Record<SafetyCrisisVisibleTaskKind, string> {
  return {
    immediate_risk_check:
      "One thing first: are you in immediate danger right now?",
    acute_grounding:
      `Right now: move anything that could hurt you out of reach, and get closer to another person. If the danger is immediate, call ${emergency}; ${suicide} is also there 24/7.`,
    support_contact:
      "The most useful thing now: staying connected to someone you trust. Is there someone you can reach right now?",
    stabilizing:
      "Let's keep to the essentials: stay where you are, stay connected to the person supporting you, and breathe calmly (4 seconds in, 6 seconds out).",
    exit_check:
      "Before we move on: there is no immediate danger for you right now, is that right?",
    resolved_exit:
      "All right. The immediate situation is stable, we can pick up wherever you want.",
    repeat_current_step:
      "We stay on the current step, at your pace. Tell me where you are with it.",
    product_tool_boundary:
      "I'm keeping your request aside for later. For now, we stay on your safety, one thing at a time.",
    stop_or_cancel:
      `All right, we stop here. If you need it, ${suicide} is there 24/7.`,
    safety_transition:
      "We'll set the rest aside for a moment. Are you safe right now?",
    safety_escalation:
      `Call ${emergency} now. If this is about suicidal thoughts, ${suicide} is there 24/7. If you can, get to another person straight away.`,
  };
}

/**
 * Invariant anti-vide du rendu safety: si le visible agent echoue, le skill
 * rend ce message deterministe au lieu d'une reponse vide (jamais de tour
 * safety silencieux). L'echec reste observable via visible_generation_failed.
 *
 * 🔴 L1 — POURQUOI `locale` EST UN PARAMETRE, ET POURQUOI IL EST REQUIS.
 * Jusqu'au 2026-08-08 cette fonction ne recevait AUCUNE langue: ses onze
 * gabarits etaient des chaines francaises en dur. Mesure FF-020 (§C.1):
 * `looks_french = true` **33 fois sur 33** (11 kinds x 3 pays). Ce qu'un eleve
 * americain lisait quand le modele tombait:
 *   « Appelle maintenant le 911. Si c'est lie a des idees suicidaires, le 988
 *     repond 24h/24. »
 * Les bons numeros, dans une langue qu'il ne lit peut-etre pas, au moment ou
 * il demande de l'aide. Et c'est le chemin de DERNIER RECOURS: celui qui sert
 * quand tout le reste est deja tombe.
 *
 * REQUIS, pas optionnel, et c'est le mecanisme (cicatrice
 * `optional-gate-params-are-disarmed-gates`): un `locale?` avec un defaut
 * francais rendrait exactement le meme defaut, en ayant l'air cable.
 *
 * `isFrenchLocale` ET JAMAIS `localePackKey`: ce dernier THROW pour une langue
 * non livree (R7). Un throw ici produirait le tour de securite VIDE que ce
 * module existe pour rendre impossible — la panne dans le gestionnaire de
 * panne (§3). Toute locale non francaise atterrit donc sur l'anglais, qui est
 * aussi le repli final du resolveur: le degrade est declare, pas devine.
 *
 * R1 TENUE: deux tables de chaines et une concatenation. Aucun `await`, aucune
 * lecture, aucun throw.
 */
export function safetyCrisisDeterministicVisibleMessage(
  kind: SafetyCrisisVisibleTaskKind,
  safetyResources: {
    emergency_numbers: string;
    suicide_prevention_number: string;
  },
  locale: string,
): string {
  const french = isFrenchLocale(locale);
  // W3.3: no hardcoded country. If the reducer handed us empty strings, the
  // resource resolution upstream failed — degrade onto the documented
  // international set, LOUDLY (resolveSafetyResourceNumbers logs the
  // fallback), never onto a French number the caller may not be able to dial.
  const needsFallback = !safetyResources.emergency_numbers ||
    !safetyResources.suicide_prevention_number;
  const resolved = needsFallback
    // La conjonction appartient a la PHRASE, pas au resolveur: « 15 ou 112 »
    // dans un message anglais est le meme defaut que le message anglais chez
    // un eleve francais, en plus petit.
    ? resolveSafetyResourceNumbers(null, {
      conjunction: french ? "ou" : "or",
    })
    : null;
  const emergency = safetyResources.emergency_numbers ||
    resolved?.emergency_numbers || "";
  const suicide = safetyResources.suicide_prevention_number ||
    resolved?.suicide_prevention_number || "";
  const messages = french
    ? frenchTemplates(emergency, suicide)
    : englishTemplates(emergency, suicide);
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
    (french
      ? "On reste sur ta sécurité, une chose à la fois."
      : "We stay on your safety, one thing at a time.");
  // §8: la réponse de repli EXISTE **et contient des ressources**. Les onze
  // gabarits ci-dessus n'en portent que trois; les huit autres partaient nus.
  return withCrisisResourceLine(template, emergency, suicide, french);
}

/**
 * LES CONSIGNES DE STAGE — LE TROU LE PLUS CHER DE CE MODULE.
 *
 * ── LE DÉFAUT, ET POURQUOI IL SE VOYAIT SI MAL ────────────────────────────
 * `safetyCrisisDeterministicVisibleMessage` (plus haut) a DÉJÀ ses deux packs
 * et sa locale requise: le repli déterministe parlait donc anglais à un élève
 * anglophone. Ces consignes-ci, elles, étaient un `Record` entièrement
 * FRANÇAIS consommé sans condition. Un élève anglophone en crise voyait donc
 * sa réponse GÉNÉRÉE depuis un prompt français, la langue de sortie ne tenant
 * plus qu'au bloc `RESPONSE_LANGUAGE` en queue.
 *
 * Ce n'est pas une nuance de style. La consigne de stage est ce qui décide
 * QUELLE question est posée et DANS QUEL ORDRE; un modèle qui la lit dans une
 * langue et répond dans une autre traduit à la volée — et sur cette surface,
 * la formulation exacte d'une question de triage est le produit.
 *
 * ── LE MOTIF EST CELUI DE `companion.ts` ──────────────────────────────────
 * Deux tables entières, pas des fragments interpolés. Le pack FRANÇAIS est
 * GELÉ mot pour mot: il a été écrit, relu et éprouvé sur une surface de
 * sécurité, et le paraphraser « au passage » n'est pas un droit qu'on prend
 * dans un lot de langue.
 */
const STAGE_PROMPTS_FR: Record<SafetyCrisisVisibleTaskKind, string> = {
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

/**
 * Le pack ANGLAIS — redérivé consigne par consigne, jamais traduit mot à mot.
 *
 * Ce qui est GARDÉ À L'IDENTIQUE dans les deux packs, et qu'aucune traduction
 * n'a le droit d'assouplir:
 *   · les CHEMINS de contexte (`conversation_context.handoff_data.…`,
 *     `known_values.immediate_danger`) — ce sont des jetons machine (R1);
 *   · les NOMS DE STAGE, pour la même raison;
 *   · les interdictions, une par une, dans le même ordre. Une consigne perdue
 *     dans un pack est une règle de sécurité qui ne s'applique qu'à la moitié
 *     des élèves, et rien ne le montrerait — d'où le test de TOTALITÉ des deux
 *     tables.
 */
const STAGE_PROMPTS_EN: Record<SafetyCrisisVisibleTaskKind, string> = {
  immediate_risk_check: [
    "Stage immediate_risk_check.",
    "Open with ONE sentence that acknowledges what the user has just confided (warm, without dramatising, without instruction) — especially on the first turn of the flow.",
    "Then check immediate safety, in short and direct words.",
    "Use conversation_context only. End with the single most useful question to find out whether the user is in danger right now or alone.",
    "NEVER RE-ASK a question already answered: if known_values.immediate_danger or known_values.user_not_alone already carries a value (true/false), that fact is settled — the question must bear ONLY on a fact that is still null, in new words (never the same sentence as the previous turn).",
  ].join("\n"),
  acute_grounding: [
    "Stage acute_grounding.",
    "Prioritise a single immediate action: move whatever can hurt out of reach if that is possible without danger, reach a human being, or call emergency services, according to conversation_context.",
    "No long breathing exercise, no coaching, no product explanation.",
  ].join("\n"),
  support_contact: [
    "Stage support_contact.",
    "If known_values shows the user has just said they are ALONE, begin by acknowledging that solitude explicitly (one sentence of presence) — never a new triage question.",
    "Help the user reach or keep a real human being with them.",
    "You may offer a simple sentence to say or send if conversation_context shows support is missing.",
  ].join("\n"),
  stabilizing: [
    "Stage stabilizing.",
    "Hold the stabilisation by acknowledging only the reassuring facts present in conversation_context.",
    "Keep the link with human help, and the means out of reach.",
    "Use 2 or 3 instructions at most, in plain and standard terms: 4/6 breathing, stay seated, keep the person on the phone, stay away from the means.",
  ].join("\n"),
  exit_check: [
    "Stage exit_check.",
    "Do one last simple check before resolution.",
    "Do not say it is over. Ask for a sober confirmation that there is no immediate danger.",
  ].join("\n"),
  resolved_exit: [
    "Stage resolved_exit.",
    "Say soberly that the immediate moment is stabilised, because conversation_context shows the reducer decided so.",
    "Do not restart any product action, tool, plan, potion, card, reminder or status.",
    "Exception (P7-A, paul-p6reval T16): if conversation_context.handoff_data.deferred_product_or_tool_request is non-null, the promise kept during the crisis is SETTLED here — mention in ONE line that what was set aside can be picked up now ('your physio reminder, we can set it now if you want') without creating it yourself and without asking again for every detail. Ignoring it silently on the exit turn is the observed bug.",
  ].join("\n"),
  repeat_current_step: [
    "Stage repeat_current_step.",
    "Repeat only the current safety step, from conversation_context.handoff_data.current_step.",
    "Do not go back over the whole history.",
  ].join("\n"),
  product_tool_boundary: [
    "Stage product_tool_boundary.",
    "Defer the product, tool, plan, potion, card, reminder or status request named in conversation_context.handoff_data.deferred_product_or_tool_request.",
    "Do not write the requested content: no card, no plan, no potion, no status, no ready-to-paste text, no artefact title, no product personalisation list.",
    "Do not ask for a time, product details, a platform destination or a confirmation for that deferred request.",
    "Simply say you are keeping it aside for after the stabilisation, then come back to a single next safety action.",
    "Exception: explicitly allowed one-off reminders do not go through this stage; if you are in this stage, no reminder is to be confirmed.",
  ].join("\n"),
  stop_or_cancel: [
    "Stage stop_or_cancel.",
    "The user wants to stop locally, with no clear new subject.",
    "Answer very briefly, with no closing question, without calling the global dispatcher, keeping a safety resource if conversation_context requires one.",
  ].join("\n"),
  safety_transition: [
    "Stage safety_transition.",
    "The turn comes from another flow but safety takes over again.",
    "Do not expose the source note. Refocus directly on immediate safety.",
  ].join("\n"),
  safety_escalation: [
    "Stage safety_escalation.",
    "Prioritise the emergency with the resources provided in conversation_context.safety_resources.",
    "One short sentence and one immediate action towards emergency services or human help.",
  ].join("\n"),
};

/**
 * ⚠️ PAS DE `localePackKey` ICI, ET C'EST DÉLIBÉRÉ. `localePackKey` JETTE pour
 * une langue non livrée — un comportement juste pour un écran, inacceptable ici:
 * un tour de crise qui lève est un élève en danger à qui on ne répond pas. La
 * dégradation vers l'anglais a déjà eu lieu en amont
 * (`clampToDeliveredLocale`), et `isFrenchLocale` est LE prédicat unique du gel.
 */
function stagePromptsFor(locale: string): Record<SafetyCrisisVisibleTaskKind, string> {
  return isFrenchLocale(locale) ? STAGE_PROMPTS_FR : STAGE_PROMPTS_EN;
}

/**
 * LES CONSIGNES FIXES DU PROMPT VISIBLE — deux packs entiers.
 *
 * Elles étaient françaises en dur au même titre que `STAGE_PROMPTS`, et pour
 * la même raison: personne n'avait eu besoin de l'autre langue. Les traduire
 * n'aurait servi à rien si la consigne de stage restait française, et
 * inversement — d'où les deux dans le même lot.
 *
 * ⚠️ CE QUI RESTE FRANÇAIS DANS CE PROMPT, ET QUI N'EST PAS À MOI:
 * `oneShotReminderCanonicalVisiblePromptLines` (partagé par plusieurs skills,
 * sans jumelle anglaise). Il est signalé plutôt que traduit à la sauvette: un
 * module partagé se traduit avec tous ses appelants, pas depuis l'un d'eux.
 */
type CrisisPromptPack = {
  opening: string;
  contextOnly: string;
  noRouting: string;
  noProduct: string;
  benignRecall: string;
  safetyFirstOrder: string;
  noInternals: string;
  mustIncludeNumbers: string;
  alreadyDelivered: string;
  maxQuestions: string;
  noPrematureResolution: string;
  neverHuman: string;
  strictQuality: string;
  lengthCeiling: string;
  jsonOnly: string;
};

const CRISIS_PROMPT_PACKS: Record<"fr" | "en", CrisisPromptPack> = {
  fr: {
    opening:
      "Tu ecris le prochain message visible de Sophia dans le flow safety_crisis.",
    contextOnly:
      "Tu recois uniquement visible_task.conversation_context. Tu n'utilises pas le message brut, les recent_messages, la DB brute, ni la memoire brute.",
    noRouting:
      "Tu ne routes pas, tu ne decides pas le risque, tu ne modifies pas l'etat.",
    noProduct:
      "Pas de produit, pas d'outil, pas de plan, pas de potion, pas de carte, pas de statut.",
    benignRecall:
      "CO-DEMANDE BENIGNE (P7-A): si conversation_context.handoff_data.benign_recall_request.asked est vrai, le user vient de demander qu'on lui redise un fait qu'il avait confie. Ce n'est ni un produit ni un outil: JAMAIS un silence sur cette demande. Si benign_recall_request.facts est non vide, restitue fidelement le fait en UNE phrase en fin de reponse (le soutien vient d'abord). Si facts est vide, dis en une ligne honnete que tu le lui rediras juste apres ce moment — sans inventer de contenu. La regle vaut AUSSI pour un readout READ-ONLY de RAPPELS (P8-E, paul-untested22 T14: « redis-moi mes rappels de demain » avale sous le bucket produit/outil): les lignes 'Rappel en attente ...' de facts sont la liste REELLE (source DB) — restitue-les fidelement en fin de reponse (chaque label + consigne, sans en inventer ni en omettre); c'est une lecture, jamais un differe obligatoire.",
    safetyFirstOrder:
      "Ordre de rendu safety-first: si un rappel a ete commis ce tour, le contenu safety (accueil, verification, prochaine action) ouvre TOUJOURS ta reponse; la confirmation du rappel est UNE seule phrase sobre en toute FIN de message — jamais la premiere phrase, jamais avant la question safety du tour.",
    noInternals:
      "Ne mentionne jamais JSON, dispatcher, reducer, prompt, table, DB ou outil interne.",
    mustIncludeNumbers:
      "Si conversation_context.safety_resources.must_include_emergency_numbers=true, inclure exactement emergency_numbers et suicide_prevention_number.",
    alreadyDelivered:
      "Si must_include_emergency_numbers=false et conversation_context.known_values.emergency_numbers_already_delivered=true, ne re-recite pas les numeros d'urgence (deja donnes): bascule vers un soutien emotionnel soutenu — presence, ancrage, renforcement du lien humain reel (la personne que le user va joindre) — sans repeter la hotline. Ne re-donne les numeros que si le user signale une nouvelle aggravation.",
    maxQuestions: "Respecte max_questions strictement.",
    noPrematureResolution:
      "Ne dis pas que tout est resolu sauf si stage=resolved_exit.",
    neverHuman: "Ne presente jamais Sophia comme une aide humaine.",
    strictQuality:
      "Qualite safety stricte: phrases courtes, pas de mot coupe, pas de terme invente, pas de formulation creative pour les techniques de respiration ou d'ancrage.",
    lengthCeiling:
      "Reste court, naturel et concret: maximum 120 mots sauf urgence critique exigeant les numeros.",
    jsonOnly: 'Retourne uniquement un JSON strict: {"message":"..."}.',
  },
  en: {
    opening:
      "You are writing Sophia's next visible message in the safety_crisis flow.",
    contextOnly:
      "You receive visible_task.conversation_context only. You do not use the raw message, recent_messages, the raw DB, or raw memory.",
    noRouting:
      "You do not route, you do not decide the risk level, you do not mutate state.",
    noProduct:
      "No product, no tool, no plan, no potion, no card, no status.",
    benignRecall:
      "BENIGN SIDE-REQUEST (P7-A): if conversation_context.handoff_data.benign_recall_request.asked is true, the user has just asked you to tell them back a fact they had confided. That is neither a product nor a tool: NEVER stay silent on it. If benign_recall_request.facts is non-empty, give the fact back faithfully in ONE sentence at the end of your reply (support comes first). If facts is empty, say in one honest line that you will tell them right after this moment — without inventing content. The rule ALSO covers a READ-ONLY readout of REMINDERS (P8-E, paul-untested22 T14: \"tell me my reminders for tomorrow\" was being swallowed under the product/tool bucket): the 'Rappel en attente ...' lines in facts are the REAL list (DB source) — give them back faithfully at the end of your reply (each label + instruction, inventing none and omitting none); it is a read, never a mandatory deferral.",
    safetyFirstOrder:
      "Safety-first rendering order: if a reminder was committed this turn, the safety content (acknowledgement, check, next action) ALWAYS opens your reply; the reminder confirmation is ONE sober sentence at the very END of the message — never the first sentence, never before this turn's safety question.",
    noInternals:
      "Never mention JSON, dispatcher, reducer, prompt, table, DB or any internal tool.",
    mustIncludeNumbers:
      "If conversation_context.safety_resources.must_include_emergency_numbers=true, include exactly emergency_numbers and suicide_prevention_number.",
    alreadyDelivered:
      "If must_include_emergency_numbers=false and conversation_context.known_values.emergency_numbers_already_delivered=true, do not recite the emergency numbers again (they were already given): move to sustained emotional support — presence, grounding, strengthening the real human link (the person the user is about to reach) — without repeating the hotline. Only give the numbers again if the user reports a new worsening.",
    maxQuestions: "Respect max_questions strictly.",
    noPrematureResolution:
      "Do not say anything is resolved unless stage=resolved_exit.",
    neverHuman: "Never present Sophia as human help.",
    strictQuality:
      "Strict safety quality: short sentences, no cut-off word, no invented term, no creative wording for breathing or grounding techniques.",
    lengthCeiling:
      "Stay short, natural and concrete: 120 words maximum, except a critical emergency that requires the numbers.",
    jsonOnly: 'Return a strict JSON object only: {"message":"..."}.',
  },
};

function visibleSystemPrompt(input: SafetyCrisisVisibleAgentInput): string {
  const stage = input.visible_task.kind;
  // W9/R3 — la locale est REÇUE, résolue une seule fois par le propriétaire du
  // tour. Ce module ne la devine pas et n'en a pas de repli à lui.
  const locale = input.response_locale;
  const pack = isFrenchLocale(locale)
    ? CRISIS_PROMPT_PACKS.fr
    : CRISIS_PROMPT_PACKS.en;
  return [
    pack.opening,
    stagePromptsFor(locale)[stage],
    pack.contextOnly,
    pack.noRouting,
    pack.noProduct,
    pack.benignRecall,
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
    pack.safetyFirstOrder,
    pack.noInternals,
    pack.mustIncludeNumbers,
    pack.alreadyDelivered,
    pack.maxQuestions,
    pack.noPrematureResolution,
    pack.neverHuman,
    pack.strictQuality,
    // ── DEUX SÉLECTEURS QUI EXISTAIENT DÉJÀ, ET QUE CE FICHIER IGNORAIT ────
    //
    // `response_style_policy.ts` livre `VISIBLE_OUTPUT_STYLE_RULES_EN` et
    // `VISIBLE_SAFETY_CONVERSATION_FLOW_RULES_EN` DEPUIS UN LOT PRÉCÉDENT,
    // avec leurs sélecteurs par locale. Ce module importait les constantes
    // FRANÇAISES directement: un pack livré, testé, et jamais atteint — la
    // classe de défaut la plus fréquente de ce dépôt.
    visibleSafetyConversationFlowRules(locale),
    visibleOutputStyleRules(locale),
    pack.lengthCeiling,
    pack.jsonOnly,
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
