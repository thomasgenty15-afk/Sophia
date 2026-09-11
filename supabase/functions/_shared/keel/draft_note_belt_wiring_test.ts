/**
 * LA NOTE FRAÎCHE MORD LE PLAN QU'ELLE ANNOTE — épingles de câblage (2026-09-06).
 *
 * Mesuré (tirs ASP1/ASP2, cas Léa/Marc) : « Léa n'aime pas les asperges »,
 * écrite sur un brouillon, n'était qu'une phrase de prompt pour CE plan ; sa
 * classification n'arrivait qu'APRÈS l'écriture, donc la ceinture par bouche
 * (qui ne lit que les items structurés) ne la voyait qu'au plan SUIVANT. Le
 * plan annoté servait les asperges à Léa, l'explication disant le contraire.
 *
 * Ce que ces épingles tiennent, dans les DEUX lanes :
 *   ① le classifieur part (`classifyDraftNoteEarly`) AVANT l'appel principal,
 *      sans `await` — en parallèle, jamais en série ;
 *   ② sa réponse est lue par la ceinture (`draftNoteBeltItems(await …)`) ;
 *   ③ ses items rejoignent le magasin structuré (`beltItems`) et c'est
 *      `beltItems`, jamais `routedRetained.composition` seul, que
 *      `exclusionTermsFor` lit ;
 *   ④ le compteur de la ceinture dit ce que la note a apporté (`note_items`).
 *
 * Et chaque moitié retirée fait ROUGIR — sinon ces épingles seraient un
 * `indexOf` sur une chaîne disparue.
 */
// ⟳ 2026-09-11 · LOT 7 — L'ENTRÉE DE LA LANE INDIVIDUELLE A ÉTÉ RETIRÉE
// AVEC LA LANE. La propriété est CONSERVÉE, sur la lane qui reste: c'est un
// second exemplaire du contrôle qui disparaît, pas le contrôle.
import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

async function source(rel: string): Promise<string> {
  return await Deno.readTextFile(new URL(rel, FUNCTIONS_DIR));
}

interface Lane {
  readonly lane: string;
  readonly rel: string;
  /** Combien de `exclusionTermsFor({ items: beltItems, …})` la lane tient. */
  readonly beltSites: number;
  /** Combien de sites de persistance réutilisent la réponse précoce. */
  readonly classifiedSites: number;
}

const LANES: readonly Lane[] = [
  // Le foyer : termes de la table + termes de chaque bouche ; le site du REFUS
  // (planFoods: []) réutilise la réponse précoce, le site nominal (qui passe
  // les aliments du plan écrit) garde son appel.
  { lane: "household", rel: "generate-household-meal-v1/index.ts", beltSites: 2, classifiedSites: 1 },
  // Le solo : un seul jeu de termes ; la persistance garde son appel (c'est LA
  // lane où « laquelle ? » compte).
];

const LAUNCH = ": classifyDraftNoteEarly({";
const MAIN_CALL = "result = await generateWithGemini(";
const BELT_READ = "draftNoteBeltItems(await draftNoteEarly";
const NOTE_ITEMS = "...(noteBelt?.items ?? []),";
const COUNTER = "note_items: noteBelt?.items.length ?? 0,";
const CLASSIFIED = "classified: draftNoteEarly === null ? undefined : await draftNoteEarly,";

function verdict(raw: string, lane: Lane): string[] {
  const code = stripComments(raw);
  const missing: string[] = [];
  const launch = code.indexOf(LAUNCH);
  const main = code.indexOf(MAIN_CALL);
  if (launch < 0) missing.push("precoce_absent");
  else if (main < 0 || launch > main) missing.push("precoce_apres_l_appel_principal");
  if (!code.includes(BELT_READ)) missing.push("ceinture_ne_lit_pas_la_note");
  if (!code.includes(NOTE_ITEMS)) missing.push("items_de_la_note_absents");
  const beltSites = (code.match(/exclusionTermsFor\(\{\s*items: beltItems,/g) ?? []).length;
  const storeOnly = /exclusionTermsFor\(\{\s*items: routedRetained\.composition/.test(code);
  if (beltSites !== lane.beltSites || storeOnly) missing.push("exclusionTermsFor_lit_le_magasin_seul");
  if (!code.includes(COUNTER)) missing.push("compteur_absent");
  const classified = code.split(CLASSIFIED).length - 1;
  if (classified !== lane.classifiedSites) missing.push("reutilisation_hors_du_site_prevu");
  return missing;
}

for (const lane of LANES) {
  Deno.test(`LANE ${lane.lane.toUpperCase()} — la note fraîche mord : le câblage est là`, async () => {
    assertEquals(verdict(await source(lane.rel), lane), []);
  });

  Deno.test(`LANE ${lane.lane.toUpperCase()} — et chaque moitié retirée fait ROUGIR`, async () => {
    const real = await source(lane.rel);
    assertEquals(verdict(real, lane), []);
    const cuts: Array<[string, (s: string) => string]> = [
      ["precoce_absent", (s) => s.replace(LAUNCH, ": null; void ({")],
      // Le lancement déplacé APRÈS l'appel principal : en série, plus en parallèle.
      ["precoce_apres_l_appel_principal", (s) => {
        const i = s.indexOf(LAUNCH);
        const j = s.indexOf(MAIN_CALL);
        return s.slice(0, i) + ": null; void ({" + s.slice(i + LAUNCH.length, j) +
          MAIN_CALL + "/*x*/" + s.slice(j + MAIN_CALL.length) + `\n// ${LAUNCH}\n` +
          `\nfunction __moved() { ${LAUNCH} userId }); }\n`;
      }],
      ["ceinture_ne_lit_pas_la_note", (s) => s.replace(BELT_READ, "draftNoteBeltItems({ ok: false, model: \"\", reason: \"no_note\" } as never, void draftNoteEarly")],
      ["items_de_la_note_absents", (s) => s.replace(NOTE_ITEMS, "")],
      ["exclusionTermsFor_lit_le_magasin_seul", (s) => s.replaceAll("items: beltItems,", "items: routedRetained.composition,")],
      ["compteur_absent", (s) => s.replace(COUNTER, "note_items: 0,")],
      ["reutilisation_hors_du_site_prevu", (s) =>
        lane.classifiedSites > 0
          ? s.replace(CLASSIFIED, "")
          : s.replace('source: "draft_note",\n        requestId,', `source: "draft_note",\n        requestId,\n        ${CLASSIFIED}`)],
    ];
    for (const [name, cut] of cuts) {
      const mutated = cut(real);
      assertNotEquals(mutated, real, `la coupe « ${name} » n'a rien changé`);
      assertEquals(verdict(mutated, lane), [name], `la coupe « ${name} » n'a pas fait rougir ce qu'elle devait`);
    }
  });

  Deno.test(`LANE ${lane.lane.toUpperCase()} — un commentaire ne câble rien`, async () => {
    const real = await source(lane.rel);
    const i = real.indexOf(LAUNCH);
    assert(i > 0);
    const lineStart = real.lastIndexOf("\n", i) + 1;
    const mutated = real.slice(0, lineStart) + "// " + real.slice(lineStart);
    assertEquals(verdict(mutated, lane), ["precoce_absent"]);
  });
}
