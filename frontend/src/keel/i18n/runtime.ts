// KEEL — la locale d'interface COURANTE, résolue une fois au démarrage.
//
// ── POURQUOI UNE VARIABLE DE MODULE ET PAS UN CONTEXTE REACT ───────────────
// `t()` est une fonction pure appelable de partout, et c'est ce qui rend la
// traduction bon marché: `keel/api/labels.ts` (723 lignes), `coachProtocol.ts`,
// `inviteStudent.ts`, `freeSignup.ts` l'appellent depuis du code qui n'est pas
// un composant. Un hook obligerait à faire passer `t` à travers toute cette
// couche, ou à maintenir un SECOND point de vérité pour la locale courante —
// exactement la classe de bug que ce chantier existe pour fermer.
//
// Le prix: changer de langue RECHARGE la page. Pour une préférence qu'on
// modifie une fois par visiteur, c'est le bon échange.

import {
  composeProfileLocale,
  DEFAULT_UI_LOCALE,
  isLocaleRoutedPath,
  isTranslatedNamespace,
  localePath,
  namespacesForPath,
  parseUiLocale,
  stripLocalePrefix,
  type UiLocale,
} from "./catalog";

/** Là où le choix du visiteur survit à un rechargement. */
export const UI_LOCALE_STORAGE_KEY = "sophia.ui_locale";

let current: UiLocale = DEFAULT_UI_LOCALE;
let initialised = false;

