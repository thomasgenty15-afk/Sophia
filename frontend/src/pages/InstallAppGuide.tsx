import { ArrowLeft, Download, KeyRound, Share2, Smartphone, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import SEO from "../components/SEO";
import { useAppInstall } from "../hooks/useAppInstall";
// ── LE PIED DE PAGE PUBLIC, ET PLUS `components/Footer` ─────────────────────
// L'ancien pied était écrit en français en dur (« Mentions légales »,
// « Politique de confidentialité ») avec « Powered by IKIZEN » et « Sophia
// Coach »: une page traduite aurait gardé ces mots au milieu d'un écran
// anglais. `PublicFooter` est le pied des pages publiques, traduit par le
// chrome (`public.*`, `brand.*`).
import { PublicFooter } from "../keel/components/PublicHeader";
// Tout le texte vit sous `install_app.*` (2026-09-23), et la page est déclarée
// dans `keel/i18n/catalog.ts`: elle se lit en français ou en anglais selon le
// choix du visiteur.
import { t } from "../keel/i18n/t";

const InstallAppGuide = () => {
  const { platform, canInstallDirectly, promptInstall } = useAppInstall();

  // « Android » et « iPhone / iPad » sont des noms de produit: ils s'écrivent
  // pareil dans les deux langues et ne passent pas par le catalogue.
  const platformLabel =
    platform === "android"
      ? "Android"
      : platform === "ios"
        ? "iPhone / iPad"
        : t("install_app.device_unknown");

  const credentials: Array<[string, string]> = [
    [t("install_app.credentials.android_title"), t("install_app.credentials.android_body")],
    [t("install_app.credentials.ios_title"), t("install_app.credentials.ios_body")],
  ];

  return (
    <div className="min-h-screen bg-[#fbf7ef] text-[#17211d]">
      <SEO
        title={t("install_app.seo_title")}
        description={t("install_app.seo_description")}
        canonical="https://sophia-coach.ai/installer-app"
        // ⚠️ `noindex,follow` — PAGE DE SUPPORT, PAS UNE SURFACE DE VENTE.
        // Elle n'est dans aucun sitemap et n'a jamais eu de lien entrant
        // public, mais une SPA rend 200 sur tout: sans balise, elle restait
        // indexable et concourait avec les pages de vente sur le nom de la
        // marque. On l'envoie à quelqu'un qui a déjà un compte.
        robots="noindex,follow"
      />

      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#52635b] transition-colors hover:text-[#002d21]"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("install_app.back_home")}
        </Link>

        <div className="mt-8 rounded-[2rem] border border-white/50 bg-[linear-gradient(130deg,#f7d8bb_0%,#e9eedc_38%,#c6e5db_100%)] p-6 shadow-sm md:mt-12 md:p-10">
          <div className="flex items-center gap-4">
            <img src="/apple-touch-icon.png" alt={t("brand.wordmark")} className="h-14 w-14 rounded-2xl border border-white/50 shadow-md" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-5xl">{t("install_app.title")}</h1>
              <p className="mt-2 text-sm leading-6 text-[#405148] md:text-base">
                {t("install_app.lead")}
              </p>
            </div>
          </div>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/42 px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#002d21] backdrop-blur">
            <Smartphone className="h-3.5 w-3.5" />
            {t("install_app.detected", { platform: platformLabel })}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <section className={`rounded-3xl border bg-white/66 p-6 shadow-sm ${platform === "android" ? "border-[#002d21] ring-4 ring-[#e3f1e6]" : "border-[#eadfce]"}`}>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#e3f1e6] text-[#002d21]">
              <Download className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold">{t("install_app.android.title")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#52635b]">
              {t("install_app.android.body")}
            </p>
            <ol className="mt-4 list-inside list-decimal space-y-2 text-sm text-[#405148]">
              <li>{t("install_app.android.step1")}</li>
              <li>{t("install_app.android.step2")}</li>
              <li>{t("install_app.android.step3")}</li>
            </ol>
            {canInstallDirectly ? (
              <button
                onClick={() => void promptInstall()}
                className="mt-5 w-full rounded-full bg-[#002d21] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-[#002d21]/18 transition-colors hover:bg-[#17211d]"
              >
                {t("install_app.android.install_now")}
              </button>
            ) : (
              <div className="mt-5 rounded-2xl border border-[#eadfce] bg-[#fffaf1] p-4 text-sm text-[#52635b]">
                {t("install_app.android.fallback")}
              </div>
            )}
          </section>

          <section className={`rounded-3xl border bg-white/66 p-6 shadow-sm ${platform === "ios" ? "border-[#002d21] ring-4 ring-[#e3f1e6]" : "border-[#eadfce]"}`}>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#fff0de] text-[#b26c3a]">
              <Share2 className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold">{t("install_app.ios.title")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#52635b]">
              {t("install_app.ios.body")}
            </p>
            <ol className="mt-4 list-inside list-decimal space-y-2 text-sm text-[#405148]">
              <li>{t("install_app.ios.step1")}</li>
              <li>{t("install_app.ios.step2")}</li>
              <li>{t("install_app.ios.step3")}</li>
              <li>{t("install_app.ios.step4")}</li>
            </ol>
            <div className="mt-5 rounded-2xl border border-[#f6d8b8] bg-[#fff8ec] p-4 text-sm text-[#8a5633]">
              {t("install_app.ios.tip")}
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-3xl border border-[#eadfce] bg-white/66 p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e3f1e6] text-[#002d21]">
              <KeyRound className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{t("install_app.credentials.title")}</h2>
              <p className="mt-1 text-sm text-[#52635b]">{t("install_app.credentials.lead")}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {credentials.map(([title, copy]) => (
              <div key={title} className="rounded-2xl border border-[#eadfce] bg-[#fffaf1] p-4">
                <h3 className="mb-2 font-bold">{title}</h3>
                <div className="flex items-start gap-2 text-sm text-[#405148]">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#002d21]" />
                  <span>{copy}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <PublicFooter />
    </div>
  );
};

export default InstallAppGuide;
