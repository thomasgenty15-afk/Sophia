// ═══════════════════════════════════════════════════════════════════════════
// L8 — LA CIBLE DIMENSIONNE LES GRAMMAGES. Le banc du renversement.
//
// Renversement du 2026-08-18 (`docs/keel/CALORIE_REVERSAL.md` §7): la cible
// entre dans le générateur, et elle n'y contraint QUE la quantité pesée.
//
// CE QUE CE BANC PROTÈGE, DANS L'ORDRE DE CE QUE ÇA COÛTE QUAND ÇA CASSE:
//
//   * LA PORTE ② EST ÉVALUÉE **PAR BOUCHE** (clause C8, réécrite par L4-B).
//     Sans elle, une cible dimensionne les grammages d'un enfant de douze ans
//     parce que son PARENT est adulte. C'est le trou mesuré, et c'est le test
//     le plus cher de ce fichier.
//   * UN CONSEIL CHIFFRÉ NE PART PAS SUR UN ÉTAT QU'ON N'A PAS VALIDÉ
//     (clause C9). `keel_household_set_member_away` ne consulte AUCUN âge, et
//     le vocabulaire de présence est ouvert côté personne.
//   * LA POPULATION SANS CIBLE REÇOIT LE PLAN D'HIER, À L'OCTET. C'est
//     aujourd'hui la population entière: si ce lot changeait quoi que ce soit
//     pour elle, il changerait tout pour tout le monde.
//   * UN FACTEUR NE FAIT PAS APPARAÎTRE DE LA NOURRITURE. La casserole est la
//     part FIXE (`scaling-factor-applies-only-to-the-mobile-part`).
//   * CHAQUE GARDE A SON CAS QUI PASSE. Une garde qui refuse tout bloque tout
//     et ressemble trait pour trait à une garde qui marche.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { fromFileUrl } from "https://deno.land/std@0.208.0/path/mod.ts";

import {
  BOX_FACTOR_MAX,
  BOX_FACTOR_MIN,
  BOX_SIZING_REASONS,
  type BoxSizingReason,
  eatingOutAdvice,
  EATING_OUT_ADVICE_REASONS,
  type EatingOutAdviceReason,
  eatingOutAdviceSentence,
  EATING_OUT_SLOT_LABELS,
  KNOWN_PRESENCE_STATES,
  MEAL_SIZE_WEIGHT,
  memberTargetFactor,
  mouthAgeVerdict,
  mouthTargetFactor,
  type PortionMember,
  type SizablePreparation,
  sizeBoxesFromTarget,
} from "./household_portions.ts";
import { ageStateFromVerdict, type MemberAgeState } from "./household.ts";
import { assessBirthDate } from "./student_age.ts";
import { PRESENCE_STATES } from "./household_presence.ts";
import {
  executedPaceFor,
  KCAL_PER_KG_BODY_MASS,
  MINOR_MAX_DAILY_DELTA_FRACTION,
} from "./weight_pace.ts";
import {
  MAX_DAILY_DEFICIT_KCAL,
  MAX_SURPLUS_FRACTION,
  type MouthBody,
} from "./meal_envelope.ts";
import { EATING_OCCASIONS, type EatingOccasion } from "./meal_generation.ts";

// ---------------------------------------------------------------------------
// LES CORPS — réels, pas des littéraux ronds
// ---------------------------------------------------------------------------

const ADULT_BODY: MouthBody = {
  heightCm: 180,
  weightKg: 80,
  gender: "male",
  ageYears: 35,
  activityLevel: null,
};

const SMALL_ADULT_BODY: MouthBody = {
  heightCm: 158,
  weightKg: 52,
  gender: "female",
  ageYears: 41,
  activityLevel: "sedentary",
};

const CHILD_BODY: MouthBody = {
  heightCm: 148,
  weightKg: 38,
  gender: "female",
  ageYears: 12,
  activityLevel: null,
};

const MOUTH = (over: Partial<PortionMember> = {}): PortionMember => ({
  memberId: "m-1",
  displayName: "Zoé",
  goal: "fat_loss",
  ageState: "adult",
  body: {
    heightCm: 180,
    ageBand: "30_44",
    gender: "male",
    latestWeight: null,
    latestWaist: null,
    restrictionFlag: false,
  },
  eatingSlots: null,
  habits: [],
  habitNote: null,
  ...over,
});

type SizingArgs = Parameters<typeof mouthTargetFactor>[0];

const SIZING_ARGS: SizingArgs = {
  ageState: "adult",
  restrictionFlag: false,
  coachCounting: "no_position",
  direction: "down",
  paceKgPerWeek: 0.5,
  subject: { body: ADULT_BODY, isMinor: false },
};

// ---------------------------------------------------------------------------
// LE PONT D'ÂGE — la propriété qui l'empêche de dériver
// ---------------------------------------------------------------------------

Deno.test("L8 — le pont d'âge fait un ALLER-RETOUR exact sur les trois états", () => {
  // ⚠️ C'EST LA SEULE PROPRIÉTÉ QUI COMPTE ICI. `mouthAgeVerdict` fabrique un
  // verdict à partir d'un état, donc il pourrait mentir; ce qu'on exige est que
  // `ageStateFromVerdict` — le jumeau TypeScript de `keel_age_state`, la règle
  // écrite une seule fois — retrouve exactement l'état de départ. Sans ça,
  // `unknown` pourrait dériver vers `adult`, c'est-à-dire vers la porte OUVERTE,
  // sans qu'aucun test ne bouge.
  for (const state of ["minor", "adult", "unknown"] as const) {
    assertEquals(ageStateFromVerdict(mouthAgeVerdict(state)), state, state);
  }
});

