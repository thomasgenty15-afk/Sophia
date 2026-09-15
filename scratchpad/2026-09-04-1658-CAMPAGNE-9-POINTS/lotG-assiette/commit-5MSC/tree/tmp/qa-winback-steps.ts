import {
  evaluateWhatsAppWinback,
  type WinbackStep,
} from "../supabase/functions/_shared/whatsapp_winback.ts";

type CaseDef = {
  name: string;
  currentStep: number;
  lastInboundHoursAgo: number;
  lastWinbackHoursAgo?: number;
  platformActive?: boolean;
  probeTextInside24h?: boolean;
};

const text = new TextDecoder();
const enc = new TextEncoder();
const runId = `winback_qa_${Date.now()}`;
const now = new Date();
const apiUrl = "http://127.0.0.1:54321";
const functionsUrl = `${apiUrl}/functions/v1`;

const cases: CaseDef[] = [
  {
    name: "step1_outside_24h",
    currentStep: 0,
    lastInboundHoursAgo: 72,
  },
  {
    name: "step2_outside_24h",
    currentStep: 1,
    lastInboundHoursAgo: 144,
    lastWinbackHoursAgo: 96,
  },
  {
    name: "step3_outside_24h",
    currentStep: 2,
    lastInboundHoursAgo: 240,
    lastWinbackHoursAgo: 120,
  },
  {
    name: "platform_active_blocks",
    currentStep: 0,
    lastInboundHoursAgo: 72,
    platformActive: true,
  },
  {
    name: "within_24h_no_winback",
    currentStep: 0,
    lastInboundHoursAgo: 2,
    probeTextInside24h: true,
  },
];

function isoHoursAgo(hours: number): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function q(value: string | null): string {
  if (value === null) return "null";
  return `'${value.replaceAll("'", "''")}'`;
}

function qJson(value: unknown): string {
  return `${q(JSON.stringify(value))}::jsonb`;
}

