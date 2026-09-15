import React from "react";

// KEEL UI — une section de la fenêtre de réglages.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ CE COMMENTAIRE A ÉTÉ RÉÉCRIT LE 2026-08-13. LIS-LE AVANT DE « RÉPARER ».
// ═══════════════════════════════════════════════════════════════════════════
//
// Ce fichier a porté pendant des mois cinq accents saturés — rose, violet, sky,
// teal, orange — exposés en API typée (`SetupAccent`), et un commentaire qui les
// justifiait ainsi: « le reste de KEEL est volontairement gris, ici la couleur
// ne dit pas un état, elle dit une FRONTIÈRE ».
//
// LA PRÉMISSE EST TOMBÉE, ET C'EST POUR ÇA QUE LES ACCENTS SONT PARTIS. Le
// produit connecté n'est plus gris: il porte la charte « la fiche », qui lui
// donne une teinte de marque (la figue) et une signature (l'équerre). La phrase
// « le reste est gris » ne décrit plus rien. Si tu la lis encore quelque part,
// elle est périmée: réécris-la, ne remets pas la couleur.
//
// ── ET LE MOYEN ÉTAIT INTERDIT, MÊME QUAND LA PRÉMISSE TENAIT ─────────────
// Dans ce produit, une couleur saturée appartient au SENS: émeraude = ok,
// bleu = info, ambre = attention, rouge = échec. Cinq teintes de plus qui ne
// portent AUCUN état du système, c'est de la décoration — et elle abîmait les
// vrais états, précisément là où ils vivent:
//     `sky`    entrait en collision avec `Badge tone="info"` (bleu = info)
//     `rose`   avec `critical` (rouge = échec)
//     `violet` était la marque du produit grand public SUPPRIMÉ
// Le fichier se défendait en disant qu'il évitait ambre, rouge et émeraude. Il
// en évitait trois sur cinq, et ce sont les deux qu'il gardait qui mordaient.
//
// ── LE PROBLÈME ÉTAIT RÉEL, ET IL EST TOUJOURS RÉSOLU ─────────────────────
// Quatre à cinq formulaires empilés dans une seule fenêtre, tous identiques, se
// lisent comme un seul formulaire très long: on ne sait plus où l'un finit, on
// remplit à la chaîne, et on ne retrouve pas la question qu'on venait changer.
// Le fichier avait raison là-dessus. Ce qu'il avait faux, c'est de croire que la
// réponse était une teinte.
//
// LA FRONTIÈRE EST DÉSORMAIS UNE FORME, et la charte en a une pour exactement ce
// rôle: l'équerre, qui « marque l'origine de ce qui est spécifié » (§4). Chaque
// section est une FICHE — un rayon de surface entière (`fiche`, 16px), un trait
// de contrôle qui la ferme (`line-strong`, 3,84:1), et un FRONTON: une barre de
// titre en `paper-2` séparée du corps, portant l'équerre et le nom de la
// section. C'est l'idiome de `/auth` et de `/start`, où quatre fiches empilées
// se distinguent déjà sans une seule teinte.
//
// Trois raisons pour lesquelles la forme est meilleure ici, et pas seulement
// conforme:
//   1. Elle survit au daltonisme et à l'impression — ce que le fichier
//      reconnaissait lui-même en écrivant « la couleur n'est jamais seule à
//      porter l'information ».
//   2. Elle ne consomme aucune teinte, donc aucun état ne devient muet.
//   3. Elle est la MÊME frontière que sur les huit pages publiques: quelqu'un
//      qui vient de s'inscrire retrouve la marque qu'il a vue avant de payer.
//
// ── OPTIONS REJETÉES, POUR NE PAS LES REJOUER ─────────────────────────────
//   • Garder les accents en retirant seulement le violet — ne règle rien: `sky`
//     collide toujours avec `info`, `rose` avec `critical`, et il reste quatre
//     teintes en décor.
//   • Cinq nuances de figue — interdit deux fois: `fig-300` est à 2,11:1 sur le
//     papier (fond sombre uniquement), et la charte n'autorise qu'UNE pièce
//     chaude par figure.
//   • Garder `accent` en prop morte — une API qui ne fait rien se remplit à
//     nouveau au premier lecteur pressé. Elle est donc retirée du type, et les
//     cinq sites d'appel de `StudentWeekPlanPage.tsx` sont corrigés avec.
//
// Autorité: `docs/keel/CHARTE-VITRINE.md` §2 et §4.

export interface SetupSectionProps {
  title: string;
  /** UNE ligne. Voir le commentaire sur la brièveté ci-dessous. */
  intro?: string;
  /** Ce qui est déjà enregistré, en une ligne, à droite du titre. */
  summary?: string | null;
  children: React.ReactNode;
}

export default function SetupSection(props: SetupSectionProps) {
  return (
    <section className="overflow-hidden rounded-fiche border border-line-strong bg-paper">
      {/* LE FRONTON PORTE LA FRONTIÈRE — plus une barre de couleur de 1 px.
          `paper-2` sur le corps en `paper`, fermé par un trait `line`: la barre
          se détache sans teindre le fond du formulaire. Ce point du commentaire
          d'origine restait juste et il est gardé: un fond teinté SOUS des champs
          de saisie abîme le contraste du texte tapé. */}
      <div className="border-b border-line bg-paper-2 px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {/* L'ÉQUERRE EST COLLÉE AU TITRE, jamais posée seule: il y a toujours
              un mot à sa droite. Même forme que le `Kicker` de la vitrine.
              ⚠️ Pas de `px-*` sur ce nœud: `.eq` pose `padding-left: 1.125rem`
              hors de toute couche CSS et bat un utilitaire de même spécificité.
              ⚠️ Pas de `font-display`: `text-label` fait 11 px et Young Serif ne
              descend jamais sous 20. `ink` sur `paper-2` = 15,02:1. */}
          <h3 className="eq min-w-0 text-label font-semibold uppercase text-ink">
            {props.title}
          </h3>
          {/* CE QUI EST DÉJÀ ENREGISTRÉ, LISIBLE SANS DÉROULER. L'élève revient
              le plus souvent pour VÉRIFIER, pas pour changer.
              `ink-soft` sur `paper-2` = 5,67:1. */}
          {props.summary ? (
            <p className="min-w-0 text-sm text-ink-soft">{props.summary}</p>
          ) : null}
        </div>
      </div>
      <div className="px-4 py-4">
        {/* UNE SEULE LIGNE D'EXPLICATION, ET C'EST UN PLAFOND VOULU.
            Les quatre cartes portaient chacune deux à trois phrases; mises bout
            à bout, la fenêtre devenait un texte à lire avant de pouvoir répondre
            à quoi que ce soit. Ce qui doit être dit en long se dit à côté du
            champ concerné, pas en tête de section. */}
        {props.intro ? (
          <p className="max-w-[62ch] text-sm leading-6 text-ink-soft">
            {props.intro}
          </p>
        ) : null}
        <div className={props.intro ? "mt-4" : ""}>{props.children}</div>
      </div>
    </section>
  );
}
