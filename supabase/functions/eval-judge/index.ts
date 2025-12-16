/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z, getRequestId, jsonResponse, parseJsonBody, serverError } from "../_shared/http.ts";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
import { sumUsageByRequestId } from "../_shared/llm-usage.ts";

type TranscriptMsg = {
  role: "user" | "assistant";
  content: string;
  agent_used?: string | null;
  created_at?: string | null;
};

function isMegaEnabled(): boolean {
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
  return megaRaw === "1" || (megaRaw === "" && isLocalSupabase);
}

function tokenEstimateFromText(text: string): number {
  // Very rough: ~4 chars per token for latin text.
  const chars = (text ?? "").length;
  return Math.max(1, Math.ceil(chars / 4));
}

function ruleBasedIssues(params: {
  transcript: TranscriptMsg[];
  state_before?: any;
}): any[] {
  const { transcript, state_before } = params;
  const issues: any[] = [];

  // 1) Forbidden bold markdown
  for (const m of transcript) {
    if (m.role === "assistant" && (m.content ?? "").includes("**")) {
      issues.push({
        code: "forbidden_markdown_bold",
        severity: "medium",
        message: "L'assistant utilise du gras (**), interdit par les règles de style.",
        evidence: { agent_used: m.agent_used, snippet: (m.content ?? "").slice(0, 240) },
      });
      break;
    }
  }

  // 2) Mid-conversation greetings
  const firstAssistantIdx = transcript.findIndex((m) => m.role === "assistant");
  if (firstAssistantIdx >= 0) {
    for (let i = firstAssistantIdx + 1; i < transcript.length; i++) {
      const m = transcript[i];
      if (m.role !== "assistant") continue;
      const lower = (m.content ?? "").toLowerCase();
      if (/\b(bonjour|salut|hello)\b/.test(lower)) {
        issues.push({
          code: "mid_conversation_greeting",
          severity: "low",
          message: 'L’assistant dit "bonjour/salut" au milieu d’une conversation (souvent interdit).',
          evidence: { index: i, agent_used: m.agent_used, snippet: (m.content ?? "").slice(0, 240) },
        });
        break;
      }
    }
  }

  // 3) Vouvoiement (heuristic)
  for (const m of transcript) {
    if (m.role !== "assistant") continue;
    const lower = (m.content ?? "").toLowerCase();
    if (/\b(vous|votre|vos)\b/.test(lower)) {
      issues.push({
        code: "vouvoiement_detected",
        severity: "medium",
        message: "Vouvoiement détecté (vous/votre/vos). La plupart des modes exigent le tutoiement.",
        evidence: { agent_used: m.agent_used, snippet: (m.content ?? "").slice(0, 240) },
      });
      break;
    }
  }

  // 4) Checkup routing stability (if investigation_state active)
  if (state_before?.investigation_state) {
    const hasStop = transcript.some((m) =>
      m.role === "user" && /\b(stop|arr[êe]te|on arr[êe]te|pause)\b/i.test(m.content ?? "")
    );
    if (!hasStop) {
      const bad = transcript.find((m) => m.role === "assistant" && m.agent_used && m.agent_used !== "investigator");
      if (bad) {
        issues.push({
          code: "checkup_routing_break",
          severity: "high",
          message:
            "Investigation state actif: l’agent devrait rester sur investigator (sauf stop explicite). Un autre mode a répondu.",
          evidence: { agent_used: bad.agent_used, snippet: (bad.content ?? "").slice(0, 240) },
        });
      }
    }
  }

  return issues;
}

