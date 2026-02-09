import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { newRequestId, requestHeaders } from '../lib/requestId';
import { getPrelaunchLockdownRawValue, isPrelaunchLockdownEnabled } from '../security/prelaunch';
import { DEFAULT_LOCALE, DEFAULT_TIMEZONE, detectBrowserTimezone, getAllSupportedTimezones } from '../lib/localization';
import { 
  Mail, 
  Lock, 
  ArrowRight, 
  Sparkles, 
  ShieldCheck, 
  User,
  Phone,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2
} from 'lucide-react';
import { getThemeLabelById } from '../data/onboarding/registry';
import { clearGuestPlanFlowState, loadGuestPlanFlowState, saveGuestPlanFlowState } from '../lib/guestPlanFlowCache';

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}

function normalizePhone(input: string): string {
  let s = (input ?? "").trim();
  if (!s) return "";
  // keep digits and '+' only
  s = s.replace(/[^\d+]/g, "");
  if (!s) return "";

  // 00... => +...
  if (s.startsWith("00")) s = `+${s.slice(2)}`;

  // If already E.164-ish, keep it
  if (s.startsWith("+")) return s;

  // Digits-only: try to normalize common French formats into E.164 (+33XXXXXXXXX)
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";

  // 06XXXXXXXX (10 digits) -> +33 6XXXXXXXX
  if (digits.length === 10 && digits.startsWith("0")) return `+33${digits.slice(1)}`;
  // 33XXXXXXXXX (11 digits) -> +33XXXXXXXXX
  if (digits.length === 11 && digits.startsWith("33")) return `+${digits}`;
  // 9 digits (no leading 0) -> assume FR and prefix +33
  if (digits.length === 9) return `+33${digits}`;

  // Fallback: prefix '+' (better chance to match WhatsApp normalizeFrom)
  return `+${digits}`;
}

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = new URLSearchParams(location.search).get('redirect');
  const forbidden = new URLSearchParams(location.search).get('forbidden') === '1';
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const view = new URLSearchParams(location.search).get('view') || '';
  const prelaunchLockdown = isPrelaunchLockdownEnabled();
  const prelaunchRaw = debug ? getPrelaunchLockdownRawValue() : "";
  
  // Récupérer les données du plan si on vient du flux onboarding
  const planData = location.state || loadGuestPlanFlowState() || null;
  const isRegistrationFlow = !!planData?.finalOrder; // Si on a des priorités, c'est une inscription

  const [isSignUp, setIsSignUp] = useState(prelaunchLockdown ? false : isRegistrationFlow); // Par défaut Inscription si flux, sinon Connexion
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [hasAcceptedLegal, setHasAcceptedLegal] = useState(false); // New state for legal acceptance
  const [confirmationPending, setConfirmationPending] = useState(false); // Nouvel état
  const [isResettingPassword, setIsResettingPassword] = useState(false); // Pour la demande de reset MDP
  const [timezone, setTimezone] = useState<string>(DEFAULT_TIMEZONE);
  const [tzFollowDevice, setTzFollowDevice] = useState<boolean>(false);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'checking' | 'verified'>('idle');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showVerifiedLanding, setShowVerifiedLanding] = useState(
    new URLSearchParams(location.search).get('email_verified') === '1'
  );

  // Keep guest flow state in sessionStorage so "back" / refresh doesn't wipe the plan data.
  useEffect(() => {
    if (planData && isRegistrationFlow) {
      saveGuestPlanFlowState(planData);
    }
  }, [isRegistrationFlow, planData]);
  const [prefsOpen, setPrefsOpen] = useState<boolean>(false);

  const supportedTimezones = React.useMemo(() => {
    const detected = detectBrowserTimezone();
    const all = getAllSupportedTimezones(detected);
    const current = (timezone || "").trim();
    return current && !all.includes(current) ? [current, ...all] : all;
  }, [timezone]);

  useEffect(() => {
    // Backward-compat: old password reset links used /auth?view=update_password.
    // Redirect to the dedicated page while preserving query+hash tokens.
    if ((view || "").trim() === "update_password") {
      const target = `${window.location.origin}/reset-password${window.location.search || ""}${window.location.hash || ""}`;
      window.location.replace(target);
    }
  }, [view]);

  useEffect(() => {
    // En pré-lancement, on force le mode connexion (inscription interdite)
    if (prelaunchLockdown && isSignUp) setIsSignUp(false);
  }, [prelaunchLockdown, isSignUp]);

  useEffect(() => {
    const msg = "Accès restreint (pré-lancement). Seul le compte master_admin peut se connecter.";
    if (!forbidden) {
      // Clear stale "prelaunch forbidden" message if user navigated away from forbidden state.
      if (error === msg) setError(null);
      return;
    }
    // Only show this message when prelaunch lockdown is actually enabled; otherwise it's misleading
    // (ex: user toggled env var off but still has /auth?forbidden=1 in the URL).
    if (prelaunchLockdown) {
      setError(msg);
    } else {
      if (error === msg) setError(null);
    }
  }, [forbidden, prelaunchLockdown, error]);

  useEffect(() => {
    // Prefill timezone from browser when opening signup (non-destructive if user already typed something else).
    // Language is locked to French for now (DEFAULT_LOCALE).
    if (!isSignUp || prelaunchLockdown) return;
    const detected = detectBrowserTimezone();
    if (detected) setTimezone(detected);
  }, [isSignUp, prelaunchLockdown]);

  // ---------------------------------------------------------------------------
  // PKCE CODE EXCHANGE
  // Quand l'user clique le lien de vérification email, Supabase confirme l'email
  // côté serveur puis redirige vers /auth?code=xxx. On détecte le code ici et on
  // affiche la page "Email vérifié" (= nouvel onglet ouvert par le lien email).
  // L'onglet ORIGINAL (celui avec le cache) détecte la vérification via le polling.
  // ---------------------------------------------------------------------------
  const codeParam = new URLSearchParams(location.search).get('code');
  useEffect(() => {
    if (!codeParam) return;
    // Ne pas interférer avec le flow de reset password
    if ((view || '').trim() === 'update_password') return;
    // Si on est déjà sur l'écran de confirmation (= onglet original), ne pas échanger
    if (confirmationPending) return;

    let cancelled = false;
    (async () => {
      try {
        console.log('[Auth] PKCE code detected, exchanging for session...');
        const { error: codeError } = await supabase.auth.exchangeCodeForSession(codeParam);

        // Nettoyer l'URL pour éviter les replays
        const clean = new URL(window.location.href);
        clean.searchParams.delete('code');
        clean.searchParams.delete('email_verified');
        window.history.replaceState({}, '', clean.toString());

        if (cancelled) return;
        if (codeError) {
          console.warn('[Auth] Code exchange error (email was still confirmed server-side):', codeError);
        }

        // Afficher "Email vérifié !" sur ce nouvel onglet
        setShowVerifiedLanding(true);
      } catch (err) {
        console.warn('[Auth] Code exchange failed:', err);
        if (!cancelled) setShowVerifiedLanding(true); // L'email est quand même confirmé côté serveur
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ---------------------------------------------------------------------------
  // POST-SIGNUP FLOW (shared between polling, manual check, and handleAuth)
  // ---------------------------------------------------------------------------
  const runPostSignupFlow = async (userId: string) => {
    console.log('[Auth] ✅ Running post-signup flow for user', userId);

    // WhatsApp opt-in (best-effort, non-blocking)
    try {
      const waReqId = newRequestId();
      await supabase.functions.invoke('whatsapp-optin', {
        body: {},
        headers: requestHeaders(waReqId),
      });
    } catch (e) {
      console.warn('WhatsApp opt-in send failed (non-blocking):', e);
    }

    // Backfill des réponses guest → nouveau compte
    if (isRegistrationFlow && planData?.fullAnswers) {
      try {
        console.log('💾 Sauvegarde des réponses Invité pour le nouveau compte...');
        const answersPayload = planData.fullAnswers;
        const submissionId = planData.submissionId || crypto.randomUUID();
        const contentToSave = answersPayload.ui_state
          ? answersPayload
          : {
              structured_data: answersPayload,
              ui_state: {},
              last_updated: new Date().toISOString(),
            };
        const { error: answersError } = await supabase.from('user_answers').insert({
          user_id: userId,
          questionnaire_type: 'onboarding',
          submission_id: submissionId,
          content: contentToSave,
          status: 'completed',
          sorting_attempts: 1,
        });
        if (answersError) {
          console.error('Erreur sauvegarde réponses post-inscription:', answersError);
        } else {
          console.log('✅ Réponses sauvegardées avec succès pour', userId);
        }
      } catch (err) {
        console.error('Erreur backfill:', err);
      }
    }

    clearGuestPlanFlowState();

    if (isRegistrationFlow) {
      navigate('/plan-generator', { state: planData });
    } else if (redirectTo) {
      navigate(redirectTo);
    } else {
      navigate('/global-plan');
    }
  };

  // ---------------------------------------------------------------------------
  // MANUAL VERIFICATION CHECK (bouton "J'ai vérifié")
  // ---------------------------------------------------------------------------
  const handleManualVerificationCheck = async () => {
    if (!email || !password) return;
    setVerificationStatus('checking');
    setError(null);
    try {
      console.log('[Auth] Manual verification check...');
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInData?.session && signInData?.user && !signInError) {
        setVerificationStatus('verified');
        await new Promise((r) => setTimeout(r, 1200));
        await runPostSignupFlow(signInData.user.id);
      } else {
        setVerificationStatus('idle');
        setError("Email pas encore vérifié. Clique sur le lien dans ton email puis reviens ici.");
      }
    } catch (err) {
      console.error('[Auth] Manual check error:', err);
      setVerificationStatus('idle');
      setError(getErrorMessage(err, "Erreur lors de la vérification."));
    }
  };

  // ---------------------------------------------------------------------------
  // EMAIL VERIFICATION POLLING
  // Quand l'utilisateur est sur l'écran "Vérifiez votre email", on tente un
  // signInWithPassword toutes les ~5 s. Dès que l'email est confirmé, le sign-in
  // réussit et on enchaîne le flow post-inscription (backfill, navigate) sans
  // jamais quitter l'onglet → le sessionStorage/cache est intact.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!confirmationPending || !email || !password) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const attemptSignIn = async () => {
      if (cancelled) return;
      setVerificationStatus('checking');
      try {
        console.log('[Auth] Polling: attempting signInWithPassword...');
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (cancelled) return;

        if (signInData?.session && signInData?.user && !signInError) {
          // ✅ Email confirmé !
          console.log('[Auth] ✅ Polling detected email verification!');
          setVerificationStatus('verified');

          // Petite pause pour montrer l'état "vérifié" avant de naviguer
          await new Promise((r) => setTimeout(r, 1500));
          if (cancelled) return;

          await runPostSignupFlow(signInData.user.id);
          return;
        }

        // Pas encore vérifié → on replanifie
        console.log('[Auth] Email not yet verified, retrying in 5s...', signInError?.message);
        setVerificationStatus('idle');
        if (!cancelled) pollTimer = setTimeout(attemptSignIn, 5000);
      } catch (err) {
        // Erreur réseau ou rate-limit → back-off
        console.warn('[Auth] Polling error, backing off to 10s:', err);
        if (!cancelled) {
          setVerificationStatus('idle');
          pollTimer = setTimeout(attemptSignIn, 10000);
        }
      }
    };

    // Premier essai après 3 s (laisse le temps à l'user de voir l'écran)
    pollTimer = setTimeout(attemptSignIn, 3000);

    // Quand l'user revient sur cet onglet (mobile), on vérifie immédiatement
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        if (pollTimer) clearTimeout(pollTimer);
        attemptSignIn();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [confirmationPending, email, password]);

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleResendConfirmation = async () => {
    if (resendCooldown > 0) return;
    try {
      const { error: resendErr } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });
      if (resendErr) throw resendErr;
      setResendCooldown(60);
    } catch (err) {
      console.error('Resend error:', err);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Note: Le mock doit supporter resetPasswordForEmail si on veut tester la simulation
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      });

      if (error) throw error;

      const supabaseUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL as string | undefined;
      const isLocalSupabase =
        !!supabaseUrl &&
        (supabaseUrl.includes('127.0.0.1:54321') || supabaseUrl.includes('localhost:54321'));
      const localHint = isLocalSupabase ? " (en local: ouvre http://127.0.0.1:54324 pour voir l’email)" : "";
      alert(`Si un compte existe pour ${email}, un email de réinitialisation va être envoyé${localHint}.`);
      setIsResettingPassword(false);
    } catch (err: unknown) {
      console.error("Reset error:", err);
      const msg = getErrorMessage(err, "Erreur lors de l'envoi.");
      // Supabase Auth returns a generic error when the mailer (SMTP) is misconfigured or unavailable.
      // Make it actionable for ops.
      if (typeof msg === "string" && msg.toLowerCase().includes("recovery email")) {
        setError(
          "Impossible d’envoyer l’email de réinitialisation.\n\n" +
          "À vérifier dans Supabase Dashboard → Auth → SMTP:\n" +
          "- custom SMTP activé mais incomplet / mauvais identifiants\n" +
          "- sender/domain non vérifié\n\n" +
          "Et dans Auth → URL Configuration:\n" +
          `- Redirect URL allowlist: ${window.location.origin}/reset-password\n\n` +
          `Détail: ${msg}`,
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
        if (isSignUp) {
        if (prelaunchLockdown) {
          throw new Error("Inscription désactivée (pré-lancement). Connectez-vous avec le compte master_admin.");
        }
        // --- INSCRIPTION ---
        
        // Validation CGV/CGU
        if (!hasAcceptedLegal) {
          throw new Error("Veuillez accepter les CGU et la Politique de Confidentialité pour continuer.");
        }

        // Basic phone validation (optional but recommended)
        if (!phone) {
             throw new Error("Le numéro de téléphone est requis pour Sophia.");
        }

        const phoneNorm = normalizePhone(phone);
        if (!phoneNorm) {
          throw new Error("Le numéro de téléphone est requis pour Sophia.");
        }

        // Validation plus stricte du format
        if (phoneNorm.startsWith('+33')) {
          // France : on attend exactement 12 caractères (+33 + 9 chiffres)
          // Ex: +33 6 12 34 56 78
          if (phoneNorm.length !== 12) {
            throw new Error("Numéro de téléphone incorrect (10 chiffres attendus pour la France).");
          }
        } else if (phoneNorm.startsWith('+0')) {
             // Cas où normalizePhone n'a pas reconnu le pays et a juste ajouté + devant un 0
             throw new Error("Format international requis (ex: +33...) ou numéro incomplet.");
        } else if (phoneNorm.length < 8) {
             throw new Error("Numéro de téléphone trop court.");
        }

        // If the phone is already validated by another account, block signup with a friendly message.
        // Note: Uses an RPC to avoid exposing broad profiles read access to anon users.
        try {
          const { data: inUse, error: inUseErr } = await supabase.rpc('is_verified_phone_in_use', {
            p_phone: phoneNorm,
          });
          if (inUseErr) throw inUseErr;
          if (inUse) {
            throw new Error(
              "Ce numéro de téléphone est déjà utilisé. Contactez sophia@sophia-coach.ai pour plus d'information."
            );
          }
        } catch (precheckErr) {
          // Best-effort: if the precheck fails, don't block signup (DB constraint will still protect verified numbers).
          console.warn("Phone in-use precheck failed (non-blocking):", precheckErr);
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { 
                full_name: name,
                phone: phoneNorm, // Stocker le téléphone (normalisé) dans les métadonnées
                // Localization (stored on profiles via DB trigger)
                locale: DEFAULT_LOCALE,
                timezone: (timezone || "").trim() || DEFAULT_TIMEZONE,
                tz_follow_device: tzFollowDevice
            },
            // Redirect vers /auth dans le NOUVEL onglet (après clic sur le lien email).
            // Supabase ajoute ?code=xxx → le composant Auth le détecte et affiche "Email vérifié".
            // L'onglet ORIGINAL reste sur /auth avec le cache intact et poll pour détecter la vérification.
            emailRedirectTo: `${window.location.origin}/auth`
          }
        });

        if (error) throw error;

        // GESTION DE LA CONFIRMATION EMAIL
        // Si l'inscription est un succès mais qu'il n'y a pas de session active (user créé mais non vérifié)
        // OU si on veut forcer l'affichage pour l'UX si la config est active.
        // Note : Avec le mock actuel, data.session est toujours présent.
        // En prod, si "Confirm Email" est ON, data.session sera null.
        if (data.user && !data.session) {
          setConfirmationPending(true);
          setLoading(false);
          return;
        }
        
        if (data.user) {
            // Inscription réussie sans confirmation email → lancer le post-signup flow directement
            await runPostSignupFlow(data.user.id);
        }

      } else {
        // --- CONNEXION ---
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        if (data.user) {
            // IMPORTANT:
            // Do NOT auto-send WhatsApp opt-in on login.
            // Login can happen for many reasons (password change, session refresh, etc.) and we don't want to spam templates.
            // Opt-in should be sent on signup (when we just collected the phone) or explicitly (e.g. in profile when user changes phone).

            // Si l'user a des données de registration (ex: a vérifié son email puis est revenu sur le form
            // et se connecte), on reprend le flow d'inscription avec les données du cache.
            if (isRegistrationFlow) {
              await runPostSignupFlow(data.user.id);
            } else {
              navigate(redirectTo || '/dashboard');
            }
        }
      }
    } catch (err: unknown) {
      console.error("Auth error:", err);
      setError(getErrorMessage(err, "Une erreur est survenue."));
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // LANDING PAGE : Nouvel onglet après clic sur le lien de vérification email.
  // L'email est déjà confirmé côté Supabase ; on affiche juste un message
  // demandant de retourner sur l'onglet d'origine (celui qui poll).
  // ---------------------------------------------------------------------------
  if (showVerifiedLanding) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-slate-900">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center animate-fade-in-up">
          <div className="mx-auto w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg mb-6">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            Email vérifié !
          </h2>
          <p className="text-slate-600 mb-8 max-w-sm mx-auto">
            Votre adresse email a bien été confirmée.<br />
            <strong>Retournez sur l'onglet précédent</strong> — tout se met à jour automatiquement.
          </p>
          <p className="text-xs text-slate-400">
            Vous pouvez fermer cet onglet.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // VUE "VÉRIFIEZ VOS EMAILS" (onglet d'origine, avec polling automatique)
  // ---------------------------------------------------------------------------
  if (confirmationPending) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-slate-900">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center animate-fade-in-up">
          {verificationStatus === 'verified' ? (
            <>
              <div className="mx-auto w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg mb-6">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-3xl font-bold text-emerald-600 mb-4">
                Email vérifié !
              </h2>
              <p className="text-slate-600 mb-4">
                Préparation de votre espace…
              </p>
              <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
            </>
          ) : (
            <>
              <div className="relative mx-auto w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg mb-6">
                <Mail className="w-8 h-8" />
                {verificationStatus === 'checking' && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-500" />
                  </span>
                )}
              </div>
              <h2 className="text-3xl font-bold text-slate-900 mb-4">
                Vérifiez votre boîte mail.
              </h2>
              <p className="text-slate-600 mb-6 max-w-sm mx-auto">
                Un lien de confirmation a été envoyé à <strong>{email}</strong>.<br />
                Cliquez dessus puis revenez ici — la page se met à jour toute seule.
              </p>

              <div className="flex items-center justify-center gap-2 text-sm text-slate-500 mb-8">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>En attente de vérification…</span>
              </div>

              <div className="space-y-4">
                {/* Bouton principal: vérification manuelle */}
                <button
                  onClick={handleManualVerificationCheck}
                  disabled={verificationStatus === 'checking'}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-slate-900 hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed items-center gap-2"
                >
                  {verificationStatus === 'checking' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Vérification…</>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" /> J'ai cliqué sur le lien
                    </>
                  )}
                </button>

                {error && (
                  <div className="rounded-lg bg-red-50 p-3 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-700 font-medium">{error}</p>
                  </div>
                )}

                {/* Liens secondaires */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={handleResendConfirmation}
                    disabled={resendCooldown > 0}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-500 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {resendCooldown > 0
                      ? `Renvoyer l'email (${resendCooldown}s)`
                      : "Renvoyer l'email de confirmation"}
                  </button>
                  <button
                    onClick={() => {
                      setConfirmationPending(false);
                      setVerificationStatus('idle');
                      setError(null);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600 underline decoration-dotted transition-colors"
                  >
                    Modifier mon adresse email
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-slate-900">
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* LOGO */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <img
            src="/apple-touch-icon.png"
            alt="Sophia Logo"
            className="w-16 h-16"
          />
          <div className="flex flex-col items-center">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Sophia</h1>
            <span className="text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase mt-1">
              Powered by IKIZEN
            </span>
          </div>
        </div>

        {isRegistrationFlow ? (
          <div className="animate-fade-in-up">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              Dernière étape avant ton plan {String(getThemeLabelById(planData.finalOrder[0].theme)).toLocaleLowerCase('fr-FR')}.
            </h2>
            <p className="text-slate-600 max-w-sm mx-auto">
              Créez votre espace sécurisé pour finaliser votre stratégie.
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              {isResettingPassword 
                ? "Réinitialisation" 
                : isSignUp 
                  ? "Bienvenue sur Sophia." 
                  : "Ravi de vous revoir."}
            </h2>
            <p className="text-slate-600">
              {isResettingPassword 
                ? "Nous allons vous envoyer un lien magique."
                : isSignUp 
                  ? "Créez votre compte pour commencer." 
                  : "Connectez-vous pour reprendre votre transformation."}
            </p>
            {prelaunchLockdown && !isResettingPassword && (
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
                Accès restreint (pré-lancement) · master_admin uniquement
              </div>
            )}
            {debug && (
              <div className="mt-3 text-xs text-slate-500 font-mono">
                VITE_PRELAUNCH_LOCKDOWN="{prelaunchRaw}" → prelaunchLockdown={String(prelaunchLockdown)}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md animate-fade-in-up delay-100">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200 rounded-2xl sm:px-10 border border-slate-100">
          
          {isResettingPassword ? (
            /* --- FORMULAIRE MOT DE PASSE OUBLIÉ --- */
            <form className="space-y-6" onSubmit={handleResetPassword}>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  Adresse Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="appearance-none block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                    placeholder="vous@exemple.com"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
                  <p className="text-sm text-red-700 font-medium">{error}</p>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-slate-900 hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> Envoi...
                    </>
                  ) : (
                    "Envoyer le lien"
                  )}
                </button>
              </div>

              <div className="text-center">
                <button 
                  type="button"
                  onClick={() => setIsResettingPassword(false)}
                  className="text-sm font-medium text-slate-500 hover:text-indigo-600"
                >
                  Retour à la connexion
                </button>
              </div>
            </form>
          ) : (
            /* --- FORMULAIRE AUTHENTIFICATION (LOGIN / SIGNUP) --- */
            <form className="space-y-6" onSubmit={handleAuth}>
            
            {/* Champ NOM (Seulement si Inscription) */}
            {isSignUp && !prelaunchLockdown && (
              <>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    Prénom
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      required={isSignUp}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="appearance-none block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                      placeholder="Votre prénom"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    Adresse Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="appearance-none block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                      placeholder="vous@exemple.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    Numéro WhatsApp
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Phone className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="tel"
                      required={isSignUp}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="appearance-none block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                      placeholder="+33 6 12 34 56 78"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Pour que Sophia puisse vous contacter.</p>
                </div>
              </>
            )}

            {/* Pour le Login, on affiche juste l'email (sans les champs d'inscription) */}
            {(!isSignUp || prelaunchLockdown) && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">
                Adresse Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                  placeholder="vous@exemple.com"
                />
              </div>
            </div>
            )}

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">
                Mot de passe
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full pl-10 pr-10 py-3 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                  placeholder="••••••••"
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Case à cocher CGV / CGU (déplacée après le mot de passe) */}
            {isSignUp && !prelaunchLockdown && (
                <div className="flex items-start gap-3">
                  <div className="flex h-6 items-center">
                    <input
                      id="legal-checkbox"
                      name="legal"
                      type="checkbox"
                      checked={hasAcceptedLegal}
                      onChange={(e) => setHasAcceptedLegal(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                    />
                  </div>
                  <div className="text-sm leading-6">
                    <label htmlFor="legal-checkbox" className="font-medium text-slate-700 cursor-pointer select-none">
                      J'accepte les <a href="/legal" target="_blank" className="text-indigo-600 hover:text-indigo-500 hover:underline">Conditions Générales</a> et la <a href="/legal#confidentialite" target="_blank" className="text-indigo-600 hover:text-indigo-500 hover:underline">Politique de Confidentialité</a>.
                    </label>
                  </div>
                </div>
            )}

            {/* Préférences (inscription uniquement) */}
            {isSignUp && !prelaunchLockdown && (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPrefsOpen((v) => !v)}
                  className="w-full px-4 py-3 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors"
                  aria-expanded={prefsOpen}
                >
                  <div className="text-left">
                    <div className="text-sm font-bold text-slate-900">Préférences</div>
                    <div className="text-xs text-slate-500">
                      Français · {tzFollowDevice ? `${detectBrowserTimezone() || timezone || DEFAULT_TIMEZONE} (appareil)` : `${timezone || DEFAULT_TIMEZONE} (profil)`}
                    </div>
                  </div>
                  <div className="text-slate-400 text-sm font-bold">{prefsOpen ? "—" : "+"}</div>
                </button>

                {prefsOpen && (
                  <div className="p-4 bg-white border-t border-slate-200 space-y-3">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">
                        Langue
                      </label>
                      <input
                        type="text"
                        value="Français"
                        readOnly
                        className="appearance-none block w-full px-3 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 sm:text-sm"
                      />
                      <p className="mt-1 text-xs text-slate-500">Langue verrouillée pour le moment.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">
                        Fuseau horaire (IANA)
                      </label>
                      <select
                        value={(timezone || "").trim()}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="appearance-none block w-full px-3 py-3 border border-slate-200 rounded-xl bg-white text-slate-900 sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      >
                        {supportedTimezones.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                      <div>
                        <div className="text-sm font-bold text-slate-700">Itinérance</div>
                        <div className="text-xs text-slate-500">Suivre automatiquement le fuseau horaire de l’appareil.</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTzFollowDevice((v) => !v)}
                        className={`w-11 h-6 rounded-full p-1 transition-colors ${tzFollowDevice ? "bg-indigo-600" : "bg-slate-200"}`}
                        aria-pressed={tzFollowDevice}
                        aria-label="Activer l'itinérance"
                      >
                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${tzFollowDevice ? "translate-x-5" : "translate-x-0"}`} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!isSignUp && (
              <div className="flex items-center justify-end">
                <div className="text-sm">
                  <button 
                    type="button"
                    onClick={() => setIsResettingPassword(true)}
                    className="font-medium text-indigo-600 hover:text-indigo-500"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading || (isSignUp && !prelaunchLockdown && !hasAcceptedLegal)}
                className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-slate-900 hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Traitement...
                  </>
                ) : isSignUp ? (
                  <>
                    Découvrir mon Plan <ArrowRight className="w-5 h-5" />
                  </>
                ) : (
                  "Se connecter"
                )}
              </button>
            </div>
            </form>
          )}

          {/* SWITCHER LOGIN/SIGNUP (Masqué si Reset Password / Pré-lancement) */}
          {!isResettingPassword && !prelaunchLockdown && (
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-slate-500">
                    {isSignUp ? "Déjà un compte ?" : "Pas encore de compte ?"}
                  </span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3">
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="w-full inline-flex justify-center py-3 px-4 border border-slate-200 rounded-xl shadow-sm bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  {isSignUp ? "Me connecter" : "Créer un compte gratuitement"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Trust Signals */}
        {isSignUp && !isResettingPassword && !prelaunchLockdown && (
            <div className="mt-8 flex justify-center gap-6 text-xs text-slate-400 font-medium uppercase tracking-wider">
                <span className="flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> Données Privées</span>
                <span className="flex items-center gap-1"><Sparkles className="w-4 h-4" /> IA Sécurisée</span>
            </div>
        )}
      </div>
    </div>
  );
};

export default Auth;
