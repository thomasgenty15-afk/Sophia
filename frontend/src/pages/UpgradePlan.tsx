import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Check,
  X,
  Zap,
  MessageCircle,
  Brain,
  LayoutDashboard,
  ArrowRight,
  Sparkles,
  Shield,
  Target,
  ArrowLeft
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const UpgradePlan = () => {
  const navigate = useNavigate();
  const { user, subscription } = useAuth();
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = async (
    tier: 'system' | 'alliance' | 'architecte',
    interval: 'monthly' | 'yearly',
  ) => {
    setError(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-create-checkout-session', {
        body: { tier, interval },
      });
      if (error) throw error;
      const url = (data as any)?.url as string | undefined;
      if (!url) throw new Error("Checkout URL manquante");
      window.location.href = url;
    } catch (err: any) {
      setError(err?.message ?? "Erreur lors de la redirection vers le paiement");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/dashboard'); // Ou précédent
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-violet-100 selection:text-violet-900">
      
      {/* NAVBAR SIMPLE */}
      <nav className="fixed top-0 w-full bg-white/90 backdrop-blur-md z-50 border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <button 
            onClick={handleBack}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 md:w-8 md:h-8 bg-violet-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-violet-200 font-serif">
              S
            </div>
            <span className="font-bold text-lg md:text-xl tracking-tight text-slate-900">Sophia</span>
          </div>

          <div className="w-20" /> {/* Spacer pour centrer le logo */}
        </div>
      </nav>

      {/* HEADER */}
      <div className="pt-28 pb-8 md:pt-40 md:pb-12 px-4 text-center">
        <h1 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4 md:mb-6 tracking-tight">
          Passe à la vitesse <span className="text-violet-600">supérieure</span>
        </h1>
        <p className="text-base md:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed mb-8">
          Choisis le plan qui correspond à tes ambitions. Change ou annule à tout moment.
        </p>

        {/* TOGGLE MONTHLY/YEARLY */}
        <div className="flex items-center justify-center gap-3 md:gap-4 mb-8 flex-wrap">
          <span className={`text-sm font-bold transition-colors ${billingInterval === 'monthly' ? 'text-slate-900' : 'text-slate-400'}`}>
            Mensuel
          </span>
          <button 
            onClick={() => setBillingInterval(prev => prev === 'monthly' ? 'yearly' : 'monthly')}
            className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 relative flex-shrink-0 ${
              billingInterval === 'yearly' ? 'bg-violet-600' : 'bg-slate-200'
            }`}
          >
            <div className={`w-6 h-6 rounded-full bg-white shadow-sm transition-transform duration-300 ${
              billingInterval === 'yearly' ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
          <span className={`text-sm font-bold transition-colors ${billingInterval === 'yearly' ? 'text-slate-900' : 'text-slate-400'}`}>
            Annuel <span className="text-emerald-500 text-xs font-normal ml-1">(-20%)</span>
          </span>
        </div>

        {error && (
            <div className="max-w-md mx-auto mb-8 p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
                {error}
            </div>
        )}
      </div>

      {/* PRICING CARDS */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          
          {/* OPTION 1: LE SYSTÈME */}
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 relative group order-1">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Le Système</h3>
              <p className="text-sm text-slate-500 md:min-h-[40px]">Pour ceux qui veulent juste la structure et l'outil de pilotage.</p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-bold text-slate-900">
                {billingInterval === 'monthly' ? '9,90€' : '7,90€'}
              </span>
              <span className="text-slate-400">/mois</span>
              {billingInterval === 'yearly' && (
                <div className="text-xs text-emerald-500 font-bold mt-1">Facturé 94,90€ par an</div>
              )}
            </div>
            
            <button 
                onClick={() => startCheckout('system', billingInterval)}
                disabled={loading}
                className="w-full py-3 rounded-xl border-2 border-slate-100 text-slate-700 font-bold hover:border-violet-600 hover:text-violet-600 transition-all mb-8 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Chargement..." : "Choisir ce plan"}
            </button>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <LayoutDashboard className="w-5 h-5 text-violet-600 flex-shrink-0" />
                <span className="text-sm text-slate-600">Dashboard d'Actions dynamique</span>
              </div>
              <div className="flex items-start gap-3">
                <Target className="w-5 h-5 text-violet-600 flex-shrink-0" />
                <span className="text-sm text-slate-600">Génération de Plan IA illimitée</span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-violet-600 flex-shrink-0" />
                <span className="text-sm text-slate-600">Suivi des habitudes & tâches</span>
              </div>
              <div className="flex items-start gap-3 opacity-50">
                <X className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-400 line-through">Sophia sur WhatsApp</span>
              </div>
              <div className="flex items-start gap-3 opacity-50">
                <X className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-400 line-through">L'Architecte (Identité)</span>
              </div>
            </div>
          </div>

          {/* OPTION 2: L'ALLIANCE - HIGHLIGHTED */}
          <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-2xl relative transform md:-translate-y-4 z-10 order-2">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-violet-600 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-lg whitespace-nowrap">
              Le plus populaire
            </div>
            
            <div className="mb-6">
              <h3 className="text-xl font-bold text-white mb-2">L'Alliance</h3>
              <p className="text-sm text-slate-400 md:min-h-[40px]">Le combo parfait : Le système + Ton coach IA proactif.</p>
            </div>
            <div className="mb-8">
              <span className="text-5xl font-bold text-white">
                {billingInterval === 'monthly' ? '19,90€' : '15,90€'}
              </span>
              <span className="text-slate-500">/mois</span>
              {billingInterval === 'yearly' && (
                <div className="text-xs text-emerald-400 font-bold mt-1">Facturé 189,90€ par an</div>
              )}
            </div>
            
            <button 
                onClick={() => startCheckout('alliance', billingInterval)}
                disabled={loading}
                className="w-full py-4 rounded-xl bg-violet-600 text-white font-bold hover:bg-violet-500 transition-all shadow-lg shadow-violet-900/50 mb-8 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Chargement..." : "Choisir L'Alliance"}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
                  <Check className="w-3 h-3" />
                </div>
                <span className="text-sm text-slate-300">Tout ce qu'il y a dans "Le Système"</span>
              </div>
              <div className="flex items-start gap-3">
                <MessageCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 animate-pulse" />
                <span className="text-sm text-emerald-400 font-bold">Sophia sur WhatsApp (24/7)</span>
              </div>
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <span className="text-sm text-slate-300">Suivi proactif & Relances</span>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <span className="text-sm text-slate-300">Soutien psychologique & Motivation</span>
              </div>
               <div className="flex items-start gap-3 opacity-50">
                <X className="w-5 h-5 text-slate-600 flex-shrink-0" />
                <span className="text-sm text-slate-600 line-through">L'Architecte (Identité)</span>
              </div>
            </div>
          </div>

          {/* OPTION 3: L'ARCHITECTE */}
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 relative group order-3">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">L'Architecte</h3>
              <p className="text-sm text-slate-500 md:min-h-[40px]">Pour ceux qui veulent redéfinir leur identité en profondeur.</p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-bold text-slate-900">
                {billingInterval === 'monthly' ? '29,90€' : '23,90€'}
              </span>
              <span className="text-slate-400">/mois</span>
              {billingInterval === 'yearly' && (
                <div className="text-xs text-emerald-500 font-bold mt-1">Facturé 286,90€ par an</div>
              )}
            </div>
            
            <button 
                onClick={() => startCheckout('architecte', billingInterval)}
                disabled={loading}
                className="w-full py-3 rounded-xl border-2 border-slate-100 text-slate-700 font-bold hover:border-emerald-600 hover:text-emerald-600 transition-all mb-8 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Chargement..." : "Choisir L'Architecte"}
            </button>

            <div className="space-y-4">
               <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 flex-shrink-0">
                  <Check className="w-3 h-3" />
                </div>
                <span className="text-sm text-slate-600">Tout ce qu'il y a dans "L'Alliance"</span>
              </div>
              <div className="flex items-start gap-3">
                <Brain className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="text-sm text-slate-900 font-bold">Module "Architecte" Complet</span>
              </div>
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="text-sm text-slate-600">Travail sur l'Identité & Vision</span>
              </div>
              <div className="flex items-start gap-3">
                <Target className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="text-sm text-slate-600">Déconstruction des blocages</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default UpgradePlan;