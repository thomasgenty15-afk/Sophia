/**
 * Context Loader - Chargement modulaire du contexte par agent
 *
 * Ce module centralise le chargement du contexte pour tous les agents,
 * en utilisant les profils définis dans types.ts pour charger uniquement
 * ce qui est nécessaire.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { AgentMode } from "../state-manager.ts";
import {
  formatActionsSummary,
  formatPlanJson,
  formatPlanMetadata,
  getActionsDetails,
  getActionsSummary,
  getCoreIdentity,
  getPlanFullJson,
  getPlanMetadata,
  getVitalSignsContext,
  type PlanMetadataResult,
} from "../state-manager.ts";
import {
  formatUserProfileFactsForPrompt,
  getUserProfileFacts,
} from "../profile_facts.ts";
import {
  retrieveTopicMemories,
  formatTopicMemoriesForPrompt,
} from "../topic_memory.ts";
// R2: getActiveTopicSession removed (topic sessions disabled)
import type {
  ContextProfile,
  LoadedContext,
  OnDemandTriggers,
} from "./types.ts";
import {
  getContextProfile,
  getVectorResultsCount,
  shouldLoadActionsDetails,
  shouldLoadPlanJson,
} from "./types.ts";

const IDENTITY_MAX_ITEMS = 2;
const IDENTITY_MAX_BLOCK_TOKENS = 280;

/**
 * Options pour le chargement du contexte
 */
export interface ContextLoaderOptions {
  supabase: SupabaseClient;
  userId: string;
  mode: AgentMode;
  message: string;
  history: any[];
  state: any;
  scope: string;
  tempMemory?: any;
  userTime?: { prompt_block?: string };
  triggers?: OnDemandTriggers;
  injectedContext?: string;
  deferredUserPrefContext?: string;
}

/**
 * Résultat du chargement avec métriques
 */
export interface ContextLoadResult {
  context: LoadedContext;
  profile: ContextProfile;
  metrics: {
    elements_loaded: string[];
    load_ms: number;
    estimated_tokens: number;
  };
}

/**
 * Charge le contexte pour un mode d'agent donné
 *
 * @example
 * const result = await loadContextForMode({
 *   supabase,
 *   userId,
 *   mode: "companion",
 *   message: userMessage,
 *   history,
 *   state,
 *   scope: "web",
 *   triggers: dispatcherSignals,
 * })
 */
