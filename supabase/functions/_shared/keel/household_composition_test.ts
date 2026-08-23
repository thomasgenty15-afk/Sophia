// FF-043 — LA RÉSOLUTION FOYER. Ce que ces tests protègent, dans l'ordre de ce
// qui coûte le plus cher quand ça casse:
//
//   * LE TRONC DIMENSIONNÉ SUR QUELQU'UN — une personne protégée par un
//     plancher qui mange la restriction d'un autre. C'est le défaut fatal que
//     deux designs candidats portaient;
//   * LE VERROU QUI DEVIENT UN SIGNAL — si un foyer sous verrou se distinguait
//     d'un foyer sans enveloppe, la table saurait que quelqu'un est protégé;
//   * L'OPINION QUI GOUVERNE L'ASSIETTE COMMUNE — les `discouraged` d'un coach
//     imposés à des élèves d'autres coachs;
//   * LE MESSAGE QUI NOMME QUELQU'UN — un refus qui transforme une contrainte
//     en accusation, et le fait à table.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  DELTA_CHANNELS,
  type HouseholdMember,
  householdLaneMode,
  memberDeltasPayload,
  mouthEnvelope,
  referenceMemberId,
  resolveHousehold,
  toHouseholdMember,
  TRUNK_UNSATISFIABLE,
  trunkSafety,
  trunkSizing,
  trunkUnsatisfiableMessage,
} from "./household_composition.ts";
import {
  DENSITY_CEILING_DEFAULT,
  type Envelope,
  envelopeFingerprint,
  estimatedChildMaintenanceKcal,
  estimatedMaintenanceKcal,
  type MouthBody,
  pediatricBandOf,
} from "./meal_envelope.ts";
import { ageBandOf } from "./student_age.ts";

const DEGRADED: Envelope = { mode: "per_portion", proteinPortionPerMeal: true };

function perKg(low: number, high: number): Envelope {
  return {
    mode: "per_kg",
    energy: { low, high },
    proteinFloorG: 160,
    proteinPerMealG: null,
    densityCeiling: 1.8,
  };
}

function member(over: Partial<HouseholdMember> & { memberId: string }): HouseholdMember {
  return {
    displayName: over.memberId,
    ageState: "adult",
    goal: "maintenance",
    envelope: null,
    ...over,
  };
}

function resolve(members: HouseholdMember[], over: Record<string, unknown> = {}) {
  return resolveHousehold({
    members,
    declaredReferenceMemberId: null,
    composerMemberId: null,
    daysCovered: 7,
    ...over,
  });
}

// ---------------------------------------------------------------------------
// 1. LE VERROU DE LANE — le premier pas, jamais un `if` de fin
// ---------------------------------------------------------------------------

Deno.test("UN SEUL membre dégradé fait passer TOUTE la lane en per_portion", () => {
  // Le tronc qu'une personne protégée mange ne peut pas être dimensionné sur
  // les enveloppes de déficit de ses co-membres.
  const members = [
    member({ memberId: "a", envelope: perKg(2000, 2300) }),
    member({ memberId: "b", envelope: perKg(1800, 2000) }),
    member({ memberId: "c", envelope: DEGRADED }),
  ];
  assertEquals(householdLaneMode(members), "per_portion");
  const r = resolve(members);
  assertEquals(r.mode, "per_portion");
  assertEquals(r.trunk.energy, null);
  assertEquals(r.deltas, []);
});

Deno.test("un foyer sous verrou est INDISCERNABLE d'un foyer sans enveloppe", () => {
  // Sinon le verrou devient un signal: « pourquoi notre foyer n'a plus de
  // portions ? » se demande au premier repas, et la réponse désigne quelqu'un.
  const locked = resolve([
    member({ memberId: "a", envelope: perKg(2000, 2300) }),
    member({ memberId: "b", envelope: DEGRADED }),
  ]);
  const noEnvelopes = resolve([
    member({ memberId: "a", envelope: null }),
    member({ memberId: "b", envelope: null }),
  ]);
  // ── LE MODE EN FAIT PARTIE, ET C'EST LE POINT ───────────────────────────
  // La première version rendait `per_kg` pour le foyer sans enveloppe et
  // `per_portion` pour le foyer protégé: l'enum lui-même disait « quelqu'un
  // ici est protégé ». Les deux doivent coïncider, mode compris.
  const shape = (r: ReturnType<typeof resolve>) =>
    JSON.stringify({ mode: r.mode, trunk: r.trunk.energy, deltas: r.deltas });
  assertEquals(shape(locked), shape(noEnvelopes));
});

