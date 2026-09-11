/**
 * LOT 8 · FAMILLE « CORPS/ÉNERGIE » — LES JOINTURES, PAS LES MORCEAUX.
 *
 * ── CE QUE CE FICHIER N'EST PAS ────────────────────────────────────────────
 * Ce n'est pas une seconde copie de `resolved_mouth_test.ts` ni de
 * `pace_unavailable_test.ts`. Les dix cas du tableau du chantier ont déjà,
 * pour la plupart, un banc: la pesée récente, la série vide, le champ absent,
 * l'âge inconnu et l'absence de taille y sont mordus, nommément.
 *
 * Ce qui n'avait AUCUN banc, c'est ce qui se passe APRÈS le résolveur. Un fait
 * de corps traverse quatre modules avant d'atteindre une assiette:
 *
 *     resolveMouth  →  estimatedMaintenanceFor  →  executedPaceFor
 *                   →  mouthTargetFactor (le facteur de boîte)
 *                   →  dayEnergyFor / envelopeFor (la bande et la densité)
 *                   →  householdBodyFacts (ce que le modèle LIT)
 *
 * Un cas qui s'arrête au premier module prouve que la protection existe; il ne
 * prouve pas qu'elle ARRIVE. Ce fichier prend chaque protection de la famille
 * et la suit jusqu'au bout — ou constate qu'elle n'y va pas, et l'épingle.
 *
 * ⚠️ LES NOMBRES SONT DÉRIVÉS À LA MAIN, jamais recopiés d'une sortie. Chaque
 * dérivation est écrite au-dessus du `Deno.test` qui l'utilise: un test qui
 * affirme « le code rend ce que le code rend » reste vert le jour où la formule
 * change de sens.
 *
 * PURE: aucun appel modèle, aucune lecture, aucune horloge (§10 du plan).
 */
import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";

import {
  type PersonalMouthFacts,
  resolveMouth,
} from "./resolved_mouth.ts";
import {
  type ActivityAxes,
  childEnvelopeFromBody,
  DENSITY_CEILING_DEFAULT,
  DENSITY_CEILING_FAT_LOSS,
  type Envelope,
  envelopeFingerprint,
  envelopeFor,
  maintenanceEnvelopeFromBody,
  type MouthBody,
} from "./meal_envelope.ts";
import {
  envelopeDirectionFor,
  estimatedMaintenanceFor,
  executedPaceFor,
  paceUnavailableReason,
  weeksToTarget,
} from "./weight_pace.ts";
import {
  mouthTargetFactor,
  restrictionFlagOf,
} from "./household_portions.ts";
import { goalUnderConditionGate } from "./condition_energy_gate.ts";
import { householdBodyFacts, type MealBodyContext } from "./meal_body.ts";

// ---------------------------------------------------------------------------
// LE DÉCOR — deux corps, et les nombres qu'ils produisent, dérivés à la main
// ---------------------------------------------------------------------------

const AXES_MUETS: ActivityAxes = { day: null, sport: null, asked: false };

/**
 * CLAIRE — femme · 68 kg · 165 cm · 31 ans (bande `30_44`) · `sedentary`.
 *
 * ⚠️ DÉRIVATION, ET C'EST ELLE QUI FAIT FOI DANS TOUT CE FICHIER:
 *
 *     base      = 10 × 68 + 6,25 × 165 − 5 × 37   = 1 526,25
 *     bmr       = base − 161 (offset femme)       = 1 365,25
 *     PAL       = ACTIVITY_FACTORS.sedentary      = 1,45
 *     entretien = round(1 365,25 × 1,45)          = 1 980 kcal/j
 *
 * `37` est le MILIEU de la bande `30_44` (`midAge`), pas son âge: le moteur ne
 * lit jamais une année exacte sur le chemin adulte.
 */
const CLAIRE: MouthBody = {
  heightCm: 165,
  weightKg: 68,
  gender: "female",
  ageYears: 31,
  activityLevel: "sedentary",
  activityAxes: AXES_MUETS,
  appetite: null,
};
const CLAIRE_ENTRETIEN = 1980;

/** Le corps de Claire, dans la forme que la consigne de composition lit. */
function claireContexte(over: Partial<MealBodyContext> = {}): MealBodyContext {
  return {
    heightCm: 165,
    ageBand: "30_44",
    gender: "female",
    latestWeight: { value: 68, weekStart: "2026-09-07" },
    declaredWeightKg: null,
    latestWaist: null,
    restrictionFlag: false,
    activityLevel: "sedentary",
    ...over,
  };
}

