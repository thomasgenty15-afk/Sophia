// Pack français — le namespace `today`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `today.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frToday = {
  // ══ /app/today — LA JOURNÉE (lot 4) ══════════════════════════════════════
  // ⚠️ AUCUNE PHRASE ICI NE DOIT FAIRE ATTENDRE L'ÉLÈVE. Le coach écrit une
  // MÉTHODE, pas la semaine de chacun: « ton coach prépare ton plan » serait
  // faux, et un écran vide qui dit « attends » à quelqu'un dont c'est le tour
  // est pire qu'un écran vide. La sortie est `/app/plan`, où il compose.
  // Voir docs/keel/MODEL.md.
  "today.title": "Aujourd’hui",
  "today.greeting": "Salut {name}",
  "today.empty": "Rien de prévu aujourd’hui. Profite de ta journée de repos.",
  // Le bouton et la pastille se répondent, à la PREMIÈRE PERSONNE et au passé:
  // c’est l’élève qui rapporte un fait, pas le produit qui lui fait valider une
  // consigne. Même registre que « J’ai mangé ça » sur la case des repas.
  "today.log_button": "C’est fait",
  "today.logged_badge": "Fait",
  "today.flex_button": "Déclarer un écart",
  // Tourné pour que le nombre arrive en dernier: « 1 jours d’écart restants »
  // aurait demandé une paire singulier/pluriel pour un compteur qu’on lit d’un
  // coup d’œil.
  "today.flex_remaining": "Jours d’écart restants cette semaine : {count}",
  // Un trou et rien d’autre — inscrit dans la liste d’exceptions de
  // `parity.int.test.ts` pour cette raison.
  "today.slot_header": "{slot}",
  "today.loading": "Chargement de ta journée…",
  "today.error": "Impossible de charger ta journée. Recharge la page pour réessayer.",
  "today.no_plan_title": "Tu n’as pas encore de plan pour cette semaine",
  "today.no_plan_body":
    "Dis ce que tu cherches, et ton plan de la semaine se compose à partir de là — les repas, les courses et les sessions de cuisine.",
  "today.no_plan_cta": "Construire mon plan de la semaine",
  "today.own_week_badge": "Ta semaine",
  "today.own_week_hint":
    "Ces lignes, c’est toi qui les as posées. Rien ici n’est noté — c’est un rappel, pas un examen.",
  "today.own_week_empty":
    "Rien de posé pour aujourd’hui. Les lignes ci-dessous tiennent sur toute la semaine.",
  "today.own_week_nothing":
    "Rien de posé pour aujourd’hui. Profites-en — une journée vide, tu avais le droit de la choisir.",
  "today.own_week_anyday": "Cette semaine, sans jour fixe",
  "today.own_week_from_coach": "De la méthode de ton coach",
  "today.own_week_from_sophia": "Proposé par Sophia",
  "today.own_week_open_plan": "Ouvrir mon plan de la semaine",
  // Deux sections nommées différemment parce que ce sont deux objets: un plat
  // se cuisine, une ligne de méthode se tient.
  "today.own_meals_label": "Ce que tu manges aujourd’hui",
  "today.own_meals_empty": "Rien aujourd’hui",
  "today.own_meals_other_days": "Rien aujourd’hui",
  "today.own_meals_anyday": "Construit pour aucun jour en particulier",
  // ── LES PHOTOS DU JOUR ─────────────────────────────────────────────────
  // La section reste quand il n’y en a aucune: c’est la PLACE de la photo
  // qu’on montre. Un bloc qui s’efface les jours sans photo apprend à ne plus
  // le chercher les jours où on en a pris une.
  "today.photos_label": "Tes photos d’aujourd’hui",
  "today.photos_empty": "Aucune photo",
  "today.own_lines_label": "Ce que tu t’es fixé",
  "today.week_section": "Cette semaine, sans jour fixe",
  "today.week_section_hint":
    "Ces lignes se tiennent n’importe quel jour avant la fin de la semaine.",
  "today.free_section": "Sans horaire",
  "today.family_tally_label": "Aujourd’hui, domaine par domaine",
  "today.family_tally_kept": "{kept}/{total} tenues",
  "today.family_tally_lines": "{count} aujourd’hui",
  "today.log_pending": "Enregistrement…",
  "today.logged_count": "Fait {count}× aujourd’hui",
  "today.instruction_label": "De ton coach",
  "today.evidence_photo": "Ton coach a demandé une photo sur celle-ci.",
  "today.auto_source": "Lu depuis ton {source}. Un silence ne compte jamais comme un manqué.",
  "today.outcome_only": "Suivi, pas noté.",
  "today.deviation_banner":
    "Écart déclaré pour aujourd’hui : {kind}. Cette journée sort du décompte.",
  "today.deviation_banner_slot": "Écart déclaré pour {slot} : {kind}.",
  "today.covered_by_deviation": "Couvert par l’écart que tu as déclaré.",
  "today.log_error": "Ça n’a pas été enregistré. Rien n’a été noté — réessaie.",
  "today.coverage_label": "Jours notés cette semaine",
  "today.coverage_value": "{logged} sur {total}",
  "today.insufficient_data": "Données insuffisantes",
  "today.insufficient_data_hint":
    "L’adhérence reste masquée tant que {min} jours de la semaine ne sont pas notés. C’est la règle, pas une punition.",
} satisfies TranslatedMessagesOf<"today">;
