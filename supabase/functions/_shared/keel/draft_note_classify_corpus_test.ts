/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE LECTEUR DE NOTES, CAS PAR CAS — 47 notes, et ce que la mémoire en garde.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QUE CE FICHIER TESTE, ET CE QU'IL NE TESTE PAS ─────────────────────
 * Il teste le PARSEUR sur des sorties modèle EN DUR (`DRAFT_NOTE_CORPUS`), et
 * le CÂBLAGE de la consigne (chaque promesse touche sa clé de schéma). Il
 * n'appelle aucun modèle: la qualité de la classification réelle se mesure au
 * banc (`--since`), jamais dans un test.
 *
 * ⛔ DEUX BLOCS SONT ROUGES SUR LE CODE DU 2026-09-21, ET C'EST VOULU.
 * Ils décrivent la cible mesurée ce jour-là sur un foyer réel:
 *
 *   ① `occasion` — « tofu, poissons au petit déjeuné » doit faire DEUX
 *      souvenirs portant `breakfast`. Aujourd'hui le parseur n'a pas de champ
 *      `occasion`: il rend deux souvenirs SANS moment, la ceinture ne peut pas
 *      scoper, et le tofu revient au petit-déjeuner.
 *   ② `slots` — « très léger le matin » doit déplacer la case « repas léger »
 *      de la fiche. Aujourd'hui ce tiroir n'existe pas: la phrase n'a AUCUNE
 *      destination, et le petit-déjeuner reste à 500 kcal.
 *
 * Ils ne sont PAS mis en `ignore`: un test ignoré est un test qu'on oublie.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT,
  DRAFT_NOTE_MAX_RETAINED,
  type DraftNoteMember,
  buildDraftNoteClassifyPrompt,
  readDraftNoteClassification,
} from "./draft_note_classify.ts";
import {
  CORPUS_MEMBER_IDS,
  CORPUS_MEMBERS,
  CORPUS_PLAN_FOODS,
  CORPUS_TARGET_WEEK,
  CORPUS_TODAY,
  type CorpusExpected,
  type CorpusMouth,
  DRAFT_NOTE_CORPUS,
  DRAFT_NOTE_CORPUS_SIZE,
} from "./draft_note_corpus.ts";
import { EXCLUSION_FORCES, RHYTHM_OCCASIONS } from "./retained_item.ts";
import { LIGHT_BEARING_SLOTS } from "./meal_extras.ts";

// ===========================================================================
// L'APLATISSEMENT — une classification devient une liste de souvenirs
// ===========================================================================

/** L'inverse du rôle: d'un uuid vers la clé lisible du corpus. */
const MOUTH_OF: ReadonlyMap<string, CorpusMouth> = new Map(
  (Object.entries(CORPUS_MEMBER_IDS) as [CorpusMouth, string][])
    .map(([mouth, uuid]) => [uuid, mouth] as const),
);

function whoOf(subject: unknown): CorpusMouth | null {
  const s = String(subject ?? "");
  if (s === "household" || s === "") return null;
  const uuid = s.startsWith("member:") ? s.slice(7) : s;
  const mouth = MOUTH_OF.get(uuid);
  // ⛔ UN ID HORS RÔLE NE SE REPLIE PAS SUR `null`. `null` veut dire « toute la
  // table »: y faire tomber un id inconnu ferait passer pour une règle de
  // maison ce qui était la ligne de quelqu'un.
  assert(mouth !== undefined, `sujet hors rôle: ${s}`);
  return mouth;
}

const BLANK = {
  kind: null,
  text: null,
  occasion: null,
  force: null,
  who: null,
  direction: null,
  about: null,
  light: null,
  weekday: null,
  why: null,
  ask: null,
  gate: null,
  safety: null,
} as const;

/** Le champ que la CIBLE ajoute aux familles d'aliments. Absent aujourd'hui. */
/** La force d'un refus. ⛔ `null` sur tout ce qui n'est pas un refus. */
function forceOf(row: unknown): CorpusExpected["force"] {
  const kind = String((row as { kind?: unknown } | null)?.kind ?? "");
  if (kind !== "food.exclude" && kind !== "method.avoid") return null;
  const value = (row as { force?: unknown } | null)?.force ?? null;
  return value === "less" ? "less" : value === "never" ? "never" : null;
}

function occasionOf(row: unknown): CorpusExpected["occasion"] {
  const value = (row as { occasion?: unknown } | null)?.occasion ?? null;
  if (value === null || value === undefined) return null;
  const slot = String(value);
  return (RHYTHM_OCCASIONS as readonly string[]).includes(slot)
    ? slot as CorpusExpected["occasion"]
    : null;
}

function flatten(
  classification: ReturnType<typeof readDraftNoteClassification>["classification"],
): CorpusExpected[] {
  const out: CorpusExpected[] = [];

  for (const item of classification.preferences.items) {
    out.push({
      ...BLANK,
      drawer: "preferences",
      kind: item.kind,
      text: item.text,
      occasion: occasionOf(item),
      force: forceOf(item),
      who: whoOf(item.subject),
    });
  }
  for (const entry of classification.nextPlan.entries) {
    out.push({
      ...BLANK,
      drawer: "next_plan",
      kind: entry.item.kind,
      text: entry.item.text,
      occasion: occasionOf(entry.item),
      force: forceOf(entry.item),
      who: whoOf(entry.item.subject),
    });
  }
  for (const line of classification.notes.lines) {
    out.push({
      ...BLANK,
      drawer: "notes",
      text: line.text,
      occasion: (line.when?.slot ?? null) as CorpusExpected["occasion"],
      weekday: (line.when?.weekday ?? null) as CorpusExpected["weekday"],
      who: whoOf(line.subject),
    });
  }
  for (const move of classification.portions.moves) {
    out.push({
      ...BLANK,
      drawer: "portions",
      direction: move.direction,
      who: whoOf(`member:${move.memberId}`),
    });
  }
  for (const move of classification.settings.moves) {
    out.push({ ...BLANK, drawer: "settings", about: move.about, direction: move.direction });
  }
  // ⛔ LE TIROIR QUI N'EXISTE PAS ENCORE. Lu défensivement pour que le test
  // DISE ce qui manque au lieu de planter sur une propriété absente.
  const slots = (classification as unknown as {
    slots?: { moves?: readonly { slot: string; light: boolean; memberId: string | null }[] };
  }).slots?.moves ?? [];
  for (const move of slots) {
    out.push({
      ...BLANK,
      drawer: "slots",
      occasion: move.slot as CorpusExpected["occasion"],
      light: move.light,
      who: move.memberId === null ? null : whoOf(`member:${move.memberId}`),
    });
  }
  for (const cell of classification.cells.requests) {
    out.push({
      ...BLANK,
      drawer: "cells",
      text: cell.text,
      weekday: cell.day as CorpusExpected["weekday"],
      occasion: cell.slot as CorpusExpected["occasion"],
    });
  }
  const skipped = classification.skipped;
  const byReason: readonly [CorpusExpected["why"], number][] = [
    ["degree", skipped.degree],
    ["setting", skipped.setting],
    ["meal_story", skipped.mealStory],
    ["other", skipped.other],
  ];
  for (const [why, n] of byReason) {
    for (let i = 0; i < n; i++) out.push({ ...BLANK, drawer: "skipped", why });
  }
  for (const d of classification.safety.declarations) {
    out.push({
      ...BLANK,
      drawer: "safety",
      text: d.text,
      who: whoOf(`member:${d.memberId}`),
      safety: d.kind === "diet" ? `diet:${d.diet}` : d.kind,
    });
  }
  for (const entry of classification.clarify.entries) {
    out.push({ ...BLANK, drawer: "clarify", ask: entry.about, gate: entry.gate });
  }
  // Les parts sans bouche sont à part des `entries` — elles ne fabriquent pas
  // un item retenu, elles déplacent un appétit.
  for (const _q of classification.clarify.portions) {
    out.push({ ...BLANK, drawer: "clarify", ask: "who", gate: "portions" });
  }
  return out;
}

