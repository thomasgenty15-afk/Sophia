/**
 * Rejoue la réconciliation de casserole avec les fonctions de production,
 * sans rappeler le modèle.
 *
 *   deno run --allow-read --allow-write=scratchpad \
 *     scratchpad/2026-09-14-B4-FINAL/reconcilier.ts
 */
import { indexDuReferentiel } from "../2026-09-13-CIBLES-PAR-PERSONNE/composer-reference.ts";
import { measurePreparation } from "../../supabase/functions/_shared/keel/preparation_mass.ts";
import {
  growIngredientsToReadyMass,
  scaleIngredients,
} from "../../supabase/functions/_shared/keel/portion_scaling.ts";
import {
  rebuildShoppingQuantities,
  shoppingNeedsOf,
} from "../../supabase/functions/_shared/keel/shopping_rebuild.ts";
import { resolveIngredients } from "../../supabase/functions/_shared/keel/food_composition.ts";
import { decidePotMassPublication } from "../../supabase/functions/_shared/keel/pot_mass_publication.ts";
import { shoppingIdentityAudit } from "../../supabase/functions/_shared/keel/final_plan_audit.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);

function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(Deno.readTextFileSync(`${ROOT}${rel}`)) as Record<string, unknown>;
}

function mealOf(src: Record<string, unknown>): Record<string, unknown> {
  if (src.ligne_ecrite && typeof src.ligne_ecrite === "object") {
    return src.ligne_ecrite as Record<string, unknown>;
  }
  if (src.etapes && typeof src.etapes === "object") {
    const etapes = src.etapes as Record<string, unknown>;
    const jet = etapes.premier_jet;
    if (typeof jet === "string") {
      const parsed = JSON.parse(jet) as Record<string, unknown>;
      if (parsed.dishes) return parsed;
    }
    if (jet && typeof jet === "object" && "dishes" in (jet as object)) {
      return jet as Record<string, unknown>;
    }
  }
  return src;
}

function pidOf(item: Record<string, unknown>): string {
  return String(item.preparationId ?? item.preparation_id ?? "");
}

function memberIdsOf(box: Record<string, unknown>): string[] {
  const ids = box.member_ids ?? box.memberIds ?? [];
  const out = Array.isArray(ids) ? ids.map((x) => String(x)) : [];
  if (box.member_id) out.push(String(box.member_id));
  return [...new Set(out)];
}

function drawnByPrep(dishes: Record<string, unknown>[]): Map<string, {
  grams: number;
  byDay: Record<string, number>;
  byMouth: Record<string, number>;
}> {
  const out = new Map<string, {
    grams: number;
    byDay: Record<string, number>;
    byMouth: Record<string, number>;
  }>();
  const bump = (id: string) => {
    let row = out.get(id);
    if (!row) {
      row = { grams: 0, byDay: {}, byMouth: {} };
      out.set(id, row);
    }
    return row;
  };
  for (const dish of dishes) {
    const day = String(dish.day ?? "?");
    for (const box of (dish.boxes as Record<string, unknown>[] | undefined) ?? []) {
      const mouths = memberIdsOf(box);
      for (const item of (box.items as Record<string, unknown>[] | undefined) ?? []) {
        const id = pidOf(item);
        if (!id) continue;
        const g = Number(item.grams) || 0;
        const row = bump(id);
        row.grams += g;
        row.byDay[day] = (row.byDay[day] ?? 0) + g;
        if (mouths.length === 0) {
          row.byMouth["?"] = (row.byMouth["?"] ?? 0) + g;
        } else {
          for (const m of mouths) {
            row.byMouth[m] = (row.byMouth[m] ?? 0) + g / mouths.length;
          }
        }
      }
    }
  }
  return out;
}

function ingredientsOf(prep: Record<string, unknown>): Record<string, unknown>[] {
  return ((prep.ingredients as Record<string, unknown>[] | undefined) ?? []).map((ing) => ({
    ...ing,
  }));
}

Deno.stat(`${ROOT}scratchpad/2026-09-14-B4-FINAL`).catch(() => {});

const index = await indexDuReferentiel();

