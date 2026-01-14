export function buildMechanicalIssues(params: {
  scenario: any;
  profileAfter: any;
  chatStateAfter?: any;
  planSnapshotAfter?: any;
  transcript: any[];
}): any[] {
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
      if (typeof v === "string") {
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

  return out;
}



