/**
 * ⚠️ ══ CE MODULE A CHANGÉ DE PROPRIÉTAIRE LE 2026-09-01 ══════════════════════
 *
 * FF-028 (la recommandation quotidienne) est **abandonnée** — décision produit :
 * *« il n'y a pas de recommandation en plein milieu de plan »*. Son moteur
 * (`daily_recommendation_engine.ts`), son edge function et son cron sont
 * supprimés. Le plan suivant se corrige par le
 * [retour de fin de plan](../../../docs/fonctionnalites/composition-des-repas/FF-054-le-retour-de-fin-de-plan.md).
 *
 * **CE FICHIER SURVIT, ET CE N'EST PAS UN OUBLI.** Il porte le CANAL DE
 * PROPOSITION DURABLE — l'espace d'action, l'empreinte de plan, les libellés,
 * les identifiants de bouton `KEEL_RECO_*` — et ce canal a un utilisateur
 * vivant : **FF-056, la divergence de poids constatée**
 * (`weight_divergence_tap.ts :: openDurableProposal`). C'est même la seule
 * SORTIE DURABLE de FF-057, la procédure accident.
 *
 * Supprimer ce fichier « parce que FF-028 est morte » casserait la branche
 * terminale de FF-056 **en silence** : les épisodes resteraient `in_flow`
 * jusqu'à expiration à J+2, et l'état `acted` deviendrait inatteignable sans
 * qu'aucune erreur ne se lève. `handleRecommendationTap`
 * (`deterministic_buttons.ts`) en est le seul écrivain.
 *
 * Le nom du fichier et le préfixe `KEEL_RECO_` restent ceux de FF-028 : les
 * renommer demanderait trois épreuves d'absence (code, `prosrc`, vues) et
 * casserait les payloads des boutons déjà en vol. Ce pavé est l'autorité sur
 * ce que ce module EST aujourd'hui.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * FF-028 — LES LECTURES ET LES ÉCRITURES DE LA RECOMMANDATION.
 *
 * La décision vit dans `daily_recommendation.ts` (module pur). Ici il n'y a que
 * de la plomberie, et trois idées à tenir:
 *
 *   ── 1. ON RAMÈNE DES LIGNES, PAS DES CONCLUSIONS ──────────────────────────
 *   Le cooldown et la série de refus se DÉRIVENT des lignes d'état, à chaque
 *   lecture. Aucune colonne ne porte de compteur — même posture que le décompte
 *   de faim de FF-027, et pour la même raison: un compteur stocké diverge de sa
 *   fenêtre au premier jour qui sort, et « cette personne refuse tout » serait
 *   faux le mois suivant.
 *
 *   ── 2. LA VÉRITÉ D'EXÉCUTION: ÉCRIRE, RELIRE, PUIS SEULEMENT ACCUSER ──────
 *   `applyRecommendation` n'accuse rien. Elle écrit, RELIT le rythme depuis la
 *   base, et rend ce qu'elle a relu. C'est l'appelant qui choisit sa phrase à
 *   partir d'un fait, jamais à partir d'un espoir. Un « c'est fait » sans ligne
 *   relue est l'accusé fantôme — le défaut le plus cher de ce dépôt, et
 *   l'angle adversarial que la fiche nomme en propre (§R7).
 *
 *   ── 3. L'ARBITRAGE DU DOUBLE TAP EST DANS LA BASE, PAS DANS UN VERROU ─────
 *   La transition `proposed → accepted` est un UPDATE CONDITIONNEL qui rend sa
 *   ligne. Deux taps simultanés lisent tous les deux `proposed` avant qu'aucun
 *   n'écrive; c'est le `where state = 'proposed'` qui tranche, et le second
 *   reçoit zéro ligne. Même mécanique que `recordDailyAsk` et que le plafond
 *   quotidien, dont la version « select puis insert » a été mesurée à 6/6 au
 *   lieu de 2.
 */

