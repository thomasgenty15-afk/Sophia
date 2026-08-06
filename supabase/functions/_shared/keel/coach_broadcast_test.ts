import { assertEquals } from "jsr:@std/assert@1";

import {
  COACH_BROADCAST_MAX_CHARS,
  renderCoachBroadcast,
  sanitizeBroadcastBody,
} from "./coach_broadcast.ts";

Deno.test("le message est signé du nom du coach, en suffixe", () => {
  assertEquals(
    renderCoachBroadcast("This week, look at your breakfasts.", "Marlow"),
    "This week, look at your breakfasts.\n\n— Marlow",
  );
});

// MÊME GARDE QUE LE VERROU: un coach sans nom affiché ne se signe pas.
// « — the coach » attirerait l'œil sur une absence.
Deno.test("pas de nom, pas de signature", () => {
  for (const name of [null, undefined, "", "   "]) {
    assertEquals(renderCoachBroadcast("Hold the line.", name), "Hold the line.");
  }
});

// LE CAS QUI JUSTIFIE DE REGARDER LA DERNIÈRE LIGNE ET PAS LE TEXTE ENTIER.
// Un coach qui écrit « trois repas — pas six » ne signe pas: le tiret est de la
// ponctuation. Confondre les deux le priverait de sa signature.
Deno.test("un tiret au milieu d'une phrase n'est pas une signature", () => {
  assertEquals(
    renderCoachBroadcast("Three meals — not six. Hold that.", "Marlow"),
    "Three meals — not six. Hold that.\n\n— Marlow",
  );
});

Deno.test("un coach qui signe déjà n'est pas signé deux fois", () => {
  const body = "Look at your breakfasts.\n\n— M.";
  assertEquals(renderCoachBroadcast(body, "Marlow"), body);
});

Deno.test("un corps vide ne produit rien — jamais une signature seule", () => {
  for (const body of ["", "   \n  ", null, undefined, 42]) {
    assertEquals(renderCoachBroadcast(body, "Marlow"), null);
  }
});

Deno.test("le plafond tronque à la lecture", () => {
  const long = "x".repeat(COACH_BROADCAST_MAX_CHARS + 50);
  assertEquals(sanitizeBroadcastBody(long)?.length, COACH_BROADCAST_MAX_CHARS);
});
