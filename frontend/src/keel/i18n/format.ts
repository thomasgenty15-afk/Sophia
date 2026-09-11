// KEEL — L'AUTORITÉ UNIQUE DU FORMATAGE : dates, heures, nombres, prix.
//
// ── LE DÉFAUT QUE CE FICHIER FERME, MESURÉ LE 2026-08-13 ───────────────────
// Vingt-six sites d'affichage décidaient chacun de leur locale, et ils étaient
// EN DÉSACCORD : onze codaient `"en-GB"` en dur, dix ne passaient AUCUN
// argument (donc suivaient `navigator.language`, c'est-à-dire le navigateur du
// visiteur et jamais la langue de l'app), quatre codaient `"fr-FR"`, un codait
// `"en-US"`. `CoachHomePage.tsx` se contredisait à lui seul — `en-GB` à la
// ligne 636, `en-US` à la ligne 776, sur le même écran.
//
// Les deux moitiés du défaut se voient à l'œil :
//   · sur une page FRANÇAISE, un `en-GB` en dur écrit « 7 Aug » au milieu du
//     français (`HouseholdMergeCard` sur `/app/household`, mesuré) ;
//   · sur une page ANGLAISE, un `undefined` écrit « 7 août » chez le visiteur
//     dont le navigateur est français — c'est le défaut inverse, et c'est le
//     plus silencieux des deux parce qu'il ne se reproduit pas chez nous.
//
// ── POURQUOI ICI ET PAS DANS `lib/` ────────────────────────────────────────
// Deux raisons, et la seconde est mécanique. La langue d'interface est décidée
// par `keel/i18n/runtime.ts` ; un module de formatage qui vit ailleurs devient
// un SECOND point de vérité sur la même question — exactement la forme du
// défaut qu'on ferme. Et `scripts/ci/token-lint.mjs` scanne `keel/` comme
// surface : un fichier posé sous `lib/` sortirait du périmètre du garde-fou.
//
// ── CE QUI N'EST PAS UN FORMAT D'AFFICHAGE, ET QUI NE PASSE PAS PAR ICI ────
// ⚠️ `en-CA` n'est PAS une locale d'interface. C'est l'astuce qui produit du
// `yyyy-mm-dd` depuis un `Intl.DateTimeFormat` (`keel/api/dates.ts:22-25`,
// `lib/planSchedule.ts:154`, `StudentProgressPage.tsx` ×2). Son résultat est
// COMPARÉ, STOCKÉ ou sert de CLÉ ; le faire suivre la langue casserait des
// clés, silencieusement, sur des jours entiers de données.
//
// RÈGLE MÉCANIQUE, à appliquer avant de déplacer un appel ici : si le résultat
// est comparé, stocké ou sert de clé, ce n'est pas un format d'affichage.
// `i18n-lint.mjs` blanchit `en-CA` nommément pour cette raison.
//
// De même, `Intl.DateTimeFormat().resolvedOptions().timeZone` ne formate rien :
// il LIT le fuseau de l'appareil. C'est une lecture d'environnement, pas un
// rendu, et elle reste chez ses appelants.

import type { UiLocale } from "./catalog";
import { uiLocale } from "./runtime";

/**
 * LA TABLE DES TAGS, DÉCLARÉE À UN SEUL ENDROIT.
 *
 * ⚠️ `en-GB` ET PAS `en-US`, ET C'EST UNE DÉCISION PRODUIT. Le produit vend en
 * Europe et affiche des euros ; `en-US` rendrait « Aug 7, 2026 » et placerait
 * le mois avant le jour pour un acheteur britannique, irlandais ou néerlandais
 * qui lit l'anglais. Les deux tags coexistaient déjà dans le dépôt, sur le même
 * écran, ce qui est la preuve que personne ne l'avait tranché.
 *
 * La locale d'INTERFACE (`en` | `fr`) et le tag de FORMATAGE (`en-GB` |
 * `fr-FR`) sont deux choses : la première décide des mots, la seconde de
 * l'ordre des nombres. Elles se rejoignent ici, et nulle part ailleurs.
 */
const DISPLAY_LOCALE_TAGS: Readonly<Record<UiLocale, string>> = {
  en: "en-GB",
  fr: "fr-FR",
};

/** Le tag BCP-47 dans lequel cette page doit rendre ses nombres et ses dates. */
export function displayLocaleTag(locale: UiLocale = uiLocale()): string {
  return DISPLAY_LOCALE_TAGS[locale];
}

/** Une date nue (`yyyy-mm-dd`), un horodatage ISO, ou un `Date` déjà construit. */
export type DateInput = string | Date | null | undefined;

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

interface ParsedDate {
  at: Date;
  /**
   * L'entrée était-elle une date CIVILE sans heure ? Le fuseau de rendu en
   * dépend entièrement — voir `zoneFor`.
   */
  dateOnly: boolean;
}

