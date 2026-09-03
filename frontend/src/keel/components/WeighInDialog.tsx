// FF-062 C2 — LE RAPPEL DE PESÉE, dans l'app.
//
// ── UN SEUL CHAMP, ET C'EST LE POINT ───────────────────────────────────────
// Le point du dimanche demande jusqu'à huit choses. Celui-ci en demande UNE, et
// c'est ce qui rend une cadence de deux jours tenable: la question doit coûter
// dix secondes, sinon elle se fait couper — et elle emporte avec elle les cinq
// autres canaux, parce que c'est l'app qu'on mute, pas un message.
//
// ══════════════════════════════════════════════════════════════════════════
// R8 — LE PLACEHOLDER PORTE L'ANCIEN POIDS. LE CHAMP RESTE VIDE.
// ══════════════════════════════════════════════════════════════════════════
//
// Le défaut que cette règle ferme, dans ses termes exacts: *« un champ
// pré-rempli se valide sans être lu: on enregistrerait la valeur de la semaine
// dernière comme une pesée d'aujourd'hui, et la série mentirait sans qu'aucune
// erreur ne soit levée »*. Une série de poids arme `restriction_guard` — c'est
// une ceinture de sécurité, pas un graphique.
//
// ⚠️ ET LE PLACEHOLDER CHANGE DE NATURE PAR RAPPORT AU POINT DU DIMANCHE. Là-bas
// il porte le LIBELLÉ (« Poids (kg) ») parce que le champ est un parmi huit.
// Ici il porte le DERNIER POIDS, et le libellé passe en `aria-label` et en
// légende. Un placeholder qui montre « 78,4 » sur un champ vide dit deux choses
// d'un coup: ce qu'on attend, et d'où on part.
//
// ── LA GATE DE MONTAGE ─────────────────────────────────────────────────────
// `lastKg === undefined` = « on ne sait pas encore » et le formulaire NE SE
// MONTE PAS. Afficher un placeholder générique puis le remplacer par un chiffre
// sous les doigts de l'élève est la forme visible du défaut que
// `mount-snapshot-forms-need-a-loading-gate` décrit. `null` est une réponse
// (jamais pesé, ou lecture en panne) et le formulaire s'ouvre alors avec le
// libellé — perdre le repère coûte moins que perdre la pesée.

import React from "react";
import { Button } from "./ui/Button";
import { inputClass } from "./ui/Field";
import {
  buildWeighInSubmission,
  type WeighInSubmissionError,
} from "../api/weighIn";
import { formatNumber } from "../i18n/format";
import { t } from "../i18n/t";

export type WeighInValues = { weight_kg: number };

export function WeighInDialog({
  onSubmit,
  onCancel,
  busy,
  lastKg,
}: {
  onSubmit: (values: WeighInValues) => void;
  onCancel: () => void;
  busy?: boolean;
  /**
   * Le dernier poids, pour le PLACEHOLDER. `undefined` = pas encore su (le
   * formulaire ne se monte pas), `null` = il n'y en a pas.
   *
   * Requis et non optionnel: un défaut ferait décider l'absence de la prop à la
   * place de l'appelant — la classe de défaut la plus fréquente de ce dépôt
   * (`optional-gate-params-are-disarmed-gates`).
   */
  lastKg: number | null | undefined;
}) {
  const [weight, setWeight] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const messageFor = (e: WeighInSubmissionError): string => {
    switch (e.kind) {
      case "not_a_number":
        return t("chat.weighin.error.number");
      case "out_of_range":
        return t("chat.weighin.error.range", {
          min: String(e.min),
          max: String(e.max),
        });
      case "empty":
        return t("chat.weighin.error.empty");
    }
  };

  const submit = (event: React.FormEvent) => {
    // `preventDefault` en PREMIER, avant toute condition de sortie: un `return`
    // placé avant ferait partir le formulaire en soumission native, donc
    // rechargerait la page et perdrait la saisie sans rien dire.
    event.preventDefault();
    setError(null);
    const built = buildWeighInSubmission(weight);
    if (!built.ok) return setError(messageFor(built.error));
    onSubmit(built.values);
  };

  // LA GATE DE MONTAGE — voir l'en-tête.
  if (lastKg === undefined) return null;

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-line-strong bg-paper p-4"
      aria-label={t("chat.weighin.title")}
      data-testid="weigh-in"
      // Lisible depuis un test: c'est ce qui permet d'épingler « le champ est
      // vide alors qu'un ancien poids est connu » sans lire un DOM rendu.
      data-last-kg={lastKg === null ? "none" : String(lastKg)}
    >
      <h2 className="text-base font-semibold text-ink">
        {t("chat.weighin.title")}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">{t("chat.weighin.subtitle")}</p>

      <div className="mt-4 max-w-[10rem]">
        <input
          // ⛔ `value` EST L'ÉTAT, ET L'ÉTAT PART VIDE. C'est R8 en une ligne:
          // rien ici ne lit `lastKg` pour en faire une valeur.
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          inputMode="decimal"
          // Le dernier poids comme REPÈRE. Sans lui, le libellé — un champ
          // nommé « Poids (kg) » ne dit pas d'où on part.
          // ⚠️ `formatNumber`, PAS `String(lastKg)`. 78,4 en français, 78.4 en
          // anglais — et le champ accepte les deux à la saisie
          // (`buildWeighInSubmission` remplace la virgule). Un placeholder qui
          // montrerait un point à un élève francophone lui suggérerait une
          // forme que son clavier ne produit pas.
          placeholder={lastKg === null
            ? t("chat.weighin.field")
            : formatNumber(lastKg, { maximumFractionDigits: 1 })}
          aria-label={t("chat.weighin.field")}
          className={inputClass}
          autoFocus
        />
      </div>

      {/* ⛔ UN FAIT. Rouge = échec, `red-700` (6,13:1) comme partout ailleurs. */}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 flex gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {t("chat.weighin.submit")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          {t("chat.weighin.cancel")}
        </Button>
      </div>
    </form>
  );
}

export default WeighInDialog;
