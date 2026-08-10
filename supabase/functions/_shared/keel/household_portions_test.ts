import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  buildPortionBrief,
  memberPortionsPayload,
  type PortionMember,
  reconcilePortions,
  sanitizePortionNote,
} from "./household_portions.ts";

const DAD: PortionMember = {
  memberId: "m-dad",
  displayName: "Marc",
  goal: "fat_loss",
  ageState: "adult",
};
const SON: PortionMember = {
  memberId: "m-son",
  displayName: "Tom",
  goal: "muscle_gain",
  ageState: "adult",
};
const KID: PortionMember = {
  memberId: "m-kid",
  displayName: "Léa",
  goal: null,
  ageState: "minor",
};

// ───────────────────────────────────────────────────────────────────────────
// LE BRIEF — ce qui part dans le prompt
// ───────────────────────────────────────────────────────────────────────────

Deno.test("deux objectifs opposés donnent deux directions DIFFÉRENTES sur la même cuisson", () => {
  // C'EST LE CAS QUI JUSTIFIE TOUT LE MODULE. Le père en sèche et le fils en
  // prise de masse: si les deux lignes disaient la même chose, le produit
  // n'aurait rien de plus qu'une app de batch cooking.
  const brief = buildPortionBrief([DAD, SON]);
  const dadLine = brief.split("\n").find((l) => l.startsWith("- Marc:"))!;
  const sonLine = brief.split("\n").find((l) => l.startsWith("- Tom:"))!;
  assert(dadLine !== sonLine, "les deux directions doivent différer");
  assert(dadLine.includes("smaller starch"));
  assert(sonLine.includes("larger protein and starch"));
});

Deno.test("le brief interdit explicitement les plats séparés", () => {
  // Un modèle confronté à des directions contradictoires propose volontiers
  // deux plats. Or le produit vend UNE cuisson: sans cette consigne, la
  // promesse tombe au premier foyer aux objectifs divergents.
  const brief = buildPortionBrief([DAD, SON]);
  assert(brief.includes("Do NOT propose separate dishes"));
  assert(brief.includes("one cooking session"));
});

Deno.test("un mineur reçoit une TAILLE, jamais une direction d'objectif", () => {
  const brief = buildPortionBrief([KID]);
  const line = brief.split("\n").find((l) => l.startsWith("- Léa:"))!;
  assertEquals(line, "- Léa: child-size share of the same dish");
  // Par NÉGATION: aucun vocabulaire d'objectif ne doit atteindre un enfant.
  for (const forbidden of ["starch share", "protein share", "generous vegetables"]) {
    assert(!line.includes(forbidden), `« ${forbidden} » ne doit pas viser un mineur`);
  }
});

Deno.test("le brief ordonne de ne JAMAIS écrire la raison", () => {
  // La consigne est lue à table par tout le foyer. Sans cette phrase, le
  // modèle écrit spontanément « parce que tu es en sèche » — c'est-à-dire
  // divulgue l'objectif d'un membre à ses colocataires.
  const brief = buildPortionBrief([DAD, SON, KID]);
  assert(brief.includes("NEVER state a reason"));
  assert(brief.includes("Write what to serve, never why"));
});

Deno.test("un foyer d'une personne ne produit pas de brief", () => {
  // L'entrée du produit est à 1 (PIVOT-FOYER §5): un brief de foyer pour une
  // personne seule serait du bruit dans le prompt.
  assertEquals(buildPortionBrief([]), "");
});

Deno.test("un majeur sans objectif déclaré n'est pas traité comme un enfant", () => {
  const adultNoGoal: PortionMember = {
    memberId: "m-x", displayName: "Alex", goal: null, ageState: "adult",
  };
  const line = buildPortionBrief([adultNoGoal]).split("\n")
    .find((l) => l.startsWith("- Alex:"))!;
  assertEquals(line, "- Alex: balanced share of every component");
});

// ───────────────────────────────────────────────────────────────────────────
// LA CEINTURE — ce qui ne peut pas sortir dans une consigne
// ───────────────────────────────────────────────────────────────────────────

Deno.test("une consigne de service normale passe telle quelle", () => {
  // Une ceinture qui mord sur tout se fait désarmer dans la semaine. Le cas
  // NOMINAL doit passer, et il est testé en premier pour cette raison.
  const got = sanitizePortionNote("1,5 part de poulet, riz en plus");
  assertEquals(got, { note: "1,5 part de poulet, riz en plus", violations: [] });
});

Deno.test("la raison est refusée — en français", () => {
  const got = sanitizePortionNote("part réduite, tu es en sèche");
  assertEquals(got.note, null);
  assert(got.violations.length > 0);
});

Deno.test("la raison est refusée — en anglais aussi", () => {
  // « garde testée dans une seule langue » est une leçon déjà payée par ce
  // dépôt. Le produit sort en fr-FR par défaut ET en en-US: les deux mordent.
  const got = sanitizePortionNote("smaller portion, you are cutting");
  assertEquals(got.note, null);
  assert(got.violations.length > 0);
});

Deno.test("le corps est refusé, dans les deux langues", () => {
  for (const note of [
    "portion adaptée à ton poids",
    "smaller share for your weight",
    "une part pour maigrir",
    "a share to lose weight",
  ]) {
    assertEquals(sanitizePortionNote(note).note, null, `« ${note} » doit être refusée`);
  }
});

