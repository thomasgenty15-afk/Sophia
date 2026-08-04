import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDirectEffectConfirmationContext,
  directEffectConfirmationContextPrompt,
  directEffectTimeContextFromUnknown,
  directEffectLocalDispatcherPromptLines,
  withDirectEffectLocalContext,
} from "./direct_effect_local_context.ts";
import { oneShotDirectEffectFromLocalRequest } from "./one_shot_local_direct_effect.ts";

Deno.test("direct effect local context requires reminder intent beyond duration", () => {
  const context = withDirectEffectLocalContext({}, null, undefined, {
    now_utc: "2026-06-24T15:00:00.000Z",
    user_timezone: "Europe/Paris",
    user_locale: "fr-FR",
    user_local_datetime: "2026-06-24T17:00:00",
    user_local_human: "mercredi 24 juin 2026 à 17:00",
  });
  assertEquals(context.direct_effect_time_context?.now_utc, "2026-06-24T15:00:00.000Z");
  assertEquals(context.direct_effect_time_context?.user_timezone, "Europe/Paris");
  assertEquals(
    context.direct_effect_tool_policy.create_one_shot_reminder.includes(
      "A duration/time is not enough",
    ),
    true,
  );
  assertEquals(
    context.direct_effect_tool_policy.create_one_shot_reminder.includes(
      "talk for two minutes",
    ),
    true,
  );
  assertEquals(
    context.direct_effect_tool_policy.create_one_shot_reminder.includes(
      "never ask timezone when user_timezone is present",
    ),
    true,
  );

  const prompt = directEffectLocalDispatcherPromptLines().join("\n");
  assertEquals(
    prompt.includes("Bloc canonique create_one_shot_reminder"),
    true,
  );
  assertEquals(prompt.includes("Une duree/heure seule ne suffit pas"), true);
  assertEquals(prompt.includes("pas le rythme de la conversation"), true);
  assertEquals(prompt.includes("payload_hint.raw_text"), true);
  assertEquals(prompt.includes("payload_hint.when_hint"), true);
  assertEquals(prompt.includes("payload_hint.UTC_time"), true);
  assertEquals(prompt.includes("payload_hint.local_label"), true);
  assertEquals(prompt.includes("valide UTC_time"), true);
  assertEquals(prompt.includes("direct_effect_time_context"), true);
  assertEquals(prompt.includes("Ne demande pas le fuseau horaire"), true);
  assertEquals(prompt.includes("strictement futur"), true);
  assertEquals(prompt.includes("payload_hint.instruction_hint"), true);
  assertEquals(
    prompt.includes("garde les deux") &&
      prompt.includes("direct_effect_request"),
    true,
  );
  assertEquals(prompt.includes("Ces champs sont atomiques"), true);
  assertEquals(prompt.includes("raw_text seul"), true);
  assertEquals(prompt.includes("Si when_hint, UTC_time, local_label ou instruction_hint manque"), true);
  assertEquals(
    prompt.includes("ne doit jamais absorber le besoin local restant"),
    true,
  );
  assertEquals(
    prompt.includes("le dispatcher global a deja flagge l'intention"),
    true,
  );
  assertEquals(
    prompt.includes("ne doit pas recreer, rerouter, redemander ou confirmer"),
    true,
  );
  assertEquals(prompt.includes("direct_effect_request.requested=false"), true);
  assertEquals(
    prompt.includes("Le direct effect ne doit jamais absorber"),
    true,
  );
});

Deno.test("direct effect time context accepts nested platform context", () => {
  const context = directEffectTimeContextFromUnknown({
    channel: "whatsapp",
    direct_effect_time_context: {
      now_utc: "2026-06-24T17:20:00.000Z",
      user_timezone: "Europe/Paris",
      user_locale: "fr-FR",
      user_local_datetime: "2026-06-24T19:20:00",
      user_local_human: "mercredi 24 juin 2026 à 19:20",
    },
  });

  assertEquals(context?.now_utc, "2026-06-24T17:20:00.000Z");
  assertEquals(context?.user_timezone, "Europe/Paris");
  assertEquals(context?.user_local_datetime, "2026-06-24T19:20:00");
});

