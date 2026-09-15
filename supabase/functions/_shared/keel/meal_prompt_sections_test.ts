/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 2 — LE PROMPT DE COMPOSITION EST LA SOMME DE SES SECTIONS, ET RIEN DE PLUS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI CE FICHIER. Le découpage en sections nommées existe pour qu'un
 * prompt de RÉPARATION puisse en choisir — et la seule façon d'en faire un
 * découpage sûr est que le prompt de composition reste EXACTEMENT ce qu'il
 * était. Un lot qui déplace une section déplace une consigne qui a coûté des
 * runs réels.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  MEAL_PROMPT_SECTION_KEYS,
  MEAL_PROMPT_SECTIONS,
  MEAL_SYSTEM_PROMPT,
} from "./meal_generation.ts";

Deno.test("① le prompt est la CONCATÉNATION des sections, dans l'ordre", () => {
  assertEquals(
    MEAL_SYSTEM_PROMPT,
    MEAL_PROMPT_SECTIONS.map((s) => s.text).join("\n\n"),
  );
});

Deno.test("② chaque clé apparaît une fois, et l'ordre est celui de la liste", () => {
  assertEquals(
    MEAL_PROMPT_SECTIONS.map((s) => s.key),
    [...MEAL_PROMPT_SECTION_KEYS],
  );
  assertEquals(
    new Set(MEAL_PROMPT_SECTION_KEYS).size,
    MEAL_PROMPT_SECTION_KEYS.length,
    "une clé en double rendrait le choix du prompt de réparation ambigu",
  );
});

Deno.test("③ l'ouverture est la seule section sans en-tête `== … ==`", () => {
  for (const s of MEAL_PROMPT_SECTIONS) {
    if (s.key === "opening") {
      assert(!s.text.startsWith("== "), "l'ouverture a pris un en-tête");
      continue;
    }
    assert(
      s.text.startsWith("== "),
      `${s.key} ne commence pas par son en-tête: ${s.text.slice(0, 40)}`,
    );
  }
});

Deno.test("④ les en-têtes du prompt LIVRÉ sont exactement ceux des sections", () => {
  // ⛔ LA GARDE QUI DÉTECTE UNE PERTE. Un en-tête présent dans le texte et
  // absent de la table voudrait dire qu'une section en cache une autre —
  // c'est-à-dire qu'un prompt de réparation qui exclut la première garderait
  // quand même la seconde.
  const dansLeTexte = [...MEAL_SYSTEM_PROMPT.matchAll(/^== .+ ==$/gm)]
    .map((m) => m[0]);
  const dansLaTable = MEAL_PROMPT_SECTIONS
    .flatMap((s) => [...s.text.matchAll(/^== .+ ==$/gm)].map((m) => m[0]));
  assertEquals(dansLeTexte, dansLaTable);
  // ⚠️ UNE SECTION EN PORTE DEUX, ET C'EST CONNU: `PROTEIN_ANCHOR_PROMPT_LINE`
  // est interpolée DANS « A PORTION IS ONE PERSON'S PLATE » et porte son propre
  // en-tête. Le nommer ici évite qu'un compte arithmétique fasse rougir le
  // fichier pour une raison qui n'est pas un défaut.
  const sansEntete = MEAL_PROMPT_SECTIONS.filter((x) =>
    [...x.text.matchAll(/^== .+ ==$/gm)].length === 0
  ).map((x) => x.key);
  assertEquals(sansEntete, ["opening"]);
  const deuxEntetes = MEAL_PROMPT_SECTIONS.filter((x) =>
    [...x.text.matchAll(/^== .+ ==$/gm)].length > 1
  ).map((x) => x.key);
  assertEquals(deuxEntetes, ["portion_is_one_plate"]);
});

Deno.test("⑤ les sections que la réparation écarte sont bien DANS le prompt livré", () => {
  // ⛔ LE CONTRÔLE DE PRÉMISSE. Si « COVER THE WHOLE STRETCH » disparaissait du
  // prompt de composition, l'exclure de la réparation ne prouverait plus rien —
  // et ce test rougirait au lieu de rester vert sur du vide.
  for (const attendu of [
    "== COVER THE WHOLE STRETCH, WITH FEW COOKING SESSIONS ==",
    "== OUTPUT JSON SCHEMA ==",
    "== THE TWO MODES ==",
  ]) {
    assert(MEAL_SYSTEM_PROMPT.includes(attendu), `${attendu} a disparu`);
  }
});
