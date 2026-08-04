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
  return reviews
    .map((r) => {
      const fromFlow = Number((r.biofeedback ?? {})["weight_kg"]);
      if (Number.isFinite(fromFlow)) return fromFlow;
      return Number((r.outcomes ?? {})["weight_7d_avg"]);
    })
    .filter((n) => Number.isFinite(n));
}
