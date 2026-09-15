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
import { newRequestId, requestHeaders } from '../lib/requestId';
// ── LE KIT, ET C'EST NOUVEAU ICI ──────────────────────────────────────────────
// Cette page n'importait AUCUNE primitive: elle avait sa carte, son bouton et sa
// pastille écrits à la main, en violet — la marque du produit grand public
// supprimé. Les trois primitives ci-dessous portent la charte « la fiche »
// (`docs/keel/CHARTE-VITRINE.md`), donc le rayon, la bordure de contrôle et les
// quatre familles d'état arrivent d'un seul endroit.
//
// ── ⚠️ LES INSÉCABLES DE CETTE PAGE SONT DES ENTITÉS, ET C'EST OBLIGATOIRE ───
// La charte §3 exige une espace insécable U+00A0 avant `:` et `%` et à
// l'intérieur des guillemets français. Mais cette page écrit son français
// DIRECTEMENT dans le JSX (elle n'est pas traduite — signalé au rapport), et la
// règle eslint `no-irregular-whitespace` du dépôt REFUSE un U+00A0 brut dans du
// texte JSX (`skipJSXText` est à `false`; elle l'autorise en revanche dans un
// littéral de chaîne, d'où les prix `'9,90 €'` écrits en U+00A0 réel).
// Donc: `&nbsp;` `&laquo;` `&raquo;` dans le texte JSX. Elles rendent de vrais
// U+00A0 et « » (vérifié au navigateur). ⛔ Ne les remplace ni par une espace
// ordinaire (la charte l'interdit) ni par un U+00A0 brut (le gate le refuse).
// ⛔ Et JAMAIS U+202F: mesuré sans glyphe dans les deux familles.
import { Badge } from '../keel/components/ui/Badge';
import { Button } from '../keel/components/ui/Button';
import { Card } from '../keel/components/ui/Card';

type BillingInterval = 'monthly' | 'yearly';
type PaidTier = 'system' | 'alliance' | 'architecte';
type DowngradeTier = 'system' | 'alliance';

type PendingAction =
  | { kind: 'checkout'; tier: PaidTier; interval: BillingInterval }
  | { kind: 'portal'; tier: DowngradeTier }
  | null;

type SubscriptionWithInterval = {
  interval?: BillingInterval | null;
};

const AUTH_SESSION_TIMEOUT_MS = 10_000;
const CHECKOUT_TIMEOUT_MS = 30_000;

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> => {
  let timeoutId: ReturnType<typeof window.setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          const err = new Error(message) as Error & { status?: number };
          err.name = "FunctionInvokeTimeoutError";
          err.status = 408;
          reject(err);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId != null) window.clearTimeout(timeoutId);
  }
};

const getSupabaseHostForDebug = () => {
  const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  if (!rawUrl.trim()) return "missing VITE_SUPABASE_URL";
  try {
    return new URL(rawUrl).host;
  } catch {
    return "invalid VITE_SUPABASE_URL";
  }
};

const readRedirectUrl = (data: unknown): string | undefined => {
  if (!data || typeof data !== 'object' || !('url' in data)) return undefined;
  const url = (data as { url?: unknown }).url;
  return typeof url === 'string' ? url : undefined;
};

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
};

