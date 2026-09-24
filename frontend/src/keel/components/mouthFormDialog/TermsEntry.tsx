// ⟳ 2026-09-24 — SORTI DE `MouthFormDialog.tsx` (découpage, lot 4a), À L'IDENTIQUE.
// Le texte libre des allergies et des dégoûts.
// Le fichier d'origine ré-exporte ce qu'il exportait: aucun appelant ne change
// d'import.

import React from "react";

import { Button } from "../ui/Button";
import { inputClass } from "../ui/Field";
import { extractFoodTerms, type FoodTermsKind } from "../../api/foodTermsExtract";
import { t } from "../../i18n/t";

/** Les aliments refusés par DÉGOÛT — texte libre, une ligne par aliment. */
/** Les slugs des treize pastilles — pour ne pas les rendre deux fois. */

/**
 * LE TEXTE LIBRE, POUR LES DEUX SECTIONS — 2026-09-20.
 *
 * ── LE CIRCUIT, DANS LES MOTS DE L'UTILISATEUR ────────────────────────────
 *   1. « le user décrit » — une phrase ou des virgules, dans le champ;
 *   2. « dès qu'il décrit, le bouton Ajouter se colore » — `primary` dès
 *      qu'il y a du texte, `secondary` sinon;
 *   3. « quand la personne clique, analyse hyper rapide avec un modèle » —
 *      `extractFoodTerms`, effort bas, douze secondes de plafond;
 *   4. « les termes apparaissent sous forme de bulle, déjà cochés » — ajoutés
 *      à `terms`, une croix pour en retirer un.
 * Le dépôt des inconnus au sas est fait par la fonction, après sa réponse.
 *
 * ── ⛔ CE QU'ON NE PERD JAMAIS ────────────────────────────────────────────
 * Le champ n'est vidé QUE si au moins une bulle en est sortie. Un modèle qui
 * répond « aucun aliment » laisse la phrase en place, et la personne la
 * retouche ou la découpe elle-même à la virgule. Une panne, elle, ne rend
 * jamais rien: la fonction et ce module ont chacun leur découpage de repli.
 *
 * ⛔ REMPLACE `DislikeFields` (un mot à la fois, « Ajouter » à chaque mot).
 * Il n'y avait pas d'équivalent pour les allergies: elles n'acceptaient que
 * les treize pastilles. Un seul composant pour les deux, parce que la seule
 * différence est le mot envoyé au modèle (`kind`) — et deux copies d'un
 * champ finissent par poser deux questions différentes.
 *
 * ⚠️ NI LIBELLÉ NI AIDE VISIBLES — LA SECTION LES PORTE (2026-08-20, « cette
 * section est verbeuse »). Le contrôle reste NOMMÉ par `aria-label`.
 */
export function TermsEntry(
  { kind, terms, onChange }: {
    kind: FoodTermsKind;
    terms: readonly string[];
    onChange: (next: readonly string[]) => void;
  },
) {
  const [entry, setEntry] = React.useState("");
  const [working, setWorking] = React.useState(false);
  const canAdd = entry.trim() !== "" && !working;
  const add = async () => {
    if (!canAdd) return;
    setWorking(true);
    try {
      const got = await extractFoodTerms({ text: entry, kind });
      // DÉDOUBLONNÉ SANS CASSE: « Thon » et « thon » sont une bulle.
      const have = new Set(terms.map((x) => x.toLowerCase()));
      const fresh = got.terms.filter((x) => !have.has(x.toLowerCase()));
      if (fresh.length > 0) {
        onChange([...terms, ...fresh]);
        setEntry("");
      }
    } finally {
      setWorking(false);
    }
  };
  return (
    <div>
      {terms.length > 0 ? (
        // `break-words` PARCE QUE C'EST DU TEXTE D'UTILISATEUR: rien ne
        // garantit une espace, et un mot de 39 signes pousse la PAGE ENTIÈRE à
        // défiler horizontalement dans un cadre de 320 px.
        <ul className="mb-2 flex flex-wrap gap-2 break-words">
          {terms.map((d) => (
            <li key={d}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onChange(terms.filter((x) => x !== d))}
              >
                {d} ×
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input
          id={`mouth-terms-${kind}`}
          aria-label={t(
            kind === "allergy"
              ? "household.mouth.terms_label_allergy"
              : "household.mouth.terms_label_dislike",
          )}
          type="text"
          maxLength={400}
          value={entry}
          placeholder={t(
            kind === "allergy"
              ? "household.mouth.terms_placeholder_allergy"
              : "household.mouth.terms_placeholder_dislike",
          )}
          onChange={(e) => setEntry(e.target.value)}
          // ENTRÉE = AJOUTER. Trois dégoûts tapés à la suite ne devraient pas
          // coûter trois allers-retours vers un bouton.
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          disabled={working}
          className={`${inputClass} flex-1`}
        />
        <Button
          variant={canAdd ? "primary" : "secondary"}
          size="sm"
          disabled={!canAdd}
          onClick={() => void add()}
        >
          {working
            ? t("household.mouth.terms_working")
            : t("setup.people.allergies_add")}
        </Button>
      </div>
    </div>
  );
}
