// ⟳ 2026-09-24 — SORTI DE `HouseholdPage.tsx` (découpage, lot 4c), À L'IDENTIQUE.
// La carte « crée ton foyer », rendue quand il n'y en a pas.
// Le fichier d'origine l'atteint par ses imports; il ré-exporte ce qu'il exportait.

import React from "react";
import { t } from "../../i18n/t";
import { Button } from "../../components/ui/Button";
import { Card, SectionLabel } from "../../components/ui/Card";
import { Field, inputClass } from "../../components/ui/Field";

export function CreateCard(
  { busy, onCreate }: { busy: boolean; onCreate: (name: string) => void },
) {
  const [name, setName] = React.useState("");
  // ── LE CHOIX DU MODE A DISPARU (lot 2, 2026-08-10) ────────────────────────
  // Il fallait cocher « famille » ou « colocation », et ce choix gouvernait le
  // droit de restreindre et la visibilité des objectifs. La colocation est
  // sortie du produit: un foyer est un foyer, et la personne qui cuisine
  // gouverne le menu. Un écran de moins, une question de moins, et surtout plus
  // aucune façon de se tromper de mode en s'inscrivant.

  return (
    <Card>
      <SectionLabel>{t("household.empty.title")}</SectionLabel>
      <p className="mb-3 text-sm text-ink-soft">{t("household.empty.body")}</p>
      <Field label={t("household.create.name")}>
        <input
          className={inputClass}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Button
        className="mt-3"
        disabled={busy || !name.trim()}
        onClick={() => onCreate(name.trim())}
      >
        {t("household.create.submit")}
      </Button>
    </Card>
  );
}
