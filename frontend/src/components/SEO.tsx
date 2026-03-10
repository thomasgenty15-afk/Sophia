import { useEffect } from 'react';

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  image?: string;
  robots?: string;
  type?: string;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
}

const DEFAULT_IMAGE = 'https://sophia-coach.ai/apple-touch-icon.png';
const DEFAULT_ROBOTS = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';

const SEO = ({
  title,
  description,
  canonical,
  image = DEFAULT_IMAGE,
  robots = DEFAULT_ROBOTS,
  type = 'website',
  structuredData,
}: SEOProps) => {
  useEffect(() => {
    const fullTitle = `${title} | Sophia Coach`;
    document.documentElement.lang = 'fr';
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
    ensureMeta({ property: 'og:site_name' }, 'Sophia Coach');
    ensureMeta({ property: 'og:locale' }, 'fr_FR');
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
  }, [title, description, canonical, image, robots, type, structuredData]);

  return null;
};

export default SEO;