import {
  type EatingOccasionSlot,
  parseEatingRhythm,
} from "./meal_generation.ts";
import {
  effectiveRhythm,
  planFingerprint,
  RECOMMENDATION_COOLDOWN_DAYS,
  RECOMMENDATION_DECLINE_STREAK_MUTE,
  RECOMMENDATION_OPEN_FOR_DAYS,
  type RecommendationActionId,
} from "./daily_recommendation.ts";

/** Le minimum de client Supabase dont ce module a besoin. */
// deno-lint-ignore no-explicit-any
type Db = any;

export const RECOMMENDATION_TABLE = "student_daily_recommendations";

/** L'état d'une proposition. Aligné sur le CHECK en base. */
export const RECOMMENDATION_STATES = [
  "proposed",
  "accepted",
  "declined",
  "expired",
] as const;
export type RecommendationState = (typeof RECOMMENDATION_STATES)[number];

export interface RecommendationRow {
  id: string;
  userId: string;
  localDate: string;
  actionId: RecommendationActionId;
  state: RecommendationState;
  planFingerprint: string;
  appliedAt: string | null;
  expiryReason: string | null;
}

function toRow(raw: Record<string, unknown>): RecommendationRow {
  return {
    id: String(raw.id ?? ""),
    userId: String(raw.user_id ?? ""),
    localDate: String(raw.local_date ?? ""),
    actionId: String(raw.action_id ?? "") as RecommendationActionId,
    state: String(raw.state ?? "") as RecommendationState,
    planFingerprint: String(raw.plan_fingerprint ?? ""),
    appliedAt: raw.applied_at ? String(raw.applied_at) : null,
    expiryReason: raw.expiry_reason ? String(raw.expiry_reason) : null,
  };
}

/** `YYYY-MM-DD` + n jours, sans dépendre d'un fuseau. */
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// LE RYTHME — la matière de l'espace d'action ET la cible de la directive
// ---------------------------------------------------------------------------

export interface RhythmRead {
  /** Ce que la colonne porte, tel que le parseur du dépôt le lit. */
  declared: EatingOccasionSlot[];
  /** Ce que le générateur appliquera VRAIMENT (défaut compris). */
  effective: readonly EatingOccasionSlot[];
  /** `false` quand l'élève n'a aucune ligne `student_goals`. */
  hasGoals: boolean;
}

/**
 * LE RYTHME DE CET ÉLÈVE, LU COMME LE GÉNÉRATEUR LE LIT.
 *
 * ⚠️ ELLE JETTE plutôt que de rendre un rythme vide sur une panne de lecture.
 * « Cet élève n'a pas déclaré de rythme » et « je n'ai pas pu lire » ne sont pas
 * la même chose: le premier signifie « il reçoit le défaut, donc il a un
 * petit-déjeuner », le second ne signifie rien. Les confondre ferait proposer un
 * petit-déjeuner à quelqu'un qui en a un — sur une panne de Postgres.
 */
export async function loadRhythm(
  db: Db,
  userId: string,
): Promise<RhythmRead> {
  const { data, error } = await db
    .from("student_goals")
    .select("practical_constraints")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`[keel/daily_recommendation_io] rhythm: ${error.message}`);
  }
  const pc = (data?.practical_constraints ?? null) as
    | Record<string, unknown>
    | null;
  const declared = parseEatingRhythm(pc?.eating_rhythm);
  return {
    declared,
    effective: effectiveRhythm(declared),
    hasGoals: Boolean(data),
  };
}

// ---------------------------------------------------------------------------
// L'HISTORIQUE DES PROPOSITIONS — cooldown et série de refus, DÉRIVÉS
// ---------------------------------------------------------------------------

export interface RecommendationHistory {
  /** Une proposition est déjà partie ce jour local. */
  alreadyProposedToday: boolean;
  /** Une proposition est ouverte, boutons vivants, sans réponse. */
  hasOpenProposal: boolean;
  /** Les actions sous cooldown (refus, acceptation, OU silence récent). */
  cooldownBlocked: RecommendationActionId[];
  /** Refus consécutifs depuis la dernière acceptation. */
  declineStreak: number;
}

