// Real-conditions test: re-run the (fixed) level-tools + professional-support
// classification against the real active plan, using the service-role admin client.
// Run: deno run -A --env-file=supabase/.env tmp/diag/test_classify.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  classifyAndPersistLevelToolRecommendations,
  loadLevelToolRecommendationPlanContext,
} from "../../supabase/functions/_shared/level-tool-recommendations-v1.ts";
import {
  classifyAndPersistProfessionalSupport,
  loadProfessionalSupportPlanContext,
} from "../../supabase/functions/_shared/professional-support-v2.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const USER = "92862ab2-13bf-4b42-afe0-c6c3f29d8514";
const TRANSFO = "7688f403-be6c-44fd-9f0f-569aa6b305ae";

const admin = createClient(URL_, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log("=== LEVEL TOOLS (fixed) ===");
try {
  const ctx = await loadLevelToolRecommendationPlanContext({
    admin,
    userId: USER,
    transformationId: TRANSFO,
  });
  const res = await classifyAndPersistLevelToolRecommendations({
    admin,
    requestId: "diag-test-lt",
    userId: USER,
    cycle: ctx.cycle,
    transformation: ctx.transformation,
    planRow: ctx.planRow,
    plan: ctx.plan,
  });
  console.log(JSON.stringify({
    ok: true,
    persisted_count: res.recommendations.length,
    confidence_scores: res.recommendations.map((r) => r.confidence_score),
    levels: res.state.levels,
  }, null, 2));
} catch (e) {
  console.log("LEVEL TOOLS FAILED:", e instanceof Error ? e.message : String(e));
  console.log((e as { cause?: unknown })?.cause ?? "");
}

console.log("\n=== PROFESSIONAL SUPPORT (fixed) ===");
try {
  const ctx = await loadProfessionalSupportPlanContext({
    admin,
    userId: USER,
    transformationId: TRANSFO,
  });
  const res = await classifyAndPersistProfessionalSupport({
    admin,
    requestId: "diag-test-ps",
    userId: USER,
    cycle: ctx.cycle,
    transformation: ctx.transformation,
    planRow: ctx.planRow,
    plan: ctx.plan,
  });
  console.log(JSON.stringify({
    ok: true,
    should_recommend: res.professionalSupport.should_recommend,
    persisted_count: res.recommendations.length,
    recs: res.recommendations.map((r) => ({
      key: r.professional_key,
      rank: r.priority_rank,
      timing: r.timing_kind,
      level: r.target_level_order,
    })),
  }, null, 2));
} catch (e) {
  console.log("PRO SUPPORT FAILED:", e instanceof Error ? e.message : String(e));
  console.log((e as { cause?: unknown })?.cause ?? "");
}
