import { datedMeasures } from "../api/bodyMeasures";

export interface ReviewRow {
  week_start_date: string;
  outcomes: Record<string, unknown> | null;
  biofeedback: Record<string, unknown> | null;
}

/**
 * Les poids affichables d'une série de bilans, dans l'ordre des semaines.
 *
 * ── OÙ LE POIDS VIT VRAIMENT ──────────────────────────────────────────────
 * `/app/progress` lisait `outcomes.weight_7d_avg`. PERSONNE N'ÉCRIT LÀ dans le
 * modèle masterclasse: le point du dimanche (WhatsApp Flow, C4) range le poids
 * dans `biofeedback.weight_kg`, avec les six axes. La carte restait donc
 * définitivement vide — « No weight in this period yet. You enter it in the
 * Sunday check-in » — juste après que l'élève l'ait justement saisi dans le
 * point du dimanche. Vérifié le 2026-08-03: aucun écrivain de `weight_7d_avg`
 * hors fixture de test.
 *
 * `outcomes.weight_7d_avg` reste en REPLI parce que le chemin 1:1, lui,
 * l'alimente: les deux modèles coexistent dans la même table.
 *
 * Dans son propre fichier, et pas dans la page, pour deux raisons: c'est le
 * lien écrivain/lecteur qui a cassé ici et il ne se voit pas en lisant un
 * composant, et un export non-composant à côté d'une page casse le fast refresh.
 */
export function displayWeights(reviews: ReviewRow[]): number[] {
  // DÉLÈGUE, ne réimplémente pas. `/app/plan` lit maintenant les mêmes mesures
  // pour en tirer une tendance; deux extractions de la même colonne, c'est le
  // défaut que l'en-tête ci-dessus raconte, re-signé un étage plus haut. Un
  // seul lecteur, et il connaît les deux modèles ET les bornes.
  return datedMeasures(reviews, "weight").map((m) => m.value);
}
