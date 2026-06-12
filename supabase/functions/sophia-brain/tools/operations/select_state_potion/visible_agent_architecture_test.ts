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
  "supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/state_potion_subskill_flow.ts",
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
  "supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/state_potion_subskill_flow.ts",
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

Deno.test("select_state_potion architecture: legacy detail intake is not reachable from runtime", async () => {
  const runtimeFiles = [
    "supabase/functions/sophia-brain/tools/operations/select_state_potion/intake.ts",
    "supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff.ts",
    "supabase/functions/sophia-brain/router/run.ts",
  ];
  const offenders: string[] = [];
  for (const file of runtimeFiles) {
    const source = await Deno.readTextFile(file);
    for (
      const snippet of [
        "fillPotionDetailSlotsWithAi",
        "select_state_potion.detail_intake",
        "./subskills/potion_detail_intake.ts",
      ]
    ) {
      if (source.includes(snippet)) offenders.push(`${file}: ${snippet}`);
    }
  }
  assertEquals(offenders, []);
});

Deno.test("select_state_potion architecture: legacy detail intake file and draft generation runtime are removed", async () => {
  const legacyDetailFile =
    "supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/potion_detail_intake.ts";
  try {
    await Deno.stat(legacyDetailFile);
    throw new Error("legacy_potion_detail_intake_file_still_exists");
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }

  const runtimeFiles = [
    "supabase/functions/sophia-brain/tools/operations/select_state_potion/intake.ts",
    "supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff.ts",
  ];
  const offenders: string[] = [];
  for (const file of runtimeFiles) {
    const source = await Deno.readTextFile(file);
    for (
      const snippet of [
        "draft_generation",
        "draft_generator",
        "draftGeneratorOverride",
        "generatePotionSessionDraftWithAi",
        "loadPotionBaseContext",
      ]
    ) {
      if (source.includes(snippet)) offenders.push(`${file}: ${snippet}`);
    }
  }
  assertEquals(offenders, []);
});

Deno.test("select_state_potion architecture: local dispatcher prompts document real JSON field rules", async () => {
  const promptContracts = [
    {
      file:
        "supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/local_flow_dispatcher.ts",
      fields: [
        "flow_action",
        "confidence",
        "target_stage",
        "slot_interpretation",
        "field_pointer",
        "revision_pointer",
        "exit_memo_request",
        "risk_assessment/risk_score",
        "evidence",
      ],
    },
    {
      file:
        "supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/clarte_flow.ts",
      fields: [
        "flow_action",
        "confidence",
        "selected_potion",
        "field_id",
        "field_state",
        "revision",
        "visible_task.kind",
        "visible_task.conversation_context",
        "subskill_call",
        "exit_memo",
        "note_information",
        "no_chat_mutation",
        "risk_assessment/risk_score",
        "evidence",
      ],
    },
    {
      file:
        "supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/state_potion_subskill_flow.ts",
      fields: [
        "flow_action",
        "confidence",
        "selected_potion",
        "current_field_id",
        "field_states",
        "detail_sufficiency",
        "revision",
        "visible_task.kind",
        "visible_task.conversation_context",
        "subskill_call",
        "exit_memo",
        "note_information",
        "no_chat_mutation",
        "risk_assessment/risk_score",
        "evidence",
      ],
    },
  ];

  for (const contract of promptContracts) {
    const source = await Deno.readTextFile(contract.file);
    assert(
      source.includes("Field Completion Rules:"),
      `${contract.file} missing Field Completion Rules`,
    );
    assert(
      source.includes("Transition Rules:"),
      `${contract.file} missing Transition Rules`,
    );
    assertEquals(
      source.split("Exemples JSON non visibles (2 seulement):").length - 1,
      1,
      `${contract.file} must contain one two-example block`,
    );
    for (const field of contract.fields) {
      assert(
        source.includes(field),
        `${contract.file} missing field rule for ${field}`,
      );
    }
  }
});

Deno.test("select_state_potion architecture: potion free-text sufficiency requires concrete detail", async () => {
  const source = await Deno.readTextFile(
    "supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/state_potion_subskill_flow.ts",
  );
  for (
    const snippet of [
      "ce qui s'est passé ou ce qui se rejoue",
      "pourquoi ça pèse maintenant",
      "mon échec de vendredi et je me parle très durement",
      "Ne compense jamais un champ free_text pauvre",
      "love_lack_context='mon échec de vendredi' + love_state='Dur avec moi'",
    ]
  ) {
    assert(
      source.includes(snippet),
      `missing potion sufficiency prompt guard: ${snippet}`,
    );
  }
});
