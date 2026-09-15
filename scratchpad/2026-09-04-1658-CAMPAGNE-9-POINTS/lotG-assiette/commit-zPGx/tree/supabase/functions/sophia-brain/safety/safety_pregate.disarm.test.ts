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
  normalizeForSafety,
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


// ---------------------------------------------------------------------------
// LIGATURES (lot S1d, 2026-08-22) — THE SAME WOUND, THE OPPOSITE MECHANISM
// ---------------------------------------------------------------------------
//
// BEFORE, measured 2026-08-22 03:52:56 CEST, before any line of fix:
//   "ma soeur je veux en finir" (digraph)  => disarmed third_party, band none
//   "ma soeur je veux en finir" (ligature) => detected, band high
// Over the whole table: 16 of 16 French entries disarmable by
// `third_party_referent` diverged. Agreement 0/16 = 0 %.
//
// STOP -- THE MECHANISM IS NOT THE ONE OF THE FOUR SIBLING FLOORS, and the
// difference is why this belt is fixed in `normalizeForSafety` and not by
// adding a spelling to `THIRD_PARTY_MARKERS`. Those four run a `[^a-z0-9\s]`
// filter which DESTROYS the ligature into a space. This lane has no such
// filter: the ligature comes through UNCHANGED and reaches the regex engine,
// where the ASCII literal `soeur` simply fails to match it.
//
// The consequence is inverted too. There, the ligature killed a DETECTION.
// Here it kills a DISARM -- and since no lexicon pattern carries a digraph
// (a test below asserts that), in this lane the ligature can only ever
// OVER-trigger, never under-trigger. Someone telling us about their SISTER was
// read as being in crisis themselves.
//
// These five tests are the S1 tripod, copied: one that ALIGNS (the sweep, with
// its cardinality assertion -- an empty sweep is green for nothing, scar
// `V0-B-bis`), one that STILL FIRES (without it a broken normalizer that
// disarmed everything would look exactly like a guard that works), one that
// NAMES the behaviour change, and two that STATE AN ABSENCE.

/** The digraph spelling of a ligature string. */
function digraphSafety(s: string): string {
  return s.replace(/œ/g, "oe").replace(/æ/g, "ae");
}

/** A verdict, compared as a whole -- never "returns this id". */
function verdictSafety(message: string): string {
  const out = runSafetyPregate({ user_message: message });
  return JSON.stringify({
    detected: out.detected,
    band: out.risk_band,
    codes: out.reason_codes.slice().sort(),
    third: out.disarmed.some((d) => d.condition === "third_party_referent"),
  });
}

Deno.test("LIGATURE sweep: every FR entry disarmable by third_party agrees in BOTH spellings", () => {
  // The sweep is written on the TABLE, not on a copied list: the day someone
  // adds a French entry, it walks in here on its own.
  const eligible = SAFETY_LEXICON.filter(
    (e) => e.lang === "fr" && e.disarmable_by.includes("third_party_referent"),
  );

  // STOP -- THE CARDINALITY ASSERTION, and it is not decorative: a loop over
  // zero cases is green without having proven anything.
  assert(
    eligible.length >= 1,
    "empty sweep -- a sweep that covers nothing is not a proof",
  );
  assertEquals(
    eligible.length,
    16,
    "the French third-party-disarmable population moved -- re-read the measure",
  );

  for (const entry of eligible) {
    const bare = entry.probe;
    const digraph = `ma soeur ${bare}`;
    const lig = `ma s\u0153ur ${bare}`;
    assert(lig !== digraph, `${entry.id}: degenerate, no ligature produced`);

    // (1) THE PREMISE. Without the carrier the probe MUST fire; with the
    //     digraph carrier it MUST be disarmed. Without this, comparing two
    //     identical nulls would prove nothing.
    assert(
      verdictSafety(bare) !== verdictSafety(digraph),
      `${entry.id}: the carrier changes nothing -- broken premise`,
    );

    // (2) THE EQUIVALENCE OF THE TWO SPELLINGS, which is the lot's criterion.
    assertEquals(
      verdictSafety(lig),
      verdictSafety(digraph),
      `${entry.id}: both spellings must return the SAME verdict`,
    );
    assertEquals(digraphSafety(lig), digraph, `${entry.id}: round trip broken`);
  }
});

Deno.test("LIGATURE: the belt still fires when the crisis IS the user's", () => {
  // Without this case, a normalizer that disarmed EVERYTHING would look exactly
  // like a guard that works. The unfold must not open a bypass: writing the
  // ligature somewhere in the message is not a magic word.
  const own = runSafetyPregate({
    user_message: "j'ai mangé des \u0153ufs et je veux en finir",
  });
  assert(
    own.risk_band === "high" || own.risk_band === "critical",
    `a first-person crisis line must keep firing, got ${own.risk_band}`,
  );

  // And a neutral message carrying a ligature stays neutral.
  for (
    const neutral of [
      "ma s\u0153ur cuisine tres bien",
      "j'ai mange des \u0153ufs ce matin",
    ]
  ) {
    const out = runSafetyPregate({ user_message: neutral });
    assertEquals(out.detected, false, neutral);
    assertEquals(out.risk_band, "none", neutral);
  }
});