function ruleBasedSuggestions(issues: any[]): any[] {
  const suggestions: any[] = [];
  if (issues.some((i) => i.code === "mid_conversation_greeting")) {
    suggestions.push({
      prompt_key: "sophia.companion",
      action: "append",
      proposed_addendum:
        'RÈGLE PRIORITAIRE: Ne dis jamais "bonjour/salut/hello" si la conversation a déjà démarré. À la place, rebondis directement sur le dernier message.',
      rationale: "Réduit les incohérences de ton et évite la répétition de salutations.",
    });
  }
  if (issues.some((i) => i.code === "vouvoiement_detected")) {
    suggestions.push({
      prompt_key: "sophia.investigator",
      action: "append",
      proposed_addendum: 'CONTRAINTE: Tu tutoies toujours. Remplace tout "vous/votre/vos" par "tu/ton/tes".',
      rationale: "Uniformise le style et évite les ruptures de persona.",
    });
  }
  if (issues.some((i) => i.code === "checkup_routing_break")) {
    suggestions.push({
      prompt_key: "sophia.dispatcher",
      action: "append",
      proposed_addendum:
        "STABILITÉ CHECKUP (RENFORCÉE): Si investigation_state est actif, tu renvoies investigator dans 100% des cas, sauf si l’utilisateur demande explicitement d’arrêter le bilan.",
      rationale: "Garantit la stabilité de l’investigation malgré digressions.",
    });
  }
  return suggestions;
}

const BodySchema = z.object({
  dataset_key: z.string().min(1),
  scenario_key: z.string().min(1),
  tags: z.array(z.string()).optional(),
  force_real_ai: z.boolean().optional(),
  transcript: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      agent_used: z.string().nullable().optional(),
      created_at: z.string().nullable().optional(),
    }),
  ),
  state_before: z.any().optional(),
  state_after: z.any().optional(),
  config: z.any().optional(),
  assertions: z
    .object({
      // Expected sequence constraints (best effort)
      must_include_agent: z.array(z.string()).optional(),
      must_not_include_agent: z.array(z.string()).optional(),
      // Content checks (regex strings, JS style)
      assistant_must_not_match: z.array(z.string()).optional(),
      assistant_must_match: z.array(z.string()).optional(),
      // State invariants
      requires_investigation_state_active: z.boolean().optional(),
      must_keep_investigator_until_stop: z.boolean().optional(),
      // Stop tokens for the user (if present, allow leaving investigator)
      stop_regex: z.string().optional(),
    })
    .passthrough()
    .optional(),
  eval_run_id: z.string().uuid().optional(),
});

