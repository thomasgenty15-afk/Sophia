/**
 * A8.3 — LE CÂBLAGE DU SORT D'UNE PART: lire le foyer, offrir l'étape, écrire.
 *
 * `share_step.ts` HABILLE (pur, testé) et `meal_share_outcome.ts` DÉCIDE (pur,
 * testé). Ce module LIT et ÉCRIT. Même frontière que partout dans `_shared/`.
 *
 * Un module à part plutôt qu'un bloc de plus dans `deterministic_buttons.ts`,
 * pour la raison que `accident_tap.ts` donne de sa propre existence: le routeur
 * porte déjà quatre familles de taps, et une cinquième écrite dedans le rendrait
 * illisible.
 *
 * ── CE QU'IL FAIT, ET CE QU'IL S'INTERDIT ─────────────────────────────────
 *   · Il écrit UNE ligne par bouche dans `meal_share_outcomes`, par la RPC
 *     `keel_household_declare_share_outcome_for` — jamais par un `insert`
 *     direct: la porte porte les trois gardes (ma bouche · le maître sur une
 *     bouche SANS COMPTE · ⛔ jamais un profil réclamé), et un second écrivain
 *     serait une seconde version de ces gardes.
 *   · ⛔ AUCUN GLISSEMENT DE PLAN (D8.4). Il n'importe ni `applyPlanShift` ni
 *     `computeSessionShift`, et il ne peut donc pas en déclencher un.
 *   · ⛔ AUCUNE COCHE, dans aucun sens (D8.2). Le silence n'écrit rien, et
 *     ranger une boîte ne dit rien de ce qui a été mangé.
 *   · ⛔ AUCUNE CORRECTION de la ligne du maître. Deux déclarations coexistent
 *     et c'est `resolveShareOutcomes` qui choisit laquelle lire.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ LE BOUTON N'EST OFFERT QUE SI LA PORTE L'ACCEPTERA — ET C'EST LA RÈGLE
 *    QUI GOUVERNE TOUT CE FICHIER.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La RPC exige un plan `plan_kind='household'` DE MON foyer (`not_your_plan`),
 * une bouche de MON foyer (`not_a_member`), et refuse le maître sur un profil
 * réclamé (`not_your_line`). Chacune de ces trois conditions est donc relue
 * AVANT de rendre un bouton. Un refus loin du geste se lit comme un bouton
 * mort — cicatrice `refusal-far-from-the-gesture-reads-as-a-dead-button`,
 * mesurée trois fois dans un seul écran de ce dépôt.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { readKitchenEquipment } from "../keel/kitchen_equipment.ts";
import { hasFreezerDeclared } from "../keel/kitchen_equipment.ts";
import { windowDates } from "../keel/meal_plan_window.ts";
import {
  boxOptionsFor,
  whoDidNotEatOptions,
} from "../keel/meal_share_outcome.ts";
import type { ShareOutcome } from "../keel/meal_share_outcome.ts";
import {
  buildBoxStep,
  buildMouthPickStep,
  buildWhoStep,
  renderShareAck,
  type ShareReply,
} from "../keel/share_step.ts";
import type { StripLanguage } from "../keel/evening_strip.ts";

/** Ce que rend une étape, dans la forme que le routeur envoie. */
export interface ShareTapResult {
  body: string;
  buttons: { payload: string; label: string }[];
  handledAs: string;
}

/**
 * ⚠️ `whole_household` NE REND PAS UNE ÉTAPE, IL REND UNE MAIN PASSÉE.
 *
 * « Toute la casserole est restée » n'est pas le sort d'une boîte: c'est un
 * plat que personne n'a mangé, et la seule action qui le répare est
 * `shift_dish` — qui appartient à la procédure accident (`REALIGNMENT_ACTIONS`)
 * et au MAÎTRE. Ce module ne la réimplémente pas: il dit à l'appelant de rendre
 * la main à FF-057.
 *
 * 🔴 ET IL FAUT LE SAVOIR: `shift_dish` n'a AUCUN EXÉCUTEUR dans ce dépôt
 * aujourd'hui (vérifié le 2026-09-03 — la seule occurrence hors tests est le
 * `handledAs` de `accident_tap.ts:418`). Le formulaire accident est donc bien
 * l'endroit où cette réponse doit atterrir, et c'est là que le trou est déjà
 * nommé. En fabriquer un ici en ferait un second, dans un module qui n'a pas le
 * droit de déplacer un plan.
 */
