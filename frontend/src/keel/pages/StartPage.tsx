import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SEO from "../../components/SEO";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { NO_COUNTRY_SELECTED, SIGNUP_COUNTRIES } from "../api/countries";
import {
  freeSignupMetadata,
  isAlreadyRegistered,
  isDeclaredCountryValid,
  joinRefusalMessageKey,
  signUpOutcome,
} from "../api/freeSignup";
import { resolveHomePath } from "../api/postLogin";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import ServerUnreachable from "../components/ServerUnreachable";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";
import { t } from "../i18n/t";

// KEEL — /start : s'inscrire SEUL, sans coach qui vous pousse.
//
// POURQUOI UNE PAGE, ET PAS UN MODE DE /auth
// ------------------------------------------
// `/auth` est la porte legacy du produit grand public: elle porte la
// confirmation d'email, le reset de mot de passe, le mode coach (?role=coach) et
// jusqu'à ce jour un validateur de numéro FRANÇAIS obligatoire. Tisser une
// troisième variante dans ce fichier, c'est ce que W6.1 a déjà refusé de faire
// pour le coach — et pour la même raison: ce fichier est la porte unique du
// produit, une régression y est une panne totale.
//
// L'inscription libre a besoin de DEUX choses que `/auth` n'a pas: le pays
// déclaré (§2 de la mission, voir plus bas), et de dire ce qu'on rejoint. Elle
// vit donc à côté, et `/auth` perd son inscription générique au lieu de la
// garder cassée.
//
// ── LE PAYS, ET C'EST LA RAISON D'ÊTRE DU SÉLECTEUR ──────────────────────
// Le numéro de téléphone servait à déduire le pays de l'élève, et le pays décide
// de la HOTLINE servie en cas de crise. Il n'y a plus de numéro. Sur le chemin
// d'invitation, la migration 20260804180000 comble le trou avec le pays DÉCLARÉ
// du coach. Ici, il n'y a pas de coach humain à qui l'emprunter: le coach maison
// n'exerce dans aucun pays.
//
// Donc on DEMANDE. Le déduire de la langue, c'est reproduire exactement le
// défaut que cette migration vient de fermer — un élève britannique servi par le
// 3114 français, `fallbackUsed` à faux, et rien pour le signaler. Et le refus
// est côté base: `keel_join_house_coach` rend `country_required` sans pays.
//
// ── CE QUE FAIT LA PAGE, DANS L'ORDRE, ET POURQUOI CET ORDRE ─────────────
// 1. Elle demande à la base si le programme de découverte est publié
//    (`keel_free_signup_available`). Sans cette question, on crée un compte,
//    puis le générateur de semaine rend 409 `coach_has_no_doctrine` — et le
//    testeur juge un produit cassé alors que c'est NOTRE coach maison qui n'est
//    pas prêt. On ne fabrique pas de comptes qui ne peuvent pas marcher.
// 2. Elle explique ce qu'on rejoint AVANT le formulaire. Un inscrit libre n'a
//    pas reçu le mail d'un coach: personne ne lui a dit ce que c'est.
// 3. Elle crée le compte, avec l'intention et le pays dans les métadonnées:
//    `handle_new_user()` rattache DANS la transaction du signup, donc le lien
//    existe déjà quand l'élève ouvre son mail de confirmation.
// 4. Elle REJOUE `keel_join_house_coach()` à la première session. Le
//    rattachement du trigger est best-effort (un échec ne doit pas coûter le
//    compte); ce rejeu est la réparation, et la RPC est idempotente.

/**
 * Pays proposés. NOT une liste de validation — la base valide la FORME
 * (`profiles_country_iso3166_check`), volontairement: une liste fermée
 * refuserait un pays légitime le jour où quelqu'un s'y inscrit.
 *
 * ⚠️ LA LISTE A DÉMÉNAGÉ dans `api/countries.ts` au chantier 4, quand une
 * TROISIÈME porte s'est mise à demander le pays: trois copies d'une même liste
 * divergent, et la divergence porte sur la seule colonne dont dépend la hotline
 * de crise. `pages/Auth.tsx` garde la sienne, et c'est écrit là-bas.
 */
type Phase =
  | { kind: "loading" }
  | { kind: "unavailable" }
  /** Le backend ne répond pas — distinct de `unavailable`, qui est un fait produit. */
  | { kind: "unreachable" }
  | { kind: "form" }
  | { kind: "check_email" }
  | { kind: "existing_account" }
  | { kind: "joined" }
  /** Connecté, sans coach: le chemin de réparation. */
  | { kind: "repair" };

