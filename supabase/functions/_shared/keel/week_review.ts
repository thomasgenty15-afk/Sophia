/**
 * LE BILAN DE LA SEMAINE — ce que l'élève a mangé, lu contre la méthode de son
 * coach, et la SEULE question qu'on a le droit de lui poser dessus.
 *
 * ── LE DÉFAUT PRODUIT QUE CE MODULE CORRIGE ─────────────────────────────────
 * L'élève remplit son formulaire le dimanche soir et reçoit en retour:
 * *« Got it — thanks for taking the two minutes. »* Deux minutes de son temps
 * contre une phrase. Le point hebdomadaire mesurait, il ne RENDAIT rien, et
 * c'est la surface où le produit a le plus à dire: c'est le seul moment de la
 * semaine où l'élève s'arrête et regarde ce qu'il a fait.
 *
 * R4 — LE FORMULAIRE N'A PLUS UNE SEULE TAILLE. Il portait huit champs pour tout
 * le monde (six axes, un poids, un tour de taille). Les six axes ne se collectent
 * plus que là où quelqu'un les LIT — la synthèse de cohorte du coach — donc en
 * B2C le dimanche se réduit à deux mesures. Rien dans ce fichier n'en dépend: la
 * lecture rendue ici compte des FAITS ALIMENTAIRES contre la méthode du coach,
 * pas des axes. Le biofeedback n'entre que par `weekReviewPromptBlock`, en
 * paramètre optionnel, et son absence y est le cas nominal.
 *
 * ── LA RÈGLE QUI GOUVERNE TOUT LE FICHIER ───────────────────────────────────
 * LES NOMBRES SONT CALCULÉS, JAMAIS NARRÉS. Même règle, mot pour mot, que la
 * synthèse du coach (`coach_synthesis.ts`) et pour la même cicatrice
 * (`tracking-projection-not-grounded-db`: un récapitulatif dont les entrées
 * sont des projections finit par annoncer trois complétions là où la base en
 * porte une, et le pire moment pour confabuler est celui où l'élève demande de
 * vérifier). Ici:
 *   - chaque chiffre vient de `computeWeekReview`, qui compte des faits;
 *   - le modèle ne peut citer QUE des nombres présents dans la lecture
 *     (`allowedWeekNumbers`, ceinture `invented_number`);
 *   - ce qui n'est pas calculable est ABSENT, jamais estimé.
 *
 * ── CE QUE CE BILAN N'EST PAS, ET NE DOIT JAMAIS DEVENIR ────────────────────
 * **Un score d'adhérence.** `docs/keel/MODEL.md` §3: sans prescription
 * individuelle, « l'élève a-t-il suivi ce qu'on lui a prescrit » n'a pas
 * d'objet, et l'évaluateur KEEL est débranché. Ce que ce module produit est un
 * COMPTE DE FAITS DÉCLARÉS mis en face d'une méthode collective. « Vu 2 fois »
 * n'est pas « 40 % ». La ceinture `adherence_language` refuse le vocabulaire
 * qui ferait glisser l'un vers l'autre — pourcentage, score, série, compliance.
 *
 * ── LE DÉNOMINATEUR EST CE QU'ON A VU, JAMAIS SEPT ──────────────────────────
 * Un élève qui logue cinq jours sur sept n'a pas « raté deux jours »: il a deux
 * jours dont on ne sait rien, et `unknown` n'est jamais écrasé en échec par du
 * silence (CONTRACT, et c'est la règle la plus répétée du pivot). Toutes les
 * phrases de ce module comptent donc sur les jours OBSERVÉS et le disent.
 *
 * ── UNE SEULE QUESTION, ET JAMAIS SUR CE QUI A ÉTÉ MANGÉ ────────────────────
 * `docs/keel/Q6_NUTRITION_LAYER.md` §2.5 rapporte le consensus international
 * (n=87) qui classe le monitoring type comptage et la prescription rigide parmi
 * les stratégies qui AUGMENTENT le risque de TCA. Un « pourquoi as-tu mangé X »
 * hebdomadaire est exactement ce motif. D'où deux décisions dures:
 *   1. la question porte toujours sur ce qui MANQUE (« qu'est-ce qui a rendu le
 *      poisson difficile cette semaine ? »), jamais sur ce qui a été consommé
 *      en trop. Un écart d'évitement se CONSTATE, il ne s'interroge pas;
 *   2. une seule par bilan, et jamais deux semaines de suite sur le même groupe
 *      (`previouslyAskedGroup`).
 *
 * PURE MODULE: no I/O, no clock (l'appelant passe les dates), no randomness.
 */

import {
  LOGGED_DAY_MIN_EVENTS,
  LOGGING_COVERAGE_MIN_DAYS,
  type PortionBandSummary,
  summarizePortionBands,
} from "./adherence.ts";
import { type LivabilitySummary, summarizeLivability } from "./coach_synthesis.ts";
import type { CompiledCommitment } from "./protocol_compiler.ts";
import { FOOD_GROUP_REFS, type FoodGroupRef } from "./tokens.ts";
import { EN_LABELS } from "./labels.en.ts";
import {
  findQualifyingVerdict,
  numberValue,
  NUMBER_WORDS,
} from "./daily_recap.ts";
import {
  countSentences,
  PROMPT_ARTEFACT_PATTERNS,
  sanitizeComposedNudge,
} from "./reengage_composer.ts";
import { findGuiltTripping } from "./reengagement.ts";

/**
 * La version de la forme sérialisée dans `weekly_reviews.week_facts`.
 *
 * Une lecture d'une AUTRE version est ignorée, pas migrée à la volée: un bilan
 * est un artefact daté d'une semaine révolue, et le réinterpréter sous des
 * règles neuves produirait un texte que personne n'a jamais calculé. Une
 * semaine sans bilan lisible n'a pas de bloc — c'est la bonne dégradation.
 */
export const WEEK_REVIEW_FACTS_VERSION = "week_review_v1" as const;

// ---------------------------------------------------------------------------
// LES ENTRÉES — des faits, et rien qui ressemble à un jugement
// ---------------------------------------------------------------------------

/**
 * Un `protocol_events` de la semaine, réduit à ce que le bilan regarde.
 *
 * `foodGroups` est déjà DÉDUPLIQUÉ par fait par l'appelant: un plat qui nomme
 * deux fois les légumes verts (la colonne `food_group_ref` ET un composant de
 * `recognized`) est UNE observation, pas deux. Sans cette déduplication, la
 * richesse du parsing d'un fait ferait monter son compte — c'est-à-dire qu'un
 * élève serait crédité pour la qualité de la reconnaissance, pas pour ce qu'il
 * a mangé.
 */
export interface WeekFactInput {
  /** `local_date` — la date du jour où ça se mangeait, jamais `occurred_at`. */
  localDate: string;
  /** Les groupes que ce fait nomme. Vide est le cas le plus courant. */
  foodGroups: readonly string[];
  /** `portion_band`, ou null (la quasi-totalité des faits non-photo). */
  portionBand: string | null;
  /**
   * FF-009 — `protocol_events.source`, tel quel. Sert UNIQUEMENT à séparer les
   * trois comptes; il n'entre dans aucun jugement d'alignement.
   */
  source?: string | null;
  /**
   * FF-009 — `protocol_events.plan_relation`. `null` = inconnu, et `null` ne
   * devient jamais `as_planned`.
   */
  planRelation?: string | null;
}

