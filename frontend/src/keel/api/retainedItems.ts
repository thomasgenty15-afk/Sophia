// CE QUE SOPHIA SAIT DE TOI — le MIROIR FRONT de la mémoire structurée.
//
// ── POURQUOI UNE RECOPIE, ET PAS UN IMPORT ─────────────────────────────────
// L'autorité est `supabase/functions/_shared/keel/retained_item.ts` (Deno, pur,
// 43 exports). Le front est en Vite/TS: aucun import n'est possible entre les
// deux runtimes. La copie est donc ASSUMÉE, et c'est exactement la posture que
// `foodPreferences.ts` tient déjà vis-à-vis de `food_preference_promotion.ts`.
// Ce qui l'empêche de dériver n'est pas une intention: c'est
// `retainedItems.int.test.ts`, qui LIT le module Deno sur le disque et compare
// les huit listes fermées ET la matrice des droits, cellule par cellule.
//
// ⛔ IL N'EXISTE AUCUN `kind` DE SÉCURITÉ, ET C'EST STRUCTUREL. Une allergie,
// une intolérance, un régime, une condition médicale ne naissent JAMAIS d'un
// retour ou d'une conversation classée: elles ont leur table
// (`student_safety_constraints`), chargée synchronement, sans ranking, avec
// consentement. La carte de préférences filtre déjà `sensitive`/`safety` DANS
// SA REQUÊTE (`loadFoodPreferenceProposals`), et ce module ne touche pas à
// cette barrière — il ne lit aucune table de mémoire, il lit le jsonb déjà
// écrit.
//
// ── ⚠️ LE PIÈGE QUE CE MODULE EXISTE POUR FERMER ───────────────────────────
// `canProduce` mord AUSSI À LA LECTURE: `parseRetainedItem` l'applique, donc
// une ligne que son producteur n'avait pas le droit d'écrire NE REMONTE PLUS,
// même déjà en base. Conséquence directe pour l'écran: une ligne proposée par
// le memorizer (`source: "conversation"`) que la personne ré-édite vers un
// `kind` interdit à `conversation` — c'est-à-dire `portion.adjust` — doit être
// ré-enregistrée `source: "written"` + `item: ""`. Sinon elle disparaît à la
// relecture suivante, EN SILENCE, et ça se lit comme une perte de données.
// C'est `rewriteRetainedItem` qui tient cette règle, et le test qui la prouve.
//
// ── ET LE SECOND PIÈGE, CELUI DE L'ÉCRITURE ────────────────────────────────
// ⛔ CET ÉCRAN N'ÉCRIT JAMAIS `practical_constraints` EN ENTIER. Écrire la
// colonne entière fait disparaître, sans un mot, ce qu'un autre onglet vient
// d'y poser — c'est le défaut que le lot C3 a fermé, et le rythme de repas en a
// été la victime mesurée. La cicatrice jumelle est écrite aussi: « `current`
// périmé efface l'écriture d'avant », dont le symptôme est « le bouton ne fait
// rien », deux écrans plus loin. Et relire juste avant d'écrire ne ferme pas la
// fenêtre: ça la rétrécit, et ça ressemble alors trait pour trait à une garde
// qui marche.
//
// L'écriture passe donc par une RPC CIBLÉE (`keel_write_retained_items`), qui
// fait un `jsonb_set` sur les clés que cet écran possède et met la concurrence
// optimiste dans le PRÉDICAT d'un seul énoncé.
//
// ── ⛔ ET LE TROISIÈME PIÈGE, CELUI QUI A COÛTÉ LE PLUS CHER ───────────────
// La RPC remplace la CLÉ ENTIÈRE. Or la charge utile était composée depuis
// `store.items`, c'est-à-dire depuis les lignes PARSÉES: toute ligne refusée à
// la LECTURE (`canProduce` qui mord, jsonb difforme, `value` illisible) n'y
// était pas, donc n'était pas réémise, donc DISPARAISSAIT au premier geste —
// un simple retrait de note suffisait. Mesuré: 2 lignes stockées, 1 écrite.
//
// Et pendant ce temps l'écran affichait « … so they are not shown here.
// NOTHING WAS DELETED », ce qui devenait faux au clic suivant, sur l'écran dont
// toute la promesse est « rien d'opaque ».
//
// ⚠️ `p_expected` NE PROTÉGEAIT QUE LA COMPARAISON, PAS LA CHARGE UTILE. Le
// commentaire de `KnownStore` disait déjà « comparer une valeur reconstruite
// reviendrait à les supprimer en silence » — la protection décrite n'existait
// que d'un côté.
//
// La fermeture: `KnownStore` RETIENT le jsonb brut de chaque ligne qu'il n'a
// pas su lire (`opaqueItems`, `opaqueNextPlan`), avec le rang qu'elle occupait,
// et `writePortArgsFor` la RECOLLE À SA PLACE dans la charge utile. Une ligne
// qu'on ne sait pas lire n'est ni montrée, ni comprise, ni perdue.
//
// ⛔ SEULE EXCEPTION, ET ELLE REFUSE AU LIEU DE DÉTRUIRE: si la clé elle-même
// n'est pas une LISTE (`{"nope": 1}`), il n'existe aucune place où recoller
// quoi que ce soit — l'écriture est alors REFUSÉE (`opaque_store`), et l'écran
// le dit AVANT le geste. Un magasin structurellement cassé se répare, il ne
// s'écrase pas.
//
// ⚠️ ⛔ CETTE RPC N'EXISTE PAS TANT QU'UN HUMAIN N'A PAS LANCÉ SA MIGRATION
// (`20260818240000_a_write_port_for_what_sophia_knows.sql`). Tant qu'elle dort,
// chaque enregistrement échoue avec le refus NOMMÉ `no_write_port`, rendu à
// l'endroit du geste. C'est un PARTIEL assumé, pas un livré.

import { supabase } from "../../lib/supabase";
import { addDays, weekStartFor } from "./dates";
import {
  dismissedFrom,
  FOOD_PREFERENCES_KEY,
  type FoodPreferenceOrigin,
  keptFrom,
  originFrom,
} from "./foodPreferences";

// ===========================================================================
// AXE 1 · `kind` — de quoi on parle
// ===========================================================================

/** Les huit familles. Liste FERMÉE, recopiée, JAMAIS inférée. */
export const RETAINED_KINDS = [
  "food.exclude",
  "food.prefer",
  "method.avoid",
  "method.prefer",
  "portion.adjust",
  "rhythm.set",
  "logistics.set",
  "craving",
] as const;
export type RetainedKind = (typeof RETAINED_KINDS)[number];

// ===========================================================================
// AXE 2 · `scope` — combien de temps ça vit
// ===========================================================================

export const RETAINED_SCOPES = ["durable", "next_plan"] as const;
export type RetainedScope = (typeof RETAINED_SCOPES)[number];

// ===========================================================================
// AXE 3 · `subject` — de qui on parle
// ===========================================================================

/** ⛔ JAMAIS UN PRÉNOM, JAMAIS UN TEXTE. `member_id`, comme partout ailleurs. */
export const HOUSEHOLD_SUBJECT = "household" as const;
export type RetainedSubject = typeof HOUSEHOLD_SUBJECT | `member:${string}`;

const MEMBER_SUBJECT_PREFIX = "member:";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ===========================================================================
// §3 · `source` — QUI a produit la ligne
// ===========================================================================

/**
 * ⚠️ `source` NE SE DÉDUIT JAMAIS D'UN VIDE. L'absence d'origine dit « tapée à
 * la main » AUTANT que « lien au souvenir perdu »; s'en servir comme signature
 * rendrait les deux indiscernables, et l'écran ne pourrait plus dire « ça,
 * c'est toi qui l'as écrit » plutôt que « ça, je l'ai retenu de mardi ».
 */
export const RETAINED_SOURCES = [
  "written",
  "questionnaire",
  "conversation",
  "draft_note",
] as const;
export type RetainedSource = (typeof RETAINED_SOURCES)[number];

// ===========================================================================
// §4 · Le champ `value`, par famille
// ===========================================================================

export const PORTION_DIRECTIONS = ["down", "up"] as const;
export type PortionDirection = (typeof PORTION_DIRECTIONS)[number];

/** L'ampleur, en DEUX crans et en ADVERBES. Jamais cinq, jamais un nombre. */
export const PORTION_MAGNITUDES = ["slight", "clear"] as const;
export type PortionMagnitude = (typeof PORTION_MAGNITUDES)[number];

/**
 * ⛔ AUCUN GRAMME, AUCUNE CALORIE. JAMAIS, ET CET ÉCRAN N'EN AFFICHE AUCUN.
 *
 * Une personne dit « trop gros », pas « −80 g ». Les champs `?: never`
 * ci-dessous nomment les échappatoires vraisemblables: `{ direction,
 * magnitude, grams: 80 }` ne compile pas. Et `parsePortionAdjustValue` refuse
 * à la lecture toute clé au-delà des deux — sans nettoyer, parce que nettoyer
 * garderait la ligne en effaçant la preuve qu'un producteur fabrique des
 * nombres.
 */
export type PortionAdjustValue = {
  readonly direction: PortionDirection;
  readonly magnitude: PortionMagnitude;
  readonly grams?: never;
  readonly kcal?: never;
  readonly calories?: never;
  readonly delta?: never;
  readonly amount?: never;
  readonly quantity?: never;
  readonly percent?: never;
};

/** LES SIX MOMENTS, recopiés. L'égalité avec le socle est prouvée au test. */
export const RHYTHM_OCCASIONS = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
] as const;
export type RhythmOccasion = (typeof RHYTHM_OCCASIONS)[number];

export type RhythmSetValue = {
  readonly occasion: RhythmOccasion;
  readonly present: boolean;
};

/** ⚠️ LA CLÉ EST `cook_days`, PAS `cooking_days` — mesuré (`onboarding.ts`). */
export const LOGISTICS_FIELDS = [
  "cook_days",
  "cooking_time_min",
  "recipe_difficulty",
  "variety",
  "budget_amount",
] as const;
export type LogisticsField = (typeof LOGISTICS_FIELDS)[number];

export const RECIPE_DIFFICULTIES = ["simple", "normal", "keen"] as const;
export type RecipeDifficulty = (typeof RECIPE_DIFFICULTIES)[number];

export const VARIETY_LEVELS = ["repeat", "some", "varied"] as const;
export type VarietyLevel = (typeof VARIETY_LEVELS)[number];

