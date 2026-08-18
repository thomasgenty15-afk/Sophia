// LES MOYENS DE CUISSON — CE QUE CES TESTS PROTÈGENT, du plus cher au moins.
//
//   * LA DÉGRADATION SILENCIEUSE DE TOUS LES COMPTES D'AVANT. Si l'absence de
//     clé se lit « ce foyer n'a ni four ni congélateur », le premier plan
//     généré après ce lot retire le batch cooking et la congélation à tout le
//     monde. C'est LE défaut de ce lot, et il ne se voit pas: le plan reste
//     valide, il est juste devenu pauvre. Trois tests le gardent
//     (`null` en lecture, `null` en interrogation, `[]` en interdiction).
//   * `[]` PRIS POUR UNE RÉPONSE. « Aucun des sept » n'est pas une contrainte,
//     c'est une impasse — un foyer qui ne cuisine pas n'a rien à faire ici.
//   * LE JETON INCONNU CONTAGIEUX — une faute de frappe qui emporte les
//     déclarations lisibles écrites à côté (patron `parseAwayDays`).
//   * L'ORDRE QUI SUIT LES CLICS — deux déclarations identiques qui rendent
//     deux consignes différentes, donc un cache de prompt cassé et un test de
//     désarmement impossible à écrire.
//   * LA FRONTIÈRE DE LOT — ce fichier ne doit RIEN dire au modèle. Une ligne
//     de prompt ici est un bump de version volé au lot L7.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  hasKitchenTool,
  KITCHEN_EQUIPMENT_KEY,
  KITCHEN_TOOLS,
  type KitchenTool,
  missingKitchenTools,
  readKitchenEquipment,
} from "./kitchen_equipment.ts";

/** Le jsonb tel qu'il sort de la base, avec la clé dedans. */
function pc(value: unknown): Record<string, unknown> {
  return { eating_rhythm: [], [KITCHEN_EQUIPMENT_KEY]: value };
}

// ---------------------------------------------------------------------------
// LA LISTE
// ---------------------------------------------------------------------------

Deno.test("les sept outils, dans l'ordre de l'écran", () => {
  assertEquals([...KITCHEN_TOOLS], [
    "oven",
    "stovetop",
    "microwave",
    "freezer",
    "air_fryer",
    "pressure_cooker",
    "blender",
  ]);
});

Deno.test("les jetons restent ASCII snake_case anglais (R1)", () => {
  // Un jeton accentué ou espacé partirait en base et ne reviendrait jamais:
  // c'est une valeur d'énumération, pas un mot d'écran.
  for (const tool of KITCHEN_TOOLS) {
    assert(/^[a-z][a-z_]*$/.test(tool), `jeton non conforme: ${tool}`);
  }
});

// ---------------------------------------------------------------------------
// « ON NE M'A RIEN DEMANDÉ » — LA GARDE DU LOT
// ---------------------------------------------------------------------------

Deno.test("aucune clé ⇒ null, et pas un tableau vide", () => {
  // ⚠️ LE TEST QUI VAUT LE LOT. `[]` ici retirerait le four à tous les comptes
  // créés avant aujourd'hui, sans un mot, au premier plan généré.
  assertEquals(readKitchenEquipment({}), null);
  assertEquals(readKitchenEquipment(null), null);
  assertEquals(readKitchenEquipment(undefined), null);
  assertEquals(readKitchenEquipment({ eating_rhythm: [] }), null);
});

Deno.test("jamais demandé ⇒ on ne sait pas, pour chacun des sept", () => {
  for (const tool of KITCHEN_TOOLS) {
    assertEquals(hasKitchenTool(null, tool), null, tool);
  }
});

Deno.test("jamais demandé ⇒ rien à interdire", () => {
  // La liste des manques est VIDE tant que personne n'a répondu: c'est la même
  // garde que ci-dessus, dite du côté de ce que L7 a le droit d'interdire.
  assertEquals([...missingKitchenTools(null)], []);
});

// ---------------------------------------------------------------------------
// UNE RÉPONSE
// ---------------------------------------------------------------------------

Deno.test("ce qui est déclaré existe, ce qui manque est déclaré absent", () => {
  const equipment = readKitchenEquipment(pc(["oven", "stovetop"]));
  assertEquals([...equipment!], ["oven", "stovetop"]);
  assertEquals(hasKitchenTool(equipment, "oven"), true);
  assertEquals(hasKitchenTool(equipment, "stovetop"), true);
  // Les trois qui décident, déclarés absents — et `false`, pas `null`.
  assertEquals(hasKitchenTool(equipment, "freezer"), false);
  assertEquals(hasKitchenTool(equipment, "microwave"), false);
  assertEquals([...missingKitchenTools(equipment)], [
    "microwave",
    "freezer",
    "air_fryer",
    "pressure_cooker",
    "blender",
  ]);
});

Deno.test("l'ordre rendu est celui de la liste, jamais celui du stockage", () => {
  // Deux foyers qui ont coché les mêmes cases dans un ordre différent doivent
  // produire la MÊME consigne. Sans ça, le cache de prompt saute pour rien.
  const a = readKitchenEquipment(pc(["freezer", "oven", "microwave"]));
  const b = readKitchenEquipment(pc(["microwave", "freezer", "oven"]));
  assertEquals([...a!], ["oven", "microwave", "freezer"]);
  assertEquals([...a!], [...b!]);
});

