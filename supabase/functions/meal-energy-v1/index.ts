/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { loadDailyEnergyTarget, readViewerAddons, readViewerMealsOut, readViewerAway, type PlanRow } from "../_shared/keel/meal_energy_shared.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  canShowEnergy,
  canShowTarget,
  type CountingStance,
  type EnergyGateReason,
  type EnergySwitchSource,
} from "../_shared/keel/energy_gate.ts";
import {
  type BoxGateCounts,
  boxGateZero,
  decideBoxEnergy,
  type EmittedBox,
} from "../_shared/keel/box_energy_decision.ts";
import { loadEnergyGate, readTriState } from "../_shared/keel/energy_gate_io.ts";
import { boxEnergies } from "../_shared/keel/mouth_energy.ts";
import { evaluateRestrictionForStudent } from "../_shared/keel/restriction_runtime.ts";
import {
  directedRange,
  maintenanceRange,
  type TargetDirectionGap,
} from "../_shared/keel/energy_target.ts";
// ⟳ LOT 4 — LE GARDE DE GROSSESSE, SUR LE CHIFFRE AFFICHÉ CETTE FOIS. Il
// existait depuis L0bis et ne gardait que le DIMENSIONNEMENT: `mouthTargetKcal`
// l'appelle, cette lane-ci ne l'appelait pas. Tant que la fourchette affichée
// était une maintenance nue, ça n'avait pas d'importance — elle ne portait
// aucun déficit à annuler. Le lot 4 lui en donne un, donc il faut le garde.
import {
  cancelsEnergyDeficit,
  conditionGatePopulationOf,
} from "../_shared/keel/condition_energy_gate.ts";
import { ACTIVITY_LEVELS, type ActivityLevel } from "../_shared/keel/tokens.ts";
import { latest, loadStudentBody } from "../_shared/keel/student_body_io.ts";
import { loadCompositionIndex } from "../_shared/keel/food_composition_io.ts";
// ⟳ 2026-09-09 — LE SAS EST RELU POUR LES TERMES DE CE PLAN-LÀ. Sans ça, un
// plan était COMPOSÉ sur l'index augmenté et RELU sur l'index nu: le même plan
// rendait deux nombres, et c'est celui de la lecture — « un ingrédient ne
// figure pas dans notre table » — qui gagnait à l'écran. Voir l'en-tête de
// `indexForReading`, qui dit pourquoi ce n'est pas une promotion.
import { indexForReading } from "../_shared/keel/composition_fill_io.ts";
// ⟳ A7 (2026-09-03) — LES QUATRE LECTEURS DE PAYLOAD ONT DESCENDU DANS
// `_shared/keel/plan_energy_read.ts`. Ce n'est pas un rangement:
// `keel-tracking-v1` calcule lui aussi une part `plan_quantities`, et une
// seconde copie de `readIngredient` aurait perdu l'un de ses trois
// arbitrages sans que le chiffre cesse d'avoir l'air juste. Le code est
// DÉPLACÉ, pas réécrit — voir l'en-tête du module.
import {
  readDishes,
  readEnergyBoxDishes,
  readPreparations,
} from "../_shared/keel/plan_energy_read.ts";
import {
  type MemberAddon,
  PLAN_ENERGY_BASIS,
  planEnergy,
} from "../_shared/keel/plan_energy.ts";
// L8 ③ — LES SIX MOMENTS, POUR TRADUIRE « toute la journée » EN NOMBRE DE
// REPAS. Importés, jamais recopiés: un septième moment ajouté là-bas et un `6`
// figé ici feraient dire au sujet du chiffre une chose fausse, en silence.
import {
  DEFAULT_EATING_RHYTHM,
  EATING_OCCASIONS,
  type EatingOccasionSlot,
  parseAwayDays,
  parseEatingRhythm,
} from "../_shared/keel/meal_generation.ts";
// ① — LE CONSEIL DU MIDI. La fonction et ses gardes existent depuis L8-B et
// n'avaient AUCUN appelant. Les cinq portes vivent DANS le module, jamais ici.
// ⟳ LOT 4 — `DEFAULT_PACE_KG_PER_WEEK` VIENT DE LÀ, ET IL EST IMPORTÉ. Le
// moteur qui pèse les grammes l'applique déjà quand personne n'a réglé de
// curseur (`household_portions.ts`, « LOT B ① »); un second `0.25` écrit ici
// divergerait au premier ajustement, et c'est celui qu'on relit le moins qui
// garderait l'ancien.
import {
  DEFAULT_PACE_KG_PER_WEEK,
  eatingOutAdvice,
} from "../_shared/keel/household_portions.ts";
import {
  type MemberAway,
  presenceStateFor,
} from "../_shared/keel/household_presence.ts";
// ① bis — LA PRÉSENCE DU TITULAIRE QUAND AUCUN PLAN NE L'A ARCHIVÉE. L'en-tête
// du module dit pourquoi elle ne peut pas se lire dans `generated_from`, et
// pourquoi la garde des cases composées ne vaut QUE sur un plan personnel.
import {
  cellKey,
  composedCells,
  selfMealsOutByDay,
  selfPresenceFrom,
} from "../_shared/keel/self_presence.ts";
import { ageStateFromVerdict } from "../_shared/keel/household.ts";
import type { MouthBody } from "../_shared/keel/meal_envelope.ts";
import { effectiveRhythm } from "../_shared/keel/daily_recommendation.ts";
import {
  energyFloorFor,
  executedPaceFor,
  maintenancePaceFor,
  type ScaleDirection,
  scaleDirectionOf,
} from "../_shared/keel/weight_pace.ts";
import { type BirthDateVerdict, usableAge } from "../_shared/keel/student_age.ts";

/**
 * `meal-energy-v1` — FF-059, LE CHIFFRE AFFICHÉ.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md`
 *
 * ── POURQUOI UNE FONCTION, ET PAS UN CALCUL DANS L'ÉCRAN ──────────────────
 * Trois raisons, et chacune suffirait:
 *
 *   1. LE RÉFÉRENTIEL EST SERVICE-ROLE. `food_composition_refs` est révoquée
 *      pour `anon` et `authenticated`, RLS activée sans politique. Un client ne
 *      peut PAS calculer une énergie, et l'ouvrir pour ça publierait une table
 *      de 900 lignes pour afficher un nombre.
 *   2. LA CHAÎNE DE GARDES DOIT VIVRE OÙ LE CLIENT NE VA PAS. Une garde en
 *      React est une garde qu'un `curl` contourne. Ici, quand une porte est
 *      fermée, la réponse NE CONTIENT AUCUN CHIFFRE — il n'y a rien à révéler
 *      dans un onglet réseau, rien à lire dans un store, rien à oublier de ne
 *      pas rendre. C'est l'angle adversarial prioritaire de la fiche, et c'est
 *      l'architecture qui y répond, pas une intention.
 *   3. R5 — RIEN NE SE STOCKE. Cette fonction ne fait AUCUNE écriture. Le
 *      chiffre naît à la requête et meurt avec la réponse; un plan modifié rend
 *      autre chose au tour suivant, sans cache à invalider.
 *
 * ── CE QU'ELLE NE FAIT PAS ────────────────────────────────────────────────
 * Aucune cible (le lot 3 est bloqué sur trois décisions humaines), aucune
 * macro, aucun pourcentage d'adhérence, aucun appel modèle, aucune prose. Elle
 * rend des entiers dans un champ typé qui porte sa base, et le nombre ne
 * traverse jamais une phrase.
 *
 * ── FAIL-CLOSED, PARTOUT ──────────────────────────────────────────────────
 * Toute lecture en panne — profil, plancher, doctrine, référentiel — rend
 * `show: false`. Il n'existe aucun chemin d'erreur qui produise un chiffre.
 */

