import { supabase } from "../../lib/supabase";

// FF-059 — LE CHIFFRE AFFICHÉ, CÔTÉ CLIENT.
//
// Fiche: docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md
//
// ── CE FICHIER NE CALCULE RIEN, ET NE PEUT PAS ─────────────────────────────
// Le référentiel de composition (`food_composition_refs`) est révoqué pour
// `anon` et `authenticated`: un client ne peut pas convertir des grammes en
// kilocalories, même s'il le voulait. C'est voulu, et c'est la moitié de la
// garde — l'autre moitié est que la CHAÎNE DE GARDES vit dans la fonction
// `meal-energy-v1`, où aucun code d'écran ne peut l'oublier.
//
// ── QUAND UNE PORTE EST FERMÉE, IL N'Y A RIEN À CACHER ─────────────────────
// La réponse ne contient alors AUCUN chiffre: pas de tableau vide, pas de zéro,
// pas de valeur qu'un composant pourrait rendre par mégarde ou qu'un onglet
// réseau pourrait révéler. Un `EnergyReading` fermé ne porte qu'un motif. C'est
// la propriété qu'on veut pouvoir prouver par l'ABSENCE DE CHEMIN, et elle
// commence par l'absence de donnée.
//
// ── RIEN N'EST MIS EN CACHE ICI (R5) ───────────────────────────────────────
// Aucun `localStorage`, aucun module-level store. Le chiffre se redemande avec
// le plan; un plan modifié rend un autre chiffre au chargement suivant, et il
// n'y a aucun état à invalider parce qu'il n'y en a aucun. Le seul cache est
// celui du composant React qui l'affiche, et il meurt avec la page.

/**
 * POURQUOI UN ÉLÈVE NE VOIT PAS DE CHIFFRE. Vocabulaire FERMÉ, aligné sur
 * `_shared/keel/energy_gate.ts` plus les deux motifs de la fonction.
 *
 * ⚠️ Les quatre refus ne se disent PAS pareil à l'écran, et c'est pour ça
 * qu'ils sont nommés: `doctrine_no_counting` se raconte (« ton coach ne compte
 * pas ici »), `restriction_floor` et `minor` ne se racontent PAS DU TOUT —
 * expliquer à quelqu'un qu'on lui cache un chiffre de calories, c'est encore
 * lui parler de calories.
 */
export const ENERGY_REASONS = [
  "open",
  "restriction_floor",
  "minor",
  "doctrine_no_counting",
  "student_off",
  "unavailable",
  "no_plan",
] as const;
export type EnergyReason = (typeof ENERGY_REASONS)[number];

/** La base, et il n'y en a qu'une sur ce chemin: le plan porte ses quantités. */
export const PLAN_ENERGY_BASIS = "plan_quantities";

export interface DishEnergyView {
  /** `null` = ce plat n'est pas calculable. Jamais une somme partielle. */
  kcal: number | null;
  basis: string;
  complete: boolean;
  /** `unknown_ingredient` · `missing_quantity` · `no_ingredients`. */
  gaps: string[];
}

export interface DayEnergyView {
  day: string | null;
  kcal: number | null;
  basis: string;
  /**
   * `false` = au moins un plat du jour n'a pas pu être compté.
   *
   * ⚠️ L'ÉCRAN DOIT RENDRE `dishesCounted` / `dishesTotal`, pas seulement le
   * mot « incomplet ». Un total qui paraît exhaustif et ne l'est pas est pire
   * que pas de total — c'est le rabbit hole n°3 de la fiche, et c'est à
   * l'affichage qu'il se commet.
   */
  complete: boolean;
  dishesCounted: number;
  dishesTotal: number;
  /**
   * CE QUI S'AJOUTE À L'ASSIETTE DU LECTEUR ce jour-là, dans un foyer.
   *
   * `0` sur un plan personnel, et sur la bouche dont le besoin EST le tronc.
   * Non nul quand les portions divergent — c'est la bifurcation par objectif,
   * en nombre. Il est DÉJÀ compris dans `kcal`, et il est rendu à part pour que
   * l'écran puisse dire « le plat, plus ce qui va dans ton assiette » : deux
   * personnes autour de la même casserole doivent lire le même chiffre pour le
   * même plat.
   *
   * ⚠️ C'est l'add-on DU LECTEUR. Ceux des autres bouches ne franchissent
   * jamais le fil, pas même agrégés — ils sont dimensionnés sur un corps et un
   * objectif, et « ce qui touche le corps est à soi ».
   */
  addonKcal: number;
}