export async function loadContextForMode(
  opts: ContextLoaderOptions,
): Promise<ContextLoadResult> {
  const startTime = Date.now();
  const profile = getContextProfile(opts.mode);
  const context: LoadedContext = {};
  const elementsLoaded: string[] = [];

  // Plan metadata (needed for planId in subsequent queries)
  let planMeta: PlanMetadataResult | null = null;

  // Parallel loading of independent elements
  const promises: Promise<void>[] = [];

  // 1. Plan metadata (light, ~200 tokens)
  if (
    profile.plan_metadata || profile.plan_json || profile.actions_summary ||
    profile.actions_details
  ) {
    promises.push(
      getPlanMetadata(opts.supabase, opts.userId).then((meta) => {
        planMeta = meta;
        if (profile.plan_metadata) {
          context.planMetadata = formatPlanMetadata(meta);
          elementsLoaded.push("plan_metadata");
        }
      }),
    );
  }

  // 1b. North Star context (on-demand to keep prompt lean)
  const shouldInjectNorthStar = shouldInjectNorthStarContext({
    mode: opts.mode,
    message: opts.message,
    tempMemory: opts.tempMemory,
  });
  if (shouldInjectNorthStar) {
    promises.push(
      loadNorthStarContext(opts.supabase, opts.userId).then((block) => {
        if (block) {
          context.northStarContext = block;
          elementsLoaded.push("north_star_context");
        }
      }),
    );
  }

  const shouldInjectWeeklyRecap = shouldInjectWeeklyRecapContext({
    mode: opts.mode,
    state: opts.state,
  });
  if (shouldInjectWeeklyRecap) {
    promises.push(
      loadWeeklyRecapContext(opts.supabase, opts.userId).then((block) => {
        if (block) {
          context.weeklyRecapContext = block;
          elementsLoaded.push("weekly_recap_context");
        }
      }),
    );
  }

  // 2. Temporal context
  if (profile.temporal && opts.userTime?.prompt_block) {
    context.temporal =
      `=== REPÈRES TEMPORELS ===\n${opts.userTime.prompt_block}\n(Adapte tes salutations/conseils à ce moment de la journée)\n\n`;
    elementsLoaded.push("temporal");
  }

  // 3. Identity (Temple)
  if (profile.identity) {
    promises.push(
      getCoreIdentity(opts.supabase, opts.userId, {
        message: opts.message,
        maxItems: IDENTITY_MAX_ITEMS,
      }).then((identity) => {
        if (identity) {
          const block = `=== PILIERS DE L'IDENTITÉ (TEMPLE) ===\n${identity}\n\n`;
          context.identity = truncateToTokenEstimate(
            block,
            IDENTITY_MAX_BLOCK_TOKENS,
          );
          elementsLoaded.push("identity");
        }
      }),
    );
  }

  // 4. User facts
  if (profile.facts) {
    promises.push(
      getUserProfileFacts({
        supabase: opts.supabase,
        userId: opts.userId,
        scopes: ["global", opts.scope],
      }).then((factRows) => {
        const factsContext = formatUserProfileFactsForPrompt(
          factRows,
          opts.scope,
        );
        if (factsContext) {
          context.facts =
            `${factsContext}\n` +
            `=== CONSIGNE PERSONNALISATION FACTS ===\n` +
            `- Utilise ces facts comme support de connaissance pour personnaliser ton style de réponse.\n` +
            `- En priorité pour: ton (conversation.tone), longueur (conversation.verbosity), emojis (conversation.use_emojis).\n` +
            `- Ces facts orientent la forme de réponse (style/longueur), pas l'exécution d'actions.\n` +
            `- N'invente jamais un fact manquant; si absent, applique le style par défaut.\n\n`;
          elementsLoaded.push("facts");
        }
      }).catch((e) => {
        console.warn(
          "[ContextLoader] failed to load user_profile_facts (non-blocking):",
          e,
        );
      }),
    );
  }

  // 4b. Topic memories (mémoire thématique vivante)
  if (profile.topic_memories && opts.message) {
    promises.push(
      retrieveTopicMemories({
        supabase: opts.supabase,
        userId: opts.userId,
        message: opts.message,
        maxResults: 3,
      }).then((topics) => {
        const topicContext = formatTopicMemoriesForPrompt(topics);
        if (topicContext) {
          context.topicMemories = topicContext;
          elementsLoaded.push("topic_memories");
        }
      }).catch((e) => {
        console.warn(
          "[ContextLoader] failed to load topic_memories (non-blocking):",
          e,
        );
      }),
    );
  }

  // Wait for plan metadata before loading dependent elements
  await Promise.all(promises);

  const planId = (planMeta as PlanMetadataResult | null)?.id ?? null;

  // 5. Plan JSON (heavy, on_demand)
  if (planId && shouldLoadPlanJson(profile, opts.triggers)) {
    const planContent = await getPlanFullJson(opts.supabase, planId);
    if (planContent) {
      context.planJson = formatPlanJson(planContent);
      elementsLoaded.push("plan_json");
    }
  }

  // 6. Actions summary or details
  if (planId) {
    if (shouldLoadActionsDetails(profile, opts.triggers)) {
      const actionsDetails = await getActionsDetails(
        opts.supabase,
        opts.userId,
        planId,
      );
      if (actionsDetails) {
        context.actionsDetails = actionsDetails;
        elementsLoaded.push("actions_details");
      }
    } else if (profile.actions_summary) {
      const actionsSummary = await getActionsSummary(
        opts.supabase,
        opts.userId,
        planId,
      );
      const formatted = formatActionsSummary(actionsSummary);
      if (formatted) {
        context.actionsSummary = formatted;
        elementsLoaded.push("actions_summary");
      }
    }

    // 6b. Lightweight coaching indicators (read-only)
    if (opts.mode === "companion" || opts.mode === "investigator") {
      const indicators = await loadActionIndicators(
        opts.supabase,
        opts.userId,
        planId,
      );
      if (indicators) {
        context.actionIndicators = indicators;
        elementsLoaded.push("action_indicators");
      }
    }
  }

  // 7. Vital signs
  if (profile.vitals) {
    const vitals = await getVitalSignsContext(opts.supabase, opts.userId);
    if (vitals) {
      context.vitals = vitals;
      elementsLoaded.push("vitals");
    }
  }

  // 8. Short-term context (fil rouge)
  if (profile.short_term) {
    const shortTerm = (opts.state?.short_term_context ?? "").toString().trim();
    if (shortTerm) {
      context.shortTerm =
        `=== FIL ROUGE (CONTEXTE COURT TERME) ===\n${shortTerm}\n\n`;
      elementsLoaded.push("short_term");
    }
  }

  // 9. Recent turns (history)
  if (profile.history_depth > 0 && opts.history?.length) {
    const recentTurns = (opts.history ?? [])
      .slice(-profile.history_depth)
      .map((m: any) => {
        const role = String(m?.role ?? "").trim() || "unknown";
        const content = String(m?.content ?? "").trim().slice(0, 420);
        const ts = String((m as any)?.created_at ?? "").trim();
        return ts ? `[${ts}] ${role}: ${content}` : `${role}: ${content}`;
      })
      .join("\n");

    if (recentTurns) {
      context.recentTurns = `=== HISTORIQUE RÉCENT (${
        Math.min(profile.history_depth, opts.history.length)
      } DERNIERS MESSAGES) ===\n${recentTurns}\n\n`;
      elementsLoaded.push("recent_turns");
    }
  }

  // 10. Topic session - DISABLED (R2 simplification: topic machines removed)
  // Topic sessions are no longer created or maintained.

  // 11. Injected context (from UI modules)
  if (opts.injectedContext) {
    context.injectedContext =
      `=== CONTEXTE MODULE (UI) ===\n${opts.injectedContext}\n\n`;
    elementsLoaded.push("injected_context");
  }

  // 12. Deferred user pref context
  if (opts.deferredUserPrefContext) {
    context.deferredUserPref = opts.deferredUserPrefContext;
    elementsLoaded.push("deferred_user_pref");
  }

  // 13. Track progress addon (parallel tracking)
  const trackProgressAddon = (opts.tempMemory as any)
    ?.__track_progress_parallel;
  if (
    trackProgressAddon &&
    opts.mode === "companion"
  ) {
    context.trackProgressAddon = formatTrackProgressAddon(trackProgressAddon);
    if (context.trackProgressAddon) elementsLoaded.push("track_progress_addon");
  }

  // 14. Dashboard redirect addon (CRUD intent detected by dispatcher)
  const dashboardRedirectAddon = (opts.tempMemory as any)
    ?.__dashboard_redirect_addon;
  if (
    dashboardRedirectAddon &&
    (opts.mode === "companion" || opts.mode === "investigator")
  ) {
    context.dashboardRedirectAddon = formatDashboardRedirectAddon(
      dashboardRedirectAddon,
    );
    if (context.dashboardRedirectAddon) {
      elementsLoaded.push("dashboard_redirect_addon");
    }
  }

  // 15. Safety active addon (dynamic tone/protocol guidance)
  const safetyActiveAddon = (opts.tempMemory as any)?.__safety_active_addon;
  if (
    safetyActiveAddon &&
    (opts.mode === "companion" || opts.mode === "investigator")
  ) {
    context.safetyActiveAddon = formatSafetyActiveAddon(safetyActiveAddon);
    if (context.safetyActiveAddon) elementsLoaded.push("safety_active_addon");
  }

  // 15b. Dashboard preferences intent addon (dedicated UX/UI settings redirect)
  const dashboardPreferencesIntentAddon = (opts.tempMemory as any)
    ?.__dashboard_preferences_intent_addon;
  if (
    dashboardPreferencesIntentAddon &&
    (opts.mode === "companion" || opts.mode === "investigator")
  ) {
    context.dashboardPreferencesIntentAddon =
      formatDashboardPreferencesIntentAddon(
        dashboardPreferencesIntentAddon,
      );
    if (context.dashboardPreferencesIntentAddon) {
      elementsLoaded.push("dashboard_preferences_intent_addon");
    }
  }

  // 15c. Dashboard recurring reminder intent addon (dedicated reminder settings redirect)
  const dashboardRecurringReminderIntentAddon = (opts.tempMemory as any)
    ?.__dashboard_recurring_reminder_intent_addon;
  if (
    dashboardRecurringReminderIntentAddon &&
    (opts.mode === "companion" || opts.mode === "investigator")
  ) {
    context.dashboardRecurringReminderIntentAddon =
      formatDashboardRecurringReminderIntentAddon(
        dashboardRecurringReminderIntentAddon,
      );
    if (context.dashboardRecurringReminderIntentAddon) {
      elementsLoaded.push("dashboard_recurring_reminder_intent_addon");
    }
  }

  // 15d. Dashboard capabilities addon (umbrella "can be related to dashboard")
  const dashboardCapabilitiesAddon = (opts.tempMemory as any)
    ?.__dashboard_capabilities_addon;
  if (
    dashboardCapabilitiesAddon &&
    (opts.mode === "companion" || opts.mode === "investigator")
  ) {
    context.dashboardCapabilitiesAddon = formatDashboardCapabilitiesAddon(
      dashboardCapabilitiesAddon,
    );
    if (context.dashboardCapabilitiesAddon) {
      elementsLoaded.push("dashboard_capabilities_addon");
    }
  }

  // 16. Expired bilan summary (silent expiry context for companion)
  const expiredBilanSummary = (opts.tempMemory as any)?.__expired_bilan_summary;
  if (
    expiredBilanSummary &&
    opts.mode === "companion"
  ) {
    const done = Array.isArray(expiredBilanSummary.items_done)
      ? expiredBilanSummary.items_done
      : [];
    const skipped = Array.isArray(expiredBilanSummary.items_skipped)
      ? expiredBilanSummary.items_skipped
      : [];
    const elapsed = expiredBilanSummary.elapsed_minutes ?? "?";
    let block = `=== CONTEXTE : BILAN PRÉCÉDENT NON TERMINÉ ===\n`;
    block +=
      `Le bilan du jour a été lancé il y a ~${elapsed} minutes mais n'a pas été terminé.\n`;
    if (done.length > 0) block += `Items traités : ${done.join(", ")}.\n`;
    if (skipped.length > 0) {
      block += `Items non traités : ${skipped.join(", ")}.\n`;
    }
    block +=
      `Tu n'as PAS besoin de mentionner l'expiration sauf si l'utilisateur en parle.\n`;
    block +=
      `Si l'utilisateur demande à reprendre le bilan ou mentionne le bilan, dis-lui qu'on pourra en refaire un au prochain créneau.\n\n`;
    context.expiredBilanContext = block;
    elementsLoaded.push("expired_bilan_context");
  }

  // 17. Lightweight onboarding addon — applies when __onboarding_active is set.
  const onboardingState = (opts.tempMemory as any)?.__onboarding_active;
  if (onboardingState && opts.mode === "companion") {
    context.onboardingAddon = formatOnboardingAddon(onboardingState);
    if (context.onboardingAddon) elementsLoaded.push("onboarding_addon");
  }

  // 18. Checkup intent addon (manual trigger requested, but bilan is cron-driven).
  const checkupNotTriggerableAddon = (opts.tempMemory as any)
    ?.__checkup_not_triggerable_addon;
  if (checkupNotTriggerableAddon && opts.mode === "companion") {
    context.checkupNotTriggerableAddon = formatCheckupNotTriggerableAddon(
      checkupNotTriggerableAddon,
    );
    if (context.checkupNotTriggerableAddon) {
      elementsLoaded.push("checkup_not_triggerable_addon");
    }
  }

  // 19. Bilan just stopped addon (one-shot guidance after explicit stop/bored).
  const bilanJustStopped = (opts.tempMemory as any)?.__bilan_just_stopped;
  if (bilanJustStopped && opts.mode === "companion") {
    context.bilanJustStoppedAddon = formatBilanJustStoppedAddon(bilanJustStopped);
    if (context.bilanJustStoppedAddon) {
      elementsLoaded.push("bilan_just_stopped_addon");
    }
  }

  // Calculate metrics
  const totalLength = Object.values(context)
    .filter(Boolean)
    .reduce((sum, val) => sum + (val?.length ?? 0), 0);

  const loadMs = Date.now() - startTime;

  return {
    context,
    profile,
    metrics: {
      elements_loaded: elementsLoaded,
      load_ms: loadMs,
      estimated_tokens: Math.ceil(totalLength / 4),
    },
  };
}

