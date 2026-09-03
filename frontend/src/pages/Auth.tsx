import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { isProAccessRefused, resolveHomePath } from '../keel/api/postLogin';
// LE PAYS N'EST PLUS DEMANDÉ ICI. Il se déduit du fuseau — voir
// `keel/api/countryFromTimezone.ts` pour la décision et son prix.
import { declaredCountryFor } from '../keel/api/countryFromTimezone';
import { consumePendingCoachInvitation } from '../keel/api/coachInvite';
import SEO from '../components/SEO';
import { LocaleSwitch } from '../keel/components/LocaleSwitch';
import { Button, ButtonLink } from '../keel/components/ui/Button';
import { t } from '../keel/i18n/t';
import { chosenUiLocale, signupProfileLocale } from '../keel/i18n/runtime';
import { type UiLocale } from '../keel/i18n/catalog';
import { newRequestId, requestHeaders } from '../lib/requestId';
import { getPrelaunchLockdownRawValue, isPrelaunchLockdownEnabled } from '../security/prelaunch';
import { isProSurfaceHidden } from '../security/proSurface';
import { DEFAULT_TIMEZONE, detectBrowserTimezone, getAllSupportedTimezones } from '../lib/localization';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';

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

// ---------------------------------------------------------------------------
// REFONTE DU 2026-08-12 — LA LANGUE, LA DESTINATION, L'APPARENCE
//
// Trois choses ont changé, et AUCUNE n'est de l'authentification. Ni `signUp`,
// ni `signInWithPassword`, ni la garde de pays, ni une redirection: les appels
// et leur ordre sont ceux d'avant, ligne pour ligne.
//
// 1. LA LANGUE. Cet écran ne portait pas UN SEUL `t()` sur 1 297 lignes, hors
//    les quatre passerelles coach. Un visiteur qui lisait le site en français
//    cliquait « Se connecter » et tombait sur « Good to see you again. » — la
//    couture au milieu de la page que `i18n/pageFrontier.int.test.ts` existe
//    pour interdire, sur la seule page que tout le monde traverse. Tout passe
//    désormais par le namespace `auth`, et `/auth` est déclarée dans
//    `PAGE_NAMESPACES`.
//    ⚠️ CE N'EST PLUS UN CHOIX PAR CHAÎNE. Une seule chaîne laissée en dur ici
//    rouvre le défaut, et aucun type ne la voit: le compilateur garde les CLÉS,
//    pas les littéraux qu'on oublie de passer par `t()`.
//
// 2. LA DESTINATION. Le site a deux mondes (`?w=household`, `?w=pro`) qui n'ont
//    ni le même acheteur ni la même inscription. Le paramètre décide UNIQUEMENT
//    de la mise en avant en bas d'écran. Sans lui, l'écran reste NEUTRE et
//    propose les deux à égalité — c'est le comportement d'avant, donc tous les
//    liens `/auth` déjà en circulation marchent à l'identique.
//    ⚠️ `?role=coach` est intouché: c'est lui, et lui seul, qui ouvre un
//    formulaire d'inscription. `?w=` n'ouvre rien.
//
// 3. L'APPARENCE. La charte du site (« la fiche »), déjà posée dans
//    `tokens.css`. Sont partis: l'ancien logo violet yin-yang, la mention
//    « POWERED BY IKIZEN » (l'entité légale se déclare sur `/legal`, via
//    `lib/legalEntity.ts`), toute la famille indigo `#7c3aed` — des jetons MORTS
//    du produit grand public supprimé — et le fond `gray-50`.
//    ⚠️ LA COULEUR SATURÉE RESTE LA PROPRIÉTÉ DU SENS. Rouge = échec, ambre =
//    attention, bleu = en attente, émeraude = succès. La teinte de marque
//    (figue) n'entre dans AUCUNE pastille d'état: elle est de l'encre, un filet,
//    un bouton plein, une équerre.
//
// ⚠️ AUCUN EFFET NOUVEAU QUI DÉPENDE DE `user`. Le défaut voisin réparé la
// veille (commit `a84e416f`, `/start` figé sur son écran de chargement en
// navigation client DEPUIS cet écran) venait d'un verrou à vie annulé par un
// nettoyage par exécution. Cette page ne lit pas `useAuth`, et les effets
// ci-dessous sont ceux d'avant, avec les mêmes dépendances.
// ---------------------------------------------------------------------------

// ⚠️ `COACH_COUNTRIES` A ÉTÉ RETIRÉE, ET SON ABSENCE EST LE CHANGEMENT. Cette
// page gardait sa propre copie de la liste des pays — assumé, parce qu'elle est
// la porte unique du produit et qu'on n'y touche pas pour factoriser une
// constante. Elle n'a plus de sélecteur à remplir: le pays se déduit du fuseau.

// ⚠️ `COACH_LOCALE = "en-US"` A ÉTÉ RETIRÉ, ET SON ABSENCE EST LE CHANGEMENT.
// Il disait « R3: the coach workspace is English » — vrai du pilote, faux du
// produit. La langue du compte est maintenant CE QUE LE DRAPEAU DIT au moment
// de valider, et `signupProfileLocale()` (i18n/runtime.ts) est le seul endroit
// qui la produit.
//
// Cette page l'écrit à DEUX endroits — les métadonnées de `signUp` et le corps
// de `coach-signup-v1` — parce que deux écrivains différents la lisent
// (`handle_new_user` puis la fonction edge). Les deux appellent la même
// fonction plutôt que de se passer une variable: `chosenUiLocale()` ne bouge
// pas dans la vie d'une page (le seul changement passe par
// `setUiLocaleAndReload`, qui recharge), donc les deux lectures ne peuvent pas
// diverger, et aucune des deux ne peut être oubliée dans une signature.