Deno.test("L8 — la date sentinelle du pont ne peut pas passer pour une naissance", () => {
  // Les champs autres que `status` sont des sentinelles. Si l'un d'eux venait à
  // être lu comme une donnée, il vaut mieux qu'il soit RECONNAISSABLE: la vraie
  // fonction de verdict le classe `implausible`, pas `adult`.
  const verdict = mouthAgeVerdict("adult");
  assert(verdict.status === "adult");
  // ⚠️ ON N'ÉPINGLE PAS LE STATUT EXACT — `unreadable` et `implausible` disent
  // tous les deux « ce n'est pas une naissance », et lequel des deux sort dépend
  // de l'analyseur de dates, pas de ce lot. Ce qui doit tenir est qu'aucun des
  // deux statuts DATÉS n'en sort: une sentinelle qui se lirait `adult` serait
  // une donnée, et le pont cesserait d'être un pont.
  const status = assessBirthDate(verdict.isoDate, "2026-08-18").status;
  assert(
    status !== "adult" && status !== "minor",
    `la sentinelle se lit « ${status} » — c'est une naissance plausible`,
  );
});

// ---------------------------------------------------------------------------
// ① LE FACTEUR — LE CAS QUI PASSE, PUIS LES SEPT REFUS
// ---------------------------------------------------------------------------

Deno.test("L8 ① — LE CAS QUI PASSE: une perte RÉTRÉCIT la boîte, une prise l'AGRANDIT", () => {
  // Sans cette ligne, une garde cassée qui refuse tout serait indiscernable
  // d'une garde qui marche.
  const down = mouthTargetFactor(SIZING_ARGS);
  assertEquals(down.reason, "sized");
  assert(down.factor < 1, `perte: facteur ${down.factor}`);

  const up = mouthTargetFactor({ ...SIZING_ARGS, direction: "up" });
  assertEquals(up.reason, "sized");
  assert(up.factor > 1, `prise: facteur ${up.factor}`);

  // ⚠️ ET LES DEUX SONT SYMÉTRIQUES AUTOUR DE 1 SEULEMENT SI LES BORNES LE
  // PERMETTENT: sur ce corps, A1 (500 kcal/j) creuse plus que la bande de prise
  // (+10 %). Le test l'AFFIRME plutôt que de supposer une symétrie qui n'existe
  // pas — c'est le fait, et c'est le fait qu'on veut voir bouger si les bandes
  // bougent.
  assert(1 - down.factor > up.factor - 1, "la perte doit creuser plus que la prise");
});

Deno.test("L8 ① — chaque porte de sécurité ferme le DIMENSIONNEMENT, avec son motif", () => {
  const cases: Array<[Partial<SizingArgs>, BoxSizingReason]> = [
    [{ restrictionFlag: true }, "restriction_floor"],
    [{ ageState: "minor", subject: { body: CHILD_BODY, isMinor: true } }, "minor"],
    [{ coachCounting: "no_counting" }, "doctrine_no_counting"],
    [{ ageState: "unknown" }, "age_unknown"],
    [{ direction: null }, "no_direction"],
    [{ paceKgPerWeek: null }, "no_pace"],
    [{ paceKgPerWeek: 0 }, "no_pace"],
    [{
      subject: { body: { ...ADULT_BODY, weightKg: null }, isMinor: false },
    }, "no_body"],
  ];
  for (const [over, reason] of cases) {
    const out = mouthTargetFactor({ ...SIZING_ARGS, ...over });
    assertEquals(out, { factor: 1, reason }, reason);
  }
});

Deno.test("⛔ L8 C8 — L'ENFANT DE DOUZE ANS N'EST PAS DIMENSIONNÉ PARCE QUE SON PARENT EST ADULTE", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE TEST LE PLUS CHER DE CE FICHIER. Clause C8, réécrite par L4-B après avoir
  // mesuré que la formulation d'origine était FAUSSE: il n'est pas vrai que « la
  // seule ceinture qui existe appartient au compte maître ». L'âge de CHAQUE
  // bouche est connu par `member_id` (`keel_household_member_age`), et ce qui ne
  // le lisait pas était la chaîne de portes.
  //
  // La mise en scène est donc un FOYER: un parent majeur, un enfant de douze
  // ans, tous les deux avec un objectif et un rythme réglé. Le parent est
  // dimensionné; l'enfant ne l'est pas, et le motif est `minor` — pas
  // `no_pace`, pas `no_body`, pas un `1` muet.
  // ══════════════════════════════════════════════════════════════════════════
  const parent = memberTargetFactor(
    MOUTH({ memberId: "parent", ageState: "adult", goal: "fat_loss" }),
    { coachCounting: "no_position", paceKgPerWeek: 0.5, body: ADULT_BODY },
  );
  const child = memberTargetFactor(
    MOUTH({
      memberId: "child",
      displayName: "Lou",
      ageState: "minor",
      goal: "fat_loss",
      // ⚠️ LE CORPS PORTE LE PLANCHER DU PARENT — c'est très exactement le
      // chemin par lequel la ceinture du maître se substituait à la sienne.
      body: { ...MOUTH().body!, restrictionFlag: false },
    }),
    { coachCounting: "no_position", paceKgPerWeek: 0.5, body: CHILD_BODY },
  );

  assertEquals(parent.reason, "sized");
  assert(parent.factor < 1);
  assertEquals(child, { factor: 1, reason: "minor" });
});

