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
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * DE QUI PARLE CETTE RÉPONSE — REQUIS, ET C'EST UN DÉFAUT MESURÉ
   * ═══════════════════════════════════════════════════════════════════════
   *
   * ── CE QUI EST ARRIVÉ, REPRODUIT LE 2026-09-19 DANS L'ENTONNOIR ────────
   * Signalé: « j'ai tout coché pour un user et ça a tout coché automatiquement
   * pour les autres, alors que les recommandations devraient être faites
   * individuellement ». Vérifié à l'écran, sur un foyer neuf:
   *
   *   1. la fiche du TITULAIRE s'ouvre, son corps donne quatre moments, il
   *      coche les six;
   *   2. il ferme, et il ouvre la fiche de LUCIE;
   *   3. les six cases de Lucie sont cochées. Elle n'a ni corps ni réponse.
   *
   * ── LA CAUSE, ET ELLE N'ÉTAIT PAS DANS LA PRÉ-COCHE ────────────────────
   * `SetupPage` monte UN SEUL crochet pour les trois sujets (soi, la bouche
   * qu'on ajoute, la bouche qu'on reprend) — c'est légitime, c'est le même
   * écran. Mais l'état, lui, SURVIVAIT au changement de sujet: `if (!active)
   * return` sortait sans rien effacer, et la première image de la fiche
   * suivante recevait donc la réponse de la PRÉCÉDENTE. La pré-coche de
   * `MouthPreferencesFields` s'arme une fois et se verrouille (`prefilled`):
   * elle mordait sur cette image-là, avant que l'appel de la nouvelle fiche —
   * ou son abandon faute de corps — n'ait eu le temps de répondre.
   *
   * ── CE QUE CE PARAMÈTRE FAIT, ET POURQUOI PAS UN `useEffect` DE PLUS ───
   * Il est comparé AU RENDU, pas dans un effet: une réponse qui ne porte pas
   * le sujet courant n'est simplement pas rendue. Un effet de nettoyage aurait
   * couru APRÈS le rendu fautif — c'est-à-dire après la morsure.
   *
   * ⛔ JAMAIS OPTIONNEL. Un défaut (`""` pour tout le monde) rendrait toutes
   * les fiches identiques du point de vue de cette garde, ce qui est
   * exactement l'état d'avant — et il reviendrait au premier appelant
   * distrait. Un identifiant stable et DISTINCT par personne: `self`, `new`,
   * `member:<id>`.
   */
  subject: string;
}): EatingStructure | null {
  const { draft, active, todayLocalIso, subject } = args;
  /**
   * LA RÉPONSE **ET** DE QUI ELLE PARLE. Les deux ensemble, jamais deux états
   * séparés: deux `useState` se mettraient à jour en deux rendus, et le rendu
   * du milieu porterait la réponse de l'un sous le nom de l'autre.
   *
   * `value: null` EST UNE RÉPONSE POUR CE SUJET — « on a regardé, il n'y a pas
   * de corps ». Elle se distingue de `null` tout court, qui veut dire « on n'a
   * rien calculé pour lui »; les deux se rendent pareil, et c'est la lecture
   * qui compte.
   */
  const [computed, setComputed] = React.useState<
    { subject: string; value: EatingStructure | null } | null
  >(null);

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
      // « Regardé, pas de corps » — POUR CE SUJET. Le nom voyage avec la
      // réponse, sinon l'abstention de l'un effacerait le calcul de l'autre.
      setComputed({ subject, value: null });
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
        if (alive) setComputed({ subject, value: next });
      });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [
    active,
    // ⛔ LE SUJET EST UNE DÉPENDANCE, ET PAS SEULEMENT UN FILTRE DE RENDU: deux
    // personnes peuvent porter le MÊME corps (des jumeaux, une fiche recopiée),
    // et sans lui l'effet ne repartirait pas — la seconde resterait sur
    // « rien calculé » pour toujours.
    subject,
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

  // ⛔ LA GARDE EST ICI, AU RENDU. Une réponse qui parle de quelqu'un d'autre
  // n'est pas « un peu périmée »: elle est fausse, et la fiche d'en face la
  // recopierait en cases cochées sur une personne qui n'a rien dit.
  return computed !== null && computed.subject === subject ? computed.value : null;
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
