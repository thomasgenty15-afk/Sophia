// Seed anglais — le namespace `home`, et lui seul.
// Assemblé dans `../en.ts`; une clé `home.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enHome = {
  // ══════════════════════════════════════════════════════════════════════════
  // `/` — THE ONLY HOUSEHOLD LANDING (rebuilt 2026-09-08).
  // ══════════════════════════════════════════════════════════════════════════
  //
  // La copie française fait autorité (brief `scratchpad/2026-09-08-0030-
  // POSITIONNEMENT-landing.md`); l'anglais la suit, et les FAITS produit sont
  // les mêmes des deux côtés — voir l'en-tête du bloc dans `fr.ts`.
  // ⚠️ `/meal-prep`, `/couples` et `/families` sont retirées avec leurs
  // namespaces ce jour-là: il n'y a plus qu'UNE page de vente.
  //
  // ── SEO ──────────────────────────────────────────────────────────────────
  "home.seo_title": "Your goal, at the table",
  "home.seo_description":
    "Lose weight or build muscle: Sophia builds your meals, works out the quantities and organises your shopping and cooking. 7-day trial.",

  // ── PAGE NAVIGATION (anchors) ────────────────────────────────────────────

  // ── HERO ─────────────────────────────────────────────────────────────────
  // Landing refreshed 2026-09-18: direct copy, visible example, optional details.
  "home.hero.eyebrow": "Sophia · AI nutrition coach",
  "home.hero.title_1": "Your meal plans to lose weight",
  "home.hero.title_2": "or build muscle.",
  "home.hero.lede": "Sophia calculates your portions, prepares your shopping list and organises cooking around your availability.",
  "home.hero.cta": "Try it for 7 days",
  "home.hero.trial": "Then {amount}/month · No commitment",
  "home.hero.visual_alt": "Roast chicken bowl with bulgur, avocado and colourful vegetables",
  "home.hero.label_pleasure": "Pleasure is part of the plan",
  "home.hero.label_menu_kicker": "On the menu",
  "home.hero.label_menu": "Your goal, as recipes.",
  "home.hero.label_cooked": "Balanced dishes",
  "home.pain.kicker": "What usually gets in the way",
  "home.pain.title_1": "You know where you want to go.",
  "home.pain.title_2": "What's missing is the way there.",
  "home.pain.q1": "“I don't know what to eat.”",
  "home.pain.a1": "A menu built for your goal, with your tastes and constraints. Not a list of rules: dishes.",
  "home.pain.q2": "“I don't know how much.”",
  "home.pain.a2": "The quantities are written in the plan, before the shopping. Nothing to estimate, nothing to guess afterwards.",
  "home.pain.q3": "“I don't have the time.”",
  "home.pain.a3": "The shopping and the cooking sessions are organised around your days. All you do is cook.",
  "home.goal.aria": "Pick a goal to see what Sophia does",
  "home.goal.fat_loss": "Lose weight",
  "home.goal.muscle_gain": "Build muscle",
  "home.goal.note.fat_loss":
    "Meals organised around your goal, taking your activity and your preferences into account.",
  "home.goal.note.muscle_gain":
    "Quantities and protein intake accounted for in the recipes of your plan.",
  "home.goal.direction_label": "On the plate, that means",
  "home.dir.fat_loss":
    "generous vegetables, full protein share, smaller starch share",
  "home.dir.muscle_gain":
    "larger protein and starch share, same vegetables",
  "home.dir.maintenance": "balanced share of every component",
  "home.hero.example": "See an example",
  "home.plan.summary.when": "Sunday dinner and Monday lunch",
  "home.plan.summary.portions": "In each portion",
  "home.plan.summary.units": "Cooked quantities, ready to serve.",
  "home.plan.summary.prep": "Prepare on Sunday",
  "home.plan.summary.prep_body": "Cook the chicken, vegetables and bulgur in one session. Keep one portion for lunch the next day.",
  "home.plan.summary.time": "About {minutes} min in total, including cooking time.",
  "home.plan.summary.next": "Monday lunch: reheat in {minutes} min.",
  "home.plan.summary.energy": "Calories calculated from the quantities in this example.",
  "home.reach.example": "“Remember to take the chicken out of the freezer tonight for tomorrow’s cooking.”",
  "home.reach.example_note": "Fictional example",
  "home.preview.label": "Example meal",
  "home.preview.note": "One portion · Cooked quantities",
  "home.flow.sunday": "Sunday",
  "home.flow.more": "+ {count} ingredients in the full list",
  "home.flow.cooking_time": "{minutes} min, including cooking time",
  "home.flow.dinner": "Sunday dinner",
  "home.flow.serve": "One portion ready to serve.",
  "home.flow.lunch": "Monday lunch",
  "home.flow.reheat": "The other portion, ready to reheat in {minutes} min.",
  // Mirror of the French block — the three bubbles are the three channels that
  // really go out (`keel-proactive-v1`): thaw_reminder, weigh_in, slot_meal.
  "home.reach.bubble.thaw": "Take the chicken out of the freezer tonight — you are cooking tomorrow.",
  "home.reach.bubble.weigh": "Can you weigh yourself this morning? Your next plan starts from what you weigh today.",
  "home.reach.bubble.slot": "What did you have for lunch?",
  // Basis `plan_quantities` — same shape as `meals.energy.dish`; the basis is
  // rendered next to it (`home.plan.summary.energy`). Listed in
  // `ENERGY_KEYS_WITH_A_BASIS` (`energyBasis.int.test.ts`).
  "home.flow.energy": "{kcal} kcal",
  "home.offer.price": "Then {amount}/month for the household",
  "home.offer.extra": "Optional: + {amount}/month for another member who wants their own tracking. Their needs are included in household menus at no extra cost.",
  "home.faq.cancel_q": "Can I cancel at any time?",
  "home.faq.cancel_a": "Yes. Cancellation takes effect at the end of your current subscription period.",
  "home.plan.boxes_label": "Portions to store",
  "home.plan.kicker": "A concrete example",
  "home.plan.title_1": "Your plan, from shopping to meals.",
  "home.plan.title_2": "And how much.",
  "home.plan.body": "One dish cooked on Sunday, one portion for dinner and another for the next day. Sophia sets out the portions and what to buy.",
  "home.plan.photo_alt": "Roast salmon with potatoes and green vegetables",
  "home.plan.photo_kicker": "Real meals.",
  "home.plan.photo_line": "Pleasure is part of the plan.",
  "home.plan.photo_strong": "And it shows.",
  "home.plan.badge": "Example plan",
  "home.plan.open": "See the recipes and full shopping list",
  "home.plan.close": "Hide the details",
  "home.plan.window": "An example for one person over two days.",
  "home.plan.household": "Example kept to the minimum",
  "home.plan.chain_hint": "Hover an item, a preparation or a dish: whatever goes with it lights up.",
  "home.plan.example_note":
    "Illustrative example. Your plan depends on your needs and your preferences.",
  "home.plan.toggle_hint": "Switch goals to see the portions in this example change.",
  "home.plan.precision_label": "Good to know",
  // Mirror of the French block: two ACCURACIES, not two error rates. Same
  // measurement (26.6% MAPE from a photo, 2.3% from known quantities), read the
  // other way round, and both rounded against the product's favour.
  // No digit sits next to the word calories — that would pull the key into
  // `ENERGY_KEYS_WITH_A_BASIS` with no reading basis to declare.
  "home.plan.precision":
    "Tracking your calories from a photo is about 73% accurate. Working them out in advance, from the quantities in the plan, is 98%.",
  "home.plan.precision_source": "Measured on 85 real meals, recounted against the USDA food composition table. A measurement, not a promise.",

  "home.demo.you": "You",
  "home.demo.member.alex_note": "Building muscle",
  "home.demo.member.lou_note": "Vegetarian",
  "home.demo.member.you_note": "Weight loss",
  "home.demo.dish.chicken_bowl": "Paprika roast chicken, bulgur and vegetables",
  "home.demo.dish.omelette": "Pepper omelette with green salad",
  "home.demo.prep.chicken": "Paprika roast chicken and vegetables",
  "home.demo.prep.bulgur": "Lemon bulgur",
  "home.demo.prep.chicken_method": "Roast the thighs and the vegetables at 200 °C with paprika and olive oil, 45 minutes.",
  "home.demo.prep.bulgur_method": "Cook the bulgur, then add the lemon zest and juice.",
  "home.demo.run.sun": "Heat the oven. Once the chicken and vegetables are in, cook the bulgur separately. Let it cool, then box it: chicken and vegetables on one side, bulgur beside them.",
  "home.demo.ing.chicken_thighs": "Chicken thighs",
  "home.demo.ing.peppers": "Peppers",
  "home.demo.ing.carrots": "Carrots",
  "home.demo.ing.lemons": "Lemons",
  "home.demo.ing.green_salad": "Green salad",
  "home.demo.ing.bulgur": "Bulgur",
  "home.demo.ing.eggs": "Eggs",
  "home.demo.ing.smoked_paprika": "Smoked paprika",
  "home.demo.box.chicken": "roast chicken",
  "home.demo.box.bulgur": "bulgur",
  "home.demo.box.vegetables": "roast vegetables",
  "home.demo.box.main": "Chicken and vegetables",
  "home.demo.box.side": "Bulgur, on the side",
  "home.how.kicker": "How it works",
  "home.how.title_1": "Your shopping and cooking, organised.",
  "home.how.title_2": "All you do is cook.",
  "home.how.lede": "Tell Sophia your preferences, who you cook for and your cooking days. She builds the plan; you do the shopping and cooking.",
  "home.how.shop.title": "Your shopping",
  "home.how.shop.body":
    "One list brings together the ingredients to buy for your planned meals.",
  "home.how.cook.title": "Your cooking session",
  "home.how.cook.body":
    "Recipes and preparations are organised around your cooking days.",
  "home.how.eat.title": "Your meals",
  "home.how.eat.body":
    "For each meal, you get the dish and the quantities to serve each person.",
  "home.how.box.title": "Your boxes",
  "home.flow.step_at": "{minutes} min",
  "home.flow.cook.step_1": "Heat the oven to 200 °C. Slice the carrots into rounds and the peppers into strips.",
  "home.flow.cook.step_2": "Toss the chicken and vegetables with the smoked paprika and a drizzle of olive oil, then roast for 45 minutes.",
  "home.flow.cook.step_3": "Cook the bulgur separately, 15 minutes in salted boiling water, then add the lemon zest and juice.",
  "home.flow.cook.step_4": "Take the dish out and let it cool before boxing.",
  "home.flow.boxing": "Sunday, after cooking",
  "home.flow.box_count": "Two boxes, one per meal",
  "home.flow.box_side": "Chicken and vegetables come out of the same tray, always in the same proportions. The bulgur cooks separately and is portioned separately.",
  "home.flow.box_weigh": "You weigh once, while boxing. On the day, you open and reheat.",
  "home.house.kicker": "When you cook for others",
  "home.house.title_1": "Cooking for other people?",
  "home.house.title_2": "Their appetite.",
  "home.house.title_3": "The same table.",
  "home.house.body_1":
    "Sophia takes everyone’s preferences and needs into account. Shopping and preparations are combined where possible.",
  "home.house.body_2":
    "Sophia combines shopping and preparations where possible, and plans different dishes when needed.",
  "home.house.cta": "See what’s included",
  "home.house.table_kicker": "At home",
  "home.house.table_each": "A place for each",
  "home.house.shared_list": "One shopping list and cooking sessions for everyone",
  "home.house.note": "Example household. Meals adapt to the profiles you enter.",
  "home.life.kicker": "And when life shows up?",
  "home.life.title_1": "An unplanned meal?",
  "home.life.title_2": "It counts too.",
  "home.life.body":
    "A restaurant, a dish that was not on the plan: describe what you ate or take a photo. Sophia estimates it and counts it in your tracking.",
  "home.life.demo.aria": "Demonstration: logging an unplanned meal",
  "home.life.demo.label": "What you send",
  "home.life.demo.describe": "A description",
  "home.life.demo.photo": "A photo",
  "home.life.demo.example": "Four-cheese pizza at a restaurant, two slices and a salad.",
  "home.life.demo.photo_example": "A photo of the plate, taken at the table.",
  "home.life.demo.send": "Send",
  "home.life.scene.pizza": "Four-cheese pizza · 2 slices",
  "home.life.scene.salad": "A salad",
  "home.life.scene.counted": "Counted in your tracking",
  "home.reach.kicker": "Everyday support",
  "home.reach.title_1": "Sophia checks in.",
  "home.reach.title_2": "At the right moment.",
  "home.reach.body":
    "Nothing to keep in mind. She writes the night before a cooking session, on a weigh-in morning, or after a meal the plan did not cover.",
  "home.reach.thaw.title": "The night before a session",
  "home.reach.thaw.body":
    "“Tonight, take the chicken out of the freezer.” The reminder lands between 6 and 8 pm, the day before, when something needs to thaw.",
  "home.reach.weigh.title": "Your weigh-in",
  "home.reach.weigh.body":
    "Every two days if you are losing weight, every five when building muscle. The next plan is worked out from what you weigh today.",
  "home.reach.slot.title": "The meal the plan does not cover",
  "home.reach.slot.body":
    "Lunch out? She asks what you had, so your day is complete.",
  "home.reach.silence": "And if you go quiet for a few days: one word, just one.",
  "home.reach.hand":
    "You can turn off her proactive messages and still ask her questions whenever you need to.",
  "home.offer.kicker": "The subscription",
  "home.offer.title_1": "7 days to try Sophia",
  "home.offer.title_2": "with a meal.",
  "home.offer.body":
    "Meal plans, shopping list, cooking schedule and personal tracking included.",
  "home.offer.check_trial": "7 days to discover Sophia",
  "home.offer.check_commit": "No commitment",
  "home.offer.coaching.title": "Does someone else want their own tracking?",
  "home.offer.coaching.price": "{amount} a month per person",
  "home.offer.coaching.body": "An additional account lets them talk to Sophia, track their weight and calories, and log meals outside the plan.",
  "home.offer.coaching.item_1": "Their off-plan meals counted: they describe them or take a photo.",
  "home.offer.coaching.item_2": "Their calorie and weight tracking.",
  "home.offer.coaching.item_3": "Their own conversation with Sophia the coach.",
  "home.offer.coaching.free": "They don’t need an account to eat with you: household menus already take their needs into account.",
  "home.offer.card.name": "For you and your household",
  "home.offer.card.badge": "7-day trial",
  "home.offer.card.per_month": "/ month",
  "home.offer.card.for": "Your personal tracking and household meals included.",
  "home.offer.card.inc_1": "Menus for your goal and your preferences",
  "home.offer.card.inc_2": "Quantities and intake worked out",
  "home.offer.card.inc_3": "Shopping and cooking sessions organised",
  "home.offer.card.inc_4": "The needs of the house taken into account",
  "home.offer.card.cta": "Try Sophia for 7 days",
  "home.offer.card.note": "Then {amount}/month for the household. Additional personal accounts are optional.",
  "home.faq.kicker": "Before you start",
  "home.faq.title_1": "Your questions",
  "home.faq.title_2": "an answer.",
  "home.faq.q1": "Do I have to count my calories?",
  "home.faq.a1":
    "The quantities and the intake of the planned recipes are already worked out. You do not have to re-enter every ingredient in a counter. If you eat something else, you can describe your dish or take a photo so it counts.",
  "home.faq.q2": "What if I eat something else?",
  "home.faq.a2":
    "That meal can be added to your tracking. It does not change the meals already planned.",
  "home.faq.q3": "What if I cook for other people?",
  "home.faq.a3":
    "Sophia takes into account the needs, preferences and habits of the members of the house. Shopping and preparations are grouped when possible. Depending on the constraints, the dishes can also differ.",
  "home.faq.q4": "Can someone else in the household have their own tracking?",
  "home.faq.a4":
    "Yes, with a personal access at {extra} a month. They can then talk to Sophia, track their weight and calories, and count their off-plan meals. Without it, their needs are already taken into account in the household menus, at no extra cost.",
  "home.faq.q5": "Does the plan change when I update my weight?",
  "home.faq.a5":
    "Your updated weight is part of the information used to generate the next plans. That is not an automatic reorganisation of the plan already in place, and it is not what happens after an unplanned meal either.",
  "home.faq.q6": "Do I need cooking experience?",
  "home.faq.a6":
    "Tell Sophia your skill level, equipment and available time. She takes these into account. You do the shopping and cooking yourself.",
  "home.faq.q7": "How does the trial work?",
  "home.faq.a7":
    "You have 7 days to try Sophia, then you can subscribe to continue. If you subscribe during the trial, you won’t be charged before it ends.",
  "home.close.title": "Ready to plan your first week?",
  "home.close.body": "A 7-day trial, then {amount} a month for the household. No commitment.",
  "home.close.cta": "Try Sophia for 7 days",
  "home.close.back_to_top": "Back to top",
} as const