/** Une clé stable, pour comparer deux listes sans dépendre de leur ordre. */
const keyOf = (e: CorpusExpected): string =>
  JSON.stringify([
    e.drawer, e.kind, e.text, e.occasion, e.force, e.who, e.direction, e.about,
    e.light, e.weekday, e.why, e.ask, e.gate, e.safety,
  ]);

const sorted = (rows: readonly CorpusExpected[]): string[] =>
  rows.map(keyOf).slice().sort();

// ===========================================================================
// LE CORPUS LUI-MÊME
// ===========================================================================

Deno.test("corpus — la taille est épinglée", () => {
  assertEquals(DRAFT_NOTE_CORPUS.length, DRAFT_NOTE_CORPUS_SIZE);
});

Deno.test("corpus — chaque cas a un identifiant unique et une raison", () => {
  const seen = new Set<string>();
  for (const entry of DRAFT_NOTE_CORPUS) {
    assert(entry.id.trim() !== "", "un cas sans identifiant");
    assert(!seen.has(entry.id), `identifiant en double: ${entry.id}`);
    seen.add(entry.id);
    assert(entry.why.trim() !== "", `${entry.id}: aucune raison écrite`);
    assert(entry.note.trim() !== "", `${entry.id}: aucune note`);
  }
});

Deno.test("corpus — les huit cas obligatoires sont là", () => {
  // ⚠️ LA LISTE EST NOMMÉE, PAS COMPTÉE. Un corpus de 47 notes qui aurait perdu
  // « le moment » resterait de la bonne taille et ne prouverait plus rien.
  const required = [
    "liste-et-moment",
    "matin-leger",
    "appetit-nomme",
    "allergie-sur-un-retour",
    "faute-de-frappe",
    "pas-un-souvenir",
    "prenom-ambigu",
    "contre-ordre",
  ];
  const ids = new Set(DRAFT_NOTE_CORPUS.map((e) => e.id));
  for (const id of required) assert(ids.has(id), `cas obligatoire manquant: ${id}`);
});

// ===========================================================================
// LE PARSEUR, CAS PAR CAS
// ===========================================================================

for (const entry of DRAFT_NOTE_CORPUS) {
  Deno.test(`lecteur — ${entry.id}`, () => {
    const outcome = readDraftNoteClassification({
      raw: entry.model,
      today: CORPUS_TODAY,
      targetWeek: CORPUS_TARGET_WEEK,
      members: CORPUS_MEMBERS,
      note: entry.note,
      writtenAt: `${CORPUS_TODAY}T20:40:00.000Z`,
      planFoods: CORPUS_PLAN_FOODS,
    });
    assert(outcome.ok, `${entry.id}: la charge n'a pas été lue (${outcome.refusal})`);
    assertEquals(
      sorted(flatten(outcome.classification)),
      sorted(entry.expected),
      `${entry.id} — ${entry.why}`,
    );
  });
}

// ===========================================================================
// CE QUI DOIT ÊTRE VRAI SUR TOUT LE CORPUS
// ===========================================================================

Deno.test("lecteur — la citation est la note entière, jamais le texte extrait", () => {
  // Lot M2: la citation est ce que la PERSONNE a écrit. Une citation
  // reformulée est une citation fausse, et elle est pire que pas de citation.
  for (const entry of DRAFT_NOTE_CORPUS) {
    const { classification } = readDraftNoteClassification({
      raw: entry.model,
      today: CORPUS_TODAY,
      targetWeek: CORPUS_TARGET_WEEK,
      members: CORPUS_MEMBERS,
      note: entry.note,
      writtenAt: null,
      planFoods: CORPUS_PLAN_FOODS,
    });
    for (const item of classification.preferences.items) {
      assertEquals(item.quote, entry.note.trim(), `${entry.id}: citation réécrite`);
    }
    for (const e of classification.nextPlan.entries) {
      assertEquals(e.item.quote, entry.note.trim(), `${entry.id}: citation réécrite`);
    }
  }
});

Deno.test("lecteur — aucune ligne ne naît d'un producteur qu'elle n'a pas", () => {
  for (const entry of DRAFT_NOTE_CORPUS) {
    const { classification } = readDraftNoteClassification({
      raw: entry.model,
      today: CORPUS_TODAY,
      targetWeek: CORPUS_TARGET_WEEK,
      members: CORPUS_MEMBERS,
      note: entry.note,
      writtenAt: null,
      planFoods: CORPUS_PLAN_FOODS,
    });
    for (const item of classification.preferences.items) {
      assertEquals(item.source, "draft_note", `${entry.id}: source usurpée`);
    }
  }
});

Deno.test("lecteur — une allergie ne devient JAMAIS autre chose qu'une exclusion", () => {
  // ⛔ Il n'existe aucun `kind` de sécurité, et c'est structurel: la table
  // `student_safety_constraints` se remplit par consentement, pas par
  // classification. Ce cas le prouve sur une phrase qui DIT « ça me rend
  // malade » — la formulation la plus proche d'une déclaration médicale.
  const entry = DRAFT_NOTE_CORPUS.find((e) => e.id === "allergie-sur-un-retour")!;
  const { classification } = readDraftNoteClassification({
    raw: entry.model,
    today: CORPUS_TODAY,
    targetWeek: CORPUS_TARGET_WEEK,
    members: CORPUS_MEMBERS,
    note: entry.note,
    writtenAt: null,
    planFoods: CORPUS_PLAN_FOODS,
  });
  assertEquals(classification.preferences.items.length, 1);
  assertEquals(classification.preferences.items[0].kind, "food.exclude");
  assertEquals(classification.preferences.items[0].scope, "durable");
});

// ===========================================================================
// LE CÂBLAGE DE LA CONSIGNE — la promesse TOUCHE la clé
// ===========================================================================

/**
 * La ligne de la consigne qui porte une clé donnée.
 *
 * ⚠️ ON LIT LA SOURCE, on ne réécrit pas la règle. Un test qui recopierait la
 * phrase attendue resterait vert le jour où la consigne la perd.
 */
function lineWith(needle: string): string | null {
  for (const line of DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT.split("\n")) {
    if (line.includes(needle)) return line;
  }
  return null;
}

/**
 * LA LIGNE DE TITRE D'UN TIROIR — `N. "nom" — …`.
 *
 * ⚠️ PAS `lineWith('"slots"')`: la première ligne qui porte ce mot est la
 * ligne de FORME JSON, où tous les tiroirs sont listés. Un test qui l'aurait
 * lue aurait épinglé la présence d'une clé dans un exemple, jamais l'existence
 * de la consigne qui va avec.
 */
function drawerLine(name: string): string | null {
  const re = new RegExp(`^\\d+\\. "${name}"`);
  for (const line of DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT.split("\n")) {
    if (re.test(line)) return line;
  }
  return null;
}

/**
 * LES LIGNES D'UN SEUL TIROIR — de son titre au titre suivant.
 *
 * ⚠️ PLUSIEURS TIROIRS PARTAGENT LEURS CLÉS. `"slot":` apparaît dans le mémo
 * (③, sous `when`), dans la taille (⑥) et dans la case (⑨), avec des
 * vocabulaires DIFFÉRENTS. Chercher la première occurrence dans tout le prompt
 * épinglerait le tiroir d'à côté — et laisserait passer exactement l'erreur
 * qu'on veut tenir: un tiroir qui propose un moment que son écrivain jette.
 */