Deno.test("le verrou se lit sur le MODE, jamais sur un drapeau séparé", () => {
  // `envelopeFor` a déjà mélangé les deux populations (plancher TCA et corps
  // inconnu) dans `per_portion`. Relire un flag ici recréerait la distinction
  // que l'enveloppe existe pour effacer.
  const flagged = [member({ memberId: "a", envelope: DEGRADED })];
  assertEquals(householdLaneMode(flagged), "per_portion");
  // …et le mode MÉLANGE: un foyer sans aucune enveloppe calculable rend la
  // même valeur, donc l'enum ne désigne personne.
  assertEquals(householdLaneMode([member({ memberId: "a", envelope: null })]), "per_portion");
  assertEquals(
    householdLaneMode([member({ memberId: "a", envelope: perKg(2000, 2300) })]),
    "per_kg",
  );
});

// ---------------------------------------------------------------------------
// 2. LE RÉFÉRENT
// ---------------------------------------------------------------------------

Deno.test("le référent DÉCLARÉ gagne, le compositeur est le défaut", () => {
  const members = [
    member({ memberId: "a" }),
    member({ memberId: "b" }),
  ];
  assertEquals(referenceMemberId(members, "b", "a"), "b");
  assertEquals(referenceMemberId(members, null, "a"), "a");
  assertEquals(referenceMemberId(members, null, null), null);
  // Un référent déclaré qui n'habite plus là retombe sur le compositeur.
  assertEquals(referenceMemberId(members, "ghost", "a"), "a");
});

Deno.test("un MINEUR n'est jamais référent, ni déclaré ni par défaut", () => {
  const members = [
    member({ memberId: "kid", ageState: "minor", goal: null }),
    member({ memberId: "dad" }),
  ];
  assertEquals(referenceMemberId(members, "kid", null), null);
  assertEquals(referenceMemberId(members, null, "kid"), null);
  assertEquals(referenceMemberId(members, "kid", "dad"), "dad");
});

Deno.test("une bouche d'âge INCONNU peut être référente", () => {
  // La garde porte sur le mineur, pas sur l'ignorance: refuser aussi
  // `unknown` laisserait sans référent un foyer où personne n'a de date, et le
  // défaut « le compositeur » ne servirait plus à rien.
  const members = [member({ memberId: "a", ageState: "unknown" })];
  assertEquals(referenceMemberId(members, null, "a"), "a");
});

// ---------------------------------------------------------------------------
// 3. LE TRONC — le MIN, jamais le référent
// ---------------------------------------------------------------------------

Deno.test("le tronc prend le MIN des enveloppes calculables", () => {
  const t = trunkSizing([
    member({ memberId: "a", envelope: perKg(2400, 2700) }),
    member({ memberId: "b", envelope: perKg(1800, 2000) }),
  ]);
  assertEquals(t.energy, { low: 1800, high: 2000 });
  assertEquals(t.mouthsCounted, 2);
});

Deno.test("une bouche SANS enveloppe compte STANDARD, jamais réduite", () => {
  // Ne pas savoir n'est pas une raison de servir moins.
  const withUnknown = trunkSizing([
    member({ memberId: "a", envelope: perKg(2400, 2700) }),
    member({ memberId: "b", envelope: null }),
  ]);
  assertEquals(withUnknown.energy, { low: 2400, high: 2700 });
  assertEquals(withUnknown.mouthsStandard, 1);
});

Deno.test("ZÉRO enveloppe calculable est le cas NOMINAL", () => {
  const t = trunkSizing([
    member({ memberId: "a", envelope: null }),
    member({ memberId: "b", envelope: null }),
  ]);
  assertEquals(t.energy, null);
  const r = resolve([member({ memberId: "a" }), member({ memberId: "b" })]);
  // Le MODE dit `per_portion` — non pas parce que quelqu'un est protégé, mais
  // parce que rien n'est dimensionnable. C'est le mélange voulu: le cas
  // nominal et le cas protégé se ressemblent, et c'est ce qui rend le second
  // illisible.
  assertEquals(r.mode, "per_portion");
  assertEquals(r.deltas, []);
});

