// Seed anglais — le namespace `templates`, et lui seul.
// Assemblé dans `../en.ts`; une clé `templates.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enTemplates = {
  // Template library (plan_templates)
  "templates.title": "Your plan templates",
  "templates.subtitle":
    "You work here. A template is imported once; every student is a clone plus a diff.",
  "templates.new": "New template",
  "templates.empty": "No template yet. Import a plan, or start an empty one.",
  "templates.select_hint": "Open a template on the left, or start a new one.",
  "templates.loading": "Loading your library...",
  "templates.error": "Your library could not be loaded. {message}",
  "templates.commitment_count": "{count} lines",
  "templates.status_draft": "Draft",
  "templates.status_active": "Active",
  "templates.status_archived": "Archived",
  "templates.updated": "Updated {date}",
  "templates.open": "Open",
  "templates.save": "Save",
  "templates.saving": "Saving...",
  "templates.delete": "Delete",
  "templates.delete_confirm": "Delete this draft template? This cannot be undone.",
  "templates.field_title": "Name",
  "templates.field_description": "Description",
  "templates.field_locale": "Language of this template",
  "templates.field_status": "Status",
  "templates.field_flex": "Flex days per week",
  "templates.field_target": "Adherence target (%)",
  "templates.field_autonomy": "Default autonomy",
  "templates.swap_title": "Default swap policy",
  "templates.swap_hint":
    "Ticked once, here, for the whole template. A policy, not a menu — the evaluator resolves swaps from it.",
  "templates.swap_class_equivalent": "Allow any food group of the same class",
  "templates.swap_allowed_groups": "Or restrict swaps to these groups",
  "templates.publish": "Publish to student",
  "templates.approve_lines": "I approve these lines for this student",
  "templates.publishing": "Publishing...",
  // `templates.publish_result` A DISPARU AVEC SON SEUL APPELANT (lot 5).
  // Elle valait « Published: {message} » et `TemplatesPage` y interpolait
  // `plan_version <uuid>` en succès, un `JSON.stringify` de la réponse en
  // échec — notre vocabulaire de stockage et notre transport, sur l'écran où
  // une diététicienne publie. Les deux chemins de publication passent
  // maintenant par `review.publish_done` / `review.publish_failed`, qui disent
  // combien de lignes sont parties. Garder la clé aurait gardé de la traduction
  // payée pour une phrase que plus rien ne rend.
  "templates.publish_hint":
    "Publishing copies this template into a plan for one student and replaces the plan they had. It happens in one step: they never hold two plans at once.",
  "templates.student_id_label": "Student user id",
  "templates.timezone_label": "Student timezone",
  "templates.timezone_hint":
    "The day boundary is a property of the plan, not of your laptop. This defaults to YOUR timezone — change it if your student lives elsewhere.",
  "templates.commitments_section": "Lines",
  "templates.saved": "Saved.",

  // How long the plan runs (plan_versions.anchor_week_start + duration_weeks).
  // Phrased the way a coach thinks about it — the next session — rather than in
  // the two columns the database stores; the conversion is shown back so the
  // coach can check it before publishing.
  "templates.next_session_label": "This plan runs until our next session",
  "templates.next_session_hint":
    "The date you next see this student. The plan covers that whole week, then stops opening days on its own.",
  "templates.next_session_default": "Defaulted to 4 weeks out. Change it if you meet sooner or later.",
  "templates.next_session_clear": "No end date",
  "templates.next_session_open": "Set a date",
  "templates.plan_window_readout":
    "Week 1 starts {anchor}. The plan runs {weeks} weeks and stops after the week of {session}.",
  "templates.plan_window_open_ended":
    "Week 1 starts {anchor}. No end date: the plan keeps opening days until you publish a new one.",
  "templates.plan_window_invalid":
    "That date is before the plan starts. Your student would open an empty app - pick a later date.",
} as const
