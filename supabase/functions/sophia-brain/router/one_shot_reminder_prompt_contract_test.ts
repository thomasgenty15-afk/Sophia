import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  committedOneShotReminderKnown,
  directEffectContextCommittedThisTurn,
  directEffectContextHasCommittedOneShotReminder,
  oneShotReminderCanonicalVisiblePromptLines,
  oneShotReminderVisibleContextPresent,
  recentEffectsSummaryHasCommittedOneShotReminder,
} from "./one_shot_reminder_prompt_contract.ts";

Deno.test("one-shot reminder visible contract requires committed effect proof", () => {
  const prompt = oneShotReminderCanonicalVisiblePromptLines(
    "flow_context.direct_effect_confirmation_context",
  ).join("\n");

  assertStringIncludes(
    prompt,
    "has_committed_one_shot_reminder n'est pas true",
  );
  assertStringIncludes(
    prompt,
    "ne dis jamais qu'un rappel est programme",
  );
  assertStringIncludes(
    prompt,
    "visible_runtime_context.recent_effects_summary",
  );
  assertStringIncludes(
    prompt,
    "Rappel ponctuel cree: execute et persiste",
  );
  assertStringIncludes(prompt, "etat DB actuel");
  assertStringIncludes(
    prompt,
    "Si aucune de ces sources ne prouve le rappel",
  );
  assertEquals(prompt.includes("reponse finale"), false);
});

Deno.test("one-shot reminder visible contract states cancel/modify is not possible from chat without denying existence", () => {
  const prompt = oneShotReminderCanonicalVisiblePromptLines(
    "flow_context.direct_effect_confirmation_context",
  ).join("\n");

  assertStringIncludes(
    prompt,
    "ne peut pas etre annule, modifie, decale, reprogramme ou supprime depuis le chat",
  );
  assertStringIncludes(
    prompt,
    "la gestion des rappels se fait dans la plateforme",
  );
  assertStringIncludes(
    prompt,
    "Ne nie jamais l'existence d'un rappel deja confirme",
  );
});

Deno.test("committedKnown from the recent window suppresses denial without forcing confirmation", () => {
  // Recap window (committed in a PRIOR turn, proven from the ledger). The
  // reminder must be available/non-denied, but never spontaneously confirmed.
  const prompt = oneShotReminderCanonicalVisiblePromptLines(
    "flow_context.direct_effect_confirmation_context",
    { present: true, committedKnown: true },
  ).join("\n");

  // Denial-oriented lines must be gone.
  assertEquals(
    prompt.includes(
      "dis sobrement que tu ne peux pas confirmer qu'un rappel a ete programme",
    ),
    false,
  );
  assertEquals(
    prompt.includes("has_committed_one_shot_reminder n'est pas true"),
    false,
  );
  // Availability guidance present, existence never denied.
  assertStringIncludes(
    prompt,
    "Un rappel ponctuel committe est prouve et disponible dans le contexte",
  );
  assertStringIncludes(prompt, "Ne nie jamais son existence");
  // Anti-faux-positif: no spontaneous confirmation directive on the window branch.
  assertEquals(
    prompt.includes("confirme naturellement le rappel une seule fois"),
    false,
  );
  assertEquals(prompt.includes("confirme-le sobrement"), false);
  // The recap-on-demand permission and cancellation-limit lines stay.
  assertStringIncludes(
    prompt,
    "Si le user demande si un rappel recent a ete programme",
  );
  assertStringIncludes(
    prompt,
    "ne peut pas etre annule, modifie, decale, reprogramme ou supprime depuis le chat",
  );
});

Deno.test("committedThisTurn emits an active one-time confirmation directive", () => {
  // Creation turn (one-shot reminder pipeline): confirm once, right away.
  const prompt = oneShotReminderCanonicalVisiblePromptLines(
    "flow_context.direct_effect_confirmation_context",
    { present: true, committedThisTurn: true },
  ).join("\n");

  assertStringIncludes(prompt, "confirme naturellement le rappel une seule fois");
  assertStringIncludes(prompt, "confirme-le sobrement une seule fois");
  assertStringIncludes(
    prompt,
    "Ne dis jamais que tu ne peux pas confirmer ce rappel",
  );
  // No denial guard on the creation turn.
  assertEquals(
    prompt.includes("has_committed_one_shot_reminder n'est pas true"),
    false,
  );
});

