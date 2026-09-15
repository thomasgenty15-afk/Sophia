/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE RÉSULTAT DE VALIDATION D'UN PLAN — STRUCTURÉ, VERSIONNÉ, PERSISTÉ
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CE MODULE FERME, ET LE PLAN DE CLÔTURE LE NOMME (§ C5 ③) :
 * « persister un résultat de validation structuré et versionné : `conforme`,
 * `livrable_avec_ecarts` ou `non_livrable`, avec défauts, contrôles incomplets
 * et contrôles non applicables **séparés**. Les `issues[]` textuelles seules ne
 * suffisent pas pour la relecture durable. »
 *
 * Le cas d'école est mesuré : `shopping_lines_unattributed:1/26` (étape C3) est
 * écrit dans `issues` et **aucun écran ne le lit**. Une phrase se relit à
 * l'œil ; ceci se compte, se filtre et se traduit.
 *
 * ── ⛔ QUATRE LISTES, ET ELLES NE SE FONDENT JAMAIS ────────────────────────
 *
 *   · `defects`        — le plan est accusé. Un écart NOMMÉ, avec son site.
 *   · `incomplete`     — le contrôle a tourné et n'a pas pu conclure (garde-
 *                        manger sans quantité, conditionnement non convertible).
 *   · `not_applicable` — le contrôle ne s'applique pas ICI, pour une raison
 *                        LÉGITIME : plancher protéique protégé (TCA, mineur),
 *                        eau du robinet non achetable. ⛔ « Non applicable »
 *                        n'est PAS « non contrôlé » (faute de mesure n° 4 du
 *                        lot 0) — d'où la quatrième liste.
 *   · `not_run`        — le contrôle n'a pas tourné du tout : son dénominateur
 *                        est à zéro. Une cause à zéro sans dénominateur n'est
 *                        pas propre, elle n'a jamais été évaluée.
 *
 * ── ⛔ AUCUN `detail` NE SORT D'ICI, ET C'EST UNE PORTE, PAS UNE ÉCONOMIE ──
 *
 * Le plan (§ C5 ④) : « respecter les portes d'affichage calorique : pas de
 * chiffres masqués par une protection réintroduits dans un message d'erreur. »
 *
 * Les `detail` de la garde écrivent des nombres en toutes lettres — « 1 620
 * kcal servies pour 1 800 couvertes », « 126,1 g de protéine pour un plancher
 * couvert de 176 g ». Un plancher TCA masque ces chiffres à l'écran ; les
 * réécrire dans un statut de plan les redonnerait à qui la protection les
 * cache. Ce module ne persiste donc **que** la cause et son site ; l'écran
 * traduit la cause et ne recompose aucun nombre.
 *
 * ⚠️ ET LA PORTE EST ARMÉE, PAS SEULEMENT DOCUMENTÉE : `publicRefusals` retire
 * le `detail` des causes de la famille calorique, et un test la fait mordre sur
 * une sortie où une de ces causes est armée en `refuse`.
 *
 * ⚠️ PURE: no I/O, no clock, no randomness.
 */

import {
  type DeliveryState,
  type FinalGateCause,
  type FinalGateDelivery,
  type FinalGateOutcome,
  type GateRefusal,
  type GateSeverity,
} from "./final_plan_gate.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LA VERSION, ET POURQUOI ELLE EST UN NOMBRE ÉCRIT SUR LA LIGNE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LA VERSION DU CONTRAT DE VALIDATION, ÉCRITE SUR CHAQUE PLAN.
 *
 * ⛔ ELLE EST PERSISTÉE, PAS DÉDUITE. Un lecteur qui rencontrerait une forme
 * qu'il ne connaît pas doit pouvoir s'ABSTENIR au lieu de deviner : un plan
 * écrit aujourd'hui se relit dans six mois, et le jour où les listes changent
 * de forme, c'est ce nombre — et lui seul — qui distingue « ancien plan » de
 * « plan corrompu ».
 */
export const PLAN_VALIDATION_VERSION = 1;

/**
 * LES TROIS ÉTATS, DANS LE VOCABULAIRE EXACT DU PLAN DE CLÔTURE.
 *
 * ⚠️ IL EST FRANÇAIS, ET C'EST UN ARBITRAGE ASSUMÉ. `DELIVERY_STATES`
 * (`final_plan_gate.ts`) dit `conforme` / `deliverable_with_gaps` /
 * `not_deliverable` ; le plan écrit `conforme` / `livrable_avec_ecarts` /
 * `non_livrable`. Deux vocabulaires pour un seul fait est une dette — on la
 * borne par `validationStateOf`, une table EXHAUSTIVE que le compilateur
 * recense, et un test épingle la bijection. Inventer un troisième nom serait
 * pire ; renommer l'état de la garde toucherait un lot qui n'est pas le nôtre.
 */
