import React from "react";
import { supabase } from "../../lib/supabase";
import {
  type InviteSendState,
  inviteTitleKey,
  inviteWarningKey,
  sendStudentInvitation,
} from "../api/inviteStudent";
import { t } from "../i18n/t";
import { Button } from "./ui/Button";
import { Field, inputClass } from "./ui/Field";
import Modal from "./ui/Modal";

// KEEL — invite a student (BUILD_PLAN W6.5).
//
// The dialog carries no logic of its own beyond one POST: the token is minted
// server-side, only its sha256 is stored, and the clear value goes to the
// invitee's mailbox. THIS SCREEN NEVER SEES THE TOKEN — coach-invite-student-v1
// echoes the join URL only to a caller holding the internal secret, which a
// browser never has. So there is no "copy the link" affordance here, and that
// absence is the feature.
//
// ⚠️ « W9 CONSOLIDERA » — C'ÉTAIT LA NOTE, ET ELLE A TENU JUSQU'AU LOT 2.
// Quatre phrases restaient en dur ici « parce que `en.ts` est hors du périmètre
// de ce lot »: une erreur de session, la note sur la durée du lien, un
// `placeholder` et un état de bouton. Le raisonnement de l'époque — « tout est
// déjà en anglais, donc rien n'est mal traduit » — cesse d'être vrai le jour où
// une seule langue s'ajoute, et c'est ce jour-là. Les quatre sont sous
// `invite.dialog.*`.



// L'état d'envoi et la table des refus vivent dans `api/inviteStudent.ts`:
// le bouton « renvoyer » de l'accueil coach lit exactement la même, et c'est
// la seule chose que ces deux surfaces ne doivent pas réimplémenter chacune
// à sa façon — c'est là que cet écran avait déjà menti une fois.

type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string; serverState: InviteSendState }
  | { kind: "error"; message: string };

