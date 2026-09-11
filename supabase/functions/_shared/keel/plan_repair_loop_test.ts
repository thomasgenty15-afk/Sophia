/**
 * LOT 6 · LA BOUCLE DE RÉPARATION, ÉPROUVÉE SANS UN SEUL APPEL MODÈLE.
 *
 * Les cas de la famille « Réparations » du chantier: aucun défaut = zéro appel,
 * protéines seules = réparation possible, défauts multiples regroupés, deux
 * échecs, régression de sécurité, repli fournisseur, temps restant nul.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import type { GateRefusal } from "./final_plan_gate.ts";
import {
  CANDIDATE_VERDICTS,
  compareSafety,
  fallbackTimeoutMs,
  judgeCandidate,
  orderDefects,
  planRepairPass,
  REPAIR_DEFECT_KINDS,
  REPAIR_MIN_CALL_MS,
  REPAIR_PASS_REFUSALS,
  type RepairDefect,
  repairKindOf,
  violationKey,
} from "./plan_repair_loop.ts";

function defaut(over: Partial<RepairDefect> = {}): RepairDefect {
  return {
    kind: "sizing",
    day: "mon",
    slot: "lunch",
    dish: "Gratin",
    memberId: null,
    detail: "la part dépasse son plafond d'assiette",
    repairable: true,
    // ⟳ 2026-09-11 · LOT E — `magnitude` est REQUIS. Le défaut par défaut de
    // cette fixture n'en porte pas: la comparaison d'ampleur reste alors
    // inopérante (`magnitude_unknown`) et les cas d'avant ce lot décident
    // exactement comme avant, au COMPTE. Les cas qui exercent l'ampleur la
    // passent explicitement.
    magnitude: null,
    ...over,
  };
}

function refus(over: Partial<GateRefusal> = {}): GateRefusal {
  return {
    cause: "member_exclusion_served",
    severity: "refuse",
    day: "mon",
    slot: "lunch",
    dish: "Gratin",
    preparation_id: null,
    member_id: "m-lea",
    term: "arachide",
    detail: "",
    ...over,
  } as GateRefusal;
}

// ═══════════════════════════════════════════════════════════════════════════
// ① L'ORDRE DE L'INSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("l'ordre est celui du chantier: sécurité d'abord, préférence en dernier", () => {
  // ⛔ UNE INSTRUCTION QUI COMMENCE PAR « ajoute des lentilles » avant de dire
  // « ce plat contient l'allergène de quelqu'un » fait lire le second comme un
  // détail.
  const ordered = orderDefects([
    defaut({ kind: "preference" }),
    defaut({ kind: "protein" }),
    defaut({ kind: "safety" }),
    defaut({ kind: "sizing" }),
    defaut({ kind: "missing_meal" }),
  ]);
  assertEquals(ordered.map((d) => d.kind), [
    "safety",
    "missing_meal",
    "sizing",
    "protein",
    "preference",
  ]);
});

Deno.test("à nature égale, l'ordre est STABLE — deux runs restent comparables", () => {
  const a = defaut({ kind: "sizing", day: "mon", slot: "lunch", dish: "A" });
  const b = defaut({ kind: "sizing", day: "mon", slot: "lunch", dish: "B" });
  assertEquals(orderDefects([a, b]).map((d) => d.dish), ["A", "B"]);
  assertEquals(orderDefects([b, a]).map((d) => d.dish), ["B", "A"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LA DÉCISION D'APPELER
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("AUCUN DÉFAUT = ZÉRO APPEL, et c'est un succès", () => {
  const p = planRepairPass({
    defects: [],
    attemptsUsed: 0,
    maxAttempts: 2,
    remainingMs: 300_000,
  });
  assertEquals(p.call, false);
  if (!p.call) assertEquals(p.reason, "no_defects");
});

Deno.test("UN DÉFAUT PROTÉIQUE SEUL déclenche une tentative", () => {
  // ⛔ EXIGENCE LITTÉRALE DU CHANTIER. Sous l'ancien budget à réservations,
  // `protein_anchor_retry` était servi APRÈS deux autres motifs et se voyait
  // refuser `repair_reserved` — mesuré sur un run réel.
  const p = planRepairPass({
    defects: [defaut({ kind: "protein" })],
    attemptsUsed: 0,
    maxAttempts: 2,
    remainingMs: 300_000,
  });
  assertEquals(p.call, true);
  if (p.call) assertEquals(p.defects.length, 1);
});

Deno.test("DÉFAUTS MULTIPLES = UNE SEULE INSTRUCTION, pas un appel chacun", () => {
  // ⛔ C'EST LA MOITIÉ DU LOT. Deux défauts présents en même temps partaient
  // en deux appels: le second brûlait la dernière tentative pour un défaut que
  // le premier aurait pu traiter dans la même phrase.
  const p = planRepairPass({
    defects: [
      defaut({ kind: "protein" }),
      defaut({ kind: "safety" }),
      defaut({ kind: "sizing" }),
    ],
    attemptsUsed: 0,
    maxAttempts: 2,
    remainingMs: 300_000,
  });
  assertEquals(p.call, true);
  if (p.call) {
    assertEquals(p.defects.length, 3);
    assertEquals(p.defects[0].kind, "safety");
  }
});

Deno.test("UN CONTRÔLE DÉTERMINISTE NE CONSOMME PAS DE TENTATIVE", () => {
  // Une référence alimentaire introuvable ne se répare pas en réécrivant une
  // recette: le modèle ne la fera pas exister.
  const p = planRepairPass({
    defects: [defaut({ repairable: false }), defaut({ repairable: false })],
    attemptsUsed: 0,
    maxAttempts: 2,
    remainingMs: 300_000,
  });
  assertEquals(p.call, false);
  if (!p.call) assertEquals(p.reason, "nothing_repairable");
});

Deno.test("le mélange réparable / déterministe n'envoie QUE les réparables", () => {
  const p = planRepairPass({
    defects: [
      defaut({ repairable: false, kind: "safety" }),
      defaut({ kind: "protein" }),
    ],
    attemptsUsed: 0,
    maxAttempts: 2,
    remainingMs: 300_000,
  });
  assertEquals(p.call, true);
  if (p.call) {
    assertEquals(p.defects.length, 1);
    assertEquals(p.defects[0].kind, "protein");
  }
});

Deno.test("DEUX ÉCHECS: la troisième tentative n'existe pas", () => {
  const p = planRepairPass({
    defects: [defaut()],
    attemptsUsed: 2,
    maxAttempts: 2,
    remainingMs: 300_000,
  });
  assertEquals(p.call, false);
  if (!p.call) assertEquals(p.reason, "attempts_exhausted");
});

Deno.test("TEMPS RESTANT NUL: on n'appelle pas, et on ne reprend AUCUN défaut", () => {
  // ⛔ LA CICATRICE: un timeout calculé à zéro qui retombe sur la valeur par
  // défaut fait partir un appel de 300 s alors que la requête en avait 4
  // devant elle — donc un plan calculé, correct, et jamais écrit.
  for (const reste of [0, 1_000, REPAIR_MIN_CALL_MS - 1]) {
    const p = planRepairPass({
      defects: [defaut()],
      attemptsUsed: 0,
      maxAttempts: 2,
      remainingMs: reste,
    });
    assertEquals(p.call, false, `reste=${reste}`);
    if (!p.call) assertEquals(p.reason, "no_time_left");
  }
});

Deno.test("le timeout de la passe EST le temps restant, jamais un plafond", () => {
  const p = planRepairPass({
    defects: [defaut()],
    attemptsUsed: 1,
    maxAttempts: 2,
    remainingMs: 61_234,
  });
  assertEquals(p.call, true);
  if (p.call) assertEquals(p.timeoutMs, 61_234);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE REPLI FOURNISSEUR
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LE REPLI NE REPREND PAS LE TIMEOUT ENTIER DU PREMIER", () => {
  // ⛔ EXIGENCE LITTÉRALE. Le premier a déjà consommé du temps réel; lui
  // réoffrir son plafond ferait dépasser l'échéance absolue de la requête.
  assertEquals(
    fallbackTimeoutMs({ remainingMs: 200_000, spentMs: 90_000 }),
    110_000,
  );
});

Deno.test("un repli sans assez de temps rend ZÉRO — n'appelle pas", () => {
  assertEquals(fallbackTimeoutMs({ remainingMs: 60_000, spentMs: 55_000 }), 0);
  assertEquals(fallbackTimeoutMs({ remainingMs: 30_000, spentMs: 0 }), 0);
  // Un dépassement rend zéro, jamais un négatif qu'un appelant lirait comme
  // « pas de limite ».
  assertEquals(fallbackTimeoutMs({ remainingMs: 10_000, spentMs: 90_000 }), 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LA RÉGRESSION DE SÉCURITÉ
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("UNE VIOLATION AJOUTÉE EST UNE RÉGRESSION, même à compte constant", () => {
  // ⛔ LE CAS QUE LE CHANTIER NOMME. La recomposition retire l'arachide de Léa
  // et met du gluten dans l'assiette de Marc: DEUX pour DEUX. Un comparateur
  // de comptes l'accepterait comme un progrès.
  const avant = [refus({ member_id: "m-lea", term: "arachide" })];
  const apres = [refus({ member_id: "m-marc", term: "gluten" })];
  const c = compareSafety(avant, apres);
  assertEquals(c.regressed, true);
  assertEquals(c.added.length, 1);
  assertEquals(c.removed.length, 1);
});

Deno.test("UNE SECONDE VIOLATION DERRIÈRE UNE PREMIÈRE INCHANGÉE est vue", () => {
  // ⛔ « Le premier match par plat ne suffit pas »: deux bouches peuvent mordre
  // sur le MÊME plat pour deux règles différentes.
  const avant = [refus({ member_id: "m-lea" })];
  const apres = [
    refus({ member_id: "m-lea" }),
    refus({ member_id: "m-marc", term: "gluten" }),
  ];
  const c = compareSafety(avant, apres);
  assertEquals(c.regressed, true);
  assertEquals(c.added.length, 1);
  assertEquals(c.removed.length, 0);
});

Deno.test("une violation RÉPARÉE, sans nouvelle, n'est pas une régression", () => {
  const c = compareSafety([refus()], []);
  assertEquals(c.regressed, false);
  assertEquals(c.removed.length, 1);
});

Deno.test("une cause en politique `count` n'est PAS une régression", () => {
  // ⚠️ Une mesure n'est pas un danger. La traiter comme telle rejetterait une
  // candidate sur un compteur d'observation.
  const c = compareSafety([], [refus({ severity: "count" })]);
  assertEquals(c.regressed, false);
  assertEquals(c.added.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LA CANDIDATE QU'ON GARDE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("une candidate qui AJOUTE une violation est REJETÉE", () => {
  const v = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [refus()],
    beforeDefects: [defaut(), defaut()],
    afterDefects: [],
  });
  // ⛔ MÊME QUAND ELLE RÉPARE TOUT LE RESTE. La sécurité passe avant la
  // conformité nutritionnelle, et ce test le fige.
  assertEquals(v.verdict, "safety_regression");
});

Deno.test("une candidate qui répare est ADOPTÉE", () => {
  const v = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [],
    beforeDefects: [defaut(), defaut()],
    afterDefects: [defaut()],
  });
  assertEquals(v.verdict, "adopt");
});

Deno.test("une candidate qui n'améliore RIEN est rejetée", () => {
  // ⚠️ La garder ferait remplacer une version relue par une version
  // équivalente que personne n'a demandée.
  const v = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [],
    beforeDefects: [defaut()],
    afterDefects: [defaut()],
  });
  assertEquals(v.verdict, "no_improvement");
});

Deno.test("une candidate qui retire une violation est adoptée, même à défauts égaux", () => {
  const v = judgeCandidate({
    beforeRefusals: [refus()],
    afterRefusals: [],
    beforeDefects: [defaut()],
    afterDefects: [defaut()],
  });
  assertEquals(v.verdict, "adopt");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LES VOCABULAIRES SONT FERMÉS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("les trois vocabulaires du lot 6 sont FERMÉS", () => {
  // ⛔ Un motif de plus sans écran ni journal qui le rende est un mur muet.
  assertEquals([...REPAIR_DEFECT_KINDS], [
    "safety",
    "missing_meal",
    "sizing",
    "protein",
    "preference",
  ]);
  assertEquals([...REPAIR_PASS_REFUSALS], [
    "no_defects",
    "attempts_exhausted",
    "no_time_left",
    "nothing_repairable",
  ]);
  assertEquals([...CANDIDATE_VERDICTS], [
    "adopt",
    "safety_regression",
    "no_improvement",
  ]);
});

Deno.test("la clé d'une violation porte TOUT ce qui la distingue", () => {
  // ⛔ SI UN CHAMP SORT DE CETTE CLÉ, deux violations différentes deviennent la
  // même — et une régression passe pour un statu quo.
  const base = refus();
  const champs: Array<Partial<GateRefusal>> = [
    { cause: "house_rule_served" },
    { day: "tue" },
    { slot: "dinner" },
    { dish: "Autre" },
    { preparation_id: "p-1" },
    { member_id: "m-autre" },
    { term: "gluten" },
  ];
  for (const c of champs) {
    assert(
      violationKey(base) !== violationKey({ ...base, ...c } as GateRefusal),
      `le champ ${Object.keys(c)[0]} ne distingue plus deux violations`,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LA TRADUCTION ÉTIQUETTE → NATURE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("chaque rattrapage des deux lanes a sa nature, et l'inconnue est la plus faible", () => {
  // ⛔ C'EST CETTE TABLE QUI DONNE SON SENS À LA RÉSERVE CONDITIONNELLE: sans
  // elle, `planRepairReservedAfter` ne saurait pas qui est plus prioritaire que
  // qui. Une étiquette mal classée déplacerait un slot en silence.
  assertEquals(repairKindOf("exclusion_retry"), "safety");
  assertEquals(repairKindOf("unfed_retry"), "missing_meal");
  assertEquals(repairKindOf("density_repair"), "sizing");
  assertEquals(repairKindOf("dedicated_repair"), "sizing");
  assertEquals(repairKindOf("protein_anchor_retry"), "protein");
  assertEquals(repairKindOf("swap_retry"), "preference");
  assertEquals(repairKindOf("preference_split_retry"), "preference");
  assertEquals(repairKindOf("empty_slots_retry"), "missing_meal");
  assertEquals(repairKindOf("composition_retry"), "sizing");
  // ⚠️ UNE ÉTIQUETTE INCONNUE VAUT LA PLUS FAIBLE — elle ne vole donc jamais le
  // slot d'une allergie, et elle n'est pas muselée pour autant.
  assertEquals(repairKindOf("un_rattrapage_neuf"), "preference");
  assertEquals(
    REPAIR_DEFECT_KINDS.indexOf("sizing") <
      REPAIR_DEFECT_KINDS.indexOf("protein"),
    true,
    "le chantier place le grammage au-dessus des protéines",
  );
});
