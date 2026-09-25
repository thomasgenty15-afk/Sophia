// FF-066 · L'aide sur l'app — LES FICHES.
//
// Une fiche répond à une question qu'une personne pose sur l'app (« où est ma
// liste de courses ? », « la photo, c'est compté ? »). Elle ne part au modèle
// QUE sur le tour où la question est posée (`block.ts`), au plus trois par tour.
//
// ── CE QUE CE FICHIER GARANTIT, ET COMMENT ───────────────────────────────────
// - Chaque fait a été relu dans le code le 2026-09-23. La fiche dit ce que fait
//   le CODE, pas ce que dit une doc produit (FF-066 R6).
// - Chaque bouton cité figure dans `labels`, avec sa clé i18n et son texte exact
//   en français et en anglais. `frontend/src/keel/i18n/appHelpLabels.int.test.ts`
//   compare chaque texte à `fr.ts` / `en.ts`, et chaque route à `App.tsx`: un
//   bouton renommé fait échouer un test, pas une réponse (R3).
// - Aucune fiche ne contient le nom de code interne ni le mot « coach »
//   (`cards_test.ts`): le texte injecté au modèle est une surface utilisateur.
//
// ⛔ AUCUN IMPORT. Ce fichier est lu par Deno (le cerveau) ET par vitest (le
// test des libellés côté front). Un import `npm:` ou par URL casserait vitest.

export const APP_HELP_LOCALES = ["fr", "en"] as const;
export type AppHelpLocale = (typeof APP_HELP_LOCALES)[number];

/**
 * QUI DEMANDE. Choisi par le runtime depuis la base (`household_members`),
 * jamais par le modèle (R5).
 *  - `solo`   : aucun foyer, ou un foyer dont la personne est seule titulaire
 *               et seule à table;
 *  - `owner`  : titulaire d'un foyer de plusieurs personnes;
 *  - `member` : personne ayant réclamé sa place dans le foyer de quelqu'un.
 */
export type AppHelpRole = "solo" | "owner" | "member";
/** Mêmes jetons que `GOAL_TOKENS` (`_shared/keel/tokens.ts`). */
export type AppHelpGoal = "fat_loss" | "muscle_gain" | "maintenance";

export type AppHelpText = Readonly<Record<AppHelpLocale, readonly string[]>>;

export type AppHelpLabel = Readonly<{
  /**
   * La clé i18n (`frontend/src/keel/i18n/fr.ts` et `en.ts`). Le test des
   * libellés vérifie que `fr` et `en` ci-dessous sont EXACTEMENT ses valeurs.
   * Un texte écrit hors i18n (un e-mail composé côté serveur) se désigne par
   * `file:<chemin depuis la racine du dépôt>`: le test vérifie qu'il y figure.
   */
  key: string;
  fr: string;
  en: string;
}>;

export type AppHelpVariant = Readonly<{
  /** Toutes les conditions posées doivent tenir. Une condition absente ne filtre pas. */
  when: Readonly<{
    roles?: readonly AppHelpRole[];
    goals?: readonly (AppHelpGoal | null)[];
  }>;
  answer: AppHelpText;
}>;

export type AppHelpCard = Readonly<{
  id: AppHelpTopicId;
  /** Le titre, dans les deux langues. Sert aussi à la fiche `unknown_feature`. */
  title: Readonly<Record<AppHelpLocale, string>>;
  /**
   * UNE ligne, sans accent, lue par le DISPATCHER pour choisir la fiche
   * (`dispatcher.prompts.ts`, règle 6-sexies). Elle décrit la QUESTION, pas la
   * réponse.
   */
  dispatcherHint: string;
  /** La réponse par défaut: vraie quel que soit le profil, conditions énoncées. */
  answer: AppHelpText;
  /** Réponses plus précises selon le profil. La PREMIÈRE qui correspond gagne. */
  variants?: readonly AppHelpVariant[];
  /** Ce qu'il ne faut PAS promettre, dans les deux langues. */
  doesNotExist?: AppHelpText;
  /** Chaque bouton ou écran cité dans une réponse. */
  labels: readonly AppHelpLabel[];
  /** Chaque route citée. Vérifiées contre `App.tsx`. */
  routes: readonly string[];
}>;

export const APP_HELP_TOPIC_IDS = [
  // Le plan
  "plan_create",
  "plan_composing_time",
  "plan_adopt",
  "plan_change_dish",
  "plan_window",
  "plan_absence",
  "plan_settings",
  "plan_one_session",
  "plan_envy",
  "plan_end_feedback",
  "plan_calories_display",
  // Cuisine et courses
  "shopping_list",
  "shopping_tick",
  "cooking_sessions",
  "boxes_freezer",
  // Suivi
  "meal_default_eaten",
  "meal_not_eaten",
  "meal_photo_how",
  "meal_photo_counted",
  "meal_describe",
  "meal_correct_past",
  "weight_entry",
  "progress_page",
  "energy_number_origin",
  // Foyer
  "household_add_person",
  "household_invite",
  "household_member_rights",
  "household_who_composes",
  "household_allergy_rule",
  "household_remove",
  "household_paused",
  // Ma fiche — ⟳ 2026-09-24: manquaient au premier catalogue. « comment je
  // modifie les créneaux des repas ? » tombait sur `plan_settings` (budget,
  // courses), et Sophia répondait n'avoir rien sous la main.
  "meal_slots",
  "food_preferences_self",
  "body_details",
  "goal_change",
  // Sophia
  "notifications_off",
  "sophia_evening_messages",
  "sophia_memory",
  "sophia_can_do",
  "voice_and_push",
  "install_app",
  // Compte et abonnement
  "price_trial",
  "subscription_cancel",
  "language_change",
  "email_change",
  "password_change",
  "account_delete",
  "data_export",
  "emails_unsubscribe",
  // Le reste
  "unknown_feature",
] as const;
export type AppHelpTopicId = (typeof APP_HELP_TOPIC_IDS)[number];

/**
 * La fiche des choses qui n'existent pas. Sa réponse est construite par
 * `block.ts` à partir des TITRES de toutes les autres fiches: la liste de ce
 * qui existe ne peut donc pas diverger de ce que les fiches couvrent.
 */
export const APP_HELP_UNKNOWN_TOPIC: AppHelpTopicId = "unknown_feature";

/** Les fiches qui expliquent un geste photo — voir `photoTopicsIn` (`block.ts`). */
export const APP_HELP_PHOTO_TOPICS: readonly AppHelpTopicId[] = [
  "meal_photo_how",
  "meal_photo_counted",
  "meal_not_eaten",
  "meal_describe",
  "meal_correct_past",
];

/**
 * Les fiches qui parlent de CHIFFRES (calories, repère, poids). Elles ne partent
 * pas quand le plancher de restriction alimentaire est levé (FF-021) ni à un
 * mineur: leur expliquer où voir un nombre de calories, ce serait encore leur
 * parler de calories. Voir `appHelpTopicsAllowed` (`block.ts`).
 */
export const APP_HELP_NUMBER_TOPICS: readonly AppHelpTopicId[] = [
  "plan_calories_display",
  "energy_number_origin",
  "meal_photo_counted",
  "weight_entry",
  "progress_page",
  "body_details",
  "goal_change",
];

