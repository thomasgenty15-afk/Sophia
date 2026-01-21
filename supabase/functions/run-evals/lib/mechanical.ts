import { generateEmbedding } from "../../_shared/gemini.ts";

export async function buildMechanicalIssues(params: {
  scenario: any;
  profileAfter: any;
  chatStateAfter?: any;
  planSnapshotAfter?: any;
  transcript: any[];
  judgeEvents?: any[];
  evalEvents?: any[];
}): Promise<any[]> {
  const out: any[] = [];
  const mech = (params.scenario as any)?.mechanical_assertions ?? null;
  if (!mech || typeof mech !== "object") return out;

  function normalizeString(x: any): string {
    return String(x ?? "").trim();
  }

  function normalizeStringLower(x: any): string {
    return normalizeString(x).toLowerCase();
  }

  function getByDotPath(obj: any, path: string): any {
    const p = normalizeString(path);
    if (!p) return undefined;
    const parts = p.split(".").map((s) => s.trim()).filter(Boolean);
    let cur: any = obj;
    for (const k of parts) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = (cur as any)[k];
    }
    return cur;
  }

  function shallowMatchObject(hay: any, needle: any): boolean {
    if (!needle || typeof needle !== "object") return false;
    if (!hay || typeof hay !== "object") return false;
    for (const [k, v] of Object.entries(needle)) {
      const actual = (hay as any)[k];
      if (Array.isArray(v)) {
        // Back-compat: arrays are used as "one of" for string fields (ex: title/time_of_day).
        // New behavior: if the actual value is also an array (ex: scheduled_days),
        // treat the expected array as a case-insensitive subset that must be included.
        if (Array.isArray(actual)) {
          const actualSet = new Set((actual ?? []).map((x: any) => normalizeStringLower(x)));
          const ok = (v ?? []).every((x: any) => actualSet.has(normalizeStringLower(x)));
          if (!ok) return false;
        } else {
          const actualNorm = normalizeStringLower(actual);
          const ok = v.some((x) => normalizeStringLower(x) === actualNorm);
          if (!ok) return false;
        }
      } else if (typeof v === "string") {
        if (normalizeStringLower(actual) !== normalizeStringLower(v)) return false;
      } else if (typeof v === "number") {
        if (Number(actual) !== v) return false;
      } else {
        if (actual !== v) return false;
      }
    }
    return true;
  }

  const profEq = (mech as any)?.profile_equals;
  if (profEq && typeof profEq === "object") {
    for (const [k, v] of Object.entries(profEq)) {
      const actual = (params.profileAfter as any)?.[k];
      const ok = actual === v;
      if (!ok) {
        out.push({
          severity: "high",
          kind: "mechanical_assertion_failed",
          message: `profiles.${k} expected=${JSON.stringify(v)} actual=${JSON.stringify(actual)}`,
        });
      }
    }
  }

  // Chat-state (user_chat_states) assertions: target temp_memory and other fields.
  const chatEq = (mech as any)?.chat_state_equals;
  if (chatEq && typeof chatEq === "object") {
    const st = params.chatStateAfter ?? null;
    for (const [k, v] of Object.entries(chatEq)) {
      const actual = (st as any)?.[k];
      const ok = actual === v;
      if (!ok) {
        out.push({
          severity: "high",
          kind: "mechanical_assertion_failed",
          message: `user_chat_states.${k} expected=${JSON.stringify(v)} actual=${JSON.stringify(actual)}`,
        });
      }
    }
  }

  const tmEq = (mech as any)?.chat_state_temp_memory_equals;
  if (tmEq && typeof tmEq === "object") {
    const tm = (params.chatStateAfter as any)?.temp_memory ?? null;
    for (const [path, v] of Object.entries(tmEq)) {
      const actual = getByDotPath(tm, String(path));
      const ok = actual === v;
      if (!ok) {
        out.push({
          severity: "high",
          kind: "mechanical_assertion_failed",
          message: `temp_memory.${String(path)} expected=${JSON.stringify(v)} actual=${JSON.stringify(actual)}`,
        });
      }
    }
  }

  const tmExists = Array.isArray((mech as any)?.chat_state_temp_memory_paths_exist)
    ? (mech as any).chat_state_temp_memory_paths_exist
    : [];
  if (tmExists.length > 0) {
    const tm = (params.chatStateAfter as any)?.temp_memory ?? null;
    for (const rawPath of tmExists) {
      const p = String(rawPath ?? "").trim();
      if (!p) continue;
      const actual = getByDotPath(tm, p);
      if (actual === undefined) {
        out.push({
          severity: "high",
          kind: "mechanical_assertion_failed",
          message: `temp_memory path missing: ${p}`,
        });
      }
    }
  }

  // Array existence assertions for temp_memory (useful for supervisor.stack sessions):
  // mech.chat_state_temp_memory_array_some_match = [{ path: "supervisor.stack", match: { type: "topic_session" } }]
  const tmArraySome = Array.isArray((mech as any)?.chat_state_temp_memory_array_some_match)
    ? (mech as any).chat_state_temp_memory_array_some_match
    : [];
  if (tmArraySome.length > 0) {
    const tm = (params.chatStateAfter as any)?.temp_memory ?? null;
    for (const raw of tmArraySome) {
      const path = String((raw as any)?.path ?? "").trim();
      const match = (raw as any)?.match ?? null;
      if (!path || !match || typeof match !== "object") continue;
      const actual = getByDotPath(tm, path);
      if (!Array.isArray(actual)) {
        out.push({
          severity: "high",
          kind: "mechanical_assertion_failed",
          message: `temp_memory.${path} expected=array actual=${typeof actual}`,
        });
        continue;
      }
      const ok = (actual as any[]).some((x) => shallowMatchObject(x, match));
      if (!ok) {
        out.push({
          severity: "high",
          kind: "mechanical_assertion_failed",
          message: `temp_memory.${path} expected some match: ${JSON.stringify(match)}`,
        });
      }
    }
  }

  // Plan snapshot assertions (post-conversation): covers tools like create/update/archive/breakdown.
  const plan = params.planSnapshotAfter ?? null;
  const planActions = Array.isArray((plan as any)?.actions) ? (plan as any).actions : [];
  const planFrameworks = Array.isArray((plan as any)?.frameworks) ? (plan as any).frameworks : [];

  const actionsCountMin = (mech as any)?.plan_actions_count_min;
  if (actionsCountMin != null) {
    const n = Number(actionsCountMin);
    if (Number.isFinite(n) && planActions.length < n) {
      out.push({
        severity: "high",
        kind: "mechanical_assertion_failed",
        message: `plan_actions_count_min failed: expected>=${n} actual=${planActions.length}`,
      });
    }
  }

  const actionsMustInclude = Array.isArray((mech as any)?.plan_actions_must_include) ? (mech as any).plan_actions_must_include : [];
  for (const expected of actionsMustInclude) {
    const ok = planActions.some((a: any) => shallowMatchObject(a, expected));
    if (!ok) {
      out.push({
        severity: "high",
        kind: "mechanical_assertion_failed",
        message: `plan_actions_must_include failed: ${JSON.stringify(expected)}`,
      });
    }
  }

  const actionsMustNotInclude = Array.isArray((mech as any)?.plan_actions_must_not_include)
    ? (mech as any).plan_actions_must_not_include
    : [];
  for (const forbidden of actionsMustNotInclude) {
    const bad = planActions.find((a: any) => shallowMatchObject(a, forbidden));
    if (bad) {
      out.push({
        severity: "high",
        kind: "mechanical_assertion_failed",
        message: `plan_actions_must_not_include failed: forbidden=${JSON.stringify(forbidden)} matched=${JSON.stringify({
          title: bad?.title ?? null,
          status: bad?.status ?? null,
          tracking_type: bad?.tracking_type ?? null,
          target_reps: (bad as any)?.target_reps ?? null,
        })}`,
      });
    }
  }

  const frameworksMustInclude = Array.isArray((mech as any)?.plan_frameworks_must_include)
    ? (mech as any).plan_frameworks_must_include
    : [];
  for (const expected of frameworksMustInclude) {
    const ok = planFrameworks.some((f: any) => shallowMatchObject(f, expected));
    if (!ok) {
      out.push({
        severity: "high",
        kind: "mechanical_assertion_failed",
        message: `plan_frameworks_must_include failed: ${JSON.stringify(expected)}`,
      });
    }
  }

  const mustMatch = Array.isArray((mech as any)?.assistant_must_match) ? (mech as any).assistant_must_match : [];
  if (mustMatch.length > 0) {
    const assistantText = (params.transcript ?? [])
      .filter((m: any) => m?.role === "assistant")
      .map((m: any) => String(m?.content ?? ""))
      .join("\n");
    for (const reRaw of mustMatch) {
      try {
        const re = new RegExp(String(reRaw), "i");
        if (!re.test(assistantText)) {
          out.push({
            severity: "high",
            kind: "mechanical_assertion_failed",
            message: `assistant_must_match failed: /${String(reRaw)}/i`,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        out.push({
          severity: "high",
          kind: "mechanical_assertion_invalid_regex",
          message: `assistant_must_match invalid regex: /${String(reRaw)}/i (${msg})`,
        });
      }
    }
  }

  const mustNotMatch = Array.isArray((mech as any)?.assistant_must_not_match) ? (mech as any).assistant_must_not_match : [];
  if (mustNotMatch.length > 0) {
    const assistantText = (params.transcript ?? [])
      .filter((m: any) => m?.role === "assistant")
      .map((m: any) => String(m?.content ?? ""))
      .join("\n");
    for (const reRaw of mustNotMatch) {
      try {
        const re = new RegExp(String(reRaw), "i");
        if (re.test(assistantText)) {
          out.push({
            severity: "high",
            kind: "mechanical_assertion_failed",
            message: `assistant_must_not_match failed: /${String(reRaw)}/i`,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        out.push({
          severity: "high",
          kind: "mechanical_assertion_invalid_regex",
          message: `assistant_must_not_match invalid regex: /${String(reRaw)}/i (${msg})`,
        });
      }
    }
  }

  function cosineSim(a: number[], b: number[]): number {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) return 0;
    const n = Math.min(a.length, b.length);
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < n; i++) {
      const x = Number(a[i]) || 0;
      const y = Number(b[i]) || 0;
      dot += x * y;
      na += x * x;
      nb += y * y;
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    if (!Number.isFinite(denom) || denom <= 0) return 0;
    const s = dot / denom;
    if (!Number.isFinite(s)) return 0;
    return Math.max(-1, Math.min(1, s));
  }

  function extractLastQuestion(text: string): string | null {
    const t = normalizeString(text);
    if (!t.includes("?")) return null;
    const parts = t.split("?");
    if (parts.length < 2) return null;
    const lastStem = parts[parts.length - 2] ?? "";
    const q = `${normalizeString(lastStem)}?`.trim();
    if (q.length < 8) return null;
    return q;
  }

  // Anti-loop helper: cap how many times a regex may appear in the assistant transcript.
  // Example:
  // mech.assistant_regex_max_occurrences = [{ re: "tu veux qu.?on l.?active", max: 1 }]
  const maxOcc = Array.isArray((mech as any)?.assistant_regex_max_occurrences)
    ? (mech as any).assistant_regex_max_occurrences
    : [];
  if (maxOcc.length > 0) {
    const assistantText = (params.transcript ?? [])
      .filter((m: any) => m?.role === "assistant")
      .map((m: any) => String(m?.content ?? ""))
      .join("\n");
    for (const raw of maxOcc) {
      const reRaw = (raw as any)?.re ?? (raw as any)?.regex ?? null;
      const max = Number((raw as any)?.max);
      if (!reRaw || !Number.isFinite(max)) continue;
      try {
        const re = new RegExp(String(reRaw), "ig");
        const hits = assistantText.match(re);
        const count = Array.isArray(hits) ? hits.length : 0;
        if (count > max) {
          out.push({
            severity: "high",
            kind: "mechanical_assertion_failed",
            message: `assistant_regex_max_occurrences failed: /${String(reRaw)}/ig max=${max} actual=${count}`,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        out.push({
          severity: "high",
          kind: "mechanical_assertion_invalid_regex",
          message: `assistant_regex_max_occurrences invalid regex: /${String(reRaw)}/ig (${msg})`,
        });
      }
    }
  }

  // Semantic anti-loop (transversal):
  // (Moved to prod verifier. For evals, prefer checking the prod verifier's judge events deterministically.)

  // Assert that the prod verifier emitted certain issues, as traced into conversation_eval_events
  // (agent_exec logs `event=verifier_issues` with payload.issues for eval runs).
  //
  // Example:
  // mech.eval_events_issues_must_include = ["mech:semantic_repeats_previous_question"]
  const evalMust = Array.isArray((mech as any)?.eval_events_issues_must_include)
    ? (mech as any).eval_events_issues_must_include
    : [];
  if (evalMust.length > 0) {
    const evs = Array.isArray((params as any)?.evalEvents) ? (params as any).evalEvents : [];
    const relevant = evs.filter((e: any) =>
      String(e?.event ?? "") === "verifier_issues" && String(e?.source ?? "").includes("sophia-brain:verifier")
    );
    const allIssues = relevant.flatMap((e: any) => {
      const p = e?.payload ?? null;
      const issues = (p && typeof p === "object") ? (p as any).issues : null;
      return Array.isArray(issues) ? issues.map((x: any) => String(x)) : [];
    });
    for (const rawNeedle of evalMust) {
      const needle = String(rawNeedle ?? "").trim();
      if (!needle) continue;
      const ok = allIssues.some((x: string) => x === needle);
      if (!ok) {
        out.push({
          severity: "high",
          kind: "mechanical_assertion_failed",
          message: `eval_events_issues_must_include failed: missing=${JSON.stringify(needle)}`,
        });
      }
    }
  }

  // Like eval_events_issues_must_include, but passes if ANY ONE of the needles is present.
  // Example:
  // mech.eval_events_issues_must_include_any_of = ["mech:semantic_repeats_previous_question", "mech:repeats_previous_message"]
  const evalMustAny = Array.isArray((mech as any)?.eval_events_issues_must_include_any_of)
    ? (mech as any).eval_events_issues_must_include_any_of
    : [];
  if (evalMustAny.length > 0) {
    const evs = Array.isArray((params as any)?.evalEvents) ? (params as any).evalEvents : [];
    const relevant = evs.filter((e: any) =>
      String(e?.event ?? "") === "verifier_issues" && String(e?.source ?? "").includes("sophia-brain:verifier")
    );
    const allIssues = relevant.flatMap((e: any) => {
      const p = e?.payload ?? null;
      const issues = (p && typeof p === "object") ? (p as any).issues : null;
      return Array.isArray(issues) ? issues.map((x: any) => String(x)) : [];
    });
    const ok = evalMustAny
      .map((x: any) => String(x ?? "").trim())
      .filter(Boolean)
      .some((needle: string) => allIssues.some((x: string) => x === needle));
    if (!ok) {
      out.push({
        severity: "high",
        kind: "mechanical_assertion_failed",
        message: `eval_events_issues_must_include_any_of failed: missing_any_of=${JSON.stringify(evalMustAny)}`,
      });
    }
  }

  return out;
}