export interface WeekReviewInput {
  /** Le lundi de la semaine, en date locale de l'élève. */
  weekStart: string;
  /** Le dernier jour COUVERT, inclus. C'est le jour de l'envoi, pas dimanche. */
  weekEnd: string;
  /** Les dates de la fenêtre, dans l'ordre. L'appelant les résout. */
  weekDates: readonly string[];
  facts: readonly WeekFactInput[];
  /** Les taps du soir de la semaine (`student_daily_checkins`). */
  pulses: ReadonlyArray<{ overall: string; axis: string | null }>;
  /**
   * Le mapping du coach, DÉJÀ compilé et DÉJÀ filtré sur l'objectif de cet
   * élève (`loadPublishedProtocol` lit `student_goals.goal` lui-même, et c'est
   * délibéré: un argument est un argument qu'un appelant oubliera, et le bilan
   * lirait alors la méthode écrite pour un autre objectif).
   */
  rules: readonly CompiledCommitment[];
  /** `student_goals.goal`, pour le bloc. Jamais utilisé pour filtrer ici. */
  goal: string | null;
  /**
   * Le groupe sur lequel le bilan de la semaine PRÉCÉDENTE a interrogé.
   *
   * Il est exclu du choix de cette semaine, et ce n'est pas de la politesse:
   * reposer la même question sept jours plus tard à quelqu'un qui a déjà
   * répondu est la définition du harcèlement de mesure, et c'est le profil qui
   * coupe les relances (cf. le repli sur silence de `daily_pulse.ts`).
   */
  previouslyAskedGroup: string | null;
}

// ---------------------------------------------------------------------------
// LA LECTURE — la sortie, et le contenu exact de `week_facts`
// ---------------------------------------------------------------------------

export interface WeekCoverage {
  /** Jours de la fenêtre. 7 en régime nominal. */
  daysInWindow: number;
  /** Jours portant AU MOINS UN fait. */
  observedDays: number;
  /** Jours portant au moins `LOGGED_DAY_MIN_EVENTS` faits. La vraie mesure. */
  loggedDays: number;
  totalFacts: number;
  /** `loggedDays >= LOGGING_COVERAGE_MIN_DAYS`. LE seuil, et il existait déjà. */
  sufficient: boolean;
}

/**
 * Ce qu'une ligne de méthode du coach est devenue cette semaine.
 *
 * `honoured` / `short` / `absent` / `over` / `unknown` — cinq états, et le
 * cinquième n'est pas un raté du calcul: c'est ce qu'on répond quand la règle
 * n'est pas mesurable avec ce qu'on a (« à chaque repas » sur des faits qui ne
 * portent pas de repas). Le dire vaut mieux que produire un verdict que la
 * donnée ne soutient pas.
 */
export const ALIGNMENT_STATUSES = [
  "honoured",
  "short",
  "absent",
  "over",
  "unknown",
] as const;
export type AlignmentStatus = (typeof ALIGNMENT_STATUSES)[number];

export type AlignmentAsk =
  /** « au moins N portions sur la fenêtre », toutes origines confondues. */
  | { kind: "at_least"; portions: number; per: "window" | "day" | "week" }
  /** « au plus N ». */
  | { kind: "at_most"; portions: number; per: "window" | "day" | "week" }
  /** « évite ». Pas de nombre: l'évaluateur d'évitement n'en lit aucun. */
  | { kind: "avoid" }
  /** « à chaque repas » — non mesurable ici, seul `absent` est décidable. */
  | { kind: "every_meal" };

export interface AlignmentItem {
  group: FoodGroupRef;
  /** Le mot du COACH quand il en a posé un (`coach_terms`), sinon le label. */
  label: string;
  ask: AlignmentAsk;
  /** Faits de la fenêtre qui nomment ce groupe. */
  seen: number;
  /** Jours DISTINCTS où il apparaît. `seen` peut le dépasser. */
  daysSeen: number;
  status: AlignmentStatus;
  /** Le « pourquoi » du coach, verbatim, quand il l'a écrit. */
  rationale: string | null;
  /** `core` pèse dans le choix de la question. */
  priority: string;
}

export type WeekReviewBranch =
  /** Sous le seuil de couverture: on ne lit pas la semaine alimentaire. */
  | "insufficient_data"
  /** Le coach n'a pas de mapping applicable: on compte, on ne compare pas. */
  | "no_method"
  | "on_track"
  | "mixed"
  | "off_track";

export interface WeekReviewQuestion {
  group: FoodGroupRef;
  label: string;
  /** `absent` (jamais vu) ou `short` (vu, sous la demande). */
  status: Extract<AlignmentStatus, "absent" | "short">;
  rationale: string | null;
}

/**
 * FF-009 — LES TROIS COMPTES, ET ILS NE SE SOMMENT JAMAIS.
 *
 * Une coche est exacte, une photo est biaisée, un hors-plan est autre chose.
 * Fondus en « repas suivis cette semaine », ils donnent un chiffre que personne
 * en aval ne peut plus défaire, et que le coach lira comme un fait (R4).
 *
 * ⚠️ `null` SUR UNE LECTURE ANCIENNE, ET C'EST DÉLIBÉRÉ. Les bilans gelés avant
 * FF-009 ne portent pas ce bloc. Le lire à zéro affirmerait « aucune photo,
 * aucune coche cette semaine-là », ce qui est faux. Absent, il dit « je ne sais
 * pas comment cette semaine se répartissait » — et aucune surface n'imprime un
 * zéro qu'elle n'a pas compté. C'est ce qui permet d'AJOUTER ce bloc sans
 * bumper `WEEK_REVIEW_FACTS_VERSION`: une version neuve rendrait illisibles
 * tous les gels existants, et la conversation perdrait une semaine entière de
 * chiffres citables pour un champ purement additif.
 */
export interface WeekEvidenceSplit {
  /** Faits que l'élève a rattachés au plan (coche d'un plat prévu). */
  asPlanned: number;
  /** Faits marqués hors plan (`plan_relation='off_plan'`). */
  offPlan: number;
  /** Faits venus d'une photo (`source='photo'`). */
  photo: number;
}

export interface WeekReviewReading {
  version: typeof WEEK_REVIEW_FACTS_VERSION;
  window: { start: string; end: string; days: number };
  coverage: WeekCoverage;
  /** FF-009 — voir `WeekEvidenceSplit`. `null` sur un gel antérieur à la fiche. */
  evidence: WeekEvidenceSplit | null;
  portions: PortionBandSummary;
  livability: LivabilitySummary;
  alignment: readonly AlignmentItem[];
  /** Règles du coach qu'on n'a PAS su juger (horaires, créneaux). Comptées. */
  unevaluatedRules: number;
  branch: WeekReviewBranch;
  question: WeekReviewQuestion | null;
  goal: string | null;
}

