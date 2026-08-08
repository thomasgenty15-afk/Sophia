// FF-001 — les pratiques quotidiennes: daily_practices.ts.
//
// Les tests qui portent la décision produit, et pas la couverture:
//
//   * "on ne refuse jamais une pratique sur la méthode" (R8)
//     -- ce produit vend la méthode du coach, pas la nôtre. « Jeûne jusqu'à
//        midi » se restreint par objectif, il ne se refuse pas. Le seul refus
//        est une incohérence interne, et il NOMME la ceinture (R9).
//   * "le chiffre retiré du bloc est aussi retiré des nombres autorisés" (R5+R10)
//     -- le laisser dans `numbers` serait une permission accordée à un texte qui
//        n'a plus le droit de le porter: la ceinture deviendrait complice de la
//        fuite qu'elle doit voir.
//   * "sept pratiques, sept soirs, chacune au moins une fois" (R6)
//     -- une rotation sans état qui piège un élève sur la même pratique un jour
//        de semaine donné vaut moins que pas de rotation du tout.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  type DailyPractice,
  decidePracticeMode,
  detectBeltCollision,
  MAX_DAILY_PRACTICES,
  parseDailyPractices,
  practiceAllowedNumbers,
  practiceBriefBlock,
  practiceForbiddenNumbers,
  practiceInjectionFor,
  practiceKey,
  practicesFor,
  redactQuantities,
  selectPracticeForEvening,
  studentFingerprint,
} from "./daily_practices.ts";

function practice(over: Partial<DailyPractice> = {}): DailyPractice {
  return {
    label: "4 glasses of water across the day",
    kind: "hydration",
    quantified: true,
    target: 4,
    unit: "glasses",
    goalScope: [],
    cadence: "rotating",
    askable: true,
    minorSafe: true,
    brief: "Water is the cheapest lever this coach has. Keep it plain.",
    status: "active",
    collidesWith: null,
    ...over,
  };
}

/** La forme telle qu'elle vit en jsonb — snake_case, comme la base l'écrit. */
function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    label: "4 glasses of water across the day",
    kind: "hydration",
    quantified: true,
    target: 4,
    unit: "glasses",
    goal_scope: [],
    cadence: "rotating",
    askable: true,
    minor_safe: true,
    brief: "Water is the cheapest lever this coach has.",
    status: "active",
    collides_with: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// R8 / R9 — LA FRONTIÈRE ENTRE « CE COACH A TORT » ET « ON SE CONTREDIT »
// ---------------------------------------------------------------------------

Deno.test("R8: une méthode qu'on n'aime pas n'est PAS une pratique bloquée", () => {
  // Les quatre que quelqu'un aurait envie de refuser au nom du bon goût
  // nutritionnel. Aucune ne touche une ceinture du produit: elles passent.
  for (
    const label of [
      "Fast until noon, every day",
      "Jeûne jusqu'à midi tous les jours",
      "Salt your food generously",
      "Two coffees before training, no exception",
    ]
  ) {
    assertEquals(detectBeltCollision(label), null, label);
    const { practices } = parseDailyPractices([row({ label })]);
    assertEquals(practices[0].status, "active", label);
    assertEquals(practices[0].collidesWith, null, label);
  }
});

Deno.test("R9: se peser mord, en français comme en anglais, et NOMME la ceinture", () => {
  for (
    const label of [
      "Pèse-toi tous les matins",
      "Weigh yourself every morning",
      "Step on the scale before breakfast",
      "Monte sur la balance au réveil",
    ]
  ) {
    assertEquals(detectBeltCollision(label), "weight_readout", label);
  }
  const { practices } = parseDailyPractices([row({ label: "Pèse-toi tous les matins" })]);
  assertEquals(practices[0].status, "blocked");
  // Le motif NOMME la ceinture: un blocage qu'on ne peut pas expliquer au coach
  // est un blocage qu'il vivra comme de l'arbitraire.
  assertEquals(practices[0].collidesWith, "weight_readout");
});

Deno.test("R9: peser des PORTIONS n'est pas une lecture de balance", () => {
  // La réflexivité est ce qui sépare les deux, et un faux blocage supprime en
  // silence une pratique que le coach a écrite.
  assertEquals(detectBeltCollision("Weigh your portions before cooking"), null);
  assertEquals(detectBeltCollision("Pèse tes portions de riz"), null);
});

