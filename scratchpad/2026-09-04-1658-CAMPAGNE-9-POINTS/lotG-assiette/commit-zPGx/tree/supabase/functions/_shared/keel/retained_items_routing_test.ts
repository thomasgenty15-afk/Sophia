import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  compositionLinesByMouth,
  compositionLinesFor,
  cravingLinesFor,
  portionAdjustExclusionFacts,
  portionAdjustsFor,
  routedItemCount,
  routeRetainedItems,
  routingTrace,
  VOICE_REACH_MARK,
} from "./retained_items_routing.ts";
import {
  HOUSEHOLD_SUBJECT,
  parseRetainedItem,
  type PortionAdjustItem,
  type PortionAdjustMember,
  RETAINED_KINDS,
  type RetainedItem,
  type RetainedKind,
  RHYTHM_OCCASIONS,
} from "./retained_item.ts";

// ===========================================================================
// CE QUE CE FICHIER GARDE
//
// Pas « la fonction rend un objet ». Ce qui est testé, ce sont les façons dont
// la lecture par les générateurs se trahirait en production:
//
//   1. UN ITEM QUI DISPARAÎT. Une famille qui n'atterrit nulle part rendrait
//      un objet parfaitement bien formé, amputé — et personne ne le verrait.
//      La conservation est donc assertée sur CHAQUE cas, et la table des
//      destinations est épinglée À LA MAIN plutôt que relue du module.
//   2. UN ENFANT À QUI ON RETIRE DE LA NOURRITURE EN SILENCE. Un
//      `portion.adjust` à la baisse sans sujet doit exclure le mineur ET
//      l'âge inconnu — et surtout, il doit INCLURE l'adulte: une garde sans
//      cas passant est une garde cassée qui ressemble à une garde qui marche.
//   3. UN NOMBRE DANS `portion.adjust`. Le socle l'interdit à la compilation
//      et à la lecture; ce fichier vérifie qu'il ne réapparaît pas au
//      groupage, où il serait facile de « traduire » un adverbe.
//   4. UNE BOUCHE DONT CE PROMPT NE PARLE PAS. Les mots d'un membre nommé ne
//      doivent pas partir au modèle pour toute la table — ils se comptent
//      (`otherSubjects`), ils ne se jettent pas.
//   5. UNE CLÉ DE COLONNE FAUSSE. `cook_days`, jamais `cooking_days`: la
//      faute est déjà nommée dans `retained_item.ts` parce qu'elle a déjà été
//      commise.
// ===========================================================================

const ADULT = "11111111-1111-4111-8111-111111111111";
const MINOR = "22222222-2222-4222-8222-222222222222";
const UNKNOWN_AGE = "33333333-3333-4333-8333-333333333333";
const GONE = "44444444-4444-4444-4444-444444444444";

const ROSTER: readonly PortionAdjustMember[] = [
  { memberId: ADULT, ageState: "adult" },
  { memberId: MINOR, ageState: "minor" },
  { memberId: UNKNOWN_AGE, ageState: "unknown" },
];

/**
 * LA SEULE PORTE D'ENTRÉE D'UN ITEM, ICI COMME AILLEURS.
 *
 * Jamais `as RetainedItem` sur un littéral: ce dépôt porte la cicatrice
 * « `as` sur un type étranger désarme le typecheck », et un test qui forge ses
 * entrées par un cast teste une forme que la base ne produira jamais.
 */
function mk(row: Record<string, unknown>): RetainedItem {
  const item = parseRetainedItem(row);
  if (!item) throw new Error(`fixture refusée par le socle: ${JSON.stringify(row)}`);
  return item;
}

function written(kind: RetainedKind, extra: Record<string, unknown> = {}) {
  return mk({
    kind,
    scope: kind === "craving" ? "next_plan" : "durable",
    subject: HOUSEHOLD_SUBJECT,
    text: `ligne ${kind}`,
    value: null,
    source: "written",
    at: "2026-08-18",
    item: "",
    confidence: null,
    ...extra,
  });
}

