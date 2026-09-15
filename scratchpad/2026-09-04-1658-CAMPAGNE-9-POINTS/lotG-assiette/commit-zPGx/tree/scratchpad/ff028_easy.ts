/**
 * FF-028 · EASY — le cas nominal de la fiche §8, joué trois fois.
 *
 *   faim récurrente + deux adaptations insuffisantes + rythme à deux repas
 *   ⇒ le soir, UNE proposition « on ajoute un petit-déjeuner ? » à deux boutons
 *   ⇒ tap « Oui » ⇒ la directive est EN BASE, RELUE, et le rythme la porte.
 */
import {
  deliveredProposal,
  makeFixture,
  proposalsOf,
  purge,
  purgeCoach,
  rhythmOf,
  runEngine,
  tap,
  askLedgerOf,
} from "./ff028_harness.ts";

const results: unknown[] = [];

for (const run of [1, 2, 3]) {
  const fx = await makeFixture();
  try {
    const engine = await runEngine(fx);
    const proposal = await deliveredProposal(fx.student.userId);
    const rows = await proposalsOf(fx.student.userId);
    const before = await rhythmOf(fx.student.userId);

    const accept = proposal?.buttons.find((b) => b.payload.includes("ACCEPT"));
    const tapped = accept
      ? await tap(fx.student, accept.payload, "Yes, add it")
      : null;

    const after = await rhythmOf(fx.student.userId);
    const rowsAfter = await proposalsOf(fx.student.userId);
    const ledger = await askLedgerOf(fx.student.userId);

    results.push({
      run,
      today: fx.today,
      engine: {
        analysed: engine.analysed,
        proposed: engine.proposed,
        actions: engine.proposed_actions,
        silent_reasons: engine.silent_reasons,
        failures: engine.failures,
      },
      delivered_text: proposal?.content ?? null,
      buttons: proposal?.buttons.map((b) => b.label) ?? [],
      db_row: rows[0]
        ? {
          action: rows[0].action_id,
          state: rows[0].state,
          fingerprint: rows[0].plan_fingerprint,
          chat_message_id: Boolean(rows[0].chat_message_id),
        }
        : null,
      rhythm_before: before,
      tap_reply: tapped?.reply ?? null,
      rhythm_after: after,
      db_after: rowsAfter[0]
        ? { state: rowsAfter[0].state, applied_at: Boolean(rowsAfter[0].applied_at) }
        : null,
      ask_ledger: ledger.map((r) => ({ kind: r.ask_kind, axis: r.axis })),
      verdict: proposal &&
          rows[0]?.action_id === "add_breakfast" &&
          after.includes("breakfast") &&
          rowsAfter[0]?.state === "accepted" &&
          Boolean(rowsAfter[0]?.applied_at)
        ? "GREEN"
        : "RED",
    });
  } finally {
    await purge(fx.student.userId);
    await purgeCoach(fx.coach);
  }
}

// ⚠️ FICHIER, PAS STDOUT. Le moteur est importé DANS ce processus, donc ses
// `console.info` (« keel.doctrine.variant », les lignes de proposition) sortent
// sur la même sortie standard. Un rapport mêlé aux logs du produit n'est plus
// lisible par une machine — et un harnais qu'on ne peut pas lire est un harnais
// qu'on finit par croire sur parole.
Deno.writeTextFileSync(
  "scratchpad/ff028_easy_results.json",
  JSON.stringify(results, null, 2),
);
console.log("\n=== FF-028 EASY ===");
for (const r of results as any[]) {
  console.log(
    `run ${r.run}: ${r.verdict} | action=${r.db_row?.action} | fp=${r.db_row?.fingerprint} | ` +
      `rhythm ${r.rhythm_before} -> ${r.rhythm_after} | ack="${r.tap_reply}" | ` +
      `ledger=${JSON.stringify(r.ask_ledger)}`,
  );
}
