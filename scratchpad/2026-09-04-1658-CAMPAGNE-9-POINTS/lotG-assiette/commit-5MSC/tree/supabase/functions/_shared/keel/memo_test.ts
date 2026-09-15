// LE MÉMO — lot M4, réécrit au lot A du chantier « trois destinations »
// (2026-09-03): il devient « CE QUE SOPHIA SAIT », la destination ③.
//
// Ce que ces tests existent pour empêcher, dans l'ordre où ça coûte:
//
//   1. QUE LE PLAFOND FASSE TOMBER LA PLUS ANCIENNE. Ce serait une TROISIÈME
//      voie, pire que les deux: la consigne disparaîtrait sans que personne ne
//      l'ait décidé. *« Un plafond force une décision. »*
//   2. QU'UNE NOTE PERDE SA PERSONNE. « Léa a danse le mardi » servie à toute la
//      table donne une grosse part à Tom. Le sujet est REQUIS sur une ligne
//      neuve; une ligne d'AVANT le lot (sans sujet) était servie à toute la
//      table, et c'est ce qu'elle reste.
//   3. QUE LE MÉMO N'ATTEIGNE PAS LE PROMPT, OU L'ATTEIGNE SANS SON SUJET. Un
//      magasin sans lecteur est un magasin mort; un lecteur sans sujet est le
//      défaut n°2 en plus discret.
//   4. QU'IL SERVE PLUS DE CINQ LIGNES PAR PERSONNE. La garde qui ne tient
//      qu'à l'écriture est une garde qu'un jsonb trafiqué contourne.
//   5. QU'UNE LIGNE ENTRE SANS SA CAUSE. Une phrase libre qui gouverne des
//      assiettes et que personne ne peut rattacher à quoi que ce soit est la
//      définition du magasin opaque.
//   6. QU'UN JOUR NOMMÉ NE SOIT PAS NOMMÉ AU MODÈLE. « nommer le jour et
//      contredire l'a priori du modèle, pas seulement lui donner la donnée ».
//
// env purgé: env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
//   deno test --allow-read --allow-env --no-check \
//   supabase/functions/_shared/keel/memo_test.ts

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  MEMO_KEY,
  MEMO_LINE_MAX_CHARS,
  MEMO_MAX_LINES_PER_SUBJECT,
  memoFrom,
  memoLinesFor,
  memoLineToJson,
  memoLinesForPrompt,
  parseMemoLine,
  parseMemoLines,
  parseMemoWhen,
  renderMemoLine,
  withMemoLine,
  withoutMemoLine,
} from "./memo.ts";

const LEA = "member:aaaaaaaa-0000-4000-8000-000000000001";
const TOM = "member:bbbbbbbb-0000-4000-8000-000000000002";

function line(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    text: "danse le mardi, donc gros repas ce jour-là",
    at: "2026-09-01",
    source: "draft_note",
    quote: "elle danse le mardi, il lui faut un vrai repas ce soir-là",
    subject: LEA,
    when: { weekday: "tue", slot: "dinner" },
    ...over,
  };
}

function fullFor(subject: string): Record<string, unknown> {
  let pc: Record<string, unknown> = {};
  for (let i = 0; i < MEMO_MAX_LINES_PER_SUBJECT; i += 1) {
    const out = withMemoLine(pc, line({ text: `consigne n°${i}`, subject, when: null }));
    pc = { ...pc, [MEMO_KEY]: out.lines.map(memoLineToJson) };
  }
  return pc;
}

// ===========================================================================
// 1. ⛔ LE PLAFOND REFUSE — PAR PERSONNE — il ne fait pas tomber la plus ancienne
// ===========================================================================

Deno.test("le plafond est CINQ, épinglé à son littéral", () => {
  assertEquals(MEMO_MAX_LINES_PER_SUBJECT, 5);
});

