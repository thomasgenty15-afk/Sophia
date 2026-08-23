// LE RETOUR SUR LE BROUILLON, CLASSÉ — lot 2B.
//
// Ce que ces tests existent pour empêcher, dans l'ordre où ça a déjà coûté:
//
//   1. UN LOT DÉSARMÉ QUI RESSEMBLE À UN LOT QUI MARCHE. `kind`, `text`,
//      `member_id` et `value` sont DÉCLARÉS PAR LE MODÈLE: on ne peut pas
//      savoir d'avance à quelle fréquence il les remplit bien, seulement le
//      mesurer. D'où le compteur à trois nombres, et d'où les tests qui
//      épinglent chacun de ses motifs.
//   2. UNE MATRICE ARMÉE SUR UN COFFRE VIDE. Une garde sans cas PASSANT est une
//      garde cassée qui ressemble à une garde qui marche: chaque interdit a ici
//      son cas qui mord ET son voisin qui passe.
//   3. UN MODÈLE IMPORTÉ MAIS JAMAIS APPELÉ. Le générateur de foyer a
//      **importé** `keelGenerationModel` en composant avec le modèle du chat.
//      Le test ci-dessous pose une valeur SENTINELLE dans l'environnement et
//      exige de la retrouver: une constante en dur ne bougerait pas.
//   4. UN MODULE PARFAIT SANS CÂBLAGE. Le lot 1C a livré 22 tests verts sur un
//      module qu'on pouvait retirer des trois générateurs sans un rouge. La
//      section « LE CÂBLAGE » applique une fonction PURE deux fois: sur le vrai
//      fichier (vert) et sur une copie EN MÉMOIRE dont l'appel a été retiré
//      (rouge attendu).
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
  buildDraftNoteClassifyPrompt,
  DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT,
  DRAFT_NOTE_FORBIDDEN_KINDS,
  DRAFT_NOTE_KINDS,
  DRAFT_NOTE_PRODUCER,
  draftNoteClassifyTrace,
  readDraftNoteClassification,
} from "./draft_note_classify.ts";
import {
  classifyAndPersistDraftNote,
  DRAFT_NOTE_CLASSIFY_SOURCE,
  DRAFT_NOTE_CLASSIFY_TIMEOUT_MS,
} from "./draft_note_classify_io.ts";
import type { DraftNoteVerdict } from "./plan_draft_note.ts";
import { canProduce, defaultScopeFor } from "./retained_item.ts";
import { isoMondayOf } from "./retained_next_plan.ts";
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

const MEMBERS = [
  { memberId: ZOE, label: "Zoé" },
  { memberId: MARC, label: "Marc" },
];

const NOTE = "Plus de poisson cette semaine. J'aimerais des fajitas.";

function usable(text: string = NOTE): DraftNoteVerdict {
  return { usable: text, refusal: null, dropped: [] };
}

function read(items: unknown[], over: Record<string, unknown> = {}) {
  return readDraftNoteClassification({
    raw: { items },
    today: TODAY,
    targetWeek: PLAN_STARTS_ON,
    members: MEMBERS,
    note: NOTE,
    ...over,
  });
}

// ===========================================================================
// ① LES JETONS ET LES LISTES — épinglés à leurs littéraux
// ===========================================================================

Deno.test("⛔ le producteur est `draft_note`, JAMAIS `written`", () => {
  // Le littéral EN DUR: c'est le jumeau du jeton lu par `canProduce`, par le
  // port serveur, et par la carte (`known.source.draft_note`). Renommer la
  // constante doit faire rougir quelque chose.
  assertEquals(DRAFT_NOTE_PRODUCER, "draft_note");
  assertNotEquals(DRAFT_NOTE_PRODUCER as string, "written");
  // ⛔ ET LA RAISON, TENUE PAR LE SOCLE: `written` peut tout écrire. Se
  // déclarer ainsi contournerait la matrice entière par un seul mot.
  assertEquals(canProduce("written", "portion.adjust"), true);
  assertEquals(canProduce("written", "rhythm.set"), true);
  assertEquals(canProduce("draft_note", "portion.adjust"), false);
  assertEquals(canProduce("draft_note", "rhythm.set"), false);
});

Deno.test("la matrice ① — six familles permises, deux interdites", () => {
  // Écrit EN DUR. Si la nomenclature bouge, ce test tombe AVANT le prompt.
  assertEquals([...DRAFT_NOTE_KINDS], [
    "food.exclude",
    "food.prefer",
    "method.avoid",
    "method.prefer",
    "logistics.set",
    "craving",
  ]);
  assertEquals([...DRAFT_NOTE_FORBIDDEN_KINDS], ["portion.adjust", "rhythm.set"]);
  // Les deux listes sont DÉRIVÉES de `canProduce`: ensemble elles couvrent les
  // huit familles, sans recouvrement. Une neuvième famille tomberait ici.
  assertEquals(DRAFT_NOTE_KINDS.length + DRAFT_NOTE_FORBIDDEN_KINDS.length, 8);
});

