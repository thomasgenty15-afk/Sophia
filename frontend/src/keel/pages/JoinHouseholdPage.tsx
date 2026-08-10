import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import SEO from "../../components/SEO";
import { useAuth } from "../../context/AuthContext";
import {
  type HouseholdInvitationPreview,
  joinHousehold,
  previewHouseholdInvitation,
} from "../api/household";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { t } from "../i18n/t";

// KEEL — /join-household?token=… — RÉCLAMER SON PROFIL (chantier foyer, lot 6).
//
// ── CE QUE CETTE PAGE FAIT, ET CE QU'ELLE NE FAIT PAS ──────────────────────
//
// Elle attache un compte à une ligne de foyer QUI EXISTE DÉJÀ. Elle ne crée pas
// de bouche, elle ne rejoint pas un produit: quelqu'un a déjà saisi le prénom,
// l'âge et les contraintes de cette personne, et la réclamation ne fait que
// poser un compte dessus. C'est pour ça que le titre nomme la bouche — « la
// place de Léa » — plutôt que d'annoncer une inscription.
//
// ── POURQUOI ELLE DIT AUSSI CE QU'ELLE NE DONNE PAS ────────────────────────
//
// UNE SEULE PERSONNE GOUVERNE LE MENU. C'est le choix qui évite le marécage
// d'un arbitrage entre un parent et son enfant, et il est INVISIBLE si on ne
// l'écrit pas: quelqu'un qui réclame son profil en croyant pouvoir composer
// découvrirait la vérité par un bouton absent. Le bloc « ce que ça ne donne
// pas » n'est donc pas de la prudence juridique, c'est la moitié de l'offre.
//
// ── LA GARDE DE JETON EST EN BASE, PAS ICI ────────────────────────────────
//
// `keel_household_join` compare l'adresse du compte à celle de l'invitation
// (`email_mismatch`), refuse un jeton déjà servi (`already_used`) et une ligne
// déjà réclamée (`already_claimed`). Cette page n'anticipe rien: elle affiche
// l'aperçu que `keel_household_preview_invitation` rend — trois champs, tous
// déjà entre les mains de qui détient le lien — et laisse la base trancher.
//
// ── LE TROU CONNU, ET IL EST NOMMÉ À L'ÉCRAN ──────────────────────────────
//
// Une personne SANS COMPTE ne peut pas en créer un depuis ici: l'inscription de
// `/auth` est fermée hors mode coach (`isPrelaunchLockdownEnabled`, et le mode
// inscription est gaté sur `?role=coach`), et `/start` attache au coach maison
// — c'est-à-dire une relation de coaching, pas une place à table. Ouvrir une
// porte d'inscription ici serait une décision commerciale, pas une décision
// d'écran. La page le DIT donc, au lieu de mener à un formulaire qui échoue.

type Phase =
  | { kind: "loading" }
  | { kind: "no_token" }
  | { kind: "refused"; reason: string }
  | { kind: "ready"; preview: HouseholdInvitationPreview }
  | { kind: "claiming"; preview: HouseholdInvitationPreview }
  | { kind: "claimed"; preview: HouseholdInvitationPreview };

/**
 * Le motif de refus, traduit — LISTE FERMÉE, comme partout dans cet écran.
 *
 * Un motif inconnu rend `null` et l'écran retombe sur une phrase générique
 * plutôt que d'afficher `already_claimed` à quelqu'un. Le silence force à
 * ajouter l'étiquette au lieu de la tolérer.
 */
function refusalText(reason: string): string | null {
  switch (reason) {
    case "unknown_token":
      return t("household_claim.refused.unknown_token");
    case "expired":
      return t("household_claim.refused.expired");
    case "already_used":
      return t("household_claim.refused.already_used");
    case "already_claimed":
      return t("household_claim.refused.already_claimed");
    case "email_mismatch":
      return t("household_claim.refused.email_mismatch");
    case "already_in_household":
      return t("household_claim.refused.already_in_household");
    case "not_authenticated":
      return t("household_claim.refused.not_authenticated");
    // PAS UN REFUS DE LA BASE: c'est le réseau. Les confondre apprendrait à
    // quelqu'un que son invitation est morte alors qu'elle ne l'est pas.
    case "unreachable":
      return t("household_claim.refused.unreachable");
    default:
      return null;
  }
}

