/**
 * ══════════════════════════════════════════════════════════════════════════
 * OÙ VA CHAQUE SOUVENIR — la destination, et la carte qui le rend.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LES DEUX MOITIÉS, ET LA SECONDE EST CELLE QUI MANQUAIT ────────────────
 * ① LA DESTINATION. Chaque famille a UN lecteur, aucun item ne se perd. C'est
 *    déjà tenu par `retained_items_routing_test.ts`; on le rejoue ici sur le
 *    corpus, parce qu'une conservation prouvée sur trois items fabriqués ne dit
 *    rien d'un foyer réel.
 * ② LA CARTE. Sous QUEL NOM le modèle lit la ligne. C'est la moitié qui n'était
 *    testée nulle part, et c'est celle qui a mordu le 2026-09-21.
 *
 * ── CE QUI EST ROUGE AUJOURD'HUI, ET POURQUOI C'EST VOULU ─────────────────
 *   ① UN SOUVENIR DE FOYER SORT SOUS UNE SEULE CARTE. `compositionLinesByMouth`
 *      range les lignes `subject: household` dans la voix du TITULAIRE. Mesuré
 *      sur un foyer réel: « Je veux pas de tofu… », écrit pour la table, est
 *      parti au modèle sous « == Thomas == ». Le modèle lit une préférence
 *      personnelle là où la personne a écrit une règle de maison — et sert le
 *      plat aux autres.
 *   ② LA MÊME LIGNE DISPARAISSAIT QUAND PERSONNE NE POUVAIT LA PORTER. Sans
 *      titulaire à table, elle partait dans `householdUnattached`, que
 *      l'appelant COMPTAIT (`retained_lines_unattached:N`) et ne donnait à
 *      personne. Une règle de maison qui n'atteint pas le prompt est une règle
 *      qui n'existe pas.
 *   ③ LE MOMENT NE SORT PAS. Une exclusion scopée au petit-déjeuner se rend
 *      comme les autres: rien dans la ligne ne dit « le matin ».
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  compositionLinesByMouth,
  cravingLinesFor,
  routedItemCount,
  routeRetainedItems,
} from "./retained_items_routing.ts";
import {
  HOUSEHOLD_SUBJECT,
  parseRetainedItem,
  type RetainedItem,
  type RetainedKind,
  RETAINED_KINDS,
  type RhythmOccasion,
} from "./retained_item.ts";
import { CORPUS_MEMBER_IDS, CORPUS_OWNER } from "./draft_note_corpus.ts";

const OWNER = CORPUS_MEMBER_IDS[CORPUS_OWNER];
const CHRISTELE = CORPUS_MEMBER_IDS.christele;
const LEA = CORPUS_MEMBER_IDS.lea;

const MOUTHS = [
  { memberId: OWNER },
  { memberId: CHRISTELE },
  { memberId: LEA },
] as const;

/**
 * Un souvenir, construit PAR LE PARSEUR et jamais par un `as`.
 *
 * ⚠️ Cicatrice nommée: « `as` sur un type étranger désarme le typecheck ». Un
 * littéral forcé ici passerait la compilation en portant un `scope` que le
 * socle refuse, et le test épinglerait un objet que la production ne verra
 * jamais.
 */
function item(args: {
  kind: RetainedKind;
  text: string;
  subject: string;
  occasion?: RhythmOccasion | null;
  force?: "never" | "less";
  source?: "draft_note" | "questionnaire" | "written";
  at?: string;
}): RetainedItem {
  const kind = args.kind;
  const value = kind === "portion.adjust"
    ? { direction: "down", magnitude: "slight" }
    : kind === "rhythm.set"
    ? { occasion: "dinner", present: false }
    : kind === "logistics.set"
    ? { field: "cooking_time_min", value: 40 }
    : null;
  const scope = kind === "craving" ? "next_plan" : "durable";
  // ⛔ LE PRODUCTEUR SUIT LA MATRICE, il ne se choisit pas. `portion.adjust`
  // n'a QU'UN producteur (le questionnaire): l'écrire en `draft_note` fait
  // refuser l'item par `canHold`, et un helper qui replierait en silence
  // épinglerait un objet que la production ne voit jamais.
  const source = args.source ??
    (kind === "portion.adjust" ? "questionnaire" : "draft_note");
  const parsed = parseRetainedItem({
    kind,
    scope,
    subject: args.subject,
    text: args.text,
    value,
    source,
    at: args.at ?? "2026-09-21",
    item: "",
    confidence: null,
    quote: source === "written" ? null : args.text,
    // Le champ de la CIBLE. Le socle d'aujourd'hui l'ignore; le jour où il le
    // lit, ces items le portent déjà.
    ...(args.occasion === undefined ? {} : { occasion: args.occasion }),
    ...(args.force === undefined ? {} : { force: args.force }),
  });
  assert(parsed !== null, `item illisible: ${kind} / ${args.text}`);
  return parsed;
}