/**
 * LES SEPT JETONS DE JOUR, recopiés de `_shared/keel/tokens.ts`.
 *
 * ⚠️ RECOPIÉS ET PAS IMPORTÉS DE `api/mealGeneration.ts`, qui les exporte déjà.
 * Ce module-ci est lu par une page neuve, et importer `mealGeneration` y
 * traînerait le graphe du moteur de repas — donc ses namespaces i18n, donc une
 * déclaration de page qui nomme des écrans que celui-ci n'affiche pas. Le
 * dépôt a déjà tranché ce compromis une fois, en tête de `retained_item.ts`
 * (« un socle que six lots importeront ne doit pas traîner ce graphe »), et
 * l'égalité est prouvée par le test, pas affirmée ici.
 */
export const RETAINED_DAY_TOKENS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

// ===========================================================================
// §3 · La forme écrite — `RetainedItem`
// ===========================================================================

export type RetainedItemBase = {
  /** CE QUE LA PERSONNE VOIT ET PEUT ÉDITER. Obligatoire, et c'est la vérité. */
  readonly text: string;
  readonly subject: RetainedSubject;
  readonly source: RetainedSource;
  /** Le jour où ça a été dit, `YYYY-MM-DD`. Requis, jamais `null`. */
  readonly at: string;
  /** L'id du `memory_items` d'origine, ou `""` — et `""` PROTÈGE l'entrée. */
  readonly item: string;
  /** La confiance du memorizer, et seulement la sienne. */
  readonly confidence: number | null;
};

export type RetainedItem =
  | (RetainedItemBase & {
    readonly kind:
      | "food.exclude"
      | "food.prefer"
      | "method.avoid"
      | "method.prefer";
    readonly scope: RetainedScope;
    readonly value: null;
  })
  | (RetainedItemBase & {
    /** ⚠️ TOUJOURS `next_plan`. Une envie durable est une habitude subie. */
    readonly kind: "craving";
    readonly scope: "next_plan";
    readonly value: null;
  })
  | (RetainedItemBase & {
    /** ⚠️ TOUJOURS `durable`. Un corps ne change pas d'une semaine sur l'autre. */
    readonly kind: "portion.adjust";
    readonly scope: "durable";
    readonly value: PortionAdjustValue;
  })
  | (RetainedItemBase & {
    readonly kind: "rhythm.set";
    readonly scope: RetainedScope;
    readonly value: RhythmSetValue;
  })
  | (RetainedItemBase & {
    readonly kind: "logistics.set";
    readonly scope: RetainedScope;
    readonly value: LogisticsSetValue;
  });

export type LogisticsSetValue =
  | { readonly field: "cook_days"; readonly value: readonly string[] }
  | { readonly field: "cooking_time_min"; readonly value: number }
  | { readonly field: "recipe_difficulty"; readonly value: RecipeDifficulty }
  | { readonly field: "variety"; readonly value: VarietyLevel }
  | { readonly field: "budget_amount"; readonly value: number };

export type PortionAdjustItem = Extract<
  RetainedItem,
  { kind: "portion.adjust" }
>;

// ===========================================================================
// §5 · La matrice des droits — EN CODE
// ===========================================================================

/**
 * Ce producteur a-t-il le droit d'écrire cette famille ?
 *
 *                        food.* / method.*  portion.adjust  rhythm  logistics  craving
 *   ① `draft_note`              ✅                 ⛔          ⛔       ✅        ✅
 *   ② `questionnaire`           ✅                 ✅ SEUL      ✅       ✅        ⛔
 *   ③ `conversation`            ✅                 ⛔          ✅       ✅        ✅
 *   ④ `written`                 ✅                 ✅          ✅       ✅        ✅
 *
 * `written` n'est pas un prompt: c'est LA PERSONNE qui tape dans sa propre
 * carte. Elle a le droit d'écrire ce qu'elle veut, sauf ce qui n'existe pas
 * comme `kind` — et c'est cette liste fermée qui la protège des familles sans
 * lecteur, et de toute famille de sécurité, qui a sa table à elle.
 */
export function canProduce(
  source: RetainedSource,
  kind: RetainedKind,
): boolean {
  switch (source) {
    case "written":
      return true;
    case "questionnaire":
      return kind !== "craving";
    case "conversation":
      return kind !== "portion.adjust";
    case "draft_note":
      return kind !== "portion.adjust" && kind !== "rhythm.set";
  }
}

/**
 * À quel `scope` ce producteur écrit cette famille, PAR DÉFAUT.
 *
 * ⛔ REND `null` QUAND LE PRODUCTEUR N'A PAS LE DROIT, ET `null` EST UN REFUS.
 * Jamais `?? "durable"`, jamais `?? "next_plan"`: replier ce `null` réarmerait
 * exactement l'interdit que `canProduce` vient de poser.
 */
export function defaultScopeFor(
  source: RetainedSource,
  kind: RetainedKind,
): RetainedScope | null {
  if (!canProduce(source, kind)) return null;
  if (kind === "craving") return "next_plan";
  if (kind === "portion.adjust") return "durable";
  switch (source) {
    case "draft_note":
      return "next_plan";
    case "questionnaire":
      return "durable";
    case "conversation":
      return "durable";
    case "written":
      return "durable";
  }
}

// ===========================================================================
// Les parseurs — défensifs, et jamais silencieux
// ===========================================================================

export function parseRetainedKind(value: unknown): RetainedKind | null {
  const slug = String(value ?? "").trim().toLowerCase();
  return (RETAINED_KINDS as readonly string[]).includes(slug)
    ? slug as RetainedKind
    : null;
}

export function parseRetainedScope(value: unknown): RetainedScope | null {
  const slug = String(value ?? "").trim().toLowerCase();
  return (RETAINED_SCOPES as readonly string[]).includes(slug)
    ? slug as RetainedScope
    : null;
}

export function parseRetainedSource(value: unknown): RetainedSource | null {
  const slug = String(value ?? "").trim().toLowerCase();
  return (RETAINED_SOURCES as readonly string[]).includes(slug)
    ? slug as RetainedSource
    : null;
}

/**
 * `household`, ou `member:` suivi d'un uuid. Tout le reste rend `null`.
 *
 * ⚠️ `member:marc` est un REFUS, pas un repli sur `household`: replier ici
 * appliquerait à toute la table une mesure destinée à une bouche.
 */
export function parseRetainedSubject(value: unknown): RetainedSubject | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.toLowerCase() === HOUSEHOLD_SUBJECT) return HOUSEHOLD_SUBJECT;
  if (!raw.toLowerCase().startsWith(MEMBER_SUBJECT_PREFIX)) return null;
  const id = raw.slice(MEMBER_SUBJECT_PREFIX.length).trim().toLowerCase();
  if (!UUID_RE.test(id)) return null;
  return `${MEMBER_SUBJECT_PREFIX}${id}` as RetainedSubject;
}

export function memberSubject(memberId: unknown): RetainedSubject | null {
  const id = String(memberId ?? "").trim().toLowerCase();
  return UUID_RE.test(id)
    ? `${MEMBER_SUBJECT_PREFIX}${id}` as RetainedSubject
    : null;
}

/** L'id de la bouche visée, ou `null` quand le sujet est `household`. */
export function subjectMemberId(subject: RetainedSubject): string | null {
  if (subject === HOUSEHOLD_SUBJECT) return null;
  const id = subject.slice(MEMBER_SUBJECT_PREFIX.length);
  return UUID_RE.test(id) ? id : null;
}

/**
 * Un jour, et STRICTEMENT `YYYY-MM-DD`.
 *
 * ⚠️ PAS `Date.parse`, et c'est délibéré: `dayOf` (`foodPreferences.ts`)
 * reprojette en UTC, donc un « mardi soir » à Paris ressort mercredi — et
 * l'écran afficherait « je l'ai retenu de mercredi », ce qui est faux. Une date
 * qui n'est pas déjà un jour propre est refusée, pas normalisée.
 */
export function parseRetainedDay(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return raw;
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return lengths[month - 1];
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * ⛔ LA GARDE DES GRAMMES, CÔTÉ LECTURE. Toute clé au-delà de `direction` et
 * `magnitude` fait tomber l'item ENTIER — pas de nettoyage.
 */
function parsePortionAdjustValue(value: unknown): PortionAdjustValue | null {
  const row = asRecord(value);
  if (!row) return null;
  for (const key of Object.keys(row)) {
    if (key !== "direction" && key !== "magnitude") return null;
  }
  const direction = String(row.direction ?? "").trim().toLowerCase();
  const magnitude = String(row.magnitude ?? "").trim().toLowerCase();
  if (!(PORTION_DIRECTIONS as readonly string[]).includes(direction)) return null;
  if (!(PORTION_MAGNITUDES as readonly string[]).includes(magnitude)) return null;
  return {
    direction: direction as PortionDirection,
    magnitude: magnitude as PortionMagnitude,
  };
}

function parseRhythmSetValue(value: unknown): RhythmSetValue | null {
  const row = asRecord(value);
  if (!row) return null;
  const occasion = String(row.occasion ?? "").trim().toLowerCase();
  if (!(RHYTHM_OCCASIONS as readonly string[]).includes(occasion)) return null;
  // `present` est un booléen STRICT: un moment de la journée qu'on ferait
  // exister sur une coercition est un repas ajouté à l'assiette de quelqu'un
  // par une chaîne de caractères.
  if (typeof row.present !== "boolean") return null;
  return { occasion: occasion as RhythmOccasion, present: row.present };
}

function parseLogisticsSetValue(value: unknown): LogisticsSetValue | null {
  const row = asRecord(value);
  if (!row) return null;
  const field = String(row.field ?? "").trim().toLowerCase();
  if (!(LOGISTICS_FIELDS as readonly string[]).includes(field)) return null;
  const raw = row.value;
  switch (field as LogisticsField) {
    case "cook_days": {
      if (!Array.isArray(raw)) return null;
      const days: string[] = [];
      for (const entry of raw) {
        const token = String(entry ?? "").trim().toLowerCase();
        // ⛔ Un jeton hors liste fait tomber TOUT le champ: en garder une
        // version amputée dimensionnerait le plan sur moins de sessions que la
        // personne n'en a déclarées.
        if (!(RETAINED_DAY_TOKENS as readonly string[]).includes(token)) {
          return null;
        }
        if (!days.includes(token)) days.push(token);
      }
      if (days.length === 0) return null;
      return { field: "cook_days", value: days };
    }
    case "cooking_time_min": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
      if (!Number.isInteger(raw) || raw <= 0) return null;
      return { field: "cooking_time_min", value: raw };
    }
    case "budget_amount": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
      if (raw <= 0) return null;
      return { field: "budget_amount", value: raw };
    }
    case "recipe_difficulty": {
      const slug = String(raw ?? "").trim().toLowerCase();
      if (!(RECIPE_DIFFICULTIES as readonly string[]).includes(slug)) return null;
      return { field: "recipe_difficulty", value: slug as RecipeDifficulty };
    }
    case "variety": {
      const slug = String(raw ?? "").trim().toLowerCase();
      if (!(VARIETY_LEVELS as readonly string[]).includes(slug)) return null;
      return { field: "variety", value: slug as VarietyLevel };
    }
  }
}

