/**
 * FF-016 §10 — LE CHAT ET LE GÉNÉRATEUR LISENT-ILS LE MÊME MAPPING ?
 * Une seule lecture, deux rendus: on compare les ENSEMBLES d'aliments.
 */
import { admin } from "../docs/nutrition-pivot/qa-web/harness.ts";
import {
  loadPublishedProtocol,
  protocolBlockFor,
  protocolChatBlockFor,
} from "../supabase/functions/_shared/keel/protocol_loader.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./ff016_fixture.json", import.meta.url)),
);
for (const key of ["a", "b", "c", "d"] as const) {
  const uid = fixture.students[key].userId;
  const loaded = await loadPublishedProtocol(admin(), uid);
  const gen = protocolBlockFor(loaded, "Marlow");
  const chat = protocolChatBlockFor(loaded, "Marlow");
  const kinds = (block: string) =>
    JSON.stringify(
      loaded.compiled.map((c) => `${c.preview.kind}:${c.food_group_ref}`).sort(),
    ) + ` | gen=${block.length}`;
  console.log(
    `${key} reason=${loaded.reason} goal=${loaded.goal} règles=${loaded.compiled.length}`,
  );
  console.log(`   ${kinds(gen)} chat=${chat.length}`);
  const groups = loaded.compiled.map((c) => c.food_group_ref);
  const inChat = groups.filter((g) => chat.includes(g.replace(/_/g, " ")));
  const inGen = groups.filter((g) => gen.includes(g));
  console.log(`   couverts chat=${inChat.length}/${groups.length} gen=${inGen.length}/${groups.length}`);
}
