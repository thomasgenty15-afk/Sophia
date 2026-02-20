import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { generateWithGemini } from "../../../_shared/gemini.ts";
import { getUserTimeContext } from "../../../_shared/user_time_context.ts";
import {
  formatTopicMemoriesForPrompt,
  retrieveTopicMemories,
} from "../../topic_memory.ts";
import type { InvestigationState, InvestigatorTurnResult } from "./types.ts";
import { isExplicitStopBilan, resolveBinaryConsent } from "./utils.ts";
import { investigatorSay } from "./copy.ts";
import {
  getItemHistory,
  getPendingItems,
  getYesterdayCheckupSummary,
  increaseWeekTarget,
} from "./db.ts";
// NOTE: Investigator keeps a single deterministic offer flow: weekly target increase.
import {
  buildItemProgressAddon,
  buildMainItemSystemPrompt,
  buildTargetExceededAddon,
  buildVitalProgressionAddon,
} from "./prompt.ts";
import { INVESTIGATOR_TOOLS } from "./tools.ts";
import { handleInvestigatorModelOutput } from "./turn.ts";
import { getMissedStreakDaysForCheckupItem } from "./streaks.ts";
import {
  getItemProgress,
  initializeItemProgress,
  updateItemProgress,
} from "./item_progress.ts";

// Re-export for backward compatibility
export { getItemProgress, updateItemProgress } from "./item_progress.ts";

function parseIsoMs(raw: unknown): number | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function resolveOpeningContext(
  tempMemory: Record<string, unknown> | undefined,
  history: any[],
): {
  mode: "cold_relaunch" | "ongoing_conversation";
  hours_since_last_message: number | null;
  last_message_at: string | null;
} {
  const tmContext = (tempMemory as any)?.opening_context;
  const tmMode = String(tmContext?.mode ?? "").trim();
  if (tmMode === "cold_relaunch" || tmMode === "ongoing_conversation") {
    return {
      mode: tmMode,
      hours_since_last_message:
        Number.isFinite(Number(tmContext?.hours_since_last_message))
          ? Number(tmContext.hours_since_last_message)
          : null,
      last_message_at: typeof tmContext?.last_message_at === "string"
        ? tmContext.last_message_at
        : null,
    };
  }

  let latestMs: number | null = null;
  for (const msg of (Array.isArray(history) ? history : [])) {
    const ts = parseIsoMs((msg as any)?.created_at);
    if (ts === null) continue;
    latestMs = latestMs === null ? ts : Math.max(latestMs, ts);
  }
  if (latestMs === null) {
    return {
      mode: "cold_relaunch",
      hours_since_last_message: null,
      last_message_at: null,
    };
  }
  const hours = Number(
    (Math.max(0, Date.now() - latestMs) / (60 * 60 * 1000)).toFixed(2),
  );
  return {
    mode: hours >= 4 ? "cold_relaunch" : "ongoing_conversation",
    hours_since_last_message: hours,
    last_message_at: new Date(latestMs).toISOString(),
  };
}