Deno.test("un doublon ne double pas la déclaration", () => {
  assertEquals([...readKitchenEquipment(pc(["oven", "oven", "OVEN"]))!], ["oven"]);
});

Deno.test("la casse et les espaces ne perdent pas une déclaration", () => {
  // Ce qui arrive en base vient d'un écran, mais aussi d'imports et de
  // réparations à la main. Une majuscule ne doit pas retirer un four.
  assertEquals([...readKitchenEquipment(pc([" Oven ", "FREEZER"]))!], [
    "oven",
    "freezer",
  ]);
});

// ---------------------------------------------------------------------------
// CE QUI NE SE LIT PAS
// ---------------------------------------------------------------------------

Deno.test("un jeton inconnu tombe SEUL", () => {
  // Patron `parseAwayDays`: une faute de frappe n'efface pas la déclaration
  // lisible écrite à côté d'elle.
  assertEquals([...readKitchenEquipment(pc(["oven", "four", "airfryer"]))!], [
    "oven",
  ]);
});

Deno.test("un tableau vide n'est pas une réponse", () => {
  // « Aucun des sept » veut dire « ce foyer ne cuisine pas », ce qui n'est pas
  // une contrainte mais une impasse. L'écrivain le refuse; le lecteur refuse
  // aussi, et retombe sur la direction SÛRE.
  assertEquals(readKitchenEquipment(pc([])), null);
});

Deno.test("un tableau dont RIEN n'est lisible retombe sur `null`", () => {
  // Direction sûre et pas `[]`: une ligne corrompue ne doit pas se mettre à
  // dire « ce foyer n'a pas de four », ce que personne n'a déclaré.
  assertEquals(readKitchenEquipment(pc(["fourneau", "", null, 42])), null);
});

Deno.test("une valeur qui n'est pas un tableau ne se lit pas", () => {
  for (const brut of ["oven", 1, true, {}, { oven: true }]) {
    assertEquals(readKitchenEquipment(pc(brut)), null, JSON.stringify(brut));
  }
});

// ---------------------------------------------------------------------------
// LA FRONTIÈRE DE LOT
// ---------------------------------------------------------------------------

Deno.test("ce module ne dit RIEN au modèle", async () => {
  // ⛔ L'exploitation appartient à L7, qui groupe tous les changements de
  // consigne en UN bump de version. Une ligne de prompt glissée ici serait
  // invisible à son compte de blocs et volerait son bump — et la lane foyer
  // expire déjà à 4 minutes.
  const source = await Deno.readTextFile(
    new URL("./kitchen_equipment.ts", import.meta.url),
  );
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      return at < 0 ? line : line.slice(0, at);
    })
    .join("\n");
  for (const forbidden of ["PROMPT", "prompt", "You are", "promptLines"]) {
    assert(
      !code.includes(forbidden),
      `le module de collecte parle au modèle: « ${forbidden} »`,
    );
  }
});

// ---------------------------------------------------------------------------
// CE QUE LE TYPE FAIT — ET CE QU'IL NE FAIT PAS
// ---------------------------------------------------------------------------

Deno.test("`=== false` distingue les trois cas, et c'est le patron de L7", () => {
  const unknown: readonly KitchenTool[] | null = null;
  const declared = readKitchenEquipment(pc(["stovetop"]));
  assertEquals(hasKitchenTool(unknown, "oven") === false, false);
  assertEquals(hasKitchenTool(declared, "oven") === false, true);
});

Deno.test("⛔ `!` NE MORD PAS — le compilateur ne tient pas cette règle", () => {
  // ⚠️ CE TEST ÉPINGLE UNE MESURE, PAS UN SOUHAIT (L2-B, 2026-08-18). Le pavé
  // de `hasKitchenTool` affirmait que « le type force à nommer le troisième
  // cas »: c'est faux. Un module qui écrit `if (!hasKitchenTool(eq, "oven"))`
  // passe `deno check` (exit 0) ET `deno lint` sans un mot, et rend « pas de
  // four » sur un compte à qui on n'a jamais rien demandé.
  //
  // Tant que ce test est vert, la convention `=== false` est tenue par une
  // RELECTURE, jamais par le typecheck. Le chemin sans piège pour interdire
  // quoi que ce soit est `missingKitchenTools`, vérifié juste en dessous.
  const unknown: readonly KitchenTool[] | null = null;
  assert(
    !hasKitchenTool(unknown, "oven"),
    "`!` sur `null` ne vaut plus `true`: la convention peut être durcie",
  );
});

Deno.test("✅ `missingKitchenTools` n'a AUCUNE direction dangereuse", () => {
  // La liste des interdits est vide tant que rien n'est déclaré: ni `!`, ni
  // l'oubli du troisième cas ne peuvent en tirer une interdiction que personne
  // n'a énoncée. C'est ce que L7 doit appeler pour DÉCIDER.
  assertEquals(missingKitchenTools(null).includes("oven"), false);
  assertEquals(
    missingKitchenTools(readKitchenEquipment(pc(["stovetop"]))).includes("oven"),
    true,
  );
});