Deno.test("direct effect confirmation context exposes committed one-shot contract", () => {
  const context = buildDirectEffectConfirmationContext({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {
        raw_text: "rappelle-moi demain de payer",
        when_hint: "demain",
        UTC_time: "2026-06-25T07:00:00.000Z",
        local_label: "demain",
        instruction_hint: "payer",
      },
    }],
    direct_effect_lane: {
      visible_confirmation_hint: "C'est programme.",
      committed_effects: [{
        type: "create_one_shot_reminder",
        id: "r1",
        local_label: "demain",
        reminder_instruction: "payer",
      }],
      requested_effects: [{ type: "create_one_shot_reminder" }],
      blocked_effects: [],
    },
  });

  assertEquals(context?.has_committed_one_shot_reminder, true);
  assertEquals(context?.confirmation_text, null);
  assertEquals(context?.committed_effects, []);
  assertEquals(context?.one_shot_reminder, {
    committed: true,
    local_label: "demain",
    reminder_instruction: "payer",
  });
  assertEquals(context?.do_not_recreate, true);
  assertEquals(context?.remaining_user_need_must_continue, true);
});

Deno.test("confirmation context exposes already_tracked_today with target, never a phantom commit", () => {
  // Paul r1 T15: question de verification -> le writer detecte l'entry du jour
  // et bloque already_tracked_today. Le composeur doit pouvoir confirmer
  // l'existant (cible + statut) sans re-commit et sans deni.
  const context = buildDirectEffectConfirmationContext({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { target_item_id: "walk", status_hint: "completed" },
    }],
    direct_effect_lane: {
      committed_effects: [],
      requested_effects: [{ type: "track_progress_plan_item" }],
      allowed_effects: [{
        type: "track_progress_plan_item",
        target_item_id: "walk",
        target_title: "Faire 10 min de mouvement",
        progress_status: "completed",
      }],
      blocked_effects: [{
        type: "track_progress_plan_item",
        reason_code: "already_tracked_today",
      }],
    },
  });

  assertEquals(context?.track_progress, null);
  assertEquals(context?.blocked_track_progress, {
    reason_code: "already_tracked_today",
    target_title: "Faire 10 min de mouvement",
    progress_status: "completed",
  });

  // Anti-faux-positif: un commit reel du tour reste expose comme commit,
  // jamais requalifie en blocage.
  const committedContext = buildDirectEffectConfirmationContext({
    direct_effects: [],
    direct_effect_lane: {
      committed_effects: [{
        type: "track_progress_plan_item",
        logged_progress_id: "p1",
        target_title: "Faire 10 min de mouvement",
        progress_status: "completed",
      }],
      requested_effects: [],
      allowed_effects: [],
      blocked_effects: [],
    },
  });
  assertEquals(committedContext?.track_progress?.committed, true);
  assertEquals(committedContext?.blocked_track_progress, null);
});

Deno.test("local one-shot direct effect requires dispatcher UTC_time and local_label", () => {
  const effect = oneShotDirectEffectFromLocalRequest({
    requested: true,
    effect_type: "create_one_shot_reminder",
    explicitness: "explicit",
    target_status: "identified",
    confidence_band: "high",
    // W2.D-2 — `content_risk` was added to LocalOneShotDirectEffectRequest after these cases
    // were written. `null` is the neutral value (only "flagged" blocks), which is exactly the
    // pre-existing semantics they were exercising.
    content_risk: null,
    payload_hint: {
      raw_text: "rappelle-moi dans 30 minutes de verifier le calme",
      when_hint: "dans 30 minutes",
      UTC_time: "2026-06-24T12:30:00.000Z",
      local_label: "dans 30 minutes",
      instruction_hint: "verifier le calme",
    },
    reason: "explicit reminder",
  });

  assertEquals(effect?.effect_type, "create_one_shot_reminder");
  assertEquals(
    (effect?.payload_hint as any)?.UTC_time,
    "2026-06-24T12:30:00.000Z",
  );
  assertEquals((effect?.payload_hint as any)?.local_label, "dans 30 minutes");
});

