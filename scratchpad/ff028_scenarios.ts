/**
 * FF-028 · MEDIUM / HARD / EXTRA-HARD — en conditions réelles.
 *
 * Chaque verdict cite sa PREUVE: une ligne relue en base, un texte de bulle, ou
 * un motif de silence rendu par le moteur. Jamais une réponse HTTP.
 */
import {
  admin,
  deliveredProposal,
  makeFixture,
  proposalsOf,
  purge,
  purgeCoach,
  rhythmOf,
  runEngine,
  runPulse,
  tap,
  askLedgerOf,
  eveningIn,
  type Fixture,
  type FixtureOpts,
} from "./ff028_harness.ts";

type Case = {
  level: "medium" | "hard" | "extra-hard";
  id: string;
  scenario: string;
  verdict: "GREEN" | "RED";
  proof: unknown;
};

const cases: Case[] = [];
function record(c: Case) {
  cases.push(c);
  console.log(`[${c.level}] ${c.id} — ${c.verdict} — ${c.scenario}`);
}

const DAY = 24 * 3600_000;

async function withFixture<T>(
  opts: FixtureOpts,
  fn: (fx: Fixture) => Promise<T>,
): Promise<T> {
  const fx = await makeFixture(opts);
  try {
    return await fn(fx);
  } finally {
    await purge(fx.student.userId);
    await purgeCoach(fx.coach);
  }
}

/** Le nombre de bulles de recommandation reçues (proposition + accusés). */
async function bubbles(userId: string): Promise<
  Array<{ purpose: string; content: string }>
> {
  const { data } = await admin()
    .from("chat_messages")
    .select("content,metadata,created_at")
    .eq("user_id", userId)
    .eq("role", "assistant")
    .order("created_at", { ascending: true });
  return ((data ?? []) as Array<Record<string, any>>)
    .map((r) => ({
      purpose: String((r.metadata ?? {}).purpose ?? ""),
      content: String(r.content ?? ""),
    }))
    .filter((r) => r.purpose.startsWith("keel_daily_recommendation"));
}

// ===========================================================================
// MEDIUM
// ===========================================================================

// M1 — tap « Non »: cooldown, la même proposition ne revient pas.
await withFixture({ rhythm: ["breakfast", "lunch", "dinner"] }, async (fx) => {
  await runEngine(fx);
  const p = await deliveredProposal(fx.student.userId);
  const no = p?.buttons.find((b) => b.payload.includes("DECLINE"))!;
  const t = await tap(fx.student, no.payload, "No thanks");

  const nights: string[] = [];
  for (let d = 1; d <= 3; d++) {
    const r = await runEngine(fx, { now: eveningIn(fx.now, d) });
    nights.push(
      r.proposed > 0
        ? `PROPOSED:${JSON.stringify(r.proposed_actions)}`
        : Object.keys(r.silent_reasons)[0],
    );
  }
  const rows = await proposalsOf(fx.student.userId);
  record({
    level: "medium",
    id: "M1",
    scenario: "tap « Non » ⇒ cooldown, la même proposition ne revient pas 3 soirs",
    verdict: rows.length === 1 && rows[0].state === "declined" &&
        nights.every((n) => n === "cooldown")
      ? "GREEN"
      : "RED",
    proof: {
      db_rows: rows.map((r) => ({ action: r.action_id, state: r.state })),
      ack: t.reply,
      following_nights: nights,
    },
  });
});

// M2 — journée sans signal: AUCUN message, trois soirs de suite.
await withFixture({ hungerDays: 0 }, async (fx) => {
  const nights: string[] = [];
  for (let d = 0; d <= 2; d++) {
    const r = await runEngine(fx, { now: eveningIn(fx.now, d) });
    nights.push(
      r.proposed > 0 ? "PROPOSED" : Object.keys(r.silent_reasons)[0] ?? "?",
    );
  }
  const msgs = await bubbles(fx.student.userId);
  const rows = await proposalsOf(fx.student.userId);
  const ledger = await askLedgerOf(fx.student.userId);
  record({
    level: "medium",
    id: "M2",
    scenario: "journée sans signal ⇒ AUCUN message, 3 soirs (le silence est nominal)",
    verdict: nights.every((n) => n === "nothing_significant") &&
        msgs.length === 0 && rows.length === 0 && ledger.length === 0
      ? "GREEN"
      : "RED",
    proof: { nights, bubbles: msgs.length, db_rows: rows.length, ask_ledger: ledger.length },
  });
});