/**
 * LES PROPOSITIONS QUE PERSONNE N'A OUVERTES FINISSENT PAR MOURIR.
 *
 * ── 🔴 POURQUOI CETTE ÉCRITURE EXISTE ──────────────────────────────────────
 * Sans elle, une proposition restait `proposed` pour toujours: le taux
 * d'acceptation (§10, LA mesure) se calculait sur un dénominateur qui ne se
 * fermait jamais, et surtout le moteur n'avait aucune façon de distinguer « la
 * question est encore vivante » de « elle est morte de vieillesse ».
 *
 * Elle est appelée par le PAS DU MOTEUR, pas par le chargeur d'historique: une
 * fonction qui s'appelle `load…` et qui écrit est une fonction dont personne
 * n'anticipe l'effet.
 *
 * BEST-EFFORT ET TRACÉE: un échec ne doit pas coûter sa soirée à l'élève. Le
 * pire cas est une proposition qui reste ouverte un jour de plus, donc un
 * silence de plus — le côté sûr.
 */
export async function expireLapsedProposals(
  db: Db,
  args: { userId: string; todayLocalDate: string; openForDays: number },
): Promise<number> {
  const cutoff = shiftDate(args.todayLocalDate, -(args.openForDays - 1));
  try {
    const { data, error } = await db
      .from(RECOMMENDATION_TABLE)
      .update({ state: "expired", expiry_reason: "unanswered" })
      .eq("user_id", args.userId)
      .eq("state", "proposed")
      .lt("local_date", cutoff)
      .select("id");
    if (error) throw error;
    return Array.isArray(data) ? data.length : 0;
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.daily_recommendation.expire_lapsed_failed",
      user_id: args.userId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return 0;
  }
}

/**
 * TOUT CE QUE L'HISTORIQUE DIT, en UNE lecture.
 *
 * ── POURQUOI LA FENÊTRE DE LECTURE N'EST PAS CELLE DU COOLDOWN ─────────────
 * On lit large (le cooldown, plus une marge) parce que DEUX choses se dérivent
 * de ces lignes et qu'elles n'ont pas la même portée: le cooldown regarde une
 * fenêtre, la série de refus regarde tout l'historique depuis la dernière
 * acceptation. Une seule requête, deux dérivations — deux requêtes auraient
 * fini par lire deux historiques différents.
 *
 * ⚠️ LA SÉRIE DE REFUS N'A PAS DE FENÊTRE, ET C'EST LA CONTRE-MESURE. §10
 * demande qu'un moteur refusé trois fois se taise « durablement ». Une fenêtre
 * la rouvrirait toute seule au bout d'un mois, ce qui est exactement ce que la
 * contre-mesure interdit. On lit donc `RECOMMENDATION_DECLINE_STREAK_MUTE`
 * lignes de plus que le cooldown — assez pour reconnaître la série, quelle que
 * soit son ancienneté.
 */