/** Sentinelle de refus: `null` est une valeur légitime de `confidence`. */
const REFUSED = Symbol("retained_item.refused");

function parseConfidence(
  value: unknown,
  source: RetainedSource,
): number | null | typeof REFUSED {
  if (source !== "conversation") {
    return value === undefined || value === null ? null : REFUSED;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return REFUSED;
  if (value < 0 || value > 1) return REFUSED;
  return value;
}

/**
 * L'`item` d'origine, contraint par la `source`. `null` = REFUS; `""` est une
 * valeur VALIDE, et c'est elle qui protège une ligne tapée à la main.
 *
 * ── ⛔ LA STRICTESSE DU `written`, ET POURQUOI ELLE COMPTE À LA LECTURE ────
 * Un `written` porteur d'un uuid de souvenir est REFUSÉ, pas nettoyé. C'est la
 * moitié LUE d'une propriété que ce module invoque partout ailleurs: « `item:
 * ""` protège l'entrée », donc `reconcileFoodPreferences` ne peut pas reprendre
 * une ligne que la personne a corrigée. Si la lecture acceptait un `written`
 * porteur d'un id, `rewriteRetainedItem` aurait beau écrire `item: ""`, une
 * ligne écrite par un producteur moins scrupuleux rentrerait avec son id — et
 * la protection serait testée à l'écriture seulement, jamais à la relecture.
 * Le test « `item: ""` protège l'entrée, DANS LES DEUX SENS » l'arme, avec son
 * cas qui passe.
 *
 * ⚠️ SYMÉTRIQUE: un `conversation` SANS id est refusé aussi. Une proposition du
 * memorizer qu'on ne saurait plus rattacher à son souvenir est une inférence
 * qu'on ne peut plus ni citer ni démentir.
 */
function parseOriginItem(value: unknown, source: RetainedSource): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (source === "written") return raw === "" ? "" : null;
  if (source === "conversation") return UUID_RE.test(raw) ? raw : null;
  if (raw === "") return "";
  return UUID_RE.test(raw) ? raw : null;
}

/**
 * Lit un élément retenu. Rend `null` à la première chose illisible.
 *
 * ⚠️ L'ÉTAPE 3 EST LA MATRICE. Une ligne que son producteur n'avait pas le
 * droit d'écrire ne remonte pas, MÊME DÉJÀ EN BASE — c'est ce qui fait que la
 * règle ne régresse pas, et c'est aussi ce qui rend `rewriteRetainedItem`
 * obligatoire plus bas.
 */
export function parseRetainedItem(value: unknown): RetainedItem | null {
  const row = asRecord(value);
  if (!row) return null;

  const kind = parseRetainedKind(row.kind);
  if (!kind) return null;

  const source = parseRetainedSource(row.source);
  if (!source) return null;

  if (!canProduce(source, kind)) return null;

  const subject = parseRetainedSubject(row.subject);
  if (!subject) return null;

  const text = typeof row.text === "string" ? row.text.trim() : "";
  if (!text) return null;

  const at = parseRetainedDay(row.at);
  if (!at) return null;

  const item = parseOriginItem(row.item, source);
  if (item === null) return null;

  const confidence = parseConfidence(row.confidence, source);
  if (confidence === REFUSED) return null;

  const scope = parseRetainedScope(row.scope);
  if (!scope) return null;

  const base: RetainedItemBase = { text, subject, source, at, item, confidence };

  switch (kind) {
    case "food.exclude":
    case "food.prefer":
    case "method.avoid":
    case "method.prefer":
      if (row.value !== undefined && row.value !== null) return null;
      return { ...base, kind, scope, value: null };

    case "craving":
      if (scope !== "next_plan") return null;
      if (row.value !== undefined && row.value !== null) return null;
      return { ...base, kind, scope: "next_plan", value: null };

    case "portion.adjust": {
      if (scope !== "durable") return null;
      const portion = parsePortionAdjustValue(row.value);
      if (!portion) return null;
      return { ...base, kind, scope: "durable", value: portion };
    }

    case "rhythm.set": {
      const rhythm = parseRhythmSetValue(row.value);
      if (!rhythm) return null;
      return { ...base, kind, scope, value: rhythm };
    }

    case "logistics.set": {
      const logistics = parseLogisticsSetValue(row.value);
      if (!logistics) return null;
      return { ...base, kind, scope, value: logistics };
    }
  }
}

/** Lit une liste. Un item difforme TOMBE SEUL et laisse ses voisins. */
export function parseRetainedItems(value: unknown): RetainedItem[] {
  if (!Array.isArray(value)) return [];
  const out: RetainedItem[] = [];
  for (const entry of value) {
    const item = parseRetainedItem(entry);
    if (item) out.push(item);
  }
  return out;
}

/** La forme de STOCKAGE, exactement celle du §3. */
export function retainedItemToJson(item: RetainedItem): Record<string, unknown> {
  return {
    kind: item.kind,
    scope: item.scope,
    subject: item.subject,
    text: item.text,
    value: item.value,
    source: item.source,
    at: item.at,
    item: item.item,
    confidence: item.confidence,
  };
}

// ===========================================================================
// ⚠️ LA RÉÉCRITURE — LE PIÈGE DU CONTRAT §2.2, FERMÉ ICI
// ===========================================================================

/** Ce que la personne vient de changer sur une ligne. */
export interface RetainedEdit {
  readonly text: string;
  readonly kind: RetainedKind;
  readonly subject: RetainedSubject;
  /** La valeur structurée de la famille VISÉE, ou `null` si elle n'en a pas. */
  readonly value: RetainedItem["value"];
}

/**
 * RÉÉCRIT UNE LIGNE APRÈS UNE ÉDITION — et re-signe la ligne quand il le faut.
 *
 * ── LE DÉFAUT QUE CETTE FONCTION EMPÊCHE, ET IL EST SILENCIEUX ─────────────
 * `parseRetainedItem` applique `canProduce` À LA LECTURE. Une ligne
 * `source: "conversation"` que la personne déplace vers `portion.adjust` —
 * la seule famille interdite au memorizer — serait donc écrite sans erreur,
 * relue à zéro au chargement suivant, et la personne verrait sa correction
 * DISPARAÎTRE sans un mot. C'est une perte de données, et elle se lirait comme
 * telle.
 *
 * La règle: quand le producteur d'origine n'a pas le droit de la famille
 * VISÉE, la ligne change de main. Elle devient `source: "written"` — parce
 * qu'elle l'est: la personne vient de la classer elle-même, avec la liste des
 * familles sous les yeux, ce qui est une réponse à une question fermée et pas
 * une inférence. Et son `item` repasse à `""`, parce que ce vide est ce qui
 * PROTÈGE l'entrée: `reconcileFoodPreferences` ne retire jamais une ligne sans
 * id, donc le memorizer ne peut plus lui reprendre ce qu'elle a corrigé.
 *
 * ⚠️ `confidence` TOMBE AVEC LA SOURCE, et ce n'est pas une commodité: une
 * confiance accrochée à un fait DÉCLARÉ est une erreur de catégorie, et
 * `parseRetainedItem` la refuse. La garder ferait rendre `null` à cette
 * fonction, c'est-à-dire perdre la ligne par l'autre bout.
 *
 * ⚠️ `at` SUIT LA MAIN, LUI AUSSI. Tant que la source tient, le jour reste
 * celui où ça a été dit (« je l'ai retenu de mardi » doit rester vrai). Quand
 * la ligne devient `written`, le jour devient CELUI-CI: c'est le jour où la
 * personne l'a écrite, et c'est ce que la ligne d'origine affichera.
 *
 * @param today `YYYY-MM-DD`, passé par l'appelant. Ce module ne lit aucune
 *              horloge: `dayOf` reprojette en UTC, et un « mardi soir » à Paris
 *              ressortirait mercredi sur l'écran de transparence.
 * @returns `null` si l'édition ne donne rien de lisible — un refus, jamais un
 *          repli.
 */
export function rewriteRetainedItem(
  current: RetainedItem,
  edit: RetainedEdit,
  today: string,
): RetainedItem | null {
  const day = parseRetainedDay(today);
  if (!day) return null;

  const keepsSource = canProduce(current.source, edit.kind);
  const source: RetainedSource = keepsSource ? current.source : "written";
  const item = keepsSource ? current.item : "";
  const confidence = source === "conversation" ? current.confidence : null;
  const at = keepsSource ? current.at : day;

  // ── ⚠️ AVEU: CETTE BRANCHE EST MORTE AUJOURD'HUI, ET ELLE RESTE ──────────
  // Elle ne peut pas se déclencher, et le dire vaut mieux que de laisser croire
  // qu'elle garde quelque chose. `defaultScopeFor` rend `null` EXACTEMENT sur
  // les cellules que `canProduce` refuse (l'équivalence est épinglée sur les 32
  // cellules par « le refus de portée et la cellule interdite sont le MÊME
  // ensemble »). Or `source`, trois lignes plus haut, est soit un producteur
  // dont `canProduce` vient de dire OUI, soit `written`, qui peut tout: le
  // `null` n'arrive jamais ici. C'est le patron « ceinture armée sur coffre
  // vide », nommé plutôt que déguisé.
  //
  // ⛔ ELLE RESTE QUAND MÊME, ET SURTOUT PAS REPLIÉE EN `?? "durable"`. Le jour
  // où `defaultScopeFor` refusera une cellule que `canProduce` autorise, le
  // repli réarmerait EN SILENCE l'interdit qu'on vient de poser — piège n°1 du
  // contrat de phase 0. Le test d'équivalence rougirait AVANT, ce qui est le
  // seul ordre utile; et un second test relit CE fichier pour qu'aucun
  // `defaultScopeFor(…) ?? …` ne puisse s'y glisser.
  const scope = defaultScopeFor(source, edit.kind);
  if (scope === null) return null;

  return parseRetainedItem({
    kind: edit.kind,
    scope,
    subject: edit.subject,
    text: edit.text,
    value: edit.value,
    source,
    at,
    item,
    confidence,
  });
}

/**
 * UNE PHRASE PLATE QUI DEVIENT UNE LIGNE RANGÉE — §7 de la nomenclature.
 *
 * ⛔ AUCUNE INFÉRENCE RÉTROACTIVE. Cette fonction ne devine RIEN: la famille
 * arrive en paramètre parce que la personne vient de la choisir. C'est la
 * seule façon dont une « ancienne note » se reclasse, et c'est exactement ce
 * que dit le §7 — « elles se reclassent quand la personne les édite ».
 *
 * La ligne naît `written` / `item: ""`: la personne l'a classée elle-même, et
 * le vide de l'`item` la met hors de portée de la réconciliation.
 */
