export type WinbackStep = 1 | 2 | 3;

export type WinbackReplyIntent =
  | "resume"
  | "simplify"
  | "pause_short"
  | "pause_week"
  | "wait_for_user"
  | "unknown";

export interface WhatsAppWinbackEvaluation {
  decision: "send" | "skip";
  reason: string;
  step?: WinbackStep;
  suppress_other_proactives: boolean;
  inactivity_days: number | null;
  current_step: number;
}

const WINBACK_STEP_MIN_INACTIVITY_DAYS: Record<WinbackStep, number> = {
  1: 2,
  2: 5,
  3: 9,
};

const WINBACK_STEP_MIN_GAP_DAYS: Record<WinbackStep, number> = {
  1: 0,
  2: 3,
  3: 4,
};

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function diffDaysFloor(nowMs: number, pastMs: number | null): number | null {
  if (!Number.isFinite(nowMs) || !Number.isFinite(pastMs ?? NaN)) return null;
  const deltaMs = Math.max(0, nowMs - (pastMs as number));
  return Math.floor(deltaMs / (24 * 60 * 60 * 1000));
}

export function evaluateWhatsAppWinback(args: {
  whatsappBilanOptedIn?: unknown;
  whatsappBilanPausedUntil?: unknown;
  whatsappCoachingPausedUntil?: unknown;
  whatsappLastInboundAt?: unknown;
  whatsappBilanWinbackStep?: unknown;
  whatsappBilanLastWinbackAt?: unknown;
  now?: Date;
}): WhatsAppWinbackEvaluation {
  const nowMs = (args.now ?? new Date()).getTime();
  const optedIn = Boolean(args.whatsappBilanOptedIn);
  const currentStep = Math.max(
    0,
    Math.min(3, Math.floor(Number(args.whatsappBilanWinbackStep ?? 0))),
  );
  const pauseUntilMs = Math.max(
    parseIsoMs(args.whatsappBilanPausedUntil) ?? 0,
    parseIsoMs(args.whatsappCoachingPausedUntil) ?? 0,
  );

  if (!optedIn) {
    return {
      decision: "skip",
      reason: "winback_not_opted_in",
      suppress_other_proactives: false,
      inactivity_days: null,
      current_step: currentStep,
    };
  }

  if (pauseUntilMs > nowMs) {
    return {
      decision: "skip",
      reason: "winback_pause_active",
      suppress_other_proactives: false,
      inactivity_days: null,
      current_step: currentStep,
    };
  }

  const lastInboundMs = parseIsoMs(args.whatsappLastInboundAt);
  const inactivityDays = diffDaysFloor(nowMs, lastInboundMs);
  if (inactivityDays === null) {
    return {
      decision: "skip",
      reason: "winback_no_user_activity_reference",
      suppress_other_proactives: false,
      inactivity_days: null,
      current_step: currentStep,
    };
  }

  if (inactivityDays < WINBACK_STEP_MIN_INACTIVITY_DAYS[1]) {
    return {
      decision: "skip",
      reason: "winback_inactivity_below_step1_threshold",
      suppress_other_proactives: false,
      inactivity_days: inactivityDays,
      current_step: currentStep,
    };
  }

  if (currentStep <= 0) {
    return {
      decision: "send",
      reason: "winback_step1_due",
      step: 1,
      suppress_other_proactives: true,
      inactivity_days: inactivityDays,
      current_step: currentStep,
    };
  }

  if (currentStep >= 3) {
    return {
      decision: "skip",
      reason: "winback_waiting_after_step3",
      suppress_other_proactives: true,
      inactivity_days: inactivityDays,
      current_step: currentStep,
    };
  }

  const nextStep = (currentStep + 1) as WinbackStep;
  const minInactivityDays = WINBACK_STEP_MIN_INACTIVITY_DAYS[nextStep];
  const minGapDays = WINBACK_STEP_MIN_GAP_DAYS[nextStep];
  const lastWinbackMs = parseIsoMs(args.whatsappBilanLastWinbackAt);
  const daysSinceLastWinback = diffDaysFloor(nowMs, lastWinbackMs);

  if (inactivityDays < minInactivityDays) {
    return {
      decision: "skip",
      reason: `winback_step${nextStep}_not_due_inactivity`,
      suppress_other_proactives: true,
      inactivity_days: inactivityDays,
      current_step: currentStep,
    };
  }

  if ((daysSinceLastWinback ?? 0) < minGapDays) {
    return {
      decision: "skip",
      reason: `winback_step${nextStep}_cooldown`,
      suppress_other_proactives: true,
      inactivity_days: inactivityDays,
      current_step: currentStep,
    };
  }

  return {
    decision: "send",
    reason: `winback_step${nextStep}_due`,
    step: nextStep,
    suppress_other_proactives: true,
    inactivity_days: inactivityDays,
    current_step: currentStep,
  };
}

export function classifyWinbackReplyIntent(args: {
  actionId?: unknown;
  text?: unknown;
}): WinbackReplyIntent {
  const actionId = String(args.actionId ?? "").trim().toLowerCase();
  const text = String(args.text ?? "").trim().toLowerCase();

  if (
    actionId === "winback_resume" ||
    actionId === "winback_restart" ||
    actionId === "winback_reconnect" ||
    actionId === "winback_hi" ||
    /\b(je veux bien|on reprend|je reprends|salut|hello|coucou|ok|oui|go)\b/.test(text)
  ) {
    return "resume";
  }

  if (
    actionId === "winback_make_simple" ||
    actionId === "winback_simplify" ||
    actionId === "winback_overwhelmed" ||
    actionId === "winback_adapt_plan" ||
    actionId === "winback_low_energy" ||
    /\b(simple|simplif|j['’]ai décroché|j'ai decroche|j['’]ai lâché|j'ai lache)\b/.test(text)
  ) {
    return "simplify";
  }

  if (
    actionId === "winback_pause_short" ||
    actionId === "winback_pause_48h" ||
    /\b(pas maintenant|pas aujourd['’]hui|pas ce soir)\b/.test(text)
  ) {
    return "pause_short";
  }

  if (
    actionId === "winback_pause_week" ||
    /\b(pas cette semaine|semaine prochaine)\b/.test(text)
  ) {
    return "pause_week";
  }

  if (
    actionId === "winback_wait_for_user" ||
    actionId === "winback_sleep_infinite" ||
    /\b(laisse[- ]?moi revenir|je réécris plus tard|je reecris plus tard|je reviendrai|je reviendrais)\b/.test(
      text,
    )
  ) {
    return "wait_for_user";
  }

  return "unknown";
}