Deno.test("la trace et le plafond sont épinglés à leurs littéraux", () => {
  assertEquals(DRAFT_NOTE_CLASSIFY_SOURCE, "keel-draft-note-classify");
  assertEquals(DRAFT_NOTE_CLASSIFY_TIMEOUT_MS, 25_000);
});

// ===========================================================================
// ② LE PROMPT — la promesse TOUCHE la clé de schéma
// ===========================================================================

Deno.test("⛔ la promesse et la clé `\"kind\"` se touchent — 0 % sinon", () => {
  const prompt = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT;
  const keyAt = prompt.indexOf('"kind"');
  assert(keyAt > 0, "la clé de schéma `\"kind\"` a disparu du prompt.");

  for (const forbidden of ["portion.adjust", "rhythm.set"]) {
    const at = prompt.indexOf(`NEVER ${forbidden}`);
    assert(
      at > keyAt,
      `« NEVER ${forbidden} » n'est plus écrit après la clé \`"kind"\`.`,
    );
    // ⚠️ LA DISTANCE EST LA MESURE. Cicatrice chiffrée du dépôt: 0 % de
    // conformité quand la promesse et la clé sont ÉLOIGNÉES. 200 signes, c'est
    // « sur la même ligne »; au-delà, la promesse a glissé dans une section.
    assert(
      at - keyAt < 200,
      `« NEVER ${forbidden} » a glissé à ${
        at - keyAt
      } signes de la clé \`"kind"\`: la promesse ne la touche plus.`,
    );
  }
});

Deno.test("le prompt ne demande NI `scope`, NI `source`, NI `confidence`", () => {
  const prompt = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT;
  // Un modèle qui pourrait écrire `scope: "durable"` transformerait une humeur
  // de mardi en règle de vie — sans qu'aucune garde ne morde, puisque le socle
  // accepte `durable` sur `food.*`.
  assert(!prompt.includes('"scope"'), "le prompt laisse le modèle choisir la portée.");
  assert(!prompt.includes('"source"'), "le prompt laisse le modèle choisir le producteur.");
  assert(
    !prompt.includes('"confidence"'),
    "le prompt demande une confiance sur un fait DÉCLARÉ: le socle la refuse.",
  );
});

Deno.test("⛔ LA RÈGLE DE DIRECTION est dans le prompt — 1/8 mesuré sans elle", () => {
  const prompt = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT;
  // ⚠️ CE N'EST PAS UNE CONSIGNE DE CONFORT. Mesuré en run réel le 2026-08-18,
  // `gpt-5.6-sol`, température 0: « Plus de poisson cette semaine. » ressortait
  // en `food.prefer` — c'est-à-dire l'INVERSE, donc un plan suivant qui sert
  // DAVANTAGE de ce qui vient d'être rejeté. Batterie de 8 phrases FR: 7/8
  // avant cette règle, 8/8 après, et les six cas non ambigus n'ont pas bougé
  // (aucune sur-suppression).
  //
  // Le retirer ne fait rougir aucun test de comportement — le modèle n'est pas
  // dans la boucle des tests. D'où cette épingle.
  assert(
    /« plus de X »/i.test(prompt),
    "l'ambiguïté du français « plus de X » n'est plus nommée dans le prompt.",
  );
  assert(
    /leave the item out of "items"/i.test(prompt),
    "la sortie en cas de doute (ne rien ranger) n'est plus donnée.",
  );
  // Et l'asymétrie des dégâts, qui est le MOTIF: sans elle, la règle se lit
  // comme une pinaillerie de grammaire et le modèle l'arbitre contre le reste.
  assert(
    /costs them a week/i.test(prompt),
    "le motif (asymétrie des dégâts) a disparu: la règle devient négociable.",
  );
  // La règle vit à côté des DEUX familles qu'elle sépare, pas dans une annexe.
  const excludeAt = prompt.indexOf("- food.exclude");
  const ruleAt = prompt.indexOf("DIRECTION FIRST");
  assert(excludeAt > 0 && ruleAt > excludeAt && ruleAt - excludeAt < 300);
});

Deno.test("le prompt refuse explicitement la sécurité, et nomme le repli", () => {
  const prompt = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT;
  assert(/NEVER file an allergy/i.test(prompt));
  assert(/food\.exclude/.test(prompt));
  // ⛔ Aucune famille de sécurité n'existe: le socle n'en porte pas, et le
  // prompt ne doit pas en inventer une pour se faire comprendre.
  for (const forged of ["allergy", "intolerance", "medical"]) {
    assert(
      !new RegExp(`"kind"[^\\n]*${forged}`, "i").test(prompt),
      `le prompt propose \`${forged}\` comme \`kind\`.`,
    );
  }
});