/**
 * L'ENVELOPPE DE CLAIRE, PAR LA VRAIE PORTE — `envelopeFor`, tous paramètres
 * requis passés, aucun raccourci.
 */
function enveloppeDeClaire(args: {
  goal: "fat_loss" | "maintenance" | "muscle_gain";
  restrictionFlag: boolean;
  paceKgPerWeek: number | null;
}): Envelope {
  return envelopeFor(
    args.goal,
    claireContexte({ restrictionFlag: args.restrictionFlag }),
    "30_44",
    args.restrictionFlag,
    null,
    "sedentary",
    AXES_MUETS,
    null,
    null,
    envelopeDirectionFor({
      goal: args.goal,
      // ⟳ 2026-09-11 — REQUIS depuis que la garde de condition vit DANS la
      // fonction. `false` = aucune condition n'annule l'écart, ce que ces
      // décors décrivent. Le cas qui MORD est éprouvé à part.
      deficitCancelled: false,
      subject: { body: CLAIRE, isMinor: false },
      paceKgPerWeek: args.paceKgPerWeek,
    }),
  );
}

/** Le facteur de boîte de Claire, par la seule porte de dimensionnement. */
function facteurDeClaire(args: {
  body: MouthBody;
  ageState: "adult" | "minor" | "unknown";
  isMinor: boolean;
  restrictionFlag: boolean;
  conditionRefs: readonly string[];
  paceKgPerWeek: number | null;
}) {
  return mouthTargetFactor({
    ageState: args.ageState,
    restrictionFlag: args.restrictionFlag,
    coachCounting: "no_position",
    direction: "down",
    paceKgPerWeek: args.paceKgPerWeek,
    subject: { body: args.body, isMinor: args.isMinor },
    conditionRefs: args.conditionRefs,
  });
}

/**
 * LE FACTEUR D'UNE PERTE DE 0,5 kg/SEMAINE SUR CLAIRE, DÉRIVÉ À LA MAIN:
 *
 *     voulu             = 0,5 × 7 700 / 7              = 550 kcal/j
 *     marge au plancher = 1 980 − 1 200 (femme)        = 780 kcal/j
 *     780 > 500 ⇒ A1 gagne                             ⇒ exécuté 500 kcal/j
 *     facteur           = (1 980 − 500) / 1 980        = 0,747474…
 */
const CLAIRE_FACTEUR_PERTE = (CLAIRE_ENTRETIEN - 500) / CLAIRE_ENTRETIEN;

function personnel(over: Partial<PersonalMouthFacts> = {}): PersonalMouthFacts {
  return {
    read: "ok",
    heightCm: 178,
    weightKg: 73,
    weightAsOf: "2026-09-07",
    gender: "male",
    ageYears: 34,
    activityLevel: "trains_hard",
    activityAxes: { day: "seated", sport: "5_plus", asked: true },
    ...over,
  };
}

function fiche(over: Partial<MouthBody> = {}): MouthBody {
  return {
    heightCm: 170,
    weightKg: 80,
    gender: "male",
    ageYears: 34,
    activityLevel: "sedentary",
    activityAxes: AXES_MUETS,
    appetite: "large",
    ...over,
  };
}

// ===========================================================================
// ① LECTURE ÉCHOUÉE — la provenance meurt au résolveur
// ===========================================================================

Deno.test("① LECTURE ÉCHOUÉE: le refus TRAVERSE — aucun chiffre périmé ne dimensionne", () => {
  // ⛔ LE DÉFAUT QUE CE CAS FERME EST UN DÉFAUT DE PROPAGATION. `resolveMouth`
  // rend bien `read_failed` (c'est son test à lui). Ce qui n'était vérifié nulle
  // part, c'est qu'AUCUN module en aval n'aille rechercher la fiche derrière son
  // dos: un repli plus bas dans la chaîne servirait les 80 kg de la fiche sous
  // les traits d'une pesée du jour, et le résolveur n'y pourrait rien.
  const tombee = resolveMouth({
    memberId: "m1",
    userId: "u1",
    personal: personnel({ read: "failed" }),
    sheet: fiche(),
  });

  // Le corps est vide, donc l'entretien n'existe pas — et pas parce qu'on l'a
  // refusé ici: parce qu'il n'y a pas de poids.
  assertEquals(estimatedMaintenanceFor({ body: tombee.body, isMinor: false }), null);
  // L'enveloppe de maintenance de la FICHE ne se construit pas davantage.
  assertEquals(maintenanceEnvelopeFromBody(tombee.body), null);
  // Et le grammage ne bouge pas d'un gramme.
  assertEquals(
    facteurDeClaire({
      body: tombee.body,
      ageState: "adult",
      isMinor: false,
      restrictionFlag: false,
      conditionRefs: [],
      paceKgPerWeek: 0.5,
    }),
    { factor: 1, reason: "no_body" },
  );
});

