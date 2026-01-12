export function buildMechanicalIssues(params: {
  scenario: any;
  profileAfter: any;
  transcript: any[];
}): any[] {
  const out: any[] = [];
  const mech = (params.scenario as any)?.mechanical_assertions ?? null;
  if (!mech || typeof mech !== "object") return out;

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



