import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import process from "node:process";

const MORNING_EVENT_CONTEXTS = [
  "morning_nudge_v2",
  "morning_active_actions_nudge",
];

function parseArgs(argv) {
  const out = {
    userId: null,
    from: null,
    to: null,
    hours: 168,
    outFile: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--user-id") {
      out.userId = String(argv[++i] ?? "").trim() || null;
    } else if (arg === "--from") {
      out.from = String(argv[++i] ?? "").trim() || null;
    } else if (arg === "--to") out.to = String(argv[++i] ?? "").trim() || null;
    else if (arg === "--hours") {
      const hours = Number(argv[++i] ?? "");
      out.hours = Number.isFinite(hours) && hours > 0 ? hours : 168;
    } else if (arg === "--out") {
      out.outFile = String(argv[++i] ?? "").trim() || null;
    } else if (arg === "--help" || arg === "-h") out.help = true;
  }

  return out;
}

function isIsoLike(value) {
  const raw = String(value ?? "").trim();
  return raw ? Number.isFinite(new Date(raw).getTime()) : false;
}

function toIsoOrNull(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
}

function getLocalSupabaseStatus(repoRoot) {
  const supabaseCli = String(process.env.SOPHIA_SUPABASE_CLI ?? "supabase")
    .trim();
  const raw = execSync(`${supabaseCli} status --output json`, {
    encoding: "utf8",
    cwd: repoRoot,
  });
  return JSON.parse(raw);
}

function isLocalUrl(url) {
  const normalized = String(url ?? "").toLowerCase();
  return normalized.includes("localhost") || normalized.includes("127.0.0.1") ||
    normalized.includes("0.0.0.0");
}

function getSupabaseConnection(repoRoot) {
  const envUrl = String(process.env.SUPABASE_URL ?? "").trim();
  const envService = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ??
      "",
  ).trim();

  if (envUrl) {
    return { url: envUrl, serviceKey: envService || null, source: "env" };
  }

  const status = getLocalSupabaseStatus(repoRoot);
  const url = String(status?.API_URL ?? "").trim();
  const serviceKey = String(status?.SECRET_KEY ?? "").trim() || null;
  if (!url) {
    throw new Error(
      "Missing SUPABASE_URL env and no local `supabase status --output json` available.",
    );
  }
  return { url, serviceKey, source: "local" };
}

function getInternalSecret(connection) {
  const explicit = String(process.env.INTERNAL_FUNCTION_SECRET ?? "").trim();
  if (explicit) return explicit;

  const fallback = String(process.env.SECRET_KEY ?? "").trim();
  if (fallback) return fallback;

  if (isLocalUrl(connection.url) && connection.serviceKey) {
    return connection.serviceKey;
  }

  throw new Error(
    "Missing INTERNAL_FUNCTION_SECRET. Set it in env for remote/staging usage.",
  );
}

function buildFunctionsBaseUrl(rawUrl) {
  const base = String(rawUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("Missing SUPABASE_URL");
  if (base.endsWith("/functions/v1")) return base;
  if (base.includes("/functions/v1/")) {
    return base.replace(/\/functions\/v1\/.*/, "/functions/v1");
  }
  return `${base}/functions/v1`;
}

async function supabaseGet(baseUrl, serviceKey, tablePath) {
  const url = `${baseUrl}/rest/v1/${tablePath}`;
  const res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET ${tablePath} → ${res.status}: ${text.slice(0, 800)}`);
  }
  return JSON.parse(text);
}

async function postInternalJson(url, internalSecret, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": internalSecret,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 1200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}`);
  }
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function compactTs(iso) {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "unknown";
  return [
    dt.getUTCFullYear(),
    pad2(dt.getUTCMonth() + 1),
    pad2(dt.getUTCDate()),
    "T",
    pad2(dt.getUTCHours()),
    pad2(dt.getUTCMinutes()),
    pad2(dt.getUTCSeconds()),
    "Z",
  ].join("");
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter(Boolean)
    : [];
}

function minutesBetween(a, b) {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60);
}