Deno.test("LIGATURE: the third-party disarm CHANGES BEHAVIOUR, and it is said here", () => {
  // STOP -- THIS TEST STATES A BEHAVIOUR CHANGE, and it must be read as one.
  // Measured 2026-08-22 03:52:56 CEST, BEFORE the fix:
  //   "ma s(oe)ur je veux en finir" ligature => detected, band high
  //   "ma soeur je veux en finir"   digraph  => disarmed, band none
  // Two spellings, two verdicts -- and here the WRONG one was the alarming one:
  // this lane OVER-triggered under the ligature.
  //
  // The unfold aligns both on the digraph behaviour, which is the one the
  // author wrote and tested: `third_party_referent` is a UNIVERSAL_DISARM,
  // declared by every entry in this list. We are not choosing between two
  // behaviours, we are choosing between ONE and TWO (registry entry 24).
  //
  // WARNING -- this LOWERS a band on a crisis path, from `high` to `none`, for
  // the ligature spelling only. That is not a weakened floor: the floor's own
  // design disarms third-party reports, and the ligature was escaping a
  // designed disarm by accident. The reverse repair -- making `ma soeur` fire
  // -- would change what the belt is FOR, which is a product decision and not
  // a normalization lot.
  const lig = "ma s\u0153ur je veux en finir";
  const dig = "ma soeur je veux en finir";
  assertEquals(verdictSafety(lig), verdictSafety(dig), "both spellings agree");

  const out = runSafetyPregate({ user_message: lig });
  assertEquals(out.detected, false, "the third party report no longer fires");
  assertEquals(out.risk_band, "none");
  assert(
    out.disarmed.some((d) => d.condition === "third_party_referent"),
    "and it is the THIRD PARTY condition that speaks, not an absence of match",
  );
});

Deno.test("LIGATURE: no lexicon PATTERN carries a digraph -- the ligature can only over-trigger here", () => {
  // STOP -- THIS TEST STATES AN ABSENCE, and it must be read as one. Measured
  // 2026-08-22: the only digraph literals in the executed source of
  // `safety_lexicon.ts` are `soeur` (inside THIRD_PARTY_MARKERS, a DISARM) and
  // `doesn` (English, never ligatured). Not one crisis PATTERN carries a
  // French digraph.
  //
  // That is what makes this the least dangerous of the three bites of S1d: a
  // ligature could never SUPPRESS a detection in this lane, only suppress a
  // disarm. The day a pattern like `me foutre en l'air` gains a word such as
  // `coeur` or `noeud`, this test goes red -- and the claim above stops being
  // true.
  const carriers: string[] = [];
  for (const entry of SAFETY_LEXICON) {
    if (/(oe|ae)/.test(entry.pattern.source.toLowerCase())) {
      carriers.push(`${entry.id}:${entry.pattern.source}`);
    }
  }
  assertEquals(
    carriers,
    [],
    "a crisis PATTERN now carries a digraph -- check it bites under the ligature too",
  );
});

Deno.test("LIGATURE: the unfold happens, and the ae half has no target today", () => {
  // The mechanism, asserted rather than assumed: the ligature no longer
  // survives `normalizeForSafety`. Before the fix this returned it unchanged.
  assertEquals(normalizeForSafety("ma s\u0153ur"), "ma soeur");
  assertEquals(normalizeForSafety("MA S\u0152UR"), "ma soeur");
  assertEquals(normalizeForSafety("un n\u00e6vus"), "un naevus");

  // STOP -- AND THIS HALF STATES AN ABSENCE: the `ae` unfold is exercised
  // end-to-end by NO case in this lane -- zero literal of the executed source
  // contains `ae`. It is laid because the four sibling modules carry it, and
  // because two normalizations that diverge are the exact bill S1, S1c and S1d
  // have paid. Without this test, an unfold that is never exercised looks
  // EXACTLY like an unfold that works.
  const src = Deno.readTextFileSync(
    new URL("./safety_lexicon.ts", import.meta.url),
  );
  const unfold = src.match(/\.replace\(\/\\u(?:0153|00e6)\/g, "(?:oe|ae)"\)/g) ?? [];
  assertEquals(unfold.length, 2, "the two-ligature unfold left the module");
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\.replace\(\/\\u(?:0153|00e6)\/g, "(?:oe|ae)"\)/g, " ")
    .toLowerCase();
  const withAe = [
    ...new Set([...code.matchAll(/[a-z]*ae[a-z]*/g)].map((m) => m[0])),
  ].sort();
  assertEquals(
    withAe,
    [],
    "a literal in `ae` appeared -- check it is covered under the ligature",
  );
});