export async function loadRecommendationHistory(
  db: Db,
  args: { userId: string; todayLocalDate: string },
): Promise<RecommendationHistory> {
  const { data, error } = await db
    .from(RECOMMENDATION_TABLE)
    .select("id, user_id, local_date, action_id, state, plan_fingerprint, applied_at, expiry_reason")
    .eq("user_id", args.userId)
    .order("local_date", { ascending: false })
    .order("created_at", { ascending: false })
    // Assez pour couvrir la fenêtre de cooldown des deux actions ET la série
    // de refus. Borné pour qu'un élève de trois ans ne rapatrie pas son
    // historique entier chaque soir.
    .limit(50);
  if (error) {
    throw new Error(`[keel/daily_recommendation_io] history: ${error.message}`);
  }
  const rows = ((data ?? []) as Array<Record<string, unknown>>).map(toRow);

  const cooldownFrom = shiftDate(
    args.todayLocalDate,
    -(RECOMMENDATION_COOLDOWN_DAYS - 1),
  );
  const openFrom = shiftDate(
    args.todayLocalDate,
    -(RECOMMENDATION_OPEN_FOR_DAYS - 1),
  );
  const blocked = new Set<RecommendationActionId>();
  let alreadyProposedToday = false;
  let hasOpenProposal = false;
  let declineStreak = 0;
  let streakClosed = false;

  for (const row of rows) {
    if (row.localDate === args.todayLocalDate) alreadyProposedToday = true;
    if (row.state === "proposed" && row.localDate >= openFrom) {
      hasOpenProposal = true;
    }

    // ── CE QUI BLOQUE UNE ACTION, ET POURQUOI LE SILENCE EN FAIT PARTIE ────
    //   `declined`  — R8, le non est respecté;
    //   `accepted`  — re-proposer ce que quelqu'un vient de défaire à la main
    //                 sur `/app/plan` est pire que de l'avoir proposé;
    //   `expired/unanswered` — 🔴 AJOUTÉ APRÈS MESURE. Une proposition ignorée
    //                 rouvrait la porte dès le lendemain, et la même question
    //                 repartait trois soirs de suite. « Le silence n'est pas
    //                 une demande de rappel. »
    //
    // Ce qui NE bloque PAS: `expired/undelivered` (personne n'a rien vu, il n'y
    // a pas eu de question) et `expired/plan_changed` (l'état a bougé, donc une
    // ré-évaluation est honnête — et l'espace d'action l'aura souvent exclue
    // tout seul).
    const answered = row.state === "declined" || row.state === "accepted";
    const ignored = row.state === "expired" && row.expiryReason === "unanswered";
    if ((answered || ignored) && row.localDate >= cooldownFrom) {
      blocked.add(row.actionId);
    }

    // La série se lit de la plus récente vers la plus ancienne et s'arrête au
    // premier fait qui n'est pas un refus DIT. `proposed`/`expired` ne
    // l'interrompent pas — un silence n'est ni un refus ni une acceptation, et
    // le compter comme rupture rendrait la contre-mesure inatteignable.
    if (!streakClosed) {
      if (row.state === "declined") declineStreak += 1;
      else if (row.state === "accepted") streakClosed = true;
    }
  }

  return {
    alreadyProposedToday,
    hasOpenProposal,
    cooldownBlocked: [...blocked],
    declineStreak: Math.min(declineStreak, RECOMMENDATION_DECLINE_STREAK_MUTE),
  };
}

// ---------------------------------------------------------------------------
// LA PROPOSITION
// ---------------------------------------------------------------------------

export type InsertProposalResult =
  | { outcome: "inserted"; row: RecommendationRow }
  /** Une autre instance du job a déjà proposé ce jour local. */
  | { outcome: "already_today" };

/**
 * INSCRIRE LA PROPOSITION AVANT DE LA DIRE.
 *
 * L'ordre est le contrat, et c'est celui du budget de demande: la ligne existe
 * avant que le message ne parte, parce que c'est la ligne qui porte
 * l'identifiant que les boutons transportent. Une proposition livrée sans ligne
 * serait une proposition dont le « Oui » ne désigne rien.
 *
 * L'unicité `(user_id, local_date)` est l'ARBITRE, pas une discipline: deux
 * ticks du cron dans la même heure locale lisent tous les deux « rien
 * aujourd'hui » avant qu'aucun n'écrive. La violation d'unicité n'est donc pas
 * une erreur, c'est la réponse « quelqu'un d'autre a déjà proposé ».
 */
