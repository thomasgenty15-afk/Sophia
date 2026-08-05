/**
 * `/coach/protocol` — la méthode du coach, et les fonctions pures de l'écran.
 *
 * ---------------------------------------------------------------------------
 * L'APERÇU N'EST PAS UNE COPIE DU COMPILATEUR — C'EST LE COMPILATEUR
 * ---------------------------------------------------------------------------
 * Le §2.4 du brief rend l'aperçu non négociable: le coach doit voir en
 * permanence les lignes que ses coches produisent, sinon il coche à l'aveugle
 * dans une boîte noire qui écrit sa méthode à sa place.
 *
 * Un aperçu qui RESSEMBLE à la compilation est pire que pas d'aperçu: il fait
 * confiance à deux implémentations qui divergeront au premier changement, et le
 * coach lira une promesse que Sophia ne tiendra pas. Ce module importe donc
 * `protocol_compiler.ts` — le module Deno lui-même, celui que les 30 tests
 * couvrent et que `plan-publish-v1` exécutera.
 *
 * C'est possible parce que le compilateur est PUR: ses seuls imports sont des
 * `import type`, effacés à la compilation. `allowImportingTsExtensions` +
 * résolution `bundler` font le reste. Si quelqu'un y ajoute un jour un import
 * Deno runtime, le typecheck du front casse — et c'est le bon endroit pour
 * l'apprendre.
 *
 * ---------------------------------------------------------------------------
 * LE VOCABULAIRE VIENT DE LA BASE, PAS D'UNE LISTE ICI
 * ---------------------------------------------------------------------------
 * Les 30 groupes et leurs 9 classes sont lus dans `food_groups`. Recopier la
 * taxonomie ici créerait une seconde source de vérité qui dériverait de la FK —
 * exactement ce que le vocabulaire fermé existe pour empêcher.
 */

import type { MessageKey } from "../i18n/t";

import {
  type CoachFoodRule,
  type CoachTerm,
  type CoachTimingRule,
  type CompiledCommitment,
  compileProtocol,
  diffCompiled,
  type GoalToken,
  type PreviewDescriptor,
  type ProtocolInput,
  type Stance,
} from "../../../../supabase/functions/_shared/keel/protocol_compiler.ts";

export type { CoachFoodRule, CoachTerm, CoachTimingRule, GoalToken, Stance };
export { compileProtocol, diffCompiled };
export type { CompiledCommitment, PreviewDescriptor, ProtocolInput };

// ---------------------------------------------------------------------------
// LE VOCABULAIRE FERMÉ
// ---------------------------------------------------------------------------

export interface FoodGroupRow {
  readonly slug: string;
  readonly class: string;
  readonly label_i18n_key: string;
}

/**
 * L'ordre des classes à l'écran.
 *
 * Ce n'est pas l'ordre alphabétique, et ce n'est pas l'ordre de la base: c'est
 * l'ordre dans lequel un coach de nutrition pense sa méthode. Les protéines et
 * les légumes d'abord (ce sur quoi presque tout protocole a une opinion), les
 * boissons et le discrétionnaire ensuite (là où se logent les exclusions).
 *
 * Une classe absente de cette liste est rendue À LA FIN plutôt que masquée: un
 * groupe neuf ajouté par migration doit apparaître même si personne n'a pensé à
 * mettre à jour cette constante. Masquer serait perdre silencieusement une
 * partie du vocabulaire.
 */
export const CLASS_ORDER: readonly string[] = [
  "protein",
  "vegetable",
  "fruit",
  "grain",
  "legume",
  "dairy",
  "fat",
  "beverage",
  "discretionary",
];

export function orderClasses(classes: readonly string[]): string[] {
  const known = CLASS_ORDER.filter((c) => classes.includes(c));
  const unknown = [...classes].filter((c) => !CLASS_ORDER.includes(c)).sort();
  return [...known, ...unknown];
}

export function groupByClass(
  rows: readonly FoodGroupRow[],
): { readonly className: string; readonly groups: readonly FoodGroupRow[] }[] {
  const byClass = new Map<string, FoodGroupRow[]>();
  for (const row of rows) {
    const list = byClass.get(row.class) ?? [];
    list.push(row);
    byClass.set(row.class, list);
  }
  return orderClasses([...byClass.keys()]).map((className) => ({
    className,
    groups: (byClass.get(className) ?? []).slice().sort((a, b) =>
      a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
    ),
  }));
}

// ---------------------------------------------------------------------------
// LA PASTILLE TRI-ÉTAT
// ---------------------------------------------------------------------------

/** `undefined` = neutre. C'est une VALEUR, pas un « non rempli ». */
export type StanceOrNeutral = Stance | undefined;

/**
 * Un tap fait défiler: neutre → encouragé → déconseillé → exclu → neutre.
 *
 * Un tap par décision, et le cycle se referme: trente décisions à un tap se
 * font en deux minutes; trente menus déroulants, jamais. Le retour au neutre
 * fait partie du cycle — sans lui, un coach qui se trompe est coincé et doit
 * chercher un geste d'annulation ailleurs.
 */
