// Pack français — le namespace `review`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `review.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frReview = {
  // ── Écran de relecture (les engagements extraits, avant publication) ──────
  "review.title": "Relecture du plan extrait",
  "review.subtitle": "Confirme chaque engagement avant de publier pour {name}",
  "review.commitment_count": "{count} engagements trouvés",
  "review.source_quote": "Dans le document : « {quote} »",
  "review.edit_button": "Modifier",
  "review.remove_button": "Retirer",
  "review.publish_button": "Publier le plan",
  "review.publish_confirm":
    "Publier ce plan pour {name} ? Le plan en cours sera remplacé.",

  // ── Les files de la relecture (W6.3) ─────────────────────────────────────
  "review.queue_verify": "À vérifier",
  "review.queue_verify_hint":
    "Les lignes dont l’extraction n’est pas sûre. Ton temps va ici, pas à relire le plan.",
  "review.queue_complete": "À compléter",
  "review.queue_complete_hint":
    "Les trous du document. Chacun est une proposition que tu acceptes, modifies ou supprimes — rien n’entre dans le plan tout seul.",
  "review.queue_ready": "Prêt",
  "review.queue_ready_hint":
    "Extrait proprement, et découpé comme tu l’as écrit. Ouvre une ligne pour y changer quoi que ce soit.",
  "review.queue_empty": "Rien dans cette file.",
  "review.accept": "Accepter",
  "review.delete": "Supprimer",
  "review.edit": "Modifier",
  "review.done_editing": "Fermer",
  "review.add_line": "Ajouter une ligne",
  "review.mark_verified": "Marquer vérifiée",
  "review.issue_count": "{count} bloquants",
  "review.issues_title": "Cette ligne serait refusée par la base :",
  // Le badge porte sur une LIGNE, donc féminin. « Proposée » et pas
  // « Générée » : la ligne est une proposition tant que le coach ne l'a pas
  // acceptée, et rien n'entre au plan sans son clic.
  "review.auto_generated": "Proposée",

  // Un trou n'est pas un constat sur le document, c'est une décision. Le titre
  // porte la question ; la phrase complète de l'extracteur reste dessous comme
  // sa pièce justificative. « suivi » et pas « noté » : c'est le mot déjà tenu
  // par `part.student.hint.observations` (« Suivi, pas noté »).
  "review.gap_question": "{subject} — tu veux que ce soit suivi ?",
  "review.gap_question_generic": "Tu veux que ce soit suivi ?",
  "review.gap_source": "Ce que dit le document",
  "review.gap_add": "Ajouter",
  "review.gap_ignore": "Ignorer",
  "review.untitled_line": "Nouvelle ligne",
  "review.extraction_notes": "Notes d’extraction",
  "review.save_template": "Enregistrer comme modèle",
  "review.saving": "Enregistrement…",
  "review.saved": "Enregistré dans ta bibliothèque sous « {title} ».",
  "review.save_error": "Rien n’a été enregistré. {message}",
  "review.blocked_by_issues":
    "{count} lignes portent encore un problème bloquant. Corrige-les ou supprime-les avant d’enregistrer.",
  "review.publish": "Approuver et publier à l’élève",
  "review.approve_section": "J’approuve cette section",
  "review.approved_section": "Approuvée à {time}",
  // Trace RÉGLEMENTAIRE : le coach doit comprendre ce qu'il signe. Ce qu'il n'a
  // pas à lire, c'est laquelle de nos fonctions l'écrit dans quelle table.
  "review.approval_hint":
    "Chaque section porte sa propre approbation, horodatée à l’instant où tu cliques. Ce clic est la pièce qui atteste que ces lignes ont été prescrites par toi, et non par le logiciel.",
  "review.approvals_missing":
    "{count} sections attendent encore ton approbation avant que ce plan puisse parvenir à un élève.",
  "review.template_title_label": "Nom du modèle",
  "review.publish_done":
    "Publié. {count} lignes sont désormais sur le plan de ton élève, à partir de sa prochaine journée.",
  "review.publish_failed": "Rien n’a été publié. {message}",
  // ── Le titre par défaut d’un plan importé ─────────────────────────────────
  // Il part en base et l’élève le relit sur son plan: un plan composé dans une
  // interface française ne doit pas s’appeler « Imported plan » chez lui.
  "review.default_template_title": "Plan importé",
  // Le nom de la touche, tel qu’il est gravé sur un clavier français.
  "review.key_delete": "suppr",
  "review.quote_verbatim": "« {quote} »",
} satisfies TranslatedMessagesOf<"review">;
