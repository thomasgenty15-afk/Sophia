// Doctrine P9 — every belt ships with its DISARMAMENT CONDITION and the test
// of that condition (the "false-premise test").
//
// A belt with no disarmament condition is a belt that fires forever; a
// disarmament condition with no test is a belt nobody knows is dead. This file
// asserts both directions, mechanically, over the whole lexicon:
//
//   1. ARMED       — every entry fires on its own probe. No permanently
//                    disarmed belt can hide in the lexicon.
//   2. DISARMABLE  — for every (entry, condition) pair declared in
//                    `disarmable_by`, the SAME lexical shape carrying a FALSE
//                    PREMISE does not fire. This is the false-premise test.
//   3. LIVE GUARD  — every condition in `DisarmId` is declared by at least one
//                    entry AND is observed disarming at least one real message.
//                    A guard nobody can reach is a guard that lies in review.
//   4. SCOPED      — scope-based conditions (task/product, effort/accident,
//                    self-deprecation) are NEVER offered to the unambiguous
//                    danger-to-life belts. "je veux me suicider, mon boulot me
//                    detruit" must keep firing.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { runSafetyPregate } from "./safety_pregate.ts";
import {
  DISARM_CONDITION_BY_ID,
  DISARM_CONDITIONS,
  type DisarmId,
  SAFETY_LEXICON,
} from "./safety_lexicon.ts";

Deno.test("P9/1 armed: every lexicon entry fires on its own probe", () => {
  for (const entry of SAFETY_LEXICON) {
    const out = runSafetyPregate({ user_message: entry.probe });
    assert(
      out.matches.some((m) => m.entry_id === entry.id),
      `${entry.id} is DEAD: probe "${entry.probe}" produced ${
        JSON.stringify(out.matches.map((m) => m.entry_id))
      } (disarmed: ${JSON.stringify(out.disarmed)})`,
    );
    assertEquals(
      out.detected,
      true,
      `${entry.id}: probe must set detected`,
    );
  }
});

Deno.test("P9/2 false premise: each declared condition silences its entry", () => {
  for (const entry of SAFETY_LEXICON) {
    assert(
      entry.disarmable_by.length > 0,
      `${entry.id}: a belt with NO disarmament condition is forbidden (P9)`,
    );
    for (const id of entry.disarmable_by) {
      const condition = DISARM_CONDITION_BY_ID[id];
      assert(condition, `${entry.id}: unknown disarm condition ${id}`);
      const message = condition.falsePremise({
        probe: entry.probe,
        lang: entry.lang,
        entry,
      });
      const out = runSafetyPregate({ user_message: message });
      assert(
        !out.matches.some((m) => m.entry_id === entry.id),
        `${entry.id} still fires under false premise "${id}": "${message}" -> ${out.risk_band}`,
      );
      assert(
        out.disarmed.some((d) => d.entry_id === entry.id),
        `${entry.id}: false premise "${id}" silenced the belt without recording why ("${message}")`,
      );
    }
  }
});

Deno.test("P9/3 live guard: every disarm condition is reachable and observed", () => {
  const declared = new Set<DisarmId>();
  for (const entry of SAFETY_LEXICON) {
    for (const id of entry.disarmable_by) declared.add(id);
  }
  const observed = new Set<DisarmId>();
  for (const entry of SAFETY_LEXICON) {
    for (const id of entry.disarmable_by) {
      const message = DISARM_CONDITION_BY_ID[id].falsePremise({
        probe: entry.probe,
        lang: entry.lang,
        entry,
      });
      for (const item of runSafetyPregate({ user_message: message }).disarmed) {
        observed.add(item.condition);
      }
    }
  }
  for (const condition of DISARM_CONDITIONS) {
    assert(
      declared.has(condition.id),
      `${condition.id} is declared by no entry: dead guard`,
    );
    assert(
      observed.has(condition.id),
      `${condition.id} never disarmed anything: unreachable guard`,
    );
    assert(
      condition.description.trim().length > 20,
      `${condition.id}: a disarm condition must be documented in place`,
    );
  }
});

Deno.test("P9/4 scoped: the unambiguous danger-to-life belts refuse scope disarms", () => {
  const SCOPE_ONLY: DisarmId[] = [
    "task_or_product_referent",
    "scoped_self_deprecation",
  ];
  const UNAMBIGUOUS = new Set([
    "fr_suicide_verb",
    "fr_end_life",
    "fr_throw_self",
    "fr_self_harm",
    "fr_mutilate",
    "fr_cut_veins",
    "en_kill_self",
    "en_end_life",
    "en_jump_off",
    "en_self_harm",
  ]);
  for (const entry of SAFETY_LEXICON) {
    if (!UNAMBIGUOUS.has(entry.id)) continue;
    for (const id of SCOPE_ONLY) {
      assert(
        !entry.disarmable_by.includes(id),
        `${entry.id} must not be silenceable by ${id}`,
      );
    }
  }
});

Deno.test("P9/4 scoped: a work complaint does not silence an explicit intent", () => {
  // The concrete regression this guards: a scope word ("boulot") appearing in
  // the same sentence as a lethal phrase.
  const cases = [
    "je veux me suicider, mon boulot me detruit",
    "i want to kill myself, this project at work is destroying me",
    "je veux me faire du mal, ce dossier me rend fou",
  ];
  for (const message of cases) {
    const out = runSafetyPregate({ user_message: message });
    assert(
      out.risk_band === "high" || out.risk_band === "critical",
      `${message} -> ${out.risk_band} (${JSON.stringify(out.disarmed)})`,
    );
  }
});

Deno.test("P9 disarm: historical disclosure re-arms on a present anchor", () => {
  // The disarmament condition itself carries a condition: distant past only
  // silences the belt while nothing anchors the message in the present.
  const historical = runSafetyPregate({
    user_message: "quand j'etais ado je voulais me suicider",
  });
  assertEquals(historical.risk_band, "none");
  assert(
    historical.disarmed.some((d) => d.condition === "historical_distant"),
  );

  const returning = runSafetyPregate({
    user_message: "quand j'etais ado je voulais me suicider et ca revient",
  });
  assert(
    returning.risk_band === "high" || returning.risk_band === "critical",
    `present anchor must re-arm the belt, got ${returning.risk_band}`,
  );
});

Deno.test("P9 disarm: humor register does not silence a plain crisis line", () => {
  // A guard that fires on anything is a bypass. `lol` must not be a magic word
  // when it sits in another sentence than the crisis line.
  const out = runSafetyPregate({
    user_message: "le chat a fait tomber la plante lol. je veux me suicider.",
  });
  assert(
    out.risk_band === "high" || out.risk_band === "critical",
    `sentence-scoped humor guard leaked: ${out.risk_band}`,
  );
});

Deno.test("P9 disarm: negation is clause-scoped, not sentence-scoped", () => {
  // "pas" belongs to the first clause; the crisis statement is in the second.
  const out = runSafetyPregate({
    user_message: "je ne suis pas bien et j'ai envie de mourir",
  });
  assertEquals(out.risk_band, "medium");
});
