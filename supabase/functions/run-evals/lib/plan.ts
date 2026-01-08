import { backoffMs, clampInt, pickManyUnique, pickOne, sha256Hex, sleep, isUuidLike } from "./utils.ts";

const AXIS_BANK = [
  {
    id: "sleep",
    title: "Sommeil",
    theme: "Énergie",
    problems: ["Difficulté d'endormissement", "Réveils nocturnes", "Scroll tard le soir", "Ruminations"],
  },
  {
    id: "stress",
    title: "Gestion du stress",
    theme: "Émotions",
    problems: ["Anxiété", "Irritabilité", "Charge mentale", "Rumination"],
  },
  {
    id: "focus",
    title: "Focus & Discipline",
    theme: "Productivité",
    problems: ["Procrastination", "Distractions", "Manque de clarté", "Désorganisation"],
  },
  {
    id: "health",
    title: "Santé & Mouvement",
    theme: "Vitalité",
    problems: ["Sédentarité", "Manque d'activité", "Manque d'énergie", "Douleurs / raideurs"],
  },
] as const;

function buildFakeQuestionnairePayload() {
  const axis = pickOne([...AXIS_BANK]);
  const pacing = pickOne(["fast", "balanced", "slow"]);
  const chosenProblems = pickManyUnique([...axis.problems], 2);

  const inputs = {
    why: `Je veux améliorer ${axis.title.toLowerCase()} pour retrouver de l'énergie et être plus stable au quotidien.`,
    blockers: pickOne([
      "Je manque de constance, je décroche quand je suis fatigué.",
      "Je suis souvent débordé, j'oublie et je remets à plus tard.",
      "Je me sens vite submergé et je perds le fil.",
    ]),
    context: pickOne([
      "Rythme de vie chargé, beaucoup de sollicitations, peu de temps pour moi.",
      "Je bosse sur écran, je finis tard et je dors mal.",
      "J'ai des journées irrégulières, je suis fatigué et je compense avec le téléphone.",
    ]),
    pacing,
  };

  // Minimal but realistic-ish "answers" blob; generate-plan mainly uses it as context string.
  const answers = {
    meta: {
      source: "run-evals",
      questionnaire_type: "onboarding",
      axis_id: axis.id,
      created_at: new Date().toISOString(),
    },
    axis: {
      id: axis.id,
      title: axis.title,
      theme: axis.theme,
      problems: chosenProblems,
    },
    lifestyle: {
      sleep_quality: pickOne(["mauvaise", "moyenne", "bonne"]),
      stress_level: pickOne(["élevé", "moyen", "faible"]),
      activity_level: pickOne(["faible", "moyen", "élevé"]),
    },
  };

  const currentAxis = {
    id: axis.id,
    title: axis.title,
    theme: axis.theme,
    problems: chosenProblems,
  };

  const userProfile = {
    birth_date: pickOne(["1992-03-11", "1988-09-22", "1996-01-05"]),
    gender: pickOne(["male", "female", "other"]),
  };

  return { inputs, currentAxis, answers, userProfile };
}

function normalizePlanActionIdsToUuid(plan: any) {
  if (!plan || typeof plan !== "object") return plan;
  const phases = (plan as any).phases;
  if (!Array.isArray(phases)) return plan;
  for (const p of phases) {
    const actions = p?.actions;
    if (!Array.isArray(actions)) continue;
    for (const a of actions) {
      if (!isUuidLike(a?.id)) a.id = crypto.randomUUID();
    }
  }
  return plan;
}

function reassignAllPlanActionIds(plan: any) {
  if (!plan || typeof plan !== "object") return plan;
  const phases = (plan as any).phases;
  if (!Array.isArray(phases)) return plan;
  for (const p of phases) {
    const actions = p?.actions;
    if (!Array.isArray(actions)) continue;
    for (const a of actions) {
      if (a && typeof a === "object") (a as any).id = crypto.randomUUID();
    }
  }
  return plan;
}

function applyActivationToPlan(plan: any, activeCount: number) {
  if (!plan || typeof plan !== "object") return plan;
  const phases = (plan as any).phases;
  if (!Array.isArray(phases)) return plan;

  let cursor = 0;
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    if (p && typeof p === "object") {
      (p as any).status = i === 0 ? "active" : "locked";
    }
    const actions = p?.actions;
    if (!Array.isArray(actions)) continue;
    for (const a of actions) {
      if (!a || typeof a !== "object") continue;
      (a as any).isCompleted = false;
      (a as any).status = cursor < activeCount ? "active" : "pending";
      cursor += 1;
    }
  }
  return plan;
}

