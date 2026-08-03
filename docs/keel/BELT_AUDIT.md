# KEEL — Belt Audit

> Companion to [CONTRACT.md](CONTRACT.md) / [SCHEMA.md](SCHEMA.md). Inventory of the
> French-morphology anti-regression belts accumulated P0..P13, with a freeze verdict for each,
> plus the five NEW KEEL belts (each with its disarm condition and false-premise test, per the
> P9 doctrine: *every belt carries its own disarm condition and a false-premise test*).
>
> **Verdicts**
> - **SURFACE_FORM** — the belt's mechanism *is* French morphology (clitics, guillemets,
>   spelled-out hours, participle endings, politeness formulas). Freeze it behind a
>   `locale.startsWith('fr')` gate (cf. `_shared/locale.ts:9`). **Never translate a
>   SURFACE_FORM belt** — a translated regex is a new, untested belt with the old belt's name.
>   Other locales get the invariant re-derived from scratch or nothing.
> - **BUSINESS_INVARIANT** — the belt enforces a truth that must hold in every language, but
>   its only enforcement today is a French detector. It must be **hoisted into the
>   language-free layer** (frame contract, token/column checks, ledger gates) **before** the
>   freeze — freezing first imprisons the invariant inside French and silently un-protects
>   every other locale. The French detector then remains as a frozen *redundant* net for `fr`.
>
> Line numbers are as of branch `Nutrition`, 2026-07-27.

---

## 1. `supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/instruction_parser.ts`

| # | Belt (P-tag) | Line | Protects | Verdict | Justification |
|---|---|---|---|---|---|
| 1 | `extractQuotedReminderInstruction` (P6-A guillemets) | 29 | Verbatim dictated label recovery, incl. « … » | SURFACE_FORM | Quote conventions are orthography, not meaning. |
| 2 | `detectsReminderAnaphora` | 49 | "même / pareil / comme avant" flagged as anaphora | BUSINESS_INVARIANT | An anaphor is never durable content in any language — must become a frame-level flag. |
| 3 | `isDegenerateReminderInstruction` (+ P8-B clitic-only "la retrouver") | 60, 92 | A pronoun-only / degenerate instruction is never committed as durable text | BUSINESS_INVARIANT | The referent lives in conversation, not in the row — true regardless of language. |
| 4 | `extractReminderInstruction` purpose patterns | 104 | Carving the instruction clause out of a French sentence | SURFACE_FORM | Pure French clause grammar ("rappelle-moi de…", "pour…"). |
| 5 | `cleanupInstructionCandidate` strip/cut patterns | 276 | Command-verb and politeness stripping before storage | SURFACE_FORM | French imperative + politeness morphology. |
| 6 | `INVARIANCE_ANAPHORA` set + `isReminderInstructionInvarianceAnaphora` (P6-A/P6-V tail-strip) | 193, 209 | "même chose" is INHERITED from the replaced reminder, never stored | BUSINESS_INVARIANT | Instruction inheritance on replace is a ledger rule, not a French idiom. |
| 7 | `hasAdditiveReminderMarker` (P12-D3/D2c) | 342 | Explicit additive marker ⇒ the dedup net loses the right to CANCEL | BUSINESS_INVARIANT | "User assumed the duplicate" is a consent fact; must be a frame flag, not a regex. |
| 8 | `isReminderEntityReference` (P10-E) | 386 | Entity reference ("celui du midi") = ABSENT instruction | BUSINESS_INVARIANT | Reference-vs-content distinction is universal; storing the pronoun corrupts data in any language. |
| 9 | `daypartWindowFromReference` (P10-E) | 404 | Nominal daypart → hour window (midi = 11–15h) for target resolution | BUSINESS_INVARIANT | Slot-name → window mapping is exactly KEEL's `slot_vocabulary` — belongs in a table, not a French lexicon. |

## 2. `…/one_shot_reminder/router.ts`

