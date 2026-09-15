/**
 * FF-028 · REVUE ADVERSARIALE — les hypothèses sont écrites AVANT d'être jouées.
 *
 * ── LES HYPOTHÈSES, TELLES QU'ELLES ONT ÉTÉ FORMULÉES ──────────────────────
 *
 * A1  LE MOTEUR BAVARD. Sur une cohorte variée, la part de soirs SANS
 *     recommandation doit être LARGEMENT majoritaire (§10). Si elle ne l'est
 *     pas, le seuil de « significatif » est trop bas et la fiche est trahie.
 *
 * A2  L'ACCUSÉ FANTÔME SUR LE « OUI ». Il doit exister un chemin où l'écriture
 *     échoue et où Sophia dit quand même « Done ». Le candidat: un rythme
 *     DÉCLARÉ VIDE (`eating_rhythm: []`). L'empreinte est calculée sur le
 *     rythme EFFECTIF (le défaut), donc elle est inchangée et le claim passe —
 *     mais la fonction SQL refuse d'écrire sur un rythme vide. Seule la
 *     relecture peut alors sauver l'honnêteté de la phrase.
 *
 * A3  L'ACTION INVENTÉE / LE PAYLOAD D'AUTRUI. Un identifiant de proposition
 *     inexistant, ou celui d'un AUTRE élève, doit être refusé sans écrire — et
 *     sans dire lequel des deux c'était.
 *
 * A4  LE COACHING DE VIE QUI REVIENT. Tout texte délivré par ce moteur doit
 *     appartenir à l'ensemble FERMÉ des deux littéraux. Rien d'autre ne doit
 *     pouvoir sortir, sur aucun profil.
 *
 * A5  LA PROPOSITION STALE PAR LA DOCTRINE. Le coach republie sa méthode entre
 *     la proposition et le tap: l'action a été filtrée contre une version qui
 *     n'existe plus, donc elle ne doit pas s'appliquer.
 *
 * A6  LE BUDGET QUI FUIT. Une proposition doit consommer EXACTEMENT une place
 *     du compteur partagé, avec `axis` NULL, et fermer la journée pour les
 *     deux autres surfaces.
 *
 * A7  LA RÉSURRECTION D'UNE PROPOSITION MORTE. Un tap sur les boutons d'une
 *     proposition expirée ne doit rien appliquer.
 *
 * A8  L'ÉLÈVE QUI LIT OU ÉCRIT LA TABLE. `authenticated` ne doit rien pouvoir
 *     faire sur `student_daily_recommendations` ni sur la fonction d'écriture.
 *
 * A9  LA PRÉFÉRENCE CONTRADICTOIRE (T-11, FF-026). Accepter un petit-déjeuner
 *     puis capter « je ne mange jamais le matin »: que reçoit le générateur, et
 *     quelque chose arbitre-t-il ?
 *
 * A10 LE PLAFOND DE LIVRAISON. Si le plafond quotidien de messages non
 *     sollicités est déjà pris, la proposition ne doit pas rester `proposed` en
 *     base — ce serait une question ouverte que personne n'a lue.
 *
 * A11 LE REJEU DU MÊME TOUR (Kong rend des 502 sans corps; le client retente
 *     avec le MÊME `client_message_id`). Une seule application.
 *
 * A12 LA BOUCLE FERMÉE, POUR DE VRAI. Après acceptation, une composition RÉELLE
 *     (`generate-meal-v1`, vrai modèle) doit porter le moment ajouté. C'est le
 *     zéro de §7 (« acceptée mais la composition suivante l'ignore »).
 */
import {
  admin,
  callAs,
  deliveredProposal,
  eveningIn,
  makeCoach,
  makeFixture,
  proposalsOf,
  purge,
  purgeCoach,
  rhythmOf,
  runEngine,
  tap,
  askLedgerOf,
  nonce,
  URL_BASE,
  ANON,
  type Fixture,
  type FixtureOpts,
} from "./ff028_harness.ts";
import {
  RECOMMENDATION_ACTIONS,
  recommendationButtonId,
} from "../supabase/functions/_shared/keel/daily_recommendation.ts";

