import React, { useMemo, useState, useEffect } from 'react';
import { 
  X, 
  User, 
  CreditCard, 
  Settings, 
  LogOut, 
  Shield, 
  Zap,
  Mail,
  Bell,
  Check,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { newRequestId, requestHeaders } from '../lib/requestId';
import { useNavigate } from 'react-router-dom';

import { getEffectiveTier } from '../lib/entitlements';
import { DEFAULT_LOCALE, DEFAULT_TIMEZONE, detectBrowserTimezone, getAllSupportedTimezones } from '../lib/localization';

interface UserProfileProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'action' | 'architecte';
  initialTab?: TabType;
}

type TabType = 'general' | 'subscription' | 'settings';

const UserProfile: React.FC<UserProfileProps> = ({ isOpen, onClose, mode, initialTab }) => {
  const { user, signOut, subscription, trialEnd, accessTier } = useAuth();
  const navigate = useNavigate();
  const shouldRender = isOpen;

  const [activeTab, setActiveTab] = useState<TabType>(initialTab ?? 'general');
  const [profile, setProfile] = useState<{
    full_name: string | null;
    phone_number?: string | null;
    timezone?: string | null;
    locale?: string | null;
    tz_follow_device?: boolean | null;
  } | null>(null);
  const [billingLoading, setBillingLoading] = useState<boolean>(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [fullNameDraft, setFullNameDraft] = useState<string>("");
  const [phoneDraft, setPhoneDraft] = useState<string>("");
  const [originalPhone, setOriginalPhone] = useState<string>("");

  const [phoneEditOpen, setPhoneEditOpen] = useState<boolean>(false);
  const [phoneLoading, setPhoneLoading] = useState<boolean>(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneSuccess, setPhoneSuccess] = useState<string | null>(null);

  const [emailEditOpen, setEmailEditOpen] = useState<boolean>(false);
  const [emailDraft, setEmailDraft] = useState<string>("");
  const [emailLoading, setEmailLoading] = useState<boolean>(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);

  const [prefsLoading, setPrefsLoading] = useState<boolean>(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [prefsSuccess, setPrefsSuccess] = useState<string | null>(null);
  const [timezoneDraft, setTimezoneDraft] = useState<string>(DEFAULT_TIMEZONE);
  const [tzFollowDeviceDraft, setTzFollowDeviceDraft] = useState<boolean>(false);
  const supportedTimezones = useMemo(() => {
    const detected = detectBrowserTimezone();
    const all = getAllSupportedTimezones(detected);
    const current = (timezoneDraft || "").trim();
    return current && !all.includes(current) ? [current, ...all] : all;
  }, [timezoneDraft]);

  const displayEmail = user?.email || "";

  useEffect(() => {
    if (user) {
      // Fetch profile data (only name needed here, trialEnd is in context)
      const fetchProfile = async () => {
        const { data } = await supabase
          .from('profiles')
          .select('full_name, phone_number, timezone, locale, tz_follow_device')
          .eq('id', user.id)
          .single();
        
        if (data) {
          setProfile(data);
          setFullNameDraft((data as any)?.full_name || user?.user_metadata?.full_name || "");
          const p = ((data as any)?.phone_number ?? "") as string;
          // IMPORTANT: Ne pas écraser phoneDraft si l'utilisateur est en train d'éditer ?
          // Pour faire simple et éviter les conflits, on update le draft seulement si on vient d'ouvrir ou charger.
          // Ici c'est le fetch initial.
          setPhoneDraft(p);
          setOriginalPhone(p);

          const tz = (((data as any)?.timezone ?? "") as string).trim();
          setTimezoneDraft(tz || detectBrowserTimezone() || DEFAULT_TIMEZONE);
          setTzFollowDeviceDraft(Boolean((data as any)?.tz_follow_device));
        }
      };
      fetchProfile();
    }
  }, [user]);

  // Update phone draft if profile loads later or changes externally
  useEffect(() => {
    if (profile && !phoneEditOpen) {
       const p = (profile.phone_number ?? "") as string;
       setPhoneDraft(p);
       setOriginalPhone(p);
    }
  }, [profile, phoneEditOpen]);

  useEffect(() => {
    if (!shouldRender) return;
    setActiveTab(initialTab ?? "general");
    setSaveError(null);
    setSaveSuccess(null);
    setEmailError(null);
    setEmailSuccess(null);
    setEmailDraft(displayEmail);
    setEmailEditOpen(false);
    setPhoneError(null);
    setPhoneSuccess(null);
    setPhoneEditOpen(false);
    setPrefsError(null);
    setPrefsSuccess(null);
  }, [shouldRender, initialTab, displayEmail]);

  const handleSignOut = async () => {
    await signOut();
    onClose();
    navigate('/auth');
  };

  // Get display values
  const displayName = useMemo(() => {
    const n = (profile?.full_name || user?.user_metadata?.full_name || "").trim();
    return n || "Utilisateur";
  }, [profile?.full_name, user?.user_metadata?.full_name]);
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const isArchitect = mode === 'architecte';
  const successColor = isArchitect ? "text-emerald-300" : "text-emerald-700";
  const errorColor = isArchitect ? "text-red-300" : "text-red-600";

  function normalizePhoneInput(raw: string): string | null {
    const cleaned = (raw ?? "").trim().replace(/[()\s.-]/g, "");
    if (!cleaned) return null;
    // Common FR case: 06/07XXXXXXXX => +336/7XXXXXXXX
    if (/^0[67]\d{8}$/.test(cleaned)) return `+33${cleaned.slice(1)}`;
    if (cleaned.startsWith("00") && /^\d+$/.test(cleaned.slice(2))) return `+${cleaned.slice(2)}`;
    if (cleaned.startsWith("+") && /^\+\d{8,15}$/.test(cleaned)) return cleaned;
    throw new Error("Numéro invalide. Utilise le format international, ex: +33612345678.");
  }

  const handleUpdatePhone = async () => {
    if (!user) return;
    setPhoneLoading(true);
    setPhoneError(null);
    setPhoneSuccess(null);

    try {
      const nextPhone = normalizePhoneInput(phoneDraft);
      const prevPhone = (originalPhone ?? "").trim();
      const nextPhoneStr = (nextPhone ?? "").trim();
      const phoneChanged = (prevPhone || "") !== (nextPhoneStr || "");

      if (!phoneChanged) {
        setPhoneSuccess("Numéro inchangé.");
        setPhoneEditOpen(false);
        return;
      }

      // Friendly pre-check: block numbers already used by a verified / WhatsApp-active account.
      // (DB also enforces this in some paths, but this gives a better UX.)
      try {
        const { data: inUse, error: inUseErr } = await supabase.rpc('is_verified_phone_in_use', {
          p_phone: nextPhoneStr,
        });
        if (inUseErr) throw inUseErr;
        if (inUse) {
          throw new Error("Ce numéro est déjà utilisé par un autre compte.");
        }
      } catch (precheckErr) {
        // Best-effort: if the precheck fails due to permissions/network, we don't hard-block,
        // but we still let the DB constraints/logic protect us.
        console.warn('Phone in-use precheck failed (non-blocking):', precheckErr);
      }

      const nowIso = new Date().toISOString();
      const updatePayload: any = {
        phone_number: nextPhone,
        // Reset phone verification marker (new number must be re-validated)
        phone_verified_at: null,
        // Reset WhatsApp flags/state for the new number
        whatsapp_opted_in: false,
        whatsapp_bilan_opted_in: false,
        whatsapp_last_inbound_at: null,
        whatsapp_last_outbound_at: null,
        whatsapp_state: null,
        whatsapp_state_updated_at: nowIso,
        phone_invalid: false,
        whatsapp_optin_sent_at: null,
        whatsapp_opted_out_at: null,
        whatsapp_optout_reason: null,
        whatsapp_optout_confirmed_at: null,
      };

      const { data, error } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', user.id)
        .select('phone_number')
        .single();

      if (error) throw error;

      if (data) {
        setProfile((prev: any) => ({ ...prev, phone_number: data.phone_number }));
        setOriginalPhone(data.phone_number ?? "");
        setPhoneDraft(data.phone_number ?? "");
      }

      // Best-effort: notify user by email about the phone number change.
      try {
        const notifyReqId = newRequestId();
        const { error: notifyErr } = await supabase.functions.invoke('notify-profile-change', {
          body: { kind: 'phone_changed', old_phone: prevPhone || null, new_phone: nextPhoneStr || null },
          headers: requestHeaders(notifyReqId),
        });
        if (notifyErr) console.warn('Phone change notify failed (non-blocking):', notifyErr);
      } catch (e) {
        console.warn('Phone change notify failed (non-blocking):', e);
      }

      // Best-effort: (re)send WhatsApp opt-in template for the new number.
      try {
        const waReqId = newRequestId();
        // Force send: changing phone number is an explicit user action; we want to resend even if an opt-in was sent before.
        const { data: waData, error: waErr } = await supabase.functions.invoke('whatsapp-optin', { body: { force: true }, headers: requestHeaders(waReqId) });
        if (waErr) {
          console.warn("WhatsApp opt-in send failed (non-blocking):", waErr, waData);
        }
      } catch (e) {
        console.warn("WhatsApp opt-in send failed (non-blocking):", e);
      }

      setPhoneSuccess("Numéro modifié avec succès.");
      setPhoneEditOpen(false);
    } catch (err: any) {
      const msg = err?.message || "Impossible d’enregistrer le numéro.";
      if (typeof msg === "string" && (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique"))) {
        setPhoneError("Ce numéro est déjà utilisé par un autre compte.");
      } else {
        setPhoneError(msg);
      }
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const nextFullName = (fullNameDraft ?? "").trim() || null;
      
      // On ne sauvegarde que le nom ici maintenant, le téléphone est géré à part.
      // Sauf si on veut garder la compatibilité ? 
      // Pour être safe et cohérent avec l'UI scindée, on ne touche qu'au nom.

      const { data, error } = await supabase
        .from('profiles')
        .update({ full_name: nextFullName })
        .eq('id', user.id)
        .select('full_name')
        .single();

      if (error) throw error;

      if (data) {
        setProfile((prev: any) => ({ ...prev, full_name: data.full_name }));
        setFullNameDraft(data.full_name ?? "");
      }

      setSaveSuccess("Informations enregistrées.");
    } catch (err: any) {
      setSaveError(err?.message || "Impossible d’enregistrer.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!user) return;
    setEmailLoading(true);
    setEmailError(null);
    setEmailSuccess(null);
    try {
      const nextEmail = (emailDraft ?? "").trim().toLowerCase();
      if (!nextEmail) throw new Error("Email requis.");
      if (nextEmail === (displayEmail || "").toLowerCase()) {
        setEmailSuccess("Email inchangé.");
        setEmailEditOpen(false);
        return;
      }
      const { error } = await supabase.auth.updateUser(
        { email: nextEmail },
        { emailRedirectTo: window.location.origin + "/dashboard" },
      );
      if (error) throw error;
      // Best-effort: notify current email about the email change request.
      try {
        const notifyReqId = newRequestId();
        const { error: notifyErr } = await supabase.functions.invoke('notify-profile-change', {
          body: { kind: 'email_change_requested', old_email: (displayEmail || null), new_email: nextEmail },
          headers: requestHeaders(notifyReqId),
        });
        if (notifyErr) console.warn('Email change notify failed (non-blocking):', notifyErr);
      } catch (e) {
        console.warn('Email change notify failed (non-blocking):', e);
      }
      setEmailSuccess("Demande envoyée. Vérifie tes emails pour confirmer le changement.");
      setEmailEditOpen(false);
    } catch (err: any) {
      setEmailError(err?.message || "Impossible de modifier l’email.");
    } finally {
      setEmailLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    if (!user) return;
    setPrefsLoading(true);
    setPrefsError(null);
    setPrefsSuccess(null);
    try {
      const nextTimezone = (timezoneDraft ?? "").trim() || DEFAULT_TIMEZONE;
      const { data, error } = await supabase
        .from("profiles")
        .update({
          timezone: nextTimezone,
          tz_follow_device: tzFollowDeviceDraft,
          // For now, language is locked to French; store locale deterministically.
          locale: DEFAULT_LOCALE,
        })
        .eq("id", user.id)
        .select("timezone, locale, tz_follow_device")
        .single();

      if (error) throw error;
      if (data) {
        setProfile((prev: any) => ({ ...prev, ...data }));
        setTimezoneDraft(((data as any)?.timezone ?? "") || nextTimezone);
        setTzFollowDeviceDraft(Boolean((data as any)?.tz_follow_device));
      }
      setPrefsSuccess("Préférences enregistrées.");
    } catch (err: any) {
      setPrefsError(err?.message || "Impossible d’enregistrer les préférences.");
    } finally {
      setPrefsLoading(false);
    }
  };

  const accessTierToPlanLabel = (t: string): string => {
    if (t === "architecte") return "L’Architecte";
    if (t === "alliance") return "L’Alliance";
    if (t === "system") return "Le Système";
    if (t === "trial") return "Essai";
    return "Lecture seule";
  };

  const intervalLabel = (i: unknown): string | null => {
    const v = String(i ?? "").trim().toLowerCase();
    if (v === "monthly") return "Mensuel";
    if (v === "yearly") return "Annuel";
    return null;
  };

  if (!shouldRender) return null;

  const now = Date.now();
  const trialActive = accessTier === "trial";
  const subActive = accessTier === "system" || accessTier === "alliance" || accessTier === "architecte";
  const softLocked = accessTier === "none";
  const currentTier = getEffectiveTier(subscription);
  const isMaxTier = accessTier === 'architecte';
  const subInterval = ((subscription as any)?.interval as ('monthly' | 'yearly' | null | undefined)) ?? null;
  const canSwitchArchitecteInterval = isMaxTier && subInterval === "monthly";

  const trialDaysLeft = trialEnd
    ? Math.max(0, Math.ceil((new Date(trialEnd).getTime() - now) / (1000 * 60 * 60 * 24)))
    : null;

  const openPortal = async () => {
    setBillingError(null);
    setBillingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-create-portal-session', { body: {} });
      if (error) throw error;
      const url = (data as any)?.url as string | undefined;
      if (!url) throw new Error("Portal URL manquante");
      window.location.href = url;
    } catch (err: any) {
      setBillingError(err?.message ?? "Erreur portail");
    } finally {
      setBillingLoading(false);
    }
  };

  // Styles dynamiques selon le mode
  const styles = {
    overlay: "fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in",
    container: `w-full max-w-md h-full shadow-2xl transform transition-transform duration-300 animate-slide-in-right ${
      isArchitect 
        ? "bg-emerald-950 text-emerald-50 border-l border-emerald-800" 
        : "bg-white text-slate-900 border-l border-slate-200"
    }`,
    header: `p-6 border-b flex items-center justify-between ${
      isArchitect ? "border-emerald-900 bg-emerald-950" : "border-slate-100 bg-slate-50"
    }`,
    closeBtn: `p-2 rounded-full transition-colors ${
      isArchitect ? "hover:bg-emerald-900 text-emerald-400" : "hover:bg-slate-200 text-slate-500"
    }`,
    sidebarItem: (isActive: boolean) => `flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${
      isActive 
        ? (isArchitect ? "bg-emerald-900 text-emerald-100 shadow-sm border border-emerald-800" : "bg-white text-blue-600 shadow-sm border border-slate-200") 
        : (isArchitect ? "text-emerald-600 hover:text-emerald-300 hover:bg-emerald-900/50" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100")
    }`,
    sectionTitle: `text-xs font-bold uppercase tracking-widest mb-4 ${
      isArchitect ? "text-emerald-600" : "text-slate-400"
    }`,
    card: `p-4 rounded-xl border mb-4 ${
      isArchitect ? "bg-emerald-900/30 border-emerald-800" : "bg-slate-50 border-slate-200"
    }`,
    input: `w-full p-3 rounded-lg text-sm outline-none border transition-all ${
      isArchitect 
        ? "bg-emerald-900/50 border-emerald-800 text-white focus:border-emerald-500 placeholder-emerald-700" 
        : "bg-white border-slate-200 text-slate-900 focus:border-blue-500 placeholder-slate-400"
    }`
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.container} onClick={e => e.stopPropagation()}>
        
        {/* HEADER */}
        <div className={styles.header}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg border-2 ${
              isArchitect ? "bg-emerald-900 text-emerald-100 border-emerald-700" : "bg-slate-200 text-slate-600 border-white shadow-sm"
            }`}>
              {initials}
            </div>
            <div>
              <h2 className="font-bold text-sm leading-tight">{displayName}</h2>
              <p className={`text-xs ${isArchitect ? "text-emerald-500" : "text-slate-500"}`}>{displayEmail}</p>
            </div>
          </div>
          <button onClick={onClose} className={styles.closeBtn}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col h-[calc(100%-80px)]">
          
          {/* NAVIGATION TABS (Horizontal pour mobile/desktop) */}
          <div className={`px-6 py-4 flex flex-col min-[350px]:flex-row gap-2 border-b overflow-x-auto ${isArchitect ? "border-emerald-900" : "border-slate-100"}`}>
            <button onClick={() => setActiveTab('general')} className={`${styles.sidebarItem(activeTab === 'general')} justify-center min-[350px]:justify-start`}>
              <User className="w-4 h-4" /> Compte
            </button>
            <button onClick={() => setActiveTab('subscription')} className={`${styles.sidebarItem(activeTab === 'subscription')} justify-center min-[350px]:justify-start`}>
              <CreditCard className="w-4 h-4" /> Plan
            </button>
            <button onClick={() => setActiveTab('settings')} className={`${styles.sidebarItem(activeTab === 'settings')} justify-center min-[350px]:justify-start`}>
              <Settings className="w-4 h-4" /> Options
            </button>
          </div>

          {/* CONTENT SCROLLABLE */}
          <div className="flex-1 overflow-y-auto p-6">
            
            {/* --- TAB: GENERAL --- */}
            {activeTab === 'general' && (
              <div className="animate-fade-in">
                <h3 className={styles.sectionTitle}>Informations Personnelles</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className={`block text-xs font-medium mb-1.5 ${isArchitect ? "text-emerald-400" : "text-slate-500"}`}>Nom complet</label>
                    <input
                      type="text"
                      value={fullNameDraft}
                      onChange={(e) => setFullNameDraft(e.target.value)}
                      className={styles.input}
                      placeholder="Ton nom"
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-medium mb-1.5 ${isArchitect ? "text-emerald-400" : "text-slate-500"}`}>Email</label>
                    <div className="relative">
                      <input type="email" defaultValue={displayEmail} className={styles.input} readOnly />
                      <div className={`absolute right-3 top-3 ${isArchitect ? "text-emerald-500" : "text-emerald-600"}`}>
                        <Check className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEmailDraft(displayEmail);
                          setEmailError(null);
                          setEmailSuccess(null);
                          setEmailEditOpen((v) => !v);
                        }}
                        className={`text-xs font-semibold underline ${
                          isArchitect ? "text-emerald-400 hover:text-emerald-300" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Modifier mon email
                      </button>
                      {emailSuccess && <div className={`text-xs ${successColor}`}>{emailSuccess}</div>}
                      {emailError && <div className={`text-xs ${errorColor}`}>{emailError}</div>}
                    </div>
                    {emailEditOpen && (
                      <div className={`mt-3 p-3 rounded-xl border ${isArchitect ? "bg-emerald-900/30 border-emerald-800" : "bg-white border-slate-200"}`}>
                        <div className="space-y-2">
                          <input
                            type="email"
                            value={emailDraft}
                            onChange={(e) => setEmailDraft(e.target.value)}
                            className={styles.input}
                            placeholder="nouvel-email@example.com"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEmailEditOpen(false)}
                              className={`px-3 py-2 rounded-lg text-xs font-bold border ${
                                isArchitect ? "border-emerald-800 text-emerald-200 hover:bg-emerald-900/40" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                              }`}
                              disabled={emailLoading}
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              onClick={handleUpdateEmail}
                              className={`px-3 py-2 rounded-lg text-xs font-bold ${
                                isArchitect ? "bg-emerald-700 hover:bg-emerald-600 text-white" : "bg-slate-900 hover:bg-slate-800 text-white"
                              }`}
                              disabled={emailLoading}
                            >
                              {emailLoading ? "Envoi..." : "Valider"}
                            </button>
                          </div>
                          <p className={`text-[11px] leading-snug ${isArchitect ? "text-emerald-500/80" : "text-slate-500"}`}>
                            Si la confirmation email est activée, Sophia te demandera de confirmer via un lien envoyé sur ta boîte.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={`block text-xs font-medium mb-1.5 ${isArchitect ? "text-emerald-400" : "text-slate-500"}`}>Téléphone (WhatsApp)</label>
                    
                    {!phoneEditOpen ? (
                       <div className="relative">
                          <input 
                            type="text" 
                            value={originalPhone || "Aucun numéro"} 
                            className={`${styles.input} opacity-70`} 
                            readOnly 
                          />
                          <div className={`absolute right-3 top-3 ${isArchitect ? "text-emerald-500" : "text-emerald-600"}`}>
                             {originalPhone && <Check className="w-4 h-4" />}
                          </div>
                       </div>
                    ) : null}

                    <div className="mt-2 flex items-center justify-between gap-3">
                      {!phoneEditOpen && (
                        <button
                          type="button"
                          onClick={() => {
                            setPhoneDraft(originalPhone);
                            setPhoneError(null);
                            setPhoneSuccess(null);
                            setPhoneEditOpen(true);
                          }}
                          className={`text-xs font-semibold underline ${
                            isArchitect ? "text-emerald-400 hover:text-emerald-300" : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          Modifier mon numéro
                        </button>
                      )}
                      
                      {phoneSuccess && <div className={`text-xs ${successColor}`}>{phoneSuccess}</div>}
                      {phoneError && <div className={`text-xs ${errorColor}`}>{phoneError}</div>}
                    </div>

                    {phoneEditOpen && (
                      <div className={`mt-3 p-3 rounded-xl border ${isArchitect ? "bg-emerald-900/30 border-emerald-800" : "bg-white border-slate-200"}`}>
                        <div className="space-y-2">
                          <input
                            type="tel"
                            value={phoneDraft}
                            onChange={(e) => setPhoneDraft(e.target.value)}
                            className={styles.input}
                            placeholder="Ex: +33612345678"
                          />
                          
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setPhoneEditOpen(false)}
                              className={`px-3 py-2 rounded-lg text-xs font-bold border ${
                                isArchitect ? "border-emerald-800 text-emerald-200 hover:bg-emerald-900/40" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                              }`}
                              disabled={phoneLoading}
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              onClick={handleUpdatePhone}
                              className={`px-3 py-2 rounded-lg text-xs font-bold ${
                                isArchitect ? "bg-emerald-700 hover:bg-emerald-600 text-white" : "bg-slate-900 hover:bg-slate-800 text-white"
                              }`}
                              disabled={phoneLoading}
                            >
                              {phoneLoading ? "Enregistrement..." : "Valider"}
                            </button>
                          </div>
                          
                          <p className={`text-[11px] leading-snug ${isArchitect ? "text-emerald-500/80" : "text-slate-500"}`}>
                            Format demandé: international (E.164), ex: +33612345678. Si tu changes de numéro, on te redemandera l’opt-in WhatsApp.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 space-y-2">
                  {(saveError || saveSuccess) && (
                    <div className={`text-xs rounded-lg p-3 border ${
                      saveError
                        ? (isArchitect ? "border-red-900/50 bg-red-950/30" : "border-red-100 bg-red-50")
                        : (isArchitect ? "border-emerald-800 bg-emerald-900/30" : "border-emerald-200 bg-emerald-50")
                    }`}>
                      <span className={saveError ? errorColor : successColor}>{saveError ?? saveSuccess}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={saveLoading || !user}
                    className={`w-full py-3 rounded-lg font-bold text-sm transition-all ${
                      isArchitect
                        ? "bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-60"
                        : "bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-60"
                    }`}
                  >
                    {saveLoading ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>

                <div className={`mt-8 p-4 rounded-xl flex items-center gap-4 border ${
                  isArchitect ? "bg-amber-900/20 border-amber-800/50" : "bg-amber-50 border-amber-100"
                }`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    isArchitect ? "bg-amber-900/50 text-amber-400" : "bg-amber-100 text-amber-600"
                  }`}>
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    {(() => {
                        const createdAt = user?.created_at ? new Date(user.created_at) : new Date();
                        const daysSinceCreation = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

                        let level = "Initié";
                        if (daysSinceCreation >= 365) level = "Maître d'Œuvre";
                        else if (daysSinceCreation >= 180) level = "Architecte";
                        else if (daysSinceCreation >= 90) level = "Bâtisseur";
                        else if (daysSinceCreation >= 30) level = "Compagnon";
                        else if (daysSinceCreation >= 15) level = "Apprenti";

                        return (
                            <>
                                <h4 className={`font-bold text-sm ${isArchitect ? "text-amber-200" : "text-amber-900"}`}>Niveau : {level}</h4>
                                <p className={`text-xs ${isArchitect ? "text-amber-500/80" : "text-amber-700/70"}`}>
                                    Membre depuis {daysSinceCreation} jour{daysSinceCreation > 1 ? 's' : ''}
                                </p>
                            </>
                        );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* --- TAB: SUBSCRIPTION --- */}
            {activeTab === 'subscription' && (
              <div className="animate-fade-in">
                <h3 className={styles.sectionTitle}>Plan & Accès</h3>
                
                <div className={`relative overflow-hidden rounded-2xl p-6 border ${
                  isArchitect ? "bg-gradient-to-br from-emerald-900 to-emerald-950 border-emerald-700" : "bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 text-white"
                }`}>
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-white/10 backdrop-blur-md border border-white/20 text-white">
                          {subActive ? "Actif" : trialActive ? "Essai" : "Lecture seule"}
                        </span>
                        <h2 className="text-2xl font-serif font-bold mt-2 text-white">
                          {accessTierToPlanLabel(accessTier)}
                        </h2>
                      </div>
                      <Zap className="w-8 h-8 text-amber-400" />
                    </div>
                    {subActive && (
                      <div className="text-xs text-slate-300 mb-2">
                        {accessTierToPlanLabel(accessTier)}
                        {intervalLabel((subscription as any)?.interval) ? (
                          <span className="opacity-70"> · {intervalLabel((subscription as any)?.interval)}</span>
                        ) : null}
                      </div>
                    )}

                    {subActive ? (
                      <p className="text-sm text-slate-300 mb-6">
                        Ton abonnement est actif{subscription?.cancel_at_period_end ? " (résiliation en fin de période)." : "."}
                      </p>
                    ) : trialActive ? (
                      <p className="text-sm text-slate-300 mb-6">
                        Essai gratuit en cours{trialDaysLeft !== null ? ` · ${trialDaysLeft}j restants` : ""}.
                      </p>
                    ) : (
                      <p className="text-sm text-slate-300 mb-6">
                        Ton essai est terminé. L’app est en lecture seule tant que tu n’es pas abonné.
                      </p>
                    )}
                    
                    {subscription?.current_period_end && (
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                        <CreditCard className="w-3 h-3" />
                        Renouvelle jusqu’au {new Date(subscription.current_period_end).toLocaleDateString("fr-FR")}
                      </div>
                    )}
                  </div>
                  
                  {/* Background Decor */}
                  <div className="absolute right-[-20px] top-[-20px] w-32 h-32 bg-amber-500/20 blur-[50px] rounded-full pointer-events-none" />
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  {billingError && (
                    <div className={`text-xs rounded-lg p-3 border ${
                      isArchitect ? "border-red-900/50 text-red-300 bg-red-950/30" : "border-red-100 text-red-600 bg-red-50"
                    }`}>
                      {billingError}
                    </div>
                  )}

                  {subActive ? (
                    <div className="space-y-3">
                      {(!isMaxTier || canSwitchArchitecteInterval) && (
                        <button
                          onClick={() => {
                            onClose();
                            navigate('/upgrade');
                          }}
                          className={`w-full py-3 rounded-lg font-bold text-sm transition-all ${
                             isArchitect ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-200"
                          }`}
                        >
                          {canSwitchArchitecteInterval ? "Passer en annuel" : "Passer à la vitesse supérieure"}
                        </button>
                      )}

                      <button
                        onClick={openPortal}
                        disabled={billingLoading}
                        className={`w-full py-3 rounded-lg font-bold text-sm transition-all ${
                          isArchitect
                            ? "bg-emerald-800 hover:bg-emerald-700 text-emerald-100 disabled:opacity-60"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-60"
                        }`}
                      >
                        {billingLoading ? "Ouverture..." : "Gérer la facturation"}
                      </button>
                      
                      {/* BOUTON SE DESABONNER */}
                      <button
                        onClick={openPortal}
                        disabled={billingLoading}
                        className="w-full text-xs text-slate-400 hover:text-red-500 underline decoration-slate-300 hover:decoration-red-500 transition-all text-center"
                      >
                        Annuler mon abonnement
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className={`text-xs font-bold uppercase tracking-widest ${
                        isArchitect ? "text-emerald-600" : "text-slate-400"
                      }`}>
                        Choisir un plan
                      </div>

                      <div className="text-center py-6">
                        <p className="text-sm text-slate-500 mb-4">
                          Débloque tout le potentiel de Sophia.
                        </p>
                        <button
                          onClick={() => {
                            onClose();
                            navigate('/upgrade');
                          }}
                          className={`w-full py-3 rounded-lg font-bold text-sm transition-all ${
                             isArchitect ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-200"
                          }`}
                        >
                          Passer à la vitesse supérieure
                        </button>
                      </div>

                      {billingLoading && (
                        <div className={`${isArchitect ? "text-emerald-500" : "text-slate-500"} text-xs`}>
                          Redirection...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* --- TAB: SETTINGS --- */}
            {activeTab === 'settings' && (
              <div className="animate-fade-in">
                <h3 className={styles.sectionTitle}>Préférences</h3>

                <div className={styles.card}>
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-xs font-medium mb-1.5 ${isArchitect ? "text-emerald-400" : "text-slate-500"}`}>
                        Langue
                      </label>
                      <input
                        type="text"
                        value="Français"
                        readOnly
                        className={`${styles.input} opacity-80`}
                      />
                      <p className={`mt-1 text-[11px] ${isArchitect ? "text-emerald-500/80" : "text-slate-500"}`}>
                        Langue verrouillée pour le moment.
                      </p>
                    </div>

                    <div>
                      <label className={`block text-xs font-medium mb-1.5 ${isArchitect ? "text-emerald-400" : "text-slate-500"}`}>
                        Fuseau horaire (IANA)
                      </label>
                      <select
                        value={(timezoneDraft || "").trim()}
                        onChange={(e) => setTimezoneDraft(e.target.value)}
                        className={styles.input}
                      >
                        {supportedTimezones.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                      </select>
                      <div className={`mt-1 text-[11px] ${isArchitect ? "text-emerald-500/80" : "text-slate-500"}`}>
                        Actuel:{" "}
                        {tzFollowDeviceDraft
                          ? (detectBrowserTimezone() || timezoneDraft || DEFAULT_TIMEZONE) + " (appareil)"
                          : (timezoneDraft || DEFAULT_TIMEZONE) + " (profil)"}
                      </div>
                    </div>

                    <div className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${isArchitect ? "border-emerald-800" : "border-slate-200"}`}>
                      <div>
                        <div className="text-sm font-medium">Itinérance</div>
                        <div className={`text-[11px] ${isArchitect ? "text-emerald-500/80" : "text-slate-500"}`}>
                          Suivre automatiquement le fuseau horaire de l’appareil.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTzFollowDeviceDraft((v) => !v)}
                        className={`w-10 h-5 rounded-full p-1 cursor-pointer transition-colors ${
                          tzFollowDeviceDraft
                            ? (isArchitect ? "bg-emerald-600" : "bg-blue-600")
                            : (isArchitect ? "bg-emerald-900 border border-emerald-700" : "bg-slate-200")
                        }`}
                        aria-pressed={tzFollowDeviceDraft}
                        aria-label="Activer l'itinérance"
                      >
                        <div className={`w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform ${tzFollowDeviceDraft ? "translate-x-5" : ""}`} />
                      </button>
                    </div>

                    {(prefsError || prefsSuccess) && (
                      <div className={`text-xs rounded-lg p-3 border ${
                        prefsError
                          ? (isArchitect ? "border-red-900/50 bg-red-950/30" : "border-red-100 bg-red-50")
                          : (isArchitect ? "border-emerald-800 bg-emerald-900/30" : "border-emerald-200 bg-emerald-50")
                      }`}>
                        <span className={prefsError ? errorColor : successColor}>{prefsError ?? prefsSuccess}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleSavePreferences}
                      disabled={prefsLoading || !user}
                      className={`w-full py-3 rounded-lg font-bold text-sm transition-all ${
                        isArchitect
                          ? "bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-60"
                          : "bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-60"
                      }`}
                    >
                      {prefsLoading ? "Enregistrement..." : "Enregistrer"}
                    </button>
                  </div>
                </div>
                
                <div className={styles.card}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Bell className={`w-4 h-4 ${isArchitect ? "text-emerald-400" : "text-slate-400"}`} />
                      <span className="text-sm font-medium">Notifications Email</span>
                    </div>
                    <div className={`w-10 h-5 rounded-full p-1 cursor-pointer transition-colors ${isArchitect ? "bg-emerald-600" : "bg-blue-600"}`}>
                      <div className="w-3 h-3 bg-white rounded-full shadow-sm transform translate-x-5" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Mail className={`w-4 h-4 ${isArchitect ? "text-emerald-400" : "text-slate-400"}`} />
                      <span className="text-sm font-medium">Newsletter Hebdo</span>
                    </div>
                    <div className={`w-10 h-5 rounded-full p-1 cursor-pointer transition-colors ${isArchitect ? "bg-emerald-900 border border-emerald-700" : "bg-slate-200"}`}>
                      <div className="w-3 h-3 bg-white rounded-full shadow-sm" />
                    </div>
                  </div>
                </div>

                <button 
                  onClick={handleSignOut}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                  isArchitect 
                    ? "border-red-900/50 text-red-400 hover:bg-red-950/30" 
                    : "border-red-100 text-red-600 hover:bg-red-50"
                }`}>
                  <span className="font-bold text-sm flex items-center gap-2">
                    <LogOut className="w-4 h-4" /> Déconnexion
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

          </div>
          
          {/* FOOTER */}
          <div className={`p-4 text-center text-[10px] border-t ${
            isArchitect ? "border-emerald-900 text-emerald-700" : "border-slate-100 text-slate-400"
          }`}>
            Sophia v2.4.0 • Powered by IKIZEN
          </div>

        </div>
      </div>
    </div>
  );
};

export default UserProfile;
