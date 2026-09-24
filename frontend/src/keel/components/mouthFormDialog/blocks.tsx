// ⟳ 2026-09-24 — SORTI DE `MouthFormDialog.tsx` (découpage, lot 4a), À L'IDENTIQUE.
// Les deux cadres de la fiche: `Section` et `RequiredBlock`.
// Le fichier d'origine ré-exporte ce qu'il exportait: aucun appelant ne change
// d'import.

import React from "react";

import { SectionLabel } from "../ui/Card";

/**
 * LES BLOCS SAUTABLES SONT REPLIÉS, ET LEUR EN-TÊTE DIT QU'ILS LE SONT.
 *
 * Dépliés, les six blocs font trente champs dans une fenêtre — et le dépôt a
 * déjà mesuré ce que ça donne: « l'écran se lisait comme UN formulaire de
 * trente champs dont on ne voyait pas où l'un finissait ». Repliés, on voit
 * trois blocs à remplir et trois qu'on peut ignorer, ce qui est exactement la
 * promesse de la conception.
 */
/**
 * UNE SECTION DE LA FICHE — TOUJOURS OUVERTE.
 *
 * ── ⛔ ELLE REMPLACE `Foldable`, ET LE REPLI EST PARTI POUR DE BON ─────────
 * Le repli existait pour une raison mesurée: dépliés, les blocs faisaient
 * « trente champs dont on ne voyait pas où l'un finissait ». Mais il coûtait
 * plus qu'il ne rendait, et l'utilisateur l'a tranché le 2026-08-19 — « il faut
 * arrêter avec le dépliable ». Ce qu'il coûtait, en clair:
 *
 *   · UNE RÉPONSE REPLIÉE EST UNE RÉPONSE INVISIBLE. Un régime déjà choisi,
 *     une allergie déjà cochée, ne se voyaient qu'en rouvrant le bloc — sur un
 *     écran dont le seul travail est de dire ce qu'on sait de quelqu'un;
 *   · IL FALLAIT DEVINER OÙ. Trois en-têtes fermés ne disent pas laquelle des
 *     trois porte « pas de champignons »;
 *   · ET IL COÛTAIT UN ÉTAT CONTRÔLÉ à chaque appelant (`openBlock`), pour un
 *     confort de mise en page.
 *
 * Ce que le repli achetait — ne pas noyer le lecteur — est repris par l'ORDRE
 * des sections, qui n'est plus arbitraire: le régime d'abord (il écarte des
 * familles entières d'aliments), les allergies ensuite (elles interdisent), les
 * dégoûts après (ils évitent), et ce qu'elle mange déjà en dernier, parce que
 * cette section-là ne se lit bien qu'une fois qu'on sait combien de fois elle
 * mange.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⟳ RENVERSEMENT PARTIEL — A5 (D5.1), 2026-09-03. LIRE AVANT DE « RÉPARER ».
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La décision du 2026-08-19 (« il faut arrêter avec le dépliable ») TIENT POUR
 * CETTE FENÊTRE-CI: `MouthPreferencesFields` n'a toujours aucun repli, et ses
 * six blocs restent ouverts. Ce qui est renversé est son extension à la FICHE
 * D'UNE BOUCHE sur `/app/household`, qui porte depuis A5 deux cadres
 * repliables NOMMÉS — « Informations personnelles » et « Préférences
 * alimentaires » (`SheetFrame`, dans `HouseholdPage.tsx`).
 *
 * ── POURQUOI LES DEUX DÉCISIONS NE SE CONTREDISENT PAS ────────────────────
 * Les trois motifs de 08-19 ont été repris un par un; deux ne s'appliquent pas
 * à la ligne d'une bouche, et le troisième est PAYÉ:
 *
 *   · « UNE RÉPONSE REPLIÉE EST UNE RÉPONSE INVISIBLE » — le seul qui tienne,
 *     et il est payé deux fois: un cadre replié rend son RÉCAPITULATIF
 *     (`filledPreferenceBlocks`, avec les mêmes clés
 *     `household.mouth.preferences_filled` / `_empty` que le bouton de cette
 *     fiche-ci), et les deux cadres sont OUVERTS PAR DÉFAUT. On ne referme que
 *     ce qu'on vient de lire.
 *   · « IL FALLAIT DEVINER OÙ » — vrai pour trois en-têtes fermés et anonymes;
 *     faux pour DEUX cadres dont les titres disent ce que chacun décide (ce
 *     qui dimensionne l'assiette / ce qui l'affine).
 *   · « IL COÛTAIT UN ÉTAT CONTRÔLÉ À CHAQUE APPELANT » — l'état vit dans la
 *     LIGNE (`identityOpen`, `prefsOpen`), pas chez l'appelant, et il meurt
 *     avec elle: le panneau se démonte à la fermeture.
 *
 * ── CE QUE LA FICHE D'UNE BOUCHE A, ET QUE CETTE FENÊTRE N'A PAS ──────────
 * Elle empile identité, corps, direction, régime, habitudes, déjeuner de
 * semaine, allergies et règles de maison — huit sujets, une trentaine de
 * contrôles, EN LIGNE, dans une liste qui peut porter huit personnes. Cette
 * fenêtre-ci est déjà une fenêtre: une personne à la fois, et elle se ferme
 * d'un geste.
 *
 * ⛔ NE PAS « HARMONISER » EN REMETTANT UN REPLI ICI. La fenêtre n'a pas de
 * récapitulatif sous ses blocs; le repli y redeviendrait exactement ce qu'il
 * était le 2026-08-19 — une réponse invisible.
 */