// `normalizePhone` A ÉTÉ RETIRÉE AVEC LE CHAMP TÉLÉPHONE (2026-08-05).
// Elle présupposait `+33` — 10 chiffres commençant par 0, 9 chiffres sans
// indicatif, repli en préfixant `+` — donc elle ne pouvait servir qu'un
// utilisateur français. Aucun appelant ne subsiste sur cette page. La garde
// équivalente côté base (`is_verified_phone_in_use`, et le contrôle sur
// `phone_verified_at` dans `handle_new_user()`) reste en place pour les
// imports: ce qui disparaît est la SAISIE, pas la protection.

// ---------------------------------------------------------------------------
// LE MONDE D'OÙ VIENT LE VISITEUR
// ---------------------------------------------------------------------------

/** `null` = aucun indice, et c'est un état valide: l'écran reste neutre. */
type AuthWorld = "household" | "pro" | null;

/**
 * Deux valeurs admises, et rien d'autre.
 *
 * Une valeur inconnue (`?w=coach`, `?w=1`, un lien mal recopié) retombe sur
 * `null` plutôt que de deviner: mettre en avant le mauvais monde est PIRE que
 * n'en mettre aucun en avant, puisque l'écran neutre propose les deux.
 */
function parseWorld(raw: string | null): AuthWorld {
  // LANCEMENT B2C — `?w=pro` retombe sur `null` comme n'importe quelle valeur
  // inconnue, et pour exactement la même raison: le monde pro n'existe plus
  // dans la surface. Le laisser passer ferait dire à l'écran « vous venez du
  // monde pro » et enverrait sa sortie de marque vers `/pro`, une URL qui
  // rend désormais une 404 (voir `security/proSurface.ts`).
  if (raw === "pro") return isProSurfaceHidden() ? null : "pro";
  return raw === "household" ? raw : null;
}

/**
 * Un lien vers cette page, qui EMPORTE le monde avec lui.
 *
 * Les deux portes de l'écran se renvoient l'une à l'autre (`?role=coach` et
 * retour). Sans ce report, un professionnel qui va voir l'inscription coach et
 * revient perd l'indice, et la page redevient neutre au milieu de son parcours.
 */
function authHref(world: AuthWorld, params: Record<string, string> = {}): string {
  const search = new URLSearchParams(params);
  if (world) search.set("w", world);
  const query = search.toString();
  return query ? `/auth?${query}` : "/auth";
}

// ---------------------------------------------------------------------------
// LA CHROME, LA FICHE, ET LES CHAMPS — la charte, appliquée
// ---------------------------------------------------------------------------

/**
 * La classe d'un contrôle de saisie.
 *
 * ⚠️ `text-base` sous `lg`, ET C'EST UNE RÈGLE DÉJÀ PAYÉE. `index.css` pose
 * `font-size: 16px` sur les champs sous `lg` pour empêcher Safari iOS de zoomer
 * au focus sans jamais dézoomer — mais cette règle vit dans `@layer base`, donc
 * un utilitaire `text-sm` la BAT. Écrire `text-sm` ici contournerait la
 * protection sans la retirer, c'est-à-dire de la façon la plus difficile à
 * relire. `text-base lg:text-sm` la respecte à voix haute.
 *
 * ⚠️ `border-line-strong` et jamais `border-line`: WCAG 1.4.11 exige 3:1 pour
 * une bordure de composant, et `line` est à 1,30:1 sur le papier — c'est un
 * séparateur décoratif (CHARTE §2.2).
 *
 * L'anneau de focus est explicite parce que la règle `:focus-visible` de
 * `tokens.css` ne couvre que `a`, `button` et `[tabindex]`: un champ n'en fait
 * pas partie.
 */
const controlClass =
  "block w-full min-w-0 rounded-card border border-line-strong bg-paper px-3 py-2.5 " +
  "text-base text-ink transition-colors focus:border-fig-600 focus:outline-none " +
  "focus:ring-2 focus:ring-fig-600 disabled:opacity-60 lg:text-sm";

/**
 * L'écran d'accès, dans sa chrome minimale.
 *
 * ⚠️ PAS `PublicHeader`, ET C'EST UN CHOIX. L'en-tête des pages de vente porte
 * « Se connecter » et le geste commercial du monde courant. Posé SUR l'écran de
 * connexion, le premier est un lien vers la page qu'on regarde et le second
 * réclame la décision qu'on est en train de prendre. Ce qui manque vraiment ici
 * est plus court: le nom de la marque (avec sa sortie) et le choix de la
 * langue — que `/auth` n'offrait pas du tout.
 *
 * La sortie suit le monde: un professionnel repart vers `/pro`, tout le monde
 * d'autre vers le hall du foyer.
 */