export function nextStance(current: StanceOrNeutral): StanceOrNeutral {
  switch (current) {
    case undefined:
      return "encouraged";
    case "encouraged":
      return "discouraged";
    case "discouraged":
      return "excluded";
    case "excluded":
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// LA RECHERCHE
// ---------------------------------------------------------------------------

/**
 * Filtre les pastilles — en COMPLÉMENT des cartes, jamais en remplacement.
 *
 * Elle accélère le coach qui sait déjà ce qu'il cherche sans imposer la page
 * blanche au débutant. Elle cherche dans le slug, dans le libellé traduit ET
 * dans les termes du coach: quelqu'un qui a écrit « kéfir » doit le retrouver
 * en tapant « kéfir », pas en devinant `dairy_yogurt`.
 */
export function matchesSearch(
  row: FoodGroupRow,
  label: string,
  terms: readonly CoachTerm[],
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  if (row.slug.toLowerCase().includes(q)) return true;
  if (label.toLowerCase().includes(q)) return true;
  return terms.some(
    (t) => t.food_group_ref === row.slug && t.term.toLowerCase().includes(q),
  );
}

// ---------------------------------------------------------------------------
// L'APERÇU, EN PHRASES
// ---------------------------------------------------------------------------

export interface PreviewSentence {
  readonly key: MessageKey;
  readonly params: Record<string, string | number>;
}

/**
 * Traduit le descripteur d'aperçu du compilateur en clé i18n + paramètres.
 *
 * Le compilateur est SANS LOCALE (R2) — il rend une structure, jamais une
 * phrase. Cette fonction est la seule frontière où la langue entre, et elle est
 * pure: elle ne rend pas la phrase, elle rend de quoi la rendre. C'est ce qui
 * permet de la tester sans monter React.
 */
export function previewSentence(
  preview: PreviewDescriptor,
  groupLabel: (slug: string) => string,
): PreviewSentence {
  const group = groupLabel(preview.group);
  switch (preview.kind) {
    case "encourage":
      return { key: "coach.protocol.preview.encourage", params: { group, n: preview.perDay } };
    case "discourage":
      return { key: "coach.protocol.preview.discourage", params: { group } };
    case "exclude":
      return { key: "coach.protocol.preview.exclude", params: { group } };
    case "portions":
      return {
        key: preview.direction === "at_least"
          ? (preview.period === "day"
            ? "coach.protocol.preview.at_least_day"
            : "coach.protocol.preview.at_least_week")
          : (preview.period === "day"
            ? "coach.protocol.preview.at_most_day"
            : "coach.protocol.preview.at_most_week"),
        params: { group, n: preview.portions },
      };
    case "every_meal":
      return { key: "coach.protocol.preview.every_meal", params: { group } };
    case "not_after":
      return {
        key: "coach.protocol.preview.not_after",
        params: { group, time: preview.cutoff },
      };
    case "at_slot":
      return {
        key: "coach.protocol.preview.at_slot",
        params: { group, slot: preview.slot },
      };
  }
}

// ---------------------------------------------------------------------------
// LE DIFF DE PUBLICATION, EN LANGAGE HUMAIN
// ---------------------------------------------------------------------------

export interface PublishImpact {
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  /** Le nombre d'élèves actifs que la publication touche. */
  readonly students: number;
  /** Rien à publier: le brouillon est identique au publié. */
  readonly noop: boolean;
}

/**
 * Ce que le coach doit lire AVANT de publier.
 *
 * Publier à l'aveugle sur une cohorte est le geste le plus risqué de cet écran:
 * un coach de 200 élèves change ce que Sophia vérifie pour 200 personnes en un
 * clic. « 3 lignes ajoutées, 1 retirée — ça change ce que Sophia vérifie pour
 * 47 élèves actifs » est la phrase qui rend ce geste réversible dans sa tête
 * avant de l'être dans la base.
 */
export function publishImpact(
  published: readonly CompiledCommitment[],
  draft: readonly CompiledCommitment[],
  activeStudents: number,
): PublishImpact {
  const d = diffCompiled(published, draft);
  return {
    added: d.added.length,
    removed: d.removed.length,
    changed: d.changed.length,
    students: activeStudents,
    noop: d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0,
  };
}

// ---------------------------------------------------------------------------
// LES TERMES DU COACH
// ---------------------------------------------------------------------------

/**
 * Un terme n'est jamais rattaché en silence.
 *
 * Le §2.5 est catégorique: quand le coach ajoute « kéfir », l'écran affiche
 * « traité comme *produits laitiers fermentés* » et il doit pouvoir corriger.
 * Un rattachement muet est un mensonge sur ce que Sophia vérifiera vraiment.
 *
 * Cette fonction ne DEVINE pas le rattachement — elle propose, à partir d'une
 * correspondance littérale sur les libellés, et rend `null` quand rien ne
 * ressort. `null` n'est pas un échec: c'est le cas qui ouvre une demande
 * d'extension du vocabulaire partagé (§2.5, exigence 2).
 */
export function suggestAttachment(
  term: string,
  rows: readonly FoodGroupRow[],
  groupLabel: (slug: string) => string,
): string | null {
  const q = term.trim().toLowerCase();
  if (q.length === 0) return null;
  const exact = rows.find((r) => groupLabel(r.slug).toLowerCase() === q);
  if (exact) return exact.slug;
  const contained = rows.find((r) => {
    const label = groupLabel(r.slug).toLowerCase();
    return label.includes(q) || q.includes(label);
  });
  return contained ? contained.slug : null;
}

// ---------------------------------------------------------------------------
// LES AXES SUGGÉRÉS — des QUESTIONS, jamais des réponses
// ---------------------------------------------------------------------------

/**
 * LE PIÈGE DES PRÉRÉGLAGES, ET LA SORTIE RETENUE.
 *
 * Le pire ennemi d'un écran d'écriture est la page blanche. Mais si KEEL livre
 * des contenus nutritionnels tout faits, KEEL devient l'autorité nutritionnelle,
 * avec la responsabilité qui va avec, sur un produit qui n'est pas médical.
 *
 * D'où des préréglages de STRUCTURE et jamais de CONTENU: on ne pré-coche aucun
 * aliment. On nomme les AXES sur lesquels un protocole de ce type dit
 * habituellement quelque chose, et on rend la main. Ce sont des questions; le
 * coach reste l'auteur.
 *
 * Concrètement, un axe ne porte qu'une CLASSE d'aliments à déplier — jamais un
 * slug avec une posture. Déplier « les matières grasses » ne dit pas quoi en
 * penser.
 */
export interface ProtocolAxis {
  readonly labelKey: MessageKey;
  /** Les classes à déplier quand le coach clique l'axe. */
  readonly classes: readonly string[];
}

export const AXES_BY_GOAL: Readonly<Record<GoalToken, readonly ProtocolAxis[]>> = {
  fat_loss: [
    { labelKey: "coach.protocol.axis.protein_every_meal", classes: ["protein"] },
    { labelKey: "coach.protocol.axis.added_fats", classes: ["fat"] },
    { labelKey: "coach.protocol.axis.liquid_calories", classes: ["beverage"] },
    { labelKey: "coach.protocol.axis.vegetable_volume", classes: ["vegetable"] },
  ],
  recomposition: [
    { labelKey: "coach.protocol.axis.protein_every_meal", classes: ["protein"] },
    { labelKey: "coach.protocol.axis.carbs_around_training", classes: ["grain", "fruit"] },
  ],
  performance: [
    { labelKey: "coach.protocol.axis.carbs_around_training", classes: ["grain", "fruit"] },
    { labelKey: "coach.protocol.axis.hydration", classes: ["beverage"] },
  ],
  health: [
    { labelKey: "coach.protocol.axis.vegetable_volume", classes: ["vegetable"] },
    { labelKey: "coach.protocol.axis.ultra_processed", classes: ["discretionary"] },
  ],
  maintenance: [
    { labelKey: "coach.protocol.axis.vegetable_volume", classes: ["vegetable"] },
    { labelKey: "coach.protocol.axis.ultra_processed", classes: ["discretionary"] },
  ],
};

// ---------------------------------------------------------------------------
// LES LECTURES ET ÉCRITURES
// ---------------------------------------------------------------------------

export interface ProtocolState {
  readonly protocolId: string | null;
  readonly version: number;
  readonly stances: Readonly<Record<string, Stance>>;
  readonly timingRules: readonly StoredTimingRule[];
  readonly terms: readonly CoachTerm[];
  readonly publishedRules: readonly CoachFoodRule[];
  readonly publishedTiming: readonly CoachTimingRule[];
  readonly publishedAt: string | null;
}

export interface StoredTimingRule {
  readonly id: string;
  readonly rule: CoachTimingRule;
}

// Ce module reste PUR — aucun import de `supabase`. C'est la leçon déjà payée
// avec `coachCohort.ts`: un module qui mélange helpers et accès base ne se teste
// qu'en montant un client, donc ne se teste pas. Les lectures vivent dans la
// page, les décisions vivent ici.

export function toProtocolInput(
  state: Pick<ProtocolState, "stances" | "timingRules" | "terms">,
  coachId: string,
  contentLocale: string,
  goalScopes: Readonly<Record<string, readonly GoalToken[]>> = {},
): ProtocolInput {
  return {
    coachId,
    contentLocale,
    foodRules: Object.entries(state.stances).map(([slug, stance]) => ({
      food_group_ref: slug as CoachFoodRule["food_group_ref"],
      stance,
      goal_scope: goalScopes[slug] ?? [],
      rationale: null,
    })),
    timingRules: state.timingRules.map((r) => r.rule),
    terms: state.terms,
  };
}