Deno.test("le rôle vide se DIT, il ne s'omet pas", () => {
  const solo = buildDraftNoteClassifyPrompt({
    note: NOTE,
    contentLocale: "fr-FR",
    members: [],
  });
  assert(/nobody else at this table/i.test(solo));
  assert(!solo.includes("Zoé"));

  const foyer = buildDraftNoteClassifyPrompt({
    note: NOTE,
    contentLocale: "fr-FR",
    members: MEMBERS,
  });
  // Les prénoms servent à LIRE la note; l'id est ce qu'on recopie.
  assert(foyer.includes(ZOE) && foyer.includes("Zoé"));
  assert(/never a name/i.test(foyer));
});

// ===========================================================================
// ③ LA MATRICE — le cas qui MORD, et le cas qui PASSE
// ===========================================================================

Deno.test("✅ LE CAS QUI PASSE — deux items retenus, tout en `next_plan`", () => {
  const out = read([
    { kind: "food.exclude", text: "pas de poisson", member_id: null, value: null },
    { kind: "craving", text: "des fajitas", member_id: null, value: null },
  ]);
  assertEquals(out.ok, true);
  assertEquals(out.refusal, null);
  assertEquals(out.classification.proposed, 2);
  assertEquals(out.classification.kept, 2);
  assertEquals(out.classification.refused.total, 0);
  for (const entry of out.classification.nextPlan) {
    assertEquals(entry.item.scope, "next_plan");
    assertEquals(entry.item.source, "draft_note");
    assertEquals(entry.item.subject, "household");
    assertEquals(entry.item.at, TODAY);
    assertEquals(entry.item.item, "");
    assertEquals(entry.item.confidence, null);
    assertEquals(entry.anchor, ANCHOR);
  }
});

Deno.test("⛔ `portion.adjust` et `rhythm.set` sont REFUSÉS À CE PRODUCTEUR", () => {
  const out = read([
    {
      kind: "portion.adjust",
      text: "les parts étaient trop grosses",
      member_id: null,
      value: { direction: "down", magnitude: "clear" },
    },
    {
      kind: "rhythm.set",
      text: "je ne petit-déjeune pas",
      member_id: null,
      value: { occasion: "breakfast", present: false },
    },
    // Le voisin qui PASSE, dans le même appel: sans lui, une garde qui bloque
    // TOUT ressemblerait trait pour trait à une garde qui marche.
    { kind: "method.avoid", text: "rien de frit", member_id: null, value: null },
  ]);
  assertEquals(out.ok, true);
  assertEquals(out.classification.proposed, 3);
  assertEquals(out.classification.kept, 1);
  assertEquals(out.classification.refused.forbiddenKind, 2);
  assertEquals(out.classification.refused.total, 2);
  assertEquals(out.classification.nextPlan[0].item.kind, "method.avoid");
});

Deno.test("⛔ un `portion.adjust` bien formé ne passe PAS par une autre porte", () => {
  // Le socle refuse AUSSI à la lecture (`parseRetainedItem` applique
  // `canProduce`): même en contournant le compteur, l'item ne remonterait pas.
  assertEquals(defaultScopeFor("draft_note", "portion.adjust"), null);
  assertEquals(defaultScopeFor("draft_note", "rhythm.set"), null);
  // ⛔ ET LE `null` NE SE REPLIE PAS. La preuve par le comportement: aucun item
  // de ces deux familles ne ressort, quelle que soit sa forme.
  const out = read([
    { kind: "portion.adjust", text: "moins", member_id: null, value: { direction: "down", magnitude: "slight" } },
    { kind: "portion.adjust", text: "moins", member_id: ZOE, value: { direction: "down", magnitude: "slight" } },
  ]);
  assertEquals(out.classification.kept, 0);
  assertEquals(out.classification.refused.forbiddenKind, 2);
});

Deno.test("les six familles permises passent, chacune la sienne", () => {
  const out = read([
    { kind: "food.exclude", text: "pas de poisson", member_id: null, value: null },
    { kind: "food.prefer", text: "encore du poulet", member_id: null, value: null },
    { kind: "method.avoid", text: "rien de frit", member_id: null, value: null },
    { kind: "method.prefer", text: "au four", member_id: null, value: null },
    {
      kind: "logistics.set",
      text: "je cuisine lundi et jeudi",
      member_id: null,
      value: { field: "cook_days", value: ["mon", "thu"] },
    },
    { kind: "craving", text: "des fajitas", member_id: null, value: null },
  ]);
  assertEquals(out.classification.proposed, 6);
  assertEquals(out.classification.kept, 6);
  assertEquals(
    out.classification.nextPlan.map((e) => e.item.kind),
    [...DRAFT_NOTE_KINDS],
  );
});

Deno.test("un `kind` hors liste tombe SEUL, ses voisins survivent", () => {
  const out = read([
    { kind: "allergy", text: "arachides", member_id: null, value: null },
    { kind: "food.exclude", text: "pas de poisson", member_id: null, value: null },
  ]);
  assertEquals(out.classification.kept, 1);
  assertEquals(out.classification.refused.unknownKind, 1);
});