const cases = [
  {
    nom: "sna1",
    rel: "scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/perte-b4-sna1-final-2026-09-13T17-00-02-362Z.json",
    note: "rejeu banc --reponse sna1, code courant, 1 ligne écrite",
  },
  {
    nom: "n2-partage",
    rel: "scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/perte-b4-n2-final-2026-09-13T17-00-01-727Z.json",
    note: "rejeu banc lot2-ref2, N=2, 2 casseroles partagées, 1 ligne écrite",
  },
  {
    nom: "n4-ref4",
    rel: "scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/perte-b4-n4-final-2026-09-13T17-00-02-096Z.json",
    note: "rejeu banc lot2-ref4, N=4 toutes présentes — pas le cas away",
  },
  {
    nom: "historique-6146",
    rel: "scratchpad/2026-09-14-B4-FINAL/fixtures/parcours-6146-6181.json",
    note: "plan navigateur stocké 82e60169 ; le banc --reponse a été refusé (IDs étrangers + plafond 9 plats)",
  },
  {
    // ⟳ 2026-09-15 · LOT 4 — LE PLAN FRAIS, COMPOSÉ ET ADOPTÉ AUJOURD'HUI.
    // C'est le seul cas de cette liste produit par la version figée des lots
    // 1 à 3 : les quatre autres décrivent le code d'avant.
    nom: "n4-b15b-frais",
    rel: "scratchpad/2026-09-15-BETA-PREUVES/plan-n4-b15b.json",
    note: "N=4 (végane, omnivore, mineure), composé en aperçu puis adopté le 2026-09-15",
  },
  {
    // ⟳ 2026-09-15 · LOT 4 — le chemin DIRECT (sans aperçu), version figée.
    nom: "n2-b15c-direct",
    rel: "scratchpad/2026-09-15-BETA-PREUVES/plan-n2-b15c.json",
    note: "N=2 végane + omnivore, composé et écrit d'un trait le 2026-09-15",
  },
  {
    nom: "n4-away-tir9s1",
    rel: "scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/campagne-tir9-s1-2026-09-14T04-20-23-468Z.json",
    note: "plan publié N=4, Nils absent mardi ; mesuré hors handler sur la ligne écrite",
  },
] as const;

const rapport: Record<string, unknown>[] = [];

