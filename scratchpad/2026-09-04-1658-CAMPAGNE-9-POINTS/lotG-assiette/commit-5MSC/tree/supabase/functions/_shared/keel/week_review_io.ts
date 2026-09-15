/**
 * LA COQUILLE D'I/O DU BILAN HEBDOMADAIRE — lire la semaine, la geler, la dire.
 *
 * `week_review.ts` DÉCIDE et JUGE (pur, testé). Ce module LIT, ÉCRIT et APPELLE
 * le modèle. Même frontière que partout dans `_shared/keel/`.
 *
 * ── L'ORDRE DES TROIS TEMPS, ET POURQUOI IL EST DANS CET ORDRE ─────────────
 *   1. DIMANCHE, AVANT L'ENVOI (`keel-weekly-flow-v1`) — `computeAndStoreWeekReview`
 *      calcule la lecture de la semaine et la GÈLE dans `weekly_reviews.week_facts`.
 *      C'est la condition « en amont du point » : la question posée dans le
 *      bilan est choisie par ce calcul-là, pas par un autre.
 *   2. QUAND LE FORMULAIRE REVIENT (`_shared/chat/deterministic_buttons.ts`) —
 *      `composeWeekReviewBody` RELIT le gel, y ajoute le biofeedback qui vient
 *      d'arriver, et compose le bilan. Rien n'est recalculé: entre l'envoi et
 *      la réponse il peut s'être écoulé une nuit, et un élève qui logue son
 *      petit-déjeuner du lundi ne doit pas voir le chiffre bouger sous la
 *      question qu'on vient de lui poser.
 *   3. TOUTE LA SEMAINE SUIVANTE (`sophia-brain/router/run.ts`) —
 *      `loadLatestWeekReview` sert le même gel au contexte de tour. La
 *      conversation cite donc exactement les nombres du bilan.
 *
 * ── UNE LECTURE EN PANNE REND `null`, JAMAIS UNE ERREUR ───────────────────
 * Le pire cas d'une panne est un dimanche sans bilan — l'élève reçoit l'accusé
 * plat d'avant. Le pire cas de l'alternative est un CHIFFRE FAUX dans la bulle,
 * indiscernable d'un vrai pour l'élève comme pour le coach, et sur lequel il
 * fondera peut-être un changement d'alimentation. L'asymétrie penche du même
 * côté que `doctrine_loader`, `planned_dish_io` et `daily_recap_io`.
 */

import {
  acceptComposedWeekReview,
  buildWeekReviewSystemPrompt,
  buildWeekReviewUserPrompt,
  computeWeekReview,
  parseWeekReview,
  renderDeterministicWeekReview,
  type WeekFactInput,
  type WeekReviewReading,
} from "./week_review.ts";
import {
  type ActivitySessionInput,
  parseActivityIntensity,
  parseActivitySessionKind,
} from "./activity_session.ts";
import { insertBodyMeasures } from "./body_measure_io.ts";
import { doctrineBlockFor, loadPublishedDoctrine } from "./doctrine_loader.ts";
import { loadPublishedProtocol } from "./protocol_loader.ts";
import { appendResponseLanguageBlock } from "./locale.ts";
import { generateWithGemini } from "../gemini.ts";

/** Structural type: les tests injectent un faux, la prod un SupabaseClient. */
// deno-lint-ignore no-explicit-any
type Db = any;

/**
 * Le budget de composition. PLUS LARGE QUE CELUI DU FAIT DU SOIR (12 s), et
 * c'est une différence de surface, pas de générosité.
 *
 * `daily_recap_io` et `reengagement_io` composent DANS UN CRON qui balaie toute
 * la base: 12 s par élève y est un plafond de FLOTTE, et un repli déterministe
 * n'y coûte qu'une tournure. Ici on répond à quelqu'un qui vient d'appuyer sur
 * « Envoyer » et qui attend; il n'y a pas de flotte derrière, et le repli coûte
 * le bilan lui-même.
 *
 * ⚠️ MESURÉ, pas estimé (2026-08-06, base locale, protocole de coach réel):
 * trois compositions à 79 s, 39 s et 37 s sur un prompt de 3 298 caractères.
 * À 12 s, ce composeur ne serait JAMAIS parti — un composeur mort déguisé en
 * composeur prudent, exactement ce que `sanitizeComposedNudge` documente. Le
 * tour entrant, lui, a 120 s (`CHAT_INBOUND_BRAIN_TIMEOUT_MS`): 45 s tient
 * largement dedans et laisse la place à l'écriture qui suit.
 */
const COMPOSE_TIMEOUT_MS = 45_000;

// ---------------------------------------------------------------------------
// LA FENÊTRE
// ---------------------------------------------------------------------------

