/**
 * ══════════════════════════════════════════════════════════════════════════
 * UNE BOUCHE SANS COMPTE A UN CORPS, DONC UNE ENVELOPPE — 2026-09-13
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QUE CES ÉPREUVES TIENNENT, MESURÉ ──────────────────────────
 * `household_bodies.ts` construit un `MealBodyContext` pour une bouche SANS
 * compte, depuis sa FICHE, et y pose délibérément `latestWeight: null` — « une
 * fiche n'est pas une série ». Le poids part par `declaredWeightKg`.
 * `envelopeFor` ne lit que `latestWeight`: il rendait donc TOUJOURS l'enveloppe
 * dégradée pour cette population. Et comme une enveloppe dégradée n'est pas
 * `null`, elle gagne dans `mouthEnvelope` — qui n'atteignait jamais
 * `maintenanceEnvelopeFromBody`, la fonction écrite exactement pour ces
 * bouches-là.
 *
 * Tir réel N=2 du 2026-09-13 (`gain-lot3r2-2026-09-13T17-02-19-343Z`): Lea,
 * 164 cm / 58 kg / femme / 32 ans, objectif `fat_loss` posé sur sa fiche.
 * `protein_brief` → `silent: {protected: 1}`; garde finale →
 * `protein_protected: 2`. **Aucun plancher protéique nulle part**, 50 g/jour
 * servis, et aucun refus. 93 g/jour étaient calculables.
 *
 * ── CE QUE CHAQUE ÉPREUVE TIENT ──────────────────────────────────────────
 *   ① la branche dégradée de `envelopeFor` est INTACTE — plancher TCA, corps
 *      absent, et poids inconnu rendent toujours la même enveloppe;
 *   ② un titulaire avec une VRAIE série de pesées ne voit rien changer;
 *   ③ une bouche sans compte reçoit l'ÉNERGIE d'une maintenance, et — depuis
 *      le 2026-09-23 — le plancher de protéines de SON objectif (1,6 g/kg en
 *      prise, 1,2 en perte comme en maintien); jamais la bande de déficit ni
 *      le plafond de densité de cet objectif;
 *   ④ une enveloppe de compte, même dégradée, gagne toujours: le plancher TCA
 *      ne se contourne pas par la porte de service;
 *   ⑤ le câblage du handler: c'est l'ABSENCE DE COMPTE qui ouvre la porte, et
 *      le drapeau de restriction reste lu FAIL-CLOSED.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  type Envelope,
  envelopeFingerprint,
  envelopeFor,
  MAINTENANCE_ENVELOPE_DIRECTION,
  maintenanceEnvelopeFromBody,
  type MouthBody,
} from "./meal_envelope.ts";
import { mouthEnvelope } from "./household_composition.ts";
import type { MealBodyContext } from "./meal_body.ts";
import { sourceFamily } from "./source_family.ts";

const NO_AXES = { day: null, sport: null, asked: false } as const;

/** Le corps que `household_bodies.ts` rend pour une bouche SANS compte. */
function ficheBody(over: Partial<MealBodyContext> = {}): MealBodyContext {
  return {
    heightCm: 164,
    // La fiche ne porte pas de date de naissance: aucune bande d'âge.
    ageBand: null,
    gender: "female",
    // ⛔ LE CŒUR DU DÉFAUT: aucune pesée datée, jamais.
    latestWeight: null,
    latestWaist: null,
    declaredWeightKg: 58,
    restrictionFlag: false,
    ...over,
  };
}

/** Le corps d'un titulaire, avec une vraie série. */
function accountBody(over: Partial<MealBodyContext> = {}): MealBodyContext {
  return {
    heightCm: 178,
    ageBand: "18_29",
    gender: "male",
    latestWeight: { weekStart: "2026-09-07", value: 62 },
    latestWaist: null,
    declaredWeightKg: null,
    restrictionFlag: false,
    ...over,
  };
}

