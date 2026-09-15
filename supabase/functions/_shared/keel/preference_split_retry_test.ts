import { assert, assertEquals } from "jsr:@std/assert@1";
import { preferenceSplitRetryInstruction, SPLIT_RETRY_MIN_CELLS } from "./preference_split_retry.ts";

Deno.test("la relance nomme le mot, la bouche qui le veut, le plancher de repas, et interdit la boîte de l'autre", () => {
  const text = preferenceSplitRetryInstruction([{ term: "asperges", wanter: "Paul", refusers: ["Claire"] }], 13, "boxes") ?? "";
  assert(text.includes('"asperges"'), text);
  assert(text.includes("asked for Paul in a box of their own"), text);
  assert(text.includes(`At least ${SPLIT_RETRY_MIN_CELLS} lunches or dinners`), text);
  assert(text.includes("NEVER from the box of Claire"), text);
  // ⟳ 2026-09-13 · LOT 1 — LES DEUX INTERDITS GLOBAUX ONT ÉTÉ RETIRÉS.
  //
  // ⛔ « Keep every dish, day and slot » et « do NOT shorten the plan » partent
  // dans la MÊME instruction que les autres défauts du plan, dont le périmètre
  // ouvre d'autres repas et des unités à CRÉER (une portion attendue et
  // absente, un complément). Ils contredisaient donc les blocs voisins, et le
  // second suppose une réponse en forme de plan là où on demande un patch.
  assert(!text.includes("Keep every dish, day and slot"), text);
  assert(!/shorten the plan/i.test(text), text);
  // ⚠️ CE QUI RESTE EST LOCAL, ET C'EST LA VRAIE DÉPENDANCE: la base partagée
  // de CES repas ne bouge pas, parce que les autres bouches en mangent.
  assert(text.includes("Keep the shared base of those meals exactly as it is"), text);
  assert(text.includes("nobody's business"), "la relance ne protège plus le « why »");
});

Deno.test("épinglage — SPLIT_RETRY_MIN_CELLS vaut 2", () => assertEquals(SPLIT_RETRY_MIN_CELLS, 2));

Deno.test("sans demandeur privé, ou sans cellule, pas de relance", () => {
  assertEquals(preferenceSplitRetryInstruction([], 13, "boxes"), null);
  assertEquals(preferenceSplitRetryInstruction([{ term: "asperges", wanter: "Paul", refusers: [] }], 0, "boxes"), null);
  assertEquals(preferenceSplitRetryInstruction([{ term: "", wanter: "Paul", refusers: [] }], 13, "boxes"), null);
});

Deno.test("le plancher ne dépasse jamais les cellules vérifiées", () => {
  const text = preferenceSplitRetryInstruction([{ term: "asperges", wanter: "Paul", refusers: [] }], 1, "boxes") ?? "";
  assert(text.includes("At least 1 lunches"), text);
});

async function generatorSource(): Promise<string> {
  return await Deno.readTextFile(new URL("../../generate-household-meal-v1/index.ts", import.meta.url));
}

Deno.test("CÂBLAGE — le constat de préférence part dans la décision commune, adressé", async () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — CE TEST ÉPINGLAIT UNE RELANCE LOCALE
  // ══════════════════════════════════════════════════════════════════════
  //
  // Il exigeait que le site appelle le modèle, puis reprenne des cellules par
  // parties (`mergeRetryCells`). Les deux ont été remplacés: le site DÉPOSE son
  // constat, et la reprise par parties est devenue l'application d'un patch,
  // qui n'ouvre que les unités autorisées. Ce qui est épinglé ici est ce qui
  // reste vrai et qui doit le rester: la mesure est unique, la consigne tunée
  // continue de partir, et le constat porte une ADRESSE.
  const src = await generatorSource();
  // ⚠️ `lastIndexOf`: le premier `preferenceSplitRetryInstruction(` du fichier
  // est l'IMPORT. Chercher autour de lui mesurerait l'en-tête du handler.
  const splitAt = src.lastIndexOf("preferenceSplitRetryInstruction(");
  assert(splitAt > -1, "la consigne « préférence contre exclusion » n'est plus composée");
  // ⛔ PLUS D'APPEL DEPUIS CE SITE: il consommait le budget avant que tous les
  // défauts du plan soient connus.
  assert(
    !/preference_split_retry_rejected/.test(src) &&
      !/preference_split_retry_merged/.test(src),
    "la relance locale de préférence est revenue",
  );
  // ⛔ ET LE CONSTAT EST ADRESSÉ. Sans jour ni moment il finirait en
  // `scope_unresolved`, et l'appel partirait avec un périmètre vide — le défaut
  // ① de la revue du 2026-09-12, rejoué ailleurs.
  assert(
    /cause: "preference_split_uncomposed"/.test(src),
    "le constat n'a plus de cause nommée",
  );
  const bloc = src.slice(splitAt - 3000, splitAt + 3000);
  assert(
    /c\.slot === "lunch" \|\| c\.slot === "dinner"/.test(bloc),
    "le constat n'ouvre plus les repas où le remède peut atterrir",
  );
  // Une seule mesure du « composé », partagée par le constat et l'archive.
  assertEquals(
    (src.match(/const preferenceSplitCarriage = /g) || []).length,
    1,
    "la mesure du composant par boîte n'est plus une seule fonction",
  );
  assert(
    (src.match(/preferenceSplitCarriage\(/g) || []).length >= 3,
    "l'archive et le constat ne lisent pas la même mesure",
  );
});