export const PLAN_VALIDATION_STATES = [
  "conforme",
  "livrable_avec_ecarts",
  "non_livrable",
] as const;
export type PlanValidationState = (typeof PLAN_VALIDATION_STATES)[number];

/** La table fermée `DeliveryState` → `PlanValidationState`. */
const STATE_OF: Readonly<Record<DeliveryState, PlanValidationState>> = Object
  .freeze({
    conforme: "conforme",
    deliverable_with_gaps: "livrable_avec_ecarts",
    not_deliverable: "non_livrable",
  });

/** PURE. L'état de validation d'un état de livraison. */
export function validationStateOf(state: DeliveryState): PlanValidationState {
  return STATE_OF[state];
}

// ═══════════════════════════════════════════════════════════════════════════
// ② LA FAMILLE CALORIQUE — les causes dont le `detail` porte un chiffre gardé
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LES CAUSES DONT LE `detail` ÉCRIT UN NOMBRE SOUMIS AUX PORTES D'AFFICHAGE.
 *
 * ⛔ LISTE FERMÉE, ET CHAQUE ENTRÉE A ÉTÉ LUE DANS `final_plan_gate.ts` :
 *
 *   · `cell_energy_off`          → « +18 % contre 1 620 kcal visées »
 *   · `cell_bounds_off`          → « 105 kcal/100 g pour un couloir 123–180 »
 *   · `day_energy_off`           → « 2 455 kcal servies pour 2 916 couvertes »
 *   · `protein_floor_short`      → « 126,1 g pour un plancher couvert de 176 g »
 *   · `cell_energy_unmeasurable` → l'énergie d'une portion, et son motif
 *   · `mouth_energy_short`       → l'enveloppe d'une bouche
 *
 * ⚠️ CE N'EST PAS « les causes graves » : c'est « les causes qui PARLENT en
 * kilocalories ou en grammes de macronutriment ». Un `ingredient_short_bought`
 * écrit lui aussi des grammes — mais des grammes d'ACHAT, que personne ne
 * protège. Confondre les deux masquerait une liste de courses.
 */
export const CALORIE_PROTECTED_CAUSES: readonly FinalGateCause[] = Object
  .freeze([
    "cell_energy_off",
    // ⟳ 2026-09-12 · FERMETURE LOT 2 — LA DETTE EST PAYÉE, DES DEUX CÔTÉS À LA
    // FOIS. Son `detail` porte une DENSITÉ en kcal/100 g et des bornes de masse
    // en grammes: c'est la famille calorique, mot pour mot. Elle était laissée
    // dehors parce que la liste est DOUBLÉE côté écran et qu'un test épingle
    // l'égalité — l'ajouter d'un seul côté rougissait. Les deux bougent ici.
    "cell_bounds_off",
    "day_energy_off",
    "protein_floor_short",
    "cell_energy_unmeasurable",
    "mouth_energy_short",
  ]);

const PROTECTED = new Set<string>(CALORIE_PROTECTED_CAUSES);