async function loadMorningNudgeCheckins(
  baseUrl,
  serviceKey,
  userId,
  fromIso,
  toIso,
) {
  const contexts = MORNING_EVENT_CONTEXTS.join(",");
  return supabaseGet(
    baseUrl,
    serviceKey,
    `scheduled_checkins?user_id=eq.${userId}&scheduled_for=gte.${fromIso}&scheduled_for=lte.${toIso}&event_context=in.(${contexts})&select=id,user_id,event_context,draft_message,message_payload,delivery_attempt_count,created_at,scheduled_for,status,processed_at&order=scheduled_for.asc`,
  );
}

function extractPostureFromPayload(payload) {
  return cleanText(
    payload?.morning_nudge_posture ?? payload?.momentum_strategy,
  ) || null;
}

function extractTargetedItemsFromPayload(payload) {
  return stringArray(
    payload?.plan_item_titles_targeted ??
      payload?.target_plan_item_titles ??
      payload?.predicted_today_plan_item_titles,
  );
}

function deliveryAt(checkin) {
  return cleanText(
    checkin?.processed_at ?? checkin?.scheduled_for ?? checkin?.created_at,
  ) ||
    null;
}

function decisionBudgetState(payload) {
  const nudgesSent7d = payload?.nudges_sent_7d;
  const maxProactive = payload?.max_proactive_per_7d;
  return {
    nudges_sent_7d: Number.isFinite(Number(nudgesSent7d))
      ? Number(nudgesSent7d)
      : null,
    max_proactive_per_7d: Number.isFinite(Number(maxProactive))
      ? Number(maxProactive)
      : null,
  };
}

function decisionCooldownState(payload) {
  const postureCooldown = typeof payload?.posture_on_cooldown === "boolean"
    ? payload.posture_on_cooldown
    : null;
  const itemCooldown = typeof payload?.item_on_cooldown === "boolean"
    ? payload.item_on_cooldown
    : null;
  return {
    posture_on_cooldown: postureCooldown,
    item_on_cooldown: itemCooldown,
    fallback_used: cleanText(payload?.fallback_posture) || null,
  };
}

function buildNudgeDecisions(momentumTrace) {
  return (momentumTrace?.proactive_decisions ?? [])
    .filter((entry) => cleanText(entry?.target_kind) === "morning_nudge")
    .map((entry) => {
      const payload = entry?.payload ?? {};
      return {
        at: entry.at,
        decision: cleanText(entry.decision) || null,
        skip_reason: cleanText(entry.decision_reason) || null,
        posture: cleanText(payload.posture ?? payload.morning_nudge_posture) ||
          null,
        confidence: cleanText(payload.confidence) || null,
        momentum_state: cleanText(
          entry.state_at_decision ?? payload.momentum_state,
        ) || null,
        plan_items_targeted: extractTargetedItemsFromPayload(payload),
        delivery_status: cleanText(payload.delivery_status) || null,
        transport: cleanText(payload.transport) || null,
        cooldown_check: decisionCooldownState(payload),
        budget_state: decisionBudgetState(payload),
        raw_payload: payload,
      };
    });
}

function buildNudgeDeliveries(checkins) {
  return checkins
    .filter((checkin) =>
      ["sent", "awaiting_user", "failed", "cancelled", "retrying"].includes(
        cleanText(checkin?.status),
      ) || Number(checkin?.delivery_attempt_count ?? 0) > 0
    )
    .map((checkin) => {
      const payload = checkin?.message_payload ?? {};
      return {
        at: deliveryAt(checkin),
        scheduled_for: cleanText(checkin?.scheduled_for) || null,
        event_context: cleanText(checkin?.event_context) || null,
        delivery_status: cleanText(checkin?.status) || null,
        posture: extractPostureFromPayload(payload),
        message_content: cleanText(checkin?.draft_message) || null,
        instruction: cleanText(payload?.instruction) || null,
        fallback_text: cleanText(payload?.fallback_text) || null,
        event_grounding: cleanText(payload?.event_grounding) || null,
        plan_items_targeted: extractTargetedItemsFromPayload(payload),
        confidence: cleanText(payload?.confidence) || null,
        scheduled_checkin_id: checkin?.id ?? null,
      };
    });
}