export async function insertProposal(
  db: Db,
  args: {
    userId: string;
    localDate: string;
    actionId: RecommendationActionId;
    planFingerprint: string;
    proposedText: string;
  },
): Promise<InsertProposalResult> {
  const { data, error } = await db
    .from(RECOMMENDATION_TABLE)
    .insert({
      user_id: args.userId,
      local_date: args.localDate,
      action_id: args.actionId,
      state: "proposed",
      plan_fingerprint: args.planFingerprint,
      proposed_text: args.proposedText,
    })
    .select("id, user_id, local_date, action_id, state, plan_fingerprint, applied_at, expiry_reason")
    .single();
  if (error) {
    if (String((error as { code?: string }).code ?? "") === "23505") {
      return { outcome: "already_today" };
    }
    throw new Error(`[keel/daily_recommendation_io] insert: ${error.message}`);
  }
  return { outcome: "inserted", row: toRow(data as Record<string, unknown>) };
}

/** La bulle qui porte les boutons, une fois qu'elle a un identifiant. */
export async function attachProposalMessage(
  db: Db,
  args: { id: string; chatMessageId: string | null },
): Promise<void> {
  if (!args.chatMessageId) return;
  const { error } = await db
    .from(RECOMMENDATION_TABLE)
    .update({ chat_message_id: args.chatMessageId })
    .eq("id", args.id);
  if (error) {
    // Non bloquant: la proposition existe, ses boutons portent son identifiant,
    // et le lien vers la bulle n'est que de l'audit. Tracé, jamais avalé.
    console.warn(JSON.stringify({
      tag: "keel.daily_recommendation.attach_failed",
      id: args.id,
      error: error.message,
    }));
  }
}

/**
 * LA PROPOSITION MEURT SANS ÊTRE DITE — livraison refusée (mute, plafond,
 * compte en suppression).
 *
 * Elle est marquée `expired`, jamais laissée `proposed`: une proposition ouverte
 * que personne n'a vue bloquerait la journée suivante (`already_proposed_today`
 * ne regarde que la date, mais l'unicité, elle, tient) et surtout mentirait au
 * compte-rendu — « une proposition est partie » alors que rien n'est sorti.
 */
export async function expireProposal(
  db: Db,
  args: { id: string; reason: "undelivered" | "plan_changed" },
): Promise<void> {
  const { error } = await db
    .from(RECOMMENDATION_TABLE)
    // `responded_at` reste NULL: personne n'a répondu. Le remplir ferait
    // compter une proposition jamais lue comme une proposition arbitrée, et
    // c'est le taux d'acceptation (§10, LA mesure) qui deviendrait faux.
    .update({ state: "expired", expiry_reason: args.reason })
    .eq("id", args.id);
  if (error) {
    console.warn(JSON.stringify({
      tag: "keel.daily_recommendation.expire_failed",
      id: args.id,
      error: error.message,
    }));
  }
}

// ---------------------------------------------------------------------------
// LE TAP
// ---------------------------------------------------------------------------

export type ClaimOutcome =
  /** La transition a eu lieu: cette instance-là est LA seule à appliquer. */
  | { outcome: "claimed"; row: RecommendationRow }
  /** La ligne n'existe pas, ou n'est pas à cet élève. */
  | { outcome: "unknown" }
  /** Le plan a changé depuis la proposition (§7). */
  | { outcome: "stale"; row: RecommendationRow }
  /** Déjà répondu — double tap, ou tap sur une vieille bulle. */
  | { outcome: "already"; row: RecommendationRow };

/**
 * RÉCLAMER LA PROPOSITION — la transition atomique qui rend le double tap sûr.
 *
 * ── L'ORDRE DES VÉRIFICATIONS, ET POURQUOI L'EMPREINTE EST DANS LE `WHERE` ──
 * L'empreinte n'est pas comparée en TypeScript puis écrite: elle est une
 * CONDITION de l'UPDATE. Comparer puis écrire laisserait une fenêtre entre les
 * deux — et cette fenêtre est précisément celle où l'élève enregistre son
 * rythme sur `/app/plan` depuis l'autre onglet.
 *
 * ── `userId` EST DANS LE `WHERE`, ET CE N'EST PAS DÉCORATIF ─────────────────
 * Le payload du bouton désigne une ligne; c'est le JWT qui désigne l'élève. La
 * RLS ne protège rien ici — ce chemin tourne en service_role, où `auth.uid()`
 * vaut NULL. `.eq("user_id", …)` est donc la SEULE chose qui empêche un payload
 * bricolé d'accepter la proposition de quelqu'un d'autre. C'est la cicatrice
 * `rls-is-not-a-substitute-for-eq-user-id`, écrite dans le fichier qui aurait
 * pu la répéter.
 */
