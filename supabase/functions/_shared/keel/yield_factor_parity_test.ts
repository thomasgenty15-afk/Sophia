import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  buildCompositionIndex,
  type CompositionRef,
  gramsRawOf,
  nutrientsOf,
  resolveIngredient,
  YIELD_FACTORS,
  yieldFactorOf,
  yieldResolutionOf,
} from "./food_composition.ts";
import { servedDensityOf, weighedReadyGrams } from "./box_densify.ts";
import { preparationReadyGrams } from "./meal_generation.ts";
import { loadCompositionIndex } from "./food_composition_io.ts";

// ⟳ LOT C (2026-09-11) — LES LIGNES D'INGRÉDIENT PORTENT DEUX CHAMPS DE PLUS.
// `ref` est l'identifiant de référence que le modèle a rendu, `refRefused` dit
// qu'il en a rendu un et qu'il a été refusé. Tous les cas de ce fichier les
// laissent à `null` / `false` EXPRÈS: ils testent la mesure par TERME LIBRE, que
// ce lot ne change pas — il ajoute un chemin prioritaire à côté. Les cas de
// l'identifiant vivent dans `composition_contract_test.ts`.

// ===========================================================================
// LE RENDEMENT PAR ALIMENT — LOT 1 DU PLAN SOLO (2026-09-07)
//
// Migration `20260907160000`. Le facteur cesse d'être une propriété de la
// CLASSE pour devenir une propriété de l'ALIMENT, la classe restant le
// secours.
//
// ⛔ CE QUE CE FICHIER TIENT, ET QUI N'EST PAS ÉVIDENT: les CINQ lecteurs de
// production passent par `yieldFactorOf`, et AUCUN ne lit `YIELD_FACTORS`
// directement. Un lecteur oublié ne casse rien tant que la colonne est vide —
// il rendrait exactement le même nombre. Il ne diverge qu'une fois la colonne
// remplie, c'est-à-dire le jour où plus personne ne relit ce lot. C'est
// pourquoi le dernier test de ce fichier lit le CODE SOURCE.
// ===========================================================================

/** Une fiche de test. `yieldFactor` est REQUIS: on veut le poser exprès. */
function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "refined_grain",
    label: over.slug,
    source: "ciqual",
    energyKcal: 350,
    proteinG: 12,
    carbsG: 70,
    fatG: 2,
    fiberG: 3,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: "grain_absorbs",
    yieldFactor: null,
    atwaterDiscount: 1.0,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  } as CompositionRef;
}

// Le couple témoin de tout le fichier: des pâtes MESURÉES à 2,2 et un poulet
// qui n'a pas de mesure. Même classe pour la première que la table de secours,
// facteur différent — c'est exactement le cas que le lot rend possible.
const PASTA_MEASURED = ref({ slug: "white_pasta", yieldFactor: 2.2 });
const PASTA_CLASS = ref({ slug: "couscous", yieldFactor: null });
const CHICKEN = ref({
  slug: "chicken_breast",
  foodGroupRef: "poultry",
  yieldClass: "meat_shrinks",
  yieldFactor: null,
  energyKcal: 165,
});

// ---------------------------------------------------------------------------
// ① LE RÉSOLVEUR LUI-MÊME
// ---------------------------------------------------------------------------

Deno.test("le facteur par ALIMENT gagne, et `null` retombe sur la CLASSE", () => {
  assertEquals(yieldFactorOf(PASTA_MEASURED), 2.2);
  assertEquals(yieldFactorOf(PASTA_CLASS), YIELD_FACTORS.grain_absorbs);
  assertEquals(yieldFactorOf(CHICKEN), YIELD_FACTORS.meat_shrinks);
  // ⛔ Le repli n'est pas une valeur en dur: muter `YIELD_FACTORS` doit faire
  // bouger ce test, sinon il ne teste pas ce qu'il prétend.
  assert(yieldFactorOf(PASTA_MEASURED) !== yieldFactorOf(PASTA_CLASS));
});

Deno.test("la RÉSOLUTION se compte — sinon un référentiel vide ressemble à un plein", () => {
  assertEquals(yieldResolutionOf(PASTA_MEASURED), "per_food");
  assertEquals(yieldResolutionOf(PASTA_CLASS), "per_class");
  assertEquals(yieldResolutionOf(CHICKEN), "per_class");
});

// ---------------------------------------------------------------------------
// ② LES CINQ LECTEURS, UN PAR UN
// ---------------------------------------------------------------------------

