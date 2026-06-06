import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

const PRODUCTION_FILES_WITHOUT_VISIBLE_PROSE_TEMPLATES = [
  "supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff.ts",
  "supabase/functions/sophia-brain/tools/operations/select_state_potion/intake.ts",
  "supabase/functions/sophia-brain/tools/operations/select_state_potion/generator.ts",
  "supabase/functions/sophia-brain/tools/operations/select_state_potion/policy.ts",
  "supabase/functions/sophia-brain/tools/operations/select_state_potion/renderer.ts",
  "supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/clarte_flow.ts",
  "supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/potion_detail_intake.ts",
];

const FORBIDDEN_LEGACY_VISIBLE_SNIPPETS = [
  "Ce que je comprends",
  "Je te conseille de choisir",
  "À mettre dans la plateforme",
  "A mettre dans la plateforme",
  "Pourquoi cette potion",
  "Petit pas immédiat",
  "Petit pas immediat",
  "Potion :",
  "Tu te sens plutot comment ?",
  "Qu'est-ce qui te met le plus sous pression la ?",
  "Phrase de soutien",
  "Micro-action",
  "Reset 2 minutes",
];

const PRODUCTION_FILES_WITHOUT_REGEX_OR_LEGACY_POLICY = [
  "supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff.ts",
  "supabase/functions/sophia-brain/tools/operations/select_state_potion/generator.ts",
  "supabase/functions/sophia-brain/tools/operations/select_state_potion/policy.ts",
];

const FORBIDDEN_RUNTIME_CODE_SNIPPETS = [
  ".test(",
  ".match(",
  ".exec(",
  "replace(/",
  "new RegExp",
  "hardConsentGuards",
  "noPotionReply",
  "buildExplicitNoPotionConcreteReply",
  "statePotionDeclineReply",
  "detectsExplicitNoPotionRequest",
  "detectsPotionFollowUpRefusal",
  "detectsExplicitStatePotionExit",
];

Deno.test("select_state_potion architecture: production runtime has no visible prose templates", async () => {
  const offenders: string[] = [];
  for (const file of PRODUCTION_FILES_WITHOUT_VISIBLE_PROSE_TEMPLATES) {
    const source = await Deno.readTextFile(file);
    for (const snippet of FORBIDDEN_LEGACY_VISIBLE_SNIPPETS) {
      if (source.includes(snippet)) offenders.push(`${file}: ${snippet}`);
    }
  }
  assertEquals(offenders, []);
});

Deno.test("select_state_potion architecture: legacy renderer is disabled", async () => {
  const source = await Deno.readTextFile(
    "supabase/functions/sophia-brain/tools/operations/select_state_potion/renderer.ts",
  );
  assert(
    source.includes("select_state_potion_visible_renderer_legacy_disabled"),
  );
  assertEquals(source.includes("renderSelectStatePotionHandoffDraft"), true);
  assertEquals(source.includes("Ce que je comprends"), false);
});

Deno.test("select_state_potion architecture: runtime has no regex business gates or legacy policy replies", async () => {
  const offenders: string[] = [];
  for (const file of PRODUCTION_FILES_WITHOUT_REGEX_OR_LEGACY_POLICY) {
    const source = await Deno.readTextFile(file);
    for (const snippet of FORBIDDEN_RUNTIME_CODE_SNIPPETS) {
      if (source.includes(snippet)) offenders.push(`${file}: ${snippet}`);
    }
  }
  assertEquals(offenders, []);
});
