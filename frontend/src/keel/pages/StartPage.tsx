import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SEO from "../../components/SEO";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { declaredCountryFor } from "../api/countryFromTimezone";
import {
  freeSignupMetadata,
  isAlreadyRegistered,
  joinRefusalMessageKey,
  signUpOutcome,
} from "../api/freeSignup";
import { resolveHomePath } from "../api/postLogin";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import ServerUnreachable from "../components/ServerUnreachable";
import { Button } from "../components/ui/Button";
import { isProSurfaceHidden } from "../../security/proSurface";
import { OfferLines } from "../components/ui/OfferLines";
import { t } from "../i18n/t";
import { chosenUiLocale, signupProfileLocale } from "../i18n/runtime";
import { type UiLocale } from "../i18n/catalog";

// KEEL — /start : ouvrir un compte de foyer.
//
// ── CE QUE CETTE PAGE A CESSÉ D'ÊTRE (2026-08-12) ────────────────────────
// Elle VENDAIT « le programme de découverte KEEL ». Quelqu'un qui cliquait
// « Commencer » depuis le hall du foyer atterrissait donc sur la page qu'un
// élève invité par un coach retrouve — et elle lui disait, dans cet ordre:
// « Essaie d'abord SANS COACH », puis la boucle quotidienne d'un élève
// (photographier un repas, trois appuis le soir), puis une section titrée
// « Ce programme ne te connaît pas ». C'est le contraire exact de ce que le
// hall promet trois clics plus tôt: un produit qui décrit chaque bouche, ses
// objectifs et ses allergies, et compose la casserole autour d'elles.
// Le nom « KEEL » est INTERNE et affleurait dans `start.seo_title`
// (« Try KEEL ») — c'est-à-dire dans un onglet de navigateur et un résultat de
// recherche.
//
// La vente a eu lieu sur le hall et sur la page segment. Ici on demande un
// compte, et c'est tout. Douze clés sont parties; aucune section d'argument ne
// subsiste. La présentation reprend l'idiome de `/auth` (la fiche à fronton,
// les champs de la charte), parce que ce sont les deux portes d'un même
// produit et qu'elles doivent se lire comme la même société.
//
// ── LES DEUX LIMITES QUI RESTENT, ET QU'ON NE MASQUE PAS ─────────────────
//
// ⚠️ 1. LE MODÈLE EST ENCORE CELUI DE L'ÉLÈVE, SOUS LA COPIE DU FOYER.
// Le compte créé ici part avec `keel_signup_intent = 'student_free'` et se
// rattache au COACH MAISON (`freeSignupMetadata`, puis `keel_join_house_coach`).
// Ça marche — le parcours crée bien le foyer — mais c'est le mauvais modèle
// pour un acheteur B2C: il devient l'élève d'un coach qui n'existe pas.
// Le corriger demande une intention propre côté base (`handle_new_user`), donc
// une MIGRATION. C'est un lot backend, hors du périmètre de ce lot-ci.
// Ce qu'il faut savoir en relisant: LA COPIE A ÉTÉ ALIGNÉE AVANT LE MODÈLE.
// Si tu viens fermer ce trou, c'est ici que la copie t'attend, déjà juste.
//
// ✅ 2. LE PARCOURS D'ENTRÉE EST ATTEINT DEPUIS CETTE PAGE — RÉPARÉ (FF-060).
// ⚠️ CE PARAGRAPHE DÉCRIVAIT UN DÉFAUT VIVANT, ET IL NE L'EST PLUS. Il est
// réécrit plutôt que supprimé, parce qu'un lecteur qui trouve `/app/setup` aux
// deux endroits ci-dessous et un vieux commentaire qui dit « pointe en dur sur
// `/app/chat` » conclut que quelqu'un a cassé quelque chose, et le « répare ».
// Une contrainte documentée survit à sa cause; ce dépôt l'a déjà payé deux fois.
//
// Ce qui était mesuré, et qui est faux aujourd'hui: le bouton de l'état
// `joined` et `emailRedirectTo` pointaient tous deux sur `/app/chat`, et
// `resolveHomePath` savait router un compte sans `student_goals` vers
// `/app/setup` sans qu'aucune garde ne rejoue ce fait à l'arrivée. Un inscrit
// ne voyait donc le couloir qu'à une visite ULTÉRIEURE de `/`.
//
// Les trois pièces qui le ferment, et il faut les trois:
//   · le bouton de l'état `joined` navigue sur `/app/setup` (plus bas);
//   · `emailRedirectTo` pointe sur `/app/setup` (plus bas) — c'est le chemin
//     du lien de confirmation, donc celui de la majorité des inscrits;
//   · `KeelOnboardingGate` REJOUE le fait sur les SEPT routes d'arrivée
//     (`/app/today` `/chat` `/plan` `/progress` `/health` `/household`
//     `/meals`, `App.tsx`). Les deux premières pièces ne suffisaient pas:
//     l'URL reste tapable et un ancien onglet reste ouvert.
//
// ⚠️ RESTE VRAI, ET C'EST VOULU: `KeelAppShell` n'a aucun lien vers
// `/app/setup`. Le couloir est un couloir — `FunnelShell` retire la navigation
// pendant qu'on le traverse, précisément pour qu'un clic sur « Today » ne sorte
// pas vers un écran vide. Ce n'est pas un lien manquant, c'est la garde.
//
// La copie ci-dessous décrit quand même la FORME du produit et ne compte aucune
// étape: « trois étapes vous attendent » redeviendrait faux au premier écran
// ajouté au couloir (S10 — on ne montre pas un écran qu'on n'a pas).
//
// ── POURQUOI UNE PAGE, ET PAS UN MODE DE /auth ──────────────────────────
// `/auth` porte la connexion de tout le monde, la confirmation d'email, le
// reset de mot de passe et le mode coach. Tisser une troisième variante dans ce
// fichier, c'est ce que W6.1 a déjà refusé de faire pour le coach — et pour la
// même raison: c'est la porte unique du produit, une régression y est une panne
// totale.
//
// ── LE PAYS: DEMANDÉ HIER, DÉDUIT AUJOURD'HUI ────────────────────────────
//
// ⚠️ CE PARAGRAPHE DISAIT « NE PAS RETIRER CE CHAMP NI SON AIDE ». Il est
// réécrit et non supprimé, parce qu'une contrainte documentée survit à sa
// cause: un lecteur qui trouverait la déduction sous un commentaire qui
// l'interdit conclurait que quelqu'un a cassé quelque chose, et le
// « réparerait ». Ce dépôt l'a déjà payé deux fois.
//
// Ce qui était vrai, et l'est toujours: `profiles.country` est lu EN PREMIER
// par le résolveur de ressources de crise, son absence le fait retomber sur la
// LANGUE, et c'est l'incident qui a coûté l'inscription générique de `/auth`
// (migration 20260804180000). Côté base, `keel_join_house_coach` rend toujours
// `country_required` sans pays.
//
// Ce qui a changé: le routage du numéro d'urgence n'est plus un sujet du
// produit — décision explicite, prise deux fois. La question occupait donc la
// place de la SEULE qui change quelque chose tous les jours: la langue, dont
// dépendent l'affichage de la plateforme, la langue du chat, celle du plan
// généré et celle des e-mails. Le pays continue d'être écrit, déduit du fuseau
// que ce formulaire envoyait déjà (`api/countryFromTimezone.ts`, qui écrit noir
// sur blanc ce que la déduction coûte).
//
// Le geste juste, le jour où l'urgence redevient un sujet: REPOSER LA QUESTION.
// Pas raffiner la table de fuseaux.
//
// ── CE QUE FAIT LA PAGE, DANS L'ORDRE, ET POURQUOI CET ORDRE ─────────────
// 1. Elle demande à la base si l'inscription libre est ouverte
//    (`keel_free_signup_available`). Sans cette question, on crée un compte,
//    puis le générateur de semaine rend 409 `coach_has_no_doctrine` — et le
//    testeur juge un produit cassé alors que c'est NOTRE coach maison qui n'est
//    pas prêt. On ne fabrique pas de comptes qui ne peuvent pas marcher.
// 2. Elle crée le compte, avec l'intention et le pays dans les métadonnées:
//    `handle_new_user()` rattache DANS la transaction du signup, donc le lien
//    existe déjà quand la personne ouvre son mail de confirmation.
// 3. Elle REJOUE `keel_join_house_coach()` à la première session. Le
//    rattachement du trigger est best-effort (un échec ne doit pas coûter le
//    compte); ce rejeu est la réparation, et la RPC est idempotente.

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