| # | Belt (P-tag) | Line | Protects | Verdict | Justification |
|---|---|---|---|---|---|
| 10 | `explicitDeferredReServeAsk` (P8-E) | 137 | Lifting the crisis lock needs the most explicit ask, never a bare "oui" | BUSINESS_INVARIANT | Safety-gate release criteria cannot be French-only. |
| 11 | `isBareClarifyRetraction` (P12-D2a, disarm: new spec present) | 254 | Retraction under active clarify ⇒ pending purged, zero write | BUSINESS_INVARIANT | "Never act on a withdrawn request" is a ledger rule. |
| 12 | `stripTemplatePlaceholders` (P12-D2d) | 277 | No visible text ever carries a template placeholder (`[heure]`) | BUSINESS_INVARIANT | Placeholder-leak ban is a render rule; the substitute prose is locale content (render layer, R3). |
| 13 | `entityAnchoredDayToken` (P12-D4) | 314 | Entity-anchored day ("celui de vendredi") vs destination day ("à vendredi") | BUSINESS_INVARIANT | Targeting the wrong reminder's day destroys data in any language. |
| 14 | `localWeekdayName` (fr-FR weekday as match token) | 324 | Matching a named day against a civil date | SURFACE_FORM | Literally the French-weekday mistake KEEL R1/R7 exists to kill; freeze and replace with `mon..sun` tokens. |
| 15 | `ROUTER_COMMAND_STOPWORDS` + `reminderContentTokensFromMessage` (P12-D7) | 342, 353 | Content tokens resolve ONE target by named evidence, never a guess among candidates | BUSINESS_INVARIANT | The no-guessing rule is business; only the stopword lexicon is per-locale data. |
| 16 | `messageContentOverlapScore` / `instructionTokensOverlap` 5-char prefix morph-match (P7-F) | 360, 760 | "la marche" ↔ "marcher" tolerance in target matching | SURFACE_FORM | Prefix-5 stemming is a French morphology bet; other languages need their own stemmer. |
| 17 | `composeNamedDayWithHHMM` (P12-D4/D8a) | 384 | Named day + HH:MM → next civil occurrence, via a re-composed French sentence fed back to the parser | BUSINESS_INVARIANT | Next-occurrence resolution is calendar math; the round-trip through generated French prose is the prison to remove. |
| 18 | `oneShotReminderDraftRequested` (P5-F) | 438 | Draft/validation requested ⇒ create never commits until explicit confirm | BUSINESS_INVARIANT | Consent-before-commit is an effect-ledger rule. |
| 19 | `isOneShotReminderVerificationQuestion` (P5-B) | 468 | A verification question = DB projection READ, zero write, whatever intent was emitted | BUSINESS_INVARIANT | Protects against destroying the wrong reminder on a status question — execution-truth doctrine. |
| 20 | `looksTemporalLabel` | 742 | A label only counts as temporal if it carries a French time word/digit | SURFACE_FORM | Lexicon gate. |
| 21 | `instructionRootedInText` (P9-A resolvable-antecedent condition) | 790 | Clitic coercion disarmed when content is anchored in the current message and overlaps no pending | BUSINESS_INVARIANT | "An anaphor may only target a resolvable antecedent" — otherwise a healthy reminder gets cancelled; universal. |
| 22 | `hasNocturnalOrMeridiemForwardMarker` (P10-A) | 813 | "cette nuit à 2h" said at 22h = next occurrence, never a past_time refusal | BUSINESS_INVARIANT | Forward-marker semantics exist in every language; only the marker list is French. |
| 23 | `hasRescheduleCliticAnaphor` (P6-V/P8-V/P9-C hyphen-less form) | 828 | Imperative + object clitic ("décale-le") always designates an EXISTING reminder | BUSINESS_INVARIANT | The pronoun rule ("a move command needs an existing target") belongs in the frame contract; the clitic grammar is the French witness of it. |
| 24 | `bareAmbiguousHour` (P4-D spelled-out, P6-H "7 heures", P7-F day-anchored digits) | 844 | Bare hour 1–9 without meridiem ⇒ clarify before any write | BUSINESS_INVARIANT | 12-hour ambiguity is universal; the "toutes lettres vs 7h" split is the French calibration to freeze alongside. |
| 25 | `temporalScopeText` (P12-A) | 902 | Date tokens inside the reminder CONTENT are inert for temporal anchoring | BUSINESS_INVARIANT | Content/schedule separation is exactly R5's spirit applied to parsing. |
| 26 | P12-V sole-hour distribution over hourless fan-out siblings (disarm: any sibling carries an hour; two hours ⇒ never guess) | 1196–1292 | "jeudi et vendredi à 18h" gets ONE hour distributed deterministically | BUSINESS_INVARIANT | Fan-out cardinality and no-guessing are ledger rules. |
| 27 | P12-B countable named days ⇒ requalify `recurring` into N `once` effects (disarm: habit marker, ambiguous hour, absent instruction) | 1294–1414 | N named days without habit marker is a once×N fan-out, never a recurring block | BUSINESS_INVARIANT | Cardinality truth of the request; only day/habit lexicons are French. |
| 28 | P12-V bare-affirmation lexicon (disarm: armed clarify or safety deferred) | 1424–1481 | A pure confirmation carries no NEW request — re-emitted effects are no-oped | BUSINESS_INVARIANT | "Effects relate to the current message" is rule 45 made structural. |
| 29 | P12-D2b `pendingDisarmedByComposite` | 1521–1531 | An explicit composite under clarify disarms the pending and is read afresh | BUSINESS_INVARIANT | Clarify-state machine rule; verbs are the French witness. |
| 30 | P6-V deferred-exposition guard (no create without ask on the exposure turn) | 1532+ | The re-serve OFFER never becomes an unsolicited commit | BUSINESS_INVARIANT | Zero-write without a user request — ledger default-deny. |
| 31 | P4-B/P12-D2b cancel→replace reclassification (+ P12-V "mets-m'en" recreate verb list) | 2046–2143 | A composite "annule X et remets-en un à Yh" never executes only the cancel | BUSINESS_INVARIANT | Atomic replace is the Chantier R invariant; verb list is French data. |
| 32 | `isolateRecreateSegment` (P3-B two-hour lesson) | 2162 | Never parse a two-hour text whole; the new time lives after the recreate verb | BUSINESS_INVARIANT | Which-hour-wins is a correctness rule for any language with composites. |
| 33 | P8-D style-anaphora bounded completion (3 locks + verrou 0 explicit reminder act) | 2250–2304 | An explicit absolute hour present ⇒ never `missing_time` | BUSINESS_INVARIANT | Invariant stated in the code itself; locks must be re-expressed language-free. |
| 34 | P3-B deterministic-time layers 1–4 (incl. P10-A layer-4 exception, P12-A anchor-possession) | 2305–2476 | Payload time is deterministic: client-clock parser beats LLM UTC drift | BUSINESS_INVARIANT | The core execution-truth belt of the whole lane; only the "demain"-family detection is French. |
| 35 | P8-V create-nu → reschedule coercion (exempt: safety deferred, in-flight create clarify) | 2502–2534 | A bare create carrying a move-pronoun never commits a duplicate | BUSINESS_INVARIANT | Same pronoun rule as #23, applied at intake. |
| 36 | P0-4/P4-C reschedule→create degradation at zero/mismatched pending + `looksLikeRescheduleCommandEcho` | 2540–2620 | Nothing to move ⇒ real intent is (re)create; a command echo is never content | BUSINESS_INVARIANT | Honest degradation instead of a false "c'est décalé" — ledger honesty. |
| 37 | P12-V message-daypart reference vs invented instruction (disarm: instruction rooted in message) | 2596–2615 | An emitted instruction not rooted in the message never picks a target | BUSINESS_INVARIANT | Anti-confabulation targeting rule. |
| 38 | P12-D4 entity-day pending match (disarm: destination day, pending exists that day, tz read fails ⇒ fail-open) | 2655–2715 | "remets celui de vendredi" with only-Thursday pendings ⇒ create, never replace of the lexically-near reminder | BUSINESS_INVARIANT | Day-scoped antecedent resolution is calendar logic. |
| 39 | P3-F/P6-A/P10-E replace inheritance + P12-D7 named-evidence targeting + nominal-daypart window | 3620–3700 | Missing/anaphoric/reference instruction inherits from the targeted pending, BEFORE mutation | BUSINESS_INVARIANT | Inheritance-before-atomic-replace is the P6 contract. |
| 40 | P4-D meridiem belt at commit gate (P5-D verbatim-message priority over raw_text) | 4480–4534 | Ambiguity is judged on the USER'S words, not the dispatcher's normalization | BUSINESS_INVARIANT | Evidence-source rule; the ambiguity detection itself is #24. |
| 41 | P6-A high-precision quoted recovery from recent user messages | 4535–4549 | Label recovery limited to unambiguous quoted forms | SURFACE_FORM | Quoting conventions again; the "high-precision only" restriction is the business note it carries. |
| 42 | P8-B degenerate instruction never persisted into clarify slots | 4555–4570, 4617 | The clarify answer-turn can never inherit an anaphor as reminder text | BUSINESS_INVARIANT | Slot-carry-over hygiene of the clarify state machine. |