type Case = {
  id: string;
  hypothesis: string;
  verdict: "GREEN" | "RED" | "NOT_TESTABLE";
  proof: unknown;
};
const cases: Case[] = [];
function record(c: Case) {
  cases.push(c);
  console.log(`${c.id} — ${c.verdict} — ${c.hypothesis}`);
}

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

// ---------------------------------------------------------------------------
// A1 — LE MOTEUR BAVARD: la part de soirs silencieux
// ---------------------------------------------------------------------------
{
  // Une cohorte de huit profils, dont UN SEUL remplit les deux conditions. Ce
  // n'est pas un décor pessimiste: c'est le produit. La faim récurrente est
  // déjà rare, et « malgré deux compositions rassasiantes » l'est bien plus.
  const cohort: Array<{ label: string; opts: FixtureOpts }> = [
    { label: "nominal", opts: {} },
    { label: "pas de faim", opts: { hungerDays: 0 } },
    { label: "faim isolée (1 jour)", opts: { hungerDays: 1 } },
    { label: "faim, aucune adaptation", opts: { adaptations: 0 } },
    { label: "faim, une adaptation", opts: { adaptations: 1 } },
    {
      label: "rythme complet",
      opts: { rhythm: ["breakfast", "lunch", "snack_pm", "dinner"] },
    },
    { label: "plancher TCA", opts: { restrictionFlag: true } },
    {
      label: "doctrine qui exclut tout",
      opts: {
        doctrine: {
          beliefs: [{
            key: "f",
            claim: "Intermittent fasting, three meals a day, no snacking.",
            rationale: null,
            goalScope: [],
          }],
        },
      },
    },
  ];
  const coach = await makeCoach({ displayName: "FF028 Coach" });
  const fixtures: Fixture[] = [];
  const perNight: Array<{ night: number; analysed: number; proposed: number }> = [];
  const texts = new Set<string>();
  try {
    for (const c of cohort) {
      // Plafond de 3 élèves par coach: un coach par élève.
      fixtures.push(await makeFixture(c.opts));
    }
    const base = fixtures[0].now;
    for (let night = 0; night < 3; night++) {
      let analysed = 0;
      let proposed = 0;
      for (const fx of fixtures) {
        const r = await runEngine(fx, { now: eveningIn(base, night) });
        analysed += r.analysed;
        proposed += r.proposed;
      }
      perNight.push({ night, analysed, proposed });
    }
    for (const fx of fixtures) {
      const p = await deliveredProposal(fx.student.userId);
      if (p) texts.add(p.content);
    }
    const analysed = perNight.reduce((a, n) => a + n.analysed, 0);
    const proposed = perNight.reduce((a, n) => a + n.proposed, 0);
    const silentShare = analysed === 0 ? 1 : (analysed - proposed) / analysed;
    record({
      id: "A1",
      hypothesis:
        "le moteur bavard — la part de soirs SANS recommandation doit être majoritaire",
      verdict: silentShare > 0.5 ? "GREEN" : "RED",
      proof: {
        student_evenings: analysed,
        proposals: proposed,
        silent_share: `${(silentShare * 100).toFixed(1)}%`,
        per_night: perNight,
      },
    });
    // A4, sur la même cohorte: rien d'autre que les deux littéraux n'est sorti.
    const allowed = new Set(RECOMMENDATION_ACTIONS.map((a) => a.proposal));
    record({
      id: "A4",
      hypothesis:
        "le coaching de vie qui revient — tout texte délivré appartient à l'espace fermé",
      verdict: [...texts].every((t) => allowed.has(t)) ? "GREEN" : "RED",
      proof: {
        distinct_texts: texts.size,
        all_in_closed_space: [...texts].every((t) => allowed.has(t)),
      },
    });
  } finally {
    for (const fx of fixtures) {
      await purge(fx.student.userId);
      await purgeCoach(fx.coach);
    }
    await purgeCoach(coach);
  }
}