function drawerBlock(name: string): readonly string[] {
  const lines = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^\\d+\\. "${name}"`).test(l));
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^\d+\. "/.test(l));
  return [lines[start], ...(end < 0 ? rest : rest.slice(0, end))];
}

Deno.test("consigne — le DÉCOUPAGE est demandé, et il l'est SUR la clé du texte", () => {
  // Mesuré: « tofu, poissons » est resté un seul souvenir. Le modèle n'a nulle
  // part lu qu'une liste fait N entrées — et une consigne posée trois
  // paragraphes plus bas que sa clé n'est pas lue (0 % mesuré dans ce dépôt).
  const line = lineWith('"text": the thing you are filing');
  assert(line !== null, "la clé `text` a disparu de la consigne");
  const says = /one entry per food|ONE ENTRY PER FOOD|one food per entry/i.test(line!);
  assert(
    says,
    "la consigne ne demande pas UN ALIMENT PAR ENTRÉE sur la ligne de `text`:\n" + line,
  );
});

Deno.test("consigne — le MOMENT est proposé aux familles d'aliments, sur sa clé", () => {
  const line = lineWith('"occasion"');
  assert(
    line !== null,
    "la consigne ne propose aucun `occasion` aux familles d'aliments — " +
      "« pas de tofu AU PETIT DÉJEUNER » n'a donc nulle part où mettre son moment",
  );
  for (const slot of RHYTHM_OCCASIONS) {
    assert(
      line!.includes(slot),
      `le vocabulaire des moments est incomplet sur la ligne de \`occasion\`: ${slot} manque`,
    );
  }
});

Deno.test("consigne — la TAILLE d'un moment a un tiroir, et il refuse les nombres", () => {
  assert(
    drawerLine("slots") !== null,
    "aucun tiroir pour la taille d'un moment — « très léger le matin » n'a " +
      "aucune destination, alors que la case « repas léger » existe sur la fiche",
  );
  // ⛔ LA PROMESSE TOUCHE LA CLÉ. « vrai ou faux et rien d'autre » doit être SUR
  // la ligne de `"light"`, pas trois paragraphes plus bas: une consigne séparée
  // de sa clé n'est pas lue (0 % mesuré dans ce dépôt).
  const light = drawerBlock("slots").find((l) => l.includes('"light"')) ?? null;
  assert(light !== null, "le tiroir de la taille ne nomme pas la marque qu'il déplace");
  for (const banned of ["number", "calor", "size"]) {
    assert(
      light!.toLowerCase().includes(banned),
      `la ligne de \`light\` n'interdit pas « ${banned} » — le modèle a le ` +
        "droit d'inventer une amplitude que personne ne lui a demandée",
    );
  }
  const slot = drawerBlock("slots").find((l) => l.includes('"slot":')) ?? null;
  assert(slot !== null, "le tiroir de la taille ne nomme aucun moment");
  // ⛔ LES TROIS MOMENTS QUI PORTENT LA MARQUE, ET EUX SEULS. Proposer les six
  // ferait un TIROIR MUET: le modèle rangerait « léger au goûter », le lecteur
  // le garderait, et `parseMemberLight` le jetterait sans un mot — une
  // collation pèse déjà un dixième de la journée.
  for (const occasion of LIGHT_BEARING_SLOTS) {
    assert(
      slot!.includes(occasion),
      `le vocabulaire des moments est incomplet dans le tiroir: ${occasion} manque`,
    );
  }
  for (const occasion of RHYTHM_OCCASIONS) {
    if ((LIGHT_BEARING_SLOTS as readonly string[]).includes(occasion)) continue;
    assert(
      !slot!.includes(occasion),
      `le tiroir propose « ${occasion} », qu'aucun écrivain ne sait poser: ` +
        "ce que le modèle y rangerait tomberait en silence",
    );
  }
});

Deno.test("consigne — le tiroir de la taille NE SE CONFOND PAS avec le rythme", () => {
  // `rhythm.set` reste INTERDIT à ce producteur: quels repas on prend est un
  // réglage de l'écran. La taille d'un repas qu'on prend déjà est autre chose,
  // et la consigne doit le dire — sinon le modèle range l'un pour l'autre.
  const prompt = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT;
  assert(
    prompt.includes("rhythm.set"),
    "la famille interdite n'est plus nommée dans la consigne",
  );
  const title = drawerLine("slots");
  assert(title !== null, "pas de tiroir `slots`");
  assert(
    /already takes? that meal/i.test(title!),
    "le titre du tiroir `slots` ne dit pas qu'il parle d'un repas DÉJÀ pris, " +
      "et non de la liste des repas — c'est la confusion que `rhythm.set` interdit",
  );
  // Et l'interdit est écrit dans le tiroir lui-même, pas seulement dans le titre.
  assert(
    DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT.includes("NOT WHICH MEALS THEY TAKE"),
    "le tiroir `slots` n'interdit pas d'y ranger « elle ne dîne pas », qui est " +
      "un réglage d'écran et non la taille d'un repas",
  );
});

// ===========================================================================
// ⟳ 2026-09-22 — « MOINS » N'EST PAS « JAMAIS »
// ===========================================================================
//
// ── LE DÉFAUT QUE CES CAS FERMENT, MESURÉ SUR LE SEUL COMPTE RÉEL ─────────
// « Pas AUTANT de petit suisse le matin » est devenue un `food.exclude` sans
// nuance : la ceinture a retiré l'aliment de toutes les boîtes, pour toujours,
// sur une phrase qui demandait MOINS. Le produit n'avait que deux pôles, et
// une phrase de quantité tombait sur le pôle fort — celui dont on ne s'aperçoit
// qu'en remarquant une absence.

Deno.test("consigne — la FORCE d'un refus est proposée, et SUR sa clé", () => {
  const line = lineWith('"force"');
  assert(
    line !== null,
    "la consigne ne propose aucune `force` — « pas autant de X » et « plus " +
      "jamais de X » ne peuvent pas être distingués, et la première devient " +
      "la seconde",
  );
  for (const force of EXCLUSION_FORCES) {
    assert(line!.includes(force), `le vocabulaire de force est incomplet: ${force} manque`);
  }
  // ⛔ LA PROMESSE TOUCHE LA CLÉ: ce que la valeur DÉCIDE est dit là, pas
  // trois paragraphes plus bas (0 % mesuré dans ce dépôt).
  assert(
    /taken off|removes? for good|GONE/i.test(line!),
    "la ligne de `force` ne dit pas ce qu'elle décide — que l'aliment quitte " +
      "l'assiette ou non",
  );
});

Deno.test("consigne — la force n'est proposée QU'aux familles qui refusent", () => {
  // Une valeur dont personne ne lit la différence est décorative, et une
  // valeur décorative finit par être pilotée. Aucun lecteur ne distingue
  // « j'aimerais plus de légumes » de « il me faut des légumes ».
  const line = lineWith('"force"')!;
  assert(/food\.exclude/.test(line), "la force ne nomme pas la famille qui la porte");
  assert(
    /Omit the key on .*food\.prefer/i.test(line),
    "la consigne ne dit pas d'omettre la force sur les familles qui veulent",
  );
});

