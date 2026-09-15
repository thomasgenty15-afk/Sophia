// KEEL — CE QUE LE `<head>` D'UNE PAGE PUBLIQUE DOIT DIRE, EN UN SEUL ENDROIT.
//
// ── POURQUOI CE FICHIER EXISTE ────────────────────────────────────────────
// Le même `<head>` est écrit DEUX FOIS, par deux programmes qui ne se
// rencontrent jamais:
//
//   · `components/SEO.tsx`, au RUNTIME, dans un `useEffect` — ce que voit
//     Googlebot, qui exécute le JS;
//   · `scripts/prerender.mjs`, au BUILD, dans le HTML servi — ce que voient
//     WhatsApp, LinkedIn, Slack, iMessage, X et tout robot qui n'exécute rien.
//
// Deux rédactions du même en-tête divergent en silence, et c'est exactement ce
// qui a coûté trois mois d'aperçus faux: mesuré le 2026-09-01, les balises
// `og:` de production vendaient encore, en anglais, un produit B2B supprimé,
// pendant que la `description` de la même page était juste. Tout ce que les
// deux écrivains partagent vit donc ici, et rien n'est recopié.
//
// ⚠️ CE FICHIER EST IMPORTÉ PAR NODE, PAS SEULEMENT PAR VITE. Le script de
// prérendu fait `node --experimental-strip-types`. Il ne doit donc contenir
// AUCUN import de React, aucun accès à `import.meta.env`, aucun JSX.

/**
 * ⚠️ PAS `apple-touch-icon.png`: une icône carrée de 1024 servie en
 * `summary_large_image` rend un aperçu rogné et vide. `og-image.png` est une
 * planche 1200x630 à la charte, rendue à 2x — d'où les dimensions ci-dessous,
 * qui sont celles du FICHIER et pas le nominal. Une balise qui annonce une
 * taille que le fichier n'a pas fait recadrer certains aperçus.
 * Régénérer avec `node scripts/og-image.mjs`.
 */
export const SEO_IMAGE = "https://sophia-coach.ai/og-image.png";
export const SEO_IMAGE_WIDTH = "2400";
export const SEO_IMAGE_HEIGHT = "1260";

export const DEFAULT_ROBOTS =
  "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

export const SITE_URL = "https://sophia-coach.ai";

/**
 * Le titre complet d'un onglet et d'un résultat de recherche.
 *
 * ⚠️ LE SUFFIXE N'EST PAS INCONDITIONNEL, ET IL L'ÉTAIT. `SEO` composait
 * toujours « {titre} | Sophia », ce qui donnait sur le hall
 * « Sophia — la semaine de repas de votre maison, décidée | Sophia »: la marque
 * deux fois dans le même titre, et un titre plus long que ce que Google affiche
 * — donc une fin coupée. Les titres qui NOMMENT déjà la marque n'ont pas besoin
 * qu'on la répète; ceux qui ne la nomment pas (« Les repas de la semaine à
 * deux, décidés une fois ») en ont besoin, sinon rien dans le résultat ne dit
 * de qui il s'agit.
 *
 * C'est aussi ce qui met d'accord le HTML statique et le runtime: `index.html`
 * portait le titre NU pendant que `SEO` posait le titre suffixé, donc la même
 * page changeait de titre au premier rendu.
 */
export const TITLE_MAX = 70;

const BRAND_SUFFIX = " | Sophia";

export function pageTitle(title: string): string {
  if (title.includes("Sophia")) return title;
  // ⚠️ ET LE SUFFIXE CÈDE LE PAS AU MESSAGE QUAND LES DEUX NE TIENNENT PAS.
  // Google coupe un titre autour de 600px, soit ~70 caractères en français.
  // `mealprep.seo_title` fait 65 caractères: suffixé, il en fait 74, et ce
  // qu'on perd à la coupe n'est pas la marque — c'est la fin de la phrase, la
  // moitié qui dit à qui la page s'adresse. Entre « nommer la marque » et
  // « finir la phrase », on finit la phrase. Les sept autres titres tiennent
  // suffixés, et le gardent.
  //
  // ⚠️ NE REMPLACE PAS CETTE RÈGLE PAR UNE TRONCATURE. Couper soi-même un
  // titre à 70 le coupe pour TOUT LE MONDE, y compris les surfaces qui
  // affichent des titres longs en entier (un onglet, un partage). Google coupe
  // à l'affichage; nous, on choisit seulement ce qu'on ajoute.
  return title.length + BRAND_SUFFIX.length > TITLE_MAX ? title : `${title}${BRAND_SUFFIX}`;
}
