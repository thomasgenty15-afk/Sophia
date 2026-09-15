/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ C3 (2026-09-12) — LES COURSES PAR IDENTITÉ SONT BRANCHÉES, ET AU BON
 *                     ENDROIT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI DES ÉPINGLES DE POSITION EN PLUS DU BANC DE MODULE.
 * `shopping_identity.ts` et `shopping_rebuild.ts` sont purs, et leur banc a
 * vingt épreuves ; ça ne dit RIEN de l'endroit où ils tournent — et l'endroit
 * EST le lot. « Codé », « testé en isolation » et « branché jusqu'à la
 * livraison » sont trois états différents, et ce dépôt paie en boucle les
 * modules « écrits, éprouvés, sans appelant de production »
 * (`NON-BRANCHE.md`, cicatrice « ceinture armée sur coffre vide »).
 *
 * ⚠️ CHAQUE ÉPINGLE EST DOUBLÉE D'UNE COUPE : l'ancienne décision par libellé
 * ne doit pas pouvoir revenir à côté de la nouvelle. Deux classifications
 * divergentes derrière, c'est très exactement ce que le plan interdit.
 *
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE RECHERCHE. Un `grep` naïf
 * trouverait ses propres ancres dans les pavés qui les expliquent, et le test
 * resterait vert sur du code mort (`caller-audit-must-strip-comments`).
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const HANDLER = stripComments(
  await Deno.readTextFile(new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR)),
);
const MERGE = stripComments(
  await Deno.readTextFile(new URL("_shared/keel/retry_merge.ts", FUNCTIONS_DIR)),
);
const PARSER = stripComments(
  await Deno.readTextFile(new URL("_shared/keel/meal_generation.ts", FUNCTIONS_DIR)),
);
const AUDIT = stripComments(
  await Deno.readTextFile(new URL("_shared/keel/final_plan_audit.ts", FUNCTIONS_DIR)),
);

Deno.test("C3 CÂBLAGE ① — les points de filtrage restants reçoivent le référentiel", () => {
  // ⛔ « TOUS les chemins de filtrage », pas seulement celui qu'on a mesuré.
  //
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — QUATRE DES CINQ ONT DISPARU AVEC LEUR
  // APPEL. La fusion par cellule, l'épissage de réparation et l'entrée de
  // dernier recours supposaient tous une réponse ENTIÈRE du modèle; une
  // réparation rend maintenant un PATCH. Il reste la CHIRURGIE LOCALE
  // (`mergeCellEdit`), qui n'est pas une réparation et n'a pas bougé.
  assert(
    HANDLER.includes("mergeCellEdit({ base, retry: meal, cells: editCells, index: composition })"),
    "la chirurgie locale n'est plus câblée sur le référentiel",
  );
  for (
    const parti of [
      "mergeRetryCells({ base: meal, retry: retried, cells: repaired, index: composition })",
      "mergeRetryByCell({ base: meal, retry: retried, before: delivered, after, index: composition })",
      "spliceReworkableUnits({ base: meal, retry: retried, asks: spliceAsks, index: composition })",
      "const append = appendDedicatedDishes({",
    ]
  ) {
    assert(
      !HANDLER.includes(parti),
      `un chemin de fusion de plan entier est revenu : ${parti}`,
    );
  }
  // ⛔ LA COUPE : plus AUCUN appariement de courses par `normalizePantryTerm`
  // dans la fusion. C'est le corps exact qui jetait les six lignes.
  assert(
    !MERGE.includes("normalizePantryTerm"),
    "la fusion compare encore des libellés pour décider d'un achat",
  );
});
Deno.test("C3 CÂBLAGE ② — la reconstruction tourne APRÈS l'arrondi et AVANT la prose", () => {
  // ⛔ L'ORDRE EST LA MOITIÉ DE LA RÈGLE (C2 l'a écrit avant nous) : « recalculer
  // ensuite les calories, protéines, masses et densités, puis les courses et la
  // prose DEPUIS CETTE VERSION ».
  const arrondi = HANDLER.indexOf("const quantityRounding = (() => {");
  const releve = HANDLER.indexOf("const identitiesBefore = new Set(");
  const rebuild = HANDLER.indexOf("const rebuilt = rebuildShoppingQuantities({");
  const prose = HANDLER.indexOf("const quantityFinal = finalizeQuantityProse(");
  const sizing = HANDLER.indexOf("const applied = applySizing({");
  assert(releve > 0 && arrondi > 0 && rebuild > 0 && prose > 0 && sizing > 0, "les cinq ancres existent");
  assert(releve < sizing, "l'état d'avant est relevé après la multiplication : rien ne pourra se nommer");
  assert(arrondi < rebuild, "les courses se reconstruisent depuis la version ARRONDIE");
  assert(rebuild < prose, "la prose se dérive de la donnée finale, jamais l'inverse");
  // ⛔ ET ELLE TOURNE TOUJOURS, PAS SOUS CONDITION. L'ancien bloc était gardé
  // par « quelque chose a bougé » (`growth.scaled > 0 || …`) — donc une
  // réparation modèle, qui ne fait ni grossir ni rétrécir une casserole,
  // laissait les quantités du modèle en place. C'est le défaut que C3 ferme.
  const bloc = HANDLER.slice(rebuild - 900, rebuild);
  assert(
    !bloc.includes("growth.scaled > 0 || shrinkCounts.pots > 0"),
    "la reconstruction est de nouveau conditionnée à un compteur de croissance",
  );
});