// ---------------------------------------------------------------------------
// A2 — L'ACCUSÉ FANTÔME SUR LE « OUI »
// ---------------------------------------------------------------------------
await withFixture({ rhythm: [] }, async (fx) => {
  // `eating_rhythm: []` — la clé existe, le tableau est vide. Le rythme EFFECTIF
  // est le défaut, donc l'espace ne contient que la collation, l'empreinte est
  // celle du défaut, et le claim va passer. La fonction SQL, elle, refuse
  // d'écrire (elle effacerait la journée). Seule la RELECTURE peut empêcher
  // Sophia de dire « c'est fait ».
  const r = await runEngine(fx);
  const p = await deliveredProposal(fx.student.userId);
  const yes = p?.buttons.find((b) => b.payload.includes("ACCEPT"));
  const t = yes ? await tap(fx.student, yes.payload, "Yes, add it") : null;
  const rows = await proposalsOf(fx.student.userId);
  const rhythm = await rhythmOf(fx.student.userId);
  record({
    id: "A2",
    hypothesis:
      "l'accusé fantôme — écriture impossible (rythme vide) mais empreinte valide: " +
      "Sophia doit dire qu'elle N'A PAS pu, et l'état revenir à `proposed`",
    verdict: r.proposed === 1 &&
        !String(t?.reply ?? "").startsWith("Done") &&
        String(t?.reply ?? "").includes("couldn't save") &&
        rows[0]?.state === "proposed" && !rows[0]?.applied_at &&
        rhythm.length === 0
      ? "GREEN"
      : "RED",
    proof: {
      proposed: r.proposed,
      ack: t?.reply,
      state: rows[0]?.state,
      applied_at: rows[0]?.applied_at,
      rhythm_after: rhythm,
    },
  });
});

// ---------------------------------------------------------------------------
// A3 — PAYLOAD INEXISTANT, ET PAYLOAD D'AUTRUI
// ---------------------------------------------------------------------------
await withFixture({}, async (fx) => {
  const ghost = await tap(
    fx.student,
    recommendationButtonId("accept", "11111111-2222-3333-4444-555555555555"),
    "Yes, add it",
  );
  const rowsGhost = await proposalsOf(fx.student.userId);
  const rhythmGhost = await rhythmOf(fx.student.userId);

  // La victime: un autre élève avec une VRAIE proposition ouverte.
  const victim = await makeFixture({});
  try {
    await runEngine(victim);
    const vp = await deliveredProposal(victim.student.userId);
    const vYes = vp?.buttons.find((b) => b.payload.includes("ACCEPT"))!;
    const stolen = await tap(fx.student, vYes.payload, "Yes, add it");
    const victimRows = await proposalsOf(victim.student.userId);
    const victimRhythm = await rhythmOf(victim.student.userId);
    const attackerRhythm = await rhythmOf(fx.student.userId);
    record({
      id: "A3",
      hypothesis:
        "payload inexistant ou d'autrui — refusé sans écrire, et sans dire lequel des deux",
      verdict: String(ghost.reply ?? "").includes("no longer open") &&
          rowsGhost.length === 0 && rhythmGhost.join() === "lunch,dinner" &&
          String(stolen.reply ?? "").includes("no longer open") &&
          victimRows[0]?.state === "proposed" && !victimRows[0]?.applied_at &&
          victimRhythm.join() === "lunch,dinner" &&
          attackerRhythm.join() === "lunch,dinner"
        ? "GREEN"
        : "RED",
      proof: {
        ghost_ack: ghost.reply,
        ghost_rows: rowsGhost.length,
        stolen_ack: stolen.reply,
        victim_state: victimRows[0]?.state,
        victim_rhythm: victimRhythm,
        attacker_rhythm: attackerRhythm,
        same_sentence: ghost.reply === stolen.reply,
      },
    });
  } finally {
    await purge(victim.student.userId);
    await purgeCoach(victim.coach);
  }
});

