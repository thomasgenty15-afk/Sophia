import { CheckCircle2, Download, ExternalLink, X } from 'lucide-react';

type InstallPlatform = 'android' | 'ios' | 'other';

interface InstallAppModalProps {
  isOpen: boolean;
  platform: InstallPlatform;
  isInstalling?: boolean;
  onInstall: () => void;
  onAlreadyInstalled: () => void;
  onLater: () => void;
  onOpenGuide: () => void;
}

export const InstallAppModal = ({
  isOpen,
  platform,
  isInstalling = false,
  onInstall,
  onAlreadyInstalled,
  onLater,
  onOpenGuide,
}: InstallAppModalProps) => {
  if (!isOpen) return null;

  const platformHint =
    platform === 'android'
      ? "Sur Android, on peut souvent l'installer directement en un clic."
      : platform === 'ios'
        ? "Sur iPhone, on t'explique comment l'ajouter à l'écran d'accueil."
        : "On t'explique la meilleure façon de l'ajouter à ton appareil.";

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/apple-touch-icon.png" alt="Sophia" className="w-10 h-10 rounded-2xl shadow-sm" />
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Ajoute Sophia a ton telephone</h3>
              <p className="text-xs text-slate-500">Accede plus vite a ton dashboard.</p>
            </div>
          </div>

          <button
            onClick={onLater}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
            <p className="text-sm text-violet-900 font-medium">
              Garde Sophia sous la main et reduis les frictions de reconnexion.
            </p>
            <p className="text-xs text-violet-700/80 mt-2">{platformHint}</p>
          </div>

          <button
            onClick={onInstall}
            disabled={isInstalling}
            className="w-full px-4 py-3 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm shadow-lg shadow-violet-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {isInstalling ? 'Ouverture...' : 'Installer'}
          </button>

          <button
            onClick={onAlreadyInstalled}
            className="w-full px-4 py-3 rounded-2xl border border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50 text-emerald-700 font-bold text-sm transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Deja installee
          </button>

          <button
            onClick={onLater}
            className="w-full px-4 py-3 rounded-2xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm transition-all"
          >
            Pas pour le moment
          </button>

          <button
            onClick={onOpenGuide}
            className="w-full text-sm text-violet-700 hover:text-violet-800 font-medium flex items-center justify-center gap-2 transition-colors"
          >
            Comment installer l'app et enregistrer mes identifiants ?
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