Deno.test("L8 ① — le PLANCHER gagne contre tout le reste, sur toutes les combinaisons", () => {
  // L'angle adversarial, rejoué sur la porte du grammage: il n'existe aucune
  // combinaison où le plancher est levé et où une boîte se redimensionne.
  for (const ageState of ["minor", "adult", "unknown"] as const) {
    for (const coachCounting of ["no_counting", "no_position"] as const) {
      for (const direction of ["down", "up"] as const) {
        assertEquals(
          mouthTargetFactor({
            ...SIZING_ARGS,
            restrictionFlag: true,
            ageState,
            coachCounting,
            direction,
          }),
          { factor: 1, reason: "restriction_floor" },
          `${ageState}/${coachCounting}/${direction}`,
        );
      }
    }
  }
});

Deno.test("L8 ① — chaque entrée est REQUISE: une entrée incomplète LÈVE", () => {
  // Prémisse fausse d'abord: l'entrée complète passe.
  assertEquals(mouthTargetFactor(SIZING_ARGS).reason, "sized");
  for (const key of Object.keys(SIZING_ARGS)) {
    const partial = { ...SIZING_ARGS } as Record<string, unknown>;
    delete partial[key];
    assertThrows(
      () => mouthTargetFactor(partial as unknown as SizingArgs),
      Error,
      key,
    );
    assertThrows(
      () =>
        mouthTargetFactor(
          { ...SIZING_ARGS, [key]: undefined } as unknown as SizingArgs,
        ),
      Error,
      key,
    );
  }
});

Deno.test("⛔ L8 ① — LES BORNES DE PLAUSIBILITÉ NE MORDENT SUR AUCUN CORPS RÉEL", () => {
  // ⚠️ CE TEST DIT L'INVERSE DE CE QU'IL EN A L'AIR, ET C'EST VOULU.
  // `BOX_FACTOR_MIN/MAX` sont une ceinture, pas la borne opérante: ce qui borne
  // réellement un facteur est `executedPaceFor` (A1 à 500 kcal/j, la bande de
  // prise à +10 %, la fraction d'un mineur à 10 %). On BALAIE donc des corps
  // réels pour prouver que `implausible_factor` ne sort jamais — sans quoi la
  // ceinture serait la vraie règle, et personne ne le saurait.
  let sized = 0;
  for (const weightKg of [30, 45, 60, 80, 110, 150]) {
    for (const heightCm of [140, 160, 175, 195]) {
      for (const gender of ["male", "female", "other", null] as const) {
        for (const isMinor of [false, true]) {
          for (const direction of ["down", "up"] as const) {
            for (const pace of [0.05, 0.25, 0.5, 1]) {
              const out = mouthTargetFactor({
                ...SIZING_ARGS,
                ageState: isMinor ? "minor" : "adult",
                // Un mineur est refusé par la porte ② — on l'évalue donc par la
                // fonction de rythme, pas par la porte, pour ne pas confondre
                // « la ceinture n'a pas mordu » et « la porte l'a arrêté ».
                direction,
                paceKgPerWeek: pace,
                subject: {
                  body: { heightCm, weightKg, gender, ageYears: isMinor ? 12 : 35, activityLevel: null },
                  isMinor,
                },
              });
              assert(
                out.reason !== "implausible_factor",
                `implausible sur ${weightKg}kg/${heightCm}cm/${gender}/${direction}/${pace}`,
              );
              if (out.reason === "sized") {
                sized++;
                assert(out.factor >= BOX_FACTOR_MIN, `${out.factor} < ${BOX_FACTOR_MIN}`);
                assert(out.factor <= BOX_FACTOR_MAX, `${out.factor} > ${BOX_FACTOR_MAX}`);
              }
            }
          }
        }
      }
    }
  }
  // Le balayage doit avoir produit de VRAIS dimensionnements, sinon il ne prouve
  // rien: une garde qu'on ne franchit jamais est une garde qu'on n'a pas testée.
  assert(sized > 100, `seulement ${sized} dimensionnements dans le balayage`);

  // ── LE MINIMUM STRUCTUREL, CALCULÉ ET NON DEVINÉ ────────────────────────
  // Sur une PERTE d'adulte, l'écart est `min(A1, entretien − plancher)`, donc le
  // facteur vaut `max(1 − 500/e, plancher/e)`; les deux branches se croisent à
  // `e = 500 + plancher`, et c'est le point le plus bas. Avec le plancher le
  // plus bas du dépôt, 1 200 kcal: 0,7059. `BOX_FACTOR_MIN` doit passer SOUS ce
  // nombre, sans quoi la ceinture refuserait un dimensionnement légitime — ce
  // qu'elle a effectivement fait à 0,75, mesuré sur un corps de 30 kg/195 cm.
  const worst = 1200 / (500 + 1200);
  assert(
    BOX_FACTOR_MIN < worst,
    `BOX_FACTOR_MIN=${BOX_FACTOR_MIN} mord sur le minimum structurel ${worst}`,
  );
  assert(BOX_FACTOR_MAX > 1 + MAX_SURPLUS_FRACTION, `${BOX_FACTOR_MAX}`);
});

Deno.test("L8 ① — le vocabulaire des motifs est FERMÉ et chaque valeur est atteignable", () => {
  const seen = new Set<BoxSizingReason>();
  const cases: Array<Partial<SizingArgs>> = [
    {},
    { restrictionFlag: true },
    { ageState: "minor", subject: { body: CHILD_BODY, isMinor: true } },
    { coachCounting: "no_counting" },
    { ageState: "unknown" },
    { direction: null },
    { paceKgPerWeek: null },
    { subject: { body: { ...ADULT_BODY, weightKg: null }, isMinor: false } },
  ];
  for (const over of cases) {
    seen.add(mouthTargetFactor({ ...SIZING_ARGS, ...over }).reason);
  }
  // `implausible_factor` est le seul motif inatteignable depuis un corps réel —
  // c'est le sujet du test précédent, et il est nommé ici pour que sa présence
  // dans la liste fermée ne passe pas pour un oubli.
  assertEquals(
    [...seen].sort(),
    BOX_SIZING_REASONS.filter((r) => r !== "implausible_factor").slice().sort(),
  );
});

