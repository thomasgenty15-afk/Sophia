/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES SURFACES DE SORTIE — CE QUE QUELQU'UN LIT, RECENSÉ UNE SEULE FOIS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT QUE CE MODULE FERME, ET IL A ÉTÉ REPRODUIT (revue du
 * 2026-09-12, P1 §2). Le verrou de sortie lit UN TEXTE CONCATÉNÉ, et ce texte
 * était fabriqué à la main, à deux endroits, avec deux listes de champs
 * différentes :
 *
 *   · `parseGeneratedMeal` collait plats, préparations, notes de portion et
 *     liste de courses — pas `cooking_sessions[].run_through`, pas
 *     `dishes[].name` ;
 *   · le handler recollait une TROISIÈME liste avant livraison (les termes de
 *     contenants sous le nom de « notes de portion »).
 *
 * Conséquence mesurée : « Ajouter du beurre de cacahuète au riz. » placée dans
 * le seul déroulé d'une session passait le parseur, le plan sortait `clean`, et
 * la ceinture finale ne pouvait pas la voir non plus. La MÊME phrase dans
 * `dishes[].method` bloquait le plan entier.
 *
 * ⛔ CE MODULE NE DÉTECTE RIEN. Il RECENSE. La détection reste
 * `applyKeelOutputLocks`, appelée par l'appelant sur ces surfaces — « jamais un
 * second matcher », la cicatrice `never-hand-roll-a-matcher-here`. Ce qui
 * change est qu'il n'y a plus qu'UNE liste de champs, et que le contrôle
 * initial et le contrôle final la partagent.
 *
 * ⛔ LA LISTE DES CHAMPS EST CELLE DE `MEAL_TRANSLATABLE_FIELDS`, moins ce que
 * le modèle n'écrit plus. C'est la seule liste du dépôt qui énumère « la prose
 * que l'élève lit », et la faire diverger d'ici serait exactement le mode
 * d'échec qu'on ferme. Le test de câblage les compare.
 *
 * ⚠️ CE QUI N'EST PAS UNE SURFACE DE SORTIE : le prompt interne, qui énumère
 * LÉGITIMEMENT les aliments exclus. L'analyser comme une sortie ferait refuser
 * chaque plan d'une personne allergique.
 *
 * PURE: no I/O, no clock, no randomness.
 */

/** Les familles de surface, fermées — un `switch` exhaustif s'y appuie. */
export const OUTPUT_SURFACE_KINDS = [
  /** Le repas lui-même : nom d'usage, titre, méthode, `why`, ingrédients. */
  "dish",
  /** Une casserole : titre, méthode, ingrédients. */
  "preparation",
  /** ⟳ 2026-09-13 · LOT 1 — le déroulé d'une session de cuisine. */
  "cooking_session",
  /** Une phrase lue à table, écrite sous une part. */
  "portion_note",
  /** Le libellé d'un composant de contenant. */
  "box_item",
  /** Une ligne de la liste de courses. */
  "shopping",
  /**
   * ⟳ 2026-09-13 (second passage) — LA PROSE QUI EXPLIQUE LE PLAN.
   *
   * ⛔ ELLE EST ÉCRITE PAR LE MODÈLE ET RENDUE À L'ÉCRAN
   * (`PlanDraftDialog.tsx`), elle est déclarée traduisible
   * (`[...MEAL_TRANSLATABLE_FIELDS, "explanation[]"]`) — et elle ne passait
   * par AUCUN verrou d'allergène. `gatePlanExplanation` ne reçoit que les
   * prénoms de la table et les libellés de règles de maison : elle sait dire
   * « ne commente pas une règle de maison », elle ne sait rien d'une allergie.
   *
   * ⚠️ MÊME FAMILLE QUE LE DÉROULÉ DE SESSION, trouvée par le même inventaire :
   * le plan de ce chantier demandait de recenser « notes de portion,
   * explications et courses », et l'explication manquait encore.
   */
  "explanation",
] as const;
export type OutputSurfaceKind = (typeof OUTPUT_SURFACE_KINDS)[number];

