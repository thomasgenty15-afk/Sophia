// LE POIDS DE RÉFÉRENCE PROTÉIQUE — lot `L1`, 2026-08-22.
//
// ⛔ CE FICHIER EST ÉCRIT POUR MORDRE DANS LES DEUX SENS, et c'est la seule
// forme qui vaut ici. Un plafond qui retient le corps corpulent mais qui
// mordrait aussi sur un corps GRAND ET MINCE serait pire que pas de plafond —
// cicatrice `per-kilo-constants-break-on-tall-lean-bodies`, où le dépôt a déjà
// payé un plafond de masse indexé à l'envers.
//
// LES TROIS CORPS TÉMOINS, VALEURS EN LITTÉRAL. Aucune attente n'est
// recalculée avec la constante du module (cicatrice
// `test-parameterized-by-its-own-constant`: un test qui écrit
// `assertEquals(f(x), x * MA_CONSTANTE)` reste vert quand la constante bouge).
//
// ── ⚠️ LE SEUIL EST ARMÉ DEUX FOIS, ET IL FAUT SAVOIR POURQUOI ─────────────
// `meal_envelope.ts` porte, au 2026-08-22, plus de 400 lignes non commitées
// d'une autre session: le CÂBLAGE de `L1` vit donc dans l'arbre de travail —
// celui que `functions serve` et le gate exécutent — sans pouvoir entrer dans
// le commit de ce lot. Conséquence: les tests marqués « SUR L'ENVELOPPE »
// prouvent le câblage réel, mais ne peuvent pas être verts depuis un checkout
// de `HEAD` seul. Le §① les double donc par les MÊMES trois corps témoins
// calculés sur le module PUR, avec les g/kg écrits en littéral (2,0 et 1,6,
// les valeurs de `PROTEIN_FLOOR_G_PER_KG`, jamais importées) — cette
// moitié-là est verte depuis n'importe quel arbre.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  censusReferenceWeight,
  proteinReferenceWeightKg,
} from "./protein_reference_weight.ts";
import {
  type ActivityAxes,
  childEnvelopeFromBody,
  envelopeFor,
  MAINTENANCE_ENVELOPE_DIRECTION,
} from "./meal_envelope.ts";
import type { MealBodyContext } from "./meal_body.ts";

const NO_AXES: ActivityAxes = { day: null, sport: null, asked: false };

function corps(heightCm: number | null, weightKg: number): MealBodyContext {
  return {
    heightCm,
    ageBand: "30_44",
    gender: "male",
    latestWeight: { weekStart: "2026-08-03", value: weightKg },
    latestWaist: null,
    declaredWeightKg: null,
    restrictionFlag: false,
  };
}