Deno.test("⛔ à la sixième POUR LA MÊME PERSONNE, on REFUSE — et les cinq d'avant sont INTACTES", () => {
  const pc = fullFor(LEA);
  assertEquals(memoLinesFor(pc, LEA).length, 5);

  const out = withMemoLine(pc, line({ text: "une sixième", when: null }));
  assertEquals(out.added, 0);
  assertEquals(out.refused, "full");
  assertEquals(out.lines.length, 5);
  assert(
    out.lines.some((l) => l.text === "consigne n°0"),
    "la plus ancienne est tombée: le plafond a été implémenté à l'envers",
  );
  assert(!out.lines.some((l) => l.text === "une sixième"));
});

Deno.test("le plafond est PAR PERSONNE: cinq pour Léa n'empêchent pas une note pour Tom", () => {
  // Le §2.2 dit « cinq par personne, pas cinq au total »: la compétence, la
  // danse et l'appétit de Tom ne se comptent pas sur le budget de sa sœur.
  const pc = fullFor(LEA);
  const out = withMemoLine(pc, line({ text: "mange peu le soir", subject: TOM, when: null }));
  assertEquals(out.added, 1);
  assertEquals(out.lines.length, 6);
  assertEquals(memoLinesFor(out.lines.length ? { [MEMO_KEY]: out.lines.map(memoLineToJson) } : {}, TOM).length, 1);
});

Deno.test("retirer une ligne rouvre EXACTEMENT une place pour cette personne", () => {
  const pc = fullFor(LEA);
  const shorter = withoutMemoLine(pc, 2);
  assert(shorter);
  assertEquals(shorter.length, 4);
  const out = withMemoLine({ [MEMO_KEY]: shorter.map(memoLineToJson) }, line({
    text: "la place libérée",
    when: null,
  }));
  assertEquals(out.added, 1);
  assertEquals(out.lines[0].text, "la place libérée");
});

Deno.test("⛔ LE PLAFOND MORD AUSSI À LA LECTURE, par personne", () => {
  const tampered = {
    [MEMO_KEY]: [
      ...Array.from({ length: 9 }, (_, i) => line({ text: `forgée Léa n°${i}`, when: null })),
      ...Array.from({ length: 7 }, (_, i) => line({ text: `forgée Tom n°${i}`, subject: TOM, when: null })),
    ],
  };
  assertEquals(memoLinesFor(tampered, LEA).length, 5);
  assertEquals(memoLinesFor(tampered, TOM).length, 5);
  assertEquals(memoFrom(tampered).length, 10);
});

// ===========================================================================
// 2. ⛔ LE SUJET — requis sur une ligne neuve, `household` pour une ligne d'avant
// ===========================================================================

Deno.test("une ligne d'AVANT le lot (sans sujet) se lit `household` — c'est ce qu'elle était", () => {
  // Elle était servie dans le tronc, à toute la table. Lui inventer une bouche
  // serait une attribution que personne n'a déclarée; la refuser ferait
  // disparaître une consigne de la carte entre deux chargements.
  const legacy = { text: "gros repas le mardi", at: "2026-09-01", source: "draft_note", quote: "…" };
  const parsed = parseMemoLine(legacy);
  assert(parsed);
  assertEquals(parsed.subject, "household");
  assertEquals(parsed.when, null);
});

Deno.test("⛔ un sujet PRÉSENT mais difforme est un REFUS, jamais un repli sur la table", () => {
  for (const subject of ["Léa", "member:lea", "member:", "everyone", 42]) {
    assertEquals(parseMemoLine(line({ subject })), null, String(subject));
  }
});

Deno.test("`subject` et `when` survivent à l'aller-retour JSON", () => {
  const parsed = parseMemoLine(line());
  assert(parsed);
  const json = memoLineToJson(parsed);
  assertEquals(json.subject, LEA);
  assertEquals(json.when, { weekday: "tue", slot: "dinner" });
  assertEquals(parseMemoLine(json), parsed);
});

// ===========================================================================
// 3. `when` — vocabulaire FERMÉ, et un `when` illisible fait tomber la ligne
// ===========================================================================

Deno.test("`when`: jour ET créneau, jour seul, créneau seul, ou null", () => {
  assertEquals(parseMemoWhen({ weekday: "tue", slot: "dinner" }), { weekday: "tue", slot: "dinner" });
  assertEquals(parseMemoWhen({ weekday: "sat" }), { weekday: "sat", slot: null });
  assertEquals(parseMemoWhen({ slot: "snack_pm" }), { weekday: null, slot: "snack_pm" });
  assertEquals(parseMemoWhen(null), null);
  assertEquals(parseMemoWhen(undefined), null);
});

