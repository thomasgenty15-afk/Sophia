// KEEL — LE SYMBOLE DE LA MARQUE, EN UN SEUL ENDROIT.
//
// L'assiette composée: un cercle, et trois parts qui n'ont pas la même taille.
// C'est ce que fait le produit — une cuisson, des portions qui bifurquent —
// dit en une forme. Choisi le 2026-09-10 par le propriétaire parmi les trois
// pistes de `public/brand/logo-concepts/`, dans sa variante AVATAR (sans la
// fourchette, assiette centrée): c'est la seule qui tient dans un carré et
// donc la seule qui puisse être à la fois le logo de la page et l'icône.
//
// ⚠️ LE MÊME DESSIN VIT DANS QUATRE FICHIERS, ET C'EST VOULU — mais les
// coordonnées, elles, ne doivent JAMAIS diverger:
//   · ici, pour les écrans (React);
//   · `public/brand/sophia-mark.svg`, la source de référence;
//   · `public/favicon.svg`, l'onglet;
//   · les PNG rendus par `scripts/brand-icons.mjs`, qui LIT le fichier de
//     référence — donc regénérer les icônes suffit à propager une retouche là.
// Retoucher le tracé se fait dans `sophia-mark.svg`, puis ici à la main, puis
// `node scripts/brand-icons.mjs`.
//
// ⚠️ `currentColor` ET PAS UNE COULEUR EN DUR. Le symbole est posé sur papier
// (figue) et devra l'être un jour sur le bloc sombre (`fig-300`, charte §5):
// une couleur écrite dans le tracé rendrait la seconde impossible sans un
// second fichier. La classe décide, le composant obéit.
//
// ⚠️ `aria-hidden`: le symbole n'est JAMAIS seul — il a toujours le mot
// « Sophia » à sa droite (c'est la règle de l'équerre qu'il remplace, charte
// §4). Lui donner un `role="img"` et un libellé ferait lire « Sophia Sophia »
// à un lecteur d'écran.

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="32"
        cy="32"
        r="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g fill="currentColor">
        <path d="M28.5 15.5c-8.3 2.4-13 8.3-13 16.5s4.7 14.2 13 16.5V15.5Z" />
        <path d="M35.5 15.5v13h13c-1.2-7.1-7.1-11.8-13-13Z" />
        <path d="M35.5 35.5v13c8.3-1.2 14.2-7.1 13-13H35.5Z" />
      </g>
    </svg>
  );
}

export default BrandMark;
