/**
 * ⑩ LA SÉCURITÉ DITE DANS UNE NOTE — la relecture pure.
 *
 * ⟳ 2026-09-23 — rouverte sur décision du propriétaire, À UNE CONDITION: la
 * phrase le DIT. La garde est la citation (`because`), vérifiée présente dans
 * la note. Chaque refus a son cas, et chaque garde a un cas qui passe.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { draftNoteSafetyLine, readDraftNoteSafety } from "./draft_note_safety.ts";

const ZOE = "aaaaaaaa-0000-4000-8000-000000000001";
const MARC = "bbbbbbbb-0000-4000-8000-000000000002";
const ROSTER = new Set([ZOE, MARC]);

const read = (rows: unknown[], note: string) =>
  readDraftNoteSafety({ rows, roster: ROSTER, note, textMax: note.length });

Deno.test("le cas qui passe — une allergie DITE, avec sa preuve, pour une bouche du rôle", () => {
  const note = "Zoé est allergique aux arachides";
  const out = read([{ kind: "allergy", member_id: ZOE, text: "arachides", diet: null, because: "allergique aux arachides" }], note);
  assertEquals(out.kept, 1);
  assertEquals(out.refused.total, 0);
  assertEquals(out.declarations[0], {
    kind: "allergy", memberId: ZOE, text: "arachides", diet: null, because: "allergique aux arachides",
  });
});

Deno.test("⛔ LA GARDE — une preuve absente de la note fait tomber l'entrée, et se compte", () => {
  // « ça me rend malade » n'est pas « allergique »: le modèle qui l'invente
  // comme preuve ne passe pas, parce que ces mots ne sont pas dans la note.
  const note = "plus de fruits à coque, ça me rend malade";
  const out = read([
    { kind: "allergy", member_id: MARC, text: "fruits à coque", because: "allergique aux fruits à coque" },
    { kind: "allergy", member_id: MARC, text: "fruits à coque" },
    { kind: "allergy", member_id: MARC, text: "fruits à coque", because: " " },
  ], note);
  assertEquals(out.kept, 0);
  assertEquals(out.refused.noEvidence, 3);
});

Deno.test("la preuve se lit casse et espaces repliés — pas plus", () => {
  const note = "Marc  est INTOLÉRANT au lactose";
  const ok = read([{ kind: "intolerance", member_id: MARC, text: "lactose", because: "intolérant au lactose" }], note);
  assertEquals(ok.kept, 1);
  // ⛔ Aucun accent retiré, aucune racine: « intolerant » (sans accent) n'est
  // pas dans la note. La garde est une jointure, pas une ressemblance.
  const ko = read([{ kind: "intolerance", member_id: MARC, text: "lactose", because: "intolerant au lactose" }], note);
  assertEquals(ko.refused.noEvidence, 1);
});

Deno.test("⛔ UNE ALLERGIE SANS BOUCHE TOMBE — jamais « toute la table », jamais la personne qui écrit par défaut", () => {
  const note = "on est allergiques aux arachides";
  const out = read([
    { kind: "allergy", member_id: null, text: "arachides", because: "allergiques aux arachides" },
    { kind: "allergy", member_id: "cccccccc-0000-4000-8000-000000000003", text: "arachides", because: "allergiques aux arachides" },
    { kind: "allergy", text: "arachides", because: "allergiques aux arachides" },
  ], note);
  assertEquals(out.kept, 0);
  assertEquals(out.refused.unknownMember, 3);
});

Deno.test("un régime: jeton fermé, `omnivore` permis (il retire), jamais un régime sur une allergie", () => {
  const note = "Zoé est devenue végétarienne et Marc n'est plus vegan";
  const out = read([
    { kind: "diet", member_id: ZOE, diet: "vegetarian", text: null, because: "est devenue végétarienne" },
    { kind: "diet", member_id: MARC, diet: "omnivore", text: null, because: "n'est plus vegan" },
    { kind: "diet", member_id: MARC, diet: "keto", because: "n'est plus vegan" },
    { kind: "allergy", member_id: MARC, diet: "vegan", text: "lait", because: "n'est plus vegan" },
  ], note);
  assertEquals(out.declarations.map((d) => [d.kind, d.memberId, d.diet]), [
    ["diet", ZOE, "vegetarian"],
    ["diet", MARC, "omnivore"],
  ]);
  assertEquals(out.refused.badDiet, 2);
});

Deno.test("les autres refus: genre hors liste, allergène vide ou plus long que la note, doublon, ligne illisible", () => {
  const note = "Zoé est allergique au kiwi";
  const out = read([
    { kind: "medical", member_id: ZOE, text: "kiwi", because: "allergique au kiwi" },
    { kind: "dislike", member_id: ZOE, text: "kiwi", because: "allergique au kiwi" },
    { kind: "allergy", member_id: ZOE, text: "", because: "allergique au kiwi" },
    { kind: "allergy", member_id: ZOE, text: "x".repeat(note.length + 1), because: "allergique au kiwi" },
    { kind: "allergy", member_id: ZOE, text: "kiwi", because: "allergique au kiwi" },
    { kind: "allergy", member_id: ZOE, text: "Kiwi", because: "allergique au kiwi" },
    "allergique",
  ], note);
  assertEquals(out.kept, 1);
  assertEquals(out.refused.unknownKind, 2, "ni `medical` ni `dislike`: une note ne pose que les trois");
  assertEquals(out.refused.badText, 2);
  assertEquals(out.refused.duplicate, 1);
  assertEquals(out.refused.malformed, 1);
  assertEquals(out.refused.total, 6);
  assertEquals(out.proposed, 7);
});

Deno.test("la ligne sous le champ, dans les deux langues", () => {
  assertEquals(draftNoteSafetyLine({ kind: "allergy", text: "arachides", diet: null }, "fr"), "allergie : arachides");
  assertEquals(draftNoteSafetyLine({ kind: "intolerance", text: "lactose", diet: null }, "en"), "intolerance: lactose");
  assertEquals(draftNoteSafetyLine({ kind: "diet", text: null, diet: "vegetarian" }, "fr"), "régime : végétarien");
  assertEquals(draftNoteSafetyLine({ kind: "diet", text: null, diet: "omnivore" }, "fr"), "régime : plus de régime particulier");
  assert(draftNoteSafetyLine({ kind: "diet", text: null, diet: "gluten_free" }, "en").endsWith("gluten-free"));
});
