import React, { useEffect, useState } from 'react';
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
  const { user, subscription, accessTier } = useAuth();
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currentTier = accessTier; // single source of truth from profiles.access_tier
  const currentInterval = (subscription as any)?.interval as ('monthly' | 'yearly' | null | undefined) ?? null;
  const rank = (t: string) => (t === "system" ? 1 : t === "alliance" ? 2 : t === "architecte" ? 3 : 0);
  const currentPaidTier = (currentTier === "system" || currentTier === "alliance" || currentTier === "architecte") ? currentTier : "none";
  // NOTE: Inclusion is tier-based only; interval switching is handled per-card using currentInterval.
  const includesSystem = currentTier === "system" || currentTier === "alliance" || currentTier === "architecte";
  const includesAlliance = currentTier === "alliance" || currentTier === "architecte";
  const includesArchitecte = currentTier === "architecte";

  // Best-effort: if billing data is stale (common right after checkout), force a one-time sync then reload.
  useEffect(() => {
    if (!user) return;
    const attemptedKey = `billing_sync_upgrade_attempted:${user.id}`;
    const attempted = sessionStorage.getItem(attemptedKey) === "1";
    const isStale = currentTier === "none" || currentTier === "trial";
    if (!isStale || attempted) return;

    sessionStorage.setItem(attemptedKey, "1");
    (async () => {
      try {
        await supabase.functions.invoke("stripe-sync-subscription", { body: {} });
      } catch {
        // ignore
      } finally {
        window.location.reload();
      }
    })();
  }, [user, currentTier]);

  const startCheckout = async (
    tier: 'system' | 'alliance' | 'architecte',
    interval: 'monthly' | 'yearly',
  ) => {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const hasActiveSub = currentPaidTier !== "none";

      const isUpgrade = hasActiveSub && rank(tier) > rank(currentPaidTier);
      const isIntervalSwitch = hasActiveSub && rank(tier) === rank(currentPaidTier) && currentInterval !== interval;
      const isNewSub = !hasActiveSub;

      const planLabel =
        tier === "system" ? "Le Système" : tier === "alliance" ? "L'Alliance" : "L'Architecte";
      const intervalLabel = interval === "yearly" ? "annuel" : "mensuel";

      const confirmMsg =
        `Confirmer ${isNewSub ? "l'abonnement" : (isUpgrade ? "la mise à niveau" : (isIntervalSwitch ? "le changement de formule" : "le changement de plan"))} ?\n\n` +
        `Plan : ${planLabel}\n` +
        `Formule : ${intervalLabel}\n\n` +
        `Tu pourras toujours gérer ta facturation (factures, annulation, moyen de paiement) depuis le menu.\n\n` +
        `Note : Stripe calcule automatiquement les ajustements (prorata / différence de prix) selon ton abonnement actuel, ` +
        `et les applique soit immédiatement, soit sur la prochaine facture (selon la configuration Stripe).`;

      const ok = window.confirm(confirmMsg);
      if (!ok) {
        setLoading(false);
        return;
      }

      if (hasActiveSub) {
        // Existing subscriber: change plan directly (avoids Billing Portal config issues).
        const { error } = await supabase.functions.invoke("stripe-change-plan", {
          body: { tier, interval, effective_at: "now" },
        });
        if (error) throw error;
        window.alert(
          `C'est confirmé.\n\n` +
            `Rappel : tu peux gérer la facturation depuis le menu.\n` +
            `Stripe appliquera automatiquement les ajustements (prorata / différence de prix) si nécessaire ` +
            `(immédiatement ou sur la prochaine facture).`,
        );
        window.location.href = "/dashboard?billing=success";
      } else {
        window.alert(
          `C'est confirmé.\n\n` +
            `Tu vas être redirigé vers Stripe pour finaliser.\n` +
            `Rappel : tu pourras gérer la facturation depuis le menu ensuite.`,
        );
        const { data, error } = await supabase.functions.invoke('stripe-create-checkout-session', {
          body: { tier, interval },
        });
        if (error) throw error;
        const url = (data as any)?.url as string | undefined;
        if (!url) throw new Error("Checkout URL manquante");
        window.location.href = url;
      }
    } catch (err: any) {
      setError(err?.message ?? "Erreur lors de la redirection vers le paiement");
    } finally {
      setLoading(false);
    }
  };

  const formatDateFr = (iso: string | null | undefined) => {
    const s = String(iso ?? "").trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  };

  const scheduleDowngrade = async (tier: 'system' | 'alliance') => {
    setError(null);
    setSuccess(null);
    const effectiveDate = formatDateFr((subscription as any)?.current_period_end);
    const intervalToKeep = (currentInterval ?? billingInterval) as 'monthly' | 'yearly';
    const planLabel = tier === "system" ? "Le Système" : "L'Alliance";
    const msg =
      `Confirmer le downgrade vers "${planLabel}" ?\n\n` +
      `Ton accès actuel reste actif jusqu'à la fin de la période${effectiveDate ? ` (${effectiveDate})` : ""}.\n\n` +
      `Rappel : tu peux gérer la facturation depuis le menu.\n\n` +
      `Note : à la date de renouvellement, Stripe appliquera automatiquement le changement (aucun débit immédiat).`;
    const ok = window.confirm(msg);
    if (!ok) return;

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("stripe-change-plan", {
        body: { tier, interval: intervalToKeep, effective_at: "period_end" },
      });
      if (error) throw error;
      setSuccess(
        `OK — downgrade programmé${effectiveDate ? ` pour le ${effectiveDate}` : " à la fin de la période"}. ` +
          `Tu gardes l'accès actuel jusque-là. (Tu peux gérer la facturation depuis le menu.)`,
      );
    } catch (err: any) {
      setError(err?.message ?? "Erreur lors de la programmation du downgrade");
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
            <img 
              src="/apple-touch-icon.png" 
              alt="Sophia" 
              className="w-8 h-8"
            />
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

        {success && (
          <div className="max-w-md mx-auto mb-8 p-4 bg-violet-50 text-violet-800 rounded-xl text-sm border border-violet-100">
            {success}
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
                disabled={loading || (rank(currentPaidTier) > rank("system")) || (currentPaidTier === "system" && currentInterval === billingInterval)}
                className={`w-full py-3 rounded-xl font-bold transition-all mb-8 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                  (rank(currentPaidTier) > rank("system")) || (currentPaidTier === "system" && currentInterval === billingInterval)
                    ? "bg-violet-50 text-violet-700 border-2 border-violet-200"
                    : "border-2 border-slate-100 text-slate-700 hover:border-violet-600 hover:text-violet-600"
                } ${loading ? "opacity-50" : ""}`}
            >
              {loading ? (
                "Chargement..."
              ) : (rank(currentPaidTier) > rank("system")) ? (
                <>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-violet-600 text-white">
                    <Check className="w-3 h-3" />
                  </span>
                  <span>Inclus</span>
                </>
              ) : (currentPaidTier === "system" && currentInterval === billingInterval) ? (
                <>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-violet-600 text-white">
                    <Check className="w-3 h-3" />
                  </span>
                  <span>Plan actuel</span>
                </>
              ) : (
                currentPaidTier === "none"
                  ? "Choisir Le Système"
                  : (billingInterval === "yearly" ? "Passer en annuel" : "Passer en mensuel")
              )}
            </button>

            {/* Downgrade link (only when current plan is above System) */}
            {rank(currentPaidTier) > rank("system") && (
              <button
                type="button"
                onClick={() => scheduleDowngrade("system")}
                disabled={loading}
                className="w-full -mt-4 mb-6 text-xs text-slate-500 hover:text-red-600 underline decoration-slate-300 hover:decoration-red-500 transition-colors disabled:opacity-60 disabled:hover:text-slate-500"
              >
                Repasser sur cet abonnement
              </button>
            )}

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
                disabled={loading || (rank(currentPaidTier) > rank("alliance")) || (currentPaidTier === "alliance" && currentInterval === billingInterval)}
                className={`w-full py-4 rounded-xl font-bold transition-all shadow-lg shadow-violet-900/50 mb-8 flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
                  (rank(currentPaidTier) > rank("alliance")) || (currentPaidTier === "alliance" && currentInterval === billingInterval)
                    ? "bg-violet-500/20 text-violet-200 border border-violet-500/30"
                    : "bg-violet-600 text-white hover:bg-violet-500"
                } ${loading ? "opacity-50" : ""}`}
            >
              {loading ? (
                "Chargement..."
              ) : (rank(currentPaidTier) > rank("alliance")) ? (
                <>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-violet-500 text-violet-950">
                    <Check className="w-3 h-3" />
                  </span>
                  <span>Inclus</span>
                </>
              ) : (currentPaidTier === "alliance" && currentInterval === billingInterval) ? (
                <>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-violet-500 text-violet-950">
                    <Check className="w-3 h-3" />
                  </span>
                  <span>Plan actuel</span>
                </>
              ) : (
                <>
                  {rank(currentPaidTier) < rank("alliance")
                    ? "Choisir L'Alliance"
                    : (billingInterval === "yearly" ? "Passer en annuel" : "Passer en mensuel")}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Downgrade link (only when current plan is Architecte) */}
            {rank(currentPaidTier) > rank("alliance") && (
              <button
                type="button"
                onClick={() => scheduleDowngrade("alliance")}
                disabled={loading}
                className="w-full -mt-4 mb-6 text-xs text-slate-300 hover:text-red-400 underline decoration-slate-600 hover:decoration-red-400 transition-colors disabled:opacity-60 disabled:hover:text-slate-300"
              >
                Repasser sur cet abonnement
              </button>
            )}

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
                disabled={loading || (currentPaidTier === "architecte" && currentInterval === billingInterval)}
                className={`w-full py-3 rounded-xl font-bold transition-all mb-8 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                  currentPaidTier === "architecte" && currentInterval === billingInterval
                    ? "bg-violet-50 text-violet-700 border-2 border-violet-200"
                    : "border-2 border-slate-100 text-slate-700 hover:border-emerald-600 hover:text-emerald-600"
                } ${loading ? "opacity-50" : ""}`}
            >
              {loading ? (
                "Chargement..."
              ) : (currentPaidTier === "architecte" && currentInterval === billingInterval) ? (
                <>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-violet-600 text-white">
                    <Check className="w-3 h-3" />
                  </span>
                  <span>Plan actuel</span>
                </>
              ) : (
                currentPaidTier === "architecte"
                  ? (billingInterval === "yearly" ? "Passer en annuel" : "Passer en mensuel")
                  : "Choisir L'Architecte"
              )}
            </button>

            <div className="space-y-4">
               <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 flex-shrink-0">
                  <Check className="w-3 h-3" />
                </div>
                <span className="text-sm text-slate-600">Tout ce qu'il y a dans "L'Alliance"</span>
              </div>
              <div className="flex items-start gap-3">
                <MessageCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="text-sm text-amber-600 font-bold">Messages illimités avec Sophia</span>
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