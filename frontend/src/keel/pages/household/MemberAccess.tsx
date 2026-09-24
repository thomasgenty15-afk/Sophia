// ⟳ 2026-09-24 — SORTI DE `HouseholdPage.tsx` (découpage, lot 4c), À L'IDENTIQUE.
// L'accès d'une bouche, depuis sa ligne.
// Le fichier d'origine l'atteint par ses imports; il ré-exporte ce qu'il exportait.

import React from "react";
import { type HouseholdMemberView, inviteToHousehold, type LiveInvitation } from "../../api/household";
import { t } from "../../i18n/t";
// ⛔ LE MONTANT EST LU, JAMAIS RECOPIÉ (D5.8): la ligne d'une bouche annonce le
// prix d'un accès personnel avec la MÊME source que les cinq surfaces de vente.
import { formatPrice } from "../../i18n/format";
import { PRICES } from "../../i18n/prices";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Field, inputClass } from "../../components/ui/Field";
import { inviteErrorText } from "./labels.ts";

/**
 * L'ACCÈS D'UNE BOUCHE, DEPUIS SA LIGNE — A5 (§5.5), 2026-09-03.
 *
 * ── ⛔ CE QUI ÉTAIT FAUX AVANT: UN MENU DÉROULANT EN BAS DE PAGE ──────────
 * `InviteCard` demandait « qui invites-tu ? » dans un `<select>`, tout en bas,
 * loin des huit lignes qui portent déjà les prénoms. Trois défauts, et aucun
 * cosmétique:
 *   · la question était DÉJÀ RÉPONDUE par la ligne qu'on regarde;
 *   · la carte ne relisait RIEN: elle n'affichait que le jeton qu'elle venait
 *     de créer, donc une invitation envoyée hier était invisible, et le maître
 *     n'avait aucun moyen de savoir qu'il renvoyait un second lien;
 *   · elle ne disait pas ce que l'accès COÛTE, alors que c'est ce qu'il promet
 *     à quelqu'un en lui écrivant.
 *
 * ── LES TROIS ÉTATS SONT DÉRIVÉS DES FAITS, JAMAIS D'UN DRAPEAU ───────────
 * · `user_id` non nul ⇒ RÉCLAMÉE — « a son accès », et le geste inverse est
 *   « Retirer l'accès » (détacher: la bouche reste à table, avec sa portion et
 *   ses allergies) — distinct de « Retirer du foyer », qui détruit la ligne;
 * · une invitation vivante ⇒ INVITÉE — « envoyée le … à … », et « Renvoyer »;
 * · sinon ⇒ LIBRE — « Inviter ».
 * Un drapeau se désynchronise de la base; ces trois-là ne peuvent pas.
 *
 * ⚠️ `invitations === null` (pas lu) N'EST PAS « personne n'a été invité ». La
 * ligne offre alors « Inviter » sans dater quoi que ce soit: annoncer une
 * absence qu'on n'a pas lue ferait renvoyer un lien à quelqu'un qui vient d'en
 * recevoir un.
 *
 * ── ⛔ AUCUN MONTANT N'EST RECOPIÉ (D5.8) ─────────────────────────────────
 * La phrase vient de `offer.extra` + `PRICES.claimedProfile`, la MÊME source
 * que les cinq surfaces de vente. Le produit a déjà vendu ce même accès 2 € sur
 * deux pages et 1,99 € sur une troisième; le chiffre lui-même reste une
 * décision humaine, prise avant les gestes Stripe — l'écran, lui, ne fait que
 * lire.
 *
 * ⚠️ ET UNE BOUCHE MINEURE EST INVITABLE, comme aujourd'hui. Rien ne
 * l'interdit en base, et facturer l'accès d'un enfant est une décision
 * commerciale NON PRISE (FF-049 §7). La restreindre ici serait la prendre.
 *
 * ⚠️ AUCUN E-MAIL N'EST ENVOYÉ PAR CE PRODUIT (FF-060 R7). L'écran rend le
 * lien, propose de le copier et ouvre un brouillon `mailto:` — c'est le maître
 * qui écrit. En local, `EMAIL_DELIVERY_ENABLED=1` est un pistolet chargé: un
 * envoi depuis ici partirait pour de vrai.
 */
/**
 * ⚠️ EXPORTÉ POUR ÊTRE PROUVÉ, pas pour être réutilisé ailleurs: `HouseholdPage`
 * entier ne se monte pas sous `renderToStaticMarkup`. Voir
 * `pages/memberAccess.int.test.ts`.
 */
