// Pack français — le namespace `week`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `week.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frWeek = {
  // ── La semaine partagée (components/WeekView.tsx) ─────────────────────────
  // ── La semaine partagée (components/WeekView.tsx) ────────────────────────
  // UN SEUL JEU DE PHRASES POUR DEUX LECTEURS: `ProgressPage` (l’élève sur sa
  // propre semaine) et `CoachStudentPage` (le coach sur celle d’un élève)
  // montent le MÊME composant, sans `viewer` ni branche `isCoach`. Donc aucune
  // phrase à la deuxième personne, et aucune qui nomme « l’élève »: elle serait
  // fausse pour l’un des deux lecteurs. Tout reste impersonnel, comme le seed.
  "week.nav.previous": "Semaine précédente",
  "week.nav.next": "Semaine suivante",
  "week.nav.current": "Revenir à cette semaine",
  "week.label": "Semaine {week}, {year}",
  "week.range": "Du {from} au {to}",
  "week.loading": "Chargement de la semaine…",
  "week.error":
    "Cette semaine n’a pas pu être chargée. Rien ne s’affiche : mieux vaut ça qu’une donnée fausse.",
  "week.retry": "Réessayer",
  "week.in_progress":
    "Cette semaine est encore en cours. Les jours à venir ne comptent pas comme manqués.",
  "week.empty": "Rien d’enregistré sur cette semaine.",
  "week.summary_title": "Résumé de la semaine",
  "week.coverage_label": "Jours notés",
  // « 4/7 » s’écrirait à l’identique dans les deux langues. « sur » lève cette
  // collision et reprend `today.coverage_value`, déjà livré côté élève.
  "week.coverage_value": "{count} sur {total}",
  "week.coverage_caption":
    "Les relevés d’abord : au début, c’est le seul chiffre qui prédit quoi que ce soit. Un jour compte à partir de {min} faits notés.",
  "week.run_label": "Plus longue série",
  "week.facts_label": "Faits notés",
  "week.deviations_label": "Écarts déclarés",
  "week.days_title": "Jour par jour",
  // Le nombre passe en DERNIER, ici et sur `highlight_counts`: une seule forme
  // doit servir 0, 1 et 12, et « 1 faits notés » n’existe pas en français.
  "week.day_facts": "faits notés : {count}",
  "week.day_declared": "déclaré",
  "week.highlights_title": "Ce qui a tenu, ce qui a lâché",
  "week.highlight_held": "Le mieux tenu",
  "week.highlight_dropped": "Le plus lâché",
  // « tenus » et pas « faits »: le compte est `met + flexUsed`, pas le statut
  // `met` seul, et le mot répond au titre de la section.
  "week.highlight_counts": "tenus : {met} · en partie : {partial} · manqués : {missed}",
  "week.highlight_none":
    "Aucune ligne n’a assez de jours évalués cette semaine pour être nommée.",
  "week.highlight_locked":
    "Une ligne n’est nommée qu’à partir de {min} jours notés. Cette semaine en compte {logged}.",
  "week.adherence_label": "Adhérence",
  // Règle de produit assumée, pas une panne. On reprend mot pour mot
  // `today.insufficient_data`, qui dit déjà exactement ça sur l’écran du jour.
  "week.adherence_locked": "Données insuffisantes",
  "week.adherence_gate":
    "Un pourcentage demande {min} jours notés ; cette semaine en compte {logged}. En afficher un maintenant mesurerait la saisie, pas la semaine.",
  "week.adherence_no_review":
    "Les relevés suffisent. Le chiffre apparaît une fois le bilan de la semaine établi — rien ne se calcule ici à la volée.",
  "week.lines_title": "Ligne par ligne",
  "week.lines_col_line": "Engagement",
  "week.lines_empty": "Aucune ligne active dans le plan publié.",
  "week.line_weekly": "Ligne hebdomadaire",
  "week.line_off": "Pas au plan ce jour-là",
  "week.line_future": "À venir",
  "week.line_no_row": "Pas encore évalué",
  "week.deviations_title": "Déclarés à l’avance",
  "week.deviations_caption":
    "Déclaré avant le jour, pas avoué après. Hors du dénominateur, pas hors de la semaine.",
  "week.deviations_empty": "Rien de déclaré cette semaine.",
  "week.deviation_entry": "{kind} le {date}",
  // La légende du même écran nomme déjà ce statut « Souplesse utilisée »
  // (`status.flex_used`). Deux mots pour un seul mécanisme sur une même page se
  // lisent comme deux mécanismes: le « jour d’écart » du glossaire cède ici.
  "week.deviation_flex": "souplesse utilisée",
  "week.facts_title": "Ce qui a été noté",
  "week.facts_empty": "Aucun fait enregistré cette semaine.",
  "week.facts_logged": "noté",
  "week.facts_photo": "photo jointe",

  // ⚠️ RAPATRIÉES DE `progress.*`, ET C'EST CE DÉPLACEMENT QUI A RENDU
  // `/coach/clients/:id` TRADUISIBLE — voir la note de ces quatre clés dans
  // `en.ts`. Elles étaient empruntées au namespace d'un écran que plus aucun
  // fichier du dépôt n'importe.
  "week.adherence_overall": "Ensemble",
  "week.adherence_core": "Engagements principaux",
  "week.days_value": "{count} jours",
  "week.day_value": "{count} jour",
} satisfies TranslatedMessagesOf<"week">;