export async function claimResponse(
  db: Db,
  args: {
    id: string;
    userId: string;
    kind: "accept" | "decline";
    /** L'empreinte ACTUELLE, recalculée à l'instant du tap. */
    currentFingerprint: string;
  },
): Promise<ClaimOutcome> {
  const nextState: RecommendationState = args.kind === "accept"
    ? "accepted"
    : "declined";

  const { data, error } = await db
    .from(RECOMMENDATION_TABLE)
    .update({ state: nextState, responded_at: new Date().toISOString() })
    .eq("id", args.id)
    .eq("user_id", args.userId)
    .eq("state", "proposed")
    .eq("plan_fingerprint", args.currentFingerprint)
    .select("id, user_id, local_date, action_id, state, plan_fingerprint, applied_at, expiry_reason");
  if (error) {
    throw new Error(`[keel/daily_recommendation_io] claim: ${error.message}`);
  }
  const claimed = (data ?? []) as Array<Record<string, unknown>>;
  if (claimed.length === 1) {
    return { outcome: "claimed", row: toRow(claimed[0]) };
  }

  // Zéro ligne: on RELIT pour savoir POURQUOI, au lieu de deviner. Trois
  // raisons possibles, trois phrases différentes à l'élève, et les confondre
  // ferait dire « ta proposition a expiré » à quelqu'un qui a simplement tapé
  // deux fois.
  const { data: existing, error: readErr } = await db
    .from(RECOMMENDATION_TABLE)
    .select("id, user_id, local_date, action_id, state, plan_fingerprint, applied_at, expiry_reason")
    .eq("id", args.id)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (readErr) {
    throw new Error(
      `[keel/daily_recommendation_io] claim reread: ${readErr.message}`,
    );
  }
  if (!existing) return { outcome: "unknown" };
  const row = toRow(existing as Record<string, unknown>);
  if (row.state !== "proposed") return { outcome: "already", row };
  return { outcome: "stale", row };
}

/** Le retour arrière quand l'écriture n'a pas pu être relue. */
export async function releaseClaim(
  db: Db,
  args: { id: string; userId: string },
): Promise<void> {
  const { error } = await db
    .from(RECOMMENDATION_TABLE)
    .update({ state: "proposed", responded_at: null })
    .eq("id", args.id)
    .eq("user_id", args.userId)
    .eq("state", "accepted")
    .is("applied_at", null);
  if (error) {
    console.warn(JSON.stringify({
      tag: "keel.daily_recommendation.release_failed",
      id: args.id,
      error: error.message,
    }));
  }
}

export type ApplyOutcome =
  /** La ligne existe et A ÉTÉ RELUE. C'est le seul cas qui autorise un accusé. */
  | { outcome: "applied"; rhythm: EatingOccasionSlot[] }
  /** L'écriture n'a rien changé, ou la relecture ne la retrouve pas. */
  | { outcome: "unverified"; detail: string };