function portionAdjust(args: {
  direction: "down" | "up";
  magnitude?: "slight" | "clear";
  subject?: string;
  at?: string;
}): PortionAdjustItem {
  const item = mk({
    kind: "portion.adjust",
    scope: "durable",
    subject: args.subject ?? HOUSEHOLD_SUBJECT,
    text: "les portions",
    value: { direction: args.direction, magnitude: args.magnitude ?? "clear" },
    // ⚠️ `questionnaire` ET PAS `conversation`: le socle refuse un
    // `portion.adjust` produit par le memorizer, et une fixture qui
    // contournerait ce refus testerait une ligne qui ne remonte jamais.
    source: "questionnaire",
    at: args.at ?? "2026-08-18",
    item: "",
    confidence: null,
  });
  if (item.kind !== "portion.adjust") throw new Error("fixture non typée");
  return item;
}

function rhythmSet(args: {
  occasion: string;
  present: boolean;
  subject?: string;
  at?: string;
}): RetainedItem {
  return mk({
    kind: "rhythm.set",
    scope: "durable",
    subject: args.subject ?? HOUSEHOLD_SUBJECT,
    text: `${args.occasion}: ${args.present}`,
    value: { occasion: args.occasion, present: args.present },
    source: "written",
    at: args.at ?? "2026-08-18",
    item: "",
    confidence: null,
  });
}

function logisticsSet(args: {
  field: string;
  value: unknown;
  subject?: string;
  at?: string;
}): RetainedItem {
  return mk({
    kind: "logistics.set",
    scope: "durable",
    subject: args.subject ?? HOUSEHOLD_SUBJECT,
    text: `${args.field}`,
    value: { field: args.field, value: args.value },
    source: "written",
    at: args.at ?? "2026-08-18",
    item: "",
    confidence: null,
  });
}

// ===========================================================================
// ① LE GROUPAGE — la table des destinations, épinglée à la main
// ===========================================================================

/**
 * LA COLONNE « LE LECTEUR » DE LA NOMENCLATURE, RECOPIÉE ICI À LA MAIN.
 *
 * ⚠️ ELLE N'EST PAS LUE DU MODULE, et c'est tout l'intérêt. Un test qui
 * demanderait au module où il range `craving` resterait vert le jour où
 * quelqu'un range `craving` dans la logistique. Ici, changer la table du
 * module fait rougir ce fichier.
 */
const EXPECTED_DESTINATION: Record<RetainedKind, string> = {
  "food.exclude": "composition",
  "food.prefer": "composition",
  "method.avoid": "composition",
  "method.prefer": "composition",
  "portion.adjust": "portion",
  "rhythm.set": "rhythm",
  "logistics.set": "logistics",
  "craving": "craving",
};

function bucketsOf(routed: ReturnType<typeof routeRetainedItems>) {
  return {
    composition: routed.composition,
    portion: routed.portion as readonly RetainedItem[],
    rhythm: routed.rhythm,
    logistics: routed.logistics,
    craving: routed.craving,
    unrouted: routed.unrouted,
  } as Record<string, readonly RetainedItem[]>;
}

Deno.test("chaque famille du socle a une destination, et une seule", () => {
  for (const kind of RETAINED_KINDS) {
    const expected = EXPECTED_DESTINATION[kind];
    // ⚠️ UNE NEUVIÈME FAMILLE DANS LE SOCLE FAIT ROUGIR ICI, exprès: on ne
    // route pas une famille dont personne n'a écrit le lecteur.
    assert(
      expected !== undefined,
      `${kind} n'a aucune destination épinglée dans ce test`,
    );

    const item = kind === "portion.adjust"
      ? portionAdjust({ direction: "down" })
      : kind === "rhythm.set"
      ? rhythmSet({ occasion: "lunch", present: true })
      : kind === "logistics.set"
      ? logisticsSet({ field: "variety", value: "varied" })
      : written(kind);

    const buckets = bucketsOf(routeRetainedItems([item]));
    for (const [name, bucket] of Object.entries(buckets)) {
      assertEquals(
        bucket.length,
        name === expected ? 1 : 0,
        `${kind} devait atterrir dans ${expected}, pas dans ${name}`,
      );
    }
  }
});

Deno.test("rien ne se perd: la conservation tient sur les huit familles", () => {
  const items = RETAINED_KINDS.map((kind) =>
    kind === "portion.adjust"
      ? portionAdjust({ direction: "up" })
      : kind === "rhythm.set"
      ? rhythmSet({ occasion: "dinner", present: false })
      : kind === "logistics.set"
      ? logisticsSet({ field: "cooking_time_min", value: 30 })
      : written(kind)
  );
  const routed = routeRetainedItems(items);
  assertEquals(routedItemCount(routed), items.length);
  assertEquals(routed.unrouted.length, 0);
  assertEquals(routed.composition.length, 4);
});

