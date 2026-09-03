// LA LISTE DES PAGES À PRÉRENDRE — LUE AU BUILD, JAMAIS PAR L'APPLICATION.
//
// ⚠️ CE FICHIER EST SÉPARÉ DE `head.ts`, ET LA RAISON EST UNE GARDE QUI A
// MORDU. `pageSeams.int.test.ts` marche le graphe d'imports de chaque route et
// refuse qu'une page ATTEIGNE un namespace qu'elle n'a pas déclaré. La table
// ci-dessous nomme les quatre namespaces de vente en littéral; tant qu'elle
// vivait dans `head.ts` — importé par `SEO.tsx`, donc par les quatre pages —
// chaque page atteignait les trois autres. Douze coutures d'un coup.
//
// La garde avait raison: une page de vente n'a aucune affaire à porter les
// clés des trois autres dans son bundle. Cette table est une donnée de BUILD.
// Seul `scripts/prerender.mjs` l'importe, et il tourne sous Node.
//
// ⚠️ N'IMPORTE JAMAIS CE FICHIER DEPUIS UN COMPOSANT. Le test le dira, mais il
// le dira en douze lignes dont la cause n'est pas évidente — d'où cette note.

import type { MessageKey } from "../i18n/t";

/**
 * LES PAGES QU'ON VEUT VOIR INDEXÉES, ET LES CLÉS QUI LES DÉCRIVENT.
 *
 * `path` est le chemin CANONIQUE FRANÇAIS. La variante anglaise s'en déduit
 * par `localePath` — elle n'est pas écrite ici, pour qu'il soit impossible de
 * n'en changer qu'une des deux.
 *
 * ⚠️ CETTE TABLE EST LA MÊME LISTE QUE `LOCALE_ROUTED_PATHS` d'`i18n/catalog.ts`,
 * vue sous un autre angle: là-bas « quelles pages tirent leur langue de leur
 * URL », ici « que dit leur en-tête ». `seoHead.int.test.ts` vérifie que les
 * deux listes se recouvrent exactement — sans quoi une page routée par langue
 * sans entrée ici serait prérendue avec l'en-tête du hall.
 */
export const INDEXED_PAGES: ReadonlyArray<{
  path: string;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
}> = [
  { path: "/", titleKey: "home.seo_title", descriptionKey: "home.seo_description" },
  { path: "/meal-prep", titleKey: "mealprep.seo_title", descriptionKey: "mealprep.seo_description" },
  { path: "/couples", titleKey: "couples.seo_title", descriptionKey: "couples.seo_description" },
  { path: "/families", titleKey: "families.seo_title", descriptionKey: "families.seo_description" },
];
