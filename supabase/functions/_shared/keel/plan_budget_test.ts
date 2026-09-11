import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createPlanBudget,
  PLAN_BUDGET_REFUSALS,
  PLAN_REPAIR_RESERVED_AFTER,
  planRepairReservedAfter,
} from "./plan_budget.ts";
import {
  PLAN_MODEL_REPAIR_BUDGET,
  PLAN_REQUEST_BUDGET_MS,
  PLAN_TAIL_RESERVE_MS,
} from "./generation_model.ts";

/** Une horloge qu'on avance à la main : un test qui dort est un test qu'on saute. */
function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    start,
  };
}

/** L'ordre RÉEL des appels de la lane du foyer, tel que le code les exécute. */
const FOYER_ORDER = [
  "protein_anchor_retry",
  "exclusion_retry",
  "swap_retry",
  "preference_split_retry",
  "unfed_retry",
  "density_repair",
  "dedicated_repair",
] as const;

/** L'ordre RÉEL des appels de la lane solo. */
const SOLO_ORDER = [
  "protein_anchor_retry",
  "exclusion_retry",
  "empty_slots_retry",
  "composition_retry",
] as const;

function run(
  labels: readonly string[],
  opts: { skip?: readonly string[] } = {},
) {
  const c = clock();
  const b = createPlanBudget({ now: c.now, startedAtMs: c.start });
  const granted: string[] = [];
  const refused: Record<string, string> = {};
  for (const l of labels) {
    if (opts.skip?.includes(l)) continue; // ce défaut n'existe pas sur ce plan
    const ask = b.askRepair(l, 1_000, 120_000);
    if (ask.granted) granted.push(l);
    else refused[l] = String(ask.refusal);
  }
  return { granted, refused, snapshot: b.snapshot() };
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LE CAS QUI PASSE, ET LA PRIORITÉ QU'IL PROUVE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LE CAS QUI PASSE — la lane du foyer dépense ses deux slots sur la SÉCURITÉ et la DENSITÉ", () => {
  // ⛔ C'est le piège du lot : dans l'ordre du code, la protéine passe AVANT
  // l'exclusion et la densité. Un compteur partagé naïf aurait donné les deux
  // slots aux deux premiers venus — et la réparation de densité, celle qui a
  // fait passer le foyer `cinq` de 6 assiettes dans les bornes à 12 sur 15, ne
  // serait jamais partie.
  const r = run(FOYER_ORDER);
  assertEquals(r.granted, ["exclusion_retry", "density_repair"]);
  assertEquals(r.refused.protein_anchor_retry, "repair_reserved");
  assertEquals(r.refused.swap_retry, "repair_reserved");
  assertEquals(r.refused.unfed_retry, "repair_reserved");
  assertEquals(r.refused.dedicated_repair, "repair_budget_exhausted");
  assertEquals(r.refused.preference_split_retry, "repair_reserved");
  assertEquals(r.snapshot.repairs_used, 2);
});

Deno.test("sans morsure d'exclusion, le slot libre va à la LIVRAISON, pas à la qualité", () => {
  // Une bouche sans repas du tout passe devant un échange de plat ou une
  // séparation de préférence — mais elle ne prend jamais le slot réservé à la
  // densité, qui la suit dans le pipeline.
  const r = run(FOYER_ORDER, { skip: ["exclusion_retry"] });
  assertEquals(r.granted, ["unfed_retry", "density_repair"]);
  assertEquals(r.refused.swap_retry, "repair_reserved");
  assertEquals(r.refused.preference_split_retry, "repair_reserved");
});

Deno.test("sans exclusion NI bouche affamée, les DEUX réparations de densité partent", () => {
  const r = run(FOYER_ORDER, { skip: ["exclusion_retry", "unfed_retry"] });
  assertEquals(r.granted, ["density_repair", "dedicated_repair"]);
});

Deno.test("la lane solo dépense ses slots sur l'EXCLUSION et le VERDICT D'ÉNERGIE", () => {
  // Mesuré sur la campagne du 2026-09-09 : trois plans de perte de poids sur
  // trois sortent hors bande (+24 %, +29 %, +49 %). C'est `composition_retry`
  // qui porte cette correction, et il est le DERNIER appelé.
  const r = run(SOLO_ORDER);
  assertEquals(r.granted, ["exclusion_retry", "composition_retry"]);
  assertEquals(r.refused.protein_anchor_retry, "repair_reserved");
  assertEquals(r.refused.empty_slots_retry, "repair_reserved");
});