Deno.test("local one-shot direct effect is ignored when global already flagged it", () => {
  const request = {
    requested: true,
    effect_type: "create_one_shot_reminder" as const,
    explicitness: "explicit" as const,
    target_status: "identified" as const,
    confidence_band: "high" as const,
    content_risk: null,
    payload_hint: {
      raw_text: "rappelle-moi dans 30 minutes de verifier le calme",
      when_hint: "dans 30 minutes",
      UTC_time: "2026-06-24T12:30:00.000Z",
      local_label: "dans 30 minutes",
      instruction_hint: "verifier le calme",
    },
    reason: "explicit reminder",
  };

  const effect = oneShotDirectEffectFromLocalRequest(request, {
    turnFrame: {
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          raw_text: request.payload_hint.raw_text,
          when_hint: request.payload_hint.when_hint,
          instruction_hint: request.payload_hint.instruction_hint,
        },
      }],
    },
  });

  assertEquals(effect, null);
});

Deno.test("effects_outcome is TOTAL: safety-muted lane yields a visible not_attempted outcome (rose-r5 T11)", () => {
  // Le cas historiquement muet: le dispatcher a emis un track explicite, mais
  // la lane n'a jamais tourne (blocage safety amont). Le contrat total doit
  // produire un outcome visible avec la posture "differe honnete" — jamais
  // un contexte null qui laisse le composeur inventer "c'est note".
  const context = buildDirectEffectConfirmationContext({
    safety: { risk_band: "high", reason_codes: [], evidence: [] },
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { target_item_id: "d62d828a", status_hint: "missed" },
    }],
    // Pas de direct_effect_lane: la lane n'a pas ete executee.
  });
  assertEquals(context !== null, true);
  const outcome = context?.effects_outcome.find((o) =>
    o.effect_type === "track_progress_plan_item"
  );
  assertEquals(outcome?.status, "not_attempted");
  assertEquals(outcome?.reason_code, "safety_active");
  assertEquals(outcome?.guidance.includes("differee"), true);
  assertEquals(outcome?.guidance.includes("aucun claim"), true);

  // Anti-faux-positif: aucun effet demande, aucune lane → pas de contexte.
  const empty = buildDirectEffectConfirmationContext({
    safety: { risk_band: "high", reason_codes: [], evidence: [] },
    direct_effects: [],
  });
  assertEquals(empty, null);
});

Deno.test("effects_outcome maps same-day contradiction to an honest BLOCKED outcome, no confirmation offer (paul-r5 B02)", () => {
  const context = buildDirectEffectConfirmationContext({
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { target_item_id: "coupure", status_hint: "missed" },
    }],
    direct_effect_lane: {
      committed_effects: [],
      requested_effects: [{
        type: "track_progress_plan_item",
        target_title: "Coupure ecran",
        progress_status: "missed",
      }],
      allowed_effects: [],
      blocked_effects: [{
        type: "track_progress_plan_item",
        reason_code: "contradicts_same_day_evidence",
      }],
      visible_confirmation_hint:
        "Tu parles de quelle nuit exactement ? J'ai deja un soir note ce jour-la.",
    },
  });
  const outcome = context?.effects_outcome.find((o) =>
    o.effect_type === "track_progress_plan_item"
  );
  // paul-r5 B02: la confirmation qu'un clarify inviterait est inexecutable
  // (pas d'override same-day en chat, V1) — l'outcome est un blocked honnete
  // dont la guidance interdit toute offre de bascule.
  assertEquals(outcome?.status, "blocked");
  assertEquals(outcome?.reason_code, "contradicts_same_day_evidence");
  assertEquals(outcome?.clarify_question, null);
  assertEquals(outcome?.target, "Coupure ecran");
  assertEquals(
    outcome?.guidance.includes("Ne propose JAMAIS de confirmer une bascule"),
    true,
  );
  assertEquals(outcome?.guidance.includes("Dashboard > Plan"), true);

  // Un commit reste committed avec sa guidance de confirmation unique.
  const committed = buildDirectEffectConfirmationContext({
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    direct_effect_lane: {
      committed_effects: [{
        type: "track_progress_plan_item",
        target_title: "Marche",
        progress_status: "completed",
      }],
      requested_effects: [],
      allowed_effects: [],
      blocked_effects: [],
    },
  });
  const committedOutcome = committed?.effects_outcome[0];
  assertEquals(committedOutcome?.status, "committed");
  assertEquals(committedOutcome?.guidance.includes("une seule fois"), true);
});

