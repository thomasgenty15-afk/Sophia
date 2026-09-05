// LE RETOUR SUR LE BROUILLON, CLASSÉ VERS TROIS PORTES — lot A (2026-09-03).
//
// Ce que ces tests existent pour empêcher, dans l'ordre où ça a déjà coûté:
//
//   1. UN LOT DÉSARMÉ QUI RESSEMBLE À UN LOT QUI MARCHE. `kind`, `text`,
//      `member_id`, `when` et `why` sont DÉCLARÉS PAR LE MODÈLE: on ne peut pas
//      savoir d'avance à quelle fréquence il les remplit bien, seulement le
//      mesurer. D'où les compteurs PAR PORTE, et d'où les tests qui épinglent
//      chacun de leurs motifs.
//   2. UNE MATRICE ARMÉE SUR UN COFFRE VIDE. Chaque interdit a ici son cas qui
//      mord ET son voisin qui passe.
//   3. UNE PHRASE QUI PERD SA PERSONNE. « Mon fils n'aime pas le poisson » sur
//      le foyer entier est un fait FAUX; le repli sur `household` est nommé
//      comme interdit dans le prompt et refusé par le parseur.
//   4. UN DEGRÉ QUI DEVIENT UNE NOTE. « Trop long à cuisiner » ne se range
//      nulle part depuis un texte (§2.3): le modèle le DIT (`skipped.degree`),
//      et ce test exige que le prompt le lui apprenne.
//   5. UN MODÈLE IMPORTÉ MAIS JAMAIS APPELÉ, et UN MODULE PARFAIT SANS CÂBLAGE.
//      La section « LE CÂBLAGE » applique une fonction PURE deux fois: sur le
//      vrai fichier (vert) et sur une copie EN MÉMOIRE amputée (rouge attendu).
//
// ⚠️ LES LITTÉRAUX SONT ÉCRITS EN DUR, jamais recomposés depuis la constante
// qu'ils épinglent: « un test paramétré par sa propre constante reste vert
// quand on change la constante ».
//
// env purgé: env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
//   deno test --allow-read --allow-env --no-check \
//   supabase/functions/_shared/keel/draft_note_classify_test.ts

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";

import {
  safetyHeldForScope,
  withoutSafetyHeldForScope,
  buildDraftNoteClassifyPrompt,
  DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT,
  DRAFT_NOTE_FORBIDDEN_KINDS,
  DRAFT_NOTE_GATES,
  DRAFT_NOTE_KINDS,
  DRAFT_NOTE_NEXT_PLAN_KINDS,
  DRAFT_NOTE_PREFERENCE_KINDS,
  DRAFT_NOTE_PRODUCER,
  DRAFT_NOTE_SKIP_REASONS,
  type DraftNoteMember,
  draftNoteClassifyTrace,
  EMPTY_DRAFT_NOTE_CLASSIFICATION,
  readDraftNoteClassification,
} from "./draft_note_classify.ts";
import {
  classifyAndPersistDraftNote,
  DRAFT_NOTE_CLASSIFY_SOURCE,
  DRAFT_NOTE_CLASSIFY_TIMEOUT_MS,
} from "./draft_note_classify_io.ts";
import type { DraftNoteVerdict } from "./plan_draft_note.ts";
import { canProduce, defaultScopeFor } from "./retained_item.ts";
import { KEEL_GENERATION_MODEL_DEFAULT } from "./generation_model.ts";

// ---------------------------------------------------------------------------
// LE DÉCOR
// ---------------------------------------------------------------------------

const USER = "11111111-2222-4333-8444-555555555555";
const ZOE = "aaaaaaaa-0000-4000-8000-000000000001";
const MARC = "bbbbbbbb-0000-4000-8000-000000000002";
const STRANGER = "cccccccc-0000-4000-8000-000000000003";

/** Un mardi. La semaine visée commence le lundi 2026-08-17. */
const TODAY = "2026-08-18";
/** Le `starts_on` du plan qu'on vient d'écrire — un MERCREDI, exprès. */
const PLAN_STARTS_ON = "2026-08-19";
/** Le lundi ISO de cette semaine-là, écrit EN DUR (pas recalculé). */
const ANCHOR = "2026-08-17";
/** L'instant de l'écriture, EN DUR. */
const NOW = "2026-08-18T14:03:00.000Z";

const MEMBERS: DraftNoteMember[] = [
  { memberId: ZOE, label: "Zoé", ageState: "minor", sex: "female" },
  { memberId: MARC, label: "Marc", ageState: "adult", sex: "male" },
];

const NOTE = "Plus de poisson cette semaine. J'aimerais des fajitas.";

function usable(text: string = NOTE): DraftNoteVerdict {
  return { usable: text, refusal: null, dropped: [] };
}

/**
 * Les aliments du plan que la personne annotait. ⚠️ DEUX VIANDES, exprès: la
 * question « laquelle ? » n'a de sens que quand plusieurs candidats existent, et
 * un décor à un seul aliment rendrait le cas nominal inatteignable.
 */
const PLAN_FOODS = ["poulet rôti", "steak haché", "riz", "brocolis"] as const;

function read(
  lists: Record<string, unknown>,
  over: Record<string, unknown> = {},
) {
  return readDraftNoteClassification({
    raw: lists,
    today: TODAY,
    targetWeek: PLAN_STARTS_ON,
    members: MEMBERS,
    note: NOTE,
    writtenAt: NOW,
    planFoods: PLAN_FOODS,
    ...over,
  });
}

// ===========================================================================
// ① LES JETONS ET LES LISTES — épinglés à leurs littéraux
// ===========================================================================

Deno.test("⛔ le producteur est `draft_note`, JAMAIS `written`", () => {
  assertEquals(DRAFT_NOTE_PRODUCER, "draft_note");
  assertEquals(canProduce("written", "portion.adjust"), true);
  assertEquals(canProduce(DRAFT_NOTE_PRODUCER, "portion.adjust"), false);
});

Deno.test("la matrice ① — CINQ familles permises, trois interdites, quatre préférences", () => {
  assertEquals([...DRAFT_NOTE_KINDS].sort(), [
    "craving",
    "food.exclude",
    "food.prefer",
    "method.avoid",
    "method.prefer",
  ]);
  assertEquals([...DRAFT_NOTE_FORBIDDEN_KINDS].sort(), [
    "logistics.set",
    "portion.adjust",
    "rhythm.set",
  ]);
  // ① — les préférences: tout ce que la matrice permet, SAUF l'envie.
  assertEquals([...DRAFT_NOTE_PREFERENCE_KINDS].sort(), [
    "food.exclude",
    "food.prefer",
    "method.avoid",
    "method.prefer",
  ]);
  assertEquals([...DRAFT_NOTE_NEXT_PLAN_KINDS].sort(), [...DRAFT_NOTE_KINDS].sort());
  // Ensemble, permises et interdites couvrent les huit, sans recouvrement.
  assertEquals(DRAFT_NOTE_KINDS.length + DRAFT_NOTE_FORBIDDEN_KINDS.length, 8);
  // `canProduce("conversation", …)` reste faux pour TOUT.
  for (const kind of [...DRAFT_NOTE_KINDS, ...DRAFT_NOTE_FORBIDDEN_KINDS]) {
    assertEquals(canProduce("conversation", kind), false, kind);
  }
});

Deno.test("⛔ LOT A — le brouillon écrit du DURABLE pour ①, `next_plan` pour l'envie", () => {
  assertEquals(canProduce("draft_note", "food.exclude"), true);
  assertEquals(defaultScopeFor("draft_note", "food.exclude"), "durable");
  assertEquals(defaultScopeFor("draft_note", "method.avoid"), "durable");
  assertEquals(defaultScopeFor("draft_note", "craving"), "next_plan");
  assertEquals(defaultScopeFor("draft_note", "portion.adjust"), null);
  assertEquals(defaultScopeFor("draft_note", "rhythm.set"), null);
  assertEquals(defaultScopeFor("draft_note", "logistics.set"), null);
});

Deno.test("les motifs de saut, les portes, la trace et le plafond sont épinglés à leurs littéraux", () => {
  assertEquals([...DRAFT_NOTE_SKIP_REASONS], ["degree", "setting", "meal_story", "other"]);
  assertEquals([...DRAFT_NOTE_GATES], ["preferences", "notes", "next_plan"]);
  assertEquals(DRAFT_NOTE_CLASSIFY_SOURCE, "keel-draft-note-classify");
  assertEquals(DRAFT_NOTE_CLASSIFY_TIMEOUT_MS, 25_000);
});

// ===========================================================================
// ② LE PROMPT — la promesse TOUCHE la clé, PORTE PAR PORTE
// ===========================================================================

const PROMPT = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT;

/** Distance entre deux ancres du prompt. `-1` si l'une manque. */
function distance(from: string, to: string): number {
  const a = PROMPT.indexOf(from);
  const b = PROMPT.indexOf(to, a);
  if (a === -1 || b === -1) return -1;
  return b - a;
}

Deno.test("⛔ PORTE ① — « NEVER craving / NEVER portion.adjust… » SUR la ligne de `\"kind\"` — 0 % sinon", () => {
  const d = distance('1. "preferences"', "NEVER craving here");
  assert(d > 0 && d < 300, `promesse à ${d} caractères de la clé`);
  const kindLine = PROMPT.split("\n").find((l) =>
    l.includes('"kind": exactly one of') && l.includes("NEVER craving here")
  );
  assert(kindLine, "la ligne `kind` de ① ne nomme pas l'envie comme interdite ICI");
  for (const forbidden of DRAFT_NOTE_FORBIDDEN_KINDS) {
    assert(kindLine!.includes(`NEVER ${forbidden}`) || kindLine!.includes(`, NEVER ${forbidden}`), forbidden);
  }
});

