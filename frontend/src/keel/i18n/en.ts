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
  // `coach.home.import_cta` / `coach.home.templates_cta` ont disparu avec les
  // deux boutons qu'elles nommaient sur l'écran cohorte. Une clé sans lecteur
  // est du texte que personne ne voit mais que tout le monde traduit.
  "coach.home.open_student": "Open",
  "coach.home.list_title": "Students",
  // ── LES INVITATIONS EN ATTENTE ──────────────────────────────────────────
  // Signalé par un coach: « on n'a aucune idée de qui est en attente de
  // confirmation d'invitation ». La tuile « Invitations pending » comptait
  // `coach_clients.status='invited'`, une valeur que le chemin d'invitation ne
  // produit jamais — elle affichait donc zéro en permanence.
  "coach.home.invites_title": "Invited, not joined yet",
  "coach.home.invites_hint":
    "Nothing exists in their name until they accept. Inviting the same address again sends a fresh link and cancels the old one.",
  "coach.home.invite_state_pending": "Waiting",
  "coach.home.invite_state_expired": "Expired",
  "coach.home.invite_expires_at": "Link valid until {date}",
  "coach.home.invite_expired_at": "Link expired on {date} — invite them again",
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

  // ── LA BIBLIOTHÈQUE DE RECETTES DU COACH (/coach/meals) ─────────────────
  // Un artefact COLLECTIF, comme la doctrine: le coach écrit un plat une fois,
  // tous ses élèves le lisent. Aucune copie ici n'a le droit de suggérer qu'on
  // compose la semaine de quelqu'un — c'est précisément le 1:1 que le pivot a
  // retiré (`meal_plan_entries`, supprimée le 04/08). Voir docs/keel/MODEL.md.
  "coach.meals.title": "Meals",
  "coach.meals.subtitle":
    "Dishes you write once. Every one of your students sees the same library — you are not composing anybody's week.",
  "coach.meals.loading": "Loading your recipes...",
  "coach.meals.load_error":
    "Your recipe library could not be loaded. Nothing is shown rather than something wrong.",
  "coach.meals.retry": "Try again",
  "coach.meals.no_coach_profile":
    "This account has no active coach profile, so there is no library to write into.",

  "coach.meals.add_title": "Add a dish",
  "coach.meals.field_title": "Name of the dish",
  "coach.meals.field_title_hint": "What you would call it to a student. 120 characters at most.",
  "coach.meals.field_description": "How it is made",
  "coach.meals.field_description_hint":
    "Optional. Ingredients and method, in your words. No quantities are required and none are asked for.",
  "coach.meals.field_slot": "Which moment of the day",
  "coach.meals.field_slot_any": "Any moment",
  "coach.meals.field_slot_hint": "Leave it on « any » unless the dish only makes sense at one time.",
  "coach.meals.field_groups": "What it puts on the plate",
  "coach.meals.field_groups_hint":
    "The only food vocabulary this product has. No grams, no calories — that is a product rule, not a missing feature.",
  "coach.meals.submit": "Add it to the library",
  "coach.meals.submitting": "Adding...",
  "coach.meals.title_required": "A dish needs a name.",
  "coach.meals.create_failed": "That dish was not saved.",

  "coach.meals.list_title": "Your library",
  "coach.meals.empty_title": "Your library is empty",
  "coach.meals.empty_body":
    "Write your first dish above. Your students see it as soon as it is there — you do not have to assign it to anyone.",
  "coach.meals.count_active": "{count} visible to your students",
  "coach.meals.count_archived": "{count} archived",
  "coach.meals.status_active": "Visible",
  "coach.meals.status_archived": "Archived",
  "coach.meals.any_slot": "Any moment",

  // La photo. Elle passe par `coach-recipe-image-v1` — le navigateur est
  // structurellement incapable de toucher un bucket (aucune policy sur
  // `storage.objects`), et l'affichage se fait par URL signée courte.
  "coach.meals.photo_add": "Add a photo",
  "coach.meals.photo_replace": "Replace the photo",
  "coach.meals.photo_uploading": "Sending...",
  "coach.meals.photo_failed": "That photo was not sent.",
  "coach.meals.photo_alt": "Photo of {title}",
  "coach.meals.photo_too_big": "That photo is over 5 MB. Pick a smaller one.",

  "coach.meals.archive": "Hide from students",
  "coach.meals.restore": "Show it again",
  "coach.meals.archive_hint":
    "Hiding keeps the dish — yours, with its photo. Nothing here deletes anything.",
  "coach.meals.archive_failed": "That change did not go through.",

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
  // ── PAS DE PLAN: QUI EST CENSÉ L'ÉCRIRE ─────────────────────────────────
  // Cette copie disait « votre coach est en train de le préparer, vous n'avez
  // rien à faire d'ici là ». C'était faux dans le modèle qu'on a: le coach
  // enseigne une MÉTHODE, il n'écrit pas la semaine de chaque élève — c'est
  // l'élève qui construit la sienne dans « My week's plan ». Un écran qui dit
  // « attendez » à quelqu'un dont c'est le tour est pire qu'un écran vide.
  //
  // ET CETTE PAGE SE REMPLIT MAINTENANT. Il y avait ici une réserve — « on ne
  // promet pas que cette page se remplira », parce que `/app/today` ne lisait
  // que `plan_versions`. Le lecteur existe: l'écran lit les deux choses que
  // `/app/plan` écrit (`student_generated_meals`, et `student_week_plans` quand
  // une semaine adoptée existe). La réserve tombe parce que le code a changé,
  // pas parce que la copie a pris de l'assurance.
  "today.no_plan_title": "You don't have a plan for this week yet",
  "today.no_plan_body":
    "Your coach teaches the method — the week itself is yours to build. Say what you are after, and your eating for the week gets written from their method.",
  "today.no_plan_cta": "Build my week's plan",
  "today.no_plan_preview_label": "What a laid-out day looks like",
  "today.no_plan_preview_hint":
    "What you eat, then what you do — that is the shape a day takes once a plan exists.",
  "today.no_plan_footer":
    "Nothing is generated for you in the meantime — an empty space is the honest one until a plan exists.",
  // ── LA JOURNÉE QUE L'ÉLÈVE S'EST COMPOSÉE ───────────────────────────────
  // `/app/today` ne lisait que le plan publié par un coach. Comme aucun coach
  // n'en publie dans le modèle qu'on livre, l'élève voyait un écran vide même
  // après avoir composé toute sa semaine. Ces lignes-ci viennent de ce qu'il
  // s'est composé lui-même — ses PLATS (`student_generated_meals`) et, quand
  // une existe, sa semaine de méthode adoptée (`student_week_plans`) — et la
  // copie ne doit JAMAIS suggérer qu'on le note: rien ici n'est coché, compté
  // ou évalué.
  "today.own_week_badge": "Your week",
  "today.own_week_hint":
    "You set these lines yourself. Nothing here is scored — it is a reminder, not a test.",
  "today.own_week_empty":
    "Nothing you set for today. The lines below hold across the week.",
  "today.own_week_nothing":
    "Nothing you set for today. Enjoy it — an empty day was a choice you were allowed to make.",
  "today.own_week_anyday": "This week, no fixed day",
  "today.own_week_from_coach": "From your coach's method",
  "today.own_week_from_sophia": "Suggested by Sophia",
  "today.own_week_open_plan": "Open my week's plan",
  // LES PLATS. Deux sections distinctes et nommées différemment parce que ce
  // sont deux objets différents: un plat se cuisine, une ligne de méthode se
  // tient. Les fondre sous un seul titre ferait lire « poulet, riz, épinards »
  // et « build every meal around a protein anchor » comme la même demande.
  "today.own_meals_label": "What you eat today",
  "today.own_meals_empty":
    "Nothing placed on today. What is below holds any day of the week.",
  // Vu quand la composition ne couvre QUE d'autres jours. Ne dit pas « rien
  // pour toi »: les plats existent, ils sont juste ailleurs dans la semaine.
  "today.own_meals_other_days":
    "Nothing placed on today — what you built sits on the other days of the week.",
  "today.own_meals_anyday": "Built for no particular day",
  "today.own_lines_label": "What you set for yourself",

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

  // ── /coach/protocol — la méthode du coach ────────────────────────────────
  // Un écran d'écriture de méthode qui prend vingt minutes ne sera pas rempli.
  // Chaque libellé ici est écrit pour être lu en diagonale par quelqu'un qui
  // édite depuis son téléphone entre deux clients.
  "coach.protocol.title": "Recommended food",
  "coach.protocol.subtitle":
    "The foods you build with. Tap one to add it — say how often and why only if you want to.",
  "coach.protocol.search_placeholder": "Search a food…",
  "coach.protocol.search_empty": "No food matches “{query}”.",
  "coach.protocol.class.protein": "Protein",
  "coach.protocol.class.vegetable": "Vegetables",
  "coach.protocol.class.fruit": "Fruit",
  "coach.protocol.class.grain": "Grains",
  "coach.protocol.class.legume": "Legumes",
  "coach.protocol.class.dairy": "Dairy",
  "coach.protocol.class.fat": "Fats",
  "coach.protocol.class.beverage": "Drinks",
  "coach.protocol.class.discretionary": "Treats & extras",

  // Les quatre états de la pastille. « Neutral » est une VALEUR, pas un vide:
  // l'écrasante majorité des groupes n'appelle aucune opinion, et un coach ne
  // doit pas avoir l'impression de laisser le travail inachevé.
  "coach.protocol.stance.neutral": "No opinion",
  "coach.protocol.stance.encouraged": "Encouraged",
  "coach.protocol.stance.discouraged": "Discouraged",
  "coach.protocol.stance.excluded": "Excluded",
  "coach.protocol.stance.hint": "Tap to cycle: no opinion → encouraged → discouraged → excluded.",

  // L'aperçu. Ces phrases SONT ce que Sophia vérifiera — elles sortent du
  // compilateur, pas d'une reformulation approximative.
  "coach.protocol.preview.title": "What Sophia will check",
  "coach.protocol.preview.empty": "Nothing yet. Tap a food to start.",
  "coach.protocol.preview.encourage": "{group} — at least {n} serving a day, flexible",
  "coach.protocol.preview.discourage": "{group} — go easy, swaps allowed",
  "coach.protocol.preview.exclude": "{group} — avoid, strict",
  "coach.protocol.preview.at_least_day": "{group} — at least {n} a day",
  "coach.protocol.preview.at_least_week": "{group} — at least {n} a week",
  "coach.protocol.preview.at_most_day": "{group} — at most {n} a day",
  "coach.protocol.preview.at_most_week": "{group} — at most {n} a week",
  "coach.protocol.preview.every_meal": "{group} — at every meal",
  "coach.protocol.preview.not_after": "{group} — not after {time}",
  "coach.protocol.preview.at_slot": "{group} — at {slot}",

  // ── Les aliments concrets — ce que le coach touche ───────────────────────
  // Un coach pense « huile de coco », pas « matière grasse ajoutée ». Chaque
  // libellé ici est écrit pour quelqu'un qui édite depuis son téléphone entre
  // deux clients: court, sans jargon de schéma, et jamais une injonction.
  "coach.food.pick_hint":
    "Tap a food to add it to your list. Nothing else is required — the rest of the panel is there if you want it.",
  "coach.food.empty_class": "No food here yet.",
  "coach.food.add": "+ Add a food",
  "coach.food.add.placeholder": "e.g. kefir, coconut aminos…",
  "coach.food.add.submit": "Add",
  "coach.food.add.cancel": "Cancel",
  "coach.food.add.thinking": "Working out where it fits…",
  // Le rattachement n'est JAMAIS silencieux — un rattachement muet est un
  // mensonge sur ce que Sophia vérifiera vraiment.
  "coach.food.add.treated_as": "Handled as {group}. Change it if that's wrong.",
  "coach.food.add.failed":
    "We could not work out where “{term}” fits. Pick a category yourself and it works the same.",
  "coach.food.custom_badge": "yours",
  "coach.food.remove": "Remove from my list",
  // Une écriture ratée SE VOIT. Une pastille qui ne colle pas sans un mot
  // d'explication est un accusé fantôme servi à l'envers: le coach reclique,
  // et croit que l'écran est lent.
  "coach.food.write_failed": "That change did not save. Nothing on this screen has been lost.",

  // ── Ce qu'un document du coach a dit, en attente de son arbitrage ────────
  // Le mot « proposal » est choisi contre « suggestion »: une proposition
  // attend une réponse, une suggestion s'ignore. Et rien de cette liste
  // n'existe côté méthode tant que le coach n'a pas cliqué — la copie ne doit
  // jamais laisser croire l'inverse.
  // ── Les listes de départ ────────────────────────────────────────────────
  // Un pack se nomme par un STYLE, jamais par un résultat: « pack perte de
  // gras » est une affirmation sur un corps, affichée sous le nom du coach.
  // La copie ci-dessous ne promet donc jamais un effet, seulement une façon de
  // manger — et elle dit que la liste est un début, pas un avis.
  // Pré-remplir depuis la méthode déjà écrite. La copie ne promet PAS un
  // résultat définitif — un remplissage est un point de départ, et le dire
  // évite qu'un coach publie sans relire.
  //
  // Elle ne mentionne pas non plus l'IA: le coach se fiche de savoir comment
  // c'est fait, et le dire l'inviterait à se méfier d'un geste qui, lui, est
  // borné au catalogue fermé. Ce qui compte est la SOURCE — sa méthode.
  "coach.food.fill.title": "Fill this from your method",
  "coach.food.fill.hint":
    "You already wrote how you feed your students. This reads it and ticks the foods that follow from it - nothing you have already set is touched, and you can change any of it.",
  "coach.food.fill.cta": "Fill from my method",
  // `no_doctrine` n'est pas une panne, c'est un état. On dit quoi faire, et on
  // nomme le repli qui est juste en dessous à l'écran.
  "coach.food.fill.no_doctrine":
    "Write your method first, or start from one of the lists below.",

  "coach.food.packs.title": "Start from a list, then make it yours",
  "coach.food.packs.hint":
    "Four ways of eating, not four opinions about your students. Take the one closest to how you already cook, then add, remove and change stances until it is your list.",
  "coach.food.packs.add": "Add these {count} foods",
  "coach.food.packs.footer":
    "These only add foods you build with. What you keep off the plate is a stronger statement than a starting list should make — that one stays yours to say.",
  "coach.food.packs.reopen": "Browse the starter lists",

  "coach.food.proposals.title": "From your document",
  "coach.food.proposals.hint":
    "{count} food(s) your document takes a position on. Nothing here is on your list yet.",
  "coach.food.proposals.accept": "That's mine",
  "coach.food.proposals.dismiss": "Not mine",
  // La phrase qui dit ce que « that's mine » ENGAGE, à l'endroit où on le
  // clique. Adopter une citation la rend intouchable par la réécriture IA:
  // c'est une bonne nouvelle, mais elle doit être dite avant, pas découverte.
  "coach.food.proposals.footer":
    "Adding one puts the quoted sentence in its “why”, as your own words — the AI rewrite will not touch it.",

  // Les trois postures. Écrites comme un coach les dit, pas comme la base les
  // stocke.
  "coach.food.stance.encouraged": "Build with it",
  "coach.food.stance.discouraged": "Go easy",
  "coach.food.stance.excluded": "Never",

  // La fréquence. Facultative, et l'écran le dit — un aliment coché sans règle
  // ni pourquoi est une ligne parfaitement valide.
  "coach.food.freq.title": "How often",
  "coach.food.freq.none": "No rule — you have not set one, and you do not have to.",
  "coach.food.freq.set": "Set a rule",
  "coach.food.freq.clear": "Remove the rule",
  "coach.food.freq.amount": "{direction} {amount} {unit} per {period}",
  "coach.food.freq.at_least": "at least",
  "coach.food.freq.at_most": "at most",
  "coach.food.freq.period.day": "day",
  "coach.food.freq.period.week": "week",
  "coach.food.freq.unit.portion.one": "serving",
  "coach.food.freq.unit.portion.many": "servings",
  // Vide, exprès: « at most 2 per day » se lit mieux que « at most 2 units per
  // day », et l'axe `count` existe précisément pour les aliments qu'on compte
  // à l'unité (œufs, fruits).
  "coach.food.freq.unit.count.one": "",
  "coach.food.freq.unit.count.many": "",
  "coach.food.freq.unit.g": "g",
  "coach.food.freq.unit.ml": "ml",
  "coach.food.freq.every_meal": "At every meal",
  "coach.food.freq.not_after": "Not after {time}",
  "coach.food.freq.at_slot": "At {slot}",
  "coach.food.freq.tpl.amount_per_period": "An amount per day or week",
  "coach.food.freq.tpl.every_meal": "At every meal",
  "coach.food.freq.tpl.not_after": "Not after a given time",
  "coach.food.freq.tpl.at_slot": "At a given meal",

  // ⚠️ LA PHRASE QUI EMPÊCHE UNE GARANTIE FAUSSE. L'analyse photo rend des
  // GROUPES: elle ne dira jamais « c'était de l'huile de coco » plutôt que
  // « de la matière grasse ajoutée ». Une règle par aliment gouverne donc ce
  // que Sophia construit et dit, jamais ce qu'elle vérifie dans une assiette.
  // Le coach doit le lire là où il écrit la règle, pas le découvrir après.
  "coach.food.freq.scope_note":
    "Rules on a single food guide what Sophia builds and says. What she checks on a plate is the category — a photo can tell oil from vegetables, not one oil from another.",

  // Le pourquoi. Pré-rempli, éditable, et jamais écrasé une fois touché.
  "coach.food.why.title": "Why it matters",
  "coach.food.why.placeholder": "In your words. Your students read this under the food.",
  "coach.food.why.seeded": "Suggested — edit it, or leave it and it becomes yours when you publish.",
  "coach.food.why.ai": "Written from your doctrine — edit it, or leave it as is.",
  "coach.food.why.rewrite": "Rewrite in my method",
  "coach.food.why.rewriting": "Writing…",
  // Une IA sans matière n'invente pas: elle le dit. « Ceinture armée sur
  // coffre vide » est un défaut déjà payé dans ce dépôt.
  "coach.food.why.no_doctrine":
    "Write your convictions on the Doctrine screen first — otherwise this would be our words, not yours.",
  "coach.food.why.failed": "We could not write it. Your text is untouched.",

  // Les conflits de dérivation. Un coach qui exclut un aliment dans une
  // catégorie où il en recommande un autre doit savoir que son exclusion ne
  // remonte PAS au niveau de la catégorie.
  "coach.food.conflict.title": "Split categories",
  "coach.food.conflict.line":
    "{group}: you build with {forList} and rule out {againstList}. Sophia checks nothing on the category as a whole — both still guide what she builds.",

  // ⚠️ « Timing rules » et « Your words » ont été RETIRÉS de cet écran le
  // 2026-08-05: il ne parle plus que d'aliments. Leurs libellés sont partis
  // avec eux. Les tables `coach_timing_rules` et `coach_terms` existent
  // toujours et le compilateur les lit encore — voir le commentaire de
  // `CoachProtocolPage`, qui explique pourquoi l'écran continue de les
  // CHARGER sans les montrer. Si un écran d'édition revient un jour, ces clés
  // sont à rétablir, pas à réinventer (git les garde).

  // Objectifs: divulgation progressive. Une entrée est globale par défaut.
  "coach.protocol.goal.all": "Everyone",
  "coach.protocol.goal.limit": "Limit to a goal",
  // ⚠️ `recomposition` s'appelait ICI « Muscle gain », alors que le générateur
  // implémente cet objectif comme « le tour de taille descend, le poids ne
  // descend pas » — l'inverse d'une prise de masse. Un coach qui restreignait
  // une règle à « Muscle gain » la restreignait donc, sans le savoir, aux
  // élèves à poids constant. La prise de masse a maintenant son propre jeton;
  // ce libellé-ci dit ce que l'objectif fait vraiment.
  "coach.protocol.goal.fat_loss": "Fat loss",
  "coach.protocol.goal.muscle_gain": "Muscle gain",
  "coach.protocol.goal.recomposition": "Same weight, different shape",
  "coach.protocol.goal.performance": "Performance",
  "coach.protocol.goal.health": "Health",
  "coach.protocol.goal.maintenance": "Maintenance",

  // Les axes: des QUESTIONS, jamais des réponses. KEEL ne prescrit pas.
  "coach.protocol.axes.title": "Methods like yours usually have something to say about:",
  "coach.protocol.axes.footer": "What do you think?",
  "coach.protocol.axis.protein_every_meal": "protein at every meal",
  "coach.protocol.axis.added_fats": "added fats",
  "coach.protocol.axis.liquid_calories": "liquid calories",
  "coach.protocol.axis.vegetable_volume": "vegetable volume",
  "coach.protocol.axis.carbs_around_training": "carbs around training",
  "coach.protocol.axis.hydration": "hydration",
  // L'axe propre à la prise de masse. Sans lui, `muscle_gain` aurait posé au
  // coach exactement les mêmes questions que `recomposition` — c'est-à-dire
  // aurait été un objectif décoratif de plus côté protocole.
  "coach.protocol.axis.eating_enough": "eating enough on low-appetite days",
  "coach.protocol.axis.ultra_processed": "ultra-processed food",

  // Brouillon et publication. Publier à l'aveugle sur une cohorte est le geste
  // le plus risqué de cet écran.
  "coach.protocol.draft.saved": "Draft saved",
  "coach.protocol.draft.saving": "Saving…",
  "coach.protocol.publish": "Publish to my students",
  "coach.protocol.publish.noop": "Nothing to publish — your draft matches what's live.",
  "coach.protocol.publish.impact":
    "{added} added, {removed} removed, {changed} changed — this changes what Sophia checks for {students} active students.",
  "coach.protocol.publish.confirm": "Publish",
  "coach.protocol.publish.cancel": "Keep editing",
  "coach.protocol.published_at": "Live since {date}",
  "coach.protocol.never_published": "Not published yet. Your students see nothing from this screen until you do.",
  "coach.protocol.load_error": "We could not read your method. Nothing has been changed.",

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

  // Coach — le message de cohorte (migration 20260806180500).
  //
  // LA COPIE DIT « tous tes élèves », JAMAIS « certains ». C'est ce qui
  // distingue ce canal de la note par élève, et c'est aussi ce qui le rend
  // compatible avec le modèle: un geste, N destinataires.
  "coach.broadcast.title": "A word to everyone",
  "coach.broadcast.body":
    "Once a week, you can write to all your students at once. It lands in their chat, signed with your name. They cannot reply to it - this is you speaking, not an inbox opening.",
  "coach.broadcast.placeholder": "This week, I want us to look at breakfasts.",
  "coach.broadcast.recipients": "{count} students will get it",
  "coach.broadcast.chars_left": "{count} characters left",
  "coach.broadcast.send": "Send to everyone",
  "coach.broadcast.sending": "Sending...",
  "coach.broadcast.sent": "On its way.",
  // Les deux fermetures, dites en clair. Un bouton grisé sans phrase est un
  // bouton dont le coach ne sait pas quoi faire.
  "coach.broadcast.blocked.no_recipients":
    "No active students yet. Invite someone first - there is nobody to write to.",
  "coach.broadcast.blocked.already_sent": "Already sent this week. You can write again on {date}.",
  // `skipped` n'est PAS caché: un coach qui croit que toute sa cohorte a reçu
  // est un coach qu'on trompe. Le silence n'est jamais arrondi vers le haut.
  "coach.broadcast.last_result": "Last one: {delivered} received it, {skipped} did not.",
  "coach.broadcast.last_pending": "Last one is still going out.",
  "coach.broadcast.skipped_hint":
    "Not received usually means they had already had two messages that day, or they muted notifications. It is not a failure on your side.",
  "coach.broadcast.error": "Not sent - {message}",

  // Coach — le siège de cet élève (migration 20260806160000).
  //
  // LA COPIE DIT « fin du mois » PARTOUT, et ce n'est pas une politesse: la
  // désactivation est PROGRAMMÉE, jamais immédiate, parce que l'élève a payé
  // son mois à son coach. Un libellé qui laisserait croire à une coupure
  // instantanée produirait exactement le reproche qu'on veut éviter — et c'est
  // le COACH qui le recevrait, pas nous.
  "coach.seat.title": "This student's seat",
  "coach.seat.active_body":
    "Billed while they are enrolled with you. If they stop paying you, turn the seat off — it stays on until the end of the month they have already paid for.",
  "coach.seat.deactivate_cta": "Turn off at end of month",
  // ⚠️ CETTE PHRASE A ÉTÉ CORRIGÉE APRÈS MESURE. Elle disait « then lose it »,
  // ce qui est faux: la bascule fait tomber `access_tier` et ferme la
  // génération (409 `no_coach`, plus de doctrine), mais `/app/*` reste
  // atteignable — la route garde sur `keel_role`, que la pause ne touche pas.
  // Un coach à qui on promet une coupure nette et dont l'ex-élève rouvre son
  // historique le lendemain a raison de ne plus nous croire sur le reste.
  "coach.seat.confirm_body":
    "Until the end of this month, nothing changes for them. After that they stop getting your method - no new week, no answers - but they keep what they have already built. You can turn the seat back on whenever you like.",
  "coach.seat.confirm_cta": "Turn off",
  "coach.seat.confirm_cancel": "Keep it on",
  "coach.seat.ending_body":
    "Turning off on {date}. They keep full access until then, and this is the last month you are billed for them.",
  "coach.seat.ending_undo_cta": "Keep the seat after all",
  "coach.seat.paused_body":
    "Off. They no longer get your method, and you are not billed for them. What they built is kept, and so is their history.",
  "coach.seat.reactivate_cta": "Turn the seat back on",
  "coach.seat.working": "Saving...",
  // L'intervalle de CE siège (migration 20260806190000). La copie dit ce que le
  // basculement fait ET ce qu'il ne fait pas: ne rien dire sur l'absence de
  // prorata laisserait un coach croire qu'il vient de facturer douze mois.
  "coach.seat.interval_label": "How this seat is billed",
  "coach.seat.interval_month": "Monthly - 7 €",
  "coach.seat.interval_year": "Yearly - 6 €",
  "coach.seat.interval_hint":
    "Pick yearly only when this student has paid you for the year. Switching takes effect on the next billing run - it does not charge or refund anything today.",
  // Le motif qui n'est pas une panne: l'élève a rejoint un autre coach pendant
  // la pause, et `one_live_coach_per_student` refuse le second lien vivant.
  // C'est le comportement voulu (20260727120000), donc ça se dit en clair.
  "coach.seat.error.already_coached":
    "This student now works with another coach, so their seat cannot be turned back on.",
  "coach.seat.error.generic": "Not saved - {message}",

  // Student progress: the week, then the trend
  "progress.week_title": "This week",
  "progress.trend_title": "Across the last {weeks} weeks",

  // Student app chrome
  "app.nav.today": "Today",
  "app.nav.meals": "Meal ideas",
  "app.nav.progress": "Progress",
  "app.nav.chat": "Chat",
  "app.nav.health": "Health",
  "app.nav.household": "Household",
  // `app.nav.cards` a été retirée avec l'onglet « Cards »: la page exigeait un
  // plan publié que le modèle 1:N ne produit jamais. Rien ne la lit plus.
  // Libellés courts: la barre d'onglets du téléphone donne 75 px par colonne,
  // et « My week's plan » y tiendrait sur trois lignes.
  "app.nav.plan.short": "Plan",
  "app.nav.meals.short": "Meals",

  // DE-WHATSAPP — la bulle. C'est LE canal, plus un simulateur: la
  // conversation quotidienne avec Sophia vit ici, dans l'app.
  "chat.title": "Sophia",
  "chat.subtitle": "Your day-to-day, with your coach's method behind it.",
  "chat.empty": "Nothing here yet. Say hello, or send a photo of your next meal.",
  "chat.input.placeholder": "Write to Sophia",
  "chat.send": "Send",
  "chat.thinking": "Sophia is writing…",
  "chat.history.more": "Load earlier messages",
  "chat.history.loading": "Loading…",
  "chat.error.send": "That didn't go through. Try again.",
  // Honnête plutôt que rassurant: on dit que la livraison instantanée est
  // tombée ET que rien n'est perdu, parce que les deux sont vrais.
  "chat.status.offline":
    "Live updates are off right now — messages still arrive, just more slowly.",

  // ── CE QUI DIT « ELLE A ÉCRIT LA PREMIÈRE » ────────────────────────────────
  // Trois messages partent sans que l'élève ait rien demandé: le tap du soir,
  // le point du dimanche, et la relance après un silence. Rendus sans marque,
  // ils se lisaient comme la réponse à quelque chose qu'il n'avait pas dit.
  // Le libellé est le MÊME pour les trois: il dit qui a ouvert la bouche, pas
  // pourquoi — la raison est dans le message lui-même.
  "chat.proactive.label": "Sophia reached out",
  "chat.unread.aria": "Unread messages from Sophia: {count}",

  // Les réglages de la bulle. `proactive_muted_at` existait, la politique de
  // livraison le respectait, et AUCUN écran ne pouvait le poser.
  "chat.settings.toggle": "Notifications",
  "chat.settings.checkins.label": "Check-ins from Sophia",
  // La seconde phrase n'est pas du confort: le mute ne coupe QUE le proactif
  // (`delivery_policy.ts`, garde 4 après la garde 2). Ne pas le dire ferait
  // croire qu'on se coupe de Sophia, ce qui est le contraire de la règle.
  "chat.settings.checkins.help":
    "The evening check-in, Sunday's review, and a note if you go quiet. She always answers when you write, whatever this says.",
  "chat.settings.notify.label": "Notify me on this device",
  "chat.settings.notify.help":
    "A system notification when she writes first and this tab isn't in front.",
  "chat.settings.notify.blocked":
    "Your browser is blocking notifications for this site — allow them there first.",
  "chat.settings.notify.unsupported":
    "This browser can't show notifications.",

  // Le point hebdomadaire, dans l'app. C'était un WhatsApp Flow: deux écrans
  // declares chez Meta. Il ne reste que ce qui comptait.
  "chat.photo.label": "Photo",
  "chat.photo.sending": "Sending a photo…",
  "chat.photo.error.type": "That file type isn't supported — send a JPEG, PNG or WebP.",
  "chat.photo.error.size": "That photo is too large. Try a smaller one.",
  // Une photo choisie ATTEND dans le composeur au lieu de partir seule: le mot
  // qui l'accompagne — « la moitié », « c'était hier » — se tape après l'avoir
  // choisie, jamais avant.
  "chat.photo.attached": "Photo ready to send",
  "chat.photo.remove": "Remove",
  "chat.photo.caption.placeholder": "Say something about it (optional)",

  "chat.weekly.title": "How the week actually went",
  "chat.weekly.subtitle": "Six quick reads. Two minutes, and nothing here is graded.",
  // R4 — LE SOUS-TITRE DU DIMANCHE POIDS-SEUL. Les six axes ne se demandent
  // qu'aux élèves dont un coach humain lit la synthèse; sans lecteur, l'écran se
  // réduit aux deux mesures. « Six quick reads » sous deux champs annoncerait
  // quatre questions qu'on a décidé de ne pas poser.
  "chat.weekly.subtitle.measures":
    "Two numbers, if you track them. Nothing here is graded.",
  "chat.weekly.optional": "Optional — only if you track them.",
  "chat.weekly.weight": "Weight (kg)",
  "chat.weekly.waist": "Waist (cm)",
  "chat.weekly.submit": "Send",
  "chat.weekly.cancel": "Not now",
  // Les deux vacuités, et elles ne disent pas la même chose. Avec les axes, un
  // score OU une mesure suffit — refuser un poids seul au nom d'une question non
  // remplie était le défaut que R4 a trouvé. Sans les axes, il ne reste que les
  // deux nombres, et le message ne doit pas citer « les six ».
  "chat.weekly.error.empty": "Give one of the six a score, or fill in a number.",
  "chat.weekly.error.empty.measures": "Fill in at least one of the two.",
  "chat.weekly.error.number": "{field} should be a number.",
  // Hors bornes = refusé et NOMMÉ, jamais ramené au bord: une valeur corrigee
  // en silence est une donnee fausse qui a l'air vraie.
  "chat.weekly.error.range": "{field} should be between {min} and {max}.",
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
  // L'invitation EXISTE et son lien marche; c'est l'envoi qui a été supprimé.
  // Le titre dit donc « created », pas « sent » — et surtout pas « failed ».
  "invite.created_not_sent": "Invitation created for {email} — but no email went out.",
  // « envoyez-le vous-même » A ÉTÉ RETIRÉ D'ICI, et c'était le même défaut que
  // celui qu'on vient de corriger: le navigateur du coach ne voit JAMAIS le
  // jeton (`coach-invite-student-v1` n'échoue le join_url qu'à un appelant
  // porteur du secret interne, et seul le sha256 est en base). Lui conseiller de
  // transmettre le lien lui-même, c'était lui demander l'impossible dans le
  // message censé le sortir de sa confusion.
  "invite.not_sent_delivery_disabled":
    "Email delivery is switched off in this environment (EMAIL_DELIVERY_ENABLED), so nothing was sent. The invitation is on file, but its link only ever existed inside that email — nobody can retrieve it now. Turn delivery on, then invite this address again: that sends a fresh link and cancels this one.",
  "invite.not_sent_ephemeral":
    "This looks like a throwaway test address, so no email was sent on purpose. The invitation itself is real.",
  // `already_sent`: la fenêtre de réutilisation de 60 s du serveur, c'est-à-dire
  // un double-clic. Rien n'est parti CETTE fois, et le dire évite que le coach
  // compte un envoi de plus qui n'a pas eu lieu.
  "invite.already_sent":
    "A link went out to {email} moments ago — nothing new was sent. Wait a minute if you want a fresh one.",
  // Les lignes courtes, affichées SUR la ligne d'invitation après un renvoi.
  "invite.resend_sent": "A fresh link is on its way.",
  "invite.resend_already": "A link went out moments ago — nothing new was sent.",
  "invite.resend_not_sent": "No email went out: delivery is switched off in this environment.",
  "invite.resend_ephemeral": "Test address — no email sent, on purpose.",
  "coach.home.invite_resend": "Resend",
  "coach.home.invite_resend_expired": "Send a new link",
  "coach.home.invite_resending": "Sending…",
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

  // ── /join — the student's front door ────────────────────────────────────
  //
  // The ONLY page a student meets before they have an account. They did not
  // come from the landing (that page sells to coaches): they came from their
  // coach's invitation email, and they already have a coach. So this is not
  // acquisition copy — it is the welcome of someone who has decided, and now
  // wants to know what they are walking into.
  //
  // `{coach}` is ALWAYS the mid-sentence form: the caller passes the coach's
  // first name, or "your coach" when the RPC returned null. No key below may
  // put `{coach}` at the start of a sentence, or the fallback reads as a
  // lowercase opener. `invite.accept_title` is the one sentence-initial use,
  // and it carries its own "Your coach" fallback.
  //
  // EVERY CLAIM HERE IS A COLUMN, OR AN ABSENCE OF ONE. The sees/never-sees
  // block was written against the live schema, not against intent — see
  // docs/nutrition-pivot/STUDENT-PAGE.md for the line-by-line proof. Adding a
  // line here without that proof is how this page starts lying.

  // "{coach} coaches through" stuttered on the null branch ("your coach coaches
  // through"), which is the branch a student with an unnamed coach reads. The
  // possessive works on both substitutions.
  "join.lead":
    "Sophia is {coach}'s assistant, and from today it is yours too. It carries their method — their convictions, their red lines, the calls they make when it gets complicated — and answers you in it, every day, in your chat here.",
  "join.lead_form_note":
    "The form is at the bottom. Read this first — it is what you are agreeing to.",

  // The route carries a token, so it must never be indexed. It also had no
  // <SEO> at all, which left a student's first screen wearing the legacy
  // French index.html title.
  "join.seo_title": "Your coach's invitation",
  "join.seo_description":
    "What Sophia is, what your days will look like, and exactly what your coach can and cannot see — before you create anything.",

  // Compact states. Only the strings this rewrite authored moved here; the
  // PREVIEW_REFUSALS / ACCEPT_REFUSALS maps stay inline, verbatim and
  // untouched, because transcribing a refusal is how a refusal gets weakened.
  "join.refused.title": "This invitation cannot be used",
  "join.refused.signin_cta": "Sign in to an existing account",
  "join.accepted.title": "You are in.",
  "join.accepted.title_with_coach": "You are in, with {coach}.",
  "join.accepted.body":
    "Your space is open. Sophia is waiting in your chat, and your week lives here too.",
  // Le bouton dit où il emmène. Il partageait sa clé avec « Go to my space »,
  // qui reste juste pour un élève déjà installé et faux pour celui qui vient
  // d'entrer: on l'emmène dans la conversation, pas dans un espace vide.
  "join.accepted.cta": "Start talking to Sophia",

  // What the days actually look like. The eyebrow is the SURFACE, because
  // which screen a thing happens on is the useful fact.
  "join.day.title": "What this actually looks like",
  "join.day.where_chat": "In your chat",
  "join.day.where_app": "In this app",
  "join.day.photo_title": "You send a photo of your plate, whenever you want.",
  "join.day.photo_body":
    "No app to open, no fields, no weighing. What comes back is an answer in {coach}'s method — what the plate does well, what it is short of, in their words rather than a nutrition label's.",
  "join.day.evening_title": "In the evening, one question and one tap.",
  "join.day.evening_body":
    "Good day, so-so, or rough. If it was not a good day, one more tap says whether it was energy, hunger or sleep. That is the whole thing, and you can leave it alone on the days you'd rather not.",
  "join.day.app_title": "Your week, and how it is going.",
  "join.day.app_body":
    "Sophia drafts a week from {coach}'s method and from what your life actually allows, and it is not yours until you say it is. Next to it: the days you logged, how the evenings went, what your plates looked like.",
  "join.day.tap_good": "All good",
  "join.day.tap_mixed": "So-so",
  "join.day.tap_hard": "Rough",

  // The dark block. The landing spends its one dark ground on the guarantee a
  // coach cares about; this page spends it on the one a student cares about.
  "join.grade.kicker": "The part that is different",
  "join.grade.title": "Nobody is grading you",
  "join.grade.lead":
    "Not as a policy someone could change their mind about — there is nothing here that counts, and nowhere to put a mark if we wanted to.",
  "join.grade.one_title": "No score, no streak, no percentage.",
  "join.grade.one_body":
    "Nothing is counting up. A day you miss breaks nothing, because there is no run to break and no total to spoil.",
  "join.grade.two_title": "A photo never becomes a number.",
  "join.grade.two_body":
    "No calories, no macros — not shown to you, not stored, not sent to your coach. We measured why before deciding: across 85 real analyses, a calorie estimate from a photo landed 26.6% under the truth on average, and the model's own margin of error contained the truth barely more than half the time.",
  "join.grade.three_title": "A day you don't log is not a day you failed.",
  "join.grade.three_body":
    "Silence is recorded as unknown, and unknown is never quietly turned into a miss. It is the one thing this product refuses to guess about you.",

  // The ledger. The strongest argument on the page, and the only one that
  // required reading the database to write.
  "join.seen.kicker": "Before you send a single photo",
  "join.seen.title": "What {coach} sees, and what they don't",
  "join.seen.lead":
    "You are about to start showing your food to software. You should have the actual list, not a reassurance. This is it.",
  "join.seen.sees_label": "What crosses over",
  "join.seen.never_label": "What stays with you",
  "join.seen.sees_1": "Your name, and the time zone you live in.",
  "join.seen.sees_2": "When you last wrote, and how many times in the past week.",
  // Deliberately not the weaker "that you logged something": the coach view
  // carries `recognized`, `food_group_ref` and `quantity`, so the food groups
  // read off a plate DO cross over. Understating here would be the same
  // dishonesty as overstating, one page before someone types a password.
  "join.seen.sees_3":
    "What you logged and when — including the food groups read off a plate, and whether a photo came with it.",
  "join.seen.sees_4":
    "How the week went: how many days were good, so-so or rough, and which of energy, hunger or sleep comes up most when it isn't good.",
  // The student CAN get this back — `coach_access_events` has a student SELECT
  // policy and account-export-v1 includes it — but there is no screen for it,
  // so the copy points at the export rather than implying a page.
  "join.seen.sees_5":
    "Every time they open your space. That gets written down, and it comes back to you if you ask for your data.",
  "join.seen.never_1":
    "What you write. Their window over your conversation has two columns: when you last wrote, and how often. There is no column holding the words.",
  "join.seen.never_2":
    "Your photos. They reach Sophia and stop there. What your coach's view carries is that a photo existed, never the photo.",
  "join.seen.never_3": "Anything you add in your own words alongside a meal.",
  // ⚠️ RÉÉCRITE LE 2026-08-12 (FF-059), ET LA CLAUSE RETIRÉE COMPTE.
  //
  // Elle disait « there is no such number anywhere in here, FOR ANYONE ». En
  // contexte — cette liste dit ce que le COACH ne voit pas — la phrase restait
  // vraie: FF-059 n'a rien ouvert côté coach. C'est « for anyone » qui est
  // devenu faux, puisqu'un élève majeur, hors plancher TCA, dont le coach ne
  // s'y oppose pas, et qui l'a lui-même allumé, voit l'énergie de ses plats.
  //
  // Une page de CONSENTEMENT est le dernier endroit où l'on garde une clause
  // trop large parce qu'elle sonne mieux: elle est lue juste avant qu'on tape
  // un mot de passe, et c'est très exactement la promesse sur laquelle
  // quelqu'un décide. Ce qui reste ici est ce qui est encore vrai, et les deux
  // moitiés le sont pour des raisons différentes — le coach ne voit rien
  // (aucune surface ne le lui montre), et une photo ne produit rien
  // (−26,6 % de biais, le chemin photo n'a pas bougé).
  "join.seen.never_4":
    "A calorie count or a macro figure. Your coach never sees one, and a photo never produces one.",
  "join.seen.exception_label": "One exception, and it is deliberate",
  "join.seen.exception_body":
    "If something you write suggests your relationship with food is turning against you, that sentence goes to {coach} the same day, marked urgent. Software should not be the only thing holding that.",

  // The limit, stated plainly and immediately before the form — the last thing
  // read before a password is typed. There is no one-to-one channel, and a
  // page that lets someone hope for one has mis-sold the product on day one.
  "join.limit.title": "There is no direct line to {coach}",
  "join.limit.body":
    "This is not a messaging app with your coach at the other end. They teach one method to everyone they coach, and Sophia is how it reaches you daily. What you share builds the weekly picture they read — it is not a message waiting for their reply.",

  "join.form.title": "Create your space",
  "join.form.lead": "You are connected to {coach} the moment you finish.",
  "join.form.name": "Your name",
  "join.form.email": "Email",
  "join.form.password": "Password",
  "join.form.password_hint": "At least 8 characters.",
  "join.form.submitting": "Creating your space…",
  "join.form.have_account": "Already have an account?",
  "join.form.have_account_cta": "Sign in and accept from there",
  "join.form.signed_in_as": "Signed in as {email}.",
  "join.form.signed_in_body":
    "Accepting opens exactly the window described above to {coach}, and nothing wider. They read; they can never act as you. You can end it from your account page whenever you want.",

  // No token. Not an error — the ordinary case of someone who typed the
  // address, or opened a link that lost its tail. There is one action, and it
  // is not on this page.
  "join.no_token.title": "You'll need your coach's link",
  "join.no_token.body":
    "There is no sign-up here. A space is only ever created from an invitation your coach sends you, with your address on it. Ask them for it, and open it on your phone.",
  "join.no_token.have_account": "Already have an account?",
  "join.no_token.have_account_cta": "Sign in",
  "join.no_token.what_is_this": "What you'd be joining",

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

  // ── /start — l'inscription libre ────────────────────────────────────────
  //
  // Le registre est différent de `join.*` et ce n'est pas un accident. Sur
  // /join, quelqu'un a déjà choisi cette personne: le texte peut parler de
  // « votre coach ». Ici personne ne l'attend, et la page doit être honnête sur
  // ce qu'elle offre — un programme générique — sinon un testeur rend un avis
  // sur un produit qui n'existe pas.
  // ── /start — LA PORTE D'INSCRIPTION DU FOYER ──────────────────────────────
  //
  // ⚠️ CETTE PAGE NE VEND PLUS RIEN, ET C'EST LE POINT (2026-08-12).
  // Elle vendait « le programme de découverte KEEL »: un nom INTERNE affleurant
  // dans une surface utilisateur, la boucle quotidienne d'un ÉLÈVE (photographier
  // un repas, trois appuis le soir), et une section dont le titre disait
  // « Ce programme ne te connaît pas » — le contraire exact de ce que le hall
  // promet trois clics plus tôt, un produit qui décrit chaque bouche, ses
  // objectifs et ses allergies. Quelqu'un qui clique « Commencer » depuis `/`
  // atterrissait donc sur la page qu'un élève invité par un coach retrouve.
  //
  // La vente a eu lieu sur le hall et sur la page segment. Ici on demande un
  // compte, et c'est tout. Douze clés sont parties (`start.day.*`,
  // `start.limit.*`, `start.form.title`); le mot « KEEL » n'apparaît nulle part.
  //
  // ⚠️ CE QUI RESTE EST UN CHEMIN DE SÉCURITÉ: le champ PAYS et son aide. Voir
  // le commentaire du champ plus bas, et l'en-tête de la migration
  // `20260811060000_household_signup_door.sql`.
  "start.seo_title": "Create your account",
  "start.seo_description":
    "Open a Sophia account for your household. Sophia composes the week around " +
    "the people who actually eat at your table.",
  "start.loading": "One moment…",

  // ⚠️ AUCUNE PROMESSE DE CALENDRIER ICI, ET C'EST MESURÉ. « Then » décrit la
  // FORME du produit (le compte, puis les bouches), pas l'écran suivant: un
  // inscrit de cette page atterrit sur `/app/chat`, et rien ne le conduit à
  // `/app/setup` dans cette session-là. Écrire « trois étapes vous attendent »
  // serait une promesse que le code ne tient pas. Voir l'en-tête de
  // `StartPage.tsx`, § « le trou mesuré ».
  "start.title": "Create your account.",
  "start.lead":
    "First the account. Then you describe who eats at your table and what each " +
    "of them needs — that is what Sophia composes the week around.",

  // fact: le prix est celui du hall (`home.hero.price`), au mot près.
  // ⚠️ AUCUNE DURÉE D'ESSAI, AUCUN BOUTON D'ACHAT: le tunnel de paiement du
  // foyer rend 500 faute de prix Stripe, et `free_until` gèle un foyer neuf à
  // J+31 sans chemin pour se dégeler. Le prix se dit; la date, non.
  "start.price":
    "12,99 € a month for the household, plus 2 € for each person who claims their " +
    "own access. Your own place is never counted.",
  // La porte de quelqu'un qui a DÉJÀ un coach est l'invitation qu'il a reçue,
  // pas celle-ci. Une ligne, parce que c'est utile et que c'est vrai.
  "start.coach_line":
    "A coach invited you? Your door is the link in their email, not this one.",

  // Le fronton de la fiche — même idiome que `/auth`: l'écran est un document
  // qui se nomme, et la fiche est l'endroit où l'on écrit.
  "start.sheet.form": "Sign-up",
  "start.sheet.repair": "Attachment",

  "start.form.name": "Your name",
  "start.form.email": "Email address",
  "start.form.password": "Password",
  "start.form.password_hint": "At least 8 characters.",
  "start.form.country": "Where you live",
  // Pourquoi on le demande, dit à la personne. Quelqu'un qui comprend l'usage
  // répond juste — et l'usage est réel: c'est ce champ qui décide quel numéro
  // d'urgence on donne si la conversation part là.
  "start.form.country_hint":
    "Used to give you the right emergency number if a conversation ever needs one.",
  // L'option initiale du sélecteur. Elle n'est pas une valeur: elle dit qu'on
  // n'a pas encore répondu, et le formulaire refuse de partir tant qu'elle est
  // choisie. Le champ naissait sur « United States », donc tout le monde
  // répondait « États-Unis » sans le savoir — sur le champ qui décide du numéro
  // d'urgence. Même libellé que la porte foyer, à dessein.
  "start.form.country_placeholder": "Choose a country",
  "start.form.legal_prefix": "I accept the",
  "start.form.legal_terms": "Terms",
  "start.form.legal_and": "and the",
  "start.form.legal_privacy": "Privacy Policy",
  // « Create my account » et plus « Start the program »: le bouton dit ce qui
  // se passe quand on le presse, et une action garde son nom sur tout le
  // parcours — c'est le même geste que la fiche FOYER de `/auth`.
  "start.form.cta": "Create my account",
  "start.form.submitting": "Creating your account…",
  "start.form.have_account": "Already have an account?",
  "start.have_account_cta": "Sign in",

  "start.repair.title": "One field left.",
  "start.repair.body":
    "Your account exists but it is not attached yet. Tell us where you live and " +
    "it will be, in one click.",
  "start.repair.cta": "Attach my account",

  // ⚠️ LE TEXTE DIT QUE LE COMPTE EST CRÉÉ ET DÉJÀ RATTACHÉ, et ce n'est pas une
  // formule rassurante: `handle_new_user()` rattache DANS la transaction du
  // signup, pas à l'ouverture de la boîte mail. Écrire « on terminera quand vous
  // reviendrez » serait faux, et laisserait croire qu'un mail non ouvert coûte
  // le rattachement.
  // ⚠️ « already attached » EST ÉPINGLÉ PAR UN TEST (`startCheckEmail.int.test.ts`,
  // qui exige `/already attached/i` ici et `/déjà rattaché/i` en face). Ce n'est
  // pas une formule: le rattachement a lieu dans la transaction du signup, et
  // une phrase qui promettrait « on terminera quand vous reviendrez » ferait
  // croire qu'un mail non ouvert le coûte.
  "start.check_email.title": "Confirm your email address.",
  "start.check_email.body":
    "Your account is created and already attached — the email only opens your " +
    "session. Open the confirmation we just sent, and it takes you straight to " +
    "the three steps that build your first plan.",

  // ⚠️ LE BOUTON OUVRE L'ENTONNOIR, ET LE TEXTE DIT ÇA. `StartPage` navigue en
  // dur vers `/app/setup` (et `emailRedirectTo` y pointe aussi); décrire ici
  // une autre destination ferait mentir l'écran d'après.
  //
  // La copie promet TROIS ÉTAPES ET UN PLAN, ce que l'écran suivant tient
  // vraiment. Elle disait « la conversation est là où ça commence » quand le
  // bouton ouvrait la bulle — qui ne pousse rien et n'a rien à montrer avant
  // qu'un plan existe.
  "start.joined.title": "Your account is ready.",
  "start.joined.body":
    "Three short steps and your first plan is composed. Nothing is prepared for you in the background — you answer, and it gets built.",
  "start.joined.cta": "Set up your kitchen",
  "start.existing.title": "You already have an account.",
  "start.existing.body":
    "That address is already registered. Sign in and we will pick up right here.",
  "start.existing.cta": "Sign in",

  "start.unavailable.title": "Sign-up is paused.",
  "start.unavailable.body":
    "We are not creating accounts right now, because a new one would have nothing " +
    "to run on. Try again a little later — and if a coach invited you, use the " +
    "link in their email instead.",

  // Les refus. Chacun dit ce qui s'est passé ET l'état du compte: « rien n'a
  // changé » est la moitié qui manque presque toujours, et c'est celle qui évite
  // qu'on réessaie en craignant d'avoir créé un compte à moitié.
  // ⚠️ LES CINQ NOMS DE CLÉ SONT UN CONTRAT. `joinRefusalMessageKey`
  // (`api/freeSignup.ts:125`) les rend depuis le `reason` de la base: les
  // renommer casse le mapping en silence, et le repli `generic` avalerait tout.
  "start.error.legal":
    "Accept the Terms and the Privacy Policy to continue.",
  "start.error.country_required": "Tell us where you live.",
  "start.error.already_coached":
    "Your account already follows a coach. You do not need to sign up here.",
  "start.error.caller_is_coach":
    "This is a coach account. Your space is the coach workspace, not a household one.",
  "start.error.unavailable":
    "Sign-up is not available right now. Nothing was created — try again later.",
  "start.error.generic": "That did not go through. Nothing changed — try again.",

  // Brand + public chrome (header/footer shared by the public pages)
  "brand.wordmark": "Sophia",
  "public.header.sign_in": "Sign in",
  // ⚠️ DEUX GESTES, UN PAR MONDE — et c'est un défaut fermé, pas une option.
  // `start_trial` est l'essai COACH (14 jours, 3 élèves, `/auth?role=coach`).
  // Il était offert sur TOUTES les pages de vente, y compris celles qui vendent
  // à un foyer: on proposait à un parent de créer un compte professionnel
  // payant. `start_household` est le geste du foyer et mène à `/start`.
  // Voir `PublicHeader.tsx`, constante `WORLDS`.
  "public.header.start_trial": "Start free trial",
  "public.header.start_household": "Get started",
  // Short form for the header; the footer keeps the fuller "Legal & privacy".
  "public.header.legal": "Legal",
  "public.locale.label": "Language",
  "public.locale.en": "EN",
  "public.locale.fr": "FR",
  "public.locale.switch_to_en": "Read this site in English",
  "public.locale.switch_to_fr": "Lire ce site en français",
  // Ce que voit quelqu'un de DÉJÀ connecté sur une page publique — typiquement
  // `/legal`, qui est dans la nav du shell. Lui proposer « Sign in » à cet
  // endroit était faux, et ne rien lui proposer en faisait un cul-de-sac.
  "public.header.back_to_app": "Back to my space",
  // ── DEUX MONDES, SIX PORTES ──────────────────────────────────────────────
  // Il y avait trois pages de vente, toutes professionnelles. Il y en a SIX,
  // réparties en deux mondes qui n'ont pas le même acheteur: un foyer qui
  // compose ses repas, un professionnel qui prête sa méthode. Le site a donc
  // deux halls (`/` et `/pro`) et trois portes sous chacun.
  //
  // Les libellés nomment L'ACHETEUR, pas le produit: c'est la seule chose qui
  // permet à quelqu'un de se reconnaître en un mot. D'où « Coaches » et non
  // « Home » pour la page qui vend à qui vend une formation.
  //
  // ⚠️ `public.nav.courses` A ÉTÉ RETIRÉE. Elle nommait `/` — qui vendait au
  // coach jusqu'au 2026-08-12 et vend désormais au foyer. Garder la clé aurait
  // laissé un libellé juste sur une destination fausse, ce qui ne casse aucun
  // test et trompe tous les visiteurs. Son remplaçant est `public.nav.coaches`,
  // qui pointe `/coaches`.
  //
  // Ces clés vivent dans `public.*` et non dans le namespace de chaque page:
  // c'est le seul texte que les six pages partagent VRAIMENT — six libellés de
  // nav qui divergeraient décriraient six sites.
  "public.nav.worlds_label": "Who Sophia is for",
  "public.nav.doors_label": "Pick your situation",
  "public.nav.world_household": "For your household",
  "public.nav.world_pro": "For professionals",
  "public.nav.mealprep": "Meal prep",
  "public.nav.couples": "Couples",
  "public.nav.families": "Families",
  "public.nav.coaches": "Coaches",
  "public.nav.gyms": "Gyms",
  "public.nav.communities": "Communities",
  "public.footer.tagline": "Your method, answering in your absence.",
  "public.footer.legal": "Legal & privacy",
  "public.footer.contact": "Contact",
  "public.footer.contact_email": "sophia@sophia-coach.ai",
  "public.footer.copyright": "Sophia — coaching software",

  // ── THE BACKEND IS UNREACHABLE ───────────────────────────────────────────
  // Shown when `resolveHomePath` could read NOTHING (see postLogin.ts branch
  // 4). Two things this copy must do, both learnt from the bug that created
  // it. First, name the side the fault is on: the observed failure looked
  // exactly like a broken account — an old product's shell with dead fields —
  // and the user's first thought was that they had lost something. Second,
  // give the one action that helps. No apology, no "oops", no support address
  // for a condition that clears itself: the retry IS the remedy.
  "server_unreachable.title": "We can't reach the server.",
  "server_unreachable.body":
    "Your account and your data are untouched — the app just can't read anything right now. This is usually a few seconds.",
  "server_unreachable.retry": "Try again",
  // Same fact on /auth, where the sign-in itself succeeded and only the
  // routing read failed: the user must not conclude their password was wrong.
  "server_unreachable.after_signin":
    "You're signed in, but we can't reach the server to open your space. Try again in a moment.",

  // App shell (connected chrome, coach + student)
  "shell.nav.students": "Students",
  "shell.nav.templates": "Templates",
  // « Recommended food » et pas « Method »: l'écran ne demande plus une
  // posture sur des groupes abstraits, il demande les ALIMENTS avec lesquels le
  // coach construit. Le mot qu'il emploie pour ça n'est pas « protocole ».
  "shell.nav.protocol": "Recommended food",
  "shell.nav.doctrine": "Doctrine",
  // La bibliothèque de recettes. Elle existait en base, en fonction edge et en
  // API cliente depuis le 04/08 — sans un seul écran pour l'atteindre. « UNE
  // ROUTE SANS LIEN EST UNE FONCTIONNALITÉ QUE PERSONNE N'A »; ici il n'y avait
  // même pas de route.
  "shell.nav.meals": "Meals",
  "shell.nav.weekly": "This week",
  // « My week » ne disait pas ce qu'on y fait. L'écran est celui où l'élève
  // CONSTRUIT sa semaine alimentaire; le nom doit porter le mot « plan ».
  "app.nav.plan": "My week's plan",
  "shell.nav.account": "Account",
  "shell.nav.legal": "Legal",
  "shell.nav.sign_out": "Sign out",
  // Le menu du téléphone. « Menu » et pas une icône hamburger seule: rien
  // d'autre dans ce produit n'est une icône, et un glyphe isolé au milieu de
  // libellés en toutes lettres se lit comme un bouton décoratif.
  "shell.nav.menu": "Menu",
  "shell.nav.menu_close": "Close",
  "shell.nav.primary": "Main sections",

  // ── /auth — LA PORTE UNIQUE DU PRODUIT ────────────────────────────────────
  //
  // Ces quatre-là existaient seules: le reste de l'écran était en dur, en
  // anglais, sur 1 297 lignes. Un visiteur qui lisait le site en français
  // cliquait « Se connecter » et tombait sur « Good to see you again. » — la
  // couture exacte que `pageFrontier.int.test.ts` existe pour interdire, sur la
  // seule page que TOUT LE MONDE traverse.
  //
  // ⚠️ LE NAMESPACE EST DÉSORMAIS TOUT-OU-RIEN. `/auth` est déclarée dans
  // `PUBLIC_PAGE_NAMESPACES`: une seule chaîne laissée en dur ici rouvre la
  // couture, et aucun type ne la voit — le compilateur garde les clés, pas les
  // littéraux qu'on oublie de passer par `t()`.
  //
  // Ce qui N'EST PAS traduit, et c'est délibéré: les messages d'erreur rendus
  // par Supabase Auth (`err.message`). Ils viennent du serveur, ils ne sont pas
  // nos chaînes, et les mapper un par un serait une table qui rouille à chaque
  // version du service. Les nôtres sont tous ci-dessous.

  // Le titre de l'onglet. `/auth` n'est pas dans le sitemap (porte
  // fonctionnelle, pas page de vente): l'écran se déclare `noindex`.
  "auth.seo.title": "Sign in",
  "auth.seo.title_coach": "Coach account",
  "auth.seo.description":
    "Sign in to Sophia, or open the account that gets you in — for a household, or for a coach and their students.",

  // ── LE FRONTON DE LA FICHE ────────────────────────────────────────────────
  // L'écran est UN document qui se reconfigure, pas quatre écrans. Son fronton
  // le nomme, et c'est la seule chose qui change entre ses quatre états.
  "auth.sheet.signin": "Sign in",
  "auth.sheet.coach": "Coach account",
  "auth.sheet.reset": "Password",
  "auth.sheet.confirm": "Email verification",

  // ── LES QUATRE ÉTATS, EN TÊTE ─────────────────────────────────────────────
  "auth.signin.title": "Welcome back.",
  "auth.signin.lede": "The same door for households and for coaches.",
  // ⚠️ « the method it follows », et PAS « the prescription tools ». La copie
  // d'avant vendait un outil de prescription 1:1, que ce produit n'a pas: le
  // coach écrit une doctrine et un programme pour sa COHORTE, et c'est l'élève
  // qui compose sa semaine avec (docs/keel/MODEL.md).
  "auth.coach.signup_title": "Create your coach account.",
  "auth.coach.signup_lede":
    "Your students get the app. You write the method it answers with. No phone number needed.",
  "auth.coach.signin_title": "Back to your workspace.",
  "auth.coach.signin_lede": "Sign in to the coach workspace.",
  "auth.reset.title": "Reset your password.",
  "auth.reset.lede":
    "Enter your address. We send a link that opens the page where you choose a new password.",

  // ── LES CHAMPS ────────────────────────────────────────────────────────────
  // Pas de `placeholder`: l'étiquette dit déjà ce qu'on attend, et un exemple
  // gris dans le champ disparaît à la première frappe — c'est-à-dire au moment
  // où on en aurait besoin.
  "auth.field.email": "Email address",
  "auth.field.password": "Password",
  "auth.field.password_show": "Show password",
  "auth.field.password_hide": "Hide password",
  "auth.field.name": "Your name",
  "auth.field.name_hint": "How your students see you.",
  "auth.field.country": "Country",
  "auth.field.country_placeholder": "Choose a country",
  // Le pourquoi, pas seulement le quoi: quelqu'un qui comprend à quoi sert le
  // champ répond juste. `profiles.country` décide de la hotline servie à ses
  // élèves (migration 20260804180000).
  "auth.field.country_hint":
    "Where you practise. It decides which crisis resources your students are given, and it is never guessed from your language.",
  "auth.field.forgot": "Forgotten your password?",

  // ── LES GESTES ────────────────────────────────────────────────────────────
  "auth.action.signin": "Sign in",
  "auth.action.coach_signup": "Create my coach account",
  "auth.action.working": "Working…",
  "auth.action.send_link": "Send the link",
  "auth.action.sending": "Sending…",
  "auth.action.back_to_signin": "Back to sign-in",

  "auth.legal.prefix": "I accept the",
  "auth.legal.terms": "Terms",
  "auth.legal.and": "and the",
  "auth.legal.privacy": "Privacy Policy",

  // ── LES PRÉFÉRENCES D'INSCRIPTION ─────────────────────────────────────────
  "auth.prefs.title": "Preferences",
  "auth.prefs.language": "Language",
  "auth.prefs.language_value": "English",
  "auth.prefs.language_hint": "The coach workspace ships in English.",
  "auth.prefs.timezone": "Time zone",
  "auth.prefs.tz_device": "{timezone} (device)",
  "auth.prefs.tz_profile": "{timezone} (profile)",
  "auth.prefs.roaming": "Roaming",
  "auth.prefs.roaming_hint": "Follow the device time zone automatically.",
  "auth.prefs.roaming_toggle": "Follow the device time zone",

  // ── L'ÉTAT « VÉRIFIEZ VOS MAILS » ─────────────────────────────────────────
  "auth.confirm.title": "Check your inbox.",
  "auth.confirm.body":
    "A confirmation link is on its way to {email}. Click it, then come back here — this page updates on its own.",
  "auth.confirm.spam": "Nothing there? The spam folder is the next place to look.",
  "auth.confirm.waiting": "Waiting for the verification…",
  "auth.confirm.checking": "Checking…",
  "auth.confirm.check_cta": "I clicked the link",
  "auth.confirm.resend": "Resend the confirmation email",
  "auth.confirm.resend_wait": "Resend in {seconds}s",
  "auth.confirm.change_email": "Use a different address",
  "auth.confirm.not_verified":
    "Not verified yet. Click the link in your email, then come back here.",
  "auth.confirm.check_failed": "The check could not run. Try again.",
  "auth.confirm.verified_title": "Email verified.",
  "auth.confirm.verified_body": "Setting up your space…",
  "auth.confirm.retry": "Try again",

  // ── LES DEUX DESTINATIONS ─────────────────────────────────────────────────
  // Le site a deux mondes qui n'ont ni le même acheteur ni la même inscription.
  // `?w=household` / `?w=pro` décide lequel est MIS EN AVANT ici; sans le
  // paramètre, les deux sont proposés à égalité.
  "auth.doors.divider": "No account yet?",
  "auth.doors.household.label": "Household",
  // ⚠️ PAS « sans coach ». L'absence d'un coach ne définit pas le produit du
  // foyer — elle le décrit comme une version amputée de l'autre monde, ce que
  // `/start` disait aussi (« Try it without a coach first ») et qui vient d'en
  // être retiré. Ce que le foyer achète est POSITIF: la semaine composée autour
  // des gens qui mangent vraiment à cette table.
  "auth.doors.household.body":
    "Open your account and compose your week around who eats at your table.",
  "auth.doors.household.cta": "Create a free account",
  "auth.doors.household.prompt": "Cooking for your household?",
  "auth.doors.pro.label": "Professional",
  "auth.doors.pro.body":
    "Write your method once. Your students compose their week inside it.",
  "auth.doors.coach_divider_signup": "Already have a coach account?",
  "auth.doors.coach_divider_signin": "No coach account yet?",

  // ── LES REFUS, ET ILS DISENT TOUS QUOI FAIRE ENSUITE ──────────────────────
  "auth.error.legal": "Accept the Terms and the Privacy Policy to continue.",
  "auth.error.country": "Choose the country where you practise.",
  "auth.error.student_signup_moved":
    "Student sign-up has moved. Open /start to create your account, or use the link your coach emailed you.",
  "auth.error.prelaunch_signup":
    "Sign-up is closed (pre-launch). Sign in with the master_admin account.",
  "auth.error.prelaunch_forbidden":
    "Access is restricted (pre-launch). Only the master_admin account can sign in.",
  "auth.error.coach_profile":
    "Your account exists, but the coach profile could not be created. Sign in again to retry.",
  // Le sign-in a RÉUSSI et seule la lecture de rôle a échoué: sans cette
  // phrase, la seule lecture possible est « mon mot de passe est faux », et on
  // réinitialise un compte qui va très bien.
  "auth.error.server_unreachable":
    "You're signed in, but we can't reach the server to open your space. Try again in a moment.",
  "auth.error.generic": "Something went wrong.",
  "auth.error.reset_failed": "The email could not be sent.",
  // Diagnostic d'exploitation, pas de visiteur: Supabase Auth rend une erreur
  // générique quand le SMTP est mal configuré, et sans ces deux endroits à
  // regarder personne ne sait par où commencer.
  // ⚠️ Aucune flèche « → »: elle n'a de glyphe dans AUCUNE des deux familles
  // du site (CHARTE §0 ④), et tomberait en repli système au milieu du mot.
  "auth.error.reset_smtp":
    "The password reset email could not be sent.\n\nSupabase Dashboard / Auth / SMTP: custom SMTP enabled but incomplete, wrong credentials, or an unverified sender domain.\nAuth / URL Configuration: the redirect allowlist must contain {origin}/reset-password.\n\nDetail: {detail}",
  "auth.reset.sent": "If an account exists for {email}, a reset email is on its way.",
  "auth.reset.sent_local": "Local stack: open http://127.0.0.1:54324 to read it.",

  "auth.prelaunch.badge": "Restricted access (pre-launch) · master_admin only",

  // ── LES PAYS ──────────────────────────────────────────────────────────────
  // Une liste de CONVENANCE, jamais de validation: la base valide la FORME
  // (`profiles_country_iso3166_check`), exprès — une liste fermée refuserait un
  // pays légitime le jour où quelqu'un s'y inscrit.
  // Traduits, contrairement à `api/countries.ts`: c'est le seul champ de cet
  // écran dont la valeur est un mot de langue, et « United States » au milieu
  // d'un formulaire français est une couture de plus.
  "auth.country.us": "United States",
  "auth.country.gb": "United Kingdom",
  "auth.country.fr": "France",
  "auth.country.ca": "Canada",
  "auth.country.au": "Australia",
  "auth.country.ie": "Ireland",
  "auth.country.nz": "New Zealand",
  "auth.country.be": "Belgium",
  "auth.country.ch": "Switzerland",
  "auth.country.de": "Germany",
  "auth.country.es": "Spain",
  "auth.country.it": "Italy",
  "auth.country.nl": "Netherlands",
  "auth.country.pt": "Portugal",
  "auth.country.se": "Sweden",
  "auth.country.sg": "Singapore",
  "auth.country.ae": "United Arab Emirates",
  "auth.country.za": "South Africa",

  // Auth page cross-links (the two doors reference each other)
  "auth.coach_link.prompt": "Are you a coach?",
  "auth.coach_link.cta": "Create a coach account",
  "auth.coach_link.back_prompt": "Not a coach?",
  "auth.coach_link.back_cta": "Go to the standard sign-in",

  // Landing — hero
  //
  // ── POURQUOI CETTE PAGE VEND UN REVENU ET PLUS UNE FATIGUE ÉVITÉE ────────
  // La version précédente ouvrait sur « You can't answer two hundred students »:
  // un argument de CHARGE DE TRAVAIL, donc de COÛT. Trois conséquences, toutes
  // mesurables sur la page:
  //
  //   1. un argument de coût se compare à un coût. Le prospect nous rangeait à
  //      côté de TrueCoach (49 $/mois tout compris à 20 clients) alors qu'on
  //      sort à 289 $, et la comparaison était perdue avant d'être ouverte;
  //   2. un argument de coût plafonne au temps du coach. Un argument de revenu
  //      ne plafonne pas;
  //   3. seule la promesse de revenu est recopiable sur la page de vente DU
  //      COACH — c'est le seul vecteur de distribution que ce produit possède.
  //
  // ⚠️ LA LIMITE QU'AUCUNE LIGNE NE DOIT FRANCHIR: il n'existe AUCUN SKU élève
  // dans `stripe-create-checkout-session` (seulement `plan='keel_coach'` et les
  // tiers hérités du B2C). On ne facture donc PAS l'élève, et rien ici ne doit
  // le laisser croire. Ce qu'on promet est exact et suffisant: le coach obtient
  // quelque chose QUI VAUT un abonnement. Il l'encaisse avec ses propres outils.
  //
  // La cible est double et le titre les couvre toutes les deux: celui qui vend
  // une formation one-shot (Sophia lui crée la ligne récurrente), et le coach
  // 1:1 avec une liste d'attente (Sophia lui crée le palier SOUS son 1:1).
  // ── HOME — le hall du foyer (`/`) ───────────────────────────────────────
  // Un hall porte la promesse commune, la preuve la plus forte, et les trois
  // portes. L'argument complet d'un acheteur appartient à SA page.
  "home.seo_title": "Sophia — one pot, and everyone's share written down",
  "home.seo_description":
    "Sophia composes a household's week in cooking sessions: the same dish for everyone, and for each mouth the serving that matches what they are after. One person's allergy governs the whole pot.",
  "home.hero.kicker": "For whoever cooks for a home",
  "home.hero.title": "One pot. Everyone's share, written down.",
  "home.hero.lede":
    "Sophia composes your week in cooking sessions, not in isolated dishes. One dish goes on the table, and each person gets the serving instruction that goes with it.",
  "home.hero.cta": "Get started",
  // ⚠️ LE PRIX SE DIT, LA DURÉE NE SE DIT PAS. Le tunnel foyer rend 500 faute
  // de prix Stripe, et `free_until` gèle un foyer neuf à J+31 sans chemin pour
  // se dégeler: « 30 jours puis vous décidez » promettrait une décision
  // impossible. Voir `scratchpad/site/AUDIT-SITE.md` §8 n°1.
  "home.hero.price":
    "12,99 € a month for the household, plus 2 € for each person who claims their own access. Your own place is never counted, and children count as mouths, not as accounts.",
  "home.fig.alt":
    "One pot and two plates: the same dish, described differently for two people.",
  "home.fig.pot": "the same dish",
  "home.fig.one": "FOR ONE",
  "home.fig.one_2": "more starch",
  "home.fig.two": "FOR THE OTHER",
  "home.fig.two_2": "more vegetables",
  // La légende dit POURQUOI c'est en mots: le produit calcule des grammes que
  // rien ne rend à l'écran (FF-043 §11 n°1), donc en écrire serait montrer un
  // écran qu'on n'a pas.
  "home.fig.caption":
    "The dish is the same. What changes is the serving that goes with it, described in words — which is how the product says it.",
  "home.proof.kicker": "What it refuses to do",
  "home.proof.title": "One person's allergy governs the whole pot.",
  "home.proof.body":
    "The constraints of every mouth in the household are gathered before the plan exists. If that set cannot be read, nothing is composed: Sophia stops and names the reason. A plan that is missing gets asked for again; a plan that guessed gets eaten.",
  "home.doors.kicker": "Where you are",
  "home.doors.title": "Three ways a home eats. Yours is one of them.",
  "home.door.mealprep.label": "Cooking for one",
  "home.door.mealprep.title": "You already batch cook",
  "home.door.mealprep.body":
    "You cook once for several days, and you have a direction — losing or gaining. The week arrives in cooking sessions, and the shopping comes in waves that follow what stays fresh.",
  "home.door.mealprep.cta": "See how it works for one",
  "home.door.couples.label": "Two of you",
  "home.door.couples.title": "Two goals, one kitchen",
  "home.door.couples.body":
    "Two directions that pull apart usually mean two pans, and two pans mean neither of you keeps it up. One dish, two servings described for two goals.",
  "home.door.couples.cta": "See how it works for two",
  "home.door.families.label": "Three or more",
  "home.door.families.title": "Different needs at one table",
  "home.door.families.body":
    "Children are in the plan without an account and without a screen. Allergies are gathered across everyone, and a minor is never given a nutritional target.",
  "home.door.families.cta": "See how it works for a family",
  "home.close.title": "Start with one person. Add the others when you want to.",
  "home.close.body":
    "The product gives its whole value to a single person on the first day — sessions, servings that match your direction, shopping in waves. The rest of the household is something you add, never a condition for it to be good.",
  "home.close.cta": "Get started",

  // ── PRO — le hall des professionnels (`/pro`) ───────────────────────────
  "pro.seo_title": "Sophia for professionals — your method, answering every day",
  "pro.seo_description":
    "You record how you feed people once; Sophia answers your students in your method and your words. What it writes in their chat is checked against your red lines before it is sent, with no model in that loop. 7 € per student per month, no platform fee.",
  "pro.hero.kicker": "For people who sell a method, not hours",
  "pro.hero.title": "Your method, written once. Read back before it is sent.",
  // ⚠️ FORMULATION B8b, ET PAS CELLE DES ANCIENNES PAGES. « La doctrine entre
  // à chaque message » est faux (un seul appelant, le composeur —
  // routers.ts:540-547), et « chaque message sortant est vérifié » aussi
  // (quatre surfaces scannées, quatre non scannées). Ceci est vrai.
  "pro.hero.lede":
    "Sophia learns how you feed people — your convictions, your red lines, the calls you make on the hard cases — and answers your students in your place. Your method goes into their chat, into every week and into every meal it drafts; and what it writes in that chat is read back against your red lines before it goes out, by code.",
  "pro.hero.cta": "Start the 14-day trial",
  "pro.hero.note":
    "14 days, up to 3 students, then it stops on its own. After that, 7 € per student per month — the seat is the only line, there is no platform fee.",
  "pro.fig.alt":
    "Your method and your red lines go in; what is about to be sent is checked, and what crosses a line is held and replaced.",
  "pro.fig.method": "YOUR METHOD",
  "pro.fig.method_2": "written once",
  "pro.fig.lines": "YOUR RED LINES",
  "pro.fig.lines_2": "and what you do instead",
  "pro.fig.check": "checked",
  "pro.fig.sent": "SENT",
  "pro.fig.held": "HELD",
  "pro.fig.held_2": "in your words",
  "pro.fig.caption":
    "The top half is an instruction, and an instruction is followed almost always. The bottom half is not one: it is a check that runs on what is about to leave, with no model in that loop. Two mechanisms that fail differently.",
  "pro.proof.kicker": "What your student receives",
  "pro.proof.title": "Never a refusal. Never \u201cask your coach\u201d.",
  "pro.proof.body":
    "Every red line carries what you do instead, in your own words, and that is what goes out — signed with your name. Your student never meets a wall, which matters more here than it would anywhere else: there is no one-to-one channel back to you, and that absence is the product.",
  "pro.doors.kicker": "What you run",
  "pro.doors.title": "Three ways a practice sells a method.",
  "pro.door.coaches.label": "A course",
  "pro.door.coaches.title": "You sell a course",
  "pro.door.coaches.body":
    "Your course ends and your coaching does not. A method you could only sell once becomes something worth paying for every month.",
  "pro.door.coaches.cta": "See it for a course",
  "pro.door.gyms.label": "A gym",
  "pro.door.gyms.title": "You run an independent gym",
  "pro.door.gyms.body":
    "You coach three hours a week; twenty-one meals happen without you. That is where the plateau arrives, and the member who sees nothing change does not come and tell you — they leave.",
  "pro.door.gyms.cta": "See it for a gym",
  "pro.door.communities.label": "A community",
  "pro.door.communities.title": "You run a paid community",
  "pro.door.communities.body":
    "A thread has no recipient — that is architecture, not workload. Sophia is the individual layer that sits underneath what you have already built.",
  "pro.door.communities.cta": "See it for a community",
  // B31 — la meilleure ligne des trois anciennes pages, reprise ici.
  "pro.close.title":
    "We have no retention figure to sell you, and we are not going to invent one.",
  "pro.close.body":
    "Nothing in this product measures churn against a control, so any number printed here would be decoration. What a student who stays is worth is your figure, not ours.",
  "pro.close.cta": "Start the 14-day trial",

  // ── LES SIX PAGES DE VENTE ───────────────────────────────────────────
  // Un namespace par page, JAMAIS de clé partagée: même texte sur deux
  // pages ⇒ deux clés. Une clé commune imposerait en silence à une page
  // l'ajustement fait pour une autre.
  //
  // ⚠️ LE BLOC `landing.*` A ÉTÉ RETIRÉ D'ICI. Il portait la copie de `/`
  // quand `/` vendait au coach. `/` vend désormais au foyer, et la page
  // coach vit sous `/coaches` avec le namespace `coaches.*`, réécrit.
  // Garder les deux aurait laissé 117 clés que plus aucun écran ne rend —
  // du travail de traduction payé pour rien, qui survit aux suppressions
  // sans bruit (c'est exactement ce que `parity.int.test.ts` interdit).

  // ── MEALPREP ──────────────────────────────────────────────────────────
  "mealprep.seo_title": "Meal prep for one — a week built in cooking sessions",
  "mealprep.seo_description":
    "You already cook once and eat for days. Sophia builds your week in that unit: cooking sessions, shopping that arrives in waves, and three moves for the night that falls through. €12.99 a month, whole for one person.",

  // ── Hero ────────────────────────────────────────────────────────────────
  "mealprep.hero.kicker": "For one person, whole from day one",
  "mealprep.hero.title": "Cooking is not the hard part. Deciding is.",
  "mealprep.hero.lede":
    "You already cook once and eat for days. Sophia builds your week in that same unit — the cooking session — around the goal you set, and lets the shopping follow.",
  "mealprep.cta": "Get started",
  "mealprep.hero.price_note":
    "€12.99 a month. On your own, that is the whole product, not a smaller one.",

  "mealprep.fig.session.title": "One cooking session, several ready meals",
  "mealprep.fig.session.desc":
    "A pot seen from above. A comb of lines links it to identical containers — the same drawing reused, because it is the same cooking — covering the meals of the days that follow.",
  "mealprep.fig.session.label": "ONE COOKING SESSION",
  "mealprep.fig.session.pot": "one session",
  "mealprep.fig.session.covers": "WHAT IT COVERS",

  // ── Ce que ce n'est pas (bloc sombre) ───────────────────────────────────
  "mealprep.quiet.kicker": "What this is not",
  "mealprep.quiet.title": "No score. No streak.",
  "mealprep.quiet.numbers_label": "The numbers",
  "mealprep.quiet.numbers_value":
    "Off by default — which is not the same as absent. Turning them on is a deliberate choice, and a chain of guards decides whether it is possible at all.",
  "mealprep.quiet.ranking_label": "The ranking",
  "mealprep.quiet.ranking_value":
    "There is none. Nothing grades your week, and no coloured band tells you how it went.",
  "mealprep.quiet.left_label": "What is left",
  "mealprep.quiet.left_value":
    "What you cook, when you cook it, and the shopping that goes with it.",

  // ── Les courses ─────────────────────────────────────────────────────────
  "mealprep.waves.kicker": "The shopping",
  "mealprep.waves.title": "Shopping arrives in waves, not in one trolley.",
  "mealprep.waves.body":
    "A wave never asks fresh food to sit more than three days in the fridge. Bought too early is thrown away later: when that window closes, the next wave leaves, and the end of your week is bought at the end of your week.",
  "mealprep.waves.reserve":
    "And when a week fits in a single wave, you see one. The product does not invent a second to look busy.",

  "mealprep.fig.waves.title": "Shopping split into waves along the week",
  "mealprep.fig.waves.desc":
    "Two baskets — the same drawing, twice — sit above the days they cover. The first spans three days, the length fresh food is allowed to wait. The second runs on, open-ended.",
  "mealprep.fig.waves.label": "SHOPPING IN WAVES",
  "mealprep.fig.waves.first": "FIRST WAVE",
  "mealprep.fig.waves.next": "NEXT WAVE",
  "mealprep.fig.waves.fresh": "THREE DAYS",
  "mealprep.fig.waves.week": "THE WEEK",

  // ── L'imprévu ───────────────────────────────────────────────────────────
  "mealprep.moves.kicker": "When a night falls through",
  "mealprep.moves.title": "A missed evening does not rebuild the week.",
  "mealprep.moves.body":
    "Three moves, offered as buttons in the chat: shift a dish, shift the whole session, or say you are not cooking tonight. The week takes the hit and realigns around it.",
  "mealprep.moves.note":
    "No dish is picked for you, and the week is not rewritten behind your back.",

  "mealprep.fig.moves.title": "The three moves a week accepts",
  "mealprep.fig.moves.desc":
    "Three cards, one per move. In the first, a dish leaves its evening. In the second, the session around it leaves with it. In the third, the evening stays empty and nothing is cooked.",
  "mealprep.fig.moves.label": "THREE MOVES",
  "mealprep.fig.moves.dish": "SHIFT A DISH",
  "mealprep.fig.moves.session": "SHIFT THE SESSION",
  "mealprep.fig.moves.tonight": "NOT TONIGHT",

  // ── Le prix et l'entrée ─────────────────────────────────────────────────
  "mealprep.start.kicker": "To start",
  "mealprep.start.title": "€12.99 a month. On your own, you get all of it.",
  "mealprep.start.body":
    "You are buying a household of one, and a household of one is a complete household. Other mouths can join it later; that is not what you are buying today.",
  "mealprep.start.price": "€12.99",
  "mealprep.start.period": "a month",
  "mealprep.start.price_label": "One household. At one person, it is already whole.",
  "mealprep.start.asks_label": "What you are asked for",
  "mealprep.start.ask_name": "First name",
  "mealprep.start.ask_birthdate": "Date of birth",
  "mealprep.start.ask_goal": "Goal",
  "mealprep.start.ask_allergies": "Allergies",
  "mealprep.start.note": "Then Sophia composes the first week, in sessions.",

  // ── COUPLES ───────────────────────────────────────────────────────────
  // ── SEO ────────────────────────────────────────────────────────────────────
  "couples.seo_title": "Two goals, one pot",
  "couples.seo_description":
    "One of you wants to gain, the other wants to lose. Sophia builds your household's week as cooking sessions: one dish, and for each of you the serving that goes with your goal, written in words. €12.99 a month for the household.",

  // ── HERO ───────────────────────────────────────────────────────────────────
  "couples.hero.kicker": "Couples",
  "couples.hero.title": "Two goals. One pot.",
  "couples.hero.lede":
    "You are not aiming at the same thing, and you still eat at the same table. Sophia builds your household's week as cooking sessions: one dish, and for each of you the serving that goes with your goal — in words, never in grams, and never in a second pan.",
  "couples.hero.cta": "Start",
  "couples.hero.price":
    "€12.99 a month for the household, €2 a month for a second profile. The account you open is never counted on top.",
  "couples.hero.reserve":
    "Sign-up opens once the house coach's programme is published.",
  "couples.hero.caption":
    "One example. Six goals each send the serving in their own direction.",

  // ── LA BANDE DE FAITS, sous le hero ────────────────────────────────────────
  "couples.facts.unit.label": "The unit",
  "couples.facts.unit.title": "The cooking session",
  "couples.facts.unit.body":
    "You are not planning seven dinners. You are planning the times the kitchen is on, and what they cover.",

  "couples.facts.direction.label": "The direction",
  "couples.facts.direction.title": "Six goals, six directions",
  "couples.facts.direction.body":
    "Your goal decides which way your serving goes. What the two of you share is cooked once; the rest is a serving instruction.",

  "couples.facts.words.label": "The words",
  "couples.facts.words.title": "A sentence, not a number",
  "couples.facts.words.body":
    "Each mouth's serving line shows on the household screen. It is written in words; no screen hands you a gram.",

  // ── SECTION 2 — l'autre personne ───────────────────────────────────────────
  "couples.other.kicker": "The second profile",
  "couples.other.title": "Only one of you has to set this up.",
  "couples.other.lede":
    "The other one is in the plan with or without an account: their serving is computed from their own goal, next to yours. For their own way in — their own goal, editable whenever, their own serving line — a claimed profile is €2 a month. The account you open is never counted on top.",
  "couples.other.asked":
    "What we ask in order to add them: a first name, a date of birth, a goal, and any allergies.",

  // ── SECTION 3 — la semaine encaisse ────────────────────────────────────────
  "couples.week.kicker": "When it goes sideways",
  "couples.week.title": "The week takes the hit without being rewritten.",
  "couples.week.lede":
    "One of you gets home late and the plan does not collapse. In the chat you shift a dish, shift the whole session, say nobody is cooking tonight — or say nothing needs to change. Those are the four answers, and there is no fifth: nothing picks a new dish in your place.",

  // ── SECTION 4 — le bloc sombre ─────────────────────────────────────────────
  "couples.dark.kicker": "What we don't do",
  "couples.dark.say":
    "There is no weight curve here, and no scale to open in the morning.",
  "couples.dark.note":
    "Numbers are off by default, and four locks decide whether they can be switched on. Two people having dinner are not a dashboard.",

  // ── SECTION 5 — le prix et le geste ────────────────────────────────────────
  "couples.price.kicker": "The price",
  "couples.price.title": "One household, one price.",
  "couples.price.amount": "€12.99",
  "couples.price.period": "per month, for the household",
  "couples.price.label":
    "A second claimed profile is €2 a month. Up to eight mouths. The account you open is never counted.",
  "couples.price.note":
    "At sign-up you say how many of you are at the table, and the path for two is the one you land on.",

  // ── FIGURE A — une casserole, deux parts ───────────────────────────────────
  "couples.fig.plates.title": "One pot, two servings",
  "couples.fig.plates.desc":
    "A pot seen from above. Two identical plates receive the same dish. What differs between them is not drawn: it is the serving instruction, written in words beside each plate.",
  "couples.fig.plates.eyebrow": "ONE COOKING SESSION, TWO SERVINGS",
  "couples.fig.plates.pot": "the same dish, cooked once",
  "couples.fig.plates.goal_a": "GAINING MUSCLE",
  "couples.fig.plates.note_a1": "more starches",
  "couples.fig.plates.note_a2": "in this serving",
  "couples.fig.plates.goal_b": "LOSING FAT",
  "couples.fig.plates.note_b1": "more vegetables",
  "couples.fig.plates.note_b2": "in this serving",

  // ── FIGURE B — qui est dans le plan ────────────────────────────────────────
  "couples.fig.who.title": "Who is in the plan",
  "couples.fig.who.desc":
    "The same household, two ways of being in it. Without an account, the other one is still a mouth of the household and still gets a serving. A claimed profile adds their own way in, for two euros a month.",
  "couples.fig.who.eyebrow": "WHO IS IN THE PLAN",
  "couples.fig.who.col_a": "WITHOUT AN ACCOUNT",
  "couples.fig.who.a1": "a mouth of the household",
  "couples.fig.who.a2": "their serving is written",
  "couples.fig.who.a3": "included",
  "couples.fig.who.col_b": "CLAIMED PROFILE",
  "couples.fig.who.b1": "their own way in",
  "couples.fig.who.b2": "their own goal, editable",
  "couples.fig.who.b3": "€2 a month",
  "couples.fig.who.foot": "the account that opens the household is never counted",

  // ── FIGURE C — les quatre réponses ─────────────────────────────────────────
  "couples.fig.chat.title": "The four answers when tonight falls through",
  "couples.fig.chat.desc":
    "In the chat, an evening that falls through has exactly four answers: shift this dish, shift the session, nobody cooks tonight, or nothing needs to change. None of them rebuilds the week.",
  "couples.fig.chat.eyebrow": "TONIGHT DOESN'T GO AS PLANNED",
  "couples.fig.chat.label": "IN THE CHAT",
  "couples.fig.chat.said": "Tonight's dinner isn't happening.",
  "couples.fig.chat.b1": "shift this dish",
  "couples.fig.chat.b2": "shift the session",
  "couples.fig.chat.b3": "nobody cooks tonight",
  "couples.fig.chat.b4": "nothing to change",
  "couples.fig.chat.foot": "the week is not rebuilt",

  // ── FAMILIES ──────────────────────────────────────────────────────────
  "families.seo_title": "One pot for a household with different needs",
  "families.seo_description":
    "Sophia composes a household's week around every mouth at the table: one allergy governs the whole pot, and when the household's constraints can't be read, nothing is composed. 12,99 € a month for the whole household, up to eight mouths.",

  // ── Héros ────────────────────────────────────────────────────────────────
  "families.hero.kicker": "Three mouths to feed, or more",
  "families.hero.title":
    "One allergy at the table governs the whole pot.",
  "families.hero.lede":
    "One pot for the whole table. The exception isn't patched at the last minute, plate in hand: every constraint at the table is gathered before the plan exists, and if that set can't be read, nothing is composed. Sophia refuses rather than guesses.",
  "families.hero.cta": "Create your household",
  "families.hero.price_note":
    "12,99 € a month, the whole household. One more mouth doesn't change the price.",

  "families.fig_pot.label": "THE TABLE GOVERNS THE POT",
  "families.fig_pot.a11y_title": "The mouths of the household, and the pot",
  "families.fig_pot.a11y_desc":
    "Four mouths are listed with their allergies. Only one carries a constraint. The four lines gather into a single stroke that enters the pot: the whole pot is composed without that food.",
  "families.fig_pot.col_mouths": "THE MOUTHS",
  "families.fig_pot.col_allergies": "ALLERGIES",
  "families.fig_pot.m1": "You",
  "families.fig_pot.m2": "Sami, 9",
  "families.fig_pot.m2_allergy": "peanut",
  "families.fig_pot.m3": "Inès, 6",
  "families.fig_pot.m4": "Jo",
  "families.fig_pot.none": "none",
  "families.fig_pot.pot_label": "THE WHOLE POT",
  "families.fig_pot.pot_value": "composed without peanut",

  // ── Le refus ─────────────────────────────────────────────────────────────
  "families.refusal.kicker": "The refusal",
  "families.refusal.title": "When the household can't be read, nothing gets composed.",
  "families.refusal.body":
    "Every mouth's allergies are gathered into one constraint, read at the moment the week is built. If it can't be read, the build stops and names the reason. It doesn't compose a careful version, it doesn't split the difference: it stops. That is what fail-closed means — here, the default is to refuse.",
  "families.refusal.line":
    "A plan that's missing can be asked for again. A plan that guessed gets eaten.",

  "families.fig_gate.label": "BEFORE THE WEEK EXISTS",
  "families.fig_gate.a11y_title": "The two ways generation can end",
  "families.fig_gate.a11y_desc":
    "The household's constraints are read before the week is composed. If they are readable, the week is composed. If they are not, nothing is composed and generation stops, naming the reason.",
  "families.fig_gate.in_label": "THE CONSTRAINTS",
  "families.fig_gate.in_value": "of every mouth",
  "families.fig_gate.ok_label": "READABLE",
  "families.fig_gate.ok_value": "the week is composed",
  "families.fig_gate.no_label": "UNREADABLE",
  "families.fig_gate.no_value": "nothing is composed",
  "families.fig_gate.code": "safety_constraints_unreadable",

  // ── Les bouches sans compte ──────────────────────────────────────────────
  "families.mouths.kicker": "Mouths without accounts",
  "families.mouths.title": "Your children are in the plan. They have no account and no screen.",
  "families.mouths.body":
    "A mouth exists through what you write about it: first name, date of birth, goal, allergies. That's all we ask, and you're the one who writes it — there's no password to create for a six-year-old, no profile to have them fill in, no extra screen in the house.",

  "families.fig_sheet.label": "ONE MOUTH, FOUR FIELDS",
  "families.fig_sheet.a11y_title": "What we ask for a mouth, and who has an account",
  "families.fig_sheet.a11y_desc":
    "On the left, the four fields asked to add a mouth: first name, date of birth, goal, allergies. On the right, three mouths of the household: only one has an account, the other two exist in the plan with no account and no screen.",
  "families.fig_sheet.asked": "WHAT WE ASK",
  "families.fig_sheet.f1": "first name",
  "families.fig_sheet.f2": "date of birth",
  "families.fig_sheet.f3": "goal",
  "families.fig_sheet.f4": "allergies",
  "families.fig_sheet.m1": "You",
  "families.fig_sheet.m2": "Sami, 9",
  "families.fig_sheet.m3": "Inès, 6",
  "families.fig_sheet.has_account": "AN ACCOUNT",
  "families.fig_sheet.no_account": "NO ACCOUNT",
  "families.fig_sheet.caption": "no account, no screen, no password to remember",

  // ── Les parts ────────────────────────────────────────────────────────────
  "families.portions.kicker": "Portions",
  "families.portions.title": "Portions follow age. A child is never put on a diet.",
  "families.portions.body":
    "A minor is never a target: the rule lives in the structure, not in a writing guideline. The goal field exists for everyone, and a generation aimed at a minor is refused — there is no screen, no setting, no path around it. A child's portion follows their age, and that is all it follows.",

  "families.fig_age.label": "PORTIONS FOLLOW AGE",
  "families.fig_age.a11y_title": "Two portions of the same dish, and a goal that does not apply",
  "families.fig_age.a11y_desc":
    "Two plates receive the same dish. Beside the first, an adult whose goal applies. Beside the second, a minor: no goal aims at them, and the figure draws no difference in size.",
  "families.fig_age.adult_label": "AN ADULT",
  "families.fig_age.adult_value": "their goal applies",
  "families.fig_age.adult_note": "the portion follows what they aim for",
  "families.fig_age.minor_label": "A MINOR",
  "families.fig_age.minor_value": "no goal aims at them",
  "families.fig_age.minor_note": "the portion follows their age, nothing else",

  // ── L'envie de la semaine ────────────────────────────────────────────────
  "families.envy.kicker": "This week's craving",
  "families.envy.title":
    "You write, in one line, what the house feels like eating. The plan composes with it.",
  "families.envy.body":
    "One line, written by whoever runs the household, read by the generator as the week is composed. It isn't a vote and it isn't a form: it's a sentence, and it stands for the whole house. That's where “my family won't eat that” gets settled — not in one more filter.",

  "families.fig_envy.label": "ONE LINE, THEN THE WEEK",
  "families.fig_envy.a11y_title": "One line, and the week composed with it",
  "families.fig_envy.a11y_desc":
    "A single-line field, written by whoever runs the household. The stroke fans out to the seven days of the week: the generator reads this line as it composes.",
  "families.fig_envy.field_label": "WRITTEN BY YOU, IN ONE LINE",
  "families.fig_envy.line": "“This week we feel like dishes we can share.”",
  "families.fig_envy.caption": "the generator composes the week with this line",

  // ── Le prix ──────────────────────────────────────────────────────────────
  "families.price.kicker": "Price",
  "families.price.title": "12,99 € per household. Not per mouth.",
  "families.price.amount": "12,99 €",
  "families.price.period": "a month, the whole household",
  "families.price.label": "Up to eight mouths. Yours is never counted.",
  "families.price.body":
    "Adding a mouth doesn't change the price, and a household is capped at eight. An adult who wants their own login takes a claimed profile, at 2 € a month: that's the only add-on there is. The product doesn't charge you for being a family.",

  "families.fig_price.label": "THE PRICE FOLLOWS THE HOUSEHOLD",
  "families.fig_price.a11y_title": "Eight places, one price",
  "families.fig_price.a11y_desc":
    "Eight mouth slots in a row. The first one is yours and is never counted. The price written below does not change as the slots fill up.",
  "families.fig_price.you": "YOU",
  "families.fig_price.not_counted": "NEVER COUNTED",
  "families.fig_price.cap": "CAP: 8 MOUTHS",
  "families.fig_price.amount": "12,99 €",
  "families.fig_price.note": "at one mouth or at eight",

  // ── Ce qu'on ne promet pas ───────────────────────────────────────────────
  "families.limits.kicker": "What we don't promise",
  "families.limits.title": "What Sophia does not do for your household.",
  "families.limits.i1":
    "The allergy guard covers what gets built: the week, the meal. An answer written in the chat does not re-read the household's combined constraints — which is why the word “everywhere” appears nowhere on this page.",
  "families.limits.i2":
    "No weight curve for anyone in the household: what gets written is overwritten, with no date and no series. There is nothing to track.",
  "families.limits.i3":
    "Numbers stay off by default, and turning them on means passing several locks. Nothing shows up as a number until you ask for it.",
  "families.limits.i4":
    "There is no family council: nobody votes, and the plan does not report back what it did with your line.",
  "families.limits.i5": "No mobile app: Sophia opens in a browser.",
  "families.limits.i6":
    "Sophia replaces neither reading a label nor a doctor's advice. It composes meals; it treats no one and diagnoses nothing.",

  // ── La sortie ────────────────────────────────────────────────────────────
  "families.closing.kicker": "Getting started",
  "families.closing.title": "Create your household, one mouth at a time.",
  "families.closing.body":
    "For each mouth we ask four things: first name, date of birth, goal, allergies. You write them once; they govern the pot from then on.",

  // ── COACHES ───────────────────────────────────────────────────────────
  "coaches.seo_title": "Sophia — your method answers your students, every day",
  "coaches.seo_description":
    "Sophia learns how you coach — your convictions, your red lines, what you say instead — and answers your students in your method, every day. What she writes in the chat is read back against your red lines before it is sent, by code. On Monday you read one page. 7 € per student, per month, no platform fee.",

  // ── HERO ────────────────────────────────────────────────────────────────
  // Le titre survit à la refonte : il nomme la douleur (le cours finit) et la
  // promesse (le coaching, non) en six mots, et il n'a jamais été le problème.
  "coaches.hero.kicker": "For coaches who sell a method, not hours",
  "coaches.hero.title": "Your course ends. Your coaching doesn't.",
  "coaches.hero.lede":
    "You wrote the method once. Sophia answers your students in it, every day — the question at nine at night, the week they build for themselves, the meals she drafts for them. What you could only sell once becomes something worth paying for every month.",
  "coaches.hero.cta": "Start the 14-day trial",
  // B5 (14 jours / 3 élèves) · B32 (invitation e-mail, pas de lien à copier) ·
  // S1 (aucune boîte de réception, et l'absence est le produit).
  "coaches.hero.note":
    "14 days, up to 3 students, then it stops on its own. They join by email invitation and get a space of their own, chat included. Nothing comes back to an inbox on your side — there isn't one.",
  // B10 + B28. La légende porte les 4 points d'injection et la révision.
  "coaches.hero.fig_caption":
    "You record it once, in a guided interview: your convictions, your red lines, what you say instead, your vocabulary. Revise it whenever you like — an edit lands on the next message — and roll back to an earlier version without losing what your students already received.",

  "coaches.fig.method.title": "One method, four places it is written into",
  "coaches.fig.method.desc":
    "The published method on the left. On the right, the four things Sophia composes for a student: their chat, the week they build, the meals she drafts, their household's meals. Each one is composed with the method in it.",
  "coaches.fig.method.eq": "RECORDED ONCE",
  "coaches.fig.method.source": "YOUR METHOD",
  "coaches.fig.method.l1": "your convictions",
  "coaches.fig.method.l2": "your red lines",
  "coaches.fig.method.l3": "what you say instead",
  "coaches.fig.method.l4": "your vocabulary",
  "coaches.fig.method.out1": "their chat",
  "coaches.fig.method.out2": "the week they build",
  "coaches.fig.method.out3": "the meals she drafts",
  "coaches.fig.method.out4": "their household meals",

  // ── LA JOURNÉE ──────────────────────────────────────────────────────────
  "coaches.day.kicker": "Every day",
  "coaches.day.title": "The questions that arrive after the course is over.",
  "coaches.day.body":
    "The modules are recorded, the cohort is full, the method is good. Then Tuesday night arrives and a student has a question that is in no module, because it is about their evening, their kitchen, their week. Multiply it by everyone enrolled.",
  "coaches.day.q1": "“Can I swap the rice for pasta tonight?”",
  "coaches.day.q2": "“I'm starving at 4pm — is that normal?”",
  "coaches.day.q3": "“I ate badly at a wedding. Have I wrecked the week?”",
  "coaches.day.close":
    "Every one of them has an answer, and the answer is yours — you have made that call a hundred times. Nobody leaves because the method was wrong. They drift because on Tuesday night, nobody who thinks like you was there.",
  // B22 (trois boutons, un par jour) · B23 (la relance part AUSSI sur
  // « mitigé », pas seulement sur « dur » — l'ancienne page disait « if it was
  // hard », et `needsAxisFollowUp` dit `level !== "good"`).
  "coaches.day.fig_caption":
    "The exchange is an example. The evening question and its three buttons are the product's own words: one tap a day, and if the day was rough — or just so-so — one follow-up asks about energy, hunger or sleep.",

  "coaches.fig.chat.title": "One day in a student's chat",
  "coaches.fig.chat.desc":
    "The student writes what happened at lunch and gets an answer composed with their coach's method. In the evening, one question and three buttons: All good, So-so, Rough.",
  "coaches.fig.chat.heading": "In their chat, today",
  "coaches.fig.chat.them": "THEM",
  "coaches.fig.chat.sophia": "SOPHIA",
  "coaches.fig.chat.student": "Ate out at lunch — no idea what was in it.",
  "coaches.fig.chat.reply1": "Then keep tonight simple: a protein, greens,",
  "coaches.fig.chat.reply2": "a normal portion. One lunch out is not a week.",
  "coaches.fig.chat.evening": "IN THE EVENING",
  // MOT POUR MOT — `daily_pulse.ts:114` et `:84-88`. Ne pas « améliorer ».
  "coaches.fig.chat.question": "How was today?",
  "coaches.fig.chat.tap_good": "All good",
  "coaches.fig.chat.tap_mixed": "So-so",
  "coaches.fig.chat.tap_rough": "Rough",

  // ── LE BLOC SOMBRE — la relecture avant envoi ───────────────────────────
  "coaches.lock.kicker": "The part you should be most afraid of",
  "coaches.lock.title": "An AI speaking in your name is a risk. We treat it as one.",
  "coaches.lock.body":
    "A prompt is an instruction, not a guarantee. Tell any model “never recommend grazing between meals” and it will comply almost always — and almost always is the wrong number when one public contradiction of you is the thing your students will remember.",
  // B8b, en deux temps. L'asymétrie EST l'argument : nommer ce qui est une
  // instruction protège la seule phrase de la page qui est une garantie.
  "coaches.lock.scope":
    "So your method is written into everything Sophia composes for your students: the chat, every week, every meal. That much is an instruction. The second part is not: what she writes in the chat is read back against your red lines before it is sent, by code, with no model in that loop.",
  "coaches.lock.instead":
    "What goes out instead is not ours either. Each red line carries what you say in its place, in your own words, and it is signed with your name — so your student reads your position, and knows it is yours.",
  "coaches.lock.close":
    "They never get a refusal, and never get “ask your coach” — in a masterclass, that points at a door which doesn't exist. They get your answer.",

  "coaches.fig.lock.title": "A message held, and what went out instead",
  "coaches.fig.lock.desc":
    "A student's question, the draft that crossed a red line, the check that held it, and the sentence the coach wrote for that exact case going out in its place, signed with their name.",
  "coaches.fig.lock.eq": "IN THE CHAT, BEFORE IT IS SENT",
  "coaches.fig.lock.ask_label": "A STUDENT ASKS",
  "coaches.fig.lock.ask": "“Should I add a snack between lunch and dinner?”",
  "coaches.fig.lock.draft_label": "THE DRAFT SAID",
  "coaches.fig.lock.draft": "“A small snack mid-afternoon can help.”",
  "coaches.fig.lock.held": "held",
  "coaches.fig.lock.gate": "YOUR RED LINE — no grazing between meals",
  "coaches.fig.lock.gate_note": "no model in this loop",
  "coaches.fig.lock.sent_label": "WHAT WENT OUT",
  "coaches.fig.lock.sent1": "“Three real meals. If you're hungry between them,",
  "coaches.fig.lock.sent2": "the meal before was too small.”",
  "coaches.fig.lock.sign": "— Marc",

  // ── LE LUNDI ────────────────────────────────────────────────────────────
  "coaches.monday.kicker": "Every Monday",
  "coaches.monday.title": "One page, and no model wrote it.",
  // B11 : cron hebdo, texte rendu par gabarit (`renderSynthesisText` est pur).
  "coaches.monday.body":
    "Who is still talking, how the week felt, what your students set themselves. Rendered by a template out of what actually happened — and where there is not enough to say something, it says that instead of rounding it up.",
  // B14 : 48 h / 120 h, mesurés sur le dernier message ENTRANT. La dernière
  // phrase cite `CoachWeeklyPage.tsx:272` mot pour mot.
  // ⚠️ Ne PAS écrire « pas de score d'adhérence, pas de pourcentage » (B15) :
  // `coach_synthesis.ts:571-575` émet encore une moyenne dès qu'une ligne
  // existe. La page dit ce que la page fait, pas ce que le produit promet.
  "coaches.monday.thresholds":
    "In touch means they wrote within two days. Slipping is two to five days. Silent is five or more. And where there is no number, the page says “no number to show” rather than filling the gap.",
  "coaches.monday.fig_caption":
    "A schematic of the Monday page. The sentences are the ones the renderer emits, word for word; the cohort is an example.",

  // MOT POUR MOT — toutes ces chaînes viennent de l'écran réel. Elles restent
  // en anglais dans les deux locales : ce sont les mots du produit, pas ceux
  // de la page. Traduire une capture, c'est cesser d'en être une (S10).
  "coaches.fig.monday.title": "Monday, in one page",
  "coaches.fig.monday.desc":
    "The coach's weekly page: the week in prose first, then the students worth writing to with the reason attached, then the numbers, last and small.",
  "coaches.fig.monday.app_title": "This week",
  "coaches.fig.monday.week_label": "WEEK OF 2026-08-03",
  "coaches.fig.monday.week_to": "2026-08-09",
  "coaches.fig.monday.line1": "34 students this week: 25 in touch, 6 slipping, 3 silent.",
  "coaches.fig.monday.line2":
    "How the week felt: 21 holding up, 9 strained, 4 having a hard time.",
  // « built », pas « wrote » — AUDIT B13.
  "coaches.fig.monday.line3": "21 of 34 built themselves a week from your method.",
  "coaches.fig.monday.flagged_label": "WORTH A MESSAGE",
  "coaches.fig.monday.s1_name": "Chen Wei",
  "coaches.fig.monday.s1_reason": "Going quiet",
  "coaches.fig.monday.s1_state": "slipping",
  "coaches.fig.monday.s2_name": "Amina Diop",
  "coaches.fig.monday.s2_reason": "Has not written in days",
  "coaches.fig.monday.s2_state": "silent",
  "coaches.fig.monday.s3_name": "Luca Ferrari",
  "coaches.fig.monday.s3_reason": "Barely logged anything",
  "coaches.fig.monday.s3_none": "no number to show",
  "coaches.fig.monday.numbers_label": "THE NUMBERS",
  "coaches.fig.monday.n1_label": "responsive",
  "coaches.fig.monday.n2_label": "slipping",
  "coaches.fig.monday.n3_label": "silent",

  // ── LA NOTE 1:1 ─────────────────────────────────────────────────────────
  // B26. La section existe parce qu'un coach qui connaît ses dix élèves lit le
  // 1:N comme un refus de le servir. Elle reste APRÈS la relecture : elle
  // ajoute une entrée dans le prompt, et on rencontre la garantie avant.
  "coaches.note.kicker": "If you coach ten people you actually know",
  "coaches.note.title": "Your method is what you'd say to any of them. This is the rest.",
  "coaches.note.body":
    "One field, one student, 1,500 characters, in your words: that this one works nights, that one writes off Sunday. It reaches their chat, the week they build and the meals Sophia drafts for them — your method, read through what you know about them. And it never outranks anything: their allergies come first, your method second, the note third.",
  // ⚠️ « jamais citée » est une promesse de PROMPT sans vérificateur
  // déterministe (`coach_note.ts:126-128`). Elle ne se met pas au même rang
  // que les lignes rouges — et le dire est un argument, pas une concession.
  "coaches.note.limit":
    "Sophia is instructed never to quote it back to them. That one is an instruction, not a check, and we would rather tell you which is which. It is also a note about a person, so it belongs to them too: it is included if they ever ask for their data.",
  "coaches.note.mock_label": "ON THEIR PAGE, IN YOUR WORKSPACE",
  // VERBATIM — `CoachNoteCard.tsx:111`.
  "coaches.note.mock_heading": "What you have noticed about them",
  "coaches.note.mock_body": "Works nights, eats around 3am. Hates cooking on Sundays.",
  "coaches.note.mock_caption":
    "Leave it empty and nothing reaches the model to say you left it blank. Two hundred students, write none. Ten, write ten.",

  // ── LE PRIX ─────────────────────────────────────────────────────────────
  // B1 (7 €/élève, pas de forfait) · B4 (on arrête le mois où on éteint) ·
  // B5 (essai) · B6 (il faut un élève rattaché pour s'abonner : sans lui le
  // checkout refuse en `no_billable_seat`) · S12 (aucun SKU élève).
  // « No tier to outgrow » est une propriété de NOTRE grille, pas une
  // comparaison chiffrée avec un concurrent.
  "coaches.pricing.kicker": "Pricing",
  "coaches.pricing.title": "One line. It grows with what you sell.",
  "coaches.pricing.seat": "7 €",
  "coaches.pricing.seat_period": "per student, per month",
  "coaches.pricing.seat_label": "No platform fee. No setup. No tier to outgrow.",
  "coaches.pricing.body":
    "You pay for the students you have enrolled, and you stop paying the month you turn a seat off. What you charge them is yours, billed with your own tools — we never bill your student. The trial runs 14 days with up to 3 students; to subscribe when it ends you need at least one student enrolled, because the seat is the thing you pay for.",
  // B31 — la meilleure ligne des trois pages actuelles. Conservée.
  "coaches.pricing.no_number":
    "What one student who stays instead of drifting is worth is your number, not ours. We have no retention figure to sell you, and we are not going to invent one.",
  "coaches.pricing.cta": "Start the 14-day trial",
  "coaches.pricing.trial_note": "14 days, up to 3 students, then it stops on its own.",

  // ── LA SORTIE ───────────────────────────────────────────────────────────
  "coaches.closing.title":
    "You have already written the method. This is what makes it worth paying for every month.",
  "coaches.closing.cta": "Start the 14-day trial",

  // ── GYMS ──────────────────────────────────────────────────────────────
  "gyms.seo_title": "Sophia for gyms — a nutrition tier your members pay for",
  "gyms.seo_description":
    "An independent gym's second line of revenue: a nutrition tier above the membership, answered every day by an agent that works from your method. You pay 7 € per enrolled member and charge what you like on top. What Sophia writes in the chat is re-read against your red lines before it is sent, with no model in that loop. On Monday, one computed page names the members worth a message while they can still be reached.",

  // ── HERO ────────────────────────────────────────────────────────────────
  // La douleur d'abord, le revenu juste après. Un argument de charge de travail
  // plafonne au temps du gérant et nous fait comparer à un logiciel de gestion
  // de salle ; la douleur, elle, est ce qu'il a déjà en tête en arrivant.
  // « vingt et un repas » est de l'arithmétique du monde (3 × 7), pas une
  // mesure du produit : aucun chiffre du dépôt n'est engagé ici.
  "gyms.hero.eyebrow": "For independent gyms — boxes, strength halls, hybrid studios",
  "gyms.hero.title": "You coach three hours a week. They eat twenty-one meals without you.",
  "gyms.hero.lede":
    "That is where the plateau comes from, and a member who stops seeing their body change does not argue with you about it: they come less, then they come on Saturdays, then they stop coming. Sophia is a nutrition tier above your membership. You record how you feed athletes once, and an agent answers every member you enrol, every day, from your method.",
  "gyms.hero.cta": "Start the 14-day trial",
  "gyms.hero.trial_note": "14 days, up to 3 members, then it stops on its own.",
  // B32 : l'invitation par e-mail est une propriété de sécurité (le jeton est
  // minté serveur, seul son sha256 est stocké), pas un manque de partage.
  "gyms.hero.note":
    "Members join one email address at a time, by invitation. There is no shareable link to copy around, and that is the point. It runs beside whatever you already use to run the gym — there is nothing to connect.",

  // Figure 1 — la semaine d'un membre. Concept, vue de face, 480×240.
  "gyms.fig.week_t": "One member's week: three coached sessions, twenty-one meals elsewhere",
  "gyms.fig.week_d":
    "A week drawn as marks. On the first row, the three sessions coached in the room. On the second, the twenty-one meals that happen where the gym is not — the part this page is about.",
  "gyms.fig.week_label": "ONE MEMBER'S WEEK",
  "gyms.fig.week_row1": "THREE HOURS IN THE ROOM",
  "gyms.fig.week_row2": "TWENTY-ONE MEALS, EVERYWHERE ELSE",

  // ── L'ARITHMÉTIQUE ──────────────────────────────────────────────────────
  // B30 : l'exemple est juste ET étiqueté « exemple ». Les deux, ensemble, sont
  // ce qui le rend crédible — retirer l'étiquette en ferait une prévision.
  //   250 × 15 % = 37,5 → 37 (ARRONDI VERS LE BAS : une personne n'est pas
  //   divisible, et arrondir vers le haut flatterait notre côté)
  //   37 × 25 € = 925 €  |  37 × 7 € = 259 €  |  925 − 259 = 666 €  |  ×12 ≈ 8 000 €
  // Si l'un de ces nombres bouge, les cinq autres bougent avec.
  "gyms.money.eyebrow": "The arithmetic",
  "gyms.money.title": "A tier your members pay for, on top of the membership.",
  "gyms.money.body":
    "You pay 7 € for each member you enrol and you set what they pay you. No platform fee, no setup fee, and you stop paying the month you turn a seat off. Nobody at your gym writes a menu, so the tier costs you no hours — which is exactly why the number to weigh it against is not the time it saves.",
  // B31 — à conserver telle quelle. C'est la meilleure ligne des trois pages,
  // et elle tombe ici parce que c'est ici qu'un chiffre de rétention inventé
  // aurait le plus de valeur commerciale.
  "gyms.money.close":
    "What you are buying is months of membership. What is one member who stays three months longer worth to you? That is the number to put against 7 €, and it is yours, not ours: we have no retention figure to sell you, and we are not going to invent one.",
  "gyms.money.caption":
    "An example, and it says so. We do not know your take-up or the price you would set, and those are the two numbers that decide the total. The one that is not an estimate is ours: 7 € per enrolled member.",

  // Figure 2 — l'exemple chiffré. Document vu de face, 480×240.
  "gyms.fig.money_t": "A worked example for a gym with 250 members",
  "gyms.fig.money_d":
    "Four lines of arithmetic. Thirty-seven members on the nutrition tier at 25 € each is 925 € in; seven euros each to Sophia is 259 € out; 666 € stays with the gym every month.",
  "gyms.fig.money_label": "AN EXAMPLE — A GYM WITH 250 MEMBERS",
  "gyms.fig.money_uptake_label": "On the nutrition tier",
  "gyms.fig.money_uptake_value": "37 members",
  "gyms.fig.money_uptake_hint": "15% take it up, rounded down to whole people",
  "gyms.fig.money_in_label": "They pay you 25 € each",
  "gyms.fig.money_in_value": "925 €",
  "gyms.fig.money_out_label": "You pay Sophia 7 € each",
  "gyms.fig.money_out_value": "− 259 €",
  "gyms.fig.money_keep_label": "You keep, every month",
  "gyms.fig.money_keep_value": "666 €",
  "gyms.fig.money_keep_hint": "about 8,000 € a year",

  // ── TOUS LES JOURS ──────────────────────────────────────────────────────
  // B22 : trois boutons, fenêtre 20 h-22 h, un message par jour au plus.
  // B23 : la relance d'axe part dès que le niveau n'est pas « good » — donc
  // aussi sur « So-so ». La phrase est écrite au mot près : « anything other
  // than All good ». Ne pas la ramener à « si c'était dur ».
  "gyms.daily.eyebrow": "Every day",
  "gyms.daily.title": "It is awake at nine on a Tuesday evening. You are at home.",
  "gyms.daily.body":
    "A member sends a photo of a plate or a sentence about their day, and gets an answer built from your method, in a thread that stays open. In the evening, one tap says how the day went — three buttons, and on anything other than All good, one follow-up asks whether it was energy, hunger or sleep. That is the whole evening.",
  // B21 : un message par épisode (`reengagement.ts:211-213`) et
  // REENGAGE_MIN_GAP_HOURS = 24×7 avant qu'un autre soit seulement possible.
  // B24 / S5 : les heures calmes ne couvrent QUE la relance. Le tap du soir a
  // sa propre fenêtre et peut tomber à 21 h 50 — d'où « ten to ten », qui est
  // là pour empêcher la phrase interdite de repousser.
  "gyms.daily.quiet_title": "Three days of silence, one message.",
  "gyms.daily.quiet_body":
    "Then it goes quiet: one nudge per episode, and a week before another one is even possible. A nudge on day two would only teach people that silence gets pinged, and it would burn the signal for day nine. That nudge holds off between 9pm and 8am. The evening tap has its own window, and it can land at ten to ten.",
  "gyms.daily.fig_caption":
    "Every word in this thread is the product's own: the question, the three buttons, the follow-up, and what the composer says when it is empty.",

  // Figure 3 — le fil du soir. MAQUETTE DE PRODUIT, 480×320, et chaque chaîne
  // est citée mot pour mot (S10). Ces six clés NE SE TRADUISENT PAS : l'app
  // authentifiée est en anglais, et une capture traduite montrerait un écran
  // qui n'existe pas.
  "gyms.fig.thread_t": "The evening thread, as the product renders it",
  "gyms.fig.thread_d":
    "A chat surface. Sophia asks how the day went and offers three buttons; a second question asks which axis was hard and offers three more. At the bottom, the composer the member writes into.",
  "gyms.fig.thread_app": "Sophia", // chat.title
  "gyms.fig.thread_sub": "Your day-to-day, with your coach's method behind it.", // chat.subtitle
  "gyms.fig.thread_q1": "How was today?", // PULSE_QUESTION_EN, daily_pulse.ts:114
  "gyms.fig.thread_b1": "All good", // LEVEL_LABELS_EN.good, daily_pulse.ts:85
  "gyms.fig.thread_b2": "So-so", // LEVEL_LABELS_EN.mixed, daily_pulse.ts:86
  "gyms.fig.thread_b3": "Rough", // LEVEL_LABELS_EN.hard, daily_pulse.ts:87
  "gyms.fig.thread_q2": "What was hard?", // PULSE_AXIS_QUESTION_EN, daily_pulse.ts:115
  "gyms.fig.thread_a1": "Energy", // AXIS_LABELS_EN.energy, daily_pulse.ts:90
  "gyms.fig.thread_a2": "Hunger", // AXIS_LABELS_EN.hunger, daily_pulse.ts:91
  "gyms.fig.thread_a3": "Sleep", // AXIS_LABELS_EN.sleep, daily_pulse.ts:92
  "gyms.fig.thread_composer": "Write to Sophia", // chat.input.placeholder
  "gyms.fig.thread_send": "Send", // chat.send

  // ── LE LUNDI ────────────────────────────────────────────────────────────
  // B11 : cron hebdomadaire, texte rendu par GABARIT (`renderSynthesisText` est
  // une fonction pure), jamais narré par un modèle.
  // B14 : les seuils sont mesurés sur le dernier ENTRANT — répondu < 48 h,
  // slipping 48-120 h, silencieux ≥ 120 h.
  // B17 : la cohorte est scopée par coach — une salle ne voit que ses membres.
  "gyms.monday.eyebrow": "Every Monday",
  "gyms.monday.title": "The names worth a message, while they can still be reached.",
  "gyms.monday.body":
    "One page, computed from what happened and rendered from a template. No model narrates it, which is why it cannot flatter you. A member who wrote in the last two days is in touch; between two and five days they are slipping; past five days they are silent.",
  "gyms.monday.close":
    "Slipping is the useful one. Those members are still reachable, and a message from you still lands. Your access log will tell you the same thing in six weeks, and by then the word for it is former member.",
  "gyms.monday.scope": "You see the members you enrolled, and nobody else's.",
  "gyms.monday.fig_caption":
    "A schematic of that page. The names are made up; the labels, the reasons and the states are the product's own words.",

  // Figure 4 — le lundi. MAQUETTE DE PRODUIT, 480×280, chaînes citées mot pour mot.
  // Ces clés ne se traduisent pas non plus. Le bloc « The numbers » de l'écran réel
  // n'est PAS dessiné: c'était une seconde idée dans la même figure, et le sujet est
  // la liste des noms. Les seuils, eux, sont dans la copie (B14).
  "gyms.fig.monday_t": "The Monday page: the members worth a message",
  "gyms.fig.monday_d":
    "The weekly page of a gym owner. Three members worth a message, each with the observed reason and their contact state — and, on the third, a plain statement that there is no number to show.",
  "gyms.fig.monday_app": "This week", // KeelAppShell title, CoachWeeklyPage.tsx:192
  "gyms.fig.monday_worth": "WORTH A MESSAGE", // CoachWeeklyPage.tsx:231, rendu en capitales par `SectionLabel`
  "gyms.fig.monday_n1": "Chen Wei",
  "gyms.fig.monday_r1": "Going quiet", // FLAG_REASON_COPY.slipping_contact
  "gyms.fig.monday_s1": "slipping", // contact_state, rendu brut
  "gyms.fig.monday_n2": "Amina Diop",
  "gyms.fig.monday_r2": "Has not written in days", // FLAG_REASON_COPY.silent_5d
  "gyms.fig.monday_s2": "silent", // contact_state, rendu brut
  "gyms.fig.monday_n3": "Luca Ferrari",
  "gyms.fig.monday_r3": "Barely logged anything", // FLAG_REASON_COPY.coverage_below_gate
  "gyms.fig.monday_s3": "no number to show", // CoachWeeklyPage.tsx:272

  // ── UNE FOIS ────────────────────────────────────────────────────────────
  // La section dont le travail est de PERDRE une vente : le gérant qui délègue
  // l'entretien à un salarié récupère une doctrine remplie sous contrainte, et
  // un agent générique est le mode d'échec du produit, pas une version moindre.
  // B20 est dit ici à voix haute : un compte coach = une méthode. C'est une
  // limite, et l'écrire empêche « votre équipe » de s'installer plus loin.
  // B28 : révision et rollback sans perdre l'historique de ce que les membres
  // ont réellement reçu.
  "gyms.fit.eyebrow": "Once",
  "gyms.fit.title": "It only works if the method is yours.",
  "gyms.fit.body":
    "A guided interview turns what you already say on the floor into something an agent can hold: what you are convinced of, what you rule out, the calls you make on the hard cases, your words. You read back exactly what it understood before you publish. Revise it whenever you like, and roll back to an earlier version without losing the history of what your members actually received.",
  "gyms.fit.one_title": "One account, one method.",
  "gyms.fit.one_body":
    "A gym with three coaches records one method, not three. There is no gym entity above the account and no roster inside it: whoever sits the interview is who the agent works from, and that person has to be the one who benefits from it.",
  "gyms.fit.no_title": "Not the appointed nutritionist.",
  "gyms.fit.no_body":
    "Hand the interview to someone on staff and you get back what you put in: a doctrine filled in under duress, and an agent that sounds like every other food app. A generic agent is this product's failure mode, not a smaller version of it.",

  // ── LE DOUBLE VERROU — le bloc sombre, un seul par page ──────────────────
  // ⚠️ FORMULATION B8b, ET PAS CELLE DES PAGES ACTUELLES. Les deux pages en
  // ligne sur-vendent : `withKeelDoctrineBlock` n'a qu'UN appelant (le
  // composeur), et « chaque message sortant » est faux — quatre surfaces sont
  // scannées (chat, repas, semaines, reco du jour), quatre ne le sont pas
  // (relance, récap du soir, bilan du dimanche, broadcast coach).
  // Ce qui est écrit ici, et rien de plus : la méthode ENTRE dans le chat,
  // dans chaque semaine et dans chaque repas ; ce qui est écrit DANS LE CHAT
  // est relu contre les lignes rouges avant d'être envoyé.
  "gyms.lock.eyebrow": "The part to be most afraid of",
  "gyms.lock.title": "An agent that answers for you is a risk. We treat it as one.",
  "gyms.lock.body":
    "A prompt is an instruction, not a guarantee. Tell any model never to recommend grazing between meals and it will comply almost always — and almost always is the wrong number when one public contradiction of you, in front of someone who trains under your name, is what the room remembers.",
  "gyms.lock.l1_tag": "Your method goes in",
  "gyms.lock.l1":
    "It enters the chat, and every week and every meal Sophia writes.",
  "gyms.lock.l2_tag": "What comes out of the chat is re-read",
  "gyms.lock.l2":
    "What Sophia writes in the chat is checked against your red lines before it is sent. Deterministic, with no model in that loop. That one is the guarantee.",
  // B9 : chaque ligne rouge porte son `instead`, dans les mots du coach, signé
  // de son nom (`keel_output_locks.ts:99-113`). C'est le seul endroit de la
  // page où le nom du gérant apparaît, et c'est le seul endroit où il apparaît
  // dans le produit avec le suffixe du broadcast. Ne pas en tirer B18.
  "gyms.lock.instead":
    "Your member never receives a refusal. Each red line carries what you do instead, in your words and signed with your name, and that is what arrives.",
  "gyms.lock.trace_example": "Example — a gym whose method rules out grazing between meals.",
  // B27 : CHECK `student_week_plans_doctrine_traceable_check`. Portée : la
  // semaine seulement. Les plats ne citent pas, délibérément.
  "gyms.lock.traceable":
    "And when a member builds a week out of your method, the database refuses a line that names none of your convictions. A constraint, not a convention.",
  "gyms.lock.close":
    "Your member gets your answer at nine on a Tuesday evening, on a question you have answered a hundred times on the floor.",

  // Figure 5 — la trace. CONCEPT sur fond sombre (F12 : une maquette de produit
  // ne se pose jamais sur un fond sombre — le produit est en clair uniquement,
  // et un écran sombre montrerait un produit qui n'existe pas).
  // Le mot « held » est dessiné en contour sourd, pas en rouge : sur une page
  // de vente il n'y a pas d'instant, et une pastille colorée y serait de la
  // décoration portant le costume du sens (F10).
  "gyms.fig.trace_t": "One message, from the question to what was sent",
  "gyms.fig.trace_d":
    "Three stages. A member's question, the draft that broke a red line and was held, and the line that went out instead — the one the gym owner wrote.",
  "gyms.fig.trace_label": "ONE MESSAGE, END TO END",
  "gyms.fig.trace_s1": "A MEMBER ASKS",
  "gyms.fig.trace_t1": "“Should I add a snack between lunch and dinner?”",
  "gyms.fig.trace_s2": "THE DRAFT SAID",
  "gyms.fig.trace_t2": "“A small snack mid-afternoon can help.”",
  "gyms.fig.trace_held": "held",
  "gyms.fig.trace_s3": "WHAT WENT OUT INSTEAD",
  "gyms.fig.trace_t3": "“Three real meals. If you are hungry between them, the meal before was too small.”",

  // ── LE PRIX ─────────────────────────────────────────────────────────────
  // B1 : 7 €/membre/mois, pas de forfait plateforme. Le montant vit dans
  // `STRIPE_PRICE_ID_COACH_SEAT_MONTHLY`, pas dans le code.
  // B3 : « pour un siège payé à l'année ». L'intervalle est celui du COACH.
  //      ⚠️ C'est la correction du claim FAUX B2. Ne pas revenir à « quand
  //      votre membre a payé son année » : c'est le claim retiré.
  // B4 : `stripe-reconcile-seats` RECALCULE depuis le ledger, il n'incrémente
  //      jamais — on arrête de payer le mois où on éteint un siège.
  // B5 : essai 14 jours / 3 élèves, puis ça s'arrête.
  // B6 : ⚠️ un coach à ZÉRO élève est refusé au checkout (`no_billable_seat`).
  //      D'où « subscribing needs at least one enrolled member » : la marge est
  //      positive dès le premier, mais le premier doit exister.
  "gyms.price.eyebrow": "Pricing",
  "gyms.price.title": "7 € a member. You set what they pay.",
  "gyms.price.seat": "7 €",
  "gyms.price.seat_period": "per enrolled member, per month",
  "gyms.price.seat_label": "No platform fee. No setup. Nothing else.",
  "gyms.price.annual": "6 € for a seat paid for a year up front.",
  "gyms.price.why":
    "You pay for the seats you have opened, and you stop paying the month you turn one off. Subscribing needs at least one enrolled member, so the first seat comes before the first invoice — after that the arithmetic is the same at one member and at five hundred.",
  "gyms.price.billing_note":
    "You bill your members yourself, on whatever you already use for the membership. Sophia never touches their payment and never sees it.",
  "gyms.price.cta": "Start the 14-day trial",
  "gyms.price.trial_note": "14 days, up to 3 members, then it stops on its own.",

  // ── LA CLÔTURE ──────────────────────────────────────────────────────────
  "gyms.close.title": "You already coach the training. This is the other twenty-one meals.",
  "gyms.close.cta": "Start the 14-day trial",
  // Pas de « Sign in » ici: `PublicHeader` porte déjà cette porte, et un second lien
  // à côté du seul CTA de la page serait une seconde offre.
  "gyms.close.trial_note": "14 days, up to 3 members, then it stops on its own.",

  // ── COMMUNITIES ───────────────────────────────────────────────────────
  "communities.seo_title": "Sophia for paid communities — the answer a thread can't give",
  "communities.seo_description":
    "You run a paid community. It is a thread: you answer in public, to the group, and no member ever gets an answer of their own. Sophia is the layer underneath — each member on the coached tier gets their own space, their own week and their own answers, built from your method. Your community does not move. 7 € per member on that tier, per month.",

  // ── HERO ─────────────────────────────────────────────────────────────────
  // Le titre nomme l'ARCHITECTURE, pas la fatigue. « Tu es débordé » est faux
  // et vaguement insultant pour quelqu'un qui tient 500 personnes ; « un fil ne
  // répond pas à une personne » est vrai, structurel, et impossible à
  // contester. C'est ce qu'il a déjà pensé sans l'avoir formulé.
  "communities.hero.kicker": "For owners of a paid community",
  "communities.hero.title": "A community is a thread. A thread can't answer one person.",
  "communities.hero.lede":
    "You answer in public, to the group — and no number of extra hours changes that, because it is the shape of the thing you built. Your members live it as never getting an answer of their own. Sophia is the layer underneath: each member on the coached tier gets their own space, their own week and their own answers, built from your method. Your community does not move.",
  "communities.hero.cta": "Start the 14-day trial",
  // Les trois faits qu'il vérifie en premier, dans l'ordre où ils le rassurent :
  // la porte est petite, l'entrée est simple, et rien ne lui retombe dessus.
  "communities.hero.note":
    "14 days, up to 3 members, then it stops on its own. Members come in by email invitation from your workspace, and nothing comes back to you as an inbox.",
  "communities.hero.signin_prompt": "Already using Sophia?",
  "communities.hero.signin_link": "Sign in",

  // ── FIGURE A — une question, deux destinations ───────────────────────────
  "communities.fig_lane.label": "ONE QUESTION, TWO DESTINATIONS",
  "communities.fig_lane.alt_title": "One answer for everybody, or an answer each",
  "communities.fig_lane.alt_desc":
    "The same four members, drawn twice. On the left a single rule opens all four at once: that is a public answer, written to fit everyone. On the right each member has a rule of their own. What changes is not the amount of work, it is the number of people the answer is addressed to.",
  "communities.fig_lane.thread_label": "IN THE THREAD",
  "communities.fig_lane.tier_label": "ON THE COACHED TIER",
  "communities.fig_lane.thread_caption": "one answer, for everybody",
  "communities.fig_lane.tier_caption": "an answer of their own",

  // ── LE PALIER — ce qu'on ajoute, et ce qu'on ne touche pas ───────────────
  // Sa première phrase est « vous ne changez rien ». Quelqu'un qui a 500
  // membres payants n'achète pas une migration : il achète une ligne de plus
  // sur sa page de vente, vendue à une base dont l'acquisition est déjà payée.
  "communities.tier.kicker": "What you add",
  "communities.tier.title": "One tier above what you already sell. Nothing underneath moves.",
  "communities.tier.body":
    "Same platform, same entry price, same posts, same people. Above them you open one more option: everything they already have, plus an agent that coaches them one to one in your method. The members who want that upgrade. The ones who don't never notice it exists.",

  "communities.fig_tier.label": "THE SAME OFFER, PLUS ONE BAND",
  "communities.fig_tier.alt_title": "The tier sits on top; the offer underneath does not move",
  "communities.fig_tier.alt_desc":
    "The same offer drawn twice, from a single element used twice over. The upper one carries one extra band: each member's own agent. Nothing else changes — not the platform, not the entry price, not the posts.",
  "communities.fig_tier.band": "their own agent, every day",
  "communities.fig_tier.tier_label": "THE COACHED TIER",
  "communities.fig_tier.tier_value": "41 €",
  "communities.fig_tier.base_label": "YOUR COMMUNITY",
  "communities.fig_tier.base_value": "29 €",
  "communities.fig_tier.cost_label": "YOUR COST",
  "communities.fig_tier.cost_value": "7 €",

  // L'arithmétique, à revérifier si l'un de ces nombres bouge :
  //   500 membres × 30 % = 150   |   écart 41 − 29 = 12 €
  //   150 × 12 € = 1 800 €   |   150 × 7 € = 1 050 €   |   1 800 − 1 050 = 750 €
  // Et 150 est aussi la cohorte de la figure du lundi : deux nombres qui ne
  // concordent pas sur une page de vente, et toute la page devient approximative.
  // L'écart est de 12 € et pas de 30 : on ne demande pas à un membre de doubler
  // sa dépense pour ajouter une couche, et un écart qu'il ne croit pas
  // discrédite le reste de la page — y compris ce qui est vrai.
  "communities.tier.example":
    "A worked example. Five hundred members, three in ten take the tier: 150 × 12 €, minus 150 seats at 7 €. About 750 € a month, on people whose acquisition you have already paid for.",
  "communities.tier.example_caption":
    "It says example because it is one: your price and your take-up decide the total, and both of those are yours. What is not an estimate is the 7 €, and that it only ever applies to the members who upgrade.",
  "communities.tier.billing":
    "You keep charging them where you already charge them. No member ever pays Sophia, or even sees us as something to pay for.",

  // ── LES BORNES, DITES ICI ET PAS APRÈS LE PRIX ───────────────────────────
  // Il arrive avec une question qu'il ne posera pas à voix haute : « qu'est-ce
  // que je vais devoir brancher, migrer, refaire ». La réponse est RIEN, et
  // elle vaut mieux que n'importe quel argument — mais seulement si on donne
  // aussi ce qu'on n'a pas, dans la même respiration. Un « non » découvert
  // après le chiffre annule le chiffre.
  "communities.tier.not_label": "And before you ask what you would have to rebuild: nothing",
  "communities.tier.not1_title": "No integration with your platform",
  "communities.tier.not1_body":
    "There is no Skool, Circle, Discord or Kajabi integration — none, and we would rather say it here than let you find out on day one. Members come in through an email invitation you send from your workspace. There is no link to copy, which is a security property rather than a missing button.",
  "communities.tier.not2_title": "No second social layer",
  "communities.tier.not2_body":
    "Members never see each other in Sophia: no feed, no rooms, no comments. It cannot become the place your people gather, because there is no such place in it. Your community is the social layer, and it stays yours.",
  "communities.tier.not3_title": "No checkout for your members",
  "communities.tier.not3_body":
    "You set the price of your tier, and you collect it where you already collect it. There is no member checkout anywhere in the product.",
  "communities.tier.not4_title": "Not a counter",
  "communities.tier.not4_body":
    "Energy numbers are off by default on a member's account, and a chain of guards decides whether they can be switched on at all. What comes back to them is what they ate, when, and how big.",

  // ── LES RÔLES — la section la plus facile à rater ────────────────────────
  // « Tes membres partent, on les retient » se lit comme « ta communauté ne
  // marche pas » — or elle marche : il a prouvé qu'il sait vendre du récurrent.
  // Et son objection n°1, rarement dite frontalement, est « si un bot répond,
  // plus personne ne se répond entre membres » : l'IA menace précisément le
  // mécanisme qu'il facture. La réponse n'est pas une promesse, c'est une
  // absence de surface — pas de fil, pas de salon, pas de commentaire.
  "communities.roles.kicker": "Why they stay",
  "communities.roles.title": "Keep the peers. Add the one thing a group was never going to do.",
  "communities.roles.body":
    "A community is good at what a community is good at: people going through the same thing at the same time, answering each other at midnight, noticing when someone drops off for a week. Sophia does not touch that, and could not take it if it tried — it has no feed and no rooms to take it into. What a group cannot do is answer one person, at 9pm, about the dinner actually in front of them.",
  "communities.roles.group_title": "Stays in your community",
  "communities.roles.group_body":
    "The peers. The culture you built. Your posts, your calls, the wins people put up on a Friday. That is what they joined for, and no agent produces it.",
  "communities.roles.agent_title": "Goes into their own lane",
  "communities.roles.agent_body":
    "The 9pm question about their own plate. The week built out of your method, for their kitchen and their schedule. And on the third quiet day, one message written from the method you published — that one is held outside 9pm to 8am, so it lands in their morning rather than on top of their evening.",

  // ── FIGURE C — le troisième jour ─────────────────────────────────────────
  "communities.fig_third_day.label": "THE THIRD QUIET DAY",
  "communities.fig_third_day.alt_title": "The third quiet day",
  "communities.fig_third_day.alt_desc":
    "A timeline. On the left, a member's last message. Three days with nothing on them. On the third day one message goes out, written from the coach's published method. Then the line runs bare again: only one is ever sent.",
  "communities.fig_third_day.last_label": "THEIR LAST MESSAGE",
  "communities.fig_third_day.last_value": "then nothing",
  "communities.fig_third_day.message_label": "ONE MESSAGE",
  "communities.fig_third_day.message_value": "in your method",
  "communities.fig_third_day.silence": "three quiet days",
  "communities.fig_third_day.after": "then it stops",
  "communities.roles.figure_caption":
    "Seventy-two hours of silence, one message, and then it stops: one per episode, and at most one a week. A member who slipped hears from you while they are still reachable, instead of the month their card is declined.",
  "communities.roles.close":
    "You are not choosing between us and another AI. You are choosing between one more room — still a room, still answered in public — and one more salary, who has to be taught your method and does not hold five hundred members.",

  // ── LE LUNDI — l'angle est le SILENCE ────────────────────────────────────
  // Dans un fil il ne voit que les bavards, et les dix qui postent cachent les
  // quatre-vingt-dix qui décrochent. Chaque ligne de la figure correspond à ce
  // que `renderSynthesisText` émet vraiment.
  "communities.monday.kicker": "What a thread never tells you",
  "communities.monday.title": "In a thread you only ever see the ten who post.",
  "communities.monday.body":
    "Ten people posting can hide ninety who quietly stopped, and nothing in a feed separates a member doing fine in silence from one who left in their head six weeks ago. On Monday you get one page, rendered from a template out of what actually happened and never narrated by a model, and the first thing on it is the people who said nothing.",

  "communities.fig_monday.alt_title": "The Monday page",
  "communities.fig_monday.alt_desc":
    "A schematic of the weekly page: first who is still talking — in touch, slipping, silent — then how the week was lived, and last how many members built themselves a week from the coach's method. The silent ones are on the first line, before anything else.",
  "communities.fig_monday.screen_title": "This week",
  "communities.fig_monday.contact_label": "WHO IS STILL TALKING",
  "communities.fig_monday.in_touch": "In touch",
  "communities.fig_monday.in_touch_hint": "answered within 2 days",
  "communities.fig_monday.slipping": "Slipping",
  "communities.fig_monday.slipping_hint": "quiet 2 to 5 days",
  "communities.fig_monday.silent": "Silent",
  "communities.fig_monday.silent_hint": "quiet 5 days or more",
  "communities.fig_monday.felt_label": "HOW THE WEEK WAS LIVED",
  "communities.fig_monday.holding": "Holding up",
  "communities.fig_monday.strained": "Strained",
  "communities.fig_monday.hard": "Having a hard time",
  "communities.fig_monday.unknown": "Not enough check-ins to say",
  // « built », le mot du moteur — jamais « wrote » (AUDIT B13 : la page
  // actuelle prétend citer et paraphrase).
  "communities.fig_monday.intent_line": "88 of 150 built themselves a week from your method.",
  "communities.monday.figure_caption":
    "A schematic of the Monday page. The thresholds are the product's own: quiet for two days opens slipping, five days opens silent, both measured on their last message in. The cohort is the example above — the 150 members of a 500-person community who took the tier.",
  "communities.monday.close":
    "And when there is not enough to say something, the page says so. A member who tapped twice has not given you a week, and comes back as “not enough check-ins” rather than as “doing fine”.",

  // ── LA VOIX — l'actif, et la seule section qui n'existe que sur cette page ─
  // Un propriétaire de communauté a une marque, un ton, des formules que ses
  // membres reconnaissent au premier paragraphe. Sa peur a un nom dans son
  // milieu : le « tone flattening », la voix lisse et vaguement
  // professionnelle. Il ne loue pas un modèle, il prête sa voix.
  //
  // ⚠️ On ne dit NI « votre marque » NI « votre nom sur les messages » (AUDIT
  // B18) : zéro personnalisation de marque existe, l'agent s'appelle Sophia
  // partout. Ce qui est vrai et suffit : ce sont VOS MOTS qui sortent.
  "communities.voice.kicker": "Your voice is the asset",
  "communities.voice.title": "It answers in your words. Not in ours, and not in a house style.",
  "communities.voice.body":
    "Your members can tell your writing from a generic health post at a glance, and that recognition is most of what they are paying for. So Sophia does not get a personality of its own — it gets your method: how you address people, how long you go on, the words you use and what you mean by them, the positions you hold, and what you say instead when someone asks for something you don't recommend. You write it once, in a guided interview, and you read back what it understood before any of it is published.",

  "communities.fig_voice.alt_title": "What Sophia holds of your voice",
  "communities.fig_voice.alt_desc":
    "Four fields of the doctrine as they are written: how you address people, one of your own terms with the meaning you give it, one red line, and what you say instead of that red line. The last card is opened by a rule, because it is the one your member receives.",
  "communities.fig_voice.screen_title": "Your voice",
  "communities.fig_voice.address_label": "HOW YOU SPEAK TO THEM",
  "communities.fig_voice.address_value": "First name, informal. Two or three sentences. No emojis.",
  "communities.fig_voice.term_label": "ONE OF YOUR TERMS",
  "communities.fig_voice.term_value1": "“Reset day” — a day you plan light on purpose.",
  "communities.fig_voice.term_value2": "Not a day you failed.",
  "communities.fig_voice.line_label": "ONE OF YOUR RED LINES",
  "communities.fig_voice.line_value": "Never recommend grazing between meals.",
  "communities.fig_voice.instead_label": "AND WHAT YOU SAY INSTEAD",
  "communities.fig_voice.instead_value1": "Three real meals. If you are hungry between them,",
  "communities.fig_voice.instead_value2": "the meal before was too small.",
  "communities.voice.traceable":
    "And when a member builds their own week out of your method, every line names the conviction it applies. The database refuses a line that names none — that is a constraint, not a convention.",
  "communities.voice.revise":
    "Revise any of it whenever you like, and roll back to an earlier version without losing what your members actually received.",
  "communities.voice.close":
    "Which raises the only question worth asking once you have handed your voice to software: what happens the day it writes something you would never write, in front of the people who know how you write.",

  // ── LE DOUBLE VERROU — le seul bloc sombre de la page ────────────────────
  // Il vient APRÈS la voix, parce qu'il protège l'actif qu'elle vient de
  // nommer : dans l'autre ordre, la garantie garderait quelque chose que le
  // lecteur n'a pas encore vu.
  //
  // ⚠️ FORMULATION B8b, ET PAS CELLE DES PAGES ACTUELLES. « La doctrine entre
  // à chaque message » est faux (B7 : `withKeelDoctrineBlock` n'a qu'un
  // appelant) et « chaque message sortant est scanné » est faux pour
  // « chaque » (B8 : 4 surfaces scannées, 4 non scannées — relance, récap du
  // soir, bilan du dimanche, broadcast). Ce qui reste, et qui est vrai, est
  // déjà l'argument le plus fort du produit.
  "communities.lock.kicker": "The part you should be most afraid of",
  "communities.lock.title":
    "An AI writing in your method, to your own members, is a risk. We treat it as one.",
  "communities.lock.body":
    "A prompt is an instruction, not a guarantee. Tell any model “never recommend grazing between meals” and it will comply almost always — and almost always is the wrong number when one public contradiction of you is the screenshot that gets posted in your own community. So your method is held twice, by two mechanisms that fail differently.",
  "communities.lock.lock1_tag": "Injected",
  "communities.lock.lock1":
    "Your method goes into the chat, into every week and into every meal Sophia writes.",
  "communities.lock.lock2_tag": "Read back",
  "communities.lock.lock2":
    "What it writes in the chat is read back against your red lines before it is sent. Deterministic, with no model in that loop. That one is the guarantee.",

  "communities.fig_lock.label": "ONE MESSAGE, READ BACK",
  "communities.fig_lock.alt_title": "What was held, and what went out",
  "communities.fig_lock.alt_desc":
    "Three moments, top to bottom: a member's question, the draft the read-back held because it contradicts a red line, and the message actually sent — the one the coach wrote instead. The third is opened by a rule, because it is the only one the member receives.",
  "communities.fig_lock.ask_label": "A MEMBER ASKS",
  "communities.fig_lock.ask_value": "Should I add a snack between lunch and dinner?",
  "communities.fig_lock.draft_label": "THE DRAFT SAID",
  "communities.fig_lock.draft_value": "A small snack mid-afternoon can help.",
  "communities.fig_lock.held": "held",
  "communities.fig_lock.sent_label": "WHAT WENT OUT",
  "communities.fig_lock.sent_value1": "Three real meals. If you are hungry between them,",
  "communities.fig_lock.sent_value2": "the meal before was too small.",
  "communities.lock.trace_note":
    "That replacement is not ours. Each red line carries what you do instead, in your words, and that is what your member receives.",
  "communities.lock.close":
    "Your member never gets a refusal, and never gets “ask in the group” — which would hand them straight back to the thread you added this layer to get past.",

  // ── LE PRIX ──────────────────────────────────────────────────────────────
  // Une seule carte : deux cartes obligent à faire une addition, et une
  // addition sur une page de vente est un endroit où se tromper. Le tarif
  // annuel est une LIGNE sous la carte — une modalité de paiement, pas une
  // seconde offre. ⚠️ Et il porte sur un SIÈGE payé à l'année, jamais sur
  // l'année d'un membre (AUDIT B2/B3) : c'est l'intervalle du coach.
  "communities.pricing.kicker": "Pricing",
  "communities.pricing.title": "One line, and only for the members who upgrade.",
  "communities.pricing.seat": "7 €",
  "communities.pricing.seat_period": "per member, per month",
  "communities.pricing.seat_label": "No platform fee. No setup. Nothing else.",
  "communities.pricing.annual": "6 € for a seat paid a year up front.",
  "communities.pricing.why":
    "You pay for the members you have put on the coached tier, and you stop paying the month you turn a seat off. The rest of your community costs you nothing, because they are not here.",
  // La meilleure ligne des trois pages de vente, et elle vaut double sur ce
  // marché : les taux de rétention qui circulent dans son écosystème sont des
  // chiffres de blogs d'éditeurs, sans échantillon ni méthode. Rien dans ce
  // dépôt ne mesure le churn contre un témoin. À CONSERVER (AUDIT B31).
  "communities.pricing.no_number":
    "We don't have a retention number to sell you, and we are not going to invent one. The number that decides this is yours: what one member who stays three months longer is worth, at your own price.",
  "communities.pricing.trial_note": "14 days, up to 3 members, then it stops on its own.",

  // ── LA CLÔTURE ───────────────────────────────────────────────────────────
  // Elle referme sur le titre du hero et sur la formule que la page a déjà
  // employée deux fois, « an answer of their own ». ⚠️ Pas de métaphore ici :
  // une clôture est la dernière phrase qu'on lit avant de cliquer, c'est le
  // pire endroit du site pour faire travailler le lecteur.
  "communities.closing.title":
    "You already have the members, the price and the method. What a thread cannot give them is an answer of their own.",
  "communities.closing.cta": "Start the 14-day trial",
  "communities.closing.signin_prompt": "Already using Sophia?",
  "communities.closing.signin_link": "Sign in",
  "household.title": "Your household",
  "household.empty.title": "Cook once, for everyone",
  "household.empty.body":
    "Add the people you cook for. One cooking session, portions that follow each person's own direction.",
  "household.create.name": "What do you call it?",
  // ── LE CHOIX DU MODE A DISPARU (lot 2, 2026-08-10) ────────────────────────
  // `household.create.kind.*` posait « famille ou colocation ? », et la réponse
  // gouvernait le droit de restreindre et la visibilité des objectifs. La
  // colocation est sortie du produit; les cinq clés sont parties avec elle au
  // lot 4, après vérification qu'aucune n'avait plus d'appelant.
  "household.create.submit": "Create the household",
  "household.members.title": "Who eats here",
  "household.members.owner": "Runs the household",
  "household.members.child": "Child",
  // ── LE MAÎTRE EST LA PREMIÈRE BOUCHE (lot 4) ─────────────────────────────
  // Il est un convive, pas un administrateur. Et c'est ce qui supprime une
  // falaise réelle: la composition refuse de démarrer tant qu'il n'a pas
  // d'objectif à lui, ce qu'on découvrait jusqu'ici APRÈS avoir saisi trois
  // personnes.
  "household.me.title": "You eat here too",
  "household.me.body":
    "Start with yourself: it is the same three things you will fill in for everyone else.",
  "household.me.unlock":
    "Your direction is also what lets us compose for the household. One minute now, and the plan is available.",
  "household.member.first_name": "First name",
  "household.member.first_name_hint": "How the plan names their portion.",
  "household.member.birth_date": "Date of birth",
  // L'ÂGE EST FACULTATIF ET GOUVERNANT. La phrase dit les deux, parce qu'un
  // champ facultatif dont l'absence change le repas sans le dire est un piège.
  "household.member.birth_date_hint":
    "Optional. Until we have it, they get a standard serving — a direction only applies at a known age.",
  "household.member.birth_date_kept":
    "Already on file. Leave this empty to keep it, or pick a new date to replace it.",
  // D18 (2026-08-12) — SUR SA PROPRE LIGNE, ce champ écrit `profiles.birth_date`,
  // la même colonne que « About you ». Sans cette phrase, on croit qu'il faut la
  // saisir deux fois — et le jour où les deux dates diffèrent, personne ne sait
  // laquelle sert.
  "household.member.birth_date_mine":
    "The same date as in your About you — filling it here fills it there. Optional, and until we have it you get a standard serving: a direction only applies at a known age.",
  "household.member.goal": "Their direction",
  "household.member.goal_mine": "Your direction",
  "household.member.goal_none": "No particular direction",
  "household.member.goal_inactive":
    "Saved, and not applied yet: a direction needs an age. Add their date of birth above.",
  // D1 (2026-08-11) — dès qu'une bouche a un compte, son objectif vit dans SON
  // « about you ». Le dire ici évite qu'on cherche un champ qui n'y est plus.
  "household.member.goal_from_profile":
    "Set in their own profile, under About you — it follows them everywhere, not just at this table.",
  "household.member.save": "Save",
  "household.member.saved": "Saved.",
  "household.member.edit": "Edit",
  "household.member.close": "Close",
  "household.member.remove": "Remove from the household",
  // ── DEUX GESTES, DEUX LIBELLÉS (chantier 2, D2) ──────────────────────────
  // Retirer l'accès et retirer du foyer ne font PAS la même chose, et la
  // différence est invisible si les deux s'appellent « retirer ». Le premier
  // laisse la personne à table; le second efface sa portion, ses allergies et
  // ses contraintes. Les phrases disent ce qui reste, pas ce qui part.
  "household.member.detach": "Remove their access",
  "household.member.detach_hint":
    "Removing their access signs them out of this household — they stay at the table, with their serving and their allergies. Removing them from the household deletes all of it.",
  "household.member.remove_hint":
    "This deletes their serving, their allergies and anything this house does not serve them.",
  // ── D14 (2026-08-12) · QUI EST LÀ, ET QUAND ──────────────────────────────
  // LE TITRE DIT « pas là », JAMAIS « absent ». Un enfant lit cet écran par
  // dessus l'épaule d'un parent, et « absences » est le vocabulaire de l'école
  // — c'est-à-dire d'un manquement. Manger ailleurs n'en est pas un.
  "household.away.title": "When they eat somewhere else",
  // CE QUE ÇA FAIT, ET SURTOUT CE QUE ÇA NE FAIT PAS. Sans la seconde phrase,
  // on croit qu'on annule la cuisson du samedi pour tout le monde.
  "household.away.hint":
    "Untick the meals they will not be eating here. Nothing is cancelled for anyone else — we simply cook for one less that day.",
  "household.away.open": "Mark when they are away",
  "household.away.open_count": "Marked on {n} meals — change",
  // CE QU'ILS ONT DIT EUX-MÊMES. Le maître doit voir le FAIT, pas seulement sa
  // propre marque: sans cette ligne, il re-marquerait par-dessus, ou
  // s'étonnerait d'une assiette manquante qu'il n'a pas demandée.
  "household.away.self_declared": "They already told us themselves: {days}.",
  "household.goal.fat_loss": "Losing fat",
  "household.goal.muscle_gain": "Building muscle",
  "household.goal.recomposition": "Recomposition",
  "household.goal.performance": "Performance",
  "household.goal.health": "Health",
  "household.goal.maintenance": "Staying where they are",
  "household.add.title": "Add someone who eats here",
  "household.add.body":
    "No account, no invitation, no waiting for anyone. A first name is enough to start.",
  "household.add.submit": "Add them",
  // LE PLAFOND REND SON MOTIF, il ne grise pas un bouton en silence. La limite
  // vit en base (`household_full`), pas ici: cet écran ne fait que la dire.
  "household.add.full":
    "Eight is the most a household can hold. Every mouth is another serving to compose at each generation.",
  // ── LE CORPS DE CHAQUE BOUCHE (2026-08-12) ───────────────────────────────
  //
  // ⚠️ CE QUE CES LIBELLÉS N'ONT PAS LE DROIT DE DIRE. Pas un objectif, pas une
  // catégorie, pas un besoin, pas un chiffre calculé. Le titre parle de ce
  // qu'on SERT, jamais de ce que quelqu'un EST — cet écran est ouvert devant la
  // famille, et un enfant le lit par-dessus l'épaule d'un parent.
  "household.body.title": "How much to serve them",
  // LA PHRASE QUI JUSTIFIE LA DEMANDE, ET LA SEULE QUI SOIT VRAIE. Sans elle,
  // on demande le poids d'un enfant sans dire pourquoi — et la seule raison
  // qu'un lecteur imagine alors est la mauvaise.
  "household.body.hint":
    "A palm of chicken is not the same palm on a six-year-old and on a grown-up. We use this to work out how much of the same dish goes on each plate — nothing else. It is never shown at the table, never said out loud, and never turned into a target.",
  "household.body.height": "Height (cm)",
  "household.body.weight": "Weight (kg)",
  "household.body.gender": "Sex",
  "household.body.gender_female": "Female",
  "household.body.gender_male": "Male",
  "household.body.gender_other": "Other",
  "household.body.save": "Save",
  "household.body.saved": "Saved.",
  // TOUT-OU-RIEN, DIT À L'ÉCRAN COMME EN BASE. Un demi-corps n'existe pas.
  "household.body.missing":
    "We do not have this yet — until we do, they get a standard serving of whatever the house cooks.",
  "household.body.needs_birth_date":
    "Add their date of birth above too: how much a growing child needs is not worked out the same way as for a grown-up.",
  "household.error.body_incomplete":
    "We need all three — height, weight and sex. Two out of three cannot size a plate.",
  "household.error.bad_height": "That height is not one we can use.",
  "household.error.bad_weight": "That weight is not one we can use.",
  "household.error.bad_gender": "That is not one of the options.",
  // ── LE MEMBRE DE RÉFÉRENCE (FF-043) ──────────────────────────────────────
  //
  // ⚠️ LE LIBELLÉ DIT QUI, JAMAIS POURQUOI, et il ne nomme AUCUN objectif.
  // « Whose way of eating the shared dish follows » est une phrase de méthode;
  // « qui est au régime » serait un verdict lu par toute la table.
  //
  // ⚠️ ET IL NE PROMET PAS DE PORTION. Le référent ne change pas la taille de
  // la casserole — elle se dimensionne sur le plus petit besoin de la table.
  // Une copie qui laisserait croire l'inverse vendrait exactement le défaut que
  // FF-043 existe pour empêcher.
  "household.reference.title": "Whose way of eating the shared dish follows",
  "household.reference.hint":
    "When two grown-ups here follow different methods, the shared dish can only follow one of them. Pick whose. It changes what we cook, never how much anyone gets — helpings are worked out per person either way.",
  // LE DÉFAUT, NOMMÉ. « Personne » se lirait comme une panne.
  "household.reference.default": "Whoever is composing that week",
  "household.reference.saved": "Saved.",
  // LES DEUX REFUS QUE LA CIBLE PEUT PRODUIRE. Ils sont rares (le sélecteur ne
  // propose que des adultes) et ils arrivent: deux onglets, ou une date saisie
  // entre le chargement et le clic.
  "household.error.minor_cannot_be_reference":
    "The shared dish follows a grown-up's method, not a child's.",
  "household.error.age_unknown_cannot_be_reference":
    "Add their date of birth first — without it we do not know whether they are a grown-up.",
  "household.error.not_your_household": "That is not your household.",
  "household.error.bad_first_name": "A first name is between 1 and 40 characters.",
  "household.error.bad_birth_date": "That date is in the future.",
  "household.error.bad_goal": "That direction is not one we know.",
  "household.error.bad_label": "That is either empty or too long (120 characters).",
  // LA FORME EST REFUSÉE, LE CONTENU NE L'EST PAS: un jour qu'on ne reconnaît
  // pas est écarté à la lecture, sans faire tomber le reste (FF-002 §7). Ce
  // motif-ci ne devrait donc jamais atteindre quelqu'un qui passe par la
  // grille — il dit qu'un client a envoyé autre chose qu'une liste.
  "household.error.bad_away": "We could not read those days.",
  "household.error.household_full":
    "Eight is the most a household can hold. Remove someone first.",
  "household.error.not_owner": "Only the person who runs the household can do this.",
  "household.error.not_a_member": "That person is not in your household.",
  "household.error.not_your_line": "You can only change your own line.",
  "household.error.no_household": "You are not in a household.",
  "household.error.cannot_remove_owner":
    "The person who runs the household cannot be removed from it.",
  "household.error.cannot_detach_owner":
    "The person who runs the household cannot lose access to it — nobody else could compose a meal.",
  "household.error.not_claimed":
    "They have no account here, so there is no access to remove.",
  "household.error.not_found": "That is already gone.",
  // ── LES DEUX NATURES D'UNE CONTRAINTE, DEMANDÉES À L'ÉCRAN ───────────────
  // La question n'est pas une commodité de rangement: la réponse change ce que
  // le produit fait. Une allergie gouverne toute la casserole et rien ne se
  // compose sans elle; une règle de maison est une décision du foyer, gardée
  // telle quelle, et jamais présentée comme un conseil de santé.
  "household.constraint.kind": "What is it?",
  "household.constraint.kind.allergy": "An allergy",
  "household.constraint.kind.allergy_hint":
    "Medical. It rules the whole pot, for everyone at the table, and nothing gets cooked without it.",
  "household.constraint.kind.house_rule": "Something this house does not serve",
  "household.constraint.kind.house_rule_hint":
    "Your call as the household. We keep it, and we never dress it up as health advice.",
  "household.allergy.placeholder": "Peanuts",
  "household.allergy.add": "Add the allergy",
  "household.allergy.remove": "Remove",
  // ── L'INVITATION EST UNE RÉCLAMATION DE PROFIL (lot 6) ───────────────────
  // Elle n'ajoute personne au foyer: elle donne à quelqu'un le moyen de poser
  // son compte sur une ligne QUI EXISTE DÉJÀ. D'où la question « qui ? » avant
  // « quelle adresse ? », et d'où `household.invite.grants`, qui dit au maître
  // ce qu'il est en train de promettre — c'est lui qui écrit le message
  // d'accompagnement, et une promesse que la base dément est la sienne.
  "household.invite.title": "Let someone claim their profile",
  "household.invite.body":
    "Their portions, their allergies and what this house does not serve are already on their line. Claiming it attaches their account to that same line — nothing is created, nothing is lost.",
  "household.invite.grants":
    "What they get: they read the household plan and set their own direction. Not: composing, adding or removing anyone, or deciding what the house does not serve.",
  "household.invite.who": "Who is this for?",
  "household.invite.who_hint":
    "Only people who have no account yet are listed. The link claims that exact line.",
  "household.invite.nobody_left":
    "Everyone here already has an account. Add someone first, then invite them.",
  "household.invite.email": "Their email",
  "household.invite.submit": "Create the invitation",
  // ⚠️ `{name}` EST LOAD-BEARING: le maître émet plusieurs liens dans la même
  // minute, et un lien anonyme part à la mauvaise personne.
  "household.invite.link_ready":
    "Send this link to claim {name}'s profile. It works once, for that address, and expires in 14 days.",
  "household.invite.error.rate_limited": "That is enough invitations for today.",
  "household.invite.error.bad_email": "That address does not look usable.",
  "household.invite.error.not_owner": "Only the person who runs the household can invite.",
  "household.invite.error.already_claimed":
    "That line already has an account on it. Nothing to claim.",
  // ── LE CONSENTEMENT A DISPARU (lot 2, 2026-08-10) ────────────────────────
  // `household.consent.*` et `household.join.consent_notice` décrivaient un
  // majeur qui accorde puis révoque le droit d'être restreint. Le modèle arrêté
  // le 2026-08-08 dit qu'une seule personne gouverne le menu; LA CONTREPARTIE
  // est plus bas et elle est toujours là — `notice_owner` nomme qui a décidé.
  // Six clés retirées au lot 4, après vérification qu'aucune n'avait plus
  // d'appelant hors de ce fichier.
  "household.restriction.title": "Foods this household does not serve",
  "household.restriction.add": "Add it",
  // `household.restriction.for_whom` est partie au lot 4: la contrainte se pose
  // sur la ligne de la personne qu'on regarde, il n'y a plus de sélecteur.
  "household.restriction.placeholder": "Nutella",
  "household.restriction.notice_owner": "Not served here — {owner} decided that.",
  "household.restriction.notice_me": "You decided that.",
  "household.restriction.remove": "Remove",
  // `household.restriction.blocked.*` (quatre clés) est parti au lot 4.
  // `restrictionBlock` les rendait: il anticipait le refus de la base pour
  // griser un bouton, sur des règles qui n'existent plus (colocation,
  // consentement du majeur). Les refus que la base rend encore sont
  // structurels, et ils passent par `household.error.*` ci-dessus.
  // ── LES ENVIES (lot 5, 2026-08-10) ──────────────────────────────────────
  // CINQ CLÉS SONT PARTIES AVEC LE CONSEIL DE FAMILLE: `envy.saved` (déjà
  // orpheline), `envy.spoken`, `envy.silent` et `compose.silent_note` — les
  // trois dernières rendaient un décompte de silencieux, qui se lit « il en
  // reste 3 à relancer » quoi qu'on écrive à côté.
  //
  // ⚠️ NE PAS LES REMETTRE SOUS UNE AUTRE FORME. « 2/5 ont répondu », une
  // pastille, un bouton « relancer »: tous recréent la charge mentale que le
  // produit promet de supprimer.
  //
  // Le « tu » de l'ancienne copie a disparu du même geste: la ligne n'est plus
  // ce dont L'AUTEUR a envie, c'est ce dont LE FOYER a envie, écrit par la
  // personne qui tient la maison pour tout le monde.
  "household.envy.title": "What does the house feel like this week?",
  "household.envy.body":
    "One line, for everyone. Write it before the plan is made — nobody else has to fill anything in, and leaving it empty is fine.",
  "household.envy.placeholder": "Lea wants pasta, Marc is sick of chicken.",
  "household.envy.save": "Save it",
  "household.compose.title": "Make this week's plan",
  "household.compose.body":
    "One cooking session, portions that follow each person's direction, and the shopping split by when it has to be fresh.",
  "household.compose.submit": "Compose for the household",
  "household.compose.working": "Composing...",
  "household.portions.title": "At the table",
  "household.portions.standard": "A standard serving",
  // ── LA PAUSE (chantier 3, D4) ────────────────────────────────────────────
  //
  // L'ORDRE DES PHRASES EST LA DÉCISION. « Rien n'est perdu » vient AVANT « ce
  // qui s'arrête », parce que c'est la première peur de quelqu'un qui a saisi
  // huit personnes, leurs âges et leurs allergies — et parce que c'est vrai:
  // D4 gèle, n'efface jamais. L'inverse (« votre accès est suspendu ») produit
  // la conviction que les données sont parties, et cette conviction ne se
  // rattrape pas avec un second paragraphe.
  //
  // AUCUN MONTANT, AUCUNE DATE. Le prix vit derrière le tunnel Stripe, qui en
  // est la source; l'écrire ici en ferait une seconde, celle qui ment le jour
  // où un humain prolonge un essai à la main.
  //
  // AUCUN REPROCHE. « Votre paiement a échoué » accuse quelqu'un dont la carte
  // a expiré pendant ses vacances. On dit l'état, et le geste.
  "household.paused.title": "Your household is paused",
  "household.paused.body":
    "New weeks are not being composed right now. Everything else still works — your current plan, this page, and the chat.",
  "household.paused.kept":
    "Nothing has been deleted. Everyone here, their ages, their allergies and their directions are exactly where you left them, and they come straight back.",
  "household.paused.resume_cta": "Start it again",
  "household.paused.working": "Opening...",
  // Un profil réclamé ne porte pas la carte: c'est le compte maître qui paie
  // (12,99 € le foyer, +2 € par profil réclamé). Lui montrer un bouton refusé
  // par le serveur serait la version « écran » du défaut que ce lot retire.
  "household.paused.owner_only":
    "Whoever set this household up can start it again from their own account.",
  // ── /join-household — RÉCLAMER SON PROFIL (lot 6) ────────────────────────
  //
  // DEUX MOITIÉS, MÊME POIDS. « Ce que ça donne » et « ce que ça ne donne
  // pas » sont côte à côte parce qu'une seule personne gouverne le menu, et
  // que ce choix est INVISIBLE si on ne l'écrit pas: quelqu'un qui réclame en
  // croyant pouvoir composer l'apprendrait par un bouton absent.
  //
  // Aucune phrase ici ne parle de ce qui est « bon » pour quelqu'un — même
  // règle que le reste du bloc foyer: le domestique et l'épistémique ne se
  // mélangent jamais.
  //
  // ⚠️ NAMESPACE `household_claim` ET NON `household`, alors que la page est
  // voisine. La raison est la frontière de traduction (i18n/catalog.ts): cette
  // page est PUBLIQUE — elle s'ouvre sans compte — donc elle appartient à la
  // liste des surfaces de vitrine pas encore traduites. `household.*`, lui,
  // vit dans le produit connecté, anglais par choix et sans dette. Les mêler
  // ferait croire à une traduction due pour tout l'écran du foyer.
  "household_claim.seo_title": "Claim your profile — Sophia",
  "household_claim.seo_description":
    "Attach your account to the line someone already set up for you in their household.",
  "household_claim.checking": "Checking this link...",
  "household_claim.title": "{name}'s place in {household}",
  "household_claim.lead":
    "Someone already set up this line: {name}'s first name, allergies, and what the house does not serve. Claiming it attaches your account to that same line — it does not create a second one, and nothing already on it is lost.",
  "household_claim.gains_label": "What claiming gives you",
  "household_claim.gains_1": "You read what the household is cooking, and your own serving.",
  "household_claim.gains_2":
    "You set your own direction — losing fat, building muscle, or none — and your serving follows it.",
  "household_claim.gains_3": "Your first name, your allergies and your line stay yours.",
  "household_claim.limits_label": "What it does not give you",
  "household_claim.limits_1":
    "You do not compose the plan, and you do not add or remove anyone. One person runs the menu.",
  "household_claim.limits_2":
    "You do not decide what the house does not serve — and whoever does is named on screen, never hidden.",
  "household_claim.signed_in_as": "You are signed in as {email}.",
  "household_claim.submit": "Claim this profile",
  "household_claim.working": "Claiming...",
  "household_claim.signed_out.body":
    "This invitation was sent to {email}. Sign in with that address to claim it — the account has to match.",
  "household_claim.signed_out.cta": "Sign in and claim",
  // ── LA PORTE D'INSCRIPTION (chantier 4, D1) ──────────────────────────────
  //
  // Elle remplace `signed_out.no_account`, qui DISAIT le trou plutôt que de le
  // cacher: « signing up on your own is not open today ». Ce n'est plus vrai.
  //
  // ⚠️ AUCUNE de ces phrases ne promet un produit d'élève. Réclamer une place
  // donne à lire le foyer et à poser SON objectif; le reste — composer,
  // ajouter, retirer, restreindre — appartient au compte maître, et les deux
  // moitiés sont déjà côte à côte plus haut sur le même écran.
  "household_claim.signed_out.or": "No account on that address yet?",
  "household_claim.signup.cta": "Create my account",
  "household_claim.signup.title": "Create the account for {email}",
  "household_claim.signup.lead":
    "This address is the one the invitation was sent to, and the only one that can claim this place. Your account is yours — the household does not read your password, and you can leave at any time.",
  "household_claim.signup.email_label": "Email address",
  "household_claim.signup.email_hint":
    "Fixed by the invitation. Claiming with another address is refused.",
  "household_claim.signup.name_label": "Your name",
  "household_claim.signup.name_hint":
    "On your account. The first name on the household line stays as it was set up.",
  "household_claim.signup.password_label": "Password",
  "household_claim.signup.password_hint": "At least 8 characters.",
  // LE PAYS. Le `hint` dit à quoi il sert: quelqu'un qui comprend pourquoi on
  // le demande répond juste. Il n'est JAMAIS déduit de la langue — un compte
  // sans pays reçoit la ligne d'écoute d'un autre pays.
  "household_claim.signup.country_label": "Country",
  "household_claim.signup.country_hint":
    "Where you live. Used for crisis helplines and local formats — never guessed from your language.",
  "household_claim.signup.country_placeholder": "Choose a country",
  "household_claim.signup.legal_prefix": "I accept the",
  "household_claim.signup.legal_terms": "Terms",
  "household_claim.signup.legal_and": "and the",
  "household_claim.signup.legal_privacy": "Privacy Policy",
  "household_claim.signup.submit": "Create my account and claim",
  "household_claim.signup.submitting": "Creating your account...",
  "household_claim.signup.error.legal":
    "Please accept the Terms and the Privacy Policy to continue.",
  "household_claim.signup.error.country":
    "Please choose the country you live in. It decides which helpline you are given, so it is never guessed.",
  "household_claim.signup.error.existing":
    "There is already an account on this address. Sign in instead — your place is waiting.",
  "household_claim.signup.closed":
    "Creating an account is closed right now (pre-launch). If you already have one, sign in above.",
  "household_claim.signup.check_email.title": "Confirm your email address",
  "household_claim.signup.check_email.body":
    "Your account is created. Click the link we just sent to {email}, then open your invitation link again — claiming your place needs a confirmed address.",
  "household_claim.country.required_lead":
    "One thing is missing on your account before you can claim this place.",
  "household_claim.no_token.title": "This link is incomplete",
  "household_claim.no_token.body":
    "The address is missing its invitation code. Open the link you were sent in full, or ask for a new one.",
  "household_claim.refused.title": "This link cannot be used",
  "household_claim.refused.generic":
    "We could not use this invitation. Ask for a new one.",
  "household_claim.refused.unknown_token":
    "We do not recognise this invitation. Check that you copied the whole link, or ask for a new one.",
  "household_claim.refused.expired": "This invitation has expired. Ask for a new one.",
  "household_claim.refused.already_used":
    "This invitation has already been used. If that was you, sign in — your place is waiting.",
  "household_claim.refused.already_claimed":
    "That line already has an account on it. If it is yours, sign in.",
  "household_claim.refused.email_mismatch":
    "This invitation was sent to a different address. Sign in with the one it was sent to.",
  "household_claim.refused.already_in_household":
    "Your account is already in a household, and an account belongs to one household at a time.",
  // LES DEUX MOTIFS DE PAYS (chantier 4). `country_required` n'est PAS une
  // impasse à l'écran: la page montre alors le sélecteur. Le libellé existe
  // pour le cas où le refus revient quand même — une garde sans phrase est une
  // page muette.
  "household_claim.refused.country_required":
    "Your account does not say which country you live in, and a place in a household cannot be claimed without it — it decides which helpline you are given.",
  "household_claim.refused.bad_country":
    "That country code was not understood. Pick one from the list.",
  "household_claim.refused.not_authenticated":
    "Your session ended before we could finish. Sign in and open the link again.",
  "household_claim.refused.unreachable":
    "We could not reach the server. The invitation is fine — reload the page and try again.",
  "household_claim.refused.ask_again":
    "Whoever runs that household can send a new link in a few seconds.",
  "household_claim.done.title": "You are in {household}",
  "household_claim.done.body":
    "Your account is attached to the line that was already set up for you. Set your direction whenever you like — it changes your serving, not anyone else's.",
  "household_claim.done.cta": "Open the household",
  "household_claim.home_link": "Back to the home page",
  // ── FF-001 — LES GESTES QUOTIDIENS DU COACH ──────────────────────────────
  // La doctrine dit comment COMPOSER; elle ne dit nulle part quoi FAIRE tous
  // les jours. Cette carte est le seul endroit du produit où un coach peut
  // écrire « quatre verres d'eau » — une règle qui gouverne une journée et
  // qu'aucune ligne de plan ne peut porter.
  "coach.practices.title": "What you tell everyone, every day",
  "coach.practices.intro":
    "The habits you repeat to every student. One of them goes out with their evening message — a different one each night, in your voice, never a form to fill in.",
  "coach.practices.empty":
    "Nothing here yet. Your method says how to build a plate; this is where you say what to do with a day.",
  "coach.practices.add_placeholder": "e.g. Four glasses of water across the day",
  "coach.practices.add_button": "Add",
  "coach.practices.adding": "Reading it…",
  "coach.practices.full": "Seven is the most a rotation can carry before your students stop being able to tell one evening from the next.",
  // ⚠️ LE NOMBRE EST UNE LONGUEUR DE CYCLE, PAS UN COMPTE DE PRATIQUES, et la
  // première rédaction disait « 3 practices » sur trois pratiques dont une
  // bloquée et une comptant double. Le chiffre était juste et la phrase fausse:
  // le coach lisait « mes trois pratiques partent » sur une méthode qui n'en
  // sert que deux. C'est exactement le genre de nombre que ce dépôt refuse
  // ailleurs (« 5 des 3 » dans le message du soir).
  "coach.practices.rotation_one": "One practice — it goes out every evening.",
  "coach.practices.rotation_many":
    "A different one each evening — the rotation comes back round every {count} days.",
  "coach.practices.reach_label": "Goes to",
  // Le verdict de la classification est MONTRÉ et CORRIGEABLE: c'est la moitié
  // de la valeur du stockage (même patron que `coach_food_proposals`).
  "coach.practices.verdict_label": "What I understood",
  "coach.practices.brief_label": "What gets conveyed",
  "coach.practices.needs_review":
    "I could not read this one well enough to send it. Check the fields below, or rewrite the line and add it again.",
  "coach.practices.reclassify": "Read it again",
  "coach.practices.remove": "Remove",
  "coach.practices.askable_label": "Can become a question",
  "coach.practices.askable_hint":
    "On evenings when the daily message asks nothing else, this one can end in a question. Never two questions in one message.",
  "coach.practices.minor_safe_label": "Safe for students under 18",
  "coach.practices.minor_safe_hint":
    "Minors get the practice without any number — the habit, never the dose.",
  "coach.practices.constant_label": "One of my cornerstones",
  "coach.practices.constant_hint": "Cornerstones come round about twice as often as the rest.",
  "coach.practices.scope_label": "Only for students who are",
  "coach.practices.scope_everyone": "Everyone",
  "coach.practices.blocked_title": "This one cannot go out",
  "coach.practices.no_method":
    "Practices travel in your voice, so they only go out once you have published a method. Write one above first.",

  "household.waves.title": "Shopping",
  "household.waves.now": "Buy now",
  "household.waves.on": "Buy on {date}",
  "household.waves.reason": "for the {day} cooking",

  // ══════════════════════════════════════════════════════════════════════════
  // L8 — LES ÉCRANS DE LA FUSION (D9)
  //
  // Autorité produit: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md.
  //
  // ── LA RÈGLE D'ÉCRITURE DE TOUT CE BLOC ─────────────────────────────────
  // On dit la DIVERGENCE, jamais la personne comme fautive. « Le plan de Zoé
  // n'a pas pu être fusionné » est faux ET blessant: rien n'a échoué, deux
  // directions ne se servent simplement pas de la même casserole. Chaque
  // phrase ci-dessous nomme un FAIT (« son plan couvre les mêmes jours ») et
  // jamais une défaillance.
  //
  // ── CE QU'AUCUNE PHRASE D'ICI N'A LE DROIT DE DIRE ──────────────────────
  // Un objectif, un poids, un nombre de calories, le « pourquoi » d'un plat.
  // Le plan du foyer est lu À VOIX HAUTE PAR TOUT LE FOYER. Les gardes de
  // non-divulgation du serveur (`household_voices.ts`, `household_portions.ts`)
  // portent ces termes; les contredire à l'écran annulerait les deux.
  // ══════════════════════════════════════════════════════════════════════════

  // ── LA PROPOSITION DE FUSION (D8, D10) — compte maître seulement ────────
  "household.merge.title": "Someone is cooking on their own",
  "household.merge.body":
    "They built a plan of their own and validated it. You can fold it into the household plan, or leave it — in every case they keep their plan.",
  // L'ÉTAT « RIEN À MONTRER », RÉDIGÉ. Ce dépôt a mesuré qu'un écran qui se
  // vide est son pire échec: sans cette phrase, « personne n'a pris la main »
  // et « la lecture a échoué » seraient le même blanc.
  "household.merge.none":
    "Nobody in the household is cooking on their own right now. Everyone eats from the household plan.",
  "household.merge.merge_cta": "Fold their plan in",
  "household.merge.unmerge_cta": "Rebuild without them",
  "household.merge.dismiss_cta": "Leave it",
  "household.merge.working": "Working...",
  // D8 — L'AVERTISSEMENT. Il parle du plan DU MAÎTRE, pas de celui d'un autre:
  // sa ligne vivante contient la reprise d'un plan que l'intéressé a remplacé.
  "household.merge.revalidated_title": "A plan you folded in has moved on",
  "household.merge.revalidated_body":
    "The household plan still cooks what they had validated when you folded it in. They have validated a newer one since.",
  // D16 — la fenêtre, en clair. Les nombres viennent du serveur; l'écran les
  // range dans une phrase, il n'en recalcule aucun.
  "household.merge.window": "Days that would be folded in: {days}, from {from}.",
  "household.merge.window_past": "{days} of their days are already behind us.",
  // D1 — LA MOITIÉ DU GESTE QUE « jours repris » NE DIT PAS. Quand leur plan
  // s'arrête avant la fin de la semaine du foyer, la fusion refait la semaine
  // jusqu'au bout: sans ça, la fin de semaine se retrouverait sans aucun plan.
  "household.merge.window_rebuilt":
    "The household's {days} remaining days get rebuilt, so the end of the week keeps a plan.",
  "household.merge.unmerge_window": "Rebuilding would redo {days} day(s) from {from}.",
  // ── L7/D11 — LE PLAFOND, VISIBLE AVANT D'ÊTRE ATTEINT ───────────────────
  // « 2 fusions restantes cette semaine » est une ligne de L8, écrite parce
  // qu'un plafond qui ne se voit qu'au moment du refus se lit comme une panne.
  "household.merge.quota_left": "{remaining} of {limit} merges left this week.",
  "household.merge.quota_none":
    "This household has used all {limit} of its merges for the week. Nothing is lost — it starts again on {date}.",
  // D17 — LE RÉGLAGE DISCRET. Assumé « un peu brutal », donc il ne vit pas sur
  // la carte de proposition: il est rangé dans la fiche de la personne.
  "household.merge.mute": "Stop suggesting I merge their plan",
  "household.merge.mute_hint":
    "Their plan still exists and you can still fold it in whenever you want. You just stop being asked.",
  "household.merge.unmute": "Suggest their plan again",
  "household.merge.muted": "You are not being asked about their plan.",
  // POURQUOI LES AUTRES BOUCHES N'APPARAISSENT PAS. Jamais un silence: le
  // serveur nomme chaque motif, l'écran le rend.
  "household.merge.skipped_title": "Not being suggested",
  "household.merge.skip.member_is_owner": "This household's plan is already yours.",
  "household.merge.skip.no_validated_plan":
    "They have not validated a plan of their own.",
  "household.merge.skip.proposals_muted": "You asked not to be asked about them.",
  "household.merge.skip.dismissed_by_owner":
    "You left this one. If they validate another plan, the question comes back.",
  "household.merge.skip.already_merged":
    "Their plan is already folded into the household plan.",
  "household.merge.skip.merge_quota_exhausted":
    "The household has used its merges for this week.",
  // CE QUE LA PROCHAINE COMPOSITION REPRENDRA D'OFFICE (la fusion est
  // collante, L5). Sa PORTÉE compte: hors de cette fenêtre, elle ne colle pas.
  "household.merge.held": "Folded in until {to}: the next plan for those days keeps them.",
  "household.merge.frozen":
    "The household is paused, so nothing new can be composed. What is below is still true.",
  "household.merge.load_failed":
    "The suggestions could not be read. Nothing is shown rather than something wrong.",
  // LE MAÎTRE ACCÈDE À TOUS LES PLANS — mais sa surface de cuisine n'affiche
  // que celui qu'il cuisine (D9). D'où un dépliant, et jamais une carte.
  "household.merge.open_plan": "See what their plan cooks",
  "household.merge.close_plan": "Hide their plan",
  "household.merge.plan_empty": "Their plan has no dish we can read.",
  "household.merge.plan_unreadable": "Their plan could not be read.",

  // ── CE QUI N'A PAS FUSIONNÉ, ET POURQUOI (D9, seconde moitié) ───────────
  "household.plan.title": "What this plan cooks, and for whom",
  // LA PHRASE PÉDAGOGIQUE DU LOT, mot pour mot l'arbitrage: ce n'est pas le
  // système qui est nul, c'est la recherche d'un compromis qui est difficile.
  "household.plan.divergence":
    "Nothing failed here. Two directions cannot always come out of the same pan — when they cannot, they are cooked apart.",
  "household.plan.taken":
    "{name} is eating from a plan of their own over these days, so this one does not cook for them.",
  "household.plan.partial":
    "{name} has a plan of their own that covers only part of these days, so this one still cooks for them.",
  "household.plan.reclaimed": "{name}'s plan was folded into this one.",
  "household.plan.unmerged": "This plan was rebuilt without {name}.",
  // L5 §4 — `covers_window: false` était tracé et rien n'agissait dessus.
  // C'est le seul endroit du produit où quelqu'un peut apprendre qu'une
  // personne n'a rien à manger certains jours.
  "household.plan.unmerged_uncovered":
    "Their own plan does not cover every one of those days.",
  // O5 — LE BARREAU DEMANDÉ N'A PAS ÉTÉ TENU. Le serveur le CONSTATE et ne
  // corrige pas; le taire ici laisserait un plan qui se contredit lui-même.
  "household.plan.merge_shape_unmet":
    "This merge asked for something cooked apart, and what came back is one pot for everyone. Check the portions before you serve.",
  "household.plan.no_dishes":
    "This plan has no dish we can read. Compose it again from the household page.",

  // ── LE PLAN DU FOYER, VU PAR UN SECONDAIRE ──────────────────────────────
  "household.plan.member_title": "What the household is cooking",
  "household.plan.member_excluded":
    "These days you are eating from your own plan, so the household plan does not cook for you.",

  // ══════════════════════════════════════════════════════════════════════════
  // L8/O2 — LA GÂCHETTE: PRENDRE LA MAIN (D2, D7)
  //
  // Sans ce bouton, `keel_validate_meal_plan` n'a AUCUN appelant: personne ne
  // peut prendre la main, donc rien n'est jamais proposé, donc ni fusion ni
  // défusion n'existent pour un vrai utilisateur. Sept lots de serveur
  // reposent dessus.
  //
  // ── LA POSTURE PAR DÉFAUT N'EST PAS UN REPROCHE ─────────────────────────
  // Ne rien faire est le cas NORMAL et le plus courant: on est composé dans le
  // plan du foyer comme une bouche ordinaire. Aucune phrase d'ici ne doit
  // laisser croire qu'il faut prendre la main pour bien faire.
  // ══════════════════════════════════════════════════════════════════════════
  "plan.hand.title": "You are cooked for by the household",
  "plan.hand.body":
    "By default the household plan feeds you, and that is the ordinary way to be here. If you would rather cook your own, build a plan below and take it on — then you cook it and you shop for it.",
  "plan.hand.take_cta": "Cook this one myself",
  "plan.hand.taking": "Taking it on...",
  "plan.hand.taken_title": "You are cooking this one",
  "plan.hand.taken_body":
    "The household plan does not cook for you over these days. Whoever runs the household can suggest folding this into it — you keep it either way.",
  "plan.hand.taken_on": "Taken on {date}.",
  // Le geste est IDEMPOTENT côté base: revalider ne redate pas. `already`
  // n'est donc pas un échec, c'est « c'était déjà fait » — et le traiter comme
  // une erreur ferait paniquer sur un double-clic.
  "plan.hand.already": "That plan was already yours to cook.",
  "plan.hand.owner_note":
    "You run this household, so the plan you cook is the household one. Compose it from the household page.",

  // ── LES REFUS NOMMÉS DU SERVEUR, TRADUITS (dette L1, L2, L3, L4, L5, L7) ──
  //
  // Chaque lot serveur a nommé son refus PUIS laissé l'écran afficher le jeton
  // brut. C'est ici que la dette se solde. Liste FERMÉE, et un test de dérive
  // lit les fonctions edge: un refus ajouté côté serveur sans étiquette ici
  // fait rougir la suite au lieu de sortir en jargon devant quelqu'un.
  "plan.refusal.household_frozen":
    "This household is paused, so no new week is composed. Nothing has been deleted.",
  "plan.refusal.no_household": "You are not in a household.",
  "plan.refusal.not_owner": "Only whoever runs the household can do this.",
  "plan.refusal.empty_household": "There is nobody at this table yet.",
  "plan.refusal.goal_required":
    "Set a direction and a situation first — that is what the whole plan is built on.",
  "plan.refusal.no_coach":
    "There is no published method to cook from yet.",
  "plan.refusal.local_day_unresolved":
    "We could not tell what day it is where you are, and a plan is counted in days.",
  "plan.refusal.window_required": "That request named no days to cover.",
  "plan.refusal.bad_window": "Those days could not be read.",
  // C2 ② — refusé AVANT le modèle. Un départ au-delà de dimanche fabriquait une
  // consigne contradictoire (« today is: wed » à côté de « days to fill: tue »),
  // et le modèle refusait après 6,2 s facturées.
  "plan.refusal.window_beyond_this_week":
    "A plan is written in day names, and those only reach as far as this Sunday. Start this week, or come back once next week has started.",
  // C2 ③ — le même mot que la base, refusé avant le modèle plutôt qu'après.
  "plan.refusal.plan_overlaps_existing":
    "Those days sit inside a plan you already have. Cover it to its last day, or replace it.",
  "plan.refusal.unknown_intent": "That request did not say what it replaces.",
  "plan.refusal.replaces_required": "That request did not say which plan it replaces.",
  "plan.refusal.mode_required": "Say where to start: from what you have, or shopping for it.",
  "plan.refusal.pantry_required":
    "Add what you have in, or switch to shopping for it.",
  "plan.refusal.unknown_operation": "That is not a gesture this page knows.",
  "plan.refusal.window_fully_away":
    "Nobody is eating here over those days, so there is nothing to cook.",
  "plan.refusal.all_members_have_own_plan":
    "Everybody here is already cooking from a plan of their own over those days.",
  "plan.refusal.safety_constraints_unreadable":
    "We could not read this household's allergies, and we never cook without them.",
  "plan.refusal.empty_meal":
    "Nothing usable came back. Your previous plan is untouched — try again.",
  "plan.refusal.meal_unparseable":
    "The answer came back in a shape we could not read. Your previous plan is untouched — try again.",
  "plan.refusal.model_returned_tool_call":
    "The answer came back in a shape we could not read. Your previous plan is untouched — try again.",
  "plan.refusal.plan_not_written":
    "The plan could not be saved. Your previous plan is untouched — try again.",
  "plan.refusal.house_rule_violated":
    "What came back broke one of this household's rules, so it was not kept.",
  // ── LES ONZE REFUS DE FUSION (L4) ───────────────────────────────────────
  "plan.refusal.merge_member_required": "That gesture did not say whose plan to fold in.",
  "plan.refusal.merge_member_not_in_household": "That person is not in this household.",
  "plan.refusal.merge_member_is_owner":
    "The household plan is already yours: there is nothing to bring back.",
  "plan.refusal.merge_member_has_no_plan":
    "They have no validated plan of their own to fold in.",
  "plan.refusal.merge_no_household_plan":
    "There is no live household plan to fold into. Compose one first.",
  "plan.refusal.merge_windows_disjoint":
    "Their plan and the household plan share no day, so there is nothing to fold in.",
  "plan.refusal.merge_window_all_past":
    "Every day their plan shares with this one is already behind us.",
  "plan.refusal.merge_window_unreadable": "Those days could not be read.",
  "plan.refusal.merge_plan_vanished": "That plan is no longer readable. Try again.",
  "plan.refusal.merge_member_away_all_window":
    "They are marked away for every meal of those days.",
  "plan.refusal.merge_quota_exhausted":
    "This household has used its merges for the week. Nothing is lost, and it starts again next week.",
  // ── LES SIX REFUS DE DÉFUSION (L5) ──────────────────────────────────────
  "plan.refusal.unmerge_member_required": "That gesture did not say whom to take back out.",
  "plan.refusal.unmerge_member_not_in_household": "That person is not in this household.",
  "plan.refusal.unmerge_member_is_owner":
    "The household plan is yours: there is nobody to take out of it.",
  "plan.refusal.unmerge_member_not_merged":
    "No live household plan has brought them back to this table, so there is nothing to undo.",
  "plan.refusal.unmerge_window_all_past":
    "That household plan has no day left ahead of it. There is nothing left to cook differently.",
  "plan.refusal.unmerge_window_unreadable": "Those days could not be read.",

  // ── LES REFUS DES RPC DE LA PRISE DE MAIN ET DU RÉGLAGE ─────────────────
  "plan.validate.error.not_authenticated": "You are not signed in any more.",
  "plan.validate.error.not_your_plan": "That plan is not yours.",
  "plan.validate.error.plan_retired": "That plan has been replaced.",
  "plan.validate.error.not_a_personal_plan":
    "The household plan is not something to take on — it is already what everyone eats.",
  "household.merge.error.muted_required": "That switch sent no value.",
  "household.merge.error.validated_at_required": "That suggestion carried no date.",
  "household.merge.error.member_is_owner": "That line is yours.",
  "household.merge.error.no_validated_plan":
    "They have no validated plan any more, so there is nothing to leave.",
  // Le piège nommé au registre: la date envoyée doit être celle de la NOTICE
  // (`dismiss_validated_at`), pas celle du plan montré. Quand les plans ont
  // bougé entre l'affichage et le clic, la base refuse — et la bonne réponse
  // est de relire, pas de réessayer avec la même date.
  "household.merge.error.notice_moved_on":
    "Their plans have changed since this was shown. Reload to see where things stand.",

  // ═════════════════════════════════════════════════════════════════════════
  // FF-060 — LE PARCOURS D'ENTRÉE (`/app/setup`)
  //
  // Trois étapes, et la dernière action EST la génération. Pas de « merci »,
  // pas de « ton plan arrive »: le bouton compose, et l'écran suivant est le
  // plan. Toute copie qui fait ATTENDRE quelqu'un est fausse dans ce produit —
  // le coach ne prépare rien pour personne (docs/keel/MODEL.md).
  // ═════════════════════════════════════════════════════════════════════════
  "setup.title": "Set up your kitchen",
  "setup.subtitle": "Three steps, then your first plan.",
  "setup.progress": "Step {n} of {total}",
  "setup.loading": "Loading where you got to…",
  "setup.error.title": "We could not read where you got to.",
  "setup.back": "Back",
  "setup.next": "Continue",
  // PERSONNE N'EST RETENU DANS UN COULOIR. La sortie est visible à chaque
  // étape, et ce qui a déjà été enregistré l'est vraiment.
  "setup.skip": "Skip for now",
  "setup.skip_hint": "Nothing you have answered is lost. You can come back from your plan.",
  "setup.saved": "Saved.",

  // ── ÉTAPE 1 — SITUER ────────────────────────────────────────────────────
  // Ce n'est PAS une case « persona »: les trois réponses SONT les trois
  // cibles du produit, et le nombre est ce qui dimensionne le plan.
  "setup.situate.title": "How many people do you cook for?",
  "setup.situate.hint":
    "It sizes every plan we build, and it is the only thing this step needs. You can change it later.",
  "setup.situate.solo": "Just me",
  "setup.situate.solo_hint": "One plan, your servings, batch-cooked if that is your thing.",
  "setup.situate.pair": "Two of us",
  "setup.situate.pair_hint":
    "One pot, two servings — even when you are not both after the same thing.",
  "setup.situate.family": "Three or more",
  "setup.situate.family_hint": "The house cooks once, and everyone gets their share.",
  // UN SECONDAIRE NE RÉPOND PAS À CETTE QUESTION. Quelqu'un d'autre tient la
  // table; ce qui suit ne règle que lui, et son plan est le sien.
  "setup.situate.member":
    "Someone else runs this household and composes for it. What follows is about you only — your servings, your direction, and a plan of your own if you want one.",

  // ── ÉTAPE 2 — LES GENS ──────────────────────────────────────────────────
  "setup.people.title": "You",
  "setup.people.intro":
    "You eat here too. You are the first place at the table, not the person who runs it.",
  "setup.people.first_name": "First name",
  "setup.people.first_name_hint": "How the plan names your serving.",
  "setup.people.birth_date": "Date of birth",
  // L'ÂGE EST GOUVERNANT, ET LA PHRASE LE DIT. Un champ dont l'absence change
  // le repas sans le dire est un piège — c'est le défaut D1 de ce chantier.
  "setup.people.birth_date_hint":
    "A direction only applies at a known age. Without it you get a standard serving, and nothing says so.",
  "setup.people.birth_date_error": "That date is in the future, or we cannot read it.",
  "setup.people.height": "Height (cm)",
  "setup.people.height_hint": "It sizes your servings. Nothing else reads it.",
  "setup.people.gender": "Sex",
  "setup.people.weight": "Weight (kg)",
  // POURQUOI ON LE DEMANDE MAINTENANT, ET PAS « PLUS TARD ». Deux raisons, et
  // la seconde est de la sécurité: sans un premier point, rien ne peut dire
  // plus tard si la perte va trop vite (`restriction_guard`).
  "setup.people.weight_hint":
    "With your height, it sizes your servings. It is also the first point of a line — without it, nothing can tell later whether you are losing too fast.",
  "setup.people.goal": "What you are after",
  "setup.people.allergies": "Anything you are allergic to?",
  // TROIS NATURES DISTINCTES, ET L'ENTONNOIR NE COLLECTE QUE LA PREMIÈRE
  // (FF-046): une ALLERGIE est médicale et rejoint l'union de sécurité,
  // fail-closed; une RÈGLE DE MAISON est un pouvoir domestique; une AVERSION
  // est un goût. Les confondre à la saisie, c'est promettre une garde de
  // sécurité sur une préférence.
  "setup.people.allergies_hint":
    "Medical only — it rules the whole pot, and nothing gets cooked without it. Dislikes and house rules come later.",
  "setup.people.allergies_none": "Nothing to declare",
  "setup.people.allergies_other": "Something else",
  "setup.people.allergies_add": "Add",
  "setup.people.allergies_remove": "Remove",

  // ── ÉTAPE 2b — LES AUTRES BOUCHES ───────────────────────────────────────
  // ⚠️ ON AJOUTE TOUJOURS UNE BOUCHE. L'accès est un AJOUT PAR-DESSUS, jamais
  // une alternative — ce ne sont pas deux natures de personne, c'est le même
  // objet à deux stades (FF-048 §1). L'écran ne présente donc jamais une
  // fourche « bouche ou compte ? ».
  "setup.mouths.title": "Who else eats here",
  "setup.mouths.intro":
    "Three things per person, and tonight's plan already counts them in.",
  "setup.mouths.add": "Add someone who eats here",
  // ⚠️ PAS `setup.people.first_name_hint`. Celui-là dit « ta » portion, et il
  // était réutilisé ici: le formulaire d'une AUTRE bouche promettait de nommer
  // la portion de qui remplit le champ. Vu à l'écran le 2026-08-12.
  "setup.mouths.first_name_hint": "How the plan names their serving.",
  "setup.mouths.kind": "Are they an adult or a child?",
  "setup.mouths.kind_adult": "An adult",
  "setup.mouths.kind_child": "A child",
  // LA CEINTURE D'ÂGE EST STRUCTURELLE (`goalApplies`, `weekPlanAgeGate`), pas
  // un réglage. Le dire évite qu'on cherche un champ qui n'existera jamais.
  "setup.mouths.kind_hint":
    "A child never gets a nutrition direction of their own. That is built in, not a setting.",
  "setup.mouths.body": "Height, weight and sex",
  // ⚠️ LES TROIS OU AUCUN, et la phrase le dit parce que la base le fait: la
  // RPC refuse un corps partiel, et le moteur SAUTE une bouche sans corps —
  // elle reçoit alors la part de tout le monde, en silence.
  "setup.mouths.body_hint":
    "All three, or none of them. It is what lets the plan give them their own share instead of everyone's.",
  "setup.mouths.goal": "What they are after",
  "setup.mouths.goal_none": "No particular direction",
  "setup.mouths.goal_from_profile":
    "Set in their own profile — it follows them everywhere, not just at this table.",
  "setup.mouths.allergies": "Anything they are allergic to?",
  "setup.mouths.remove": "Remove",
  "setup.mouths.full":
    "Eight is the most a household can hold. Every mouth is another serving to compose at each generation.",

  // ── L'ACCÈS — UN AJOUT PAR-DESSUS ───────────────────────────────────────
  "setup.access.title": "Give them their own access?",
  "setup.access.optional": "Optional. It changes nothing about tonight.",
  // LA PHRASE QUI RÉPOND À « faut-il attendre qu'elle s'inscrive ? ». Elle est
  // la raison d'être de cette section: sans elle, ajouter quelqu'un a l'air
  // d'ouvrir une attente, et l'attente est exactement ce que ce produit ne
  // fait jamais.
  "setup.access.waiting":
    "Nothing waits for them. Their place at the table exists the moment you add them, and tonight's plan already counts them in. The access only lets them take that place over.",
  "setup.access.grants":
    "What they get: they read the household plan and set their own direction. Not: composing, adding or removing anyone, or deciding what the house does not serve.",
  "setup.access.email": "Their email",
  "setup.access.submit": "Create the invitation",
  "setup.access.copy": "Copy the link",
  "setup.access.copied": "Copied.",
  // ⚠️ CE QUE LA RÉCLAMATION FAIT À L'OBJECTIF SAISI ICI. Depuis
  // 20260812250000, la réclamation SÈME cet objectif dans la ligne « about
  // you » du titulaire: il ne se perd plus. La phrase dit ce qui se passe,
  // parce que « rien ne change » serait faux — l'objectif change de PROPRIÉTÉ.
  "setup.access.goal_carries":
    "The direction you set for them carries over when they claim it — after that it is theirs to change, in their own About you.",

  // ── ÉTAPE 3 — LE PLAN ───────────────────────────────────────────────────
  // POSÉ UNE SEULE FOIS, POUR LE FOYER: ça appartient à qui cuisine, pas à
  // chaque bouche. C'est ce qui fait que la branche famille coûte une minute
  // de plus que la branche solo, et pas quatre fois plus.
  "setup.plan.title": "How your week runs",
  "setup.plan.intro": "Asked once, for the whole house — it belongs to whoever cooks.",
  "setup.plan.rhythm": "When you eat",
  "setup.plan.rhythm_hint": "Only the moments you tick get composed.",
  "setup.plan.cook_days": "Days you cook",
  "setup.plan.cook_days_hint": "The rest is leftovers, batches, or something we do not touch.",
  "setup.plan.time": "Minutes per cooking session",
  "setup.plan.budget": "Budget",
  "setup.plan.budget_tight": "Tight",
  "setup.plan.budget_normal": "Normal",
  "setup.plan.budget_comfortable": "Comfortable",
  "setup.plan.compose": "Build my first plan",
  "setup.plan.composing": "Building it now…",
  "setup.plan.compose_hint": "This composes it. The next screen is the plan itself.",

  // ── CE QUI MANQUE ENCORE ────────────────────────────────────────────────
  // Un motif par phrase, et chacune dit LE GESTE, pas l'état. « Il manque une
  // date » n'apprend rien; « sans sa date sa direction ne s'applique pas » dit
  // ce qu'on perd.
  "setup.missing.title": "Before we can build it",
  "setup.missing.household_size": "Tell us how many people you cook for.",
  "setup.missing.own_first_name": "Your first name — the plan names your serving with it.",
  "setup.missing.own_birth_date": "Your date of birth.",
  "setup.missing.own_height_cm": "Your height, so your servings are yours.",
  "setup.missing.own_gender": "Your sex, so your servings are yours.",
  "setup.missing.own_weight_kg":
    "Your weight. Without a first point, nothing can tell later whether you are losing too fast.",
  "setup.missing.own_goal": "What you are after. Nothing can be composed without it.",
  "setup.missing.own_allergies": "Whether you have allergies — “none” counts as an answer.",
  "setup.missing.member_first_name":
    "A first name for everyone at the table. Without one, their serving vanishes from the plan without a word.",
  "setup.missing.member_birth_date": "A date of birth for everyone at the table.",
  // ⚠️ UN SEUL MOTIF POUR LES TROIS CHAMPS, parce que la base est tout-ou-rien:
  // `keel_household_set_member_body` refuse `body_incomplete` dès qu'il en
  // manque un, et le moteur saute la ligne entière. Trois phrases laisseraient
  // croire qu'on peut en donner deux sur trois et gagner quelque chose.
  "setup.missing.member_body":
    "Height, weight and sex for everyone at the table. Without all three, that person is served the same as everyone else — the plan cannot size their share.",
  "setup.missing.member_goal": "A direction for each adult at the table.",
  "setup.missing.member_allergies":
    "Whether each person has allergies — “none” counts as an answer.",
  "setup.missing.adult_without_birth_date":
    "Someone has a direction but no date of birth. A direction only applies at a known age, so as it stands they would get a standard serving and nothing would say so.",
  "setup.missing.missing_mouths": "Add the other people who eat here.",
  "setup.missing.too_many_mouths":
    "Eight is the most a household can hold, you included.",
  "setup.missing.eating_rhythm": "When you eat.",
  "setup.missing.cook_days": "Which days you cook.",
  "setup.missing.cooking_time_min": "How long a cooking session lasts.",
  "setup.missing.budget_band": "Which budget the plan should stay in.",
} as const
