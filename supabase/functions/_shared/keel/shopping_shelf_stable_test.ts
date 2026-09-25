/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ LOT 3 (2026-09-12) — LA CONSERVE VA EN ÉPICERIE, ET LA LISTE EST COURTE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CE BANC GARDE, ET IL A COÛTÉ UN PLAN REFUSÉ. Le rayon d'une ligne
 * de courses décide de sa DATE D'ACHAT : `PERISHABLE_AISLES`
 * (`grocery_waves.ts`) range `produce`, `protein` et `dairy` dans le frais.
 * Depuis que le modèle n'écrit plus la liste, le rayon vient du GROUPE du
 * référentiel — et `food_composition_refs` n'a aucune colonne de conservation :
 * `tuna_fresh` et `tuna_tinned` y portent le même `white_fish`.
 *
 * Mesuré sur le tir 3 réel du 2026-09-12 : le thon EN CONSERVE est parti au
 * rayon `protein`, a été déclaré périssable, et la garde a REFUSÉ le plan avec
 * une phrase fausse — « tenu 1 jour, attendu cuisiné le 2026-09-14 ».
 *
 * ⚠️ CE N'EST PAS LE CORRECTIF DE FOND. Il est écrit dans `RESTE-A-FAIRE.md` :
 * le référentiel devrait porter la conservation. Cette liste est ce qu'on SAIT.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  aisleForFood,
  aisleForFoodGroup,
  SHELF_STABLE_SLUGS,
} from "./shopping_identity.ts";

Deno.test("conserve ① — le thon en boîte va en ÉPICERIE, le thon frais au FRAIS", () => {
  // ⛔ LES DEUX PARTAGENT LE GROUPE. C'est tout le sujet : sans la liste, le
  // groupe seul ne peut PAS les séparer.
  assertEquals(aisleForFoodGroup("white_fish"), "protein");
  assertEquals(aisleForFood("white_fish", "tuna_tinned"), "pantry");
  // ⛔ LE CAS QUI DOIT MORDRE : un aliment frais du même groupe ne bascule pas.
  assertEquals(aisleForFood("white_fish", "tuna_fresh"), "protein");
  assertEquals(aisleForFood("white_fish", null), "protein");
});

Deno.test("conserve ② — la liste est une ÉNUMÉRATION, jamais un motif de slug", () => {
  // ⛔ `endsWith("_tinned")` SERAIT UN MATCHER, et ce dépôt a mesuré douze faux
  // positifs sur douze avec un matcher maison. On nomme, donc un slug inconnu
  // qui RESSEMBLE à une conserve ne bascule pas tout seul.
  // ⟳ 2026-09-25 — `sardines_tinned` est devenu une vraie conserve ; le sosie
  // qui ne doit pas basculer est désormais un slug qui n'existe pas.
  assertEquals(aisleForFood("fatty_fish", "herring_tinned"), "protein");
  assertEquals(aisleForFood("legumes", "chickpeas_tinned"), "pantry");
  // ⟳ 2026-09-25 — la liste relue par le nom CIQUAL de chaque ligne
  // (`ciqual_name ~* 'appertis|semi-conserve'`), plus les trois conserves de
  // poisson de `20260925200000`.
  assertEquals([...SHELF_STABLE_SLUGS].sort(), [
    "anchovy",
    "chickpeas_tinned",
    "kidney_beans",
    "mackerel_tinned",
    "passata",
    "salmon_tinned",
    "sardines_tinned",
    "sweetcorn",
    "tinned_tomatoes",
    "tomato_puree",
    "tuna_tinned",
    "white_beans",
  ]);
});

Deno.test("conserve ②bis — le NOM NU reste au frais : seule la conserve nommée sort de la fenêtre", () => {
  // ⛔ « sardines » tout court peut être du frais ; un frais lu comme une
  // conserve échapperait à sa fenêtre d'un jour. Les fumés se gardent au froid.
  for (const slug of ["sardines", "mackerel", "salmon", "herring", "mackerel_smoked", "herring_smoked", "smoked_salmon"]) {
    assert(!SHELF_STABLE_SLUGS.has(slug), slug);
    assertEquals(aisleForFood("fatty_fish", slug), "protein", slug);
  }
  assertEquals(aisleForFood("fatty_fish", "sardines_tinned"), "pantry");
  assertEquals(aisleForFood("fatty_fish", "mackerel_tinned"), "pantry");
});

Deno.test("conserve ③ — un rayon d'épicerie SORT du frais, et c'est la propriété utile", async () => {
  // ⛔ ON LIT LA VRAIE CONSTANTE, PAS UNE COPIE. Si `PERISHABLE_AISLES` gagne
  // `pantry` un jour, ce test rougit — et c'est ce qu'on veut : la date
  // d'achat d'une conserve redeviendrait celle d'un produit frais.
  const { PERISHABLE_AISLES } = await import("./grocery_waves.ts");
  assert(PERISHABLE_AISLES.has("protein"), "le frais doit rester du frais");
  assert(
    !PERISHABLE_AISLES.has("pantry"),
    "l'épicerie est entrée dans le frais : les conserves redeviennent datées comme du poisson",
  );
});
