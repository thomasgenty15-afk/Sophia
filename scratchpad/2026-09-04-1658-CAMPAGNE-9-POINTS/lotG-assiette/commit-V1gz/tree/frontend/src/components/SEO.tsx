import { uiLocale } from '../keel/i18n/runtime';
import { isLocaleRoutedPath, localePath, type UiLocale } from '../keel/i18n/catalog';
import { LEGAL_ENTITY } from '../lib/legalEntity';
import { DEFAULT_ROBOTS, pageTitle, SEO_IMAGE, SEO_IMAGE_HEIGHT, SEO_IMAGE_WIDTH } from '../keel/seo/head';
import { useEffect } from 'react';

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  image?: string;
  robots?: string;
  type?: string;
  /** Document language. The product ships in English; pass a BCP-47 tag to override. */
  /** Laisser vide pour suivre la locale d'interface. */
  lang?: string;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
}

// ⚠️ CES VALEURS NE VIVENT PLUS ICI. Elles sont dans `keel/seo/head.ts`, parce
// que le HTML PRÉRENDU (`scripts/prerender.mjs`) doit poser exactement les
// mêmes — et deux rédactions du même en-tête divergent en silence. C'est ce
// qui a coûté trois mois d'aperçus faux: la `description` du statique était
// juste pendant que ses `og:` vendaient un produit supprimé.
const DEFAULT_IMAGE = SEO_IMAGE;