/**
 * Assemble le contexte final en string pour le prompt
 */
export function buildContextString(loaded: LoadedContext): string {
  let ctx = "";

  // Order matters for prompt coherence
  if (loaded.deferredUserPref) ctx += loaded.deferredUserPref;
  if (loaded.injectedContext) ctx += loaded.injectedContext;
  if (loaded.temporal) ctx += loaded.temporal;
  if (loaded.facts) ctx += loaded.facts;
  if (loaded.shortTerm) ctx += loaded.shortTerm;
  if (loaded.recentTurns) ctx += loaded.recentTurns;
  if (loaded.planMetadata) ctx += loaded.planMetadata + "\n\n";
  if (loaded.northStarContext) ctx += loaded.northStarContext + "\n\n";
  if (loaded.weeklyRecapContext) ctx += loaded.weeklyRecapContext + "\n\n";
  if (loaded.planJson) ctx += loaded.planJson + "\n\n";
  if (loaded.actionsSummary) ctx += loaded.actionsSummary + "\n\n";
  if (loaded.actionIndicators) ctx += loaded.actionIndicators + "\n\n";
  if (loaded.actionsDetails) ctx += loaded.actionsDetails + "\n\n";
  if (loaded.vitals) ctx += loaded.vitals + "\n\n";
  if (loaded.identity) ctx += loaded.identity;
  if (loaded.topicMemories) ctx += loaded.topicMemories;
  if (loaded.vectors) {
    ctx += `=== SOUVENIRS / CONTEXTE (FORGE) ===\n${loaded.vectors}\n\n`;
  }
  if (loaded.topicSession) ctx += loaded.topicSession;
  if (loaded.onboardingAddon) ctx += loaded.onboardingAddon;
  if (loaded.trackProgressAddon) ctx += loaded.trackProgressAddon;
  if (loaded.dashboardRedirectAddon) ctx += loaded.dashboardRedirectAddon;
  if (loaded.dashboardPreferencesIntentAddon) {
    ctx += loaded.dashboardPreferencesIntentAddon;
  }
  if (loaded.dashboardRecurringReminderIntentAddon) {
    ctx += loaded.dashboardRecurringReminderIntentAddon;
  }
  if (loaded.dashboardCapabilitiesAddon) {
    ctx += loaded.dashboardCapabilitiesAddon;
  }
  if (loaded.safetyActiveAddon) ctx += loaded.safetyActiveAddon;
  if (loaded.expiredBilanContext) ctx += loaded.expiredBilanContext;
  if (loaded.checkupNotTriggerableAddon) ctx += loaded.checkupNotTriggerableAddon;
  if (loaded.bilanJustStoppedAddon) ctx += loaded.bilanJustStoppedAddon;

  return ctx.trim();
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Format topic session for context
 */
function formatTopicSession(session: any): string {
  const topicType = session.type;
  const focusMode = session.focus_mode ?? "discussion";
  const phase = session.phase ?? "exploring";
  const topicLabel = session.topic ?? "conversation";
  const handoffTo = session.handoff_to ? String(session.handoff_to) : "";

  let ctx = `\n\n=== SESSION TOPIC ACTIVE ===\n`;
  ctx += `- Type: ${topicType}\n`;
  ctx += `- Sujet: ${topicLabel}\n`;
  ctx += `- Phase: ${phase}\n`;
  ctx += `- Focus: ${focusMode}\n`;
  if (handoffTo) {
    ctx += `- Handoff souhaité: ${handoffTo}\n`;
  }

  ctx += `\nCONSIGNE PHASE (CRITIQUE):\n`;
  ctx +=
    `- opening: cadrer le sujet + valider ce qui compte, 1 question courte.\n`;
  ctx +=
    `- exploring: approfondir (1 question ouverte max), rester sur le sujet.\n`;
  ctx +=
    `- converging: synthèse brève + prochaine étape concrète ou angle clair.\n`;
  ctx += `- closing: conclure clairement + proposer transition douce.\n`;
  if (handoffTo) {
    ctx += `- Si possible, prépare un passage fluide vers ${handoffTo}.\n`;
  }

  if (focusMode === "plan") {
    ctx += `\nCONSIGNE FOCUS PLAN:\n`;
    ctx +=
      `- L'utilisateur DISCUTE de son plan/objectifs (pas une opération outil).\n`;
    ctx +=
      `- Aide-le à réfléchir, clarifier, explorer ses doutes ou questions.\n`;
    ctx +=
      `- Si tu détectes qu'il veut une OPÉRATION (créer/modifier/supprimer action), utilise les outils appropriés.\n`;
    ctx +=
      `- Sinon, reste dans la discussion sans pousser vers des actions concrètes.\n`;
  }

  return ctx;
}

function truncateToTokenEstimate(text: string, maxTokens: number): string {
  const maxChars = Math.max(80, Math.floor(maxTokens * 4));
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, Math.max(0, maxChars - 24)).trimEnd();
  return `${truncated}\n[...]\n`;
}

