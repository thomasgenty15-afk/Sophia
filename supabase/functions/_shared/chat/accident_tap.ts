/**
 * FF-057 — LE TRAITEMENT DES TAPS DE LA PROCÉDURE ACCIDENT.
 *
 * Un module à part plutôt qu'un bloc de plus dans `deterministic_buttons.ts`:
 * ce fichier-là est le ROUTEUR des taps (il en porte quatre familles), et lui
 * ajouter sept branches le rendrait illisible pour les lots suivants. Le routeur
 * garde donc trois lignes — lire, router, rendre — et la fiche vit ici.
 *
 * ── CE QUE CE CHEMIN FAIT, ET CE QU'IL S'INTERDIT ─────────────────────────
 * Il ÉCRIT (par les chemins existants: `applyStripTicks` pour la décoche,
 * `writeOffPlanTapFact` pour le fait hors plan, `writeSessionState` pour le
 * marqueur, `applyPlanShift` pour les dates), il RELIT, et il dit ce qu'il a
 * relu. Rien de plus:
 *
 *   · aucun appel de modèle — un glissement DÉPLACE DES DATES (R13). V3 est
 *     fermé, et il n'existe ici aucun chemin qui recompose quoi que ce soit;
 *   · aucun aliment inventé — `writeOffPlanTapFact` n'a AUCUN paramètre par
 *     lequel un `food_group_ref` pourrait entrer (R8);
 *   · aucune question ouverte sur le futur — les textes passent par
 *     `acceptAccidentText`, armée, dans les deux langues (R11);
 *   · aucune relance, aucune reproposition — un refus se dit une fois et rien
 *     ne reste ouvert derrière (§3, hors périmètre);
 *   · rien sous plancher de restriction (R9).
 *
 * ⚠️ L'ACCUSÉ NE DESCEND JAMAIS AU DISPATCHER, pour la raison que
 * `handleStripTap` écrit déjà: la lane de réponse ne sait ni ce que le
 * déterministe a écrit ni ce qu'il a refusé, et elle produit des accusés
 * fantômes. Ce chemin écrit, relit, et pose lui-même la phrase.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import {
  type AccidentLanguage,
  type AccidentPlan,
  type AccidentReply,
  buildAccidentForm,
  buildRealignmentSpace,
  buildSessionQuestion,
  buildShiftProposal,
  cascadeSkippedSession,
  dishDate,
  MAX_FRIDGE_DAYS,
  planDates,
  renderAccidentAck,
  renderCascadeOutcome,
  renderNothingToChange,
  renderShiftApplied,
  renderShiftRefusal,
  sessionOnDate,
} from "../keel/accident.ts";
import {
  applyPlanShift,
  computeSessionShift,
  loadAccidentPlan,
  loadLiveTickIndexes,
  loadSessionStates,
  writeOffPlanTapFact,
  writeSessionState,
} from "../keel/accident_io.ts";
import {
  countDailyAsksOfKind,
  hasEverAsked,
  PHOTO_INVITATION_DAILY_CAP,
  recordDailyAsk,
} from "../keel/daily_ask_budget.ts";
import { applyStripTicks } from "../keel/evening_strip_io.ts";
import { planGroceryWavesForPlan } from "../keel/accident.ts";
import { gatePhotoInvitation } from "../keel/photo_invitation.ts";
import { MEAL_UNTICK_REASON } from "../keel/meal_tick.ts";

/**
 * ⚠️ LE PLANCHER DE RESTRICTION N'A PLUS DE PRODUCTEUR, et c'est nommé ici.
 *
 * `isRestrictionFlagged` a été retiré en L3 le 2026-08-08 (il lisait
 * `weekly_reviews.risk_band`, une colonne sans écrivain). `keel-daily-pulse-v1`
 * passe `false` en dur pour la même raison. La garde R9 est ARMÉE et TESTÉE dans
 * `buildAccidentForm` / `buildSessionQuestion` / `buildShiftProposal` — c'est ce
 * qui la rendra vivante le jour où une source alimentée sera rebranchée, au lieu
 * d'être une ligne à retrouver. Un seul littéral à changer ici.
 */
const RESTRICTION_FLAG_HAS_NO_PRODUCER = false;

