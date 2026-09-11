import React from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { loadStudentGoal } from "../api/chat";
import { loadKeelRole } from "../api/keelClient";
import { ACCEPTED_PHOTO_MIME_TYPES } from "../api/mealPhoto";
import {
  forcedSlotLabel,
  SLOT_ORDER,
  slotMealSwitchOfferable,
} from "../api/slotMeal";
import { armQuickAdd } from "../lib/quickAdd";
import { t } from "../i18n/t";
import { TrialEndingBanner } from "./TrialEndingBanner";
import { BrandMark } from "./BrandMark";
import {
  getUnreadCount,
  startUnreadTracking,
  stopUnreadTracking,
  subscribeUnread,
} from "../lib/chatUnread";
import { Page, PageHeader, type PageWidth } from "./ui/Page";

// KEEL — chrome shared by every connected KEEL screen, coach and student.
// Sober on purpose: the plan is the interface, the chrome is a way back to it.
// One top bar for both spaces so the product feels like one product; only the
// nav entries change with the variant.
//
// ── L'ÉLÈVE EST SUR UN TÉLÉPHONE, ET LA BARRE NE TENAIT PAS DEDANS ───────────
// MESURÉ au navigateur à 375 px: le document faisait 739 px de large. Une SEULE
// rangée portait la marque, six entrées de nav, le compte, les mentions légales
// et la déconnexion — donc « Progress », « Health », « Account », « Legal » et
// « Sign out » vivaient hors écran, sur TOUS les écrans élève, atteignables
// seulement par un scroll horizontal que rien n'annonce. Sur `/app/progress`
// l'onglet ACTIF lui-même était hors champ: l'élève ne pouvait pas voir où il
// était.
//
// Deux états, coupés à `xl` (1280 px):
//   < xl  : marque + bouton Menu en haut, et la barre d'onglets EN BAS pour
//           l'élève — le pouce est en bas de l'écran, pas en haut.
//   >= xl : la barre d'origine, intacte. Le desktop n'avait pas de problème.
//
// ── ⚠️ LA COUPURE A ÉTÉ MESURÉE DEUX FOIS, ET LA PREMIÈRE MESURE ÉTAIT EN
//    ANGLAIS SEULEMENT ─────────────────────────────────────────────────────
// Elle était à `lg` (1024 px), sur cette mesure-ci, qui reste vraie: à 768 px la
// rangée complète demande ~754 px de contenu pour 736 px utiles, donc elle tient
// en repliant « My week's plan » et « Meal ideas » sur deux lignes — une barre
// qui « tient » de justesse et qui est laide.
//
// Mais l'app est devenue BILINGUE le 2026-08-13, et le pack français est plus
// long de 10 à 25 % sur chaque libellé de navigation. MESURÉ à 1024 px en
// français: la rangée demande ~1 008 px pour 992 px utiles, et comme les deux
// `<nav>` sont des enfants flex à `min-width: auto` que rien ne fait rétrécir,
// elles ne débordent pas — elles S'IMPRIMENT L'UNE SUR L'AUTRE.
// « Progression » recouvrait « Compte » de 17 px et « Compte » recouvrait
// « Santé » de 49 px, avec `scrollWidth - clientWidth = 0`: donc SILENCIEUX,
// rien ne défilait pour le révéler. En anglais, aucun chevauchement.
//
// La coupure des DESTINATIONS passe donc à `xl`. Une tablette et un petit
// portable héritent du menu et de la barre du bas, ce qui reste le bon défaut:
// ça se tape aussi au doigt, et c'est déjà l'argument qui avait écarté `md`.
//
// ⚠️ ET MONTER LE SEUIL NE RÉPARAIT RIEN, PARCE QUE LE SEUIL N'ÉTAIT PAS LA
// CAUSE. Le conteneur de la rangée est `max-w-6xl`: **1 152 px quelle que soit
// la largeur de l'écran**. Il ne grandit jamais. Essayé et mesuré: à `xl`
// (1 280 px) « Compte » recouvrait encore « Foyer » de 71 px, et à `2xl`
// (1 536 px) exactement pareil. En français la rangée complète réclame
// ~1 184 px — 770 px de destinations, 318 px de groupe secondaire, plus le
// mot-symbole et les gouttières — pour 1 152 px disponibles, à toutes les
// tailles d'écran.
//
// LE GROUPE SECONDAIRE EST DONC SORTI DE LA RANGÉE POUR DE BON (voir le
// commentaire à son emplacement). Il vit dans le menu, et le bouton Menu est
// visible à toutes les largeurs.
//
// ── ⛔ CE QUI RESTE À `xl`, ET CES TROIS-LÀ BOUGENT ENSEMBLE ────────────────
//   les DESTINATIONS entrent dans la rangée (`xl:flex`), la barre du bas s'en
//   va (`xl:hidden`), et la réserve de padding s'en va avec elle (`xl:pb-0`).
//   Les désunir donne soit une barre du bas sans réserve — le dernier bouton de
//   chaque écran passe dessous —, soit une réserve de 4 rem sous une barre
//   absente.
//   Le bouton Menu, lui, n'a PLUS de seuil: il est là partout, parce qu'il est
//   le seul chemin vers le compte, les mentions légales et la déconnexion.

// ── LE « + » AU MILIEU DE LA BARRE, ET POURQUOI IL EST LÀ ──────────────────
// Le seul chemin pour déclarer un repas non prévu, une photo ou un poids était
// le « + » DU COMPOSEUR de `/app/chat`: il fallait donc savoir qu'on déclare un
// repas en ouvrant une conversation, puis trouver un bouton à côté du champ de
// saisie. Sur un téléphone, le geste le plus courant du produit était le plus
// caché.
//
// Il prend la colonne CENTRALE de la barre d'onglets — la seule que le pouce
// atteint sans déplacer la main — et il se déplie vers le haut. Les trois
// gestes sont les MÊMES qu'au composeur, dans le même ordre et avec les mêmes
// libellés: photographier, décrire, se peser.
//
// ⛔ IL N'EXÉCUTE AUCUN DES TROIS. Il ARME l'intention (`lib/quickAdd.ts`) et
// va sur `/app/chat`, qui les porte déjà en entier — l'aperçu avant envoi et sa
// légende, le créneau choisi avant le champ, le jeton de pesée et sa garde de
// montage. Les réécrire ici ferait une deuxième implémentation de chacun.
//
// ⚠️ IL N'EXISTE PAS AU-DESSUS DE `xl`: la barre du bas non plus. Le composeur
// garde son « + » sur grand écran, et c'est le même geste.

export type ShellVariant = "student" | "coach";

