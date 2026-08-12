import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { t, type MessageKey } from "../i18n/t";
import { ButtonLink } from "./ui/Button";
import { LocaleSwitch } from "./LocaleSwitch";

// KEEL — la chrome publique. L'en-tête est la porte d'entrée du produit:
// le mot de la marque, le monde qu'on lit, les portes de ce monde, et un geste.
//
// ── DEUX MONDES, ET C'EST LA STRUCTURE DE TOUT LE SITE ────────────────────
// La vitrine vend à DEUX acheteurs qui n'ont rien en commun: un foyer qui
// compose ses repas, et un professionnel qui prête sa méthode à ses élèves. Ce
// ne sont pas deux gammes du même produit, ce sont deux produits — mais UNE
// marque, et la même société derrière.
//
// D'où l'interrupteur, dans les DEUX SENS. Un visiteur B2C qui découvre qu'il
// existe une offre pro doit pouvoir y aller; un pro envoyé sur `/pro` par un
// confrère doit pouvoir revenir voir ce que ça donne chez lui. C'est de la
// navigation de MARQUE: deux destinations, toutes deux publiques.
//
// ⚠️ LE CTA SUIT LE MONDE, ET C'EST LE DÉFAUT QUE CE FICHIER VIENT DE FERMER.
// Avant, l'en-tête offrait « Start free trial » — l'essai COACH — sur toutes
// les pages de vente. Posé sur une page foyer, il propose à un parent de créer
// un compte de professionnel payant: une porte qui ne mène pas où son libellé
// promet. Chaque monde porte donc SON geste (`/start` pour le foyer,
// `/auth?role=coach` pour le pro), et `audience="student"` n'en porte aucun.
//
// ── AU TÉLÉPHONE: DEUX RANGÉES, ET LES MESURES QUI L'IMPOSENT ─────────────
// Le bloc de droite fait 275px déconnecté (langue + « Sign in » + le bouton).
// Posé À CÔTÉ du mot de la marque, il ne laisse que 13px des 97 que le nom
// réclame — c'est-à-dire une ellipse sur tous les téléphones du marché.
// `truncate` évitait le débordement et MASQUAIT le problème.
//
// L'interrupteur des mondes est un élément DE PLUS que ce budget ne contient
// pas. Il descend donc sur une SECONDE RANGÉE, où il a toute la largeur — et
// où il se lit comme ce qu'il est: le choix de qui on est, pas un lien de plus.
// L'en-tête garde 56px sur une rangée et en prend 92 sur deux.
//
// LES PORTES RESTENT À `md`. Trois libellés ne tiennent pas sous 768px, et le
// nom seul n'y tenait déjà pas. Sur téléphone, le passage d'une porte à l'autre
// se fait par le PIED DE PAGE (qui les porte toutes, les deux mondes compris)
// et par le corps des deux halls, dont c'est précisément le travail.
//
// Casse normale et pas de `tracking-wider`: en capitales espacées
// « Communities » réclame 88px là où le bloc de gauche en reçoit 71 sur un
// téléphone de 390. Le même mot en casse normale en demande 62.

type Door = { to: string; label: MessageKey };

/**
 * Les deux mondes, et les portes de chacun.
 *
 * ⚠️ Une entrée ici est une PAGE DE VENTE, jamais une page publique de plus.
 * `/legal`, `/join` et `/start` sont publiques et n'ont rien à y faire: la
 * première est une crédential, les deux autres appartiennent à l'acheteur qui a
 * déjà décidé.
 */
const WORLDS = [
  {
    /** Le hall. `/` est B2C depuis la refonte du 2026-08-12. */
    hub: "/",
    label: "public.nav.world_household" as MessageKey,
    /** Le geste de ce monde: l'inscription libre. */
    cta: { to: "/start", label: "public.header.start_household" as MessageKey },
    doors: [
      { to: "/meal-prep", label: "public.nav.mealprep" },
      { to: "/couples", label: "public.nav.couples" },
      { to: "/families", label: "public.nav.families" },
    ] as Door[],
  },
  {
    hub: "/pro",
    label: "public.nav.world_pro" as MessageKey,
    /** Le geste de ce monde: l'essai coach, 14 jours et 3 élèves. */
    cta: { to: "/auth?role=coach", label: "public.header.start_trial" as MessageKey },
    doors: [
      { to: "/coaches", label: "public.nav.coaches" },
      { to: "/gyms", label: "public.nav.gyms" },
      { to: "/communities", label: "public.nav.communities" },
    ] as Door[],
  },
] as const;

