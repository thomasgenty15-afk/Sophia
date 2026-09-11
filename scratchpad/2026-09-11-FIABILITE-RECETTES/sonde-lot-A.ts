/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SONDE DU LOT A — les deux cases SANS BOÎTE, remesurées sur la fixture figée
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI UNE SONDE À PART, ET PAS UNE LIGNE DE PLUS DANS L'INSTRUMENT.
 * `scripts/2026-09-11-mesure-grille.ts` mesure ce qui est ÉCRIT dans le plan.
 * Or PERTE `sat/lunch` et GAIN `fri/dinner` n'ont AUCUNE boîte dans l'archive:
 * le moteur n'a pas su dimensionner leur assiette le 2026-09-11, donc il n'a
 * rien écrit, et une boîte absente d'une archive le reste pour toujours.
 * L'instrument ne peut donc pas dire si le lot A répare ces deux cases — il
 * peut seulement continuer à dire qu'elles sont vides.
 *
 * Cette sonde pose l'autre question, la seule qui se prouve hors ligne:
 * **la PART STANDARD de ces deux plats redevient-elle mesurable ?** C'est
 * exactement l'étape qui a échoué — `standardPortionOf` rend `null`, donc aucun
 * facteur, donc aucune boîte.
 *
 * ⛔ AUCUN APPEL MODÈLE, AUCUNE GÉNÉRATION, AUCUNE ÉCRITURE. `--allow-read` et
 * rien d'autre, comme l'instrument du lot 0.
 *
 *     deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/sonde-lot-A.ts
 */
import { chargerFixtures, troisIndex } from "../../scripts/2026-09-11-mesure-grille.ts";
import { fromFileUrl } from "jsr:@std/path@1";
import { standardPortionOf } from "../../supabase/functions/_shared/keel/portion_sizing.ts";
import { drawsByPreparation } from "../../supabase/functions/_shared/keel/portion_sizing.ts";

const RACINE = fromFileUrl(new URL("./fixtures", import.meta.url));

/** La ligne telle que l'archive la porte, avec et sans son identifiant. */
type Ligne = Record<string, unknown>;

function sansRef(ing: Ligne): Ligne {
  const { ref: _ref, ...reste } = ing;
  return reste;
}

function lignesDe(u: Ligne, garderRef: boolean): Ligne[] {
  return ((u.ingredients ?? []) as Ligne[]).map((i) => {
    const base = garderRef ? i : sansRef(i);
    return {
      term: String(base.term ?? ""),
      amount: base.amount ?? null,
      unit: base.unit ?? null,
      state: base.state ?? null,
      quantity: base.quantity ?? null,
      ref: garderRef ? (base.ref ?? null) : null,
      refRefused: false,
    };
  });
}

const CIBLES: { plan: string; jour: string; slot: string }[] = [
  { plan: "1f8a8988-b3ed-4b83-a4d0-93297ac0d652", jour: "sat", slot: "lunch" },
  { plan: "1eada05b-2c3d-4ed5-aa85-14edf2840b77", jour: "fri", slot: "dinner" },
  // Le témoin: une case qui marchait déjà. Elle ne doit pas bouger.
  { plan: "1f8a8988-b3ed-4b83-a4d0-93297ac0d652", jour: "sun", slot: "dinner" },
];

const fx = await chargerFixtures(RACINE);
const L: string[] = [];
L.push("══ SONDE LOT A — la part standard des deux cases sans boîte ══════════");
L.push("");
L.push("⛔ Aucune génération. Les quantités sont celles de l'archive, au caractère.");
L.push("   La seule différence entre les deux colonnes est la présence du champ");
L.push("   `ref` que le modèle avait DÉJÀ écrit, et que les lecteurs jetaient.");
L.push("");

for (const cible of CIBLES) {
  const plan = fx.plans.find((p) => String(p.id) === cible.plan)!;
  const index = (await troisIndex(fx, plan)).relecture.index;
  const dish = ((plan.dishes ?? []) as Ligne[]).find(
    (d) => String(d.day) === cible.jour && String(d.slot) === cible.slot,
  )!;
  const preps = (plan.preparations ?? []) as Ligne[];
  const uses = ((dish.uses ?? []) as Ligne[]).map((u) => ({
    preparationId: String(u.preparation_id ?? ""),
  }));
  const draws = drawsByPreparation(
    ((plan.dishes ?? []) as Ligne[]).map((d) => ({
      uses: ((d.uses ?? []) as Ligne[]).map((u) => ({
        preparationId: String(u.preparation_id ?? ""),
      })),
    })),
  );

  const mesure = (garderRef: boolean) =>
    standardPortionOf({
      index,
      dish: { method: String(dish.method ?? ""), ingredients: lignesDe(dish, garderRef) },
      uses,
      preparations: preps.map((p) => ({
        id: String(p.id ?? ""),
        method: String(p.method ?? ""),
        ingredients: lignesDe(p, garderRef),
      })),
      drawsByPrep: draws,
    });

  const sans = mesure(false);
  const avec = mesure(true);
  L.push(`── ${String(plan.id).slice(0, 8)} · ${cible.jour}/${cible.slot} ──`);
  L.push(`   titre        ${String(dish.title ?? "")}`);
  L.push(`   boîtes dans l'archive : ${((dish.boxes ?? []) as unknown[]).length}`);
  const ligne = (nom: string, p: ReturnType<typeof mesure>) =>
    `   ${nom.padEnd(12)} kcal ${p.kcal === null ? "—" : p.kcal.toFixed(0).padStart(6)}` +
    ` · prêt ${p.cookedG === null ? "—" : String(p.cookedG).padStart(5)} g` +
    ` · densité ${p.densityPer100G === null ? "—" : String(p.densityPer100G).padStart(5)}` +
    ` · trous [${p.gaps.join(", ") || "aucun"}]`;
  L.push(ligne("sans `ref`", sans));
  L.push(ligne("avec `ref`", avec));
  L.push("");
}
console.log(L.join("\n"));