export type NavItem = {
  to: string;
  label: () => string;
  /**
   * Libellé de la barre du bas, quand le libellé complet n'y tient pas.
   * « My week's plan » sur une colonne de 75 px se replie sur trois lignes.
   */
  short?: () => string;
  end?: boolean;
  /**
   * Dans la barre d'onglets du téléphone. Au plus QUATRE — la CINQUIÈME colonne
   * est celle du « + », et au-delà de cinq les colonnes deviennent trop
   * étroites pour être visées au pouce. Le reste vit dans le menu, qui lui est
   * complet.
   *
   * ⚠️ LE PLAFOND ÉTAIT DE CINQ ET IL EST DESCENDU À QUATRE le jour où le « + »
   * a pris sa colonne. Une entrée de plus ne casserait rien de visible: elle
   * rétrécirait les six colonnes ensemble, et c'est le « + » — au milieu, donc
   * le plus visé — qui perdrait sa cible en premier.
   */
  bottom?: boolean;
  /**
   * ⚠️ CETTE ENTRÉE MÈNE À UN ÉCRAN QUI REFUSE QUI N'EST PAS ÉLÈVE.
   *
   * `/app/today` est derrière `KeelStudentRoute`, qui exige
   * `profiles.keel_role = 'student'`. La réclamation d'un profil de foyer
   * n'écrit JAMAIS ce rôle (`20260811060000`, en toutes lettres) — un compte
   * supplémentaire voyait donc, EN PREMIÈRE POSITION de sa barre d'onglets, le
   * seul lien de tout son espace qui lui réponde « tu n'es pas un élève ».
   *
   * ⛔ C'EST L'INVERSE DE LA RÈGLE EN TÊTE DE CE FICHIER, ET ÇA COÛTE PLUS
   * CHER. « Une route sans lien est une fonctionnalité que personne n'a »; un
   * lien vers un refus est pire — il apprend que le produit est cassé, sur le
   * premier geste. La règle et son inverse se tiennent ensemble: le lien existe
   * pour qui l'écran accepte, et pour personne d'autre.
   */
  needsStudentRole?: boolean;
};

// A ROUTE WITH NO LINK IS A FEATURE NOBODY HAS.
// `/app/meals` shipped with Q6 and was reachable only by typing the URL: the
// student's nav had two entries and the meal week was not one of them. That is
// the "thirteen unwired modules" failure one layer up — `wiring-check` owns the
// edge from a module to its caller, and a React route IS a caller, so the check
// stayed green while the whole screen was unreachable. The `/app/meals` entry
// that closed that gap was itself REMOVED on 2026-09-03 (P4): the coach's
// library has no student reader any more, and the bottom bar has four tabs.
// The rule outlives the screen that taught it.
// ⚠️ TROIS EXPORTS NON-COMPOSANTS DANS UN FICHIER DE COMPOSANTS, ET LA RÈGLE
// `react-refresh/only-export-components` MORD SUR LES TROIS. Ils sont ici parce
// que la suite front tourne en `node` et ne monte AUCUN composant: une règle
// enfermée dans le rendu n'aurait pas d'épreuve, et les trois décident de ce
// que quelqu'un voit sur son premier écran. Le remède propre est un module à
// part; c'est un lot en soi, et `ui/Button.tsx` porte la même dérogation pour
// la même raison. Ce qu'on perd est le rafraîchissement à chaud DE CE FICHIER,
// en développement, rien d'autre.
// eslint-disable-next-line react-refresh/only-export-components
export const NAV: Record<ShellVariant, NavItem[]> = {
  student: [
    {
      to: "/app/today",
      label: () => t("app.nav.today"),
      short: () => t("app.nav.today.short"),
      bottom: true,
      // Voir `needsStudentRole`: `/app/today` est le SEUL écran de l'espace
      // qui refuse un profil réclamé, et il était son premier onglet.
      needsStudentRole: true,
    },
    // DE-WHATSAPP — la conversation doit être à ≤1 tap depuis tout l'espace
    // élève. Elle est en deuxième position, pas en dernière: c'est le canal,
    // pas une annexe.
    {
      to: "/app/chat",
      label: () => t("app.nav.chat"),
      short: () => t("app.nav.chat.short"),
      bottom: true,
    },
    // PIVOT N3 — une route sans lien est une fonctionnalité que personne n'a
    // (voir la note en tête de ce fichier): l'écran plan arrive avec son
    // entrée de nav dans le même changement.
    {
      to: "/app/plan",
      label: () => t("app.nav.plan"),
      short: () => t("app.nav.plan.short"),
      bottom: true,
    },
    { to: "/app/progress", label: () => t("app.nav.progress"), bottom: true },
    // LE FOYER. Il arrive avec son entrée dans le même changement, pour la
    // règle en tête de ce fichier: une route sans lien est une fonctionnalité
    // que personne n'a. Et elle compte double ici — sans cette page, un
    // deuxième membre n'a AUCUNE raison d'ouvrir l'app, ce qui rend le modèle
    // multi-comptes infacturable (PIVOT-FOYER §8.2c).
    { to: "/app/household", label: () => t("app.nav.household") },
    // ⚠️ « CE QUE SOPHIA SAIT » — ET ELLE ARRIVE AVEC SON ENTRÉE, PARCE QUE
    // SANS ELLE LE LOT NE SERT À RIEN. La surface existait déjà, montée dans
    // une carte repliée en bas de `/app/plan`: la promesse « rien d'opaque »
    // dépendait du hasard d'un défilement. La déplacer sur une route sans lui
    // donner de lien referait le même défaut avec une URL de plus — c'est le
    // cas extrême de la règle en tête de ce fichier.
    //
    // ⛔ PAS DANS LA BARRE DU BAS, ET C'EST UN CHOIX. Elle est PLEINE à cinq
    // (au-delà, les colonnes deviennent trop étroites pour être visées au
    // pouce), et cet écran n'est pas quotidien: on l'ouvre quand on se demande
    // « qu'est-ce qu'il sait de moi ? », pas tous les matins. Il vit dans le
    // menu, qui est complet.
    { to: "/app/about-you", label: () => t("app.nav.about_you") },
    // PAS D'ENTRÉE « Cards », ET CE N'EST PAS UN OUBLI À RÉPARER.
    // `/app/cards` a eu son entrée ici, au nom de la règle en tête de ce
    // fichier. La règle était bien appliquée et la conclusion était fausse: la
    // page exige un `plan_versions` PUBLIÉ et retombe sinon sur l'état
    // `no_plan`, or le modèle 1:N n'en publie jamais (docs/keel/MODEL.md). Le
    // lien menait donc à un écran vide en permanence — le catalogue est celui
    // des cartes d'attaque/défense du produit grand public, pas de KEEL.
    // La route survit en redirection vers `/app/today` (voir App.tsx); ce qui a
    // été retiré, c'est la promesse. Ne la remets pas sans que l'élève ait un
    // plan publié à lire.
  ],
  coach: [
    // `end` so /coach/templates and /coach/clients/:id do not light "Students".
    { to: "/coach", label: () => t("shell.nav.students"), end: true },
    // LA MÉTHODE prend la place des TEMPLATES. Le coach exprimait sa méthode
    // sur deux écrans qui faisaient le même travail (`/coach/import` et
    // `/coach/templates`), en engagements structurés qu'il n'a aucune raison de
    // connaître. Il l'exprime maintenant ici, en postures et en règles, et les
    // engagements en sont dérivés.
    // `/coach/templates` garde sa route sans lien tant que la migration des
    // coachs déjà équipés n'est pas tranchée: c'est le seul cas où une route
    // sans entrée de nav est légitime ici, et il est temporaire.
    { to: "/coach/protocol", label: () => t("shell.nav.protocol") },
    // A ROUTE WITH NO LINK IS A FEATURE NOBODY HAS (see the note above): the
    // doctrine screen ships with its nav entry in the same change.
    { to: "/coach/doctrine", label: () => t("shell.nav.doctrine") },
    // LA BIBLIOTHÈQUE DE RECETTES. Elle a été livrée le 04/08 jusqu'à l'API
    // cliente — six fonctions exportées, zéro appelant — et sans écran ni
    // entrée ici. C'est le cas extrême de la règle en tête de ce fichier: le
    // coach pouvait « ajouter une photo » au sens où le serveur l'acceptait, et
    // nulle part au sens où il l'aurait fait.
    { to: "/coach/meals", label: () => t("shell.nav.meals") },
    // C5: the Monday read. It shipped with its nav entry for exactly the
    // reason above — the synthesis had been written weekly for nobody.
    { to: "/coach/weekly", label: () => t("shell.nav.weekly") },
  ],
};