Deno.test("committedKnown injects the block even when the direct context is absent", () => {
  const suppressed = oneShotReminderCanonicalVisiblePromptLines(
    "flow_context.direct_effect_confirmation_context",
    { present: false },
  );
  assertEquals(suppressed.length, 0);

  const injected = oneShotReminderCanonicalVisiblePromptLines(
    "flow_context.direct_effect_confirmation_context",
    { present: false, committedKnown: true },
  );
  assert(injected.length > 0);
  assertStringIncludes(
    injected.join("\n"),
    "Un rappel ponctuel committe est prouve et disponible dans le contexte",
  );
});

Deno.test("directEffectContextCommittedThisTurn distinguishes pipeline commit from ledger projection", () => {
  // Current-turn pipeline build: no `source` tag -> this turn.
  assertEquals(
    directEffectContextCommittedThisTurn({
      has_committed_one_shot_reminder: true,
      one_shot_reminder: { committed: true },
    }),
    true,
  );
  // Recent-ledger projection (turns 2-5): tagged source -> NOT this turn.
  assertEquals(
    directEffectContextCommittedThisTurn({
      has_committed_one_shot_reminder: true,
      one_shot_reminder: { committed: true },
      source: "recent_effect_ledger",
    }),
    false,
  );
  // No committed reminder at all.
  assertEquals(
    directEffectContextCommittedThisTurn({
      has_committed_one_shot_reminder: false,
    }),
    false,
  );
  assertEquals(directEffectContextCommittedThisTurn(null), false);
});

Deno.test("directEffectContextHasCommittedOneShotReminder reads structural proof", () => {
  assertEquals(
    directEffectContextHasCommittedOneShotReminder({
      has_committed_one_shot_reminder: true,
    }),
    true,
  );
  assertEquals(
    directEffectContextHasCommittedOneShotReminder({
      one_shot_reminder: { committed: true },
    }),
    true,
  );
  assertEquals(
    directEffectContextHasCommittedOneShotReminder({
      has_committed_one_shot_reminder: false,
      one_shot_reminder: { committed: false },
    }),
    false,
  );
  assertEquals(directEffectContextHasCommittedOneShotReminder(null), false);
});

Deno.test("recentEffectsSummary proof requires committed line with pending DB state", () => {
  const pendingSummary = [
    "=== EFFETS RÉCENTS (EffectLedger, fenêtre 5 tours) ===",
    "- Rappel ponctuel créé: exécuté et persisté; détail: appeler le médecin; état DB actuel: pending; prévu: demain à 09:00.",
  ].join("\n");
  assertEquals(
    recentEffectsSummaryHasCommittedOneShotReminder(pendingSummary),
    true,
  );

  const cancelledSummary = [
    "=== EFFETS RÉCENTS (EffectLedger, fenêtre 5 tours) ===",
    "- Rappel ponctuel créé: exécuté et persisté; détail: appeler le médecin; état DB actuel: cancelled.",
  ].join("\n");
  assertEquals(
    recentEffectsSummaryHasCommittedOneShotReminder(cancelledSummary),
    false,
  );

  assertEquals(recentEffectsSummaryHasCommittedOneShotReminder(null), false);
  assertEquals(recentEffectsSummaryHasCommittedOneShotReminder(""), false);
});

Deno.test("committedOneShotReminderKnown unions both proof sources", () => {
  assertEquals(
    committedOneShotReminderKnown({
      directEffectConfirmationContext: {
        has_committed_one_shot_reminder: true,
      },
      recentEffectsSummary: null,
    }),
    true,
  );
  assertEquals(
    committedOneShotReminderKnown({
      directEffectConfirmationContext: null,
      recentEffectsSummary:
        "- Rappel ponctuel créé: exécuté et persisté; état DB actuel: pending.",
    }),
    true,
  );
  assertEquals(
    committedOneShotReminderKnown({
      directEffectConfirmationContext: null,
      recentEffectsSummary: "aucun effet",
    }),
    false,
  );
});

