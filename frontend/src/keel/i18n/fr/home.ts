// Pack français — le namespace `home`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `home.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frHome = {
  // ══════════════════════════════════════════════════════════════════════════
  // `/` — LA SEULE LANDING DU FOYER (refonte du 2026-09-08).
  // ══════════════════════════════════════════════════════════════════════════
  //
  // REGISTRE: TUTOIEMENT. Le brief `scratchpad/2026-09-08-0030-POSITIONNEMENT-
  // landing.md` fait autorité sur la copie; ses phrases sont reprises ici, et
  // les corrections produit qu'il liste sont des FAITS, pas des tournures:
  //   · l'ordre vécu est COURSES → CUISINE → REPAS, jamais l'inverse;
  //   · un repas imprévu se DÉCRIT ou se PHOTOGRAPHIE pour être COMPTABILISÉ;
  //     il ne réorganise ni les courses, ni les sessions, ni les repas prévus;
  //   · le poids actualisé nourrit la GÉNÉRATION suivante — autre mécanisme;
  //   · l'accès à 1,99 € est l'accès PERSONNEL d'un autre membre qui veut
  //     suivre son objectif lui-même — pas le prix d'une bouche à table;
  //   · aucune réinvention des restes, aucun chiffre de résultat, aucun
  //     témoignage, aucune promesse chiffrée de perte de poids.
  //
  // ⚠️ LES TROIS PAGES `/meal-prep`, `/couples` et `/families` ONT ÉTÉ RETIRÉES
  // ce jour-là, avec leurs namespaces. Il n'y a plus qu'UNE page de vente.
  //
  // COMPOSITION: apostrophe ’ (U+2019), espace insécable U+00A0 avant : ; ! ? »
  // € % et après «. Jamais U+202F, jamais →.
  //
  // ── SEO ──────────────────────────────────────────────────────────────────
  // ⚠️ `index.html` recopie ces deux phrases MOT POUR MOT (`seoHead.int.test.ts`).
  "home.seo_title": "Ton objectif, à table",
  // ⚠️ LA DESCRIPTION NOMME LES DEUX OBJECTIFS, ET C'EST UN CHOIX DU
  // PROPRIÉTAIRE (2026-09-10) CONTRE UNE PHRASE PLUS JOLIE. La version d'avant
  // — « Des repas pour ton objectif, les quantités déjà calculées… » — reprenait
  // le H1 mot pour mot et ne prononçait JAMAIS « perdre du poids » ni « prendre
  // du muscle ». Ce sont les mots que quelqu'un tape dans Google; ce sont aussi
  // les deux seuls objectifs que la section 01 de cette page vend, en toutes
  // lettres (`home.goal.fat_loss` / `home.goal.muscle_gain`). Un extrait de
  // résultat qui ne contient aucun terme de la recherche ne se fait pas
  // remarquer, quelle que soit sa tournure.
  //
  // ⚠️ CHAQUE MORCEAU EST SUR LA PAGE, ET C'EST LA SEULE RÈGLE QUI COMPTE ICI:
  // les deux objectifs (section 01), les quantités calculées (H1 + section 02),
  // les courses et la cuisine (section 03), les 7 jours (`home.hero.trial`).
  // Une description qui promet ce que la page ne montre pas fait remonter le
  // taux de retour, que Google mesure.
  "home.seo_description":
    "Perdre du poids ou prendre du muscle : Sophia compose tes repas, calcule les quantités et organise tes courses et ta cuisine. 7 jours d’essai.",


  // Landing refreshed 2026-09-18: direct copy, visible example, optional details.
  "home.hero.eyebrow": "Sophia · Coach nutritionnelle IA",
  "home.hero.title_1": "Tes menus pour perdre du poids",
  "home.hero.title_2": "ou prendre du muscle.",
  "home.hero.lede": "Sophia calcule tes portions, prépare ta liste de courses et organise la cuisine selon tes disponibilités.",
  "home.hero.cta": "Essayer pendant 7 jours",
  "home.hero.trial": "Puis {amount}/mois · Sans engagement",
  "home.hero.visual_alt": "Bowl de poulet rôti, boulgour, avocat et légumes colorés",
  "home.hero.label_pleasure": "Le plaisir fait partie du plan",
  "home.hero.label_menu_kicker": "Au menu",
  "home.hero.label_menu": "Ton objectif, en recettes.",
  "home.hero.label_cooked": "Des plats équilibrés",
  "home.pain.kicker": "Ce qui bloque, d’habitude",
  "home.pain.title_1": "Tu sais où tu veux aller.",
  "home.pain.title_2": "C’est le chemin qui manque.",
  "home.pain.q1": "« Je ne sais pas quoi manger. »",
  "home.pain.a1": "Un menu composé pour ton objectif, avec tes goûts et tes contraintes. Pas une liste de règles : des plats.",
  "home.pain.q2": "« Je ne sais pas combien. »",
  "home.pain.a2": "Les quantités sont écrites dans le plan, avant les courses. Rien à estimer, rien à deviner après coup.",
  "home.pain.q3": "« Je n’ai pas le temps. »",
  "home.pain.a3": "Les courses et les sessions de cuisine sont organisées selon tes jours. Tu n’as plus qu’à cuisiner.",
  "home.goal.aria": "Choisir un objectif pour découvrir Sophia",
  "home.goal.fat_loss": "Perdre du poids",
  "home.goal.muscle_gain": "Prendre du muscle",
  "home.goal.note.fat_loss":
    "Des repas organisés autour de ton objectif, en tenant compte de ton activité et de tes préférences.",
  "home.goal.note.muscle_gain":
    "Des quantités et des apports en protéines pris en compte dans les recettes de ton planning.",
  "home.goal.direction_label": "Dans l’assiette, ça donne",
  "home.dir.fat_loss":
    "légumes généreux, part de protéine entière, part de féculent plus petite",
  "home.dir.muscle_gain":
    "part de protéine et de féculent plus grande, mêmes légumes",
  "home.dir.maintenance": "part équilibrée de chaque composant",
  "home.hero.example": "Voir un exemple",
  "home.plan.summary.when": "Dimanche soir et lundi midi",
  "home.plan.summary.portions": "Dans chaque portion",
  "home.plan.summary.units": "Quantités cuites, prêtes à servir.",
  "home.plan.summary.prep": "À préparer le dimanche",
  "home.plan.summary.prep_body": "Tu cuis le poulet, les légumes et le boulgour en une session. Tu gardes une portion pour le déjeuner du lendemain.",
  "home.plan.summary.time": "Environ {minutes} min au total, cuisson comprise.",
  "home.plan.summary.next": "Lundi midi : à réchauffer en {minutes} min.",
  "home.plan.summary.energy": "Calories calculées à partir des quantités de cet exemple.",
  "home.reach.example": "« Pense à sortir le poulet du congélateur ce soir pour ta cuisine de demain. »",
  "home.reach.example_note": "Exemple fictif",
  "home.preview.label": "Exemple de repas",
  "home.preview.note": "Une portion · Quantités après cuisson",
  "home.flow.sunday": "Dimanche",
  "home.flow.more": "+ {count} ingrédients dans la liste complète",
  "home.flow.cooking_time": "{minutes} min, cuisson comprise",
  "home.flow.dinner": "Dimanche soir",
  "home.flow.serve": "Une portion à servir.",
  "home.flow.lunch": "Lundi midi",
  "home.flow.reheat": "L’autre portion, à réchauffer en {minutes} min.",
  // ⟳ 2026-09-18 — LA SECTION NE MONTRE PLUS UNE QUESTION POSÉE À SOPHIA,
  // MAIS LES MESSAGES QU'ELLE ENVOIE D'ELLE-MÊME. Les trois bulles portent les
  // trois canaux qui partent vraiment (`keel-proactive-v1`): `thaw_reminder`,
  // `weigh_in`, `slot_meal`. Une quatrième bulle inventée serait une promesse
  // sans expéditeur.
  "home.reach.bubble.thaw": "Ce soir, sors le poulet du congélateur : tu cuisines demain.",
  "home.reach.bubble.weigh": "Tu peux te peser ce matin ? Ton prochain plan part de ce que tu pèses aujourd’hui.",
  "home.reach.bubble.slot": "Qu’est-ce que tu as mangé ce midi ?",
  // ⚠️ LE KCAL DE L'EXEMPLE — base `plan_quantities`, comme `meals.energy.dish`
  // dont cette clé reprend la forme MOT POUR MOT: le chiffre vient des grammes
  // que la fixture écrit, jamais d'une photo. Le chiffre est nu ICI et sa base
  // est rendue À CÔTÉ (`home.plan.summary.energy`), exactement comme le produit
  // le fait sous une carte de plat. La clé est inscrite dans
  // `ENERGY_KEYS_WITH_A_BASIS` (`energyBasis.int.test.ts`): tout kcal neuf y passe.
  "home.flow.energy": "{kcal} kcal",
  "home.offer.price": "Puis {amount}/mois pour le foyer",
  "home.offer.extra": "En option : + {amount}/mois pour un autre membre qui souhaite son propre suivi. Ses besoins sont pris en compte dans les menus sans supplément.",
  "home.faq.cancel_q": "Puis-je résilier quand je veux ?",
  "home.faq.cancel_a": "Oui. La résiliation prend effet à la fin de la période d’abonnement en cours.",
  "home.plan.boxes_label": "Les portions à conserver",
  "home.plan.kicker": "Un exemple concret",
  "home.plan.title_1": "Ton planning, des courses aux repas.",
  "home.plan.title_2": "Et combien.",
  "home.plan.body": "Un plat cuisiné le dimanche, une portion pour le soir et une autre pour le lendemain. Sophia précise les quantités à servir et ce qu’il faut acheter.",
  "home.plan.photo_alt": "Saumon rôti avec pommes de terre et légumes verts",
  "home.plan.photo_kicker": "De vrais repas.",
  "home.plan.photo_line": "Le plaisir fait partie du plan.",
  "home.plan.photo_strong": "Et ça se voit.",
  "home.plan.badge": "Exemple de planning",
  "home.plan.open": "Voir les recettes et la liste complète",
  "home.plan.close": "Masquer les détails",
  "home.plan.window": "Exemple pour une personne, sur deux jours.",
  "home.plan.household": "Exemple réduit au minimum",
  "home.plan.chain_hint": "Survole un article, une préparation ou un plat : ce qui va avec s’allume.",
  "home.plan.example_note":
    "Exemple illustratif. Ton planning dépend de tes besoins et de tes préférences.",
  "home.plan.toggle_hint": "Change d’objectif pour voir les portions de cet exemple.",
  // ⚠️ LE LIBELLÉ DE L'ENCART, ET IL NE PROMET RIEN: ce qui suit est une
  // MESURE (85 analyses, vérité terrain USDA — docs/keel/PHOTO_QUANTIFICATION.md),
  // pas un argument de vente. « Bon à savoir » annonce un fait vérifiable;
  // « La précision Sophia » annoncerait une qualité, et ce serait faux.
  "home.plan.precision_label": "Bon à savoir",
  // ⚠️ DEUX PRÉCISIONS, PAS DEUX ERREURS — troisième écriture, 2026-09-18. Elle
  // a donné deux taux d'erreur nus (« 2,3 % d'écart », « 26,6 % de biais »): un
  // lecteur ne sait ni de quoi ils parlent, ni lequel est le bon. La mesure est
  // la même, retournée: `docs/keel/PHOTO_QUANTIFICATION.md` donne une MAPE de
  // 26,6 % sur photo (⇒ 73 % de précision) et de 2,3 % sur quantités connues
  // (⇒ 98 %). Les deux arrondis vont dans le sens DÉFAVORABLE au produit: 73,4
  // se dit 73, et 97,7 se dit 98 — jamais « 70 % » pour la photo, qui
  // creuserait l'écart d'un chiffre que personne n'a mesuré.
  //
  // ⛔ AUCUN CHIFFRE COLLÉ AU MOT « CALORIES » ICI: un nombre suivi de ce mot
  // fait entrer la clé dans `ENERGY_KEYS_WITH_A_BASIS` (`energyBasis.int.test.ts`),
  // où elle devrait déclarer une base de lecture qu'elle n'a pas — elle parle
  // d'une méthode, elle ne rapporte le kcal d'aucun repas.
  "home.plan.precision":
    "Suivre ses calories à partir d’une photo, c’est environ 73 % de précision. Les calculer à l’avance, à partir des quantités du plan, c’est 98 %.",
  "home.plan.precision_source": "Mesuré sur 85 repas réels, recomptés contre la table de composition de l’USDA. Une mesure, pas une promesse.",
  "home.demo.you": "Toi",
  "home.demo.member.alex_note": "Prise de muscle",
  "home.demo.member.lou_note": "Végétarienne",
  "home.demo.member.you_note": "Perte de poids",
  "home.demo.dish.chicken_bowl": "Poulet rôti au paprika, boulgour et légumes",
  "home.demo.dish.omelette": "Omelette aux poivrons et salade verte",
  "home.demo.prep.chicken": "Poulet rôti au paprika et légumes",
  "home.demo.prep.bulgur": "Boulgour au citron",
  "home.demo.prep.chicken_method": "Enfourne les hauts de cuisse et les légumes à 200 °C, paprika et huile d’olive, 45 minutes.",
  "home.demo.prep.bulgur_method": "Cuis le boulgour, puis ajoute le zeste et le jus du citron.",
  "home.demo.run.sun": "Lance le four. Le poulet et les légumes enfournés, cuis le boulgour à part. Laisse refroidir, puis mets en boîte : le poulet et les légumes d’un côté, le boulgour à côté.",
  "home.demo.ing.chicken_thighs": "Hauts de cuisse de poulet",
  "home.demo.ing.peppers": "Poivrons",
  "home.demo.ing.carrots": "Carottes",
  "home.demo.ing.lemons": "Citrons",
  "home.demo.ing.green_salad": "Salade verte",
  "home.demo.ing.bulgur": "Boulgour",
  "home.demo.ing.eggs": "Œufs",
  "home.demo.ing.smoked_paprika": "Paprika fumé",
  "home.demo.box.chicken": "poulet rôti",
  "home.demo.box.bulgur": "boulgour",
  "home.demo.box.vegetables": "légumes rôtis",
  // ⟳ 2026-09-23 — LA BOÎTE À DEUX LIGNES (chantier « féculent à côté », lot C):
  // la casserole principale, puis le féculent cuit et dosé à part.
  "home.demo.box.main": "Poulet et légumes",
  "home.demo.box.side": "Boulgour, à côté",
  "home.how.kicker": "Comment ça marche",
  "home.how.title_1": "Tes courses et ta cuisine, organisées.",
  "home.how.title_2": "Tu n’as plus qu’à cuisiner.",
  "home.how.lede": "Tu renseignes tes goûts, les personnes à table et tes jours de cuisine. Sophia prépare le planning ; tu fais les courses et tu cuisines.",
  "home.how.shop.title": "Tes courses",
  "home.how.shop.body":
    "Une liste regroupe les ingrédients à acheter pour les repas prévus.",
  "home.how.cook.title": "Ta session de cuisine",
  "home.how.cook.body":
    "Les recettes et les préparations sont réparties sur tes jours de cuisine.",
  "home.how.eat.title": "Tes repas",
  "home.how.eat.body":
    "Pour chaque repas, tu retrouves le plat et les quantités à servir à chacun.",
  // ⟳ 2026-09-23 — LA QUATRIÈME ÉTAPE, ENTRE LA CUISINE ET LES REPAS. La page
  // ne disait nulle part ce qu'est une boîte ni pourquoi on pèse à ce moment-là.
  "home.how.box.title": "Tes boîtes",
  // ⟳ 2026-09-23 — LA SESSION, MINUTE PAR MINUTE. Les repères tiennent dans les
  // temps de la démonstration: 50 min en tout, poulet 45 min au four, boulgour
  // 20 min dont 5 aux fourneaux (`DEMO_PREPS`, `DEMO_SESSIONS`).
  // Espace INSÉCABLE entre le nombre et l'unité: la typo française, et « 50 »
  // ne se sépare jamais de « min » en fin de ligne.
  "home.flow.step_at": "{minutes} min",
  "home.flow.cook.step_1": "Préchauffe le four à 200 °C. Coupe les carottes en rondelles et les poivrons en lamelles.",
  "home.flow.cook.step_2": "Mélange le poulet et les légumes avec le paprika fumé et un filet d’huile d’olive, puis enfourne pour 45 minutes.",
  "home.flow.cook.step_3": "Cuis le boulgour à part, 15 minutes à l’eau bouillante salée, puis ajoute le zeste et le jus du citron.",
  "home.flow.cook.step_4": "Sors le plat et laisse tiédir avant la mise en boîte.",
  "home.flow.boxing": "Dimanche, après la cuisson",
  "home.flow.box_count": "Deux boîtes, une par repas",
  "home.flow.box_side": "Le poulet et les légumes sortent du même plat, toujours dans les mêmes proportions. Le boulgour cuit à part et se dose à part.",
  "home.flow.box_weigh": "Tu pèses une fois, à la mise en boîte. Le jour venu, tu ouvres et tu réchauffes.",
  "home.house.kicker": "Si tu cuisines pour d’autres",
  "home.house.title_1": "Tu cuisines pour d’autres personnes ?",
  "home.house.title_2": "Leur appétit.",
  "home.house.title_3": "La même table.",
  "home.house.body_1":
    "Sophia tient compte des goûts et des besoins de chacun. Les courses et les préparations sont regroupées quand c’est possible.",
  "home.house.body_2":
    "Sophia regroupe les courses et les préparations quand c’est possible, et prévoit des plats différents si nécessaire.",
  "home.house.cta": "Voir ce qui est inclus",
  "home.house.table_kicker": "À la maison",
  "home.house.table_each": "Chacun sa place",
  "home.house.shared_list": "Une liste de courses et des sessions de cuisine communes",
  "home.house.note": "Exemple de foyer. Les repas s’adaptent aux profils renseignés.",
  "home.life.kicker": "Et quand la vie s’invite ?",
  "home.life.title_1": "Un repas imprévu ?",
  "home.life.title_2": "Il compte aussi.",
  "home.life.body":
    "Un resto, un plat différent de ce qui était prévu : décris ce que tu as mangé ou prends-le en photo. Sophia l’estime et le comptabilise dans ton suivi.",
  "home.life.demo.aria": "Démonstration : déclarer un repas imprévu",
  "home.life.demo.label": "Ce que tu envoies",
  "home.life.demo.describe": "Une description",
  "home.life.demo.photo": "Une photo",
  "home.life.demo.example": "Pizza quatre fromages au resto, deux parts et une salade.",
  "home.life.demo.photo_example": "Une photo de l’assiette, prise à table.",
  "home.life.demo.send": "Envoyer",
  // ⟳ 2026-09-23 — LES ÉTIQUETTES DE LA SCÈNE 3D (une photo prise à table).
  // ⛔ AUCUN CHIFFRE D'ÉNERGIE: la scène montre ce qui est RECONNU, jamais une
  // estimation inventée pour l'occasion.
  "home.life.scene.pizza": "Pizza quatre fromages · 2 parts",
  "home.life.scene.salad": "Une salade",
  "home.life.scene.counted": "Comptabilisé dans ton suivi",
  "home.reach.kicker": "Le suivi au quotidien",
  "home.reach.title_1": "Sophia te fait signe.",
  "home.reach.title_2": "Au bon moment.",
  "home.reach.body":
    "Tu n’as rien à penser. Elle t’écrit la veille d’une cuisson, le matin d’une pesée, ou après un repas que le plan ne couvrait pas.",
  "home.reach.thaw.title": "La veille d’une session",
  "home.reach.thaw.body":
    "« Ce soir, sors le poulet du congélateur. » Le rappel arrive entre 18 h et 20 h, la veille, quand un article doit décongeler.",
  "home.reach.weigh.title": "Ta pesée",
  "home.reach.weigh.body":
    "Tous les deux jours si tu perds du poids, tous les cinq en prise de masse. Le plan suivant est calculé sur ce que tu pèses aujourd’hui.",
  "home.reach.slot.title": "Le repas que le plan ne couvre pas",
  "home.reach.slot.body":
    "Tu déjeunes dehors ? Elle te demande ce que tu as pris, pour que ta journée soit complète.",
  "home.reach.silence": "Et si tu disparais quelques jours : un mot, un seul.",
  "home.reach.hand":
    "Tu peux désactiver les messages qu’elle envoie d’elle-même et continuer à lui poser tes questions.",
  "home.offer.kicker": "L’abonnement",
  "home.offer.title_1": "7 jours pour essayer Sophia",
  "home.offer.title_2": "par un repas.",
  "home.offer.body":
    "Menus, liste de courses, planning de cuisine et suivi personnel inclus.",
  "home.offer.check_trial": "7 jours pour découvrir Sophia",
  "home.offer.check_commit": "Sans engagement",
  "home.offer.coaching.title": "Un autre membre veut son propre suivi ?",
  "home.offer.coaching.price": "{amount} par mois et par personne",
  "home.offer.coaching.body": "L’accès supplémentaire lui permet de parler à Sophia, de suivre son poids et ses calories, et de renseigner ses repas hors planning.",
  "home.offer.coaching.item_1": "Ses repas hors plan comptés : il les décrit ou les prend en photo.",
  "home.offer.coaching.item_2": "Son suivi des calories et de son poids.",
  "home.offer.coaching.item_3": "Sa conversation avec la coach Sophia.",
  "home.offer.coaching.free": "Pas besoin de cet accès pour manger avec toi : ses besoins sont déjà pris en compte dans les menus du foyer.",
  "home.offer.card.name": "Pour toi et ta maison",
  "home.offer.card.badge": "7 jours d’essai",
  "home.offer.card.per_month": "/ mois",
  "home.offer.card.for": "Ton suivi personnel et les repas du foyer inclus.",
  "home.offer.card.inc_1": "Des menus selon ton objectif et tes préférences",
  "home.offer.card.inc_2": "Les quantités et les apports calculés",
  "home.offer.card.inc_3": "L’organisation des courses et des sessions de cuisine",
  "home.offer.card.inc_4": "Les besoins de la maison pris en compte",
  "home.offer.card.cta": "Essayer Sophia 7 jours",
  "home.offer.card.note": "Puis {amount}/mois pour le foyer. Les accès personnels supplémentaires sont en option.",
  "home.faq.kicker": "Avant de commencer",
  "home.faq.title_1": "Tes questions",
  "home.faq.title_2": "une réponse.",
  "home.faq.q1": "Est-ce que je dois compter mes calories ?",
  "home.faq.a1":
    "Les quantités et les apports des recettes prévues sont déjà calculés. Tu n’as pas à ressaisir chaque ingrédient dans un compteur. Si tu manges autre chose, tu peux décrire ton plat ou le prendre en photo pour le comptabiliser.",
  "home.faq.q2": "Et si je mange autre chose ?",
  "home.faq.a2":
    "Ce repas peut être ajouté à ton suivi. Cela ne modifie pas les repas déjà prévus.",
  "home.faq.q3": "Et si je cuisine pour d’autres personnes ?",
  "home.faq.a3":
    "Sophia prend en compte les besoins, les préférences et les habitudes des membres de la maison. Les courses et les préparations sont regroupées quand c’est possible. Selon les contraintes, les plats peuvent aussi être différents.",
  "home.faq.q4": "Un autre membre du foyer peut-il avoir son propre suivi ?",
  "home.faq.a4":
    "Oui, avec un accès personnel à {extra} par mois. Il peut alors parler à Sophia, suivre son poids et ses calories, et compter ses repas hors plan. Sans cet accès, ses besoins sont déjà pris en compte dans les menus du foyer, sans supplément.",
  "home.faq.q5": "Le plan change-t-il quand je mets mon poids à jour ?",
  "home.faq.a5":
    "Ton poids actualisé fait partie des informations utilisées pour générer les plans suivants. Ce n’est pas une réorganisation automatique du planning déjà organisé, et ce n’est pas non plus ce qui se passe après un repas imprévu.",
  "home.faq.q6": "Faut-il savoir cuisiner ?",
  "home.faq.a6":
    "Tu renseignes ton niveau, ton équipement et le temps dont tu disposes. Sophia en tient compte. Tu fais les courses et tu cuisines toi-même.",
  "home.faq.q7": "Comment fonctionne l’essai ?",
  "home.faq.a7":
    "Tu disposes de 7 jours pour essayer Sophia, puis tu peux t’abonner pour continuer. Si tu t’abonnes pendant l’essai, aucun prélèvement n’a lieu avant sa fin.",
  "home.close.title": "Prêt à préparer ta première semaine ?",
  "home.close.body": "7 jours d’essai, puis {amount} par mois pour le foyer. Sans engagement.",
  "home.close.cta": "Essayer Sophia 7 jours",
  "home.close.back_to_top": "Retour en haut",
} satisfies TranslatedMessagesOf<"home">;