export function retainedItemFromLegacyNote(args: {
  readonly text: string;
  readonly kind: RetainedKind;
  readonly subject: RetainedSubject;
  readonly value: RetainedItem["value"];
  readonly today: string;
}): RetainedItem | null {
  const day = parseRetainedDay(args.today);
  if (!day) return null;
  // ⚠️ MÊME AVEU QU'EN FACE, et pour une raison plus courte encore: `written`
  // peut produire les huit familles, donc `defaultScopeFor` ne rend jamais
  // `null` ici. La branche est morte et se garde intacte — un `?? "durable"`
  // désarmerait le seul endroit qui refuserait si la matrice bougeait.
  const scope = defaultScopeFor("written", args.kind);
  if (scope === null) return null;
  return parseRetainedItem({
    kind: args.kind,
    scope,
    subject: args.subject,
    text: args.text,
    value: args.value,
    source: "written",
    at: day,
    item: "",
    confidence: null,
  });
}

// ===========================================================================
// LES SIX SECTIONS — §6 de la nomenclature, DANS L'ORDRE
// ===========================================================================

export const KNOWN_SECTIONS = [
  "no_more",
  "again",
  "portions",
  "rhythm",
  "kitchen",
  "next_week",
] as const;
export type KnownSection = (typeof KNOWN_SECTIONS)[number];

/**
 * À quelle section va une ligne.
 *
 * ⚠️ LE `scope` GAGNE SUR LE `kind`, ET C'EST LE §6 QUI LE DIT: la section 6
 * est « TOUT le `next_plan` », pas « les envies ». Une exclusion posée pour la
 * semaine prochaine se lit sous « Pour la semaine prochaine », avec sa date —
 * la ranger avec les durables la ferait passer pour une propriété permanente,
 * ce qui est la frontière que le dépôt a déjà tranchée une fois.
 */
export function sectionOf(item: RetainedItem): KnownSection {
  if (item.scope === "next_plan") return "next_week";
  switch (item.kind) {
    case "food.exclude":
    case "method.avoid":
      return "no_more";
    case "food.prefer":
    case "method.prefer":
      return "again";
    case "portion.adjust":
      return "portions";
    case "rhythm.set":
      return "rhythm";
    case "logistics.set":
      return "kitchen";
    // ⚠️ PAS DE BRANCHE `craving`, ET CE N'EST PAS UN OUBLI: l'union porte
    // `scope: "next_plan"` LITTÉRAL sur cette famille, donc le retour du dessus
    // l'a DÉJÀ retirée du type. En écrire une ne compile pas — l'invariant du
    // §2 axe 2 est tenu par le compilateur, pas par une convention.
  }
}

/** Les lignes d'une section, dans l'ordre de lecture. */
export function itemsInSection(
  items: readonly RetainedItem[],
  section: KnownSection,
): RetainedItem[] {
  return items.filter((item) => sectionOf(item) === section);
}

/**
 * Les lignes GROUPÉES PAR BOUCHE — §6 sections 3 et 4.
 *
 * ⛔ La clé est le `member_id`, jamais un prénom: c'est l'écran qui va chercher
 * le nom dans le roster, et une bouche partie du foyer n'a plus de nom mais
 * garde son id. Le groupe `household` (tout le monde à table) sort EN PREMIER,
 * parce que c'est le cas le plus fréquent et le moins surprenant.
 */
export function groupBySubject(
  items: readonly RetainedItem[],
): Array<{ subject: RetainedSubject; items: RetainedItem[] }> {
  const groups = new Map<string, RetainedItem[]>();
  for (const item of items) {
    const list = groups.get(item.subject) ?? [];
    list.push(item);
    groups.set(item.subject, list);
  }
  const out: Array<{ subject: RetainedSubject; items: RetainedItem[] }> = [];
  const shared = groups.get(HOUSEHOLD_SUBJECT);
  if (shared) out.push({ subject: HOUSEHOLD_SUBJECT, items: shared });
  for (const [subject, list] of groups) {
    if (subject === HOUSEHOLD_SUBJECT) continue;
    out.push({ subject: subject as RetainedSubject, items: list });
  }
  return out;
}

// ===========================================================================
// LE MAGASIN DURABLE — `student_goals.practical_constraints.retained_items`
// ===========================================================================

/**
 * La clé du jsonb qui porte les items DURABLES.
 *
 * ⚠️ MIROIR DE `RETAINED_ITEMS_KEY` (lot 1A, `food_preference_promotion.ts`).
 * Le test lit la constante côté Deno et compare: une divergence ici écrirait
 * dans une clé que le générateur ne lit pas, et l'écran aurait l'air de marcher.
 */
export const RETAINED_ITEMS_KEY = "retained_items";

/**
 * COMBIEN DE LIGNES STOCKÉES NE SONT PAS REMONTÉES, ET POUR QUEL MOTIF.
 *
 * Miroir de `RetainedItemsRefusals` (lot 1A). Sans compteur, un magasin dont la
 * moitié des lignes est refusée ressemble EXACTEMENT à un magasin à moitié
 * vide — et sur l'écran dont la promesse est « rien d'opaque », ça se lit comme
 * une suppression qu'on n'a pas demandée.
 */
export interface RetainedItemsRefusals {
  readonly total: number;
  /** `canProduce(source, kind)` a mordu à la lecture — le motif du §2.2. */
  readonly forbiddenProducer: number;
  /** Illisible pour tout autre motif. Le socle refuse, il ne nettoie pas. */
  readonly malformed: number;
  /** Lisible, mais rangée dans le mauvais magasin (le `next_plan` vit ailleurs). */
  readonly notDurable: number;
}

/**
 * UNE LIGNE STOCKÉE QU'ON N'A PAS SU LIRE — GARDÉE TELLE QUELLE, ET SA PLACE.
 *
 * ⛔ C'EST LA PIÈCE QUI TIENT LA PROMESSE AFFICHÉE. Sans elle, la charge utile
 * de l'écriture est composée depuis les lignes PARSÉES, la RPC remplace la clé
 * entière, et n'importe quel geste — un retrait de note suffit — efface les
 * lignes illisibles. Mesuré avant correctif: 2 lignes stockées, 1 écrite.
 * Pendant ce temps l'écran affichait « Nothing was deleted », faux au clic
 * suivant.
 *
 * ⚠️ `raw` EST LE JSONB STOCKÉ, JAMAIS UNE RECONSTRUCTION. Le reconstruire
 * demanderait de l'avoir compris — et c'est précisément ce qu'on n'a pas su
 * faire. Le nettoyer effacerait la preuve qu'un producteur écrit de travers.
 *
 * `after` = COMBIEN DE LIGNES LUES la précédaient dans le magasin stocké. C'est
 * ce qui la remet À SA PLACE et pas en queue: une envie coincée entre deux
 * exclusions ne doit pas remonter d'un rang à chaque enregistrement.
 */
export interface OpaqueRetainedRow {
  readonly raw: unknown;
  readonly after: number;
}

export interface RetainedItemsReadout {
  /** Les `RetainedItem` DURABLES, dans l'ordre où ils sont stockés. */
  readonly items: RetainedItem[];
  /**
   * §7 — LES PHRASES PLATES DÉJÀ EN BASE, rendues TELLES QUELLES.
   * ⛔ Elles ne se reclassent pas toutes seules, et on ne devine JAMAIS
   * rétroactivement leur famille.
   */
  readonly legacyNotes: string[];
  /** Les lignes illisibles, GARDÉES pour être réémises telles quelles. */
  readonly opaque: OpaqueRetainedRow[];
  readonly refused: RetainedItemsRefusals;
}

/** Miroir front de `readRetainedItems` (lot 1A). */
export function readRetainedItems(
  constraints: Record<string, unknown> | null | undefined,
): RetainedItemsReadout {
  const legacyNotes = keptFrom(constraints);
  const raw = (constraints ?? {})[RETAINED_ITEMS_KEY];

  // ⚠️ UN MAGASIN QUI N'EST PAS UNE LISTE COMPTE POUR UNE LIGNE REFUSÉE, pas
  // pour zéro: à zéro, un jsonb corrompu serait indiscernable d'un jsonb vide.
  //
  // ⛔ ET IL NE REND AUCUNE LIGNE OPAQUE, PARCE QU'IL N'Y A PAS DE PLACE OÙ LA
  // RECOLLER: la charge utile est une LISTE, et y glisser un objet nu changerait
  // son sens. C'est `opaqueStoreRefusal` qui refuse alors l'écriture entière —
  // le seul cas de ce module où « ne rien pouvoir écrire » est la bonne réponse.
  if (!Array.isArray(raw)) {
    const broken = raw === undefined || raw === null ? 0 : 1;
    return {
      items: [],
      legacyNotes,
      opaque: [],
      refused: {
        total: broken,
        forbiddenProducer: 0,
        malformed: broken,
        notDurable: 0,
      },
    };
  }

  // UN SEUL PASSAGE, et il produit les trois choses ENSEMBLE: ce qu'on a lu, ce
  // qu'on garde sans l'avoir lu, et le compte par motif. Deux passages séparés
  // laisseraient dériver le rang `after` du contenu qu'il indexe.
  const items: RetainedItem[] = [];
  const opaque: OpaqueRetainedRow[] = [];
  let forbiddenProducer = 0;
  let malformed = 0;
  let notDurable = 0;
  for (const row of raw) {
    const parsed = parseRetainedItem(row);
    if (parsed && parsed.scope === "durable") {
      items.push(parsed);
      continue;
    }
    // ⛔ TOUT CE QUI N'ENTRE PAS DANS `items` EST GARDÉ TEL QUEL. Y compris une
    // ligne PARFAITEMENT LISIBLE mais rangée dans le mauvais magasin: l'écran ne
    // la montre pas, donc l'écran n'a pas le droit de la supprimer. La
    // déménager d'office serait un geste que personne n'a demandé.
    opaque.push({ raw: row, after: items.length });
    if (parsed) {
      notDurable += 1;
      continue;
    }
    const entry = asRecord(row);
    const kind = entry ? parseRetainedKind(entry.kind) : null;
    const source = entry ? parseRetainedSource(entry.source) : null;
    // Les deux jetons se lisent, mais la matrice les refuse ENSEMBLE: c'est le
    // motif §2.2, et c'est le seul qu'on sache nommer sans deviner.
    if (kind && source && !canProduce(source, kind)) forbiddenProducer += 1;
    else malformed += 1;
  }

  return {
    items,
    legacyNotes,
    opaque,
    refused: {
      total: forbiddenProducer + malformed + notDurable,
      forbiddenProducer,
      malformed,
      notDurable,
    },
  };
}