/** La fiche de Lea, telle que `keel_household_bodies_for` la rend. */
function leaMouthBody(over: Partial<MouthBody> = {}): MouthBody {
  return {
    heightCm: 164,
    weightKg: 58,
    gender: "female",
    ageYears: 32,
    activityLevel: "sedentary",
    activityAxes: NO_AXES,
    appetite: "small",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// ① ET ② — CE QUI NE DOIT RIEN VOIR CHANGER
// ---------------------------------------------------------------------------

Deno.test("① la branche dégradée de `envelopeFor` est intacte: un corps de fiche y tombe toujours", () => {
  // ⛔ CETTE ÉPREUVE DIT « ON N'A PAS RÉPARÉ ICI ». Faire lire
  // `declaredWeightKg` à `envelopeFor` aurait fait exécuter à une fiche
  // l'objectif écrit dessus — 2,0 g/kg et une bande de déficit sans plancher
  // TCA derrière. La réparation est ailleurs: c'est l'appelant qui cesse de
  // prétendre qu'une fiche est un compte.
  const fromSheet = envelopeFor(
    "fat_loss", ficheBody(), null, false, null, null, NO_AXES, null, null,
    MAINTENANCE_ENVELOPE_DIRECTION, null,
  );
  assertEquals(fromSheet.mode, "per_portion");
  // Et elle reste INDISCERNABLE des deux autres causes.
  const flagged = envelopeFor(
    "fat_loss", accountBody({ restrictionFlag: true }), "18_29", true, null, null,
    NO_AXES, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null,
  );
  const noBody = envelopeFor(
    "fat_loss", null, null, false, null, null, NO_AXES, null, null,
    MAINTENANCE_ENVELOPE_DIRECTION, null,
  );
  assertEquals(envelopeFingerprint(fromSheet), envelopeFingerprint(flagged));
  assertEquals(envelopeFingerprint(fromSheet), envelopeFingerprint(noBody));
});

Deno.test("② un titulaire avec une vraie série garde EXACTEMENT son enveloppe", () => {
  const env = envelopeFor(
    "muscle_gain", accountBody(), "18_29", false, null, null, NO_AXES, null, null,
    MAINTENANCE_ENVELOPE_DIRECTION, null,
  );
  assertEquals(env.mode, "per_kg");
  // 1,6 g/kg × 62 kg = 99,2 ⇒ 99. Le nombre est écrit à la main: le recalculer
  // avec la constante testée rendrait l'épreuve vraie quelle que soit la règle.
  assert(env.mode === "per_kg");
  assertEquals(env.proteinFloorG, 99);
  // ⛔ ET IL PASSE PAR `mouthEnvelope` SANS ÊTRE TOUCHÉ: l'enveloppe de compte
  // gagne toujours, c'est la règle de ce module et elle ne bouge pas.
  assertEquals(
    envelopeFingerprint(
      mouthEnvelope({
        ageState: "adult",
        accountEnvelope: env,
        lineBody: leaMouthBody(),
        // Un objectif de fiche DIFFÉRENT de celui du compte: la fiche et son
        // objectif ne sont pas lus quand un compte a parlé — 99 g (le compte),
        // jamais 70 (la fiche de Lea en maintien).
        lineProteinGoal: "maintenance",
      })!,
    ),
    envelopeFingerprint(env),
  );
});

// ---------------------------------------------------------------------------
// ③ — CE QUE LA RÉPARATION DONNE
// ---------------------------------------------------------------------------

Deno.test("③ une bouche sans compte reçoit la MAINTENANCE de sa fiche, et le plancher de SA perte: 70 g", () => {
  const env = mouthEnvelope({
    ageState: "adult",
    // ⛔ C'EST TOUT LE LOT: le handler passe `null` ici pour une bouche sans
    // compte, au lieu d'une enveloppe dégradée fabriquée par `envelopeFor`.
    accountEnvelope: null,
    lineBody: leaMouthBody(),
    // ⟳ 2026-09-23 — l'objectif de Lea, tel que l'intégrateur le passe.
    lineProteinGoal: "fat_loss",
  });
  assert(env !== null, "une fiche adulte lisible doit rendre une enveloppe");
  assertEquals(env.mode, "per_kg");
  assert(env.mode === "per_kg");
  // ⟳ 2026-09-20 — 1,2 g/kg × 58 kg = 69,6 ⇒ 70 (c'était 1,6 ⇒ 93).
  // ⟳ 2026-09-23 — `fat_loss` est désormais LU pour la protéine, et il vaut
  // 1,2 (décision du propriétaire, 1,4 avant): toujours 70. À 1,4 ce serait
  // 81 — c'est le nombre que la mutation de la constante fait apparaître.
  assertEquals(env.proteinFloorG, 70);
  // ⛔ L'ÉNERGIE, ELLE, RESTE CELLE D'UNE MAINTENANCE: le plafond de densité
  // d'une perte (1,3) n'est pas posé sur une fiche.
  assertEquals(env.densityCeiling, 1.8);
  // ⚠️ ET AUCUNE RÉPARTITION PAR REPAS: `maintenance` n'est pas dans les trois
  // cas de `PROTEIN_PER_MEAL_CASES`. Un nombre ici serait un cadran décoratif.
  assertEquals(env.proteinPerMealG, null);
});

// ── ⟳ 2026-09-23 · LA PROTÉINE SUIT L'OBJECTIF DE LA BOUCHE, L'ÉNERGIE NON ──
//
// Le défaut mesuré par l'audit du jour (C9): une bouche sans compte en perte
// avait « son énergie qui suit la perte, ses protéines qui suivent le
// maintien », parce que `maintenanceEnvelopeFromBody` écrivait `maintenance`
// pour les deux. Un plancher de protéines ne restreint rien: il peut suivre
// l'objectif de la personne sans qu'aucun plancher TCA ne soit nécessaire
// derrière lui. L'énergie, elle, reste une maintenance.

/** Une fiche d'adulte de 72 kg, 180 cm (IMC 22,2: aucun plafond de référence). */
function gainerSheet(): MouthBody {
  return {
    heightCm: 180,
    weightKg: 72,
    gender: "male",
    ageYears: 30,
    activityLevel: null,
    activityAxes: NO_AXES,
    appetite: null,
  };
}

Deno.test("③ quater — sans compte, en PRISE: 115 g (1,6 × 72), la bande d'une maintenance", () => {
  const gain = mouthEnvelope({
    ageState: "adult",
    accountEnvelope: null,
    lineBody: gainerSheet(),
    lineProteinGoal: "muscle_gain",
  });
  const maintain = mouthEnvelope({
    ageState: "adult",
    accountEnvelope: null,
    lineBody: gainerSheet(),
    lineProteinGoal: "maintenance",
  });
  assert(gain !== null && gain.mode === "per_kg");
  assert(maintain !== null && maintain.mode === "per_kg");
  // LE CAS QUI MORD: 1,6 × 72 = 115,2 ⇒ 115, et la part par repas d'une prise
  // (115 / 3 = 38,3 ⇒ 38). Avant ce lot: 1,2 × 72 = 86, sans part par repas.
  assertEquals(gain.proteinFloorG, 115);
  assertEquals(gain.proteinPerMealG, 38);
  // LE CAS QUI PASSE: la même fiche en maintien garde 86 et aucune part.
  assertEquals(maintain.proteinFloorG, 86);
  assertEquals(maintain.proteinPerMealG, null);
  // ⛔ L'ÉNERGIE EST IDENTIQUE, AU KCAL PRÈS: ni surplus de prise, ni bord de
  // bande de séances d'une prise, ni autre plafond de densité.
  //   BMR = 10×72 + 6,25×180 − 5×30 + 5 = 1 700 ; ×1,5 (activité inconnue)
  //   = 2 550 ; largeur `maintenance` 0,10 ⇒ ±127,5 ⇒ [2 423 ; 2 678].
  assertEquals(gain.energy, { low: 2423, high: 2678 });
  assertEquals(maintain.energy, { low: 2423, high: 2678 });
  assertEquals(gain.densityCeiling, maintain.densityCeiling);
});

Deno.test("③ quinquies — sans compte, en PERTE: 108 g (1,2 × 89,8), plafonné à l'IMC 30", () => {
  // Le corps de l'audit (C9): 93 kg, 173 cm. Poids de référence = 30 × 1,73²
  // = 89,787 kg ⇒ 1,2 × 89,787 = 107,7 ⇒ **108**. À 1,4 (avant ce jour) ce
  // serait 126 — le nombre que l'audit a trouvé écrit et jamais appliqué.
  const env = maintenanceEnvelopeFromBody({
    heightCm: 173,
    weightKg: 93,
    gender: "male",
    ageYears: 59,
    activityLevel: null,
    activityAxes: NO_AXES,
    appetite: null,
  }, "fat_loss");
  assert(env !== null && env.mode === "per_kg");
  assertEquals(env.proteinFloorG, 108);
  assertEquals(env.proteinPerMealG, null);
  // ⛔ ET PAS LE PLAFOND DE DENSITÉ D'UNE PERTE: c'est une pression vers moins
  // d'énergie, qu'une fiche sans série de pesées ne reçoit pas.
  assertEquals(env.densityCeiling, 1.8);
  // ⟳ 2026-09-23 — ET L'ÉNERGIE D'UNE MAINTENANCE, À SON ÂGE EXACT (59 ans):
  //   (10 × 93 + 6,25 × 173 − 5 × 59 + 5) × 1,5 = 2 581,875 ⇒ 2 582
  //   ⇒ round(2 582 × 0,95) – round(2 582 × 1,05) = 2 453 – 2 711
  // Au milieu de la bande (52 ans), c'était 2 634 ⇒ 2 502 – 2 766. Aucun
  // déficit: la perte n'atteint que la protéine.
  assertEquals(env.energy, { low: 2453, high: 2711 });
});

Deno.test("③ sexies — `null` (aucun objectif lisible) rend le plancher de la maintenance", () => {
  const none = maintenanceEnvelopeFromBody(gainerSheet(), null);
  const maintain = maintenanceEnvelopeFromBody(gainerSheet(), "maintenance");
  assert(none !== null && maintain !== null);
  assertEquals(envelopeFingerprint(none), envelopeFingerprint(maintain));
});

Deno.test("③ septies — un MINEUR ne lit pas l'objectif de sa fiche", () => {
  // `childEnvelopeFromBody` n'accepte aucun jeton: `muscle_gain` écrit sur la
  // fiche d'un enfant reste inerte, sur la protéine comme sur l'énergie.
  const child: MouthBody = {
    heightCm: 140,
    weightKg: 35,
    gender: "female",
    ageYears: 11,
    activityLevel: null,
    activityAxes: NO_AXES,
    appetite: null,
  };
  const gain = mouthEnvelope({
    ageState: "minor",
    accountEnvelope: null,
    lineBody: child,
    lineProteinGoal: "muscle_gain",
  });
  const none = mouthEnvelope({
    ageState: "minor",
    accountEnvelope: null,
    lineBody: child,
    lineProteinGoal: null,
  });
  assert(gain !== null && none !== null);
  assertEquals(envelopeFingerprint(gain), envelopeFingerprint(none));
});

Deno.test("③ bis — la même fiche par la porte directe rend le MÊME objet", () => {
  // Deux chemins vers la même enveloppe: si `mouthEnvelope` se mettait à
  // calculer autre chose que `maintenanceEnvelopeFromBody`, il y aurait deux
  // moteurs d'enveloppe — le défaut le plus cher de ce dépôt.
  const viaDoor = mouthEnvelope({
    ageState: "adult",
    accountEnvelope: null,
    lineBody: leaMouthBody(),
    lineProteinGoal: "muscle_gain",
  });
  const direct = maintenanceEnvelopeFromBody(leaMouthBody(), "muscle_gain");
  assert(viaDoor !== null && direct !== null);
  assertEquals(envelopeFingerprint(viaDoor), envelopeFingerprint(direct));
});

Deno.test("③ ter — une fiche SANS poids, ou d'âge inconnu, ne rend toujours rien", () => {
  // « Pas de pesée datée » n'est pas « pas de poids », et « pas de poids » reste
  // « pas d'enveloppe ». La direction sûre du domaine: part standard, jamais
  // réduite.
  assertEquals(
    maintenanceEnvelopeFromBody(leaMouthBody({ weightKg: null }), "muscle_gain"),
    null,
  );
  assertEquals(
    mouthEnvelope({
      ageState: "unknown",
      accountEnvelope: null,
      lineBody: leaMouthBody(),
      lineProteinGoal: "muscle_gain",
    }),
    null,
  );
  assertEquals(
    mouthEnvelope({
      ageState: "adult",
      accountEnvelope: null,
      lineBody: null,
      lineProteinGoal: "muscle_gain",
    }),
    null,
  );
});

// ---------------------------------------------------------------------------
// ④ — LA PORTE DE SERVICE RESTE FERMÉE
// ---------------------------------------------------------------------------

Deno.test("④ une enveloppe de compte DÉGRADÉE gagne toujours sur la fiche", () => {
  // ⛔ C'est la garde du plancher TCA. Un compte sous plancher rend `per_portion`;
  // retomber sur sa fiche derrière lui contournerait le plancher par la porte de
  // service — et c'est très exactement ce que ce lot NE fait pas, puisqu'il ne
  // touche qu'aux bouches SANS compte.
  const degraded: Envelope = envelopeFor(
    "fat_loss", accountBody({ restrictionFlag: true }), "18_29", true, null, null,
    NO_AXES, null, null, MAINTENANCE_ENVELOPE_DIRECTION, null,
  );
  const env = mouthEnvelope({
    ageState: "adult",
    accountEnvelope: degraded,
    lineBody: leaMouthBody(),
    // Même un objectif de fiche ne rouvre pas la porte: il n'est lu que sur la
    // branche de la fiche, que l'enveloppe de compte court-circuite.
    lineProteinGoal: "muscle_gain",
  });
  assertEquals(env?.mode, "per_portion");
});

// ---------------------------------------------------------------------------
// ⑤ — LE CÂBLAGE, DANS LE HANDLER
// ---------------------------------------------------------------------------

/**
 * ⚠️ UNE ÉPINGLE DE SOURCE, ET ELLE EST ASSUMÉE. La décision vit dans une
 * expression du handler (l'argument `accountEnvelope` de `toHouseholdMember`),
 * qui n'est pas appelable depuis un test: le handler ouvre un serveur à
 * l'import. Le patron est celui de `write_payload_wiring_test.ts`, déjà en
 * place dans ce dossier. Les trois moitiés sont épinglées séparément — sans
 * quoi retirer `!m.userId` laisserait l'épingle verte.
 */
async function handlerSource(): Promise<string> {
  const src = await sourceFamily(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  // ⛔ LES COMMENTAIRES SONT RETIRÉS: ce fichier EXPLIQUE la règle juste
  // au-dessus d'elle, et un `indexOf` naïf trouverait l'explication à la place
  // du code. Cicatrice « un audit d'appelants doit retirer les commentaires ».
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const GATE = "(!m.userId && m.body.restrictionFlag !== true)";

Deno.test("⑤ le handler ne fabrique AUCUNE enveloppe de compte pour une bouche sans compte", async () => {
  const src = await handlerSource();
  assertEquals(
    src.split(GATE).length - 1,
    1,
    `un seul \`${GATE}\` dans le handler du foyer`,
  );
});

Deno.test("⑤ bis — la porte est posée sur l'argument `accountEnvelope`, pas ailleurs", async () => {
  const src = await handlerSource();
  const gateAt = src.indexOf(GATE);
  const callAt = src.indexOf("toHouseholdMember(");
  const envAt = src.indexOf("envelopeFor(", gateAt);
  assert(gateAt > 0, "la porte existe");
  assert(callAt > 0 && callAt < gateAt, "elle est DANS l'appel à toHouseholdMember");
  assert(
    envAt > gateAt && envAt - gateAt < 200,
    "et juste devant l'appel à envelopeFor qu'elle court-circuite",
  );
});