/** Les dates de `start` à `end` inclus, dans l'ordre. Vide si l'ordre est faux. */
export function datesBetween(start: string, end: string): string[] {
  const from = new Date(`${String(start ?? "").trim()}T00:00:00Z`);
  const to = new Date(`${String(end ?? "").trim()}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];
  if (to.getTime() < from.getTime()) return [];
  const out: string[] = [];
  const cursor = new Date(from);
  // Borne dure: une fenêtre de plus de 31 jours est une erreur d'appelant, pas
  // une semaine. On refuse plutôt que de boucler sur une date corrompue.
  while (cursor.getTime() <= to.getTime() && out.length < 31) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// LES FAITS DE LA SEMAINE
// ---------------------------------------------------------------------------

/**
 * Les groupes d'aliments que porte UNE ligne de `protocol_events`.
 *
 * DEUX SOURCES, ET ELLES NE DISENT PAS LA MÊME CHOSE:
 *   - la COLONNE `food_group_ref` — ce que l'élève (ou le crédit d'une photo) a
 *     explicitement rattaché à un groupe. `log_protocol_event` écrit une ligne
 *     PAR composant nommé, donc un « poulet et brocoli » arrive déjà en deux
 *     lignes, chacune avec sa colonne;
 *   - `recognized.food_groups_present` — ce que la vision a VU sur l'assiette.
 *     Une photo ne crédite qu'un seul groupe en colonne, alors qu'elle en voit
 *     souvent trois. Les ignorer ferait dire « je n'ai vu aucun légume vert »
 *     à propos d'une semaine de photos qui en montrent tous les jours.
 *
 * Pourquoi c'est recevable, et où est la limite: `docs/keel/Q6_NUTRITION_LAYER.md`
 * §2.5 mesure le modèle à 89,8 % de justesse d'IDENTIFICATION et 42-110 %
 * d'erreur sur les macros. La présence est donc recevable, les grammes ne le
 * sont pas — et ce module ne lit que la présence. Le bloc de contexte dit
 * explicitement d'où viennent les comptes, pour que l'élève puisse contester
 * une assiette mal lue.
 *
 * Dédupliqué par ligne: une observation, pas deux, quand les deux sources
 * s'accordent (voir l'en-tête de `WeekFactInput`).
 */
function foodGroupsOfRow(row: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const column = String(row.food_group_ref ?? "").trim();
  if (column) out.add(column);
  const recognized = row.recognized;
  if (recognized && typeof recognized === "object" && !Array.isArray(recognized)) {
    const present = (recognized as Record<string, unknown>).food_groups_present;
    if (Array.isArray(present)) {
      for (const entry of present) {
        const slug = String(entry ?? "").trim();
        if (slug) out.add(slug);
      }
    }
  }
  return [...out];
}

export interface WeekFactsLoad {
  facts: WeekFactInput[];
  pulses: Array<{ overall: string; axis: string | null }>;
  /**
   * ⚠️ CE CHEMIN EST CONDAMNÉ AVEC SON HÔTE (marqué le 2026-08-18, lot L2b).
   *
   * `docs/keel/RETRAIT-POINT-DU-DIMANCHE.md` §3.c, décision produit du
   * 2026-08-10: « le bilan hebdo part aussi ». Le module entier partira avec le
   * chantier de retrait, pas à la pièce — **ne retire rien ici**, et surtout pas
   * les deux gardes que L2 y a posées (`COUNTABLE` étendu à
   * `sessions|workouts|minutes`, et la ceinture `reason: "energy_number"`
   * adossée à `findNumericNutritionTarget`): elles sont bonnes et testées.
   *
   * **Le consommateur VIVANT du log de séance est `/app/progress`**
   * (`frontend/src/keel/api/activitySessions.ts` +
   * `components/ActivitySessionsCard.tsx`). Celui-ci ne l'est plus: son unique
   * déclencheur, le cron `keel-weekly-flow`, comptait 270 exécutions et 270
   * échecs, et il est désactivé en local depuis le 2026-08-18.
   *
   * ── LE RESTE DU CONTRAT, TANT QUE CE CHAMP EXISTE ─────────────────────────
   * Les séances loguées de la semaine, ou `null` QUAND ON N'A PAS SU LIRE.
   *
   * `[]` et `null` ne disent pas la même chose et ne doivent jamais être
   * confondus: `[]` veut dire « lu, aucune séance » (le bilan n'en dit rien),
   * `null` veut dire « pas lu » (le bilan n'en dit rien non plus, mais le gel
   * ne porte alors AUCUN compte, donc rien plus tard ne pourra affirmer que
   * cette semaine-là n'a pas bougé).
   */
  activity: ActivitySessionInput[] | null;
}

/**
 * Les faits déclarés de la semaine, et les taps du soir.
 *
 * `.is("disqualified_reason", null)` — LE FILTRE QUI DÉCIDE DE LA VÉRITÉ DU
 * BILAN. `protocol_events` est append-only: une coche retirée SURVIT, avec
 * `food_not_eaten`, et une photo de menu ou de capture d'écran survit avec son
 * propre motif. Sans ce filtre, un bilan féliciterait pour un plat que l'élève
 * vient explicitement de retirer — la même ligne que `loadDayFacts` porte, pour
 * la même raison, sur la même table.
 */
export async function loadWeekFacts(
  db: Db,
  args: { userId: string; weekStart: string; weekEnd: string },
): Promise<WeekFactsLoad> {
  const userId = String(args.userId ?? "").trim();
  // Sans élève on ne LIT rien — donc `activity: null` (« pas lu »), et surtout
  // pas `[]`, qui affirmerait une semaine sans séance.
  const empty: WeekFactsLoad = { facts: [], pulses: [], activity: null };
  if (!userId) return empty;

  let facts: WeekFactInput[] = [];
  try {
    const { data, error } = await db
      .from("protocol_events")
      .select("local_date, food_group_ref, portion_band, recognized, source, plan_relation")
      .eq("user_id", userId)
      .is("disqualified_reason", null)
      .gte("local_date", args.weekStart)
      .lte("local_date", args.weekEnd);
    if (error) throw error;
    facts = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      localDate: String(row.local_date ?? ""),
      foodGroups: foodGroupsOfRow(row),
      portionBand: row.portion_band == null ? null : String(row.portion_band),
      // FF-009 — les deux axes qui séparent les trois comptes. Ils ne
      // participent à AUCUN jugement d'alignement: ils sont comptés, et rien
      // d'autre.
      source: row.source == null ? null : String(row.source),
      planRelation: row.plan_relation == null ? null : String(row.plan_relation),
    }));
  } catch (error) {
    // Une semaine illisible ne devient pas une semaine vide: rendre `[]` ici
    // ferait calculer « couverture 0/7 » sur une panne Postgres, et le bilan
    // dirait à l'élève qu'il n'a rien logué. On remonte, l'appelant renonce.
    throw error instanceof Error ? error : new Error(String(error));
  }

  let pulses: Array<{ overall: string; axis: string | null }> = [];
  try {
    const { data, error } = await db
      .from("student_daily_checkins")
      .select("overall, axis")
      .eq("user_id", userId)
      .gte("local_date", args.weekStart)
      .lte("local_date", args.weekEnd);
    if (error) throw error;
    pulses = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      overall: String(row.overall ?? ""),
      axis: row.axis == null ? null : String(row.axis),
    }));
  } catch (error) {
    // Les taps sont un AXE du bilan, pas son socle: sans eux la vivabilité
    // sort `unknown` et le reste tient. On dégrade au lieu de renoncer.
    console.warn("[keel/week_review] pulses unreadable", error);
  }

  // ── LES SÉANCES LOGUÉES ───────────────────────────────────────────────────
  //
  // ⚠️ `.eq("user_id", userId)` EST OBLIGATOIRE ET N'EST PAS REDONDANT AVEC
  // RLS. Ce chargeur tourne en `service_role` dans le cron du dimanche, où RLS
  // ne s'applique PAS: sans ce filtre, la requête rendrait les séances de
  // toute la base et le bilan d'un élève compterait celles des autres. Le
  // dépôt a exactement cette cicatrice (« RLS ne remplace pas un
  // .eq(user_id) », la ligne d'un élève rendue à un coach).
  //
  // UNE PANNE DÉGRADE, ELLE NE RENONCE PAS — même arbitrage que les taps juste
  // au-dessus: les séances sont un AXE du bilan, pas son socle. Mais elles
  // dégradent vers `null` (« je ne sais pas »), jamais vers `[]`, qui ferait
  // geler « aucune séance » sur une panne Postgres.
  let activity: ActivitySessionInput[] | null = null;
  try {
    const { data, error } = await db
      .from("student_activity_sessions")
      .select("local_date, kind, duration_min, intensity")
      .eq("user_id", userId)
      .gte("local_date", args.weekStart)
      .lte("local_date", args.weekEnd);
    if (error) throw error;
    activity = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      localDate: String(row.local_date ?? ""),
      kind: parseActivitySessionKind(row.kind),
      durationMin: row.duration_min == null ? null : Number(row.duration_min),
      intensity: parseActivityIntensity(row.intensity),
    }));
  } catch (error) {
    console.warn("[keel/week_review] activity sessions unreadable", error);
  }

  return { facts, pulses, activity };
}

// ---------------------------------------------------------------------------
// LA PERSISTANCE
// ---------------------------------------------------------------------------

/** Ce qu'une ligne `weekly_reviews` porte pour nous. */
export interface StoredWeekReview {
  weekStart: string;
  reading: WeekReviewReading;
  /** Le formulaire de la semaine, s'il a été rempli. `{axe: 1..5}`. */
  biofeedback: Record<string, number> | null;
}

/**
 * Les axes 1-5 d'une ligne `weekly_reviews`, ou `null`.
 *
 * ── R4 — `null` EST LE CAS NOMINAL EN B2C, PAS UN ÉTAT PARTIEL ─────────────
 * Les six axes ne sont collectés que là où quelqu'un les LIT: leur seul
 * consommateur est la synthèse de cohorte du coach, et en B2C il n'y a pas de
 * coach humain pour l'ouvrir (le coach « maison » n'a pas de synthèse). L'écran
 * ne les demande donc pas — `WeeklyCheckInDialog`, gate `showAxes` — et un
 * dimanche ne porte plus que le poids et le tour de taille.
 *
 * Conséquence pour tout lecteur d'ici: `null` veut dire « on ne les a pas
 * demandés », pas « la semaine est incomplète ». Traiter « pas d'axes » comme
 * « pas de revue » casserait la boucle du poids, qui est justement ce que le
 * point hebdo garde en B2C. La règle mère du dossier est citée en entier dans
 * `20260808110000_biofeedback_reader_gate.sql`.
 */
function biofeedbackAxes(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    // Les clés de service du payload (`source`, `weight_kg`, `waist_cm`,
    // `measured_at`) ne sont pas des axes. Seul ce qui est un cran 1-5 en est
    // un — et le poids ne rentre JAMAIS dans un bilan: l'écran qui le porte se
    // retire quand la garde restrictive est armée, et le renvoyer par la bulle
    // d'à côté annulerait ce retrait.
    const n = Number(value);
    if (Number.isInteger(n) && n >= 1 && n <= 5) out[key] = n;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// ---------------------------------------------------------------------------
// FF-008 — LA MESURE ANNONCÉE EN CONVERSATION
// ---------------------------------------------------------------------------

/** Le lundi de la semaine qui contient `localDate`. */
export function weekStartOfLocalDate(localDate: string): string | null {
  const raw = String(localDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export interface DeclaredBodyMeasureWrite {
  userId: string;
  weekStart: string;
  /** `weight` écrit `weight_kg`, `waist` écrit `waist_cm`. */
  kind: "weight" | "waist";
  /** En SI: kg ou cm. C'est le plancher qui a converti, pas ce module. */
  valueSi: number;
  /** L'instant du tour, en heure LOCALE de l'élève, ISO. */
  measuredAt: string;
  /**
   * FF-031 — le JOUR de l'élève, YYYY-MM-DD. `weekStart` en dérive déjà chez
   * l'appelant; il est demandé en plus parce que la table datée groupe sur le
   * jour et que le recalculer ici referait, mal, une conversion de fuseau que
   * l'appelant avait faite juste.
   */
  localDate: string;
  contentLocale: string;
  /** Les mots de l'élève, pour que la mesure reste auditable. */
  studentNote?: string | null;
}

export interface DeclaredBodyMeasureWriteResult {
  /** `inserted` quand la ligne de semaine n'existait pas encore. */
  outcome: "inserted" | "updated";
  /** La valeur RELUE. Vérité d'exécution: on n'affirme que ce que la base rend. */
  storedValue: number;
  /** FF-031 — la mesure datée a-t-elle été rangée, et sinon pourquoi. */
  datedMeasureWritten: boolean;
  datedMeasureIssue: string | null;
}

/**
 * Écrit une mesure ANNONCÉE EN CONVERSATION sur la ligne de semaine courante.
 *
 * ── POURQUOI ICI, ET PAS DANS UNE TABLE NEUVE ─────────────────────────────
 * FF-008 §3: « pas de nouvelle table ». Le poids vit déjà dans DEUX modèles de
 * la même table (`biofeedback.weight_kg`, écrit par le point du dimanche et la
 * carte des mesures; `outcomes.weight_7d_avg`, le chemin 1:1). Un troisième
 * lieu de stockage serait le bug écrivain/lecteur qui a laissé la carte poids
 * vide, à l'échelle d'une donnée de sécurité.
 *
 * ── ⚠️ FF-031 A RENVERSÉ LE PREMIER PARAGRAPHE ────────────────────────────
 * « Pas de nouvelle table » était le bon arbitrage de FF-008 et il ne l'est
 * plus: la granularité de stockage d'une mesure n'est pas la semaine. Le poids
 * vit maintenant dans `student_body_measures`, une ligne par pesée, et c'est
 * de LÀ que la série du plancher TCA est dérivée
 * (`body_measure_series.deriveWeeklyOutcomeSamples`).
 *
 * Cette fonction écrit donc AUX DEUX ENDROITS, le temps de la double écriture
 * transitoire (FF-031 R7, qui porte sa condition de retrait). Le paragraphe
 * ci-dessous décrit ce que fait encore le MIROIR — il n'est plus la vérité.
 *
 * ── LE MIROIR REMPLACE, IL N'AJOUTE PAS ───────────────────────────────────
 * La revue du dimanche n'a qu'UN poids par semaine. Deux lignes créeraient une
 * variation fantôme, et `restriction_guard` JETTE sur une semaine dupliquée
 * (« weekly_outcomes has a duplicate week_start_date »). La dernière
 * déclaration gagne, quelle que soit sa source: un élève qui se corrige
 * (« pardon, 78 pas 87 ») doit pouvoir le faire en parlant. Dans la table
 * datée, la correction s'AJOUTE et c'est la dérivation qui tranche — même
 * règle, même résultat, sans perdre ce qui a été démenti.
 *
 * ── FUSION, PAS ÉCRASEMENT ────────────────────────────────────────────────
 * Le jsonb existant est relu et fusionné, comme `writeWeeklyFlowReply` le fait
 * déjà: une mesure dite mardi ne doit pas effacer les six axes remplis
 * dimanche, et un formulaire rempli dimanche prochain ne doit pas effacer ce
 * qui a été dit mardi.
 *
 * ── SELECT PUIS UPDATE-PAR-ID OU INSERT — JAMAIS D'UPSERT ─────────────────
 * Même raison que `writeWeekFacts` juste en dessous: l'unicité de cette table
 * pour le pivot est portée par un index PARTIEL (`where plan_version_id is
 * null`) et `ON CONFLICT (a,b)` ne peut pas le choisir — PostgREST n'émet
 * jamais le `WHERE` qu'il faudrait, et le seul écrivain de cette table a passé
 * sa vie à répondre 42P10 sans que rien ne le dise.
 *
 * ── ELLE NE RATTRAPE RIEN EN SILENCE ──────────────────────────────────────
 * Toute erreur REMONTE. Un chargeur qui avale son erreur raconte qu'un élève
 * n'a rien saisi alors qu'on a échoué à écrire — et ici, l'appelant a besoin de
 * savoir qu'il ne doit accuser réception de rien.
 */
export async function writeDeclaredBodyMeasure(
  db: Db,
  args: DeclaredBodyMeasureWrite,
): Promise<DeclaredBodyMeasureWriteResult> {
  const userId = String(args.userId ?? "").trim();
  if (!userId) throw new Error("[keel/week_review] writeDeclaredBodyMeasure: userId is required");
  const weekStart = String(args.weekStart ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    throw new Error(
      `[keel/week_review] writeDeclaredBodyMeasure: weekStart is not YYYY-MM-DD: ${
        JSON.stringify(args.weekStart)
      }`,
    );
  }
  const column = args.kind === "weight" ? "weight_kg" : "waist_cm";

  async function readExisting(): Promise<
    { id: string; biofeedback: unknown } | null
  > {
    const res = await db
      .from("weekly_reviews")
      .select("id, biofeedback")
      .eq("user_id", userId)
      .eq("week_start_date", weekStart)
      .is("plan_version_id", null)
      .maybeSingle();
    if (res.error) throw res.error;
    return (res.data ?? null) as { id: string; biofeedback: unknown } | null;
  }

  function merged(previous: unknown): Record<string, unknown> {
    const before = (previous && typeof previous === "object" && !Array.isArray(previous))
      ? previous as Record<string, unknown>
      : {};
    return {
      ...before,
      [column]: args.valueSi,
      // La PROVENANCE, honnête. `source` est lu (par `/app/progress` et par la
      // synthèse coach): laisser une mesure dite en conversation se faire
      // passer pour un formulaire rendrait l'historique inexploitable le jour
      // où on voudra comparer les deux gestes.
      source: "chat",
      measured_at: args.measuredAt,
    };
  }

  /**
   * RELECTURE, pas écho. La valeur rendue vient de la base: si un trigger l'a
   * normalisée ou si l'écriture n'a touché aucune ligne, l'appelant l'apprend
   * ici et pas trois couches plus loin sur une donnée qui paraît valide.
   */
  async function readBack(id: string): Promise<number> {
    const res = await db
      .from("weekly_reviews")
      .select("biofeedback")
      .eq("id", id)
      .maybeSingle();
    if (res.error) throw res.error;
    const row = (res.data ?? null) as { biofeedback: unknown } | null;
    const bio = (row?.biofeedback ?? null) as Record<string, unknown> | null;
    const stored = Number(bio?.[column]);
    if (!Number.isFinite(stored)) {
      throw new Error(
        `[keel/week_review] body measure write-through violated: ${column} is ` +
          `not readable back on weekly_reviews ${id}`,
      );
    }
    return stored;
  }

  /**
   * FF-031 — la mesure DATÉE, source de vérité depuis ce chantier.
   *
   * Elle ne fait pas échouer l'écriture miroir (R9): tant que la double
   * écriture dure, `biofeedback` est le chemin qui marche, et le perdre pour
   * une panne de la table neuve serait une régression sur un accusé que
   * l'élève reçoit déjà. Le motif est RENDU, pas seulement journalisé.
   */
  async function writeDated(): Promise<
    { datedMeasureWritten: boolean; datedMeasureIssue: string | null }
  > {
    try {
      await insertBodyMeasures(db, [{
        userId,
        kind: args.kind,
        valueSi: args.valueSi,
        source: "chat",
        measuredAt: args.measuredAt,
        localDate: args.localDate,
        contentLocale: args.contentLocale,
        studentNote: args.studentNote ?? null,
      }]);
      return { datedMeasureWritten: true, datedMeasureIssue: null };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn("keel.body_measures.write_failed", {
        user_id: userId,
        kind: args.kind,
        source: "chat",
        detail,
      });
      return { datedMeasureWritten: false, datedMeasureIssue: detail };
    }
  }

  const existing = await readExisting();
  if (existing) {
    const res = await db
      .from("weekly_reviews")
      .update({ biofeedback: merged(existing.biofeedback) })
      .eq("id", existing.id);
    if (res.error) throw res.error;
    return {
      outcome: "updated",
      storedValue: await readBack(existing.id),
      ...(await writeDated()),
    };
  }

  const res = await db
    .from("weekly_reviews")
    .insert({
      user_id: userId,
      week_start_date: weekStart,
      plan_version_id: null,
      biofeedback: merged(null),
      content_locale: args.contentLocale,
    })
    .select("id")
    .single();
  if (res.error) {
    // 23505 = l'index partiel a mordu, une écriture concurrente a créé la ligne
    // entre notre SELECT et notre INSERT. C'est exactement ce que la ceinture
    // doit faire: on relit et on fusionne dedans.
    if (String((res.error as { code?: string }).code ?? "") !== "23505") throw res.error;
    const raced = await readExisting();
    if (!raced) throw res.error;
    const retry = await db
      .from("weekly_reviews")
      .update({ biofeedback: merged(raced.biofeedback) })
      .eq("id", raced.id);
    if (retry.error) throw retry.error;
    return {
      outcome: "updated",
      storedValue: await readBack(raced.id),
      ...(await writeDated()),
    };
  }
  const insertedId = String((res.data as Record<string, unknown> | null)?.id ?? "").trim();
  if (!insertedId) {
    throw new Error(
      "[keel/week_review] weekly_reviews insert returned no readable id " +
        "(write-through violated)",
    );
  }
  return {
    outcome: "inserted",
    storedValue: await readBack(insertedId),
    ...(await writeDated()),
  };
}

/**
 * Écrit `week_facts` sur la ligne (élève, semaine).
 *
 * ⚠️ SELECT PUIS UPDATE-PAR-ID OU INSERT — JAMAIS D'UPSERT. L'unicité de cette
 * table pour le pivot est portée par un index PARTIEL (`... where
 * plan_version_id is null`), et `ON CONFLICT (a,b)` ne peut pas le choisir:
 * PostgREST n'émet jamais le `WHERE` qu'il faudrait, et le seul écrivain de
 * cette table a passé sa vie à répondre 42P10 sans que rien ne le dise
 * (reproduit le 2026-08-03). L'index reste la CEINTURE: sur une écriture
 * concurrente, l'INSERT perdant lève 23505 et on repasse en UPDATE.
 */
export async function writeWeekFacts(
  db: Db,
  args: {
    userId: string;
    weekStart: string;
    reading: WeekReviewReading;
    computedAt: Date;
    contentLocale: string;
  },
): Promise<{ written: boolean; updated: boolean }> {
  const payload = {
    week_facts: args.reading as unknown as Record<string, unknown>,
    week_facts_computed_at: args.computedAt.toISOString(),
  };

  async function readExisting(): Promise<{ id: string } | null> {
    const res = await db
      .from("weekly_reviews")
      .select("id")
      .eq("user_id", args.userId)
      .eq("week_start_date", args.weekStart)
      .is("plan_version_id", null)
      .maybeSingle();
    if (res.error) throw res.error;
    return (res.data ?? null) as { id: string } | null;
  }

  const existing = await readExisting();
  if (existing) {
    const res = await db.from("weekly_reviews").update(payload).eq("id", existing.id);
    if (res.error) throw res.error;
    return { written: true, updated: true };
  }

  const res = await db.from("weekly_reviews").insert({
    user_id: args.userId,
    week_start_date: args.weekStart,
    plan_version_id: null,
    content_locale: args.contentLocale,
    ...payload,
  });
  if (res.error) {
    if (String((res.error as { code?: string }).code ?? "") !== "23505") throw res.error;
    const raced = await readExisting();
    if (!raced) throw res.error;
    const retry = await db.from("weekly_reviews").update(payload).eq("id", raced.id);
    if (retry.error) throw retry.error;
    return { written: true, updated: true };
  }
  return { written: true, updated: false };
}

/**
 * Le bilan STOCKÉ d'une semaine donnée, ou `null`.
 *
 * `week_facts_computed_at is not null` est la condition, pas la présence du
 * jsonb: une ligne peut porter un `week_facts` d'une version qu'on ne sait plus
 * lire, et `parseWeekReview` rendra alors `null` — les deux gardes disent la
 * même chose depuis deux endroits, ce qui est voulu ici parce que l'une protège
 * la requête et l'autre le contenu.
 */
export async function readWeekReview(
  db: Db,
  args: { userId: string; weekStart: string },
): Promise<StoredWeekReview | null> {
  try {
    const { data, error } = await db
      .from("weekly_reviews")
      .select("week_start_date, week_facts, biofeedback")
      .eq("user_id", args.userId)
      .eq("week_start_date", args.weekStart)
      .is("plan_version_id", null)
      .not("week_facts_computed_at", "is", null)
      .maybeSingle();
    if (error) throw error;
    const row = (data ?? null) as Record<string, unknown> | null;
    if (!row) return null;
    const reading = parseWeekReview(row.week_facts);
    if (!reading) return null;
    return {
      weekStart: String(row.week_start_date ?? ""),
      reading,
      biofeedback: biofeedbackAxes(row.biofeedback),
    };
  } catch (error) {
    console.warn("[keel/week_review] stored review unreadable", error);
    return null;
  }
}

/**
 * Le DERNIER bilan calculé de cet élève, ou `null`.
 *
 * C'est ce que la conversation lit toute la semaine suivante. Pas de fenêtre de
 * fraîcheur maison: le bloc PORTE SES DATES et interdit au modèle de dire
 * « cette semaine » hors de cette plage. Un TTL en plus ferait taire un bilan
 * parfaitement citable le mercredi sous prétexte qu'il a trois jours, alors que
 * c'est justement le moment où l'élève y revient.
 */
export async function loadLatestWeekReview(
  db: Db,
  userId: string,
): Promise<StoredWeekReview | null> {
  const id = String(userId ?? "").trim();
  if (!id) return null;
  try {
    const { data, error } = await db
      .from("weekly_reviews")
      .select("week_start_date, week_facts, biofeedback")
      .eq("user_id", id)
      .is("plan_version_id", null)
      .not("week_facts_computed_at", "is", null)
      .order("week_start_date", { ascending: false })
      .limit(1);
    if (error) throw error;
    const row = ((data ?? []) as Array<Record<string, unknown>>)[0];
    if (!row) return null;
    const reading = parseWeekReview(row.week_facts);
    if (!reading) return null;
    return {
      weekStart: String(row.week_start_date ?? ""),
      reading,
      biofeedback: biofeedbackAxes(row.biofeedback),
    };
  } catch (error) {
    console.warn("[keel/week_review] latest review unreadable", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// LE CALCUL, GELÉ
// ---------------------------------------------------------------------------

export interface ComputeWeekReviewResult {
  reading: WeekReviewReading | null;
  /** `computed` | `skipped:<motif>` — rendu, jamais avalé. */
  outcome: string;
}

/**
 * Calcule la lecture de la semaine et la gèle. Appelé AVANT l'envoi du point.
 *
 * Ne jette pas: un job qui balaie mille élèves ne doit pas s'arrêter parce que
 * l'un d'eux a un protocole illisible. Le motif remonte dans le compte-rendu,
 * et c'est là qu'on le lit — un bilan manquant en silence ressemble sinon à une
 * semaine sans rien à dire.
 */
export async function computeAndStoreWeekReview(
  db: Db,
  args: {
    userId: string;
    weekStart: string;
    weekEnd: string;
    contentLocale: string;
    now: Date;
  },
): Promise<ComputeWeekReviewResult> {
  const weekDates = datesBetween(args.weekStart, args.weekEnd);
  if (weekDates.length === 0) {
    return { reading: null, outcome: "skipped:bad_window" };
  }

  let load: WeekFactsLoad;
  try {
    load = await loadWeekFacts(db, args);
  } catch (error) {
    return {
      reading: null,
      outcome: `skipped:facts_unreadable:${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  // LE MAPPING DU COACH, déjà filtré sur l'objectif de CET élève par le
  // chargeur. Une panne ne renonce pas: sans méthode, le bilan compte ce qui a
  // été logué et ne compare rien (`no_method`), ce qui reste vrai et utile.
  let rules: Awaited<ReturnType<typeof loadPublishedProtocol>>["compiled"] = [];
  let goal: string | null = null;
  try {
    const protocol = await loadPublishedProtocol(db, args.userId);
    rules = protocol.compiled;
    goal = protocol.goal;
  } catch (error) {
    console.warn("[keel/week_review] protocol unavailable", error);
  }

  // Ce sur quoi on a interrogé la semaine dernière. Une panne de lecture rend
  // `null`, donc le pire cas est de reposer une question — jamais de perdre le
  // bilan pour ça.
  const previousStart = shiftWeek(args.weekStart, -7);
  const previous = previousStart
    ? await readWeekReview(db, { userId: args.userId, weekStart: previousStart })
    : null;

  const reading = computeWeekReview({
    weekStart: args.weekStart,
    weekEnd: args.weekEnd,
    weekDates,
    facts: load.facts,
    pulses: load.pulses,
    // `null` traverse tel quel: le gel ne portera alors aucun compte de
    // séances, ce qui vaut mieux qu'un zéro qu'on n'a pas mesuré.
    activity: load.activity,
    rules,
    goal,
    previouslyAskedGroup: previous?.reading.question?.group ?? null,
  });

  try {
    await writeWeekFacts(db, {
      userId: args.userId,
      weekStart: args.weekStart,
      reading,
      computedAt: args.now,
      contentLocale: args.contentLocale,
    });
  } catch (error) {
    // Le calcul est bon, l'écriture a raté. On rend quand même la lecture:
    // l'appelant peut composer avec, et seule la persistance manquera. Dire
    // « pas de bilan » ici perdrait deux fois au lieu d'une.
    return {
      reading,
      outcome: `skipped:write_failed:${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  return { reading, outcome: "computed" };
}

/** La semaine décalée de `days`, ou `null` si la date d'entrée est illisible. */
export function shiftWeek(weekStart: string, days: number): string | null {
  const d = new Date(`${String(weekStart ?? "").trim()}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// LA COMPOSITION
// ---------------------------------------------------------------------------

export interface ComposedWeekReview {
  body: string;
  source: "composed" | "fallback";
  /** Le motif du repli, RENDU et jamais avalé. */
  reason: string;
}

/**
 * Le bilan, dans la voix du coach quand il en a une.
 *
 * ⚠️ `body` N'EST JAMAIS VIDE. Contrairement au fait du soir, il n'existe pas
 * de cas « rien à dire »: l'élève vient de remplir un formulaire et attend
 * quelque chose en retour, et un silence après ça dit « ça n'a servi à rien ».
 * Tout échec — pas de doctrine, modèle en panne, ceinture qui refuse — rend le
 * texte déterministe: on perd la voix, jamais l'information.
 *
 * R4 — « HUIT CHAMPS » ÉTAIT LE CHIFFRE B2B, et il ne l'est plus partout. En
 * B2C le formulaire n'en porte que deux (poids, tour de taille): les six axes ne
 * se collectent que là où un coach humain les lit. La règle ci-dessus ne bouge
 * pas pour autant — deux champs remplis méritent la même réponse que huit, et
 * cette fonction ne LIT pas le biofeedback de toute façon: elle compose depuis
 * `reading`, qui est le décompte des faits contre la méthode du coach.
 */
export async function composeWeekReviewBody(
  db: Db,
  args: {
    userId: string;
    firstName: string;
    reading: WeekReviewReading;
    contentLocale: string;
    requestId?: string;
  },
): Promise<ComposedWeekReview> {
  const deterministic = renderDeterministicWeekReview(args.reading);
  const fallback = (reason: string): ComposedWeekReview => ({
    body: deterministic,
    source: "fallback",
    reason,
  });

  let doctrineBlock: string;
  try {
    const loaded = await loadPublishedDoctrine(db, args.userId);
    // PAS DE COMPOSITION SANS DOCTRINE: sans méthode publiée il n'y a aucune
    // voix à porter, donc la composition paierait un appel de modèle pour
    // réécrire un décompte — moins fiable, et sans le déterminisme qui allait
    // avec. Même règle, mot pour mot, que la relance et le fait du soir.
    if (loaded.reason !== "loaded") return fallback(`no_doctrine:${loaded.reason}`);
    doctrineBlock = doctrineBlockFor(loaded);
  } catch (error) {
    return fallback(
      `doctrine_load_failed:${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const system = appendResponseLanguageBlock(
    buildWeekReviewSystemPrompt({ doctrineBlock, reading: args.reading }),
    args.contentLocale,
  );

  let raw: unknown;
  try {
    raw = await Promise.race([
      generateWithGemini(
        system,
        buildWeekReviewUserPrompt(args.firstName),
        // Bas, et pour la raison du fait du soir: ce texte porte des CHIFFRES.
        // La fantaisie ne produit pas de la chaleur, elle produit des rejets
        // `invented_number` — donc du repli déterministe, donc moins de voix du
        // coach, pas plus.
        0.4,
        false,
        [],
        "auto",
        { requestId: args.requestId, userId: args.userId, source: "keel_week_review" },
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("compose_timeout")), COMPOSE_TIMEOUT_MS)
      ),
    ]);
  } catch (error) {
    return fallback(`llm_failed:${error instanceof Error ? error.message : String(error)}`);
  }

  if (typeof raw !== "string") return fallback("llm_returned_non_text");

  const verdict = acceptComposedWeekReview(raw, args.reading);
  if (!verdict.ok) return fallback(`rejected:${verdict.reason}:${verdict.detail}`);
  return { body: verdict.text, source: "composed", reason: "" };
}