Deno.test("⛔ L'ENCART — « ONLY what the note itself dates » SUR la ligne du titre", () => {
  const d = distance('2. "next_plan"', "ONLY what the note itself dates");
  assert(d >= 0 && d < 300, `promesse à ${d} caractères de la clé`);
  assert(PROMPT.includes("it is a preference (1), not a next_plan"));
});

Deno.test("⛔ PORTE ③ — « NEVER a food… NEVER a degree » SUR la ligne du titre, et `when` juste après", () => {
  const d = distance('3. "notes"', "NEVER a food or a preparation");
  assert(d >= 0 && d < 300, `promesse à ${d} caractères de la clé`);
  const d2 = distance('3. "notes"', "NEVER a degree");
  assert(d2 >= 0 && d2 < 300);
  const when = PROMPT.split("\n").find((l) => l.includes('"when":'));
  assert(when, "la clé `when` a disparu du schéma");
  for (const day of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
    assert(when!.includes(day), `le jour ${day} n'est pas dans le vocabulaire`);
  }
  for (const slot of ["breakfast", "snack_am", "lunch", "snack_pm", "dinner", "before_bed"]) {
    assert(when!.includes(slot), `le créneau ${slot} n'est pas dans le vocabulaire`);
  }
  assert(when!.includes("NEVER invent a day or a slot"));
  // ⚠️ MESURÉ SUR LE BANC DU 2026-09-03: « l'après-midi elle mange toujours des
  // compotes » rendait QUATRE LISTES VIDES, sans un `skipped`. Une habitude à
  // un créneau est un FAIT avec un `when` (§8.1, phrase 7), et le prompt le dit.
  assert(/ALWAYS has at one meal/.test(PROMPT), "l'habitude à un créneau n'est pas enseignée comme un fait");
  const d3 = distance('3. "notes"', "ALWAYS has at one meal");
  assert(d3 >= 0 && d3 < 600);
});

Deno.test("⛔ RIEN N'EST TU: ce qui n'est pas rangé DOIT apparaître dans `skipped`", () => {
  // Mesuré: un modèle qui ne range rien et ne le dit pas rend un `nothing_to_file`
  // indiscernable d'un prompt cassé. La promesse est SUR la ligne de `skipped`.
  const d = distance('4. "skipped"', "MUST appear here");
  assert(d >= 0 && d < 300, `promesse à ${d} caractères de la clé`);
});

Deno.test("⛔ UN DEGRÉ N'EST RANGÉ NULLE PART — et le prompt l'apprend au modèle, sous `skipped`", () => {
  // La PROMESSE de cette porte (« MUST appear here ») est SUR la ligne de la clé
  // (test suivant); la description des motifs vient juste après, sous 600.
  const d = distance('4. "skipped"', "- degree —");
  assert(d >= 0 && d < 600, `description à ${d} caractères de la clé`);
  const degree = PROMPT.split("\n").find((l) => l.startsWith("- degree —"))!;
  for (const word of ["too big", "too long to cook", "too complicated", "not varied enough"]) {
    assert(degree.includes(word), `« ${word} » n'est pas nommé comme un degré`);
  }
  assert(degree.includes("never filed from a sentence"));
  for (const why of DRAFT_NOTE_SKIP_REASONS) {
    assert(PROMPT.includes(`- ${why} —`), `le motif ${why} n'est pas enseigné`);
  }
});

Deno.test("⛔ AUCUNE famille interdite n'est ENSEIGNÉE — seulement refusée, avec SA raison", () => {
  for (const forbidden of DRAFT_NOTE_FORBIDDEN_KINDS) {
    assert(!PROMPT.includes(`- ${forbidden} —`), `le prompt ENSEIGNE « ${forbidden} »`);
    assert(PROMPT.includes(`· ${forbidden} —`), `« ${forbidden} » est refusé sans qu'on dise POURQUOI`);
  }
  // Le cas qui PASSE: chaque famille de ① est enseignée, et l'envie sous l'encart.
  for (const allowed of DRAFT_NOTE_PREFERENCE_KINDS) {
    assert(PROMPT.includes(`- ${allowed} —`), `« ${allowed} » n'est décrit nulle part`);
  }
  assert(PROMPT.includes("- craving —"));
  // Et l'envie est enseignée APRÈS le titre de l'encart, pas sous ①.
  assert(PROMPT.indexOf("- craving —") > PROMPT.indexOf('2. "next_plan"'));
  assert(!/Those two are asked somewhere else/i.test(PROMPT));
});

Deno.test("les descriptions sont RENDUES depuis la matrice — fermer une famille la retire du prompt", async () => {
  // Le prompt est calculé depuis `DRAFT_NOTE_PREFERENCE_KINDS`, qui est
  // calculé depuis `canProduce`. On le prouve sur la source: aucune famille
  // n'est écrite en dur dans une chaîne d'enseignement.
  const src = await Deno.readTextFile(new URL("draft_note_classify.ts", import.meta.url));
  const body = src.slice(src.indexOf("export const DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT"));
  const prompt = body.slice(0, body.indexOf("].join(\"\\n\")"));
  for (const kind of [...DRAFT_NOTE_KINDS, ...DRAFT_NOTE_FORBIDDEN_KINDS]) {
    assert(
      !prompt.includes(`"- ${kind} —`) && !prompt.includes(`'- ${kind} —`),
      `« ${kind} » est enseigné EN DUR dans le prompt, pas rendu depuis la matrice`,
    );
  }
  assert(prompt.includes("...DRAFT_NOTE_PREFERENCE_KINDS.flatMap"));
  assert(prompt.includes("DRAFT_NOTE_FORBIDDEN_KINDS.map"));
});

Deno.test("⛔ LE REPLI SUR LE FOYER EST NOMMÉ COMME INTERDIT, et l'abstention est dite", () => {
  assert(/IF TWO PEOPLE FIT, OR NONE/i.test(PROMPT));
  assert(/Do NOT fall back to member_id: null/i.test(PROMPT));
  assert(/my son|my daughter/i.test(PROMPT));
  assert(PROMPT.includes("NEVER a first name"));
});

Deno.test("le prompt ne demande NI `scope`, NI `source`, NI `confidence`, NI l'ancienne clé `items`", () => {
  const schema = PROMPT.split("\n").find((l) => l.startsWith('{ "preferences"'))!;
  assert(schema.includes('"safety"'));
  assert(!schema.includes('"items"'), "l'ancienne forme `items` est encore demandée");
  for (const key of ['"scope"', '"source"', '"confidence"', '"at"']) {
    assert(!PROMPT.includes(`  ${key}:`), `${key} est demandé au modèle`);
  }
});

Deno.test("⛔ LA RÈGLE DE DIRECTION est dans le prompt, collée à `food.prefer`", () => {
  const i = PROMPT.indexOf("- food.prefer —");
  assert(i >= 0);
  const next = PROMPT.indexOf("DIRECTION FIRST", i);
  assert(next - i > 0 && next - i < 200);
});

Deno.test("le bloc de SÉCURITÉ est là, en dernier, et aucune famille de sécurité parmi les huit", () => {
  assert(PROMPT.includes('"safety": [ ... ]'));
  // ⟳ 2026-09-04 — « SIXTH », et plus « SECOND ». La liste de sécurité était
  // annoncée comme la seconde d'un schéma à deux clés, périmé depuis le lot A.
  // ⚠️ ET ELLE VIENT MAINTENANT APRÈS LA PORTE ⑤, pas après la ④: c'est le
  // rang réel, et un rang faux dans une consigne est une consigne fausse.
  assert(PROMPT.indexOf("SAFETY — a SIXTH list") > PROMPT.indexOf('5. "clarify"'));
  for (const kind of [...DRAFT_NOTE_KINDS, ...DRAFT_NOTE_FORBIDDEN_KINDS]) {
    assert(!/allerg|intoleran|medical|diet/i.test(kind), kind);
  }
});

Deno.test("le rôle vide se DIT, il ne s'omet pas", () => {
  const solo = buildDraftNoteClassifyPrompt({ note: NOTE, contentLocale: "fr-FR", members: [], planFoods: PLAN_FOODS });
  assert(solo.includes("There is nobody else at this table"));
  const foyer = buildDraftNoteClassifyPrompt({ note: NOTE, contentLocale: "fr-FR", members: MEMBERS, planFoods: PLAN_FOODS });
  assert(foyer.includes(`"member_id":"${ZOE}"`));
  assert(foyer.includes('"age":"minor"') && foyer.includes('"sex":"female"'));
  assert(foyer.includes(`They write in fr-FR`));
});

// ===========================================================================
// ③ LA RELECTURE — trois portes, et chaque refus avec son voisin qui passe
// ===========================================================================

Deno.test("✅ PORTE ① — une préférence devient un item DURABLE, cité, à la bonne personne", () => {
  const out = read({
    preferences: [
      { kind: "food.exclude", text: "pas de poisson", member_id: ZOE },
      { kind: "method.avoid", text: "rien de frit", member_id: null },
    ],
    notes: [],
    next_plan: [],
    skipped: [],
  });
  assert(out.ok);
  const c = out.classification;
  assertEquals(c.preferences.proposed, 2);
  assertEquals(c.preferences.kept, 2);
  assertEquals(c.preferences.refused.total, 0);
  const [fish, fried] = c.preferences.items;
  assertEquals(fish.scope, "durable");
  assertEquals(fish.subject, `member:${ZOE}`);
  assertEquals(fish.source, "draft_note");
  assertEquals(fish.at, TODAY);
  assertEquals(fish.quote, NOTE);
  assertEquals(fried.subject, "household");
  assertEquals(fried.kind, "method.avoid");
  assertEquals(c.kept, 2);
});

Deno.test("⛔ PORTE ① — l'envie n'y entre PAS: c'est un rangement de travers, compté et NOMMÉ", () => {
  const out = read({ preferences: [{ kind: "craving", text: "des fajitas", member_id: null }] });
  assertEquals(out.classification.preferences.kept, 0);
  assertEquals(out.classification.preferences.refused.forbiddenKind, 1);
  assertEquals(out.classification.preferences.refused.forbiddenKinds, ["craving"]);
});

