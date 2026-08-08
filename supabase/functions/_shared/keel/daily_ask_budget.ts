// LE BUDGET DE DEMANDE — UN compteur pour toutes les surfaces.
//
// ── LA RÈGLE QU'IL PORTE (T4 du domaine conversation) ───────────────────────
// « Une seule demande par jour, toutes surfaces confondues. » Trois fiches
// veulent poser une demande à l'élève:
//
//   FF-017  la question d'approfondissement d'un repas déclaré
//   FF-025  l'invitation à envoyer une photo d'un repas hors plan
//   FF-028  la recommandation quotidienne
//
// Trois compteurs séparés donneraient trois demandes par jour — c'est-à-dire un
// interrogatoire, obtenu en respectant trois fois la règle. Ce module est donc
// le SEUL accès au compteur, et il est volontairement neutre: il ne connaît
// aucune des trois fiches, il ne connaît que des demandes.
//
// ── OÙ ÇA VIT ───────────────────────────────────────────────────────────────
// Table `meal_precision_questions`. Le nom est HISTORIQUE — elle est née pour
// la seule question de précision, elle porte maintenant les trois genres
// (`ask_kind`). Le renommer demande trois épreuves d'absence (code, `prosrc`,
// vues) et traverse l'export RGPD et six scripts de QA: c'est un chantier à
// part. Le commentaire de table est l'autorité sur son contenu réel.
//
// ── FAIL-CLOSED SUR LA LECTURE, et c'est la décision qui compte ─────────────
// Quand la lecture échoue, on rend le plafond ATTEINT. « Je ne peux pas
// vérifier » et « c'est bon » ne doivent pas produire le même comportement. Le
// pire cas d'un fail-closed est une demande qu'on ne fait pas — le fait est
// enregistré quand même, et l'élève n'est pas dérangé. Le pire cas de l'inverse
// est un élève qui reçoit huit demandes parce que Postgres bégayait.
//
// ── L'ORDRE EST LE CONTRAT: la place est prise AVANT que la demande ne parte ─
// `recordDailyAsk` échoue ⇒ la demande ne part pas. Une demande hors compteur
// rend le plafond décoratif, et c'est exactement l'élève à huit demandes par
// jour qu'on cherche à éviter.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

/**
 * La table. Nom physique historique — voir l'en-tête.
 *
 * Exportée pour que les tests et les scripts de QA aient UNE constante à citer
 * plutôt qu'une chaîne recopiée à sept endroits.
 */
export const DAILY_ASK_LEDGER_TABLE = "meal_precision_questions";

/**
 * Les genres de demande. LISTE FERMÉE, alignée sur le CHECK
 * `meal_precision_questions_ask_kind_check`. Un genre ajouté ici sans l'être en
 * base est refusé à l'écriture, et le test de contrat le dit avant le runtime.
 */
export const DAILY_ASK_KINDS = [
  /** FF-017 §3 — « et tu as mangé quoi avec ? ». Porte un axe. */
  "meal_precision_question",
  /** FF-025 — « si tu as une photo… ». Ne porte AUCUN axe. */
  "photo_invitation",
  /** FF-028 — la recommandation du jour. Ne porte AUCUN axe. */
  "daily_recommendation",
  /**
   * FF-029 — la question de pratique du soir. Ne porte AUCUN axe.
   *
   * ⚠️ SEULE LA QUESTION EST ICI. Le RAPPEL de pratique n'entre pas dans ce
   * compteur et n'a pas à le lire: il énonce et n'attend rien. Le budget compte
   * des DEMANDES; y soumettre un rappel ferait taire la voix du coach les jours
   * où une question de précision est partie à midi, ce qui est l'inverse exact
   * de ce que T4 protège.
   */
  "practice_question",
] as const;
export type DailyAskKind = (typeof DAILY_ASK_KINDS)[number];

/** Le canal par lequel la demande est partie. */
export type DailyAskSource = "text" | "photo" | "chat";

/**
 * UNE demande par jour et par élève, TOUS GENRES CONFONDUS.
 *
 * ── POURQUOI 1 ET PAS 2 (FF-012 R2) ────────────────────────────────────────
 * « Deux, c'était déjà une relance ; une, c'est un approfondissement. » Une
 * demande adossée à un fait DÉJÀ DONNÉ creuse ce que l'élève vient d'offrir. La
 * deuxième ne creuse plus rien: elle réclame.
 */
export const DAILY_ASK_BUDGET = 1;

export interface DailyAskCountResult {
  /** Le nombre de demandes déjà parties ce jour local, tous genres confondus. */
  count: number;
  /** Toujours nommé. `read_failed` dit que le compte est un fail-closed. */
  reason: "counted" | "read_failed" | "missing_local_date";
}

/**
 * Combien de demandes cet élève a-t-il déjà reçues aujourd'hui ?
 *
 * `localDate` est la journée LOCALE de l'élève, résolue par l'appelant. Ce
 * module n'a pas d'horloge: un plafond calculé sur la date du serveur s'ouvre
 * au mauvais moment pour tout le monde sauf UTC, ce qui est exactement la
 * famille de bugs nocturnes déjà payée par ce dépôt.
 */