/**
 * Format track progress addon (parallel tracking)
 */
function formatTrackProgressAddon(addon: any): string {
  const mode = String(addon?.mode ?? "logged");
  const msg = String(addon?.message ?? "").trim();
  if (!msg) return "";
  if (mode === "needs_clarify") {
    return `\n\n=== ADDON TRACK_PROGRESS (PARALLELE) ===\n- Le user a dit avoir progressé mais aucune action n'a pu être matchée.\n- Demande une précision courte (quelle action ?), puis tu pourras tracker.\n- Indice interne: ${msg}\n`;
  }
  return `\n\n=== ADDON TRACK_PROGRESS (PARALLELE) ===\n- Le progrès a été loggé automatiquement (ne relance pas le tool).\n- Tu peux continuer le flow normalement et acquiescer si besoin.\n- Résultat: ${msg}\n`;
}

function formatDashboardRedirectAddon(addon: any): string {
  const intents = Array.isArray(addon?.intents)
    ? addon.intents.filter((v: unknown) => typeof v === "string").slice(0, 4)
    : [];
  const intentText = intents.length > 0 ? intents.join(", ") : "CRUD action";
  const fromBilan = Boolean(addon?.from_bilan);
  const isBreakdownIntent = intents.includes("breakdown_action");
  return (
    `\n\n=== ADDON DASHBOARD REDIRECT ===\n` +
    `- Intention détectée: ${intentText}.\n` +
    `- Cet add-on est un support de connaissance pour bien orienter l'utilisateur (pas un exécuteur).\n` +
    `- Réponds utilement et naturellement, puis redirige vers le tableau de bord.\n` +
    (isBreakdownIntent
      ? `- Mode SOS blocage: pose d'abord 1 question de diagnostic ciblée (blocage concret, contexte, contrainte), puis propose la fonction de découpage en micro-étapes dans le dashboard.\n`
      : "") +
    (isBreakdownIntent
      ? `- Exemples de questions utiles: "Qu'est-ce qui bloque exactement ?", "À quel moment ça coince le plus ?", "Quelle version ultra-simple (2 min) serait faisable ?"\n`
      : "") +
    (fromBilan
      ? `- Le bilan reste prioritaire: confirme la redirection dashboard puis reprends l'item du bilan.\n`
      : "") +
    `- Interdiction d'annoncer qu'une action a été créée/modifiée/activée/supprimée depuis le chat.\n` +
    `- Aucune création/modification n'est exécutée dans le chat: tout se fait dans le dashboard.\n`
  );
}