export function Section(
  { title, hint, children }: {
    title: string;
    /**
     * ⟳ 2026-09-20 — FACULTATIF, ET PAS « CHAÎNE VIDE ACCEPTÉE ».
     *
     * Trois sections ont perdu leur aide ce jour-là (les allergies, les
     * dégoûts, et le triplet du corps côté entonnoir). Passer `""` aurait
     * compilé et rendu un `<p>` VIDE: une marge qu'aucun texte ne justifie, et
     * un trou entre le titre et le champ que personne ne saurait expliquer six
     * mois plus tard. Absent veut dire « pas de ligne », et le rendu le
     * respecte.
     *
     * ⚠️ `RequiredBlock`, juste en dessous, GARDE son `hint` obligatoire: ses
     * deux montages en ont un, et un bloc « obligatoire » sans un mot pour dire
     * ce qu'il exige serait un cadre autour de rien.
     */
    hint?: string;
    children: React.ReactNode;
  },
) {
  return (
    <div
      // LA MARQUE D'UNE SECTION DE FICHE, auditable dans le DOM — même geste
      // que `data-box-id` ailleurs. Elle ne s'affiche pas.
      //
      // ⚠️ ELLE EXISTE PARCE QUE LA CLASSE NE SUFFIT PAS À COMPTER: chaque
      // LIGNE d'option porte le même `rounded-card border border-line-strong`,
      // donc compter la classe rendait 21 au lieu de 7. Un test incapable de
      // distinguer une section d'une ligne ne peut pas dire qu'une section a
      // perdu son cadre — et c'est très exactement ce qu'il doit dire.
      data-sheet-section=""
      className="rounded-card border border-line-strong bg-paper p-4"
    >
      <SectionLabel>{title}</SectionLabel>
      {hint === undefined || hint === ""
        ? null
        : <p className="mt-1 text-xs leading-5 text-ink-soft">{hint}</p>}
      {/* `space-y-5` ET PAS `space-y-4`: mesuré sur capture le 2026-08-19, les
          six lignes d'habitudes se lisaient collées — l'étiquette en capitales
          du moment SUIVANT touchait presque le champ du précédent, et la liste
          se lisait comme un seul pavé au lieu de six questions. */}
      <div className="mt-4 space-y-5">{children}</div>
    </div>
  );
}

/** Le bloc obligatoire — encadré plein, jamais repliable. */
export function RequiredBlock(
  { title, hint, children }: {
    title: string;
    hint: string;
    children: React.ReactNode;
  },
) {
  return (
    <div className="rounded-card border border-line-strong bg-fig-50/40 p-4">
      <SectionLabel>{title}</SectionLabel>
      <p className="mt-1 text-xs leading-5 text-ink-soft">{hint}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}
