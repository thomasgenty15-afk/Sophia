// GOOGLE ADS — LE TAG, SON MODE CONSENTEMENT, ET LA CONVERSION D'INSCRIPTION.
//
// ── L'ORDRE DES GESTES EST LA MOITIÉ DU SUJET ─────────────────────────────
// Consent Mode v2 exige que les défauts soient posés AVANT que le script du
// tag ne s'exécute. Posés après, le tag a déjà eu le temps d'écrire — et un
// bandeau qui demande la permission d'un cookie déjà déposé ne protège rien.
// D'où la séquence, tenue dans `loadTag()`:
//
//   1. `dataLayer` et `gtag` définis à la main;
//   2. `consent default` — TOUT refusé, `wait_for_update: 500`;
//   3. seulement ensuite, le `<script src>` de googletagmanager;
//   4. `consent update` quand (et si) la personne accepte.
//
// ── POURQUOI AUCUN SCRIPT EN LIGNE ────────────────────────────────────────
// ⚠️ LA CSP DE `vercel.json` NE PORTE PAS `'unsafe-inline'` SUR `script-src`,
// et elle ne doit pas l'acquérir. Le fragment que Google fait copier-coller
// dans le `<head>` est un `<script>` en ligne: collé tel quel, il serait
// silencieusement bloqué, et le tag paraîtrait installé sans rien mesurer.
// Tout ce qui est ci-dessous s'exécute depuis le bundle — c'est-à-dire
// `'self'` — et n'injecte qu'une balise avec un `src` externe, ce que la CSP
// autorise nommément.
//
// ── SANS IDENTIFIANT, RIEN NE PART ────────────────────────────────────────
// `VITE_GOOGLE_ADS_ID` absente = ce module ne fait RIEN, et le bandeau ne
// s'affiche pas. C'est ce qui rend ce lot livrable avant que le compte Ads
// existe: aucune ligne à retirer le jour où l'identifiant arrive, une variable
// à poser. Et un environnement de dev ne pollue pas les conversions.

import { consentState, recordConsent, type ConsentChoice } from "./consent";

type GtagArgs = unknown[];

declare global {
  interface Window {
    dataLayer?: GtagArgs[];
    gtag?: (...args: GtagArgs) => void;
  }
}

/** `AW-XXXXXXXXX`. Absente en dev et tant que le compte n'existe pas. */
export function googleAdsId(): string {
  return String(import.meta.env.VITE_GOOGLE_ADS_ID ?? "").trim();
}

/** `AW-XXXXXXXXX/AbCdEfGh` — l'étiquette de la conversion « inscription ». */
function signupConversionLabel(): string {
  return String(import.meta.env.VITE_GOOGLE_ADS_SIGNUP_LABEL ?? "").trim();
}

export function isAdsConfigured(): boolean {
  return googleAdsId() !== "";
}

let tagLoaded = false;

function gtag(...args: GtagArgs): void {
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(args);
}

/**
 * Pose les défauts de consentement et charge le tag. Idempotent.
 *
 * Appelé au démarrage, AVANT toute réponse de la personne: c'est ce qui permet
 * à Google de compter une visite sans cookie (« conversions modélisées ») tout
 * en n'écrivant rien tant que le consentement n'est pas donné. Ne rien charger
 * du tout jusqu'au clic ferait perdre la mesure de ceux qui acceptent.
 */
export function initGoogleAds(): void {
  if (tagLoaded || !isAdsConfigured()) return;
  if (typeof document === "undefined") return;
  tagLoaded = true;

  window.gtag = window.gtag ?? gtag;

  // ⚠️ LES QUATRE SIGNAUX, PAS DEUX. `ad_user_data` et `ad_personalization`
  // sont exigés par Consent Mode v2 depuis mars 2024; un tag qui ne déclare
  // que `ad_storage` et `analytics_storage` est traité comme non conforme dans
  // l'EEE, et les conversions cessent d'être attribuées sans message d'erreur.
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    // Laisse au bandeau le temps de rendre un choix DÉJÀ enregistré avant que
    // le tag ne décide. Sans ce délai, un visiteur qui avait accepté hier est
    // compté comme refusant pendant les premières centaines de millisecondes.
    wait_for_update: 500,
  });

  gtag("js", new Date());
  gtag("config", googleAdsId());

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleAdsId())}`;
  document.head.appendChild(script);

  // Un choix déjà donné lors d'une visite précédente vaut maintenant.
  const known = consentState();
  if (known) applyConsent(known);
}

/** Transmet le choix au tag. Séparé de son enregistrement, exprès. */
export function applyConsent(choice: ConsentChoice): void {
  if (!isAdsConfigured()) return;
  gtag("consent", "update", {
    ad_storage: choice,
    ad_user_data: choice,
    ad_personalization: choice,
    analytics_storage: choice,
  });
}

/** Le geste du bandeau: on enregistre, puis on transmet. Dans cet ordre. */
export function answerConsent(choice: ConsentChoice): void {
  recordConsent(choice);
  applyConsent(choice);
}

/**
 * LA CONVERSION QUI COMPTE: un compte vient d'être créé.
 *
 * ⚠️ APPELÉE À LA CRÉATION DU COMPTE, PAS À L'ARRIVÉE SUR `/start`. Une
 * conversion posée sur l'affichage de la page compterait chaque curieux et
 * rendrait tout coût par acquisition faux d'un ordre de grandeur — c'est
 * l'erreur la plus courante d'un premier branchement d'Ads.
 *
 * Silencieuse si le consentement n'est pas donné: Google modélise alors la
 * conversion à partir du signal agrégé, ce qui est précisément ce que Consent
 * Mode permet. On n'envoie rien en douce.
 */
export function trackSignupConversion(): void {
  const label = signupConversionLabel();
  if (!isAdsConfigured() || label === "") return;
  if (consentState() !== "granted") return;
  gtag("event", "conversion", { send_to: label });
}
