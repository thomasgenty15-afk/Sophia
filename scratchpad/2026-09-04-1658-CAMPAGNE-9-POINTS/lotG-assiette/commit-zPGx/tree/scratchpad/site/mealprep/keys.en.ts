// `/meal-prep` — namespace `mealprep`, English seed.
//
// À FUSIONNER dans `frontend/src/keel/i18n/en.ts` par l'orchestrateur, et à
// ajouter à `PUBLIC_NAMESPACES` (pas à la liste PENDING_TRANSLATION : le
// français est livré, voir `keys.fr.ts`).
//
// Aucune clé ne porte de trou d'interpolation `{...}` — la parité FR/EN sur ce
// point est donc vraie par construction, pas par vigilance.
//
// Les libellés DE FIGURE (`mealprep.fig.*.label`, `.covers`, `.first`, `.next`,
// `.fresh`, `.week`, `.dish`, `.session`, `.tonight`) sont écrits EN CAPITALES
// dans la valeur, et c'est délibéré : `text-transform` sur un `<text>` SVG n'est
// pas garanti par tous les moteurs, alors que la casse d'une étiquette de figure
// EST une décision de charte (CHARTE §6 F11). Elle est donc dans la donnée.

export const mealprepEn = {
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
} as const;