export default function JoinHouseholdPage(): React.ReactElement {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const token = params.get("token") ?? "";

  const [phase, setPhase] = React.useState<Phase>({ kind: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    if (!token) {
      setPhase({ kind: "no_token" });
      return;
    }
    (async () => {
      try {
        const preview = await previewHouseholdInvitation(token);
        if (cancelled) return;
        if (!preview.valid) {
          setPhase({ kind: "refused", reason: preview.reason || "unknown_token" });
          return;
        }
        setPhase({ kind: "ready", preview });
      } catch {
        // Une lecture qui échoue n'est PAS un lien invalide: c'est un réseau qui
        // tombe. Le distinguer évite d'apprendre à quelqu'un que son invitation
        // est morte alors qu'elle ne l'est pas.
        if (!cancelled) setPhase({ kind: "refused", reason: "unreachable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (phase.kind === "loading" || authLoading) {
    return (
      <Frame>
        <p className="text-sm text-gray-500">{t("household_claim.checking")}</p>
      </Frame>
    );
  }

  if (phase.kind === "no_token") {
    return (
      <Frame>
        <h1 className="text-xl font-semibold text-gray-900">
          {t("household_claim.no_token.title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {t("household_claim.no_token.body")}
        </p>
      </Frame>
    );
  }

  if (phase.kind === "refused") {
    return (
      <Frame>
        <h1 className="text-xl font-semibold text-gray-900">
          {t("household_claim.refused.title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {refusalText(phase.reason) ?? t("household_claim.refused.generic")}
        </p>
        {/* Un lien mort n'est pas une impasse: la personne qui a émis ce lien
            peut en émettre un autre en trente secondes. */}
        <p className="mt-4 text-sm leading-6 text-gray-500">
          {t("household_claim.refused.ask_again")}
        </p>
      </Frame>
    );
  }

  if (phase.kind === "claimed") {
    return (
      <Frame>
        <h1 className="text-xl font-semibold text-gray-900">
          {t("household_claim.done.title", { household: phase.preview.householdName })}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {t("household_claim.done.body")}
        </p>
        <Button
          variant="primary"
          className="mt-6"
          onClick={() => navigate("/app/household")}
        >
          {t("household_claim.done.cta")}
        </Button>
      </Frame>
    );
  }

  const preview = phase.preview;
  const busy = phase.kind === "claiming";

  return (
    <Frame>
      <h1 className="text-xl font-semibold text-gray-900">
        {t("household_claim.title", {
          name: preview.firstName,
          household: preview.householdName,
        })}
      </h1>
      <p className="mt-2 text-sm leading-6 text-gray-600">
        {t("household_claim.lead", { name: preview.firstName })}
      </p>

      {/* LES DEUX MOITIÉS, DANS LE MÊME BLOC ET AVEC LE MÊME POIDS. Séparer
          « ce que ça donne » dans le corps et « ce que ça ne donne pas » dans
          une note de bas de page serait vendre l'un et enterrer l'autre. */}
      <div className="mt-6 rounded-lg border border-gray-200">
        <div className="px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            {t("household_claim.gains_label")}
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm leading-6 text-gray-700">
            <li>{t("household_claim.gains_1")}</li>
            <li>{t("household_claim.gains_2")}</li>
            <li>{t("household_claim.gains_3")}</li>
          </ul>
        </div>
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            {t("household_claim.limits_label")}
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm leading-6 text-gray-700">
            <li>{t("household_claim.limits_1")}</li>
            <li>{t("household_claim.limits_2")}</li>
          </ul>
        </div>
      </div>

      {user ? (
        <div className="mt-6">
          <p className="text-sm leading-6 text-gray-600">
            {t("household_claim.signed_in_as", { email: user.email ?? "" })}
          </p>
          <Button
            variant="primary"
            className="mt-3"
            disabled={busy}
            onClick={async () => {
              setPhase({ kind: "claiming", preview });
              try {
                const res = await joinHousehold(token);
                if (res.ok) setPhase({ kind: "claimed", preview });
                else setPhase({ kind: "refused", reason: res.reason });
              } catch {
                setPhase({ kind: "refused", reason: "unreachable" });
              }
            }}
          >
            {busy ? t("household_claim.working") : t("household_claim.submit")}
          </Button>
        </div>
      ) : (
        <div className="mt-6">
          {/* L'ADRESSE EST NOMMÉE, et c'est ce qui évite un compte inutile: la
              base compare l'adresse du compte à celle de l'invitation, et se
              tromper coûte une inscription pour rien. */}
          <p className="text-sm leading-6 text-gray-600">
            {t("household_claim.signed_out.body", { email: preview.email })}
          </p>
          <Button
            variant="primary"
            className="mt-3"
            onClick={() =>
              navigate(
                `/auth?redirect=${
                  encodeURIComponent(`/join-household?token=${token}`)
                }`,
              )}
          >
            {t("household_claim.signed_out.cta")}
          </Button>
          {/* LE TROU, ÉCRIT PLUTÔT QUE CACHÉ. Voir l'en-tête du fichier: il n'y
              a aujourd'hui aucune porte d'inscription pour quelqu'un qui n'a
              qu'une invitation de foyer. Le taire enverrait cette personne
              tourner en rond sur un écran de connexion. */}
          <p className="mt-4 text-sm leading-6 text-gray-500">
            {t("household_claim.signed_out.no_account")}
          </p>
        </div>
      )}
    </Frame>
  );
}

/**
 * Le cadre. NOINDEX, et pas par précaution: toute URL réelle de cette route
 * porte un jeton d'invitation, et une URL indexée est une invitation vivante
 * dans un résultat de recherche. Même raison que /join, même réglage.
 */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SEO
        title={t("household_claim.seo_title")}
        description={t("household_claim.seo_description")}
        robots="noindex,nofollow"
      />
      <PublicHeader audience="student" />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-16">
        <Card className="p-6">{children}</Card>
        <p className="mt-6 text-center text-sm text-gray-500">
          <Link to="/" className="underline">{t("household_claim.home_link")}</Link>
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}