// ===========================================================================
// ④ LA PORTÉE ET L'ANCRE
// ===========================================================================

Deno.test("⛔ AUCUN `durable` — la portée vient de `defaultScopeFor`", () => {
  for (const kind of DRAFT_NOTE_KINDS) {
    assertEquals(defaultScopeFor("draft_note", kind), "next_plan");
  }
  // Et le modèle ne peut pas la renverser: le champ n'est pas lu.
  const out = read([
    {
      kind: "food.exclude",
      scope: "durable",
      text: "pas de poisson",
      member_id: null,
      value: null,
    },
  ]);
  assertEquals(out.classification.kept, 1);
  assertEquals(out.classification.nextPlan[0].item.scope, "next_plan");
});

Deno.test("⚠️ l'ancre est la SEMAINE VISÉE, jamais le jour de la frappe", () => {
  // Écrit le DIMANCHE pour un plan qui commence le lundi suivant.
  const out = readDraftNoteClassification({
    raw: { items: [{ kind: "craving", text: "des fajitas", member_id: null, value: null }] },
    today: "2026-08-16", // dimanche
    targetWeek: "2026-08-17", // lundi de la semaine visée
    members: [],
    note: NOTE,
  });
  assertEquals(out.classification.nextPlan[0].item.at, "2026-08-16");
  // ⛔ L'ancre est le lundi 17, PAS le lundi de la semaine du 16 (qui est le 10).
  assertEquals(out.classification.nextPlan[0].anchor, "2026-08-17");
  assertNotEquals(out.classification.nextPlan[0].anchor, "2026-08-10");
});

Deno.test("l'ancre est le LUNDI ISO — la porte refuse tout le reste", () => {
  const out = read([{ kind: "craving", text: "des fajitas", member_id: null, value: null }]);
  // Le plan commence un mercredi; l'ancre stockée est le lundi d'avant.
  assertEquals(out.classification.nextPlan[0].anchor, "2026-08-17");
  assertEquals(isoMondayOf("2026-08-17"), "2026-08-17");
});

Deno.test("⛔ une semaine visée illisible est un REFUS, pas un repli sur aujourd'hui", () => {
  const out = readDraftNoteClassification({
    raw: { items: [{ kind: "craving", text: "des fajitas", member_id: null, value: null }] },
    today: TODAY,
    targetWeek: "pas-une-date",
    members: [],
    note: NOTE,
  });
  assertEquals(out.ok, false);
  assertEquals(out.refusal, "bad_anchor");
  assertEquals(out.classification.nextPlan.length, 0);
});

Deno.test("⛔ un jour illisible est un REFUS: on ne saurait pas dire « retenu de mardi »", () => {
  const out = readDraftNoteClassification({
    raw: { items: [{ kind: "craving", text: "des fajitas", member_id: null, value: null }] },
    today: "2026-8-1",
    targetWeek: PLAN_STARTS_ON,
    members: [],
    note: NOTE,
  });
  assertEquals(out.ok, false);
  assertEquals(out.refusal, "bad_day");
});

// ===========================================================================
// ⑤ LE SUJET — jointure par identifiant, jamais un prénom
// ===========================================================================

Deno.test("un `member_id` du rôle devient `member:<uuid>`", () => {
  const out = read([
    { kind: "food.exclude", text: "pas de poisson pour Zoé", member_id: ZOE, value: null },
  ]);
  assertEquals(out.classification.kept, 1);
  assertEquals(out.classification.nextPlan[0].item.subject, `member:${ZOE}`);
});

Deno.test("⛔ un id HORS RÔLE est un refus, PAS un repli sur `household`", () => {
  const out = read([
    { kind: "food.exclude", text: "pas de poisson", member_id: STRANGER, value: null },
  ]);
  assertEquals(out.classification.kept, 0);
  assertEquals(out.classification.refused.unknownMember, 1);
  // Replier sur `household` appliquerait à toute la table ce qui visait une
  // bouche — exactement ce que le §2 axe 3 interdit.
  assertEquals(out.classification.nextPlan.length, 0);
});

Deno.test("⛔ un PRÉNOM dans `member_id` ne devient jamais une bouche", () => {
  for (const forged of ["Zoé", "zoe", "member:Zoé", ZOE.slice(0, 8)]) {
    const out = read([
      { kind: "craving", text: "des fajitas", member_id: forged, value: null },
    ]);
    assertEquals(out.classification.kept, 0, `« ${forged} » a désigné une bouche.`);
    assertEquals(out.classification.refused.unknownMember, 1);
  }
});

Deno.test("un solo n'a pas de bouche à nommer: tout id est refusé", () => {
  const out = readDraftNoteClassification({
    raw: { items: [{ kind: "craving", text: "des fajitas", member_id: ZOE, value: null }] },
    today: TODAY,
    targetWeek: PLAN_STARTS_ON,
    members: [],
    note: NOTE,
  });
  assertEquals(out.classification.refused.unknownMember, 1);
});