// ===========================================================================
// ① LA DESTINATION
// ===========================================================================

/** Un item par famille, la liste ENTIÈRE — une neuvième famille fait rougir. */
const ONE_PER_KIND: readonly RetainedItem[] = RETAINED_KINDS
  .filter((k) => k !== "rhythm.set" && k !== "logistics.set")
  .map((kind) => item({ kind, text: `cas ${kind}`, subject: HOUSEHOLD_SUBJECT }));

Deno.test("routage — aucun souvenir ne se perd, sur tout le corpus", () => {
  const items = [
    ...ONE_PER_KIND,
    item({ kind: "food.exclude", text: "tofu", subject: `member:${CHRISTELE}` }),
    item({ kind: "food.prefer", text: "poisson", subject: `member:${LEA}` }),
  ];
  const routed = routeRetainedItems(items);
  assertEquals(routedItemCount(routed), items.length);
  assertEquals(routed.unrouted, [], "une famille est arrivée sans lecteur");
});

Deno.test("routage — chaque famille va chez SON lecteur, et chez lui seul", () => {
  const table: readonly [RetainedKind, keyof ReturnType<typeof routeRetainedItems>][] = [
    ["food.exclude", "composition"],
    ["food.prefer", "composition"],
    ["method.avoid", "composition"],
    ["method.prefer", "composition"],
    ["portion.adjust", "portion"],
    ["craving", "craving"],
  ];
  for (const [kind, bucket] of table) {
    const routed = routeRetainedItems([
      item({ kind, text: `cas ${kind}`, subject: HOUSEHOLD_SUBJECT }),
    ]);
    assertEquals(
      routed[bucket].length,
      1,
      `${kind} n'est pas arrivée dans ${String(bucket)}`,
    );
    assertEquals(routedItemCount(routed), 1, `${kind} est arrivée deux fois`);
  }
});

// ===========================================================================
// ② LA CARTE — sous quel nom le modèle lit la ligne
// ===========================================================================

Deno.test("carte — la ligne d'une BOUCHE sort sous son nom, et marquée", () => {
  // Ce qui marche déjà, et qu'il ne faut pas casser en réparant le reste:
  // depuis le 2026-09-04 chaque bouche reçoit SES lignes, marquées de leur
  // portée. Avant ça, « Mon mari n'aime pas les lentilles » était compté et
  // jamais servi — quatre plats de lentilles dans la semaine.
  const out = compositionLinesByMouth({
    items: [item({ kind: "food.exclude", text: "lentilles", subject: `member:${CHRISTELE}` })],
    mouths: MOUTHS,
  });
  assertEquals(out.byMouth.length, 1);
  assertEquals(out.byMouth[0].memberId, CHRISTELE);
  assert(
    out.byMouth[0].remembered[0].includes("lentilles"),
    "la ligne de la bouche n'est pas arrivée chez elle",
  );
  assert(
    out.byMouth[0].remembered[0].includes("THIS PERSON ONLY"),
    "la ligne d'une bouche sort sans sa marque de portée — elle se lirait " +
      "comme une interdiction de table",
  );
});

