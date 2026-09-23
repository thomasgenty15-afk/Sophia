import React, { useMemo, useState, useEffect } from 'react';
// `Mail`, `Bell`, `Check` et `ChevronRight` ne sont plus importés, et chacun
// part avec un morceau d'interface qui MENTAIT ou qui trompait — voir les trois
// blocs commentés plus bas (les faux interrupteurs de notification, la coche de
// vérification d'e-mail, le chevron de « Sign out »).
import {
  X,
  User,
  CreditCard,
  Settings,
  LogOut,
  Shield
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { newRequestId, requestHeaders } from '../lib/requestId';
import { Link, useNavigate } from 'react-router-dom';

// `DEFAULT_LOCALE` N'EST PLUS IMPORTÉ D'ICI, ET C'EST LE POINT. Il vaut
// `"fr-FR"` (`lib/localization.ts`), un reliquat du produit grand public, et il
// écrasait la langue du compte à chaque sauvegarde de préférences. La langue se
// lit et s'écrit maintenant par `keel/i18n`, qui en est la seule autorité.
import { DEFAULT_TIMEZONE, detectBrowserTimezone, getAllSupportedTimezones } from '../lib/localization';
import { parseUiLocale } from '../keel/i18n/catalog';
import { chosenUiLocale } from '../keel/i18n/runtime';
import { plural } from '../keel/i18n/plural';
import { chooseUiLanguage } from '../keel/api/uiLanguage';
import DataPrivacySection from './account/DataPrivacySection';
// ── LE KIT, ET C'EST NOUVEAU ICI ──────────────────────────────────────────────
// Cet écran — le plus gros du produit connecté après les pages KEEL, et le seul
// que l'audit du chantier avait oublié de compter — n'importait AUCUNE primitive:
// son bouton, sa carte, son champ et sa pastille étaient recopiés à la main.
// Les cinq entrées ci-dessous sont la charte « la fiche » telle qu'elle est
// construite (`docs/keel/CHARTE-VITRINE.md`).
import { Button, buttonClass } from '../keel/components/ui/Button';
import { Card, SectionLabel } from '../keel/components/ui/Card';
import { Field, inputClass } from '../keel/components/ui/Field';
// Tout le texte passe par `t()` sous `account.*` (2026-09-23): `/account` est
// une page DÉCLARÉE dans `keel/i18n/catalog.ts`, donc une clé hors périmètre
// lève en DEV sur un écran français.
import { t } from '../keel/i18n/t';

interface UserProfileProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'action' | 'architecte';
  initialTab?: TabType;
}

type TabType = 'general' | 'subscription' | 'settings';

type Profile = {
  full_name: string | null;
  timezone?: string | null;
  locale?: string | null;
  tz_follow_device?: boolean | null;
  // Décide où mène l'onglet « Abonnement »: `/coach/billing` pour un coach,
  // `/app/billing` pour tout le reste.
  keel_role?: string | null;
};


function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}

