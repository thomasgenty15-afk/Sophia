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

import { parseAccidentPlan, planDates } from "./accident.ts";
// ⚠️ CYCLE ASSUMÉ ET VÉRIFIÉ: `accident_io.ts` importe `GROCERY_WAVE_STATE_TABLE`
// d'ici. Les deux usages sont dans des CORPS DE FONCTION, jamais à
// l'initialisation du module, donc aucune zone morte temporelle — vérifié à
// l'exécution, pas supposé. L'alternative (recopier un nom de table) créerait
// deux définitions d'une même chose, ce que ce dépôt paie plus cher.
import {
  COOKING_SESSION_STATE_TABLE,
  loadSkippedDishIndexes,
} from "./accident_io.ts";
import { planGroceryWaves, wavePreparationsFromRows } from "./grocery_waves.ts";
import { type MealUntickReason, mealTickKey } from "./meal_tick.ts";
import { isReportable, stretchDates } from "./meal_stretch.ts";
import { loadPlannedDishContext, resolvePlanScope } from "./planned_dish_io.ts";
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
  /**
   * FF-061 ① — LA VAGUE DU JOUR EST-ELLE DÉJÀ DÉCLARÉE ?
   *
   * `null` = aucune ligne, c'est-à-dire « on ne sait pas », c'est-à-dire la
   * question a lieu d'être. Un booléen (quelle que soit sa valeur) la ferme
   * POUR DE BON: c'est ce qui rend « une fois par vague » vrai sans compteur.
   *
   * ⚠️ IL FALLAIT LE LIRE POUR LA CHAÎNE. Avant FF-061 la question partait dans
   * le message du soir, et `wasPulseSentToday` suffisait à la poser une seule
   * fois. La chaîne demande la suite APRÈS une réponse: sans cet état,
   * l'étape ① se reproposerait à elle-même.
   */
  shoppingAnswered: boolean | null;
  /**
   * FF-061 ② — LA SESSION DE CUISINE DE **CE JOUR**, si elle n'est pas déclarée.
   *
   * ⛔ DE CE JOUR, ET PAS « DE CE JOUR OU AVANT ». `sessionQuestionFor`
   * (procédure accident) remonte aux sessions antérieures, et c'est juste
   * là-bas: la personne vient de décocher un plat précis, elle sait de quelle
   * cuisson on parle. Ici la question part SEULE, le soir, sans que rien ne
   * l'ait amenée — et une cuisson de l'avant-veille n'a plus de réparation
   * possible (R11: sur du passé on constate, aucun décalage n'est proposé).
   * Demander serait promettre une réparation qui n'arrivera pas.
   */
  cookOn: string | null;
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
  shoppingAnswered: null,
  cookOn: null,
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
  /** FF-057 — les index que la cascade d'une session sautée a fait tomber. */
  const hiddenBySkippedSession: number[] = [];
  /** FF-061 ② — les dates de cuisson du plan, pour savoir si l'une est CE jour. */
  const sessionDatesToday: string[] = [];
  try {
    const { data, error } = await admin
      .from("student_generated_meals")
      // ⚠️ `dishes` ET `cooking_sessions` SONT LÀ POUR FF-057, et leur absence a
      // été MESURÉE (run adversarial H7). Sans elles, `parseAccidentPlan` rendait
      // un plan SANS plats et SANS sessions: la cascade ne trouvait aucune
      // session, n'invalidait rien, et la bande continuait d'annoncer un plat
      // jamais cuisiné — exactement le défaut que FF-057 existe pour corriger.
      // Le filtre était vert, et il ne filtrait rien.
      // ⚠️ `user_id` EST LÀ POUR A8.0: c'est le compte qui a ÉCRIT le plan,
      // c'est-à-dire celui sous lequel les états de cuisson et de courses sont
      // écrits (des faits de FOYER, R10). Pour un profil réclamé, ce n'est pas
      // le sien — voir `loadSkippedDishIndexes`.
      .select(
        "user_id, dishes, cooking_sessions, shopping_list, preparations, starts_on, duration_days, content_locale",
      )
      .eq("id", planned.mealId)
      .maybeSingle();
    // ⚠️ « erreur » et « vide » ne se confondent pas. Une sonde qui les mélange a
    // déjà fait déclarer « aucun fait écrit » sur des scénarios qui en
    // écrivaient trois (cicatrice du 2026-08-11).
    if (error) throw error;
    const row = (data ?? null) as Record<string, unknown> | null;
    if (row) {
      // Le plan vient de `loadPlannedDishContext`, qui a DÉJÀ vérifié qu'il
      // est le sien ou celui de son foyer: on peut lire qui l'a écrit. Une
      // ligne sans `user_id` lisible (base doublée des tests, donnée
      // ancienne) retombe sur la personne elle-même — le comportement d'avant.
      const planOwnerId = String(row.user_id ?? "").trim() || args.userId;
      contentLocale = String(row.content_locale ?? "").trim() || null;
      const list = Array.isArray(row.shopping_list)
        ? (row.shopping_list as Array<Record<string, unknown>>).map((item) => ({
          term: String(item?.term ?? ""),
          aisle: String(item?.aisle ?? ""),
          // ⟳ 2026-08-23 — LE GROUPE, QUI PORTE LA DATE D'ACHAT.
          // Il manquait ici, et le `?` de `WaveItem.food_group` laissait
          // l'oubli compiler: la bande du soir routait donc TOUTES ses courses
          // sur `MAX_FRIDGE_DAYS`, c'est-à-dire sur une seule vague. Le champ
          // est requis depuis, et c'est le compilateur qui a recensé ce site.
          food_group: item?.food_group === null || item?.food_group === undefined
            ? null
            : String(item.food_group),
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
        // ⟳ LOT C (2026-09-04) — CE LECTEUR NE CONNAÎT PAS LA CADENCE, et il ne
        // doit donc RIEN replier: `runs: null` rend le comportement d'avant le
        // lot, octet pour octet. Seuls les deux générateurs, qui ont lu le style
        // et le nombre de courses, passent un nombre ici.
        runs: null,
        freezer: false,
      });
      // DEUX VAGUES LE MÊME JOUR ⇒ UNE SEULE LIGNE (§7). La question porte sur
      // « les courses du jour », pas sur chaque vague — et l'état écrit est
      // celui du jour d'achat, donc les deux se répondent d'un seul tap.
      const today = waves.find((w) => w.buyOn === args.localDate);
      if (today) shopping = { buyOn: today.buyOn };

      // ── FF-057 · LES PLATS QUI N'EXISTENT PAS NE SE NOMMENT PAS ─────────
      //
      // Une session de cuisine déclarée non faite fait disparaître du RÉEL les
      // repas qui en dépendaient. Les nommer quand même est le défaut d'origine
      // de FF-057: « la personne ouvre l'app mardi, on lui annonce un plat qui
      // n'a jamais été cuisiné. » La cascade est DÉRIVÉE à la lecture
      // (`loadSkippedDishIndexes`), jamais stockée — donc il n'y a aucun second
      // état à invalider.
      //
      // ⚠️ UN PLAT DÉJÀ COCHÉ SURVIT: `cascadeSkippedSession` l'écarte, parce
      // qu'on croit le FAIT plutôt que la déclaration de session. La garde est
      // dans le calcul, pas ici.
      //
      // Une lecture en panne rend `[]`: on perd le filtre, jamais la bande.
      const plan = parseAccidentPlan(planned.mealId, row);
      if (plan) {
        // FF-061 ② — LES DATES DE CUISSON DU PLAN, résolues par le MÊME parseur
        // que la cascade. Une seconde lecture de `cooking_sessions` ici aurait
        // sa propre idée du calendrier du plan; celle-ci est celle qui décide
        // déjà quels plats tombent.
        const dates = planDates(plan);
        for (const session of plan.sessions) {
          const d = dates[session.day];
          if (d) sessionDatesToday.push(d);
        }
        // ── A8.0 · LA CASCADE DU MAÎTRE AMPUTE AUSSI LA BANDE DU MEMBRE ───
        // La cuisson ratée est déclarée par le maître sous SON `user_id`
        // (`statesOwnerId`); la coche vivante qui fait survivre un plat est
        // celle de LA PERSONNE (`userId`). Deux clés, parce que ce sont deux
        // faits de nature différente (FF-058 R10). Le cron sert les maîtres
        // avant les membres dans le même tick pour que cette lecture voie la
        // déclaration du soir (FF-061 §11).
        const skipped = new Set(
          await loadSkippedDishIndexes(admin, {
            userId: args.userId,
            statesOwnerId: planOwnerId,
            plan,
          }),
        );
        if (skipped.size > 0) {
          for (const i of skipped) hiddenBySkippedSession.push(i);
        }
      }
    }
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.evening_strip.waves_unreadable",
      user_id: args.userId,
      meal_id: planned.mealId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  // Le filtre s'applique APRÈS la lecture des vagues, et il est calculé sur le
  // plan entier: `dishes` ne porte que les plats du jour, mais une session
  // sautée invalide des plats de plusieurs jours. On ne retire ici que ceux qui
  // tombent AUJOURD'HUI — les autres jours se filtreront à leur tour.
  const hidden = new Set(hiddenBySkippedSession);
  const shown = hidden.size > 0
    ? dishes.filter((d) => !hidden.has(d.dishIndex))
    : dishes;
  // ── FF-061 ① ET ② — LES DEUX ÉTATS QUE LA CHAÎNE DEMANDE ────────────────
  //
  // ⚠️ LUS ICI, PAS CHEZ L'APPELANT. Les deux se lisent contre le MÊME plan que
  // les plats, et deux endroits qui résolvent « quel plan possède ce jour »
  // finissent par en désigner deux différents — c'est la règle de l'en-tête de
  // ce chargeur, appliquée aux deux états.
  const shoppingAnswered = shopping
    ? await waveAnsweredOn(admin, {
      userId: args.userId,
      mealId: planned.mealId,
      buyOn: shopping.buyOn,
    })
    : null;
  const cookOn = await undeclaredSessionToday(admin, {
    userId: args.userId,
    mealId: planned.mealId,
    localDate: args.localDate,
    sessionDates: sessionDatesToday,
  });

  // ⟳ FF-061 R10 — « ZÉRO PLAT » NE FERME PLUS LE BILAN À LUI SEUL.
  //
  // Ce chargeur rendait `no_dish_today` dès que la liste était vide, et
  // l'appelant s'arrêtait là. C'était juste tant que le message ne portait
  // QUE des plats: sans plat, il n'y avait rien. Depuis la chaîne, une vague de
  // courses ou une session de cuisine non déclarées sont, elles aussi, quelque
  // chose à demander — et une journée dont tous les plats sont éteints est
  // précisément une journée où ① ou ② a lieu d'être.
  //
  // R10 devient donc « zéro plat ET zéro cuisson ET zéro vague ». Le motif reste
  // rendu pour le compte-rendu; c'est `openingStep` qui décide s'il reste
  // quelque chose, et `buildEveningStrip` qui garde sa propre garde R7.
  return {
    mealId: planned.mealId,
    dishes: shown,
    shopping,
    shoppingAnswered,
    cookOn,
    contentLocale,
    reason: shown.length === 0 ? "no_dish_today" : "loaded",
  };
}

/**
 * La vague de ce jour a-t-elle DÉJÀ une réponse ?
 *
 * `null` = aucune ligne, donc « on ne sait pas », donc la question a lieu
 * d'être. Un booléen la ferme pour de bon — « une fois par vague », sans
 * compteur.
 *
 * ⚠️ FAIL-CLOSED VERS LE SILENCE, et c'est l'inverse du chargeur de plats. Une
 * lecture en panne rend `false` (« déjà répondue »), donc on NE POSE PAS la
 * question. Le pire cas est une vague qu'on ne demande pas ce soir; le pire cas
 * de l'inverse est une question qui repart à chaque tick horaire pendant que
 * Postgres bégaye — c'est-à-dire la relance que R2 de FF-062 interdit.
 */
async function waveAnsweredOn(
  admin: SupabaseClient,
  args: { userId: string; mealId: string; buyOn: string },
): Promise<boolean | null> {
  try {
    const { data, error } = await admin
      .from(GROCERY_WAVE_STATE_TABLE)
      .select("done")
      .eq("user_id", args.userId)
      .eq("generated_meal_id", args.mealId)
      .eq("buy_on", args.buyOn)
      .maybeSingle();
    if (error) throw error;
    const row = (data ?? null) as { done?: unknown } | null;
    return row ? Boolean(row.done) : null;
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.evening_strip.wave_state_unreadable",
      user_id: args.userId,
      meal_id: args.mealId,
      buy_on: args.buyOn,
      error: error instanceof Error ? error.message : String(error),
      effect: "fail-closed: la question des courses ne part pas ce soir",
    }));
    return false;
  }
}

