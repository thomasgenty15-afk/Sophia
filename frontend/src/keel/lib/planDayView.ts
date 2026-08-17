// LOT 1 — LA VUE PAR JOUR DU PLAN. Le modèle PUR: aucune I/O, aucune horloge,
// aucun aléa, aucun `t()`.
//
// ── CE QUE CE MODULE DÉCIDE, ET CE QU'IL NE DÉCIDE PAS ─────────────────────
// Il décide QUEL jour la vue ouvre, et si une sélection encore en mémoire vaut
// toujours pour la fenêtre affichée. Il ne dérive AUCUNE liste de jours: la
// liste vient de `windowDayOrder`, la seule source (deux dérivations du même
// plan divergent — c'est l'interdit écrit dans `PlanResult`).
//
// ── « AUJOURD'HUI » EST UNE JOINTURE, PAS UNE DEVINETTE ────────────────────
// Le jour d'ouverture est celui dont la DATE (`windowDates`, jeton → date)
// est `today`. Sur un brouillon, l'appelant passe `today = startsOn`, donc le
// défaut tombe sur le premier jour du brouillon sans un octet de code en plus.

export type DaySelection = "all" | string;

/**
 * Le jour qu'on ouvre.
 *
 * `view: "week"` = la semaine entière, et c'est l'appelant qui le demande
 * (l'aperçu s'ouvre en semaine: on juge un brouillon en entier avant de
 * l'adopter). En vue jour: le jour d'aujourd'hui s'il est dans la fenêtre,
 * sinon le PREMIER jour du plan — jamais un jour du calendrier.
 */
export function defaultSelectedDay(args: {
  view: "week" | "day";
  /** Les jetons dans l'ordre du PLAN (`windowDayOrder`). */
  order: readonly string[];
  /** La table jeton → date (`windowDates`). */
  dates: Record<string, string>;
  today: string;
}): DaySelection {
  if (args.view === "week") return "all";
  const today = args.order.find((day) => args.dates[day] === args.today);
  return today ?? args.order[0] ?? "all";
}

/**
 * La sélection qui VAUT pour cette fenêtre.
 *
 * Une sélection survit au changement de plan (l'onglet « courant » →
 * « suivant » garde le même composant monté): un jeton qui n'existe pas dans
 * la nouvelle fenêtre retomberait sur un écran vide. On retombe sur le défaut,
 * jamais sur du vide.
 */
export function effectiveSelectedDay(args: {
  selected: DaySelection;
  order: readonly string[];
  dates: Record<string, string>;
  today: string;
}): DaySelection {
  if (args.selected === "all") return "all";
  if (args.order.includes(args.selected)) return args.selected;
  return defaultSelectedDay({
    view: "day",
    order: args.order,
    dates: args.dates,
    today: args.today,
  });
}