/**
 * RECOLLE LES LIGNES ILLISIBLES DANS LA CHARGE UTILE, À LEUR PLACE.
 *
 * ⚠️ C'EST LA MOITIÉ QUI MANQUAIT. `p_expected` protégeait la COMPARAISON —
 * « personne n'a touché à ça pendant que tu éditais » — et rien ne protégeait la
 * CHARGE UTILE. La RPC remplace la clé entière: ce qui n'est pas dans `p_items`
 * est effacé, et une ligne qu'on n'a pas su lire n'y était pas.
 *
 * ⚠️ LES RANGS SONT BORNÉS, JAMAIS PERDUS. Un `after` au-delà de la liste
 * courante — la personne a retiré des lignes depuis — recolle EN QUEUE plutôt
 * que de tomber; un `after` non fini fait pareil. Perdre un rang décale une
 * ligne; perdre la ligne est le défaut que toute cette fonction existe pour
 * fermer.
 */
export function reglueOpaqueRows(
  rows: readonly unknown[],
  opaque: readonly OpaqueRetainedRow[],
): unknown[] {
  const held = new Map<number, unknown[]>();
  for (const row of opaque ?? []) {
    const want = Number.isFinite(row?.after) ? Math.trunc(row.after) : rows.length;
    const slot = Math.max(0, Math.min(want, rows.length));
    const list = held.get(slot) ?? [];
    list.push(row?.raw);
    held.set(slot, list);
  }
  const out: unknown[] = [];
  for (const kept of held.get(0) ?? []) out.push(kept);
  rows.forEach((row, index) => {
    out.push(row);
    for (const kept of held.get(index + 1) ?? []) out.push(kept);
  });
  return out;
}

/** Miroir front de `retainedItemsFrom` (lot 1A). */
export function retainedItemsFrom(
  constraints: Record<string, unknown> | null | undefined,
): { items: RetainedItem[]; legacyNotes: string[] } {
  const { items, legacyNotes } = readRetainedItems(constraints);
  return { items, legacyNotes };
}

/**
 * Ce qui a le droit d'entrer dans le magasin DURABLE, et ce qui n'y entre pas.
 *
 * ⚠️ CE N'EST PAS UN PARAMÈTRE DE GARDE. `withRetainedItems` filtre TOUJOURS,
 * qu'on appelle cette fonction ou non — cicatrice « paramètre de garde
 * optionnel = garde désarmée ». Elle rend seulement le refus DICIBLE, pour que
 * l'écran puisse le dire au lieu de laisser une envie disparaître en silence.
 */
export function partitionForDurableStore(
  items: readonly RetainedItem[],
): { durable: RetainedItem[]; notDurable: RetainedItem[] } {
  const durable: RetainedItem[] = [];
  const notDurable: RetainedItem[] = [];
  for (const entry of items ?? []) {
    (entry?.scope === "durable" ? durable : notDurable).push(entry);
  }
  return { durable, notDurable };
}

/**
 * Miroir front de `withRetainedItems` (lot 1A). Ne mute pas l'entrée.
 *
 * ⛔ CE N'EST PAS LE CHEMIN D'ÉCRITURE DE CET ÉCRAN, et s'en servir pour écrire
 * REFERAIT la perte silencieuse: cette fonction compose la clé depuis les seuls
 * items PARSÉS, donc elle laisse tomber les lignes que la lecture a refusées.
 * C'est le miroir EXACT du module 1A, qui a la même propriété et le même motif
 * (le serveur, lui, réconcilie ce qu'il a compris). Le chemin d'écriture de
 * l'écran est `writePortArgsFor`, qui recolle les lignes opaques.
 */
export function withRetainedItems(
  constraints: Record<string, unknown> | null | undefined,
  items: readonly RetainedItem[],
): Record<string, unknown> {
  const base = { ...(constraints ?? {}) } as Record<string, unknown>;
  base[RETAINED_ITEMS_KEY] = partitionForDurableStore(items).durable
    .map(retainedItemToJson);
  return base;
}

// ===========================================================================
// LE MAGASIN PROVISOIRE — `practical_constraints.retained_next_plan`
// ===========================================================================

/**
 * La clé du jsonb qui porte les lignes `next_plan`, ET SON MOTIF.
 *
 * ── ⚠️ POURQUOI ELLE N'EST PAS SUR LE CANAL D'ENVIES ──────────────────────
 * Arbitrage humain du 2026-08-18. `household_envy_submissions.household_id` est
 * `not null`, et une personne SEULE n'a pas de foyer (`SetupPage.tsx`: « LE
 * SOLO NE CRÉE PAS DE FOYER »). Un compte solo n'aurait donc JAMAIS pu porter
 * une seule ligne `next_plan` — alors que l'entrée du produit est à une bouche.
 * Le canal d'envies redevient ce qu'il a toujours été: LA PHRASE LIBRE du
 * maître pour tout le foyer. Un magasin par `scope`, identique pour un solo et
 * pour un foyer.
 *
 * ⛔ CLÉ DISTINCTE DE `retained_items`, ET C'EST STRUCTUREL. Le magasin durable
 * ne prend que du `durable` (lot 1A filtre à l'écriture ET compte à la
 * lecture). Mélanger les deux ferait exactement la confusion que l'axe 2 de la
 * nomenclature existe pour empêcher: « une contrainte d'une semaine s'y lisait
 * comme une propriété permanente ».
 */
export const NEXT_PLAN_ITEMS_KEY = "retained_next_plan";

/**
 * Une ligne provisoire, AVEC LA SEMAINE QU'ELLE VISE.
 *
 * ⚠️ L'ANCRE N'EST PAS `item.at`, ET LES DEUX NE SE REMPLACENT PAS. `at` est le
 * jour où la chose a été DITE; l'ancre est la semaine VISÉE. Quelqu'un qui
 * écrit le dimanche pour la semaine suivante a `at = dimanche` et
 * `anchor = lundi`: dater l'expiration sur `at` ferait mourir son envie le
 * lendemain matin — une perte de données qui aurait l'air d'une règle.
 */
export interface NextPlanEntry {
  readonly item: RetainedItem;
  /** Le lundi ISO de la semaine visée, `YYYY-MM-DD`. */
  readonly anchor: string;
}

/**
 * LA FENÊTRE, recopiée du lot 1B (`retained_next_plan.ts`, `WINDOW_DAYS`).
 *
 * ⚠️ RECOPIÉE ET NON IMPORTÉE — le module est en Deno, le front en Vite. La
 * recopie n'est pas un pari: `retainedItems.int.test.ts` lit le module 1B sur
 * le disque, en extrait la constante, ET épingle les deux frontières avec des
 * dates ÉCRITES EN DUR (dimanche vivant, lundi suivant parti). Une règle
 * redérivée sans ces deux bornes serait une règle qu'on croit partager.
 */
export const NEXT_PLAN_WINDOW_DAYS = 7;

/**
 * Le lundi ISO de la semaine qui contient ce jour, ou `null`.
 *
 * ⚠️ REND `null` sur un jour malformé, JAMAIS un repli sur aujourd'hui: un
 * `anchor` illisible replié ferait vivre une envie six semaines de plus.
 * `weekStartFor` (`api/dates.ts`) parse à MIDI UTC, donc il ne décale pas d'un
 * jour à l'ouest du méridien — mais il JETTE sur une date malformée, d'où le
 * `parseRetainedDay` qui le précède.
 *
 * ⚠️ UNE ANCRE QUI N'EST PAS UN LUNDI EST CANONISÉE, ET CE N'EST PAS UNE PERTE.
 * Une entrée stockée sur `2026-08-26` se relit `2026-08-24` et se RÉÉCRIT ainsi.
 * Ça vaut la peine de dire pourquoi ce n'est pas la même chose qu'une ligne
 * effacée: l'ancre ne signifie pas « le 26 », elle signifie « LA SEMAINE VISÉE »
 * (§7 de la nomenclature), et le lundi ISO du 26 EST cette semaine. La fonction
 * est idempotente, la date d'expiration affichée est identique avant et après,
 * et aucune information n'existe dans « 26 » que « semaine du 24 » ne porte pas.
 * Un test épingle les deux moitiés — idempotence, et expiration inchangée.
 */
export function isoMondayOf(day: unknown): string | null {
  const clean = parseRetainedDay(day);
  if (!clean) return null;
  return weekStartFor(clean, "mon");
}

/**
 * LES TROIS DATES DE VIE d'une ligne déposée sous cette ancre.
 *
 * Trois et pas une, pour tuer l'ambiguïté de borne: personne ne doit avoir à
 * deviner si « expire le 24 » veut dire « encore là le 24 » ou « plus là le
 * 24 ». C'est exactement l'erreur d'un jour dont « une envie qui disparaît sans
 * prévenir se lit comme une perte de données » est faite.
 */
export interface NextPlanLife {
  readonly anchor: string;
  /** LE DERNIER JOUR VIVANT — c'est CE jour-là que l'écran affiche (§6). */
  readonly lastDay: string;
  /** Le premier jour SANS la ligne. `lastDay + 1`. */
  readonly expiredFrom: string;
}

export function nextPlanLifeOf(writtenAt: unknown): NextPlanLife | null {
  const anchor = isoMondayOf(writtenAt);
  if (!anchor) return null;
  return {
    anchor,
    lastDay: addDays(anchor, NEXT_PLAN_WINDOW_DAYS - 1),
    expiredFrom: addDays(anchor, NEXT_PLAN_WINDOW_DAYS),
  };
}

/**
 * CETTE LIGNE EST-ELLE ENCORE VIVANTE ? Jumeau front d'`isNextPlanItemAlive`.
 *
 * ── LES TROIS REFUS, ET AUCUN N'EST UN REPLI ──────────────────────────────
 * 1. `scope !== "next_plan"` ⇒ `false`. Ce n'est pas « il n'expire jamais »:
 *    un `durable` rangé dans le magasin provisoire est un producteur cassé, et
 *    lui rendre `true` lui imprimerait à l'écran une date d'expiration qu'il
 *    n'a pas.
 * 2. ancre illisible ⇒ `false`.
 * 3. `today` illisible ⇒ `false`.
 *
 * ⚠️ AUCUNE BORNE BASSE, ET C'EST DÉLIBÉRÉ. Une ligne ancrée à la semaine
 * PROCHAINE est vivante AUJOURD'HUI: la règle s'appelle « expiration », pas
 * « activation ». La cacher jusqu'au lundi ferait disparaître de l'écran ce que
 * la personne vient d'y déposer — le défaut exact que cette section existe pour
 * fermer.
 */
