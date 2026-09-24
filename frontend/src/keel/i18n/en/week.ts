// Seed anglais — le namespace `week`, et lui seul.
// Assemblé dans `../en.ts`; une clé `week.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enWeek = {
  // The shared week (components/WeekView.tsx) — ONE copy set for BOTH readers.
  // Nothing here is written in the second person: the student and the coach
  // mount the same component over the same model, and a sentence that says
  // "you" to one of them would be the first crack in that.
  "week.nav.previous": "Previous week",
  "week.nav.next": "Next week",
  "week.nav.current": "Back to this week",
  "week.label": "Week {week}, {year}",
  "week.range": "{from} to {to}",
  "week.loading": "Loading this week...",
  "week.error": "This week could not be loaded. Nothing is shown rather than something wrong.",
  "week.retry": "Try again",
  "week.in_progress":
    "This week is still running. The days ahead are not counted as missed.",
  "week.empty": "Nothing recorded for this week.",
  "week.summary_title": "Week summary",
  "week.coverage_label": "Days logged",
  "week.coverage_value": "{count}/{total}",
  "week.coverage_caption":
    "Coverage comes first: early on it is the only number that predicts anything. A day counts once it carries {min} logged facts.",
  "week.run_label": "Longest run",
  "week.facts_label": "Facts logged",
  "week.deviations_label": "Declared ahead",
  "week.days_title": "Day by day",
  "week.day_facts": "{count} logged",
  "week.day_declared": "declared",
  "week.highlights_title": "What held, what slipped",
  "week.highlight_held": "Held best",
  "week.highlight_dropped": "Slipped most",
  "week.highlight_counts": "{met} done - {partial} partly - {missed} missed",
  "week.highlight_none":
    "No single line has enough resolved days this week to be named.",
  "week.highlight_locked":
    "Named once the week has {min} logged days. This one has {logged}.",
  "week.adherence_label": "Adherence",
  "week.adherence_locked": "Insufficient data",
  "week.adherence_gate":
    "A percentage needs {min} logged days in the week. This one has {logged}. Showing one now would be a number about typing, not about the week.",
  "week.adherence_no_review":
    "The week has enough logs. The number appears once the week is reviewed - nothing is computed here on the fly.",
  // ⚠️ CES QUATRE CLÉS ONT ÉTÉ RAPATRIÉES DE `progress.*`, ET LE DÉPLACEMENT EST
  // CE QUI A RENDU `/coach/clients/:id` TRADUISIBLE.
  //
  // `WeekView` — le composant de cette famille — les empruntait au namespace de
  // l'écran de progression de l'élève. La frontière étant à la maille du
  // NAMESPACE, la page du coach ATTEIGNAIT donc les 36 clés de `progress.*` par
  // ce seul emprunt: la déclarer française aurait exigé de traduire un écran
  // (`pages/ProgressPage.tsx`) que PLUS AUCUN fichier du dépôt n'importe —
  // vérifié, il n'a pas d'appelant, `StudentProgressPage` est le vivant.
  //
  // ⟳ chantier-0903/SUIVI (A7, D7.12) — LE GESTE À PART A ÉTÉ FAIT. Les 36 clés
  // `progress.*` et `pages/ProgressPage.tsx` sont parties le 2026-09-03: aucune
  // n'avait d'appelant vivant (36 recherches de littéral, `en.ts`/`fr.ts`/
  // `catalog.ts`/`ProgressPage.tsx` exclus → 0 fichier). Les quatre clés
  // ci-dessous restent chez `week.*`, où le déplacement les avait mises.
  "week.adherence_overall": "Overall",
  "week.adherence_core": "Core commitments",
  // Les deux formes portent `{count}`, y compris le singulier: `plural()` sert
  // la forme singulière à ZÉRO en français, et « 0 day » y est juste.
  "week.days_value": "{count} days",
  "week.day_value": "{count} day",
  "week.lines_title": "Line by line",
  "week.lines_col_line": "Commitment",
  "week.lines_empty": "No active line in the published plan.",
  "week.line_weekly": "Weekly line",
  "week.line_off": "Not on the plan that day",
  "week.line_future": "Still to come",
  "week.line_no_row": "Not evaluated yet",
  "week.deviations_title": "Declared in advance",
  "week.deviations_caption":
    "Declared before the day, not confessed after it. Out of the denominator, not out of the week.",
  "week.deviations_empty": "Nothing declared this week.",
  "week.deviation_entry": "{kind} on {date}",
  "week.deviation_flex": "flex used",
  "week.facts_title": "What was logged",
  "week.facts_empty": "No fact recorded this week.",
  "week.facts_logged": "logged",
  "week.facts_photo": "photo on file",
} as const
