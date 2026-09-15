// KEEL — LE PREMIER MOT QU'ON ADRESSE À QUELQU'UN, DANS SA LANGUE.
//
// ── LE DÉFAUT QUE CE MODULE FERME ──────────────────────────────────────────
// Cet e-mail était en FRANÇAIS CODÉ EN DUR — sujet compris — alors que le
// produit s'est vendu en anglais pendant tout le pilote. Un coach anglophone
// recevait donc « Bienvenue Sarah ! (Ta conversation est ouverte 👀) » comme
// tout premier contact. Ce n'était pas une dette théorique en attente de la
// version française: c'était un bug vivant, dans l'autre sens.
//
// ── POURQUOI UN MODULE À PART, ET PAS DEUX BRANCHES DANS LE HANDLER ────────
// `sendResendEmail({to, subject, html})` ne change pas: un transport qui
// connaîtrait la langue serait un transport qui DÉCIDE, et il faudrait alors
// lui apprendre chaque nouvelle langue. Ici, la décision est rendue par une
// fonction pure et testable; le handler se contente de lire une locale et de
// poster ce qu'on lui rend.
//
// ── POURQUOI DEUX PACKS ENTIERS, ET PAS DES FRAGMENTS INTERPOLÉS ───────────
// « Bienvenue {prenom} ! » et « Welcome {name}! » diffèrent par l'espace
// insécable avant le point d'exclamation, par la place de la virgule, et par
// le fait qu'en français on tutoie. Composer une phrase par concaténation de
// fragments produit du texte qui se lit comme une machine dans au moins une
// des deux langues.

import { isFrenchLocale } from "../_shared/keel/locale.ts";

export interface WelcomeEmailArgs {
  /**
   * Le prénom, déjà extrait — ou `null` quand le compte n'a pas de nom.
   *
   * ⚠️ `null` ET PAS UN REPLI DE L'APPELANT. Le handler écrivait `"là"` dans ce
   * cas, ce qui donnait « Hello là, » — passable en français, absurde en
   * anglais. Un repli textuel choisi en amont impose sa langue à tous les packs;
   * l'absence, elle, se rend dans chacun.
   */
  firstName: string | null;
  /** L'URL absolue de la conversation. */
  chatUrl: string;
  /**
   * La langue du COMPTE (`profiles.locale`). REQUISE.
   *
   * Optionnelle, elle aurait un défaut — et un défaut de langue est exactement
   * l'épingle que ce chantier retire partout ailleurs.
   */
  locale: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

function shell(body: string): string {
  return `
      <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
${body}
      </div>
    `;
}

function cta(url: string, label: string): string {
  return `        <p style="margin: 20px 0;">
          <a href="${url}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            ${label}
          </a>
        </p>`;
}

/**
 * Le pack FRANÇAIS — GELÉ, mot pour mot, tel qu'il était en dur dans le
 * handler. Il a été écrit par un humain pour être lu par un humain; le
 * réécrire « au passage » remplacerait une voix éprouvée par une paraphrase.
 */
function french(args: WelcomeEmailArgs): RenderedEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: name
      ? `Bienvenue ${name} ! (Ta conversation est ouverte 👀)`
      : "Bienvenue ! (Ta conversation est ouverte 👀)",
    html: shell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>Bienvenue ! Je suis super contente que tu sois là.</p>",
        "",
        "        <p>Tout se passe dans ton espace : nos échanges au quotidien, tes photos",
        "        de repas, tes bilans. Il n'y a rien à installer.</p>",
        "",
        cta(args.chatUrl, "👉 Ouvrir ma conversation"),
        "",
        "        <p>À tout de suite,</p>",
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
    ),
  };
}

/**
 * Le pack ANGLAIS — celui qui MANQUAIT, et que tout le pilote aurait dû avoir.
 *
 * Redérivé du français plutôt que traduit littéralement: l'anglais du produit
 * vouvoie moins mais promet autant, et « Je suis super contente que tu sois
 * là » rendu mot à mot donnerait une phrase que personne n'écrit.
 */
function english(args: WelcomeEmailArgs): RenderedEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: name
      ? `Welcome ${name} — your conversation is open`
      : "Welcome — your conversation is open",
    html: shell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>Welcome. I'm really glad you're here.</p>",
        "",
        "        <p>Everything happens in your space: our day-to-day exchanges, your meal",
        "        photos, your reviews. There is nothing to install.</p>",
        "",
        cta(args.chatUrl, "👉 Open my conversation"),
        "",
        "        <p>Talk soon,</p>",
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
    ),
  };
}

/**
 * `isFrenchLocale` est LE prédicat unique du gel (voir `locale.ts`). Une langue
 * non livrée est déjà ramenée à l'anglais par `clampToDeliveredLocale` en amont
 * de la chaîne, donc « pas français » veut bien dire « anglais » ici.
 */
export function renderWelcomeEmail(args: WelcomeEmailArgs): RenderedEmail {
  return isFrenchLocale(args.locale) ? french(args) : english(args);
}
