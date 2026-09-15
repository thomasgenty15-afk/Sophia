/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import {
  eatingStructureFor,
  shakeDecisionFor,
  type ShakeState,
} from "../_shared/keel/eating_structure.ts";
import { mouthTargetKcal } from "../_shared/keel/mouth_anchor.ts";
import { scaleDirectionOf } from "../_shared/keel/weight_pace.ts";
import { EATING_OCCASIONS } from "../_shared/keel/meal_generation.ts";

/**
 * `eating-structure-v1` — COMBIEN DE MOMENTS CETTE JOURNÉE DOIT PORTER.
 *
 * Autorité produit: `docs/fonctionnalites/composition-des-repas/FF-060-...md`
 *
 * ── ⛔ CE QU'ELLE NE REND JAMAIS, ET C'EST SA RAISON D'ÊTRE ──────────────
 * **Aucun kcal, aucun facteur, aucun chiffre sur le corps.** Elle rend des
 * JETONS DE MOMENT (`snack_pm`…) et un compte de moments. C'est ce qu'un écran
 * peut montrer sans traverser les quatre portes de `energy_gate.ts` — un
 * nombre de repas est une STRUCTURE, pas une mesure de quelqu'un.
 *
 * La cible qui l'alimente ne sort pas d'ici. `mouthTargetKcal` la calcule, la
 * dérivation la consomme, et la réponse n'en garde que la conséquence.
 *
 * ── POURQUOI UNE FONCTION, ET PAS UN CALCUL DANS LE FRONT ────────────────
 * Le front n'a aucune formule d'énergie, et **il ne doit pas en avoir**: le
 * jour où l'écran calculerait sa propre maintenance, l'écran et le plan
 * diraient deux choses différentes au premier arbitrage changé. Le même module
 * pur sert les deux — c'est la garantie, pas une commodité.
 *
 * ── POURQUOI `service_role` ────────────────────────────────────────────────
 * `keel_household_bodies_for` n'est accordée qu'à lui. Une bouche MINEURE ou
 * SANS COMPTE n'a de poids que là: lire la ligne visible au client la rendrait
 * `no_body`, donc sans verrou — et le verrou manquerait très exactement à qui
 * en a le plus besoin.
 *
 * ── UN LECTEUR, ET ÇA SE VÉRIFIE ─────────────────────────────────────────
 * Aucun appel modèle, aucune écriture, aucune RPC d'écriture.
 */

const FN_NAME = "eating-structure-v1";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`[${FN_NAME}] missing env ${name}`);
  return v;
}

function adminClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * LE CORPS QUE L'ÉCRAN TIENT EN MAIN — une fiche EN COURS DE SAISIE.
 *
 * ⚠️ IL EST ACCEPTÉ EN ENTRÉE, ET C'EST LE CAS D'USAGE PRINCIPAL. Au moment où
 * quelqu'un remplit sa fiche, rien n'est encore en base: exiger un `member_id`
 * rendrait le verrou visible seulement au RETOUR sur la fiche, c'est-à-dire
 * trop tard pour expliquer ce qui vient d'être décidé.
 *
 * ⛔ RIEN DE CE QUI ARRIVE ICI N'EST ÉCRIT. Ces valeurs servent un calcul et
 * repartent en jetons.
 */
