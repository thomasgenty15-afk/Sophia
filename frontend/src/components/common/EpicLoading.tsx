import { useState, useEffect } from 'react';
import { Brain, Sparkles, Activity, Layers, Zap, CheckCircle2, Cpu, Network, Fingerprint } from 'lucide-react';

const LOADING_STEPS = [
  {
    percent: 5,
    message: "Connexion au Cortex Sophia...",
    subtext: "Initialisation des réseaux neuronaux profonds",
    icon: Brain,
    color: "text-slate-400"
  },
  {
    percent: 15,
    message: "Décodage de ton profil...",
    subtext: "Analyse biométrique et psychologique",
    icon: Fingerprint,
    color: "text-blue-400"
  },
  {
    percent: 30,
    message: "Cartographie du contexte...",
    subtext: "Identification des leviers et points de friction",
    icon: Activity,
    color: "text-cyan-500"
  },
  {
    percent: 45,
    message: "Simulation des scénarios...",
    subtext: "Projection de 14 trajectoires possibles",
    icon: Network,
    color: "text-indigo-500"
  },
  {
    percent: 60,
    message: "Architecture du système...",
    subtext: "Structuration des phases et de la progression",
    icon: Layers,
    color: "text-violet-500"
  },
  {
    percent: 75,
    message: "Optimisation neuro-ergonomique...",
    subtext: "Réduction de la charge mentale et calibrage dopamine",
    icon: Zap,
    color: "text-fuchsia-500"
  },
  {
    percent: 88,
    message: "Raffinement haute précision...",
    subtext: "Ajustement fin des fréquences et durées",
    icon: Cpu,
    color: "text-pink-500"
  },
  {
    percent: 95,
    message: "Finalisation du protocole...",
    subtext: "Vérification de la cohérence globale",
    icon: Sparkles,
    color: "text-rose-500"
  },
  {
    percent: 99,
    message: "Génération imminente...",
    subtext: "Derniers calculs avant le lancement",
    icon: CheckCircle2,
    color: "text-emerald-500"
  }
];

export const EpicLoading = () => {
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    // Durée cible : ~90 secondes pour atteindre 98%
    const interval = setInterval(() => {
      setProgress(prev => {
        const remaining = 100 - prev;
        let speedFactor = 0.008; 
        if (prev > 30 && prev < 70) speedFactor = 0.012;
        
        const increment = remaining * speedFactor;
        const next = prev + (increment < 0.05 ? 0.05 : increment);
        return next > 99 ? 99 : next;
      });
    }, 150);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const currentStep = LOADING_STEPS.findIndex(s => s.percent > progress);
    if (currentStep === -1) {
      setStepIndex(LOADING_STEPS.length - 1);
    } else {
      setStepIndex(Math.max(0, currentStep - 1));
    }
  }, [progress]);

  const CurrentIcon = LOADING_STEPS[stepIndex].icon;
  const currentColor = LOADING_STEPS[stepIndex].color;

  return (
    <div className="flex flex-col items-center justify-center py-32 w-full max-w-md mx-auto relative">
      
      {/* Background Glow Effect - Plus subtil et large */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-indigo-500/10 via-purple-500/5 to-pink-500/10 rounded-full blur-[100px] animate-pulse-slow pointer-events-none" />

      {/* CERCLE CENTRAL ÉPURÉ */}
      <div className="relative mb-16 group">
        
        {/* Halo central respirant */}
        <div className={`absolute inset-0 bg-gradient-to-tr from-indigo-500/30 to-fuchsia-500/30 rounded-full blur-2xl animate-pulse scale-110 transition-colors duration-1000`} />
        
        {/* Icon Container - Glassmorphism pur */}
        <div className="relative w-28 h-28 bg-white/90 backdrop-blur-xl rounded-full shadow-[0_0_40px_-10px_rgba(124,58,237,0.3)] border border-white/50 flex items-center justify-center z-10 transition-all duration-700">
          <CurrentIcon 
            className={`w-12 h-12 transition-all duration-700 ${currentColor} filter drop-shadow-md`} 
            strokeWidth={1.5}
          />
        </div>
        
        {/* Particules flottantes minimalistes */}
        <div className="absolute inset-0 animate-spin-slower pointer-events-none">
           <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-6 w-1.5 h-1.5 bg-indigo-400/60 rounded-full blur-[1px]" />
        </div>
        <div className="absolute inset-0 animate-spin-reverse-slower pointer-events-none">
           <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-6 w-1 h-1 bg-fuchsia-400/60 rounded-full blur-[1px]" />
        </div>
      </div>

      {/* TEXTE PRINCIPAL - Fade in/out fluide */}
      <div className="h-12 flex items-center justify-center mb-2 w-full px-4">
        <h2 
          key={stepIndex} // Clé pour déclencher l'animation à chaque changement
          className="text-2xl md:text-3xl font-bold text-slate-900 text-center tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 animate-fade-in-up"
        >
          {LOADING_STEPS[stepIndex].message}
        </h2>
      </div>

      {/* SOUS-TEXTE */}
      <div className="h-8 flex items-center justify-center mb-12 w-full px-8">
        <p 
          key={`sub-${stepIndex}`}
          className="text-slate-500 font-medium text-sm text-center animate-fade-in-up delay-100"
        >
          {LOADING_STEPS[stepIndex].subtext}
        </p>
      </div>

      {/* BARRE DE PROGRESSION - Ultra fine et premium */}
      <div className="w-64 h-1 bg-slate-100 rounded-full overflow-hidden relative">
        <div 
          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-300 ease-out relative"
          style={{ width: `${progress}%` }}
        >
            <div className="absolute inset-0 bg-white/50 w-full animate-shimmer" />
            <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-white/80 to-transparent" />
        </div>
      </div>
      
      <div className="mt-6 flex justify-between w-64 text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">
        <span className="animate-pulse">Processing</span>
        <span className="font-mono text-slate-400 tabular-nums">{Math.floor(progress)}%</span>
      </div>
    </div>
  );
};