const FN_NAME = "meal-energy-v1";

/**
 * Les motifs de la RÉPONSE. Les cinq de `energy_gate.ts`, plus deux qui
 * n'appartiennent pas à la chaîne parce qu'ils ne parlent pas de la personne:
 *
 *   `unavailable` ......... une lecture a échoué. Fail-closed. Ce n'est pas un
 *                            refus, c'est une panne, et l'écran ne doit pas
 *                            dire à un élève que son coach a décidé quelque
 *                            chose alors qu'on n'a rien su lire.
 *   `no_plan` ............. aucun plan lisible dans la demande.
 */
type ResponseReason = EnergyGateReason | "unavailable" | "no_plan";

/**
 * POURQUOI UN PLAN ENTIER PEUT N'AVOIR AUCUN CHIFFRE, alors que les portes sont
 * ouvertes.
 *
 * ⚠️ `household_portions_not_numeric` EST UNE ABSTENTION, PAS UNE GARDE, et la
 * distinction compte: elle ne parle pas de l'élève, elle parle de la DONNÉE.
 *
 * ── CE QU'ELLE COUVRAIT, ET CE QU'ELLE COUVRE DEPUIS ────────────────────────
 * `member_portions[].portion_note` ne porte qu'une PHRASE, et
 * `FORBIDDEN_PORTION_TERMS` y bannit « kcal ». Elle ne pourra JAMAIS porter la
 * part. La divergence numérique du foyer vit ailleurs: dans les `member_deltas`
 * de FF-043 — un aliment et des grammes, par bouche, qui comblent l'écart entre
 * le tronc (dimensionné sur le MIN de toutes les bouches) et le besoin de
 * chacun.
 *
 * Ces deltas ne vivaient que dans la RÉPONSE HTTP de la composition. Ils sont
 * désormais gelés dans `generated_from.household.member_deltas`, et cette
 * fonction lit CEUX DU LECTEUR pour rendre son assiette à lui.
 *
 * L'abstention ne couvre donc plus que ce qu'on ne SAIT pas:
 *   · un plan composé AVANT que la trace existe;
 *   · un lecteur dont on n'a pas su résoudre le `member_id`.
 *
 * Dans les deux cas, le tronc seul serait un PLANCHER — vrai, et faux vers le
 * bas, sur exactement la question qui a motivé ce chantier (« est-ce que je
 * mange assez »). C'est la seule direction d'erreur que ce produit refuse.
 *
 * Un foyer d'UNE bouche n'a jamais rien qui diverge: le tronc EST l'assiette.
 * C'est l'entrée du produit (« entrée à 1 »), et elle garde son chiffre sans
 * dépendre d'aucune trace.
 */
const HOUSEHOLD_ABSTENTION = "household_portions_not_numeric";

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
 * UNE RÉPONSE FERMÉE — et il n'y a rien dedans.
 *
 * Pas de tableau vide de plats, pas de `basis`, pas de `0`. Un client ne peut
 * pas afficher par erreur ce qui n'a pas été envoyé, et un onglet réseau ne
 * peut pas révéler ce qui n'a pas voyagé.
 *
 * `switchOfferable` est le SEUL bit qui accompagne un refus, et il est
 * strictement dérivé du motif: `student_off` veut dire « la seule chose qui
 * ferme est toi ». C'est ce qui permet à l'écran de proposer l'interrupteur
 * sans jamais parler de calories à quelqu'un que le plancher, l'âge ou son
 * coach protègent — leur montrer une bascule « voir mes calories » serait
 * déjà leur parler de calories.
 */
function closed(
  req: Request,
  requestId: string,
  reason: ResponseReason,
): Response {
  return jsonResponse(req, {
    show: false,
    reason,
    switch_offerable: reason === "student_off",
    request_id: requestId,
  });
}