console.log("eval-judge: Function initialized");

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    if (req.method === "OPTIONS") return handleCorsOptions(req);
    const corsErr = enforceCors(req);
    if (corsErr) return corsErr;
    if (req.method !== "POST") return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });

    const parsed = await parseJsonBody(req, BodySchema, requestId);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const authHeader = req.headers.get("Authorization") ?? "";
    const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
    const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
    if (!url || !anonKey || !serviceKey) return serverError(req, requestId, "Server misconfigured");

    // Authenticate caller
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    const userId = auth.user.id;

    // Admin gate (RLS allows reading own row)
    const { data: adminRow } = await userClient.from("internal_admins").select("user_id").eq("user_id", userId).maybeSingle();
    if (!adminRow) return jsonResponse(req, { error: "Forbidden", request_id: requestId }, { status: 403 });

    // Service role client for writing eval artifacts atomically
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // Create or update run row
    let runId = body.eval_run_id ?? null;
    if (!runId) {
      const { data: inserted, error: insErr } = await admin
        .from("conversation_eval_runs")
        .insert({
          dataset_key: body.dataset_key,
          scenario_key: body.scenario_key,
          status: "running",
          created_by: userId,
          config: body.config ?? {},
          transcript: body.transcript,
          state_before: body.state_before ?? null,
          state_after: body.state_after ?? null,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      runId = inserted.id as string;
    } else {
      await admin
        .from("conversation_eval_runs")
        .update({
          dataset_key: body.dataset_key,
          scenario_key: body.scenario_key,
          status: "running",
          config: body.config ?? {},
          transcript: body.transcript,
          state_before: body.state_before ?? null,
          state_after: body.state_after ?? null,
          created_by: userId,
        })
        .eq("id", runId);
    }

    // Compute issues/suggestions
    const issues = ruleBasedIssues({ transcript: body.transcript, state_before: body.state_before });

    // Deterministic assertions: machine-checkable success/failure with explicit reasons.
    const assertions = body.assertions ?? {};
    try {
      const assistantMsgs = (body.transcript ?? []).filter((m) => m.role === "assistant");
      const assistantText = assistantMsgs.map((m) => m.content ?? "").join("\n");
      const agentUsedSeq = assistantMsgs.map((m) => (m as any).agent_used).filter(Boolean);

      const fail = (code: string, message: string, evidence?: any) => {
        issues.push({ code, severity: "high", message, evidence: evidence ?? {} });
      };

      // Agent inclusion/exclusion
      if (Array.isArray(assertions.must_include_agent)) {
        for (const a of assertions.must_include_agent) {
          if (!agentUsedSeq.includes(a)) {
            fail("assert_missing_agent", `Assertion failed: must include agent "${a}"`, { agent_sequence: agentUsedSeq });
          }
        }
      }
      if (Array.isArray(assertions.must_not_include_agent)) {
        for (const a of assertions.must_not_include_agent) {
          if (agentUsedSeq.includes(a)) {
            fail("assert_forbidden_agent", `Assertion failed: must NOT include agent "${a}"`, { agent_sequence: agentUsedSeq });
          }
        }
      }

      // Regex checks
      if (Array.isArray(assertions.assistant_must_not_match)) {
        for (const pat of assertions.assistant_must_not_match) {
          const re = new RegExp(pat, "i");
          if (re.test(assistantText)) {
            fail("assert_forbidden_pattern", `Assertion failed: assistant must NOT match /${pat}/`, {
              pattern: pat,
              snippet: assistantText.slice(0, 240),
            });
          }
        }
      }
      if (Array.isArray(assertions.assistant_must_match)) {
        for (const pat of assertions.assistant_must_match) {
          const re = new RegExp(pat, "i");
          if (!re.test(assistantText)) {
            fail("assert_missing_pattern", `Assertion failed: assistant must match /${pat}/`, {
              pattern: pat,
              snippet: assistantText.slice(0, 240),
            });
          }
        }
      }

      // Investigation-state invariants
      if (assertions.requires_investigation_state_active && !body.state_before?.investigation_state) {
        fail("assert_state_precondition_failed", "Scenario expected investigation_state active, but state_before.investigation_state was null.");
      }
      if (assertions.must_keep_investigator_until_stop && body.state_before?.investigation_state) {
        const stopRe = new RegExp(assertions.stop_regex ?? "\\b(stop|arr[êe]te|on arr[êe]te|pause)\\b", "i");
        const userHasStop = (body.transcript ?? []).some((m) => m.role === "user" && stopRe.test(m.content ?? ""));
        if (!userHasStop) {
          const nonInv = assistantMsgs.find((m) => (m as any).agent_used && (m as any).agent_used !== "investigator");
          if (nonInv) {
            fail(
              "assert_investigator_not_stable",
              "Assertion failed: investigation_state active => should remain investigator until explicit stop.",
              { offending_agent: (nonInv as any).agent_used, snippet: (nonInv.content ?? "").slice(0, 240) },
            );
          }
        }
      }
    } catch (e) {
      issues.push({
        code: "assertion_engine_error",
        severity: "low",
        message: "Assertion engine error (non-blocking).",
        evidence: { error: String(e).slice(0, 200) },
      });
    }
    let suggestions = ruleBasedSuggestions(issues);

    // Optional: LLM judge enrichment (disabled in MEGA_TEST_MODE unless force_real_ai)
    let judgeLlmUsed = false;
    const allowReal = Boolean(body.force_real_ai);
    if (!isMegaEnabled() || allowReal) {
      try {
        judgeLlmUsed = true;
        const systemPrompt = `
Tu es un "QA Judge" pour l'assistant Sophia.
Tu analyses un transcript de conversation et tu renvoies UNIQUEMENT du JSON.

Objectifs:
- Repérer incohérences, violations de règles, erreurs de routing (investigation_state), ton, hallucinations.
- Proposer des améliorations sous forme d'ADDENDUM à APPENDRE/REMPLACER dans les prompt_overrides.

Règles:
- Propose des addendums courts, actionnables, testables.
- Cible un prompt_key parmi:
  - sophia.dispatcher
  - sophia.investigator
  - sophia.companion
  - sophia.architect
  - sophia.firefighter
  - sophia.sentry

Format attendu:
{
  "issues": [
    { "code": "string", "severity": "low|medium|high", "message": "string", "evidence": { "snippet": "string", "agent_used": "string|null" } }
  ],
  "suggestions": [
    { "prompt_key": "string", "action": "append|replace", "proposed_addendum": "string", "rationale": "string" }
  ]
}
        `.trim();
        const transcriptText = body.transcript
          .map((m) => `${m.role.toUpperCase()}${m.agent_used ? `(${m.agent_used})` : ""}: ${m.content}`)
          .join("\n");
        const out = await generateWithGemini(systemPrompt, transcriptText, 0.2, true, [], "auto", {
          requestId,
          model: "gemini-2.0-flash",
          source: "eval-judge",
          forceRealAi: allowReal,
        });
        const parsedJudge = JSON.parse(out as string);
        if (Array.isArray(parsedJudge?.issues)) {
          for (const i of parsedJudge.issues) issues.push(i);
        }
        if (Array.isArray(parsedJudge?.suggestions)) {
          for (const s of parsedJudge.suggestions) suggestions.push(s);
        }
      } catch (e) {
        // Don't fail the whole run if judge fails; store error into metrics
        suggestions = suggestions.map((s) => s);
        issues.push({
          code: "judge_error",
          severity: "low",
          message: "Le juge IA a échoué (fallback sur règles locales).",
          evidence: { snippet: String(e).slice(0, 200) },
        });
      }
    }

    // Normalize suggestions
    const normalizedSuggestions = (suggestions ?? [])
      .filter((s: any) => s && typeof s.prompt_key === "string" && typeof s.proposed_addendum === "string")
      .map((s: any) => ({
        prompt_key: String(s.prompt_key),
        action: s.action === "replace" ? "replace" : "append",
        proposed_addendum: String(s.proposed_addendum).trim(),
        rationale: s.rationale ? String(s.rationale) : null,
      }))
      .filter((s: any) => s.proposed_addendum.length > 0);

    // Persist eval results
    // Prefer exact usage logged by gemini.ts (usageMetadata). Fallback to 0 if unavailable.
    const summed = await sumUsageByRequestId(requestId);

    await admin
      .from("conversation_eval_runs")
      .update({
        status: "completed",
        issues,
        suggestions: normalizedSuggestions,
        metrics: {
          request_id: requestId,
          mega_test_mode: isMegaEnabled(),
          judge_llm_used: judgeLlmUsed,
          prompt_tokens: summed.prompt_tokens,
          output_tokens: summed.output_tokens,
          total_tokens: summed.total_tokens,
          cost_usd: summed.cost_usd,
        },
      })
      .eq("id", runId);

    // Persist suggestions for UI workflow (dedupe-ish: insert as new rows each run)
    if (normalizedSuggestions.length > 0) {
      const rows = normalizedSuggestions.map((s: any) => ({
        created_by: userId,
        eval_run_id: runId,
        prompt_key: s.prompt_key,
        action: s.action,
        proposed_addendum: s.proposed_addendum,
        rationale: s.rationale,
        status: "pending",
      }));
      await admin.from("prompt_override_suggestions").insert(rows);
    }

    return jsonResponse(req, {
      success: true,
      request_id: requestId,
      eval_run_id: runId,
      issues,
      suggestions: normalizedSuggestions,
      metrics: {
        mega_test_mode: isMegaEnabled(),
        judge_llm_used: judgeLlmUsed,
        prompt_tokens: summed.prompt_tokens,
        output_tokens: summed.output_tokens,
        total_tokens: summed.total_tokens,
        cost_usd: summed.cost_usd,
      },
    });
  } catch (error) {
    console.error(`[eval-judge] request_id=${requestId}`, error);
    return serverError(req, requestId);
  }
});