/** Ce qu'un plan rend, quand les quatre portes sont ouvertes. */
export interface PlanEnergyView {
  planId: string;
  /**
   * `false` = ce plan n'est pas calculable EN TANT QUE PLAN, indépendamment de
   * la personne. Aujourd'hui un seul cas: `household_portions_not_numeric` —
   * dans un foyer à plusieurs bouches, la part de chacun est une PHRASE
   * (« generous vegetables, full protein share »), pas un nombre. Diviser par
   * le nombre de convives rendrait l'assiette moyenne, fausse pour tout le
   * monde, et effacerait la bifurcation par objectif au lieu de la montrer.
   */
  computable: boolean;
  abstention: string | null;
  dishes: DishEnergyView[];
  days: DayEnergyView[];
}

/**
 * FF-059 LOT 3 — LA CIBLE, NIVEAU C.
 *
 * ⚠️ UNE FOURCHETTE, JAMAIS UN POINT, et c'est la forme qui décide si ce
 * chiffre devient un objectif. Personne ne « rate » un intervalle de 400 kcal.
 *
 * ⚠️ AUCUN RESTE N'EXISTE, ni ici ni ailleurs. Le serveur ne soustrait rien du
 * total du jour, et l'écran ne doit pas le faire non plus: « il te reste 680
 * kcal » est LA phrase d'un tracker. Le total et la fourchette se posent côte à
 * côte, et c'est l'élève qui lit.
 *
 * C'est une MAINTENANCE — ce que ce corps dépense — jamais un déficit. Aucun
 * objectif n'entre dedans.
 */
export interface EnergyTargetView {
  /** `null` avec un `gap` nommé: `no_weight` ou `implausible_weight`. */
  low: number | null;
  high: number | null;
  basis: string;
  gap: string | null;
  /** La semaine de la pesée qui a servi. Aucune fraîcheur n'en est dérivée. */
  weightWeekStart: string | null;
}

export type EnergyReading =
  | {
    show: true;
    reason: "open";
    /** L'élève peut éteindre: la bascule s'affiche, allumée. */
    switchOfferable: true;
    basis: string;
    plans: PlanEnergyView[];
    /**
     * `null` = la porte ⑤ est fermée, ou le poids n'a pas pu être lu. Dans le
     * premier cas le serveur n'a même pas LU le poids: rien de dérivé du corps
     * de l'élève n'a voyagé.
     */
    target: EnergyTargetView | null;
    /** La bascule de la cible ne se propose que si son seul refus est elle. */
    targetOfferable: boolean;
  }
  | {
    show: false;
    reason: Exclude<EnergyReason, "open">;
    /**
     * VRAI SEULEMENT quand le seul refus est `student_off`.
     *
     * C'est ce qui permet de proposer « voir les calories » à qui l'a éteint,
     * sans jamais en parler à qui le plancher TCA, l'âge ou son coach
     * protègent — leur montrer une bascule serait déjà leur parler du sujet.
     */
    switchOfferable: boolean;
  };

/** Un refus, sans un chiffre. La forme de repli de TOUTE erreur de ce module. */
function closed(reason: Exclude<EnergyReason, "open">): EnergyReading {
  return { show: false, reason, switchOfferable: false };
}

function readDish(raw: unknown): DishEnergyView {
  const d = (raw ?? {}) as Record<string, unknown>;
  const kcal = Number(d.kcal);
  const complete = d.complete === true;
  return {
    // ⚠️ LE CHIFFRE NE SURVIT PAS À `complete: false`, même si le serveur en
    // envoyait un. Deux écritures de la même règle, aux deux bouts du fil: le
    // jour où l'une se relâche, l'autre tient.
    kcal: complete && Number.isFinite(kcal) ? kcal : null,
    basis: String(d.basis ?? ""),
    complete,
    gaps: Array.isArray(d.gaps) ? d.gaps.map((g) => String(g)) : [],
  };
}

function readDay(raw: unknown): DayEnergyView {
  const d = (raw ?? {}) as Record<string, unknown>;
  const kcal = Number(d.kcal);
  return {
    day: d.day === null || d.day === undefined ? null : String(d.day),
    kcal: Number.isFinite(kcal) ? kcal : null,
    basis: String(d.basis ?? ""),
    complete: d.complete === true,
    dishesCounted: Number(d.dishes_counted) || 0,
    dishesTotal: Number(d.dishes_total) || 0,
    addonKcal: Number(d.addon_kcal) || 0,
  };
}

