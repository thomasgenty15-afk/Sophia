// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-14 · BÊTA 1B ② — L'ÂGE INCONNU, ET LA CEINTURE QUI N'EXISTAIT PAS
//
// ⛔ LE POINT ③ DE LA CLÔTURE DU 2026-09-14 DISAIT: « `goalApplies` n'a AUCUN
// appelant dans le handler, alors que deux commentaires de production affirment
// le contraire. » Le plan de bêta demande de trancher: « corriger les
// commentaires s'ils sont seuls faux ; corriger le COMPORTEMENT si les
// objectifs interdits passent réellement ».
//
// ⛔ ILS PASSAIENT. Ces trois épreuves fixent les deux FAITS qui le rendaient
// possible — ni l'un ni l'autre n'est un bug en soi, c'est leur rencontre qui
// l'était — et la troisième épingle la ceinture posée le 2026-09-14.
// ══════════════════════════════════════════════════════════════════════════

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  envelopeFingerprint,
  envelopeFor,
  MAINTENANCE_ENVELOPE_DIRECTION,
} from "./meal_envelope.ts";
import type { MealBodyContext } from "./meal_body.ts";
import { mouthEnvelope } from "./household_composition.ts";
import { goalApplies } from "./household.ts";

const CORPS: MealBodyContext = {
  heightCm: 175,
  ageBand: "30_44",
  gender: "male",
  latestWeight: { weekStart: "2026-08-03", value: 80 },
  latestWaist: null,
  declaredWeightKg: null,
  restrictionFlag: false,
};

Deno.test("BÊTA 1B ② — FAIT ① : sans bande d'âge, `envelopeFor` applique quand même l'objectif", () => {
  // ⛔ `ageBand: null` NE REFERME RIEN. La seule branche courte d'`envelopeFor`
  // est `restrictionFlag || !body || !weightKg`. Une bouche d'âge inconnu qui a
  // un compte, un poids et `fat_loss` reçoit donc une bande DIRIGÉE.
  const sansAge = envelopeFor(
    "fat_loss", CORPS, null, false, null, null,
    { day: null, sport: null, asked: false }, null, null,
    MAINTENANCE_ENVELOPE_DIRECTION, null,
  );
  const entretien = envelopeFor(
    "maintenance", CORPS, null, false, null, null,
    { day: null, sport: null, asked: false }, null, null,
    MAINTENANCE_ENVELOPE_DIRECTION, null,
  );
  // ⚠️ CE TEST NE DIT PAS QUE C'EST UN BUG: `envelopeFor` fait ce qu'on lui
  // demande, et c'est juste. Il dit que la porte d'âge n'est PAS ici, donc
  // qu'elle doit être ailleurs — et c'est ce que le fait ② complète.
  assert(
    envelopeFingerprint(sansAge) !== envelopeFingerprint(entretien),
    "l'objectif n'a plus aucun effet sans bande d'âge: le fait ① a changé",
  );
});

Deno.test("BÊTA 1B ② — FAIT ② : `mouthEnvelope` rend l'enveloppe de compte AVANT sa porte d'âge", () => {
  // ⛔ SON PREMIER `return` EST `accountEnvelope !== null`. Sa porte d'âge
  // (« ni adulte ni enfant ⇒ null ») ne protège donc QUE les bouches sans
  // compte. Les deux faits réunis: une bouche AVEC compte et SANS date de
  // naissance recevait une bande dirigée vers un déficit.
  const compte = envelopeFor(
    "fat_loss", CORPS, null, false, null, null,
    { day: null, sport: null, asked: false }, null, null,
    MAINTENANCE_ENVELOPE_DIRECTION, null,
  );
  assertEquals(
    mouthEnvelope({
      ageState: "unknown",
      accountEnvelope: compte,
      lineBody: null,
      lineProteinGoal: null,
    }),
    compte,
  );
  // ⚠️ ET LE CAS QUI PASSE: sans compte, sa porte d'âge tient.
  assertEquals(
    mouthEnvelope({
      ageState: "unknown",
      accountEnvelope: null,
      lineBody: null,
      lineProteinGoal: null,
    }),
    null,
  );
});

Deno.test("BÊTA 1B ② — LA CEINTURE: `goalApplies` ferme l'âge inconnu et laisse passer le mineur", () => {
  // ⛔ C'EST LA SEULE POPULATION QUE LE CORRECTIF DU HANDLER CHANGE. Ce test
  // dit précisément ce que le geste coûte: rien pour un adulte, rien pour un
  // mineur (dont la protection vit ailleurs — `childEnvelopeFromBody`
  // n'accepte aucun jeton d'objectif), et tout pour l'âge inconnu.
  assertEquals(goalApplies({ ageState: "unknown", goal: "fat_loss" }), false);
  assertEquals(goalApplies({ ageState: "adult", goal: "fat_loss" }), true);
  assertEquals(goalApplies({ ageState: "minor", goal: "fat_loss" }), true);
});

Deno.test("BÊTA 1B ② — CÂBLAGE: le handler passe l'objectif par `goalApplies`", async () => {
  // ⛔ UN TEST DE SOURCE, PARCE QUE LE SITE VIT DANS UN `map` AU MILIEU DE
  // 19 000 LIGNES et qu'aucun appel ne peut l'atteindre sans base ni modèle.
  // Il ne prouve pas que le plan est juste; il prouve que la porte est posée.
  const src = await Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  assert(
    src.includes("const gatedGoal = !goalApplies(m) || m.goal === null"),
    "l'objectif du foyer ne passe plus par la porte d'âge",
  );
  // ⚠️ ET LE MENSONGE N'EST PLUS AFFIRMÉ NULLE PART. Il subsiste une fois,
  // CITÉ, dans le pavé qui le corrige — et c'est voulu: retirer la phrase sans
  // dire qu'elle était fausse ferait réécrire la même erreur dans six mois.
  // Ce qu'on interdit, c'est qu'elle soit encore ÉNONCÉE.
  const affirmations = src
    .split("\n")
    .filter((l) => l.includes("`goalApplies` a déjà mis `goal` à `null`"))
    .filter((l) => !l.includes("affirmaient"));
  assertEquals(
    affirmations,
    [],
    "un commentaire affirme encore une garde qui n'a jamais existé",
  );
});