Deno.test("① bis — LE CAS QUI PASSE: la même panne LEVÉE, et la fiche reprend son rôle", () => {
  // ⚠️ SANS CE CAS, LA GARDE CI-DESSUS RESSEMBLERAIT À UNE GARDE QUI MARCHE
  // alors qu'elle pourrait simplement tout bloquer. Ici la lecture est `ok` et
  // la série est vide: la fiche sert, et elle sert JUSQU'À L'ENVELOPPE.
  const repli = resolveMouth({
    memberId: "m1",
    userId: "u1",
    personal: personnel({ read: "ok", weightKg: null, weightAsOf: null }),
    sheet: fiche(),
  });
  assertEquals(repli.body.weightKg, 80);
  const enveloppe = maintenanceEnvelopeFromBody(repli.body);
  assert(enveloppe !== null, "une fiche complète doit acheter une maintenance");
  assertEquals(enveloppe.mode, "per_kg");
});

Deno.test("⛔ DÉFAUT ÉPINGLÉ — « panne » et « bouche vide » sont INDISCERNABLES en aval", () => {
  // Le résolveur sait les distinguer: `read_failed` d'un côté, `absent` de
  // l'autre, et `mouthFactTally` les compte séparément. Le MOTEUR, lui, rend le
  // même couple pour les deux — et c'est ce couple-là qui part dans la ligne
  // écrite du plan (`box_sizing.mouths`).
  //
  // Conséquence: une panne de lecture qui durerait une semaine sur toute la base
  // se lirait, plan après plan, « ces bouches n'ont pas de corps ». Rien ne
  // ment; personne ne peut voir la panne non plus.
  const tombee = resolveMouth({
    memberId: "m1",
    userId: "u1",
    personal: personnel({ read: "failed" }),
    sheet: fiche(),
  });
  const jamaisRienSaisi = resolveMouth({
    memberId: "m2",
    userId: null,
    personal: null,
    sheet: null,
  });

  const commun = {
    ageState: "adult" as const,
    isMinor: false,
    restrictionFlag: false,
    conditionRefs: [] as readonly string[],
    paceKgPerWeek: 0.5,
  };
  assertEquals(
    facteurDeClaire({ ...commun, body: tombee.body }),
    facteurDeClaire({ ...commun, body: jamaisRienSaisi.body }),
  );
  // Et la seule chose qui les sépare reste côté résolveur, sur un champ que la
  // chaîne de dimensionnement ne reçoit jamais.
  assertNotEquals(tombee.from.weightKg, jamaisRienSaisi.from.weightKg);
  assertEquals(tombee.from.weightKg, "read_failed");
  assertEquals(jamaisRienSaisi.from.weightKg, "absent");
});

// ===========================================================================
// ② DATE CONTRADICTOIRE — l'arbitrage du résolveur, suivi jusqu'à l'équation
// ===========================================================================

/**
 * ⚠️ LES DEUX SOURCES D'ÂGE NE SONT PAS LA MÊME COLONNE, ET C'EST TOUT LE SUJET:
 *
 *   · `resolveMouth` arbitre `body.ageYears` — la date du COMPTE contre celle
 *     de la fiche —, et le plus JEUNE gagne.
 *   · `isMinor` descend de `keel_household_member_age(member_id)`, qui ne lit
 *     QUE `household_members.birth_date`, c'est-à-dire la FICHE.
 *
 * Quand les deux se contredisent, l'arbitrage protecteur du premier ne change
 * pas le verdict du second. Les deux tests qui suivent regardent ce que ça
 * donne, dans les DEUX sens.
 */