Deno.test("ledger-window branch forbids opening the reply with the committed reminder", () => {
  const windowPrompt = oneShotReminderCanonicalVisiblePromptLines(
    "flow_context.direct_effect_confirmation_context",
    { present: true, committedThisTurn: false, committedKnown: true },
  ).join("\n");
  assertStringIncludes(
    windowPrompt,
    "N'ouvre jamais ta reponse par ce rappel",
  );
  assertStringIncludes(
    windowPrompt,
    "ne le mentionne pas en preambule d'un tour qui porte sur autre chose",
  );
  // La directive de confirmation active reste reservee au tour du commit.
  assertEquals(
    windowPrompt.includes("confirme naturellement le rappel une seule fois"),
    false,
  );

  const creationPrompt = oneShotReminderCanonicalVisiblePromptLines(
    "flow_context.direct_effect_confirmation_context",
    { present: true, committedThisTurn: true, committedKnown: true },
  ).join("\n");
  assertStringIncludes(
    creationPrompt,
    "confirme naturellement le rappel une seule fois",
  );
});

Deno.test("blocked one-shot context injects explicit past_time and duplicate guidance", () => {
  // Un contexte bloque (sans commit) doit suffire a injecter le bloc.
  assertEquals(
    oneShotReminderVisibleContextPresent({
      blocked_one_shot_reminder: { reason_code: "past_time" },
    }),
    true,
  );
  const lines = oneShotReminderCanonicalVisiblePromptLines(
    "flow_context.direct_effect_confirmation_context",
    { present: true, committedThisTurn: false, committedKnown: false },
  ).join("\n");
  assertStringIncludes(
    lines,
    "blocked_one_shot_reminder.reason_code=past_time",
  );
  assertStringIncludes(
    lines,
    "Dis clairement que rien n'a ete cree",
  );
  assertStringIncludes(
    lines,
    "ne reformule jamais la demande bloquee comme si elle restait valide",
  );
  assertStringIncludes(
    lines,
    "Reponds ensuite normalement au reste du message.",
  );
  assertStringIncludes(
    lines,
    "blocked_one_shot_reminder.reason_code=duplicate_pending",
  );
});

Deno.test("cancel requests must be acknowledged first even in multi-intent messages", () => {
  const lines = oneShotReminderCanonicalVisiblePromptLines(
    "flow_context.direct_effect_confirmation_context",
    { present: true, committedThisTurn: false, committedKnown: true },
  ).join("\n");
  assertStringIncludes(lines, "laisser tomber un rappel");
  assertStringIncludes(
    lines,
    "Meme si le message contient d'autres demandes, accuse d'abord cette demande",
  );
  assertStringIncludes(lines, "ne l'ignore jamais en silence");
});

Deno.test("committed track_progress reaches the confirmation channel and forbids denial", async () => {
  const { buildDirectEffectConfirmationContext } = await import(
    "./direct_effect_local_context.ts"
  );
  const context = buildDirectEffectConfirmationContext({
    direct_effects: [],
    direct_effect_lane: {
      committed_effects: [{
        type: "track_progress_plan_item",
        target_item_id: "item-1",
        target_title: "Organiser une soirée zéro vide",
        progress_status: "completed",
      }],
      requested_effects: [],
      blocked_effects: [],
    },
  }) as Record<string, unknown> | null;
  assertEquals(
    (context?.track_progress as Record<string, unknown>)?.committed,
    true,
  );
  assertEquals(
    (context?.track_progress as Record<string, unknown>)?.target_title,
    "Organiser une soirée zéro vide",
  );
  // Le bloc canonique s'injecte sur un commit track seul...
  assertEquals(oneShotReminderVisibleContextPresent(context), true);
  // ...et interdit le deni post-commit.
  const lines = oneShotReminderCanonicalVisiblePromptLines(
    "ctx",
    { present: true, committedThisTurn: false, committedKnown: false },
  ).join("\n");
  assertStringIncludes(lines, "track_progress.committed=true");
  assertStringIncludes(
    lines,
    "ne dis jamais que tu ne peux pas cocher, marquer ou tracker depuis le chat",
  );
});