Deno.test("lecteur ① `gramsRawOf`: 220 g de pâtes CUITES font 100 g crues à 2,2", () => {
  const parAliment = gramsRawOf({
    amount: 220,
    unit: "g",
    state: "cooked",
    yieldClass: "grain_absorbs",
    yieldFactor: 2.2,
  });
  // ⚠️ `220 / 2.2` vaut `99.99999999999999` en IEEE 754, pas 100 — et
  // `gramsRawOf` N'ARRONDIT PAS, délibérément: l'arrondi appartient au bout de
  // la chaîne (`nutrientsOf`, les boîtes), pas à chaque conversion. Écrire
  // `assertEquals(…, 100)` ici aurait rendu ce test rouge pour une raison qui
  // n'a rien à voir avec le lot. On le DIT plutôt que de le masquer.
  assertEquals(Math.round(parAliment!), 100);
  assert(Math.abs(parAliment! - 100) < 1e-9);
  // La MÊME quantité, sans mesure par aliment, passe par 2,6 et rend 84,6 g.
  // ⛔ 15 g d'écart sur une seule ligne de recette, dans le sens qui SOUS-NOURRIT.
  const parClasse = gramsRawOf({
    amount: 220,
    unit: "g",
    state: "cooked",
    yieldClass: "grain_absorbs",
    yieldFactor: null,
  });
  assertEquals(parClasse, 220 / YIELD_FACTORS.grain_absorbs);
  assert(parClasse! < 100, "le facteur de classe, plus haut, rend MOINS de cru");
});

Deno.test("lecteur ② `nutrientsOf`: sur un plat FRIT, le rendement déplace l'ÉNERGIE", () => {
  // ⛔ C'EST LE SEUL CHEMIN PAR LEQUEL UN RENDEMENT TOUCHE LES CALORIES, et il
  // n'est nommé nulle part ailleurs: `nutrientsOf` calcule
  // `cookedWeight = gramsRaw × rendement` UNIQUEMENT pour imputer 12 % d'huile
  // de friture. Une ligne frite dont le facteur change voit donc son énergie
  // bouger sans passer par `gramsRawOf`.
  const a = nutrientsOf([{ ref: PASTA_MEASURED, gramsRaw: 100 }], { friedMethod: true });
  const b = nutrientsOf([{ ref: PASTA_CLASS, gramsRaw: 100 }], { friedMethod: true });
  assert(a !== "unknown" && b !== "unknown");
  // 100 g crus × 2,2 = 220 g cuits × 12 % = 26,4 g d'huile × 9 = 238 kcal.
  // À 2,6: 260 g × 12 % = 31,2 g × 9 = 281 kcal. 43 kcal d'écart sur UNE ligne.
  assert(b.energyKcal > a.energyKcal, "le facteur le plus haut impute plus d'huile");
  assertEquals(b.energyKcal - a.energyKcal, 43);
  // Et SANS friture, le rendement ne touche RIEN.
  const c = nutrientsOf([{ ref: PASTA_MEASURED, gramsRaw: 100 }]);
  const d = nutrientsOf([{ ref: PASTA_CLASS, gramsRaw: 100 }]);
  assert(c !== "unknown" && d !== "unknown");
  assertEquals(c.energyKcal, d.energyKcal);
});

Deno.test("lecteur ③ `weighedReadyGrams`: la masse SERVIE suit le facteur de l'aliment", () => {
  const index = buildCompositionIndex([PASTA_MEASURED], [{ alias: "pates", slug: "white_pasta" }]);
  assertEquals(
    Math.round(weighedReadyGrams([{ term: "pates", amount: 100, unit: "g", state: "raw" }], index)!),
    220,
  );
  const parClasse = buildCompositionIndex([PASTA_CLASS], [{ alias: "pates", slug: "couscous" }]);
  assertEquals(
    Math.round(
      weighedReadyGrams([{ term: "pates", amount: 100, unit: "g", state: "raw" }], parClasse)!,
    ),
    260,
  );
});

Deno.test("lecteur ④ `servedDensityOf`: kcal par gramme SERVI, divisé par le bon facteur", () => {
  // 350 kcal / 100 g crus, servis à 2,2 ⇒ 1,59 kcal/g. À 2,6 ⇒ 1,35.
  assertEquals(Math.round(servedDensityOf(PASTA_MEASURED) * 100) / 100, 1.59);
  assertEquals(Math.round(servedDensityOf(PASTA_CLASS) * 100) / 100, 1.35);
  // ⚠️ C'est la densité qui décide où la densification déplace des grammes:
  // un facteur trop haut fait passer un féculent pour plus léger qu'il n'est.
  assert(servedDensityOf(PASTA_MEASURED) > servedDensityOf(PASTA_CLASS));
});