export function MemberAccess(
  { member, viewerIsOwner, invitation, invitationsLoaded, busy, onDetach, onInvited }: {
    member: HouseholdMemberView;
    /**
     * QUI REGARDE. REQUIS, jamais optionnel — et ce paramètre-ci a été AJOUTÉ
     * APRÈS COUP, le 2026-09-03, parce qu'il manquait et que TROIS TEXTES
     * affirmaient qu'il était là.
     *
     * ── ⛔ LE DÉFAUT, ET IL EST INSTRUCTIF ────────────────────────────────
     * Ce composant ne recevait AUCUN fait sur son lecteur, et `MemberRow` le
     * montait sans garde. Un membre réclamé lisait donc, sur sa propre ligne,
     * « A son accès » ET un bouton « Retirer son accès » — que
     * `keel_household_detach_member` refuse `not_owner`
     * (`20260811040000_household_detachment.sql:236`). Un bouton mort, à
     * l'endroit exact où le produit promet de ne pas en poser.
     *
     * ⚠️ TROIS AFFIRMATIONS CONCORDANTES, ET AUCUNE N'ÉTAIT VRAIE: l'analyse
     * §5.5 (« le maître seul voit ces boutons »), le journal du lot (« aucun
     * bouton d'invitation, aucun retrait »), et le commentaire de ce fichier
     * au site de montage. Aucun test ne l'a vu non plus — celui qui aurait dû
     * s'appelle « le retrait … sont gardés » et ne listait que
     * `household.member.remove`, jamais `.detach`. Un nom qui couvre deux
     * gestes, une assertion qui n'en vérifie qu'un.
     *
     * Il a fallu MONTER le composant et LIRE le rendu pour le trouver. C'est
     * la seule chose qui ait dit la vérité, et c'est pour ça que la garde est
     * désormais tenue par un cas qui capture le HTML, pas par un commentaire.
     */
    viewerIsOwner: boolean;
    /** L'invitation vivante de CETTE bouche, ou `null`. */
    invitation: LiveInvitation | null;
    /** Faux = la lecture n'a pas eu lieu. REQUIS: voir le pavé. */
    invitationsLoaded: boolean;
    busy: boolean;
    onDetach: () => void;
    /** La page relit ses faits — l'invitation qu'on vient de créer en est un. */
    onInvited: () => void | Promise<void>;
  },
) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState(invitation?.email ?? "");
  const [token, setToken] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // LE MAÎTRE N'A PAS D'ACCÈS À DONNER NI À RETIRER: il EST l'accès.
  if (member.role === "owner") return null;

  const link = token === null
    ? null
    : `${globalThis.location?.origin ?? ""}/join-household?token=${token}`;

  async function send() {
    setWorking(true);
    setToken(null);
    setReason(null);
    setCopied(false);
    try {
      const res = await inviteToHousehold(email.trim(), member.memberId);
      if (res.ok) {
        // LE JETON VIENT DE LA RÉPONSE, et le prénom aussi côté RPC: c'est la
        // ligne que la base a RÉELLEMENT visée, pas celle qu'on croyait viser.
        setToken(String(res.token ?? ""));
        // ON RELIT: l'invitation qu'on vient de créer est un fait de la page,
        // et sans relecture la ligne dirait encore « jamais invitée ».
        await onInvited();
      } else setReason(res.reason);
    } finally {
      setWorking(false);
    }
  }

  // ── ÉTAT ③ · RÉCLAMÉE ─────────────────────────────────────────────────
  if (member.userId) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {/* L'ÉTAT EST UN FAIT, ET IL SE LIT PAR TOUT LE MONDE. « A son accès »
            décrit la ligne, il ne propose rien: le cacher à la personne
            concernée lui retirerait la seule phrase qui lui dise pourquoi elle
            peut éditer sa fiche. */}
        <Badge tone="neutral">{t("household.access.claimed")}</Badge>
        {/* ⛔ LE GESTE, LUI, EST AU MAÎTRE — et la phrase qui l'explique part
            avec lui. `keel_household_detach_member` refuse `not_owner`: rendu à
            un membre, ce bouton est mort, et l'aide à côté décrirait un geste
            qu'il ne peut pas faire. Voir le pavé de la prop. */}
        {viewerIsOwner
          ? (
            <>
              <button
                type="button"
                className="text-ink-soft underline disabled:opacity-50"
                disabled={busy}
                onClick={onDetach}
              >
                {t("household.member.detach")}
              </button>
              <span className="basis-full text-ink-soft">
                {t("household.member.detach_hint")}
              </span>
            </>
          )
          : null}
      </div>
    );
  }

  // ⛔ ET RIEN D'AUTRE POUR UN NON-MAÎTRE. Inviter est `not_owner` comme
  // détacher: sur une ligne encore libre, un membre ne voit ni le bouton, ni la
  // date d'une invitation en cours — ce n'est pas son foyer à administrer.
  if (!viewerIsOwner) return null;

  return (
    <div className="mt-2 flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {/* ⚠️ « INVITÉE LE … » NE S'AFFICHE QUE SI ON A LU. Voir le pavé. */}
        {invitationsLoaded && invitation !== null
          ? (
            <span className="text-ink-soft">
              {t("household.access.invited", {
                date: invitation.createdAt.slice(0, 10),
                email: invitation.email,
              })}
            </span>
          )
          : null}
        <button
          type="button"
          className="text-fig-700 underline disabled:opacity-50"
          disabled={busy}
          onClick={() => setOpen((v) => !v)}
        >
          {invitationsLoaded && invitation !== null
            ? t("household.access.resend")
            : t("household.access.invite")}
        </button>
      </div>

      {open
        ? (
          <div className="flex flex-col gap-2 rounded-card bg-paper-2 p-3">
            {/* CE QUE ÇA DONNE, ET CE QUE ÇA NE DONNE PAS (FF-048 R10). Le
                maître écrit le message d'accompagnement: s'il promet « tu
                pourras composer », la base le démentira et c'est LUI qui aura
                menti. */}
            <p className="text-ink-soft">{t("household.invite.grants")}</p>
            {/* ⛔ LE MONTANT EST LU, JAMAIS RECOPIÉ (D5.8). */}
            <p className="text-ink-soft">
              {t("offer.extra", { amount: formatPrice(PRICES.claimedProfile) })}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              {/* `sm:flex-1` et pas `flex-1`: en `flex-col` sous 640 px, la
                  grandeur s'appliquerait à la HAUTEUR. `min-w-0` va avec, sinon
                  l'enfant refuse de descendre sous son contenu et fait défiler
                  la page à 320 px. */}
              <Field
                label={t("household.invite.email")}
                className="min-w-0 sm:flex-1"
              >
                <input
                  className={`${inputClass} min-w-0`}
                  value={email}
                  type="email"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Button
                size="sm"
                disabled={busy || working || !email.trim()}
                onClick={() => void send()}
              >
                {t("household.invite.submit")}
              </Button>
            </div>

            {/* LE JETON N'EST RENDU QU'UNE FOIS PAR LA RPC — on l'affiche donc
                en entier, et on NOMME la bouche qu'il vise: le maître en émet
                plusieurs dans la même minute, et un lien anonyme part à la
                mauvaise personne. */}
            {link !== null
              ? (
                <div className="flex flex-col gap-2">
                  <p className="text-ink-soft">
                    {t("household.invite.link_ready", {
                      name: member.displayName,
                    })}
                  </p>
                  <code className="block overflow-x-auto rounded-card bg-paper p-2">
                    {link}
                  </code>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="text-fig-700 underline"
                      onClick={() => {
                        // ⚠️ LE PRESSE-PAPIER PEUT NE PAS EXISTER (contexte non
                        // sécurisé, permission refusée): on ne promet « copié »
                        // qu'après coup, et le lien reste sélectionnable
                        // au-dessus dans tous les cas.
                        void navigator.clipboard
                          ?.writeText(link)
                          .then(() => setCopied(true))
                          .catch(() => setCopied(false));
                      }}
                    >
                      {copied
                        ? t("household.access.copied")
                        : t("household.access.copy")}
                    </button>
                    {/* ⛔ `mailto:` OUVRE UN BROUILLON, IL N'ENVOIE RIEN. Ce
                        produit n'envoie aucun e-mail d'invitation (FF-060 R7),
                        et en local une vraie clé Resend est branchée. */}
                    <a
                      className="text-fig-700 underline"
                      href={`mailto:${encodeURIComponent(email.trim())}` +
                        `?subject=${
                          encodeURIComponent(t("household.access.mail_subject"))
                        }&body=${encodeURIComponent(link)}`}
                    >
                      {t("household.access.mail")}
                    </a>
                  </div>
                </div>
              )
              : null}

            {reason !== null
              ? (
                // UN REFUS EST UN ÉTAT: il sort en rouge, sous le geste qui
                // l'a déclenché.
                <p className="text-sm text-red-700">{inviteErrorText(reason)}</p>
              )
              : null}
          </div>
        )
        : null}
    </div>
  );
}