// ⚠️ CE TEST EST L'INVERSE DE CELUI QU'IL REMPLACE, ET C'EST VOULU.
//
// Il s'appelait « un MINEUR ne pèse pas dans le tronc et ne reçoit aucun
// delta » et il gardait FF-043 §3 (« aucune enveloppe pour un mineur »). Cette
// règle a été RENVERSÉE le 2026-08-12 par décision humaine, après que la
// contrainte et sa raison ont été exposées:
//
//   « les deltas n'ont pas d'objectif donc ils ont juste un objectif normal de
//     manger selon leur poids, âge, taille c'est tout »
//
// Ce que l'ancienne version protégeait — aucune direction dérivée d'un
// objectif pour un enfant — est tenu AILLEURS et mieux: `childEnvelopeFromBody`
// n'accepte aucun jeton d'objectif. Ce qu'elle coûtait est ce test-ci.
Deno.test("un MINEUR pèse dans le tronc et reçoit un delta (renversement 2026-08-12)", () => {
  // LE FOYER DU SCÉNARIO, en clair: une mère en déficit, un enfant en
  // maintenance. Avant ce lot, l'enfant n'avait ni enveloppe ni delta — il
  // mangeait le tronc, c'est-à-dire LE DÉFICIT DE SA MÈRE, sans rien en plus.
  const r = resolve([
    member({ memberId: "mother", goal: "fat_loss", envelope: perKg(1352, 1532) }),
    member({ memberId: "kid", ageState: "minor", goal: null, envelope: perKg(1655, 1829) }),
  ]);
  // Le tronc reste le MIN — ici la mère, dont le besoin est le plus bas.
  assertEquals(r.trunk.energy, { low: 1352, high: 1532 });
  assertEquals(r.trunk.mouthsCounted, 2, "l'enfant PÈSE désormais dans le MIN");
  // ET L'ENFANT REÇOIT DE QUOI COMBLER L'ÉCART. C'est la réparation du lot.
  const kidDeltas = r.deltas.filter((d) => d.memberId === "kid");
  assert(kidDeltas.length > 0, "l'enfant mange encore le déficit de sa mère");
  assert(
    kidDeltas.every((d) => d.grams > 0),
    "un delta de zéro gramme est un delta qui n'existe pas",
  );
  // L'instrumentation d'A3 le suit lui aussi, sinon l'écart résiduel d'un
  // enfant serait invisible au moment de décider du slot de dressage.
  assert(r.residualGaps.some((g) => g.memberId === "kid"));
  // ET LE SERVICE FAMILIAL RESTE LA RÈGLE quand un mineur est à table: un
  // add-on dressé en cuisine devant un enfant est la divergence rendue lisible.
  assert(r.familyService);
  assert(kidDeltas.every((d) => d.moment === "plating"));
});

Deno.test("une bouche SANS enveloppe ne tire toujours pas le tronc vers le bas", () => {
  // Le pendant du test ci-dessus: ouvrir le MIN à toutes les bouches ne doit
  // pas faire compter une bouche dont on ne sait rien pour « zéro ».
  const r = resolve([
    member({ memberId: "mother", envelope: perKg(1800, 2000) }),
    member({ memberId: "kid", ageState: "minor", goal: null, envelope: null }),
  ]);
  assertEquals(r.trunk.energy, { low: 1800, high: 2000 });
  assertEquals(r.trunk.mouthsStandard, 1);
  assert(r.issues.includes("household_mouths_without_envelope:1"));
});

// ---------------------------------------------------------------------------
// 4. LA SÉCURITÉ DU TRONC
// ---------------------------------------------------------------------------

