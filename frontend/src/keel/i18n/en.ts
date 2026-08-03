// KEEL frontend i18n — English seed (R1: all UI copy in English for the pilot).
// Flat keys, snake-free dotted namespaces: <screen>.<element>.
// This object is the single source of truth for the MessageKey type in t.ts.

export const en = {
  // Coach dashboard
  "coach.dashboard.title": "Your students",
  "coach.dashboard.subtitle": "Weekly adherence at a glance",
  "coach.dashboard.empty": "No students yet. Invite your first student to get started.",
  "coach.dashboard.invite_button": "Invite a student",
  "coach.dashboard.adherence_label": "Adherence",
  "coach.dashboard.coverage_label": "Logging coverage",
  "coach.dashboard.insufficient_data": "Insufficient data",
  "coach.dashboard.risk.on_track": "On track",
  "coach.dashboard.risk.watch": "Watch",
  "coach.dashboard.risk.at_risk": "At risk",
  "coach.dashboard.risk.disengaged": "Disengaged",
  "coach.dashboard.risk.outcome_mismatch": "Outcome mismatch",
  "coach.dashboard.risk.restriction_flag": "Restriction flag",
  "coach.dashboard.last_review": "Last weekly review: {date}",

  // Coach home (W6.1) — the seat counter is the BILLING unit: coach_clients
  // rows with status='active'. Invited, paused and ended links are listed but
  // never counted, so what is displayed is what is invoiced.
  "coach.home.title": "Your students",
  "coach.home.subtitle": "Everything you prescribe starts here.",
  "coach.home.seats_label": "Active seats",
  "coach.home.seats_hint": "Active seats are the billing unit. Invited and paused students are not billed.",
  "coach.home.pending_label": "Invitations pending",
  "coach.home.empty_title": "Invite your first student",
  "coach.home.empty_body":
    "Nothing is generated on its own here. You write the plan, you publish it, and your student's app starts following it.",
  "coach.home.empty_cta": "Invite a student",
  "coach.home.import_cta": "Import a plan",
  "coach.home.templates_cta": "Plan templates",
  "coach.home.open_student": "Open",
  "coach.home.list_title": "Students",
  "coach.home.student_unnamed": "Invited student",
  "coach.home.student_hidden": "Name hidden while this link is not active",
  "coach.home.no_name_yet": "Has not created their account yet",
  "coach.home.since": "Client since {date}",
  "coach.home.load_error": "Your student list could not be loaded. Nothing is shown rather than something wrong.",
  "coach.home.retry": "Try again",
  "coach.home.status.invited": "Invited",
  "coach.home.status.active": "Active",
  "coach.home.status.paused": "Paused",
  "coach.home.status.ended": "Ended",
  "coach.home.seat.billed": "Billed",
  "coach.home.seat.trial": "Trial",
  "coach.home.seat.free": "Free",

  // Coach route guard (W6.1)
  "coach.guard.checking": "Checking your coach access...",
  "coach.guard.not_coach_title": "This space is for coaches",
  "coach.guard.not_coach_body":
    "This account has no active coach profile. If you are a student, your plan lives in the app.",
  "coach.guard.suspended_title": "Your coach account is suspended",
  "coach.guard.suspended_body":
    "You cannot read student data or publish plans while your account is suspended.",
  "coach.guard.signup_cta": "Create a coach account",
  "coach.guard.student_app_cta": "Go to my plan",

  // Coach signup (W6.1) — no phone number is required to be a coach.
  "coach.signup.title": "Create your coach account",
  "coach.signup.subtitle":
    "Your students get the app. You get the prescription tools. No phone number needed.",
  "coach.signup.name_label": "Your name",
  "coach.signup.name_placeholder": "How your students will see you",
  "coach.signup.country_label": "Country",
  "coach.signup.country_hint":
    "Where you practise. Used for crisis resources and local formats — never guessed from your language.",
  "coach.signup.language_label": "Language",
  "coach.signup.language_value": "English",
  "coach.signup.language_hint": "The coach workspace ships in English.",
  "coach.signup.submit": "Create my coach account",
  "coach.signup.switch_to_login": "I already have a coach account",
  "coach.signup.failed":
    "Your account exists, but the coach profile could not be created. Sign in again to retry.",

  // Plan import
  "import.title": "Import a plan",
  "import.subtitle":
    "Paste a plan or upload the document. Every extracted line stays traceable to its source — you review, nothing publishes itself.",
  "import.document": "Your document",
  "import.extraction": "Extracted commitments",
  "import.paste_placeholder": "Paste your plan here — exactly as you wrote it for your client.",
  "import.upload_label": "Upload PDF or photo",
  "import.run": "Decompose the plan",
  "import.running": "Reading...",
  "import.loading_hint": "Reading your document. A PDF takes up to a minute.",
  "import.empty_state": "The decomposed plan will appear here, line by line.",
  "import.confidence": "Extraction confidence",
  // "to hold", not "commitments": the number under this label counts what the
  // student has to HOLD. Observations sit under `import.stat_observed`, beside
  // it and never inside it — the observations block itself says they are
  // "never a thing to hold, so never counted as one".
  "import.stat_commitments": "to hold",
  "import.stat_observed": "+ {count} observed",
  "import.stat_review": "to review",
  "import.stat_gaps": "gaps found",
  "import.gaps_title": "To complete — the document does not cover:",
  "import.unparsed_title": "Kept verbatim, not encoded",
  "import.dropzone": "Drop a PDF here or click to browse",
  "import.parsing": "Reading your document...",
  "import.parse_failed": "We could not read this document. Please try another file.",
  "import.page_count": "{count} pages detected",
  "import.start_review": "Review extracted plan",
  "common.clear": "clear",

  // Review screen (extracted commitments before publish)
  "review.title": "Review the extracted plan",
  "review.subtitle": "Confirm each commitment before publishing to {name}",
  "review.commitment_count": "{count} commitments found",
  "review.source_quote": "From the document: “{quote}”",
  "review.edit_button": "Edit",
  "review.remove_button": "Remove",
  "review.publish_button": "Publish plan",
  "review.publish_confirm": "Publish this plan to {name}? The current plan will be superseded.",

  // Plan review screen — the two queues (W6.3)
  // NOTE ON VOCABULARY LABELS: the substance and food-group selectors show the
  // RAW slug (vitamin_d3, cruciferous_veg). Deliberate, and coach-facing only:
  // those slugs are the tokens the schema stores (R1, never translated), the
  // seed lives in ONE place (the migration + tokens.ts, pinned by token-lint),
  // and inventing a third list of display labels here would be a third thing to
  // drift with no test holding it. The student never sees a slug.
  "review.queue_verify": "To verify",
  "review.queue_verify_hint":
    "Lines the extraction is unsure about. Your time goes here, not to re-reading the plan.",
  "review.queue_complete": "To complete",
  "review.queue_complete_hint":
    "Holes in the document. Each one is a proposal you accept, edit or delete — nothing is added to the plan by itself.",
  "review.queue_ready": "Ready",
  "review.queue_ready_hint":
    "Extracted cleanly, and split the way you wrote it. Open one to change anything.",
  "review.queue_empty": "Nothing in this queue.",
  "review.accept": "Accept",
  "review.delete": "Delete",
  "review.edit": "Edit",
  "review.done_editing": "Close",
  "review.add_line": "Add a line",
  "review.mark_verified": "Mark verified",
  "review.issue_count": "{count} blocking",
  "review.issues_title": "This line would be refused by the database:",
  "review.auto_generated": "Proposed",

  // A gap is not a finding about the document, it is a decision. The title is
  // the question; the extractor's full sentence stays underneath as the
  // evidence for it. Nothing here proposes what the line should SAY - the
  // coach writes that, after clicking Add.
  "review.gap_question": "{subject} — do you want that tracked?",
  "review.gap_question_generic": "Do you want this tracked?",
  "review.gap_source": "What the document says",
  "review.gap_add": "Add",
  "review.gap_ignore": "Ignore",
  "review.untitled_line": "New line",
  // Kept out of the reading flow on purpose: extraction notes are OUR
  // diagnostics, shown only once the coach has opened the line to edit it.
  "review.extraction_notes": "Extraction notes",
  "review.save_template": "Save as template",
  "review.saving": "Saving...",
  "review.saved": "Saved to your library as “{title}”.",
  "review.save_error": "Nothing was saved. {message}",
  "review.blocked_by_issues":
    "{count} lines still carry a blocking issue. Fix them or delete them before saving.",
  "review.publish": "Approve & publish to student",
  "review.approve_section": "I approve this section",
  "review.approved_section": "Approved {time}",
  // The approval is a REGULATORY trace, and the coach has to understand what
  // they are signing. What they do not need — and must not be shown — is which
  // function of ours writes it to which table: two internal names on the one
  // screen a dietitian meets first, saying nothing they can act on.
  "review.approval_hint":
    "Each section carries its own approval, stamped with the time you click it. That click is the record that you, not the software, prescribed these lines.",
  "review.approvals_missing":
    "{count} sections still need your approval before this plan can reach a student.",
  "review.template_title_label": "Template name",
  "review.publish_done":
    "Published. {count} lines are now on your student's plan, starting with their next day.",
  "review.publish_failed": "Nothing was published. {message}",

  // Reference notes on molecule lines — COACH ONLY, and only facts.
  //
  // What used to live here was the provenance gate: "Shown to the student
  // without the dose", "What the student would read", and a button reading
  // "Mark as clinician-ordered" that bought the prescription back. All of it is
  // gone (2026-07-28) — the coach is the prescriber, the dose ships as written.
  // The title below is the whole tone of the surface, in three words: it hands
  // a professional something to know, and asks nothing of them.
  //
  // There is no separate "Upper limit: 4000 IU per day" key anymore either: the
  // limit is inside the note's own sentence, composed once in the render layer.
  // Two places saying the same number is how they stop agreeing.
  "safety.note_title": "For your information",
  "safety.stat_notes": "With a note",

  // Commitment editor — one control per axis of plan_commitments
  "editor.axis_identity": "What it is",
  "editor.axis_anchor": "When",
  "editor.axis_level": "How much",
  "editor.axis_evidence": "How it is evidenced",
  "editor.axis_cadence": "How often",
  "editor.axis_governance": "How strict",
  "editor.title": "Title",
  "editor.template_key": "Template key",
  "editor.student_instruction": "Instruction to the student (kept verbatim)",
  "editor.content_locale": "Language of this text",
  "editor.polarity": "Polarity",
  "editor.activity_class": "Class",
  "editor.anchor_kind": "Anchor",
  "editor.slot_key": "Slot",
  "editor.clock_local": "Time",
  "editor.tolerance_minutes": "Tolerance (min)",
  "editor.window_start_local": "Window from",
  "editor.window_end_local": "Window to",
  "editor.measure": "Measure",
  "editor.unit": "Unit",
  "editor.target_op": "Comparator",
  "editor.target_min": "Min",
  "editor.target_max": "Max",
  "editor.substance_ref": "Substance",
  "editor.food_group_ref": "Food group",
  "editor.evidence_kind": "Evidence",
  "editor.evidence_required": "Evidence required",
  "editor.auto_source": "Device feed",
  "editor.counts_toward_adherence": "Counts toward adherence",
  "editor.counts_hint": "Off means it is tracked as an outcome, never scored.",
  "editor.evaluation_grain": "Grain",
  "editor.slot_kind": "Slot kind",
  "editor.scheduled_days": "Days",
  "editor.required_days_per_week": "Days required per week",
  "editor.required_days_hint": "This is the denominator of adherence.",
  "editor.expected_occasions_per_day": "Occasions per day",
  "editor.priority": "Priority",
  "editor.autonomy": "Autonomy",
  "editor.flex_eligible": "Flex eligible",
  // "Provenance" and "Needs clinician sign-off" were removed with the gate they
  // fed (2026-07-28). Both columns still exist; nothing asks the coach to
  // classify their own prescription before the software will carry it.
  "editor.none_option": "— none —",
  "editor.vocabulary_error": "The vocabularies could not be loaded, so no selector can be trusted. {message}",

  // Template library (plan_templates)
  "templates.title": "Your plan templates",
  "templates.subtitle":
    "You work here. A template is imported once; every student is a clone plus a diff.",
  "templates.new": "New template",
  "templates.empty": "No template yet. Import a plan, or start an empty one.",
  "templates.select_hint": "Open a template on the left, or start a new one.",
  "templates.loading": "Loading your library...",
  "templates.error": "Your library could not be loaded. {message}",
  "templates.commitment_count": "{count} lines",
  "templates.status_draft": "Draft",
  "templates.status_active": "Active",
  "templates.status_archived": "Archived",
  "templates.updated": "Updated {date}",
  "templates.open": "Open",
  "templates.save": "Save",
  "templates.saving": "Saving...",
  "templates.delete": "Delete",
  "templates.delete_confirm": "Delete this draft template? This cannot be undone.",
  "templates.field_title": "Name",
  "templates.field_description": "Description",
  "templates.field_locale": "Language of this template",
  "templates.field_status": "Status",
  "templates.field_flex": "Flex days per week",
  "templates.field_target": "Adherence target (%)",
  "templates.field_autonomy": "Default autonomy",
  "templates.swap_title": "Default swap policy",
  "templates.swap_hint":
    "Ticked once, here, for the whole template. A policy, not a menu — the evaluator resolves swaps from it.",
  "templates.swap_class_equivalent": "Allow any food group of the same class",
  "templates.swap_allowed_groups": "Or restrict swaps to these groups",
  "templates.publish": "Publish to student",
  "templates.approve_lines": "I approve these lines for this student",
  "templates.publishing": "Publishing...",
  "templates.publish_result": "Published: {message}",
  "templates.publish_hint":
    "Publishing copies this template into a plan for one student and replaces the plan they had. It happens in one step: they never hold two plans at once.",
  "templates.student_id_label": "Student user id",
  "templates.timezone_label": "Student timezone",
  "templates.timezone_hint":
    "The day boundary is a property of the plan, not of your laptop. This defaults to YOUR timezone — change it if your student lives elsewhere.",
  "templates.commitments_section": "Lines",
  "templates.saved": "Saved.",

  // How long the plan runs (plan_versions.anchor_week_start + duration_weeks).
  // Phrased the way a coach thinks about it — the next session — rather than in
  // the two columns the database stores; the conversion is shown back so the
  // coach can check it before publishing.
  "templates.next_session_label": "This plan runs until our next session",
  "templates.next_session_hint":
    "The date you next see this student. The plan covers that whole week, then stops opening days on its own.",
  "templates.next_session_default": "Defaulted to 4 weeks out. Change it if you meet sooner or later.",
  "templates.next_session_clear": "No end date",
  "templates.next_session_open": "Set a date",
  "templates.plan_window_readout":
    "Week 1 starts {anchor}. The plan runs {weeks} weeks and stops after the week of {session}.",
  "templates.plan_window_open_ended":
    "Week 1 starts {anchor}. No end date: the plan keeps opening days until you publish a new one.",
  "templates.plan_window_invalid":
    "That date is before the plan starts. Your student would open an empty app - pick a later date.",

  // Student today view
  "today.title": "Today",
  "today.greeting": "Hi {name}",
  "today.empty": "Nothing scheduled today. Enjoy your rest day.",
  "today.log_button": "Log it",
  "today.logged_badge": "Logged",
  "today.flex_button": "Declare a deviation",
  "today.flex_remaining": "{count} flex days left this week",
  "today.slot_header": "{slot}",
  "today.subtitle": "What you eat, then what you do.",
  "today.loading": "Loading your day...",
  "today.error": "We could not load your day. Reload the page to try again.",
  "today.no_plan_title": "Your plan isn't published yet",
  "today.no_plan_preview_label": "What your day will look like",
  "today.no_plan_preview_hint":
    "Your coach writes each line. When they publish, your day fills in here, slot by slot.",
  "today.no_plan_footer":
    "Nothing is generated for you in the meantime — an empty space is the honest one until your coach has written your plan.",
  "today.no_plan_body":
    "Your coach is putting it together. It appears here the moment they publish it — you don't have anything to do until then.",
  "today.week_section": "This week, no fixed day",
  "today.week_section_hint": "These lines are satisfied any day before the week closes.",
  // The heading of the lines that name no occasion, INSIDE one of the coach's
  // headings. It used to carry a sentence explaining that these lines were
  // "grouped by what they are" — true when the leftovers were their own block,
  // false now that they sit under Every day / Supplements / What we are cutting
  // like everything else. And with the block recurring under each heading, the
  // sentence recurred with it. Three words that are exactly true beat one
  // paragraph that stopped being.
  "today.free_section": "No set time",
  "today.family_tally_label": "Today, area by area",
  "today.family_tally_kept": "{kept}/{total} held",
  "today.family_tally_lines": "{count} today",
  "today.derived_note":
    "What you log is recorded straight away. How the day is scored is computed afterwards, from those records - never from a tap alone.",
  "today.log_pending": "Saving...",
  "today.logged_count": "Logged {count}x today",
  "today.instruction_label": "From your coach",
  "today.evidence_photo": "Your coach asked for a photo on this one.",
  "today.auto_source": "Read from your {source}. Silence never counts as missed.",
  "today.outcome_only": "Tracked, not scored.",
  "today.deviation_banner": "Off-plan declared for today: {kind}. This day leaves the count.",
  "today.deviation_banner_slot": "Off-plan declared for {slot}: {kind}.",
  "today.covered_by_deviation": "Covered by your declared deviation.",
  "today.log_error": "That did not save. Nothing was recorded - try again.",
  "today.coverage_label": "Days logged this week",
  "today.coverage_value": "{logged} of {total}",
  "today.insufficient_data": "Insufficient data",
  "today.insufficient_data_hint":
    "Adherence stays hidden until {min} days of the week are logged. That is the rule, not a punishment.",

  // Meal photo (W5.4). CONTRACT non-input #4 governs every string below: a
  // photo evidences what is on the plate, it never measures it. No calorie, no
  // gram, no percentage — including no confidence percentage — appears here.
  "photo.button": "Add a photo",
  "photo.button_hint": "Snap the plate. I read what is on it, never how many calories.",
  "photo.choose": "Choose a photo",
  "photo.change": "Choose another",
  "photo.preview_alt": "The photo you are about to send",
  "photo.send": "Send this photo",
  "photo.sending": "Reading your photo...",
  "photo.cancel": "Cancel",
  "photo.saved": "Photo saved.",
  "photo.already_on_file": "That photo was already on file. Nothing was logged twice.",
  "photo.analysis_failed":
    "Your photo is saved, but I could not read it this time. Nothing was recorded about its content.",
  "photo.unusable":
    "Your photo is saved. I could not make out the food well enough to say anything about it.",
  "photo.detected_label": "On the plate",
  "photo.portion_label": "Portion",
  "photo.portion.small": "On the small side",
  "photo.portion.moderate": "Moderate",
  "photo.portion.large": "Generous",
  "photo.portion.unclear": "Hard to tell from the photo",
  "photo.verdict_label": "Against your plan",
  "photo.verdict.consistent": "Looks consistent",
  "photo.verdict.partial": "Partly there",
  "photo.verdict.inconsistent": "Does not line up",
  "photo.verdict.not_visible": "Cannot tell from this photo",
  "photo.low_confidence": "I am not confident about this reading. Correct me if I got it wrong.",
  "photo.no_quantity_note":
    "A photo tells me what is on the plate, not how much of it. Nothing here is a measurement.",
  "photo.error": "That did not send. Nothing was saved - try again.",
  "photo.too_large": "That image is too large. Try a smaller photo.",
  "photo.unsupported_type": "That file is not a JPEG, PNG or WebP image.",

  // ==========================================================================
  // THE COACH'S SENTENCE (api/labels.ts::commitmentSentence)
  //
  // One plan line, rebuilt in English on a fixed skeleton:
  //     WHEN - HOW MUCH ( of ) WHAT
  // Everything below is a fragment of that skeleton. They are written to be
  // COMPOSED, so most are lowercase and capitalized at assembly time; the ones
  // that always start a sentence carry their own capital.
  // ==========================================================================

  "sentence.separator": " — ",
  "sentence.amount_of": "{amount} of {object}",
  // Said on EVERY capture line. A student who thinks they are being graded on
  // a weight or a mood score starts hiding the bad ones; the coach then reads
  // a curated week. This clause is the whole defence.
  "sentence.tracked_suffix": " · tracked, not scored",

  // WHEN - which days
  "when.every_day": "Every day",
  "when.weekdays": "Weekdays",
  "when.weekends": "Weekends",
  "when.every_named": "Every {days}",
  "when.each_week": "Each week",
  // One day needs its own string: "1 different days a week" is neither
  // grammatical nor meaningful - there is nothing for it to differ from.
  "when.one_day_per_week": "One day a week",
  "when.days_per_week": "{count} days a week",
  // required_days_per_week, said out loud. It is the difference between three
  // portions on Sunday and three separate days - the reason the coach wrote it.
  "when.different_days_per_week": "{count} different days a week",
  "when.at_clock": "at {time}",
  "when.between_clock": "between {from} and {to}",

  // WHEN - where in the day, on a do/avoid line (an ACCOMPANIMENT)
  "when.at.on_waking": "on waking",
  "when.at.breakfast": "with breakfast",
  "when.at.snack_am": "at the morning snack",
  "when.at.pre_workout": "before training",
  "when.at.lunch": "with lunch",
  "when.at.post_workout": "after training",
  "when.at.snack_pm": "at the afternoon snack",
  "when.at.dinner": "with dinner",
  "when.at.before_bed": "before bed",
  "when.at.any_meal": "at every meal",
  "when.at.any_time": "any time of day",

  // WHEN - where in the day, on a capture line (a MOMENT of observation).
  // "with dinner" would read as an instruction to eat; "each evening" reads as
  // the moment you write the number down, which is what a capture line is.
  "when.observe.on_waking": "on waking",
  "when.observe.breakfast": "each morning at breakfast",
  "when.observe.snack_am": "each morning",
  "when.observe.pre_workout": "before each session",
  "when.observe.lunch": "each midday",
  "when.observe.post_workout": "after each session",
  "when.observe.snack_pm": "each afternoon",
  "when.observe.dinner": "each evening",
  "when.observe.before_bed": "each evening, before bed",
  "when.observe.any_meal": "at every meal",
  "when.observe.any_time": "any time of day",

  // WHEN - the same capture moment, STRIPPED of its recurrence, for the
  // sentences that already print a day clause. "Weigh once a week, Saturday
  // morning" composed out of the table above read "Every Saturday, each morning
  // at breakfast" - two quantifiers over one recurrence, and the second one
  // contradicts the first. Every entry here is the bare moment; the day clause
  // in front of it owns how often it comes round.
  "when.moment.on_waking": "on waking",
  "when.moment.breakfast": "at breakfast",
  "when.moment.snack_am": "at the morning snack",
  "when.moment.pre_workout": "before the session",
  "when.moment.lunch": "at lunch",
  "when.moment.post_workout": "after the session",
  "when.moment.snack_pm": "at the afternoon snack",
  "when.moment.dinner": "in the evening",
  "when.moment.before_bed": "before bed",
  "when.moment.any_meal": "at every meal",
  "when.moment.any_time": "any time of day",

  // HOW MUCH
  // "none", never "0": polarity='avoid' with presence==0 is a comparator in
  // the database and a prescription on the page.
  "amount.none": "none",
  "amount.at_least": "at least {quantity}",
  "amount.at_most": "no more than {quantity}",
  "amount.between": "{min} to {max}",
  "amount.rate_between": "rate {min} to {max}",
  // A clock-time target is a moment, not a quantity: "no more than 2300" is
  // what the number looks like when it goes through the quantity path.
  "amount.by_time": "by {time}",
  "amount.at_time": "at {time}",

  // Units as WORDS, agreeing with their count. Symbol units carry the same
  // string in both forms - the seed decides, not a branch in the renderer.
  "unit.one.kcal": "kcal",
  "unit.many.kcal": "kcal",
  "unit.one.g": "g",
  "unit.many.g": "g",
  "unit.one.mg": "mg",
  "unit.many.mg": "mg",
  "unit.one.mcg": "mcg",
  "unit.many.mcg": "mcg",
  "unit.one.IU": "IU",
  "unit.many.IU": "IU",
  "unit.one.ml": "ml",
  "unit.many.ml": "ml",
  "unit.one.l": "L",
  "unit.many.l": "L",
  "unit.one.min": "minute",
  "unit.many.min": "minutes",
  "unit.one.h": "hour",
  "unit.many.h": "hours",
  "unit.one.km": "km",
  "unit.many.km": "km",
  "unit.one.kg": "kg",
  "unit.many.kg": "kg",
  "unit.one.capsule": "capsule",
  "unit.many.capsule": "capsules",
  "unit.one.tablet": "tablet",
  "unit.many.tablet": "tablets",
  "unit.one.scoop": "scoop",
  "unit.many.scoop": "scoops",
  "unit.one.portion": "portion",
  "unit.many.portion": "portions",
  "unit.one.serving": "serving",
  "unit.many.serving": "servings",
  "unit.one.rep": "rep",
  "unit.many.rep": "reps",
  "unit.one.session": "session",
  "unit.many.session": "sessions",
  "unit.one.celsius": "C",
  "unit.many.celsius": "C",
  "unit.one.point": "point",
  "unit.many.point": "points",
  "unit.one.hhmm": "",
  "unit.many.hhmm": "",
  "unit.one.none": "",
  "unit.many.none": "",

  // Weekday tokens, long form (used inside "Every Monday and Friday")
  "day.long.mon": "Monday",
  "day.long.tue": "Tuesday",
  "day.long.wed": "Wednesday",
  "day.long.thu": "Thursday",
  "day.long.fri": "Friday",
  "day.long.sat": "Saturday",
  "day.long.sun": "Sunday",
  "common.list_pair": "{first} and {second}",

  // food_groups.label_i18n_key. The table has carried these keys since the P0
  // migration and nothing defined them; every food line therefore had to fall
  // back to its raw slug ("non_starchy_veg"). Written as the word a coach uses
  // mid-sentence, lowercase, because that is where they are read:
  // "2 servings of vegetables".
  "food_group.lean_protein": "protein",
  "food_group.fatty_fish": "oily fish",
  "food_group.white_fish": "white fish",
  "food_group.shellfish": "shellfish",
  "food_group.poultry": "poultry",
  "food_group.red_meat": "red meat",
  "food_group.eggs": "eggs",
  "food_group.legumes": "legumes",
  "food_group.tofu_tempeh": "tofu or tempeh",
  "food_group.dairy_yogurt": "yogurt",
  "food_group.dairy_cheese": "cheese",
  "food_group.whole_grain": "wholegrains",
  "food_group.refined_grain": "refined grains",
  "food_group.starchy_veg": "starchy vegetables",
  "food_group.cruciferous_veg": "cruciferous vegetables",
  "food_group.leafy_greens": "leafy greens",
  "food_group.non_starchy_veg": "vegetables",
  "food_group.berries": "berries",
  "food_group.citrus": "citrus fruit",
  "food_group.other_fruit": "fruit",
  "food_group.nuts_seeds": "nuts and seeds",
  "food_group.olive_oil": "olive oil",
  "food_group.other_added_fat": "added fat",
  "food_group.sauce_dressing": "sauces and dressings",
  "food_group.sugar_sweets": "sugar and sweets",
  "food_group.fried_food": "fried food",
  "food_group.alcohol": "alcohol",
  "food_group.sweetened_beverage": "sweetened drinks",
  "food_group.water": "water",
  "food_group.coffee_tea": "coffee or tea",

  // substances.label_i18n_key - same story as food_groups: the keys were in
  // the migration, the labels were nowhere.
  "substance.vitamin_d3": "vitamin D3",
  "substance.omega3_epa_dha": "omega-3 (EPA+DHA)",
  "substance.magnesium_glycinate": "magnesium glycinate",
  "substance.iron_bisglycinate": "iron bisglycinate",
  "substance.creatine_monohydrate": "creatine monohydrate",
  "substance.vitamin_k2": "vitamin K2",
  "substance.methylfolate": "methylfolate",
  "substance.zinc": "zinc",
  "substance.copper": "copper",
  "substance.curcumin": "curcumin",
  "substance.piperine": "piperine",
  "substance.alcohol": "alcohol",
  "substance.caffeine": "caffeine",
  "substance.gluten": "gluten",
  "substance.st_johns_wort": "St John's wort",
  "substance.melatonin": "melatonin",
  "substance.ashwagandha": "ashwagandha",
  "substance.berberine": "berberine",
  "substance.vitamin_c": "vitamin C",
  "substance.vitamin_a": "vitamin A",
  "substance.vitamin_e": "vitamin E",
  "substance.vitamin_b12": "vitamin B12",
  "substance.niacin": "niacin",
  "substance.selenium": "selenium",
  "substance.iodine": "iodine",
  "substance.calcium_citrate": "calcium citrate",
  "substance.potassium": "potassium",
  "substance.omega3_epa": "omega-3 EPA",
  "substance.omega3_dha": "omega-3 DHA",
  "substance.collagen": "collagen",
  "substance.whey_protein": "whey protein",
  "substance.casein": "casein",
  "substance.fiber_psyllium": "psyllium fibre",
  "substance.probiotic": "probiotic",
  "substance.coq10": "CoQ10",
  "substance.nac": "NAC",
  "substance.glycine": "glycine",
  "substance.taurine": "taurine",
  "substance.electrolytes": "electrolytes",
  "substance.sodium_chloride": "salt",

  // ==========================================================================
  // BLOCKING ISSUES, ASKED AS QUESTIONS (api/labels.ts::commitmentQuestions)
  //
  // What used to be here was the SQL:
  //   "plan_commitments_target_check: target_op='<=' requires target_max"
  // A coach cannot act on a constraint name, and should never learn that one
  // exists. Every string below is a decision only they can make.
  // ==========================================================================
  "question.section": "Needs your decision",
  "question.when": "When in the day should this happen?",
  "question.how_much": "How much, exactly?",
  "question.time": "What time?",
  "question.window": "Between what times?",
  "question.title": "What is this line? It has no name yet.",
  "question.which_supplement": "Which supplement is this?",
  "question.day_or_week": "Is this a daily rule or a weekly one?",
  "question.how_many_days": "How many days a week?",
  "question.how_many_times": "How many times a day?",
  // The honest fallback. Better than a constraint name, and it says whose
  // problem it is: we could not read the line, so we ask for it again.
  "question.unreadable": "I could not read this line — can you rewrite it?",
  "question.slot_placeholder": "Pick a moment",

  // Slot vocabulary (slot_vocabulary.label_i18n_key)
  "slot.on_waking": "On waking",
  "slot.breakfast": "Breakfast",
  "slot.snack_am": "Morning snack",
  "slot.pre_workout": "Pre-workout",
  "slot.lunch": "Lunch",
  "slot.post_workout": "Post-workout",
  "slot.snack_pm": "Afternoon snack",
  "slot.dinner": "Dinner",
  "slot.before_bed": "Before bed",
  "slot.any_meal": "Any meal",
  "slot.any_time": "Any time",

  // Weekday tokens (R1: mon..sun are data; these are the display labels)
  "day.mon": "Mon",
  "day.tue": "Tue",
  "day.wed": "Wed",
  "day.thu": "Thu",
  "day.fri": "Fri",
  "day.sat": "Sat",
  "day.sun": "Sun",

  // Fact source (protocol_events.source) - reached through messageKey(), so an
  // unrecognised source is a loud error, never a raw slug on screen (R7).
  "event.source.photo": "Photo",
  "event.source.text": "Written",
  "event.source.voice": "Voice",
  "event.source.chat": "Chat",
  "event.source.quick_tap": "Tapped in the app",
  "event.source.integration": "Device",
  "event.source.coach_entry": "Entered by the coach",

  // Evaluation status (commitment_evaluations.status)
  "status.unknown": "Not logged yet",
  "status.met": "Done",
  "status.partial": "Partly done",
  "status.missed": "Missed",
  "status.not_applicable": "Not counted",
  "status.flex_used": "Flex used",

  // Timing status (commitment_evaluations.timing_status)
  "timing.on_time": "On time",
  "timing.off_window": "Done, outside the planned window",
  "timing.unknown": "Timing unknown",
  "timing.not_applicable": "No timing",

  // Priority (plan_commitments.priority)
  "priority.core": "Core",
  "priority.secondary": "Secondary",
  "priority.optional": "Optional",

  // THE TWO PARTS OF A PLAN (+ what is only watched).
  // The titles a coach reads above their own plan, and the ones a student reads
  // above their day. Same words on both screens on purpose: the coach must be
  // able to picture what they are publishing.
  "part.food": "Food",
  "part.actions": "Actions",
  "part.observations": "Observations",
  "part.unsorted": "Not sorted yet",
  "part.hint.food": "What your client eats — meals, foods and their supplements.",
  "part.hint.actions": "What your client does — movement, sleep, light, recovery.",
  "part.hint.observations":
    "Tracked, not scored. What your client records for you — never a thing to hold, so never counted as one.",
  "part.hint.unsorted":
    "We could not tell what kind of thing these are. Open one and say which.",

  // The same three parts, said to the student.
  "part.student.food": "What I eat",
  "part.student.actions": "What I do",
  "part.student.observations": "What I record",
  "part.student.unsorted": "Not sorted yet",
  "part.student.hint.food": "In the order of your day.",
  "part.student.hint.actions": "Movement, sleep, light, recovery.",
  "part.student.hint.observations": "Tracked, not scored.",
  "part.student.hint.unsorted": "Your coach has not said what these are yet.",

  // Inside FOOD — the coach's own headings, not our columns.
  "food_section.every_day": "Every day",
  "food_section.every_week": "Every week",
  "food_section.cutting": "What we are cutting",
  "food_section.supplements": "Supplements",

  // Activity class (plan_commitments.activity_class)
  "activity.nutrition": "Nutrition",
  "activity.supplement": "Supplement",
  "activity.movement": "Movement",
  "activity.recovery": "Recovery",
  "activity.exposure": "Exposure",
  "activity.sleep": "Sleep",
  "activity.mind": "Mind",
  "activity.measurement": "Measurement",
  "activity.other": "Other",

  // Autonomy (plan_commitments.autonomy, plan_templates.default_autonomy).
  // How much latitude the line grants the student. Said as a sentence, not as
  // the slug: the coach picking this is answering "how much can they change?".
  "autonomy.strict": "Exactly as written",
  "autonomy.swap_within_policy": "Swaps allowed, within the policy below",
  "autonomy.flexible": "Their call",

  // Units (plan_commitments.unit) - display labels, storage stays SI (R4)
  "unit.kcal": "kcal",
  "unit.g": "g",
  "unit.mg": "mg",
  "unit.mcg": "mcg",
  "unit.IU": "IU",
  "unit.ml": "ml",
  "unit.l": "L",
  "unit.min": "min",
  "unit.h": "h",
  "unit.km": "km",
  "unit.kg": "kg",
  "unit.capsule": "capsule",
  "unit.tablet": "tablet",
  "unit.scoop": "scoop",
  "unit.portion": "portion",
  "unit.serving": "serving",
  "unit.rep": "rep",
  "unit.session": "session",
  "unit.celsius": "C",
  "unit.point": "point",
  "unit.hhmm": "time",
  "unit.none": "",

  // Declare a deviation (planned_deviations) - first-class, never a confession
  "deviation.title": "Declare a deviation",
  "deviation.subtitle":
    "A restaurant, a trip, a family meal. Say it before it happens: the slot leaves the count instead of scoring zero. This is part of the plan, not a failure.",
  "deviation.kind_label": "What is coming up",
  "deviation.kind.restaurant": "Eating out",
  "deviation.kind.social": "Social event",
  "deviation.kind.travel": "Travel",
  "deviation.kind.family": "Family meal",
  "deviation.kind.work": "Work constraint",
  "deviation.kind.other": "Something else",
  "deviation.when_label": "When",
  "deviation.when_today": "Today",
  "deviation.when_tomorrow": "Tomorrow",
  "deviation.slot_label": "Which slot",
  "deviation.slot_all_day": "The whole day",
  "deviation.note_label": "Anything your coach should know",
  "deviation.note_placeholder": "Optional. Your words, kept as you wrote them.",
  "deviation.submit": "Declare it",
  "deviation.submitting": "Declaring...",
  "deviation.declared": "Declared: {kind} on {date}.",
  "deviation.error": "That did not save. Nothing was declared - try again.",

  // Student progress view
  "progress.title": "Your progress",
  "progress.subtitle":
    "What moves first is whether you keep showing up. The rest follows, later and slower.",
  "progress.loading": "Loading your progress...",
  "progress.error": "We could not load your progress. Reload the page to try again.",
  "progress.empty":
    "Nothing recorded yet. Your first logged day starts the picture.",
  "progress.regularity_title": "Regularity",
  "progress.regularity_caption": "Days you logged something, week by week.",
  "progress.regularity_days": "{count} of {total} days",
  "progress.week_label": "Week of {date}",
  "progress.week_current": "This week",
  "progress.streaks_title": "Showing up",
  "progress.streak_current": "Current streak",
  "progress.streak_best": "Best streak",
  "progress.days_value": "{count} days",
  "progress.day_value": "{count} day",
  "progress.kept_title": "Commitments kept",
  "progress.kept_caption": "Each one is a recorded fact, not an estimate.",
  "progress.kept_value": "{count} kept over the last {days} days",
  "progress.obstacles_title": "Obstacles cleared",
  "progress.obstacles_caption":
    "Days you knew would be hard, declared in advance, and still kept something on.",
  "progress.obstacles_empty":
    "Nothing declared yet. When a restaurant or a trip is coming, declare it - it belongs to the plan.",
  "progress.obstacles_entry": "{kind} on {date} - {count} kept",
  "progress.adherence_title": "Adherence",
  "progress.adherence_overall": "Overall",
  "progress.adherence_core": "Core commitments",
  "progress.insufficient_data": "Insufficient data",
  "progress.insufficient_data_gate":
    "A percentage needs {min} logged days in the week. You have {logged}.",
  "progress.insufficient_data_review":
    "The week has enough logs. The number appears once the week is reviewed.",
  "progress.outcomes_title": "Body measures",
  "progress.outcomes_caption":
    "Last on this page, on purpose. It stalls and swings while the work is already paying off.",
  "progress.outcomes_weight": "7-day average weight: {value}",
  "progress.outcomes_empty": "No measure recorded yet.",
  "progress.outcomes_show": "Show body measures",
  "progress.outcomes_hide": "Hide body measures",

  // The shared week (components/WeekView.tsx) — ONE copy set for BOTH readers.
  // Nothing here is written in the second person: the student and the coach
  // mount the same component over the same model, and a sentence that says
  // "you" to one of them would be the first crack in that.
  "week.nav.previous": "Previous week",
  "week.nav.next": "Next week",
  "week.nav.current": "Back to this week",
  "week.label": "Week {week}, {year}",
  "week.range": "{from} to {to}",
  "week.loading": "Loading this week...",
  "week.error": "This week could not be loaded. Nothing is shown rather than something wrong.",
  "week.retry": "Try again",
  "week.in_progress":
    "This week is still running. The days ahead are not counted as missed.",
  "week.empty": "Nothing recorded for this week.",
  "week.summary_title": "Week summary",
  "week.coverage_label": "Days logged",
  "week.coverage_value": "{count}/{total}",
  "week.coverage_caption":
    "Coverage comes first: early on it is the only number that predicts anything. A day counts once it carries {min} logged facts.",
  "week.run_label": "Longest run",
  "week.facts_label": "Facts logged",
  "week.deviations_label": "Declared ahead",
  "week.days_title": "Day by day",
  "week.day_facts": "{count} logged",
  "week.day_declared": "declared",
  "week.highlights_title": "What held, what slipped",
  "week.highlight_held": "Held best",
  "week.highlight_dropped": "Slipped most",
  "week.highlight_counts": "{met} done - {partial} partly - {missed} missed",
  "week.highlight_none":
    "No single line has enough resolved days this week to be named.",
  "week.highlight_locked":
    "Named once the week has {min} logged days. This one has {logged}.",
  "week.adherence_label": "Adherence",
  "week.adherence_locked": "Insufficient data",
  "week.adherence_gate":
    "A percentage needs {min} logged days in the week. This one has {logged}. Showing one now would be a number about typing, not about the week.",
  "week.adherence_no_review":
    "The week has enough logs. The number appears once the week is reviewed - nothing is computed here on the fly.",
  "week.lines_title": "Line by line",
  "week.lines_col_line": "Commitment",
  "week.lines_empty": "No active line in the published plan.",
  "week.line_weekly": "Weekly line",
  "week.line_off": "Not on the plan that day",
  "week.line_future": "Still to come",
  "week.line_no_row": "Not evaluated yet",
  "week.deviations_title": "Declared in advance",
  "week.deviations_caption":
    "Declared before the day, not confessed after it. Out of the denominator, not out of the week.",
  "week.deviations_empty": "Nothing declared this week.",
  "week.deviation_entry": "{kind} on {date}",
  "week.deviation_flex": "flex used",
  "week.facts_title": "What was logged",
  "week.facts_empty": "No fact recorded this week.",
  "week.facts_logged": "logged",
  "week.facts_photo": "photo on file",

  // Coach: one student's space (/coach/clients/:id)
  "coach.student.opening": "Opening this space...",
  "coach.student.read_only": "Read-only",
  // The way in to /coach/clients/:id/meals. Without it the composer had no
  // entry point at all: the route existed and nothing linked to it.
  "coach.student.meal_plan_cta": "Plan this student's meals",
  "coach.student.unnamed": "Student",
  "coach.student.no_plan": "No published plan for this student yet.",
  "coach.student.denied_title": "This space is not yours to read",
  "coach.student.denied_body":
    "A coach reads a student's space only while that student's consent stands. If they revoked it, or if they never accepted your invitation, there is nothing here - by design, not by error.",
  "coach.student.error_title": "We could not load this space",
  "coach.student.footer":
    "You are reading, not acting, and you are reading exactly the week your student reads. What they write - their notes on a logged meal, their words in chat, their photos - stays with them; you see that a fact exists and what it measured. Every opening of this page is recorded and visible to them.",

  // Student progress: the week, then the trend
  "progress.week_title": "This week",
  "progress.trend_title": "Across the last {weeks} weeks",

  // Student app chrome
  "app.nav.today": "Today",
  "app.nav.meals": "Meals",
  "app.nav.progress": "Progress",
  "app.plan_untitled": "Your plan",
  "app.guard.checking": "Checking your access...",
  "app.guard.not_student_title": "This space is for students",
  "app.guard.not_student_body":
    "Your account is not following a coach's plan. Ask your coach for an invitation.",

  // Invitation
  "invite.title": "Invite a student",
  "invite.email_label": "Student email",
  "invite.send_button": "Send invitation",
  "invite.sent": "Invitation sent to {email}",
  "invite.expired": "This invitation has expired. Ask your coach for a new one.",
  "invite.accept_title": "{coach} invited you to their coaching program",
  "invite.accept_button": "Accept invitation",
  // Shown when the invited address already has an account — the likeliest case
  // in a pilot, since a coach invites the clients they already have.
  "invite.existing_account_title": "You already have an account",
  "invite.existing_account_body":
    "This address is already registered, so there is nothing to create. Sign in and your coach's invitation is applied automatically — you don't have to come back to this link.",
  "invite.existing_account_cta": "Sign in and accept",
  "invite.already_in_title": "You're already in",
  "invite.already_in_body":
    "This invitation has been accepted and your coach is connected to your space. Nothing else to do here.",
  "invite.already_in_cta": "Go to my space",

  // Attack cards (extracted from the legacy LabCardsPanel in W2.B)
  "attack.section.title": "Attack",
  "attack.section.subtitle":
    "Cards that make action feel more natural, less costly, and less dependent on raw willpower.",
  "attack.how_it_works.label": "How does it work?",
  "attack.how_it_works.body":
    "An attack card is not there to push you harder at the last second. It works upstream, so the right behaviour is already easier when the moment arrives. In practice you prepare the ground — mentally or materially — to cut friction and hesitation, so you need less force on the day. A visual anchor can put you back on track without renegotiating with yourself; a start ritual can make beginning far simpler.",
  "attack.techniques.label": "Which techniques?",
  "attack.techniques.all_created": "Every technique has already been created.",
  "attack.preview.generates": "Generates: {output}",
  "attack.free.title": "Free attack cards",
  "attack.free.subtitle": "For actions that can help you but are not part of the plan.",
  "attack.free.loading": "Loading...",
  "attack.free.add": "Add a card",
  "attack.free.preparing": "Preparing...",
  "attack.free.empty": "You do not have a free attack card in this section yet.",
  "attack.free.create_first": "Create my first card",
  "attack.free.all_created": "All 6 cards have already been created.",
  "attack.free.remaining_one": "{count} technique left.",
  "attack.free.remaining_many": "{count} techniques left.",
  "attack.plan.title": "Plan attack cards",
  "attack.plan.subtitle":
    "They are filed here, level by level, when you choose to prepare one for a plan action.",
  "attack.card.created_badge": "Created",
  "attack.card.keyword_label": "Keyword",
  "attack.card.supporting_points": "Supporting points",
  "attack.card.how_to_use": "How to use it",
  "attack.card.adjust": "I tried it, it is not working",
  "attack.card.analyzing": "Analyzing...",

  // Attack card creation flow
  "attack.flow.eyebrow": "Attack card",
  "attack.flow.title_choose": "Choose the technique",
  "attack.flow.title_questions": "Questionnaire",
  "attack.flow.title_result": "Your card is ready",
  "attack.flow.help_choose": "Pick one of the 6 techniques, then follow its short path.",
  "attack.flow.help_questions": "Answer the questions so the card fits you.",
  "attack.flow.help_result": "You can close this. The card now lives in your space.",
  "attack.flow.none_left": "All 6 attack cards already exist for this space.",
  "attack.flow.change_technique": "Change technique",
  "attack.flow.generate": "Generate the card",
  "attack.flow.generating": "Generating...",
  "attack.flow.generated_eyebrow": "Generated card",
  "attack.flow.error_missing_answers": "Answer the questions to generate this card.",
  "attack.flow.error_generate_failed": "This card cannot be generated right now.",

  // Attack card adjustment flow
  "attack.adjust.eyebrow": "Adjust an attack card",
  "attack.adjust.title_feedback": "What did not land?",
  "attack.adjust.title_choose": "Proposed new direction",
  "attack.adjust.title_result": "Your new version is ready",
  "attack.adjust.help_feedback":
    "We keep the context, understand what got stuck, then refine or switch technique.",
  "attack.adjust.help_choose":
    "Here is the direction that looks most suitable — you can change it.",
  "attack.adjust.help_questions": "A few more answers so we can generate something sharper.",
  "attack.adjust.help_result": "The card has been recalibrated from your feedback.",
  "attack.adjust.current_technique": "Current technique",
  "attack.adjust.why_question": "Why do you feel it did not work?",
  "attack.adjust.notes_label": "You can add anything else here",
  "attack.adjust.reason.forgot": "I did not think of it at the right moment",
  "attack.adjust.reason.too_abstract": "It was too abstract",
  "attack.adjust.reason.too_hard": "It was too hard to do",
  "attack.adjust.reason.did_not_resonate": "It did not speak to me",
  "attack.adjust.reason.wrong_problem": "The real problem was not that one",
  "attack.adjust.reason.other": "Other",
  "attack.adjust.proposal": "Suggestion",
  "attack.adjust.decision_change": "Switching technique looks like the better move.",
  "attack.adjust.decision_refine": "Refining this technique looks like the better move.",
  "attack.adjust.new_version": "New version",
  "attack.adjust.regenerate": "Regenerate something better suited",
  "attack.adjust.regenerating": "Regenerating...",
  "attack.adjust.error_analyze": "This card cannot be analysed right now.",
  "attack.adjust.error_missing_answers": "Answer the questions to recalibrate this card.",
  "attack.adjust.error_regenerate": "This card cannot be regenerated right now.",

  // Shared chrome
  "common.back": "Back",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.continue": "Continue",

  // Brand + public chrome (header/footer shared by the public pages)
  "brand.wordmark": "Sophia",
  "public.header.sign_in": "Sign in",
  "public.header.start_trial": "Start free trial",
  "public.footer.tagline": "Sophia runs the plan. You keep the pen.",
  "public.footer.legal": "Legal & privacy",
  "public.footer.contact": "Contact",
  "public.footer.contact_email": "sophia@sophia-coach.ai",
  "public.footer.copyright": "Sophia — coaching software",

  // App shell (connected chrome, coach + student)
  "shell.nav.students": "Students",
  "shell.nav.templates": "Templates",
  "shell.nav.doctrine": "Doctrine",
  "shell.nav.account": "Account",
  "shell.nav.sign_out": "Sign out",

  // Auth page cross-links (the two doors reference each other)
  "auth.coach_link.prompt": "Are you a coach?",
  "auth.coach_link.cta": "Create a coach account",
  "auth.coach_link.back_prompt": "Not a coach?",
  "auth.coach_link.back_cta": "Go to the standard sign-in",

  // Landing — hero
  "landing.seo_title": "Sophia — your coaching plan, run every day",
  "landing.seo_description":
    "Sophia is the client-side AI for professional coaches. You write the plan; Sophia runs it with your client on WhatsApp every day — a photo of the plate or one sentence is enough — and hands you the clients who need you on Monday.",
  "landing.hero.kicker": "For professional coaches",
  "landing.hero.title": "You write the plan. Sophia makes sure it gets lived.",
  "landing.hero.subtitle":
    "Sophia runs your protocol with your client on WhatsApp, every day. A photo of the plate or one sentence is enough to log a meal — no app to install. On Monday you get the few clients who actually need you.",
  "landing.hero.cta_trial": "Start free trial",
  "landing.hero.cta_signin": "Sign in",
  "landing.hero.note":
    "Built for independent coaches. Your clients join by invitation, and answer where they already type all day.",

  // Landing — schematic product preview (labels inside the CSS mock, generic on purpose)
  "landing.mock.monday_title": "Monday review",
  "landing.mock.needs_attention": "Needs your attention",
  "landing.mock.on_track": "On track — no action needed",
  "landing.mock.insufficient": "Insufficient data",
  "landing.mock.client_generic": "Client",
  "landing.mock.student_today": "On WhatsApp, today",
  "landing.mock.logged": "Logged",
  "landing.mock.photo_alt": "Photo of a plate, sent by the client",
  "landing.mock.chat_student": "Lunch — had to eat out today",
  "landing.mock.chat_sophia":
    "Greens and lean protein, both on today's plan. Logged, moderate portion.",

  // Landing — the problem
  "landing.problem.kicker": "The problem",
  "landing.problem.title": "You only find out when they go quiet",
  "landing.problem.body":
    "Client tracking doesn't fail loudly. It fades: fewer logs, shorter answers, then silence. By the time you notice, the pattern is weeks old.",
  "landing.problem.stat1_value": "Less than half",
  "landing.problem.stat1_label": "of clients are still logging by week 10 of a program",
  "landing.problem.stat2_value": "5.4 → 1.4",
  "landing.problem.stat2_label": "days logged per week between week 4 and week 12",
  "landing.problem.stat3_value": "Shame, not churn intent",
  "landing.problem.stat3_label":
    "the documented reason clients stop reporting after a bad week — they hide from the coach they respect",
  "landing.problem.close":
    "Nobody quits your coaching because the plan was wrong. They drift because nobody was there on Tuesday night. That is the part Sophia takes.",

  // Landing — how it works
  "landing.how.kicker": "How it works",
  "landing.how.title": "Your plan, from PDF to daily practice",
  "landing.how.step1_title": "Drop in your plan",
  "landing.how.step1_body":
    "Import the PDF or paste the text you already wrote. Sophia decomposes it line by line; you review every line and publish. Nothing reaches a client unapproved.",
  "landing.how.step2_title": "Your client lives it, on WhatsApp",
  "landing.how.step2_body":
    "A photo of the plate, or one sentence — “had the salmon, skipped the rice”. Both count the same. Sophia matches it against the line you wrote, answers, and records the fact. Your client also gets a web space with their day and their week, but nothing forces them to open it.",
  "landing.how.step3_title": "Monday, you decide",
  "landing.how.step3_body":
    "You don't get a dashboard to dig through. You get the handful of clients who need a decision from you — and the list of those who don't. You and your client read the same week, side by side, with a summary when it closes.",

  // Landing — what makes Sophia different
  "landing.diff.kicker": "Why Sophia",
  "landing.diff.title": "The market builds AI for your desk. Sophia sits with your client.",
  "landing.diff.body":
    "Every major coaching platform points its AI at the practitioner — summaries, admin, form letters. None of them puts a conversational AI on the client's side of the relationship. Sophia does exactly that, with one constraint the others don't have: it executes your plan. It never writes one.",
  "landing.diff.point1":
    "Lives on WhatsApp, where your client already types every day — nothing to install, nothing to remember to open",
  "landing.diff.point2":
    "A photo or a sentence both count: Sophia reads the plate against your plan, never as a calorie estimate",
  "landing.diff.point3": "Escalates to you with the client's words and the facts. You decide.",

  // Landing — doctrine
  "landing.doctrine.kicker": "Our doctrine",
  "landing.doctrine.title": "Three rules we don't bend",
  "landing.doctrine.rule1_title": "You write. Sophia never does.",
  "landing.doctrine.rule1_body":
    "Sophia executes the protocol you published. It never edits a prescription, never pads one, never improvises one. Your client hears your plan, kept alive.",
  "landing.doctrine.rule2_title": "No number without the days behind it.",
  "landing.doctrine.rule2_body":
    "Adherence is only shown once a client has logged at least 4 of 7 days. Below that you see “insufficient data” — because a made-up percentage is worse than none.",
  "landing.doctrine.rule3_title": "A fact is never deduced from another.",
  "landing.doctrine.rule3_body":
    "A logged meal is a logged meal. It never silently becomes a nutrient count, a calorie score or a guessed habit. What you read is what happened — or it isn't shown.",
  "landing.doctrine.no_calories_title": "And no, Sophia doesn't count calories.",
  "landing.doctrine.no_calories_body":
    "We measured it on our own model before deciding: calorie estimates from a photo land roughly a quarter under the truth, and the gap widens as the plate gets fuller. That error does not average out over a week — it leans the same way every time, hardest exactly where you would want to look. So Sophia reports what is on the plate and how big the portion is, against the line you wrote, and leaves the numbers to the person qualified to prescribe them. That refusal is the feature.",

  // Landing — pricing
  "landing.pricing.kicker": "Pricing",
  "landing.pricing.title": "Priced to grow with your results",
  "landing.pricing.base": "$49",
  "landing.pricing.base_period": "per month",
  "landing.pricing.base_label": "Your coach workspace",
  "landing.pricing.seat": "+ $12",
  "landing.pricing.seat_period": "per active client per month",
  "landing.pricing.seat_label": "Active = 3 or more interactions that month",
  "landing.pricing.why":
    "You pay for clients who are actually engaging — the ones Sophia is keeping in your program. If a client goes quiet, they cost you nothing. Our margin depends on their engagement, exactly like yours does.",
  "landing.pricing.cta": "Start free trial",

  // Landing — closing call
  "landing.closing.title": "Your next client review could be three decisions, not thirty tabs.",
  "landing.closing.cta": "Start free trial",
  "landing.closing.signin_prompt": "Already using Sophia?",
  "landing.closing.signin_link": "Sign in",
} as const