export interface AccidentTapResult {
  /** Le corps à envoyer. Jamais vide. */
  body: string;
  /** Les boutons à joindre, s'il y en a. */
  buttons: { payload: string; label: string }[];
  /** Le nom du traitement, pour `handled(...)`. */
  handledAs: string;
}

const STALE = (language: AccidentLanguage): AccidentTapResult => ({
  body: renderAccidentAck("stale", language),
  buttons: [],
  handledAs: "keel_accident_stale",
});

/**
 * LE POINT D'ENTRÉE — un tap de la fiche devient un texte et des boutons.
 *
 * Ne jette JAMAIS: l'appelant a déjà accusé réception du geste côté HTTP, et un
 * 500 laisserait la personne sans savoir si son tap a compté.
 */
export async function handleAccidentTap(
  admin: SupabaseClient,
  args: {
    userId: string;
    reply: Exclude<AccidentReply, { kind: "none" }>;
    language: AccidentLanguage;
    contentLocale: string;
    /** Le jour LOCAL de la personne au moment du tap. REQUIS. */
    localDate: string;
    now: Date;
    /** L'identifiant du message entrant — la clé d'idempotence du budget T4. */
    sourceMessageId: string;
  },
): Promise<AccidentTapResult> {
  const { reply, language } = args;

  const loaded = await loadAccidentPlan(admin, {
    userId: args.userId,
    mealId: reply.mealId,
  });
  // §7 — « le formulaire s'ouvre sans plan courant ⇒ il se referme sans rien
  // écrire ». Il n'y a rien à réaligner, et le dire est plus honnête que de
  // laisser croire qu'un geste a compté.
  if (!loaded) return STALE(language);
  const plan = loaded.plan;

  // ⚠️ CHAQUE BRANCHE PASSE SON `reply` NOMMÉMENT, jamais par diffusion
  // (`{...args}`): le compilateur ne rétrécit pas une union à travers un spread,
  // et le faire taire par un `as` désarmerait exactement le typecheck qui a
  // trouvé cette faute. Cicatrice `as-cast-on-foreign-type-disarms-typecheck`.
  if (
    reply.kind === "ordered" || reply.kind === "no_time" ||
    reply.kind === "ate_other"
  ) {
    return await handleFormAnswer(admin, {
      userId: args.userId,
      plan,
      reply,
      language: args.language,
      contentLocale: args.contentLocale,
      localDate: args.localDate,
      now: args.now,
      sourceMessageId: args.sourceMessageId,
    });
  }

  if (reply.kind === "session") {
    return await handleSessionAnswer(admin, {
      userId: args.userId,
      plan,
      reply,
      language: args.language,
      localDate: args.localDate,
      now: args.now,
    });
  }

  if (reply.kind === "shift_decline") {
    // §7 — « rien ne change, aucune insistance. Le plan reste tel quel. » Et
    // AUCUNE ligne n'est écrite: l'auto-limitation vient du `buyOn` passé
    // (FF-058 R15), pas d'un état de refus à relire. Un état de refus serait
    // exactement le mécanisme de relance que la fiche interdit.
    return {
      body: renderAccidentAck("declined", language),
      buttons: [],
      handledAs: "keel_accident_shift_declined",
    };
  }

  return await handleShiftAccept(admin, {
    userId: args.userId,
    plan,
    reply,
    language: args.language,
    localDate: args.localDate,
  });
}

// ---------------------------------------------------------------------------
// ① LE FORMULAIRE — trois boutons, trois écritures différentes
// ---------------------------------------------------------------------------

