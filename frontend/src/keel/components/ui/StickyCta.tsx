import { ButtonLink } from "./Button";

// KEEL UI — LE GESTE, TOUJOURS À PORTÉE SUR TÉLÉPHONE.
//
// ── LE DÉFAUT MESURÉ LE 2026-09-01 ────────────────────────────────────────
// Les quatre pages de vente du foyer portaient DEUX liens vers `/start`
// chacune — un dans le héros, un dans la clôture — sur des pages qui font
// 2 733 à 3 521 px en desktop et jusqu'à 3 800 px sur un écran de 375. Entre
// les deux, un lecteur convaincu au milieu de la page devait remonter ou
// descendre pour agir. `BRIEF-LANDING-FOYER.md` §8 demande « un seul CTA,
// répété »: le libellé unique est la première moitié, la RÉPÉTITION est
// celle-ci.
//
// ── POURQUOI UNE BARRE, ET SEULEMENT SOUS `lg` ────────────────────────────
// En desktop, le geste du chrome (`PublicHeader`) reste visible en haut de
// l'écran pendant qu'on lit; sur téléphone, l'en-tête défile avec la page et
// il n'y a plus rien. La barre ne s'affiche donc QUE là où le manque existe.
//
// ⚠️ ET ELLE RÉSERVE SA PROPRE PLACE. Une barre `fixed` ne prend aucune place
// dans le flux: sans réserve, elle recouvre la dernière ligne du pied de page,
// c'est-à-dire les mentions légales. `Spacer` est rendu par la même fonction
// pour qu'on ne puisse pas poser la barre en oubliant la réserve.
//
// ⛔ PAS DE PRIX ICI. Il est déjà dit deux fois par page (`OfferLines`), et une
// barre qui suit le lecteur en répétant un tarif se lit comme une relance, pas
// comme une porte.

/**
 * La barre collante, et la réserve de hauteur qui l'accompagne.
 *
 * `label` vient du namespace de la PAGE, jamais d'une clé partagée: le libellé
 * est le même partout aujourd'hui, mais c'est une décision de copie, pas un
 * fait — et une clé commune l'imposerait en silence aux quatre pages le jour
 * où l'une d'elles veut essayer autre chose. (Les FAITS, eux, sont partagés:
 * voir `ui/OfferLines.tsx`.)
 */
export function StickyCta({ label }: { label: string }) {
  return (
    <>
      {/* La réserve. `h-20` = la hauteur de la barre (padding compris), mesurée
          au rendu à 375 px. */}
      <div aria-hidden className="h-20 lg:hidden" />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 px-5 py-3 backdrop-blur lg:hidden">
        <ButtonLink to="/start" variant="brand" className="w-full justify-center px-6 py-3 text-[1rem]">
          {label}
        </ButtonLink>
      </div>
    </>
  );
}

export default StickyCta;