// ---------------------------------------------------------------------------
// ① LES BOÎTES — ce qui bouge, ce qui ne bouge pas, et ce que la casserole tient
// ---------------------------------------------------------------------------

const PREP = (
  boxes: Array<{ id: string; memberIds: string[]; grams: number }>,
  readyGrams: number | null = 100000,
): SizablePreparation => ({ id: "prep_rice", boxes, readyGrams });

const TOL = 1.1;

Deno.test("L8 ① — LE CAS QUI PASSE: deux bouches, deux facteurs, deux grammages", () => {
  const out = sizeBoxesFromTarget(
    [PREP([
      { id: "box_zoe", memberIds: ["zoe"], grams: 200 },
      { id: "box_marc", memberIds: ["marc"], grams: 200 },
    ])],
    new Map([["zoe", 0.8], ["marc", 1.1]]),
    TOL,
  );
  assertEquals(out.grams.get("box_zoe"), 160);
  assertEquals(out.grams.get("box_marc"), 220);
  assertEquals(out.counts, {
    boxes: 2,
    sized: 2,
    unchanged: 0,
    shared_mixed: 0,
    capped_by_pot: 0,
    unverifiable: 0,
  });
  assertEquals(out.issues, []);
});

Deno.test("⛔ L8 ① — AUCUNE CIBLE ⇒ AUCUN GRAMME NE BOUGE, ET AUCUNE `issue`", () => {
  // ⚠️ C'EST LE CAS DE LA POPULATION ENTIÈRE AU 2026-08-18: aucun écran n'écrit
  // encore le curseur de rythme. Si ce lot changeait quoi que ce soit ici, il
  // changerait tout pour tout le monde le jour de sa livraison.
  const prep = PREP(
    [
      { id: "box_a", memberIds: ["a"], grams: 300 },
      { id: "box_b", memberIds: ["b", "c"], grams: 250 },
    ],
    // ⚠️ ET LA CASSEROLE EST DÉLIBÉRÉMENT TROP PETITE: un plan déjà sur-rempli
    // ne doit PAS être « réparé » au passage. Le parseur a sa propre `issue`
    // pour ce cas; la doubler ici changerait le produit pour qui n'a pas de
    // cible. Mutation la plus rentable de ce fichier: retirer la garde
    // `anySized`.
    10,
  );
  const out = sizeBoxesFromTarget([prep], new Map(), TOL);
  assertEquals(out.grams.size, 0);
  assertEquals(out.issues, []);
  assertEquals(out.counts.sized, 0);
  assertEquals(out.counts.capped_by_pot, 0);
  assertEquals(out.counts.unchanged, 2);
});

Deno.test("L8 ① — une boîte PARTAGÉE à facteurs divergents n'est pas coupée en deux", () => {
  // On ne peut pas fabriquer un second identifiant: `dishes[].uses[].box_id`
  // pointerait sur une boîte au contenu changé, et l'écran citerait une boîte
  // que personne n'a pesée. On laisse, et on COMPTE.
  const out = sizeBoxesFromTarget(
    [PREP([{ id: "box_shared", memberIds: ["zoe", "marc"], grams: 200 }])],
    new Map([["zoe", 0.8], ["marc", 1.1]]),
    TOL,
  );
  assertEquals(out.grams.size, 0);
  assertEquals(out.counts.shared_mixed, 1);
  assertEquals(out.counts.sized, 0);
  assertEquals(out.counts.unchanged, 0);
  assertEquals(out.issues.length, 1);
  assert(out.issues[0].includes("box_shared"));
  assert(out.issues[0].includes("targets differ"));
});

Deno.test("L8 ① — une boîte partagée à facteurs IDENTIQUES se redimensionne", () => {
  // Le cas qui passe du refus précédent. Sans lui, « on ne touche jamais une
  // boîte partagée » et « on ne touche pas celles qui divergent » se liraient
  // pareil.
  const out = sizeBoxesFromTarget(
    [PREP([{ id: "box_shared", memberIds: ["zoe", "marc"], grams: 200 }])],
    new Map([["zoe", 0.8], ["marc", 0.8]]),
    TOL,
  );
  assertEquals(out.grams.get("box_shared"), 160);
  assertEquals(out.counts.shared_mixed, 0);
  assertEquals(out.counts.sized, 1);
});

Deno.test("⛔ L8 ① — LE FACTEUR NE FAIT PAS APPARAÎTRE DE LA NOURRITURE", () => {
  // `scaling-factor-applies-only-to-the-mobile-part`, transposé: la part FIXE
  // est ce que la casserole produit. Un facteur qui l'ignore fait grossir un
  // plan sans rien lui donner à manger.
  //
  // 3 boîtes de 200 g, toutes à ×1,2 ⇒ 720 g demandés dans une casserole de
  // 500 g (plafond 550 avec la tolérance).
  const out = sizeBoxesFromTarget(
    [PREP(
      [
        { id: "b1", memberIds: ["a"], grams: 200 },
        { id: "b2", memberIds: ["b"], grams: 200 },
        { id: "b3", memberIds: ["c"], grams: 200 },
      ],
      500,
    )],
    new Map([["a", 1.2], ["b", 1.2], ["c", 1.2]]),
    TOL,
  );
  const sum = [...out.grams.values()].reduce((a, b) => a + b, 0);
  assert(sum <= 500 * TOL + 3, `${sum} g dans une casserole de 500 g`);
  assertEquals(out.counts.capped_by_pot, 1);
  assert(out.issues.some((i) => i.includes("scaled back to fit")));
  // ⚠️ LE RAPPORT ENTRE LES PARTS EST PRÉSERVÉ — c'est ce que la cible achète.
  // Raboter une seule boîte retirerait sa part à quelqu'un pour l'arithmétique
  // d'un autre.
  assertEquals(out.grams.get("b1"), out.grams.get("b2"));
  assertEquals(out.grams.get("b2"), out.grams.get("b3"));
});