Deno.test("⛔ PORTE ① — `portion.adjust`, `rhythm.set`, `logistics.set` sont REFUSÉS, et le cas qui passe est à côté", () => {
  const out = read({
    preferences: [
      { kind: "portion.adjust", text: "moins", member_id: null, value: { direction: "down", magnitude: "slight" } },
      { kind: "rhythm.set", text: "pas de petit-déj", member_id: null, value: { occasion: "breakfast", present: false } },
      { kind: "logistics.set", text: "30 min", member_id: null, value: { field: "cooking_time_min", value: 30 } },
      { kind: "food.exclude", text: "pas de poisson", member_id: null },
    ],
  });
  const g = out.classification.preferences;
  assertEquals(g.proposed, 4);
  assertEquals(g.kept, 1);
  assertEquals(g.refused.forbiddenKind, 3);
  assertEquals(g.refused.forbiddenKinds, ["logistics.set", "portion.adjust", "rhythm.set"]);
});

Deno.test("⛔ un `kind` hors liste tombe SEUL, ses voisins survivent", () => {
  const out = read({
    preferences: [
      { kind: "allergy", text: "arachides", member_id: null },
      { kind: "food.exclude", text: "pas de poisson", member_id: null },
    ],
  });
  assertEquals(out.classification.preferences.refused.unknownKind, 1);
  assertEquals(out.classification.preferences.kept, 1);
});

Deno.test("⛔ un id HORS RÔLE est un refus, PAS un repli sur `household` — sur les trois portes", () => {
  const out = read({
    preferences: [{ kind: "food.exclude", text: "pas de poisson", member_id: STRANGER }],
    notes: [{ text: "danse le mardi", member_id: STRANGER, when: null }],
    next_plan: [{ kind: "craving", text: "des fajitas", member_id: STRANGER }],
  });
  assertEquals(out.classification.preferences.refused.unknownMember, 1);
  assertEquals(out.classification.notes.refused.unknownMember, 1);
  assertEquals(out.classification.nextPlan.refused.unknownMember, 1);
  assertEquals(out.classification.kept, 0);
  // Et un PRÉNOM n'est jamais une bouche.
  const byName = read({ preferences: [{ kind: "food.exclude", text: "pas de poisson", member_id: "Zoé" }] });
  assertEquals(byName.classification.preferences.refused.unknownMember, 1);
});

Deno.test("un solo n'a pas de bouche à nommer: tout id est refusé, `null` passe", () => {
  const out = read({
    preferences: [
      { kind: "food.exclude", text: "pas de poisson", member_id: ZOE },
      { kind: "food.exclude", text: "pas de poisson", member_id: null },
    ],
  }, { members: [] });
  assertEquals(out.classification.preferences.refused.unknownMember, 1);
  assertEquals(out.classification.preferences.kept, 1);
  assertEquals(out.classification.preferences.items[0].subject, "household");
});

Deno.test("⛔ un `text` vide ou PLUS LONG que la note tombe — sur les trois portes", () => {
  const long = "x".repeat(NOTE.length + 1);
  const out = read({
    preferences: [{ kind: "food.exclude", text: "", member_id: null }, { kind: "food.exclude", text: long, member_id: null }],
    notes: [{ text: "   ", member_id: null, when: null }],
    next_plan: [{ kind: "craving", text: long, member_id: null }],
  });
  assertEquals(out.classification.preferences.refused.badText, 2);
  assertEquals(out.classification.notes.refused.badText, 1);
  assertEquals(out.classification.nextPlan.refused.badText, 1);
  // Le cas qui passe: exactement la longueur de la note.
  const exact = read({ preferences: [{ kind: "food.exclude", text: "y".repeat(NOTE.length), member_id: null }] });
  assertEquals(exact.classification.preferences.kept, 1);
});

Deno.test("✅ L'ENCART — l'envie et l'exclusion datée: `next_plan`, l'ancre = LUNDI ISO, l'instant = celui de l'appelant", () => {
  const out = read({
    next_plan: [
      { kind: "craving", text: "des fajitas", member_id: null },
      { kind: "food.exclude", text: "pas de poisson cette semaine", member_id: ZOE },
    ],
  });
  const g = out.classification.nextPlan;
  assertEquals(g.kept, 2);
  for (const entry of g.entries) {
    assertEquals(entry.item.scope, "next_plan");
    assertEquals(entry.anchor, ANCHOR);
    assertEquals(entry.writtenAt, NOW);
    assertEquals(entry.item.quote, NOTE);
  }
  assertEquals(g.entries[1].item.subject, `member:${ZOE}`);
});

Deno.test("⛔ L'ENCART — `portion.adjust` est REFUSÉ là aussi; un `writtenAt` absent est accepté et reste `null`", () => {
  const out = read({
    next_plan: [
      { kind: "portion.adjust", text: "moins", member_id: null, value: { direction: "down", magnitude: "slight" } },
      { kind: "craving", text: "des fajitas", member_id: null },
    ],
  }, { writtenAt: null });
  assertEquals(out.classification.nextPlan.refused.forbiddenKind, 1);
  assertEquals(out.classification.nextPlan.kept, 1);
  assertEquals(out.classification.nextPlan.entries[0].writtenAt, null);
  // Et un instant lisible est NORMALISÉ, pas recopié.
  const iso = read({ next_plan: [{ kind: "craving", text: "des fajitas", member_id: null }] }, {
    writtenAt: "2026-08-18T16:03:00+02:00",
  });
  assertEquals(iso.classification.nextPlan.entries[0].writtenAt, NOW);
});

Deno.test("✅ PORTE ③ — une note devient une ligne de mémo, à SA personne, au jour NOMMÉ, citée", () => {
  const out = read({
    notes: [
      { text: "danse le mardi soir, il lui faut un vrai repas", member_id: ZOE, when: { weekday: "tue", slot: "dinner" } },
      { text: "on mange tard le vendredi", member_id: null, when: { weekday: "fri" } },
      { text: "goûter toujours des compotes", member_id: ZOE, when: { slot: "snack_pm" } },
      { text: "un fait sans jour", member_id: null, when: null },
    ],
  });
  const g = out.classification.notes;
  assertEquals(g.proposed, 4);
  assertEquals(g.kept, 4);
  const [dance, late, snack, plain] = g.lines;
  assertEquals(dance.subject, `member:${ZOE}`);
  assertEquals(dance.when, { weekday: "tue", slot: "dinner" });
  assertEquals(dance.source, "draft_note");
  assertEquals(dance.at, TODAY);
  assertEquals(dance.quote, NOTE);
  assertEquals(late.subject, "household");
  assertEquals(late.when, { weekday: "fri", slot: null });
  assertEquals(snack.when, { weekday: null, slot: "snack_pm" });
  assertEquals(plain.when, null);
});

Deno.test("⛔ PORTE ③ — un `when` hors vocabulaire fait tomber la LIGNE, compté `badWhen`, jamais replié sur « tous les jours »", () => {
  const out = read({
    notes: [
      { text: "danse le mardi", member_id: ZOE, when: { weekday: "mardi" } },
      { text: "goûter", member_id: ZOE, when: { slot: "goûter" } },
      { text: "rien dedans", member_id: ZOE, when: {} },
      { text: "un fait", member_id: ZOE, when: null },
    ],
  });
  assertEquals(out.classification.notes.refused.badWhen, 3);
  assertEquals(out.classification.notes.kept, 1);
  assertEquals(out.classification.refused.badWhen, 3);
});

Deno.test("⛔ PORTE ③ — une entrée qui n'est pas un objet est `malformed`", () => {
  const out = read({ notes: ["danse le mardi", 42, null] });
  assertEquals(out.classification.notes.refused.malformed, 3);
});

Deno.test("CE QUE LE MODÈLE A LU ET N'A PAS RANGÉ — compté par motif, et un motif inconnu à part", () => {
  const out = read({
    skipped: [{ why: "degree" }, { why: "degree" }, { why: "setting" }, { why: "meal_story" }, { why: "other" }, { why: "mood" }, "pas un objet"],
  });
  const s = out.classification.skipped;
  assertEquals(s.degree, 2);
  assertEquals(s.setting, 1);
  assertEquals(s.mealStory, 1);
  assertEquals(s.other, 1);
  assertEquals(s.unknown, 2);
  assertEquals(s.total, 7);
  assertEquals(out.classification.kept, 0);
});

Deno.test("les CINQ listes vides sont une réponse correcte; une liste ABSENTE est comptée", () => {
  // ⟳ 2026-09-04 — CINQ, ET PAS QUATRE. `clarify` est une liste comme les
  // autres: une clé absente veut dire que le modèle a lu le prompt de travers,
  // et se compte à part d'un vide. Ne pas l'ajouter ici aurait rendu
  // `listsMissing` non vide sur TOUTES les charges valides — c'est-à-dire un
  // signal permanent, donc un signal mort.
  const empty = read({
    preferences: [],
    notes: [],
    next_plan: [],
    skipped: [],
    clarify: [],
  });
  assert(empty.ok);
  assertEquals(empty.classification.listsMissing, []);
  assertEquals(empty.classification.proposed, 0);
  const partial = read({ preferences: [] });
  assert(partial.ok);
  assertEquals(partial.classification.listsMissing, [
    "notes",
    "next_plan",
    "skipped",
    "clarify",
  ]);
});

Deno.test("⛔ une charge SANS AUCUNE des listes est illisible — l'ancienne forme `items` aussi", () => {
  for (const raw of [{}, { items: [] }, { items: [{ kind: "craving", text: "x" }] }, "pas du json", 42, null, []]) {
    const out = read(raw as Record<string, unknown>, { raw });
    assertEquals(out.ok, false, JSON.stringify(raw));
    assertEquals(out.refusal, "unreadable_payload");
    assertEquals(out.classification.proposed, 0);
  }
});

