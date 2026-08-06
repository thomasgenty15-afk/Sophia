import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { resolveHomePath } from '../keel/api/postLogin';
import { consumePendingCoachInvitation } from '../keel/api/coachInvite';
import { t as keelT } from '../keel/i18n/t';
import { newRequestId, requestHeaders } from '../lib/requestId';
import { getPrelaunchLockdownRawValue, isPrelaunchLockdownEnabled } from '../security/prelaunch';
import { DEFAULT_TIMEZONE, detectBrowserTimezone, getAllSupportedTimezones } from '../lib/localization';
import {
  Mail,
  Lock,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  User,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2
} from 'lucide-react';

// Email-verification polling cadence. Each unconfirmed attempt is a 400 against
// the auth token endpoint, so we start slow, grow, and eventually stop rather
// than poll forever.
const POLL_INITIAL_MS = 5000;
const POLL_MAX_MS = 30000;
const POLL_GIVE_UP_MS = 10 * 60 * 1000;

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}

// ---------------------------------------------------------------------------
// CE QUE CETTE PAGE FAIT ENCORE, ET CE QU'ELLE NE FAIT PLUS (2026-08-05)
//
// ELLE FAIT: la CONNEXION de tout le monde (élève, coach, admin), la
// réinitialisation de mot de passe, la confirmation d'email, et l'INSCRIPTION
// COACH sous `?role=coach` (W6.1).
//
// ELLE NE FAIT PLUS: l'inscription générique. Elle exigeait un numéro de
// téléphone, normalisé en `+33`, avec un contrôle de longueur français
// (« 10 digits expected for France ») — sur un produit anglais qui vise les
// États-Unis. C'était le chemin d'un ÉLÈVE qui atterrit ici au lieu de /join
// (son client mail casse le lien, il revient par la porte d'entrée), et il se
// heurtait donc à un mur invisible dans les tests, parce que tout le monde passe
// par /join.
//
// L'inscription élève est /start (`keel/pages/StartPage.tsx`). Elle n'y a pas
// été déplacée seulement pour retirer un champ: elle doit demander le PAYS, que
// le numéro déduisait avant le pivot et dont dépend la HOTLINE servie en cas de
// crise. Garder ici une inscription élève sans pays aurait rouvert, par cette
// porte, le défaut « élève britannique, hotline française » que la migration
// 20260804180000 vient de fermer sur l'autre.
//
// Le mode coach reste gaté sur `?role=coach` et n'a pas bougé d'une ligne: ce
// fichier est la porte de connexion unique du produit, et une régression ici est
// une panne totale.
// ---------------------------------------------------------------------------

/**
 * Countries offered to a coach at signup. NOT a validation list — the database
 * CHECK (`profiles_country_iso3166_check`) validates the SHAPE only, on
 * purpose: a closed list would reject a legitimate country the day someone
 * signs up from it. This is a convenience ordering of the ones we expect first,
 * and `country` is asked rather than derived because country is not a language
 * (migration 20260727190000, at length): the crisis-resource resolver reads it
 * FIRST, and a wrong guess there hands an American student a French hotline.
 */
const COACH_COUNTRIES: { code: string; label: string }[] = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "FR", label: "France" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "IE", label: "Ireland" },
  { code: "NZ", label: "New Zealand" },
  { code: "BE", label: "Belgium" },
  { code: "CH", label: "Switzerland" },
  { code: "DE", label: "Germany" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "NL", label: "Netherlands" },
  { code: "PT", label: "Portugal" },
  { code: "SE", label: "Sweden" },
  { code: "SG", label: "Singapore" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "ZA", label: "South Africa" },
];

/** R3: the coach workspace is English. This is `ui_locale`, not content locale. */
const COACH_LOCALE = "en-US";

