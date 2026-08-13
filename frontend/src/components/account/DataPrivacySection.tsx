import { useState } from "react";
import {
  AlertTriangle,
  Download,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { newRequestId, requestHeaders } from "../../lib/requestId";
import { loadMyHouseholdPlace } from "../../keel/api/household";
import { formatDateLong } from "../../keel/i18n/format";
// ── LE KIT, ET C'EST NOUVEAU ICI ────────────────────────────────────────────
// Cet écran — l'export RGPD et la SUPPRESSION DE COMPTE — n'importait aucune
// primitive: sa carte, son champ, son étiquette, son bouton et sa fenêtre
// étaient recopiés à la main, en deux habillages. Les quatre entrées ci-dessous
// sont la charte « la fiche » telle qu'elle est construite
// (`docs/keel/CHARTE-VITRINE.md`), par les primitives de `keel/components/ui/`.
import { Button, buttonClass } from "../../keel/components/ui/Button";
import { Card, SectionLabel } from "../../keel/components/ui/Card";
import { Field, inputClass } from "../../keel/components/ui/Field";

type Props = {
  /**
   * ⚠️ CE DRAPEAU NE PEINT PLUS RIEN, ET IL EST GARDÉ EXPRÈS. NE LE « RÉPARE »
   * PAS EN REMETTANT UNE PEAU.
   *
   * Il déclenchait un second habillage, sombre et en ÉMERAUDE
   * (`bg-emerald-900/30`, `border-emerald-800`, `text-emerald-400`,
   * `bg-red-950/30`…): à lui seul 24 des 45 couleurs saturées du fichier. Il
   * part pour les mêmes trois raisons que dans `UserProfile`, qui a retiré la
   * sienne le même jour:
   *   1. l'émeraude est la famille d'état « ok » dans TOUT le produit
   *      (`ui/Badge.tsx`) — une peau entière dans cette teinte rend un
   *      enregistrement confirmé indistinguable d'un fond de panneau;
   *   2. `architecte` est un palier d'abonnement du produit GRAND PUBLIC
   *      supprimé, et cette peau ne se déclenchait même pas sur le palier: elle
   *      vient d'un `?mode=architecte` dans l'URL (`pages/Account.tsx`) que RIEN
   *      dans le dépôt ne pose — revérifié le 2026-08-13, hors commentaires, sur
   *      `frontend/src` et `frontend/e2e`. La peau était donc morte AVANT d'être
   *      hors charte;
   *   3. la charte ne nomme QU'UN fond sombre, `fig-950`, et « un seul par
   *      page » (charte §2). Deux thèmes n'y entrent pas.
   *
   * La PROP SURVIT parce que `components/UserProfile.tsx` la passe et n'est pas
   * de ce lot: changer la signature ici casserait son typecheck. Le jour où
   * `mode`, `isArchitect` et cette prop partent, ils partent ensemble — c'est un
   * lot de suppression, pas de style. Voir le commentaire de `UserProfile`
   * ligne 164, qui annonçait déjà ce geste-ci.
   */
  isArchitect: boolean;
};

type InvokeOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; code: string | null; message: string };

// supabase.functions.invoke wraps non-2xx in FunctionsHttpError with the raw
// Response in error.context — unwrap it to map backend error codes to French.
async function invokeFn<T>(name: string, body: Record<string, unknown>): Promise<InvokeOutcome<T>> {
  const reqId = newRequestId();
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: requestHeaders(reqId),
  });
  if (!error) return { ok: true, data: data as T };
  let status: number | null = null;
  let code: string | null = null;
  const ctx = (error as { context?: Response }).context;
  if (ctx instanceof Response) {
    status = ctx.status;
    try {
      const payload = await ctx.clone().json();
      code = typeof payload?.error === "string" ? payload.error : null;
    } catch {
      // non-JSON body
    }
  }
  return {
    ok: false,
    status,
    code,
    message: error instanceof Error ? error.message : String(error),
  };
}

function frenchExportError(outcome: { status: number | null; code: string | null }): string {
  if (outcome.code === "invalid_password") return "Wrong password.";
  if (outcome.status === 429) {
    return "You already requested an export recently (limit: 1 export per 24 h). Try again later.";
  }
  return "The export failed. Try again in a few minutes, or write to sophia@sophia-coach.ai.";
}