function safeStorage(): Storage | null {
  // Un navigateur en navigation privée peut jeter sur l'accès lui-même, pas
  // seulement sur l'écriture. Le switch de langue ne doit pas faire tomber la
  // vitrine parce qu'un visiteur a désactivé le stockage.
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Résout la locale d'interface. Appelé UNE fois, avant le premier rendu.
 *
 * Ordre de priorité, du plus explicite au plus deviné:
 *   1. `?lang=fr` — un lien partagé qui nomme sa langue
 *   2. le choix précédent du visiteur (`localStorage`)
 *   3. `navigator.languages` — sa préférence système
 *   4. l'anglais, qui est le défaut DÉCLARÉ (et le `x-default` du SEO)
 *
 * On ne lit PAS le profil ici, et c'est délibéré: la session met deux
 * allers-retours à se résoudre, et bloquer le premier rendu derrière elle
 * donnerait une vitrine blanche au visiteur anonyme — c'est-à-dire à
 * l'acheteur. Le rapprochement avec `profiles.locale` se fait après, une fois
 * la session connue.
 */
export function initUiLocale(): UiLocale {
  if (initialised) return current;

  const params = new URLSearchParams(globalThis.location?.search ?? "");
  const fromQuery = params.get("lang");
  const fromStorage = safeStorage()?.getItem(UI_LOCALE_STORAGE_KEY) ?? null;
  const fromNavigator = (globalThis.navigator?.languages ?? []).find((tag) =>
    parseUiLocale(tag) !== DEFAULT_UI_LOCALE
  ) ?? globalThis.navigator?.language ?? null;

  const resolved = fromQuery
    ? parseUiLocale(fromQuery)
    : fromStorage
    ? parseUiLocale(fromStorage)
    : parseUiLocale(fromNavigator);

  current = resolved;
  initialised = true;
  // La langue du DOCUMENT est celle de la PAGE, pas celle du visiteur: sur une
  // page non traduite les deux diffèrent, et c'est la page qu'un lecteur
  // d'écran va prononcer.
  applyDocumentLang(uiLocale());
  // Un `?lang=` explicite vaut choix: sinon le visiteur qui suit un lien
  // français repasse en anglais dès qu'il clique sur une autre page.
  if (fromQuery) safeStorage()?.setItem(UI_LOCALE_STORAGE_KEY, resolved);
  return resolved;
}

// ── LA FRONTIÈRE DE LANGUE, ET POURQUOI ELLE EST ICI ───────────────────────
//
// Elle était censée passer AU BORD des pages non traduites. Elle passait en
// fait EN PLEIN MILIEU: mesuré le 2026-08-12 sur `/start`, un visiteur au
// navigateur français lisait un en-tête et un pied de page traduits autour
// d'un corps entièrement anglais, parce que `public.*` est traduit et que le
// namespace du corps ne l'était pas. Le même défaut valait pour `/gyms`,
// `/communities`, `/join` et `/join-household`.
//
// ── POURQUOI LA RÉSOUDRE ICI ET PAS DANS LE CHROME ────────────────────────
// Donner une prop « ma page n'est pas traduite » à `PublicHeader` marcherait
// une fois, puis la page suivante l'oublierait. `t()` est le SEUL point par
// où passe chaque mot rendu; corriger la langue ici, c'est la corriger pour
// tout ce qu'une page affiche, y compris ce qu'on écrira demain. Aucun écran
// ne peut plus se tromper individuellement — il n'y a plus de choix par écran.
//
// Le prix, et il est assumé: `uiLocale()` dépend maintenant de l'URL courante.
// C'est pour ça que `chosenUiLocale()` existe juste en dessous — un sélecteur
// de langue doit montrer le CHOIX du visiteur, jamais ce que la page a pu en
// faire, sinon son clic ressemble à un bouton mort.

/**
 * La langue dans laquelle une page donnée peut se rendre ENTIÈREMENT.
 *
 * Deux façons de retomber sur l'anglais, et elles ne disent pas la même chose:
 *
 *   · un chemin NON DÉCLARÉ — personne n'a promis de le traduire;
 *   · un chemin déclaré dont un seul namespace n'est pas traduit — la promesse
 *     existe mais n'est pas tenue, et une page à moitié tenue est une couture.
 *
 * ⚠️ LE CHEMIN INCONNU RENDAIT `current`, ET C'ÉTAIT UN PIÈGE ARMÉ. Tant
 * qu'aucun namespace d'app n'était traduit, `t()` repliait de toute façon sur
 * l'anglais et le défaut ne se voyait pas. Depuis que `household.*` est traduit
 * (pour `/app/setup`), une route oubliée — `/account`, qui rend
 * `household.plan.*` — se serait mise à afficher une phrase française au milieu
 * d'un écran anglais, sans que rien ne le signale. L'anglais par défaut est le
 * seul repli qui ne peut pas coudre: il ne fait que rester dans la langue
 * source.
 *
 * La condition est `every(isTranslatedNamespace)` et NON « aucun n'est en
 * attente »: la liste d'attente est tenue à la main, donc un namespace qu'on a
 * oublié d'y inscrire passait la garde. La liste traduite, elle, n'a pas ce
 * défaut — on ne peut pas oublier d'y inscrire ce qu'on vient d'écrire, le
 * compilateur le réclame.
 */
export function uiLocaleForPath(pathname: string): UiLocale {
  const namespaces = namespacesForPath(pathname);
  if (namespaces === null) return DEFAULT_UI_LOCALE;
  if (!namespaces.every(isTranslatedNamespace)) return DEFAULT_UI_LOCALE;
  // ⚠️ L'URL PASSE AVANT LE VISITEUR, ET SUR CES QUATRE PAGES SEULEMENT.
  // `LOCALE_ROUTED_PATHS` (voir `catalog.ts`) porte le pourquoi en entier: ce
  // sont les surfaces indexées, et une alternative `hreflang` n'existe que si
  // chaque langue a SON URL. L'ordre compte — la vérification de traduction
  // reste AU-DESSUS: `/en/couples` ne peut pas forcer l'anglais sur une page
  // dont un namespace manquerait, elle retomberait de toute façon sur
  // l'anglais, mais `/couples` ne doit jamais promettre un français qui
  // n'est pas écrit.
  if (isLocaleRoutedPath(pathname)) {
    return stripLocalePrefix(pathname).locale ?? "fr";
  }
  return current;
}

/**
 * La locale EFFECTIVE de ce qui est à l'écran. `t()` et `SEO` s'en servent.
 *
 * Lue à l'appel plutôt que mémorisée au montage: sous React Router, une
 * navigation client met `history` à jour AVANT de prévenir ses abonnés, donc
 * `location.pathname` est déjà le bon quand le rendu suivant appelle `t()`.
 */
export function uiLocale(): UiLocale {
  return uiLocaleForPath(globalThis.location?.pathname ?? "");
}

/**
 * Ce que le VISITEUR a choisi, indépendamment de la page qu'il lit.
 *
 * Le sélecteur de langue lit celle-ci. Avec `uiLocale()`, il afficherait
 * « EN » actif sur une page non traduite alors que le choix enregistré est le
 * français — et le clic sur « FR » n'aurait aucun effet visible sur cette
 * page-là, ce qui se lit comme un bouton cassé plutôt que comme une frontière.
 */
export function chosenUiLocale(): UiLocale {
  return current;
}

/**
 * LA VALEUR À ÉCRIRE DANS `profiles.locale` QUAND UN COMPTE SE CRÉE.
 *
 * ── POURQUOI CETTE FONCTION NE LIT PLUS LE DRAPEAU ELLE-MÊME ──────────────
 *
 * Elle appelait `chosenUiLocale()` en interne: le drapeau de l'en-tête ÉTAIT le
 * choix, et aucun formulaire ne posait la question. Les portes demandaient en
 * revanche le PAYS, sous un texte d'aide qui se justifiait par le numéro
 * d'urgence — une question dont le produit n'a pas l'usage aujourd'hui, posée à
 * la place de la seule qui change ce que la personne va lire à chaque tour.
 *
 * Les formulaires portent donc maintenant un champ « Langue », et c'est SON
 * état qui arrive ici. Le paramètre est REQUIS: optionnel avec un repli sur le
 * drapeau, une porte qui oublierait de brancher son champ écrirait en silence
 * autre chose que ce que la personne a coché, et rien ne le dirait. Requis, le
 * compilateur énumère les quatre portes.
 *
 * ⚠️ LE CHAMP ET LE DRAPEAU PEUVENT DIVERGER, ET C'EST VOULU. Le drapeau change
 * la langue de la PAGE et recharge; le champ décide la langue du COMPTE et ne
 * recharge pas — sans quoi il détruirait le formulaire en cours de saisie.
 * Quelqu'un qui lit la page en français peut vouloir être coaché en anglais.
 * Le champ naît sur `chosenUiLocale()`, donc les deux s'accordent tant que
 * personne ne les sépare exprès.
 *
 * Le second argument est `null` par nature: à l'inscription il n'existe aucune
 * ligne `profiles`, donc aucune région à préserver. `composeProfileLocale`
 * retombe alors sur le défaut déclaré de la langue.
 */
export function signupProfileLocale(chosen: UiLocale): string {
  return composeProfileLocale(chosen, null);
}

/**
 * RÉSERVÉ AUX TESTS. La vitrine passe par `initUiLocale` (au démarrage) ou
 * `setUiLocaleAndReload` (au clic); ni l'un ni l'autre n'est rejouable dans un
 * même processus, ce qui rend les deux langues intestables sans ce point
 * d'entrée. Nommé pour qu'un appel hors test se voie en relecture.
 */
export function setChosenUiLocaleForTest(locale: UiLocale): void {
  current = locale;
  initialised = true;
}

/**
 * L'attribut `lang` du document, écrit à UN endroit.
 *
 * Il était réécrit en dur à `"en"` par trois composants (`PublicHeader`,
 * `KeelAppShell`, `Auth`), chacun au montage. Trois écrivains pour un attribut
 * veut dire que le dernier monté gagne — donc que la valeur dépend de l'ordre
 * de rendu, ce qui n'est pas une décision qu'on prend.
 */
export function applyDocumentLang(locale: UiLocale): void {
  const root = globalThis.document?.documentElement;
  if (root) root.lang = locale;
}

/**
 * À QUI APPARTIENT LA DÉCISION DE LANGUE DÉJÀ PRISE DANS CET ONGLET.
 *
 * ── CE QUE CETTE CLÉ ÉTAIT, ET LE DÉFAUT QU'ELLE PORTAIT ──────────────────
 *
 * Elle s'appelait `sophia.ui_locale_adopted` et valait `"1"` — un booléen
 * « une décision a eu lieu ici ». Le garde était donc par ONGLET pendant que
 * la décision qu'il gèle est par COMPTE, et ces deux portées ne se recouvrent
 * pas. Mesuré le 2026-08-14: un clic FR sur la vitrine (donc SANS session,
 * donc sans écriture en base) posait `"1"`, puis l'inscription qui suivait
 * dans le même onglet ne pouvait plus adopter la langue du compte. Écran
 * français, compte anglais, agent anglais — et rien à l'écran pour le dire.
 * C'est ce qui a rendu INVISIBLE l'écrasement SQL de `profiles.locale`
 * (migration `20260813100000`): le seul symptôme visible était masqué par ce
 * garde. Aucune fonction n'effaçait la clé, pas même la déconnexion.
 *
 * ── CE QU'ELLE EST MAINTENANT ─────────────────────────────────────────────
 *
 * L'IDENTIFIANT du compte pour lequel la décision a été prise, ou `"anon"`
 * quand personne n'était connecté. Le garde ne mord donc que sur CE compte:
 * un autre compte dans le même onglet — et un compte quelconque après un clic
 * anonyme — retrouve le droit d'imposer sa langue, qui est la règle du
 * produit (la langue est celle de l'inscription).
 *
 * Ce qu'il protège n'a pas changé et reste armé: un clic délibéré que la base
 * n'a PAS pu enregistrer (réseau) ne doit pas être annulé en silence au
 * rechargement suivant — voir `setUiLocaleAndReload`.
 *
 * ⚠️ LA CLÉ A CHANGÉ DE NOM EXPRÈS. Les onglets ouverts qui portent encore
 * l'ancienne valeur ne sont plus lus par personne, donc ils se débloquent au
 * lieu de rester figés sur une décision qu'on ne sait plus attribuer.
 *
 * `sessionStorage` et pas `localStorage`: le garde doit mourir avec l'onglet.
 * Persistant, il gèlerait pour toujours une divergence devenue réelle — par
 * exemple après que la personne a changé de langue depuis un autre appareil.
 */
const LOCALE_DECISION_OWNER_KEY = "sophia.ui_locale_decided_for";

/** Le propriétaire d'une décision prise hors session. Jamais un identifiant. */
export const ANONYMOUS_LOCALE_OWNER = "anon";

function safeSessionStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** Le compte pour lequel cet onglet a déjà tranché, `null` s'il n'a rien tranché. */
export function uiLocaleDecisionOwner(): string | null {
  const raw = safeSessionStorage()?.getItem(LOCALE_DECISION_OWNER_KEY) ?? "";
  return raw.trim() ? raw : null;
}

export function markUiLocaleDecision(owner: string): void {
  safeSessionStorage()?.setItem(LOCALE_DECISION_OWNER_KEY, owner);
}

/**
 * Oublier la décision de cet onglet. Appelé à la DÉCONNEXION.
 *
 * La portée par compte suffirait à laisser le suivant décider — il ne
 * correspondrait pas au propriétaire enregistré. On efface quand même, parce
 * qu'une décision prise dans une session qui n'existe plus n'a aucune raison
 * de survivre à qui l'a prise: sur un poste partagé, c'est la personne
 * suivante qui en hériterait.
 */
export function forgetUiLocaleDecision(): void {
  safeSessionStorage()?.removeItem(LOCALE_DECISION_OWNER_KEY);
}

/**
 * Change de langue et RECHARGE.
 *
 * Le rechargement n'est pas une paresse: `t()` est résolu à l'appel depuis une
 * variable de module, et plusieurs constantes de module (les données
 * structurées SEO de la landing, la table des refus d'invitation) appellent
 * `t()` à l'IMPORT. Elles se figeraient à la langue du premier chargement.
 * Recharger rend la bascule totale et sans cas particulier.
 *
 * `owner` est REQUIS, et c'est le compte au nom duquel on tranche
 * (`ANONYMOUS_LOCALE_OWNER` hors session). Optionnel, il aurait un défaut —
 * et un défaut ici veut dire une décision attribuée à quelqu'un qui ne l'a pas
 * prise, ce qui est exactement le défaut que la portée par compte ferme.
 */
export function setUiLocaleAndReload(next: UiLocale, owner: string): void {
  // UN CLIC DÉLIBÉRÉ GAGNE, POUR CE COMPTE ET DANS CET ONGLET. Sans cette
  // ligne, la réconciliation d'`AuthProvider` relirait `profiles.locale` juste
  // après le rechargement et ANNULERAIT le clic — silencieusement — quand
  // l'écriture en base n'a pas suivi (réseau). Le garde meurt avec l'onglet,
  // donc la langue du compte reprend la main à la session suivante; c'est la
  // bonne durée pour un désaccord qu'on ne sait pas trancher.
  //
  // ⚠️ AVANT le court-circuit ci-dessous, et pas après: rechoisir la langue
  // DÉJÀ affichée est un geste délibéré comme un autre. C'est même le seul que
  // fasse quelqu'un dont l'écran est français et le compte anglais — le
  // marquer est ce qui rend son clic durable au lieu d'être un bouton mort.
  markUiLocaleDecision(owner);

  const url = new URL(globalThis.location.href);
  // ⚠️ SUR UNE SURFACE ROUTÉE PAR LANGUE, LE CLIC EST UNE NAVIGATION. `/couples`
  // et `/en/couples` sont deux URL, et changer de langue veut dire changer
  // d'URL — sans quoi la balise `canonical` de la page et la langue affichée
  // se contrediraient, et l'adresse qu'un lecteur copierait ne rendrait pas ce
  // qu'il a sous les yeux. `localePath` rend le chemin inchangé ailleurs, donc
  // le produit connecté ne bouge pas.
  const targetPath = localePath(url.pathname, next);

  // ⚠️ LE COURT-CIRCUIT REGARDE MAINTENANT LES DEUX MÉMOIRES, ET C'EST UN
  // BOUTON MORT QU'IL ÉVITE. Quelqu'un dont le choix enregistré est « en » qui
  // ouvre `/couples` (française PAR SON URL) et clique « EN »: `next` égale
  // `current`, l'ancien test sortait, et rien ne se passait sur une page qui
  // affiche pourtant du français. La condition de sortie est donc « la langue
  // NI l'URL n'ont à changer ».
  if (next === current && targetPath === url.pathname) return;

  safeStorage()?.setItem(UI_LOCALE_STORAGE_KEY, next);
  // On retire `?lang` de l'URL: le laisser ferait gagner l'ancienne valeur au
  // rechargement (priorité 1), et le clic n'aurait aucun effet visible.
  url.searchParams.delete("lang");
  url.pathname = targetPath;
  globalThis.location.replace(url.toString());
}