Deno.test("L8 ① — le rapport entre DEUX cibles différentes survit au plafond", () => {
  const out = sizeBoxesFromTarget(
    [PREP(
      [
        { id: "b1", memberIds: ["a"], grams: 200 },
        { id: "b2", memberIds: ["b"], grams: 200 },
      ],
      300,
    )],
    new Map([["a", 0.8], ["b", 1.2]]),
    TOL,
  );
  const a = out.grams.get("b1")!;
  const b = out.grams.get("b2")!;
  assertEquals(out.counts.capped_by_pot, 1);
  // 0,8 / 1,2 = 0,667, à l'arrondi près.
  assert(Math.abs(a / b - 0.8 / 1.2) < 0.02, `${a}/${b}`);
});

Deno.test("L8 ① — une production non reconstructible se redimensionne SANS vérification, et le dit", () => {
  const out = sizeBoxesFromTarget(
    [PREP([{ id: "b1", memberIds: ["a"], grams: 200 }], null)],
    new Map([["a", 1.2]]),
    TOL,
  );
  assertEquals(out.grams.get("b1"), 240);
  assertEquals(out.counts.unverifiable, 1);
  assertEquals(out.counts.capped_by_pot, 0);
});

Deno.test("⛔ L8 ① — UNE BOÎTE NE DESCEND JAMAIS À ZÉRO, et le seul chemin qui l'y mènerait est le PLAFOND", () => {
  // ⚠️ LA MISE EN SCÈNE EST LA MOITIÉ DU TEST, ET ELLE A ÉTÉ REFAITE. La
  // première rédaction appliquait un simple facteur (`1 g × 0,8`), et la
  // mutation « retirer le plancher » SURVIVAIT: `Math.round(0,8)` vaut 1, donc
  // le plancher n'était jamais exercé. C'est le piège de la « ceinture armée sur
  // un coffre vide », mesuré trois fois sur ce chantier.
  //
  // Le SEUL chemin qui peut rendre zéro est le rabotage par le plafond du
  // récipient: une casserole minuscule pour des boîtes redimensionnées donne un
  // `shrink` arbitrairement petit.
  const out = sizeBoxesFromTarget(
    [PREP(
      [
        { id: "b1", memberIds: ["a"], grams: 400 },
        { id: "b2", memberIds: ["b"], grams: 400 },
      ],
      // 1 g produits: le rabotage vaut ~0,0014.
      1,
    )],
    new Map([["a", 0.8], ["b", 1.2]]),
    TOL,
  );
  assertEquals(out.counts.capped_by_pot, 1);
  // Une boîte à zéro est une consigne qui dit « rien », et l'écran l'imprimerait
  // telle quelle (« Boîte Zoé — 0 g »).
  assertEquals(out.grams.get("b1"), 1);
  assertEquals(out.grams.get("b2"), 1);

  // ── ET LE CHEMIN DU FACTEUR NE PEUT PAS Y MENER, ARITHMÉTIQUEMENT ────────
  // Le parseur n'accepte qu'un `grams` entier > 0, donc ≥ 1, et le facteur ne
  // descend pas sous `BOX_FACTOR_MIN`: `Math.round(1 × 0,70) = 1`. Le
  // `Math.max` de cette branche-là est une ceinture de doublure, et ce test dit
  // POURQUOI elle n'a pas de cas — plutôt que de laisser croire qu'elle en a un.
  assert(Math.round(1 * BOX_FACTOR_MIN) >= 1, "le plancher du facteur est atteignable");
});

Deno.test("L8 ① — PROPRIÉTÉ: sized + unchanged + shared_mixed === boxes, toujours", () => {
  // Un compteur dont les parts ne recomposent pas le tout est un compteur qui
  // ment, et c'est écrit trois fois dans `meal_generation.ts`.
  const preps: SizablePreparation[] = [
    PREP([
      { id: "b1", memberIds: ["a"], grams: 200 },
      { id: "b2", memberIds: ["b", "c"], grams: 180 },
      { id: "b3", memberIds: ["d"], grams: 90 },
    ]),
    PREP([{ id: "b4", memberIds: ["a", "b"], grams: 150 }], 200),
  ];
  for (
    const factors of [
      new Map<string, number>(),
      new Map([["a", 0.9]]),
      new Map([["a", 0.9], ["b", 0.9], ["c", 0.9]]),
      new Map([["a", 1.2], ["b", 0.8], ["c", 1.1], ["d", 0.85]]),
    ]
  ) {
    const out = sizeBoxesFromTarget(preps, factors, TOL);
    assertEquals(
      out.counts.sized + out.counts.unchanged + out.counts.shared_mixed,
      out.counts.boxes,
      JSON.stringify([...factors]),
    );
  }
});

// ---------------------------------------------------------------------------
// ② LE CONSEIL DU MIDI — clause C9
// ---------------------------------------------------------------------------

const DAY: EatingOccasion[] = ["breakfast", "lunch", "dinner"];
const SLOTS = DAY.map((slot) => ({ slot, size: null }));
const LUNCH = { slot: "lunch" as EatingOccasion, size: null };
const OPEN_READER = { show: true, reason: "open" };
const EXECUTED = executedPaceFor("down", { body: ADULT_BODY, isMinor: false }, 0.5);