function Shell(
  { world, title, children }: {
    world: AuthWorld;
    title: string;
    children: React.ReactNode;
  },
) {
  return (
    <div className="flex min-h-screen flex-col bg-paper font-sans text-ink">
      {/* `noindex`: `/auth` est une porte fonctionnelle, délibérément absente
          du sitemap (voir son en-tête). `follow` reste, pour ne pas couper les
          liens qu'elle porte vers `/legal`. */}
      <SEO
        title={title}
        description={t("auth.seo.description")}
        robots="noindex,follow"
      />
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 w-full max-w-lg items-center justify-between gap-3 px-5">
          <Link
            to={world === "pro" ? "/pro" : "/"}
            className="eq shrink-0 font-display text-lg leading-none text-ink"
          >
            {t("brand.wordmark")}
          </Link>
          <LocaleSwitch />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-5 pb-16 pt-10 sm:pt-14">
        {children}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-lg flex-wrap items-center gap-x-6 gap-y-1 px-5 py-5 text-sm text-ink-soft">
          {/* L'entité légale se déclare ICI, en un lien, et pas en « POWERED BY
              IKIZEN » sous un logo. `lib/legalEntity.ts` en est la source, et
              `/legal` la page. */}
          <Link to="/legal" className="hover:text-ink hover:underline">
            {t("public.footer.legal")}
          </Link>
          <a
            href={`mailto:${t("public.footer.contact_email")}`}
            className="hover:text-ink hover:underline"
          >
            {t("public.footer.contact")}
          </a>
        </div>
      </footer>
    </div>
  );
}

/** Le titre de l'écran. UN SEUL `h1` par rendu, et c'est celui-ci. */
function Head({ title, lede }: { title: string; lede: string }) {
  return (
    <>
      <h1 className="text-balance font-display text-title">{title}</h1>
      <p className="mt-4 max-w-[46ch] text-lede text-ink-soft">{lede}</p>
    </>
  );
}

/**
 * LA FICHE, ET SON FRONTON.
 *
 * C'est la signature de l'écran: `/auth` n'est pas quatre écrans, c'est UN
 * document qui se reconfigure — connexion, compte coach, mot de passe,
 * vérification de l'e-mail. Le fronton le nomme, et c'est la seule chose qui
 * change d'un état à l'autre. L'équerre marque l'origine de ce qui est
 * SPÉCIFIÉ (CHARTE §5), et elle a toujours un mot à sa droite.
 *
 * ⚠️ L'ÉQUERRE EST SUR UN ÉLÉMENT SANS PADDING HORIZONTAL. La classe `.eq` pose
 * `padding-left: 1.125rem` hors de toute couche CSS, donc elle BAT un `px-5`
 * utilitaire (les styles sans couche l'emportent sur les couches). Poser les
 * deux sur le même nœud casse silencieusement la marge intérieure de gauche.
 */
function Sheet({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 overflow-hidden rounded-fiche border border-line bg-paper-2">
      <div className="border-b border-line px-5 py-3 sm:px-6">
        <p className="eq text-label font-semibold uppercase text-ink-soft">{label}</p>
      </div>
      <div className="px-5 py-6 sm:px-6">{children}</div>
    </section>
  );
}

function Field(
  { label, htmlFor, hint, children }: {
    label: string;
    htmlFor: string;
    hint?: string;
    children: React.ReactNode;
  },
) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-label font-semibold uppercase text-ink-soft"
      >
        {label}
      </label>
      {children}
      {hint && <p className="mt-2 text-sm leading-6 text-ink-soft">{hint}</p>}
    </div>
  );
}

/**
 * Un refus, dans la couleur de son SENS.
 *
 * Rouge, et pas figue: la teinte de marque n'entre jamais dans un objet d'état
 * (CHARTE §2.1). `role="alert"` parce qu'un message qui apparaît après un clic
 * doit être annoncé — sinon il n'existe que pour ceux qui regardent l'écran.
 */
function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-card border border-red-200 bg-red-50 px-3 py-2.5"
    >
      <AlertCircle aria-hidden className="mt-1 h-4 w-4 shrink-0 text-red-600" />
      <p className="min-w-0 whitespace-pre-line break-words text-sm leading-6 text-red-800">
        {children}
      </p>
    </div>
  );
}

/** Le filet qui sépare le formulaire de ce qui vient après. */
function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mt-12">
      <div aria-hidden className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-line" />
      </div>
      <p className="relative flex justify-center">
        <span className="bg-paper px-3 text-sm text-ink-soft">{children}</span>
      </p>
    </div>
  );
}

/**
 * Une destination MISE EN AVANT: une fiche bordée, avec son geste.
 *
 * L'écart entre celle-ci et `DoorLine` est toute la mise en avant. Pas de
 * couleur de plus, pas de badge « recommandé »: une boîte contre une ligne.
 */
function DoorCard(
  { label, body, to, cta }: {
    label: string;
    body: string;
    to: string;
    cta: string;
  },
) {
  return (
    <div className="flex min-w-0 flex-col rounded-fiche border border-line bg-paper-2 p-5">
      <p className="text-label font-semibold uppercase text-ink-soft">{label}</p>
      <p className="mt-2 flex-1 text-sm leading-6 text-ink-soft">{body}</p>
      <ButtonLink to={to} variant="brand" className="mt-5 w-full">
        {cta}
      </ButtonLink>
    </div>
  );
}