// ---------------------------------------------------------------------------
// LA CHARTE — les mêmes primitives que `/auth`
//
// ⚠️ DUPLIQUÉES DEPUIS `pages/Auth.tsx`, ET C'EST UNE DETTE ASSUMÉE, PAS UN
// OUBLI. Les deux portes du produit partagent maintenant une fiche à fronton,
// une classe de contrôle et un champ étiqueté. Le bon domicile est
// `components/ui/`, à côté de `Button` et `Card` — mais créer ce module touche
// deux pages dans le même geste, et ce lot n'a le droit d'écrire que celle-ci.
// Deux copies divergent: la première qui bouge sans l'autre est un bug de
// charte. À extraire au prochain lot qui ouvre les deux fichiers.
// ---------------------------------------------------------------------------

/**
 * La classe d'un contrôle de saisie.
 *
 * ⚠️ `text-base` sous `lg`: `index.css` pose `font-size: 16px` sur les champs
 * sous `lg` pour empêcher Safari iOS de zoomer au focus sans jamais dézoomer —
 * mais cette règle vit dans `@layer base`, donc un utilitaire `text-sm` la BAT.
 * L'ancien `inputClass` de `components/ui/Field.tsx` portait justement
 * `text-sm`: les champs de cette page étaient à 14 px sur téléphone, et la
 * protection était contournée sans avoir été retirée.
 *
 * ⚠️ `border-line-strong` et jamais `border-line`: WCAG 1.4.11 exige 3:1 pour
 * une bordure de composant, et `line` est à 1,30:1 sur le papier.
 *
 * L'anneau de focus est explicite: la règle `:focus-visible` de `tokens.css` ne
 * couvre que `a`, `button` et `[tabindex]` — un champ n'en fait pas partie.
 */