async function callGeneratePlan(params: {
  url: string;
  anonKey: string;
  authHeader: string;
  requestId: string;
  payload: any;
}) {
  const { url, anonKey, authHeader, requestId, payload } = params;
  const MAX_RETRIES = 6;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const resp = await fetch(`${url}/functions/v1/generate-plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
        "apikey": anonKey,
        "x-request-id": requestId,
      },
      body: JSON.stringify(payload),
    });
    const json = await resp.json().catch(() => ({}));
    const msg = String(json?.error ?? "");
    const lower = msg.toLowerCase();
    // generate-plan can surface upstream Gemini overloads as 500 with a 503 message.
    const isRetryable =
      resp.status === 429 ||
      resp.status === 503 ||
      (resp.status >= 500 &&
        (lower.includes("resource exhausted") || lower.includes("overloaded") || lower.includes("unavailable") ||
          lower.includes("temporarily") || lower.includes("503") || msg.includes("429")));
    if (resp.ok && json && !json?.error) return json;
    if (!isRetryable || attempt >= MAX_RETRIES) {
      throw new Error(json?.error || `generate-plan failed (${resp.status})`);
    }
    await sleep(backoffMs(attempt));
  }
  throw new Error("generate-plan failed (retries exhausted)");
}

export type RunPlanTemplate = {
  fake: ReturnType<typeof buildFakeQuestionnairePayload>;
  planContentRaw: any;
  templateFingerprint: string;
};

export async function buildRunPlanTemplate(params: {
  url: string;
  anonKey: string;
  authHeader: string;
  requestId: string;
}): Promise<RunPlanTemplate> {
  const fake = buildFakeQuestionnairePayload();
  const planContentRaw = await callGeneratePlan({
    url: params.url,
    anonKey: params.anonKey,
    authHeader: params.authHeader,
    requestId: params.requestId,
    payload: {
      force_real_generation: true,
      mode: "standard",
      inputs: fake.inputs,
      currentAxis: fake.currentAxis,
      answers: fake.answers,
      userProfile: fake.userProfile,
    },
  });
  const templateFingerprint = (await sha256Hex(JSON.stringify(planContentRaw))).slice(0, 16);
  return { fake, planContentRaw, templateFingerprint };
}

export async function seedActivePlan(
  admin: any,
  userId: string,
  env: { url: string; anonKey: string; authHeader: string; requestId: string },
  opts?: { bilanActionsCount?: number; planTemplate?: RunPlanTemplate; includeVitalsInBilan?: boolean },
) {
  const submissionId = crypto.randomUUID();

  // Ensure onboarding completed (some flows assume it).
  await admin.from("profiles").update({ onboarding_completed: true }).eq("id", userId);

  const { data: goalRow, error: goalErr } = await admin
    .from("user_goals")
    .insert({
      user_id: userId,
      submission_id: submissionId,
      status: "active",
      axis_id: "axis_test",
      axis_title: "Test Axis",
      theme_id: "theme_test",
      priority_order: 1,
    })
    .select("id")
    .single();
  if (goalErr) throw goalErr;

  const activeCount = clampInt(opts?.bilanActionsCount ?? 0, 0, 20, 0);
  const fake = opts?.planTemplate?.fake ?? buildFakeQuestionnairePayload();

  // Reuse a single "plan template" per run (when provided), so plan content doesn't vary per scenario.
  // IMPORTANT: IDs must be unique per seeded user, otherwise user_actions PKs collide across scenarios.
  const baseRaw = opts?.planTemplate?.planContentRaw ?? await callGeneratePlan({
    url: env.url,
    anonKey: env.anonKey,
    authHeader: env.authHeader,
    requestId: env.requestId,
    payload: {
      force_real_generation: true,
      mode: "standard",
      inputs: fake.inputs,
      currentAxis: fake.currentAxis,
      answers: fake.answers,
      userProfile: fake.userProfile,
    },
  });
  const rawClone = structuredClone(baseRaw);
  const planContent = applyActivationToPlan(reassignAllPlanActionIds(normalizePlanActionIdsToUuid(rawClone)), activeCount);
  const { data: planRow, error: planErr } = await admin
    .from("user_plans")
    .insert({
      user_id: userId,
      goal_id: goalRow.id,
      submission_id: submissionId,
      status: "active",
      current_phase: 1,
      title: String((planContent as any)?.grimoireTitle ?? "Eval plan"),
      deep_why: String((planContent as any)?.deepWhy ?? (fake.inputs as any)?.why ?? "Plan généré pour tests (eval run)."),
      context_problem: String((planContent as any)?.context_problem ?? ""),
      content: planContent,
    })
    .select("id,submission_id")
    .single();
  if (planErr) throw planErr;

  // Optional: seed tracking tables only if requested (bilan/investigator tests).
  const insertedActions: any[] = [];
  const pendingItems: any[] = [];
  const pendingVitalItems: any[] = [];
  if (activeCount > 0) {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const phases = ((planContent as any)?.phases ?? []) as any[];
    const activeItems: any[] = [];
    for (const p of phases) {
      const actions = (p?.actions ?? []) as any[];
      for (const a of actions) {
        const st = String(a?.status ?? "").toLowerCase();
        if (st === "active") activeItems.push(a);
      }
    }
    const itemsToCheck = activeItems.slice(0, activeCount);

    // 1) Habits / missions -> user_actions (id must be uuid)
    const actionRows = itemsToCheck
      .filter((a) => String(a?.type ?? "").toLowerCase() !== "framework")
      .map((a) => {
        const rawType = String(a?.type ?? "").toLowerCase();
        const t = rawType === "habitude" ? "habit" : "mission";
        const trackingType = String(a?.tracking_type ?? "boolean") === "counter" ? "counter" : "boolean";
        const timeOfDay = String(a?.time_of_day ?? "any_time");
        const targetReps = t === "habit" ? clampInt(a?.targetReps ?? 1, 1, 14, 1) : 1;
        return {
          id: String(a?.id ?? crypto.randomUUID()),
          user_id: userId,
          plan_id: planRow.id,
          submission_id: planRow.submission_id,
          type: t,
          title: String(a?.title ?? "Action"),
          description: String(a?.description ?? ""),
          target_reps: targetReps,
          current_reps: 0,
          status: "active",
          tracking_type: trackingType,
          time_of_day: timeOfDay,
          last_performed_at: twoDaysAgo,
        };
      });
    if (actionRows.length > 0) {
      const { data: ins, error: actionErr } = await admin
        .from("user_actions")
        .insert(actionRows)
        .select("id,title,description,tracking_type,target_reps");
      if (actionErr) throw actionErr;
      insertedActions.push(...(ins ?? []));
      for (const a of actionRows) {
        pendingItems.push({
          id: a.id,
          type: "action",
          title: a.title,
          description: a.description,
          tracking_type: a.tracking_type,
          target: a.target_reps,
        });
      }
    }

    // 2) Frameworks -> user_framework_tracking (row id must be uuid; action_id is text)
    const frameworkRows = itemsToCheck
      .filter((a) => String(a?.type ?? "").toLowerCase() === "framework")
      .map((a) => {
        const trackingType = String(a?.tracking_type ?? "boolean") === "counter" ? "counter" : "boolean";
        const fwType = String(a?.frameworkDetails?.type ?? "recurring");
        const targetReps = clampInt(a?.targetReps ?? 1, 1, 14, 1);
        const rowId = crypto.randomUUID();
        return {
          id: rowId,
          user_id: userId,
          plan_id: planRow.id,
          submission_id: planRow.submission_id,
          action_id: String(a?.id ?? `fw_${Date.now()}`),
          title: String(a?.title ?? "Framework"),
          type: fwType,
          target_reps: targetReps,
          current_reps: 0,
          status: "active",
          tracking_type: trackingType,
          last_performed_at: twoDaysAgo,
          _pending_item: { id: rowId, type: "framework", title: String(a?.title ?? "Framework"), tracking_type: trackingType },
        };
      });
    if (frameworkRows.length > 0) {
      const { error: fwErr } = await admin.from("user_framework_tracking").insert(
        frameworkRows.map(({ _pending_item, ...rest }) => rest),
      );
      if (fwErr) throw fwErr;
      for (const r of frameworkRows) pendingItems.push((r as any)._pending_item);
    }

    // Ensure we ALWAYS have exactly N items to verify in bilan (no surprises like "0 actions").
    // If plan content is weirdly missing actives, we fill with synthetic missions.
    if (pendingItems.length < activeCount) {
      const missing = activeCount - pendingItems.length;
      const fillerRows = Array.from({ length: missing }).map((_, idx) => {
        const id = crypto.randomUUID();
        return {
          id,
          user_id: userId,
          plan_id: planRow.id,
          submission_id: planRow.submission_id,
          type: "mission",
          title: `Action (bilan) #${idx + 1}`,
          description: "Action créée pour compléter un bilan de test.",
          target_reps: 1,
          current_reps: 0,
          status: "active",
          tracking_type: "boolean",
          time_of_day: "any_time",
          last_performed_at: twoDaysAgo,
        };
      });
      const { data: ins2, error: fillErr } = await admin.from("user_actions").insert(fillerRows).select(
        "id,title,description,tracking_type,target_reps",
      );
      if (fillErr) throw fillErr;
      insertedActions.push(...(ins2 ?? []));
      for (const a of fillerRows) {
        pendingItems.push({
          id: a.id,
          type: "action",
          title: a.title,
          description: a.description,
          tracking_type: a.tracking_type,
          target: a.target_reps,
        });
      }
    }

    // 3) Vital signal -> user_vital_signs
    // If includeVitalsInBilan is set, we FORCE a deterministic vital so the bilan must include it.
    if (opts?.includeVitalsInBilan) {
      const vitalId = crypto.randomUUID();
      const label = "Sommeil";
      const unit = "h";
      const { error: vErr } = await admin.from("user_vital_signs").insert({
        id: vitalId,
        user_id: userId,
        plan_id: planRow.id,
        submission_id: planRow.submission_id,
        label,
        unit,
        current_value: "",
        target_value: "",
        status: "active",
        tracking_type: "counter",
        last_checked_at: twoDaysAgo,
      });
      if (vErr) throw vErr;
      pendingVitalItems.push({
        id: vitalId,
        type: "vital",
        title: label,
        tracking_type: "counter",
        unit,
      });
    } else {
      // Default behavior: seed from generated plan if present (realistic), and INCLUDE in pending_items.
      const vital = (planContent as any)?.vitalSignal;
      if (vital && typeof vital === "object") {
        const vitalId = crypto.randomUUID();
        const label = String(vital?.name ?? vital?.title ?? "Signe Vital");
        const trackingType = String(vital?.tracking_type ?? "counter") === "boolean" ? "boolean" : "counter";
        const unit = String(vital?.unit ?? "");
        const { error: vErr } = await admin.from("user_vital_signs").insert({
          id: vitalId,
          user_id: userId,
          plan_id: planRow.id,
          submission_id: planRow.submission_id,
          label,
          unit,
          current_value: String(vital?.startValue ?? ""),
          target_value: String(vital?.targetValue ?? ""),
          status: "active",
          tracking_type: trackingType,
          last_checked_at: twoDaysAgo,
        });
        if (vErr) throw vErr;

        pendingVitalItems.push({
          id: vitalId,
          type: "vital",
          title: label,
          tracking_type: trackingType,
          unit,
        });
      }
    }

    // Pre-generate an investigation_state matching the seeded items so investigator can be tested in isolation.
    await admin.from("user_chat_states").upsert({
      user_id: userId,
      scope: "web",
      current_mode: "investigator",
      risk_level: 0,
      investigation_state: {
        status: "checking",
        // Put vitals first (matches production sort), then requested actions/frameworks count.
        pending_items: [...pendingVitalItems, ...pendingItems.slice(0, activeCount)],
        current_item_index: 0,
        temp_memory: { opening_done: false },
      },
    }, { onConflict: "user_id,scope" });
  }

  return { planRow, insertedActions: insertedActions ?? [] };
}