export const HAND_BACK_TO_ACCIDENT = "hand_back_to_accident" as const;

export type ShareTapOutcome =
  | { kind: "step"; result: ShareTapResult }
  | { kind: typeof HAND_BACK_TO_ACCIDENT };

// ---------------------------------------------------------------------------
// LA PLACE DE QUELQU'UN DANS SON FOYER — une lecture, pas une supposition
// ---------------------------------------------------------------------------

export interface HouseholdSeat {
  householdId: string;
  /** MA bouche. `null` quand la ligne est illisible. */
  memberId: string | null;
  isOwner: boolean;
  /** TOUTES les bouches du foyer, avec ou sans compte. */
  mouths: Array<{ memberId: string; firstName: string; userId: string | null }>;
}

/**
 * Ma place et les bouches de mon foyer, ou `null`.
 *
 * ⚠️ FAIL-CLOSED. Une lecture en panne, une personne sans foyer, une ligne sans
 * `member_id`: tout rend `null`, et `null` veut dire « aucune étape ». Le pire
 * cas est une soirée où la question du reste ne part pas; le pire cas de
 * l'inverse est un bouton qui écrira `no_household` au visage de quelqu'un.
 */
export async function loadHouseholdSeat(
  admin: SupabaseClient,
  userId: string,
): Promise<HouseholdSeat | null> {
  try {
    const mine = await admin
      .from("household_members")
      .select("household_id, member_id, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (mine.error) throw mine.error;
    const row = (mine.data ?? null) as
      | { household_id?: unknown; member_id?: unknown; role?: unknown }
      | null;
    if (!row) return null;
    const householdId = String(row.household_id ?? "").trim();
    if (!householdId) return null;

    const all = await admin
      .from("household_members")
      .select("member_id, first_name, user_id")
      .eq("household_id", householdId);
    if (all.error) throw all.error;
    const mouths = ((all.data ?? []) as Array<Record<string, unknown>>)
      .map((m) => ({
        memberId: String(m.member_id ?? "").trim(),
        firstName: String(m.first_name ?? "").trim(),
        // ⚠️ `null` EST UNE VALEUR, PAS UN DÉFAUT. C'est lui qui rend une
        // bouche cochable par le maître (D8.5); le confondre avec la chaîne
        // vide rendrait cochable un adulte, c'est-à-dire R11 renversé.
        userId: m.user_id === null || m.user_id === undefined
          ? null
          : String(m.user_id).trim() || null,
      }))
      .filter((m) => m.memberId);

    return {
      householdId,
      memberId: String(row.member_id ?? "").trim() || null,
      isOwner: String(row.role ?? "").trim() === "owner",
      mouths,
    };
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.share_outcome.seat_unreadable",
      user_id: userId,
      error: error instanceof Error ? error.message : String(error),
      effect: "fail-closed: aucune etape du sort d'une part ce soir",
    }));
    return null;
  }
}

// ---------------------------------------------------------------------------
// LE PLAT, DANS LE PLAN DU FOYER — la précondition exacte de la porte
// ---------------------------------------------------------------------------

interface ShareDishContext {
  /** La date du plat. `null` quand le plat ne nomme aucun jour de la fenêtre. */
  dishDate: string | null;
  /** Le congélateur, tel que le foyer l'a DÉCLARÉ. Jamais `!== false`. */
  hasFreezer: boolean;
}

/**
 * Le plat désigné, dans le plan du FOYER, avec le congélateur du foyer.
 *
 * ⚠️ `.eq("plan_kind","household")` ET `.eq("household_id", MON foyer)`, jamais
 * un `.eq("id")` nu. Le `mealId` vient de la CHARGE D'UN BOUTON, c'est-à-dire
 * d'une chaîne que le client contrôle, et ce chemin tourne sous `service_role`
 * (pas de RLS). C'est la forme équivalente au `.eq("user_id")` que l'on ne peut
 * pas poser ici — le plan du foyer est écrit sous le compte du MAÎTRE — et
 * c'est exactement celle qu'A8.0 a mesurée en run adversarial (H2).
 *
 * Le foyer vient de la BASE (`loadHouseholdSeat`), jamais du payload.
 */