Deno.test("consigne — la FAUTE DE FRAPPE se corrige dans le texte, jamais dans la citation", () => {
  // Mesuré : « lesoeufs » est en base, tel quel, depuis le 2026-09-20. Ce texte
  // est CHERCHÉ dans le plan — une faute ne trouve rien, et la règle ne mord
  // jamais. La citation, elle, garde ses mots: rien n'est perdu.
  const line = lineWith('"text": the thing you are filing')!;
  assert(
    /SPELLED|spelling|lesoeuf/i.test(line),
    "la consigne ne demande pas d'écrire l'aliment correctement — une faute " +
      "rend la règle inerte, et la personne lit sa faute sur sa carte",
  );
  assert(
    /quote/i.test(line),
    "la consigne corrige sans dire que les mots exacts survivent dans la " +
      "citation — c'est ce qui rend la correction honnête",
  );
});

Deno.test("consigne — UN ABANDON SE NOMME: « plus de saumon » va dans skipped, pas dans le vide", () => {
  // Mesuré le 2026-09-22, banc réel, « plus de saumon »: 1 fois sur 6 le
  // modèle a rendu NEUF LISTES VIDES — il a bien laissé tomber la direction
  // indécidable, mais sans le dire. La règle « DIRECTION FIRST » disait
  // « leave the item out » et rien de plus; la règle qui exige de nommer un
  // vide vit dans le tiroir 7, cent quatre-vingts lignes plus bas. Le
  // produit rend la même chose (rien d'écrit) mais le journal ne distingue
  // plus « lu et écarté » de « pas lu »: `skipped_other` est le compteur, et
  // la règle qui fait tomber l'item doit dire où il tombe.
  const line = lineWith("DIRECTION FIRST, AND WHEN IN DOUBT DROP IT")!;
  assert(
    /name it in "skipped" \(7\) with "other"/.test(line),
    "la règle qui fait tomber l'item ne dit pas où il tombe",
  );
  assert(
    /every list empty and no reason reads as a note nobody read/.test(line),
    "la règle ne nomme pas ce que coûte un vide sans motif",
  );
  // Le numéro cité est celui du tiroir, pas un numéro d'avant la renumérotation.
  assert(lineWith('7. "skipped"') !== null, "le tiroir 7 n'est plus « skipped »");
});

Deno.test("consigne — LA TAILLE N'ABSORBE PAS LES ALIMENTS NOMMÉS AVEC ELLE", () => {
  // Mesuré le 2026-09-22, banc réel, la note du 2026-09-20 entière (« le
  // matin c'est plutôt quelque chose de très léger… fruit, bol de muesli, mais
  // les œufs ça lui convient pas »): 2 fois sur 7 le modèle a coché la case
  // « repas léger » et rangé les œufs, et LAISSÉ TOMBER fruit et muesli — sans
  // les nommer dans `skipped`. Le tiroir `slots` donnait « very light in the
  // morning » comme exemple de taille et ne disait rien des aliments cités
  // avec elle: lus comme des illustrations de « léger », ils disparaissaient.
  // Le tiroir doit dire que la taille dit COMBIEN et les aliments QUOI, et
  // que les deux se rangent.
  const lines = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT.split("\n");
  const slots = lines.findIndex((l) => l.startsWith('6. "slots"'));
  assert(slots >= 0, "le tiroir 6 n'est plus « slots »");
  const rule = lines.slice(slots, slots + 12).find((l) => /THE FOODS NAMED WITH THE SIZE ARE FILED TOO/.test(l));
  assert(rule !== undefined, "le tiroir slots ne dit pas que les aliments cités avec la taille se rangent aussi");
  assert(
    /fruit and muesli preferred at breakfast, eggs excluded at breakfast/.test(rule!),
    "l'exemple mesuré (trois entrées en ①, avec leur moment) a disparu",
  );
  assert(
    /neither absorbs the other/.test(rule!),
    "la règle ne dit pas qu'aucun des deux tiroirs n'absorbe l'autre",
  );
});

Deno.test("consigne — UNE CATÉGORIE ÉNONCÉE EN RÈGLE RESTE LA CATÉGORIE, jamais le seul plat du plan", () => {
  // Mesuré le 2026-09-23 sur des notes HORS corpus (banc-notes-libres): « les
  // enfants ne mangent pas de poisson sauf le saumon » → `food.exclude
  // «Cabillaud vapeur»` 7 fois sur 7 ; « moins de viande rouge » → «Bœuf
  // braisé» 3 fois sur 7. La règle WHAT disait « si UN SEUL aliment du plan
  // convient, range-le » sans distinguer une RÉACTION à un plat servi (« j'ai
  // pas aimé la viande ») d'une RÈGLE sur une catégorie. Rangée sur le plat de
  // cette semaine, la règle laisse passer tous les autres poissons dès le plan
  // suivant — alors que la ceinture DÉPLIE une catégorie en espèces toute
  // seule (`food_exclusion_belt.ts`, « poisson » → saumon, thon…).
  const lines = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT.split("\n");
  const what = lines.findIndex((l) => l.startsWith("WHAT — on the same three drawers"));
  assert(what >= 0, "le bloc WHAT a disparu");
  assert(/a food they were SERVED/.test(lines[what]), "le bloc WHAT ne se limite plus à un plat SERVI");
  const rule = lines.slice(what, what + 8).find((l) => /A CATEGORY STATED AS A RULE IS NOT A "what"/.test(l));
  assert(rule !== undefined, "la consigne ne dit pas qu'une catégorie énoncée en règle reste la catégorie");
  assert(
    /"the kids never eat fish" is "poisson", not the one fish dish in this plan/.test(rule!),
    "l'exemple mesuré (poisson → le seul poisson du plan) a disparu",
  );
  assert(/unfolds it into every species on its own/.test(rule!), "la consigne ne dit pas que la ceinture déplie la catégorie");
  assert(/Narrowed to one dish, the rule lets every other fish through/.test(rule!), "la consigne ne nomme pas ce que l'erreur coûte");
});

Deno.test("⟳ 2026-09-23 — LE RÔLE DIT QUI ÉCRIT, et « moi » se résout dessus", () => {
  // Mesuré hors corpus: « le petit dej c'est juste un café pour moi » →
  // `slots breakfast light=true` pour TOUTE LA TABLE (6/6) ; « moi le soir je
  // mange pas de féculents » → féculents retirés à quatre personnes (3/3) ;
  // « Thomas et moi » → Christèle, devinée parce que Thomas était nommé à
  // part. Le rôle ne disait pas qui écrit. ① le rôle rendu porte `writes`
  // sur CHAQUE ligne (true une fois, false ailleurs — une clé absente
  // laisserait deviner) ; ② la règle WHO nomme la ligne à `true` comme le
  // référent de « moi », avec l'exemple mesuré et ce que coûte l'erreur ;
  // ③ elle ne défait pas la règle de la RAISON à la première personne.
  const prompt = buildDraftNoteClassifyPrompt({
    note: "x", contentLocale: "fr-FR", members: CORPUS_MEMBERS, planFoods: [], rejectedDishes: [],
  });
  const trues = (prompt.match(/"writes":true/g) ?? []).length;
  const falses = (prompt.match(/"writes":false/g) ?? []).length;
  assertEquals(trues, 1, "une seule ligne du rôle écrit la note");
  assertEquals(falses, CORPUS_MEMBERS.length - 1, "les autres lignes portent writes:false, jamais rien");
  assert(
    /"writes": true marks the person whose account this note is written from/.test(prompt),
    "le bloc du rôle ne dit pas ce que « writes » veut dire",
  );
  const who = lineWith("THE ONE WHO WRITES SPEAKS FOR THE WHOLE TABLE BY DEFAULT");
  assert(who !== null, "la règle WHO ne résout plus « moi »");
  assert(/the roster line with "writes": true/.test(who!), "la règle ne pointe pas la ligne à writes:true");
  // ⟳ Le premier jet disait « "I", "ME" AS THE SUBJECT IS THE PERSON WRITING » et
  // le modèle a rangé sur Thomas des notes qui ne nommaient PERSONNE (« je veux
  // pas de tofu le matin », « j'ai envie de fajitas ») : 52/58 au banc. Le
  // cuisinier parle pour la table par défaut ; « moi » ne le désigne que
  // quand la phrase le met À PART, ou parle de son corps ou de son assiette.
  assert(/"no tofu in the morning".*stay null/.test(who!), "la règle ne dit plus que le cuisinier parle pour la table par défaut");
  assert(/ONLY WHEN THE SENTENCE SETS THEM APART FROM THE OTHERS, OR IS ABOUT THEIR OWN BODY OR PLATE/.test(who!), "la règle ne borne plus « moi » à la mise à part");
  assert(/a menu rule filed on the writer leaves the rest of the table free/.test(who!), "la règle ne nomme pas ce que coûte l'erreur inverse");
  assert(/"breakfast is just a coffee for me" is that one person/.test(who!), "l'exemple mesuré a disparu");
  assert(/Filed as null it puts four breakfasts on a coffee/.test(who!), "la règle ne nomme pas ce que coûte l'erreur");
  assert(/THIS DOES NOT UNDO THE RULE ABOVE/.test(who!), "la règle ne protège pas celle de la RAISON à la première personne");
  assert(/When no roster line has "writes": true, "me" eats alone at this table: null/.test(who!), "le cas du compte seul n'est pas dit");
});

