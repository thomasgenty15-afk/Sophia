// PIVOT NUTRITION — N2: daily_pulse.ts.
//
// The test that carries the product decision:
//   * "activity never suppresses the question"
//     -- photos say WHAT was eaten, the tap says WHETHER THE PROTOCOL IS
//        LIVABLE. Letting one suppress the other hides exactly the case we are
//        looking for: a student who logs perfectly and is exhausted.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  type AskCadenceInput,
  decideAskCadence,
  decideDailyPulse,
  needsAxisFollowUp,
  PULSE_ASK_INTERVAL_DAYS,
  PULSE_ASK_INTERVAL_WHEN_HARD,
  PULSE_ASK_INTERVAL_WHEN_IGNORED,
  PULSE_IGNORED_STREAK,
  renderPulseMessage,
  type PulseDecisionInput,
  PULSE_AXES,
  PULSE_LEVELS,
  pulseAxisButtonId,
  pulseAxisButtons,
  pulseLevelButtonId,
  pulseLevelButtons,
  pulseTemplateButtonComponents,
  readPulseReply,
  renderPulseAck,
  renderPulseAxisQuestion,
  renderPulseQuestion,
} from "./daily_pulse.ts";

function input(over: Partial<PulseDecisionInput> = {}): PulseDecisionInput {
  return {
    localHour: 20,
    answeredToday: false,
    sentToday: false,
    minutesSinceLastExchange: null,
    safetyBand: null,
    hasActivePlan: true,
    // The nominal evening after the redesign: something happened today, and the
    // question is due. Tests that care about either one say so explicitly.
    hasGround: true,
    askDue: true,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// THE DECISION
// ---------------------------------------------------------------------------

Deno.test("activity never suppresses the question, it only changes the envelope", () => {
  // A student who sent three photos today has great coverage and may be
  // exhausted. The photos and the tap measure different things.
  const busy = decideDailyPulse(input({ minutesSinceLastExchange: 5 }));
  assertEquals(busy.decision, "send");
  if (busy.decision === "send") assertEquals(busy.mode, "attach");

  const quiet = decideDailyPulse(input({ minutesSinceLastExchange: 400 }));
  assertEquals(quiet.decision, "send");
  if (quiet.decision === "send") assertEquals(quiet.mode, "standalone");

  // Never a `skip` for being active — that is the whole point.
  for (const mins of [0, 1, 29, 30, 31, 1000]) {
    assertEquals(
      decideDailyPulse(input({ minutesSinceLastExchange: mins })).decision,
      "send",
      `${mins} min`,
    );
  }
});

Deno.test("one tap per day", () => {
  const d = decideDailyPulse(input({ answeredToday: true }));
  assertEquals(d.decision, "skip");
  if (d.decision === "skip") assertEquals(d.reason, "already_answered_today");
});

Deno.test("silence is not a request for a reminder: one MESSAGE per day", () => {
  // Regression, QA agent 7 (2026-08-03). The window is two hours wide and the
  // cron is hourly, so there are two ticks inside it. With `answeredToday` as
  // the only gate, a student who did not answer got "How was today?" at 20:10
  // AND at 21:10 — proven in local with two `keel_daily_pulse` outbound rows on
  // the same local day for one silent student.
  const d = decideDailyPulse(input({ answeredToday: false, sentToday: true }));
  assertEquals(d.decision, "skip");
  if (d.decision === "skip") assertEquals(d.reason, "already_sent_today");

  // ...AND ITS DISARMING CONDITION. The belt must not bite when the premise is
  // false: nothing sent today means the message still goes out. A gate that
  // can only ever say no is a gate that silently kills the feature.
  assertEquals(
    decideDailyPulse(input({ answeredToday: false, sentToday: false })).decision,
    "send",
  );
  // And it does not leak across days: `sentToday` is computed against the
  // student's local date, so a message sent yesterday leaves today open.
  assertEquals(
    decideDailyPulse(input({ localHour: 21, sentToday: false })).decision,
    "send",
  );
});

Deno.test("answered outranks sent: the two make different days for the coach", () => {
  const d = decideDailyPulse(input({ answeredToday: true, sentToday: true }));
  assertEquals(d.decision, "skip");
  // "He answered" and "we asked and got nothing" are not the same day, and the
  // job's counter is what tells them apart.
  if (d.decision === "skip") assertEquals(d.reason, "already_answered_today");
});

Deno.test("the evening window is 20h-22h local, and outside it nothing happens", () => {
  for (const h of [20, 21]) {
    assertEquals(decideDailyPulse(input({ localHour: h })).decision, "send", `${h}h`);
  }
  for (const h of [8, 19, 22, 23]) {
    const d = decideDailyPulse(input({ localHour: h }));
    assertEquals(d.decision, "skip", `${h}h`);
    if (d.decision === "skip") assertEquals(d.reason, "outside_window");
  }
  // An unreadable hour never sends: no spam on missing data.
  assertEquals(decideDailyPulse(input({ localHour: Number.NaN })).decision, "skip");
});

Deno.test("a crisis turn gets no 'how was your day'", () => {
  for (const band of ["low", "medium", "high", "critical"] as const) {
    const d = decideDailyPulse(input({ safetyBand: band }));
    assertEquals(d.decision, "skip", band);
    if (d.decision === "skip") assertEquals(d.reason, "safety_active");
  }
});

Deno.test("the gate order holds: opt-out outranks safety outranks the rest", () => {
  const d = decideDailyPulse(
    input({ optedOut: true, safetyBand: "high", hasActivePlan: false, answeredToday: true }),
  );
  if (d.decision === "skip") assertEquals(d.reason, "opted_out");

  const s = decideDailyPulse(
    input({ safetyBand: "high", hasActivePlan: false, answeredToday: true }),
  );
  if (s.decision === "skip") assertEquals(s.reason, "safety_active");

  // ...and "nothing to follow" still outranks both day-gates. A student with no
  // adopted plan is not "already sent", he is out of scope entirely.
  const p = decideDailyPulse(
    input({ hasActivePlan: false, answeredToday: true, sentToday: true }),
  );
  if (p.decision === "skip") assertEquals(p.reason, "no_active_plan");

  // `nothing_to_say` is LAST, and that placement is the contract. It is the only
  // gate that depends on the student's day rather than on his state; hoisting it
  // would let "nobody did anything" hide "everybody was out of the window".
  const w = decideDailyPulse(
    input({ localHour: 8, hasGround: false, askDue: false }),
  );
  if (w.decision === "skip") assertEquals(w.reason, "outside_window");
});

// ---------------------------------------------------------------------------
// THE REDESIGN: what we GIVE, and what we ASK, are two decisions
// ---------------------------------------------------------------------------

Deno.test("nothing grounded to say and no question due: we stay silent", () => {
  // The whole point of the redesign. The evening message used to go out every
  // single day carrying nothing but a request. A day with no fact and no due
  // question now produces NO message at all — and a named reason, because a
  // quiet evening is a result, not a failure.
  const d = decideDailyPulse(input({ hasGround: false, askDue: false }));
  assertEquals(d.decision, "skip");
  if (d.decision === "skip") assertEquals(d.reason, "nothing_to_say");
});

Deno.test("an empty day NEVER cancels a due question", () => {
  // The structural half of "activity never suppresses the question", stated the
  // other way round: the two inputs are separate so that neither can eat the
  // other. A student who logged nothing is exactly the one whose livability we
  // most need to hear about.
  const d = decideDailyPulse(input({ hasGround: false, askDue: true }));
  assertEquals(d.decision, "send");
  if (d.decision === "send") assertEquals(d.ask, true);
});

Deno.test("a full day with no question due sends the fact ALONE", () => {
  // ...and this is the give-without-taking case that did not exist before.
  const d = decideDailyPulse(input({ hasGround: true, askDue: false }));
  assertEquals(d.decision, "send");
  if (d.decision === "send") assertEquals(d.ask, false);
});

// ---------------------------------------------------------------------------
// THE CADENCE — the actual lever on "this is annoying"
// ---------------------------------------------------------------------------

function cadence(over: Partial<AskCadenceInput> = {}): AskCadenceInput {
  return {
    daysSinceLastAsk: null,
    lastAnsweredLevel: null,
    unansweredStreak: 0,
    ...over,
  };
}

Deno.test("never asked: we bootstrap, because you cannot measure without starting", () => {
  const d = decideAskCadence(cadence());
  assertEquals(d.ask, true);
  assertEquals(d.reason, "never_asked");
});

Deno.test("the nominal interval holds the question back on the days between", () => {
  for (let days = 0; days < PULSE_ASK_INTERVAL_DAYS; days++) {
    const d = decideAskCadence(
      cadence({ daysSinceLastAsk: days, lastAnsweredLevel: "good" }),
    );
    assertEquals(d.ask, false, `${days} days`);
    assertEquals(d.reason, "too_soon");
  }
  const due = decideAskCadence(
    cadence({ daysSinceLastAsk: PULSE_ASK_INTERVAL_DAYS, lastAnsweredLevel: "good" }),
  );
  assertEquals(due.ask, true);
  assertEquals(due.reason, "interval_reached");
});

Deno.test("a 'rough' day escalates to daily: that signal is why the loop exists", () => {
  const d = decideAskCadence(
    cadence({ daysSinceLastAsk: PULSE_ASK_INTERVAL_WHEN_HARD, lastAnsweredLevel: "hard" }),
  );
  assertEquals(d.ask, true);
  assertEquals(d.reason, "escalated_after_hard");
  assertEquals(d.intervalDays, PULSE_ASK_INTERVAL_WHEN_HARD);

  // ...AND ITS DISARMING CONDITION: the escalation is not "ask forever". Same
  // day means same day — the `already_sent_today` gate and this one agree.
  assertEquals(
    decideAskCadence(
      cadence({ daysSinceLastAsk: 0, lastAnsweredLevel: "hard" }),
    ).ask,
    false,
  );
});

Deno.test("two ignored questions BEAT the 'rough' escalation, and that is the arbitration", () => {
  // The least obvious call in the module, and the one most likely to be
  // "fixed" by someone reading the escalation on its own. A student who
  // answered `hard` and then went quiet twice must NOT be asked daily: that is
  // precisely the profile a daily interrogation drives away. The evening fact
  // keeps going out either way, so the channel does not go cold.
  const d = decideAskCadence(
    cadence({
      daysSinceLastAsk: PULSE_ASK_INTERVAL_WHEN_HARD,
      lastAnsweredLevel: "hard",
      unansweredStreak: PULSE_IGNORED_STREAK,
    }),
  );
  assertEquals(d.ask, false);
  assertEquals(d.reason, "backing_off");
  assertEquals(d.intervalDays, PULSE_ASK_INTERVAL_WHEN_IGNORED);

  // The back-off is a delay, not a mute: the question returns after a week.
  assertEquals(
    decideAskCadence(
      cadence({
        daysSinceLastAsk: PULSE_ASK_INTERVAL_WHEN_IGNORED,
        lastAnsweredLevel: "hard",
        unansweredStreak: 5,
      }),
    ).ask,
    true,
  );
});

Deno.test("one ignored question is not a pattern: the interval stays nominal", () => {
  const d = decideAskCadence(
    cadence({ daysSinceLastAsk: PULSE_ASK_INTERVAL_DAYS, unansweredStreak: 1 }),
  );
  assertEquals(d.ask, true);
  assertEquals(d.intervalDays, PULSE_ASK_INTERVAL_DAYS);
});

// ---------------------------------------------------------------------------
// R3 — LE VERROU: LA QUESTION D'ÉTAT N'EST PAS QUOTIDIENNE
//
// ── POURQUOI CE VERROU EXISTE, ET CE QU'IL ATTRAPE ─────────────────────────
// « Le "comment tu te sens ?" quotidien » est HORS PÉRIMÈTRE
// (`docs/fonctionnalites/conversation/README.md`, « Hors périmètre —
// engageant »). Le tap n'est PAS supprimé pour autant: il garde un
// consommateur — l'axe faim alimente FF-027, et le message du soir est le
// véhicule de FF-029 et FF-028. Ce qui est interdit, c'est la CADENCE
// quotidienne, pas la question.
//
// Les tests ci-dessus décrivent tous la cadence en fonction de
// `PULSE_ASK_INTERVAL_DAYS`, donc ils restent VERTS si quelqu'un ramène la
// constante à 1: la boucle `days < PULSE_ASK_INTERVAL_DAYS` ne tourne plus
// qu'une fois et continue de passer. Un test paramétré par la constante qu'il
// devrait protéger ne protège rien. D'où les deux épreuves qui suivent: l'une
// pinne la VALEUR, l'autre simule sept jours et compte.
// ---------------------------------------------------------------------------

Deno.test("R3 — la cadence vaut 3 jours, et la valeur est PINNÉE avec son pourquoi", () => {
  // Trois et pas un: à un jour le tap redevient le formulaire quotidien que le
  // produit démonte. Trois et pas sept: au-dessus, la mesure devient trop
  // grossière pour dire à un coach qu'une semaine s'est dégradée.
  //
  // Changer ce chiffre est une DÉCISION PRODUIT, pas un réglage: elle se prend
  // dans `docs/fonctionnalites/conversation/README.md` avant de se prendre ici.
  // Si cette ligne casse, c'est le rappel que la décision manque — pas une
  // valeur à mettre à jour pour faire passer la suite.
  assertEquals(PULSE_ASK_INTERVAL_DAYS, 3);

  // Et les deux bornes qui l'encadrent, pour la même raison: l'escalade est le
  // SEUL chemin qui autorise un rythme quotidien, et elle est conditionnée à un
  // `hard` déclaré. Une escalade dont la condition tomberait rendrait la
  // question quotidienne pour tout le monde, sans toucher à la constante
  // ci-dessus.
  assertEquals(PULSE_ASK_INTERVAL_WHEN_HARD, 1);
  assertEquals(PULSE_ASK_INTERVAL_WHEN_IGNORED, 7);
});

Deno.test("R3 — sur 7 jours consécutifs ordinaires, la question part au plus ⌈7/3⌉ fois", () => {
  // « Ordinaire » = aucune situation particulière: l'élève répond, et il ne
  // déclare pas `hard`. C'est le pire cas pour le nombre de questions —
  // répondre remet `unansweredStreak` à zéro, donc rien ne déclenche le repli
  // qui espacerait davantage. Le silence, lui, est testé juste en dessous.
  const DAYS = 7;
  // ⌈7/3⌉ = 3, ÉCRIT EN DUR et pas dérivé de la constante. Le dériver
  // (`Math.ceil(DAYS / PULSE_ASK_INTERVAL_DAYS)`) rendrait ce test vert pour
  // TOUTE valeur de la constante, y compris 1 — c'est-à-dire exactement le
  // défaut des tests d'au-dessus, reproduit dans le verrou censé le corriger.
  const CEILING = 3;

  let asked = 0;
  let daysSinceLastAsk: number | null = null;
  const journal: string[] = [];

  for (let day = 1; day <= DAYS; day++) {
    const decision = decideAskCadence({
      daysSinceLastAsk,
      lastAnsweredLevel: "good",
      unansweredStreak: 0,
    });
    journal.push(`j${day}:${decision.ask ? "ASK" : decision.reason}`);
    if (decision.ask) {
      asked++;
      daysSinceLastAsk = 0;
    } else if (daysSinceLastAsk !== null) {
      daysSinceLastAsk++;
    }
    // Un jour passe. `daysSinceLastAsk === null` ne dure que jusqu'au premier
    // envoi: « jamais posée » est un état d'amorçage, pas un état stable.
    if (daysSinceLastAsk === 0) daysSinceLastAsk = 1;
  }

  assertEquals(
    asked <= CEILING,
    true,
    `${asked} questions sur ${DAYS} jours (plafond ${CEILING}) — ${journal.join(" ")}`,
  );
  // Et pas zéro non plus: un tap qui ne part jamais ne mesure rien, et FF-027
  // n'aurait plus d'axe faim à lire. Le retrait vise la cadence, pas la mesure.
  assert(asked >= 2, `${asked} question(s) — le tap doit rester vivant`);
});

Deno.test("R3 — le FAIT du soir, lui, peut partir chaque soir: c'est le véhicule", () => {
  // La dissymétrie est tout l'objet du retrait. La question est plafonnée à une
  // tous les trois jours; le fait sort chaque soir où il y a matière, parce
  // qu'il DONNE au lieu de demander (`evening-message-give-before-ask`). Un
  // test qui ne vérifierait que la rareté de la question laisserait quelqu'un
  // « simplifier » en coupant le message entier.
  for (let day = 1; day <= 7; day++) {
    const d = decideDailyPulse(input({
      hasGround: true,
      // La question n'est PAS due — c'est justement le cas à couvrir.
      askDue: false,
    }));
    assertEquals(d.decision, "send", `jour ${day}`);
    if (d.decision === "send") assertEquals(d.ask, false, `jour ${day}`);
  }
});

Deno.test("R3 — une question restée sans réponse ne se relance pas le lendemain", () => {
  // Le troisième interdit du filet: « ni relance d'une question restée sans
  // réponse ». Deux chemins la portent, et il faut les deux — la garde du jour
  // (`already_sent_today`) empêche le second tick de la MÊME soirée, le repli
  // sur silence empêche le lendemain.
  const sameEvening = decideDailyPulse(input({ sentToday: true, askDue: true }));
  assertEquals(sameEvening.decision, "skip");
  if (sameEvening.decision === "skip") {
    assertEquals(sameEvening.reason, "already_sent_today");
  }

  // Et sur sept jours de silence complet: le repli rend la question PLUS rare
  // que la cadence nominale, jamais plus fréquente.
  let asked = 0;
  let daysSinceLastAsk: number | null = null;
  let unansweredStreak = 0;
  for (let day = 1; day <= 7; day++) {
    const d = decideAskCadence({
      daysSinceLastAsk,
      // L'élève s'est tu: il n'y a AUCUN niveau répondu, donc pas d'escalade
      // `hard` possible. C'est ce qui rend l'arbitrage lisible.
      lastAnsweredLevel: null,
      unansweredStreak,
    });
    if (d.ask) {
      asked++;
      unansweredStreak++;
      daysSinceLastAsk = 1;
    } else if (daysSinceLastAsk !== null) {
      daysSinceLastAsk++;
    }
  }
  // 3 en dur, pour la raison écrite au-dessus. Le silence doit faire MOINS que
  // la cadence nominale, donc ce plafond est déjà généreux.
  assertEquals(asked <= 3, true, `${asked} questions sur 7 jours de silence`);
});

// ---------------------------------------------------------------------------
// THE MESSAGE — three shapes, and the invariant that binds them
// ---------------------------------------------------------------------------

Deno.test("no buttons without a question, no question without buttons", () => {
  // Buttons under a plain statement would demand an answer to a message that
  // wants none. A question with no buttons is worse: `readPulseReply` only ever
  // reads button ids, so a typed reply goes to the dispatcher and the day is
  // never measured at all.
  const factOnly = renderPulseMessage({ recapBody: "Ticked off today: Oats.", ask: false });
  assertEquals(factOnly.buttons.length, 0);
  assertEquals(factOnly.body, "Ticked off today: Oats.");

  const askOnly = renderPulseMessage({ recapBody: null, ask: true });
  assertEquals(askOnly.buttons.length, 3);
  assertEquals(askOnly.body, "How was today?");

  const both = renderPulseMessage({ recapBody: "Ticked off today: Oats.", ask: true });
  assertEquals(both.buttons.length, 3);
  // The blank line is load-bearing, not cosmetic: run together, the count reads
  // as the preamble to the question, which is the measurement bias the recap
  // exists to avoid.
  assertEquals(both.body, "Ticked off today: Oats.\n\nHow was today?");
});

Deno.test("neither ground nor ask cannot be rendered — the decider already refused it", () => {
  // A throw rather than an empty bubble: `nothing_to_say` is a decision, and a
  // caller that reaches the renderer without it has bypassed the decision.
  let threw = false;
  try {
    renderPulseMessage({ recapBody: null, ask: false });
  } catch {
    threw = true;
  }
  assert(threw);
  // Whitespace is not a fact either.
  let threwOnBlank = false;
  try {
    renderPulseMessage({ recapBody: "   \n ", ask: false });
  } catch {
    threwOnBlank = true;
  }
  assert(threwOnBlank);
});

// ---------------------------------------------------------------------------
// THE BUTTONS — Meta's hard limits
// ---------------------------------------------------------------------------

Deno.test("exactly 3 buttons, titles under 20 chars (Meta's cap)", () => {
  for (const set of [pulseLevelButtons(), pulseAxisButtons()]) {
    assertEquals(set.length, 3);
    for (const b of set) {
      assert(b.title.length <= 20, `${b.title} is ${b.title.length} chars`);
      assert(b.id.length > 0);
    }
  }
});

Deno.test("the labels are PINNED: they must match the approved Meta template", () => {
  // These five strings exist twice: here, and in the `keel_daily_pulse_v1`
  // template submitted to Meta (docs/nutrition-pivot/META-TEMPLATES.md).
  // Inside the 24h window our code renders the message; outside it Meta's
  // template does. A rename here that "reads better" silently gives the same
  // student two different products depending on the hour — and the template
  // cannot be re-approved as fast as a string is edited.
  assertEquals(renderPulseQuestion().body, "How was today?");
  assertEquals(pulseLevelButtons().map((b) => b.title), [
    "All good",
    "So-so",
    "Rough",
  ]);
});

Deno.test("button ids round-trip through the reply reader", () => {
  for (const level of PULSE_LEVELS) {
    assertEquals(readPulseReply(pulseLevelButtonId(level)), { kind: "level", level });
  }
  for (const axis of PULSE_AXES) {
    assertEquals(readPulseReply(pulseAxisButtonId(axis)), { kind: "axis", axis });
  }
});

Deno.test("the reader is DETERMINISTIC and refuses free text", () => {
  // §3.1: exact identifiers are deterministic; meaning goes to the LLM. A text
  // fallback would let a conversational 'moyen' be read as a tap answer.
  for (const notAButton of ["moyen", "Ça roule", "", null, undefined, "KEEL_PULSE_", "KEEL_PULSE_WAT"]) {
    assertEquals(readPulseReply(notAButton as string).kind, "none", String(notAButton));
  }
});

// ---------------------------------------------------------------------------
// THE AXIS FOLLOW-UP
// ---------------------------------------------------------------------------

Deno.test("the axis is asked ONLY when something went wrong", () => {
  assertEquals(needsAxisFollowUp("good"), false);
  assertEquals(needsAxisFollowUp("mixed"), true);
  assertEquals(needsAxisFollowUp("hard"), true);
});

Deno.test("the two questions render with their buttons", () => {
  const q = renderPulseQuestion();
  assertEquals(q.body, "How was today?");
  assertEquals(q.buttons.map((b) => b.title), ["All good", "So-so", "Rough"]);
  const a = renderPulseAxisQuestion();
  assertEquals(a.body, "What was hard?");
  assertEquals(a.buttons.map((b) => b.title), ["Energy", "Hunger", "Sleep"]);
});

Deno.test("every button title fits Meta's 20-character ceiling", () => {
  // `whatsapp-send` tronque silencieusement au-delà. Un libellé tronqué serait
  // à la fois moche et DIFFÉRENT de celui du template Meta approuvé, donc deux
  // expériences selon qu'on est dans la fenêtre 24h ou non.
  for (const b of [...pulseLevelButtons(), ...pulseAxisButtons()]) {
    assert(b.title.length <= 20, `${b.title} is ${b.title.length} chars`);
  }
});

Deno.test("the ack never comments, consoles or bounces back", () => {
  // 'Dur' followed by 'courage, demain ira mieux' is ungrounded tenderness —
  // proscribed by the repo's own doctrine, and unbearable daily.
  const acks = [
    renderPulseAck("good", null),
    renderPulseAck("hard", "hunger"),
    renderPulseAck("mixed", "sleep"),
  ];
  for (const ack of acks) {
    assert(ack.length <= 20, ack);
    assert(!/courage|demain|bravo|dommage|essaie/i.test(ack), ack);
  }
});

// ---------------------------------------------------------------------------
// Le repli template hors fenêtre 24h
// ---------------------------------------------------------------------------

Deno.test("the template payloads follow the SAME order as the native buttons", () => {
  // Le contrat le plus silencieux du pivot. Meta ne renvoie pas le libellé du
  // bouton tapé, il renvoie le payload attaché à son INDEX. Deux boutons
  // inversés entre le template et le rendu natif = « Rough » enregistré pour
  // un élève qui a tapé « All good », sans erreur et sans trace.
  const buttons = pulseLevelButtons();
  const components = pulseTemplateButtonComponents(buttons) as Array<
    Record<string, unknown>
  >;
  assertEquals(components.length, buttons.length);
  components.forEach((component, index) => {
    assertEquals(component.type, "button");
    assertEquals(component.sub_type, "quick_reply");
    // L'index part en CHAÎNE chez Meta. Un nombre y est refusé.
    assertEquals(component.index, String(index));
    const params = component.parameters as Array<Record<string, unknown>>;
    assertEquals(params.length, 1);
    assertEquals(params[0].type, "payload");
    assertEquals(params[0].payload, buttons[index].id);
  });
});

Deno.test("the template carries the payloads the reader actually accepts", () => {
  // Un payload que `readPulseReply` ne sait pas lire est un tap perdu: l'élève
  // a répondu, le produit n'a rien enregistré.
  const components = pulseTemplateButtonComponents(pulseLevelButtons()) as Array<
    Record<string, unknown>
  >;
  for (const component of components) {
    const params = component.parameters as Array<Record<string, unknown>>;
    const reply = readPulseReply(String(params[0].payload));
    assert(reply, `payload ${params[0].payload} unreadable`);
  }
});

Deno.test("PRÉMISSE FAUSSE: no buttons, no components — never a bare index", () => {
  assertEquals(pulseTemplateButtonComponents([]), []);
});