async function handleFormAnswer(
  admin: SupabaseClient,
  args: {
    userId: string;
    plan: AccidentPlan;
    reply: Extract<
      AccidentReply,
      { kind: "ordered" | "no_time" | "ate_other" }
    >;
    language: AccidentLanguage;
    contentLocale: string;
    localDate: string;
    now: Date;
    sourceMessageId: string;
  },
): Promise<AccidentTapResult> {
  const { plan, reply, language } = args;
  const dish = plan.dishes.find((d) => d.dishIndex === reply.dishIndex) ?? null;
  if (!dish) return STALE(language);

  // ── LA DÉCOCHE, PAR LE CHEMIN DE L'ÉCRAN ────────────────────────────────
  // Les trois boutons décochent. C'est idempotent (l'index unique partiel
  // arbitre), donc rejouer sur un plat déjà décoché par la bande ne fait pas de
  // seconde ligne — et ça rend le formulaire autonome quelle que soit l'entrée
  // (bande, écran, conversation).
  const ticks = await applyStripTicks(admin, {
    userId: args.userId,
    mealId: plan.mealId,
    dishIndexes: [reply.dishIndex],
    disqualified: MEAL_UNTICK_REASON,
    today: args.localDate,
    now: args.now,
  });

  const dishOn = dishDate(plan, dish) ?? args.localDate;

  // ── LE FAIT HORS PLAN, pour deux des trois boutons ──────────────────────
  let offPlanEventId: string | null = null;
  if (reply.kind === "ordered" || reply.kind === "ate_other") {
    const wrote = await writeOffPlanTapFact(admin, {
      userId: args.userId,
      mealId: plan.mealId,
      dishIndex: reply.dishIndex,
      slotKey: dish.slot,
      contentLocale: args.contentLocale,
      localDate: dishOn,
      // ⚠️ LE PLAFOND DU PASSÉ (H1). Sans lui, une charge forgée citant le plat
      // de DEMAIN écrivait un « j'ai mangé autre chose » daté de demain.
      today: args.localDate,
      now: args.now,
    });
    if (wrote.outcome !== "written" && wrote.outcome !== "already") {
      // On ne dit JAMAIS « c'est noté » sur une écriture qu'on n'a pas faite —
      // ni sur une écriture REFUSÉE parce qu'elle portait sur le futur.
      return STALE(language);
    }
    offPlanEventId = wrote.protocolEventId;
  }

  console.info(JSON.stringify({
    tag: "keel.accident.form_answer",
    user_id: args.userId,
    meal_id: plan.mealId,
    dish_index: reply.dishIndex,
    kind: reply.kind,
    unticked: ticks.written + ticks.rearmed,
    off_plan_event: offPlanEventId,
  }));

  // ── « J'AI COMMANDÉ » ⇒ L'INVITATION PHOTO, SI LE BUDGET EST LIBRE ──────
  // R12 — UNE SEULE CHOSE À LA FOIS: cette branche ne propose jamais de
  // décalage, et la branche du décalage n'invite jamais à la photo. Les deux ne
  // peuvent donc pas voyager dans le même échange.
  if (reply.kind === "ordered") {
    const sentence = await armPhotoInvitation(admin, {
      userId: args.userId,
      contentLocale: args.contentLocale,
      localDate: args.localDate,
      offPlanEventId,
      sourceMessageId: args.sourceMessageId,
    });
    return {
      body: sentence ?? renderAccidentAck("noted", language),
      buttons: [],
      handledAs: sentence
        ? "keel_accident_ordered_photo"
        : "keel_accident_ordered",
    };
  }

  // ── « J'AI MANGÉ AUTRE CHOSE » ⇒ RIEN DE PLUS (fiche §3) ────────────────
  if (reply.kind === "ate_other") {
    return {
      body: renderAccidentAck("noted", language),
      buttons: [],
      handledAs: "keel_accident_ate_other",
    };
  }

  // ── « PAS EU LE TEMPS » ⇒ LA NOURRITURE EXISTE PEUT-ÊTRE ENCORE ─────────
  // C'est le seul bouton qui ouvre le réalignement, et c'est aussi le moment où
  // la question de session se pose — UNE fois par session, jamais par plat.
  const sessionAsk = await sessionQuestionFor(admin, {
    userId: args.userId,
    plan,
    dishIndex: reply.dishIndex,
    localDate: args.localDate,
    language,
  });
  if (sessionAsk) {
    return {
      body: sessionAsk.body,
      buttons: sessionAsk.buttons.map((b) => ({
        payload: b.id,
        label: b.title,
      })),
      handledAs: "keel_accident_session_question",
    };
  }

  const space = buildRealignmentSpace({
    plan,
    today: args.localDate,
    dishIndex: reply.dishIndex,
    skippedSessionOn: null,
    shift: null,
    maxFridgeDays: MAX_FRIDGE_DAYS,
  });
  // R4 — « NE RIEN FAIRE » EST UNE BONNE FIN, et on le DIT. Un flow qui trouve
  // toujours quelque chose à réparer transforme chaque écart en incident.
  return {
    body: renderNothingToChange(language),
    buttons: [],
    handledAs: space.some((a) => a.id === "shift_dish")
      ? "keel_accident_no_time_shiftable"
      : "keel_accident_no_time_nothing",
  };
}