Deno.test("une famille sans lecteur sort par `unrouted`, elle ne disparaît pas", () => {
  // Une NEUVIÈME famille, telle qu'un binaire d'à côté ou une ligne forgée
  // pourrait en produire une. Le cast est ici et NULLE PART AILLEURS: c'est
  // exactement ce qu'il faut fabriquer pour prouver que la branche
  // d'exécution existe — le compilateur, lui, garde le code neuf.
  const forged = {
    ...written("food.exclude"),
    kind: "wearable.sync",
  } as unknown as RetainedItem;

  const routed = routeRetainedItems([written("food.prefer"), forged]);
  assertEquals(routed.composition.length, 1);
  assertEquals(routed.unrouted.length, 1);
  // La conservation vaut AUSSI dans ce cas: c'est la propriété qui fait que
  // `unrouted` est une trace et pas une poubelle.
  assertEquals(routedItemCount(routed), 2);
});

Deno.test("une entrée vide rend six seaux vides, jamais une exception", () => {
  const routed = routeRetainedItems([]);
  assertEquals(routedItemCount(routed), 0);
  assertEquals(routed.unrouted.length, 0);
});

// ===========================================================================
// ② `portion.adjust` → L'ENVELOPPE
// ===========================================================================

Deno.test("à la baisse sans sujet: le mineur est retiré, l'adulte est SERVI", () => {
  const [routed] = portionAdjustsFor(
    [portionAdjust({ direction: "down" })],
    ROSTER,
  );

  // ── LE CAS QUI PASSE, ET IL EST LA MOITIÉ DE LA GARDE ────────────────────
  // Sans lui, une fonction qui n'inclurait JAMAIS personne passerait le test
  // d'exclusion et ressemblerait à une garde qui marche.
  assertEquals(routed.audience.included, [ADULT]);

  assertEquals(routed.audience.excluded, [
    { memberId: MINOR, reason: "minor" },
    // L'âge inconnu est traité comme un mineur — extension assumée du socle
    // (§3 du contrat de phase 0): l'âge est facultatif à la saisie, donc une
    // fiche d'enfant sans date vaut `unknown`.
    { memberId: UNKNOWN_AGE, reason: "age_unknown" },
  ]);

  assertEquals(
    portionAdjustExclusionFacts([routed]).map((f) => `${f.memberId}:${f.reason}`),
    [`${MINOR}:minor`, `${UNKNOWN_AGE}:age_unknown`],
  );
});

Deno.test("à la hausse: personne n'est retiré, mineur compris", () => {
  const [routed] = portionAdjustsFor(
    [portionAdjust({ direction: "up" })],
    ROSTER,
  );
  assertEquals(routed.audience.included, [ADULT, MINOR, UNKNOWN_AGE]);
  assertEquals(routed.audience.excluded, []);
});

Deno.test("à la baisse AVEC sujet nommé: le mineur nommé n'est pas filtré", () => {
  const [routed] = portionAdjustsFor(
    [portionAdjust({ direction: "down", subject: `member:${MINOR}` })],
    ROSTER,
  );
  // La personne a nommé la bouche avec la liste du foyer sous les yeux.
  // Filtrer ici reviendrait à ignorer ce qu'elle vient de répondre.
  assertEquals(routed.audience.included, [MINOR]);
  assertEquals(routed.audience.excluded, []);
});

Deno.test("une bouche partie du foyer ne retombe pas sur tout le monde", () => {
  const [routed] = portionAdjustsFor(
    [portionAdjust({ direction: "down", subject: `member:${GONE}` })],
    ROSTER,
  );
  assertEquals(routed.audience.included, []);
  assertEquals(routed.audience.excluded, [
    { memberId: GONE, reason: "not_in_household" },
  ]);
});

