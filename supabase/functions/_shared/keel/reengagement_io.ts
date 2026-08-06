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
 *
 * ── UN ÉPISODE QUI S'OUVRE DOIT POUVOIR SE REFERMER ───────────────────────
 * L'invariant ci-dessus a un revers, et il a mordu: tant qu'aucun chemin ne
 * refermait l'épisode KEEL, `nudgedThisEpisode` restait vrai. L'élève relancé
 * une fois — même s'il répondait le jour même — n'était plus relançable jusqu'au
 * cap de 30 jours du sweep, qui le classait alors `no_reply` alors qu'il avait
 * répondu. Un verrou anti-spam sans condition de désarmement est un verrou tout
 * court (doctrine P9: toute ceinture porte sa condition de désarmement).
 *
 * D'où `closeKeelReengagementEpisodeOnInbound`, appelée par le webhook au
 * PREMIER message entrant. Elle ne referme QUE les épisodes `source =
 * 'keel_reengage'`: le winback legacy escalade sur trois touches et referme les
 * siens en lisant le contenu de la réponse, le couper au premier inbound
 * casserait ce flow-là.
 */

import {
  assertNoGuiltTripping,
  decideReengagement,
  type JobReachableTone,
  type ReengageDecision,
  REENGAGE_AFTER_HOURS,
  renderReengageNudge,
} from "./reengagement.ts";
import {
  acceptComposedNudge,
  buildReengageSystemPrompt,
  buildReengageUserPrompt,
} from "./reengage_composer.ts";
import { doctrineBlockFor, loadPublishedDoctrine } from "./doctrine_loader.ts";
import { appendResponseLanguageBlock } from "./locale.ts";
import { generateWithGemini } from "../gemini.ts";
import { deliverChatMessage, probeChatDelivery } from "../chat/delivery.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export interface ReengageCandidate {
  userId: string;
  /**
   * REQUIS pour envoyer. Il manquait, et son absence n'était pas visible: le
   * job « armait » un élève sans jamais avoir de quoi le joindre, ce qui se
   * lisait comme un succès dans le compte-rendu.
   */
  phoneNumber: string | null;
  /** `{{1}}` du template. Vide => « there », jamais « Hi , ». */
  firstName: string;
  /**
   * R2/R3 — `profiles.locale` de l'élève, tel que lu. La relance est un
   * ARTEFACT (aucun fil à ancrer): sa langue se résout par
   * `resolveArtifactLocale`, pas par `resolveResponseLocale`.
   */
  profileLocale: string | null;
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
      "id, phone_number, full_name, timezone, locale, proactive_muted_at, keel_role",
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
      phoneNumber: String(row.phone_number ?? "").trim() || null,
      // Le PRÉNOM, pas le nom complet: `{{1}}` du template ouvre la phrase
      // (« Hi Julie - … »). Le dépôt porte deux incidents de `{{1}}` mal câblé
      // (`sophia_checkin_v2` qui disait « Hello Thomas » à tout le monde, un
      // bilan hebdo rempli avec le mauvais champ) — d'où la découpe explicite.
      firstName: String(row.full_name ?? "").trim().split(/\s+/)[0] ?? "",
      profileLocale: String(row.locale ?? "").trim() || null,
      lastInboundAt,
      localHour: localHourFor(args.now, String(row.timezone ?? "")) ?? Number.NaN,
      timezone: String(row.timezone ?? "") || null,
      hasActivePlan: ((planRes.data ?? []) as unknown[]).length > 0,
      // DE-WHATSAPP: le mute produit, pas l'opt-in Meta. `whatsapp_opted_in`
      // vaut `false` par défaut et aucun élève KEEL n'a de parcours d'opt-in
      // Meta: lire cette colonne écartait la totalité de la base en
      // `opted_out`. Voir le commentaire long dans `keel-daily-pulse-v1`.
      optedOut: Boolean(row.proactive_muted_at),
      nudgedThisEpisode: episodeUnavailable || Boolean(openEpisode),
      lastNudgeAt: openEpisode ? String(openEpisode.opened_at ?? "") || null : null,
      restrictionFlag: await isRestrictionFlagged(db, userId),
      declaredHardWeek: await hasDeclaredHardWeek(db, {
        userId,
        now: args.now,
        timezone: String(row.timezone ?? "") || null,
      }),
    });
  }
  return candidates;
}