/**
 * L'INVITATION PHOTO (FF-025), appelée et JAMAIS RÉIMPLÉMENTÉE.
 *
 * On appelle le GATE PUR du dépôt (`gatePhotoInvitation`) et le compteur partagé
 * (`daily_ask_budget.ts`), pas la lane de `sophia-brain/router/` — celle-ci
 * prend un `TurnFrame` et vit derrière une frontière que `_shared/` ne traverse
 * pas. Le gate, lui, est pur et partagé: c'est la même décision, avec les mêmes
 * huit refus dans le même ordre.
 *
 * ⚠️ LA PLACE EST PRISE AVANT QUE LA PHRASE NE PARTE. `recordDailyAsk` échoue ⇒
 * on n'invite pas. Une demande hors compteur rend le plafond décoratif, et c'est
 * l'élève à huit demandes par jour qu'on cherche à éviter.
 */
async function armPhotoInvitation(
  admin: SupabaseClient,
  args: {
    userId: string;
    contentLocale: string;
    localDate: string;
    offPlanEventId: string | null;
    sourceMessageId: string;
  },
): Promise<string | null> {
  // ⚠️ LE PLAFOND EST CELUI DE LA PHOTO, PAS LA PLACE PARTAGÉE DU JOUR.
  //
  // Avant: un soir où la question de divergence (ou la pratique, ou la
  // recommandation) était déjà partie, ce tap n'invitait à RIEN — le fait
  // hors-plan s'enregistrait sans le moindre détail. Or l'invitation répond à un
  // geste que la personne vient de faire, exactement comme
  // `shiftProposalAfterShoppingLater` quinze lignes plus bas, exempté pour ce
  // motif depuis le premier jour. Les deux frères se comportent enfin pareil.
  //
  // Le plafond propre reste armé (`PHOTO_INVITATION_DAILY_CAP`): l'unicité du
  // ledger est par MESSAGE, elle n'aurait pas empêché trois invitations dans la
  // journée sur trois messages différents.
  const [asks, ever] = await Promise.all([
    countDailyAsksOfKind(admin, {
      userId: args.userId,
      localDate: args.localDate,
      kind: "photo_invitation",
      capOnFailure: PHOTO_INVITATION_DAILY_CAP,
    }),
    hasEverAsked(admin, { userId: args.userId, kind: "photo_invitation" }),
  ]);
  const gate = gatePhotoInvitation({
    locale: args.contentLocale,
    // Le fait vient d'être écrit et RELU: sa relation est `off_plan` par
    // construction, et son identifiant le prouve.
    planRelation: args.offPlanEventId ? "off_plan" : null,
    // Aucune bande de sécurité n'est calculée sur un tap de bouton: on passe le
    // côté SÛR plutôt que d'omettre le paramètre (un paramètre de garde
    // optionnel est une garde désarmée — ici il est requis, donc explicite).
    safetyBand: "none",
    restrictionFlag: RESTRICTION_FLAG_HAS_NO_PRODUCER,
    hasMedia: false,
    futureIntent: false,
    committedEventCount: args.offPlanEventId ? 1 : 0,
    asksMadeToday: asks.count,
    alreadyInvitedEver: ever.ever,
    flowAlreadyOpen: false,
    budget: PHOTO_INVITATION_DAILY_CAP,
  });
  console.info(JSON.stringify({
    tag: "keel.accident.photo_invitation",
    user_id: args.userId,
    reason_code: gate.reason_code,
    asks_today: asks.count,
    asks_reason: asks.reason,
  }));
  if (!gate.invite || !gate.sentence) return null;

  const recorded = await recordDailyAsk(admin, {
    userId: args.userId,
    localDate: args.localDate,
    kind: "photo_invitation",
    source: "chat",
    axis: null,
    text: gate.sentence,
    protocolEventId: args.offPlanEventId,
    askedForMessageId: args.sourceMessageId,
  });
  if (!recorded.ok || recorded.alreadyRecorded) return null;
  return gate.sentence;
}