function formatDashboardPreferencesIntentAddon(addon: any): string {
  const confidence = Number(addon?.confidence ?? 0);
  const confidenceText = Number.isFinite(confidence)
    ? ` (confidence=${confidence.toFixed(2)})`
    : "";
  const keys = Array.isArray(addon?.keys)
    ? addon.keys
      .filter((v: unknown) => typeof v === "string")
      .slice(0, 9)
    : [];
  const keysText = keys.length > 0 ? keys.join(", ") : "non précisé";
  const fromBilan = Boolean(addon?.from_bilan);

  return (
    `\n\n=== ADDON DASHBOARD PREFERENCES INTENT ===\n` +
    `- L'utilisateur veut modifier des préférences produit UX/UI${confidenceText}.\n` +
    `- Clés détectées: ${keysText}.\n` +
    `- Cet add-on sert de support de connaissance pour guider correctement l'utilisateur.\n` +
    `- Réponds brièvement puis redirige vers l'écran Préférences du dashboard.\n` +
    `- Les 9 catégories possibles à expliciter si utile: language, tone, response_length, emoji_level, voice_style, proactivity_level, timezone, daily_summary_time, coach_intensity.\n` +
    `- Donne des exemples de valeurs très rapides (ex: tone=direct, response_length=short, daily_summary_time=20:00).\n` +
    `- Interdiction de créer/appliquer un réglage depuis le chat: toute modification se fait dans le dashboard.\n` +
    (fromBilan
      ? `- Le bilan reste prioritaire: confirme la redirection puis reprends l'item du bilan.\n`
      : "") +
    `- N'annonce aucune modification comme déjà appliquée depuis le chat.\n`
  );
}