Deno.test("⛔ un `when` hors vocabulaire est un REFUS de la LIGNE, pas un `null` silencieux", () => {
  // « mardi » n'est pas `tue`, « goûter » n'est pas `snack_pm`: replier sur
  // null servirait une note « gros repas » TOUS les jours au lieu du mardi —
  // l'inverse de ce qu'elle dit.
  assertEquals(parseMemoWhen({ weekday: "mardi" }), "unreadable");
  assertEquals(parseMemoWhen({ slot: "goûter" }), "unreadable");
  assertEquals(parseMemoWhen({}), "unreadable");
  assertEquals(parseMemoWhen("tue"), "unreadable");
  assertEquals(parseMemoLine(line({ when: { weekday: "mardi" } })), null);
});

// ===========================================================================
// 4. ⛔ CE QUI N'ENTRE PAS
// ===========================================================================

Deno.test("⛔ une ligne SANS CAUSE est refusée — lot M2, même règle", () => {
  assertEquals(parseMemoLine(line({ quote: "" })), null);
  assertEquals(parseMemoLine(line({ quote: "   " })), null);
  assertEquals(parseMemoLine(line({ quote: null })), null);
});

Deno.test("⛔ `written` n'entre JAMAIS dans le mémo", () => {
  assertEquals(parseMemoLine(line({ source: "written" })), null);
  for (const source of ["draft_note", "questionnaire", "conversation"]) {
    assert(parseMemoLine(line({ source })), source);
  }
});