async function loadShareDishContext(
  admin: SupabaseClient,
  args: { seat: HouseholdSeat; mealId: string; dishIndex: number },
): Promise<ShareDishContext | null> {
  try {
    const { data, error } = await admin
      .from("student_generated_meals")
      .select("user_id, starts_on, duration_days, dishes")
      .eq("id", args.mealId)
      .eq("plan_kind", "household")
      .eq("household_id", args.seat.householdId)
      .maybeSingle();
    if (error) throw error;
    const row = (data ?? null) as Record<string, unknown> | null;
    if (!row) return null;

    const dishes = Array.isArray(row.dishes)
      ? (row.dishes as Array<Record<string, unknown>>)
      : [];
    const dish = dishes[args.dishIndex] ?? null;
    if (!dish) return null;

    const startsOn = String(row.starts_on ?? "");
    const dates = /^\d{4}-\d{2}-\d{2}$/.test(startsOn)
      ? windowDates(startsOn, Number(row.duration_days) || 7)
      : {};
    const token = String(dish.day ?? "").trim();
    const dishDate = token ? dates[token] ?? null : null;

    // ── LE CONGÉLATEUR EST CELUI DU FOYER, DONC CELUI DU PLAN ─────────────
    // Il vit dans `student_goals.practical_constraints` du compte qui a ÉCRIT
    // le plan (le maître). Le lire chez le RÉPONDANT donnerait, pour un profil
    // réclamé, la réponse d'une autre cuisine que la sienne — et une lecture
    // absente vaut `false`, jamais « on suppose que oui ».
    const planOwnerId = String(row.user_id ?? "").trim();
    let hasFreezer = false;
    if (planOwnerId) {
      const goal = await admin
        .from("student_goals")
        .select("practical_constraints")
        .eq("user_id", planOwnerId)
        .maybeSingle();
      if (goal.error) throw goal.error;
      const pc = (goal.data ?? null) as
        | { practical_constraints?: Record<string, unknown> | null }
        | null;
      hasFreezer = hasFreezerDeclared(
        readKitchenEquipment(pc?.practical_constraints ?? null),
      );
    }
    return { dishDate, hasFreezer };
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.share_outcome.dish_unreadable",
      meal_id: args.mealId,
      dish_index: args.dishIndex,
      error: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}

// ---------------------------------------------------------------------------
// ① CE QU'UN ✗ OUVRE — l'étape « qui » chez le maître, la boîte chez le membre
// ---------------------------------------------------------------------------

/**
 * L'étape qu'un `✗` ouvre, ou `null` quand il n'y en a pas.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LES DEUX ENTRÉES SONT DISJOINTES, ET C'EST LA GARDE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   · LE MAÎTRE qui a des bouches SANS COMPTE reçoit « qui n'a pas mangé »,
 *     et JAMAIS la proposition de boîte: chez lui, le ✗ ne dit pas encore de
 *     QUELLE part on parle — sa propre assiette, la casserole entière, ou la
 *     part d'un enfant. Lui proposer « ta boîte » d'emblée trancherait la
 *     question à sa place et écrirait une ligne sur sa bouche pour un plat que
 *     c'est peut-être son fils qui n'a pas mangé.
 *   · LE MEMBRE reçoit la proposition de boîte, et JAMAIS l'étape « qui »: il
 *     n'a qu'une bouche à décrire — la sienne — et lui demander « qui ? » lui
 *     offrirait une réponse qu'il n'a pas le droit de donner (R11).
 *   · TOUT LE RESTE rend `null`, et la bande retombe alors EXACTEMENT sur son
 *     comportement d'avant ce lot (le formulaire accident de FF-057). Un maître
 *     sans bouche sans compte, une personne sans foyer, un plan qui n'est pas
 *     celui du foyer: rien de neuf ne s'affiche.
 *
 * ⚠️ CETTE ÉTAPE REMPLACE LE FORMULAIRE ACCIDENT, elle ne s'y ajoute pas. Deux
 * questions ouvertes dans la même bulle font choisir la personne entre deux
 * gestes dont l'un annule visuellement l'autre. Le formulaire n'est pas perdu:
 * il est la SUITE de la chaîne, rendue quand cette étape-ci ne laisse plus
 * aucune question ouverte (règle de FF-061, appliquée par l'appelant).
 */
export async function shareStepAfterUntick(
  admin: SupabaseClient,
  args: {
    userId: string;
    mealId: string;
    dishIndex: number;
    language: StripLanguage;
    /**
     * Le jour LOCAL de la personne au moment du tap. REQUIS.
     *
     * C'est la borne de `boxOptionsFor`: un jour écoulé ne se propose pas. Un
     * défaut implicite proposerait « garde-la pour hier » aux personnes dont le
     * fuseau a déjà tourné — cicatrice `optional-gate-params-are-disarmed-gates`.
     */
    localDate: string;
  },
): Promise<ShareTapResult | null> {
  const seat = await loadHouseholdSeat(admin, args.userId);
  if (!seat) return null;

  if (seat.isOwner) {
    // ⚠️ LA DÉRIVATION VIENT DU MODÈLE, ET N'EST PAS REFAITE ICI. `isOwner` est
    // passé tel qu'il a été LU, pas déduit d'un `mouths.length`: la règle « les
    // cases sont les bouches SANS COMPTE » et la règle « l'étape ne se pose pas
    // à un membre » vivent toutes les deux dans `whoDidNotEatOptions`.
    const step = buildWhoStep({
      mealId: args.mealId,
      dishIndex: args.dishIndex,
      step: whoDidNotEatOptions({ isOwner: true, mouths: seat.mouths }),
      language: args.language,
    });
    if (!step) return null;
    // La porte refuserait un plan qui n'est pas celui du foyer: on le vérifie
    // AVANT d'afficher les trois boutons, pas après le tap.
    const dish = await loadShareDishContext(admin, {
      seat,
      mealId: args.mealId,
      dishIndex: args.dishIndex,
    });
    if (!dish) return null;
    return {
      body: step.body,
      buttons: step.buttons.map((b) => ({ payload: b.id, label: b.title })),
      handledAs: "keel_share_who_asked",
    };
  }

  // ── LE MEMBRE — SA boîte, et rien d'autre ────────────────────────────────
  if (!seat.memberId) return null;
  return await boxStepFor(admin, {
    seat,
    mealId: args.mealId,
    dishIndex: args.dishIndex,
    memberId: seat.memberId,
    mouthName: null,
    language: args.language,
    localDate: args.localDate,
    handledAs: "keel_share_box_asked",
  });
}

// ---------------------------------------------------------------------------
// ② LA BOÎTE — la même étape pour soi et pour une bouche sans compte
// ---------------------------------------------------------------------------

async function boxStepFor(
  admin: SupabaseClient,
  args: {
    seat: HouseholdSeat;
    mealId: string;
    dishIndex: number;
    memberId: string;
    mouthName: string | null;
    language: StripLanguage;
    localDate: string;
    handledAs: string;
  },
): Promise<ShareTapResult | null> {
  const dish = await loadShareDishContext(admin, {
    seat: args.seat,
    mealId: args.mealId,
    dishIndex: args.dishIndex,
  });
  // Un plat sans jour n'a pas de boîte datable: « ta boîte de … » n'aurait pas
  // de quoi finir sa phrase, et la fenêtre frigo n'aurait pas d'origine.
  if (!dish?.dishDate) return null;

  const step = buildBoxStep({
    mealId: args.mealId,
    dishIndex: args.dishIndex,
    memberId: args.memberId,
    dishDate: dish.dishDate,
    options: boxOptionsFor({
      dishDate: dish.dishDate,
      today: args.localDate,
      hasFreezer: dish.hasFreezer,
    }),
    mouthName: args.mouthName,
    language: args.language,
  });
  if (!step) return null;
  return {
    body: step.body,
    buttons: step.buttons.map((b) => ({ payload: b.id, label: b.title })),
    handledAs: args.handledAs,
  };
}

// ---------------------------------------------------------------------------
// ③ L'ÉCRITURE — par la porte, jamais par un insert
// ---------------------------------------------------------------------------

export type ShareWriteOutcome = "written" | "refused" | "failed";

export interface ShareWriteResult {
  outcome: ShareWriteOutcome;
  /** Le motif nommé par la porte, quand elle refuse. */
  reason?: string;
}

/**
 * Range une boîte, par la jumelle `_for(p_user)`.
 *
 * ⚠️ LA JUMELLE, ET PAS LA PORTE CLIENT. Sous `service_role`, `auth.uid()` est
 * NULL: la porte client rendrait `not_authenticated` et la fonctionnalité
 * serait morte côté serveur sans qu'aucun test client ne le voie. C'est une
 * cicatrice mesurée de ce dépôt (`auth-uid-null-under-service-role`), et le
 * chemin du soir est un chemin SERVEUR.
 *
 * ⚠️ ON LIT LE `ok` DE LA RÉPONSE, PAS LE CODE HTTP. Une RPC qui rend
 * `{ok:false, reason:"not_your_line"}` répond 200: la traiter comme un succès
 * poserait « c'est noté » sur une écriture refusée — l'accusé fantôme, le
 * défaut le plus cher de ce dépôt.
 */
export async function writeShareOutcome(
  admin: SupabaseClient,
  args: {
    userId: string;
    mealId: string;
    dishIndex: number;
    memberId: string;
    outcome: ShareOutcome;
    shiftedToDay: string | null;
    localDate: string;
  },
): Promise<ShareWriteResult> {
  try {
    const { data, error } = await admin.rpc(
      "keel_household_declare_share_outcome_for",
      {
        p_user: args.userId,
        p_meal: args.mealId,
        p_dish_index: args.dishIndex,
        p_member: args.memberId,
        p_outcome: args.outcome,
        p_shifted_to_day: args.shiftedToDay,
        p_local_date: args.localDate,
      },
    );
    if (error) throw error;
    const row = (data ?? null) as { ok?: unknown; reason?: unknown } | null;
    if (row && row.ok === true) return { outcome: "written" };
    const reason = String(row?.reason ?? "unknown");
    console.warn(JSON.stringify({
      tag: "keel.share_outcome.refused",
      user_id: args.userId,
      meal_id: args.mealId,
      dish_index: args.dishIndex,
      member_id: args.memberId,
      reason,
    }));
    return { outcome: "refused", reason };
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.share_outcome.write_failed",
      user_id: args.userId,
      meal_id: args.mealId,
      dish_index: args.dishIndex,
      error: error instanceof Error ? error.message : String(error),
    }));
    return { outcome: "failed" };
  }
}