Deno.test("R9: un blocage sans ceinture à nommer repart en relecture", () => {
  // « On bloque uniquement en collision avec une ceinture existante, ET ON LA
  // NOMME. » Un `blocked` orphelin — jsonb bricolé, ou refus de méthode déguisé
  // en collision par le modèle — ne peut pas s'expliquer au coach. Il ne part
  // pas plus pour autant, mais on ne lui présente pas un verdict muet.
  const { practices, issues } = parseDailyPractices([
    row({
      label: "Fast until noon",
      status: "blocked",
      collides_with: "this coach is wrong about fasting",
    }),
  ]);
  assertEquals(practices[0].status, "needs_review");
  assertEquals(practices[0].collidesWith, null);
  assert(issues.some((i) => i.includes("no belt to name")));
});

Deno.test("R9: un `status` réécrit à la main ne lève pas la collision", () => {
  // La ceinture se rejoue à CHAQUE lecture, sur le label. C'est la différence
  // entre une ceinture structurelle et une ceinture déclarative.
  const { practices } = parseDailyPractices([
    row({ label: "Weigh yourself every morning", status: "active", collides_with: null }),
  ]);
  assertEquals(practices[0].status, "blocked");
  assertEquals(practices[0].collidesWith, "weight_readout");
});

// ---------------------------------------------------------------------------
// LA LECTURE — ce qui est lâché, ce qui est gardé, et le plafond
// ---------------------------------------------------------------------------

Deno.test("R2: la huitième pratique est lâchée, et le coach le lit", () => {
  const rows = Array.from({ length: 9 }, (_, i) => row({ label: `Practice ${i}` }));
  const { practices, issues } = parseDailyPractices(rows);
  assertEquals(practices.length, MAX_DAILY_PRACTICES);
  assertEquals(practices[6].label, "Practice 6");
  // Deux de trop, deux motifs. Un plafond appliqué en silence détruirait
  // justement la prédictibilité qu'il existe pour donner.
  assertEquals(issues.filter((i) => i.includes("over the cap")).length, 2);
});

Deno.test("un champ illisible GARDE la saisie du coach en needs_review", () => {
  // §7: « la pratique est stockée (le coach ne perd pas sa saisie) ». Une
  // classification ratée est un écran à relire, pas un texte perdu.
  const { practices, issues } = parseDailyPractices([
    row({ label: "Ten minutes of walking", kind: "wandering_about" }),
  ]);
  assertEquals(practices.length, 1);
  assertEquals(practices[0].label, "Ten minutes of walking");
  assertEquals(practices[0].status, "needs_review");
  assert(issues.some((i) => i.includes("unknown kind")));
});

Deno.test("une pratique sans label est lâchée: rien à montrer, rien à dire", () => {
  const { practices, issues } = parseDailyPractices([row({ label: "   " }), row()]);
  assertEquals(practices.length, 1);
  assert(issues.some((i) => i.includes("empty label")));
});

Deno.test("un `target` inutilisable ne devient jamais un chiffre dans la bulle", () => {
  for (const bad of [0, -3, "beaucoup", null]) {
    const { practices } = parseDailyPractices([row({ target: bad })]);
    assertEquals(practices[0].status, "needs_review", String(bad));
    assertEquals(practices[0].target, null, String(bad));
  }
});

Deno.test("`askable` et `minor_safe` absents valent NON", () => {
  // Le silence d'un champ n'est pas une permission — surtout pas celle
  // d'adresser une pratique quantifiée à un mineur (R5).
  const { practices } = parseDailyPractices([
    { label: "Walk after dinner", kind: "movement", cadence: "rotating", brief: "b", status: "active" },
  ]);
  assertEquals(practices[0].askable, false);
  assertEquals(practices[0].minorSafe, false);
});

Deno.test("une portée illisible n'atteint PERSONNE, jamais tout le monde", () => {
  // Le repli de `parseGoalScope`, partagé avec la doctrine: le coach a voulu
  // restreindre, on ne sait pas à quoi, et « globale » serait la fuite exacte
  // que la portée existe pour fermer.
  const { practices } = parseDailyPractices([row({ goal_scope: { fat_loss: true } })]);
  assertEquals(practicesFor(practices, "fat_loss", false).length, 0);
  assertEquals(practicesFor(practices, null, false).length, 0);
});

// ---------------------------------------------------------------------------
// QUI REÇOIT QUOI
// ---------------------------------------------------------------------------