Deno.test("② COMPTE MINEUR / FICHE ADULTE: le déficit d'adulte N'ATTEINT PAS l'assiette", () => {
  // La date du compte dit 15 ans, la fiche dit 19. `ageState` vient de la fiche
  // ⇒ « adult » ⇒ `isMinor: false` ⇒ équation ADULTE.
  const arbitre = resolveMouth({
    memberId: "m1",
    userId: "u1",
    personal: personnel({ ageYears: 15 }),
    sheet: fiche({ ageYears: 19 }),
  });
  assertEquals(arbitre.body.ageYears, 15);
  assertEquals(arbitre.conflicts.includes("age_minor_conflict"), true);

  // ⛔ CE QUI PROTÈGE ICI EST UN REFUS, PAS UNE BRANCHE PÉDIATRIQUE.
  // `ageBandOf(15)` rend `null` — `AgeBand` ne porte que des bandes d'adultes —
  // donc l'équation adulte renonce, et tout ce qui en descend renonce avec elle.
  assertEquals(estimatedMaintenanceFor({ body: arbitre.body, isMinor: false }), null);
  assertEquals(
    facteurDeClaire({
      body: arbitre.body,
      ageState: "adult",
      isMinor: false,
      restrictionFlag: false,
      conditionRefs: [],
      paceKgPerWeek: 0.5,
    }),
    { factor: 1, reason: "no_body" },
  );

  // LE CONTREFACTUEL — ce que l'arbitrage a évité, mesuré sur le MÊME appel.
  // Sans lui, `ageYears` aurait valu 19 (la fiche), et le corps d'un garçon de
  // quinze ans aurait reçu le déficit plein d'un adulte.
  const sansArbitrage = facteurDeClaire({
    body: { ...arbitre.body, ageYears: 19 },
    ageState: "adult",
    isMinor: false,
    restrictionFlag: false,
    conditionRefs: [],
    paceKgPerWeek: 0.5,
  });
  assert(
    sansArbitrage.factor < 1,
    "le contrefactuel doit montrer un vrai déficit, sinon ce test ne prouve rien",
  );
  assertEquals(sansArbitrage.reason, "sized");
});

Deno.test("⛔ DÉFAUT ÉPINGLÉ — la protection d'âge sort sous le nom d'une PANNE DE CORPS", () => {
  // Le corps de cette bouche est COMPLET: 178 cm, 73 kg, un sexe, une activité.
  // Ce qui manque est une bande d'âge d'adulte, parce que le compte dit quinze
  // ans. Deux motifs le disent, et aucun des deux ne nomme l'âge:
  //
  //   · `mouthTargetFactor` rend `no_body` — « pas de corps exploitable »;
  //   · `paceUnavailableReason` rend `pace_unavailable_missing_body`, dont le
  //     seul cas documenté est la TAILLE absente (`pace_unavailable_test.ts`).
  //
  // Un lecteur de journal — et l'écran qui rendra ce motif — conclura « demande
  // son corps » à quelqu'un qui l'a donné en entier. Le vocabulaire des motifs
  // est fermé; il n'a pas de jeton pour « ses deux dates se contredisent ».
  const arbitre = resolveMouth({
    memberId: "m1",
    userId: "u1",
    personal: personnel({ ageYears: 15 }),
    sheet: fiche({ ageYears: 19 }),
  });
  assertEquals(arbitre.body.heightCm, 178);
  assertEquals(arbitre.body.weightKg, 73);
  assertEquals(
    paceUnavailableReason({ body: arbitre.body, isMinor: false }),
    "pace_unavailable_missing_body",
  );
});

/**
 * ③ L'AUTRE SENS — compte adulte, fiche mineure.
 *
 * `ageState` vient de la fiche ⇒ « minor » ⇒ `isMinor: true` ⇒ ÉQUATION
 * PÉDIATRIQUE, et elle tourne sur l'âge ARBITRÉ (15), pas sur celui du compte.
 *
 * ⚠️ DÉRIVATION À LA MAIN, sur le corps que `resolveMouth` rend (celui du
 * compte: 73 kg, sexe masculin, axes `seated × 5_plus`, appétit `large` de la
 * fiche):
 *
 *     Schofield 10-18 mâle = 17,686 × 73 + 658,2       = 1 949,278
 *     PAL croisé           = 1,45 + 0,05 × 5,5 = 1,725 → 1,73 (arrondi 2 déc.)
 *     enfant: max(1,60 ; 1,73)                          = 1,73
 *     appétit enfant: max(1 ; 1,10)                     = 1,10
 *     croissance                                        × 1,01
 *     entretien = round(1 949,278 × 1,73 × 1,10 × 1,01) = 3 747 kcal/j
 */