export default function StartPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [phase, setPhase] = React.useState<Phase>({ kind: "loading" });
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  // ⚠️ VIDE, ET C'EST LA GARDE. Ce champ naissait à `"US"`: un compte créé sans
  // y toucher partait avec `profiles.country='US'` — c'est-à-dire la hotline
  // américaine servie à un Français, sous une aide qui promet le contraire.
  // Voir `NO_COUNTRY_SELECTED` (api/countries.ts) pour la mesure et le pourquoi.
  const [country, setCountry] = React.useState(NO_COUNTRY_SELECTED);
  const [acceptedLegal, setAcceptedLegal] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // ── LE VERROU D'ENTRÉE, ET IL VIENT D'UN DÉFAUT MESURÉ ─────────────────
  //
  // TROUVÉ PAR L'ÉPREUVE DE RÉEL (2026-08-05), pas par un test: le parcours
  // navigateur complet, joué de la landing à l'inscription, atterrissait sur
  // `/app/today` — un écran VIDE qui annonce « Your coach is putting it
  // together » — au lieu de l'écran « You're in » et de la conversation.
  //
  // Pourquoi: `signUp` ouvre une session, donc `user` change, donc CET effet se
  // rejoue. Il retrouve alors le lien qui vient d'être créé et prend sa branche
  // « déjà connecté, déjà un coach: je t'emmène dans ton espace ». Cette branche
  // est juste pour un visiteur qui ARRIVE ici avec un compte; appliquée à
  // quelqu'un qui vient de s'inscrire, elle écrase le seul écran qui lui dit
  // quoi faire ensuite.
  //
  // Le verrou: la résolution d'entrée ne s'exécute QU'UNE FOIS, et jamais après
  // que le formulaire a pris la main. Un `useRef` et pas un état: il ne doit
  // provoquer aucun rendu, et il doit être lu de façon synchrone par le rejeu de
  // l'effet — un `useState` serait mis à jour trop tard.
  const entryResolved = React.useRef(false);

  // ── ET SON ANNULATION, QUI DOIT AVOIR LA MÊME PORTÉE QUE LUI ────────────
  //
  // ⚠️ DÉFAUT MESURÉ LE 2026-08-12, ET IL LAISSAIT LA PAGE MORTE.
  // Le verrou ci-dessus est à VIE (une seule résolution par montage). Son
  // annulation, elle, était par EXÉCUTION: un `let cancelled` refermé par le
  // nettoyage de l'effet, qui se rejoue à chaque changement de `user`.
  //
  // La séquence qui tuait l'écran, jouée en cliquant « Create a free account »
  // depuis `/auth`:
  //   1. l'effet part, pose `entryResolved = true`, lance la lecture;
  //   2. `user` change (l'état d'auth se stabilise) ⇒ React rejoue l'effet et
  //      exécute AVANT ça le nettoyage du n°1, qui met `cancelled = true`;
  //   3. le rejeu voit `entryResolved` et sort immédiatement;
  //   4. la lecture du n°1 revient, voit `cancelled`, et sort aussi.
  // Personne n'appelle plus `setPhase`: la page reste sur « Getting things
  // ready… » indéfiniment. Un rechargement direct marchait — l'auth y est
  // stabilisée avant le montage — ce qui rendait le défaut invisible en test
  // et systématique pour un visiteur qui vient de la page de connexion.
  //
  // La réparation n'est pas de retirer le verrou (il corrige le défaut décrit
  // ci-dessus, mesuré lui aussi), mais de faire porter l'annulation par le
  // MONTAGE, comme lui. Un `useRef` posé par un effet sans dépendances: il ne
  // se ferme qu'au démontage réel.
  const unmounted = React.useRef(false);
  React.useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  // ÉTAT D'ENTRÉE. Trois questions dans l'ordre où elles décident de l'écran.
  React.useEffect(() => {
    if (authLoading) return;
    if (entryResolved.current) return;
    entryResolved.current = true;
    (async () => {
      const { data, error } = await supabase.rpc("keel_free_signup_available");
      if (unmounted.current) return;
      if (error || data !== true) {
        // Une lecture qui échoue et un programme non publié donnent le même
        // écran: dans les deux cas on ne peut pas promettre un produit qui
        // marche, et c'est la seule chose que le visiteur a besoin de savoir.
        setPhase({ kind: "unavailable" });
        return;
      }
      if (!user) {
        setPhase({ kind: "form" });
        return;
      }
      // Déjà connecté. A-t-il déjà un coach ? Si oui il a un espace, on l'y
      // envoie plutôt que de lui proposer de s'inscrire une deuxième fois.
      const link = await supabase
        .from("coach_clients")
        .select("id")
        .eq("student_user_id", user.id)
        .in("status", ["invited", "active"])
        .maybeSingle();
      if (unmounted.current) return;
      if (!link.error && link.data) {
        // `null` = aucun rôle n'a pu être lu, le backend ne répond plus. On ne
        // navigue pas vers un repli qui aurait besoin du même backend. Et PAS
        // l'écran `unavailable`: celui-là annonce « l'inscription libre est en
        // pause », ce qui est un fait sur le produit. Une panne de serveur n'en
        // est pas un, et le visiteur repartirait avec une fausse nouvelle.
        const home = await resolveHomePath(user.id);
        if (unmounted.current) return;
        if (home === null) {
          setPhase({ kind: "unreachable" });
          return;
        }
        navigate(home, { replace: true });
        return;
      }
      setPhase({ kind: "repair" });
    })();
    // ⚠️ PAS DE NETTOYAGE QUI ANNULE ICI. Il se rejouerait au prochain
    // changement de `user` et tuerait la seule exécution que le verrou autorise
    // — voir la note au-dessus de `unmounted`. Le démontage est couvert par
    // l'effet sans dépendances.
  }, [authLoading, user, navigate]);

  /** Le rattachement, seul appel qui écrit. Idempotent, rejouable. */
  const joinHouse = async (declaredCountry: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc("keel_join_house_coach", {
      p_country: declaredCountry,
    });
    if (error) return error.message;
    const result = data as { joined: boolean; reason?: string } | null;
    if (result?.joined === true) return null;
    return t(joinRefusalMessageKey(result?.reason));
  };

  const signUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (!acceptedLegal) {
        setFormError(t("start.error.legal"));
        return;
      }
      if (!isDeclaredCountryValid(country)) {
        setFormError(t("start.error.country_required"));
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // LES CLÉS QUE `handle_new_user()` LIT, construites par un module
          // pur et testé (`api/freeSignup.ts`). Elles ne sont pas en ligne ici
          // parce qu'une faute de frappe sur `country` ou sur
          // `keel_signup_intent` ne casse RIEN de visible: le trigger avale
          // l'échec de rattachement par conception, l'écran dit « vous êtes
          // dedans », et l'élève arrive sans coach. Le test est la seule alarme.
          data: freeSignupMetadata({
            fullName,
            country,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
          // La conversation, pas l'écran du jour: un inscrit libre n'a encore
          // rien sur son Today, et la bulle est le seul écran qui lui dit quoi
          // faire. Même arbitrage que /join.
          emailRedirectTo: `${window.location.origin}/app/chat`,
        },
      });
      if (error) throw error;

      // LA BRANCHE EST DEHORS, ET C'EST TOUT L'INTÉRÊT. `enable_confirmations`
      // vaut `false` en local, donc `check_email` ne se joue JAMAIS sur un
      // poste de dev: la seule façon de la vérifier est une table de vérité
      // pure, testée à côté (`api/freeSignup.ts`).
      const outcome = signUpOutcome(data);
      if (outcome === "check_email") {
        // Confirmation d'email active. Le rattachement est DÉJÀ fait: le
        // trigger part à l'INSERT de l'utilisateur auth, pas à l'ouverture de
        // la boîte mail.
        setPhase({ kind: "check_email" });
        return;
      }
      if (outcome === "attach") {
        // Session immédiate: on rejoue la RPC. Elle est idempotente, donc si le
        // trigger a déjà rattaché ceci ne fait rien — et si le trigger a
        // échoué, ceci le répare avant que l'élève ne voie un écran vide.
        const failure = await joinHouse(country);
        if (failure) {
          setFormError(failure);
          return;
        }
        setPhase({ kind: "joined" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isAlreadyRegistered(message)) {
        setPhase({ kind: "existing_account" });
        return;
      }
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const repair = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (!isDeclaredCountryValid(country)) {
        setFormError(t("start.error.country_required"));
        return;
      }
      const failure = await joinHouse(country);
      if (failure) {
        setFormError(failure);
        return;
      }
      setPhase({ kind: "joined" });
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Les états courts
  // -------------------------------------------------------------------------

  if (phase.kind === "loading" || authLoading) {
    return (
      <Notice>
        <p className="text-sm text-gray-500">{t("start.loading")}</p>
      </Notice>
    );
  }

  if (phase.kind === "unreachable") {
    return <ServerUnreachable />;
  }

  if (phase.kind === "unavailable") {
    return (
      <Notice>
        <h1 className="text-xl font-semibold text-gray-900">
          {t("start.unavailable.title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {t("start.unavailable.body")}
        </p>
        <p className="mt-6 text-sm">
          <Link to="/auth" className="font-medium text-gray-900 underline">
            {t("start.have_account_cta")}
          </Link>
        </p>
      </Notice>
    );
  }

  if (phase.kind === "check_email") {
    return <CheckEmailScreen />;
  }

  if (phase.kind === "existing_account") {
    return (
      <Notice>
        <h1 className="text-xl font-semibold text-gray-900">
          {t("start.existing.title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {t("start.existing.body")}
        </p>
        <Button
          variant="primary"
          className="mt-6"
          onClick={() => navigate("/auth?redirect=%2Fstart")}
        >
          {t("start.existing.cta")}
        </Button>
      </Notice>
    );
  }

  if (phase.kind === "joined") {
    return (
      <Notice>
        <h1 className="text-xl font-semibold text-gray-900">
          {t("start.joined.title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {t("start.joined.body")}
        </p>
        <Button variant="primary" className="mt-6" onClick={() => navigate("/app/chat")}>
          {t("start.joined.cta")}
        </Button>
      </Notice>
    );
  }

  // -------------------------------------------------------------------------
  // Les deux surfaces pleines: s'inscrire, ou réparer un compte sans coach
  // -------------------------------------------------------------------------

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <StartSEO />
      <PublicHeader audience="student" />
      <main className="flex-1">
        <section>
          <Column className="pb-12 pt-12 sm:pb-16 sm:pt-20">
            <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight text-gray-900 text-balance sm:text-4xl">
              {t("start.title")}
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600">{t("start.lead")}</p>
          </Column>
        </section>

        <Explanation />

        <Band>
          <h2 className="text-2xl font-semibold leading-tight tracking-tight text-gray-900">
            {phase.kind === "repair" ? t("start.repair.title") : t("start.form.title")}
          </h2>
          {phase.kind === "repair" && (
            <p className="mt-3 text-base leading-7 text-gray-600">
              {t("start.repair.body")}
            </p>
          )}

          <Card className="mt-6 sm:p-6">
            <form
              onSubmit={phase.kind === "repair" ? repair : signUp}
              className="space-y-4"
            >
              {phase.kind === "form" && (
                <>
                  <Field label={t("start.form.name")} htmlFor="start-name">
                    <input
                      id="start-name"
                      type="text"
                      required
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t("start.form.email")} htmlFor="start-email">
                    <input
                      id="start-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field
                    label={t("start.form.password")}
                    htmlFor="start-password"
                    hint={t("start.form.password_hint")}
                  >
                    <input
                      id="start-password"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </>
              )}

              {/* LE PAYS. Demandé, jamais dérivé — voir l'en-tête du fichier.
                  Le `hint` dit à quoi il sert: quelqu'un qui comprend pourquoi
                  on le demande répond juste.

                  L'OPTION VIDE EST LA VALEUR INITIALE, et elle n'est jamais
                  soumissible: `isDeclaredCountryValid` la refuse avant l'appel
                  réseau, et `keel_join_house_coach` rendrait `country_required`
                  si on la laissait passer. Même patron que `/join-household`. */}
              <Field
                label={t("start.form.country")}
                htmlFor="start-country"
                hint={t("start.form.country_hint")}
              >
                <select
                  id="start-country"
                  required
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={inputClass}
                >
                  <option value={NO_COUNTRY_SELECTED}>
                    {t("start.form.country_placeholder")}
                  </option>
                  {SIGNUP_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>

              {phase.kind === "form" && (
                <label className="flex items-start gap-2 text-sm leading-6 text-gray-600">
                  <input
                    type="checkbox"
                    checked={acceptedLegal}
                    onChange={(e) => setAcceptedLegal(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                  />
                  <span>
                    {t("start.form.legal_prefix")}{" "}
                    <a
                      href="/legal"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-gray-900 underline"
                    >
                      {t("start.form.legal_terms")}
                    </a>{" "}
                    {t("start.form.legal_and")}{" "}
                    <a
                      href="/legal#confidentialite"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-gray-900 underline"
                    >
                      {t("start.form.legal_privacy")}
                    </a>
                    .
                  </span>
                </label>
              )}

              {formError && <p className="text-sm text-rose-700">{formError}</p>}

              <Button
                type="submit"
                variant="primary"
                disabled={submitting || (phase.kind === "form" && !acceptedLegal)}
                className="w-full"
              >
                {submitting
                  ? t("start.form.submitting")
                  : phase.kind === "repair"
                    ? t("start.repair.cta")
                    : t("start.form.cta")}
              </Button>

              {phase.kind === "form" && (
                <p className="text-sm leading-6 text-gray-500">
                  {t("start.form.have_account")}{" "}
                  <Link to="/auth" className="font-medium text-gray-900 underline">
                    {t("start.have_account_cta")}
                  </Link>
                  .
                </p>
              )}
            </form>
          </Card>
        </Band>
      </main>
      <PublicFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

/**
 * « VÉRIFIE TES MAILS » — L'ÉCRAN QU'AUCUN POSTE DE DEV NE MONTRE.
 *
 * Extrait du corps de la page, et exporté, pour une raison précise:
 * `enable_confirmations = false` en local, donc `signUp` y ouvre toujours une
 * session et cette phase ne se joue jamais ici. Elle n'existait que par la
 * lecture. Sans hook, sans réseau et sans contexte, elle se rend maintenant
 * dans un test — dans les DEUX langues, parce qu'une garde testée dans une
 * seule ne dit rien de l'autre.
 *
 * ⚠️ Le texte dit que le compte est créé ET DÉJÀ RATTACHÉ. Ce n'est pas une
 * formule rassurante: `handle_new_user()` rattache dans la transaction du
 * signup, pas à l'ouverture de la boîte mail. Écrire « on terminera quand tu
 * reviendras » serait faux, et laisserait croire qu'un mail non ouvert coûte
 * le rattachement.
 */
export function CheckEmailScreen() {
  return (
    <Notice>
      <h1 className="text-xl font-semibold text-gray-900">
        {t("start.check_email.title")}
      </h1>
      <p className="mt-2 text-sm leading-6 text-gray-600">
        {t("start.check_email.body")}
      </p>
    </Notice>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <StartSEO />
      <PublicHeader audience="student" />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-16">
        <Card className="p-6">{children}</Card>
      </main>
      <PublicFooter />
    </div>
  );
}

/**
 * INDEXABLE, contrairement à /join. Les URL de /join portent un jeton
 * d'invitation vivant dans leur query string, donc une page indexée y serait une
 * invitation dans un résultat de recherche. Ici il n'y a rien à fuiter, et c'est
 * la page qu'un curieux doit pouvoir trouver — la mettre en noindex serait
 * annuler sa raison d'être.
 */
function StartSEO() {
  return (
    <SEO title={t("start.seo_title")} description={t("start.seo_description")} />
  );
}

function Column({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-xl px-5 ${className}`}>{children}</div>;
}

function Band({ children }: { children: React.ReactNode }) {
  return (
    <section className="border-t border-gray-200">
      <Column className="py-12 sm:py-16">{children}</Column>
    </section>
  );
}

/**
 * CE QU'ON REJOINT — et la dernière section est la plus importante.
 *
 * Un inscrit libre n'a pas de coach qui l'attend. Lui vendre l'expérience « le
 * programme de votre coach » serait faux, et il le découvrirait au premier
 * échange. La troisième section dit donc explicitement que ce programme est
 * générique et qu'un vrai coach est autre chose — c'est ce qui empêche qu'un
 * testeur rende un avis sur un produit qui n'existe pas.
 */
function Explanation() {
  return (
    <>
      <Band>
        <h2 className="text-2xl font-semibold leading-tight tracking-tight text-gray-900 text-balance">
          {t("start.day.title")}
        </h2>
        <div className="mt-8 space-y-8">
          <Moment title={t("start.day.photo_title")} body={t("start.day.photo_body")} />
          <Moment title={t("start.day.evening_title")} body={t("start.day.evening_body")} />
          <Moment title={t("start.day.week_title")} body={t("start.day.week_body")} />
        </div>
      </Band>

      <section className="bg-gray-950 text-white">
        <Column className="py-14 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            {t("start.limit.kicker")}
          </p>
          <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-balance sm:text-3xl">
            {t("start.limit.title")}
          </h2>
          <p className="mt-4 text-base leading-7 text-gray-300">{t("start.limit.body")}</p>
          <p className="mt-4 text-base leading-7 text-gray-300">{t("start.limit.coach")}</p>
        </Column>
      </section>
    </>
  );
}

function Moment({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-lg font-medium leading-7 text-gray-900 text-balance">{title}</h3>
      <p className="mt-2 text-base leading-7 text-gray-600">{body}</p>
    </div>
  );
}
