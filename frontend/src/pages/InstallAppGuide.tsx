import { ArrowLeft, Download, KeyRound, Share2, Smartphone, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import Footer from "../components/Footer";
import SEO from "../components/SEO";
import { useAppInstall } from "../hooks/useAppInstall";

const InstallAppGuide = () => {
  const { platform, canInstallDirectly, promptInstall } = useAppInstall();

  const platformLabel =
    platform === "android" ? "Android" : platform === "ios" ? "iPhone / iPad" : "ton appareil";

  return (
    <div className="min-h-screen bg-[#fbf7ef] text-[#17211d]">
      <SEO
        title="Installer Sophia sur son téléphone"
        description="Comment installer Sophia sur Android ou iPhone, puis enregistrer ses identifiants pour se reconnecter sans friction."
        canonical="https://sophia-coach.ai/installer-app"
      />

      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#52635b] transition-colors hover:text-[#002d21]"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à l'accueil
        </Link>

        <div className="mt-8 rounded-[2rem] border border-white/50 bg-[linear-gradient(130deg,#f7d8bb_0%,#e9eedc_38%,#c6e5db_100%)] p-6 shadow-sm md:mt-12 md:p-10">
          <div className="flex items-center gap-4">
            <img src="/apple-touch-icon.png" alt="Sophia" className="h-14 w-14 rounded-2xl border border-white/50 shadow-md" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-5xl">Installer Sophia</h1>
              <p className="mt-2 text-sm leading-6 text-[#405148] md:text-base">
                Ajoute Sophia à ton téléphone pour retrouver ton coach IA comme une vraie app.
              </p>
            </div>
          </div>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/42 px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#002d21] backdrop-blur">
            <Smartphone className="h-3.5 w-3.5" />
            Appareil détecté : {platformLabel}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <section className={`rounded-3xl border bg-white/66 p-6 shadow-sm ${platform === "android" ? "border-[#002d21] ring-4 ring-[#e3f1e6]" : "border-[#eadfce]"}`}>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#e3f1e6] text-[#002d21]">
              <Download className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold">Installer Sophia sur Android</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#52635b]">
              Si ton navigateur le permet, tu peux installer Sophia comme une app. Sinon, passe par le menu du navigateur.
            </p>
            <ol className="mt-4 list-inside list-decimal space-y-2 text-sm text-[#405148]">
              <li>Ouvre Sophia dans Chrome sur Android.</li>
              <li>Touche le menu du navigateur.</li>
              <li>Choisis l'option pour installer ou ajouter l'app.</li>
            </ol>
            {canInstallDirectly ? (
              <button
                onClick={() => void promptInstall()}
                className="mt-5 w-full rounded-full bg-[#002d21] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-[#002d21]/18 transition-colors hover:bg-[#17211d]"
              >
                Installer maintenant
              </button>
            ) : (
              <div className="mt-5 rounded-2xl border border-[#eadfce] bg-[#fffaf1] p-4 text-sm text-[#52635b]">
                Si le bouton d'installation directe n'apparaît pas, utilise simplement le menu du navigateur.
              </div>
            )}
          </section>

          <section className={`rounded-3xl border bg-white/66 p-6 shadow-sm ${platform === "ios" ? "border-[#002d21] ring-4 ring-[#e3f1e6]" : "border-[#eadfce]"}`}>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#fff0de] text-[#b26c3a]">
              <Share2 className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold">Ajouter Sophia à l'écran d'accueil sur iPhone</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#52635b]">
              Sur iPhone, l'installation passe par Safari. Il n'y a pas le même bouton natif que sur Android.
            </p>
            <ol className="mt-4 list-inside list-decimal space-y-2 text-sm text-[#405148]">
              <li>Ouvre Sophia dans Safari.</li>
              <li>Touche le bouton Partager.</li>
              <li>Choisis Sur l'écran d'accueil.</li>
              <li>Valide pour créer l'icône Sophia.</li>
            </ol>
            <div className="mt-5 rounded-2xl border border-[#f6d8b8] bg-[#fff8ec] p-4 text-sm text-[#8a5633]">
              Astuce : si tu es sur Chrome sur iPhone, ouvre Sophia dans Safari pour faire cette étape.
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-3xl border border-[#eadfce] bg-white/66 p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e3f1e6] text-[#002d21]">
              <KeyRound className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Enregistrer tes identifiants</h2>
              <p className="mt-1 text-sm text-[#52635b]">Pour revenir à Sophia en un clic, sans friction.</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              ["Sur Android", "Active la sauvegarde proposée par Chrome ou Google Password Manager."],
              ["Sur iPhone", "Active Trousseau iCloud pour que Safari propose d'enregistrer tes identifiants."],
            ].map(([title, copy]) => (
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

      <Footer />
    </div>
  );
};

export default InstallAppGuide;