// M2bis — faim récurrente mais AUCUNE adaptation tentée: silence.
await withFixture({ adaptations: 0 }, async (fx) => {
  const r = await runEngine(fx);
  const msgs = await bubbles(fx.student.userId);
  record({
    level: "medium",
    id: "M2b",
    scenario: "faim récurrente sans adaptation tentée ⇒ silence (le seuil tient)",
    verdict: r.silent_reasons.nothing_significant === 1 && msgs.length === 0
      ? "GREEN"
      : "RED",
    proof: { silent_reasons: r.silent_reasons, bubbles: msgs.length },
  });
});

// M2ter — une seule adaptation: encore trop tôt.
await withFixture({ adaptations: 1 }, async (fx) => {
  const r = await runEngine(fx);
  record({
    level: "medium",
    id: "M2c",
    scenario: "une seule adaptation ⇒ silence (le seuil est 2, pas 1)",
    verdict: r.silent_reasons.nothing_significant === 1 ? "GREEN" : "RED",
    proof: { silent_reasons: r.silent_reasons },
  });
});

// M3 — élève en français: le moteur propose (la locale ne gate rien).
await withFixture({ locale: "fr-FR" }, async (fx) => {
  const r = await runEngine(fx);
  const p = await deliveredProposal(fx.student.userId);
  record({
    level: "medium",
    id: "M3",
    scenario: "élève fr-FR ⇒ proposition livrée (T-2: la copie runtime reste EN)",
    verdict: r.proposed === 1 && Boolean(p) ? "GREEN" : "RED",
    proof: { proposed: r.proposed, text: p?.content?.slice(0, 60) },
  });
});

// M4 — le petit-déj existe déjà: c'est la collation qui est proposée.
await withFixture({ rhythm: ["breakfast", "lunch", "dinner"] }, async (fx) => {
  const r = await runEngine(fx);
  const rows = await proposalsOf(fx.student.userId);
  const p = await deliveredProposal(fx.student.userId);
  const yes = p?.buttons.find((b) => b.payload.includes("ACCEPT"))!;
  await tap(fx.student, yes.payload, "Yes, add it");
  const after = await rhythmOf(fx.student.userId);
  record({
    level: "medium",
    id: "M4",
    scenario: "petit-déj déjà là ⇒ collation de l'après-midi, et elle s'applique",
    verdict: rows[0]?.action_id === "add_afternoon_snack" &&
        after.includes("snack_pm")
      ? "GREEN"
      : "RED",
    proof: { action: rows[0]?.action_id, rhythm_after: after },
  });
});

// M5 — rythme complet: l'espace est vide.
await withFixture(
  { rhythm: ["breakfast", "lunch", "snack_pm", "dinner"] },
  async (fx) => {
    const r = await runEngine(fx);
    record({
      level: "medium",
      id: "M5",
      scenario: "rythme déjà complet ⇒ no_action_available, rien n'est proposé",
      verdict: r.silent_reasons.no_action_available === 1 && r.proposed === 0
        ? "GREEN"
        : "RED",
      proof: { silent_reasons: r.silent_reasons },
    });
  },
);