const ADVICE = {
  presenceState: "eating_out",
  reader: OPEN_READER,
  mouthIsReader: true,
  mouthAgeState: "adult" as MemberAgeState,
  slots: SLOTS,
  occasion: LUNCH,
  executed: EXECUTED,
  direction: "down" as const,
};

Deno.test("L8 ② — LE CAS QUI PASSE: un midi dehors reçoit un nombre, arrondi aux 50", () => {
  const out = eatingOutAdvice(ADVICE);
  assertEquals(out.reason, "advised");
  assert(out.kcal !== null && out.kcal > 0, JSON.stringify(out));
  assertEquals(out.kcal! % 50, 0, `${out.kcal} n'est pas arrondi aux 50`);
});

Deno.test("⛔ L8 C9.a — UN MINEUR ET UN ÂGE INCONNU NE REÇOIVENT AUCUN CHIFFRE", () => {
  // `keel_household_set_member_away` ne consulte AUCUN âge — reconfirmé sur
  // `prosrc` par L4-B. « Dehors » est donc posable sur un mineur, et sans cette
  // garde un chiffre l'atteindrait par une case de grille, sans jamais passer
  // devant la porte qui existe pour l'en protéger.
  assertEquals(
    eatingOutAdvice({ ...ADVICE, mouthAgeState: "minor" }),
    { kcal: null, reason: "mouth_minor" },
  );
  assertEquals(
    eatingOutAdvice({ ...ADVICE, mouthAgeState: "unknown" }),
    { kcal: null, reason: "mouth_age_unknown" },
  );
});

Deno.test("⛔ L8 C9.b — UN VOCABULAIRE INCONNU NE REÇOIT AUCUN CHIFFRE, ET AUCUN REPLI", () => {
  // Le vocabulaire de présence est fermé côté maître et OUVERT côté personne: un
  // `.update()` PostgREST direct passe sans contrainte. Un jeton hors liste vaut
  // « on ne sait pas », jamais « à table » et jamais « dehors ».
  for (const state of ["", "EATING_OUT", "eating out", "dehors", "out", "away_days", "null"]) {
    assertEquals(
      eatingOutAdvice({ ...ADVICE, presenceState: state }),
      { kcal: null, reason: "unknown_state" },
      state,
    );
  }
  // Et les deux états CONNUS qui ne sont pas « dehors » se disent autrement:
  // confondre « pas de conseil » et « on ne sait pas » ferait chercher la
  // réparation du mauvais côté.
  for (const state of ["at_table", "away"]) {
    assertEquals(
      eatingOutAdvice({ ...ADVICE, presenceState: state }),
      { kcal: null, reason: "not_eating_out" },
      state,
    );
  }
});

Deno.test("L8 C9.b — le vocabulaire recopié est EXACTEMENT celui de `household_presence`", () => {
  // La recopie est imposée par le cycle d'import (voir le commentaire du
  // module). Ce test est ce qui l'empêche de dériver: un quatrième état ajouté
  // là-bas serait lu « inconnu » ici, donc muet, et le lot ressemblerait à un
  // lot qui marche.
  assertEquals([...KNOWN_PRESENCE_STATES], [...PRESENCE_STATES]);
});

Deno.test("L8 ② — la bouche d'un AUTRE ne reçoit jamais de chiffre", () => {
  // FF-059 §11 n°4: un chiffre ne sort que pour la bouche qui le demande. Une
  // bouche sans compte n'a aucun interrupteur — lui adresser un chiffre serait
  // un tracker qu'elle ne peut pas éteindre. C'est le manque que le levier
  // d'invitation existe pour nommer.
  assertEquals(
    eatingOutAdvice({ ...ADVICE, mouthIsReader: false }),
    { kcal: null, reason: "other_mouth" },
  );
});

Deno.test("L8 ② — le motif du LECTEUR survit tel quel, interrupteurs compris", () => {
  // ⚠️ CONTRAIREMENT AU DIMENSIONNEMENT, CE CONSEIL SE LIT: il traverse donc les
  // CINQ portes. `student_off` et `target_off` doivent arriver jusqu'ici, sans
  // quoi éteindre l'affichage laisserait un chiffre à l'écran.
  for (
    const reason of [
      "restriction_floor",
      "minor",
      "doctrine_no_counting",
      "student_off",
      "target_off",
    ]
  ) {
    assertEquals(
      eatingOutAdvice({ ...ADVICE, reader: { show: false, reason } }),
      { kcal: null, reason: reason as EatingOutAdviceReason },
      reason,
    );
  }
  // Un motif que ce vocabulaire ne porte pas refuse quand même, et il ne se
  // range PAS dans `advised`.
  const unknown = eatingOutAdvice({
    ...ADVICE,
    reader: { show: false, reason: "some_new_gate" },
  });
  assertEquals(unknown, { kcal: null, reason: "unknown_state" });
});

Deno.test("L8 ② — sans corps ni journée déclarée, aucun chiffre", () => {
  assertEquals(
    eatingOutAdvice({ ...ADVICE, executed: null }),
    { kcal: null, reason: "no_body" },
  );
  assertEquals(
    eatingOutAdvice({ ...ADVICE, slots: [] }),
    { kcal: null, reason: "no_rhythm" },
  );
  // Une case qui n'est pas dans la journée déclarée de cette personne: on ne
  // fabrique pas un moment qu'elle n'a pas.
  assertEquals(
    eatingOutAdvice({
      ...ADVICE,
      slots: [{ slot: "dinner", size: null }],
      occasion: LUNCH,
    }),
    { kcal: null, reason: "no_rhythm" },
  );
});