export function isNextPlanItemAlive(
  item: RetainedItem,
  writtenAt: string,
  today: string,
): boolean {
  if (!item || item.scope !== "next_plan") return false;
  const life = nextPlanLifeOf(writtenAt);
  if (!life) return false;
  const day = parseRetainedDay(today);
  if (!day) return false;
  // `YYYY-MM-DD` est ordonné lexicographiquement — la comparaison de chaînes
  // est déjà celle qu'`accident.ts` fait sur ses dates de plan.
  return day <= life.lastDay;
}

/** Ce que le magasin provisoire rend, et ce qu'il a refusé. */
export interface NextPlanReadout {
  readonly entries: NextPlanEntry[];
  /** Les entrées illisibles, GARDÉES pour être réémises telles quelles. */
  readonly opaque: OpaqueRetainedRow[];
  readonly refused: RetainedItemsRefusals;
}

/**
 * Lit `practical_constraints.retained_next_plan`.
 *
 * La forme stockée est `[{ item, anchor }]`, figée par le chef d'orchestre.
 * Une entrée dont l'ancre est illisible TOMBE — et elle est comptée: une envie
 * dont on ne sait pas dire quand elle meurt ne s'affiche pas, mais son absence
 * doit se voir.
 */
export function readNextPlanEntries(
  constraints: Record<string, unknown> | null | undefined,
): NextPlanReadout {
  const raw = (constraints ?? {})[NEXT_PLAN_ITEMS_KEY];
  if (!Array.isArray(raw)) {
    const broken = raw === undefined || raw === null ? 0 : 1;
    return {
      entries: [],
      opaque: [],
      refused: {
        total: broken,
        forbiddenProducer: 0,
        malformed: broken,
        notDurable: 0,
      },
    };
  }

  const entries: NextPlanEntry[] = [];
  const opaque: OpaqueRetainedRow[] = [];
  let forbiddenProducer = 0;
  let malformed = 0;
  let notDurable = 0;
  for (const row of raw) {
    const record = asRecord(row);
    const item = record ? parseRetainedItem(record.item) : null;
    // ⛔ MÊME RÈGLE QUE LE MAGASIN DURABLE: tout ce qui n'entre pas dans
    // `entries` est GARDÉ TEL QUEL et réémis à sa place. Une envie qu'on ne sait
    // pas lire n'est pas une envie qu'on a le droit de jeter.
    const keep = () => opaque.push({ raw: row, after: entries.length });
    if (!item) {
      keep();
      const source = record
        ? parseRetainedSource(asRecord(record.item)?.source)
        : null;
      const kind = record
        ? parseRetainedKind(asRecord(record.item)?.kind)
        : null;
      if (kind && source && !canProduce(source, kind)) forbiddenProducer += 1;
      else malformed += 1;
      continue;
    }
    // ⚠️ MIROIR DU REFUS N°1 DU LOT 1B: un `durable` rangé ici est un
    // producteur cassé, pas une ligne qui n'expire jamais. On le compte sous le
    // motif « mauvais magasin » — le même mot que le durable emploie pour un
    // `next_plan` chez lui, dans l'autre sens.
    if (item.scope !== "next_plan") {
      keep();
      notDurable += 1;
      continue;
    }
    const anchor = isoMondayOf(record?.anchor);
    if (!anchor) {
      keep();
      malformed += 1;
      continue;
    }
    entries.push({ item, anchor });
  }

  return {
    entries,
    opaque,
    refused: {
      total: forbiddenProducer + malformed + notDurable,
      forbiddenProducer,
      malformed,
      notDurable,
    },
  };
}

/** Ce qui vaut encore aujourd'hui. Pur: le jour arrive en paramètre. */
export function liveNextPlanEntries(
  entries: readonly NextPlanEntry[],
  today: string,
): NextPlanEntry[] {
  return entries.filter((entry) =>
    isNextPlanItemAlive(entry.item, entry.anchor, today)
  );
}

/**
 * Rend un `practical_constraints` NEUF portant ces lignes provisoires.
 *
 * ⚠️ LE FILTRE EST TOUJOURS ARMÉ, comme celui du magasin durable en face: seul
 * le `next_plan` entre. Un `durable` rangé ici ressortirait avec une date
 * d'expiration inventée.
 *
 * ⛔ CE N'EST PAS LE CHEMIN D'ÉCRITURE DE CET ÉCRAN — même avertissement que son
 * jumeau durable: elle ne recolle pas les entrées opaques. `writePortArgsFor`
 * le fait.
 */
export function withNextPlanEntries(
  constraints: Record<string, unknown> | null | undefined,
  entries: readonly NextPlanEntry[],
): Record<string, unknown> {
  const base = { ...(constraints ?? {}) } as Record<string, unknown>;
  base[NEXT_PLAN_ITEMS_KEY] = partitionForNextPlanStore(entries).provisional
    .map((entry) => ({
      item: retainedItemToJson(entry.item),
      anchor: entry.anchor,
    }));
  return base;
}

/**
 * Ce qui a le droit d'entrer dans le magasin provisoire, et ce qui n'y entre
 * pas. Rend le refus DICIBLE — `withNextPlanEntries` filtre de toute façon.
 */
export function partitionForNextPlanStore(
  entries: readonly NextPlanEntry[],
): { provisional: NextPlanEntry[]; misfiled: NextPlanEntry[] } {
  const provisional: NextPlanEntry[] = [];
  const misfiled: NextPlanEntry[] = [];
  for (const entry of entries ?? []) {
    const ok = entry?.item?.scope === "next_plan" &&
      isoMondayOf(entry?.anchor) === entry?.anchor;
    (ok ? provisional : misfiled).push(entry);
  }
  return { provisional, misfiled };
}

// ===========================================================================
// LA LECTURE ET L'ÉCRITURE
// ===========================================================================

/**
 * Ce que la surface « Ce que Sophia sait de toi » tient en main.
 *
 * ⚠️ `rawItems`, `rawNextPlan` ET `rawNotes` SONT LES COPIES BRUTES, ET ELLES NE
 * SONT PAS DÉCORATIVES. Ce sont elles qu'on renvoie en `p_expected*` à
 * l'écriture: la concurrence optimiste compare la valeur LIVE à celle qu'on a
 * LUE, et une liste reconstruite depuis les items parsés ne serait pas la même —
 * les lignes refusées en auraient disparu. Comparer une valeur reconstruite
 * reviendrait à réécrire par-dessus les lignes qu'on n'a pas su lire,
 * c'est-à-dire à les supprimer en silence.
 *
 * ⚠️ `rawNotes` EXISTE POUR LA MÊME RAISON, ET IL A MANQUÉ. `p_expected_notes`
 * partait avec `legacyNotes` — la liste RECONSTRUITE par `keptFrom`, qui `trim()`
 * et `filter(Boolean)`. Une entrée stockée porteuse d'une espace, ou vide, ne
 * matchait donc PLUS JAMAIS le prédicat: tout reclassement d'ancienne note
 * rendait `stale_snapshot` à l'infini, c'est-à-dire un bouton mort qui accuse
 * un fantôme. Les trois `expected` sont maintenant du jsonb BRUT, tous les trois.
 *
 * ⚠️ `opaqueItems` / `opaqueNextPlan` SONT LA MOITIÉ QUI MANQUAIT EN FACE:
 * `p_expected` protégeait la comparaison, rien ne protégeait la CHARGE UTILE.
 * Voir `OpaqueRetainedRow` et `reglueOpaqueRows`.
 */
export interface KnownStore {
  /** `false` tant qu'aucune ligne `student_goals` n'existe: rien à écrire. */
  readonly hasGoal: boolean;
  readonly constraints: Record<string, unknown>;
  readonly rawItems: unknown;
  readonly rawNextPlan: unknown;
  /** Le jsonb BRUT de `food_preferences`, pour `p_expected_notes`. */
  readonly rawNotes: unknown;
  readonly items: RetainedItem[];
  readonly nextPlan: NextPlanEntry[];
  readonly opaqueItems: OpaqueRetainedRow[];
  readonly opaqueNextPlan: OpaqueRetainedRow[];
  readonly legacyNotes: string[];
  readonly legacyOrigin: Record<string, FoodPreferenceOrigin>;
  readonly dismissed: string[];
  readonly refused: RetainedItemsRefusals;
  /**
   * ⚠️ TAXONOMIE EMPRUNTÉE, ET C'EST SIGNALÉ PLUTÔT QUE RÉPARÉ. Le lot 1B compte
   * ses refus sous `{malformed, noAnchor, notNextPlan}`; ce champ réutilise la
   * taxonomie DURABLE `{forbiddenProducer, malformed, notDurable}`, et la
   * correspondance est: `noAnchor` → `malformed`, `notNextPlan` → `notDurable`
   * (le mot dit alors « mauvais magasin », pas « pas durable »), plus un
   * `forbiddenProducer` que 1B, lui, range dans `malformed`. Les deux tables
   * comptent la même chose et ne se croisent nulle part — l'écran ne lit que
   * `total`. Renommer côté front ne changerait aucun comportement et
   * coupleraient ce test au fichier d'un autre lot.
   */
  readonly nextPlanRefused: RetainedItemsRefusals;
}

/**
 * Compose le magasin depuis un `practical_constraints`. PUR, et exporté: c'est
 * la seule porte d'entrée légitime d'un `KnownStore`, y compris pour un test ou
 * une sonde — un magasin assemblé à la main aurait des `opaque*` vides, donc
 * exactement la propriété qu'on cherche à vérifier.
 */
export function knownStoreFrom(
  constraints: Record<string, unknown> | null,
  hasGoal: boolean,
): KnownStore {
  const pc = constraints ?? {};
  const read = readRetainedItems(pc);
  const provisional = readNextPlanEntries(pc);
  return {
    hasGoal,
    constraints: pc,
    rawItems: pc[RETAINED_ITEMS_KEY] ?? null,
    rawNextPlan: pc[NEXT_PLAN_ITEMS_KEY] ?? null,
    rawNotes: pc[FOOD_PREFERENCES_KEY] ?? null,
    items: read.items,
    nextPlan: provisional.entries,
    opaqueItems: read.opaque,
    opaqueNextPlan: provisional.opaque,
    legacyNotes: read.legacyNotes,
    legacyOrigin: originFrom(pc),
    dismissed: dismissedFrom(pc),
    refused: read.refused,
    nextPlanRefused: provisional.refused,
  };
}