Deno.test("③ COMPTE ADULTE / FICHE MINEURE: c'est l'équation PÉDIATRIQUE qui tourne", () => {
  const arbitre = resolveMouth({
    memberId: "m1",
    userId: "u1",
    personal: personnel({ ageYears: 19 }),
    sheet: fiche({ ageYears: 15 }),
  });
  assertEquals(arbitre.body.ageYears, 15);

  // LES DEUX ÉQUATIONS SUR LE MÊME CORPS, ET ELLES NE SE RESSEMBLENT PAS: celle
  // de l'adulte renonce, celle de l'enfant rend un besoin.
  assertEquals(estimatedMaintenanceFor({ body: arbitre.body, isMinor: false }), null);
  assertEquals(estimatedMaintenanceFor({ body: arbitre.body, isMinor: true }), 3747);

  // Et la porte ② de la chaîne de sécurité ferme avant tout calcul de cran.
  assertEquals(
    mouthTargetFactor({
      ageState: "minor",
      restrictionFlag: false,
      coachCounting: "no_position",
      direction: "down",
      paceKgPerWeek: 0.5,
      subject: { body: arbitre.body, isMinor: true },
      conditionRefs: [],
    }),
    { factor: 1, reason: "minor" },
  );
});

// ===========================================================================
// ④ PROTECTIONS TCA — ce que le plancher RETIRE, mesuré sur les trois sorties
// ===========================================================================

Deno.test("④ PLANCHER TCA: la bande, la densité, le facteur et le prompt tombent ENSEMBLE", () => {
  // ⛔ CE QUE CE CAS AJOUTE AUX BANCS EXISTANTS. `meal_envelope_test.ts` prouve
  // l'indiscernabilité de l'enveloppe dégradée; `household_bodies_test.ts`
  // prouve qu'un plancher illisible ne produit aucun fait de prompt. Aucun des
  // deux ne prend LE MÊME CORPS et ne montre les QUATRE sorties bouger d'un
  // coup — c'est-à-dire ce que la personne reçoit réellement.

  // ── LE CAS QUI PASSE — plancher NON levé ────────────────────────────────
  const ouvert = enveloppeDeClaire({
    goal: "fat_loss",
    restrictionFlag: false,
    paceKgPerWeek: 0.5,
  });
  assertEquals(ouvert.mode, "per_kg");
  assert(ouvert.mode === "per_kg");
  // Bande dérivée à la main:
  //   cible        = 1 980 − 500                      = 1 480
  //   demi-largeur = 1 980 × (0,85 − 0,75) / 2        =    99
  //   brut 1 381 – 1 579, plancher max(1 480 ; 1 200) = 1 480
  assertEquals(ouvert.energy, { low: 1480, high: 1579 });
  assertEquals(ouvert.densityCeiling, DENSITY_CEILING_FAT_LOSS);
  assertEquals(
    householdBodyFacts(claireContexte({ restrictionFlag: false }), "adult"),
    [
      "height 165 cm",
      "age band 30 to 44",
      "gender female",
      "weight 68 kg, measured week of 2026-09-07",
    ],
  );
  assertEquals(
    facteurDeClaire({
      body: CLAIRE,
      ageState: "adult",
      isMinor: false,
      restrictionFlag: false,
      conditionRefs: [],
      paceKgPerWeek: 0.5,
    }),
    { factor: CLAIRE_FACTEUR_PERTE, reason: "sized" },
  );

  // ── LE CAS QUI MORD — le même corps, plancher levé ──────────────────────
  const ferme = enveloppeDeClaire({
    goal: "fat_loss",
    restrictionFlag: true,
    paceKgPerWeek: 0.5,
  });
  // ⚠️ ABSENTE, PAS NEUTRALISÉE. On lit les CLÉS de l'objet, pas ses valeurs:
  // une bande à `null` et une bande qui n'existe pas ne se réparent pas pareil,
  // et « rien ne compte à rebours » vaut pour la version sans compteur.
  assertEquals(Object.keys(ferme).sort(), ["mode", "proteinPortionPerMeal"]);
  assertEquals(ferme, { mode: "per_portion", proteinPortionPerMeal: true });
  // Rien n'atteint le modèle.
  assertEquals(
    householdBodyFacts(claireContexte({ restrictionFlag: true }), "adult"),
    [],
  );
  // Et l'assiette reste celle que le modèle a écrite.
  assertEquals(
    facteurDeClaire({
      body: CLAIRE,
      ageState: "adult",
      isMinor: false,
      restrictionFlag: true,
      conditionRefs: [],
      paceKgPerWeek: 0.5,
    }),
    { factor: 1, reason: "restriction_floor" },
  );
});