// ===========================================================================
// ⑥ `text` — la vérité affichée, et sa borne DÉRIVÉE
// ===========================================================================

Deno.test("un `text` vide fait tomber l'item — la ligne qu'on ne saurait pas afficher n'existe pas", () => {
  const out = read([
    { kind: "craving", text: "   ", member_id: null, value: null },
    { kind: "craving", text: null, member_id: null, value: null },
  ]);
  assertEquals(out.classification.kept, 0);
  assertEquals(out.classification.refused.badText, 2);
});

Deno.test("⛔ un `text` PLUS LONG que la note ne peut pas être « ses mots à elle »", () => {
  const shortNote = "pas de poisson";
  const out = readDraftNoteClassification({
    raw: {
      items: [
        {
          kind: "food.exclude",
          text: "Vous avez indiqué ne plus vouloir de poisson dans vos repas",
          member_id: null,
          value: null,
        },
        { kind: "food.exclude", text: "pas de poisson", member_id: null, value: null },
      ],
    },
    today: TODAY,
    targetWeek: PLAN_STARTS_ON,
    members: [],
    note: shortNote,
  });
  assertEquals(out.classification.kept, 1);
  assertEquals(out.classification.refused.badText, 1);
});

// ===========================================================================
// ⑦ LA CHARGE DU MODÈLE — `[]` et « illisible » ne sont pas la même chose
// ===========================================================================

Deno.test("une liste VIDE est une réponse correcte, pas une panne", () => {
  const out = read([]);
  assertEquals(out.ok, true);
  assertEquals(out.classification.proposed, 0);
  assertEquals(out.classification.kept, 0);
  assertEquals(out.classification.refused.total, 0);
});

Deno.test("⛔ une charge SANS `items` est illisible, et ça ne se confond pas avec `[]`", () => {
  for (const raw of [null, "", 42, [], { nope: 1 }, { items: "oui" }]) {
    const out = readDraftNoteClassification({
      raw,
      today: TODAY,
      targetWeek: PLAN_STARTS_ON,
      members: [],
      note: NOTE,
    });
    assertEquals(out.ok, false, `\`${JSON.stringify(raw)}\` a été lu comme vide.`);
    assertEquals(out.refusal, "unreadable_payload");
  }
});

Deno.test("une charge rendue en CHAÎNE JSON est lue", () => {
  const out = readDraftNoteClassification({
    raw: JSON.stringify({
      items: [{ kind: "craving", text: "des fajitas", member_id: null, value: null }],
    }),
    today: TODAY,
    targetWeek: PLAN_STARTS_ON,
    members: [],
    note: NOTE,
  });
  assertEquals(out.classification.kept, 1);
});

Deno.test("un `value` difforme fait tomber l'item, et le socle est le juge", () => {
  const out = read([
    // `logistics.set` sans `value`: le socle refuse.
    { kind: "logistics.set", text: "je cuisine peu", member_id: null, value: null },
    // Un jour hors `DAY_TOKENS`: le socle fait tomber TOUT le champ.
    {
      kind: "logistics.set",
      text: "je cuisine le lundi",
      member_id: null,
      value: { field: "cook_days", value: ["lundi"] },
    },
    // Un `value` sur une famille qui n'en a pas.
    {
      kind: "food.exclude",
      text: "pas de poisson",
      member_id: null,
      value: { direction: "down" },
    },
  ]);
  assertEquals(out.classification.kept, 0);
  assertEquals(out.classification.refused.malformed, 3);
});

Deno.test("LE COMPTEUR À TROIS NOMBRES se lit d'un bloc", () => {
  const out = read([
    { kind: "portion.adjust", text: "moins", member_id: null, value: { direction: "down", magnitude: "slight" } },
    { kind: "allergy", text: "arachides", member_id: null, value: null },
    { kind: "craving", text: "des fajitas", member_id: STRANGER, value: null },
    { kind: "craving", text: "", member_id: null, value: null },
    { kind: "food.exclude", text: "pas de poisson", member_id: null, value: null },
  ]);
  const trace = draftNoteClassifyTrace(out.classification);
  assertEquals(trace.proposed, 5);
  assertEquals(trace.kept, 1);
  assertEquals(trace.refused, 4);
  assertEquals(trace.refused_forbidden_kind, 1);
  assertEquals(trace.refused_unknown_kind, 1);
  assertEquals(trace.refused_unknown_member, 1);
  assertEquals(trace.refused_bad_text, 1);
  // proposés = retenus + refusés, vérifiable de l'extérieur sans relire un item.
  assertEquals(trace.proposed, trace.kept + trace.refused);
});

// ===========================================================================
// ⑧ L'I/O — le modèle RÉELLEMENT demandé, et la porte RÉELLEMENT appelée
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

function runnerReturning(items: unknown[], trace: Trace) {
  return (_s: string, _u: string, meta: { model: string }) => {
    trace.models.push(meta.model);
    return Promise.resolve({ items });
  };
}