/** PURE. `true` quand le `detail` de cette cause porte un chiffre protégé. */
export function isCalorieProtectedCause(cause: FinalGateCause): boolean {
  return PROTECTED.has(cause);
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA FORME PERSISTÉE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * UN DÉFAUT, AVEC SON SITE ET SANS SON CHIFFRE.
 *
 * ⚠️ `blocking` PLUTÔT QUE LA SÉVÉRITÉ BRUTE POUR L'ÉCRAN, et les deux sont
 * écrites : la sévérité dit ce que la POLITIQUE en fait (et elle bougera d'un
 * lot à l'autre), `blocking` dit ce qui est arrivé à CE plan-là. Un écran qui
 * relirait la sévérité seule changerait de phrase le jour d'un changement de
 * politique, sur un plan qui, lui, n'a pas bougé.
 */
export interface PlanValidationDefect {
  readonly cause: FinalGateCause;
  readonly severity: GateSeverity;
  readonly blocking: boolean;
  readonly day: string | null;
  readonly slot: string | null;
  readonly member_id: string | null;
  readonly dish: string | null;
  readonly term: string | null;
  /**
   * ⛔ VRAI = LE `detail` DE CETTE CAUSE PORTE UN CHIFFRE PROTÉGÉ, et il n'est
   * donc PAS dans cet objet. Le drapeau est écrit pour que l'absence se lise
   * comme une DÉCISION et pas comme un oubli de champ.
   */
  readonly number_protected: boolean;
}

/** Un contrôle qui a tourné sans conclure, ou qui ne s'applique pas ici. */
export interface PlanValidationControl {
  readonly control: string;
  readonly count: number;
}

/**
 * CE QUE LA BOUCLE DE RÉPARATION A DÉPENSÉ ET LAISSÉ, EN CHIFFRES.
 *
 * ⛔ C'EST LA VERSION STRUCTURÉE DE `plan_defects_at_delivery:N (kind:n)`
 * (étape C4), qui ne vivait que dans `issues[]`. Le plan interdit de s'en
 * contenter pour la relecture durable.
 */
export interface PlanValidationRepair {
  readonly rounds: number;
  readonly calls_made: number;
  readonly defects_at_delivery: number;
  readonly by_kind: Readonly<Record<string, number>>;
  readonly by_source: Readonly<Record<string, number>>;
}

export interface PlanValidationRecord {
  readonly version: number;
  readonly state: PlanValidationState;
  readonly defects: readonly PlanValidationDefect[];
  readonly incomplete: readonly PlanValidationControl[];
  readonly not_applicable: readonly PlanValidationControl[];
  readonly not_run: readonly FinalGateCause[];
  readonly counts: {
    readonly blocking: number;
    readonly gaps: number;
    readonly incomplete: number;
    readonly not_applicable: number;
    readonly not_run: number;
  };
  /** `null` quand la boucle de réparation n'a rien à dire (aperçu, garde tombée). */
  readonly repair: PlanValidationRepair | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ LA CONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════

function defectOf(r: GateRefusal): PlanValidationDefect {
  return {
    cause: r.cause,
    severity: r.severity,
    blocking: r.severity === "refuse",
    day: r.day,
    slot: r.slot,
    member_id: r.member_id,
    dish: r.dish,
    term: r.term,
    number_protected: isCalorieProtectedCause(r.cause),
  };
}

/**
 * LE RÉSULTAT DE VALIDATION D'UNE SORTIE DE GARDE. PURE.
 *
 * ⛔ IL NE DÉCIDE RIEN. Comme `finalGateDelivery`, il LIT. C'est l'appelant qui,
 * voyant `non_livrable`, s'abstient d'écrire — et c'est cette abstention-là qui
 * est la garde, pas cet objet.
 *
 * ⚠️ LES DEUX SOURCES SONT LA MÊME MESURE. `delivery` doit être
 * `finalGateDelivery(outcome)` : lui passer la livraison d'un autre tour
 * décrirait un plan que personne ne reçoit.
 */
export function planValidationRecord(args: {
  readonly outcome: FinalGateOutcome;
  readonly delivery: FinalGateDelivery;
  readonly repair?: PlanValidationRepair | null;
}): PlanValidationRecord {
  const { outcome, delivery } = args;
  const checked = outcome.counters.checked;
  // ⛔ L'ORDRE EST CELUI DE LA GARDE, PAS UN TRI. `blocking` d'abord parce que
  // c'est ce qui empêche la livraison; le reste garde l'ordre d'évaluation, qui
  // est celui des familles de causes. Un tri par nom mélangerait une case et
  // une ligne de courses dans la même phrase d'écran.
  const defects = [
    ...delivery.blocking.map(defectOf),
    ...delivery.gaps.map(defectOf),
  ];
  const incomplete = delivery.incomplete.map((i) => ({
    control: i.control,
    count: i.count,
  }));
  // ⛔ LES DEUX ABSTENTIONS LÉGITIMES, NOMMÉES SÉPARÉMENT DES TROUS.
  // `protein_protected` est une PROTECTION (plancher TCA, mineur, objectif
  // absent); `shopping_not_purchasable` est l'eau du robinet, mesurée dans la
  // préparation et hors de tout panier. Les compter avec `incomplete` ferait
  // lire « on n'a pas pu vérifier » là où la règle n'a simplement pas d'objet.
  const notApplicable = ([
    ["protein_floor_protected", checked.protein_protected],
    ["shopping_not_purchasable", checked.shopping_not_purchasable],
  ] as const)
    .filter(([, n]) => n > 0)
    .map(([control, count]) => ({ control, count }));
  return {
    version: PLAN_VALIDATION_VERSION,
    state: validationStateOf(delivery.state),
    defects,
    incomplete,
    not_applicable: notApplicable,
    not_run: [...delivery.unevaluated],
    counts: {
      blocking: delivery.blocking.length,
      gaps: delivery.gaps.length,
      incomplete: incomplete.reduce((n, i) => n + i.count, 0),
      not_applicable: notApplicable.reduce((n, i) => n + i.count, 0),
      not_run: delivery.unevaluated.length,
    },
    repair: args.repair ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ bis · ⟳ 2026-09-12 · LOT 2 — « PAS EXÉCUTÉE » N'EST PAS « PAS D'ÉCART »
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE RÉSULTAT DE VALIDATION, OU SON ABSENCE — ET LES DEUX SONT DANS LE TYPE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CETTE FORME FERME, ET LA REVUE C6 § 7 LE MESURE : « une exception
 * de la garde finale laisse continuer la livraison avec `validation: null`.
 * L'absence d'un verdict "conforme" ne remplace pas le contrôle manquant. »
 * Un `null` se lit de deux façons — « rien à signaler » et « on n'a pas
 * regardé » — et c'est la première qui gagne quand personne ne relit.
 *
 * ⛔ ET CE N'EST PAS UN QUATRIÈME ÉTAT PERSISTÉ. `PLAN_VALIDATION_STATES` en
 * compte trois, doublés côté écran (`frontend/src/keel/api/planValidation.ts`),
 * et un test épingle la bijection avec `DELIVERY_STATES`. En ajouter un
 * quatrième ferait rendre `null` au lecteur de l'écran — donc perdrait le
 * record entier, ce qui est l'inverse du but. La distinction vit ici, dans le
 * type que l'appelant lit AVANT d'activer un plan.
 *
 * ⚠️ `ran: false` N'ACTIVE RIEN. C'est `chooseReplacement`
 * (`plan_repair_loop.ts`) qui en tire la conséquence, via
 * `candidateStateOf(null) === "validation_unavailable"` : l'ancien plan valide
 * reste, et l'échec est technique, pas nutritionnel.
 */
export type PlanValidationOutcome =
  | { readonly ran: true; readonly record: PlanValidationRecord }
  | {
    readonly ran: false;
    /**
     * ⛔ UN MOTIF, JAMAIS UNE PHRASE LIBRE VIDE. « la garde a jeté », « le
     * contexte de mesure manquait » : ce qui s'écrit dans le journal et ce
     * qu'un humain relit six mois plus tard.
     */
    readonly reason: string;
  };

/** PURE. La validation a tourné. */
export function planValidationRan(
  record: PlanValidationRecord,
): PlanValidationOutcome {
  return { ran: true, record };
}

/**
 * PURE. La validation n'a PAS tourné — et ce n'est pas un plan sans écart.
 *
 * ⛔ LE MOTIF EST OBLIGATOIRE. Un échec technique sans motif se range à côté
 * des zéros sans dénominateur : indiscernable d'un contrôle qui s'est bien
 * passé.
 */
export function planValidationNotRun(reason: string): PlanValidationOutcome {
  const motif = String(reason ?? "").trim();
  return { ran: false, reason: motif === "" ? "unknown" : motif };
}

/**
 * LES MOTIFS DE REFUS TELS QU'ILS PARTENT DANS LE CORPS 422. PURE.
 *
 * ⛔ LE `detail` D'UNE CAUSE DE LA FAMILLE CALORIQUE EST RETIRÉ. C'est la porte
 * du § C5 ④ : « pas de chiffres masqués par une protection réintroduits dans un
 * message d'erreur ». Le motif, lui, RESTE — on ne cache pas la cause, on cache
 * le nombre.
 *
 * ⚠️ ELLE NE PEUT PAS MORDRE SOUS LA POLITIQUE LIVRÉE, ET C'EST VOULU : les
 * six causes protégées valent toutes `count` dans `FINAL_GATE_POLICY_LOT_4`,
 * donc aucune n'atteint `blocking`. La porte est écrite pour le jour où une de
 * ces causes serait armée — et un test la fait mordre sur une sortie
 * fabriquée, parce qu'une garde jamais éprouvée est indiscernable d'une garde
 * cassée.
 */
export function publicRefusals(
  refusals: readonly GateRefusal[],
): readonly {
  readonly cause: FinalGateCause;
  readonly day: string | null;
  readonly slot: string | null;
  readonly member_id: string | null;
  readonly term: string | null;
  readonly detail: string | null;
}[] {
  return (refusals ?? []).map((r) => ({
    cause: r.cause,
    day: r.day,
    slot: r.slot,
    member_id: r.member_id,
    term: r.term,
    detail: isCalorieProtectedCause(r.cause) ? null : r.detail,
  }));
}
