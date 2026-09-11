import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { logEdgeFunctionError } from "../error-log.ts";
import { canShowTarget } from "./energy_gate.ts";
import type { EnergyGateLoad } from "./energy_gate_io.ts";
import {
  directedRange,
  ENERGY_TARGET_BASIS_BODY,
  maintenanceRange,
  type TargetDirectionGap,
} from "./energy_target.ts";
import {
  cancelsEnergyDeficit,
  conditionGatePopulationOf,
} from "./condition_energy_gate.ts";
import {
  ACTIVITY_LEVELS,
  type ActivityLevel,
  foldRetiredGoal,
} from "./tokens.ts";
import { latest, loadStudentBody } from "./student_body_io.ts";
import { EATING_OCCASIONS, parseAwayDays } from "./meal_generation.ts";
import { dayEnergyFor, estimatedMaintenanceKcal } from "./meal_envelope.ts";
import type { MemberAddon } from "./plan_energy.ts";
import type { MemberAway } from "./household_presence.ts";
import type { MouthBody } from "./meal_envelope.ts";
import {
  DEFAULT_PACE_KG_PER_WEEK,
  energyFloorFor,
  executedPaceFor,
  paceUnavailableReason,
  maintenancePaceFor,
} from "./weight_pace.ts";
import { ageBandOf, usableAge } from "./student_age.ts";
// ⟳ 2026-09-10 — L'APPÉTIT DU TITULAIRE. Voir `own_mouth_io.ts`: il vit sur sa
// ligne de foyer, la question lui est posée au « tu », et ce chargeur-ci
// posait `null` en dur.
import { loadOwnMouthBody } from "./own_mouth_io.ts";
const FN_NAME = "meal-energy-v1";
export interface PlanRow {
  id: string;
  plan_kind: string | null;
  servings: number | null;
  dishes: unknown;
  preparations: unknown;
  household_id: string | null;
  generated_from: unknown;
}

export function readViewerAddons(
  row: PlanRow,
  viewerMemberId: string | null,
): MemberAddon[] | null {
  if (row.plan_kind !== "household") return [];
  if (!viewerMemberId) return null;
  const gf = (row.generated_from ?? {}) as Record<string, unknown>;
  const household = (gf.household ?? {}) as Record<string, unknown>;
  if (!("member_deltas" in household)) return null;
  const raw = household.member_deltas;
  if (!Array.isArray(raw)) return null;
  const out: MemberAddon[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const d = entry as Record<string, unknown>;
    if (String(d.member_id ?? "").trim() !== viewerMemberId) continue;
    const foodRef = String(d.food_ref ?? "").trim();
    const grams = Number(d.grams);
    if (!foodRef || !Number.isFinite(grams) || grams <= 0) continue;
    out.push({ foodRef, grams });
  }
  return out;
}

export function readViewerMealsOut(
  row: PlanRow,
  viewerMemberId: string | null,
): Map<string | null, number> {
  const out = new Map<string | null, number>();
  if (row.plan_kind !== "household" || !viewerMemberId) return out;
  const gf = (row.generated_from ?? {}) as Record<string, unknown>;
  const household = (gf.household ?? {}) as Record<string, unknown>;
  const presence = (household.presence ?? {}) as Record<string, unknown>;
  const members = presence.members;
  if (!Array.isArray(members)) return out;
  for (const entry of members) {
    if (!entry || typeof entry !== "object") continue;
    const m = entry as Record<string, unknown>;
    if (String(m.member_id ?? "").trim() !== viewerMemberId) continue;
    const cells = m.eating_out;
    if (!Array.isArray(cells)) continue;
    for (const cell of cells) {
      if (!cell || typeof cell !== "object") continue;
      const c = cell as Record<string, unknown>;
      const day = String(c.day ?? "").trim();
      if (!day) continue;
      const slots = Array.isArray(c.slots) ? c.slots.length : 0;
      out.set(
        day,
        (out.get(day) ?? 0) + (slots > 0 ? slots : EATING_OCCASIONS.length),
      );
    }
  }
  return out;
}

