// Seed anglais — le namespace `today`, et lui seul.
// Assemblé dans `../en.ts`; une clé `today.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enToday = {
  // Student today view
  "today.title": "Today",
  "today.greeting": "Hi {name}",
  "today.empty": "Nothing scheduled today. Enjoy your rest day.",
  "today.log_button": "Log it",
  "today.logged_badge": "Logged",
  "today.flex_button": "Declare a deviation",
  "today.flex_remaining": "{count} flex days left this week",
  "today.slot_header": "{slot}",
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
    "Say what you are after, and your week's plan is put together from there — the meals, the shopping and the cooking sessions.",
  "today.no_plan_cta": "Build my week's plan",
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
  "today.own_meals_empty": "Nothing today",
  // Vu quand la composition ne couvre QUE d'autres jours. Ne dit pas « rien
  // pour toi »: les plats existent, ils sont juste ailleurs dans la semaine.
  "today.own_meals_other_days": "Nothing today",
  "today.own_meals_anyday": "Built for no particular day",
  // ── TODAY'S PHOTOS ─────────────────────────────────────────────────────
  // The section stays when there is none: what it shows is the PLACE a photo
  // lands. A block that disappears on the days without one teaches you to
  // stop looking on the days you took one.
  "today.photos_label": "Your photos today",
  "today.photos_empty": "No photos",
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
} as const
