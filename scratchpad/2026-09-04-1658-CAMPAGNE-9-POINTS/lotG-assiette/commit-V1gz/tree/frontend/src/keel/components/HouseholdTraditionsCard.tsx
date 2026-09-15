import React from "react";

import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
import { Field, inputClass } from "./ui/Field";
import { t } from "../i18n/t";
import {
  loadTraditions,
  removeTradition,
  setTradition,
} from "../api/household";
import {
  type HouseholdTradition,
  MAX_TRADITIONS,
} from "../../../../supabase/functions/_shared/keel/household_traditions.ts";
import { DAY_TOKENS } from "../../../../supabase/functions/_shared/keel/tokens.ts";
import { householdErrorKey } from "../copy/planRefusals";

/**
 * ③ LES JOURS QUE LE FOYER NE DÉPLACE PAS — la carte, à l'étape 3.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POURQUOI ELLE EXISTE, ET POURQUOI SOUS L'ÉQUIPEMENT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * « Le dimanche c'est rôti », « vendredi poisson ». Casser un de ces jours fait
 * fermer l'app — **pas parce que le plat est mauvais, parce qu'il est
 * DÉPLACÉ**. C'est le meilleur rapport valeur/coût du chantier, et le seul qui
 * protège l'adhésion sans rien calculer.
 *
 * Sa place est juste après `KitchenEquipmentCard` parce que les deux répondent
 * à la même question — **ce que cette cuisine PEUT et FAIT déjà** — avant que
 * l'étape ne demande ce qu'on veut cette semaine. Les séparer par le midi au
 * travail ferait lire une habitude permanente comme une envie du moment.
 *
 * ── ⛔ ELLE ÉCRIT ELLE-MÊME, ET ELLE RELIT APRÈS ─────────────────────────
 * Même patron que la carte d'équipement juste au-dessus: son propre bouton,
 * sa propre relecture. Un brouillon porté par l'étape et enregistré par un
 * bouton d'à côté ferait deux écrivains sur une même porte, et c'est celui
 * qu'on regarde le moins qui écraserait l'autre.
 *
 * ⚠️ ET ELLE NE MONTRE RIEN TANT QU'ELLE N'A PAS LU. `traditions === null` veut
 * dire « pas encore lu », pas « aucune »: afficher « rien de posé » sur une
 * lecture qui n'a pas eu lieu ferait croire à un foyer que son dimanche a
 * disparu — et le premier geste par-dessus l'effacerait vraiment.
 */