## 3. `…/one_shot_reminder/executor.ts`

| # | Belt (P-tag) | Line | Protects | Verdict | Justification |
|---|---|---|---|---|---|
| 43 | `REMINDER_MATCH_STOPWORDS` + `reminderMatchTokens` (P2-3c) | 606, 629 | Overlap only ever resolves a UNIQUE target, never picks among positives | SURFACE_FORM | The lexicon is the French part; the unique-target rule already lives in the calling logic. |
| 44 | `detectMassCancelScope` (P9-B; strict adjacency anti-FP; created-today scope) | 653 | Explicit mass cancel targets the real inventory, exempt from the single-target precision guard | BUSINESS_INVARIANT | Scope semantics (all vs one, creation-date scoping) are business; a mass wipe on an accidental token is catastrophic in any language. |

## 4. `…/one_shot_reminder/time_parser.ts`

| # | Belt (P-tag) | Line | Protects | Verdict | Justification |
|---|---|---|---|---|---|
| 45 | `resolveMeridiemClarifyAnswer` (P7-C, fail-closed) | 112 | Clarify answer fuses with the stored base hour/day; unresolved ⇒ re-ask, never a guess | BUSINESS_INVARIANT | Clarify-fusion is state-machine logic; hour/meridiem words are the French skin. |
| 46 | `resolvePastTimeClarifyAnswer` (P10-A, symmetric; never a past result) | 184 | Forward day hint combines with the refused hour; result strictly future | BUSINESS_INVARIANT | Same family as #45. |
| 47 | `hasRecurringCadenceHint` | 262 | Recurring cadence is out of one-shot scope (honest block) | BUSINESS_INVARIANT | Cardinality truth (once vs recurring) gates the whole lane. |
| 48 | `hasExplicitFutureDayHint` (RMR-B01 repair gate) | 281 | Deterministic repair of a past LLM UTC only on explicit future day | BUSINESS_INVARIANT | Repair-only-on-evidence rule. |
| 49 | `hasAnyExplicitDayToken` (P4-B day-inheritance gate) | 395 | Bare hour inherits the replaced reminder's day only when NO day marker exists | SURFACE_FORM | Day-token lexicon; the inheritance rule itself is enforced at the call sites (#39). |
| 50 | `localLabelDayConsistent` (P4-B) | 412 | A label may only confirm a commit if its implied day matches the effective `scheduled_for` | BUSINESS_INVARIANT | Render-vs-ledger parity (execution truth); "ce soir" is just the witness. |
| 51 | `singleNamedWeekday` + named-weekday next-occurrence branch (P12-A) | 505, 577–606 | A bare named weekday resolves to its NEXT civil occurrence; 2+ days or habit marker ⇒ out of scope | BUSINESS_INVARIANT | Calendar math + no-guessing on multi-day; day names are per-locale data. |
| 52 | French month/date lexicon + past-hour bump in `parseAbsoluteOrLocalTime`, `monthNumber` | 525–642, 693 | Absolute French dates; an already-past time today slides to tomorrow | SURFACE_FORM | The parser is the French component by definition; its next-occurrence bump semantics must be re-specified in the language-free time layer (KEEL refuses ambiguity instead — see belts N1–N5 philosophy). |
| 53 | `hasOneShotMarker` / `selectCandidateText` line targeting | 652, 667 | Pick the line that talks about a reminder | SURFACE_FORM | Marker lexicon. |