Deno.test("lecteur ⑤ `preparationReadyGrams`: la casserole pèse par aliment", () => {
  const index = buildCompositionIndex([PASTA_MEASURED], [{ alias: "pates", slug: "white_pasta" }]);
  assertEquals(
    Math.round(preparationReadyGrams(
      [{
        term: "pates",
        ref: null,
        refRefused: false,
        quantity: "500 g",
        in_pantry: false,
        amount: 500,
        unit: "g",
        state: "raw",
        gramsRaw: 500,
        quantitySource: "structured",
        part: null,
        group: null,
      }],
      index,
    )!),
    1100,
  );
});

// ---------------------------------------------------------------------------
// ③ CE QUI NE DOIT PAS BOUGER — les deux lectures qui restent sur la CLASSE
// ---------------------------------------------------------------------------

Deno.test("un `state` reste EXIGÉ sur une classe non neutre, quel que soit le facteur", () => {
  // ⛔ `stateMattersFor` lit la CLASSE, pas le facteur. Le CHECK SQL
  // `yield_factor_agrees_with_class` est ce qui rend ça sûr: une classe non
  // neutre garde un facteur ≠ 1. Sans lui, un `veg_shrinks` posé à 1,0 par
  // aliment accepterait soudain un état absent — un aliment qui change sa
  // propre règle d'admission en passant par sa valeur.
  assertEquals(
    gramsRawOf({
      amount: 100,
      unit: "g",
      state: null,
      yieldClass: "grain_absorbs",
      yieldFactor: 2.2,
    }),
    null,
  );
  // Et une huile, neutre, l'accepte toujours.
  assertEquals(
    gramsRawOf({ amount: 15, unit: "ml", state: null, yieldClass: "neutral", yieldFactor: null }),
    15,
  );
});

Deno.test("`neutral` est la SEULE classe à facteur 1,0 — les 111 prix en dépendent", () => {
  // `meal_cost.ts:411` définit `cooked_label_dry_input` comme « rendement de
  // classe = 1,0 ». Cette équivalence est ce qui autorise `meal_cost` à rester
  // sur la classe sans jamais diverger du reste du moteur.
  for (const [cls, f] of Object.entries(YIELD_FACTORS)) {
    assertEquals(f === 1.0, cls === "neutral", `${cls} rompt l'équivalence`);
  }
});

// ---------------------------------------------------------------------------
// ④ LE CHARGEUR — et sa garde MIROIR du CHECK
// ---------------------------------------------------------------------------

function dbWith(rows: Record<string, unknown>[]) {
  return {
    from(table: string) {
      const data = table === "food_composition_refs" ? rows : [];
      return {
        select(_c: string) {
          return { range: (_f: number, _t: number) => Promise.resolve({ data, error: null }) };
        },
      };
    },
  };
}
const ROW = {
  slug: "white_pasta",
  food_group_ref: "refined_grain",
  label: "Pasta",
  source: "ciqual",
  energy_kcal: 350,
  yield_class: "grain_absorbs",
  atwater_discount: 1,
};

Deno.test("chargeur — un facteur en CHAÎNE est lu comme un nombre", async () => {
  // ⚠️ PostgREST rend un `numeric` en CHAÎNE. Un `Number()` oublié aurait fait
  // `"2.2" ?? …` rendre la chaîne, et `220 / "2.2"` marche en JavaScript — le
  // défaut aurait été invisible jusqu'à une comparaison.
  // deno-lint-ignore no-explicit-any
  const index = await loadCompositionIndex(dbWith([{ ...ROW, yield_factor: "2.2" }]) as any);
  const r = resolveIngredient(index, "white_pasta");
  assert(r !== null);
  assertEquals(r!.yieldFactor, 2.2);
  assertEquals(typeof r!.yieldFactor, "number");
  assertEquals(yieldFactorOf(r!), 2.2);
});

