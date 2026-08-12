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
  "join.seen.never_4":
    "A calorie count or a macro figure — there is no such number anywhere in here, for anyone.",
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
  "start.seo_title": "Try KEEL",
  "start.seo_description":
    "Start the KEEL discovery program: photograph your meals, answer three taps in " +
    "the evening, and see what a week of steady eating actually looks like.",
  "start.loading": "Getting things ready…",
  "start.title": "Try it without a coach first",
  "start.lead":
    "This is the KEEL discovery program. It is free, it takes about a minute to " +
    "start, and you will be eating your way through it by tonight.",

  "start.day.title": "What your days look like",
  "start.day.photo_title": "You photograph a meal",
  "start.day.photo_body":
    "Send a photo in the chat and it gets filed against your week. No weighing, " +
    "no calorie box to fill in — what the meal was made of is the part that counts.",
  "start.day.evening_title": "Three taps in the evening",
  "start.day.evening_body":
    "Good, mixed, or hard. That is the whole check-in. It takes five seconds and it " +
    "is what makes a week readable instead of a blur.",
  "start.day.week_title": "A week you can actually see",
  "start.day.week_body":
    "A handful of habits, laid out over seven days, with what you did next to what " +
    "you meant to do. Nothing here scores you.",

  "start.limit.kicker": "Where this stops",
  "start.limit.title": "This program does not know you",
  "start.limit.body":
    "It carries general principles — real food, protein at every meal, regular " +
    "times, one change at a time. It has no idea about your history, your training, " +
    "or your health, and when something depends on those it will say so instead of " +
    "guessing.",
  "start.limit.coach":
    "A coach on KEEL is a different thing: their own method, and someone who has " +
    "your history. If you came here to try the product, this is the honest version " +
    "of it — not a smaller one pretending to be the same.",

  "start.form.title": "Create your account",
  "start.form.name": "Your name",
  "start.form.email": "Email",
  "start.form.password": "Password",
  "start.form.password_hint": "At least 8 characters.",
  "start.form.country": "Where you live",
  // Pourquoi on le demande, dit à la personne. Quelqu'un qui comprend l'usage
  // répond juste — et l'usage est réel: c'est ce champ qui décide quel numéro
  // d'urgence on donne si la conversation part là.
  "start.form.country_hint":
    "Used to give you the right emergency number if a conversation ever needs one.",
  "start.form.legal_prefix": "I accept the",
  "start.form.legal_terms": "Terms",
  "start.form.legal_and": "and the",
  "start.form.legal_privacy": "Privacy Policy",
  "start.form.cta": "Start the program",
  "start.form.submitting": "Creating your account…",
  "start.form.have_account": "Already have an account?",
  "start.have_account_cta": "Sign in",

  "start.repair.title": "One thing left",
  "start.repair.body":
    "Your account exists but it is not attached to the program yet. Tell us where " +
    "you live and it will be, in one click.",
  "start.repair.cta": "Attach my account",

  "start.check_email.title": "Confirm your email",
  "start.check_email.body":
    "Your account is created and already attached to the discovery program. Open the " +
    "confirmation email we just sent to finish signing in.",
  "start.joined.title": "You're in",
  "start.joined.body":
    "Say hello, or send a photo of your next meal — that is where the program starts.",
  "start.joined.cta": "Open the conversation",
  "start.existing.title": "You already have an account",
  "start.existing.body":
    "That address is already registered. Sign in and we will pick up right here.",
  "start.existing.cta": "Sign in",

  "start.unavailable.title": "Free signup is paused",
  "start.unavailable.body":
    "The discovery program is not available right now, so we are not creating " +
    "accounts that would have nothing to run. Try again a little later — and if a " +
    "coach invited you, use the link in their email instead.",

  "start.error.legal": "Please accept the Terms and the Privacy Policy to continue.",
  "start.error.country_required": "Please tell us where you live.",
  "start.error.already_coached":
    "Your account already follows a coach's program. You do not need this one.",
  "start.error.caller_is_coach":
    "This is a coach account. Your space is the coach workspace, not a student one.",
  "start.error.unavailable":
    "The discovery program is not available right now. Nothing was created — try again later.",
  "start.error.generic": "That did not go through. Nothing changed — try again.",

  // Brand + public chrome (header/footer shared by the public pages)
  "brand.wordmark": "Sophia",
  "public.header.sign_in": "Sign in",
  "public.header.start_trial": "Start free trial",
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
  // ── LES TROIS PORTES, NOMMÉES ────────────────────────────────────────────
  // Il y a trois pages de vente (`/`, `/gyms`, `/communities`) et, jusqu'ici,
  // aucun lien entre elles: un visiteur envoyé sur la mauvaise n'avait aucun
  // moyen de trouver la sienne, et rien ne lui disait laquelle il lisait —
  // les trois portent le même en-tête et la même palette.
  //
  // Les libellés nomment L'ACHETEUR, pas le produit: c'est la seule chose qui
  // permet à quelqu'un de se reconnaître en un mot. « Courses » et pas « Home »
  // pour `/`, parce que `/` n'est pas une page d'accueil générique — elle vend
  // à qui vend une formation, exactement comme les deux autres vendent à une
  // salle et à une communauté.
  //
  // Ces clés vivent dans `public.*` et non dans `landing.*` / `gyms.*` /
  // `communities.*`: c'est le seul texte que les trois pages partagent VRAIMENT
  // — trois libellés de nav qui divergeraient décriraient trois sites.
  "public.nav.label": "Who Sophia is for",
  "public.nav.courses": "Courses",
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
  "landing.seo_title": "Sophia — turn a course into a coaching program",
  "landing.seo_description":
    "Sophia is the AI that answers your students in your own method and words, every day. A method you could only sell once becomes a program worth paying for every month. You record your method once; every outgoing message is checked against your red lines before it is sent. On Monday you read one page — who is still talking, how the week felt, what they set themselves.",
  "landing.hero.kicker": "For coaches who sell a method, not hours",
  "landing.hero.title": "Your course ends. Your coaching doesn't.",
  // « on Monday you read one page » a été RETIRÉ d'ici: le panneau du lundi est
  // à trente centimètres à droite, titré « Monday / One page. Not a dashboard. »
  // Le dire aussi dans le sous-titre coûtait une ligne et demie et repoussait le
  // bouton sous la ligne de flottaison pour redire ce que la maquette montre.
  "landing.hero.subtitle":
    "Sophia learns how you coach — your convictions, your red lines, the calls you make on the hard cases — and answers your students in your place, every day. A method you could only sell once becomes a program worth paying for every month. Every message is checked against your red lines before it goes out.",
  "landing.hero.cta_trial": "Start the 14-day trial",
  "landing.hero.cta_signin": "Sign in",
  "landing.hero.note":
    "14 days, up to 3 students. They join by invitation and get a space of their own, chat included. There is no one-to-one inbox for you to keep up with.",
  // Discret par construction: cette page vend au coach. Mais un coach qui évalue
  // veut voir le produit avant d'y inviter un client, et « essayez d'abord »
  // répond à ça sans lui vendre une seconde offre.
  "landing.hero.try_prompt": "Want to see it from the student's side first?",
  "landing.hero.try_cta": "Try the free program",

  // Landing — schematic of the Monday page. Labels are the product's own; the
  // cohort is an example and says so (landing.mock.caption).
  "landing.mock.monday_title": "Monday",
  "landing.mock.monday_subtitle": "One page. Not a dashboard.",
  "landing.mock.contact_label": "Who's still talking",
  "landing.mock.contact_line": "34 students this week: 25 in touch, 6 slipping, 3 silent.",
  "landing.mock.contact_responsive": "In touch",
  "landing.mock.contact_slipping": "Slipping",
  "landing.mock.contact_silent": "Silent",
  "landing.mock.contact_responsive_hint": "answered within 2 days",
  "landing.mock.contact_slipping_hint": "quiet 2 to 5 days",
  "landing.mock.contact_silent_hint": "quiet 5 days or more",
  "landing.mock.felt_label": "How the week felt",
  "landing.mock.felt_line": "How the week felt: 18 holding up, 8 strained, 3 having a hard time.",
  "landing.mock.felt_sustainable": "Holding up",
  "landing.mock.felt_strained": "Strained",
  "landing.mock.felt_hard": "Having a hard time",
  "landing.mock.felt_unknown": "Not enough check-ins to say",
  "landing.mock.felt_caption":
    "Five students tapped fewer than three times. They are missing from the sentence above on purpose — one tap is not a week, and nobody is filed as fine by default.",
  "landing.mock.intent_label": "What they set themselves",
  "landing.mock.intent_line": "21 of 34 wrote themselves a week from your method.",
  "landing.mock.caption":
    "A schematic of the Monday page. The wording is the product's own; the cohort is an example.",

  // Landing — the chat exchange, shown inside the “every day” step
  "landing.mock.wa_label": "In their chat, today",
  "landing.mock.photo_alt": "Photo of a plate, sent by a student",
  "landing.mock.chat_student": "Lunch — had to eat out today",
  "landing.mock.chat_sophia":
    "Greens and a protein, moderate portion. That's the line you set yourself on Monday — noted.",
  "landing.mock.chat_evening": "How did today go?",
  "landing.mock.chat_tap_good": "Good",
  "landing.mock.chat_tap_mixed": "Mixed",
  "landing.mock.chat_tap_hard": "Hard",
  "landing.mock.chat_tap_caption":
    "Three buttons. If it was hard, one follow-up — energy, hunger or sleep. That's the whole evening.",

  // Landing — the coach's note on one student. The heading and the example are
  // VERBATIM from `CoachNoteCard`: this mock shows a real field, and a landing
  // that paraphrases its own product screen is a landing that will drift from
  // it on the first edit.
  "landing.mock.note_label": "On their page, in your workspace",
  "landing.mock.note_heading": "What you have noticed about them",
  "landing.mock.note_body": "Works nights, eats around 3am. Hates cooking on Sundays.",
  "landing.mock.note_caption":
    "One field, one student, 1,500 characters. Rewrite it whenever they change; the next message uses the new one.",

  // Landing — the problem. Il nomme maintenant les DEUX pertes, dans cet ordre:
  // l'élève qui décroche (le résultat), et le revenu qui s'arrête (la ligne).
  // La seconde n'était nulle part sur l'ancienne page, alors que c'est celle
  // qui fait signer — cf. l'en-tête du hero.
  "landing.problem.kicker": "The problem",
  "landing.problem.title": "A course is paid once. The work takes a year.",
  "landing.problem.body":
    "You recorded the modules, the cohort is full, and the method is good. Then Tuesday night arrives and a student has a question that isn't in any module — because it's about their evening, their kitchen, their week. Multiply it by everyone enrolled. There is no version of you that answers all of it, so the modules are where your relationship with them stops.",
  "landing.problem.q1": "“Can I swap the rice for pasta tonight?”",
  "landing.problem.q2": "“I'm starving at 4pm — is that normal?”",
  "landing.problem.q3": "“I ate badly at a wedding. Have I wrecked the week?”",
  "landing.problem.close":
    "Every one of those has an answer, and the answer is yours — you've made that call a hundred times. Nobody leaves because your method was wrong. They drift because on Tuesday night, nobody who thinks like you was there. And a student who drifts doesn't get the result, doesn't come back, and doesn't send you anyone.",

  // Landing — how it works. The eyebrows are the CADENCE, not 1/2/3: the whole
  // argument is the asymmetry between recording once and answering daily.
  "landing.how.kicker": "How it works",
  "landing.how.title": "Recorded once. Answering all week.",
  "landing.how.step1_when": "Once",
  "landing.how.step1_title": "You record your method",
  "landing.how.step1_body":
    "A guided interview turns how you coach into something the agent can hold: your convictions, your red lines, your vocabulary, how you answer the hard cases, your tone. You read back exactly what it understood, then publish. Revise it whenever you like — an edit lands on the next message — and roll back to any earlier version without losing the history of what your students actually received.",
  "landing.how.step2_when": "Every day",
  "landing.how.step2_title": "Your students live it, day by day",
  "landing.how.step2_body":
    "They send a photo of a plate or a sentence about their day, and get an answer in your method — in their chat, in the thread that stays open all day. In the evening, one tap says how the day went.",
  "landing.how.space_when": "On their own time",
  "landing.how.space_title": "And a space of their own",
  "landing.how.space_body":
    "Not somewhere they get chased into — they open it when they want to. It's where they build their week out of your method: Sophia drafts it, they adopt it only if they recognise themselves in it, and the conviction each food line came from is printed underneath. It's also where they look back — their consistency, how the days went, their plates.",
  "landing.how.step3_when": "Every Monday",
  "landing.how.step3_title": "You read one page",
  "landing.how.step3_body":
    "Who's still talking, how the week felt, what your students set themselves. Computed from what actually happened, never narrated by a model — and when there isn't enough to say something, it says that instead.",

  // Landing — the 1:1 case (`student_coach_notes`, migration 20260805180000).
  //
  // POURQUOI CETTE SECTION EXISTE ALORS QUE LE HERO DIT « no one-to-one inbox »:
  // les deux tiennent ensemble, et c'est précisément ce que la section doit
  // faire lire. La note n'est pas un canal — l'élève n'y répond pas, elle ne
  // revient jamais dans la boîte du coach. Le `close` ci-dessous porte cette
  // réconciliation explicitement, parce qu'un lecteur attentif VA sentir la
  // tension et qu'une contradiction non traitée coûte plus cher qu'une phrase.
  //
  // CHAQUE PHRASE EST UNE PROPRIÉTÉ VÉRIFIABLE DU CODE, pas une promesse:
  //   rule1 — les 3 points d'injection (`run.ts`, `generate-week-plan-v1`,
  //           `generate-meal-v1` appellent tous `loadCoachNote`);
  //   rule2 — l'ordre fixe sécurité > doctrine > note, et le CHECK
  //           `student_week_plans_doctrine_traceable_check` + `allowedKeys`
  //           dans `parseWeekPlan` (la note n'ouvre AUCUNE clé);
  //   rule3 — les 2 dernières lignes de `coachNotePromptBlock` (never quote,
  //           never narrate) + la réclamation des deux côtés dans
  //           `account-export-v1`;
  //   rule4 — `coachNotePromptBlock` rend `null` sur note vide: RIEN dans le
  //           prompt, pas même « le coach n'a rien noté ».
  // Si l'une de ces quatre propriétés change, cette section ment.
  "landing.note.kicker": "If you coach one to one",
  "landing.note.title": "Ten students you actually know. Tell Sophia what you know.",
  "landing.note.body":
    "Your method is what you would say to any of them. But you also know that this one works nights, that one is coming back from a knee injury, that one writes off Sunday every week. None of it belongs in your method — it isn't true of anybody else. So it goes somewhere else: one note, on one student, in your own words.",
  "landing.note.rule1_title": "It reaches everything they get",
  "landing.note.rule1_body":
    "Their chat, the week they build for themselves, the meals Sophia drafts for them. Not a second method running beside yours — your method, read through what you know about them.",
  "landing.note.rule2_title": "It never outranks anything",
  "landing.note.rule2_body":
    "Their allergies come first, your method second, the note third. Where the note meets either one, the other wins. It cannot unlock a food a constraint rules out, and it opens no conviction you don't hold: every line Sophia builds still traces back to your method, or the database refuses to store it.",
  "landing.note.rule3_title": "Sophia uses it. She never quotes it.",
  "landing.note.rule3_body":
    "Your student never reads “your coach noted that you…”. They get an answer that happens to fit them, with no explanation of why. And because it is a note about a person, it belongs to them too: it is included if they ever ask for their data, and the screen tells you that before you write.",
  "landing.note.rule4_title": "Empty means empty",
  "landing.note.rule4_body":
    "No reminder, no field waiting for you, and nothing reaching the model to say you left it blank. Two hundred students, write none. Ten, write ten. It is the only shape under which a per-student field doesn't quietly become a per-student chore.",
  "landing.note.close":
    "That is the whole of the one-to-one mode. It is a note, not an inbox — nobody replies to it, and there is still nothing for you to keep up with.",

  // Landing — the double lock (the dark block: the guarantee, not the argument)
  "landing.diff.kicker": "The part you should be most afraid of",
  "landing.diff.title": "An AI speaking in your name is a risk. We treat it as one.",
  "landing.diff.body":
    "A prompt is an instruction, not a guarantee. Tell any model “never recommend grazing between meals” and it will comply almost always — and almost always is the wrong number when one public contradiction of you is the thing your students remember. So your red lines are enforced twice, by two mechanisms that fail differently.",
  "landing.diff.lock1_tag": "Lock 1 — injected",
  "landing.diff.lock1": "Your method goes into the prompt, on every message.",
  "landing.diff.lock2_tag": "Lock 2 — verified",
  "landing.diff.lock2":
    "Every outgoing message is scanned against your red lines before it is sent. Deterministic, no model in that loop. That one is the guarantee.",
  "landing.diff.trace_label": "What that looks like, on one message",
  "landing.diff.trace_example": "Example — a coach whose method rules out grazing",
  "landing.diff.trace_ask": "A student asks",
  "landing.diff.trace_ask_text": "“Should I add a snack between lunch and dinner?”",
  "landing.diff.trace_draft": "The draft said",
  "landing.diff.trace_draft_text":
    "“A small snack mid-afternoon can help — try six smaller meals across the day.”",
  "landing.diff.trace_held": "Held by lock 2",
  "landing.diff.trace_sent": "What went out instead",
  "landing.diff.trace_sent_text":
    "“Three real meals. If you're hungry between them, the meal before was too small — fix the meal, not the gap.”",
  "landing.diff.trace_note":
    "That replacement is not ours. Each red line carries what you do instead, in your words, and that is what your student receives.",
  "landing.diff.close":
    "Your student never gets a refusal, and never gets “ask your coach” — in a masterclass that points at a door which doesn't exist. They get your answer.",

  // Landing — doctrine
  "landing.doctrine.kicker": "Our doctrine",
  "landing.doctrine.title": "Three rules we don't bend",
  "landing.doctrine.rule1_title": "You teach. They decide. Nobody is graded.",
  "landing.doctrine.rule1_body":
    "No adherence score, no percentage, no streak, no ranking of your students. A student is not marked against a plan they never signed. The week records how it went; the judgement stays yours.",
  "landing.doctrine.rule2_title": "Every line names the conviction it came from.",
  "landing.doctrine.rule2_body":
    "When a student builds their week out of your method, each food line says which of your convictions it applies — and the database refuses a line that names none. That's a constraint, not a convention. Your student reads the belief under the line, so you can both judge whether it was a fair reading of you.",
  "landing.doctrine.rule3_title": "Silence is never rounded up.",
  "landing.doctrine.rule3_body":
    "A student who tapped twice hasn't given us a week. They come back as “not enough check-ins”, never as “doing fine”. It costs us a nicer-looking page, and it's the only reason the page is worth reading.",
  // ── PLUS UN REFUS D'IDENTITÉ, UNE QUESTION DE FIABILITÉ (2026-08-06) ──────
  // Ce bloc s'intitulait « And no, Sophia doesn't count calories » et se
  // terminait par « The refusal is the feature ». Les deux sont RETIRÉS: le
  // produit va fournir un calcul approximatif, et une page qui a fait du refus
  // une identité ne peut plus rien livrer sans se dédire.
  //
  // Ce qui reste, et qui est ce qu'on a vraiment mesuré
  // (`docs/keel/PHOTO_QUANTIFICATION.md`, 85 appels réels, vérité USDA):
  // le modèle est JUSTE quand on lui donne les quantités (MAPE 2,3%), et il est
  // BIAISÉ quand on lui demande de les deviner sur une photo (−26,6%, toujours
  // dans le même sens). Ce n'est donc pas le calcul qui est refusé, c'est la
  // photo nue comme source de quantité.
  //
  // ⚠️ LA LIGNE QU'AUCUNE RÉÉCRITURE NE DOIT FRANCHIR — `docs/keel/LEGAL.md`
  // §6.4, règle marketing non négociable: NE JAMAIS ANNONCER un comptage
  // calorique par photo ni un « suivi des macros par photo ». La couverture
  // réelle de l'intervalle du modèle est de 58% pour un intervalle demandé à
  // 90%: il ne sait pas qu'il ne sait pas. Le « where a number does appear »
  // ci-dessous est CONDITIONNEL exprès — il reste vrai que le produit en
  // affiche un ou non, et il ne promet aucune source.
  "landing.doctrine.no_calories_title": "Calories — what a photo can actually tell you.",
  "landing.doctrine.no_calories_body":
    "We measured it on our own model before deciding. Given the quantities, it is accurate: 2.3% average error against USDA reference data. Asked to guess them off a photo, it is not — across 85 real analyses, estimates came in 26.6% under the truth on average, and that error leans the same way every time instead of cancelling out over a week. When the model offers its own margin of error, the truth falls inside it barely more than half the time.",
  "landing.doctrine.no_calories_body2":
    "So Sophia leads with the half a photo is good at: what was eaten, when, and how big — small, moderate or large. That part your student can check at a glance, and a miss gets corrected in one message. Where a number does appear, it is an estimate and it is labelled as one: never a target your student is measured against, never a score, and never a stand-in for your method. Prescribing numbers stays with whoever is qualified to do it.",

  // Landing — pricing
  // ── UN SEUL POSTE, ET PLUS DE FORFAIT ────────────────────────────────────
  // La grille disait « 49 $ + 12 $ par élève ACTIF (3 interactions ou plus) ».
  // Deux défauts, tous deux corrigés en base le même jour:
  //
  //   1. Le forfait imposait un point mort à ~13 élèves. En dessous, le coach
  //      perdait de l'argent chaque mois — et l'essai le fait démarrer à 3.
  //      Sans lui, « ton premier élève te rapporte de l'argent » devient
  //      littéralement vrai, et c'est une bien meilleure phrase de vente qu'une
  //      réduction de fatigue.
  //   2. Facturer l'élève ACTIF faisait cadeau des abonnés silencieux — que le
  //      coach encaisse pourtant, puisqu'il revend l'accès — et ne payait plus
  //      la boucle de relance, qui sert précisément ces élèves-là.
  //
  // La condition d'activité est retirée de `keel_coach_seat_ledger`
  // (migration 20260806170000): le siège facturable est l'élève RATTACHÉ.
  "landing.pricing.kicker": "Pricing",
  "landing.pricing.title": "One line. It grows with what you sell.",
  "landing.pricing.seat": "7 €",
  "landing.pricing.seat_period": "per student, per month",
  "landing.pricing.seat_label": "No platform fee. No setup. Nothing else.",
  // La dernière phrase POSE UNE QUESTION au lieu d'avancer un chiffre, et c'est
  // délibéré: le ratio réel dépend de ce que le coach facture, que nous ne
  // connaissons pas. Une arithmétique inventée ici serait le premier chiffre
  // faux de la page, sur la section où le prospect est le plus attentif.
  "landing.pricing.why":
    "You pay for the students you have enrolled, and you stop paying the month you turn a seat off. Charge them what you like on top — one student, ten, five hundred: the arithmetic is the same, and it is positive from the first one. The number to weigh this against isn't the hours you save: it's what one student who stays instead of drifting is worth to you.",
  "landing.pricing.cta": "Start the 14-day trial",
  "landing.pricing.trial_note": "14 days, up to 3 students, then it stops on its own.",

  // Landing — closing call
  "landing.closing.title":
    "You've already written the method. This is what makes it worth paying for every month.",
  "landing.closing.cta": "Start the 14-day trial",
  "landing.closing.signin_prompt": "Already using Sophia?",
  "landing.closing.signin_link": "Sign in",

  // ==========================================================================
  // /gyms — LA SECONDE PAGE DE VENTE, ET ELLE NE PARLE PAS AU MÊME ACHETEUR
  // ==========================================================================
  // `/` vend à quelqu'un qui VEND UNE FORMATION: sa douleur est qu'un cours se
  // paie une fois, son gain est une ligne récurrente là où il n'y en avait
  // aucune. Une salle de sport a déjà la ligne récurrente — c'est son métier —
  // et sa douleur est le CHURN. Les deux pages disent donc le même produit avec
  // un ordre d'arguments, un vocabulaire et des chiffres différents.
  //
  // ── LA CIBLE, ET ELLE EST ÉTROITE EXPRÈS ─────────────────────────────────
  // Le PROPRIÉTAIRE-COACH: box, salle de force, studio hybride, 100 à 300
  // membres, une position assumée sur l'alimentation. PAS la chaîne qui
  // « désigne un nutritionniste »: celui qui remplit l'entretien de doctrine
  // n'y touche aucun bénéfice, la doctrine sera bâclée, et un agent générique
  // est le MODE D'ÉCHEC du produit, pas une version réduite. `gyms.fit.*`
  // disqualifie ce lecteur à voix haute plutôt que de l'encaisser.
  //
  // ── LES QUATRE SILENCES, VÉRIFIÉS DANS LE CODE LE 2026-08-06 ─────────────
  //   1. AUCUN ENCAISSEMENT. `stripe-create-checkout-session` n'a pas de SKU
  //      élève: le propriétaire facture ses membres avec ses propres outils.
  //      `gyms.pricing.billing_note` le dit au lieu de le laisser deviner.
  //   2. AUCUNE APP NATIVE, donc aucune notification push. Le canal est le web
  //      et la bulle in-app (`/app/chat`).
  //   3. LE PROTOCOLE EST NUTRITIONNEL. Pas de supplément, pas de sommeil, pas
  //      de charge d'entraînement — le schéma les porterait, la saisie ne les
  //      expose pas.
  //   4. AUCUNE INTÉGRATION avec un logiciel de gestion de salle.
  //      `gyms.hero.note` le formule à l'endroit (« rien à connecter ») plutôt
  //      que de laisser le prospect le découvrir à l'installation.
  //
  // ── ET LE CHIFFRE QU'ON N'INVENTE PAS ────────────────────────────────────
  // AUCUN taux de rétention n'est avancé: nous n'en avons pas mesuré un seul.
  // `gyms.churn.p3_body` pose la QUESTION (« combien vaut un membre qui reste
  // trois mois de plus ? ») exactement comme `landing.pricing.why`, et dit
  // explicitement que nous n'avons pas le chiffre. Sur la section rétention —
  // celle qui fait signer une salle — un chiffre inventé serait le premier
  // mensonge de la page, et il serait sur l'argument principal.
  "gyms.seo_title": "Sophia for gyms — a nutrition tier your members pay for",
  "gyms.seo_description":
    "Sophia gives an independent gym a second line of revenue: a nutrition tier above the membership, run by an agent that answers your members every day in your method and your words. You pay 7 € per enrolled member and charge what you like on top. Every outgoing message is checked against your red lines before it is sent. On Monday you read one page — who is still talking, who is slipping, how the week felt.",

  // Gyms — hero. L'ARGUMENT DE TÊTE EST LE REVENU, comme sur `/`, et pour la
  // même raison: un argument de charge de travail plafonne au temps du gérant
  // et nous fait comparer à un logiciel de gestion. Un argument de revenu ne
  // plafonne pas. La rétention arrive juste après, parce que c'est celui qui
  // PARLE le plus à une salle — mais il se lit mieux quand la marge est déjà
  // acquise.
  "gyms.hero.kicker": "For independent gyms — boxes, strength halls, hybrid studios",
  "gyms.hero.title": "A membership is one line of revenue. This is the second.",
  "gyms.hero.subtitle":
    "Sophia is an agent that coaches your members on food, every day, in your method and your words. You record how you feed athletes once; it answers all of them. You pay 7 € per enrolled member and charge them what you like on top, so the margin is yours from member one — and it costs you no extra hours, because nobody on your team writes a menu.",
  "gyms.hero.cta_trial": "Start the 14-day trial",
  "gyms.hero.cta_signin": "Sign in",
  "gyms.hero.note":
    "14 days, up to 3 members, then it stops on its own. They join by invitation and get a space of their own, chat included. It runs alongside whatever you already use to manage the gym — there is nothing to connect.",
  "gyms.hero.try_prompt": "Want to see it from a member's side first?",
  "gyms.hero.try_cta": "Try the free program",

  // Gyms — the worked example. IL EST ÉTIQUETÉ « EXAMPLE » PARTOUT, et les deux
  // inconnues sont nommées: le taux d'adoption et le prix que le gérant fixe.
  // Le seul chiffre qui n'est pas une estimation est le nôtre — 7 € par membre.
  //
  // L'arithmétique, à vérifier si l'un de ces nombres bouge:
  //   250 membres × 15% = 37,5 → 37 (on ARRONDIT VERS LE BAS: une personne
  //   n'est pas divisible, et arrondir vers le haut flatterait notre côté)
  //   37 × 25 € = 925 €   |   37 × 7 € = 259 €   |   925 − 259 = 666 €
  //   666 × 12 ≈ 8 000 €
  "gyms.money.title": "A worked example",
  "gyms.money.subtitle": "A gym with 250 members",
  "gyms.money.uptake_label": "On the nutrition tier",
  "gyms.money.uptake_value": "37",
  "gyms.money.uptake_unit": "members",
  "gyms.money.uptake_hint": "15% take it up — rounded down to whole people",
  "gyms.money.month_label": "Every month, from then on",
  "gyms.money.in_label": "They pay you 25 € each",
  "gyms.money.in_value": "925 €",
  "gyms.money.out_label": "You pay Sophia 7 € each",
  "gyms.money.out_value": "− 259 €",
  "gyms.money.keep_label": "You keep",
  "gyms.money.keep_value": "666 €",
  "gyms.money.keep_hint": "about 8,000 € a year",
  "gyms.money.hours_label": "Extra hours of work",
  "gyms.money.hours_value": "None",
  "gyms.money.caption":
    "An example, and it says so: we don't know your take-up or the price you'd set, and those are the two numbers that decide the total. What isn't an estimate — 7 € per enrolled member, you charge what you like on top, and the margin is positive on the first one.",

  // Gyms — retention. L'ARGUMENT QUI PARLE LE PLUS À UNE SALLE, et le seul
  // endroit de la page où il serait facile de mentir. Aucun pourcentage de
  // rétention n'est avancé; `p3_body` dit que nous n'en avons pas.
  "gyms.churn.kicker": "Retention",
  "gyms.churn.title": "Nobody cancels in a month where their body is changing.",
  "gyms.churn.body":
    "You already run the half that happens in the room: three sessions a week, coached, in front of you. The other twenty-one meals happen where you aren't, and that is where the plateau comes from. A member who stops seeing change doesn't argue with you about it — they come less, then they come on Saturdays, then they don't. Body composition is the lever everyone in this industry names and almost nobody staffs.",
  "gyms.churn.p1_title": "The part you can't staff",
  "gyms.churn.p1_body":
    "Following a hundred members' food one by one is a full-time hire, and even then it isn't awake at 9pm on a Tuesday, which is when the question actually gets asked. Sophia does that part, for every member you enrol, on the day.",
  "gyms.churn.p2_title": "It notices before the badge does",
  "gyms.churn.p2_body":
    "Three days of silence and that member gets one message. One — then it goes quiet, because a nudge on day two only teaches people that silence gets pinged, and burns the signal for day nine. It is the only part of the product that acts when nobody is asking for anything.",
  "gyms.churn.p3_title": "What you're actually buying",
  "gyms.churn.p3_body":
    "Not software. Months of membership. What is one member who stays three months longer worth to you? That is the number to put against 7 €, and it is yours, not ours — we have no retention figure to sell you, and we are not going to invent one.",
  "gyms.churn.close":
    "You are not buying a tool. You are buying months of membership you would otherwise have lost.",

  // Gyms — how it works. Mêmes cadences que sur `/` (une fois / tous les jours
  // / quand ils veulent), et le lundi est retiré d'ici: il a sa propre section
  // plus bas, parce que pour une salle c'est un argument, pas une étape.
  "gyms.how.kicker": "How it works",
  "gyms.how.title": "Recorded once. Answering all week.",
  "gyms.how.step1_when": "Once",
  "gyms.how.step1_title": "You record how you feed athletes",
  "gyms.how.step1_body":
    "A guided interview turns your method into something the agent can hold: what you're convinced of, what you rule out, the words you use, the calls you make on the hard cases, your tone. You read back exactly what it understood, then publish. Revise it whenever you like — an edit lands on the next message — and roll back to any earlier version without losing the history of what your members actually received.",
  "gyms.how.step2_when": "Every day",
  "gyms.how.step2_title": "Your members live it, meal by meal",
  "gyms.how.step2_body":
    "They send a photo of a plate or a sentence about their day, and get an answer in your method — in a thread that stays open. In the evening, one tap says how the day went. That tap is what Monday's page is built out of.",
  "gyms.how.space_when": "On their own time",
  "gyms.how.space_title": "And a space of their own",
  "gyms.how.space_body":
    "Not somewhere they get chased into — they open it when they want to. It's where they build the week out of your method: Sophia drafts it, they adopt it only if they recognise themselves in it, and the conviction each food line came from is printed underneath. It's also where they look back — their consistency, how the days went, their plates.",

  // Gyms — the chat, schematic. Les libellés sont propres à `gyms.*` plutôt
  // qu'empruntés à `landing.mock.*`: deux pages qui partagent une clé changent
  // de sens ensemble le jour où quelqu'un retouche l'autre. Trois boutons parce
  // que le pulse a trois niveaux (`_shared/keel/daily_pulse.ts`), pas une
  // échelle de 0 à 10.
  "gyms.mock.chat_label": "In their chat, today",
  "gyms.mock.photo_alt": "Photo of a plate, sent by a member",
  "gyms.mock.chat_member": "Lunch — client meeting, had to eat out",
  "gyms.mock.chat_sophia":
    "Greens and a protein, moderate portion. That's the line you set yourself on Monday — noted.",
  "gyms.mock.chat_evening": "How did today go?",
  "gyms.mock.chat_tap_good": "Good",
  "gyms.mock.chat_tap_mixed": "Mixed",
  "gyms.mock.chat_tap_hard": "Hard",
  "gyms.mock.chat_caption":
    "Three buttons. If it was hard, one follow-up — energy, hunger or sleep. That's the whole evening.",

  // Gyms — la section qui DISQUALIFIE un lecteur, et c'est délibéré. Elle est
  // placée juste après « you record your method », pendant que le lecteur a
  // encore en tête que quelqu'un doit s'asseoir et le faire.
  "gyms.fit.kicker": "Who this is for",
  "gyms.fit.title": "It only works if the method is yours.",
  "gyms.fit.body":
    "The interview is an hour of your time, and nobody can sit it for you. The agent answers in the convictions it was given, so the person who holds them has to be the one talking — and it is your name on the messages your members read.",
  "gyms.fit.yes_title": "The owner who coaches",
  "gyms.fit.yes_body":
    "A box, a strength hall, a hybrid studio. A hundred to three hundred members. One person with a stated position on how people should eat, who is already saying it out loud on the floor five times a day and has never been paid a euro for it.",
  "gyms.fit.no_title": "Not the appointed nutritionist",
  "gyms.fit.no_body":
    "A gym that hands the interview to someone on staff gets back what it put in: a doctrine filled out under duress, and an agent that sounds like every other food app. Whoever does the work has to be the one who benefits from it — a generic agent is this product's failure mode, not a smaller version of it.",

  // Gyms — le lundi. Sur `/` c'est la troisième étape; ici c'est une SECTION,
  // parce que l'alerte précoce de churn est le volet que le gérant ne voit pas
  // venir et qui referme la vente.
  "gyms.data.kicker": "Every Monday",
  "gyms.data.title": "The churn signal no gym has ever had.",
  "gyms.data.body":
    "One page, computed from what actually happened and never written by a model: who is still talking, how the week felt, what your members set themselves. When there isn't enough to say something, it says that instead.",
  "gyms.data.p1_title": "An early warning, not a post-mortem",
  "gyms.data.p1_body":
    "A member listed as slipping went quiet two to five days ago. They are still reachable — a message from you still lands. Your access log will tell you the same thing in six weeks, and by then the word for it is “former member”.",
  "gyms.data.p2_title": "Your method, at the scale of the room",
  "gyms.data.p2_body":
    "Which parts of your method your members hold, which ones they drop, and what time of year they drop them. No gym has had that, because no gym has ever asked a hundred members the same question on the same evening.",
  "gyms.data.p3_title": "Computed, not narrated",
  "gyms.data.p3_body":
    "Every line is arithmetic over what happened — messages, evening taps, the weeks your members wrote for themselves. No model writes this page, which is why it cannot flatter you.",

  // Gyms — schematic of the Monday page. La cohorte est CELLE DE L'EXEMPLE
  // CHIFFRÉ du hero (37 membres sur le palier), pour qu'un lecteur qui remonte
  // retrouve le même chiffre au lieu d'en découvrir un second.
  // Contrôle: 26 + 7 + 4 = 37, et 20 + 8 + 3 + 6 = 37.
  "gyms.mock.monday_title": "Monday",
  "gyms.mock.monday_subtitle": "One page. Not a dashboard.",
  "gyms.mock.contact_label": "Who's still talking",
  "gyms.mock.contact_responsive": "In touch",
  "gyms.mock.contact_responsive_hint": "answered within 2 days",
  "gyms.mock.contact_slipping": "Slipping",
  "gyms.mock.contact_slipping_hint": "quiet 2 to 5 days",
  "gyms.mock.contact_silent": "Silent",
  "gyms.mock.contact_silent_hint": "quiet 5 days or more",
  "gyms.mock.slipping_note":
    "The seven in the middle are the ones worth a message today. Left alone, they are the ones who don't renew.",
  "gyms.mock.felt_label": "How the week felt",
  "gyms.mock.felt_sustainable": "Holding up",
  "gyms.mock.felt_strained": "Strained",
  "gyms.mock.felt_hard": "Having a hard time",
  "gyms.mock.felt_unknown": "Not enough check-ins to say",
  "gyms.mock.felt_caption":
    "Six members tapped fewer than three times. They are missing from the count above on purpose — one tap is not a week, and nobody is filed as fine by default.",
  "gyms.mock.intent_label": "What they set themselves",
  "gyms.mock.intent_line": "24 of 37 wrote themselves a week from your method.",
  "gyms.mock.caption":
    "A schematic of the Monday page. The wording is the product's own; the gym is the example above — the 37 members on the nutrition tier.",

  // Gyms — le double verrou. C'est l'argument que la concurrence ne peut pas
  // copier en un week-end, et il est repris tel quel de `/`: seule la clôture
  // change, parce qu'ici la porte « demande à ton coach » EXISTE — le coach est
  // dans la salle. L'argument devient donc « il est 21h un mardi et tu es chez
  // toi », pas « la porte n'existe pas ».
  "gyms.diff.kicker": "The part you should be most afraid of",
  "gyms.diff.title": "An agent speaking in your name is a risk. We treat it as one.",
  "gyms.diff.body":
    "A prompt is an instruction, not a guarantee. Tell any model “never recommend grazing between meals” and it will comply almost always — and almost always is the wrong number when one public contradiction of you, in front of someone who trains under your name, is what the room remembers. So your red lines are enforced twice, by two mechanisms that fail differently.",
  "gyms.diff.lock1_tag": "Lock 1 — injected",
  "gyms.diff.lock1": "Your method goes into the prompt, on every message.",
  "gyms.diff.lock2_tag": "Lock 2 — verified",
  "gyms.diff.lock2":
    "Every outgoing message is scanned against your red lines before it is sent. Deterministic, no model in that loop. That one is the guarantee.",
  "gyms.diff.trace_label": "What that looks like, on one message",
  "gyms.diff.trace_example": "Example — a gym whose method rules out grazing",
  "gyms.diff.trace_ask": "A member asks",
  "gyms.diff.trace_ask_text": "“Should I add a snack between lunch and dinner?”",
  "gyms.diff.trace_draft": "The draft said",
  "gyms.diff.trace_draft_text":
    "“A small snack mid-afternoon can help — try six smaller meals across the day.”",
  "gyms.diff.trace_held": "Held by lock 2",
  "gyms.diff.trace_sent": "What went out instead",
  "gyms.diff.trace_sent_text":
    "“Three real meals. If you're hungry between them, the meal before was too small — fix the meal, not the gap.”",
  "gyms.diff.trace_note":
    "That replacement isn't ours. Each red line carries what you do instead, in your words, and that is what your member receives.",
  "gyms.diff.close":
    "Your member never gets a refusal, and never gets “ask your coach” for a question you have answered a hundred times on the floor. They get your answer, at 9pm on a Tuesday, while you're at home.",

  // Gyms — doctrine. Les trois règles de `/`, au vocabulaire de la salle. La
  // première mord plus fort ici: un classement public de qui a bien mangé est
  // exactement ce qu'une salle serait tentée d'afficher, et exactement ce que
  // ce produit refuse de calculer.
  "gyms.doctrine.kicker": "Our doctrine",
  "gyms.doctrine.title": "Three rules we don't bend",
  "gyms.doctrine.rule1_title": "You teach. They decide. Nobody is graded.",
  "gyms.doctrine.rule1_body":
    "No adherence score, no percentage, no streak, no leaderboard of your members. A member is not marked against a plan they never signed, and a gym is the last place a public ranking of who ate well would help anyone. The week records how it went; the judgement stays yours.",
  "gyms.doctrine.rule2_title": "Every line names the conviction it came from.",
  "gyms.doctrine.rule2_body":
    "When a member builds their week out of your method, each food line says which of your convictions it applies — and the database refuses a line that names none. That's a constraint, not a convention. Your member reads the belief under the line, so you can both judge whether it was a fair reading of you.",
  "gyms.doctrine.rule3_title": "Silence is never rounded up.",
  "gyms.doctrine.rule3_body":
    "A member who tapped twice hasn't given us a week. They come back as “not enough check-ins”, never as “doing fine”. It costs us a nicer-looking Monday page, and it is the only reason that page is worth acting on.",
  // Même virage que `landing.doctrine.no_calories_*`, même jour, même raison —
  // et la même ligne LEGAL.md §6.4 à ne pas franchir. Les deux pages portent le
  // MÊME argument: elles bougent ensemble, ou l'une des deux reste le refus
  // d'identité qu'on vient d'abandonner sur l'autre.
  //
  // Le titre perd « or macros » avec le reste: une salle est l'acheteur le plus
  // susceptible d'en vouloir, et l'ancien titre lui disait non avant de lui
  // expliquer quoi que ce soit.
  "gyms.doctrine.no_calories_title": "Calories — what a photo can actually tell you.",
  "gyms.doctrine.no_calories_body":
    "We measured it on our own model before deciding. Given the quantities, it is accurate: 2.3% average error against USDA reference data. Asked to guess them off a photo, it is not — across 85 real analyses, estimates came in 26.6% under the truth on average, and that error leans the same way every time instead of cancelling out over a week. When the model offers its own margin of error, the truth falls inside it barely more than half the time.",
  "gyms.doctrine.no_calories_body2":
    "So Sophia leads with the half a photo is good at: what was eaten, when, and how big — small, moderate or large. That part your member can check at a glance, and a miss gets corrected in one message. Where a number does appear, it is an estimate and it is labelled as one: never a target your member is measured against, never a score, and never a stand-in for your method. Prescribing numbers stays with whoever is qualified to do it.",

  // Gyms — pricing. UNE SEULE CARTE, comme sur `/` depuis la migration
  // 20260806170000: le siège facturable est le membre RATTACHÉ, plus le membre
  // actif. Le tarif annuel est une remise commerciale, pas un plan distinct —
  // une deuxième carte obligerait le gérant à faire une addition pour un écart
  // d'un euro.
  //
  // `billing_note` N'EST PAS UNE PRÉCAUTION: c'est le silence n°1 de l'en-tête
  // de ce bloc. Il n'existe aucun SKU membre dans Stripe, donc l'encaissement
  // n'existe pas, et un gérant qui le découvre après avoir signé est un pilote
  // perdu.
  "gyms.pricing.kicker": "Pricing",
  "gyms.pricing.title": "7 € a member. You set what they pay.",
  "gyms.pricing.seat": "7 €",
  "gyms.pricing.seat_period": "per enrolled member, per month",
  "gyms.pricing.seat_label": "No platform fee. No setup. Nothing else.",
  "gyms.pricing.annual": "6 € for a member who has paid for their year up front.",
  "gyms.pricing.why":
    "You pay for the members you have enrolled, and you stop paying the month you turn a seat off. Charge them what you like on top — at one member and at five hundred the arithmetic is the same, and it is positive from the first. The number to weigh this against isn't the hours you save, because it doesn't cost you any: it's what one member who stays three months longer is worth to you.",
  "gyms.pricing.billing_note":
    "You bill your members yourself, on whatever you already use for the membership. Sophia never touches their payment and never sees it.",
  "gyms.pricing.cta": "Start the 14-day trial",
  "gyms.pricing.trial_note": "14 days, up to 3 members, then it stops on its own.",

  // Gyms — closing call
  "gyms.closing.title": "You already coach the training. This is the other twenty-one meals.",
  "gyms.closing.cta": "Start the 14-day trial",
  "gyms.closing.signin_prompt": "Already using Sophia?",
  "gyms.closing.signin_link": "Sign in",

  // ==========================================================================
  // /communities — LA TROISIÈME PAGE, ET SA DOULEUR N'EST NI LE REVENU NI LE CHURN
  // ==========================================================================
  // `/` vend à quelqu'un dont le revenu S'ARRÊTE (un cours se paie une fois).
  // `/gyms` vend à quelqu'un dont les membres PARTENT. Le propriétaire d'une
  // communauté payante n'a ni l'un ni l'autre problème en premier: il a déjà le
  // récurrent, il a déjà prouvé qu'il sait le vendre, ses membres paient tous
  // les mois. Lui vendre « transformez votre formation en programme » ne décrit
  // rien de sa vie, et il repère l'erreur de cible en une phrase.
  //
  // ── SA DOULEUR EST STRUCTURELLE, ET C'EST TOUT L'ANGLE DE LA PAGE ─────────
  // Une communauté est un FIL. Il répond en public, au groupe. L'attention
  // individuelle n'y est pas rare, elle est IMPOSSIBLE — c'est l'architecture,
  // pas l'organisation, et il ne comblera jamais ce trou en travaillant plus.
  // Ses membres partent précisément pour ça: ils ne voient pas de résultat
  // personnel. La page le dit dès le titre, sans détour, parce que c'est ce
  // qu'il a déjà pensé sans l'avoir formulé.
  //
  // ── LES DEUX INTERDITS QUI TIENNENT CHAQUE LIGNE CI-DESSOUS ──────────────
  // 1. NE JAMAIS DÉNIGRER LA COMMUNAUTÉ, ET NE JAMAIS SE POSER EN REMPLAÇANT.
  //    C'est une RÉPARTITION DES RÔLES: ses pairs, sa culture, ses posts
  //    restent chez lui; on ne prend que ce qu'un groupe ne saura jamais faire
  //    — répondre à 21h sur SON dîner à LUI, et relancer celui qui a décroché
  //    depuis trois jours. Une page qui attaque son actif principal a perdu au
  //    premier paragraphe. `communities.roles.*` porte ce partage en deux
  //    colonnes plutôt qu'en une phrase qu'on pourrait lire de travers.
  // 2. NE JAMAIS LUI DEMANDER DE TOUT REFAIRE. Sa communauté ne bouge pas:
  //    même prix, même plateforme, mêmes posts. Ce qu'on ajoute se pose
  //    PAR-DESSUS. Le test de relecture de cette page est exactement celui-là —
  //    quelqu'un qui a 500 membres payants doit la finir en se disant « je ne
  //    touche à rien ». `communities.not.title` répond à la question avant
  //    qu'il la pose.
  //
  // ── LES QUATRE SILENCES, VÉRIFIÉS DANS LE CODE LE 2026-08-06 ─────────────
  //   1. AUCUNE INTÉGRATION Skool, Circle, Discord ou Kajabi. Zéro ligne. La
  //      seule entrée est `coach-invite-student-v1`: une invitation E-MAIL par
  //      membre, envoyée depuis l'espace du coach. Il n'existe même pas de
  //      « copier le lien » — `InviteDialog` ne voit jamais le token, et c'est
  //      délibéré. `communities.not.item1_body` dit donc « par e-mail », jamais
  //      « par lien ».
  //   2. AUCUN ENCAISSEMENT. `stripe-create-checkout-session` n'a pas de SKU
  //      élève: le membre ne paie jamais Sophia.
  //   3. AUCUNE COUCHE SOCIALE, et c'est un CHOIX à dire à voix haute plutôt
  //      qu'un manque à cacher: sa communauté EST la couche sociale, en
  //      fabriquer une seconde reviendrait à lui prendre son actif.
  //   4. PROTOCOLE NUTRITIONNEL SEULEMENT, et pas d'application native.
  //
  // ── ET LE CHIFFRE QU'ON N'INVENTE PAS ────────────────────────────────────
  // AUCUN taux de rétention n'est avancé — nous n'en avons pas mesuré un seul.
  // `communities.pricing.why` pose la QUESTION (« combien vaut un membre qui
  // reste trois mois de plus ? ») exactement comme `landing.pricing.why` et
  // `gyms.churn.p3_body`. Le repère de marché qui a servi à calibrer l'exemple
  // (moitié des communautés santé payantes sur Skool, prix médian 29 $) N'EST
  // PAS IMPRIMÉ: aucune source de ce dépôt ne le porte, et la règle de `/` vaut
  // ici — un chiffre vient d'une source qu'on peut montrer, ou il n'apparaît pas.
  //
  // ⚠️ L'EXEMPLE CHIFFRÉ EST EN EUROS DE BOUT EN BOUT. La tentation était de
  // citer les prix de communauté en dollars (c'est la monnaie de Skool) et de
  // soustraire un siège en euros — une soustraction entre deux monnaies, sur la
  // seule section où le lecteur sort sa calculatrice. Un seul signe partout.
  //
  // ⚠️ ET L'ÉCART EST DE 12 €, PAS DE 30 €. La première version montait le
  // palier de 29 € à 59 €: elle demandait au membre de DOUBLER sa dépense, et
  // un propriétaire qui connaît sa base sait qu'on ne double pas un prix pour
  // ajouter une couche. Un écart qu'on ne croit pas discrédite le reste de la
  // page — y compris ce qui est vrai. 12 € sur 29 € (+41%) est un écart qu'un
  // membre accepte sans y réfléchir, et c'est celui qu'on montre. La marge est
  // plus mince et elle est dite: il en garde 5 sur 12.
  //
  // L'arithmétique, à revérifier si l'un de ces nombres bouge:
  //   500 membres × 30% = 150   |   écart 41 − 29 = 12 €
  //   150 × 12 € = 1 800 €   |   150 × 7 € = 1 050 €   |   1 800 − 1 050 = 750 €
  //   750 × 12 = 9 000 €/an
  // Et 150, c'est aussi la cohorte du panneau du lundi: deux nombres qui ne
  // concordent pas sur une page de vente, et c'est toute la page qui devient
  // approximative.
  "communities.seo_title": "Sophia for communities — the coached tier a thread can't be",
  "communities.seo_description":
    "You run a paid community. It is a thread: you answer in public, to the group, and no member gets an answer of their own. Sophia is the individual layer underneath — an agent that answers each member every day in your method and your words, and reaches the ones who have gone quiet. Your community doesn't change; a coached tier sits on top of it. 7 € per member, per month, and you charge what you like on top.",

  // Communities — hero. Le titre nomme l'ARCHITECTURE, pas la fatigue. « Tu es
  // débordé » est faux et vaguement insultant pour quelqu'un qui tient une
  // communauté de 500 personnes; « un fil ne peut pas répondre à une personne »
  // est vrai, structurel, et impossible à contester.
  "communities.hero.kicker": "For owners of a paid community",
  "communities.hero.title": "A community is a thread. A thread can't answer one person.",
  "communities.hero.subtitle":
    "You answer in public, to the group. That isn't a scheduling problem more hours would fix — it's the shape of the thing you built, and your members feel it as never getting an answer of their own. Sophia is the layer underneath: an agent that answers each member individually, every day, in your method and your words. Your community doesn't change. A coached tier sits on top of it.",
  "communities.hero.cta_trial": "Start the 14-day trial",
  "communities.hero.cta_signin": "Sign in",
  // Les trois faits qu'il vérifiera en premier, dans l'ordre où ils le
  // rassurent: la porte est petite (3), l'entrée est simple (un e-mail), et
  // rien ne lui retombe dessus (aucune boîte de réception).
  "communities.hero.note":
    "14 days, up to 3 members, then it stops on its own. You invite them by email from your workspace and each one gets a space of their own, chat included. Nothing to migrate, nothing to plug into your platform, and no inbox coming back to you.",
  "communities.hero.try_prompt": "Want to see it from a member's side first?",
  "communities.hero.try_cta": "Try the free program",

  // Communities — le panneau du lundi. MÊME ÉCRAN que sur `/`, cohorte
  // différente: 150 membres, soit les 3 sur 10 d'une communauté de 500 qui
  // prennent le palier coaché — le même 150 que l'exemple de revenu.
  //
  // PAS DE GRILLE DE PASTILLES ICI, contrairement à `/`. À 34 élèves une
  // pastille par personne se compte; à 150 elle devient une texture, c'est-à-
  // dire une PROPORTION — et une proportion est à un pas du pourcentage que ce
  // produit refuse d'imprimer. Des lignes chiffrées se lisent à toute taille.
  //
  // Les libellés et les seuils sont ceux du produit (`_shared/keel/
  // coach_synthesis.ts`: 48h ouvre `slipping`, 120h ouvre `silent`).
  "communities.mock.monday_title": "Monday",
  "communities.mock.monday_subtitle": "One page. Not a thread.",
  "communities.mock.contact_label": "Who's still talking",
  "communities.mock.contact_in_touch": "In touch",
  "communities.mock.contact_in_touch_hint": "answered within 2 days",
  "communities.mock.contact_slipping": "Slipping",
  "communities.mock.contact_slipping_hint": "quiet 2 to 5 days",
  "communities.mock.contact_silent": "Silent",
  "communities.mock.contact_silent_hint": "quiet 5 days or more",
  // La légende qui porte l'argument de la page entière, et elle est SOUS le
  // bloc contact plutôt qu'en pied de panneau: c'est ce chiffre-là, et aucun
  // autre, qu'elle commente.
  "communities.mock.contact_caption":
    "In your thread, those 45 don't exist — they aren't posting, so there is nothing to see. Here they are a number, on the first line, while they are still reachable.",
  "communities.mock.felt_label": "How the week felt",
  "communities.mock.felt_sustainable": "Holding up",
  "communities.mock.felt_strained": "Strained",
  "communities.mock.felt_hard": "Having a hard time",
  "communities.mock.felt_unknown": "Not enough check-ins to say",
  "communities.mock.intent_label": "What they set themselves",
  "communities.mock.intent_line": "88 of 150 wrote themselves a week from your method.",
  "communities.mock.caption":
    "A schematic of the Monday page. The wording is the product's own; the cohort is an example — the 150 members of a 500-person community who took the coached tier.",

  // Communities — LE FIL. La section pose l'architecture et refuse le confort
  // du « tu es débordé »: il ne l'est pas, il est SANS CANAL. Les trois lignes
  // sont des scènes de communauté, pas des questions de nutrition — il doit se
  // reconnaître avant qu'on lui parle de produit.
  "communities.thread.kicker": "The problem",
  "communities.thread.title":
    "You can't give individual attention to a group. That's architecture, not workload.",
  "communities.thread.body":
    "Your members pay every month, and what they get is a thread: your posts, your calls, other members answering each other. When one of them asks at 9pm whether they can swap tonight's dinner, your options are a public answer that has to fit everybody, or nothing. You are not short of hours. You are short of a channel — and there is no number of hours that produces one.",
  "communities.thread.q1":
    "The question three other members answer, contradicting each other, before you've even seen it.",
  "communities.thread.q2":
    "The same question for the fourth time this month, because nobody scrolls back.",
  "communities.thread.q3":
    "The member who stopped posting in March. You find out when their card is declined.",
  "communities.thread.close":
    "Nobody cancels because your method was wrong. They cancel because they never got a result of their own — and a thread is, by construction, the one place where nobody does.",

  // Communities — LE PALIER. C'est la section qui fait signer, et sa première
  // phrase est « tu ne changes rien »: quelqu'un qui a 500 membres payants
  // n'achète pas une migration, il achète une ligne de plus sur sa page de
  // vente. Le tableau est étiqueté EXEMPLE, et les deux inconnues sont nommées
  // — son prix et son taux de passage. Le seul chiffre qui nous engage est 7 €.
  "communities.tier.kicker": "What you add",
  "communities.tier.title": "A tier above what you already sell. You change nothing that works.",
  "communities.tier.body":
    "Your community stays exactly as it is: same platform, same price, same posts, same people, same you. Above it you open one more option — the same community, plus an agent that coaches them one to one in your method. The members who want that upgrade. The ones who don't never notice it exists.",
  "communities.tier.example_label": "A worked example",
  "communities.tier.row1_label": "Your community",
  "communities.tier.row1_value": "29 €",
  "communities.tier.row1_note": "Unchanged. Same platform, same price, same posts.",
  "communities.tier.row2_label": "The coached tier",
  "communities.tier.row2_value": "41 €",
  "communities.tier.row2_note": "All of the above, plus their own agent, every day.",
  "communities.tier.row3_label": "What it costs you",
  "communities.tier.row3_value": "7 €",
  "communities.tier.row3_note": "Per member on that tier, per month. Nothing for the others.",
  "communities.tier.math":
    "Twelve euros more than they already pay — the kind of step a member says yes to without doing sums. Five hundred members, three in ten take it: 150 × 12 €, minus 150 seats at 7 €. You keep 5 € per member, every month, on people you have already sold to — about 750 € a month, 9,000 € a year, for no extra hour in your week.",
  "communities.tier.math_caption":
    "An example, and it says so: your price and your take-up are the two numbers that decide the total, and both are yours. What isn't an estimate is the 7 €, and that it only applies to the members who upgrade. Ask for a bigger step and the arithmetic gets better — we'd rather show you the one you'll actually get.",
  "communities.tier.billing":
    "You keep charging them where you already charge them. No member ever pays Sophia — nothing about how you collect money has to move.",

  // Communities — LA RÉTENTION, dite comme une RÉPARTITION DES RÔLES.
  //
  // C'est la section la plus facile à rater. « Tes membres partent, on les
  // retient » se lit comme « ta communauté ne marche pas » — or elle marche, il
  // a prouvé qu'il sait vendre du récurrent. Ce qui ne marche pas, c'est ce
  // qu'un groupe ne saura JAMAIS faire, et c'est la seule chose qu'on prend.
  // Les deux colonnes rendent le partage visible sans une phrase de plus.
  //
  // La relance du 3e jour est réelle et vérifiée: `keel-reengage-v1` part à 72h
  // de silence, écrit dans `chat_messages`, et `composeReengageBody` compose le
  // texte à partir de la doctrine PUBLIÉE du coach (repli déterministe si elle
  // manque). D'où « in your method », qui serait un mensonge sans ça.
  "communities.roles.kicker": "Why they stay",
  "communities.roles.title": "Keep the peers. Add the thing a group was never going to do.",
  "communities.roles.body":
    "A community is good at exactly what a community is good at: people going through the same thing at the same time, who answer each other at midnight and notice when someone disappears for a week. Sophia doesn't touch that, and doesn't want it. What a group cannot do — answer one person, at 9pm, about the dinner actually in front of them, with their constraints and their week — is the whole of what Sophia does.",
  "communities.roles.group_title": "Stays in your community",
  "communities.roles.group_body":
    "The peers. The culture you built. Your posts, your calls, the wins people put up on a Friday, the feeling of being in it with other people. That is what they joined for, and no agent produces it.",
  "communities.roles.agent_title": "Goes to their agent",
  "communities.roles.agent_body":
    "The 9pm question about their own plate. The week built out of your method for their kitchen and their schedule. And a message on the third quiet day — written in your method, not a generic “we miss you” — so a member who slipped hears from you before their subscription is the thing that speaks.",
  "communities.roles.close":
    "A member who is getting a result of their own stays in a community they would otherwise have left quietly, in month four, without ever telling you why.",

  // Communities — LES DONNÉES. L'angle est le SILENCE: dans un fil il ne voit
  // que les bavards, et les dix qui postent cachent les quatre-vingt-dix qui
  // décrochent. Chaque item correspond à une ligne que `renderSynthesisText`
  // émet vraiment — contact, vivabilité, semaines composées. Rien ici ne décrit
  // un écran qu'on n'a pas.
  //
  // ⚠️ « names in your member list » ET PAS « names on the Monday page »: la
  // synthèse ne nomme que trois personnes (`TO_CATCH_UP_CAP`), les états par
  // membre se lisent sur la liste de cohorte (`contactStateFor`, `/coach`).
  "communities.data.kicker": "What a thread never tells you",
  "communities.data.title": "In a thread, you only ever see the ten who post.",
  "communities.data.body":
    "Ten people posting can hide ninety who quietly stopped, and you have no way to tell a member doing fine in silence from one who left in their head six weeks ago. On Monday, Sophia gives you one page — computed from what actually happened, never written by a model — and the first thing on it is the people who said nothing.",
  "communities.data.item1_title": "Who's still talking",
  "communities.data.item1_body":
    "In touch, slipping, silent: counts on the Monday page, names in your member list. A silent member is still a member you can reach, and that is the entire reason the number comes first.",
  "communities.data.item2_title": "How the week was actually lived",
  "communities.data.item2_body":
    "Holding up, strained, having a hard time — from one tap each evening, not from whoever felt like posting. It is the closest you will get to knowing whether the method you teach survives an ordinary week in someone's kitchen.",
  "communities.data.item3_title": "What they set themselves",
  "communities.data.item3_body":
    "How many of them built their own week out of your method, and which of your convictions each line applies. In a thread, the strongest signal you can get about your own material is a like.",
  "communities.data.close":
    "And when there isn't enough to say something, the page says so instead of rounding it up. A member who tapped twice hasn't given you a week, and comes back as “not enough check-ins” rather than as “doing fine”.",

  // Communities — CE CONTRE QUOI IL VA NOUS COMPARER, et ce n'est pas une autre
  // IA: c'est un canal Discord de plus, ou un coach humain à recruter. C'est la
  // PREMIÈRE objection qu'il formulera. Section courte — l'esquiver coûte la
  // crédibilité de tout ce qui précède, s'y attarder donne à l'objection plus de
  // place qu'elle n'en mérite.
  "communities.compare.kicker": "What you're actually choosing between",
  "communities.compare.title": "Not another AI. One more channel, or one more salary.",
  "communities.compare.channel_title": "One more channel",
  "communities.compare.channel_body":
    "A #nutrition room, a weekly Q&A thread, a form. Every one of them is still a room: you answer in public, to whoever happens to be reading, and the member at 9pm still gets an answer written for everybody. Adding rooms doesn't add individual attention — it adds places to be behind.",
  "communities.compare.hire_title": "One more coach",
  "communities.compare.hire_body":
    "A person costs a salary, has to be taught your method, answers on their hours, and does not hold five hundred members. And their answers are theirs: the first time one of them contradicts you in front of your own community, the thing you built takes the damage.",
  "communities.compare.close":
    "Sophia is neither. It is one layer, running underneath the community you already have, that answers in your method and holds your lines while you're asleep.",

  // Communities — SA VOIX. Cette section n'existe ni sur `/` ni sur `/gyms`, et
  // elle est ici parce que la cible est la seule pour qui c'est L'ACTIF: un
  // propriétaire de communauté a une marque, un ton, des formules que ses
  // membres reconnaissent au premier paragraphe. Il ne loue pas un modèle, il
  // prête sa voix — et c'est pour lui que le double verrou compte le plus.
  //
  // La maquette montre les VRAIS champs de la doctrine (`_shared/keel/
  // doctrine.ts`): `voice.address`, `voice.length` / `voice.emojis`,
  // `vocabulary` (terme + sens), et une ligne interdite avec son `instead`.
  // Même règle que le panneau du lundi — on ne montre pas un écran qu'on n'a pas.
  "communities.voice.kicker": "Your voice is the asset",
  "communities.voice.title": "It answers in your words. Not in ours, and not in a house style.",
  "communities.voice.body":
    "Your members can tell your writing from a generic health post at a glance, and that recognition is most of what they are paying for. So Sophia doesn't get a personality of its own — it gets yours: how you address people, how long you go on, the words you use and what you mean by them, the positions you hold, and what you say instead when someone asks for something you don't recommend. You write it once, in a guided interview, and you read back exactly what it understood before any of it is published.",
  "communities.voice.mock_label": "What Sophia holds of your voice",
  "communities.voice.mock_address_label": "How you speak to them",
  "communities.voice.mock_address_value": "First name, informal. Two or three sentences. No emojis.",
  "communities.voice.mock_term_label": "One of your terms",
  "communities.voice.mock_term_value":
    "“Reset day” — a day you plan light on purpose. Not a day you failed.",
  "communities.voice.mock_line_label": "One of your red lines",
  "communities.voice.mock_line_value": "Never recommend grazing between meals.",
  "communities.voice.mock_instead_label": "…and what you say instead",
  "communities.voice.mock_instead_value":
    "Three real meals. If you're hungry between them, the meal before was too small.",
  "communities.voice.mock_caption":
    "Your own words, stored as you wrote them. Revise any of it whenever you like — the change lands on the next message — and roll back to an earlier version without losing what your members actually received.",
  "communities.voice.close":
    "Which raises the only question that matters once you've handed your voice to software: what happens the day it says something you would never say, in front of the people who know how you write.",

  // Communities — LE DOUBLE VERROU. Même garantie que sur `/`, et c'est le bloc
  // sombre de cette page aussi. Il vient APRÈS la section voix, parce qu'il
  // protège l'actif qu'elle vient de nommer: dans l'autre ordre, le verrou
  // garderait quelque chose que le lecteur n'a pas encore vu.
  "communities.lock.kicker": "The part you should be most afraid of",
  "communities.lock.title":
    "An AI speaking in your name, to your own members, is a risk. We treat it as one.",
  "communities.lock.body":
    "A prompt is an instruction, not a guarantee. Tell any model “never recommend grazing between meals” and it will comply almost always — and almost always is the wrong number when one public contradiction of you is the screenshot that gets posted in your own community. So your red lines are enforced twice, by two mechanisms that fail differently.",
  "communities.lock.lock1_tag": "Lock 1 — injected",
  "communities.lock.lock1": "Your method goes into the prompt, on every message.",
  "communities.lock.lock2_tag": "Lock 2 — verified",
  "communities.lock.lock2":
    "Every outgoing message is scanned against your red lines before it is sent. Deterministic, no model in that loop. That one is the guarantee.",
  "communities.lock.trace_label": "What that looks like, on one message",
  "communities.lock.trace_example": "Example — an owner whose method rules out grazing",
  "communities.lock.trace_ask": "A member asks",
  "communities.lock.trace_ask_text": "“Should I add a snack between lunch and dinner?”",
  "communities.lock.trace_draft": "The draft said",
  "communities.lock.trace_draft_text":
    "“A small snack mid-afternoon can help — try six smaller meals across the day.”",
  "communities.lock.trace_held": "Held by lock 2",
  "communities.lock.trace_sent": "What went out instead",
  "communities.lock.trace_sent_text":
    "“Three real meals. If you're hungry between them, the meal before was too small — fix the meal, not the gap.”",
  "communities.lock.trace_note":
    "That replacement is not ours. Each red line carries what you do instead, in your words, and that is what your member receives.",
  "communities.lock.close":
    "Your member never gets a refusal, and never gets “ask in the group” — which would hand them back to the thread you added this layer to get past. They get your answer.",

  // Communities — la doctrine. Les trois mêmes règles que `/`, en « member ».
  // La première compte double ici: le classement et les séries de jours sont
  // exactement ce qu'un propriétaire de communauté a envie de demander, et
  // c'est la seule section de la page qui lui dit non. Elle le dit en nommant
  // la demande, pas en la contournant.
  "communities.doctrine.kicker": "Our doctrine",
  "communities.doctrine.title": "Three rules we don't bend",
  "communities.doctrine.rule1_title": "You teach. They decide. Nobody is graded.",
  "communities.doctrine.rule1_body":
    "No adherence score, no percentage, no streak, no leaderboard of your members — and yes, the leaderboard is the thing we get asked for. A member is not marked against a plan they never signed. The week records how it went; the judgement stays yours.",
  "communities.doctrine.rule2_title": "Every line names the conviction it came from.",
  "communities.doctrine.rule2_body":
    "When a member builds their week out of your method, each food line says which of your convictions it applies — and the database refuses a line that names none. That's a constraint, not a convention. Your member reads the belief under the line, so you can both judge whether it was a fair reading of you.",
  "communities.doctrine.rule3_title": "Silence is never rounded up.",
  "communities.doctrine.rule3_body":
    "A member who tapped twice hasn't given us a week. They come back as “not enough check-ins”, never as “doing fine”. It costs us a nicer-looking page, and it's the only reason the page is worth reading.",
  "communities.doctrine.no_calories_title": "And no, Sophia doesn't count calories.",
  "communities.doctrine.no_calories_body":
    "We measured it on our own model before deciding: across 85 real analyses scored against USDA reference data, calorie estimates from a photo came in 26.6% under the truth on average, and the gap widens as the plate gets fuller. That error doesn't average out over a week — it leans the same way every time, hardest exactly where you'd want to look. Worse, when the model offers its own margin of error, the truth falls inside it barely more than half the time: it doesn't know when it's wrong.",
  "communities.doctrine.no_calories_body2":
    "Reading a plate and weighing it are different jobs. What's on the plate, your member can check at a glance — a miss gets corrected in one message. A calorie count is the one estimate nobody at the table can verify, and it's the number decisions get made on. So Sophia keeps the half that works — what was eaten, when, and how big: small, moderate or large — and leaves the numbers to whoever is qualified to prescribe them. That half is not the consolation prize, it is the part that carries the result: how often a member logs is the strongest predictor of outcomes we know of; how precisely, predicts nothing. A deterministic filter strips any calorie or macro target the model produces anyway, and logs that it did. The refusal is the feature.",

  // Communities — LES BORNES, ET ELLES SONT DITES AVANT LE PRIX.
  //
  // Il arrive avec une question qu'il ne posera pas à voix haute: « qu'est-ce
  // que je vais devoir brancher, migrer, refaire ». La réponse est RIEN, et
  // elle vaut mieux que n'importe quel argument de la page — mais seulement si
  // on donne aussi ce qu'on n'a pas, dans la même respiration. Les quatre
  // bornes sont des faits du dépôt, pas des précautions juridiques.
  "communities.not.kicker": "What this is not",
  "communities.not.title": "Before you ask what you'd have to rebuild: nothing.",
  "communities.not.item1_title": "It does not plug into your platform",
  "communities.not.item1_body":
    "There is no Skool, Circle, Discord or Kajabi integration — none, and we would rather say it here than let you find out on day one. Members come in through an email invitation you send from your workspace, and that is the whole of the setup on your side.",
  "communities.not.item2_title": "It has no social layer, on purpose",
  "communities.not.item2_body":
    "Members never see each other in Sophia — no feed, no rooms, no comments. Building a second place for your people to gather would be taking the one thing you own. Your community is the social layer; this is the private half.",
  "communities.not.item3_title": "It never bills your members",
  "communities.not.item3_body":
    "No member ever pays us, or even sees us as something to pay for. You set the price of your tier, you collect it where you already collect it, and you pay us per seat.",
  "communities.not.item4_title": "It does one job",
  "communities.not.item4_body":
    "A nutrition protocol: plates, weeks, and how the days went. Not training, not mindset, not an app to install. If food isn't part of what your community is for, the honest answer is that this isn't for you yet.",
  "communities.not.close":
    "Your platform, your prices, your posts and your members all stay exactly where they are. What you are adding is one option on your sales page.",

  // Communities — le prix. UNE SEULE CARTE, comme sur `/` et `/gyms`: deux
  // cartes obligent à faire une addition, et une addition sur une page de vente
  // est un endroit où se tromper.
  //
  // `why` POSE UNE QUESTION plutôt que d'avancer un chiffre de rétention: on ne
  // sait pas de combien elle bouge, personne ne l'a mesuré, et un pourcentage
  // inventé ici serait le premier chiffre faux de la page — sur la section où
  // le lecteur est le plus attentif.
  "communities.pricing.kicker": "Pricing",
  "communities.pricing.title": "One line, and only for the members who upgrade.",
  "communities.pricing.seat": "7 €",
  "communities.pricing.seat_period": "per member, per month",
  "communities.pricing.seat_label": "No platform fee. No setup. Nothing else.",
  "communities.pricing.annual": "6 € for a seat paid a year up front.",
  "communities.pricing.why":
    "You pay for the members you have put on the coached tier, and you stop paying the month you turn a seat off. The rest of your community costs you nothing, because they aren't here. The number to weigh this against isn't the hours you save, because it doesn't cost you any: it's what one member who stays three months longer is worth to you, at your own price.",
  "communities.pricing.cta": "Start the 14-day trial",
  "communities.pricing.trial_note": "14 days, up to 3 members, then it stops on its own.",

  // Communities — la clôture. Elle répète le seul engagement qui compte pour
  // cette cible, et c'est un engagement de NON-ACTION: il ne refait rien.
  //
  // ⚠️ NE PAS REVENIR À UNE MÉTAPHORE ICI. La version précédente disait « this
  // is the half a thread was never going to deliver »: « the half » n'avait
  // aucun antécédent dans sa propre phrase (la moitié de QUOI ?), et « the half
  // a thread » se lit d'abord comme un seul groupe de mots. Une clôture est la
  // dernière phrase qu'on lit avant de cliquer — c'est le pire endroit du site
  // pour faire travailler le lecteur. Celle-ci referme sur le titre du hero (un
  // fil ne peut pas répondre à une personne) et sur la formule que la page a
  // déjà employée deux fois, « an answer of their own ».
  "communities.closing.title":
    "You already have the members, the price and the method. What a thread can't give them is an answer of their own.",
  "communities.closing.cta": "Start the 14-day trial",
  "communities.closing.signin_prompt": "Already using Sophia?",
  "communities.closing.signin_link": "Sign in",

  // ── LE FOYER ────────────────────────────────────────────────────────────
  // Autorité produit: docs/keel/PIVOT-FOYER.md §8.
  //
  // DEUX REGISTRES QUI NE SE MÉLANGENT JAMAIS (§8.5 règle 4). Ce que dit
  // Sophia est épistémique et discutable; ce que pose le compte maître est
  // domestique et attribué à lui. Aucune phrase de ce bloc ne doit faire
  // passer une décision de foyer pour un conseil de santé — c'est pour ça que
  // `household.restriction.notice_owner` nomme la personne, et que rien ici
  // ne parle jamais de ce qui est « bon » ou « mauvais » pour quelqu'un.
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
} as const
