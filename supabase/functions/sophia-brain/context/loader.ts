/**
 * Context Loader - Chargement modulaire du contexte par agent
 *
 * Ce module centralise le chargement du contexte pour tous les agents,
 * en utilisant les profils définis dans types.ts pour charger uniquement
 * ce qui est nécessaire.
 */

declare const Deno: any;

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { AgentMode } from "../state-manager.ts";
import {
  getActionDetailsByHint,
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
import {
  retrieveEventMemories,
  formatEventMemoriesForPrompt,
} from "../event_memory.ts";
// R2: getActiveTopicSession removed (topic sessions disabled)
import type {
  ContextProfile,
  LoadedContext,
  OnDemandTriggers,
} from "./types.ts";
import {
  getContextProfile,
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

  // 2b. Rendez-vous configured in dashboard (inject only when explicitly relevant)
  if (shouldInjectRendezVousSummary(opts.mode, opts.message)) {
    promises.push(
      loadRendezVousSummary(opts.supabase, opts.userId).then((block) => {
        if (block) {
          context.rendezVousSummary = block;
          elementsLoaded.push("rendez_vous_summary");
        }
      }),
    );
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
            `- En priorité pour: ton du coach (coach.tone), niveau de challenge (coach.challenge_level), style de feedback (coach.feedback_style), propension à parler (coach.talk_propensity), longueur et format des messages (coach.message_length, coach.message_format), fréquence des questions (coach.question_tendency), focus principal (coach.primary_focus), personnalisation émotionnelle (coach.emotional_personalization).\n` +
            `- Des facts conversation.* historiques (ex: conversation.tone / conversation.verbosity / conversation.use_emojis) restent utilisables si présents.\n` +
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
  if (profile.event_memories && opts.message) {
    promises.push(
      retrieveEventMemories({
        supabase: opts.supabase,
        userId: opts.userId,
        message: opts.message,
        nowIso: opts.userTime?.prompt_block
          ? String(opts.userTime.prompt_block.match(/now_utc=([^\n]+)/)?.[1] ?? "")
          : undefined,
        maxResults: 2,
      }).then((events) => {
        const eventContext = formatEventMemoriesForPrompt(events);
        if (eventContext) {
          context.eventMemories = eventContext;
          elementsLoaded.push("event_memories");
        }
      }).catch((e) => {
        console.warn(
          "[ContextLoader] failed to load event_memories (non-blocking):",
          e,
        );
      }),
    );
  }

  // 4c. Topic memories (mémoire thématique vivante)
  if (profile.topic_memories && opts.message) {
    const topicMaxResultsRaw = (Deno.env.get("SOPHIA_TOPIC_RETRIEVE_MAX_RESULTS") ?? "").trim();
    const topicMaxResultsParsed = Number(topicMaxResultsRaw);
    const topicMaxResults = Number.isFinite(topicMaxResultsParsed) && topicMaxResultsParsed >= 1
      ? Math.floor(topicMaxResultsParsed)
      : 3;
    const topicDebug = (Deno.env.get("SOPHIA_TOPIC_DEBUG") ?? "").trim() === "1";
    promises.push(
      retrieveTopicMemories({
        supabase: opts.supabase,
        userId: opts.userId,
        message: opts.message,
        maxResults: topicMaxResults,
      }).then((topics) => {
        const topicContext = formatTopicMemoriesForPrompt(topics);
        if (topicContext) {
          context.topicMemories = topicContext;
          elementsLoaded.push("topic_memories");
        } else if (topicDebug) {
          console.log(
            JSON.stringify({
              tag: "context_topic_memories_empty",
              mode: opts.mode,
              user_id: opts.userId,
              message_preview: String(opts.message ?? "").slice(0, 120),
              topic_candidates: Array.isArray(topics) ? topics.length : 0,
              max_results: topicMaxResults,
            }),
          );
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
    let actionsDetailsLoaded = false;
    let actionsDetailsBlockedByAmbiguity = false;

    if (shouldLoadActionsDetails(profile, opts.triggers)) {
      const actionHint = String(opts.triggers?.action_discussion_hint ?? "").trim();
      if (actionHint) {
        const targeted = await getActionDetailsByHint(
          opts.supabase,
          opts.userId,
          planId,
          actionHint,
        );
        if (targeted.status === "matched") {
          context.actionsDetails = targeted.details;
          elementsLoaded.push("actions_details_targeted");
          actionsDetailsLoaded = true;
        } else if (targeted.status === "ambiguous") {
          context.actionsDetails =
            `=== ACTION CIBLE AMBIGUE ===\n` +
            `Le message semble viser plusieurs actions proches: ${targeted.candidates.join(", ")}.\n` +
            `Demande une précision courte avant d'agir (ex: \"Tu parles de laquelle ?\").\n`;
          elementsLoaded.push("actions_details_ambiguous");
          actionsDetailsBlockedByAmbiguity = true;
        }
      }

      // Keep broad fallback for non-targeted operational requests.
      if (!actionsDetailsLoaded && !actionsDetailsBlockedByAmbiguity && !actionHint) {
        const actionsDetails = await getActionsDetails(
          opts.supabase,
          opts.userId,
          planId,
        );
        if (actionsDetails) {
          context.actionsDetails = actionsDetails;
          elementsLoaded.push("actions_details");
          actionsDetailsLoaded = true;
        }
      }
    }

    // Keep summary as fallback when targeted details are unavailable.
    if (profile.actions_summary && !actionsDetailsLoaded) {
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

  // 8. Short-term context (fil rouge synthétisé)
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

  // 10. Injected context (from UI modules)
  if (opts.injectedContext) {
    context.injectedContext =
      `=== CONTEXTE MODULE (UI) ===\n${opts.injectedContext}\n\n`;
    elementsLoaded.push("injected_context");
  }

  // 11. Deferred user pref context
  if (opts.deferredUserPrefContext) {
    context.deferredUserPref = opts.deferredUserPrefContext;
    elementsLoaded.push("deferred_user_pref");
  }

  // 12. Track progress addon (parallel tracking)
  const trackProgressAddon = (opts.tempMemory as any)
    ?.__track_progress_parallel;
  if (
    trackProgressAddon &&
    opts.mode === "companion"
  ) {
    context.trackProgressAddon = formatTrackProgressAddon(trackProgressAddon);
    if (context.trackProgressAddon) elementsLoaded.push("track_progress_addon");
  }

  const dashboardRedirectAddon = (opts.tempMemory as any)
    ?.__dashboard_redirect_addon;
  const dashboardPreferencesIntentAddon = (opts.tempMemory as any)
    ?.__dashboard_preferences_intent_addon;
  const dashboardRecurringReminderIntentAddon = (opts.tempMemory as any)
    ?.__dashboard_recurring_reminder_intent_addon;
  const dashboardCapabilitiesAddon = (opts.tempMemory as any)
    ?.__dashboard_capabilities_addon;

  // 13. Dashboard redirect addon (CRUD intent detected by dispatcher)
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

  // 13b. Dashboard capabilities lite addon (only when no specific dashboard addon is active)
  const hasSpecificDashboardAddon = Boolean(
    dashboardRedirectAddon ||
      dashboardPreferencesIntentAddon ||
      dashboardRecurringReminderIntentAddon ||
      dashboardCapabilitiesAddon,
  );
  if (
    (opts.mode === "companion" || opts.mode === "investigator") &&
    !hasSpecificDashboardAddon
  ) {
    context.dashboardCapabilitiesLiteAddon = formatDashboardCapabilitiesLiteAddon();
    if (context.dashboardCapabilitiesLiteAddon) {
      elementsLoaded.push("dashboard_capabilities_lite_addon");
    }
  }

  // 14. Safety active addon (dynamic tone/protocol guidance)
  const safetyActiveAddon = (opts.tempMemory as any)?.__safety_active_addon;
  if (
    safetyActiveAddon &&
    (opts.mode === "companion" || opts.mode === "investigator")
  ) {
    context.safetyActiveAddon = formatSafetyActiveAddon(safetyActiveAddon);
    if (context.safetyActiveAddon) elementsLoaded.push("safety_active_addon");
  }

  // 14b. Dashboard preferences intent addon (dedicated UX/UI settings redirect)
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

  // 14c. Dashboard recurring reminder intent addon (dedicated reminder settings redirect)
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

  // 14d. Dashboard capabilities addon (umbrella "can be related to dashboard")
  const shouldIncludeDashboardCapabilitiesAddon = Boolean(
    dashboardCapabilitiesAddon &&
      !dashboardRedirectAddon &&
      !dashboardPreferencesIntentAddon &&
      !dashboardRecurringReminderIntentAddon,
  );
  if (
    shouldIncludeDashboardCapabilitiesAddon &&
    (opts.mode === "companion" || opts.mode === "investigator")
  ) {
    context.dashboardCapabilitiesAddon = formatDashboardCapabilitiesAddon(
      dashboardCapabilitiesAddon,
    );
    if (context.dashboardCapabilitiesAddon) {
      elementsLoaded.push("dashboard_capabilities_addon");
    }
  }

  // 15. Lightweight onboarding addon — applies when __onboarding_active is set.
  const onboardingState = (opts.tempMemory as any)?.__onboarding_active;
  if (onboardingState && opts.mode === "companion") {
    context.onboardingAddon = formatOnboardingAddon(onboardingState);
    if (context.onboardingAddon) elementsLoaded.push("onboarding_addon");
  }

  // 16. Checkup intent addon (manual trigger requested, but bilan is cron-driven).
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

  // 17. Bilan just stopped addon (one-shot guidance after explicit stop/bored).
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
  if (loaded.rendezVousSummary) ctx += loaded.rendezVousSummary + "\n\n";
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
  if (loaded.eventMemories) ctx += loaded.eventMemories;
  if (loaded.topicMemories) ctx += loaded.topicMemories;
  if (loaded.onboardingAddon) ctx += loaded.onboardingAddon;
  if (loaded.trackProgressAddon) ctx += loaded.trackProgressAddon;
  if (loaded.dashboardRedirectAddon) ctx += loaded.dashboardRedirectAddon;
  if (loaded.dashboardCapabilitiesLiteAddon) {
    ctx += loaded.dashboardCapabilitiesLiteAddon;
  }
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
    return `\n\n=== ADDON TRACK_PROGRESS (PARALLELE) ===\n- Le user a parlé de progression, mais le log auto n'a pas pu être confirmé.\n- Si possible, demande une précision courte (quelle action + fait/raté/partiel).\n- Si ça reste ambigu, propose 2 options: mise à jour directe dans le dashboard OU attendre le prochain bilan.\n- Indice interne: ${msg}\n`;
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
  const highMissedStreakMeta = addon?.high_missed_streak_breakdown;
  const highMissedStreakDaysRaw = Number(highMissedStreakMeta?.streak_days ?? 0);
  const highMissedStreakDays = Number.isFinite(highMissedStreakDaysRaw)
    ? Math.max(0, Math.floor(highMissedStreakDaysRaw))
    : 0;
  const highMissedActionTitle = String(highMissedStreakMeta?.action_title ?? "")
    .trim()
    .slice(0, 80);
  const hasHighMissedStreakBreakdown = isBreakdownIntent &&
    highMissedStreakDays >= 5;
  return (
    `\n\n=== ADDON DASHBOARD REDIRECT ===\n` +
    `- Intention détectée: ${intentText}.\n` +
    `- Cet add-on est un support de connaissance pour bien orienter l'utilisateur (pas un exécuteur).\n` +
    `- Réponds utilement et naturellement, puis redirige vers le tableau de bord.\n` +
    `- Anti-répétition: ne répète jamais la même redirection dashboard sur 2 tours consécutifs.\n` +
    `- Si la redirection vient d'être donnée, continue sur le contenu (paramètres, clarifications) sans renvoyer encore vers l'UI.\n` +
    `- Rappel dashboard possible plus tard si utile (ordre de grandeur: ~5 tours) ou si l'utilisateur redemande explicitement l'exécution UI.\n` +
    (isBreakdownIntent
      ? `- Mode SOS blocage: ne le propose QUE pour une action déjà existante (Plan de transformation OU Actions personnelles) qui échoue de manière répétée. Pas pour un blocage personnel général.\n`
      : "") +
    (isBreakdownIntent
      ? `- Exemples de questions utiles: "Qu'est-ce qui bloque exactement ?", "À quel moment ça coince le plus ?", "Quelle version ultra-simple (2 min) serait faisable ?"\n`
      : "") +
    (isBreakdownIntent
      ? `- Interdit: présenter SOS blocage comme un bouton "quand ça chauffe", "pulsion", "crack" ou urgence émotionnelle.\n`
      : "") +
    (hasHighMissedStreakBreakdown
      ? `- Contexte bilan: l'action ${highMissedActionTitle ? `"${highMissedActionTitle}"` : "en cours"} coince depuis ~${highMissedStreakDays} jours.\n`
      : "") +
    (hasHighMissedStreakBreakdown
      ? `- Formulation attendue: empathie courte ("je vois que c'est pas facile") + proposition claire d'utiliser SOS blocage dans le dashboard pour cette action.\n`
      : "") +
    (hasHighMissedStreakBreakdown
      ? `- Puis reprends le fil du bilan (ne transforme pas ce tour en tutoriel long).\n`
      : "") +
    (fromBilan
      ? `- Le bilan reste prioritaire: confirme la redirection dashboard puis reprends l'item du bilan.\n`
      : "") +
    `- Interdiction d'annoncer qu'une action a été créée/modifiée/activée/supprimée depuis le chat.\n` +
    `- Aucune création/modification n'est exécutée dans le chat: tout se fait dans le dashboard.\n`
  );
}

function formatDashboardCapabilitiesLiteAddon(): string {
  return (
    `\n\n=== ADDON TABLEAU DE BORD (LITE / ALWAYS-ON) ===\n` +
    `- Support de connaissance global: utilise ces infos seulement si c'est pertinent pour la question du user.\n` +
    `- Cartographie produit:\n` +
    `  - Tableau de bord Action:\n` +
    `    1) Plan de Transformation: pilotage des actions du plan (activer, mettre en pause, supprimer, modifier). SOS blocage possible sur action existante en échec répété.\n` +
    `    2) Actions Personnelles: habitudes hors plan principal (créer, modifier, activer, pause, supprimer, suivi d'avancement) + Étoile Polaire (valeurs numériques départ/actuel/cible).\n` +
    `    3) Rendez-vous: configure les rendez-vous où Sophia vient vers le user au bon moment avec le bon ton (ex: citation du matin, message de soutien planifié, relance douce avant un passage important). C'est une vraie personnalisation de l'accompagnement (créer, modifier, activer, pause, supprimer; paramètres message/jours/heure).\n` +
    `    4) Préférences: personnalisation fine du coach Sophia (ton global, niveau de challenge, bavardage, longueur de réponse, fréquence des questions).\n` +
    `  - Tableau de bord Architecte:\n` +
    `    1) Construction du Temple: fondations identitaires.\n` +
    `    2) Amélioration du Temple: phase avancée débloquée après la construction.\n` +
    `- Règles d'usage:\n` +
    `  - Réponds d'abord au besoin immédiat du user, sans réciter toute la liste.\n` +
    `  - Règle de choix: si Sophia doit envoyer un message planifié au bon moment, parle de Rendez-vous. Si le user doit faire une habitude ou une tâche récurrente lui-même, parle d'Actions Personnelles.\n` +
    `  - Si c'est pertinent ET confiance > 0.9, tu peux pousser UNE fonctionnalité du dashboard complémentaire.\n` +
    `- Interdiction: aucune création/modification réelle n'est exécutée dans le chat.\n`
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
      .slice(0, 5)
    : [];
  const keysText = keys.length > 0 ? keys.join(", ") : "non précisé";
  const fromBilan = Boolean(addon?.from_bilan);

  return (
    `\n\n=== ADDON DASHBOARD PREFERENCES INTENT ===\n` +
    `- L'utilisateur veut modifier des préférences produit UX/UI${confidenceText}.\n` +
    `- Clés détectées: ${keysText}.\n` +
    `- Cet add-on sert de support de connaissance pour guider correctement l'utilisateur.\n` +
    `- Réponds brièvement puis redirige vers l'écran Préférences du dashboard.\n` +
    `- Anti-répétition: évite la même redirection sur 2 tours d'affilée; entre-temps, traite les préférences demandées en conversation.\n` +
    `- Les 5 catégories possibles à expliciter si utile: coach.tone, coach.challenge_level, coach.talk_propensity, coach.message_length, coach.question_tendency.\n` +
    `- Donne des exemples de valeurs rapides (ex: coach.tone=warm_direct, coach.challenge_level=high, coach.talk_propensity=light, coach.message_length=short, coach.question_tendency=low).\n` +
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
    `- Signal synthétique détecté: la demande peut relever du tableau de bord (${intentsText}).\n` +
    `- Objectif: réponse CONSISTANTE, fidèle à l'UI réelle, sans exécution dans le chat.\n` +
    `\n` +
    `- CARTOGRAPHIE PRODUIT (SOURCE DE VÉRITÉ):\n` +
    `  A) Tableau de bord ACTION\n` +
    `    1) Plan de Transformation\n` +
    `    2) Actions Personnelles (inclut l'Étoile Polaire)\n` +
    `    3) Rendez-vous\n` +
    `    4) Préférences\n` +
    `  B) Tableau de bord ARCHITECTE\n` +
    `    1) Construction du Temple\n` +
    `    2) Amélioration du Temple (débloquée une fois la Construction du Temple terminée)\n` +
    `\n` +
    `- DÉTAILS TABLEAU DE BORD ACTION (intérêt + ce qui est possible):\n` +
    `  1) Plan de Transformation:\n` +
    `     - Intérêt: exécuter la transformation active, phase par phase.\n` +
    `     - Possibilités clés sur une action: modifier, supprimer, mettre en pause (désactiver), activer, marquer la progression, SOS blocage (découpage micro-étapes).\n` +
    `     - Important: SOS blocage n'est PAS un bouton de crise/pulsion. Il s'applique à une action existante en échec répété.\n` +
    `  2) Actions Personnelles:\n` +
    `     - Intérêt: gérer des habitudes perso en parallèle du plan principal.\n` +
    `     - Possibilités clés: créer, modifier, activer, mettre en pause, supprimer, suivre la progression, SOS blocage sur action existante en échec répété.\n` +
    `     - Étoile Polaire: définir/mettre à jour un indicateur chiffré (valeurs numériques: départ, actuel, cible) pour garder le cap.\n` +
    `  3) Rendez-vous:\n` +
    `     - Intérêt: autoriser Sophia à venir vers le user de façon proactive (rappels/messages planifiés).\n` +
    `     - Possibilités clés: créer, modifier, activer, mettre en pause (inactive), supprimer (soft-delete/inactive).\n` +
    `     - Paramètres typiques: message, pourquoi/rationale, heure locale (HH:MM), jours (lun→dim).\n` +
    `  4) Préférences:\n` +
    `     - Intérêt: personnaliser précisément le style du coach.\n` +
    `     - Reprendre EXACTEMENT les catégories/labels du dashboard:\n` +
    `       * Ton global: Doux | Bienveillant ferme | Très direct\n` +
    `       * Niveau de challenge: Léger | Équilibré | Élevé\n` +
    `       * Niveau de bavardage: Léger | Équilibré | Élevé\n` +
    `       * Longueur de réponse: Courte | Moyenne | Longue\n` +
    `       * Tendance à poser des questions: Faible | Normale | Élevée\n` +
    `\n` +
    `- DÉTAILS TABLEAU DE BORD ARCHITECTE (overview bref):\n` +
    `  - Logique fondatrice: cet espace repose sur l'idée que pour changer durablement, il faut travailler l'identité en parallèle des actions.\n` +
    `  1) Construction du Temple: parcours de fondations identitaires (les 12 semaines de base).\n` +
    `  2) Amélioration du Temple: phase avancée débloquée après la Construction du Temple, avec notamment la Table Ronde (alignement hebdo) et la Forge (évolution identitaire progressive).\n` +
    `\n` +
    `- STRATÉGIE DE LONGUEUR (anti-réponse trop longue):\n` +
    `  - Niveau 1 (par défaut): donner une vue d'ensemble courte et structurée (Action vs Architecte + sections du tableau de bord).\n` +
    `  - Niveau 2 (si demandé): détailler uniquement la/les section(s) ciblée(s) avec possibilités concrètes.\n` +
    `  - Ne pas réciter tout le catalogue si le user pose une question précise sur une seule section.\n` +
    `\n` +
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
    `\n\n=== ADDON DASHBOARD RENDEZ-VOUS INTENT ===\n` +
    `- L'utilisateur veut configurer des rendez-vous WhatsApp planifiés${confidenceText}.\n` +
    `- Paramètres détectés: ${fieldsText}.\n` +
    `- Cet add-on sert de support de connaissance pour orienter la configuration correctement.\n` +
    `- Réponds clairement puis redirige vers la section Rendez-vous du dashboard.\n` +
    `- Anti-répétition: n'enchaîne pas la même redirection dashboard sur des messages consécutifs.\n` +
    `- Si la redirection vient d'être faite, continue la discussion sur le rendez-vous (heure/jours/message) sans re-rediriger immédiatement.\n` +
    `- Si besoin, précise les paramètres configurables: mode (daily/weekly/custom), days, time, timezone, channel (app/whatsapp), start_date, end_date, pause, message.\n` +
    `- Règle de choix: si Sophia doit venir vers le user à un moment précis, c'est un Rendez-vous, pas une Action Personnelle.\n` +
    `- Demande seulement l'info manquante critique avant redirection si la demande est ambiguë.\n` +
    `- Interdiction de programmer/éditer un rendez-vous depuis le chat: toute création/modification se fait dans le dashboard.\n` +
    (fromBilan
      ? `- Le bilan reste prioritaire: confirme la redirection puis reprends l'item du bilan.\n`
      : "") +
    `- N'annonce aucune programmation de rendez-vous comme déjà faite dans le chat.\n`
  );
}

function shouldInjectRendezVousSummary(
  mode: AgentMode,
  message: string,
): boolean {
  if (mode !== "companion" && mode !== "investigator") return false;
  const normalized = String(message ?? "").trim();
  if (!normalized) return false;
  return /\brappels?\b|\brendez[\s-]?vous\b/i.test(normalized);
}

async function loadRendezVousSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("user_recurring_reminders")
      .select(
        "message_instruction, local_time_hhmm, scheduled_days, status, rationale, updated_at",
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(8);

    if (error || !data || data.length === 0) {
      return (
        "=== RENDEZ-VOUS CONFIGURÉS (SOURCE DE VÉRITÉ) ===\n" +
        "- Aucun rendez-vous configuré actuellement dans user_recurring_reminders.\n" +
        "- Si le user demande s'il en a déjà, réponds non.\n" +
        "- N'invente jamais un rendez-vous existant.\n"
      );
    }

    const active = data.filter((row: any) => String(row?.status ?? "") === "active");
    const inactive = data.filter((row: any) => String(row?.status ?? "") !== "active");
    let block = "=== RENDEZ-VOUS CONFIGURÉS (SOURCE DE VÉRITÉ) ===\n";
    block += `- Total: ${data.length} | actifs: ${active.length} | inactifs: ${inactive.length}\n`;
    block +=
      "- Cette section reflète UNIQUEMENT user_recurring_reminders (configuration générique), pas les occurrences scheduled_checkins.\n";
    block +=
      "- Si le user demande s'il a déjà des rendez-vous, base-toi UNIQUEMENT sur cette section.\n";

    if (active.length > 0) {
      block += "Actifs:\n";
      for (const row of active.slice(0, 5) as any[]) {
        const instruction = String(row?.message_instruction ?? "").trim().slice(0, 120) || "Message non précisé";
        const time = String(row?.local_time_hhmm ?? "").trim() || "?";
        const days = Array.isArray(row?.scheduled_days) && row.scheduled_days.length > 0
          ? row.scheduled_days.join(", ")
          : "jours non précisés";
        block += `- ${instruction} | ${days} | ${time}\n`;
      }
    }

    if (inactive.length > 0) {
      block += "Inactifs:\n";
      for (const row of inactive.slice(0, 3) as any[]) {
        const instruction = String(row?.message_instruction ?? "").trim().slice(0, 100) || "Message non précisé";
        const time = String(row?.local_time_hhmm ?? "").trim() || "?";
        block += `- ${instruction} | ${time} [inactif]\n`;
      }
    }

    block += "- N'invente jamais d'autre rendez-vous que ceux listés ici.\n";
    return block;
  } catch {
    return "";
  }
}

function formatSafetyActiveAddon(addon: any): string {
  const level = "sentry";
  const phase = String(addon?.phase ?? "active").trim().slice(0, 40) || "active";

  return (
    `\n\n=== ADDON SAFETY ACTIVE ===\n` +
    `- Niveau safety actif: ${level} (phase=${phase}).\n` +
    `- Priorité: sécurité + apaisement, ton calme, validation émotionnelle, une seule micro-étape à la fois.\n` +
    `- Tant que le niveau safety est actif, ne sors pas du protocole safety.\n`
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
