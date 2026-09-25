/**
 * « ÇA VAUT AUSSI POUR… » EST BRANCHÉ AU BON ENDROIT — 2026-09-24.
 *
 * `dish_match.ts` est pur et testé; ce fichier épingle le mode `match` de
 * `keel-read-note-v1`, et chaque épingle a sa moitié qui mord:
 *   ① la raison passe LA garde de la note (`readDraftNote`) AVANT le modèle,
 *      et c'est son texte JUGÉ (`verdict.usable`) qui part, jamais le brut;
 *   ② le modèle est celui du chat (`getGlobalAiModel`), pas celui qui compose;
 *   ③ ce mode N'ÉCRIT RIEN: ni liste des plats refusés, ni classement de note;
 *   ④ la réponse est relue contre la liste envoyée (`readDishMatches`).
 *
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE RECHERCHE: un commentaire ne
 * câble rien.
 */
import { assertEquals } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const SRC = stripComments(
  await Deno.readTextFile(new URL("keel-read-note-v1/index.ts", FUNCTIONS_DIR)),
);

const HEAD = 'if (body.match && typeof body.match === "object" && !Array.isArray(body.match)) {';
const REJECTIONS = "const rejectionMode =";

function broken(src: string): string[] {
  const out: string[] = [];
  const start = src.indexOf(HEAD);
  const end = src.indexOf(REJECTIONS);
  const block = start >= 0 && end > start ? src.slice(start, end) : "";
  if (block === "") return ["mode absent"];

  const guard = block.indexOf("readDraftNote({ raw: match.reason, doctrineForbidden, restrictionFlag })");
  const call = block.indexOf("generateWithGemini(");
  if (guard < 0 || call < 0 || guard > call || !block.includes("reason: verdict.usable,")) out.push("① garde");

  if (!block.includes("model: getGlobalAiModel(),")) out.push("② modèle rapide");

  if (/appendRejectedDishes\(|classifyAndPersistDraftNote\(|persistRetainedItemsFor\(/.test(block)) {
    out.push("③ aucune écriture");
  }

  if (!block.includes("readDishMatches(raw, candidates)")) out.push("④ relecture");
  return out;
}

Deno.test("le mode « ça vaut aussi pour… » est branché", () => {
  assertEquals(broken(SRC), []);
});

Deno.test("chaque épingle mord sur sa jonction, et sur elle seule", () => {
  const cut = (from: string, to: string) => {
    if (!SRC.includes(from)) throw new Error(`ancre absente: ${from}`);
    return SRC.replace(from, to);
  };
  assertEquals(
    broken(cut("reason: verdict.usable,", "reason: String(match.reason ?? \"\"),")),
    ["① garde"],
  );
  assertEquals(broken(cut("model: getGlobalAiModel(),", "model: keelGenerationModel(),")), ["② modèle rapide"]);
  assertEquals(
    broken(cut("const read = readDishMatches(raw, candidates);", "await appendRejectedDishes({ admin, userId, entries: [] }); const read = readDishMatches(raw, candidates);")),
    ["③ aucune écriture"],
  );
  assertEquals(
    broken(cut("const read = readDishMatches(raw, candidates);", "const read = { matches: candidates, unknown: 0, malformed: false, overCap: 0 };")),
    ["④ relecture"],
  );
});