/**
 * ⚠️ LE DÉCALAGE D'UN JOUR, ET POURQUOI IL EST RÉPARÉ ICI UNE FOIS POUR TOUTES.
 *
 * `new Date("2026-08-07")` vaut MINUIT UTC. Rendu dans le fuseau de l'appareil,
 * ça donne le 6 août pour tout utilisateur à l'ouest de Greenwich — la moitié
 * du continent américain lisait donc la veille. `TakeTheHandCard`,
 * `CoachHomePage` et `StudentWeekPlanPage` avaient exactement cette forme ;
 * `StudentProgressPage` la contournait à la main (`${iso}T00:00:00`, sans `Z`),
 * `ShoppingListPanel` autrement (`T00:00:00Z` + `timeZone: "UTC"`). Trois
 * contournements différents pour un seul bug, ce qui est la définition d'un
 * défaut qui n'a pas de propriétaire.
 *
 * La réparation tient en deux gestes qui vont ENSEMBLE, et n'en faire qu'un ne
 * répare rien :
 *   1. parser à MIDI UTC — le motif de `keel/api/dates.ts::dayTokenOf` ;
 *   2. RENDRE en UTC (voir `zoneFor`).
 *
 * Le premier seul laisse le bug à l'est : midi UTC lu à Auckland (UTC+13) est
 * une heure du matin le LENDEMAIN. Le second seul laisse le bug à l'ouest, sur
 * une entrée à minuit. Les deux ensemble donnent le bon jour civil partout, et
 * `format.int.test.ts` le prouve sous `America/Los_Angeles` ET
 * `Pacific/Auckland`.
 */
function parse(value: DateInput): ParsedDate | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : { at: value, dateOnly: false };
  }
  const raw = String(value ?? "").trim();
  if (raw === "") return null;
  const dateOnly = ISO_DATE_ONLY.test(raw);
  const at = new Date(dateOnly ? `${raw}T12:00:00Z` : raw);
  return Number.isNaN(at.getTime()) ? null : { at, dateOnly };
}

/**
 * Le fuseau dans lequel RENDRE.
 *
 * Une date CIVILE (`yyyy-mm-dd`) n'a pas d'instant : « le 7 août » est le 7 août
 * pour tout le monde, et le rendre dans le fuseau de l'appareil est précisément
 * ce qui produit le décalage d'un jour. On la rend donc en UTC, où on l'a
 * parsée.
 *
 * Un HORODATAGE, lui, est un instant : « envoyé à 14 h 03 » veut dire 14 h 03
 * chez le lecteur. Il suit le fuseau de l'appareil, sauf quand l'appelant en
 * nomme un — c'est le cas de tout ce qui doit se lire dans le fuseau DU PROFIL
 * de l'élève et non dans celui du navigateur du coach.
 */
function zoneFor(parsed: ParsedDate, override?: string): string | undefined {
  if (override) return override;
  return parsed.dateOnly ? "UTC" : undefined;
}

/**
 * CE QUE RENDENT CES FONCTIONS SUR UNE ENTRÉE ILLISIBLE : l'entrée elle-même.
 *
 * Pas un throw, et c'est un arbitrage assumé — le même que celui de `t()` en
 * production. Ces valeurs viennent de la base ; faire tomber tout un écran
 * parce qu'une colonne porte une date malformée punirait l'utilisateur d'un
 * défaut de données. La chaîne brute reste à l'écran, donc le défaut se VOIT
 * sans que rien ne casse.
 *
 * ⚠️ Ce n'est PAS le régime des dates de MODÈLE : `keel/api/dates.ts` lève
 * (`assertIsoDate`), parce qu'une date fausse y devient une clé fausse. R7 vaut
 * là-bas ; ici, on affiche.
 */
function fallback(value: DateInput): string {
  return value instanceof Date ? "" : String(value ?? "").trim();
}

export interface DateFormatOptions {
  /** Inclure l'année. Défaut : oui. */
  year?: boolean;
  /** Préfixer du jour de la semaine — « vendredi 7 août ». Défaut : non. */
  weekday?: "short" | "long";
  /** Forcer un fuseau de rendu (celui du profil de l'élève, typiquement). */
  timeZone?: string;
  /** Rendre dans une autre langue que celle de la page. Réservé aux tests. */
  locale?: UiLocale;
}

function dateParts(opts: DateFormatOptions | undefined, month: "short" | "long") {
  return {
    ...(opts?.weekday ? { weekday: opts.weekday } : {}),
    day: "numeric" as const,
    month,
    ...(opts?.year === false ? {} : { year: "numeric" as const }),
  };
}

function render(
  value: DateInput,
  opts: DateFormatOptions | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  const parsed = parse(value);
  if (!parsed) return fallback(value);
  return new Intl.DateTimeFormat(displayLocaleTag(opts?.locale), {
    ...options,
    timeZone: zoneFor(parsed, opts?.timeZone),
  }).format(parsed.at);
}

/** « 7 Aug 2026 » · « 7 août 2026 ». Avec `{ year: false }` : « 7 Aug ». */
export function formatDate(value: DateInput, opts?: DateFormatOptions): string {
  return render(value, opts, dateParts(opts, "short"));
}