// M6 — aucune ligne student_goals: le rythme PAR DÉFAUT s'applique.
await withFixture({ rhythm: null }, async (fx) => {
  const r = await runEngine(fx);
  const rows = await proposalsOf(fx.student.userId);
  const p = await deliveredProposal(fx.student.userId);
  const yes = p?.buttons.find((b) => b.payload.includes("ACCEPT"))!;
  const t = await tap(fx.student, yes.payload, "Yes, add it");
  const rowsAfter = await proposalsOf(fx.student.userId);
  record({
    level: "medium",
    id: "M6",
    scenario:
      "sans student_goals ⇒ jamais de petit-déjeuner proposé (il en reçoit déjà un), " +
      "et le « Oui » sur la collation N'ACCUSE PAS puisqu'il n'y a rien à écrire",
    verdict: rows[0]?.action_id === "add_afternoon_snack" &&
        !String(t.reply ?? "").startsWith("Done") &&
        rowsAfter[0]?.state === "proposed" && !rowsAfter[0]?.applied_at
      ? "GREEN"
      : "RED",
    proof: {
      action: rows[0]?.action_id,
      ack: t.reply,
      state_after: rowsAfter[0]?.state,
      applied_at: rowsAfter[0]?.applied_at,
    },
  });
});

// ===========================================================================
// HARD
// ===========================================================================

// H1 — doctrine « jeûne du matin » + faim matinale ⇒ jamais de petit-déjeuner.
await withFixture({
  doctrine: {
    beliefs: [{
      key: "fasted_morning",
      claim: "We train fasted; the first meal of the day is lunch.",
      rationale: "The morning fasting window is where the work happens.",
      goalScope: [],
    }],
  },
}, async (fx) => {
  const r = await runEngine(fx);
  const rows = await proposalsOf(fx.student.userId);
  const p = await deliveredProposal(fx.student.userId);
  record({
    level: "hard",
    id: "H1",
    scenario: "coach « jeûne du matin » ⇒ AUCUNE proposition de petit-déjeuner",
    verdict: rows.every((x) => x.action_id !== "add_breakfast") &&
        !String(p?.content ?? "").toLowerCase().includes("breakfast")
      ? "GREEN"
      : "RED",
    proof: {
      doctrine_removed: r.doctrine_removed,
      proposed_actions: r.proposed_actions,
      text: p?.content?.slice(0, 80),
    },
  });
});

// H1b — doctrine qui interdit les DEUX: le moteur est muet.
await withFixture({
  doctrine: {
    beliefs: [{
      key: "fasted_three_meals",
      claim: "Intermittent fasting, three meals a day, no snacking.",
      rationale: null,
      goalScope: [],
    }],
  },
}, async (fx) => {
  const r = await runEngine(fx);
  const msgs = await bubbles(fx.student.userId);
  record({
    level: "hard",
    id: "H1b",
    scenario: "doctrine qui exclut les deux familles ⇒ moteur muet, zéro bulle",
    verdict: r.silent_reasons.no_action_available === 1 && msgs.length === 0
      ? "GREEN"
      : "RED",
    proof: { silent_reasons: r.silent_reasons, doctrine_removed: r.doctrine_removed },
  });
});

// H1c — la même doctrine, en FRANÇAIS (T9).
await withFixture({
  doctrine: {
    beliefs: [{
      key: "jeune_et_trois_repas",
      claim: "Jeûne intermittent, trois repas par jour, pas de grignotage.",
      rationale: null,
      goalScope: [],
    }],
  },
}, async (fx) => {
  const r = await runEngine(fx);
  const msgs = await bubbles(fx.student.userId);
  record({
    level: "hard",
    id: "H1c",
    scenario: "la MÊME doctrine en français ⇒ muet aussi (T9, garde bilingue)",
    verdict: r.silent_reasons.no_action_available === 1 && msgs.length === 0
      ? "GREEN"
      : "RED",
    proof: { silent_reasons: r.silent_reasons, doctrine_removed: r.doctrine_removed },
  });
});

// H2 — plancher de restriction: MUET, ET SANS PERTE (T-7).
await withFixture({ restrictionFlag: true }, async (fx) => {
  const before = await admin().from("student_hunger_reports").select("id")
    .eq("user_id", fx.student.userId);
  const r = await runEngine(fx);
  const after = await admin().from("student_hunger_reports").select("id")
    .eq("user_id", fx.student.userId);
  const msgs = await bubbles(fx.student.userId);
  const rows = await proposalsOf(fx.student.userId);
  const ledger = await askLedgerOf(fx.student.userId);
  record({
    level: "hard",
    id: "H2",
    scenario:
      "sous restriction_flag ⇒ muet ET sans perte (rien n'est avalé: T-7)",
    verdict: r.silent_reasons.restriction_flag === 1 && msgs.length === 0 &&
        rows.length === 0 && ledger.length === 0 &&
        (before.data ?? []).length === (after.data ?? []).length &&
        (after.data ?? []).length === 3
      ? "GREEN"
      : "RED",
    proof: {
      silent_reasons: r.silent_reasons,
      hunger_rows_before: (before.data ?? []).length,
      hunger_rows_after: (after.data ?? []).length,
      bubbles: msgs.length,
      proposals: rows.length,
      ask_ledger: ledger.length,
    },
  });
});

