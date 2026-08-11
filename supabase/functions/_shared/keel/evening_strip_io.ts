/**
 * FF-058 — LA COQUILLE D'I/O DE LA BANDE DU SOIR: lire le jour, écrire le geste.
 *
 * `evening_strip.ts` DÉCIDE et JUGE (pur, testé). Ce module LIT et ÉCRIT. Même
 * frontière que partout dans `_shared/keel/`.
 *
 * ── R5: EXACTEMENT LE CHEMIN D'ÉCRITURE DE L'ÉCRAN, PAS UN SECOND ──────────
 * `writeMealTick` écrit la MÊME ligne que `frontend/src/keel/api/mealTicks.ts`:
 * même table, même `source`, même clé (`mealTickKey`), même `evidence_weight`,
 * même `plan_relation`, même arbitrage d'idempotence (l'index unique partiel
 * `(user_id, source_message_id)`, côté Postgres). Ce dépôt paie en boucle la
 * faute des deux implémentations d'une même règle — « la divergence se voit
 * comme "l'écran coche mardi, la conversation propose mercredi" sans qu'aucune
 * des deux ne soit identifiable comme la menteuse » (`meal_stretch.ts`).
 *
 * ⚠️ LA SEULE DIFFÉRENCE, ET ELLE EST NOMMÉE. L'écran ne peut PAS produire
 * « ✗ sur un plat jamais coché »: son ✗ est un retrait, il n'existe que sous une
 * case déjà cochée. La bande, elle, ouvre le ✗ directement — c'est même son cas
 * nominal, puisque personne n'a ouvert l'écran. Une décoche sans coche préalable
 * INSÈRE donc la ligne avec son motif, au lieu de ne toucher aucune ligne et de
 * rendre un 204 muet. Ce n'est pas un second chemin: c'est le même écrivain avec
 * la valeur de `disqualified_reason` en paramètre, exactement comme l'en-tête de
 * `meal_tick.ts` le décrit (« cocher → insert; décocher → motif; recocher →
 * null »).
 *
 * ── LE CLIENT QUI ÉCRIT EST NOMMÉ, ET SES DROITS SONT PROUVÉS ──────────────
 * Cicatrice du 2026-08-11 (FF-056): `run.ts` passait le client porté par le JWT
 * de l'ÉLÈVE — rôle `authenticated`, qui n'avait que `SELECT` — et le `as never`
 * du site d'appel rendait la faute invisible au typecheck. Symptôme: tout
 * marchait, rien ne s'écrivait. Ici le paramètre s'appelle `admin`, il est typé
 * `SupabaseClient`, et aucun `as` ne le traverse. Les droits sont vérifiés au
 * rapport, table par table.
 *
 * ── LA DATE D'UNE COCHE VIENT DU PLAN, PAS DE L'HORLOGE DU TAP ─────────────
 * Une coche porte la date du jour où le plat SE MANGEAIT (`useMealTicks`: « le
 * passé se rattrape »). Un tap à 00 h 20 sur la bande envoyée à 20 h la veille
 * doit atterrir sur LA VEILLE — sinon le dîner de lundi apparaît dans le message
 * de mardi soir. On relit donc la fenêtre du plan et on résout la date du plat,
 * plutôt que de prendre le jour local du tap.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { planGroceryWaves, wavePreparationsFromRows } from "./grocery_waves.ts";
import { MEAL_UNTICK_REASON, mealTickKey } from "./meal_tick.ts";
import { stretchDates } from "./meal_stretch.ts";
import { loadPlannedDishContext } from "./planned_dish_io.ts";
import { type StripDish, type StripShoppingWave } from "./evening_strip.ts";

/** Les créneaux que `protocol_events.slot_key` accepte (FK `slot_vocabulary`). */
const SLOT_KEYS: ReadonlySet<string> = new Set([
  "on_waking",
  "breakfast",
  "snack_am",
  "pre_workout",
  "lunch",
  "post_workout",
  "snack_pm",
  "dinner",
  "before_bed",
  "any_meal",
  "any_time",
]);

/** La table de l'état de vague. Une seule constante à citer. */
export const GROCERY_WAVE_STATE_TABLE = "grocery_wave_states";

// ---------------------------------------------------------------------------
// LE FOYER — qui répond des faits du FOYER (R14)
// ---------------------------------------------------------------------------

