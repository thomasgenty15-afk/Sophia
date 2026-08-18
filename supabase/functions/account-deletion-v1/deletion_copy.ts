// SUPPRESSION DE COMPTE — les deux textes que quelqu'un lit en partant.
//
// Même motif que `send-welcome-email/welcome_email.ts` et
// `account-export-v1/export_copy.ts`: des fonctions PURES, deux packs entiers,
// `locale` REQUIS, et un transport qui ne connaît pas la langue.
//
// ⚠️ `index.ts` EST EN `@ts-nocheck`. Le compilateur n'y relit rien: c'est
// précisément pourquoi la copie vit ici, où elle est typée et testable.
//
// ── LES DEUX TEXTES N'ONT PAS LE MÊME DESTINATAIRE ─────────────────────────
//   · l'accusé de suppression part à CELUI QUI SUPPRIME. Il portait la date de
//     purge en français à tout le monde, alors que c'est la seule information
//     du produit qui a une échéance: mal comprise, elle fait rater la fenêtre
//     de sept jours pendant laquelle la suppression est encore annulable.
//   · l'avis de départ du coach part à SES ÉLÈVES — d'autres comptes, avec
//     d'autres langues. Il était anglais en dur, ce qui était le bon défaut
//     pour la moitié d'entre eux et le mauvais pour l'autre.

import { isFrenchLocale } from "../_shared/keel/locale.ts";

/**
 * L'accusé de suppression. TRANSACTIONNEL: il part même à quelqu'un qui avait
 * coupé ses relances — couper les relances n'est pas refuser de savoir que son
 * compte va disparaître.
 *
 * @param purgeDateLabel la date DÉJÀ formatée par l'appelant, dans la même
 *   locale que celle passée ici. Ce module n'a pas d'horloge et n'en veut pas.
 */
export function renderDeletionConfirmedMessage(
  purgeDateLabel: string,
  locale: string,
): string {
  if (isFrenchLocale(locale)) {
    return `C'est fait. Ton compte sera définitivement supprimé le ${purgeDateLabel}. ` +
      `Reconnecte-toi avant cette date si tu veux annuler la suppression. ` +
      `D'ici là, tu ne recevras plus aucun message.`;
  }
  return `It is done. Your account will be permanently deleted on ${purgeDateLabel}. ` +
    `Log back in before that date if you want to cancel the deletion. ` +
    `Until then, you will not receive any more messages.`;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

/**
 * L'avis envoyé aux élèves d'un coach qui ferme son compte (BUILD_PLAN W1.2).
 *
 * Ce qu'il dit ne change pas d'une langue à l'autre, et c'est le point: le plan
 * et les données de l'élève sont À LUI et RESTENT. Une traduction qui
 * adoucirait cette phrase serait une traduction fausse.
 */
export function renderCoachDepartureEmail(
  firstName: string,
  locale: string,
): RenderedEmail {
  const name = String(firstName ?? "").trim();
  if (isFrenchLocale(locale)) {
    return {
      subject: "Ton coach a fermé son compte Sophia",
      html: `
    <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
      <p>${name ? `Bonjour ${name},` : "Bonjour,"}</p>
      <p>Ton coach a fermé son compte Sophia, votre lien de coaching a donc pris
      fin.</p>
      <p><strong>Ton plan et tes données t'appartiennent.</strong> Ils restent dans
      ton compte et sont accessibles exactement comme avant &mdash; rien n'a été
      supprimé, et tu peux tout exporter à tout moment.</p>
      <p>Ton coach n'a plus accès à ton espace. Si tu travailles plus tard avec un
      autre coach, il pourra t'inviter et ton accord te sera redemandé.</p>
      <p>Sophia</p>
    </div>
  `,
    };
  }
  return {
    subject: "Your coach has closed their Sophia account",
    html: `
    <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
      <p>${name ? `Hi ${name},` : "Hi,"}</p>
      <p>Your coach has closed their Sophia account, so your coaching link has ended.</p>
      <p><strong>Your plan and your data belong to you.</strong> They stay in your
      account and remain accessible exactly as before &mdash; nothing has been
      deleted, and you can export everything at any time.</p>
      <p>Your coach no longer has access to your space. If you work with another
      coach later on, they can invite you and you will be asked to consent
      again.</p>
      <p>Sophia</p>
    </div>
  `,
  };
}
