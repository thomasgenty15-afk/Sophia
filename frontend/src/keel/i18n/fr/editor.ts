// Pack français — le namespace `editor`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `editor.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frEditor = {
  // ── L'éditeur d'engagement et la bibliothèque de modèles ─────────────────
  // Éditeur d’engagement — un contrôle par axe de plan_commitments
  "editor.axis_identity": "Ce que c’est",
  "editor.axis_anchor": "Quand",
  "editor.axis_level": "Combien",
  "editor.axis_evidence": "Comment c’est prouvé",
  "editor.axis_cadence": "À quelle fréquence",
  "editor.axis_governance": "Quelle rigueur",
  "editor.title": "Titre",
  "editor.template_key": "Clé de modèle",
  "editor.student_instruction": "Consigne à l’élève (reprise mot pour mot)",
  "editor.content_locale": "Langue de ce texte",
  "editor.polarity": "Polarité",
  "editor.activity_class": "Classe",
  "editor.anchor_kind": "Ancrage",
  "editor.slot_key": "Créneau",
  "editor.clock_local": "Heure",
  "editor.tolerance_minutes": "Tolérance (min)",
  "editor.window_start_local": "Début de fenêtre",
  "editor.window_end_local": "Fin de fenêtre",
  "editor.measure": "Mesure",
  "editor.unit": "Unité",
  "editor.target_op": "Comparateur",
  // « Min » et « Max » s’écrivent pareil dans les deux langues: la forme longue
  // est le seul moyen d’avoir une valeur française, et la colonne du formulaire
  // est assez large pour la porter.
  "editor.target_min": "Minimum",
  "editor.target_max": "Maximum",
  "editor.substance_ref": "Substance",
  "editor.food_group_ref": "Groupe d’aliments",
  "editor.evidence_kind": "Preuve",
  "editor.evidence_required": "Preuve obligatoire",
  "editor.auto_source": "Appareil source",
  "editor.counts_toward_adherence": "Compte dans l’adhérence",
  "editor.counts_hint": "Décoché : suivi comme un résultat mesuré, jamais compté.",
  // « Grain » s’écrit pareil dans les deux langues, mais il a un homonyme
  // encombrant sur un écran de nutrition (le grain de céréale). « Granularité »
  // est le mot du métier, sans ambiguïté, et il évite une exception de plus dans
  // `legitimatelyIdentical`. « Substance » juste au-dessus, elle, y reste: c’est
  // le mot français exact, et le seed porte déjà un namespace `substance.*`.
  "editor.evaluation_grain": "Granularité",
  "editor.slot_kind": "Type de créneau",
  "editor.scheduled_days": "Jours",
  "editor.required_days_per_week": "Jours requis par semaine",
  "editor.required_days_hint": "C’est le dénominateur de l’adhérence.",
  "editor.expected_occasions_per_day": "Occasions par jour",
  "editor.priority": "Priorité",
  "editor.autonomy": "Autonomie",
  "editor.flex_eligible": "Éligible aux jours d’écart",
  // L’option vide d’un <select>: on garde exactement la forme typographique de
  // l’anglais, cadratins et espaces compris.
  "editor.none_option": "— aucun —",
  "editor.vocabulary_error":
    "Les vocabulaires n’ont pas pu être chargés : aucun sélecteur n’est fiable. {message}",
} satisfies TranslatedMessagesOf<"editor">;