// ---------------------------------------------------------------------------
// LES SEUILS — nommés, parce qu'un seuil anonyme est une opinion cachée
// ---------------------------------------------------------------------------

/**
 * Part des jours OBSERVÉS où un groupe encouragé doit apparaître pour qu'on
 * dise « honoré » plutôt que « en dessous ».
 *
 * ⚠️ CE SEUIL NE DÉCIDE QUE D'UN MOT, JAMAIS D'UN CHIFFRE. Le texte rendu
 * énonce toujours les comptes bruts (« vu 2 des 5 jours que j'ai vus »), donc
 * l'élève peut contester l'adjectif sans que la donnée bouge. C'est la seule
 * forme sous laquelle un seuil arbitraire est acceptable ici: mettre 0,5 ou
 * 0,6 change une étiquette, pas une mesure.
 */
export const ENCOURAGED_HONOURED_MIN_SHARE = 0.5;

/** Part des lignes jugées qui doivent être honorées pour dire « on_track ». */
export const ON_TRACK_MIN_SHARE = 0.8;
/** En dessous, c'est « off_track ». Entre les deux, « mixed ». */
export const MIXED_MIN_SHARE = 0.4;

// ---------------------------------------------------------------------------
// LE CALCUL
// ---------------------------------------------------------------------------

function cleanToken(value: unknown): string {
  return String(value ?? "").trim();
}

const FOOD_GROUP_SET: ReadonlySet<string> = new Set(FOOD_GROUP_REFS);

/**
 * Les observations par groupe: combien de faits, sur combien de jours.
 *
 * R7 sur le vocabulaire: un groupe hors liste est IGNORÉ et non compté. Ce
 * n'est pas un `throw` parce que la source est un jsonb de reconnaissance —
 * la seule chose qu'un modèle de vision puisse produire de neuf est un slug
 * inconnu, et faire échouer le bilan de la semaine entière pour ça punirait
 * l'élève d'un bug de prompt. Ce qui est écrit en base, lui, est contraint par
 * la FK `food_groups`.
 */
function observeGroups(
  facts: readonly WeekFactInput[],
): Map<string, { seen: number; days: Set<string> }> {
  const out = new Map<string, { seen: number; days: Set<string> }>();
  for (const fact of facts) {
    const date = cleanToken(fact.localDate);
    // Déduplication PAR FAIT: voir l'en-tête de `WeekFactInput`.
    const groups = new Set(
      (fact.foodGroups ?? [])
        .map(cleanToken)
        .filter((g) => g !== "" && FOOD_GROUP_SET.has(g)),
    );
    for (const group of groups) {
      const entry = out.get(group) ?? { seen: 0, days: new Set<string>() };
      entry.seen += 1;
      if (date) entry.days.add(date);
      out.set(group, entry);
    }
  }
  return out;
}

/** Faits par date locale — le dénominateur de couverture. */
function countByDate(
  facts: readonly WeekFactInput[],
  weekDates: readonly string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const date of weekDates) counts.set(date, 0);
  for (const fact of facts) {
    const date = cleanToken(fact.localDate);
    // Hors fenêtre: ignoré. Un fait daté d'ailleurs n'appartient pas à cette
    // semaine, et le rattacher au plus proche fabriquerait une couverture.
    if (!counts.has(date)) continue;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return counts;
}

export function computeCoverage(
  facts: readonly WeekFactInput[],
  weekDates: readonly string[],
): WeekCoverage {
  const counts = countByDate(facts, weekDates);
  let observedDays = 0;
  let loggedDays = 0;
  let totalFacts = 0;
  for (const n of counts.values()) {
    totalFacts += n;
    if (n >= 1) observedDays++;
    if (n >= LOGGED_DAY_MIN_EVENTS) loggedDays++;
  }
  return {
    daysInWindow: weekDates.length,
    observedDays,
    loggedDays,
    totalFacts,
    sufficient: loggedDays >= LOGGING_COVERAGE_MIN_DAYS,
  };
}

/**
 * Une ligne de méthode compilée, jugée contre la semaine.
 *
 * Rend `null` pour les gabarits qu'on ne sait pas juger avec ces faits —
 * « pas après 20 h », « au petit-déjeuner ». Les faits portent bien un
 * `slot_key` et un `occurred_at`, mais la très grande majorité arrive sans
 * créneau (une photo n'en pose pas), et un verdict d'horaire rendu sur le quart
 * des faits serait faux dans le sens qui accuse. Ils sont COMPTÉS
 * (`unevaluatedRules`) plutôt que passés sous silence.
 */
/**
 * Le nom LISIBLE d'un groupe.
 *
 * `CompiledCommitment.title` porte le mot du COACH quand il en a posé un
 * (`coach_terms` → « green volume »), et RETOMBE SUR LE SLUG BRUT sinon. Mesuré
 * en run réel le 2026-08-06 sur un protocole de coach existant: le bilan écrivait
 * « sweetened_beverage: 0 of the 5 days I saw », c'est-à-dire un identifiant de
 * base de données dans une bulle de conversation.
 *
 * On ne « corrige » donc que le cas du repli — titre égal au slug — pour ne
 * jamais écraser le vocabulaire du coach, qui est la moitié du produit. La
 * table de labels ne jette pas ici: un slug hors vocabulaire ressort tel quel
 * plutôt que de faire échouer le bilan d'une semaine entière.
 */
function readableLabel(rule: CompiledCommitment): string {
  const title = cleanToken(rule.title);
  const group = cleanToken(rule.food_group_ref);
  if (title && title !== group) return title;
  return EN_LABELS.food_groups[group] ?? group;
}

