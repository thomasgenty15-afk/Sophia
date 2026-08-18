import React from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { t } from "../i18n/t";
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

export type ShellVariant = "student" | "coach";

type NavItem = {
  to: string;
  label: () => string;
  /**
   * Libellé de la barre du bas, quand le libellé complet n'y tient pas.
   * « My week's plan » sur une colonne de 75 px se replie sur trois lignes.
   */
  short?: () => string;
  end?: boolean;
  /**
   * Dans la barre d'onglets du téléphone. Au plus CINQ — au-delà, les colonnes
   * deviennent trop étroites pour être visées au pouce. Le reste vit dans le
   * menu, qui lui est complet.
   */
  bottom?: boolean;
};

// A ROUTE WITH NO LINK IS A FEATURE NOBODY HAS.
// `/app/meals` shipped with Q6 and was reachable only by typing the URL: the
// student's nav had two entries and the meal week was not one of them. That is
// the "thirteen unwired modules" failure one layer up — `wiring-check` owns the
// edge from a module to its caller, and a React route IS a caller, so the check
// stayed green while the whole screen was unreachable. The entry below is the
// missing edge.
const NAV: Record<ShellVariant, NavItem[]> = {
  student: [
    { to: "/app/today", label: () => t("app.nav.today"), bottom: true },
    // DE-WHATSAPP — la conversation doit être à ≤1 tap depuis tout l'espace
    // élève. Elle est en deuxième position, pas en dernière: c'est le canal,
    // pas une annexe.
    { to: "/app/chat", label: () => t("app.nav.chat"), bottom: true },
    // PIVOT N3 — une route sans lien est une fonctionnalité que personne n'a
    // (voir la note en tête de ce fichier): l'écran plan arrive avec son
    // entrée de nav dans le même changement.
    {
      to: "/app/plan",
      label: () => t("app.nav.plan"),
      short: () => t("app.nav.plan.short"),
      bottom: true,
    },
    {
      to: "/app/meals",
      label: () => t("app.nav.meals"),
      short: () => t("app.nav.meals.short"),
      bottom: true,
    },
    { to: "/app/progress", label: () => t("app.nav.progress"), bottom: true },
    // UNE ROUTE SANS LIEN EST UNE FONCTIONNALITÉ QUE PERSONNE N'A (voir la note
    // en tête de ce fichier). L'écran santé arrive avec son entrée de nav dans
    // le même changement — et il compte double: une allergie que l'élève ne
    // trouve pas où déclarer est une allergie que le produit ne connaît pas.
    { to: "/app/health", label: () => t("app.nav.health") },
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
  const items = NAV[variant];

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
            {/* LE NOM PORTE L'ÉQUERRE, comme sur la vitrine: elle marque
                l'origine de ce qui est spécifié, et elle a toujours un mot à sa
                droite (charte §4).
                ⚠️ `text-lg` = 18 px, donc SOUS le plancher de 20 px que la
                charte §3 pose pour Young Serif — et c'est un écart ASSUMÉ, pas
                un oubli. La valeur est celle de `PublicHeader`: un logotype
                n'est pas du texte courant, le plancher existe pour les traits
                fins de Young Serif en lecture, et `ink` sur `paper` tient
                16,18:1. Aligner l'app sur la vitrine vaut mieux ici que gagner
                2 px de pureté sur la seule couture que ce chantier existe pour
                effacer. Si un jour la vitrine remonte son nom à 20 px, cette
                ligne la suit — elle ne décide pas. */}
            <span className="eq shrink-0 font-display text-lg leading-none text-ink">
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
        <ShellBottomBar items={items} unread={unread} />
      )}
    </>
  );
}

/** La barre d'onglets du téléphone: les destinations quotidiennes, à un tap. */
function ShellBottomBar({
  items,
  unread,
}: {
  items: NavItem[];
  unread: number;
}) {
  const bottom = items.filter((item) => item.bottom);
  return (
    <nav
      data-testid="shell-bottom-nav"
      aria-label={t("shell.nav.primary")}
      // `pb-[env(safe-area-inset-bottom)]`: sur un iPhone la barre gestuelle
      // mange les derniers 34 px. Sans ça, le dernier onglet est sous le trait
      // du système — visible, et intappable.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] xl:hidden"
    >
      <div className="flex items-stretch">
        {bottom.map((item) => (
          <NavLink
            key={item.to}
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
                  className={`inline-flex max-w-full items-center truncate rounded-full px-2 py-1 text-[0.6875rem] font-medium ${
                    isActive
                      ? "bg-fig-700 text-paper"
                      : "text-ink-soft"
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
        ))}
      </div>
    </nav>
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
      <Page
        width={width}
        fullHeight={false}
        className={fill ? "flex min-h-0 flex-1 flex-col" : ""}
      >
        <PageHeader title={title} subtitle={subtitle} actions={actions} />
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