/** Toutes les portes, les deux mondes confondus — pour le plan du site en pied. */
const ALL_DOORS: Door[] = WORLDS.flatMap((world) => [...world.doors]);

/**
 * Le monde de la page courante, ou `null` sur une page publique qui n'en est
 * pas une (`/legal`, `/join`, `/start`).
 *
 * Comparaison EXACTE des chemins: un `startsWith` ferait de `/` le hall de
 * toutes les autres pages, puisque toutes commencent par `/`.
 */
function worldOf(pathname: string) {
  return (
    WORLDS.find(
      (world) =>
        world.hub === pathname ||
        world.doors.some((door) => door.to === pathname),
    ) ?? null
  );
}

/**
 * ⚠️ `audience` NE VEUT PAS DIRE « COACH OU ÉLÈVE ». Les deux valeurs sont mal
 * nommées depuis que la vitrine a deux mondes, et le nom a déjà coûté quelque
 * chose: trois pages FOYER se sont posées en `audience="student"` pour éviter
 * qu'un bouton d'essai COACH s'affiche au-dessus d'une page qui vend au foyer.
 * L'intention était juste, la conséquence non — elles perdaient du même coup
 * l'interrupteur des mondes ET les trois portes, c'est-à-dire toute la
 * navigation du site.
 *
 * Ce que les valeurs veulent VRAIMENT dire:
 * - `"coach"` (défaut) = **une page de vente**. Elle porte les mondes, les
 *   portes, et le geste DU MONDE COURANT (jamais un geste de l'autre monde:
 *   c'est le défaut que `WORLDS` a fermé, voir l'en-tête du fichier).
 * - `"student"` = **une page qu'une personne invitée ouvre** (`/join`,
 *   `/join-household`). Elle ne vend rien: proposer un compte payant à
 *   quelqu'un en train d'accepter celui qu'on lui a donné est une porte qui
 *   trompe. Ni mondes, ni portes, ni geste.
 *
 * Renommer les valeurs toucherait `/join` et `/start`, qui appartiennent à un
 * autre lot: c'est un nettoyage à part, pas un effet de bord de celui-ci.
 */