Deno.test("⛔ `keelGenerationModel()` est RÉELLEMENT APPELÉ — la sentinelle le prouve", async () => {
  const previous = Deno.env.get("KEEL_GENERATION_MODEL");
  // Une valeur qui n'existe NULLE PART ailleurs dans le dépôt: une constante en
  // dur, ou le modèle du chat, ne pourraient pas la rendre.
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
      run: runnerReturning(
        [{ kind: "craving", text: "des fajitas", member_id: null, value: null }],
        trace,
      ),
    });
    // Des DEUX côtés: ce qui est parti dans `meta.model`, et ce qui est rendu.
    assertEquals(trace.models, [SENTINEL]);
    assertEquals(res.model, SENTINEL);
    assertNotEquals(res.model, "gpt-5.4-mini");
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
      run: runnerReturning([], trace),
    });
    assertEquals(res.model, KEEL_GENERATION_MODEL_DEFAULT);
    // Le littéral EN DUR, à côté: si le défaut bougeait sans qu'on le veuille,
    // ce test le dirait au lieu de suivre la constante en silence.
    assertEquals(res.model, "gpt-5.6-luna");
  } finally {
    if (previous !== undefined) Deno.env.set("KEEL_GENERATION_MODEL", previous);
  }
});

Deno.test("⛔ la porte est appelée avec `producer: draft_note`, et rien n'est `durable`", async () => {
  const trace: Trace = { rpcs: [], models: [] };
  const res = await classifyAndPersistDraftNote({
    admin: fakeAdmin(trace),
    userId: USER,
    note: usable(),
    today: TODAY,
    targetWeek: PLAN_STARTS_ON,
    members: MEMBERS,
    contentLocale: "fr-FR",
    run: runnerReturning([
      { kind: "food.exclude", text: "pas de poisson", member_id: null, value: null },
      { kind: "craving", text: "des fajitas", member_id: null, value: null },
    ], trace),
  });
  assertEquals(res.ok, true);
  assertEquals(res.reason, "written");
  assertEquals([res.proposed, res.kept, res.refused], [2, 2, 0]);
  // La RPC serveur, et elle seule.
  assertEquals(trace.rpcs.length, 1);
  assertEquals(trace.rpcs[0].name, "keel_write_retained_items_for");
  // ⛔ RIEN dans le magasin DURABLE: la clé n'est pas touchée du tout.
  assertEquals(trace.rpcs[0].params.p_items, null);
  const next = trace.rpcs[0].params.p_next as Array<Record<string, unknown>>;
  assertEquals(next.length, 2);
  for (const row of next) {
    assertEquals(row.anchor, ANCHOR);
    assertEquals((row.item as Record<string, unknown>).source, "draft_note");
    assertNotEquals((row.item as Record<string, unknown>).source, "written");
    assertEquals((row.item as Record<string, unknown>).scope, "next_plan");
  }
});

Deno.test("⛔ ce que la matrice refuse N'ATTEINT PAS la porte", async () => {
  const trace: Trace = { rpcs: [], models: [] };
  const res = await classifyAndPersistDraftNote({
    admin: fakeAdmin(trace),
    userId: USER,
    note: usable(),
    today: TODAY,
    targetWeek: PLAN_STARTS_ON,
    members: [],
    contentLocale: "fr-FR",
    run: runnerReturning([
      { kind: "portion.adjust", text: "moins", member_id: null, value: { direction: "down", magnitude: "clear" } },
      { kind: "rhythm.set", text: "pas de petit-déjeuner", member_id: null, value: { occasion: "breakfast", present: false } },
    ], trace),
  });
  assertEquals(res.ok, false);
  assertEquals(res.reason, "nothing_to_file");
  assertEquals([res.proposed, res.kept, res.refused], [2, 0, 2]);
  assertEquals(res.classification.refused.forbiddenKind, 2);
  // ⛔ AUCUN APPEL À LA BASE. Écrire une liste inchangée réussirait, et
  // l'appelant lirait « écrit » sur une écriture qui n'a rien ajouté.
  assertEquals(trace.rpcs.length, 0);
});

Deno.test("une note refusée par la garde d'entrée ne déclenche AUCUN appel", async () => {
  const trace: Trace = { rpcs: [], models: [] };
  let called = 0;
  const res = await classifyAndPersistDraftNote({
    admin: fakeAdmin(trace),
    userId: USER,
    // ⛔ LE TYPE FORCE LE VERDICT, PAS LE TEXTE BRUT: c'est `readDraftNote` qui
    // le produit, et un `usable: null` veut dire « rien n'a survécu à la garde ».
    note: { usable: null, refusal: "numeric_target", dropped: ["numeric_target"] },
    today: TODAY,
    targetWeek: PLAN_STARTS_ON,
    members: [],
    contentLocale: "fr-FR",
    run: (_s, _u, _m) => {
      called += 1;
      return Promise.resolve({ items: [] });
    },
  });
  assertEquals(res.reason, "no_note");
  assertEquals(called, 0, "la note refusée est quand même partie au modèle.");
  assertEquals(trace.rpcs.length, 0);
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
    run: () => Promise.reject(new Error("Signal timed out")),
  });
  assertEquals(res.ok, false);
  assertEquals(res.reason, "model_unavailable");
  // ⚠️ Le modèle demandé sort MÊME EN PANNE: c'est ce qui permet de dire
  // « c'est ce modèle-là qui a expiré », plutôt que « ça n'a pas marché ».
  assertEquals(res.model, KEEL_GENERATION_MODEL_DEFAULT);
  assertEquals([res.proposed, res.kept, res.refused], [0, 0, 0]);
  assertEquals(trace.rpcs.length, 0);
});