function judgeRule(
  rule: CompiledCommitment,
  observed: { seen: number; days: number },
  loggedDays: number,
): AlignmentItem | null {
  const preview = rule.preview;
  const base = {
    group: rule.food_group_ref,
    label: readableLabel(rule),
    seen: observed.seen,
    daysSeen: observed.days,
    rationale: cleanToken(rule.student_instruction) || null,
    priority: String(rule.priority ?? "secondary"),
  };

  if (preview.kind === "encourage") {
    // « au moins 1 portion par jour » lu sur les jours qu'on a VUS. Le seuil
    // ne décide que de l'étiquette; les comptes partent bruts dans le bloc.
    const ask: AlignmentAsk = { kind: "at_least", portions: preview.perDay, per: "day" };
    if (observed.seen === 0) return { ...base, ask, status: "absent" };
    if (loggedDays === 0) return { ...base, ask, status: "unknown" };
    const share = observed.days / loggedDays;
    return {
      ...base,
      ask,
      status: share >= ENCOURAGED_HONOURED_MIN_SHARE ? "honoured" : "short",
    };
  }

  if (preview.kind === "portions") {
    const per = preview.period === "week" ? "week" : "day";
    if (preview.direction === "at_least") {
      const ask: AlignmentAsk = { kind: "at_least", portions: preview.portions, per };
      // Une cible JOURNALIÈRE se ramène aux jours observés, jamais à sept: on
      // ne peut pas réclamer des portions pour des journées dont on ne sait
      // rien. Une cible HEBDOMADAIRE, elle, garde son nombre tel quel — c'est
      // ce que le coach a écrit, et le bloc dira sur combien de jours on a vu.
      const required = per === "week"
        ? preview.portions
        : preview.portions * loggedDays;
      if (observed.seen === 0) return { ...base, ask, status: "absent" };
      if (required <= 0) return { ...base, ask, status: "unknown" };
      return {
        ...base,
        ask,
        status: observed.seen >= required ? "honoured" : "short",
      };
    }
    // `at_most`: le dépassement est une OBSERVATION DIRECTE, pas une déduction.
    // Il ne devient jamais une question — voir l'en-tête, point 1.
    const ask: AlignmentAsk = { kind: "at_most", portions: preview.portions, per };
    const ceiling = per === "week" ? preview.portions : preview.portions * loggedDays;
    return {
      ...base,
      ask,
      status: observed.seen > ceiling ? "over" : "honoured",
    };
  }

  if (preview.kind === "every_meal") {
    // SEUL `absent` EST DÉCIDABLE. Un fait ne dit pas combien de repas la
    // journée portait, donc « à chaque repas » n'est ni vérifiable ni
    // réfutable — sauf quand le groupe n'apparaît pas du tout.
    const ask: AlignmentAsk = { kind: "every_meal" };
    return { ...base, ask, status: observed.seen === 0 ? "absent" : "unknown" };
  }

  if (preview.kind === "discourage" || preview.kind === "exclude") {
    const ask: AlignmentAsk = { kind: "avoid" };
    return { ...base, ask, status: observed.seen > 0 ? "over" : "honoured" };
  }

  // `not_after`, `at_slot`: hors de portée de ce calcul. Comptés par l'appelant.
  return null;
}

/**
 * Le tri des lignes jugées. DÉTERMINISTE, et c'est une exigence: deux calculs
 * de la même semaine doivent rendre le même bilan, sinon ce n'est pas une
 * preuve — la même raison qui fait trier les axes de `summarizeLivability`.
 */
function sortAlignment(items: AlignmentItem[]): AlignmentItem[] {
  const rank: Record<AlignmentStatus, number> = {
    absent: 0,
    short: 1,
    over: 2,
    honoured: 3,
    unknown: 4,
  };
  return [...items].sort((a, b) =>
    rank[a.status] - rank[b.status] ||
    (a.priority === b.priority ? 0 : a.priority === "core" ? -1 : 1) ||
    (a.group < b.group ? -1 : a.group > b.group ? 1 : 0)
  );
}

/**
 * LA QUESTION — au plus une, et sur ce qui manque.
 *
 * Ordre de choix, et chaque cran est une décision produit:
 *   1. `absent` avant `short`: « je n'en ai vu aucun » est une observation
 *      solide; « j'en ai vu moins que » dépend d'un seuil et d'un
 *      sous-déclarage possible. On interroge ce dont on est sûr.
 *   2. `core` avant `secondary`: la hiérarchie vient du coach, pas de nous.
 *   3. l'ordre alphabétique du slug pour trancher: déterminisme.
 *
 * Ce qui n'est JAMAIS candidat: `over` (un dépassement se constate),
 * `honoured`, `unknown`, et le groupe de la semaine dernière.
 */
export function pickWeekQuestion(
  alignment: readonly AlignmentItem[],
  previouslyAskedGroup: string | null,
): WeekReviewQuestion | null {
  const previous = cleanToken(previouslyAskedGroup);
  const candidates = alignment
    .filter((item) => item.status === "absent" || item.status === "short")
    .filter((item) => item.group !== previous);
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) =>
    (a.status === b.status ? 0 : a.status === "absent" ? -1 : 1) ||
    (a.priority === b.priority ? 0 : a.priority === "core" ? -1 : 1) ||
    (a.group < b.group ? -1 : a.group > b.group ? 1 : 0)
  );
  const pick = sorted[0];
  return {
    group: pick.group,
    label: pick.label,
    status: pick.status as "absent" | "short",
    rationale: pick.rationale,
  };
}

export function computeWeekReview(input: WeekReviewInput): WeekReviewReading {
  const weekDates = [...(input.weekDates ?? [])].map(cleanToken).filter(Boolean);
  const facts = input.facts ?? [];
  const coverage = computeCoverage(facts, weekDates);
  const portions = summarizePortionBands(facts.map((f) => f.portionBand ?? null));
  const livability = summarizeLivability(input.pulses ?? []);

  const observed = observeGroups(facts);
  const judged: AlignmentItem[] = [];
  let unevaluatedRules = 0;
  for (const rule of input.rules ?? []) {
    const group = cleanToken(rule.food_group_ref);
    const seen = observed.get(group) ?? { seen: 0, days: new Set<string>() };
    const item = judgeRule(rule, { seen: seen.seen, days: seen.days.size }, coverage.loggedDays);
    if (item === null) {
      unevaluatedRules++;
      continue;
    }
    judged.push(item);
  }
  const alignment = sortAlignment(judged);

  // ── LA BRANCHE ────────────────────────────────────────────────────────────
  // La couverture PASSE AVANT tout le reste, et il n'y a pas de demi-mesure:
  // sous le seuil, on ne lit pas la semaine alimentaire du tout. Un bilan bâti
  // sur deux photos ressemble exactement à un bilan bâti sur douze, et c'est
  // ainsi qu'un élève se fait dire qu'il ne mange pas de légumes parce qu'il
  // n'a rien photographié.
  let branch: WeekReviewBranch;
  if (!coverage.sufficient) {
    branch = "insufficient_data";
  } else if (alignment.length === 0) {
    branch = "no_method";
  } else {
    // `unknown` sort du dénominateur — la règle du contrat, appliquée ici
    // aussi: on ne compte pas ce qu'on n'a pas su juger.
    const decidable = alignment.filter((i) => i.status !== "unknown");
    if (decidable.length === 0) {
      branch = "no_method";
    } else {
      const honoured = decidable.filter((i) => i.status === "honoured").length;
      const share = honoured / decidable.length;
      branch = share >= ON_TRACK_MIN_SHARE
        ? "on_track"
        : share >= MIXED_MIN_SHARE
        ? "mixed"
        : "off_track";
    }
  }

  // Pas de question hors des branches qui en supportent une. `on_track` n'en
  // pose PAS: c'est la moitié du produit — quand tout va, on le dit et on se
  // tait. Une question de politesse à la fin d'un bon bilan est la taxe
  // quotidienne du tap du soir, déguisée en intérêt.
  const question = branch === "mixed" || branch === "off_track"
    ? pickWeekQuestion(alignment, input.previouslyAskedGroup)
    : null;

  // FF-009 — les trois comptes, calculés séparément et rendus séparément.
  const evidence: WeekEvidenceSplit = {
    asPlanned: input.facts.filter((f) => f.planRelation === "as_planned").length,
    offPlan: input.facts.filter((f) => f.planRelation === "off_plan").length,
    photo: input.facts.filter((f) => f.source === "photo").length,
  };

  return {
    version: WEEK_REVIEW_FACTS_VERSION,
    evidence,
    window: {
      start: cleanToken(input.weekStart),
      end: cleanToken(input.weekEnd),
      days: weekDates.length,
    },
    coverage,
    portions,
    livability,
    alignment,
    unevaluatedRules,
    branch,
    question,
    goal: cleanToken(input.goal) || null,
  };
}

