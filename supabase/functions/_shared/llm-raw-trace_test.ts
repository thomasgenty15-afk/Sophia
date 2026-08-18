// ===========================================================================
// LE BORNAGE DU PROMPT ARCHIVÉ.
//
// Ce qui est vérifié ici n'est pas « le texte est coupé » — c'est qu'un
// lecteur puisse DISTINGUER trois états qui, sans les deux colonnes
// annexes, rendent tous la même chose:
//
//   • bloc absent          -> text = null,  chars = null,  truncated = false
//   • bloc présent entier  -> text = tout,  chars = |tout|, truncated = false
//   • bloc COUPÉ au plafond-> text = début, chars = |tout|, truncated = true
//
// Le troisième cas est celui qui compte: la longueur rendue est celle du
// texte D'ORIGINE, pas celle du morceau écrit. Une capture qui rendrait
// `chars = limit` ferait passer un prompt tronqué pour un prompt court.
// ===========================================================================
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { boundedPrompt } from "./llm-raw-trace.ts";

Deno.test("boundedPrompt: absent stays absent (null, pas chaîne vide)", () => {
  assertEquals(boundedPrompt(null, 100), {
    text: null,
    chars: null,
    truncated: false,
  });
  assertEquals(boundedPrompt(undefined, 100), {
    text: null,
    chars: null,
    truncated: false,
  });
});

Deno.test("boundedPrompt: sous le plafond, le texte passe intact", () => {
  const text = "== THE METHOD ==\n- Every plate is built on a protein anchor.";
  assertEquals(boundedPrompt(text, 120_000), {
    text,
    chars: text.length,
    truncated: false,
  });
});

Deno.test("boundedPrompt: ne trim pas — la longueur doit coller au compteur de gemini.ts", () => {
  // gemini.ts compte `String(userMessage ?? "").length` SANS trim. Si cette
  // fonction trimait, les deux nombres divergeraient de quelques caractères et
  // le script de vidage crierait au mensonge sur une capture saine.
  const text = "\n  bordé d'espaces  \n";
  const out = boundedPrompt(text, 1000);
  assertEquals(out.text, text);
  assertEquals(out.chars, text.length);
});

Deno.test("boundedPrompt: coupé au plafond, la longueur reste celle de l'ORIGINAL", () => {
  const text = "x".repeat(500);
  const out = boundedPrompt(text, 100);
  assertEquals(out.text?.length, 100);
  assertEquals(out.chars, 500, "chars doit porter la taille d'origine, pas la limite");
  assertEquals(out.truncated, true);
});

Deno.test("boundedPrompt: pile au plafond n'est PAS tronqué", () => {
  // Le cas passant de la garde. Un `>=` au lieu d'un `>` marquerait tronqué
  // un texte complet, et personne ne le verrait avant d'enquêter dessus.
  const text = "y".repeat(100);
  const out = boundedPrompt(text, 100);
  assertEquals(out.text, text);
  assertEquals(out.chars, 100);
  assertEquals(out.truncated, false);
});

Deno.test("boundedPrompt: chaîne vide se distingue d'une absence", () => {
  // Un prompt système vide est un DÉFAUT à voir (`chars = 0`), pas une
  // capture éteinte (`chars = null`).
  assertEquals(boundedPrompt("", 100), {
    text: null,
    chars: 0,
    truncated: false,
  });
});