export async function countDailyAsks(
  db: SupabaseClient,
  args: { userId: string; localDate: string | null | undefined },
): Promise<DailyAskCountResult> {
  const localDate = String(args.localDate ?? "").trim();
  if (!localDate) {
    // Sans journée locale, il n'existe aucun plafond calculable. On ferme.
    return { count: DAILY_ASK_BUDGET, reason: "missing_local_date" };
  }
  try {
    const result = await db
      .from(DAILY_ASK_LEDGER_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("user_id", args.userId)
      .eq("local_date", localDate);
    if (result.error) {
      console.warn(JSON.stringify({
        tag: "daily_ask_budget_read_failed",
        user_id: args.userId,
        error: result.error.message,
      }));
      return { count: DAILY_ASK_BUDGET, reason: "read_failed" };
    }
    return { count: result.count ?? 0, reason: "counted" };
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "daily_ask_budget_read_failed",
      user_id: args.userId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return { count: DAILY_ASK_BUDGET, reason: "read_failed" };
  }
}

export interface DailyAskEverResult {
  /** true quand une demande de ce genre est déjà partie, un jour, quel qu'il soit. */
  ever: boolean;
  /** `read_failed` = fail-closed: on répond « déjà dit », donc on se tait. */
  reason: "counted" | "read_failed";
}

/**
 * Cette personne a-t-elle DÉJÀ reçu une demande de ce genre — un jour, quel
 * qu'il soit ?
 *
 * C'est la lecture du « une fois par personne, pas une fois par repas » (FF-025
 * §7). Elle ne vit PAS dans `user_chat_states.temp_memory` comme le proposait
 * §11, et pour deux raisons dont la première suffit: `temp_memory` a deux
 * écrivains concurrents en lecture-modification-écriture complète, le dernier
 * gagne, et un « déjà dit » qu'on peut perdre est un « déjà dit » qui sera
 * redit. La seconde: le souvenir doit survivre un mois.
 *
 * FAIL-CLOSED DANS LE SENS DU SILENCE: une lecture qui échoue rend `true`. Le
 * pire cas est une ligne pédagogique jamais dite; l'inverse est le sermon.
 */
export async function hasEverAsked(
  db: SupabaseClient,
  args: { userId: string; kind: DailyAskKind },
): Promise<DailyAskEverResult> {
  try {
    const result = await db
      .from(DAILY_ASK_LEDGER_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("user_id", args.userId)
      .eq("ask_kind", args.kind);
    if (result.error) {
      console.warn(JSON.stringify({
        tag: "daily_ask_budget_ever_read_failed",
        user_id: args.userId,
        kind: args.kind,
        error: result.error.message,
      }));
      return { ever: true, reason: "read_failed" };
    }
    return { ever: (result.count ?? 0) > 0, reason: "counted" };
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "daily_ask_budget_ever_read_failed",
      user_id: args.userId,
      kind: args.kind,
      error: error instanceof Error ? error.message : String(error),
    }));
    return { ever: true, reason: "read_failed" };
  }
}

export interface DailyAskRecordResult {
  ok: boolean;
  /** true quand la ligne existait déjà (rejeu du même message). */
  alreadyRecorded: boolean;
  reason?: string;
}

/**
 * Inscrit la demande partie. Idempotent PAR LE SCHÉMA.
 *
 * L'unicité `(user_id, asked_for_message_id)` est ce qui rend un rejeu
 * inoffensif: un tour rejoué (Kong rend des 502 sans corps sur les tours longs,
 * et le client retente) ne consomme pas deux places du budget pour une demande
 * partie une fois. La violation d'unicité n'est donc PAS une erreur: c'est la
 * réponse « déjà comptée », et l'appelant continue.
 *
 * ⚠️ ELLE EST AUSSI L'ARBITRE DU TOUR. Deux surfaces qui voudraient parler dans
 * le MÊME tour lisent toutes les deux un compteur à 0 avant qu'aucune n'écrive.
 * La seconde à inscrire reçoit `alreadyRecorded: true` sur la même clé de
 * message et doit donc se taire — l'arbitrage entre surfaces n'a pas besoin
 * d'un verrou applicatif, il est dans l'index unique.
 */
export async function recordDailyAsk(
  db: SupabaseClient,
  args: {
    userId: string;
    localDate: string;
    kind: DailyAskKind;
    source: DailyAskSource;
    /**
     * L'axe, pour une question de précision UNIQUEMENT. `null` pour les autres
     * genres — le CHECK conditionnel en base refuse l'inverse dans les deux
     * sens, et c'est voulu: une question de précision sans axe est un bug, un
     * axe sur une invitation est une valeur inventée.
     */
    axis: string | null;
    /** Le texte EXACT parti. C'est ce qui rend l'audit possible. */
    text: string;
    protocolEventId: string | null;
    askedForMessageId: string;
  },
): Promise<DailyAskRecordResult> {
  try {
    const inserted = await db
      .from(DAILY_ASK_LEDGER_TABLE)
      .insert({
        user_id: args.userId,
        local_date: args.localDate,
        source: args.source,
        ask_kind: args.kind,
        axis: args.axis,
        question: args.text,
        protocol_event_id: args.protocolEventId,
        asked_for_message_id: args.askedForMessageId,
      } as never)
      .select("id")
      .single();
    if (!inserted.error) return { ok: true, alreadyRecorded: false };
    // 23505 = unique_violation. La demande de ce message est déjà comptée.
    if (inserted.error.code === "23505") {
      return { ok: true, alreadyRecorded: true };
    }
    console.warn(JSON.stringify({
      tag: "daily_ask_budget_write_failed",
      user_id: args.userId,
      kind: args.kind,
      error: inserted.error.message,
    }));
    return { ok: false, alreadyRecorded: false, reason: inserted.error.message };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(JSON.stringify({
      tag: "daily_ask_budget_write_failed",
      user_id: args.userId,
      kind: args.kind,
      error: message,
    }));
    return { ok: false, alreadyRecorded: false, reason: message };
  }
}