/**
 * Ce compte répond-il des faits du FOYER (la cuisson, les courses) ?
 *
 * ── LES TROIS CAS, ET AUCUN N'EST UN DÉFAUT SILENCIEUX ─────────────────────
 *   · aucune ligne de foyer  ⇒ `true`. Une personne seule est son propre maître:
 *     ses courses sont les siennes, et lui retirer la ligne la ferait
 *     disparaître pour le cas nominal d'aujourd'hui.
 *   · `role = 'owner'`       ⇒ `true`. C'est le maître.
 *   · `role = 'member'`      ⇒ `false`. Un profil réclamé reçoit SA bande de
 *     plats (la consommation est un fait de personne) et JAMAIS la ligne de
 *     courses: il n'en sait rien, et sa réponse serait du bruit (R14).
 *
 * FAIL-CLOSED SUR LA LECTURE: une lecture en panne rend `false`. Le pire cas est
 * une ligne de courses qui ne part pas ce soir; le pire cas de l'inverse est
 * qu'un profil réclamé réponde d'un fait de foyer, ce qui est l'interdit.
 */
export async function respondsForHousehold(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("household_members")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn(JSON.stringify({
      tag: "keel.evening_strip.household_unreadable",
      user_id: userId,
      error: error.message,
    }));
    return false;
  }
  const role = String((data as { role?: string } | null)?.role ?? "").trim();
  if (!role) return true;
  return role === "owner";
}

// ---------------------------------------------------------------------------
// LIRE LA SOIRÉE
// ---------------------------------------------------------------------------

export interface EveningStripContext {
  /** Le plan qui POSSÈDE ce jour. `null` = pas de bande. */
  mealId: string | null;
  dishes: StripDish[];
  /** La vague de courses dont le `buyOn` est CE jour, ou `null` (R15). */
  shopping: StripShoppingWave | null;
  /** La langue de la composition — `content_locale` de la ligne du plan. */
  contentLocale: string | null;
  reason:
    | "loaded"
    | "no_dish_today"
    | "no_plan"
    | "load_failed";
}

const NO_CONTEXT = (reason: EveningStripContext["reason"]): EveningStripContext => ({
  mealId: null,
  dishes: [],
  shopping: null,
  contentLocale: null,
  reason,
});

/**
 * Ce que la bande de ce soir a à offrir.
 *
 * ── LE PLAN QUI POSSÈDE LE JOUR VIENT DE `loadPlannedDishContext` ──────────
 * Et pas d'une seconde requête écrite ici. C'est LA règle « quel plan possède ce
 * jour », elle est déjà écrite une fois (fenêtre exacte, `retired_at is null`,
 * plusieurs candidats départagés), et une copie divergerait au premier plan
 * tronqué. La ligne brute n'est relue qu'ENSUITE, par son `id`, pour ce que le
 * contexte de plats ne porte pas: la liste de courses et les préparations.
 *
 * ── UNE LECTURE EN PANNE REND UNE SOIRÉE SANS BANDE, JAMAIS UNE ERREUR ─────
 * Le pire cas est un message du soir tel qu'il était avant cette fiche. Le pire
 * cas de l'alternative serait de faire tomber le message entier — c'est-à-dire
 * de perdre le fait du jour pour un ajout qui devait être gratuit.
 */