/**
 * La session de cuisine de CE JOUR, si aucune ligne ne la déclare.
 *
 * ⛔ DE CE JOUR SEULEMENT. Voir le pavé de `EveningStripContext.cookOn`: une
 * cuisson de l'avant-veille n'a plus de réparation possible (R11), et la
 * demander serait promettre quelque chose qui n'arrivera pas.
 *
 * ⚠️ MÊME FAIL-CLOSED QUE LA VAGUE, et pour la même raison. `loadSessionStates`
 * rend `[]` sur une panne, ce qui est indiscernable de « aucune ligne » — donc
 * on lit ici, avec sa propre branche d'erreur, plutôt que de faire dire à un
 * tableau vide deux choses opposées.
 */
async function undeclaredSessionToday(
  admin: SupabaseClient,
  args: {
    userId: string;
    mealId: string;
    localDate: string;
    sessionDates: readonly string[];
  },
): Promise<string | null> {
  if (!args.sessionDates.includes(args.localDate)) return null;
  try {
    const { data, error } = await admin
      .from(COOKING_SESSION_STATE_TABLE)
      .select("cook_on")
      .eq("user_id", args.userId)
      .eq("generated_meal_id", args.mealId)
      .eq("cook_on", args.localDate)
      .maybeSingle();
    if (error) throw error;
    return data ? null : args.localDate;
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.evening_strip.session_state_unreadable",
      user_id: args.userId,
      meal_id: args.mealId,
      cook_on: args.localDate,
      error: error instanceof Error ? error.message : String(error),
      effect: "fail-closed: la question de cuisson ne part pas ce soir",
    }));
    return null;
  }
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