function buildNudgeReactions(deliveries, messages) {
  return deliveries.map((delivery) => {
    const sentAt = delivery.at;
    const sentMs = sentAt ? new Date(sentAt).getTime() : NaN;
    const reaction = Number.isFinite(sentMs)
      ? messages.find((message) =>
        message.role === "user" &&
        new Date(message.created_at).getTime() > sentMs &&
        new Date(message.created_at).getTime() <= sentMs + 4 * 60 * 60 * 1000
      )
      : null;

    return {
      nudge_at: sentAt,
      posture: delivery.posture,
      had_reaction: Boolean(reaction),
      reaction_at: reaction?.created_at ?? null,
      reaction_delay_minutes: reaction && sentAt
        ? Math.round(minutesBetween(sentAt, reaction.created_at))
        : null,
      reaction_content_preview: reaction
        ? String(reaction.content ?? "").slice(0, 80)
        : null,
    };
  });
}

function buildEventGroundings(deliveries) {
  return deliveries
    .filter((delivery) => delivery.posture === "pre_event_grounding")
    .map((delivery) => ({
      at: delivery.at,
      event_title: null,
      event_grounding: delivery.event_grounding,
      message_sent: delivery.message_content,
      scheduled_checkin_id: delivery.scheduled_checkin_id,
    }));
}

function computeScorecard(decisions, deliveries, reactions) {
  const totalDecisions = decisions.length;
  const speakDecisions =
    decisions.filter((entry) => entry.decision === "send").length;
  const skipDecisions =
    decisions.filter((entry) => entry.decision === "skip").length;
  const speakRate = totalDecisions > 0
    ? Math.round((speakDecisions / totalDecisions) * 100)
    : null;

  const postureDistribution = {};
  for (const delivery of deliveries) {
    const posture = delivery.posture ?? "unknown";
    postureDistribution[posture] = (postureDistribution[posture] ?? 0) + 1;
  }

  let repeatedTransitions = 0;
  let maxConsecutive = 0;
  for (let i = 1; i < deliveries.length; i++) {
    if (
      deliveries[i].posture &&
      deliveries[i].posture === deliveries[i - 1].posture
    ) {
      repeatedTransitions++;
      let streak = 2;
      let cursor = i;
      while (
        cursor + 1 < deliveries.length &&
        deliveries[cursor + 1].posture === deliveries[i].posture
      ) {
        streak++;
        cursor++;
      }
      if (streak > maxConsecutive) maxConsecutive = streak;
    }
  }

  const postureRepetitionRate = deliveries.length > 1
    ? Math.round((repeatedTransitions / (deliveries.length - 1)) * 100)
    : 0;

  const replies = reactions.filter((entry) => entry.had_reaction);
  const reactionRate = reactions.length > 0
    ? Math.round((replies.length / reactions.length) * 100)
    : null;
  const positiveReactionRate = reactions.length > 0
    ? Math.round(
      (replies.filter((entry) =>
        entry.reaction_delay_minutes != null &&
        entry.reaction_delay_minutes <= 120
      ).length / reactions.length) * 100,
    )
    : null;

  const skipReasonDistribution = {};
  for (const decision of decisions) {
    if (decision.decision !== "skip") continue;
    const reason = normalizeSkipReason(decision.skip_reason);
    skipReasonDistribution[reason] = (skipReasonDistribution[reason] ?? 0) + 1;
  }

  const cooldownChecks = decisions.filter((entry) =>
    entry.cooldown_check.posture_on_cooldown !== null ||
    entry.cooldown_check.item_on_cooldown !== null
  );
  const budgetChecks = decisions.filter((entry) =>
    entry.budget_state.nudges_sent_7d !== null &&
    entry.budget_state.max_proactive_per_7d !== null
  );

  const cooldownViolations = cooldownChecks.length > 0
    ? cooldownChecks.filter((entry) =>
      entry.decision === "send" && (
        entry.cooldown_check.posture_on_cooldown === true ||
        entry.cooldown_check.item_on_cooldown === true
      )
    ).length
    : null;
  const budgetViolations = budgetChecks.length > 0
    ? budgetChecks.filter((entry) =>
      entry.decision === "send" &&
      entry.budget_state.nudges_sent_7d >
        entry.budget_state.max_proactive_per_7d
    ).length
    : null;

  const alerts = [];
  if ((cooldownViolations ?? 0) > 0) {
    alerts.push(`cooldown_violated: ${cooldownViolations} case(s)`);
  }
  if ((budgetViolations ?? 0) > 0) {
    alerts.push(`budget_exceeded: ${budgetViolations} case(s)`);
  }
  if (maxConsecutive >= 3) {
    alerts.push(`same_posture_3x: max ${maxConsecutive} consecutive`);
  }

  let noReactionStreak = 0;
  for (const reaction of reactions) {
    if (!reaction.had_reaction) {
      noReactionStreak++;
      if (noReactionStreak >= 5) {
        alerts.push(`no_reaction_5_consecutive at ${reaction.nudge_at}`);
        break;
      }
    } else {
      noReactionStreak = 0;
    }
  }

  if (totalDecisions > 7 && speakDecisions === 0) {
    alerts.push("systematic_skip: 0 speaks over window");
  }
  if (totalDecisions > 7 && skipDecisions === 0) {
    alerts.push("systematic_speak: 0 skips over window");
  }

  return {
    total_decisions: totalDecisions,
    speak_rate: speakRate,
    posture_distribution: postureDistribution,
    posture_repetition_rate: postureRepetitionRate,
    cooldown_violations: cooldownViolations,
    budget_violations: budgetViolations,
    reaction_rate: reactionRate,
    positive_reaction_rate: positiveReactionRate,
    skip_reason_distribution: skipReasonDistribution,
    data_completeness: {
      cooldown_checks_available: cooldownChecks.length,
      budget_checks_available: budgetChecks.length,
    },
    alerts,
  };
}