/**
 * La question de session, si et seulement si elle a lieu d'être.
 *
 * Quatre conditions, et toutes doivent tenir:
 *   1. le plat PUISE dans une préparation d'une session (le lien écrit, jamais
 *      la proximité des dates);
 *   2. la session est datée d'AUJOURD'HUI OU AVANT. Demander « la cuisson de
 *      jeudi a-t-elle eu lieu ? » un mardi serait une question sur le futur;
 *   3. on n'en sait RIEN — aucune ligne dans `cooking_session_states`. Une ligne
 *      existante, quelle que soit sa valeur, ferme la question POUR DE BON:
 *      c'est ce qui rend « une fois par session » vrai, sans compteur;
 *   4. pas de plancher de restriction (porté par `buildSessionQuestion`).
 */
async function sessionQuestionFor(
  admin: SupabaseClient,
  args: {
    userId: string;
    plan: AccidentPlan;
    dishIndex: number;
    localDate: string;
    language: AccidentLanguage;
  },
): Promise<{ body: string; buttons: { id: string; title: string }[] } | null> {
  const { plan } = args;
  const dish = plan.dishes.find((d) => d.dishIndex === args.dishIndex) ?? null;
  if (!dish || dish.preparationIds.length === 0) return null;

  const dates = planDates(plan);
  const candidates = plan.sessions
    .filter((s) =>
      s.preparationIds.some((id) => dish.preparationIds.includes(id))
    )
    .map((s) => dates[s.day])
    .filter((d): d is string => Boolean(d) && d <= args.localDate)
    // La plus RÉCENTE d'abord: c'est celle dont la personne se souvient.
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  if (candidates.length === 0) return null;

  const known = new Set(
    (await loadSessionStates(admin, {
      userId: args.userId,
      mealId: plan.mealId,
    })).map((s) => s.cookOn),
  );
  const cookOn = candidates.find((d) => !known.has(d));
  if (!cookOn) return null;

  return buildSessionQuestion({
    mealId: plan.mealId,
    cookOn,
    language: args.language,
    restrictionFlag: RESTRICTION_FLAG_HAS_NO_PRODUCER,
  });
}

// ---------------------------------------------------------------------------
// ② LA SESSION — le marqueur, puis la cascade
// ---------------------------------------------------------------------------

