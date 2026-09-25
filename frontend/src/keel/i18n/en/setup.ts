// Seed anglais — le namespace `setup`, et lui seul.
// Assemblé dans `../en.ts`; une clé `setup.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enSetup = {
  // ═════════════════════════════════════════════════════════════════════════
  // FF-060 — LE PARCOURS D'ENTRÉE (`/app/setup`)
  //
  // Trois étapes, et la dernière action EST la génération. Pas de « merci »,
  // pas de « ton plan arrive »: le bouton compose, et l'écran suivant est le
  // plan. Toute copie qui fait ATTENDRE quelqu'un est fausse dans ce produit —
  // le coach ne prépare rien pour personne (docs/keel/MODEL.md).
  // ═════════════════════════════════════════════════════════════════════════
  "setup.title": "Let’s get organised",
  "setup.subtitle": "Three steps, then your first plan.",
  "setup.progress": "Step {n} of {total}",
  "setup.loading": "Loading where you got to…",
  "setup.error.title": "We could not read where you got to.",
  "setup.back": "Back",
  "setup.next": "Continue",
  // PERSONNE N'EST RETENU DANS UN COULOIR. La sortie est visible à chaque
  // étape, et ce qui a déjà été enregistré l'est vraiment.
  "setup.skip": "Skip for now",
  "setup.skip_hint": "Nothing you have answered is lost. You can come back from your plan.",
  "setup.saved": "Saved.",

  // ── ÉTAPE 1 — SITUER ────────────────────────────────────────────────────
  // Ce n'est PAS une case « persona »: les trois réponses SONT les trois
  // cibles du produit, et le nombre est ce qui dimensionne le plan.
  "setup.situate.title": "How many people do you cook for?",
  "setup.situate.solo": "Just me",
  "setup.situate.solo_hint": "One plan, your servings, batch-cooked if that is your thing.",
  "setup.situate.pair": "Two of us",
  "setup.situate.pair_hint":
    "One pot, two servings — even when you are not both after the same thing.",
  "setup.situate.family": "Three or more",
  "setup.situate.family_hint": "The house cooks once, and everyone gets their share.",
  // UN SECONDAIRE NE RÉPOND PAS À CETTE QUESTION. Quelqu'un d'autre tient la
  // table; ce qui suit ne règle que lui, et son plan est le sien.
  "setup.situate.member":
    "Someone else runs this household and composes for it. What follows is about you only — your servings, your direction, and a plan of your own if you want one.",
  // ── LE RETOUR AU SOLO, ET POURQUOI IL A SES SIX PHRASES ─────────────────
  // « Juste moi » était grisé dès qu'un foyer existait, SANS UN MOT: répondre
  // « on est deux » était sans retour dans tout le produit, et l'étape 2
  // retenait ensuite sur `missing_mouths`. Le verrou garde sa raison — on
  // n'efface pas des bouches sur un clic d'entonnoir — et il la DIT; quand il
  // n'y a plus personne à effacer, il s'ouvre derrière une confirmation qui
  // nomme ce qui part et ce qui reste.
  "setup.situate.solo_locked":
    "“Just me” is off while other people are still at this table. Remove them below, one at a time, and it comes back.",
  "setup.situate.dissolve_confirm":
    "This undoes the household. Your own place at the table goes with it: your household servings, your kitchen habits, the foods you keep off the table and the allergies recorded here. Your profile, your direction and your target stay exactly as they are — you carry on alone.",
  "setup.situate.dissolve_do": "Undo the household",
  "setup.situate.dissolve_cancel": "Keep it",
  "setup.situate.dissolve_not_alone":
    "Someone else is still at this table. Remove them first — nothing is undone here while a place is taken.",
  "setup.situate.dissolve_has_plans":
    "This household has already cooked. Its plans stay, so it cannot be undone from here.",

  // ── ÉTAPE 2 — LES GENS ──────────────────────────────────────────────────
  "setup.people.title": "You",
  "setup.people.intro":
    "You eat here too. You are the first place at the table, not the person who runs it.",
  "setup.people.first_name": "First name",
  "setup.people.birth_date": "Date of birth",
  // L'ÂGE EST GOUVERNANT, ET LA PHRASE LE DIT. Un champ dont l'absence change
  // le repas sans le dire est un piège — c'est le défaut D1 de ce chantier.
  "setup.people.birth_date_hint":
    "A direction only applies at a known age. Without it you get a standard serving, and nothing says so.",
  "setup.people.birth_date_error": "That date is in the future, or we cannot read it.",
  "setup.people.height": "Height (cm)",
  "setup.people.gender": "Sex",
  "setup.people.weight": "Weight (kg)",
  // POURQUOI ON LE DEMANDE MAINTENANT, ET PAS « PLUS TARD ». Deux raisons, et
  // la seconde est de la sécurité: sans un premier point, rien ne peut dire
  // plus tard si la perte va trop vite (`restriction_guard`).
  // ── L'ACTIVITÉ — QUATRE CRANS, ET JAMAIS UN NOMBRE (L0, 2026-08-18) ─────
  // ⚠️ AUCUNE DE CES PHRASES NE DEMANDE UN CHIFFRE, et c'est structurel, pas
  // une question de ton: `tokens.ts` refuse le PAL et les heures de sport par
  // semaine parce qu'« un nombre demandé à l'utilisateur est un nombre qu'il
  // invente, et l'inventé entre ensuite dans un calcul avec l'autorité d'une
  // mesure ». Un cran se RECONNAÎT — on sait si on est assis toute la journée —
  // et il porte sa propre imprécision.
  //
  // ⚠️ IL N'Y A PAS DE CINQUIÈME TUILE « JE NE SAIS PAS », et il ne faut pas en
  // ajouter une: ne rien cocher EST la non-réponse, et elle rend exactement le
  // comportement d'avant ce lot. Un jeton d'ignorance ferait de l'ignorance une
  // réponse, et une réponse se met à peser dans un calcul d'énergie.
  //
  // Les quatre libellés courts sont NEUTRES EN PERSONNE, exprès: les mêmes
  // servent à ma fiche et à celle d'une autre bouche. Seuls la question et son
  // aide changent de personne — c'est le défaut mesuré le 2026-08-12 sur
  // `setup.mouths.first_name_hint`, où le formulaire d'une AUTRE bouche
  // promettait de nommer la portion de qui remplit le champ.
  // ── ② LES DEUX AXES REMPLACENT LES QUATRE CRANS DANS L'ENTONNOIR ──────
  // Les quatre crans mélangeaient une JOURNÉE et un SPORT: quelqu'un d'assis
  // qui court deux fois par semaine ne pouvait dire que l'un des deux, et
  // héritait de PAL 1,80 au lieu de ~1,60 — 239 kcal/jour fabriqués par la
  // forme de la question. Les clés `setup.activity.*` restent en dessous: la
  // colonne d'avant reste le repli nommé de qui a déjà répondu.
  // ── ③ LES JOURS QUE LE FOYER NE DÉPLACE PAS (2026-08-20) ──────────────
  // ⚠️ LES MOTS DISENT « CE QU'ON FAIT », PAS « CE QU'ON AIME ». Les gens
  // répondent à « qu'est-ce que tu aimes » en idéal (« j'aime le poisson »),
  // pas en réalité (une fois par mois). La question porte donc sur l'habitude
  // installée, et le libellé d'exemple est un plat, jamais un goût.
  "setup.traditions.title": "Tradition meals",
  "setup.traditions.hint":
    "Sunday roast, fish on Friday. Tell us and the plan builds around it instead of over it. Two or three is plenty -- three at most.",
  "setup.traditions.weekday": "Day",
  "setup.traditions.slot": "Meal",
  "setup.traditions.slot_breakfast": "Breakfast",
  "setup.traditions.slot_lunch": "Lunch",
  "setup.traditions.slot_dinner": "Dinner",
  "setup.traditions.label": "What is it, in your words",
  "setup.traditions.label_placeholder": "roast, fish, pizza...",
  "setup.traditions.add": "Add",
  "setup.traditions.remove": "Remove",
  "setup.traditions.empty": "Nothing set -- the plan composes every meal.",
  "setup.traditions.full":
    "Three is the most we take. Remove one to add another.",
  "setup.traditions.day_mon": "Monday",
  "setup.traditions.day_tue": "Tuesday",
  "setup.traditions.day_wed": "Wednesday",
  "setup.traditions.day_thu": "Thursday",
  "setup.traditions.day_fri": "Friday",
  "setup.traditions.day_sat": "Saturday",
  "setup.traditions.day_sun": "Sunday",
  "setup.day_activity.label": "What do your days look like?",
  "setup.day_activity.member_label": "What do their days look like?",
  "setup.day_activity.seated": "Mostly sitting",
  "setup.day_activity.seated_hint": "Sitting all day, not much walking.",
  "setup.day_activity.on_feet": "Up and about",
  "setup.day_activity.on_feet_hint":
    "Standing or moving for a good part of the day.",
  "setup.day_activity.physical_job": "Physical job",
  "setup.day_activity.physical_job_hint":
    "Carrying, walking, climbing -- all day.",
  "setup.sport.label": "And sport?",
  "setup.sport.member_label": "And sport, for them?",
  "setup.sport.none": "No sport",
  "setup.sport.none_hint": "None at the moment.",
  "setup.sport.1_2": "1 to 2 a week",
  "setup.sport.1_2_hint": "One or two sessions in a usual week.",
  "setup.sport.3_4": "3 to 4 a week",
  "setup.sport.3_4_hint": "Three or four sessions in a usual week.",
  "setup.sport.5_plus": "5 or more a week",
  "setup.sport.5_plus_hint": "Five sessions a week or more.",
  "setup.activity.label": "How active are your days?",
  "setup.activity.hint":
    "It sizes every serving you get. Sitting eight hours and training four " +
    "times a week are about forty per cent apart — leave it blank and we " +
    "assume something in the middle, which is what we did until now.",
  "setup.activity.member_label": "How active are their days?",
  "setup.activity.member_hint":
    "Same for their share. Leave it empty if you are not sure — we assume the " +
    "middle rather than guessing for them.",
  "setup.activity.sedentary": "Mostly sitting",
  "setup.activity.sedentary_hint": "Sitting all day, not much walking.",
  "setup.activity.on_feet": "Up and about",
  "setup.activity.on_feet_hint": "Standing or moving for a good part of the day.",
  "setup.activity.trains_some": "Training some",
  "setup.activity.trains_some_hint": "Sport two or three times a week.",
  "setup.activity.trains_hard": "Training hard",
  "setup.activity.trains_hard_hint":
    "Sport four times a week or more, or a physical job.",
  // ⚠️ CES DEUX PHRASES NE S'AFFICHENT JAMAIS AUJOURD'HUI, ET C'EST ÉCRIT DES
  // DEUX CÔTÉS. `canGenerateMisses` n'émet pas ces motifs: `null` est une
  // réponse légitime, donc l'activité ne refuse aucune composition. Le
  // `Record` complet de `copy/setupMisses.ts` les réclame quand même — c'est
  // lui qui garantit qu'aucune question n'entre au catalogue sans ses mots.
  "setup.activity.missing_own":
    "Tell us how active your days are, so your servings are sized on you and " +
    "not on an average.",
  "setup.activity.missing_member":
    "Tell us how active their days are, so their share is sized on them and " +
    "not on an average.",

  "setup.people.goal": "What you are after",
  // ── LE RÉGIME ────────────────────────────────────────────────────────
  // Le moteur sait l'appliquer depuis FF-042 et rien ne permettait de le
  // dire. La question est posée AVANT les allergies: c'est celle qui écarte
  // le plus de choses, et l'ordre évite de cocher « poisson » sous allergie
  // quand la vraie réponse est « je suis végétarien ».
  "setup.people.diet": "How you eat",
  "setup.people.diet_hint":
    "It rules every dish we compose. You can say it once here — it is not a preference we weigh, it is a line we do not cross.",
  "setup.people.diet_omnivore": "I eat everything",
  "setup.people.diet_vegetarian": "Vegetarian",
  "setup.people.diet_vegan": "Vegan",
  "setup.people.diet_pescatarian": "Pescatarian",
  "setup.people.diet_gluten_free": "Gluten-free",
  "setup.people.allergies": "Anything you are allergic to?",
  // TROIS NATURES DISTINCTES, ET L'ENTONNOIR NE COLLECTE QUE LA PREMIÈRE
  // (FF-046): une ALLERGIE est médicale et rejoint l'union de sécurité,
  // fail-closed; une RÈGLE DE MAISON est un pouvoir domestique; une AVERSION
  // est un goût. Les confondre à la saisie, c'est promettre une garde de
  // sécurité sur une préférence.
  // ⟳ 2026-09-20 — REMOVED FROM THE SCREEN, ON REQUEST (no reader left):
  //   · setup.people.allergies_hint  — left with the seventeen chips.
  //   · setup.mouths.body_hint
  //   · household.mouth.tastes_hint (+ `_you`)
  // The rules they announced still hold in code; only the wording is gone.
  // ⛔ 2026-09-20 — no longer rendered; an empty section IS "nothing to
  // declare". Kept: two tests read it to assert its absence.
  "setup.people.allergies_none": "Nothing to declare",
  "setup.people.allergies_other": "Something else",
  "setup.people.allergies_add": "Add",
  "setup.people.allergies_remove": "Remove",

  // ── ÉTAPE 2b — LES AUTRES BOUCHES ───────────────────────────────────────
  // ⚠️ ON AJOUTE TOUJOURS UNE BOUCHE. L'accès est un AJOUT PAR-DESSUS, jamais
  // une alternative — ce ne sont pas deux natures de personne, c'est le même
  // objet à deux stades (FF-048 §1). L'écran ne présente donc jamais une
  // fourche « bouche ou compte ? ».
  "setup.mouths.title": "Who else eats here",
  // ── « Clear this form » EST PARTI LE 2026-08-19, ET SON BOUTON AUSSI ────
  // La fiche d'ajout se REPLIE désormais: elle n'existe que si on l'a ouverte,
  // et le geste qui la referme porte le mot que l'utilisateur a demandé —
  // « Remove », le même que sur la carte d'une personne inscrite. Deux
  // conséquences différentes, une seule intention à nommer: « que ce bloc ne
  // soit plus là ».
  "setup.mouths.add": "Add someone who eats here",
  // 2026-09-20 — the dashed frame opened straight onto "Who they are", the
  // first block's title, with nothing above saying WHO. The title deliberately
  // does NOT take the typed first name: a name in bold would make this read as
  // one more card, i.e. someone already at the table. One line, not two: a
  // second line under it was dropped the same day as filler.
  "setup.mouths.new_title": "One more person",
  "setup.mouths.add_confirm": "Add to the table",
  // ⚠️ PAS `setup.people.first_name_hint`. Celui-là dit « ta » portion, et il
  // était réutilisé ici: le formulaire d'une AUTRE bouche promettait de nommer
  // la portion de qui remplit le champ. Vu à l'écran le 2026-08-12.
  "setup.mouths.first_name_hint":
    "How the plan names their serving.",
  "setup.mouths.first_name_hint_you":
    "How the plan names your serving.",
  "setup.mouths.kind": "Are they an adult or a child?",
  // ⛔ 2026-09-20 — no longer rendered. The "An adult / A child" pill left
  // the mouth row; `m.kind` still decides which goals a mouth may carry.
  // Two tests assert its ABSENCE from a screen, and read it from here.
  "setup.mouths.kind_adult": "An adult",
  "setup.mouths.kind_child": "A child",
  // LA CEINTURE D'ÂGE EST STRUCTURELLE (`goalApplies`, `weekPlanAgeGate`), pas
  // un réglage. Le dire évite qu'on cherche un champ qui n'existera jamais.
  // ⚠️ CETTE PHRASE A ÉTÉ RETOURNÉE LE 2026-08-13, et ce n'est pas un
  // ajustement de ton: elle disait « a child never gets a nutrition direction
  // of their own », ce que le produit ne fait plus. Une phrase d'écran qui
  // survit à la règle qu'elle décrit est un mensonge que personne ne relit.
  // Ce qui reste vrai — et ce que la base rend inconstructible — est l'autre
  // moitié: pas de perte de poids, pas de silhouette, pour un enfant.
  "setup.mouths.kind_hint":
    "A child can have a direction too — eating better, training better. What " +
    "we never do for a child is weight loss or body reshaping: that is built " +
    "in, not a setting.",
  "setup.mouths.body": "Height, weight and sex",
  // ⚠️ LES TROIS OU AUCUN, et la phrase le dit parce que la base le fait: la
  // RPC refuse un corps partiel, et le moteur SAUTE une bouche sans corps —
  // elle reçoit alors la part de tout le monde, en silence.
  // Voir la note de `fr.ts`: la fiche d'ajout a éclaté le triplet en deux
  // paires étiquetées, donc « all three » n'y désigne plus de groupe.
  "setup.mouths.body_together": "Height, weight and sex go together: all three, or none.",
  "setup.mouths.goal": "What they are after",
  "setup.mouths.goal_from_profile":
    "Set in their own profile — it follows them everywhere, not just at this table.",
  "setup.mouths.allergies":
    "Is {who} allergic to anything?",
  "setup.mouths.allergies_you":
    "Are you allergic to anything?",
  // ⚠️ CETTE CLÉ A ÉTÉ ÉCRITE AVANT SON BOUTON, et le bouton n'est arrivé que
  // le 2026-08-13 — après qu'un compte réel s'est retrouvé avec la même
  // personne saisie TROIS FOIS et aucun moyen d'en retirer deux. Une phrase
  // sans contrôle est une fonctionnalité qu'on croit livrée.
  // ── LE MODE ÉDITION D'UNE CARTE (2026-08-19) ────────────────────────────
  // La carte d'une personne inscrite était un formulaire ouvert en permanence:
  // dix contrôles qui écrivent en base au moindre clic, sous chaque prénom.
  // Demandé: « si on clique pas sur modifier on peut rien modifier ».
  "setup.mouths.edit": "Edit",
  // ⛔ 2026-09-20 — no longer rendered. A card's exit gesture moved to the
  // bottom and is called "Save" (`household.member.save`): "Done" in the
  // header promised nothing and read as the absence of a save.
  "setup.mouths.edit_done": "Done",
  "setup.mouths.summary_on_file": "On file",
  "setup.mouths.remove": "Remove",
  "setup.mouths.remove_confirm": "Remove for good?",
  "setup.mouths.duplicate":
    "{name} already eats here. Two people with the same first name would get " +
    "the same line in the plan — give the second one a name you can tell apart.",
  "setup.mouths.full":
    "Eight is the most a household can hold. Every mouth is another serving to compose at each generation.",
  "setup.mouths.branch_full":
    "The number of people chosen in the first step has been reached. Go back to that step to change it.",
  // ── LES DEUX MOITIÉS DE CE QUE « CONTINUER » FAIT DE LA FICHE ───────────
  // Le bouton l'absorbe depuis le 2026-08-15, et c'est voulu. Ce qui manquait
  // est qu'il le DISE — avant, à côté des champs, et après, à côté du nom qui
  // vient d'apparaître. Sans les deux, un bouton d'avancement crée quelqu'un
  // en silence: « ça m'a rajouté une personne que je voulais pas »
  // (compte réel, 2026-08-19).
  // ── LA TÊTE DU FORMULAIRE D'AJOUT, ET POURQUOI ELLE EXISTE ─────────────
  // ⛔ `setup.mouths.new_card` ET `new_card_hint` SONT PARTIES LE 2026-09-01.
  // Elles disaient « personne n'est encore ici … il n'y a rien à retirer » sur
  // la fiche d'ajout dépliée. Demandé à l'écran — « ça sert à quoi ça ? » —
  // et le mot compte: le même lot du 2026-08-19 avait livré DEUX remèdes au
  // sosie, et le second (le bouton « Retirer », rendu inconditionnel) rend le
  // premier FAUX. Il y a bien quelque chose à retirer: la fiche elle-même.
  // Voir le commentaire de `MouthsStep` dans `SetupPage.tsx`.
  //
  // ⚠️ ET LA SORTIE EST NOMMÉE PAR SON LIBELLÉ RÉEL. La phrase ci-dessous
  // envoyait chercher « Clear this card », un bouton renommé « Remove » le
  // 2026-08-19.
  "setup.mouths.next_will_save":
    "“Continue” saves this card too, and {name} joins the table. “Remove” undoes it.",
  "setup.mouths.added_by_next":
    "{name} is now at the table — “Continue” saved this card before moving on. “Remove” on their card undoes it.",

  // ── L'ACCÈS — UN AJOUT PAR-DESSUS ───────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ `setup.access.*` — DISARMED 2026-09-20, no component renders them
  // ══════════════════════════════════════════════════════════════════════
  // The invite panel left the funnel with its writer. Inviting lives on
  // `/app/household`, under a DIFFERENT catalogue (`household.invite.*`).
  // Kept rather than deleted: fr/en parity is held by a test, and the step
  // may take the panel back. See the long note on the French side.
  "setup.access.title": "Give them their own access?",
  "setup.access.optional": "Optional. It changes nothing about tonight.",
  // LA PHRASE QUI RÉPOND À « faut-il attendre qu'elle s'inscrive ? ». Elle est
  // la raison d'être de cette section: sans elle, ajouter quelqu'un a l'air
  // d'ouvrir une attente, et l'attente est exactement ce que ce produit ne
  // fait jamais.
  "setup.access.waiting":
    "Nothing waits for them. Their place at the table exists the moment you add them, and tonight's plan already counts them in. The access only lets them take that place over.",
  "setup.access.grants":
    "What they get: they read the household plan and set their own direction. Not: composing, adding or removing anyone, or deciding what the house does not serve.",
  "setup.access.email": "Their email",
  "setup.access.submit": "Create the invitation",
  "setup.access.copy": "Copy the link",
  "setup.access.copied": "Copied.",
  // ⚠️ CE QUE LA RÉCLAMATION FAIT À L'OBJECTIF SAISI ICI. Depuis
  // 20260812250000, la réclamation SÈME cet objectif dans la ligne « about
  // you » du titulaire: il ne se perd plus. La phrase dit ce qui se passe,
  // parce que « rien ne change » serait faux — l'objectif change de PROPRIÉTÉ.
  "setup.access.goal_carries":
    "The direction you set for them carries over when they claim it — after that it is theirs to change, in their own About you.",

  // ── ÉTAPE 3 — LE PLAN ───────────────────────────────────────────────────
  // POSÉ UNE SEULE FOIS, POUR LE FOYER: ça appartient à qui cuisine, pas à
  // chaque bouche. C'est ce qui fait que la branche famille coûte une minute
  // de plus que la branche solo, et pas quatre fois plus.
  "setup.plan.title": "How your week runs",
  "setup.plan.intro": "Asked once, for the whole house — it belongs to whoever cooks.",
  // ── ÉTAPE 3 · LA TABLE, ET ÉTAPE 4 · LA DEMANDE ────────────────────────
  // Deux cartes là où il y en avait une. La coupure n'est pas cosmétique: « à
  // quels moments cette maison mange » ne change pas d'une semaine sur l'autre,
  // « quels jours je peux cuisiner cette semaine-ci » change à chaque fois.
  "setup.table.title": "Who eats, and when",
  // ⚠️ RÉÉCRITE LE 2026-08-14 AVEC LA CARTE QU'ELLE COIFFE. Elle disait « the
  // moments this house eats at », parce que l'étape posait UNE rangée pour
  // toute la maison et une carte à part pour les écarts. Il y a maintenant une
  // carte par personne, la même pour tout le monde, le titulaire compris.
  "setup.table.intro":
    "One card per person, the same for everyone. Only the moments you tick get composed.",
  "setup.table.each_title": "Anyone who eats differently",
  // ⚠️ LA DERNIÈRE PHRASE N'EST PAS UNE PROMESSE EN L'AIR: la grille par
  // personne (`MealPickerGrid`) existe, elle est jour × moment, et elle est
  // dimensionnée par la fenêtre du plan qu'on compose. Ne l'écrire que parce
  // que c'est vrai — une copie qui annonce un geste inexistant est la même
  // dette qu'une donnée collectée sans lecteur, prise par l'autre bout.
  "setup.table.each_intro":
    "Leave a person untouched and they eat at the moments above. Tick their " +
    "own moments only if they differ — a teenager who skips breakfast, a small " +
    "one who has an afternoon snack. This is the habit, not the week: the " +
    "meals someone actually misses — a trip, a dinner out, a weekend away — " +
    "are ticked off when you build that week’s plan.",
  "setup.table.house_label": "The house",
  "setup.table.same_as_house": "Eats at the same moments as the house.",
  // ── LE RÉGIME, PAR BOUCHE ────────────────────────────────────────────
  // Volontairement PLUS COURT que `setup.people.diet_hint`: la règle est
  // déjà énoncée en tête de l'étape, sur la ligne du titulaire. La répéter
  // mot pour mot sous chaque prénom ferait lire trois fois la même phrase.
  // Ce qui reste est ce que seule CETTE ligne peut dire: la table suit le
  // plus strict, et ne rien cocher veut dire « pas demandé ».
  "setup.table.diet_label": "How they eat",
  "setup.table.diet_hint":
    "The shared dish follows the strictest line at the table. Nothing ticked means nobody has been asked.",
  // ── LES MOMENTS, AVEC LEUR TAILLE (2026-08-14) ───────────────────────
  // Le libellé désigne LA PERSONNE DE LA CARTE, jamais « la maison »: la
  // rangée du titulaire s'appelait « The house », ce qui la faisait lire
  // comme un réglage global alors que c'est son rythme à lui — et laissait
  // croire que les autres n'en avaient pas.
  "setup.table.moments_label": "When they eat",
  "setup.table.moments_hint":
    "Tick the moments they actually eat at, and say whether it is a big or a " +
    "small one. Leave the size alone when it does not matter — nothing is " +
    "assumed from a blank.",
  // Les trois tailles, en mots. `MEAL_SIZES` porte les jetons; l'écran ne
  // rend jamais un jeton brut, même court.
  "setup.table.size_small": "Small",
  "setup.table.size_medium": "Medium",
  "setup.table.size_large": "Big",
  // ── LA LIGNE LIBRE (2026-08-14) ──────────────────────────────────────
  // Elle remplace le dépliant « What they usually eat » et ses boutons radio
  // par moment: dans l'entonnoir, il demandait d'aller cocher ailleurs des
  // moments qui se cochent juste au-dessus, et affichait « No eating moments
  // are set for this person yet » sur une carte où on venait d'en poser.
  // Même table, même RPC, même plafond — rien de saisi n'est perdu, et la
  // carte complète reste sur `/app/household`.
  // ⚠️ PAS « What they usually eat »: c'est MOT POUR MOT le titre du cadre
  // qu'on retire (`household.habits.title`), et le garder ferait lire l'ancien
  // bloc sous une autre forme. Ce champ n'est pas le questionnaire par moment,
  // c'est UNE ligne libre — le libellé doit le dire.
  "setup.table.note_label": "Their preferences, in your own words",
  "setup.table.note_hint":
    "In your own words, and kept for good — read again every time we compose. " +
    "Habits, tastes, the thing they never touch.",
  "setup.table.note_placeholder":
    "Fruit in the morning, pizza on Friday night, whatever is fresh from the market on Saturday.",
  "setup.table.from_profile":
    "They have their own account — their moments are in their own settings.",
  // ── LES MOYENS DE CUISSON, AU NIVEAU DU FOYER (2026-08-18) ──────────────
  // Une cuisine est PARTAGÉE: la question se pose une fois, jamais par bouche.
  // Elle vient AVANT les disponibilités — on demande avec quoi on cuisine
  // avant de demander quand, sinon on planifie des cuissons impossibles.
  //
  // ⚠️ LA COPIE NE PROMET RIEN QUE LE MOTEUR NE FASSE ENCORE. Ce lot COLLECTE;
  // l'exploitation est le lot suivant. D'où « we plan around it » au futur
  // d'usage et pas « we never propose an oven you don't have »: une phrase qui
  // annonce un geste inexistant est la même dette qu'une donnée sans lecteur,
  // prise par l'autre bout.
  "setup.equipment.title": "What you cook with",
  "setup.equipment.intro":
    "Asked once, for the whole kitchen — it is shared, so it is not a question per person.",
  "setup.equipment.legend": "Your kitchen",
  // La ligne d'aide dit à quoi ça sert. ⟳ 2026-09-25 — « Sans réponse, rien ne
  // change » est retiré, sur demande.
  "setup.equipment.hint":
    "Tick what you actually have. A freezer changes whether we can cook once " +
    "and keep the rest; a microwave changes what « reheat it » means " +
    "on the day.",
  "setup.equipment.tool_oven": "Oven",
  "setup.equipment.tool_stovetop": "Hob",
  "setup.equipment.tool_microwave": "Microwave",
  "setup.equipment.tool_freezer": "Freezer",
  "setup.equipment.tool_air_fryer": "Air fryer",
  "setup.equipment.tool_pressure_cooker": "Pressure cooker",
  "setup.equipment.tool_blender": "Blender or food processor",
  "setup.equipment.save": "Save",
  "setup.equipment.saving": "Saving…",
  // LE REFUS D'UNE SÉLECTION VIDE, et il dit la sortie: on ne demande pas de
  // répondre, on refuse la réponse « aucun ». Un foyer sans aucun des sept ne
  // cuisine pas, et il n'y a alors rien à composer.
  "setup.equipment.error_empty":
    "Tick at least one — with none of these, there is nothing to cook with. " +
    "Leave it untouched instead if you would rather not say.",
  "setup.equipment.loading": "Reading what you already told us…",
  "setup.equipment.no_goal": "Set your goal above first, then this can be saved.",
  "setup.request.title": "This plan",
  "setup.request.from": "From",
  "setup.request.to": "To",
  "setup.plan.rhythm": "When you eat",
  "setup.plan.rhythm_hint": "Only the moments you tick get composed.",
  "setup.plan.time": "How long a cooking session lasts",
  // ⚠️ LE NOMBRE ARRIVE DÉJÀ FORMATÉ (« 1½ »), et c'est voulu: la demi-heure
  // se dit, elle ne se calcule pas à l'affichage. Voir `cookingTimeParts`.
  "setup.plan.time_minutes": "{n} min",
  "setup.plan.time_hours": "{n} hr",
  "setup.plan.time_hint":
    "Roughly. It is used as an order of magnitude, not as a stopwatch.",
  "setup.plan.budget": "Budget for this plan",
  "setup.plan.compose": "Build my first plan",
  "setup.plan.composing": "Building it now…",
  // ── LES HUIT PHRASES DE L'ATTENTE — voir `ComposingLabel` ────────────────
  // Quinze secondes chacune, dans l'ordre où la composition travaille. Elles
  // décrivent le TRAVAIL, jamais un pourcentage: rien ne remonte du serveur
  // avant la fin, donc un chiffre serait inventé.
  //
  // ⚠️ `setup.plan.composing` RESTE, et n'est plus rendu par le bouton. C'est
  // le libellé de repli d'un état d'attente qui n'aurait pas de cadence — et
  // le retirer ferait mentir les catalogues sur ce que l'écran sait dire.
  "setup.plan.composing_1": "Reading who eats at your table…",
  "setup.plan.composing_2": "Sizing each share…",
  "setup.plan.composing_3": "Setting aside what nobody here can eat…",
  "setup.plan.composing_4": "Choosing dishes for your moments…",
  "setup.plan.composing_5": "Grouping them into cooking sessions…",
  "setup.plan.composing_6": "Checking the week holds together…",
  "setup.plan.composing_7": "Adding up the shopping list…",
  "setup.plan.composing_8": "Writing why each choice was made…",

  // ── CE QUI MANQUE ENCORE ────────────────────────────────────────────────
  // Un motif par phrase, et chacune dit LE GESTE, pas l'état. « Il manque une
  // date » n'apprend rien; « sans sa date sa direction ne s'applique pas » dit
  // ce qu'on perd.
  "setup.missing.title": "Before we can build it",
  // ⚠️ DEUX TITRES, ET LA DISTINCTION EST VISIBLE À L'ÉCRAN. Le premier ne
  // vaut que pour l'étape qui CONSTRUIT; on lisait « before we can build it
  // — when you eat » sous un formulaire qui pose la question et qui ne
  // construit rien.
  "setup.missing.for_you": "You",
  "setup.missing.before_next": "Before moving on",
  "setup.missing.household_size": "Tell us how many people you cook for.",
  "setup.missing.own_first_name": "Your first name — the plan names your serving with it.",
  "setup.missing.own_birth_date": "Your date of birth.",
  "setup.missing.own_height_cm": "Your height, so your servings are yours.",
  "setup.missing.own_gender": "Your sex, so your servings are yours.",
  "setup.missing.own_weight_kg":
    "Your weight. Without a first point, nothing can tell later whether you are losing too fast.",
  "setup.missing.own_goal": "What you are after. Nothing can be composed without it.",
  "setup.missing.own_allergies": "Whether you have allergies — “none” counts as an answer.",
  "setup.missing.own_diet":
    "How you eat — “I eat everything” counts as an answer. Without it a whole plan can be unusable from the first evening.",
  "setup.missing.member_first_name":
    "A first name for everyone at the table. Without one, their serving vanishes from the plan without a word.",
  "setup.missing.member_birth_date": "A date of birth for everyone at the table.",
  // ⚠️ UN SEUL MOTIF POUR LES TROIS CHAMPS, parce que la base est tout-ou-rien:
  // `keel_household_set_member_body` refuse `body_incomplete` dès qu'il en
  // manque un, et le moteur saute la ligne entière. Trois phrases laisseraient
  // croire qu'on peut en donner deux sur trois et gagner quelque chose.
  "setup.missing.member_body":
    "Height, weight and sex for everyone at the table. Without all three, that person is served the same as everyone else — the plan cannot size their share.",
  "setup.missing.member_goal": "A direction for each adult at the table.",
  "setup.missing.member_allergies":
    "Whether each person has allergies — “none” counts as an answer.",
  "setup.missing.adult_without_birth_date":
    "Someone has a direction but no date of birth. A direction only applies at a known age, so as it stands they would get a standard serving and nothing would say so.",
  // \u26a0\ufe0f DEUX FAUTES ONT V\u00c9CU DANS CETTE SEULE PHRASE, SIGNAL\u00c9ES LE 2026-08-15.
  //
  // 1. \u00ab SIGNED UP \u00bb \u2014 un contresens sur le mod\u00e8le. Une bouche du foyer n'a PAS
  //    de compte; c'est toute la diff\u00e9rence entre elle et la personne qui
  //    remplit ce tunnel. \u00ab Christ\u00e8le n'est pas encore inscrit\u00b7e \u00bb envoyait
  //    chercher une inscription qui n'existe pas.
  //
  // 2. \u00ab "CONTINUE" DOES NOT SAVE THEM \u00bb \u2014 la phrase disait vrai, et c'\u00e9tait le
  //    probl\u00e8me. Elle annon\u00e7ait, sous une fiche enti\u00e8rement renseign\u00e9e, que le
  //    bouton principal allait perdre le travail de la personne. Un
  //    avertissement qu'on doit \u00e9crire est le signe que le geste est mal plac\u00e9,
  //    pas qu'il faut mieux le documenter. `SetupPage` fait donc maintenant
  //    absorber l'ajout par \u00ab Continuer \u00bb, et la phrase n'a plus \u00e0 s'excuser.
  //
  // Ce qui RESTE vrai, et pourquoi la cl\u00e9 survit: la fiche \u00e0 l'\u00e9cran n'est pas
  // encore dans le foyer. Sans cette ligne, \u00ab il manque encore une personne \u00bb
  // se lit juste sous un pr\u00e9nom qu'on vient de taper.
  "setup.mouths.held_typed":
    "{name} is not saved yet: the card is on screen, not in the household. Both \u201cAdd\u201d and \u201cContinue\u201d record it.",
  "setup.mouths.held_one":
    "One more person to go: you answered \u201c{answer}\u201d to the first question.",
  "setup.mouths.held_many":
    "{n} more people to go: you answered \u201c{answer}\u201d to the first question.",
  "setup.mouths.held_exit":
    "Fewer of you than you thought? Go back to the first question and change your answer.",
  "setup.missing.missing_mouths": "Add the other people who eat here.",
  "setup.missing.too_many_mouths":
    "Eight is the most a household can hold, you included.",
  // ⚠️ « When you eat » NE DÉSIGNAIT PLUS RIEN depuis que l'étape porte
  // aussi les moments de CHAQUE personne: on remplissait la rangée d'une
  // bouche, on croyait avoir répondu, et le refus employait les mêmes mots
  // que la rangée qu'on venait de remplir.
  // ⚠️ « THIS HOUSE » A DISPARU LE 2026-08-14 AVEC LA RANGÉE QUI PORTAIT CE
  // NOM. Le motif se rend maintenant SUR la carte du titulaire, sous ses
  // propres moments: « the moments this house eats at » y désignait un contrôle
  // global qui n'existe plus, et laissait chercher ailleurs.
  "setup.missing.eating_rhythm": "The moments you eat at, on your own card.",
  "setup.missing.cook_days": "Which days you cook.",
  "setup.missing.cooking_time_min": "How long a cooking session can last.",
  "setup.missing.budget_amount": "How much this plan can cost.",
  "setup.missing.member_eating_rhythm":
    "When each person eats, if it is not the same as the house.",

  // ── LES TROIS TABLES DE LIBELLÉS DE `SetupPage.tsx` ──────────────────────
  // Elles étaient trois `Record` de module, en dur, dix-neuf phrases au total.
  // Le compilateur les gardait COMPLÈTES (un objectif ajouté à `MemberGoal`
  // sans son mot ne compile pas) et c'est pour ça qu'elles avaient l'air
  // saines — mais un `const` de module est figé à la langue du bundle, donc
  // dix-neuf mots anglais restaient au milieu d'un formulaire français. Les
  // tables gardent leur complétude: elles portent maintenant des CLÉS.
  //
  // Ce sont des mots de PERSONNE, pas de nutritionniste: « Lose weight » et
  // pas « fat_loss », qui est le jeton stocké et n'a rien à faire à l'écran.
  "setup.goal.fat_loss": "Lose weight",
  "setup.goal.muscle_gain": "Build muscle",
  "setup.goal.maintenance": "Keep my weight steady",

  // Les moments du jour. Vocabulaire du GÉNÉRATEUR de repas
  // (`api/mealGeneration.ts :: EATING_OCCASIONS`), plus court que celui des
  // plans publiés — voir l'en-tête de `api/mealLabels.ts` sur pourquoi les deux
  // ne se confondent pas.
  "setup.occasion.breakfast": "Breakfast",
  "setup.occasion.snack_am": "Mid-morning",
  "setup.occasion.lunch": "Lunch",
  "setup.occasion.snack_pm": "Afternoon",
  "setup.occasion.dinner": "Dinner",
  "setup.occasion.before_bed": "Before bed",

  // Les jours, en ABRÉGÉ: ils tiennent dans sept cases à cocher côte à côte sur
  // un téléphone. Le seed a déjà `day.long.*` pour la prose des plans; les deux
  // vocabulaires restent séparés parce qu'ils n'ont pas la même contrainte de
  // place.
  "setup.day.mon": "Mon",
  "setup.day.tue": "Tue",
  "setup.day.wed": "Wed",
  "setup.day.thu": "Thu",
  "setup.day.fri": "Fri",
  "setup.day.sat": "Sat",
  "setup.day.sun": "Sun",
  "setup.missing.grocery_runs": "Tell us how many food shops you are up for",
  // ⟳ 2026-09-24 — « AVEC QUOI TU CUISINES » RETIENT LA GÉNÉRATION. Demandé:
  // bloquer le plan tant que la cuisine n'est pas renseignée. Le motif
  // (`kitchen_equipment`) retient l'étape 3; la ligne `plan.request.*` se lit
  // DANS le bloc replié, sur les deux écrans qui montent `PlanRequestFields`.
  "setup.missing.kitchen_equipment": "Tell us what you cook with",
} as const
