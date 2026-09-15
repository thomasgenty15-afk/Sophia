// KEEL — invitation token primitives. PURE (the only impurity is
// `crypto.getRandomValues` in `generateInviteToken`, which is the point).
//
// Separated from index.ts so they are testable without booting `serve()`.
//
// THE INVARIANT THIS FILE OWNS: the clear token exists in exactly two places —
// the email that carries it, and the browser URL of the person who received
// that email. The database stores only `sha256(token)` hex-encoded, so a dump
// of `coach_invitations` yields nothing usable.
//
// The hash MUST stay byte-identical to `public.coach_invite_token_hash(text)`
// in migration 20260727200000. Both are `encode(sha256(utf8(token)), 'hex')`,
// lowercase. `invite_token_test.ts` pins the TypeScript side against a fixed
// vector; `invitation_rls_test.sql` pins the SQL side against the same one.

import { isFrenchLocale } from "../_shared/keel/locale.ts";

/** 32 bytes of CSPRNG entropy, base64url, unpadded (43 characters). */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** sha256 of the utf8 bytes, lowercase hex. The SQL twin is cited above. */
export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * R7 at the email boundary. `coach_invitations.email` carries a CHECK that the
 * stored value equals `lower(value)` (the citext stand-in of the tenancy
 * migration), so a mixed-case address must be normalised HERE or the insert
 * fails three layers later. Anything that is not a plausible address throws:
 * a silently dropped invitation is an invitation the coach believes they sent.
 */
export function normalizeInviteEmail(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  // Deliberately permissive on the local part and TLD: this is a typo guard,
  // not an RFC 5322 parser. Delivery is the real validator.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value) || value.length > 254) {
    throw new Error(`[keel/invite] not a usable email address: "${String(raw)}"`);
  }
  return value;
}

/** Ephemeral test accounts never receive a real email (send-welcome-email rule). */
export function isEphemeralTestEmail(email: string): boolean {
  return email.endsWith("@example.com");
}

/**
 * The link the student clicks. R7: no silent fallback to a guessed domain —
 * a join URL pointing at the wrong host is a dead invitation that looks sent,
 * so a missing base URL is a configuration error raised at the call.
 */
export function buildJoinUrl(baseUrl: string | undefined | null, token: string): string {
  const base = (baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error(
      "[keel/invite] APP_BASE_URL (or SITE_URL / PUBLIC_SITE_URL) is required to build a join link",
    );
  }
  return `${base}/join?token=${encodeURIComponent(token)}`;
}

/**
 * L'INVITATION — LE SEUL E-MAIL DU PRODUIT DONT LE DESTINATAIRE N'A PAS DE
 * COMPTE, et donc le seul dont la langue ne peut PAS se lire.
 *
 * ── LA CHAÎNE, ET POURQUOI ELLE N'A QUE DEUX MAILLONS ─────────────────────
 *   1. la langue CHOISIE PAR LE COACH pour cette invitation;
 *   2. `en-US`.
 *
 * Il n'y a pas de troisième maillon, et les deux candidats évidents sont
 * écartés exprès:
 *
 *   ❌ `Accept-Language` de la requête. C'est la langue du NAVIGATEUR DU
 *      COACH. Un coach français qui invite un élève anglophone enverrait un
 *      e-mail français à quelqu'un qui ne le lit pas — et le défaut serait
 *      invisible côté coach, qui voit sa propre langue partout.
 *   ❌ `profiles.locale` du coach. Même erreur, par un autre chemin: c'est
 *      encore la langue du coach, pas celle de l'invité.
 *
 * Seul le coach SAIT en quelle langue son élève lit. C'est donc un CHOIX
 * explicite, ou rien. `en-US` par défaut est un aveu assumé, pas une
 * préférence: c'est la langue dans laquelle le produit s'est vendu.
 *
 * ⚠️ CE QUI MANQUE ENCORE, ET QUI EST CÔTÉ FRONT: l'écran d'invitation du
 * coach n'offre aucun sélecteur de langue et ne pose donc jamais
 * `invite_locale`. Tant qu'il ne le fait pas, cette chaîne rend `en-US` pour
 * tout le monde — ce qui est le comportement d'avant, à ceci près que le pack
 * français existe et qu'un seul champ de formulaire l'allume.
 *
 * `locale` est REQUIS: le compilateur énumère ainsi le (seul) appelant.
 */
export function renderInviteEmail(args: {
  coachName: string | null;
  joinUrl: string;
  locale: string;
}): { subject: string; html: string } {
  const named = args.coachName && args.coachName.trim()
    ? args.coachName.trim()
    : null;
  if (isFrenchLocale(args.locale)) {
    const who = named ?? "Ton coach";
    return {
      subject: `${who} t'invite dans son programme`,
      html: `
    <div style="font-family: sans-serif; color: #111; line-height: 1.6;">
      <p>${escapeHtml(who)} t'invite à suivre son programme.</p>
      <p>C'est ton coach qui écrit le plan. Cet espace est l'endroit où il se
         vit : quoi faire aujourd'hui, ce que tu as noté, et comment la semaine
         s'est réellement passée — rien d'inventé, rien de généré à ta place.</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(args.joinUrl)}"
           style="background-color:#111;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">
          Accepter l'invitation
        </a>
      </p>
      <p style="font-size: 13px; color: #666;">
        Ce lien expire dans ${INVITE_TTL_DAYS} jours et ne sert qu'une fois. Si tu
        ne l'attendais pas, ignore cet e-mail — rien n'a été créé en ton nom.
      </p>
    </div>
  `,
    };
  }
  const who = named ?? "Your coach";
  return {
    subject: `${who} invited you to their coaching program`,
    html: `
    <div style="font-family: sans-serif; color: #111; line-height: 1.6;">
      <p>${escapeHtml(who)} invited you to follow their program.</p>
      <p>Your coach writes the plan. This space is where it runs: what to do today,
         what you logged, and how the week actually went — nothing invented,
         nothing generated for you.</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(args.joinUrl)}"
           style="background-color:#111;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">
          Accept the invitation
        </a>
      </p>
      <p style="font-size: 13px; color: #666;">
        This link expires in ${INVITE_TTL_DAYS} days and can be used once. If you were not expecting it,
        ignore this email — nothing was created in your name.
      </p>
    </div>
  `,
  };
}

/**
 * La langue de CETTE invitation, telle que le coach l'a choisie.
 *
 * Deux maillons, jamais trois — le pavé de `renderInviteEmail` dit pourquoi.
 * Une langue non livrée retombe sur `en-US` plutôt que de jeter: une
 * invitation refusée pour cause de tag exotique est un élève qui n'entre
 * jamais, et le coach n'aurait aucun moyen de le savoir.
 */
export function resolveInviteLocale(raw: unknown): string {
  const chosen = typeof raw === "string" ? raw.trim() : "";
  if (!chosen) return "en-US";
  return isFrenchLocale(chosen) ? "fr-FR" : "en-US";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Invitations live 14 days. One place, cited by the email copy above. */
export const INVITE_TTL_DAYS = 14;

/**
 * Window during which a repeat POST reuses the invitation already created
 * instead of minting a second token. This is the double-submit guard; a
 * genuine resend hours later legitimately produces a new token.
 */
export const INVITE_REUSE_WINDOW_SECONDS = 60;