export async function fetchPlanSnapshot(admin: any, userId: string): Promise<any> {
  const { data: planRow } = await admin
    .from("user_plans")
    .select(
      "id,created_at,status,title,deep_why,inputs_why,inputs_context,inputs_blockers,content,submission_id,goal_id,current_phase,progress_percentage",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [{ data: actions }, { data: frameworks }] = await Promise.all([
    admin
      .from("user_actions")
      .select("id,title,description,status,tracking_type,time_of_day,target_reps,current_reps,last_performed_at,created_at")
      .eq("user_id", userId)
      .in("status", ["active", "pending"])
      .order("created_at", { ascending: true })
      .limit(50),
    admin
      .from("user_framework_tracking")
      .select("id,title,status,tracking_type,type,target_reps,current_reps,last_performed_at,created_at")
      .eq("user_id", userId)
      .in("status", ["active", "pending"])
      .order("created_at", { ascending: true })
      .limit(50),
  ]);

  const mappedFrameworks = (frameworks ?? []).map((f: any) => ({
    id: f.id,
    title: f.title,
    description: "",
    status: f.status,
    tracking_type: f.tracking_type,
    time_of_day: null,
    target_reps: f.target_reps ?? null,
    current_reps: f.current_reps ?? null,
    last_performed_at: f.last_performed_at ?? null,
    created_at: f.created_at ?? null,
    _kind: "framework",
    framework_type: f.type ?? null,
  }));

  return {
    plan: planRow ?? null,
    actions: [...(actions ?? []), ...mappedFrameworks],
    frameworks: frameworks ?? [],
  };
}