## 5. `supabase/functions/whatsapp-webhook/handlers_pending.ts`

| # | Belt | Line | Protects | Verdict | Justification |
|---|---|---|---|---|---|
| 54 | `classifyRendezVousIntent` decline formulas | 124 | A decline ("pas maintenant", "non merci") closes the rendez-vous instead of being fed into the flow as a reply | BUSINESS_INVARIANT | Decline-vs-reply classification changes a state machine; must be a token (ideally a quick-reply payload), not prose. |
| 55 | `isWeeklyAutoValidationDeclineText` ("non merci" template quick-reply) | 532 | The auto-validation decline path (plan already applied, only detail delivery is gated) | BUSINESS_INVARIANT | Matching a Meta template's French button *text* is the anti-pattern R1 kills: the decline must ride the structured button payload; freeze the regex as the fr fallback only. |
| 56 | `isExplicitDailyActionReviewResumeText` | 541 | Resuming a parked daily review requires explicit resume verb + an outcome | BUSINESS_INVARIANT | Guard against re-entering a review on small talk; criteria are business, verbs are French. |

## 6. `supabase/functions/_shared/memory/runtime/signal_detection.ts`

| # | Belt (pattern group) | Line | Protects | Verdict | Justification |
|---|---|---|---|---|---|
| 57 | `trivial` ack patterns | 57 | Skip memory work on bare acks | SURFACE_FORM | Politeness lexicon. |
| 58 | `correction` patterns | 65 | Correction signal → retrieval hint `correction` | BUSINESS_INVARIANT | A user correcting stored truth must be honored in every language (retroactive-correction doctrine). |
| 59 | `forget` / `privacy_delete` | 77 | Explicit deletion/forget requests detected | BUSINESS_INVARIANT | Right-to-forget is a privacy obligation (RGPD), not a French idiom. |
| 60 | `memorize` (charte cmd 5, BF-MEMORY-01; declared removal condition: structural dispatcher marker) | 97 | "retiens que…" exempts a confided fact from the cost pre-filter | BUSINESS_INVARIANT | A confided fact silently dropped is a trust breach in any language; the belt itself documents its own hoist target. |
| 61 | `safety` self-harm/danger | 104 | `retrieval_mode = safety_first` | BUSINESS_INVARIANT | Crisis routing is a duty of care; a non-fr user in crisis must trip the same gate. |
| 62 | `explicit_topic_switch` | 116 | Topic-switch routing | SURFACE_FORM | Routing comfort heuristic. |
| 63 | `dated_reference` | 124 | Retrieval hint `dated_reference` | SURFACE_FORM | Recall-quality heuristic. |
| 64 | `action_related` | 141 | Retrieval hint `action_related` | SURFACE_FORM | Recall-quality heuristic. |
| 65 | `sensitive` (addiction / mental health / family) | 153 | Sensitive-content handling posture | BUSINESS_INVARIANT | Sensitivity handling is a duty-of-care gate, adjacent to KEEL's `student_safety_constraints` (identifiers, never prose). |
| 66 | `cross_topic_profile_query` | 170 | `cross_topic_lookup` retrieval mode | SURFACE_FORM | Retrieval routing. |
| 67 | `high_emotion` | 182 | Tone modulation signal | SURFACE_FORM | Style heuristic. |
| 68 | `advice_seeking` (P4-D) | 194 | Advice request re-opens retrieval despite `memory_mode=none` | SURFACE_FORM | Recall-quality heuristic (degrades gracefully to generic advice). |