function formatDashboardCapabilitiesAddon(addon: any): string {
  const intents = Array.isArray(addon?.intents)
    ? addon.intents.filter((v: unknown) => typeof v === "string").slice(0, 8)
    : [];
  const fromBilan = Boolean(addon?.from_bilan);
  const intentsText = intents.length > 0 ? intents.join(", ") : "general_dashboard_intent";
  return (
    `\n\n=== ADDON DASHBOARD CAPABILITIES (CAN_BE_RELATED_TO_DASHBOARD) ===\n` +
    `- Signal synthétique détecté: la demande peut relever du dashboard (${intentsText}).\n` +
    `- Objectif: réponse CONSISTANTE et utile sur les possibilités produit, sans exécution dans le chat.\n` +
    `- Tu peux expliquer clairement les zones/fonctions suivantes si pertinent:\n` +
    `  1) Actions personnelles (feature centrale): créer, modifier, activer, désactiver, supprimer, tracker l'avancement, et SOS blocage.\n` +
    `  2) North Star (direction long terme): clarifier le cap, la raison, et l'alignement avec les actions hebdo.\n` +
    `  3) Rappels (feature de paramétrage Sophia): moments, style de message, canal, fréquence, pause/reprise.\n` +
    `  4) Préférences Sophia (personnalisation): ton, longueur, emojis, proactivité, timezone, horaires, intensité coaching.\n` +
    `\n` +
    `- Détail ACTIONS (ce qu'il faut préciser pour bien aider):\n` +
    `  - Création d'action: objectif concret, nom/titre clair, fréquence visée (daily/weekly), jours, heure ou fenêtre, difficulté réaliste, version minimale (2 min), déclencheur contexte.\n` +
    `  - Mise à jour d'action: change_type fréquent = frequency|days|time|title|mixed; vérifier ce que le user veut garder vs changer.\n` +
    `  - Activation/Désactivation/Suppression: confirmer la cible exacte (target_hint) pour éviter l'ambiguïté.\n` +
    `  - Suivi d'avancement: expliciter status (completed|missed|partial), valeur éventuelle, et date concernée.\n` +
    `  - SOS blocage: identifier blocker_hint (pourquoi ça coince), puis proposer une micro-étape faisable immédiatement.\n` +
    `\n` +
    `- Détail NORTH STAR:\n` +
    `  - Expliquer que la North Star sert de boussole: priorité long terme, critères d'alignement, arbitrage des actions.\n` +
    `  - Quand proposer: si dispersion, perte de sens, surcharge d'actions, ou besoin de prioriser.\n` +
    `  - Aide attendue: reformuler la North Star en phrase claire + relier 1-2 actions concrètes qui la servent cette semaine.\n` +
    `\n` +
    `- Détail RAPPELS (très important):\n` +
    `  - Les rappels sont une vraie feature de configuration de Sophia (pas juste "notifications").\n` +
    `  - Paramètres clés: mode (daily|weekly|custom), days, time, timezone, channel (app|whatsapp), start_date, end_date, pause, message.\n` +
    `  - Personnalisation possible: type de relance ("question", "nudge", "bonjour", "bonsoir", "check-in court"), ton (doux/direct), fréquence.\n` +
    `  - Exemples utiles à expliciter:\n` +
    `    * "Pose-moi une question chaque matin"\n` +
    `    * "Envoie-moi un bonsoir à 21h"\n` +
    `    * "Rappel WhatsApp les lundis/mercredis à 8h"\n` +
    `    * "Mets en pause cette semaine, puis reprise lundi prochain"\n` +
    `\n` +
    `- Détail PRÉFÉRENCES SOPHIA:\n` +
    `  - Catégories possibles: language, tone, response_length, emoji_level, voice_style, proactivity_level, timezone, daily_summary_time, coach_intensity.\n` +
    `  - Toujours donner des exemples courts de valeurs (ex: tone=direct, response_length=short, emoji_level=low, daily_summary_time=20:00).\n` +
    `\n` +
    `- Quand proposer "autres possibilités produit":\n` +
    `  - Si le user parle d'une action, tu peux suggérer en plus (si pertinent): SOS blocage, ajustement rappels, alignement North Star, préférence de ton/proactivité.\n` +
    `  - Le but est d'élargir utilement, sans noyer la réponse.\n` +
    `- Protocole de réponse:\n` +
    `  A) Réponds d'abord à la question exacte du user.\n` +
    `  B) Creuse avec 1 question diagnostique ciblée pour mieux aider (pourquoi, blocage concret, contrainte, résultat attendu).\n` +
    `  C) Donne les paramètres utiles (champs précis) si la demande touche une config/dashboard feature.\n` +
    `  D) Propose ensuite le bon chemin dashboard (section/fonction) en restant concret.\n` +
    `  E) Si pertinent, ajoute UNE suggestion produit complémentaire à forte valeur (pas plus d'une).\n` +
    `- Interdictions:\n` +
    `  - N'affirme jamais qu'une modification dashboard est déjà appliquée depuis le chat.\n` +
    `  - N'invente pas de features non supportées.\n` +
    (fromBilan
      ? `- Si un bilan est actif, garde le bilan prioritaire après l'orientation dashboard.\n`
      : "")
  );
}

