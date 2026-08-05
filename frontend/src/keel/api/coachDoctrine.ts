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
  muscle_gain: "Gaining muscle",
  // « Recomposition » est du jargon: le coach connaît le mot, mais il choisit
  // ici pour des élèves, et le mot ne dit pas ce que l'objectif fait. Le
  // libellé porte donc la signature de l'objectif — le poids tient, la
  // silhouette change — qui est aussi exactement ce que le générateur mesure.
  recomposition: "Same weight, different shape",
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
 * Ce qu'une portée dit au coach, en une phrase.
 *
 * « Everyone » est affiché comme une VALEUR et pas comme un vide: la portée
 * vide est le cas de l'écrasante majorité des entrées, et un coach ne doit pas
 * avoir l'impression d'avoir laissé son travail inachevé.
 */
export function scopeSentence(scope: readonly string[] | undefined): string {
  const goals = (scope ?? []).filter((g) => (GOAL_TOKENS as readonly string[]).includes(g));
  if (goals.length === 0) return "Everyone";
  return goals.map((g) => GOAL_LABELS[g as GoalToken]).join(", ");
}

// ---------------------------------------------------------------------------
// L'ÉDITION — deux parties, et pas une de plus
// ---------------------------------------------------------------------------
//
// LA DOCTRINE S'ÉDITE, ELLE NE SE REDEMANDE PAS.
//
// L'écran ne chargeait le contenu écrit nulle part: pour corriger UNE phrase, un
// coach devait refaire l'interview entière et laisser l'IA tout recompiler. La
// doctrine courante remplit donc maintenant des CASES, et ces cases sont la
// source: ce qu'il tape est ce qui est stocké, sans passage par un modèle.
// L'interview reste ce qu'elle aurait dû rester — le chemin du premier jour.
//
// DEUX PARTIES, PARCE QUE LE PARTAGE N'EST PAS UNIFORME:
//   · GLOBALE  — sa voix, ses mots, ses interdits, ses aliments, et tout ce
//                qu'il pense de tous ses élèves. Le coach ne change pas de voix
//                parce qu'un élève veut prendre du muscle.
//   · SPÉCIFIQUE PAR DYNAMIQUE — ce qui ne s'adresse qu'à une sorte d'élève.
//                « Ne t'affole pas d'un plateau sur la balance » n'a de sens
//                qu'en perte de gras.
// Ni plus, ni moins: pas de troisième niveau, pas de portée multiple à cocher.

// ---------------------------------------------------------------------------
// LIRE D'ABORD, ÉCRIRE UNE SECTION À LA FOIS
// ---------------------------------------------------------------------------
//
// L'écran affichait TOUT en champs de saisie. On ne pouvait pas LIRE sa propre
// méthode — un formulaire n'est pas un document — et trente cases ouvertes
// donnent l'impression permanente d'un travail inachevé.
//
// L'état tient en deux choses: quelle section est ouverte, et ce qu'il y avait
// dedans à l'ouverture. La seconde est ce qui rend « Cancel » honnête.

export interface SectionState {
  /** La clé de la section ouverte, ou `null` si tout est en lecture. */
  readonly open: string | null;
  /** Le brouillon COMPLET tel qu'il était à l'ouverture. */
  readonly snapshot: DoctrineDraft | null;
}

export const SECTION_CLOSED: SectionState = { open: null, snapshot: null };

/**
 * Ouvrir une section. L'instantané est pris MAINTENANT.
 *
 * Ouvrir une autre section referme la première en gardant ses modifications
 * (c'est un « Done » implicite): l'instantané suit la section ouverte, jamais
 * l'écran entier, sinon annuler la deuxième défairait aussi la première.
 */
export function openSection(key: string, draft: DoctrineDraft): SectionState {
  return { open: key, snapshot: draft };
}

/** Fermer en GARDANT ce qui a été tapé. Ne persiste rien — c'est `save` qui écrit. */
export function closeSection(): SectionState {
  return SECTION_CLOSED;
}

/**
 * Fermer en RENDANT ce qu'il y avait avant.
 *
 * Sans instantané, « annuler » ne pourrait qu'être un bouton qui ferme la
 * section en gardant les dégâts — c'est-à-dire un bouton qui ment sur son nom.
 * Le brouillon rendu est celui de l'appelant s'il n'y a pas d'instantané: on ne
 * remplace jamais un état réel par `null`.
 */
