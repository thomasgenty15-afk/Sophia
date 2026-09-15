// UNE ALLERGIE DITE SUR UN RETOUR DE PLAN EST UNE ALLERGIE.
//
// Ce que ces tests existent pour empêcher, dans l'ordre où ça coûte:
//
//   1. QU'UNE ALLERGIE SOIT ÉCRITE SUR LA MAUVAISE PERSONNE. C'est de la santé,
//      et c'est le genre de fait faux qu'on ne découvre qu'à l'hôpital. Le refus
//      est la bonne réponse; le repli sur le titulaire ne l'est jamais.
//   2. QUE LE MODÈLE CHOISISSE LA SÉVÉRITÉ. `severity` décide si la ceinture de
//      sortie mord: une contrainte enregistrée et INERTE est pire qu'absente,
//      parce qu'elle a l'air d'avoir marché.
//   3. QUE LE CANAL AVALE LES GOÛTS. « je n'aime pas » n'est pas « ça me rend
//      malade », et tout ranger ici viderait `items` de son sens.
//
// env purgé: env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
//   deno test --allow-read --allow-env --no-check \
//   supabase/functions/_shared/keel/draft_note_safety_test.ts

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  readSafetyDeclarations,
  SAFETY_DECLARATION_ALLOWED_KINDS,
  SAFETY_DECLARATION_PROMPT_BLOCK,
  SAFETY_DECLARATION_REFUSED_KINDS,
} from "./draft_note_safety.ts";

const TOM = "7b17ae2c-dd85-4d27-b8f2-4c52dbfc0828";
const LEA = "f990e08e-026a-42bc-a235-01debc83b448";
const ROSTER = [TOM, LEA];

function read(raw: unknown, memberIds: readonly string[] = ROSTER) {
  return readSafetyDeclarations({ raw, memberIds });
}

// ===========================================================================
// 1. LE CAS QUI PASSE — sans lui, toutes les gardes qui suivent seraient des
//    gardes cassées qui ressemblent à des gardes qui marchent.
// ===========================================================================

Deno.test("l'allergie de la personne qui écrit entre, avec son slug normalisé", () => {
  const out = read([{ kind: "allergy", ref: "Peanut", text: "Je suis allergique aux arachides" }]);
  assertEquals(out.declarations.length, 1);
  assertEquals(out.declarations[0].kind, "allergy");
  assertEquals(out.declarations[0].ref, "peanut");
  assertEquals(out.declarations[0].memberId, null, "null = la personne qui écrit");
  assertEquals(out.refused.total, 0);
});

Deno.test("une déclaration ATTRIBUÉE garde sa bouche", () => {
  const out = read([{ kind: "diet", ref: "vegetarian", member_id: TOM, text: "Mon fils est devenu végétarien" }]);
  assertEquals(out.declarations[0].memberId, TOM);
  assertEquals(out.declarations[0].kind, "diet");
});

// ===========================================================================
// 2. ⛔ JAMAIS SUR LA MAUVAISE PERSONNE
// ===========================================================================

Deno.test("⛔ UN `member_id` INCONNU EST UN REFUS, jamais un repli sur le titulaire", () => {
  // Replier écrirait l'allergie d'un enfant sur la ligne de sa mère.
  const out = read([{ kind: "allergy", ref: "peanut", member_id: "99999999-9999-4999-8999-999999999999" }]);
  assertEquals(out.declarations.length, 0);
  assertEquals(out.refused.unknownMember, 1);
});

Deno.test("un foyer VIDE refuse toute attribution, et garde le titulaire", () => {
  assertEquals(read([{ kind: "allergy", ref: "peanut", member_id: TOM }], []).refused.unknownMember, 1);
  assertEquals(read([{ kind: "allergy", ref: "peanut" }], []).declarations.length, 1);
});

// ===========================================================================
// 3. ⛔ LA FRONTIÈRE GOÛT / SÉCURITÉ
// ===========================================================================

Deno.test("⛔ `dislike` NE PASSE PAS par ce canal — il a déjà sa place", () => {
  assertEquals(SAFETY_DECLARATION_REFUSED_KINDS.includes("dislike"), true);
  const out = read([{ kind: "dislike", ref: "peanut" }]);
  assertEquals(out.declarations.length, 0);
  assertEquals(out.refused.badKind, 1);
  // Et le cas qui passe: les cinq autres entrent.
  for (const kind of SAFETY_DECLARATION_ALLOWED_KINDS) {
    assertEquals(read([{ kind, ref: "peanut" }]).declarations.length, 1, kind);
  }
});

Deno.test("⛔ LA FRONTIÈRE EST SUR LA LIGNE DE LA CLÉ `kind`, pas dans un paragraphe", () => {
  // Cicatrice chiffrée: 0 % de conformité quand la promesse et la clé de schéma
  // sont éloignées dans le prompt.
  const line = SAFETY_DECLARATION_PROMPT_BLOCK.split("\n").find((l) => l.includes('"kind"'));
  assert(line, "la clé `kind` a disparu du bloc");
  assert(/they make me ill/i.test(line!), "l'exemple qui SÉPARE goût et sécurité a quitté la ligne");
  assert(/NEVER dislike/i.test(line!), "le refus n'est plus sur la ligne de la clé");
});

// ===========================================================================
// 4. ⛔ LE MODÈLE NE CHOISIT PAS LA SÉVÉRITÉ
// ===========================================================================