Deno.test("chargeur — un facteur qui CONTREDIT sa classe est JETÉ, jamais réparé", async () => {
  const warns: string[] = [];
  const real = console.warn;
  console.warn = (...a: unknown[]) => warns.push(String(a[0]));
  try {
    // 0,9 sur une classe qui ABSORBE. Le CHECK SQL le refuse aujourd'hui; une
    // ligne écrite AVANT le CHECK y survivrait, et c'est le cas que ce test
    // tient. Appliqué, il ferait passer 220 g de pâtes cuites pour 244 g crues.
    // deno-lint-ignore no-explicit-any
    const index = await loadCompositionIndex(dbWith([{ ...ROW, yield_factor: 0.9 }]) as any);
    const r = resolveIngredient(index, "white_pasta");
    assert(r !== null);
    // ⛔ `null`, PAS 0,9 et pas une valeur « corrigée »: le repli est
    // l'abstention. La ligne retombe sur sa classe, comme avant le lot.
    assertEquals(r!.yieldFactor, null);
    assertEquals(yieldFactorOf(r!), YIELD_FACTORS.grain_absorbs);
  } finally {
    console.warn = real;
  }
  assertEquals(warns.length, 1);
  assert(warns[0].includes("keel.composition.yield_factor_contradicts_class"));
  assert(warns[0].includes('"reason":"contradicts_class"'));
  assert(warns[0].includes('"slug":"white_pasta"'));
});

Deno.test("chargeur — un facteur HORS BORNE est jeté, et le motif le distingue", async () => {
  const warns: string[] = [];
  const real = console.warn;
  console.warn = (...a: unknown[]) => warns.push(String(a[0]));
  try {
    // deno-lint-ignore no-explicit-any
    const index = await loadCompositionIndex(dbWith([{ ...ROW, yield_factor: 12 }]) as any);
    assertEquals(resolveIngredient(index, "white_pasta")!.yieldFactor, null);
  } finally {
    console.warn = real;
  }
  // ⛔ DEUX MOTIFS, pas un: « hors borne » et « contredit sa classe » ne se
  // réparent pas au même endroit, et un seul jeton les confondrait.
  assert(warns[0].includes('"reason":"out_of_bounds"'));
});

Deno.test("chargeur — une colonne ABSENTE rend `null`, sans un mot", async () => {
  // C'est l'état de 919 lignes sur 925, et le cas nominal: il ne doit produire
  // AUCUN avertissement. Une garde qui crie sur le cas normal se fait couper.
  const warns: string[] = [];
  const real = console.warn;
  console.warn = (...a: unknown[]) => warns.push(String(a[0]));
  try {
    // deno-lint-ignore no-explicit-any
    const index = await loadCompositionIndex(dbWith([ROW]) as any);
    assertEquals(resolveIngredient(index, "white_pasta")!.yieldFactor, null);
  } finally {
    console.warn = real;
  }
  assertEquals(warns, []);
});

// ---------------------------------------------------------------------------
// ⑤ L'ANTI-CONTOURNEMENT — le test qui lit le CODE
// ---------------------------------------------------------------------------

Deno.test("aucun lecteur de production ne lit `YIELD_FACTORS` en direct", async () => {
  // ⛔ POURQUOI CE TEST EXISTE. Un sixième lecteur ajouté demain avec
  // `YIELD_FACTORS[ref.yieldClass]` rendrait EXACTEMENT le même nombre tant que
  // la colonne est vide sur sa ligne. Il ne divergerait que le jour où
  // quelqu'un remplit `yield_factor` pour cet aliment — c'est-à-dire longtemps
  // après que ce lot a cessé d'être relu. Aucun test de comportement ne peut
  // attraper ça: seul un scan de source le peut.
  //
  // TROIS FICHIERS ONT LE DROIT, et chacun pour une raison écrite:
  //   · `food_composition.ts` — il DÉCLARE la table et porte `yieldFactorOf`.
  //   · `food_composition_io.ts` — sa garde miroir compare le facteur lu au
  //     sens de la classe; c'est une comparaison, pas une application.
  //   · `meal_cost.ts` — sa grille de prix est définie sur « classe neutre »,
  //     et le CHECK `yield_factor_agrees_with_class` la tient.
  const AUTORISES = new Set([
    "food_composition.ts",
    "food_composition_io.ts",
    "meal_cost.ts",
  ]);
  const coupables: string[] = [];
  for await (const e of Deno.readDir(new URL(".", import.meta.url))) {
    if (!e.isFile || !e.name.endsWith(".ts")) continue;
    if (e.name.endsWith("_test.ts") || AUTORISES.has(e.name)) continue;
    const src = await Deno.readTextFile(new URL(e.name, import.meta.url));
    // ⚠️ On cherche l'USAGE indexé, pas le mot: un commentaire qui NOMME la
    // table (`fridge_window.ts` le fait, et il a raison) n'est pas un lecteur.
    if (/YIELD_FACTORS\s*\[/.test(src)) coupables.push(e.name);
  }
  assertEquals(
    coupables,
    [],
    `ces fichiers lisent le facteur de CLASSE en direct au lieu de yieldFactorOf(): ${
      coupables.join(", ")
    }`,
  );
});
