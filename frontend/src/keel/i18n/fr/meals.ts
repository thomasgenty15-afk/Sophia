// Pack français — le namespace `meals`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `meals.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frMeals = {
  // ══ LE MOTEUR DE REPAS (lot 4) ═══════════════════════════════════════════
  // Le catalogue parallèle d'`api/mealLabels.ts` a rejoint le seed, et c'est ce
  // qui débloque `/app/meals`, `/app/health`, `/app/household`, `/app/plan` et
  // `/app/today` d'un seul geste: les cinq écrans montaient les mêmes phrases.
  //
  // ── LE MOT « FOURNÉE » ────────────────────────────────────────────────────
  // « Batch » n'a pas de traduction unique en français de cuisine. Les pages de
  // vente gardent « batch cooking » parce que c'est le terme que ce public
  // cherche; À L'INTÉRIEUR du produit, la phrase parle d'une casserole précise
  // (« la fournée cuisinée dimanche »), et « fournée » est le mot français
  // exact pour ce qu'on fait cuire en une fois. Les deux choix sont
  // volontairement différents, et ils ne se croisent nulle part à l'écran.
  "meals.result.in_pantry": "Tu l’as déjà",
  // Seulement quand le plat puise dans un lot: sans lot, ces ingrédients sont la
  // recette entière et ce titre affirmerait un lot qui n'existe pas.
  "meals.result.extra_ingredients": "En plus du lot",
  "meals.result.method": "Comment",
  // « Comment » ouvre une recette; ceci ouvre un GESTE — réchauffer, trancher,
  // ajouter la salade. Deux mots parce que ce sont deux choses.
  "meals.result.assemble": "Au moment de servir",
  // ── LA SESSION D'OÙ CE PLAT TIRE SON LOT (2026-08-14) ───────────────────
  "meals.result.thaw_the_night_before":
    "Part congelée : sors-la du congélateur la veille au soir.",
  "meals.result.session_open": "La session de cuisine",
  "meals.result.session_hide": "Masquer la session",
  "meals.result.session_also": "Fait dans la même session : {titles}",
  "meals.result.today": "Aujourd’hui",
  "meals.result.past": "Passé",
  // ── LOT 1 (2026-08-17) · LA VUE PAR JOUR ────────────────────────────────
  "meals.result.day_rail": "Lire un jour",
  "meals.result.day_session": "Session de cuisine",
  "meals.result.day_session_show": "Voir le détail",
  "meals.result.day_session_hide": "Masquer le détail",
  "meals.result.day_groceries_one": "Les courses du jour — 1 article",
  "meals.result.day_groceries_many": "Les courses du jour — {n} articles",
  "meals.result.day_groceries_show": "Voir la liste",
  "meals.result.day_groceries_hide": "Masquer la liste",
  "meals.result.day_nothing": "Rien à cuisiner ni à acheter ce jour-là.",
  // ── ⟳ 2026-09-24 · LE TABLEAU DE LA SEMAINE, EN TÊTE DU PLAN ────────────
  // Il remplace « Toute la semaine » (`meals.result.day_all`, retirée).
  "meals.week_table.caption": "Ta semaine en un coup d’œil",
  "meals.week_table.groceries": "Courses",
  "meals.week_table.cooking": "Cuisine",
  "meals.week_table.yes": "oui",
  "meals.week_table.hours": "{h} h",
  "meals.week_table.hours_minutes": "{h} h {m}",
  "meals.week_table.person_kcal": "{name} (kcal)",
  "meals.week_table.partial_note": "* Une partie des repas de ce jour-là n’est pas comptée.",
  "meals.day_person.table": "Pour la table",
  "meals.day_person.member": "Pour {name}",
  "meals.day_person.members": "Pour {names}",
  "meals.day_person.marks_label": "Qui mange ce plat",
  "meals.grid.title": "Ta semaine d’un coup d’œil",
  "meals.grid.from_batch": "d’une fournée",
  "meals.grid.own_one": "+1 à part",
  "meals.grid.own_many": "+{n} à part",
  "meals.grid.own_only": "rien pour la table",
  "meals.grid.extra_one": "+1 plat de plus",
  "meals.grid.extra_many": "+{n} plats de plus",
  "meals.grid.eating_out": "repas dehors",
  "meals.kitchen.title": "Ce que tu cuisines",
  "meals.kitchen.cook_on": "à cuisiner {day}",
  "meals.kitchen.feeds": "couvre {days}",
  "meals.sessions.title": "Tes sessions de cuisine",
  "meals.sessions.makes": "— {n} portions",
  "meals.sessions.makes_one": "— {n} portion",
  // ⚠️ « Boxing » N'EST PAS TRADUIT, ET C'EST UNE DÉCISION DU 2026-08-20. C'est
  // le nom que le produit donne au geste; « Mise en boîtes » d'un côté et
  // « Boxing » de l'autre feraient deux noms pour la même chose entre une
  // capture d'écran et une phrase de support.
  "meals.boxes.title": "Boxing",
  // Sur la carte d'un PLAT: pas une pesée — elle a eu lieu à la session —, mais
  // les bacs à aller chercher dans le frigo.
  "meals.boxes.title_dish": "Les boîtes à sortir",
  "meals.doses.title": "Les doses par personne",
  "meals.dish.who_eats": "Qui mange ça",
  // ⟳ 2026-09-22 — LA LISTE DU BAS QUAND PLUSIEURS DOSES SONT AU-DESSUS: c'est
  // leur SOMME, donc ce qu'il faut préparer en tout. À une seule dose, la liste
  // ne se rend plus du tout — elle répétait la dose mot pour mot.
  "meals.result.total_quantities": "La quantité totale à préparer",
  // Le pli d'une carte de plat sur `/app/plan` et sur l'aperçu. « Le détail »
  // et pas « la recette »: ce qui s'ouvre, ce sont les boîtes, les doses et les
  // ingrédients ajoutés — la recette du lot, elle, vit dans la session.
  "meals.dish.unfold": "Voir le détail",
  "meals.dish.fold": "Masquer le détail",
  // ⟳ 2026-09-24 — REMPLACER UN PLAT DE L'APERÇU.
  "meals.dish.replace": "Changer",
  "meals.dish.keep": "Garder ce plat",
  "meals.dish.replace_reason": "À changer : « {reason} »",
  // Le compte est en tête: on sort ses bacs avant de commencer, pas au milieu.
  "meals.boxes.count_one": "1 contenant à remplir",
  "meals.boxes.count_many": "{n} contenants à remplir",
  // De quel gramme on parle, une fois pour tout le bloc. Juste au-dessus, les
  // casseroles affichent du CRU pour la fournée entière; sans cette ligne, les
  // deux séries de nombres se lisent comme une contradiction.
  "meals.boxes.ready_not_raw":
    "Grammes d’aliment cuit, par contenant. Les quantités des casseroles, plus haut, sont celles du cru, pour toute la fournée.",
  // ⛔ Ce qui dit que le nombre décrit un BAC et non une personne. Seulement sur
  // un contenant à plusieurs noms: à un seul nom, la boîte EST la portion.
  "meals.boxes.for_n": "· pour {n}",
  "meals.boxes.energy": "· {n} kcal",
  // ⟳ 2026-09-22 — LA DOSE D'UN LIQUIDE, DANS L'UNITÉ DU GESTE. « ≈ » n'est
  // pas décoratif: la cuillère est un arrondi, le gramme à côté est le nombre
  // exact. Les deux se lisent ensemble (voir `lib/householdMeasure.ts`).
  "meals.boxes.teaspoons": "≈ {n} c. à café",
  "meals.boxes.tablespoons": "≈ {n} c. à soupe",
  "meals.boxes.millilitres": "≈ {n} ml",
  // Au-delà de quatre prénoms, le couvercle dit combien ils sont.
  "meals.boxes.rest_of_table": "Le reste de la table ({n})",
  // Le couvercle sans nom: un plan relu sans ses parts n'a aucun prénom à
  // joindre, et l'instruction de pesée reste vraie sans lui.
  "meals.boxes.lid_unnamed": "Un contenant",
  "meals.boxes.grams": "{n} g",
  // ⟳ 2026-09-22 — CE QU'UNE PART DE CASSEROLE CONTIENT, sous sa ligne du
  // Boxing: « dont poulet ~110 g, légumes ~140 g ». Le tilde dit que c'est une
  // information, pas une pesée — un mijoté ne se sépare pas.
  "meals.boxes.parts": "dont",
  "meals.boxes.part": "{term} ~{n} g",
  "meals.boxes.part_vegetables": "légumes",
  // ⟳ 2026-09-23 — LES À-CÔTÉS D'UNE BOÎTE, sur une ligne « À côté » à part:
  // « 1 × pomme », « comté ~30 g ». Sur un bac commun, la ligne dit pour qui:
  // « Christèle : 1 × yaourt nature ». Rien ne dit d'où vient un à-côté.
  "meals.boxes.side_courses": "À côté",
  "meals.boxes.side_unit": "{n} × {term}",
  "meals.boxes.side_grams": "{term} ~{n} g",
  "meals.boxes.side_for": "{name} : {items}",
  // ── LE CONTENANT QUI PART AU CONGÉLATEUR (2026-09-04) ─────────────────────
  // ⛔ « À CONGELER », PAS « CONGELÉ »: c'est une INSTRUCTION au moment où on
  // remplit le bac, pas un état constaté. `DishCard` dit l'autre moitié du
  // geste quatre jours plus tard (« sors-la du congélateur la veille »), et
  // sans celle-ci on demandait de sortir une part que personne n'avait rangée.
  "meals.boxes.freeze": "· à congeler",
  // ⟳ 2026-09-16 — un contenant qui ne tient que la part de marmite : le reste
  // du repas (tortilla, laitue…) se monte le jour même, et c'est le jour qui le dit.
  "meals.boxes.rest_on_the_day": "· le reste se prépare le jour même",
  // ⟳ 2026-09-23 — une part de la boîte cuite dans une AUTRE session : nommée
  // et datée, jamais pesée ici (le mercredi pesait le saumon du vendredi).
  "meals.boxes.with_other_session": "· avec {what}, cuisiné {day}",
  "meals.boxes.with_other_session_undated": "· avec {what}, d’une autre session",
  // Le compte en tête, à côté du nombre de contenants: on veut savoir avant de
  // commencer combien iront au congélateur. Muet à zéro — un plan à deux
  // sessions n'a rien à congeler par construction.
  "meals.boxes.freeze_count": "· dont {n} au congélateur",
  // Les deux nombres restent DEUX nombres. « 10 min aux fourneaux » décide si
  // on s’y met ce soir, « 50 min en tout » décide si on a la fenêtre.
  "meals.sessions.session_time": "environ {n} min",
  // ⟳ 2026-09-09 — le geste de la veille, DÉTERMINISTE: il vient de la liste
  // de courses (`freeze_on_purchase`), pas du déroulé écrit par le modèle.
  "meals.sessions.thaw_night_before": "La veille au soir, sors du congélateur : {items}.",
  "meals.sessions.active": "{n} min aux fourneaux",
  "meals.sessions.total": "{n} min en tout",
  "meals.sessions.recipe_show": "La recette",
  "meals.sessions.recipe_hide": "Masquer la recette",
  "meals.sessions.overview_title": "Déroulé global",
  "meals.picker.title": "Quels repas, quels jours",
  "meals.picker.subtitle":
    "Décoche un repas que tu ne prendras pas à la maison — rien n’est cuisiné " +
    "pour lui, et rien n’est acheté.",
  "meals.picker.meal": "Repas",
  "meals.picker.all_on":
    "Pour modifier le nombre de repas, rends-toi dans Foyer > Préférences alimentaires.",
  "meals.picker.some_off_one": "{n} repas décoché. Il revient la prochaine fois si tu le recoches.",
  "meals.picker.some_off_many": "{n} repas décochés. Ils reviennent la prochaine fois si tu les recoches.",
  "meals.picker.state_at_table": "Ici, à table",
  "meals.picker.state_eating_out": "Dehors",
  "meals.picker.state_away": "Pas là",
  "meals.picker.some_out_one":
    "Dont {n} repas dehors : il sort du plan, pas de la journée.",
  "meals.picker.some_out_many":
    "Dont {n} repas dehors : ils sortent du plan, pas de la journée.",
  // Voir la note de `en.ts` : on NOMME ce que la fenêtre ne montre pas, on ne
  // l'additionne pas au compteur des cases visibles.
  "meals.picker.some_out_hidden_one":
    "1 autre est coché un jour que ce plan ne couvre pas. Il le reste.",
  "meals.picker.some_out_hidden_many":
    "{n} autres sont cochés des jours que ce plan ne couvre pas. Ils le restent.",
  // ⚠️ LA CITATION DOIT SUIVRE LE TITRE DE LA CARTE. Ces guillemets nomment
  // `rhythm.title` (`EatingRhythmCard`): si l’un des deux change de mots,
  // l’élève cherche à l’écran une section qui n’existe pas sous ce nom.
  "meals.picker.no_rhythm":
    "Règle d’abord les moments où tu manges dans « Comment se passe ta journée » — " +
    "cette grille est construite à partir d’eux.",
  // ⟳ 2026-09-08 — « Choisir les repas » NE DISAIT PAS CE QUE LA GRILLE
  // DEMANDE. Elle ne choisit pas des plats: elle décoche les repas que
  // quelqu'un va sauter. Le titre vient du bloc replié qui posait la MÊME
  // question juste en dessous et qui a été retiré le même jour — il était le
  // plus clair des deux, il reste.
  "meals.picker.open": "Qui est là ? Jour par jour",
  "meals.picker.save": "Enregistrer",
  // Trois points de suspension pendant l’enregistrement: identique à l’anglais
  // parce que ce n’est pas un mot. Inscrit dans la liste d’exceptions de
  // `parity.int.test.ts`.
  "meals.picker.saving": "…",
  "meals.picker.cancel": "Annuler",
  // ⟳ 2026-09-23 — LES CASES D'EN-TÊTE: une ligne = un repas sur tous les
  // jours, une colonne = un jour entier.
  "meals.picker.bulk_hint":
    "La case devant un repas ou au-dessus d’un jour retire toute la ligne ou toute la colonne.",
  "meals.picker.row_all": "{meal} — tous les jours",
  "meals.picker.column_all": "{day} — tous les repas",
  "meals.today.title": "Côté cuisine",
  "meals.today.cook_today": "Tu cuisines aujourd’hui",
  "meals.today.cook_tomorrow": "Tu cuisines demain",
  "meals.today.shop_today": "Jour de courses",
  "meals.today.shop_tomorrow": "Courses demain",
  "meals.today.shop_on": "Courses {day}",
  "meals.today.shop_overdue": "Les courses étaient prévues {day}",
  "meals.today.shop_items": "{n} articles sur la liste",
  "meals.today.shop_open": "Ouvrir la liste",
  "meals.today.sessions_open": "Voir la semaine",
  "meals.today.makes": "Tu prépares {titles}",
  // FF-057 — voir le commentaire côté `en.ts` : le libellé énonce un fait, il
  // ne fait pas avouer. « Je n'ai pas fait cette cuisson », jamais « j'ai raté ».
  "meals.today.assembling": "Rien à cuisiner aujourd’hui — aujourd’hui, on assemble.",
  "meals.result.from_prep": "Depuis {title} — cuisiné {day}.",
  "meals.result.batch_makes": "Cuisiné une seule fois — {n} portions",
  "meals.result.batch_covers": "couvre {days}",
  "meals.result.from_batch": "De la fournée cuisinée {day} — réchauffe une portion.",
  // ── LOT 2 · LE GESTE DU JOUR J, DIT PAR SON JETON ──────────────────────
  // Des instructions de cuisine, jamais un jugement, et aucune raison à côté.
  // « Rien à préparer » rend le jeton `none` — une affirmation du moteur; un
  // plat dont le geste n’a pas été déclaré n’affiche RIEN.
  "meals.same_day.none": "Rien à préparer",
  "meals.same_day.reheat_only": "À réchauffer",
  "meals.same_day.assemble": "À assembler",
  "meals.same_day.cook_fresh": "Cuisine minute",
  "meals.same_day.minutes": "{n} min",
  // ── LE CHIFFRE, ET CE QU’IL DIT DE LUI-MÊME ─────────────────────────────
  // Aucune de ces phrases n’est une cible, un budget ni un score: elles
  // décrivent de la NOURRITURE, jamais la personne qui la mange. « kcal » reste
  // en minuscules et collé au nombre — c’est une unité, pas un titre de
  // colonne, et elle s’écrit pareil dans les deux langues.
  "meals.energy.dish": "{n} kcal",
  "meals.energy.day": "{n} kcal sur la journée",
  "meals.energy.day_partial": "{n} kcal — {counted} plats comptés sur {total}",
  "meals.energy.day_unreadable": "Pas assez de détail pour additionner cette journée",
  "meals.energy.day_with_addon": "{n} kcal — dont {addon} ajoutées à ton assiette",
  "meals.energy.dish_unknown_ingredient": "Un ingrédient ne figure pas dans notre table de composition",
  "meals.energy.dish_missing_quantity": "Une quantité n’est pas assez précise pour être additionnée",
  "meals.energy.basis":
    "Calculé à partir des quantités de ton plan et d’une table de composition des aliments — pas deviné sur une photo.",
  "meals.energy.household_abstention":
    "La part de chacun est différente dans un plan de foyer : un seul chiffre par plat serait faux pour tout le monde.",
  "meals.energy.switch_on": "Afficher les calories",
  "meals.energy.switch_off": "Masquer les calories",
  "meals.energy.switch_hint": "Tu peux couper ça quand tu veux, et ça se tait partout.",
  "meals.energy.switch_failed": "Ça n’a pas été enregistré. Rien n’a changé.",
  // ⛔ 2026-09-23 — LA FOURCHETTE QUOTIDIENNE N'EST PLUS AFFICHÉE, sur
  // demande (« ça sert à rien, ça pollue l'UI »). Ses sept phrases sont
  // parties avec `EnergyTargetNote`: target_range, _down, _up, _measured,
  // _no_weight, _implausible_weight, _pace_missing_body.
  "meals.energy.target_switch_on": "Afficher une fourchette quotidienne",
  "meals.energy.target_switch_off": "Masquer la fourchette quotidienne",
  // ⚠️ LE JOUR EST CAPITALISÉ, Y COMPRIS EN MILIEU DE PHRASE, ET C’EST UN
  // ARBITRAGE. La règle française met « lundi » en minuscule dans « cuisiné
  // lundi »; mais `meals.day.*` est AUSSI le titre d’une colonne de grille et
  // le texte d’une pastille, où la majuscule est correcte. Une seconde table de
  // formes minuscules (sept clés de plus, six sites d’appel à changer) coûterait
  // plus cher que le défaut qu’elle corrige, et elle pourrait diverger de la
  // première. Les six phrases qui interpolent `{day}` — `meals.kitchen.cook_on`,
  // `meals.today.shop_on`, `meals.today.shop_overdue`, `meals.result.from_prep`,
  // `meals.result.from_batch` et les deux `covers` — rendent donc « Lundi ».
  //
  // Les sept jours. ⚠️ LES TROIS PREMIÈRES LETTRES SERVENT D’EN-TÊTE DE COLONNE
  // (`PlanGrid`, `MealPickerGrid` font `.slice(0, 3)`): « Lun », « Mar »,
  // « Mer », « Jeu », « Ven », « Sam », « Dim » sont les abréviations
  // françaises d’usage, et elles restent distinctes deux à deux.
  "meals.day.mon": "Lundi",
  "meals.day.tue": "Mardi",
  "meals.day.wed": "Mercredi",
  "meals.day.thu": "Jeudi",
  "meals.day.fri": "Vendredi",
  "meals.day.sat": "Samedi",
  "meals.day.sun": "Dimanche",
  "meals.slot.breakfast": "Petit-déjeuner",
  "meals.slot.snack_am": "Milieu de matinée",
  "meals.slot.lunch": "Déjeuner",
  "meals.slot.snack_pm": "Après-midi",
  "meals.slot.dinner": "Dîner",
  "meals.slot.before_bed": "Avant le coucher",
  "meals.slot.snack": "Collation",
  "meals.slot.any_meal": "N’importe quel repas",
  // La case, à la première personne et au passé: c’est l’élève qui rapporte un
  // fait, pas le produit qui lui demande de valider une consigne. « Fait »
  // aurait fait du dîner une tâche.
  "meals.tick.label": "Pas mangé",
  "meals.tick.failed": "Ça n’a pas été enregistré. Retouche la case.",
  "meals.week.title": "Suivi des repas",
  "meals.week.lead":
    "Coche les repas que tu n’as pas mangés, le reste est automatiquement pris en compte.",
  "meals.week.loading": "Chargement de ta semaine…",
  "meals.week.error": "Ta semaine n’a pas pu être chargée.",
  "meals.week.retry": "Réessayer",
  "meals.week.empty_title": "Pas encore de plan cette semaine",
  "meals.week.empty_body": "Ta semaine se prépare sur ton plan : tes repas apparaîtront ici.",
  "meals.week.empty_cta": "Aller à mon plan",
  "meals.week.days_label": "Jours du plan",
  "meals.week.day_empty": "Rien de prévu pour toi ce jour-là.",
  "meals.week.future_note":
    "Ces repas sont à venir : tu pourras les cocher le jour même.",
  // FF-057 §3.A — le formulaire accident. Une affirmation et trois tuiles,
  // jamais une question: la décoche est déjà écrite quand il s’affiche, il ne
  // fait que proposer de la préciser. Libellés repris mot pour mot du
  // formulaire de la conversation (`_shared/keel/accident.ts`, COPY.fr).
  "meals.untick.lead": "Ça n’a pas eu lieu comme prévu.",
  "meals.untick.ordered": "J’ai commandé ou mangé dehors",
  "meals.untick.no_time": "Pas eu le temps",
  "meals.untick.ate_other": "J’ai mangé autre chose",
  // La sortie n’écrit rien: la décoche reste. « On en reste là » et pas
  // « Annuler » — il n’y a rien à annuler.
  "meals.untick.dismiss": "On en reste là",
  // Les rayons, dans l’ordre d’un magasin français.
  "meals.aisle.produce": "Fruits & légumes",
  "meals.aisle.protein": "Viande & poisson",
  "meals.aisle.dairy": "Crèmerie",
  "meals.aisle.grains": "Féculents & pain",
  "meals.aisle.frozen": "Surgelés",
  "meals.aisle.pantry": "Épicerie",
  "meals.aisle.other": "Divers",

  // ── LA LIGNE D'ATTENTE DU MOTEUR — pas celle de l'écran retiré ─────────
  // Rendue par `MealBuilder` et `StudentWeekPlanPage` (`/app/plan`); les sept
  // autres clés de l'ancien bloc `/app/meals` sont parties le 2026-09-03 (P4).
  "meals.loading": "Chargement…",

  // ══ LE RYTHME DE LA JOURNÉE (lot 4) ══════════════════════════════════════
  // ⚠️ `meals.rhythm.title` EST CITÉ MOT POUR MOT PAR `meals.picker.no_rhythm`.
  // Les deux clés changent ensemble, sinon la grille des repas renvoie l’élève
  // vers une section qui n’existe pas sous ce nom.
  "meals.rhythm.title": "Comment se passe ta journée",
  "meals.rhythm.intro":
    "Coche les moments où tu manges vraiment, un jour ordinaire. Ta semaine se " +
    "construit autour d’eux — aucun repas que tu n’as pas nommé, et aucun des " +
    "tiens laissé de côté.",
  "meals.rhythm.size_hint":
    "La taille est facultative — ne la dis que là où c’est visiblement plus gros " +
    "ou plus léger que le reste de ta journée.",
  "meals.rhythm.size_label": "D’habitude",
  "meals.rhythm.save": "Enregistrer",
  "meals.rhythm.saving": "…",
  "meals.rhythm.saved": "Enregistré. Ton prochain plan se construit là-dessus.",
  // Le repli EST une décision, et il se dit: sans rythme déclaré, la semaine
  // retombe sur trois repas. L’élève doit savoir que c’est une hypothèse, pas
  // son choix.
  "meals.rhythm.none":
    "Rien de coché. Ta semaine retombe sur petit-déjeuner, déjeuner et dîner — " +
    "l’hypothèse ordinaire, pas quelque chose que tu as choisi.",
  "meals.rhythm.needs_goal": "Fixe d’abord ton objectif ci-dessus — ceci s’enregistre avec lui.",
  "meals.rhythm.open": "Modifier",
  "meals.rhythm.close": "Fermer",
  "meals.rhythm.summary_none":
    "Pas réglé — ta semaine retombe sur petit-déjeuner, déjeuner et dîner.",
  "meals.rhythm.unsaved":
    "Modifié mais pas enregistré. Ta semaine tourne encore sur ce qui est affiché au-dessus.",

  // ══ LA LISTE DE COURSES (lot 4) ══════════════════════════════════════════
  "meals.shopping.title": "Liste de courses",
  "meals.shopping.empty": "Rien à acheter — cette semaine tourne avec ce que tu as déjà.",
  "meals.shopping.have": "Je l’ai",
  // Le français met « il reste 1 article » au singulier là où l’anglais ne
  // distingue rien. `plural()` choisit entre les deux.
  "meals.shopping.left_one": "il reste {count} article à acheter",
  "meals.shopping.left_many": "il reste {count} articles à acheter",
  "meals.shopping.all_done": "Tout est coché. Plus rien à acheter.",
  "meals.shopping.ephemeral":
    "Cocher, c’est juste pour le magasin — ce n’est pas enregistré, et rien ici n’est retenu comme le contenu de tes placards.",
  "meals.shopping.pdf": "Enregistrer en PDF",
  "meals.shopping.pdf_building": "Préparation…",
  "meals.shopping.pdf_note":
    "Le PDF emporte la liste entière, y compris ce que tu as coché.",
  "meals.shopping.pdf_failed": "Ça n’a pas marché. Réessaie.",
  "meals.shopping.pdf_ready": "Ta liste est prête.",
  "meals.shopping.pdf_download": "Ouvrir le PDF",
  "meals.shopping.buy_all_on":
    "Tout est à acheter le {date} : rien de ce plan ne se gâte d'ici sa cuisson.",
  "meals.shopping.freeze": "à congeler",
  // ⟳ 2026-09-09 — LE BLOC, EN TÊTE DE LA COURSE. Un badge par ligne au fond
  // d'une carte repliée ne se voyait pas: mesuré sur un plan réel, la personne
  // a lu « dinde achetée mercredi, cuisinée dimanche » et conclu que la garde
  // avait lâché.
  "meals.shopping.freeze_block_one": "À congeler en rentrant — 1 article",
  "meals.shopping.freeze_block_many": "À congeler en rentrant — {n} articles",
  "meals.shopping.wave_now": "À acheter maintenant",
  "meals.shopping.wave_later": "À acheter le {date}",
  "meals.shopping.wave_serves": "pour que ce soit frais pour la cuisine du {day}",
  "meals.shopping.wave_intro":
    "Séparé selon ce qui doit être frais : la viande du milieu de semaine ne tient pas depuis lundi.",

  // ══════════════════════════════════════════════════════════════════════════
  // LOT 6 · `/app/plan` — LE CONSTRUCTEUR DE REPAS
  // ══════════════════════════════════════════════════════════════════════════
  "meals.form.title": "Nouveau plan",
  "meals.form.mode_label": "On part d’où",
  "meals.form.mode_from_pantry": "De ce que j’ai déjà",
  "meals.form.mode_to_shop": "J’irai faire les courses",
  "meals.form.window_label": "Jours",
  "meals.form.window_from": "Du",
  "meals.form.window_to": "Au",
  "meals.form.window_until_sunday": "Jusqu’à dimanche",
  "meals.form.window_seven_days": "Pour 7 jours",
  "meals.form.window_exact": "Choisir exactement",
  "meals.form.window_days_label": "Combien de jours",
  "meals.form.window_span": "du {from} au {to} · {days}",
  "meals.form.window_days_one": "{n} jour",
  "meals.form.window_days_other": "{n} jours",
  "meals.form.window_one_day": "Aujourd’hui seulement.",
  "meals.form.slot_label": "Un repas en particulier (facultatif)",
  "meals.form.slot_any": "La journée entière",
  "meals.form.servings_label": "Pour combien de personnes",
  "meals.form.pantry_label": "Ce que tu as sous la main",
  "meals.form.pantry_hint":
    "Un par ligne. Ajoute une quantité si elle compte — «riz, 500 g».",
  "meals.form.pantry_placeholder": "hauts de cuisse de poulet\nriz\népinards",
  "meals.form.preferences_label": "Ce dont tu as envie cette fois (facultatif)",
  "meals.form.preferences_placeholder":
    "mezzé d’été — beaucoup de carottes, du cru, rien de lourd",
  "meals.form.preferences_hint":
    "Une humeur, pour ces repas-là. Ce que tu aimes toujours ou ne manges jamais va dans «Ce que tu m’as dit sur ton alimentation» — c’est retenu tout seul.",
  // ⛔ `meals.form.preferences_carried` retirée le 2026-09-10 — voir `en.ts`.
  "meals.form.context_label": "Ce qui se passe cette semaine (facultatif)",
  "meals.form.context_placeholder":
    "des invités samedi · le four est en panne · retour de vacances, frigo vide",
  "meals.form.context_carried":
    "Repris de ton dernier plan. Change-le si cette semaine est différente.",
  // ⟳ 2026-09-16 — LE BOUTON DIT CE QUI PART. « Compose » tout court vivait
  // 1 400 px sous les dates; la personne cliquait sans relire combien de jours
  // ni pour qui. `{days}` et `{people}` arrivent déjà accordés.
  "meals.form.submit_for": "Composer {days} pour {people}",
  "meals.form.people_one": "{n} personne",
  "meals.form.people_other": "{n} personnes",
  "meals.form.building": "Composition…",
  "meals.form.cancel": "Annuler",
  "meals.form.pantry_required":
    "Dis ce que tu as sous la main, ou passe à «J’irai faire les courses».",
  "meals.result.title": "Tes repas",
  // ⚠️ ELLE NOMMAIT UN CHAMP QUI N'EXISTE PLUS. « d’où on part » était
  // le menu « On part d’où », retiré le 2026-09-03 avec l’alignement sur
  // l’étape 3. Une phrase vide qui envoie chercher un contrôle absent est
  // pire qu’une phrase vide: elle fait douter de ses yeux.
  "meals.result.empty":
    "Rien de composé pour l’instant. Dis-moi quels jours, ci-dessus, et je t’assemble quelques repas.",
  "meals.result.shopping_title": "Liste de courses",
  "meals.result.shopping_close": "Masquer la liste de courses",
  "meals.rebuild.button": "Composer un autre plan",
  "meals.rebuild.title": "Composer un autre plan",
  "meals.rebuild.prepare_next": "Préparer le plan suivant",
  // ⟳ 2026-09-23 — les quatre libellés courts, sous 363 px de large
  // (`NarrowLabel` dans `MealBuilder.tsx`).
  "meals.rebuild.prepare_next_short": "Plan suivant",
  "meals.rebuild.button_short": "Nouveau plan",
  "meals.sessions.button_short": "Sessions",
  "meals.result.shopping_short": "Courses",
  // ⟳ 2026-09-09 — LE NOM DU SÉLECTEUR, pour qui ne voit pas la rangée. Deux
  // boutons voisins ne forment pas un choix: c'est le groupe NOMMÉ qui le dit.
  "meals.result.plan_switch": "Quel plan",
  "meals.result.tab_current": "Cette semaine",
  "meals.result.tab_next": "Suivant",
  // L'avertissement NOMME les jours qui partent: les courses de ces jours-là
  // ont peut-être déjà été faites, et cette dépense-là ne se rembourse pas.
  "meals.rebuild.truncates":
    "Ça retire {days} jour(s) à ton plan en cours ({from} → {to}). Tu as peut-être déjà fait les courses pour ces jours-là.",
  "meals.rebuild.warning":
    "Ça remplace la semaine ci-dessous. Ce qui s’y trouve cesse d’être ce que tu ouvriras demain.",
  "meals.rebuild.building":
    "Composition de ta nouvelle semaine — ça prend quelques secondes. Celle que tu avais reste en place jusqu’à ce que celle-ci arrive.",
  // ⟳ 2026-09-21 — LA CONFIRMATION AVANT DE REMPLACER. « Composer un autre
  // plan » sur un plan en cours ouvre d'abord cette fenêtre, puis un aperçu ;
  // rien n'est écrit tant que l'aperçu n'est pas adopté.
  "meals.rebuild.confirm_title": "Remplacer ton plan en cours ?",
  "meals.rebuild.confirm_body":
    "Ton plan du {from} au {to} sera remplacé par celui que tu vas composer. Tu verras d’abord un aperçu, et rien ne change tant que tu ne l’adoptes pas.",
  "meals.rebuild.confirm_go": "Voir l’aperçu",
  "meals.rebuild.confirm_cancel": "Garder mon plan",
  "meals.rebuild.confirm_close": "Fermer",
  "meals.eta": "En moyenne 2 à 3 minutes pour composer un plan.",

  //
  // ── A1 · LA VEILLE AUTOMATIQUE (P1) ──────────────────────────────────────
  // Le serveur tranche le timing (`leadDayFor`, coupure à 18 h) et le rend dans
  // `timing`. L'écran RÉPÈTE, il ne recalcule rien: le navigateur ne connaît
  // pas l'heure. Deux phrases, une par `kind` — et AUCUNE variante par `reason`:
  // l'explication complète vit dans `plan_rationale`, côté serveur, et un
  // second jeu de gabarits ici divergerait au premier ajustement.
  "meals.timing.day_before":
    "Courses et cuisson {day}, la veille : rien ne se mange ce jour-là.",
  "meals.timing.same_morning":
    "Courses et cuisson dès le matin, pour être prêt à midi.",
} satisfies TranslatedMessagesOf<"meals">;