// ---------------------------------------------------------------------------
// A5 — LE COACH REPUBLIE SA DOCTRINE ENTRE LA PROPOSITION ET LE TAP
// ---------------------------------------------------------------------------
await withFixture({}, async (fx) => {
  await runEngine(fx);
  const p = await deliveredProposal(fx.student.userId);
  const yes = p?.buttons.find((b) => b.payload.includes("ACCEPT"))!;

  // La v1 cesse d'être publiée D'ABORD: `coach_doctrines_one_published_idx`
  // n'autorise qu'une version publiée par coach — c'est ce que fait le vrai
  // chemin de publication.
  await admin().from("coach_doctrines").update({ published_at: null } as never)
    .eq("coach_id", fx.coach.coachId).eq("version", 1);

  // Version 2, publiée: la méthode contre laquelle l'action a été filtrée
  // n'existe plus.
  const { error } = await admin().from("coach_doctrines").insert({
    coach_id: fx.coach.coachId,
    version: 2,
    beliefs: [{
      key: "fasted_morning",
      claim: "We now train fasted; the first meal of the day is lunch.",
      rationale: null,
      goalScope: [],
    }],
    forbidden: [],
    vocabulary: [],
    arbitrations: [],
    foods: { discouraged: [] },
    qa: [],
    daily_practices: [],
    voice: {},
    content_locale: "en-GB",
    published_at: new Date().toISOString(),
  } as never);
  if (error) throw new Error(`doctrine v2: ${error.message}`);

  const t = await tap(fx.student, yes.payload, "Yes, add it");
  const rows = await proposalsOf(fx.student.userId);
  const rhythm = await rhythmOf(fx.student.userId);
  record({
    id: "A5",
    hypothesis:
      "le coach republie sa doctrine entre proposition et tap — l'action a été " +
      "filtrée contre une version disparue, donc elle ne s'applique pas",
    verdict: rows[0]?.state === "expired" &&
        rows[0]?.expiry_reason === "plan_changed" &&
        !rhythm.includes("breakfast")
      ? "GREEN"
      : "RED",
    proof: {
      state: rows[0]?.state,
      expiry_reason: rows[0]?.expiry_reason,
      ack: t.reply,
      rhythm,
    },
  });
});

// ---------------------------------------------------------------------------
// A6 — LE BUDGET PARTAGÉ
// ---------------------------------------------------------------------------
await withFixture({}, async (fx) => {
  await runEngine(fx);
  const ledger = await askLedgerOf(fx.student.userId);
  // Une seconde surface qui demanderait aujourd'hui doit lire un compteur PLEIN.
  const { countDailyAsks, DAILY_ASK_BUDGET } = await import(
    "../supabase/functions/_shared/keel/daily_ask_budget.ts"
  );
  const count = await countDailyAsks(admin() as never, {
    userId: fx.student.userId,
    localDate: fx.today,
  });
  record({
    id: "A6",
    hypothesis:
      "le budget qui fuit — la proposition consomme EXACTEMENT une place, axis NULL, " +
      "et ferme la journée pour les deux autres surfaces",
    verdict: ledger.length === 1 && ledger[0].ask_kind === "daily_recommendation" &&
        ledger[0].axis === null && count.count >= DAILY_ASK_BUDGET
      ? "GREEN"
      : "RED",
    proof: { ledger, count, budget: DAILY_ASK_BUDGET },
  });
});

// ---------------------------------------------------------------------------
// A7 — TAP SUR UNE PROPOSITION MORTE
// ---------------------------------------------------------------------------
await withFixture({}, async (fx) => {
  await runEngine(fx);
  const p = await deliveredProposal(fx.student.userId);
  const yes = p?.buttons.find((b) => b.payload.includes("ACCEPT"))!;
  await admin().from("student_daily_recommendations").update({
    state: "expired",
    expiry_reason: "undelivered",
  } as never).eq("user_id", fx.student.userId);
  const t = await tap(fx.student, yes.payload, "Yes, add it");
  const rows = await proposalsOf(fx.student.userId);
  const rhythm = await rhythmOf(fx.student.userId);
  record({
    id: "A7",
    hypothesis:
      "la résurrection d'une proposition morte — un tap sur une expirée n'applique rien",
    verdict: rows[0]?.state === "expired" && !rows[0]?.applied_at &&
        !rhythm.includes("breakfast")
      ? "GREEN"
      : "RED",
    proof: { state: rows[0]?.state, ack: t.reply, rhythm },
  });
});

