/**
 * `/coach/doctrine` — l'aperçu par objectif, et les fonctions pures de l'écran.
 *
 * ---------------------------------------------------------------------------
 * L'APERÇU N'EST PAS UNE COPIE DU COMPILATEUR — C'EST LE COMPILATEUR
 * ---------------------------------------------------------------------------
 * Le coach coche un marqueur de portée sur une croyance, et il doit voir ce que
 * ce marqueur PRODUIT: le bloc qu'un élève en perte de gras recevra, et celui
 * qu'un élève en pleine forme ne recevra pas. C'est le seul moyen de vérifier
 * son geste — sinon il coche à l'aveugle dans une boîte noire qui écrit sa
 * méthode à sa place.
 *
 * Un aperçu qui RESSEMBLE à la compilation serait pire que pas d'aperçu: deux
 * implémentations divergent au premier changement, et le coach lirait une
 * promesse que Sophia ne tient pas. Ce module importe donc `doctrine.ts` — le
 * module Deno lui-même, celui que les tests couvrent et que le tour exécute.
 * Même discipline que `coachProtocol.ts` juste à côté.
 *
 * C'est possible parce que la chaîne est PURE: `doctrine.ts` n'importe que
 * `forbidden_matcher.ts` et `tokens.ts`, qui n'importent rien du tout. Aucune
 * API Deno, aucune I/O. Si quelqu'un ajoute un jour un import runtime Deno
 * dans l'un des trois, le typecheck du front casse — et c'est le bon endroit
 * pour l'apprendre.
 */

import {
  type CoachDoctrine,
  compileDoctrineBlock,
  type CompiledDoctrine,
  parseCoachDoctrine,
} from "../../../../supabase/functions/_shared/keel/doctrine.ts";
import {
  GOAL_TOKENS,
  type GoalToken,
} from "../../../../supabase/functions/_shared/keel/tokens.ts";

export type { CoachDoctrine, CompiledDoctrine, GoalToken };
export { GOAL_TOKENS };

/** La forme que l'éditeur manipule: celle que `coach-doctrine-v1` rend et lit. */
export interface DoctrineDraft {
  beliefs?: Array<{ claim?: string; rationale?: string | null; goal_scope?: string[] }>;
  forbidden?: Array<{
    token?: string;
    surface_forms?: string[];
    reason?: string | null;
    instead?: string | null;
  }>;
  vocabulary?: Array<{ term?: string; meaning?: string | null }>;
  arbitrations?: Array<{ situation?: string; coach_answer?: string; goal_scope?: string[] }>;
  foods?: {
    recommended?: Array<{ term?: string; reason?: string | null }>;
    discouraged?: Array<{ term?: string; surface_forms?: string[]; reason?: string | null }>;
  };
  qa?: Array<{ question?: string; answer?: string }>;
  voice?: Record<string, unknown>;
}

/**
 * LES CHAMPS QUI NE PRENNENT JAMAIS DE PORTÉE, et la phrase qui le dit.
 *
 * Sans ça, un coach cherche pendant dix minutes comment restreindre un interdit
 * — et le vrai risque n'est pas qu'il perde dix minutes, c'est qu'il conclue
 * que le produit a oublié un bouton. La raison est meilleure que l'absence de
 * bouton: un interdit qui ne vaut que pour certains élèves est une préférence.
 */
export const ALWAYS_SHARED_SECTIONS = ["voice", "vocabulary", "forbidden", "foods", "qa"] as const;

/** Le libellé d'un objectif, dans les mots d'un coach. */
export const GOAL_LABELS: Readonly<Record<GoalToken, string>> = {
  fat_loss: "Losing fat",
  recomposition: "Recomposition",
  performance: "Performance",
  health: "Health",
  maintenance: "Maintenance",
};

/** Les variantes, dans l'ordre du sélecteur. `null` = ce que reçoit tout le monde. */
export const PREVIEW_VARIANTS: readonly (GoalToken | null)[] = [null, ...GOAL_TOKENS];

