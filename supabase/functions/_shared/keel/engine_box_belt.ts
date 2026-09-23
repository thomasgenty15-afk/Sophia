/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA CEINTURE SUR LES BOÎTES DU MOTEUR — exclusions et régime, par personne
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⟳ 2026-09-23 — AUDIT DES DOSAGES, lot 4 a (`docs/keel/AUDIT-DOSAGES-2026-09-23.md`).
 *
 * ── LE DÉFAUT, MESURÉ ─────────────────────────────────────────────────────
 * `exclusion_belt.checked` valait 0 sur les quatre plans v4 audités, et le
 * tofu est servi 13 petits-déjeuners sur 20 à une personne qui l'a refusé le
 * matin. La cause est dans `parseGeneratedMeal` (`meal_generation.ts`, porte
 * ②bis et ②ter de `takeBox`) : la ceinture ne compte et ne juge que dans la
 * boucle des boîtes ÉCRITES PAR LE MODÈLE. En v4, le modèle n'en écrit aucune
 * (`with_box` = 0) : c'est le moteur qui construit la boîte de chaque mangeur,
 * après le parseur, et personne ne la relisait. Le contrôle du régime vit dans
 * la même boucle, il était aveugle de la même façon.
 *
 * `bitesOf` (`generate-household-meal-v1/index.ts`) ne comble pas le trou : il
 * juge un plat avec les termes de la TABLE, et ne prend les termes propres à
 * chaque personne que pour un plat dont aucune boîte n'est attribuée. Il sert
 * à décider une relance, pas à retirer quelqu'un d'un plat.
 *
 * ── CE QUE CE MODULE FAIT ─────────────────────────────────────────────────
 * Pour chaque plat placé, pour chaque personne que la grille lui donne
 * (`eatersByDish(...).fedByDish`), il juge LA BOÎTE QUE LE MOTEUR LUI SERVIRA :
 * les aliments du plat et les casseroles que le plat cite, avec les termes de
 * CETTE personne (plus ceux de la table) et SON régime. Une morsure la RETIENT
 * hors du plat (`heldOffByDish`) — exactement le geste de la ceinture du
 * parseur : on retire la personne, jamais le plat ni le plan.
 *
 * ⛔ AUCUN MATCHER MAISON. Les deux verdicts sont ceux du parseur, par les
 * mêmes fonctions : `dishBitesExclusion` (surface `"ingredients"`, moment du
 * plat) et `scanRegimeSources` (la même forme de sources que la porte ②bis
 * sur une boîte : les aliments, plus la prose et les aliments de chaque
 * casserole citée). « laitue » ≠ « lait » : 12 faux positifs sur 12 mesurés
 * le jour où quelqu'un a écrit le sien.
 *
 * ⛔ LA PROSE DU PLAT N'EST PAS LUE. Une boîte du moteur contient les aliments
 * du plat, pas son titre ni sa méthode. Une méthode qui décrit la variante des
 * autres (« le poulet pour la table, le tofu pour Léa ») ferait retirer à tort
 * la personne qu'on sert justement à part — et ici un faux positif coûte un
 * repas à quelqu'un.
 *
 * ⚠️ CE QUE CE MODULE NE FAIT PAS. Il ne réécrit rien, ne pèse rien et ne
 * rattrape pas le repas perdu : une personne retenue n'est plus nourrie par
 * ce plat, et c'est l'invariant « personne sans repas » (`mealsDelivered`) qui
 * le voit et demande la réparation. Retirer sans le dire serait pire ; servir
 * l'aliment refusé l'est encore plus.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import type { DeclaredFood, DietaryRegime } from "./dietary_regime.ts";
import { dishBitesExclusion, type ExclusionTerm } from "./food_exclusion_belt.ts";
import type { ForbiddenTerm } from "./forbidden_matcher.ts";
import { scanRegimeSources } from "./meal_generation.ts";
import type { SideCourseSlot, SideTermJudge } from "./side_courses_types.ts";
import type { FoodGroupRef } from "./tokens.ts";