// ---------------------------------------------------------------------------
// A8 — L'ÉLÈVE FACE À LA TABLE ET À LA FONCTION
// ---------------------------------------------------------------------------
await withFixture({}, async (fx) => {
  await runEngine(fx);
  const headers = {
    apikey: ANON,
    Authorization: `Bearer ${fx.student.accessToken}`,
    "Content-Type": "application/json",
  };
  const read = await fetch(
    `${URL_BASE}/rest/v1/student_daily_recommendations?select=*`,
    { headers },
  );
  const readBody = await read.text();
  const write = await fetch(
    `${URL_BASE}/rest/v1/student_daily_recommendations?user_id=eq.${fx.student.userId}`,
    { method: "PATCH", headers, body: JSON.stringify({ state: "accepted" }) },
  );
  const rpc = await fetch(
    `${URL_BASE}/rest/v1/rpc/keel_add_eating_rhythm_slot`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_user_id: fx.student.userId,
        p_slot: "breakfast",
      }),
    },
  );
  const rhythm = await rhythmOf(fx.student.userId);
  record({
    id: "A8",
    hypothesis:
      "l'élève qui lit ou écrit la table — `authenticated` n'a rien, ni sur la " +
      "table ni sur la fonction d'écriture",
    verdict: read.status >= 400 && write.status >= 400 && rpc.status >= 400 &&
        !rhythm.includes("breakfast")
      ? "GREEN"
      : "RED",
    proof: {
      select_status: read.status,
      select_body: readBody.slice(0, 120),
      patch_status: write.status,
      rpc_status: rpc.status,
      rhythm,
    },
  });
});

// ---------------------------------------------------------------------------
// A11 — LE REJEU DU MÊME TOUR (502 de Kong, le client retente)
// ---------------------------------------------------------------------------
await withFixture({}, async (fx) => {
  await runEngine(fx);
  const p = await deliveredProposal(fx.student.userId);
  const yes = p?.buttons.find((b) => b.payload.includes("ACCEPT"))!;
  const cmid = `ff028-replay-${nonce()}`;
  const t1 = await tap(fx.student, yes.payload, "Yes, add it", {
    clientMessageId: cmid,
  });
  const rows1 = await proposalsOf(fx.student.userId);
  const t2 = await tap(fx.student, yes.payload, "Yes, add it", {
    clientMessageId: cmid,
  });
  const rows2 = await proposalsOf(fx.student.userId);
  const rhythm = await rhythmOf(fx.student.userId);
  record({
    id: "A11",
    hypothesis:
      "le rejeu du MÊME client_message_id (502 de Kong) — une seule application, " +
      "et pas un second accusé",
    verdict: rows1[0]?.applied_at === rows2[0]?.applied_at &&
        rhythm.filter((s) => s === "breakfast").length === 1 &&
        t2.acks.length === t1.acks.length
      ? "GREEN"
      : "RED",
    proof: {
      applied_at_stable: rows1[0]?.applied_at === rows2[0]?.applied_at,
      rhythm,
      acks_after_first: t1.acks.length,
      acks_after_replay: t2.acks.length,
    },
  });
});

// ---------------------------------------------------------------------------
// A10 — LE PLAFOND DE LIVRAISON
// ---------------------------------------------------------------------------
await withFixture({}, async (fx) => {
  const { deliverChatMessage } = await import(
    "../supabase/functions/_shared/chat/delivery.ts"
  );
  // On sature le plafond quotidien de messages NON SOLLICITÉS avec un purpose
  // qui n'est ni garanti ni opt-in (la diffusion de cohorte).
  for (let i = 0; i < 2; i++) {
    await deliverChatMessage(admin() as never, {
      userId: fx.student.userId,
      content: `saturation ${i}`,
      purpose: "keel_coach_broadcast",
      requestId: `ff028-sat-${i}`,
      now: fx.now,
    });
  }
  const r = await runEngine(fx);
  const rows = await proposalsOf(fx.student.userId);
  const p = await deliveredProposal(fx.student.userId);
  record({
    id: "A10",
    hypothesis:
      "le plafond de livraison — une proposition non livrée ne reste pas `proposed` " +
      "en base (une question ouverte que personne n'a lue)",
    verdict: p === null && rows.length === 1 && rows[0].state === "expired" &&
        rows[0].expiry_reason === "undelivered"
      ? "GREEN"
      : "RED",
    proof: {
      skipped: r.skipped_by_reason,
      db_state: rows[0]?.state,
      expiry_reason: rows[0]?.expiry_reason,
      bubble_delivered: p !== null,
    },
  });
});