Deno.test("les INTERDITS s'unissent sur le tronc, les DÉCONSEILLÉS non", () => {
  // Des opinions d'un coach n'ont pas prise sur l'assiette commune d'élèves
  // d'autres coachs — elles gouvernent les add-ons de leur propre membre.
  const s = trunkSafety([
    { memberId: "a", forbidden: ["peanut"], discouraged: ["seed oil"] },
    { memberId: "b", forbidden: ["shellfish"], discouraged: ["dairy"] },
  ]);
  assertEquals(s.forbidden, ["peanut", "shellfish"]);
  assertEquals(s.discouragedByMember.get("a"), ["seed oil"]);
  assertEquals(s.discouragedByMember.get("b"), ["dairy"]);
  // Aucun `discouraged` n'a fui dans l'union du tronc.
  for (const d of ["seed oil", "dairy"]) assert(!s.forbidden.includes(d));
});

Deno.test("le refus nomme des ALIMENTS, jamais des gens", () => {
  const msg = trunkUnsatisfiableMessage(["peanut", "shellfish", "gluten"]);
  assertEquals(TRUNK_UNSATISFIABLE, "household_trunk_unsatisfiable");
  assert(msg.includes("peanut") && msg.includes("gluten"));
  // Un message qui nomme un membre transforme une contrainte en accusation.
  for (const forbidden of ["Marc", "Léa", "coach", "fat_loss", "goal", "member"]) {
    assert(!msg.toLowerCase().includes(forbidden.toLowerCase()), forbidden);
  }
});

// ---------------------------------------------------------------------------
// 5. LES DELTAS — A3, et l'instrumentation qui l'armera
// ---------------------------------------------------------------------------

Deno.test("A3: il n'y a QUE deux canaux, et pas de slot de dressage", () => {
  assertEquals([...DELTA_CHANNELS], ["more_of_the_same", "usual_side"]);
  assert(!(DELTA_CHANNELS as readonly string[]).includes("plating_slot"));
});

Deno.test("un adulte au-dessus du tronc reçoit un add-on, jamais un plat séparé", () => {
  const r = resolve([
    member({ memberId: "small", envelope: perKg(1800, 2000) }),
    member({ memberId: "big", envelope: perKg(2800, 3100) }),
  ]);
  assertEquals(r.trunk.energy, { low: 1800, high: 2000 });
  const forBig = r.deltas.filter((d) => d.memberId === "big");
  assert(forBig.length > 0, "l'écart de 1000 kcal doit produire un add-on");
  for (const d of forBig) {
    assert(d.grams > 0);
    assert((DELTA_CHANNELS as readonly string[]).includes(d.channel));
  }
  // Celui qui EST le tronc ne reçoit rien: on ajoute, on ne retire jamais.
  assertEquals(r.deltas.filter((d) => d.memberId === "small"), []);
});

Deno.test("l'écart RÉSIDUEL est instrumenté — c'est la condition d'armement d'A3", () => {
  // Sans lui, la décision d'ajouter le slot de dressage se prendrait à
  // l'aveugle. C'est la contrainte que l'arbitrage impose au code.
  const r = resolve([
    member({ memberId: "small", envelope: perKg(1800, 2000) }),
    member({ memberId: "big", envelope: perKg(2800, 3100) }),
  ]);
  const gap = r.residualGaps.find((g) => g.memberId === "big");
  assert(gap !== undefined, "chaque adulte doit avoir son écart mesuré");
  assert(gap!.gapKcalPerDay >= 0, "on n'ôte jamais: l'écart ne peut pas être négatif");
});

Deno.test("un écart minuscule ne produit AUCUN delta", () => {
  const r = resolve([
    member({ memberId: "a", envelope: perKg(2000, 2300) }),
    member({ memberId: "b", envelope: perKg(2050, 2350) }),
  ]);
  assertEquals(r.deltas, [], "50 kcal ne valent pas une ligne sur une assiette");
  assertEquals(r.residualGaps.find((g) => g.memberId === "b")?.gapKcalPerDay, 50);
});

Deno.test("un MINEUR à table fait passer les add-ons en SERVICE FAMILIAL", () => {
  // Satter: l'adulte décide quoi/quand/où, l'enfant décide combien. Un add-on
  // dressé en cuisine devant un enfant est la divergence rendue visible.
  const r = resolve([
    member({ memberId: "small", envelope: perKg(1800, 2000) }),
    member({ memberId: "big", envelope: perKg(2800, 3100) }),
    member({ memberId: "kid", ageState: "minor", goal: null }),
  ]);
  assert(r.familyService);
  for (const d of r.deltas) assertEquals(d.moment, "plating");
});