Deno.test("le groupage ne fabrique aucun nombre pour une portion", () => {
  const routed = routeRetainedItems([
    portionAdjust({ direction: "down", magnitude: "slight" }),
  ]);
  const value = JSON.stringify(routed.portion[0].value);
  assertEquals(value, '{"direction":"down","magnitude":"slight"}');
  // Un chiffre ici voudrait dire qu'un adverbe a été traduit en énergie
  // AVANT le plancher TCA — c'est-à-dire au mauvais endroit, par le mauvais
  // module.
  assert(!/\d/.test(value), `un nombre a été fabriqué: ${value}`);
});

// ===========================================================================
// ③ `rhythm.set` → LES SIX MOMENTS
// ===========================================================================

Deno.test("les consignes écrites passent devant, sans date; le reste est daté", () => {
  const lines = compositionLinesFor({
    items: [
      mk({
        kind: "food.exclude",
        scope: "durable",
        subject: HOUSEHOLD_SUBJECT,
        text: "plus de rochers coco",
        value: null,
        source: "questionnaire",
        at: "2026-08-02",
        item: "",
        confidence: null,
      }),
      mk({
        kind: "method.avoid",
        scope: "durable",
        subject: HOUSEHOLD_SUBJECT,
        text: "rien de frit",
        value: null,
        source: "questionnaire",
        at: "2026-08-16",
        item: "",
        confidence: null,
      }),
      mk({
        kind: "food.prefer",
        scope: "durable",
        subject: HOUSEHOLD_SUBJECT,
        text: "du poisson le vendredi",
        value: null,
        source: "written",
        at: "2026-07-01",
        item: "",
        confidence: null,
      }),
    ],
    speaksFor: [HOUSEHOLD_SUBJECT],
  });

  // Ce que quelqu'un prend la peine d'écrire vaut plus qu'une remarque au
  // passage: c'est le renversement déjà acté dans `foodPreferencesByOrigin`.
  assertEquals(lines.written, ["du poisson le vendredi"]);
  assertEquals(lines.remembered, [
    "2026-08-16 — rien de frit",
    "2026-08-02 — plus de rochers coco",
  ]);
});

Deno.test("le `text` part TEL QUEL: aucun rapprochement avec un aliment", () => {
  const lines = compositionLinesFor({
    items: [
      mk({
        kind: "food.exclude",
        scope: "durable",
        subject: HOUSEHOLD_SUBJECT,
        // « laitue » ≠ « lait ». 12 faux positifs sur 12 mesurés dans ce
        // dépôt le jour où quelqu'un a écrit un matcher à la main.
        text: "pas de laitue",
        value: null,
        source: "written",
        at: "2026-08-18",
        item: "",
        confidence: null,
      }),
    ],
    speaksFor: [HOUSEHOLD_SUBJECT],
  });
  assertEquals(lines.written, ["pas de laitue"]);
});

Deno.test("les mots d'une bouche dont ce prompt ne parle pas sont comptés", () => {
  const lines = compositionLinesFor({
    items: [
      mk({
        kind: "food.exclude",
        scope: "durable",
        subject: `member:${MINOR}`,
        text: "pas de champignons",
        value: null,
        source: "written",
        at: "2026-08-18",
        item: "",
        confidence: null,
      }),
    ],
    speaksFor: [HOUSEHOLD_SUBJECT],
  });
  assertEquals(lines.written, []);
  assertEquals(lines.remembered, []);
  assertEquals(lines.otherSubjects.length, 1);
});

// ===========================================================================
// ⑥ `craving` → LE BLOC D'ENVIES
// ===========================================================================

Deno.test("les envies sortent une par ligne, non datées", () => {
  const cravings = cravingLinesFor({
    items: [
      mk({
        kind: "craving",
        scope: "next_plan",
        subject: HOUSEHOLD_SUBJECT,
        text: "des fajitas la semaine prochaine",
        value: null,
        source: "written",
        at: "2026-08-18",
        item: "",
        confidence: null,
      }),
      mk({
        kind: "craving",
        scope: "next_plan",
        subject: `member:${ADULT}`,
        text: "un curry",
        value: null,
        source: "written",
        at: "2026-08-18",
        item: "",
        confidence: null,
      }),
    ],
    speaksFor: [HOUSEHOLD_SUBJECT],
  });
  assertEquals(cravings.lines, ["des fajitas la semaine prochaine"]);
  assertEquals(cravings.otherSubjects.length, 1);
});

// ===========================================================================
// ⑦ LA TRACE
// ===========================================================================

