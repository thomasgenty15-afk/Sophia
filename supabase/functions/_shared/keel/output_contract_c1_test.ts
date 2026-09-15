/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE CONTRAT DE SORTIE — ÉTAPE C1 DU 2026-09-12
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Chantier: `docs/keel/PLAN-CLOTURE-APRES-SIX-TIRS-2026-09-11.md`, § C1.
 * Preuve d'entrée: `scratchpad/2026-09-11-CLOTURE/fixtures/c0-tir2.json`.
 *
 * ── LE DÉFAUT, AVEC SES CHIFFRES ─────────────────────────────────────────
 * Tir n° 2 du 2026-09-11, PREMIER JET: 6 plats, 31 lignes d'ingrédients,
 * **zéro `ref`** — alors que le catalogue servi au prompt portait 121 lignes
 * et 4 715 caractères. Cinq plats se sont pesés quand même, par leur TERME
 * libre en français. `{"term":"pita complète","amount":1,"unit":"unit"}` ne
 * s'est pesé par personne: une « unité » dont le poids n'est connu d'aucune
 * table. La case `sun/dinner` est partie SANS PORTION, et le rapport a publié
 * « 5 / 5 » de conformité calorique — parce qu'une case sans portion ne pose
 * aucune des cinq questions, donc n'en rate aucune.
 *
 * ⛔ C'EST LA DÉFINITION D'UNE RÉUSSITE PARTIELLE SILENCIEUSE, et c'est ce que
 * ce fichier garde fermé.
 *
 * ⚠️ CHAQUE CAS A SON JUMEAU QUI PASSE. « Une garde qu'on n'a vue que refuser
 * n'est pas vérifiée » — cassée, elle bloquerait tout et ressemblerait à une
 * garde qui marche.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  checkOutputContract,
  type OutputContractLine,
} from "./composition_contract.ts";
import { defectsFromOutputContract } from "./plan_repair_loop.ts";
import {
  type DishIngredient,
  type GeneratedMeal,
  outputContractLinesOf,
} from "./meal_generation.ts";

// ---------------------------------------------------------------------------
// LE DÉCOR — les lignes du tir n° 2, recopiées de la fixture C0
// ---------------------------------------------------------------------------

/** Un ingrédient parsé, avec les seuls champs que le contrat de sortie lit. */
function ing(over: Partial<DishIngredient>): DishIngredient {
  return {
    term: "x",
    ref: null,
    refRefused: false,
    quantity: null,
    in_pantry: false,
    amount: null,
    unit: null,
    state: null,
    gramsRaw: null,
    quantitySource: null,
    group: null,
    part: null,
    ...over,
  } as DishIngredient;
}

/**
 * `sun/dinner` DU TIR N° 2, LIGNE POUR LIGNE.
 *
 * ⚠️ RECOPIÉ DE `c0-tir2.json` → `etapes.premier_jet` → `dishes[5]`. Rien n'est
 * arrondi, rien n'est ajouté: `ref` est absent partout parce qu'il l'était.
 */
const TIR2_SUN_DINNER: DishIngredient[] = [
  ing({ term: "pita complète", amount: 1, unit: "unit", state: "raw" }),
  ing({ term: "laitue", amount: 40, unit: "g", state: "raw" }),
  ing({ term: "yaourt nature", amount: 40, unit: "g", state: "raw" }),
  ing({ term: "citron", amount: 0.167, unit: "unit", state: "raw" }),
  ing({ term: "tahini", amount: 10, unit: "g", state: "raw" }),
];

function mealOf(
  dishes: { day: string; slot: string; title: string; ingredients: DishIngredient[] }[],
  preparations: { id: string; title: string; ingredients: DishIngredient[] }[] = [],
): Pick<GeneratedMeal, "dishes" | "preparations"> {
  return {
    // deno-lint-ignore no-explicit-any
    dishes: dishes as any,
    // deno-lint-ignore no-explicit-any
    preparations: preparations as any,
  };
}

