// Pack français — le namespace `setup`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `setup.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frSetup = {
  // ══ /app/setup — LE TUNNEL D'ENTRÉE ═════════════════════════════════════
  //
  // Trois étapes, et la dernière action EST la génération. Aucune copie ici ne
  // doit faire ATTENDRE quelqu'un: « ton coach prépare ton plan » est faux dans
  // ce produit, le coach ne prépare rien pour personne (docs/keel/MODEL.md).
  // Le bouton compose, et l'écran suivant est le plan.
  "setup.title": "Organisons-nous",
  "setup.subtitle": "Trois étapes, et votre premier plan.",
  "setup.progress": "Étape {n} sur {total}",
  "setup.loading": "On reprend où vous en étiez…",
  "setup.error.title": "On n’a pas pu relire où vous en étiez.",
  "setup.back": "Retour",
  "setup.next": "Continuer",
  // PERSONNE N'EST RETENU DANS UN COULOIR. La sortie est visible à chaque
  // étape, et ce qui a déjà été enregistré l'est vraiment.
  "setup.skip": "Passer pour l’instant",
  "setup.skip_hint":
    "Rien de ce que vous avez répondu n’est perdu. Vous pourrez revenir depuis votre plan.",
  "setup.saved": "Enregistré.",
  "setup.situate.title": "Pour combien de personnes cuisinez-vous ?",
  "setup.situate.solo": "Juste moi",
  "setup.situate.solo_hint":
    "Un plan, vos parts, en batch cooking si c’est votre façon de faire.",
  "setup.situate.pair": "On est deux",
  "setup.situate.pair_hint":
    "Une casserole, deux parts — même quand vous ne visez pas la même chose.",
  "setup.situate.family": "Trois ou plus",
  "setup.situate.family_hint": "La maison cuisine une fois, et chacun reçoit sa part.",
  "setup.situate.member":
    "Quelqu’un d’autre tient ce foyer et compose pour lui. Ce qui suit ne concerne que vous — vos parts, votre direction, et un plan à vous si vous en voulez un.",
  // Voir la note d'`en.ts`: le verrou garde sa raison, il la dit enfin, et il
  // s'ouvre quand il n'y a plus personne à effacer.
  "setup.situate.solo_locked":
    "« Juste moi » est désactivé tant que d’autres personnes sont à cette table. Retire-les plus bas, une par une, et il revient.",
  "setup.situate.dissolve_confirm":
    "Ceci défait le foyer. Votre propre place à table part avec : vos parts de foyer, vos habitudes de cuisine, ce que vous ne voulez pas voir servir et les allergies enregistrées ici. Votre profil, votre direction et votre poids visé ne bougent pas — vous continuez seul.",
  "setup.situate.dissolve_do": "Défaire le foyer",
  "setup.situate.dissolve_cancel": "Le garder",
  "setup.situate.dissolve_not_alone":
    "Quelqu’un d’autre est encore à cette table. Retire-le d’abord — on ne défait rien ici tant qu’une place est prise.",
  "setup.situate.dissolve_has_plans":
    "Ce foyer a déjà cuisiné. Ses plans restent, donc il ne se défait pas depuis ici.",
  "setup.people.title": "Vous",
  "setup.people.intro":
    "Vous aussi, vous mangez ici. Vous êtes la première place à table, pas la personne qui la tient.",
  "setup.people.first_name": "Prénom",
  "setup.people.birth_date": "Date de naissance",
  "setup.people.birth_date_hint":
    "Une direction ne s’applique qu’à un âge connu. Sans elle, vous recevez une part standard, et rien ne le dit.",
  "setup.people.birth_date_error": "Cette date est dans le futur, ou on ne sait pas la lire.",
  "setup.people.height": "Taille (cm)",
  "setup.people.gender": "Sexe",
  "setup.people.weight": "Poids (kg)",
  // ── L'ACTIVITÉ — QUATRE CRANS, ET JAMAIS UN NOMBRE (L0, 2026-08-18) ─────
  // Les quatre libellés courts sont NEUTRES EN PERSONNE: les mêmes servent à ma
  // fiche et à celle d'une autre bouche. Seuls la question et son aide changent
  // de personne. Voir le bloc jumeau de `en.ts` pour le pourquoi complet.
  // ② Voir la note d'`en.ts`: deux axes, parce qu'une journée n'est pas un sport.
  // ③ Voir la note d'`en.ts`: on demande ce qui SE FAIT, jamais ce qu'on aime.
  "setup.traditions.title": "Les repas traditions",
  "setup.traditions.hint":
    "Le rôti du dimanche, le poisson du vendredi. Dites-le et le plan compose autour, au lieu de composer par-dessus. Deux ou trois suffisent — trois au maximum.",
  "setup.traditions.weekday": "Jour",
  "setup.traditions.slot": "Repas",
  "setup.traditions.slot_breakfast": "Petit-déjeuner",
  "setup.traditions.slot_lunch": "Déjeuner",
  "setup.traditions.slot_dinner": "Dîner",
  "setup.traditions.label": "C'est quoi, dans vos mots",
  "setup.traditions.label_placeholder": "rôti, poisson, pizza...",
  "setup.traditions.add": "Ajouter",
  "setup.traditions.remove": "Retirer",
  "setup.traditions.empty": "Rien de posé — le plan compose tous les repas.",
  "setup.traditions.full":
    "Trois, c'est le maximum. Retirez-en un pour en ajouter un autre.",
  "setup.traditions.day_mon": "Lundi",
  "setup.traditions.day_tue": "Mardi",
  "setup.traditions.day_wed": "Mercredi",
  "setup.traditions.day_thu": "Jeudi",
  "setup.traditions.day_fri": "Vendredi",
  "setup.traditions.day_sat": "Samedi",
  "setup.traditions.day_sun": "Dimanche",
  "setup.day_activity.label": "Vos journées, elles sont comment ?",
  "setup.day_activity.member_label": "Ses journées, elles sont comment ?",
  "setup.day_activity.seated": "Plutôt assis",
  "setup.day_activity.seated_hint": "Assis toute la journée, peu de marche.",
  "setup.day_activity.on_feet": "Debout, en mouvement",
  "setup.day_activity.on_feet_hint":
    "Debout ou en mouvement une bonne partie du jour.",
  "setup.day_activity.physical_job": "Métier physique",
  "setup.day_activity.physical_job_hint":
    "Porter, marcher, monter — toute la journée.",
  "setup.sport.label": "Et le sport ?",
  "setup.sport.member_label": "Et le sport, pour elle ou lui ?",
  "setup.sport.none": "Pas de sport",
  "setup.sport.none_hint": "Aucune séance en ce moment.",
  "setup.sport.1_2": "1 à 2 par semaine",
  "setup.sport.1_2_hint": "Une ou deux séances dans une semaine ordinaire.",
  "setup.sport.3_4": "3 à 4 par semaine",
  "setup.sport.3_4_hint": "Trois ou quatre séances dans une semaine ordinaire.",
  "setup.sport.5_plus": "5 ou plus par semaine",
  "setup.sport.5_plus_hint": "Cinq séances par semaine ou davantage.",
  "setup.activity.label": "Vos journées, elles sont comment ?",
  "setup.activity.hint":
    "Ça dimensionne chacune de vos parts. Entre huit heures assis et quatre " +
    "séances par semaine, il y a environ quarante pour cent d’écart — sans " +
    "réponse, on suppose le milieu, ce qu’on faisait jusqu’ici.",
  "setup.activity.member_label": "Ses journées, elles sont comment ?",
  "setup.activity.member_hint":
    "Pareil, pour sa part à elle. Laissez vide si vous n’êtes pas sûr — on suppose " +
    "le milieu plutôt que de deviner à sa place.",
  "setup.activity.sedentary": "Surtout assis",
  "setup.activity.sedentary_hint": "Assis toute la journée, peu de marche.",
  "setup.activity.on_feet": "Debout, en mouvement",
  "setup.activity.on_feet_hint":
    "Debout ou en mouvement une bonne partie du jour.",
  "setup.activity.trains_some": "Du sport régulier",
  "setup.activity.trains_some_hint": "Du sport deux à trois fois par semaine.",
  "setup.activity.trains_hard": "Du sport intensif",
  "setup.activity.trains_hard_hint":
    "Du sport quatre fois ou plus, ou un métier physique.",
  // Ces deux phrases ne s'affichent jamais aujourd'hui — l'activité ne refuse
  // aucune composition. Le `Record` complet de `copy/setupMisses.ts` les
  // réclame quand même, et c'est lui la garde.
  "setup.activity.missing_own":
    "Dites-nous comment sont vos journées, pour que vos parts soient " +
    "dimensionnées sur vous et pas sur une moyenne.",
  "setup.activity.missing_member":
    "Dites-nous comment sont ses journées, pour que sa part soit dimensionnée " +
    "sur elle et pas sur une moyenne.",

  "setup.people.goal": "Ce que vous visez",
  // Le régime est posé AVANT les allergies: c'est la question qui écarte le
  // plus de choses, et l'ordre évite de cocher « poisson » en allergie quand la
  // vraie réponse est « je suis végétarien ».
  "setup.people.diet": "Comment vous mangez",
  "setup.people.diet_hint":
    "Ça gouverne chaque plat qu'on compose. Une fois dit ici, c'est dit — ce n'est " +
    "pas une préférence qu'on pondère, c'est une ligne qu'on ne franchit pas.",
  "setup.people.diet_omnivore": "Je mange de tout",
  "setup.people.diet_vegetarian": "Végétarien",
  "setup.people.diet_vegan": "Végane",
  "setup.people.diet_pescatarian": "Pescatarien",
  // ⟳ 2026-09-08 — LE LIBELLÉ DIT LE GESTE, PAS LE DIAGNOSTIC. « Cœliaque »
  // est un mot de médecin, et la plupart des gens qui cochent ceci ne le
  // sont pas: ils mangent sans gluten. La maladie, elle, se déclare comme
  // ALLERGIE (`allergen.gluten`), où la ceinture est fail-closed.
  "setup.people.diet_gluten_free": "Sans gluten",
  "setup.people.allergies": "Vous êtes allergique à quelque chose ?",
  // ⟳ 2026-09-20 — RETIRÉES DE L'ÉCRAN, SUR DEMANDE (aucun lecteur):
  //   · setup.people.allergies_hint « Médical uniquement. Ça sort de toute la
  //     casserole. Les dégoûts viennent après. » — partie avec les dix-sept
  //     pastilles du même bloc (`MouthFormDialog`).
  //   · setup.mouths.body_hint      « Les trois ensemble, ou aucun des trois. »
  //   · household.mouth.tastes_hint (+ `_you`) « Un dégoût, pas une allergie. »
  // Les règles qu'elles annonçaient tiennent toujours dans le code: la
  // séparation allergie/dégoût est structurelle (deux tables), et le triplet du
  // corps est toujours exigé par `isUsableMouthHeight`/`isUsableMouthWeight`.
  // ⛔ 2026-09-20 — PLUS RENDUE. « Rien à déclarer » est parti avec la liste
  // fermée: une section vide EST « rien à déclarer », et le bouton faisait un
  // geste de plus à qui n'a rien à dire. Deux tests lisent la clé pour vérifier
  // son ABSENCE d'un écran, et `allergiesNone` reste dans le brouillon (à
  // `false`), parce que trois lecteurs le comptent encore.
  "setup.people.allergies_none": "Rien à déclarer",
  "setup.people.allergies_other": "Autre chose",
  "setup.people.allergies_add": "Ajouter",
  "setup.people.allergies_remove": "Retirer",
  "setup.mouths.title": "Qui mange ici, à part vous",
  // ⚠️ `setup.mouths.discard` (« Effacer cette fiche ») est parti le
  // 2026-08-19: la fiche se REFERME maintenant, et le mot que l'utilisateur a
  // demandé est « Retirer » (`setup.mouths.remove`, partagé avec la carte
  // d'une personne inscrite).
  "setup.mouths.add": "Ajouter quelqu’un qui mange ici",
  // ── LE CADRE EN POINTILLÉ PORTE UN NOM — 2026-09-20 ─────────────────────
  // Il s'ouvrait sur « Qui c'est », le titre du premier bloc de la fiche, et
  // rien au-dessus ne disait de QUI on parle. Signalé à l'écran: « quand on
  // ajoute une personne en plus, on n'y voit pas très clair […] le "qui c'est"
  // on ne comprend pas facilement que c'est pour une nouvelle personne ».
  //
  // ⛔ ET LE TITRE NE PREND PAS LE PRÉNOM TAPÉ, alors que les cartes
  // au-dessus le font. C'est exactement ce qu'il faut éviter ici: un prénom en
  // gras au-dessus d'un cadre ferait de la fiche en cours une carte de plus,
  // c'est-à-dire quelqu'un qui est déjà à table.
  //
  // ⛔ UNE LIGNE, PAS DEUX. `setup.mouths.new_hint` — « Elle n'est pas encore
  // à table. » — a vécu une heure, le 2026-09-20, et a été retirée sur demande
  // le jour même. Le titre porte déjà le fait; la redire dessous est du
  // remplissage, sur l'écran qu'on venait précisément d'alléger.
  "setup.mouths.new_title": "Une personne en plus",
  "setup.mouths.add_confirm": "Ajouter à la table",
  "setup.mouths.first_name_hint":
    "C'est ainsi que le plan nommera sa part.",
  "setup.mouths.first_name_hint_you": "C'est ainsi que le plan nommera votre part.",
  "setup.mouths.kind": "C’est un adulte ou un enfant ?",
  // ⛔ 2026-09-20 — LES DEUX NE SONT PLUS RENDUES. La pastille « Un adulte /
  // Un enfant » a été retirée de la ligne d'une bouche: « le toggle adulte, en
  // vrai on s'en fout, faut le virer ». `m.kind` décide encore des directions
  // possibles et du motif `adult_without_birth_date`; c'est son affichage qui
  // part. Deux tests vérifient leur ABSENCE d'un écran, et ils les lisent ici.
  "setup.mouths.kind_adult": "Un adulte",
  "setup.mouths.kind_child": "Un enfant",
  "setup.mouths.kind_hint":
    "Un enfant peut avoir une direction lui aussi — manger mieux, mieux " +
    "s’entraîner. Ce qu’on ne fait jamais pour un enfant, c’est une perte de " +
    "poids ou un travail de silhouette : c’est intégré, ce n’est pas un réglage.",
  "setup.mouths.body": "Taille, poids et sexe",
  // ⚠️ LA MÊME RÈGLE, DITE SANS LE GROUPE. La fiche d'ajout a éclaté le
  // triplet en deux paires étiquetées (même disposition que la carte du
  // titulaire), et « les trois » n'y désigne donc plus rien. Cette ligne-ci
  // les NOMME, parce qu'elle vit seule sous la grille.
  "setup.mouths.body_together":
    "Taille, poids et sexe vont ensemble : les trois, ou aucun.",
  "setup.mouths.goal": "Ce qu’il ou elle vise",
  "setup.mouths.goal_from_profile":
    "Posée dans son propre profil — elle le suit partout, pas seulement à cette table.",
  "setup.mouths.allergies":
    "{who} est allergique à quelque chose ?",
  "setup.mouths.allergies_you": "Vous êtes allergique à quelque chose ?",
  // Voir la note d'`en.ts`: la carte ne s'édite qu'au bouton.
  "setup.mouths.edit": "Modifier",
  // ⛔ 2026-09-20 — PLUS RENDUE. Le geste de sortie d'une carte dépliée est
  // passé en bas de carte et s'appelle « Enregistrer » (`household.member.save`),
  // parce qu'un « Terminé » en tête de carte ne promettait rien et se lisait
  // comme l'absence d'enregistrement: « je n'ai pas de bouton enregistrer comme
  // je l'ai avec le compte maître ».
  "setup.mouths.edit_done": "Terminé",
  "setup.mouths.summary_on_file": "Renseignée",
  "setup.mouths.remove": "Retirer",
  "setup.mouths.remove_confirm": "Retirer définitivement ?",
  "setup.mouths.duplicate":
    "{name} mange déjà ici. Deux personnes avec le même prénom auraient la " +
    "même ligne dans le plan — donne à la seconde un prénom qu’on peut " +
    "distinguer.",
  "setup.mouths.full":
    "Huit, c’est le maximum d’un foyer. Chaque bouche est une part de plus à composer à chaque génération.",
  "setup.mouths.branch_full":
    "Le nombre de personnes choisi à la première étape est déjà atteint. Revenez à cette étape pour le modifier.",
  // Voir la note d'`en.ts`: l'absorption reste voulue, son silence non.
  // ⚠️ LA SORTIE EST NOMMÉE PAR SON LIBELLÉ RÉEL. Cette phrase a dit
  // « Effacer cette fiche » jusqu'au 2026-09-01, alors que le bouton porte
  // « Retirer » (`setup.mouths.remove`) depuis le 2026-08-19: elle envoyait
  // chercher un bouton qui n'existe pas, ce qui est exactement le défaut
  // qu'elle était censée refermer.
  "setup.mouths.next_will_save":
    "« Continuer » enregistre aussi cette fiche, et {name} rejoint la table. « Retirer » l’annule.",
  "setup.mouths.added_by_next":
    "{name} est maintenant à table — « Continuer » a enregistré sa fiche avant de passer à la suite. Le bouton « Retirer » de sa carte l’annule.",
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ `setup.access.*` — DÉSARMÉ LE 2026-09-20, AUCUN COMPOSANT NE LES REND
  // ══════════════════════════════════════════════════════════════════════
  // Le panneau « Lui donner son propre accès ? » a quitté l'entonnoir avec son
  // écrivain (`sendInvite`). L'invitation vit sur `/app/household`, avec un
  // AUTRE catalogue (`household.invite.*`) — donc rien de ce qui suit n'y est
  // repris, et rien ne s'y perd non plus.
  //
  // ⚠️ GARDÉES PLUTÔT QUE SUPPRIMÉES: la parité fr/en est tenue par un test,
  // effacer une clé oblige à trancher la même question des deux côtés, et
  // l'étape peut reprendre ce panneau. Ce qui compte est qu'aucune surface ne
  // les rende — vérifié par grep le jour du retrait.
  "setup.access.title": "Lui donner son propre accès ?",
  "setup.access.optional": "Facultatif. Ça ne change rien pour ce soir.",
  "setup.access.waiting":
    "Rien ne l’attend. Sa place à table existe dès que vous l’ajoutez, et le plan de ce soir la compte déjà. L’accès lui permet seulement de reprendre cette place à son compte.",
  "setup.access.grants":
    "Ce que ça lui donne : elle voit le plan du foyer et pose sa propre direction. Pas : composer, ajouter ou retirer quelqu’un, ni décider ce que la maison ne sert pas.",
  "setup.access.email": "Son e-mail",
  "setup.access.submit": "Créer l’invitation",
  "setup.access.copy": "Copier le lien",
  "setup.access.copied": "Copié.",
  "setup.access.goal_carries":
    "La direction que vous posez pour elle la suit quand elle réclame sa place — après ça, c’est à elle de la changer, dans son propre À propos de vous.",
  "setup.plan.title": "Comment votre semaine se déroule",
  "setup.plan.intro":
    "Demandé une fois, pour toute la maison — ça appartient à qui cuisine.",
  "setup.table.title": "Qui mange, et quand",
  // ⚠️ RÉÉCRITE LE 2026-08-14 AVEC LA CARTE QU'ELLE COIFFE — voir `en.ts`.
  "setup.table.intro":
    "Une carte par personne, la même pour tout le monde. Seuls les moments que vous cochez sont composés.",
  "setup.table.each_title": "Ceux qui mangent autrement",
  "setup.table.each_intro":
    "Laissez une personne telle quelle et elle mange aux moments ci-dessus. " +
    "Cochez ses propres moments seulement s’ils diffèrent — un ado qui saute le " +
    "petit-déjeuner, un petit qui goûte l’après-midi. C’est l’habitude, pas la " +
    "semaine : les repas que quelqu’un saute vraiment — un déplacement, un " +
    "dîner dehors, un week-end ailleurs — se décochent au moment de construire " +
    "ce plan-là.",
  "setup.table.house_label": "La maison",
  "setup.table.same_as_house": "Mange aux mêmes moments que la maison.",
  // ── LE RÉGIME, PAR BOUCHE ────────────────────────────────────────────
  // Volontairement PLUS COURT que `setup.people.diet_hint`: la règle est
  // déjà énoncée en tête de l'étape, sur la ligne du titulaire. La répéter
  // mot pour mot sous chaque prénom ferait lire trois fois la même phrase.
  // Ce qui reste est ce que seule CETTE ligne peut dire.
  "setup.table.diet_label": "Comment cette personne mange",
  "setup.table.diet_hint":
    "Le plat commun suit la ligne la plus stricte de la table. Rien de coché veut dire qu'on n'a pas demandé.",
  // ── LES MOMENTS, AVEC LEUR TAILLE (2026-08-14) — voir `en.ts` ────────
  "setup.table.moments_label": "Quand cette personne mange",
  "setup.table.moments_hint":
    "Cochez les moments où elle mange vraiment, et dites si c’est un gros ou un " +
    "petit repas. Laissez la taille de côté quand ça n’a pas d’importance — " +
    "rien n’est supposé d’un blanc.",
  "setup.table.size_small": "Petit",
  "setup.table.size_medium": "Moyen",
  "setup.table.size_large": "Gros",
  // ── LA LIGNE LIBRE (2026-08-14) — voir `en.ts` ───────────────────────
  // ⚠️ PAS « Ce qu’elle mange d’habitude »: c'est MOT POUR MOT le titre du
  // cadre qu'on retire (`household.habits.title`) — voir `en.ts`.
  "setup.table.note_label": "Ses préférences, en toutes lettres",
  "setup.table.note_hint":
    "En toutes lettres, et gardé pour de bon — relu à chaque fois qu’on " +
    "compose. Habitudes, goûts, ce à quoi elle ne touche jamais.",
  "setup.table.note_placeholder":
    "Le matin des fruits, une pizza le vendredi soir, le samedi midi ce que je viens d’acheter au marché.",
  "setup.table.from_profile":
    "Cette personne a son compte — ses moments sont dans ses réglages à elle.",
  // ── LES MOYENS DE CUISSON, AU NIVEAU DU FOYER (2026-08-18) ──────────────
  // « Plaques » et pas « cuisinière »: la question est le FEU, pas le meuble —
  // induction, gaz ou vitrocéramique répondent oui, et une plaque posée sur un
  // plan de travail aussi.
  "setup.equipment.title": "Avec quoi tu cuisines",
  "setup.equipment.intro":
    "Demandé une fois, pour toute la cuisine — elle est partagée, ce n’est donc pas une question par personne.",
  "setup.equipment.legend": "Ta cuisine",
  "setup.equipment.hint": "Coche ce que tu as vraiment. Un congélateur décide si on peut cuisiner une fois et garder le reste ; un micro-ondes décide de ce que « à réchauffer » veut dire le jour même. Sans réponse, rien ne change.",
  "setup.equipment.tool_oven": "Four",
  "setup.equipment.tool_stovetop": "Plaques",
  "setup.equipment.tool_microwave": "Micro-ondes",
  "setup.equipment.tool_freezer": "Congélateur",
  "setup.equipment.tool_air_fryer": "Air fryer",
  "setup.equipment.tool_pressure_cooker": "Autocuiseur",
  "setup.equipment.tool_blender": "Blender ou robot",
  "setup.equipment.save": "Enregistrer",
  "setup.equipment.saving": "Enregistrement…",
  "setup.equipment.saved": "Enregistré. Le prochain plan est bâti là-dessus.",
  "setup.equipment.error_empty":
    "Cochez-en au moins un — sans aucun des sept, il n’y a rien pour cuisiner. " +
    "Si vous préférez ne rien dire, laissez la ligne telle quelle.",
  "setup.equipment.loading": "Lecture de ce que vous avez déjà dit…",
  "setup.equipment.no_goal":
    "Renseignez d’abord votre objectif au-dessus, ensuite ceci pourra être enregistré.",
  // ── LE DÉJEUNER DE LA SEMAINE (L6, §2.2) ────────────────────────────────
  // ⚠️ AUCUNE PHRASE NE DIT « IL » NI « ELLE » : la question NOMME la personne
  // ({name}), ce qui évite d’avoir à connaître son genre pour poser une
  // question qui n’en dépend pas.
  // ⚠️ DEPUIS LE 2026-09-03 (A6, P6), LA CARTE VIT SUR /app/household, DANS
  // LA FICHE DE CHAQUE BOUCHE, juste au-dessus de sa grille — plus à l'étape 3.
  // Le namespace est GARDÉ (D6.3) ; les phrases qui disaient « à l’étape
  // suivante » sont réécrites en place (listées dans le bloc chantier-0903/FOYER).
  "setup.work_lunch.title": "Le déjeuner en semaine",
  "setup.work_lunch.intro":
    "Qui mange loin de la cuisine à midi change ce que le plan doit cuisiner. " +
    "Sa semaine, juste en dessous, garde le dernier mot.",
  "setup.work_lunch.loading": "Lecture de ce que vous avez déjà dit…",
  "setup.work_lunch.at_work": "En semaine, est-ce que {name} déjeune au bureau ?",
  "setup.work_lunch.yes": "Oui",
  "setup.work_lunch.no": "Non",
  "setup.work_lunch.mode": "Est-ce que {name} emporte une gamelle, ou mange dehors ?",
  "setup.work_lunch.mode_lunchbox": "Une gamelle",
  "setup.work_lunch.mode_outside": "Mange dehors",
  "setup.work_lunch.microwave": "Y a-t-il un micro-ondes au bureau ?",
  "setup.work_lunch.lunchbox_note":
    "Le plan compose ces déjeuners, et les rend transportables.",
  "setup.work_lunch.cold_note":
    "Sans micro-ondes, ces déjeuners doivent être bons froids. Le plan les " +
    "compose comme ça.",
  "setup.work_lunch.outside_note":
    "{n} midis de semaine sont cochés « dehors » dans sa semaine, juste en " +
    "dessous. Le plan ne les compose pas — il dit combien viser.",
  "setup.work_lunch.grid_wins":
    "Rien n’est décidé ici. C’est la grille jour par jour de sa semaine, juste " +
    "en dessous, qui gagne, repas par repas.",
  "setup.request.title": "Ce plan-ci",
  "setup.request.from": "Du",
  "setup.request.to": "Au",
  "setup.plan.rhythm": "Quand vous mangez",
  "setup.plan.rhythm_hint": "Seuls les moments que vous cochez sont composés.",
  "setup.plan.time": "Combien de temps dure une session de cuisine",
  "setup.plan.time_minutes": "{n} min",
  "setup.plan.time_hours": "{n} h",
  "setup.plan.time_hint":
    "En gros. C’est un ordre de grandeur, pas un chronomètre.",
  "setup.plan.budget": "Budget de ce plan",
  "setup.plan.compose": "Construire mon premier plan",
  "setup.plan.composing": "Construction en cours…",
  // Les huit phrases de l'attente — voir la note d'`en.ts`.
  "setup.plan.composing_1": "On regarde qui mange à votre table…",
  "setup.plan.composing_2": "On dimensionne la part de chacun…",
  "setup.plan.composing_3": "On écarte ce que personne ici ne peut manger…",
  "setup.plan.composing_4": "On choisit les plats de vos moments…",
  "setup.plan.composing_5": "On les regroupe en sessions de cuisine…",
  "setup.plan.composing_6": "On vérifie que la semaine tient debout…",
  "setup.plan.composing_7": "On additionne la liste de courses…",
  "setup.plan.composing_8": "On écrit pourquoi chaque choix a été fait…",
  "setup.plan.compose_hint": "Ça le compose. L’écran suivant est le plan lui-même.",
  "setup.missing.title": "Avant de pouvoir le construire",
  "setup.missing.for_you": "Vous",
  "setup.missing.before_next": "Avant de continuer",
  "setup.missing.household_size": "Dites-nous pour combien de personnes vous cuisinez.",
  "setup.missing.own_first_name": "Votre prénom — c’est avec lui que le plan nomme votre part.",
  "setup.missing.own_birth_date": "Votre date de naissance.",
  "setup.missing.own_height_cm": "Votre taille, pour que vos parts soient les vôtres.",
  "setup.missing.own_gender": "Votre sexe, pour que vos parts soient les vôtres.",
  "setup.missing.own_weight_kg":
    "Votre poids. Sans un premier point, rien ne pourra dire plus tard si vous perdez trop vite.",
  "setup.missing.own_goal": "Ce que vous visez. Rien ne peut être composé sans ça.",
  "setup.missing.own_diet":
    "Comment vous mangez — « je mange de tout » est une réponse. Sans ça, un plan " +
    "entier peut être inutilisable dès le premier soir.",
  "setup.missing.own_allergies": "Si vous avez des allergies — « aucune » compte comme une réponse.",
  "setup.missing.member_first_name":
    "Un prénom pour chaque personne à table. Sans lui, sa part disparaît du plan sans un mot.",
  "setup.missing.member_birth_date": "Une date de naissance pour chaque personne à table.",
  "setup.missing.member_body":
    "Taille, poids et sexe pour chaque personne à table. Sans les trois, cette personne est servie comme tout le monde — le plan ne peut pas dimensionner sa part.",
  "setup.missing.member_goal": "Une direction pour chaque adulte à table.",
  "setup.missing.member_allergies":
    "Si chaque personne a des allergies — « aucune » compte comme une réponse.",
  "setup.missing.adult_without_birth_date":
    "Quelqu’un a une direction mais pas de date de naissance. Une direction ne s’applique qu’à un âge connu, donc en l’état cette personne recevrait une part standard et rien ne le dirait.",
  // ⚠️ « INSCRIT·E », PUIS « CONTINUER NE L'ENREGISTRE PAS » — voir la note
  // d'`en.ts`: un contresens sur le modèle, et un avertissement qui avouait un
  // geste mal placé. Les deux sont partis le 2026-08-15.
  "setup.mouths.held_typed":
    "{name} n’est pas encore enregistré·e : sa fiche est à l’écran, pas dans le foyer. « Ajouter » comme « Continuer » l’enregistrent.",
  "setup.mouths.held_one":
    "Il manque encore une personne : vous avez répondu « {answer} » à la première question.",
  "setup.mouths.held_many":
    "Il manque encore {n} personnes : vous avez répondu « {answer} » à la première question.",
  "setup.mouths.held_exit":
    "Vous êtes moins nombreux que prévu ? Revenez à la première question pour changer votre réponse.",
  "setup.missing.missing_mouths": "Ajoutez les autres personnes qui mangent ici.",
  "setup.missing.too_many_mouths": "Huit, c’est le maximum d’un foyer, vous compris.",
  // ⚠️ « CETTE MAISON » A DISPARU LE 2026-08-14 — voir `en.ts`.
  "setup.missing.eating_rhythm": "Les moments où vous mangez, sur votre carte.",
  "setup.missing.cook_days": "Les jours où vous cuisinez.",
  "setup.missing.cooking_time_min": "Combien de temps dure une session de cuisine.",
  "setup.missing.budget_amount": "Combien ce plan peut coûter.",
  "setup.missing.member_eating_rhythm":
    "Quand chacun mange, si ce n’est pas comme la maison.",

  // Les trois directions, dans les mots de la personne qui répond — pas ceux d'un
  // nutritionniste. « Perdre du poids » et pas « fat_loss », qui est le jeton
  // stocké et n'a rien à faire à l'écran.
  "setup.goal.fat_loss": "Perdre du poids",
  "setup.goal.muscle_gain": "Prendre du muscle",
  "setup.goal.maintenance": "Maintenir un poids stable",
  "setup.occasion.breakfast": "Petit-déjeuner",
  "setup.occasion.snack_am": "Milieu de matinée",
  "setup.occasion.lunch": "Déjeuner",
  "setup.occasion.snack_pm": "Après-midi",
  "setup.occasion.dinner": "Dîner",
  "setup.occasion.before_bed": "Avant de dormir",
  // Sept cases côte à côte sur un téléphone: l'abrégé français fait trois
  // lettres comme l'anglais.
  "setup.day.mon": "Lun",
  "setup.day.tue": "Mar",
  "setup.day.wed": "Mer",
  "setup.day.thu": "Jeu",
  "setup.day.fri": "Ven",
  "setup.day.sat": "Sam",
  "setup.day.sun": "Dim",
  "setup.missing.cooking_style": "Dis-nous comment tu veux cuisiner",
  "setup.missing.grocery_runs": "Dis-nous combien de courses tu acceptes",
  "setup.missing.kitchen_equipment": "Dis-nous avec quoi tu cuisines",
} satisfies TranslatedMessagesOf<"setup">;
