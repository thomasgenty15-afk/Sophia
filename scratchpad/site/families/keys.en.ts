// `/families` — le pack ANGLAIS. 97 clés, namespace `families`.
//
// À FUSIONNER dans `frontend/src/keel/i18n/en.ts` (l'orchestrateur intègre; je
// n'y touche pas). Le seed anglais est la SOURCE DU TYPE: une clé ajoutée ici
// type immédiatement les appels `t()` de `FamiliesPage.tsx`.
//
// ⚠️ `families` doit entrer dans `PUBLIC_NAMESPACES` (catalog.ts:34) et NON
// dans `PUBLIC_NAMESPACES_PENDING_TRANSLATION`: le pack français est livré en
// même temps (`keys.fr.ts`), donc la page n'a aucune raison de rester en
// anglais quand la vitrine est en français.
//
// ZÉRO trou d'interpolation `{...}` des deux côtés — donc rien à apparier pour
// `parity.int.test.ts` au-delà de l'égalité des jeux de clés.
//
// Les libellés de FIGURE sont écrits EN CAPITALES dans la valeur: ce sont des
// `<text>` SVG, aucun `text-transform` ne les atteint. Les `kicker`, eux, sont
// en casse normale — c'est la classe `uppercase` de `Kicker` qui les monte.

export const familiesEn = {
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
} as const;