interface InlineBody {
  weight_kg: unknown;
  height_cm: unknown;
  gender: unknown;
  age_years: unknown;
  activity_level: unknown;
  day_activity: unknown;
  sport_frequency: unknown;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function str(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  try {
    // --- identité: le JWT, jamais un user_id du client --------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const inline = (body.body ?? null) as InlineBody | null;
    const memberId = str(body.member_id);

    const admin = adminClient();

    // ── LE CORPS: celui qu'on nous tend, sinon celui de la ligne ─────────
    let weightKg: number | null = null;
    let heightCm: number | null = null;
    let gender: string | null = null;
    let ageYears: number | null = null;
    let activityLevel: string | null = null;
    let dayActivity: string | null = null;
    let sportFrequency: string | null = null;
    let goal: string | null = str(body.goal);
    let paceKgPerWeek: number | null = num(body.pace_kg_per_week);
    let ageState: string = str(body.age_state) ?? "adult";
    let declaredSlots: string[] = Array.isArray(body.declared_slots)
      ? (body.declared_slots as unknown[]).map((s) => String(s)).filter((s) =>
        (EATING_OCCASIONS as readonly string[]).includes(s)
      )
      : [];
    let hasFixedIntake = body.has_fixed_intake === true;

    if (inline) {
      weightKg = num(inline.weight_kg);
      heightCm = num(inline.height_cm);
      gender = str(inline.gender);
      ageYears = num(inline.age_years);
      activityLevel = str(inline.activity_level);
      dayActivity = str(inline.day_activity);
      sportFrequency = str(inline.sport_frequency);
    } else if (memberId) {
      // ⚠️ LE ROSTER EST LU POUR L'UTILISATEUR CONNECTÉ, pas pour un foyer
      // qu'on nous nomme: `keel_household_roster_for` prend `p_user`, donc une
      // ligne d'un AUTRE foyer ne peut pas être atteinte en devinant son id.
      const roster = await admin.rpc("keel_household_roster_for", { p_user: user.id });
      if (roster.error) throw roster.error;
      const row = ((roster.data ?? []) as Array<Record<string, unknown>>)
        .find((r) => String(r.member_id ?? "") === memberId);
      if (!row) {
        return jsonResponse(req, {
          error: "not_your_line",
          request_id: requestId,
        }, { status: 403 });
      }
      weightKg = num(row.weight_kg);
      heightCm = num(row.height_cm);
      gender = str(row.gender);
      ageYears = num(row.age_years);
      activityLevel = str(row.activity_level);
      dayActivity = str(row.day_activity);
      sportFrequency = str(row.sport_frequency);
      goal = goal ?? str(row.goal);
      paceKgPerWeek = paceKgPerWeek ?? num(row.target_pace_kg_per_week);
      if (declaredSlots.length === 0 && Array.isArray(row.eating_rhythm)) {
        declaredSlots = (row.eating_rhythm as unknown[])
          .map((o) => String((o as Record<string, unknown>)?.slot ?? o))
          .filter((s) => (EATING_OCCASIONS as readonly string[]).includes(s));
      }
      if (str(row.age_state)) ageState = str(row.age_state)!;
    } else {
      return jsonResponse(req, {
        error: "no_subject",
        request_id: requestId,
      }, { status: 400 });
    }

    // ── LA CIBLE, PUIS LA STRUCTURE ──────────────────────────────────────
    //
    // ⚠️ `no_position` EST UNE POSTURE PRUDENTE, ET ELLE EST NOMMÉE DANS LA
    // RÉPONSE. Un coach dont la doctrine dit `no_counting` ferme l'énergie; ici
    // on ne la charge pas, donc la cible dégrade vers la maintenance — ce qui
    // ouvre AU PLUS autant de moments, jamais davantage. L'écran ne promet donc
    // jamais un verrou que le plan ne poserait pas.
    const target = mouthTargetKcal({
      memberId: memberId ?? "draft",
      ageState: ageState as never,
      restriction: "clear",
      body: weightKg === null ? null : {
        appetite: null,
        heightCm,
        weightKg,
        gender: gender as never,
        ageYears,
        activityLevel: activityLevel as never,
        activityAxes: {
          day: dayActivity as never,
          sport: sportFrequency as never,
          asked: dayActivity !== null || sportFrequency !== null,
        },
      } as never,
      direction: goal === null ? null : scaleDirectionOf(goal as never),
      paceKgPerWeek,
      declaredSlots,
      slotExtraKcal: null,
      conditionRefs: [],
    }, "no_position");

    const structure = eatingStructureFor({
      targetKcal: target.kcal,
      weightKg,
      declaredSlots,
      // L'écran n'a pas de « moment nommé absent »: c'est une correction
      // retenue de conversation, et elle vit côté foyer.
      blockedSlots: [],
    });
    const shake: ShakeState = shakeDecisionFor({
      direction: goal === null ? null : scaleDirectionOf(goal as never),
      requiredCount: structure.requiredCount,
      hasFixedIntake,
    });

    return jsonResponse(req, {
      required_count: structure.requiredCount,
      slots: structure.slots,
      opened: structure.opened,
      shake,
      reason: structure.reason,
      /**
       * SUR QUOI LE COMPTE REPOSE — la base, dans la réponse.
       * Même règle que `meal-energy-v1`: un chiffre sans sa base est interdit,
       * et un compte de moments en est un.
       */
      basis: "meal_mass_ceiling",
      request_id: requestId,
    }, { status: 200 });
  } catch (error) {
    console.error(JSON.stringify({
      tag: `${FN_NAME}.error`,
      request_id: requestId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return jsonResponse(req, {
      error: "internal_error",
      request_id: requestId,
    }, { status: 500 });
  }
});