function ymdInTz(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function isoWeekStartYmdInTz(d: Date, timeZone: string): string {
  const ymd = ymdInTz(d, timeZone);
  const [y, m, dd] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, dd ?? 1));
  const isoDayIndex = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - isoDayIndex);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const ddd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${ddd}`;
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function shouldInjectWeeklyRecapContext(args: {
  mode: AgentMode;
  state: any;
}): boolean {
  if (args.mode === "companion") return true;
  if (args.mode !== "investigator") return false;
  const inv = args.state?.investigation_state;
  return String(inv?.mode ?? "") === "weekly_bilan";
}

async function loadWeeklyRecapContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .maybeSingle();

    const tz = String((profile as any)?.timezone ?? "").trim() || "Europe/Paris";
    const weekStart = isoWeekStartYmdInTz(new Date(), tz);
    const previousWeekStart = addDaysYmd(weekStart, -7);

    const { data: recap, error } = await supabase
      .from("weekly_bilan_recaps")
      .select("execution,etoile_polaire,decisions_next_week,coach_note,week_start")
      .eq("user_id", userId)
      .eq("week_start", previousWeekStart)
      .maybeSingle();

    if (error || !recap) return null;

    const execution = (recap as any).execution ?? {};
    const etoile = (recap as any).etoile_polaire ?? {};
    const decisions = Array.isArray((recap as any).decisions_next_week)
      ? (recap as any).decisions_next_week.map((x: unknown) => String(x)).filter(Boolean).slice(0, 5)
      : [];
    const coachNote = String((recap as any).coach_note ?? "").trim();

    let block = "=== RECAP BILAN HEBDO PRECEDENT ===\n";
    block += `- Semaine: ${String((recap as any).week_start ?? previousWeekStart)}\n`;
    block += `- Exécution: ${Number(execution?.rate_pct ?? 0)}% (${Number(execution?.completed ?? 0)}/${Number(execution?.total ?? 0)})\n`;
    if (etoile && typeof etoile === "object" && Object.keys(etoile).length > 0) {
      block += `- Etoile Polaire: ${String(etoile?.title ?? "Etoile Polaire")} | actuel=${String(etoile?.current ?? "?")} | cible=${String(etoile?.target ?? "?")}\n`;
    }
    if (decisions.length > 0) {
      block += `- Décisions prises: ${decisions.join(" ; ")}\n`;
    }
    if (coachNote) {
      block += `- Note coach: ${coachNote.slice(0, 500)}\n`;
    }
    block += "- Utilise ce recap pour assurer la continuité, sans le réciter mot à mot.\n";
    return block;
  } catch {
    return null;
  }
}

function shouldInjectNorthStarContext(args: {
  mode: AgentMode;
  message: string;
  tempMemory?: any;
}): boolean {
  const isEligibleMode = args.mode === "companion" || args.mode === "investigator";
  if (!isEligibleMode) return false;

  const hasDashboardCapabilitiesSignal = Boolean(
    (args.tempMemory as any)?.__dashboard_capabilities_addon,
  );
  if (hasDashboardCapabilitiesSignal) return true;

  const msg = String(args.message ?? "").toLowerCase();
  return /north\s*star|etoile|étoile|cap|vision|priorit/.test(msg);
}

async function loadNorthStarContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("user_north_stars")
      .select("title, metric_type, unit, start_value, current_value, target_value, status, updated_at")
      .eq("user_id", userId)
      .in("status", ["active", "completed"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    const title = String((data as any).title ?? "North Star").trim();
    const metricType = String((data as any).metric_type ?? "number").trim();
    const unit = String((data as any).unit ?? "").trim();
    const status = String((data as any).status ?? "unknown").trim();
    const startValue = Number((data as any).start_value);
    const currentValue = Number((data as any).current_value);
    const targetValue = Number((data as any).target_value);

    let progress = "";
    if (
      Number.isFinite(startValue) &&
      Number.isFinite(currentValue) &&
      Number.isFinite(targetValue) &&
      targetValue !== startValue
    ) {
      const pct = Math.max(
        -100,
        Math.min(300, ((currentValue - startValue) / (targetValue - startValue)) * 100),
      );
      progress = `\n- Progression estimée: ${pct.toFixed(0)}%`;
    }

    return (
      `=== NORTH STAR ACTIVE ===\n` +
      `- Titre: ${title}\n` +
      `- Type métrique: ${metricType}\n` +
      `- Valeurs: départ=${String((data as any).start_value)} | actuel=${String((data as any).current_value)} | cible=${String((data as any).target_value)}${unit ? ` ${unit}` : ""}\n` +
      `- Statut: ${status}` +
      `${progress}\n` +
      `- Consigne: si tu proposes/modifies des actions, relie-les explicitement à cette North Star.\n`
    );
  } catch {
    // Backward compatibility: environments without the table should not break context loading.
    return null;
  }
}

function formatDashboardRecurringReminderIntentAddon(addon: any): string {
  const confidence = Number(addon?.confidence ?? 0);
  const confidenceText = Number.isFinite(confidence)
    ? ` (confidence=${confidence.toFixed(2)})`
    : "";
  const fields = Array.isArray(addon?.fields)
    ? addon.fields
      .filter((v: unknown) => typeof v === "string")
      .slice(0, 9)
    : [];
  const fieldsText = fields.length > 0 ? fields.join(", ") : "non précisé";
  const fromBilan = Boolean(addon?.from_bilan);

  return (
    `\n\n=== ADDON DASHBOARD RECURRING REMINDER INTENT ===\n` +
    `- L'utilisateur veut configurer des rappels récurrents${confidenceText}.\n` +
    `- Paramètres détectés: ${fieldsText}.\n` +
    `- Cet add-on sert de support de connaissance pour orienter la configuration correctement.\n` +
    `- Réponds clairement puis redirige vers les paramètres de rappels du dashboard.\n` +
    `- Si besoin, précise les paramètres configurables: mode (daily/weekly/custom), days, time, timezone, channel (app/whatsapp), start_date, end_date, pause, message.\n` +
    `- Demande seulement l'info manquante critique avant redirection si la demande est ambiguë.\n` +
    `- Interdiction de programmer/éditer un rappel depuis le chat: toute création/modification se fait dans le dashboard.\n` +
    (fromBilan
      ? `- Le bilan reste prioritaire: confirme la redirection puis reprends l'item du bilan.\n`
      : "") +
    `- N'annonce aucune programmation de rappel comme déjà faite dans le chat.\n`
  );
}

function formatSafetyActiveAddon(addon: any): string {
  const levelRaw = String(addon?.level ?? "firefighter").toLowerCase();
  const level = levelRaw === "sentry" ? "sentry" : "firefighter";
  const phase = String(addon?.phase ?? "active").trim().slice(0, 40) || "active";
  const consecutiveOk = Math.max(
    0,
    Math.min(5, Number(addon?.consecutive_ok ?? 0) || 0),
  );
  const threshold = Math.max(1, Number(addon?.threshold ?? 3) || 3);

  return (
    `\n\n=== ADDON SAFETY ACTIVE ===\n` +
    `- Niveau safety actif: ${level} (phase=${phase}).\n` +
    `- Stabilisation observée: ${consecutiveOk}/${threshold} message(s) ok consécutifs.\n` +
    `- Priorité: sécurité + apaisement, ton calme, validation émotionnelle, une seule micro-étape à la fois.\n` +
    `- Si le user va mieux, confirme le progrès sans minimiser son vécu.\n`
  );
}