/** Aucun condiment par défaut: la porte de convention est injectée, pas devinée. */
const RIEN_PAR_CONVENTION = () => false;
/** Le sel, et lui seul, se pèse sans quantité. */
const SEL_PAR_CONVENTION = (slug: string) => slug === "salt";

// ---------------------------------------------------------------------------
// ① LA RÉGRESSION OBLIGATOIRE DU PLAN — « pita complète »
// ---------------------------------------------------------------------------

Deno.test("⛔ C1 · TIR 2 — cinq lignes pesées sans identifiant sont CINQ défauts", () => {
  const report = checkOutputContract({
    lines: outputContractLinesOf(
      mealOf([{
        day: "sun",
        slot: "dinner",
        title: "Lentilles, pita, laitue et sauce au tahini",
        ingredients: TIR2_SUN_DINNER,
      }]),
    ),
    weighsByConvention: RIEN_PAR_CONVENTION,
  });
  assertEquals(report.lines, 5);
  assertEquals(report.counters.ref_missing, 5);
  assertEquals(report.counters.ok, 0);
  // ⛔ ET LE DÉFAUT NOMME LA LIGNE, PAS SEULEMENT LE PLAT. « il manque des
  // identifiants » n'est pas réparable; « la pita » l'est.
  const pita = report.findings.find((f) => f.term === "pita complète");
  assert(pita !== undefined, "la pita doit être nommée");
  assertEquals(pita?.verdict, "ref_missing");
  assertEquals(pita?.site.day, "sun");
  assertEquals(pita?.site.slot, "dinner");
});

Deno.test("⛔ C1 · TIR 2 — la MÊME pita AVEC sa référence est une portion calculable", () => {
  // LE CAS QUI PASSE, et c'est la moitié que le plan exige en toutes lettres:
  // « référence correcte → portion calculable ». Rien d'autre ne bouge: même
  // terme, même quantité, même unité.
  const report = checkOutputContract({
    lines: outputContractLinesOf(
      mealOf([{
        day: "sun",
        slot: "dinner",
        title: "Lentilles, pita, laitue et sauce au tahini",
        ingredients: TIR2_SUN_DINNER.map((i) =>
          i.term === "pita complète"
            ? { ...i, ref: "pita_wholemeal", amount: 60, unit: "g" }
            : { ...i, ref: `slug_${i.term}` }
        ),
      }]),
    ),
    weighsByConvention: RIEN_PAR_CONVENTION,
  });
  assertEquals(report.counters.ok, 5);
  assertEquals(report.counters.ref_missing, 0);
  assertEquals(report.findings, []);
  assertEquals(defectsFromOutputContract(report), []);
});

Deno.test("⛔ C1 · une omission ne devient PAS une réussite à cinq sur six", () => {
  // Le plan complet du tir n° 2: cinq plats dont toutes les lignes portent un
  // identifiant, et le sixième — `sun/dinner` — qui n'en porte aucun. C'est
  // exactement la forme qui a été livrée, et c'est elle qui doit produire des
  // défauts au lieu d'un verdict vert.
  const conformes = ["sat/breakfast", "sat/lunch", "sat/dinner", "sun/breakfast", "sun/lunch"]
    .map((cell) => {
      const [day, slot] = cell.split("/");
      return {
        day,
        slot,
        title: `plat ${cell}`,
        ingredients: [ing({ term: "pain complet", ref: "bread_wholemeal", amount: 60, unit: "g" })],
      };
    });
  const report = checkOutputContract({
    lines: outputContractLinesOf(
      mealOf([
        ...conformes,
        {
          day: "sun",
          slot: "dinner",
          title: "Lentilles, pita, laitue et sauce au tahini",
          ingredients: TIR2_SUN_DINNER,
        },
      ]),
    ),
    weighsByConvention: RIEN_PAR_CONVENTION,
  });
  assertEquals(report.counters.ok, 5, "les cinq plats conformes restent conformes");
  assertEquals(report.counters.ref_missing, 5, "les cinq lignes du sixième mordent");
  const defauts = defectsFromOutputContract(report);
  assertEquals(defauts.length, 5);
  // ⛔ TOUS RÉPARABLES: le catalogue A ÉTÉ SERVI. Ce n'est pas le cas
  // `cell_energy_unmeasurable` (aliment introuvable, correction au
  // référentiel); c'est un modèle qui n'a pas cité une liste qu'il a lue.
  assert(defauts.every((d) => d.repairable), "un appel modèle répare ça");
  assert(defauts.every((d) => d.kind === "sizing"));
  assert(defauts.every((d) => d.magnitude === null), "aucune amplitude inventée");
  // ET LA PHRASE PART EN ANGLAIS, SANS CODE INTERNE.
  const detail = defauts[0].detail;
  assert(!detail.includes("ref_missing"), "un code interne n'est pas une consigne");
  assert(detail.includes('"ref"'));
});