## 7. `supabase/functions/_shared/memory/runtime/temporal_resolution.ts`

| # | Belt (P-tag) | Line | Protects | Verdict | Justification |
|---|---|---|---|---|---|
| 69 | Relative-day/part-of-day lexicon ("hier soir", "avant hier matin", weekday+soir…) | 195–438 | Dated-reference resolution windows for memory | SURFACE_FORM | French lexicon over a language-free windowing engine; extract the lexicon, keep the engine. |
| 70 | P12-E `PAST_VERBAL_CONTEXT_RE` / `FUTURE_VERBAL_CONTEXT_RE` (passé-composé participle endings on RAW accented text) | 184–193 | Orient a bare weekday by verbal tense; contradictory/undetectable ⇒ do NOT resolve (fail-safe) | SURFACE_FORM | Participle morphology (`é/ée/és/i/u…`) is the most French thing in the repo. The fail-safe ("never date at random") is the business rule to hoist; the tense detector freezes as-is. Declared disarm: LLM extraction resolving these forms (0 resolvable `event_missing_date` over 3 waves). |
| 71 | P12-E bare month / bare weekday resolution, opt-in `includeBareUnits` | 440–490 | Bare units resolved only for the memorizer event gate; runtime surfaces keep historical behavior | BUSINESS_INVARIANT | The opt-in scoping (who may consume lower-confidence resolutions) is an architecture rule, not French. |

## 8. `supabase/functions/_shared/memory/memorizer/retraction_guard.ts`

