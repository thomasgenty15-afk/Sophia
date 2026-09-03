// LE MÉMO — lot M4.
//
// Ce que ces tests existent pour empêcher, dans l'ordre où ça coûte:
//
//   1. QUE LE PLAFOND FASSE TOMBER LA PLUS ANCIENNE. Ce serait une TROISIÈME
//      voie, pire que les deux: la consigne disparaîtrait sans que personne ne
//      l'ait décidé, et la personne découvrirait qu'une chose qu'elle avait
//      demandée a cessé d'agir, sans un mot. *« Un plafond force une décision. »*
//   2. QUE LE MÉMO N'ATTEIGNE PAS LE PROMPT. Un magasin sans lecteur est un
//      magasin mort; celui-ci est justement celui dont le design dit qu'il
//      serait « le magasin qu'on supprime, avec un autre chapeau ».
//   3. QU'IL SERVE PLUS DE CINQ LIGNES. La garde qui ne tient qu'à l'écriture
//      est une garde qu'un jsonb trafiqué contourne.
//   4. QU'UNE LIGNE ENTRE SANS SA CAUSE. Une phrase libre qui gouverne des
//      assiettes et que personne ne peut rattacher à quoi que ce soit est la
//      définition du magasin opaque.
//
// env purgé: env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
//   deno test --allow-read --allow-env --no-check \
//   supabase/functions/_shared/keel/memo_test.ts

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  MEMO_KEY,
  MEMO_LINE_MAX_CHARS,
  MEMO_MAX_LINES,
  memoFrom,
  memoLineToJson,
  memoLinesForPrompt,
  parseMemoLine,
  parseMemoLines,
  withMemoLine,
  withoutMemoLine,
} from "./memo.ts";

function line(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    text: "danse le mardi, donc gros repas ce jour-là",
    at: "2026-09-01",
    source: "draft_note",
    quote: "elle danse le mardi, il lui faut un vrai repas ce soir-là",
    ...over,
  };
}

function full(): Record<string, unknown> {
  let pc: Record<string, unknown> = {};
  for (let i = 0; i < MEMO_MAX_LINES; i += 1) {
    const out = withMemoLine(pc, line({ text: `consigne n°${i}` }));
    pc = { ...pc, [MEMO_KEY]: out.lines.map(memoLineToJson) };
  }
  return pc;
}

// ===========================================================================
// 1. ⛔ LE PLAFOND REFUSE — il ne fait pas tomber la plus ancienne
// ===========================================================================

Deno.test("⛔ à la sixième, on REFUSE — et les cinq d'avant sont INTACTES", () => {
  const pc = full();
  assertEquals(memoFrom(pc).length, MEMO_MAX_LINES);

  const out = withMemoLine(pc, line({ text: "une sixième" }));
  assertEquals(out.added, 0);
  assertEquals(out.refused, "full");
  assertEquals(out.lines.length, MEMO_MAX_LINES);
  // ⛔ LA PREMIÈRE EST TOUJOURS LÀ. C'est la différence avec le journal de M5,
  // qui JETTE le plus ancien: perdre une trace coûte un « défaire », perdre une
  // consigne change l'assiette.
  assert(
    out.lines.some((l) => l.text === "consigne n°0"),
    "la plus ancienne est tombée: le plafond a été implémenté à l'envers",
  );
  assert(!out.lines.some((l) => l.text === "une sixième"));
});

Deno.test("retirer une ligne rouvre EXACTEMENT une place", () => {
  const pc = full();
  const shorter = withoutMemoLine(pc, 2);
  assert(shorter);
  assertEquals(shorter.length, MEMO_MAX_LINES - 1);
  const out = withMemoLine({ [MEMO_KEY]: shorter.map(memoLineToJson) }, line({
    text: "la place libérée",
  }));
  assertEquals(out.added, 1);
  assertEquals(out.lines.length, MEMO_MAX_LINES);
  // Les neuves DEVANT: c'est celle qu'on vient d'ajouter qu'on veut voir.
  assertEquals(out.lines[0].text, "la place libérée");
});