// ---------------------------------------------------------------------------
// ② LES CONVENTIONS — une pincée n'est pas un défaut, une huile en est un
// ---------------------------------------------------------------------------

Deno.test("⛔ C1 · un condiment SANS quantité passe, une huile SANS quantité MORD", () => {
  const report = checkOutputContract({
    lines: [
      { site: site(), term: "sel", ref: "salt", refRefused: false, amount: null, unit: null },
      { site: site(), term: "huile d'olive", ref: "olive_oil", refRefused: false, amount: null, unit: null },
    ],
    weighsByConvention: SEL_PAR_CONVENTION,
  });
  assertEquals(report.counters.convention, 1);
  assertEquals(report.counters.quantity_missing, 1);
  assertEquals(report.findings.length, 1);
  assertEquals(report.findings[0].term, "huile d'olive");
  // ⚠️ LA DIRECTION DE L'ERREUR EST MESURÉE: 82 lignes d'huile sans quantité
  // sur 80 générations (2026-08-12), chacune éteignant le verdict de son plan.
  // Une pincée de sel ne déplace rien; un filet d'huile retire 120 kcal.
});

Deno.test("⛔ C1 · une pincée SANS identifiant est comptée à part — jamais fondue", () => {
  // `dash_unreferenced` n'est PAS un défaut (le plan n'exige l'identifiant que
  // sur les lignes pesées), et il n'est PAS `convention` non plus: fondus, un
  // plan sans aucun identifiant ressemblerait trait pour trait à un plan qui
  // suit la convention.
  const report = checkOutputContract({
    lines: [
      { site: site(), term: "poivre", ref: null, refRefused: false, amount: null, unit: null },
      { site: site(), term: "sel", ref: "salt", refRefused: false, amount: null, unit: null },
    ],
    weighsByConvention: SEL_PAR_CONVENTION,
  });
  assertEquals(report.counters.dash_unreferenced, 1);
  assertEquals(report.counters.convention, 1);
  assertEquals(report.findings, []);
});

Deno.test("⛔ C1 · un identifiant REFUSÉ mord même sur une ligne non pesée", () => {
  // Un identifiant inventé est la seule faute que le bloc du prompt déclare
  // « toujours refusée ». La taire parce que la ligne est une pincée la
  // laisserait vivre.
  const report = checkOutputContract({
    lines: [
      { site: site(), term: "épice magique", ref: null, refRefused: true, amount: null, unit: null },
    ],
    weighsByConvention: SEL_PAR_CONVENTION,
  });
  assertEquals(report.counters.ref_refused, 1);
  assertEquals(report.counters.dash_unreferenced, 0);
  assertEquals(defectsFromOutputContract(report).length, 1);
});

// ---------------------------------------------------------------------------
// ③ AUCUNE IDENTITÉ INVENTÉE PAR RAPPROCHEMENT DE NOMS
// ---------------------------------------------------------------------------