Deno.test("carte — ⛔ UNE RÈGLE DE MAISON NE SORT JAMAIS SOUS UNE SEULE CARTE", () => {
  // MESURÉ 2026-09-21: « Je veux pas de choses genre tofu… », écrite pour la
  // TABLE, est partie au modèle sous « == Thomas == ». Le modèle a lu une
  // préférence personnelle et a servi le plat aux autres.
  //
  // ⚠️ CE N'EST PAS UN DÉTAIL D'AFFICHAGE. C'est l'axe 3 renversé: la ligne du
  // foyer devient la ligne d'une personne, donc une règle que le modèle a le
  // droit de contourner par une boîte d'échange.
  const out = compositionLinesByMouth({
    items: [item({ kind: "food.exclude", text: "tofu", subject: HOUSEHOLD_SUBJECT })],
    mouths: MOUTHS,
  });
  for (const voice of out.byMouth) {
    const carried = [...voice.written, ...voice.remembered].join(" | ");
    assert(
      !carried.includes("tofu"),
      `la règle de la table est sortie sous la carte de ${voice.memberId}: ${carried}`,
    );
  }
});

Deno.test("carte — la règle de maison atteint le prompt, MÊME sans titulaire à table", () => {
  // ⛔ AVANT CE LOT ELLE TOMBAIT. Sans titulaire, elle partait dans
  // `householdUnattached`, que l'appelant comptait
  // (`retained_lines_unattached`) et ne donnait à personne. Une règle de maison
  // qui n'atteint pas le prompt n'existe pas — et le compteur en faisait une
  // perte OBSERVÉE, pas réparée.
  //
  // ⚠️ LE ROSTER EST VIDE ICI, ET C'EST LE PIRE CAS: aucune bouche, donc
  // aucune carte où la ligne aurait pu se glisser.
  const out = compositionLinesByMouth({
    items: [item({ kind: "food.exclude", text: "tofu", subject: HOUSEHOLD_SUBJECT })],
    mouths: [],
  });
  assert(
    out.household.some((l) => l.includes("tofu")),
    "la règle de la table n'a aucun canal à elle: elle est perdue au lieu " +
      "d'être servie au modèle",
  );
});

Deno.test("carte — un souvenir scopé à un MOMENT le dit dans sa ligne", () => {
  // MESURÉ 2026-09-21: le moment était enfermé dans le texte (« tofu, poissons
  // au petit déjeuné »), donc invisible à la ceinture ET au modèle. Une fois
  // le moment structuré, il doit ressortir SUR la ligne — dans le jeton du
  // créneau, pas en prose française noyée dans une phrase.
  const out = compositionLinesByMouth({
    items: [
      item({
        kind: "food.exclude",
        text: "tofu",
        subject: `member:${CHRISTELE}`,
        occasion: "breakfast",
      }),
    ],
    mouths: MOUTHS,
  });
  const line = out.byMouth[0]?.remembered[0] ?? "";
  assert(
    line.includes("breakfast"),
    `le moment n'est pas rendu au modèle: ${JSON.stringify(line)}`,
  );
});

Deno.test("carte — une envie reste une envie de la semaine, jamais une règle", () => {
  const lines = cravingLinesFor({
    items: routeRetainedItems([
      item({ kind: "craving", text: "fajitas", subject: HOUSEHOLD_SUBJECT }),
    ]).craving,
    speaksFor: [HOUSEHOLD_SUBJECT],
  });
  assert(
    JSON.stringify(lines).includes("fajitas"),
    "l'envie n'atteint pas le bloc d'envies",
  );
});

// ===========================================================================
// ③ CE QUE LE ROUTAGE NE DOIT JAMAIS FAIRE
// ===========================================================================

Deno.test("routage — la ligne d'une bouche PARTIE est comptée, jamais appliquée", () => {
  // Une bouche qui a quitté le foyer: sa ligne ne peut pas devenir une règle
  // de table par défaut. Elle se compte (`otherSubjects`) et s'arrête là.
  const gone = "99999999-9999-4999-8999-999999999999";
  const out = compositionLinesByMouth({
    items: [item({ kind: "food.exclude", text: "anchois", subject: `member:${gone}` })],
    mouths: MOUTHS,
  });
  assertEquals(out.byMouth.length, 0);
  assertEquals(out.otherSubjects.length, 1);
});

// ===========================================================================
// ⟳ 2026-09-22 — « MOINS » ATTEINT LE MODÈLE, AVEC SA NUANCE
// ===========================================================================