/**
 * Lit la ligne de la personne — SCOPÉE SUR `user_id`, et RLS n'en dispense pas.
 *
 * `student_goals` porte une policy COACH en plus de celle du propriétaire, et
 * les policies s'ADDITIONNENT: sans ce filtre, quelqu'un qui est à la fois
 * coach et mangeur lit la ligne d'un de ses élèves. Sur un écran qui s'appelle
 * « ce que Sophia sait de TOI », ce serait la pire version possible du défaut.
 */
export async function loadKnownStore(userId: string): Promise<KnownStore> {
  const { data, error } = await supabase
    .from("student_goals")
    .select("practical_constraints")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`[keel/api] loadKnownStore: ${error.message}`);
  if (!data) return knownStoreFrom(null, false);
  const pc = (data as { practical_constraints: Record<string, unknown> | null })
    .practical_constraints;
  return knownStoreFrom(pc ?? {}, true);
}

/**
 * LES REFUS NOMMÉS D'UNE ÉCRITURE CIBLÉE. Liste FERMÉE, et chacun dit une chose
 * DIFFÉRENTE à la personne — c'est tout l'intérêt de les nommer.
 *
 * ⚠️ `stale_snapshot` N'EST PAS UN FOURRE-TOUT, ET IL L'A ÉTÉ. Sa copie dit
 * « quelque chose a changé ici pendant que tu modifiais »: elle affirme
 * l'existence d'un TIERS. Or `callWritePort` étiquetait ainsi TOUTE erreur
 * PostgREST autre que `PGRST202` — un réseau coupé, un 500, un refus RLS
 * accusaient donc une concurrence imaginaire, et envoyaient la personne
 * recharger une page qui n'avait pas bougé.
 *
 * ⛔ SEULE LA RPC A LE DROIT DE DIRE `stale_snapshot`, parce qu'elle est la
 * seule à l'avoir MESURÉ: son prédicat a comparé la valeur live à la valeur lue.
 * Tout le reste est `write_failed` — L'INCONNU, NOMMÉ COMME TEL.
 */
export const KNOWN_WRITE_REFUSALS = [
  "no_user",
  "no_goal_row",
  "bad_items",
  "bad_next_plan",
  "bad_notes",
  "stale_snapshot",
  "no_write_port",
  /** La clé n'est pas une LISTE: écrire détruirait ce qu'on ne sait pas lire. */
  "opaque_store",
  /** ⚠️ L'INCONNU. Ni une concurrence, ni une forme refusée: on ne sait pas. */
  "write_failed",
] as const;
export type KnownWriteRefusal = (typeof KNOWN_WRITE_REFUSALS)[number];

/**
 * Le motif rendu par la RPC, ou `null` si ce n'en est pas un.
 *
 * ⚠️ PAS DE `as KnownWriteRefusal` SUR LE CORPS DE LA RÉPONSE. Cicatrice nommée
 * du dépôt: « `as` sur un type étranger désarme le typecheck » — un motif que
 * personne ne connaît passerait alors jusqu'à la table des clés i18n, qui
 * rendrait `undefined`, et l'écran afficherait le message générique en croyant
 * afficher le bon.
 */
export function parseKnownWriteRefusal(value: unknown): KnownWriteRefusal | null {
  const slug = String(value ?? "").trim().toLowerCase();
  return (KNOWN_WRITE_REFUSALS as readonly string[]).includes(slug)
    ? slug as KnownWriteRefusal
    : null;
}

export class KnownWriteError extends Error {
  readonly refusal: KnownWriteRefusal;
  constructor(refusal: KnownWriteRefusal, detail?: string) {
    super(detail ? `${refusal}: ${detail}` : refusal);
    this.name = "KnownWriteError";
    this.refusal = refusal;
  }
}

/**
 * ⛔ POURQUOI UNE RPC, ET SURTOUT PAS UN `update` DE LA COLONNE ENTIÈRE.
 *
 * Écrire tout `practical_constraints` fait disparaître, SANS UN MOT, ce qu'un
 * autre onglet ou un autre écran vient d'y poser — c'est le défaut que le lot
 * C3 a fermé dans ce dépôt, et le rythme de repas en a été la victime mesurée.
 * La cicatrice jumelle est écrite aussi: « `current` périmé efface l'écriture
 * d'avant », et le symptôme, deux écrans plus loin, est « le bouton ne fait
 * rien ».
 *
 * ⚠️ ET RELIRE JUSTE AVANT D'ÉCRIRE NE FERME PAS LA FENÊTRE, ÇA LA RÉTRÉCIT —
 * c'est écrit dans la migration de `keel_write_food_preferences`, et ça
 * ressemble alors trait pour trait à une garde qui marche. La garde est donc
 * dans le PRÉDICAT d'un seul énoncé.
 *
 * ⚠️ ⛔ CE PORT N'EXISTE PAS TANT QU'UN HUMAIN N'A PAS LANCÉ LA MIGRATION
 * `20260818240000_a_write_port_for_what_sophia_knows.sql`. Tant qu'elle dort,
 * PostgREST rend `PGRST202` et cette fonction lève `no_write_port` — un refus
 * NOMMÉ, rendu à l'endroit du geste. Un écran qui dirait « enregistré »
 * par-dessus une fonction absente serait le 204 silencieux que tout ce module
 * existe pour empêcher.
 *
 * ── ⛔ ET IL N'ACCUSE PAS UN TIERS QUI N'EXISTE PAS ────────────────────────
 * Toute erreur de transport était étiquetée `stale_snapshot`, dont la copie dit
 * « quelque chose a changé ici pendant que tu modifiais ». Un réseau coupé, un
 * 500, un refus RLS accusaient donc une concurrence IMAGINAIRE — et envoyaient
 * la personne recharger une page qui n'avait pas bougé. Le refus était au bon
 * endroit (sous le bouton pressé); c'est le NOM qui mentait.
 *
 * Deux cas se distinguent honnêtement d'une erreur PostgREST, et deux seulement:
 * `PGRST202` (la fonction n'est pas dans le schéma — rien à réessayer tant que
 * la migration dort) et tout le reste, qui est `write_failed`: l'inconnu, dit
 * comme tel, avec le code et le message en détail pour qui lit la console.
 * `stale_snapshot` ne peut plus venir que du CORPS de la réponse — c'est-à-dire
 * de la seule instance qui l'ait mesuré.
 */
async function callWritePort(args: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.rpc("keel_write_retained_items", args);
  if (error) {
    const code = String((error as { code?: string }).code ?? "");
    // `PGRST202` = la fonction n'est pas dans le schéma exposé. C'est le seul
    // cas où l'écran doit dire autre chose qu'« ça n'a pas pu s'enregistrer »:
    // il n'y a rien à réessayer tant que la migration n'est pas passée.
    if (code === "PGRST202") {
      throw new KnownWriteError("no_write_port", error.message);
    }
    throw new KnownWriteError(
      "write_failed",
      `${code || "sans code"}: ${error.message}`,
    );
  }
  const row = (data ?? {}) as { ok?: boolean; reason?: unknown };
  if (row.ok === true) return;
  // Un motif que ce module ne connaît pas est un INCONNU de plus, pas un
  // `stale_snapshot` de repli: la RPC et le front ont bougé séparément.
  const named = parseKnownWriteRefusal(row.reason);
  if (named) throw new KnownWriteError(named);
  throw new KnownWriteError("write_failed", `motif inconnu: ${String(row.reason)}`);
}

/** Ce que la surface demande d'écrire, en un seul geste. */
export interface KnownWriteRequest {
  readonly store: KnownStore;
  readonly items: readonly RetainedItem[];
  readonly nextPlan: readonly NextPlanEntry[];
  /**
   * `null` = ne touche pas aux anciennes notes. Ce n'est pas un paramètre de
   * garde désarmable: quand il est fourni, son `expected` l'est aussi, et la RPC
   * REFUSE (`bad_notes`) un couple incomplet au lieu de deviner.
   */
  readonly notes: {
    readonly legacyNotes: readonly string[];
    readonly legacyOrigin: Record<string, FoodPreferenceOrigin>;
  } | null;
}

/**
 * LA CLÉ EST-ELLE ÉCRIVABLE DU TOUT ? `null` = oui.
 *
 * ⛔ Un magasin qui n'est pas une LISTE n'a aucune place où recoller ce qu'on
 * n'a pas su lire. Écrire par-dessus le détruirait; l'écran REFUSE donc, et il
 * le dit AVANT le geste autant qu'après. C'est le seul endroit de ce module où
 * « rien ne peut s'enregistrer » est la bonne réponse — et c'est aussi le seul
 * où un refus visible vaut mieux qu'un écrasement invisible.
 */
export function opaqueStoreRefusal(store: KnownStore): string | null {
  const broken = (raw: unknown) =>
    raw !== null && raw !== undefined && !Array.isArray(raw);
  if (broken(store?.rawItems)) return RETAINED_ITEMS_KEY;
  if (broken(store?.rawNextPlan)) return NEXT_PLAN_ITEMS_KEY;
  return null;
}

/**
 * LA CHARGE UTILE DE LA RPC — PURE, ET C'EST DÉLIBÉRÉ.
 *
 * Séparée de l'appel réseau parce que c'est ELLE qui porte les deux propriétés
 * que ce lot existe pour tenir, et qu'une propriété qu'on ne peut pas mesurer
 * sans base est une propriété qu'on n'a pas:
 *
 * ① **RIEN NE SE PERD.** `p_items` et `p_next` réémettent les lignes que la
 *    lecture a refusées, À LEUR PLACE (`reglueOpaqueRows`). Sans ça, la RPC
 *    remplaçant la clé entière, un simple retrait de note effaçait toute ligne
 *    illisible — mesuré: 2 stockées, 1 écrite.
 * ② **LES TROIS `expected` SONT DU JSONB BRUT.** `p_expected_notes` partait
 *    reconstruit (`keptFrom` trime et jette les vides) pendant que ses deux
 *    voisins étaient bruts: une entrée stockée porteuse d'une espace ne matchait
 *    donc plus jamais le prédicat, et tout reclassement rendait `stale_snapshot`
 *    à l'infini — un bouton mort qui accuse un fantôme.
 *
 * ⚠️ `p_notes`, LUI, RESTE NORMALISÉ, ET L'ASYMÉTRIE EST VOULUE. Une phrase
 * rognée est la MÊME phrase, une entrée vide ne porte rien, et
 * `saveFoodPreferences` écrit déjà cette forme-là. Une ligne retenue illisible,
 * elle, porte un `kind`, un sujet, une date et une source que rien d'autre ne
 * détient — les deux ne sont pas la même perte.
 */
