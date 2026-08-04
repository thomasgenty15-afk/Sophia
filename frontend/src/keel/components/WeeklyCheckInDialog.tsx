// KEEL — LE POINT HEBDOMADAIRE, dans l'app.
//
// ── CE QUI REMPLACE QUOI ─────────────────────────────────────────────────────
// C'était un WhatsApp Flow : deux écrans déclarés chez Meta, un `flow_id` à
// configurer, un template de repli hors fenêtre 24 h, et un `flow_token` qui
// faisait l'aller-retour par le client de l'élève. Tout ça disparaît. Reste ce
// qui comptait : six axes 1-5, puis deux mesures entièrement facultatives.
//
// ── LE JETON NE PORTE QUE LA SEMAINE ─────────────────────────────────────────
// Règle héritée, et non négociable : `token` dit QUELLE SEMAINE, jamais QUI.
// L'élève est identifié par son JWT côté serveur. Un jeton qui porterait un
// identifiant serait un identifiant modifiable désignant la ligne à écrire.
//
// ── HORS BORNES = REFUSÉ ET NOMMÉ, jamais ramené au bord ─────────────────────
// Un 500 kg ramené à 400 produit une donnée fausse qui a l'air vraie. Le
// serveur applique déjà cette règle (`readMeasure`) ; l'écran la reflète pour
// que l'élève voie son erreur au lieu de la subir en silence.

import React from "react";
import { Button } from "./ui/Button";
import {
  WEEKLY_AXES,
  WEEKLY_AXIS_LABELS,
  WEEKLY_SCALE_LABELS,
  WAIST_CM_MAX,
  WAIST_CM_MIN,
  WEIGHT_KG_MAX,
  WEIGHT_KG_MIN,
  type WeeklyAxis,
} from "../api/weeklyCheckIn";
import { t } from "../i18n/t";

export type WeeklyCheckInValues = Record<string, number>;

export function WeeklyCheckInDialog({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit: (values: WeeklyCheckInValues) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [scores, setScores] = React.useState<Partial<Record<WeeklyAxis, number>>>({});
  const [weight, setWeight] = React.useState("");
  const [waist, setWaist] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const readMeasure = (
    raw: string,
    min: number,
    max: number,
    label: string,
  ): { ok: true; value: number | null } | { ok: false; message: string } => {
    const text = raw.trim();
    if (!text) return { ok: true, value: null };
    const n = Number(text.replace(",", "."));
    if (!Number.isFinite(n)) {
      return { ok: false, message: t("chat.weekly.error.number", { field: label }) };
    }
    if (n < min || n > max) {
      return {
        ok: false,
        message: t("chat.weekly.error.range", {
          field: label,
          min: String(min),
          max: String(max),
        }),
      };
    }
    return { ok: true, value: n };
  };

  const submit = (event: React.FormEvent) => {
    // `preventDefault` en PREMIER, avant toute condition de sortie: un `return`
    // placé avant ferait partir le formulaire en soumission native, donc
    // rechargerait la page et perdrait la saisie sans rien dire. Défaut mesuré
    // sur la bulle, corrigé là-bas, évité ici.
    event.preventDefault();
    setError(null);

    const w = readMeasure(weight, WEIGHT_KG_MIN, WEIGHT_KG_MAX, t("chat.weekly.weight"));
    if (!w.ok) return setError(w.message);
    const c = readMeasure(waist, WAIST_CM_MIN, WAIST_CM_MAX, t("chat.weekly.waist"));
    if (!c.ok) return setError(c.message);

    const values: WeeklyCheckInValues = {};
    for (const axis of WEEKLY_AXES) {
      const score = scores[axis];
      if (typeof score === "number") values[axis] = score;
    }
    if (Object.keys(values).length === 0) {
      return setError(t("chat.weekly.error.empty"));
    }
    if (w.value !== null) values.weight_kg = w.value;
    if (c.value !== null) values.waist_cm = c.value;
    onSubmit(values);
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-gray-200 bg-white p-4"
      aria-label={t("chat.weekly.title")}
      data-testid="weekly-checkin"
    >
      <h2 className="text-base font-semibold text-gray-900">
        {t("chat.weekly.title")}
      </h2>
      <p className="mt-1 text-sm text-gray-600">{t("chat.weekly.subtitle")}</p>

      <div className="mt-4 flex flex-col gap-3">
        {WEEKLY_AXES.map((axis) => (
          <div key={axis}>
            <p className="text-sm font-medium text-gray-800">
              {WEEKLY_AXIS_LABELS[axis]}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  key={score}
                  type="button"
                  aria-pressed={scores[axis] === score}
                  aria-label={`${WEEKLY_AXIS_LABELS[axis]}: ${WEEKLY_SCALE_LABELS[score]}`}
                  onClick={() => setScores((prev) => ({ ...prev, [axis]: score }))}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    scores[axis] === score
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {WEEKLY_SCALE_LABELS[score]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-gray-500">{t("chat.weekly.optional")}</p>
      <div className="mt-1 flex gap-2">
        <input
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          inputMode="decimal"
          placeholder={t("chat.weekly.weight")}
          aria-label={t("chat.weekly.weight")}
          className="w-32 rounded-full border border-gray-300 px-3 py-1.5 text-sm"
        />
        <input
          value={waist}
          onChange={(e) => setWaist(e.target.value)}
          inputMode="decimal"
          placeholder={t("chat.weekly.waist")}
          aria-label={t("chat.weekly.waist")}
          className="w-32 rounded-full border border-gray-300 px-3 py-1.5 text-sm"
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {t("chat.weekly.submit")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          {t("chat.weekly.cancel")}
        </Button>
      </div>
    </form>
  );
}

export default WeeklyCheckInDialog;
