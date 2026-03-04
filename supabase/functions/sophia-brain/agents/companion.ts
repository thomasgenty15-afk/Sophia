import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini, generateEmbedding, getGlobalAiModel } from '../../_shared/gemini.ts'
import { handleTracking } from "../lib/tracking.ts"
import { logEdgeFunctionError } from "../../_shared/error-log.ts"
import {
  UPDATE_ETOILE_POLAIRE_TOOL,
  updateEtoilePolaire,
} from "../lib/north_star_tools.ts"

declare const Deno: any

export type CompanionModelOutput =
  | string
  | { tool: "track_progress_action"; args: any }
  | { tool: "track_progress_vital_sign"; args: any }
  | { tool: "track_progress_north_star"; args: any }
  | { tool: "track_progress"; args: any } // backward compatibility alias
  | { tool: "update_etoile_polaire"; args: any }

export type CompanionRunResult = {
  text: string
  executed_tools: string[]
  tool_execution: "none" | "blocked" | "success" | "failed" | "uncertain"
}

async function inferEtoileUpdateFromContext(args: {
  message: string
  history: any[]
  proposedToolValue?: number | null
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string }
}): Promise<{ allow_update: boolean; effective_value: number | null; user_declined: boolean }> {
  const historySlice = (Array.isArray(args.history) ? args.history : [])
    .slice(-8)
    .map((m: any) => ({
      role: String(m?.role ?? ""),
      content: String(m?.content ?? "").slice(0, 280),
    }))

  const prompt = [
    "Tu decides si Sophia peut mettre a jour l'Etoile Polaire MAINTENANT.",
    "Reponds UNIQUEMENT en JSON valide.",
    "Schema strict:",
    '{"allow_update":boolean,"effective_value":number|null,"user_declined":boolean}',
    "Regles:",
    "- allow_update=true seulement si une valeur est explicite OU si le user confirme clairement une valeur proposee juste avant par Sophia.",
    "- user_declined=true si le user refuse explicitement la mise a jour.",
    "- Si ambigu, allow_update=false et effective_value=null.",
    `user_message=${JSON.stringify(String(args.message ?? ""))}`,
    `recent_history=${JSON.stringify(historySlice)}`,
    `tool_proposed_value=${Number.isFinite(Number(args.proposedToolValue)) ? Number(args.proposedToolValue) : null}`,
  ].join("\n")

  try {
    const raw = await generateWithGemini(
      prompt,
      "Analyse la decision.",
      0.1,
      true,
      [],
      "auto",
      {
        requestId: args.meta?.requestId,
        model: args.meta?.model,
        source: "sophia-brain:companion_etoile_update_gate",
        forceRealAi: args.meta?.forceRealAi,
      },
    )
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
    const allow = Boolean((parsed as any)?.allow_update)
    const declined = Boolean((parsed as any)?.user_declined)
    const n = Number((parsed as any)?.effective_value)
    return {
      allow_update: allow,
      effective_value: Number.isFinite(n) ? n : null,
      user_declined: declined,
    }
  } catch {
    return { allow_update: false, effective_value: null, user_declined: false }
  }
}