/** « 7 August 2026 » · « 7 août 2026 ». Le mois en toutes lettres. */
export function formatDateLong(value: DateInput, opts?: DateFormatOptions): string {
  return render(value, opts, dateParts(opts, "long"));
}

/**
 * LE NOM DU JOUR, seul: « Fri » · « ven. », ou « Friday » · « vendredi ».
 *
 * C'est la forme dont la grille de rythme de `/app/progress` fait TOUS ses
 * en-têtes de colonne — déclarer cette page sans cette fonction donnerait une
 * page française dont chaque colonne dit « Mon Tue Wed ».
 *
 * Pour un jour DEVANT une date (« vendredi 7 août »), c'est
 * `formatDateLong(v, { weekday: "long" })`: une seule chaîne rendue par un
 * seul `Intl`, donc la ponctuation de la langue est respectée.
 */
export function formatWeekday(
  value: DateInput,
  opts?: Omit<DateFormatOptions, "weekday"> & { long?: boolean },
): string {
  return render(value, opts, { weekday: opts?.long ? "long" : "short" });
}

/** « 14:03 » · « 14:03 ». L'heure seule, sur 24 h dans les deux langues livrées. */
export function formatTime(value: DateInput, opts?: DateFormatOptions): string {
  return render(value, opts, { hour: "2-digit", minute: "2-digit" });
}

/** « 7 Aug 2026, 14:03 » · « 7 août 2026 à 14:03 ». */
export function formatDateTime(value: DateInput, opts?: DateFormatOptions): string {
  return render(value, opts, {
    ...dateParts(opts, "short"),
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface NumberFormatOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  locale?: UiLocale;
}

/**
 * « 2 400 » · « 2 400 » — le séparateur de milliers de la langue.
 *
 * Le défaut réel qu'elle ferme : `CoachStudentPage` rendait ses deux bornes de
 * maintenance avec `toLocaleString("en-GB")`, donc « 2,400 » dans une phrase
 * française où la virgule est un séparateur DÉCIMAL. « 2,400 kcal » se lit
 * alors « deux virgule quatre » à un francophone.
 */
export function formatNumber(value: number, opts?: NumberFormatOptions): string {
  if (!Number.isFinite(value)) return String(value);
  return new Intl.NumberFormat(displayLocaleTag(opts?.locale), {
    ...(opts?.minimumFractionDigits !== undefined
      ? { minimumFractionDigits: opts.minimumFractionDigits }
      : {}),
    ...(opts?.maximumFractionDigits !== undefined
      ? { maximumFractionDigits: opts.maximumFractionDigits }
      : {}),
  }).format(value);
}

/**
 * « €12.99 » · « 12,99 € ». La MÊME donnée, deux conventions.
 *
 * ── POURQUOI UN NOMBRE ET PAS UNE CHAÎNE DANS LE SEED ──────────────────────
 * Un prix écrit dans le catalogue est dupliqué par langue, donc il peut
 * DIVERGER : le seed anglais porte aujourd'hui « €12.99 » à un endroit et
 * « 12,99 € » à un autre, pour le même produit. Le montant est un FAIT
 * commercial, pas une traduction ; il vit dans `prices.ts` et la phrase
 * l'interpole.
 *
 * Les centimes tombent quand ils sont nuls : « 7 € » et pas « 7,00 € ». Un prix
 * rond affiché avec deux zéros se lit comme une facture, pas comme une offre.
 */
export function formatPrice(
  amount: number,
  opts?: { currency?: string; locale?: UiLocale },
): string {
  if (!Number.isFinite(amount)) return String(amount);
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat(displayLocaleTag(opts?.locale), {
    style: "currency",
    currency: opts?.currency ?? "EUR",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(amount);
}

/**
 * « 74,20 » · « 74.20 » — UN MONTANT SANS SA MONNAIE, et c'est délibéré.
 *
 * ⛔ POURQUOI PAS `formatPrice`. Ce nombre-là est dans la monnaie du PAYS de la
 * personne, que le produit ne convertit pas et ne nomme nulle part: le champ de
 * budget ne porte aucun symbole, exactement pour ne pas avoir à tenir une table
 * pays → devise (`api/countries.ts` dit ce qu'elle coûterait). Un « € » collé
 * ici s'afficherait tel quel sur un compte américain, dans la phrase même qui
 * refuse son budget.
 *
 * Les centimes ne tombent que s'ils sont nuls: « 75 » et pas « 75,00 », mais
 * « 74,20 » et jamais « 74,2 » — un montant à une décimale se lit comme une
 * mesure, pas comme de l'argent.
 */
export function formatBudgetAmount(value: number, opts?: { locale?: UiLocale }): string {
  if (!Number.isFinite(value)) return String(value);
  return Number.isInteger(value)
    ? formatNumber(value, { locale: opts?.locale })
    : formatNumber(value, {
      locale: opts?.locale,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
}