export function readViewerAway(
  row: PlanRow,
  viewerMemberId: string | null,
): MemberAway | null {
  if (row.plan_kind !== "household" || !viewerMemberId) return null;
  const gf = (row.generated_from ?? {}) as Record<string, unknown>;
  const household = (gf.household ?? {}) as Record<string, unknown>;
  const presence = (household.presence ?? {}) as Record<string, unknown>;
  const members = presence.members;
  if (!Array.isArray(members)) return null;
  for (const entry of members) {
    if (!entry || typeof entry !== "object") continue;
    const m = entry as Record<string, unknown>;
    if (String(m.member_id ?? "").trim() !== viewerMemberId) continue;
    return {
      effective: parseAwayDays(m.away),
      self: [],
      household: [],
      eatingOut: parseAwayDays(m.eating_out),
    };
  }
  return null;
}

export async function loadDailyEnergyTarget(
  admin: SupabaseClient,
  userId: string,
  loaded: EnergyGateLoad,
  requestId: string,
) {
  const { today, goalsRow, direction, ageVerdict } = loaded;
  if (
    !canShowTarget({ energy: loaded.gate, targetSwitch: loaded.targetSwitchOn })
      .show
  ) return null;
  const body = await loadStudentBody(admin as never, userId, today);
  const last = latest(body.weights);
  const activityRes = await admin
    .from("profiles")
    .select("activity_level")
    .eq("id", userId)
    .maybeSingle();
  const rawActivity = String(
    (activityRes.data as Record<string, unknown> | null)?.activity_level ?? "",
  ).trim();
  const activityLevel: ActivityLevel | null =
    (ACTIVITY_LEVELS as readonly string[]).includes(rawActivity)
      ? (rawActivity as ActivityLevel)
      : null;
  const range = maintenanceRange({
    weightKg: last?.value ?? null,
    weightWeekStart: last?.weekStart ?? null,
    activityLevel,
  });

  const pc = (goalsRow?.practical_constraints ?? null) as
    | Record<string, unknown>
    | null;
  // ⟳ 2026-09-09 — LES DEUX AXES ENTRENT ICI, ET ILS VIENNENT DU CHARGEUR.
  // `{day: null, sport: null, asked: false}` vivait en dur à cette ligne. Ce
  // n'était pas une hypothèse prudente: `profiles.day_activity` et
  // `sport_frequency` sont ÉCRITS par l'entonnoir solo depuis le 2026-08-20, et
  // personne ne les relisait — le facteur servi était 1,5 (« on ne sait pas »)
  // à des gens qui avaient répondu aux deux questions.
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-10 — L'APPÉTIT ENTRE ICI AUSSI, ET C'EST LA CONDITION DU LOT
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE CHIFFRE EST CELUI QUE LA PERSONNE LIT. Le moteur, depuis ce lot, lit
  // l'appétit (`estimatedMaintenanceKcal` → `appetiteFactorOf`, ±10 %). Le
  // laisser à `null` ICI rouvrirait exactement le défaut du 2026-09-09 — deux
  // nombres sur le même écran, en désaccord sur la même personne — au dixième
  // près cette fois au lieu de 500 kcal, ce qui le rendrait plus difficile à
  // voir, pas moins faux.
  //
  // ⚠️ AUCUNE PANNE NE LÈVE: `loadOwnMouthBody` rend `appetite: null` — le
  // nombre d'avant ce lot — et journalise.
  const ownMouthHousehold = await admin.rpc("keel_household_of", { p_user: userId });
  const ownMouth = await loadOwnMouthBody(
    admin,
    userId,
    ownMouthHousehold.error ? null : String(ownMouthHousehold.data ?? "").trim() || null,
    FN_NAME,
  );
  const mouthBody: MouthBody = {
    heightCm: body.heightCm,
    weightKg: last?.value ?? null,
    gender: body.gender,
    ageYears: usableAge(ageVerdict),
    activityLevel,
    activityAxes: body.activityAxes,
    appetite: ownMouth.appetite,
  };
  const subject = {
    body: mouthBody,
    isMinor: ageVerdict.status === "minor",
  };
  const pace = Number(goalsRow?.target_pace_kg_per_week);

  let conditionCancelled: TargetDirectionGap | null = null;
  try {
    const condRes = await admin
      .from("student_safety_constraints")
      .select("condition_ref")
      .eq("user_id", userId)
      .not("condition_ref", "is", null);
    if (condRes.error) throw condRes.error;
    const refs = ((condRes.data ?? []) as Record<string, unknown>[])
      .map((row) => String(row.condition_ref ?? "").trim())
      .filter((ref) => ref !== "");
    conditionCancelled =
      cancelsEnergyDeficit(conditionGatePopulationOf(refs)) &&
        direction === "down"
        ? "condition_cancelled"
        : null;
  } catch (condError) {
    await logEdgeFunctionError({
      functionName: FN_NAME,
      requestId,
      error: condError,
      metadata: { source: "condition_gate" },
    });
    conditionCancelled = direction === "down" ? "condition_cancelled" : null;
  }

  // ⟳ 2026-09-10 · LOT 3 — L'OBJECTIF ANNULÉ EN SILENCE, DÉSORMAIS NOMMÉ.
  //
  // ⛔ LE CAS: une fiche sans TAILLE. La cible passe par le raccourci au poids
  // (donc la personne reçoit une fourchette), l'entretien du rythme rend
  // `null` (donc l'écart vaut zéro). Elle lit « perdre 0,5 kg par semaine » et
  // mange son entretien, sans un mot. Le refus est CONSERVÉ — on ne devine pas
  // un écart — mais il porte maintenant son motif, et l'écran ne doit plus
  // afficher ce rythme comme exécuté.
  const paceUnavailable = direction !== null
    ? paceUnavailableReason(subject)
    : null;

  const paceIsSet = Number.isFinite(pace) && pace > 0;
  const executed = direction !== null
    ? executedPaceFor(
      direction,
      subject,
      paceIsSet ? pace : DEFAULT_PACE_KG_PER_WEEK,
    )
    : maintenancePaceFor(subject);
  const executedForReading = conditionCancelled === null
    ? executed
    : (executed === null
      ? null
      : { ...executed, dailyDeltaKcal: 0, kgPerWeek: 0 });

  const directed = directedRange({
    maintenance: range,
    direction,
    dailyDeltaKcal: executedForReading?.dailyDeltaKcal ?? 0,
    energyFloorKcal: energyFloorFor(body.gender),
    cancelled: conditionCancelled,
  });
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-09 · LE CHIFFRE AFFICHÉ EST CELUI DE L'ÉQUATION DU CORPS
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ DÉCISION DU PROPRIÉTAIRE, ET ELLE REMPLACE — elle ne complète pas. Voir
  // `ENERGY_TARGET_BASIS_BODY` pour la mesure qui l'a produite.
  //
  // `directed` reste calculé AU-DESSUS, et pour deux raisons qui ne sont pas
  // cosmétiques:
  //   · il porte les DEUX motifs d'absence (`no_weight`, `implausible_weight`)
  //     et les bornes de plausibilité de la pesée. L'équation du corps, elle,
  //     rend `null` sans jamais dire pourquoi — et « pas de chiffre » sans
  //     motif est un écran vide que personne ne sait réparer;
  //   · il porte la date de pesée, qui doit s'afficher sous les deux bases.
  //
  // ⚠️ ET IL RESTE LE REPLI, NOMMÉ. L'équation demande la TAILLE et une BANDE
  // D'ÂGE; une fiche sans l'une des deux ne peut pas y entrer. Elle retombe
  // alors sur le raccourci au poids — le nombre d'avant ce lot, au caractère
  // près — et le jeton de base le DIT. Un repli muet ferait passer un raccourci
  // pour une équation, ce qui est exactement le défaut qu'on répare ici.
  const goalToken = foldRetiredGoal(String(goalsRow?.goal ?? "").trim());
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-10 · LA BANDE DE L'ÉCRAN EST CELLE DU MOTEUR, PAR LA MÊME FONCTION
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE QU'IL Y AVAIT ICI: `goalEnergyBandOf(entretien)`, c'est-à-dire
  // l'entretien multiplié par les BORNES de `ENERGY_BANDS[goal]` — une fraction
  // attachée au JETON d'objectif. Le RYTHME de la personne ne l'atteignait pas.
  // Sur `fat_loss` (0,75-0,85), cela veut dire **−20 % de l'entretien quel que
  // soit le cran réglé**: deux personnes de rythmes opposés recevaient à
  // l'écran la même fourchette, pendant que leurs assiettes divergeaient.
  //
  // Sur un entretien de 3 000 kcal: l'ancienne bande centrait à 2 400, le
  // moteur à 2 500 (l'écart exécuté, plafonné à 500 kcal/j par A1).
  //
  // `dayEnergyFor` est la MÊME fonction que celle d'`envelopeCore`. Un chiffre
  // affiché et un chiffre composé ne peuvent plus diverger sans qu'un test le
  // dise.
  const bodyMaintenanceKcal = estimatedMaintenanceKcal({
    weightKg: mouthBody.weightKg,
    heightCm: mouthBody.heightCm,
    ageBand: ageBandOf(mouthBody.ageYears),
    gender: body.gender,
    activityLevel,
    activityAxes: body.activityAxes,
    // ⟳ 2026-09-10 — LE MÊME APPÉTIT QUE `mouthBody` DIX LIGNES PLUS HAUT.
    // ⚠️ Il n'est PLUS LU par l'entretien adulte depuis le même jour (voir
    // `estimatedMaintenanceKcal`): il décrit un volume d'assiette, pas une
    // dépense. On le passe encore parce que le paramètre est requis et sert de
    // recensement des appelants.
    appetite: ownMouth.appetite,
  });
  const bodyDay = goalToken === null ? null : dayEnergyFor({
    maintenanceKcal: bodyMaintenanceKcal,
    goal: goalToken,
    // ⚠️ `executedForReading` porte DÉJÀ la condition déclarée: grossesse et
    // allaitement y mettent `dailyDeltaKcal: 0` quinze lignes plus haut. C'est
    // ce qui rend l'ancienne garde ② inutile — voir plus bas.
    directed: {
      direction,
      dailyDeltaKcal: executedForReading?.dailyDeltaKcal ?? 0,
      energyFloorKcal: energyFloorFor(body.gender),
    },
  });
  const bodyBand = bodyDay?.band ?? null;
  // ── LES TROIS PORTES QUE LA BANDE DU CORPS DOIT PASSER, ET AUCUNE N'EST
  //    OPTIONNELLE ─────────────────────────────────────────────────────────
  //
  // ⛔ « UN PARAMÈTRE DE GARDE OPTIONNEL EST UNE GARDE DÉSARMÉE » est une
  // cicatrice de ce dépôt, et ce lot pouvait la rouvrir de deux façons: la
  // bande du corps descend d'un JETON D'OBJECTIF (`ENERGY_BANDS[goal]`), donc
  // elle ne connaît ni les conditions déclarées ni le plancher de ce corps.
  // `directedRange`, lui, les porte tous les deux. Les rejouer ici plutôt que
  // de les hériter serait une seconde copie, et une seconde copie diverge.
  //
  //   ① LA PESÉE. Une bande posée là où le raccourci a REFUSÉ de rendre un
  //      nombre (pesée absente, pesée absurde) afficherait un chiffre que la
  //      garde venait d'interdire — et l'équation lit ce MÊME poids, donc elle
  //      n'a rien de plus à dire.
  //   ② LA CONDITION DÉCLARÉE. `cancelsEnergyDeficit` a déjà mis l'écart à zéro
  //      en amont (grossesse, allaitement). La bande `fat_loss` vaut 0,75-0,85
  //      quoi qu'il arrive: la servir ici RENDRAIT le déficit que la porte
  //      venait de retirer, à une femme enceinte, et sans qu'aucun test de
  //      `directedRange` ne rougisse — la garde vit là-bas, pas ici.
  //   ③ LE PLANCHER D'ÉNERGIE. `directedRange` REFUSE une fourchette qui passe
  //      dessous plutôt que de la raboter; la bande du corps, elle, ne le
  //      connaît pas. Sur une perte, un corps déjà bas sortirait sous son
  //      propre plancher.
  //
  // Chaque refus retombe sur `directed` — le nombre d'avant ce lot — et le
  // jeton de base le dit.
  // ⟳ 2026-09-10 — DEUX DES TROIS PORTES SONT DEVENUES SANS OBJET, ET C'EST
  // LE CHANGEMENT DE SOURCE QUI LES A RETIRÉES, PAS UN RELÂCHEMENT.
  //
  //   ② LA CONDITION DÉCLARÉE. Elle existait parce que `goalEnergyBandOf`
  //      ignorait l'écart: la bande `fat_loss` valait 0,75-0,85 quoi qu'il
  //      arrive, donc la servir à une femme enceinte RENDAIT le déficit que la
  //      porte venait de retirer. `dayEnergyFor` prend l'écart en ENTRÉE, et
  //      `executedForReading` le met à zéro sous condition: la bande vaut alors
  //      l'entretien, par construction. La garde ne peut plus rien attraper.
  //   ③ LE PLANCHER D'ÉNERGIE. Il vit maintenant DANS `dayEnergyFor`
  //      (`Math.max(entretien − 500, energyFloorKcal)`), appliqué aux deux
  //      bords. Le rejouer ici serait une seconde copie, et une seconde copie
  //      diverge.
  //
  // ⛔ LA PREMIÈRE RESTE, ET ELLE EST LA SEULE QUI PORTAIT SUR LA DONNÉE.
  //   ① LA PESÉE. `directed.range` est `null` quand la pesée manque ou qu'elle
  //      est absurde (bornes 25-400 kg), avec son motif. L'équation du corps
  //      lit ce MÊME poids sans ces bornes: sans cette garde, un poids absurde
  //      afficherait un chiffre que la garde venait d'interdire.
  const useBody = directed.range !== null && bodyBand !== null;
  return {
    low: useBody ? bodyBand!.low : directed.range?.low ?? null,
    high: useBody ? bodyBand!.high : directed.range?.high ?? null,
    basis: useBody ? ENERGY_TARGET_BASIS_BODY : directed.basis,
    gap: directed.gap,
    // ⚠️ LA DIRECTION VIENT DE L'OBJECTIF, PAS DE `directed`. La bande du corps
    // EST celle de l'objectif, donc elle a suivi la direction PAR CONSTRUCTION
    // — y compris quand `directedRange` avait renoncé faute de rythme réglé.
    // Lire `directed.direction` ici afficherait « pour ton poids » au-dessus de
    // nombres qui portent une prise, ce qui est le défaut que le jeton de base
    // existe pour rendre impossible.
    direction: useBody ? direction : directed.direction,
    direction_gap: useBody ? null : directed.directionGap,
    weight_week_start: directed.weightWeekStart,
    // ⟳ 2026-09-10 · LOT 3 — `null` dans le cas courant. Non nul, il dit que
    // l'objectif de cette personne ne s'exécute pas, et POURQUOI. Un écran qui
    // le lit doit cesser d'annoncer un rythme; le taire est le défaut.
    pace_unavailable: paceUnavailable,
  };
}