Deno.test("R7: needs_review et blocked ne sont jamais servis", () => {
  const list = [
    practice({ label: "ok" }),
    practice({ label: "review", status: "needs_review" }),
    practice({ label: "blocked", status: "blocked", collidesWith: "weight_readout" }),
    practice({ label: "remind only", status: "remind_only" }),
  ];
  assertEquals(
    practicesFor(list, null, false).map((p) => p.label),
    ["ok", "remind only"],
  );
});

Deno.test("une pratique de portée fat_loss n'atteint pas un muscle_gain", () => {
  const list = [practice({ label: "cut", goalScope: ["fat_loss"] })];
  assertEquals(practicesFor(list, "muscle_gain", false).length, 0);
  assertEquals(practicesFor(list, "fat_loss", false).length, 1);
  // Un élève sans objectif déclaré n'est pas un élève qui a tous les objectifs.
  assertEquals(practicesFor(list, null, false).length, 0);
});

Deno.test("R5: un mineur ne reçoit que ce qui est marqué minor_safe", () => {
  const list = [
    practice({ label: "safe", minorSafe: true }),
    practice({ label: "not safe", minorSafe: false }),
  ];
  assertEquals(practicesFor(list, null, true).map((p) => p.label), ["safe"]);
  assertEquals(practicesFor(list, null, false).length, 2);
});

// ---------------------------------------------------------------------------
// R6 — LA ROTATION
// ---------------------------------------------------------------------------

Deno.test("R6: sept pratiques, sept soirs, chacune au moins une fois", () => {
  const list = Array.from({ length: 7 }, (_, i) => practice({ label: `p${i}` }));
  const seen = new Set<string>();
  for (let d = 0; d < 7; d++) {
    const chosen = selectPracticeForEvening({
      practices: list,
      userId: "student-a",
      localDate: `2026-08-${String(10 + d).padStart(2, "0")}`,
    });
    seen.add(chosen!.label);
  }
  assertEquals(seen.size, 7);
});

Deno.test("R6: deux élèves du même coach le même soir ne sont pas au garde-à-vous", () => {
  const list = Array.from({ length: 5 }, (_, i) => practice({ label: `p${i}` }));
  // « Pas systématiquement la même »: c'est une propriété sur la cohorte, pas
  // sur une paire. On la mesure comme telle.
  const labels = new Set(
    Array.from({ length: 12 }, (_, i) =>
      selectPracticeForEvening({
        practices: list,
        userId: `student-${i}`,
        localDate: "2026-08-11",
      })!.label),
  );
  assert(labels.size > 1, `same practice for all 12 students: ${[...labels]}`);
});

Deno.test("R6: le même élève, le même jour, la même pratique — le rejeu est stable", () => {
  const list = Array.from({ length: 4 }, (_, i) => practice({ label: `p${i}` }));
  const once = selectPracticeForEvening({
    practices: list,
    userId: "student-a",
    localDate: "2026-08-11",
  });
  const twice = selectPracticeForEvening({
    practices: list,
    userId: "student-a",
    localDate: "2026-08-11",
  });
  assertEquals(once!.label, twice!.label);
});

Deno.test("`constant` repasse deux fois plus souvent, sans jamais doubler un soir", () => {
  const list = [
    practice({ label: "core", cadence: "constant" }),
    practice({ label: "a" }),
    practice({ label: "b" }),
  ];
  // Le cycle fait 4 soirs (2 + 1 + 1). On en parcourt 5 pour éprouver le
  // BOUCLAGE: c'est là que la construction naïve (« toutes, puis les constant »)
  // servait `core` deux soirs de suite, et deux soirs identiques d'affilée sont
  // exactement le papier peint que ce module existe pour éviter.
  const cycle = Array.from({ length: 5 }, (_, d) =>
    selectPracticeForEvening({
      practices: list,
      userId: "student-a",
      localDate: `2026-08-${String(10 + d).padStart(2, "0")}`,
    })!.label);
  assertEquals(cycle.slice(0, 4).filter((l) => l === "core").length, 2);
  assertEquals(new Set(cycle.slice(0, 4)).size, 3);
  for (let i = 1; i < cycle.length; i++) assert(cycle[i] !== cycle[i - 1], cycle.join(","));
});