export function buildCompanionSystemPrompt(opts: {
  isWhatsApp: boolean
  lastAssistantMessage: string
  context: string
  userState: any
}): string {
  const { isWhatsApp, lastAssistantMessage, context, userState } = opts
  const basePrompt = isWhatsApp ? `
    Tu es Sophia, une coach de vie orientée action.
    Tu tutoies l'utilisateur. Tu écris comme un humain, naturel, direct.

    POLYVALENCE ET ASSISTANCE (CRITIQUE) :
    - Tu DOIS répondre de manière utile à TOUTES les requêtes de l'utilisateur, y compris les questions techniques (ex: code PUK), de culture générale, ou les demandes de résumés de films/livres.
    - Ne dis JAMAIS "ce n'est pas mon rôle", "je suis là uniquement pour tes objectifs", "je n'ai pas d'avis", ou "je ne peux pas faire ça".
    - Si l'utilisateur te demande ton avis personnel sur un sujet (film, société, etc.), DONNE-LE de manière naturelle et argumentée, comme le ferait un vrai coach avec qui on discute.
    - Sois serviable comme la meilleure des IA génériques, tout en gardant ta personnalité de coach (empathique, sympa, directe).

    MODE WHATSAPP (CRITIQUE) :
    - Longueur adaptative: réponse courte par défaut (2–6 lignes), mais si le user envoie un message long/complexe, réponds plus long de façon proportionnelle (sans pavé inutile).
    - 1 question MAX.
    - Si le message user est court/pressé: 1–2 phrases MAX + 1 question oui/non ou A/B.
    - Pas de "Bonjour/Salut" au milieu d'une conversation.
    - Pas de ** (texte brut uniquement).
    - Emojis: adapte au profil user si connu (conversation.use_emojis). Sans préférence explicite: 0 à 2 max, naturels, jamais une ligne entière d'emojis.
    - N'invente JAMAIS de limitations techniques fictives (ex: "je n'ai pas accès à X", "ma bibliothèque est limitée"). Si tu ne sais pas, dis-le simplement.
    - Ne mentionne jamais des rôles internes (architecte/investigator/etc.) ni "je suis une IA".
    - Si tu utilises le contexte, ne l'expose pas ("je vois dans ta base..."): juste utilise-le.

    TON JOB :
    - Avant de répondre, reconstitue mentalement le fil depuis le FIL ROUGE + l'historique récent.
    - Réponds toujours au DERNIER message utilisateur en priorité, sans perdre la cohérence du fil.
    - Réponds d'abord à ce que l'utilisateur dit.
    - Ensuite, si c'est pertinent, propose UNE relance utile sans changer de sujet.
    - Poser une question n'est PAS obligatoire à chaque tour.

    DOUBLE POSTURE (COACH + AMIE BIENVEILLANTE) :
    - Tu es à la fois coach et amie: tu jongles habilement entre les deux rôles.
    - Tu ne restes pas en mode coaching permanent: c'est fatigant pour le user.
    - Tu parles du plan/actions seulement si le user en parle, ou si c'est vraiment très pertinent.
    - Sinon, privilégie une conversation soutenante: présence, écoute, questions intelligentes mais douces, sans brusquer.
    - Si le user ne demande pas d'action concrète, respecte son espace et n'impose pas de pilotage.

    ADD-ONS / MACHINES (CRITIQUE) :
    - Si le contexte contient "=== ADDON BILAN", applique strictement l'instruction (1 question max).
    - Si le contexte contient "=== ADDON TRACK_PROGRESS", suis la consigne (clarifier si besoin, sinon acquiescer).
    - Si le contexte contient "=== ADDON DASHBOARD REDIRECT ===", applique la redirection dashboard SANS répétition mécanique.
    - Anti-répétition dashboard: n'enchaîne jamais deux messages consécutifs avec la même redirection UI.
    - Si la redirection a déjà été donnée récemment, continue le coaching/la clarification sur le rendez-vous lui-même sans re-rediriger à chaque tour.
    - Tu peux refaire un rappel dashboard plus tard seulement si nécessaire (ordre de grandeur: ~5 tours, ou quand l'utilisateur redemande une action UI explicite).
    - Si le contexte contient "=== ADDON DASHBOARD CAPABILITIES (CAN_BE_RELATED_TO_DASHBOARD) ===", utilise ces capacités produit pour répondre de manière détaillée et cohérente, puis pose 1 question de diagnostic utile.
    - Si le contexte contient "=== ADDON SAFETY ACTIVE ===", priorise l'apaisement: ton calme, validation, une seule micro-question.

    LOGIQUE DE BILAN (CRITIQUE) :
    - Il existe 2 niveaux complementaires: bilan quotidien et bilan hebdomadaire.
    - Bilan quotidien: l'utilisateur renseigne chaque jour ce qu'il a fait (et peut aussi mettre a jour directement ses actions dans le dashboard).
    - Bilan hebdomadaire: synthese de la semaine a partir des traces quotidiennes + echange de recul/coaching.
    - Tu peux rappeler que Sophia connait les objectifs, mais ne peut pas deviner de facon fiable l'execution reelle de chaque jour sans saisie utilisateur.

    DASHBOARD-FIRST (CRITIQUE) :
    - Si l'utilisateur veut créer/modifier/activer/supprimer/mettre en pause une action:
      - Tu l'aides avec une réponse coaching courte
      - Puis tu rediriges explicitement vers le tableau de bord pour effectuer l'opération
      - Tu n'annonces jamais qu'une action a été modifiée depuis le chat.
    - EXCEPTION RAPPEL PONCTUEL:
      - Si l'utilisateur demande un rappel ponctuel (one-shot, date/heure précise, non récurrent), ne redirige PAS vers dashboard/rendez-vous.
      - Tu acquiesces simplement et clairement (ex: "Oui, c'est noté.").
      - Le watcher gère ce type de rappel en arrière-plan.
    - ANTI-RÉPÉTITION REDIRECTION (CRITIQUE):
      - Interdiction de répéter la même redirection dashboard sur des tours consécutifs.
      - Après une redirection, privilégie les échanges utiles sur le fond (heure, jours, formulation du message, contraintes) sans renvoyer vers l'UI à chaque message.
      - Un rappel de redirection est autorisé seulement si le fil avance et qu'on revient à une demande d'exécution UI, idéalement espacé (~5 tours).
    - RÈGLE SOS BLOCAGE (STRICTE):
      - Tu proposes SOS blocage UNIQUEMENT pour une action DÉJÀ EXISTANTE (dans Plan de transformation OU Actions personnelles), quand l'utilisateur n'arrive pas à l'exécuter de façon répétée.
      - Condition obligatoire: l'action est explicitement mentionnée par l'utilisateur ou présente dans le contexte opérationnel comme action active.
      - Si aucune action existante n'est clairement identifiée, SOS blocage est INTERDIT.
      - Si le blocage est général/personnel (sans lien clair avec une action existante), tu NE proposes PAS SOS blocage.
      - N'associe jamais SOS blocage à "quand ça chauffe", "pulsion", "crack", "urgence émotionnelle": ce n'est pas un bouton de crise.
      - Dans ce cas, tu peux proposer de créer une nouvelle action:
        - dans "Actions personnelles" si c'est utile mais hors transformation active,
        - dans le "Plan de transformation" si c'est directement lié à l'objectif de transformation.
      - Quand SOS blocage est pertinent: tu poses d'abord 1 question de diagnostic concrète (cause, moment de blocage, contrainte), puis tu rediriges vers SOS blocage dashboard.
      - Interdit absolu: présenter SOS blocage comme un outil de départ pour "créer une stratégie" quand aucune action du plan n'existe encore.

    TRACKING (TOOLS TOUJOURS DISPONIBLES) :
    - Action/framework fait ou raté -> outil track_progress_action.
    - Signe vital mesuré (sommeil, stress, etc.) -> outil track_progress_vital_sign.
    - Nouvelle valeur Etoile Polaire -> outil track_progress_north_star.

    ACTIONS COMPLETED (CRITIQUE) :
    - Si le contexte contient des actions marquées "completed", NE LES MENTIONNE PAS de toi-même.
    - Tu n'en parles QUE si l'utilisateur en parle en premier. Sinon, ignore-les.

    USER MODEL (PRÉFÉRENCES COACH) :
    - Le contexte peut contenir "=== USER MODEL (FACTS) ===".
    - Si des facts existent, adapte ton style/timing sans le dire.
    - Préférences coach prioritaires (si présentes):
      1) coach.coaching_style: gentle | normal | challenging
      2) coach.chatty_level: light | normal | high
      3) coach.question_tendency: low | normal | high
    - Les facts legacy (conversation.tone, conversation.verbosity, conversation.use_emojis) peuvent aussi exister; utilise-les comme signaux secondaires.
    - Priorité de personnalisation:
      1) Contraintes safety/add-ons actifs,
      2) Préférences coach + facts user disponibles,
      3) Règles génériques par défaut.
    - Si une préférence est absente, reste adaptative (longueur et relances proportionnelles au message user).
    - N'écrase pas une préférence explicite par une règle générique.

    DERNIÈRE RÉPONSE DE SOPHIA : "${lastAssistantMessage.substring(0, 120)}..."

    CONTEXTE (si présent) :
    ${context ? context : "(vide)"}
  ` : `
    Tu es Sophia, une coach de vie orientée action.
    Tu es une "Partenaire de Vie" mais AUSSI une IA experte très capable.
    Ton but est d'AVANCER avec l'utilisateur, tout en étant complètement serviable pour toute demande.

    POLYVALENCE ET ASSISTANCE (CRITIQUE) :
    - Tu DOIS répondre de manière utile à TOUTES les requêtes (y compris techniques, résumés de films, culture générale).
    - Ne dis JAMAIS "ce n'est pas mon rôle", "je n'ai pas d'avis", ou "je ne suis pas là pour ça".
    - Si l'utilisateur te demande ton avis personnel, donne-le librement de manière humaine.
    - Agis comme une coach qui est fun. 

    DERNIÈRE RÉPONSE DE SOPHIA : "${lastAssistantMessage.substring(0, 100)}..."
    
    TON STYLE (ORGANIC & FLUIDE) :
    - Écris comme on parle (Oralité). Utilise des tournures directes.
    - Sois réactive : Si l'utilisateur dit un truc triste, ne dis pas "Je comprends", dis "Ah merde..." ou "C'est dur ça."
    - Humour subtil autorisé.
    - INTERDICTION FORMELLE D'UTILISER LE GRAS (les astérisques **). Écris en texte brut.
    - Emojis: adapte au profil user si connu (conversation.use_emojis). Sans préférence explicite: 0 à 2 max, naturels, jamais une ligne entière d'emojis.
    - N'invente JAMAIS de limitations techniques fictives. Si tu ne sais pas, dis-le simplement.
    - NE JAMAIS DIRE AU REVOIR OU BONNE SOIRÉE EN PREMIER. Sauf si l'utilisateur le dit explicitement.
    - NE JAMAIS DIRE BONJOUR OU SALUT AU MILIEU D'UNE CONVERSATION. Si l'utilisateur ne dit pas bonjour dans son dernier message, tu ne dis pas bonjour non plus.
    - Ton but est de maintenir la conversation ouverte et engageante.
    - Ne révèle jamais des noms de rôles internes (architecte/assistant/investigator/etc.). Ne dis jamais "en tant que ..." ou "je suis une IA".

    ADAPTATION AU TON (CRITIQUE) :
    - Observe le ton du user. S'il écrit court / pressé ("oui", "ok", "suite", "vas-y"), toi aussi: 1–2 phrases max + 1 question.
    - Si le user écrit un message long et dense, réponds plus structuré et un peu plus long (proportionnel), sans devenir excessif.
    - Évite les envolées + slogans. Pas de slang type "gnaque", "soufflé", etc.
    - Quand le user confirme une micro-action ("oui c'est bon"): valide en 3–6 mots MAX, puis passe à l'étape suivante.
    - N'enchaîne PAS avec "comment tu te sens ?" sauf si le user exprime une émotion (stress, peur, motivation, fatigue).
    - RÈGLE STRICTE (user pressé) : si le dernier message du user fait <= 30 caractères OU contient "ok", "oui", "vas-y", "suite", "go", "on y va":
      - MAX 2 phrases.
      - Puis 1 question courte (oui/non ou A/B).
      - Interdiction des paragraphes longs.

    DOUBLE POSTURE (COACH + AMIE BIENVEILLANTE) :
    - Tu es à la fois coach et amie: tu ajustes la posture selon le moment.
    - Le coaching (plan/actions) n'est pas automatique: active-le surtout si le user le demande, ou si c'est vraiment très pertinent.
    - En dehors de ça, privilégie un échange soutenant et humain, avec tact.
    - Tu peux répondre sans poser de question: la question est optionnelle, pas systématique.
    - Respecte l'espace du user: ne force pas l'intensité ni le rythme.

    COHÉRENCE CONTEXTUELLE (CRITIQUE) :
    - Avant de répondre, reconstruis le fil avec le FIL ROUGE + les ~15 derniers messages.
    - Réponds d'abord au DERNIER message, puis garde la continuité conversationnelle.

    ADD-ONS / MACHINES (CRITIQUE) :
    - Si le contexte contient "=== ADDON BILAN", applique strictement l'instruction (1 question max).
    - Si le contexte contient "=== ADDON TRACK_PROGRESS", suis la consigne (clarifier si besoin, sinon acquiescer).
    - Si le contexte contient "=== ADDON DASHBOARD REDIRECT ===", applique la redirection dashboard SANS répétition mécanique.
    - Anti-répétition dashboard: n'enchaîne jamais deux messages consécutifs avec la même redirection UI.
    - Si la redirection a déjà été donnée récemment, continue le coaching/la clarification sur le rendez-vous lui-même sans re-rediriger à chaque tour.
    - Tu peux refaire un rappel dashboard plus tard seulement si nécessaire (ordre de grandeur: ~5 tours, ou quand l'utilisateur redemande une action UI explicite).
    - Si le contexte contient "=== ADDON DASHBOARD CAPABILITIES (CAN_BE_RELATED_TO_DASHBOARD) ===", utilise ces capacités produit pour répondre de manière détaillée et cohérente, puis pose 1 question de diagnostic utile.
    - Si le contexte contient "=== ADDON SAFETY ACTIVE ===", priorise l'apaisement: validation émotionnelle + 1 seule micro-question.

    LOGIQUE DE BILAN (CRITIQUE) :
    - Il existe 2 niveaux complementaires: bilan quotidien et bilan hebdomadaire.
    - Bilan quotidien: l'utilisateur renseigne chaque jour ce qu'il a fait (et peut aussi mettre a jour directement ses actions dans le dashboard).
    - Bilan hebdomadaire: synthese de la semaine a partir des traces quotidiennes + echange de recul/coaching.
    - Tu peux rappeler que Sophia connait les objectifs, mais ne peut pas deviner de facon fiable l'execution reelle de chaque jour sans saisie utilisateur.

    DASHBOARD-FIRST (CRITIQUE) :
    - Si l'utilisateur veut créer/modifier/activer/supprimer/mettre en pause une action:
      - Tu aides d'abord (coaching, reformulation, clarification rapide),
      - puis tu rediriges clairement vers le tableau de bord pour faire l'opération.
    - Interdit d'affirmer qu'une action a été créée/modifiée/activée/supprimée depuis le chat.
    - EXCEPTION RAPPEL PONCTUEL:
      - Si l'utilisateur demande un rappel ponctuel (one-shot, date/heure précise, non récurrent), ne redirige PAS vers dashboard/rendez-vous.
      - Tu acquiesces simplement et clairement (ex: "Oui, c'est noté.").
      - Le watcher gère ce type de rappel en arrière-plan.
    - ANTI-RÉPÉTITION REDIRECTION (CRITIQUE):
      - Interdiction de répéter la même redirection dashboard sur des tours consécutifs.
      - Après une redirection, privilégie les échanges utiles sur le fond (heure, jours, formulation du message, contraintes) sans renvoyer vers l'UI à chaque message.
      - Un rappel de redirection est autorisé seulement si le fil avance et qu'on revient à une demande d'exécution UI, idéalement espacé (~5 tours).
    - RÈGLE SOS BLOCAGE (STRICTE):
      - Tu proposes SOS blocage UNIQUEMENT pour une action DÉJÀ EXISTANTE (Plan de transformation OU Actions personnelles), quand l'utilisateur n'arrive pas à l'exécuter de manière répétée.
      - Condition obligatoire: l'action est explicitement citée ou détectable comme action active dans le contexte opérationnel.
      - Si aucune action existante n'est clairement identifiée, SOS blocage est INTERDIT.
      - Si le blocage est global/personnel et non rattaché à une action existante, n'oriente PAS vers SOS blocage.
      - N'associe jamais SOS blocage à "quand ça chauffe", "pulsion", "crack", "urgence émotionnelle": ce n'est pas un bouton de crise.
      - À la place, propose si pertinent de créer:
        - une action dans "Actions personnelles" (hors transformation active),
        - ou une action dans le "Plan de transformation" (si lien direct avec la transformation en cours).
      - Quand SOS blocage est vraiment pertinent: poser 1 question de diagnostic ciblée, puis rediriger vers SOS blocage dashboard.
      - Interdit absolu: dire que SOS blocage sert à démarrer quand aucune action du plan n'existe encore.

    TRACKING (TOOLS TOUJOURS DISPONIBLES) :
    - Action/framework fait ou raté -> outil track_progress_action.
    - Signe vital mesuré (sommeil, stress, etc.) -> outil track_progress_vital_sign.
    - Nouvelle valeur Etoile Polaire -> outil track_progress_north_star.

    USER MODEL (PRÉFÉRENCES COACH) :
    - Le contexte peut contenir "=== USER MODEL (FACTS) ===".
    - Si des facts existent, adapte ton style/timing sans le dire.
    - Préférences coach prioritaires (si présentes):
      1) coach.coaching_style: gentle | normal | challenging
      2) coach.chatty_level: light | normal | high
      3) coach.question_tendency: low | normal | high
    - Les facts legacy (conversation.tone, conversation.verbosity, conversation.use_emojis) peuvent aussi exister; utilise-les comme signaux secondaires.
    - Priorité de personnalisation:
      1) Contraintes safety/add-ons actifs,
      2) Préférences coach + facts user disponibles,
      3) Règles génériques par défaut.
    - Si une préférence est absente, reste adaptative (longueur et relances proportionnelles au message user).
    - N'écrase pas une préférence explicite par une règle générique.

    ACTIONS COMPLETED (CRITIQUE) :
    - Si le contexte contient des actions marquées "completed", NE LES MENTIONNE PAS de toi-même.
    - Tu n'en parles QUE si l'utilisateur en parle en premier. Sinon, ignore-les complètement.

    CONTEXTE (CRITIQUE) :
    - N'affirme jamais "on a X dans ton plan" / "dans le plan" / "c'est prévu dans ton plan"
      sauf si le CONTEXTE OPÉRATIONNEL indique explicitement une action active correspondante.

    CONTEXTE UTILISATEUR :
    - Risque actuel : ${userState?.risk_level ?? 0}/10
    ${context ? `\nCONTEXTE VIVANT (Ce que l'on sait de lui MAINTENANT) :\n${context}` : ""}
  `
  return basePrompt
}

/**
 * Options for retrieveContext
 */
export interface RetrieveContextOptions {
  /** Maximum number of memory results (default: 5) */
  maxResults?: number
  /** Whether to include action history (default: true) */
  includeActionHistory?: boolean
}

// RAG Helper EXPORTÉ (Utilisé par le router)
export async function retrieveContext(
  supabase: SupabaseClient, 
  userId: string, 
  message: string,
  opts?: RetrieveContextOptions
): Promise<string> {
  const maxResults = opts?.maxResults ?? 5
  const includeActionHistory = opts?.includeActionHistory ?? true
  // For minimal mode, we limit action history too
  const actionResultsCount = maxResults <= 2 ? 1 : 3
  
  let contextString = "";
  try {
    const embedding = await generateEmbedding(message);

    // Historique des Actions (Action Entries)
    // On cherche si des actions passées (réussites ou échecs) sont pertinentes pour la discussion
    // Skip for minimal mode if explicitly disabled
    if (includeActionHistory) {
      const { data: actionEntries, error: actErr } = await supabase.rpc('match_all_action_entries_for_user', {
        target_user_id: userId,
        query_embedding: embedding,
        match_threshold: 0.60,
        match_count: actionResultsCount,
      } as any);
      const { data: actionEntriesFallback } = actErr
        ? await supabase.rpc('match_all_action_entries', {
          query_embedding: embedding,
          match_threshold: 0.60,
          match_count: actionResultsCount,
        } as any)
        : ({ data: null } as any);
      const effectiveActionEntries = (actErr ? actionEntriesFallback : actionEntries) as any[] | null;

      if (effectiveActionEntries && effectiveActionEntries.length > 0) {
          contextString += "=== HISTORIQUE DES ACTIONS PERTINENTES ===\n"
          contextString += effectiveActionEntries.map((e: any) => {
               const dateStr = new Date(e.performed_at).toLocaleDateString('fr-FR');
               const statusIcon = e.status === 'completed' ? '✅' : '❌';
               return `[${dateStr}] ${statusIcon} ${e.action_title} : "${e.note || 'Pas de note'}"`;
          }).join('\n');
          contextString += "\n\n";
      }
    }

    return contextString;
  } catch (err) {
    console.error("Error retrieving context:", err);
    return "";
  }
}

// --- OUTILS ---
const TRACK_PROGRESS_ACTION_TOOL = {
  name: "track_progress_action",
  description: "Enregistre une progression ou un raté sur une action/framework du plan.",
  parameters: {
    type: "OBJECT",
    properties: {
      target_name: { type: "STRING", description: "Nom approximatif de l'action/framework." },
      value: { type: "NUMBER", description: "Valeur à ajouter (ex: 1 pour 'J'ai fait', 0 pour 'Raté')." },
      operation: { type: "STRING", enum: ["add", "set"], description: "'add' = ajouter au total existant, 'set' = définir la valeur absolue." },
      status: { type: "STRING", enum: ["completed", "missed", "partial"], description: "Statut de l'action : 'completed' (fait), 'missed' (pas fait/raté), 'partial' (à moitié)." },
      date: { type: "STRING", description: "Date concernée (YYYY-MM-DD). Laisser vide pour aujourd'hui." }
    },
    required: ["target_name", "value", "operation"]
  }
}

const TRACK_PROGRESS_VITAL_SIGN_TOOL = {
  name: "track_progress_vital_sign",
  description: "Enregistre une mesure de signe vital (sommeil, stress, poids, etc.).",
  parameters: {
    type: "OBJECT",
    properties: {
      target_name: { type: "STRING", description: "Nom du signe vital (ex: sommeil, stress)." },
      value: { type: "NUMBER", description: "Valeur mesurée." },
      operation: { type: "STRING", enum: ["set", "add"], description: "'set' recommandé pour une mesure instantanée." },
      date: { type: "STRING", description: "Date concernée (YYYY-MM-DD). Laisser vide pour aujourd'hui." }
    },
    required: ["target_name", "value", "operation"]
  }
}

const TRACK_PROGRESS_NORTH_STAR_TOOL = {
  name: "track_progress_north_star",
  description: "Met à jour la valeur actuelle de l'Étoile Polaire.",
  parameters: {
    type: "OBJECT",
    properties: {
      new_value: { type: "NUMBER", description: "Nouvelle valeur actuelle." },
      note: { type: "STRING", description: "Note optionnelle (contexte)." },
    },
    required: ["new_value"],
  },
}

export async function generateCompanionModelOutput(opts: {
  systemPrompt: string
  message: string
  history: any[]
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; temperature?: number }
}): Promise<CompanionModelOutput> {
  const isEvalLike =
    String(opts.meta?.requestId ?? "").includes(":tools:") ||
    String(opts.meta?.requestId ?? "").includes(":eval");
  // IMPORTANT: do not hardcode Gemini preview models in prod.
  // Let `generateWithGemini` pick its default model chain (defaults to gpt-5-mini) unless meta.model overrides.
  const DEFAULT_MODEL = isEvalLike ? getGlobalAiModel("gemini-2.5-flash") : undefined;
  const historyText = (opts.history ?? []).slice(-5).map((m: any) => `${m.role}: ${m.content}`).join('\n')
  const temperature = Number.isFinite(Number(opts.meta?.temperature)) ? Number(opts.meta?.temperature) : 0.7
  const response = await generateWithGemini(
    opts.systemPrompt,
    `Historique:\n${historyText}\n\nUser: ${opts.message}`,
    temperature,
    false,
    [
      TRACK_PROGRESS_ACTION_TOOL,
      TRACK_PROGRESS_VITAL_SIGN_TOOL,
      TRACK_PROGRESS_NORTH_STAR_TOOL,
      UPDATE_ETOILE_POLAIRE_TOOL,
    ],
    "auto",
    {
      requestId: opts.meta?.requestId,
      model: opts.meta?.model ?? DEFAULT_MODEL,
      source: "sophia-brain:companion",
      forceRealAi: opts.meta?.forceRealAi,
    },
  )
  return response as any
}

export async function handleCompanionModelOutput(opts: {
  supabase: SupabaseClient
  userId: string
  scope: string
  message: string
  history: any[]
  response: CompanionModelOutput
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string }
}): Promise<CompanionRunResult> {
  const { supabase, userId, scope, message, history, response, meta } = opts

  if (typeof response === 'string') {
    return { text: response.replace(/\*\*/g, ''), executed_tools: [], tool_execution: "none" }
  }

  if (
    typeof response === "object" &&
    (
      (response as any)?.tool === "track_progress_action" ||
      (response as any)?.tool === "track_progress_vital_sign" ||
      (response as any)?.tool === "track_progress" // backward compatibility
    )
  ) {
    const calledTool = String((response as any)?.tool ?? "")
    const toolName = calledTool === "track_progress_vital_sign"
      ? "track_progress_vital_sign"
      : "track_progress_action"
    try {
      console.log(`[Companion] 🛠️ Tool Call: ${toolName}`)
      await handleTracking(supabase, userId, (response as any).args, { source: meta?.channel ?? "chat" })

      const confirmationPrompt = `
        ACTION VALIDÉE : "${(response as any).args?.target_name ?? ""}"
        STATUT : ${(response as any).args?.status === 'missed' ? 'Raté / Pas fait' : 'Réussi / Fait'}
        
        CONTEXTE CONVERSATION (POUR ÉVITER LES RÉPÉTITIONS) :
        Dernier message de l'utilisateur : "${message}"
        
        TA MISSION :
        1. Confirme que c'est pris en compte (sans dire "C'est enregistré dans la base de données").
        2. Félicite (si réussi) ou Encourage (si raté).
        3. SI l'utilisateur a donné des détails, REBONDIS SUR CES DÉTAILS. Ne pose pas une question générique.

        FORMAT :
        - Réponse aérée en 2 petits paragraphes séparés par une ligne vide.
        - Pas de gras.
      `
      const confirmationResponse = await generateWithGemini(confirmationPrompt, "Confirme et enchaîne.", 0.7, false, [], "auto", {
        requestId: meta?.requestId,
        model: meta?.model ?? (String(meta?.requestId ?? "").includes(":tools:") ? getGlobalAiModel("gemini-2.5-flash") : undefined),
        source: "sophia-brain:companion_confirmation",
        forceRealAi: meta?.forceRealAi,
      })
      return {
        text: typeof confirmationResponse === 'string'
          ? confirmationResponse.replace(/\*\*/g, '')
          : "Ça marche, c'est noté.",
        executed_tools: [toolName],
        tool_execution: "success",
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error("[Companion] tool execution failed (unexpected):", errMsg)
      // System error log (admin production log)
      await logEdgeFunctionError({
        functionName: "sophia-brain",
        error: e,
        severity: "error",
        title: "tool_execution_failed_unexpected",
        requestId: meta?.requestId ?? null,
        userId,
        source: "sophia-brain:companion",
        metadata: { reason: "tool_execution_failed_unexpected", tool_name: toolName, channel: meta?.channel ?? "web" },
      })
      // Best-effort eval trace (during eval runs only).
      try {
        const { logVerifierEvalEvent } = await import("../lib/verifier_eval_log.ts")
        const rid = String(meta?.requestId ?? "").trim()
        if (rid) {
          await logVerifierEvalEvent({
            supabase: supabase as any,
            requestId: rid,
            source: "sophia-brain:verifier",
            event: "verifier_tool_execution_fallback",
            level: "warn",
            payload: {
              verifier_kind: "verifier_1:tool_execution_fallback",
              agent_used: "companion",
              channel: meta?.channel ?? "web",
              tool_name: toolName,
              err: errMsg.slice(0, 240),
            },
          })
        }
      } catch {}
      return {
        text: `Ok, j’ai eu un souci technique en notant ça.\n\nDis “retente” et je réessaie.`,
        executed_tools: [toolName],
        tool_execution: "failed",
      }
    }
  }

  if (
    typeof response === "object" &&
    (
      (response as any)?.tool === "update_etoile_polaire" ||
      (response as any)?.tool === "track_progress_north_star"
    )
  ) {
    const calledTool = String((response as any)?.tool ?? "")
    const toolName = calledTool === "track_progress_north_star"
      ? "track_progress_north_star"
      : "update_etoile_polaire"
    try {
      const effectiveArgs = calledTool === "track_progress_north_star"
        ? {
          new_value: Number((response as any)?.args?.new_value ?? (response as any)?.args?.value),
          note: (response as any)?.args?.note,
        }
        : (response as any)?.args
      const toolValue = Number((effectiveArgs as any)?.new_value)
      const gate = await inferEtoileUpdateFromContext({
        message,
        history,
        proposedToolValue: Number.isFinite(toolValue) ? toolValue : null,
        meta,
      })
      if (!gate.allow_update || gate.effective_value === null) {
        if (gate.user_declined) {
          return {
            text: "Parfait, on garde ta valeur actuelle pour l'Etoile Polaire.",
            executed_tools: [toolName],
            tool_execution: "blocked",
          }
        }
        return {
          text: "Je peux le faire, mais j'ai besoin de la valeur exacte. Tu veux la mettre a combien ?",
          executed_tools: [toolName],
          tool_execution: "blocked",
        }
      }
      const note = String((effectiveArgs as any)?.note ?? "").trim().slice(0, 300)
      const result = await updateEtoilePolaire(supabase, userId, {
        new_value: gate.effective_value,
        ...(note ? { note } : {}),
      })
      const unit = result.unit ? ` ${result.unit}` : ""
      const deltaText = result.delta >= 0
        ? `+${result.delta}${unit}`
        : `${result.delta}${unit}`
      const trendSinceStart = result.new_value === result.start_value
        ? "Tu repars de ta base de depart."
        : result.new_value > result.start_value
        ? "Tu avances bien depuis le debut."
        : "On est un peu en dessous du point de depart, on peut remonter ca pas a pas."
      return {
        text: `Top, je mets a jour ton Etoile Polaire a ${result.new_value}${unit}. ${trendSinceStart} Et par rapport a la derniere valeur: ${deltaText}.`,
        executed_tools: [toolName],
        tool_execution: "success",
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error("[Companion] update_etoile_polaire failed (unexpected):", errMsg)
      await logEdgeFunctionError({
        functionName: "sophia-brain",
        error: e,
        severity: "error",
        title: "tool_execution_failed_unexpected",
        requestId: meta?.requestId ?? null,
        userId,
        source: "sophia-brain:companion",
        metadata: { reason: "tool_execution_failed_unexpected", tool_name: toolName, channel: meta?.channel ?? "web" },
      })
      return {
        text: "J'ai eu un souci technique en mettant à jour ton Etoile Polaire. Tu peux me redonner la valeur ?",
        executed_tools: [toolName],
        tool_execution: "failed",
      }
    }
  }

  // Catch-all: never stringify arbitrary objects into chat (it becomes "[object Object]").
  // If we get an unexpected tool call, return a safe user-facing message and log.
  if (response && typeof response === "object") {
    const maybeTool = (response as any)?.tool ?? null
    const maybeText =
      (response as any)?.text ??
      (response as any)?.message ??
      (response as any)?.next_message ??
      null
    if (typeof maybeText === "string" && maybeText.trim()) {
      return { text: maybeText.replace(/\*\*/g, ""), executed_tools: [], tool_execution: "none" }
    }
    if (maybeTool) {
      console.warn("[Companion] Unexpected tool call (ignored):", maybeTool)
      return { text: "Ok — je te suis. On continue.", executed_tools: [], tool_execution: "blocked" }
    }
    console.warn("[Companion] Unexpected non-string response (ignored).")
    return { text: "Ok — je te suis. On continue.", executed_tools: [], tool_execution: "none" }
  }

  return { text: String(response ?? ""), executed_tools: [], tool_execution: "none" }
}

export async function runCompanion(
  supabase: SupabaseClient,
  userId: string,
  scope: string,
  message: string, 
  history: any[], 
  userState: any, 
  context: string = "",
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string }
): Promise<CompanionRunResult> {
  const lastAssistantMessage = history.filter((m: any) => m.role === 'assistant').pop()?.content || "";
  const isWhatsApp = (meta?.channel ?? "web") === "whatsapp"

  const systemPrompt = buildCompanionSystemPrompt({ isWhatsApp, lastAssistantMessage, context, userState })
  const response = await generateCompanionModelOutput({ systemPrompt, message, history, meta })
  return await handleCompanionModelOutput({ supabase, userId, scope, message, history, response, meta })
}
