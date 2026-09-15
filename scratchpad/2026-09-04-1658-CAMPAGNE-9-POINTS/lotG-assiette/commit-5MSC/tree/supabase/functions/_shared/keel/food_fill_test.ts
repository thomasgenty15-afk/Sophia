import { assertEquals, assert } from "jsr:@std/assert@1";

import {
  fillAdditions,
  houseFillSelection,
  keepExcludedWithEvidence,
  parseFillSelection,
} from "./food_fill.ts";
import { FOOD_PACKS } from "./food_packs.ts";

const CATALOGUE = new Set(["salmon", "olive_oil", "seed_oil", "white_bread", "eggs"]);

// ── LA SÉLECTION DE LA MAISON ─────────────────────────────────────────────

Deno.test("la maison ne pose AUCUNE ligne rouge alimentaire", () => {
  const sel = houseFillSelection();
  assert(sel.length > 0);
  // Déléguer sa doctrine n'est pas déléguer ses interdits. Un `excluded` posé
  // ici armerait le verrou de sortie au nom d'un coach qui n'a rien demandé.
  assertEquals(sel.filter((s) => s.stance !== "encouraged"), []);
});

Deno.test("la maison n'invente aucun aliment: c'est l'union des packs", () => {
  const fromPacks = new Set(FOOD_PACKS.flatMap((p) => [...p.slugs]));
  const sel = houseFillSelection();
  for (const s of sel) assert(fromPacks.has(s.slug), s.slug);
  assertEquals(sel.length, fromPacks.size);
});

Deno.test("la sélection maison est déterministe — même liste à chaque appel", () => {
  assertEquals(houseFillSelection(), houseFillSelection());
});

// ── LA VALIDATION CONTRE LE CATALOGUE ─────────────────────────────────────

Deno.test("un slug hors catalogue est rejeté, pas rapproché", () => {
  const { selection, rejected } = parseFillSelection(
    [{ slug: "salmon", stance: "encouraged" }, { slug: "salmon_fillet", stance: "encouraged" }],
    CATALOGUE,
  );
  assertEquals(selection.map((s) => s.slug), ["salmon"]);
  assertEquals(rejected, [{ slug: "salmon_fillet", reason: "unknown_slug" }]);
});

// UNE LIGNE FAUTIVE NE COÛTE PAS LES AUTRES. Un slug halluciné sur vingt-six
// corrects ne doit pas priver le coach des vingt-cinq — mais il est COMPTÉ.
Deno.test("une hallucination n'annule pas la sélection entière", () => {
  const { selection, rejected } = parseFillSelection(
    [
      { slug: "salmon", stance: "encouraged" },
      { slug: "invented", stance: "encouraged" },
      { slug: "eggs", stance: "encouraged" },
    ],
    CATALOGUE,
  );
  assertEquals(selection.length, 2);
  assertEquals(rejected.length, 1);
});

Deno.test("une posture inconnue est rejetée", () => {
  const { selection, rejected } = parseFillSelection(
    [{ slug: "salmon", stance: "loved" }],
    CATALOGUE,
  );
  assertEquals(selection, []);
  assertEquals(rejected, [{ slug: "salmon", reason: "bad_stance" }]);
});

Deno.test("un doublon est compté une fois", () => {
  const { selection, rejected } = parseFillSelection(
    [{ slug: "eggs", stance: "encouraged" }, { slug: "eggs", stance: "excluded" }],
    CATALOGUE,
  );
  assertEquals(selection, [{ slug: "eggs", stance: "encouraged" }]);
  assertEquals(rejected, [{ slug: "eggs", reason: "duplicate" }]);
});

Deno.test("une sortie qui n'est pas un tableau ne casse rien", () => {
  for (const raw of [null, undefined, "nope", 42, {}]) {
    assertEquals(parseFillSelection(raw, CATALOGUE).selection, []);
  }
});

// ── LA TRACE SUR `excluded` ───────────────────────────────────────────────
// C'est la garde la plus importante du module: depuis que `foods.discouraged`
// est alimenté par `stance='excluded'`, un `excluded` de trop ARME le verrou de
// sortie au nom du coach.

const LABELS = new Map([
  ["seed_oil", "Seed oil"],
  ["white_bread", "White bread"],
  ["salmon", "Salmon"],
]);

Deno.test("un excluded ÉCRIT par le coach est gardé", () => {
  const { selection, downgraded } = keepExcludedWithEvidence(
    [{ slug: "seed_oil", stance: "excluded" }],
    LABELS,
    "I never put seed oil on a plate. It is the one thing I rule out.",
  );
  assertEquals(selection, [{ slug: "seed_oil", stance: "excluded" }]);
  assertEquals(downgraded, []);
});

// L'INTENTION EST GARDÉE, LA CEINTURE NE S'ARME PAS. Dégrader plutôt que jeter:
// le modèle avait probablement raison sur le fond, il n'a simplement pas de
// quoi poser une ligne rouge au nom de quelqu'un d'autre.
Deno.test("un excluded DÉDUIT est dégradé en discouraged, pas jeté", () => {
  const { selection, downgraded } = keepExcludedWithEvidence(
    [{ slug: "white_bread", stance: "excluded" }],
    LABELS,
    "I build meals around whole foods and a protein anchor.",
  );
  assertEquals(selection, [{ slug: "white_bread", stance: "discouraged" }]);
  assertEquals(downgraded, ["white_bread"]);
});

Deno.test("la trace ignore la casse et les accents", () => {
  const { downgraded } = keepExcludedWithEvidence(
    [{ slug: "seed_oil", stance: "excluded" }],
    LABELS,
    "Jamais de SEED OIL chez moi.",
  );
  assertEquals(downgraded, []);
});

Deno.test("les autres postures traversent sans être touchées", () => {
  const { selection, downgraded } = keepExcludedWithEvidence(
    [{ slug: "salmon", stance: "encouraged" }],
    LABELS,
    "",
  );
  assertEquals(selection, [{ slug: "salmon", stance: "encouraged" }]);
  assertEquals(downgraded, []);
});

// ── L'ADDITIF ─────────────────────────────────────────────────────────────

// LA POSTURE DU COACH GAGNE TOUJOURS. S'il a marqué un aliment lui-même, le
// remplissage ne le repropose pas — et surtout ne l'écrase pas.
Deno.test("ce que le coach a déjà coché n'est jamais reproposé", () => {
  const out = fillAdditions(
    [{ slug: "salmon", stance: "encouraged" }, { slug: "eggs", stance: "encouraged" }],
    ["salmon"],
  );
  assertEquals(out.map((s) => s.slug), ["eggs"]);
});

Deno.test("le compte annoncé est celui qui sera ajouté", () => {
  const sel = [{ slug: "salmon", stance: "encouraged" } as const];
  assertEquals(fillAdditions(sel, ["salmon"]).length, 0);
  assertEquals(fillAdditions(sel, []).length, 1);
});