function planchier(
  goal: "fat_loss" | "maintenance" | "muscle_gain",
  heightCm: number | null,
  weightKg: number,
  ageBand: "30_44" | "60_plus" = "30_44",
): number {
  const env = envelopeFor(
    goal,
    { ...corps(heightCm, weightKg), ageBand },
    ageBand,
    false,
    null,
    null,
    NO_AXES,
    null,
    null,
  MAINTENANCE_ENVELOPE_DIRECTION
);
  assert(env.mode === "per_kg");
  return env.proteinFloorG;
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LES TROIS CORPS TÉMOINS — le seuil de la fiche, sur le MODULE PUR
//    (la moitié verte depuis n'importe quel arbre — voir l'en-tête)
// ═══════════════════════════════════════════════════════════════════════════

/** Le plancher tel que `envelopeCore` le calcule, g/kg écrits en LITTÉRAL. */
function plancherPur(gPerKg: number, heightCm: number, weightKg: number): number {
  const ref = proteinReferenceWeightKg({
    weightKg,
    heightCm,
    ageBand: "30_44",
    suspended: false,
  }).referenceWeightKg;
  return Math.round(ref * gPerKg);
}

Deno.test("① mince 186/70 à 1,6 g/kg — 112 g, et le plafond n'y touche pas", () => {
  assertEquals(plancherPur(1.6, 186, 70), 112);
});

Deno.test("① moyen 175/75 à 1,6 g/kg — 120 g, et le plafond n'y touche pas", () => {
  assertEquals(plancherPur(1.6, 175, 75), 120);
});

Deno.test("① corpulent 170/110 à 2,0 g/kg — 173 g, et non 220", () => {
  assertEquals(plancherPur(2.0, 170, 110), 173);
});

Deno.test("① LE SEUIL, sur les trois — ≥ 15 % sur le troisième SEULEMENT", () => {
  const temoins = [
    { g: 1.6, h: 186, w: 70, sansPlafond: 112, attendu: 112 },
    { g: 1.6, h: 175, w: 75, sansPlafond: 120, attendu: 120 },
    { g: 2.0, h: 170, w: 110, sansPlafond: 220, attendu: 173 },
  ] as const;
  temoins.forEach((t, i) => {
    const livre = plancherPur(t.g, t.h, t.w);
    assertEquals(livre, t.attendu, `corps ${i}`);
    const bouge = (t.sansPlafond - livre) / t.sansPlafond;
    if (i < 2) assertEquals(bouge, 0, `⛔ le corps ${i} ne doit PAS bouger`);
    else assert(bouge >= 0.15, `le corps corpulent ne bouge que de ${bouge}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ①bis LES MÊMES TROIS CORPS — SUR L'ENVELOPPE RÉELLE (le CÂBLAGE)
//      ⚠️ dépend de `meal_envelope.ts` dans l'ARBRE DE TRAVAIL. Voir l'en-tête.
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("✅ LE CAS QUI PASSE — un corps GRAND ET MINCE ne bouge pas d'un gramme", () => {
  // 186 cm / 70 kg. Son plafond vaut 103,8 kg: il en est à 33,8 kg.
  assertEquals(planchier("maintenance", 186, 70), 112);
});

Deno.test("✅ LE CAS QUI PASSE — un corps MOYEN ne bouge pas d'un gramme", () => {
  // 175 cm / 75 kg. Plafond 91,875 kg.
  assertEquals(planchier("maintenance", 175, 75), 120);
});

Deno.test("⛔ LE CAS QUI MORD — un corps CORPULENT reçoit 173 g, plus 220", () => {
  // 170 cm / 110 kg, `fat_loss` (2,0 g/kg). Plafond 86,7 kg.
  //   avant ce lot: 110 × 2,0   = 220 g
  //   après        : 86,7 × 2,0 = 173,4 → 173 g
  // −47 g, soit −21,4 % — le seuil de la fiche est « ≥ 15 % ».
  assertEquals(planchier("fat_loss", 170, 110), 173);
});

Deno.test("⛔ LE SEUIL, LU SUR LES TROIS ENSEMBLE — ≥ 15 % sur le troisième SEULEMENT", () => {
  const temoins = [
    { goal: "maintenance", h: 186, w: 70, sansPlafond: 112, attendu: 112 },
    { goal: "maintenance", h: 175, w: 75, sansPlafond: 120, attendu: 120 },
    { goal: "fat_loss", h: 170, w: 110, sansPlafond: 220, attendu: 173 },
  ] as const;
  temoins.forEach((t, i) => {
    const livre = planchier(t.goal, t.h, t.w);
    assertEquals(livre, t.attendu, `corps ${i}`);
    const bouge = (t.sansPlafond - livre) / t.sansPlafond;
    if (i < 2) {
      assertEquals(bouge, 0, `⛔ le corps ${i} ne doit PAS bouger`);
    } else {
      assert(bouge >= 0.15, `le corps corpulent ne bouge que de ${bouge}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LA PROPRIÉTÉ BILATÉRALE, SUR LE MODULE PUR
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ le poids de référence n'est JAMAIS au-dessus du poids réel", () => {
  for (let h = 140; h <= 200; h += 5) {
    for (let w = 40; w <= 160; w += 5) {
      const out = proteinReferenceWeightKg({
        weightKg: w,
        heightCm: h,
        ageBand: "30_44",
        suspended: false,
      });
      assert(
        out.referenceWeightKg <= w,
        `${h} cm / ${w} kg → ${out.referenceWeightKg}`,
      );
    }
  }
});

Deno.test("⛔ IL NE MORD QU'À UN BOUT — sous le plafond, l'ÉGALITÉ est exacte", () => {
  let vus = 0;
  for (let h = 150; h <= 200; h += 5) {
    const plafond = 30 * (h / 100) * (h / 100);
    for (let w = 40; w <= Math.floor(plafond); w += 5) {
      const out = proteinReferenceWeightKg({
        weightKg: w,
        heightCm: h,
        ageBand: "30_44",
        suspended: false,
      });
      assertEquals(out.referenceWeightKg, w, `${h} cm / ${w} kg`);
      assertEquals(out.capped, false);
      assertEquals(out.reason, "under_ceiling");
      vus++;
    }
  }
  // ⛔ ANTI-GARDE-MORTE: une boucle qui ne tourne pas est verte aussi.
  assert(vus > 100, `seulement ${vus} corps parcourus`);
});

Deno.test("le plafond suit le CARRÉ de la taille — plus grand ⇒ jamais plus contraint", () => {
  let precedent = 0;
  for (let h = 150; h <= 200; h += 5) {
    const out = proteinReferenceWeightKg({
      weightKg: 200,
      heightCm: h,
      ageBand: "30_44",
      suspended: false,
    });
    assert(
      out.referenceWeightKg >= precedent,
      `${h} cm rend ${out.referenceWeightKg}, moins que ${precedent}`,
    );
    precedent = out.referenceWeightKg;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LES EXEMPTIONS — chacune a son cas, aucune n'est un oubli
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ SANS TAILLE — aucun plafond calculable, on ne retire rien", () => {
  const out = proteinReferenceWeightKg({
    weightKg: 110,
    heightCm: null,
    ageBand: "30_44",
    suspended: false,
  });
  assertEquals(out.referenceWeightKg, 110);
  assertEquals(out.reason, "no_height");
  // …et sur l'enveloppe réelle: 110 × 2,0 = 220 g, inchangé.
  assertEquals(planchier("fat_loss", null, 110), 220);
});

Deno.test("⛔ 60 ANS ET PLUS — le plafond est suspendu, la cible ne descend pas", () => {
  const out = proteinReferenceWeightKg({
    weightKg: 90,
    heightCm: 160,
    ageBand: "60_plus",
    suspended: false,
  });
  assertEquals(out.referenceWeightKg, 90);
  assertEquals(out.reason, "age_exempt");
  // 160 cm / 90 kg: son plafond vaudrait 76,8 kg, donc −21 g/j. Il ne les perd
  // pas. Voir l'en-tête du module et le registre §⑨.
  assertEquals(planchier("maintenance", 160, 90, "60_plus"), 144);
});

Deno.test("⚠️ la place de `O6` — `suspended: true` rend le poids réel", () => {
  const out = proteinReferenceWeightKg({
    weightKg: 110,
    heightCm: 170,
    ageBand: "30_44",
    suspended: true,
  });
  assertEquals(out.referenceWeightKg, 110);
  assertEquals(out.reason, "suspended");
});

Deno.test("⛔ UN MINEUR N'ENTRE PAS DU TOUT — l'enveloppe enfant garde 1,0 g/kg", () => {
  // 122 cm / 45 kg: un plafond « adulte » vaudrait 44,7 kg — il MORDRAIT.
  const env = childEnvelopeFromBody({
    heightCm: 122,
    weightKg: 45,
    gender: "female",
    ageYears: 11,
    activityLevel: null,
    activityAxes: NO_AXES,
    appetite: null,
  });
  assert(env !== null);
  assert(env.mode === "per_kg");
  assertEquals(env.proteinFloorG, 45);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LE COMPTEUR — ⛔ DEUX POPULATIONS, JAMAIS UNE SEULE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ le recensement rend les DEUX moitiés, et `untouched` est celle qui coûte", () => {
  const census = censusReferenceWeight([
    { weightKg: 70, heightCm: 186, ageBand: "30_44", suspended: false, gPerKg: 1.6 },
    { weightKg: 75, heightCm: 175, ageBand: "30_44", suspended: false, gPerKg: 1.6 },
    { weightKg: 110, heightCm: 170, ageBand: "30_44", suspended: false, gPerKg: 2.0 },
  ]);
  assertEquals(census, {
    bodies: 3,
    capped: 1,
    untouched: 2,
    gramsRemoved: 47,
  });
});

Deno.test("⛔ un corpus SANS aucun corps corpulent rend 0 retenu et 0 gramme", () => {
  // C'est LE référentiel du 2026-08-22: 0 corps sur 74 dépasse le plafond, et
  // le plus proche (Nina, 170 cm / 85 kg) en est à 1,7 kg. Un lot DÉSARMÉ
  // rendrait exactement ce recensement-ci — d'où les corps témoins ci-dessus,
  // qui sont la vraie preuve.
  const census = censusReferenceWeight([
    { weightKg: 85, heightCm: 170, ageBand: "30_44", suspended: false, gPerKg: 1.6 },
    { weightKg: 92, heightCm: 181, ageBand: "30_44", suspended: false, gPerKg: 1.6 },
  ]);
  assertEquals(census.capped, 0);
  assertEquals(census.untouched, 2);
  assertEquals(census.gramsRemoved, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ ⛔ L'INDICE N'EST NOMMÉ NULLE PART — ni le module, ni ce qu'il rend
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ ni le module ni sa sortie ne nomment l'indice, ni aucune catégorie de corps", async () => {
  const src = await Deno.readTextFile(
    new URL("./protein_reference_weight.ts", import.meta.url),
  );
  const bannis = [
    "b" + "mi",
    "i" + "mc",
    "indice de masse",
    "body mass index",
    "obes",
    "obès",
    "obé",
    "overweight",
    "surpoids",
  ];
  const bas = src.toLowerCase();
  for (const mot of bannis) {
    assert(!bas.includes(mot), `le module nomme « ${mot} »`);
  }
  // …et la SORTIE ne porte qu'un nombre et un motif technique.
  const out = proteinReferenceWeightKg({
    weightKg: 110,
    heightCm: 170,
    ageBand: "30_44",
    suspended: false,
  });
  assertEquals(
    Object.keys(out).sort(),
    ["capped", "reason", "referenceWeightKg"],
  );
  for (const mot of bannis) {
    assert(!String(out.reason).toLowerCase().includes(mot));
  }
});