Deno.test("④ bis — le FAIL-CLOSED ferme, et « pas de compte » NE FERME PAS", () => {
  // ⚠️ LA MOITIÉ QU'ON OUBLIE. Un plancher fail-closed qui se fermerait aussi
  // sur une bouche sans compte retirerait le seul fait qu'on ait sur elle — le
  // corps de sa fiche — au nom d'un verdict qui n'a jamais existé pour elle.
  // Les deux états valent `true` / `false`, et les deux se voient sur l'assiette.
  const illisible = facteurDeClaire({
    body: CLAIRE,
    ageState: "adult",
    isMinor: false,
    restrictionFlag: restrictionFlagOf("unreadable"),
    conditionRefs: [],
    paceKgPerWeek: 0.5,
  });
  assertEquals(illisible, { factor: 1, reason: "restriction_floor" });

  const sansCompte = facteurDeClaire({
    body: CLAIRE,
    ageState: "adult",
    isMinor: false,
    restrictionFlag: restrictionFlagOf("no_account"),
    conditionRefs: [],
    paceKgPerWeek: 0.5,
  });
  assertEquals(sansCompte, { factor: CLAIRE_FACTEUR_PERTE, reason: "sized" });
});

// ===========================================================================
// ⑤ CONDITIONS ANNULANT L'ÉCART — jusqu'à la BANDE, pas seulement au facteur
// ===========================================================================

Deno.test("⑤ GROSSESSE: l'écart tombe à ZÉRO — la bande est celle de l'ENTRETIEN", () => {
  // ⛔ « LE BON CHIFFRE DE DÉFICIT EN GROSSESSE EST ZÉRO, PAS UN PLANCHER PLUS
  // HAUT. » Le banc du facteur le prouve déjà (`condition_energy_gate_portions_
  // test.ts`). La BANDE, elle, n'était vérifiée nulle part — et c'est elle que
  // le modèle reçoit pour composer.
  const gate = goalUnderConditionGate("fat_loss", "pregnancy");
  assertEquals(gate, { goal: "maintenance", cancelled: true });

  const gardee = enveloppeDeClaire({
    goal: gate.goal,
    restrictionFlag: false,
    paceKgPerWeek: 0.5,
  });
  assert(gardee.mode === "per_kg");
  // Bande dérivée à la main:
  //   cible        = 1 980 (aucune direction, donc aucun écart)
  //   demi-largeur = 1 980 × (1,05 − 0,95) / 2 = 99
  assertEquals(gardee.energy, { low: 1881, high: 2079 });
  // ⚠️ ET LE PLAFOND DE DENSITÉ REMONTE AVEC ELLE. On ne demande pas à une femme
  // enceinte de manger plus dense pour la même énergie.
  assertEquals(gardee.densityCeiling, DENSITY_CEILING_DEFAULT);

  // La même bouche sans la garde: le déficit plein, 400 kcal plus bas.
  const nue = enveloppeDeClaire({
    goal: "fat_loss",
    restrictionFlag: false,
    paceKgPerWeek: 0.5,
  });
  assert(nue.mode === "per_kg");
  assertEquals(nue.energy, { low: 1480, high: 1579 });
  assertNotEquals(envelopeFingerprint(gardee), envelopeFingerprint(nue));
});

Deno.test("⑤ bis — LE CAS QUI PASSE: un AUTRE condition_ref ne touche à RIEN", () => {
  // ⛔ LA COLONNE QUI PROUVE QUE LA GARDE NE MORD PAS TROP LARGE. Un diabétique
  // peut parfaitement viser une perte, et la lui retirer serait décider à sa
  // place. Sa bande doit sortir OCTET POUR OCTET comme celle de quelqu'un qui
  // n'a rien déclaré.
  const gate = goalUnderConditionGate("fat_loss", "other");
  assertEquals(gate, { goal: "fat_loss", cancelled: false });

  const avecDiabete = enveloppeDeClaire({
    goal: gate.goal,
    restrictionFlag: false,
    paceKgPerWeek: 0.5,
  });
  const sansRien = enveloppeDeClaire({
    goal: "fat_loss",
    restrictionFlag: false,
    paceKgPerWeek: 0.5,
  });
  assertEquals(envelopeFingerprint(avecDiabete), envelopeFingerprint(sansRien));
});

