/**
 * PIVOT NUTRITION §1.3 — la coquille d'I/O de la boucle REMARQUER.
 *
 * `reengagement.ts` DÉCIDE (pur, testé). Ce module SÉLECTIONNE les candidats et
 * ARME l'envoi.
 *
 * ── LE PIÈGE QU'ON N'AURA PAS ─────────────────────────────────────────────
 * La requête de sélection et le décideur doivent s'accorder sur le seuil. Une
 * requête qui précoupe à 48h alors que le décideur exige 72h fait tourner le
 * job sur des candidats qu'il refusera tous — coût de balayage, zéro envoi, et
 * personne ne le voit. L'inverse est pire: une requête à 96h ne présenterait
 * jamais les élèves de 72h au décideur, qui n'aurait donc jamais l'occasion de
 * dire oui.
 *
 * D'où: la requête importe `REENGAGE_AFTER_HOURS` du décideur. Il n'y a pas
 * deux nombres.
 *
 * ── UN ÉPISODE, PAS UN COMPTEUR ───────────────────────────────────────────
 * « UNE seule relance par épisode de silence » (§7.4 J4-J5) est un invariant
 * d'ÉTAT, pas de fréquence. `reengagement_episodes` existe déjà et porte
 * exactement cette notion. On la lit pour savoir si l'épisode courant a déjà
 * été touché, plutôt que de compter des messages sortants — deux relances
 * envoyées à 3 semaines d'écart dans le MÊME silence restent deux relances de
 * trop.
 */

import {
  decideReengagement,
  type ReengageDecision,
  REENGAGE_AFTER_HOURS,
} from "./reengagement.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export interface ReengageCandidate {
  userId: string;
  lastInboundAt: string | null;
  localHour: number;
  timezone: string | null;
  hasActivePlan: boolean;
  optedOut: boolean;
  nudgedThisEpisode: boolean;
  lastNudgeAt: string | null;
  restrictionFlag: boolean;
  declaredHardWeek: boolean;
}

/**
 * L'heure locale d'un élève, depuis sa timezone IANA.
 *
 * `Intl` plutôt qu'un décalage stocké: les décalages changent deux fois par an,
 * et un job proactif qui se trompe d'une heure en octobre écrit à 22h à
 * quelqu'un qui dort. Timezone illisible => on rend `null`, et l'appelant
 * traite l'heure inconnue comme une heure calme (jamais de spam sur une donnée
 * manquante).
 */
export function localHourFor(now: Date, timezone: string | null): number | null {
  const tz = String(timezone ?? "").trim();
  if (!tz) return null;
  try {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
    }).format(now);
    const n = Number(hour);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * La date locale d'un élève (YYYY-MM-DD), depuis sa timezone IANA.
 *
 * ICI et nulle part ailleurs. Cette fonction existait en TROIS copies —
 * `keel-daily-pulse-v1`, `keel-weekly-flow-v1`, et `keelLocalDateForUser` dans
 * le webhook — et elles ont divergé de la pire façon possible: le job passait
 * bien la timezone, le webhook recevait un profil où la colonne n'était même
 * pas sélectionnée. Les deux calculaient donc une `local_date` différente pour
 * le même élève, et la clé `(user_id, local_date)` ne se rejoignait jamais.
 *
 * Timezone vide ou illisible => date UTC. C'est un repli assumé, pas un
 * silence: sans fuseau il n'existe aucune autre référence, et le jour UTC est
 * au moins stable et le même partout dans le code.
 */