const UserProfile: React.FC<UserProfileProps> = ({ isOpen, onClose, mode, initialTab }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const shouldRender = isOpen;

  const [activeTab, setActiveTab] = useState<TabType>(initialTab ?? 'general');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [fullNameDraft, setFullNameDraft] = useState<string>("");


  const [emailEditOpen, setEmailEditOpen] = useState<boolean>(false);
  const [emailDraft, setEmailDraft] = useState<string>("");
  const [emailLoading, setEmailLoading] = useState<boolean>(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);

  const [passwordLoading, setPasswordLoading] = useState<boolean>(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

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
          .select('full_name, timezone, locale, tz_follow_device, keel_role')
          .eq('id', user.id)
          .single();
        
        if (data) {
          const loadedProfile = data as Profile;
          setProfile(loadedProfile);
          setFullNameDraft(loadedProfile.full_name || user?.user_metadata?.full_name || "");

          const tz = (loadedProfile.timezone ?? "").trim();
          setTimezoneDraft(tz || detectBrowserTimezone() || DEFAULT_TIMEZONE);
          setTzFollowDeviceDraft(Boolean(loadedProfile.tz_follow_device));
        }
      };
      fetchProfile();
    }
  }, [user]);


  useEffect(() => {
    if (!shouldRender) return;
    setActiveTab(initialTab ?? "general");
    setSaveError(null);
    setSaveSuccess(null);
    setEmailError(null);
    setEmailSuccess(null);
    setEmailDraft(displayEmail);
    setEmailEditOpen(false);
    setPasswordError(null);
    setPasswordSuccess(null);
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
    return n || t("account.fallback_name");
  }, [profile?.full_name, user?.user_metadata?.full_name]);
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // ── ⚠️ `mode` NE PEINT PLUS RIEN ICI, ET C'EST LA DÉCISION LA PLUS LOURDE DE
  // CE LOT. Ne la « répare » pas sans avoir lu ceci en entier.
  //
  // Ce panneau rendait DEUX habillages: celui-ci, et une peau sombre en
  // ÉMERAUDE (`bg-emerald-950`, `border-emerald-800`, `text-emerald-400`…) quand
  // `mode === 'architecte'`. Cette peau pesait à elle seule ~90 des 125 couleurs
  // saturées du fichier. Elle part, pour trois raisons cumulées:
  //
  //   1. L'émeraude est la famille d'état « ok » dans TOUT le produit
  //      (`ui/Badge.tsx`). Une peau entière dans cette teinte rend un
  //      enregistrement confirmé indistinguable d'un fond de panneau — c'est
  //      exactement ce que la règle de couleur de l'app interdit: la teinte de
  //      marque marque l'action, les couleurs d'état marquent les faits.
  //   2. `architecte` est un palier d'abonnement du produit GRAND PUBLIC
  //      supprimé (`keel/components/CoachRoute.tsx`: « legacy French
  //      subscription tiers »). Et cette peau ne se déclenche même pas sur le
  //      palier: elle vient d'un `?mode=architecte` dans l'URL
  //      (`pages/Account.tsx`), que RIEN dans le dépôt ne pose — vérifié hors
  //      commentaires sur `frontend/src` et `frontend/e2e`.
  //   3. La charte ne nomme QU'UN fond sombre, `fig-950`, et « un seul par
  //      page » (charte §2). Deux thèmes n'y entrent pas.
  //
  // Le drapeau reste CALCULÉ parce qu'il est encore la prop de
  // `DataPrivacySection`, qui n'est pas de ce lot et garde sa propre peau
  // sombre. Le jour où ce composant passe à la charte, `mode`, `isArchitect` et
  // la prop partent ensemble: c'est un lot de suppression, pas de style.
  const isArchitect = mode === 'architecte';
  // ⛔ LES DEUX FAMILLES D'ÉTAT NE BOUGENT PAS: émeraude = ok, rouge = échec.
  // Seules leurs valeurs claires subsistent, et `red-600` monte à `red-700`
  // (6,13:1 sur `paper`), la valeur que le kit emploie partout ailleurs.
  const successColor = "text-emerald-700";
  const errorColor = "text-red-700";


  const handleSaveProfile = async () => {
    if (!user) return;
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const nextFullName = (fullNameDraft ?? "").trim() || null;
      
      // Le nom, et lui seul: le téléphone n'est plus une donnée que cette page
      // (ni aucune autre) fait saisir — voir le bloc retiré plus bas.
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
        setProfile((prev) => ({ ...(prev ?? { full_name: null }), full_name: data.full_name }));
        setFullNameDraft(data.full_name ?? "");
      }

      setSaveSuccess(t("account.general.saved"));
    } catch (err: unknown) {
      setSaveError(getErrorMessage(err, t("account.general.error.save")));
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
      if (!nextEmail) throw new Error(t("account.email.error.required"));
      if (nextEmail === (displayEmail || "").toLowerCase()) {
        setEmailSuccess(t("account.email.unchanged"));
        setEmailEditOpen(false);
        return;
      }
      const { error } = await supabase.auth.updateUser(
        { email: nextEmail },
        // `/account` et non `/dashboard`, supprimée avec le produit grand
        // public. L'élève qui confirme son changement d'email revient là d'où
        // il l'a demandé, ce qui est aussi la page qui lui montre le résultat.
        { emailRedirectTo: window.location.origin + "/account" },
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
      setEmailSuccess(t("account.email.sent"));
      setEmailEditOpen(false);
    } catch (err: unknown) {
      setEmailError(getErrorMessage(err, t("account.email.error.failed")));
    } finally {
      setEmailLoading(false);
    }
  };

  // Le lien de changement de mot de passe part vers l'adresse DU COMPTE, et
  // vers elle seule — le même appel que « Mot de passe oublié » de `/auth`
  // (`pages/Auth.tsx`, `handleResetPassword`), qui atterrit sur
  // `/reset-password`.
  const handlePasswordReset = async () => {
    if (!displayEmail) return;
    setPasswordLoading(true);
    setPasswordError(null);
    setPasswordSuccess(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(displayEmail, {
        redirectTo: window.location.origin + '/reset-password',
      });
      if (error) throw error;
      setPasswordSuccess(t("account.password.sent", { email: displayEmail }));
    } catch (err: unknown) {
      setPasswordError(getErrorMessage(err, t("account.password.error")));
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    if (!user) return;
    setPrefsLoading(true);
    setPrefsError(null);
    setPrefsSuccess(null);
    try {
      const detectedTimezone = detectBrowserTimezone();
      const nextTimezone = tzFollowDeviceDraft
        ? detectedTimezone || (timezoneDraft ?? "").trim() || DEFAULT_TIMEZONE
        : (timezoneDraft ?? "").trim() || DEFAULT_TIMEZONE;
      const { data, error } = await supabase
        .from("profiles")
        .update({
          timezone: nextTimezone,
          tz_follow_device: tzFollowDeviceDraft,
          // ⚠️ `locale: DEFAULT_LOCALE` ÉTAIT ICI, ET SON RETRAIT EST UNE
          // CORRECTION DE BUG, PAS UN NETTOYAGE.
          //
          // Le commentaire disait « For now, language is locked to French;
          // store locale deterministically » — et il faisait exactement ça:
          // CHAQUE sauvegarde de préférences réécrivait `profiles.locale` à
          // `fr-FR` (`lib/localization.ts`), quelle que soit la langue du
          // compte. Un coach inscrit en anglais qui changeait son fuseau
          // horaire repartait avec un agent qui lui répond en français, et
          // aucune ligne de cet écran ne parlait de langue.
          //
          // La langue a maintenant son propre contrôle, juste en dessous, et
          // il passe par `chooseUiLanguage` — le seul écrivain.
        })
        .eq("id", user.id)
        .select("timezone, locale, tz_follow_device")
        .single();

      if (error) throw error;
      if (data) {
        const prefsProfile = data as Pick<Profile, "timezone" | "locale" | "tz_follow_device">;
        setProfile((prev) => ({ ...(prev ?? { full_name: null }), ...prefsProfile }));
        setTimezoneDraft((prefsProfile.timezone ?? "") || nextTimezone);
        setTzFollowDeviceDraft(Boolean(prefsProfile.tz_follow_device));
      }
      setPrefsSuccess(t("account.settings.saved"));
    } catch (err: unknown) {
      setPrefsError(getErrorMessage(err, t("account.settings.error.save")));
    } finally {
      setPrefsLoading(false);
    }
  };

  if (!shouldRender) return null;

  // ── L'ONGLET « ABONNEMENT » RENVOIE À LA PAGE QUI GÈRE L'ABONNEMENT ────────
  // Il rendait une carte de palier du produit grand public supprimé (« The
  // Architect », « Move up a tier » vers `/upgrade`, portail Stripe). Le foyer
  // a sa page (`/app/billing`, FF-064) et le coach la sienne
  // (`/coach/billing`): l'onglet n'y mène plus que par un lien.
  const billingPath = profile?.keel_role === 'coach' ? '/coach/billing' : '/app/billing';

  // ── LE CHÂSSIS DU PANNEAU — UN SEUL HABILLAGE, CELUI DE LA CHARTE ─────────
  // Aucune valeur n'est choisie ici: elles viennent de
  // `docs/keel/CHARTE-VITRINE.md` §2 et du kit `keel/components/ui/`.
  const styles = {
    // Le voile est l'ENCRE de la marque, pas un noir: `ink` (#23191F) à 40 %,
    // exactement ce que pose `ui/Modal.tsx`. Ce qui sépare le panneau de la
    // page, c'est son trait — pas la densité du voile.
    overlay: "fixed inset-0 z-50 flex justify-end bg-ink/40 backdrop-blur-sm animate-fade-in",
    // ⚠️ `flex h-full flex-col` REMPLACE UN CALCUL EN DUR, ET C'ÉTAIT UN DÉFAUT.
    // La colonne intérieure était en `h-[calc(100%-80px)]`, c'est-à-dire « cet
    // en-tête fait 80 px » — faux dès qu'un nom un peu long passe sur deux
    // lignes: le pied du panneau descendait alors sous le bas de l'écran, et le
    // bouton de déconnexion avec lui. Mesuré à 320 px avant correction.
    // Le trait de gauche est une bordure de CONTRÔLE (`line-strong`, 3,84:1):
    // `line` est à 1,30:1 et ne détacherait pas le panneau du fond de page.
    // `shadow-2xl` part: une fiche technique a des cases tracées, pas des ombres.
    container:
      "flex h-full w-full max-w-md flex-col border-l border-line-strong bg-paper text-ink transition-transform duration-300 animate-slide-in-right",
    // Le FRONTON de la fiche: `paper-2` fermé par un trait `line`, l'idiome de
    // `/auth`, de `/start` et de `ui/Modal.tsx`.
    header: "flex shrink-0 items-center justify-between gap-3 border-b border-line bg-paper-2 px-4 py-3",
    closeBtn: "shrink-0 rounded-full p-2 text-ink-soft transition-colors hover:bg-fig-50 hover:text-ink",
    // ⚠️ L'ONGLET ACTIF ÉTAIT EN `text-blue-600`, ET C'EST LE PIÈGE DE LA RÈGLE
    // DE COULEUR: le bleu appartient à `Badge tone="info"`, donc la NAVIGATION
    // portait la couleur d'un ÉTAT. Il passe à la marque, avec la forme exacte
    // de la barre du shell (`KeelAppShell.tsx`, `ShellLink`): `paper` sur
    // `fig-700` = 9,98:1 actif, encre secondaire (6,11:1) et lavis `fig-50` au
    // survol sinon. Un onglet est une navigation, la marque est chez elle.
    sidebarItem: (isActive: boolean) =>
      `inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition-colors ${
        isActive ? "bg-fig-700 text-paper" : "text-ink-soft hover:bg-fig-50 hover:text-ink"
      }`,
    // ⛔ LE CHAMP VIENT DU KIT, ET C'EST LA CORRECTION D'UN DÉFAUT MESURÉ. La
    // classe locale portait `text-sm` — 14 px — sur les cinq champs de cet
    // écran: Safari iOS ZOOME sur un champ dont le texte fait moins de 16 px au
    // focus et NE DÉZOOME PAS en sortant. `inputClass` porte
    // `text-base … lg:text-sm`, la bordure de contrôle `line-strong` (3,84:1
    // contre `border-slate-200`, qui était sous le seuil de WCAG 1.4.11), un
    // anneau de focus explicite en `fig-600` (7,36:1) et `min-w-0`.
    // ⛔ Ne remets jamais `text-sm` nu ici. Et le focus n'est plus
    // `focus:border-blue-500`: le bleu est pris par l'état « info ».
    input: inputClass,
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.container} onClick={e => e.stopPropagation()}>
        
        {/* HEADER */}
        <div className={styles.header}>
          <div className="flex min-w-0 items-center gap-3">
            {/* Le disque d'initiales est la SEULE pièce chaude du panneau: le
                lavis des figures (`fig-100`) et l'accent (`fig-700`) — 8,27:1.
                Il ne dit rien d'un état, il identifie une personne, donc la
                marque y est chez elle. La bordure blanche et l'ombre partent:
                sur `paper-2` elles ne détachaient rien. */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fig-100 text-base font-semibold text-fig-700">
              {initials}
            </div>
            {/* `min-w-0` SUR LES DEUX NIVEAUX: sans lui, une adresse longue
                refuse de rétrécir (`min-width: auto` sur un enfant de flex) et
                pousse le bouton de fermeture hors du panneau à 320 px.
                ⚠️ CE TITRE RESTE UN `h2` ET N'EST PAS PROMU EN `h1`: ce
                composant est une FENÊTRE (voile, fermeture au clic du fond), et
                `ui/Modal.tsx` titre aussi en `h2`. La conséquence est que
                `/account` n'a aucun `h1` — SIGNALÉ, PAS RÉPARÉ: le corriger
                demande de décider si cet écran est une page ou un dialogue, et
                c'est de la structure, pas de la couleur. */}
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold leading-tight text-ink">{displayName}</h2>
              <p className="truncate text-sm text-ink-soft">{displayEmail}</p>
            </div>
          </div>
          {/* `aria-label`: ce bouton n'a pas de texte, et il n'en avait pas non
              plus pour un lecteur d'écran — il s'annonçait « bouton ». */}
          <button type="button" onClick={onClose} aria-label={t("account.close")} className={styles.closeBtn}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ⚠️ `min-h-0 flex-1` ET PAS `h-[calc(100%-80px)]`: voir le commentaire
            de `styles.container`. C'est le flux qui mesure l'en-tête. */}
        <div className="flex min-h-0 flex-1 flex-col">

          {/* NAVIGATION TABS (Horizontal pour mobile/desktop) */}
          <div className="flex shrink-0 flex-col gap-2 overflow-x-auto border-b border-line px-4 py-3 min-[350px]:flex-row">
            {/* `aria-current="page"` double la couleur de l'onglet actif par une
                information annoncée: la marque seule ne dit rien à qui ne la
                voit pas. */}
            <button type="button" onClick={() => setActiveTab('general')} aria-current={activeTab === 'general' ? 'page' : undefined} className={`${styles.sidebarItem(activeTab === 'general')} justify-center min-[350px]:justify-start`}>
              <User className="h-4 w-4 shrink-0" /> {t("account.tab.general")}
            </button>
            <button type="button" onClick={() => setActiveTab('subscription')} aria-current={activeTab === 'subscription' ? 'page' : undefined} className={`${styles.sidebarItem(activeTab === 'subscription')} justify-center min-[350px]:justify-start`}>
              <CreditCard className="h-4 w-4 shrink-0" /> {t("account.tab.subscription")}
            </button>
            <button type="button" onClick={() => setActiveTab('settings')} aria-current={activeTab === 'settings' ? 'page' : undefined} className={`${styles.sidebarItem(activeTab === 'settings')} justify-center min-[350px]:justify-start`}>
              <Settings className="h-4 w-4 shrink-0" /> {t("account.tab.settings")}
            </button>
            {/* L'ONGLET « REFERRAL » A ÉTÉ RETIRÉ ICI (2026-08-05).
                Il appelait `navigate('/parrainage')`, une route DÉMONTÉE avec le
                produit grand public (W2.A): le seul effet du bouton était de
                fermer le panneau et d'envoyer sur la page « introuvable ». Il
                était en plus le quatrième d'une rangée qui ne tient pas dans un
                téléphone — mesuré à 375 px, il commençait à x=366, donc hors
                écran, ce qui est la seule raison pour laquelle personne ne
                l'avait signalé.
                Le jour où le parrainage revient, il revient avec sa route. */}
          </div>

          {/* CONTENT SCROLLABLE */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">

            {/* --- TAB: GENERAL --- */}
            {activeTab === 'general' && (
              <div className="animate-fade-in">
                {/* `SectionLabel` du kit: c'est l'ÉQUERRE de l'app, la signature
                    de la charte, et elle « marque l'origine de ce qui est
                    spécifié » (charte §4). Elle remplace un `text-xs font-bold
                    uppercase tracking-widest text-slate-400` recopié trois fois
                    dans ce fichier. Il y a toujours un mot à sa droite. */}
                <SectionLabel>{t("account.general.section")}</SectionLabel>

                <div className="space-y-4">
                  {/* `Field` du kit: l'étiquette passe au cran `text-label` de la
                      charte, et surtout elle est enfin LIÉE à son champ par
                      `htmlFor`/`id` — les cinq `<label>` de cet écran n'en
                      avaient aucun, donc cliquer l'étiquette ne donnait pas le
                      focus et un lecteur d'écran annonçait un champ sans nom. */}
                  <Field label={t("account.general.full_name")} htmlFor="account-full-name">
                    <input
                      id="account-full-name"
                      type="text"
                      value={fullNameDraft}
                      onChange={(e) => setFullNameDraft(e.target.value)}
                      className={styles.input}
                      placeholder={t("account.general.full_name_placeholder")}
                    />
                  </Field>
                  <div>
                    {/* ── ⛔ LA COCHE VERTE A ÉTÉ RETIRÉE, ET C'ÉTAIT UN FAIT FAUX
                        INDÉMENTABLE ──────────────────────────────────────────
                        Une coche `emerald-600` était posée en absolu sur le champ
                        e-mail — donc « vérifié », dans la seule teinte que le
                        produit emploie pour dire « ok ». Elle était rendue
                        INCONDITIONNELLEMENT: aucun code de cet écran ne lit
                        `user.email_confirmed_at`. Elle affirmait donc une
                        vérification que rien n'avait vérifiée, pour tout le monde,
                        y compris un compte non confirmé.
                        Le `pr-10` part avec elle: il n'existait que pour réserver
                        la place de la coche (une adresse de plus de ~28 caractères
                        finissait derrière l'icône sur un téléphone).
                        ⚠️ SI CETTE INFORMATION EST VOULUE, elle se rend en
                        `Badge tone="positive"` À CÔTÉ du champ, branchée sur
                        `email_confirmed_at`. Ce n'est pas un lot de style. */}
                    <Field label={t("account.general.email")} htmlFor="account-email">
                      <input id="account-email" type="email" defaultValue={displayEmail} className={styles.input} readOnly />
                    </Field>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      {/* Un lien: la marque marque les liens (charte §2).
                          `fig-700` sur `paper` = 9,98:1. */}
                      <button
                        type="button"
                        onClick={() => {
                          setEmailDraft(displayEmail);
                          setEmailError(null);
                          setEmailSuccess(null);
                          setEmailEditOpen((v) => !v);
                        }}
                        aria-expanded={emailEditOpen}
                        className="text-sm font-medium text-fig-700 underline transition-colors hover:text-fig-800"
                      >
                        {t("account.email.change")}
                      </button>
                      {emailSuccess && <div className={`text-sm ${successColor}`}>{emailSuccess}</div>}
                      {emailError && <div className={`text-sm ${errorColor}`}>{emailError}</div>}
                    </div>
                    {emailEditOpen && (
                      <Card className="mt-3">
                        <div className="space-y-3">
                          <input
                            type="email"
                            value={emailDraft}
                            onChange={(e) => setEmailDraft(e.target.value)}
                            className={styles.input}
                            placeholder={t("account.email.new_placeholder")}
                            aria-label={t("account.email.new_aria")}
                          />
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {/* `ghost` = le geste qu'on peut ignorer. */}
                            <Button variant="ghost" onClick={() => setEmailEditOpen(false)} disabled={emailLoading}>
                              {t("account.cancel")}
                            </Button>
                            {/* ⚠️ `secondary` ET NON `primary`, ET C'EST LA
                                CONTRAINTE « UNE SEULE ACTION MARQUÉE PAR VUE ».
                                Quand ce panneau est ouvert, « Save » est rendu en
                                même temps, deux lignes plus bas: deux aplats de
                                marque côte à côte, c'est zéro hiérarchie. « Save »
                                garde la marque parce qu'il est l'action permanente
                                de l'onglet; celui-ci est contextuel et vit dans
                                une carte, sa place suffit à le désigner. */}
                            <Button variant="secondary" onClick={handleUpdateEmail} disabled={emailLoading}>
                              {emailLoading ? t("account.email.sending") : t("account.email.confirm")}
                            </Button>
                          </div>
                          <p className="text-sm leading-6 text-ink-soft">
                            {t("account.email.hint")}
                          </p>
                        </div>
                      </Card>
                    )}
                  </div>
                  {/* ── LE MOT DE PASSE ────────────────────────────────────────
                      Même forme que « Changer mon e-mail » juste au-dessus: un
                      lien d'action, pas un aplat — la seule action marquée de
                      l'onglet reste « Enregistrer ». Le lien part vers l'adresse
                      du compte; le message dit laquelle. L'erreur s'affiche à
                      côté du geste, pas ailleurs dans l'onglet. */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => void handlePasswordReset()}
                      disabled={passwordLoading || !displayEmail}
                      className="text-sm font-medium text-fig-700 underline transition-colors hover:text-fig-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {passwordLoading ? t("account.password.sending") : t("account.password.change")}
                    </button>
                    {passwordSuccess && <div className={`text-sm ${successColor}`}>{passwordSuccess}</div>}
                    {passwordError && <div className={`text-sm ${errorColor}`}>{passwordError}</div>}
                  </div>
                  {/* ── LE NUMÉRO DE TÉLÉPHONE A ÉTÉ RETIRÉ D'ICI (2026-08-05) ────
                      Ce bloc laissait l'utilisateur SAISIR et ÉCRIRE
                      `profiles.phone_number` — plus `phone_verified_at`,
                      `whatsapp_opted_in`, `whatsapp_bilan_opted_in`,
                      `whatsapp_state`… — c'est-à-dire précisément les colonnes
                      que le pivot de-whatsapp a gelées.

                      Trouvé en relecture à froid, après avoir retiré le mur du
                      téléphone de l'inscription: geler des colonnes en base et
                      laisser une interface vivante les écrire, c'est le motif
                      « ceinture armée sur coffre vide » que ce dépôt passe son
                      temps à retrouver. Et /account n'est pas une page morte —
                      c'est là que `resolveHomePath` envoie quiconque dont le
                      rôle ne se résout pas.

                      Son `normalizePhoneInput` portait le même biais français
                      que celui de /auth (06/07 → +33), sur un produit anglais.

                      Rien n'est perdu: la colonne existe toujours et porte
                      l'historique B2C (voir `comment on column`). Ce qui
                      disparaît est la SAISIE. */}
                </div>

                <div className="mt-6 space-y-3">
                  {/* ⛔ CES DEUX BANDEAUX SONT DES ÉTATS ET ILS RESTENT SATURÉS.
                      Un avertissement porte un FAIT, il a donc le droit d'être
                      une surface et pas seulement une pastille. Seules les
                      valeurs sont alignées sur le kit: `red-200`/`red-50` comme
                      `Button variant="danger"`, `emerald-200`/`emerald-50` comme
                      `Badge tone="positive"`. */}
                  {(saveError || saveSuccess) && (
                    <div className={`rounded-card border p-3 text-sm ${
                      saveError
                        ? "border-red-200 bg-red-50"
                        : "border-emerald-200 bg-emerald-50"
                    }`}>
                      <span className={saveError ? errorColor : successColor}>{saveError ?? saveSuccess}</span>
                    </div>
                  )}

                  {/* ⚠️ VOICI L'UNIQUE ACTION MARQUÉE DE CET ONGLET (et il n'y en
                      a qu'une par onglet dans tout ce panneau). `bg-slate-900`
                      n'était pas un état, c'était un noir froid: `primary` porte
                      désormais la marque — `paper` sur `fig-700` = 9,98:1, sur
                      `fig-800` au survol = 12,79:1. */}
                  <Button variant="primary" onClick={handleSaveProfile} disabled={saveLoading || !user} className="w-full">
                    {saveLoading ? t("account.saving") : t("account.save")}
                  </Button>
                </div>

                {/* ── ⛔ L'AMBRE DE CE BLOC EST PARTIE, ET ELLE NE DISAIT RIEN ──
                    Ambre = ATTENTION dans tout le produit (`Card tone="warning"`,
                    `Badge tone="caution"`). Ici elle peignait une ANCIENNETÉ de
                    compte: un fond ambre, un disque ambre, un titre ambre et une
                    ligne ambre pour dire « membre depuis N jours ». Un rang n'est
                    pas un avertissement, et il n'est pas non plus un état du
                    système — la distinction passe donc à une FORME: la pastille
                    neutre pour le palier, l'encre secondaire pour le fait.
                    ⟳ 2026-09-23 (FF-066 lot 4) — deux défauts qui n'étaient pas
                    de la couleur: (1) l'échelle « Initiate » jusqu'à « Master
                    Builder », vocabulaire de jeu du produit grand public
                    supprimé (« Architect » y désignait un palier d'abonnement
                    mort) — RETIRÉE: aucun score, aucune série
                    (`docs/fonctionnalites/conversation/README.md`);
                    (2) `day{n > 1 ? 's' : ''}` rendait « Member for 0 day » le
                    jour de l'inscription — réparé le 2026-09-23 en passant par
                    `plural()`, qui porte la règle de chaque langue (« 0 days »,
                    « 0 jour »). */}
                <Card className="mt-8">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-line text-ink-soft">
                      <Shield className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      {(() => {
                        const createdAt = user?.created_at ? new Date(user.created_at) : new Date();
                        const daysSinceCreation = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

                        const days = plural(
                          daysSinceCreation,
                          t("account.member_days_one", { count: daysSinceCreation }),
                          t("account.member_days_many", { count: daysSinceCreation }),
                        );

                        return (
                          <p className="text-sm text-ink-soft">
                            {t("account.member_for", { days })}
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* --- TAB: SUBSCRIPTION --- */}
            {/* UNE CARTE, UNE PHRASE, UN LIEN. L'abonnement se gère sur sa page
                (`billingPath`, calculé plus haut). Le bouton est un `Link` à la
                forme d'un bouton du kit (`buttonClass`), et il porte la seule
                action marquée de l'onglet. */}
            {activeTab === 'subscription' && (
              <div className="animate-fade-in">
                <Card>
                  <p className="text-sm leading-6 text-ink">
                    {t("account.subscription.body")}
                  </p>
                  <Link to={billingPath} className={buttonClass("primary", "md", "mt-4 w-full")}>
                    <CreditCard className="h-4 w-4 shrink-0" /> {t("account.subscription.cta")}
                  </Link>
                </Card>
              </div>
            )}

            {/* --- TAB: SETTINGS --- */}
            {activeTab === 'settings' && (
              <div className="animate-fade-in">
                <SectionLabel>{t("account.settings.section")}</SectionLabel>

                {/* `Card` du kit remplace la carte maison (`p-4 rounded-xl border
                    bg-slate-50 border-slate-200`): même géométrie, mais le rayon
                    et la bordure de contrôle viennent d'un seul endroit, et le
                    remplissage suit le ground de la page — la charte ne nomme
                    aucun neutre plus clair que `paper`, donc une carte se lit par
                    son TRAIT, pas par un aplat plus clair. */}
                <Card className="mb-4">
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="account-language" className="mb-2 block text-label font-semibold uppercase text-ink-soft">
                        {t("account.settings.language")}
                      </label>
                      {/*
                        Chaque langue est nommée DANS sa langue, et chaque
                        option porte son `lang`: sans lui, un lecteur d'écran
                        anglais prononce « Français » à l'anglaise.

                        ⚠️ CE CONTRÔLE N'EST PAS DANS « Save preferences », ET
                        C'EST VOULU. Changer de langue RECHARGE la page (`t()`
                        est résolu depuis une variable de module, et plusieurs
                        constantes l'appellent à l'import). Le mettre sous le
                        bouton perdrait le fuseau en cours d'édition au moment
                        du rechargement — un brouillon détruit par un contrôle
                        voisin, sans que rien ne le dise.
                      */}
                      <select
                        id="account-language"
                        value={chosenUiLocale()}
                        onChange={(e) => {
                          void chooseUiLanguage(parseUiLocale(e.target.value));
                        }}
                        className={styles.input}
                      >
                        {/* Les noms de langue du champ d'inscription, déjà
                            écrits pareil dans les deux packs (`public.*`). */}
                        <option value="en" lang="en">{t("public.language.en")}</option>
                        <option value="fr" lang="fr">{t("public.language.fr")}</option>
                      </select>
                      {/* `text-sm` et non `text-[11px]`: 11 px n'est dans aucun
                          cran de l'échelle de la charte, et une ligne d'aide se
                          lit — c'est la même valeur que le `hint` de `ui/Field`.
                          ⚠️ Plus de « coach » ici (2026-09-23): c'est Sophia qui
                          répond, dans cette langue. */}
                      <p className="mt-2 text-sm leading-6 text-ink-soft">
                        {t("account.settings.language_hint")}
                      </p>
                    </div>

                    <div>
                      <label htmlFor="account-timezone" className="mb-2 block text-label font-semibold uppercase text-ink-soft">
                        {t("account.settings.timezone")}
                      </label>
                      <select
                        id="account-timezone"
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
                      <div className="mt-2 text-sm leading-6 text-ink-soft">
                        {tzFollowDeviceDraft
                          ? t("account.settings.timezone_current_device", {
                            tz: detectBrowserTimezone() || timezoneDraft || DEFAULT_TIMEZONE,
                          })
                          : t("account.settings.timezone_current_profile", {
                            tz: timezoneDraft || DEFAULT_TIMEZONE,
                          })}
                      </div>
                    </div>

                    {/* Un bloc IMBRIQUÉ dans une carte ne prend pas un second
                        remplissage (il n'y en a plus de disponible sous `paper`):
                        il prend un trait. Et ce trait borde un CONTRÔLE, donc
                        `line-strong` (3,84:1) et pas `line` (1,30:1). */}
                    <div className="flex items-center justify-between gap-3 rounded-card border border-line-strong p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink">{t("account.settings.roaming")}</div>
                        <div className="mt-0.5 text-sm leading-6 text-ink-soft">
                          {t("account.settings.roaming_hint")}
                        </div>
                      </div>
                      {/* ⚠️ L'INTERRUPTEUR ÉTAIT EN `bg-blue-600` À L'ACTIF, ET
                          C'EST LE MÊME PIÈGE QUE L'ONGLET: le bleu appartient à
                          `Badge tone="info"`, donc un CONTRÔLE portait la couleur
                          d'un état. Sa forme est copiée du même contrôle déjà
                          converti dans `pages/Auth.tsx` (l'itinérance de
                          l'inscription): actif `fig-700`, inactif `line-strong`
                          (3,84:1 — c'est la bordure de contrôle, et ici c'est la
                          piste elle-même), bouton `paper`. `cursor-pointer` part:
                          un `<button>` l'a déjà. */}
                      <button
                        type="button"
                        onClick={() =>
                          setTzFollowDeviceDraft((value) => {
                            const next = !value;
                            if (next) {
                              const detectedTimezone = detectBrowserTimezone();
                              if (detectedTimezone) setTimezoneDraft(detectedTimezone);
                            }
                            return next;
                          })}
                        className={`h-5 w-10 shrink-0 rounded-full p-1 transition-colors ${
                          tzFollowDeviceDraft ? "bg-fig-700" : "bg-line-strong"
                        }`}
                        aria-pressed={tzFollowDeviceDraft}
                        aria-label={t("account.settings.roaming_aria")}
                      >
                        <div className={`h-3 w-3 rounded-full bg-paper transition-transform ${tzFollowDeviceDraft ? "translate-x-5" : ""}`} />
                      </button>
                    </div>

                    {(prefsError || prefsSuccess) && (
                      <div className={`rounded-card border p-3 text-sm ${
                        prefsError
                          ? "border-red-200 bg-red-50"
                          : "border-emerald-200 bg-emerald-50"
                      }`}>
                        <span className={prefsError ? errorColor : successColor}>{prefsError ?? prefsSuccess}</span>
                      </div>
                    )}

                    {/* L'action marquée de CET onglet, et la seule. */}
                    <Button variant="primary" onClick={handleSavePreferences} disabled={prefsLoading || !user} className="w-full">
                      {prefsLoading ? t("account.saving") : t("account.save")}
                    </Button>
                  </div>
                </Card>

                {/* ── ⛔ LES DEUX INTERRUPTEURS DE NOTIFICATION ONT ÉTÉ RETIRÉS,
                    ET ILS ÉCRIVAIENT DEUX FAITS FAUX ─────────────────────────
                    Ce bloc rendait « Email notifications » ALLUMÉ et « Weekly
                    newsletter » ÉTEINT. Vérifié avant suppression, hors
                    commentaires, sur tout `frontend/src` et `supabase/`:
                      · aucun `onClick`, aucun état, aucune requête — les deux
                        « interrupteurs » étaient des `<div>` avec un
                        `cursor-pointer` et une position de pouce EN DUR;
                      · « newsletter » n'apparaissait nulle part ailleurs dans le
                        dépôt, et aucune colonne ni préférence de notification
                        n'existe pour les stocker.
                    Donc: une interface qui affirmait à chaque visiteur l'état de
                    deux réglages que le produit n'a jamais eus, dans la teinte
                    `blue-600` qui est celle de `Badge tone="info"`. Repeindre ce
                    bloc à la charte aurait fait passer un mensonge visiblement
                    legacy pour une décision de design — c'est le motif « la coche
                    automatique écrit des faits faux indémentables », que ce dépôt
                    a déjà refusé de livrer une fois.
                    ⚠️ Si des préférences de notification sont voulues, elles
                    demandent un contrôle réel et un endroit pour les écrire.
                    C'est un lot produit, pas un lot de style. */}

                {/* ── ⚠️ « SIGN OUT » N'EST PLUS ROUGE, ET C'EST DÉLIBÉRÉ ─────
                    Se déconnecter ne détruit rien et se défait en se
                    reconnectant: le rouge dit ÉCHEC/REFUS dans tout le produit.
                    Surtout, `DataPrivacySection` rend « Delete my account » juste
                    en dessous, en rouge, et c'est LUI qui est irréversible — deux
                    lignes rouges empilées, et l'irréversible ne se distingue plus
                    de l'ordinaire. Le geste destructeur garde donc le rouge à lui
                    seul (`Button variant="danger"`, un ÉTAT, inchangé).
                    Le `ChevronRight` part avec: il annonçait un écran suivant, or
                    ce bouton agit sur place. */}
                <Button variant="secondary" onClick={handleSignOut} className="w-full">
                  <LogOut className="h-4 w-4 shrink-0" /> {t("account.sign_out")}
                </Button>

                <DataPrivacySection isArchitect={isArchitect} />
              </div>
            )}

          </div>

          {/* ── LE PIED — ⛔ « POWERED BY IKIZEN » A ÉTÉ RETIRÉ ───────────────
              L'ENTITÉ LÉGALE SE DÉCLARE SUR `/legal`, EN UN LIEN, et pas en
              mention sous un logo: c'est déjà ce que fait le pied de
              `pages/Auth.tsx`, et `lib/legalEntity.ts` en est la source unique.
              Une mention « Powered by » ne mène nulle part, n'est pas ce que la
              LCEN demande, et nomme la société sans la joindre à ses
              identifiants.
              Le numéro de version part avec: « Sophia v2.4.0 » était écrit en
              dur, et rien dans le dépôt ne définit ce numéro — un fait
              invérifiable affiché à chaque visiteur.
              La clé `public.footer.legal` existe DÉJÀ dans les deux paquets de
              traduction; aucune chaîne n'est ajoutée. */}
          <div className="shrink-0 border-t border-line px-4 py-4 text-center text-sm">
            <Link to="/legal" className="text-ink-soft transition-colors hover:text-ink hover:underline">
              {t("public.footer.legal")}
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
};

export default UserProfile;