Deno.test("⛔ DÉFAUT ÉPINGLÉ — `envelopeDirectionFor` ne lit AUCUNE condition", () => {
  // La garde de grossesse n'est pas DANS la fonction qui produit l'écart: elle
  // est chez son appelant, qui doit penser à coercer l'objectif AVANT. Un seul
  // appelant le fait aujourd'hui (`generate-household-meal-v1`, via
  // `goalUnderConditionGate`); la fonction, elle, n'a même pas de paramètre où
  // ranger la question.
  //
  // Ce cas ne demande pas de réparer: il NOMME l'endroit où la prochaine lane
  // qui appellera cette fonction creusera un déficit chez une femme enceinte
  // sans qu'aucun compilateur ne la recense.
  const creuse = envelopeDirectionFor({
    goal: "fat_loss",
    // ⟳ 2026-09-11 — REQUIS depuis que la garde de condition vit DANS la
    // fonction. `false` = aucune condition n'annule l'écart, ce que ces
    // décors décrivent. Le cas qui MORD est éprouvé à part.
    deficitCancelled: false,
    subject: { body: CLAIRE, isMinor: false },
    paceKgPerWeek: 0.5,
  });
  assertEquals(creuse, {
    direction: "down",
    dailyDeltaKcal: 500,
    energyFloorKcal: 1200,
  });

  // Et l'objectif coercé est la SEULE chose qui change la sortie.
  const plate = envelopeDirectionFor({
    goal: goalUnderConditionGate("fat_loss", "pregnancy").goal,
    // ⟳ 2026-09-11 — REQUIS depuis que la garde de condition vit DANS la
    // fonction. `false` = aucune condition n'annule l'écart, ce que ces
    // décors décrivent. Le cas qui MORD est éprouvé à part.
    deficitCancelled: false,
    subject: { body: CLAIRE, isMinor: false },
    paceKgPerWeek: 0.5,
  });
  assertEquals(plate, {
    direction: null,
    dailyDeltaKcal: 0,
    energyFloorKcal: 1200,
  });
});

Deno.test("⛔ DÉFAUT ÉPINGLÉ — l'assiette refuse le déficit, le RYTHME le promet encore", () => {
  // ⛔ « UNE CONDITION MÉDICALE ANNULE LE DÉFICIT; LE RYTHME AFFICHÉ NE DOIT PAS
  // MENTIR. » La première moitié tient: la boîte sort à 1, motif `pregnancy`.
  // La seconde ne tient pas — et ce test montre les deux nombres côte à côte.
  const boite = facteurDeClaire({
    body: CLAIRE,
    ageState: "adult",
    isMinor: false,
    restrictionFlag: false,
    conditionRefs: ["pregnancy"],
    paceKgPerWeek: 0.5,
  });
  assertEquals(boite, { factor: 1, reason: "pregnancy" });

  // Le MÊME corps, le MÊME cran, la même seconde: `executedPaceFor` ne prend
  // aucun `condition_ref` et rend le déficit plein.
  const execute = executedPaceFor("down", { body: CLAIRE, isMinor: false }, 0.5);
  assert(execute !== null);
  assertEquals(execute.dailyDeltaKcal, 500);
  assertEquals(execute.clampedBy, "deficit_cap");

  // Et l'horizon qui en descend annonce une date. 68 → 60 kg à 0,5 kg/semaine:
  //   ceil(8 / 0,5) = 16 semaines.
  assertEquals(weeksToTarget(68, 60, 0.5), 16);
  //
  // ⚠️ OÙ ÇA SE VOIT, ET OÙ ÇA NE SE VOIT PAS:
  //   · `meal_energy_shared.ts` zéro-ise l'écart POUR SON ÉCRAN
  //     (`executedForReading`) — la fourchette quotidienne ne ment pas;
  //   · `frontend/src/keel/lib/arrivalHorizon.ts` ← `mouthForm.ts` ←
  //     `MouthFormDialog.tsx` ne lit AUCUN `condition_ref`: la fiche de bouche
  //     affiche « Environ 16 semaines à ce rythme » à une femme dont le moteur
  //     vient de refuser tout écart.
  // Rien n'est corrigé ici; le cas existe pour que la phrase soit vérifiable.
});