Deno.test("confirmation prompt carries the universal default-deny policy, not per-case enumeration", () => {
  const prompt = directEffectConfirmationContextPrompt({
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {},
    }],
  });
  assertEquals(prompt !== null, true);
  assertEquals(
    prompt?.includes(
      "effects_outcome is the complete and only truth",
    ),
    true,
  );
  assertEquals(prompt?.includes("Default-deny"), true);
  assertEquals(
    prompt?.includes("never say or imply 'c'est noté / c'est fait"),
    true,
  );
  assertEquals(prompt?.includes("status=needs_clarify → ask clarify_question"), true);
});

Deno.test("plan snapshot block lists recent checks so recaps read entries, not item status", async () => {
  const { activePlanSnapshotPromptBlock } = await import(
    "./direct_effect_local_context.ts"
  );
  const block = activePlanSnapshotPromptBlock([
    {
      id: "item-1",
      title: "Journée avec au moins une marche active",
      dimension: "habits",
      status: "active",
      tracking_type: "boolean",
      recent_checks: [
        { effective_at: "2026-07-03T12:00:00.000Z", entry_kind: "progress", outcome: "completed" },
        { effective_at: "2026-07-01T12:00:00.000Z", entry_kind: "skip", outcome: "missed" },
      ],
    },
    {
      id: "item-2",
      title: "Préparer un plan anti-ennui",
      dimension: "missions",
      status: "pending",
    },
  ]);
  // L'item tracké expose ses coches (outcome@date) malgré son statut `active`:
  // c'est la donnée qui empêche un recap de nier une entry committée.
  assertEquals(block?.includes("statut: active"), true);
  assertEquals(block?.includes("coches recentes: completed@2026-07-03, missed@2026-07-01"), true);
  // Item sans coche: pas de suffixe fabriqué.
  assertEquals(block?.includes("Préparer un plan anti-ennui — statut: pending") || block?.includes("Préparer un plan anti-ennui [missions] — statut: pending"), true);
  assertEquals(block?.split("coches recentes:").length, 2);
  // Ligne d'usage: le statut seul ne répond jamais à "qu'est-ce que j'ai coché".
  assertEquals(block?.includes("ne nie jamais une coche listee"), true);
});

Deno.test("needs_clarify outcome NEVER ships without a question (rose-r6 B02 invariant)", () => {
  // Lane needs_clarify sans visible_confirmation_hint (le chemin qui a produit
  // le silence validant de rose-r6 T2): la question de fallback doit exister.
  const context = buildDirectEffectConfirmationContext({
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { target_item_id: "item-x", status_hint: "completed" },
    }],
    direct_effect_lane: {
      committed_effects: [],
      requested_effects: [{
        type: "track_progress_plan_item",
        target_title: "Journée 100% sans cannabis",
        progress_status: "completed",
      }],
      allowed_effects: [],
      blocked_effects: [{
        type: "track_progress_plan_item",
        reason_code: "target_not_evidenced",
      }],
      // pas de visible_confirmation_hint
    },
  });
  const outcome = context?.effects_outcome.find((o) =>
    o.effect_type === "track_progress_plan_item"
  );
  assertEquals(outcome?.status, "needs_clarify");
  assertEquals(typeof outcome?.clarify_question, "string");
  assertEquals((outcome?.clarify_question ?? "").length > 0, true);
  assertEquals(
    outcome?.clarify_question?.includes("quelle action de ton plan"),
    true,
  );
});