/**
 * APPLIQUER LA DIRECTIVE — ÉCRIRE, PUIS RELIRE. Dans cet ordre, et sans accusé.
 *
 * ── L'ÉCRITURE EST ATOMIQUE, EN SQL ────────────────────────────────────────
 * `keel_add_eating_rhythm_slot` fusionne la seule clé concernée sous verrou de
 * ligne. Un read-modify-write côté edge aurait fait gagner le dernier écrivain
 * de `practical_constraints` — et l'autre écrivain, c'est la carte de
 * `/app/plan`, sur laquelle l'élève vient peut-être de régler son temps de
 * cuisine.
 *
 * ── LA RELECTURE EST UNE VRAIE RELECTURE ───────────────────────────────────
 * On ne se contente PAS de ce que la fonction SQL a rendu. On relit
 * `student_goals` par une seconde requête, on reparse avec le parseur du
 * produit (`parseEatingRhythm`), et on vérifie que le moment y est. C'est la
 * seule preuve qui vaille: la valeur rendue par une écriture est ce que
 * l'écriture CROIT avoir fait.
 */
export async function applyRecommendation(
  db: Db,
  args: { userId: string; slot: string },
): Promise<ApplyOutcome> {
  const { error } = await db.rpc("keel_add_eating_rhythm_slot", {
    p_user_id: args.userId,
    p_slot: args.slot,
  });
  if (error) {
    return { outcome: "unverified", detail: `rpc: ${error.message}` };
  }

  // LA RELECTURE. Séparée, et par le chemin de lecture normal.
  let read: RhythmRead;
  try {
    read = await loadRhythm(db, args.userId);
  } catch (e) {
    return {
      outcome: "unverified",
      detail: `reread: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const present = read.declared.some((r) => r.slot === args.slot);
  if (!present) {
    return {
      outcome: "unverified",
      detail: `slot ${args.slot} absent after write (declared=${
        read.declared.map((r) => r.slot).join(",") || "none"
      })`,
    };
  }
  return { outcome: "applied", rhythm: read.declared };
}

/** Le fait relu est inscrit sur la ligne — et seulement alors. */
export async function markApplied(
  db: Db,
  args: { id: string; userId: string },
): Promise<void> {
  const { error } = await db
    .from(RECOMMENDATION_TABLE)
    .update({ applied_at: new Date().toISOString() })
    .eq("id", args.id)
    .eq("user_id", args.userId);
  if (error) {
    console.warn(JSON.stringify({
      tag: "keel.daily_recommendation.mark_applied_failed",
      id: args.id,
      error: error.message,
    }));
  }
}

/**
 * L'EMPREINTE ACTUELLE DE CET ÉLÈVE — celle que le tap doit retrouver.
 *
 * Elle est recalculée à l'instant du tap, à partir des mêmes deux lectures que
 * le soir: le rythme effectif et la version de doctrine. Deux façons de
 * calculer la même empreinte finiraient par diverger, et la divergence ferait
 * expirer des propositions parfaitement valides.
 */
export async function currentFingerprint(
  db: Db,
  args: { userId: string; doctrineVersion: number | null },
): Promise<{ fingerprint: string; rhythm: RhythmRead }> {
  const rhythm = await loadRhythm(db, args.userId);
  return {
    fingerprint: planFingerprint({
      rhythm: rhythm.effective,
      doctrineVersion: args.doctrineVersion,
    }),
    rhythm,
  };
}

/**
 * UNE RECOMMANDATION EST-ELLE DÉJÀ PARTIE CE JOUR LOCAL ?
 *
 * Lue par le JOB DU SOIR pour tenir « un seul message par soir » (fiche §11):
 * le tap du soir se retire quand la recommandation a parlé. Fail-**closed**
 * vers le silence du pouls — une lecture ratée fait sauter un tap, jamais
 * apparaître un second message.
 */
export async function wasRecommendationSentToday(
  db: Db,
  args: { userId: string; localDate: string },
): Promise<boolean> {
  try {
    const { count, error } = await db
      .from(RECOMMENDATION_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("user_id", args.userId)
      .eq("local_date", args.localDate)
      .neq("state", "expired");
    if (error) throw error;
    return (count ?? 0) > 0;
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.daily_recommendation.sent_today_unreadable",
      user_id: args.userId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return true;
  }
}