Deno.test("⛔ LE PLAFOND MORD AUSSI À LA LECTURE", () => {
  // Une colonne trafiquée, ou une version future qui l'aurait dépassé, ne doit
  // pas servir six lignes au modèle: la garde qui ne tient qu'à l'écriture est
  // une garde qu'un jsonb contourne.
  const tampered = {
    [MEMO_KEY]: Array.from(
      { length: MEMO_MAX_LINES + 4 },
      (_, i) => line({ text: `forgée n°${i}` }),
    ),
  };
  assertEquals(memoFrom(tampered).length, MEMO_MAX_LINES);
  assertEquals(memoLinesForPrompt(tampered).length, MEMO_MAX_LINES);
});

// ===========================================================================
// 2. ⛔ CE QUI N'ENTRE PAS
// ===========================================================================

Deno.test("⛔ une ligne SANS CAUSE est refusée — lot M2, même règle", () => {
  // Ici c'est plus nécessaire qu'ailleurs: une ligne de mémo n'a NI famille NI
  // valeur structurée. Sans sa cause, c'est une phrase libre qui gouverne des
  // assiettes et que personne ne peut rattacher à quoi que ce soit.
  assertEquals(parseMemoLine(line({ quote: "" })), null);
  assertEquals(parseMemoLine(line({ quote: "   " })), null);
  assertEquals(parseMemoLine(line({ quote: null })), null);
});

Deno.test("⛔ `written` n'entre JAMAIS dans le mémo", () => {
  // Ce que la personne écrit elle-même a un endroit, avec une famille. Le mémo
  // est ce que le PRODUIT a retenu sans savoir où le ranger — et le refus garde
  // aussi la porte du contournement: `canProduce("written", …)` autorise tout.
  assertEquals(parseMemoLine(line({ source: "written" })), null);
  for (const source of ["draft_note", "questionnaire", "conversation"]) {
    assert(parseMemoLine(line({ source })), source);
  }
});

Deno.test("un doublon est refusé, casse et espaces normalisées", () => {
  // Deux notes qui disent la même chose mangeraient deux des cinq places, et le
  // modèle lirait deux fois la même consigne — ce qui, dans un prompt, la
  // RENFORCE sans que personne ne l'ait demandé.
  const pc = { [MEMO_KEY]: [line({ text: "danse le mardi" })] };
  assertEquals(withMemoLine(pc, line({ text: "  Danse Le Mardi " })).refused, "duplicate");
  // ⛔ ÉGALITÉ, PAS RESSEMBLANCE: « laitue » ≠ « lait ».
  assertEquals(withMemoLine(pc, line({ text: "danse le lundi" })).added, 1);
});

Deno.test("un texte vide, un jour illisible: REFUS, jamais un repli", () => {
  assertEquals(parseMemoLine(line({ text: "" })), null);
  assertEquals(parseMemoLine(line({ at: "mardi" })), null);
  assertEquals(parseMemoLine(null), null);
  assertEquals(parseMemoLine([]), null);
  assertEquals(withMemoLine({}, { text: "" }).refused, "unreadable");
});

Deno.test("une ligne difforme TOMBE SEULE et laisse ses voisines", () => {
  const mixed = [line(), { text: "sans cause" }, line({ text: "voisine" })];
  assertEquals(parseMemoLines(mixed).length, 2);
  assertEquals(parseMemoLines("pas une liste"), []);
});

Deno.test("le texte est TRONQUÉ, jamais résumé", () => {
  const long = "x".repeat(MEMO_LINE_MAX_CHARS + 60);
  assertEquals(parseMemoLine(line({ text: long }))?.text.length, MEMO_LINE_MAX_CHARS);
});