Deno.test("les calories sont refusées — le produit ne les affiche pas", () => {
  assertEquals(sanitizePortionNote("environ 600 kcal").note, null);
  assertEquals(sanitizePortionNote("about 600 calories").note, null);
});

Deno.test("LA NÉGATION NE RACHÈTE RIEN ICI", () => {
  // Le moteur blanchit par défaut les mentions niées, et c'est juste pour le
  // verrou de doctrine (« pain sans gluten »). Ici c'est l'inverse: ce qu'on
  // interdit n'est pas d'ENCOURAGER le sujet, c'est de l'ÉVOQUER devant toute
  // la table. Ce test pinne le réglage `allowNegatedMentions: false`, sans
  // lequel toute la ceinture est contournable d'un « sans ».
  assertEquals(sanitizePortionNote("une part sans perte de poids").note, null);
  assertEquals(sanitizePortionNote("a share with no weight loss").note, null);
});

Deno.test("une consigne vide ou absente vaut part standard, sans violation", () => {
  assertEquals(sanitizePortionNote(null), { note: null, violations: [] });
  assertEquals(sanitizePortionNote("   "), { note: null, violations: [] });
  assertEquals(sanitizePortionNote(42), { note: null, violations: [] });
});

// ───────────────────────────────────────────────────────────────────────────
// LA RÉCONCILIATION — trois écarts, trois traitements
// ───────────────────────────────────────────────────────────────────────────

Deno.test("un membre oublié par le modèle est complété, PAS jeté", () => {
  // Perdre la cuisson du samedi soir parce qu'une consigne sur quatre manque
  // serait la vraie perte. On complète et on trace.
  const { portions, issues } = reconcilePortions([DAD, SON, KID], [
    { member_id: "m-dad", portion_note: "1 part" },
    { member_id: "m-son", portion_note: "1,5 part" },
  ]);
  assertEquals(portions.length, 3);
  assertEquals(portions[2].memberId, "m-kid");
  assertEquals(portions[2].portionNote, null);
  assert(issues.includes("portion_missing:m-kid"));
});

Deno.test("une consigne pour un inconnu est JETÉE", () => {
  // Une consigne pour quelqu'un qui n'habite pas là est du texte inventé, et
  // la rendre ferait apparaître un inconnu à table.
  const { portions, issues } = reconcilePortions([DAD], [
    { member_id: "m-dad", portion_note: "1 part" },
    { member_id: "m-ghost", portion_note: "2 parts" },
  ]);
  assertEquals(portions.length, 1);
  assertEquals(portions[0].memberId, "m-dad");
  assert(issues.includes("portion_for_unknown_member:m-ghost"));
});

Deno.test("l'ordre de sortie suit le FOYER, pas le modèle", () => {
  // L'écran doit lister le foyer dans le même ordre d'un repas à l'autre.
  const { portions } = reconcilePortions([DAD, SON, KID], [
    { member_id: "m-kid", portion_note: "petite part" },
    { member_id: "m-son", portion_note: "grande part" },
    { member_id: "m-dad", portion_note: "part normale" },
  ]);
  assertEquals(portions.map((p) => p.memberId), ["m-dad", "m-son", "m-kid"]);
});

Deno.test("une consigne fautive est mise à null ET tracée, le reste survit", () => {
  const { portions, issues } = reconcilePortions([DAD, SON], [
    { member_id: "m-dad", portion_note: "part réduite, déficit calorique" },
    { member_id: "m-son", portion_note: "double portion de riz" },
  ]);
  assertEquals(portions[0].portionNote, null);
  assertEquals(portions[1].portionNote, "double portion de riz");
  assert(issues.some((i) => i.startsWith("portion_note_rejected:m-dad:")));
});

Deno.test("la ceinture mord aussi sur les parts PAR PRÉPARATION", () => {
  // Le piège: nettoyer la consigne principale et laisser passer la même phrase
  // dans une sous-consigne. Le modèle écrit volontiers la raison là où la
  // place manque en haut.
  const { portions, issues } = reconcilePortions([DAD], [{
    member_id: "m-dad",
    portion_note: "1 part",
    preparation_shares: [
      { preparation_id: "p1", note: "moitié moins de riz, tu es en sèche" },
      { preparation_id: "p2", note: "double légumes" },
    ],
  }]);
  assertEquals(portions[0].preparationShares, [{ preparationId: "p2", note: "double légumes" }]);
  assert(issues.some((i) => i.startsWith("share_note_rejected:m-dad:p1:")));
});

Deno.test("une entrée non-tableau ne casse rien: tout le monde en part standard", () => {
  const { portions, issues } = reconcilePortions([DAD, SON], null);
  assertEquals(portions.map((p) => p.portionNote), [null, null]);
  assertEquals(issues, ["portion_missing:m-dad", "portion_missing:m-son"]);
});

Deno.test("le payload stocké est en snake_case, comme la colonne", () => {
  const { portions } = reconcilePortions([DAD], [{
    member_id: "m-dad",
    portion_note: "1 part",
    preparation_shares: [{ preparation_id: "p1", note: "sans riz" }],
  }]);
  assertEquals(memberPortionsPayload(portions), [{
    member_id: "m-dad",
    display_name: "Marc",
    portion_note: "1 part",
    preparation_shares: [{ preparation_id: "p1", note: "sans riz" }],
  }]);
});
