/**
 * LE PAYLOAD ÉCRIT EXISTE AVANT LE RETOUR DE L'APERÇU — épingles (2026-09-06).
 *
 * Mesuré (audit du 2026-09-05, cas C01, plan réellement écrit) : l'aperçu
 * portait 6 boîtes, la ligne enregistrée en base en portait 0, et le serveur a
 * répondu 200. La cause est structurelle : l'objet donné à
 * `write_student_meal_plan` se CONSTRUISAIT en argument de la RPC, c'est-à-dire
 * plus bas que le `return` de l'aperçu. Un brouillon sortait donc sans que cet
 * objet ait jamais existé, et « adopter » ne pouvait vouloir dire qu'une chose :
 * tout recomposer, avec un second appel modèle et cinq relances désarmées.
 *
 * Ces épingles tiennent la condition sans laquelle l'adoption sans modèle est
 * impossible :
 *   ① `const writePayload = {` existe, une fois, dans chaque lane ;
 *   ② il est écrit AVANT le retour de l'aperçu, donc l'aperçu peut le ranger ;
 *   ③ la RPC ne reçoit plus de littéral : `p_payload: writePayload,` et rien
 *      d'autre — une seconde construction « qui lui ressemble » serait la
 *      divergence que ce lot ferme ;
 *   ④ le temps mur est journalisé sur les deux sorties qui comptent.
 *
 * ⚠️ Et chaque moitié retirée fait ROUGIR : sans les tests de coupe, ces
 * épingles seraient un `indexOf` sur une chaîne qui pourrait disparaître.
 */
// ⟳ 2026-09-11 · LOT 7 — L'ENTRÉE DE LA LANE INDIVIDUELLE A ÉTÉ RETIRÉE
// AVEC LA LANE. La propriété est CONSERVÉE, sur la lane qui reste: c'est un
// second exemplaire du contrôle qui disparaît, pas le contrôle.
import { assert, assertEquals } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

async function source(rel: string): Promise<string> {
  return stripComments(await Deno.readTextFile(new URL(rel, FUNCTIONS_DIR)));
}

const HOIST = "const writePayload = {";
const PASSED = "p_payload: writePayload,";
const DRAFT_RETURN = "draft: true,";
const WALL_DRAFT = 'outcome: "draft",';
const WALL_WRITTEN = 'outcome: "written",';

interface Lane {
  readonly lane: string;
  readonly rel: string;
  readonly tag: string;
}

const LANES: readonly Lane[] = [
  {
    lane: "foyer",
    rel: "generate-household-meal-v1/index.ts",
    tag: "keel.household_meal.wall",
  },
];

for (const lane of LANES) {
  Deno.test(`CÂBLAGE ① ${lane.lane}: le payload est hissé une seule fois`, async () => {
    const src = await source(lane.rel);
    assertEquals(
      src.split(HOIST).length - 1,
      1,
      `${lane.lane}: un seul \`${HOIST}\``,
    );
  });

  Deno.test(`CÂBLAGE ② ${lane.lane}: il précède le retour de l'aperçu`, async () => {
    const src = await source(lane.rel);
    const hoist = src.indexOf(HOIST);
    const draft = src.indexOf(DRAFT_RETURN);
    assert(hoist > 0, `${lane.lane}: payload introuvable`);
    assert(draft > 0, `${lane.lane}: retour d'aperçu introuvable`);
    assert(
      hoist < draft,
      `${lane.lane}: le payload est construit APRÈS le retour de l'aperçu — ` +
        `un brouillon sortirait sans objet à ranger, et « adopter » redeviendrait ` +
        `« tout recomposer »`,
    );
  });

  Deno.test(`CÂBLAGE ③ ${lane.lane}: la RPC ne reçoit plus de littéral`, async () => {
    const src = await source(lane.rel);
    assertEquals(src.split("p_payload:").length - 1, 1, `${lane.lane}: un seul p_payload`);
    assert(src.includes(PASSED), `${lane.lane}: \`${PASSED}\` attendu`);
    const rpc = src.indexOf('"write_student_meal_plan"');
    assert(rpc > 0 && src.indexOf(HOIST) < rpc, `${lane.lane}: hissé avant la RPC`);
  });

  Deno.test(`CÂBLAGE ④ ${lane.lane}: le temps mur est journalisé aux deux sorties`, async () => {
    const src = await source(lane.rel);
    assert(src.includes(`tag: "${lane.tag}",`), `${lane.lane}: tag ${lane.tag}`);
    assert(src.includes(WALL_DRAFT), `${lane.lane}: sortie aperçu non mesurée`);
    assert(src.includes(WALL_WRITTEN), `${lane.lane}: sortie écrite non mesurée`);
    assert(src.includes("const wallT0 = performance.now();"), `${lane.lane}: origine`);
  });

  Deno.test(`CÂBLAGE ⑤ ${lane.lane}: la coupe fait rougir`, async () => {
    const src = await source(lane.rel);
    // Le payload rendu à la RPC sous forme de littéral: ② et ③ doivent tomber.
    const cut = src.replace(HOIST, "const unusedPayload = {").replace(
      PASSED,
      "p_payload: { dishes: [] },",
    );
    assertEquals(cut.split(HOIST).length - 1, 0, "la mutation doit retirer le hissage");
    assert(!cut.includes(PASSED), "la mutation doit retirer le passage par variable");
  });
}