const UpgradePlan = () => {
  const navigate = useNavigate();
  const { user, subscription, accessTier } = useAuth();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currentTier = accessTier; // single source of truth from profiles.access_tier
  const currentInterval = (subscription as SubscriptionWithInterval | null)?.interval ?? null;
  const rank = (t: string) => (t === "system" ? 1 : t === "alliance" ? 2 : t === "architecte" ? 3 : 0);
  const currentPaidTier = (currentTier === "system" || currentTier === "alliance" || currentTier === "architecte") ? currentTier : "none";
  const isBusy = pendingAction !== null;
  const isCheckoutPending = (tier: PaidTier, interval: BillingInterval) =>
    pendingAction?.kind === 'checkout' && pendingAction.tier === tier && pendingAction.interval === interval;
  const isPortalPending = (tier: DowngradeTier) =>
    pendingAction?.kind === 'portal' && pendingAction.tier === tier;

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
        const { data: sessData } = await supabase.auth.getSession();
        if (!sessData?.session?.access_token) return;
        const reqId = newRequestId();
        await supabase.functions.invoke("stripe-sync-subscription", {
          body: {},
          headers: requestHeaders(reqId),
        });
      } catch {
        // ignore
      } finally {
        window.location.reload();
      }
    })();
  }, [user, currentTier]);

  const startCheckout = async (
    tier: PaidTier,
    interval: BillingInterval,
  ) => {
    setError(null);
    setSuccess(null);
    setPendingAction({ kind: 'checkout', tier, interval });
    const requestId = newRequestId();
    try {
      const { data: sessData } = await withTimeout(
        supabase.auth.getSession(),
        AUTH_SESSION_TIMEOUT_MS,
        "Impossible de lire la session Supabase après 10 secondes.",
      );
      if (!sessData?.session?.access_token) {
        throw new Error("Session expirée. Recharge la page et reconnecte-toi.");
      }
      // Single Stripe-native flow:
      // - no local popups
      // - Stripe Checkout for new subscriptions
      // - Stripe Portal redirection when an active subscription already exists
      const result = await withTimeout(
        supabase.functions.invoke('stripe-create-checkout-session', {
          body: { tier, interval },
          headers: requestHeaders(requestId),
        }),
        CHECKOUT_TIMEOUT_MS,
        "La redirection vers Stripe ne répond pas après 30 secondes.",
      );
      if (result.error) throw result.error;
      const url = readRedirectUrl(result.data);
      if (!url) throw new Error("Checkout URL manquante");
      window.location.href = url;
    } catch (err: unknown) {
      console.warn("[UpgradePlan] checkout redirect failed", {
        requestId,
        tier,
        interval,
        supabaseHost: getSupabaseHostForDebug(),
        error: getErrorMessage(err, "Erreur inconnue"),
      });
      setError(getErrorMessage(err, "Erreur lors de la redirection vers le paiement"));
    } finally {
      setPendingAction(null);
    }
  };

  const scheduleDowngrade = async (tier: DowngradeTier) => {
    setError(null);
    setSuccess(null);
    setPendingAction({ kind: 'portal', tier });
    const requestId = newRequestId();
    try {
      const { data: sessData } = await withTimeout(
        supabase.auth.getSession(),
        AUTH_SESSION_TIMEOUT_MS,
        "Impossible de lire la session Supabase après 10 secondes.",
      );
      if (!sessData?.session?.access_token) {
        throw new Error("Session expirée. Recharge la page et reconnecte-toi.");
      }

      const result = await withTimeout(
        supabase.functions.invoke("stripe-create-portal-session", {
          body: {},
          headers: requestHeaders(requestId),
        }),
        CHECKOUT_TIMEOUT_MS,
        "La redirection vers la facturation ne répond pas après 30 secondes.",
      );
      if (result.error) throw result.error;
      const url = readRedirectUrl(result.data);
      if (!url) throw new Error("Portal URL manquante");
      window.location.href = url;
    } catch (err: unknown) {
      console.warn("[UpgradePlan] billing portal redirect failed", {
        requestId,
        tier,
        supabaseHost: getSupabaseHostForDebug(),
        error: getErrorMessage(err, "Erreur inconnue"),
      });
      setError(getErrorMessage(err, "Erreur lors de la redirection vers la facturation"));
    } finally {
      setPendingAction(null);
    }
  };

  const handleBack = () => {
    navigate('/dashboard'); // Ou précédent
  };

  const systemCheckoutPending = isCheckoutPending('system', billingInterval);
  const allianceCheckoutPending = isCheckoutPending('alliance', billingInterval);
  const architecteCheckoutPending = isCheckoutPending('architecte', billingInterval);
  const systemPortalPending = isPortalPending('system');
  const alliancePortalPending = isPortalPending('alliance');

  return (
    // `bg-paper` + `text-ink`, et la sélection au lavis de la marque: le
    // `selection:bg-violet-100` d'origine était la dernière trace du produit
    // grand public jusque dans le presse-papier de la page.
    <div className="min-h-screen bg-paper text-ink selection:bg-fig-100 selection:text-ink">

      {/* ── LA BARRE ────────────────────────────────────────────────────────
          ⚠️ LE LOGO EN IMAGE A ÉTÉ RETIRÉ ICI, ET C'ÉTAIT UN RELIQUAT RENDU.
          `/apple-touch-icon.png` est l'ANCIEN yin-yang violet du produit grand
          public: aucun `grep violet-` ne le trouve, parce que la marque morte y
          est un PIXEL et pas une classe. Le mot-symbole de la charte le
          remplace — l'équerre collée au nom, comme la barre de `/auth`.
          ⚠️ SIGNALÉ, PAS RÉPARÉ: le fichier reste l'icône d'application et
          l'image `og:` du site (`index.html`, `components/SEO.tsx`,
          `lib/legalEntity.ts` et 4 autres écrans). Hors de ce lot. */}
      <nav className="fixed top-0 z-50 w-full border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:h-20 md:px-6">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex min-w-0 items-center gap-2 text-sm text-ink-soft transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            Retour
          </button>

          {/* ⛔ PAS DE `px-*` SUR CE NŒUD: `.eq` pose son `padding-left` hors
              de toute couche CSS, donc il bat un utilitaire de même
              spécificité et la marge intérieure casse en silence. */}
          <span className="eq shrink-0 font-display text-lg leading-none text-ink">
            Sophia
          </span>

          <div className="w-20 shrink-0" aria-hidden="true" />
        </div>
      </nav>

      {/* HEADER */}
      <div className="px-4 pb-8 pt-28 text-center md:pb-12 md:pt-40">
        {/* ⛔ PAS DE `font-bold` SUR LA DISPLAY: Young Serif n'a qu'une graisse
            et le navigateur l'épaissirait par simulation (charte §3). Et le mot
            « supérieure » perd son `text-violet-600`: il ne marquait ni un
            lien, ni une action, ni un état — la marque morte sur un adjectif. */}
        <h1 className="mx-auto mb-4 max-w-[28ch] text-balance font-display text-title text-ink md:mb-6">
          Passe à la vitesse supérieure
        </h1>
        <p className="mx-auto mb-8 max-w-[62ch] text-lede text-ink-soft">
          Choisis le plan qui correspond à tes ambitions. Change ou annule à tout moment.
        </p>

        {/* ── LE PAS DE FACTURATION ───────────────────────────────────────
            `role="switch"` + `aria-checked` + un nom: l'interrupteur d'origine
            était un `<button>` MUET — aucun texte, aucun `aria-label` — donc
            sans nom accessible.
            Sa piste quitte le violet pour la MARQUE, et sa forme est copiée du
            même contrôle déjà converti dans `pages/Auth.tsx` (l'interrupteur
            d'itinérance): actif `fig-700`, inactif `line-strong` (3,84:1, la
            bordure de contrôle), bouton `paper`. Un interrupteur est un GESTE,
            pas un fait — et le bleu, qui aurait pu sembler neutre, est déjà pris
            par `Badge tone="info"`. */}
        <div className="mb-8 flex flex-wrap items-center justify-center gap-3 md:gap-4">
          <span className={`text-sm ${billingInterval === 'monthly' ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
            Mensuel
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={billingInterval === 'yearly'}
            aria-label="Facturation annuelle"
            onClick={() => setBillingInterval(prev => prev === 'monthly' ? 'yearly' : 'monthly')}
            className={`relative flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors duration-300 ${
              billingInterval === 'yearly' ? 'bg-fig-700' : 'bg-line-strong'
            }`}
          >
            <span className={`h-6 w-6 rounded-full bg-paper transition-transform duration-300 ${
              billingInterval === 'yearly' ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
          <span className={`text-sm ${billingInterval === 'yearly' ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
            {/* La remise est un FAIT DE PRIX, pas un état du système: l'émeraude
                dit « ok » dans tout le produit et n'a rien à dire d'un tarif.
                La distinction passe donc à une FORME — la pastille neutre. */}
            Annuel <Badge tone="neutral" className="ml-1 align-middle">-20&nbsp;%</Badge>
          </span>
        </div>

        {/* ⛔ CES DEUX BANDEAUX SONT DES ÉTATS ET ILS GARDENT LEUR FAMILLE.
            Rouge = échec, il ne bouge pas. Et le succès QUITTE LE VIOLET pour
            l'émeraude: il portait un fait (« c'est passé ») sous la couleur de
            la marque morte — la seule saturée de la page qui disait vraiment
            quelque chose le disait dans la mauvaise langue.
            ⚠️ SIGNALÉ, PAS RÉPARÉ: `setSuccess` n'est jamais appelé avec autre
            chose que `null`, donc ce bandeau ne peut pas s'afficher. */}
        {error && (
          <div className="mx-auto mb-8 max-w-md rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mx-auto mb-8 max-w-md rounded-card border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {success}
          </div>
        )}
      </div>

      {/* PRICING CARDS */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          
          {/* ── OPTION 1: LE SYSTÈME ───────────────────────────────────────
              `Card padded={false}` + un rembourrage interne: la primitive porte
              le rayon (`rounded-card`, 12px, contre `rounded-3xl`) et la bordure
              de CONTRÔLE (`line-strong`, 3,84:1 — `line` est à 1,30:1 et ne
              borde jamais une surface qu'on doit distinguer). L'ombre part avec:
              une fiche technique a des cases TRACÉES, pas des reliefs. */}
          <Card padded={false} className="order-1">
            <div className="p-6 md:p-8">
            <div className="mb-6">
              <div className="flex flex-wrap items-center gap-2">
                {/* Public Sans et pas la display: `text-sub` fait 19,2 px et
                    Young Serif ne descend jamais sous 20 (charte §3). */}
                <h2 className="text-sub font-semibold text-ink">Le Système</h2>
                {/* ⛔ VOICI LA SEULE SATURÉE LÉGITIME DE CETTE PAGE, et c'est
                    une PASTILLE: « votre offre actuelle » est un état du compte,
                    pas de la décoration. Émeraude = ok, et elle ne peut pas être
                    figue — la marque n'entre jamais dans une pastille. */}
                {currentPaidTier === "system" && <Badge tone="positive">Plan actuel</Badge>}
              </div>
              <p className="mt-2 text-sm text-ink-soft md:min-h-[40px]">Pour ceux qui veulent juste la structure et l'outil de pilotage.</p>
            </div>
            <div className="mb-8">
              {/* Le prix en display: c'est le seul chiffre d'une page de vente
                  qui a le droit d'être un titre (`ui/Marketing.tsx`, PriceCard).
                  ⛔ Pas de `tabular-nums`: Young Serif rendrait « 9,90 € » en
                  « 9 ,90 € », la virgule prenant la chasse d'un chiffre. */}
              <span className="whitespace-nowrap font-display text-4xl leading-none text-ink">
                {billingInterval === 'monthly' ? '9,90 €' : '7,90 €'}
              </span>
              <span className="ml-1 text-sm text-ink-soft">/mois</span>
              {/* Le montant annuel est un FAIT DE PRIX. L'émeraude disait « ok »
                  sur un chiffre, ce que la règle de couleur interdit deux fois:
                  un état n'est pas un nombre, et un nombre n'est pas un état. */}
              {billingInterval === 'yearly' && (
                <div className="mt-2 text-sm text-ink-soft">Facturé 94,90&nbsp;€ par an</div>
              )}
            </div>

            {/* `secondary`, ET C'EST LA HIÉRARCHIE DE LA PAGE: une seule action
                marquée par écran. Ici c'est l'offre mise en avant qui la porte
                (le bloc sombre), donc les deux offres latérales sont des
                contours. Le violet partait de toute façon: il marquait bien une
                ACTION, mais avec la marque du produit supprimé. */}
            <Button
                variant="secondary"
                onClick={() => startCheckout('system', billingInterval)}
                disabled={isBusy || (rank(currentPaidTier) > rank("system")) || (currentPaidTier === "system" && currentInterval === billingInterval)}
                className={`mb-8 w-full ${systemCheckoutPending ? "opacity-50" : ""}`}
            >
              {systemCheckoutPending ? (
                "Chargement..."
              ) : (rank(currentPaidTier) > rank("system")) ? (
                <>
                  {/* La coche perd sa vignette violette: elle ne portait aucun
                      état, elle habillait un mot. Le mot suffit. */}
                  <Check className="h-4 w-4 shrink-0" />
                  <span>Inclus</span>
                </>
              ) : (currentPaidTier === "system" && currentInterval === billingInterval) ? (
                <>
                  <Check className="h-4 w-4 shrink-0" />
                  <span>Plan actuel</span>
                </>
              ) : (
                currentPaidTier === "none"
                  ? "Choisir Le Système"
                  : (billingInterval === "yearly" ? "Passer en annuel" : "Passer en mensuel")
              )}
            </Button>

            {/* Downgrade link (only when current plan is above System)
                ⚠️ LE ROUGE AU SURVOL EST PARTI, ET C'EST UN CHOIX: ce lien
                n'annule rien, il OUVRE LE PORTAIL Stripe. Un rouge promettrait
                une destruction que le geste ne fait pas — et le seul vrai geste
                destructeur du produit (« Delete my account ») en a besoin pour
                se distinguer. */}
            {rank(currentPaidTier) > rank("system") && (
              <button
                type="button"
                onClick={() => scheduleDowngrade("system")}
                disabled={isBusy}
                className="-mt-4 mb-6 w-full text-xs text-ink-soft underline decoration-line-strong transition-colors hover:text-ink disabled:opacity-60"
              >
                {systemPortalPending ? "Ouverture..." : "Repasser sur cet abonnement"}
              </button>
            )}

            {/* ── LA LISTE DES FONCTIONNALITÉS ─────────────────────────────
                Une liste EST une liste: `<ul>`/`<li>` au lieu de cinq `div`.
                Et les coches perdent leur violet: une fonctionnalité incluse
                n'est pas un état du système, c'est le contenu de l'offre. Ce qui
                porte l'inclusion, c'est la FORME — l'icône et, pour ce qui est
                exclu, la rature.
                ⚠️ `opacity-50` est retiré des lignes barrées: posé sur
                `slate-400`, il descendait le texte sous le seuil de lecture. La
                rature dit déjà « pas dans cette offre ». */}
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <LayoutDashboard className="h-5 w-5 shrink-0 text-ink-soft" />
                <span className="text-sm text-ink">Dashboard d'Actions dynamique</span>
              </li>
              <li className="flex items-start gap-3">
                <Target className="h-5 w-5 shrink-0 text-ink-soft" />
                <span className="text-sm text-ink">Génération de Plan IA illimitée</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 shrink-0 text-ink-soft" />
                <span className="text-sm text-ink">Suivi des habitudes &amp; tâches</span>
              </li>
              <li className="flex items-start gap-3">
                <X className="h-5 w-5 shrink-0 text-ink-soft" />
                <span className="text-sm text-ink-soft line-through">Sophia au quotidien</span>
              </li>
              <li className="flex items-start gap-3">
                <X className="h-5 w-5 shrink-0 text-ink-soft" />
                <span className="text-sm text-ink-soft line-through">L'Architecte (Identité)</span>
              </li>
            </ul>
            </div>
          </Card>

          {/* ── OPTION 2: L'ALLIANCE — LE BLOC SOMBRE ──────────────────────
              LA CHARTE N'A QU'UN SEUL NOIR, ET IL EST À LA MARQUE: `fig-950`
              (#24101E), « le bloc sombre — UN SEUL PAR PAGE » (charte §2). Il
              remplace `bg-slate-900`, qui était un gris froid à côté d'une page
              tempérée. Son secondaire est `fig-300` (8,06:1 sur ce fond), pas un
              `slate-400` à 2,4:1 — sur le fond d'origine, les lignes barrées en
              `slate-600` étaient à 1,5:1, c'est-à-dire illisibles.
              C'est cette carte qui porte la mise en avant, donc la page n'a pas
              besoin d'une seconde surface pleine. */}
          <section className="relative z-10 order-2 rounded-card border border-fig-800 bg-fig-950 p-6 text-paper md:-translate-y-4 md:p-8">
            {/* ⛔ « Le plus populaire » N'EST PAS UN ÉTAT DU SYSTÈME, c'est un
                libellé commercial. Il devient donc une pastille NEUTRE: la
                figue n'entre jamais dans une pastille, et l'émeraude y dirait
                « ok » à propos de rien. */}
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
              <Badge tone="neutral">Le plus populaire</Badge>
            </div>

            <div className="mb-6">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sub font-semibold text-paper">L'Alliance</h2>
                {currentPaidTier === "alliance" && <Badge tone="positive">Plan actuel</Badge>}
              </div>
              <p className="mt-2 text-sm text-fig-300 md:min-h-[40px]">Le combo parfait&nbsp;: Le système + Ton coach IA proactif.</p>
            </div>
            <div className="mb-8">
              <span className="whitespace-nowrap font-display text-5xl leading-none text-paper">
                {billingInterval === 'monthly' ? '19,90 €' : '15,90 €'}
              </span>
              <span className="ml-1 text-sm text-fig-300">/mois</span>
              {billingInterval === 'yearly' && (
                <div className="mt-2 text-sm text-fig-300">Facturé 189,90&nbsp;€ par an</div>
              )}
            </div>

            {/* ── L'ACTION MARQUÉE DE LA PAGE, ET ELLE EST INVERSÉE ────────
                Un `fig-700` posé sur `fig-950` disparaît: sur le bloc sombre, la
                marque se rend en NÉGATIF — `paper` sur la carte (17,05:1) et un
                libellé `ink` (16,18:1). C'est pour ça que ce bouton n'est pas un
                `<Button variant="primary">`: le kit n'a pas de variante inversée.
                BESOIN DE KIT SIGNALÉ AU RAPPORT.
                L'ombre violette (`shadow-violet-900/50`) part sans remplacement:
                elle ne portait rien. */}
            <button
                type="button"
                onClick={() => startCheckout('alliance', billingInterval)}
                disabled={isBusy || (rank(currentPaidTier) > rank("alliance")) || (currentPaidTier === "alliance" && currentInterval === billingInterval)}
                className={`mb-8 inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  (rank(currentPaidTier) > rank("alliance")) || (currentPaidTier === "alliance" && currentInterval === billingInterval)
                    ? "border border-fig-300 text-paper"
                    : "bg-paper text-ink hover:bg-fig-100"
                } ${allianceCheckoutPending ? "opacity-50" : ""}`}
            >
              {allianceCheckoutPending ? (
                "Chargement..."
              ) : (rank(currentPaidTier) > rank("alliance")) ? (
                <>
                  <Check className="h-4 w-4 shrink-0" />
                  <span>Inclus</span>
                </>
              ) : (currentPaidTier === "alliance" && currentInterval === billingInterval) ? (
                <>
                  <Check className="h-4 w-4 shrink-0" />
                  <span>Plan actuel</span>
                </>
              ) : (
                <>
                  {rank(currentPaidTier) < rank("alliance")
                    ? "Choisir L'Alliance"
                    : (billingInterval === "yearly" ? "Passer en annuel" : "Passer en mensuel")}
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </>
              )}
            </button>

            {/* Downgrade link (only when current plan is Architecte) */}
            {rank(currentPaidTier) > rank("alliance") && (
              <button
                type="button"
                onClick={() => scheduleDowngrade("alliance")}
                disabled={isBusy}
                className="-mt-4 mb-6 w-full text-xs text-fig-300 underline decoration-fig-300 transition-colors hover:text-paper disabled:opacity-60"
              >
                {alliancePortalPending ? "Ouverture..." : "Repasser sur cet abonnement"}
              </button>
            )}

            {/* ⚠️ `animate-pulse` A ÉTÉ RETIRÉ de la ligne « Sophia au
                quotidien »: une icône qui clignote en permanence est du bruit,
                pas une information, et rien ne change à l'écran quand elle
                bat. L'emphase passe à la graisse du texte. */}
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 shrink-0 text-fig-300" />
                <span className="text-sm text-paper">Tout ce qu'il y a dans &laquo;&nbsp;Le Système&nbsp;&raquo;</span>
              </li>
              <li className="flex items-start gap-3">
                <MessageCircle className="h-5 w-5 shrink-0 text-fig-300" />
                <span className="text-sm font-semibold text-paper">Sophia au quotidien (24/7)</span>
              </li>
              <li className="flex items-start gap-3">
                <Zap className="h-5 w-5 shrink-0 text-fig-300" />
                <span className="text-sm text-paper">Suivi proactif &amp; Relances</span>
              </li>
              <li className="flex items-start gap-3">
                <Shield className="h-5 w-5 shrink-0 text-fig-300" />
                <span className="text-sm text-paper">Soutien psychologique &amp; Motivation</span>
              </li>
              <li className="flex items-start gap-3">
                <X className="h-5 w-5 shrink-0 text-fig-300" />
                <span className="text-sm text-fig-300 line-through">L'Architecte (Identité)</span>
              </li>
            </ul>
          </section>

          {/* ── OPTION 3: L'ARCHITECTE ─────────────────────────────────────
              ⛔ LES CINQ AMBRES DE CETTE CARTE PARTENT, ET AUCUNE NE PORTAIT UN
              FAIT. Ambre = ATTENTION dans tout le produit (`Card tone="warning"`,
              `Badge tone="caution"`): quatre icônes de fonctionnalité et un
              libellé en ambre disaient « attention » à propos de ce qu'on ACHÈTE.
              Et le survol de son bouton était en ÉMERAUDE — la couleur de « ok »
              employée comme teinte de marque d'une carte. */}
          <Card padded={false} className="order-3">
            <div className="p-6 md:p-8">
            <div className="mb-6">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sub font-semibold text-ink">L'Architecte</h2>
                {currentPaidTier === "architecte" && <Badge tone="positive">Plan actuel</Badge>}
              </div>
              <p className="mt-2 text-sm text-ink-soft md:min-h-[40px]">Pour ceux qui veulent redéfinir leur identité en profondeur.</p>
            </div>
            <div className="mb-8">
              <span className="whitespace-nowrap font-display text-4xl leading-none text-ink">
                {billingInterval === 'monthly' ? '29,90 €' : '23,90 €'}
              </span>
              <span className="ml-1 text-sm text-ink-soft">/mois</span>
              {billingInterval === 'yearly' && (
                <div className="mt-2 text-sm text-ink-soft">Facturé 286,90&nbsp;€ par an</div>
              )}
            </div>

            <Button
                variant="secondary"
                onClick={() => startCheckout('architecte', billingInterval)}
                disabled={isBusy || (currentPaidTier === "architecte" && currentInterval === billingInterval)}
                className={`mb-8 w-full ${architecteCheckoutPending ? "opacity-50" : ""}`}
            >
              {architecteCheckoutPending ? (
                "Chargement..."
              ) : (currentPaidTier === "architecte" && currentInterval === billingInterval) ? (
                <>
                  <Check className="h-4 w-4 shrink-0" />
                  <span>Plan actuel</span>
                </>
              ) : (
                currentPaidTier === "architecte"
                  ? (billingInterval === "yearly" ? "Passer en annuel" : "Passer en mensuel")
                  : "Choisir L'Architecte"
              )}
            </Button>

            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 shrink-0 text-ink-soft" />
                <span className="text-sm text-ink">Tout ce qu'il y a dans &laquo;&nbsp;L'Alliance&nbsp;&raquo;</span>
              </li>
              <li className="flex items-start gap-3">
                <MessageCircle className="h-5 w-5 shrink-0 text-ink-soft" />
                <span className="text-sm font-semibold text-ink">Messages illimités avec Sophia</span>
              </li>
              <li className="flex items-start gap-3">
                <Brain className="h-5 w-5 shrink-0 text-ink-soft" />
                <span className="text-sm font-semibold text-ink">Module &laquo;&nbsp;Architecte&nbsp;&raquo; Complet</span>
              </li>
              <li className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 shrink-0 text-ink-soft" />
                <span className="text-sm text-ink">Travail sur l'Identité &amp; Vision</span>
              </li>
              <li className="flex items-start gap-3">
                <Target className="h-5 w-5 shrink-0 text-ink-soft" />
                <span className="text-sm text-ink">Déconstruction des blocages</span>
              </li>
            </ul>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
};

export default UpgradePlan;