Deno.test("committed correction reply override fires only on correction commits (paul-r6 B01)", async () => {
  const { committedCorrectionReplyOverride } = await import(
    "./direct_effect_local_context.ts"
  );
  const frame = (correction: boolean, committed: boolean) => ({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      payload_hint: { target_item_id: "i1", status_hint: "missed", correction },
    }],
    direct_effect_lane: {
      committed_effects: committed
        ? [{ type: "track_progress_plan_item", target_title: "10 min" }]
        : [],
      requested_effects: [],
      allowed_effects: [],
      blocked_effects: [],
      visible_confirmation_hint: "C'est corrigé : 10 min repassée en non fait.",
    },
  });
  // Commit de correction → la reply deterministe du tool prime.
  assertEquals(
    committedCorrectionReplyOverride(frame(true, true)),
    "C'est corrigé : 10 min repassée en non fait.",
  );
  // Correction demandee mais NON committee (blocked) → pas d'override, le
  // refus honnete du composeur reste legitime.
  assertEquals(committedCorrectionReplyOverride(frame(true, false)), null);
  // Commit normal sans correction → pas d'override (le composeur garde la main).
  assertEquals(committedCorrectionReplyOverride(frame(false, true)), null);
});

Deno.test("mixed outcomes: divergent effects get a per-effect directive, completion vocabulary scoped to committed (nina-r5 B01)", () => {
  const frame = {
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [
      {
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        payload_hint: { intent: "cancel" },
      },
      {
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        payload_hint: { target_item_id: "e205079e", status_hint: "completed" },
      },
    ],
    direct_effect_lane: {
      committed_effects: [{
        type: "create_one_shot_reminder",
        reminder_instruction: "rappel de 8h",
        local_label: "08:00",
      }],
      requested_effects: [{
        type: "track_progress_plan_item",
        target_title: "Ranger les produits pieges hors de vue",
        progress_status: "completed",
      }],
      allowed_effects: [],
      blocked_effects: [{
        type: "track_progress_plan_item",
        reason_code: "target_not_evidenced",
      }],
    },
  };
  const context = buildDirectEffectConfirmationContext(frame);
  const track = context?.effects_outcome.find((o) =>
    o.effect_type === "track_progress_plan_item"
  );
  // Input contradictoire → clarification sur le QUAND, jamais un claim.
  assertEquals(track?.status, "needs_clarify");
  assertEquals(
    track?.clarify_question?.includes("deja fait ou tu comptes le faire"),
    true,
  );

  const prompt = directEffectConfirmationContextPrompt(frame);
  assertEquals(prompt?.includes("MIXED_OUTCOMES_DIRECTIVE"), true);
  assertEquals(prompt?.includes("issues DIVERGENTES"), true);
  assertEquals(prompt?.includes('"rappel de 8h" → FAIT'), true);
  assertEquals(
    prompt?.includes('"Ranger les produits pieges hors de vue" → PAS enregistre'),
    true,
  );
  assertEquals(
    prompt?.includes("ne peut viser QUE les cibles marquees FAIT"),
    true,
  );
});

Deno.test("mixed outcomes directive absent when all outcomes agree (anti-faux-positif)", () => {
  const committedOnly = directEffectConfirmationContextPrompt({
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    direct_effect_lane: {
      committed_effects: [{
        type: "create_one_shot_reminder",
        reminder_instruction: "boire de l'eau",
        local_label: "09:00",
      }],
      requested_effects: [],
      allowed_effects: [],
      blocked_effects: [],
    },
  });
  assertEquals(committedOnly?.includes("MIXED_OUTCOMES_DIRECTIVE"), false);

  const blockedOnly = directEffectConfirmationContextPrompt({
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      payload_hint: {},
    }],
    direct_effect_lane: {
      committed_effects: [],
      requested_effects: [],
      allowed_effects: [],
      blocked_effects: [{
        type: "track_progress_plan_item",
        reason_code: "contradicts_same_day_evidence",
      }],
    },
  });
  assertEquals(blockedOnly?.includes("MIXED_OUTCOMES_DIRECTIVE"), false);
});

