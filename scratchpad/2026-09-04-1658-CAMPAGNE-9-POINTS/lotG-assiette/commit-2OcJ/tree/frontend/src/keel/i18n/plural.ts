// KEEL — LE SEUL ENDROIT OÙ « ZÉRO » NE SE DIT PAS PAREIL DANS LES DEUX LANGUES.
//
// ── LE DÉFAUT, EN UNE LIGNE ────────────────────────────────────────────────
// `api/labels.ts` choisissait entre `unit.one.*` et `unit.many.*` sur
// `count === 1`. C'est la règle ANGLAISE, et elle est fausse en français: « 0
// day » se dit « 0 days » en anglais et « 0 jour » en français. Le même code
// rendait donc « 0 portions » sur un plancher à zéro, c'est-à-dire un pluriel
// là où le français met un singulier.
//
// ── POURQUOI PAS `Intl.PluralRules` ────────────────────────────────────────
// Parce qu'il y a EXACTEMENT une divergence à traiter ici, et qu'une API qui en
// gère quarante (`zero`/`one`/`two`/`few`/`many`/`other`, par langue) forcerait
// le seed à porter six formes par unité pour n'en remplir jamais que deux. On
// paierait la complexité d'une famille de langues qu'on ne livre pas, dans le
// fichier qui doit rester le plus lisible du dépôt. Le jour où une langue à
// trois formes entre au catalogue, c'est le seed qui change de forme, et ce
// module devient l'endroit où on le voit — il est déjà le seul appelant.
//
// ── CE QUE CE MODULE NE FAIT PAS ───────────────────────────────────────────
// Il ne devine RIEN sur les mots: il reçoit les deux formes déjà résolues
// depuis le seed et n'en choisit qu'une. Aucune règle de suffixe, aucune
// fabrication de pluriel — R7 vaut ici comme ailleurs, un mot qui manque doit
// manquer bruyamment plutôt que d'être inventé avec un « s ».

import type { UiLocale } from "./catalog";
import { uiLocale } from "./runtime";

/**
 * Ce compte prend-il la forme SINGULIÈRE dans cette langue ?
 *
 * Séparée de `plural` pour être testable sans toucher à la locale du module:
 * la règle est la chose à vérifier, la lecture de la locale courante ne l'est
 * pas.
 *
 * Français: singulier tant qu'on n'atteint pas 2 — « 0 jour », « 1 jour »,
 * « 1,5 jour », puis « 2 jours ». Anglais: singulier pour 1, et pour lui seul.
 * La valeur absolue couvre les bornes négatives, que rien ne produit
 * aujourd'hui mais que rien n'interdit non plus.
 */
export function isSingular(count: number, locale: UiLocale): boolean {
  if (locale === "fr") return Math.abs(count) < 2;
  return count === 1;
}

/**
 * La forme qui va avec ce compte, dans la langue de la page.
 *
 * Les DEUX formes sont passées déjà résolues, donc les deux clés du seed sont
 * lues à chaque appel: une unité dont une seule des deux formes existe échoue
 * au premier rendu, quel que soit le nombre — plutôt qu'un jour sur deux.
 */
export function plural(count: number, one: string, other: string): string {
  return isSingular(count, uiLocale()) ? one : other;
}
