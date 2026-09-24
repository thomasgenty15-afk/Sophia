// Pack français — le namespace `templates`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `templates.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frTemplates = {
  // Bibliothèque de modèles (plan_templates)
  "templates.title": "Tes modèles de plan",
  // « a clone plus a diff »: « écart » est déjà pris par les jours d’écart et les
  // déviations déclarées, donc « différences » — le fait tient, le mot ne se
  // télescope pas avec un autre écran.
  "templates.subtitle":
    "C’est ici que tu travailles. Un modèle s’importe une fois ; le plan de chaque élève en est un clone, plus ses différences.",
  "templates.new": "Nouveau modèle",
  "templates.empty": "Aucun modèle pour l’instant. Importe un plan, ou pars d’un modèle vide.",
  "templates.select_hint": "Ouvre un modèle à gauche, ou commences-en un nouveau.",
  "templates.loading": "Chargement de ta bibliothèque…",
  "templates.error": "Ta bibliothèque n’a pas pu être chargée. {message}",
  // Le seed anglais rend « 1 lines » sur un modèle d’une ligne. Le français
  // retourne la phrase plutôt que d’accorder un pluriel qu’aucun moteur ne gère
  // ici — même geste que `today.flex_remaining`.
  "templates.commitment_count": "Lignes : {count}",
  "templates.status_draft": "Brouillon",
  "templates.status_active": "Actif",
  "templates.status_archived": "Archivé",
  "templates.updated": "Modifié le {date}",
  "templates.open": "Ouvrir",
  "templates.save": "Enregistrer",
  "templates.saving": "Enregistrement…",
  "templates.delete": "Supprimer",
  "templates.delete_confirm": "Supprimer ce brouillon de modèle ? C’est définitif.",
  "templates.field_title": "Nom",
  "templates.field_description": "Description",
  "templates.field_locale": "Langue de ce modèle",
  "templates.field_status": "Statut",
  "templates.field_flex": "Jours d’écart par semaine",
  "templates.field_target": "Objectif d’adhérence (%)",
  "templates.field_autonomy": "Autonomie par défaut",
  "templates.swap_title": "Règle d’échange par défaut",
  "templates.swap_hint":
    "Coché une seule fois, ici, pour tout le modèle. Une règle, pas un menu : c’est là-dessus que l’évaluateur tranche les échanges.",
  "templates.swap_class_equivalent": "Autoriser tout groupe d’aliments de la même classe",
  "templates.swap_allowed_groups": "Ou limiter les échanges à ces groupes",
  "templates.publish": "Publier pour l’élève",
  "templates.approve_lines": "J’approuve ces lignes pour cet élève",
  "templates.publishing": "Publication…",
  "templates.publish_hint":
    "Publier copie ce modèle dans le plan d’un élève et remplace celui qu’il avait. En un seul geste : il ne détient jamais deux plans à la fois.",
  "templates.student_id_label": "Identifiant de l’élève",
  "templates.timezone_label": "Fuseau de l’élève",
  "templates.timezone_hint":
    "La frontière du jour appartient au plan, pas à ton ordinateur. Par défaut, c’est TON fuseau — change-le si ton élève vit ailleurs.",
  "templates.commitments_section": "Lignes",
  "templates.saved": "Enregistré.",

  // Combien de temps le plan tourne (plan_versions.anchor_week_start +
  // duration_weeks). Dit comme un coach y pense — la prochaine séance — et pas
  // dans les deux colonnes que la base stocke ; la conversion lui est rendue
  // pour qu’il la vérifie avant de publier.
  "templates.next_session_label": "Ce plan tient jusqu’à notre prochaine séance",
  "templates.next_session_hint":
    "La date à laquelle tu revois cet élève. Le plan couvre cette semaine-là en entier, puis cesse d’ouvrir des jours tout seul.",
  "templates.next_session_default":
    "Placé à 4 semaines par défaut. Change-le si la séance tombe plus tôt ou plus tard.",
  "templates.next_session_clear": "Sans date de fin",
  "templates.next_session_open": "Fixer une date",
  "templates.plan_window_readout":
    "La semaine 1 commence le {anchor}. Le plan court {weeks} semaines et s’arrête après la semaine du {session}.",
  "templates.plan_window_open_ended":
    "La semaine 1 commence le {anchor}. Sans date de fin : le plan continue d’ouvrir des jours jusqu’à ce que tu en publies un nouveau.",
  "templates.plan_window_invalid":
    "Cette date précède le début du plan. Ton élève ouvrirait une app vide — choisis une date plus tardive.",
} satisfies TranslatedMessagesOf<"templates">;
