import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import SEO from "../../components/SEO";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { SIGNUP_COUNTRIES, isDeclaredCountryValid } from "../api/countries";
import { isAlreadyRegistered } from "../api/freeSignup";
import {
  type HouseholdInvitationPreview,
  joinHousehold,
  previewHouseholdInvitation,
} from "../api/household";
import {
  claimRefusalMessageKey,
  householdSignupMetadata,
  isHouseholdSignupOpen,
} from "../api/householdSignup";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";
import { t } from "../i18n/t";

// KEEL — /join-household?token=… — RÉCLAMER SON PROFIL (lot 6, puis chantier 4).
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
// ══════════════════════════════════════════════════════════════════════════
// CHANTIER 4 (D1) — LE TROU EST BOUCHÉ: ON PEUT CRÉER SON COMPTE ICI
// ══════════════════════════════════════════════════════════════════════════
//
// Jusqu'ici cette page DISAIT qu'aucune porte d'inscription n'existait pour
// quelqu'un qui n'a qu'une invitation de foyer. Elle en porte une désormais, et
// tout ce qui suit explique ce qu'elle ne rouvre pas.
//
// ── LE PAYS EST EXIGÉ, ET C'EST LA RAISON D'ÊTRE DU FORMULAIRE ────────────
//
// L'inscription générique a été retirée de `/auth` parce qu'un compte SANS PAYS
// route vers la MAUVAISE HOTLINE DE CRISE: `profiles.country` est lu en premier
// par le résolveur, son absence le fait retomber sur la langue, et `locale`
// vaut `en-US` partout. Rouvrir une porte sans résoudre le pays rouvrirait ce
// défaut — fermé par la migration `20260804180000`.
//
// Donc: sélecteur de pays OBLIGATOIRE, qui démarre VIDE. Pas de « US » par
// défaut comme sur les deux autres portes — un défaut préchoisi enregistre le
// pays de personne, et le piège nommé au chantier est exactement celui-là.
// Et la garde n'est pas à l'écran: `handle_new_user()` REFUSE le compte sans
// pays, `keel_household_join` refuse `country_required`.
//
// ── LE RÔLE: `household_member`, PAS `student` ────────────────────────────
//
// Rien n'écrit `profiles.keel_role` ici. `student` ouvre `/app/today`,
// `/app/chat` et `/app/progress` — trois écrans vides pour qui n'a ni coach ni
// plan. Le palier `household_member` s'écrit tout seul en base au moment de
// l'attachement (trigger de `20260811050000`), et `KeelHouseholdRoute` est la
// garde de navigation posée au lot 6 pour exactement cette population.
//
// ── POURQUOI LA RÉCLAMATION N'EST PAS FAITE À L'INSCRIPTION ───────────────
//
// Le patron du coach (jeton dans les métadonnées, consommé par le trigger de
// signup) serait ici une RÉGRESSION DE SÉCURITÉ: l'aperçu rend l'ADRESSE
// invitée à qui détient le lien, donc un voleur de lien n'aurait qu'à
// s'inscrire avec cette adresse pour rafler la place — sans jamais ouvrir la
// boîte mail. La réclamation exige une SESSION, c'est-à-dire une adresse
// confirmée, et c'est ce qui donne sa valeur à la garde `email_mismatch`.
//
// ── LE VERROU PRÉ-LANCEMENT S'APPLIQUE ────────────────────────────────────
//
// Décision et motif dans `api/householdSignup.ts` (`isHouseholdSignupOpen`).
// En deux mots: une surface de création de compte qui ignore l'interrupteur
// global « le produit est fermé » est un verrou avec un trou invisible. La
// RÉCLAMATION, elle, reste ouverte sous verrou pour qui a déjà un compte.