Deno.test("le payload d'un delta ne porte NI raison, NI objectif, NI corps", () => {
  const r = resolve([
    member({ memberId: "small", envelope: perKg(1800, 2000) }),
    member({ memberId: "big", envelope: perKg(2800, 3100) }),
  ]);
  const payload = memberDeltasPayload(r.deltas);
  assert(payload.length > 0);
  for (const row of payload) {
    assertEquals(
      Object.keys(row).sort(),
      ["channel", "food_ref", "grams", "member_id", "moment"],
    );
    const json = JSON.stringify(row).toLowerCase();
    for (const leak of ["goal", "reason", "deficit", "weight", "flag", "restriction"]) {
      assert(!json.includes(leak), `« ${leak} » dans ${json}`);
    }
  }
});

Deno.test("sous verrou de lane, AUCUN delta n'est dimensionné", () => {
  const r = resolve([
    member({ memberId: "small", envelope: perKg(1800, 2000) }),
    member({ memberId: "big", envelope: perKg(2800, 3100) }),
    member({ memberId: "protected", envelope: DEGRADED }),
  ]);
  assertEquals(r.deltas, []);
  assertEquals(r.residualGaps, []);
});

// ---------------------------------------------------------------------------
// 7. L'ENVELOPPE D'UNE BOUCHE — la seule porte, et ce qu'elle refuse
//
// C'est ici que se tient la décision humaine du 2026-08-12: chaque bouche a un
// corps, une bouche sans objectif mange NORMAL, et un objectif posé sur un
// enfant est INERTE — pas ignoré par une condition, inerte par construction.
// ---------------------------------------------------------------------------

const CHILD_8: MouthBody = {
  appetite: null,
  heightCm: 128,
  weightKg: 26,
  gender: "male",
  ageYears: 8,
  activityLevel: null,
  activityAxes: { day: null, sport: null, asked: false },
};

Deno.test("L'ENVELOPPE DU COMPTE GAGNE TOUJOURS, y compris DÉGRADÉE", () => {
  // LA GARDE LA PLUS CHÈRE DU LOT. Une enveloppe `per_portion` est la DÉCISION
  // du plancher TCA, pas une absence. Retomber sur le corps de la fiche
  // derrière elle contournerait le plancher par la porte de service — et le
  // symptôme serait une personne protégée à qui on dimensionne une assiette.
  const e = mouthEnvelope({
    ageState: "adult",
    accountEnvelope: DEGRADED,
    lineBody: { appetite: null, heightCm: 175, weightKg: 70, gender: "male", ageYears: 40, activityLevel: null , activityAxes: { day: null, sport: null, asked: false }},
  });
  assertEquals(e, DEGRADED);
});

Deno.test("un objectif posé sur un ENFANT est INERTE — l'enveloppe est la maintenance", () => {
  // Le maître écrit `fat_loss` sur la fiche de son enfant de huit ans. Le
  // moteur ne le lit pas: `childEnvelopeFromBody` n'a pas de paramètre
  // d'objectif, donc il n'existe aucun chemin par lequel ce jeton l'atteigne.
  const withGoal = toHouseholdMember(
    {
      memberId: "kid",
      displayName: "Lea",
      goal: "fat_loss",
      ageState: "minor",
      body: null,
      eatingSlots: null,
      habits: [],
      habitNote: null,
    },
    null,
    CHILD_8,
  );
  const withoutGoal = toHouseholdMember(
    {
      memberId: "kid",
      displayName: "Lea",
      goal: null,
      ageState: "minor",
      body: null,
      eatingSlots: null,
      habits: [],
      habitNote: null,
    },
    null,
    CHILD_8,
  );
  // ÉGALITÉ D'EMPREINTE, pas inspection champ par champ: un test qui vérifie
  // « la bande n'est pas celle de fat_loss » laisse passer un plafond de
  // densité ajouté six mois plus tard.
  assert(withGoal.envelope !== null);
  assert(withoutGoal.envelope !== null);
  assertEquals(
    envelopeFingerprint(withGoal.envelope),
    envelopeFingerprint(withoutGoal.envelope),
    "un objectif posé sur un enfant change son enveloppe",
  );
  // ET AUCUNE PRESSION DE MINIMISATION N'EST POSÉE SUR SON ASSIETTE.
  assert(withGoal.envelope.mode === "per_kg");
  assertEquals(withGoal.envelope.densityCeiling, null);
  assertEquals(withGoal.envelope.proteinPerMealG, null);
});