Deno.test("⛔ C1 · deux lignes du MÊME terme: celle sans identifiant reste en défaut", () => {
  // ⛔ « Ne pas inventer une identité depuis un rapprochement approximatif de
  // noms » — le chantier l'écrit pour la RÉPARATION, et la seule façon de le
  // tenir est que ce module ne voie JAMAIS les voisines d'une ligne. Ici, une
  // pita identifiée et une pita nue: la seconde ne récupère rien.
  const report = checkOutputContract({
    lines: [
      { site: site("sat"), term: "pita complète", ref: "pita_wholemeal", refRefused: false, amount: 60, unit: "g" },
      { site: site("sun"), term: "pita complète", ref: null, refRefused: false, amount: 1, unit: "unit" },
    ],
    weighsByConvention: RIEN_PAR_CONVENTION,
  });
  assertEquals(report.counters.ok, 1);
  assertEquals(report.counters.ref_missing, 1);
  assertEquals(report.findings[0].site.day, "sun");
});

// ---------------------------------------------------------------------------
// ④ LES PRÉPARATIONS — c'est là que vit la masse du foyer
// ---------------------------------------------------------------------------

Deno.test("⛔ C1 · une PRÉPARATION sans identifiant mord, et se nomme par son id", () => {
  const report = checkOutputContract({
    lines: outputContractLinesOf(
      mealOf(
        [{
          day: "sat",
          slot: "lunch",
          title: "assiette",
          ingredients: [ing({ term: "salade", ref: "lettuce", amount: 40, unit: "g" })],
        }],
        [{
          id: "prep_lentils",
          title: "Lentilles du samedi",
          ingredients: [ing({ term: "lentilles", amount: 300, unit: "g" })],
        }],
      ),
    ),
    weighsByConvention: RIEN_PAR_CONVENTION,
  });
  assertEquals(report.lines, 2, "⛔ les préparations sont dans le dénominateur");
  assertEquals(report.counters.ref_missing, 1);
  assertEquals(report.findings[0].site.preparationId, "prep_lentils");
  // ⚠️ ET ON NE LUI INVENTE NI JOUR NI MOMENT: elle est servie plusieurs fois.
  assertEquals(report.findings[0].site.day, null);
  assertEquals(report.findings[0].site.slot, null);
  const detail = defectsFromOutputContract(report)[0].detail;
  assert(detail.includes("prep_lentils"), "la consigne dit OÙ");
});

// ---------------------------------------------------------------------------
// ⑤ LA COUPE — sans elle, ces tests seraient verts sur un module désarmé
// ---------------------------------------------------------------------------

Deno.test("COUPE — un plan ENTIÈREMENT conforme ne produit AUCUN défaut", () => {
  // Si ce cas rougissait, la garde bloquerait tout et ressemblerait pourtant à
  // une garde qui marche: c'est la cicatrice `guards-need-a-passing-case`.
  const report = checkOutputContract({
    lines: [
      { site: site(), term: "poulet", ref: "chicken_breast", refRefused: false, amount: 150, unit: "g" },
      { site: site(), term: "sel", ref: "salt", refRefused: false, amount: null, unit: null },
    ],
    weighsByConvention: SEL_PAR_CONVENTION,
  });
  assertEquals(report.findings, []);
  assertEquals(report.counters.ok, 1);
  assertEquals(report.counters.convention, 1);
  assertEquals(defectsFromOutputContract(report), []);
});

Deno.test("COUPE — une ligne sans terme n'entre dans aucun dénominateur", () => {
  const lignes = outputContractLinesOf(
    mealOf([{
      day: "sat",
      slot: "lunch",
      title: "assiette",
      ingredients: [ing({ term: "   " }), ing({ term: "riz", ref: "rice", amount: 80, unit: "g" })],
    }]),
  );
  assertEquals(lignes.length, 1);
});

function site(day: string | null = "sat") {
  return { day, slot: "lunch", dish: "assiette", preparationId: null };
}

// Le type est importé pour que le décor ci-dessus soit vérifié par le
// compilateur, pas seulement par la forme.
const _shape: OutputContractLine = {
  site: site(),
  term: "x",
  ref: null,
  refRefused: false,
  amount: null,
  unit: null,
};
void _shape;