interface AdviceContext {
  reader: { show: boolean; reason: string };
  ageVerdict: BirthDateVerdict;
  slots: readonly EatingOccasionSlot[];
  /**
   * ⟳ 2026-09-09 — LA JOURNÉE **AFFICHÉE**, ET PAS UNE SECONDE ESTIMATION.
   *
   * C'est le milieu de la fourchette que `EnergyTargetNote` imprime sous les
   * plats (`directedRange`), déficit et plancher compris. Le conseil du midi
   * est une PART de la journée que le produit annonce à cette personne — s'il
   * descendait d'un autre calcul, l'écran porterait deux journées.
   *
   * ⛔ MESURÉ EN RUN RÉEL LE 2026-09-09, ET C'EST LE DÉFAUT QUE ÇA FERME:
   * l'ancienne entrée était `ExecutedPace.maintenanceKcal` (métabolisme de base
   * × facteur d'activité, 3 177) là où la fourchette imprimée descendait de
   * `maintenanceRange` (poids × kcal/kg, 2 450–2 700). Le même écran disait
   * « ta journée: 1 950–2 200 » et « au déjeuner, vise autour de 900 » —
   * 900 × 3 = 2 700, cinq cents kcal au-dessus de sa propre borne haute.
   */
  dayKcal: number | null;
  /**
   * ① bis — SA PRÉSENCE VIVANTE, pour les plans qui n'en archivent aucune.
   * Construite UNE fois pour tous ses plans, par le même parseur que la lane
   * foyer (`parseMemberAway`), sur les deux mêmes colonnes que le moteur unit
   * pour décider ce qu'il compose.
   */
  selfAway: MemberAway;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ① — LE CONSEIL DU MIDI, POUR UN PLAN. « Au déjeuner, vise autour de 700. »
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Décision produit §2.2 ⓑ: quand quelqu'un mange dehors, **le plan ne compose
 * pas ce repas mais en fait la place**. Le repas sort du plan; il ne sort pas
 * du calcul.
 *
 * ⛔ UNE CONSIGNE, JAMAIS UN SOLDE. « Il te reste 680 kcal » est LA phrase d'un
 * tracker, et elle n'existe sur aucun chemin de ce produit. Ce conseil ne
 * soustrait rien, ne connaît pas ce qui a été mangé, et ne PEUT pas le
 * connaître — aucune de ses entrées ne porte un consommé. Il se calcule sur la
 * journée DÉCLARÉE, pas sur ce que le plan a composé: « vise 700 au déjeuner »
 * est vrai que la personne ait pris son petit-déjeuner ou non, et le dériver du
 * reste de la journée en ferait un solde déguisé.
 *
 * ── ⛔ CE QUI NE SE STOCKE PAS, ET C'EST LA CLAUSE C5 ─────────────────────
 * Un kcal par bouche ne peut pas entrer dans une colonne. C'est très
 * exactement pour ça que ce conseil naît ICI, à la lecture, dans une fonction
 * qui ne fait AUCUNE écriture (R5) — le patron du reste du module: **on
 * décide, on n'archive pas la valeur par personne.** Le chiffre vit le temps
 * d'une réponse et meurt avec elle; un plan modifié en rend un autre au tour
 * suivant, sans cache à invalider et sans ligne à purger.
 *
 * ── LES PORTES SONT DANS LE MODULE, PAS ICI ──────────────────────────────
 * `eatingOutAdvice` évalue C9.b (le vocabulaire de présence), la chaîne du
 * lecteur ①②③④⑤, `mouthIsReader`, puis C9.a (l'âge de CETTE bouche) — dans cet
 * ordre, et AVANT la première multiplication. On ne recopie aucune de ces
 * conditions ici: deux points de décision finissent par diverger, et celui-ci
 * porte la garde la plus sensible du produit.
 *
 * ⚠️ ON ITÈRE SUR LE RYTHME DÉCLARÉ, PAS SUR LES CASES DE LA TRACE. Un
 * `slots: []` veut dire « toute la journée » (FF-002 §5): parcourir les cases
 * obligerait à rouvrir cette règle ici, alors que `presenceStateFor` la porte
 * déjà. On demande donc l'état de CHAQUE moment déclaré, et on laisse
 * l'arbitre répondre.
 */
function adviceForPlan(
  row: PlanRow,
  viewerMemberId: string | null,
  ctx: AdviceContext | null,
  days: readonly (string | null)[],
): Array<{ day: string; slot: string; kcal: number }> {
  if (ctx === null) return [];
  // ══ ① bis · LA TRACE D'ABORD, SA DÉCLARATION VIVANTE ENSUITE ═════════════
  //
  // ⛔ L'ORDRE N'EST PAS INDIFFÉRENT, ET LA TRACE NE SE FAIT JAMAIS DOUBLER.
  // Quand elle existe, elle dit la présence TELLE QU'ELLE ÉTAIT à la
  // composition — c'est-à-dire la seule lecture qui ne puisse pas contredire
  // l'assiette servie. On ne la relit pas « au cas où ».
  //
  // ⚠️ ET LE REPLI EST FERMÉ AUX PLANS DE FOYER. Un plat composé au déjeuner
  // du mardi peut appartenir à une AUTRE bouche pendant que le lecteur déjeune
  // dehors: la garde des cases composées y supprimerait un conseil juste, et
  // sans elle la lecture vivante en inventerait un faux. Un plan de foyer sans
  // trace reste donc muet — c'est le comportement d'hier, nommé.
  const traced = readViewerAway(row, viewerMemberId);
  const away = traced ?? (row.plan_kind === "household" ? null : ctx.selfAway);
  if (away === null) return [];
  // LA CEINTURE DE LA LECTURE VIVANTE, ET ELLE NE SERT QU'À ELLE. Les colonnes
  // bougent après la composition; l'assiette, non. Une case que ce plan a
  // composée ne reçoit aucun conseil, quoi que dise la déclaration du jour —
  // « deux nourritures pour un seul midi » est le défaut que `presenceStateFor`
  // nomme, et ici c'est le plan lui-même qui l'interdit.
  const composed = traced === null
    ? composedCells(readEnergyBoxDishes(row.dishes))
    : null;
  const out: Array<{ day: string; slot: string; kcal: number }> = [];
  for (const day of days) {
    if (!day) continue;
    for (const occasion of ctx.slots) {
      if (composed !== null && composed.has(cellKey(day, occasion.slot))) continue;
      const advice = eatingOutAdvice({
        // C9.b — LE JETON BRUT, jamais un littéral `"eating_out"` écrit ici.
        // La garde est typée `string` exprès: si l'arbitre rendait un jour un
        // quatrième état, ce chemin s'abstiendrait au lieu de deviner.
        presenceState: presenceStateFor(away, day, occasion.slot),
        reader: ctx.reader,
        // Ce chemin ne calcule QUE pour la bouche du compte qui demande. Les
        // chiffres des autres bouches ne franchissent pas le fil, pas même
        // agrégés (FF-059 §11 n°4).
        mouthIsReader: true,
        mouthAgeState: ageStateFromVerdict(ctx.ageVerdict),
        slots: ctx.slots,
        occasion,
        dayKcal: ctx.dayKcal,
      });
      if (advice.reason !== "advised" || advice.kcal === null) continue;
      out.push({ day, slot: occasion.slot, kcal: advice.kcal });
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ LOT F (2026-09-04) — LE KCAL DE CHAQUE BOÎTE À UN NOM, SOUS LA CEINTURE DE
// **SA** BOUCHE. Décision: « dès qu'il y a un objectif de perte ou de gain de
// poids, c'est affiché, peu importe qui regarde ». Porte: `canEmitBoxEnergy`
// (`energy_gate.ts`), qui dit pourquoi ce n'est pas `canEmitMouthEnergy`.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⟳ RELECTURE (2026-09-05) — LA LANE LIT, LE MODULE DÉCIDE. La décision par
 * boîte vit dans `box_energy_decision.ts` (pure, testée, mutée). Ici on ne fait
 * que résoudre ce qu'elle exige: le roster du foyer, les planchers et les
 * interrupteurs des bouches qui ont un compte — en cache dans la requête —, et
 * l'appartenance du LECTEUR à ce foyer.
 *
 * ⛔ `viewerIsMember` EST LE FAIT DE LECTURE DE LA RELECTURE: le roster se lit
 * sur `row.household_id`, et un lecteur sorti du foyer qui garde une ligne non
 * retirée recevait les kcal de ses anciens co-membres. Rien ne sort s'il n'est
 * pas (plus) membre, et le compteur le dit.
 */
interface HouseholdMouthRow {
  member_id: string;
  user_id: string | null;
  birth_date: string | null;
  goal: string | null;
}

async function boxEnergyByPlan(args: {
  admin: SupabaseClient;
  rows: readonly PlanRow[];
  index: Awaited<ReturnType<typeof loadCompositionIndex>>;
  today: string;
  coachCounting: CountingStance;
  viewerMemberId: string | null;
  requestId: string;
}): Promise<Map<string, { boxes: EmittedBox[]; gate: BoxGateCounts }>> {
  const out = new Map<string, { boxes: EmittedBox[]; gate: BoxGateCounts }>();
  const floors = new Map<string, boolean>();
  const switches = new Map<string, boolean | null>();

  const readFloor = async (userId: string) => {
    if (floors.has(userId)) return;
    let flag = true; // fail-closed tant qu'on n'a pas LU
    try {
      const floor = await evaluateRestrictionForStudent(args.admin as never, {
        userId,
        asOfLocalDate: args.today,
      });
      flag = floor.restriction_flag === true;
    } catch (error) {
      await logEdgeFunctionError({
        functionName: FN_NAME,
        requestId: args.requestId,
        error,
        metadata: { source: "box_gate_floor" },
      });
    }
    floors.set(userId, flag);
  };
  const readSwitch = async (userId: string) => {
    if (switches.has(userId)) return;
    const res = await args.admin
      .from("profiles")
      .select("energy_display_enabled")
      .eq("id", userId)
      .maybeSingle();
    // ⚠️ UNE LECTURE EN PANNE VAUT « ÉTEINT », pas « personne n'a choisi »:
    // `null` laisserait la direction rallumer un interrupteur qu'on n'a pas su
    // lire — la mauvaise direction d'erreur.
    switches.set(
      userId,
      res.error ? false : readTriState((res.data as Record<string, unknown> | null)?.energy_display_enabled),
    );
  };

  for (const row of args.rows) {
    if (row.plan_kind !== "household" || !row.household_id) {
      out.set(row.id, { boxes: [], gate: boxGateZero() });
      continue;
    }
    const membersRes = await args.admin
      .from("household_members")
      .select("member_id, user_id, birth_date, goal")
      .eq("household_id", row.household_id);
    const rawMouths = membersRes.error ? [] : ((membersRes.data ?? []) as HouseholdMouthRow[]);
    // ⟳ R1 (2026-09-05) — POUR UNE BOUCHE AVEC COMPTE, L'AUTORITÉ EST SON PROFIL.
    // `household_members.goal` et `.birth_date` sont des COPIES prises à la
    // réclamation, jamais resynchronisées: l'autorité SQL dit `student_goals.goal`
    // (20260814110000) et `profiles.birth_date` (20260812180000), et c'est ce
    // que lit le générateur. Lu sur la copie, un titulaire passé en maintenance
    // sur son compte gardait sa boîte chiffrée; un mineur par profil, adulte par
    // fiche, recevait un kcal. Relecture croisée R1, point 1.
    const accountIds = rawMouths.map((m) => m.user_id).filter((u): u is string => !!u);
    const profileByUser = new Map<string, { birth_date: string | null }>();
    const goalByUser = new Map<string, string | null>();
    if (accountIds.length > 0) {
      const [profRes, goalRes] = await Promise.all([
        args.admin.from("profiles").select("id, birth_date").in("id", accountIds),
        args.admin.from("student_goals").select("user_id, goal").in("user_id", accountIds),
      ]);
      for (const p of (profRes.error ? [] : (profRes.data ?? [])) as Array<Record<string, unknown>>) {
        profileByUser.set(String(p.id), { birth_date: p.birth_date === null || p.birth_date === undefined ? null : String(p.birth_date) });
      }
      for (const g of (goalRes.error ? [] : (goalRes.data ?? [])) as Array<Record<string, unknown>>) {
        goalByUser.set(String(g.user_id), g.goal === null || g.goal === undefined ? null : String(g.goal));
      }
    }
    const mouths = rawMouths.map((m) => {
      const userId = m.user_id ? String(m.user_id) : null;
      const fromRoster = {
        birthDate: m.birth_date === null || m.birth_date === undefined ? null : String(m.birth_date),
        goal: m.goal === null || m.goal === undefined ? null : String(m.goal),
      };
      if (userId === null) return { memberId: String(m.member_id), userId, ...fromRoster };
      // ⛔ UN COMPTE DONT LE PROFIL N'A PAS ÉTÉ LU SE FERME: `birthDate: null` ⇒
      // `age_unknown`. On ne retombe pas sur la copie de la fiche — c'est
      // exactement la source que ce correctif retire.
      const prof = profileByUser.get(userId);
      return {
        memberId: String(m.member_id),
        userId,
        birthDate: prof ? prof.birth_date : null,
        goal: goalByUser.has(userId) ? goalByUser.get(userId) ?? null : null,
      };
    });
    for (const m of mouths) {
      if (m.userId) {
        await readFloor(m.userId);
        await readSwitch(m.userId);
      }
    }
    const decided = decideBoxEnergy({
      perBox: boxEnergies({
        index: args.index,
        dishes: readEnergyBoxDishes(row.dishes),
        preparations: readPreparations(row.preparations),
      }),
      mouths,
      floors,
      switches,
      coachCounting: args.coachCounting,
      today: args.today,
      viewer: args.viewerMemberId === null
        ? "unattached"
        : (mouths.some((m) => m.memberId === args.viewerMemberId) ? "member" : "not_member"),
    });
    // ⟳ RELECTURE — LE COMPTEUR SE JOURNALISE. Un champ déclaré a besoin d'un
    // compteur, et un compteur a besoin d'un lecteur: sans cette ligne,
    // `boxes_gate` n'était lu par personne, et deux mutations dessus restaient
    // vertes.
    console.log(JSON.stringify({
      tag: "keel.meal_energy.box_gate",
      request_id: args.requestId,
      plan_id: row.id,
      ...decided.gate,
    }));
    out.set(row.id, decided);
  }
  return out;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  try {
    const admin = adminClient();

    // --- identité: le JWT, jamais un user_id du client --------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }
    const userId = user.id;

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const planIds = Array.isArray(body.plan_ids)
      // Borne de coût: un écran n'affiche jamais plus que le plan courant et le
      // suivant. Le plafond est là pour qu'un appelant ne puisse pas demander
      // le recalcul de toute l'histoire d'un compte en une requête.
      ? [...new Set(body.plan_ids.map((v) => String(v).trim()).filter(Boolean))].slice(0, 4)
      : [];
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-08 — UN BROUILLON SE CHIFFRE COMME UN PLAN
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ CE N'EST PAS UN CALCULATEUR DE CALORIES, ET LA DIFFÉRENCE EST L'ENTRÉE.
    // On lit une LIGNE que le serveur a écrite (`student_meal_drafts`), jamais
    // des grammes qu'un client enverrait: `food_composition_refs` est révoqué
    // pour `anon` et `authenticated` exprès — un client ne peut pas convertir
    // des grammes en kilocalories, même s'il le voulait, et cette fonction ne
    // doit pas devenir le service qui le fait pour lui.
    //
    // ⛔ LES QUATRE PORTES NE BOUGENT PAS D'UN OCTET. Elles portent sur le
    // LECTEUR (plancher TCA, âge, doctrine du coach, interrupteur), pas sur la
    // ligne lue: un brouillon n'ouvre donc rien que le plan écrit n'ouvrirait.
    //
    // ⚠️ LE PLAFOND EST COMMUN AUX DEUX. Quatre objets à chiffrer, plans et
    // brouillons confondus — deux plafonds de quatre en feraient huit.
    const draftIds = Array.isArray(body.draft_ids)
      ? [...new Set(body.draft_ids.map((v) => String(v).trim()).filter(Boolean))]
        .slice(0, Math.max(0, 4 - planIds.length))
      : [];
    if (planIds.length === 0 && draftIds.length === 0) {
      return closed(req, requestId, "no_plan");
    }

    // ── LES QUATRE PORTES, DANS L'ORDRE, AVANT TOUTE LECTURE DE PLAT ──────
    //
    // ⚠️ UN SEUL APPEL À `canShowEnergy`, ET C'EST DÉLIBÉRÉ. La version
    // précédente de cette fonction fermait d'abord sur ① et ② pour s'épargner
    // la lecture de doctrine d'un élève déjà protégé — c'est-à-dire qu'elle
    // appelait la garde DEUX FOIS, la première avec des valeurs de remplissage
    // pour les portes qu'elle n'avait pas encore lues. Deux points de décision
    // finissent par diverger, et celui-ci porte la garde la plus sensible du
    // produit. On lit les quatre entrées, on décide une fois. Le coût est une
    // requête de doctrine pour un élève qui n'aura pas de chiffre.
    let loadedForTarget: Awaited<ReturnType<typeof loadEnergyGate>>;
    let gate: ReturnType<typeof canShowEnergy>;
    let targetGate: ReturnType<typeof canShowTarget> | null = null;
    // Le jour LOCAL de l'élève, résolu une fois avec son fuseau et réutilisé
    // par la cible plus bas. Jamais l'UTC du serveur: à Auckland, la garde
    // mineur se tromperait de jour pendant douze heures.
    let today = "";
    // ① — LE VERDICT D'ÂGE DU LECTEUR, résolu UNE FOIS pour la porte ② et
    // réutilisé par le conseil du midi (C9.a). Le redériver plus bas ferait une
    // seconde définition de « mineur » dans le même fichier — celle qui, un
    // jour, ne serait pas ajustée.
    let ageVerdict: BirthDateVerdict | null = null;
    // ⟳ LOT 4 — LA LIGNE D'OBJECTIF, LUE UNE SEULE FOIS ET RÉUTILISÉE.
    //
    // ⚠️ ELLE REMONTE AVANT LA CHAÎNE, ET CE N'EST PAS UN RELÂCHEMENT DE LA
    // GARDE. La règle du 2026-08-18 dit « la garde ne PRODUIT jamais le
    // chiffre »: ce qui reste derrière la porte ⑤ est tout ce qui DÉRIVE DU
    // CORPS — le poids, la taille, l'entretien, la cible. Un objectif n'est pas
    // un corps: c'est une réponse que la personne a écrite elle-même, au même
    // rang que sa date de naissance et la doctrine de son coach, qui sont déjà
    // lues ici pour décider les portes. Aucun kcal n'existe encore à cette
    // ligne, et il n'y a donc rien à filtrer plus bas.
    //
    // ⛔ ET UNE SEULE LECTURE, PAS DEUX. `student_goals` était relue plus bas
    // pour le conseil du midi; deux lectures de la même table divergent, et
    // c'est celle qu'on regarde le moins qui garde l'ancien comportement.
    let goalsRow: Record<string, unknown> | null = null;
    let direction: ScaleDirection | null = null;
    // ⟳ LOT F — deux faits de plus, prêtés par la même lecture. Défauts
    // FAIL-CLOSED: `no_counting` ferme, `no_direction` n'ouvre rien de plus.
    let coachCounting: CountingStance = "no_counting";
    let readerSwitchSource: EnergySwitchSource = "no_direction";
    try {
      // ⛔ L'ASSEMBLAGE A DESCENDU DANS `_shared/keel/energy_gate_io.ts` LE
      // 2026-09-01, ET CE N'EST PAS UN RANGEMENT. Le chemin PHOTO a besoin de
      // la MÊME porte (CALORIE_REVERSAL §6): deux fonctions edge qui lisent
      // chacune `profiles` + la doctrine + le plancher finiraient par le faire
      // différemment, et c'est la garde la plus sensible du produit. Un
      // assembleur, deux lecteurs — et `canShowEnergy` garde son appelant
      // unique, ce que la propriété du harnais assertait déjà.
      const loadedGate = await loadEnergyGate(admin, { userId });
      loadedForTarget = loadedGate;
      today = loadedGate.today;
      ageVerdict = loadedGate.ageVerdict;
      direction = loadedGate.direction;
      goalsRow = loadedGate.goalsRow;
      gate = loadedGate.gate;
      coachCounting = loadedGate.coachCounting;
      readerSwitchSource = loadedGate.switchSource;
      // ⑤ LA CIBLE. Elle prend le RÉSULTAT de la chaîne A/B, pas ses entrées:
      // il n'existe donc aucun chemin vers une cible qui ne traverse pas
      // d'abord les quatre portes. Elle reste ICI parce qu'elle n'appartient
      // qu'à cette lane — le chemin photo ne montre aucune cible.
      targetGate = canShowTarget({
        energy: gate,
        targetSwitch: loadedGate.targetSwitchOn,
      });
    } catch (error) {
      // FAIL-CLOSED. Un plancher TCA ILLISIBLE vaut un plancher LEVÉ — même
      // arbitrage que `MealBodyContext.restrictionFlag` (FF-030 R6): se fermer
      // rend le produit d'hier, s'ouvrir met un chiffre sous les yeux de
      // quelqu'un qu'on n'a pas su évaluer.
      await logEdgeFunctionError({
        functionName: FN_NAME,
        requestId,
        error,
        metadata: { source: "gate" },
      });
      return closed(req, requestId, "unavailable");
    }
    // ⟳ LOT F — « PEU IMPORTE QUI REGARDE », ET OÙ ÇA S'ARRÊTE.
    //
    // Un lecteur fermé par le PLANCHER, l'ÂGE ou son COACH ne reçoit rien, boîtes
    // des autres comprises: ces trois portes protègent la personne qui regarde,
    // et un chiffre sur le couvercle du voisin est encore un chiffre sous ses
    // yeux. Un lecteur qui a EXPLICITEMENT éteint ne reçoit rien non plus —
    // R7, « un chiffre qu'on ne peut pas faire taire est un tracker », et
    // l'interrupteur doit tout faire taire pour être un interrupteur.
    //
    // Seule une fermeture PAR DÉFAUT (`student_off` venu de `no_direction`: le
    // lecteur est en maintenance et n'a rien choisi) laisse passer les boîtes des
    // bouches à objectif. C'est le cas de la décision — « si le maître est la
    // femme et que c'est le mari qui veut perdre du poids, ça affiche sur le
    // compte du maître » — et c'est exactement là que la phrase s'arrête.
    const readerClosedByDefault = !gate.show && gate.reason === "student_off" &&
      readerSwitchSource === "no_direction";
    if (!gate.show && !readerClosedByDefault) return closed(req, requestId, gate.reason);

    // ── LES PLATS, ET ILS SONT SCOPÉS SUR LE DEMANDEUR ────────────────────
    //
    // `.eq("user_id", userId)` en plus de l'identifiant demandé. Le client
    // admin ne passe PAS par RLS: sans ce filtre, un identifiant de plan volé
    // rendrait l'assiette d'un autre. Cicatrice
    // `rls-is-not-a-substitute-for-eq-user-id`, et ici il n'y a même pas de RLS
    // pour rattraper l'oubli.
    const plansRes = planIds.length === 0
      ? { data: [] as unknown[], error: null }
      : await admin
        .from("student_generated_meals")
        .select("id, plan_kind, servings, dishes, preparations, household_id, generated_from")
        .eq("user_id", userId)
        .is("retired_at", null)
        .in("id", planIds);
    if (plansRes.error) throw plansRes.error;
    const rows = (plansRes.data ?? []) as PlanRow[];

    // ── LES BROUILLONS, SOUS EXACTEMENT LES MÊMES CONTRAINTES ─────────────
    //
    // ⛔ `.eq("user_id", userId)` EST OBLIGATOIRE, ET CE N'EST PAS UNE
    // PRÉCAUTION. Le client `admin` est en `service_role`: RLS ne le contraint
    // PAS, et la policy propriétaire de la migration ne protège que le port
    // `authenticated`. Charger par l'identifiant reçu du client sans le
    // propriétaire rendrait le brouillon de quelqu'un d'autre — la cicatrice
    // `rls-is-not-a-substitute-for-eq-user-id`, et ici il n'y a même pas de RLS
    // pour rattraper l'oubli.
    //
    // ⛔ `status = 'done'` ET `expires_at > maintenant`. Une ligne `pending` n'a
    // pas encore de plan (`write_payload` est nul), une ligne expirée décrit un
    // plan que la balayeuse va effacer — chiffrer l'une ou l'autre rendrait un
    // nombre pour un plan que personne ne pourra plus adopter.
    const draftsRes = draftIds.length === 0
      ? { data: [] as unknown[], error: null }
      : await admin
        .from("student_meal_drafts")
        .select("id, plan_kind, write_payload, household_id")
        .eq("user_id", userId)
        .eq("status", "done")
        .gt("expires_at", new Date().toISOString())
        .in("id", draftIds);
    if (draftsRes.error) throw draftsRes.error;
    for (const raw of (draftsRes.data ?? []) as Record<string, unknown>[]) {
      const payload = (raw.write_payload ?? {}) as Record<string, unknown>;
      // ⚠️ `write_payload` EST LE `p_payload` DE `write_student_meal_plan`: ses
      // clés SONT celles de la ligne écrite (`dishes`, `preparations`,
      // `servings`, `plan_kind`, `household_id`, `generated_from`). C'est ce qui
      // permet de le lire comme un `PlanRow` sans traduire — et une traduction
      // serait précisément l'endroit où l'aperçu et le plan se mettraient à
      // diverger.
      rows.push({
        id: String(raw.id ?? ""),
        plan_kind: (payload.plan_kind ?? raw.plan_kind ?? null) as string | null,
        servings: (payload.servings ?? null) as number | null,
        dishes: payload.dishes,
        preparations: payload.preparations,
        household_id: (payload.household_id ?? raw.household_id ?? null) as string | null,
        generated_from: payload.generated_from,
      });
    }
    // ⟳ RELECTURE — SANS PLAN, LE MOTIF DU LECTEUR SURVIT. Avant le lot F, un
    // lecteur fermé par défaut rendait `student_off` AVANT la lecture des plans,
    // donc `switch_offerable: true`, et l'écran lui offrait l'interrupteur.
    // Rendre `no_plan` ici le lui aurait retiré en silence.
    if (rows.length === 0) {
      return closed(req, requestId, readerClosedByDefault ? "student_off" : "no_plan");
    }

    // ── QUELLE BOUCHE EST LE LECTEUR, DANS SON FOYER ──────────────────────
    //
    // Une seule lecture, et elle sert DEUX choses. Un `member_id` retrouve SES
    // add-ons sur un plan de foyer (le lecteur en est le compte MAÎTRE, et ses
    // deltas sont une ligne parmi N dans la trace). Sa colonne `away_days`,
    // elle, porte les cinq midis que la porte du « déjeuner au bureau » pose —
    // c'est la seconde source de sa présence, celle que `generate-meal-v1`
    // unit déjà à la sienne (D6.1) pour décider ce qu'il compose.
    //
    // ⟳ 2026-09-09 — ELLE NE SE LIT PLUS SEULEMENT POUR UN PLAN DE FOYER, et
    // c'est le lot: un plan PERSONNEL n'archive aucune présence, donc sans
    // cette colonne le conseil du midi n'avait aucune entrée à lire pour la
    // personne à qui il s'adresse le plus — celle qui déjeune dehors et dont
    // le plan ne compose que le matin et le soir.
    let viewerMemberId: string | null = null;
    let viewerRosterAway: unknown = null;
    {
      const meRes = await admin
        .from("household_members")
        .select("member_id, away_days")
        .eq("user_id", userId)
        .maybeSingle();
      // Une lecture EN PANNE laisse `null` — donc l'abstention nommée, jamais
      // une part attribuée au hasard, et jamais un « dehors » inventé.
      if (!meRes.error) {
        const me = meRes.data as Record<string, unknown> | null;
        viewerMemberId = String(me?.member_id ?? "").trim() || null;
        viewerRosterAway = me?.away_days ?? null;
      }
    }

    // ── ① bis · SA PRÉSENCE ET SA JOURNÉE, HORS DE TOUTE PORTE ────────────
    //
    // ⛔ ICI, ET PAS DERRIÈRE LA PORTE ⑤, PARCE QU'IL N'Y A AUCUN kcal. Deux
    // lecteurs s'en servent, et ils n'ont pas le même droit d'entrée:
    //
    //   · `mealsOut` / `subject` — un COMPTE DE REPAS. Il dit « il manquait des
    //     plats à lire », pas un nombre sur un corps. Son jumeau du foyer
    //     (`readViewerMealsOut`) se calcule lui aussi sans porte, et il le doit:
    //     quelqu'un qui a ÉTEINT les calories doit quand même lire « sur les 2
    //     repas que j'ai composés » plutôt que « sur la journée ».
    //   · le CONSEIL du midi — un kcal, lui, et il reste derrière la porte ⑤.
    //     Il réutilise cet objet, il ne le rend pas plus permissif.
    const viewerSelfAway = selfPresenceFrom({
      declared: (goalsRow?.practical_constraints as Record<string, unknown> | null)
        ?.away_days,
      roster: viewerRosterAway,
    });
    // Le rythme EFFECTIF: celui contre lequel le plan a été composé. Une journée
    // non déclarée reçoit le défaut du produit, pas un silence — sinon on
    // compterait des repas dehors sur une journée qui n'existe pas.
    const viewerRhythm = effectiveRhythm(
      parseEatingRhythm(
        (goalsRow?.practical_constraints as Record<string, unknown> | null)
          ?.eating_rhythm,
      ),
    );

    const baseIndex = await loadCompositionIndex(admin);
    // ══════════════════════════════════════════════════════════════════════
    // L'INDEX DE LA LECTURE — le référentiel, plus ce que le sas sait des
    // termes DE CES PLANS.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ IL NE PEUT PAS FAIRE TOMBER LA LECTURE: `indexForReading` n'a aucun
    // chemin qui lève, et rend l'index de base à l'identité près sur tout
    // échec — c'est-à-dire le comportement d'avant cette ligne.
    //
    // ⚠️ AVANT `boxEnergyByPlan`, ET C'EST LA RAISON DE L'ORDRE. Les deux
    // lecteurs d'énergie de cette fonction (les couvercles, puis les plats et
    // les jours) partagent CET objet. Augmenter l'un et pas l'autre ferait
    // dire à la boîte et au plat deux masses différentes pour la même
    // casserole — la cicatrice `regramMeal`, dans l'autre sens.
    const reading = await indexForReading({
      db: admin,
      baseIndex,
      inputs: rows.flatMap((row) => [
        ...readDishes(row.dishes).flatMap((d) => d.ingredients),
        ...readPreparations(row.preparations).flatMap((p) => p.ingredients),
      ]),
    });
    const index = reading.index;
    if (reading.asked > 0) {
      // ⛔ JOURNALISÉ MÊME À ZÉRO REPRISE. `asked` sans `kept` est le seul
      // signal qui dise « le référentiel a un trou que le sas ne comble pas
      // non plus » — c'est-à-dire la file à curer. Un compteur qui ne s'écrit
      // que quand il réussit ressemble à un mécanisme qui marche.
      console.log(JSON.stringify({
        tag: "keel.meal_energy.reading_index",
        user_id: userId,
        plans: rows.length,
        asked: reading.asked,
        kept: reading.kept,
        request_id: requestId,
      }));
    }

    // ⟳ LOT F — LES BOÎTES À UN NOM, jugées bouche par bouche. Calculées AVANT
    // la cible et le conseil, qui appartiennent au lecteur et ne sortent pas
    // quand il est fermé.
    const boxesByPlan = await boxEnergyByPlan({
      admin,
      rows,
      index,
      today,
      coachCounting,
      viewerMemberId,
      requestId,
    });
    if (readerClosedByDefault) {
      // Une réponse FERMÉE qui porte quelque chose — et c'est la seule. Ce
      // qu'elle porte n'est pas au lecteur: ce sont les couvercles des bouches
      // qui ont un objectif, et rien du lecteur lui-même (ni plat, ni jour, ni
      // cible, ni conseil).
      return jsonResponse(req, {
        show: false,
        reason: gate.reason,
        switch_offerable: true,
        plans: rows.map((row) => ({
          plan_id: row.id,
          boxes: boxesByPlan.get(row.id)?.boxes ?? [],
          boxes_gate: boxesByPlan.get(row.id)?.gate ?? boxGateZero(),
        })),
        request_id: requestId,
      });
    }

    // ── ⑤ LA CIBLE (niveau C) ET ① LE CONSEIL DU MIDI ─────────────────────
    //
    // ⚠️ LE POIDS N'EST LU QUE SI LA PORTE ⑤ EST OUVERTE. Ce n'est pas une
    // économie de requête: c'est la garde. Un élève qui n'a pas demandé de
    // cible ne voit pas son poids voyager pour en produire une, et le corps de
    // la réponse ne porte alors littéralement aucun champ dérivé de lui.
    //
    // ⛔ ET C'EST AUSSI LA GARDE DU CONSEIL DU MIDI, POUR LA MÊME RAISON. La
    // décision ① du 2026-08-18 dit: « LA GARDE NE PRODUIT JAMAIS LE CHIFFRE.
    // Elle ne le supprime pas après coup. » Le contexte ci-dessous — corps,
    // objectif, rythme — n'est donc lu QUE derrière la porte ⑤. Quand elle est
    // fermée, aucun kcal n'est calculé, et il n'y a rien à filtrer en aval.
    let target: Record<string, unknown> | null = null;
    let advice: AdviceContext | null = null;
    if (targetGate?.show === true && ageVerdict !== null) {
      try {
        target = await loadDailyEnergyTarget(admin, userId, loadedForTarget!, requestId);
        advice = {
          // LA CHAÎNE DU LECTEUR, TELLE QUELLE. `canShowTarget` a déjà tranché
          // les cinq portes; la repasser ici en ferait un second point de
          // décision sur la garde la plus sensible du produit.
          reader: targetGate,
          ageVerdict,
          // Le rythme EFFECTIF: celui contre lequel le plan a été composé. Une
          // journée non déclarée reçoit le défaut du produit, pas un silence —
          // sinon on répartirait une journée sur zéro repas.
          // ⟳ 2026-09-09 — LE MÊME OBJET QUE CELUI DU COMPTE DE REPAS DEHORS.
          // Deux lectures du rythme feraient compter un repas dehors sans lui
          // donner de conseil, ou l'inverse.
          slots: viewerRhythm,
          // ⟳ 2026-09-09 — LA MÊME FOURCHETTE QUE CELLE QUI S'IMPRIME, ET SON
          // MILIEU. `directed` porte déjà le déficit exécuté (garde de
          // grossesse comprise, via `executedForReading`), le plancher
          // d'énergie et l'annulation de condition: le conseil hérite des
          // quatre sans en recopier un seul.
          //
          // ⛔ `null` QUAND LA FOURCHETTE N'EXISTE PAS (pas de pesée, pesée
          // invraisemblable). Pas de journée annoncée ⇒ pas de part à
          // conseiller: le module rend `no_body`, motif nommé.
          dayKcal: target?.low == null || target?.high == null
            ? null
            : Math.round((Number(target.low) + Number(target.high)) / 2),
          // ① bis — SA PRÉSENCE, DEPUIS SES DEUX COLONNES, PAR LE PARSEUR DU
          // FOYER. Les mêmes que celles que `generate-meal-v1` unit pour
          // décider ce qu'il compose (D6.1): la grille qu'il remplit pour
          // lui-même, et les midis que la porte du « déjeuner au bureau » pose
          // sur sa ligne de roster. Une troisième idée de « qui est dehors »
          // finirait par ne plus dire la même chose que le moteur.
          selfAway: viewerSelfAway,
        };
      } catch (error) {
        // FAIL-CLOSED, comme partout ici: pas de cible plutôt qu'une cible sur
        // un poids qu'on n'a pas su lire, et pas de conseil plutôt qu'un
        // conseil sur une journée qu'on n'a pas su lire.
        await logEdgeFunctionError({
          functionName: FN_NAME,
          requestId,
          error,
          metadata: { source: "target" },
        });
        target = null;
        advice = null;
      }
    }

    const plans = rows.map((row) => {
      const servings = Math.min(12, Math.max(1, Math.round(Number(row.servings) || 1)));

      // ── LES ADD-ONS DU LECTEUR, ET DE LUI SEUL ──────────────────────────
      const addons = readViewerAddons(row, viewerMemberId);
      if (row.plan_kind === "household" && servings > 1 && addons === null) {
        // La trace des deltas manque: plan composé AVANT que FF-059 la fige, ou
        // bouche introuvable. Le tronc seul serait un PLANCHER — vrai, et faux
        // vers le bas, sur exactement la question (« est-ce que je mange
        // assez ») qui a motivé ce chantier. On s'abstient, et on le nomme.
        return {
          plan_id: row.id,
          computable: false,
          abstention: HOUSEHOLD_ABSTENTION,
          // ⟳ LOT F — INDÉPENDANT DE L'ABSTENTION. Elle porte sur l'assiette du
          // LECTEUR (ses add-ons manquent); une boîte à un nom a son kcal par
          // ses propres grammes.
          boxes: boxesByPlan.get(row.id)?.boxes ?? [],
          boxes_gate: boxesByPlan.get(row.id)?.gate ?? boxGateZero(),
        };
      }

      const energy = planEnergy({
        index,
        dishes: readDishes(row.dishes),
        preparations: readPreparations(row.preparations),
        servings,
        addons: addons ?? [],
        // L8 ③ — REQUIS, jamais optionnel. Une table vide est une valeur PLEINE
        // (« cette personne mange tous ses repas ici »), pas une ignorance.
        //
        // ⟳ 2026-09-09 — ET SUR UN PLAN PERSONNEL, ELLE ÉTAIT VIDE PAR DÉFAUT
        // DE LECTEUR, pas par absence de repas dehors. `readViewerMealsOut` ne
        // lit que la trace de la lane foyer: l'en-tête d'un jour disait donc
        // « 2 385 kcal sur la journée » au-dessus d'un « au déjeuner, vise
        // autour de 700 » — la journée entière revendiquée, et un repas annoncé
        // hors d'elle. Même cause et même repli que le conseil, à la même
        // ceinture près (une case composée n'est pas un repas dehors).
        mealsOutByDay: row.plan_kind === "household"
          ? readViewerMealsOut(row, viewerMemberId)
          : selfMealsOutByDay({
            away: viewerSelfAway,
            slots: viewerRhythm,
            dishes: readEnergyBoxDishes(row.dishes),
          }),
      });
      return {
        plan_id: row.id,
        computable: true,
        // ⟳ LOT F — les contenants à un nom dont la bouche a droit à son chiffre,
        // et le compteur de la porte, écrit même à zéro.
        boxes: boxesByPlan.get(row.id)?.boxes ?? [],
        boxes_gate: boxesByPlan.get(row.id)?.gate ?? boxGateZero(),
        // R1: clés ASCII snake_case, comme partout en base et sur le fil.
        dishes: energy.dishes.map((d, i) => ({
          index: i,
          kcal: d.kcal,
          basis: d.basis,
          complete: d.complete,
          gaps: d.gaps,
        })),
        days: energy.days.map((d) => ({
          day: d.day,
          kcal: d.kcal,
          basis: d.basis,
          complete: d.complete,
          dishes_counted: d.dishesCounted,
          dishes_total: d.dishesTotal,
          // L8 ③ — DE QUOI CE NOMBRE PARLE. `the_day` = la journée entière;
          // `what_the_plan_made` = ce que le plan a composé, et l'écran doit le
          // DIRE (« sur les 2 repas que j'ai composés »). Les deux champs
          // partent ensemble: un sujet sans son compte ne se rend pas.
          meals_out: d.mealsOut,
          subject: d.subject,
          // ⚠️ CE SONT LES ADD-ONS DU LECTEUR. Ceux des autres bouches ont
          // servi à composer la casserole et ne sortent d'ici sous aucune
          // forme, pas même agrégée.
          addon_kcal: d.addonKcal,
        })),
        // ══ ① · LE CONSEIL DU MIDI ══════════════════════════════════════
        //
        // « Au déjeuner, vise autour de 700. » Une CONSIGNE, jamais un solde:
        // rien n'est soustrait, rien n'est archivé, et la phrase se compose à
        // l'écran par `eatingOutAdviceSentence`, qui vit avec le nombre.
        //
        // ⚠️ INDEXÉ PAR JOUR ET PAR MOMENT, et lié aux jours QUE LE PLAN A
        // PRODUITS. Un jour dont le plan n'a composé AUCUN plat n'a pas
        // d'entrée ici — parce qu'il n'a pas non plus de bloc à l'écran où la
        // poser. C'est un trou connu, structurel, et pas une abstention: il se
        // refermera avec l'écran qui montrera une journée entièrement dehors.
        eating_out_advice: adviceForPlan(
          row,
          viewerMemberId,
          advice,
          energy.days.map((d) => d.day),
        ),
      };
    });

    return jsonResponse(req, {
      show: true,
      reason: gate.reason,
      switch_offerable: true,
      basis: PLAN_ENERGY_BASIS,
      plans,
      // `target_offerable`: la bascule de la cible ne se propose QUE si son
      // seul refus est `target_off`. Proposer « montre-moi ma cible » à
      // quelqu'un que le plancher protège serait encore lui parler de cible.
      target_offerable: targetGate?.reason === "target_off" || targetGate?.show === true,
      target,
      request_id: requestId,
    });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: FN_NAME,
      requestId,
      error,
      metadata: { source: "edge" },
    });
    // ⚠️ MÊME UNE PANNE INATTENDUE SE FERME. Un 500 nu laisserait un client
    // indulgent afficher un état intermédiaire; ce corps-ci ne porte aucun
    // chiffre et dit explicitement `show: false`.
    return jsonResponse(req, {
      show: false,
      reason: "unavailable",
      switch_offerable: false,
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500 });
  }
});
