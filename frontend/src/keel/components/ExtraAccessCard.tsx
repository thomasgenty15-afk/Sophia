import React from "react";

import {
  claimableMembers,
  type HouseholdView,
  inviteToHousehold,
} from "../api/household";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
import { Field, inputClass } from "./ui/Field";
import { formatPrice } from "../i18n/format";
import { PRICES } from "../i18n/prices";
import { t } from "../i18n/t";
import { edgeRefusalKey } from "../copy/planRefusals";

/**
 * FF-064 — UN ACCÈS PERSONNEL POUR QUELQU'UN D'AUTRE DE LA MAISON.
 *
 * ── CE QUE CETTE CARTE VEND, ET CE QU'ELLE NE PEUT PAS VENDRE ─────────────
 * L'article « profil réclamé » (1,99 €/mois) se facture sur l'abonnement DU
 * MAÎTRE, et sa quantité est DÉRIVÉE, jamais choisie:
 * `keel_household_billable_profiles` compte les lignes membres qui portent un
 * COMPTE, le maître exclu — et son commentaire est explicite: « ne compte NI
 * une bouche sans compte, NI une invitation non réclamée ».
 *
 * ⚠️ CONSÉQUENCE À DIRE PLUTÔT QU'À CACHER, et c'est la phrase
 * `household.extra.when`: sélectionner quelqu'un ici n'ouvre PAS un paiement
 * pour lui. Ça lui envoie une invitation; le montant s'ajoute le jour où elle
 * réclame. Envoyer vers Stripe à la sélection facturerait un accès qui
 * n'existe pas, et la réconciliation mensuelle le retirerait au tour suivant —
 * une ligne de facture qui apparaît puis disparaît est pire qu'une absence.
 *
 * ── UN SEUL COMPOSANT, DEUX ÉCRANS ────────────────────────────────────────
 * Monté sur `/app/billing` (là où on parle d'argent) et sur `/app/household`
 * (là où on décrit les gens). Deux copies de cette prose divergeraient au
 * premier ajustement, et c'est l'écran le moins relu qui aurait tort.
 *
 * ⚠️ LE GESTE PAR LIGNE DE `/app/household` RESTE, et ce n'est pas un doublon
 * accidentel: là-bas on invite LA personne dont on lit la fiche, ici on part
 * du prix et on choisit qui. Même RPC, même refus nommés, deux entrées.
 *
 * ⛔ RIEN POUR UN MEMBRE. `keel_household_invite` refuse `not_owner`, et un
 * contrôle qui échoue à tous les coups est pire qu'un contrôle absent.
 */
export function ExtraAccessCard({
  household,
  viewerIsOwner,
  onInvited,
}: {
  household: HouseholdView | null;
  viewerIsOwner: boolean;
  /**
   * La page relit ses faits: l'invitation qu'on vient de créer en est un.
   *
   * ⚠️ LA SIGNATURE EST COUPÉE EN TROIS LIGNES EXPRÈS. `scripts/ci/i18n-lint.mjs`
   * cherche la prose en dur avec `/>([^<>{}\n]{3,})</`, qui lit
   * `=> void | Promise<void>` comme du texte entre deux balises. Trois fichiers
   * du dépôt portent déjà cette fausse dette dans leur baseline; celui-ci n'a
   * pas à la porter, et la règle ne franchit pas un retour à la ligne.
   */
  onInvited: () =>
    | void
    | Promise<void>;
}) {
  const free = claimableMembers(household);
  const [memberId, setMemberId] = React.useState<string>("");
  const [email, setEmail] = React.useState("");
  const [working, setWorking] = React.useState(false);
  const [token, setToken] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState<string | null>(null);

  if (!household || !viewerIsOwner) return null;

  const target = free.find((m) => m.memberId === memberId) ?? null;
  const link = token === null
    ? null
    : `${globalThis.location?.origin ?? ""}/join-household?token=${token}`;

  async function send() {
    if (!target) return;
    setWorking(true);
    setToken(null);
    setReason(null);
    try {
      const res = await inviteToHousehold(email.trim(), target.memberId);
      if (res.ok) {
        setToken(String(res.token ?? ""));
        await onInvited();
      } else {
        setReason(res.reason);
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card>
      <SectionLabel>{t("household.extra.title")}</SectionLabel>
      {/* ⛔ AUCUN MONTANT RECOPIÉ. La phrase vient de `offer.extra` et le
          chiffre de `PRICES` — la même source que les cinq surfaces de vente.
          C'est la règle D5.8, et le dépôt a déjà payé neuf phrases restées à
          un ancien tarif sur quatre pages. */}
      <p className="text-sm text-ink">
        {t("offer.extra", { amount: formatPrice(PRICES.claimedProfile) })}
      </p>
      <p className="mt-2 text-sm text-ink-soft">{t("household.extra.when")}</p>

      {free.length === 0
        ? <p className="mt-3 text-sm text-ink-soft">{t("household.invite.nobody_left")}</p>
        : (
          <div className="mt-4 flex flex-col gap-3">
            <Field label={t("household.invite.who")} htmlFor="extra-access-who">
              <select
                id="extra-access-who"
                className={inputClass}
                value={memberId}
                onChange={(e) => {
                  setMemberId(e.target.value);
                  setToken(null);
                  setReason(null);
                }}
              >
                <option value="">{t("household.extra.pick")}</option>
                {free.map((m) => (
                  <option key={m.memberId} value={m.memberId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("household.invite.email")} htmlFor="extra-access-email">
              <input
                id="extra-access-email"
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            <Button
              variant="primary"
              disabled={working || !target || email.trim().length === 0}
              onClick={() => void send()}
            >
              {working ? t("household.invite.working") : t("household.invite.submit")}
            </Button>

            {link && target
              ? (
                <div className="rounded-card bg-fig-50 p-3 text-sm text-ink">
                  <p>{t("household.invite.link_ready", { name: target.displayName })}</p>
                  {/* Le lien EN CLAIR, sélectionnable. Un bouton « copier » qui
                      échoue silencieusement (permissions presse-papiers) laisse
                      quelqu'un croire qu'il a le lien. */}
                  <p className="mt-2 break-all font-mono text-[12px] text-ink-soft">{link}</p>
                </div>
              )
              : null}

            {reason
              ? (
                <p className="text-sm text-red-700">
                  {/* Le refus NOMMÉ, jamais le jeton brut. `edgeRefusalKey`
                      rend `null` sur un jeton inconnu — on affiche alors le
                      jeton, ce qui est laid mais vrai. */}
                  {(() => {
                    const key = edgeRefusalKey(reason);
                    return key ? t(key) : reason;
                  })()}
                </p>
              )
              : null}
          </div>
        )}
    </Card>
  );
}

export default ExtraAccessCard;