Deno.test("une charge rendue en CHAÎNE JSON est lue", () => {
  const out = read({}, { raw: JSON.stringify({ preferences: [{ kind: "food.exclude", text: "pas de poisson", member_id: null }], notes: [], next_plan: [], skipped: [] }) });
  assert(out.ok);
  assertEquals(out.classification.preferences.kept, 1);
});

Deno.test("⛔ un jour ou une semaine illisibles sont des REFUS, jamais un repli sur aujourd'hui", () => {
  assertEquals(read({ preferences: [] }, { today: "mardi" }).refusal, "bad_day");
  assertEquals(read({ preferences: [] }, { targetWeek: "" }).refusal, "bad_anchor");
  assertEquals(read({ preferences: [] }, { targetWeek: "2026-8-19" }).refusal, "bad_anchor");
});

Deno.test("LES TROIS PORTES SONT DISJOINTES: la même phrase rangée deux fois compte deux fois, et ça se voit", () => {
  // Le prompt dit « never in two ». Le parseur ne dédoublonne PAS entre portes:
  // ce serait cacher un modèle qui range en double. Le port (`retained_items_io`)
  // refuse le doublon PAR MAGASIN; entre magasins, c'est le compteur qui le dit.
  const out = read({
    preferences: [{ kind: "food.exclude", text: "pas de poisson", member_id: null }],
    next_plan: [{ kind: "food.exclude", text: "pas de poisson", member_id: null }],
  });
  assertEquals(out.classification.preferences.kept, 1);
  assertEquals(out.classification.nextPlan.kept, 1);
  assertEquals(out.classification.kept, 2);
});

Deno.test("LE COMPTEUR PAR PORTE se lit d'un bloc, et les agrégats sont des sommes", () => {
  const out = read({
    preferences: [
      { kind: "portion.adjust", text: "moins", member_id: null },
      { kind: "food.exclude", text: "pas de poisson", member_id: null },
    ],
    notes: [{ text: "danse", member_id: STRANGER, when: null }],
    next_plan: [{ kind: "craving", text: "", member_id: null }],
    skipped: [{ why: "degree" }],
    clarify: [],
  });
  const t = draftNoteClassifyTrace(out.classification);
  assertEquals(t.pref_proposed, 2);
  assertEquals(t.pref_kept, 1);
  assertEquals(t.pref_refused_forbidden_kind, 1);
  assertEquals(t.notes_proposed, 1);
  assertEquals(t.notes_refused_unknown_member, 1);
  assertEquals(t.next_proposed, 1);
  assertEquals(t.next_refused_bad_text, 1);
  assertEquals(t.skipped_degree, 1);
  assertEquals(t.proposed, 4);
  assertEquals(t.kept, 1);
  assertEquals(t.refused, 3);
  assertEquals(t.refused_forbidden_kinds, ["portion.adjust"]);
  assertEquals(t.lists_missing, []);
});

// ===========================================================================
// ④ L'I/O — le modèle RÉELLEMENT demandé, et la porte RÉELLEMENT appelée
// ===========================================================================

interface Trace {
  rpcs: Array<{ name: string; params: Record<string, unknown> }>;
  models: string[];
}

function fakeAdmin(trace: Trace, constraints: Record<string, unknown> | null = null) {
  return {
    from: (_table: string) => ({
      select: (_col: string) => ({
        eq: (_c: string, _v: unknown) => ({
          maybeSingle: () =>
            Promise.resolve({
              data: { practical_constraints: constraints },
              error: null,
            }),
        }),
      }),
    }),
    rpc: (name: string, params: Record<string, unknown>) => {
      trace.rpcs.push({ name, params });
      return Promise.resolve({ data: { ok: true }, error: null });
    },
  };
}

function runnerReturning(lists: Record<string, unknown>, trace: Trace) {
  return (_s: string, _u: string, meta: { model: string }) => {
    trace.models.push(meta.model);
    return Promise.resolve(lists);
  };
}

const FULL_LISTS = {
  preferences: [{ kind: "food.exclude", text: "pas de poisson", member_id: null }],
  notes: [{ text: "on mange tard le vendredi", member_id: null, when: { weekday: "fri", slot: "dinner" } }],
  next_plan: [{ kind: "craving", text: "des fajitas", member_id: null }],
  skipped: [],
};

Deno.test("⛔ `keelGenerationModel()` est RÉELLEMENT APPELÉ — la sentinelle le prouve", async () => {
  const previous = Deno.env.get("KEEL_GENERATION_MODEL");
  const SENTINEL = "sentinel-model-2b-draft-note";
  Deno.env.set("KEEL_GENERATION_MODEL", SENTINEL);
  try {
    const trace: Trace = { rpcs: [], models: [] };
    const res = await classifyAndPersistDraftNote({
      admin: fakeAdmin(trace),
      userId: USER,
      note: usable(),
      today: TODAY,
      targetWeek: PLAN_STARTS_ON,
      members: [],
      contentLocale: "fr-FR",
      planFoods: PLAN_FOODS,
      source: "draft_note",
      now: NOW,
      run: runnerReturning(FULL_LISTS, trace),
    });
    assertEquals(res.model, SENTINEL);
    assertEquals(trace.models, [SENTINEL]);
  } finally {
    if (previous === undefined) Deno.env.delete("KEEL_GENERATION_MODEL");
    else Deno.env.set("KEEL_GENERATION_MODEL", previous);
  }
});

Deno.test("sans surcharge, c'est le modèle de COMPOSITION, pas celui du chat", async () => {
  const previous = Deno.env.get("KEEL_GENERATION_MODEL");
  Deno.env.delete("KEEL_GENERATION_MODEL");
  try {
    const trace: Trace = { rpcs: [], models: [] };
    const res = await classifyAndPersistDraftNote({
      admin: fakeAdmin(trace),
      userId: USER,
      note: usable(),
      today: TODAY,
      targetWeek: PLAN_STARTS_ON,
      members: [],
      contentLocale: "fr-FR",
      planFoods: PLAN_FOODS,
      source: "draft_note",
      run: runnerReturning(FULL_LISTS, trace),
    });
    assertEquals(res.model, KEEL_GENERATION_MODEL_DEFAULT);
  } finally {
    if (previous !== undefined) Deno.env.set("KEEL_GENERATION_MODEL", previous);
  }
});

Deno.test("⛔ la porte est appelée UNE fois, avec `producer: draft_note` et LES TROIS LISTES", async () => {
  const trace: Trace = { rpcs: [], models: [] };
  const res = await classifyAndPersistDraftNote({
    admin: fakeAdmin(trace, {}),
    userId: USER,
    note: usable(),
    today: TODAY,
    targetWeek: PLAN_STARTS_ON,
    members: [],
    contentLocale: "fr-FR",
    planFoods: PLAN_FOODS,
    source: "draft_note",
    now: NOW,
    run: runnerReturning(FULL_LISTS, trace),
  });
  assertEquals(res.ok, true);
  assertEquals(res.reason, "written");
  // ⟳ 2026-09-04 — ON COMPTE LES APPELS À LA PORTE, plus les RPC en général.
  // Le module en déclenche maintenant d'autres après l'écriture (la bulle
  // « j'ai noté … » passe par le canal de chat, qui a les siens), et compter
  // tout ferait rougir ce test pour une raison qui n'est PAS la sienne: sa
  // propriété est « la porte est appelée UNE fois », pas « rien d'autre ne
  // parle à la base ».
  const writes = trace.rpcs.filter((r) => r.name === "keel_write_retained_items_for");
  assertEquals(writes.length, 1);
  const params = writes[0].params;
  const items = params.p_items as Array<Record<string, unknown>>;
  assertEquals(items.length, 1);
  assertEquals(items[0].source, "draft_note");
  assertEquals(items[0].scope, "durable");
  const next = params.p_next as Array<Record<string, unknown>>;
  assertEquals(next.length, 1);
  assertEquals(next[0].anchor, ANCHOR);
  assertEquals(next[0].written_at, NOW);
  const memo = params.p_memo as Array<Record<string, unknown>>;
  assertEquals(memo.length, 1);
  assertEquals(memo[0].subject, "household");
  assertEquals(memo[0].when, { weekday: "fri", slot: "dinner" });
  assertEquals(res.write?.durableWritten, 1);
  assertEquals(res.write?.nextPlanWritten, 1);
  assertEquals(res.write?.memoWritten, 1);
});

Deno.test("⛔ ce que la matrice refuse N'ATTEINT PAS la porte — et un `nothing_to_file` porte ses `skipped_*`", async () => {
  const trace: Trace = { rpcs: [], models: [] };
  const res = await classifyAndPersistDraftNote({
    admin: fakeAdmin(trace, {}),
    userId: USER,
    note: usable("Les parts sont beaucoup trop grosses"),
    today: TODAY,
    targetWeek: PLAN_STARTS_ON,
    members: [],
    contentLocale: "fr-FR",
    planFoods: PLAN_FOODS,
    source: "draft_note",
    run: runnerReturning({
      preferences: [{ kind: "portion.adjust", text: "trop grosses", member_id: null, value: { direction: "down", magnitude: "clear" } }],
      notes: [],
      next_plan: [],
      skipped: [{ why: "degree" }],
    }, trace),
  });
  assertEquals(res.ok, false);
  assertEquals(res.reason, "nothing_to_file");
  assertEquals(trace.rpcs.length, 0, "la porte a été appelée pour ne rien écrire");
  assertEquals(res.classification.skipped.degree, 1);
  assertEquals(res.classification.preferences.refused.forbiddenKinds, ["portion.adjust"]);
});

