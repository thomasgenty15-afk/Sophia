import React from "react";
import { Link } from "react-router-dom";
import { t } from "../i18n/t";
import { ButtonLink } from "./ui/Button";

// KEEL — public chrome. The header is the coach's door into the product:
// wordmark, sign in, start trial. Nothing else — a public page that needs more
// navigation than this is trying to be the app.

export function PublicHeader() {
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
          <ButtonLink to="/auth" variant="ghost">
            {t("public.header.sign_in")}
          </ButtonLink>
          <ButtonLink to="/auth?role=coach" variant="primary">
            {t("public.header.start_trial")}
          </ButtonLink>
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
