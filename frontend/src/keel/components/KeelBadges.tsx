import { statusLabel, timingLabel } from "../api/labels";
import type { EvalStatus, TimingStatus } from "../api/types";
import { Badge, type BadgeTone } from "./ui/Badge";

// KEEL — the small typed badges shared by the student screens.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ CE FICHIER A ÉTÉ RÉÉCRIT LE 2026-08-13. LIS-LE AVANT DE « RÉPARER ».
// ═══════════════════════════════════════════════════════════════════════════
//
// Il portait sa propre table de teintes — « rounded rectangles, one tint per
// token, no UI framework » — et c'est cette phrase qui était le défaut. Les six
// statuts sont maintenant rendus par `ui/Badge`, la pastille du kit, avec les
// QUATRE familles d'état du produit et rien d'autre: émeraude = ok, bleu =
// info, ambre = attention, rouge = échec (`ui/Badge.tsx`). Ce qui est parti:
//     `not_applicable` · `flex_used` … `violet-100/700` — LA MARQUE DU PRODUIT
//                                     GRAND PUBLIC SUPPRIMÉ. Le violet n'est
//                                     pas une famille d'état: il ne disait rien.
//     `partial` ……………………… `sky-100/800` — le bleu appartient à
//                                     `Badge tone="info"`, et un second bleu à
//                                     côté du premier rend les deux muets.
//     `missed` ………………………… `rose-100/700` — à 22° de `fig-700`, la teinte de
//                                     marque. Le rouge d'échec est à 35°.
//     `unknown` ………………………… `gray-100/600` — remplacé par `neutral`, qui vaut
//                                     `bg-line text-ink-soft` (4,72:1, mesuré).
//
// CE QUI N'A PAS CHANGÉ, ET QUI ÉTAIT DÉJÀ JUSTE: `unknown` est NEUTRE, pas
// rouge. Une journée non renseignée n'est pas une journée manquée, et la
// couleur ne doit pas le dire avant que l'évaluateur ait parlé.
//
// ── LA CORRESPONDANCE EST CELLE DE `WeekView`, PAS UNE DEUXIÈME ────────────
// `keel/components/WeekView.tsx` rend LES MÊMES six statuts, en marques de
// grille. Sa règle: « la teinte = la famille du FAIT; le remplissage = ce que
// le jour DEVAIT ». Elle est reprise ici teinte pour teinte — le même statut ne
// peut pas être ambre dans une grille et bleu dans une pastille, c'est le
// défaut que ce lot répare. Si tu changes une ligne de la table ci-dessous,
// change `DOT_STYLE` là-bas dans le même geste.
//
// ⚠️ DEUX PAIRES SE CONFONDENT ICI ALORS QUE `WeekView` LES DISTINGUE, ET C'EST
// UN ÉCART ASSUMÉ: `met`/`flex_used` sont tous deux `positive`, `unknown`/
// `not_applicable` tous deux `neutral`. Là-bas la GÉOMÉTRIE fait la différence
// (un anneau creux pour la souplesse créditée mais non exécutée, une barre pour
// ce qui n'avait rien à juger); `Badge` n'a ni anneau ni barre, et lui en
// ajouter un ton serait toucher au kit — ce que ce lot n'a pas le droit de
// faire. Ce qui les sépare ici est LE MOT: la pastille porte `statusLabel()`,
// qui est distinct pour les six. Une pastille sans texte serait un défaut.
//
// ⛔ ET LA FIGUE N'ENTRE PAS ICI. Un statut est un FAIT; la teinte de marque
// marque la navigation et l'action. Autorité: `docs/keel/CHARTE-VITRINE.md` §2.

const STATUS_TONE: Record<EvalStatus, BadgeTone> = {
  unknown: "neutral",
  met: "positive",
  // Un jour à moitié tenu est une ATTENTION, pas une information: il y a
  // quelque chose à regarder. Ambre, comme la barre `amber-400` de la grille.
  partial: "caution",
  missed: "critical",
  // « Not counted » / « Non compté »: l'absence d'obligation, donc aucun fait,
  // donc aucune famille d'état.
  not_applicable: "neutral",
  // Créditée AVEC ce qui a tenu, et le modèle le dit en arithmétique:
  // `WeekView.Highlight` compte `met: summary.met + summary.flexUsed`. Une
  // souplesse déclarée à l'avance sort du dénominateur, pas de la semaine.
  flex_used: "positive",
};

export function StatusBadge({ status }: { status: EvalStatus }) {
  const tone = STATUS_TONE[status];
  if (!tone) {
    // R7: an unstyled status is a status we did not think about.
    throw new Error(`[keel/badges] no tone for status "${status}"`);
  }
  return <Badge tone={tone}>{statusLabel(status)}</Badge>;
}

// ── ⛔ `PriorityBadge` A ÉTÉ RETIRÉ, ET CE N'EST PAS UNE PERTE ──────────────
// Il rendait `core / secondary / optional` en `emerald-50` / `sky-50` / `gray-50`
// et il avait ZÉRO importeur (vérifié le 2026-08-13 hors commentaires sur
// `frontend/src` et `frontend/e2e`): `CommitmentLine.PriorityMark` l'a remplacé
// par une marque ORDINALE — trois pièces remplies de gauche à droite — pour les
// trois écrans qui rendaient le même rang de trois façons différentes.
// Ses deux teintes étaient d'ailleurs fausses toutes les deux: l'émeraude de
// « Core » était un FAUX « ok » (un engagement principal n'est pas un engagement
// tenu, et sur `/app/today` cette fausse coche touchait la vraie dans la même
// rangée), et le `sky` prenait le bleu de `Badge tone="info"`. Un RANG n'est pas
// un état du système; il n'a donc pas de pastille, il a une forme.
// ⚠️ Ne le recrée pas ici: le rang vit une seule fois, dans `CommitmentLine`.

/**
 * "Done, but at the wrong time" must be expressible (CONTRACT R6). Only
 * `off_window` is worth showing: the other three are either the default or the
 * absence of a question.
 *
 * ⛔ L'AMBRE RESTE, ET ELLE N'EST PAS UNE PASTILLE. « Fait au mauvais moment »
 * est une ATTENTION — un fait, donc la famille ambre du produit (`amber-700` sur
 * `paper` = 4,52:1). C'est une NOTE au milieu de trois autres notes de la même
 * rangée (`CommitmentLine`): lui donner un remplissage en ferait le seul objet
 * d'un autre genre de la ligne, à côté de la seule pastille qui s'y trouve —
 * celle du statut. Le cran de 11 px est celui de ses voisines, pas un oubli.
 */
export function TimingNote({ timing }: { timing: TimingStatus }) {
  if (timing !== "off_window") return null;
  return (
    <span className="text-[11px] text-amber-700">{timingLabel(timing)}</span>
  );
}
