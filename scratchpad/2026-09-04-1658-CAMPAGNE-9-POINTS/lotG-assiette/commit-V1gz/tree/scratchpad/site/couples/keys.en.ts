// ─────────────────────────────────────────────────────────────────────────────
// NAMESPACE `couples` — la page /couples, seed ANGLAIS (source du type).
// À fusionner dans `frontend/src/keel/i18n/en.ts` par l'orchestrateur.
//
// ⚠️ Aucun trou d'interpolation dans ce namespace : la parité EN/FR est donc
//    triviale à tenir (`parity.int.test.ts`). Le FR est une réécriture, pas un
//    calque — c'est une page de vente, pas une documentation traduite.
// ⚠️ Les prix ne se traduisent pas, ils se composent : « €12.99 » en anglais,
//    « 12,99 € » en français, avec une espace INSÉCABLE U+00A0 avant l'euro
//    (U+202F n'a de glyphe dans aucune des deux familles — CHARTE §0 ④).
// ─────────────────────────────────────────────────────────────────────────────

export const couplesEn = {
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
} as const;
