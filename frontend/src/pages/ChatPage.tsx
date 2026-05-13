import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChatInterface } from '../components/ChatInterface';
import { useAuth } from '../context/AuthContext';

export const ChatPage: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const envForce = String((import.meta as any)?.env?.VITE_FORCE_ONBOARDING_CHAT ?? "").trim().toLowerCase();
  const forceOnboarding = envForce === "1" || envForce === "true" || envForce === "yes";
  const envWhatsappSim = String((import.meta as any)?.env?.VITE_ENABLE_WHATSAPP_WEB_SIM ?? "").trim().toLowerCase();
  const isLocalBrowser = typeof window !== "undefined" &&
    (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");
  const whatsappSimEnabled = envWhatsappSim === "1" || envWhatsappSim === "true" || envWhatsappSim === "yes" ||
    ((isLocalBrowser || (import.meta as any)?.env?.DEV === true) && envWhatsappSim !== "0" && envWhatsappSim !== "false" && envWhatsappSim !== "no");
  const search = new URLSearchParams(location.search);
  const modeParam = search.get("mode");
  const isWhatsappSim = whatsappSimEnabled && modeParam !== "web";
  const onboardingParam = search.get("onboarding");
  const isOnboarding =
    onboardingParam === "1" || onboardingParam === "true" ||
    (!isWhatsappSim && forceOnboarding);
  const scope = isWhatsappSim
    ? "whatsapp"
    : (search.get("scope") || (isOnboarding ? "web_onboarding" : "web"));
  const channel = isWhatsappSim ? "whatsapp" : "web";

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center">Chargement...</div>;

  if (!user) return null; // Sera redirigé

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl font-bold text-slate-800 mb-8 text-center">Conversation avec Sophia</h1>
        <ChatInterface
          scope={scope}
          channel={channel}
          whatsappSim={isWhatsappSim}
          forceOnboardingFlow={isOnboarding}
          autostartMessage={isOnboarding ? "Ok, on commence l'onboarding." : undefined}
        />
      </div>
    </div>
  );
};