export function cancelSection(
  state: SectionState,
  current: DoctrineDraft,
): { section: SectionState; draft: DoctrineDraft } {
  return { section: SECTION_CLOSED, draft: state.snapshot ?? current };
}

/** Une entrée du brouillon, avec sa position dans le tableau qui la porte. */
export interface IndexedEntry<T> {
  index: number;
  entry: T;
}

/**
 * Les entrées d'une liste qui appartiennent à UNE partie de l'écran.
 *
 * `goal === null` rend la partie GLOBALE (portée absente ou vide). Un objectif
 * rend ce qui le vise. L'index absolu voyage avec l'entrée: les deux parties
 * éditent le même tableau, et une vue filtrée qui perdrait sa position
 * écrirait dans la mauvaise entrée dès la première suppression.
 */
export function entriesForScope<T extends { goal_scope?: string[] }>(
  list: readonly T[] | undefined,
  goal: GoalToken | null,
): IndexedEntry<T>[] {
  return (list ?? [])
    .map((entry, index) => ({ index, entry }))
    .filter(({ entry }) => {
      const scope = (entry.goal_scope ?? []).filter(Boolean);
      return goal === null ? scope.length === 0 : scope.includes(goal);
    });
}

/** Remplace une entrée. Rend un nouveau tableau — React ne re-rend pas une mutation. */
export function patchEntry<T>(list: readonly T[] | undefined, index: number, patch: Partial<T>): T[] {
  return (list ?? []).map((e, i) => (i === index ? { ...e, ...patch } : e));
}

/** Ajoute une entrée à la fin. */
export function addEntry<T>(list: readonly T[] | undefined, entry: T): T[] {
  return [...(list ?? []), entry];
}

/** Retire une entrée. */
export function removeEntry<T>(list: readonly T[] | undefined, index: number): T[] {
  return (list ?? []).filter((_, i) => i !== index);
}

/**
 * Découpe une saisie de formulations en liste.
 *
 * Le coach tape « 6 petits repas, six small meals » sur une ligne; le verrou a
 * besoin de deux entrées. La virgule ET le retour à la ligne coupent, parce que
 * les deux sont naturels et qu'imposer l'un des deux ferait perdre la moitié
 * des formulations au premier coach qui choisit l'autre.
 */
export function splitForms(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** L'inverse, pour remplir la case. */
export function joinForms(forms: readonly string[] | undefined): string {
  return (forms ?? []).join(", ");
}

/**
 * Retire les lignes VIDES avant d'enregistrer.
 *
 * Un formulaire à boutons « + » produit forcément des lignes qu'on ouvre et
 * qu'on ne remplit pas. Sans ce nettoyage elles partent en base, `parseCoachDoctrine`
 * les lâche à la lecture en écrivant une `issue`, et le coach lit à chaque
 * ouverture une liste d'avertissements sur des lignes qu'il n'a jamais voulues.
 * Elles s'accumuleraient de version en version, puisque chaque enregistrement
 * copie la précédente.
 *
 * Le critère est le champ SANS LEQUEL l'entrée n'existe pas — la même règle
 * que le parseur du serveur, pour que l'écran et lui soient d'accord sur ce
 * qui compte comme une entrée.
 */
export function pruneDraft(draft: DoctrineDraft): DoctrineDraft {
  const has = (v: unknown) => String(v ?? "").trim().length > 0;
  return {
    ...draft,
    beliefs: (draft.beliefs ?? []).filter((b) => has(b.claim)),
    forbidden: (draft.forbidden ?? []).filter((f) => has(f.token)),
    vocabulary: (draft.vocabulary ?? []).filter((v) => has(v.term)),
    // Une demi-arbitration n'est pas un exemple plus faible, c'est un exemple
    // trompeur: une situation sans réponse apprend au modèle que le sujet
    // compte et lui laisse inventer la position du coach dessus.
    arbitrations: (draft.arbitrations ?? []).filter((a) => has(a.situation) && has(a.coach_answer)),
    foods: {
      discouraged: (draft.foods?.discouraged ?? []).filter((f) => has(f.term)),
    },
    qa: (draft.qa ?? []).filter((q) => has(q.question) && has(q.answer)),
  };
}
