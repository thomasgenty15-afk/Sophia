// Seed anglais — le namespace `student_progress`, et lui seul.
// Assemblé dans `../en.ts`; une clé `student_progress.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enStudentProgress = {
  // ══════════════════════════════════════════════════════════════════════════
  // LOT 6 · `/app/progress` — L'AVANCÉE DE L'ÉLÈVE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ LE NAMESPACE S'APPELLE `student_progress` ET PAS `progress`, ET CE N'EST
  // PAS UN CAPRICE. `progress.*` existait: 36 clés qui servaient
  // `pages/ProgressPage.tsx`, que plus aucun fichier du dépôt n'importait. Y
  // ajouter les clés de l'écran VIVANT aurait forcé à traduire les 36 mortes
  // avec elles — c'est-à-dire à payer de la traduction pour un écran qui
  // n'existe plus, pour la seule raison qu'il avait pris le joli nom. Le nom
  // retenu est celui du composant qui les rend, comme `week.*` au lot 5.
  //
  // ⟳ chantier-0903/SUIVI (A7, D7.12) — le geste à part a été fait le
  // 2026-09-03: `progress.*` et `pages/ProgressPage.tsx` sont partis ensemble.
  // Le namespace garde son nom: le renommer maintenant rebaptiserait 90 clés
  // vivantes pour récupérer un mot, et casserait tous leurs appelants.
  //
  // ⚠️ `/app/progress` s'appelle « Tracking » / « Suivi » à l'écran depuis ce
  // même chantier (`app.nav.progress`). Le CHEMIN, lui, ne bouge pas.
  "student_progress.title": "My progress",
  "student_progress.loading": "Loading…",
  "student_progress.error": "We could not load your data.",
  // Doctrine W3.2 — aucun chiffre affiché quand le plancher TCA est levé. On ne
  // dit pas POURQUOI: nommer le drapeau serait un diagnostic posé par une
  // machine.
  "student_progress.restricted":
    "We are setting the numbers aside for now. What matters this week is how you feel.",
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
  // ÉCRITE EN TÊTE DE CE BLOC. `progress.*` était ORPHELIN et non traduit (36
  // clés, `pages/ProgressPage.tsx`) — les deux sont partis le 2026-09-03
  // (chantier-0903/SUIVI, D7.12), et le namespace garde son nom: y poser
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
  "student_progress.journal.target": "Your daily reference",
  "student_progress.journal.target_goal_down": "Weight-loss goal",
  "student_progress.journal.target_goal_up": "Weight-gain goal",
  "student_progress.journal.target_goal_other": "Daily energy reference",
  "student_progress.journal.target_date": "Based on your measurement from {date}",
  // 2026-09-21 — the calculation, step by step, behind a "Detail" button.
  // ⛔ No verdict and no remainder on any of these labels: "you have N kcal
  // left" is a tracker's sentence, and it exists nowhere in this chain.
  "student_progress.journal.detail": "Detail",
  "student_progress.journal.detail_close": "Close the detail",
  "student_progress.journal.detail_title": "Where this number comes from",
  "student_progress.journal.detail_weight": "Your weight",
  // ⛔ 2026-09-21 — never rendered: the seam detector refused its row (it
  // needed `setup.activity.*`, outside this page's declared namespaces).
  "student_progress.journal.detail_activity": "Your days",
  "student_progress.journal.detail_per_kg": "Per kilo",
  "student_progress.journal.detail_per_kg_value": "{low} to {high} kcal",
  "student_progress.journal.detail_maintenance": "Your estimated upkeep",
  "student_progress.journal.detail_delta": "Your goal",
  "student_progress.journal.detail_total": "Your daily reference",
  "student_progress.journal.detail_chain_body_equation":
    "Worked out from your body — your height, weight, age, sex and how your days go.",
  "student_progress.journal.detail_chain_weight_per_kg":
    "Worked out from your weight and how your days go. We will use your whole body as soon as we know your height and date of birth.",
  "student_progress.journal.detail_reserve":
    "This is an estimate, not a measurement. Two bodies identical on paper do not spend the same — hence a range, and not a single figure.",
  "student_progress.journal.target_missing": "Your daily reference is not available yet.",
  "student_progress.journal.week": "Your week on a plate",
  "student_progress.journal.previous": "Previous week",
  "student_progress.journal.next": "Next week",
  "student_progress.journal.today": "Today",
  "student_progress.journal.all": "Whole week",
  "student_progress.journal.day_complete": "Filled in",
  "student_progress.journal.day_incomplete": "To complete",
  "student_progress.journal.day_progress": "In progress",
  "student_progress.journal.day_future": "Upcoming",
  "student_progress.journal.day_free": "Free entry",
  "student_progress.journal.empty": "No meal has been recorded for this day.",
  "student_progress.journal.add": "Add a meal",
  "student_progress.journal.add_photo": "Add a photo",
  "student_progress.journal.describe": "Describe",
  "student_progress.journal.skip": "Meal skipped",
  "student_progress.journal.correct": "Correct",
  "student_progress.journal.planned": "Plan",
  "student_progress.journal.open_plan": "Open the plan",
  "student_progress.journal.outside": "Outside the plan",
  "student_progress.journal.extra": "Additional meal",
  "student_progress.journal.fixed": "Usual intake",
  "student_progress.journal.leftovers": "Leftovers",
  "student_progress.journal.unattached": "To attach",
  "student_progress.journal.state_confirmed": "confirmed",
  "student_progress.journal.state_planned": "counted as planned",
  "student_progress.journal.state_missing": "nothing recorded",
  "student_progress.journal.state_skipped": "not eaten",
  "student_progress.journal.state_future": "upcoming",
  "student_progress.journal.planned_kcal": "{kcal} kcal planned",
  "student_progress.journal.reported_kcal": "{kcal} kcal recorded",
  "student_progress.journal.reported_estimated": "Approximately {kcal} kcal recorded",
  "student_progress.journal.subtotal": "Recorded subtotal: {kcal} kcal",
  "student_progress.journal.total": "Recorded total: {kcal} kcal",
  "student_progress.journal.incomplete_note": "Meals still missing are not included in this figure.",
  "student_progress.journal.no_total": "No calorie total is available for the recorded meals.",
  "student_progress.journal.analysis_unavailable": "Recorded; the calorie estimate is unavailable.",
  "student_progress.journal.analysis_pending": "Recorded; the analysis is still pending.",
  "student_progress.journal.retry": "Try the analysis again",
  "student_progress.journal.readonly": "Meals over 14 days old can be viewed but no longer changed.",
  "student_progress.journal.dialog_title": "Record this meal",
  "student_progress.journal.dialog_date": "Meal date",
  "student_progress.journal.dialog_slot": "Time of day",
  "student_progress.journal.dialog_prompt": "Describe what you ate, in your own words.",
  "student_progress.journal.dialog_placeholder": "For example: a salad, bread and yogurt",
  "student_progress.journal.dialog_relation": "How does it relate to the plan?",
  "student_progress.journal.dialog_as_planned": "This is the planned meal",
  "student_progress.journal.dialog_replacement": "I ate this instead",
  "student_progress.journal.dialog_outside": "Meal outside the plan",
  "student_progress.journal.dialog_extra": "Something extra",
  "student_progress.journal.dialog_save": "Save",
  "student_progress.journal.dialog_saving": "Saving…",
  "student_progress.journal.photo_saving": "Uploading photo…",
  "student_progress.journal.error": "This change could not be saved. {message}",
  "student_progress.journal.error_date_readonly": "This meal is outside the 14-day correction window.",
  "student_progress.journal.error_bad_slot": "Choose a valid time of day.",
  "student_progress.journal.error_bad_text": "Add a short description of the meal.",
  "student_progress.journal.error_bad_request": "This request has expired. Please try again.",
  "student_progress.journal.error_stale": "This meal changed. Reload the page and try again.",
  "student_progress.journal.error_unavailable": "The food journal is temporarily unavailable.",
  "student_progress.journal.error_analysis_unavailable": "The analysis could not be restarted right now.",
  "student_progress.journal.error_unknown": "Please try again.",
  "student_progress.journal.weight": "Your weight over time",
} as const