Deno.test("⟳ 2026-09-23 — `writes` est REQUIS sur un membre: absent, le type refuse", () => {
  // ⛔ Un `writes?` serait une garde désarmée: un appelant qui l'oublie
  // rendrait « moi » à toute la table sans qu'un test le voie.
  const ok: DraftNoteMember = {
    memberId: "11111111-1111-4111-8111-111111111111", label: "A", ageState: "adult", sex: null, writes: true,
  };
  // @ts-expect-error — `writes` manquant: c'est la garde.
  const missing: DraftNoteMember = { memberId: ok.memberId, label: "A", ageState: "adult", sex: null };
  assertEquals(typeof missing.writes, "undefined");
});

Deno.test("consigne — « ON MANGE MOINS » est la table entière: une part par personne, jamais null ni un degré", () => {
  // Mesuré le 2026-09-23 hors corpus: 2/3 `portions` avec `member_id: null`
  // (refusé par le lecteur — une part appartient à UNE bouche), 1/3 `skipped:
  // degree`. « Christèle mange moins » et « on mange TOUS un peu moins »
  // passaient 3/3 ; c'est le « on » nu qui n'avait pas de règle dans le tiroir.
  const lines = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT.split("\n");
  const portions = lines.findIndex((l) => l.startsWith('4. "portions"'));
  assert(portions >= 0, "le tiroir 4 n'est plus « portions »");
  const rule = lines.slice(portions, portions + 10).find((l) => /"ON MANGE MOINS"/.test(l));
  assert(rule !== undefined, "le tiroir des parts ne dit pas ce que vaut « on »");
  assert(/ONE ENTRY PER PERSON on the roster/.test(rule!), "la règle ne dit pas « une entrée par personne »");
  assert(/Never member_id: null/.test(rule!) && /never "clarify"/.test(rule!) && /never "skipped" as a degree/.test(rule!), "la règle ne ferme pas les trois issues mesurées");
});

Deno.test("⟳ 2026-09-23 — ⑩ LA SÉCURITÉ: le mot, la preuve citée, et « dans le doute, ① » — sur les lignes des clés", () => {
  // Décision du propriétaire: une note pose une allergie, une intolérance ou
  // un régime SEULEMENT quand la phrase le dit, et le classifieur doit en être
  // certain. La promesse touche la clé (0 % sinon): la condition est sur la
  // ligne du titre, la garde vérifiable sur celle de `because`.
  const lines = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT.split("\n");
  const at = lines.findIndex((l) => l.startsWith('10. "safety"'));
  assert(at >= 0, "le tiroir 10 n'est plus « safety »");
  const title = lines[at];
  assert(/certainty means THE WORD/.test(title), "le titre ne dit plus que la certitude, c'est le mot");
  assert(/allergique/.test(title) && /intolérant/.test(title) && /ne tolère pas/.test(title), "les mots français de la certitude ont disparu");
  assert(/WITHOUT THAT WORD IT IS NOT HERE/.test(title), "le titre ne ferme plus la porte sans le mot");
  assert(/« je supporte pas »/.test(title) && /"it makes me ill"/.test(title), "les exemples SANS le mot ont disparu");
  assert(/WHEN IN DOUBT, \(1\)/.test(title), "le repli sûr (un goût) n'est plus nommé");
  const block = lines.slice(at, at + 16);
  const because = block.find((l) => l.startsWith('  "because":'));
  assert(because !== undefined, "la clé `because` a quitté le tiroir 10");
  assert(/COPIED LETTER FOR LETTER/.test(because!) && /CHECKED against the note/.test(because!), "la ligne de `because` ne dit plus qu'elle est vérifiée");
  const member = block.find((l) => l.startsWith('  "member_id":'));
  assert(/NEVER null/.test(member!) && /ONE ENTRY PER PERSON/.test(member!), "la bouche d'une allergie n'est plus exigée");
  assert(/"writes": true/.test(member!), "« je » ne pointe plus la personne qui écrit");
  // Mesuré le 2026-09-23: « range l'aliment en ① et suis la règle WHO » a
  // donné 1 fois sur 3 la question ET le kiwi banni pour toute la table.
  assert(/ONE entry in "clarify" \(8\)/.test(member!) && /NOTHING in \(1\)/.test(member!), "l'allergie de bouche ambiguë peut de nouveau être rangée ET demandée");
  assert(block.some((l) => /AN ALLERGY IS NEVER TAKEN OFF BY A NOTE/.test(l)), "une note pourrait retirer une allergie");
  assert(block.some((l) => /A DIET TIED TO A DAY, A MEAL OR A FREQUENCY IS NOT A DIET/.test(l)), "un régime d'un soir pourrait devenir la fiche");
  // Le tiroir ① renvoie vers ⑩, sur sa ligne `kind` — sinon « premier tiroir qui convient » l'attrape.
  const kind1 = lineWith('NEVER craving here')!;
  assert(/NEVER AN ALLERGY, AN INTOLERANCE OR A DIET STATED WITH ITS WORD/.test(kind1) && /"safety" \(10\)/.test(kind1), "① n'envoie plus l'allergie DITE vers ⑩");
  // L'ancienne interdiction (« au plus une food.exclude ») ne revient pas contredire ⑩.
  assert(!DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT.includes("is at most a food.exclude"), "l'ancienne règle contredit la nouvelle");
});

Deno.test("consigne — « PLUS DE X » + UNE RAISON CONTRE X = « plus jamais », pas un doute", () => {
  // Mesuré le 2026-09-23: « plus de fruits à coque, ça me rend malade » jeté en
  // `skipped` 4 fois sur 6, une fois la porte ⑩ ajoutée (« ça me rend malade »
  // n'est pas une allergie) — la règle DIRECTION disait « dans le doute, lâche »
  // sans dire que la RAISON lève le doute. Et « plus de saumon » seul doit
  // rester lâché: l'autre moitié.
  const line = lineWith("DIRECTION FIRST, AND WHEN IN DOUBT DROP IT")!;
  assert(/A REASON IN THE SENTENCE DECIDES IT/.test(line), "la raison ne lève plus le doute");
  assert(/« plus de fruits à coque, ça me rend malade »/.test(line), "l'exemple mesuré a disparu");
  assert(/NOTHING else in the sentence says which: « plus de saumon » alone/.test(line), "le cas qui reste douteux n'est plus nommé");
});