Deno.test("carte — « moins » sort MARQUÉ, il ne se confond pas avec une interdiction", () => {
  // ⛔ LA MOITIÉ QUI MANQUERAIT SANS ÇA. La ceinture ne mord plus sur `less`
  // (c'est le lot). Si la ligne partait au modèle sans rien qui la distingue,
  // deux choses arriveraient : il la lirait comme un bannissement — on aurait
  // déplacé le défaut, pas fermé — ou il l'ignorerait, et « pas autant de
  // petit suisse » n'aurait plus AUCUN effet. La marque est le seul endroit où
  // la nuance existe : la ceinture ne sait pas servir « moins », le modèle si.
  const out = compositionLinesByMouth({
    items: [
      item({
        kind: "food.exclude",
        text: "petit suisse",
        subject: `member:${CHRISTELE}`,
        occasion: "breakfast",
        force: "less",
      }),
    ],
    mouths: MOUTHS,
  });
  const line = out.byMouth[0]?.remembered[0] ?? "";
  assert(
    /LESS OFTEN/.test(line),
    `« moins » part au modèle comme une interdiction: ${JSON.stringify(line)}`,
  );
  assert(/not banned/i.test(line), "la ligne ne dit pas que l'aliment reste servi");
  assert(/breakfast/.test(line), "le moment a disparu en route");
});

Deno.test("carte — une interdiction NE porte PAS la marque « moins »", () => {
  const out = compositionLinesByMouth({
    items: [
      item({
        kind: "food.exclude",
        text: "coriandre",
        subject: `member:${CHRISTELE}`,
        force: "never",
      }),
    ],
    mouths: MOUTHS,
  });
  const line = out.byMouth[0]?.remembered[0] ?? "";
  assert(!/LESS OFTEN/.test(line), `une interdiction s'est adoucie: ${line}`);
});

Deno.test("carte — une PRÉFÉRENCE ne porte jamais de marque de force", () => {
  const out = compositionLinesByMouth({
    items: [item({ kind: "food.prefer", text: "légumes", subject: `member:${CHRISTELE}` })],
    mouths: MOUTHS,
  });
  const line = out.byMouth[0]?.remembered[0] ?? "";
  assert(!/LESS OFTEN/.test(line), `une envie a reçu une force: ${line}`);
});

Deno.test("carte — ⛔ LA LIGNE NE SE CONTREDIT PAS ELLE-MÊME", () => {
  // MESURÉ en assemblant la ligne réelle du 2026-09-22:
  //
  //   « petit suisse -- ONLY AT breakfast -- LESS OFTEN, not banned: keep
  //     serving it -- THIS PERSON ONLY: keep it out of the shared dish »
  //
  // Le modèle lisait « continue d'en servir » ET « garde-le hors du plat » sur
  // la MÊME ligne, à un caractère d'intervalle, sans rien pour départager.
  // C'est la cicatrice « la phrase de table contredit le couvercle », vue sur
  // la voix d'une bouche.
  const out = compositionLinesByMouth({
    items: [
      item({
        kind: "food.exclude",
        text: "petit suisse",
        subject: `member:${CHRISTELE}`,
        occasion: "breakfast",
        force: "less",
      }),
    ],
    mouths: MOUTHS,
  });
  const line = out.byMouth[0].remembered[0];
  assert(/LESS OFTEN/.test(line), `la nuance a disparu: ${line}`);
  assert(
    !/keep it out/.test(line),
    `« moins » porte encore l'ordre de RETIRER: ${line}`,
  );
  // ⚠️ ET LA MARQUE DE PORTÉE SURVIT: la ligne reste celle d'UNE bouche, pas
  // une règle de table. Retirer la contradiction ne doit pas retirer l'axe 3.
  assert(/THIS PERSON ONLY/.test(line), `la portée a sauté avec: ${line}`);
});

Deno.test("carte — une INTERDICTION garde l'ordre de retirer", () => {
  const out = compositionLinesByMouth({
    items: [
      item({
        kind: "food.exclude",
        text: "coriandre",
        subject: `member:${CHRISTELE}`,
        force: "never",
      }),
    ],
    mouths: MOUTHS,
  });
  const line = out.byMouth[0].remembered[0];
  assert(/keep it out/.test(line), `une interdiction ne retire plus: ${line}`);
});