// ═══════════════════════════════════════════════════════════════════════════
// LE VOCABULAIRE, FERMÉ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POURQUOI UNE PERSONNE EST RETENUE HORS D'UN PLAT. Les deux causes de la
 * ceinture du parseur (`BoxHeldOff.cause`), dans le même ordre : un régime est
 * une ligne qu'on ne franchit pas, une exclusion est un goût.
 */
export const ENGINE_BOX_HELD_CAUSES = ["regime", "exclusion"] as const;
export type EngineBoxHeldCause = (typeof ENGINE_BOX_HELD_CAUSES)[number];

// ═══════════════════════════════════════════════════════════════════════════
// LES ENTRÉES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * UN PLAT, RÉDUIT À CE QUE LA BOÎTE DU MOTEUR EN CONTIENT.
 *
 * `ParsedMeal["dishes"][number]` le satisfait tel quel : l'appelant passe
 * `meal.dishes` sans le recopier.
 */
export interface EngineBeltDish {
  /** Pour le journal seulement (`issues`). Jamais lu pour juger. */
  readonly title: string;
  /**
   * ⛔ LE MOMENT DU PLAT. Une exclusion écrite pour le petit-déjeuner ne juge
   * pas un dîner (`dishBitesExclusion`, 2026-09-21). `null` = toutes les
   * règles jugent, le repli de la ceinture.
   */
  readonly slot: string | null;
  /** Les aliments que le plat ajoute lui-même, avec leur groupe déclaré. */
  readonly ingredients: readonly DeclaredFood[];
  /** Les casseroles que le plat cite. */
  readonly uses: readonly { readonly preparationId: string }[];
}

/** Une casserole du plan. `MealPreparation` la satisfait tel quel. */
export interface EngineBeltPreparation {
  readonly id: string;
  readonly title: string;
  readonly method: string;
  readonly ingredients: readonly DeclaredFood[];
}

// ═══════════════════════════════════════════════════════════════════════════
// LA SORTIE
// ═══════════════════════════════════════════════════════════════════════════

/** Une personne retenue hors d'un plat, avec ce qui a mordu. */
export interface EngineBoxHeld {
  readonly dishIndex: number;
  readonly memberId: string;
  /**
   * ⚠️ UNE SEULE CAUSE PAR (PLAT, PERSONNE), ET LE RÉGIME GAGNE : c'est la
   * cause la plus forte pour l'invariant « personne sans repas ». Les deux
   * refus restent comptés séparément dans `byMember`.
   */
  readonly cause: EngineBoxHeldCause;
  /** Le mot qui a mordu, tel qu'il est écrit dans la boîte. */
  readonly matched: string;
  /** Le texte de l'exclusion (ses mots), ou le jeton du régime. */
  readonly because: string | null;
  /** La casserole où ça a mordu, `null` quand c'est un aliment du plat. */
  readonly preparationId: string | null;
}

/** Les deux contrôles d'une personne. ⛔ Les zéros sont écrits. */
export interface EngineBoxMemberCounts {
  /** Combien de plats la grille lui donne (paires plat × personne jugées). */
  eaten: number;
  /**
   * `checked` = boîtes lues avec au moins une exclusion à elle ou à la table ;
   * `refused` = boîtes où une exclusion a mordu.
   */
  exclusion: { checked: number; refused: number };
  /** `checked` = boîtes lues sous son régime déclaré ; `refused` = morsures. */
  regime: { checked: number; refused: number };
}

export interface EngineBoxBeltCounters {
  dishes: number;
  /** Les plats que la grille a placés (`fedByDish[i] !== null`). */
  placed: number;
  /** Les paires (plat, personne) jugées. */
  pairs: number;
  exclusion_checked: number;
  exclusion_refused: number;
  regime_checked: number;
  regime_refused: number;
  /** Les paires (plat, personne) retenues — une par paire, causes confondues. */
  held_off: number;
  /** Les plats que plus personne ne mange après la ceinture. */
  emptied: number;
  /**
   * Un mangeur absent de `memberIds`. La grille et la liste des personnes
   * décrivent la même table : non nul, elles ont divergé. Il est jugé quand
   * même, avec ce que `exclusionsOf` et `regimeOf` savent de lui.
   */
  off_roster: number;
}

