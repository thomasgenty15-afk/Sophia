import React from "react";
import {
  type EatingStructure,
  loadEatingStructure,
} from "../api/eatingStructure";
import type { MouthFormDraft } from "./mouthForm";

/**
 * CE QUE LE CORPS EN COURS DE SAISIE EXIGE — recalculé quand il change.
 *
 * Autorité: `docs/fonctionnalites/composition-des-repas/FF-060-...md`
 *
 * ── ⛔ AUCUN CALCUL ICI, ET C'EST LE POINT ───────────────────────────────
 * Ce crochet APPELLE. Il ne dérive rien, ne connaît aucune formule d'énergie,
 * et n'a pas de repli « à peu près ». Le jour où il en aurait un, l'écran et le
 * plan diraient deux choses différentes — et le désaccord serait invisible,
 * parce que chacun aurait raison chez lui.
 *
 * ── LA TEMPORISATION, ET CE QU'ELLE ÉVITE ────────────────────────────────
 * Le poids se tape chiffre par chiffre: « 8 », « 84 ». Sans attente, on
 * appellerait sur « 8 » — un corps de huit kilos, qui rend un compte absurde
 * l'espace d'un rendu. La même règle que les trois nombres du shaker.
 *
 * ── ET UNE RÉPONSE EN RETARD NE DOIT PAS ÉCRASER LA SUIVANTE ─────────────
 * Deux frappes rapprochées lancent deux appels; celui d'AVANT peut revenir
 * après. Le jeton de séquence est ce qui empêche le verrou de clignoter sur une
 * valeur que la personne a déjà corrigée.
 */
export function useEatingStructure(args: {
  draft: MouthFormDraft | null;
  /** Ouverte ? Fermée, on ne demande rien: la fiche n'est pas devant les yeux. */
  active: boolean;
  todayLocalIso: string;
}): EatingStructure | null {
  const { draft, active, todayLocalIso } = args;
  const [structure, setStructure] = React.useState<EatingStructure | null>(null);

  // Ce qui DOIT relancer le calcul, et rien d'autre. Le prénom, les dégoûts et
  // les allergies n'y sont pas: ils ne déplacent aucun besoin.
  const weightKg = draft?.weightKg ?? "";
  const heightCm = draft?.heightCm ?? "";
  const gender = draft?.gender ?? "";
  const birthDate = draft?.birthDate ?? "";
  const activityLevel = draft?.activityLevel ?? "";
  const dayActivity = draft?.dayActivity ?? "";
  const sportFrequency = draft?.sportFrequency ?? "";
  const goal = draft?.goal ?? "";
  const pace = draft?.paceKgPerWeek ?? "";
  const rhythmKey = (draft?.rhythm ?? []).map((r) => r.slot).sort().join(",");
  const hasShaker = draft?.shaker !== null && draft?.shaker !== undefined;

  React.useEffect(() => {
    if (!active) return;
    const kg = Number(weightKg);
    // ⚠️ PAS D'APPEL SANS POIDS. Le serveur rendrait `no_body`, ce qui est juste
    // — mais c'est un aller-retour pour apprendre ce que l'écran sait déjà.
    if (!Number.isFinite(kg) || kg <= 0) {
      setStructure(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      const years = ageYearsFrom(birthDate, todayLocalIso);
      void loadEatingStructure({
        kind: "draft",
        weightKg: kg,
        heightCm: numOrNull(heightCm),
        gender: strOrNull(gender),
        ageYears: years,
        activityLevel: strOrNull(activityLevel),
        dayActivity: strOrNull(dayActivity),
        sportFrequency: strOrNull(sportFrequency),
        goal: strOrNull(goal),
        paceKgPerWeek: numOrNull(pace),
        declaredSlots: rhythmKey.length > 0 ? rhythmKey.split(",") : [],
        hasFixedIntake: hasShaker,
      }).then((next) => {
        // Le nettoyage a couru: cette réponse est périmée, et l'écrire ferait
        // clignoter le verrou sur une valeur déjà corrigée.
        if (alive) setStructure(next);
      });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [
    active,
    weightKg,
    heightCm,
    gender,
    birthDate,
    activityLevel,
    dayActivity,
    sportFrequency,
    goal,
    pace,
    rhythmKey,
    hasShaker,
    todayLocalIso,
  ]);

  return structure;
}

function numOrNull(v: string): number | null {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function strOrNull(v: string): string | null {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
}

/**
 * L'ÂGE, DEPUIS LA DATE LOCALE QU'ON NOUS DONNE — jamais `new Date()` au rendu.
 *
 * Un `new Date()` ici changerait de réponse à minuit pendant qu'on remplit le
 * formulaire, et rendrait ce crochet intestable sur la valeur. C'est la même
 * décision que `todayLocalIso` sur la fiche.
 */
function ageYearsFrom(birthDate: string, todayLocalIso: string): number | null {
  const b = String(birthDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b) || !/^\d{4}-\d{2}-\d{2}$/.test(todayLocalIso)) {
    return null;
  }
  const [by, bm, bd] = b.split("-").map(Number);
  const [ty, tm, td] = todayLocalIso.split("-").map(Number);
  let years = ty - by;
  if (tm < bm || (tm === bm && td < bd)) years -= 1;
  return years > 0 && years < 130 ? years : null;
}