/**
 * ⚠️ LE `.eq("user_id")` N'EST PAS DÉCORATIF — MESURÉ EN RUN ADVERSARIAL (H2).
 *
 * Ce chargeur tourne sous `service_role`: la RLS ne s'applique PAS, et le
 * `mealId` vient de la CHARGE D'UN BOUTON, c'est-à-dire d'une chaîne que le
 * client contrôle. Sans ce filtre, une charge forgée citant la composition d'un
 * AUTRE élève écrivait une coche chez l'attaquant portant le TITRE DU PLAT DE
 * LA VICTIME — mesuré: `student_note = "SECRET private dish of Vera"`, puis
 * cité tel quel dans le message du soir de l'attaquant. Rien n'était écrit chez
 * la victime (R11 tenait), mais sa composition fuyait.
 *
 * C'est la cicatrice `rls-is-not-a-substitute-for-eq-user-id`, exactement:
 * « la ligne d'un élève rendue au coach ». Le filtre est ici, dans le chargeur,
 * plutôt qu'au site d'appel — un second appelant l'oublierait.
 *
 * ── A8.0 · UN PROFIL RÉCLAMÉ COCHE SUR LE PLAN DE SON FOYER ───────────────
 * Le plan `household` est écrit sous le `user_id` du MAÎTRE: pour un membre, le
 * filtre ci-dessus ne rend rien — et c'est pour ça que sa coche n'existait pas.
 * La garde ÉQUIVALENTE (pas un retrait) est `.eq("plan_kind","household")` ET
 * `.eq("household_id", SON foyer)`, résolu par `resolvePlanScope` — jamais par
 * la charge du bouton. H2 rejoué avec cette forme: une charge citant le plan
 * d'un AUTRE foyer rend toujours `stale`, puisque le foyer vient de la base,
 * pas du payload.
 */
