// Seed anglais — le namespace `coach`, et lui seul.
// Assemblé dans `../en.ts`; une clé `coach.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enCoach = {
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
  "coach.home.invite_resend": "Resend",
  "coach.home.invite_resend_expired": "Send a new link",
  "coach.home.invite_resending": "Sending…",

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
  // deux mots pour le même objectif selon l'écran. Les trois vivent ici, sous un
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
  // ── LES TROIS RETIRÉS, ET OÙ EST LEUR RAISON ──────────────────────────
  // `recomposition`, `performance` et `health` avaient leur libellé ici. Le
  // socle les a retirés le 2026-08-18 (`GOAL_TOKENS`, `RETIRED_GOAL_TOKENS`
  // dans `_shared/keel/tokens.ts`, qui porte le pourquoi et le repli sur
  // `maintenance`); leurs clés sont parties le 2026-09-11. Rien ne peut plus
  // les demander: les lecteurs bouclent sur `GOAL_TOKENS`, pas sur une liste
  // écrite à côté.
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
} as const