export const APP_HELP_CARDS: readonly AppHelpCard[] = [
  {
    id: "plan_create",
    title: { fr: "Créer son plan", en: "Creating your plan" },
    dispatcherHint: "comment creer, composer ou generer son plan de repas, par ou commencer",
    answer: {
      fr: [
        "Le tout premier plan se fait dans l'écran « Organisons-nous », en trois étapes : pour combien de personnes tu cuisines, qui mange, puis ce plan-ci (dates, façon de cuisiner, courses, budget). Le dernier bouton est « Construire mon premier plan ».",
        "Ensuite tout se passe dans « Mon plan » : sans plan, le formulaire « Nouveau plan » s'ouvre tout seul ; avec un plan, « Préparer le plan suivant » et « Composer un autre plan » sont au bout de la ligne « Tes repas ».",
        "Chaque composition passe par un aperçu : rien n'est enregistré comme plan avant « Adopter ce plan ».",
        "Depuis « Aujourd’hui », sans plan, le bouton « Construire mon plan de la semaine » mène au même endroit.",
      ],
      en: [
        "The very first plan is made in the “Let’s get organised” screen, in three steps: how many people you cook for, who eats, then this plan (dates, cooking style, food shops, budget). The last button is “Build my first plan”.",
        "After that everything happens in “My plan”: with no plan, the “New plan” form opens by itself; with a plan, “Prepare next plan” and “Build another plan” sit at the end of the “Your meals” row.",
        "Every composition goes through a preview: nothing is saved as a plan before “Adopt this plan”.",
        "From “Today”, with no plan, the “Build my week's plan” button leads to the same place.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Dans un foyer, c'est la personne qui tient le foyer qui compose le plan ; un membre ne peut pas en composer un.",
            "Dans « Mon plan », ta part s'affiche dans la carte « Ta part », avec « Ce que la maison cuisine ».",
            "Tu peux déclarer tes absences avec « Qui est là ? Jour par jour ».",
          ],
          en: [
            "In a household, the person who runs it composes the plan; a member cannot compose one.",
            "In “My plan”, your share shows in the “Your share” card, with “What the house is cooking”.",
            "You can declare your absences with “Who's in? Day by day”.",
          ],
        },
      },
    ],
    doesNotExist: {
      fr: [
        "Sophia ne compose pas de plan depuis la conversation.",
      ],
      en: [
        "Sophia does not compose a plan from the chat.",
      ],
    },
    labels: [
      { key: "setup.title", fr: "Organisons-nous", en: "Let’s get organised" },
      { key: "setup.plan.compose", fr: "Construire mon premier plan", en: "Build my first plan" },
      { key: "app.nav.plan", fr: "Mon plan", en: "My plan" },
      { key: "meals.form.title", fr: "Nouveau plan", en: "New plan" },
      { key: "meals.rebuild.prepare_next", fr: "Préparer le plan suivant", en: "Prepare next plan" },
      { key: "meals.rebuild.button", fr: "Composer un autre plan", en: "Build another plan" },
      { key: "meals.result.title", fr: "Tes repas", en: "Your meals" },
      { key: "plan.draft.adopt", fr: "Adopter ce plan", en: "Adopt this plan" },
      { key: "app.nav.today", fr: "Aujourd’hui", en: "Today" },
      { key: "today.no_plan_cta", fr: "Construire mon plan de la semaine", en: "Build my week's plan" },
      { key: "plan.mine.title", fr: "Ta part", en: "Your share" },
      { key: "plan.mine.household_dishes", fr: "Ce que la maison cuisine", en: "What the house is cooking" },
      { key: "meals.picker.open", fr: "Qui est là ? Jour par jour", en: "Who's in? Day by day" },
    ],
    routes: ["/app/setup", "/app/plan", "/app/today"],
  },
  {
    id: "plan_composing_time",
    title: { fr: "Le temps de composition", en: "How long a plan takes" },
    dispatcherHint: "combien de temps prend la composition, plan qui tourne ou bloque, plan qui ne s'est pas genere",
    answer: {
      fr: [
        "Composer un plan prend en moyenne 2 à 3 minutes ; la carte « Ton plan se compose » montre où ça en est.",
        "On peut quitter la page : la composition continue, et en revenant on retrouve l'attente, ou l'aperçu prêt (pendant 24 heures).",
        "Si elle s'arrête en route, elle est relancée une fois toute seule. Si elle échoue, rien n'est modifié.",
        "Le plan en cours reste affiché pendant ce temps : il n'est remplacé qu'à l'adoption du nouveau.",
        "Si c'est long, ne relance pas une seconde composition : attends quelques minutes et recharge la page.",
      ],
      en: [
        "Composing a plan takes two to three minutes on average; the “Your plan is being composed” card shows how far it has got.",
        "You can leave the page: the composition keeps going, and when you come back you find the wait, or the finished preview (for 24 hours).",
        "If it stops midway, it is relaunched once on its own. If it fails, nothing is changed.",
        "Your current plan stays on screen meanwhile: it is only replaced when you adopt the new one.",
        "If it is taking long, do not start a second one: wait a few minutes and reload the page.",
      ],
    },
    doesNotExist: {
      fr: [
        "une barre de progression en pourcentage",
      ],
      en: [
        "a percentage progress bar",
      ],
    },
    labels: [
      { key: "plan.composing.title", fr: "Ton plan se compose", en: "Your plan is being composed" },
    ],
    routes: ["/app/plan"],
  },
  {
    id: "plan_adopt",
    title: { fr: "Valider un plan", en: "Confirming a plan" },
    dispatcherHint: "comment valider, adopter ou enregistrer le plan propose, ou abandonner l'apercu",
    answer: {
      fr: [
        "Dans l'aperçu « Ce que donnerait ton plan », le bouton « Adopter ce plan » enregistre le plan ; quand il remplace un plan existant, il s'appelle « Remplacer mon plan par celui-ci ».",
        "Avant ça, rien n'est enregistré comme plan. Les réglages (budget, courses, équipement, absences) et les phrases d'ajustement sont, eux, déjà gardés.",
        "« Laisser tomber » ferme l'aperçu sans l'adopter ; il se rouvre à la prochaine visite pendant 24 heures.",
        "Un plan adopté ne s'annule pas : on peut seulement en composer un autre.",
      ],
      en: [
        "In the “What your plan would look like” preview, the “Adopt this plan” button saves the plan; when it replaces an existing plan, it is called “Replace my plan with this one”.",
        "Before that, nothing is saved as a plan. Settings (budget, food shops, equipment, absences) and adjustment sentences are already kept, though.",
        "“Drop it” closes the preview without adopting it; it reopens on your next visit for 24 hours.",
        "An adopted plan cannot be undone: you can only compose another one.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Seule la personne qui tient le foyer compose et adopte un plan ; ta part apparaît dans « Ta part » une fois le plan adopté.",
          ],
          en: [
            "Only the person who runs the household composes and adopts a plan; your share appears in “Your share” once it is adopted.",
          ],
        },
      },
    ],
    labels: [
      { key: "plan.draft.title", fr: "Ce que donnerait ton plan", en: "What your plan would look like" },
      { key: "plan.draft.adopt", fr: "Adopter ce plan", en: "Adopt this plan" },
      { key: "plan.draft.adopt_replace", fr: "Remplacer mon plan par celui-ci", en: "Replace my plan with this one" },
      { key: "plan.draft.discard", fr: "Laisser tomber", en: "Drop it" },
      { key: "plan.mine.title", fr: "Ta part", en: "Your share" },
    ],
    routes: ["/app/plan"],
  },
  {
    id: "plan_change_dish",
    title: { fr: "Changer un plat", en: "Changing a dish" },
    dispatcherHint: "changer, echanger (swap) ou refaire un plat du plan: le GESTE dans l'app, pas le choix d'un aliment",
    answer: {
      fr: [
        "Un plat se change seulement dans l'aperçu, avant l'adoption : bouton « Ajuster le plan », puis une phrase de 280 signes au plus (par exemple : trop de poisson, plus de pâtes pour les enfants).",
        "Si la phrase vise des plats précis, seuls ceux-là sont refaits ; sinon tout le plan est recomposé. Deux reprises possibles par aperçu.",
        "Les goûts écrits dans cette phrase sont retenus pour la suite.",
        "Une fois le plan adopté, aucun plat ne se change : « Composer un autre plan » recompose tout le plan, en passant par un nouvel aperçu.",
      ],
      en: [
        "A dish can only be changed in the preview, before adopting: the “Adjust the plan” button, then one sentence of 280 characters at most (for example: too much fish, more pasta for the kids).",
        "If the sentence names specific dishes, only those are redone; otherwise the whole plan is recomposed. Two redos per preview.",
        "Tastes written in that sentence are remembered for later.",
        "Once the plan is adopted, no dish can be changed: “Build another plan” recomposes the whole plan, through a new preview.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "C'est la personne qui tient le foyer qui compose et ajuste le plan ; un membre ne peut pas changer un plat.",
          ],
          en: [
            "The person who runs the household composes and adjusts the plan; a member cannot change a dish.",
          ],
        },
      },
    ],
    doesNotExist: {
      fr: [
        "un bouton pour échanger un plat sur un plan adopté",
      ],
      en: [
        "a button to swap a dish on an adopted plan",
      ],
    },
    labels: [
      { key: "plan.draft.remix", fr: "Ajuster le plan", en: "Adjust the plan" },
      { key: "meals.rebuild.button", fr: "Composer un autre plan", en: "Build another plan" },
    ],
    routes: ["/app/plan"],
  },
  {
    id: "plan_window",
    title: { fr: "Durée d'un plan, plan suivant", en: "Plan length, next plan" },
    dispatcherHint: "duree d'un plan: plan de plus de 7 jours, de deux semaines ou d'un mois, preparer la semaine suivante, plusieurs plans",
    answer: {
      fr: [
        "Un plan couvre de 1 à 7 jours, à partir d'aujourd'hui ou d'un jour à venir.",
        "Pour la suite, « Préparer le plan suivant » prépare un plan qui commence le lendemain de la fin du plan en cours ; les deux s'affichent dans les onglets « Cette semaine » et « Suivant ».",
        "Faire commencer le nouveau plan plus tôt raccourcit le plan en cours, et l'écran le signale avant.",
      ],
      en: [
        "A plan covers 1 to 7 days, starting today or on a later day.",
        "For what comes next, “Prepare next plan” prepares a plan starting the day after the current one ends; both show in the “This week” and “Next” tabs.",
        "Starting the new plan earlier shortens the current one, and the screen warns you first.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Un plan couvre de 1 à 7 jours ; c'est la personne qui tient le foyer qui prépare le suivant.",
          ],
          en: [
            "A plan covers 1 to 7 days; the person who runs the household prepares the next one.",
          ],
        },
      },
    ],
    doesNotExist: {
      fr: [
        "un plan de plus de 7 jours",
      ],
      en: [
        "a plan longer than 7 days",
      ],
    },
    labels: [
      { key: "meals.rebuild.prepare_next", fr: "Préparer le plan suivant", en: "Prepare next plan" },
      { key: "meals.result.tab_current", fr: "Cette semaine", en: "This week" },
      { key: "meals.result.tab_next", fr: "Suivant", en: "Next" },
    ],
    routes: ["/app/plan"],
  },
  {
    id: "plan_absence",
    title: { fr: "Dire qu'on ne sera pas là", en: "Saying you won't be there" },
    dispatcherHint: "declarer une absence, un repas pris ailleurs a l'avance, qui mange a la maison quel jour",
    answer: {
      fr: [
        "Avant de composer, « Qui est là ? Jour par jour » ouvre la grille des repas jour par jour : décoche un repas que tu ne prendras pas à la maison, puis « Enregistrer ».",
        "Un repas décoché n'est ni cuisiné ni acheté.",
        "Ça vaut pour le prochain plan composé ; un plan déjà adopté ne change pas.",
        "Dans un foyer, la ligne « Qui mange à la maison » du formulaire montre chaque personne, avec « Modifier » pour régler ses repas.",
      ],
      en: [
        "Before composing, “Who's in? Day by day” opens the day-by-day meal grid: untick a meal you won't be eating at home, then “Save”.",
        "An unticked meal is neither cooked nor bought.",
        "It applies to the next plan composed; a plan already adopted does not change.",
        "In a household, the “Who eats at home” line of the form lists each person, with “Edit” to set their meals.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "En haut de « Mon plan », « Qui est là ? Jour par jour » ouvre ta grille : décoche les repas que tu ne prendras pas à la maison, puis « Enregistrer ».",
            "Rien n'est cuisiné ni acheté pour un repas décoché, à partir du prochain plan composé.",
          ],
          en: [
            "At the top of “My plan”, “Who's in? Day by day” opens your grid: untick the meals you won't be eating at home, then “Save”.",
            "Nothing is cooked or bought for an unticked meal, from the next plan composed.",
          ],
        },
      },
    ],
    labels: [
      { key: "meals.picker.open", fr: "Qui est là ? Jour par jour", en: "Who's in? Day by day" },
      { key: "meals.picker.save", fr: "Enregistrer", en: "Save" },
      { key: "plan.request.presence_title", fr: "Qui mange à la maison", en: "Who eats at home" },
      { key: "plan.request.presence_open", fr: "Modifier", en: "Edit" },
      { key: "app.nav.plan", fr: "Mon plan", en: "My plan" },
    ],
    routes: ["/app/plan", "/app/setup"],
  },
  {
    id: "plan_settings",
    title: { fr: "Budget, courses, sessions de cuisine", en: "Budget, food shops, cooking sessions" },
    dispatcherHint: "changer son budget, le nombre de courses, le nombre de sessions de cuisine, le temps par session ou son equipement de cuisine",
    answer: {
      fr: [
        "Budget, nombre de sessions, temps par session et nombre de courses se règlent dans le formulaire de composition : « Budget des courses », « Combien de fois tu veux cuisiner », « Temps par session de cuisine (environ) », « Courses ».",
        "Ils valent pour le prochain plan composé ; le plan en cours ne change pas. Le nombre de sessions se choisit à chaque plan, les autres réglages sont gardés.",
        "Les options impossibles pour ce plan sont grisées, avec la raison : sans congélateur, il faut cuisiner plus souvent sur un plan long, et une durée trop courte pour tous les repas n'est pas proposée (30 min seulement quand chaque session couvre 2 jours au plus). Un choix que les dates ou les autres réponses rendent impossible passe tout seul au plus proche possible.",
        "L'équipement se règle dans « Avec quoi tu cuisines », dans ce formulaire ou dans « Foyer » → « Paramètres du foyer » ; chaque clic est enregistré.",
        "Le budget est obligatoire. S'il est trop bas pour les repas demandés, l'écran donne le minimum.",
      ],
      en: [
        "Budget, number of sessions, time per session and number of food shops are set in the composition form: “Shopping budget”, “How many times you want to cook”, “Time per cooking session (approx.)”, “Food shops”.",
        "They apply to the next plan composed; the current plan does not change. The number of sessions is chosen for each plan; the other settings are kept.",
        "Options that cannot work for this plan are greyed out, with the reason: without a freezer, a long plan needs more frequent cooking, and a time too short for all the meals is not offered (30 min only when each session covers 2 days at most). A choice that the dates or the other answers make impossible moves by itself to the nearest possible one.",
        "Equipment is set in “What you cook with”, in that form or in “Household” → “Household settings”; every click is saved.",
        "The budget is required. If it is too low for the meals asked, the screen gives the minimum.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Budget, courses, sessions de cuisine et équipement sont réglés par la personne qui tient le foyer.",
          ],
          en: [
            "Budget, food shops, cooking sessions and equipment are set by the person who runs the household.",
          ],
        },
      },
    ],
    labels: [
      { key: "plan.cooking.budget_label", fr: "Budget des courses", en: "Shopping budget" },
      { key: "plan.cooking.sessions_label", fr: "Combien de fois tu veux cuisiner", en: "How many times you want to cook" },
      { key: "plan.cooking.time_label", fr: "Temps par session de cuisine (environ)", en: "Time per cooking session (approx.)" },
      { key: "plan.cooking.runs_label", fr: "Courses", en: "Food shops" },
      { key: "setup.equipment.title", fr: "Avec quoi tu cuisines", en: "What you cook with" },
      { key: "app.nav.household", fr: "Foyer", en: "Household" },
      { key: "household.settings.title", fr: "Paramètres du foyer", en: "Household settings" },
    ],
    routes: ["/app/plan", "/app/household"],
  },
  {
    id: "plan_one_session",
    title: { fr: "Tout cuisiner en une fois", en: "Cooking everything at once" },
    dispatcherHint: "cuisiner une seule fois pour toute la semaine, batch cooking",
    answer: {
      fr: [
        "Dans le formulaire de composition, choisis « Une fois » dans « Combien de fois tu veux cuisiner » : sur un plan long, le surplus part au congélateur et se sort la veille.",
        "Sans « Congélateur » coché dans « Avec quoi tu cuisines », l'option n'est proposée que pour un plan court, qu'un plat cuisiné tient au frigo ; sinon elle est grisée.",
        "Ça impose une seule course, et le choix n'est pas gardé d'un plan à l'autre.",
      ],
      en: [
        "In the composition form, choose “Once” in “How many times you want to cook”: on a long plan, the extra goes in the freezer and comes out the night before.",
        "Without “Freezer” ticked in “What you cook with”, the option is only offered for a short plan that a cooked dish keeps in the fridge; otherwise it is greyed out.",
        "It means a single food shop, and the choice is not kept from one plan to the next.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Ce choix appartient à la personne qui tient le foyer, quand elle compose le plan.",
          ],
          en: [
            "That choice belongs to the person who runs the household, when they compose the plan.",
          ],
        },
      },
    ],
    doesNotExist: {
      fr: [
        "choisir le jour de la session unique",
      ],
      en: [
        "choosing the day of the single session",
      ],
    },
    labels: [
      { key: "plan.cooking.sessions_label", fr: "Combien de fois tu veux cuisiner", en: "How many times you want to cook" },
      { key: "plan.cooking.sessions_1", fr: "Une fois", en: "Once" },
      { key: "setup.equipment.tool_freezer", fr: "Congélateur", en: "Freezer" },
      { key: "setup.equipment.title", fr: "Avec quoi tu cuisines", en: "What you cook with" },
    ],
    routes: ["/app/plan"],
  },
  {
    id: "plan_envy",
    title: { fr: "Demander une envie", en: "Asking for something you fancy" },
    dispatcherHint: "demander un plat ou une envie pour le prochain plan",
    answer: {
      fr: [
        "Dans le formulaire de composition, le champ « Envies » prend une phrase libre (par exemple : Léa veut des pâtes).",
        "Elle vaut pour la semaine où commence le plan ; une nouvelle envie remplace la précédente.",
        "À la fin d'un plan, le questionnaire de retour propose aussi « Une envie pour la suite ».",
      ],
      en: [
        "In the composition form, the “Wishes” field takes a free sentence (for example: Lea wants pasta).",
        "It applies to the week the plan starts; a new wish replaces the previous one.",
        "At the end of a plan, the review form also offers “Anything you fancy next”.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Seule la personne qui tient le foyer peut écrire une envie pour le plan.",
          ],
          en: [
            "Only the person who runs the household can write a wish for the plan.",
          ],
        },
      },
    ],
    labels: [
      { key: "plan.envy.title", fr: "Envies", en: "Wishes" },
      { key: "plan.feedback.envy_title", fr: "Une envie pour la suite", en: "Anything you fancy next" },
    ],
    routes: ["/app/plan"],
  },
  {
    id: "plan_end_feedback",
    title: { fr: "Le retour de fin de plan", en: "The end-of-plan review" },
    dispatcherHint: "le questionnaire de fin de plan, donner son avis sur un plan termine",
    answer: {
      fr: [
        "Quand un plan se termine, le questionnaire « Ce plan est fini » s'ouvre de lui-même dans « Mon plan » : chaque plat avec « Encore » ou « Sans moi », puis quelques questions.",
        "« Envoyer » enregistre les réponses ; elles servent au plan suivant.",
        "« Pas maintenant » le ferme pour de bon pour ce plan-là. Un seul retour par plan.",
        "Sophia peut aussi poser ces questions dans la conversation.",
      ],
      en: [
        "When a plan ends, the “This plan is over” form opens by itself in “My plan”: each dish with “Again” or “Not again”, then a few questions.",
        "“Send” saves the answers; they feed the next plan.",
        "“Not now” closes it for good for that plan. One review per plan.",
        "Sophia can also ask these questions in the chat.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Le questionnaire de fin de plan s'adresse à la personne qui tient le foyer.",
          ],
          en: [
            "The end-of-plan review goes to the person who runs the household.",
          ],
        },
      },
    ],
    labels: [
      { key: "plan.feedback.title", fr: "Ce plan est fini", en: "This plan is over" },
      { key: "app.nav.plan", fr: "Mon plan", en: "My plan" },
      { key: "plan.feedback.again", fr: "Encore", en: "Again" },
      { key: "plan.feedback.not_again", fr: "Sans moi", en: "Not again" },
      { key: "plan.feedback.send", fr: "Envoyer", en: "Send" },
      { key: "plan.feedback.dismiss", fr: "Pas maintenant", en: "Not now" },
    ],
    routes: ["/app/plan"],
  },
  {
    id: "plan_calories_display",
    title: { fr: "Voir ou masquer les calories", en: "Showing or hiding calories" },
    dispatcherHint: "afficher, masquer ou cacher les calories, pourquoi je ne vois pas les kcal",
    answer: {
      fr: [
        "Quand l'affichage est ouvert, chaque plat montre ses calories et chaque jour son total, calculés depuis les quantités du plan.",
        "Pour les afficher ou les masquer : menu → « Ce que Sophia sait », section « Ce que ton plan affiche », bouton « Afficher les calories » ou « Masquer les calories ». Il faut un plan en cours ou à venir.",
        "Sans choix de ta part, elles s'affichent pour un objectif de perte de poids ou de prise de muscle, pas pour le maintien.",
        "Elles ne s'affichent jamais avant 18 ans ni sans date de naissance ; la section n'apparaît alors pas.",
        "Le PDF des courses ne montre jamais de calories.",
      ],
      en: [
        "When the display is on, each dish shows its calories and each day its total, worked out from the quantities in the plan.",
        "To show or hide them: menu → “What Sophia knows”, section “What your plan shows”, button “Show calories” or “Hide calories”. You need a current or upcoming plan.",
        "If you have not chosen, they show for a weight-loss or muscle-gain goal, not for maintenance.",
        "They never show under 18 or without a date of birth; the section does not appear then.",
        "The shopping PDF never shows calories.",
      ],
    },
    labels: [
      { key: "app.nav.about_you", fr: "Ce que Sophia sait", en: "What Sophia knows" },
      { key: "plan.section.numbers.title", fr: "Ce que ton plan affiche", en: "What your plan shows" },
      { key: "meals.energy.switch_on", fr: "Afficher les calories", en: "Show calories" },
      { key: "meals.energy.switch_off", fr: "Masquer les calories", en: "Hide calories" },
    ],
    routes: ["/app/about-you", "/app/plan"],
  },
  {
    id: "shopping_list",
    title: { fr: "La liste de courses", en: "The shopping list" },
    dispatcherHint: "ou est la liste de courses, l'imprimer ou l'exporter en PDF",
    answer: {
      fr: [
        "Dans « Mon plan », le bouton « Liste de courses » ouvre la liste, rangée par rayon ; dans « Aujourd’hui », c'est « Ouvrir la liste ».",
        "« Enregistrer en PDF » crée un PDF de la liste et des repas ; il est aussi envoyé dans la conversation avec Sophia.",
        "La liste n'apparaît pas pendant qu'un plan se compose, ni quand elle est vide.",
      ],
      en: [
        "In “My plan”, the “Shopping list” button opens the list, sorted by aisle; in “Today”, it is “Open the list”.",
        "“Save as PDF” makes a PDF of the list and the meals; it is also posted in the chat with Sophia.",
        "The list does not show while a plan is being composed, or when it is empty.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "La liste de courses du foyer est chez la personne qui le tient ; elle ne s'affiche pas dans ton compte.",
          ],
          en: [
            "The household shopping list lives with the person who runs it; it does not show in your account.",
          ],
        },
      },
    ],
    doesNotExist: {
      fr: [
        "partager ou envoyer la liste à quelqu'un d'autre depuis l'app",
      ],
      en: [
        "sharing or sending the list to someone else from the app",
      ],
    },
    labels: [
      { key: "app.nav.plan", fr: "Mon plan", en: "My plan" },
      { key: "meals.result.shopping_title", fr: "Liste de courses", en: "Shopping list" },
      { key: "app.nav.today", fr: "Aujourd’hui", en: "Today" },
      { key: "meals.today.shop_open", fr: "Ouvrir la liste", en: "Open the list" },
      { key: "meals.shopping.pdf", fr: "Enregistrer en PDF", en: "Save as PDF" },
    ],
    routes: ["/app/plan", "/app/today"],
  },
  {
    id: "shopping_tick",
    title: { fr: "Cocher la liste de courses", en: "Ticking the shopping list" },
    dispatcherHint: "cocher un article de la liste de courses, est-ce enregistre",
    answer: {
      fr: [
        "Cocher un article raye la ligne, juste pour le magasin : ce n'est pas enregistré.",
        "Les coches tiennent tant que la page reste ouverte, disparaissent au rechargement, et ne sont pas partagées avec le foyer.",
        "Le PDF reprend la liste entière, y compris ce qui est coché.",
      ],
      en: [
        "Ticking an item crosses the line out, just for the shop: it is not saved.",
        "Ticks last while the page stays open, disappear on reload, and are not shared with the household.",
        "The PDF carries the whole list, including what is ticked.",
      ],
    },
    labels: [
    ],
    routes: [],
  },
  {
    id: "cooking_sessions",
    title: { fr: "Les sessions de cuisine et les recettes", en: "Cooking sessions and recipes" },
    dispatcherHint: "ou sont les recettes et les etapes, la session de cuisine, quoi cuisiner aujourd'hui",
    answer: {
      fr: [
        "Les recettes sont dans « Tes sessions de cuisine », un bouton de « Mon plan » ; chaque session montre ses recettes avec « La recette », et un « Déroulé global » quand il y en a plusieurs.",
        "Dans la vue par jour du plan, le bloc « Session de cuisine » a son détail.",
        "Dans « Aujourd’hui », la carte « Côté cuisine » dit si tu cuisines aujourd'hui ou demain ; « Voir la semaine » ouvre les sessions.",
      ],
      en: [
        "Recipes are in “Your cooking sessions”, a button in “My plan”; each session shows its recipes with “Recipe”, and an “Overall run-through” when there are several.",
        "In the plan's day view, the “Cooking session” block has its detail.",
        "In “Today”, the “In the kitchen” card tells you whether you cook today or tomorrow; “See the week” opens the sessions.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Les sessions de cuisine sont chez la personne qui tient le foyer, qui cuisine pour la maison.",
          ],
          en: [
            "Cooking sessions live with the person who runs the household, who cooks for everyone.",
          ],
        },
      },
    ],
    doesNotExist: {
      fr: [
        "un minuteur",
        "marquer une session comme faite",
      ],
      en: [
        "a timer",
        "marking a session as done",
      ],
    },
    labels: [
      { key: "meals.sessions.title", fr: "Tes sessions de cuisine", en: "Your cooking sessions" },
      { key: "app.nav.plan", fr: "Mon plan", en: "My plan" },
      { key: "meals.sessions.recipe_show", fr: "La recette", en: "Recipe" },
      { key: "meals.sessions.overview_title", fr: "Déroulé global", en: "Overall run-through" },
      { key: "meals.result.day_session", fr: "Session de cuisine", en: "Cooking session" },
      { key: "app.nav.today", fr: "Aujourd’hui", en: "Today" },
      { key: "meals.today.title", fr: "Côté cuisine", en: "In the kitchen" },
      { key: "meals.today.sessions_open", fr: "Voir la semaine", en: "See the week" },
    ],
    routes: ["/app/plan", "/app/today"],
  },
  {
    id: "boxes_freezer",
    title: { fr: "Les boîtes et la congélation", en: "Containers and freezing" },
    dispatcherHint: "les boites ou contenants, congeler, decongeler, portions a emporter",
    answer: {
      fr: [
        "Sous chaque plat, « Les boîtes à sortir » dit quelle boîte prendre ; pour un plat sans cuisson, « Les doses par personne » donne les grammes par personne.",
        "Dans la session de cuisine, la partie « Boxing » donne le nombre de contenants, ceux qui vont au congélateur et les grammes cuits par contenant.",
        "La veille d'une session qui utilise du congelé, Sophia écrit entre 18 h et 20 h ce qu'il faut sortir du congélateur ; l'écran le dit aussi.",
      ],
      en: [
        "Under each dish, “Boxes to take out” tells you which box to take; for a dish with no cooking, “Portions per person” gives the grams per person.",
        "In the cooking session, the “Boxing” part gives the number of containers, which go in the freezer, and the cooked grams per container.",
        "The evening before a session that uses frozen food, Sophia writes between 6 and 8 pm what to take out of the freezer; the screen says it too.",
      ],
    },
    labels: [
      { key: "meals.boxes.title_dish", fr: "Les boîtes à sortir", en: "Boxes to take out" },
      { key: "meals.doses.title", fr: "Les doses par personne", en: "Portions per person" },
      { key: "meals.boxes.title", fr: "Boxing", en: "Boxing" },
    ],
    routes: ["/app/plan"],
  },
  {
    id: "meal_default_eaten",
    title: { fr: "Faut-il dire qu'on a mangé ?", en: "Do I need to log my meals?" },
    dispatcherHint: "faut-il signaler ou cocher les repas manges, comment le suivi sait ce que j'ai mange",
    answer: {
      fr: [
        "Pas besoin de dire qu'un repas prévu a été mangé : une fois son heure passée, il compte comme mangé.",
        "S'il ne l'a pas été, coche « Pas mangé » sur le plat, dans « Mon plan » ou « Aujourd’hui » ; seulement pour aujourd'hui et les jours passés.",
        "Avec un objectif de perte de poids ou de prise de muscle, le bouton + ouvre aussi « Suivi des repas », et Sophia demande le soir si tous les repas ont été mangés.",
        "Dans « Suivi », un repas prévu sans signalement apparaît « compté comme prévu ».",
      ],
      en: [
        "No need to say a planned meal was eaten: once its time has passed, it counts as eaten.",
        "If it wasn't, tick “Not eaten” on the dish, in “My plan” or “Today”; only for today and past days.",
        "With a weight-loss or muscle-gain goal, the + button also opens “Meal tracking”, and Sophia asks in the evening whether every meal was eaten.",
        "In “Tracking”, a planned meal with nothing reported shows as “counted as planned”.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Pas besoin de dire qu'un repas prévu a été mangé : une fois son heure passée, il compte comme mangé.",
            "S'il ne l'a pas été, coche « Pas mangé » sur le plat, dans ta carte « Ta part » de « Mon plan » ; seulement pour aujourd'hui et les jours passés.",
          ],
          en: [
            "No need to say a planned meal was eaten: once its time has passed, it counts as eaten.",
            "If it wasn't, tick “Not eaten” on the dish, in your “Your share” card in “My plan”; only for today and past days.",
          ],
        },
      },
      {
        when: { goals: ["maintenance", null] },
        answer: {
          fr: [
            "Pas besoin de dire qu'un repas prévu a été mangé : une fois son heure passée, il compte comme mangé.",
            "S'il ne l'a pas été, coche « Pas mangé » sur le plat, dans « Mon plan » ou « Aujourd’hui » ; seulement pour aujourd'hui et les jours passés.",
            "Dans « Suivi », un repas prévu sans signalement apparaît « compté comme prévu ».",
          ],
          en: [
            "No need to say a planned meal was eaten: once its time has passed, it counts as eaten.",
            "If it wasn't, tick “Not eaten” on the dish, in “My plan” or “Today”; only for today and past days.",
            "In “Tracking”, a planned meal with nothing reported shows as “counted as planned”.",
          ],
        },
      },
    ],
    doesNotExist: {
      fr: [
        "cocher un repas à l'avance",
      ],
      en: [
        "ticking a meal in advance",
      ],
    },
    labels: [
      { key: "meals.tick.label", fr: "Pas mangé", en: "Not eaten" },
      { key: "app.nav.plan", fr: "Mon plan", en: "My plan" },
      { key: "app.nav.today", fr: "Aujourd’hui", en: "Today" },
      { key: "meals.week.title", fr: "Suivi des repas", en: "Meal tracking" },
      { key: "app.nav.progress", fr: "Suivi", en: "Tracking" },
      { key: "student_progress.journal.state_planned", fr: "compté comme prévu", en: "counted as planned" },
      { key: "plan.mine.title", fr: "Ta part", en: "Your share" },
    ],
    routes: ["/app/plan", "/app/today", "/app/progress"],
  },
  {
    id: "meal_not_eaten",
    title: { fr: "Un repas pas mangé ou mangé dehors", en: "A meal skipped or eaten out" },
    dispatcherHint: "comment noter un repas saute, mange dehors, commande ou remplace par autre chose",
    answer: {
      fr: [
        "Coche « Pas mangé » sur le plat (aujourd'hui ou un jour passé), puis choisis « J’ai commandé ou mangé dehors », « Pas eu le temps » ou « J’ai mangé autre chose » — ou « On en reste là ».",
        "Pour dire ce que tu as mangé à la place : « Suivi » → « Ta semaine dans l’assiette » → « Ajouter un repas », avec une description ou une photo.",
        "Avec un objectif de perte de poids ou de prise de muscle, le bouton + propose aussi « Décrire un repas non prévu » et « Photo d'un repas non prévu ».",
        "Tu peux aussi simplement l'écrire à Sophia (par exemple : j'ai commandé une pizza) : le repas est noté.",
      ],
      en: [
        "Tick “Not eaten” on the dish (today or a past day), then pick “I ordered or ate out”, “No time to cook” or “I ate something else” — or “Leave it”.",
        "To say what you ate instead: “Tracking” → “Your week on a plate” → “Add a meal”, with a description or a photo.",
        "With a weight-loss or muscle-gain goal, the + button also offers “Describe an unplanned meal” and “Photo of an unplanned meal”.",
        "You can also just tell Sophia (for example: I ordered a pizza): the meal is logged.",
      ],
    },
    variants: [
      {
        when: { goals: ["maintenance", null] },
        answer: {
          fr: [
            "Coche « Pas mangé » sur le plat (aujourd'hui ou un jour passé), puis choisis « J’ai commandé ou mangé dehors », « Pas eu le temps » ou « J’ai mangé autre chose » — ou « On en reste là ».",
            "Pour dire ce que tu as mangé à la place : « Suivi » → « Ta semaine dans l’assiette » → « Ajouter un repas », avec une description ou une photo.",
            "Tu peux aussi simplement l'écrire à Sophia (par exemple : j'ai commandé une pizza) : le repas est noté.",
          ],
          en: [
            "Tick “Not eaten” on the dish (today or a past day), then pick “I ordered or ate out”, “No time to cook” or “I ate something else” — or “Leave it”.",
            "To say what you ate instead: “Tracking” → “Your week on a plate” → “Add a meal”, with a description or a photo.",
            "You can also just tell Sophia (for example: I ordered a pizza): the meal is logged.",
          ],
        },
      },
    ],
    labels: [
      { key: "meals.tick.label", fr: "Pas mangé", en: "Not eaten" },
      { key: "meals.untick.ordered", fr: "J’ai commandé ou mangé dehors", en: "I ordered or ate out" },
      { key: "meals.untick.no_time", fr: "Pas eu le temps", en: "No time to cook" },
      { key: "meals.untick.ate_other", fr: "J’ai mangé autre chose", en: "I ate something else" },
      { key: "meals.untick.dismiss", fr: "On en reste là", en: "Leave it" },
      { key: "app.nav.progress", fr: "Suivi", en: "Tracking" },
      { key: "student_progress.journal.week", fr: "Ta semaine dans l’assiette", en: "Your week on a plate" },
      { key: "student_progress.journal.add", fr: "Ajouter un repas", en: "Add a meal" },
      { key: "chat.compose.add.describe", fr: "Décrire un repas non prévu", en: "Describe an unplanned meal" },
      { key: "chat.compose.add.photo", fr: "Photo d'un repas non prévu", en: "Photo of an unplanned meal" },
    ],
    routes: ["/app/plan", "/app/progress"],
  },
  {
    id: "meal_photo_how",
    title: { fr: "Envoyer une photo de repas", en: "Sending a meal photo" },
    dispatcherHint: "comment prendre ou envoyer une photo de son plat ou de son repas, bouton + ou bouton photo introuvable",
    answer: {
      fr: [
        "Avec un objectif de perte de poids ou de prise de muscle : bouton + (en bas de l'écran sur téléphone, ou dans la conversation) → « Photo d'un repas non prévu », puis « Envoyer » ; un mot d'accompagnement est facultatif.",
        "Pour tous les objectifs : « Suivi » → « Ta semaine dans l’assiette » → « Ajouter un repas », puis la photo ; jusqu'à 14 jours en arrière.",
        "Photos JPEG, PNG ou WebP, 8 Mo au plus ; 6 photos par 10 minutes et 40 par jour.",
      ],
      en: [
        "With a weight-loss or muscle-gain goal: the + button (at the bottom of the screen on a phone, or in the chat) → “Photo of an unplanned meal”, then “Send”; a caption is optional.",
        "For every goal: “Tracking” → “Your week on a plate” → “Add a meal”, then the photo; up to 14 days back.",
        "JPEG, PNG or WebP photos, 8 MB at most; 6 photos per 10 minutes and 40 a day.",
      ],
    },
    variants: [
      {
        when: { goals: ["fat_loss", "muscle_gain"] },
        answer: {
          fr: [
            "Bouton + (en bas de l'écran sur téléphone, ou dans la conversation) → « Photo d'un repas non prévu », puis « Envoyer » ; un mot d'accompagnement est facultatif.",
            "Pour un repas d'un autre jour : « Suivi » → « Ta semaine dans l’assiette » → « Ajouter un repas », puis la photo ; jusqu'à 14 jours en arrière.",
            "Photos JPEG, PNG ou WebP, 8 Mo au plus ; 6 photos par 10 minutes et 40 par jour.",
          ],
          en: [
            "The + button (at the bottom of the screen on a phone, or in the chat) → “Photo of an unplanned meal”, then “Send”; a caption is optional.",
            "For a meal on another day: “Tracking” → “Your week on a plate” → “Add a meal”, then the photo; up to 14 days back.",
            "JPEG, PNG or WebP photos, 8 MB at most; 6 photos per 10 minutes and 40 a day.",
          ],
        },
      },
      {
        when: { goals: ["maintenance", null] },
        answer: {
          fr: [
            "« Suivi » → « Ta semaine dans l’assiette » → « Ajouter un repas », puis la photo ; jusqu'à 14 jours en arrière.",
            "Le bouton + de la conversation est réservé aux objectifs de perte de poids ou de prise de muscle.",
            "Photos JPEG, PNG ou WebP, 8 Mo au plus ; 6 photos par 10 minutes et 40 par jour.",
          ],
          en: [
            "“Tracking” → “Your week on a plate” → “Add a meal”, then the photo; up to 14 days back.",
            "The + button in the chat is for weight-loss or muscle-gain goals only.",
            "JPEG, PNG or WebP photos, 8 MB at most; 6 photos per 10 minutes and 40 a day.",
          ],
        },
      },
    ],
    doesNotExist: {
      fr: [
        "envoyer une photo depuis l'écran du jour",
        "scanner un code-barres",
      ],
      en: [
        "sending a photo from the day screen",
        "scanning a barcode",
      ],
    },
    labels: [
      { key: "chat.compose.add.photo", fr: "Photo d'un repas non prévu", en: "Photo of an unplanned meal" },
      { key: "chat.send", fr: "Envoyer", en: "Send" },
      { key: "app.nav.progress", fr: "Suivi", en: "Tracking" },
      { key: "student_progress.journal.week", fr: "Ta semaine dans l’assiette", en: "Your week on a plate" },
      { key: "student_progress.journal.add", fr: "Ajouter un repas", en: "Add a meal" },
    ],
    routes: ["/app/chat", "/app/progress"],
  },
  {
    id: "meal_photo_counted",
    title: { fr: "Ce que la photo enregistre", en: "What a photo records" },
    dispatcherHint: "est-ce que la photo compte, ce qu'elle enregistre, les calories d'une photo",
    answer: {
      fr: [
        "Oui : la photo devient un repas enregistré, daté du jour.",
        "Elle est analysée : aliments reconnus, taille de la portion, et si elle correspond au plan. Si elle correspond clairement à un plat prévu ce jour-là, ce plat est coché comme mangé.",
        "Une estimation de calories n'est faite que si l'affichage des calories est ouvert pour toi ; elle est présentée comme devinée d'après la photo.",
        "Elle apparaît dans « Aujourd’hui » (« Tes photos d’aujourd’hui ») et dans « Suivi », où « Relancer l’analyse » relance une analyse qui n'a pas abouti.",
        "Une photo qui ne montre pas un repas, ou un repas pas mangé, ne compte pas.",
      ],
      en: [
        "Yes: the photo becomes a recorded meal, dated today.",
        "It is analysed: foods recognised, portion size, and whether it matches the plan. If it clearly matches a dish planned that day, that dish is ticked as eaten.",
        "A calorie estimate is only made if calories are shown to you; it is presented as guessed from the photo.",
        "It shows in “Today” (“Your photos today”) and in “Tracking”, where “Try the analysis again” reruns an analysis that did not finish.",
        "A photo that does not show a meal, or shows food not eaten, does not count.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Oui : la photo devient un repas enregistré, daté du jour.",
            "Elle est analysée : aliments reconnus, taille de la portion, et si elle correspond au plan. Si elle correspond clairement à un plat prévu ce jour-là, ce plat est coché comme mangé.",
            "Une estimation de calories n'est faite que si l'affichage des calories est ouvert pour toi ; elle est présentée comme devinée d'après la photo.",
            "Elle apparaît dans « Suivi », où « Relancer l’analyse » relance une analyse qui n'a pas abouti.",
            "Une photo qui ne montre pas un repas, ou un repas pas mangé, ne compte pas.",
          ],
          en: [
            "Yes: the photo becomes a recorded meal, dated today.",
            "It is analysed: foods recognised, portion size, and whether it matches the plan. If it clearly matches a dish planned that day, that dish is ticked as eaten.",
            "A calorie estimate is only made if calories are shown to you; it is presented as guessed from the photo.",
            "It shows in “Tracking”, where “Try the analysis again” reruns an analysis that did not finish.",
            "A photo that does not show a meal, or shows food not eaten, does not count.",
          ],
        },
      },
    ],
    doesNotExist: {
      fr: [
        "le détail en grammes ou en macronutriments",
        "corriger à l'écran les aliments reconnus",
      ],
      en: [
        "a breakdown in grams or macronutrients",
        "correcting the recognised foods on screen",
      ],
    },
    labels: [
      { key: "app.nav.today", fr: "Aujourd’hui", en: "Today" },
      { key: "today.photos_label", fr: "Tes photos d’aujourd’hui", en: "Your photos today" },
      { key: "app.nav.progress", fr: "Suivi", en: "Tracking" },
      { key: "student_progress.journal.retry", fr: "Relancer l’analyse", en: "Try the analysis again" },
    ],
    routes: ["/app/today", "/app/progress"],
  },
  {
    id: "meal_describe",
    title: { fr: "Décrire un repas non prévu", en: "Describing an unplanned meal" },
    dispatcherHint: "decrire ou ajouter par ecrit un repas hors plan, un snack, un extra",
    answer: {
      fr: [
        "Avec un objectif de perte de poids ou de prise de muscle : bouton + → « Décrire un repas non prévu », choisis le moment, écris ce que tu as mangé, puis « Enregistrer » ; ça vaut pour aujourd'hui.",
        "Pour un autre jour (jusqu'à 14 jours en arrière), et pour tous les objectifs : « Suivi » → « Ajouter un repas », avec la date, le moment et « Par rapport au plan ».",
        "Une estimation de calories n'est faite que si l'affichage des calories est ouvert pour toi.",
        "Un repas déjà coché « Pas mangé » ne se décrit plus depuis la conversation : passe par « Suivi ».",
      ],
      en: [
        "With a weight-loss or muscle-gain goal: the + button → “Describe an unplanned meal”, pick the time of day, write what you ate, then “Record it”; it applies to today.",
        "For another day (up to 14 days back), and for every goal: “Tracking” → “Add a meal”, with the date, the time of day and “How does it relate to the plan?”.",
        "A calorie estimate is only made if calories are shown to you.",
        "A meal already ticked “Not eaten” can no longer be described from the chat: use “Tracking”.",
      ],
    },
    variants: [
      {
        when: { goals: ["maintenance", null] },
        answer: {
          fr: [
            "« Suivi » → « Ajouter un repas », avec la date (jusqu'à 14 jours en arrière), le moment et « Par rapport au plan », puis une description ou une photo.",
            "Une estimation de calories n'est faite que si l'affichage des calories est ouvert pour toi.",
          ],
          en: [
            "“Tracking” → “Add a meal”, with the date (up to 14 days back), the time of day and “How does it relate to the plan?”, then a description or a photo.",
            "A calorie estimate is only made if calories are shown to you.",
          ],
        },
      },
    ],
    labels: [
      { key: "chat.compose.add.describe", fr: "Décrire un repas non prévu", en: "Describe an unplanned meal" },
      { key: "tracking.describe.submit", fr: "Enregistrer", en: "Record it" },
      { key: "app.nav.progress", fr: "Suivi", en: "Tracking" },
      { key: "student_progress.journal.add", fr: "Ajouter un repas", en: "Add a meal" },
      { key: "student_progress.journal.dialog_relation", fr: "Par rapport au plan", en: "How does it relate to the plan?" },
      { key: "meals.tick.label", fr: "Pas mangé", en: "Not eaten" },
    ],
    routes: ["/app/chat", "/app/progress"],
  },
  {
    id: "meal_correct_past",
    title: { fr: "Corriger un repas passé", en: "Correcting a past meal" },
    dispatcherHint: "corriger ou modifier un repas deja enregistre ou un jour passe",
    answer: {
      fr: [
        "« Suivi » → « Ta semaine dans l’assiette » : choisis le jour, puis « Corriger » sur un repas décrit ou pris en photo (date, moment, lien avec le plan).",
        "« Ajouter un repas » ajoute un repas oublié, avec une description ou une photo.",
        "Un repas prévu qui n'a pas été mangé se corrige en cochant « Pas mangé » sur le plat.",
        "Seuls les 14 derniers jours se modifient ; les repas plus anciens restent visibles.",
      ],
      en: [
        "“Tracking” → “Your week on a plate”: pick the day, then “Correct” on a meal that was described or photographed (date, time of day, link to the plan).",
        "“Add a meal” adds a forgotten meal, with a description or a photo.",
        "A planned meal that was not eaten is corrected by ticking “Not eaten” on the dish.",
        "Only the last 14 days can be changed; older meals stay visible.",
      ],
    },
    labels: [
      { key: "app.nav.progress", fr: "Suivi", en: "Tracking" },
      { key: "student_progress.journal.week", fr: "Ta semaine dans l’assiette", en: "Your week on a plate" },
      { key: "student_progress.journal.correct", fr: "Corriger", en: "Correct" },
      { key: "student_progress.journal.add", fr: "Ajouter un repas", en: "Add a meal" },
      { key: "meals.tick.label", fr: "Pas mangé", en: "Not eaten" },
    ],
    routes: ["/app/progress"],
  },
  {
    id: "weight_entry",
    title: { fr: "Enregistrer son poids", en: "Logging your weight" },
    dispatcherHint: "entrer, mettre a jour ou enregistrer son poids, se peser",
    answer: {
      fr: [
        "Avec un objectif de perte de poids ou de prise de muscle : bouton + → « Mettre à jour mon poids », puis « Enregistrer ».",
        "Sophia demande aussi le poids de temps en temps, avec le bouton « Noter mon poids » ; tu peux aussi l'écrire dans la conversation (par exemple : je pèse 72 kg).",
        "La courbe est dans « Suivi », carte « Ton poids dans le temps » ; on n'y saisit pas de poids.",
        "Le poids de la fiche dans « Foyer » sert à calculer les parts.",
      ],
      en: [
        "With a weight-loss or muscle-gain goal: the + button → “Update my weight”, then “Save”.",
        "Sophia also asks for your weight now and then, with the “Log my weight” button; you can also just write it in the chat (for example: I weigh 72 kg).",
        "The curve is in “Tracking”, card “Your weight over time”; you do not enter a weight there.",
        "The weight on your details in “Household” is used to size servings.",
      ],
    },
    variants: [
      {
        when: { goals: ["maintenance", null] },
        answer: {
          fr: [
            "Sophia demande le poids de temps en temps, avec le bouton « Noter mon poids » ; tu peux aussi l'écrire dans la conversation (par exemple : je pèse 72 kg).",
            "La courbe est dans « Suivi », carte « Ton poids dans le temps » ; on n'y saisit pas de poids.",
            "Le poids de la fiche dans « Foyer » sert à calculer les parts.",
          ],
          en: [
            "Sophia asks for your weight now and then, with the “Log my weight” button; you can also just write it in the chat (for example: I weigh 72 kg).",
            "The curve is in “Tracking”, card “Your weight over time”; you do not enter a weight there.",
            "The weight on your details in “Household” is used to size servings.",
          ],
        },
      },
    ],
    doesNotExist: {
      fr: [
        "une balance connectée",
      ],
      en: [
        "a connected scale",
      ],
    },
    labels: [
      { key: "chat.compose.add.weight", fr: "Mettre à jour mon poids", en: "Update my weight" },
      { key: "chat.weighin.submit", fr: "Enregistrer", en: "Save" },
      { key: "file:supabase/functions/_shared/keel/weigh_in.ts", fr: "Noter mon poids", en: "Log my weight" },
      { key: "app.nav.progress", fr: "Suivi", en: "Tracking" },
      { key: "student_progress.journal.weight", fr: "Ton poids dans le temps", en: "Your weight over time" },
      { key: "app.nav.household", fr: "Foyer", en: "Household" },
    ],
    routes: ["/app/chat", "/app/progress"],
  },
  {
    id: "progress_page",
    title: { fr: "Voir ses progrès", en: "Seeing your progress" },
    dispatcherHint: "ou voir ses progres, sa courbe de poids, son suivi, ce que j'ai mange cette semaine",
    answer: {
      fr: [
        "« Suivi » ouvre « Mes progrès », en trois parties.",
        "« Ton repère quotidien » : une fourchette de calories par jour, avec son détail, quand l'affichage des calories est ouvert.",
        "« Ta semaine dans l’assiette » : jour par jour, ce qui a été mangé, prévu ou non, avec photos et descriptions.",
        "« Ton poids dans le temps » : la courbe de poids, d'une semaine à un an.",
      ],
      en: [
        "“Tracking” opens “My progress”, in three parts.",
        "“Your daily reference”: a daily calorie range, with its detail, when calories are shown to you.",
        "“Your week on a plate”: day by day, what was eaten, planned or not, with photos and descriptions.",
        "“Your weight over time”: the weight curve, from one week to a year.",
      ],
    },
    doesNotExist: {
      fr: [
        "un compteur de calories restantes",
      ],
      en: [
        "a count of calories left",
      ],
    },
    labels: [
      { key: "app.nav.progress", fr: "Suivi", en: "Tracking" },
      { key: "student_progress.title", fr: "Mes progrès", en: "My progress" },
      { key: "student_progress.journal.target", fr: "Ton repère quotidien", en: "Your daily reference" },
      { key: "student_progress.journal.week", fr: "Ta semaine dans l’assiette", en: "Your week on a plate" },
      { key: "student_progress.journal.weight", fr: "Ton poids dans le temps", en: "Your weight over time" },
    ],
    routes: ["/app/progress"],
  },
  {
    id: "energy_number_origin",
    title: { fr: "D'où vient mon repère calorique", en: "Where my calorie reference comes from" },
    dispatcherHint: "d'ou vient le chiffre de calories ou le repere quotidien, comment il est calcule",
    answer: {
      fr: [
        "Dans « Suivi », la carte « Ton repère quotidien » donne une fourchette, pas un chiffre exact ; « Détail » ouvre « D'où vient ce nombre ».",
        "Le calcul part de ta pesée, estime ta dépense d'entretien (taille, poids, âge, sexe, journées), puis ajoute ou retire l'écart de ton objectif.",
        "Sans taille ni date de naissance, il part seulement du poids ; il s'affine quand elles sont renseignées.",
        "C'est une estimation : deux corps pareils sur le papier ne dépensent pas la même chose.",
      ],
      en: [
        "In “Tracking”, the “Your daily reference” card gives a range, not an exact figure; “Detail” opens “Where this number comes from”.",
        "It starts from your weigh-in, estimates your upkeep (height, weight, age, sex, how your days go), then adds or removes your goal's gap.",
        "Without height or date of birth, it works from weight alone; it gets sharper once they are filled in.",
        "It is an estimate: two bodies identical on paper do not spend the same.",
      ],
    },
    labels: [
      { key: "app.nav.progress", fr: "Suivi", en: "Tracking" },
      { key: "student_progress.journal.target", fr: "Ton repère quotidien", en: "Your daily reference" },
      { key: "student_progress.journal.detail", fr: "Détail", en: "Detail" },
      { key: "student_progress.journal.detail_title", fr: "D'où vient ce nombre", en: "Where this number comes from" },
    ],
    routes: ["/app/progress"],
  },
  {
    id: "household_add_person",
    title: { fr: "Ajouter quelqu'un au foyer", en: "Adding someone to the household" },
    dispatcherHint: "ajouter au foyer une personne qui mange a la maison (enfant, conjoint), sans parler de lui donner un compte",
    answer: {
      fr: [
        "« Foyer » → « Les membres du foyer » → « Ajouter une personne ».",
        "Il faut son prénom, sa date de naissance, sa taille, son poids, son sexe et ce qu'il ou elle vise ; les préférences alimentaires sont facultatives. Puis « L'ajouter ».",
        "Pas besoin de compte ni d'e-mail : la personne est au plan sans rien installer. Pour lui donner son propre accès ensuite : « Inviter » sur sa ligne.",
        "Huit personnes au plus, toi compris.",
      ],
      en: [
        "“Household” → “Household members” → “Add someone”.",
        "It needs their first name, date of birth, height, weight, sex and what they are after; food preferences are optional. Then “Add them”.",
        "No account or email needed: the person is on the plan without installing anything. To give them their own access afterwards: “Invite” on their line.",
        "Eight people at most, you included.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Seule la personne qui tient le foyer peut ajouter quelqu'un.",
          ],
          en: [
            "Only the person who runs the household can add someone.",
          ],
        },
      },
    ],
    labels: [
      { key: "app.nav.household", fr: "Foyer", en: "Household" },
      { key: "household.members.title", fr: "Les membres du foyer", en: "Household members" },
      { key: "household.add.open", fr: "Ajouter une personne", en: "Add someone" },
      { key: "household.mouth.add", fr: "L'ajouter", en: "Add them" },
      { key: "household.access.invite", fr: "Inviter", en: "Invite" },
    ],
    routes: ["/app/household"],
  },
  {
    id: "household_invite",
    title: { fr: "Donner un accès à quelqu'un", en: "Giving someone access" },
    dispatcherHint: "donner un acces, un compte ou l'app a quelqu'un du foyer (conjoint, ado), l'inviter a rejoindre, prix d'un acces",
    answer: {
      fr: [
        "Sur la ligne de la personne dans « Foyer » : « Inviter », son e-mail, puis « Créer l’invitation ». Un e-mail part, et tu peux aussi « Copier le lien ».",
        "Le lien sert une seule fois, pour cette adresse, et expire dans 14 jours ; 20 invitations par jour au plus.",
        "La personne voit le plan du foyer et sa propre part ; elle ne compose pas, et n'ajoute ni ne retire personne.",
        "1,99 € par mois s'ajoutent à l'abonnement le jour où elle réclame sa place, pas avant.",
        "On n'invite qu'une personne déjà ajoutée au foyer.",
      ],
      en: [
        "On the person's line in “Household”: “Invite”, their email, then “Create the invitation”. An email goes out, and you can also “Copy the link”.",
        "The link works once, for that address, and expires in 14 days; 20 invitations a day at most.",
        "The person sees the household plan and their own share; they do not compose, and do not add or remove anyone.",
        "€1.99 a month is added to the subscription on the day they claim their place, not before.",
        "You can only invite someone already added to the household.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Seule la personne qui tient le foyer peut inviter quelqu'un.",
          ],
          en: [
            "Only the person who runs the household can invite someone.",
          ],
        },
      },
    ],
    labels: [
      { key: "app.nav.household", fr: "Foyer", en: "Household" },
      { key: "household.access.invite", fr: "Inviter", en: "Invite" },
      { key: "household.invite.submit", fr: "Créer l’invitation", en: "Create the invitation" },
      { key: "household.access.copy", fr: "Copier le lien", en: "Copy the link" },
    ],
    routes: ["/app/household", "/join-household"],
  },
  {
    id: "household_member_rights",
    title: { fr: "Ce qu'un membre peut faire", en: "What a member can do" },
    dispatcherHint: "ce que peut faire une personne invitee dans le foyer, ses droits, ce qu'elle voit",
    answer: {
      fr: [
        "Une personne qui a réclamé sa place voit le plan du foyer dans sa carte « Ta part », coche ce qu'elle n'a pas mangé, et a son propre suivi et sa conversation avec Sophia.",
        "Elle règle sa propre ligne : prénom, date de naissance, habitudes, absences.",
        "Elle ne compose pas le plan, n'ajoute ni ne retire personne, ne pose ni allergie ni règle de maison, et ne change pas les réglages du foyer.",
        "Il n'y a pas de messagerie entre membres dans l'app.",
      ],
      en: [
        "Someone who claimed their place sees the household plan in their “Your share” card, ticks what they did not eat, and has their own tracking and chat with Sophia.",
        "They manage their own line: first name, date of birth, habits, absences.",
        "They do not compose the plan, add or remove anyone, set allergies or house rules, or change household settings.",
        "There is no messaging between members in the app.",
      ],
    },
    labels: [
      { key: "plan.mine.title", fr: "Ta part", en: "Your share" },
    ],
    routes: ["/app/plan", "/app/household"],
  },
  {
    id: "household_who_composes",
    title: { fr: "Qui compose le menu", en: "Who composes the menu" },
    dispatcherHint: "pourquoi je ne peux pas composer ou modifier le menu, qui decide du menu du foyer",
    answer: {
      fr: [
        "Dans un foyer, seule la personne qui le tient compose le plan, ajoute ou retire quelqu'un ; les autres membres voient leur part.",
        "Seul, c'est toi qui composes, depuis « Mon plan ».",
      ],
      en: [
        "In a household, only the person who runs it composes the plan and adds or removes people; other members see their share.",
        "On your own, you compose it yourself, from “My plan”.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Dans un foyer, c'est la personne qui le tient qui compose la semaine : c'est voulu, ce n'est pas une panne.",
            "Ta part est dans « Mon plan », carte « Ta part » ; tu peux déclarer tes absences avec « Qui est là ? Jour par jour ».",
            "Pour une envie ou un changement, parles-en à la personne qui tient le foyer : l'app n'a pas de demande de modification.",
          ],
          en: [
            "In a household, the person who runs it composes the week: that is by design, not a fault.",
            "Your share is in “My plan”, card “Your share”; you can declare your absences with “Who's in? Day by day”.",
            "For a wish or a change, talk to the person who runs the household: the app has no change requests.",
          ],
        },
      },
      {
        when: { roles: ["owner", "solo"] },
        answer: {
          fr: [
            "C'est toi qui composes le plan, depuis « Mon plan ».",
          ],
          en: [
            "You compose the plan, from “My plan”.",
          ],
        },
      },
    ],
    labels: [
      { key: "app.nav.plan", fr: "Mon plan", en: "My plan" },
      { key: "plan.mine.title", fr: "Ta part", en: "Your share" },
      { key: "meals.picker.open", fr: "Qui est là ? Jour par jour", en: "Who's in? Day by day" },
    ],
    routes: ["/app/plan"],
  },
  {
    id: "household_allergy_rule",
    title: { fr: "Allergies et aliments refusés d'un proche", en: "A household member's allergies and dislikes" },
    dispatcherHint: "indiquer l'allergie ou ce que n'aime pas une personne du foyer, un enfant",
    answer: {
      fr: [
        "Dans « Foyer », sur la ligne de la personne : « Préférences alimentaires », pour ses allergies et ce qu'elle n'aime pas.",
        "Une allergie vaut pour toute la casserole : rien ne se cuisine pour le foyer sans en tenir compte.",
        "« Quelque chose que cette maison ne sert pas » ne vaut que pour un enfant ; un adulte décide de ce qu'il mange.",
        "Tu peux aussi dire ta propre allergie à Sophia dans la conversation : elle est enregistrée.",
      ],
      en: [
        "In “Household”, on the person's line: “Food preferences”, for their allergies and what they dislike.",
        "An allergy rules the whole pot: nothing is cooked for the household without it.",
        "“Something this house does not serve” only applies to a child; an adult decides what they eat.",
        "You can also tell Sophia your own allergy in the chat: it is recorded.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Seule la personne qui tient le foyer règle les allergies et les règles de maison, dans « Foyer ».",
            "Tu peux dire ta propre allergie à Sophia dans la conversation : elle est enregistrée, et vaut pour toute la casserole.",
          ],
          en: [
            "Only the person who runs the household sets allergies and house rules, in “Household”.",
            "You can tell Sophia your own allergy in the chat: it is recorded, and it rules the whole pot.",
          ],
        },
      },
    ],
    labels: [
      { key: "app.nav.household", fr: "Foyer", en: "Household" },
      { key: "household.member.frame_preferences", fr: "Préférences alimentaires", en: "Food preferences" },
      { key: "household.constraint.kind.house_rule", fr: "Quelque chose que cette maison ne sert pas", en: "Something this house does not serve" },
    ],
    routes: ["/app/household"],
  },
  {
    id: "household_remove",
    title: { fr: "Retirer quelqu'un du foyer", en: "Removing someone" },
    dispatcherHint: "retirer une personne du foyer ou lui retirer son acces, quitter un foyer",
    answer: {
      fr: [
        "Dans « Foyer », fiche de la personne → « Informations personnelles » → « Retirer du foyer » : ça efface sa part, ses allergies et ses règles de maison.",
        "Pour quelqu'un qui a son accès, « Retirer son accès » lui retire l'accès mais la garde à table, avec sa part et ses allergies ; son 1,99 € par mois s'arrête.",
        "L'app demande de confirmer avec « Oui, retirer du foyer » ; ensuite il n'y a pas de retour en arrière.",
        "La personne qui tient le foyer ne peut pas être retirée, et le foyer ne se transmet pas.",
      ],
      en: [
        "In “Household”, the person's details → “Personal details” → “Remove from the household”: it deletes their serving, their allergies and their house rules.",
        "For someone with their own access, “Remove their access” removes the access but keeps them at the table, with their serving and allergies; their €1.99 a month stops.",
        "The app asks you to confirm with “Yes, remove from the household”; after that there is no undo.",
        "The person who runs the household cannot be removed, and the household cannot be handed over.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Seule la personne qui tient le foyer peut retirer quelqu'un ou lui retirer son accès ; il n'y a pas de bouton pour quitter un foyer soi-même.",
          ],
          en: [
            "Only the person who runs the household can remove someone or their access; there is no button to leave a household yourself.",
          ],
        },
      },
    ],
    labels: [
      { key: "app.nav.household", fr: "Foyer", en: "Household" },
      { key: "household.member.frame_identity", fr: "Informations personnelles", en: "Personal details" },
      { key: "household.member.remove", fr: "Retirer du foyer", en: "Remove from the household" },
      { key: "household.member.detach", fr: "Retirer son accès", en: "Remove their access" },
      { key: "household.member.remove_confirm_yes", fr: "Oui, retirer du foyer", en: "Yes, remove from the household" },
    ],
    routes: ["/app/household"],
  },
  {
    id: "household_paused",
    title: { fr: "Foyer en pause", en: "Paused household" },
    dispatcherHint: "l'app est bloquee ou en pause, foyer en pause, acces coupe apres l'essai",
    answer: {
      fr: [
        "Quand la semaine offerte se termine sans abonnement, le foyer passe en pause : « Ton foyer est en pause ».",
        "Rien n'est effacé ; aucune nouvelle semaine n'est composée tant que l'abonnement n'est pas repris.",
        "La personne qui a créé le foyer relance avec « Voir mon abonnement » ; le compte reste accessible par « Mon compte ».",
      ],
      en: [
        "When the free week ends without a subscription, the household is paused: “Your household is paused”.",
        "Nothing is deleted; no new week is composed until the subscription is back.",
        "The person who created the household restarts it with “See my subscription”; the account stays reachable through “My account”.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Le foyer est en pause : « Ton foyer est en pause ». Rien n'est effacé.",
            "La personne qui a créé ce foyer peut le relancer depuis son propre compte.",
          ],
          en: [
            "The household is paused: “Your household is paused”. Nothing is deleted.",
            "The person who created this household can restart it from their own account.",
          ],
        },
      },
    ],
    labels: [
      { key: "app.paywall.title", fr: "Ton foyer est en pause", en: "Your household is paused" },
      { key: "app.paywall.cta_billing", fr: "Voir mon abonnement", en: "See my subscription" },
      { key: "app.paywall.account", fr: "Mon compte", en: "My account" },
    ],
    routes: ["/app/billing", "/account"],
  },
  {
    id: "meal_slots",
    title: { fr: "Choisir ses moments de repas", en: "Choosing your meal times" },
    dispatcherHint: "moments ou creneaux de repas: retirer ou ajouter un repas (apres-midi, petit-dejeuner), un repas que je ne prends pas",
    answer: {
      fr: [
        "Les moments de repas des plans viennent de ta fiche : menu → « Foyer » → ta ligne → « Préférences alimentaires » → « Quand tu manges, et quoi ».",
        "Décoche un moment que tu ne prends jamais (par exemple « Après-midi ») : les prochains plans ne le composent plus. Coché avec « repas léger », il reste, en plus léger.",
        "Pour un seul jour, pas besoin de toucher à ta fiche : dans le formulaire de composition, ouvre « Qui est là ? Jour par jour » (ou « Modifier » sur ta ligne de « Qui mange à la maison ») et décoche ce repas-là.",
        "Ça vaut pour le prochain plan composé ; un plan déjà adopté ne change pas. Pour une autre personne du foyer, même chose sur sa ligne.",
      ],
      en: [
        "The meal times in your plans come from your details: menu → “Household” → your line → “Food preferences” → “When you eat, and what”.",
        "Untick a time you never eat (for example “Afternoon”): the next plans stop composing it. Ticked with “light meal”, it stays, lighter.",
        "For a single day, no need to touch your details: in the composition form, open “Who's in? Day by day” (or “Edit” on your “Who eats at home” line) and untick that meal.",
        "It applies to the next plan composed; a plan already adopted does not change. For someone else in the household, same thing on their line.",
      ],
    },
    labels: [
      { key: "app.nav.household", fr: "Foyer", en: "Household" },
      { key: "household.member.frame_preferences", fr: "Préférences alimentaires", en: "Food preferences" },
      { key: "household.mouth.eating_you", fr: "Quand tu manges, et quoi", en: "When you eat, and what" },
      { key: "meals.slot.snack_pm", fr: "Après-midi", en: "Afternoon" },
      { key: "household.mouth.light", fr: "repas léger", en: "light meal" },
      { key: "meals.picker.open", fr: "Qui est là ? Jour par jour", en: "Who's in? Day by day" },
      { key: "plan.request.presence_open", fr: "Modifier", en: "Edit" },
      { key: "plan.request.presence_title", fr: "Qui mange à la maison", en: "Who eats at home" },
    ],
    routes: ["/app/household", "/app/plan"],
  },
  {
    id: "food_preferences_self",
    title: { fr: "Mon régime, ce que je n'aime pas, mes allergies", en: "My diet, dislikes and allergies" },
    dispatcherHint: "dire ce que je n'aime pas, que je suis vegetarien, mon regime alimentaire, mes propres allergies ou intolerances",
    answer: {
      fr: [
        "Menu → « Foyer » → ta ligne → « Préférences alimentaires » : ton régime, « Ce que tu n'aimes pas » et tes allergies.",
        "Les prochains plans en tiennent compte ; une allergie vaut pour toute la casserole du foyer.",
        "Une allergie ou une intolérance peut aussi se dire à Sophia dans la conversation : elle est enregistrée tout de suite.",
        "Ce que Sophia retient de tes messages apparaît dans « Ce que Sophia sait », où tu peux le corriger ou l'enlever.",
      ],
      en: [
        "Menu → “Household” → your line → “Food preferences”: your diet, “What you will not eat” and your allergies.",
        "The next plans take it into account; an allergy rules the whole household pot.",
        "An allergy or intolerance can also be told to Sophia in the chat: it is recorded straight away.",
        "What Sophia keeps from your messages shows in “What Sophia knows”, where you can correct or remove it.",
      ],
    },
    labels: [
      { key: "app.nav.household", fr: "Foyer", en: "Household" },
      { key: "household.member.frame_preferences", fr: "Préférences alimentaires", en: "Food preferences" },
      { key: "household.mouth.tastes_you", fr: "Ce que tu n'aimes pas", en: "What you will not eat" },
      { key: "app.nav.about_you", fr: "Ce que Sophia sait", en: "What Sophia knows" },
    ],
    routes: ["/app/household", "/app/about-you"],
  },
  {
    id: "body_details",
    title: { fr: "Mes informations : taille, poids, date de naissance", en: "My details: height, weight, date of birth" },
    dispatcherHint: "changer sa taille, son poids de reference, son sexe, sa date de naissance ou son prenom",
    answer: {
      fr: [
        "Menu → « Foyer » → ta ligne → « Informations personnelles » : prénom, date de naissance et « Ton corps » (taille, poids, sexe), puis « Enregistrer ».",
        "Ces chiffres servent à calculer tes parts dans les prochains plans.",
        "Pour suivre ton poids au fil du temps, c'est à part : écris-le à Sophia ou réponds quand elle le demande ; la courbe est dans « Suivi ».",
      ],
      en: [
        "Menu → “Household” → your line → “Personal details”: first name, date of birth and “Your body” (height, weight, sex), then “Save”.",
        "These figures size your servings in the next plans.",
        "To track your weight over time, that is separate: tell Sophia, or answer when she asks; the curve is in “Tracking”.",
      ],
    },
    labels: [
      { key: "app.nav.household", fr: "Foyer", en: "Household" },
      { key: "household.member.frame_identity", fr: "Informations personnelles", en: "Personal details" },
      { key: "household.mouth.body_you", fr: "Ton corps", en: "Your body" },
      { key: "household.mouth.save", fr: "Enregistrer", en: "Save" },
      { key: "app.nav.progress", fr: "Suivi", en: "Tracking" },
    ],
    routes: ["/app/household", "/app/progress"],
  },
  {
    id: "goal_change",
    title: { fr: "Changer d'objectif", en: "Changing your goal" },
    dispatcherHint: "changer d'objectif (perdre du poids, prendre du muscle, maintenir), de poids vise ou de rythme",
    answer: {
      fr: [
        "Menu → « Foyer » → ta ligne → « Informations personnelles » → « Ce que tu vises » : choisis la direction, puis le poids visé et le rythme si tu en veux, et « Enregistrer ».",
        "Le prochain plan composé en tient compte ; le plan en cours ne change pas.",
        "L'objectif décide aussi de ce que l'app propose par défaut : l'affichage des calories, les questions de Sophia sur les repas et le bouton +.",
      ],
      en: [
        "Menu → “Household” → your line → “Personal details” → “What you are after”: pick the direction, then the target weight and pace if you want one, and “Save”.",
        "The next plan composed takes it into account; the current plan does not change.",
        "The goal also decides what the app offers by default: calorie display, Sophia's meal questions and the + button.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Dans un foyer, la personne qui le tient ne peut pas changer ton objectif à ta place : il se pose depuis ton propre compte, à ta première configuration.",
          ],
          en: [
            "In a household, the person who runs it cannot change your goal for you: it is set from your own account, at your first setup.",
          ],
        },
      },
    ],
    labels: [
      { key: "app.nav.household", fr: "Foyer", en: "Household" },
      { key: "household.member.frame_identity", fr: "Informations personnelles", en: "Personal details" },
      { key: "household.mouth.direction_you", fr: "Ce que tu vises", en: "What you are after" },
      { key: "household.mouth.save", fr: "Enregistrer", en: "Save" },
    ],
    routes: ["/app/household"],
  },
  {
    id: "notifications_off",
    title: { fr: "Couper les messages de Sophia", en: "Turning off Sophia's messages" },
    dispatcherHint: "arreter ou couper les notifications ou les messages de Sophia, elle ecrit trop",
    answer: {
      fr: [
        "Dans « Sophia », bouton « Notifications » au-dessus de la conversation, puis l'interrupteur « Recevoir les notifications ».",
        "Éteint, Sophia n'écrit plus la première ; elle répond toujours quand tu lui écris.",
        "Les e-mails de suivi se coupent à part, par le lien en bas de chaque e-mail.",
      ],
      en: [
        "In “Sophia”, the “Notifications” button above the conversation, then the “Get notifications” switch.",
        "Turned off, Sophia no longer writes first; she always answers when you write to her.",
        "Follow-up emails are stopped separately, through the link at the bottom of each email.",
      ],
    },
    doesNotExist: {
      fr: [
        "des réglages message par message ou des heures calmes",
      ],
      en: [
        "per-message settings or quiet hours",
      ],
    },
    labels: [
      { key: "app.nav.chat", fr: "Sophia", en: "Sophia" },
      { key: "chat.settings.toggle", fr: "Notifications", en: "Notifications" },
      { key: "chat.settings.all.label", fr: "Recevoir les notifications", en: "Get notifications" },
    ],
    routes: ["/app/chat"],
  },
  {
    id: "sophia_evening_messages",
    title: { fr: "Pourquoi Sophia écrit la première", en: "Why Sophia writes first" },
    dispatcherHint: "pourquoi Sophia m'ecrit d'elle-meme (le soir, le dimanche, apres un silence) et a quoi servent ces messages",
    answer: {
      fr: [
        "Sophia écrit la première pour des raisons précises ; ces messages portent la mention « Sophia a écrit la première ».",
        "Avec un objectif de perte de poids ou de prise de muscle : le soir, si tous les repas du jour ont été mangés, et une question sur les repas que le plan ne couvre pas.",
        "De temps en temps entre 17 h et 19 h : le poids. La veille d'une session avec du congelé, entre 18 h et 20 h : quoi sortir du congélateur. Le dernier jour d'un plan, à 22 h : le retour sur le plan.",
        "Le dimanche soir : le point de la semaine ; et un message après trois jours sans nouvelles.",
        "Tout ça s'arrête avec « Notifications » → « Recevoir les notifications ».",
      ],
      en: [
        "Sophia writes first for specific reasons; those messages carry the label “Sophia reached out”.",
        "With a weight-loss or muscle-gain goal: in the evening, whether every meal of the day was eaten, and a question about meals the plan does not cover.",
        "Now and then between 5 and 7 pm: your weight. The evening before a session with frozen food, between 6 and 8 pm: what to take out of the freezer. On a plan's last day, at 10 pm: the plan review.",
        "Sunday evening: the week's check-in; and a message after three days without news.",
        "All of it stops with “Notifications” → “Get notifications”.",
      ],
    },
    labels: [
      { key: "chat.proactive.label", fr: "Sophia a écrit la première", en: "Sophia reached out" },
      { key: "chat.settings.toggle", fr: "Notifications", en: "Notifications" },
      { key: "chat.settings.all.label", fr: "Recevoir les notifications", en: "Get notifications" },
    ],
    routes: ["/app/chat"],
  },
  {
    id: "sophia_memory",
    title: { fr: "Ce que Sophia sait de moi", en: "What Sophia knows about me" },
    dispatcherHint: "ce que Sophia sait ou retient de moi, modifier ou effacer ce qu'elle a retenu",
    answer: {
      fr: [
        "Menu → « Ce que Sophia sait » : tout ce que Sophia a retenu de toi, avec qui l'a écrit.",
        "Chaque ligne se corrige avec « Modifier » ou s'efface avec « Enlever » ; un réglage qu'elle a changé se remet avec « Défaire ».",
        "On n'y ajoute pas de ligne soi-même : ce qui y arrive vient de la conversation, des aperçus de plan et des retours de fin de plan.",
        "Les allergies n'y sont pas : elles se règlent dans « Foyer ».",
      ],
      en: [
        "Menu → “What Sophia knows”: everything Sophia has kept about you, with who wrote it.",
        "Each line is corrected with “Edit” or removed with “Remove”; a setting she changed is put back with “Undo”.",
        "You do not add lines yourself: what lands there comes from the chat, plan previews and end-of-plan reviews.",
        "Allergies are not there: they are set in “Household”.",
      ],
    },
    labels: [
      { key: "app.nav.about_you", fr: "Ce que Sophia sait", en: "What Sophia knows" },
      { key: "known.edit", fr: "Modifier", en: "Edit" },
      { key: "known.remove", fr: "Enlever", en: "Remove" },
      { key: "known.field.undo", fr: "Défaire", en: "Undo" },
      { key: "app.nav.household", fr: "Foyer", en: "Household" },
    ],
    routes: ["/app/about-you", "/app/household"],
  },
  {
    id: "sophia_can_do",
    title: { fr: "Ce que Sophia peut faire dans la conversation", en: "What Sophia can do in the chat" },
    dispatcherHint: "ce que Sophia peut ou ne peut pas faire pour moi: modifier le plan, noter un repas, une allergie, un rappel",
    answer: {
      fr: [
        "Dans la conversation, Sophia peut noter un repas que tu as mangé (par exemple : j'ai commandé une pizza), une allergie ou une intolérance, ton poids, et un rappel ponctuel.",
        "Elle ne compose pas et ne modifie pas le plan, et n'enregistre ni les goûts ni les réglages : elle indique l'écran où le faire.",
        "Elle ne transmet pas de message aux autres personnes du foyer.",
        "Les boutons sous ses messages (poids, point de la semaine, questions sur les repas) enregistrent directement la réponse.",
      ],
      en: [
        "In the chat, Sophia can log a meal you ate (for example: I ordered a pizza), an allergy or intolerance, your weight, and a one-off reminder.",
        "She does not compose or change the plan, and does not save tastes or settings: she points to the screen where to do it.",
        "She does not pass messages to other people in the household.",
        "The buttons under her messages (weight, weekly check-in, meal questions) save the answer directly.",
      ],
    },
    labels: [
    ],
    routes: ["/app/chat"],
  },
  {
    id: "voice_and_push",
    title: { fr: "Vocal et notifications sur le téléphone", en: "Voice and phone notifications" },
    dispatcherHint: "messages vocaux, notifications push, recevoir les messages quand l'app est fermee",
    answer: {
      fr: [
        "Il n'y a pas de message vocal : on écrit à Sophia.",
        "Il n'y a pas de notification quand l'app est fermée. Quand l'onglet de Sophia est ouvert en arrière-plan, l'appareil peut prévenir si « Recevoir les notifications » est activé.",
        "Les messages non lus s'affichent sur « Sophia » dans le menu.",
        "Sur Android, le navigateur peut bloquer ces notifications sans le dire.",
      ],
      en: [
        "There are no voice messages: you write to Sophia.",
        "There are no notifications when the app is closed. When Sophia's tab is open in the background, the device can alert you if “Get notifications” is on.",
        "Unread messages show on “Sophia” in the menu.",
        "On Android, the browser may block these notifications without saying so.",
      ],
    },
    labels: [
      { key: "chat.settings.all.label", fr: "Recevoir les notifications", en: "Get notifications" },
      { key: "app.nav.chat", fr: "Sophia", en: "Sophia" },
    ],
    routes: ["/app/chat"],
  },
  {
    id: "install_app",
    title: { fr: "Installer l'app sur son téléphone", en: "Installing the app on your phone" },
    dispatcherHint: "installer l'app sur le telephone, ecran d'accueil, application mobile",
    answer: {
      fr: [
        "Menu → « Installer l’app » : la page explique l'ajout à l'écran d'accueil.",
        "Sur iPhone : ouvre Sophia dans Safari, touche le bouton Partager, puis Sur l'écran d'accueil.",
        "Sur Android : dans Chrome, menu du navigateur, puis l'option pour installer ; parfois le bouton « Installer maintenant » apparaît directement.",
        "Il n'y a pas d'app dans l'App Store ni le Play Store : c'est le site, installé comme une app.",
      ],
      en: [
        "Menu → “Install the app”: the page explains adding it to your home screen.",
        "On iPhone: open Sophia in Safari, tap the Share button, then Add to Home Screen.",
        "On Android: in Chrome, the browser menu, then the install option; sometimes the “Install now” button shows up directly.",
        "There is no App Store or Play Store app: it is the website, installed like an app.",
      ],
    },
    labels: [
      { key: "shell.nav.install_app", fr: "Installer l’app", en: "Install the app" },
      { key: "install_app.android.install_now", fr: "Installer maintenant", en: "Install now" },
    ],
    routes: ["/installer-app"],
  },
  {
    id: "price_trial",
    title: { fr: "Prix et semaine offerte", en: "Price and free week" },
    dispatcherHint: "combien ca coute, prix, periode d'essai, engagement",
    answer: {
      fr: [
        "Sophia coûte 12,99 € par mois pour toute la maison ; l'accès de la personne qui tient le foyer est compris.",
        "Chaque autre personne qui veut son propre accès coûte 1,99 € par mois, à partir du jour où elle réclame sa place. Les personnes sans compte ne coûtent rien.",
        "La première semaine est offerte, sans code à saisir, et sans engagement ; rien n'est prélevé avant sa fin.",
        "L'abonnement se prend dans le menu, « Abonnement », bouton « M’abonner ».",
      ],
      en: [
        "Sophia costs €12.99 a month for the whole household; the access of the person who runs it is included.",
        "Each other person who wants their own access costs €1.99 a month, from the day they claim their place. People without an account cost nothing.",
        "The first week is free, with no code to enter and no commitment; nothing is charged before it ends.",
        "You subscribe from the menu, “Subscription”, button “Subscribe”.",
      ],
    },
    labels: [
      { key: "shell.nav.billing", fr: "Abonnement", en: "Subscription" },
      { key: "billing.cta.subscribe", fr: "M’abonner", en: "Subscribe" },
    ],
    routes: ["/app/billing"],
  },
  {
    id: "subscription_cancel",
    title: { fr: "Gérer ou résilier l'abonnement", en: "Managing or cancelling the subscription" },
    dispatcherHint: "resilier, annuler ou gerer l'abonnement, changer de carte, factures",
    answer: {
      fr: [
        "Menu → « Abonnement » → « Gérer mon abonnement » : ça ouvre la page de gestion du paiement (Stripe), où l'on résilie.",
        "Pendant la semaine offerte, le bouton est « M’abonner ».",
        "Seule la personne qui a créé le foyer gère ou relance l'abonnement.",
      ],
      en: [
        "Menu → “Subscription” → “Manage my subscription”: it opens the payment management page (Stripe), where you cancel.",
        "During the free week, the button is “Subscribe”.",
        "Only the person who created the household manages or restarts the subscription.",
      ],
    },
    variants: [
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "C'est la personne qui a créé le foyer qui gère l'abonnement, depuis son propre compte ; ton accès personnel s'y ajoute.",
          ],
          en: [
            "The person who created the household manages the subscription from their own account; your personal access is added to it.",
          ],
        },
      },
    ],
    labels: [
      { key: "shell.nav.billing", fr: "Abonnement", en: "Subscription" },
      { key: "billing.cta.manage", fr: "Gérer mon abonnement", en: "Manage my subscription" },
      { key: "billing.cta.subscribe", fr: "M’abonner", en: "Subscribe" },
    ],
    routes: ["/app/billing"],
  },
  {
    id: "language_change",
    title: { fr: "Changer de langue", en: "Changing language" },
    dispatcherHint: "changer la langue de l'app, de l'interface ou des reponses de Sophia (francais, anglais)",
    answer: {
      fr: [
        "Menu → « Compte » → onglet « Réglages » → « Langue ».",
        "Le changement s'applique tout de suite et recharge la page ; c'est aussi la langue dans laquelle Sophia répond.",
      ],
      en: [
        "Menu → “Account” → “Options” tab → “Language”.",
        "The change applies straight away and reloads the page; it is also the language Sophia answers in.",
      ],
    },
    labels: [
      { key: "shell.nav.account", fr: "Compte", en: "Account" },
      { key: "account.tab.settings", fr: "Réglages", en: "Options" },
      { key: "account.settings.language", fr: "Langue", en: "Language" },
    ],
    routes: ["/account"],
  },
  {
    id: "email_change",
    title: { fr: "Changer d'e-mail ou de nom", en: "Changing your email or name" },
    dispatcherHint: "changer son adresse e-mail ou son nom",
    answer: {
      fr: [
        "Menu → « Compte » → « Changer mon e-mail », puis « Confirmer » : un e-mail de confirmation part, et le changement ne vaut qu'une fois confirmé.",
        "Le nom se change au même endroit, puis « Enregistrer ».",
      ],
      en: [
        "Menu → “Account” → “Change my email”, then “Confirm”: a confirmation email is sent, and the change only applies once confirmed.",
        "The name is changed in the same place, then “Save”.",
      ],
    },
    labels: [
      { key: "shell.nav.account", fr: "Compte", en: "Account" },
      { key: "account.email.change", fr: "Changer mon e-mail", en: "Change my email" },
      { key: "account.email.confirm", fr: "Confirmer", en: "Confirm" },
      { key: "account.save", fr: "Enregistrer", en: "Save" },
    ],
    routes: ["/account"],
  },
  {
    id: "password_change",
    title: { fr: "Changer de mot de passe", en: "Changing your password" },
    dispatcherHint: "changer ou reinitialiser son mot de passe, mot de passe oublie",
    answer: {
      fr: [
        "Menu → « Compte » → « Changer mon mot de passe » : un lien pour choisir un nouveau mot de passe part vers ton adresse e-mail.",
        "Sans être connecté, le même lien s'obtient avec « Mot de passe oublié ? » sur la page de connexion.",
      ],
      en: [
        "Menu → “Account” → “Change my password”: a link to choose a new password is sent to your email address.",
        "When signed out, the same link comes from “Forgotten your password?” on the sign-in page.",
      ],
    },
    labels: [
      { key: "shell.nav.account", fr: "Compte", en: "Account" },
      { key: "account.password.change", fr: "Changer mon mot de passe", en: "Change my password" },
      { key: "auth.field.forgot", fr: "Mot de passe oublié ?", en: "Forgotten your password?" },
    ],
    routes: ["/account", "/auth"],
  },
  {
    id: "account_delete",
    title: { fr: "Supprimer son compte", en: "Deleting your account" },
    dispatcherHint: "supprimer son compte, effacer ses donnees, restaurer un compte supprime",
    answer: {
      fr: [
        "Menu → « Compte » → onglet « Réglages » → « Supprimer mon compte ». L'app propose d'abord de télécharger tes données, puis demande ton mot de passe et de taper DELETE.",
        "L'accès est coupé tout de suite, Sophia n'écrit plus, et l'abonnement est résilié sans autre prélèvement.",
        "Toutes les données sont supprimées définitivement dans 7 jours ; se reconnecter avant permet « Restaurer mon compte ».",
        "Les factures et une trace anonyme de la suppression sont gardées.",
      ],
      en: [
        "Menu → “Account” → “Options” tab → “Delete my account”. The app first offers to download your data, then asks for your password and for you to type DELETE.",
        "Access is cut off straight away, Sophia stops writing, and the subscription is cancelled with no further charge.",
        "All data is permanently deleted in 7 days; signing in before then lets you “Restore my account”.",
        "Invoices and an anonymised record of the deletion are kept.",
      ],
    },
    variants: [
      {
        when: { roles: ["owner"] },
        answer: {
          fr: [
            "Menu → « Compte » → onglet « Réglages » → « Supprimer mon compte ». L'app propose d'abord de télécharger tes données, puis demande ton mot de passe et de taper DELETE.",
            "L'accès est coupé tout de suite, Sophia n'écrit plus, et l'abonnement est résilié sans autre prélèvement.",
            "Le foyer n'est pas supprimé : les personnes qui en font partie gardent leurs parts, leurs allergies et leurs repas.",
            "Toutes tes données sont supprimées définitivement dans 7 jours ; te reconnecter avant permet « Restaurer mon compte ».",
          ],
          en: [
            "Menu → “Account” → “Options” tab → “Delete my account”. The app first offers to download your data, then asks for your password and for you to type DELETE.",
            "Access is cut off straight away, Sophia stops writing, and the subscription is cancelled with no further charge.",
            "The household is not deleted: the people in it keep their servings, their allergies and their meals.",
            "All your data is permanently deleted in 7 days; signing in before then lets you “Restore my account”.",
          ],
        },
      },
      {
        when: { roles: ["member"] },
        answer: {
          fr: [
            "Menu → « Compte » → onglet « Réglages » → « Supprimer mon compte ». L'app propose d'abord de télécharger tes données, puis demande ton mot de passe et de taper DELETE.",
            "Ta place dans le foyer reste par défaut (ta part et tes allergies) ; une case permet de la retirer aussi.",
            "Toutes tes données sont supprimées définitivement dans 7 jours ; te reconnecter avant permet « Restaurer mon compte ».",
          ],
          en: [
            "Menu → “Account” → “Options” tab → “Delete my account”. The app first offers to download your data, then asks for your password and for you to type DELETE.",
            "Your place in the household stays by default (your serving and your allergies); a box lets you remove it too.",
            "All your data is permanently deleted in 7 days; signing in before then lets you “Restore my account”.",
          ],
        },
      },
    ],
    labels: [
      { key: "shell.nav.account", fr: "Compte", en: "Account" },
      { key: "account.tab.settings", fr: "Réglages", en: "Options" },
      { key: "account.delete.title", fr: "Supprimer mon compte", en: "Delete my account" },
      { key: "account.pending.restore", fr: "Restaurer mon compte", en: "Restore my account" },
    ],
    routes: ["/account"],
  },
  {
    id: "data_export",
    title: { fr: "Exporter ses données", en: "Exporting your data" },
    dispatcherHint: "telecharger ou exporter ses donnees",
    answer: {
      fr: [
        "Menu → « Compte » → onglet « Réglages » → « Préparer mon export », puis ton mot de passe et « Générer mon export ».",
        "Le lien de téléchargement est valable 15 minutes ; un export par 24 heures.",
      ],
      en: [
        "Menu → “Account” → “Options” tab → “Prepare my export”, then your password and “Generate my export”.",
        "The download link is valid for 15 minutes; one export every 24 hours.",
      ],
    },
    labels: [
      { key: "shell.nav.account", fr: "Compte", en: "Account" },
      { key: "account.tab.settings", fr: "Réglages", en: "Options" },
      { key: "account.export.open", fr: "Préparer mon export", en: "Prepare my export" },
      { key: "account.export.generate", fr: "Générer mon export", en: "Generate my export" },
    ],
    routes: ["/account"],
  },
  {
    id: "emails_unsubscribe",
    title: { fr: "Ne plus recevoir d'e-mails", en: "Stopping emails" },
    dispatcherHint: "arreter les e-mails, se desabonner des e-mails de suivi",
    answer: {
      fr: [
        "En bas de chaque e-mail de suivi, le lien « Ne plus recevoir ces e-mails » les arrête.",
        "Les reçus de paiement, les réinitialisations de mot de passe et ce que tu demandes toi-même continuent d'arriver.",
        "Il n'y a pas de réglage des e-mails dans l'app ; les messages de Sophia dans l'app se règlent à part.",
      ],
      en: [
        "At the bottom of each follow-up email, the “Stop these emails” link stops them.",
        "Payment receipts, password resets and anything you ask for yourself still arrive.",
        "There is no email setting in the app; Sophia's in-app messages are set separately.",
      ],
    },
    labels: [
      { key: "file:supabase/functions/_shared/keel/lifecycle_email.ts", fr: "Ne plus recevoir ces e-mails", en: "Stop these emails" },
    ],
    routes: [],
  },
  {
    id: "unknown_feature",
    title: { fr: "Ce qui n'existe pas", en: "What does not exist" },
    dispatcherHint: "une fonction qui ne figure pas dans cette liste (scanner un code-barres, montre connectee, parler a un humain...)",
    answer: {
      fr: [
      ],
      en: [
      ],
    },
    labels: [
    ],
    routes: [],
  },
];
