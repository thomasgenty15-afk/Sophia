// KEEL — LE BLOC JSON-LD DES PAGES DE VENTE DU FOYER, ÉCRIT UNE FOIS.
//
// ── LES DEUX DÉFAUTS QUE CE FICHIER FERME ─────────────────────────────────
//
// 1. LE GEL À L'IMPORT. `HomePage`, `CouplesPage` et `FamiliesPage` déclaraient
//    leur bloc en CONSTANTE DE MODULE, avec des `t()` dedans. Une constante de
//    module est évaluée à l'IMPORT, avant que `uiLocale()` ait vu l'URL: le
//    bloc se figeait donc à la langue du premier chargement. Mesuré en
//    production le 2026-09-03 — la page rendait « Sophia — une seule casserole,
//    et la part de chacun écrite » en français avec, en dessous, un JSON-LD
//    dont `name` et `description` étaient ANGLAIS. Un moteur lit les deux.
//    Depuis que `/couples` et `/en/couples` partagent le même module, le défaut
//    empire: la première des deux pages ouverte fixait la langue de l'autre.
//
// 2. LA DIVERGENCE ENTRE PAGES. Le nœud `SoftwareApplication` était recopié
//    dans `CouplesPage` et dans `FamiliesPage`, absent de `MealPrepPage` et de
//    `HomePage` (qui déclarait un `WebPage`). Quatre pages qui vendent le même
//    abonnement en décrivaient trois versions différentes à Google.
//
// ── CE QU'IL NE FAIT PAS, ET POURQUOI ─────────────────────────────────────
// ⚠️ AUCUN `aggregateRating`, AUCUN `review`. Ce sont les deux propriétés qui
// obtiennent des étoiles dans un résultat de recherche, et nous n'avons pas un
// seul avis client. Les déclarer serait inventer un fait vérifiable par
// n'importe qui — et c'est aussi la classe de balisage que Google sanctionne
// manuellement. Le jour où de vrais avis existent, ils entrent ici depuis leur
// source, jamais en dur.

import { useMemo } from "react";

import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { PRICES } from "../i18n/prices";
import { localePath, type UiLocale } from "../i18n/catalog";
import { uiLocale } from "../i18n/runtime";

/**
 * Le bloc d'une page de vente du foyer.
 *
 * `path` est le chemin CANONIQUE FRANÇAIS de la page (« /couples »); l'URL
 * déclarée est celle de la langue passée, exactement comme la balise
 * `canonical` que `SEO` pose sur la même page. Les deux doivent se référencer
 * l'une l'autre: un JSON-LD qui nomme l'URL française sous une page anglaise
 * dit à Google que la page qu'il lit n'est pas celle qu'elle décrit.
 */
export function salesPageStructuredData(args: {
  path: string;
  locale: UiLocale;
  description: string;
}): Array<Record<string, unknown>> {
  const url = `${LEGAL_ENTITY.siteUrl}${localePath(args.path, args.locale)}`;
  const organization = organizationStructuredData();

  return [
    organization,
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      // Le nom du PRODUIT, jamais le titre de la page. Les deux ont divergé:
      // `HomePage` déclarait un `WebPage` nommé par son `seo_title`, les deux
      // autres un `SoftwareApplication` nommé « Sophia ». Un moteur qui
      // recoupe trois pages du même site y lisait trois produits.
      name: "Sophia",
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web",
      url,
      description: args.description,
      inLanguage: args.locale === "fr" ? "fr-FR" : "en",
      publisher: organization,
      // ── L'OFFRE, ET POURQUOI ELLE EST ICI ─────────────────────────────
      // C'est la propriété que lisent à la fois les résultats enrichis et les
      // annonces: sans elle, un moteur sait qu'un logiciel existe et ignore
      // qu'il a un prix. Le montant vient de `PRICES.household` — la même
      // table que les cartes de prix et que la prose de vente, dont
      // `format.int.test.ts` interdit qu'elle s'en écarte.
      offers: {
        "@type": "Offer",
        price: PRICES.household.toFixed(2),
        priceCurrency: "EUR",
        // Le prix vaut pour un MOIS d'abonnement. Sans cette unité, « 12.99 »
        // se lit comme un achat unique.
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: PRICES.household.toFixed(2),
          priceCurrency: "EUR",
          referenceQuantity: {
            "@type": "QuantitativeValue",
            value: 1,
            unitCode: "MON",
          },
        },
        availability: "https://schema.org/InStock",
        // `/start` n'a qu'UNE URL: c'est une porte fonctionnelle, pas une
        // surface routée par langue (voir `LOCALE_ROUTED_PATHS`). Lui coller un
        // préfixe `/en` déclarerait une page qui n'existe pas.
        url: `${LEGAL_ENTITY.siteUrl}/start`,
      },
    },
  ];
}

/**
 * Le même bloc, recalculé quand la langue de la PAGE change.
 *
 * ⚠️ C'EST UN HOOK ET PAS UNE CONSTANTE, et c'est tout l'objet du fichier.
 * `SEO` garde `structuredData` dans un tableau de dépendances d'`useEffect`:
 * un littéral inline y reconstruirait les balises `<script>` à chaque rendu,
 * une constante de module les figerait à la langue du premier import. Le
 * `useMemo` tient les deux bouts — une identité stable tant que la langue ne
 * bouge pas, un recalcul quand elle bouge.
 */
export function useSalesStructuredData(
  path: string,
  description: string,
): Array<Record<string, unknown>> {
  const locale = uiLocale();
  return useMemo(
    () => salesPageStructuredData({ path, locale, description }),
    [path, locale, description],
  );
}