async function handleSessionAnswer(
  admin: SupabaseClient,
  args: {
    userId: string;
    plan: AccidentPlan;
    reply: Extract<AccidentReply, { kind: "session" }>;
    language: AccidentLanguage;
    localDate: string;
    now: Date;
  },
): Promise<AccidentTapResult> {
  const { plan, reply, language } = args;
  const wrote = await writeSessionState(admin, {
    userId: args.userId,
    mealId: plan.mealId,
    cookOn: reply.cookOn,
    happened: reply.happened,
    answeredLocalDate: args.localDate,
    now: args.now,
  });
  if (wrote.outcome !== "written") return STALE(language);

  // ── ELLE A EU LIEU ⇒ RIEN NE TOMBE ────────────────────────────────────
  if (reply.happened) {
    return {
      body: renderAccidentAck("noted", language),
      buttons: [],
      handledAs: "keel_accident_session_happened",
    };
  }

  // ── ELLE N'A PAS EU LIEU ⇒ LA CASCADE ─────────────────────────────────
  // ⚠️ RIEN N'EST ÉCRIT PAR LA CASCADE. Le fait stocké est le marqueur, un seul;
  // quels repas tombent se DÉRIVE à la lecture. Un second état à invalider est
  // un état dont l'écrivain finit par disparaître.
  const ticked = await loadLiveTickIndexes(admin, {
    userId: args.userId,
    mealId: plan.mealId,
  });
  const cascade = cascadeSkippedSession({
    plan,
    cookOn: reply.cookOn,
    tickedDishIndexes: ticked,
  });
  console.info(JSON.stringify({
    tag: "keel.accident.cascade",
    user_id: args.userId,
    meal_id: plan.mealId,
    cook_on: reply.cookOn,
    session_day: cascade.sessionDay,
    invalidated: cascade.invalidatedDishIndexes,
    // ⚠️ COMPTÉ À PART: un repas déjà coché SURVIT (§7). On croit le fait, pas
    // la déclaration de session, et le fondre dans « invalidé » rendrait la
    // règle invisible en incident.
    survived_ticked: cascade.survivingTickedIndexes,
    before_cook: cascade.beforeCookIndexes,
  }));

  // ── L'ACTION N°5: DÉCALER LA SESSION ET CE QUI EN DÉPEND ────────────────
  //
  // C'est ici que le glissement devient réellement atteignable, et c'est la
  // situation que la fiche décrit: la nourriture est peut-être achetée, la
  // cuisson n'a pas eu lieu, et la question est « qu'est-ce qu'on en fait ».
  //
  // ⚠️ C'EST AUSSI LE SEUL CHEMIN OÙ `perishables_at_risk` PEUT MORDRE EN VRAI.
  // Par la porte des courses, la vague qui nourrit la session est PAR
  // CONSTRUCTION celle qu'on vient de déclarer non faite — donc rien n'est au
  // frigo. Ici, au contraire, les courses PEUVENT avoir été faites: c'est
  // exactement le « frigo plein » du §9, celui où rien n'échoue et où l'on
  // trouve du poulet gâté trois jours plus tard.
  const shift = await computeSessionShift(admin, {
    userId: args.userId,
    plan,
    cookOn: reply.cookOn,
  });
  const space = buildRealignmentSpace({
    plan,
    today: args.localDate,
    dishIndex: null,
    skippedSessionOn: reply.cookOn,
    shift,
    maxFridgeDays: MAX_FRIDGE_DAYS,
  });
  const head = renderCascadeOutcome({ cascade, language, space });

  if (shift.ok) {
    const proposal = buildShiftProposal({
      plan,
      shift,
      language,
      restrictionFlag: RESTRICTION_FLAG_HAS_NO_PRODUCER,
    });
    if (proposal) {
      return {
        body: `${head}\n${proposal.body}`,
        buttons: proposal.buttons.map((b) => ({
          payload: b.id,
          label: b.title,
        })),
        handledAs: "keel_accident_session_skipped_shift_proposed",
      };
    }
  } else if (shift.reason !== "no_session") {
    // R15 — le motif est DIT, jamais un silence. Et AUCUN bouton: il n'y a rien
    // à accepter, et une reproposition serait de l'insistance.
    return {
      body: `${head}\n${
        renderShiftRefusal({
          reason: shift.reason,
          language,
          offerNoCook: false,
        })
      }`,
      buttons: [],
      handledAs: `keel_accident_session_skipped_${shift.reason}`,
    };
  }

  return {
    body: head,
    buttons: [],
    handledAs: "keel_accident_session_skipped",
  };
}

// ---------------------------------------------------------------------------
// ③ LE GLISSEMENT ACCEPTÉ
// ---------------------------------------------------------------------------

async function handleShiftAccept(
  admin: SupabaseClient,
  args: {
    userId: string;
    plan: AccidentPlan;
    reply: Extract<AccidentReply, { kind: "shift_accept" }>;
    language: AccidentLanguage;
    localDate: string;
  },
): Promise<AccidentTapResult> {
  const { reply, language } = args;
  const applied = await applyPlanShift(admin, {
    userId: args.userId,
    mealId: reply.mealId,
    cookOn: reply.cookOn,
    delta: reply.delta,
    fingerprint: reply.fingerprint,
  });
  console.info(JSON.stringify({
    tag: "keel.accident.shift",
    user_id: args.userId,
    meal_id: reply.mealId,
    cook_on: reply.cookOn,
    delta: reply.delta,
    outcome: applied.outcome,
  }));

  if (applied.outcome === "applied") {
    return {
      body: renderShiftApplied(applied.newCookOn, language),
      buttons: [],
      handledAs: "keel_accident_shift_applied",
    };
  }
  if (applied.outcome === "refused") {
    // R15 — un refus n'est jamais un silence: on dit le motif et on propose ce
    // qui reste. AUCUNE reproposition: rien ne reste ouvert derrière.
    return {
      body: renderShiftRefusal({
        reason: applied.reason,
        language,
        offerNoCook: true,
      }),
      buttons: [],
      handledAs: `keel_accident_shift_refused_${applied.reason}`,
    };
  }
  // `stale` et `unverified` disent tous deux « rien n'a bougé ». On ne les
  // distingue pas dans la phrase: un accusé qui le ferait serait un oracle sur
  // l'état interne, et la personne n'a rien à en faire.
  return STALE(language);
}