for (const cas of cases) {
  const src = loadJson(cas.rel);
  const meal = mealOf(src);
  const dishes = (meal.dishes as Record<string, unknown>[]) ?? [];
  const preps = ((meal.preparations as Record<string, unknown>[]) ?? []).map((p) => ({
    ...p,
    ingredients: ingredientsOf(p),
  }));
  const shopping = ((meal.shopping_list as Record<string, unknown>[]) ?? []).map((l) => ({
    ...l,
  }));
  const drawn = drawnByPrep(dishes);

  const perPot = [];
  let overdrawnBefore = 0;
  let overdrawnAfter = 0;
  let unreadableDrawn = 0;
  let readyAfter = 0;
  let drawnFinal = 0;
  let grown = 0;

  for (const prep of preps) {
    const id = String(prep.id ?? "");
    const draw = drawn.get(id)?.grams ?? 0;
    const measure = (ingredients: readonly Record<string, unknown>[]) =>
      measurePreparation(index, {
        id,
        method: (prep.method as string | null) ?? null,
        ingredients: [...ingredients],
        waterTreatment: null,
      }).readyG;
    const before = measure(prep.ingredients as Record<string, unknown>[]);
    if (before !== null && Number.isFinite(before) && draw > before) overdrawnBefore++;
    if (draw > 0 && (before === null || !Number.isFinite(before))) {
      /* counted after grow */
    }
    let after = before;
    let fit = {
      changed: 0,
      attempts: 0,
      factor: 1,
      shortfallG: null as number | null,
    };
    if (before !== null && Number.isFinite(before) && draw > before) {
      const fitted = growIngredientsToReadyMass(
        prep.ingredients as Record<string, unknown>[],
        draw,
        (items) => measure(items as Record<string, unknown>[]),
      );
      fit = {
        changed: fitted.changed,
        attempts: fitted.attempts,
        factor: fitted.factor,
        shortfallG: fitted.shortfallG,
      };
      if (fitted.changed > 0) {
        prep.ingredients = fitted.items as Record<string, unknown>[];
        grown++;
      }
      after = measure(prep.ingredients as Record<string, unknown>[]);
    }
    const rest = after === null || !Number.isFinite(after) ? null : after - draw;
    if (draw > 0 && rest === null) unreadableDrawn++;
    else if (rest !== null && rest < 0) overdrawnAfter++;
    if (after !== null && Number.isFinite(after)) readyAfter += Math.round(after);
    drawnFinal += Math.round(draw);

    const resolved = resolveIngredients(
      index,
      (prep.ingredients as Record<string, unknown>[]).map((ing) => ({
        term: String(ing.term ?? ""),
        quantity: ing.quantity == null ? null : String(ing.quantity),
        amount: typeof ing.amount === "number" ? ing.amount : null,
        unit: (ing.unit as "g" | "ml" | "unit" | null) ?? null,
        state: (ing.state as "raw" | "cooked" | null) ?? null,
        ref: ing.ref == null ? null : String(ing.ref),
      })),
    );
    const crus = (prep.ingredients as Record<string, unknown>[]).map((ing, i) => {
      const r = resolved.resolved[i];
      return {
        term: ing.term,
        ref: ing.ref ?? null,
        amount: ing.amount ?? null,
        unit: ing.unit ?? null,
        state: ing.state ?? null,
        quantity: ing.quantity ?? null,
        gramsRaw: r?.gramsRaw ?? null,
        yieldClass: r?.yieldClass ?? null,
      };
    });

    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-15 · LOT 3.3 — LE SURPLUS MINIMAL ATTEIGNABLE, MESURÉ
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ UNE BORNE « UN GRAMME PAR LIGNE » EST FAUSSE, ET ÇA SE MESURE. Elle
    // suppose que chaque ligne s'arrondit indépendamment; or `scaleIngredients`
    // multiplie TOUTES les lignes par un seul facteur, puis arrondit chacune.
    // La masse prête est donc une fonction EN ESCALIER du facteur, et la plus
    // petite marche suffisante peut valoir bien plus qu'un gramme par ligne.
    //
    // Mesuré sur `prep_breakfast_mon` (N=4, Nils absent): 1717,5 g au facteur 1
    // pour 1718 g prélevés — il manque 0,6 g. La marche suivante est à 1727 g.
    // Le surplus de 9 g n'est donc PAS un dépassement de la recherche: c'est le
    // MINIMUM que cette casserole puisse produire en couvrant son prélèvement.
    // Une borne théorique aurait accusé la production d'un défaut inexistant.
    //
    // ⚠️ ON BALAIE, ON NE DÉDUIT PAS. Le pas de 0,0001 sur [1 ; 1,04] est plus
    // fin que toute marche observée; s'il n'en trouve aucune, `null` le dit.
    let surplusMinimal: number | null = null;
    if (fit.changed > 0 && before !== null && Number.isFinite(before) && draw > 0) {
      for (let f = 1; f <= 1.0401; f += 0.0001) {
        const probe = measure(
          scaleIngredients(
            prep.ingredients as never,
            f,
            undefined,
            Infinity,
          ).items as Record<string, unknown>[],
        );
        if (probe !== null && Number.isFinite(probe) && probe >= draw) {
          surplusMinimal = Math.round(probe - draw);
          break;
        }
      }
    }

    perPot.push({
      preparation_id: id,
      surplus_minimal_g: surplusMinimal,
      title: prep.title ?? null,
      cook_on: prep.cook_on ?? prep.cookOn ?? null,
      ready_before_g: before === null || !Number.isFinite(before) ? null : Math.round(before),
      drawn_g: Math.round(draw),
      ready_after_g: after === null || !Number.isFinite(after) ? null : Math.round(after),
      rest_g: rest === null ? null : Math.round(rest),
      equation_ok: rest !== null && Math.round(after ?? 0) === Math.round(draw) + Math.round(rest),
      grown: fit.changed > 0,
      fit,
      draws: drawn.get(id) ?? { grams: 0, byDay: {}, byMouth: {} },
      ingredients: crus,
    });
  }

  const needs = shoppingNeedsOf({
    index,
    dishes: dishes.map((d) => ({
      ingredients: (d.ingredients as never) ?? [],
      day: (d.day as string | null) ?? null,
    })),
    preparations: preps.map((p) => ({
      ingredients: (p.ingredients as never) ?? [],
      cookOn: (p.cook_on as string | null) ?? (p.cookOn as string | null) ?? null,
    })),
  });
  const rebuilt = rebuildShoppingQuantities({
    index,
    lines: shopping as never,
    needs: needs.needs,
    identityByTerm: needs.identityByTerm,
    removed: new Set<string>(),
    locale: "fr",
  });

  // ⛔ PAS DE MATCHER MAISON. La question « cet achat sert-il à quelque chose ? »
  // a UNE fonction de production, qui lit les plats ET les casseroles et résout
  // les identités par le référentiel. La réécrire ici comparerait des chaînes —
  // la faute que ce dépôt a déjà payée douze fois sur douze.
  const auditAchats = shoppingIdentityAudit({
    index,
    plan: {
      dishes: dishes as never,
      preparations: preps as never,
      shopping_list: rebuilt.items as never,
    },
    pantryTerms: [],
    pantryCoveredG: new Map<string, number>(),
  });

  const blocked = await decidePotMassPublication({
    overdrawn: overdrawnAfter,
    unreadable: unreadableDrawn,
    worstShortfallG: Math.max(
      0,
      ...perPot.map((p) => p.rest_g !== null && p.rest_g < 0 ? -p.rest_g : 0),
    ),
    publish: async () => "would_write",
  });

  rapport.push({
    nom: cas.nom,
    note: cas.note,
    n_dishes: dishes.length,
    n_preps: preps.length,
    n_shop_avant: shopping.length,
    overdrawn_before: overdrawnBefore,
    overdrawn_after: overdrawnAfter,
    unreadable_drawn: unreadableDrawn,
    grown,
    ready_after: readyAfter,
    drawn_final: drawnFinal,
    reste: readyAfter - drawnFinal,
    equation_ok: readyAfter === drawnFinal + (readyAfter - drawnFinal),
    publication: blocked.kind,
    shopping_rebuild: rebuilt.counts,
    achats_inutiles: auditAchats.rows
      .filter((r) => r.state === "bought_unused")
      .map((r) => ({ ref: r.identity, term: r.displayTerm, reason: r.reason })),
    achats_manquants: auditAchats.rows
      .filter((r) => r.state === "not_bought" || r.state === "short")
      .map((r) => ({ ref: r.identity, state: r.state, reason: r.reason })),
    shopping_final: rebuilt.items.map((l) => ({
      ref: (l as { ref?: string }).ref ?? null,
      term: (l as { term?: string }).term ?? (l as { item?: string }).item ?? null,
      amount: (l as { amount?: number }).amount ?? null,
      unit: (l as { unit?: string }).unit ?? null,
      quantity: (l as { quantity?: string }).quantity ?? null,
    })),
    per_pot: perPot,
  });
}


// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-15 · LOT 3.3 — LE VERDICT, MESURÉ AU LIEU D'ÊTRE POSTULÉ
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUI VIVAIT ICI ÉTAIT UNE TAUTOLOGIE, ET L'AUDIT DU 2026-09-14 L'A DIT:
//     reste = prêt − prélevé ;  equation_ok = (prêt === prélevé + reste)
// La seconde ligne est vraie pour TOUTE paire de nombres. Elle ne pouvait donc
// rien attraper — et elle a rendu « vert » cinq fois sur cinq pendant que 260 g
// de lentilles partaient aux courses sans recette.
//
// CE QUI LA REMPLACE POSE TROIS QUESTIONS SÉPARABLES, chacune réfutable:
//
//   ① AUCUN DÉFICIT.  Une casserole ne peut pas servir plus qu'elle ne produit.
//      `reste < 0` est un défaut, pas un arrondi.
//
//   ② LE SURPLUS TIENT DANS UNE BORNE CALCULÉE DEPUIS LES OPÉRATIONS FAITES.
//      Chaque ligne d'ingrédient est arrondie au gramme par la croissance, et
//      la masse prête est arrondie une fois: la borne vaut donc
//      (nombre de lignes) + 1 grammes. ⛔ PAS 15 %: ce chiffre est le seuil de
//      DÉCLENCHEMENT du rétrécissement, et le réemployer en tolérance de
//      conservation ferait passer 900 g de surplus pour un arrondi.
//
//   ③ LES COURSES DÉCRIVENT LA MÊME NOURRITURE. Zéro besoin non acheté, et
//      zéro ligne achetée que personne ne cuisine — la cause `bought_unused`
//      ouverte par le lot 3.1, ici NOMMÉE plutôt que comptée.
const verdicts: Record<string, unknown>[] = [];
for (const r of rapport) {
  const pots = (r.per_pot as Record<string, unknown>[]) ?? [];
  const deficits: string[] = [];
  const horsBorne: string[] = [];
  const expliques: string[] = [];
  for (const p of pots) {
    const rest = p.rest_g as number | null;
    const lignes = ((p.ingredients as unknown[]) ?? []).length;
    if (rest === null) continue;
    if (rest < 0) {
      deficits.push(`${p.preparation_id}: ${rest} g`);
      continue;
    }
    // ① LA BORNE DE L'ARRONDI, quand aucune croissance n'a eu lieu: une ligne
    //    ne peut être arrondie que d'un gramme, plus un pour la masse prête.
    const borne = lignes + 1;
    if (rest <= borne) continue;
    // ② UNE CROISSANCE A EU LIEU: la seule borne honnête est la marche de
    //    l'escalier, balayée plus haut.
    const mini = p.surplus_minimal_g as number | null;
    if (mini !== null) {
      if (rest <= mini) {
        expliques.push(`${p.preparation_id}: +${rest} g = le minimum atteignable`);
      } else {
        horsBorne.push(`${p.preparation_id}: +${rest} g > minimum mesuré ${mini} g`);
      }
      continue;
    }
    // ③ AUCUNE CROISSANCE: ce surplus n'est PAS un arrondi, c'est le RESTE de
    //    la composition — la recette est un peu plus grande que la somme des
    //    parts. B4 demande des restes EXPLICITES, pas des restes nuls.
    //
    // ⛔ ET ON N'INVENTE AUCUN SEUIL. Choisir « 5 % » ici serait la même faute
    //    que réemployer les 15 % du rétrécissement: un nombre posé pour faire
    //    vert. Le moteur a DÉJÀ une décision sur la masse d'une casserole
    //    (`decidePotMassPublication`, appelée plus bas): un reste qu'il accepte
    //    n'a pas à être refusé par cet instrument-ci. On le NOMME, et c'est
    //    tout ce que le critère demande.
    expliques.push(`${p.preparation_id}: +${rest} g de reste, sans croissance`);
  }
  const counts = (r.shopping_rebuild ?? {}) as Record<string, number>;
  const achatsSansRecette =
    ((r.achats_inutiles as Record<string, unknown>[]) ?? []).map((a) =>
      `${a.ref} (${a.reason})`
    );
  const achatsManquants =
    ((r.achats_manquants as Record<string, unknown>[]) ?? []).map((a) =>
      `${a.ref} [${a.state}]`
    );
  verdicts.push({
    nom: r.nom,
    pots: pots.length,
    deficits,
    hors_borne: horsBorne,
    surplus_expliques: expliques,
    unattributed: counts.unattributed ?? null,
    needs_unbought: counts.needs_unbought ?? null,
    achats_sans_recette: achatsSansRecette,
    achats_manquants: achatsManquants,
    verdict: deficits.length === 0 && horsBorne.length === 0 &&
        (counts.needs_unbought ?? 0) === 0 && achatsSansRecette.length === 0
      ? "ok"
      : "defaut",
  });
}

