import React from "react";

// KEEL UI — une section de la fenêtre de réglages.
//
// ── POURQUOI DE LA COULEUR DANS UNE MAQUETTE QUI N'EN A PAS ───────────────
// Le reste de KEEL est volontairement gris: la couleur y est réservée au SENS
// (ambre = attention, rouge = échec, émeraude = enregistré). Ici elle ne dit
// pas un état, elle dit une FRONTIÈRE — « ceci est une autre question ».
//
// Quatre formulaires empilés dans une seule fenêtre, tous gris, se lisent comme
// un seul formulaire très long: on ne sait plus où l'un finit, on remplit à la
// chaîne, et on ne retrouve pas la question qu'on venait changer. C'est
// exactement ce que les quatre cartes séparées faisaient sur la page — les
// réunir sans les distinguer déplacerait le problème au lieu de le résoudre.
//
// ── LES ACCENTS SONT UNE LISTE FERMÉE, ET ILS ÉVITENT LES COULEURS DE SENS ──
// Ni ambre, ni rouge, ni émeraude: ce sont celles que `Card tone="warning"`,
// les messages d'erreur et les confirmations d'enregistrement utilisent DANS
// ces sections. Une section ambre contenant un avertissement ambre ne montre
// plus l'avertissement.
//
// ── LA COULEUR N'EST JAMAIS SEULE À PORTER L'INFORMATION ──────────────────
// Chaque section a son titre écrit. L'accent aide à retrouver, il ne dit rien
// que le texte ne dise — sinon la fenêtre serait illisible pour qui ne
// distingue pas ces teintes.

export type SetupAccent = "violet" | "sky" | "teal" | "orange";

const ACCENT: Record<SetupAccent, { bar: string; chip: string }> = {
  violet: { bar: "bg-violet-500", chip: "bg-violet-50 text-violet-900" },
  sky: { bar: "bg-sky-500", chip: "bg-sky-50 text-sky-900" },
  teal: { bar: "bg-teal-500", chip: "bg-teal-50 text-teal-900" },
  orange: { bar: "bg-orange-500", chip: "bg-orange-50 text-orange-900" },
};

export interface SetupSectionProps {
  accent: SetupAccent;
  title: string;
  /** UNE ligne. Voir le commentaire sur la brièveté ci-dessous. */
  intro?: string;
  /** Ce qui est déjà enregistré, en une ligne, à droite du titre. */
  summary?: string | null;
  children: React.ReactNode;
}

export default function SetupSection(props: SetupSectionProps) {
  const accent = ACCENT[props.accent];
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* LA BARRE PORTE LA COULEUR, PAS LE FOND DU FORMULAIRE. Un fond teinté
          sous des champs de saisie abîme le contraste du texte tapé, et quatre
          fonds différents dans une fenêtre donnent une page de carnaval. */}
      <div className={`h-1 w-full ${accent.bar}`} />
      <div className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3
            className={`rounded-md px-2 py-1 text-sm font-semibold ${accent.chip}`}
          >
            {props.title}
          </h3>
          {/* CE QUI EST DÉJÀ ENREGISTRÉ, LISIBLE SANS DÉROULER. L'élève revient
              le plus souvent pour VÉRIFIER, pas pour changer. */}
          {props.summary ? (
            <p className="min-w-0 text-xs text-gray-500">{props.summary}</p>
          ) : null}
        </div>
        {/* UNE SEULE LIGNE D'EXPLICATION, ET C'EST UN PLAFOND VOULU.
            Les quatre cartes portaient chacune deux à trois phrases; mises
            bout à bout, la fenêtre devenait un texte à lire avant de pouvoir
            répondre à quoi que ce soit. Ce qui doit être dit en long se dit
            à côté du champ concerné, pas en tête de section. */}
        {props.intro ? (
          <p className="mt-2 text-xs leading-5 text-gray-500">{props.intro}</p>
        ) : null}
        <div className="mt-4">{props.children}</div>
      </div>
    </section>
  );
}