Deno.test("aucune pratique ⇒ null, et une date illisible LÈVE", () => {
  assertEquals(
    selectPracticeForEvening({ practices: [], userId: "a", localDate: "2026-08-11" }),
    null,
  );
  // R7: une rotation qui se trompe de jour sert la mauvaise pratique tous les
  // soirs sans qu'aucune erreur n'existe.
  assertThrows(() =>
    selectPracticeForEvening({
      practices: [practice()],
      userId: "a",
      localDate: "11/08/2026",
    })
  );
  assertThrows(() => studentFingerprint(""));
});

// ---------------------------------------------------------------------------
// LE MODE
// ---------------------------------------------------------------------------

Deno.test("R3: le soir où le pulse demande, la pratique est un RAPPEL", () => {
  assertEquals(
    decidePracticeMode({ pulseAsks: true, restrictionFlag: false, askBudgetSpent: false, practiceIgnored: false, practice: practice() }),
    "remind",
  );
  assertEquals(
    decidePracticeMode({ pulseAsks: false, restrictionFlag: false, askBudgetSpent: false, practiceIgnored: false, practice: practice() }),
    "ask",
  );
});

Deno.test("R4: plancher TCA levé ⇒ plus aucune question, le rappel survit", () => {
  // Le rappel ne demande rien et ne mesure rien. Le supprimer priverait l'élève
  // de la voix de son coach au moment précis où elle vaut le plus.
  assertEquals(
    decidePracticeMode({ pulseAsks: false, restrictionFlag: true, askBudgetSpent: false, practiceIgnored: false, practice: practice() }),
    "remind",
  );
});

Deno.test("R7: une pratique non servable n'a pas de mode", () => {
  for (const status of ["needs_review", "blocked"] as const) {
    assertEquals(
      decidePracticeMode({
        pulseAsks: false,
        restrictionFlag: false,
        askBudgetSpent: false,
        practiceIgnored: false,
        practice: practice({ status }),
      }),
      "none",
      status,
    );
  }
});

Deno.test("`askable: false` et `remind_only` ne deviennent jamais une question", () => {
  assertEquals(
    decidePracticeMode({
      pulseAsks: false,
      restrictionFlag: false,
      askBudgetSpent: false,
      practiceIgnored: false,
      practice: practice({ askable: false }),
    }),
    "remind",
  );
  assertEquals(
    decidePracticeMode({
      pulseAsks: false,
      restrictionFlag: false,
      askBudgetSpent: false,
      practiceIgnored: false,
      practice: practice({ status: "remind_only" }),
    }),
    "remind",
  );
});

// ---------------------------------------------------------------------------
// LE BLOC ET LES NOMBRES
// ---------------------------------------------------------------------------

Deno.test("R5: pour un mineur, AUCUN chiffre n'atteint le modèle — label compris", () => {
  // ⚠️ LE DÉFAUT QUE CE TEST A ATTRAPÉ, ET QUI EST LA RAISON DE `redactQuantities`.
  // Le premier jet retirait « The figure that goes with it: 4 glasses » et
  // laissait le LABEL verbatim deux lignes plus haut — or le label EST « 4
  // glasses of water across the day ». La règle était écrite, la garde était
  // verte, et le chiffre passait par la porte à côté.
  const p = practice();
  const block = practiceBriefBlock(p, "remind", true);
  // « Aucun chiffre nulle part dans le bloc » — la seule assertion qui ne se
  // laisse pas contourner par une porte à côté qu'on n'aurait pas listée.
  assert(!/\d/.test(block), block);
  assert(block.includes("is a minor"), block);
  assertEquals(practiceAllowedNumbers(p, "remind", true), []);
  // Et la ceinture de sortie a de quoi le REFUSER si le modèle le réinvente:
  // `allowedNumbers` ne regarde qu'un nombre devant un nom comptable, et
  // « verres » n'en est pas un. Sans cette liste négative, R5 ne serait
  // vérifiable nulle part.
  assertEquals(practiceForbiddenNumbers(p, "remind", true), [4]);

  const adult = practiceBriefBlock(p, "remind", false);
  assert(adult.includes("4 glasses"), adult);
  assertEquals(practiceAllowedNumbers(p, "remind", false), [4]);
  assertEquals(practiceForbiddenNumbers(p, "remind", false), []);
});

Deno.test("la redaction retire les chiffres et les mots-nombres, pas les articles", () => {
  assertEquals(redactQuantities("Bois 4 verres d'eau"), "Bois verres d'eau");
  assertEquals(redactQuantities("Walk for thirty minutes"), "Walk for thirty minutes");
  assertEquals(redactQuantities("Walk for ten minutes"), "Walk for minutes");
  // `un` / `une` restent: ce sont les articles indéfinis français, et les
  // retirer mutilerait des dizaines de pratiques qui ne portent aucun chiffre.
  assertEquals(redactQuantities("Bois un verre à chaque repas"), "Bois un verre à chaque repas");
});