Deno.test("la trace compte les seaux et nomme les bouches retirées, par id", () => {
  const items: RetainedItem[] = [
    written("food.exclude"),
    portionAdjust({ direction: "down" }),
    rhythmSet({ occasion: "lunch", present: true }),
    logisticsSet({ field: "variety", value: "some" }),
    written("craving"),
  ];
  const routed = routeRetainedItems(items);
  const trace = routingTrace({
    routed,
    adjustments: portionAdjustsFor(routed.portion, ROSTER),
  });
  assertEquals(trace.composition, 1);
  assertEquals(trace.portion, 1);
  assertEquals(trace.rhythm, 1);
  assertEquals(trace.logistics, 1);
  assertEquals(trace.craving, 1);
  assertEquals(trace.unrouted, 0);
  assertEquals(trace.portion_excluded, [
    `${MINOR}:minor`,
    `${UNKNOWN_AGE}:age_unknown`,
  ]);
  // Aucun `text` dans la trace: elle part dans les logs et dans
  // `generated_from`, que d'autres relisent. Les mots appartiennent à la
  // personne, ils vivent dans sa carte.
  assert(!JSON.stringify(trace).includes("ligne food.exclude"));
});

// ---------------------------------------------------------------------------
// LA LIGNE D'UNE BOUCHE ATTEINT SA VOIX (2026-09-04)
//
// ⛔ CE QUE CES TESTS FERMENT, ET IL A ÉTÉ MESURÉ DEUX FOIS EN RUN RÉEL:
//   · « Mon mari n'aime pas les lentilles » noté pour Marc, quatre plats de
//     lentilles dans la semaine;
//   · Tom et Zoé, tous deux « pas de poisson », servis en cabillaud.
// Dans les deux cas le modèle n'a rien violé — il n'a jamais lu la ligne.
// ---------------------------------------------------------------------------

const MOUTHS = [{ memberId: ADULT }, { memberId: MINOR }, { memberId: UNKNOWN_AGE }];

function foodLine(kind: RetainedKind, subject: string, text: string, at = "2026-09-01") {
  return mk({
    kind,
    scope: "durable",
    subject,
    text,
    value: null,
    source: "draft_note",
    at,
    item: "",
    confidence: null,
  });
}

Deno.test("CHAQUE BOUCHE DU ROSTER REÇOIT SES LIGNES, le titulaire porte celles de la table", () => {
  const out = compositionLinesByMouth({
    items: [
      foodLine("food.exclude", HOUSEHOLD_SUBJECT, "plus de plats en sauce"),
      foodLine("food.exclude", `member:${MINOR}`, "le poisson"),
    ],
    mouths: MOUTHS,
    ownerMemberId: ADULT,
  });

  assertEquals(out.byMouth.map((m) => m.memberId), [ADULT, MINOR]);
  assertEquals(out.otherSubjects.length, 0);
  assertEquals(out.householdUnattached, []);
  // La bouche sans ligne n'a PAS de voix vide: un nom suivi de rien ferait
  // croire au modèle qu'elle n'a rien à dire, ce qui est vrai, mais lui coûte
  // des jetons pour le dire.
  assertEquals(out.byMouth.length, 2);
});

Deno.test("⛔ LA LIGNE D'UNE BOUCHE PORTE SA MARQUE, CELLE DE LA TABLE N'EN PORTE PAS", () => {
  const out = compositionLinesByMouth({
    items: [
      foodLine("food.exclude", HOUSEHOLD_SUBJECT, "plus de plats en sauce"),
      foodLine("food.exclude", `member:${MINOR}`, "le poisson"),
      foodLine("food.prefer", `member:${UNKNOWN_AGE}`, "les pâtes"),
    ],
    mouths: MOUTHS,
    ownerMemberId: ADULT,
  });
  const of = (id: string) => out.byMouth.find((m) => m.memberId === id);

  // ⛔ LA LIGNE DE LA TABLE SORT À L'OCTET PRÈS. Lui coller une marque de
  // portée la rétrécirait à une personne — l'inverse de ce qu'elle dit.
  assertEquals(of(ADULT)?.remembered, ["2026-09-01 — plus de plats en sauce"]);

  // Un dégoût nommé dit son remède, et il n'est pas « n'en sers plus jamais ».
  assertEquals(
    of(MINOR)?.remembered,
    [
      `2026-09-01 — le poisson -- ${VOICE_REACH_MARK}: keep it out of the ` +
      `shared dish, or swap it in their box`,
    ],
  );
  // Un goût nommé n'est pas une commande pour la table.
  assert(of(UNKNOWN_AGE)?.remembered[0].includes("never a rule for the table"));
});