const controlClass =
  "block w-full min-w-0 rounded-card border border-line-strong bg-paper px-3 py-2.5 " +
  "text-base text-ink transition-colors focus:border-fig-600 focus:outline-none " +
  "focus:ring-2 focus:ring-fig-600 disabled:opacity-60 lg:text-sm";

/**
 * La chrome publique de cette page.
 *
 * ⚠️ `audience="student"` ET PAS LE DÉFAUT, et le nom trompe: il ne veut pas
 * dire « élève ». Il veut dire « une page qu'on ouvre pour agir, pas une page
 * de vente » — donc ni interrupteur de mondes, ni portes commerciales, ni geste
 * d'essai coach. Il garde « Se connecter » À TOUTES LES TAILLES, ce qui est
 * exactement ce dont quelqu'un qui a déjà un compte a besoin ici.
 *
 * (Différence assumée avec `/auth`, qui se fabrique une barre minimale: là-bas,
 * un bouton « Se connecter » pointerait sur la page qu'on regarde.)
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <StartSEO />
      <PublicHeader audience="student" />
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pb-16 pt-10 sm:pt-14">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}

/** Le titre de l'écran. UN SEUL `h1` par rendu, et c'est celui-ci. */
function Head({ title, lede }: { title: string; lede?: string }) {
  return (
    <>
      <h1 className="text-balance font-display text-title">{title}</h1>
      {lede && <p className="mt-4 max-w-[46ch] text-lede text-ink-soft">{lede}</p>}
    </>
  );
}

/**
 * LA FICHE, ET SON FRONTON — l'idiome de `/auth`.
 *
 * La fiche est L'ENDROIT OÙ L'ON ÉCRIT: seuls les deux états qui portent un
 * formulaire (`form`, `repair`) en ont une. Les états d'annonce
 * (`check_email`, `joined`, `existing_account`, `unavailable`) sont un titre et
 * un geste — leur donner un cadre de saisie ferait chercher un champ.
 *
 * ⚠️ L'ÉQUERRE EST SUR UN ÉLÉMENT SANS PADDING HORIZONTAL. La classe `.eq` pose
 * `padding-left: 1.125rem` hors de toute couche CSS, donc elle BAT un `px-5`
 * utilitaire (les styles sans couche l'emportent sur les couches). Poser les
 * deux sur le même nœud casse silencieusement la marge intérieure de gauche.
 */