// ---------------------------------------------------------------------------
// LA SÉRIALISATION — `weekly_reviews.week_facts`
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Relit une lecture stockée, ou `null`.
 *
 * NE JETTE JAMAIS, et rend `null` au moindre doute — version inconnue, forme
 * cassée, fenêtre absente. L'appelant n'injecte alors aucun bloc et ne compose
 * aucun bilan, ce qui est exactement la dégradation qu'on veut: le pire cas
 * d'un bilan est un CHIFFRE FAUX dans la bulle, indiscernable d'un vrai. Même
 * asymétrie que `doctrine_loader` et `planned_dish_io`.
 */
export function parseWeekReview(raw: unknown): WeekReviewReading | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== WEEK_REVIEW_FACTS_VERSION) return null;
  const window = raw.window;
  if (!isRecord(window)) return null;
  const coverage = raw.coverage;
  if (!isRecord(coverage)) return null;
  const portions = raw.portions;
  if (!isRecord(portions)) return null;
  const livability = raw.livability;
  if (!isRecord(livability)) return null;
  if (!Array.isArray(raw.alignment)) return null;

  const alignment: AlignmentItem[] = [];
  for (const entry of raw.alignment) {
    if (!isRecord(entry)) return null;
    const group = cleanToken(entry.group);
    const status = cleanToken(entry.status) as AlignmentStatus;
    // R7 sur ce qui a été ÉCRIT par nous: un token hors vocabulaire dans notre
    // propre jsonb veut dire que la forme a changé sans que la version bouge.
    // On rend `null` plutôt que d'en tirer une phrase.
    if (!FOOD_GROUP_SET.has(group)) return null;
    if (!(ALIGNMENT_STATUSES as readonly string[]).includes(status)) return null;
    if (!isRecord(entry.ask)) return null;
    alignment.push({
      group: group as FoodGroupRef,
      label: cleanToken(entry.label) || group,
      ask: entry.ask as unknown as AlignmentAsk,
      seen: num(entry.seen),
      daysSeen: num(entry.daysSeen),
      status,
      rationale: entry.rationale == null ? null : String(entry.rationale),
      priority: cleanToken(entry.priority) || "secondary",
    });
  }

  const questionRaw = raw.question;
  let question: WeekReviewQuestion | null = null;
  if (isRecord(questionRaw)) {
    const group = cleanToken(questionRaw.group);
    const status = cleanToken(questionRaw.status);
    if (!FOOD_GROUP_SET.has(group)) return null;
    if (status !== "absent" && status !== "short") return null;
    question = {
      group: group as FoodGroupRef,
      label: cleanToken(questionRaw.label) || group,
      status,
      rationale: questionRaw.rationale == null ? null : String(questionRaw.rationale),
    };
  }

  // FF-009 — bloc ABSENT sur un gel antérieur à la fiche: on rend `null`, pas
  // des zéros. Un zéro imprimé serait une affirmation qu'on n'a pas mesurée.
  const rawEvidence = raw.evidence;
  const evidence: WeekEvidenceSplit | null = isRecord(rawEvidence)
    ? {
      asPlanned: num(rawEvidence.asPlanned),
      offPlan: num(rawEvidence.offPlan),
      photo: num(rawEvidence.photo),
    }
    : null;

  return {
    version: WEEK_REVIEW_FACTS_VERSION,
    evidence,
    window: {
      start: cleanToken(window.start),
      end: cleanToken(window.end),
      days: num(window.days),
    },
    coverage: {
      daysInWindow: num(coverage.daysInWindow),
      observedDays: num(coverage.observedDays),
      loggedDays: num(coverage.loggedDays),
      totalFacts: num(coverage.totalFacts),
      sufficient: coverage.sufficient === true,
    },
    portions: {
      total: num(portions.total),
      small: num(portions.small),
      moderate: num(portions.moderate),
      large: num(portions.large),
      unclear: num(portions.unclear),
      decidable: num(portions.decidable),
    },
    livability: {
      band: cleanToken(livability.band) as LivabilitySummary["band"],
      taps: num(livability.taps),
      good: num(livability.good),
      mixed: num(livability.mixed),
      hard: num(livability.hard),
      dominantAxis: livability.dominantAxis == null
        ? null
        : String(livability.dominantAxis),
    },
    alignment,
    unevaluatedRules: num(raw.unevaluatedRules),
    branch: cleanToken(raw.branch) as WeekReviewBranch,
    question,
    goal: raw.goal == null ? null : String(raw.goal),
  };
}

// ---------------------------------------------------------------------------
// LE RENDU DÉTERMINISTE — et il part TOUJOURS
// ---------------------------------------------------------------------------

/**
 * « 3 of the 5 days I saw ». La formule qui porte le dénominateur honnête, et
 * elle est centralisée parce qu'elle est la promesse du module: aucune phrase
 * de ce fichier ne compte sur sept jours.
 */
function seenOn(item: AlignmentItem, coverage: WeekCoverage): string {
  return `${item.daysSeen} of the ${coverage.loggedDays} days I saw`;
}

function askText(ask: AlignmentAsk): string {
  switch (ask.kind) {
    case "at_least":
      return ask.per === "week"
        ? `at least ${ask.portions} a week`
        : `at least ${ask.portions} a day`;
    case "at_most":
      return ask.per === "week"
        ? `at most ${ask.portions} a week`
        : `at most ${ask.portions} a day`;
    case "avoid":
      return "kept off the plate";
    case "every_meal":
      return "at every meal";
  }
}

/**
 * Le texte qui part quand la composition ne peut pas — pas de doctrine, modèle
 * en panne, ceinture qui refuse.
 *
 * ⚠️ IL N'EST JAMAIS `null`, contrairement au fait du soir. La différence est
 * produit et elle est nette: le soir, une journée sans fait n'a rien à dire et
 * le silence est la bonne réponse. Ici l'élève VIENT de remplir un formulaire —
 * un silence après ça dit « ça n'a servi à rien », et c'est précisément le
 * message qu'on est en train de supprimer. Le nombre de champs ne change pas la
 * règle: en B2C il n'y en a plus que deux (R4), et deux champs remplis méritent
 * la même réponse que huit.
 */