Deno.test("committed track with failed item patch carries the honest counter guidance (paul-r8 B01, cmd 15)", () => {
  const context = buildDirectEffectConfirmationContext({
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    direct_effect_lane: {
      committed_effects: [{
        type: "track_progress_plan_item",
        target_title: "Coupure ecran",
        progress_status: "completed",
        item_patch_applied: false,
      }],
      requested_effects: [],
      allowed_effects: [],
      blocked_effects: [],
    },
  });
  const outcome = context?.effects_outcome[0];
  assertEquals(outcome?.status, "committed");
  assertEquals(outcome?.guidance.includes("ne confirme NI le compteur"), true);

  // Anti-faux-positif: patch applique (ou non concerne) → guidance standard.
  const ok = buildDirectEffectConfirmationContext({
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    direct_effect_lane: {
      committed_effects: [{
        type: "track_progress_plan_item",
        target_title: "Marche",
        progress_status: "completed",
        item_patch_applied: true,
      }],
      requested_effects: [],
      allowed_effects: [],
      blocked_effects: [],
    },
  });
  assertEquals(
    ok?.effects_outcome[0]?.guidance.includes("ne confirme NI le compteur"),
    false,
  );
});

Deno.test("committed guidance forbids every denial variant, whatever the handler status label (rose-r7 B01)", () => {
  // Le contexte se derive du LEDGER (committed_effects), jamais du libelle de
  // statut du handler: une lane track (status "logged") porte exactement la
  // meme interdiction de dementi qu'une lane rappel (status "success").
  const context = buildDirectEffectConfirmationContext({
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    direct_effect_lane: {
      // Statut volontairement non-"success": la garde ne doit pas le lire.
      status: "logged",
      committed_effects: [{
        type: "track_progress_plan_item",
        target_title: "Sas de decompression",
        progress_status: "completed",
        item_patch_applied: true,
      }],
      requested_effects: [],
      allowed_effects: [],
      blocked_effects: [],
    },
  });
  const outcome = context?.effects_outcome[0];
  assertEquals(outcome?.status, "committed");
  // Les variantes exactes du dementi de rose-r7 T10 sont interdites en toutes
  // lettres dans la guidance (donnee, cmd 16).
  assertEquals(
    outcome?.guidance.includes("je ne peux pas te dire/confirmer que c'est coche"),
    true,
  );
  assertEquals(
    outcome?.guidance.includes("je peux t'aider a le formuler pour le suivi"),
    true,
  );
  assertEquals(
    outcome?.guidance.includes("quel que soit le libelle de statut du handler"),
    true,
  );
  // Et l'anti-silence (eva-r9 B02): un committe se mentionne toujours.
  assertEquals(
    outcome?.guidance.includes("ne reste JAMAIS silencieux"),
    true,
  );

  // Anti-faux-positif: un track BLOQUE garde le droit au disclaimer honnete —
  // la guidance committed ne s'applique pas.
  const blocked = buildDirectEffectConfirmationContext({
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    direct_effect_lane: {
      committed_effects: [],
      requested_effects: [],
      allowed_effects: [],
      blocked_effects: [{
        type: "track_progress_plan_item",
        reason_code: "target_not_evidenced",
      }],
    },
  });
  const blockedOutcome = blocked?.effects_outcome[0];
  assertEquals(blockedOutcome?.status, "needs_clarify");
  assertEquals(
    blockedOutcome?.guidance.includes("ne reste JAMAIS silencieux"),
    false,
  );
});

// ── P7-B (alex-untested22 R1-B01, paul-p6reval R1-B02): PARITÉ N-COMMITS ─────

Deno.test("fan-out multi-dates: l'outcome agrège les N commits avec leurs dates, jamais le seul premier (P7-B)", () => {
  const context = buildDirectEffectConfirmationContext({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { target_item_id: "item-1", status_hint: "completed" },
    }],
    direct_effect_lane: {
      committed_effects: [
        {
          type: "track_progress_plan_item",
          target_item_id: "item-1",
          target_title: "Couper les écrans",
          progress_status: "completed",
          date_hint: "2026-07-12",
        },
        {
          type: "track_progress_plan_item",
          target_item_id: "item-1",
          target_title: "Couper les écrans",
          progress_status: "completed",
          date_hint: "2026-07-13",
        },
        {
          type: "track_progress_plan_item",
          target_item_id: "item-1",
          target_title: "Couper les écrans",
          progress_status: "completed",
          date_hint: "2026-07-14",
        },
      ],
      requested_effects: [{ type: "track_progress_plan_item" }],
      blocked_effects: [],
    },
  });
  const outcome = (context?.effects_outcome ?? []).find((entry) =>
    entry.effect_type === "track_progress_plan_item"
  );
  assertEquals(outcome?.status, "committed");
  const target = String(outcome?.target ?? "");
  // Les 3 commits sont énumérés — le composeur ne peut plus nier les 2 autres.
  assertEquals(target.includes("3 enregistrements committes"), true);
  assertEquals(target.includes("2026-07-12"), true);
  assertEquals(target.includes("2026-07-13"), true);
  assertEquals(target.includes("2026-07-14"), true);
  // La guidance interdit le sous-report en toutes lettres.
  assertEquals(
    String(outcome?.guidance ?? "").includes("SOUS-REPORT INTERDIT"),
    true,
  );
});