Deno.test("R10: le target rejoint les nombres autorisés, et rien d'autre", () => {
  assertEquals(practiceAllowedNumbers(practice({ target: 3 }), "ask", false), [3]);
  // Non quantifiée: aucun nombre à justifier, donc aucune permission donnée.
  assertEquals(
    practiceAllowedNumbers(
      practice({ quantified: false, target: null, unit: null }),
      "ask",
      false,
    ),
    [],
  );
  assertEquals(practiceAllowedNumbers(practice(), "none", false), []);
});

Deno.test("le bloc porte les mots du coach VERBATIM et dit la forme attendue", () => {
  const p = practice({ label: "Bois 4 verres d'eau, pas plus compliqué que ça" });
  const ask = practiceBriefBlock(p, "ask", false);
  assert(ask.includes(`"${p.label}"`), ask);
  assert(ask.includes("exactly ONE question"), ask);
  const remind = practiceBriefBlock(p, "remind", false);
  assert(remind.includes("Do not ask about it"), remind);
  assert(!remind.includes("ONE question"), remind);
  // Mode `none`: pas de bloc du tout, jamais un bloc vide avec un en-tête.
  assertEquals(practiceBriefBlock(p, "none", false), "");
});

Deno.test("l'injection assemble les trois d'un coup, ou rien", () => {
  // Un bloc qui dit « 4 verres » à côté d'une liste de nombres vide EST le
  // rejet silencieux de R10. Un seul point d'assemblage l'interdit.
  assertEquals(practiceInjectionFor({ practice: null, mode: "ask", isMinor: false }), null);
  assertEquals(
    practiceInjectionFor({ practice: practice(), mode: "none", isMinor: false }),
    null,
  );
  const injection = practiceInjectionFor({
    practice: practice(),
    mode: "ask",
    isMinor: false,
  });
  assertEquals(injection!.mode, "ask");
  assertEquals(injection!.numbers, [4]);
  assert(injection!.block.includes("4 glasses"));
});

// ---------------------------------------------------------------------------
// FF-029 — LE BUDGET DE DEMANDE (T4) ET L'IDENTITÉ D'UNE PRATIQUE
// ---------------------------------------------------------------------------

Deno.test("T4: la demande du jour déjà partie ⇒ RAPPEL, jamais une question", () => {
  // Le défaut fermé: une question de précision à midi (FF-017) PUIS une question
  // de pratique à 20h30 font deux demandes dans la journée, obtenues en
  // respectant deux fois une règle qui en interdit une.
  assertEquals(
    decidePracticeMode({
      pulseAsks: false,
      restrictionFlag: false,
      askBudgetSpent: true,
      practiceIgnored: false,
      practice: practice(),
    }),
    "remind",
  );
});

Deno.test("T4: le budget ne fait JAMAIS taire le rappel", () => {
  // Le budget compte des DEMANDES. Un rappel n'en est pas une: le soumettre au
  // plafond retirerait la voix du coach au motif qu'on a déjà pris ailleurs.
  const mode = decidePracticeMode({
    pulseAsks: false,
    restrictionFlag: false,
    askBudgetSpent: true,
    practiceIgnored: true,
    practice: practice({ askable: false }),
  });
  assertEquals(mode, "remind");
});

Deno.test("R7: une pratique décrochée cesse d'être une question, pas d'exister", () => {
  assertEquals(
    decidePracticeMode({
      pulseAsks: false,
      restrictionFlag: false,
      askBudgetSpent: false,
      practiceIgnored: true,
      practice: practice(),
    }),
    "remind",
  );
});

Deno.test("practiceKey est stable, insensible à la casse et aux accents", () => {
  assertEquals(
    practiceKey("Bois de l'eau régulièrement"),
    practiceKey("BOIS DE L'EAU REGULIEREMENT"),
  );
  // Reformuler EST une autre pratique: la lassitude mesurée portait sur la
  // phrase d'avant, et remettre le compteur à zéro est la bonne réponse.
  assert(practiceKey("Drink water") !== practiceKey("Drink more water"));
  assertThrows(() => practiceKey("   "));
});