Deno.test("`members` absent est un `bad_args`, pas un foyer vide", async () => {
  const trace: Trace = { rpcs: [], models: [] };
  const res = await classifyAndPersistDraftNote({
    admin: fakeAdmin(trace),
    userId: USER,
    note: usable(),
    today: TODAY,
    targetWeek: PLAN_STARTS_ON,
    // deno-lint-ignore no-explicit-any
    members: undefined as any,
    contentLocale: "fr-FR",
    run: runnerReturning([], trace),
  });
  assertEquals(res.reason, "bad_args");
});

// ===========================================================================
// ⑨ LE CÂBLAGE — une fonction PURE, appelée DEUX fois
// ===========================================================================
//
// ⛔ CE QUE CETTE SECTION EXISTE POUR EMPÊCHER. Le lot 1C a livré un module à
// 22 tests verts qu'on pouvait retirer des trois générateurs sans qu'un seul
// des 3507 tests ne rougisse. Un test de source ne suffit PAS à lui seul: si
// la chaîne cherchée ne correspond plus à rien (renommage, reformatage), il
// devient vert-parce-qu'il-ne-cherche-plus-rien.
//
// D'où la forme: `wiringVerdict` est PURE, et on l'appelle sur le VRAI fichier
// (vert) ET sur une copie EN MÉMOIRE dont l'appel a été retiré (rouge attendu).
// Sans la seconde moitié, on ne distingue pas « le câblage est là » de « ma
// recherche ne correspond plus à rien ».
//
// ⚠️ ── LA MOITIÉ QUI MANQUE, ET ELLE EST NOMMÉE ─────────────────────────────
// Le point de câblage AMONT — les deux générateurs qui appellent
// `classifyAndPersistDraftNote` après l'écriture du plan
// (`generate-meal-v1/index.ts:2805`, `generate-household-meal-v1/index.ts:5135`,
// à côté de `persistReconciledFoodPreferences`) — N'EST PAS POSÉ par ce lot:
// ces trois fichiers appartiennent à un lot qui y écrit en parallèle. Le trou
// est nommé dans le rapport, avec le patch exact et la sortie de la sonde.
// ⛔ NE PAS le remplacer ici par une assertion inversée (« le câblage est
// absent »): elle rougirait le jour où le câblage arrive.

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * LES QUATRE CHAÎNES QUI DOIVENT ÊTRE DANS `draft_note_classify_io.ts`.
 * Chacune tient une moitié différente, et chacune a sa mutation ci-dessous.
 */