/**
 * LE COMPTEUR DE NON-LUS, branché sur la barre.
 *
 * ── PAS DE `stopUnreadTracking` AU DÉMONTAGE, ET C'EST DÉLIBÉRÉ ─────────────
 * Chaque page élève rend son propre `KeelAppShell`, donc cette barre se démonte
 * et se remonte à CHAQUE navigation. React monte le nouvel écran AVANT de
 * démonter l'ancien: un `return () => stopUnreadTracking()` s'exécuterait donc
 * juste après le démarrage idempotent du nouveau, couperait l'abonnement, et
 * plus rien ne le rallumerait. Le badge cesserait de bouger en silence — la
 * panne la plus difficile à voir, parce que « aucun message non lu » et « le
 * compteur est mort » s'affichent pareil.
 *
 * Le suivi s'arrête donc sur un vrai changement d'identité (déconnexion,
 * passage dans l'espace coach), pas sur un démontage d'écran.
 */
function useChatUnread(userId: string | null): number {
  const [count, setCount] = React.useState(getUnreadCount);

  React.useEffect(() => subscribeUnread(setCount), []);

  React.useEffect(() => {
    if (!userId) {
      stopUnreadTracking();
      return;
    }
    void startUnreadTracking(userId, { notificationTitle: t("chat.title") });
  }, [userId]);

  return count;
}

/**
 * LE RÔLE, MÉMORISÉ POUR LA DURÉE DE L'ONGLET — ET SEULEMENT POUR LA NAV.
 *
 * ⛔ CE N'EST PAS UNE SECONDE SOURCE DE VÉRITÉ SUR L'ACCÈS. `KeelStudentRoute`
 * relit la ligne à chaque montage et reste seul à décider; RLS reste la vraie
 * frontière. Ce cache-ci répond à UNE question de dessin: faut-il peindre un
 * onglet. Le tenir en mémoire évite qu'un membre voie l'onglet « Aujourd'hui »
 * apparaître puis disparaître à CHAQUE navigation — un scintillement qui, lui,
 * se remarque.
 *
 * ⚠️ IL MEURT AVEC L'ONGLET. Pas de `sessionStorage`: un rôle qui survit à un
 * rechargement survivrait aussi à un changement de compte mal nettoyé, et on
 * peindrait la nav de quelqu'un d'autre. La clé est l'identifiant, et la carte
 * se vide au rechargement.
 */
const roleMemo = new Map<string, string | null>();