Deno.test("un doublon est refusé POUR LA MÊME PERSONNE, casse et espaces normalisées", () => {
  const pc = { [MEMO_KEY]: [line({ text: "danse le mardi" })] };
  assertEquals(withMemoLine(pc, line({ text: "  Danse Le Mardi " })).refused, "duplicate");
  // ⛔ ÉGALITÉ, PAS RESSEMBLANCE: « laitue » ≠ « lait ».
  assertEquals(withMemoLine(pc, line({ text: "danse le lundi" })).added, 1);
  // ⚠️ ET LA MÊME PHRASE POUR UNE AUTRE PERSONNE EST UNE AUTRE LIGNE.
  assertEquals(withMemoLine(pc, line({ text: "danse le mardi", subject: TOM })).added, 1);
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
// 5. RETIRER
// ===========================================================================

Deno.test("retirer se fait par POSITION dans la liste entière, et un index hors bornes est un REFUS", () => {
  const pc = fullFor(LEA);
  for (const bad of [-1, 5, 99, 1.5, NaN]) {
    assertEquals(withoutMemoLine(pc, bad), null, String(bad));
  }
  assertEquals(withoutMemoLine({}, 0), null);
  const kept = withoutMemoLine(pc, 0);
  assertEquals(kept?.length, 4);
});

// ===========================================================================
// 6. ⛔ CE QUE LE PROMPT REÇOIT — par sujet, au jour nommé
// ===========================================================================

Deno.test("⛔ le prompt reçoit les lignes DE CE SUJET, et d'aucun autre", () => {
  const pc = {
    [MEMO_KEY]: [
      line({ text: "gros repas le mardi", subject: LEA }),
      line({ text: "mange peu le soir", subject: TOM, when: null }),
      line({ text: "on mange tard le vendredi", subject: "household", when: { weekday: "fri", slot: "dinner" } }),
    ],
  };
  assertEquals(memoLinesForPrompt(pc, { subject: TOM, who: "Tom" }), ["Tom: mange peu le soir"]);
  assertEquals(
    memoLinesForPrompt(pc, { subject: "household", who: null }),
    ["Friday dinner — on mange tard le vendredi"],
  );
  assertEquals(memoLinesForPrompt({}, { subject: LEA, who: "Léa" }), []);
  assertEquals(memoLinesForPrompt(null, { subject: LEA, who: "Léa" }), []);
});

Deno.test("⛔ LE JOUR ET LE CRÉNEAU SONT NOMMÉS AU MODÈLE — pas seulement stockés", () => {
  // Le dépôt a mesuré que « donner la donnée » ne suffit pas: le modèle lisse
  // les jours. Le rendu nomme le jour, en anglais (la langue du prompt).
  const l = parseMemoLine(line())!;
  assertEquals(renderMemoLine(l, "Léa"), "Tuesday dinner — Léa: danse le mardi, donc gros repas ce jour-là");
  assertEquals(
    renderMemoLine(parseMemoLine(line({ when: { slot: "snack_pm" } }))!, "Léa"),
    "afternoon snack — Léa: danse le mardi, donc gros repas ce jour-là",
  );
  assertEquals(
    renderMemoLine(parseMemoLine(line({ when: { weekday: "sat" } }))!, null),
    "Saturday — danse le mardi, donc gros repas ce jour-là",
  );
  assertEquals(renderMemoLine(parseMemoLine(line({ when: null }))!, null), "danse le mardi, donc gros repas ce jour-là");
});

Deno.test("⛔ ni la citation, ni la date, ni la source n'atteignent le prompt", () => {
  const out = memoLinesForPrompt({ [MEMO_KEY]: [line({ when: null })] }, { subject: LEA, who: null });
  assertEquals(out, ["danse le mardi, donc gros repas ce jour-là"]);
  assert(!out[0].includes("2026-09-01"));
  assert(!out[0].includes("draft_note"));
});

Deno.test("LE CÂBLAGE — les DEUX lanes lisent le mémo AVEC UN SUJET, et le comptent sur la chaîne", async () => {
  // ⚠️ SANS CE TEST, LE MÉMO SERAIT UN MAGASIN SANS LECTEUR — ou un lecteur
  // sans sujet, qui servirait la danse de Léa à toute la table.
  for (
    const [rel, tag] of [
      ["../../generate-meal-v1/index.ts", "keel.meal.notes"],
      ["../../generate-household-meal-v1/index.ts", "keel.household_meal.notes"],
    ] as const
  ) {
    const src = (await Deno.readTextFile(new URL(rel, import.meta.url)))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
      .join("\n");
    assert(
      /memoLinesForPrompt\(\s*[\s\S]{0,200}?subject:/.test(src),
      `${rel} ne lit plus le mémo PAR SUJET`,
    );
    assert(
      !/memoLinesForPrompt\(\s*goalRow\.practical_constraints[^,]*\)\s*;/.test(src),
      `${rel} lit encore le mémo SANS sujet — la danse de Léa part à toute la table`,
    );
    assert(src.includes("memo: memoLines"), `${rel} ne passe plus le mémo au prompt`);
    assert(src.includes(`tag: "${tag}"`), `${rel} n'a plus de compteur ${tag}`);
    // La lane solo compte `memoLines`, la lane foyer compte l'UNION des notes
    // de la table et des notes par bouche — sur le message + le suffixe.
    assert(
      /served: (\[[^\]]*\]|[a-zA-Z]+)\.filter\(\(line\) =>\s*[a-zA-Z.]+\.includes\(line\)\s*\)/.test(src),
      `${rel} ne compte plus le mémo SUR LA CHAÎNE`,
    );
  }
  // La lane foyer passe AUSSI les notes par bouche au bloc du foyer.
  const household = await Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  assert(/notes: memberNoteLines/.test(household), "la lane foyer ne passe plus les notes par bouche au bloc du foyer");

  // Et le prompt le REND.
  const prompt = await Deno.readTextFile(new URL("./meal_generation.ts", import.meta.url));
  assert(prompt.includes("memo?: readonly string[];"), "le paramètre a disparu");
  assert(
    prompt.includes("...(args.memo ?? []).map((p) => `- ${p}`)"),
    "le mémo est reçu mais jamais imprimé dans le message",
  );
  assert(
    /the exception/i.test(prompt),
    "l'en-tête du mémo ne dit plus qu'un jour nommé est l'EXCEPTION: le modèle aplatit",
  );
});