/** L'autre destination: accessible, et discrète. Une ligne, un lien. */
function DoorLine({ prompt, to, cta }: { prompt: string; to: string; cta: string }) {
  return (
    <p className="mt-5 text-sm leading-6 text-ink-soft">
      {prompt}{" "}
      <Link
        to={to}
        className="font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
      >
        {cta}
      </Link>
    </p>
  );
}

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Une seule lecture de la query, au lieu de six constructions successives du
  // même objet. Même valeurs, même rendu: `location.search` est la seule entrée.
  const params = React.useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const redirectTo = params.get('redirect');
  const forbidden = params.get('forbidden') === '1';
  const debug = params.get('debug') === '1';
  const view = params.get('view') || '';
  const prelaunchLockdown = isPrelaunchLockdownEnabled();
  const prelaunchRaw = debug ? getPrelaunchLockdownRawValue() : "";

  // KEEL W6.1 — coach mode. Everything downstream branches on this flag only.
  // LANCEMENT B2C — `?role=coach` est LE seul drapeau qui ouvre l'inscription
  // coach (le formulaire, le sélecteur de langue du coach, l'appel à
  // `coach-signup-v1`, la passerelle de retour et les titres du mode coach en
  // dépendent tous). Le forcer à `false` referme le parcours pro d'un bloc,
  // sans qu'aucune de ces branches ait à connaître le drapeau.
  // ⚠️ Neutralisé ICI et pas plus bas: `prelaunchLockdown` le fait déjà, à un
  // seul endroit et pour la même raison. Deux mécanismes qui éteignent la même
  // chose à deux endroits différents divergent.
  const proSurfaceHidden = isProSurfaceHidden();
  const coachSignup = !proSurfaceHidden && (params.get('role') || '') === 'coach';

  // Le monde d'où l'on vient. Il ne décide QUE de la mise en avant du bas
  // d'écran: aucun formulaire, aucune redirection, aucun appel n'en dépend.
  const world = parseWorld(params.get('w'));

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
  //
  // ⚠️ VIDE, ET C'EST UN CHANGEMENT DÉLIBÉRÉ (2026-08-12). Il naissait à `'US'`,
  // exactement comme `/start` — sauf qu'ici la valeur ne reste pas chez le
  // coach: `keel_attach_student_to_coach` (migration 20260804180000) recopie le
  // PAYS DÉCLARÉ DU COACH dans `profiles.country` de chaque élève qui n'a pas
   // ⚠️ LE SÉLECTEUR DE PAYS A DISPARU DE CETTE PORTE, ET C'EST LA DÉCISION.
  //
  // Le bloc retiré ici racontait l'inverse: le champ naissait à « US », donc un
  // coach français qui n'y touchait pas rangeait sa cohorte entière aux
  // États-Unis, sur la colonne que le résolveur de crise lit en premier. La
  // garde de forme a été armée pour ça (W6.1), et elle avait raison.
  //
  // Ce qui a changé n'est pas la mécanique, c'est le SUJET: le routage du
  // numéro d'urgence n'est pas un sujet du produit aujourd'hui — décision
  // explicite, prise deux fois. La question occupait donc la place de la seule
  // qui change quelque chose tous les jours: la LANGUE, dont dépendent
  // l'affichage de l'espace coach, la langue du chat de ses élèves, celle des
  // plans générés et celle des e-mails.
  //
  // Le pays continue d'être écrit — `coach-signup-v1` le valide et la base a son
  // CHECK — mais il est DÉDUIT du fuseau, que cette page connaît déjà
  // (`detectBrowserTimezone`). Voir `keel/api/countryFromTimezone.ts`: ce que la
  // déduction coûte y est écrit noir sur blanc, et le geste juste le jour où
  // l'urgence redevient un sujet est de REPOSER LA QUESTION.
  const [coachLanguage, setCoachLanguage] = useState<UiLocale>(() => chosenUiLocale());
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

  // L'EFFET QUI ÉCRIVAIT `document.title` A DISPARU (2026-08-12). Il posait
  // « Sophia — coach sign in » en dur, en anglais, et seulement en mode coach:
  // c'était un quatrième écrivain pour un attribut qui n'en veut qu'un. Le
  // titre et `lang` sont désormais rendus par `SEO`, comme sur les huit pages
  // publiques, et le titre suit la langue du visiteur.

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
    const msg = t("auth.error.prelaunch_forbidden");
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
    // La seule inscription qui reste ici est celle du coach, dont la langue ne
    // se choisit pas dans le formulaire non plus: elle vient du drapeau en haut
    // de l'écran, prérempli depuis le drapeau (`signupProfileLocale`).
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
  const codeParam = params.get('code');
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
  //
  // ⚠️ LA CLÉ A CHANGÉ DE NAMESPACE (2026-08-12), ET C'ÉTAIT NÉCESSAIRE.
  // C'était `server_unreachable.after_signin` — hors vitrine, donc rendu en
  // ANGLAIS même quand tout le reste de l'écran est en français. Le message le
  // plus délicat de la page (« ton mot de passe est bon, c'est nous ») était
  // exactement celui qui restait dans l'autre langue. Le texte est identique;
  // seul son domicile change. La clé d'origine garde ses autres appelants.
  const navigateHome = async (userId: string): Promise<void> => {
    const home = await resolveHomePath(userId);
    if (home === null) {
      setError(t("auth.error.server_unreachable"));
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
        body: {
          // Le pays DÉDUIT du fuseau que cette page connaît déjà, jamais de la
          // langue: un coach francophone qui exerce à Montréal ne doit pas être
          // rangé en France, et c'est le seul défaut de la déduction qu'on
          // pouvait éviter gratuitement.
          country: declaredCountryFor(detectBrowserTimezone(), coachLanguage),
          display_name: name || undefined,
          locale: signupProfileLocale(coachLanguage),
        },
        headers: requestHeaders(reqId),
      });
      if (coachErr) {
        console.error('[Auth] coach-signup-v1 failed:', coachErr);
        setError(t("auth.error.coach_profile"));
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
        setError(t("auth.confirm.not_verified"));
      }
    } catch (err) {
      console.error('[Auth] Manual check error:', err);
      setVerificationStatus('idle');
      setError(getErrorMessage(err, t("auth.confirm.check_failed")));
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
      // L'indice local est une PHRASE À PART, jamais un morceau collé: le pack
      // français refuse une valeur avec un espace de bord (`parity.int.test.ts`),
      // et une traduction qui doit commencer par un espace est une traduction
      // qu'on écrira faux.
      const sent = t("auth.reset.sent", { email });
      alert(isLocalSupabase ? `${sent} ${t("auth.reset.sent_local")}` : sent);
      setIsResettingPassword(false);
    } catch (err: unknown) {
      console.error("Reset error:", err);
      const msg = getErrorMessage(err, t("auth.error.reset_failed"));
      // Supabase Auth returns a generic error when the mailer (SMTP) is misconfigured or unavailable.
      // Make it actionable for ops.
      if (typeof msg === "string" && msg.toLowerCase().includes("recovery email")) {
        setError(
          t("auth.error.reset_smtp", {
            origin: window.location.origin,
            detail: msg,
          }),
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
          throw new Error(t("auth.error.prelaunch_signup"));
        }
        // --- INSCRIPTION ---

        // Validation CGV/CGU
        if (!hasAcceptedLegal) {
          throw new Error(t("auth.error.legal"));
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
          throw new Error(t("auth.error.student_signup_moved"));
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
                locale: signupProfileLocale(coachLanguage),
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
            // ── LANCEMENT B2C — LE REFUS DE PORTE, ET IL DÉCONNECTE ────────
            // Occulter l'inscription coach ne ferme PAS le monde pro: `/auth`
            // est la porte des deux mondes, et un compte `coaches` déjà créé
            // s'y connecte par ce formulaire-ci, que rien au-dessus ne
            // distingue. C'est la seconde moitié de la fermeture.
            //
            // ⚠️ AVANT TOUT LE RESTE, ET C'EST L'ORDRE QUI COMPTE. Placé plus
            // bas, il laisserait `consumePendingCoachInvitation()` DÉPENSER une
            // invitation au nom d'un compte qu'on s'apprête à déconnecter — un
            // jeton à usage unique brûlé pour rien, et personne pour le
            // rejouer.
            //
            // `signOut` et pas seulement une redirection: la session est déjà
            // ouverte à cet instant. La laisser vivre rendrait `/coach`
            // atteignable en tapant l'URL, c'est-à-dire un refus qui n'a rien
            // refusé. `isProAccessRefused` épargne l'admin interne — voir sa
            // note dans `keel/api/postLogin.ts`.
            if (await isProAccessRefused(data.user.id)) {
              await supabase.auth.signOut();
              throw new Error(t("auth.error.pro_closed"));
            }
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
      setError(getErrorMessage(err, t("auth.error.generic")));
    } finally {
      setLoading(false);
    }
  };

  const documentTitle = coachSignup ? t("auth.seo.title_coach") : t("auth.seo.title");

  // ---------------------------------------------------------------------------
  // VUE "VÉRIFIEZ VOS EMAILS" (onglet d'origine, avec polling automatique)
  // ---------------------------------------------------------------------------
  if (confirmationPending) {
    return (
      <Shell world={world} title={documentTitle}>
        {verificationStatus === 'verified'
          ? (
            <>
              <Head
                title={t("auth.confirm.verified_title")}
                lede={t("auth.confirm.verified_body")}
              />
              <Sheet label={t("auth.sheet.confirm")}>
                {/* `runPostSignupFlow` can fail AFTER the session exists — a
                    `coach-signup-v1` that never answers, a role lookup that
                    can't reach the backend. It reports that by calling
                    `setError` and returning, and this screen used to render the
                    spinner and nothing else: the message was set, invisible,
                    and the page spun forever on an account that was in fact
                    created. An error set on this branch has to be shown ON this
                    branch, with a way to retry, or it is not an error report at
                    all. */}
                {error
                  ? (
                    <div className="space-y-5">
                      <ErrorNote>{error}</ErrorNote>
                      <Button
                        variant="brand"
                        onClick={handleManualVerificationCheck}
                        className="w-full py-3 text-base"
                      >
                        {t("auth.confirm.retry")}
                      </Button>
                    </div>
                  )
                  : (
                    <p className="flex items-center gap-2.5 text-sm text-ink-soft">
                      <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0 text-emerald-700" />
                      {t("auth.confirm.verified_body")}
                      <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin" />
                    </p>
                  )}
              </Sheet>
            </>
          )
          : (
            <>
              <Head
                title={t("auth.confirm.title")}
                lede={t("auth.confirm.body", { email })}
              />
              <Sheet label={t("auth.sheet.confirm")}>
                <div className="space-y-5">
                  {/* EN ATTENTE = BLEU, et c'est le kit d'état du produit
                      (`ui/Badge.tsx`: `info` occupe le bleu). La figue n'entre
                      jamais dans une pastille — CHARTE §2.1. */}
                  <p
                    aria-live="polite"
                    className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700"
                  >
                    <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
                    {verificationStatus === 'checking'
                      ? t("auth.confirm.checking")
                      : t("auth.confirm.waiting")}
                  </p>

                  <Button
                    variant="brand"
                    onClick={handleManualVerificationCheck}
                    disabled={verificationStatus === 'checking'}
                    className="w-full py-3 text-base"
                  >
                    {verificationStatus === 'checking'
                      ? t("auth.confirm.checking")
                      : t("auth.confirm.check_cta")}
                  </Button>

                  {error && <ErrorNote>{error}</ErrorNote>}

                  <p className="text-sm leading-6 text-ink-soft">{t("auth.confirm.spam")}</p>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-5 text-sm">
                    <button
                      type="button"
                      onClick={handleResendConfirmation}
                      disabled={resendCooldown > 0}
                      className="font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800 disabled:cursor-not-allowed disabled:text-ink-soft disabled:no-underline"
                    >
                      {resendCooldown > 0
                        ? t("auth.confirm.resend_wait", { seconds: resendCooldown })
                        : t("auth.confirm.resend")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmationPending(false);
                        setVerificationStatus('idle');
                        setError(null);
                      }}
                      className="text-ink-soft underline underline-offset-2 hover:text-ink"
                    >
                      {t("auth.confirm.change_email")}
                    </button>
                  </div>
                </div>
              </Sheet>
            </>
          )}
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------
  // L'ÉCRAN PRINCIPAL
  // ---------------------------------------------------------------------------

  const headTitle = isResettingPassword
    ? t("auth.reset.title")
    : coachSignup
      ? (isSignUp ? t("auth.coach.signup_title") : t("auth.coach.signin_title"))
      : t("auth.signin.title");

  const headLede = isResettingPassword
    ? t("auth.reset.lede")
    : coachSignup
      ? (isSignUp ? t("auth.coach.signup_lede") : t("auth.coach.signin_lede"))
      : t("auth.signin.lede");

  const sheetLabel = isResettingPassword
    ? t("auth.sheet.reset")
    : coachSignup
      ? t("auth.sheet.coach")
      : t("auth.sheet.signin");

  return (
    <Shell world={world} title={documentTitle}>
      <Head title={headTitle} lede={headLede} />

      {prelaunchLockdown && !isResettingPassword && (
        <p className="mt-5 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
          {t("auth.prelaunch.badge")}
        </p>
      )}
      {debug && (
        // Relevé de configuration, gaté sur `?debug=1`. Pas de `t()`: il n'y a
        // aucune phrase ici, seulement le nom d'une variable d'environnement et
        // sa valeur. Traduire un identifiant le rendrait faux.
        <p className="mt-3 break-all font-mono text-xs text-ink-soft">
          VITE_PRELAUNCH_LOCKDOWN="{prelaunchRaw}" · prelaunchLockdown={String(prelaunchLockdown)}
        </p>
      )}

      <Sheet label={sheetLabel}>
        {isResettingPassword
          ? (
            /* --- FORMULAIRE MOT DE PASSE OUBLIÉ --- */
            <form className="space-y-5" onSubmit={handleResetPassword}>
              <Field label={t("auth.field.email")} htmlFor="auth-reset-email">
                <input
                  id="auth-reset-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={controlClass}
                />
              </Field>

              {error && <ErrorNote>{error}</ErrorNote>}

              <Button
                type="submit"
                variant="brand"
                disabled={loading}
                className="w-full py-3 text-base"
              >
                {loading
                  ? (
                    <>
                      <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                      {t("auth.action.sending")}
                    </>
                  )
                  : t("auth.action.send_link")}
              </Button>

              <p className="text-sm">
                <button
                  type="button"
                  onClick={() => setIsResettingPassword(false)}
                  className="font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
                >
                  {t("auth.action.back_to_signin")}
                </button>
              </p>
            </form>
          )
          : (
            /* --- FORMULAIRE AUTHENTIFICATION (LOGIN / SIGNUP) --- */
            <form className="space-y-5" onSubmit={handleAuth}>
              {/* Champ NOM (Seulement si Inscription — donc seulement en mode
                  coach: hors `?role=coach`, l'effet ci-dessus remet `isSignUp`
                  à false à chaque rendu). */}
              {isSignUp && !prelaunchLockdown && (
                <Field
                  label={t("auth.field.name")}
                  htmlFor="auth-name"
                  hint={coachSignup ? t("auth.field.name_hint") : undefined}
                >
                  <input
                    id="auth-name"
                    type="text"
                    required={isSignUp}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={controlClass}
                  />
                </Field>
              )}

              <Field label={t("auth.field.email")} htmlFor="auth-email">
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={controlClass}
                />
              </Field>

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
                  le numéro déduisait). Voir les destinations en bas de page. */}

              {/* LA LANGUE DU COMPTE. Elle a pris la place du sélecteur de
                  pays, et elle NE RECHARGE PAS — le drapeau de l'en-tête, lui,
                  recharge, et le faire ici détruirait le nom et le mot de passe
                  qu'on vient de taper. Les deux peuvent donc diverger: lire la
                  page en français et vouloir travailler en anglais est un
                  besoin réel. Le champ naît sur le drapeau. */}
              {isSignUp && !prelaunchLockdown && coachSignup && (
                <Field
                  label={t("auth.field.language")}
                  htmlFor="auth-language"
                  hint={t("auth.field.language_hint")}
                >
                  <select
                    id="auth-language"
                    value={coachLanguage}
                    onChange={(e) =>
                      setCoachLanguage(e.target.value === "fr" ? "fr" : "en")}
                    className={controlClass}
                  >
                    {/* Chaque langue nommée DANS sa langue, avec son `lang`. */}
                    <option value="en" lang="en">{t("public.language.en")}</option>
                    <option value="fr" lang="fr">{t("public.language.fr")}</option>
                  </select>
                </Field>
              )}

              <Field label={t("auth.field.password")} htmlFor="auth-password">
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${controlClass} pr-12`}
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-soft transition-colors hover:text-ink"
                    aria-label={showPassword
                      ? t("auth.field.password_hide")
                      : t("auth.field.password_show")}
                  >
                    {showPassword
                      ? <EyeOff aria-hidden className="h-5 w-5" />
                      : <Eye aria-hidden className="h-5 w-5" />}
                  </button>
                </div>
              </Field>

              {!isSignUp && (
                <p className="text-sm">
                  <button
                    type="button"
                    onClick={() => setIsResettingPassword(true)}
                    className="font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
                  >
                    {t("auth.field.forgot")}
                  </button>
                </p>
              )}

              {/* Case à cocher CGV / CGU */}
              {isSignUp && !prelaunchLockdown && (
                <label className="flex items-start gap-3 text-sm leading-6 text-ink">
                  <input
                    id="legal-checkbox"
                    name="legal"
                    type="checkbox"
                    checked={hasAcceptedLegal}
                    onChange={(e) => setHasAcceptedLegal(e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-fig-700 focus:outline-none focus:ring-2 focus:ring-fig-600 focus:ring-offset-2"
                  />
                  <span className="cursor-pointer select-none">
                    {t("auth.legal.prefix")}{" "}
                    <a
                      href="/legal"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
                    >
                      {t("auth.legal.terms")}
                    </a>{" "}
                    {t("auth.legal.and")}{" "}
                    <a
                      href="/legal#confidentialite"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
                    >
                      {t("auth.legal.privacy")}
                    </a>
                    .
                  </span>
                </label>
              )}

              {/* Préférences (inscription uniquement) */}
              {isSignUp && !prelaunchLockdown && (
                <div className="overflow-hidden rounded-card border border-line-strong bg-paper">
                  <button
                    type="button"
                    onClick={() => setPrefsOpen((v) => !v)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-fig-50"
                    aria-expanded={prefsOpen}
                    aria-controls="auth-prefs"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">
                        {t("auth.prefs.title")}
                      </span>
                      <span className="mt-0.5 block break-words text-xs text-ink-soft">
                        {t("auth.prefs.language_value")} ·{" "}
                        {tzFollowDevice
                          ? t("auth.prefs.tz_device", {
                            timezone: detectBrowserTimezone() || timezone || DEFAULT_TIMEZONE,
                          })
                          : t("auth.prefs.tz_profile", {
                            timezone: timezone || DEFAULT_TIMEZONE,
                          })}
                      </span>
                    </span>
                    <span aria-hidden className="shrink-0 text-lg leading-none text-ink-soft">
                      {prefsOpen ? "−" : "+"}
                    </span>
                  </button>

                  {prefsOpen && (
                    <div id="auth-prefs" className="space-y-4 border-t border-line px-4 py-4">
                      <Field
                        label={t("auth.prefs.language")}
                        htmlFor="auth-language"
                        hint={t("auth.prefs.language_hint")}
                      >
                        {/* R3: ui_locale. One locked value: the coach
                            workspace ships in English on every surface. */}
                        <input
                          id="auth-language"
                          type="text"
                          value={t("auth.prefs.language_value")}
                          readOnly
                          className={`${controlClass} bg-paper-2 text-ink-soft`}
                        />
                      </Field>

                      <Field label={t("auth.prefs.timezone")} htmlFor="auth-timezone">
                        <select
                          id="auth-timezone"
                          value={(timezone || "").trim()}
                          onChange={(e) => setTimezone(e.target.value)}
                          className={controlClass}
                        >
                          {supportedTimezones.map((tz) => (
                            <option key={tz} value={tz}>
                              {tz}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <div className="flex items-center justify-between gap-3 rounded-card border border-line px-3 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-ink">
                            {t("auth.prefs.roaming")}
                          </div>
                          <div className="mt-0.5 text-xs leading-5 text-ink-soft">
                            {t("auth.prefs.roaming_hint")}
                          </div>
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
                          className={`h-6 w-11 shrink-0 rounded-full p-1 transition-colors ${
                            tzFollowDevice ? "bg-fig-700" : "bg-line-strong"
                          }`}
                          aria-pressed={tzFollowDevice}
                          aria-label={t("auth.prefs.roaming_toggle")}
                        >
                          <div
                            className={`h-4 w-4 rounded-full bg-paper transition-transform ${
                              tzFollowDevice ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {error && <ErrorNote>{error}</ErrorNote>}

              <Button
                type="submit"
                variant="brand"
                disabled={loading || (isSignUp && !prelaunchLockdown && !hasAcceptedLegal)}
                className="w-full py-3 text-base"
              >
                {loading
                  ? (
                    <>
                      <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                      {t("auth.action.working")}
                    </>
                  )
                  : isSignUp
                    ? t("auth.action.coach_signup")
                    : t("auth.action.signin")}
              </Button>
            </form>
          )}
      </Sheet>

      {/* ── LES DEUX DESTINATIONS ────────────────────────────────────────────
          DEUX GESTES QUI NE FONT PAS LA MÊME CHOSE, ET C'EST LE POINT.
          Côté coach, le basculement inscription/connexion reste LOCAL: le
          formulaire coach vit sur cette page.
          Côté foyer, « créer un compte » est un LIEN vers /start, pas un
          `setIsSignUp(true)`. Deux raisons, et la seconde est un bug qu'on
          éviterait de justesse: (1) l'inscription élève doit demander le PAYS,
          que cette page ne demande pas; (2) le `useEffect` qui suit
          `?role=coach` remet `isSignUp` à false à chaque rendu hors mode coach,
          donc le basculement local n'aurait affiché le formulaire qu'un
          clignement.

          ⚠️ LE MONDE DÉCIDE DE LA MISE EN AVANT, JAMAIS DE L'ACCÈS. Les deux
          destinations sont TOUJOURS atteignables, quel que soit `?w=`: une
          mise en avant qui cache l'autre porte n'est plus une mise en avant,
          c'est un aiguillage — et il se tromperait sur le premier lien mal
          recopié. */}
      {!isResettingPassword && !prelaunchLockdown && (
        <section>
          <Divider>
            {coachSignup
              ? (isSignUp
                ? t("auth.doors.coach_divider_signup")
                : t("auth.doors.coach_divider_signin"))
              : t("auth.doors.divider")}
          </Divider>

          {coachSignup
            ? (
              <>
                <div className="mt-6">
                  <Button
                    variant="secondary"
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="w-full py-3 text-base"
                  >
                    {isSignUp ? t("auth.action.signin") : t("auth.coach_link.cta")}
                  </Button>
                </div>
                {/* KEEL — the two doors reference each other. A coach landing
                    on the consumer form must see their door without guessing a
                    URL, and vice-versa. */}
                <DoorLine
                  prompt={t("auth.coach_link.back_prompt")}
                  to={authHref(world)}
                  cta={t("auth.coach_link.back_cta")}
                />
              </>
            )
            : world === "household"
            ? (
              <>
                <div className="mt-6">
                  <DoorCard
                    label={t("auth.doors.household.label")}
                    body={t("auth.doors.household.body")}
                    to="/start"
                    cta={t("auth.doors.household.cta")}
                  />
                </div>
                {/* LANCEMENT B2C — la passerelle vers l'inscription coach.
                    Elle mène à `?role=coach`, que `proSurfaceHidden` neutralise
                    déjà: sans cette condition, le lien resterait affiché et
                    rendrait le formulaire de connexion ordinaire. Un lien qui
                    ne fait pas ce que son libellé promet est pire qu'un lien
                    absent. */}
                {!proSurfaceHidden && (
                  <DoorLine
                    prompt={t("auth.coach_link.prompt")}
                    to={authHref(world, { role: "coach" })}
                    cta={t("auth.coach_link.cta")}
                  />
                )}
              </>
            )
            : world === "pro"
            ? (
              <>
                <div className="mt-6">
                  <DoorCard
                    label={t("auth.doors.pro.label")}
                    body={t("auth.doors.pro.body")}
                    to={authHref(world, { role: "coach" })}
                    cta={t("auth.coach_link.cta")}
                  />
                </div>
                <DoorLine
                  prompt={t("auth.doors.household.prompt")}
                  to="/start"
                  cta={t("auth.doors.household.cta")}
                />
              </>
            )
            : (
              /* NEUTRE — le comportement d'avant, et celui de tout lien nu vers
                 `/auth`. Les deux mondes à égalité: même cadre, même geste,
                 même poids. */
              <div
                className={`mt-6 grid gap-4 ${
                  proSurfaceHidden ? "" : "sm:grid-cols-2"
                }`}
              >
                <DoorCard
                  label={t("auth.doors.household.label")}
                  body={t("auth.doors.household.body")}
                  to="/start"
                  cta={t("auth.doors.household.cta")}
                />
                {/* LANCEMENT B2C — la porte pro. `sm:grid-cols-2` tombe avec
                    elle: une grille à deux colonnes dont une est vide laisse la
                    porte restante sur une demi-largeur, c'est-à-dire une
                    colonne manquante là où il n'en manque aucune. */}
                {!proSurfaceHidden && (
                  <DoorCard
                    label={t("auth.doors.pro.label")}
                    body={t("auth.doors.pro.body")}
                    to={authHref(world, { role: "coach" })}
                    cta={t("auth.coach_link.cta")}
                  />
                )}
              </div>
            )}
        </section>
      )}
    </Shell>
  );
};

export default Auth;