/**
 * OÙ UNE SURFACE SE TROUVE — STRUCTURÉ, JAMAIS UNE PHRASE.
 *
 * ⛔ REQUIS ET NULLABLES, JAMAIS `?`. La règle du dépôt
 * (`optional-gate-params-are-disarmed-gates`) : un champ facultatif ferait de
 * « je ne sais pas » la réponse silencieuse de tous les constructeurs.
 *
 * ⛔ ET ON N'INVENTE PAS CE QU'ON NE SAIT PAS. Une SESSION n'a pas de moment :
 * lui écrire `slot: "dinner"` pour qu'un périmètre la résolve serait une
 * attribution arbitraire — le plan l'interdit en toutes lettres. Elle porte son
 * jour, ses casseroles et les bouches qui en mangent ; le reste reste `null`.
 */
export interface OutputSurfaceAddress {
  /** L'index dans `dishes`, quand la surface en est un. */
  readonly index: number | null;
  /** L'index dans `cooking_sessions`, quand la surface en est une. */
  readonly sessionIndex: number | null;
  readonly day: string | null;
  readonly slot: string | null;
  readonly title: string | null;
  /** Le PROPRIÉTAIRE d'un plat dédié. `null` = plat de la maison. */
  readonly memberId: string | null;
  /** La casserole, quand la surface EN EST une. */
  readonly preparationId: string | null;
  /**
   * ⛔ LES CASSEROLES QUE CETTE SURFACE PORTE OU TIRE. Une session en porte
   * plusieurs ; un plat tire les siennes. C'est ce qui permet de remonter aux
   * consommateurs sans lire un titre.
   */
  readonly preparationIds: readonly string[];
  /**
   * ⛔ TOUTES LES BOUCHES CONCERNÉES, PAS LA PREMIÈRE TROUVÉE. Pour une
   * casserole partagée : tous ses consommateurs, sur toutes les dates. Pour une
   * session : les consommateurs de toutes ses casseroles. Vide = on ne sait pas
   * à qui c'est destiné, et c'est un aveu, pas une absence de risque.
   */
  readonly memberIds: readonly string[];
  /** Le terme d'une ligne de courses ou de contenant, ou l'extrait d'une note. */
  readonly term: string | null;
}