// H3 — le plan a changé entre la proposition et le tap.
await withFixture({}, async (fx) => {
  await runEngine(fx);
  const p = await deliveredProposal(fx.student.userId);
  const yes = p?.buttons.find((b) => b.payload.includes("ACCEPT"))!;

  // L'élève ajoute lui-même un petit-déjeuner sur `/app/plan` entre-temps.
  await admin().from("student_goals").update({
    practical_constraints: {
      eating_rhythm: [
        { slot: "breakfast", size: null },
        { slot: "lunch", size: null },
        { slot: "dinner", size: null },
      ],
    },
  } as never).eq("user_id", fx.student.userId);

  const before = await rhythmOf(fx.student.userId);
  const t = await tap(fx.student, yes.payload, "Yes, add it");
  const after = await rhythmOf(fx.student.userId);
  const rows = await proposalsOf(fx.student.userId);
  record({
    level: "hard",
    id: "H3",
    scenario:
      "plan modifié entre proposition et tap ⇒ rien ne s'applique, dit en une phrase",
    verdict: rows[0]?.state === "expired" &&
        rows[0]?.expiry_reason === "plan_changed" &&
        !rows[0]?.applied_at &&
        JSON.stringify(before) === JSON.stringify(after) &&
        String(t.reply ?? "").includes("changed since I asked")
      ? "GREEN"
      : "RED",
    proof: {
      state: rows[0]?.state,
      expiry_reason: rows[0]?.expiry_reason,
      rhythm_before: before,
      rhythm_after: after,
      ack: t.reply,
    },
  });
});

// H4 — double tap: une seule application.
await withFixture({}, async (fx) => {
  await runEngine(fx);
  const p = await deliveredProposal(fx.student.userId);
  const yes = p?.buttons.find((b) => b.payload.includes("ACCEPT"))!;
  const t1 = await tap(fx.student, yes.payload, "Yes, add it");
  const r1 = await rhythmOf(fx.student.userId);
  const rows1 = await proposalsOf(fx.student.userId);
  const t2 = await tap(fx.student, yes.payload, "Yes, add it");
  const r2 = await rhythmOf(fx.student.userId);
  const rows2 = await proposalsOf(fx.student.userId);
  record({
    level: "hard",
    id: "H4",
    scenario: "double tap ⇒ une seule application, rythme et applied_at inchangés",
    verdict: JSON.stringify(r1) === JSON.stringify(r2) &&
        r2.filter((s) => s === "breakfast").length === 1 &&
        rows1[0]?.applied_at === rows2[0]?.applied_at &&
        rows2.length === 1
      ? "GREEN"
      : "RED",
    proof: {
      rhythm_after_first: r1,
      rhythm_after_second: r2,
      applied_at_stable: rows1[0]?.applied_at === rows2[0]?.applied_at,
      acks: t2.acks,
      ack1: t1.reply,
    },
  });
});

// H5 — tap « Oui » puis tap « Non » sur la même bulle.
await withFixture({}, async (fx) => {
  await runEngine(fx);
  const p = await deliveredProposal(fx.student.userId);
  const yes = p?.buttons.find((b) => b.payload.includes("ACCEPT"))!;
  const no = p?.buttons.find((b) => b.payload.includes("DECLINE"))!;
  await tap(fx.student, yes.payload, "Yes, add it");
  const t2 = await tap(fx.student, no.payload, "No thanks");
  const rows = await proposalsOf(fx.student.userId);
  const rhythm = await rhythmOf(fx.student.userId);
  record({
    level: "hard",
    id: "H5",
    scenario: "« Oui » puis « Non » ⇒ l'état reste accepté, rien n'est défait",
    verdict: rows[0]?.state === "accepted" && rhythm.includes("breakfast") &&
        String(t2.reply ?? "").startsWith("Done")
      ? "GREEN"
      : "RED",
    proof: { state: rows[0]?.state, rhythm, second_ack: t2.reply },
  });
});

