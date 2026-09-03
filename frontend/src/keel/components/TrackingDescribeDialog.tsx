import React from "react";

import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { Field, inputClass } from "./ui/Field";
import { t } from "../i18n/t";
import { slotLabel } from "../api/labels";
import { describeMissedMeal } from "../api/tracking";

/**
 * « DÉCRIRE » UN CRÉNEAU LOUPÉ — un champ libre, et rien d'autre.
 *
 * ⛔ CE FORMULAIRE NE DEMANDE PAS DE QUANTITÉ, ET C'EST STRUCTUREL.
 * `_shared/keel/meal_precision.ts` refuse qu'une question de précision porte
 * une mesure — ses gabarits sont FERMÉS et un test les passe au crible d'un
 * lexique de quantité, dans les deux langues. Ce chemin-ci ne pose aucune
 * question: il ouvre un champ. Si la personne y écrit « 150 g de riz », c'est
 * ELLE qui a mesuré, et `quantity_from_prose.ts` sait relire un nombre écrit —
 * la lecture porte alors `declared_quantities` au lieu de `photo_estimate`.
 * D7.7: le contournement de `meal_precision.ts` est EXPRÈS. Il ne serait une
 * faute que si le placeholder ou le sous-titre RÉCLAMAIT des grammes; ils
 * disent l'inverse, en toutes lettres, dans les deux packs.
 *
 * ⚠️ `Modal` rend `null` fermé SANS DÉMONTER, et passe par
 * `createPortal(document.body)`. Le corps est donc écrit ici et testé seul —
 * les tests montent les corps, jamais le chrome.
 */
export function TrackingDescribeDialog(
  { open, localDate, slot, onClose, onRecorded }: {
    open: boolean;
    localDate: string;
    slot: string;
    onClose: () => void;
    /** Appelé après un enregistrement réussi, pour que la page recharge. */
    onRecorded: () => void;
  },
) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Un changement de créneau remet le champ à zéro: réutiliser le texte du
  // repas d'avant est le pire des défauts par défaut sur un formulaire de
  // déclaration.
  React.useEffect(() => {
    setText("");
    setError(null);
  }, [localDate, slot]);

  async function submit() {
    const value = text.trim();
    if (value.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await describeMissedMeal({ localDate, slot, text: value });
      if (!result.ok) {
        // Un refus NOMMÉ arrive en 200 avec sa raison — il ne doit pas se lire
        // comme une panne. On rend le jeton tel quel plutôt que d'inventer une
        // phrase: un jeton inconnu se voit, une phrase inventée se croit.
        setError(result.reason ?? "unknown");
        return;
      }
      onRecorded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("tracking.describe.title")}
      closeLabel={t("tracking.describe.cancel")}
    >
      <p className="max-w-[62ch] text-sm leading-6 text-ink-soft break-words">
        {t("tracking.describe.subtitle")}
      </p>
      <Field label={slotLabel(slot)} htmlFor="tracking-describe" className="mt-3">
        <textarea
          id="tracking-describe"
          className={`${inputClass} min-h-[7rem]`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("tracking.describe.placeholder")}
        />
      </Field>
      {error
        ? (
          <p className="mt-2 max-w-[62ch] text-sm text-ink break-words">
            {t("tracking.describe.error", { message: error })}
          </p>
        )
        : null}
      <div className="mt-4 flex gap-2">
        <Button
          variant="primary"
          onClick={submit}
          disabled={busy || text.trim().length === 0}
        >
          {busy ? t("tracking.describe.submitting") : t("tracking.describe.submit")}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          {t("tracking.describe.cancel")}
        </Button>
      </div>
    </Modal>
  );
}

export default TrackingDescribeDialog;