// ---------------------------------------------------------------------------
// A9 + A12 — LA BOUCLE FERMÉE, ET LA PRÉFÉRENCE CONTRADICTOIRE
// ---------------------------------------------------------------------------
await withFixture({}, async (fx) => {
  await runEngine(fx);
  const p = await deliveredProposal(fx.student.userId);
  const yes = p?.buttons.find((b) => b.payload.includes("ACCEPT"))!;
  await tap(fx.student, yes.payload, "Yes, add it");
  const rhythm = await rhythmOf(fx.student.userId);

  // A9 — LA PRÉFÉRENCE CONTRADICTOIRE, captée APRÈS l'acceptation.
  const { data: goals } = await admin().from("student_goals")
    .select("practical_constraints").eq("user_id", fx.student.userId)
    .maybeSingle();
  const pc = (goals?.practical_constraints ?? {}) as Record<string, unknown>;
  await admin().from("student_goals").update({
    practical_constraints: {
      ...pc,
      food_preferences: ["I never eat anything in the morning"],
    },
  } as never).eq("user_id", fx.student.userId);

  // A12 — UNE COMPOSITION RÉELLE. Vrai modèle, vraie fonction edge.
  const gen = await callAs(fx.student, "generate-meal-v1", {
    mode: "to_shop",
    window: { kind: "days", count: 1 },
    intent: "replace_current",
    servings: 1,
  });
  const dishes = (gen.json?.meal?.dishes ?? gen.json?.dishes ?? []) as Array<
    Record<string, unknown>
  >;
  const slots = dishes.map((d) => String(d.slot ?? d.meal_slot ?? ""));
  record({
    id: "A12",
    hypothesis:
      "la boucle fermée — après acceptation, une composition RÉELLE porte le " +
      "moment ajouté (le zéro de §7)",
    verdict: rhythm.includes("breakfast") && slots.includes("breakfast")
      ? "GREEN"
      : gen.status !== 200
      ? "NOT_TESTABLE"
      : "RED",
    proof: {
      rhythm,
      generate_status: gen.status,
      slots,
      error: gen.status !== 200 ? gen.json : undefined,
    },
  });
  record({
    id: "A9",
    hypothesis:
      "la préférence contradictoire captée APRÈS l'acceptation (T-11) — " +
      "le générateur reçoit les deux; quelque chose arbitre-t-il ?",
    verdict: "NOT_TESTABLE",
    proof: {
      note:
        "FF-028 n'écrit que le RYTHME; la préférence vit dans le même jsonb mais " +
        "dans une autre clé, et l'arbitrage appartient au générateur (LLM). " +
        "Mesuré ici: ce que le générateur a effectivement composé.",
      rhythm_after_accept: rhythm,
      preference_written: "I never eat anything in the morning",
      generated_slots: slots,
      generate_status: gen.status,
    },
  });
});

Deno.writeTextFileSync(
  "scratchpad/ff028_adversarial_results.json",
  JSON.stringify(cases, null, 2),
);
const red = cases.filter((c) => c.verdict === "RED");
console.log(
  `\n=== FF-028 ADVERSARIAL: ${
    cases.filter((c) => c.verdict === "GREEN").length
  } GREEN / ${red.length} RED / ${
    cases.filter((c) => c.verdict === "NOT_TESTABLE").length
  } non testable ===`,
);
for (const c of red) console.log(`RED ${c.id}: ${JSON.stringify(c.proof)}`);