Deno.test("⛔ UNE BOUCHE PARTIE EST COMPTÉE, JAMAIS SERVIE", () => {
  const out = compositionLinesByMouth({
    items: [foodLine("food.exclude", `member:${GONE}`, "le poisson")],
    mouths: MOUTHS,
    ownerMemberId: ADULT,
  });
  assertEquals(out.byMouth, []);
  assertEquals(out.otherSubjects.length, 1);
});

Deno.test("⛔ SANS TITULAIRE À TABLE, LES LIGNES DE LA TABLE NE TOMBENT PAS EN SILENCE", () => {
  const out = compositionLinesByMouth({
    items: [foodLine("food.exclude", HOUSEHOLD_SUBJECT, "plus de plats en sauce")],
    mouths: MOUTHS,
    ownerMemberId: null,
  });
  assertEquals(out.byMouth, []);
  assertEquals(out.householdUnattached, ["plus de plats en sauce"]);
});

Deno.test("PROPRIÉTÉ — conservation: rien ne se perd entre les trois sorties", () => {
  const items = [
    foodLine("food.exclude", HOUSEHOLD_SUBJECT, "a"),
    foodLine("food.exclude", `member:${MINOR}`, "b"),
    foodLine("food.prefer", `member:${GONE}`, "c"),
    foodLine("method.avoid", `member:${ADULT}`, "d"),
    // Une famille qui n'appartient pas à la composition: ignorée des trois.
    portionAdjust({ direction: "down" }) as unknown as RetainedItem,
  ];
  const out = compositionLinesByMouth({ items, mouths: MOUTHS, ownerMemberId: ADULT });
  const served = out.byMouth.reduce(
    (n, m) => n + m.written.length + m.remembered.length,
    0,
  );
  assertEquals(served + out.householdUnattached.length + out.otherSubjects.length, 4);
});

Deno.test("L'ORDRE EST CELUI DU ROSTER, pas celui du magasin", () => {
  const out = compositionLinesByMouth({
    items: [
      foodLine("food.exclude", `member:${UNKNOWN_AGE}`, "z"),
      foodLine("food.exclude", `member:${MINOR}`, "y"),
      foodLine("food.exclude", HOUSEHOLD_SUBJECT, "x"),
    ],
    mouths: MOUTHS,
    ownerMemberId: ADULT,
  });
  assertEquals(out.byMouth.map((m) => m.memberId), [ADULT, MINOR, UNKNOWN_AGE]);
});

Deno.test("LE PLUS RÉCENT D'ABORD, par bouche — le même tri que l'audience unique", () => {
  const out = compositionLinesByMouth({
    items: [
      foodLine("food.exclude", `member:${MINOR}`, "vieux", "2026-08-01"),
      foodLine("food.exclude", `member:${MINOR}`, "neuf", "2026-09-01"),
    ],
    mouths: MOUTHS,
    ownerMemberId: ADULT,
  });
  const lines = out.byMouth[0].remembered;
  assert(lines[0].includes("neuf"), lines.join(" | "));
  assert(lines[1].includes("vieux"), lines.join(" | "));
});

Deno.test("⛔ CE QUE LA PERSONNE A TAPÉ N'EST PAS DATÉ, et reste séparé", () => {
  const typed = mk({
    kind: "food.exclude",
    scope: "durable",
    subject: `member:${MINOR}`,
    text: "le poisson",
    value: null,
    source: "written",
    at: "2026-09-01",
    item: "",
    confidence: null,
  });
  const out = compositionLinesByMouth({
    items: [typed],
    mouths: MOUTHS,
    ownerMemberId: ADULT,
  });
  assertEquals(out.byMouth[0].remembered, []);
  assertEquals(out.byMouth[0].written.length, 1);
  // La marque est là aussi: c'est la PORTÉE qui la commande, pas la source.
  assert(out.byMouth[0].written[0].includes(VOICE_REACH_MARK));
});