Deno.test("L8 ② — le conseil suit la TAILLE déclarée du repas, pas une table universelle", () => {
  const plain = eatingOutAdvice(ADVICE).kcal!;
  const big = eatingOutAdvice({
    ...ADVICE,
    slots: [
      { slot: "breakfast", size: null },
      { slot: "lunch", size: "large" },
      { slot: "dinner", size: null },
    ],
    occasion: { slot: "lunch", size: "large" },
  }).kcal!;
  assert(big > plain, `${big} devrait dépasser ${plain}`);
  // Et la somme des moments d'une journée reste la journée, à l'arrondi près:
  // le conseil est une PART d'une journée déclarée, pas un pourcentage figé.
  const total = DAY.map((slot) =>
    eatingOutAdvice({ ...ADVICE, occasion: { slot, size: null } }).kcal ?? 0
  ).reduce((a, b) => a + b, 0);
  const day = EXECUTED!.maintenanceKcal - EXECUTED!.dailyDeltaKcal;
  assert(Math.abs(total - day) <= 75, `${total} vs ${day}`);
});

Deno.test("⛔ L8 ② — UNE CONSIGNE, JAMAIS UN SOLDE — et les deux langues le disent", () => {
  const kcal = eatingOutAdvice(ADVICE).kcal!;
  const en = eatingOutAdviceSentence("en", "lunch", kcal);
  const fr = eatingOutAdviceSentence("fr", "lunch", kcal);
  assertEquals(en, `At lunch, aim for around ${kcal}.`);
  assertEquals(fr, `Au déjeuner, vise autour de ${kcal}.`);
  // « Il te reste 680 kcal » est LA phrase d'un tracker. Aucune des douze
  // formulations ne peut la produire, et on le vérifie dans les DEUX langues —
  // « garde testée dans une seule langue » est une cicatrice mesurée d'ici.
  for (const occasion of EATING_OCCASIONS) {
    for (const locale of ["en", "fr"] as const) {
      const line = eatingOutAdviceSentence(locale, occasion, 700);
      for (
        const banned of ["left", "remaining", "reste", "restant", "budget", "over", "under"]
      ) {
        assert(!line.toLowerCase().includes(banned), `${locale}/${occasion}: ${line}`);
      }
      assert(line.includes("700"), line);
    }
  }
});

Deno.test("L8 ② — la préposition française est DANS le libellé, jamais dans le gabarit", () => {
  // Une phrase assemblée en `Au ${label}` rend « Au ta collation du matin ». La
  // faute est invisible à qui teste en anglais.
  assertEquals(
    eatingOutAdviceSentence("fr", "snack_am", 200),
    "À ta collation du matin, vise autour de 200.",
  );
  for (const occasion of EATING_OCCASIONS) {
    const fr = EATING_OUT_SLOT_LABELS[occasion].fr;
    assert(/^(Au |À |Aux )/.test(fr), `${occasion}: « ${fr} » ne porte pas sa préposition`);
    assert(
      EATING_OUT_SLOT_LABELS[occasion].en.startsWith("At "),
      occasion,
    );
  }
});

Deno.test("L8 ② — le vocabulaire des motifs est FERMÉ, et `advised` en fait partie", () => {
  // Un journal qui ne nomme que les refus ne distingue pas « la porte a laissé
  // passer » de « la porte n'a pas tourné ».
  assert((EATING_OUT_ADVICE_REASONS as readonly string[]).includes("advised"));
  assertEquals(new Set(EATING_OUT_ADVICE_REASONS).size, EATING_OUT_ADVICE_REASONS.length);
  assertEquals(MEAL_SIZE_WEIGHT.small < MEAL_SIZE_WEIGHT.medium, true);
  assertEquals(MEAL_SIZE_WEIGHT.medium < MEAL_SIZE_WEIGHT.large, true);
});

// ---------------------------------------------------------------------------
// LE RYTHME EXÉCUTÉ — l'écart de +10 % que L1-B a signalé, refermé
// ---------------------------------------------------------------------------

Deno.test("⛔ L8 — LE RYTHME EXÉCUTÉ NE DÉPASSE JAMAIS LE CRAN CHOISI", () => {
  // L'invariant qui referme l'écart: le slider de PRISE monte jusqu'à la borne
  // dure pendant que `envelopeCore` plafonne à +10 %. Une date d'arrivée
  // calculée sur le cran choisi est donc OPTIMISTE; les grammages, eux, sont
  // désormais calculés sur ce que la casserole livre.
  let clamped = 0;
  for (const body of [ADULT_BODY, SMALL_ADULT_BODY, CHILD_BODY]) {
    for (const isMinor of [false, true]) {
      for (const direction of ["down", "up"] as const) {
        for (const chosen of [0.05, 0.2, 0.5, 0.8, 1]) {
          const out = executedPaceFor(direction, { body, isMinor }, chosen);
          if (out === null) continue;
          assert(
            out.kgPerWeek <= chosen + 1e-9,
            `${direction}/${chosen}: exécuté ${out.kgPerWeek}`,
          );
          assert(out.dailyDeltaKcal >= 0);
          if (out.clampedBy !== "chosen") clamped++;
        }
      }
    }
  }
  assert(clamped > 0, "aucune borne n'a mordu: le balayage ne prouve rien");
});