| # | Belt (P-tag) | Line | Protects | Verdict | Justification |
|---|---|---|---|---|---|
| 72 | `RETRACTION_MARKERS` (P10-D) | 32 | An explicitly retracted content NEVER becomes a `memory_item` — nor its narrative negation ("récit d'abandon") | BUSINESS_INVARIANT | Right of retraction over one's own memory is universal; the marker regex is the French witness. Declared disarm (registre P6-0): reliable LLM extraction, 0 drops over 3 consecutive waves. |
| 73 | P12-E complement targeting (post-marker complement → pre-marker prefix → previous message; meta-token exclusion; N-turns-back overlap) | 103, 142–210 | The retraction targets the RIGHT content, at any distance in the batch | BUSINESS_INVARIANT | Antecedent resolution logic; only `RETRACTION_COMPLEMENT_META` is a French lexicon. |
| 74 | `filterRetractedMemoryItems` `content_text ?? content` read (P12-E write-path fix) | 223–252 | The lock is live on the REAL write-path (ValidatedMemoryItem), not only the test shape | BUSINESS_INVARIANT | A guard inert on the production path is the phantom-commit class; shape-agnostic read is structural. |

**Tally: 74 belts inventoried — 18 SURFACE_FORM, 56 BUSINESS_INVARIANT.** The dominant
pattern: the *invariant* is almost always language-free (ledger honesty, cardinality,
antecedent resolution, consent-before-commit, deterministic time), while the *detector* is
French morphology. Freezing without hoisting would leave every non-fr KEEL tenant running
with none of these protections while the code appears to have them.

---

## KEEL — the five new belts

Per the P9 doctrine, each belt states (a) the invariant, (b) its **disarm condition** — the
only future under which the belt may be removed or bypassed, and (c) its **false-premise
test** — the test proving the belt does NOT fire when its premise is false (the anti-FP half
that P8-revalidation showed is as load-bearing as the belt itself). All five are
language-free by construction (tokens and columns, never prose — R1/R5/R7).

### N1 — A food log never creates a micronutrient fact