// ===========================================================================
// EXTRA-HARD
// ===========================================================================

// X1 — le budget est PARTAGÉ: une question de précision du jour ferme la porte.
await withFixture({}, async (fx) => {
  const { error } = await admin().from("meal_precision_questions").insert({
    user_id: fx.student.userId,
    local_date: fx.today,
    source: "text",
    ask_kind: "meal_precision_question",
    axis: "composition",
    question: "et tu as mangé quoi avec ?",
    asked_for_message_id: `ff028-x1-${fx.student.userId}`,
  } as never);
  if (error) throw new Error(`seed ask: ${error.message}`);

  const r = await runEngine(fx);
  const msgs = await bubbles(fx.student.userId);
  const tomorrow = await runEngine(fx, { now: eveningIn(fx.now, 1) });
  record({
    level: "extra-hard",
    id: "X1",
    scenario:
      "question de précision déjà posée ce jour ⇒ la proposition attend demain (T4)",
    verdict: r.silent_reasons.daily_ask_budget === 1 && msgs.length === 0 &&
        tomorrow.proposed === 1
      ? "GREEN"
      : "RED",
    proof: {
      tonight: r.silent_reasons,
      bubbles_tonight: msgs.length,
      tomorrow_proposed: tomorrow.proposed,
    },
  });
});

// X2 — le batch tombe un soir: pas de rattrapage double le lendemain.
await withFixture({}, async (fx) => {
  // Soir 1: le batch ne tourne pas du tout (panne).
  const night2 = await runEngine(fx, { now: eveningIn(fx.now, 1) });
  const rows = await proposalsOf(fx.student.userId);
  const msgs = await bubbles(fx.student.userId);
  record({
    level: "extra-hard",
    id: "X2",
    scenario: "le batch tombe un soir ⇒ UNE proposition le lendemain, pas deux",
    verdict: night2.proposed === 1 && rows.length === 1 && msgs.length === 1
      ? "GREEN"
      : "RED",
    proof: { proposed: night2.proposed, db_rows: rows.length, bubbles: msgs.length },
  });
});