export function localDateFor(now: Date, timezone: string | null): string {
  const tz = String(timezone ?? "").trim();
  if (!tz) return now.toISOString().slice(0, 10);
  try {
    // en-CA rend directement YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Les élèves KEEL dont le dernier message entrant est plus vieux que le seuil.
 *
 * Le seuil vient du décideur (voir l'en-tête). La requête est volontairement
 * LARGE — elle ne présélectionne ni sur la safety ni sur le plancher TCA ni sur
 * l'opt-out: ces gates appartiennent au décideur, et les dupliquer en SQL
 * créerait une seconde implémentation de l'ordre des gardes, qui divergerait.
 */
export async function loadReengageCandidates(
  db: Db,
  args: { now: Date; limit?: number; afterUserId?: string },
): Promise<ReengageCandidate[]> {
  const cutoff = new Date(
    args.now.getTime() - REENGAGE_AFTER_HOURS * 3600_000,
  ).toISOString();

  let query = db
    .from("profiles")
    .select(
      "id, timezone, whatsapp_opted_in, whatsapp_opted_out_at, keel_role",
    )
    .eq("keel_role", "student")
    .order("id", { ascending: true })
    .limit(args.limit ?? 200);
  if (args.afterUserId) query = query.gt("id", args.afterUserId);

  const { data, error } = await query;
  if (error) throw error;

  const candidates: ReengageCandidate[] = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const userId = String(row.id ?? "").trim();
    if (!userId) continue;

    const msgRes = await db
      .from("chat_messages")
      .select("created_at")
      .eq("user_id", userId)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(1);
    if (msgRes.error) throw msgRes.error;
    const lastInboundAt =
      String(((msgRes.data ?? [])[0] ?? {}).created_at ?? "") || null;

    // Le filtre de seuil est appliqué ICI plutôt qu'en SQL parce que le
    // "dernier entrant" demande déjà une lecture par élève. Un élève qui a
    // parlé récemment est écarté avant tout autre travail.
    if (lastInboundAt && lastInboundAt > cutoff) continue;

    const planRes = await db
      .from("plan_versions")
      .select("id")
      .eq("student_id", userId)
      .eq("status", "published")
      .limit(1);
    if (planRes.error) throw planRes.error;

    // Colonnes vérifiées en base avant écriture: la table porte `opened_at` /
    // `closed_at` / `last_touch_step`, PAS `resolved_at` ni `trigger_reason`.
    // Un épisode OUVERT est un épisode sans `closed_at`.
    const epRes = await db
      .from("reengagement_episodes")
      .select("id, opened_at, closed_at, last_touch_step")
      .eq("user_id", userId)
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1);
    // Une table absente ou une lecture ratée ne doit pas faire taire la boucle
    // entière; mais elle ne doit pas non plus autoriser une deuxième relance.
    // En cas de doute on considère l'épisode DÉJÀ touché (fail-closed sur le
    // spam), ce qui est l'asymétrie correcte ici.
    const episodeUnavailable = Boolean(epRes.error);
    const openEpisode = ((epRes.data ?? [])[0] ?? null) as
      | Record<string, unknown>
      | null;

    candidates.push({
      userId,
      lastInboundAt,
      localHour: localHourFor(args.now, String(row.timezone ?? "")) ?? Number.NaN,
      timezone: String(row.timezone ?? "") || null,
      hasActivePlan: ((planRes.data ?? []) as unknown[]).length > 0,
      optedOut: Boolean(row.whatsapp_opted_out_at) || row.whatsapp_opted_in === false,
      nudgedThisEpisode: episodeUnavailable || Boolean(openEpisode),
      lastNudgeAt: openEpisode ? String(openEpisode.opened_at ?? "") || null : null,
      restrictionFlag: false,
      declaredHardWeek: false,
    });
  }
  return candidates;
}

export interface ReengageOutcome {
  userId: string;
  decision: ReengageDecision;
}

/** Décide pour chaque candidat. Aucune écriture: la décision reste pure. */
export function decideForCandidates(
  candidates: readonly ReengageCandidate[],
  now: Date,
): ReengageOutcome[] {
  return candidates.map((c) => ({
    userId: c.userId,
    decision: decideReengagement({
      lastInboundAt: c.lastInboundAt,
      lastNudgeAt: c.lastNudgeAt,
      nudgedThisEpisode: c.nudgedThisEpisode,
      localHour: c.localHour,
      restrictionFlag: c.restrictionFlag,
      declaredHardWeek: c.declaredHardWeek,
      hasActivePlan: c.hasActivePlan,
      optedOut: c.optedOut,
      // ⚠️ DÉCLARATION, PAS OUBLI — la garde crise reste inactive ici.
      // Même situation que `keel-daily-pulse-v1`: aucun état de crise n'est
      // persisté ni interrogeable dans ce dépôt. Le champ est requis pour que
      // l'omission ne puisse plus passer inaperçue. `restrictionFlag`
      // ci-dessus, lui, EST câblé et mord réellement.
      safetyBand: null,
      now,
    }),
  }));
}

/**
 * Ouvre l'épisode AVANT l'envoi, et c'est l'ordre qui compte.
 *
 * Si l'envoi échoue après l'ouverture, on a un épisode ouvert sans message: le
 * pire cas est une relance en moins. Dans l'ordre inverse (envoyer puis
 * marquer), un crash entre les deux produit un message envoyé et un épisode
 * non marqué — donc une SECONDE relance au tick suivant, sur quelqu'un qui
 * vient déjà d'en recevoir une. Entre « une de moins » et « deux d'affilée »,
 * le produit choisit la première sans hésiter (§1.3: la honte précède le
 * silence).
 */
export async function openReengagementEpisode(
  db: Db,
  args: { userId: string; at: string; daysInactive: number },
): Promise<{ opened: boolean; id: string | null }> {
  try {
    const { data, error } = await db
      .from("reengagement_episodes")
      .insert({
        user_id: args.userId,
        opened_at: args.at,
        days_inactive_at_open: Math.max(0, Math.floor(args.daysInactive)),
        // `last_touch_step` défaut 1 et CHECK 1..3: la relance de ce module
        // EST la touche 1. On ne pousse jamais au-delà — « une seule par
        // épisode » est l'invariant, pas une séquence de trois.
        last_touch_step: 1,
        touch1_sent_at: args.at,
      })
      .select("id")
      .single();
    if (error) throw error;
    const id = String((data as Record<string, unknown> | null)?.id ?? "").trim();
    return { opened: Boolean(id), id: id || null };
  } catch (error) {
    console.error("[keel/reengagement] episode open failed", error);
    return { opened: false, id: null };
  }
}