const CONFIRMATION_WORD = "DELETE";

type DeleteStep = "export" | "explain" | "confirm" | "done";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- voir `Props`
export default function DataPrivacySection({ isArchitect: _dead }: Props) {
  const navigate = useNavigate();

  // --- Export ---
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  // --- Deletion modal ---
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("export");
  const [deletePassword, setDeletePassword] = useState("");
  const [typedWord, setTypedWord] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [purgeDate, setPurgeDate] = useState<string | null>(null);
  const [hadSubscription, setHadSubscription] = useState(false);

  // ── LE FOYER, ET LE GESTE EXPLICITE (chantier 2, D3) ──────────────────────
  //
  // Supprimer son compte DÉTACHE, ça n'efface pas la bouche: la ligne du foyer
  // n'est pas le dossier de la personne, c'est ce que le compte maître a saisi
  // pour cuisiner — un prénom, un âge, une allergie, une portion. Elle survit,
  // et le repas de tout le foyer avec.
  //
  // En contrepartie, la question est POSÉE, et la réponse par défaut est NON:
  // une case décochée qui laisse la place, une case cochée qui la retire. Le
  // défaut est le comportement protecteur, jamais le destructeur.
  //
  // ⚠️ CE N'EST PAS LA GARDE: le compte maître ne peut pas quitter son foyer,
  // et c'est la base qui le refuse (`cannot_remove_owner`). L'écran ne fait
  // que ne pas proposer un geste qui sera refusé.
  const [place, setPlace] = useState<
    { inHousehold: boolean; isOwner: boolean; householdName: string | null }
  >({ inHousehold: false, isOwner: false, householdName: null });
  const [leaveHousehold, setLeaveHousehold] = useState(false);
  const canChooseDeparture = place.inHousehold && !place.isOwner;

  // ── LES SIX CLASSES MAISON ONT ÉTÉ SUPPRIMÉES ────────────────────────────
  // `cardClass` → `ui/Card` · `labelClass` → l'étiquette de `ui/Field`
  // (`text-label`, le cran de la charte) · `inputClass` local → `inputClass` du
  // kit, IMPORTÉ (il porte `text-base … lg:text-sm`, sans quoi Safari iOS zoome
  // sur un champ de moins de 16 px au focus et ne dézoome jamais — et ce
  // fichier-ci demande DEUX mots de passe sur téléphone) · `primaryBtn` →
  // `ui/Button` · `mutedText` → `ink-soft` · `errorBox` → les valeurs rouges du
  // kit (`red-200` / `red-50` / `red-700`, 6,13:1).
  //
  // ⛔ NE LES RECRÉE PAS. Chacune n'existait que pour porter la branche
  // `isArchitect`, et six copies locales d'une primitive sont six endroits où le
  // rayon, la bordure et le contraste peuvent diverger de ce que le produit rend
  // partout ailleurs.
  //
  // LA SEULE TEINTE D'ÉTAT QUI RESTE DANS CE FICHIER EST LE ROUGE, et elle porte
  // un fait: un échec, ou un geste IRRÉVERSIBLE. La suppression de compte garde
  // donc `Button variant="danger"` (un contour rouge sur `paper`) et n'est
  // JAMAIS teinte en figue: une action irréversible ne doit pas ressembler à
  // l'action principale d'un écran. ⚠️ Et il n'y a AUCUNE figue ici — voir le
  // bloc « L'ACTION MARQUÉE » plus bas.

  const handleExport = async () => {
    setExportLoading(true);
    setExportError(null);
    setExportUrl(null);
    try {
      const outcome = await invokeFn<{ ok: boolean; url: string }>("account-export-v1", {
        password: exportPassword,
      });
      if (!outcome.ok) {
        setExportError(frenchExportError(outcome));
        return;
      }
      setExportUrl(outcome.data.url);
      setExportPassword("");
    } finally {
      setExportLoading(false);
    }
  };

  const openDeleteModal = () => {
    setDeleteStep("export");
    setDeletePassword("");
    setTypedWord("");
    setDeleteError(null);
    setLeaveHousehold(false);
    setPlace({ inHousehold: false, isOwner: false, householdName: null });
    setDeleteOpen(true);
    // Lue À L'OUVERTURE, pas au montage de la page: un formulaire figé au
    // montage affiche du vide non lu. Une lecture qui échoue laisse `place` à
    // son défaut — pas de foyer, donc pas de question — plutôt que de deviner.
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id ?? "";
      if (!uid) return;
      setPlace(await loadMyHouseholdPlace(uid));
    })();
  };

  const handleDeleteConfirm = async () => {
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const prepare = await invokeFn<{
        ok: boolean;
        token: unknown;
        purge_at_preview: string;
        has_active_subscription: boolean;
      }>("account-deletion-v1", { action: "prepare", password: deletePassword });
      if (!prepare.ok) {
        if (prepare.code === "invalid_password") {
          setDeleteError("Wrong password.");
        } else if (prepare.status === 429) {
          setDeleteError("Too many attempts. Try again in an hour.");
        } else {
          setDeleteError("The request failed. Try again, or write to sophia@sophia-coach.ai.");
        }
        return;
      }
      setHadSubscription(prepare.data.has_active_subscription);

      const confirm = await invokeFn<{ ok: boolean; purge_at: string }>("account-deletion-v1", {
        action: "confirm",
        token: prepare.data.token,
        typed_confirmation: typedWord.trim(),
        // TOUJOURS ENVOYÉ, jamais conditionné à l'affichage: un paramètre
        // optionnel est une garde désarmée. Quand la question n'a pas été
        // posée (pas de foyer, ou compte maître), la réponse est `false` — et
        // `false` est exactement ce que la base doit écrire.
        leave_household: canChooseDeparture && leaveHousehold,
      });
      if (!confirm.ok) {
        if (confirm.code === "confirmation_word_mismatch") {
          setDeleteError(`Type exactly "${CONFIRMATION_WORD}" to confirm.`);
        } else if (confirm.code === "subscription_cancel_failed") {
          setDeleteError(
            "Could not cancel your subscription right now. Nothing has been deleted — try again in a few minutes.",
          );
        } else {
          setDeleteError("The deletion failed. Nothing has been deleted — try again.");
        }
        return;
      }
      setPurgeDate(confirm.data.purge_at);
      setDeleteStep("done");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleAfterDeletion = async () => {
    // Sessions are already revoked server-side; clear the local one and leave.
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // ignore
    }
    setDeleteOpen(false);
    navigate("/", { replace: true });
    window.location.reload();
  };

  // ⚠️ LEGACY, et seul le FORMATAGE bouge ici: « in 7 days » reste une phrase
  // anglaise en dur, parce que l'extraction de ce reliquat est un lot à part.
  // Le `fr-FR` codé, lui, était faux dans les deux sens — français forcé sur
  // un écran anglais.
  const formatDate = (iso: string | null) => {
    if (!iso) return "in 7 days";
    return formatDateLong(iso) || "in 7 days";
  };

  return (
    <>
      {/* `SectionLabel` porte L'ÉQUERRE — la signature de la charte, et elle a
          toujours un mot à sa droite. Elle remplace un `h3` en
          `text-xs tracking-widest text-slate-400` (2,8:1 sur le papier), et elle
          met cette section au même rang visuel que « Preferences » juste au
          dessus, dans le même onglet: c'est le même niveau de titre. */}
      <SectionLabel className="mt-8">My data</SectionLabel>

      {/* --- Export RGPD --- */}
      <Card className="mb-4">
        <div className="mb-2 flex items-center gap-3">
          <Download className="h-4 w-4 shrink-0 text-ink-soft" />
          <span className="text-sm font-medium text-ink">Export my data</span>
        </div>
        {/* `text-sm` et non `text-[11px]`: 11 px n'est dans aucun cran de
            l'échelle de la charte, et c'est une ligne qui se lit. */}
        <p className="mb-3 text-sm leading-6 text-ink-soft">
          Download a copy of your data (profile, plans, conversations, memories) as JSON in a
          ZIP archive. Limit: 1 export per 24 h.
        </p>

        {!exportOpen ? (
          <Button onClick={() => setExportOpen(true)}>
            Prepare my export
          </Button>
        ) : (
          <div className="space-y-3">
            {/* `Field` du kit: l'étiquette au cran `text-label` et un `htmlFor`
                qui la relie enfin au champ — le `<label>` maison n'en avait pas,
                donc cliquer dessus ne donnait pas le focus et un lecteur d'écran
                annonçait un champ sans nom. */}
            <Field label="Confirm your password to continue" htmlFor="account-export-password">
              <input
                id="account-export-password"
                type="password"
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                className={inputClass}
                placeholder="Your password"
                autoComplete="current-password"
              />
            </Field>
            {exportError && (
              <div className="rounded-card border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">
                {exportError}
              </div>
            )}
            {exportUrl ? (
              // ⛔ CE LIEN ÉTAIT ÉMERAUDE PLEINE, ET C'EST LA FAUTE QUE LA RÈGLE
              // DE COULEUR VISE: l'émeraude est la famille « ok », donc un FAIT,
              // et celui-ci est une ACTION. Il devient un bouton du kit —
              // `buttonClass` existe pour exactement ça, un élément qui n'est pas
              // un `<button>` (ici un `<a download>`) et qui doit en avoir la
              // forme. Il reste `secondary`: la figue de cet onglet est prise,
              // voir plus bas.
              <a
                href={exportUrl}
                className={buttonClass("secondary", "md", "w-full")}
                download
              >
                Download the archive (link valid for 15 minutes)
              </a>
            ) : (
              <Button
                onClick={handleExport}
                disabled={exportLoading || !exportPassword}
                className="w-full"
              >
                {exportLoading ? "Preparing the archive…" : "Generate my export"}
              </Button>
            )}
            <p className="text-sm leading-6 text-ink-soft">
              For your safety, a notification is sent in your chat and by email for every export
              request. The file contains sensitive personal data: keep it somewhere safe.
            </p>
          </div>
        )}
      </Card>

      {/* --- Suppression du compte ---
          ⛔ LE SEUL GESTE DESTRUCTEUR DU PRODUIT, ET IL GARDE LE ROUGE À LUI
          SEUL. `variant="danger"` est un ÉTAT: ses trois valeurs rouges n'ont pas
          bougé avec la charte (`red-200` en contour, `red-700` sur `paper` =
          6,13:1). ⚠️ NE LE PASSE JAMAIS EN FIGUE — la teinte de marque est celle
          de l'action principale, et une action irréversible ne doit pas
          ressembler à celle qu'on attend de l'écran. C'est aussi pourquoi
          `UserProfile` a retiré le rouge de « Sign out » juste au-dessus: deux
          lignes rouges empilées, et l'irréversible ne se distingue plus de
          l'ordinaire.
          Le `justify-between` maison part avec le `<button>`: il poussait un
          libellé seul contre le bord gauche d'une ligne pleine largeur. */}
      <Button variant="danger" onClick={openDeleteModal} className="mb-4 w-full">
        <Trash2 className="h-4 w-4 shrink-0" /> Delete my account
      </Button>

      {/* --- Modal de suppression (3 étapes, sans rétention) --- */}
      {deleteOpen && (
        // ── ⚠️ CETTE FENÊTRE N'EST PAS `ui/Modal`, ET C'EST UNE DÉCISION ─────
        // Le kit en a une, et elle est meilleure sur trois points (Échap, verrou
        // de défilement, `role="dialog"`). Elle ne peut pourtant pas remplacer
        // celle-ci sans CHANGER LA LOGIQUE, ce qu'un lot visuel n'a pas le droit
        // de faire: `ui/Modal` appelle `onClose` sur Échap ET sur le voile, sans
        // condition, et rend toujours son bouton « Close » dans le fronton. Or
        // ici la fermeture est GARDÉE deux fois — pas pendant l'appel réseau
        // (`deleteLoading`), et pas du tout à l'étape `done`, où la seule sortie
        // doit passer par `handleAfterDeletion` qui révoque la session locale et
        // quitte l'écran. Avec le kit, Échap à l'étape `done` laisserait un
        // compte supprimé connecté jusqu'au rechargement.
        // ⚠️ SIGNALÉ, PAS FAIT: il manque donc à cette fenêtre Échap, le verrou
        // de défilement, le focus entrant et `role="dialog"`/`aria-modal`. La
        // vraie réparation est un `dismissible`/`closeLabel` optionnels dans
        // `ui/Modal` — c'est un lot de kit, et le kit n'est pas à moi.
        <div
          // Le voile est l'ENCRE de la marque à 40 %, la valeur de `ui/Modal`, et
          // pas un `black/60` avec un flou: ce qui sépare la fenêtre de la page,
          // c'est le trait de la fenêtre. `z-[60]` reste — le panneau de
          // `UserProfile` est à `z-50`.
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4"
          onClick={() => !deleteLoading && deleteStep !== "done" && setDeleteOpen(false)}
        >
          <div
            // `rounded-fiche` (16px) = la valeur que `rounded-2xl` rendait: une
            // fenêtre est une SURFACE ENTIÈRE. Elle est le ground de ce qu'elle
            // contient, donc `paper` comme la page — les cartes posées dedans
            // gardent le contraste qu'elles ont sur un écran.
            className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-fiche bg-paper text-ink shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* LE FRONTON de la fiche: `paper-2` fermé par un trait `line`,
                l'idiome de `ui/Modal`, de `/auth` et de `/start`. */}
            <div className="flex items-center justify-between gap-3 border-b border-line bg-paper-2 px-4 py-3">
              {/* Public Sans, pas Young Serif: un titre de fenêtre fait 16 px et
                  la display ne descend jamais sous 20. */}
              <h4 className="flex items-center gap-2 text-base font-semibold text-ink">
                {deleteStep === "done" ? (
                  // ⛔ ÉMERAUDE = OK, ET C'EST UN FAIT: la demande a été
                  // enregistrée. `emerald-700` est la valeur du kit.
                  <>
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" /> Done
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 shrink-0 text-red-700" /> Delete my account
                  </>
                )}
              </h4>
              {deleteStep !== "done" && (
                <button
                  type="button"
                  onClick={() => setDeleteOpen(false)}
                  // `aria-label` parce qu'une croix n'a pas de texte, et le
                  // survol de la charte (`fig-50`) plutôt qu'un gris.
                  aria-label="Close"
                  className="rounded-full p-2 text-ink-soft hover:bg-fig-50 hover:text-ink"
                  disabled={deleteLoading}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-6 text-ink">
              {deleteStep === "export" && (
                <>
                  <p>
                    Before you go, you can download a copy of your data (profile, plans,
                    conversations, memories). It is optional — and only possible while your account
                    still exists.
                  </p>
                  {/* ── ⚠️ AUCUNE FIGUE DANS CETTE FENÊTRE, ET C'EST L'ARBITRAGE
                      DE CE FICHIER ────────────────────────────────────────────
                      Deux raisons cumulées. D'abord la contrainte du kit: une
                      seule action figue par vue rendue, et l'onglet « Settings »
                      qui est DERRIÈRE ce voile a déjà dépensé la sienne sur
                      « Save » (`UserProfile`) — le lecteur voit les deux bords du
                      panneau autour de la fenêtre, ce n'est pas un autre écran.
                      Ensuite, et surtout: la teinte de marque ne doit pas MENER un
                      parcours irréversible. Les seuls boutons marqués d'ici sont
                      rouges — l'escalade et la destruction — et tout le reste est
                      un contour neutre. Deux choix de même poids se départagent
                      par leur ORDRE et par leur libellé: le geste protecteur est
                      offert le premier, et il l'est parce que c'est le seul qui
                      ne peut plus être fait après. */}
                  <div className="mt-5 grid gap-2">
                    <Button
                      onClick={() => {
                        setDeleteOpen(false);
                        setExportOpen(true);
                      }}
                      className="w-full"
                    >
                      Download my data first
                    </Button>
                    <Button onClick={() => setDeleteStep("explain")} className="w-full">
                      Continue
                    </Button>
                  </div>
                </>
              )}

              {deleteStep === "explain" && (
                <>
                  <p className="font-semibold text-ink">Here is what will happen:</p>
                  <ul className="mt-3 space-y-2 list-disc pl-5">
                    <li>Your access to the app is cut off immediately.</li>
                    <li>Sophia stops writing to you straight away.</li>
                    <li>
                      Your subscription is cancelled immediately, with no further charge. The
                      period already paid is not refunded pro rata.
                    </li>
                    <li>
                      <strong>All your data is permanently deleted in 7 days.</strong>{" "}
                      This deletion is irreversible.
                    </li>
                    <li>
                      You can change your mind: sign in again before that date and your account is
                      restored in one click (the subscription is not reactivated automatically).
                    </li>
                    {/* LE FOYER EST DIT ICI, avant le mot de passe, parce que
                        c'est une conséquence sur les repas d'AUTRES personnes
                        — pas un réglage de compte. */}
                    {place.inHousehold && !place.isOwner && (
                      <li>
                        Your place in {place.householdName || "your household"} is{" "}
                        <strong>kept by default</strong>: your serving and your allergies
                        stay part of the household so nobody there loses a meal. You can
                        ask for it to go too, on the next screen.
                      </li>
                    )}
                    {place.inHousehold && place.isOwner && (
                      <li>
                        You run {place.householdName || "a household"}. It is{" "}
                        <strong>not deleted</strong> — the people in it keep their servings,
                        their allergies and their meals. What you lose is your access to it.
                      </li>
                    )}
                  </ul>
                  {/* ⛔ AMBRE = ATTENTION, ET UNE SURFACE A LE DROIT DE PORTER UN
                      ÉTAT quand elle porte un FAIT (audit §5.2): « voilà ce qui
                      est conservé malgré la suppression » en est un. C'est
                      exactement `Card tone="warning"` du kit — la carte maison
                      rendait la même chose en `amber-100`/`amber-900` avec son
                      propre rayon. Le texte hérite d'`ink` sur `amber-50`
                      (15:1); seul le pictogramme garde l'ambre du kit. */}
                  <Card tone="warning" className="mt-4 text-sm leading-6">
                    <p className="flex items-center gap-1.5 font-semibold text-ink">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-800" /> What is kept
                    </p>
                    <p className="mt-1">
                      The invoices for your payments (statutory accounting retention obligation)
                      and a minimal anonymised record of the deletion (hashed email and phone
                      number, with the date) as proof of compliance. Nothing else.
                    </p>
                  </Card>
                  <div className="mt-5 grid gap-2">
                    {/* L'ESCALADE PORTE DÉJÀ LE ROUGE, et elle le porte au
                        contour: `danger` du kit remplace un `bg-red-600` maison.
                        Rien n'est encore supprimé à cette étape — c'est le pas
                        vers l'écran qui le fera — donc les deux gestes rouges du
                        parcours se ressemblent, et c'est voulu: ils sont la même
                        direction. Ils ne sont jamais rendus ensemble. */}
                    <Button
                      variant="danger"
                      onClick={() => setDeleteStep("confirm")}
                      className="w-full"
                    >
                      I understand, continue
                    </Button>
                    {/* « Annuler » est le geste qu'on peut ignorer: `ghost`, la
                        variante que le kit a pour ça. Il reste le seul contrôle
                        neutre de l'étape, donc il ne se confond avec rien. */}
                    <Button variant="ghost" onClick={() => setDeleteOpen(false)} className="w-full">
                      Cancel
                    </Button>
                  </div>
                </>
              )}

              {deleteStep === "confirm" && (
                <>
                  <p>
                    Last step. Confirm your password, then type{" "}
                    <strong>{CONFIRMATION_WORD}</strong> to delete your account.
                  </p>

                  {/* LA QUESTION DU FOYER (chantier 2, D3). Elle n'est posée
                      qu'à qui a une place à perdre, et jamais au compte maître
                      — un foyer sans personne pour composer laisse ses bouches
                      sans compte sans recours, et la base le refuse. */}
                  {canChooseDeparture && (
                    // UN BLOC IMBRIQUÉ NE PREND PAS UN SECOND REMPLISSAGE — il
                    // n'y en a plus de disponible sous `paper` — il prend un
                    // TRAIT. Et ce trait borde un CONTRÔLE (la case), donc
                    // `line-strong` (3,84:1) et jamais `line` (1,30:1).
                    <div className="mt-4 rounded-card border border-line-strong p-3 text-sm leading-6 text-ink">
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={leaveHousehold}
                          onChange={(e) => setLeaveHousehold(e.target.checked)}
                          // ⚠️ SANS `accent-*`, CETTE CASE ÉTAIT RENDUE EN BLEU
                          // SYSTÈME — la teinte que `Badge tone="info"` occupe
                          // dans tout le produit. `@tailwindcss/forms` n'est pas
                          // installé ici: l'`appearance` reste native, donc
                          // `border-*` et `rounded-*` ne l'atteignent pas et
                          // `accent-*` est la SEULE classe qui la peigne.
                          // C'est la case la plus lourde du produit — elle décide
                          // si la place d'une personne dans un foyer disparaît
                          // avec son compte — et elle n'avait aucune classe.
                          className="mt-0.5 h-4 w-4 shrink-0 accent-ink focus:outline-none focus:ring-2 focus:ring-fig-600"
                        />
                        <span>
                          <strong>
                            Also remove my place in{" "}
                            {place.householdName || "this household"}?
                          </strong>
                          <span className="mt-1 block">
                            Leave this unticked and your place stays: your first name,
                            your serving and your allergies remain part of the household,
                            and nobody there loses a meal. Tick it and all of that is
                            deleted along with your account, on the same day.
                          </span>
                        </span>
                      </label>
                    </div>
                  )}

                  {/* ⚠️ CES DEUX CHAMPS PORTAIENT UN `focus:border-blue-500`,
                      c'est-à-dire l'anneau de focus dans la teinte de `Badge
                      tone="info"`. `inputClass` du kit le remplace par `fig-600`
                      (7,36:1) et pose surtout `text-base` sous `lg`: on tape ici
                      un mot de passe sur un téléphone, et Safari iOS zoome sur un
                      champ de moins de 16 px au focus SANS dézoomer en sortant. */}
                  <div className="mt-4 space-y-3">
                    <Field label="Password" htmlFor="account-delete-password">
                      <input
                        id="account-delete-password"
                        type="password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        className={inputClass}
                        autoComplete="current-password"
                      />
                    </Field>
                    <Field label={`Type ${CONFIRMATION_WORD}`} htmlFor="account-delete-word">
                      <input
                        id="account-delete-word"
                        type="text"
                        value={typedWord}
                        onChange={(e) => setTypedWord(e.target.value)}
                        className={inputClass}
                        placeholder={CONFIRMATION_WORD}
                      />
                    </Field>
                    {deleteError && (
                      <div className="rounded-card border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">
                        {deleteError}
                      </div>
                    )}
                    {/* LE GESTE IRRÉVERSIBLE. `danger` du kit, et rien d'autre:
                        c'est le seul bouton du produit derrière lequel il n'y a
                        pas de retour, et il ne doit ressembler à AUCUNE action
                        principale. Le `disabled` du kit rend `opacity-50` et
                        `cursor-not-allowed` — la garde reste celle du dessus:
                        mot de passe saisi ET mot de confirmation exact. */}
                    <Button
                      variant="danger"
                      onClick={handleDeleteConfirm}
                      disabled={
                        deleteLoading ||
                        !deletePassword ||
                        typedWord.trim() !== CONFIRMATION_WORD
                      }
                      className="w-full"
                    >
                      {deleteLoading ? "Deleting…" : "Permanently delete my account"}
                    </Button>
                  </div>
                </>
              )}

              {deleteStep === "done" && (
                <>
                  <p>
                    Your account is deactivated. All your data will be{" "}
                    <strong>permanently deleted on {formatDate(purgeDate)}</strong>.
                  </p>
                  <p className="mt-3">
                    If you change your mind, sign in again before that date: your account will be restored
                    in one click.
                    {hadSubscription
                      ? " Your subscription has been cancelled and will not be reactivated automatically."
                      : ""}
                  </p>
                  <p className="mt-3">Thank you for walking part of the way with Sophia. Take care of yourself.</p>
                  {/* LA SEULE SORTIE DE CETTE ÉTAPE, et elle fait un vrai geste
                      (révoquer la session locale, quitter l'écran) — c'est pour ça
                      que la croix du fronton est retirée à `done` et que le voile
                      ne ferme plus. Elle reste `secondary`: congédier une fenêtre
                      n'est pas l'action principale d'un écran, et rien de figue
                      n'entre dans ce parcours. */}
                  <Button onClick={handleAfterDeletion} className="mt-5 w-full">
                    Close
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