// X3 — trois refus consécutifs: le moteur se tait durablement.
await withFixture({}, async (fx) => {
  const db = admin();
  // Trois refus HORS cooldown, pour que le silence vienne bien de la SÉRIE et
  // pas du refroidissement — sinon l'épreuve ne prouverait rien.
  for (const [i, action] of [
    "add_breakfast",
    "add_afternoon_snack",
    "add_breakfast",
  ].entries()) {
    const d = new Date(`${fx.today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (40 + i * 30));
    const { error } = await db.from("student_daily_recommendations").insert({
      user_id: fx.student.userId,
      local_date: d.toISOString().slice(0, 10),
      action_id: action,
      state: "declined",
      plan_fingerprint: "seed",
      proposed_text: "seed",
      responded_at: d.toISOString(),
    } as never);
    if (error) throw new Error(`seed decline: ${error.message}`);
  }
  const r = await runEngine(fx);
  const later = await runEngine(fx, {
    now: eveningIn(fx.now, 120),
  });
  const msgs = await bubbles(fx.student.userId);
  record({
    level: "extra-hard",
    id: "X3",
    scenario:
      "trois refus consécutifs ⇒ moteur muet, et encore muet quatre mois plus tard",
    verdict: r.silent_reasons.decline_streak_muted === 1 &&
        later.silent_reasons.decline_streak_muted === 1 && msgs.length === 0
      ? "GREEN"
      : "RED",
    proof: {
      tonight: r.silent_reasons,
      in_120_days: later.silent_reasons,
      bubbles: msgs.length,
    },
  });
});

// X3b — deux refus puis une acceptation: la série repart de zéro.
await withFixture({}, async (fx) => {
  const db = admin();
  const seed = async (dayOffset: number, action: string, state: string) => {
    const d = new Date(`${fx.today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - dayOffset);
    await db.from("student_daily_recommendations").insert({
      user_id: fx.student.userId,
      local_date: d.toISOString().slice(0, 10),
      action_id: action,
      state,
      plan_fingerprint: "seed",
      proposed_text: "seed",
      responded_at: d.toISOString(),
    } as never);
  };
  await seed(200, "add_breakfast", "declined");
  await seed(170, "add_afternoon_snack", "declined");
  await seed(140, "add_breakfast", "accepted");
  await seed(110, "add_afternoon_snack", "declined");
  await seed(80, "add_breakfast", "declined");
  const r = await runEngine(fx);
  record({
    level: "extra-hard",
    id: "X3b",
    scenario:
      "deux refus AVANT une acceptation ne comptent pas: la série repart après le oui",
    verdict: r.proposed === 1 ? "GREEN" : "RED",
    proof: { proposed: r.proposed, silent_reasons: r.silent_reasons },
  });
});

// X4 — un seul message par soir: le tap du soir se retire.
await withFixture({}, async (fx) => {
  await runEngine(fx);
  // Le pouls tourne dans SA fenêtre (20h-22h), une heure plus tard.
  const pulse = await runPulse(fx, new Date(fx.now.getTime() + 3600_000));
  const { data } = await admin()
    .from("chat_messages")
    .select("metadata")
    .eq("user_id", fx.student.userId)
    .eq("role", "assistant");
  const purposes = ((data ?? []) as Array<Record<string, any>>)
    .map((r) => String((r.metadata ?? {}).purpose ?? ""));
  record({
    level: "extra-hard",
    id: "X4",
    scenario:
      "recommandation partie à 19h ⇒ le tap du soir de 20h se retire (un seul message)",
    verdict: (pulse.skipped_by_reason?.recommendation_sent_today ?? 0) >= 1 &&
        !purposes.includes("keel_daily_pulse")
      ? "GREEN"
      : "RED",
    proof: {
      pulse_skipped: pulse.skipped_by_reason,
      purposes_delivered: purposes,
    },
  });
});

// X4b — soir SANS recommandation: le tap du soir parle normalement.
await withFixture({ hungerDays: 0 }, async (fx) => {
  await runEngine(fx);
  const pulse = await runPulse(fx, new Date(fx.now.getTime() + 3600_000));
  const { data } = await admin()
    .from("chat_messages")
    .select("metadata")
    .eq("user_id", fx.student.userId)
    .eq("role", "assistant");
  const purposes = ((data ?? []) as Array<Record<string, any>>)
    .map((r) => String((r.metadata ?? {}).purpose ?? ""));
  record({
    level: "extra-hard",
    id: "X4b",
    scenario:
      "soir sans recommandation ⇒ le tap du soir n'est PAS étouffé (additif, pas substitutif)",
    verdict: purposes.includes("keel_daily_pulse") ? "GREEN" : "RED",
    proof: { pulse_sent: pulse.sent, purposes_delivered: purposes },
  });
});

// X5 — concurrence: deux instances du job sur le même élève, même seconde.
await withFixture({}, async (fx) => {
  const [a, b] = await Promise.all([runEngine(fx), runEngine(fx)]);
  const rows = await proposalsOf(fx.student.userId);
  const msgs = await bubbles(fx.student.userId);
  const ledger = await askLedgerOf(fx.student.userId);
  record({
    level: "extra-hard",
    id: "X5",
    scenario:
      "deux instances du batch en parallèle ⇒ UNE ligne, UNE bulle, UNE place de budget",
    verdict: rows.length === 1 && msgs.length === 1 && ledger.length === 1
      ? "GREEN"
      : "RED",
    proof: {
      a: { proposed: a.proposed, silent: a.silent_reasons },
      b: { proposed: b.proposed, silent: b.silent_reasons },
      db_rows: rows.length,
      bubbles: msgs.length,
      ask_ledger: ledger.length,
    },
  });
});

// X6 — 🔴 LE DÉFAUT TROUVÉ EN REVUE ADVERSARIALE, ET SA NON-RÉGRESSION.
// Une proposition restée SANS RÉPONSE était re-posée chaque soir.
await withFixture({}, async (fx) => {
  const nights: Array<{ night: number; proposed: number; reason: string }> = [];
  for (const d of [0, 1, 2, 3, 6, 13]) {
    const r = await runEngine(fx, { now: eveningIn(fx.now, d) });
    nights.push({
      night: d,
      proposed: r.proposed,
      reason: Object.keys(r.silent_reasons)[0] ?? "-",
    });
  }
  const midRows = await proposalsOf(fx.student.userId);
  const midBubbles = await bubbles(fx.student.userId);

  // Au-delà de la fenêtre d'ouverture, elle meurt — et son action reste en
  // cooldown: ignorer n'est pas inviter à redemander.
  const day15 = await runEngine(fx, { now: eveningIn(fx.now, 15) });
  const rows = await proposalsOf(fx.student.userId);
  const finalBubbles = await bubbles(fx.student.userId);
  record({
    level: "extra-hard",
    id: "X6",
    scenario:
      "proposition SANS RÉPONSE ⇒ UNE seule bulle sur 14 soirs, puis expirée " +
      "`unanswered` et son action en cooldown (le silence n'est pas un rappel)",
    // ⚠️ On n'assert PAS qu'une nouvelle proposition part au 15e soir: les jours
    // de faim de la fixture sont sortis de la fenêtre de sept jours entre-temps,
    // donc `nothing_significant` est la bonne réponse. Que le cooldown de
    // l'action ignorée tienne est prouvé par X6b, où il mord AVANT ce gate.
    verdict: nights[0].proposed === 1 &&
        nights.slice(1).every((n) =>
          n.proposed === 0 && n.reason === "awaiting_response"
        ) &&
        midRows.length === 1 && midBubbles.length === 1 &&
        rows.length === 1 && rows[0].state === "expired" &&
        rows[0].expiry_reason === "unanswered" &&
        day15.proposed === 0 && finalBubbles.length === 1
      ? "GREEN"
      : "RED",
    proof: {
      nights,
      after_14_days: {
        state: rows[0]?.state,
        expiry_reason: rows[0]?.expiry_reason,
        proposed_on_day_15: day15.proposed,
        silent_on_day_15: day15.silent_reasons,
        bubbles_total: finalBubbles.length,
      },
    },
  });
});

// X6b — l'action IGNORÉE reste en cooldown après son expiration.
await withFixture({ rhythm: ["breakfast", "lunch", "dinner"] }, async (fx) => {
  // Une seule action possible (la collation): si l'ignorée n'était pas en
  // cooldown, elle repartirait le jour même de son expiration.
  await runEngine(fx);
  const day15 = await runEngine(fx, { now: eveningIn(fx.now, 15) });
  const rows = await proposalsOf(fx.student.userId);
  const msgs = await bubbles(fx.student.userId);
  record({
    level: "extra-hard",
    id: "X6b",
    scenario:
      "l'action IGNORÉE reste en cooldown après expiration ⇒ toujours une seule bulle",
    verdict: day15.silent_reasons.cooldown === 1 && msgs.length === 1 &&
        rows.length === 1 && rows[0].expiry_reason === "unanswered"
      ? "GREEN"
      : "RED",
    proof: {
      day15: day15.silent_reasons,
      bubbles: msgs.length,
      expiry_reason: rows[0]?.expiry_reason,
    },
  });
});

Deno.writeTextFileSync(
  "scratchpad/ff028_scenarios_results.json",
  JSON.stringify(cases, null, 2),
);
const red = cases.filter((c) => c.verdict === "RED");
console.log(
  `\n=== FF-028 SCENARIOS: ${cases.length - red.length}/${cases.length} GREEN ===`,
);
for (const c of red) console.log(`RED ${c.id}: ${JSON.stringify(c.proof)}`);