export function renderDeterministicWeekReview(reading: WeekReviewReading): string {
  const { coverage, branch, alignment, question } = reading;

  if (branch === "insufficient_data") {
    // Aucun reproche, aucune consigne: on dit ce qu'on a, et on s'arrête.
    // « Tu n'as pas assez logué » est un reproche passif, et le dépôt a déjà
    // tranché contre (voir `daily_recap.ts`, « ce qui était prévu n'est pas un
    // sol »).
    const seen = coverage.observedDays === 1
      ? "1 day of your week"
      : `${coverage.observedDays} days of your week`;
    return `Thanks — that's saved. I only have ${seen} on the food side, ` +
      `so I'll leave the eating out of it this time.`;
  }

  if (branch === "no_method" || alignment.length === 0) {
    const n = coverage.totalFacts;
    const meals = n === 1 ? "1 meal" : `${n} meals`;
    // ⚠️ AUCUN DÉICTIQUE TEMPOREL — pas de « cette semaine ». Le formulaire
    // peut être rempli le mardi suivant, et ce module n'a pas d'horloge (il
    // n'en veut pas). Une phrase sans « cette » est vraie quand qu'on la lise;
    // la fenêtre, elle, est portée par le bloc de contexte, qui a les dates.
    return `Thanks — that's saved. You logged ${meals} across ` +
      `${coverage.loggedDays} days.`;
  }

  // ── ON N'OUVRE JAMAIS SUR UN ÉVITEMENT TENU ────────────────────────────────
  // Mesuré en run réel le 2026-08-06: la première ligne honorée était
  // « sweetened_beverage », et le bilan s'ouvrait sur « 0 des 5 jours que j'ai
  // vus, c'est ce que ton coach demande ». Deux défauts en une phrase — un
  // décompte à zéro se lit comme un échec, et féliciter quelqu'un de ne pas
  // avoir bu de soda est creux. L'ouverture porte donc ce que l'élève A FAIT.
  const honouredDo = alignment.filter(
    (i) => i.status === "honoured" && i.ask.kind !== "avoid",
  );
  const gaps = alignment.filter((i) => i.status === "absent" || i.status === "short");

  const parts: string[] = ["Thanks — that's saved."];

  if (honouredDo.length > 0) {
    const first = honouredDo[0];
    parts.push(
      `${first.label}: ${seenOn(first, coverage)}, which is what your coach ` +
        `asks for (${askText(first.ask)}).`,
    );
  }

  if (question) {
    const item = alignment.find((i) => i.group === question.group);
    const detail = item && item.status === "short"
      ? `${item.label} came up on ${seenOn(item, coverage)}`
      : `I didn't see ${question.label} at all`;
    parts.push(`${detail}. What made that one hard?`);
  } else if (gaps.length === 0 && honouredDo.length > 0) {
    parts.push("Nothing your coach asks for went missing.");
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// LE BLOC DE CONTEXTE — celui qui vit dans la conversation toute la semaine
// ---------------------------------------------------------------------------

/**
 * Le bloc injecté à chaque tour de l'élève, à côté de la doctrine.
 *
 * ── LA FENÊTRE EST ÉCRITE EN TÊTE, ET CE N'EST PAS DÉCORATIF ──────────────
 * Ce bloc survit toute la semaine SUIVANTE. Sans ses dates, un modèle dirait
 * « cette semaine tu as vu du poisson deux fois » à propos de la semaine
 * d'avant — un chiffre exact rattaché à la mauvaise période, c'est-à-dire un
 * chiffre faux que rien ne permet de contester.
 *
 * ── CE QU'IL N'AUTORISE PAS ──────────────────────────────────────────────
 * Il DONNE des nombres, donc il doit aussi donner leur mode d'emploi: pas de
 * pourcentage, pas de score, le dénominateur est ce qu'on a vu, et le silence
 * n'est pas un échec. Ces trois phrases ne sont pas de la politesse envers le
 * modèle: ce sont les trois glissements que ce dépôt a déjà mesurés.
 */
export function weekReviewPromptBlock(
  reading: WeekReviewReading,
  biofeedback?: Readonly<Record<string, number>> | null,
): string {
  const lines: string[] = [];
  const { coverage, window, alignment, livability, portions } = reading;

  lines.push("== THE STUDENT'S LAST REVIEWED WEEK — COUNTED, NOT SCORED ==");
  lines.push("");
  lines.push(
    `This is the week of ${window.start} to ${window.end}. It is NOT necessarily ` +
      "the week that is running now — never say 'this week' about these numbers " +
      "unless today falls inside that range.",
  );
  lines.push("");
  lines.push("HOW TO USE THESE NUMBERS:");
  lines.push(
    `- The denominator is what the student REPORTED: ${coverage.loggedDays} days ` +
      `out of ${coverage.daysInWindow}, ${coverage.totalFacts} meals logged in total. ` +
      "Days with nothing reported are unknown, not failures — never count them as missed.",
  );
  lines.push(
    "- These are counts of declared facts against the coach's method. They are NOT " +
      "adherence, NOT a percentage, NOT a score and NOT a streak. Never turn them into one.",
  );
  lines.push(
    "- Never state a number that is not written in this block, and never re-add them together.",
  );

  if (!coverage.sufficient) {
    lines.push("");
    lines.push(
      "COVERAGE IS BELOW THE READING THRESHOLD. There is no defensible reading of " +
        "what this student ate that week. Do not describe their eating, do not " +
        "guess at a direction, and do not tell them to log more.",
    );
    return lines.join("\n");
  }

  if (alignment.length > 0) {
    lines.push("");
    lines.push("THE COACH'S METHOD, LINE BY LINE, AGAINST THAT WEEK:");
    for (const item of alignment) {
      const facts = `seen ${item.seen} time(s), on ${item.daysSeen} of the ` +
        `${coverage.loggedDays} reported days`;
      const verdict = item.status === "unknown"
        ? "not decidable from what was reported"
        : item.status;
      lines.push(`- ${item.label} (${askText(item.ask)}) — ${facts} => ${verdict}`);
      if (item.rationale) {
        // Le « pourquoi » du coach, verbatim. C'est LUI qui doit sortir quand
        // l'élève demande pourquoi ça compte — pas la culture générale du
        // modèle. Un agent qui explique la nutrition à sa façon enseigne
        // contre le coach dont il porte le nom.
        lines.push(`  their coach's reason, verbatim: "${item.rationale}"`);
      }
    }
  }

  if (reading.unevaluatedRules > 0) {
    lines.push("");
    lines.push(
      `${reading.unevaluatedRules} of the coach's rules are about timing or meal ` +
        "slots and were NOT looked at. Say so if asked; do not judge them.",
    );
  }

  if (portions.total > 0) {
    lines.push("");
    lines.push(
      `PLATES SEEN: ${portions.total} (${portions.small} small, ${portions.moderate} ` +
        `moderate, ${portions.large} large, ${portions.unclear} unclear). ` +
        "Plate size is an observation, never a verdict, and never a calorie.",
    );
  }

  if (livability.band !== "unknown") {
    lines.push("");
    lines.push(
      `HOW LIVEABLE IT FELT: ${livability.taps} evening taps — ${livability.good} good, ` +
        `${livability.mixed} mixed, ${livability.hard} hard (${livability.band})` +
        (livability.dominantAxis ? `; the axis that gave way most: ${livability.dominantAxis}` : "") +
        ".",
    );
  }

  // R4 — PAS D'AXES EST NORMAL, et le bloc n'en dit alors rien du tout. Ils ne
  // sont collectés que là où quelqu'un les lit (la synthèse du coach); en B2C
  // personne ne les lit, donc l'écran ne les demande pas. Aucune phrase de
  // remplacement ici: « ils n'ont pas rempli les six axes » inviterait le modèle
  // à réclamer une donnée que le produit a décidé de ne plus demander.
  const bio = biofeedback ?? null;
  if (bio && Object.keys(bio).length > 0) {
    const axes = Object.keys(bio).sort().map((k) => `${k} ${bio[k]}/5`).join(", ");
    lines.push("");
    lines.push(`WHAT THEY RATED THEMSELVES, 1 to 5: ${axes}.`);
  }

  if (reading.question) {
    lines.push("");
    lines.push(
      `YOU ALREADY ASKED THEM ABOUT: ${reading.question.label}. If they come back ` +
        "to it, take the answer as the answer to that question. Do not ask it again, " +
        "and do not open a second one.",
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// LE PROMPT DU BILAN
// ---------------------------------------------------------------------------

/**
 * Plus long que le fait du soir (220), et beaucoup plus court qu'un rapport.
 *
 * La raison est la dissymétrie qui justifie tout le lot: ce message-ci est
 * DEMANDÉ — l'élève vient de remplir un formulaire et attend quelque chose en
 * retour. Il a donc droit à plus de deux phrases. Mais il arrive dans une bulle
 * de conversation, pas dans un tableau de bord: au-delà de quatre phrases on
 * écrit un bilan que personne ne lit jusqu'au bout, et la question de la fin —
 * la seule partie qui appelle une réponse — se perd.
 */
export const WEEK_REVIEW_MAX_CHARS = 460;
export const WEEK_REVIEW_MAX_SENTENCES = 4;

/** Ce que le modèle a le droit de savoir. Rien d'autre n'existe. */
export function describeWeekReview(reading: WeekReviewReading): string {
  const lines: string[] = [];
  const { coverage, alignment, question, branch, window } = reading;

  lines.push(`- The week being reviewed: ${window.start} to ${window.end}.`);
  lines.push(
    `- Days the student reported food on: ${coverage.loggedDays} of ${coverage.daysInWindow}.`,
  );
  lines.push(`- Meals logged in total that week: ${coverage.totalFacts}.`);

  if (branch === "insufficient_data") {
    lines.push(
      "- THERE IS NO READING OF THEIR EATING. Coverage is below the threshold. " +
        "You know nothing about what they ate and must not imply that you do.",
    );
    return lines.join("\n");
  }

  if (alignment.length === 0) {
    lines.push("- Their coach has no food method on file, so there is nothing to compare against.");
    return lines.join("\n");
  }

  for (const item of alignment) {
    lines.push(
      `- ${item.label}: their coach asks for ${askText(item.ask)}; ` +
        `seen ${item.seen} time(s) on ${item.daysSeen} of the ${coverage.loggedDays} ` +
        `reported days => ${item.status}` +
        (item.rationale ? ` (their coach's reason: "${item.rationale}")` : ""),
    );
  }

  if (question) {
    lines.push(
      `- THE ONE THING TO ASK ABOUT: ${question.label}. ` +
        (question.status === "absent"
          ? "It never appeared in what they reported."
          : "It appeared, but under what their coach asks for."),
    );
  } else {
    lines.push("- THERE IS NOTHING TO ASK ABOUT. Do not invent a question.");
  }

  return lines.join("\n");
}

/**
 * Le prompt système du bilan.
 *
 * Chaque interdit est adossé à une ceinture de `acceptComposedWeekReview` qui
 * le vérifie sur le texte exact. Une règle de prompt sans vérificateur est une
 * intention, et ce dépôt a assez de gardes vertes et désarmées comme ça.
 */
export function buildWeekReviewSystemPrompt(args: {
  doctrineBlock: string;
  reading: WeekReviewReading;
}): string {
  const { reading } = args;
  const wantsQuestion = reading.question !== null;

  return [
    "You are Sophia, the day-to-day voice of this student's coach.",
    "",
    "The student has just submitted their weekly check-in. They spent two minutes on it. " +
      "You are writing what comes back — the one moment in the week where they stop and look " +
      "at what they did.",
    "",
    "WHAT YOU KNOW — these facts, and nothing else exists:",
    describeWeekReview(reading),
    "",
    "HARD RULES — a message that breaks any of these is discarded, not fixed:",
    `- At most ${WEEK_REVIEW_MAX_SENTENCES} sentences and ${WEEK_REVIEW_MAX_CHARS} characters.`,
    // ⚠️ MESURÉ le 2026-08-06 sur un vrai protocole: sans cette règle le modèle
    // récite les six lignes d'affilée — « lean protein 5 times, green volume 1
    // time, refined grains 2 times, fried food 1 time, sweetened beverages 0
    // times ». C'est un tableau, pas un bilan, et personne ne le lit.
    "- Name AT MOST TWO of the lines above: the one that held up, and the one you are asking " +
      "about. Never list them all — a list is a table, not a review.",
    // Corollaire de la même mesure: le modèle citait « sweetened beverages 0 times »
    // comme un résultat. Un évitement tenu n'est pas une nouvelle, et féliciter
    // quelqu'un de ne pas avoir bu de soda est creux.
    "- Never mention a line the student successfully avoided. 'No sugary drinks' is not news " +
      "and is not worth a sentence.",
    "- Every number you state must appear in the facts above, unchanged. Never add them up, " +
      "never turn them into a percentage, never invent a total.",
    "- Never say adherence, compliance, score, streak, percentage, points, or 'on track for the month'. " +
      "These counts are what the student reported, nothing more.",
    "- The denominator is the days they reported. Days with nothing reported are unknown, " +
      "NOT missed. Never hold a silent day against them.",
    "- Do NOT praise the student, the week or the effort. No 'great week', no 'well done', " +
      "no 'proud of you', no 'keep it up'. Naming what they did IS the recognition; " +
      "an adjective on top of it is worth nothing and costs you their trust the week it goes badly.",
    "- Never comment on their weight, their body, or a measurement.",
    "- Do not tell them what to do next week. This is a reading, not an instruction.",
    wantsQuestion
      ? "- End with EXACTLY ONE question, and it must be the one named above: what made that " +
        "one thing hard. Ask it openly — you do not know the answer and you are not testing them. " +
        "Never ask why they ate something."
      : "- Ask NOTHING. There is no question to ask this week, and a polite one at the end of " +
        "a good review is a tax dressed up as interest.",
    "- Plain text only. No markdown, no bullet list, no quotation marks around the message, " +
      "no 'Sophia:' prefix.",
    "",
    "Reply with the message itself and nothing else.",
    "",
    "── THE COACH'S METHOD (their voice is the one you write in) ──",
    args.doctrineBlock,
  ].join("\n");
}

export function buildWeekReviewUserPrompt(firstName: string): string {
  const name = String(firstName ?? "").trim();
  return name
    ? `Write what comes back. The student's first name is ${name}.`
    : "Write what comes back. You do not know the student's first name — do not invent one, " +
      "and do not use a placeholder.";
}

// ---------------------------------------------------------------------------
// LA CEINTURE
// ---------------------------------------------------------------------------

/**
 * LE VOCABULAIRE QUI TRANSFORME UN COMPTE EN NOTE.
 *
 * C'est la ceinture la plus spécifique du lot, et elle porte la règle
 * `MODEL.md` §3 (« toute notion d'adhérence à une prescription individuelle »
 * est hors modèle). Le glissement n'a pas besoin d'être volontaire pour être
 * fatal: « you hit 4 out of 5 of your coach's lines — 80% » est composé de
 * nombres tous vrais, et c'est un score d'adhérence sur une prescription qui
 * n'existe pas.
 */
const ADHERENCE_LANGUAGE: readonly RegExp[] = [
  /\b\d{1,3}\s?%/,
  /\b(?:adherence|adherent|compliance|compliant)\b/i,
  /\b(?:score|scored|scoring|rating out of|grade|graded)\b/i,
  /\b(?:streak|streaks)\b/i,
  /\b(?:on|off)\s+track\s+for\b/i,
  /\bpercent(?:age)?\b/i,
  // FR — même cicatrice que le fait du soir: une garde écrite dans une seule
  // langue ne couvre pas la sortie du jour où le verrou de langue saute.
  /\b(?:observance|adh[ée]rence|score|pourcentage)\b/i,
  /\bs[ée]rie\s+de\s+\d/i,
];

/** Les noms de choses qu'on compte dans un bilan de semaine. */
const COUNTABLE = "meals?|dishes|plates?|days?|times?|portions?|servings?|photos?|logs?|" +
  "entr(?:y|ies)|weeks?";

const NUM = `\\d+|${Object.keys(NUMBER_WORDS).join("|")}`;

const COUNT_BEFORE_NOUN = new RegExp(
  `\\b(${NUM})\\b(?:\\s+\\w+){0,2}\\s+(?:${COUNTABLE})\\b`,
  "gi",
);
const COUNT_RATIO = new RegExp(
  `\\b(${NUM})\\s*(?:/|out\\s+of|of\\s+the|of)\\s*(${NUM})\\b`,
  "gi",
);

/**
 * Les nombres que le texte a le droit de porter.
 *
 * Tout ce que la lecture contient, et rien d'autre. Y compris les CIBLES du
 * coach (« au moins 2 par semaine »): un bilan qui cite ce que le coach demande
 * dit une vérité de plus, et l'interdire ferait replier des compositions
 * exactes — le défaut que `sanitizeComposedNudge` documente, « un composeur
 * mort déguisé en composeur prudent ».
 */
export function allowedWeekNumbers(reading: WeekReviewReading): Set<number> {
  const out = new Set<number>([
    reading.coverage.daysInWindow,
    reading.coverage.observedDays,
    reading.coverage.loggedDays,
    reading.coverage.totalFacts,
    reading.portions.total,
    reading.portions.small,
    reading.portions.moderate,
    reading.portions.large,
    reading.portions.unclear,
    reading.portions.decidable,
    reading.livability.taps,
    reading.livability.good,
    reading.livability.mixed,
    reading.livability.hard,
    reading.alignment.length,
    reading.unevaluatedRules,
  ]);
  for (const item of reading.alignment) {
    out.add(item.seen);
    out.add(item.daysSeen);
    if (item.ask.kind === "at_least" || item.ask.kind === "at_most") {
      out.add(item.ask.portions);
      // La cible journalière ramenée à la fenêtre observée: c'est le nombre que
      // le calcul a réellement utilisé, donc celui qu'un texte exact peut citer.
      if (item.ask.per === "day") {
        out.add(item.ask.portions * reading.coverage.loggedDays);
      }
    }
  }
  return out;
}

export type WeekReviewVerdictReason =
  | "empty"
  | "too_long"
  | "too_many_sentences"
  | "guilt_tripping"
  | "prompt_artefact"
  | "qualifies_the_week"
  | "adherence_language"
  | "missing_question"
  | "unexpected_question"
  | "too_many_questions"
  | "invented_number";

export type WeekReviewVerdict =
  | { ok: true; text: string }
  | { ok: false; reason: WeekReviewVerdictReason; detail: string };

/**
 * La ceinture complète, sur le texte EXACT que l'élève lirait.
 *
 * Rend un verdict plutôt que de lever: l'appelant a un repli déterministe et
 * doit pouvoir le prendre EN COMPTANT le motif. Une exception l'obligerait à
 * l'attraper pour ne rien en faire, ce qui finit toujours en `catch {}`.
 */
export function acceptComposedWeekReview(
  raw: string,
  reading: WeekReviewReading,
): WeekReviewVerdict {
  const text = sanitizeComposedNudge(raw);
  if (!text) return { ok: false, reason: "empty", detail: "" };

  if (text.length > WEEK_REVIEW_MAX_CHARS) {
    return { ok: false, reason: "too_long", detail: `${text.length} > ${WEEK_REVIEW_MAX_CHARS}` };
  }

  const sentences = countSentences(text);
  if (sentences > WEEK_REVIEW_MAX_SENTENCES) {
    return {
      ok: false,
      reason: "too_many_sentences",
      detail: `${sentences} > ${WEEK_REVIEW_MAX_SENTENCES}`,
    };
  }

  for (const pattern of PROMPT_ARTEFACT_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return { ok: false, reason: "prompt_artefact", detail: match[0] };
  }

  const guilt = findGuiltTripping(text);
  if (guilt.length > 0) {
    return {
      ok: false,
      reason: "guilt_tripping",
      detail: guilt.map((f) => f.matchedText).join(" | "),
    };
  }

  // La MÊME liste que le fait du soir, importée et pas recopiée. Sa condition
  // de désarmement voyage avec elle: qualifier un ALIMENT reste permis, seul le
  // bulletin sur l'élève ou la période mord.
  const verdict = findQualifyingVerdict(text);
  if (verdict) {
    return { ok: false, reason: "qualifies_the_week", detail: verdict };
  }

  for (const pattern of ADHERENCE_LANGUAGE) {
    const match = pattern.exec(text);
    if (match) return { ok: false, reason: "adherence_language", detail: match[0] };
  }

  // LA CARDINALITÉ DE LA QUESTION, dans les deux sens. Une question absente
  // quand on en attend une casse le sous-flow en silence (l'élève n'a rien à
  // quoi répondre); deux questions posent celle qu'on n'a pas choisie.
  const questionMarks = (text.match(/[?？]/g) ?? []).length;
  if (reading.question) {
    if (questionMarks === 0) {
      return { ok: false, reason: "missing_question", detail: "0" };
    }
    if (questionMarks > 1) {
      return { ok: false, reason: "too_many_questions", detail: String(questionMarks) };
    }
  } else if (questionMarks > 0) {
    return { ok: false, reason: "unexpected_question", detail: String(questionMarks) };
  }

  const allowed = allowedWeekNumbers(reading);
  for (const pattern of [COUNT_BEFORE_NOUN, COUNT_RATIO]) {
    // `lastIndex` survit à un appel sur un regex global: sans remise à zéro, le
    // second texte jugé repartirait du milieu du premier.
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      for (const token of match.slice(1)) {
        if (token === undefined) continue;
        const value = numberValue(token);
        if (value !== null && !allowed.has(value)) {
          return {
            ok: false,
            reason: "invented_number",
            detail: `${match[0].trim()} (allowed: ${[...allowed].sort((a, b) => a - b).join(",")})`,
          };
        }
      }
    }
  }

  return { ok: true, text };
}