export interface OutputSurface {
  readonly kind: OutputSurfaceKind;
  /** Le texte réellement soumis au verrou. Jamais vide. */
  readonly text: string;
  readonly address: OutputSurfaceAddress;
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LA FORME LUE — STRUCTURELLE, JAMAIS UN IMPORT DE `GeneratedMeal`
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ MÊME POSTURE QUE `plan_repair_context.ts`. Importer le type du moteur
// ferait de ce module un morceau du moteur, et la ceinture finale du handler
// travaille sur un plan déjà transformé.

export interface SurfaceIngredient {
  readonly term: string;
}

export interface SurfaceDish {
  readonly name?: string | null;
  readonly title: string;
  readonly method: string;
  readonly why: string;
  readonly day: string | null;
  readonly slot: string | null;
  readonly memberId: string | null;
  readonly ingredients: readonly SurfaceIngredient[];
  readonly uses?: readonly { readonly preparationId: string }[];
  readonly boxes?: readonly {
    readonly memberIds?: readonly string[];
    readonly items?: readonly { readonly term: string }[];
  }[];
}

export interface SurfacePreparation {
  readonly id: string;
  readonly title: string;
  readonly method: string;
  readonly ingredients: readonly SurfaceIngredient[];
}

export interface SurfaceSession {
  readonly day: string | null;
  readonly preparationIds: readonly string[];
  readonly runThrough: string;
}

function propre(v: unknown): string {
  return String(v ?? "").trim();
}

/** Les bouches d'un plat : son propriétaire, plus les noms de ses contenants. */
function eatersOf(dish: SurfaceDish): string[] {
  const out = new Set<string>();
  const owner = propre(dish.memberId);
  if (owner !== "") out.add(owner);
  for (const b of dish.boxes ?? []) {
    for (const m of b.memberIds ?? []) {
      const id = propre(m);
      if (id !== "") out.add(id);
    }
  }
  return [...out].sort();
}

// ═══════════════════════════════════════════════════════════════════════════
// ② LE RECENSEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TOUTES LES SURFACES VISIBLES D'UN PLAN, DANS UN ORDRE STABLE.
 *
 * ⛔ UNE SURFACE VIDE N'EST PAS RECENSÉE, et ce n'est pas une optimisation :
 * `applyKeelOutputLocks` sur une chaîne vide rend `clean`, donc une surface
 * vide de plus ne changerait rien au verdict — mais elle changerait les
 * COMPTEURS, et un dénominateur qui bouge sans raison rend une mesure
 * illisible.
 *
 * ⛔ LES CONSOMMATEURS SONT CALCULÉS, PAS DEVINÉS. Une casserole remonte à
 * toutes les unités qui la tirent, sur toutes les dates ; une session remonte
 * aux consommateurs de toutes ses casseroles. « Si la portée exacte du texte
 * est ambiguë, contrôler l'ensemble concerné ; ne pas sélectionner le premier
 * membre rencontré. »
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function collectOutputSurfaces(args: {
  readonly dishes: readonly SurfaceDish[];
  readonly preparations: readonly SurfacePreparation[];
  readonly cookingSessions: readonly SurfaceSession[];
  readonly portionNotes: readonly string[];
  readonly shoppingTerms: readonly string[];
  /**
   * ⛔ REQUIS, `[]` POUR « AUCUNE ». Les lignes d'explication déjà passées par
   * `gatePlanExplanation` — c'est-à-dire celles qui partiront à l'écran.
   * Optionnel, un appelant qui l'oublie rendrait une prose non contrôlée, et
   * c'est très exactement le défaut qu'on vient de fermer deux fois.
   */
  readonly explanationLines: readonly string[];
}): OutputSurface[] {
  const vide: OutputSurfaceAddress = {
    index: null,
    sessionIndex: null,
    day: null,
    slot: null,
    title: null,
    memberId: null,
    preparationId: null,
    preparationIds: [],
    memberIds: [],
    term: null,
  };
  const surfaces: OutputSurface[] = [];
  const pousse = (
    kind: OutputSurfaceKind,
    text: string,
    address: Partial<OutputSurfaceAddress>,
  ): void => {
    const t = text.trim();
    if (t === "") return;
    surfaces.push({ kind, text: t, address: { ...vide, ...address } });
  };

  // ── QUI MANGE QUELLE CASSEROLE — sur TOUTES les dates ───────────────────
  const mangeursDuPot = new Map<string, Set<string>>();
  for (const d of args.dishes) {
    const bouches = eatersOf(d);
    for (const u of d.uses ?? []) {
      const id = propre(u.preparationId);
      if (id === "") continue;
      const s = mangeursDuPot.get(id) ?? new Set<string>();
      for (const m of bouches) s.add(m);
      mangeursDuPot.set(id, s);
    }
  }

  // ── ① LES PLATS ─────────────────────────────────────────────────────────
  args.dishes.forEach((d, index) => {
    const pots = [
      ...new Set((d.uses ?? []).map((u) => propre(u.preparationId)).filter((x) => x !== "")),
    ].sort();
    pousse(
      "dish",
      // ⛔ `name` EST DANS CETTE LIGNE, ET IL N'Y ÉTAIT PAS. C'est la première
      // ligne que l'œil attrape dans la grille de la semaine — un nom d'usage
      // qui porte l'allergène passait sous le verrou.
      `${propre(d.name)} ${d.title}. ${d.method} ${d.why} ${
        d.ingredients.map((i) => i.term).join(", ")
      }`,
      {
        index,
        day: d.day,
        slot: d.slot,
        title: d.title,
        memberId: d.memberId,
        preparationIds: pots,
        memberIds: eatersOf(d),
      },
    );
    // ── ① bis LES LIBELLÉS DE CONTENANT ───────────────────────────────────
    for (const b of d.boxes ?? []) {
      for (const it of b.items ?? []) {
        const terme = propre(it.term);
        pousse("box_item", terme, {
          index,
          day: d.day,
          slot: d.slot,
          title: d.title,
          memberId: d.memberId,
          memberIds: [
            ...new Set((b.memberIds ?? []).map(propre).filter((x) => x !== "")),
          ].sort(),
          term: terme,
        });
      }
    }
  });

  // ── ② LES CASSEROLES ────────────────────────────────────────────────────
  for (const p of args.preparations) {
    pousse(
      "preparation",
      `${p.title}. ${p.method} ${p.ingredients.map((i) => i.term).join(", ")}`,
      {
        title: p.title,
        preparationId: p.id,
        preparationIds: [p.id],
        memberIds: [...(mangeursDuPot.get(propre(p.id)) ?? [])].sort(),
      },
    );
  }

  // ── ③ LES SESSIONS ──────────────────────────────────────────────────────
  //
  // ⛔ LA SURFACE QUI MANQUAIT. Le déroulé est le seul texte qui dit l'ordre
  // des gestes ENTRE deux casseroles — et c'est aussi le seul endroit où « et
  // ajoute une cuillère de beurre de cacahuète » peut s'écrire sans qu'aucune
  // recette ne le nomme.
  args.cookingSessions.forEach((s, sessionIndex) => {
    const pots = [...new Set(s.preparationIds.map(propre).filter((x) => x !== ""))]
      .sort();
    const bouches = new Set<string>();
    for (const id of pots) {
      for (const m of mangeursDuPot.get(id) ?? []) bouches.add(m);
    }
    pousse("cooking_session", s.runThrough, {
      sessionIndex,
      // ⚠️ LE JOUR EST DÉCLARÉ PAR LA SESSION ELLE-MÊME. Le MOMENT reste
      // `null`: une session n'est pas un repas.
      day: s.day,
      preparationIds: pots,
      memberIds: [...bouches].sort(),
    });
  });

  // ── ④ LES NOTES DE PART ─────────────────────────────────────────────────
  for (const note of args.portionNotes) {
    const t = propre(note);
    pousse("portion_note", t, { term: t.slice(0, 80) });
  }

  // ── ④ bis LA PROSE D'EXPLICATION ────────────────────────────────────────
  args.explanationLines.forEach((ligne, i) => {
    const t = propre(ligne);
    pousse("explanation", t, { index: i, term: t.slice(0, 80) });
  });

  // ── ⑤ LA LISTE DE COURSES ───────────────────────────────────────────────
  for (const term of args.shoppingTerms) {
    const t = propre(term);
    pousse("shopping", t, { term: t });
  }

  return surfaces;
}

/**
 * LE TEXTE CONCATÉNÉ DU VERROU GLOBAL — DÉRIVÉ DES MÊMES SURFACES.
 *
 * ⛔ C'EST LA MOITIÉ QUI FERME LE DÉFAUT. Tant que ce texte se fabriquait à
 * part, il pouvait oublier un champ que la localisation lisait, ou l'inverse —
 * et c'est exactement ce qui est arrivé au déroulé des sessions. Il n'existe
 * plus qu'un recensement, et les deux contrôles en descendent.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function outputSurfacesText(
  surfaces: readonly OutputSurface[],
): string {
  return surfaces.map((s) => s.text).join("\n");
}

/** Le dénominateur d'un relevé : combien de surfaces, et de quelles familles. */
export function outputSurfaceCounts(
  surfaces: readonly OutputSurface[],
): Record<OutputSurfaceKind, number> {
  const out = {} as Record<OutputSurfaceKind, number>;
  for (const k of OUTPUT_SURFACE_KINDS) out[k] = 0;
  for (const s of surfaces) out[s.kind] += 1;
  return out;
}