Deno.test("commit unique: cible et date inchangées (P7-B anti-régression nina-r3 B01)", () => {
  const context = buildDirectEffectConfirmationContext({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { target_item_id: "item-1", status_hint: "completed" },
    }],
    direct_effect_lane: {
      committed_effects: [{
        type: "track_progress_plan_item",
        target_item_id: "item-1",
        target_title: "Couper les écrans",
        progress_status: "completed",
        date_hint: "2026-07-12",
      }],
      requested_effects: [{ type: "track_progress_plan_item" }],
      blocked_effects: [],
    },
  });
  const outcome = (context?.effects_outcome ?? []).find((entry) =>
    entry.effect_type === "track_progress_plan_item"
  );
  assertEquals(outcome?.status, "committed");
  const target = String(outcome?.target ?? "");
  assertEquals(target.includes("enregistrements committes"), false);
  assertEquals(target.includes("2026-07-12"), true);
});

// ── P8-A (rose-p7verify R1 T14): CO-DEMANDE PARTIELLEMENT COMMITTEE ──────────

Deno.test("co-demande partielle: le volet bloqué du même type remonte dans l'outcome committed (P8-A, rose-p7verify T14)", () => {
  const context = buildDirectEffectConfirmationContext({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { raw_text: "deux rappels" },
    }],
    direct_effect_lane: {
      committed_effects: [{
        type: "create_one_shot_reminder",
        id: "r-1",
        scheduled_for: "2026-07-16T16:00:00.000Z",
        local_label: "jeudi à 18h",
        reminder_instruction: "appeler le médecin",
      }],
      requested_effects: [
        { type: "create_one_shot_reminder", reason_code: "create" },
        { type: "create_one_shot_reminder", reason_code: "create" },
      ],
      blocked_effects: [{
        type: "create_one_shot_reminder",
        reason_code: "missing_time",
      }],
    },
  });
  const outcome = (context?.effects_outcome ?? []).find((entry) =>
    entry.effect_type === "create_one_shot_reminder"
  );
  assertEquals(outcome?.status, "committed");
  const guidance = String(outcome?.guidance ?? "");
  // Le volet non committé est une DONNÉE de l'outcome, plus un silence.
  assertEquals(guidance.includes("CO-DEMANDE PARTIELLE"), true);
  assertEquals(guidance.includes("missing_time"), true);
  // Le clarify du volet manquant voyage avec l'outcome committed.
  assertEquals(typeof outcome?.clarify_question, "string");
  assertEquals((outcome?.clarify_question ?? "").length > 0, true);
});

Deno.test("commit intégral: aucune mention de co-demande partielle (P8-A anti-faux-positif)", () => {
  const context = buildDirectEffectConfirmationContext({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { raw_text: "un rappel" },
    }],
    direct_effect_lane: {
      committed_effects: [{
        type: "create_one_shot_reminder",
        id: "r-1",
        scheduled_for: "2026-07-16T16:00:00.000Z",
        local_label: "jeudi à 18h",
        reminder_instruction: "appeler le médecin",
      }],
      requested_effects: [{
        type: "create_one_shot_reminder",
        reason_code: "create",
      }],
      blocked_effects: [],
    },
  });
  const outcome = (context?.effects_outcome ?? []).find((entry) =>
    entry.effect_type === "create_one_shot_reminder"
  );
  assertEquals(outcome?.status, "committed");
  assertEquals(
    String(outcome?.guidance ?? "").includes("CO-DEMANDE PARTIELLE"),
    false,
  );
  assertEquals(outcome?.clarify_question, null);
});