Deno.test("un ÂGE INCONNU n'a pas d'enveloppe, même avec un corps complet", () => {
  // Ni l'équation d'adulte ni l'équation d'enfant: elles donnent des résultats
  // très différents sur le même poids, et deviner serait choisir. `null` = part
  // standard, jamais réduite.
  assertEquals(
    mouthEnvelope({
      ageState: "unknown",
      accountEnvelope: null,
      lineBody: { appetite: null, heightCm: 150, weightKg: 45, gender: "female", ageYears: null, activityLevel: null , activityAxes: { day: null, sport: null, asked: false }},
    }),
    null,
  );
});

Deno.test("le corps de la FICHE n'achète qu'une MAINTENANCE, jamais un objectif", () => {
  // Un adulte SANS compte: pas de série de pesées, donc pas de plancher TCA
  // derrière lui. Son enveloppe ne peut donc ni creuser un déficit ni poser un
  // plafond de densité — la seule bande qu'un corps de fiche puisse acheter.
  const e = mouthEnvelope({
    ageState: "adult",
    accountEnvelope: null,
    lineBody: { appetite: null, heightCm: 162, weightKg: 55, gender: "female", ageYears: 38, activityLevel: null , activityAxes: { day: null, sport: null, asked: false }},
  });
  assert(e !== null && e.mode === "per_kg" && e.energy !== null);
  const maintenance = estimatedMaintenanceKcal({ appetite: null, activityLevel: null,
    activityAxes: { day: null, sport: null, asked: false },
    weightKg: 55,
    heightCm: 162,
    ageBand: "30_44",
    gender: "female",
  });
  assert(maintenance !== null);
  // La bande de maintenance encadre M; une bande de déficit serait SOUS M.
  assert(
    e.energy.low < maintenance && maintenance < e.energy.high,
    `la bande ${JSON.stringify(e.energy)} n'encadre pas la maintenance ${maintenance}`,
  );
  assertEquals(e.densityCeiling, DENSITY_CEILING_DEFAULT);
});

Deno.test("PAS DE CORPS = PAS D'ENVELOPPE, jamais l'enveloppe DÉGRADÉE", () => {
  // ⚠️ LA DIFFÉRENCE COÛTE TOUT LE FOYER. Rendre `per_portion` ici armerait le
  // VERROU DE LANE, et une case de formulaire vide ferait dégrader la
  // composition de tout le monde. `null` ne dégrade personne: la bouche compte
  // pour une part standard.
  assertEquals(
    mouthEnvelope({ ageState: "minor", accountEnvelope: null, lineBody: null }),
    null,
  );
  assertEquals(
    mouthEnvelope({
      ageState: "minor",
      accountEnvelope: null,
      lineBody: { ...CHILD_8, weightKg: null },
    }),
    null,
  );
  // Et la preuve que ça ne dégrade PAS la lane du foyer entier.
  const r = resolve([
    member({ memberId: "mother", envelope: perKg(1352, 1532) }),
    member({
      memberId: "kid",
      ageState: "minor",
      goal: null,
      envelope: mouthEnvelope({
        ageState: "minor",
        accountEnvelope: null,
        lineBody: null,
      }),
    }),
  ]);
  assertEquals(r.mode, "per_kg");
});