/**
 * LA RÈGLE, PURE — et elle est ici pour avoir une épreuve à sa taille.
 *
 * La suite front tourne en environnement `node` et ne monte pas de composant.
 * Une règle enfermée dans un hook n'aurait donc AUCUN test, et celle-ci décide
 * ce que quelqu'un voit sur son premier écran.
 *
 * ⚠️ `role === undefined` VEUT DIRE « PAS ENCORE LU », ET L'ONGLET RESTE. C'est
 * un arbitrage, pas un oubli. Les deux scintillements possibles ne coûtent pas
 * la même chose: cacher puis montrer fait sauter la barre de TOUT LE MONDE (les
 * élèves sont le cas courant), montrer puis cacher ne la fait sauter que pour un
 * profil réclamé — une fois par onglet, grâce au mémo. Une lecture EN PANNE
 * laisse donc l'onglet, et la garde de route refuse proprement, comme
 * aujourd'hui.
 *
 * ⛔ ET `null` N'EST PAS `undefined`. `keel_role` NULL est la valeur RÉELLE d'un
 * profil réclamé — c'est le cas que cette règle existe pour servir. Les fondre
 * en un seul « pas de rôle » rendrait l'onglet à qui il refuse.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function visibleNavFor(
  items: readonly NavItem[],
  role: string | null | undefined,
): NavItem[] {
  return items.filter((i) =>
    !i.needsStudentRole || role === undefined || role === "student"
  );
}

/** Les entrées que CE compte peut réellement ouvrir. */
function useVisibleNav(items: NavItem[], userId: string | null): NavItem[] {
  const needsRole = items.some((i) => i.needsStudentRole);
  const [role, setRole] = React.useState<string | null | undefined>(() =>
    userId !== null && roleMemo.has(userId) ? roleMemo.get(userId) : undefined
  );

  React.useEffect(() => {
    if (!needsRole || userId === null) return;
    if (roleMemo.has(userId)) {
      setRole(roleMemo.get(userId));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const got = await loadKeelRole(userId);
        roleMemo.set(userId, got);
        if (!cancelled) setRole(got);
      } catch {
        // Fail-open sur la NAVIGATION: on laisse l'onglet, la route refuse.
        // L'inverse retirerait un onglet légitime à un élève sur un hoquet
        // de réseau, et il ne reviendrait qu'au rechargement.
        if (!cancelled) setRole("student");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsRole, userId]);

  return React.useMemo(() => visibleNavFor(items, role), [items, role]);
}

/**
 * L'OBJECTIF, MÉMORISÉ POUR LA DURÉE DE L'ONGLET — et pour peindre UN bouton.
 *
 * Même forme et mêmes raisons que `roleMemo` ci-dessus: la barre se démonte et
 * se remonte à CHAQUE navigation, et relire `student_goals` à chaque écran
 * ferait clignoter le « + » sur tout le parcours. La carte se vide au
 * rechargement, et la clé est l'identifiant.
 */
const goalMemo = new Map<string, string | null>();

/**
 * LE « + » A-T-IL LIEU D'ÊTRE ? `undefined` tant qu'on ne le sait pas.
 *
 * ⛔ LA MÊME GARDE QUE LE COMPOSEUR, ET C'EST DÉLIBÉRÉ: `slotMealSwitchOfferable`
 * n'ouvre les trois gestes qu'aux objectifs de poids (`fat_loss`,
 * `muscle_gain`). Peindre le « + » à tout le monde ici pendant que le composeur
 * le refuse donnerait deux réponses au même geste selon l'endroit où on le
 * cherche. Si un jour la règle change, elle change dans `slotMeal.ts` — pas
 * ici.
 *
 * ⚠️ « PAS ENCORE LU » NE PEINT RIEN, et c'est l'inverse de l'arbitrage de
 * `visibleNavFor`. Là-bas il s'agissait de GARDER un onglet (une route qui
 * refuse proprement); ici il s'agit d'un BOUTON D'ACTION: le montrer puis le
 * retirer sous le pouce est le pire des deux scintillements, et il peut se
 * produire pendant que le panneau est ouvert. Il apparaît donc une fois par
 * onglet, à la première lecture, et ne bouge plus.
 */
function useQuickAddOfferable(userId: string | null): boolean {
  const [goal, setGoal] = React.useState<string | null | undefined>(() =>
    userId !== null && goalMemo.has(userId) ? goalMemo.get(userId) : undefined
  );

  React.useEffect(() => {
    if (userId === null) return;
    if (goalMemo.has(userId)) {
      setGoal(goalMemo.get(userId));
      return;
    }
    let cancelled = false;
    void (async () => {
      // `loadStudentGoal` ne lève jamais: `null` couvre « pas de ligne » ET
      // « lecture en panne », et les deux ne peignent rien.
      const got = await loadStudentGoal(userId);
      goalMemo.set(userId, got);
      if (!cancelled) setGoal(got);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return goal === undefined ? false : slotMealSwitchOfferable(goal);
}

/**
 * LES ONGLETS À GAUCHE ET À DROITE DU « + ».
 *
 * Exportée pour avoir une épreuve à sa taille: la suite front tourne en `node`
 * et ne monte aucun composant, donc une règle enfermée dans le rendu ne serait
 * jamais vérifiée — et celle-ci décide de la POSITION du bouton le plus visé de
 * l'écran.
 *
 * ⚠️ SUR UN NOMBRE IMPAIR, LA GAUCHE PREND LA PLUS GROSSE MOITIÉ. Le « + »
 * n'est alors plus au centre géométrique, et c'est le bon compromis: le
 * déséquilibre se voit, un bouton décalé d'une demi-colonne se rate.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function splitAroundQuickAdd<T>(items: readonly T[]): [T[], T[]] {
  const cut = Math.ceil(items.length / 2);
  return [items.slice(0, cut), items.slice(cut)];
}

/** The top bar alone — for pages whose header is custom (student space). */
export function KeelShellBar({ variant = "student" }: { variant?: ShellVariant }) {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = React.useState(false);
  // Le coach n'a pas de bulle: lui compter des non-lus ouvrirait un abonnement
  // sur une table qu'il ne lit pas, pour un badge qu'il ne verrait jamais.
  const unread = useChatUnread(
    variant === "student" ? user?.id ?? null : null,
  );
  const items = useVisibleNav(
    NAV[variant],
    variant === "student" ? user?.id ?? null : null,
  );

  // Un menu qui survit à la navigation recouvre l'écran qu'on vient d'ouvrir.
  // Il se referme donc sur le chemin, pas sur le clic: une entrée qui mène à la
  // page COURANTE ne déclenche aucun changement de `pathname`, et refermer sur
  // le clic seul laisserait ce cas ouvert.
  React.useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Échap referme. C'est la sortie qu'on essaie en premier quand un panneau
  // s'ouvre par erreur, et un menu sans sortie au clavier est un piège pour qui
  // ne vise pas à la souris.
  React.useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // The legacy index.html ships a French title and lang="fr". Every KEEL
  // screen is English; restating both here covers all connected KEEL pages
  // without touching the consumer path.
  //
  // LE TITRE PORTE LE COMPTEUR. C'est le seul avertissement qui traverse un
  // onglet en arrière-plan sans rien demander à personne: pas de permission,
  // pas de service worker, pas de secret. Il ne remplace pas une notification
  // système — il la précède, et il marche partout.
  React.useEffect(() => {
    document.title = unread > 0
      ? `(${unread}) ${t("brand.wordmark")}`
      : t("brand.wordmark");
    // `lang` appartient a `keel/i18n/runtime.ts`: UN seul ecrivain.
    // Trois composants l'ecrivaient au montage, chacun a "en" — donc la
    // valeur dependait de l'ordre de rendu, ce qui n'est pas une decision.
  }, [unread]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <>
      {/* `sticky`: sur un téléphone, l'écran fait dix hauteurs de viewport et le
          seul chemin vers le menu était de remonter tout en haut.

          ── LA BARRE EST CELLE DE LA VITRINE, AU PIXEL ─────────────────────────
          `border-line bg-paper/95 backdrop-blur`, `h-14 max-w-6xl px-4`: ce sont
          les valeurs de `PublicHeader.tsx`, recopiées et non réinventées. Le
          point du chantier est qu'un visiteur qui s'inscrit reconnaisse
          l'endroit; deux barres « presque » pareilles se lisent comme deux
          sociétés, et l'écart se voit précisément au moment de la bascule. */}
      <div className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-4">
            {/* LE NOM PORTE LE SYMBOLE, comme sur la vitrine.
                ⚠️ `text-lg` = 18 px, donc SOUS le plancher de 20 px que la
                charte §3 pose pour Young Serif — et c'est un écart ASSUMÉ, pas
                un oubli. La valeur est celle de `PublicHeader`: un logotype
                n'est pas du texte courant, le plancher existe pour les traits
                fins de Young Serif en lecture, et `ink` sur `paper` tient
                16,18:1. Aligner l'app sur la vitrine vaut mieux ici que gagner
                2 px de pureté sur la seule couture que ce chantier existe pour
                effacer. Si un jour la vitrine remonte son nom à 20 px, cette
                ligne la suit — elle ne décide pas. */}
            {/* ── LE SYMBOLE DE LA MARQUE, ET PLUS L'ÉQUERRE ───────────────
                Le logo (`BrandMark`) prend la place que tenait `.eq`. Deux
                signatures collées au même mot en feraient une de trop, et
                c'est le logo qui gagne: l'équerre garde son rôle d'ouverture
                de SECTION (charte §4), elle ne fait plus office de marque.
                ⚠️ ET ÇA RÈGLE LE PIÈGE DU `padding-left`: `.eq` posait son
                retrait hors de toute couche CSS, donc il battait un
                utilitaire de même spécificité. Un `flex` + `gap` n'a pas ce
                défaut — les avertissements « pas de `px-*` sur ce nœud »
                tombent avec lui. */}
            <span className="flex shrink-0 items-center gap-1.5 font-display text-lg leading-none text-ink">
              <BrandMark className="h-6 w-6 shrink-0 text-fig-700" />
              {t("brand.wordmark")}
            </span>
            <nav className="hidden gap-2 text-sm xl:flex">
              {items.map((item) => (
                <ShellLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  label={item.label()}
                  badge={item.to === "/app/chat" ? unread : 0}
                />
              ))}
            </nav>
          </div>
          {/* ── ⛔ LE GROUPE SECONDAIRE N'EST PLUS DANS LA RANGÉE, ET AUCUN
                 SEUIL NE PEUT L'Y REMETTRE ────────────────────────────────────
              Compte, mentions légales et déconnexion vivaient ici, en ligne, à
              droite. Ils vivent maintenant UNIQUEMENT dans le menu — qui les
              portait déjà, avec Échap, `aria-expanded` et la fermeture au
              changement de chemin. Le bouton Menu est donc visible à TOUTES les
              largeurs, et c'est ce qui garde ces trois-là à un clic partout:
              c'est leur PLACE qui a bougé, pas leur existence.

              ⚠️ LA RAISON EST GÉOMÉTRIQUE, PAS UNE QUESTION DE SEUIL, et j'ai
              d'abord essayé les seuils avant de comprendre. En français, les
              sept destinations demandent 770 px et ce groupe 318 px; avec le
              mot-symbole et les gouttières, la rangée réclame ~1 184 px. Or le
              conteneur est `max-w-6xl`, donc **1 152 px QUELLE QUE SOIT la
              largeur de l'écran**: il ne grandit jamais. Monter la coupure à
              `xl` puis à `2xl` n'a donc rien réparé — MESURÉ à 1 536 px,
              « Compte » recouvrait encore « Foyer », exactement comme à 1 024.
              Et comme les deux `<nav>` sont des enfants flex à
              `min-width: auto` que rien ne fait rétrécir, elles ne débordent
              pas: elles s'impriment l'une sur l'autre, en silence
              (`scrollWidth - clientWidth = 0`, donc rien ne défile pour le
              révéler). En anglais les libellés sont 10 à 25 % plus courts et le
              défaut ne se voyait pas — le piège de la garde vérifiée dans une
              seule langue, que ce dépôt a déjà payé.

              Si un jour on veut ce groupe en ligne, ce n'est pas un seuil qu'il
              faut changer, c'est `max-w-6xl`. */}
          <button
            type="button"
            data-testid="shell-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="shell-menu"
            onClick={() => setMenuOpen((open) => !open)}
            // `border-line-strong` et pas `border-line`: c'est un CONTRÔLE, et
            // WCAG 1.4.11 exige 3:1 pour sa bordure. `line` est à 1,30:1 (un
            // séparateur décoratif), `line-strong` à 3,84:1.
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line-strong px-3 py-1.5 text-sm text-ink transition-colors hover:bg-fig-50"
          >
            {menuOpen ? t("shell.nav.menu_close") : t("shell.nav.menu")}
            {/* LE BADGE SUIT LE CHEMIN VERS LA CONVERSATION. Sous `md` l'entrée
                « Chat » n'est plus dans la barre du haut: sans ce report, le
                compteur disparaîtrait de l'écran exactement là où il compte le
                plus. Il est masqué quand le menu est ouvert — l'entrée réelle,
                avec son propre badge, est alors visible juste en dessous. */}
            {!menuOpen && unread > 0 && (
              <UnreadBadge count={unread} className="bg-ink text-paper" />
            )}
          </button>
        </div>

        {menuOpen && (
          <div
            id="shell-menu"
            data-testid="shell-menu"
            className="max-h-[70vh] overflow-y-auto border-t border-line bg-paper"
          >
            <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3 text-sm">
              {items.map((item) => (
                <MenuLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  label={item.label()}
                  badge={item.to === "/app/chat" ? unread : 0}
                />
              ))}
              <div className="my-1 h-px bg-line" />
              <MenuLink to="/account" label={t("shell.nav.account")} />
              {/* FF-063 — L'ABONNEMENT, SOUS « COMPTE » ET SEULEMENT CÔTÉ
                  ÉLÈVE. Le groupe secondaire est rendu pour les DEUX variantes,
                  et un coach a déjà sa propre facturation (`/coach/billing`,
                  dans `NAV.coach`): deux entrées « abonnement » dans le même
                  menu, ce sont deux produits, et celle du foyer lui répondrait
                  « tu n'es dans aucun foyer ».
                  ⛔ PAS DANS `NAV`, et ce n'est pas un détail de rangement: y
                  entrer la mettrait AU-DESSUS du séparateur (donc dans la
                  rangée du haut), alors que sa place est avec le compte et les
                  mentions légales — ce qu'on consulte, pas ce qu'on habite. */}
              {variant === "student" && (
                <MenuLink to="/app/billing" label={t("shell.nav.billing")} />
              )}
              <MenuLink to="/legal" label={t("shell.nav.legal")} muted />
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-card px-3 py-2.5 text-left text-ink-soft transition-colors hover:bg-fig-50 hover:text-ink"
              >
                {t("shell.nav.sign_out")}
              </button>
            </nav>
          </div>
        )}
      </div>

      {/* LA BARRE DU BAS, ET SEULEMENT POUR L'ÉLÈVE. C'est lui qui vit dans un
          téléphone; le coach travaille sur un écran large et son espace tient
          dans le menu. Le pouce atteint le bas de l'écran, pas le haut. */}
      {variant === "student" && (
        <ShellBottomBar
          items={items}
          unread={unread}
          userId={user?.id ?? null}
        />
      )}
    </>
  );
}

/**
 * La barre d'onglets du téléphone: les destinations quotidiennes, à un tap —
 * et, au milieu, le « + » qui déclare ce qui n'était pas prévu.
 */
function ShellBottomBar({
  items,
  unread,
  userId,
}: {
  items: NavItem[];
  unread: number;
  userId: string | null;
}) {
  const bottom = items.filter((item) => item.bottom);
  const navigate = useNavigate();
  const location = useLocation();
  const offerable = useQuickAddOfferable(userId);
  const [addOpen, setAddOpen] = React.useState(false);
  /**
   * LE SECOND TEMPS DE « DÉCRIRE », ET IL EST OBLIGATOIRE.
   *
   * La barre ne peut pas deviner de quel repas on parle: sans choix de moment,
   * la déclaration tomberait au dernier créneau écoulé — juste par accident, et
   * faux dès qu'on répond le soir. C'est la même raison qui met le créneau DANS
   * le jeton de la question, et c'est déjà le second temps du composeur.
   */
  const [slotPicker, setSlotPicker] = React.useState(false);
  const photoInputRef = React.useRef<HTMLInputElement | null>(null);

  // Le panneau ne survit pas à la navigation, comme le menu du haut: rester
  // ouvert par-dessus l'écran qu'on vient d'ouvrir est un panneau qu'on referme
  // par erreur au geste suivant.
  React.useEffect(() => {
    setAddOpen(false);
    setSlotPicker(false);
  }, [location.pathname]);

  // Échap referme. Un panneau sans sortie au clavier est un piège pour qui ne
  // vise pas au doigt — la même règle que le menu.
  React.useEffect(() => {
    if (!addOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAddOpen(false);
        setSlotPicker(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [addOpen]);

  /**
   * ARMER, PUIS ALLER À LA CONVERSATION. C'est tout ce que ce bouton fait.
   *
   * ⚠️ `navigate` MÊME QUAND ON Y EST DÉJÀ. `/app/chat` ne se remonte pas dans
   * ce cas — et il n'a pas à le faire: l'écran est abonné aux armements
   * (`subscribeQuickAdd`), donc il consomme l'intention sur place.
   */
  const armAndGo = React.useCallback(
    (intent: Parameters<typeof armQuickAdd>[0]) => {
      setAddOpen(false);
      setSlotPicker(false);
      armQuickAdd(intent);
      navigate("/app/chat");
    },
    [navigate],
  );

  const [left, right] = splitAroundQuickAdd(bottom);

  return (
    <>
      {/* LE VOILE, ET IL SERT À FERMER. Un panneau qui ne se referme qu'au
          bouton « Fermer » se laisse ouvert; sur un téléphone, le geste qu'on
          essaie en premier est de taper à côté.
          `aria-hidden` + `tabIndex={-1}`: la sortie clavier est Échap, et un
          second arrêt de tabulation sans nom n'en serait pas une. */}
      {addOpen && (
        <div
          aria-hidden="true"
          tabIndex={-1}
          data-testid="shell-quick-add-scrim"
          onClick={() => {
            setAddOpen(false);
            setSlotPicker(false);
          }}
          className="fixed inset-0 z-30 bg-ink/20 xl:hidden"
        />
      )}
      <nav
        data-testid="shell-bottom-nav"
        aria-label={t("shell.nav.primary")}
        // `pb-[env(safe-area-inset-bottom)]`: sur un iPhone la barre gestuelle
        // mange les derniers 34 px. Sans ça, le dernier onglet est sous le trait
        // du système — visible, et intappable.
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] xl:hidden"
      >
        {/* ══════════════════════════════════════════════════════════════════
            LE PANNEAU DU « + » — IL SE DÉPLIE AU-DESSUS DE LA BARRE.

            Il vit DANS la barre (donc au-dessus du voile, et au-dessus de la
            réserve de `safe-area`), et il porte la grammaire du menu du haut:
            des lignes pleine largeur, `py-3`, visables au pouce. Pas un
            `Modal` — c'est un tiroir, pas une page.
            ═══════════════════════════════════════════════════════════════ */}
        {addOpen && (
          <div
            role="menu"
            id="shell-quick-add"
            aria-label={t("chat.compose.add")}
            data-testid="shell-quick-add-panel"
            className="animate-unfold-up border-b border-line px-3 pb-2 pt-3"
          >
            <div className="mx-auto flex max-w-6xl flex-col gap-1">
              {!slotPicker
                ? (
                  <>
                    <QuickAddItem
                      testId="shell-quick-add-photo"
                      label={t("chat.compose.add.photo")}
                      // ⚠️ LE SÉLECTEUR DE FICHIER S'OUVRE DANS LE GESTE, ET
                      // C'EST LA RAISON POUR LAQUELLE LA PHOTO NE PASSE PAS
                      // PAR UNE NAVIGATION D'ABORD. Un `click()` programmé
                      // après un changement d'écran n'a plus l'activation de
                      // l'utilisateur: Safari refuse alors d'ouvrir l'appareil
                      // photo, sans rien dire. On choisit ici, on navigue après.
                      onSelect={() => {
                        setAddOpen(false);
                        photoInputRef.current?.click();
                      }}
                    />
                    <QuickAddItem
                      testId="shell-quick-add-describe"
                      label={t("chat.compose.add.describe")}
                      onSelect={() => setSlotPicker(true)}
                    />
                    <QuickAddItem
                      testId="shell-quick-add-weight"
                      label={t("chat.compose.add.weight")}
                      onSelect={() => armAndGo({ kind: "weight" })}
                    />
                  </>
                )
                : (
                  SLOT_ORDER.map((slot) => (
                    <QuickAddItem
                      key={slot}
                      testId={`shell-quick-add-describe-${slot}`}
                      label={forcedSlotLabel(slot) ?? slot}
                      onSelect={() => armAndGo({ kind: "describe", slot })}
                    />
                  ))
                )}
              <QuickAddItem
                testId="shell-quick-add-close"
                label={t("chat.compose.add.close")}
                muted
                onSelect={() => {
                  setAddOpen(false);
                  setSlotPicker(false);
                }}
              />
            </div>
          </div>
        )}
        {/* ⚠️ LE CHAMP DE FICHIER RESTE DANS LE DOM, hors du panneau: le panneau
            se ferme au tap qui ouvre le sélecteur, et un champ démonté au
            moment où le système l'ouvre ne rend jamais son `change`.
            Il ne VALIDE rien ici — ni le type, ni la taille. `/app/chat` porte
            déjà les deux refus, avec leurs phrases; les recopier ferait deux
            gardes à tenir d'accord. */}
        {/* ⛔ ET IL SUIT LA MÊME GARDE QUE LE BOUTON. Un champ de fichier qu'AUCUN
            geste ne peut atteindre — le tiroir qui l'ouvre n'existe pas quand
            l'objectif ne consomme pas la photo — est du balisage mort dans la
            coquille de TOUTES les pages élève. L'absence est totale ou elle
            n'est pas une absence. */}
        {offerable && (
        <input
          ref={photoInputRef}
          type="file"
          accept={ACCEPTED_PHOTO_MIME_TYPES.join(",")}
          className="hidden"
          data-testid="shell-quick-add-photo-input"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            // Remis à zéro pour que RE-choisir le même fichier redéclenche
            // `change`: sans ça, une photo retirée puis reprise resterait sans
            // effet.
            e.target.value = "";
            if (file) armAndGo({ kind: "photo", file });
          }}
        />
        )}
        <div className="flex items-stretch">
          {left.map((item) => (
            <BottomTab key={item.to} item={item} unread={unread} />
          ))}
          {/* ══════════════════════════════════════════════════════════════
              LE « + », ET IL PORTE LA MARQUE.

              La règle de couleur de l'app: la teinte de marque marque la
              NAVIGATION et l'ACTION (charte §2). C'en est une — la seule de
              cette barre. `paper` sur `fig-700` = 9,98:1.

              ⛔ ET IL NE SE PEINT QUE QUAND L'OBJECTIF LE CONSOMME. Voir
              `useQuickAddOfferable`: la colonne disparaît alors et les quatre
              onglets se repartagent la largeur — pas de trou au milieu.
              ═════════════════════════════════════════════════════════════ */}
          {offerable && (
            <div className="flex min-w-0 flex-1 items-center justify-center px-0.5 py-3">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={addOpen}
                aria-controls="shell-quick-add"
                aria-label={t("chat.compose.add")}
                data-testid="shell-quick-add"
                onClick={() => {
                  setAddOpen((open) => !open);
                  setSlotPicker(false);
                }}
                // 44 px de côté: le plancher d'une cible tactile, et c'est la
                // cible la plus visée de la barre.
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-fig-700 text-paper transition-colors hover:bg-fig-800"
              >
                {/* LE SIGNE TOURNE EN CROIX QUAND LE TIROIR EST OUVERT: c'est
                    la même touche qui ouvre et qui ferme, et elle le dit.
                    `aria-hidden`: le nom du bouton est son `aria-label`, un
                    « + » annoncé par-dessus ne dirait rien de plus.
                    `motion-reduce:transition-none` — une rotation n'est pas de
                    l'information, elle ne doit pas s'imposer. */}
                <span
                  aria-hidden="true"
                  className={`text-2xl leading-none transition-transform duration-150 motion-reduce:transition-none ${
                    addOpen ? "rotate-45" : ""
                  }`}
                >
                  +
                </span>
              </button>
            </div>
          )}
          {right.map((item) => (
            <BottomTab key={item.to} item={item} unread={unread} />
          ))}
        </div>
      </nav>
    </>
  );
}

/** Une ligne du tiroir du « + »: pleine largeur, visable au pouce. */
function QuickAddItem({
  testId,
  label,
  onSelect,
  muted = false,
}: {
  testId: string;
  label: string;
  onSelect: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      onClick={onSelect}
      className={`w-full rounded-card px-3 py-3 text-left text-sm transition-colors ${
        muted
          ? "text-ink-soft hover:bg-fig-50 hover:text-ink"
          : "text-ink hover:bg-fig-50"
      }`}
    >
      {label}
    </button>
  );
}

/** Un onglet de la barre du bas. */
function BottomTab({ item, unread }: { item: NavItem; unread: number }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      // `py-3`: 49 px de haut. Une cible tactile sous ~44 px se rate au
      // pouce, et c'est la barre qu'on vise le plus souvent.
      //
      // ⚠️ `min-w-0` ARME LE `truncate` DE L'ENFANT, et sans lui il ne
      // sert à rien. Un enfant de flex a `min-width: auto`: il refuse
      // d'être plus étroit que son contenu, donc la colonne s'élargissait
      // au lieu de couper, et le dernier onglet sortait de l'écran.
      // MESURÉ en français à 320 px: « Progression » débordait de 32 px,
      // sans ellipse et sans défilement — 1.4.10 Reflow. En anglais le
      // libellé est plus court et le défaut ne se voyait pas: c'est le
      // piège de la garde vérifiée dans une seule langue, que ce dépôt a
      // déjà payé.
      className="relative flex min-w-0 flex-1 items-center justify-center px-0.5 py-3"
    >
      {({ isActive }) => (
        <>
          <span
            // L'ONGLET ACTIF PORTE LA MARQUE: la teinte de marque marque
            // la NAVIGATION et l'ACTION (charte §2). `paper` sur
            // `fig-700` = 9,98:1; `ink-soft` sur `paper` = 6,11:1.
            // `px-1.5` ET PAS `px-2`: quatre pixels de texte en plus par
            // colonne, et ils sont comptés — à 320 px, « Dialogue » réclame
            // 45 px pour 44 px de texte disponibles avec `px-2`. La pastille de
            // l'onglet actif reste lisible: c'est la RÉSERVE autour du mot qui
            // maigrit, pas le mot.
            className={`inline-flex max-w-full items-center truncate rounded-full px-1.5 py-1 text-[0.6875rem] font-medium ${
              isActive ? "bg-fig-700 text-paper" : "text-ink-soft"
            }`}
          >
            {(item.short ?? item.label)()}
          </span>
          {item.to === "/app/chat" && unread > 0 && (
            // En pastille d'icône d'application, pas dans le libellé: une
            // colonne fait 75 px et « Chat 3 » en pilule la ferait
            // déborder sur ses voisines.
            <UnreadBadge
              count={unread}
              className="absolute right-1.5 top-0.5 bg-ink text-paper ring-2 ring-paper"
            />
          )}
        </>
      )}
    </NavLink>
  );
}

/** Une entrée du menu déroulant: pleine largeur, visable au pouce. */
function MenuLink({
  to,
  label,
  end,
  muted = false,
  badge = 0,
}: {
  to: string;
  label: string;
  end?: boolean;
  muted?: boolean;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center justify-between gap-2 rounded-card px-3 py-2.5 transition-colors ${
          isActive
            ? "bg-fig-700 text-paper"
            : muted
            ? "text-ink-soft hover:bg-fig-50 hover:text-ink"
            : "text-ink hover:bg-fig-50"
        }`}
    >
      {({ isActive }) => (
        <>
          <span>{label}</span>
          {badge > 0 && (
            <UnreadBadge
              count={badge}
              // ⛔ LE COMPTEUR RESTE NEUTRE, ET C'EST LA RÈGLE DE COULEUR DE
              // L'APP: la marque marque la navigation et l'action, JAMAIS un
              // chiffre, une mesure ou un verdict (charte §2). Un badge figue
              // sur un onglet figue serait en plus invisible.
              className={isActive
                ? "bg-paper text-ink"
                : "bg-ink text-paper"}
            />
          )}
        </>
      )}
    </NavLink>
  );
}

/**
 * La pastille de non-lus. Une seule définition pour les quatre endroits qui
 * l'affichent (barre du haut, bouton Menu, menu, barre du bas): un compteur qui
 * dit « 3 » à un endroit et « 9+ » à l'autre est un compteur qu'on cesse de
 * croire.
 */
function UnreadBadge({
  count,
  className = "",
}: {
  count: number;
  className?: string;
}) {
  return (
    <span
      data-testid="nav-unread-badge"
      // Le compte est DANS le libellé accessible, pas seulement dans la
      // pastille: un lecteur d'écran qui annonce « Chat 3 » sans dire ce qu'est
      // ce 3 fait un badge illisible plutôt qu'absent.
      aria-label={t("chat.unread.aria", { count })}
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none ${className}`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function KeelAppShell({
  variant = "student",
  width = "narrow",
  title,
  subtitle,
  actions,
  /**
   * L'écran occupe EXACTEMENT la hauteur du viewport et c'est son contenu qui
   * défile, pas la page. Pour la bulle: un fil de discussion qui allonge la
   * page fait descendre le champ de saisie hors de l'écran, ce qui est
   * exactement l'inverse de ce qu'on veut d'une conversation. Le contenu passé
   * en `children` doit alors porter `min-h-0 flex-1`.
   */
  fill = false,
  children,
}: {
  variant?: ShellVariant;
  width?: PageWidth;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  fill?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      // `bg-paper` et PAS `bg-white`: le blanc pur n'est pas dans la palette.
      // Les neutres de la charte portent la teinte de marque à 8-27 % de
      // saturation — c'est ce qui donne à la page une température sans lui
      // donner un ton, et c'est ce qui la sépare d'un `gray-50` de plus. Le
      // corps porte déjà `bg-paper` (`index.css`); cette classe existe pour que
      // l'écran reste opaque au-dessus de lui.
      className={`bg-paper ${
        // `h-` et PAS `min-h-`: une hauteur MINIMALE ne borne rien, elle pose un
        // plancher. Le conteneur reste dimensionné par son contenu, `flex-1`
        // n'a aucun espace libre à distribuer, et le fil repousse le composeur
        // hors de l'écran exactement comme avant — mesuré, pas supposé.
        //
        // `100dvh` et pas `100vh`: sur un téléphone, `vh` compte la hauteur
        // barre d'URL MASQUÉE, donc `100vh` déborde de l'écran réel au premier
        // chargement — sur un écran « pleine hauteur » ça remet le composeur
        // dessous, c'est-à-dire précisément la panne qu'on répare.
        fill ? "flex h-[100dvh] flex-col overflow-hidden" : "min-h-screen"
      } ${
        // LA BARRE DU BAS EST `fixed`: elle ne pousse rien, donc elle RECOUVRE
        // la fin de la page si on ne lui réserve pas sa place. Sans ce padding,
        // le dernier bouton de chaque écran élève — « Log it » du dernier
        // engagement, « Add » du formulaire santé — passe dessous.
        variant === "student" ? "pb-[calc(4rem+env(safe-area-inset-bottom))] xl:pb-0" : ""
      }`}
    >
      <KeelShellBar variant={variant} />
      {/* FF-064 — L'AVERTISSEMENT AVANT LA COUPURE, ENTRE LA BARRE ET LA PAGE.
          Il se rend lui-même invisible sauf à J-2 et J-1 (voir
          `trialBannerDecision`), et il ne coûte AUCUNE lecture: c'est la même
          réponse de couverture que le mur, obtenue une fois par session.
          ⚠️ Il porte `shrink-0`. En mode `fill` (`/app/chat`), ce conteneur est
          `flex h-[100dvh] flex-col overflow-hidden`: sans cette classe il se
          fait écraser ou il pousse le composeur hors de l'écran. */}
      <TrialEndingBanner />
      <Page
        width={width}
        fullHeight={false}
        className={fill ? "flex min-h-0 flex-1 flex-col" : ""}
      >
        {/* ══════════════════════════════════════════════════════════════
            L'ÉCRAN ÉLÈVE N'A PLUS D'EN-TÊTE VISIBLE (2026-09-09, sur demande).

            « Aujourd'hui », « Sophia », « Le plan de ma semaine », « Mes
            progrès »: quatre titres qui répètent l'onglet actif — lequel est
            déjà peint en figue, en haut sur grand écran et sous le pouce sur
            téléphone. Le chapô en dessous décrivait l'écran au-dessus de
            l'écran. Sur un téléphone, ces deux blocs poussaient le premier
            contenu réel sous la ligne de flottaison.

            ⛔ LE `h1` RESTE, EN `sr-only`. Le retirer ferait des pages d'app
            des documents SANS TITRE: un lecteur d'écran qui liste les en-têtes
            n'aurait plus rien à annoncer, et la nav ne dit pas où on est à
            quelqu'un qui ne la voit pas. Ce qui part est la PLACE qu'il prenait,
            pas le titre.

            ⚠️ `actions` N'EST PLUS RENDU CÔTÉ ÉLÈVE — et aucun écran élève n'en
            passe (vérifié: `Today`, `Chat`, `Plan`, `Progress`, `Household`,
            `Billing`, `Known`). Si un jour l'un en passe, il faudra lui donner
            une place DANS son corps, pas ressusciter l'en-tête.

            Le coach garde le sien: ses écrans sont des écrans de TRAVAIL, sans
            barre du bas, et plusieurs portent des actions dans leur en-tête.
            ══════════════════════════════════════════════════════════════ */}
        {variant === "student"
          ? <h1 className="sr-only">{title}</h1>
          : <PageHeader title={title} subtitle={subtitle} actions={actions} />}
        {children}
      </Page>
    </div>
  );
}

function ShellLink({
  to,
  label,
  end,
  badge = 0,
}: {
  to: string;
  label: string;
  end?: boolean;
  /** Non-lus. `0` ne rend rien — un badge vide est du bruit permanent. */
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        // `whitespace-nowrap`: sans lui, « My week's plan » se replie sur deux
        // lignes dès que la rangée serre, et une barre de nav sur deux lignes
        // se lit comme un défaut d'affichage.
        // LE LIEN ACTIF PORTE LA MARQUE (charte §2): `paper` sur `fig-700` =
        // 9,98:1. L'inactif est en encre secondaire, `ink-soft` sur `paper` =
        // 6,11:1, et son survol emprunte le lavis `fig-50` (`ink` dessus =
        // 15,38:1) — le même geste que la barre de la vitrine.
        `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 transition-colors ${
          isActive
            ? "bg-fig-700 text-paper"
            : "text-ink-soft hover:bg-fig-50 hover:text-ink"
        }`}
    >
      {({ isActive }) => (
        <>
          {label}
          {badge > 0 && (
            <UnreadBadge
              count={badge}
              // L'onglet ACTIF a un fond `fig-700`. Un badge sombre dessus est
              // invisible — et un badge invisible est pire qu'absent, parce
              // qu'on croit qu'il n'y a rien. Il s'inverse donc avec son fond.
              // ⛔ Et il reste NEUTRE dans les deux cas: un chiffre ne porte
              // jamais la teinte de marque.
              className={isActive
                ? "bg-paper text-ink"
                : "bg-ink text-paper"}
            />
          )}
        </>
      )}
    </NavLink>
  );
}

export default KeelAppShell;