Deno.test("un créneau vide passe quand rien de plus prioritaire ne le précède", () => {
  const r = run(SOLO_ORDER, { skip: ["exclusion_retry"] });
  assertEquals(r.granted, ["empty_slots_retry", "composition_retry"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LA TABLE DE RÉSERVE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ UN LABEL INCONNU EST TRAITÉ COMME LE PLUS FAIBLE, jamais comme le plus fort", () => {
  // Un rattrapage neuf qu'on oublie d'inscrire ne doit pas prendre le slot de
  // la densité en silence : il doit se faire refuser et se voir.
  assertEquals(planRepairReservedAfter("un_rattrapage_neuf"), 2);
  const r = run(["un_rattrapage_neuf", "density_repair"]);
  assertEquals(r.granted, ["density_repair"]);
  assertEquals(r.refused.un_rattrapage_neuf, "repair_reserved");
});

Deno.test("la table couvre TOUS les rattrapages des deux lanes, et rien de plus", () => {
  const known = Object.keys(PLAN_REPAIR_RESERVED_AFTER).sort();
  const used = [...new Set([...FOYER_ORDER, ...SOLO_ORDER])].sort();
  assertEquals(known, used, "la table et les pipelines ont divergé");
});

Deno.test("⛔ LA RÉSERVE N'EST PAS « ÉPUISÉ » — les deux motifs ne se confondent pas", () => {
  // Confondre les deux enverrait agrandir un budget là où c'est l'ordre du
  // pipeline qui décide.
  const c = clock();
  const b = createPlanBudget({ now: c.now, startedAtMs: c.start });
  assertEquals(
    b.askRepair("protein_anchor_retry", 0, 1_000).refusal,
    "repair_reserved",
  );
  assertEquals(
    b.snapshot().repairs_used,
    0,
    "un refus de réserve ne consomme rien",
  );
  b.askRepair("exclusion_retry", 0, 1_000);
  b.askRepair("density_repair", 0, 1_000);
  assertEquals(
    b.askRepair("dedicated_repair", 0, 1_000).refusal,
    "repair_budget_exhausted",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE TEMPS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("le budget par défaut est celui du module de génération, pas un nombre écrit ici", () => {
  // ⛔ Un test qui recopie sa propre constante reste vert quand on change la
  // vraie. On lit la constante de production et on la CONSOMME.
  const c = clock();
  const b = createPlanBudget({ now: c.now, startedAtMs: c.start });
  let granted = 0;
  for (let i = 0; i < PLAN_MODEL_REPAIR_BUDGET + 3; i++) {
    if (b.askRepair("density_repair", 1_000, 60_000).granted) granted += 1;
  }
  assertEquals(granted, PLAN_MODEL_REPAIR_BUDGET);
  assertEquals(b.snapshot().repairs_allowed, PLAN_MODEL_REPAIR_BUDGET);
  assertEquals(b.snapshot().total_ms, PLAN_REQUEST_BUDGET_MS);
  assertEquals(b.snapshot().reserve_ms, PLAN_TAIL_RESERVE_MS);
});

Deno.test("⛔ LA QUEUE EST RÉSERVÉE — le temps utilisable exclut toujours la réserve", () => {
  // Un plan mesuré, réparé, et non écrit ne vaut rien : les dernières secondes
  // appartiennent à la mesure finale, aux ceintures et à l'écriture.
  const c = clock();
  const b = createPlanBudget({
    now: c.now,
    startedAtMs: c.start,
    totalMs: 100_000,
    reserveMs: 30_000,
  });
  assertEquals(b.remainingMs(), 100_000);
  assertEquals(b.usableMs(), 70_000);
  c.advance(60_000);
  assertEquals(b.remainingMs(), 40_000);
  assertEquals(b.usableMs(), 10_000);
  c.advance(50_000);
  assertEquals(b.remainingMs(), -10_000);
  assertEquals(
    b.usableMs(),
    0,
    "le temps utilisable ne descend jamais sous zéro",
  );
});

Deno.test("le timeout d'un appel est raboté par le temps restant, jamais l'inverse", () => {
  const c = clock();
  const b = createPlanBudget({
    now: c.now,
    startedAtMs: c.start,
    totalMs: 100_000,
    reserveMs: 30_000,
  });
  assertEquals(
    b.timeoutFor(50_000),
    50_000,
    "un plafond sous le restant passe entier",
  );
  assertEquals(
    b.timeoutFor(200_000),
    70_000,
    "un plafond au-dessus est raboté",
  );
  c.advance(65_000);
  assertEquals(b.timeoutFor(50_000), 5_000);
});

Deno.test("⛔ UN RATTRAPAGE QUI NE RENTRE PAS NE PART PAS — et il se nomme `time_budget_exhausted`", () => {
  // La nuit du 2026-08-19 : 987 appels lancés, 101 aboutis, 137 abandons. Un
  // appel abandonné a fait générer une réponse ENTIÈRE, facturée, jamais lue.
  const c = clock();
  const b = createPlanBudget({
    now: c.now,
    startedAtMs: c.start,
    totalMs: 100_000,
    reserveMs: 30_000,
  });
  c.advance(60_000); // utilisable : 10 s
  const ask = b.askRepair("density_repair", 40_000, 120_000);
  assertEquals(ask.granted, false);
  assertEquals(ask.refusal, "time_budget_exhausted");
  assertEquals(ask.timeoutMs, 0);
  // ⛔ ET LE BUDGET N'EST PAS CONSOMMÉ : un refus de temps ne coûte pas un
  // rattrapage. Sinon un ralentissement momentané mangerait le droit d'en
  // faire un quand le temps revient.
  assertEquals(b.snapshot().repairs_used, 0);
  assertEquals(b.snapshot().repairs_asked, 1);
  assertEquals(b.snapshot().repairs_refused, { time_budget_exhausted: 1 });
});

Deno.test("⛔ L'ORDRE DES MOTIFS — un budget vide se dit `repair_budget_exhausted`, même si le temps manque aussi", () => {
  const c = clock();
  const b = createPlanBudget({
    now: c.now,
    startedAtMs: c.start,
    totalMs: 100_000,
    reserveMs: 30_000,
    repairs: 1,
  });
  assertEquals(b.askRepair("density_repair", 1_000, 10_000).granted, true);
  c.advance(95_000); // le temps manque AUSSI
  const ask = b.askRepair("dedicated_repair", 1_000, 10_000);
  assertEquals(ask.refusal, "repair_budget_exhausted");
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LE RESTE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("`wouldGrant` regarde sans consommer", () => {
  const c = clock();
  const b = createPlanBudget({ now: c.now, startedAtMs: c.start, repairs: 1 });
  assertEquals(b.wouldGrant("density_repair", 1_000).granted, true);
  assertEquals(b.wouldGrant("density_repair", 1_000).granted, true);
  assertEquals(b.snapshot().repairs_used, 0);
  assertEquals(b.snapshot().repairs_asked, 0);
});

Deno.test("un budget à zéro rattrapage refuse le premier, et les contrôles déterministes ne le regardent pas", () => {
  const c = clock();
  const b = createPlanBudget({ now: c.now, startedAtMs: c.start, repairs: 0 });
  const ask = b.askRepair("density_repair", 0, 10_000);
  assertEquals(ask.granted, false);
  assertEquals(ask.refusal, "repair_budget_exhausted");
});

Deno.test("les tentatives fournisseur se comptent, elles ne se devinent pas", () => {
  const c = clock();
  const b = createPlanBudget({ now: c.now, startedAtMs: c.start });
  b.noteProviderAttempts(2);
  b.noteProviderAttempts(1);
  b.noteProviderAttempts(0);
  b.noteProviderAttempts(Number.NaN);
  assertEquals(b.snapshot().provider_attempts, 3);
});

Deno.test("le vocabulaire des refus est FERMÉ", () => {
  assertEquals([...PLAN_BUDGET_REFUSALS], [
    "repair_budget_exhausted",
    "time_budget_exhausted",
    "repair_reserved",
  ]);
});

Deno.test("le journal nomme QUI a mangé les slots", () => {
  const r = run(FOYER_ORDER);
  assertEquals(r.snapshot.charged, ["exclusion_retry", "density_repair"]);
  assert(
    r.snapshot.repairs_asked > r.snapshot.repairs_used,
    "les refus ne sont pas comptés",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-11 · LOT 6 — LA RÉSERVE CONDITIONNELLE, UNE FOIS LA PESÉE REMONTÉE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * L'ordre RÉEL de la lane du foyer, et — comme dans le générateur — un site ne
 * demande QUE si son défaut existe. Un banc qui les ferait tous demander
 * mesurerait une situation qui n'arrive jamais.
 */
const SITES: readonly [string, string][] = [
  ["protein_anchor_retry", "protein"],
  ["exclusion_retry", "safety"],
  ["swap_retry", "preference"],
  ["preference_split_retry", "preference"],
  ["unfed_retry", "missing_meal"],
  ["density_repair", "sizing"],
  ["dedicated_repair", "sizing"],
];

function pipeline(defauts: ReadonlySet<string>, mesure: boolean): string[] {
  const c = clock();
  const b = createPlanBudget({ now: c.now, startedAtMs: c.start });
  // ⛔ CE QUE LA PESÉE REND DISPONIBLE: les natures PLUS PRIORITAIRES que le
  // grammage et au-dessus. `protein` et `preference` n'y sont pas — elles ne
  // réservent rien à personne, étant les plus faibles.
  const pending = mesure
    ? new Set([...defauts].filter((k) => k !== "protein" && k !== "preference"))
    : null;
  const accordes: string[] = [];
  for (const [label, kind] of SITES) {
    if (!defauts.has(kind)) continue;
    const a = b.askRepair(label, 1_000, 120_000, pending ?? undefined);
    if (a.granted) {
      accordes.push(label);
      // ⛔ LA NATURE SERVIE SORT DE L'ENSEMBLE. Sans ça, `safety` réserverait
      // pour elle-même après avoir été traitée, et le rattrapage suivant se
      // verrait refuser un slot gardé pour un défaut déjà réglé.
      pending?.delete(kind);
    }
  }
  return accordes;
}

Deno.test("⟳ UN DÉFAUT PROTÉIQUE SEUL DÉCLENCHE UNE TENTATIVE — la demande du chantier", () => {
  // ⛔ AVANT: la table réservait 2 slots derrière la protéine, sur un budget de
  // 2. Elle ne partait JAMAIS, même sur un plan parfait par ailleurs, budget
  // intact. Mesuré sur un run réel.
  const seul = new Set(["protein"]);
  assertEquals(
    pipeline(seul, false),
    [],
    "à l'aveugle, la protéine ne part pas",
  );
  assertEquals(pipeline(seul, true), ["protein_anchor_retry"]);
});

Deno.test("⛔ ET LA DENSITÉ N'EST PAS PERDUE AU PASSAGE", () => {
  // C'est la réparation qui a fait passer le foyer `cinq` de 6 assiettes dans
  // les bornes à 12 sur 15. Toute règle qui la sacrifie est un mauvais échange.
  assertEquals(pipeline(new Set(["sizing"]), true), [
    "density_repair",
    "dedicated_repair",
  ]);
  assertEquals(pipeline(new Set(["safety", "sizing"]), true), [
    "exclusion_retry",
    "density_repair",
  ]);
  // ⚠️ ET AVEC LA PROTÉINE EN PLUS, LES DEUX PARTENT QUAND MÊME: la protéine
  // prend le premier slot, le grammage garde le sien parce qu'il est RÉSERVÉ —
  // et il l'est parce qu'on a MESURÉ qu'il était en défaut.
  assertEquals(pipeline(new Set(["protein", "sizing"]), true), [
    "protein_anchor_retry",
    "density_repair",
  ]);
});

Deno.test("à trois défauts et deux slots, ce sont les DEUX PLUS PRIORITAIRES qui partent", () => {
  // ⛔ AVANT: `exclusion` puis `density` — le grammage passait devant la
  // livraison, alors que le chantier place « présence des repas » AU-DESSUS.
  // Et une bouche sans aucun repas ne peut pas attendre le plan suivant.
  const trois = new Set(["safety", "missing_meal", "sizing"]);
  assertEquals(pipeline(trois, false), ["exclusion_retry", "density_repair"]);
  assertEquals(pipeline(trois, true), ["exclusion_retry", "unfed_retry"]);
});

Deno.test("SANS PESÉE, le comportement d'avant est RENDU À L'IDENTIQUE", () => {
  // ⛔ LA LANE INDIVIDUELLE N'A PAS REMONTÉ SA PESÉE. Elle ne passe donc aucun
  // ensemble, et retombe sur la table — exactement comme hier. Ce test est ce
  // qui garantit qu'on n'a rien changé chez elle en passant.
  const r = run(SOLO_ORDER);
  assertEquals(r.granted, ["exclusion_retry", "composition_retry"]);
  assertEquals(r.refused.protein_anchor_retry, "repair_reserved");
});