export function writePortArgsFor(
  args: KnownWriteRequest,
): Record<string, unknown> {
  const unwritable = opaqueStoreRefusal(args.store);
  if (unwritable) throw new KnownWriteError("opaque_store", unwritable);

  const { durable, notDurable } = partitionForDurableStore(args.items);
  if (notDurable.length > 0) {
    // Le dire ici plutôt que le laisser filtrer en silence: une ligne qui
    // s'évapore entre le clic et la relecture est la panne que ce chantier
    // existe pour empêcher.
    throw new KnownWriteError("bad_items", `${notDurable.length} next_plan`);
  }
  const { provisional, misfiled } = partitionForNextPlanStore(args.nextPlan);
  if (misfiled.length > 0) {
    throw new KnownWriteError("bad_next_plan", `${misfiled.length} mal ancrées`);
  }

  let notes: string[] | null = null;
  let origin: Record<string, FoodPreferenceOrigin> | null = null;
  if (args.notes) {
    notes = args.notes.legacyNotes.map((n) => n.trim()).filter(Boolean);
    // L'ORIGINE EST TAILLÉE SUR CE QUI RESTE — même règle que
    // `saveFoodPreferences`: une entrée dont le texte n'est plus gardé n'a plus
    // rien à pointer, et la laisser ferait grossir le jsonb à chaque édition.
    const keys = new Set(notes.map((n) => n.toLowerCase()));
    origin = {};
    for (const [key, entry] of Object.entries(args.notes.legacyOrigin ?? {})) {
      if (keys.has(key)) origin[key] = entry;
    }
  }

  return {
    p_expected: args.store.rawItems ?? null,
    p_items: reglueOpaqueRows(
      durable.map(retainedItemToJson),
      args.store.opaqueItems ?? [],
    ),
    p_expected_next: args.store.rawNextPlan ?? null,
    p_next: reglueOpaqueRows(
      provisional.map((entry) => ({
        item: retainedItemToJson(entry.item),
        anchor: entry.anchor,
      })),
      args.store.opaqueNextPlan ?? [],
    ),
    // ⛔ LE JSONB BRUT, COMME SES DEUX VOISINS. Jamais `store.legacyNotes`.
    p_expected_notes: notes === null ? null : args.store.rawNotes ?? null,
    p_notes: notes,
    p_origins: origin,
  };
}

/**
 * Écrit les magasins de cet écran — et RIEN d'autre dans la colonne.
 *
 * ⚠️ LES DEUX MOITIÉS D'UN RECLASSEMENT NE SE SÉPARENT PAS. Retirer la phrase
 * plate puis ajouter la ligne rangée en deux écritures laisse une fenêtre où la
 * personne a perdu sa note sans avoir gagné sa ligne — ou l'inverse, où elle
 * lit la même chose deux fois. La RPC prend donc les couples (attendu, nouveau)
 * et n'écrit que si TOUS les prédicats tiennent.
 */
export async function persistKnownStore(args: KnownWriteRequest): Promise<void> {
  await callWritePort(writePortArgsFor(args));
}

// ===========================================================================
// L'EXCEPTION DU SUJET NON PRÉCISÉ — et elle n'est pas négociable
// ===========================================================================

/**
 * Une bouche, réduite à ce dont cette règle a besoin.
 *
 * ⚠️ `ageState` ET PAS `isMinor`. Le booléen a été RETIRÉ du dépôt exprès: « je
 * ne sais pas » et « majeur » doivent produire des résultats OPPOSÉS, et
 * l'ancien `coalesce(…, false)` les confondait DU MAUVAIS CÔTÉ — un enfant sans
 * date renseignée recevait une direction d'adulte, en silence.
 *
 * ⚠️ LE TYPE EST RECOPIÉ DE `api/household.ts` (`MemberAgeState`) plutôt
 * qu'importé, et le test le prouve égal: importer ce module-là traînerait le
 * graphe du foyer — donc ses namespaces i18n — dans un module que la page neuve
 * lit seule.
 */
export type RetainedMemberAgeState = "minor" | "adult" | "unknown";

export interface PortionAdjustMember {
  readonly memberId: string;
  readonly ageState: RetainedMemberAgeState;
}

/** Pourquoi une bouche a été retirée d'un ajustement. Liste fermée. */
export const PORTION_ADJUST_EXCLUSIONS = [
  "minor",
  "age_unknown",
  "not_in_household",
] as const;
export type PortionAdjustExclusion =
  (typeof PORTION_ADJUST_EXCLUSIONS)[number];

/**
 * Qui reçoit l'ajustement, et qui en est retiré — AVEC LE MOTIF.
 *
 * Les deux listes sortent ensemble parce que la nomenclature l'exige: « le
 * mineur est simplement exclu de l'ajustement; rien n'échoue, ET LE CONSTAT LE
 * DIT ». Sur cette surface, LE CONSTAT EST L'ÉCRAN: un appelant qui ne
 * recevrait qu'`included` ne pourrait pas l'écrire, et l'exclusion redeviendrait
 * le geste silencieux qu'elle existe pour empêcher.
 */
export interface PortionAdjustAudience {
  readonly included: readonly string[];
  readonly excluded: readonly {
    readonly memberId: string;
    readonly reason: PortionAdjustExclusion;
  }[];
}

/**
 * À QUELLES BOUCHES S'APPLIQUE UN `portion.adjust` ? Miroir front du socle.
 *
 * Si le sujet n'est pas précisé, ça concerne tout le monde. UNE exception: un
 * ajustement **À LA BAISSE** ne s'applique pas à un mineur sans sujet
 * explicite. Réduire l'assiette d'un enfant en croissance à partir d'une
 * remarque non attribuée d'un adulte est exactement le geste silencieux que le
 * reste du produit interdit (plancher TCA, consentement de restriction).
 *
 * ⚠️ `unknown` EST EXCLU COMME UN MINEUR, et c'est le socle qui va plus loin
 * que la nomenclature, assumé: l'âge est FACULTATIF à la saisie, donc une fiche
 * d'enfant sans date vaut `unknown`, pas `minor` — une garde qui n'exclurait
 * que `minor` ne mordrait PAS dans le cas le plus courant (cicatrice
 * « ceinture armée sur coffre vide »). Asymétrie des dégâts: exclure à tort un
 * adulte lui laisse une part standard, VISIBLE dans le constat; inclure à tort
 * un enfant lui retire de la nourriture, en silence.
 *
 * ⚠️ AUCUN PARAMÈTRE DE GARDE OPTIONNEL: `members` est requis. Cicatrice
 * « paramètre de garde optionnel = garde désarmée ».
 */
export function subjectsForPortionAdjust(
  item: PortionAdjustItem,
  members: readonly PortionAdjustMember[],
): PortionAdjustAudience {
  const roster = members ?? [];

  const named = subjectMemberId(item.subject);
  if (named !== null) {
    // Un sujet EXPLICITE n'est jamais filtré: la personne a nommé la bouche
    // avec la liste du foyer sous les yeux — une réponse à une question fermée,
    // pas une inférence.
    const known = roster.some((m) =>
      String(m.memberId).trim().toLowerCase() === named
    );
    return known
      ? { included: [named], excluded: [] }
      // Une bouche partie du foyer: l'item est périmé, pas malformé. On ne
      // l'applique à personne, et surtout pas à tout le monde par repli.
      : {
        included: [],
        excluded: [{ memberId: named, reason: "not_in_household" }],
      };
  }

  const included: string[] = [];
  const excluded: { memberId: string; reason: PortionAdjustExclusion }[] = [];
  for (const member of roster) {
    const id = String(member.memberId ?? "").trim();
    if (!id) continue;
    // À LA HAUSSE, personne n'est retiré: la règle protège d'un RETRAIT de
    // nourriture, pas d'une part plus grande servie à un enfant qui grandit.
    if (item.value.direction === "up") {
      included.push(id);
      continue;
    }
    if (member.ageState === "minor") {
      excluded.push({ memberId: id, reason: "minor" });
      continue;
    }
    if (member.ageState === "unknown") {
      excluded.push({ memberId: id, reason: "age_unknown" });
      continue;
    }
    included.push(id);
  }
  return { included, excluded };
}

// ===========================================================================
// LE ROSTER, RÉDUIT À CE QUE LA SURFACE EN A BESOIN
// ===========================================================================

/** Une bouche telle que l'écran de transparence la nomme. */
export interface KnownMouth {
  readonly memberId: string;
  readonly displayName: string;
  readonly ageState: RetainedMemberAgeState;
}

/**
 * Les bouches du foyer — par la MÊME RPC que `/app/household`.
 *
 * ⚠️ LA RPC PLUTÔT QUE `api/household.ts`, ET CE N'EST PAS DE L'ÉVITEMENT.
 * `loadHousehold` rend une vue riche (objectifs, absences, régimes, rythmes) et
 * traîne avec elle le graphe du foyer — donc ses namespaces i18n — dans une
 * page qui n'affiche RIEN de tout ça. `keel_household_roster` est l'autorité des
 * deux côtés: on ne recalcule pas l'âge, on le lit là où il est DÉRIVÉ.
 *
 * ⚠️ UN JETON D'ÂGE HORS VOCABULAIRE VAUT `unknown`, JAMAIS `adult` — la même
 * direction sûre qu'en base. « Je ne sais pas » et « majeur » doivent produire
 * des résultats OPPOSÉS sur un ajustement à la baisse: l'un protège l'assiette
 * d'un enfant, l'autre la réduit.
 *
 * ⚠️ UNE LISTE VIDE EST UN ÉTAT NORMAL, PAS UNE PANNE: un compte SOLO n'a pas
 * de foyer (`SetupPage.tsx`: « LE SOLO NE CRÉE PAS DE FOYER »), et l'entrée du
 * produit est à une bouche. La date de naissance, elle, ne traverse jamais le
 * réseau — le foyer a besoin de savoir qu'il y a un enfant à table, pas de sa
 * date.
 */
export async function loadKnownRoster(): Promise<KnownMouth[]> {
  const { data, error } = await supabase.rpc("keel_household_roster");
  // Le refus se DIT à l'appelant. Il ne se replie pas sur une liste vide: un
  // roster vide et un roster illisible produisent le même écran, et seul le
  // second est un défaut.
  if (error) throw new Error(`[keel/api] loadKnownRoster: ${error.message}`);
  const rows = Array.isArray(data) ? data : [];
  const out: KnownMouth[] = [];
  for (const raw of rows) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const memberId = String(row.member_id ?? "").trim();
    if (!memberId) continue;
    const age = String(row.age_state ?? "");
    out.push({
      memberId,
      // Un prénom vide rend un cadratin, JAMAIS l'e-mail en repli: ça
      // divulguerait une adresse à tout le foyer.
      displayName: String(row.first_name ?? "").trim() || "—",
      ageState: age === "minor" || age === "adult" ? age : "unknown",
    });
  }
  return out;
}
