import { uiLocale } from '../keel/i18n/runtime';
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

// ⚠️ `apple-touch-icon.png` ÉTAIT LE DÉFAUT, ET C'ÉTAIT UNE ICÔNE CARRÉE DE
// 1024 SERVIE EN `summary_large_image`: tout aperçu de lien rendait un carré
// rogné dans un cadre 1.91:1. `og-image.png` est une planche 1200×630 à la
// charte. Elle a remplacé un visuel « IKIZEN » violet d'une marque antérieure
// que plus personne ne référençait — le fichier existait, aucun écrivain ne le
// citait, et il n'a donc jamais été vu.
const DEFAULT_IMAGE = 'https://sophia-coach.ai/og-image.png';
const DEFAULT_ROBOTS = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';

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
  useEffect(() => {
    // ⚠️ « Sophia », ET PLUS « Sophia Coach » (2026-09-01). Le suffixe entrait
    // dans le titre d'onglet, dans `og:title` et dans chaque résultat de
    // recherche des huit pages — donc le mot « coach » revenait sur les quatre
    // pages du foyer, qui l'évitent délibérément (aucune de leurs copies ne le
    // prononce). C'est aussi le nom que porte déjà l'organisation dans les
    // données structurées: `organizationStructuredData()` déclare `name:
    // "Sophia"`. Le domaine reste `sophia-coach.ai`; un nom de marque et un nom
    // d'hôte n'ont pas à coïncider.
    const fullTitle = `${title} | Sophia`;
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

    // Basic
    ensureMeta({ name: 'description' }, description);
    ensureMeta({ name: 'robots' }, robots);

    // Canonical
    if (canonical) ensureLink('canonical', canonical);

    // Open Graph
    ensureMeta({ property: 'og:title' }, fullTitle);
    ensureMeta({ property: 'og:description' }, description);
    ensureMeta({ property: 'og:type' }, type);
    ensureMeta({ property: 'og:site_name' }, 'Sophia');
    // Derived from `lang`, never hardcoded: a page that declares lang="en" and
    // og:locale="fr_FR" tells crawlers and link previews two different things,
    // and the preview is what a shared link shows.
    ensureMeta({ property: 'og:locale' }, resolvedLang.toLowerCase().startsWith('fr') ? 'fr_FR' : 'en_GB');
    ensureMeta({ property: 'og:image' }, image);
    ensureMeta({ property: 'og:image:alt' }, fullTitle);
    if (canonical) ensureMeta({ property: 'og:url' }, canonical);

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
  }, [title, description, canonical, image, robots, type, lang, structuredData]);

  return null;
};

export default SEO;