Deno.test("L8 — chaque borne du rythme exécuté a son cas qui gagne, et il est nommé", () => {
  // Une PRISE d'adulte: la bande `muscle_gain` (+10 %) mord bien avant le kilo.
  const gain = executedPaceFor("up", { body: ADULT_BODY, isMinor: false }, 1)!;
  assertEquals(gain.clampedBy, "surplus_band");
  assertEquals(
    gain.dailyDeltaKcal,
    Math.round(gain.maintenanceKcal * MAX_SURPLUS_FRACTION),
  );

  // Une PERTE d'adulte de bon gabarit: A1, non débrayable.
  const loss = executedPaceFor("down", { body: ADULT_BODY, isMinor: false }, 1)!;
  assertEquals(loss.clampedBy, "deficit_cap");
  assertEquals(loss.dailyDeltaKcal, MAX_DAILY_DEFICIT_KCAL);

  // Une PERTE sur un petit gabarit: c'est SON plancher qui décide, pas A1.
  const small = executedPaceFor("down", { body: SMALL_ADULT_BODY, isMinor: false }, 1)!;
  assertEquals(small.clampedBy, "energy_floor");
  assert(small.dailyDeltaKcal < MAX_DAILY_DEFICIT_KCAL);

  // Un MINEUR: la fraction de SON besoin, dans les deux sens.
  for (const direction of ["down", "up"] as const) {
    const child = executedPaceFor(direction, { body: CHILD_BODY, isMinor: true }, 1)!;
    assertEquals(child.clampedBy, "minor_fraction", direction);
    assertEquals(
      child.dailyDeltaKcal,
      Math.round(child.maintenanceKcal * MINOR_MAX_DAILY_DELTA_FRACTION),
      direction,
    );
  }

  // ET LE CAS QUI PASSE: un cran modeste sort intact.
  const easy = executedPaceFor("down", { body: ADULT_BODY, isMinor: false }, 0.1)!;
  assertEquals(easy.clampedBy, "chosen");
  assertEquals(
    easy.dailyDeltaKcal,
    Math.round((0.1 * KCAL_PER_KG_BODY_MASS) / 7),
  );
});

Deno.test("L8 — un corps qu'on ne sait pas estimer ne rend AUCUN rythme exécuté", () => {
  for (
    const body of [
      { ...ADULT_BODY, weightKg: null },
      { ...ADULT_BODY, weightKg: 0 },
      { ...ADULT_BODY, ageYears: null },
    ]
  ) {
    assertEquals(executedPaceFor("down", { body, isMinor: false }, 0.5), null);
  }
  assertEquals(executedPaceFor("down", { body: ADULT_BODY, isMinor: false }, 0), null);
});

// ---------------------------------------------------------------------------
// LES GARDES LUES SUR LA SOURCE
// ---------------------------------------------------------------------------

const SOURCE = Deno.readTextFileSync(
  fromFileUrl(new URL("./household_portions.ts", import.meta.url)),
);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const CODE = stripComments(SOURCE);

Deno.test("⛔ L8 — LE DIMENSIONNEMENT NE LIT NI ④ NI ⑤, ET LA SOURCE LE PROUVE", () => {
  // Masquer un chiffre à l'écran ne change pas le dîner. Le test jumeau de
  // `energy_gate_mouth_test.ts` tient la PORTE; celui-ci tient l'APPELANT — la
  // porte pourrait rester pure pendant que le module qui l'appelle lit
  // l'interrupteur juste à côté et retombe sur `factor: 1`.
  const start = CODE.indexOf("export function mouthTargetFactor(");
  assert(start > 0, "mouthTargetFactor a été renommée");
  const end = CODE.indexOf("\n}\n", start);
  assert(end > start, "fin de fonction introuvable");
  const body = CODE.slice(start, end);
  // ── LA PRÉMISSE DE LA GARDE, VÉRIFIÉE AVANT LA GARDE ────────────────────
  // Sans ces deux lignes, un extracteur cassé rend un fragment vide, les quatre
  // `assert` passent, et le banc reste vert en ne regardant RIEN. C'est le
  // défaut exact que L4-B a mesuré sur la garde jumelle.
  assert(body.includes("canSizeFromTarget("), `le corps n'a pas été lu:\n${body}`);
  assert(body.includes('noSizing("age_unknown")'), `le corps est tronqué:\n${body}`);
  for (
    const banned of [
      "studentSwitch",
      "targetSwitch",
      "energy_display_enabled",
      "energy_target_enabled",
      "canShowTarget",
      "canShowEnergy",
    ]
  ) {
    assert(!body.includes(banned), `${banned} dans le dimensionnement:\n${body}`);
  }
});

Deno.test("⛔ L8 — LE MODULE NE SOUSTRAIT AUCUN CONSOMMÉ: il n'y a pas de solde à écrire", () => {
  // « Il te reste 680 kcal » ne peut pas se construire à partir de ce module,
  // parce qu'aucune de ses entrées ne porte un consommé. Le test lit les noms de
  // champs plutôt qu'une arithmétique: c'est l'ENTRÉE qui rend la phrase
  // possible, pas l'opérateur.
  const start = CODE.indexOf("export function eatingOutAdvice(");
  const end = CODE.indexOf("\n}\n", start);
  assert(start > 0 && end > start);
  const body = CODE.slice(start, end);
  assert(body.includes('refuse("mouth_minor")'), "le corps n'a pas été lu");
  for (
    const banned of ["consumed", "eaten", "alreadyAte", "remaining", "left", "balance"]
  ) {
    assert(!body.includes(banned), `${banned} dans le conseil du midi`);
  }
});

Deno.test("L8 — aucun champ OPTIONNEL dans les entrées neuves", () => {
  // « Un paramètre de garde optionnel est une garde désarmée » (`safetyBand:
  // null`). Le typecheck ne sait pas exprimer « cette signature n'a pas de `?` »:
  // on lit donc la source.
  for (
    const marker of [
      "export function mouthTargetFactor(args: {",
      "export function eatingOutAdvice(args: {",
      "export interface SizablePreparation {",
    ]
  ) {
    const start = CODE.indexOf(marker);
    assert(start > 0, `${marker} a été renommé`);
    const end = CODE.indexOf("\n}", start);
    const zone = CODE.slice(start, end);
    assert(!/\w\s*\?\s*:/.test(zone), `champ optionnel dans ${marker}:\n${zone}`);
  }
});