// ---------------------------------------------------------------------------
// ④ LE ROUTEUR DE CETTE FAMILLE
// ---------------------------------------------------------------------------

/**
 * Un tap de la famille `KEEL_SHARE_`, devenu un texte et des boutons.
 *
 * Ne jette JAMAIS: l'appelant a déjà accusé le geste côté HTTP, et un 500
 * laisserait la personne sans savoir si son tap a compté.
 */
export async function handleShareTap(
  admin: SupabaseClient,
  args: {
    userId: string;
    reply: Exclude<ShareReply, { kind: "none" }>;
    language: StripLanguage;
    /** Le jour LOCAL de la personne au moment du tap. REQUIS. */
    localDate: string;
  },
): Promise<ShareTapOutcome> {
  const { reply, language } = args;
  const stale = (): ShareTapOutcome => ({
    kind: "step",
    result: {
      body: renderShareAck("stale", language),
      buttons: [],
      handledAs: "keel_share_stale",
    },
  });

  const seat = await loadHouseholdSeat(admin, args.userId);
  if (!seat) return stale();

  // ── L'ÉTAPE « QUI » ─────────────────────────────────────────────────────
  if (reply.kind === "who") {
    // ⛔ RELUE DEPUIS LA BASE, JAMAIS DÉDUITE DE LA CHARGE. Un membre qui
    // forgerait `KEEL_SHARE_WHO|…|all` ne doit pas ouvrir le chemin du maître:
    // la place vient de `household_members`, pas du bouton.
    if (!seat.isOwner) return stale();

    if (reply.choice === "all") {
      // « Toute la casserole est restée » n'est pas une boîte: c'est un plat
      // que personne n'a mangé, et sa réparation appartient à FF-057.
      return { kind: HAND_BACK_TO_ACCIDENT };
    }

    if (reply.choice === "me") {
      if (!seat.memberId) return stale();
      const step = await boxStepFor(admin, {
        seat,
        mealId: reply.mealId,
        dishIndex: reply.dishIndex,
        memberId: seat.memberId,
        mouthName: null,
        language,
        localDate: args.localDate,
        handledAs: "keel_share_box_asked_owner",
      });
      return step ? { kind: "step", result: step } : stale();
    }

    // `pick` — les bouches SANS COMPTE, une par bouton.
    const options = whoDidNotEatOptions({ isOwner: true, mouths: seat.mouths });
    const step = buildMouthPickStep({
      mealId: reply.mealId,
      dishIndex: reply.dishIndex,
      mouths: options.choosable,
      language,
    });
    if (!step) return stale();
    return {
      kind: "step",
      result: {
        body: step.body,
        buttons: step.buttons.map((b) => ({ payload: b.id, label: b.title })),
        handledAs: "keel_share_mouths_listed",
      },
    };
  }

  // ── UNE BOUCHE DÉSIGNÉE ─────────────────────────────────────────────────
  if (reply.kind === "mouth") {
    if (!seat.isOwner) return stale();
    // ⛔ LA BOUCHE DOIT ÊTRE DANS LA LISTE COCHABLE, ET LA LISTE VIENT DU
    // MODÈLE. Une charge forgée citant la bouche d'un profil RÉCLAMÉ serait
    // refusée par la porte (`not_your_line`); on la refuse ici aussi, pour que
    // le refus ne soit jamais une surprise devant quelqu'un — et pour que la
    // garde d'écran et la garde SQL disent la même chose.
    const options = whoDidNotEatOptions({ isOwner: true, mouths: seat.mouths });
    const mouth = options.choosable.find((m) => m.memberId === reply.memberId);
    if (!mouth) return stale();

    // ⚠️ ON ÉCRIT `not_eaten` AVANT DE PROPOSER LE SORT, ET C'EST VOULU. Le
    // maître vient de DIRE que cette bouche n'a pas mangé: c'est un fait, et il
    // ne dépend pas de ce qu'il répondra ensuite. S'il abandonne l'étape
    // suivante, le fait reste — sans quoi ignorer une question effacerait une
    // déclaration déjà faite (D8.2 dans l'autre sens: le silence n'écrit rien,
    // mais il n'efface rien non plus).
    const wrote = await writeShareOutcome(admin, {
      userId: args.userId,
      mealId: reply.mealId,
      dishIndex: reply.dishIndex,
      memberId: mouth.memberId,
      outcome: "not_eaten",
      shiftedToDay: null,
      localDate: args.localDate,
    });
    if (wrote.outcome !== "written") return stale();

    const step = await boxStepFor(admin, {
      seat,
      mealId: reply.mealId,
      dishIndex: reply.dishIndex,
      memberId: mouth.memberId,
      mouthName: mouth.firstName,
      language,
      localDate: args.localDate,
      handledAs: "keel_share_box_asked_mouth",
    });
    // Pas d'étape suivante (plat sans jour, fenêtre fermée): le fait est écrit,
    // et on l'accuse. Un « rien » ici ferait croire que le tap n'a pas compté.
    return step
      ? { kind: "step", result: step }
      : {
        kind: "step",
        result: {
          body: renderShareAck("noted", language),
          buttons: [],
          handledAs: "keel_share_mouth_noted",
        },
      };
  }

  // ── LE SORT D'UNE BOÎTE ─────────────────────────────────────────────────
  // ⚠️ AUCUNE VÉRIFICATION DE PLACE ICI, ET CE N'EST PAS UN OUBLI: la porte
  // fait exactement celle-là (`not_your_line`), et la refaire en TypeScript
  // serait une seconde version d'une règle de sécurité. Ce qu'on vérifie
  // au-dessus, ce sont les listes qu'on AFFICHE; ce qu'on écrit passe par la
  // porte, et on lit son verdict.
  const wrote = await writeShareOutcome(admin, {
    userId: args.userId,
    mealId: reply.mealId,
    dishIndex: reply.dishIndex,
    memberId: reply.memberId,
    outcome: reply.outcome,
    shiftedToDay: reply.day,
    localDate: args.localDate,
  });
  if (wrote.outcome !== "written") return stale();
  console.info(JSON.stringify({
    tag: "keel.share_outcome.written",
    user_id: args.userId,
    meal_id: reply.mealId,
    dish_index: reply.dishIndex,
    member_id: reply.memberId,
    outcome: reply.outcome,
    shifted_to_day: reply.day,
  }));
  return {
    kind: "step",
    result: {
      body: renderShareAck("noted", language),
      buttons: [],
      handledAs: `keel_share_box_${reply.outcome}`,
    },
  };
}
