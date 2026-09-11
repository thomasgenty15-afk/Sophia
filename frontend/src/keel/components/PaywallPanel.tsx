import { Link } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
import { Page } from "./ui/Page";
import { t } from "../i18n/t";

/**
 * « TON FOYER EST EN PAUSE » (chantier 3, D4 · déménagé ici par FF-064).
 *
 * ── CE QUE CE PANNEAU DOIT DIRE, ET DANS CET ORDRE ────────────────────────
 *   1. RIEN N'EST PERDU. C'est la première phrase parce que c'est la première
 *      peur, et parce que c'est vrai: D4 gèle et n'efface jamais. Les huit
 *      bouches, leurs âges, leurs allergies et leurs objectifs sont là.
 *   2. CE QUI S'ARRÊTE, nommément. Une pause qu'on ne délimite pas se lit
 *      comme une panne totale.
 *   3. LE GESTE POUR REPRENDRE. Un écran qui annonce une coupure sans issue
 *      fait ouvrir un ticket au lieu d'un paiement.
 *
 * ── ET CE QU'IL NE DIT PAS ────────────────────────────────────────────────
 * Ni la date de reprise, ni le montant, ni un décompte. La date est derrière
 * le tunnel de Stripe, qui est la source, et l'afficher ici en ferait une
 * seconde — celle qui se trompe le jour où quelqu'un prolonge un essai à la
 * main.
 *
 * ⚠️ LA FRONTIÈRE A ÉTÉ PRÉCISÉE LE 2026-09-09, ET IL FAUT LA LIRE AVANT DE
 * « CORRIGER » L'UNE DES DEUX MOITIÉS. L'interdit ci-dessus vaut pour l'état
 * GELÉ, dont la source est Stripe. AVANT le gel, le décompte est légitime et
 * il est rendu — sur le bandeau et sur `/app/billing` —, parce que sa source
 * est `households.free_until`: NOTRE colonne, lue par la même RPC que le gel.
 * Deux états, une source chacun, aucune seconde autorité.
 *
 * ── LE MEMBRE N'EST PAS LE MAÎTRE ─────────────────────────────────────────
 * Un profil réclamé ne peut PAS reprendre l'abonnement: la carte Stripe est
 * celle du maître (`not_household_owner`, 403). Lui montrer un bouton qui sera
 * refusé serait exactement le défaut que ce chantier retire ailleurs — on lui
 * dit l'état, et à qui s'adresser.
 *
 * ── IL NE MONTE PAS `KeelAppShell`, ET C'EST LE SUJET ─────────────────────
 * Une barre de navigation dont les huit entrées mènent au même mur est une
 * promesse fausse. C'est la doctrine déjà écrite dans `KeelOnboardingGate`
 * (« retirer la navigation de l'écran »), appliquée à l'autre bout du produit.
 *
 * ⚠️ LE LIEN VERS `/account` N'EST PAS DE LA POLITESSE. L'export, la
 * suppression et la restauration de compte sont des droits RGPD: ils doivent
 * rester atteignables d'un foyer impayé. Le retirer ferait du mur une prise
 * d'otage des données.
 */
export function PaywallPanel({ isOwner }: { isOwner: boolean }) {
  const { signOut } = useAuth();

  return (
    <Page width="narrow">
      <div className="flex flex-col gap-4 py-10">
        <Card tone="warning">
          <SectionLabel>{t("app.paywall.title")}</SectionLabel>
          <p className="text-sm text-ink">{t("app.paywall.body")}</p>
          <p className="mt-2 text-sm text-ink">{t("app.paywall.kept")}</p>
          {isOwner
            ? (
              // UNE SEULE ACTION PRINCIPALE, et elle ne part PAS d'ici vers
              // Stripe: elle mène à `/app/billing`. Le geste d'argent a une
              // seule surface, sinon l'état affiché et l'état réel divergent
              // au retour du tunnel.
              <Button
                className="mt-4"
                variant="primary"
                onClick={() => {
                  window.location.assign("/app/billing");
                }}
              >
                {t("app.paywall.cta_billing")}
              </Button>
            )
            : <p className="mt-3 text-sm text-ink">{t("app.paywall.owner_only")}</p>}
        </Card>

        <div className="flex items-center gap-4 px-1 text-sm">
          <Link to="/account" className="text-ink-soft underline decoration-line-strong hover:text-ink">
            {t("app.paywall.account")}
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-ink-soft underline decoration-line-strong transition-colors hover:text-ink"
          >
            {t("shell.nav.sign_out")}
          </button>
        </div>
      </div>
    </Page>
  );
}

export default PaywallPanel;
