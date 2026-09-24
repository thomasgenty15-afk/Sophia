// Seed anglais — le namespace `meals`, et lui seul.
// Assemblé dans `../en.ts`; une clé `meals.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enMeals = {
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
  "meals.result.day_rail": "Read one day",
  // La carte de session du bloc jour — la durée affichée est celle de la
  // SESSION, sur sa propre carte; jamais sur un plat.
  "meals.result.day_session": "Cooking session",
  "meals.result.day_session_show": "See the detail",
  "meals.result.day_session_hide": "Hide the detail",
  // La vague de courses qui tombe ce jour-là. Les ratures restent dans la
  // fenêtre de courses; cette liste-ci se lit, elle ne se coche pas.
  "meals.result.day_groceries_one": "Groceries for this day — 1 item",
  "meals.result.day_groceries_many": "Groceries for this day — {n} items",
  "meals.result.day_groceries_show": "See the list",
  "meals.result.day_groceries_hide": "Hide the list",
  // Un jour vraiment vide le dit — un bloc muet sous un titre de jour se
  // lirait comme une panne.
  "meals.result.day_nothing": "Nothing to cook or buy this day.",
  // ── ⟳ 2026-09-24 · THE WEEK TABLE, AT THE TOP OF THE PLAN ───────────────
  // It replaces "The whole week" (`meals.result.day_all`, removed).
  "meals.week_table.caption": "Your week at a glance",
  "meals.week_table.groceries": "Groceries",
  "meals.week_table.cooking": "Cooking",
  "meals.week_table.yes": "yes",
  "meals.week_table.hours": "{h}h",
  "meals.week_table.hours_minutes": "{h}h{m}",
  "meals.week_table.person_kcal": "{name} (kcal)",
  "meals.week_table.partial_note": "* Some of that day’s meals aren’t counted.",
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
  // L3 — ELLE MANGE, MAIS PAS CE QUE LE PLAN COMPOSE. Voisin d'`away` et
  // distinct de lui: aucun plat dans les deux cas, mais celui-ci est le seul
  // où le produit gardera le droit de dire un ordre de grandeur.
  "meals.grid.eating_out": "eating out",
  // ── FF-053 · LE BLOC CUISINE ────────────────────────────────────────────
  "meals.kitchen.title": "What you cook",
  "meals.kitchen.cook_on": "cook it {day}",
  "meals.kitchen.feeds": "feeds {days}",
  "meals.result.past": "Gone by",
  // Les sessions: le moment où l'on cuisine. Le déroulé est ce qu'on lit avant
  // de commencer, et aucun plat ne peut le porter — l'ordre des gestes se joue
  // ENTRE les préparations.
  "meals.sessions.title": "Your cooking sessions",
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
  "meals.doses.title": "Portions per person",
  "meals.dish.who_eats": "Who eats this",
  // ⟳ 2026-09-22 — the bottom list when several doses are shown above: it is
  // their SUM, that is, what to prepare in total. With a single dose the list
  // is not rendered at all — it repeated the dose word for word.
  "meals.result.total_quantities": "The total to prepare",
  // The fold on a dish card, on `/app/plan` and on the preview. "The detail"
  // and not "the recipe": what opens are the boxes, the per-person doses and
  // the added ingredients — the batch recipe lives in the cooking session.
  "meals.dish.unfold": "See the detail",
  "meals.dish.fold": "Hide the detail",
  // ⟳ 2026-09-24 — REPLACE A DISH OF THE PREVIEW.
  "meals.dish.replace": "Change",
  "meals.dish.keep": "Keep this dish",
  "meals.dish.replace_reason": "To change: “{reason}”",
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
  "meals.boxes.energy": "· {n} kcal",
  // ⟳ 2026-09-22 — A LIQUID DOSE, in the unit of the gesture. The "≈" is not
  // decoration: the spoon is a rounding, the grams next to it are the exact
  // number. Both are read together (see `lib/householdMeasure.ts`).
  "meals.boxes.teaspoons": "≈ {n} tsp",
  "meals.boxes.tablespoons": "≈ {n} tbsp",
  "meals.boxes.millilitres": "≈ {n} ml",
  // Au-delà de quatre prénoms, le couvercle dit combien ils sont: six noms ne se
  // lisent ni sur un bac ni sur un téléphone à 320 px.
  "meals.boxes.rest_of_table": "The rest of the table ({n})",
  // Un plan relu sans ses parts n'a aucun prénom à joindre: l'instruction de
  // pesée reste vraie, et un identifiant brut n'a rien à faire à table.
  "meals.boxes.lid_unnamed": "One container",
  // « g » est le symbole international du gramme.
  "meals.boxes.grams": "{n} g",
  // ⟳ 2026-09-22 — what a batch share holds, under its Boxing line: "of which
  // chicken ~110 g, vegetables ~140 g". The tilde says it is information, not a
  // weighing — a stew does not come apart.
  "meals.boxes.parts": "of which",
  "meals.boxes.part": "{term} ~{n} g",
  "meals.boxes.part_vegetables": "vegetables",
  // ⟳ 2026-09-23 — LES À-CÔTÉS D'UNE BOÎTE: une ligne « À côté » à part,
  // rattachée à la boîte de la personne — « 1 × apple », « cheddar ~30 g ».
  // Sur un bac commun, la ligne dit pour qui: « Christèle: 1 × plain yoghurt ».
  // ⚠️ Rien ne dit d'où vient un à-côté (modèle ou liste de secours).
  // `side_unit` et `side_grams` n'ont aucun mot à traduire: un nombre, un
  // terme qui vient du plan (déjà dans sa langue), un symbole.
  "meals.boxes.side_courses": "On the side",
  "meals.boxes.side_unit": "{n} × {term}",
  "meals.boxes.side_grams": "{term} ~{n} g",
  "meals.boxes.side_for": "{name}: {items}",
  // ── LE CONTENANT QUI PART AU CONGÉLATEUR (2026-09-04) ─────────────────────
  // ⛔ Une INSTRUCTION au moment de remplir le bac, pas un état constaté: la
  // moitié « sortir » est dite par `DishCard` quatre jours plus tard, et sans
  // celle-ci on demandait de sortir une part que personne n'avait rangée.
  "meals.boxes.freeze": "· freeze",
  // ⟳ 2026-09-16 — a container holding only the batch share: the rest of the
  // meal (tortilla, lettuce…) is put together on the day, and the day says so.
  "meals.boxes.rest_on_the_day": "· the rest is made on the day",
  // ⟳ 2026-09-23 — a share of the box cooked in ANOTHER session: named and
  // dated, never weighed here (Wednesday was weighing Friday's salmon).
  "meals.boxes.with_other_session": "· with {what}, cooked on {day}",
  "meals.boxes.with_other_session_undated": "· with {what}, from another session",
  // Le compte en tête, muet à zéro: un plan à deux sessions n'a rien à congeler.
  "meals.boxes.freeze_count": "· {n} to the freezer",
  // ── LE TEMPS ──────────────────────────────────────────────────────────────
  // Deux nombres, jamais fondus en un. « 10 min hands-on » décide si on s'y met
  // ce soir; « 50 min in all » décide si on a la fenêtre. N'en montrer qu'un
  // ferait renoncer sur le mauvais critère.
  "meals.sessions.session_time": "about {n} min",
  "meals.sessions.thaw_night_before": "The night before, take out of the freezer: {items}.",
  "meals.sessions.active": "{n} min hands-on",
  "meals.sessions.total": "{n} min in all",
  "meals.sessions.recipe_show": "Recipe",
  "meals.sessions.recipe_hide": "Hide recipe",
  "meals.sessions.overview_title": "Overall run-through",
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
    "Untick a meal you will not be eating at home — nothing gets cooked for " +
    "it, and nothing gets bought.",
  "meals.picker.meal": "Meal",
  "meals.picker.all_on":
    "To change the number of meals, go to Household > Food preferences.",
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
  "meals.picker.open": "Who's in? Day by day",
  "meals.picker.save": "Save",
  "meals.picker.saving": "…",
  "meals.picker.cancel": "Cancel",
  // ⟳ 2026-09-23 — THE HEADER BOXES: a row is one meal across every day, a
  // column is one whole day.
  "meals.picker.bulk_hint":
    "The box before a meal or above a day clears the whole row or the whole column.",
  "meals.picker.row_all": "{meal} — every day",
  "meals.picker.column_all": "{day} — every meal",
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
  // ⛔ 2026-09-23 — the daily range is no longer shown (see `fr.ts`). Its
  // seven sentences went with `EnergyTargetNote`.
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
  "meals.tick.label": "Not eaten",
  "meals.tick.failed": "That did not save. Tap it again.",
  "meals.week.title": "Meal tracking",
  "meals.week.lead":
    "Tick the meals you did not eat; the rest is counted automatically.",
  "meals.week.loading": "Loading your week…",
  "meals.week.error": "Your week could not be loaded.",
  "meals.week.retry": "Try again",
  "meals.week.empty_title": "No plan this week yet",
  "meals.week.empty_body": "Your week is set up on your plan: your meals will show up here.",
  "meals.week.empty_cta": "Go to my plan",
  "meals.week.days_label": "Plan days",
  "meals.week.day_empty": "Nothing planned for you that day.",
  "meals.week.future_note":
    "These meals are still ahead: you can tick them on the day.",
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
  "meals.shopping.freeze": "freeze it",
  "meals.shopping.freeze_block_one": "Freeze as soon as you are home — 1 item",
  "meals.shopping.freeze_block_many": "Freeze as soon as you are home — {n} items",
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

  "meals.form.title": "New plan",
  "meals.form.mode_label": "Where do we start",
  "meals.form.mode_from_pantry": "From what I already have",
  "meals.form.mode_to_shop": "I will shop for it",
  // LA FENÊTRE, ET CE QU'ELLE COUVRE VRAIMENT. « Until Sunday » un dimanche
  // fait UN jour — l'aperçu le dit, sinon le bouton a l'air cassé.
  "meals.form.window_label": "Days",
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
  // ⛔ `meals.form.preferences_carried` A ÉTÉ RETIRÉE LE 2026-09-10 (lot 7).
  // Elle prévenait qu'une envie était REPRISE du dernier plan; l'envie ne se
  // reprend plus, elle se relit sur la semaine visée (`loadEnvyLine`). Une clé
  // orpheline est du travail de traduction payé pour un écran qui ne l'affiche
  // plus, et elle survit aux suppressions sans bruit.
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
  "meals.form.submit_for": "Build {days} for {people}",
  "meals.form.people_one": "{n} person",
  "meals.form.people_other": "{n} people",
  "meals.form.building": "Building…",
  "meals.form.cancel": "Cancel",
  "meals.form.pantry_required": "Add what you have in, or switch to «I will shop for it».",
  "meals.result.title": "Your meals",
  // ⚠️ ELLE NOMMAIT UN CHAMP QUI N'EXISTE PLUS — voir la note d’`fr.ts`.
  "meals.result.empty":
    "Nothing built yet. Tell me which days, above, and I will put a few meals together.",
  "meals.result.shopping_title": "Shopping list",
  "meals.result.shopping_close": "Hide shopping list",
  // Deux repères, et rien de plus. « Demain », « dans 3 jours » seraient des
  // calculs à refaire à chaque rendu pour une information que l'ordre donne
  // déjà: ce qui suit « today » est à venir.
  // ── QUAND LA SEMAINE EXISTE DÉJÀ ──────────────────────────────────────────
  "meals.rebuild.button": "Build another plan",
  "meals.rebuild.title": "Build another plan",
  "meals.rebuild.prepare_next": "Prepare next plan",
  // ⟳ 2026-09-23 — the four short labels, under 363 px wide
  // (`NarrowLabel` in `MealBuilder.tsx`).
  "meals.rebuild.prepare_next_short": "Next plan",
  "meals.rebuild.button_short": "New plan",
  "meals.sessions.button_short": "Sessions",
  "meals.result.shopping_short": "Shopping",
  // ⟳ 2026-09-09 — voir la note jumelle dans `fr.ts`: le groupe qui porte les
  // deux onglets de plan a besoin d'un nom.
  "meals.result.plan_switch": "Which plan",
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
  "meals.rebuild.confirm_title": "Replace your current plan?",
  "meals.rebuild.confirm_body":
    "Your plan from {from} to {to} will be replaced by the one you are about to build. You will see a preview first, and nothing changes until you adopt it.",
  "meals.rebuild.confirm_go": "See the preview",
  "meals.rebuild.confirm_cancel": "Keep my plan",
  "meals.rebuild.confirm_close": "Close",
  "meals.eta": "Two to three minutes on average to compose a plan.",

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
} as const