export interface EngineBoxBeltOutcome {
  /**
   * Par plat, aligné index par index sur `dishes` : les personnes à retenir.
   * `[]` sur un plat où personne n'est retenu, ou que la grille n'a pas placé.
   * C'est la valeur de `CellDish.heldOff` (`household_cells.ts`).
   */
  readonly heldOffByDish: readonly (readonly string[])[];
  readonly held: readonly EngineBoxHeld[];
  /** Une entrée par personne de `memberIds`, zéros compris. */
  readonly byMember: Readonly<Record<string, EngineBoxMemberCounts>>;
  readonly counters: EngineBoxBeltCounters;
  /** Pour le journal, dans la forme des `issues` du parseur. */
  readonly issues: readonly string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// LE JUGE DES PLATS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * QUI RETENIR HORS DE QUEL PLAT, JUGÉ SUR LA BOÎTE QUE LE MOTEUR SERT.
 *
 * ⛔ `fedByDish` EST LA GRILLE, PAS UN SECOND CALCUL DE QUI MANGE QUOI. Il
 * vient de `eatersByDish(...)` appelé avec `heldOff: []` ; l'appelant rappelle
 * ensuite `eatersByDish` avec `heldOff: heldOffByDish[i]` pour obtenir les
 * mangeurs réels.
 *
 * ⚠️ LES TERMES DE LA TABLE S'AJOUTENT À CEUX DE LA PERSONNE. Si
 * `exclusionsOf` les contient déjà (c'est le cas de `memberExclusionTerms`
 * dans le générateur), le doublon ne change aucun verdict : les mots attendus
 * sont groupés par règle (`ruleId`) dans `dishBitesExclusion`.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function judgeDishEaters(args: {
  readonly dishes: readonly EngineBeltDish[];
  readonly preparations: readonly EngineBeltPreparation[];
  /** `eatersByDish(...).fedByDish`, aligné sur `dishes`. `null` = non placé. */
  readonly fedByDish: readonly (ReadonlySet<string> | null)[];
  /**
   * ⛔ REQUIS : la liste des personnes du plan. Sans elle, une personne que
   * la grille ne nourrit nulle part n'aurait aucune ligne de compteur, et
   * « 0 contrôle » ne se distinguerait plus de « personne n'a été regardé ».
   */
  readonly memberIds: readonly string[];
  /** Les termes à éviter de CETTE personne (`exclusionTermsFor`). */
  readonly exclusionsOf: (memberId: string) => readonly ForbiddenTerm[];
  /** Son régime déclaré ; `null` = aucun (omnivore ou pas de réponse). */
  readonly regimeOf: (memberId: string) => DietaryRegime | null;
  /** Les termes à éviter de toute la table (sujet `household`). */
  readonly householdTerms: readonly ForbiddenTerm[];
}): EngineBoxBeltOutcome {
  const counters: EngineBoxBeltCounters = {
    dishes: args.dishes.length,
    placed: 0,
    pairs: 0,
    exclusion_checked: 0,
    exclusion_refused: 0,
    regime_checked: 0,
    regime_refused: 0,
    held_off: 0,
    emptied: 0,
    off_roster: 0,
  };
  const byMember: Record<string, EngineBoxMemberCounts> = {};
  const fresh = (): EngineBoxMemberCounts => ({
    eaten: 0,
    exclusion: { checked: 0, refused: 0 },
    regime: { checked: 0, refused: 0 },
  });
  for (const memberId of args.memberIds) byMember[memberId] = fresh();
  const roster = new Set(args.memberIds);

  const preparationById = new Map(args.preparations.map((p) => [p.id, p]));
  const heldOffByDish: string[][] = args.dishes.map(() => []);
  const held: EngineBoxHeld[] = [];
  const issues: string[] = [];

  for (const [i, dish] of args.dishes.entries()) {
    const fed = args.fedByDish[i] ?? null;
    if (fed === null) continue;
    counters.placed++;

    // ── LA SURFACE DE LA BOÎTE, UNE FOIS PAR PLAT ─────────────────────────
    // ⚠️ LA MÊME FORME QUE LA PORTE ②bis SUR UNE BOÎTE DU MODÈLE : les
    // aliments sans prose, puis chaque casserole citée avec sa prose et ses
    // aliments. Une casserole inconnue est sautée, comme dans le parseur.
    const prepIds: string[] = [];
    for (const use of dish.uses) {
      if (preparationById.has(use.preparationId) && !prepIds.includes(use.preparationId)) {
        prepIds.push(use.preparationId);
      }
    }
    const regimeSources = [
      { prepId: null, prose: [] as string[], items: [...dish.ingredients] },
      ...prepIds.map((id) => {
        const prep = preparationById.get(id)!;
        return { prepId: prep.id, prose: [prep.title, prep.method], items: [...prep.ingredients] };
      }),
    ];
    // Mémoïsé par régime : le scan ne lit que la ligne et la boîte, jamais qui
    // la porte (même contrat que `biteFor` dans le parseur).
    const regimeBite = new Map<DietaryRegime, ReturnType<typeof scanRegimeSources>>();

    const eaters = [...fed].sort();
    for (const memberId of eaters) {
      counters.pairs++;
      if (!roster.has(memberId)) {
        counters.off_roster++;
        byMember[memberId] ??= fresh();
      }
      const counts = byMember[memberId];
      counts.eaten++;
      let refusal: EngineBoxHeld | null = null;

      // ══ ① LE RÉGIME ═══════════════════════════════════════════════════
      const regime = args.regimeOf(memberId);
      if (regime !== null) {
        let breach = regimeBite.get(regime);
        if (breach === undefined) {
          breach = scanRegimeSources(regime, regimeSources);
          regimeBite.set(regime, breach);
        }
        counts.regime.checked++;
        counters.regime_checked++;
        if (breach.matched !== null) {
          counts.regime.refused++;
          counters.regime_refused++;
          refusal = {
            dishIndex: i,
            memberId,
            cause: "regime",
            matched: breach.matched,
            because: regime,
            preparationId: breach.preparationIds[0] ?? null,
          };
        }
      }

      // ══ ② CE QUE CETTE PERSONNE A DEMANDÉ D'ÉVITER ═══════════════════
      // ⚠️ JUGÉ MÊME QUAND LE RÉGIME A DÉJÀ MORDU : les deux compteurs disent
      // chacun leur vérité. Seule la cause retenue est unique.
      const terms = [...args.exclusionsOf(memberId), ...args.householdTerms];
      if (terms.length > 0) {
        const bite = dishBitesExclusion({
          // ⛔ TITRE ET MÉTHODE VIDES : la boîte du moteur ne contient que les
          // aliments. Même geste que la porte ②ter sur une boîte du modèle.
          dish: { title: "", method: "", ingredients: dish.ingredients },
          uses: prepIds.map((preparationId) => ({ preparationId })),
          preparationById,
          terms,
          surface: "ingredients",
          slot: dish.slot,
        });
        counts.exclusion.checked++;
        counters.exclusion_checked++;
        if (bite.matched !== null) {
          counts.exclusion.refused++;
          counters.exclusion_refused++;
          refusal ??= {
            dishIndex: i,
            memberId,
            cause: "exclusion",
            matched: bite.matched,
            because: bite.because,
            preparationId: bite.preparationIds[0] ?? null,
          };
        }
      }

      if (refusal === null) continue;
      held.push(refusal);
      heldOffByDish[i].push(memberId);
      counters.held_off++;
      issues.push(
        `dishes[${i}] ${JSON.stringify(dish.title)}: ${JSON.stringify(memberId)} ` +
          (refusal.cause === "regime"
            ? `is ${refusal.because} and the engine box carries `
            : `asked to avoid ${JSON.stringify(refusal.because ?? refusal.matched)} and the engine box carries `) +
          `${JSON.stringify(refusal.matched)} -- held off the dish`,
      );
    }
    if (eaters.length > 0 && heldOffByDish[i].length === eaters.length) counters.emptied++;
  }

  return { heldOffByDish, held, byMember, counters, issues };
}

// ═══════════════════════════════════════════════════════════════════════════
// LE JUGE D'UN À-CÔTÉ (injecté dans le flux A, `buildSideCourseLedger`)
// ═══════════════════════════════════════════════════════════════════════════

/** Les moments où un à-côté existe — les seuls dont une règle peut le juger. */
const SIDE_JUDGED_OCCASIONS: ReadonlySet<string> = new Set<SideCourseSlot>(["lunch", "dinner"]);

/**
 * FABRIQUE LE JUGE D'UN À-CÔTÉ (`SideTermJudge`), pour un moment.
 *
 * Un à-côté est un aliment nommé une fois (« pomme », « cheddar »). Il se juge
 * comme un item de boîte : son mot sous les exclusions de la personne et de la
 * table, et le couple (mot, groupe du référentiel) sous son régime.
 *
 * ⛔ LE MOMENT, ET POURQUOI IL EST UN ARGUMENT DE LA FABRIQUE. `SideTermJudge`
 * (le socle) ne reçoit pas de moment. « Pas de fromage le soir » doit refuser
 * le fromage du dîner et laisser celui du midi : l'appelant fabrique donc un
 * juge par moment (`slot: "lunch"`, `slot: "dinner"`). `slot: null` = un juge
 * pour les deux moments à la fois : les règles de toute la journée, du midi ET
 * du soir jugent — plus strict, jamais plus large. ⚠️ Les règles du matin et
 * des collations ne jugent jamais un à-côté : « pas de yaourt le matin » ne
 * retire pas le yaourt du dessert.
 *
 * ⚠️ LE GROUPE VIENT DU RÉFÉRENTIEL (`groupOfRef`), jamais d'une devinette sur
 * le mot. Sans `ref`, le groupe est `null`, et le régime juge le mot seul —
 * le repli de `scanDietaryRegime`.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function judgeSideTerm(args: {
  readonly exclusionsOf: (memberId: string) => readonly ForbiddenTerm[];
  readonly regimeOf: (memberId: string) => DietaryRegime | null;
  readonly householdTerms: readonly ForbiddenTerm[];
  /** `composition.bySlug.get(ref)?.foodGroupRef ?? null` chez l'appelant. */
  readonly groupOfRef: (ref: string) => FoodGroupRef | null;
  readonly slot: SideCourseSlot | null;
}): SideTermJudge {
  return ({ memberId, term, ref }) => {
    const word = String(term ?? "").trim();
    if (word === "") return { ok: true };
    const group = ref === null || ref.trim() === "" ? null : args.groupOfRef(ref);

    const regime = args.regimeOf(memberId);
    if (regime !== null) {
      const breach = scanRegimeSources(regime, [
        { prepId: null, prose: [], items: [{ term: word, group }] },
      ]);
      if (breach.matched !== null) return { ok: false, reason: "regime" };
    }

    const all = [...args.exclusionsOf(memberId), ...args.householdTerms];
    // `slot: null` ⇒ on écarte d'abord les règles des moments sans à-côté ;
    // un moment donné ⇒ `dishBitesExclusion` fait le tri lui-même.
    const terms = args.slot !== null ? all : all.filter((t) => {
      const occasion = (t as Partial<ExclusionTerm>).occasion ?? null;
      return occasion === null || SIDE_JUDGED_OCCASIONS.has(String(occasion).toLowerCase());
    });
    if (terms.length === 0) return { ok: true };
    const bite = dishBitesExclusion({
      dish: { title: "", method: "", ingredients: [{ term: word }] },
      uses: [],
      preparationById: new Map(),
      terms,
      surface: "ingredients",
      slot: args.slot,
    });
    return bite.matched === null ? { ok: true } : { ok: false, reason: "excluded" };
  };
}