export default function HouseholdTraditionsCard(
  { onSaved }: {
    /** Rejoué après chaque écriture — l'étape relit ce que la base a gardé. */
    onSaved?: () => void;
  },
): React.ReactElement {
  const [traditions, setTraditions] = React.useState<
    HouseholdTradition[] | null
  >(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [weekday, setWeekday] = React.useState<string>("sun");
  const [slot, setSlot] = React.useState<string>("dinner");
  const [label, setLabel] = React.useState("");

  const refresh = React.useCallback(async () => {
    try {
      setTraditions(await loadTraditions());
      setError(null);
    } catch (e) {
      // ⛔ ON NE REMET PAS `traditions` À `null` SUR UN ÉCHEC: ce qui a déjà été
      // lu reste vrai, et l'erreur se dit à côté.
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(fn: () => Promise<{ ok: boolean; reason: string }>) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        // Le refus arrive en PHRASE, jamais en jeton nu — même chemin que les
        // autres gestes du foyer.
        // ⛔ `householdErrorKey` REND `null` SUR UN MOTIF QU'AUCUNE COPIE NE
        // COUVRE, et on montre alors le jeton NU. C'est laid, et c'est le
        // point: un refus sans mots doit rester VISIBLE plutôt que de devenir
        // un bouton qui ne fait rien — « un geste qui ne fait rien est
        // indiscernable d'un geste qui a marché ».
        const key = householdErrorKey(res.reason);
        setError(key === null ? res.reason : t(key));
        return;
      }
      setError(null);
      setLabel("");
      await refresh();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const full = (traditions?.length ?? 0) >= MAX_TRADITIONS;
  // ⛔ TROIS MOMENTS PROPOSÉS, ET LA BASE EN ACCEPTE SIX. Une tradition est un
  // repas qu'on refait — personne ne dit « le mardi c'est goûter ». Proposer
  // les six ferait six cases pour trois usages, et le choix d'écran n'a pas à
  // être aussi large que la contrainte de base.
  const SLOTS = ["breakfast", "lunch", "dinner"] as const;

  return (
    <Card>
      <SectionLabel>{t("setup.traditions.title")}</SectionLabel>
      <p className="mb-3 text-sm text-ink-soft">{t("setup.traditions.hint")}</p>

      {error !== null
        ? <p className="mb-3 text-sm text-red-700">{error}</p>
        : null}

      {traditions === null ? null : traditions.length === 0
        ? (
          <p className="mb-3 text-sm text-ink-soft">
            {t("setup.traditions.empty")}
          </p>
        )
        : (
          <ul className="mb-3 flex flex-col gap-2">
            {traditions.map((tr) => (
              <li
                key={`${tr.weekday} ${tr.slot}`}
                className="flex flex-wrap items-center gap-2 rounded-card border border-line-strong bg-paper px-3 py-2.5 text-sm text-ink"
              >
                <span className="font-medium">
                  {t(`setup.traditions.day_${tr.weekday}` as "setup.traditions.day_mon")}
                </span>
                <span className="text-ink-soft">
                  {t(`setup.traditions.slot_${tr.slot}` as "setup.traditions.slot_dinner")}
                </span>
                {/* LES MOTS DU FOYER, TELS QUELS. On ne les traduit pas dans
                    notre vocabulaire: c'est SON dimanche. */}
                <span>— {tr.label}</span>
                <button
                  type="button"
                  disabled={busy}
                  className="ml-auto text-fig-700 underline"
                  onClick={() => void run(() => removeTradition(tr.weekday, tr.slot))}
                >
                  {t("setup.traditions.remove")}
                </button>
              </li>
            ))}
          </ul>
        )}

      {full
        ? <p className="text-sm text-ink-soft">{t("setup.traditions.full")}</p>
        : (
          <div className="flex flex-col gap-3">
            {/* `items-start` et `flex-wrap`: à 320 px les trois contrôles
                s'empilent, et `min-w-0` évite qu'un `select` déborde — un
                enfant flex ne rétrécit pas sous son contenu sans lui. */}
            <div className="flex flex-wrap items-start gap-2">
              <Field label={t("setup.traditions.weekday")} className="w-32">
                <select
                  className={`${inputClass} min-w-0`}
                  value={weekday}
                  onChange={(e) => setWeekday(e.target.value)}
                >
                  {DAY_TOKENS.map((d) => (
                    <option key={d} value={d}>
                      {t(`setup.traditions.day_${d}` as "setup.traditions.day_mon")}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("setup.traditions.slot")} className="w-36">
                <select
                  className={`${inputClass} min-w-0`}
                  value={slot}
                  onChange={(e) => setSlot(e.target.value)}
                >
                  {SLOTS.map((sl) => (
                    <option key={sl} value={sl}>
                      {t(`setup.traditions.slot_${sl}` as "setup.traditions.slot_dinner")}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={t("setup.traditions.label")}>
              <input
                className={`${inputClass} min-w-0`}
                value={label}
                maxLength={60}
                placeholder={t("setup.traditions.label_placeholder")}
                onChange={(e) => setLabel(e.target.value)}
              />
            </Field>
            <div>
              <Button
                variant="secondary"
                // ⛔ LE BOUTON RETIENT SUR UN LIBELLÉ VIDE, ET LA BASE AUSSI
                // (`empty_label`). Un motif construit sur une chaîne vide
                // matche TOUT, donc une tradition sans mot honorerait n'importe
                // quel plat — et un bouton grisé n'est pas une garde.
                disabled={busy || label.trim() === ""}
                onClick={() => void run(() => setTradition(weekday, slot, label.trim()))}
              >
                {t("setup.traditions.add")}
              </Button>
            </div>
          </div>
        )}
    </Card>
  );
}