export async function runInvestigator(
  supabase: SupabaseClient,
  userId: string,
  message: string,
  history: any[],
  state: any,
  meta?: {
    requestId?: string;
    forceRealAi?: boolean;
    channel?: "web" | "whatsapp";
    model?: string;
  },
): Promise<InvestigatorTurnResult> {
  const timeCtx = await getUserTimeContext({ supabase, userId }).catch(() =>
    null as any
  );

  // 1. INIT STATE
  let currentState: InvestigationState = state || {
    status: "init",
    pending_items: [],
    current_item_index: 0,
    temp_memory: {},
  };

  // If the user explicitly wants to stop the bilan, comply immediately (no persuasion).
  if (currentState?.status === "checking" && isExplicitStopBilan(message)) {
    return {
      content: await investigatorSay(
        "user_stopped_checkup",
        {
          user_message: message,
          channel: meta?.channel,
          recent_history: history.slice(-15),
        },
        meta,
      ),
      investigationComplete: true,
      newState: null,
    };
  }

  // NOTE: Bilan auto-expiry (4h timeout) is handled silently at the router level
  // (processMessage in run.ts). The investigation_state is cleaned up before we even
  // reach this function, so no "expired" message is ever sent to the user.

  // Start: load items
  if (currentState.status === "init") {
    const items = await getPendingItems(supabase, userId);
    if (items.length === 0) {
      return {
        content: await investigatorSay("no_pending_items", {
          user_message: message,
          channel: meta?.channel,
        }, meta),
        investigationComplete: true,
        newState: null,
      };
    }

    // Day scope from user's LOCAL hour (timezone-aware).
    // Note: Each item now has its own day_scope based on time_of_day, but we keep a global fallback.
    const localHour = Number(timeCtx?.user_local_hour);
    const initialDayScope = Number.isFinite(localHour) && localHour >= 16
      ? "today"
      : "yesterday";

    // Precompute missed streaks for all action/framework items (cache for the bilan)
    const actionItems = items.filter((i) =>
      i.type === "action" || i.type === "framework"
    );
    const missedStreaksByAction: Record<string, number> = {};
    if (actionItems.length > 0) {
      try {
        const streakPairs = await Promise.all(
          actionItems.map(async (item) => {
            const streak = await getMissedStreakDaysForCheckupItem(
              supabase,
              userId,
              item,
            ).catch(() => 0);
            return [String(item.id), Number.isFinite(streak) ? streak : 0] as [
              string,
              number,
            ];
          }),
        );
        for (const [actionId, streak] of streakPairs) {
          missedStreaksByAction[actionId] = streak;
        }
      } catch (e) {
        console.error("[Investigator] missed streak cache build failed:", e);
      }
    }

    const vitalProgression: Record<
      string,
      { previous_value?: string; target_value?: string }
    > = {};
    for (const item of items) {
      if (item.type !== "vital") continue;
      if (!item.previous_vital_value && !item.target_vital_value) continue;
      vitalProgression[item.id] = {
        ...(item.previous_vital_value
          ? { previous_value: item.previous_vital_value }
          : {}),
        ...(item.target_vital_value
          ? { target_value: item.target_vital_value }
          : {}),
      };
    }

    currentState = {
      status: "checking",
      pending_items: items,
      current_item_index: 0,
      started_at: new Date().toISOString(),
      // locked_pending_items avoids pulling extra items mid-checkup (more stable UX).
      temp_memory: {
        opening_done: false,
        locked_pending_items: true,
        day_scope: initialDayScope,
        missed_streaks_by_action: missedStreaksByAction,
        vital_progression: vitalProgression,
        item_progress: initializeItemProgress(items),
      },
    };
  }

  // Soft, personalized opening (before the very first question)
  if (
    currentState?.status === "checking" &&
    currentState.current_item_index === 0 &&
    currentState?.temp_memory?.opening_done !== true
  ) {
    const currentItem0 = currentState.pending_items[0];
    const openingContext = resolveOpeningContext(
      (currentState?.temp_memory ?? {}) as Record<string, unknown>,
      history,
    );

    // Update item progress: first item is now awaiting_answer
    let nextState = updateItemProgress(currentState, currentItem0.id, {
      phase: "awaiting_answer",
      last_question_kind: currentItem0.type === "vital"
        ? "vital_value"
        : "did_it",
    });
    nextState = {
      ...nextState,
      temp_memory: { ...(nextState.temp_memory || {}), opening_done: true },
    };

    function normalizeLite(s: string): string {
      return String(s ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function spokenLabelForItem(item: any): string {
      const rawTitle = String(item?.title ?? "").trim();
      const rawDesc = String(item?.description ?? "").trim();
      const title = rawTitle || rawDesc || "";
      if (!title) return "ce point";
      const t = normalizeLite(title);

      // Vitals: prefer natural spoken labels
      if (item?.type === "vital") {
        if (/ecran|screen|scroll|tiktok|instagram|youtube/i.test(t)) {
          return "les écrans";
        }
        if (/sommeil|dormi|nuit|coucher|reveil|réveil/i.test(t)) {
          return "ta nuit";
        }
        if (/endormissement|tete\s+sur\s+l.?oreiller|oreiller/i.test(t)) {
          return "t'endormir";
        }
        if (/energie|humeur|moral|forme|batterie/i.test(t)) {
          return "ton énergie";
        }
        if (/stress|anxieux|anxi[eé]t[eé]/i.test(t)) return "ton stress";
      }

      // Actions/frameworks: keep it short, but avoid "pour ça"
      // Use the first 6-ish words, strip extra spaces.
      const words = title.split(/\s+/).filter(Boolean);
      const short = words.slice(0, 6).join(" ").trim();
      return short || "ce point";
    }

    const fallbackFirstQuestion = (() => {
      // Use the item's own day_scope (based on time_of_day), fallback to global
      const dayScope = String(
        currentItem0.day_scope ?? currentState?.temp_memory?.day_scope ??
          "yesterday",
      );
      const dayRef = dayScope === "today" ? "aujourd'hui" : "hier";
      const label = spokenLabelForItem(currentItem0);
      const titleNorm = normalizeLite(label);

      if (currentItem0.type === "vital") {
        const unit = String((currentItem0 as any)?.unit ?? "").trim();
        const unitSuffix = unit ? ` (en ${unit})` : "";
        // Sommeil / endormissement
        if (
          /tete\s+sur\s+l.?oreiller|endormissement|temps\s+(entre|pour)/i.test(
            titleNorm,
          )
        ) {
          return `En ce moment, il te faut combien de temps pour t'endormir à peu près ?`;
        }
        // Écran / screen time
        if (/ecran|screen/i.test(titleNorm)) {
          return `Côté écrans ${dayRef}, tu dirais combien de temps à peu près ?${unitSuffix}`;
        }
        // Sommeil heures
        if (/sommeil|dormi|nuit/i.test(titleNorm)) {
          return `T'as dormi combien ${dayRef} ?`;
        }
        // Énergie / humeur
        if (/energie|humeur|moral|forme/i.test(titleNorm)) {
          return `Comment tu te sens niveau énergie ${dayRef} ?`;
        }
        // Default vital - always mention the label (never "pour ça")
        // Keep it spoken: "Et {label} {dayRef}, tu dirais combien ?"
        const prefix = dayRef === "hier" ? "Et" : "Et";
        return `${prefix} ${label} ${dayRef}, tu dirais combien ?${unitSuffix}`;
      }
      if (currentItem0.type === "action") {
        return `${label} — c'est fait ${dayRef} ?`;
      }
      if (currentItem0.type === "framework") {
        return `${label} — tu l'as fait ${dayRef} ?`;
      }
      return `On commence par ça ?`;
    })();

    try {
      const summary = await getYesterdayCheckupSummary(supabase, userId);
      const openingText = await investigatorSay(
        "opening_first_item",
        {
          user_message: message,
          channel: meta?.channel,
          summary_yesterday: summary,
          first_item: currentItem0,
          recent_history: history.slice(-15),
          opening_context: openingContext,
          // Use the item's own day_scope (based on time_of_day)
          day_scope: String(
            currentItem0.day_scope ?? currentState?.temp_memory?.day_scope ??
              "yesterday",
          ),
        },
        meta,
      );

      // IMPORTANT: keep the AI's opening whenever the call succeeds.
      // Deterministic fallback is reserved for network/LLM failures (catch block).
      return {
        content: openingText,
        investigationComplete: false,
        newState: nextState,
      };
    } catch (e) {
      console.error("[Investigator] opening summary failed:", e);
      const intros = openingContext.mode === "ongoing_conversation"
        ? [
          "Si ca te va, on cale le bilan maintenant, comme ca c'est fait.",
          "Je te prends 2 min pour le bilan, et ensuite on continue.",
          "On glisse le bilan maintenant, tranquillement.",
        ]
        : [
          "Hey, c'est l'heure de ton bilan.",
          "Petit check-in du jour.",
          "On se fait le bilan du jour.",
        ];
      const intro = intros[Math.floor(Math.random() * intros.length)];
      const safe = `${intro}\n\n${fallbackFirstQuestion}`;
      return {
        content: safe,
        investigationComplete: false,
        newState: nextState,
      };
    }
  }

  // 2. CHECK IF FINISHED
  if (currentState.current_item_index >= currentState.pending_items.length) {
    if (currentState?.temp_memory?.locked_pending_items === true) {
      return {
        content: await investigatorSay(
          "end_checkup_no_more_items",
          {
            user_message: message,
            channel: meta?.channel,
            recent_history: history.slice(-15),
          },
          meta,
        ),
        investigationComplete: true,
        newState: null,
      };
    }

    // Otherwise (legacy behavior): scan for new pending items.
    console.log(
      "[Investigator] End of list reached. Scanning for new pending items...",
    );
    const freshItems = await getPendingItems(supabase, userId);
    if (freshItems.length > 0) {
      console.log(
        `[Investigator] Found ${freshItems.length} new items. Extending session.`,
      );
      currentState.pending_items = [
        ...currentState.pending_items,
        ...freshItems,
      ];
    } else {
      return {
        content: await investigatorSay(
          "end_checkup_no_more_items",
          {
            user_message: message,
            channel: meta?.channel,
            recent_history: history.slice(-15),
          },
          meta,
        ),
        investigationComplete: true,
        newState: null,
      };
    }
  }

  // 3. CURRENT ITEM
  let currentItem = currentState.pending_items[currentState.current_item_index];
  if (currentItem?.type === "vital") {
    const vitalProgression =
      (currentState?.temp_memory as any)?.vital_progression
        ?.[String(currentItem.id)] ?? null;
    if (vitalProgression) {
      currentItem = {
        ...currentItem,
        previous_vital_value: currentItem.previous_vital_value ??
          vitalProgression.previous_value,
        target_vital_value: currentItem.target_vital_value ??
          vitalProgression.target_value,
      };
    }
  }

  // Handle pending weekly-target increase flow before normal item handling.
  const pendingIncreaseOffer = (currentState as any)?.temp_memory
    ?.pending_increase_target_offer;

  // ── AWAITING DAY CHOICE: user said yes to increase + action has scheduled_days → parse the day ──
  if (pendingIncreaseOffer?.stage === "awaiting_day_choice") {
    const dayMap: Record<string, string> = {
      "lun": "mon", "lundi": "mon",
      "mar": "tue", "mardi": "tue",
      "mer": "wed", "mercredi": "wed",
      "jeu": "thu", "jeudi": "thu",
      "ven": "fri", "vendredi": "fri",
      "sam": "sat", "samedi": "sat",
      "dim": "sun", "dimanche": "sun",
    };
    const msgLower = String(message ?? "").toLowerCase();
    let parsedDay: string | null = null;
    // Try full names first (longer match wins), then abbreviations
    for (const [fr, en] of Object.entries(dayMap)) {
      const isFullName = fr.length > 3;
      const pat = isFullName ? `\\b${fr}s?\\b` : `\\b${fr}\\b`;
      if (new RegExp(pat, "i").test(msgLower)) {
        parsedDay = en;
        if (isFullName) break; // Full name match is definitive
      }
    }

    const offerItemId = String(
      pendingIncreaseOffer?.action_id ?? currentItem?.id ?? "",
    );
    const offerLoggedStatus = String(
      pendingIncreaseOffer?.last_item_log?.status ?? "missed",
    );

    if (parsedDay) {
      // Call increaseWeekTarget with the parsed day
      let increaseResult: {
        success: boolean;
        old_target: number;
        new_target: number;
        scheduled_days?: string[];
        error?: string;
      } | null = null;
      try {
        increaseResult = await increaseWeekTarget(supabase, userId, offerItemId, parsedDay);
      } catch (e) {
        console.error("[Investigator] increaseWeekTarget (with day) call failed:", e);
      }

      let nextState = updateItemProgress(currentState, offerItemId, {
        phase: "logged",
        logged_at: new Date().toISOString(),
        logged_status: offerLoggedStatus,
      });
      const nextIndex = currentState.current_item_index + 1;
      const nextTempMemory: Record<string, unknown> = { ...(nextState.temp_memory || {}) };
      delete nextTempMemory.pending_increase_target_offer;
      nextState = { ...nextState, current_item_index: nextIndex, temp_memory: nextTempMemory as any };

      // Build confirmation or error prefix
      const dayTokenToFrench = (d: string) => {
        const m: Record<string, string> = { mon: "lundi", tue: "mardi", wed: "mercredi", thu: "jeudi", fri: "vendredi", sat: "samedi", sun: "dimanche" };
        return m[d] ?? d;
      };
      let prefix: string;
      if (increaseResult?.success) {
        prefix = `C'est fait, objectif passé à ${increaseResult.new_target}×/semaine avec ${dayTokenToFrench(parsedDay)} en plus. `;
      } else {
        prefix = `${increaseResult?.error ?? "Pas pu augmenter."} `;
      }

      const scenario = increaseResult?.success ? "increase_target_confirmed" : null;
      const scenarioAck = scenario
        ? await investigatorSay(scenario, {
              user_message: message,
              channel: meta?.channel,
              action_title: String(
                pendingIncreaseOffer?.action_title ?? currentItem?.title ?? "",
              ),
              current_target: Number(
                pendingIncreaseOffer?.current_target ?? currentItem?.target ?? 1,
              ),
              increase_result: increaseResult,
              day_added: dayTokenToFrench(parsedDay),
            }, meta)
        : null;
      const lead = scenarioAck ? `${scenarioAck}\n\n` : prefix;

      if (nextIndex >= currentState.pending_items.length) {
        const base = await investigatorSay("end_checkup_after_last_log", {
          user_message: message,
            channel: meta?.channel,
            recent_history: history.slice(-15),
            last_item: currentItem,
            last_item_log: pendingIncreaseOffer.last_item_log ?? null,
            day_scope: String(currentItem.day_scope ?? nextState?.temp_memory?.day_scope ?? "yesterday"),
            increase_result: increaseResult,
          }, meta);
        return { content: `${lead}${base}`.trim(), investigationComplete: true, newState: null };
      }

      const nextItem = currentState.pending_items[nextIndex];
      nextState = updateItemProgress(nextState, nextItem.id, {
        phase: "awaiting_answer",
        last_question_kind: nextItem.type === "vital" ? "vital_value" : "did_it",
      });
      const transitionOut = await investigatorSay("transition_to_next_item", {
          user_message: message,
          last_item_log: pendingIncreaseOffer.last_item_log ?? null,
          next_item: nextItem,
          day_scope: String(nextItem.day_scope ?? nextState?.temp_memory?.day_scope ?? "yesterday"),
        }, meta);
      return { content: `${lead}${transitionOut}`.trim(), investigationComplete: false, newState: nextState };
    }

    // Could not parse a day — ask again
    return {
      content: await investigatorSay("increase_target_ask_day", {
        user_message: message,
        channel: meta?.channel,
        action_title: String(
          pendingIncreaseOffer?.action_title ?? currentItem?.title ?? "",
        ),
        current_scheduled_days: pendingIncreaseOffer?.current_scheduled_days ??
          [],
        retry: true,
      }, meta),
      investigationComplete: false,
      newState: currentState,
    };
  }

  if (pendingIncreaseOffer?.stage === "awaiting_consent") {
    const consent = resolveBinaryConsent(message);
    const userSaysYes = consent === "yes";
    const userSaysNo = consent === "no";
    if (userSaysYes || userSaysNo) {
      const offerItemId = String(
        pendingIncreaseOffer?.action_id ?? currentItem?.id ?? "",
      );
      const offerLoggedStatus = String(
        pendingIncreaseOffer?.last_item_log?.status ?? "missed",
      );

      let increaseResult: {
        success: boolean;
        old_target: number;
        new_target: number;
        scheduled_days?: string[];
        error?: string;
      } | null = null;
      if (userSaysYes) {
        if (pendingIncreaseOffer.has_scheduled_days) {
          const askDayState: InvestigationState = {
            ...currentState,
            temp_memory: {
              ...(currentState.temp_memory || {}),
              pending_increase_target_offer: {
                ...pendingIncreaseOffer,
                stage: "awaiting_day_choice",
              },
            },
          };
          return {
            content: await investigatorSay("increase_target_ask_day", {
              user_message: message,
              channel: meta?.channel,
              action_title: String(
                pendingIncreaseOffer?.action_title ?? currentItem?.title ?? "",
              ),
              current_scheduled_days:
                pendingIncreaseOffer?.current_scheduled_days ?? [],
            }, meta),
            investigationComplete: false,
            newState: askDayState,
          };
        }
        try {
          increaseResult = await increaseWeekTarget(
            supabase,
            userId,
            offerItemId,
          );
        } catch (e) {
          console.error("[Investigator] increaseWeekTarget call failed:", e);
        }
      }

      // Ensure the offer item is marked as logged before moving on.
      let nextState = updateItemProgress(currentState, offerItemId, {
        phase: "logged",
        logged_at: new Date().toISOString(),
        logged_status: offerLoggedStatus,
      });
      const nextIndex = currentState.current_item_index + 1;
      const nextTempMemory: Record<string, unknown> = {
        ...(nextState.temp_memory || {}),
      };
      delete nextTempMemory.pending_increase_target_offer;
      nextState = {
        ...nextState,
        current_item_index: nextIndex,
        temp_memory: nextTempMemory as any,
      };

      // Special case: increase_target declined with more items to process.
      // Use a dedicated transition copy to avoid redundant/confusing double acknowledgements.
      if (
        userSaysNo &&
        nextIndex < currentState.pending_items.length
      ) {
        const nextItem = currentState.pending_items[nextIndex];
        nextState = updateItemProgress(nextState, nextItem.id, {
          phase: "awaiting_answer",
          last_question_kind: nextItem.type === "vital"
            ? "vital_value"
            : "did_it",
        });
        const declinedTransition = await investigatorSay(
          "increase_target_declined_transition",
          {
            user_message: message,
            channel: meta?.channel,
            action_title: String(
              pendingIncreaseOffer?.action_title ?? currentItem?.title ?? "",
            ),
            current_target: Number(
              pendingIncreaseOffer?.current_target ?? currentItem?.target ?? 1,
            ),
            next_item: nextItem,
            day_scope: String(
              nextItem.day_scope ?? nextState?.temp_memory?.day_scope ??
                "yesterday",
            ),
          },
          meta,
        );
        return {
          content: declinedTransition,
          investigationComplete: false,
          newState: nextState,
        };
      }

      let prefix: string;
      if (userSaysYes && increaseResult?.success) {
        prefix = `C'est fait, objectif passé à ${increaseResult.new_target}×/semaine. `;
      } else if (userSaysYes && !increaseResult?.success) {
        prefix = `${increaseResult?.error ?? "Pas pu augmenter."} `;
      } else {
        prefix = "Ok, on garde l'objectif actuel. ";
      }

      const scenario = userSaysYes && increaseResult?.success
        ? "increase_target_confirmed"
        : userSaysNo
        ? "increase_target_declined"
        : null;
      const scenarioAck = scenario
        ? await investigatorSay(
          scenario,
          {
            user_message: message,
            channel: meta?.channel,
            action_title: String(
              pendingIncreaseOffer?.action_title ?? currentItem?.title ?? "",
            ),
            current_target: Number(
              pendingIncreaseOffer?.current_target ?? currentItem?.target ?? 1,
            ),
            ...(increaseResult ? { increase_result: increaseResult } : {}),
          },
          meta,
        )
        : null;
      const lead = scenarioAck ? `${scenarioAck}\n\n` : prefix;

      if (nextIndex >= currentState.pending_items.length) {
        const base = await investigatorSay(
          "end_checkup_after_last_log",
          {
            user_message: message,
            channel: meta?.channel,
            recent_history: history.slice(-15),
            last_item: currentItem,
            last_item_log: pendingIncreaseOffer.last_item_log ?? null,
            day_scope: String(
              currentItem.day_scope ?? nextState?.temp_memory?.day_scope ??
                "yesterday",
            ),
            ...(increaseResult ? { increase_result: increaseResult } : {}),
          },
          meta,
        );
        return {
          content: `${lead}${base}`.trim(),
          investigationComplete: true,
          newState: null,
        };
      }

      const nextItem = currentState.pending_items[nextIndex];
      // Mark next item as awaiting_answer since we're asking about it now.
      nextState = updateItemProgress(nextState, nextItem.id, {
        phase: "awaiting_answer",
        last_question_kind: nextItem.type === "vital"
          ? "vital_value"
          : "did_it",
      });
      const transitionOut = await investigatorSay(
        "transition_to_next_item",
        {
          user_message: message,
          last_item_log: pendingIncreaseOffer.last_item_log ?? null,
          next_item: nextItem,
          day_scope: String(
            nextItem.day_scope ?? nextState?.temp_memory?.day_scope ??
              "yesterday",
          ),
        },
        meta,
      );
      return {
        content: `${lead}${transitionOut}`.trim(),
        investigationComplete: false,
        newState: nextState,
      };
    }

    // User response unclear: clarify once, then continue bilan
    return {
      content: await investigatorSay(
        "increase_target_clarify",
        {
          user_message: message,
          action_title: String(
            pendingIncreaseOffer?.action_title ?? currentItem?.title ?? "",
          ),
          current_target: Number(
            pendingIncreaseOffer?.current_target ?? currentItem?.target ?? 1,
          ),
        },
        meta,
      ),
      investigationComplete: false,
      newState: currentState,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CASE 2: Habit that already exceeded weekly target → congratulate + propose increase
  // ═══════════════════════════════════════════════════════════════════════════════
  if (
    currentItem.type === "action" &&
    currentItem.action_source !== "personal" &&
    currentItem.is_habit &&
    (currentItem.weekly_target_status === "exceeded" ||
      currentItem.weekly_target_status === "at_target")
  ) {
    const currentTarget = Number(currentItem.target ?? 1);
    const currentReps = Number(currentItem.current ?? 0);

    // Generate congratulation + increase target offer
    const congratsMsg = await investigatorSay(
      "target_exceeded_congrats",
      {
        user_message: message,
        channel: meta?.channel,
        action_title: currentItem.title,
        current_reps: currentReps,
        current_target: currentTarget,
        can_increase: currentTarget < 7,
      },
      meta,
    );

    if (currentTarget < 7) {
      // Store pending offer for increase_target
      const hasScheduledDays = Array.isArray(currentItem.scheduled_days) && currentItem.scheduled_days.length > 0;
      const nextState: InvestigationState = {
        ...currentState,
        temp_memory: {
          ...(currentState.temp_memory || {}),
          pending_increase_target_offer: {
            stage: "awaiting_consent",
            action_id: currentItem.id,
            action_title: currentItem.title,
            current_target: currentTarget,
            last_item_log: { status: "completed", item_type: "action" },
            has_scheduled_days: hasScheduledDays,
            current_scheduled_days: hasScheduledDays ? currentItem.scheduled_days : [],
          },
        },
      };
      return {
        content: congratsMsg,
        investigationComplete: false,
        newState: nextState,
      };
    }

    // Already at max (7×/semaine): congratulate and continue/close normally.
    let nextState = updateItemProgress(currentState, currentItem.id, {
      phase: "logged",
      logged_at: new Date().toISOString(),
      logged_status: "completed",
    });
    const nextIndex = currentState.current_item_index + 1;
    nextState = { ...nextState, current_item_index: nextIndex };

    if (nextIndex >= currentState.pending_items.length) {
      const endMsg = await investigatorSay(
        "end_checkup_after_last_log",
        {
          user_message: message,
          channel: meta?.channel,
          recent_history: history.slice(-15),
          last_item: currentItem,
          last_item_log: { status: "completed", item_type: "action" },
          day_scope: String(
            currentItem.day_scope ?? nextState?.temp_memory?.day_scope ??
              "yesterday",
          ),
        },
        meta,
      );
      return {
        content: `${congratsMsg}\n\n${endMsg}`.trim(),
        investigationComplete: true,
        newState: null,
      };
    }

    const nextItem = currentState.pending_items[nextIndex];
    nextState = updateItemProgress(nextState, nextItem.id, {
      phase: "awaiting_answer",
      last_question_kind: nextItem.type === "vital" ? "vital_value" : "did_it",
    });

    const transitionOut = await investigatorSay(
      "transition_to_next_item",
      {
        user_message: message,
        last_item_log: { status: "completed" },
        next_item: nextItem,
        day_scope: String(
          nextItem.day_scope ?? nextState?.temp_memory?.day_scope ??
            "yesterday",
        ),
      },
      meta,
    );
    return {
      content: `${congratsMsg}\n\n${transitionOut}`,
      investigationComplete: false,
      newState: nextState,
    };
  }

  // RAG : history for this item + topic memory context
  const itemHistoryRaw = await getItemHistory(
    supabase,
    userId,
    currentItem.id,
    currentItem.type,
  );
  let generalContextRaw = "";
  try {
    const topics = await retrieveTopicMemories({
      supabase,
      userId,
      message,
      maxResults: 2,
    });
    generalContextRaw = formatTopicMemoriesForPrompt(topics);
  } catch (e) {
    console.warn("[Investigator] failed to load topic memories (non-blocking):", e);
  }
  // Prompt-size guardrails (latency/cost): keep only the most useful parts.
  const itemHistory = String(itemHistoryRaw ?? "").trim().slice(0, 1800);
  const generalContext = String(generalContextRaw ?? "").trim().slice(0, 1200);

  // Get current item progress for state machine context
  const itemProgress = getItemProgress(currentState, currentItem.id);
  const progressAddon = buildItemProgressAddon({ currentItem, itemProgress });

  const basePrompt = buildMainItemSystemPrompt({
    currentItem,
    itemHistory,
    generalContext,
    history,
    message,
    timeContextBlock: timeCtx?.prompt_block
      ? `=== REPÈRES TEMPORELS ===\n${timeCtx.prompt_block}\n`
      : "",
  });

  // Build additional addons for target exceeded habits and vital progression
  const targetExceededAddon = buildTargetExceededAddon({ currentItem });
  const vitalProgressionAddon = buildVitalProgressionAddon({ currentItem });

  // Combine base prompt with addons
  let systemPrompt = basePrompt;
  if (progressAddon) systemPrompt += `\n\n${progressAddon}`;
  if (targetExceededAddon) systemPrompt += `\n\n${targetExceededAddon}`;
  if (vitalProgressionAddon) systemPrompt += `\n\n${vitalProgressionAddon}`;

  console.log(
    `[Investigator] Generating response for item: ${currentItem.title}`,
  );

  const response = await generateWithGemini(
    systemPrompt,
    `Gère l'item "${currentItem.title}"`,
    0.3,
    false,
    INVESTIGATOR_TOOLS,
    "auto",
    {
      requestId: meta?.requestId,
      // Avoid Gemini preview defaults in prod; rely on global default (gpt-5-mini) unless overridden.
      model: meta?.model,
      source: "sophia-brain:investigator",
      forceRealAi: meta?.forceRealAi,
    },
  );

  return await handleInvestigatorModelOutput({
    supabase,
    userId,
    message,
    history,
    currentState,
    currentItem,
    response,
    systemPrompt,
    meta,
  });
}