function normalizeSkipReason(reason) {
  const raw = cleanText(reason);
  if (!raw) return "unknown";
  if (raw.includes("pause_consentie")) return "pause_consentie";
  if (raw.includes("no_items")) return "no_active_items";
  if (raw.includes("weekly_cap") || raw.includes("policy")) {
    return "budget_exceeded";
  }
  if (raw.includes("fatigue")) return "posture_fatigue";
  if (raw.includes("cooldown")) return "no_viable_posture";
  return raw;
}

function transcriptWrite(filePath, messages) {
  const fd = fs.openSync(filePath, "w");
  try {
    for (const row of messages ?? []) {
      const ts = String(row?.created_at ?? "");
      const scope = String(row?.scope ?? "");
      const role = String(row?.role ?? "");
      const content = String(row?.content ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
      const header = `[${ts}]${scope ? ` [${scope}]` : ""} ${role}:`;
      fs.writeSync(fd, `${header}\n${content}\n\n`, null, "utf8");
    }
  } finally {
    fs.closeSync(fd);
  }
}

async function main() {
  const repoRoot = path.resolve(process.cwd());
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log([
      "Usage:",
      "  node ./scripts/export_proactive_v2_audit_bundle.mjs --user-id <uuid> --hours 168",
      "  node ./scripts/export_proactive_v2_audit_bundle.mjs --user-id <uuid> --from <ISO> --to <ISO>",
      "",
      "Options:",
      "  --user-id <uuid>     Required. User UUID",
      "  --hours <N>          Window in hours (default: 168 = 7 days)",
      "  --from <ISO>         Start datetime (alternative to --hours)",
      "  --to <ISO>           End datetime",
      "  --out <path>         Output JSON path (default: tmp/)",
      "",
      "Environment:",
      "  SUPABASE_URL                  If set, uses remote. Otherwise falls back to local supabase.",
      "  SUPABASE_SERVICE_ROLE_KEY     Required for remote.",
    ].join("\n"));
    return;
  }

  if (!args.userId) {
    console.error('Missing --user-id "<uuid>"');
    process.exit(1);
  }
  if (args.from && !isIsoLike(args.from)) {
    console.error(`Invalid --from value: ${args.from}`);
    process.exit(1);
  }
  if (args.to && !isIsoLike(args.to)) {
    console.error(`Invalid --to value: ${args.to}`);
    process.exit(1);
  }

  const connection = getSupabaseConnection(repoRoot);
  if (!connection.serviceKey) {
    throw new Error(
      "Missing service key. Set SUPABASE_SERVICE_ROLE_KEY or use local supabase.",
    );
  }

  const baseUrl = connection.url.replace(/\/+$/, "");
  const now = new Date().toISOString();
  const fromIso = toIsoOrNull(args.from) ??
    new Date(Date.now() - args.hours * 3600 * 1000).toISOString();
  const toIso = toIsoOrNull(args.to) ?? now;

  console.error(`Connecting to ${baseUrl} (${connection.source})…`);
  console.error(
    `Loading proactive V2 audit for user=${
      args.userId.slice(0, 8)
    }… window=${args.hours}h`,
  );

  const functionsBase = buildFunctionsBaseUrl(connection.url);
  const internalSecret = getInternalSecret(connection);
  const traceBody = {
    user_id: args.userId,
    scope: "whatsapp",
    ...(args.from ? { from: fromIso, to: toIso } : { hours: args.hours }),
  };

  const [momentumTraceRes, momentumScorecardRes, checkins] = await Promise.all([
    postInternalJson(
      `${functionsBase}/get-momentum-trace`,
      internalSecret,
      traceBody,
    ),
    postInternalJson(
      `${functionsBase}/get-momentum-scorecard`,
      internalSecret,
      traceBody,
    ),
    loadMorningNudgeCheckins(
      baseUrl,
      connection.serviceKey,
      args.userId,
      fromIso,
      toIso,
    ),
  ]);

  const momentumTrace = momentumTraceRes?.trace ?? {};
  const deliveries = buildNudgeDeliveries(checkins);
  const decisions = buildNudgeDecisions(momentumTrace);
  const reactions = buildNudgeReactions(
    deliveries,
    momentumTrace.messages ?? [],
  );
  const eventGroundings = buildEventGroundings(deliveries);
  const scorecard = computeScorecard(decisions, deliveries, reactions);

  const trace = {
    window: {
      from: fromIso,
      to: toIso,
      scope: "whatsapp",
      hours: args.from ? null : args.hours,
    },
    summary: {
      nudge_decisions_total: decisions.length,
      nudge_deliveries_total: deliveries.length,
      nudge_skips_total:
        decisions.filter((entry) => entry.decision === "skip").length,
      nudge_reactions_total:
        reactions.filter((entry) => entry.had_reaction).length,
      messages_total: (momentumTrace.messages ?? []).length,
      momentum_state_events_total: (momentumTrace.state_timeline ?? []).length,
      observability_events_total:
        momentumTrace.summary?.observability_events_total ?? null,
      scheduled_checkins_total: checkins.length,
    },
    nudge_decisions: decisions,
    nudge_deliveries: deliveries,
    nudge_reactions: reactions,
    event_groundings: eventGroundings,
    momentum_state_timeline: momentumTrace.state_timeline ?? [],
    momentum_proactive_decisions: momentumTrace.proactive_decisions ?? [],
  };

  const bundle = {
    ok: true,
    exported_at: now,
    source: {
      supabase_url: baseUrl,
      connection_type: connection.source,
      trace_endpoint: "get-momentum-trace",
      scorecard_endpoint: "get-momentum-scorecard",
      scheduled_checkin_contexts: MORNING_EVENT_CONTEXTS,
    },
    request: {
      user_id: args.userId,
      from: fromIso,
      to: toIso,
      scope: "whatsapp",
      used_hours: args.from ? null : args.hours,
    },
    trace,
    scorecard,
    legacy_momentum_scorecard: momentumScorecardRes?.scorecard ?? null,
    annotations: [],
  };

  const outDir = path.join(repoRoot, "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const defaultOutFile = path.join(
    outDir,
    `proactive_v2_audit_${args.userId.slice(0, 8)}_${compactTs(fromIso)}_${
      compactTs(toIso)
    }.json`,
  );
  const outFile = args.outFile
    ? path.resolve(repoRoot, args.outFile)
    : defaultOutFile;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  const transcriptPath = outFile.replace(/\.json$/i, ".transcript.txt");
  fs.writeFileSync(outFile, JSON.stringify(bundle, null, 2), "utf8");
  transcriptWrite(transcriptPath, momentumTrace.messages ?? []);

  console.log(JSON.stringify(
    {
      ok: true,
      out: outFile,
      transcript: transcriptPath,
      window: { from: fromIso, to: toIso },
      counts: {
        decisions: decisions.length,
        deliveries: deliveries.length,
        reactions_with_response: reactions.filter((entry) =>
          entry.had_reaction
        ).length,
        event_groundings: eventGroundings.length,
        checkins: checkins.length,
        messages: (momentumTrace.messages ?? []).length,
      },
      scorecard_summary: {
        speak_rate: scorecard.speak_rate,
        posture_distribution: scorecard.posture_distribution,
        reaction_rate: scorecard.reaction_rate,
        alerts: scorecard.alerts,
      },
    },
    null,
    2,
  ));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