// ===========================================================================
// 3. RETIRER
// ===========================================================================

Deno.test("retirer se fait par POSITION, et un index hors bornes est un REFUS", () => {
  const pc = full();
  for (const bad of [-1, MEMO_MAX_LINES, 99, 1.5, NaN]) {
    assertEquals(withoutMemoLine(pc, bad), null, String(bad));
  }
  assertEquals(withoutMemoLine({}, 0), null);
  const kept = withoutMemoLine(pc, 0);
  assertEquals(kept?.length, MEMO_MAX_LINES - 1);
});

// ===========================================================================
// 4. ⛔ CE QUE LE PROMPT REÇOIT — et le câblage qui l'y amène
// ===========================================================================

Deno.test("⛔ le prompt reçoit les TEXTES SEULS", () => {
  // Ni citation, ni date, ni source: le modèle compose, il n'a pas à savoir
  // d'où vient une consigne, et lui donner la phrase source lui ferait lire
  // deux fois la même chose. La cause appartient à l'ÉCRAN.
  const out = memoLinesForPrompt({ [MEMO_KEY]: [line({ text: "gros repas le mardi" })] });
  assertEquals(out, ["gros repas le mardi"]);
  assertEquals(memoLinesForPrompt({}), []);
  assertEquals(memoLinesForPrompt(null), []);
});

Deno.test("LE CÂBLAGE — les DEUX lanes passent le mémo au prompt", async () => {
  // ⚠️ SANS CE TEST, LE MÉMO SERAIT UN MAGASIN SANS LECTEUR — et c'est
  // précisément celui dont le design dit qu'il serait « le magasin qu'on
  // supprime, avec un autre chapeau ». Un lot débranché rendrait un mémo
  // visible sur la carte qui ne change RIEN aux plans, et personne ne le
  // saurait.
  for (
    const rel of [
      "../../generate-meal-v1/index.ts",
      "../../generate-household-meal-v1/index.ts",
    ]
  ) {
    const src = (await Deno.readTextFile(new URL(rel, import.meta.url)))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
      .join("\n");
    // ⚠️ HISSÉ LE 2026-09-01 POUR ÊTRE MESURÉ: la lecture était EN LIGNE dans
    // l'appel, donc rien au runtime ne pouvait dire si un mémo avait servi.
    assert(
      src.includes("const memoLines = memoLinesForPrompt("),
      `${rel} ne lit plus le mémo`,
    );
    assert(
      src.includes("memo: memoLines"),
      `${rel} ne passe plus le mémo au prompt`,
    );
    // ⛔ ET IL EST COMPTÉ SUR LA CHAÎNE, PAS SUR LE PARAMÈTRE. Ce test-ci
    // prouve qu'on passe `memo:`; il ne peut PAS prouver que la ligne survit à
    // la construction du message. `served` le mesure sur le texte réellement
    // envoyé, et son dénominateur (`lines`) part à chaque génération.
    assert(
      src.includes('tag: "keel.meal.memo"'),
      `${rel} n'a plus de compteur de mémo: « magasin mort » y redevient une ` +
        "phrase qu'aucun nombre ne peut démentir",
    );
    assert(
      src.includes("served: memoLines.filter((line) => built.userMessage"),
      `${rel} ne compte plus le mémo SUR LA CHAÎNE: compter le paramètre ` +
        "redirait seulement ce que ce test dit déjà",
    );
  }

  // Et le prompt le REND. Un paramètre reçu qu'aucune ligne n'imprime est la
  // même panne, un cran plus loin.
  const prompt = (await Deno.readTextFile(
    new URL("./meal_generation.ts", import.meta.url),
  ));
  assert(prompt.includes("memo?: readonly string[];"), "le paramètre a disparu");
  assert(
    prompt.includes("...(args.memo ?? []).map((p) => `- ${p}`)"),
    "le mémo est reçu mais jamais imprimé dans le message",
  );
});