// `normalizePhone` A ÉTÉ RETIRÉE AVEC LE CHAMP TÉLÉPHONE (2026-08-05).
// Elle présupposait `+33` — 10 chiffres commençant par 0, 9 chiffres sans
// indicatif, repli en préfixant `+` — donc elle ne pouvait servir qu'un
// utilisateur français. Aucun appelant ne subsiste sur cette page. La garde
// équivalente côté base (`is_verified_phone_in_use`, et le contrôle sur
// `phone_verified_at` dans `handle_new_user()`) reste en place pour les
// imports: ce qui disparaît est la SAISIE, pas la protection.

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = new URLSearchParams(location.search).get('redirect');
  const forbidden = new URLSearchParams(location.search).get('forbidden') === '1';
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const view = new URLSearchParams(location.search).get('view') || '';
  const prelaunchLockdown = isPrelaunchLockdownEnabled();
  const prelaunchRaw = debug ? getPrelaunchLockdownRawValue() : "";

  // KEEL W6.1 — coach mode. Everything downstream branches on this flag only.
  const coachSignup = (new URLSearchParams(location.search).get('role') || '') === 'coach';

  // `onboardingRedirect` a disparu avec `/onboarding-v2`: plus aucune route ne
  // peut viser cette cible, donc la branche « on arrive de l'entonnoir, ouvre
  // en mode inscription » n'avait plus de déclencheur. Reste le seul cas vivant.
  const [isSignUp, setIsSignUp] = useState(
    prelaunchLockdown ? false : coachSignup,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  // KEEL W6.1 — asked only in coach mode; never derived from the locale.
  const [coachCountry, setCoachCountry] = useState('US');
  // Parrainage : prérempli depuis ?ref= (capturé au chargement de l'app),
  // modifiable/saisissable manuellement à l'inscription.
  const [hasAcceptedLegal, setHasAcceptedLegal] = useState(false); // New state for legal acceptance
  const [confirmationPending, setConfirmationPending] = useState(false); // Nouvel état
  const [isResettingPassword, setIsResettingPassword] = useState(false); // Pour la demande de reset MDP
  const [timezone, setTimezone] = useState<string>(DEFAULT_TIMEZONE);
  const [tzFollowDevice, setTzFollowDevice] = useState<boolean>(false);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'checking' | 'verified'>('idle');
  const [resendCooldown, setResendCooldown] = useState(0);
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

  // KEEL — an American coach must not read a French tab title. The legacy
  // index.html title stays for the consumer path; the coach door restates it.
  useEffect(() => {
    if (coachSignup) {
      document.title = "Sophia — coach sign in";
      // `lang` appartient a `keel/i18n/runtime.ts`: UN seul ecrivain.
      // Trois composants l'ecrivaient au montage, chacun a "en" — donc la
      // valeur dependait de l'ordre de rendu, ce qui n'est pas une decision.
    }
  }, [coachSignup]);

  // KEEL — the coach and consumer doors cross-link via client-side navigation,
  // so the form mode must follow the URL after mount, not only at mount:
  // arriving on ?role=coach opens the coach signup; leaving it returns to the
  // sign-in form.
  useEffect(() => {
    if (prelaunchLockdown) return;
    if (coachSignup) setIsSignUp(true);
    else setIsSignUp(false);
  }, [coachSignup, prelaunchLockdown]);

  useEffect(() => {
    const msg = "Access is restricted (pre-launch). Only the master_admin account can sign in.";
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
    // La seule inscription qui reste ici est celle du coach, dont la langue est
    // `COACH_LOCALE` (en-US) et non une valeur choisie dans le formulaire.
    if (!isSignUp || prelaunchLockdown) return;
    const detected = detectBrowserTimezone();
    if (detected) setTimezone(detected);
  }, [isSignUp, prelaunchLockdown]);

  // ---------------------------------------------------------------------------
  // EMAIL CONFIRM LANDING (redirige vers une page dédiée)
  // Quand l'user clique le lien de vérification email, Supabase confirme l'email
  // côté serveur puis redirige vers l'URL autorisée (emailRedirectTo) en ajoutant
  // `?code=xxx`. Si jamais on reçoit ce `code` sur /auth (ex: ancienne config),
  // on redirige vers /email-verified pour afficher un message simple.
  // ---------------------------------------------------------------------------
  const codeParam = new URLSearchParams(location.search).get('code');
  useEffect(() => {
    if (!codeParam) return;
    // Ne pas interférer avec le flow de reset password
    if ((view || '').trim() === 'update_password') return;
    // Si on est déjà sur l'écran de confirmation (= onglet original), ne pas échanger
    if (confirmationPending) return;
    navigate(`/email-verified${window.location.search || ''}`, { replace: true });
  }, [codeParam, view, confirmationPending, navigate]);

  // ---------------------------------------------------------------------------
  // ROUTING HOME AFTER A SUCCESSFUL SIGN-IN
  // ---------------------------------------------------------------------------
  // `resolveHomePath` answers `null` when it could read NEITHER role row — the
  // backend is unreachable. Navigating anyway means sending someone to a page
  // that cannot load either, which is how a student once ended up staring at
  // the legacy consumer account shell with every field blank.
  //
  // Here the stakes are specific: the credentials were ACCEPTED a moment ago.
  // If we said nothing, or reused a generic error, the user's only reading is
  // "my password is wrong" — and they would start resetting an account that is
  // perfectly fine. So the message names what happened, and we stay on /auth,
  // which is a screen with a button they can press again.
  const navigateHome = async (userId: string): Promise<void> => {
    const home = await resolveHomePath(userId);
    if (home === null) {
      setError(keelT("server_unreachable.after_signin"));
      return;
    }
    navigate(home);
  };

  // ---------------------------------------------------------------------------
  // POST-SIGNUP FLOW (shared between polling, manual check, and handleAuth)
  // ---------------------------------------------------------------------------
  const runPostSignupFlow = async (userId: string) => {
    console.log('[Auth] ✅ Running post-signup flow for user', userId);

    // KEEL W6.1 — the coach branch. It returns before the WhatsApp opt-in on
    // purpose: a coach has no phone number on file, so the opt-in call would be
    // a guaranteed failure swallowed by a catch — the kind of "harmless" noise
    // that hides a real one later.
    //
    // `coach-signup-v1` is the ONLY way a `coaches` row can appear: the table
    // has no INSERT policy, by contract (the coach is structurally read-only on
    // student data, and `credential_type`/`status` are not client-writable).
    // A failure here is therefore surfaced, not swallowed: the account exists
    // but is not a coach account yet, and the user must know that.
    if (coachSignup) {
      const reqId = newRequestId();
      const { error: coachErr } = await supabase.functions.invoke('coach-signup-v1', {
        body: { country: coachCountry, display_name: name || undefined, locale: COACH_LOCALE },
        headers: requestHeaders(reqId),
      });
      if (coachErr) {
        console.error('[Auth] coach-signup-v1 failed:', coachErr);
        setError(
          "Your account was created, but the coach profile could not be set up. " +
          "Sign in again to retry.",
        );
        return;
      }
      navigate(redirectTo || '/coach');
      return;
    }

    // DE-WHATSAPP: plus d'opt-in Meta à l'inscription. Créer son compte EST le
    // consentement à la conversation; les relances proactives se coupent depuis
    // les réglages (`profiles.proactive_muted_at`).

    // KEEL — same replay on the signup door. A student who created their
    // account from /auth rather than /join still carries the stored token.
    // JoinPage's own form already passes it through `handle_new_user`; the RPC
    // answers `already_accepted` in that case, which is spent, not an error.
    await consumePendingCoachInvitation();

    if (redirectTo) {
      navigate(redirectTo);
    } else {
      await navigateHome(userId);
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
        setError("Email not verified yet. Click the link in your email, then come back here.");
      }
    } catch (err) {
      console.error('[Auth] Manual check error:', err);
      setVerificationStatus('idle');
      setError(getErrorMessage(err, "Something went wrong while verifying."));
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
    // An unconfirmed email answers 400, which supabase-js returns as {error}
    // rather than throwing: without a back-off the poll hammered the token
    // endpoint every 5 s forever, risking an auth rate-limit that would then
    // block the legitimate sign-in once the email IS confirmed.
    let delayMs = POLL_INITIAL_MS;
    let windowStartedAt = Date.now();

    const attemptSignIn = async () => {
      if (cancelled) return;
      // Give up after a while: the user still has the resend button, and coming
      // back to the tab restarts a fresh polling window.
      if (Date.now() - windowStartedAt > POLL_GIVE_UP_MS) {
        setVerificationStatus('idle');
        return;
      }
      setVerificationStatus('checking');
      try {
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

        // Pas encore vérifié → on replanifie, de plus en plus espacé
        setVerificationStatus('idle');
        delayMs = Math.min(Math.round(delayMs * 1.5), POLL_MAX_MS);
        if (!cancelled) pollTimer = setTimeout(attemptSignIn, delayMs);
      } catch (err) {
        // Erreur réseau ou rate-limit → back-off maximal
        console.warn('[Auth] Polling error, backing off:', err);
        if (!cancelled) {
          setVerificationStatus('idle');
          delayMs = POLL_MAX_MS;
          pollTimer = setTimeout(attemptSignIn, delayMs);
        }
      }
    };

    // Premier essai après 3 s (laisse le temps à l'user de voir l'écran)
    pollTimer = setTimeout(attemptSignIn, 3000);

    // Quand l'user revient sur cet onglet (mobile), on vérifie immédiatement :
    // il vient probablement de cliquer le lien, donc on repart d'une fenêtre
    // et d'un délai neufs.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        if (pollTimer) clearTimeout(pollTimer);
        delayMs = POLL_INITIAL_MS;
        windowStartedAt = Date.now();
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
          emailRedirectTo: `${window.location.origin}/email-verified`,
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

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const isLocalSupabase =
        !!supabaseUrl &&
        (supabaseUrl.includes('127.0.0.1:54321') || supabaseUrl.includes('localhost:54321'));
      const localHint = isLocalSupabase ? " (local: open http://127.0.0.1:54324 to read the email)" : "";
      alert(`If an account exists for ${email}, a reset email is on its way${localHint}.`);
      setIsResettingPassword(false);
    } catch (err: unknown) {
      console.error("Reset error:", err);
      const msg = getErrorMessage(err, "Sending failed.");
      // Supabase Auth returns a generic error when the mailer (SMTP) is misconfigured or unavailable.
      // Make it actionable for ops.
      if (typeof msg === "string" && msg.toLowerCase().includes("recovery email")) {
        setError(
          "Could not send the password reset email.\n\n" +
          "Check in Supabase Dashboard → Auth → SMTP:\n" +
          "- custom SMTP enabled but incomplete / wrong credentials\n" +
          "- sender/domain not verified\n\n" +
          "And in Auth → URL Configuration:\n" +
          `- Redirect URL allowlist: ${window.location.origin}/reset-password\n\n` +
          `Detail: ${msg}`,
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
          throw new Error("Sign-up is disabled (pre-launch). Sign in with the master_admin account.");
        }
        // --- INSCRIPTION ---
        
        // Validation CGV/CGU
        if (!hasAcceptedLegal) {
          throw new Error("Please accept the Terms and the Privacy Policy to continue.");
        }

        // ── LA FIN DU TÉLÉPHONE (2026-08-05) ────────────────────────────
        //
        // Ici vivaient: un champ obligatoire, une normalisation `+33`, un
        // contrôle de longueur français (« 10 digits expected for France »), et
        // un pré-contrôle `is_verified_phone_in_use`. Tout cela sur le chemin
        // d'inscription GÉNÉRIQUE, c'est-à-dire celui d'un élève qui atterrit
        // sur /auth au lieu de /join — son client mail casse le lien, il revient
        // par la porte d'entrée — et qui se heurtait donc à un validateur de
        // numéro français.
        //
        // Le bloc n'est pas seulement supprimé: l'inscription générique elle
        // aussi disparaît de cette page (le switcher renvoie vers /start).
        // Supprimer la validation en gardant le chemin aurait laissé une
        // inscription élève qui n'écrit PAS `country` — c'est-à-dire un élève
        // dont la hotline de crise est déduite de sa langue, le défaut exact que
        // la migration 20260804180000 vient de fermer sur l'autre porte.
        //
        // Reste armée SANS ce code: la garde anti-collision de
        // `handle_new_user()` sur `phone_verified_at`, pour les imports et pour
        // tout appelant qui poserait un numéro demain (migration
        // 20260805091000). `normalizePhone` et `is_verified_phone_in_use`
        // survivent pour les mêmes raisons — ils n'ont plus d'appelant ici.
        if (!coachSignup) {
          throw new Error(
            "Student sign-up has moved. Open /start to create your account, or use the link your coach emailed you.",
          );
        }

        // KEEL W6.1 — the coach's country is a SELECTOR value, validated for
        // shape here and again by the DB CHECK. R7: a bad value fails at the
        // write, not three layers later inside the crisis resolver.
        if (coachSignup && !/^[A-Z]{2}$/.test(coachCountry)) {
          throw new Error("Please select the country where you practise.");
        }

        const detectedTimezone = detectBrowserTimezone();
        const signupTimezone = tzFollowDevice
          ? detectedTimezone || (timezone || "").trim() || DEFAULT_TIMEZONE
          : (timezone || "").trim() || DEFAULT_TIMEZONE;

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
                full_name: name,
                // `phone` N'EST PLUS ENVOYÉ, par aucun chemin de cette page.
                // `handle_new_user` fait
                // `nullif(coalesce(meta->>'phone', new.phone, ''), '')`, donc une
                // clé absente stocke NULL et la garde anti-collision du trigger
                // n'est jamais entrée. Envoyer "" prendrait la même branche;
                // omettre la clé énonce l'intention.
                locale: COACH_LOCALE,
                timezone: signupTimezone,
                tz_follow_device: tzFollowDevice,
            },
            // Redirect vers une page dédiée (nouvel onglet après clic sur le lien email).
            // L'onglet ORIGINAL reste sur /auth avec le cache intact et poll pour détecter la vérification.
            // Note: Supabase ajoute `?code=xxx` automatiquement.
            emailRedirectTo: `${window.location.origin}/email-verified`
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
            // KEEL W6.1: a coach signing in through ?role=coach goes through
            // the same post-signup flow. `coach-signup-v1` is idempotent, so
            // this both repairs a signup whose coach step failed and lands the
            // coach on /coach instead of the legacy French dashboard.
            // KEEL — an invitation opened BEFORE signing in is replayed here.
            // This is the path that was broken: a client the coach already had
            // clicked their link, met a signup form their address could not
            // pass, and stayed unlinked. The token is now stored on /join and
            // spent at the first successful authentication, whichever door.
            // Not on the coach door: that one must never consume a student's
            // invitation. Failures are swallowed by design — the invitation is
            // a bonus on this path, never a condition for reaching an account.
            const invitation = coachSignup
              ? ({ kind: "none" } as const)
              : await consumePendingCoachInvitation();
            if (coachSignup) {
              await runPostSignupFlow(data.user.id);
            } else if (invitation.kind === "accepted") {
              // A consumed invitation OVERRIDES `redirect`. That redirect is
              // usually /join, and going back there after joining shows the
              // "already used" refusal — an error screen at the exact moment of
              // success, and it re-stores the spent token. The destination of a
              // successful join is the student's own space.
              await navigateHome(data.user.id);
            } else if (redirectTo) {
              navigate(redirectTo);
            } else {
              // KEEL — route by the user's REAL role, read from the database:
              // active coaches row -> /coach, keel_role='student' -> /app/today,
              // read but neither -> /account. The resolver fails SAFE on a row
              // it cannot read, and fails LOUD when it could read nothing at
              // all; the route guards and RLS remain the actual boundary on
              // arrival.
              await navigateHome(data.user.id);
            }
        }
      }
    } catch (err: unknown) {
      console.error("Auth error:", err);
      setError(getErrorMessage(err, "Something went wrong."));
    } finally {
      setLoading(false);
    }
  };

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
                Email verified!
              </h2>
              <p className="text-slate-600 mb-4">
                Setting up your space…
              </p>
              <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
            </>
          ) : (
            <>
              <div className="relative mx-auto w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-slate-200 mb-8">
                <Mail className="w-10 h-10" />
                {verificationStatus === 'checking' && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-5 w-5 bg-indigo-500 border-2 border-white" />
                  </span>
                )}
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900 mb-4 tracking-tight">
                Check your inbox.
              </h2>
              <p className="text-lg text-slate-600 mb-8 max-w-md mx-auto leading-relaxed">
                A confirmation link has been sent to <strong className="text-slate-900 font-semibold">{email}</strong>.<br />
                Click it, then come back here — this page updates on its own.
                <br />
                <span className="text-sm text-slate-500 mt-2 block font-medium bg-slate-50 py-1 px-3 rounded-full inline-block mt-3 border border-slate-100">
                   💡 If you cannot see it, check your spam folder too.
                </span>
              </p>

              <div className="flex items-center justify-center gap-3 text-sm font-medium text-indigo-600 bg-indigo-50 py-2 px-4 rounded-full mx-auto w-fit mb-10 border border-indigo-100">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Waiting for verification…</span>
              </div>

              <div className="space-y-4 max-w-xs mx-auto">
                {/* Bouton principal: vérification manuelle */}
                <button
                  onClick={handleManualVerificationCheck}
                  disabled={verificationStatus === 'checking'}
                  className="w-full flex justify-center py-4 px-6 border border-transparent rounded-2xl shadow-lg shadow-indigo-200 text-base font-bold text-white bg-slate-900 hover:bg-indigo-600 hover:shadow-indigo-300 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed items-center gap-3 group"
                >
                  {verificationStatus === 'checking' ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Verifying…</>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" /> I have clicked the link
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
                      ? `Resend the email (${resendCooldown}s)`
                      : "Resend the confirmation email"}
                  </button>
                  <button
                    onClick={() => {
                      setConfirmationPending(false);
                      setVerificationStatus('idle');
                      setError(null);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600 underline decoration-dotted transition-colors"
                  >
                    Change my email address
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

        {coachSignup ? (
          /* KEEL W6.1 — the coach header. English, and it states the one thing
             a coach coming from France will not expect: no phone required. */
          <div className="animate-fade-in-up">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              {isSignUp ? "Create your coach account." : "Welcome back."}
            </h2>
            <p className="text-slate-600 max-w-sm mx-auto">
              {isSignUp
                ? "Your students get the app. You get the prescription tools. No phone number needed."
                : "Sign in to your coach workspace."}
            </p>
            {error && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-left">
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}
          </div>
        ) : (
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              {isResettingPassword 
                ? "Reset your password" 
                : isSignUp 
                  ? "Welcome to Sophia." 
                  : "Good to see you again."}
            </h2>
            <p className="text-slate-600">
              {isResettingPassword 
                ? "I will send you a magic link."
                : isSignUp 
                  ? "Create your account to get started." 
                  : "Sign in to pick up where you left off."}
            </p>
            {prelaunchLockdown && !isResettingPassword && (
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
                Restricted access (pre-launch) · master_admin only
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
                  Email address
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
                    placeholder="name@example.com"
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
                      <Loader2 className="w-5 h-5 animate-spin" /> Sending…
                    </>
                  ) : (
                    "Send the link"
                  )}
                </button>
              </div>

              <div className="text-center">
                <button 
                  type="button"
                  onClick={() => setIsResettingPassword(false)}
                  className="text-sm font-medium text-slate-500 hover:text-indigo-600"
                >
                  Back to sign-in
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
                    {coachSignup ? "Your name" : "First name"}
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
                      placeholder={coachSignup ? "How your students will see you" : "Your first name"}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    Email address
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
                      placeholder="name@example.com"
                    />
                  </div>
                </div>

                {/* ── LE CHAMP TÉLÉPHONE A ÉTÉ RETIRÉ (2026-08-05) ──────────
                    Il était OBLIGATOIRE sur ce chemin, normalisé en `+33`, et
                    refusait tout ce qui ne faisait pas exactement 12 caractères
                    avec le message « 10 digits expected for France » — sur un
                    produit anglais qui vise les États-Unis.
                    Le numéro était l'identité du compte quand Sophia parlait
                    sur WhatsApp. La conversation vit dans l'app depuis le
                    chantier de-whatsapp: plus aucun chemin élève ni coach
                    n'alimente `profiles.phone_number`, et le demander était un
                    MUR — invisible dans les tests parce que tout le monde passe
                    par /join.
                    Ce chemin d'inscription générique n'existe plus du tout ici:
                    l'inscription élève est /start, qui demande le PAYS (ce que
                    le numéro déduisait). Voir le switcher en bas de page. */}

                {/* KEEL W6.1 — country. Asked, never derived from the locale:
                    `profiles.country` is read FIRST by the crisis-resource
                    resolver, and a fr-FR coach practising in Montreal must not
                    be filed under France. */}
                {coachSignup && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    Country
                  </label>
                  <select
                    value={coachCountry}
                    onChange={(e) => setCoachCountry(e.target.value)}
                    className="appearance-none block w-full px-3 py-3 border border-slate-200 rounded-xl bg-white text-slate-900 sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  >
                    {COACH_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Where you practise. Used for crisis resources and local formats — never
                    guessed from your language.
                  </p>
                </div>
                )}

              </>
            )}

            {/* Pour le Login, on affiche juste l'email (sans les champs d'inscription) */}
            {(!isSignUp || prelaunchLockdown) && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">
                Email address
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
                  placeholder="name@example.com"
                />
              </div>
            </div>
            )}

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">
                Password
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
                  aria-label={showPassword ? "Hide password" : "Show password"}
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
                      {coachSignup ? (
                        <>I accept the <a href="/legal" target="_blank" className="text-indigo-600 hover:text-indigo-500 hover:underline">Terms</a> and the <a href="/legal#confidentialite" target="_blank" className="text-indigo-600 hover:text-indigo-500 hover:underline">Privacy Policy</a>.</>
                      ) : (
                        <>I accept the <a href="/legal" target="_blank" className="text-indigo-600 hover:text-indigo-500 hover:underline">Terms</a> and the <a href="/legal#confidentialite" target="_blank" className="text-indigo-600 hover:text-indigo-500 hover:underline">Privacy Policy</a>.</>
                      )}
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
                    <div className="text-sm font-bold text-slate-900">
                      Preferences
                    </div>
                    <div className="text-xs text-slate-500">
                      English · {tzFollowDevice ? `${detectBrowserTimezone() || timezone || DEFAULT_TIMEZONE} (device)` : `${timezone || DEFAULT_TIMEZONE} (profile)`}
                    </div>
                  </div>
                  <div className="text-slate-400 text-sm font-bold">{prefsOpen ? "—" : "+"}</div>
                </button>

                {prefsOpen && (
                  <div className="p-4 bg-white border-t border-slate-200 space-y-3">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">
                        Language
                      </label>
                      {/* R3: ui_locale. One locked value: the product ships in
                          English on every surface. */}
                      <input
                        type="text"
                        value="English"
                        readOnly
                        className="appearance-none block w-full px-3 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 sm:text-sm"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        The workspace ships in English.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">
                        Time zone (IANA)
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
                        <div className="text-sm font-bold text-slate-700">Roaming</div>
                        <div className="text-xs text-slate-500">Follow the device time zone automatically.</div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setTzFollowDevice((value) => {
                            const next = !value;
                            if (next) {
                              const detectedTimezone = detectBrowserTimezone();
                              if (detectedTimezone) setTimezone(detectedTimezone);
                            }
                            return next;
                          })}
                        className={`w-11 h-6 rounded-full p-1 transition-colors ${tzFollowDevice ? "bg-indigo-600" : "bg-slate-200"}`}
                        aria-pressed={tzFollowDevice}
                        aria-label="Enable roaming"
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
                    Forgotten your password?
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
                    <Loader2 className="w-5 h-5 animate-spin" /> Working…
                  </>
                ) : isSignUp ? (
                  <>
                    {coachSignup ? "Create my coach account" : "Create my account"}{" "}
                    <ArrowRight className="w-5 h-5" />
                  </>
                ) : (
                  "Sign in"
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
                    {coachSignup
                      ? (isSignUp ? "Already have a coach account?" : "No coach account yet?")
                      : (isSignUp ? "Already have an account?" : "No account yet?")}
                  </span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3">
                {/* DEUX BOUTONS QUI NE FONT PAS LA MÊME CHOSE, ET C'EST LE POINT.
                    Côté coach, le basculement inscription/connexion reste LOCAL:
                    le formulaire coach vit sur cette page.
                    Côté élève, « créer un compte » est un LIEN vers /start, pas
                    un `setIsSignUp(true)`. Deux raisons, et la seconde est un
                    bug qu'on éviterait de justesse: (1) l'inscription élève doit
                    demander le PAYS, que cette page ne demande pas; (2) le
                    `useEffect` qui suit `?role=coach` remet `isSignUp` à false à
                    chaque rendu hors mode coach, donc le basculement local
                    n'aurait affiché le formulaire qu'un clignement. */}
                {coachSignup ? (
                  <button
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="w-full inline-flex justify-center py-3 px-4 border border-slate-200 rounded-xl shadow-sm bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    {isSignUp ? "Sign in" : "Create a coach account"}
                  </button>
                ) : (
                  <Link
                    to="/start"
                    className="w-full inline-flex justify-center py-3 px-4 border border-slate-200 rounded-xl shadow-sm bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Create a free account
                  </Link>
                )}
              </div>

              {/* KEEL — the two doors reference each other. A coach landing on
                  the consumer form must see their door without guessing a URL,
                  and vice-versa. */}
              <div className="mt-4 text-center text-sm text-slate-500">
                {coachSignup ? (
                  <>
                    {keelT("auth.coach_link.back_prompt")}{" "}
                    <Link
                      to="/auth"
                      className="font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      {keelT("auth.coach_link.back_cta")}
                    </Link>
                  </>
                ) : (
                  <>
                    {keelT("auth.coach_link.prompt")}{" "}
                    <Link
                      to="/auth?role=coach"
                      className="font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      {keelT("auth.coach_link.cta")}
                    </Link>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Trust Signals */}
        {isSignUp && !isResettingPassword && !prelaunchLockdown && (
            <div className="mt-8 flex justify-center gap-6 text-xs text-slate-400 font-medium uppercase tracking-wider">
                <span className="flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> Private data</span>
                <span className="flex items-center gap-1"><Sparkles className="w-4 h-4" /> Secured AI</span>
            </div>
        )}
      </div>
    </div>
  );
};

export default Auth;