type Phase =
  | { kind: "loading" }
  | { kind: "no_token" }
  | { kind: "refused"; reason: string }
  | { kind: "ready"; preview: HouseholdInvitationPreview }
  | { kind: "claiming"; preview: HouseholdInvitationPreview }
  | { kind: "claimed"; preview: HouseholdInvitationPreview }
  /** Compte créé, adresse pas encore confirmée: on ne peut pas réclamer. */
  | { kind: "check_email"; preview: HouseholdInvitationPreview };

/**
 * Le pays déclaré du compte connecté.
 *
 * `"unknown"` tant qu'on n'a pas lu, `null` quand la colonne est vide OU quand
 * la lecture a échoué — FAIL-CLOSED VERS LA QUESTION. Ne pas savoir et ne pas
 * demander, c'est laisser passer précisément le compte que ce chantier existe
 * pour attraper; et demander à quelqu'un qui l'a déjà ne coûte qu'un champ,
 * puisque la base n'écrase jamais une déclaration existante.
 */
type DeclaredCountry = "unknown" | string | null;

export default function JoinHouseholdPage(): React.ReactElement {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, prelaunchLockdown } = useAuth();
  const token = params.get("token") ?? "";

  const [phase, setPhase] = React.useState<Phase>({ kind: "loading" });
  const [ownCountry, setOwnCountry] = React.useState<DeclaredCountry>("unknown");

  // Le formulaire d'inscription. Fermé par défaut: la page reste d'abord ce
  // qu'elle est — une réclamation — et l'inscription est la porte du dessous.
  const [signupOpen, setSignupOpen] = React.useState(false);
  const [fullName, setFullName] = React.useState("");
  const [password, setPassword] = React.useState("");
  // ⚠️ VIDE, jamais "US". Voir l'en-tête: un défaut préchoisi enregistre le
  // pays de personne, et c'est la colonne dont dépend la ligne d'écoute servie.
  const [country, setCountry] = React.useState("");
  const [acceptedLegal, setAcceptedLegal] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

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

  // LE PAYS DU COMPTE CONNECTÉ. Lu pour savoir s'il faut le DEMANDER, jamais
  // pour décider à la place de la base: c'est `keel_household_join` qui refuse
  // `country_required`, et cet écran ne fait que lui éviter d'avoir à le dire.
  React.useEffect(() => {
    let cancelled = false;
    if (!user) {
      setOwnCountry("unknown");
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("country")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setOwnCountry(null);
        return;
      }
      const row = data as { country: string | null } | null;
      setOwnCountry(row?.country ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  /** Ce qu'on envoie à la base: rien quand le compte a déjà déclaré son pays. */
  const countryToSend = (): string =>
    typeof ownCountry === "string" && ownCountry !== "unknown" ? "" : country;

  const claim = async (preview: HouseholdInvitationPreview, declared: string) => {
    setPhase({ kind: "claiming", preview });
    try {
      const res = await joinHousehold(token, declared);
      if (res.ok) setPhase({ kind: "claimed", preview });
      else setPhase({ kind: "refused", reason: res.reason });
    } catch {
      setPhase({ kind: "refused", reason: "unreachable" });
    }
  };

  const signUpAndClaim = async (
    event: React.FormEvent,
    preview: HouseholdInvitationPreview,
  ) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (!acceptedLegal) {
        setFormError(t("household_claim.signup.error.legal"));
        return;
      }
      // LA GARDE DE PAYS, CÔTÉ ÉCRAN. Elle ne remplace RIEN: le trigger de
      // signup refuse le compte sans pays et la réclamation refuse
      // `country_required`. Elle est là pour que la personne lise une phrase
      // plutôt qu'une erreur de base de données.
      if (!isDeclaredCountryValid(country)) {
        setFormError(t("household_claim.signup.error.country"));
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        // L'ADRESSE VIENT DE L'INVITATION, pas d'un champ libre. La base
        // compare les deux (`email_mismatch`), donc une adresse choisie à la
        // main ne coûterait qu'un compte inutile.
        email: preview.email,
        password,
        options: {
          // Les clés que `handle_new_user()` lit, construites par un module pur
          // et testé: une faute de frappe sur `country` ou `keel_signup_intent`
          // ne casse rien de VISIBLE ici.
          data: householdSignupMetadata({
            fullName: fullName || preview.firstName,
            country,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
          // On revient sur CE lien: la réclamation est le geste qui reste à
          // faire, et elle a besoin d'une session. Le jeton est déjà entre les
          // mains de la personne — c'est le lien qu'elle vient d'ouvrir — donc
          // le remettre dans l'e-mail de confirmation n'expose rien de neuf.
          emailRedirectTo: `${window.location.origin}/join-household?token=${
            encodeURIComponent(token)
          }`,
        },
      });
      if (error) throw error;

      if (data.user && !data.session) {
        // Confirmation d'e-mail active. On NE réclame PAS: la garde d'adresse
        // ne vaut que parce qu'elle exige une session (voir l'en-tête).
        setPhase({ kind: "check_email", preview });
        return;
      }
      if (data.user) {
        await claim(preview, country);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isAlreadyRegistered(message)) {
        setFormError(t("household_claim.signup.error.existing"));
        return;
      }
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

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
    const key = claimRefusalMessageKey(phase.reason);
    return (
      <Frame>
        <h1 className="text-xl font-semibold text-gray-900">
          {t("household_claim.refused.title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {key ? t(key) : t("household_claim.refused.generic")}
        </p>
        {/* Un lien mort n'est pas une impasse: la personne qui a émis ce lien
            peut en émettre un autre en trente secondes. */}
        <p className="mt-4 text-sm leading-6 text-gray-500">
          {t("household_claim.refused.ask_again")}
        </p>
      </Frame>
    );
  }

  if (phase.kind === "check_email") {
    return (
      <Frame>
        <h1 className="text-xl font-semibold text-gray-900">
          {t("household_claim.signup.check_email.title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {t("household_claim.signup.check_email.body", {
            email: phase.preview.email,
          })}
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
  const mustDeclareCountry = ownCountry === null;

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
          {/* LE PAYS MANQUANT SE DEMANDE ICI, plutôt que de laisser la base
              rendre `country_required` sur un écran sans champ pour y répondre.
              Un refus sans geste de réparation est une impasse. */}
          {mustDeclareCountry && (
            <div className="mt-4">
              <p className="text-sm leading-6 text-gray-600">
                {t("household_claim.country.required_lead")}
              </p>
              <div className="mt-3">
                <CountryField value={country} onChange={setCountry} />
              </div>
            </div>
          )}
          <Button
            variant="primary"
            className="mt-3"
            disabled={
              busy ||
              ownCountry === "unknown" ||
              (mustDeclareCountry && !isDeclaredCountryValid(country))
            }
            onClick={() => claim(preview, countryToSend())}
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

          <div className="mt-8 border-t border-gray-200 pt-6">
            <p className="text-sm leading-6 text-gray-600">
              {t("household_claim.signed_out.or")}
            </p>
            {!isHouseholdSignupOpen(prelaunchLockdown) ? (
              /* LE VERROU PRÉ-LANCEMENT. Il s'applique à cette porte, et il le
                 DIT: un bouton absent sans phrase se lit comme une panne. */
              <p className="mt-2 text-sm leading-6 text-gray-500">
                {t("household_claim.signup.closed")}
              </p>
            ) : signupOpen ? (
              <SignupForm
                preview={preview}
                fullName={fullName}
                setFullName={setFullName}
                password={password}
                setPassword={setPassword}
                country={country}
                setCountry={setCountry}
                acceptedLegal={acceptedLegal}
                setAcceptedLegal={setAcceptedLegal}
                submitting={submitting}
                formError={formError}
                onSubmit={(event) => signUpAndClaim(event, preview)}
              />
            ) : (
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() => {
                  setFullName(preview.firstName);
                  setSignupOpen(true);
                }}
              >
                {t("household_claim.signup.cta")}
              </Button>
            )}
          </div>
        </div>
      )}
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// LE FORMULAIRE
// ---------------------------------------------------------------------------

interface SignupFormProps {
  preview: HouseholdInvitationPreview;
  fullName: string;
  setFullName: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  country: string;
  setCountry: (v: string) => void;
  acceptedLegal: boolean;
  setAcceptedLegal: (v: boolean) => void;
  submitting: boolean;
  formError: string | null;
  onSubmit: (event: React.FormEvent) => void;
}

function SignupForm(props: SignupFormProps): React.ReactElement {
  return (
    <Card className="mt-4 sm:p-6">
      <h2 className="text-base font-semibold text-gray-900">
        {t("household_claim.signup.title", { email: props.preview.email })}
      </h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">
        {t("household_claim.signup.lead")}
      </p>
      <form onSubmit={props.onSubmit} className="mt-4 space-y-4">
        {/* L'ADRESSE EST FIXÉE PAR L'INVITATION. Un champ libre ici ne pourrait
            produire qu'un compte que la base refusera (`email_mismatch`). */}
        <Field
          label={t("household_claim.signup.email_label")}
          htmlFor="hh-email"
          hint={t("household_claim.signup.email_hint")}
        >
          <input
            id="hh-email"
            type="email"
            readOnly
            value={props.preview.email}
            className={`${inputClass} bg-gray-50 text-gray-600`}
          />
        </Field>

        <Field
          label={t("household_claim.signup.name_label")}
          htmlFor="hh-name"
          hint={t("household_claim.signup.name_hint")}
        >
          <input
            id="hh-name"
            type="text"
            required
            autoComplete="name"
            value={props.fullName}
            onChange={(e) => props.setFullName(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field
          label={t("household_claim.signup.password_label")}
          htmlFor="hh-password"
          hint={t("household_claim.signup.password_hint")}
        >
          <input
            id="hh-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={props.password}
            onChange={(e) => props.setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>

        <CountryField value={props.country} onChange={props.setCountry} />

        <label className="flex items-start gap-2 text-sm leading-6 text-gray-600">
          <input
            type="checkbox"
            checked={props.acceptedLegal}
            onChange={(e) => props.setAcceptedLegal(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
          />
          <span>
            {t("household_claim.signup.legal_prefix")}{" "}
            <a
              href="/legal"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-gray-900 underline"
            >
              {t("household_claim.signup.legal_terms")}
            </a>{" "}
            {t("household_claim.signup.legal_and")}{" "}
            <a
              href="/legal#confidentialite"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-gray-900 underline"
            >
              {t("household_claim.signup.legal_privacy")}
            </a>
            .
          </span>
        </label>

        {props.formError && (
          <p className="text-sm text-rose-700">{props.formError}</p>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={props.submitting || !props.acceptedLegal}
          className="w-full"
        >
          {props.submitting
            ? t("household_claim.signup.submitting")
            : t("household_claim.signup.submit")}
        </Button>
      </form>
    </Card>
  );
}

/**
 * LE PAYS — un seul composant pour les deux endroits qui le demandent
 * (l'inscription, et la réparation d'un compte qui n'en a pas).
 *
 * ⚠️ L'OPTION VIDE EST LA VALEUR INITIALE, et c'est la garde: un sélecteur
 * préchargé sur « United States » enregistre le pays de personne. La liste
 * n'est pas une validation — la forme l'est, ici, dans la base, et dans la RPC.
 */
function CountryField(
  { value, onChange }: { value: string; onChange: (v: string) => void },
): React.ReactElement {
  return (
    <Field
      label={t("household_claim.signup.country_label")}
      htmlFor="hh-country"
      hint={t("household_claim.signup.country_hint")}
    >
      <select
        id="hh-country"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        <option value="">{t("household_claim.signup.country_placeholder")}</option>
        {SIGNUP_COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}
          </option>
        ))}
      </select>
    </Field>
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