Deno.test("consigne — « POUR NOUS » EST UNE LIGNE DE TABLE (null) en ①②③ ; seuls ④ et ⑩ découpent par personne", () => {
  // Mesuré le 2026-09-23: une fois les règles « une entrée par personne »
  // posées en ④ (« on mange moins ») et en ⑩ (« on est végétariens »), « trop
  // de fritures pour nous » est sorti en QUATRE préférences 2 fois sur 6 — la
  // table a son propre canal (`subject: household`), et quatre lignes
  // identiques encombrent la carte de chacun.
  const line = lineWith("null when it is for everyone at the table")!;
  assert(/« pour nous »/.test(line) && /ARE the whole table/.test(line), "« nous » n'est plus dit comme la table");
  assert(/in \(1\), \(2\) and \(3\) that is ONE entry with null — never one per person/.test(line), "la table peut de nouveau être découpée en ①②③");
  assert(/Only \(4\) and \(10\) split the table/.test(line), "les deux exceptions ne sont plus nommées");
});

Deno.test("consigne — UNE COMPARAISON N'EST PAS UNE INTERDICTION", () => {
  // Mesuré le 2026-09-22, banc réel, « Christèle aimerait du muesli le matin,
  // plutôt qu'un bol de céréales »: 1 passage complet sur 4, le modèle a
  // ajouté `food.exclude céréales @breakfast, force: never` — le PERDANT de la
  // comparaison, rangé comme un bannissement. Personne n'a dit « jamais de
  // céréales »: elle a classé deux aliments. La consigne doit dire que le
  // perdant ne se range pas du tout — ni « never », ni « less » — et ce que
  // l'erreur coûte (l'aliment disparaît tous les matins).
  const line = lineWith('"force": ON')!;
  assert(
    /A COMPARISON IS NOT A BAN/.test(line),
    "la consigne ne dit pas qu'une comparaison n'interdit rien",
  );
  assert(
    /files NOTHING for the cereal — neither "never" nor "less"/.test(line),
    "la consigne ne dit pas que le perdant ne se range pas, sous aucune force",
  );
  assert(
    /gone every morning for good/.test(line),
    "la consigne ne nomme pas ce que l'erreur coûte",
  );
});

Deno.test("lecteur — un jeton de force hors liste fait TOMBER l'item", () => {
  // ⛔ PAS DE REPLI. Ni vers `never` (on bannirait sur une valeur illisible),
  // ni vers `less` (on désarmerait). « Je n'ai pas su lire » n'est ni l'un ni
  // l'autre.
  for (const bad of ["parfois", "moyen", 1, true]) {
    const out = readDraftNoteClassification({
      raw: {
        preferences: [{ kind: "food.exclude", text: "curry", member_id: null, force: bad }],
        next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
        skipped: [], clarify: [],
      },
      today: CORPUS_TODAY,
      targetWeek: CORPUS_TARGET_WEEK,
      members: CORPUS_MEMBERS,
      note: "test",
      writtenAt: null,
      planFoods: CORPUS_PLAN_FOODS,
    });
    assertEquals(
      out.classification.preferences.kept,
      0,
      `\`force: ${JSON.stringify(bad)}\` a été gardé`,
    );
  }
});

