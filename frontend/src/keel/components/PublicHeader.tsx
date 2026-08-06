import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { t, type MessageKey } from "../i18n/t";
import { ButtonLink } from "./ui/Button";
import { LocaleSwitch } from "./LocaleSwitch";

// KEEL — public chrome. The header is the coach's door into the product:
// wordmark, which door you came through, sign in, start trial. Nothing else —
// a public page that needs more navigation than this is trying to be the app.
//
// TWO AUDIENCES, ONE HEADER. /join is public but is NOT a sales surface: the
// person reading it was invited by a coach who already pays. "Start free trial"
// there offers them the coach product — a second, paid account they have no use
// for — at the exact moment they are trying to accept the one they were given.
// `audience="student"` drops that CTA and keeps "Sign in", which is the one
// thing a student on that page might genuinely need (they may already have an
// account). Default is unchanged, so every existing caller keeps the coach door.
//
// ── LES TROIS PORTES, ET POURQUOI ELLES SONT ARRIVÉES DANS L'EN-TÊTE ───────
// Le commentaire ci-dessus disait « rien d'autre », et c'était juste TANT QU'IL
// N'Y AVAIT QU'UNE PAGE DE VENTE. Il y en a trois (`/` vend à qui vend une
// formation, `/gyms` à une salle, `/communities` à une communauté payante),
// elles partagent en-tête, palette et prix — et rien ne disait laquelle on
// lisait ni comment atteindre les deux autres. Un propriétaire de salle envoyé
// sur `/` n'avait aucun chemin vers sa page.
//
// C'est de la navigation de MARQUE, pas de produit: trois destinations, toutes
// publiques, toutes des pages de vente. Elle n'apparaît donc QUE pour
// `audience="coach"` — sur `/join` et `/start` le lecteur est un élève invité,
// à qui trois portes commerciales ne servent à rien.
//
// AU TÉLÉPHONE, LE NOM SEUL — ET SOUS LE MOT DE LA MARQUE, PAS À CÔTÉ.
// Les trois libellés ne tiennent évidemment pas dans 390px, mais le NOM seul
// n'y tenait pas non plus, et ça ne se voyait pas: mesuré sur la page,
// déconnecté, le bloc de droite (« Legal » + « Sign in » + le bouton d'essai)
// fait 275px à lui seul. Posé À CÔTÉ du mot de la marque, le nom recevait 13px
// pour les 97 qu'il demande — c'est-à-dire une ellipse, sur tous les téléphones
// du marché. `truncate` évitait le débordement et masquait le problème.
//
// EMPILÉ, il ne coûte plus rien en largeur (le bloc de gauche prend la largeur
// du plus large des deux, pas leur somme) et l'en-tête garde sa hauteur fixe:
// 18px de mot de marque plus 11px de libellé tiennent dans 56. À partir de
// `md`, le libellé disparaît et la nav des trois portes le remplace.
//
// Reste au pied de page la question « comment aller aux deux autres », qui
// porte les mêmes trois liens: c'est le seul chemin d'une page de vente à
// l'autre sur un téléphone, et c'est assumé.

/**
 * Les trois pages de vente, dans l'ordre où elles se sont ajoutées.
 *
 * ⚠️ Une entrée ici est une PAGE DE VENTE, jamais une page publique de plus.
 * `/legal`, `/join` et `/start` sont publiques et n'ont rien à y faire: la
 * première est une crédential, les deux autres appartiennent à l'élève.
 */
const SALES_DOORS: { to: string; label: MessageKey }[] = [
  { to: "/", label: "public.nav.courses" },
  { to: "/gyms", label: "public.nav.gyms" },
  { to: "/communities", label: "public.nav.communities" },
];

