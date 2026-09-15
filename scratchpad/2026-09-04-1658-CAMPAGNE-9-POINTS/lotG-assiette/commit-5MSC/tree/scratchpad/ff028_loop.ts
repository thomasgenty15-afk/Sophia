/**
 * FF-028 · A12 — LA BOUCLE FERMÉE, POUR DE VRAI.
 *
 * « Acceptée mais la composition suivante l'ignore » est LE red de §7. On ne le
 * prouve pas en relisant une colonne: on relance une composition RÉELLE
 * (`generate-meal-v1`, vrai modèle, vraie fonction edge) et on regarde si le
 * moment accepté est dans l'assiette.
 *
 * A9 voyage avec: une préférence CONTRADICTOIRE est écrite entre l'acceptation
 * et la composition, et on mesure ce que le générateur en fait.
 */
import {
  admin,
  callAs,
  deliveredProposal,
  makeFixture,
  purge,
  purgeCoach,
  rhythmOf,
  runEngine,
  tap,
} from "./ff028_harness.ts";

const out: unknown[] = [];

// --- A12: la boucle nue -----------------------------------------------------
for (const run of (Deno.env.get("FF028_SKIP_A12") ? [] : [1, 2, 3])) {
  const fx = await makeFixture({});
  try {
    await runEngine(fx);
    const p = await deliveredProposal(fx.student.userId);
    const yes = p!.buttons.find((b) => b.payload.includes("ACCEPT"))!;
    await tap(fx.student, yes.payload, "Yes, add it");
    const rhythm = await rhythmOf(fx.student.userId);

    const gen = await callAs(fx.student, "generate-meal-v1", {
      mode: "to_shop",
      window: { kind: "days", count: 1 },
      intent: "prepare_next",
      servings: 1,
    });
    const dishes = (gen.json?.meal?.dishes ?? gen.json?.dishes ?? []) as Array<
      Record<string, unknown>
    >;
    const slots = dishes.map((d) => String(d.slot ?? d.meal_slot ?? ""));
    out.push({
      id: "A12",
      run,
      rhythm,
      status: gen.status,
      slots,
      titles: dishes.map((d) => String(d.title ?? "")).slice(0, 6),
      verdict: gen.status === 200 && slots.includes("breakfast")
        ? "GREEN"
        : gen.status !== 200
        ? "NOT_TESTABLE"
        : "RED",
      error: gen.status !== 200 ? gen.json : undefined,
    });
  } finally {
    await purge(fx.student.userId);
    await purgeCoach(fx.coach);
  }
}

// --- A9: la préférence contradictoire captée APRÈS l'acceptation ------------
for (const run of [1, 2, 3]) {
  const fx = await makeFixture({});
  try {
    await runEngine(fx);
    const p = await deliveredProposal(fx.student.userId);
    const yes = p!.buttons.find((b) => b.payload.includes("ACCEPT"))!;
    await tap(fx.student, yes.payload, "Yes, add it");
    const rhythm = await rhythmOf(fx.student.userId);

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

    const gen = await callAs(fx.student, "generate-meal-v1", {
      mode: "to_shop",
      window: { kind: "days", count: 1 },
      intent: "prepare_next",
      servings: 1,
    });
    const dishes = (gen.json?.meal?.dishes ?? gen.json?.dishes ?? []) as Array<
      Record<string, unknown>
    >;
    out.push({
      id: "A9",
      run,
      rhythm_after_accept: rhythm,
      preference_written: "I never eat anything in the morning",
      status: gen.status,
      slots: dishes.map((d) => String(d.slot ?? d.meal_slot ?? "")),
      titles: dishes.map((d) => String(d.title ?? "")),
      note: gen.json?.note ?? gen.json?.meal?.note ?? null,
      error: gen.status !== 200 ? gen.json : undefined,
    });
  } finally {
    await purge(fx.student.userId);
    await purgeCoach(fx.coach);
  }
}

Deno.writeTextFileSync(
  "scratchpad/ff028_loop_results.json",
  JSON.stringify(out, null, 2),
);
console.log("\n=== FF-028 BOUCLE ===");
for (const r of out as any[]) {
  console.log(
    `${r.id}${r.run ? ` run ${r.run}` : ""}: ${r.verdict ?? "-"} status=${r.status} slots=${
      JSON.stringify(r.slots)
    }`,
  );
}