Deno.test("une note refusée par la garde d'entrée ne déclenche AUCUN appel", async () => {
  const trace: Trace = { rpcs: [], models: [] };
  const res = await classifyAndPersistDraftNote({
    admin: fakeAdmin(trace),
    userId: USER,
    note: { usable: null, refusal: "forbidden", dropped: [] } as unknown as DraftNoteVerdict,
    today: TODAY,
    targetWeek: PLAN_STARTS_ON,
    members: [],
    contentLocale: "fr-FR",
    planFoods: PLAN_FOODS,
    source: "draft_note",
    run: runnerReturning(FULL_LISTS, trace),
  });
  assertEquals(res.reason, "no_note");
  assertEquals(trace.models, []);
  assertEquals(trace.rpcs, []);
});

Deno.test("⛔ un appel modèle en panne est NOMMÉ et COMPTÉ, jamais avalé", async () => {
  const trace: Trace = { rpcs: [], models: [] };
  const res = await classifyAndPersistDraftNote({
    admin: fakeAdmin(trace),
    userId: USER,
    note: usable(),
    today: TODAY,
    targetWeek: PLAN_STARTS_ON,
    members: [],
    contentLocale: "fr-FR",
    planFoods: PLAN_FOODS,
    source: "draft_note",
    run: () => Promise.reject(new Error("quota")),
  });
  assertEquals(res.ok, false);
  assertEquals(res.reason, "model_unavailable");
  assertEquals(trace.rpcs, []);
});

Deno.test("l'ancienne forme `{ items }` rendue par un modèle est `unreadable_payload`, pas un produit calme", async () => {
  const trace: Trace = { rpcs: [], models: [] };
  const res = await classifyAndPersistDraftNote({
    admin: fakeAdmin(trace),
    userId: USER,
    note: usable(),
    today: TODAY,
    targetWeek: PLAN_STARTS_ON,
    members: [],
    contentLocale: "fr-FR",
    planFoods: PLAN_FOODS,
    source: "draft_note",
    run: runnerReturning({ items: [{ kind: "craving", text: "des fajitas", member_id: null }] }, trace),
  });
  assertEquals(res.reason, "unreadable_payload");
  assertEquals(trace.rpcs, []);
});

Deno.test("`members` absent est un `bad_args`, pas un foyer vide", async () => {
  const trace: Trace = { rpcs: [], models: [] };
  const res = await classifyAndPersistDraftNote({
    admin: fakeAdmin(trace),
    userId: USER,
    note: usable(),
    today: TODAY,
    targetWeek: PLAN_STARTS_ON,
    members: undefined as unknown as DraftNoteMember[],
    contentLocale: "fr-FR",
    planFoods: PLAN_FOODS,
    source: "draft_note",
    run: runnerReturning(FULL_LISTS, trace),
  });
  assertEquals(res.reason, "bad_args");
  assertEquals(trace.models, []);
});

