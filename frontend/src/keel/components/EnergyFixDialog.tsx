// FF-062 R11 — LE CHIFFRE, CORRIGÉ PAR LA PERSONNE.
//
// ── POURQUOI CE DIALOGUE EXISTE ────────────────────────────────────────────
// L'accusé d'une photo peut porter un chiffre d'énergie, et ce chiffre est
// DEVINÉ: −26,6 % de biais mesuré, toujours du même côté, pire sur les gros
// repas. Sans un moyen de le corriger, la seule chose que le produit peut faire
// d'un chiffre qu'il sait faux est de l'afficher.
//
// Corriger le fait changer de BASE côté serveur — c'est là que la bascule vit,
// et pas ici: une base décidée par le client serait une base que le client
// choisit.
//
// ── LE CHAMP EST VIDE, ET IL N'A PAS DE PLACEHOLDER CHIFFRÉ ───────────────
// Même règle que le rappel de pesée (R8): un champ pré-rempli se valide sans
// être lu, et on réécrirait le chiffre DEVINÉ en le faisant passer pour une
// déclaration — c'est-à-dire qu'on effacerait la distinction même que cette
// correction existe pour établir.
//
// ⚠️ MAIS LE CHIFFRE ACTUEL N'Y EST PAS NON PLUS, ET C'EST UNE DIFFÉRENCE
// ASSUMÉE AVEC LA PESÉE. Là-bas, le dernier poids date de plusieurs jours et
// n'est nulle part à l'écran: le placeholder le rappelle, et il gagne sa place.
// Ici, le chiffre est dans LA BULLE JUSTE AU-DESSUS du dialogue — le répéter
// n'apprend rien, et l'obtenir demanderait soit de le lire dans une prose
// rendue (fragile), soit de le porter dans le jeton (une valeur que le client
// réécrit). On ne construit pas ce mécanisme pour zéro gain.

import React from "react";
import { Button } from "./ui/Button";
import { inputClass } from "./ui/Field";
import {
  buildEnergyFixSubmission,
  type EnergyFixError,
} from "../api/energyFix";
import { t } from "../i18n/t";

export type EnergyFixValues = { kcal: number };

export function EnergyFixDialog({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit: (values: EnergyFixValues) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [kcal, setKcal] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const messageFor = (e: EnergyFixError): string => {
    switch (e.kind) {
      case "not_a_number":
        return t("chat.kcalfix.error.number");
      case "out_of_range":
        return t("chat.kcalfix.error.range", {
          min: String(e.min),
          max: String(e.max),
        });
      case "empty":
        return t("chat.kcalfix.error.empty");
    }
  };

  const submit = (event: React.FormEvent) => {
    // `preventDefault` en PREMIER: un `return` placé avant ferait partir le
    // formulaire en soumission native, donc rechargerait la page.
    event.preventDefault();
    setError(null);
    const built = buildEnergyFixSubmission(kcal);
    if (!built.ok) return setError(messageFor(built.error));
    onSubmit(built.values);
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-line-strong bg-paper p-4"
      aria-label={t("chat.kcalfix.title")}
      data-testid="energy-fix"
    >
      <h2 className="text-base font-semibold text-ink">
        {t("chat.kcalfix.title")}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">{t("chat.kcalfix.subtitle")}</p>

      <div className="mt-4 max-w-[10rem]">
        <input
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          inputMode="decimal"
          placeholder={t("chat.kcalfix.field")}
          aria-label={t("chat.kcalfix.field")}
          className={inputClass}
          autoFocus
        />
      </div>

      {/* ⛔ UN FAIT. Rouge = échec, `red-700` (6,13:1) comme partout ailleurs. */}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 flex gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {t("chat.kcalfix.submit")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          {t("chat.kcalfix.cancel")}
        </Button>
      </div>
    </form>
  );
}

export default EnergyFixDialog;