// ===========================================================================
// ⑥ MINEUR — trois portes, un seul corps
// ===========================================================================

/**
 * LISE — 12 ans · 40 kg · fille · rien de déclaré.
 *
 *     Schofield 10-18 femme = 13,384 × 40 + 692,6        = 1 227,96
 *     PAL enfant (personne n'a répondu)                   = 1,60
 *     appétit: personne n'a répondu ⇒ max(1 ; 1,00)       = 1,00
 *     croissance                                          × 1,01
 *     entretien = round(1 227,96 × 1,60 × 1,01)           = 1 984 kcal/j
 *     bande de maintenance = round(×0,95) – round(×1,05)  = 1 885 – 2 083
 *     plancher protéique = 40 × 1,0 g/kg                  =    40 g
 */
const LISE: MouthBody = {
  heightCm: 148,
  weightKg: 40,
  gender: "female",
  ageYears: 12,
  activityLevel: null,
  activityAxes: AXES_MUETS,
  appetite: null,
};

Deno.test("⑥ MINEUR: l'objectif s'applique, le RÉGIME ne s'ouvre pas — trois sorties", () => {
  // ⛔ CE QUE CE CAS AJOUTE. Chaque porte a déjà son banc séparément. Ce qui
  // n'était écrit nulle part, c'est qu'elles disent TOUTES LA MÊME CHOSE sur la
  // même bouche: un enfant reçoit un besoin, jamais une cible.
  assertEquals(estimatedMaintenanceFor({ body: LISE, isMinor: true }), 1984);

  const enfant = childEnvelopeFromBody(LISE);
  assert(enfant !== null);
  assert(enfant.mode === "per_kg");
  assertEquals(enfant.energy, { low: 1885, high: 2083 });
  assertEquals(enfant.proteinFloorG, 40);
  // ⚠️ NI PLAFOND DE DENSITÉ, NI RÉPARTITION PAR REPAS. Un plafond de densité
  // est une pression de minimisation; elle n'a rien à faire dans l'assiette d'un
  // enfant.
  assertEquals(enfant.densityCeiling, null);
  assertEquals(enfant.proteinPerMealG, null);

  // ② LE GRAMMAGE. La porte d'âge ferme avant que le cran ne devienne un écart.
  assertEquals(
    mouthTargetFactor({
      ageState: "minor",
      restrictionFlag: false,
      coachCounting: "no_position",
      direction: "down",
      paceKgPerWeek: 0.5,
      subject: { body: LISE, isMinor: true },
      conditionRefs: [],
    }),
    { factor: 1, reason: "minor" },
  );

  // ③ LE PROMPT. Aucun fait corporel ne part à côté du prénom d'un enfant.
  assertEquals(
    householdBodyFacts(
      {
        heightCm: 148,
        ageBand: null,
        gender: "female",
        latestWeight: { value: 40, weekStart: "2026-09-07" },
        declaredWeightKg: null,
        latestWaist: null,
        restrictionFlag: false,
        activityLevel: null,
      },
      "minor",
    ),
    [],
  );
});

Deno.test("⑥ bis — LA PORTE ADULTE NE PEUT PAS SERVIR UN ENFANT, même par erreur", () => {
  // ⚠️ LE CAS QUI PASSE DE L'AUTRE CÔTÉ. `maintenanceEnvelopeFromBody` est la
  // porte des bouches SANS COMPTE; si elle acceptait un enfant, elle lui
  // servirait Mifflin-St Jeor — c'est-à-dire une restriction sous le nom d'un
  // besoin. Elle renonce, parce que `ageBandOf(12)` est `null`.
  assertEquals(maintenanceEnvelopeFromBody(LISE), null);
  // Et sur un adulte, la même porte rend bien une enveloppe: la garde n'est pas
  // un mur qui bloque tout.
  const adulte = maintenanceEnvelopeFromBody(CLAIRE);
  assert(adulte !== null);
  assert(adulte.mode === "per_kg");
  assertEquals(adulte.energy, {
    // round(1 980 × 0,95) – round(1 980 × 1,05)
    low: 1881,
    high: 2079,
  });
});
