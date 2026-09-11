/**
 * L'E-MAIL D'INVITATION D'UN FOYER — le rendu, et rien d'autre.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUE CET E-MAIL DOIT DIRE, ET DANS CET ORDRE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. QUI invite, et POUR QUELLE PLACE. « Léa » et le nom du foyer. Un lien
 *      anonyme dans une boîte mail se lit comme un hameçonnage, et c'est le
 *      maître qui en paiera la confiance.
 *   2. CE QUE ÇA DONNE. Sa part du plan, son objectif, sa conversation.
 *   3. ⛔ CE QUE ÇA NE DONNE PAS — et c'est la moitié de l'offre (FF-048 R10).
 *      « Une seule personne gouverne le menu » est INVISIBLE si on ne l'écrit
 *      pas: quelqu'un qui réclame son profil en croyant pouvoir composer
 *      découvrirait la vérité par un bouton absent. L'écran le dit déjà; le
 *      taire ici ferait de l'e-mail la seule surface qui promet trop.
 *   4. La durée du lien, et la sortie: ignorer ne crée rien.
 *
 * ⛔ AUCUN MONTANT. L'accès supplémentaire a un prix, il vit dans `prices.ts`
 * côté écran, et il a déjà changé deux fois en un mois (2 € → 1,99 €). Le
 * recopier ici en ferait une troisième source, dans un message qu'on ne peut
 * plus corriger une fois parti. Le maître sait ce qu'il paie; l'invité n'a pas
 * à l'apprendre par un e-mail dont personne ne relit le chiffre.
 *
 * ⛔ ET LE MOT « KEEL » N'APPARAÎT NULLE PART. C'est un nom de code interne, et
 * la dernière fuite est passée par des données injectées en contexte, pas par
 * du TSX. Un e-mail est une surface lue par un utilisateur.
 */

/** Le lien vit quatorze jours — la valeur de `keel_household_invite`. */
export const HOUSEHOLD_INVITE_TTL_DAYS = 14;

/**
 * La langue de CET e-mail.
 *
 * ⚠️ ELLE PEUT VENIR DU MAÎTRE, ET C'EST LA DIFFÉRENCE AVEC L'INVITATION DU
 * COACH. Là-bas, `resolveInviteLocale` refuse `profiles.locale` de l'émetteur:
 * la langue d'un coach ne dit rien de celle d'un inconnu. Ici l'émetteur et
 * l'invité vivent sous le même toit et mangent à la même table — c'est
 * l'hypothèse la plus sûre disponible, et elle est meilleure que « anglais pour
 * tout le monde ». Un choix explicite passé dans le corps l'emporte quand même.
 *
 * Une langue non livrée retombe sur `en-US` plutôt que de jeter: une invitation
 * refusée pour cause d'étiquette exotique est quelqu'un qui n'entre jamais, et
 * le maître n'aurait aucun moyen de le savoir.
 */
export function resolveHouseholdInviteLocale(...candidates: unknown[]): string {
  for (const raw of candidates) {
    const chosen = typeof raw === "string" ? raw.trim() : "";
    if (!chosen) continue;
    return chosen.toLowerCase().startsWith("fr") ? "fr-FR" : "en-US";
  }
  return "en-US";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderHouseholdInviteEmail(args: {
  /** Le prénom de la BOUCHE, tel qu'il est écrit sur sa ligne. */
  firstName: string | null;
  /** Le prénom du MAÎTRE, ou `null`: on retombe alors sur le foyer. */
  inviterName: string | null;
  /** Le nom du foyer, ou `null`. */
  householdName: string | null;
  claimUrl: string;
  locale: string;
}): { subject: string; html: string } {
  const who = (args.firstName ?? "").trim();
  const inviter = (args.inviterName ?? "").trim();
  const home = (args.householdName ?? "").trim();
  const fr = args.locale.toLowerCase().startsWith("fr");

  if (fr) {
    // ⚠️ LE SUJET NOMME LA MAISON, PAS LE PRODUIT. C'est ce qui distingue cet
    // e-mail d'une publicité dans une boîte de réception.
    const from = inviter || home || "Quelqu'un";
    return {
      subject: home
        ? `${from} t'ouvre un accès au foyer ${home}`
        : `${from} t'ouvre un accès à son foyer`,
      html: `
    <div style="font-family: sans-serif; color: #111; line-height: 1.6;">
      <p>${escapeHtml(from)} a créé ta place à table${
        who ? ` sous le prénom ${escapeHtml(who)}` : ""
      }, et t'ouvre ton propre accès.</p>
      <p>Tu y trouveras <strong>ta part</strong> de ce qui est cuisiné, ton
         objectif à toi, ton suivi, et une conversation où mettre à jour ton
         poids ou dire ce que tu as vraiment mangé.</p>
      <p>Ce que ça ne donne pas, et il vaut mieux le savoir avant de cliquer :
         <strong>tu ne composes pas le menu</strong>. Une seule personne
         gouverne la cuisine du foyer${
        inviter ? `, et c'est ${escapeHtml(inviter)}` : ""
      }. Tu ne peux ni ajouter, ni retirer, ni restreindre qui que ce soit —
         y compris toi.</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(args.claimUrl)}"
           style="background-color:#111;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">
          Réclamer ma place
        </a>
      </p>
      <p style="font-size: 13px; color: #666;">
        Ce lien expire dans ${HOUSEHOLD_INVITE_TTL_DAYS} jours et ne sert
        qu'une fois. Si tu ne l'attendais pas, ignore cet e-mail — rien n'a été
        créé en ton nom.
      </p>
    </div>
  `,
    };
  }

  const from = inviter || home || "Someone";
  return {
    subject: home
      ? `${from} is giving you access to the ${home} household`
      : `${from} is giving you access to their household`,
    html: `
    <div style="font-family: sans-serif; color: #111; line-height: 1.6;">
      <p>${escapeHtml(from)} set up your seat at the table${
      who ? ` under the name ${escapeHtml(who)}` : ""
    }, and is opening your own access to it.</p>
      <p>You will find <strong>your share</strong> of what gets cooked, your own
         goal, your own tracking, and a conversation where you can update your
         weight or say what you actually ate.</p>
      <p>What it does not give you, and it is better to know before you click:
         <strong>you do not compose the menu</strong>. One person runs the
         household kitchen${
      inviter ? `, and that is ${escapeHtml(inviter)}` : ""
    }. You cannot add, remove or restrict anyone — including yourself.</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(args.claimUrl)}"
           style="background-color:#111;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">
          Claim my seat
        </a>
      </p>
      <p style="font-size: 13px; color: #666;">
        This link expires in ${HOUSEHOLD_INVITE_TTL_DAYS} days and can be used
        once. If you were not expecting it, ignore this email — nothing was
        created in your name.
      </p>
    </div>
  `,
  };
}

/**
 * L'URL de réclamation.
 *
 * ⚠️ LE CHEMIN EST `/join-household`, PAS `/join`. Ce sont deux portes: `/join`
 * accepte l'invitation d'un coach, `/join-household` attache un compte à une
 * bouche existante. `matchPath("/join", "/join-household")` rend `null` —
 * vérifié — donc un lien envoyé sur la mauvaise porte ne se rattrape nulle
 * part: il rend un écran qui ne sait pas de quoi il parle.
 */
export function buildClaimUrl(base: string | undefined, token: string): string {
  const root = (base ?? "").trim().replace(/\/+$/, "") || "http://localhost:5173";
  return `${root}/join-household?token=${encodeURIComponent(token)}`;
}