export function PublicHeader({
  audience = "coach",
}: {
  audience?: "coach" | "student";
} = {}) {
  // ── UNE PAGE PUBLIQUE PEUT ÊTRE LUE PAR QUELQU'UN DE CONNECTÉ ─────────────
  // `/legal` est dans la nav du shell, des deux côtés. Un élève qui la tapait
  // atterrissait donc sur cet en-tête, c'est-à-dire sur « Sign in » et le bouton
  // d'essai — proposés à quelqu'un qui EST connecté — et sans un seul chemin de
  // retour vers `/app`. Le mot de la marque menait bien à `/`, mais rien ne
  // disait que c'était la sortie, et deux boutons disaient le contraire.
  //
  // La destination reste `/`: les deux halls routent déjà un visiteur connecté
  // vers SON espace (`resolveHomePath`). Pas de second résolveur ici — un
  // aller-retour de plus, et un deuxième endroit où se tromper de porte.
  const { user } = useAuth();
  // `useLocation` et pas `window.location`: sous React Router, une navigation
  // client ne remonte pas `window.location` au rendu, et le monde marqué
  // « courant » resterait celui de l'arrivée pour toute la session.
  const { pathname } = useLocation();
  const showWorlds = audience === "coach";
  const current = worldOf(pathname);
  // Sur une page de vente sans monde résolu (cas impossible aujourd'hui, mais
  // une route ajoutée sans entrée ci-dessus le produirait), on retombe sur le
  // foyer: c'est le défaut du site depuis que `/` est B2C.
  const world = current ?? WORLDS[0];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center">
          <Link
            to={world.hub}
            className="eq shrink-0 font-display text-lg leading-none text-ink"
          >
            {t("brand.wordmark")}
          </Link>
          {showWorlds && (
            <nav
              aria-label={t("public.nav.doors_label")}
              className="ml-3 hidden items-center gap-1 border-l border-line pl-3 md:flex"
            >
              {world.doors.map((door) => {
                const active = door.to === pathname;
                return (
                  <Link
                    key={door.to}
                    to={door.to}
                    // `aria-current` et pas seulement une couleur: la porte
                    // courante doit être annoncée, et un gris plus foncé ne
                    // s'entend pas.
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-fig-50 font-medium text-fig-700"
                        : "text-ink-soft hover:bg-fig-50 hover:text-ink"
                    }`}
                  >
                    {t(door.label)}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
        <nav className="flex shrink-0 items-center gap-2">
          {/* La langue AVANT les gestes commerciaux: un visiteur qui ne lit pas
              la page n'ira pas chercher un sélecteur après le bouton d'essai.
              Il tient dans ~52px, donc il reste visible sous `sm` là où
              « Legal » a dû être masqué. */}
          <LocaleSwitch />
          {/* La seule exception à « rien d'autre », et ce n'est pas une entrée
              de navigation — c'est une CRÉDENTIAL. Les mentions légales sont où
              le domaine est rattaché à IKIZEN SAS, et ceux qui en ont le plus
              besoin (un vérificateur de store, un contrôle de registre, un coach
              qui décide s'il confie sa méthode à un inconnu) la cherchent avant
              de scroller, pas après.

              MASQUÉE SOUS `sm`, ET C'EST UN ARBITRAGE, PAS UN OUBLI. Le bloc de
              droite fait 275px déconnecté; sur un téléphone il ne laisse pas de
              quoi écrire le nom de la marque à sa gauche. « Legal » est le seul
              des trois qu'on peut rendre — il est dans le pied de page de TOUTES
              les pages publiques, alors que « Sign in » et le geste n'y sont
              nulle part. Ce que ça coûte, en connaissance de cause: un
              vérificateur cherche l'entité légale avant de scroller, et il la
              cherche sur un écran large. C'est le pari qu'on prend. */}
          <Link
            to="/legal"
            className="hidden rounded-full px-3 py-1.5 text-sm text-ink-soft transition-colors hover:bg-fig-50 hover:text-ink sm:inline-flex"
          >
            {t("public.header.legal")}
          </Link>
          {user
            ? (
              <ButtonLink to="/" variant="brand">
                {t("public.header.back_to_app")}
              </ButtonLink>
            )
            : (
              <>
                {/* ── MASQUÉ SOUS `sm`, ET C'EST UNE MESURE, PAS UN GOÛT ─────
                    Relevé à 320px, en français (la langue longue): marque 81px
                    + langue 72 + « Se connecter » 118 + « Commencer » 111 +
                    marges 32 + espaces 24 = 438 pour 320 disponibles. Il faut
                    couper 118px, et « Se connecter » les fait exactement.
                    Sans ça, la PAGE défile en largeur — le bloc de gauche a
                    beau se réduire à zéro, le mot de la marque en sort.
                    LA CONTREPARTIE EST PAYÉE, pas ignorée: le lien est ajouté
                    au PIED DE PAGE de toutes les pages publiques (voir
                    `PublicFooter`). Fermer une porte sans en ouvrir une autre
                    aurait laissé un visiteur mobile qui a déjà un compte sans
                    aucun chemin d'entrée.
                    ⚠️ `audience="student"` le garde À TOUTES LES TAILLES: sur
                    `/join`, c'est la seule chose dont la personne ait besoin
                    (elle a souvent déjà un compte), et il n'y a pas de bouton
                    de geste à côté pour lui disputer la place. */}
                {/* ⚠️ UNE ENVELOPPE, ET PAS UNE CLASSE `hidden` SUR LE BOUTON.
                    Mesuré: `hidden` perd contre le `inline-flex` que
                    `buttonClass` pose déjà. Les deux utilitaires ont la MÊME
                    spécificité, donc c'est l'ordre de génération de la feuille
                    Tailwind qui tranche — pas l'ordre des classes dans
                    l'attribut, et pas nous. `sm:contents` remet l'enveloppe à
                    plat au-dessus de `sm`: le bouton redevient enfant direct du
                    flex, et l'espacement est exactement celui d'avant. */}
                <span
                  className={audience === "student" ? "contents" : "hidden sm:contents"}
                >
                  <ButtonLink
                    to="/auth"
                    variant={audience === "student" ? "secondary" : "ghost"}
                  >
                    {t("public.header.sign_in")}
                  </ButtonLink>
                </span>
                {/* LE GESTE DU MONDE COURANT — voir l'en-tête du fichier.
                    `audience="student"` n'en porte aucun: la personne lit une
                    invitation qu'un coach a déjà payée, et lui proposer un
                    second compte payant au moment où elle accepte le sien est
                    la définition d'une porte qui trompe. */}
                {showWorlds && (
                  <ButtonLink to={world.cta.to} variant="brand">
                    {t(world.cta.label)}
                  </ButtonLink>
                )}
              </>
            )}
        </nav>
      </div>
      {/* ── LA SECONDE RANGÉE: QUI ON EST ──────────────────────────────────
          Deux onglets, pleine largeur, sur toutes les tailles. C'est le choix
          le plus structurant que le visiteur ait à faire, et il ne doit jamais
          coûter un scroll. À partir de `md` il partage la rangée avec rien
          d'autre: les portes sont montées dans la rangée du haut. */}
      {showWorlds && (
        <nav
          aria-label={t("public.nav.worlds_label")}
          className="mx-auto flex max-w-6xl items-center gap-1 px-4 pb-1.5"
        >
          {WORLDS.map((entry) => {
            const active = entry.hub === world.hub;
            return (
              <Link
                key={entry.hub}
                to={entry.hub}
                aria-current={active ? "true" : undefined}
                className={`-mb-px border-b-2 px-2 py-1 text-sm transition-colors ${
                  active
                    ? "border-fig-700 font-medium text-ink"
                    : "border-transparent text-ink-soft hover:text-ink"
                }`}
              >
                {t(entry.label)}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="eq font-display text-sm text-ink">
            {t("brand.wordmark")}
          </div>
          <p className="mt-1 text-sm text-ink-soft">{t("public.footer.tagline")}</p>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-soft">
          {/* Les six portes, ici SANS CONDITION d'audience, sans marquage de
              page courante et LES DEUX MONDES MÊLÉS — c'est un plan du site,
              pas une navigation. C'est aussi le seul endroit où un téléphone
              peut passer d'une page de vente à l'autre: l'en-tête n'a la place
              que de l'interrupteur des mondes (voir WORLDS). */}
          {ALL_DOORS.map((door) => (
            <Link key={door.to} to={door.to} className="hover:text-ink hover:underline">
              {t(door.label)}
            </Link>
          ))}
          {/* « Se connecter » EST ICI PARCE QU'IL EST MASQUÉ DANS L'EN-TÊTE
              SOUS `sm` — c'est la contrepartie de cet arbitrage, pas un lien
              décoratif. Un visiteur mobile qui a déjà un compte n'aurait
              autrement aucun chemin d'entrée depuis une page de vente. */}
          <Link to="/auth" className="hover:text-ink hover:underline">
            {t("public.header.sign_in")}
          </Link>
          <Link to="/legal" className="hover:text-ink hover:underline">
            {t("public.footer.legal")}
          </Link>
          <a
            href={`mailto:${t("public.footer.contact_email")}`}
            className="hover:text-ink hover:underline"
          >
            {t("public.footer.contact")}
          </a>
          <span className="text-ink-soft/70">{t("public.footer.copyright")}</span>
        </nav>
      </div>
    </footer>
  );
}

export default PublicHeader;
