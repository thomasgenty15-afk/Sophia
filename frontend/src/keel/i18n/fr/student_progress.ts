// Pack français — le namespace `student_progress`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `student_progress.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frStudentProgress = {
  // ══════════════════════════════════════════════════════════════════════════
  // LOT 6 · `/app/progress` — L'AVANCÉE DE L'ÉLÈVE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Le tutoiement, comme partout dans l'app de l'élève: Sophia s'adresse à la
  // personne qu'elle suit tous les jours, pas à un prospect.
  "student_progress.title": "Mes progrès",
  "student_progress.loading": "Chargement…",
  "student_progress.error": "Impossible de charger tes données.",
  "student_progress.restricted":
    "On met les chiffres de côté pour l’instant. Ce qui compte cette semaine, c’est comment tu te sens.",
  "student_progress.range_week": "7 jours",
  "student_progress.range_month": "30 jours",

  "student_progress.consistency.label": "Ta régularité",
  "student_progress.consistency.out_of": "/ {total} jours",
  "student_progress.consistency.hint":
    "C’est ce qui compte le plus, et de loin. Pas la perfection des journées — le simple fait de les avoir notées.",

  "student_progress.pulse.label": "Comment ça s’est passé",
  "student_progress.pulse.empty": "Aucun point du soir sur cette période pour l’instant.",
  "student_progress.pulse.good": "{count} tout va bien",
  "student_progress.pulse.mixed": "{count} moyen",
  "student_progress.pulse.hard": "{count} difficile",
  "student_progress.pulse.dominant_label": "Quand c’est dur, c’est le plus souvent",
  // Les trois axes du tap du soir, sous leur forme DANS une phrase: « c’est le
  // plus souvent la faim ». L'article est dans la valeur, parce que le genre
  // change d'un axe à l'autre.
  "student_progress.axis.energy": "l’énergie",
  "student_progress.axis.hunger": "la faim",
  "student_progress.axis.sleep": "le sommeil",

  "student_progress.food.label_week": "Ta semaine dans l’assiette",
  "student_progress.food.label_month": "Ton mois dans l’assiette",
  "student_progress.food.empty":
    "Aucune photo lue sur cette période pour l’instant. Envoie une assiette dans la conversation, et ça commence à s’accumuler ici.",
  // L'accord du participe suit le compte: « 1 repas noté », « 5 repas notés ».
  "student_progress.food.meals_one": "{count} repas noté",
  "student_progress.food.meals_many": "{count} repas notés",
  "student_progress.food.across": "sur",
  "student_progress.food.days_one": "{count} jour",
  "student_progress.food.days_many": "{count} jours",
  "student_progress.food.groups":
    "Des légumes à {veg} repas sur {meals} · des protéines à {protein} · des fruits à {fruit}.",
  "student_progress.food.three_counts":
    "Cochés comme prévu : {ticked} · mangés hors plan : {offPlan} · photographiés : {photographed}.",
  "student_progress.food.seen_most": "Le plus vu : {list}",
  "student_progress.food.also": "Aussi sur cette période : {list}",
  "student_progress.food.dinners_large": "Des dîners copieux {large} soirs sur {total}.",
  "student_progress.food.missing_days": "Rien de noté {days}.",
  "student_progress.food.veg_up": "Plus de légumes que la semaine d’avant.",
  "student_progress.food.veg_down": "Moins de légumes que la semaine d’avant.",
  "student_progress.food.veg_same": "À peu près autant de légumes que la semaine d’avant.",
  "student_progress.food.footnote":
    "Ces comptes viennent de tes photos — ce qui est apparu, et à quelle fréquence. Aucune calorie ici : c’est le fait de noter qui change les choses.",

  "student_progress.ate.label": "Ce que tu as mangé",
  "student_progress.ate.empty":
    "Rien de noté sur cette période pour l’instant. Envoie une assiette dans la conversation, ou dis-moi simplement ce que tu as pris — les deux arrivent ici.",
  "student_progress.ate.unreadable": "noté, rien de lisible sur la photo",
  "student_progress.ate.footnote":
    "Voilà ce qui a été lu de tes photos et de ce que tu m’as dit. Si quelque chose est faux, dis-le dans la conversation et c’est corrigé sur-le-champ.",
  "student_progress.band.small": "petite portion",
  "student_progress.band.moderate": "portion normale",
  "student_progress.band.large": "grosse portion",

  "student_progress.rhythm.label": "Ton rythme",
  "student_progress.rhythm.empty":
    "Rien de noté sur cette période pour l’instant. Dis-moi ce que tu as mangé dans la conversation, ou envoie une assiette — les deux atterrissent ici.",
  "student_progress.rhythm.cell_empty": "rien de noté",
  "student_progress.rhythm.cell_count": "{count} noté",
  "student_progress.rhythm.busiest_label": "L’essentiel de ce que tu notes tombe",
  "student_progress.rhythm.unplaced_one":
    "{count} fait sans heure — pas placé dans la grille.",
  "student_progress.rhythm.unplaced_many":
    "{count} faits sans heure — pas placés dans la grille.",
  "student_progress.rhythm.footnote":
    "La taille du bloc dit à quel point l’assiette avait l’air remplie — petite, normale ou grosse. C’est toute l’échelle, et c’est volontaire : un chiffre ici serait faux dans une direction qu’on sait prévoir.",

  "student_progress.plates.label": "Tes assiettes",
  "student_progress.plates.empty": "Aucune photo lue sur cette période.",
  "student_progress.plates.line_one":
    "{count} assiette : {small} petite, {moderate} normale, {large} grosse",
  "student_progress.plates.line_many":
    "{count} assiettes : {small} petites, {moderate} normales, {large} grosses",
  "student_progress.plates.unclear_suffix": ", {count} indéterminées",

  "student_progress.weight.label": "Ton poids",
  "student_progress.weight.empty":
    "Aucun poids sur cette période pour l’instant. Tu le saisis au point du dimanche.",
  "student_progress.weight.delta": "{delta} kg sur la période",
  "student_progress.weight.footnote":
    "Une pesée par semaine, lue comme une ligne et non comme un chiffre : d’un jour à l’autre, l’eau fait bouger la balance plus qu’une semaine entière d’alimentation.",

  // ── 5. LES SÉANCES — UN COMPTE, ET RIEN QUI EN DÉRIVE (L2b, 2026-08-18) ──
  // ⛔ Aucune calorie ici, dans aucune des deux langues. Voir le bloc jumeau
  // d'`en.ts` pour les nombres qui portent la décision.
  "student_progress.activity.label": "Tes séances",
  "student_progress.activity.empty":
    "Rien de noté sur cette période. Si tu as bougé, ajoute-le ci-dessous — ça reste un compte, et rien de ton plan ne change à cause de ça.",
  "student_progress.activity.sessions_one": "{count} séance notée",
  "student_progress.activity.sessions_many": "{count} séances notées",
  "student_progress.activity.across": "sur",
  "student_progress.activity.days_one": "{count} jour",
  "student_progress.activity.days_many": "{count} jours",
  "student_progress.activity.minutes": "{minutes} min au total, déclarées sur {from} d’entre elles.",
  "student_progress.activity.by_intensity": "Intensité : {list}",
  "student_progress.activity.intensity.easy": "facile",
  "student_progress.activity.intensity.moderate": "modérée",
  "student_progress.activity.intensity.hard": "dure",
  "student_progress.activity.intensity.undeclared": "non dite",
  "student_progress.activity.kind.daily_movement": "Mouvement du quotidien",
  "student_progress.activity.kind.strength": "Renforcement",
  // ⚠️ IDENTIQUE À L'ANGLAIS, ET C'EST LA RÉPONSE JUSTE. « Cardio » s'écrit
  // pareil dans les deux langues; le « traduire » demanderait d'inventer une
  // différence. L'exception est déclarée dans `parity.int.test.ts`, visible en
  // diff, comme les trois pays et les deux noms de langue.
  "student_progress.activity.kind.cardio": "Cardio",
  "student_progress.activity.kind.recovery": "Récupération",
  "student_progress.activity.kind.mobility": "Mobilité",
  "student_progress.activity.duration": "{count} min",
  "student_progress.activity.remove": "Retirer",
  "student_progress.activity.removing": "Retrait…",
  "student_progress.activity.footnote":
    "Un compte, et rien qui en dérive. Aucune calorie : une séance que tu déclares est fausse de 30 à 50 %, donc la retirer de la journée rendrait la journée moins sûre, pas plus.",

  // ── LA SAISIE ────────────────────────────────────────────────────────────
  "student_progress.activity.form.label": "Noter une séance",
  "student_progress.activity.form.date": "Jour",
  "student_progress.activity.form.kind": "C’était quoi ?",
  "student_progress.activity.form.kind_placeholder": "Choisis…",
  "student_progress.activity.form.duration": "Combien de temps ? Facultatif.",
  "student_progress.activity.form.duration_placeholder": "minutes",
  "student_progress.activity.form.intensity": "À quelle intensité ? Facultatif.",
  "student_progress.activity.form.intensity_none": "Je ne dis pas",
  "student_progress.activity.form.submit": "Noter",
  "student_progress.activity.form.saving": "Enregistrement…",
  "student_progress.activity.form.error": "Rien n’a été enregistré. {message}",
  "student_progress.activity.form.duration_range":
    "Les minutes doivent être un nombre entier entre {min} et {max}.",
  "student_progress.journal.target": "Ton repère quotidien",
  "student_progress.journal.target_goal_down": "Objectif de perte de poids",
  "student_progress.journal.target_goal_up": "Objectif de prise de poids",
  "student_progress.journal.target_goal_other": "Repère énergétique quotidien",
  "student_progress.journal.target_date": "Calculé à partir de ta mesure du {date}",
  // ── LE DÉTAIL DU CALCUL — 2026-09-21 ────────────────────────────────────
  // Demandé à l'écran: « un bouton Détail qui permette de donner le détail du
  // calcul de manière carrée, comme ça c'est transparent ».
  //
  // ⛔ AUCUNE DE CES PHRASES NE PORTE DE VERDICT NI DE RESTE. Ce sont les
  // étapes d'un calcul, dans l'ordre où il se fait. « Il te reste N kcal » est
  // la phrase d'un tracker, et elle n'existe sur aucun de ces libellés.
  "student_progress.journal.detail": "Détail",
  "student_progress.journal.detail_close": "Fermer le détail",
  "student_progress.journal.detail_title": "D'où vient ce nombre",
  "student_progress.journal.detail_weight": "Ta pesée",
  // ⛔ 2026-09-21 — JAMAIS RENDUE. Sa ligne a été refusée par le détecteur
  // de coutures: elle demandait `setup.activity.*`, hors des namespaces
  // déclarés par `/app/progress`. Gardée pour la parité, et parce que la
  // ligne revient si un jour cette page déclare `setup`.
  "student_progress.journal.detail_activity": "Tes journées",
  // La ligne du raccourci: « 30 à 33 kcal par kilo ». Elle n'apparaît QUE sur
  // la chaîne du poids — sur l'équation du corps, l'activité entre par un
  // facteur, et afficher un kcal/kg ferait lire une multiplication qui n'a pas
  // eu lieu.
  "student_progress.journal.detail_per_kg": "Par kilo",
  "student_progress.journal.detail_per_kg_value": "{low} à {high} kcal",
  "student_progress.journal.detail_maintenance": "Ton entretien estimé",
  "student_progress.journal.detail_delta": "Ton objectif",
  "student_progress.journal.detail_total": "Ton repère",
  // Les deux chaînes, nommées. Quelqu'un qui compare deux comptes doit
  // pouvoir voir que ce ne sont pas les mêmes étapes.
  "student_progress.journal.detail_chain_body_equation":
    "Calculé sur ton corps — ta taille, ton poids, ton âge, ton sexe et tes journées.",
  "student_progress.journal.detail_chain_weight_per_kg":
    "Calculé sur ton poids et tes journées. On passera par ton corps entier dès qu'on connaîtra ta taille et ta date de naissance.",
  // ⚠️ LA RÉSERVE EST DANS LE PANNEAU, PAS SOUS LE CHIFFRE. Une fourchette
  // reste une estimation, et le dire à côté du calcul est le seul endroit où
  // ça ne se lit pas comme une excuse.
  "student_progress.journal.detail_reserve":
    "C'est une estimation, pas une mesure. Deux corps identiques sur le papier ne dépensent pas la même chose — d'où une fourchette, et pas un chiffre.",
  "student_progress.journal.target_missing": "Ton repère quotidien n’est pas encore disponible.",
  "student_progress.journal.week": "Ta semaine dans l’assiette",
  "student_progress.journal.previous": "Semaine précédente",
  "student_progress.journal.next": "Semaine suivante",
  "student_progress.journal.today": "Aujourd’hui",
  "student_progress.journal.all": "Toute la semaine",
  "student_progress.journal.day_complete": "Renseignée",
  "student_progress.journal.day_incomplete": "À compléter",
  "student_progress.journal.day_progress": "En cours",
  "student_progress.journal.day_future": "À venir",
  "student_progress.journal.day_free": "Saisie libre",
  "student_progress.journal.empty": "Aucun repas n’est renseigné pour cette journée.",
  "student_progress.journal.add": "Ajouter un repas",
  "student_progress.journal.add_photo": "Ajouter une photo",
  "student_progress.journal.describe": "Décrire",
  "student_progress.journal.skip": "Repas sauté",
  "student_progress.journal.correct": "Corriger",
  "student_progress.journal.planned": "Repas du plan",
  "student_progress.journal.open_plan": "Ouvrir le plan",
  "student_progress.journal.outside": "Hors plan",
  "student_progress.journal.extra": "Repas supplémentaire",
  "student_progress.journal.fixed": "Apport habituel",
  "student_progress.journal.leftovers": "Restes",
  "student_progress.journal.unattached": "À rattacher",
  "student_progress.journal.state_confirmed": "confirmé",
  "student_progress.journal.state_planned": "compté comme prévu",
  "student_progress.journal.state_missing": "rien de renseigné",
  "student_progress.journal.state_skipped": "pas mangé",
  "student_progress.journal.state_future": "à venir",
  "student_progress.journal.planned_kcal": "{kcal} kcal prévues",
  "student_progress.journal.reported_kcal": "{kcal} kcal renseignées",
  "student_progress.journal.reported_estimated": "Environ {kcal} kcal renseignées",
  "student_progress.journal.subtotal": "Sous-total renseigné : {kcal} kcal",
  "student_progress.journal.total": "Total renseigné : {kcal} kcal",
  "student_progress.journal.incomplete_note": "Les repas encore inconnus ne sont pas inclus dans ce chiffre.",
  "student_progress.journal.no_total": "Aucun total calorique n’est disponible pour les repas renseignés.",
  "student_progress.journal.analysis_unavailable": "Repas enregistré ; l’estimation calorique n’est pas disponible.",
  "student_progress.journal.analysis_pending": "Repas enregistré ; l’analyse est encore en attente.",
  "student_progress.journal.retry": "Relancer l’analyse",
  "student_progress.journal.readonly": "Les repas de plus de 14 jours restent visibles, mais ne peuvent plus être modifiés.",
  "student_progress.journal.dialog_title": "Renseigner ce repas",
  "student_progress.journal.dialog_date": "Date du repas",
  "student_progress.journal.dialog_slot": "Moment de la journée",
  "student_progress.journal.dialog_prompt": "Décris ce que tu as mangé, avec tes mots.",
  "student_progress.journal.dialog_placeholder": "Par exemple : une salade, du pain et un yaourt",
  "student_progress.journal.dialog_relation": "Par rapport au plan",
  "student_progress.journal.dialog_as_planned": "C’est le repas du plan",
  "student_progress.journal.dialog_replacement": "J’ai mangé ceci à la place",
  "student_progress.journal.dialog_outside": "Repas hors plan",
  "student_progress.journal.dialog_extra": "Quelque chose en plus",
  "student_progress.journal.dialog_save": "Enregistrer",
  "student_progress.journal.dialog_saving": "Enregistrement…",
  "student_progress.journal.photo_saving": "Envoi de la photo…",
  "student_progress.journal.error": "Cette modification n’a pas été enregistrée. {message}",
  "student_progress.journal.error_date_readonly": "Ce repas dépasse la période de correction de 14 jours.",
  "student_progress.journal.error_bad_slot": "Choisis un moment valide dans la journée.",
  "student_progress.journal.error_bad_text": "Ajoute une courte description du repas.",
  "student_progress.journal.error_bad_request": "Cette demande a expiré. Réessaie.",
  "student_progress.journal.error_stale": "Ce repas a changé. Recharge la page puis réessaie.",
  "student_progress.journal.error_unavailable": "Le journal alimentaire est momentanément indisponible.",
  "student_progress.journal.error_analysis_unavailable": "L’analyse ne peut pas être relancée pour le moment.",
  "student_progress.journal.error_unknown": "Réessaie dans un instant.",
  "student_progress.journal.weight": "Ton poids dans le temps",
} satisfies TranslatedMessagesOf<"student_progress">;