/**
 * Format lightweight onboarding addon for the Companion agent.
 * State is stored in temp_memory.__onboarding_active and expires in router.
 */
function formatOnboardingAddon(onboardingState: any): string {
  const planTitle = String(onboardingState?.plan_title ?? "ton plan").trim() ||
    "ton plan";
  const turns = Math.max(
    0,
    Number(onboardingState?.user_turn_count ?? onboardingState?.turn_count ?? 0) ||
      0,
  );
  const remainingTurns = Math.max(0, 10 - turns);
  const startedAt = String(onboardingState?.started_at ?? "").trim();

  return (
    `\n\n=== ADDON ONBOARDING (LÉGER) ===\n` +
    `Plan: "${planTitle}"\n` +
    (startedAt ? `Started_at: ${startedAt}\n` : "") +
    `Tours onboarding: ${turns}/10 (restants: ${remainingTurns})\n` +
    `MISSION:\n` +
    `- L'utilisateur vient de finaliser son plan: c'est le premier contact onboarding.\n` +
    `- Sois fun, pro, posée, naturelle: parle comme une vraie coach humaine.\n` +
    `- Intéresse-toi à son plan, ses motivations, ses blocages habituels.\n` +
    `- Pas de script figé Q1/Q2/Q3, pas d'effet formulaire.\n` +
    `- Une seule question claire à la fois, conversation fluide.\n` +
    `- Si urgence safety, la sécurité reste prioritaire.\n`
  );
}

function formatCheckupNotTriggerableAddon(addon: any): string {
  const phrase = String(addon?.trigger_phrase ?? "").trim().slice(0, 80);
  const confidence = Number(addon?.confidence ?? 0);
  const confidenceText = Number.isFinite(confidence)
    ? ` (confidence=${confidence.toFixed(2)})`
    : "";

  return (
    `\n\n=== ADDON BILAN NON DÉCLENCHABLE ===\n` +
    `- L'utilisateur demande à faire le bilan maintenant${confidenceText}.\n` +
    `- Réponds naturellement: le bilan arrive automatiquement chaque soir vers 20h sur WhatsApp.\n` +
    `- Précise que le bilan n'est pas encore déclenchable sur commande.\n` +
    `- Ton chaleureux, 1-2 phrases, sans jargon.\n` +
    (phrase ? `- Formulation user repérée: "${phrase}".\n` : "")
  );
}

function formatBilanJustStoppedAddon(addon: any): string {
  const reason = String(addon?.reason ?? "").trim().slice(0, 40) || "stop";
  return (
    `\n\n=== ADDON BILAN STOPPÉ ===\n` +
    `- Le bilan vient d'être arrêté (raison=${reason}).\n` +
    `- Dis que c'est ok et que vous le ferez demain soir.\n` +
    `- 1 phrase max, bienveillante.\n` +
    `- Ne relance pas le bilan maintenant.\n`
  );
}

// Re-export types for convenience
export type {
  ContextProfile,
  LoadedContext,
  OnDemandTriggers,
} from "./types.ts";

async function loadActionIndicators(
  supabase: SupabaseClient,
  userId: string,
  planId: string,
): Promise<string> {
  try {
    const { data: activeActions, error: actionsErr } = await supabase
      .from("user_actions")
      .select("id,title")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .eq("status", "active")
      .limit(12);

    if (actionsErr || !activeActions || activeActions.length === 0) return "";

    const actionIds = activeActions.map((a: any) => String(a.id)).filter(
      Boolean,
    );
    if (actionIds.length === 0) return "";

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: entries, error: entriesErr } = await supabase
      .from("user_action_entries")
      .select("action_id,status,performed_at")
      .eq("user_id", userId)
      .gte("performed_at", since)
      .in("action_id", actionIds)
      .order("performed_at", { ascending: false })
      .limit(200);

    if (entriesErr || !entries || entries.length === 0) return "";

    const titleById = new Map<string, string>();
    for (const a of activeActions as any[]) {
      titleById.set(String(a.id), String(a.title ?? "Action"));
    }

    const missedByAction = new Map<string, number>();
    for (const e of entries as any[]) {
      const actionId = String(e.action_id ?? "");
      if (!actionId) continue;
      const st = String(e.status ?? "").toLowerCase();
      if (st === "missed" || st === "skipped" || st === "failed") {
        missedByAction.set(actionId, (missedByAction.get(actionId) ?? 0) + 1);
      }
    }

    const top = [...missedByAction.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);

    if (top.length === 0) return "";

    let block = "=== INDICATEURS COACHING (7 DERNIERS JOURS) ===\n";
    for (const [actionId, missedCount] of top) {
      const title = titleById.get(actionId) ?? "Action";
      block += `- ${title}: ${missedCount} raté(s) cette semaine.\n`;
    }
    block +=
      "- Utilise ces indicateurs en coaching, sans dramatiser, et propose des pistes concrètes.\n";
    return block;
  } catch (e) {
    console.warn(
      "[ContextLoader] failed to load action indicators (non-blocking):",
      e,
    );
    return "";
  }
}