// ===========================================================================
// ⑤ LE CÂBLAGE — la source, deux fois: le vrai fichier, puis la copie amputée
// ===========================================================================

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** LES SIX CHAÎNES QUI DOIVENT ÊTRE DANS `draft_note_classify_io.ts`. */
function wiringVerdict(src: string): string[] {
  const code = stripComments(src);
  const missing: string[] = [];
  if (!/const model = keelGenerationModel\(\);/.test(code)) missing.push("keelGenerationModel_appele");
  if (!/await persistRetainedItemsFor\(\{/.test(code)) missing.push("porte_appelee");
  if (!/producer: DRAFT_NOTE_PRODUCER,/.test(code)) missing.push("producteur_draft_note");
  if (!/durable: classification\.preferences\.items,/.test(code)) missing.push("preferences_passees");
  if (!/nextPlan: classification\.nextPlan\.entries,/.test(code)) missing.push("next_plan_passe");
  if (!/memo: classification\.notes\.lines,/.test(code)) missing.push("notes_passees");
  return missing;
}

async function ioSource(): Promise<string> {
  return await Deno.readTextFile(new URL("draft_note_classify_io.ts", import.meta.url));
}

/** LA MATRICE DANS LE MODULE PUR — et l'interdit de repli. */
function matrixVerdict(src: string): string[] {
  const code = stripComments(src);
  const missing: string[] = [];
  if (!/if \(!canProduce\(DRAFT_NOTE_PRODUCER, kind\) \|\| !allowed\.includes\(kind\)\) \{/.test(code)) {
    missing.push("canProduce_arme");
  }
  if (/\?\?\s*"next_plan"/.test(code)) missing.push("repli_next_plan_interdit");
  if (/\?\?\s*"durable"/.test(code)) missing.push("repli_durable_interdit");
  if (/\?\?\s*HOUSEHOLD_SUBJECT/.test(code)) missing.push("repli_household_interdit");
  return missing;
}

async function pureSource(): Promise<string> {
  return await Deno.readTextFile(new URL("draft_note_classify.ts", import.meta.url));
}

Deno.test("MATRICE ① — la ceinture est là, et AUCUN repli (le cas qui passe)", async () => {
  assertEquals(matrixVerdict(await pureSource()), []);
});

Deno.test("MATRICE ② — couper la ceinture ou ajouter un repli fait ROUGIR", async () => {
  const real = await pureSource();
  const cut = real.replace(
    "if (!canProduce(DRAFT_NOTE_PRODUCER, kind) || !allowed.includes(kind)) {",
    "if (false) {",
  );
  assertNotEquals(cut, real);
  assertEquals(matrixVerdict(cut), ["canProduce_arme"]);
  for (const [name, fallback] of [
    ["repli_next_plan_interdit", 'const scope2 = null ?? "next_plan";'],
    ["repli_durable_interdit", 'const scope2 = null ?? "durable";'],
    ["repli_household_interdit", "const subject2 = null ?? HOUSEHOLD_SUBJECT;"],
  ] as const) {
    const withFallback = real.replace("const writtenAt = parseIsoInstant(args.writtenAt);", `const writtenAt = parseIsoInstant(args.writtenAt);\n  ${fallback}`);
    assertNotEquals(withFallback, real);
    assertEquals(matrixVerdict(withFallback), [name]);
  }
});

Deno.test("CÂBLAGE ① — le VRAI fichier est câblé (le cas qui passe)", async () => {
  assertEquals(wiringVerdict(await ioSource()), []);
});

Deno.test("CÂBLAGE ② — chaque moitié retirée fait ROUGIR l'assertion", async () => {
  const real = await ioSource();
  const mutations: Array<[string, string, string]> = [
    ["keelGenerationModel_appele", "const model = keelGenerationModel();", 'const model = "gpt-5.6-sol";'],
    ["porte_appelee", "await persistRetainedItemsFor({", "await Promise.resolve({ ok: true } as any) && ({"],
    ["producteur_draft_note", "producer: DRAFT_NOTE_PRODUCER,", 'producer: "written" as any,'],
    ["preferences_passees", "durable: classification.preferences.items,", "durable: [],"],
    ["next_plan_passe", "nextPlan: classification.nextPlan.entries,", "nextPlan: [],"],
    ["notes_passees", "memo: classification.notes.lines,", "memo: [],"],
  ];
  for (const [name, from, to] of mutations) {
    assert(real.includes(from), `la chaîne « ${from} » n'existe plus: l'assertion ne cherche plus rien.`);
    const mutated = real.replace(from, to);
    assertNotEquals(mutated, real, `la mutation « ${name} » n'a rien changé.`);
    assertEquals(wiringVerdict(mutated), [name], `la mutation « ${name} » n'a PAS fait rougir l'assertion.`);
  }
});

Deno.test("CÂBLAGE ③ — un commentaire ne câble rien", async () => {
  const real = await ioSource();
  const mutated = real.replace(
    "const model = keelGenerationModel();",
    '// const model = keelGenerationModel();\n  const model = "gpt-5.6-sol";',
  );
  assertEquals(wiringVerdict(mutated), ["keelGenerationModel_appele"]);
});

// ===========================================================================
// ⑥ LA PARENTÉ — « mon fils » n'est pas un cas limite, c'est la forme normale
// ===========================================================================

function mouth(over: Partial<DraftNoteMember> = {}): DraftNoteMember {
  return { memberId: "11111111-2222-4333-8444-555555555555", label: "Tom", ageState: "minor", sex: "male", ...over };
}

Deno.test("⛔ LE ROSTER PORTE L'ÂGE ET LE SEXE — sans eux, aucune parenté n'est résoluble", () => {
  const prompt = buildDraftNoteClassifyPrompt({
    note: "Mon fils n'aime pas le poisson",
    contentLocale: "fr-FR",
    planFoods: PLAN_FOODS,
    members: [mouth(), mouth({ memberId: "22222222-2222-4333-8444-555555555555", label: "Léa", sex: "female" })],
  });
  assert(prompt.includes('"age":"minor"'));
  assert(prompt.includes('"sex":"male"'));
  assert(prompt.includes('"sex":"female"'));
});

Deno.test("⛔ LES CLÉS SONT ÉCRITES MÊME À `null` — « on ne sait pas » ≠ « rien à savoir »", () => {
  const prompt = buildDraftNoteClassifyPrompt({
    note: "Mon fils n'aime pas le poisson",
    contentLocale: "fr-FR",
    planFoods: PLAN_FOODS,
    members: [mouth({ ageState: null, sex: null })],
  });
  assert(prompt.includes('"age":null'));
  assert(prompt.includes('"sex":null'));
});

Deno.test("LE CÂBLAGE — la lane foyer passe l'âge et le sexe, et PAS `ageBand`", async () => {
  const src = await Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  assert(/sex: m\.body\?\.gender \?\? null/.test(src), "la lane foyer ne passe plus le sexe");
  assert(/ageState: m\.ageState === "adult"/.test(src), "la lane foyer ne passe plus l'état d'âge");
  assert(!/ageState: m\.ageBand/.test(src), "la lane passe une BANDE d'âge: elle vaut `null` pour tout mineur");
});

// ===========================================================================
// ⑤ LA PORTE QUI NE RANGE RIEN — « je n'ai pas su de qui, ni de quoi »
//
// ── LE DÉFAUT QU'ELLE FERME ───────────────────────────────────────────────
// Avant elle, une entrée dont le sujet était ambigu était JETÉE, et aucun motif
// de rejet ne le disait: `skipped` n'a que `degree | setting | meal_story |
// other`. L'ambiguïté était donc soit invisible, soit rangée avec les
// remerciements — et rien ne pouvait relancer la personne.
//
// ⚠️ CETTE PORTE N'ÉCRIT RIEN, ET C'EST SA DÉFINITION. Ce qu'elle garde est une
// question à poser; sans réponse, l'entrée n'existera jamais. Les tests
// ci-dessous vérifient donc DEUX choses à chaque fois: ce qui entre dans
// `clarify`, et ce qui n'entre nulle part ailleurs.
// ===========================================================================

/** Une entrée de la porte ⑤, dans la forme que le prompt demande au modèle. */
function clarifyRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    about: "who",
    gate: "preferences",
    entry: { kind: "food.exclude", text: "poisson", member_id: null },
    options: [ZOE, MARC],
    ...over,
  };
}

Deno.test("⑤ le cas qui passe — une question QUI, et RIEN de rangé", () => {
  const out = read({ preferences: [], notes: [], next_plan: [], skipped: [], clarify: [clarifyRow()] });
  assert(out.ok);
  const c = out.classification;
  assertEquals(c.clarify.proposed, 1);
  assertEquals(c.clarify.kept, 1);
  assertEquals(c.clarify.who, 1);
  assertEquals(c.clarify.what, 0);
  // ⛔ NULLE PART AILLEURS. Une entrée qui serait à la fois en attente ET rangée
  // ferait écrire deux fois la même chose — une fois tout de suite avec un sujet
  // deviné, une fois au tap avec le bon.
  assertEquals(c.preferences.kept, 0);
  assertEquals(c.notes.kept, 0);
  assertEquals(c.nextPlan.kept, 0);
  assertEquals(c.skipped.total, 0);
  const entry = c.clarify.entries[0];
  assertEquals(entry.about, "who");
  assertEquals(entry.gate, "preferences");
  assertEquals(entry.kind, "food.exclude");
  assertEquals(entry.text, "poisson");
  // Le sujet est `null`: c'est exactement ce qu'on demande.
  assertEquals(entry.subject, null);
  assertEquals(entry.options, [ZOE, MARC]);
});

Deno.test("⑤ une question QUOI n'accepte que des aliments DU PLAN", () => {
  const ok = read({
    clarify: [clarifyRow({
      about: "what",
      entry: { kind: "food.exclude", text: "la viande", member_id: null },
      options: ["poulet rôti", "steak haché"],
    })],
  });
  assert(ok.ok);
  assertEquals(ok.classification.clarify.kept, 1);
  assertEquals(ok.classification.clarify.what, 1);
  // Sur un `what`, le sujet de la note est CONNU et il est gardé: on ne demande
  // qu'une chose à la fois.
  assertEquals(ok.classification.clarify.entries[0].subject, "household");

  // ⛔ UN ALIMENT HORS DU PLAN EST UN REFUS, jamais une option. Le tap ne peut
  // désigner que ce que le runtime a proposé; une option inventée par le modèle
  // serait une exclusion écrite sur un mot que personne n'a lu.
  const invented = read({
    clarify: [clarifyRow({
      about: "what",
      entry: { kind: "food.exclude", text: "la viande", member_id: null },
      options: ["poulet rôti", "sanglier"],
    })],
  });
  assert(invented.ok);
  assertEquals(invented.classification.clarify.kept, 0);
  assertEquals(invented.classification.clarify.refused.badOptions, 1);
});

Deno.test("⑤ sans aliments du plan, une question QUOI est impossible", () => {
  // ⚠️ LE CAS D'UNE LANE SANS PLAT, ou d'un plan illisible. Le prompt le dit au
  // modèle; la relecture le tient quand même — une consigne de prompt régresse,
  // c'est écrit dans ce dépôt.
  const out = read(
    {
      clarify: [clarifyRow({
        about: "what",
        entry: { kind: "food.exclude", text: "la viande", member_id: null },
        options: ["poulet rôti"],
      })],
    },
    { planFoods: [] },
  );
  assert(out.ok);
  assertEquals(out.classification.clarify.kept, 0);
  assertEquals(out.classification.clarify.refused.badOptions, 1);
});

Deno.test("⑤ un candidat hors du rôle est un REFUS, jamais un sujet", () => {
  const out = read({ clarify: [clarifyRow({ options: [ZOE, STRANGER] })] });
  assert(out.ok);
  assertEquals(out.classification.clarify.kept, 0);
  assertEquals(out.classification.clarify.refused.badOptions, 1);
});

Deno.test("⑤ zéro option, cinq options, un doublon: trois refus", () => {
  for (
    const options of [
      [],
      [ZOE, MARC, ZOE],
      [ZOE, MARC, ZOE, MARC, ZOE],
    ]
  ) {
    const out = read({ clarify: [clarifyRow({ options })] });
    assert(out.ok);
    assertEquals(
      out.classification.clarify.refused.badOptions,
      1,
      JSON.stringify(options),
    );
    assertEquals(out.classification.clarify.kept, 0);
  }
});

Deno.test("⑤ quatre options passent — la borne haute est atteignable", () => {
  // Sans ce cas, le refus du dessus serait vrai d'un lecteur qui refuse TOUT.
  const out = read({
    clarify: [clarifyRow({
      about: "what",
      entry: { kind: "food.exclude", text: "la viande", member_id: null },
      options: ["poulet rôti", "steak haché", "riz", "brocolis"],
    })],
  });
  assert(out.ok);
  assertEquals(out.classification.clarify.kept, 1);
});

Deno.test("⑤ `about` et `gate` hors liste ont chacun leur motif", () => {
  const badAbout = read({ clarify: [clarifyRow({ about: "when" })] });
  assertEquals(badAbout.classification.clarify.refused.badAbout, 1);
  assertEquals(badAbout.classification.clarify.refused.badGate, 0);

  const badGate = read({ clarify: [clarifyRow({ gate: "safety" })] });
  assertEquals(badGate.classification.clarify.refused.badGate, 1);
  assertEquals(badGate.classification.clarify.refused.badAbout, 0);
});

Deno.test("⑤ demander QUI alors qu'on le sait déjà est refusé", () => {
  // ⛔ UNE QUESTION DONT ON A LA RÉPONSE FAIT DOUTER DE TOUTES LES AUTRES.
  const out = read({
    clarify: [clarifyRow({
      entry: { kind: "food.exclude", text: "poisson", member_id: ZOE },
    })],
  });
  assert(out.ok);
  assertEquals(out.classification.clarify.kept, 0);
  assertEquals(out.classification.clarify.refused.badOptions, 1);
});

Deno.test("⑤ la matrice vaut ici aussi — une famille interdite ne s'attend pas", () => {
  // Ce que `draft_note` ne peut pas ranger, il ne peut pas non plus le mettre
  // en attente: la question serait posée pour une écriture qui serait refusée
  // au tap.
  const out = read({
    clarify: [clarifyRow({
      entry: { kind: "portion.adjust", text: "trop gros", member_id: null },
    })],
  });
  assert(out.ok);
  assertEquals(out.classification.clarify.kept, 0);
  assertEquals(out.classification.clarify.refused.forbiddenKind, 1);
  assertEquals(out.classification.clarify.refused.forbiddenKinds, ["portion.adjust"]);
});

Deno.test("⑤ une note en attente garde son moment", () => {
  const out = read({
    clarify: [clarifyRow({
      gate: "notes",
      entry: {
        text: "danse le mardi soir",
        member_id: null,
        when: { weekday: "tue", slot: "dinner" },
      },
    })],
  });
  assert(out.ok);
  assertEquals(out.classification.clarify.kept, 1);
  const entry = out.classification.clarify.entries[0];
  assertEquals(entry.kind, null);
  assertEquals(entry.when, { weekday: "tue", slot: "dinner" });
});

Deno.test("⑤ un moment illisible est un refus NOMMÉ, pas un moment perdu", () => {
  const out = read({
    clarify: [clarifyRow({
      gate: "notes",
      entry: {
        text: "danse",
        member_id: null,
        when: { weekday: "mardi", slot: "dinner" },
      },
    })],
  });
  assert(out.ok);
  assertEquals(out.classification.clarify.kept, 0);
  assertEquals(out.classification.clarify.refused.badWhen, 1);
});

Deno.test("⑤ les compteurs entrent dans la trace, et dans les agrégats", () => {
  const out = read({
    preferences: [],
    notes: [],
    next_plan: [],
    skipped: [],
    clarify: [clarifyRow(), clarifyRow({ about: "when" })],
  });
  const t = draftNoteClassifyTrace(out.classification);
  assertEquals(t.clarify_proposed, 2);
  assertEquals(t.clarify_kept, 1);
  assertEquals(t.clarify_who, 1);
  assertEquals(t.clarify_what, 0);
  assertEquals(t.clarify_refused_bad_about, 1);
  // Les agrégats sont des SOMMES: une porte qui compterait à part serait une
  // porte dont les refus n'apparaissent nulle part.
  assertEquals(t.proposed, 2);
  assertEquals(t.kept, 1);
  assertEquals(t.refused, 1);
  assertEquals(t.refused_bad_about, 1);
});

Deno.test("⑤ la classification VIDE porte les compteurs à zéro", () => {
  // « Champ déclaré = compteur obligatoire »: un champ absent du vide ferait
  // rendre `undefined` à la trace, et un `undefined` dans un journal se lit
  // comme un zéro sans en être un.
  const t = draftNoteClassifyTrace(EMPTY_DRAFT_NOTE_CLASSIFICATION);
  assertEquals(t.clarify_proposed, 0);
  assertEquals(t.clarify_kept, 0);
  assertEquals(t.clarify_who, 0);
  assertEquals(t.clarify_what, 0);
  assertEquals(t.clarify_refused_bad_options, 0);
  assertEquals(t.clarify_refused_bad_about, 0);
  assertEquals(t.clarify_refused_bad_gate, 0);
});

// ---------------------------------------------------------------------------
// Le prompt — la promesse est SUR la clé, et l'ancienne consigne est partie
// ---------------------------------------------------------------------------

Deno.test("⑤ le schéma porte les SIX clés, dans l'ordre", () => {
  const line = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT.split("\n").find((l) =>
    l.startsWith('{ "preferences"')
  );
  assert(line, "la ligne de schéma a disparu");
  for (const key of ["preferences", "next_plan", "notes", "skipped", "clarify", "safety"]) {
    assert(line.includes(`"${key}"`), `le schéma ne porte pas ${key}`);
  }
});

Deno.test("⑤ l'ancienne consigne « file NOTHING » a disparu du prompt", () => {
  // ⛔ SI ELLE RESTAIT, LE MODÈLE AURAIT DEUX CONSIGNES CONTRAIRES sur le même
  // cas: jeter l'entrée, et la mettre en attente. C'est la forme la plus chère
  // d'un prompt cassé — il obéit à l'une des deux, au hasard.
  assert(!DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT.includes("file NOTHING"));
});

Deno.test("⑤ la règle QUI nomme `clarify` À CÔTÉ de son cas", () => {
  // Une consigne séparée de sa clé par trois paragraphes n'est pas lue: c'est
  // la règle d'adjacence que ce fichier tient déjà pour les autres portes.
  const p = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT;
  const twoFit = p.indexOf("IF TWO PEOPLE FIT");
  const clarify = p.indexOf('"clarify"', twoFit);
  assert(twoFit >= 0, "la règle des deux candidats a disparu");
  assert(clarify - twoFit < 300, "`clarify` est trop loin de son cas");
});

Deno.test("⑤ UN PLURIEL N'EST PAS UNE AMBIGUÏTÉ — la règle, et sa place", () => {
  // ── LE CAS MESURÉ QUI A FAIT NAÎTRE CETTE RÈGLE ───────────────────────
  // Banc du 2026-09-04, cas D3: « Les petites ne mangent pas de champignons. »
  // dans un foyer à deux filles. Le modèle a posé la question « c'est pour
  // qui ? » avec {Léa, Zoé} — et cette question NE PEUT PAS avoir de bonne
  // réponse: en taper une jette l'autre. La phrase nommait les DEUX.
  //
  // ⛔ ET LA RÈGLE D'AVANT LE DISAIT ELLE-MÊME: elle donnait « the kids » en
  // exemple de mot à résoudre, puis exigeait qu'EXACTEMENT UNE personne
  // corresponde — ce qui ne peut jamais arriver pour un pluriel. Elle
  // envoyait donc mécaniquement tous les pluriels vers `clarify`.
  const p = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT;
  const plural = p.indexOf("A PLURAL IS NOT AN AMBIGUITY");
  assert(plural >= 0, "la règle du pluriel a disparu du prompt");

  // Elle nomme ce qu'il faut FAIRE, pas seulement ce qu'il ne faut pas.
  assert(
    /ONE ENTRY PER PERSON/.test(p.slice(plural, plural + 700)),
    "la règle du pluriel ne dit pas d'écrire une ligne PAR personne",
  );
  // Et elle interdit les deux replis qui la trahissent.
  const body = p.slice(plural, plural + 700);
  assert(/member_id: null/.test(body), "elle n'interdit pas le repli sur la table");
  assert(/NEVER "clarify"/.test(body), "elle n'interdit pas la question");

  // ── ADJACENCE: elle doit être AVANT la règle des deux candidats ────────
  // ⚠️ L'ORDRE EST LA MOITIÉ QUI COMPTE. « si deux personnes correspondent,
  // demande » lue en premier avale le pluriel avant que l'exception n'arrive.
  const twoFit = p.indexOf("IF TWO PEOPLE FIT");
  assert(twoFit >= 0, "la règle des deux candidats a disparu");
  assert(
    plural < twoFit,
    "LE PLURIEL EST DÉCLARÉ APRÈS LA RÈGLE QUI L'AVALE. Un modèle applique la " +
      "première consigne qui colle: « deux personnes correspondent » colle à " +
      "« les petites », et l'exception arrive trop tard.",
  );

  // ── ET LA SUITE DIT EXPLICITEMENT QUE L'AMBIGUÏTÉ EST *SINGULIÈRE* ─────
  assert(
    /SINGULAR word that fits more than one person/.test(p),
    "rien ne dit que l'ambiguïté vise un mot SINGULIER — sans ça, les deux " +
      "règles se contredisent et le modèle en choisit une au hasard.",
  );
});

Deno.test("⑤ la règle QUOI interdit de deviner un aliment nommé", () => {
  const p = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT;
  assert(p.includes("WHAT — on the same three drawers"));
  // La moitié qui empêche la question de tout avaler: un aliment nommé se range,
  // il ne se demande pas.
  assert(p.includes("never a \"what\""));
});

Deno.test("⑤ `skipped` renvoie vers `clarify`, il ne l'absorbe pas", () => {
  assert(
    DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT.includes(
      'NEVER use "skipped" for something you could not attribute',
    ),
  );
});

Deno.test("⑤ le tour utilisateur dit les aliments — et dit quand il n'y en a pas", () => {
  const withFoods = buildDraftNoteClassifyPrompt({
    note: NOTE,
    contentLocale: "fr-FR",
    members: MEMBERS,
    planFoods: PLAN_FOODS,
  });
  assert(withFoods.includes("poulet rôti"));
  const without = buildDraftNoteClassifyPrompt({
    note: NOTE,
    contentLocale: "fr-FR",
    members: MEMBERS,
    planFoods: [],
  });
  // ⚠️ DIT, PAS OMIS. Une liste absente laisserait le modèle supposer qu'il
  // existe des plats qu'on ne lui a pas donnés.
  assert(without.includes("not available"));
  assert(without.includes('Never use "about": "what"'));
});

Deno.test("⑤ la ligne de schéma périmée du bloc sécurité est partie", () => {
  // Elle disait `{ "items": [...], "safety": [...] }` — la forme d'avant le lot
  // A. Deux lignes de schéma contradictoires dans le même prompt, dont une
  // fausse: le modèle en suit une, et personne ne sait laquelle.
  assert(!DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT.includes('{ "items": ['));
});


// ===========================================================================
// ⑤ ⟳ 2026-09-05 — LA PORTÉE D'UNE RÈGLE DE RÉGIME
//
// « On mange végétarien » sans plus: toujours (⇒ sécurité, stricte, qui
// gouverne tout le foyer) ou parfois (⇒ une note) ? La relecture ne devine
// pas: elle garde la déclaration EN ATTENTE, impose les deux jetons, et
// range l'entrée nulle part ailleurs.
// ===========================================================================

function scopeRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    about: "scope",
    gate: "notes",
    entry: { text: "on mange végétarien", member_id: null, when: null },
    safety: { kind: "diet", ref: "vegetarian", member_id: null, text: "On mange végétarien." },
    options: ["always", "sometimes"],
    ...over,
  };
}

