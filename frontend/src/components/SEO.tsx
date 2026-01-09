import { useEffect } from 'react';

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
}

const SEO = ({ title, description, canonical }: SEOProps) => {
  useEffect(() => {
    const fullTitle = `${title} | Sophia Coach`;
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

    // Canonical
    if (canonical) ensureLink('canonical', canonical);

    // Open Graph
    ensureMeta({ property: 'og:title' }, fullTitle);
    ensureMeta({ property: 'og:description' }, description);
    ensureMeta({ property: 'og:type' }, 'website');
    if (canonical) ensureMeta({ property: 'og:url' }, canonical);

    // Twitter
    ensureMeta({ name: 'twitter:card' }, 'summary_large_image');
    ensureMeta({ name: 'twitter:title' }, fullTitle);
    ensureMeta({ name: 'twitter:description' }, description);
  }, [title, description, canonical]);

  return null;
};

export default SEO;