function Sheet({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 overflow-hidden rounded-fiche border border-line bg-paper-2">
      <div className="border-b border-line px-5 py-3 sm:px-6">
        <p className="eq text-label font-semibold uppercase text-ink-soft">{label}</p>
      </div>
      <div className="px-5 py-6 sm:px-6">{children}</div>
    </section>
  );
}

function Field(
  { label, htmlFor, hint, children }: {
    label: string;
    htmlFor: string;
    hint?: string;
    children: React.ReactNode;
  },
) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-label font-semibold uppercase text-ink-soft"
      >
        {label}
      </label>
      {children}
      {hint && <p className="mt-2 text-sm leading-6 text-ink-soft">{hint}</p>}
    </div>
  );
}

/**
 * Un refus, dans la couleur de son SENS.
 *
 * Rouge, et pas figue: la teinte de marque n'entre jamais dans un objet d'état
 * (CHARTE §2.1). `role="alert"` parce qu'un message qui apparaît après un clic
 * doit être annoncé — sinon il n'existe que pour ceux qui regardent l'écran.
 */
function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-card border border-red-200 bg-red-50 px-3 py-2.5"
    >
      <p className="min-w-0 break-words text-sm leading-6 text-red-800">{children}</p>
    </div>
  );
}

export default function StartPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [phase, setPhase] = React.useState<Phase>({ kind: "loading" });
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  // ⚠️ LE SÉLECTEUR DE PAYS A DISPARU DE CET ÉCRAN, ET C'EST LA DÉCISION.
  //
  // Il demandait « Où vous vivez » sous une aide qui disait « sert à vous donner
  // le bon numéro d'urgence si une conversation en a besoin un jour ». Vrai, et
  // c'est exactement pourquoi il part: le routage du numéro d'urgence n'est pas
  // un sujet du produit aujourd'hui, et cette question occupait la place de la
  // seule qui change quelque chose tous les jours — la LANGUE.
  //
  // Le pays reste écrit en base (le SQL l'EXIGE: sans lui, `handle_new_user()`
  // refuse de rattacher l'inscrit à son coach, silencieusement, donc un compte
  // sans plan). Il se DÉDUIT du fuseau, que ce formulaire envoyait déjà — voir
  // `api/countryFromTimezone.ts` pour ce que la déduction coûte, écrit noir sur
  // blanc.
  const timezone = React.useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
  // La langue du COMPTE. Naît sur le drapeau de l'en-tête, et s'en détache si
  // la personne le veut — lire la page en français et être coaché en anglais
  // est un besoin réel. Ce champ NE RECHARGE PAS: il détruirait la saisie.
  const [language, setLanguage] = React.useState<UiLocale>(() => chosenUiLocale());
  const country = React.useMemo(
    () => declaredCountryFor(timezone, language),
    [timezone, language],
  );
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
            timezone,
            locale: signupProfileLocale(language),
          }),
          // ── LE TROU N°2 EST REFERMÉ (2026-08-13) ────────────────────────
          // Cette ligne pointait sur `/app/chat`, et le bouton de l'état
          // `joined` aussi. Un inscrit atterrissait donc dans la bulle, qui
          // affiche « Say hello, or send a photo » et ne pousse RIEN — et
          // l'entonnoir n'était atteint qu'à une visite ultérieure de `/` ou à
          // une reconnexion. Mesuré par un vrai inscrit: « il est où
          // l'onboarding ? ».
          //
          // Les deux pointent maintenant sur `/app/setup`, et la copie
          // ci-dessous a suivi. La bulle n'est pas perdue: elle est le premier
          // onglet qui s'ouvre une fois le plan composé.
          emailRedirectTo: `${window.location.origin}/app/setup`,
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
  // Les états courts — un titre et un geste, jamais un cadre de saisie
  // -------------------------------------------------------------------------

  if (phase.kind === "loading" || authLoading) {
    return (
      <Shell>
        <p className="text-sm text-ink-soft">{t("start.loading")}</p>
      </Shell>
    );
  }

  if (phase.kind === "unreachable") {
    return <ServerUnreachable />;
  }

  if (phase.kind === "unavailable") {
    return (
      <Shell>
        <Head title={t("start.unavailable.title")} lede={t("start.unavailable.body")} />
        <p className="mt-8 text-sm leading-6 text-ink-soft">
          <Link
            to="/auth"
            className="font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
          >
            {t("start.have_account_cta")}
          </Link>
        </p>
      </Shell>
    );
  }

  if (phase.kind === "check_email") {
    return <CheckEmailScreen />;
  }

  if (phase.kind === "existing_account") {
    return (
      <Shell>
        <Head title={t("start.existing.title")} lede={t("start.existing.body")} />
        <div className="mt-8">
          <Button
            variant="brand"
            className="w-full py-3 text-base sm:w-auto sm:px-8"
            onClick={() => navigate("/auth?redirect=%2Fstart")}
          >
            {t("start.existing.cta")}
          </Button>
        </div>
      </Shell>
    );
  }

  if (phase.kind === "joined") {
    return (
      <Shell>
        <Head title={t("start.joined.title")} lede={t("start.joined.body")} />
        <div className="mt-8">
          <Button
            variant="brand"
            className="w-full py-3 text-base sm:w-auto sm:px-8"
            onClick={() => navigate("/app/setup")}
          >
            {t("start.joined.cta")}
          </Button>
        </div>
      </Shell>
    );
  }

  // -------------------------------------------------------------------------
  // Les deux surfaces pleines: s'inscrire, ou réparer un compte sans coach
  // -------------------------------------------------------------------------

  const isRepair = phase.kind === "repair";

  return (
    <Shell>
      <Head
        title={isRepair ? t("start.repair.title") : t("start.title")}
        lede={isRepair ? t("start.repair.body") : t("start.lead")}
      />

      {/* ⚠️ L'OFFRE EST REMONTÉE AU-DESSUS DE LA FICHE LE 2026-09-01, ET C'EST
          LA CORRECTION LA PLUS CHÈRE DU LOT. Elle vivait SOUS le bouton
          d'envoi: quelqu'un qui arrivait de `/families` avec « premier mois
          offert » en tête trouvait ici un prix nu, après le geste, et rien sur
          la gratuité — la seule page qui l'annonçait ne la répétait pas là où
          elle décide. Le bloc est maintenant le MÊME qu'en amont
          (`ui/OfferLines.tsx`, namespace `offer`), et il se lit avant le
          premier champ.
          ⚠️ `start.price` a été retirée des deux packs. Le pack ANGLAIS y
          écrivait « 11,99 € a month … plus 2 € » — virgule décimale et symbole
          à droite, convention française servie à un lecteur anglophone. Les
          montants passent désormais par `formatPrice`, qui ne peut pas se
          tromper de convention. */}
      {!isRepair && <OfferLines className="mt-6" />}

      <Sheet label={isRepair ? t("start.sheet.repair") : t("start.sheet.form")}>
        <form onSubmit={isRepair ? repair : signUp} className="space-y-5">
          {!isRepair && (
            <>
              <Field label={t("start.form.name")} htmlFor="start-name">
                <input
                  id="start-name"
                  type="text"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={controlClass}
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
                  className={controlClass}
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
                  className={controlClass}
                />
              </Field>
            </>
          )}

          {/* LA LANGUE — et ce commentaire décrivait LE PAYS, un champ qui
              n'est plus sur ce formulaire. Il annonçait « demandé, jamais
              dérivé », l'exact contraire du code d'aujourd'hui: le pays se
              déduit du fuseau (`declaredCountryFor(timezone, language)`,
              plus haut dans ce fichier), et l'option vide, `isDeclaredCountryValid`
              et le refus `country_required` qu'il décrivait n'existent nulle
              part ici.

              SANS `hint`, ET C'EST UN RETRAIT VOULU (2026-09-01). Il disait
              « votre coach vous répond dans cette langue, et écrit votre plan
              dedans » — sur l'inscription LIBRE, à quelqu'un qui n'a pas de
              coach, et qui depuis le lancement B2C n'en rencontrera pas. Le
              libellé dit déjà tout ce qui est vrai. */}
          <Field
            label={t("start.form.language")}
            htmlFor="start-language"
          >
            <select
              id="start-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value === "fr" ? "fr" : "en")}
              className={controlClass}
            >
              {/* Chaque langue nommée DANS sa langue, avec son `lang`: sans lui
                  un lecteur d'écran français prononce « English » à la
                  française. Les deux libellés existent déjà — le drapeau les
                  rend — donc on ne crée pas un second nom pour la même langue. */}
              <option value="en" lang="en">{t("public.language.en")}</option>
              <option value="fr" lang="fr">{t("public.language.fr")}</option>
            </select>
          </Field>

          {!isRepair && (
            <label className="flex items-start gap-3 text-sm leading-6 text-ink">
              <input
                type="checkbox"
                checked={acceptedLegal}
                onChange={(e) => setAcceptedLegal(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-fig-700 focus:outline-none focus:ring-2 focus:ring-fig-600 focus:ring-offset-2"
              />
              <span className="cursor-pointer select-none">
                {t("start.form.legal_prefix")}{" "}
                <a
                  href="/legal"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
                >
                  {t("start.form.legal_terms")}
                </a>{" "}
                {t("start.form.legal_and")}{" "}
                <a
                  href="/legal#confidentialite"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
                >
                  {t("start.form.legal_privacy")}
                </a>
                .
              </span>
            </label>
          )}

          {formError && <ErrorNote>{formError}</ErrorNote>}

          <Button
            type="submit"
            variant="brand"
            disabled={submitting || (!isRepair && !acceptedLegal)}
            className="w-full py-3 text-base"
          >
            {submitting
              ? t("start.form.submitting")
              : isRepair
                ? t("start.repair.cta")
                : t("start.form.cta")}
          </Button>

          {!isRepair && (
            <p className="text-sm leading-6 text-ink-soft">
              {t("start.form.have_account")}{" "}
              <Link
                to="/auth"
                className="font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
              >
                {t("start.have_account_cta")}
              </Link>
            </p>
          )}
        </form>
      </Sheet>

      {/* QUI N'EST PAS CONCERNÉ. Ce n'est pas un argument de vente, c'est ce
          qu'on doit à quelqu'un avant qu'il ouvre un compte au mauvais endroit.
          ⚠️ LE PRIX N'EST PLUS ICI: il est remonté au-dessus de la fiche, avec
          le reste de l'offre. Une phrase de prix sous le bouton d'envoi arrive
          après la décision qu'elle devait éclairer.
          ⚠️ ET LA LIGNE COACH SE TAIT QUAND LE MONDE PRO EST OCCULTÉ. Sous
          `VITE_B2C_ONLY`, plus aucune porte ne mène au pro: `/coaches`,
          `/gyms`, `/communities` et `/pro` sont démontées d'`App.tsx`, et
          `/auth?role=coach` refuse. Personne ne peut donc arriver ici avec une
          invitation de coach — et cette phrase remet le mot « coach » sur la
          seule page où le lecteur du foyer va vraiment, alors que les quatre
          pages qui l'y ont amené l'évitent délibérément. */}
      {!isRepair && !isProSurfaceHidden() && (
        <div className="mt-6 border-t border-line pt-6">
          <p className="max-w-[62ch] text-sm leading-6 text-ink-soft">
            {t("start.coach_line")}
          </p>
        </div>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

/**
 * « VÉRIFIEZ VOS MAILS » — L'ÉCRAN QU'AUCUN POSTE DE DEV NE MONTRE.
 *
 * Extrait du corps de la page, et exporté, pour une raison précise:
 * `enable_confirmations = false` en local, donc `signUp` y ouvre toujours une
 * session et cette phase ne se joue jamais ici. Elle n'existait que par la
 * lecture. Sans hook, sans réseau et sans contexte, elle se rend maintenant
 * dans un test — dans les DEUX langues, parce qu'une garde testée dans une
 * seule ne dit rien de l'autre (`startCheckEmail.int.test.ts`).
 *
 * ⚠️ Le texte dit que le compte est créé ET DÉJÀ RATTACHÉ. Ce n'est pas une
 * formule rassurante: `handle_new_user()` rattache dans la transaction du
 * signup, pas à l'ouverture de la boîte mail. Écrire « on terminera quand vous
 * reviendrez » serait faux, et laisserait croire qu'un mail non ouvert coûte
 * le rattachement. Le test épingle les deux formulations.
 *
 * ⚠️ AUCUN BOUTON ICI, et le test le vérifie: la suite se passe dans la boîte
 * mail, et un bouton ne pourrait que renvoyer vers un endroit où la session
 * n'existe pas encore.
 */
export function CheckEmailScreen() {
  return (
    <Shell>
      <Head title={t("start.check_email.title")} lede={t("start.check_email.body")} />
    </Shell>
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