Deno.test("C3 CÂBLAGE ③ — il n'y a plus qu'UNE décision d'achat dans le handler", () => {
  // ⛔ « Ne pas laisser deux classifications divergentes derrière. » Les deux
  // lectures de prose (`demandByTerm` sur `unit`, une expression régulière sur
  // le texte de la ligne) sont parties ensemble, avec le facteur qu'elles
  // nourrissaient.
  assert(!HANDLER.includes("const demandByTerm ="), "le rapport de demande par terme est revenu");
  assert(!HANDLER.includes("demandBefore"), "l'instantané de demande par terme est revenu");
  assert(!HANDLER.includes("scaleShoppingList("), "les courses suivent de nouveau un facteur");
  assert(
    !HANDLER.includes("ml|tbsp|tsp|tablespoons?|teaspoons?|cuill"),
    "la classification de la ligne de courses par son TEXTE est revenue",
  );
  // LE CAS QUI PASSE : le besoin est relevé par LA MÊME fonction partout.
  //
  // ⟳ 2026-09-12 · LOT 3 — ILS SONT TROIS, ET LE TROISIÈME EST LE SEMIS. Le
  // modèle n'écrit plus la liste : si personne ne la produit AVANT la datation
  // des vagues, celle-ci date un tableau vide et la prose du plan perd son jour
  // de courses (mesuré : `shopping_waves: 0 (none)` sur quatre tirs réels).
  //
  // ⛔ CE QUE CE COMPTE GARDE N'EST PAS « UN SEUL APPEL », c'est « UNE SEULE
  // FONCTION ». Le défaut que C3 a fermé, c'étaient DEUX classifications
  // divergentes (`demandByTerm` sur l'unité, une expression régulière sur le
  // texte) ; trois appels de `shoppingNeedsOf` ne peuvent pas diverger entre
  // eux. Les quatre assertions ci-dessus tiennent cette propriété-là.
  //
  // ⟳ 2026-09-12 · FERMETURE LOT 2 — ILS SONT QUATRE. Le quatrième relit les
  // USAGES DATÉS du plan final pour savoir si un seul achat couvre toutes les
  // cuissons d'un aliment (`splitShoppingByUses`). Même fonction, mêmes
  // entrées : il ne peut pas diverger des trois autres.
  assertEquals((HANDLER.match(/shoppingNeedsOf\(\{/g) || []).length, 4);
  assert(
    HANDLER.includes('tag: "keel.household_meal.shopping_seeded"'),
    "le semis ne se journalise pas : une liste vide et une liste semée se liraient pareil",
  );
  assert(HANDLER.includes('tag: "keel.household_meal.shopping_rebuild"'));
});

Deno.test("C3 CÂBLAGE ④ — la ligne écrite porte `ref`, `amount`, `unit`, `state` et `purchasable`", () => {
  // ⛔ LA DEMANDE EST RESTÉE OUVERTE DEUX CHANTIERS (`NON-BRANCHE.md` ⑥), et
  // sans elle **26 identités sur 26 de GAIN restaient incontrôlables en
  // quantité** — l'audit rendait « incomplet », honnêtement, sans rien
  // contrôler.
  const projection = PARSER.slice(PARSER.indexOf("export function mealShoppingPayload("));
  for (const champ of ["ref: s.ref ?? null,", "amount: s.amount ?? null,", "unit: s.unit ?? null,", "state: s.state ?? null,"]) {
    assert(projection.includes(champ), `la projection n'écrit pas \`${champ}\``);
  }
  // ⛔ `!== false` ET PAS `=== true` : une ligne d'archive reste ACHETABLE.
  assert(projection.includes("purchasable: s.purchasable !== false,"));
  // ⛔ ET L'AUDIT LES LIT — sinon le contrôle quantitatif dépendrait encore
  // d'une réinterprétation de la phrase.
  assert(AUDIT.includes("const amount = typeof line.amount === \"number\""));
  assert(AUDIT.includes("(COMPOSITION_UNITS as readonly string[]).includes(line.unit)"));
});

Deno.test("C3 CÂBLAGE ⑤ — le groupe de fraîcheur vient de la RÉFÉRENCE, et `foodGroupOfTerm` n'existe plus", () => {
  // ⛔ C'ÉTAIT LE DERNIER LECTEUR DE MESURE PARTANT DU LIBELLÉ, nommé par deux
  // chantiers et jamais fermé.
  assert(!PARSER.includes("const foodGroupOfTerm ="), "`foodGroupOfTerm` est revenu");
  assert(PARSER.includes("const foodGroupOfLine = ("));
  assert(PARSER.includes("freshnessGroupOf(args.composition ?? null, line)"));
  // La ligne de courses tire son groupe de la MÊME résolution que son identité.
  assert(PARSER.includes("food_group: lineRef.ref?.foodGroupRef ?? null,"));
  assert(PARSER.includes("ref: lineRef.ref?.slug ?? null,"));
});

Deno.test("C3 CÂBLAGE ⑥ — l'eau du robinet est classée une fois, par SLUG, et l'écran la retire", async () => {
  const identity = await Deno.readTextFile(
    new URL("_shared/keel/shopping_identity.ts", FUNCTIONS_DIR),
  );
  // ⛔ UN SLUG, PAS UN GROUPE : le groupe `water` est de la classe `beverage`,
  // aux côtés de `coffee_tea` et `sweetened_beverage`, qui s'achètent.
  assert(identity.includes('new Set(["water"])'));
  assert(!identity.includes('foodGroupRef === "water"'), "l'exclusion est passée au GROUPE");
  // L'audit la classe avant tout autre état.
  assert(AUDIT.includes("isNonPurchasableIdentity(row.identity)"));
  // Et l'écran ne la met pas dans le panier.
  const panel = await Deno.readTextFile(
    new URL("../../frontend/src/keel/components/ShoppingListPanel.tsx", FUNCTIONS_DIR),
  );
  assert(panel.includes("props.items.filter((i) => i.purchasable !== false)"));
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · FERMETURE LOT 2 — LE CALENDRIER SE REFAIT MÊME SANS NOUVEL
//                ALIMENT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C3 CÂBLAGE ⑦ — la redatation n'est plus gardée par `synthesized > 0`", () => {
  // ⛔ LE CAS QUE LA TABLE DU CHANTIER EXIGE: « jour de cuisson changé sans
  // nouvel ingrédient ⇒ dates d'achat et explications recalculées malgré
  // `synthesized = 0` ».
  //
  // Le bloc de redatation était gardé par « une ligne a été produite ». Une
  // réparation qui déplace une cuisson, change une conservation ou une
  // quantité n'ajoute AUCUN aliment — et laissait donc des dates d'achat
  // calculées sur le plan d'avant.
  const at = HANDLER.indexOf('tag: "keel.household_meal.shopping_redated"');
  assert(at > 0, "la redatation ne se journalise plus");
  const bloc = HANDLER.slice(at - 6000, at);
  assert(
    bloc.includes("const redated = buyDatesByIndex({"),
    "la redatation ne repasse plus par la MÊME fonction que la première datation",
  );
  assert(
    !bloc.includes("if (shoppingRebuild.synthesized > 0) {"),
    "la redatation est de nouveau conditionnée à la production d'une ligne",
  );
  // ⛔ ET ELLE RECOMPOSE LA PROSE, au lieu de poser un compteur à côté d'elle.
  assert(
    !HANDLER.includes("shopping_day_added_after_prose"),
    "la prose périmée est de nouveau gardée, avec un compteur pour l'excuser",
  );
  assert(
    HANDLER.includes("composeRationale({") &&
      HANDLER.includes("const vaguesApres = describeWrittenWaves({"),
    "les jours, les vagues écrites et l'explication ne se recomposent plus",
  );
  // ⛔ LE TÉMOIN RESTE: `still_undated` doit valoir zéro, et il sort.
  assert(HANDLER.includes("still_undated: sansJour,"), "le témoin des lignes sans jour a disparu");
  assert(HANDLER.includes("prose_recomposed: changement,"), "on ne dit plus si la prose a bougé");
});

Deno.test("C3 CÂBLAGE ⑧ — chaque USAGE est vérifié, pas seulement la première cuisson", () => {
  // ⛔ « Vérifier chaque usage, pas uniquement la première cuisson d'un
  // ingrédient utilisé plusieurs fois. » Un saumon cuisiné lundi ET vendredi
  // était acheté dimanche: la datation lit la cuisson la plus tôt, la garde le
  // besoin le plus tôt, et le filet du vendredi avait cinq jours.
  assert(
    HANDLER.includes("const scission = splitShoppingByUses({"),
    "la scission par usages n'a plus d'appelant",
  );
  const at = HANDLER.indexOf("const scission = splitShoppingByUses({");
  const bloc = HANDLER.slice(at, at + 2600);
  // ⛔ LA FENÊTRE VIENT DE LA MÊME LECTURE QUE LA DATATION ET QUE LA GARDE.
  assert(bloc.includes("keepingOf({"), "la scission lit une autre conservation");
  assert(
    bloc.includes("frozen: l.freeze_on_purchase === true,"),
    "une ligne destinée au congélateur serait scindée pour rien",
  );
  // ⛔ ET LES USAGES VIENNENT DU PLAN FINAL, par la MÊME fonction que les besoins.
  assert(
    HANDLER.slice(at - 2500, at).includes("const usages = shoppingNeedsOf({"),
    "les usages ne viennent plus de `shoppingNeedsOf`",
  );
  // ⛔ LA SOMME DES LIGNES RESTE LE BESOIN NET: la part est écrite par la
  // fonction de production, pas remise en forme ici.
  assert(bloc.includes("renderQuantity("), "la quantité scindée est remise en forme à la main");
  assert(
    bloc.includes("Math.round(l.amount * share)"),
    "la part n'est plus calculée depuis le besoin",
  );
});