// ---------------------------------------------------------------------------
// LES DEUX OUVERTURES DEPUIS LA BANDE DU SOIR (FF-058)
// ---------------------------------------------------------------------------

/**
 * UN `✗` OUVRE LE FORMULAIRE — c'est l'entrée n°1 de la fiche.
 *
 * La décoche est DÉJÀ écrite par `handleStripTap` quand on arrive ici: elle
 * PRÉCÈDE le formulaire (§7), et ignorer le formulaire reste donc entièrement
 * gratuit — rien n'est en attente, rien n'est marqué, et rien ne revient. C'est
 * la contre-mesure de §10 rendue structurelle: si signaler déclenchait une
 * procédure obligatoire, les gens cesseraient de signaler.
 */
export async function accidentFormAfterUntick(
  admin: SupabaseClient,
  args: {
    userId: string;
    mealId: string;
    dishIndex: number;
    language: AccidentLanguage;
  },
): Promise<{ body: string; buttons: { payload: string; label: string }[] } | null> {
  const loaded = await loadAccidentPlan(admin, {
    userId: args.userId,
    mealId: args.mealId,
  });
  if (!loaded) return null;
  const dish = loaded.plan.dishes.find((d) => d.dishIndex === args.dishIndex);
  if (!dish) return null;

  const form = buildAccidentForm({
    mealId: args.mealId,
    dishIndex: args.dishIndex,
    dishTitle: dish.title,
    language: args.language,
    restrictionFlag: RESTRICTION_FLAG_HAS_NO_PRODUCER,
    hasPlan: true,
  });
  if (!form) return null;
  return {
    body: form.body,
    buttons: form.buttons.map((b) => ({ payload: b.id, label: b.title })),
  };
}

/**
 * UN `Pas encore` DE COURSES OUVRE LA PROPOSITION DE DÉCALAGE — l'entrée n°4.
 *
 * ⚠️ C'EST UNE PROPOSITION, PAS UNE QUESTION (R11). La date de la nouvelle
 * cuisson est CALCULÉE par `planSessionShift`; on ne demande jamais « tu peux y
 * aller quand ? ». Et elle ne consomme PAS le budget T4 (R12): c'est la réponse
 * à un geste que la personne vient de faire.
 *
 * Rend `null` quand cette vague ne sert AUCUNE cuisson — une vague d'épicerie
 * seule ne menace rien, et « la cuisson est dans quatre jours » n'est pas un
 * danger (FF-058 R17).
 */
export async function shiftProposalAfterShoppingLater(
  admin: SupabaseClient,
  args: {
    userId: string;
    mealId: string;
    buyOn: string;
    language: AccidentLanguage;
  },
): Promise<{ body: string; buttons: { payload: string; label: string }[] } | null> {
  const loaded = await loadAccidentPlan(admin, {
    userId: args.userId,
    mealId: args.mealId,
  });
  if (!loaded) return null;
  const plan = loaded.plan;

  // QUELLE CUISSON CETTE VAGUE SERT — la question à laquelle `grocery_waves.ts`
  // répond déjà (`servesCookOn`). On ne la redevine pas.
  const wave = planGroceryWavesForPlan(plan).find((w) => w.buyOn === args.buyOn);
  const cookOn = wave?.servesCookOn ?? null;
  if (!cookOn) return null;
  if (!sessionOnDate(plan, cookOn)) return null;

  const shift = await computeSessionShift(admin, {
    userId: args.userId,
    plan,
    cookOn,
  });
  if (!shift.ok) {
    // R15 — le motif est DIT, et on propose ce qui reste. Aucun bouton: il n'y a
    // rien à accepter, et une reproposition serait de l'insistance.
    return {
      body: renderShiftRefusal({
        reason: shift.reason,
        language: args.language,
        offerNoCook: true,
      }),
      buttons: [],
    };
  }

  const proposal = buildShiftProposal({
    plan,
    shift,
    language: args.language,
    restrictionFlag: RESTRICTION_FLAG_HAS_NO_PRODUCER,
  });
  if (!proposal) return null;
  return {
    body: proposal.body,
    buttons: proposal.buttons.map((b) => ({ payload: b.id, label: b.title })),
  };
}