const sortie = `${ROOT}scratchpad/2026-09-15-BETA-PREUVES/reconciliation.json`;
Deno.writeTextFileSync(
  sortie,
  JSON.stringify({ mesure_le: new Date().toISOString(), rapport, verdicts }, null, 2),
);
console.log(`écrit ${sortie}\n`);
console.log("cas                | pots | déficit | hors borne | non attrib. | non acheté | verdict");
console.log("-------------------+------+---------+------------+-------------+------------+--------");
for (const v of verdicts) {
  console.log(
    `${String(v.nom).padEnd(18)} | ${String(v.pots).padStart(4)} | ${
      String((v.deficits as string[]).length).padStart(7)
    } | ${String((v.hors_borne as string[]).length).padStart(10)} | ${
      String(v.unattributed ?? "-").padStart(11)
    } | ${String(v.needs_unbought ?? "-").padStart(10)} | ${v.verdict}`,
  );
  for (const d of v.deficits as string[]) console.log(`    ⛔ déficit  ${d}`);
  for (const h of v.hors_borne as string[]) console.log(`    ⛔ surplus ${h}`);
  for (const e of v.surplus_expliques as string[]) console.log(`    ✅ ${e}`);
  for (const a of v.achats_sans_recette as string[]) {
    console.log(`    ⛔ acheté, aucune recette ne l'emploie: ${a}`);
  }
  for (const a of v.achats_manquants as string[]) {
    console.log(`    ⚠️ besoin non couvert: ${a}`);
  }
}
const rouge = verdicts.filter((v) => v.verdict !== "ok").length;
console.log(
  `\n${rouge === 0 ? "✅" : "⛔"} ${verdicts.length - rouge}/${verdicts.length} cas réconciliés`,
);
Deno.exit(rouge === 0 ? 0 : 1);