- **Invariant** (CONTRACT non-input #3): a `protocol_events` row carrying `food_group_ref`
  (a logged salmon serving) never produces, updates, or influences a
  `measure='micronutrient'` evaluation. Only explicitly reported elemental quantities with
  `substance_ref` feed the micronutrient branch. No nutrient-composition table exists in P0,
  deliberately.
- **Belt**: evaluator-side assertion + test: run the evaluator over Fixture 1 with food
  events only (line 5's salmon logged, line 2's omega-3 line present) ⇒ zero
  `commitment_evaluations` rows for the micronutrient line beyond its pre-seeded `unknown`.
- **Disarm condition**: CONTRACT.md lifts the "auto-summing nutrients from food logs"
  refusal on the record (a product decision introducing a provenance-carrying composition
  table). Never disarmable by code convenience.
- **False-premise test**: an *explicitly reported* quantity ("capsule this morning + salmon
  tonight ≈ 2.5 g", entered as a nutrient fact with `substance_ref='omega3_epa_dha'`)
  **does** produce the evaluation — the belt blocks deduction, never explicit reporting.

### N2 — `target > UL` without `clinician_ordered` ⇒ degraded at render, never delivered as-is

- **Invariant** (CONTRACT safety gate): `exceeds_ul` is derived at validation
  (`target_min > UL` against `substance_limits`), never stored; without
  `provenance='clinician_ordered'` the line renders as an educational food-first suggestion,
  with an explicit message to the coach — never silently blocked, never delivered verbatim.
- **Belt**: render-layer gate + test on Fixture 1 line 1 (D3 5000 IU > UL 4000,
  `coach_educational`) ⇒ degraded output + coach notification row.
- **Disarm condition**: per line only — `provenance='clinician_ordered'` (the *nominal*
  functional-medicine case, not an edge case). There is no global disarm.
- **False-premise test**: (a) same line with `clinician_ordered` ⇒ delivered verbatim, zero
  degradation; (b) a line *below* UL with `coach_educational` ⇒ delivered verbatim. The
  belt must never degrade on a false premise — over-blocking would push coaches to
  mislabel provenance, destroying the safety signal.

### N3 — Unknown `substance_ref` / `food_group_ref` slug ⇒ loud failure, zero empty fallback

- **Invariant** (R7): every slug lookup (`substance_limits` seed, `food_groups` FK,
  `parseUnit`, `t()`) throws on unknown input, naming the slug. It never returns
  `undefined`, `[]`, or a silent default. The live counter-example this belt exists for:
  `planSchedule.ts:289-290` returning `[]` for valid `mon..sun` tokens looked up against
  French keys — two normalizations + one silent drop = a bug with no error.
- **Belt**: `_shared/keel/tokens.ts` fail-loud mappers + write-path CHECK
  (`measure IN ('dose','micronutrient') ⇒ substance_ref NOT NULL` and FK on
  `food_group_ref`); test: writing a commitment with `substance_ref='vitamine_d'` (French
  slug) fails loudly, no row written.
- **Disarm condition**: per slug only — add it to the seed (the mapping *learns* it). Never
  by softening the throw into a fallback.
- **False-premise test**: every seeded slug round-trips through every mapper with zero
  throws (the belt must not make valid data noisy); and the error message contains the
  offending slug verbatim (a loud failure that cannot be diagnosed is half a failure).

### N4 — The evaluator does not import `commitment_relations`

- **Invariant** (CONTRACT non-input #1): co-ingestion/separation/cofactor/antagonist
  relations are render guidance and safety alerts only. No practitioner grades "taken 90 min
  apart instead of 120" as missed.
- **Belt**, two-headed: (a) **import test** — static scan of the evaluator module graph
  asserts no import path reaches the relations module; (b) **behavioral test** — evaluator
  output on Fixture 1 line 8 (iron + its P1 relations) is byte-identical with and without
  the relation rows present.
- **Disarm condition**: CONTRACT.md revokes non-input #1 on the record (a product decision
  that some relation becomes gradeable). Never disarmable because "the evaluator happens to
  need one field" — that field would become a column (R5) on `plan_commitments`, not a
  relations read.
- **False-premise test**: the relations *do* legitimately feed the render/reminder layer —
  assert the digest/reminder path still reads them and emits the guidance ("take it with
  your vitamin-C source"). The belt seals relations out of the evaluator, not out of the
  product.

### N5 — The weekly rollover activates weeks with zero validation rows existing

- **Invariant** (CONTRACT: "the student never grades their own paper" + SCHEMA "not carried
  over"): week N+1 items activate when their assigned week starts, driven purely by the
  calendar (`anchor_week_start`, `week_starts_on`). No `user_habit_week_plans`-style state
  machine, no ratification window, no auto-apply deadline — the validation table does not
  exist in KEEL at all.
- **Belt**: rollover-cron test on a plan spanning 2+ weeks: advance the clock past the week
  boundary, run the rollover ⇒ week-2 commitments active, `slot_kind='nominal'` evaluations
  pre-seeded `unknown` at day open — while asserting **zero rows** in any validation-like
  table (the assertion is that the query doesn't even exist). Covers the migration
  prerequisite: `activateDueWeekItemsForUser` re-homed onto the rollover cron (sole legacy
  caller `weekly_planning_lifecycle.ts:247`), or week unlocking silently breaks.
- **Disarm condition**: none in KEEL. Weekly student validation is refused on the record,
  *including as an option flag*; only a CONTRACT.md amendment re-opening that refusal could
  disarm this belt.
- **False-premise test**: seed a leftover legacy `pending_confirmation` row (Sophia-side
  table) in the same database ⇒ the KEEL rollover activates the week anyway, unblocked and
  unaware — proving activation depends on nothing but the calendar. Second false premise:
  the *daily* provisioning ordering bug class (daily planner at 00h05 racing a 05h00
  validation — the legacy incident) is structurally impossible: with no validation step
  there is nothing to race, and the test pins that by running rollover at any hour.

---

## W9 — la langue comme axe, et le gel des packs de prompt

Le défaut D5 (`EXECUTION_LOG.md`) : app 100 % anglaise, conversation 100 % française.
Cause vérifiée : `_shared/keel/locale.ts::buildResponseLanguageBlock` était **écrit mais mort**
(zéro appelant de production), et le composeur visible portait un persona français en dur.

### La ceinture N6 — le bloc RESPONSE_LANGUAGE est la DERNIÈRE instruction

- **Invariant** (CONTRACT R3) : tout prompt qui produit du texte **visible** se termine par le
  bloc `RESPONSE_LANGUAGE`, construit depuis `resolveResponseLocale()` — le point unique. Aucun
  module ne code une langue en dur, et aucun ne la devine.
- **Pourquoi la position** : la récence gagne chez les LLM, et surtout le composeur companion
  **tronque par la queue**. Un bloc ajouté avant la passe de budget est *supprimé* exactement sur
  les tours à contexte riche — sans erreur nulle part. D'où `appendResponseLanguageBlock`, qui
  s'applique **après** toute troncature, et qui est idempotent (un retry / prompt de réparation
  ne doit pas empiler deux consignes de langue).
- **Persistance** : la locale résolue est écrite sur le fil (`temp_memory.conversation_locale`)
  et relue au tour suivant en priorité 2, au-dessus de toute détection par message. Sans cette
  écriture, la langue oscille — le mode de panne que R3 nomme explicitement. `persisted` ne cède
  qu'à `userExplicit` : seule une demande explicite de l'élève déplace un fil déjà ancré.
- **Condition de désarmement** : aucune tant qu'un composeur visible existe. La suppression du
  early-return `return "en-US"` de `resolveResponseLocale` **n'est pas** un désarmement — c'est
  l'activation de la chaîne de priorité, et `locale_test.ts` échouera alors, ce qui est le signal
  attendu.
- **Test de prémisse fausse** : un fil `fr-FR` reçoit un bloc qui nomme le **français**, et le
  pack FR gelé — la ceinture n'impose pas l'anglais, elle impose *une langue nommée*. Un bloc qui
  ne saurait dire que « anglais » serait un forçage, pas un axe.

### Les packs de prompt FR : SURFACE_FORM, gelés, jamais traduits

| # | Ceinture | Fichier | Verdict | Justification |
|---|---|---|---|---|
| 75 | `VISIBLE_OUTPUT_STYLE_RULES` règles 1–2 (« Français naturel, tutoiement » ; accord au féminin de Sophia) | `router/response_style_policy.ts` | SURFACE_FORM | De la morphologie française. Une règle « accorde au féminin » en anglais est une ceinture neuve et non testée portant le nom de l'ancienne. Le pack EN **redérive** l'invariant (registre direct, 2ᵉ personne) depuis zéro. |
| 76 | Pack stable companion FR (`CORE_COMPANION` … `SILENCE_AND_REACTIONS`) | `agents/companion.ts` | SURFACE_FORM (prose) / BUSINESS_INVARIANT (contenu) | Les ~40 invariants métier du pack (default-deny d'écriture, frontière plateforme, pont post-détresse, rythme de questions) sont **language-free** : ils sont re-exprimés dans le pack EN et pinés par des ceintures EN dédiées dans `companion_prompt_contract_test.ts`. La prose française reste gelée derrière `isFrenchLocale`. |
| 77 | Marqueurs de blocs de contexte (`=== USER MODEL (FACTS) ===`, `=== PREFERENCES COACH UTILISATEUR`, `=== CONTEXTE MODULE (UI) ===`, `=== RECHERCHE WEB …`) | `agents/companion.ts` | **NON TRADUISIBLE** | Ce sont des **clés de découpe** sur du contexte produit par d'autres modules, pas de la prose. Les renommer supprimerait silencieusement le contexte : classe d'échec N3 (`planSchedule.ts` rendant `[]` sur des jetons valides). Seule la prose d'enrobage que le composeur écrit lui-même suit la langue. |
| 78 | Jetons de livraison `<!--sophia_delivery:…-->`, `<!--fil_rouge…-->` | `agents/companion.ts` | **NON TRADUISIBLE** (R1) | Jetons machine relus par `parseCompanionDeliveryDirective`. Traduits, la directive n'est plus reconnue et part **en clair dans le message de l'élève**. |

`isFrenchLocale()` (`_shared/keel/locale.ts`) est le prédicat **unique** du gel : aucun module ne
ré-implémente `startsWith('fr')` avec sa propre normalisation.

### Classe A (dispatcher, extracteurs, classifieurs) — NON traduite, sur le registre

`DISPATCHER_V2_SYSTEM_PROMPT` (866 lignes) reste **en français**, et c'est un arbitrage, pas un
oubli. Sa sortie est un TurnFrame JSON d'enums : la langue y est invisible pour l'utilisateur, le
gain démo est **nul**. En face, le prompt est piné par `dispatcher_prompt_contract_test.ts`
(1 277 lignes) dont l'écrasante majorité des assertions sont des **sous-chaînes françaises** :
chacune est une régression payée en run réel (les tags `paul-*`, `eva-*`, `nina-*`, `rose-*` la
datent). Une traduction en masse remplacerait 1 277 ceintures éprouvées par 1 277 ceintures
neuves et non testées portant le même nom — précisément l'anti-pattern que ce document existe
pour interdire. **Condition de reprise** : le jour où un deuxième locale de *conversation* est
livré (donc où le gain « coût par langue = 0 » devient réel), la traduction se fait prompt par
prompt, chaque bloc avec sa ceinture re-dérivée, jamais en un seul passage.