Deno.test("⛔ LA PORTÉE EST SUR LA LIGNE DE LA CLÉ — un régime d'un soir n'en est pas un", () => {
  // ══════════════════════════════════════════════════════════════════════
  // LE CAS MESURÉ, RECOPIÉ D'UNE CAMPAGNE RÉELLE — 2026-09-04.
  // ══════════════════════════════════════════════════════════════════════
  // La note disait « On mange végétarien le lundi soir ». Elle est devenue un
  // régime STRICT de la titulaire, et un régime de la titulaire gouverne TOUT
  // le foyer: quatre omnivores ont mangé végétarien à tous les repas, sans
  // qu'un mot le dise.
  //
  // ⛔ MÊME PATRON QUE LE DISCRIMINANT DU GOÛT, VINGT LIGNES PLUS HAUT: sur la
  // LIGNE de la clé, pas dans un paragraphe. Cicatrice chiffrée: 0 % de
  // conformité quand la promesse et la clé de schéma sont éloignées.
  const line = SAFETY_DECLARATION_PROMPT_BLOCK.split("\n").find((l) =>
    l.includes('"kind"')
  );
  assert(line, "la clé `kind` a disparu du bloc");
  assert(
    /vegetarian on Monday nights/i.test(line!),
    "l'exemple qui sépare le RÉGIME du RYTHME a quitté la ligne de la clé",
  );
  assert(
    /RHYTHM, not a diet/i.test(line!),
    "le mot qui nomme la distinction a disparu de la ligne",
  );
});

Deno.test("⛔ LA RÈGLE GÉNÉRALE DE PORTÉE EST DITE, et elle nomme ses marqueurs", () => {
  // L'exemple seul ne couvre que le lundi soir. La règle dit POURQUOI, et elle
  // énumère les formes que prend une portée — un jour, un moment, une
  // fréquence — parce qu'un modèle généralise mieux depuis une liste que
  // depuis un cas.
  const bloc = SAFETY_DECLARATION_PROMPT_BLOCK;
  assert(/holds at EVERY meal, for good/i.test(bloc), "la règle de portée manque");
  for (const marqueur of ["on Mondays", "at dinner", "twice a week"]) {
    assert(bloc.includes(marqueur), `le marqueur « ${marqueur} » n'est pas cité`);
  }
  assert(
    /one evening a week is not a diet/i.test(bloc),
    "la phrase qui tranche — un régime d'un soir est un rythme — a disparu",
  );
});

Deno.test("⛔ LE BLOC N'A PAS PERDU SON PREMIER DISCRIMINANT en gagnant le second", () => {
  // Deux discriminants sur la même ligne, et le second ne doit pas chasser le
  // premier: « goût contre sécurité » a sa propre cicatrice et son propre test
  // vingt lignes plus haut. On vérifie ici qu'ils COEXISTENT.
  const line = SAFETY_DECLARATION_PROMPT_BLOCK.split("\n").find((l) =>
    l.includes('"kind"')
  )!;
  assert(/they make me ill/i.test(line), "l'exemple du goût a été chassé");
  assert(/vegetarian on Monday nights/i.test(line), "l'exemple du rythme manque");
});

Deno.test("⛔ AUCUN MATCHER DE REFUS N'A ÉTÉ ÉCRIT — fail-open est interdit", () => {
  // La sortie tentante — chercher « le lundi » dans le texte et JETER l'entrée —
  // est la seule interdite: un faux positif jetterait une vraie ligne de
  // sécurité (« je suis allergique aux arachides depuis lundi »).
  //
  // La garde est donc que le module ne fabrique AUCUN refus sur la portée: une
  // déclaration bien formée traverse, quelle que soit sa phrase.
  const rythme = read([{
    kind: "diet",
    ref: "vegetarian",
    member_id: null,
    text: "On mange végétarien le lundi soir",
  }]);
  assertEquals(rythme.declarations.length, 1, "le module ne doit RIEN refuser ici");
  assertEquals(rythme.declarations[0].ref, "vegetarian");
});

Deno.test("⛔ AUCUNE SÉVÉRITÉ NE TRAVERSE, même déclarée", () => {
  // Une contrainte enregistrée, visible en base, et INERTE est la pire des
  // trois issues: elle a l'air d'avoir marché.
  const out = read([{ kind: "allergy", ref: "peanut", severity: "preference" }]);
  assertEquals(out.declarations.length, 1);
  assertEquals(
    Object.prototype.hasOwnProperty.call(out.declarations[0], "severity"),
    false,
    "une sévérité déclarée par le modèle a traversé",
  );
  assert(
    /never return a severity/i.test(SAFETY_DECLARATION_PROMPT_BLOCK),
    "le prompt ne l'interdit plus",
  );
});

// ===========================================================================
// 5. CE QUI NE CASSE PAS
// ===========================================================================

Deno.test("un tableau absent, vide ou difforme ne jette pas", () => {
  for (const raw of [null, undefined, [], "nawak", 42, {}]) {
    assertEquals(read(raw).declarations.length, 0);
  }
  const mixed = read([{ kind: "allergy", ref: "peanut" }, null, "x", { kind: "allergy" }]);
  assertEquals(mixed.declarations.length, 1, "une entrée difforme a emporté ses voisines");
  assertEquals(mixed.refused.malformed, 2);
  assertEquals(mixed.refused.badRef, 1);
});
