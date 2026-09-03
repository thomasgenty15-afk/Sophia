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
  // C9 — la ligne d'annuaire EST là, le nom n'a jamais été écrit. Mesuré 9 liens
  // actifs sur 359. Dire « masqué » accusait le lien d'un défaut du profil.
  "coach.home.student_no_name": "No name on their profile yet",
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
  // ── C9 · L'ESCALADE QUI ATTEND UNE DÉCISION ─────────────────────────────
  // `generate-week-plan-v1` refuse la semaine d'un mineur et dit à l'élève
  // « your coach has been told ». La ligne partait bien en base (C5 ① l'a
  // réparée, la contre-épreuve HTTP du 2026-08-13 l'a vue atterrir) — mais
  // AUCUN écran ne la lisait. Ces clés sont le lecteur qui manquait.
  //
  // ⚠️ AUCUNE COPIE NE PROMET UN BOUTON DE FERMETURE. Épreuve faite: pas de
  // policy UPDATE pour le coach, pas de RPC (`prosrc`), pas d'écran. La seule
  // sortie réelle est de terminer le lien — et c'est ce que la copie dit.
  "coach.home.held_title": "Held — waiting on you",
  "coach.home.held_badge": "Held",
  "coach.home.held_since": "Held since {date}",
  "coach.home.held_hint":
    "Nothing is generated for these students until something changes. There is no button here to clear it: coaching a minor sits inside your professional framework, not ours, so the decision is yours — take it with them, or end the link from their page.",
  "coach.home.held_unreadable":
    "Open escalations could not be read. Someone may be waiting on a decision — this list is missing, not empty.",

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
    "The only food vocabulary this form has. Quantities are not yours to set here — Sophia works them out per student, from their body and their goal.",
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
  // ── LANCEMENT B2C — l'espace pro est fermé (`VITE_B2C_ONLY`) ────────────
  // Un état À PART de `not_coach`, et le mot le dit: « cet espace est réservé
  // aux coachs » à quelqu'un QUI EST coach est un mensonge, et il l'envoie
  // créer un second compte pour réparer un refus qui ne vient pas de lui.
  "coach.guard.closed_title": "The coach workspace is closed",
  "coach.guard.closed_body":
    "We are focused on households right now, so coach accounts are paused. Nothing has been deleted, and we will write to you when the workspace reopens.",

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
  // ⚠️ CETTE PHRASE DISAIT « The coach workspace ships in English. » ET ELLE
  // EST DEVENUE FAUSSE AU LOT 5, qui a livré les sept écrans coach en français.
  // Une copie qui ment sur ce que le produit fait est une copie à corriger même
  // quand personne ne la lit — et personne ne la lit: `coach.signup.*` n'a plus
  // aucun appelant depuis que l'ouverture d'un compte coach passe par
  // `/auth?role=coach` et ses clés `auth.coach.*`.
  "coach.signup.language_hint": "The coach workspace ships in English and French.",
  "coach.signup.submit": "Create my coach account",
  "coach.signup.switch_to_login": "I already have a coach account",
  "coach.signup.failed":
    "Your account exists, but the coach profile could not be created. Sign in again to retry.",

  // ── PIVOT C5 · /coach/weekly — LA LECTURE DU LUNDI ──────────────────────
  // Ces phrases étaient EN DUR dans `pages/CoachWeeklyPage.tsx` (neuf
  // littéraux, dont le titre passé quatre fois à la coquille) et les huit
  // motifs de signalement dans un catalogue parallèle, `copy/flagReasons.ts`.
  // Les deux réimplémentaient `t()` hors du seed: ni sa garde ni le scanner de
  // coutures ne les voyaient.
  //
  // ⚠️ CETTE PAGE N'EST PAS DÉCLARÉE TRADUITE, ET CE N'EST PAS CE BLOC QUI LA
  // BLOQUE. Sa première carte — « comment la semaine s'est passée », l'argument
  // de l'écran — est le champ `coach_syntheses.narrative`, écrit par
  // `renderSynthesisText` (`_shared/keel/coach_synthesis.ts`), qui LÈVE sur
  // toute locale autre que `"en"` et que `coach_synthesis_io.ts:498` appelle
  // avec `locale: "en"` en dur. Le paragraphe est anglais PAR CONSTRUCTION:
  // traduire le chrome autour de lui rendrait une coquille française sur un
  // corps anglais. Voir la note de `/coach/weekly` dans `catalog.ts`.
  "coach.weekly.title": "This week",
  "coach.weekly.loading": "Loading...",
  "coach.weekly.load_error": "We could not load your weekly read.",
  "coach.weekly.empty":
    "No weekly read yet. The first one is written the Monday after your students start logging.",
  "coach.weekly.period": "Week of {from} → {to}",
  "coach.weekly.narrative_empty": "Nothing to report for this week.",
  "coach.weekly.flagged_title": "Worth a message",
  "coach.weekly.flagged_empty": "Nobody stands out this week.",
  // Après la purge RGPD J+7, la ligne reste dans le rapport mais perd son
  // identité — sinon la semaine relue compterait 2 élèves là où le coach en a
  // lu 3.
  "coach.weekly.deleted_account": "deleted account",
  // « on n'a pas pu mesurer » et « le chiffre est mauvais » se ressemblent
  // quand un nombre est simplement absent, et un coach qui agit sur le mauvais
  // des deux dira la mauvaise chose.
  "coach.weekly.no_number": "no number to show",
  "coach.weekly.numbers_title": "The numbers",
  "coach.weekly.written": "Written {date}",
  "coach.weekly.written_read": "Written {date} · read",
  // L'état de contact, tel que le moteur le classe (`ContactState`). Il était
  // rendu BRUT dans une pastille: un coach lisait « slipping » en anglais au
  // milieu de sa liste.
  "coach.weekly.contact.responsive": "In touch",
  "coach.weekly.contact.slipping": "Going quiet",
  "coach.weekly.contact.silent": "Silent",

  // Pourquoi un élève est signalé. Vocabulaire FERMÉ, propriété du moteur
  // (`_shared/keel/coach_synthesis.ts`, `FLAG_REASONS`); la bijection est tenue
  // par `copy/flagReasons.int.test.ts`, qui lit le fichier moteur.
  // R2 sur la prose: ce qui a été OBSERVÉ, jamais un diagnostic de la personne
  // — « a à peine noté quoi que ce soit », pas « pas impliqué ».
  "coach.flag.restriction_signal": "Restriction signals — handle directly",
  "coach.flag.silent_5d": "Has not written in days",
  "coach.flag.slipping_contact": "Going quiet",
  "coach.flag.week_too_hard": "Reported a hard week",
  "coach.flag.coverage_below_gate": "Barely logged anything",
  "coach.flag.no_evaluable_plan": "Nothing to measure against yet",
  "coach.flag.adherence_at_risk": "Struggling on the core lines",
  "coach.flag.outcome_mismatch": "Following the plan, going the wrong way",

  // ── W10.3 · /coach/billing — CE QUE LE COACH PAIE, ET POURQUOI ───────────
  // Ces 39 clés vivaient dans un `COPY` local de `pages/CoachBillingPage.tsx`,
  // avec un `c()` qui réimplémentait l'interpolation. La table réservait DÉJÀ
  // ces noms exacts, en attendant que le seed change de mains: le lot 5 n'a
  // fait que les déménager, aucune phrase n'a bougé.
  //
  // CONTRAT DE L'ÉCRAN, à ne pas dissoudre en traduisant: « élèves suivis » et
  // « sièges facturés » sont DEUX nombres et le restent. N'afficher que le
  // facturé est la façon dont un coach conclut qu'on le surfacture; n'afficher
  // que l'effectif est la façon dont il est surpris par la facture.
  // ⚠️ COUTURES MESURÉES SUR `/coach/clients/:id`, UNE ROUTE DÉCLARÉE
  // FRANÇAISE. Ces neuf phrases étaient EN DUR dans `CoachNoteCard.tsx` et
  // `StudentConstraintsCard.tsx`: un coach français lisait « Medical » et
  // « You added this » au milieu de son écran. `pageSeams` ne pouvait pas
  // les voir — un littéral n'appartient à aucun namespace — et la baseline
  // d'`i18n-lint` les avait absorbées. C'est le lint qui les a rendues,
  // pas le type.
  "coach.note.section":
    "What you have noticed about them",
  "coach.note.lead":
    "Optional. Anything here reaches their plans and their conversations with Sophia — the shift work, the bad knee, the week they always skip. Leave it empty and nothing changes.",
  "coach.note.placeholder":
    "Works nights, eats around 3am. Hates cooking on Sundays.",
  "coach.note.remaining":
    "{count} characters left",
  "coach.note.saved":
    "Saved.",
  "coach.constraints.section":
    "What they cannot eat",
  "coach.constraints.empty":
    "Nothing declared. They can add allergies, intolerances and medication themselves from their Health screen.",
  "coach.constraints.medical":
    "Medical",
  "coach.constraints.added_by_you":
    "You added this",
  "coach.billing.title": "Billing",
  "coach.billing.subtitle": "You pay for the students who actually used the protocol.",
  "coach.billing.loading": "Loading your billing...",
  "coach.billing.load_error":
    "Your billing could not be loaded. Nothing is shown rather than something wrong.",
  "coach.billing.retry": "Try again",
  "coach.billing.not_coach":
    "This account has no coach profile, so it has no billing.",
  "coach.billing.seats_billed_label": "Seats billed this month",
  "coach.billing.seats_billed_hint":
    "One seat per enrolled student. Invited and paused students are never billed.",
  "coach.billing.students_followed_label": "Students followed",
  "coach.billing.students_followed_hint":
    "Active links. Invited and paused students are never billed.",
  "coach.billing.plan_label": "Your plan",
  "coach.billing.plan_flat": "Platform",
  "coach.billing.plan_seat": "Per active student",
  "coach.billing.status_subscribed": "Subscribed",
  "coach.billing.status_trialing": "Free trial",
  "coach.billing.status_expired": "Trial ended",
  "coach.billing.status_unknown": "No billing on file",
  "coach.billing.trial_days_left": "{days} days left, up to {seats} students",
  "coach.billing.trial_ended_body":
    "Your trial has ended. Your students keep no access until you subscribe.",
  "coach.billing.renews_on": "Renews on {date}",
  "coach.billing.cancels_on": "Ends on {date}",
  // `subscribe_cta` a été SCINDÉE EN DEUX: l'intervalle était figé à `monthly`
  // en dur, donc l'annuel — accepté par la fonction edge depuis le premier
  // jour — n'avait aucun chemin. Un seul bouton ne pouvait pas porter le choix.
  "coach.billing.subscribe_monthly_cta": "Subscribe monthly",
  "coach.billing.subscribe_yearly_cta": "Subscribe yearly",
  // LE PRIX EST DIT ICI, PAS DANS LE BOUTON. Un libellé qui porterait « 7 € »
  // deviendrait faux le jour d'un changement de tarif, sur un bouton que
  // personne ne pense à relire. La phrase, elle, se relit.
  "coach.billing.interval_hint":
    "7 € per student per month, or 6 € when your student has paid for the year. No platform fee.",
  "coach.billing.manage_cta": "Manage billing",
  "coach.billing.checkout_error": "Checkout could not be opened: {message}",
  "coach.billing.ledger_title": "This month, student by student",
  "coach.billing.ledger_empty": "No students yet, so nothing is billed.",
  // ⚠️ LES DEUX FORMES PORTENT `{count}`, Y COMPRIS LE SINGULIER. Elle valait
  // « 1 interaction » en dur, ce qui marche en anglais — où seul 1 est
  // singulier — et ment en français, où `plural()` sert la forme singulière à
  // ZÉRO aussi. Or zéro est le cas le plus fréquent de cette colonne: c'est
  // précisément le siège que le coach devrait envisager de rendre.
  "coach.billing.interactions": "{count} interactions",
  "coach.billing.interaction_one": "{count} interaction",
  "coach.billing.billed_badge": "Billed",
  "coach.billing.not_billed_badge": "Not billed",
  "coach.billing.invited_badge": "Invited",
  "coach.billing.paused_badge": "Paused",
  "coach.billing.student_anonymous": "Student",
  "coach.billing.no_account_yet": "Has not created their account yet",
  "coach.billing.explainer_title": "How the seat count is decided",
  // ⚠️ CETTE COPIE A ÉTÉ CORRIGÉE APRÈS UN CHANGEMENT DE FACTURATION.
  // Elle disait: « on compte combien de fois chaque élève a agi; 3 fois ou plus
  // et le siège est facturé, moins et il est gratuit ce mois-ci ». La migration
  // 20260806170000 a retiré cette condition — le siège facturable est l'élève
  // RATTACHÉ, actif ou non. La phrase décrivait donc une facturation qui
  // n'existait plus, sur l'écran qu'un coach payant relit tous les mois.
  "coach.billing.explainer_body":
    "You are billed one seat per student enrolled with you, whether they used the app that month or not - you sell them the access, so you collect from them either way. A student you invited but who has not joined is not billed, and neither is a seat you turned off. We never bill for a seat we did not show you here.",
  // Le compte d'interactions garde sa colonne, mais il change de sens: ce n'est
  // plus un critère de facturation, c'est un signal d'usage.
  "coach.billing.activity_hint":
    "Interactions are shown so you can see who is actually using it. They no longer decide the bill - if a student has stopped for good, turn their seat off on their page.",

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
  // `templates.publish_result` A DISPARU AVEC SON SEUL APPELANT (lot 5).
  // Elle valait « Published: {message} » et `TemplatesPage` y interpolait
  // `plan_version <uuid>` en succès, un `JSON.stringify` de la réponse en
  // échec — notre vocabulaire de stockage et notre transport, sur l'écran où
  // une diététicienne publie. Les deux chemins de publication passent
  // maintenant par `review.publish_done` / `review.publish_failed`, qui disent
  // combien de lignes sont parties. Garder la clé aurait gardé de la traduction
  // payée pour une phrase que plus rien ne rend.
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
  "photo.energy_label": "Energy",
  // ⚠️ LE CHIFFRE ET SA BASE DANS LA MÊME LIGNE, jamais dans deux. Une base
  // posée à côté (une note plus bas, un libellé de colonne) se lit comme une
  // remarque générale; collée au nombre, elle en fait partie.
  "photo.energy.photo_estimate": "about {kcal} kcal, guessed from the photo",
  "photo.energy.declared_quantities": "about {kcal} kcal, from the quantities you gave me",
  "photo.no_quantity_note":
    "A photo tells me what is on the plate, not how much of it. Nothing here is a measurement.",
  // La note ci-dessus CONTREDIRAIT un chiffre affiché (« pas quelle quantité »).
  // Celle-ci la remplace dès qu'un chiffre est là, et elle dit la direction du
  // biais: −26,6 % mesuré, toujours du même côté, pire sur les gros repas.
  // « Une estimation » sans direction laisserait croire à une erreur
  // symétrique, ce qui est précisément le contraire du fait.
  "photo.no_quantity_note_estimate":
    "That figure is guessed from the photo, not measured - and photo guesses run low, more so on big plates. Take it as an order of magnitude.",
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
  // ⚠️ CE GABARIT NE PORTE PLUS LE « of », ET C'EST LA TRADUCTION QUI L'A
  // DÉPLACÉ. La préposition touche le mot qu'elle gouverne dès qu'on sort de
  // l'anglais — « de légumes » mais « d'œufs » —, donc elle vit maintenant dans
  // `food_group.of.*`, collée à chaque groupe. Ce qui reste ici est le seul
  // morceau qui soit vraiment du gabarit: l'ORDRE des deux moitiés.
  "sentence.amount_of": "{amount} {object}",
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

  // ==========================================================================
  // LES MÊMES GROUPES, APRÈS UNE QUANTITÉ ("2 servings ___")
  //
  // ⚠️ CETTE TABLE A L'AIR REDONDANTE EN ANGLAIS, ET C'EST EXACTEMENT POURQUOI
  // ELLE EST ÉCRITE ICI PLUTÔT QUE FABRIQUÉE PAR DU CODE. En anglais, « of » +
  // le mot nu suffit, donc un `"of " + foodGroupLabel(slug)` aurait rendu les
  // trente lignes identiques à ce qu'on lit ci-dessous. En français, non:
  //
  //     de légumes · d'œufs · d'huile d'olive
  //     de fruits à coque et DE graines
  //
  // L'élision dépend du mot suivant (et pas seulement de sa première lettre:
  // « d'huile » s'élide, « de haricots » ne s'élide pas), et un groupe composé
  // redouble la préposition à l'intérieur de lui-même. Aucune règle mécanique
  // ne produit les trois — le dépôt a déjà payé un matcher maison écrit sur ce
  // genre d'intuition. La préposition est donc de la DONNÉE de langue, au même
  // titre que le mot, et elle est rangée avec lui.
  //
  // Le jeton, lui, ne bouge pas: `food_group.of.eggs` reste `eggs` (R1).
  // ==========================================================================
  "food_group.of.lean_protein": "of protein",
  "food_group.of.fatty_fish": "of oily fish",
  "food_group.of.white_fish": "of white fish",
  "food_group.of.shellfish": "of shellfish",
  "food_group.of.poultry": "of poultry",
  "food_group.of.red_meat": "of red meat",
  "food_group.of.eggs": "of eggs",
  "food_group.of.legumes": "of legumes",
  "food_group.of.tofu_tempeh": "of tofu or tempeh",
  "food_group.of.dairy_yogurt": "of yogurt",
  "food_group.of.dairy_cheese": "of cheese",
  "food_group.of.whole_grain": "of wholegrains",
  "food_group.of.refined_grain": "of refined grains",
  "food_group.of.starchy_veg": "of starchy vegetables",
  "food_group.of.cruciferous_veg": "of cruciferous vegetables",
  "food_group.of.leafy_greens": "of leafy greens",
  "food_group.of.non_starchy_veg": "of vegetables",
  "food_group.of.berries": "of berries",
  "food_group.of.citrus": "of citrus fruit",
  "food_group.of.other_fruit": "of fruit",
  "food_group.of.nuts_seeds": "of nuts and seeds",
  "food_group.of.olive_oil": "of olive oil",
  "food_group.of.other_added_fat": "of added fat",
  "food_group.of.sauce_dressing": "of sauces and dressings",
  "food_group.of.sugar_sweets": "of sugar and sweets",
  "food_group.of.fried_food": "of fried food",
  "food_group.of.alcohol": "of alcohol",
  "food_group.of.sweetened_beverage": "of sweetened drinks",
  "food_group.of.water": "of water",
  "food_group.of.coffee_tea": "of coffee or tea",

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
  // Ajouté au lot 6: `/app/plan` mesure un tour de taille, et son unité était
  // le seul symbole du formulaire encore écrit en dur dans le JSX.
  "unit.cm": "cm",
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
  // ⚠️ CES QUATRE CLÉS ONT ÉTÉ RAPATRIÉES DE `progress.*`, ET LE DÉPLACEMENT EST
  // CE QUI A RENDU `/coach/clients/:id` TRADUISIBLE.
  //
  // `WeekView` — le composant de cette famille — les empruntait au namespace de
  // l'écran de progression de l'élève. La frontière étant à la maille du
  // NAMESPACE, la page du coach ATTEIGNAIT donc les 36 clés de `progress.*` par
  // ce seul emprunt: la déclarer française aurait exigé de traduire un écran
  // (`pages/ProgressPage.tsx`) que PLUS AUCUN fichier du dépôt n'importe —
  // vérifié, il n'a pas d'appelant, `StudentProgressPage` est le vivant.
  //
  // Les clés `progress.*` d'origine RESTENT dans ce seed: `ProgressPage` les lit
  // encore, et supprimer un écran est un geste à part. Elles ne sont simplement
  // plus atteignables depuis une page déclarée.
  "week.adherence_overall": "Overall",
  "week.adherence_core": "Core commitments",
  // Les deux formes portent `{count}`, y compris le singulier: `plural()` sert
  // la forme singulière à ZÉRO en français, et « 0 day » y est juste.
  "week.days_value": "{count} days",
  "week.day_value": "{count} day",
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
  // ⚠️ PAS `app.plan_untitled` (« Your plan »): cet écran montre le plan de
  // QUELQU'UN D'AUTRE, et le possessif y désignait le coach. Un titre de
  // repli ne nomme personne.
  "coach.student.plan_untitled": "Untitled plan",
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
  "app.nav.progress": "Progress",
  "app.nav.chat": "Chat",
  "app.nav.health": "Health",
  "app.nav.household": "Household",
  // `app.nav.cards` a été retirée avec l'onglet « Cards »: la page exigeait un
  // plan publié que le modèle 1:N ne produit jamais. Rien ne la lit plus.
  // Libellés courts: la barre d'onglets du téléphone donne 75 px par colonne,
  // et « My week's plan » y tiendrait sur trois lignes.
  "app.nav.plan.short": "Plan",

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

  // ══ FF-062 C2 — LE RAPPEL DE PESÉE ══════════════════════════════════════
  //
  // ⚠️ LE PLACEHOLDER DU CHAMP PORTE LE DERNIER POIDS, ET C'EST R8. Il n'a PAS
  // de clé: c'est un NOMBRE, formaté par `formatNumber` (78,4 en français, 78.4
  // en anglais) — une clé qui ne contiendrait que `{kg}` serait un mot de
  // traduction sans mot, et la garde d'anti-recopie du pack la refuse à juste
  // titre. Le point
  // du dimanche met le LIBELLÉ en placeholder (« Poids (kg) ») parce que son
  // champ est un parmi huit; ici le champ est seul, donc le placeholder peut
  // porter le repère. Le champ, lui, reste VIDE — un champ pré-rempli se valide
  // sans être lu, et on enregistrerait la valeur de l'avant-veille comme une
  // pesée d'aujourd'hui.
  "chat.weighin.title": "Your weight",
  "chat.weighin.subtitle": "One number. It is what your plan is sized on.",
  "chat.weighin.field": "Weight (kg)",
  "chat.weighin.submit": "Save",
  "chat.weighin.cancel": "Not now",
  "chat.weighin.error.empty": "Nothing entered — type a weight, or come back later.",
  "chat.weighin.error.number": "That should be a number.",
  "chat.weighin.error.range": "A weight should be between {min} and {max} kg.",
  // FF-062 C1 — le créneau qu'une question de repas a NOMMÉ, et que la photo
  // suivante portera. Affiché parce qu'un créneau forcé invisible est un état
  // caché qui décide d'un fait.
  "chat.slotmeal.forced": "This photo will be logged as {slot}",
  // Les six moments, DANS le namespace `chat` — voir `api/slotMeal.ts`:
  // `/app/chat` ne déclare pas `slot`, et l'y faire entrer y amènerait cinq
  // autres namespaces d'un coup.
  "chat.slotmeal.slot.breakfast": "breakfast",
  "chat.slotmeal.slot.snack_am": "your morning snack",
  "chat.slotmeal.slot.lunch": "lunch",
  "chat.slotmeal.slot.snack_pm": "your afternoon snack",
  "chat.slotmeal.slot.dinner": "dinner",
  "chat.slotmeal.slot.before_bed": "your evening snack",

  // ══ FF-062 R11 — LE CHIFFRE D'ÉNERGIE, CORRIGÉ ══════════════════════════
  //
  // ⚠️ LE PLACEHOLDER PORTE LE CHIFFRE ACTUEL, ET LE CHAMP RESTE VIDE. Même
  // règle que le rappel de pesée, et elle compte davantage ici: un champ
  // pré-rempli validé sans être lu réécrirait le chiffre DEVINÉ en le faisant
  // passer pour une déclaration — c'est-à-dire exactement la distinction que
  // cette correction existe pour établir.
  "chat.kcalfix.title": "The figure",
  "chat.kcalfix.subtitle": "Replace it with what you know.",
  "chat.kcalfix.field": "kcal",
  "chat.kcalfix.submit": "Save",
  "chat.kcalfix.cancel": "Leave it",
  "chat.kcalfix.error.empty": "Nothing entered — the figure stays as it was.",
  "chat.kcalfix.error.number": "That should be a number.",
  "chat.kcalfix.error.range": "A meal should be between {min} and {max} kcal.",
  // ── LES SIX AXES ET LES CINQ CRANS (lot 4) ──────────────────────────────
  //
  // ⚠️ CES ONZE VALEURS SONT SOUS CONTRAT AVEC UN FICHIER DENO, et le contrat
  // est vérifié: `api/weeklyCheckIn.int.test.ts` lit
  // `supabase/functions/_shared/keel/weekly_flow.ts` sur le disque et compare
  // MOT POUR MOT avec l'ANGLAIS ci-dessous. Changer un mot ici sans le changer
  // là-bas fait rougir — et c'est voulu.
  //
  // Ce que le contrat N'EMPÊCHE PAS, et c'est ce qui a débloqué la traduction:
  // les constantes serveur portent le suffixe `_EN` et n'ont pas de jumelle
  // française parce qu'elles ne servent PAS d'interface. Leurs deux lecteurs
  // sont (1) des consignes de modèle — `meal_generation.ts`,
  // `week_plan_generation.ts` écrivent « the one thing they want to see
  // improve: … » dans un prompt anglais — et (2) `weeklyFlowJson()`, la
  // définition d'un formulaire Meta hérité du canal WhatsApp. Aucun des deux
  // n'est lu par un élève. Le pack français vit donc ENTIÈREMENT côté front, et
  // le mot-pour-mot est réancré sur le seed anglais, qui est la même chaîne
  // qu'avant.
  // ⚠️ LA TROISIÈME COPIE DE CES SIX MOTS EST PARTIE (lot 6).
  // `api/bodyMeasures.ts` portait `FOCUS_AXIS_LABELS`, lu par
  // `StudentWeekPlanPage` (le sélecteur « ce que tu veux voir bouger ») et par
  // `bodyMeasures` lui-même. Le contrat croisé ci-dessus ne la couvrait pas — il
  // compare le front au Deno, pas le front à lui-même. Elle lit maintenant CES
  // clés-ci, par `focusAxisLabel(axis)`.
  //
  // ⚠️ ET LE DÉPLACEMENT SEUL N'AURAIT PAS SUFFI: son unique lecteur mettait
  // l'étiquette en minuscules DANS une phrase anglaise construite en dur
  // (« working on … »). Traduire la table sans réécrire la phrase aurait
  // déplacé la copie en gardant la couture. La phrase est
  // `plan.goal.working_on`, et elle a son propre trou.
  "chat.weekly.axis.energy": "Day-to-day energy",
  "chat.weekly.axis.hunger": "Hunger between meals",
  "chat.weekly.axis.sleep": "Sleep quality",
  "chat.weekly.axis.digestion": "Digestion",
  "chat.weekly.axis.mood": "Mood",
  "chat.weekly.axis.training": "Training quality",
  // Les cinq crans, nommés. Un chiffre nu invite chacun à sa propre échelle.
  "chat.weekly.scale.1": "1 — bad",
  "chat.weekly.scale.2": "2 — poor",
  "chat.weekly.scale.3": "3 — ok",
  "chat.weekly.scale.4": "4 — good",
  "chat.weekly.scale.5": "5 — great",
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
  // Le coach dont la RPC n'a pas rendu le prénom, en OUVERTURE de phrase.
  // Séparé de `join.coach_fallback` (« your coach », en milieu de phrase) parce
  // que la capitale n'est pas une décision de code: en français les deux formes
  // diffèrent aussi par l'article, et une seule clé forcerait un `capitalize()`
  // qui se trompe dès qu'une langue met un déterminant devant.
  "invite.coach_fallback": "Your coach",

  // ── La fenêtre d'invitation du coach (`components/InviteDialog.tsx`) ──────
  // Quatre phrases qui étaient en dur dans le composant, dont un `placeholder`
  // et un état de bouton — les deux endroits qu'un scan de texte JSX ne voit
  // pas et que le lint attrape par attribut.
  "invite.dialog.session_expired":
    "Your session expired. Sign in again to invite a student.",
  "invite.dialog.link_note":
    "The link expires in 14 days and can be used once. Nothing exists in their name until they accept.",
  "invite.dialog.email_placeholder": "student@email.com",
  "invite.dialog.sending": "Sending...",

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

  // ⚠️ « LES MAPS `PREVIEW_REFUSALS` / `ACCEPT_REFUSALS` RESTENT INLINE,
  // VERBATIM ET INTOUCHÉES, PARCE QUE TRANSCRIRE UN REFUS EST COMMENT UN REFUS
  // S'AFFAIBLIT » — C'ÉTAIT ÉCRIT ICI, ET C'ÉTAIT UNE PROTECTION QUI PROTÉGEAIT
  // DU MAUVAIS RISQUE. Le risque réel n'était pas la réécriture: c'est que sept
  // refus restent en anglais sur la première page qu'un élève francophone voit,
  // avec une seule des sept clés (`invite.expired`) traduite — donc six phrases
  // anglaises encadrant une phrase française. Les voici, MOT POUR MOT: la
  // migration n'a changé aucun caractère, elle a seulement rendu ces phrases
  // atteignables par la table des langues.
  //
  // La prudence d'origine tient dans la règle: on ne réécrit pas un refus
  // pendant qu'on le déplace. Toute réécriture est un geste séparé, visible en
  // diff, sur une ligne qui ne bouge pas en même temps que son fichier.
  "join.refusal.invalid_token":
    "This invitation link is not valid. Check that you copied the whole link from the email, or ask your coach to send a new one.",
  "join.refusal.revoked": "Your coach cancelled this invitation. Ask them for a new one.",
  "join.refusal.already_accepted":
    "This invitation has already been used. If that was you, sign in — your space is waiting.",
  "join.refusal.coach_unavailable":
    "This coach's account is not active right now, so the invitation cannot be accepted.",
  // Le refus qui dit NON À UN GESTE AUTOMATIQUE autant qu'à l'invitation: on ne
  // déplace personne d'un coach à l'autre sans qu'il le fasse lui-même.
  "join.refusal.already_coached":
    "Your account already follows another coach's program. End that relationship from your account page first — we never move you between coaches without you doing it.",
  "join.refusal.self_invitation": "This invitation was issued by your own coach account.",
  // Les deux pannes de transport, distinctes des refus produit ci-dessus: la
  // lecture de l'invitation, puis son acceptation. La seconde dit « rien n'a
  // changé » parce que c'est vrai (la RPC est atomique) et parce que la
  // première peur devant un échec est d'avoir consommé son lien pour rien.
  "join.refusal.preview_unreachable":
    "We could not check this invitation right now. Reload the page to try again.",
  "join.refusal.accept_failed":
    "That did not go through. Nothing changed — reload and try again.",

  // Les deux attentes. Elles durent une seconde et personne ne les lit — sauf
  // le jour où le serveur rame, qui est le seul jour où elles comptent.
  "join.state.checking": "Checking this invitation...",
  "join.state.joining": "Joining...",

  // Le compte existe, l'invitation est acceptée, il reste l'e-mail à confirmer.
  // ⚠️ LE CORPS ÉTAIT COMPOSÉ PAR CONCATÉNATION dans le JSX — trois morceaux
  // recollés autour d'un `{coachName}'s` ou d'un « your coach's ». Une phrase
  // coupée en fragments ne se traduit pas: le génitif anglais devient un
  // complément en français, et « de + le » se contracte. Elle est donc UNE
  // clé, avec son trou dedans.
  "join.check_email.title": "Confirm your email",
  "join.check_email.body":
    "Your account is created and you are already attached to {coach}'s program. Open the confirmation email we just sent to finish signing in.",
  // Le coach sans prénom, en MILIEU de phrase — jamais en ouverture, sinon la
  // minuscule saute aux yeux. La forme initiale est `invite.coach_fallback`.
  "join.coach_fallback": "your coach",

  // Compact states.
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
    "One photo, no form to fill in and nothing to put on a scale for it. What comes back is an answer in {coach}'s method — what the plate does well, what it is short of, in their words rather than a nutrition label's.",
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
  "join.grade.title": "Counted, never graded",
  "join.grade.lead":
    "Things do get counted here — the days you logged, the plates you photographed, what showed up on them. The difference is what happens next: none of it is turned into a mark you have to chase, and a rough week never becomes a number you owe.",
  "join.grade.one_title": "No score, no streak, no percentage on your screens.",
  "join.grade.one_body":
    "Counts exist, and you can read them in your own space — but none of them is running against you. A day you miss breaks nothing, because there is no run to break and no total to spoil.",
  "join.grade.two_title": "A photo never becomes a number.",
  "join.grade.two_body":
    "Not from a photo, ever — nothing is read off your plate as a calorie or a macro, stored, or sent on. We measured why before deciding: across 85 real analyses, a calorie estimate from a photo landed 26.6% under the truth on average, and the model's own margin of error contained the truth barely more than half the time. Where a figure does exist in this product, it is computed from quantities someone actually gave — never from an image.",
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
  // ⟳ RE-RÉÉCRITE LE 2026-09-01. La version du 2026-08-12 disait « le coach ne
  // voit rien (aucune surface ne le lui montre) ». C'était FAUX: `CoachStudentPage`
  // rend le bloc C8 « Starting numbers » — `coach.student.numbers.maintenance_value`,
  // « {low}–{high} kcal/day » — depuis la première pesée du dimanche. La clause
  // large a survécu à sa propre correction, sur la page où quelqu'un consent.
  // Ce qui reste vrai, et qui est maintenant dit en entier: rien de ce que
  // l'élève MANGE ne devient un chiffre côté coach, la photo n'en produit
  // aucun (−26,6 % de biais, le chemin photo n'a pas bougé), et la fourchette
  // que le coach voit sort de la PESÉE seule — elle est nommée plutôt que tue.
  "join.seen.never_4":
    "A calorie count read off your food. Nothing you eat turns into a figure for them, and a photo never produces one. What they do see is a maintenance bracket worked out from your weigh-in alone — the range they would open with, never a reading of your plates.",
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
  "join.form.language":
    "The language you want to be spoken to in",
  "join.form.language_hint":
    "Your coach answers in this language, and writes your plan in it. You can change it later.",
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
    "Open your Sophia account. Sophia composes the week around the people " +
    "who actually eat at your table.",
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
  // ⚠️ `start.price` RETIRÉE LE 2026-09-01 — voir le pack FR. Le pack ANGLAIS
  // y écrivait « 11,99 € a month … plus 2 € »: virgule décimale et symbole à
  // droite, c'est-à-dire la convention FRANÇAISE servie à un lecteur
  // anglophone, sur la page où il ouvre son compte. Les montants passent
  // désormais par `formatPrice`, qui ne peut pas se tromper de convention.
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
  // ⚠️ CE BLOC A REMPLACÉ LA QUESTION DU PAYS, ET LE REMPLACEMENT EST LA
  // DÉCISION. « Où vous vivez » se justifiait par le numéro d'urgence — un
  // sujet que le produit ne traite pas aujourd'hui — et occupait la place
  // de la seule réponse qui change quelque chose tous les jours. Le pays se
  // déduit désormais du fuseau (`api/countryFromTimezone.ts`).
  //
  // ⚠️ PAS D'INDICE SOUS CE CHAMP, ET C'EST DÉLIBÉRÉ (2026-09-01). Il disait
  // « votre coach vous répond dans cette langue, et écrit votre plan dedans »
  // — sur l'écran d'inscription LIBRE, à quelqu'un qui n'a précisément pas de
  // coach. Il annonçait un tiers absent au moment exact où la personne ouvre
  // son compte, et depuis le lancement B2C il n'y en a plus du tout à
  // rencontrer. Le libellé se suffit; ne rajoute pas d'indice ici sans avoir
  // quelque chose de VRAI à dire de plus que lui.
  "start.form.language":
    "The language you want to be spoken to in",
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
  "start.error.already_coached":
    "Your account already follows a coach. You do not need to sign up here.",
  "start.error.caller_is_coach":
    "This is a coach account. Your space is the coach workspace, not this one.",
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
  "public.language.en":
    "English",
  "public.language.fr":
    "Français",
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
  // ⚠️ ON NOMME LA SITUATION, PAS LE SEGMENT (refonte du 2026-08-13).
  // « Meal prep », « Couples », « Families » nommaient nos TRIS. Personne ne
  // se dit « je suis un solo »; tout le monde se reconnaît dans une phrase qui
  // décrit sa cuisine. Le mot de segment reste dans le code, où il désigne une
  // branche réelle du parcours (`FunnelBranch = solo | pair | family`).
  //
  // ⚠️ CES TROIS VALEURS SONT LES MÊMES QUE `home.door.*.label`, et ce n’est pas
  // une duplication qu’on peut « factoriser »: un namespace par page, jamais de
  // clé partagée. Ce qui les tient ensemble est qu’elles se lisent À DEUX
  // CENTIMÈTRES l’une de l’autre — l’onglet de l’en-tête et la porte de la
  // clôture du hall. Les faire diverger se voit sur un seul écran.
  "public.nav.mealprep": "Just me",
  "public.nav.couples": "The two of us",
  "public.nav.families": "The whole family",
  "public.nav.coaches": "Coaches",
  "public.nav.gyms": "Gyms",
  "public.nav.communities": "Communities",
  // ⚠️ LE PIED DE PAGE NE S’ADRESSE À PERSONNE, ET C’EST LA SEULE FORME
  // POSSIBLE (2026-08-13). Il disait « Your method, answering in your absence »,
  // et cette ligne portait DEUX défauts indépendants:
  //
  //   1. LE REGISTRE. Six pages sur huit vouvoient, deux tutoient
  //      (`/meal-prep`, `/coaches`) — et le pied de page est le même sur les
  //      huit. Une ligne par MONDE ne répare rien: `/meal-prep` tutoie et est
  //      un foyer, `/coaches` tutoie et est pro. Le monde et le registre ne se
  //      recouvrent pas.
  //   2. L’ACHETEUR. « Votre méthode » est la promesse PRO, servie telle
  //      quelle sous `/`, `/couples` et `/families`, où le lecteur n’a aucune
  //      méthode et n’a pas à en écrire une.
  //
  // D’où une ligne SANS ADRESSE AU LECTEUR: pas de « vous », pas de « tu »,
  // pas de possessif. Elle reste vraie des deux côtés — la semaine d’une
  // maison est composée d’avance, la méthode d’un pro répond sans lui.
  "public.footer.legal": "Legal & privacy",
  "public.footer.contact": "Contact",
  "public.footer.contact_email": "sophia@sophia-coach.ai",
  // ⚠️ « coaching software » a été retiré le 2026-09-01 — voir la note du pack
  // FR. Elle nommait un seul des deux mondes, et remettait le mot « coach » au
  // pied des quatre pages du foyer, dont aucune ne le prononce.
  "public.footer.copyright": "Sophia — a week of meals, decided ahead",

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
  // `PAGE_NAMESPACES`: une seule chaîne laissée en dur ici rouvre la
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
    "Sign in to Sophia, or create the account that gets you in.",

  // ── LE FRONTON DE LA FICHE ────────────────────────────────────────────────
  // L'écran est UN document qui se reconfigure, pas quatre écrans. Son fronton
  // le nomme, et c'est la seule chose qui change entre ses quatre états.
  "auth.sheet.signin": "Sign in",
  "auth.sheet.coach": "Coach account",
  "auth.sheet.reset": "Password",
  "auth.sheet.confirm": "Email verification",

  // ── LES QUATRE ÉTATS, EN TÊTE ─────────────────────────────────────────────
  "auth.signin.title": "Welcome back.",
  "auth.signin.lede": "The same door, whichever account you have.",
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
  "auth.field.language":
    "The language you want to work in",
  "auth.field.language_hint":
    "Your workspace and your students' coaching happen in this language. You can change it later.",
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
  // ⚠️ NE REMETS PAS « Household » / « Foyer » ICI. Deux raisons, et la
  // seconde survit à la réouverture du monde pro:
  //
  // 1. Un libellé d'AUDIENCE n'a de sens qu'en face de son contraire. Tant que
  //    `VITE_B2C_ONLY` est levé, la carte « Professional » est retirée et
  //    celle-ci est la SEULE: « Foyer » ne distingue alors plus rien, il
  //    demande juste au visiteur de se ranger dans une catégorie avant de
  //    pouvoir créer un compte.
  // 2. « Foyer » est le mot du MODÈLE (`household_members`, `/app/household`,
  //    docs/keel/PIVOT-FOYER.md), pas un mot que quelqu'un s'applique à
  //    lui-même au moment de s'inscrire. Décision humaine du 2026-09-01: il
  //    porte à confusion sur le couloir d'entrée, et il en est retiré. Il reste
  //    partout ailleurs — c'est du vocabulaire interne, et il est juste.
  //
  // Le mot du produit pour la même chose, côté visiteur, est « votre table »
  // (le corps juste en dessous, `start.lead`, `start.price`).
  "auth.doors.household.label": "Your Sophia account",
  // ⚠️ PAS « sans coach ». L'absence d'un coach ne définit pas le produit du
  // foyer — elle le décrit comme une version amputée de l'autre monde, ce que
  // `/start` disait aussi (« Try it without a coach first ») et qui vient d'en
  // être retiré. Ce que le foyer achète est POSITIF: la semaine composée autour
  // des gens qui mangent vraiment à cette table.
  "auth.doors.household.body":
    "Open your account and compose your week around who eats at your table.",
  "auth.doors.household.cta": "Create a free account",
  "auth.doors.household.prompt": "Cooking at home?",
  "auth.doors.pro.label": "Professional",
  "auth.doors.pro.body":
    "Write your method once. Your students compose their week inside it.",
  "auth.doors.coach_divider_signup": "Already have a coach account?",
  "auth.doors.coach_divider_signin": "No coach account yet?",

  // ── LES REFUS, ET ILS DISENT TOUS QUOI FAIRE ENSUITE ──────────────────────
  "auth.error.legal": "Accept the Terms and the Privacy Policy to continue.",
  "auth.error.student_signup_moved":
    "Student sign-up has moved. Open /start to create your account, or use the link your coach emailed you.",
  "auth.error.prelaunch_signup":
    "Sign-up is closed (pre-launch). Sign in with the master_admin account.",
  "auth.error.prelaunch_forbidden":
    "Access is restricted (pre-launch). Only the master_admin account can sign in.",
  "auth.error.coach_profile":
    "Your account exists, but the coach profile could not be created. Sign in again to retry.",
  // LANCEMENT B2C — le refus de porte. Il dit les DEUX choses dont la
  // personne a besoin: pourquoi elle ne rentre pas, et que son compte est
  // toujours là. Sans la seconde, la seule lecture possible est « mon compte a
  // été supprimé », et on écrit au support.
  "auth.error.pro_closed":
    "The coach workspace is closed for now. Your account is intact — we will write to you when it reopens.",
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


  // Auth page cross-links (the two doors reference each other)
  "auth.coach_link.prompt": "Are you a coach?",
  "auth.coach_link.cta": "Create a coach account",
  "auth.coach_link.back_prompt": "Not a coach?",
  "auth.coach_link.back_cta": "Go to the standard sign-in",

  //
  // ── CE QUI A DISPARU DE L'ANCIEN NAMESPACE, ET POURQUOI ───────────────────
  // `home.proof.*` (trois clés) — la preuve fail-closed n'a plus de section à
  //   elle: un hall n'a pas de sections. Elle est REPLIÉE dans `home.pot.note`,
  //   sous la ligne qu'elle prouve.
  // `home.doors.title` et `home.door.*.title` / `.body` / `.cta` — les trois
  //   portes descendent dans la clôture, en compact: un libellé de situation et
  //   une ligne. Elles restent le seul chemin en page vers les six pages
  //   segment, elles ne meurent pas, elles maigrissent.
  // `home.fig.caption` — la légende disait ce que dit désormais `home.pot.body`.

  //
  // ══ `offer` — L'OFFRE DU FOYER, ÉCRITE UNE FOIS POUR CINQ SURFACES ═══════
  //
  // Rendu par `ui/Marketing.tsx` → `OfferLines`, sur `/`, `/meal-prep`,
  // `/couples`, `/families` et `/start`. C'est la SEULE exception à « un
  // namespace par page », et le pourquoi est dans `i18n/catalog.ts` à
  // `TRANSLATED_NAMESPACES`: une offre commerciale est un FAIT, et un fait ne
  // se recopie pas cinq fois.
  //
  // ⚠️ LES MONTANTS NE SONT PAS ÉCRITS ICI. `{amount}` est rempli par
  // `formatPrice(PRICES.household)` / `formatPrice(PRICES.claimedProfile)` à
  // l'appel: c'est la seule façon d'obtenir « €12.99 » en anglais et
  // « 12,99 € » en français sans deux conventions dans le même pack — le
  // défaut que `prices.ts` a été créé pour fermer, et qui traînait encore
  // dans `start.price` (une virgule décimale servie à un lecteur anglophone).
  //
  // ⛔ AUCUNE DURÉE D'ENGAGEMENT, AUCUNE DATE. « First week free » est la
  // durée que le produit TIENT: `HOUSEHOLD_TRIAL_DAYS = 7`
  // (`_shared/billing-tier.ts`), aligné en SQL par
  // `keel_household_trial_days()`. Le jour où ce nombre bouge, ces deux clés
  // mentent — et rien ne le dira, parce qu'elles ne portent pas le chiffre.
  "offer.household": "{amount} a month for the whole house — your own access included.",
  "offer.solo": "{amount} a month for one person — every feature is included.",
  "offer.extra": "{amount} a month for each other person who wants their own access.",
  "offer.trial": "First week free, with no code to enter.",
  // « No commitment » est un engagement COMMERCIAL, pas une promesse de
  // logiciel: on ne dit pas « cancel in one click », parce qu'aucun écran ne
  // le fait aujourd'hui. Si un engagement de durée apparaît un jour, cette
  // ligne part le même jour.
  "offer.no_commitment": "No commitment.",

  "home.seo_title": "Sophia — your household’s week of meals, decided",
  "home.seo_description":
    "Meals, balance, goals, constraints and shopping: Sophia composes a week that adapts to your household and to missed plans.",

  // ── LE HÉROS — CE QUE C'EST, AVANT TOUT LE RESTE ─────────────────────────
  // ⚠️ LE TITRE D'AVANT ÉTAIT UN ZEUGME EN FRANÇAIS COMME EN ANGLAIS: « Now
  // your dinners do too » demandait de reconstruire « your dinners know what
  // you are after ». Et le chapô annonçait « seven things » sans avoir dit ce
  // que le produit FAIT. Un hall nomme son objet avant de le vendre.
  "home.hero.kicker": "Meals for the house",
  "home.hero.title": "A week of meals, decided.",
  "home.hero.lede":
    "The meals, cooking days and shopping are decided together. Everyone’s goals and constraints can coexist, and Sophia adjusts the plan when the week does not go as expected.",
  // ⚠️ Un seul libellé de CTA en page (2026-09-01) — voir le pack FR.
  "home.hero.cta": "Compose your first week",
  // ⚠️ LE MAÎTRE N'EST JAMAIS FACTURÉ POUR SON PROPRE ACCÈS
  // (`keel_household_billable_profiles`, 20260810260000:235-252, exclut
  // `role = 'owner'`) — mais il COMPTE dans le plafond de huit.
  // ⚠️ `home.hero.price` A ÉTÉ RETIRÉE LE 2026-09-01 — voir la note du pack
  // FR. L'offre vit dans le namespace `offer`, rendu par
  // `ui/OfferLines.tsx`.
  // ⚠️ ET LA DURÉE SE DIT MAINTENANT, ce qui renverse la règle que cette
  // note portait: l'essai est passé à SEPT jours (`HOUSEHOLD_TRIAL_DAYS`),
  // et `offer.trial` l'annonce sur les cinq surfaces.
  // ⚠️ Ne nomme plus « the house coach’s programme »: le mot coach n'apparaît
  // nulle part ailleurs sur cette page, et collé au bouton il faisait dépendre
  // l'entrée d'un tiers dont le lecteur n'a jamais entendu parler.
  // `/start` interroge `keel_free_signup_available`.
  // ⚠️ `home.hero.reserve` retirée le 2026-09-01 — voir le pack FR.

  // ── L'AIGUILLAGE — MONTÉ EN DEUXIÈME POSITION ────────────────────────────
  // Chaque porte porte TROIS choses: pour qui, ce qu'elle promet (le titre de
  // la page derrière), et ce qu'on y gagne.
  "home.doors.title": "Who are we planning for?",
  "home.doors.aria_label": "Choose the situation that fits you",
  "home.doors.lede":
    "Choose your situation: the next page shows exactly how Sophia works for you.",
  "home.door.solo.who": "Just me",
  // ⚠️ Recopie le `<h1>` de `/meal-prep`, mot pour mot — voir le pack FR.
  "home.door.solo.label": "Your week of meals, planned all at once.",
  // ⚠️ Ne présume plus que le lecteur fait déjà du batch cooking — voir la note
  // du bloc français.
  // ⚠️ Suit le nouvel ordre de la page (2026-09-01) — voir le pack FR.
  "home.door.solo.gain":
    "The meals, cooking days and shopping are decided once for the week. If you have a goal, the portions adapt to it.",
  "home.door.pair.who": "The two of us",
  // ⚠️ Recopie le `<h1>` de `/couples`, mot pour mot — voir le pack FR.
  "home.door.pair.label": "The hard part is agreeing.",
  // ⚠️ « One dish » était faux: `mergeLadder` calcule TROIS formes. Ce qui est
  // vrai dans les trois, c'est une seule cuisson — voir la note du bloc français.
  // ⚠️ Suit le nouvel ordre de la page (2026-09-01) — voir le pack FR.
  "home.door.pair.gain":
    "You no longer decide dinner again every evening. Both goals are taken into account: one dish when possible, two within the same cooking session when necessary.",
  "home.door.family.who": "The whole family",
  // ⚠️ Le titre de `/families` a besoin d'être posé pour se comprendre; une
  // porte doit se lire sans mise en place.
  "home.door.family.label": "Everyone’s needs. One cooking session.",
  // ⚠️ La porte suit la clôture de `/families` — voir le pack FR.
  "home.door.family.gain":
    "A teenager who trains, a fussy one, someone watching what they eat. The plan is built for each of them, on their age and their body — so you stop wondering whether your meals are balanced.",

  // ── CE QUI EST VRAI DANS LES TROIS CAS, ET RIEN D'AUTRE ──────────────────
  // Règle de tri: un champ ne reste ici que s'il vaut pour les TROIS acheteurs.
  "home.fiche.kicker": "What Sophia handles",
  "home.arguments.title": "Four ways Sophia makes the week’s meals easier.",
  "home.benefits.pause": "Pause rotation",
  "home.benefits.resume": "Resume rotation",

  // ⚠️ Premier champ de la section — voir la note du bloc français, y compris
  // la ligne à ne pas franchir (composer POUR, jamais un bilan SUR).
  "home.balance.pain": "Nutritional balance",
  "home.balance.title": "Complete meals, adapted to each person.",
  "home.balance.body":
    "Sophia builds every meal with protein, starch and vegetables. It then adjusts the proportions and amount to the age, body and goal of the person eating. There is nothing to recalculate when you serve.",
  "home.balance.figure.label": "On every plate",
  "home.balance.figure.protein": "A protein",
  "home.balance.figure.starch": "A starch",
  "home.balance.figure.vegetables": "Vegetables",
  "home.balance.figure.note": "All three components remain; their proportions and the overall amount adapt to the person.",

  "home.sessions.pain": "Organising the week",
  "home.sessions.title": "The meal question is settled once, shopping included.",
  "home.sessions.body":
    "Sophia does more than suggest recipes. It chooses the meals, schedules cooking sessions on the days that work and plans each shopping run at the right time. You approve the whole week instead of starting again every evening.",
  "home.organize.figure.label": "One decision, the whole week",
  "home.organize.figure.meals": "The meals are chosen",
  "home.organize.figure.meals_note": "Seven days that fit together, not seven isolated suggestions.",
  "home.organize.figure.cooking": "Cooking sessions are placed",
  "home.organize.figure.cooking_note": "On the right day, within the time you actually have.",
  "home.organize.figure.shopping": "Shopping follows the plan",
  "home.organize.figure.shopping_note": "One or two runs, scheduled before the cooking sessions they support.",

  "home.waves.pain":
    "We buy at random, throw half away, and something is always missing.",
  // ⚠️ Le mot « wave » n'est plus employé avant d'être nommé — pack FR.
  "home.waves.title": "Shopping in one or two runs",
  // ⚠️ Disait la règle, pas ce qu'elle donne — voir la note du bloc français.
  "home.waves.body":
    "One or two shopping runs during the week, each scheduled before the cooking session it supports.",

  "home.cohabit.kicker": "Two people, without a forced compromise",
  "home.cohabit.title": "Two goals and two constraints can share one kitchen.",
  "home.cohabit.body":
    "Gaining muscle on one side, losing fat on the other. Eating vegetarian, disliking fish. Sophia first looks for what can stay shared, then separates only what has to be — often within the same cooking session.",
  "home.demo.aria_label": "Interactive demonstration of two goals and constraints coexisting",
  "home.demo.kicker": "Try a combination",
  "home.demo.person_a": "Person A",
  "home.demo.person_b": "Person B",
  "home.demo.goal_legend": "Their goal",
  "home.demo.food_legend": "What matters to them",
  "home.demo.goal.fat_loss": "Lose fat",
  "home.demo.goal.muscle_gain": "Gain muscle",
  "home.demo.goal.maintenance": "Maintain",
  "home.demo.food.everything": "Eats anything",
  "home.demo.food.vegetarian": "Vegetarian",
  "home.demo.food.no_fish": "Does not like fish",
  "home.demo.output_label": "What Sophia composes",
  "home.demo.output.one_dish": "One shared dish, two different plates.",
  "home.demo.output.two_dishes": "Two dishes, in one cooking session.",
  "home.demo.reason.shared": "Both requests fit the same preparation; only the way it is served changes.",
  "home.demo.reason.vegetarian": "The shared preparation becomes vegetarian: everyone can eat it, then each plate follows its own goal.",
  "home.demo.reason.no_fish": "Fish leaves the shared preparation; the week keeps both goals without putting that food back on the menu.",
  "home.demo.reason.goal_split": "One dish cannot provide both planned portions, so Sophia adds a second dish within the same cooking session.",
  "home.demo.reason.diet_split": "The shared constraint removes what one goal needs: Sophia adds a second dish within the same cooking session.",
  "home.demo.cooking_session": "1 cooking session",
  "home.demo.direction.fat_loss": "Generous vegetables, full protein share, smaller starch share.",
  "home.demo.direction.muscle_gain": "Larger protein and starch shares, same vegetables.",
  "home.demo.direction.maintenance": "A balanced share of every component.",

  "home.chat.pain": "The adaptive plan",
  // ⚠️ Le titre ne disait plus qu'il s'agit d'une conversation — voir la note
  // du bloc français.
  "home.chat.title": "A missed step moves the week; it does not destroy it.",
  "home.chat.body":
    "A meal is skipped, a cooking session does not happen, the shopping is delayed: tell Sophia. It moves what can move, recomputes what depended on the cooking session and protects what has already been bought. The plan adapts to the week that actually happens.",
  "home.adapt.figure.label": "Three surprises, three scales",
  "home.adapt.figure.title": "What moves when the week goes off plan",
  "home.adapt.figure.desc": "A skipped meal affects one plate; a skipped cooking session affects the meals depending on it; delayed shopping can move the rest of the week.",
  "home.adapt.figure.meal": "A meal skipped",
  "home.adapt.figure.session": "A cooking session skipped",
  "home.adapt.figure.shopping": "Shopping delayed",

  // ── LES MARQUES — le `<title>` de chaque petite figure de ligne ──────────
  // ⚠️ Les quatre clés `home.mark.*` sont parties le 2026-09-01 — pack FR.

  // ── LA CLÔTURE ───────────────────────────────────────────────────────────
  "home.close.title": "Start with the week ahead.",
  "home.close.body":
    "Say who is eating, what cannot be negotiated and when you can cook. Sophia turns those answers into meals, cooking sessions and shopping — then learns from real life.",
  "home.close.cta": "Compose your first week",

  //
  // ── LE VOCABULAIRE DE CETTE PAGE, ET C'EST UN PIÈGE ──────────────────────
  // Le générique est « pros ». Les gens qu'ils accompagnent sont des CLIENTS
  // ici — « students » est le mot de `/coaches` SEULEMENT, là où quelqu'un a
  // choisi un coach pour apprendre de lui. L'ancien `pro.proof.title` disait
  // « student » sur ce hall: c'est corrigé par sa suppression.
  // ⛔ « personalised follow-up » reste interdit partout. ⛔ Jamais « your
  // team »: une salle à trois coachs est UN compte (B20).
  "pro.seo_title": "Sophia for professionals — your method, answering every day",
  "pro.seo_description":
    "Record your method once; Sophia answers your clients with it, in chat and in every week and meal it writes. €7 per client per month.",

  "pro.hero.kicker": "For people who sell a method, not hours",
  "pro.hero.title": "Your method, working on the days you are not there.",
  "pro.hero.lede":
    "Coaches, gyms, paid communities — five things that have to hold when you are not there.",
  "pro.hero.cta": "Start the 14-day trial",
  // B5 (14 jours / 3 clients) + B1 (le siège est le seul poste).
  "pro.hero.note":
    "14 days, up to 3 clients, then it stops on its own. After that, €7 per client per month.",

  "pro.lines.kicker": "The whole product",
  // ⚠️ « Six pains » se lit comme une plainte médicale en anglais — et surtout,
  // personne ne se dit « j’ai six douleurs ». C’était le nom de NOTRE grille,
  // servi au lecteur.
  // ⚠️ CINQ, ET C'ÉTAIT « SIX » JUSQU'AU 2026-08-19. Le compte n'est pas un
  // effet de style: la grille en dessous rend exactement autant de lignes, et
  // un titre qui en promet une de plus est la première phrase fausse de la
  // page. La ligne 05 « chaque ligne cite la conviction qu'elle applique »
  // (B27) a été retirée le 2026-08-19 avec ses clés — voir le bloc juste en
  // dessous et le commentaire à sa place dans `ProPage.tsx`. Le `lede` du hero
  // porte le même compte, et il a bougé avec.
  "pro.lines.title": "Five places it breaks without you. Five answers.",

  // ── ⛔ `pro.line.cite.*` — RETIRÉES LE 2026-08-19, ET ELLES NE REVIENNENT
  // PAS REFORMULÉES ─────────────────────────────────────────────────────────
  // Elles portaient B27, « chaque ligne cite la conviction qu'elle applique »,
  // adossé au CHECK `student_week_plans_doctrine_traceable_check`. Vérifié le
  // 2026-08-19: le CHECK existe TOUJOURS et il est armé — et il n'a plus aucun
  // écrivain, la lane `generate-week-plan-v1` ayant été retirée le même jour
  // faute d'un seul appelant vivant. Il ne reste que des LECTEURS
  // (`following_io`, `coach_synthesis_io`, `hunger_signal_io`, l'export RGPD).
  //
  // ⛔ ET PAS D'ÉQUIVALENT SUR LES PLATS. Sur la seule lane vivante,
  // `honours_belief_keys` est INFORMATIF par arbitrage produit du 2026-08-04
  // (« un plat est une application libre », `meal_generation.ts`): aucun CHECK
  // ne l'exige, et un plat qui invente une clé est CONSERVÉ, sa clé jetée
  // (`meal_generation_test.ts`, « an invented conviction key is dropped but
  // does NOT cost the dish »). Mesuré en base le 2026-08-19: 1 598 plats sur
  // 1 816 citent au moins une conviction — 88 %, et 31 plans sur 179 n'en
  // citent aucune. « Chaque ligne » n'est donc pas vrai, et le rendre vrai
  // serait vendre CONTRE le modèle produit, pas le rattraper.
  //
  // La règle qui en sort: une page de vente ne redit cette garantie que le
  // jour où un CHECK la tient.

  // 01 — la seule page du site qui dit que la méthode peut être la nôtre.
  "pro.line.method.pain":
    "What has to be said every day cannot depend on your being there.",
  "pro.line.method.title": "A method recorded once, then it answers.",
  "pro.line.method.body":
    "Yours — or ours, if you have none of your own. That path is built; the house method itself is still being written.",

  // 02 — B10, quatre points d'injection.
  "pro.line.daily.pain": "Your clients have questions between two sessions.",
  "pro.line.daily.title": "Daily support, held by your method.",
  "pro.line.daily.body":
    "It reaches three places: the chat, the meal they cook, and the one they cook for a table.",

  // 03 — FORMULATION B8b, IMPOSÉE. « Chaque message sortant est vérifié » est
  // faux (4 surfaces scannées, 4 non scannées) et « la doctrine entre à chaque
  // message » aussi (un seul appelant). Ceci est vrai.
  "pro.line.lock.pain": "An AI that speaks for you will contradict you.",
  "pro.line.lock.title": "The double lock.",
  "pro.line.lock.body":
    "Your method goes into the chat, into every week and into every meal; and what it writes in the chat is read back against your red lines before it is sent — with no model in that loop.",

  // 04 — B11 (cron du lundi, texte rendu par gabarit) · B14 (48 h / 120 h) ·
  // B17 (cohortes scopées).
  "pro.line.monday.pain":
    "You find out a client dropped off once they have gone.",
  "pro.line.monday.title": "Monday, in one page.",
  "pro.line.monday.body":
    "Who answered, who went quiet after two days, who has been silent for five. Computed, never written by a model — and only your own clients.",

  // ⚠️ LA LIGNE 05 (B27, « chaque ligne cite la conviction ») A ÉTÉ RETIRÉE LE
  // 2026-08-19, AVEC SES TROIS CLÉS. Elle vendait une garantie adossée au CHECK
  // `student_week_plans_doctrine_traceable_check`, tenu par la lane de semaine
  // — retirée le même jour faute d'un seul appelant. La garantie n'était donc
  // déjà tenue pour personne. ⛔ NE PAS LA REFORMULER: aucune copie ne doit
  // annoncer une traçabilité par ligne tant qu'aucun CHECK ne la tient. Les
  // plats portent `generated_from.belief_keys`, à l'échelle du PLAN, informatif
  // et jamais vérifié.
  // 05 — B1, B4.
  "pro.line.seat.pain": "Platforms bill you by tier.",
  // « poste » = *line item*. « line » seul ne veut rien dire ici.
  "pro.line.seat.title": "The seat is the only line item.",
  "pro.line.seat.body":
    "€7 per client per month. Turn a seat off and it stops being billed that month. No platform fee.",

  // La figure — géométrie et libellés MESURÉS dans les deux langues, gardés
  // tels quels de la version du 2026-08-12.
  "pro.fig.alt":
    "Your method and your red lines go in; what crosses a line is held and replaced before it is sent.",
  "pro.fig.method": "YOUR METHOD",
  "pro.fig.method_2": "written once",
  "pro.fig.lines": "YOUR RED LINES",
  "pro.fig.lines_2": "and what you do instead",
  "pro.fig.check": "checked",
  "pro.fig.sent": "SENT",
  "pro.fig.held": "HELD",
  "pro.fig.held_2": "in your words",
  "pro.fig.caption":
    "An instruction is followed almost always. A check is not an instruction: it runs on what is about to leave.",

  // B31 — à conserver verbatim, la meilleure ligne des trois anciennes pages.
  "pro.close.title":
    "We have no retention figure to sell you, and we are not going to invent one.",
  "pro.close.body":
    "Nothing here measures churn against a control, so a number printed here would be decoration.",
  "pro.close.cta": "Start the 14-day trial",

  // ⚠️ « practice » EXCLUT LA SALLE: une salle indépendante n’en est pas une,
  // et c’est exactement le recadrage de segment de ce chantier. Le français
  // disait déjà « métiers ».
  "pro.doors.title": "Three trades, three pages.",
  "pro.door.coaches.title": "You sell a course",
  // ⚠️ CETTE CARTE CITAIT LE H1 DE `/coaches` À UN REGISTRE PRÈS: la même
  // phrase, deux adresses, à un clic d’écart. Le registre de chaque page est un
  // arbitrage tenu (en-tête de `fr.ts`); ce qu’il ne supporte pas, c’est la MÊME
  // phrase des deux côtés de la porte. La carte dit donc ce qu’on y trouve, pas
  // ce que la page dira.
  "pro.door.coaches.body": "What you could only sell once, billed every month.",
  "pro.door.coaches.cta": "See it for a course",
  "pro.door.gyms.title": "You run an independent gym",
  "pro.door.gyms.body": "Three hours a week with you; twenty-one meals without.",
  "pro.door.gyms.cta": "See it for a gym",
  "pro.door.communities.title": "You run a paid community",
  "pro.door.communities.body":
    "A thread has no recipient. This is the individual layer underneath.",
  "pro.door.communities.cta": "See it for a community",

  //
  // ── ⚠️ LES SIX `mealprep.dir.*` SONT DU CODE, PAS DE LA COPIE ──────────────
  // Ce sont les six valeurs de `SERVING_DIRECTION`
  // (`supabase/functions/_shared/keel/household_portions.ts`), MOT POUR MOT.
  // `servingDirections.int.test.ts` les épingle sur le module: éditer une
  // virgule ici fait rougir la CI, et c'est le but. Le module écrit lui-même
  // pourquoi — `health` a rendu la chaîne de `maintenance` pendant des semaines
  // sans que rien n'échoue, parce que personne ne lisait la source.
  //
  // La page ne les recopie pas non plus en axes: elle les LIT avec la grammaire
  // fermée du module (voir `MealPrepPage.tsx`).
  // ── SEO ─────────────────────────────────────────────────────────────────
  "mealprep.seo_title": "Meal prep for one — a week that serves your goal",
  "mealprep.seo_description":
    "Sophia plans your meals, cooking sessions and one or two shopping runs. Portions adapt to your body and your goal. €12.99 a month, with every feature included.",

  // Le CTA unique, rendu deux fois: en haut de la bande 1 et en clôture.
  "mealprep.cta": "Compose your first week",

  // ── BANDE 1 · douleur 01 — « mon objectif n'a aucune traduction dans mon
  //    assiette ». C'est le héros: il doit faire dire « c'est moi » en 5 s.
  "mealprep.plate.kicker": "Your goal, on the plate",
  // ⚠️ « dinner » → « meal » et lede réécrit le 2026-09-01 — voir la note du
  // pack FR. L’objectif cité est le libellé du premier bouton
  // (`mealprep.goal.fat_loss`), mot pour mot.
  "mealprep.plate.title": "A goal is not a meal.",
  "mealprep.plate.lede":
    "“Fat loss” does not tell you what to put on the plate. Sophia composes your meals from the goal you declare: in every dish, the protein, starch and vegetable shares follow what you are aiming for.",
  // ⚠️ `mealprep.plate.price_note` RETIRÉE LE 2026-09-01 — voir le pack FR.

  // ── La démonstration — le sélecteur d'objectif ──────────────────────────
  "mealprep.demo.legend": "Choose a goal",
  // Les six objectifs, en libellé. Mêmes mots que l'écran foyer
  // (`household.goal.*`), forme nominale: ce sont des étiquettes.
  "mealprep.goal.fat_loss": "Fat loss",
  "mealprep.goal.muscle_gain": "Muscle gain",
  "mealprep.goal.maintenance": "Maintenance",

  // ⚠️ UN SEUL NOM POUR UNE SEULE CHOSE (2026-09-01). Le site en portait
  // Voir le pack FR: trois noms pour un objet, ramenés à un.
  "mealprep.demo.direction_label": "How you are served",
  // ⚠️ VERBATIM `SERVING_DIRECTION` — voir l'en-tête. Ne pas « améliorer ».
  "mealprep.dir.fat_loss": "generous vegetables, full protein share, smaller starch share",
  "mealprep.dir.muscle_gain": "larger protein and starch share, same vegetables",
  "mealprep.dir.maintenance": "balanced share of every component",

  // Les trois axes que la consigne sait nommer (`SERVING_AXES`).
  "mealprep.axis.protein": "Protein",
  "mealprep.axis.starch": "Starch",
  "mealprep.axis.vegetables": "Vegetables",

  // L'échelle, du moins au plus (`SERVING_DEMANDS`). `none` couvre l'axe que
  // la consigne ne nomme pas — jamais une valeur devinée.
  "mealprep.demand.smaller": "smaller share",
  "mealprep.demand.moderate": "moderate share",
  "mealprep.demand.balanced": "balanced share",
  "mealprep.demand.full": "full share",
  "mealprep.demand.larger": "larger share",
  "mealprep.demand.none": "nothing asked",

  // ── LES DEUX RÉGLAGES DE LA FOURCHETTE — voir le pack FR ────────────────
  "mealprep.demo.body_legend": "Your weight",
  "mealprep.demo.weight_value": "{kg} kg",
  "mealprep.demo.activity_legend": "Your days",
  "mealprep.activity.sedentary": "Sitting all day",
  "mealprep.activity.on_feet": "On your feet, moving",
  "mealprep.activity.trains_some": "Training 2 to 3 times a week",
  "mealprep.activity.trains_hard": "Training 4 times or more",

  // ── LA FOURCHETTE ET SA PORTE — voir le pack FR pour le renversement de
  // `LEGAL.md` §6.4, daté du 2026-09-01, et pour les quatre interdits.
  "mealprep.energy.label": "Your day’s range",
  // ⚠️ Les deux clés de la porte 18+ sont parties le 2026-09-01 — pack FR.
  // ⚠️ Deux clés nommées par leur base — voir le pack FR et
  // `energyBasis.int.test.ts` (« la base est DANS la clé »).
  "mealprep.energy.range_weight": "{low} – {high} kcal for your weight and your days",
  "mealprep.energy.range_directed": "{low} – {high} kcal for the goal you are aiming at",
  "mealprep.energy.basis":
    "A range, never a single figure. It allows for normal changes in energy use from one day to the next; there is no single number to hit.",
  // ── CE QUE L'OBJECTIF A FAIT À LA FOURCHETTE — voir le pack FR ──────────
  // ⚠️ Le chiffre nu a été retiré le 2026-09-01 — voir le pack FR.
  "mealprep.energy.moved_down":
    "This range is lower than maintenance because you are aiming to lose weight. The demonstration shows the fastest pace Sophia allows; you can always choose a slower pace.",
  "mealprep.energy.moved_up":
    "This range is higher than maintenance because you are aiming to gain weight. The demonstration shows the maximum Sophia allows: 10% more.",
  "mealprep.energy.floor_held":
    "In this example, a lower range would fall below the minimum energy level allowed. Sophia therefore keeps the maintenance range and says so clearly.",
  "mealprep.energy.no_range": "—",
  // ⚠️ Les six clés du panneau et la réserve sont parties le 2026-09-01 — pack FR.
  // ⚠️ L'hypothèse de rythme, nommée — voir le pack FR.
  "mealprep.energy.assumption_never":
    "Neither your height, nor your age, nor your sex enters this calculation. A formula that mixes them with a guessed activity factor returns a wrong figure with the confidence of a table.",

  // ── L'ENCART SOMBRE — voir le pack FR pour les deux contraintes de
  // formulation (`CALORIE_REVERSAL` §7, et `LEGAL.md` §6.4 sur la photo).
  "mealprep.drive.kicker": "When you want to lose or gain weight",
  "mealprep.drive.title": "It is the quantities that move, not the list of dishes.",
  // ⚠️ « the dishes stay yours » corrigé le 2026-09-01 — voir le pack FR.
  "mealprep.drive.grams":
    "Your goal changes the amount prepared — for example, 560 g in a container rather than 480 g — without changing the dishes composed for you. No food is removed or imposed simply to reach a number.",
  // ⚠️⚠️ Décrit un chemin PAS ENTIÈREMENT CÂBLÉ au 2026-09-01 — voir le pack
  // FR pour les deux pièces qui manquent (`api/mealPhoto.ts` ne lit pas
  // `energy_estimate`; aucun écran ne permet de déclarer une quantité).
  // ⚠️⚠️ Décrit un chemin PAS ENTIÈREMENT CÂBLÉ au 2026-09-01 — voir le pack FR.
  "mealprep.drive.logged":
    "On an evening when you did not cook, you can photograph or describe the meal to add it to that day’s log. Sophia gives a rough estimate for you to confirm or correct; a photo alone remains imprecise.",

  // La réserve de la démonstration: ni écran, ni grammes (FF-043 §11 n°1).

  // La réserve sombre de la bande 1 — repliée ici depuis l'ancienne bande
  // « Ce que ce n'est pas »: c'est en choisissant un objectif qu'on redoute
  // de retrouver un compteur.

  // ── BANDE 2 · douleur 02 — « décider coûte plus cher que cuisiner » ─────
  // Les sessions de cuisine ET les vagues de courses: un seul argument, deux
  // figures.
  // ⚠️ Kicker du héros depuis le 2026-09-01 — voir le pack FR.
  "mealprep.week.kicker": "A week of meals, for one person",
  "mealprep.week.title": "Your week of meals, planned all at once.",
  // ⚠️ Chapô du héros, ajouté le 2026-09-01 — voir le pack FR.
  "mealprep.mental.lede":
    "Planning the meals, choosing when to cook and working out the shopping means making the same decisions every week. Sophia organises everything at once.",
  "mealprep.week.body":
    "The week arrives in cooking sessions, not single dishes: you cook less often, for several days at once.",
  "mealprep.week.waves":
    "Shopping follows the plan in one or two runs. Fresh ingredients are bought before the cooking session that uses them.",

  // ── BANDE 2 · COMPOSÉ POUR VOUS — ajoutée le 2026-09-01, voir le pack FR
  // ⛔ On promet la COMPOSITION, jamais le RÉSULTAT: pas de « all your
  // nutrients », pas de taux de couverture, aucun bilan rendu.
  "mealprep.composed.kicker": "What is on the plate",
  // ⚠️ « Équilibré » borné par ce qui suit — voir le pack FR pour les trois
  // choses qu'on n'a PAS le droit de dire ici (plancher protéique, ancre par
  // repas, taux de couverture: aucune n'appartient à la lane du foyer).
  "mealprep.composed.title": "A complete meal, in an amount that fits you.",
  "mealprep.composed.body":
    "Every plate keeps the same three components: protein, starch and vegetables. Sophia builds that balance into the week from the start.",
  "mealprep.composed.body_size":
    "The amount takes your body and activity level into account. Someone who sits for eight hours and someone who trains four times a week do not get the same portion of the same dish.",
  "mealprep.composed.body_2":
    "Everything is worked out when the week is composed. At the table, you simply follow the portion shown: nothing to weigh, tick off or recalculate.",
  // ⚠️ « whether what you eat is enough » → l'équilibre — voir le pack FR.
  "mealprep.composed.note":
    "The balance and amount are decided before you cook. You open the plan and follow what is scheduled.",

  "mealprep.fig.session.title": "One cooking session, several ready meals",
  "mealprep.fig.session.desc":
    "A pot seen from above, linked by a comb of lines to identical containers: the same drawing, three times.",
  "mealprep.fig.session.label": "ONE COOKING SESSION",
  "mealprep.fig.session.pot": "one session",
  "mealprep.fig.session.covers": "WHAT IT COVERS",

  "mealprep.fig.waves.title": "Shopping split across the week",
  "mealprep.fig.waves.desc":
    "Two identical baskets over the days they cover. The first spans three days; the second runs on, open-ended.",
  "mealprep.fig.waves.label": "SHOPPING ACROSS THE WEEK",
  "mealprep.fig.waves.first": "FIRST RUN",
  "mealprep.fig.waves.next": "SECOND RUN",
  "mealprep.fig.waves.fresh": "THREE DAYS",
  "mealprep.fig.waves.week": "THE WEEK",

  // ── BANDE 3 · douleur 03 — « un imprévu, et toute la semaine tombe » ────
  "mealprep.moves.kicker": "When plans change",
  // ⚠️ Couvre les trois accidents depuis le 2026-09-01 — voir le pack FR.
  "mealprep.moves.title": "Sophia adjusts the rest of the week.",
  // ⚠️ La réparation est ici, pas dans la figure — voir le pack FR.
  // ⚠️ « three days » est `MAX_FRIDGE_DAYS = 3` — voir le pack FR.
  // ⚠️ Deux paragraphes de longueur voisine, rendus côte à côte — pack FR.
  // ⚠️ Deux paragraphes de longueur voisine, rendus côte à côte — pack FR.
  // ⚠️ « something no-cook » était FAUX, corrigé le 2026-09-01 — voir le pack
  // FR: un tap « la cuisson n'a pas eu lieu » fait la cascade puis PROPOSE LE
  // DÉCALAGE de la session et de ce qui en dépend (`accident_tap.ts`).
  // Deux paragraphes de longueur voisine, rendus côte à côte.
  "mealprep.moves.body":
    "You say what changed. If you miss a meal, Sophia can move it as long as it stays under 3 days in the fridge. If a cooking session does not happen, it offers to move that session and the meals that depended on it.",
  "mealprep.moves.body_2":
    "If the shopping is not done, Sophia also reschedules the planned cooking session and its meals. The plan shows what needs to move before you are left without a meal.",
  // ⚠️ « No dish is picked for you » NIAIT LE PRODUIT ENTIER: Sophia compose
  // bien les plats. Ce qui n’existe pas est le REMPLACEMENT d’un plat en cours
  // de semaine (`REALIGNMENT_ACTIONS`, `accident.ts:995-1004`). Un mot manquait.
  // ⛔ Deux réserves vraies — voir le pack FR (FF-057 🟠, et §5.1).
  // ⚠️ `mealprep.moves.note` retirée le 2026-09-01 — voir le pack FR.

  "mealprep.fig.moves.title": "The three accidents a week takes",
  // ⚠️ Réécrite avec la figure le 2026-09-01 — voir le pack FR.
  // ⚠️ Réécrite avec la figure — voir le pack FR.
  "mealprep.fig.moves.desc":
    "Three cards, one accident each, and what falls grows from left to right. On the first, a single dotted plate. On the second, a dotted pan and the three plates it feeds. On the third, a dotted basket above the pan and its three plates.",
  "mealprep.fig.moves.label": "THREE ACCIDENTS",
  // ⚠️ Les trois libellés nomment l'ACCIDENT — voir le pack FR.
  "mealprep.fig.moves.dish": "A MEAL MISSED",
  "mealprep.fig.moves.session": "A COOKING SESSION MISSED",
  // ⚠️ `tonight` remplacée le 2026-09-01 par le troisième accident réel.
  "mealprep.fig.moves.shopping": "SHOPPING NOT DONE",

  // ── BANDE 4 · le prix et la clôture ─────────────────────────────────────
  "mealprep.start.kicker": "To start",
  // ⚠️ Ne porte plus le chiffre, et plus de pronom — voir le pack FR.
  "mealprep.start.title": "Everything is included from the first person.",
  "mealprep.start.body":
    "Nothing is held back for bigger tables: the meals, the cooking sessions, the shopping and the conversation are there from the first person. And if someone joins you one day, they are added — you do not change product.",
  "mealprep.start.period": "a month",
  // ⚠️ Le charabia « a household of one » retiré le 2026-09-01 — pack FR.
  "mealprep.start.price_label": "For one person, with every feature included.",
  // ⚠️ Les cinq clés de la fiche d'entrée sont parties le 2026-09-01 — voir le pack FR.
  "mealprep.start.note": "Then Sophia composes the first week, in sessions.",

  //
  // ── ⛔ LES SIX `couples.dir.*` NE SE RÉÉCRIVENT PAS ────────────────────────
  // Elles sont les six valeurs de `SERVING_DIRECTION`
  // (`supabase/functions/_shared/keel/household_portions.ts:125-151`), MOT POUR
  // MOT. Deux choses en dépendent, et aucune des deux n'est dans ce fichier:
  //
  //   1. `frontend/src/keel/i18n/servingDirections.int.test.ts` lit le module
  //      Deno COMME DU TEXTE et épingle ces six valeurs. Les modifier ici casse
  //      un test que ce fichier n'a pas écrit.
  //   2. `CouplesPage.tsx` en LIT les axes avec la grammaire fermée du module
  //      (`QUALIFIERS`, `AXIS_WORDS`). Un synonyme hors vocabulaire (« plenty of
  //      vegetables ») rendrait `unreadable` sur l'écran, silencieusement.
  //
  // Le pack FR en est la traduction fidèle — et c'est bien la version ANGLAISE,
  // jamais la française, que la page donne à lire à son lecteur d'axes.
  // ── SEO ──────────────────────────────────────────────────────────────────
  // ⚠️ Suit le nouveau héros (2026-09-01) — voir le pack FR.
  "couples.seo_title": "A week of meals for two, decided once",
  "couples.seo_description":
    "What you eat, when you cook, what to buy — decided once for the week, for two. Two goals and two diets live together: one dish when it works, two in the same cooking session when it does not. €12.99 a month for the whole house.",

  // ── BANDE 1 — DOULEUR 01: deux objectifs = deux casseroles = abandon ──────
  // ⚠️ Le héros a changé d'objet le 2026-09-01 — voir le pack FR.
  "couples.hero.kicker": "A week of meals, for two",
  // ⚠️ Recopié mot pour mot sur `home.door.pair.label`.
  "couples.hero.title": "The hard part is agreeing.",
  "couples.hero.lede":
    "“What are we eating?” comes up every evening, and the person who answers often ends up handling the shopping and cooking too. Sophia decides once for the week: the meals, cooking days and shopping list.",
  // ⚠️ « Get started », comme `/` et `/meal-prep`. « Start » était une dérive
  // de l’anglais seul: le français disait déjà « Commencer » sur les trois.
  "couples.hero.cta": "Compose your first week",
  // ⚠️ `couples.hero.price` RETIRÉE LE 2026-09-01 — voir le pack FR.
  // ⚠️ LA RÉSERVE D’ENTRÉE, AJOUTÉE LE 2026-08-13. `/` et `/couples` la
  // portaient, `/meal-prep` et `/families` non — le même tunnel donnait donc
  // deux réponses opposées à « est-ce que je peux entrer aujourd’hui ? ».
  // `/start` interroge d’abord `keel_free_signup_available`: sans programme du
  // coach maison publié, la porte est fermée (audit §10). La règle est écrite
  // trois lignes au-dessus de `home.hero.reserve`: « Aucune page ne promet une
  // entrée immédiate sans cette réserve. » Elle vaut pour les quatre.

  // ── LA DÉMONSTRATION — deux objectifs, une casserole ─────────────────────
  // ⚠️ Le chapeau annonce la QUESTION, pas une réponse — voir le pack FR.
  "couples.demo.eyebrow": "One cooking session. One dish, or two.",
  "couples.demo.hint": "Choose a goal for each of you.",

  // ── LE RÉGIME ET LA SORTIE DE LA DÉMONSTRATION — voir le pack FR ────────
  "couples.demo.diet_legend": "What they eat",
  "couples.diet.omnivore": "Anything",
  "couples.diet.vegetarian": "Vegetarian",
  "couples.diet.vegan": "Vegan",
  "couples.diet.pescatarian": "Pescatarian",
  "couples.demo.outcome_label": "What comes out of the pan",
  "couples.demo.outcome_one_dish": "One dish, served differently.",
  "couples.demo.outcome_one_session": "Two dishes, one cooking session.",
  "couples.demo.outcome_why_one_dish":
    "The same dish meets both needs; Sophia simply shows a different portion for each of you.",
  "couples.demo.outcome_why_goals":
    "The same dish cannot provide both planned portions. Sophia adds a second dish within the same cooking session.",
  "couples.demo.outcome_why_diet":
    "The shared dish follows the stricter diet — {regime}. If that dish can no longer provide one of the two portions, Sophia adds a second dish.",
  "couples.demo.outcome_rule":
    "Sophia keeps one shared dish when it works for both of you. Otherwise, it prepares two dishes in the same session. Separate sessions are only needed if you have no cooking day in common.",

  // ── BANDES 3 ET 4 — voir le pack FR ─────────────────────────────────────
  "couples.together.kicker": "Two people, two ways of eating",
  "couples.together.title": "Your goals and constraints can fit in the same plan.",
  "couples.together.lede":
    "One wants to gain muscle, the other to lose fat. One is vegetarian, the other eats everything. Sophia starts by looking for a shared dish, then adds a second one only when both needs cannot fit together.",
  "couples.together.tastes":
    "Preferences are learned through conversation. Say “I don’t like fish” once, and Sophia leaves it out of the following weeks.",
  "couples.give_up.kicker": "When constraints differ",
  "couples.give_up.title": "The shared dish follows the stricter constraint.",
  "couples.give_up.body":
    "If one of you is vegetarian, the shared dish is vegetarian too. The person who eats everything can eat that dish; the vegetarian cannot eat a dish containing meat. The same logic applies to allergies.",
  "couples.give_up.body_2":
    "If that shared dish can no longer provide the portion planned for the other person, Sophia adds a second dish within the same cooking session. It only separates the dishes when necessary.",
  "couples.moves.kicker": "When plans change",
  "couples.moves.title": "Sophia adjusts the plan for both of you.",
  "couples.moves.body":
    "One of you says what changed. If you miss a meal, Sophia can move it as long as it stays under 3 days in the fridge. If a cooking session does not happen, it offers to move that session and the meals that depended on it.",
  "couples.moves.body_2":
    "If the shopping is not done, Sophia also reschedules the planned cooking session and its meals. You immediately see what needs to move, without rebuilding the schedule together.",
  "couples.fig.moves.label": "THREE ACCIDENTS",
  "couples.fig.moves.title": "The three accidents a week takes",
  "couples.fig.moves.desc":
    "Three cards, one accident each, and what falls grows from left to right. On the first, a single dotted plate. On the second, a dotted pan and the three plates it feeds. On the third, a dotted basket above the pan and its three plates.",
  "couples.fig.moves.dish": "A MEAL MISSED",
  "couples.fig.moves.session": "A COOKING SESSION MISSED",
  "couples.fig.moves.shopping": "SHOPPING NOT DONE",
  "couples.demo.person_a": "One of you",
  "couples.demo.person_b": "The other",

  // Les six objectifs, par leur nom d'écran.
  "couples.goal.fat_loss": "Losing fat",
  "couples.goal.muscle_gain": "Gaining muscle",
  "couples.goal.maintenance": "Maintenance",

  // ⛔ VERBATIM. Voir l'en-tête de ce fichier avant de toucher une virgule.
  "couples.dir.fat_loss":
    "generous vegetables, full protein share, smaller starch share",
  "couples.dir.muscle_gain":
    "larger protein and starch share, same vegetables",
  "couples.dir.maintenance": "balanced share of every component",

  // Les trois axes qu'une direction sait nommer (`SERVING_AXES`).
  // ⚠️ Dix clés retirées le 2026-09-01 avec le tableau des axes — pack FR.

  // L'échelle, du moins au plus (`SERVING_DEMANDS`), plus les deux cas de
  // lecture: axe non nommé, axe nommé sans qualificatif.
  // ⚠️ « share » EXPLICITE, comme sur `/meal-prep`. Les deux démonstrations
  // lisent la même constante et disaient la même valeur de deux façons.

  // ── BANDE 2 — DOULEUR 02: « il mange deux fois plus que moi » ────────────
  // ── BANDE 2 · EST-CE QU'ON MANGE BIEN ? — voir le pack FR ───────────────
  "couples.bodies.kicker": "Portion size",
  "couples.bodies.title": "The same meal, two portions sized for you.",
  "couples.bodies.lede":
    "Each meal keeps the same three components: protein, starch and vegetables. What differs between your plates is the amount, not the balance of the meal.",
  "couples.bodies.size":
    "Each portion is sized from that person’s height, weight, age and sex. You can eat the same dish without serving yourselves the same amount.",
  // ⚠️ Même clôture que les deux autres pages — voir le pack FR.
  "couples.bodies.settled":
    "Both portions are worked out before cooking, so there is nothing to recalculate when you serve.",
  "couples.bodies.in_label": "To size each portion",
  "couples.bodies.in_1": "Height",
  "couples.bodies.in_2": "Weight",
  "couples.bodies.in_3": "Age",
  "couples.bodies.in_4": "Sex",
  "couples.bodies.out_label": "In the plan",
  "couples.bodies.out": "each person’s portion, described in words",

  // ── BANDE 3 — DOULEUR 03: un seul des deux planifie ─────────────────────
  "couples.other.kicker": "The second profile",
  // ⚠️ CE TITRE VENDAIT LA DÉLÉGATION, C’EST-À-DIRE LA DOULEUR. La ligne 03 de
  // la grille est « l’autre subit ce qu’on lui sert et n’a aucune prise »; le
  // titre disait « un seul de vous deux a besoin de s’en occuper », et le
  // paragraphe juste dessous le contredisait mot pour mot (« la charge se
  // partage au lieu de se déléguer »). En lecture-titres, un couple concluait
  // « un pilote, un passager » — exactement ce que la section existe pour
  // retirer.
  "couples.other.title": "Each of you can access the plan and manage your goal.",
  // ⚠️ Montant sorti de la phrase le 2026-09-01 — voir le pack FR.
  "couples.other.lede":
    "Even without an account, the other person is included in the meals and receives their portion. With their own access, they can view the plan and follow their own goal. {amount} a month.",

  // ── LA SEMAINE, DESCENDUE ICI LE 2026-09-01 — voir le pack FR ───────────
  "couples.week.kicker": "What arrives every week",
  "couples.week.title": "It is not just a serving direction.",
  // ⚠️ Les repas manquaient à la fiche — trou de FOND, voir le pack FR.
  "couples.week.meals_title": "The week’s meals, decided",
  "couples.week.meals_body":
    "Seven days composed for the two of you at once — not a suggestion to settle every evening. You open the plan, you see what is planned, and you change what you want.",
  "couples.week.sessions_title": "The week arrives in cooking sessions",
  "couples.week.sessions_body":
    "One cooking session can prepare several meals. The plan shows who cooks, on which day, and how many meals that session prepares.",
  "couples.week.waves_title": "Shopping in one or two runs",
  "couples.week.waves_body":
    "The list follows the plan and is split into one or two runs. Fresh ingredients are bought before the cooking sessions that use them.",

  "couples.fig.who.title": "Who is in the plan",
  // ⚠️ Réécrite le 2026-09-01 — voir le pack FR. Elle portait « two euros a
  // month » en toutes lettres, un tarif périmé qu'aucun balayage de chiffres
  // ne pouvait voir.
  "couples.fig.who.desc":
    "The same household, two ways of being in it. Without an account, the other one is still a person in the house and still gets a serving. Their own access adds a way in of their own, and a goal they change themselves.",
  "couples.fig.who.eyebrow": "WHO IS IN THE PLAN",
  "couples.fig.who.col_a": "WITHOUT AN ACCOUNT",
  // ⚠️ « a mouth of the household » retiré — voir le pack FR.
  "couples.fig.who.a1": "a person in the house",
  "couples.fig.who.a2": "their serving is written",
  "couples.fig.who.a3": "included",
  // ⚠️ « CLAIMED PROFILE » retiré de la vitrine — voir le pack FR.
  "couples.fig.who.col_b": "WITH THEIR OWN ACCESS",
  "couples.fig.who.b1": "their own way in",
  "couples.fig.who.b2": "their own goal, editable",
  // ⚠️ Montant interpolé depuis `PRICES.claimedProfile` — voir le pack FR.
  "couples.fig.who.b3": "{amount} a month",
  "couples.fig.who.foot": "the account that opens the household is never counted",

  // ── BANDE 4 — le prix et la clôture ─────────────────────────────────────
  "couples.price.kicker": "The price",
  "couples.price.title": "One household, one price.",
  "couples.price.period": "per month, for the household",
  // ⚠️ Montant interpolé depuis `PRICES.claimedProfile` — voir le pack FR.
  "couples.price.label":
    "A second access is {amount} a month. Your own access is included in the household price.",
  "couples.price.note":
    "The base price already covers meals for both of you. A second personal login remains optional.",

  // ══ FAMILIES — the HOUSEHOLD sales page (`/families`) ══════════════════════
  //
  // THE BUYER, SHARPENED ON 2026-08-31: someone 35-45 who cooks most evenings
  // and decides, alone, what everyone eats. The qualifier is THE CHILD, never
  // the head count — one parent with one child is the most qualified household
  // on the market (POSITIONNEMENT §2.3), and the old « Three mouths at the
  // table, or more » ruled them out in so many words.
  //
  // ⚠️ « MOUTH » IS GONE FROM THE BODY COPY. It turns people into head count on
  // the first line read, on a page addressed to someone competent and tired. It
  // survives only where it is the PRODUCT's own word (the cap of eight), and
  // even there it now says « people ».
  //
  // ⚠️ WE AIM AT MOTHERS WITHOUT EVER WRITING IT. Whoever runs the meals is a
  // ROLE, not a gender: a father who carries it must not read as an exception.
  //
  // KEY ORDER = ORDER OF THE SIX BANDS:
  //   1. hero          — the mental load (hook n°1)
  //   2. recognition   — served / absorbed / given up, then why you pay
  //   3. the doubt     — hook n°2, and the one dark band
  //   4. Thursday      — the collapse, and THE PROOF (a week, shown)
  //   5. how it works  — three steps
  //   6. the price     — €11.99, first month free
  "families.seo_title": "The whole house’s meals, decided once a week",
  "families.seo_description":
    "Sophia plans your household’s week: the meals, cooking sessions and one or two shopping runs. One session can prepare several meals, with a portion adapted to each person. €12.99 a month for the whole household, first week free.",

  // ── BAND 1 · the mental load ────────────────────────────────────────────
  // ⚠️ « You don't cook too much. You decide too much. » — the headline says
  // what we take away AND what we don't. She knows how to cook; it is the
  // DECIDING that weighs. A headline offering to spare her the cooking would
  // be talking to somebody else.
  "families.hero.kicker": "When there are children in the house",
  "families.hero.title": "You don’t cook too much. You decide too much.",
  "families.hero.lede":
    "Keeping track of what each person will not eat and what each person needs, then turning it all into meals, cooking sessions and a shopping list. That work comes back every week, always to the same person, and nobody sees it. Sophia handles that part; the cooking stays yours.",

  // ── BANDE 2① · L'ÉQUILIBRE — neuve le 2026-09-01, voir le pack FR.
  // ⛔ On promet la COMPOSITION, jamais le résultat. Aucun bilan sur un mineur.
  "families.balanced.kicker": "What is on the plate",
  // ⚠️ « The same dish » tout court était faux — voir le pack FR.
  "families.balanced.title": "The same dish when possible. A portion adapted to each person.",
  "families.balanced.body":
    "Every plate has its three components: a protein, a starch, vegetables. What changes from one person to the next is not whether they are there — it is their proportion, and the amount.",
  // ⚠️ La clôture nomme l'ÉQUILIBRE depuis le 2026-09-02 — voir le pack FR.
  "families.balanced.body_2":
    "The amount takes the person’s age, body and activity level into account. A fourteen-year-old and his nine-year-old sister do not get the same portion of the same dish. Everything is planned with the week, so there is nothing to recalculate at the table.",
  // ⚠️ La règle du plat, dite là où le lecteur se fait sa conviction — voir le
  // pack FR. ⛔ Ne pas retourner la dernière phrase en « vous choisissez
  // d'avoir deux plats »: le choix est un PLAFOND, il ne fabrique rien.
  "families.balanced.one_or_two":
    "Most of the time, one dish works for the whole table. When a diet or constraint makes that dish unsuitable for someone, Sophia adds a second dish within the same cooking session. If you would rather never cook two dishes, you can set that limit and Sophia will explain the consequences.",
  "families.hero.cta": "Compose your first week",
  // ⚠️ `families.hero.price_note` RETIRÉE LE 2026-09-01 — voir le pack FR.

  // The hero figure: one pot, four shares — and under each share THE REASON it
  // is not the next one. All four are drawn the same size: the product says a
  // WORD about a minor, never a ratio.
  "families.fig_table.label": "ONE COOKING, PLATES THAT DIFFER",
  "families.fig_table.a11y_title": "One cooking, four plates that differ",
  "families.fig_table.a11y_desc":
    "A pot at the top, holding the evening’s dish. Four lines run down from it to four plates drawn the same size. Under each plate, a first name and the reason that share is not the next one: an adult’s goal, two ages, a food kept out of the pot.",
  "families.fig_table.pot": "ONE COOKING ONLY",
  "families.fig_table.dish": "Chicken, rice and beans",
  "families.fig_table.m1": "You",
  "families.fig_table.m2": "Sami, 14",
  "families.fig_table.m3": "Inès, 9",
  "families.fig_table.m4": "Jo",
  "families.fig_table.why1": "your goal",
  "families.fig_table.why2": "he is growing",
  "families.fig_table.why3": "her age",
  "families.fig_table.why4": "no peanut",

  // ── BAND 2 · the three shapes of divergence ─────────────────────────────
  // ⚠️ THE THIRD CARD IS THE ONE THAT MATTERS. « Everyone eats the same » is a
  // FALSE NEGATIVE: that household GAVE UP, because serving the difference by
  // hand costs too much. It does not need the product any less.
  "families.forms.kicker": "The table",
  "families.forms.title": "At your house it goes one of three ways.",
  "families.forms.served_title": "You cook twice.",
  "families.forms.served_body":
    "One dish for those who can eat it, another for the person who cannot. Every evening, that doubles the work for the person cooking.",
  "families.forms.absorbed_title": "One dish, but very few options.",
  "families.forms.absorbed_body":
    "Very few dishes suit everyone, but you still need to fill the whole week without repeating the same meals.",
  "families.forms.given_up_title": "Everyone eats the same.",
  "families.forms.given_up_body":
    "It is not that nobody has a different need. It is that serving that difference costs too much when one person cooks, in the evening, for everybody.",
  // ⚠️ Restaurée le 2026-09-01 — voir le pack FR (BRIEF §5, l'objection n°1).
  // ⚠️ LA BANDE DES CONTRAINTES A ÉTÉ SUPPRIMÉE LE 2026-09-02, sur décision
  // du propriétaire, avec ses quatre clés (`families.limits.*`): le titre,
  // l'allergie (fail-closed de `household_safety.ts`), le régime (R4/R5 de
  // `household_diet.ts`) et l'interdit parental.
  // ⚠️ Ce qui part avec elle: voir le pack FR. ⛔ Ne pas rétablir par symétrie.
  // The answer to « there is a free planner », naming nobody. It is the only
  // place on the page that says why you pay.

  // ── BAND 3 · the doubt (the dark band) ──────────────────────────────────
  // ⛔ THE LINE IS SHARP: we COMPOSE FOR each of them, we never REPORT ON a
  // child. The doubt is removed, not measured — a screen showing a shortfall in
  // a twelve-year-old would make this reader more anxious, not less.
  // ⚠️ Les quatre clés `families.doubt.*` sont parties le 2026-09-01 — pack FR.
  // ⚠️ Raccourcie le 2026-09-01 — le mécanisme est dit par `Balanced`, juste
  // au-dessus. Ce bloc répond, il n'explique pas. La clôture ne bouge pas.

  // ── BAND 4 · Thursday, and the proof ────────────────────────────────────
  "families.thursday.kicker": "Thursday",
  "families.thursday.title": "When a cooking session is missed, Sophia adjusts the meals that depend on it.",
  // ⚠️ Deux paragraphes de longueur voisine, réécrits pour une famille — pack FR.
  "families.thursday.body":
    "If Sunday’s cooking session does not happen, several meals later in the week are no longer possible. In a family, one disruption can affect several people’s meals for several days.",
  // ⚠️ « moves » et pas « no-cook » — voir le pack FR. « 3 days » est
  // `MAX_FRIDGE_DAYS`. `FF-057` est 🟠 en cours: « you say so », jamais « a button ».
  "families.thursday.repair":
    "You say what changed. Sophia then offers to move the cooking session and its meals. It only moves a dish when the fresh ingredients already bought will still be safe on the new date.",
  // ⚠️ `families.thursday.reserve` repliée dans `repair` le 2026-09-01 — pack FR.

  // ── LA FIGURE DES TROIS ACCIDENTS — voir le pack FR.
  "families.fig.moves.label": "THREE ACCIDENTS",
  "families.fig.moves.title": "The three accidents a week takes",
  "families.fig.moves.desc":
    "Three cards, one accident each, and what falls grows from left to right. On the first, a single dotted plate. On the second, a dotted pan and the three plates it feeds. On the third, a dotted basket above the pan and its three plates.",
  "families.fig.moves.dish": "A MEAL MISSED",
  "families.fig.moves.session": "A COOKING SESSION MISSED",
  "families.fig.moves.shopping": "SHOPPING NOT DONE",

  // The proof figure: a week shown, then the same week after the cooking was
  // skipped. ⚠️ Days are three letters, not initials: a bare « S » would be
  // « samedi » here and « Saturday » there — an identical value in both packs,
  // to be whitelisted in the parity test.
  "families.fig_week.label": "A WEEK, COMPOSED",
  "families.fig_week.a11y_title": "A composed week: the meals, the shopping and the cooking",
  "families.fig_week.a11y_desc":
      "Seven days in a row. Each day has a meal. In this example, two shopping runs are scheduled on Monday and Friday, before the cooking session on the same day. A brace runs under the three evenings each session covers; Thursday sits under neither.",
  "families.fig_week.waves": "UP TO TWO SHOPPING RUNS",
  "families.fig_week.d1": "MON",
  "families.fig_week.d2": "TUE",
  "families.fig_week.d3": "WED",
  "families.fig_week.d4": "THU",
  "families.fig_week.d5": "FRI",
  "families.fig_week.d6": "SAT",
  "families.fig_week.d7": "SUN",
  "families.fig_week.planned": "AS COMPOSED",
  "families.fig_week.cooking": "COOKING",
  // ⚠️ Jeudi hors des deux accolades est EXACT — voir le pack FR
  // (`MAX_FRIDGE_DAYS = 3`, jour de cuisson compris).
  "families.fig_week.covers": "Each cooking session serves three evenings; Thursday is put together another way.",
  "families.fig_week.dish2": "Chickpea curry",
  // ⚠️ Trois clés parties avec la seconde rangée le 2026-09-01 — pack FR.

  // ── BAND 5 · how it works ───────────────────────────────────────────────
  // ⚠️ NO DURATION IS PROMISED. « Ten minutes » is measured nowhere, and the
  // funnel is long: we name the FIELDS asked for, and the fact that the first
  // step is not done twice.
  "families.how.kicker": "How it works",
  "families.how.title": "Three steps, and the first one happens only once.",
  "families.how.s1_step": "First",
  "families.how.s1_title": "You say who eats here.",
  "families.how.s1_body":
    "First name, date of birth, goal, what each of them does not eat. Your children are in the plan with no account, no screen, no password.",
  "families.how.s2_step": "Then",
  "families.how.s2_title": "The week arrives composed.",
  "families.how.s2_body":
    "The meals, cooking sessions scheduled around your availability, and one or two shopping runs. You approve the plan, then change whatever you want.",
  "families.how.s3_step": "After a disruption",
  "families.how.s3_title": "You say what changed.",
  "families.how.s3_body":
    "Sophia reschedules the affected meals and cooking sessions through to the end of the week.",

  // ── BAND 6 · the price, and the way out ─────────────────────────────────
  // ⚠️ THE AMOUNT IS EMBEDDED IN A SALES SENTENCE, SO IT LIVES HERE AND NOT IN
  // `PRICES` (see the header of `i18n/prices.ts`). The card renders
  // `formatPrice(PRICES.household)`. If the tariff moves, `price.body`,
  // `hero.price_note` and `seo_description` move WITH it.
  "families.price.kicker": "The price",
  "families.price.title": "One price for the household. Not one per person.",
  "families.price.period": "a month, the whole household",
  "families.price.label": "Up to eight people. Your access is included.",
  // ⚠️ Réécrite le 2026-09-01 — voir le pack FR. Les faits d'offre sont
  // partis dans `offer.*`; il ne reste que l'argument propre à la page.
  "families.price.body":
    "Adding another person at the table does not change the price. Larger families do not pay more to organise their meals.",

  "families.fig_price.label": "THE PRICE FOLLOWS THE HOUSEHOLD",
  "families.fig_price.a11y_title": "Eight places, one price",
  "families.fig_price.a11y_desc":
    "A row of eight places. The first represents your included access; three more are taken, four are still open and drawn with a dashed edge. The price below does not change as places fill.",
  "families.fig_price.you": "YOU",
  "families.fig_price.not_counted": "YOUR ACCESS INCLUDED",
  "families.fig_price.cap": "CAP: 8 PEOPLE",
  "families.fig_price.taken": "TAKEN",
  "families.fig_price.free": "OPEN",
  "families.fig_price.steady": "The price does not change as places fill.",

  // ── POURQUOI CETTE PAGE VEND UN REVENU ET PLUS UNE FATIGUE ÉVITÉE ────────
  //
  // ⚠️ CE BLOC EST ARRIVÉ ICI LE 2026-08-13, ET IL ÉTAIT ORPHELIN. Il vivait en
  // tête du bloc `home`, sous le titre « Landing — hero »: le raisonnement de
  // vente d'une page PRO, posé à décrire le hall du FOYER. La page qu'il
  // décrit a déménagé vers `/coaches` (audit D3); son raisonnement la suit.
  //
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
  // le laisser croire (silence S12). Ce qu'on promet est exact et suffisant: le
  // coach obtient quelque chose QUI VAUT un abonnement. Il l'encaisse avec ses
  // propres outils.
  //
  // La cible est double et le titre les couvre toutes les deux: celui qui vend
  // une formation one-shot (Sophia lui crée la ligne récurrente), et le coach
  // 1:1 avec une liste d'attente (Sophia lui crée le palier SOUS son 1:1).

  //
  // ── QUATRE BANDES, TROIS DOULEURS, ET DEUX SECTIONS MORTES ────────────────
  // La page passe de sept sections à quatre. Une section = une ligne de la
  // grille des douleurs, et `/coaches` n'en a que trois:
  //
  //   BANDE 1 — 01 « Ma formation se termine, l'accompagnement meurt avec elle »
  //   BANDE 2 — 02 « Mes élèves ont une question le mardi soir »
  //   BANDE 3 — 03 « Une IA dira le contraire de ce que j'enseigne »
  //   BANDE 4 — le prix ET la clôture, fusionnés.
  //
  // SONT MORTES ICI: `coaches.monday.*` + `coaches.fig.monday.*` (le lundi en une
  // page appartient à `/gyms` douleur 02 et au hall `/pro` ligne 04) et
  // `coaches.note.*` (la grille a explicitement ÉCARTÉ la note 1:1 du monde pro:
  // « utilisée jamais citée » est une promesse de prompt sans vérificateur —
  // B26, `coach_note.ts:126-128`). Ni l'une ni l'autre n'est fausse; aucune des
  // deux n'est une des trois lignes de cette page.
  //
  // VOCABULAIRE: cette page est la SEULE du monde pro à dire « students ».
  // `/pro` et `/gyms` disent « clients ». « Personalised follow-up » reste
  // interdit partout (S2, amendé le 2026-08-13).
  // ── SEO ─────────────────────────────────────────────────────────────────
  "coaches.seo_title": "Sophia — your method answers your students, every day",
  // B8b MOT POUR MOT DANS SON SENS: la méthode entre dans le chat, dans chaque
  // semaine et dans chaque repas; SEUL le chat est relu avant envoi. Ne jamais
  // écrire « chaque message est vérifié » (4 surfaces scannées sur 8, B8) ni
  // « la doctrine entre à chaque message » (B7).
  "coaches.seo_description":
    "You recorded your method once. Sophia answers your students in it every day — in the chat, in every week and every meal she drafts. What she writes in the chat is read back against your red lines before it is sent, with no model in that loop. €7 per student, per month, no platform fee.",

  // ── BANDE 1 — DOULEUR 01 ────────────────────────────────────────────────
  // Le titre survit à la refonte: il nomme la douleur (le cours finit) et la
  // promesse (le coaching, non) en six mots, et il n'a jamais été le problème.
  "coaches.hero.kicker": "For coaches who sell a method, not hours",
  "coaches.hero.title": "Your course ends. Your coaching doesn’t.",
  "coaches.hero.lede":
    "You recorded the method once. Sophia answers your students with it, every day — the question at nine at night, the week they build, the meals she drafts. What you could only sell once becomes something you can bill every month.",
  "coaches.hero.cta": "Start the 14-day trial",
  // B5 (14 jours / 3 élèves) · B32 (invitation e-mail, pas de lien à copier) ·
  // S1 (aucune boîte de réception, et l'absence EST le produit — dite à
  // l'affirmative, parce qu'un coach cherche la boîte avant de la croire absente).
  "coaches.hero.note":
    "14 days, up to 3 students, then it stops on its own. They join by email invitation and get a space of their own. Nothing comes back to an inbox on your side — there isn’t one.",
  // B28 — révision et rollback: la clé de cache est le hash du contenu, donc
  // une correction est visible au message suivant (`doctrine.ts:38-43`).
  "coaches.hero.fig_caption":
    "You record it once, in a guided interview. Revise it whenever you like — an edit lands on the next message — and roll back to an earlier version without losing what your students already received.",

  "coaches.fig.after.title": "The course stops; the method keeps answering",
  "coaches.fig.after.desc":
    "Two rows on one timeline. The course is a closed box that ends at the last video. The method, recorded at the same moment, does not close on the right: it runs on past that point, answering day after day.",
  "coaches.fig.after.eq": "AFTER THE LAST VIDEO",
  "coaches.fig.after.course": "YOUR COURSE",
  "coaches.fig.after.modules": "the modules",
  "coaches.fig.after.end": "IT STOPS HERE",
  "coaches.fig.after.method": "YOUR METHOD",
  "coaches.fig.after.recorded": "recorded once",
  "coaches.fig.after.every_day": "answering, day after day",

  // ── BANDE 2 — DOULEUR 02 ────────────────────────────────────────────────
  "coaches.day.kicker": "Tuesday, nine at night",
  "coaches.day.title": "The questions that arrive when you are not there.",
  // ⚠️ LA PREMIÈRE QUESTION MISAIT SUR LA MAUVAISE CHAÎNE, et c'était la seule
  // des trois. Elle disait « Can I swap the rice for pasta tonight? ». Le
  // résolveur existe (`plan_question/swap_resolver.ts`) — mais il lit des
  // `plan_commitments`, que `keel_plan_context.ts:695-712` ne rend qu'avec un
  // `plan_version_id` PUBLIÉ: la chaîne de prescription 1:1, dont `CLAUDE.md`
  // dit qu'elle n'est PAS le modèle. Un élève de cohorte — ce que cette page
  // vend — tombe sur `commitment_not_identified` et reçoit la MÊME phrase
  // générique chez quatre coachs opposés. L'exemple d'ouverture d'une bande qui
  // promet « la réponse est la tienne » démontrait donc le contraire.
  //
  // Le petit-déjeuner est LE partage de doctrine, et il tombe sur le composeur —
  // la seule lane où le bloc de doctrine est injecté (B7).
  "coaches.day.q1": "“Do I really need breakfast?”",
  "coaches.day.q2": "“I’m starving at 4pm — is that normal?”",
  "coaches.day.q3": "“I ate badly at a wedding. Have I wrecked the week?”",
  "coaches.day.body":
    "None of them is in a module: they are about tonight, this kitchen, this week. Each one has an answer, and the answer is yours — you have made that call a hundred times. Students drift because on Tuesday night, nobody who thinks like you was there.",
  // S1 + S3 — l'absence de canal retour, dite à l'affirmative, et le PULL.
  // ⚠️ « et c’est déjà répondu » PROMETTAIT UNE RÉPONSE AVANT LA QUESTION.
  // Rien ne pré-répond: l’élève demande, l’agent répond — et c’est déjà tout
  // l’argument. La phrase disait par accident la seule chose de cette page que
  // le produit ne fait pas. Le reste du paragraphe (S1: ni boîte de réception,
  // ni file de réponses) est vrai et se garde tel quel.
  "coaches.day.reserve":
    "None of it comes back to you. There is no inbox, no reply queue, no thread waiting on your evening: your students ask in their own space, and the answer comes back — without going through you.",

  "coaches.fig.method.title": "One method, four places it is written into",
  "coaches.fig.method.desc":
    "The published method on the left. On the right, the four things Sophia composes for a student: their chat, the week they build, the meals she drafts, their household’s meals — each one composed with the method in it.",
  "coaches.fig.method.eq": "RECORDED ONCE",
  "coaches.fig.method.source": "YOUR METHOD",
  "coaches.fig.method.l1": "your convictions",
  "coaches.fig.method.l2": "your red lines",
  "coaches.fig.method.l3": "what you say instead",
  "coaches.fig.method.l4": "your vocabulary",
  // ⚠️ TROIS SORTIES DEPUIS LE 2026-08-19, pas quatre. « the week they build »
  // était la lane `generate-week-plan-v1`, retirée faute d'appelant vivant.
  // Les trois restantes sont vérifiées: run.ts:2448 · generate-meal-v1:1729 ·
  // generate-household-meal-v1:3569, les trois `doctrineBlockFor(doctrine)`.
  "coaches.fig.method.out1": "their chat",
  "coaches.fig.method.out2": "the meals she drafts",
  "coaches.fig.method.out3": "their household meals",

  // ── BANDE 3 — DOULEUR 03 · LE BLOC SOMBRE ───────────────────────────────
  "coaches.lock.kicker": "The part you should be most afraid of",
  "coaches.lock.title": "An AI speaking in your name is a risk. We treat it as one.",
  "coaches.lock.body":
    "A prompt is an instruction, not a guarantee. Tell any model “never recommend six small meals” and it will comply almost always — and almost always is the wrong number when one public contradiction of you is the thing your students remember.",
  // ⚠️ B8b — FORMULATION IMPOSÉE. L'asymétrie EST l'argument: nommer ce qui
  // n'est qu'une consigne protège la seule phrase de la page qui est une
  // garantie. « Chaque message sortant est vérifié » est FAUX (B8).
  "coaches.lock.scope":
    "So your method is written into the chat and into every meal Sophia drafts. That much is an instruction. This part is not: what she writes in the chat is read back against your red lines before it is sent, by code, with no model in that loop.",
  // La réserve honnête, sous la démonstration: le repli générique n'est JAMAIS
  // signé (`keel_output_locks.ts:202-209`), et il n'y a pas de porte de retour.
  "coaches.lock.reserve":
    "Your student never gets a refusal, and never “ask your coach” — in a masterclass that points at a door which doesn’t exist. Where you left the replacement blank, what goes out is our own sentence, unsigned: we don’t put your name on words you didn’t write.",

  // ── LA DÉMONSTRATION ────────────────────────────────────────────────────
  // Le MÉCANISME est le produit; l'EXEMPLE est un champ que le coach remplit.
  // D'où la forme d'une fiche à champs remplis, jamais celle d'une capture.
  "coaches.lock.demo.eq": "IN THE CHAT, BEFORE IT IS SENT",
  "coaches.lock.demo.written_label": "WHAT YOU WROTE, ONCE",
  "coaches.lock.demo.line_label": "your red line",
  "coaches.lock.demo.line_value": "six small meals",
  "coaches.lock.demo.instead_label": "what you say instead",
  // Cette phrase est celle du dépôt, mot pour mot — le commentaire de
  // `signAsCoach` (`sophia-brain/skills/_shared/keel_output_locks.ts:216-218`).
  "coaches.lock.demo.instead_value":
    "Three real meals. If you’re hungry between them, the meal before was too small.",
  "coaches.lock.demo.group_label": "IF THE MODEL WRITES",
  "coaches.lock.demo.draft_a": "“Try six small meals across the day.”",
  // L'exception de négation, mot pour mot (`doctrine.ts:30-31`).
  "coaches.lock.demo.draft_b": "“Your coach doesn’t do six small meals.”",
  "coaches.lock.demo.out_label": "WHAT YOUR STUDENT READS",
  "coaches.lock.demo.verdict_a": "Held, and replaced.",
  "coaches.lock.demo.verdict_b": "Sent as it stands.",
  "coaches.lock.demo.why_a":
    "The whole message is replaced by your sentence, and signed with your name.",
  "coaches.lock.demo.why_b":
    "Naming your red line to explain it is your method working, so nothing touches it.",
  // ⚠️ « — Marc » CONCLUAIT UNE FICHE ÉCRITE EN « TU », juste sous
  // « signé de ton nom »: le lecteur cherchait qui est Marc. Les étiquettes de
  // cette démonstration disent « ce que TU as écrit » — c’est donc SA fiche, et
  // la signature doit être la sienne.
  "coaches.lock.demo.sign": "— your name",
  "coaches.lock.demo.foot":
    "Two drafts, one red line. The check is a rule you wrote, matched in code: no model decides whether a message goes out.",

  // ── BANDE 4 — LE PRIX ET LA CLÔTURE, FUSIONNÉS ──────────────────────────
  "coaches.price.kicker": "Pricing",
  "coaches.price.title":
    "You have already written the method. This is what makes it worth paying for every month.",
  "coaches.price.seat_period": "per student, per month",
  "coaches.price.seat_label": "No platform fee. No setup. No tier to outgrow.",
  // B3, et jamais B2: l'intervalle annuel est celui du COACH, pas de l'élève.
  "coaches.price.yearly": "a seat when you pay yearly — your billing interval, not your student’s.",
  // B4 (on arrête le mois où on éteint) · B6 (zéro élève est refusé au
  // checkout, donc « positif dès le premier élève » ne s'écrit pas) · S12.
  "coaches.price.body":
    "You pay for the students you have enrolled, and you stop paying the month you turn a seat off. What you charge them is yours — we never bill your student. To subscribe you need at least one student enrolled: the seat is the thing you pay for.",
  // B31 — la meilleure ligne des trois pages actuelles. Conservée verbatim.
  "coaches.price.no_number":
    "What one student who stays instead of drifting is worth is your number, not ours. We have no retention figure to sell you, and we are not going to invent one.",
  "coaches.price.cta": "Start the 14-day trial",
  "coaches.price.trial_note": "14 days, up to 3 students, then it stops on its own.",

  //
  // ══════════════════════════════════════════════════════════════════════════
  // ⚠️ L'ACHETEUR A CHANGÉ. Ce namespace parlait à une salle QUI COACHE — « you
  // coach three hours a week », « it only works if the method is yours ». La
  // grille des douleurs a recadré le segment: une salle vend une salle, PAS une
  // méthode, et ses clients n'ont pour la plupart AUCUN coach. Le mécanisme
  // « accompagner un client de salle après ses trois heures » a été retiré du
  // plan pour cette raison exacte.
  //
  // D'où, dans ce pack: on dit des CLIENTS (« élèves » est le mot de `/coaches`
  // seulement), jamais « votre équipe » (une salle à trois coachs est UN compte,
  // B20), et la salle ne prête pas de méthode — elle DÉLÈGUE (`gyms.house.*`).
  //
  // ⛔ TROIS CLAIMS SONT RETIRÉS DE CE NAMESPACE. Ne pas les réécrire:
  //   · « 6 € quand votre membre a payé son année » — FAUX, l'intervalle annuel
  //     est celui du COACH (B2). La bonne phrase est `gyms.price.annual`.
  //   · « quelles convictions vos clients tiennent ou lâchent » — rien ne le
  //     calcule (B16).
  //   · « c'est votre nom sur les messages » — aucune personnalisation de marque
  //     n'existe (B18), et aucun white-label (B19).
  // ══════════════════════════════════════════════════════════════════════════
  "gyms.seo_title": "Sophia for gyms — the nutrition tier you don’t have to write",
  "gyms.seo_description":
    "Your clients train seriously and eat at random. Sophia is a nutrition tier above the membership: an agent answers every client you enrol, every day, and you write nothing — you delegate to Sophia’s method, and the agent signs Sophia’s name, never yours. €7 per enrolled client, per month.",

  // ══════════════════════════════════════════════════════════════════════
  // BANDE 1 · DOULEUR 01 — « mes clients s'entraînent sérieusement et
  // mangent au hasard ». Besoin: que la moitié qui décide du résultat soit
  // couverte, SANS embaucher un nutritionniste.
  //
  // Deux anciennes sections se replient ici, et pas en bandes à part:
  //   · `daily` — « il est réveillé à neuf heures un mardi soir » EST ce que
  //     « tenu chaque jour » veut dire, donc c'est une preuve de la réponse,
  //     pas un argument séparé.
  //   · `money` — le revenu n'est pas une douleur, c'est ce qui rend la
  //     réponse achetable. Le prix comme OFFRE vit en bande 4.
  //
  // « vingt et un repas » est de l'arithmétique du monde (3 × 7), pas une
  // mesure du dépôt. ⚠️ Le titre ne dit plus « VOUS coachez trois heures »:
  // la salle ne coache pas, le client s'entraîne.
  // ══════════════════════════════════════════════════════════════════════
  "gyms.hero.eyebrow": "For independent gyms — boxes, strength halls, hybrid studios",
  "gyms.hero.title": "They train seriously. They eat at random.",
  "gyms.hero.lede":
    "Three hours a week in your room, and twenty-one meals where nobody is asking. That half decides what the mirror shows — and a client who stops seeing their body change does not argue, they just stop coming. Sophia is a nutrition tier above your membership: an agent answers every client you enrol, every day. Nobody writes a menu, and nobody hires a nutritionist.",
  "gyms.hero.cta": "Start the 14-day trial",
  // fact: B5 — 14 jours, 3 sièges, puis ça s'arrête tout seul.
  "gyms.hero.trial_note": "14 days, up to 3 clients, then it stops on its own.",

  // Figure 1 — la semaine d'un CLIENT (et non plus « ce que la salle coache »).
  // Concept, 480×240. Les 21 repas sont la pièce chaude; COMPTABLES et non
  // proportionnels — aucune forme n'affirme une mesure que le produit ne
  // calcule pas.
  "gyms.fig.week_t": "One client’s week: three sessions in the room, twenty-one meals elsewhere",
  "gyms.fig.week_d":
    "A week drawn as marks. The top row is the three sessions in the gym. The bottom row is the twenty-one meals that happen where the gym is not.",
  "gyms.fig.week_label": "ONE CLIENT’S WEEK",
  "gyms.fig.week_row1": "THREE HOURS IN THE ROOM",
  "gyms.fig.week_row2": "TWENTY-ONE MEALS, EVERYWHERE ELSE",

  // « Tenu chaque jour », et ce que ça veut dire concrètement.
  // fact: B10 — la doctrine atteint QUATRE points d'injection; trois sont
  // nommés ici (chat, semaine, repas). Ne pas écrire « chaque message ».
  "gyms.day.title": "It is awake at nine on a Tuesday evening. You are at home.",
  "gyms.day.body":
    "A client asks their question when they have it, and the answer is built from the method behind their account — in the chat, and in every meal Sophia writes.",

  // L'arithmétique. B30: l'exemple est juste ET étiqueté « exemple ». Les deux
  // ensemble sont ce qui le rend crédible — retirer l'étiquette en ferait une
  // prévision.
  //   250 × 15 % = 37,5 puis 37 (ARRONDI VERS LE BAS: une personne n'est pas
  //   divisible, et arrondir vers le haut flatterait notre côté)
  //   37 × 25 € = 925 €  |  37 × 7 € = 259 €  |  925 − 259 = 666 €  |  ×12 ≈ 8 000 €
  // Si l'un de ces nombres bouge, les cinq autres bougent avec.
  "gyms.money.title": "You sell it. You set the price.",
  "gyms.money.body":
    "You pay €7 for each client you enrol, and you decide what the tier costs on your side of the counter. No platform fee, no setup, and you stop paying the month you turn a seat off.",
  "gyms.money.caption":
    "An example, and it says so: we do not know your take-up or the price you would set, and those are the two numbers that decide the total.",
  // fact: B31 — à conserver VERBATIM. Rien dans le dépôt ne mesure le churn
  // contre un témoin, et c'est ici qu'un chiffre de rétention inventé aurait le
  // plus de valeur commerciale.
  "gyms.money.close":
    "What you are buying is months of membership. What is one client who stays three months longer worth to you? That is the number to put against €7, and it is yours, not ours: we have no retention figure to sell you, and we are not going to invent one.",

  // Figure 2 — l'exemple chiffré. Document vu de face, 480×240. Ce n'est PAS
  // une maquette: aucun écran ne rend cette addition.
  "gyms.fig.money_t": "A worked example for a gym with 250 clients",
  "gyms.fig.money_d":
    "Four lines of arithmetic. Thirty-seven clients at €25 each is €925 in; seven euros each to Sophia is €259 out; €666 stays with the gym.",
  "gyms.fig.money_label": "AN EXAMPLE — A GYM WITH 250 CLIENTS",
  "gyms.fig.money_uptake_label": "On the nutrition tier",
  "gyms.fig.money_uptake_value": "37 clients",
  "gyms.fig.money_uptake_hint": "15% take it up, rounded down to whole people",
  "gyms.fig.money_in_label": "They pay you €25 each",
  "gyms.fig.money_in_value": "€925",
  "gyms.fig.money_out_label": "You pay Sophia €7 each",
  "gyms.fig.money_out_value": "− €259",
  "gyms.fig.money_keep_label": "You keep, every month",
  "gyms.fig.money_keep_value": "€666",
  "gyms.fig.money_keep_hint": "about €8,000 a year",

  // ══════════════════════════════════════════════════════════════════════
  // BANDE 2 · DOULEUR 02 — « je les perds sans les voir partir ». Besoin:
  // savoir qui décroche pendant qu'il est encore joignable.
  //
  // fact: B11 — cron '0 6 * * 1', `renderSynthesisText` est une fonction PURE:
  //   aucun modèle ne narre cette page.
  // fact: B14 — seuils 48 h / 120 h, mesurés sur le dernier ENTRANT.
  // fact: B17 — la cohorte est scopée par coach.
  // ⛔ S9/B15 — aucune bande de risque, aucune tuile « on track », aucun score
  //   d'adhérence. Le seul « chiffre » de la figure est son ABSENCE, citée mot
  //   pour mot (`coach.weekly.no_number`).
  // ⚠️ Rien ici ne PRÉTEND citer la synthèse. B13 est le défaut à ne pas
  //   refaire: paraphraser en annonçant du verbatim. Ce qui est cité l'est dans
  //   la figure, et seulement des libellés d'écran vérifiés.
  // ══════════════════════════════════════════════════════════════════════
  "gyms.monday.eyebrow": "Every Monday",
  "gyms.monday.title": "The names worth a message, while you can still reach them.",
  "gyms.monday.body":
    "One page, computed from what happened and rendered from a template. No model narrates it, which is why it cannot flatter you. A client who wrote in the last two days is in touch; past two days they are slipping; past five they are silent — counted from their last message in, not from ours out.",
  "gyms.monday.close":
    "Slipping is the useful state: they are still reachable, and a message from you still lands. Your access log will tell you the same thing in six weeks, and by then the word is former client.",
  "gyms.monday.scope": "You see the clients you enrolled, and nobody else’s.",
  "gyms.monday.fig_caption":
    "A schematic of that page. The names are invented; the heading, the reasons and the states are the product’s own words.",

  // Figure 3 — le lundi. MAQUETTE DE PRODUIT, 480×248, chaque chaîne citée mot
  // pour mot (S10). Ces clés NE SE TRADUISENT PAS: l'app authentifiée est en
  // anglais, et une capture traduite montrerait un écran qui n'existe pas.
  "gyms.fig.monday_t": "The Monday page: the clients worth a message",
  "gyms.fig.monday_d":
    "Three clients worth a message, each with the observed reason and their contact state — and, on the third, a plain statement that there is no number to show.",
  "gyms.fig.monday_app": "This week", // coach.weekly.title, CoachWeeklyPage.tsx:192
  "gyms.fig.monday_worth": "WORTH A MESSAGE", // coach.weekly.flagged_title, rendu en capitales par `SectionLabel`
  "gyms.fig.monday_n1": "Chen Wei",
  "gyms.fig.monday_r1": "Going quiet", // coach.flag.slipping_contact
  "gyms.fig.monday_s1": "Going quiet", // coach.weekly.contact.slipping — ⚠️ le JETON BRUT n'atteint jamais l'écran: `CoachWeeklyPage.tsx:92-95` rend `contactLabel(state)`
  "gyms.fig.monday_n2": "Amina Diop",
  "gyms.fig.monday_r2": "Has not written in days", // coach.flag.silent_5d
  "gyms.fig.monday_s2": "Silent", // coach.weekly.contact.silent — même raison
  "gyms.fig.monday_n3": "Luca Ferrari",
  "gyms.fig.monday_r3": "Barely logged anything", // coach.flag.coverage_below_gate
  "gyms.fig.monday_s3": "no number to show", // coach.weekly.no_number

  // ══════════════════════════════════════════════════════════════════════
  // BANDE 3 · DOULEUR 03 — « je n'ai pas de méthode à prêter, et pas la
  // légitimité d'en écrire une ». Besoin: que ça marche sans que je rédige
  // quoi que ce soit. C'EST LE SEUL ARGUMENT NEUF DE LA PAGE.
  //
  // ⚠️ C'est l'ancienne section `fit` RETOURNÉE. Elle disait « ça ne marche que
  // si la méthode est la vôtre » — vrai pour un coach, faux pour une salle, qui
  // n'a pas de méthode à prêter. Elle dit maintenant son contraire.
  //
  // fact: `coaches.doctrine_source = 'house'` — migration
  //   20260806230000_doctrine_delegation.sql · `_shared/keel/doctrine_delegation.ts`
  //   Bascule dans les DEUX sens (`coach-doctrine-v1`, action
  //   `set_doctrine_source`; écran `DoctrineStartDialog.tsx`).
  // fact: câblé aux DEUX endroits qui signent — `doctrine_loader.ts:362` (le
  //   bloc de prompt et la substitution du verrou) et
  //   `keel-coach-broadcast-v1:111` (le message de cohorte). Un seul des deux
  //   suffirait à donner DEUX identités au même client la même semaine.
  // fact: B20 — une salle à trois coachs est UN compte. ⛔ Jamais « votre équipe ».
  // ⏳ Le chemin existe; le CONTENU de cette doctrine est en cours
  //   d'établissement. `gyms.house.reserve` le dit, et il n'est pas négociable:
  //   une page qui promet une méthode maison déjà écrite ment aujourd'hui.
  // ══════════════════════════════════════════════════════════════════════
  "gyms.house.eyebrow": "Nothing to write",
  "gyms.house.title": "You don’t have a method to lend. You don’t need one.",
  "gyms.house.body":
    "A gym sells a gym, not a doctrine, and inventing standing you do not have is the worst thing you could do with an agent. So you delegate: your clients are followed by Sophia’s own method, and the agent says so — it signs “Sophia”, never your name.",
  "gyms.house.sign_title": "One name, everywhere a name appears.",
  "gyms.house.sign_body":
    "The conversation and the weekly note to your cohort read the same answer to “who signs this”. A client never meets two identities.",
  "gyms.house.one_title": "One account, one signature.",
  "gyms.house.one_body":
    "A gym with three coaches is one account. There is no gym entity above it and no roster inside it.",
  "gyms.house.reserve":
    "Two things before you switch it on. It reverses: turn delegation off and the agent signs your name again and serves whatever you have published — nothing you wrote is deleted meanwhile. And the house method is being written right now, so what you turn on today is the delegation, not a finished library.",

  // Figure 4 — la délégation et la signature. CONCEPT sur fond sombre, 480×220.
  // Une maquette de produit ne se pose JAMAIS sur du sombre (le produit est en
  // clair; un écran sombre montrerait un produit qui n'existe pas) — celle-ci
  // est un schéma, donc elle a le droit d'y être. `.on-dark` remonte la pièce
  // chaude de 2,4:1 à 8,06:1.
  "gyms.fig.house_t": "Delegation: the gym writes nothing, and one name signs both surfaces",
  "gyms.fig.house_d":
    "On the left, the gym’s own method: an empty card. Two branches lead from it to the two places a client meets a name, and both are signed Sophia.",
  "gyms.fig.house_label": "WHO SIGNS",
  "gyms.fig.house_gym": "YOUR GYM",
  "gyms.fig.house_gym_v": "nothing written",
  "gyms.fig.house_s1": "THE CONVERSATION",
  "gyms.fig.house_s2": "THE WEEKLY NOTE",
  "gyms.fig.house_sign": "— Sophia",

  // ══════════════════════════════════════════════════════════════════════
  // BANDE 4 · LE PRIX ET LA CLÔTURE, fusionnés. Un seul CTA, le même qu'en
  // haut, vers `/auth?role=coach`.
  //
  // fact: B1 — 7 €/client/mois, le siège est le seul poste, aucun forfait
  //   plateforme. Le montant vit dans `STRIPE_PRICE_ID_COACH_SEAT_MONTHLY`.
  // fact: B3 — « 6 € pour un SIÈGE payé à l'année ». ⛔ Jamais « quand votre
  //   membre a payé son année » (B2, FAUX: l'intervalle est celui du coach).
  // fact: B4 — `stripe-reconcile-seats` RECALCULE depuis le registre, il
  //   n'incrémente jamais: on arrête de payer le mois où on éteint un siège.
  // fact: B6 — un compte à ZÉRO client est refusé au checkout
  //   (`no_billable_seat`), d'où « le premier siège vient avant la facture ».
  // fact: S12 — aucun SKU client dans `stripe-create-checkout-session`: on ne
  //   facture jamais le client, et `billing_note` le dit à voix haute.
  // ══════════════════════════════════════════════════════════════════════
  "gyms.price.eyebrow": "Pricing",
  "gyms.price.title": "€7 a client. You set what they pay.",
  "gyms.price.seat_period": "per enrolled client, per month",
  "gyms.price.seat_label": "No platform fee. No setup. Nothing else.",
  "gyms.price.annual": "€6 for a seat paid a year up front.",
  "gyms.price.why":
    "You pay for the seats you have opened, and you stop paying the month you turn one off. Subscribing needs at least one enrolled client, so the first seat comes before the first invoice.",
  "gyms.price.billing_note":
    "You bill your clients yourself, on whatever you already use for the membership. Sophia never touches their payment.",
  "gyms.price.cta": "Start the 14-day trial",
  "gyms.price.trial_note": "14 days, up to 3 clients, then it stops on its own.",
  "gyms.close.line": "You run the training. This is the other twenty-one meals.",

  //
  // ── CE QUI A DISPARU DE CE NAMESPACE, ET POURQUOI ─────────────────────────
  // `communities.monday.*` + `communities.fig_monday.*` (24 clés): la page du
  // lundi appartient à `/gyms` (douleur 02) et au hall `/pro` (ligne 04), pas à
  // une page dont les trois douleurs sont le fil, la couche sociale et la voix.
  // `communities.fig_third_day.*` + `roles.figure_caption` (9): la relance à 72 h
  // est le même argument de rétention, donc la même ligne de grille.
  // `communities.fig_voice.*` (13): la maquette des champs de doctrine est
  // repliée dans la figure du verrou, qui montre ce que le MEMBRE reçoit.
  // `communities.tier.not*` (9): les quatre bornes tiennent en une phrase.
  // `communities.roles.*` devient `communities.layer.*`: « les rôles » nommait un
  // tableau à deux colonnes; la bande nomme désormais une STRUCTURE.
  "communities.seo_title": "Sophia for paid communities — the answer a thread can’t give",
  "communities.seo_description":
    "A community is a thread: you answer in public, and no member gets an answer of their own. Sophia is the layer underneath — each member on the coached tier gets their own space, their own week and their own answers, built from your method. €7 per member, per month.",

  // ── BANDE 1 · DOULEUR 01 — un fil n'a pas de destinataire ────────────────
  // Le titre nomme l'ARCHITECTURE, pas la fatigue. « Tu es débordé » est faux
  // et vaguement insultant pour quelqu'un qui tient 500 personnes ; « un fil ne
  // répond pas à une personne » est vrai, structurel, impossible à contester,
  // et c'est ce qu'il a déjà pensé sans l'avoir formulé.
  "communities.hero.kicker": "For owners of a paid community",
  "communities.hero.title": "A community is a thread. A thread can’t answer one person.",
  "communities.hero.lede":
    "No number of extra hours changes that: it is the shape of the thing you built. Sophia is the layer underneath — each member on the coached tier gets their own space, their own week and their own answers, out of your method.",
  "communities.hero.cta": "Start the 14-day trial",
  // Les trois faits qu'il vérifie en premier, dans l'ordre où ils le rassurent :
  // la porte est petite, l'entrée est simple, et rien ne lui retombe dessus.
  "communities.hero.note":
    "14 days, up to 3 members, then it stops on its own. Members come in by email invitation from your workspace, and nothing comes back to you as an inbox.",
  "communities.hero.signin_prompt": "Already using Sophia?",
  "communities.hero.signin_link": "Sign in",

  "communities.fig_lane.label": "ONE QUESTION, TWO DESTINATIONS",
  "communities.fig_lane.alt_title": "One answer for everybody, or an answer each",
  "communities.fig_lane.alt_desc":
    "The same four members, drawn twice. On the left one rule opens all four at once: a public answer, written to fit everyone. On the right, a rule each.",
  "communities.fig_lane.thread_label": "IN THE THREAD",
  "communities.fig_lane.tier_label": "ON THE COACHED TIER",
  "communities.fig_lane.thread_caption": "one answer, for everybody",
  "communities.fig_lane.tier_caption": "an answer of their own",

  // Le palier est la FORME COMMERCIALE de la même douleur, pas une seconde :
  // quelqu'un qui a 500 membres payants n'achète pas une migration, il achète
  // une ligne de plus sur sa page de vente, vendue à une base déjà payée.
  "communities.tier.title": "One tier above what you already sell. Nothing underneath moves.",
  "communities.tier.body":
    "Same platform, same entry price, same posts, same people. Above them you open one more option: everything they already have, plus a lane of their own in your method. The members who want it upgrade; the others never notice it exists.",
  // L'arithmétique, à revérifier si l'un de ces nombres bouge :
  //   500 membres × 30 % = 150   |   écart 41 − 29 = 12 €
  //   150 × 12 € = 1 800 €   |   150 × 7 € = 1 050 €   |   1 800 − 1 050 = 750 €
  // L'écart est de 12 € et pas de 30 : on ne demande pas à un membre de doubler
  // sa dépense pour ajouter une couche, et un écart qu'il ne croit pas
  // discrédite le reste de la page — y compris ce qui est vrai.
  "communities.tier.example":
    "A worked example. Five hundred members, three in ten take the tier: 150 × €12, minus 150 seats at €7. About €750 a month, on people whose acquisition you have already paid for.",
  "communities.tier.example_caption":
    "Your price and your take-up decide that total, and both are yours. The €7 is not an estimate, and it only ever applies to the members who upgrade.",
  // Les quatre bornes de l'ancienne page, en une phrase. Un « non » découvert
  // après le chiffre annule le chiffre, donc elles restent AVANT le prix.
  // ⚠️ On ne compte pas les gardes à voix haute : le brief en annonce quatre,
  // l'audit cinq selon ce qu'on garde, et un chiffre sans source unique n'entre
  // pas sur une page.
  "communities.tier.reserve":
    "No Skool, Circle, Discord or Kajabi integration — none, and you would rather know it here than on day one. You keep charging your members where you already do: there is no member checkout in the product. And energy numbers are off by default on a member’s account.",

  "communities.fig_tier.label": "THE SAME OFFER, PLUS ONE BAND",
  "communities.fig_tier.alt_title": "The tier sits on top; the offer underneath does not move",
  "communities.fig_tier.alt_desc":
    "The same offer drawn twice, from a single element used twice over. The upper one carries one extra band: a lane of their own. Nothing else changes.",
  "communities.fig_tier.band": "a lane of their own, every day",
  "communities.fig_tier.tier_label": "THE COACHED TIER",
  "communities.fig_tier.tier_value": "€41",
  "communities.fig_tier.base_label": "YOUR COMMUNITY",
  "communities.fig_tier.base_value": "€29",
  "communities.fig_tier.cost_label": "YOUR COST",
  "communities.fig_tier.cost_value": "€7",

  // ── BANDE 2 · DOULEUR 02 — si un agent répond, plus personne ne se répond ─
  // Son objection n°1, rarement dite frontalement : l'IA menace précisément le
  // mécanisme qu'il facture. La réponse n'est pas une promesse, c'est une
  // ABSENCE DE SURFACE. ⚠️ Jamais élargie en « personne ne partage jamais
  // d'espace » : le foyer en est un.
  "communities.layer.kicker": "What it does not touch",
  "communities.layer.title": "Keep the peers. Add the one thing a group was never going to do.",
  "communities.layer.body":
    "Your members never see each other in Sophia: no feed, no rooms, no comments. It cannot become the place your people gather, because there is no such place in it. What a group cannot do is answer one person, at 9pm, about the dinner in front of them.",
  "communities.layer.figure_caption":
    "The absence is the guarantee: there is nowhere in Sophia for your community to move to.",

  "communities.fig_layer.label": "WHERE THEY MEET, AND WHERE THEY DON’T",
  "communities.fig_layer.alt_title": "The community above, one lane each below",
  "communities.fig_layer.alt_desc":
    "Four members. Above the line each is linked to every other: that is your community, and Sophia does not touch it. Below it, each runs in a lane of their own, and nothing joins one lane to another.",
  "communities.fig_layer.community_label": "YOUR COMMUNITY",
  "communities.fig_layer.sophia_label": "IN SOPHIA",
  "communities.fig_layer.absence": "no feed, no rooms, no comments",

  // ── BANDE 3 · DOULEUR 03 — un modèle lisse ma voix ───────────────────────
  // Un propriétaire de communauté a un ton, des formules que ses membres
  // reconnaissent au premier paragraphe. Sa peur a un nom dans son milieu : le
  // « tone flattening ». Il ne loue pas un modèle, il prête sa voix.
  //
  // ⚠️ NI « votre marque » NI « votre nom sur les messages » (B18) : zéro
  // personnalisation de marque existe, l'agent s'appelle Sophia partout. Ce qui
  // est vrai et suffit : ce sont SES MOTS qui sortent, signés de son nom.
  "communities.voice.kicker": "Your voice is the asset",
  "communities.voice.title": "It answers in your words. Not in ours, and not in a house style.",
  "communities.voice.body":
    "Your members can tell your writing from a generic health post at a glance, and that recognition is most of what they pay for. So Sophia gets no personality of its own: it gets your method — your words, your positions, and what you say instead of what you don’t recommend.",
  // ⚠️ FORMULATION B8b, MOT POUR MOT. « La doctrine entre à chaque message » est
  // faux (B7 : un seul appelant) et « chaque message sortant est vérifié » est
  // faux pour « chaque » (B8 : quatre surfaces scannées, quatre non). Ce qui
  // reste est déjà l'argument le plus fort du produit.
  "communities.voice.lock":
    "Your method goes into the chat, into every week and into every meal Sophia writes; and what it writes in the chat is read back against your red lines before it is sent — with no model in that loop.",
  "communities.voice.close":
    "Your member never gets a refusal, and never gets “ask in the group”.",

  "communities.fig_lock.label": "ONE MESSAGE, READ BACK",
  "communities.fig_lock.alt_title": "What was held, and what went out",
  "communities.fig_lock.alt_desc":
    "Three moments, top to bottom: a member’s question, the draft held because it contradicts a red line, and the message actually sent — the sentence you wrote instead. Only the third is received.",
  "communities.fig_lock.ask_label": "A MEMBER ASKS",
  "communities.fig_lock.ask_value": "Should I add a snack between lunch and dinner?",
  "communities.fig_lock.draft_label": "THE DRAFT SAID",
  "communities.fig_lock.draft_value": "A small snack mid-afternoon can help.",
  "communities.fig_lock.held": "held",
  "communities.fig_lock.sent_label": "WHAT WENT OUT",
  "communities.fig_lock.sent_value1": "Three real meals. If you are hungry between them,",
  "communities.fig_lock.sent_value2": "the meal before was too small.",
  "communities.voice.figure_caption":
    "That replacement is not ours. Each red line carries what you say instead, in your own words, and it goes out signed with your name.",

  // ── BANDE 4 · LE PRIX ET LA CLÔTURE ──────────────────────────────────────
  // Une seule carte : deux cartes obligent à faire une addition, et une
  // addition sur une page de vente est un endroit où se tromper. Le tarif
  // annuel est une LIGNE sous la carte — une modalité de paiement, pas une
  // seconde offre. ⚠️ Et il porte sur un SIÈGE payé à l'année, jamais sur
  // l'année d'un membre (B2/B3) : c'est l'intervalle du coach.
  "communities.pricing.kicker": "Pricing",
  "communities.pricing.title": "One line, and only for the members who upgrade.",
  "communities.pricing.seat_period": "per member, per month",
  "communities.pricing.seat_label": "No platform fee. No setup. Nothing else.",
  "communities.pricing.annual": "€6 for a seat paid a year up front.",
  "communities.pricing.why":
    "You pay for the members you put on the coached tier, and you stop paying the month you turn a seat off. The rest of your community costs you nothing, because they are not here.",
  // La meilleure ligne des trois pages de vente, et elle vaut double sur ce
  // marché : les taux de rétention qui circulent dans son écosystème sont des
  // chiffres de blogs d'éditeurs, sans échantillon ni méthode. Rien dans ce
  // dépôt ne mesure le churn contre un témoin. À CONSERVER VERBATIM (B31).
  "communities.pricing.no_number":
    "We don’t have a retention number to sell you, and we are not going to invent one. The number that decides this is yours: what one member who stays three months longer is worth, at your own price.",
  "communities.pricing.trial_note": "14 days, up to 3 members, then it stops on its own.",

  // Elle referme sur le titre du hero et sur la formule que la page a employée
  // deux fois, « an answer of their own ». ⚠️ Pas de métaphore ici : une clôture
  // est la dernière phrase qu'on lit avant de cliquer, c'est le pire endroit du
  // site pour faire travailler le lecteur.
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
  // D5 (2026-08-18) — LA FICHE DU MAÎTRE EST UNE FENÊTRE, comme celle de tout
  // le monde: « sans quoi celui qui tient la maison serait le seul dont on ne
  // sait rien » (conception §1).
  "household.me.sheet":
    "The same six questions everyone else gets — your body and what you already eat are what sizes your share.",
  "household.me.open": "Fill in my details",
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
  // ── CE QUE CETTE BOUCHE MANGE D'HABITUDE (2026-08-14) ────────────────────
  // Ouvert après un plan réel qui a servi des œufs brouillés sept matins
  // d'affilée à une femme qui mange une pomme. Personne ne le lui avait
  // demandé: il n'existait aucun champ pour le ranger.
  //
  // ⚠️ AUCUNE DE CES PHRASES NE COMPTE, NE RELANCE, NI NE RÉCLAME. « Il en
  // reste 2 à remplir » est la faute qui a fait supprimer le conseil de
  // famille: on recréerait la corvée que le produit promet de supprimer. Il
  // n'y a donc pas de clé « manquant » ici, et il ne doit pas y en avoir.
  "household.habits.title": "What they usually eat",
  "household.habits.hint":
    "Some people always have the same thing at a given moment, whatever the house is cooking. Telling us keeps that dish off their plate — and keeps their thing on the shopping list.",
  "household.habits.open": "Set their habits",
  "household.habits.close": "Close",
  "household.habits.loading": "Reading what they usually eat…",
  "household.habits.choice_household_dish": "They eat what the house cooks",
  "household.habits.choice_own_usual": "They have their own thing",
  "household.habits.usual_label": "What they have",
  "household.habits.usual_placeholder": "an apple",
  "household.habits.usual_missing": "Say what it is, in a few words.",
  "household.habits.note_label": "Anything else worth knowing",
  "household.habits.note_hint":
    "One line, kept for good, read every time we cook. Tastes, textures, what they never touch.",
  "household.habits.note_placeholder": "Does not eat anything reheated.",
  "household.habits.no_slots": "No eating moments are set for this person yet.",
  "household.habits.save": "Save",
  "household.habits.saved": "Saved.",
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
  // L5-B (2026-08-18). `keel_household_set_member_body` rend ce jeton depuis le
  // lot L0, et aucune phrase ne l'attendait — le pop-up « une bouche » l'aurait
  // rendu tel quel, en anglais brut, à côté du champ.
  "household.error.bad_day_activity":
    "That day-to-day answer is not one we know. Pick one of the three.",
  "household.error.bad_sport_frequency":
    "That sport answer is not one we know. Pick one of the four.",
  "household.error.bad_appetite":
    "That appetite answer is not one we know. Pick one of the three.",
  "household.error.bad_weekday": "That is not a day of the week.",
  "household.error.bad_slot": "That is not a meal we can hold a habit on.",
  "household.error.empty_label":
    "Tell us what that meal is, in your own words -- a blank would match any dish.",
  "household.error.label_too_long": "Sixty characters at most.",
  "household.error.too_many_traditions":
    "Three standing days is the most we take. Remove one to add another.",
  "household.error.bad_activity_level":
    "That is not one of the four activity answers.",
  // ── LE MEMBRE DE RÉFÉRENCE (FF-043) — EN COURS DE DÉMÉNAGEMENT ──────────
  // ⚠️ CES QUATRE CLÉS SONT REMPLACÉES PAR `plan.reference.*`, ET ELLES SONT
  // ENCORE LÀ EXPRÈS: leur lecteur (`HouseholdPage.tsx`) n'a pas encore bougé,
  // et retirer une clé avant son lecteur ne compile pas. Elles partent dans le
  // commit qui déplace la carte. N'écris aucun lecteur NEUF dessus.
  //
  // ⚠️ LE LIBELLÉ DIT QUI, JAMAIS POURQUOI, et il ne nomme AUCUN objectif.
  // « Whose way of eating the shared dish follows » est une phrase de méthode;
  // « qui est au régime » serait un verdict lu par toute la table.
  //
  // ⚠️ ET IL NE PROMET PAS DE PORTION. Le référent ne change pas la taille de
  // la casserole — elle se dimensionne sur le plus petit besoin de la table.
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
  // ── LES TROIS REFUS DE LA RÉPONSE HEBDOMADAIRE (L6, RPC de L3) ───────────
  // `not_adult` COUVRE AUSSI L'ÂGE INCONNU, et la phrase doit le dire: renvoyer
  // « they are not an adult » à propos de quelqu'un dont on ignore la date
  // affirmerait un fait que personne n'a énoncé. Ce refus est atteignable
  // MALGRÉ le filtre de l'écran: une date de naissance peut changer dans un
  // second onglet entre le rendu et le clic.
  "household.error.bad_work_lunch": "We could not read that answer.",
  "household.error.not_adult":
    "This question is only asked about adults, and their date of birth is what " +
    "decides. Add it above, and it can be answered.",
  // Le plafond de 42 entrées d'absence par bouche, en base. Personne ne peut
  // l'atteindre par cet écran; il dit qu'une ligne est déjà pleine.
  "household.error.too_many_away":
    "There are already too many days marked for them. Clear a few in the grid " +
    "first.",
  // LES HABITUDES D'UNE BOUCHE (2026-08-14). `bad_slots` dit que la forme n'est
  // pas lisible OU qu'un « something of their own » est resté sans mots; le
  // formulaire l'empêche déjà, donc ce motif dit surtout qu'un client a envoyé
  // autre chose. `bad_note` porte le plafond partagé de `plan_draft_note.ts`.
  "household.error.bad_slots":
    "We could not read those habits. Every moment marked as their own needs a few words.",
  "household.error.bad_note": "That note is either empty or too long (280 characters).",
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
  // ── LES ENVIES ET « À TABLE » — PARTIES SOUS `plan.envy.*` / `plan.table.*` ──
  // CINQ CLÉS ÉTAIENT DÉJÀ PARTIES AVEC LE CONSEIL DE FAMILLE: `envy.saved`
  // (déjà orpheline), `envy.spoken`, `envy.silent` et `compose.silent_note` —
  // les trois dernières rendaient un décompte de silencieux, qui se lit « il en
  // reste 3 à relancer » quoi qu'on écrive à côté.
  //
  // ⚠️ NE PAS LES REMETTRE SOUS UNE AUTRE FORME. « 2/5 ont répondu », une
  // pastille, un bouton « relancer »: tous recréent la charge mentale que le
  // produit promet de supprimer.
  //
  // ── ET MAINTENANT L'ENVIE ELLE-MÊME A CHANGÉ D'ÉCRAN ────────────────────
  // Elle était posée sur la page du foyer, loin du geste qu'elle sert. Elle est
  // désormais UN CHAMP DE LA DEMANDE DE PLAN (`plan.envy.*`), donc elle part
  // avec le formulaire et n'a plus de bouton propre — d'où `envy.save`
  // SUPPRIMÉE, pas déménagée.
  //
  // `household.compose.*` (quatre clés) est SUPPRIMÉE et ne revient pas: la
  // carte qui les rendait demandait le BUDGET SEUL et codait la fenêtre en dur
  // (« d'ici dimanche »). La demande complète est sur `/app/plan`, pour tout le
  // monde, maître compris.
  //
  // `household.portions.*` part sous `plan.table.*`: « À table » dit comment on
  // SERT ce que le plan dit qu'on cuisine, et se lisait sur un écran qui ne
  // montrait pas le plan.
  //
  // ⚠️ LES DIX CLÉS CI-DESSOUS SONT ENCORE LÀ EXPRÈS: leurs lecteurs
  // (`HouseholdPage.tsx`) n'ont pas encore bougé, et retirer une clé avant son
  // lecteur ne compile pas. Elles partent dans le commit qui déplace les
  // cartes. N'écris aucun lecteur NEUF dessus.
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
  // (11,99 € le foyer, +2 € par profil réclamé). Lui montrer un bouton refusé
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
  "household_claim.signup.language_label":
    "The language you want to be spoken to in",
  "household_claim.signup.language_hint":
    "Your coach answers in this language, and writes your plan in it. You can change it later.",
  "household_claim.signup.name_hint":
    "On your account. The first name on the household line stays as it was set up.",
  "household_claim.signup.password_label": "Password",
  "household_claim.signup.password_hint": "At least 8 characters.",
  "household_claim.signup.legal_prefix": "I accept the",
  "household_claim.signup.legal_terms": "Terms",
  "household_claim.signup.legal_and": "and the",
  "household_claim.signup.legal_privacy": "Privacy Policy",
  "household_claim.signup.submit": "Create my account and claim",
  "household_claim.signup.submitting": "Creating your account...",
  "household_claim.signup.error.legal":
    "Please accept the Terms and the Privacy Policy to continue.",
  "household_claim.signup.error.existing":
    "There is already an account on this address. Sign in instead — your place is waiting.",
  "household_claim.signup.closed":
    "Creating an account is closed right now (pre-launch). If you already have one, sign in above.",
  "household_claim.signup.check_email.title": "Confirm your email address",
  "household_claim.signup.check_email.body":
    "Your account is created. Click the link we just sent to {email}, then open your invitation link again — claiming your place needs a confirmed address.",
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
  "coach.practices.reach_label": "Goes to:",
  // Le verdict de la classification est MONTRÉ et CORRIGEABLE: c'est la moitié
  // de la valeur du stockage (même patron que `coach_food_proposals`).
  //
  // ⚠️ ET IL NE L'EST PAS. Mesuré au lot 5: cette clé n'a AUCUN appelant —
  // `CoachDoctrinePage` ne rend que `brief_label` (« ce qui est transmis »),
  // jamais le verdict lui-même. La phrase ci-dessus décrit donc une moitié de
  // fonctionnalité qui n'a pas été livrée. La clé est GARDÉE exprès, avec cette
  // note: la supprimer effacerait la trace de ce qui manque, et la surface qui
  // l'affichera est écrite juste au-dessus (les quatre corrections du
  // classifieur sont déjà là).
  "coach.practices.verdict_label": "What I understood",
  "coach.practices.brief_label": "What gets conveyed:",
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
  // `coach.practices.scope_everyone` A DISPARU AU LOT 5, avec son doublon.
  // Elle valait « Everyone » à côté de `coach.goal.everyone`, qui vaut le même
  // mot: la portée d'une pratique et la portée d'une entrée de doctrine sont
  // le MÊME vocabulaire, et `scopeSentence` est maintenant leur unique
  // rédacteur. Deux clés pour un mot, ce sont deux mots un jour.
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
  // ⚠️ `plan.hand.owner_note` PART AVEC LA BRANCHE MAÎTRE DE `TakeTheHandCard`.
  // Elle dit « compose-le depuis la page du foyer ». Dès que le maître compose
  // depuis CET écran-ci, la phrase envoie vers un écran qui ne compose plus.
  // Elle est encore là parce que son lecteur l'est: elles partent ensemble.
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
  "plan.refusal.bad_window":
    "Those dates cannot make a plan. A plan starts today or later, and fits in "
    + "seven days at most.",
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
  "plan.refusal.plan_adoption_timed_out":
    "Saving took too long and was stopped. No incomplete plan was saved — try again.",
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

  // ── LES DEUX REFUS DU BROUILLON ─────────────────────────────────────────
  // Le chemin `draft` ne fait qu'UN saut par rapport à une composition: il
  // n'écrit pas. Ses deux refus disent donc d'abord ce qui n'a PAS bougé —
  // c'est la première peur de quelqu'un qui vient de cliquer sur un aperçu.
  "plan.refusal.draft_not_composed":
    "The preview didn't come through. Nothing was saved and your plan is untouched.",
  "plan.refusal.note_unusable":
    "I can't work from that sentence. Say again what you want changed in the plan.",

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
  // ── LE RETOUR AU SOLO, ET POURQUOI IL A SES SIX PHRASES ─────────────────
  // « Juste moi » était grisé dès qu'un foyer existait, SANS UN MOT: répondre
  // « on est deux » était sans retour dans tout le produit, et l'étape 2
  // retenait ensuite sur `missing_mouths`. Le verrou garde sa raison — on
  // n'efface pas des bouches sur un clic d'entonnoir — et il la DIT; quand il
  // n'y a plus personne à effacer, il s'ouvre derrière une confirmation qui
  // nomme ce qui part et ce qui reste.
  "setup.situate.solo_locked":
    "“Just me” is off while other people are still at this table. Remove them below, one at a time, and it comes back.",
  "setup.situate.dissolve_confirm":
    "This undoes the household. Your own place at the table goes with it: your household servings, your kitchen habits, the foods you keep off the table and the allergies recorded here. Your profile, your direction and your target stay exactly as they are — you carry on alone.",
  "setup.situate.dissolve_do": "Undo the household",
  "setup.situate.dissolve_cancel": "Keep it",
  "setup.situate.dissolve_not_alone":
    "Someone else is still at this table. Remove them first — nothing is undone here while a place is taken.",
  "setup.situate.dissolve_has_plans":
    "This household has already cooked. Its plans stay, so it cannot be undone from here.",

  // ── ÉTAPE 2 — LES GENS ──────────────────────────────────────────────────
  "setup.people.title": "You",
  "setup.people.intro":
    "You eat here too. You are the first place at the table, not the person who runs it.",
  "setup.people.first_name": "First name",
  "setup.people.birth_date": "Date of birth",
  // L'ÂGE EST GOUVERNANT, ET LA PHRASE LE DIT. Un champ dont l'absence change
  // le repas sans le dire est un piège — c'est le défaut D1 de ce chantier.
  "setup.people.birth_date_hint":
    "A direction only applies at a known age. Without it you get a standard serving, and nothing says so.",
  "setup.people.birth_date_error": "That date is in the future, or we cannot read it.",
  "setup.people.height": "Height (cm)",
  "setup.people.gender": "Sex",
  "setup.people.weight": "Weight (kg)",
  // POURQUOI ON LE DEMANDE MAINTENANT, ET PAS « PLUS TARD ». Deux raisons, et
  // la seconde est de la sécurité: sans un premier point, rien ne peut dire
  // plus tard si la perte va trop vite (`restriction_guard`).
  // ── L'ACTIVITÉ — QUATRE CRANS, ET JAMAIS UN NOMBRE (L0, 2026-08-18) ─────
  // ⚠️ AUCUNE DE CES PHRASES NE DEMANDE UN CHIFFRE, et c'est structurel, pas
  // une question de ton: `tokens.ts` refuse le PAL et les heures de sport par
  // semaine parce qu'« un nombre demandé à l'utilisateur est un nombre qu'il
  // invente, et l'inventé entre ensuite dans un calcul avec l'autorité d'une
  // mesure ». Un cran se RECONNAÎT — on sait si on est assis toute la journée —
  // et il porte sa propre imprécision.
  //
  // ⚠️ IL N'Y A PAS DE CINQUIÈME TUILE « JE NE SAIS PAS », et il ne faut pas en
  // ajouter une: ne rien cocher EST la non-réponse, et elle rend exactement le
  // comportement d'avant ce lot. Un jeton d'ignorance ferait de l'ignorance une
  // réponse, et une réponse se met à peser dans un calcul d'énergie.
  //
  // Les quatre libellés courts sont NEUTRES EN PERSONNE, exprès: les mêmes
  // servent à ma fiche et à celle d'une autre bouche. Seuls la question et son
  // aide changent de personne — c'est le défaut mesuré le 2026-08-12 sur
  // `setup.mouths.first_name_hint`, où le formulaire d'une AUTRE bouche
  // promettait de nommer la portion de qui remplit le champ.
  // ── ② LES DEUX AXES REMPLACENT LES QUATRE CRANS DANS L'ENTONNOIR ──────
  // Les quatre crans mélangeaient une JOURNÉE et un SPORT: quelqu'un d'assis
  // qui court deux fois par semaine ne pouvait dire que l'un des deux, et
  // héritait de PAL 1,80 au lieu de ~1,60 — 239 kcal/jour fabriqués par la
  // forme de la question. Les clés `setup.activity.*` restent en dessous: la
  // colonne d'avant reste le repli nommé de qui a déjà répondu.
  // ── ③ LES JOURS QUE LE FOYER NE DÉPLACE PAS (2026-08-20) ──────────────
  // ⚠️ LES MOTS DISENT « CE QU'ON FAIT », PAS « CE QU'ON AIME ». Les gens
  // répondent à « qu'est-ce que tu aimes » en idéal (« j'aime le poisson »),
  // pas en réalité (une fois par mois). La question porte donc sur l'habitude
  // installée, et le libellé d'exemple est un plat, jamais un goût.
  "setup.traditions.title": "The days you never move",
  "setup.traditions.hint":
    "Sunday roast, fish on Friday. Tell us and the plan builds around it instead of over it. Two or three is plenty -- three at most.",
  "setup.traditions.weekday": "Day",
  "setup.traditions.slot": "Meal",
  "setup.traditions.slot_breakfast": "Breakfast",
  "setup.traditions.slot_lunch": "Lunch",
  "setup.traditions.slot_dinner": "Dinner",
  "setup.traditions.label": "What is it, in your words",
  "setup.traditions.label_placeholder": "roast, fish, pizza...",
  "setup.traditions.add": "Add",
  "setup.traditions.remove": "Remove",
  "setup.traditions.empty": "Nothing set -- the plan composes every meal.",
  "setup.traditions.full":
    "Three is the most we take. Remove one to add another.",
  "setup.traditions.day_mon": "Monday",
  "setup.traditions.day_tue": "Tuesday",
  "setup.traditions.day_wed": "Wednesday",
  "setup.traditions.day_thu": "Thursday",
  "setup.traditions.day_fri": "Friday",
  "setup.traditions.day_sat": "Saturday",
  "setup.traditions.day_sun": "Sunday",
  "setup.day_activity.label": "What do your days look like?",
  "setup.day_activity.member_label": "What do their days look like?",
  "setup.day_activity.seated": "Mostly sitting",
  "setup.day_activity.seated_hint": "Sitting all day, not much walking.",
  "setup.day_activity.on_feet": "Up and about",
  "setup.day_activity.on_feet_hint":
    "Standing or moving for a good part of the day.",
  "setup.day_activity.physical_job": "Physical job",
  "setup.day_activity.physical_job_hint":
    "Carrying, walking, climbing -- all day.",
  "setup.sport.label": "And sport?",
  "setup.sport.member_label": "And sport, for them?",
  "setup.sport.none": "No sport",
  "setup.sport.none_hint": "None at the moment.",
  "setup.sport.1_2": "1 to 2 a week",
  "setup.sport.1_2_hint": "One or two sessions in a usual week.",
  "setup.sport.3_4": "3 to 4 a week",
  "setup.sport.3_4_hint": "Three or four sessions in a usual week.",
  "setup.sport.5_plus": "5 or more a week",
  "setup.sport.5_plus_hint": "Five sessions a week or more.",
  "setup.activity.label": "How active are your days?",
  "setup.activity.hint":
    "It sizes every serving you get. Sitting eight hours and training four " +
    "times a week are about forty per cent apart — leave it blank and we " +
    "assume something in the middle, which is what we did until now.",
  "setup.activity.member_label": "How active are their days?",
  "setup.activity.member_hint":
    "Same for their share. Leave it empty if you are not sure — we assume the " +
    "middle rather than guessing for them.",
  "setup.activity.sedentary": "Mostly sitting",
  "setup.activity.sedentary_hint": "Sitting all day, not much walking.",
  "setup.activity.on_feet": "Up and about",
  "setup.activity.on_feet_hint": "Standing or moving for a good part of the day.",
  "setup.activity.trains_some": "Training some",
  "setup.activity.trains_some_hint": "Sport two or three times a week.",
  "setup.activity.trains_hard": "Training hard",
  "setup.activity.trains_hard_hint":
    "Sport four times a week or more, or a physical job.",
  // ⚠️ CES DEUX PHRASES NE S'AFFICHENT JAMAIS AUJOURD'HUI, ET C'EST ÉCRIT DES
  // DEUX CÔTÉS. `canGenerateMisses` n'émet pas ces motifs: `null` est une
  // réponse légitime, donc l'activité ne refuse aucune composition. Le
  // `Record` complet de `copy/setupMisses.ts` les réclame quand même — c'est
  // lui qui garantit qu'aucune question n'entre au catalogue sans ses mots.
  "setup.activity.missing_own":
    "Tell us how active your days are, so your servings are sized on you and " +
    "not on an average.",
  "setup.activity.missing_member":
    "Tell us how active their days are, so their share is sized on them and " +
    "not on an average.",

  "setup.people.goal": "What you are after",
  // ── LE RÉGIME ────────────────────────────────────────────────────────
  // Le moteur sait l'appliquer depuis FF-042 et rien ne permettait de le
  // dire. La question est posée AVANT les allergies: c'est celle qui écarte
  // le plus de choses, et l'ordre évite de cocher « poisson » sous allergie
  // quand la vraie réponse est « je suis végétarien ».
  "setup.people.diet": "How you eat",
  "setup.people.diet_hint":
    "It rules every dish we compose. You can say it once here — it is not a preference we weigh, it is a line we do not cross.",
  "setup.people.diet_omnivore": "I eat everything",
  "setup.people.diet_vegetarian": "Vegetarian",
  "setup.people.diet_vegan": "Vegan",
  "setup.people.diet_pescatarian": "Pescatarian",
  "setup.people.allergies": "Anything you are allergic to?",
  // TROIS NATURES DISTINCTES, ET L'ENTONNOIR NE COLLECTE QUE LA PREMIÈRE
  // (FF-046): une ALLERGIE est médicale et rejoint l'union de sécurité,
  // fail-closed; une RÈGLE DE MAISON est un pouvoir domestique; une AVERSION
  // est un goût. Les confondre à la saisie, c'est promettre une garde de
  // sécurité sur une préférence.
  "setup.people.allergies_hint":
    "Medical only. It comes out of the whole pot. Dislikes come later.",
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
  // ── « Clear this form » EST PARTI LE 2026-08-19, ET SON BOUTON AUSSI ────
  // La fiche d'ajout se REPLIE désormais: elle n'existe que si on l'a ouverte,
  // et le geste qui la referme porte le mot que l'utilisateur a demandé —
  // « Remove », le même que sur la carte d'une personne inscrite. Deux
  // conséquences différentes, une seule intention à nommer: « que ce bloc ne
  // soit plus là ».
  "setup.mouths.add": "Add someone who eats here",
  "setup.mouths.add_confirm": "Add to the table",
  // ⚠️ PAS `setup.people.first_name_hint`. Celui-là dit « ta » portion, et il
  // était réutilisé ici: le formulaire d'une AUTRE bouche promettait de nommer
  // la portion de qui remplit le champ. Vu à l'écran le 2026-08-12.
  "setup.mouths.first_name_hint":
    "How the plan names their serving.",
  "setup.mouths.first_name_hint_you":
    "How the plan names your serving.",
  "setup.mouths.kind": "Are they an adult or a child?",
  "setup.mouths.kind_adult": "An adult",
  "setup.mouths.kind_child": "A child",
  // LA CEINTURE D'ÂGE EST STRUCTURELLE (`goalApplies`, `weekPlanAgeGate`), pas
  // un réglage. Le dire évite qu'on cherche un champ qui n'existera jamais.
  // ⚠️ CETTE PHRASE A ÉTÉ RETOURNÉE LE 2026-08-13, et ce n'est pas un
  // ajustement de ton: elle disait « a child never gets a nutrition direction
  // of their own », ce que le produit ne fait plus. Une phrase d'écran qui
  // survit à la règle qu'elle décrit est un mensonge que personne ne relit.
  // Ce qui reste vrai — et ce que la base rend inconstructible — est l'autre
  // moitié: pas de perte de poids, pas de silhouette, pour un enfant.
  "setup.mouths.kind_hint":
    "A child can have a direction too — eating better, training better. What " +
    "we never do for a child is weight loss or body reshaping: that is built " +
    "in, not a setting.",
  "setup.mouths.body": "Height, weight and sex",
  // ⚠️ LES TROIS OU AUCUN, et la phrase le dit parce que la base le fait: la
  // RPC refuse un corps partiel, et le moteur SAUTE une bouche sans corps —
  // elle reçoit alors la part de tout le monde, en silence.
  "setup.mouths.body_hint": "All three together, or none of them.",
  // Voir la note de `fr.ts`: la fiche d'ajout a éclaté le triplet en deux
  // paires étiquetées, donc « all three » n'y désigne plus de groupe.
  "setup.mouths.body_together": "Height, weight and sex go together: all three, or none.",
  "setup.mouths.goal": "What they are after",
  "setup.mouths.goal_from_profile":
    "Set in their own profile — it follows them everywhere, not just at this table.",
  "setup.mouths.allergies":
    "Is {who} allergic to anything?",
  "setup.mouths.allergies_you":
    "Are you allergic to anything?",
  // ⚠️ CETTE CLÉ A ÉTÉ ÉCRITE AVANT SON BOUTON, et le bouton n'est arrivé que
  // le 2026-08-13 — après qu'un compte réel s'est retrouvé avec la même
  // personne saisie TROIS FOIS et aucun moyen d'en retirer deux. Une phrase
  // sans contrôle est une fonctionnalité qu'on croit livrée.
  // ── LE MODE ÉDITION D'UNE CARTE (2026-08-19) ────────────────────────────
  // La carte d'une personne inscrite était un formulaire ouvert en permanence:
  // dix contrôles qui écrivent en base au moindre clic, sous chaque prénom.
  // Demandé: « si on clique pas sur modifier on peut rien modifier ».
  "setup.mouths.edit": "Edit",
  "setup.mouths.edit_done": "Done",
  "setup.mouths.summary_on_file": "On file",
  "setup.mouths.remove": "Remove",
  "setup.mouths.remove_confirm": "Remove for good?",
  "setup.mouths.duplicate":
    "{name} already eats here. Two people with the same first name would get " +
    "the same line in the plan — give the second one a name you can tell apart.",
  "setup.mouths.full":
    "Eight is the most a household can hold. Every mouth is another serving to compose at each generation.",
  "setup.mouths.branch_full":
    "The number of people chosen in the first step has been reached. Go back to that step to change it.",
  // ── LES DEUX MOITIÉS DE CE QUE « CONTINUER » FAIT DE LA FICHE ───────────
  // Le bouton l'absorbe depuis le 2026-08-15, et c'est voulu. Ce qui manquait
  // est qu'il le DISE — avant, à côté des champs, et après, à côté du nom qui
  // vient d'apparaître. Sans les deux, un bouton d'avancement crée quelqu'un
  // en silence: « ça m'a rajouté une personne que je voulais pas »
  // (compte réel, 2026-08-19).
  // ── LA TÊTE DU FORMULAIRE D'AJOUT, ET POURQUOI ELLE EXISTE ─────────────
  // ⛔ `setup.mouths.new_card` ET `new_card_hint` SONT PARTIES LE 2026-09-01.
  // Elles disaient « personne n'est encore ici … il n'y a rien à retirer » sur
  // la fiche d'ajout dépliée. Demandé à l'écran — « ça sert à quoi ça ? » —
  // et le mot compte: le même lot du 2026-08-19 avait livré DEUX remèdes au
  // sosie, et le second (le bouton « Retirer », rendu inconditionnel) rend le
  // premier FAUX. Il y a bien quelque chose à retirer: la fiche elle-même.
  // Voir le commentaire de `MouthsStep` dans `SetupPage.tsx`.
  //
  // ⚠️ ET LA SORTIE EST NOMMÉE PAR SON LIBELLÉ RÉEL. La phrase ci-dessous
  // envoyait chercher « Clear this card », un bouton renommé « Remove » le
  // 2026-08-19.
  "setup.mouths.next_will_save":
    "“Continue” saves this card too, and {name} joins the table. “Remove” undoes it.",
  "setup.mouths.added_by_next":
    "{name} is now at the table — “Continue” saved this card before moving on. “Remove” on their card undoes it.",

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
  // ── ÉTAPE 3 · LA TABLE, ET ÉTAPE 4 · LA DEMANDE ────────────────────────
  // Deux cartes là où il y en avait une. La coupure n'est pas cosmétique: « à
  // quels moments cette maison mange » ne change pas d'une semaine sur l'autre,
  // « quels jours je peux cuisiner cette semaine-ci » change à chaque fois.
  "setup.table.title": "Who eats, and when",
  // ⚠️ RÉÉCRITE LE 2026-08-14 AVEC LA CARTE QU'ELLE COIFFE. Elle disait « the
  // moments this house eats at », parce que l'étape posait UNE rangée pour
  // toute la maison et une carte à part pour les écarts. Il y a maintenant une
  // carte par personne, la même pour tout le monde, le titulaire compris.
  "setup.table.intro":
    "One card per person, the same for everyone. Only the moments you tick get composed.",
  "setup.table.each_title": "Anyone who eats differently",
  // ⚠️ LA DERNIÈRE PHRASE N'EST PAS UNE PROMESSE EN L'AIR: la grille par
  // personne (`MealPickerGrid`) existe, elle est jour × moment, et elle est
  // dimensionnée par la fenêtre du plan qu'on compose. Ne l'écrire que parce
  // que c'est vrai — une copie qui annonce un geste inexistant est la même
  // dette qu'une donnée collectée sans lecteur, prise par l'autre bout.
  "setup.table.each_intro":
    "Leave a person untouched and they eat at the moments above. Tick their " +
    "own moments only if they differ — a teenager who skips breakfast, a small " +
    "one who has an afternoon snack. This is the habit, not the week: the " +
    "meals someone actually misses — a trip, a dinner out, a weekend away — " +
    "are ticked off when you build that week’s plan.",
  "setup.table.house_label": "The house",
  "setup.table.same_as_house": "Eats at the same moments as the house.",
  // ── LE RÉGIME, PAR BOUCHE ────────────────────────────────────────────
  // Volontairement PLUS COURT que `setup.people.diet_hint`: la règle est
  // déjà énoncée en tête de l'étape, sur la ligne du titulaire. La répéter
  // mot pour mot sous chaque prénom ferait lire trois fois la même phrase.
  // Ce qui reste est ce que seule CETTE ligne peut dire: la table suit le
  // plus strict, et ne rien cocher veut dire « pas demandé ».
  "setup.table.diet_label": "How they eat",
  "setup.table.diet_hint":
    "The shared dish follows the strictest line at the table. Nothing ticked means nobody has been asked.",
  // ── LES MOMENTS, AVEC LEUR TAILLE (2026-08-14) ───────────────────────
  // Le libellé désigne LA PERSONNE DE LA CARTE, jamais « la maison »: la
  // rangée du titulaire s'appelait « The house », ce qui la faisait lire
  // comme un réglage global alors que c'est son rythme à lui — et laissait
  // croire que les autres n'en avaient pas.
  "setup.table.moments_label": "When they eat",
  "setup.table.moments_hint":
    "Tick the moments they actually eat at, and say whether it is a big or a " +
    "small one. Leave the size alone when it does not matter — nothing is " +
    "assumed from a blank.",
  // Les trois tailles, en mots. `MEAL_SIZES` porte les jetons; l'écran ne
  // rend jamais un jeton brut, même court.
  "setup.table.size_small": "Small",
  "setup.table.size_medium": "Medium",
  "setup.table.size_large": "Big",
  // ── LA LIGNE LIBRE (2026-08-14) ──────────────────────────────────────
  // Elle remplace le dépliant « What they usually eat » et ses boutons radio
  // par moment: dans l'entonnoir, il demandait d'aller cocher ailleurs des
  // moments qui se cochent juste au-dessus, et affichait « No eating moments
  // are set for this person yet » sur une carte où on venait d'en poser.
  // Même table, même RPC, même plafond — rien de saisi n'est perdu, et la
  // carte complète reste sur `/app/household`.
  // ⚠️ PAS « What they usually eat »: c'est MOT POUR MOT le titre du cadre
  // qu'on retire (`household.habits.title`), et le garder ferait lire l'ancien
  // bloc sous une autre forme. Ce champ n'est pas le questionnaire par moment,
  // c'est UNE ligne libre — le libellé doit le dire.
  "setup.table.note_label": "Their preferences, in your own words",
  "setup.table.note_hint":
    "In your own words, and kept for good — read again every time we compose. " +
    "Habits, tastes, the thing they never touch.",
  "setup.table.note_placeholder":
    "Fruit in the morning, pizza on Friday night, whatever is fresh from the market on Saturday.",
  "household.member.diet": "How they eat",
  // Les MÊMES mots que `setup.people.diet_*`, dans le namespace de cette
  // page: la liste des jetons est partagée (`DIET_ANSWERS`), les libellés ne
  // traversent pas la couture (`pageSeams.int.test.ts`).
  "household.member.diet_omnivore": "Eats everything",
  "household.member.diet_vegetarian": "Vegetarian",
  "household.member.diet_vegan": "Vegan",
  "household.member.diet_pescatarian": "Pescatarian",
  "household.member.diet_hint":
    "It rules every dish we compose for the household. The shared dish follows the strictest line at the table.",
  "household.member.diet_from_profile":
    "They have an account: how they eat is set in their own \u00ab about you \u00bb.",
  "household.error.bad_diet": "That is not one of the four answers.",
  "household.error.has_account":
    "They have an account: this is set in their own \u00ab about you \u00bb, not here.",
  // L5 · les refus des portes du poids visé et du rythme (20260818190000).
  "household.error.target_incomplete":
    "A target weight and a pace go together — one without the other has nowhere to land.",
  "household.error.bad_target_weight": "That target is outside 25 to 400 kg.",
  "household.error.bad_pace": "That pace is outside what we can cook towards.",
  "household.error.target_needs_direction":
    "A target only exists when the scale is meant to move. Pick losing or gaining first.",
  "household.error.no_member_id":
    "They were added, but we did not get their line back — reopen the household and finish their card.",
  // ── L5 · LE POP-UP « UNE BOUCHE » (2026-08-18) ──────────────────────────
  // Six blocs, trois obligatoires. Il s'ouvre à chaque ajout de personne, MAÎTRE
  // COMPRIS — sans quoi celui qui tient la maison serait le seul dont on ne sait
  // rien. ⛔ Aucune clé ne demande « adulte ou enfant »: la date de naissance le
  // dit, et poser la question en plus ouvre deux réponses qui se contredisent.
  "household.mouth.title": "Someone who eats here",
  "household.mouth.intro":
    "Three things we need, three you can skip. You can close this and come back — nothing is lost.",
  "household.mouth.later": "Later",
  "household.mouth.block_habits": "what they already eat",
  "household.mouth.block_allergies": "allergies",
  "household.mouth.block_tastes": "dislikes and diet",
  "household.mouth.preferences_open":
    "Fill in their food preferences",
  "household.mouth.preferences_open_you":
    "Fill in your food preferences",
  "household.mouth.preferences_saved": "{name}’s preferences are saved.",
  "household.mouth.preferences_title": "Food preferences",
  "household.mouth.preferences_title_named": "{name} — food preferences",
  "household.mouth.preferences_intro":
    "None of this is required. It sharpens the plan; it does not decide its shape.",
  "household.mouth.preferences_empty":
    "Nothing noted yet — habits, allergies, dislikes, diet.",
  "household.mouth.preferences_filled": "Already noted: {blocks}.",
  "household.mouth.preferences_done": "Done",
  "household.mouth.save": "Save",
  "household.mouth.add": "Add them",
  "household.mouth.fold": "Hide",
  "household.mouth.unfold": "Open",
  // CE QUI RETIENT LE BOUTON EST NOMMÉ, et rendu À CÔTÉ du bouton: un bouton
  // grisé sans phrase est le mode d'échec n°1 de ce dépôt.
  "household.mouth.held": "Still needed: {blocks}.",
  "household.mouth.block_identity": "their name and birth date",
  "household.mouth.block_direction": "which way the scale should go",
  "household.mouth.block_body": "height, weight, sex and how active they are",
  // ── BLOC 1 ──────────────────────────────────────────────────────────────
  "household.mouth.identity": "Who they are",
  "household.mouth.identity_hint":
    "The name is how the plan labels their serving — a serving with no name is dropped in silence.",
  "household.mouth.identity_hint_you":
    "Your name is how the plan labels your serving — a serving with no name is dropped in silence.",
  "household.mouth.birth_date_hint":
    "We never ask whether someone is an adult or a child: the birth date says it.",
  "household.mouth.age_unknown":
    "We cannot read that date, so no direction will apply to them yet.",
  // ── BLOC 2 ──────────────────────────────────────────────────────────────
  "household.mouth.direction": "Which way the scale should go",
  "household.mouth.direction_hint":
    "Down, up, or nowhere. Picking down or up opens a target and a pace.",
  "household.mouth.target_weight": "Weight they are aiming for (kg)",
  "household.mouth.target_weight_hint":
    "With the pace below, this gives a date to arrive on.",
  "household.mouth.target_refused_implausible":
    "That is outside what we can work with (25 to 400 kg).",
  "household.mouth.target_refused_wrong_direction":
    "That goes the other way from the direction picked above.",
  "household.mouth.target_refused_below_energy_floor":
    "Getting there would put their day below the energy floor. Pick a target a little further up.",
  "household.mouth.pace": "How fast",
  // ⛔ `pace_hint` / `pace_hint_you` retirées le 2026-09-01 — voir le pack FR.
  "household.mouth.pace_value": "{pace} kg a week",
  // ⚠️ DEUX ÉCRANS DIFFÉRENTS, ET C'EST LE CONTRAT DU TYPE `PaceCeiling`:
  // `null` = « je ne connais pas ce corps », `0` = « je le connais, et il n'a
  // pas de marge ». Jamais un curseur de 0,05 à 0 — un contrôle mort se lit
  // comme un bouton cassé.
  "household.mouth.pace_needs_body":
    "Fill in height, weight and sex just above, and the pace slider appears here.",
  "household.mouth.pace_no_margin":
    "There is no room to lose weight from this body without going under the energy floor. The direction still shapes their servings.",
  "household.mouth.arrival": "About {weeks} weeks at this pace.",
  // ── BLOC 3 ──────────────────────────────────────────────────────────────
  "household.mouth.who_fallback": "this person",
  "household.mouth.body":
    "Their body",
  "household.mouth.body_you":
    "Your body",
  "household.mouth.body_hint":
    "Used to size servings. It is never said out loud, and never printed next to a name at the table.",
  "household.mouth.activity":
    "How active they are",
  "household.mouth.activity_you":
    "How active you are",
  // ⛔ QUATRE CRANS, PAS CINQ. Aucun « je ne sais pas »: ne pas répondre EST
  // déjà cette réponse, et elle vit dans la colonne. Et jamais un nombre — un
  // nombre demandé est un nombre inventé.
  "household.mouth.activity_hint":
    "Without this, any calorie figure is a guessed constant wearing the confidence of a table.",
  "household.mouth.activity_sedentary": "Sitting most of the day, little walking",
  "household.mouth.activity_on_feet": "On their feet or moving a good part of the day",
  "household.mouth.activity_trains_some": "Training 2 to 3 times a week",
  "household.mouth.activity_trains_hard": "Training 4 times or more, or a physical job",
  // ── ② L'ACTIVITÉ EN DEUX AXES (2026-08-20) ────────────────────────────
  // Les quatre crans du dessus mélangent DEUX axes: les deux premiers décrivent
  // une JOURNÉE, les deux derniers un SPORT. Quelqu'un d'assis qui court deux
  // fois par semaine ne pouvait dire que l'un des deux, et héritait de 1,80 au
  // lieu de ~1,60 — 239 kcal/jour fabriqués par la forme de la question.
  "household.mouth.day_activity": "{who}'s day",
  "household.mouth.day_activity_you": "Your day",
  "household.mouth.day_activity_hint":
    "Work and daily life, sport aside. Sport is the next question.",
  "household.mouth.day_activity_seated": "Sitting most of the day, little walking",
  "household.mouth.day_activity_on_feet": "On their feet or moving a good part of the day",
  "household.mouth.day_activity_physical_job":
    "A physical job: carrying, walking, climbing, all day",
  "household.mouth.sport": "Sport, for {who}",
  "household.mouth.sport_you": "Sport, for you",
  "household.mouth.sport_hint":
    "Sessions per week, the day aside. \"None\" is an answer, and it counts.",
  "household.mouth.sport_none": "No sport",
  "household.mouth.sport_1_2": "1 to 2 times a week",
  "household.mouth.sport_3_4": "3 to 4 times a week",
  "household.mouth.sport_5_plus": "5 times a week or more",
  // ── ① LA STRUCTURE DU REPAS (2026-08-20) ───────────────────────────────
  // Le plan ne compose QUE le plat. Sans ces trois réponses, il fait porter au
  // seul plat une part MOYENNE du repas — juste par accident pour qui prend
  // pain, fromage et dessert, et près de deux fois trop petite pour qui ne
  // prend que du pain.
  "household.mouth.meal_structure": "What else is on {who}'s plate",
  "household.mouth.meal_structure_you": "What else is on your plate",
  "household.mouth.meal_structure_hint":
    "The plan only builds the main dish. Tell it what comes alongside.",
  "household.mouth.takes_dessert": "A dessert, a fruit or a yoghurt?",
  "household.mouth.takes_cheese": "Cheese?",
  "household.mouth.takes_bread": "Bread?",
  "household.mouth.answer_yes": "Yes",
  "household.mouth.answer_no": "No",
  // ── ⑤ L'APPÉTIT (2026-08-20) — ET IL EST TRANSITOIRE ──────────────────
  // ⚠️ LES LIBELLÉS NE DEMANDENT PAS « as-tu faim ». Les ±10 % sont
  // l'incertitude inter-individuelle de Mifflin-St Jeor, pas un curseur de
  // confort: la question est « la formule tombe-t-elle juste sur moi ? ».
  // Demander l'appétit obtiendrait une réponse à une autre question.
  "household.mouth.appetite": "How much {who} usually eats",
  "household.mouth.appetite_you": "How much you usually eat",
  // Voir la note de `fr.ts`: la phrase sur les ±10 % est partie le 2026-09-01,
  // et la comparaison qui reste porte un pronom — donc elle est voisée.
  "household.mouth.appetite_hint": "At the same build, {who} eats…",
  "household.mouth.appetite_hint_you": "At the same build, you eat…",
  "household.mouth.appetite_small": "Less",
  "household.mouth.appetite_average": "Like most",
  "household.mouth.appetite_large": "More",
  // ── BLOC 4 ──────────────────────────────────────────────────────────────
  // ── LA QUESTION DES MOMENTS A CHANGÉ D'ÉCRAN LE 2026-08-19 ────────────
  // Elle vivait à l'étape 3, deux écrans après « ce qu'elle mange déjà » —
  // qu'elle dimensionne. On demandait donc six repas à quelqu'un sans lui avoir
  // demandé combien il en fait.
  "household.mouth.eating": "When {who} eats, and what",
  "household.mouth.eating_you": "When you eat, and what",
  "household.mouth.eating_hint":
    "Tick the moments {who} really eats — each one opens a place to say what already happens there.",
  "household.mouth.eating_hint_you":
    "Tick the moments you really eat — each one opens a place to say what you already have there.",
  "household.mouth.habit_field": "Any habits?",
  // See fr.ts: the bubbles replace the three per-person yes/no questions. The
  // word is bare — the leading "+" is drawn by the screen, and disappears once
  // the bubble is on: it then STATES what is taken, it no longer offers to add
  // it.
  "household.mouth.extras_field": "And on the side?",
  "household.mouth.extra.bread": "bread",
  "household.mouth.extra.cheese": "cheese",
  "household.mouth.extra.yoghurt": "yoghurt",
  "household.mouth.extra.fruit": "fruit",
  "household.mouth.extra.dessert": "dessert",
  "household.mouth.habit_shaker_here": "{who}’s shaker sits at this moment.",
  "household.mouth.habit_shaker_here_you": "Your shaker sits at this moment.",
  "household.mouth.shaker_at": "When {who} takes it",
  "household.mouth.shaker_at_you": "When you take it",
  "household.mouth.shaker_at_loose": "Not at a named moment",
  "household.mouth.rhythm":
    "How many times a day {who} eats",
  "household.mouth.rhythm_you":
    "How many times a day you eat",
  "household.mouth.rhythm_hint":
    "Tick the moments when {who} actually eats.",
  "household.mouth.rhythm_hint_you":
    "Tick the moments when you actually eat.",
  "household.mouth.rhythm_house":
    "Nothing ticked means {who} eats at the house’s moments — not that {who} never eats.",
  "household.mouth.rhythm_house_you":
    "Nothing ticked means you eat at the house’s moments — not that you never eat.",
  "household.mouth.habits":
    "What {who} already eats",
  "household.mouth.habits_you":
    "What you already eat",
  "household.mouth.habits_hint":
    "Something daily that should not change?",
  "household.mouth.habits_hint_you":
    "Something daily you do not want changed?",
  "household.mouth.habits_only_declared":
    "Show only their moments",
  "household.mouth.habits_only_declared_you":
    "Show only your moments",
  // Voir la note de `fr.ts`: un exemple par moment, parce qu'un exemple qui ne
  // va pas avec la question apprend surtout que l'écran ne suit pas.
  "household.mouth.habit_placeholder_breakfast": "coffee and two slices of toast, a bowl of cereal…",
  "household.mouth.habit_placeholder_snack_am": "a piece of fruit, a handful of almonds…",
  "household.mouth.habit_placeholder_lunch": "a salad at the desk, yesterday's leftovers…",
  "household.mouth.habit_placeholder_snack_pm": "a yoghurt, a square of chocolate…",
  "household.mouth.habit_placeholder_dinner": "soup, pasta thrown together…",
  "household.mouth.habit_placeholder_before_bed": "herbal tea, some fromage blanc…",
  // ⚠️ MIS EN AVANT POUR QUI PREND DU POIDS, PROPOSÉ SANS INSISTANCE AUX
  // AUTRES: quelqu'un qui perd du poids peut très bien en prendre un, et ne pas
  // le demander le rendrait invisible au calcul.
  // ── LE BLOC DE L'APPORT CHIFFRÉ, REFAIT LE 2026-08-19 ─────────────────
  // « On ne comprend vraiment pas. » Il lui manquait un nom, un cadre, des
  // étiquettes sur ses trois nombres, et une phrase disant où il part.
  "household.mouth.shaker_title":
    "Their shake or snack",
  "household.mouth.shaker_title_you":
    "Your shake or snack",
  "household.mouth.shaker_summary":
    "One serving: {grams} g · {protein} g of protein · {kcal} kcal. Read it back — a protein typed into the calorie box looks exactly like a filled-in form.",
  "household.mouth.shaker_kept":
    "It is saved with the rest of the sheet, by the button at the bottom — there is nothing to save here.",
  "household.mouth.shaker_foreground":
    "Putting weight on usually means a shake or a measured snack. Add it and it counts inside the day instead of on top of it.",
  "household.mouth.shaker_background":
    "A shake or a measured snack? Add it and it counts inside the day.",
  "household.mouth.shaker_add": "Add a shake or measured snack",
  "household.mouth.shaker_label":
    "What {who} calls it",
  "household.mouth.shaker_label_you":
    "What you call it",
  "household.mouth.shaker_label_hint":
    "« my shake », « the morning thing » — their words, not yours.",
  "household.mouth.shaker_label_hint_you":
    "« my shake », « the morning thing » — your words.",
  "household.mouth.shaker_grams": "grams per serving",
  "household.mouth.shaker_protein": "protein (g)",
  "household.mouth.shaker_kcal": "energy (kcal)",
  // LES DEUX NOMBRES SE LISENT SUR L'ÉTIQUETTE DU POT: c'est un fait du
  // produit, pas un verdict sur la personne.
  "household.mouth.shaker_label_source":
    "All three are on the tub's label. Without them the shake is worked around instead of counted.",
  // Voir la note de `fr.ts`: le bouton s'active à une mesure, le moteur en
  // exige trois, et l'écran dit dans lequel des deux états on est.
  "household.mouth.shaker_save": "Save",
  "household.mouth.shaker_counted":
    "Saved, and counted inside the day: all three numbers are there.",
  "household.mouth.shaker_kept_not_counted":
    "Saveable, but not counted yet: the plan needs all three numbers to fold it in rather than cook around it. What you typed is kept.",
  "household.mouth.shaker_needs_one":
    "It needs a name and at least one of the three numbers to be saved.",
  // Voir la note de `fr.ts`: « counted » est un fait sur la base, et la fiche
  // d'ajout n'a pas encore de ligne où écrire.
  "household.mouth.shaker_with_the_card":
    "It leaves with the rest of the sheet, when you save it.",
  "household.mouth.shaker_remove": "Remove it",
  // ── BLOC 6 ──────────────────────────────────────────────────────────────
  "household.mouth.tastes":
    "What {who} will not eat",
  "household.mouth.tastes_you":
    "What you will not eat",
  "household.mouth.tastes_hint":
    "A dislike, not an allergy.",
  "household.mouth.tastes_hint_you":
    "A dislike, not an allergy.",
  "household.mouth.dislikes": "Food they refuse",
  // ⚠️ UN DÉGOÛT N'EST PAS UNE ALLERGIE, et la phrase le dit à l'écran: les
  // fondre promettrait une garde de sécurité sur une préférence.
  "household.mouth.dislikes_placeholder": "mushrooms",
  // ── LE RÉGIME EST LA PREMIÈRE SECTION DEPUIS LE 2026-08-19 ──────────────
  // Il écarte des familles entières d'aliments: le poser après les dégoûts
  // faisait noter des dégoûts sur ce qu'on ne servirait jamais.
  "household.mouth.diet_hint": "Vegetarian, vegan, pescatarian, or none of those.",
  "household.mouth.diet":
    "How {who} eats",
  "household.mouth.diet_you":
    "How you eat",
  // ⚠️ UNE INVITE, PAS UN CONSTAT. C'était « Nobody has said » — une phrase sur
  // un tiers, proposée comme option à quelqu'un qui répond pour lui-même.
  // L'option reste (sinon l'écran annonce un régime que personne n'a choisi)
  // mais elle est `disabled`: elle nomme l'état de départ, elle ne se choisit
  // plus.
  "household.mouth.diet_unset": "Pick an answer",
  "setup.table.from_profile":
    "They have their own account — their moments are in their own settings.",
  // ── LES MOYENS DE CUISSON, AU NIVEAU DU FOYER (2026-08-18) ──────────────
  // Une cuisine est PARTAGÉE: la question se pose une fois, jamais par bouche.
  // Elle vient AVANT les disponibilités — on demande avec quoi on cuisine
  // avant de demander quand, sinon on planifie des cuissons impossibles.
  //
  // ⚠️ LA COPIE NE PROMET RIEN QUE LE MOTEUR NE FASSE ENCORE. Ce lot COLLECTE;
  // l'exploitation est le lot suivant. D'où « we plan around it » au futur
  // d'usage et pas « we never propose an oven you don't have »: une phrase qui
  // annonce un geste inexistant est la même dette qu'une donnée sans lecteur,
  // prise par l'autre bout.
  "setup.equipment.title": "What you cook with",
  "setup.equipment.intro":
    "Asked once, for the whole kitchen — it is shared, so it is not a question per person.",
  "setup.equipment.legend": "Your kitchen",
  // La ligne d'aide dit les DEUX faces: ce que ça sert, et que le silence ne
  // coûte rien. Sans la seconde moitié, sept cases vides ressemblent à un
  // formulaire obligatoire.
  "setup.equipment.hint":
    "Tick what you actually have. A freezer changes whether we can cook once " +
    "and keep the rest; a microwave changes what « reheat it » means " +
    "on the day. Skip it and nothing changes.",
  "setup.equipment.tool_oven": "Oven",
  "setup.equipment.tool_stovetop": "Hob",
  "setup.equipment.tool_microwave": "Microwave",
  "setup.equipment.tool_freezer": "Freezer",
  "setup.equipment.tool_air_fryer": "Air fryer",
  "setup.equipment.tool_pressure_cooker": "Pressure cooker",
  "setup.equipment.tool_blender": "Blender or food processor",
  "setup.equipment.save": "Save",
  "setup.equipment.saving": "Saving…",
  "setup.equipment.saved": "Saved. Your next plan is built around this.",
  // LE REFUS D'UNE SÉLECTION VIDE, et il dit la sortie: on ne demande pas de
  // répondre, on refuse la réponse « aucun ». Un foyer sans aucun des sept ne
  // cuisine pas, et il n'y a alors rien à composer.
  "setup.equipment.error_empty":
    "Tick at least one — with none of these, there is nothing to cook with. " +
    "Leave it untouched instead if you would rather not say.",
  "setup.equipment.loading": "Reading what you already told us…",
  "setup.equipment.no_goal": "Set your goal above first, then this can be saved.",
  // ── LE DÉJEUNER DE LA SEMAINE (L6, §2.2) ────────────────────────────────
  // La question ne se pose qu'aux majeurs, et l'âge se DÉDUIT de la date de
  // naissance — aucune de ces phrases ne demande « adulte ou enfant ».
  // ⚠️ DEPUIS LE 2026-09-03 (A6, P6), LA CARTE VIT SUR /app/household, DANS
  // LA FICHE DE CHAQUE BOUCHE, juste au-dessus de sa grille — plus à l'étape 3.
  // Le namespace est GARDÉ (D6.3); les phrases qui disaient « at the next
  // step » sont réécrites en place (listées dans le bloc chantier-0903/FOYER).
  "setup.work_lunch.title": "Lunch on a working day",
  "setup.work_lunch.intro":
    "Whoever eats away from the kitchen at midday changes what the plan has " +
    "to cook. Their week, just below, has the last word.",
  "setup.work_lunch.loading": "Reading what you already told us…",
  "setup.work_lunch.at_work": "During the week, does {name} eat lunch at work?",
  "setup.work_lunch.yes": "Yes",
  "setup.work_lunch.no": "No",
  "setup.work_lunch.mode": "Does {name} take a packed lunch, or eat out?",
  "setup.work_lunch.mode_lunchbox": "Packed lunch",
  "setup.work_lunch.mode_outside": "Eats out",
  "setup.work_lunch.microwave": "Is there a microwave at work?",
  "setup.work_lunch.lunchbox_note":
    "The plan cooks those lunches, and makes them carry well.",
  // SANS MICRO-ONDES, LE REPAS DOIT ÊTRE BON FROID. C'est une contrainte de
  // composition, pas un conseil: on ne l'invente pas sur un silence.
  "setup.work_lunch.cold_note":
    "No microwave, so those lunches have to be good cold. The plan cooks them " +
    "that way.",
  "setup.work_lunch.outside_note":
    "{n} weekday lunches are marked “eating out” in their week, just below. " +
    "The plan does not cook them — it says what to aim for.",
  "setup.work_lunch.grid_wins":
    "Nothing is settled here. The day-by-day grid of their week, just below, " +
    "wins, meal by meal.",
  "setup.request.title": "This plan",
  "setup.request.from": "From",
  "setup.request.to": "To",
  "setup.request.window_hint":
    "Seven days at most — that is the ceiling the plan itself carries.",
  "setup.request.presence_title": "Who is here, day by day",
  "setup.request.presence_intro":
    "The habit — who eats lunch at work — is set on the Household page, in " +
    "each person’s sheet. This is the week: untick the meals someone will " +
    "actually miss — a trip, a dinner out, a weekend away. Only the days " +
    "above are touched.",
  "setup.request.presence_open": "Their week",
  "setup.request.presence_optional": "optional",
  "setup.request.intro":
    "Asked again every time you build one: this week is not last week.",
  "setup.plan.rhythm": "When you eat",
  "setup.plan.rhythm_hint": "Only the moments you tick get composed.",
  "setup.plan.time": "How long a cooking session lasts",
  // ⚠️ LE NOMBRE ARRIVE DÉJÀ FORMATÉ (« 1½ »), et c'est voulu: la demi-heure
  // se dit, elle ne se calcule pas à l'affichage. Voir `cookingTimeParts`.
  "setup.plan.time_minutes": "{n} min",
  "setup.plan.time_hours": "{n} hr",
  "setup.plan.time_hint":
    "Roughly. It is used as an order of magnitude, not as a stopwatch.",
  "setup.plan.budget": "Budget for this plan",
  "setup.plan.budget_hint":
    "The whole shopping list, in your currency. A real number lets us trade " +
    "things off — cheaper cuts, fewer out-of-season vegetables — instead of " +
    "guessing what “tight” means for your table.",
  "setup.plan.compose": "Build my first plan",
  "setup.plan.composing": "Building it now…",
  // ── LES HUIT PHRASES DE L'ATTENTE — voir `ComposingLabel` ────────────────
  // Quinze secondes chacune, dans l'ordre où la composition travaille. Elles
  // décrivent le TRAVAIL, jamais un pourcentage: rien ne remonte du serveur
  // avant la fin, donc un chiffre serait inventé.
  //
  // ⚠️ `setup.plan.composing` RESTE, et n'est plus rendu par le bouton. C'est
  // le libellé de repli d'un état d'attente qui n'aurait pas de cadence — et
  // le retirer ferait mentir les catalogues sur ce que l'écran sait dire.
  "setup.plan.composing_1": "Reading who eats at your table…",
  "setup.plan.composing_2": "Sizing each share…",
  "setup.plan.composing_3": "Setting aside what nobody here can eat…",
  "setup.plan.composing_4": "Choosing dishes for your moments…",
  "setup.plan.composing_5": "Grouping them into cooking sessions…",
  "setup.plan.composing_6": "Checking the week holds together…",
  "setup.plan.composing_7": "Adding up the shopping list…",
  "setup.plan.composing_8": "Writing why each choice was made…",
  "setup.plan.compose_hint": "This composes it. The next screen is the plan itself.",

  // ── CE QUI MANQUE ENCORE ────────────────────────────────────────────────
  // Un motif par phrase, et chacune dit LE GESTE, pas l'état. « Il manque une
  // date » n'apprend rien; « sans sa date sa direction ne s'applique pas » dit
  // ce qu'on perd.
  "setup.missing.title": "Before we can build it",
  // ⚠️ DEUX TITRES, ET LA DISTINCTION EST VISIBLE À L'ÉCRAN. Le premier ne
  // vaut que pour l'étape qui CONSTRUIT; on lisait « before we can build it
  // — when you eat » sous un formulaire qui pose la question et qui ne
  // construit rien.
  "setup.missing.for_you": "You",
  "setup.missing.before_next": "Before moving on",
  "setup.missing.household_size": "Tell us how many people you cook for.",
  "setup.missing.own_first_name": "Your first name — the plan names your serving with it.",
  "setup.missing.own_birth_date": "Your date of birth.",
  "setup.missing.own_height_cm": "Your height, so your servings are yours.",
  "setup.missing.own_gender": "Your sex, so your servings are yours.",
  "setup.missing.own_weight_kg":
    "Your weight. Without a first point, nothing can tell later whether you are losing too fast.",
  "setup.missing.own_goal": "What you are after. Nothing can be composed without it.",
  "setup.missing.own_allergies": "Whether you have allergies — “none” counts as an answer.",
  "setup.missing.own_diet":
    "How you eat — “I eat everything” counts as an answer. Without it a whole plan can be unusable from the first evening.",
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
  // \u26a0\ufe0f DEUX FAUTES ONT V\u00c9CU DANS CETTE SEULE PHRASE, SIGNAL\u00c9ES LE 2026-08-15.
  //
  // 1. \u00ab SIGNED UP \u00bb \u2014 un contresens sur le mod\u00e8le. Une bouche du foyer n'a PAS
  //    de compte; c'est toute la diff\u00e9rence entre elle et la personne qui
  //    remplit ce tunnel. \u00ab Christ\u00e8le n'est pas encore inscrit\u00b7e \u00bb envoyait
  //    chercher une inscription qui n'existe pas.
  //
  // 2. \u00ab "CONTINUE" DOES NOT SAVE THEM \u00bb \u2014 la phrase disait vrai, et c'\u00e9tait le
  //    probl\u00e8me. Elle annon\u00e7ait, sous une fiche enti\u00e8rement renseign\u00e9e, que le
  //    bouton principal allait perdre le travail de la personne. Un
  //    avertissement qu'on doit \u00e9crire est le signe que le geste est mal plac\u00e9,
  //    pas qu'il faut mieux le documenter. `SetupPage` fait donc maintenant
  //    absorber l'ajout par \u00ab Continuer \u00bb, et la phrase n'a plus \u00e0 s'excuser.
  //
  // Ce qui RESTE vrai, et pourquoi la cl\u00e9 survit: la fiche \u00e0 l'\u00e9cran n'est pas
  // encore dans le foyer. Sans cette ligne, \u00ab il manque encore une personne \u00bb
  // se lit juste sous un pr\u00e9nom qu'on vient de taper.
  "setup.mouths.held_typed":
    "{name} is not saved yet: the card is on screen, not in the household. Both \u201cAdd\u201d and \u201cContinue\u201d record it.",
  "setup.mouths.held_one":
    "One more person to go: you answered \u201c{answer}\u201d to the first question.",
  "setup.mouths.held_many":
    "{n} more people to go: you answered \u201c{answer}\u201d to the first question.",
  "setup.mouths.held_exit":
    "Fewer of you than you thought? Go back to the first question and change your answer.",
  "setup.missing.missing_mouths": "Add the other people who eat here.",
  "setup.missing.too_many_mouths":
    "Eight is the most a household can hold, you included.",
  // ⚠️ « When you eat » NE DÉSIGNAIT PLUS RIEN depuis que l'étape porte
  // aussi les moments de CHAQUE personne: on remplissait la rangée d'une
  // bouche, on croyait avoir répondu, et le refus employait les mêmes mots
  // que la rangée qu'on venait de remplir.
  // ⚠️ « THIS HOUSE » A DISPARU LE 2026-08-14 AVEC LA RANGÉE QUI PORTAIT CE
  // NOM. Le motif se rend maintenant SUR la carte du titulaire, sous ses
  // propres moments: « the moments this house eats at » y désignait un contrôle
  // global qui n'existe plus, et laissait chercher ailleurs.
  "setup.missing.eating_rhythm": "The moments you eat at, on your own card.",
  "setup.missing.cook_days": "Which days you cook.",
  "setup.missing.cooking_time_min": "How long a cooking session lasts.",
  "setup.missing.budget_amount": "How much this plan can cost.",
  "setup.missing.member_eating_rhythm":
    "When each person eats, if it is not the same as the house.",

  // ── LES TROIS TABLES DE LIBELLÉS DE `SetupPage.tsx` ──────────────────────
  // Elles étaient trois `Record` de module, en dur, dix-neuf phrases au total.
  // Le compilateur les gardait COMPLÈTES (un objectif ajouté à `MemberGoal`
  // sans son mot ne compile pas) et c'est pour ça qu'elles avaient l'air
  // saines — mais un `const` de module est figé à la langue du bundle, donc
  // dix-neuf mots anglais restaient au milieu d'un formulaire français. Les
  // tables gardent leur complétude: elles portent maintenant des CLÉS.
  //
  // Ce sont des mots de PERSONNE, pas de nutritionniste: « Lose weight » et
  // pas « fat_loss », qui est le jeton stocké et n'a rien à faire à l'écran.
  "setup.goal.fat_loss": "Lose weight",
  "setup.goal.muscle_gain": "Build muscle",
  "setup.goal.recomposition": "Same weight, different shape",
  "setup.goal.performance": "Train better",
  "setup.goal.health": "Eat better",
  "setup.goal.maintenance": "Keep my weight steady",

  // Les moments du jour. Vocabulaire du GÉNÉRATEUR de repas
  // (`api/mealGeneration.ts :: EATING_OCCASIONS`), plus court que celui des
  // plans publiés — voir l'en-tête de `api/mealLabels.ts` sur pourquoi les deux
  // ne se confondent pas.
  "setup.occasion.breakfast": "Breakfast",
  "setup.occasion.snack_am": "Mid-morning",
  "setup.occasion.lunch": "Lunch",
  "setup.occasion.snack_pm": "Afternoon",
  "setup.occasion.dinner": "Dinner",
  "setup.occasion.before_bed": "Before bed",

  // Les jours, en ABRÉGÉ: ils tiennent dans sept cases à cocher côte à côte sur
  // un téléphone. Le seed a déjà `day.long.*` pour la prose des plans; les deux
  // vocabulaires restent séparés parce qu'ils n'ont pas la même contrainte de
  // place.
  "setup.day.mon": "Mon",
  "setup.day.tue": "Tue",
  "setup.day.wed": "Wed",
  "setup.day.thu": "Thu",
  "setup.day.fri": "Fri",
  "setup.day.sat": "Sat",
  "setup.day.sun": "Sun",

  // ═════════════════════════════════════════════════════════════════════════
  // LES ALLERGÈNES PROPOSÉS (`copy/allergens.ts`)
  //
  // ⚠️ LE LIBELLÉ SE TRADUIT, LE SLUG JAMAIS. Le slug est la donnée que le
  // VERROU DE SORTIE compare pour refuser un plat; le traduire romprait la
  // protection d'un élève anaphylactique et le test de parité avec le
  // catalogue moteur le refuse, dans l'ordre. Ces treize clés sont le seul
  // endroit où le mot change de langue.
  //
  // Un namespace À PART et pas `setup.*`: la même liste est rendue par
  // `/app/health` et par la carte de contraintes du coach. La ranger sous le
  // tunnel d'entrée aurait déclaré une dette de traduction au nom d'un écran
  // qui ne la porte pas.
  // ═════════════════════════════════════════════════════════════════════════
  "allergen.peanut": "Peanuts",
  "allergen.tree_nut": "Tree nuts",
  "allergen.gluten": "Gluten",
  "allergen.wheat": "Wheat",
  "allergen.dairy": "Dairy",
  "allergen.egg": "Eggs",
  "allergen.fish": "Fish",
  "allergen.shellfish": "Shellfish",
  "allergen.mollusc": "Molluscs",
  "allergen.sesame": "Sesame",
  "allergen.soy": "Soy",
  "allergen.pork": "Pork",
  "allergen.alcohol": "Alcohol",
  "allergen.celery": "Celery",
  "allergen.mustard": "Mustard",
  "allergen.sulphite": "Sulphites",
  "allergen.lupin": "Lupin",

  // ═════════════════════════════════════════════════════════════════════════
  // /email-verified — LE RETOUR DU LIEN DE CONFIRMATION
  //
  // Écran du chemin heureux coach: `emailRedirectTo` d'`Auth.tsx` y renvoie.
  // Il portait cinq phrases en dur et pas un seul `t()` — donc un coach qui
  // s'inscrivait en français recevait un e-mail français et atterrissait sur
  // un écran anglais, sur la seule page qui confirme que son compte existe.
  //
  // Deux phrases de clôture et pas une, parce que les deux situations ne se
  // ressemblent pas: avec `?code`, la session est déjà échangée dans l'onglet
  // d'origine et celui-ci ne sert plus à rien; sans, on ne peut que supposer
  // que le lien vient d'être cliqué. Dire « c'est fait » dans les deux cas
  // affirmerait quelque chose qu'on ne sait pas.
  // ═════════════════════════════════════════════════════════════════════════
  "auth.verified.title": "Email confirmed!",
  "auth.verified.body": "Thank you for taking the time to confirm your address.",
  "auth.verified.back_to_tab": "You can go back to the original tab",
  "auth.verified.carry_on": "to carry on.",
  "auth.verified.close_tab": "You can close this tab.",
  "auth.verified.close_tab_maybe":
    "If you have just clicked the link, you can close this tab.",

  // ═════════════════════════════════════════════════════════════════════════
  // LE MOTEUR DE REPAS — LE CATALOGUE PARALLÈLE QUI BLOQUAIT TROIS ÉCRANS
  //
  // Ces clés vivaient dans un `COPY` local d'`api/mealLabels.ts`, hors du seed.
  // Ni la garde de `t()` ni le scanner de `pageSeams.int.test.ts` ne le
  // voyaient: le premier ne voit que ce qui passe par `t()`, le second ne
  // relève que des littéraux qui SONT des clés du seed. `/app/plan`,
  // `/app/today` et `/app/household` montaient donc les mêmes ~90 phrases
  // anglaises, et aucune des trois ne pouvait basculer.
  //
  // ⚠️ CE N'EST PAS LE VOCABULAIRE DE `slot.*`. `api/labels.ts` traduit les
  // créneaux d'un PLAN PUBLIÉ (`slot_vocabulary`: `on_waking`, `snack_am`,
  // `before_bed`…) et JETTE sur un jeton inconnu; le générateur de repas a son
  // propre vocabulaire, plus court. Fondre les deux tables rendrait `slotLabel`
  // tolérant à un jeton qu'aucun plan ne contient. Elles restent distinctes,
  // chacune fermée sur son vocabulaire — c'est la note d'en-tête de
  // `mealLabels.ts`, et elle vaut toujours après l'extraction.
  // ═════════════════════════════════════════════════════════════════════════
  "meals.result.in_pantry": "You have it",
  // ⚠️ IL NE PARAÎT QUE SI LE PLAT PUISE DANS UN LOT. Sans lot, ces ingrédients
  // SONT la recette entière, et ce titre affirmerait un lot qui n'existe pas.
  // Le défaut (2026-08-20): la liste sortait nue sous le titre du plat, on y
  // lisait la recette complète, et on croyait qu'il manquait le poulet.
  "meals.result.extra_ingredients": "On top of the batch",
  "meals.result.method": "How",
  // ── LE GESTE DU SOIR (2026-08-14) ───────────────────────────────────────
  // ⚠️ UNE CLÉ À PART, ET C'EST TOUT LE POINT. « How » ouvre une RECETTE —
  // c'est ce qu'on lit pour cuisiner de zéro. Un plat qui puise dans une
  // préparation n'a pas de recette à ce repas-là: il a un geste, « réchauffe
  // une portion, ajoute la salade et le citron ». Sous le même mot, les deux
  // se liraient pareil, et on relirait une recette qu'on a déjà faite.
  "meals.result.assemble": "Before serving",
  // ── LA SESSION D'OÙ CE PLAT TIRE SON LOT (2026-08-14) ───────────────────
  // Le chemin `dish.uses[].preparation_id → cooking_sessions[].preparation_ids`
  // existait entièrement dans la donnée et n'était NULLE PART à l'écran: « tes
  // sessions de cuisine » porte les grosses cuissons sans dire quel plat en
  // sort, la carte du plat dit d'où vient son lot sans dire dans quelle
  // session il a été fait.
  // ⚠️ DISCRET PAR DÉFAUT. Le planning se lit d'un coup d'œil; il ne doit pas
  // devenir une liste de recettes dépliées — d'où un dépliant fermé, et un
  // libellé qui dit ce qu'on va ouvrir plutôt qu'un simple « voir ».
  // ⚠️ AUCUNE DURÉE N'EST ANNONCÉE ICI: les deux temps vivent sur les
  // préparations et sur la session, et les recopier sous un plat donnerait à
  // un assemblage le temps d'une cuisson.
  "meals.result.thaw_the_night_before":
    "Frozen portion: take it out of the freezer the night before.",
  "meals.result.session_open": "The cooking session",
  "meals.result.session_hide": "Hide the session",
  "meals.result.session_also": "Made in the same session: {titles}",
  // ── FF-053: DEUX CLÉS QUI ONT DÉMÉNAGÉ ──────────────────────────────────
  // Elles vivaient dans le `COPY` local de `MealBuilder`. Depuis que le rendu
  // d'un plan est un composant partagé (`plan/PlanResult`), monté sur
  // `/app/plan` ET dans la pop-up du brouillon, une copie locale à l'un des
  // deux appelants serait une copie que l'autre ne peut pas lire.
  //
  // ⚠️ `meals.result.empty` N'EXISTE PAS, et c'est une décision: il dirait
  // « dis-moi par où commencer CI-DESSUS », ce qui est vrai sur l'écran du plan
  // et faux dans une pop-up qui n'a pas de formulaire. Le vide est donc un
  // texte de l'APPELANT (`emptyLabel`), pas du rendu.
  //
  // ⚠️⚠️ TROIS CLÉS ONT ENCORE DEUX MAISONS, ET IL FAUT LE SAVOIR AVANT DE
  // TOUCHER À L'UNE DES DEUX. `components/MealBuilder.tsx` porte toujours un
  // `COPY` LOCAL de 44 entrées (c'est le catalogue parallèle de `/app/plan`,
  // que le lot 4 n'a pas eu le temps d'extraire), et il redéclare
  // `meals.result.today`, `meals.result.past` et `meals.loading`. Les valeurs
  // sont IDENTIQUES aujourd'hui — donc rien ne casse — mais rien ne les tient
  // ensemble non plus: changer l'une ici laisserait l'autre là-bas, et l'écran
  // du plan dirait un mot pendant que celui du jour en dirait un autre. Les
  // deux se rejoignent quand `/app/plan` entre dans le périmètre.
  "meals.result.today": "Today",
  // ── LOT 1 (2026-08-17) · LA VUE PAR JOUR ────────────────────────────────
  // Le rail des jours de `PlanResult`: un bouton par jour de la fenêtre, plus
  // celui-ci. Les jours eux-mêmes sont rendus par `meals.day.*` — aucun
  // libellé de jour ne vit ici.
  "meals.result.day_all": "The whole week",
  "meals.result.day_rail": "Read one day",
  // La carte de session du bloc jour — la durée affichée est celle de la
  // SESSION, sur sa propre carte; jamais sur un plat.
  "meals.result.day_session": "Cooking session",
  "meals.result.day_session_show": "See the run-through",
  "meals.result.day_session_hide": "Hide the run-through",
  // La vague de courses qui tombe ce jour-là. Les ratures restent dans la
  // fenêtre de courses; cette liste-ci se lit, elle ne se coche pas.
  "meals.result.day_groceries_one": "Groceries for this day — 1 item",
  "meals.result.day_groceries_many": "Groceries for this day — {n} items",
  "meals.result.day_groceries_show": "See the list",
  "meals.result.day_groceries_hide": "Hide the list",
  // Un jour vraiment vide le dit — un bloc muet sous un titre de jour se
  // lirait comme une panne.
  "meals.result.day_nothing": "Nothing to cook or buy this day.",
  // ── LOT 3 · DEUX PLATS AU MÊME MOMENT, ET POUR QUI ──────────────────────
  // Le prénom est INTERPOLÉ, jamais traduit: il vient de la ligne membre (F5).
  "meals.day_person.table": "For the table",
  "meals.day_person.member": "For {name}",
  // ⛔ « POUR LA TABLE » N'EST PLUS DIT DÈS QU'UNE BOUCHE MANGE À PART. Sur un
  // foyer de deux, il désignait alors UNE personne. La voie commune se nomme
  // donc par CEUX QUI Y MANGENT, et « la table » redevient un repli.
  "meals.day_person.members": "For {names}",
  // Les marqueurs sous un plat COMMUN — « quand le repas est commun, il
  // faudrait des genre de marqueur pour les personnes » (2026-08-19). Les
  // prénoms se voient; ce libellé-ci ne sert qu'aux lecteurs d'écran.
  "meals.day_person.marks_label": "Who eats this dish",
  // ── FF-053 · LA VUE GLOBALE ─────────────────────────────────────────────
  "meals.grid.title": "Your week at a glance",
  // Le lot, dit sur la case. Sans lui, trois cases identiques se lisent comme
  // une semaine paresseuse alors que c'est une seule casserole.
  "meals.grid.from_batch": "from a batch",
  // ── D3b · LA CASE NE PARLE PLUS AU NOM DE TOUT LE MONDE ─────────────────
  // La bouche qui mange à part. Court par obligation: sept colonnes à 320 px
  // laissent une soixantaine de pixels par case.
  "meals.grid.own_one": "+1 apart",
  "meals.grid.own_many": "+{n} apart",
  // Aucun plat de table à ce moment: le titre affiché est l'assiette d'UNE
  // bouche. Le dire vaut mieux que la servir au nom de la table.
  "meals.grid.own_only": "no table dish",
  // Deux plats de table sur un seul moment. On COMPTE, on ne jette pas.
  "meals.grid.extra_one": "+1 more dish",
  "meals.grid.extra_many": "+{n} more dishes",
  // Les trois silences VOULUS. Ils se ressemblent entre eux, et c'est fait
  // exprès: ce sont tous des « rien ici, et c'est normal ».
  "meals.grid.away": "not eating here",
  // L3 — ELLE MANGE, MAIS PAS CE QUE LE PLAN COMPOSE. Voisin d'`away` et
  // distinct de lui: aucun plat dans les deux cas, mais celui-ci est le seul
  // où le produit gardera le droit de dire un ordre de grandeur.
  "meals.grid.eating_out": "eating out",
  "meals.grid.leftovers": "leftovers",
  // Le quatrième, et le seul qui soit un défaut.
  "meals.grid.empty": "nothing here",
  "meals.grid.empty_hint":
    "Nothing was composed for this moment, and you did not ask for it to be skipped.",
  // ── FF-053 · LE BLOC CUISINE ────────────────────────────────────────────
  "meals.kitchen.title": "What you cook",
  "meals.kitchen.cook_on": "cook it {day}",
  "meals.kitchen.feeds": "feeds {days}",
  "meals.result.past": "Gone by",
  // Les sessions: le moment où l'on cuisine. Le déroulé est ce qu'on lit avant
  // de commencer, et aucun plat ne peut le porter — l'ordre des gestes se joue
  // ENTRE les préparations.
  "meals.sessions.title": "Your cooking sessions",
  "meals.sessions.subtitle":
    "Cook on these days and the rest of the week is assembling, not cooking.",
  // ── LOT 4 · LE PLURIEL MORT, RÉPARÉ ───────────────────────────────────────
  // « — 1 servings » s'affichait sur toute préparation d'une portion (le cas
  // NOMINAL aux barreaux ② et ③ de la fusion). Deux clés, choisies par
  // `i18n/plural.ts`, parce que « zéro » ne se dit pas pareil dans les deux
  // langues et qu'aucun suffixe ne se fabrique en code (R7).
  "meals.sessions.makes": "— {n} servings",
  "meals.sessions.makes_one": "— {n} serving",
  // ── LE BOXING (v4, 2026-08-20) ────────────────────────────────────────────
  // La seule pesée de la semaine, en DERNIER BLOC de la session de cuisine. Ce
  // sont des grammes d'ALIMENT — la même famille que « 400 g de cuisses de
  // poulet » sur une liste de courses — et il n'y a JAMAIS de pourquoi à côté.
  //
  // ⚠️ « Boxing » EST LE MÊME MOT DANS LES DEUX PACKS, et c'est une décision du
  // 2026-08-20, pas une traduction oubliée. C'est le nom que le produit donne au
  // geste; le traduire d'un seul côté ferait deux noms pour la même chose entre
  // une capture d'écran et une phrase de support.
  "meals.boxes.title": "Boxing",
  // Sur la carte d'un PLAT, ce ne sont pas des instructions de pesée — elle a eu
  // lieu à la session. Ce sont les bacs à aller chercher dans le frigo.
  "meals.boxes.title_dish": "Boxes to take out",
  "meals.dish.who_eats": "Who eats this",
  // ⚠️ LE COMPTE EST EN TÊTE PARCE QU'ON SORT SES BACS AVANT DE COMMENCER.
  // C'est la seule chose qu'on veuille savoir avant d'avoir lu une ligne. Deux
  // clés et pas un suffixe fabriqué en code (R7), comme les courses du jour.
  "meals.boxes.count_one": "1 container to fill",
  "meals.boxes.count_many": "{n} containers to fill",
  // ⚠️ DE QUEL GRAMME ON PARLE, UNE FOIS POUR TOUT LE BLOC. Trois centimètres
  // plus haut, les casseroles affichent leurs quantités de CRU, pour la fournée
  // entière. Sans cette ligne, deux séries de nombres voisines se lisent comme
  // une contradiction — c'est le défaut du 2026-08-19 pris par l'autre bout.
  "meals.boxes.ready_not_raw":
    "Grams of cooked food, per container. The pan quantities above are raw, for the whole batch.",
  // ⛔ CE QUI DIT QUE LE NOMBRE DÉCRIT UN BAC, PAS UNE PERSONNE. Il ne paraît QUE
  // sur un contenant à plusieurs noms: sur un seul nom, la boîte EST la portion
  // et « for 1 » n'apprendrait rien. C'est la seule marque de la distinction
  // entre les deux grammes, et elle reste minuscule — un badge ou une couleur en
  // ferait un statut, alors que c'est une précision de lecture.
  "meals.boxes.for_n": "· for {n}",
  // Au-delà de quatre prénoms, le couvercle dit combien ils sont: six noms ne se
  // lisent ni sur un bac ni sur un téléphone à 320 px.
  "meals.boxes.rest_of_table": "The rest of the table ({n})",
  // Un plan relu sans ses parts n'a aucun prénom à joindre: l'instruction de
  // pesée reste vraie, et un identifiant brut n'a rien à faire à table.
  "meals.boxes.lid_unnamed": "One container",
  // « g » est le symbole international du gramme.
  "meals.boxes.grams": "{n} g",
  // ── LE TEMPS ──────────────────────────────────────────────────────────────
  // Deux nombres, jamais fondus en un. « 10 min hands-on » décide si on s'y met
  // ce soir; « 50 min in all » décide si on a la fenêtre. N'en montrer qu'un
  // ferait renoncer sur le mauvais critère.
  "meals.sessions.session_time": "about {n} min",
  "meals.sessions.active": "{n} min hands-on",
  "meals.sessions.total": "{n} min in all",
  "meals.sessions.recipe_show": "Recipe",
  "meals.sessions.recipe_hide": "Hide recipe",
  // ── CE QUI SE PASSE DANS LA CUISINE AUJOURD'HUI ───────────────────────────
  // `/app/today` répondait à « qu'est-ce que je mange » et pas à « qu'est-ce
  // que j'ai à faire ». Or les deux gestes qui DEMANDENT quelque chose à la
  // journée — cuisiner, faire les courses — n'existaient que sur `/app/plan`,
  // derrière deux boutons, dans une vue qui montre la semaine entière.
  //
  // DEMAIN EST DIT AUSSI, et c'est la moitié utile: on ne prépare pas une
  // session le matin même. La veille au soir est le moment où on décide de
  // sortir la viande ou de passer au magasin en rentrant.
  // ── LA GRILLE: QUELS REPAS, QUELS JOURS ───────────────────────────────────
  // Décocher veut dire « je ne mange pas ici » — pas « je gère moi-même ». Le
  // moment sort de la composition, de la liste de courses et des portions. La
  // copie doit le dire, sinon on décoche en croyant seulement masquer.
  "meals.picker.title": "Which meals, which days",
  "meals.picker.subtitle":
    "Everything you declared is on. Untick a meal you will not be eating at " +
    "home — nothing gets cooked for it, and nothing gets bought.",
  "meals.picker.meal": "Meal",
  "meals.picker.all_on": "Every meal is on. Untick the ones you are out for.",
  // Deux formes: « 1 repas décoché » est un singulier en français, et cette
  // valeur-là est atteignable (on décoche un seul dîner).
  "meals.picker.some_off_one": "{n} meal off. It comes back next time if you tick it.",
  "meals.picker.some_off_many": "{n} meals off. They come back next time if you tick them.",
  // ── L3 · LES TROIS ÉTATS ────────────────────────────────────────────────
  // Trois choix nommés, parce qu'« absent » et « dehors » retirent tous deux
  // la part et ne veulent pas dire la même chose. Les libellés le disent par
  // ce que le plan FAIT, jamais par un jargon d'état.
  "meals.picker.state_at_table": "Eating here",
  "meals.picker.state_eating_out": "Eating out",
  "meals.picker.state_away": "Not around",
  // ⚠️ « Sort du plan, pas de la journée » est la phrase qui sépare les deux
  // états. Sans elle, on lit deux mots pour une seule idée.
  "meals.picker.some_out_one":
    "{n} of them is a meal out: it leaves the plan, not the day.",
  "meals.picker.some_out_many":
    "{n} of them are meals out: they leave the plan, not the day.",
  // ── D4 ④ · CE QUE LA GRILLE NE MONTRE PAS ────────────────────────────────
  // La réponse hebdomadaire coche CINQ midis; une fenêtre « d'ici dimanche »
  // commencée un mardi n'a que QUATRE jours ouvrés. Le compteur d'à côté n'était
  // pas faux — il comptait ce qui est À L'ÉCRAN — mais il démentait d'une unité
  // la phrase de l'étape précédente, et un nombre faux d'un cran est pire
  // qu'absent parce qu'on le croit. Cette ligne nomme le reste au lieu de
  // l'additionner: écrire « 5 » sous quatre cases ferait chercher la cinquième.
  "meals.picker.some_out_hidden_one":
    "1 more is marked on a day this plan does not cover. It stays marked.",
  "meals.picker.some_out_hidden_many":
    "{n} more are marked on days this plan does not cover. They stay marked.",
  "meals.picker.no_rhythm":
    "Set the moments you eat in «How your day runs» first — this grid is built " +
    "from them.",
  "meals.picker.open": "Pick the meals",
  "meals.picker.save": "Save",
  "meals.picker.saving": "…",
  "meals.picker.cancel": "Cancel",
  "meals.today.title": "In the kitchen",
  "meals.today.cook_today": "You cook today",
  "meals.today.cook_tomorrow": "You cook tomorrow",
  "meals.today.shop_today": "Shopping day",
  "meals.today.shop_tomorrow": "Shopping tomorrow",
  "meals.today.shop_on": "Shopping on {day}",
  // UNE COURSE PASSÉE SE DIT, et c'est le cas qui compte le plus. Ne rien
  // afficher parce que la date est derrière laisse quelqu'un dont le frigo est
  // vide devant un écran qui a l'air normal — pendant que le plan, lui,
  // suppose que les courses ont été faites.
  "meals.today.shop_overdue": "Shopping was due {day}",
  "meals.today.shop_items": "{n} items on the list",
  "meals.today.shop_open": "Open the list",
  "meals.today.sessions_open": "See the week",
  "meals.today.makes": "Makes {titles}",
  // FF-057 — LA PORTE DE LA PROCÉDURE ACCIDENT, sur la cuisson du jour.
  //
  // ⚠️ LE LIBELLÉ DIT UN FAIT, PAS UN AVEU. « I didn't cook this » et non
  // « j'ai raté » : le produit ne juge pas la personne, il répare le plan —
  // même règle que `plan_feedback.ts` (« ON ÉVALUE LE PLAN, JAMAIS LA
  // PERSONNE »). Un libellé culpabilisant sur le geste qu'on veut voir arriver
  // est un geste qu'on n'aura pas, et le plan restera faux.
  "meals.today.session_missed": "I didn't cook this",
  "meals.today.session_missed_busy": "Sending…",
  "meals.today.session_missed_failed":
    "That didn't go through. Try again, or tell Sophia in the chat.",
  // Le repli quand la journée ne demande rien: on ne dit pas « rien à faire »,
  // on dit CE QUI EST déjà fait — sinon l'élève croit qu'il manque quelque
  // chose, alors qu'une semaine bien préparée est justement une semaine où la
  // plupart des jours n'ont rien à cuisiner.
  "meals.today.assembling": "Nothing to cook today — today is assembling.",
  // Un plat qui puise dans une préparation n'affiche ni sa recette ni ses
  // quantités: les répéter ferait racheter et recuire ce qui est déjà prêt.
  "meals.result.from_prep": "From {title} — cooked on {day}.",
  // Le lot: ce qu'une seule session de cuisine produit, et les jours qu'elle
  // nourrit. Dit AVANT les quantités, sinon « 1,200 g » se lit comme une
  // portion.
  "meals.result.batch_makes": "Cooked once — makes {n} servings",
  "meals.result.batch_covers": "covers {days}",
  // Le jour de restes: la seule chose à faire est de sortir la boîte, donc la
  // carte n'affiche ni les ingrédients ni la recette.
  "meals.result.from_batch": "From the batch you cooked on {day} — reheat a portion.",
  // ── LOT 2 · LE GESTE DU JOUR J, DIT PAR SON JETON ──────────────────────
  //
  // ⚠️ CES QUATRE LIBELLÉS SONT DES INSTRUCTIONS DE CUISINE, jamais un
  // jugement: « Just reheat » dit ce qu'on fait, pas ce qu'on vaut. Aucun
  // n'ajoute de raison, d'objectif ni de chiffre corporel — la frontière F7/F8
  // vaut ici comme sur les parts.
  //
  // ⚠️ « Nothing to prepare » N'EST PAS LE REPLI DU SILENCE. Il rend le jeton
  // `none`, c'est-à-dire une affirmation du moteur. Un plat dont le geste n'a
  // pas été déclaré n'affiche RIEN.
  "meals.same_day.none": "Nothing to prepare",
  "meals.same_day.reheat_only": "Just reheat",
  "meals.same_day.assemble": "Assemble on the plate",
  "meals.same_day.cook_fresh": "Cook it fresh",
  // La durée du GESTE DU JOUR, jamais celle de la cuisson ni de la session.
  // Clé à part et pas une phrase assemblée en code: l'ordre du libellé et de la
  // durée appartient à la langue.
  "meals.same_day.minutes": "{n} min",
  // ── FF-059 · LE CHIFFRE, ET CE QU'IL DIT DE LUI-MÊME ────────────────────
  //
  // ⚠️ AUCUNE DE CES PHRASES N'EST UNE CIBLE, UN BUDGET NI UN SCORE. Elles
  // décrivent de la NOURRITURE — « ce plat pèse ça » — jamais la personne qui
  // la mange.
  //
  // `kcal` en minuscules et collé au nombre: c'est une unité, pas un titre de
  // colonne. Une majuscule ou un libellé (« Energy: 612 kcal ») donnerait à
  // l'assiette l'air d'une fiche de suivi.
  "meals.energy.dish": "{n} kcal",
  "meals.energy.day": "{n} kcal across the day",
  // LE TOTAL PARTIEL SE DIT AVEC SES DEUX NOMBRES, jamais avec le seul mot
  // « incomplet ». « 1 200 kcal, 2 des 3 plats comptés » se lit correctement;
  // « 1 200 kcal (incomplet) » se lit « 1 200 kcal ».
  "meals.energy.day_partial": "{n} kcal — {counted} of {total} dishes counted",
  "meals.energy.day_unreadable": "Not enough detail to add this day up",
  // ── L'ADD-ON DU FOYER — la bifurcation, dite comme un ajout ─────────────
  // « 1 250 kcal · incluant 420 qui vont dans ton assiette » et pas
  // « 1 250 kcal ». Sans la seconde moitié, deux personnes autour de la même
  // casserole lisent deux totaux différents et rien n'explique pourquoi. C'est
  // un AJOUT, jamais une part retirée à quelqu'un.
  "meals.energy.day_with_addon": "{n} kcal — including {addon} added to your plate",
  // Sur un plat sans chiffre: on dit POURQUOI. Un plat muet à côté de plats
  // chiffrés se lit « ce plat ne compte pas », ce qui est faux.
  "meals.energy.dish_unknown_ingredient": "One ingredient isn't in our food table",
  "meals.energy.dish_missing_quantity": "One quantity isn't precise enough to add up",
  // D'OÙ VIENT LE CHIFFRE. Une ligne, une fois par écran, jamais par plat.
  // C'est la règle de `CALORIE_REVERSAL`: un chiffre vit dans un champ qui
  // porte sa base, ou il n'existe pas — et l'élève doit pouvoir lire cette
  // base, sinon la garantie n'est vraie que dans le code.
  "meals.energy.basis":
    "Worked out from the quantities in your plan and a food composition table — not guessed from a photo.",
  "meals.energy.household_abstention":
    "Everyone's share is different on a household plan, so a single number per dish would be wrong for everyone.",
  // L'INTERRUPTEUR. Il ne s'affiche QUE si les trois autres portes sont
  // ouvertes: proposer « voir les calories » à quelqu'un que le plancher
  // protège, ce serait encore lui parler de calories.
  "meals.energy.switch_on": "Show calories",
  "meals.energy.switch_off": "Hide calories",
  "meals.energy.switch_hint": "You can turn this off at any time, and it goes quiet everywhere.",
  "meals.energy.switch_failed": "That did not save. Nothing changed.",
  // ── FF-059 LOT 3 · LA CIBLE (niveau C) ──────────────────────────────────
  //
  // ⚠️ UNE FOURCHETTE, ET AUCUN RESTE. « 2 100–2 500 a day for your weight »
  // pose un ordre de grandeur à côté du total; « 680 kcal left » serait un
  // tracker, et cette phrase n'existe nulle part dans ce produit.
  //
  // « for your weight » n'est PAS un ornement: c'est la seule chose sur
  // laquelle la fourchette est posée. Sans ces trois mots, un élève croirait
  // qu'on a tenu compte de son activité — et rien ne la collecte.
  "meals.energy.target_range": "Around {low}–{high} a day for your weight",
  // ── ⟳ LOT 4 (2026-09-01) · LA FOURCHETTE QUI A SUIVI LA DIRECTION ───────
  //
  // ⚠️ DEUX PHRASES ET PAS UNE INTERPOLATION. « for your {direction} » aurait
  // demandé un mot injecté au milieu d'une phrase, et les deux langues ne le
  // placent pas au même endroit — cicatrice « garde testée dans une seule
  // langue ». Chaque direction porte sa phrase entière, dans les deux langues.
  //
  // ⚠️ « to lose weight at your pace », PAS « to lose weight ». Le décalage
  // vaut le RYTHME que la personne a réglé, pas une perte en général: deux
  // personnes de même poids aux rythmes différents lisent deux fourchettes
  // différentes, et la phrase doit le porter sinon la seconde a l'air fausse.
  "meals.energy.target_range_down":
    "Around {low}–{high} a day to lose weight at your pace",
  "meals.energy.target_range_up":
    "Around {low}–{high} a day to gain at your pace",
  "meals.energy.target_measured": "based on your weigh-in of {date}",
  // La cible ne se raconte pas comme une consigne. « Roughly », « around »:
  // c'est une estimation de maintenance, pas un objectif qu'on atteint.
  //
  // ⛔ « your plan is not built to hit it » A ÉTÉ RETIRÉ, ET C'EST UNE
  // CORRECTION DE FAIT, PAS DE TON. La phrase est fausse depuis le 2026-08-18:
  // la cible contraint les GRAMMAGES (`household_portions.ts`, lot L8), donc le
  // plan EST dimensionné dessus. Elle est restée treize jours à l'écran en
  // promettant le contraire de ce que le moteur faisait.
  "meals.energy.target_note":
    "Roughly what a body your size uses in a day. It is not a goal — the day's total sits beside it so you can see where you are, not so you can hit it.",
  // ⟳ LOT 4 — LA MÊME NOTE, QUAND LA FOURCHETTE A SUIVI LA DIRECTION. Elle dit
  // les deux choses que l'autre ne peut plus dire: d'où vient le décalage, et
  // que les portions du plan sont déjà posées dessus — c'est-à-dire qu'il n'y a
  // rien à compter soi-même.
  "meals.energy.target_note_directed":
    "Your weight range, shifted by the pace you set. Your portions are already sized for it — there is nothing to count.",
  "meals.energy.target_no_weight":
    "Add a weigh-in and this becomes a range for your size.",
  "meals.energy.target_implausible_weight":
    "The last weigh-in does not look right, so this is left blank.",
  "meals.energy.target_switch_on": "Show a daily range",
  "meals.energy.target_switch_off": "Hide the daily range",
  "meals.day.mon": "Monday",
  "meals.day.tue": "Tuesday",
  "meals.day.wed": "Wednesday",
  "meals.day.thu": "Thursday",
  "meals.day.fri": "Friday",
  "meals.day.sat": "Saturday",
  "meals.day.sun": "Sunday",
  "meals.slot.breakfast": "Breakfast",
  "meals.slot.snack_am": "Mid-morning",
  "meals.slot.lunch": "Lunch",
  "meals.slot.snack_pm": "Afternoon",
  "meals.slot.dinner": "Dinner",
  "meals.slot.before_bed": "Before bed",
  // LEGACY, gardé exprès. Plus aucun écran ne propose ce créneau, mais des
  // plats déjà composés le portent: le retirer les afficherait « snack », en
  // brut, dans une interface par ailleurs traduite.
  "meals.slot.snack": "Snack",
  // Le créneau NON FIXÉ d'une recette de coach: la bibliothèque de `/app/meals`
  // laisse le moment ouvert, et c'est la seule table qui en a besoin.
  "meals.slot.any_meal": "Any meal",
  // LA CASE. « I ate this » au passé et à la première personne: c'est l'élève
  // qui rapporte un fait, pas le produit qui lui demande de valider une
  // consigne. « Done » aurait fait du dîner une tâche.
  "meals.tick.label": "I ate this",
  "meals.tick.failed": "That did not save. Tap it again.",
  // ── FF-057 §3.A · LE FORMULAIRE ACCIDENT ─────────────────────────────────
  // Il s'ouvre APRÈS que la décoche est écrite, donc il ne demande rien: il
  // propose de préciser. D'où une affirmation en tête et pas une question —
  // « pourquoi ? » ferait d'un fait un interrogatoire, et la fiche mesure
  // exactement ce risque (« si signaler déclenche une procédure, les gens
  // cessent de signaler »).
  //
  // ⚠️ TROIS TUILES, PAS QUATRE. Un quatrième cas se traite par « j'ai mangé
  // autre chose ». Les libellés sont ceux du formulaire de la conversation
  // (`_shared/keel/accident.ts`, COPY.en): même geste, mêmes mots, quel que
  // soit l'endroit d'où on le fait.
  //
  // ⛔ AUCUN JUGEMENT DE VOCABULAIRE. On dit ce qui s'est passé, jamais ce
  // qu'il aurait fallu faire — « cheat meal » et ses voisins sont interdits par
  // le verrou de doctrine, et rien ici ne s'en approche.
  "meals.untick.lead": "That did not happen as planned.",
  "meals.untick.ordered": "I ordered or ate out",
  "meals.untick.no_time": "No time to cook",
  "meals.untick.ate_other": "I ate something else",
  // La sortie. Elle n'écrit rien et c'est une fin normale: la décoche est déjà
  // là. « Leave it » et pas « Cancel » — il n'y a rien à annuler.
  "meals.untick.dismiss": "Leave it",
  // ── LES RAYONS ────────────────────────────────────────────────────────────
  // MOT POUR MOT CEUX DU PDF (`_shared/keel/meal_pdf.ts`), et dans le même
  // ordre. L'élève lit la liste à l'écran, l'imprime, et fait ses courses avec
  // le papier: deux ordres de rayons différents entre les deux, c'est un
  // article qu'on cherche au mauvais bout du magasin.
  "meals.aisle.produce": "Fruit & veg",
  "meals.aisle.protein": "Meat & fish",
  "meals.aisle.dairy": "Dairy",
  "meals.aisle.grains": "Grains & bread",
  "meals.aisle.frozen": "Frozen",
  "meals.aisle.pantry": "Cupboard",
  "meals.aisle.other": "Other",

  // ── LE RYTHME: LES MOMENTS OÙ ON MANGE VRAIMENT ─────────────────────────
  // ⚠️ `meals.rhythm.title` EST CITÉ MOT POUR MOT PAR `meals.picker.no_rhythm`,
  // et c'est le seul renvoi d'écran à écran de ce namespace: la grille des
  // repas dit « règle d'abord les moments où tu manges dans "…" ». Deux
  // formulations différentes envoient l'élève chercher une section qui
  // n'existe pas sous ce nom. Les deux clés changent ensemble, dans les deux
  // langues.
  "meals.rhythm.title": "How your day runs",
  "meals.rhythm.intro":
    "Tick the moments you actually eat on an ordinary day. Your week gets built " +
    "around those — no meal you did not name, and none of yours dropped.",
  "meals.rhythm.size_hint":
    "Size is optional — say it only where it is obviously bigger or smaller " +
    "than the rest of your day.",
  "meals.rhythm.size_label": "Usually",
  "meals.rhythm.save": "Save",
  "meals.rhythm.saving": "…",
  "meals.rhythm.saved": "Saved. Your next plan is built around this.",
  // Le repli EST une décision, et il se dit: sans rythme déclaré, la semaine
  // retombe sur petit-déjeuner/déjeuner/dîner. L'élève doit savoir que c'est
  // une hypothèse, pas son choix.
  "meals.rhythm.none":
    "Nothing ticked. Your week falls back to breakfast, lunch and dinner — the " +
    "ordinary assumption, not something you chose.",
  "meals.rhythm.needs_goal": "Set your goal above first — this is saved alongside it.",
  "meals.rhythm.open": "Change",
  "meals.rhythm.close": "Close",
  "meals.rhythm.summary_none":
    "Not set — your week falls back to breakfast, lunch and dinner.",
  "meals.rhythm.unsaved":
    "Changed but not saved. Your week still runs on what is shown above.",

  // ── LA LISTE DE COURSES, CELLE QU'ON EMPORTE AU MAGASIN ─────────────────
  // ⚠️ « I have it » NE SE PERSISTE PAS, ET LA COPIE DOIT LE DIRE. Cocher raye
  // la ligne et rien de plus: un placard change tous les jours, donc un « j'ai
  // ça » gardé en base prétendrait connaître un état qu'on ne peut pas suivre.
  // Le PDF, lui, est construit côté serveur depuis la ligne en base et ignore
  // les ratures — le découvrir au supermarché devant un PDF qui redemande ce
  // qu'on a déjà serait la trahison qu'un export doit éviter, d'où
  // `meals.shopping.pdf_note` AVANT le clic.
  "meals.shopping.title": "Shopping list",
  "meals.shopping.empty": "Nothing to buy — this week runs on what you already have.",
  "meals.shopping.have": "I have it",
  // Deux formes, et l'anglais n'en distingue qu'une: c'est le français qui met
  // « il reste 1 article » au singulier. `plural()` choisit, `isSingular` sait
  // que le français range aussi le zéro du côté du singulier.
  "meals.shopping.left_one": "{count} left to buy",
  "meals.shopping.left_many": "{count} left to buy",
  "meals.shopping.all_done": "Everything ticked. Nothing left to buy.",
  "meals.shopping.ephemeral":
    "Ticking is just for the shop — it is not saved, and nothing here is remembered as your cupboard.",
  "meals.shopping.pdf": "Save as PDF",
  "meals.shopping.pdf_building": "Preparing…",
  "meals.shopping.pdf_note":
    "The PDF carries the whole list, including what you have ticked off.",
  "meals.shopping.pdf_failed": "That did not work. Try again.",
  // LE LIEN RESTE À L'ÉCRAN une fois le fichier prêt. `window.open` est tenté,
  // mais un navigateur a le droit de le bloquer — et un export silencieusement
  // avalé est pire qu'un export absent: on croit avoir sa liste et on arrive au
  // magasin les mains vides.
  "meals.shopping.pdf_ready": "Your list is ready.",
  "meals.shopping.pdf_download": "Open the PDF",
  // ── LES VAGUES ─────────────────────────────────────────────────────────
  // La raison est la FRAÎCHEUR, et elle est DITE. Une seconde liste sans
  // explication se lit comme une corvée arbitraire — c'est-à-dire comme
  // exactement ce que ce produit promet de retirer.
  "meals.shopping.buy_all_on":
    "Buy it all on {date}: nothing in this plan spoils before it is cooked.",
  "meals.shopping.wave_now": "Buy now",
  "meals.shopping.wave_later": "Buy on {date}",
  "meals.shopping.wave_serves": "so it is fresh for the {day} cooking",
  "meals.shopping.wave_intro":
    "Split by when it has to be fresh: the mid-week meat does not keep from Monday.",

  // ── LA LIGNE D'ATTENTE DU MOTEUR — pas celle de l'écran retiré ─────────
  // `meals.loading` est rendue par `MealBuilder` et `StudentWeekPlanPage`
  // (`/app/plan`) pendant que les plans se chargent. Elle vivait sous l'en-tête
  // `/app/meals`, dont les sept autres clés sont parties le 2026-09-03 (P4);
  // elle, non: retirée, `tsc` rougit sur ses deux appelants.
  "meals.loading": "Loading…",

  // ═════════════════════════════════════════════════════════════════════════
  // /app/health — CE QUE L'ÉLÈVE NE PEUT PAS MANGER
  //
  // La table `student_safety_constraints` alimente la génération de repas, la
  // génération de semaine, le résolveur de substitution et le VERROU DE SORTIE
  // qui remplace tout message où Sophia suggérerait un allergène médical.
  //
  // ⚠️ DEUX PHRASES DE COUVERTURE QUI NE DISENT PAS LA MÊME CHOSE, et la
  // nuance est le contenu. Un allergène du CATALOGUE est reconnu sous ses
  // autres noms (`peanut` couvre « satay », « PB », « nut butter »); une saisie
  // LIBRE n'est reconnue que sous le mot écrit. Ce n'est pas « protégé / non
  // protégé » — le matcher compare toujours le jeton lui-même. Un élève qui
  // croit être couvert sur « fruits de mer » ne relira jamais: les deux
  // phrases doivent rester distinctes dans les deux langues.
  // ═════════════════════════════════════════════════════════════════════════
  "health.title": "What you cannot eat",
  "health.subtitle":
    "Allergies, intolerances, medication. Your coach builds around these, and the chat will never suggest them to you.",
  "health.list.title": "Active",
  "health.list.empty":
    "Nothing declared yet. Add anything that has to stay off your plate.",
  "health.list.declared_by_coach": "Added by your coach",
  "health.list.coverage_full": "Recognised under its other names",
  "health.list.coverage_word_only": "Recognised only as written",
  "health.list.coverage_hint":
    "Written in your own words, so it is matched on that word alone. Your coach can see it and add the standard form.",
  "health.list.retract": "Remove",
  "health.list.retracting": "Removing…",
  "health.add.title": "Add one",
  "health.add.kind_label": "What kind",
  "health.add.what_label": "What exactly",
  "health.add.what_hint": "Pick from the list when it is there — it is matched more widely.",
  "health.add.other_option": "Something else…",
  "health.add.other_label": "Name it",
  "health.add.other_placeholder": "e.g. kiwi",
  "health.add.severity_label": "How strict",
  // ⚠️ « Medical » EST AUSSI LA PASTILLE, et c'est ce qui rend ces trois clés
  // particulières. `health.severity_short.medical` porte le seul mot; l'option
  // du menu porte la phrase entière. La pastille découpait la phrase sur son
  // tiret cadratin (`.split(" — ")[0]`), ce qui marchait tant qu'il n'existait
  // qu'une langue et se serait cassé en silence à la première traduction qui
  // ponctue autrement.
  "health.add.severity_medical": "Medical — never, under any circumstance",
  "health.add.severity_strict": "Strict — I avoid it",
  "health.add.severity_preference": "Preference — I would rather not",
  "health.severity_short.medical": "Medical",
  "health.add.severity_hint":
    "Medical is not just stronger: it is the only one that makes the chat refuse to mention it at all.",
  "health.add.notes_label": "Anything to add (optional)",
  "health.add.notes_placeholder": "e.g. traces are fine, cooked is fine…",
  "health.add.submit": "Add",
  "health.add.saving": "Adding…",
  "health.add.error_no_ref": "Name what has to stay off your plate.",
  "health.add.error_duplicate": "That one is already on your list.",
  "health.kind.allergy": "Allergy",
  "health.kind.intolerance": "Intolerance",
  "health.kind.medical": "Medication",
  "health.kind.religious": "Religious or ethical",
  "health.kind.dislike": "Dislike",
  "health.loading": "Loading…",
  "health.error": "Could not load this. {message}",
  // ── Le titre par défaut d'un plan importé ─────────────────────────────────
  // Il n'est pas une constante technique: le coach le LIT dans le champ « nom
  // du modèle », et s'il n'y touche pas c'est lui qui part en base et que
  // l'élève relit sur son plan. Il était écrit trois fois en dur dans
  // `PlanImportPage`.
  "review.default_template_title": "Imported plan",
  // La TOUCHE, pas le mot. Les deux autres raccourcis de la ligne (a, e) sont
  // des lettres et restent des lettres; celui-ci est un nom de touche, et il
  // n'est pas gravé pareil sur tous les claviers.
  "review.key_delete": "del",
  // Les guillemets entrent dans la VALEUR de la clé: l'anglais cite avec “…”,
  // le français avec «  » et ses espaces intérieures. Écrits dans le JSX, ils
  // resteraient anglais dans les deux langues.
  "review.quote_verbatim": "“{quote}”",

  // ── LES LISTES DE DÉPART: LEUR NOM ET LEUR PHRASE ─────────────────────────
  // `FOOD_PACKS` (_shared/keel/food_packs.ts) garde ses `label`/`blurb` — ils
  // servent aussi côté serveur — et l'écran, lui, lit ces clés-ci, indexées par
  // la clé du pack. Rien dans le code ne relie plus les deux fichiers, donc
  // `pages/coachFoodPacks.int.test.ts` exige que chaque pack du serveur ait ses
  // deux clés dans les DEUX packs de langue: `t()` lève sur une clé inconnue,
  // et c'est la carte entière qui tomberait, pas un mot anglais au milieu.
  //
  // La règle du module vaut mot pour mot pour ces phrases: un pack se nomme par
  // un STYLE (« méditerranéen »), jamais par un RÉSULTAT (« perte de gras ») —
  // c'est la ligne exacte où KEEL deviendrait l'autorité nutritionnelle.
  "coach.food.pack.mediterranean.label": "Mediterranean-leaning",
  "coach.food.pack.mediterranean.blurb":
    "Olive oil, oily fish, pulses and a lot of vegetables. The plates most people picture when they think of eating well without eating strangely.",
  "coach.food.pack.simple_high_protein.label": "Simple and high-protein",
  "coach.food.pack.simple_high_protein.blurb":
    "A protein on every plate, a starch that survives being cooked plainly, and vegetables that do not need a recipe. Built for people who cook the same six things.",
  "coach.food.pack.minimal_cooking.label": "Minimal cooking",
  "coach.food.pack.minimal_cooking.blurb":
    "Tins, jars and things that need three minutes or none. For students whose real obstacle is the stove, not the willpower.",
  "coach.food.pack.plant_forward.label": "Plant-forward",
  "coach.food.pack.plant_forward.blurb":
    "Pulses, soy and grains carry the plate; eggs and dairy still have a place. Not a vegan list — a list where the vegetables are not a side.",

  // ── C8 — LE JOURNAL ALIMENTAIRE DE L'ÉLÈVE, LU PAR SON COACH ──────────────
  // Tout ce bloc était écrit en dur dans `CoachStudentPage`, y compris le
  // pluriel (`> 1 ? "s" : ""`), qui est la règle anglaise et qui est fausse en
  // français. Une lecture ratée dit qu'elle a raté: « rien noté » et « nous
  // n'avons pas pu lire » sont deux phrases différentes.
  "coach.student.food.load_error": "The food journal could not be loaded just now.",
  "coach.student.food.title": "On the plate — last 7 days",
  "coach.student.food.empty":
    "No meals read this week. The Monday page tells you if they have gone quiet everywhere, not just here.",
  // Les deux nombres s'accordent SÉPARÉMENT, donc chacun traverse le seed avec
  // ses deux formes avant d'entrer dans la phrase. Un gabarit unique demanderait
  // quatre combinaisons à garder d'accord.
  "coach.student.food.summary":
    "{meals} across {days} · vegetables at {vegetables} · protein at {protein} · fruit at {fruit}.",
  "coach.student.food.meal_value": "{count} meal",
  "coach.student.food.meals_value": "{count} meals",
  // FF-009: trois comptes, jamais additionnés, et aucune étiquette de valeur.
  "coach.student.food.counts":
    "Ticked as planned: {ticked} · eaten off plan: {offPlan} · photographed: {photographed}.",
  "coach.student.food.seen_most": "Seen most: {list}",
  "coach.student.food.also_seen": "Also: {list}",
  "coach.student.food.dinners_large": "Dinners ran large {large} of {total} nights.",
  // Trois clés et pas une phrase à trou: les trois tournures ne partagent ni
  // leur verbe ni leur ordre une fois traduites.
  "coach.student.food.veg_trend_up": "More vegetables than the week before.",
  "coach.student.food.veg_trend_down": "Fewer vegetables than the week before.",
  "coach.student.food.veg_trend_flat": "About the same vegetables as the week before.",
  "coach.student.food.footnote":
    "Frequency read of their photo log — the same numbers they see. The photos themselves stay with the student.",

  // ── C8 — LES FOURCHETTES DE DÉPART, CÔTÉ COACH SEULEMENT ──────────────────
  // Une fourchette montrée à un élève devient une cible; celle-ci ne quitte pas
  // l'écran du coach, et la dernière phrase le dit.
  "coach.student.numbers.title": "Starting numbers",
  "coach.student.numbers.empty":
    "No weigh-in yet. Ranges appear after their first Sunday check-in with a weight.",
  // Étiquette et valeur sont deux clés: c'est une pastille de statistique, et la
  // valeur porte le gras parce que c'est elle qu'on vient lire. L'unité vit DANS
  // la valeur — « kcal/day » est un mot, pas un symbole SI.
  "coach.student.numbers.maintenance_label": "Maintenance ≈",
  "coach.student.numbers.maintenance_value": "{low}–{high} kcal/day",
  "coach.student.numbers.protein_label": "Protein ≈",
  "coach.student.numbers.protein_value": "{low}–{high} g/day",
  "coach.student.numbers.footnote":
    "Computed from their {weight} kg weigh-in alone — no height, age or activity in the math, so treat it as the bracket you would open, not the number you would prescribe. Never derived from photos, and the student never sees these figures.",
  // ══ LE VOCABULAIRE DES OBJECTIFS — UNE TABLE, PAS TROIS ═══════════════════
  // `coachDoctrine.ts` portait un `GOAL_LABELS` figé (« Losing fat »,
  // « Gaining muscle ») pendant que le seed portait déjà `coach.protocol.goal.*`
  // (« Fat loss », « Muscle gain ») pour les mêmes jetons. Un coach lisait donc
  // deux mots pour le même objectif selon l'écran. Les six vivent ici, sous un
  // préfixe qui n'appartient à AUCUN écran, et `goalLabel()` est leur seul
  // lecteur.
  //
  // ⚠️ À SUPPRIMER EN MÊME TEMPS QUE CE BLOC EST COLLÉ — les six doublons:
  //   "coach.protocol.goal.fat_loss", "coach.protocol.goal.muscle_gain",
  //   "coach.protocol.goal.recomposition", "coach.protocol.goal.performance",
  //   "coach.protocol.goal.health", "coach.protocol.goal.maintenance".
  // `coach.protocol.goal.all` et `coach.protocol.goal.limit` RESTENT: ce sont
  // deux options du sélecteur, pas des objectifs.
  //
  // `household.goal.*` reste aussi, et c'est voulu: elle s'adresse à l'ÉLÈVE
  // dans son foyer, autre lecteur, autre registre.
  "coach.goal.fat_loss": "Fat loss",
  "coach.goal.muscle_gain": "Muscle gain",
  // « Recomposition » est du jargon: le coach connaît le mot, mais il choisit
  // ici pour des élèves, et le mot ne dit pas ce que l'objectif fait. Le
  // libellé porte donc la signature de l'objectif — le poids tient, la
  // silhouette change — qui est aussi ce que le générateur mesure.
  "coach.goal.recomposition": "Same weight, different shape",
  "coach.goal.performance": "Performance",
  "coach.goal.health": "Health",
  "coach.goal.maintenance": "Maintenance",
  // Une portée vide est une VALEUR, pas un vide: c'est le cas de l'écrasante
  // majorité des entrées, et un coach ne doit pas croire qu'il a laissé son
  // travail inachevé.
  "coach.goal.everyone": "Everyone",
  "coach.goal.none": "No goal set yet",

  // ══ FF-001 · CE QU'UNE PRATIQUE ATTEINT, ET POURQUOI ELLE EST BLOQUÉE ══════
  // Ces sept phrases étaient en dur dans `api/dailyPractices.ts` — un catalogue
  // parallèle qu'aucune garde de `t()` ne voyait.
  //
  // ⚠️ PRÉFIXE `coach.practice.*` AU SINGULIER, exprès: `coach.practices.*`
  // (avec un S) est la CARTE de l'écran, déjà livrée, et fusionner les deux
  // ferait passer une phrase d'API pour un libellé d'écran.
  "coach.practice.reach.blocked": "Nobody — this one is blocked",
  "coach.practice.reach.needs_review": "Nobody yet — it is waiting for your review",
  // ⚠️ UNE CLÉ À TROU, PAS UNE CONCATÉNATION. `${who}, adults only` imposait
  // l'ordre anglais à toutes les langues; le trou laisse la traduction replacer
  // le complément où sa grammaire le veut.
  "coach.practice.reach.adults_only": "{who}, adults only",
  // R9: on bloque uniquement en collision avec une ceinture existante, ET ON LA
  // NOMME. Un blocage muet se vit comme de l'arbitraire.
  "coach.practice.blocked.weight_readout":
    "This asks students to read a scale. The product suspends weight readouts for students showing signs of restrictive eating, so it cannot also send this every evening.",
  "coach.practice.blocked.calorie_readout":
    "This asks students to count calories. The product suspends calorie readouts for students showing signs of restrictive eating, so it cannot also send this every evening.",
  "coach.practice.blocked.streak_display":
    "This is a streak. The product never shows students a streak — a missed day is not a failure, and a chain makes it one.",
  "coach.practice.blocked.adherence_score":
    "This asks students to score their own compliance. The product never puts an adherence score in front of a student.",

  // ══ `/coach/doctrine` — L'ÉCRAN ═══════════════════════════════════════════
  "coach.doctrine.title": "Doctrine",
  "coach.doctrine.loading": "Loading…",
  // « on n'a pas pu lire » et « tu n'as rien écrit » sont deux phrases
  // différentes, et montrer la seconde pour la première invite un coach à
  // réécrire ce qu'il a déjà écrit.
  "coach.doctrine.load_failed": "We could not read your doctrine.",
  // Partagée par la page et par la modale d'amorçage: un même échec ne doit pas
  // se dire de deux façons à deux endroits du même écran.
  "coach.doctrine.action_failed": "That did not go through.",

  "coach.doctrine.what.title": "What this is",
  "coach.doctrine.what.body":
    "Your agent answers your students in your method and your voice. It learns that here — from where you stand on your field's real arguments, from something you have already written, or from an interview. Never by asking you to write a prompt. Nothing reaches a student until you publish it.",
  "coach.doctrine.live_badge": "Live",
  "coach.doctrine.live_version": "v{version} — published {date}",
  "coach.doctrine.none_badge": "Nothing published",
  "coach.doctrine.none_body":
    "Until you publish, your agent stays deliberately cautious: it sticks to what your protocol already says and defers the rest to you.",

  // Le sas d'amorçage ne prend la page QUE sur un brouillon vide.
  "coach.doctrine.your_method": "Your method",
  "coach.doctrine.what_i_understood": "What I understood",
  "coach.doctrine.empty.house":
    "You have not written one — your students are followed by Sophia's method, and your agent signs “Sophia”. Write your own whenever you want it to speak in your name.",
  "coach.doctrine.empty.own":
    "There is nothing here yet, so your agent has no method of yours to carry. There are four ways to get one, and the quickest takes about two minutes.",
  "coach.doctrine.empty.cta_house": "Write my own method",
  "coach.doctrine.empty.cta_own": "Create my method",

  // « Create » plutôt que « Start over »: le second se lit comme un bouton qui
  // efface, au-dessus du travail d'un coach, alors que rien n'est détruit tant
  // qu'il n'a pas relu et enregistré.
  "coach.doctrine.create_new": "Create a new one",
  "coach.doctrine.loaded_published":
    "This is what your agent is using right now, and you can edit it here. Saving creates a new version; your students keep reading this one until you publish the new one.",
  "coach.doctrine.loaded_draft":
    "This is your latest saved version. It is not published, so your agent is not using it yet.",
  "coach.doctrine.compiled_note":
    "Nothing here is saved yet. If a line is not yours, it should not be here — change it, or delete it.",
  // La délégation se dit AU-DESSUS de la méthode qu'elle met en sommeil: l'écran
  // affiche une doctrine que personne ne lit, et le taire ferait croire au coach
  // que ses élèves reçoivent ceci.
  "coach.doctrine.dormant_title": "Nobody is reading this right now.",
  "coach.doctrine.dormant_body":
    "Your students are followed by Sophia's method and your agent signs “Sophia”. Everything below is kept exactly as you left it — take it back from the button above whenever you want.",
  // ⚠️ DEUX CLÉS, PARCE QUE L'EMPHASE PORTE UNE PHRASE. Le JSX écrivait « goes
  // to <strong>every</strong> student »: trois morceaux dont l'ordre est celui
  // de l'anglais, donc irrecollables ailleurs. Le gras porte la première phrase.
  "coach.doctrine.global_scope_lead": "Everything in this card goes to every student.",
  "coach.doctrine.global_scope_body":
    "Your voice, your words and your red lines are you — they are never narrowed to one kind of student.",

  // LE COMPTEUR DE PRÉRÉGLAGE. Il ne bloque rien — publier un préréglage intact
  // est la décision du coach — mais il ne doit pas pouvoir le faire SANS LE
  // SAVOIR: deux coachs qui n'ont rien retouché ont le même agent.
  "coach.doctrine.starter.count": "{total} of {entries} lines above are still word-for-word ours.",
  "coach.doctrine.starter.body":
    "They work — but another coach who picked the same answers has the same sentences.",
  "coach.doctrine.starter.forbidden_first":
    "Start with the “instead” lines: that is the exact text your students read.",
  "coach.doctrine.starter.rewrite_three":
    "Rewriting even three of them in your own words is what makes the agent sound like you.",

  "coach.doctrine.saving": "Saving…",
  "coach.doctrine.save_draft": "Save as draft",
  "coach.doctrine.unsaved": "You have changes that are not saved yet.",
  "coach.doctrine.all_saved": "Everything here is saved.",
  "coach.doctrine.saved_notice": "Saved as a draft. It is not live until you publish it.",
  "coach.doctrine.published_notice": "v{version} is live. Your students' next message uses it.",
  // Nommé précisément: un retour arrière COPIE dans une version neuve. « Revenu
  // à la v1 » décrirait un historique que le produit ne garde pas.
  "coach.doctrine.rollback_notice": "Copied v{from} into v{to}. Publish it to make it live.",
  "coach.doctrine.delegated_notice":
    "Done. Your students are now followed by Sophia's method, and your agent signs “{name}” from their next message on. Nothing you wrote was deleted.",
  "coach.doctrine.reclaimed_notice":
    "Done. Your agent signs “{name}” again and serves your own published method.",
  // Le repli quand le serveur ne rend pas de nom. « Sophia » est un nom propre
  // et reste dans le code; celui-ci est une phrase.
  "coach.doctrine.your_name": "your name",

  "coach.doctrine.versions.title": "Versions",
  "coach.doctrine.versions.empty": "No version yet. Anything you save above creates the first one.",
  "coach.doctrine.draft_badge": "Draft",
  "coach.doctrine.versions.copied_from": "copied from v{version}",
  "coach.doctrine.versions.publish": "Publish",
  "coach.doctrine.versions.rollback": "Go back to this",

  // Les briques d'édition, partagées par toutes les sections.
  "coach.doctrine.row_remove": "Remove",
  // Le MOT à côté du crayon: une icône seule ne se voit pas — c'est le reproche
  // exact qui a produit ce contrôle.
  "coach.doctrine.section_edit": "Edit",
  "coach.doctrine.section_done": "Done",
  "coach.doctrine.section_cancel": "Cancel",
  "coach.doctrine.nothing_here_yet": "Nothing here yet.",

  // Les convictions et les cas durs. Mêmes clés pour la partie GLOBALE et pour
  // chaque dynamique: c'est la même donnée, seule la portée change.
  "coach.doctrine.beliefs.title": "What you believe",
  "coach.doctrine.beliefs.hint_global":
    "One conviction per line. The 'why' is what lets your agent explain instead of assert.",
  "coach.doctrine.beliefs.hint_goal": "Only students on {goal} will ever read these.",
  // ⚠️ LA PHRASE DU VIDE ÉTAIT CASSÉE, pas seulement intraduisible: elle valait
  // `…that you'd tell ${GOAL_LABELS[goal].toLowerCase()}?`, soit « what do you
  // believe that you'd tell losing fat? ». On parlait à un OBJECTIF.
  "coach.doctrine.beliefs.empty_global":
    "Nothing yet — what do you believe that you'd tell every student?",
  "coach.doctrine.beliefs.empty_goal":
    "Nothing yet — what do you believe that you'd tell a student on {goal}?",
  "coach.doctrine.beliefs.rationale_label": "Why (optional)",
  "coach.doctrine.beliefs.add": "Add a conviction",

  "coach.doctrine.answers.title": "How you answer",
  "coach.doctrine.answers.hint_global":
    "The situation, and your sentence — word for word. It is what makes the agent sound like you.",
  "coach.doctrine.answers.hint_goal": "The hard cases that only come up with {goal} students.",
  "coach.doctrine.answers.empty":
    "Nothing yet — add a hard case and the answer you give, word for word.",
  "coach.doctrine.answers.situation_label": "When a student…",
  "coach.doctrine.answers.answer_label": "You answer, word for word",
  "coach.doctrine.answers.add": "Add a hard case",

  "coach.doctrine.forbidden.title": "What your agent must never say",
  "coach.doctrine.forbidden.hint":
    "A token your code can branch on, the phrasings a model would actually write, and — the important one — what you say INSTEAD. Without an 'instead', a student gets a flat refusal rather than your answer.",
  "coach.doctrine.forbidden.empty":
    "Nothing yet — what would you be embarrassed to see your agent say?",
  // ⚠️ PAS D'ESPACE DE BORD: elle valait « — instead: … » avec une espace de
  // tête, que `parity.int.test.ts` interdit. L'espace est repassée dans le JSX.
  "coach.doctrine.forbidden.summary_instead": "— instead: “{instead}”",
  "coach.doctrine.forbidden.summary_no_instead": "— no replacement set",
  "coach.doctrine.forbidden.token_label": "The thing itself",
  // Un exemple de jeton, pas un jeton: le coach tape le sien, dans sa langue.
  "coach.doctrine.forbidden.token_placeholder": "six_small_meals",
  "coach.doctrine.forbidden.forms_label": "How people actually write it (comma-separated)",
  "coach.doctrine.forbidden.forms_placeholder": "6 petits repas, six small meals, grazing all day",
  "coach.doctrine.forbidden.reason_label": "Why you refuse it (optional)",
  "coach.doctrine.forbidden.instead_label":
    "What you say INSTEAD — this exact text reaches your students",
  "coach.doctrine.forbidden.no_instead_warning":
    "No replacement set — students get a flat refusal here.",
  "coach.doctrine.forbidden.add": "Add a red line",

  "coach.doctrine.vocabulary.title": "Your words",
  "coach.doctrine.vocabulary.hint": "The terms that are yours, and what they mean exactly.",
  "coach.doctrine.vocabulary.empty": "Nothing yet — which words are yours?",
  "coach.doctrine.vocabulary.term_label": "The word",
  "coach.doctrine.vocabulary.meaning_label": "What it means",
  "coach.doctrine.vocabulary.add": "Add a word",

  "coach.doctrine.foods.title": "Foods you keep off the plate",
  "coach.doctrine.foods.hint":
    "Give the phrasings too — 'seed oil' almost never appears as those two words in a real sentence, and a bare term is a filter that catches nothing. What you BUILD with is set on your Recommended food screen, not here.",
  "coach.doctrine.foods.empty": "Nothing yet — anything you never want on a plate?",
  "coach.doctrine.foods.summary_also": "— also: {forms}",
  "coach.doctrine.foods.summary_no_forms": "— no phrasings, hard to catch",
  "coach.doctrine.foods.term_label": "Food",
  "coach.doctrine.foods.forms_label": "How people write it (comma-separated)",
  "coach.doctrine.foods.add": "Add a food",

  "coach.doctrine.qa.title": "What you have already answered",
  "coach.doctrine.qa.empty": "Nothing yet — what do your students ask over and over?",
  "coach.doctrine.qa.question_label": "They ask",
  "coach.doctrine.qa.answer_label": "You answer",
  "coach.doctrine.qa.add": "Add a question",

  "coach.doctrine.voice.title": "Your voice",
  "coach.doctrine.voice.empty": "Nothing set — your agent picks its own register.",
  "coach.doctrine.voice.address_label": "How you address them (tu / vous)",
  // ⚠️ L'EXEMPLE `fr-FR` ENTRE DANS LE SEED AVEC SA PHRASE. Écrit dans le JSX,
  // c'était un tag de locale en dur hors de `keel/i18n/` — la règle
  // LOCALE_LITERAL de `scripts/ci/i18n-lint.mjs`.
  "coach.doctrine.voice.language_label": "Language you write in (e.g. fr-FR)",
  "coach.doctrine.voice.length_label": "Length",
  "coach.doctrine.voice.length_short": "Short — two or three sentences",
  "coach.doctrine.voice.length_medium": "A short paragraph",
  "coach.doctrine.voice.emojis_label": "Emojis",
  "coach.doctrine.voice.emojis_none": "None",
  "coach.doctrine.voice.emojis_light": "At most one",
  // Le résumé de lecture: des fragments joints par « · ». Minuscules exprès —
  // ce sont des morceaux de phrase, pas des libellés de champ.
  "coach.doctrine.voice.summary_address": "you say “{address}”",
  "coach.doctrine.voice.summary_short": "short replies",
  "coach.doctrine.voice.summary_medium": "a short paragraph",
  "coach.doctrine.voice.summary_no_emojis": "no emojis",
  "coach.doctrine.voice.summary_one_emoji": "at most one emoji",
  "coach.doctrine.voice.summary_language": "written in {language}",

  "coach.doctrine.specific.title": "Specific to one kind of student",
  // Même découpe que la carte globale: le gras portait « only » au milieu.
  "coach.doctrine.specific.lead": "What you write here reaches only students on that goal.",
  "coach.doctrine.specific.body":
    "Everything else you wrote above still reaches them too — this adds, it never replaces.",

  // FF-041 — le débat de composition. Le coach voit des POSITIONS et ce
  // qu'elles produisent; jamais un axe, jamais un chiffre.
  "coach.doctrine.composition.title": "How you compose a plate",
  "coach.doctrine.composition.hint":
    "Four questions about your method. Your students never see any of this — they see the food.",
  "coach.doctrine.composition.empty": "Nothing set — Sophia composes in her default order.",

  // ══ LA MODALE D'AMORÇAGE — LES QUATRE FAÇONS DE COMMENCER ═════════════════
  // L'ordre n'est pas une préférence: (a) les débats, (b) le document,
  // (c) l'entretien, (d) la délégation EN DERNIER — c'est le repli, pas le
  // raccourci recommandé, et le produit se vend sur « c'est MON agent ».
  "coach.doctrine.start.title": "Where your method comes from",
  "coach.doctrine.start.subtitle":
    "Four ways in. Nothing here is saved, and nothing reaches a student until you publish.",
  "coach.doctrine.start.close": "Close",
  "coach.doctrine.start.house_now":
    "Your students are being followed by Sophia's method right now, and your agent signs “Sophia”.",
  "coach.doctrine.start.house_takeback":
    "Writing your own below takes it back: publish it and your agent signs your name again.",

  "coach.doctrine.start.forks.title": "Answer a short questionnaire",
  "coach.doctrine.start.forks.who":
    "Ten things coaches disagree about, plus a few lines in your own words. Fastest way in.",
  "coach.doctrine.start.forks.body":
    "Tap the side that is yours, and skip the ones you have no rule about. Skipping is an answer: your agent then says nothing on that subject rather than guessing.",
  "coach.doctrine.start.forks.replaces_lead":
    "This writes a new method and replaces what you have.",
  "coach.doctrine.start.forks.replaces_body":
    "To add to what is already there, close this and use the pencils on your method instead.",
  "coach.doctrine.start.forks.voice_title": "How you talk",
  "coach.doctrine.start.forks.writing": "Writing your method…",
  "coach.doctrine.start.forks.cta": "Write my method",
  "coach.doctrine.start.forks.need_one": "Tap where you stand on at least one question.",
  "coach.doctrine.start.forks.need_voice":
    "We need a couple of lines in your own words — that is the whole point.",
  // ⚠️ DEUX FORMES LUES, JAMAIS UN « s » FABRIQUÉ: `plural()` choisit, et le
  // français met le singulier jusqu'à 2. Le trou est dans les deux.
  "coach.doctrine.start.forks.answered_one":
    "{count} question answered. The rest stay blank, and that is fine.",
  "coach.doctrine.start.forks.answered_many":
    "{count} questions answered. The rest stay blank, and that is fine.",
  "coach.doctrine.start.forks.notice":
    "Read it back. These are your positions — but the words are ours until you rewrite them, and that is what the counter above the save button is telling you.",
  // Deux codes serveur qui ne veulent rien dire pour un coach. Ils ne disent PAS
  // la même chose, mais dans les deux cas la seule action utile est de relancer.
  "coach.doctrine.start.forks.tripped_lock":
    "What came back contradicted one of your own red lines, so we threw it away rather than write it down. Press the button again — it will come out differently.",
  "coach.doctrine.start.forks.garbled":
    "That one came back garbled and we dropped it. Press the button again.",

  "coach.doctrine.start.document.title": "Start from something you already wrote",
  "coach.doctrine.start.document.who":
    "Your ebook, your method handbook, the FAQ you send new clients.",
  "coach.doctrine.start.document.body":
    "It is read once, and what comes out lands in your method for you to check — nothing is saved and nothing reaches a student until you publish.",
  "coach.doctrine.start.document.own_lead": "Upload your own material.",
  "coach.doctrine.start.document.own_body":
    "A textbook someone else wrote would put another author's positions in your agent's mouth, under your name.",
  "coach.doctrine.start.document.choose": "Choose a PDF",
  "coach.doctrine.start.document.clear": "Clear",
  "coach.doctrine.start.document.limits": "PDF, up to {mb} MB and {pages} pages.",
  "coach.doctrine.start.document.reading": "Reading it…",
  "coach.doctrine.start.document.add_cta": "Add to what I have",
  "coach.doctrine.start.document.replace_cta": "Start over from this document",
  "coach.doctrine.start.document.effect":
    "Adding keeps every sentence you already have and only fills the gaps — upload your documents one after another. Starting over replaces all of it.",
  "coach.doctrine.start.document.read_cta": "Read my document",
  "coach.doctrine.start.document.slow":
    "A long document takes up to two minutes. Leave this tab open.",
  "coach.doctrine.start.document.need_file": "Choose a PDF first.",
  "coach.doctrine.start.document.notice_one":
    "Read {count} page. Check it back before saving — the AI transcribes, it does not decide.",
  "coach.doctrine.start.document.notice_many":
    "Read {count} pages. Check it back before saving — the AI transcribes, it does not decide.",
  "coach.doctrine.start.document.foods_one":
    "{count} food from it is waiting on your Recommended food screen.",
  "coach.doctrine.start.document.foods_many":
    "{count} foods from it are waiting on your Recommended food screen.",

  "coach.doctrine.start.interview.title": "Answer the full interview",
  "coach.doctrine.start.interview.who":
    "Eleven questions in your own words. The longest way, and the one that sounds most like you.",
  "coach.doctrine.start.interview.body":
    "Three of them ask for your sentence, word for word — that is what makes the agent sound like you rather than like a nutrition textbook.",
  "coach.doctrine.start.interview.replaces_lead": "This one replaces everything you have.",
  "coach.doctrine.start.interview.replaces_body":
    "Use it to rethink your method, not to fix a sentence — to fix a sentence, close this and edit it directly.",
  "coach.doctrine.start.interview.word_for_word": "Word for word.",
  "coach.doctrine.start.interview.reading": "Reading you…",
  "coach.doctrine.start.interview.cta": "Turn this into my method",
  // ⚠️ C'ÉTAIT UN CODE, ET LE COACH LE LISAIT TEL QUEL. Le composant levait
  // `new Error("answer_at_least_one_question")` et la carte d'échec affichait
  // `err.message` mot pour mot.
  "coach.doctrine.start.interview.need_one":
    "Answer at least one question before we can read you.",
  "coach.doctrine.start.interview.notice":
    "Read it back before saving — the AI transcribes, it does not decide.",

  // ⚠️ CE QUE CE CHEMIN NE DOIT JAMAIS DIRE: « ta méthode, prête à l'emploi ».
  // Le coach doit comprendre AVANT de cliquer que l'agent ne parlera pas en son
  // nom — c'est la promesse sur laquelle repose le produit entier.
  "coach.doctrine.start.delegate.title": "Let Sophia handle it",
  "coach.doctrine.start.delegate.who":
    "For a gym owner, or anyone who wants the service without a position to defend. No questions, one click.",
  "coach.doctrine.start.delegate.body":
    "Your students are followed by Sophia's method, and it says so: your agent signs “Sophia”, not your name.",
  "coach.doctrine.start.delegate.tradeoff":
    "This is not your method with the work done for you — it is a stand-in, and your students see it as one. In exchange you have nothing to write and nothing to keep up to date.",
  "coach.doctrine.start.delegate.effect":
    "It replaces the whole source while it is on. Anything you have written stays exactly where it is — it just stops being read — and comes back the moment you switch off.",
  "coach.doctrine.start.delegate.switching": "Switching…",
  "coach.doctrine.start.delegate.take_back": "Take it back — sign my own name",
  "coach.doctrine.start.delegate.take_back_note":
    "Your students go back to your own published method. If you have not published one, your agent answers from general knowledge and never in your name.",
  "coach.doctrine.start.delegate.hand_over": "Hand it to Sophia",
  "coach.doctrine.start.delegate.hand_over_note":
    "Takes effect on your students' next message. You can take it back at any time.",

  // ══════════════════════════════════════════════════════════════════════════
  // LOT 6 · `/app/progress` — L'AVANCÉE DE L'ÉLÈVE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ LE NAMESPACE S'APPELLE `student_progress` ET PAS `progress`, ET CE N'EST
  // PAS UN CAPRICE. `progress.*` existe déjà: 36 clés qui servent
  // `pages/ProgressPage.tsx`, que PLUS AUCUN fichier du dépôt n'importe. Il est
  // ORPHELIN et non traduit (voir `PENDING_TRANSLATION_NAMESPACES` dans
  // catalog.ts). Y ajouter les clés de l'écran VIVANT aurait forcé à traduire
  // les 36 mortes avec elles — c'est-à-dire à payer de la traduction pour un
  // écran qui n'existe plus, pour la seule raison qu'il a pris le joli nom.
  // Le nom retenu est celui du composant qui les rend, comme `week.*` au lot 5.
  //
  // La suppression de `progress.*` et de `pages/ProgressPage.tsx` est un geste
  // à part, sur un dépôt partagé. Elle est SIGNALÉE, pas faite ici.
  "student_progress.title": "My progress",
  "student_progress.loading": "Loading…",
  "student_progress.error": "We could not load your data.",
  // Doctrine W3.2 — aucun chiffre affiché quand le plancher TCA est levé. On ne
  // dit pas POURQUOI: nommer le drapeau serait un diagnostic posé par une
  // machine.
  "student_progress.restricted":
    "We are setting the numbers aside for now. What matters this week is how you feel — and your coach knows.",
  "student_progress.range_week": "7 days",
  "student_progress.range_month": "30 days",

  // ── 1. LA RÉGULARITÉ — la seule métrique dont ce dépôt a la preuve ────────
  "student_progress.consistency.label": "Your consistency",
  "student_progress.consistency.out_of": "/ {total} days",
  "student_progress.consistency.hint":
    "This is the thing that matters most, by a distance. Not how perfect the days were — the fact that they got logged at all.",

  // ── 2. LA VIVABILITÉ — les taps du soir ──────────────────────────────────
  "student_progress.pulse.label": "How it went",
  "student_progress.pulse.empty": "No evening check-ins in this period yet.",
  "student_progress.pulse.good": "{count} all good",
  "student_progress.pulse.mixed": "{count} so-so",
  "student_progress.pulse.hard": "{count} rough",
  // La phrase est coupée en deux parce que l'axe porte le gras. Deux clés et
  // pas une interpolation: `t()` rend une chaîne, pas du JSX.
  "student_progress.pulse.dominant_label": "When it is hard, it is most often",
  // ⚠️ CES TROIS AXES NE SONT PAS LES SIX DU DIMANCHE. La colonne
  // `student_daily_checkins.axis` porte un CHECK sur ('energy','hunger','sleep')
  // — c'est le tap du soir, trois valeurs, et sa forme est celle d'un mot DANS
  // une phrase. `chat.weekly.axis.*` porte les six du point hebdomadaire, sous
  // leur forme de TITRE (« Day-to-day energy »); les confondre donnerait « c'est
  // le plus souvent L'énergie au quotidien ».
  "student_progress.axis.energy": "energy",
  "student_progress.axis.hunger": "hunger",
  "student_progress.axis.sleep": "sleep",

  // ── 3bis. LA SEMAINE DANS L'ASSIETTE ─────────────────────────────────────
  "student_progress.food.label_week": "Your week in food",
  "student_progress.food.label_month": "Your month in food",
  "student_progress.food.empty":
    "No photos read in this period yet. Send a plate in Chat and it starts adding up here.",
  // Les deux nombres portent le gras, donc la phrase est composée de deux
  // morceaux qui s'accordent CHACUN avec son compte — « 1 repas noté sur
  // 3 jours ». Un seul gabarit à quatre trous ne saurait pas accorder les deux.
  "student_progress.food.meals_one": "{count} meal logged",
  "student_progress.food.meals_many": "{count} meals logged",
  "student_progress.food.across": "across",
  "student_progress.food.days_one": "{count} day",
  "student_progress.food.days_many": "{count} days",
  // Des COMPTES, jamais des pourcentages: « at 9 of 13 meals » décrit, « 69 % »
  // note. Le produit ne note personne.
  "student_progress.food.groups":
    "Vegetables at {veg} of {meals} meals · protein at {protein} · fruit at {fruit}.",
  // FF-009 — LES TROIS COMPTES, CÔTE À CÔTE ET JAMAIS ADDITIONNÉS. Une coche est
  // exacte, une photo est biaisée, un repas hors plan est autre chose.
  "student_progress.food.three_counts":
    "Ticked as planned: {ticked} · eaten off plan: {offPlan} · photographed: {photographed}.",
  "student_progress.food.seen_most": "Seen most: {list}",
  // Un COMPTE, pas un commentaire: « Fried food ×3 » est un fait, la morale
  // reste chez le coach.
  "student_progress.food.also": "Also this period: {list}",
  "student_progress.food.dinners_large": "Dinners ran large {large} of {total} nights.",
  "student_progress.food.missing_days": "Nothing logged on {days}.",
  "student_progress.food.veg_up": "More vegetables than the week before.",
  "student_progress.food.veg_down": "Fewer vegetables than the week before.",
  "student_progress.food.veg_same": "About the same vegetables as the week before.",
  "student_progress.food.footnote":
    "Counts from your photos — what showed up, and how often. No calories here: the logging itself is what moves the needle.",

  // ── 3bis-b. LE JOURNAL — ce que l'élève a mangé, nommément ───────────────
  "student_progress.ate.label": "What you ate",
  "student_progress.ate.empty":
    "Nothing logged in this period yet. Send a plate in Chat, or just tell me what you had — both end up here.",
  "student_progress.ate.unreadable": "logged, nothing readable in the photo",
  "student_progress.ate.footnote":
    "This is what was read from your photos and from what you told me. If something is wrong, say so in Chat and it gets corrected on the spot.",
  // ⚠️ `unclear` N'A PAS DE MOT, ET C'EST LA DÉCISION. Dire « portion peu
  // claire » à quelqu'un qui vient de photographier son assiette n'ajoute rien
  // et sonne comme un reproche: on se tait sur la taille et on garde les
  // aliments, qui eux sont lus. Le mot entier (et pas un adjectif à interpoler)
  // parce que l'adjectif français s'accorde et se place autrement.
  "student_progress.band.small": "small portion",
  "student_progress.band.moderate": "regular portion",
  "student_progress.band.large": "large portion",

  // ── 3ter. LE RYTHME — la même semaine sur l'axe du TEMPS ────────────────
  "student_progress.rhythm.label": "Your rhythm",
  "student_progress.rhythm.empty":
    "Nothing logged in this period yet. Tell me what you ate in Chat, or send a plate — both land here.",
  "student_progress.rhythm.cell_empty": "nothing logged",
  "student_progress.rhythm.cell_count": "{count} logged",
  "student_progress.rhythm.busiest_label": "Most of what you log lands in the",
  // On le DIT plutôt que de ranger ces faits dans une case au hasard: une
  // grille qui invente un horaire est pire qu'une grille incomplète.
  "student_progress.rhythm.unplaced_one":
    "{count} log without a time of day — not placed above.",
  "student_progress.rhythm.unplaced_many":
    "{count} logs without a time of day — not placed above.",
  "student_progress.rhythm.footnote":
    "The block size is how big the plate looked — small, regular or large. That is the whole scale, and it is deliberately the whole scale: a number here would be wrong in a direction we can predict.",

  // ── 3. LES PORTIONS — « beaucoup ou peu », sans un kcal ─────────────────
  "student_progress.plates.label": "Your plates",
  "student_progress.plates.empty": "No photos read in this period.",
  "student_progress.plates.line_one":
    "{count} plate: {small} small, {moderate} regular, {large} large",
  "student_progress.plates.line_many":
    "{count} plates: {small} small, {moderate} regular, {large} large",
  "student_progress.plates.unclear_suffix": ", {count} unclear",

  // ── 4. LE POIDS, EN DERNIER ─────────────────────────────────────────────
  // Arbitrage produit du 2026-08-03: affiché en clair, mais il ne mène JAMAIS —
  // la variation d'eau quotidienne dépasse le signal hebdomadaire, et c'est la
  // métrique la plus associée aux troubles alimentaires.
  "student_progress.weight.label": "Your weight",
  "student_progress.weight.empty":
    "No weight in this period yet. You enter it in the Sunday check-in.",
  "student_progress.weight.delta": "{delta} kg over the period",
  "student_progress.weight.footnote":
    "One weigh-in a week, read as a line and not as a number: day to day, water moves the scale more than a whole week of eating does.",

  // ── 5. LES SÉANCES — UN COMPTE, ET RIEN QUI EN DÉRIVE (L2b, 2026-08-18) ──
  //
  // ⚠️ LE PRÉFIXE EST `student_progress.` ET PAS `progress.`, POUR LA RAISON
  // ÉCRITE EN TÊTE DE CE BLOC. `progress.*` est ORPHELIN et non traduit (36
  // clés, `pages/ProgressPage.tsx`, que plus aucun fichier n'importe): y poser
  // des clés VIVANTES rendrait `fr.ts` non compilable (le pack est typé sur les
  // seuls namespaces traduits), ferait rougir `parity.int.test.ts` (« ni plus »)
  // et ferait LEVER `t()` en DEV pour un visiteur francophone, parce que
  // `/app/progress` est une page DÉCLARÉE traduisible (`catalog.ts`).
  //
  // ⛔ AUCUNE CALORIE DANS CE BLOC, ET AUCUNE N'Y ENTRERA. La décision est
  // chiffrée dans l'en-tête de `20260818180000_a_session_is_a_fact_not_an_energy.sql`:
  // une dépense d'exercice déclarée est fausse de 30 à 50 %, donc la soustraire
  // d'un déficit visé à 400-500 kcal/jour AUGMENTE l'incertitude de la journée.
  // Le compte de séances est vrai; son dérivé énergétique ne l'est pas.
  "student_progress.activity.label": "Your sessions",
  // ⚠️ « 0 SÉANCE » NE S'IMPRIME JAMAIS, ET CETTE PHRASE EST CE QUI LE REMPLACE.
  // Un décompte à zéro se lit comme un échec — le dépôt a déjà payé « 0 des 5
  // jours que j'ai vus ». Ici c'est pire: aucune prescription individuelle
  // n'existe (`MODEL.md` §3), donc zéro n'est même pas un manque.
  "student_progress.activity.empty":
    "Nothing logged in this period. If you trained, add it below — it stays a count, and nothing in your plan moves because of it.",
  // Les deux nombres portent le gras, donc deux fragments qui s'accordent
  // CHACUN avec son compte — même construction que la carte alimentaire, et
  // pour la même raison: « 1 séance sur 1 jour » et « 3 séances sur 2 jours ».
  "student_progress.activity.sessions_one": "{count} session logged",
  "student_progress.activity.sessions_many": "{count} sessions logged",
  "student_progress.activity.across": "across",
  "student_progress.activity.days_one": "{count} day",
  "student_progress.activity.days_many": "{count} days",
  // ⚠️ LE DÉNOMINATEUR EST DANS LA PHRASE, ET IL EST OBLIGATOIRE. Une somme de
  // minutes sur des séances dont la moitié n'en portait pas est un nombre qui
  // ment par défaut — c'est la cicatrice « dense non pesé = énergie perdue en
  // silence », appliquée aux minutes.
  "student_progress.activity.minutes": "{minutes} min in total, declared on {from} of them.",
  "student_progress.activity.by_intensity": "How hard: {list}",
  "student_progress.activity.intensity.easy": "easy",
  "student_progress.activity.intensity.moderate": "moderate",
  "student_progress.activity.intensity.hard": "hard",
  // `undeclared` EST UN COMPTE COMME LES AUTRES, pas un trou: le module le
  // porte en clair, et l'écran le montre plutôt que de le faire disparaître.
  "student_progress.activity.intensity.undeclared": "not said",
  // Les cinq types. Vocabulaire fermé = `ACTIVITY_SESSION_KINDS`, lui-même
  // recopié d'`ACTIVITY_EMPHASES`. Ce sont des VALEURS, donc elles se
  // traduisent; les jetons, eux, restent ASCII anglais (R1).
  "student_progress.activity.kind.daily_movement": "Everyday movement",
  "student_progress.activity.kind.strength": "Strength",
  "student_progress.activity.kind.cardio": "Cardio",
  "student_progress.activity.kind.recovery": "Recovery",
  "student_progress.activity.kind.mobility": "Mobility",
  "student_progress.activity.duration": "{count} min",
  "student_progress.activity.remove": "Remove",
  "student_progress.activity.removing": "Removing…",
  "student_progress.activity.footnote":
    "A count, and nothing derived from it. No calories: a workout you declare is off by 30 to 50 %, so taking it off the day would make the day less certain, not more.",

  // ── LA SAISIE ────────────────────────────────────────────────────────────
  // ⚠️ LA DURÉE ET L'INTENSITÉ SONT FACULTATIVES, ET LA COPIE LE DIT. Elles
  // sont nullables en base pour cette raison exacte: déclarées, jamais devinées.
  // Un champ obligatoire ferait inventer un nombre, et l'inventé entrerait
  // ensuite dans une somme avec l'autorité d'une mesure.
  "student_progress.activity.form.label": "Log a session",
  "student_progress.activity.form.date": "Day",
  "student_progress.activity.form.kind": "What was it?",
  // ⚠️ AUCUN TYPE PAR DÉFAUT. Pré-cocher « mouvement du quotidien » ferait
  // enregistrer un fait que personne n'a choisi — et c'est le seul champ des
  // quatre qui ne soit PAS facultatif, donc le seul qui doive être décidé.
  "student_progress.activity.form.kind_placeholder": "Pick one…",
  "student_progress.activity.form.duration": "How long? Optional.",
  "student_progress.activity.form.duration_placeholder": "minutes",
  "student_progress.activity.form.intensity": "How hard? Optional.",
  "student_progress.activity.form.intensity_none": "Not saying",
  "student_progress.activity.form.submit": "Log it",
  "student_progress.activity.form.saving": "Saving…",
  // Le refus est rendu À CÔTÉ DU GESTE. « Un refus loin du geste se lit comme
  // un bouton mort » — trois fois dans `SetupPage` avant qu'on le voie.
  "student_progress.activity.form.error": "Nothing was saved. {message}",
  "student_progress.activity.form.duration_range":
    "Minutes have to be a whole number between {min} and {max}.",

  // ══════════════════════════════════════════════════════════════════════════
  // LES CINQ MOMENTS DE LA JOURNÉE — un ATOME, pas un écran
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `lib/mealRhythm.ts` portait ces cinq mots dans un `MOMENT_LABELS` local. Ce
  // n'est pas le vocabulaire de `/app/progress`: c'est la bande horaire d'un
  // fait alimentaire, dérivée d'`occurred_at`, et rien n'interdit à un autre
  // écran de la rendre. Elle entre donc comme atome, à côté de `slot.*` (les
  // créneaux NOMMÉS d'un plan) qu'elle ne remplace pas — un créneau est déclaré
  // par le plan, un moment est déduit de l'heure.
  "moment.morning": "Morning",
  "moment.midday": "Midday",
  "moment.afternoon": "Afternoon",
  "moment.evening": "Evening",
  "moment.night": "Night",
  // ⚠️ LA SECONDE FORME EXISTE PARCE QUE `.toLowerCase()` NE TRADUIT PAS. La
  // page composait « lands in the ${MOMENT_LABELS[m].toLowerCase()} », ce qui
  // marche en anglais et échoue en français: « tombe le matin » demande un
  // article, et « tombe dans le matin » n'est pas une phrase. La forme
  // in-sentence est écrite, jamais dérivée.
  "moment.in.morning": "morning",
  "moment.in.midday": "midday",
  "moment.in.afternoon": "afternoon",
  "moment.in.evening": "evening",
  "moment.in.night": "night",


  // ══════════════════════════════════════════════════════════════════════════
  // LOT 6 · `/app/plan` — LE CONSTRUCTEUR DE REPAS (`components/MealBuilder`)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ CE BLOC EST UN `COPY` LOCAL RAPATRIÉ, PAS DE LA TRADUCTION NEUVE. Il
  // vivait dans `MealBuilder.tsx` avec ses 44 entrées — sous des noms de clés
  // qui ANTICIPAIENT déjà le seed (`meals.form.*`, `meals.result.*`), donc
  // invisible à `t()` comme au scanner de coutures pendant que tout le reste de
  // `meals.*` était traduit.
  //
  // ⚠️ TROIS DE SES CLÉS EXISTAIENT DÉJÀ ICI AVEC LES MÊMES VALEURS —
  // `meals.result.today`, `meals.result.past` et `meals.loading` — et la
  // divergence était ARMÉE, pas hypothétique: éditer l'une des deux copies ne
  // faisait rougir nulle part, et le rendu dépendait de qui appelait `c()`
  // plutôt que `t()`. La copie locale est supprimée; ces trois clés-là gardent
  // leur place d'origine, plus haut dans le bloc `meals.*`.

  "meals.form.title": "Build me something",
  "meals.form.mode_label": "Where do we start",
  "meals.form.mode_from_pantry": "From what I already have",
  "meals.form.mode_to_shop": "I will shop for it",
  // LA FENÊTRE, ET CE QU'ELLE COUVRE VRAIMENT. « Until Sunday » un dimanche
  // fait UN jour — l'aperçu le dit, sinon le bouton a l'air cassé.
  "meals.form.window_label": "Which days",
  // ── DEUX DATES, ET PLUS TROIS BOUTONS ──────────────────────────────────
  // « Until Sunday » un dimanche faisait UN jour, « For 7 days » ne disait pas
  // lesquels, et le nombre de jours obligeait à compter dans sa tête pour
  // savoir où on atterrit. Les trois libellés restent ici tant que rien ne les
  // affiche plus: les retirer dans le même geste que la refonte de l'écran
  // ferait deux changements dans un seul diff, et c'est celui qu'on ne relit
  // pas qui casse.
  "meals.form.window_from": "From",
  "meals.form.window_to": "To",
  "meals.form.window_until_sunday": "Until Sunday",
  "meals.form.window_seven_days": "For 7 days",
  "meals.form.window_exact": "Choose exactly",
  "meals.form.window_days_label": "How many days",
  "meals.form.window_span": "{from} → {to} · {days}",
  "meals.form.window_days_one": "{n} day",
  "meals.form.window_days_other": "{n} days",
  "meals.form.window_one_day": "Just today.",
  "meals.form.slot_label": "A particular meal (optional)",
  "meals.form.slot_any": "The whole day",
  "meals.form.servings_label": "How many people",
  "meals.form.pantry_label": "What you have in",
  "meals.form.pantry_hint":
    "One per line. Add an amount if it matters — «rice, 500g».",
  "meals.form.pantry_placeholder": "chicken thighs\nrice\nspinach",
  // L'ENVIE, ET PAS LES GOÛTS. Ce champ est DATÉ — il vaut pour cette
  // composition. Les goûts durables (« je déteste le brocoli ») vivent dans
  // « What you have told me about your eating », viennent de la conversation, et
  // valent pour toutes les semaines. Deux champs parce que deux durées de vie:
  // écrire « mezze d'été » dans la liste durable le ferait revenir en février.
  "meals.form.preferences_label": "What you fancy this time (optional)",
  "meals.form.preferences_placeholder":
    "summer mezze — lots of carrots, raw veg, nothing heavy",
  "meals.form.preferences_hint":
    "A mood for these meals. What you always like or never eat belongs in «What you have told me about your eating» — it is remembered on its own.",
  "meals.form.preferences_carried":
    "Kept from your last plan. Change it if you fancy something else.",
  // ── CE CHAMP N'EST PLUS CELUI QU'IL ÉTAIT ─────────────────────────────
  // Il servait à tout dire, y compris « je mange dehors vendredi » — ce que la
  // grille « Which meals, which days » exprime maintenant au jour et au repas
  // près. Ce qui reste ici est ce que la grille NE PEUT PAS dire: l'ÉVÉNEMENT.
  // Des invités, un four en panne, un retour de vacances. Le placeholder le
  // montre plutôt que de le décrire — trois exemples se lisent, une consigne
  // de remplissage se saute.
  "meals.form.context_label": "Anything going on this week (optional)",
  "meals.form.context_placeholder":
    "guests on Saturday · the oven is broken · back from holiday, empty fridge",
  // Le champ est repris de la dernière génération. La légende dit d'où il
  // vient: sans elle, « mariage mardi » — une contrainte qui ne se répète pas —
  // repartirait chaque semaine sans que personne le remarque.
  "meals.form.context_carried":
    "Kept from your last plan. Change it if this week is different.",
  "meals.form.submit": "Build it",
  "meals.form.building": "Building…",
  "meals.form.cancel": "Cancel",
  "meals.form.pantry_required": "Add what you have in, or switch to «I will shop for it».",
  "meals.result.title": "Your meals",
  "meals.result.empty":
    "Nothing built yet. Tell me where to start above and I will put a few meals together.",
  "meals.result.shopping_title": "Shopping list",
  "meals.result.shopping_close": "Hide shopping list",
  // Deux repères, et rien de plus. « Demain », « dans 3 jours » seraient des
  // calculs à refaire à chaque rendu pour une information que l'ordre donne
  // déjà: ce qui suit « today » est à venir.
  // ── QUAND LA SEMAINE EXISTE DÉJÀ ──────────────────────────────────────────
  "meals.rebuild.button": "Build another plan",
  "meals.rebuild.title": "Build another plan",
  "meals.rebuild.prepare_next": "Prepare next plan",
  "meals.result.tab_current": "This week",
  "meals.result.tab_next": "Next",
  // L'AVERTISSEMENT DE TRONCATURE. Il NOMME les jours qui partent, parce que
  // les courses de ces jours-là ont peut-être déjà été faites — et cette
  // dépense-là ne se rembourse pas.
  "meals.rebuild.truncates":
    "This takes {days} day(s) off your current plan ({from} → {to}). You may already have shopped for them.",
  // Le formulaire REMPLACE la semaine en place, et le dit AVANT qu'on clique.
  // C'est le seul geste destructif de l'écran: `generate-meal-v1` écrit une
  // ligne neuve, et cet écran ne lit que la dernière.
  "meals.rebuild.warning":
    "This replaces the week below. What is there now stops being what you open tomorrow.",
  "meals.rebuild.building":
    "Building your new week — it takes a few seconds. The one you had stays in place until this lands.",

  // ══════════════════════════════════════════════════════════════════════════
  // LOT 6 · `/app/plan` — LES DEUX AUTRES CATALOGUES PARALLÈLES
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `CookingCapacityCard` (28 entrées) et `FoodPreferencesCard` (22) portaient
  // chacune un `COPY` local, comme `MealBuilder`. Trois catalogues hors de
  // `t()` sur un seul écran: c'est ce qui rendait `/app/plan` intraduisible
  // quoi qu'on écrive ici.
  //
  // ── CE QUE CETTE CARTE DÉCIDE VRAIMENT ────────────────────────────────────
  // Le générateur composait des sessions sans rien savoir de quatre choses:
  // quels jours on peut cuisiner, combien de temps, quel niveau de recette,
  // quel budget. Un plan parfait et inapplicable est la première cause
  // d'abandon.
  "plan.cooking.title": "How you cook",
  "plan.cooking.subtitle":
    "What you can actually do in a week. Without this, the plan is built for somebody else.",
  // « Change » et pas « Change this »: le lien est dans l'en-tête de la carte,
  // donc son objet est déjà nommé juste à côté. Aligné sur les cartes voisines.
  "plan.cooking.summary_open": "Change",
  "plan.cooking.summary_edit": "Tell me",
  "plan.cooking.summary_close": "Close",
  "plan.cooking.time_label": "Time per cooking session",
  "plan.cooking.time_15": "15 minutes — get in and out",
  "plan.cooking.time_30": "30 minutes",
  "plan.cooking.time_60": "An hour, I do not mind",
  "plan.cooking.difficulty_label": "Recipes",
  "plan.cooking.difficulty_simple": "Simple — few steps, few pans",
  "plan.cooking.difficulty_normal": "Normal",
  "plan.cooking.difficulty_keen": "I like cooking, bring it on",
  "plan.cooking.variety_label": "Variety",
  "plan.cooking.variety_repeat": "Happy to repeat the same meals",
  "plan.cooking.variety_some": "Some repetition is fine",
  "plan.cooking.variety_varied": "Keep it varied",
  "plan.cooking.budget_label": "Budget for this plan",
  "plan.cooking.budget_hint":
    "The whole shopping list, in your currency. Asked every time — last " +
    "time’s number is only a starting point.",
  // ── LOT B · COMMENT ON CUISINE CETTE SEMAINE ────────────────────────────
  // LES LIBELLÉS PORTENT LA CONSÉQUENCE, PAS LE JARGON. « one_session » ne veut
  // rien dire à quelqu'un qui prépare à manger; « one cook, slightly different
  // plates » dit ce qui va se passer dans sa cuisine.
  //
  // ⚠️ ET LA PHRASE D'AIDE DIT QUE C'EST UN PLAFOND. Un choix qu'on croit être
  // un ordre se lit comme une panne le jour où le plan ne le suit pas — et le
  // plan, lui, DIT quand le plafond mord (`plan_rationale.ts`).
  "plan.cooking.shape_label": "How you cook this week",
  "plan.cooking.shape_hint":
    "A ceiling, not an order: nobody gets a dish of their own unless what they " +
    "eat cannot come out of the shared pot. Asked every time.",
  "plan.cooking.shape_engine": "Let the plan decide",
  "plan.cooking.shape_one_dish": "One dish for everyone",
  "plan.cooking.shape_one_session": "One cook, slightly different plates",
  "plan.cooking.shape_separate": "Each their own",
  "plan.cooking.one_session_label":
    "Cook everything in one go",
  "plan.cooking.one_session_hint":
    "A single cooking session for the whole stretch: whatever is not eaten in " +
    "the days that follow goes in the freezer, and comes out the night before.",
  "plan.cooking.one_session_needs_freezer":
    "This needs a freezer: without one, a cooked dish only keeps two more " +
    "days. Tick it under \"What you cook with\" to open this option.",
  "plan.cooking.time_minutes": "{n} min",
  "plan.cooking.time_hours": "{n} hr",
  "plan.cooking.time_required": "Say how long a cooking session can last.",
  "plan.cooking.budget_required":
    "Say what this plan can cost. Without a number there is nothing to trade off.",
  "plan.cooking.save": "Save",
  "plan.cooking.saving": "Saving…",
  "plan.cooking.saved": "Saved.",
  "plan.cooking.no_goal": "Set your goal above first — this is saved alongside it.",
  "plan.cooking.none_picked": "Not set yet",

  // ── CE QUE L'ÉLÈVE A DIT, REMONTÉ DE LA CONVERSATION ──────────────────────
  // ⚠️ LE TITRE COUVRE LES DEUX CHOSES QUE LA CARTE PORTE. Depuis
  // l'élargissement du 2026-08-06, elle ne tient plus seulement des goûts:
  // « travaille de nuit trois fois par semaine » y arrive aussi, parce que
  // c'est elle qui décide de ce qu'on peut raisonnablement proposer à manger.
  // Un titre qui ne parlerait que de goûts ferait passer une contrainte de
  // travail pour un caprice alimentaire — et l'élève la retirerait.
  "plan.told.title": "What you have told me about your eating and your week",
  "plan.told.subtitle":
    "Picked up from your conversations — what you like, and what your week actually allows. Keep what is right, edit it, or drop it: what you keep is used when your week is put together.",
  "plan.told.suggested": "Worth keeping?",
  "plan.told.keep": "Keep",
  "plan.told.update": "Update",
  "plan.told.replaces": "replaces",
  "plan.told.recheck_prefix": "You came back to this on",
  "plan.told.recheck_suffix": "— still right?",
  "plan.told.drop": "Not right",
  "plan.told.yours": "In your plan",
  "plan.told.edit": "Edit",
  "plan.told.remove": "Remove",
  "plan.told.save": "Save",
  "plan.told.cancel": "Cancel",
  "plan.told.empty":
    "Nothing yet. Tell me in Chat what you like, what you cannot stand, and when your week leaves you no time to cook — it turns up here.",
  "plan.told.no_goal": "Set your goal above first — this is saved alongside it.",
  "plan.told.saving": "Saving…",
  "plan.told.open": "Change",
  "plan.told.close": "Close",
  // Replié, on dit COMBIEN il y en a: « rien » et « quatre lignes que je ne
  // vois plus » sont deux états différents.
  "plan.told.summary_one": "1 thing you have told me",
  "plan.told.summary_many": "{count} things you have told me",
  "plan.told.summary_pending": " · {count} waiting for you",

  // ══════════════════════════════════════════════════════════════════════════
  // LOT 6 · `/app/plan` — L'ÉCRAN LUI-MÊME (`StudentWeekPlanPage`)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // 1963 lignes sans un seul `t()`. Les clés vivent sous `plan.*`, à côté des
  // refus de composition qui y sont depuis le lot 2: c'est le même sujet — ce
  // que l'élève règle, et ce que le serveur refuse d'en faire.
  "plan.page.title": "My week's plan",
  // ⚠️ IL DISAIT « NEVER CALORIE COUNTS », ET FF-059 A RENDU CETTE PHRASE
  // FAUSSE SUR LE MÊME ÉCRAN: mesuré en run réel, « 537 kcal » s'affiche à trois
  // centimètres d'elle. Une promesse contredite par ce qu'on voit en même temps
  // ne coûte pas seulement sa crédibilité — elle apprend à ne pas lire les
  // autres. Ce qui reste est la promesse qui TIENT: rien ici ne note personne.
  "plan.page.subtitle":
    "What you eat this week, written from your coach's method. Dishes and rhythms — nothing here scores you.",

  // ── LES MOTS COMMUNS DE L'ÉCRAN ───────────────────────────────────────────
  "plan.save": "Save",
  "plan.cancel": "Cancel",
  "plan.change": "Change",
  "plan.add": "Add",
  // Trois points de suspension pendant une écriture. Ce n'est pas un mot, c'est
  // un état — même valeur que `meals.picker.saving`.
  "plan.busy": "…",

  // ── LA CARTE « ABOUT YOU », index de la fenêtre de réglages ──────────────
  "plan.about.title": "About you",
  "plan.about.setup": "Set up",
  "plan.about.done": "Done",
  "plan.about.empty":
    "Four short questions, one window. Your week gets built from your answers — nothing here is shared with your coach.",
  "plan.about.numbers": "Numbers",
  "plan.about.goal": "Goal",
  "plan.about.day": "Your day",
  "plan.about.cooking": "Cooking",
  // ⚠️ « Cooking » DÉCRIVAIT UN RÉGLAGE; ce n'en est plus un. Les jours et
  // la durée sont demandés à chaque composition, et ce que la fiche montre
  // est ce que la DERNIÈRE demande portait. Garder « Cooking » ferait
  // chercher un champ dans une carte qui ne l'a plus.
  "plan.about.last_request": "Last plan asked for",
  "plan.about.told": "Told me",
  // « pas encore réglé » est ce que l'élève doit LIRE pour savoir qu'il reste
  // quelque chose à faire — ce n'est pas un vide à masquer.
  "plan.about.not_set": "Not set yet",

  // ══════════════════════════════════════════════════════════════════════════
  // `/app/plan` ACCUEILLE LA DEMANDE DE PLAN — POUR TOUT LE MONDE
  //
  // ── LE DÉFAUT QUE CE BLOC REFERME ────────────────────────────────────────
  // La demande de plan était éparpillée sur TROIS écrans qui ne posaient pas
  // les mêmes questions: le formulaire de `/app/plan` (fermé au maître), une
  // carte du foyer qui demandait le BUDGET SEUL avec une fenêtre codée en dur,
  // et l'étape « request » du couloir d'entrée — la seule qui demandait les
  // dates et la présence. Trois formulaires pour un geste, et le maître était
  // renvoyé vers le plus pauvre des trois.
  //
  // Tout arrive ici. Ce qui décrit LES GENS reste au foyer (qui mange ici,
  // les corps, les interdits, les invitations); ce qui fabrique LA SEMAINE est
  // sur cet écran.
  // ══════════════════════════════════════════════════════════════════════════
  "plan.request.title": "Ask for a plan",
  // ⚠️ « QUI EST LÀ » ET PAS « COMBIEN DE PERSONNES ». Le générateur du foyer
  // DÉDUIT les couverts de la présence, jour par jour: demander un nombre à
  // côté produirait deux vérités et le serveur ignorerait la nôtre.
  "plan.request.presence_title": "Who is here, day by day",
  "plan.request.presence_intro":
    "One row per person. Mark the meals each one is not eating at home over this window.",
  "plan.request.presence_open": "Mark who's away",

  // ── L'ENVIE DE LA SEMAINE (venue de `household.envy.*`) ──────────────────
  //
  // ⚠️ LE TITRE EST LA PHRASE DE L'UTILISATEUR, MOT POUR MOT, EN FRANÇAIS.
  // Elle n'est pas du français canonique et ce n'est pas une coquille: c'est
  // une instruction produit explicite. La corriger est une décision humaine,
  // pas une décision de passage. L'anglais ci-dessous est la traduction du
  // SENS, pas de la faute.
  //
  // ⚠️ ET ELLE S'ÉCRIT SUR LA SEMAINE DU PLAN, PAS SUR CELLE D'AUJOURD'HUI.
  // Le générateur relit l'envie sur le lundi ISO de la DATE DE DÉPART. Tant que
  // la fenêtre était « d'ici dimanche », les deux ancres coïncidaient. Avec
  // deux dates libres, elles divergent — et l'envie disparaît sans erreur.
  "plan.envy.title": "What is the house in the mood for?",
  "plan.envy.body":
    "One line, for everyone, about this week. Nobody else has to fill anything in, and leaving it empty is fine.",
  "plan.envy.placeholder": "Lea wants pasta, Marc is sick of chicken.",

  // ── QUELLE FAÇON DE MANGER LE PLAT COMMUN SUIT (venu de `household.reference.*`) ──
  //
  // ⚠️ LE LIBELLÉ DIT QUI, JAMAIS POURQUOI, et il ne nomme AUCUN objectif.
  // C'est une phrase de méthode; « qui est au régime » serait un verdict lu par
  // toute la table. Le titre plein NOMME les deux personnes et les deux
  // DIRECTIONS DE SERVICE qui s'opposent (`plan.reference.title_pair`) — une
  // direction se lit à voix haute sans blesser, un objectif non.
  //
  // ⚠️ ET IL NE PROMET PAS DE PORTION. Le référent ne change pas la taille de
  // la casserole — elle se dimensionne sur le plus petit besoin de la table.
  // Une copie qui laisserait croire l'inverse vendrait exactement le défaut que
  // FF-043 existe pour empêcher.
  "plan.reference.title": "Whose way of eating the shared dish follows",
  // ── LE TITRE QUAND ON SAIT QUI S'OPPOSE ─────────────────────────────────
  // Il répond à la seule question que l'ancien libellé laissait sans réponse:
  // POURQUOI ON ME DEMANDE ÇA, ET MAINTENANT. Il nomme les deux personnes, que
  // le roster porte déjà.
  //
  // ⛔ ET IL NE DÉTAILLE PAS LES DEUX CONSIGNES DE SERVICE, DÉLIBÉRÉMENT.
  // Les six chaînes de `SERVING_DIRECTION` sont déjà portées DEUX fois
  // (`mealprep.dir.*`, `couples.dir.*`), et les deux portages sont ÉPINGLÉS sur
  // le module par `servingDirections.int.test.ts`. Un troisième portage ici ne
  // le serait par rien: le module a déjà rendu la chaîne de `maintenance` pour
  // `health` pendant des semaines sans que rien n'échoue, et c'est exactement
  // ce que l'absence d'épingle laisse revenir. On nomme donc QUI s'oppose; le
  // `hint` juste en dessous dit ce que le choix change.
  //
  // ⚠️ ET SURTOUT: ON NE NOMME AUCUN OBJECTIF. « Christèle veut perdre du
  // poids » est un verdict lu par toute la table. Une direction de service se
  // lit à voix haute sans blesser; le motif qui la produit, non.
  "plan.reference.title_pair":
    "{first} and {second} do not eat the same way — the shared dish can only follow one of them",
  "plan.reference.hint":
    "When two grown-ups here follow different methods, the shared dish can only follow one of them. Pick whose. It changes what we cook, never how much anyone gets — helpings are worked out per person either way.",
  // LE DÉFAUT, NOMMÉ. « Personne » se lirait comme une panne.
  "plan.reference.default": "Whoever is composing that week",
  "plan.reference.saved": "Saved.",

  // ── « À TABLE » (venu de `household.portions.*`) ─────────────────────────
  // Sous le plan, jamais au-dessus: il dit comment on SERT ce que le plan dit
  // qu'on cuisine. L'inverse ferait lire des parts avant de savoir de quel plat.
  "plan.table.title": "At the table",
  "plan.table.standard": "A standard serving",

  // ── POURQUOI CES JOURS-LÀ (Lot A) ───────────────────────────────────────
  // ⛔ LE SEUL MOT DE CE BLOC QUI VIT ICI. Les phrases elles-mêmes sont
  // assemblées CÔTÉ SERVEUR, dans la langue du contenu, et rendues finies. Un
  // miroir de leurs gabarits dans `frontend/` serait une garde en double, et
  // une garde en double diverge — la cicatrice la plus chère de ce dépôt.
  "plan.rationale.title": "Why those days",

  // ── LE BROUILLON (Lot C) ────────────────────────────────────────────────
  // Un aperçu n'écrit RIEN: ni plan, ni parts, ni quota de fusion. C'est ce que
  // `not_saved` dit à l'écran, et c'est pour ça qu'on peut le refaire.
  "plan.draft.cta": "Preview",
  "plan.draft.working": "Building a preview...",
  // ── LOT D · LE RETOUR DE FIN DE PLAN ────────────────────────────────────
  // ⚠️ LES LIBELLÉS DES QUESTIONS NE SONT PAS ICI, et c'est délibéré: ils
  // vivent dans `_shared/keel/plan_feedback.ts`, dans les DEUX langues, avec
  // leur lecteur nommé à côté. Les recopier en clés d'écran ferait deux tables
  // de la même question, et celle qu'on regarde le moins garderait l'ancien
  // mot. Ce qui est ici est le CHROME: le titre, les deux gestes, et les
  // en-têtes des deux blocs que l'écran assemble lui-même.
  //
  // ⛔ AUCUNE PHRASE NE DEMANDE CE QUI A ÉTÉ MANGÉ NI CE QUI A ÉTÉ TENU. On
  // évalue le plan, jamais la personne.
  "plan.feedback.title": "This plan is over",
  "plan.feedback.intro":
    "A few things about the plan itself — what it asked of you, not what you " +
    "did with it. Nothing here is required.",
  "plan.feedback.dishes_title": "The dishes in it",
  "plan.feedback.dishes_hint":
    "Mark the ones worth having again, and the ones to leave out.",
  "plan.feedback.again": "Again",
  "plan.feedback.not_again": "Not again",
  "plan.feedback.envy_title": "Anything you fancy next",
  "plan.feedback.envy_hint":
    "One line, for the whole table. It goes to next week’s plan.",
  "plan.feedback.envy_placeholder": "Léa wants pasta, Marc is done with chicken",
  "plan.feedback.anything_else_placeholder":
    "Léa has dance on Tuesdays, we eat late on Fridays",
  "plan.feedback.send": "Send",
  "plan.feedback.sending": "Sending…",
  "plan.feedback.dismiss": "Not now",
  "plan.draft.title": "What it would look like",
  "plan.draft.note_label": "What's off",
  "plan.draft.note_hint":
    "One sentence is enough. It is used to redo the preview; it is not saved.",
  "plan.draft.note_placeholder": "Too much fish, and nothing for Thursday night.",
  "plan.draft.remix": "Redo with that",
  "plan.draft.adopt": "Adopt this plan",
  "plan.draft.adopting": "Saving...",
  "plan.draft.discard": "Drop it",
  "plan.draft.not_saved": "Nothing is saved yet.",
  "plan.draft.note_too_long": "Too long. Say it in one sentence.",
  "plan.draft.note_rejected":
    "I can't work from that sentence. Say again what you want changed in the plan.",
  // ⚠️ LE PLAFOND SE DIT AVANT D'ÊTRE HEURTÉ, jamais découvert en le heurtant:
  // un bouton qui se désactive sans prévenir se lit comme une panne, et
  // quelqu'un qui aurait su qu'il lui restait UNE reprise aurait écrit une
  // autre phrase.
  "plan.draft.turns_left": "{count} redos left",
  "plan.draft.turns_one": "1 redo left — make it count.",
  "plan.draft.turns_none": "No redo left. This is the preview you have.",
  "plan.draft.chars_left": "{count} characters left",
  // ⚠️ LE FAIT, JAMAIS LE MOTIF. Nommer la raison d'une clause écartée dirait à
  // quelqu'un qu'il est sous plancher TCA. Le motif reste interne et compté.
  "plan.draft.note_partial": "Part of what you wrote wasn't used. The rest was.",
  // ⚠️ CE QUE « ADOPTER » FAIT VRAIMENT, DIT AVANT LE CLIC. Il n'existe aucun
  // chemin serveur qui écrive l'aperçu tel quel: adopter RECOMPOSE à partir de
  // la même demande. Le taire ferait montrer un plan et en écrire un autre.
  "plan.draft.adopt_recomposes":
    "Adopting builds it for real from the same request, so it can come out a little different from this preview.",

  // ── LA PART DU RÉCLAMÉ (Lot E) ──────────────────────────────────────────
  // ⚠️ CETTE CARTE N'AFFICHE JAMAIS un objectif, un poids, une calorie, ni le
  // POURQUOI d'une part. `portion_note` est une INSTRUCTION DE SERVICE, garantie
  // sans raison ni vocabulaire de corps côté serveur — c'est ce qui permet de
  // l'afficher: l'instruction est publique, le pourquoi ne l'est pas.
  "plan.mine.title": "Your share",
  "plan.mine.standard": "A standard serving",
  "plan.mine.approve": "Looks right",
  "plan.mine.approved": "Confirmed.",
  "plan.mine.request_change": "Ask for a change",
  "plan.mine.change_label": "What you'd like changed",
  "plan.mine.change_sent": "Sent to the household.",
  "plan.mine.household_dishes": "What the house is cooking",

  // ── UN PLAN PAR PERSONNE (2026-08-14) ────────────────────────────────────
  // Remplace « à table », retirée le même jour: les MÊMES parts, mais dans la
  // grille, à côté du plat qu'elles servent. Ce n'est pas une perte, c'est un
  // déplacement — l'ancienne carte récitait la table entière loin du plan.
  //
  // ⚠️ MÊME RÈGLE QUE `plan.mine.*`, ET ELLE EST PLUS EXPOSÉE ICI: aucun
  // objectif, aucun poids, aucune calorie, aucun POURQUOI de part. Ces écrans
  // se lisent À TABLE, devant tout le monde. L'instruction de service est
  // publique, le motif qui la produit ne l'est pas.
  "plan.person.title": "Who eats what",
  "plan.person.hint":
    "One dish for the table, one line per person. What changes from one line to the next is the serving, never the dish.",
  "plan.person.mode_together": "Side by side",
  "plan.person.mode_one": "One person",
  "plan.person.dish_row": "The dish",
  // ⚠️ IL N'Y A PAS DE CLÉ POUR « RIEN DE PARTICULIER », ET C'EST VOULU. Une
  // case sans part n'invente aucune phrase: le plat ne puise dans aucun lot
  // dont cette bouche ait une part, et remplir la case d'un « comme la table »
  // répété vingt fois ferait du bruit là où le silence dit déjà tout.
  "plan.person.standard": "A standard serving",
  "plan.person.pick": "Read the week of",

  // ── LES CINQ SECTIONS DE LA FENÊTRE ──────────────────────────────────────
  "plan.section.basics.title": "Basic info",
  "plan.section.basics.intro":
    "Who you are and where you are now. Used to size your portions.",
  "plan.section.goal.title": "Your goal",
  "plan.section.goal.intro":
    "What you are after. It decides which parts of your coach's method get brought forward for you.",
  // ── ⟳ LOT 5 · LES CHIFFRES, DANS LA FENÊTRE « À PROPOS DE TOI » ─────────
  //
  // ⚠️ « Numbers », PAS « Calories ». Le fronton est lu par quelqu'un qui vient
  // régler autre chose; le mot « calories » y transformerait un réglage en
  // sujet. Les deux BOUTONS, eux, disent « calories » — parce qu'ils sont le
  // geste, et qu'un geste doit nommer ce qu'il fait.
  //
  // ⚠️ L'INTRO NE VEND RIEN ET NE PRÉVIENT DE RIEN. Ni « utile pour perdre du
  // poids » (ce serait un argument pour compter), ni « attention aux troubles
  // du comportement alimentaire » (ce serait un avertissement adressé à qui
  // vient d'ouvrir un menu). Elle dit d'où vient le chiffre et qu'il obéit.
  //
  // ⚠️ PAS « Numbers » TOUT COURT — mesuré à l'écran le 2026-09-01: la carte
  // rend déjà un libellé « Numbers » (`plan.about.numbers`, la taille et le
  // poids) à trois centimètres de là. Deux frontons du même mot dans le même
  // flux, pour deux choses sans rapport.
  //
  // ⚠️ ET L'INTRO NE REDIT PAS LA PHRASE DE LA RANGÉE. Elle portait « Turn it
  // off and it goes quiet everywhere », que `meals.energy.switch_hint` dit déjà
  // deux lignes plus bas — vu en double à l'écran. L'intro dit D'OÙ VIENT le
  // chiffre; la rangée dit qu'il obéit.
  "plan.section.numbers.title": "What your plan shows",
  "plan.section.numbers.intro":
    "Whether your plan shows what it adds up to — worked out from the quantities in it, never guessed.",
  "plan.section.day.title": "How your day runs",
  "plan.section.day.intro":
    "Tick the moments you actually eat. Nothing you did not name, none of yours dropped.",
  "plan.section.cooking.title": "How you cook",
  "plan.section.cooking.intro":
    "Which days you can cook, and for how long. Your sessions get built around this.",
  "plan.section.told.title": "What you have told me",
  "plan.section.told.intro":
    "Picked up from your conversations. Keep what is right, edit it, or drop it.",

  // ── LES SIX DYNAMIQUES ───────────────────────────────────────────────────
  // ⚠️ LES JETONS RESTENT ANGLAIS (R1) — ils sont dans le CHECK de
  // `student_goals.goal`, dans `goalScope` et dans les lignes déjà en base.
  // Seuls ces mots-ci se traduisent.
  //
  // Les trois premières légendes sont écrites autour de LA MÊME CHOSE: le sens
  // de l'aiguille. C'est le seul critère qu'un élève peut s'appliquer sans se
  // tromper, et c'est aussi, mot pour mot, ce que `directionIsWorking` mesure
  // ensuite dans `student_body.ts`. Si l'une change, l'autre est fausse.
  //
  // « Lose weight » et pas « Lose fat »: le second demande à l'élève de savoir
  // ce qu'il perd, ce que personne ne sait avant de commencer.
  "plan.goal.fat_loss.label": "Lose weight",
  "plan.goal.fat_loss.blurb":
    "You want the scale to come down — without the week becoming unlivable.",
  "plan.goal.muscle_gain.label": "Build muscle",
  "plan.goal.muscle_gain.blurb": "You want to gain, on purpose, and mostly as muscle.",
  "plan.goal.recomposition.label": "Same weight, different shape",
  "plan.goal.recomposition.blurb": "The scale barely moves. Your waist does.",
  // « Train better » et pas « Performance »: ce mot ressemblait à un
  // fourre-tout où tombait quiconque s'entraîne — et c'est très exactement là
  // que la prise de masse atterrissait avant d'avoir son propre jeton.
  "plan.goal.performance.label": "Train better",
  "plan.goal.performance.blurb":
    "Fuel your sessions and recover from them. Weight is a constraint, not the target.",
  "plan.goal.health.label": "Eat better",
  "plan.goal.health.blurb": "Feel better day to day. Body weight is not the point here.",
  "plan.goal.maintenance.label": "Hold what I have",
  "plan.goal.maintenance.blurb":
    "You are where you want to be. Keep it, with the lightest possible load.",
  "plan.goal.legend": "What you are after",

  // ── LA CIBLE DE LA DYNAMIQUE CHOISIE ─────────────────────────────────────
  "plan.goal.target_weight": "Weight I am aiming for",
  "plan.goal.target_waist": "Waist I am aiming for",
  "plan.goal.target_band": "Weight I want to stay around",
  "plan.goal.optional": "optional",
  "plan.goal.target_hint": "It sets the direction your portions are sized for. It is not a deadline, and nobody is scored against it.",
  // L'AXE, pour les deux dynamiques qu'aucun chiffre ne porte. Les six valeurs
  // sont celles du point du dimanche (`chat.weekly.axis.*`): l'objectif est
  // mesurable sans une saisie de plus.
  "plan.goal.axis_label": "The one thing I want to see improve",
  "plan.goal.axis_none": "Nothing in particular",
  "plan.goal.axis_hint": "One of the six you rate on Sunday — nothing extra to fill in.",
  "plan.goal.axis_unrated": "Nothing rated yet — you set this at Sunday's check-in.",
  "plan.goal.axis_last_sunday": "Last Sunday: {value} out of 5.",
  "plan.goal.axis_rising": "{axis} is going up — that is the one you picked.",
  "plan.goal.axis_falling": "{axis} is going down.",
  "plan.goal.axis_steady": "{axis} is holding steady.",
  // ⚠️ CETTE PHRASE EST CE QUI RENDAIT LA TABLE D'AXES INTRADUISIBLE. Elle
  // était « working on ${label.toLowerCase()} » — un gabarit anglais autour
  // d'une étiquette d'une troisième table locale. Baisser la casse d'un mot ne
  // le traduit pas, et la phrase française ne se compose pas comme l'anglaise.
  "plan.goal.working_on": "working on {axis}",
  "plan.goal.own_words": "In your own words",
  "plan.goal.own_words_placeholder": "Play football with my kids without being wrecked",
  "plan.goal.own_words_hint": "Optional. Why this matters to you — better than a number.",

  // ── LES TROIS FAITS DURABLES, ET LES DEUX MESURES ────────────────────────
  "plan.measures.height": "Height",
  "plan.measures.age": "Age",
  "plan.measures.sex": "Sex",
  "plan.measures.weight": "Weight",
  "plan.measures.waist": "Waist",
  "plan.measures.target": "Target",
  "plan.gender.female": "Female",
  "plan.gender.male": "Male",
  "plan.gender.other": "Other",
  // FF-031: la granularité de stockage n'est plus la semaine, donc la date
  // affichée ne l'est plus non plus — sauf pour une mesure d'AVANT la reprise,
  // où la semaine est la seule chose vraie qu'on puisse dire.
  "plan.measures.week_of": "week of {date}",
  "plan.measures.since_sunday":
    "Weighed yourself since Sunday? It goes to the same place as your Sunday check-in.",
  "plan.measures.none_yet": "No weight recorded yet. Add one above, or at Sunday's check-in.",
  "plan.measures.one_more":
    "One more entry and this can start showing a direction — a single measurement on its own is just a number.",
  // ⚠️ LE TROISIÈME ÉTAT MANQUAIT, ET SON ABSENCE FAISAIT AFFIRMER UN VERDICT.
  // « Tu es sorti de ta fourchette » suppose une fourchette; sans référence
  // saisie, `insideBand` vaut `null` et on ne conclut RIEN.
  "plan.measures.band_unset":
    "Set the weight you want to stay around and this will tell you when you drift.",
  "plan.measures.weeks_in_range_one": "{count} week inside your range.",
  "plan.measures.weeks_in_range_many": "{count} weeks inside your range.",
  "plan.measures.drifted": "You have drifted outside your range.",
  "plan.measures.week_by_week": "Week by week",
  "plan.measures.col_week": "Week",
  "plan.measures.col_change": "Change",

  // ── LA PHRASE DE TENDANCE (`api/bodyMeasures.ts`) ────────────────────────
  // ⚠️ ELLE SORTAIT LE JETON BRUT: « your weight is rising ». Un couple par
  // mesure et par tendance, parce que le verbe français dépend de la MESURE
  // qu'il décrit — un poids monte, un tour de taille se réduit — et qu'un
  // adjectif interpolé demanderait un accord que `t()` ne sait pas faire.
  //
  // Ce qu'elle ne fait JAMAIS: féliciter ou réprimander. Quand la direction se
  // produit on le CONSTATE; quand elle ne se produit pas, on ne dit rien de plus
  // que la mesure — `student_body.ts` documente la même symétrie côté serveur.
  // ⚠️ L'ANGLAIS EST MOT POUR MOT CELUI D'AVANT (« your weight is rising »):
  // ce lot rend la phrase TRADUISIBLE, il ne la réécrit pas.
  // `bodyMeasures.int.test.ts` la compare au caractère près.
  "plan.trend.weight.rising": "your weight is rising",
  "plan.trend.weight.falling": "your weight is falling",
  "plan.trend.weight.stable": "your weight is stable",
  "plan.trend.waist.rising": "your waist is rising",
  "plan.trend.waist.falling": "your waist is falling",
  "plan.trend.waist.stable": "your waist is stable",
  "plan.trend.and": " and ",
  "plan.trend.asked_for": "{observed} — that is what this goal is asking for.",

  // ── LA LIGNE REPLIÉE ─────────────────────────────────────────────────────
  "plan.summary.aiming_weight": "aiming for {value} kg",
  "plan.summary.aiming_waist": "aiming for {value} cm",
  "plan.summary.staying_around": "staying around {value} kg",
  "plan.summary.quoted": "“{text}”",
  "plan.summary.kept_one": "{count} thing kept",
  "plan.summary.kept_many": "{count} things kept",

  // ── LA SAISIE, ET CE QU'ELLE REFUSE ──────────────────────────────────────
  "plan.input.numbers_only": "{field}: numbers only.",
  "plan.input.out_of_range": "{field}: expected between {min} and {max}.",
  // BORNES LARGES, ET ELLES EXISTENT QUAND MÊME: elles n'attrapent pas une
  // erreur d'un an, elles attrapent le doigt qui glisse sur le siècle — après
  // quoi l'âge dérivé est absurde et personne ne voit d'où il vient.
  "plan.error.birth_date": "That date of birth does not look right.",
  "plan.error.unknown_value": "Unknown value.",
  "plan.error.no_profile": "Nothing was saved — we could not find your profile.",
  "plan.error.nothing_to_save": "Nothing to save — fill in a weight or a waist.",
  "plan.error.could_not_save": "could not save",
  // « tu n'as pas encore de plan » et « on n'a pas pu le lire » sont deux
  // phrases différentes, et montrer la première pour la seconde invite l'élève
  // à recomposer par-dessus quelque chose qui existe.
  "plan.error.load": "We could not load your week.",
  "plan.error.failed": "That did not go through.",


  // ══ LOT 1D · « CE QUE SOPHIA SAIT DE TOI » (/app/about-you) ═══════════════
  // Autorité produit: `docs/keel/NOMENCLATURE-MEMOIRE.md` §6 (les six sections,
  // dans l'ordre) et §7 (les anciennes notes, rendues telles quelles).
  //
  // ⛔ AUCUN GRAMME, AUCUNE CALORIE dans le bloc `known.portion.*`: la personne
  // dit « trop gros », pas « −80 g ». Les deux crans sont des ADVERBES, et
  // c'est l'enveloppe qui traduit en aval, là où le plancher TCA s'applique.
  //
  // ⚠️ `known.section.portions.not_wired` DIT UNE LIMITE VRAIE, et elle doit
  // disparaître le jour où elle cesse de l'être: le routage du lot 1C sert les
  // six familles aux générateurs, mais l'enveloppe ne lit pas encore les
  // ajustements de portion. Une copie d'écran ne promet pas plus que ce qui est.

  "known.title": "What Sophia knows about you",
  "known.subtitle": "Everything I keep, where it came from, and how to change it.",
  "known.intro": "Nothing here is hidden and nothing here is fixed. Every line says who put it there, and every line can be rewritten or removed.",
  "known.loading": "Reading what I have kept…",
  "known.no_goal": "Nothing yet. Set your direction first, and what you tell me lands here.",
  "known.section.no_more.title": "What you don't want any more",
  "known.section.no_more.empty": "Nothing on this list. Say it in the chat, or tick it in a plan review, and it shows up here.",
  "known.section.again.title": "What you want to see again",
  "known.section.again.empty": "Nothing yet. What you liked lands here as soon as you say so.",
  "known.section.portions.title": "Portions",
  "known.section.portions.empty": "No portion has been adjusted. That question is asked at the end of a plan, with the household in front of you.",
  "known.index.portions.down": "For {who}, I serve slightly smaller helpings than the baseline — that is what you asked for in the review.",
  "known.index.portions.down_strong": "For {who}, I serve clearly smaller helpings than the baseline — that is what you asked for in the review.",
  "known.index.portions.up": "For {who}, I serve slightly larger helpings than the baseline — that is what you asked for in the review.",
  "known.index.portions.up_strong": "For {who}, I serve clearly larger helpings than the baseline — that is what you asked for in the review.",
  "known.section.rhythm.title": "Your rhythm",
  "known.section.rhythm.empty": "Nothing declared about which moments of the day happen, and for whom.",
  "known.section.kitchen.title": "Your kitchen",
  "known.section.kitchen.empty": "Nothing about cooking days, time at the stove, difficulty, variety or budget.",
  "known.section.next_week.title": "For next week",
  "known.section.next_week.empty": "Nothing asked for next week. What you ask here lasts one week, then goes.",
  "known.section.next_week.expires": "Good until {date}",
  "known.section.next_week.read_only": "These lines leave on their own, on the date above. They cannot be edited from here yet.",
  "known.legacy.title": "Older notes",
  "known.legacy.intro": "Sentences kept before I had sections. I will not guess where they belong: file one yourself and it moves.",
  "known.legacy.empty": "None.",
  "known.source.written": "You wrote this",
  "known.source.conversation": "I kept this from what you said on {day}",
  "known.source.questionnaire": "You ticked this in a plan review",
  "known.source.draft_note": "You wrote this on a draft plan",
  "known.quote": "because you said: {quote}",
  "known.recent.title": "What just changed",
  "known.memo.title": "What Sophia kept otherwise",
  "known.memo.intro": "Instructions no section could hold. {used} of {max} — beyond that, one has to go before a new one can come in.",
  "known.field.moved": "from {previous} to {next}",
  "known.field.undo": "Undo",
  "known.field.unset": "nothing",
  "known.field.cook_days": "Cooking days",
  "known.field.cooking_time_min": "Cooking time",
  "known.field.budget_amount": "Budget",
  "known.field.recipe_difficulty": "Recipe difficulty",
  "known.field.variety": "Variety",
  "known.field.eating_rhythm": "Meal rhythm",
  "known.recent.intro": "Nothing was decided behind your back: here is what I filed recently, and why. Remove anything that is wrong.",
  "known.edit": "Edit",
  "known.remove": "Remove",
  "known.save": "Save",
  "known.cancel": "Cancel",
  "known.saving": "Saving…",
  "known.edit_text_label": "The sentence you will read",
  "known.file_under": "File under",
  "known.file_under_keep": "Leave it as an older note",
  "known.kind.food_exclude": "A food to stop serving",
  "known.kind.food_prefer": "A food to bring back",
  "known.kind.method_avoid": "A way of cooking that does not work",
  "known.kind.method_prefer": "A way of cooking you like",
  "known.kind.portion_adjust": "The size of a plate",
  "known.kind.rhythm_set": "A moment that happens, or does not",
  "known.kind.logistics_set": "How your kitchen runs",
  "known.kind.craving": "A one-off craving",
  "known.portion.down_slight": "A bit too much",
  "known.portion.down_clear": "Really too much",
  "known.portion.up_slight": "A bit too little",
  "known.portion.up_clear": "Really not enough",
  "known.portion.direction_label": "Too much, or not enough?",
  "known.portion.direction_down": "Too much",
  "known.portion.direction_up": "Not enough",
  "known.portion.magnitude_label": "How far off?",
  "known.portion.magnitude_slight": "A bit",
  "known.portion.magnitude_clear": "Clearly",
  "known.portion.not_for": "Not applied to {names}. I do not shrink a growing child's plate on a remark that named nobody.",
  "known.portion.not_for_gone": "This was about someone who has left the household, so it applies to nobody.",
  "known.rhythm.present": "{occasion} — yes, this one happens",
  "known.rhythm.absent": "{occasion} — no, not this one",
  "known.logistics.cook_days": "Cooking days: {days}",
  "known.logistics.cooking_time_min": "Up to {n} min at the stove",
  "known.logistics.recipe_difficulty": "Recipes: {level}",
  "known.logistics.variety": "Variety: {level}",
  "known.logistics.budget_amount": "Budget: {amount}",
  "known.difficulty.simple": "simple",
  "known.difficulty.normal": "normal",
  "known.difficulty.keen": "keen to cook",
  "known.variety.repeat": "happy to repeat",
  "known.variety.some": "some variety",
  "known.variety.varied": "varied",
  "known.subject.household": "Everyone at the table",
  "known.subject.gone": "Someone who has left the household",
  "known.refused.body": "{count} stored lines could not be read back, so they are not shown here. They are kept exactly as they are: nothing is deleted, and every save puts them back untouched.",
  "known.store_unreadable": "One of the two stores is not a list at all, so there is nowhere to put back what I cannot read. I will not write over it: saving is refused here until it is repaired, and nothing in it is lost meanwhile.",
  "known.detail_locked": "The detail underneath — the moment, the days, the number — is set on its own screen and does not change here. Only this sentence does.",
  "known.error.load": "I could not read this: {message}",
  "known.error.no_write_port": "This screen cannot save yet: its write port is not installed. Nothing was written, and nothing was lost.",
  "known.error.stale_snapshot": "Something changed here while you were editing. Reload and try again — I would rather refuse than overwrite it.",
  "known.error.write_failed": "The save did not go through, and I cannot tell you why. Nothing was written, and nothing was lost.",
  "known.error.opaque_store": "Nothing was written: one of the two stores is not a list, and writing over it would have destroyed what I cannot read.",
  "known.error.no_goal_row": "There is nothing to write to yet. Set your direction first.",
  "known.error.no_user": "You are not signed in any more.",
  "known.error.bad_items": "I refused that shape rather than store something I could not read back.",
  "known.error.unreadable": "I could not make a line out of that. Nothing was changed.",
  "known.error.generic": "That did not go through.",
  "app.nav.about_you": "What Sophia knows",

  // ── chantier-0903/RAPIDE — début ──
  // A3 · P3, la 4e option d'objectif (2026-09-03). RETIRÉES EN PLACE dans ce pack:
  //   "household.member.goal_none"  — l'option vide de `MouthFields` (/app/household)
  //   "setup.mouths.goal_none"      — l'option vide de l'entonnoir (/app/setup)
  // AJOUTÉES — namespace `household`, déclaré sur /app/setup ET /app/household.
  // Registre ÉDUCATIF (PIVOT-FOYER §8.4): « Eat normally », jamais « keep weight ».
  "household.goal.minor_maintenance": "Eat normally",
  "household.goal.minor_only": "Under 18, this is the only direction offered.",
  "household.goal.minor_switched":
    "Under 18, “{from}” is no longer offered: what gets saved is “Eat normally”.",
  // Les deux refus S4 (`20260822041500`), nés le 2026-08-22 et arrivés en jeton brut
  // pendant douze jours. La phrase nomme le remède que la migration désigne.
  "household.error.goal_not_for_minor":
    "No weight direction for a child: under 18, only “Eat normally” is accepted. Pick it, then set the date.",
  "household.error.target_not_for_minor":
    "No target weight for a child: under 18, nothing is aimed at.",
  // A4 · P4, les idées de repas (2026-09-03, décision D4.1). RETIRÉES EN PLACE dans
  // ce pack — SEPT clés de l'écran `/app/meals` (supprimé), et AUCUNE du
  // vocabulaire du moteur (`meals.slot.*`, `meals.aisle.*`, `meals.tick.*`… restent):
  //   "app.nav.meals"        — l'onglet « Meal ideas » de la barre du bas (KeelAppShell)
  //   "app.nav.meals.short"  — sa forme courte « Meals »
  //   "meals.title"          — « Meal ideas », le titre de la page
  //   "meals.subtitle"       — « Dishes your coach put up for everyone… »
  //   "meals.list.title"     — « From your coach »
  //   "meals.list.empty"     — « Your coach has not put any meal ideas up yet… »
  //   "meals.error"          — « These could not be loaded just now. »
  // GARDÉE, contre la liste de huit du mandat: "meals.loading" — deux appelants
  // vivants sur `/app/plan` (`MealBuilder.tsx`, `StudentWeekPlanPage.tsx`), vus
  // par `tsc` quand on l'a retirée; redéposée près du moteur, avec sa note.
  // Et dans `catalog.ts`: l'entrée `"/app/meals"` de `PAGE_NAMESPACES`. Aucune clé ajoutée.
  // ── chantier-0903/RAPIDE — fin ──

  // ── chantier-0903/FOYER — début ──
  // A6 · P6, le déjeuner en semaine quitte l'étape 3 (2026-09-03, D6.3). AUCUNE
  // clé ajoutée, AUCUNE retirée: le namespace `setup.work_lunch.*` est GARDÉ,
  // déjà déclaré sur /app/household (`catalog.ts`, inchangé). VALEURS CHANGÉES
  // EN PLACE dans ce pack, parce que la carte vit maintenant dans la fiche de
  // chaque bouche, juste au-dessus de sa grille, et que « at the next step »
  // mentait:
  //   "setup.work_lunch.intro"        — « Ask now, and the week comes out
  //                                     right » → « Their week, just below,
  //                                     has the last word »
  //   "setup.work_lunch.outside_note" — « will already be marked … at the next
  //                                     step » → « are marked … in their week,
  //                                     just below »
  //   "setup.work_lunch.grid_wins"    — « the grid at the next step » → « the
  //                                     grid of their week, just below »
  //   "setup.request.presence_intro"  — « Step three said the habit » → the
  //                                     habit is set on the Household page
  // ── chantier-0903/FOYER — fin ──
  // ── chantier-0903/CUISINE — début ──
  //
  // ── A1 · LA VEILLE AUTOMATIQUE (P1) ──────────────────────────────────────
  // Le serveur tranche le timing (`leadDayFor`, coupure à 18 h) et le rend dans
  // `timing`. L'écran RÉPÈTE, il ne recalcule rien: le navigateur ne connaît
  // pas l'heure. Deux phrases, une par `kind` — et AUCUNE variante par `reason`:
  // l'explication complète vit dans `plan_rationale`, côté serveur, et un
  // second jeu de gabarits ici divergerait au premier ajustement.
  "meals.timing.day_before":
    "Shopping and cooking on {day}, the day before: nothing is eaten that day.",
  "meals.timing.same_morning":
    "Shopping and cooking first thing in the morning, so it is ready by lunch.",
  //
  // RETIRÉES PAR CE LOT (la case « je cuisine la veille » n'existe plus, et
  // `CookDayBeforeField.tsx` est supprimé — vérifié appelant par appelant):
  //   · plan.cooking.day_before_label
  //   · plan.cooking.day_before_hint
  //   · plan.cooking.day_before_starts_today
  //   · plan.cooking.day_before_no_room
  // ── chantier-0903/CUISINE — fin ──

} as const
