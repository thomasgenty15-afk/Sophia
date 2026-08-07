import React from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
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
// Deux états, coupés à `lg` (1024 px):
//   < lg  : marque + bouton Menu en haut, et la barre d'onglets EN BAS pour
//           l'élève — le pouce est en bas de l'écran, pas en haut.
//   >= lg : la barre d'origine, intacte. Le desktop n'avait pas de problème.
//
// La coupure est à `lg` et pas à `md` parce qu'elle a été MESURÉE: à 768 px la
// rangée complète demande ~754 px de contenu pour 736 px utiles, donc elle tient
// en repliant « My week's plan » et « Meal ideas » sur deux lignes — une barre
// qui « tient » de justesse et qui est laide. Une tablette hérite donc du menu
// et de la barre du bas, ce qui est le bon défaut: ça se tape aussi au doigt.

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
          seul chemin vers le menu était de remonter tout en haut. */}
      <div className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="text-lg font-semibold tracking-tight text-gray-900">
              {t("brand.wordmark")}
            </span>
            <nav className="hidden gap-2 text-sm lg:flex">
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
          <nav className="hidden items-center gap-2 text-sm lg:flex">
            <ShellLink to="/account" label={t("shell.nav.account")} />
            {/* A ROUTE WITH NO LINK IS A FEATURE NOBODY HAS — the note at the top
                of this file, applied to /legal. The connected shell had no path
                to it at all, in either space: a student wanting to know who
                holds their data, or a coach checking who they are paying, had to
                sign out to find the answer. Deliberately NOT a ShellLink: it is
                not a destination in the product, so it never lights up as the
                active tab next to Today / Students. */}
            <Link
              to="/legal"
              className="rounded-full px-3 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            >
              {t("shell.nav.legal")}
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-full px-3 py-1 text-gray-600 hover:bg-gray-100"
            >
              {t("shell.nav.sign_out")}
            </button>
          </nav>
          <button
            type="button"
            data-testid="shell-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="shell-menu"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 lg:hidden"
          >
            {menuOpen ? t("shell.nav.menu_close") : t("shell.nav.menu")}
            {/* LE BADGE SUIT LE CHEMIN VERS LA CONVERSATION. Sous `md` l'entrée
                « Chat » n'est plus dans la barre du haut: sans ce report, le
                compteur disparaîtrait de l'écran exactement là où il compte le
                plus. Il est masqué quand le menu est ouvert — l'entrée réelle,
                avec son propre badge, est alors visible juste en dessous. */}
            {!menuOpen && unread > 0 && (
              <UnreadBadge count={unread} className="bg-gray-900 text-white" />
            )}
          </button>
        </div>

        {menuOpen && (
          <div
            id="shell-menu"
            data-testid="shell-menu"
            className="max-h-[70vh] overflow-y-auto border-t border-gray-200 bg-white lg:hidden"
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
              <div className="my-1 h-px bg-gray-200" />
              <MenuLink to="/account" label={t("shell.nav.account")} />
              <MenuLink to="/legal" label={t("shell.nav.legal")} muted />
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-xl px-3 py-2.5 text-left text-gray-600 hover:bg-gray-100"
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="flex items-stretch">
        {bottom.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            // `py-3`: 49 px de haut. Une cible tactile sous ~44 px se rate au
            // pouce, et c'est la barre qu'on vise le plus souvent.
            className="relative flex flex-1 items-center justify-center px-0.5 py-3"
          >
            {({ isActive }) => (
              <>
                <span
                  className={`inline-flex max-w-full items-center truncate rounded-full px-2 py-1 text-[0.6875rem] font-medium ${
                    isActive
                      ? "bg-gray-900 text-white"
                      : "text-gray-600"
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
                    className="absolute right-1.5 top-0.5 bg-gray-900 text-white ring-2 ring-white"
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
        `flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 ${
          isActive
            ? "bg-gray-900 text-white"
            : muted
            ? "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            : "text-gray-700 hover:bg-gray-100"
        }`}
    >
      {({ isActive }) => (
        <>
          <span>{label}</span>
          {badge > 0 && (
            <UnreadBadge
              count={badge}
              className={isActive
                ? "bg-white text-gray-900"
                : "bg-gray-900 text-white"}
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
      className={`bg-white ${
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
        variant === "student" ? "pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0" : ""
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
        `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 ${
          isActive
            ? "bg-gray-900 text-white"
            : "text-gray-600 hover:bg-gray-100"
        }`}
    >
      {({ isActive }) => (
        <>
          {label}
          {badge > 0 && (
            <UnreadBadge
              count={badge}
              // L'onglet ACTIF a un fond gris-900. Un badge gris-900 dessus est
              // invisible — et un badge invisible est pire qu'absent, parce
              // qu'on croit qu'il n'y a rien. Il s'inverse donc avec son fond.
              className={isActive
                ? "bg-white text-gray-900"
                : "bg-gray-900 text-white"}
            />
          )}
        </>
      )}
    </NavLink>
  );
}

export default KeelAppShell;