Deno.test("LA CONTRE-ÉPREUVE PÉDIATRIQUE — Schofield contre Mifflin-St Jeor", () => {
  // ⛔ LE CŒUR DU LOT. Mifflin-St Jeor est établie sur des ADULTES. Appliquée à
  // un enfant de huit ans, elle sous-estime lourdement son besoin: la servir
  // reviendrait à lui prescrire une restriction en croyant lui servir un besoin
  // normal — le préjudice exact que ce lot existe pour fermer, retourné.
  const pediatric = estimatedChildMaintenanceKcal({ appetite: null, activityLevel: null,
    activityAxes: { day: null, sport: null, asked: false },
    weightKg: CHILD_8.weightKg,
    ageYears: CHILD_8.ageYears,
    gender: CHILD_8.gender,
  });
  // Mifflin ne SAIT PAS parler d'un enfant: `ageBandOf(8)` rend `null`, donc
  // elle rend `null`. C'est la première moitié de la preuve — le chemin adulte
  // est FERMÉ à un mineur, il ne se contente pas d'être découragé.
  assertEquals(
    estimatedMaintenanceKcal({ appetite: null, activityLevel: null,
      activityAxes: { day: null, sport: null, asked: false },
      weightKg: CHILD_8.weightKg,
      heightCm: CHILD_8.heightCm,
      ageBand: ageBandOf(CHILD_8.ageYears),
      gender: CHILD_8.gender,
    }),
    null,
    "Mifflin rend une valeur pour un enfant de 8 ans",
  );
  // La seconde moitié: ce qu'elle rendrait SI on la forçait, en lui donnant la
  // bande d'adulte la plus jeune. C'est le chiffre qu'un lecteur pressé aurait
  // livré.
  const forcedMifflin = estimatedMaintenanceKcal({ appetite: null, activityLevel: null,
    activityAxes: { day: null, sport: null, asked: false },
    weightKg: CHILD_8.weightKg,
    heightCm: CHILD_8.heightCm,
    ageBand: "18_29",
    gender: CHILD_8.gender,
  });
  assert(pediatric !== null && forcedMifflin !== null);
  const shortfall = (pediatric - forcedMifflin) / pediatric;
  // ⚠️ L'ASSERTION EST UN SEUIL, PAS LA VALEUR MESURÉE. Un test écrit contre sa
  // propre constante reste vert quand on change la constante. Ce qu'on protège
  // est « les deux chemins ne sont PAS proches »: s'ils l'étaient, le chemin
  // pédiatrique serait probablement faux.
  assert(
    shortfall > 0.15,
    `Mifflin forcée (${forcedMifflin}) et Schofield (${pediatric}) ne diffèrent ` +
      `que de ${Math.round(shortfall * 100)} % — le chemin pédiatrique est suspect`,
  );
});

Deno.test("les tranches pédiatriques suivent le découpage FAO 0-3 / 3-10 / 10-18", () => {
  assertEquals(pediatricBandOf(0), "0_3");
  assertEquals(pediatricBandOf(2), "0_3");
  assertEquals(pediatricBandOf(3), "3_10");
  assertEquals(pediatricBandOf(9), "3_10");
  assertEquals(pediatricBandOf(10), "10_18");
  assertEquals(pediatricBandOf(17), "10_18");
  // 18 ans: ce n'est plus un enfant. La frontière est celle de `KEEL_MINOR_AGE`,
  // pas une seconde définition de la majorité posée à côté.
  assertEquals(pediatricBandOf(18), null);
  assertEquals(pediatricBandOf(null), null);
});

Deno.test("`other` prend la MOYENNE des deux jeux, jamais un repli sur `male`", () => {
  // Choisir serait assigner — et la décision porterait ici sur le corps d'un
  // enfant. Même arbitrage que Mifflin pour l'adulte.
  const male = estimatedChildMaintenanceKcal({ appetite: null, activityAxes: { day: null, sport: null, asked: false }, activityLevel: null, weightKg: 26, ageYears: 8, gender: "male" });
  const female = estimatedChildMaintenanceKcal({ appetite: null, activityAxes: { day: null, sport: null, asked: false }, activityLevel: null, weightKg: 26, ageYears: 8, gender: "female" });
  const other = estimatedChildMaintenanceKcal({ appetite: null, activityAxes: { day: null, sport: null, asked: false }, activityLevel: null, weightKg: 26, ageYears: 8, gender: "other" });
  const none = estimatedChildMaintenanceKcal({ appetite: null, activityAxes: { day: null, sport: null, asked: false }, activityLevel: null, weightKg: 26, ageYears: 8, gender: null });
  assert(male !== null && female !== null && other !== null && none !== null);
  assert(male !== female, "les coefficients par sexe sont identiques — banc inutile");
  assert(other > female && other < male, `other=${other} hors de [${female}, ${male}]`);
  assertEquals(other, none, "un sexe absent et `other` doivent produire la même chose");
});
