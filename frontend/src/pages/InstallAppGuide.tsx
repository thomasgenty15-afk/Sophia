import { ArrowLeft, CheckCircle2, Download, KeyRound, Share2, Smartphone, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import Footer from '../components/Footer';
import SEO from '../components/SEO';
import { useAppInstall } from '../hooks/useAppInstall';

const InstallAppGuide = () => {
  const { platform, canInstallDirectly, promptInstall } = useAppInstall();

  const platformLabel =
    platform === 'android' ? 'Android' : platform === 'ios' ? 'iPhone / iPad' : 'ton appareil';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <SEO
        title="Installer Sophia sur son telephone"
        description="Comment installer Sophia sur Android ou iPhone, puis enregistrer ses identifiants pour se reconnecter sans friction."
        canonical="https://sophia-coach.ai/installer-app"
      />

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-violet-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour a l'accueil
        </Link>

        <div className="mt-8 md:mt-12 rounded-[2rem] bg-white border border-slate-200 shadow-sm p-6 md:p-10">
          <div className="flex items-center gap-3 mb-6">
            <img src="/apple-touch-icon.png" alt="Sophia" className="w-14 h-14 rounded-2xl shadow-md border border-slate-100" />
            <div>
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900">
                Installer Sophia
              </h1>
              <p className="text-sm md:text-base text-slate-500 mt-1">
                Ajoute Sophia a ton telephone et enregistre tes identifiants pour te reconnecter sans souci.
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 border border-violet-100 text-violet-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide">
            <Smartphone className="w-3.5 h-3.5" />
            Appareil detecte : {platformLabel}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <section className={`bg-white rounded-3xl border p-6 shadow-sm transition-all ${platform === 'android' ? 'border-violet-300 ring-4 ring-violet-50' : 'border-slate-200'}`}>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
              <Download className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Installer Sophia sur Android</h2>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Si ton navigateur le permet, tu peux installer Sophia comme une app. Sinon, passe par le menu du navigateur puis choisis l'option d'installation.
            </p>

            <ol className="mt-4 space-y-2 text-sm text-slate-700 list-decimal list-inside">
              <li>Ouvre Sophia dans Chrome sur Android.</li>
              <li>Touche le menu du navigateur.</li>
              <li>Choisis l'option pour installer ou ajouter l'app.</li>
            </ol>

            {canInstallDirectly ? (
              <button
                onClick={() => {
                  void promptInstall();
                }}
                className="mt-5 w-full px-4 py-3 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm shadow-lg shadow-violet-200 transition-colors"
              >
                Installer maintenant
              </button>
            ) : (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Si le bouton d'installation directe n'apparait pas ici, utilise simplement le menu du navigateur.
              </div>
            )}
          </section>

          <section className={`bg-white rounded-3xl border p-6 shadow-sm transition-all ${platform === 'ios' ? 'border-violet-300 ring-4 ring-violet-50' : 'border-slate-200'}`}>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
              <Share2 className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Ajouter Sophia a l'ecran d'accueil sur iPhone</h2>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Sur iPhone, l'installation passe par Safari. Il n'y a pas le meme bouton natif que sur Android.
            </p>

            <ol className="mt-4 space-y-2 text-sm text-slate-700 list-decimal list-inside">
              <li>Ouvre Sophia dans Safari.</li>
              <li>Touche le bouton Partager.</li>
              <li>Choisis Sur l'ecran d'accueil.</li>
              <li>Valide pour creer l'icone Sophia sur ton telephone.</li>
            </ol>

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Astuce : si tu es sur Chrome sur iPhone, ouvre tout de meme Sophia dans Safari pour faire cette etape.
            </div>
          </section>
        </div>

        <section className="mt-6 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Comment enregistrer mes identifiants</h2>
              <p className="text-sm text-slate-600 mt-1">
                Pour te reconnecter en un clic, sans avoir à retaper ton mot de passe.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-bold text-slate-900 mb-2">Sur Android</h3>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                  Active la sauvegarde proposee par Chrome ou Google Password Manager.
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                  Si rien ne s'affiche, verifie dans les reglages Chrome que la sauvegarde des mots de passe est activee.
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-bold text-slate-900 mb-2">Sur iPhone</h3>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                  Active Trousseau iCloud pour que Safari propose d'enregistrer tes identifiants.
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                  Accepte la proposition Enregistrer le mot de passe quand elle apparait.
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
};

export default InstallAppGuide;