/**
 * L'énergie des plans demandés, ou le motif nommé du silence.
 *
 * ── NE JETTE JAMAIS ────────────────────────────────────────────────────────
 * Une panne réseau rend `unavailable`, pas une exception. Ce n'est pas de la
 * complaisance: l'appelant est un écran de plan, et une exception y ferait
 * disparaître le PLAN pour un chiffre qui est un supplément. La direction
 * d'échec est la bonne — on perd le nombre, jamais le repas.
 *
 * ⚠️ Corollaire à ne pas oublier: `unavailable` ne doit RIEN afficher. Pas
 * « chiffre indisponible », pas un tiret à la place du nombre. Un espace réservé
 * dit « il y a un chiffre ici d'habitude », ce qui est exactement le message
 * qu'on ne veut pas laisser à qui vient d'être protégé par une porte fermée —
 * de l'extérieur, une panne et un refus doivent se ressembler.
 */
export async function loadMealEnergy(
  planIds: readonly string[],
): Promise<EnergyReading> {
  const ids = [...new Set(planIds.map((v) => String(v ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return closed("no_plan");

  const { data, error } = await supabase.functions.invoke("meal-energy-v1", {
    body: { plan_ids: ids },
  });
  if (error) return closed("unavailable");

  const row = (data ?? {}) as Record<string, unknown>;
  const reason = String(row.reason ?? "");
  const known = (ENERGY_REASONS as readonly string[]).includes(reason)
    ? (reason as EnergyReason)
    : "unavailable";

  // LE `show` DU SERVEUR EST LA DÉCISION, et il doit être D'ACCORD avec son
  // propre motif. Un `show: true` accompagné d'un motif de refus est une
  // réponse incohérente — on la traite comme une panne plutôt que comme une
  // autorisation, parce que c'est la seule des deux lectures qui ne blesse
  // personne si elle est fausse.
  if (row.show !== true || known !== "open") {
    return {
      show: false,
      reason: known === "open" ? "unavailable" : known,
      switchOfferable: row.switch_offerable === true && known === "student_off",
    };
  }

  const rawTarget = (row.target ?? null) as Record<string, unknown> | null;
  return {
    show: true,
    reason: "open",
    switchOfferable: true,
    basis: String(row.basis ?? PLAN_ENERGY_BASIS),
    targetOfferable: row.target_offerable === true,
    target: rawTarget === null ? null : {
      // ⚠️ LA FOURCHETTE EST TOUT-OU-RIEN. Une borne seule se rendrait comme un
      // POINT à l'écran — exactement la forme qu'on refuse.
      low: Number.isFinite(Number(rawTarget.low)) && Number.isFinite(Number(rawTarget.high))
        ? Number(rawTarget.low)
        : null,
      high: Number.isFinite(Number(rawTarget.low)) && Number.isFinite(Number(rawTarget.high))
        ? Number(rawTarget.high)
        : null,
      basis: String(rawTarget.basis ?? ""),
      gap: rawTarget.gap === null || rawTarget.gap === undefined
        ? null
        : String(rawTarget.gap),
      weightWeekStart: rawTarget.weight_week_start === null ||
          rawTarget.weight_week_start === undefined
        ? null
        : String(rawTarget.weight_week_start),
    },
    plans: (Array.isArray(row.plans) ? row.plans : []).map((entry) => {
      const p = (entry ?? {}) as Record<string, unknown>;
      const computable = p.computable === true;
      return {
        planId: String(p.plan_id ?? ""),
        computable,
        abstention: computable ? null : String(p.abstention ?? "") || null,
        dishes: computable && Array.isArray(p.dishes) ? p.dishes.map(readDish) : [],
        days: computable && Array.isArray(p.days) ? p.days.map(readDay) : [],
      };
    }).filter((p) => p.planId !== ""),
  };
}

/**
 * L'INTERRUPTEUR — porte ④, et la seule que l'élève tient.
 *
 * `update` puis `select()`: un update qui ne matche aucune ligne répond 204
 * sans erreur, et l'écran dirait « c'est éteint » sur une bascule partie nulle
 * part. Même arbitrage que `saveBasic` sur l'écran du plan.
 */
export async function setEnergyDisplay(enabled: boolean): Promise<void> {
  await writeSwitch({ energy_display_enabled: enabled });
}

/**
 * FF-059 LOT 3 — LA PORTE ⑤, et elle est SÉPARÉE de la ④ exprès.
 *
 * Accepter de voir ce que pèse son dîner n'est pas accepter qu'on estime ce que
 * son corps devrait manger. Un interrupteur unique ferait de la seconde le prix
 * de la première — sur exactement la distinction (un fait sur la nourriture
 * contre un jugement sur la personne) que tout ce chantier existe pour tenir.
 */
export async function setEnergyTarget(enabled: boolean): Promise<void> {
  await writeSwitch({ energy_target_enabled: enabled });
}

async function writeSwitch(patch: Record<string, boolean>): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error("not_signed_in");
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", uid)
    .select("id");
  if (error) throw new Error(`[keel/mealEnergy] switch failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("[keel/mealEnergy] switch saved nothing");
  }
}