export function variantLabel(goal: GoalToken | null): string {
  return goal === null ? "No goal set yet" : GOAL_LABELS[goal];
}

/**
 * Le brouillon de l'éditeur → la doctrine que le compilateur attend.
 *
 * Passe par `parseCoachDoctrine`, jamais par une conversion maison: c'est le
 * même parseur que le serveur, donc l'aperçu montre exactement ce qui sera
 * servi, y compris les entrées LÂCHÉES (une croyance sans texte, une portée
 * illisible) et les `issues` qui expliquent pourquoi.
 */
export function draftToDoctrine(
  draft: DoctrineDraft,
  coachDisplayName: string | null,
  contentLocale: string,
): { doctrine: CoachDoctrine; issues: string[] } {
  return parseCoachDoctrine({
    ...draft,
    coach_id: "preview",
    version: 0,
    coach_display_name: coachDisplayName,
    content_locale: contentLocale,
  });
}

export interface VariantPreview {
  goal: GoalToken | null;
  label: string;
  compiled: CompiledDoctrine;
  /** Cette variante rend le même bloc que la précédente qui partage son hash. */
  sharesCacheWith: (GoalToken | null)[];
}

/**
 * LES SIX VARIANTES, TELLES QUE LES ÉLÈVES LES REÇOIVENT.
 *
 * `sharesCacheWith` n'est pas une curiosité technique montrée au coach: c'est
 * ce qui lui dit « ces trois objectifs reçoivent exactement la même chose »,
 * donc que sa portée n'a pas fait ce qu'il croyait. Un coach qui restreint une
 * croyance à `fat_loss` et voit que `health` et `maintenance` reçoivent encore
 * le même bloc apprend quelque chose de vrai sur ce qu'il vient d'écrire.
 */
export function previewVariants(doctrine: CoachDoctrine): VariantPreview[] {
  const compiled = PREVIEW_VARIANTS.map((goal) => ({
    goal,
    label: variantLabel(goal),
    compiled: compileDoctrineBlock(doctrine, goal),
  }));
  return compiled.map((v) => ({
    ...v,
    sharesCacheWith: compiled
      .filter((o) => o.goal !== v.goal && o.compiled.hash === v.compiled.hash)
      .map((o) => o.goal),
  }));
}

/** Combien d'entrées de cache les variantes occupent réellement. */
export function cacheFootprint(doctrine: CoachDoctrine): { variants: number; entries: number } {
  const hashes = new Set(PREVIEW_VARIANTS.map((g) => compileDoctrineBlock(doctrine, g).hash));
  return { variants: PREVIEW_VARIANTS.length, entries: hashes.size };
}

/**
 * Bascule un objectif dans la portée d'une entrée. Rend TOUJOURS un nouveau
 * tableau: l'éditeur est en React, et muter en place ne re-rendrait rien.
 */
export function toggleGoalScope(
  scope: readonly string[] | undefined,
  goal: GoalToken,
): string[] {
  const current = scope ?? [];
  return current.includes(goal)
    ? current.filter((g) => g !== goal)
    : [...current, goal];
}

/**
 * Ce qu'une portée dit au coach, en une phrase.
 *
 * « Everyone » est affiché comme une VALEUR et pas comme un vide: la portée
 * vide est le cas de l'écrasante majorité des entrées, et un coach ne doit pas
 * avoir l'impression d'avoir laissé son travail inachevé. Même arbitrage que le
 * « neutre » du mapping alimentaire.
 */
export function scopeSentence(scope: readonly string[] | undefined): string {
  const goals = (scope ?? []).filter((g) => (GOAL_TOKENS as readonly string[]).includes(g));
  if (goals.length === 0) return "Everyone";
  return goals.map((g) => GOAL_LABELS[g as GoalToken]).join(", ");
}