Deno.test("lecteur — une ligne SANS force est une INTERDICTION, jamais une tendance", () => {
  // ⛔ LE REPLI VA VERS LA RÈGLE FORTE, ET C'EST LE SENS QUI PROTÈGE. Toutes
  // les lignes écrites avant ce lot n'ont pas la clé; les relire en « moins »
  // désarmerait la ceinture sur toute la base, le jour du déploiement, sans
  // un mot. L'imprécision coûte un plat évité de trop, jamais un plat servi à
  // qui l'a refusé.
  const out = readDraftNoteClassification({
    raw: {
      preferences: [{ kind: "food.exclude", text: "curry", member_id: null }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    today: CORPUS_TODAY,
    targetWeek: CORPUS_TARGET_WEEK,
    members: CORPUS_MEMBERS,
    note: "plus de curry",
    writtenAt: null,
    planFoods: CORPUS_PLAN_FOODS,
  });
  assertEquals(out.classification.preferences.kept, 1);
  assertEquals(
    (out.classification.preferences.items[0] as { force?: unknown }).force,
    "never",
  );
});

Deno.test("lecteur — une force posée sur une famille qui VEUT fait tomber l'item", () => {
  const out = readDraftNoteClassification({
    raw: {
      preferences: [{ kind: "food.prefer", text: "légumes", member_id: null, force: "less" }],
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    today: CORPUS_TODAY,
    targetWeek: CORPUS_TARGET_WEEK,
    members: CORPUS_MEMBERS,
    note: "test",
    writtenAt: null,
    planFoods: CORPUS_PLAN_FOODS,
  });
  assertEquals(
    out.classification.preferences.kept,
    0,
    "« moins d'envie » a été gardé: une distinction que personne ne lit",
  );
});

// ===========================================================================
// ⟳ 2026-09-22 · LOT B — CE QU'UNE PHRASE A LE DROIT DE LAISSER
// ===========================================================================
//
// ── LE DÉFAUT MESURÉ EN BASE ─────────────────────────────────────────────
// UNE phrase — « mets des bols de flocons d'avoines avec du lait d'avoine et
// des choses dedans genre graines amendes etc.. » — a produit **cinq souvenirs
// durables**, chacun une règle permanente du foyer. La personne a demandé UNE
// chose : changer son petit-déjeuner. Quatre préférences indépendantes
// autorisent le plan à servir des amandes au dîner en se croyant fidèle.

Deno.test("consigne — UNE RECETTE EST UN PLAT, et la consigne le dit SUR la clé", () => {
  const line = lineWith('"text": the thing you are filing')!;
  assert(
    /ONE ENTRY .*WHEN THEY DESCRIBE ONE DISH/i.test(line),
    "la consigne ne distingue pas une liste d'aliments d'un plat fait de " +
      "plusieurs — une recette devient N règles permanentes",
  );
  // ⛔ ET ELLE DIT LE COÛT, pas seulement la règle: une consigne qui n'explique
  // pas ce qu'elle évite est une consigne qu'on relâche au premier doute.
  assert(
    /almonds at dinner|standing rules/i.test(line),
    "la consigne ne dit pas ce que quatre entrées coûtent",
  );
});

Deno.test("consigne — L'ALIMENT SANS SON CONTENANT NI SA QUANTITÉ", () => {
  // Mesuré: `bol de muesli` ne résout rien, `muesli` résout vers `granola`.
  const line = lineWith('"text": the thing you are filing')!;
  assert(
    /WITHOUT WHAT HOLDS IT|bowl of muesli/i.test(line),
    "la consigne n'écarte pas le contenant: « bol de muesli » reste un " +
      "souvenir que rien ne peut chercher",
  );
});

Deno.test("consigne — L'ALIMENT, PAS LE VERDICT: la phrase entière n'est pas un souvenir", () => {
  // Mesuré le 2026-09-22, banc réel, note « lesoeuf ça convient pas à
  // Christèle »: 2 fois sur 6 le modèle a rangé `text: "les œufs ça convient
  // pas à Christèle"` — la phrase, verdict et prénom compris. Le lecteur l'a
  // refusée (`badText`) parce qu'elle dépassait la note d'UN caractère: une
  // note plus longue l'aurait gardée, et « les œufs ça convient pas à
  // Christèle » serait devenu une ligne que rien ne peut chercher — le défaut
  // du composite du 2026-09-21, à l'envers. La consigne doit dire que le
  // verdict est déjà dans `kind` et la personne dans `member_id`, avec la
  // phrase mesurée comme exemple.
  const line = lineWith('"text": the thing you are filing')!;
  assert(
    /THE FOOD, NOT THE VERDICT/i.test(line),
    "la consigne ne dit pas que le verdict n'entre pas dans `text`",
  );
  assert(
    /"kind" already carries/i.test(line) && /"member_id" who/i.test(line),
    "la consigne ne nomme pas OÙ vont le verdict et la personne",
  );
  assert(
    /files as "les œufs" — never the whole sentence/.test(line),
    "l'exemple mesuré (la phrase entière → le seul aliment) a disparu",
  );
});

Deno.test("consigne — ET LA LISTE RESTE UNE LISTE — les deux moitiés", () => {
  // Une consigne qui fondrait toute énumération en un seul souvenir referait
  // le défaut du composite du 2026-09-21.
  const line = lineWith('"text": the thing you are filing')!;
  assert(
    /ONE FOOD PER ENTRY when the sentence LISTS foods/i.test(line),
    "le découpage d'une liste a disparu en réparant la recette",
  );
});

Deno.test("⟳ LOT B — LE PLAFOND COUPE, ET IL SE COMPTE", () => {
  // ⛔ CE PLAFOND NE RÉPARE RIEN. La réparation est dans la consigne; lui est
  // ce qui la MESURE. `over_cap > 0` dit que la phrase a été lue comme une
  // liste d'ingrédients — et c'est le seul moyen de le savoir sans relire des
  // notes une par une.
  const rows = Array.from({ length: 9 }, (_, i) => ({
    kind: "food.exclude",
    text: `aliment ${i}`,
    member_id: null,
    occasion: null,
    force: "never",
  }));
  const out = readDraftNoteClassification({
    raw: {
      preferences: rows,
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    today: CORPUS_TODAY,
    targetWeek: CORPUS_TARGET_WEEK,
    members: CORPUS_MEMBERS,
    note: "une note qui énumère",
    writtenAt: null,
    planFoods: CORPUS_PLAN_FOODS,
  });
  assertEquals(out.classification.preferences.kept, DRAFT_NOTE_MAX_RETAINED);
  assertEquals(out.classification.preferences.refused.overCap, 9 - DRAFT_NOTE_MAX_RETAINED);
  // ⚠️ LES k PREMIERS, et c'est la seule règle qui se raconte. Jeter au hasard
  // coûterait à la personne des mots qu'elle a vraiment écrits.
  assertEquals(out.classification.preferences.items[0].text, "aliment 0");
});

Deno.test("⛔ LOT B — LE PLAFOND EST PARTAGÉ PAR LES DEUX PORTES", () => {
  // Un plafond PAR PORTE aurait laissé passer douze souvenirs: six préférences
  // plus six envies, pour une seule phrase. Ce qu'on borne est ce qu'une
  // phrase LAISSE DERRIÈRE ELLE.
  const four = (kind: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      kind,
      text: `${kind} ${i}`,
      member_id: null,
      occasion: null,
      ...(kind === "food.exclude" ? { force: "never" } : {}),
    }));
  const out = readDraftNoteClassification({
    raw: {
      preferences: four("food.exclude", 4),
      next_plan: four("craving", 4),
      notes: [], portions: [], settings: [], slots: [], cells: [], skipped: [], clarify: [],
    },
    today: CORPUS_TODAY,
    targetWeek: CORPUS_TARGET_WEEK,
    members: CORPUS_MEMBERS,
    note: "une note qui énumère des deux côtés",
    writtenAt: null,
    planFoods: CORPUS_PLAN_FOODS,
  });
  const kept = out.classification.preferences.kept + out.classification.nextPlan.kept;
  assertEquals(kept, DRAFT_NOTE_MAX_RETAINED, "les deux portes ont chacune son plafond");
  assertEquals(
    out.classification.preferences.refused.overCap +
      out.classification.nextPlan.refused.overCap,
    8 - DRAFT_NOTE_MAX_RETAINED,
  );
});

Deno.test("⛔ LOT B — SOUS LE PLAFOND, RIEN N'EST COUPÉ", () => {
  // Une garde qui couperait toujours ressemblerait à une garde qui marche —
  // et elle coûterait à chaque personne la fin de ses phrases.
  const out = readDraftNoteClassification({
    raw: {
      preferences: Array.from({ length: DRAFT_NOTE_MAX_RETAINED }, (_, i) => ({
        kind: "food.exclude",
        text: `aliment ${i}`,
        member_id: null,
        occasion: null,
        force: "never",
      })),
      next_plan: [], notes: [], portions: [], settings: [], slots: [], cells: [],
      skipped: [], clarify: [],
    },
    today: CORPUS_TODAY,
    targetWeek: CORPUS_TARGET_WEEK,
    members: CORPUS_MEMBERS,
    note: "pile au plafond",
    writtenAt: null,
    planFoods: CORPUS_PLAN_FOODS,
  });
  assertEquals(out.classification.preferences.kept, DRAFT_NOTE_MAX_RETAINED);
  assertEquals(out.classification.preferences.refused.overCap, 0);
});

Deno.test("⛔ LOT B — LE PLAFOND NE TOUCHE NI LES MÉMOS, NI LES PARTS, NI LES CASES", () => {
  // Il borne ce qu'une phrase laisse en MÉMOIRE. Un mémo a son propre plafond
  // par personne, une part déplace un champ, une case ne s'écrit nulle part —
  // les borner ici serait un second plafond sur des magasins qui ont le leur.
  const out = readDraftNoteClassification({
    raw: {
      preferences: Array.from({ length: DRAFT_NOTE_MAX_RETAINED }, (_, i) => ({
        kind: "food.exclude",
        text: `aliment ${i}`,
        member_id: null,
        occasion: null,
        force: "never",
      })),
      next_plan: [],
      notes: [{ text: "on rentre tard le jeudi", member_id: null, when: null }],
      portions: [],
      settings: [{ about: "time", direction: "down" }],
      slots: [],
      cells: [{ day: "fri", slot: "lunch", text: "du poulet" }],
      skipped: [],
      clarify: [],
    },
    today: CORPUS_TODAY,
    targetWeek: CORPUS_TARGET_WEEK,
    members: CORPUS_MEMBERS,
    note: "au plafond, plus autre chose",
    writtenAt: null,
    planFoods: CORPUS_PLAN_FOODS,
  });
  assertEquals(out.classification.notes.kept, 1);
  assertEquals(out.classification.settings.kept, 1);
  assertEquals(out.classification.cells.kept, 1);
});

// ===========================================================================
// ⟳ 2026-09-22 · LOT C — UNE CIRCONSTANCE EST DATÉE PAR SA RAISON
// ===========================================================================
//
// ── LE DÉFAUT ────────────────────────────────────────────────────────────
// La supersession (livrée ce matin) retire sur CONTRADICTION. Rien ne retire
// sur ÂGE — et personne ne dément jamais ce qu'il a oublié avoir dit.
//
// ⛔ MAIS UNE EXPIRATION PAR L'ÂGE EFFACERAIT « mon fils n'aime pas le
// poisson », qui n'a pas de date de péremption. Le vrai manque n'était pas une
// horloge : c'était une PORTE pour la circonstance. Elle existe déjà — l'encart
// `next_plan` — et la consigne n'y envoyait que les phrases qui nomment la
// fenêtre (« cette semaine »). « On est que début septembre » est une raison
// qui CESSERA D'ÊTRE VRAIE, et elle date la phrase aussi sûrement.

Deno.test("consigne — UNE RAISON QUI EXPIRE DATE LA PHRASE, et l'encart le dit", () => {
  const line = drawerLine("next_plan");
  assert(line !== null, "l'encart a disparu");
  assert(
    /REASON THAT WILL STOP BEING TRUE/i.test(line!),
    "l'encart n'accueille que les phrases qui NOMMENT la fenêtre — « on est " +
      "que début septembre » retombe en durable, et la tartiflette est bannie " +
      "pour toujours",
  );
  // ⛔ ET LA CONSIGNE DIT LE COÛT, pas seulement la règle: une règle sans son
  // coût est une règle qu'on relâche au premier doute.
  assert(
    /never find out|quietly stops appearing/i.test(line!),
    "l'encart ne dit pas pourquoi un bannissement silencieux est le pire cas",
  );
  // ⚠️ ET LE DOUTE PENCHE DU CÔTÉ QUI SE RÉPARE. Être redemandé coûte une
  // phrase; un bannissement muet coûte l'aliment.
  assert(
    /When in doubt .*choose \(2\)/i.test(line!),
    "la consigne ne dit pas de quel côté pencher dans le doute",
  );
});

Deno.test("consigne — ⛔ ET UN GOÛT N'EST PAS UNE HUMEUR — les deux moitiés", () => {
  // Une consigne qui daterait tout ferait réécrire à la personne, chaque
  // semaine, ce qu'elle a dit une fois. C'est le défaut RENVERSÉ le
  // 2026-09-03, et le rouvrir serait payer deux fois la même leçon.
  const next = drawerLine("next_plan")!;
  assert(
    /A TASTE IS NOT A MOOD/i.test(next),
    "rien n'empêche « mon fils n'aime pas le poisson » de partir à l'encart",
  );
  const pref = drawerLine("preferences")!;
  assert(
    /STANDING FACT/i.test(pref),
    "la porte durable ne dit plus ce qu'elle garde",
  );
  // ⚠️ LE RENVOI EST COURT ICI, ET C'EST MESURÉ. La règle complète vit dans
  // l'encart (à 17 caractères de son titre); la recopier sur la porte ① aurait
  // poussé « NEVER craving here » à 438 caractères de sa clé — au-delà de la
  // borne de 300 que ce dépôt tient parce qu'une promesse éloignée n'est pas
  // lue (0 % mesuré).
  assert(
    /never a mood \u2014 see \(2\)/i.test(pref),
    "la porte durable ne renvoie pas la circonstance vers l'encart",
  );
});

Deno.test("⟳ LOT C — une circonstance rangée à l'encart EXPIRE, un goût NON", () => {
  // ── CE QUE ÇA CHANGE EN BASE ──────────────────────────────────────────
  // Les deux magasins n'ont pas la même durée de vie: `next_plan` vit une
  // génération, `durable` jusqu'à démenti. C'est ce qui rend la porte de la
  // consigne décisive — et c'est vérifiable sur la classification, sans
  // attendre une semaine.
  const entry = DRAFT_NOTE_CORPUS.find((e) => e.id === "circonstance-la-saison")!;
  const out = readDraftNoteClassification({
    raw: entry.model,
    today: CORPUS_TODAY,
    targetWeek: CORPUS_TARGET_WEEK,
    members: CORPUS_MEMBERS,
    note: entry.note,
    writtenAt: `${CORPUS_TODAY}T20:40:00.000Z`,
    planFoods: CORPUS_PLAN_FOODS,
  });
  assertEquals(out.classification.preferences.kept, 0, "la tartiflette est bannie pour toujours");
  assertEquals(out.classification.nextPlan.kept, 1);
  assertEquals(out.classification.nextPlan.entries[0].item.scope, "next_plan");

  const gout = DRAFT_NOTE_CORPUS.find((e) => e.id === "gout-sans-date-reste-durable")!;
  const out2 = readDraftNoteClassification({
    raw: gout.model,
    today: CORPUS_TODAY,
    targetWeek: CORPUS_TARGET_WEEK,
    members: CORPUS_MEMBERS,
    note: gout.note,
    writtenAt: `${CORPUS_TODAY}T20:40:00.000Z`,
    planFoods: CORPUS_PLAN_FOODS,
  });
  assertEquals(out2.classification.nextPlan.kept, 0, "un goût a été daté: il faudra le redire");
  assertEquals(out2.classification.preferences.items[0].scope, "durable");
});

Deno.test("consigne — ⟳ LA PREMIÈRE PERSONNE EST UNE RAISON, PAS UN SUJET", () => {
  // ── TROUVÉ PAR LE BANC DU 2026-09-22, ET C'EST LE SEUL VRAI ÉCART ────────
  // Sur 56 notes, le modèle a rendu 47 classements exacts. Des 9 écarts, HUIT
  // accusaient mes fixtures (pronoms ambigus, attendus écrits avant les lots
  // B et C). Le neuvième était une vraie lacune de la consigne :
  //
  //   « plus de fruits à coque, ça me rend malade » → `clarify: who`
  //
  // Le « me » est le POURQUOI, pas le POUR QUI. La règle elle-même ne nomme
  // personne — elle vaut donc pour la table. Demander coûte un tap pour
  // apprendre à la personne ce qu'elle vient d'écrire.
  const line = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT.split("\n").find((l) =>
    /FIRST PERSON DOES NOT NAME A PERSON/i.test(l)
  );
  assert(
    line !== undefined,
    "rien n'empêche « ça me rend malade » de partir en question: le modèle " +
      "demande qui, alors que la phrase ne nomme personne",
  );
  assert(
    /member_id: null/.test(line!),
    "la consigne dit que ce n'est pas un sujet, sans dire où ça va",
  );
  // ⛔ ET ELLE INTERDIT LA QUESTION EXPLICITEMENT. Sans ça, la règle du WHO
  // qui suit (« si deux personnes conviennent, demande ») reprend la main.
  assert(
    /NEVER "clarify" here/.test(line!),
    "la consigne n'interdit pas la question sur une raison en « je »",
  );
});

Deno.test("consigne — ⟳ UNE RÈGLE LIÉE À UN JOUR N'EST PAS UNE PRÉFÉRENCE", () => {
  // ── TROUVÉ PAR LE BANC (2e tir complet, 2026-09-22) ─────────────────────
  // « jamais de poisson le jeudi chez nous » est parti en `food.exclude` —
  // c'est-à-dire une interdiction du poisson TOUS LES JOURS. Six jours que
  // personne n'a demandés.
  //
  // ⛔ LE MOMENT (`occasion`) EST LE REPAS, PAS LE JOUR. Les familles
  // d'aliments n'ont aucun axe « jour de la semaine » ; une règle qui en porte
  // un va au mémo (③) avec son `when`, où le jour existe.
  //
  // ⚠️ LA RÈGLE VIVAIT DÉJÀ DANS LA PORTE DES CASES (⑨), que le modèle lit en
  // DERNIER — et la porte ① l'attrape avant. Une règle rangée loin de l'endroit
  // où elle mord n'est pas lue: c'est la même leçon que la borne de 300.
  const kindLine = DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT.split("\n").find((l) =>
    l.includes('"kind": exactly one of') && l.includes("NEVER craving here")
  );
  assert(kindLine !== undefined, "la ligne `kind` de ① a disparu");
  assert(
    /NEVER A FOOD RULE TIED TO A DAY OF THE WEEK/i.test(kindLine!),
    "rien n'empêche « jamais de poisson le jeudi » de bannir le poisson tous " +
      "les jours",
  );
  // ⛔ ET ELLE DIT OÙ ÇA VA, plus ce que ça coûte de se tromper.
  assert(/"notes" \(3\) with its "when"/.test(kindLine!), "la règle ne dit pas où aller");
  assert(/EVERY day/i.test(kindLine!), "la règle ne dit pas ce que l'erreur coûte");
});
