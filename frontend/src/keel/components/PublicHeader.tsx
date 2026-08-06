import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { t } from "../i18n/t";
import { ButtonLink } from "./ui/Button";

// KEEL — public chrome. The header is the coach's door into the product:
// wordmark, sign in, start trial. Nothing else — a public page that needs more
// navigation than this is trying to be the app.
//
// TWO AUDIENCES, ONE HEADER. /join is public but is NOT a sales surface: the
// person reading it was invited by a coach who already pays. "Start free trial"
// there offers them the coach product — a second, paid account they have no use
// for — at the exact moment they are trying to accept the one they were given.
// `audience="student"` drops that CTA and keeps "Sign in", which is the one
// thing a student on that page might genuinely need (they may already have an
// account). Default is unchanged, so every existing caller keeps the coach door.

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

  // Public KEEL pages are English; the legacy index.html declares lang="fr".
  // The landing corrects both through SEO; this covers pages without it (join).
  React.useEffect(() => {
    document.documentElement.lang = "en";
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="text-lg font-semibold tracking-tight text-gray-900">
          {t("brand.wordmark")}
        </Link>
        <nav className="flex items-center gap-2">
          {/* The one exception to "nothing else" above, and it is not a
              navigation entry — it is a CREDENTIAL. The mentions légales are
              where the domain is tied to IKIZEN SAS, and the people who need
              that link most (a store reviewer, a registry check, a coach
              deciding whether to trust an unknown vendor with their method)
              look for it before they scroll, not after. Reachable only from
              the footer, it was a page that existed for nobody. Styled quieter
              than "Sign in" so it stays out of the coach's path. */}
          <Link
            to="/legal"
            className="rounded-full px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
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