async function loadPlanForTick(
  admin: SupabaseClient,
  mealId: string,
  userId: string,
): Promise<PlanForTick | null> {
  const own = await admin
    .from("student_generated_meals")
    .select("dishes, starts_on, duration_days, content_locale")
    .eq("id", mealId)
    .eq("user_id", userId)
    .maybeSingle();
  if (own.error) {
    console.warn(JSON.stringify({
      tag: "keel.evening_strip.plan_unreadable",
      meal_id: mealId,
      error: own.error.message,
    }));
    return null;
  }
  let row = (own.data ?? null) as Record<string, unknown> | null;
  if (!row) {
    const scope = await resolvePlanScope(admin, userId);
    if (scope.kind !== "household_member") return null;
    const shared = await admin
      .from("student_generated_meals")
      .select("dishes, starts_on, duration_days, content_locale")
      .eq("id", mealId)
      .eq("plan_kind", "household")
      .eq("household_id", scope.householdId)
      .maybeSingle();
    if (shared.error) {
      console.warn(JSON.stringify({
        tag: "keel.evening_strip.plan_unreadable",
        meal_id: mealId,
        scope: "household_member",
        error: shared.error.message,
      }));
      return null;
    }
    row = (shared.data ?? null) as Record<string, unknown> | null;
  }
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
  args: { userId: string; mealId: string; dishIndexes: readonly number[] },
): Promise<StripDish[]> {
  const plan = await loadPlanForTick(admin, args.mealId, args.userId);
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
  /** Le plan a disparu, n'est pas le sien, ou l'index ne désigne plus rien. */
  | "stale"
  /**
   * L'index désigne un plat d'un jour QUI N'EST PAS ENCORE ARRIVÉ. Rien n'est
   * écrit — voir `writeMealTick`, la garde `isReportable`.
   */
  | "future"
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
 * @param disqualified `null` pour cocher, un `MealUntickReason` pour décocher.
 *   REQUIS: les deux gestes partagent la ligne, la clé et l'index d'unicité, et
 *   c'est la valeur de cette colonne — et elle seule — qui les distingue. Un
 *   paramètre optionnel aurait fait d'un oubli une coche silencieuse.
 *
 *   ⚠️ QUATRE VALEURS DEPUIS FF-057 §3.A, ET PAS UNE. `food_not_eaten` est la
 *   décoche NUE (celle de la bande du soir, celle qui précède le formulaire);
 *   `ordered`, `no_time` et `ate_other` sont les trois motifs du formulaire.
 *   Ce paramètre est ce qui porte le POURQUOI jusqu'à la ligne — avant, les
 *   trois boutons de la fiche écrivaient tous la même chose et la réponse était
 *   perdue à l'écriture.
 */
export async function writeMealTick(
  admin: SupabaseClient,
  args: {
    userId: string;
    mealId: string;
    dishIndex: number;
    disqualified: MealUntickReason | null;
    /** Chargé une fois par tap agrégé plutôt qu'une fois par plat. */
    plan: PlanForTick;
    /**
     * LE JOUR LOCAL DE LA PERSONNE AU MOMENT DU TAP. REQUIS.
     *
     * C'est le plafond de `isReportable`: on rattrape le passé, jamais le futur.
     * Optionnel, il aurait laissé passer exactement le trou mesuré en H1.
     */
    today: string;
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

  // ⚠️ LE FUTUR NE SE COCHE PAS — MESURÉ EN RUN ADVERSARIAL (H1).
  //
  // Les index viennent de la CHARGE D'UN BOUTON. La bande n'y met que les plats
  // du jour, mais la charge est une chaîne que le client contrôle: une charge
  // forgée citant le plat de DEMAIN écrivait un « j'ai mangé » daté de demain,
  // append-only, dans la table que le coach lit. `meal_stretch.ts` l'écrit
  // depuis toujours: « ce n'est pas une imprécision, c'est une preuve
  // fabriquée. » On réutilise SA garde plutôt que d'en écrire une seconde.
  if (!isReportable(localDate, args.today)) {
    return { outcome: "future", key, localDate, detail: "not_reportable_yet" };
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
  /** Index qui désignent un jour pas encore arrivé. Jamais écrits. */
  future: number;
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
    disqualified: MealUntickReason | null;
    /** Le jour local de la personne au moment du tap. REQUIS — voir H1. */
    today: string;
    now: Date;
  },
): Promise<StripTickBatchResult> {
  const out: StripTickBatchResult = {
    written: 0,
    rearmed: 0,
    stale: 0,
    future: 0,
    failed: 0,
    keys: [],
  };
  const plan = await loadPlanForTick(admin, args.mealId, args.userId);
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
      today: args.today,
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
  // ⚠️ LE PLAN DOIT ÊTRE LE SIEN. Même trou que H2, sur l'autre écriture: le
  // `mealId` vient de la charge d'un bouton, la FK ne contraint que l'existence
  // de la ligne, et ce chemin tourne sous `service_role` (pas de RLS). Sans
  // cette vérification, une charge forgée écrirait un état de vague attaché à
  // la composition de quelqu'un d'autre — c'est-à-dire une ligne que FF-057
  // relira demain comme un fait du foyer de la victime.
  const owner = await admin
    .from("student_generated_meals")
    .select("id")
    .eq("id", args.mealId)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (owner.error || !owner.data) {
    console.warn(JSON.stringify({
      tag: "keel.evening_strip.wave_state_foreign_plan",
      user_id: args.userId,
      meal_id: args.mealId,
      error: owner.error?.message ?? "not_owned",
    }));
    return { outcome: "failed", detail: "plan_not_owned" };
  }

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