/**
 * Le plancher TCA (§3.4): la dernière `weekly_reviews.risk_band` de l'élève.
 *
 * ICI et nulle part ailleurs. Cette lecture existait dans `keel-weekly-flow-v1`
 * et NULLE PART dans la relance, qui posait `restrictionFlag: false` en dur
 * pendant qu'un commentaire affirmait le contraire. Résultat mesurable: sur le
 * même élève et la même ligne, le point hebdo écartait et la relance armait.
 * Un seul lecteur, importé par les deux, et la divergence n'a plus où naître.
 *
 * Une lecture qui échoue REMONTE. C'est l'asymétrie inverse de celle de
 * l'épisode: rater une relance coûte une relance, rater le plancher TCA envoie
 * de la pression d'adhérence à quelqu'un qu'il faut laisser tranquille.
 */
export async function isRestrictionFlagged(
  db: Db,
  userId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("weekly_reviews")
    .select("risk_band")
    .eq("user_id", userId)
    .order("week_start_date", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = ((data ?? [])[0] ?? null) as { risk_band?: string } | null;
  return row?.risk_band === "restriction_flag";
}

/**
 * Fenêtre de lecture d'une « semaine difficile », en jours locaux.
 */
export const HARD_WEEK_LOOKBACK_DAYS = 7;

/**
 * Combien de « hard » il faut pour que ce soit une SEMAINE difficile.
 *
 * Deux, pas un. Le raisonnement est celui du seuil de 72h quelques lignes plus
 * haut: un seul mauvais jour est dans la variance d'un rythme normal, et
 * adoucir le ton pour un mardi raté vide `lighter` de son sens le jour où
 * l'élève en a vraiment besoin.
 */
export const HARD_WEEK_MIN_DECLARATIONS = 2;

/**
 * L'élève a-t-il DÉCLARÉ une semaine difficile ?
 *
 * `student_daily_checkins.overall = 'hard'` est une réponse de l'élève à « How
 * was today? » — c'est lui qui le dit, en tapant un bouton. C'est bien une
 * DÉCLARATION, la seule persistée dans ce dépôt, et c'est exactement ce que
 * `toneInstruction('lighter')` suppose: « The student has told you they are
 * having a hard time ».
 *
 * Ce qu'on ne fait PAS: déduire l'humeur d'un `biofeedback.mood` bas ou d'une
 * adhérence en baisse. Une inférence n'est pas une déclaration, et `lighter`
 * adoucit le ton sur la foi de ce que l'élève a dit, pas de ce qu'on croit lire
 * en lui.
 *
 * Best-effort: sur erreur de lecture on rend `false`. Se tromper ici ne coûte
 * qu'un ton un peu moins doux — jamais un envoi de trop, jamais un envoi
 * manqué. C'est le seul champ du candidat où l'échec est neutre.
 */
export async function hasDeclaredHardWeek(
  db: Db,
  args: { userId: string; now: Date; timezone: string | null },
): Promise<boolean> {
  const since = new Date(
    args.now.getTime() - HARD_WEEK_LOOKBACK_DAYS * 24 * 3600_000,
  );
  try {
    const { data, error } = await db
      .from("student_daily_checkins")
      .select("local_date")
      .eq("user_id", args.userId)
      .eq("overall", "hard")
      // La table est clé sur le jour LOCAL de l'élève; on compare donc à une
      // date locale, pas à un instant UTC.
      .gte("local_date", localDateFor(since, args.timezone))
      .lte("local_date", localDateFor(args.now, args.timezone))
      .limit(HARD_WEEK_MIN_DECLARATIONS);
    if (error) throw error;
    return ((data ?? []) as unknown[]).length >= HARD_WEEK_MIN_DECLARATIONS;
  } catch (error) {
    console.warn("[keel/reengagement] hard-week read failed", error);
    return false;
  }
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
      // l'omission ne puisse plus passer inaperçue.
      //
      // `restrictionFlag` et `declaredHardWeek` ci-dessus, eux, sont désormais
      // LUS EN BASE (`weekly_reviews.risk_band`, `student_daily_checkins`). Ils
      // étaient figés à `false` sous ce même commentaire, qui affirmait déjà
      // qu'ils mordaient — d'où la règle qu'on s'applique maintenant: un
      // commentaire ne certifie pas un câblage, un test le fait.
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
        // `touch1_sent_at` n'est PAS posé ici. Il l'était, et il mentait: la
        // ligne affirmait qu'une touche était partie à l'instant où l'épisode
        // s'ouvrait, donc avant tout envoi — y compris quand l'envoi échouait
        // ensuite. Le ledger ne date la touche qu'une fois `whatsapp-send`
        // revenu OK (`markReengagementTouchSent`).
        source: KEEL_EPISODE_SOURCE,
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

/**
 * Le marqueur de producteur. Voir la migration
 * `20260804110500_reengagement_episodes_source.sql`: le winback legacy escalade
 * sur trois touches et referme ses épisodes en lisant le CONTENU de la réponse;
 * la relance KEEL fait une touche et se referme au premier inbound. Chacun ne
 * ferme que les siens, sinon l'un coupe l'autre en plein milieu.
 */
export const KEEL_EPISODE_SOURCE = "keel_reengage";

/**
 * Date la touche APRÈS que l'envoi soit revenu OK.
 *
 * L'ordre ouvrir → envoyer → dater est la seule séquence où le ledger ne peut
 * pas mentir dans le sens dangereux. Ouvrir d'abord borne le spam (un crash
 * après l'ouverture coûte une relance, pas deux); dater après l'envoi garantit
 * que `touch1_sent_at` non nul veut dire « c'est parti ».
 */
export async function markReengagementTouchSent(
  db: Db,
  args: { episodeId: string; at: string },
): Promise<void> {
  const { error } = await db
    .from("reengagement_episodes")
    .update({ touch1_sent_at: args.at, updated_at: args.at })
    .eq("id", args.episodeId);
  if (error) {
    // L'envoi a eu lieu: on ne le défait pas. Mais la trace doit être bruyante,
    // parce qu'un épisode sans `touch1_sent_at` sera balayé plus tard comme
    // s'il n'avait jamais été touché.
    console.error("[keel/reengagement] touch stamp failed", error);
  }
}

/**
 * Une composition qui pend ne doit pas manger le budget du job.
 *
 * `keel-reengage-v1` balaie sous budget (45 s par défaut) et reprend au tick
 * suivant ce qu'il n'a pas fini — l'épisode ouvert garantit qu'un élève déjà
 * touché ne l'est pas deux fois. Le seul cas qu'il ne rattrape pas tout seul
 * est un appel qui ne rend JAMAIS la main: il consommerait le budget entier
 * pour un seul élève, et les autres attendraient l'heure suivante sans qu'on
 * sache pourquoi.
 */
const COMPOSE_TIMEOUT_MS = 12_000;

export type ReengageBodySource = "composed" | "fallback";

export interface ComposedReengageBody {
  body: string;
  source: ReengageBodySource;
  /** Vide si composé. Sinon le motif exact du repli, pour le compte-rendu. */
  reason: string;
}

/**
 * LE CORPS DE LA RELANCE, DANS LA VOIX DU COACH — avec un repli qui part.
 *
 * ── POURQUOI C'ÉTAIT UN TEXTE FIGÉ, ET POURQUOI ÇA NE L'EST PLUS ────────────
 * Voir l'en-tête de `reengage_composer.ts`: la contrainte était Meta (hors
 * fenêtre 24 h ⇒ template approuvé ⇒ texte immuable), elle est partie avec lui,
 * et l'écart assumé « ce message n'est pas dans la voix du coach » n'avait plus
 * de cause. Il en avait juste l'habitude.
 *
 * ── LE REPLI N'EST PAS UNE PRÉCAUTION, C'EST LA RÈGLE ───────────────────────
 * Tout échec — pas de doctrine, modèle en panne, verdict de ceinture négatif —
 * rend le texte déterministe. Un message générique qui PART vaut mieux qu'un
 * message personnalisé qui ne part jamais: c'est l'arbitrage déjà écrit dans ce
 * module, et c'est encore plus vrai ici, parce que la population visée est
 * exactement celle qui décroche.
 *
 * Le motif du repli est RENDU, pas avalé. Sans lui, « le composeur ne sert
 * jamais » et « le composeur marche » produisent le même message et le même
 * compte-rendu — la panne silencieuse que ce dépôt a payée trop souvent.
 */
export async function composeReengageBody(
  db: Db,
  args: {
    userId: string;
    firstName: string;
    tone: JobReachableTone;
    /** R2/R3 — locale de l'ARTEFACT, résolue par l'appelant. Requis. */
    contentLocale: string;
    requestId?: string;
  },
): Promise<ComposedReengageBody> {
  const fallback = (reason: string): ComposedReengageBody => ({
    body: renderReengageNudge(args.firstName),
    source: "fallback",
    reason,
  });

  let doctrineBlock: string;
  try {
    const loaded = await loadPublishedDoctrine(db, args.userId);
    // PAS DE COMPOSITION SANS DOCTRINE, et ce n'est pas de la prudence: sans
    // méthode publiée il n'y a aucune voix à porter, donc la composition
    // paierait un appel de modèle pour réécrire un texte figé — moins bien, et
    // sans le déterminisme qui allait avec.
    if (loaded.reason !== "loaded") return fallback(`no_doctrine:${loaded.reason}`);
    doctrineBlock = doctrineBlockFor(loaded);
  } catch (error) {
    return fallback(
      `doctrine_load_failed:${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const system = appendResponseLanguageBlock(
    buildReengageSystemPrompt({ doctrineBlock, tone: args.tone }),
    // La doctrine porte `write in <language>`; le laisser gagner ici ferait
    // sortir la relance dans une langue que la conversation qu'elle relance
    // n'utilise pas. La langue vient donc de l'appelant, qui l'a résolue par
    // `resolveArtifactLocale` — une relance est un artefact, pas un tour de
    // conversation: il n'y a pas de fil sur lequel s'ancrer.
    args.contentLocale,
  );

  let raw: unknown;
  try {
    raw = await Promise.race([
      generateWithGemini(
        system,
        buildReengageUserPrompt(args.firstName),
        // Un peu de chaleur, pas de fantaisie: c'est un message court dont les
        // interdits sont durs, et une température haute produit surtout des
        // rejets de ceinture.
        0.6,
        false,
        [],
        "auto",
        // PAS de `as never` ici. Un cast sur un type étranger désarme le
        // typecheck exactement là où on en a besoin: ce dépôt a déjà vu un
        // champ inventé passer la compilation et rendre `null` en silence.
        // `source` existe, `purpose` n'existe pas — et c'est le compilateur qui
        // vient de le dire.
        { requestId: args.requestId, userId: args.userId, source: "keel_reengage" },
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("compose_timeout")), COMPOSE_TIMEOUT_MS)
      ),
    ]);
  } catch (error) {
    return fallback(
      `llm_failed:${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // `generateWithGemini` peut rendre un appel d'outil. On n'en demande aucun;
  // recevoir autre chose qu'une chaîne est donc une anomalie, pas un cas.
  if (typeof raw !== "string") return fallback("llm_returned_non_text");

  const verdict = acceptComposedNudge(raw);
  if (!verdict.ok) return fallback(`rejected:${verdict.reason}:${verdict.detail}`);
  return { body: verdict.text, source: "composed", reason: "" };
}

/**
 * Envoie la relance, composée dans la voix du coach quand il en a une.
 *
 * La ceinture anti-culpabilisation tourne ICI, sur le texte exact que l'élève
 * va lire — et elle compte désormais pour de bon. Elle était écrite, testée, et
 * appelée nulle part: le seul texte qui partait était figé et approuvé chez
 * Meta, donc aucun chemin de production ne lui donnait rien à mordre. Depuis
 * que le corps est COMPOSÉ, ce qu'elle inspecte est un texte que personne n'a
 * relu avant l'élève. C'est le renversement qui compte: la même ligne de code
 * est passée de symbolique à structurelle.
 */
export async function sendReengageNudge(
  db: Db,
  args: {
    userId: string;
    firstName: string;
    tone: JobReachableTone;
    /** R2/R3 — locale de l'ARTEFACT, résolue par l'appelant. Requis. */
    contentLocale: string;
    requestId?: string;
  },
): Promise<
  {
    ok: boolean;
    error: string;
    status: number;
    toneDelivered: boolean;
    /** D'où vient le texte parti. Compté par le job, jamais deviné. */
    bodySource: ReengageBodySource;
    /** Motif du repli, vide quand le corps est composé. */
    bodyReason: string;
  }
> {
  // QA PHASE C (2026-08-06) — LE PLAFOND SE VÉRIFIE AVANT DE COMPOSER.
  //
  // L'ordre inverse a été mesuré: 115 candidats, `sent: 0`, et 8 appels de
  // modèle (8 221 tokens) jetés en un seul tick parce que le plafond de
  // messages non sollicités du jour n'était consulté qu'à la livraison — après
  // l'ouverture de l'épisode ET après la composition. Le job tourne toutes les
  // heures, et le plafond est PARTAGÉ avec le pulse du soir et le point hebdo.
  //
  // `probeChatDelivery` appelle le même `decideChatDelivery` que la livraison:
  // une seule source de vérité, et la livraison réelle tranche toujours pour de
  // bon plus bas (le nom de sa fonction n'est pas cité ici: `reengagement_io_
  // test.ts` vérifie l'ORDRE par recherche textuelle, et une mention en
  // commentaire y ferait un faux positif).
  const probe = await probeChatDelivery(db as never, {
    userId: args.userId,
    purpose: "keel_reengage",
  });
  // Ne bloque QUE sur un refus de plafond: c'est le seul motif dont la
  // connaissance anticipée évite une composition. Tout autre refus est laissé
  // à la livraison réelle, qui écrit son ledger.
  if (!probe.deliver && probe.reason === "unsolicited_daily_cap") {
    // Même contrat de sortie qu'un refus de livraison (status 4xx): l'appelant
    // rend l'élève à la boucle au lieu de le verrouiller derrière un épisode.
    return {
      ok: false,
      status: 409,
      error: `delivery refused (pre-check): ${probe.reason}`,
      toneDelivered: true,
      bodySource: "fallback",
      bodyReason: `precheck:${probe.reason}`,
    };
  }

  const composed = await composeReengageBody(db, args);

  const body = composed.body;
  // Lève si le corps culpabilise. Volontairement NON rattrapé: le job compte
  // l'échec et n'envoie pas. Un message qui fait honte à quelqu'un qui décroche
  // produit exactement le silence que cette boucle existe pour éviter.
  //
  // Elle vaut maintenant pour un texte que PERSONNE n'a relu avant l'élève.
  assertNoGuiltTripping(body);

  // ── DE-WHATSAPP — LE TON EST MAINTENANT TOUJOURS DÉLIVRÉ ──────────────────
  // `toneDelivered` existait pour compter les relances dont le ton DÉCIDÉ
  // (`lighter`) n'était pas celui ENVOYÉ, parce qu'un seul template Meta était
  // approuvé et que tout tombait sur `gentle`. Un « ton adouci » n'existait
  // alors que dans nos journaux.
  //
  // Il n'y a plus de template. Le corps rendu EST le corps livré, donc le ton
  // décidé est le ton reçu — toujours. Le champ reste dans le contrat le temps
  // que les appelants et leurs tests s'alignent; il vaut désormais
  // invariablement `true`, et c'est une propriété, pas un hasard.
  const delivered = await deliverChatMessage(db as never, {
    userId: args.userId,
    content: body,
    purpose: "keel_reengage",
    requestId: args.requestId,
    // La provenance voyage AVEC le message. Une relance dont on ne peut plus
    // dire, trois semaines plus tard, si elle portait la voix du coach ou le
    // texte de secours est une relance qu'on ne peut pas juger.
    metadata: {
      body_source: composed.source,
      body_fallback_reason: composed.reason || null,
    },
  });
  if (!delivered.delivered) {
    // Un refus de livraison est classé comme une erreur PRÉ-LIVRAISON (status
    // 4xx) : rien n'est parti, donc l'appelant doit rendre l'élève à la boucle
    // au lieu de le verrouiller derrière un épisode ouvert. C'est l'asymétrie
    // décrite dans `rollbackReengagementEpisode`, préservée telle quelle.
    return {
      ok: false,
      status: 409,
      error: `delivery refused: ${delivered.reason}`,
      toneDelivered: true,
      bodySource: composed.source,
      bodyReason: composed.reason,
    };
  }
  return {
    ok: true,
    status: 200,
    error: "",
    toneDelivered: true,
    bodySource: composed.source,
    bodyReason: composed.reason,
  };
}

/**
 * L'élève a écrit: son épisode KEEL est terminé.
 *
 * Appelée par le webhook à CHAQUE inbound, avant tout routage. C'est la
 * condition de désarmement du verrou « une seule relance par épisode »: sans
 * elle, `nudgedThisEpisode` restait vrai jusqu'au cap de 30 jours du sweep, qui
 * classait ensuite l'épisode `no_reply` sur un élève qui avait répondu — un
 * ledger faux ET un élève injoignable pendant un mois.
 *
 * `source = 'keel_reengage'` est le filtre qui compte: les épisodes du winback
 * legacy appartiennent à ses propres closers, qui lisent le contenu de la
 * réponse pour distinguer `reengaged` d'une pause consentie. Les fermer ici au
 * premier inbound couperait cette escalade en plein milieu.
 *
 * Best-effort: un échec ne fait jamais échouer la réception d'un message.
 */
export async function closeKeelReengagementEpisodeOnInbound(
  db: Db,
  args: { userId: string; atIso: string; stopped?: boolean },
): Promise<
  { closed: boolean; episodeId: string | null; daysInactiveAtOpen: number | null }
> {
  try {
    const { data, error } = await db
      .from("reengagement_episodes")
      .update({
        closed_at: args.atIso,
        first_reply_at: args.atIso,
        replied_at_step: 1,
        // Un STOP est une réponse, et c'est une sortie: la nommer `stopped`
        // évite de compter un opt-out comme un réengagement réussi dans la
        // synthèse du coach.
        exit_status: args.stopped ? "stopped" : "reengaged",
        entry_kind: "replied_to_template",
        updated_at: args.atIso,
      })
      .eq("user_id", args.userId)
      .eq("source", KEEL_EPISODE_SOURCE)
      .is("closed_at", null)
      .select("id, days_inactive_at_open");
    if (error) throw error;
    const rows = (data ?? []) as Array<
      { id?: unknown; days_inactive_at_open?: unknown }
    >;
    const row = rows[0];
    return {
      closed: rows.length > 0,
      // PHASE B — la ligne voyage avec le verdict, et c'est deliberé: c'est
      // l'unique instant où le runtime sait « cette réponse rompt un silence ».
      // La relire plus tard est impossible (l'épisode est clos), et la relire
      // AVANT coûterait une requête pour un fait qu'on tient déjà.
      episodeId: typeof row?.id === "string" ? row.id : null,
      daysInactiveAtOpen: Number.isFinite(Number(row?.days_inactive_at_open))
        ? Number(row?.days_inactive_at_open)
        : null,
    };
  } catch (error) {
    console.warn("[keel/reengagement] episode close on inbound failed", error);
    return { closed: false, episodeId: null, daysInactiveAtOpen: null };
  }
}

/**
 * Annule un épisode ouvert dont l'envoi n'est JAMAIS parti.
 *
 * ── LE DÉFAUT QUE CETTE FONCTION FERME ───────────────────────────────────
 * L'ordre « ouvrir puis envoyer » (voir juste au-dessus) accepte sciemment le
 * pire cas « une relance en moins ». Ce raisonnement tenait tant qu'un envoi
 * SUIVAIT. Tant qu'il n'y en avait aucun, il produisait autre chose :
 * `nudgedThisEpisode` vaut `Boolean(openEpisode)`, un épisode ne se ferme que
 * quand l'élève répond — or il ne peut pas répondre à un message qu'il n'a
 * jamais reçu. L'épisode restait donc ouvert pour toujours et l'élève sortait
 * définitivement de la boucle, en silence. « Une relance en moins » était en
 * réalité « plus jamais aucune relance ».
 *
 * ── POURQUOI SUPPRIMER ET PAS FERMER ─────────────────────────────────────
 * La ligne porte `touch1_sent_at`. Un épisode fermé garderait cette date,
 * c'est-à-dire l'affirmation qu'un message est parti à cet instant — un
 * fantôme dans le ledger, exactement ce que la doctrine « execution truth »
 * interdit. Rien n'étant parti, la trace juste est l'absence de trace.
 *
 * ── L'ASYMÉTRIE, QUI EST LE CŒUR ─────────────────────────────────────────
 * On n'annule QUE sur un échec sans ambiguïté d'avant-livraison (configuration
 * manquante, refus de notre propre passerelle). Sur un doute — timeout, 5xx,
 * réseau — le message a PEUT-ÊTRE atteint Meta, donc l'épisode reste ouvert.
 * Entre « une relance en moins » et « deux d'affilée », le produit choisit
 * toujours la première (§1.3 : la honte précède le silence).
 */
export async function rollbackReengagementEpisode(
  db: Db,
  episodeId: string,
): Promise<boolean> {
  const id = String(episodeId ?? "").trim();
  if (!id) return false;
  try {
    const { error } = await db
      .from("reengagement_episodes")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return true;
  } catch (error) {
    // Un rollback raté laisse l'élève verrouillé: c'est exactement le bug
    // qu'on vient de corriger, donc il se crie au lieu de se taire.
    console.error("[keel/reengagement] episode rollback FAILED — student stays locked", {
      episode_id: id,
      error,
    });
    return false;
  }
}