function wiringVerdict(src: string): string[] {
  const code = stripComments(src);
  const missing: string[] = [];
  if (!/const model = keelGenerationModel\(\);/.test(code)) {
    missing.push("keelGenerationModel_appele");
  }
  if (!/await persistRetainedItemsFor\(\{/.test(code)) {
    missing.push("porte_appelee");
  }
  if (!/producer: DRAFT_NOTE_PRODUCER,/.test(code)) {
    missing.push("producteur_draft_note");
  }
  if (!/nextPlan: classification\.nextPlan,/.test(code)) {
    missing.push("next_plan_passe");
  }
  return missing;
}

async function ioSource(): Promise<string> {
  return await Deno.readTextFile(
    new URL("draft_note_classify_io.ts", import.meta.url),
  );
}

/**
 * LES DEUX MOITIÉS DE LA MATRICE, DANS LE MODULE PUR — et l'interdit de repli.
 *
 * ⚠️ POURQUOI UN TEST DE SOURCE ICI ALORS QU'IL Y A DÉJÀ DES TESTS DE
 * COMPORTEMENT. Mesuré à la mutation: retirer `canProduce` SEUL laisse les 38
 * tests verts (le `defaultScopeFor === null` rattrape), et ajouter
 * `?? "next_plan"` SEUL les laisse verts aussi (`canProduce` a déjà mordu). Les
 * deux sont des DOUBLURES l'une de l'autre — c'est voulu — mais « une garde qui
 * se coupe sans qu'un test rougisse » est exactement la ligne que le
 * vérificateur du lot 1A a fait payer six fois. Le comportement ne peut pas les
 * distinguer; la source, si.
 *
 * `?? "next_plan"` est nommé EN NÉGATIF parce que c'est l'échappatoire écrite
 * noir sur blanc dans le contrat: « `null` est un REFUS, jamais `?? "next_plan"` ».
 */
function matrixVerdict(src: string): string[] {
  const code = stripComments(src);
  const missing: string[] = [];
  if (!/if \(!canProduce\(DRAFT_NOTE_PRODUCER, kind\)\) \{/.test(code)) {
    missing.push("canProduce_arme");
  }
  // ⚠️ SANS LE `;` FINAL, EXPRÈS. L'exiger ferait qu'ajouter `?? "next_plan"`
  // rendrait DEUX motifs au lieu d'un, et le test qui isole le repli
  // n'isolerait plus rien.
  if (!/const scope = defaultScopeFor\(DRAFT_NOTE_PRODUCER, kind\)/.test(code)) {
    missing.push("defaultScopeFor_arme");
  }
  if (/\?\?\s*"next_plan"/.test(code)) {
    missing.push("repli_next_plan_interdit");
  }
  return missing;
}

async function pureSource(): Promise<string> {
  return await Deno.readTextFile(
    new URL("draft_note_classify.ts", import.meta.url),
  );
}

Deno.test("MATRICE ① — les deux ceintures sont là, et AUCUN repli (le cas qui passe)", async () => {
  assertEquals(matrixVerdict(await pureSource()), []);
});

Deno.test("MATRICE ② — couper l'une OU l'autre fait ROUGIR", async () => {
  const real = await pureSource();
  const mutations: Array<[string, string, string]> = [
    [
      "canProduce_arme",
      "if (!canProduce(DRAFT_NOTE_PRODUCER, kind)) {",
      "if (false) {",
    ],
    [
      "defaultScopeFor_arme",
      "const scope = defaultScopeFor(DRAFT_NOTE_PRODUCER, kind);",
      'const scope = "next_plan" as const;',
    ],
  ];
  for (const [name, from, to] of mutations) {
    assert(real.includes(from), `la chaîne « ${from} » n'existe plus.`);
    assertEquals(matrixVerdict(real.replace(from, to)), [name]);
  }
  // ⛔ ET LE REPLI INTERDIT, AJOUTÉ: il doit rougir même quand tout le reste
  // est en place. C'est la ligne exacte du contrat §2 point 1.
  const withFallback = real.replace(
    "const scope = defaultScopeFor(DRAFT_NOTE_PRODUCER, kind);",
    'const scope = defaultScopeFor(DRAFT_NOTE_PRODUCER, kind) ?? "next_plan";',
  );
  assertNotEquals(withFallback, real);
  assertEquals(matrixVerdict(withFallback), ["repli_next_plan_interdit"]);
});

Deno.test("CÂBLAGE ① — le VRAI fichier est câblé (le cas qui passe)", async () => {
  assertEquals(wiringVerdict(await ioSource()), []);
});

Deno.test("CÂBLAGE ② — chaque moitié retirée fait ROUGIR l'assertion", async () => {
  const real = await ioSource();
  // ⚠️ QUATRE MUTATIONS, EN MÉMOIRE. Sans elles, `wiringVerdict` pourrait ne
  // plus rien chercher et rester vert.
  const mutations: Array<[string, string, string]> = [
    [
      "keelGenerationModel_appele",
      "const model = keelGenerationModel();",
      'const model = "gpt-5.6-sol";',
    ],
    [
      "porte_appelee",
      "await persistRetainedItemsFor({",
      "await Promise.resolve({ ok: true } as any) && ({",
    ],
    [
      "producteur_draft_note",
      "producer: DRAFT_NOTE_PRODUCER,",
      'producer: "written" as any,',
    ],
    [
      "next_plan_passe",
      "nextPlan: classification.nextPlan,",
      "nextPlan: [],",
    ],
  ];
  for (const [name, from, to] of mutations) {
    assert(real.includes(from), `la chaîne « ${from} » n'existe plus: l'assertion ne cherche plus rien.`);
    const mutated = real.replace(from, to);
    assertNotEquals(mutated, real, `la mutation « ${name} » n'a rien changé.`);
    assertEquals(
      wiringVerdict(mutated),
      [name],
      `la mutation « ${name} » n'a PAS fait rougir l'assertion.`,
    );
  }
});

Deno.test("CÂBLAGE ③ — un commentaire ne câble rien", async () => {
  // Cicatrice du dépôt: « audit d'appelants — retirer les commentaires », un
  // grep naïf compte les faux vivants. Le vrai appel est retiré, et seule sa
  // mention en commentaire reste: l'assertion doit rougir quand même.
  const real = await ioSource();
  const mutated = real.replace(
    "const model = keelGenerationModel();",
    '// const model = keelGenerationModel();\n  const model = "gpt-5.6-sol";',
  );
  assertEquals(wiringVerdict(mutated), ["keelGenerationModel_appele"]);
});