export function PublicHeader({
  audience = "coach",
}: {
  audience?: "coach" | "student";
} = {}) {
  // ── UNE PAGE PUBLIQUE PEUT ÊTRE LUE PAR QUELQU'UN DE CONNECTÉ ───────────────
  // `/legal` est dans la nav du shell, des deux côtés. Un élève qui la tapait
  // atterrissait donc sur cet en-tête, c'est-à-dire sur « Sign in » et « Start
  // free trial » — proposés à quelqu'un qui EST connecté — et sans un seul
  // chemin de retour vers `/app`. Le mot de la marque menait bien à `/`, mais
  // rien ne disait que c'était la sortie, et deux boutons disaient le contraire.
  //
  // La destination reste `/`: la landing route déjà un visiteur connecté vers
  // SON espace (`resolveHomePath`). Pas de second résolveur ici — un aller-retour
  // de plus, et un deuxième endroit où se tromper de porte.
  const { user } = useAuth();
  // `useLocation` et pas `window.location`: sous React Router, une navigation
  // client ne remonte pas `window.location` au rendu, et la porte marquée
  // « courante » resterait celle de l'arrivée pour toute la session.
  const { pathname } = useLocation();
  const showDoors = audience === "coach";
  // La porte courante, ou `undefined` sur une page publique qui n'en est pas
  // une. Comparaison EXACTE: un `startsWith` ferait de `/` la porte active de
  // toutes les autres, puisque toutes commencent par `/`.
  const currentDoor = SALES_DOORS.find((door) => door.to === pathname);

  // Public KEEL pages are English; the legacy index.html declares lang="fr".
  // The landing corrects both through SEO; this covers pages without it (join).
  React.useEffect(() => {
    // `lang` appartient desormais a `i18n/runtime.ts` (un seul ecrivain).
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 flex-col justify-center md:flex-row md:items-center">
          <Link
            to="/"
            className="shrink-0 text-lg font-semibold leading-none tracking-tight text-gray-900"
          >
            {t("brand.wordmark")}
          </Link>
          {showDoors && (
            <>
              {/* Sous `md`: le NOM de la page, pas un lien — on est déjà
                  dessus. Empilé sous le mot de la marque plutôt que posé à
                  côté: à côté, il lui reste 13px des 97 qu'il demande, ce qui
                  n'affiche qu'une ellipse. `truncate` reste la ceinture, mais
                  elle ne sert plus qu'aux libellés qu'on ajouterait plus tard.

                  Casse normale et pas de `tracking-wider`: en capitales
                  espacées « Communities » réclame 88px là où le bloc de gauche
                  en reçoit 71 sur un téléphone de 390. Le même mot en casse
                  normale en demande 62. Une lettrine typographique ne vaut pas
                  de rendre le nom illisible. */}
              {currentDoor
                ? (
                  <span className="mt-1 min-w-0 truncate text-xs text-gray-500 md:hidden">
                    {t(currentDoor.label)}
                  </span>
                )
                : null}
              <nav
                aria-label={t("public.nav.label")}
                className="ml-3 hidden items-center gap-1 border-l border-gray-200 pl-3 md:flex"
              >
                {SALES_DOORS.map((door) => {
                  const active = door.to === currentDoor?.to;
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
                          ? "bg-gray-100 font-medium text-gray-900"
                          : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    >
                      {t(door.label)}
                    </Link>
                  );
                })}
              </nav>
            </>
          )}
        </div>
        <nav className="flex shrink-0 items-center gap-2">
          {/* La langue AVANT les portes commerciales: un visiteur qui ne lit
              pas la page n'ira pas chercher un sélecteur après le bouton
              d'essai. Il tient dans ~52px, donc il reste visible sous `sm`
              là où « Legal » a dû être masqué. */}
          <LocaleSwitch />
          {/* The one exception to "nothing else" above, and it is not a
              navigation entry — it is a CREDENTIAL. The mentions légales are
              where the domain is tied to IKIZEN SAS, and the people who need
              that link most (a store reviewer, a registry check, a coach
              deciding whether to trust an unknown vendor with their method)
              look for it before they scroll, not after. Reachable only from
              the footer, it was a page that existed for nobody. Styled quieter
              than "Sign in" so it stays out of the coach's path. */}
          {/* MASQUÉ SOUS `sm`, ET C'EST UN ARBITRAGE, PAS UN OUBLI.
              Le bloc de droite fait 275px déconnecté; sur un téléphone il ne
              laisse pas de quoi écrire le nom de la page à sa gauche. « Legal »
              est le seul des trois qu'on peut rendre — il est dans le pied de
              page de TOUTES les pages publiques, alors que « Sign in » et
              l'essai n'y sont nulle part.
              Ce que ça coûte, pour pouvoir le rendre en connaissance de cause:
              la raison d'être de ce lien ici est qu'un vérificateur de store ou
              de registre cherche l'entité légale AVANT de scroller. Il la
              cherche sur un écran large; c'est le pari qu'on prend. */}
          <Link
            to="/legal"
            className="hidden rounded-full px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 sm:inline-flex"
          >
            {t("public.header.legal")}
          </Link>
          {user
            ? (
              <ButtonLink to="/" variant="primary">
                {t("public.header.back_to_app")}
              </ButtonLink>
            )
            : (
              <>
                <ButtonLink
                  to="/auth"
                  variant={audience === "student" ? "secondary" : "ghost"}
                >
                  {t("public.header.sign_in")}
                </ButtonLink>
                {audience === "coach" && (
                  <ButtonLink to="/auth?role=coach" variant="primary">
                    {t("public.header.start_trial")}
                  </ButtonLink>
                )}
              </>
            )}
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            {t("brand.wordmark")}
          </div>
          <p className="mt-1 text-sm text-gray-500">{t("public.footer.tagline")}</p>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600">
          {/* Les trois portes, ici SANS CONDITION d'audience et sans marquage
              de page courante — c'est un plan du site, pas une navigation.
              C'est aussi le seul endroit où un téléphone peut passer d'une
              page de vente à l'autre: l'en-tête n'a la place que du nom de
              celle qu'on lit (voir SALES_DOORS). */}
          {SALES_DOORS.map((door) => (
            <Link key={door.to} to={door.to} className="hover:text-gray-900 hover:underline">
              {t(door.label)}
            </Link>
          ))}
          <Link to="/legal" className="hover:text-gray-900 hover:underline">
            {t("public.footer.legal")}
          </Link>
          <a
            href={`mailto:${t("public.footer.contact_email")}`}
            className="hover:text-gray-900 hover:underline"
          >
            {t("public.footer.contact")}
          </a>
          <span className="text-gray-400">{t("public.footer.copyright")}</span>
        </nav>
      </div>
    </footer>
  );
}

export default PublicHeader;