export function InviteDialog({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited?: () => void;
}) {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<SendState>({ kind: "idle" });

  React.useEffect(() => {
    if (open) {
      setEmail("");
      setState({ kind: "idle" });
    }
  }, [open]);

  if (!open) return null;

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setState({ kind: "sending" });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error(t("invite.dialog.session_expired"));
      }
      const out = await sendStudentInvitation(email, accessToken);
      setState({ kind: "sent", email: out.email, serverState: out.state });
      onInvited?.();
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    // ── LA FENÊTRE MAISON EST PARTIE POUR `ui/Modal`, ET CE N'ÉTAIT PAS UN
    // GESTE DE STYLE ────────────────────────────────────────────────────────
    // Ce dialogue était un `fixed inset-0` écrit à la main. Il lui manquait les
    // quatre obligations qu'une fenêtre a et que `ui/Modal.tsx` tient une fois
    // pour toutes: Échap ne fermait pas, la page derrière défilait sous le
    // voile, il n'avait ni `role="dialog"` ni `aria-modal` (un lecteur d'écran
    // continuait d'annoncer l'écran recouvert), et la tabulation sortait dans la
    // cohorte cachée derrière. Il n'était pas non plus porté vers `body`: le
    // premier parent avec un `transform` ou un `overflow` l'aurait enfermé dans
    // la carte qui l'ouvre.
    // Au passage, la charte: voile `bg-ink/40` et non `bg-black/40` (l'encre de
    // la marque, pas un noir), surface `rounded-fiche bg-paper` et non
    // `rounded-lg bg-white`, et un fronton `paper-2` fermé par un trait.
    <Modal
      open={open}
      onClose={onClose}
      title={t("invite.title")}
      closeLabel={t("common.close")}
    >
      {state.kind === "sent"
        ? (
          <div>
            <p className="max-w-[62ch] text-sm leading-6 text-ink">
              {t(inviteTitleKey(state.serverState), { email: state.email })}
            </p>
            {inviteWarningKey(state.serverState) !== null && (
              /* AMBRE, et pas rouge: rien n'a échoué. L'invitation existe, elle
                 est valable, et son lien marche — c'est l'ENVOI qui a été
                 supprimé par la configuration. Un ton d'erreur ferait croire
                 qu'il faut réinviter, ce qui révoquerait le jeton émis.
                 ⛔ L'ambre reste donc: elle porte un fait. Seul le rayon a suivi
                 le kit (`md` → `card`, le vocabulaire n'en garde que deux). */
              <p className="mt-2 max-w-[62ch] rounded-card bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                {t(inviteWarningKey(state.serverState)!)}
              </p>
            )}
            <p className="mt-2 max-w-[62ch] text-xs leading-5 text-ink-soft">
              {t("invite.dialog.link_note")}
            </p>
            <div className="mt-6 flex justify-end">
              {/* La seule action de cet état: on a lu, on referme. Elle porte
                  donc la marque — et jamais en même temps que « Envoyer », les
                  deux branches étant exclusives. */}
              <Button variant="primary" onClick={onClose}>
                {t("common.close")}
              </Button>
            </div>
          </div>
        )
        : (
          <form onSubmit={send}>
            {/* ── LE CHAMP RECOPIÉ EST PARTI POUR `Field` + `inputClass` ────
                Sa classe maison portait `text-sm`, c'est-à-dire 14 px: Safari iOS
                ZOOME sur un champ dont le texte fait moins de 16 px au focus et
                NE DÉZOOME PAS en sortant. `inputClass` rend `text-base` sous `lg`
                et `text-sm` au-dessus, corrigé à la source pour les cent champs
                du produit. Elle bordait aussi en `gray-300` (1,86:1) là où WCAG
                1.4.11 exige 3:1 pour un composant: `border-line-strong` = 3,84:1.
                Et elle n'avait AUCUN anneau de focus — la règle `:focus-visible`
                de `tokens.css` ne couvre que `a`, `button` et `[tabindex]`, pas un
                champ. L'étiquette passe au cran `text-label` de la charte. */}
            <Field label={t("invite.email_label")} htmlFor="keel-invite-email">
              <input
                id="keel-invite-email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder={t("invite.dialog.email_placeholder")}
              />
            </Field>

            {/* ⚠️ `text-rose-700` EST DEVENU `text-red-700`, ET LE FAIT NE CHANGE
                PAS. C'est un échec, donc une couleur d'état — mais la famille
                « échec » du produit est le ROUGE (`Badge tone="critical"`,
                `Field`, `Button variant="danger"`), et `rose` n'était dans aucune
                des quatre: à 22° de la teinte de marque, il commençait à
                ressembler à un lien. `red-700` sur `paper` = 6,13:1. */}
            {state.kind === "error" && (
              <p className="mt-3 max-w-[62ch] text-sm leading-6 text-red-700">
                {state.message}
              </p>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              {/* « Annuler » est le geste qu'on peut ignorer, donc `ghost` — et il
                  reste neutre exprès: si les deux gestes d'une fenêtre portent la
                  marque, aucun ne la porte plus. */}
              <Button variant="ghost" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              {/* ⛔ LA FIGUE D'UNE FENÊTRE, ET ELLE NE COMPTE PAS CONTRE CELLE DE
                  `/coach`. Une fenêtre modale EST la vue rendue: elle recouvre la
                  page sous un voile `ink/40` et lui prend le clavier, donc le
                  bouton d'invitation qui l'a ouverte n'est ni visible ni
                  cliquable. C'est ici l'unique aplat de marque. */}
              <Button
                type="submit"
                variant="primary"
                disabled={state.kind === "sending" || email.trim() === ""}
              >
                {state.kind === "sending"
                  ? t("invite.dialog.sending")
                  : t("invite.send_button")}
              </Button>
            </div>
          </form>
        )}
    </Modal>
  );
}

export default InviteDialog;