export async function loadEveningStripContext(
  admin: SupabaseClient,
  args: { userId: string; localDate: string },
): Promise<EveningStripContext> {
  let planned;
  try {
    planned = await loadPlannedDishContext(admin, {
      userId: args.userId,
      localDate: args.localDate,
    });
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.evening_strip.planned_unreadable",
      user_id: args.userId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return NO_CONTEXT("load_failed");
  }

  if (!planned.mealId) return NO_CONTEXT("no_plan");
  if (planned.dishes.length === 0) return NO_CONTEXT("no_dish_today");

  const dishes: StripDish[] = planned.dishes.map((d) => ({
    dishIndex: d.dishIndex,
    title: String(d.dish?.title ?? ""),
  }));

  // ── LA VAGUE DU JOUR (R15) ────────────────────────────────────────────────
  // Elle n'existe que le soir d'un `buyOn`. Une lecture en panne rend « aucune
  // vague »: on perd la ligne de courses, jamais la bande.
  let shopping: StripShoppingWave | null = null;
  let contentLocale: string | null = null;
  try {
    const { data, error } = await admin
      .from("student_generated_meals")
      .select("shopping_list, preparations, starts_on, duration_days, content_locale")
      .eq("id", planned.mealId)
      .maybeSingle();
    // ⚠️ « erreur » et « vide » ne se confondent pas. Une sonde qui les mélange a
    // déjà fait déclarer « aucun fait écrit » sur des scénarios qui en
    // écrivaient trois (cicatrice du 2026-08-11).
    if (error) throw error;
    const row = (data ?? null) as Record<string, unknown> | null;
    if (row) {
      contentLocale = String(row.content_locale ?? "").trim() || null;
      const list = Array.isArray(row.shopping_list)
        ? (row.shopping_list as Array<Record<string, unknown>>).map((item) => ({
          term: String(item?.term ?? ""),
          aisle: String(item?.aisle ?? ""),
        }))
        : [];
      const waves = planGroceryWaves({
        startsOn: String(row.starts_on ?? ""),
        durationDays: Number(row.duration_days) || 7,
        shoppingList: list,
        preparations: wavePreparationsFromRows(
          Array.isArray(row.preparations)
            ? (row.preparations as Array<Record<string, unknown>>)
            : [],
        ),
      });
      // DEUX VAGUES LE MÊME JOUR ⇒ UNE SEULE LIGNE (§7). La question porte sur
      // « les courses du jour », pas sur chaque vague — et l'état écrit est
      // celui du jour d'achat, donc les deux se répondent d'un seul tap.
      const today = waves.find((w) => w.buyOn === args.localDate);
      if (today) shopping = { buyOn: today.buyOn };
    }
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.evening_strip.waves_unreadable",
      user_id: args.userId,
      meal_id: planned.mealId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  return {
    mealId: planned.mealId,
    dishes,
    shopping,
    contentLocale,
    reason: "loaded",
  };
}

// ---------------------------------------------------------------------------
// ÉCRIRE UNE COCHE — le chemin de l'écran, une seule fois
// ---------------------------------------------------------------------------

/** Ce qu'une composition doit fournir pour qu'une coche soit écrite. */
interface PlanForTick {
  startsOn: string;
  durationDays: number;
  contentLocale: string;
  dishes: Array<Record<string, unknown>>;
}

async function loadPlanForTick(
  admin: SupabaseClient,
  mealId: string,
): Promise<PlanForTick | null> {
  const { data, error } = await admin
    .from("student_generated_meals")
    .select("dishes, starts_on, duration_days, content_locale")
    .eq("id", mealId)
    .maybeSingle();
  if (error) {
    console.warn(JSON.stringify({
      tag: "keel.evening_strip.plan_unreadable",
      meal_id: mealId,
      error: error.message,
    }));
    return null;
  }
  const row = (data ?? null) as Record<string, unknown> | null;
  if (!row) return null;
  const startsOn = String(row.starts_on ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) return null;
  return {
    startsOn,
    durationDays: Number(row.duration_days) || 7,
    contentLocale: String(row.content_locale ?? "").trim() || "en-GB",
    dishes: Array.isArray(row.dishes)
      ? (row.dishes as Array<Record<string, unknown>>)
      : [],
  };
}

/**
 * Les plats que la charge d'un bouton désigne, avec leurs titres D'AUJOURD'HUI.
 *
 * Sert l'étape `Pas tout`, qui arrive des minutes après l'envoi: on relit les
 * titres plutôt que de les faire voyager dans le payload, qui deviendrait une
 * chaîne modifiable désignant ce qu'on écrit. Les INDEX, eux, viennent bien du
 * payload — c'est ce qui garantit que le tap ne peut toucher que des plats que
 * la bande a nommés.
 */
export async function loadStripDishes(
  admin: SupabaseClient,
  args: { mealId: string; dishIndexes: readonly number[] },
): Promise<StripDish[]> {
  const plan = await loadPlanForTick(admin, args.mealId);
  if (!plan) return [];
  const out: StripDish[] = [];
  for (const dishIndex of args.dishIndexes) {
    const dish = plan.dishes[dishIndex];
    if (!dish) continue;
    out.push({ dishIndex, title: String(dish.title ?? "") });
  }
  return out;
}

export type StripWriteOutcome =
  | "written"
  | "rearmed"
  /** Le plan a disparu, ou l'index ne désigne plus rien. Rien n'est écrit. */
  | "stale"
  | "failed";

export interface StripWriteResult {
  outcome: StripWriteOutcome;
  /** La clé exacte écrite — c'est elle qu'on relit pour prouver le fait. */
  key: string;
  localDate: string | null;
  detail?: string;
}

/**
 * Écrit UNE coche (ou UNE décoche) par le chemin de l'écran.
 *
 * @param disqualified `null` pour cocher, `MEAL_UNTICK_REASON` pour décocher.
 *   REQUIS: les deux gestes partagent la ligne, la clé et l'index d'unicité, et
 *   c'est la valeur de cette colonne — et elle seule — qui les distingue. Un
 *   paramètre optionnel aurait fait d'un oubli une coche silencieuse.
 */
export async function writeMealTick(
  admin: SupabaseClient,
  args: {
    userId: string;
    mealId: string;
    dishIndex: number;
    disqualified: typeof MEAL_UNTICK_REASON | null;
    /** Chargé une fois par tap agrégé plutôt qu'une fois par plat. */
    plan: PlanForTick;
    now: Date;
  },
): Promise<StripWriteResult> {
  const key = mealTickKey(args.mealId, args.dishIndex);
  const dish = args.plan.dishes[args.dishIndex] ?? null;
  if (!dish) {
    // Le plan a été régénéré et il porte moins de plats: l'index ne désigne
    // plus rien. On n'écrit PAS une coche sur une position qu'on ne sait plus
    // nommer — ce serait un fait fabriqué, append-only, dans la table que le
    // coach lit.
    return { outcome: "stale", key, localDate: null, detail: "dish_gone" };
  }

  // LA DATE DU PLAT DANS SA FENÊTRE, pas le jour du tap. Un plat sans jeton de
  // jour se rapporte le jour où on le rapporte — c'est le repli de `dishDate`,
  // et il reste juste ici puisque la personne vient de dire qu'il a eu lieu.
  const dates = stretchDates(args.plan.startsOn, args.plan.durationDays);
  const token = String(dish.day ?? "").trim();
  const localDate = token
    ? dates[token] ?? null
    : args.now.toISOString().slice(0, 10);
  if (!localDate) {
    return { outcome: "stale", key, localDate: null, detail: "day_out_of_window" };
  }

  const slotRaw = String(dish.slot ?? "").trim();
  const slotKey = SLOT_KEYS.has(slotRaw) ? slotRaw : null;

  const inserted = await admin.from("protocol_events").insert({
    user_id: args.userId,
    occurred_at: args.now.toISOString(),
    local_date: localDate,
    slot_key: slotKey,
    source: "quick_tap",
    // Le titre TEL QU'IL EST AU MOMENT DU GESTE — c'est ce que l'élève a lu dans
    // la bande, et c'est ce que `loadDayFacts` relira pour le citer le soir.
    student_note: String(dish.title ?? "").trim(),
    content_locale: args.plan.contentLocale,
    // SCHEMA.md, échelle de preuve: une tape vaut 0.4. La MÊME valeur que
    // `mealTicks.ts` et que la coche automatique de la photo — deux chiffres
    // différents pour un même geste feraient diverger la couverture selon le
    // chemin.
    evidence_weight: 0.4,
    // Cocher un plat du plan, c'est littéralement « j'ai mangé ce qui était
    // prévu »: l'élève DÉSIGNE la ligne, rien n'est déduit (FF-009 R5).
    plan_relation: "as_planned",
    source_message_id: key,
    disqualified_reason: args.disqualified,
  } as never);

  if (!inserted.error) {
    return { outcome: "written", key, localDate };
  }
  // 23505 = la ligne existe déjà. C'est l'index unique partiel
  // `(user_id, source_message_id)` qui arbitre — donc un double tap ne fait
  // qu'une ligne, sans anti-double-clic côté client (`meal_tick.ts`).
  if ((inserted.error as { code?: string }).code === "23505") {
    const updated = await admin
      .from("protocol_events")
      .update({ disqualified_reason: args.disqualified } as never)
      .eq("user_id", args.userId)
      .eq("source_message_id", key)
      .select("id");
    if (updated.error) {
      return {
        outcome: "failed",
        key,
        localDate,
        detail: updated.error.message,
      };
    }
    // ⚠️ ON COMPTE LES LIGNES, PAS LE CODE HTTP. Un `update` qui ne touche
    // aucune ligne rend un 204 muet, et le lire comme un succès est la
    // cicatrice `rls-is-not-a-substitute-for-eq-user-id`.
    const rows = (updated.data ?? []) as unknown[];
    if (rows.length === 0) {
      return { outcome: "failed", key, localDate, detail: "update_touched_0_rows" };
    }
    return { outcome: "rearmed", key, localDate };
  }
  return {
    outcome: "failed",
    key,
    localDate,
    detail: inserted.error.message,
  };
}

export interface StripTickBatchResult {
  written: number;
  rearmed: number;
  stale: number;
  failed: number;
  keys: string[];
}

/**
 * `[✓ Tout comme prévu]` — TOUTES les coches du jour, en un tap.
 *
 * Les index viennent de la CHARGE DU BOUTON, pas d'une relecture du plan: le tap
 * ne peut donc écrire que ce que la bande a nommé. Si le plan a changé entre
 * l'envoi et le tap, les coches restent valides — elles disent un fait passé —
 * et seuls les index qui ne désignent plus rien sont écartés en `stale`.
 */
export async function applyStripTicks(
  admin: SupabaseClient,
  args: {
    userId: string;
    mealId: string;
    dishIndexes: readonly number[];
    disqualified: typeof MEAL_UNTICK_REASON | null;
    now: Date;
  },
): Promise<StripTickBatchResult> {
  const out: StripTickBatchResult = {
    written: 0,
    rearmed: 0,
    stale: 0,
    failed: 0,
    keys: [],
  };
  const plan = await loadPlanForTick(admin, args.mealId);
  if (!plan) {
    out.stale = args.dishIndexes.length;
    return out;
  }
  for (const dishIndex of args.dishIndexes) {
    const result = await writeMealTick(admin, {
      userId: args.userId,
      mealId: args.mealId,
      dishIndex,
      disqualified: args.disqualified,
      plan,
      now: args.now,
    });
    out[result.outcome]++;
    if (result.outcome === "written" || result.outcome === "rearmed") {
      out.keys.push(result.key);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// L'ÉTAT D'UNE VAGUE DE COURSES — un ÉTAT, pas un journal (R16)
// ---------------------------------------------------------------------------

export type WaveStateOutcome = "written" | "failed";

/**
 * La vague de ce jour est faite, ou pas.
 *
 * ── LA DERNIÈRE RÉPONSE GAGNE ─────────────────────────────────────────────
 * `on conflict do update` sur `(user_id, generated_meal_id, buy_on)`. Ce n'est
 * PAS append-only, et c'est la différence assumée avec les coches de repas: une
 * coche est un fait daté, un état de courses est un état. Quelqu'un qui tape
 * « Pas encore » à 20 h puis se ravise à 22 h a fait ses courses.
 *
 * ── AUCUN ÉTAT PAR ARTICLE ────────────────────────────────────────────────
 * Il n'y a pas de colonne pour ça, et c'est la garde: personne en aval ne lit
 * une liste à moitié cochée, et la collecter violerait T1.
 */
export async function writeGroceryWaveState(
  admin: SupabaseClient,
  args: {
    userId: string;
    mealId: string;
    buyOn: string;
    done: boolean;
    /** Le jour LOCAL du tap. Peut différer de `buyOn`; c'est `buyOn` qui règne. */
    answeredLocalDate: string;
    now: Date;
  },
): Promise<{ outcome: WaveStateOutcome; detail?: string }> {
  const { error } = await admin
    .from(GROCERY_WAVE_STATE_TABLE)
    .upsert({
      user_id: args.userId,
      generated_meal_id: args.mealId,
      buy_on: args.buyOn,
      done: args.done,
      answered_at: args.now.toISOString(),
      answered_local_date: args.answeredLocalDate,
    } as never, { onConflict: "user_id,generated_meal_id,buy_on" });
  if (error) {
    console.warn(JSON.stringify({
      tag: "keel.evening_strip.wave_state_write_failed",
      user_id: args.userId,
      meal_id: args.mealId,
      buy_on: args.buyOn,
      error: error.message,
    }));
    return { outcome: "failed", detail: error.message };
  }
  return { outcome: "written" };
}