Deno.test("⑤ PORTÉE — le cas qui passe: en attente, avec sa déclaration, et RIEN de rangé", () => {
  const out = read({ preferences: [], notes: [], next_plan: [], skipped: [], safety: [], clarify: [scopeRow()] });
  assert(out.ok);
  const c = out.classification;
  assertEquals(c.clarify.kept, 1);
  assertEquals(c.clarify.scope, 1);
  assertEquals(c.clarify.who, 0);
  assertEquals(c.preferences.kept, 0);
  assertEquals(c.notes.kept, 0);
  const entry = c.clarify.entries[0];
  assertEquals(entry.about, "scope");
  assertEquals(entry.gate, "notes");
  assertEquals(entry.kind, null);
  assertEquals(entry.subject, "household");
  assertEquals(entry.when, null);
  assertEquals(entry.safety?.kind, "diet");
  assertEquals(entry.safety?.ref, "vegetarian");
  assertEquals(entry.safety?.memberId, null);
  // ⛔ LES OPTIONS SONT IMPOSÉES, jamais celles du modèle.
  assertEquals(entry.options, ["always", "sometimes"]);
});

Deno.test("⑤ PORTÉE — les options du modèle sont IGNORÉES: deux jetons, dans cet ordre", () => {
  const out = read({ clarify: [scopeRow({ options: ["sometimes", "always", "never"] })] });
  assertEquals(out.classification.clarify.entries[0].options, ["always", "sometimes"]);
  const none = read({ clarify: [scopeRow({ options: [] })] });
  assertEquals(none.classification.clarify.kept, 1);
});

Deno.test("⑤ PORTÉE — une bouche nommée: le sujet ET la déclaration la portent", () => {
  const out = read({
    clarify: [scopeRow({
      entry: { text: "elle est plutôt végé", member_id: ZOE, when: null },
      safety: { kind: "diet", ref: "vegetarian", member_id: ZOE, text: "Zoé est plutôt végé" },
    })],
  });
  const entry = out.classification.clarify.entries[0];
  assertEquals(entry.subject, `member:${ZOE}`);
  assertEquals(entry.safety?.memberId, ZOE);
});

Deno.test("⛔ ⑤ PORTÉE — sans déclaration relisable, l'entrée tombe (malformed), jamais devinée", () => {
  const cases: Record<string, unknown>[] = [
    scopeRow({ safety: undefined }),
    scopeRow({ safety: { kind: "dislike", ref: "vegetarian", member_id: null } }),
    scopeRow({ safety: { kind: "diet", ref: "", member_id: null } }),
    scopeRow({ safety: { kind: "diet", ref: "vegetarian", member_id: "99999999-9999-4999-8999-999999999999" } }),
  ];
  for (const row of cases) {
    const out = read({ clarify: [row] });
    assertEquals(out.classification.clarify.kept, 0, JSON.stringify(row.safety));
    assertEquals(out.classification.clarify.refused.malformed, 1);
    assertEquals(out.classification.notes.kept, 0);
  }
});