const SEO = ({
  title,
  description,
  canonical,
  image = DEFAULT_IMAGE,
  robots = DEFAULT_ROBOTS,
  type = 'website',
  lang,
  structuredData,
}: SEOProps) => {
  // `lang` non fourni => la locale d'interface COURANTE. Il defautait a 'en'
  // en dur, et six pages le passaient explicitement a "en" par-dessus: quatre
  // ecrivains pour un attribut, tous d'accord sur la mauvaise valeur des que
  // le visiteur choisit le francais.
  const resolvedLang = lang ?? uiLocale();
  // Lu au rendu et pas dans l'effet: c'est la même valeur, et la nommer ici
  // permet aux deux blocs (canonique et alternatives) de partager un seul
  // point de lecture de l'URL.
  const here = globalThis.location?.pathname ?? '';
  useEffect(() => {
    // ⚠️ « Sophia », ET PLUS « Sophia Coach » (2026-09-01). Le suffixe entrait
    // dans le titre d'onglet, dans `og:title` et dans chaque résultat de
    // recherche des huit pages — donc le mot « coach » revenait sur les quatre
    // pages du foyer, qui l'évitent délibérément (aucune de leurs copies ne le
    // prononce). C'est aussi le nom que porte déjà l'organisation dans les
    // données structurées: `organizationStructuredData()` déclare `name:
    // "Sophia"`. Le domaine reste `sophia-coach.ai`; un nom de marque et un nom
    // d'hôte n'ont pas à coïncider.
    const fullTitle = pageTitle(title);
    document.documentElement.lang = resolvedLang;
    document.title = fullTitle;

    const ensureMeta = (attrs: Record<string, string>, content: string) => {
      const selector = Object.entries(attrs)
        .map(([k, v]) => `meta[${k}="${CSS.escape(v)}"]`)
        .join('');

      let el = document.head.querySelector<HTMLMetaElement>(selector);
      if (!el) {
        el = document.createElement('meta');
        Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    const ensureLink = (rel: string, href: string) => {
      let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${CSS.escape(rel)}"]`);
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
    };

    // ── LES ALTERNATIVES DE LANGUE ────────────────────────────────────────
    //
    // ⚠️ ELLES SONT RECONSTRUITES À CHAQUE PAGE, PAS MISES À JOUR. Une SPA
    // garde le même `<head>` d'une route à l'autre: une page routée par langue
    // suivie d'une page qui ne l'est pas laisserait les `hreflang` de la
    // première en place, et `/start` déclarerait les alternatives de
    // `/couples`. On efface, puis on repose ce que la page courante doit dire.
    // ⚠️ ON RETIRE TOUTES LES ALTERNATIVES, PAS SEULEMENT LES NÔTRES. Le HTML
    // servi en porte déjà (posées par `scripts/prerender.mjs`), et ne retirer
    // que celles marquées `data-seo-alternate` les laissait CÔTE À CÔTE:
    // mesuré au navigateur, six balises pour trois langues. Identiques sur une
    // page prérendue — donc juste bruyantes — mais CONTRADICTOIRES partout
    // ailleurs: en dev, et sur toute route servie par le repli `index.html`,
    // les statiques sont celles du hall. Une fois que le runtime parle, c'est
    // lui qui fait autorité.
    document.head
      .querySelectorAll('link[rel="alternate"][hreflang]')
      .forEach((node) => node.remove());

    const addAlternate = (hreflang: string, href: string) => {
      const el = document.createElement('link');
      el.setAttribute('rel', 'alternate');
      el.setAttribute('hreflang', hreflang);
      el.setAttribute('href', href);
      el.setAttribute('data-seo-alternate', 'true');
      document.head.appendChild(el);
    };

    // Basic
    ensureMeta({ name: 'description' }, description);
    ensureMeta({ name: 'robots' }, robots);

    // ── LA CANONIQUE, DÉRIVÉE QUAND L'URL PORTE LA LANGUE ─────────────────
    //
    // ⚠️ LA VALEUR PASSÉE EN PROP EST IGNORÉE SUR CES PAGES-LÀ, ET IL LE FAUT.
    // Les quatre landings passent une constante — `${siteUrl}/couples` — écrite
    // avant que `/en/couples` existe. Servie telle quelle, la page anglaise
    // déclarait le français comme sa canonique: Google aurait replié les deux
    // URL sur une seule et la version anglaise n'aurait jamais été indexée.
    // Une canonique doit se référencer ELLE-MÊME sur chaque alternative.
    const routed = isLocaleRoutedPath(here);
    // ⚠️ `resolvedLang` EST UN `string`, PAS UN `UiLocale`: la prop `lang` est
    // libre (une page peut déclarer « en-GB »). On la ramène aux deux langues
    // livrées avant de composer une URL — sinon `localePath` recevrait un tag
    // qu'il ne connaît pas et rendrait le chemin français pour tout ce qui
    // n'est pas exactement « fr ».
    const routedLocale: UiLocale = resolvedLang.toLowerCase().startsWith('fr') ? 'fr' : 'en';
    const selfCanonical = routed
      ? `${LEGAL_ENTITY.siteUrl}${localePath(here, routedLocale)}`
      : canonical;
    if (selfCanonical) ensureLink('canonical', selfCanonical);

    if (routed) {
      const frHref = `${LEGAL_ENTITY.siteUrl}${localePath(here, 'fr')}`;
      const enHref = `${LEGAL_ENTITY.siteUrl}${localePath(here, 'en')}`;
      // `fr-FR` et pas `fr`: le prix, la TVA et l'entité légale de ces pages
      // sont français. `en` reste SANS région — la page anglaise ne vise aucun
      // pays en particulier, et `en-GB` la retirerait des résultats américains.
      addAlternate('fr-FR', frHref);
      addAlternate('en', enHref);
      // `x-default` = l'anglais, cohérent avec `DEFAULT_UI_LOCALE`: c'est la
      // page servie à qui ne correspond à aucune des deux (un lecteur
      // allemand), et l'anglais est le plus largement lisible des deux.
      addAlternate('x-default', enHref);
    }

    // Open Graph
    ensureMeta({ property: 'og:title' }, fullTitle);
    ensureMeta({ property: 'og:description' }, description);
    ensureMeta({ property: 'og:type' }, type);
    ensureMeta({ property: 'og:site_name' }, 'Sophia');
    // Derived from `lang`, never hardcoded: a page that declares lang="en" and
    // og:locale="fr_FR" tells crawlers and link previews two different things,
    // and the preview is what a shared link shows.
    ensureMeta({ property: 'og:locale' }, resolvedLang.toLowerCase().startsWith('fr') ? 'fr_FR' : 'en_GB');
    // L'autre langue de la même page, quand elle existe. Un aperçu qui sait
    // qu'une version française existe peut la préférer pour un lecteur
    // français; sans la balise il n'a aucun moyen de l'apprendre.
    if (isLocaleRoutedPath(here)) {
      ensureMeta(
        { property: 'og:locale:alternate' },
        resolvedLang.toLowerCase().startsWith('fr') ? 'en_GB' : 'fr_FR',
      );
    }
    ensureMeta({ property: 'og:image' }, image);
    ensureMeta({ property: 'og:image:alt' }, fullTitle);
    // ⚠️ LES DIMENSIONS RÉELLES DU FICHIER, comme dans `index.html`. Elles y
    // étaient et manquaient ici: dès que `SEO` s'exécutait, le `<head>` portait
    // une image sans taille déclarée, et certains aperçus recadrent quand ils
    // doivent la deviner. La planche est rendue à 2x (rapport 1.91:1 tenu).
    ensureMeta({ property: 'og:image:width' }, SEO_IMAGE_WIDTH);
    ensureMeta({ property: 'og:image:height' }, SEO_IMAGE_HEIGHT);
    if (selfCanonical) ensureMeta({ property: 'og:url' }, selfCanonical);

    // Twitter
    ensureMeta({ name: 'twitter:card' }, 'summary_large_image');
    ensureMeta({ name: 'twitter:title' }, fullTitle);
    ensureMeta({ name: 'twitter:description' }, description);
    ensureMeta({ name: 'twitter:image' }, image);
    ensureMeta({ name: 'twitter:image:alt' }, fullTitle);

    // Structured data
    document.head
      .querySelectorAll('script[data-seo-structured-data="true"]')
      .forEach((node) => node.remove());

    if (structuredData) {
      const items = Array.isArray(structuredData) ? structuredData : [structuredData];

      items.forEach((item) => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute('data-seo-structured-data', 'true');
        script.text = JSON.stringify(item);
        document.head.appendChild(script);
      });
    }
  }, [title, description, canonical, image, robots, type, lang, structuredData, resolvedLang, here]);

  return null;
};

export default SEO;