async function psql(sql: string): Promise<string> {
  const cmd = new Deno.Command("docker", {
    args: [
      "exec",
      "-i",
      "supabase_db_Sophia_2",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-X",
      "-q",
      "-t",
      "-A",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = cmd.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(enc.encode(sql));
  await writer.close();
  const out = await child.output();
  const stdout = text.decode(out.stdout).trim();
  const stderr = text.decode(out.stderr).trim();
  if (!out.success) {
    throw new Error(`psql failed\nSQL:\n${sql}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }
  return stdout;
}

async function queryJson<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const raw = await psql(
    `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)::text from (${sql}) t;`,
  );
  const last = raw.split("\n").filter(Boolean).at(-1) ?? "[]";
  return JSON.parse(last);
}

function readEnv(name: string): string {
  const envText = Deno.readTextFileSync("supabase/.env");
  const line = envText.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  return (line?.slice(name.length + 1) ?? "").trim();
}

function templateForStep(step: WinbackStep): string {
  if (step === 1) return "sophia_winback_step1_soft";
  if (step === 2) return "sophia_winback_step2_refocus";
  return "sophia_winback_step3_opendoor";
}

async function createQaUser(caseDef: CaseDef, index: number) {
  const id = crypto.randomUUID();
  const email = `winback-qa-${runId}-${caseDef.name}@example.com`;
  const phone = `+3367000${String(index).padStart(4, "0")}`;
  const lastInbound = isoHoursAgo(caseDef.lastInboundHoursAgo);
  const lastWinback = caseDef.lastWinbackHoursAgo == null
    ? null
    : isoHoursAgo(caseDef.lastWinbackHoursAgo);

  await psql(`
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      ${q(id)}::uuid,
      'authenticated',
      'authenticated',
      ${q(email)},
      '',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      ${qJson({ qa_run_id: runId, qa_case: caseDef.name })},
      now(),
      now()
    );

    insert into public.profiles (
      id,
      email,
      full_name,
      phone_number,
      timezone,
      locale,
      whatsapp_opted_in,
      phone_invalid,
      whatsapp_last_inbound_at,
      whatsapp_last_outbound_at,
      whatsapp_bilan_opted_in,
      whatsapp_bilan_paused_until,
      whatsapp_bilan_missed_streak,
      whatsapp_bilan_winback_step,
      whatsapp_bilan_last_winback_at,
      whatsapp_coaching_paused_until,
      access_tier,
      trial_end,
      updated_at
    ) values (
      ${q(id)}::uuid,
      ${q(email)},
      ${q(`QA ${caseDef.name}`)},
      ${q(phone)},
      'Europe/Paris',
      'fr-FR',
      true,
      false,
      ${q(lastInbound)}::timestamptz,
      null,
      true,
      null,
      0,
      ${caseDef.currentStep},
      ${lastWinback == null ? "null" : `${q(lastWinback)}::timestamptz`},
      null,
      'alliance',
      (now() + interval '30 days'),
      now()
    )
    on conflict (id) do update set
      email = excluded.email,
      full_name = excluded.full_name,
      phone_number = excluded.phone_number,
      timezone = excluded.timezone,
      locale = excluded.locale,
      whatsapp_opted_in = excluded.whatsapp_opted_in,
      phone_invalid = excluded.phone_invalid,
      whatsapp_last_inbound_at = excluded.whatsapp_last_inbound_at,
      whatsapp_last_outbound_at = excluded.whatsapp_last_outbound_at,
      whatsapp_bilan_opted_in = excluded.whatsapp_bilan_opted_in,
      whatsapp_bilan_paused_until = excluded.whatsapp_bilan_paused_until,
      whatsapp_bilan_missed_streak = excluded.whatsapp_bilan_missed_streak,
      whatsapp_bilan_winback_step = excluded.whatsapp_bilan_winback_step,
      whatsapp_bilan_last_winback_at = excluded.whatsapp_bilan_last_winback_at,
      whatsapp_coaching_paused_until = excluded.whatsapp_coaching_paused_until,
      access_tier = excluded.access_tier,
      trial_end = excluded.trial_end,
      updated_at = now();
  `);

  if (caseDef.platformActive) {
    await psql(`
      insert into public.chat_messages (
        id,
        user_id,
        role,
        content,
        metadata,
        created_at,
        scope
      ) values (
        ${q(crypto.randomUUID())}::uuid,
        ${q(id)}::uuid,
        'user',
        'Activite plateforme QA recente',
        ${qJson({ qa_run_id: runId, qa_case: caseDef.name })},
        now(),
        'web'
      );
    `);
  }

  return { id, email, phone, lastInbound, lastWinback };
}

async function recentPlatformActivity(userId: string) {
  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const rows = await queryJson<{ source: string; at: string }>(`
    select source, at
    from (
      select 'chat_messages:' || scope as source, created_at as at
      from public.chat_messages
      where user_id = ${q(userId)}::uuid
        and role = 'user'
        and scope <> 'whatsapp'
        and created_at >= ${q(since)}::timestamptz
      union all
      select 'user_chat_states:' || scope as source, updated_at as at
      from public.user_chat_states
      where user_id = ${q(userId)}::uuid
        and scope <> 'whatsapp'
        and updated_at >= ${q(since)}::timestamptz
    ) events
    order by at desc
    limit 1
  `);
  return rows[0] ?? null;
}

async function callWhatsappSend(payload: unknown) {
  const secret = readEnv("INTERNAL_FUNCTION_SECRET");
  const res = await fetch(`${functionsUrl}/whatsapp-send`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": secret,
      "x-request-id": `${runId}-${crypto.randomUUID()}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`whatsapp-send failed ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function collectCaseRows(userId: string) {
  const pending = await queryJson(`
    select id, kind, status, payload, processed_at
    from public.whatsapp_pending_actions
    where user_id = ${q(userId)}::uuid
    order by created_at asc
  `);
  const outbound = await queryJson(`
    select id, message_type, status, content_preview, metadata, graph_payload
    from public.whatsapp_outbound_messages
    where metadata->>'qa_run_id' = ${q(runId)}
      and metadata->>'qa_user_id' = ${q(userId)}
    order by created_at asc
  `);
  const chat = await queryJson(`
    select id, scope, role, content, metadata
    from public.chat_messages
    where user_id = ${q(userId)}::uuid
      and metadata->>'qa_run_id' = ${q(runId)}
    order by created_at asc
  `);
  const profile = await queryJson(`
    select whatsapp_bilan_winback_step, whatsapp_bilan_last_winback_at, whatsapp_last_outbound_at
    from public.profiles
    where id = ${q(userId)}::uuid
  `);
  return { pending, outbound, chat, profile: profile[0] ?? null };
}

async function runCase(caseDef: CaseDef, index: number) {
  const user = await createQaUser(caseDef, index);
  const evaluation = evaluateWhatsAppWinback({
    whatsappBilanOptedIn: true,
    whatsappBilanPausedUntil: null,
    whatsappCoachingPausedUntil: null,
    whatsappLastInboundAt: user.lastInbound,
    whatsappBilanWinbackStep: caseDef.currentStep,
    whatsappBilanLastWinbackAt: user.lastWinback,
    now,
  });

  const result: Record<string, unknown> = {
    case: caseDef.name,
    user_id: user.id,
    email: user.email,
    initial_step: caseDef.currentStep,
    last_inbound_at: user.lastInbound,
    last_winback_at: user.lastWinback,
    evaluation,
  };

  const platformActivity = await recentPlatformActivity(user.id);
  result.platform_activity = platformActivity;

  if (evaluation.decision === "send" && evaluation.step && !platformActivity) {
    const templateName = templateForStep(evaluation.step);
    const pendingId = crypto.randomUUID();
    const payload = {
      purpose: "daily_bilan_winback",
      message: {
        type: "template",
        name: templateName,
        language: "fr",
      },
      require_opted_in: true,
      force_template: true,
      metadata_extra: {
        source: "qa_winback_harness",
        qa_run_id: runId,
        qa_case: caseDef.name,
        qa_user_id: user.id,
        winback_step: evaluation.step,
        winback_reason: evaluation.reason,
        inactivity_days: evaluation.inactivity_days,
        platform_activity_window_hours: 48,
      },
      dedupe_key: `daily_bilan_winback:${user.id}:${evaluation.step}:qa`,
    };

    await psql(`
      insert into public.whatsapp_pending_actions (
        id,
        user_id,
        kind,
        status,
        payload,
        expires_at,
        created_at
      ) values (
        ${q(pendingId)}::uuid,
        ${q(user.id)}::uuid,
        'proactive_template_candidate',
        'pending',
        ${qJson(payload)},
        (now() + interval '24 hours'),
        now()
      );

      update public.profiles
      set whatsapp_bilan_missed_streak = 0,
          whatsapp_bilan_winback_step = ${evaluation.step},
          whatsapp_bilan_last_winback_at = now(),
          updated_at = now()
      where id = ${q(user.id)}::uuid;
    `);

    const sendResponse = await callWhatsappSend({
      user_id: user.id,
      message: payload.message,
      purpose: payload.purpose,
      require_opted_in: payload.require_opted_in,
      force_template: payload.force_template,
      metadata_extra: {
        ...payload.metadata_extra,
        proactive_candidate_id: pendingId,
      },
    });

    await psql(`
      update public.whatsapp_pending_actions
      set status = ${sendResponse.skipped ? "'cancelled'" : "'done'"},
          processed_at = now()
      where id = ${q(pendingId)}::uuid
        and status = 'pending';
    `);

    result.sent_template = templateName;
    result.send_response = sendResponse;
  } else {
    result.sent_template = null;
    result.skip_reason = platformActivity
      ? "platform_activity_recent"
      : evaluation.reason;
  }

  if (caseDef.probeTextInside24h) {
    result.inside_24h_text_probe = await callWhatsappSend({
      user_id: user.id,
      message: {
        type: "text",
        body: "Probe QA dans la fenetre 24h",
      },
      purpose: "qa_24h_probe",
      require_opted_in: true,
      force_template: false,
      metadata_extra: {
        qa_run_id: runId,
        qa_case: caseDef.name,
        qa_user_id: user.id,
        source: "qa_winback_harness",
      },
    });
  }

  result.rows = await collectCaseRows(user.id);
  return result;
}

async function cleanup(userIds: string[]) {
  const ids = userIds.map((id) => `${q(id)}::uuid`).join(",");
  if (!ids) return;
  await psql(`
    delete from public.whatsapp_outbound_messages
    where metadata->>'qa_run_id' = ${q(runId)};

    delete from auth.users
    where id in (${ids})
      and email like ${q(`winback-qa-${runId}-%@example.com`)};
  `);
}

const userIds: string[] = [];
try {
  const results = [];
  for (let i = 0; i < cases.length; i++) {
    const result = await runCase(cases[i], i + 1);
    userIds.push(String(result.user_id));
    results.push(result);
  }

  const summary = results.map((result) => {
    const rows = result.rows as any;
    const outbound = rows?.outbound?.[0] ?? null;
    const profile = rows?.profile ?? null;
    const send = result.send_response as any;
    const probe = result.inside_24h_text_probe as any;
    return {
      case: result.case,
      decision: (result.evaluation as any).decision,
      reason: (result.evaluation as any).reason,
      expected_step: (result.evaluation as any).step ?? null,
      sent_template: result.sent_template,
      send_used_template: send?.used_template ?? null,
      send_in_24h_window: send?.in_24h_window ?? null,
      outbound_message_type: outbound?.message_type ?? null,
      outbound_status: outbound?.status ?? null,
      profile_step_after: profile?.whatsapp_bilan_winback_step ?? null,
      platform_activity: result.platform_activity,
      skip_reason: result.skip_reason ?? null,
      inside_24h_text_probe: probe
        ? {
          used_template: probe.used_template,
          in_24h_window: probe.in_24h_window,
          simulated_whatsapp: probe.simulated_whatsapp,
        }
        : null,
    };
  });

  console.log(JSON.stringify({ run_id: runId, summary, results }, null, 2));
} finally {
  await cleanup(userIds);
}