Deno.test("⛔ ⑤ PORTÉE — une porte autre que la note est refusée (badGate)", () => {
  const out = read({ clarify: [scopeRow({ gate: "preferences", entry: { kind: "food.exclude", text: "viande", member_id: null } })] });
  assertEquals(out.classification.clarify.kept, 0);
  assertEquals(out.classification.clarify.refused.badGate, 1);
});

Deno.test("⑤ PORTÉE — la règle est dans le prompt, À CÔTÉ de la clé `about`, et le bloc sécurité y renvoie", () => {
  const prompt = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT;
  assert(prompt.includes('"about": "scope"'), "la règle SCOPE a quitté le prompt");
  assert(/\["always", "sometimes"\]/.test(prompt), "les deux jetons ne sont plus nommés");
  // Les deux bornes qui ne sont PAS des questions: le rythme (une note avec
  // son `when`) et le régime dit pour de bon (sécurité).
  assert(/NOT ambiguous/.test(prompt));
  // Le bloc sécurité renvoie vers `clarify` sur le même cas — sinon le
  // modèle lit deux consignes contradictoires sur la même phrase.
  assert(/put NOTHING here and nothing in the drawers above: it goes in "clarify" with "about": "scope"/.test(prompt));
  // Et le rythme va dans la note avec son when, plus dans « items ».
  assert(/it goes in "notes" with its "when"/.test(prompt));
  assert(!/it goes in "items"/.test(prompt), "l'ancienne destination « items » est revenue");
});


Deno.test("⑤ PORTÉE — la déclaration DANS `entry` est lue comme celle à côté (premier tir réel)", () => {
  const out = read({
    clarify: [scopeRow({
      safety: undefined,
      entry: { text: "on mange végétarien", member_id: null, when: null, safety: { kind: "diet", ref: "vegetarian", member_id: null, text: "On mange végétarien." } },
    })],
  });
  assertEquals(out.classification.clarify.kept, 1);
  assertEquals(out.classification.clarify.entries[0].safety?.ref, "vegetarian");
});

Deno.test("⛔ ⑤ PORTÉE — une question posée RETIENT le régime que le modèle a aussi mis dans `safety`", () => {
  // Mesuré le 2026-09-05 sur « On mange végétarien. »: question `scope` ET
  // `safety: [{diet, vegetarian}]` dans la même réponse. Sans cette garde, la
  // contrainte stricte de la titulaire est écrite — exactement ce que la
  // question existe pour empêcher.
  const raw = {
    preferences: [], notes: [], next_plan: [], skipped: [],
    clarify: [scopeRow()],
    safety: [
      { kind: "diet", ref: "vegetarian", member_id: null, text: "On mange végétarien." },
      { kind: "allergy", ref: "peanut", member_id: null, text: "allergique aux arachides" },
    ],
  };
  const held = safetyHeldForScope(raw);
  assertEquals([...held], ["vegetarian"]);
  const out = withoutSafetyHeldForScope(raw.safety, held);
  assertEquals(out.held, 1);
  // ⛔ L'ALLERGIE PASSE: aucune question ne porte sur elle, et la retenir
  // serait fail-open sur la santé.
  assertEquals(out.safety?.length, 1);
  assertEquals((out.safety![0] as Record<string, unknown>).kind, "allergy");
});

Deno.test("⛔ ⑤ PORTÉE — la question REFUSÉE (forme fausse) retient quand même la contrainte", () => {
  // Une forme fausse ne doit pas écrire ce que la forme juste retient.
  const raw = {
    clarify: [scopeRow({ gate: "preferences", entry: { kind: "food.exclude", text: "viande", member_id: null } })],
    safety: [{ kind: "diet", ref: "vegetarian", member_id: null }],
  };
  assertEquals(withoutSafetyHeldForScope(raw.safety, safetyHeldForScope(raw)).held, 1);
});

Deno.test("⑤ PORTÉE — sans question de portée, rien n'est retenu ; un autre `ref` non plus", () => {
  assertEquals(safetyHeldForScope({ clarify: [clarifyRow()], safety: [{ kind: "diet", ref: "vegan" }] }).size, 0);
  const held = safetyHeldForScope({ clarify: [scopeRow()] });
  assertEquals(withoutSafetyHeldForScope([{ kind: "diet", ref: "vegan", member_id: null }], held).held, 0);
  assertEquals(withoutSafetyHeldForScope(null, held).safety, null);
});

Deno.test("⑤ PORTÉE — la trace porte `clarify_scope`", () => {
  const out = read({ clarify: [scopeRow()] });
  const trace = draftNoteClassifyTrace(out.classification) as Record<string, unknown>;
  assertEquals(trace.clarify_scope, 1);
});


Deno.test("⑤ PORTÉE — LE TIR RÉEL du 2026-09-05: déclaration dans la liste `safety`, pas dans l'entrée", () => {
  // Réponse brute du modèle, recopiée: la question `scope` sans `safety`, et
  // le régime dans la liste du haut. La relecture prend le candidat au même
  // sujet (seul), la question tient, et la garde retient le régime.
  const raw = {
    preferences: [], notes: [], next_plan: [], skipped: [],
    clarify: [{ about: "scope", gate: "notes", entry: { text: "On mange végétarien.", member_id: null, when: null }, options: ["always", "sometimes"] }],
    safety: [{ kind: "diet", ref: "vegetarian", member_id: null, text: "On mange végétarien." }],
  };
  const out = read(raw);
  assertEquals(out.classification.clarify.kept, 1);
  assertEquals(out.classification.clarify.entries[0].safety?.ref, "vegetarian");
  const held = safetyHeldForScope(raw);
  assertEquals(withoutSafetyHeldForScope(raw.safety, held).held, 1);
});

Deno.test("⛔ ⑤ PORTÉE — deux régimes candidats au même sujet: la question tombe, et les DEUX sont retenus", () => {
  const raw = {
    clarify: [{ about: "scope", gate: "notes", entry: { text: "on est plutôt végé, parfois vegan", member_id: null, when: null }, options: ["always", "sometimes"] }],
    safety: [
      { kind: "diet", ref: "vegetarian", member_id: null },
      { kind: "diet", ref: "vegan", member_id: null },
      { kind: "allergy", ref: "peanut", member_id: null },
    ],
  };
  const out = read(raw);
  assertEquals(out.classification.clarify.kept, 0);
  assertEquals(out.classification.clarify.refused.malformed, 1);
  const filtered = withoutSafetyHeldForScope(raw.safety, safetyHeldForScope(raw));
  assertEquals(filtered.held, 2);
  assertEquals((filtered.safety![0] as Record<string, unknown>).kind, "allergy");
});

Deno.test("⑤ PORTÉE — le candidat de la liste `safety` doit avoir le MÊME sujet que l'entrée", () => {
  // Question sur la table, régime sur Zoé dans la liste: ce n'est pas la même
  // chose, la question tombe et le régime de Zoé s'écrit normalement.
  const raw = {
    clarify: [{ about: "scope", gate: "notes", entry: { text: "on mange végétarien", member_id: null, when: null }, options: ["always", "sometimes"] }],
    safety: [{ kind: "diet", ref: "vegetarian", member_id: ZOE }],
  };
  assertEquals(read(raw).classification.clarify.kept, 0);
  assertEquals(withoutSafetyHeldForScope(raw.safety, safetyHeldForScope(raw)).held, 0);
});


Deno.test("⑤ ⟳ 2026-09-05 — un `when` aux deux clés nulles vaut « pas de moment » (troisième tir réel)", () => {
  const scope = read({ clarify: [scopeRow({ entry: { text: "on mange végétarien", member_id: null, when: { weekday: null, slot: null } } })] });
  assertEquals(scope.classification.clarify.kept, 1);
  assertEquals(scope.classification.clarify.entries[0].when, null);
  // Même règle à la porte ③: le gabarit rempli de `null` n'est pas un moment.
  const note = read({ notes: [{ text: "elle rentre tard", member_id: ZOE, when: { weekday: null, slot: null } }] });
  assertEquals(note.classification.notes.kept, 1);
  assertEquals(note.classification.notes.lines[0].when, null);
  // Un jour illisible reste un refus nommé.
  const bad = read({ notes: [{ text: "elle rentre tard", member_id: ZOE, when: { weekday: "lundi", slot: null } }] });
  assertEquals(bad.classification.notes.refused.badWhen, 1);
});


Deno.test("⛔ ⑤ PORTÉE — une allergie au MÊME ref qu'une question de portée passe quand même (le filtre de kind est exercé)", () => {
  // Relecture croisée du 2026-09-05 (sophia-2-8a): `held` ne porte que des refs
  // de régime, donc retirer `SCOPE_HELD_KINDS` restait vert sur tous les tests.
  // Le seul cas où le filtre travaille est celui où les deux se rejoignent:
  // « on est plutôt sans gluten » (question de portée, ref `gluten`) ET
  // « allergique au gluten » (liste `safety`, allergie, ref `gluten`). Sans le
  // filtre, l'allergie serait RETENUE — fail-open sur la santé.
  const raw = {
    clarify: [scopeRow({
      entry: { text: "on est plutôt sans gluten", member_id: null, when: null },
      safety: { kind: "diet", ref: "gluten", member_id: null, text: "on est plutôt sans gluten" },
    })],
    safety: [{ kind: "allergy", ref: "gluten", member_id: null, text: "allergique au gluten" }],
  };
  const held = safetyHeldForScope(raw);
  assertEquals([...held], ["gluten"]);
  const out = withoutSafetyHeldForScope(raw.safety, held);
  assertEquals(out.held, 0, "l'allergie a été retenue derrière une question de régime");
  assertEquals(out.safety?.length, 1);
  assertEquals((out.safety![0] as Record<string, unknown>).kind, "allergy");
});
