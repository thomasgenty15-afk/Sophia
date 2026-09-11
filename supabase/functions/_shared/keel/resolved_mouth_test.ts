/**
 * LOT 3 · LES FAITS D'UNE BOUCHE, RÉSOLUS UNE FOIS.
 *
 * Chaque cas de la famille « Corps/énergie » du chantier a sa ligne ici:
 * pesée récente, série vide avec fiche, champ absent, lecture échouée, date
 * contradictoire, mineur, âge inconnu.
 */
import { assertEquals } from "jsr:@std/assert@1";
import type { MouthBody } from "./meal_envelope.ts";
import {
  MOUTH_FACT_FIELDS,
  mouthFactTally,
  type PersonalMouthFacts,
  resolveMouth,
} from "./resolved_mouth.ts";

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
    activityAxes: { day: null, sport: null, asked: false },
    appetite: "large",
    ...over,
  };
}

Deno.test("① LA PESÉE RÉCENTE GAGNE SUR LE CHIFFRE TAPÉ À L'INSCRIPTION", () => {
  // ⛔ LE DÉFAUT QUE CE MODULE FERME. `lineBodies` servait 80 kg — le nombre
  // que quelqu'un avait tapé une fois — à une personne pesée à 73 mardi.
  const r = resolveMouth({
    memberId: "m1",
    userId: "u1",
    personal: personnel(),
    sheet: fiche(),
  });
  assertEquals(r.body.weightKg, 73);
  assertEquals(r.from.weightKg, "personal");
  assertEquals(r.body.heightCm, 178);
  assertEquals(r.conflicts.includes("weight_sheet_stale"), true);
});

Deno.test("② SÉRIE VIDE + FICHE: le repli sert, et il est TRACÉ", () => {
  const r = resolveMouth({
    memberId: "m1",
    userId: "u1",
    personal: personnel({ weightKg: null, weightAsOf: null }),
    sheet: fiche(),
  });
  assertEquals(r.body.weightKg, 80);
  assertEquals(r.from.weightKg, "member_sheet");
  // ⚠️ ET LE RESTE NE BASCULE PAS AVEC LUI: le repli est PAR CHAMP.
  assertEquals(r.from.heightCm, "personal");
  assertEquals(r.body.heightCm, 178);
});

Deno.test("③ CHAMP ABSENT DES DEUX CÔTÉS: `absent`, et pas un zéro", () => {
  const r = resolveMouth({
    memberId: "m1",
    userId: "u1",
    personal: personnel({ heightCm: null }),
    sheet: fiche({ heightCm: null }),
  });
  assertEquals(r.body.heightCm, null);
  assertEquals(r.from.heightCm, "absent");
});

Deno.test("④ LECTURE ÉCHOUÉE N'EST PAS UNE ABSENCE — aucun repli", () => {
  // ⛔ LA MOITIÉ DU LOT. Se replier ici servirait un chiffre périmé sous les
  // traits d'un chiffre à jour, et personne ne l'apprendrait.
  const r = resolveMouth({
    memberId: "m1",
    userId: "u1",
    personal: personnel({ read: "failed" }),
    sheet: fiche(),
  });
  for (
    const champ of [
      "heightCm",
      "weightKg",
      "gender",
      "ageYears",
      "activityLevel",
    ] as const
  ) {
    assertEquals(r.from[champ], "read_failed", champ);
  }
  assertEquals(r.body.weightKg, null);
  // L'appétit vient de la fiche par décision de chantier: il survit.
  assertEquals(r.body.appetite, "large");
  assertEquals(r.from.appetite, "member_sheet");
});

Deno.test("⑤ DATE CONTRADICTOIRE: le plus JEUNE gagne, et le conflit est nommé", () => {
  // ⛔ UNE CONTRADICTION NE DOIT JAMAIS FAIRE PASSER UN MINEUR POUR MAJEUR.
  const ficheMineure = resolveMouth({
    memberId: "m1",
    userId: "u1",
    personal: personnel({ ageYears: 19 }),
    sheet: fiche({ ageYears: 15 }),
  });
  assertEquals(ficheMineure.body.ageYears, 15);
  assertEquals(ficheMineure.conflicts.includes("age_minor_conflict"), true);

  // ET DANS L'AUTRE SENS: la date personnelle dit mineur, la fiche dit adulte.
  const dateMineure = resolveMouth({
    memberId: "m1",
    userId: "u1",
    personal: personnel({ ageYears: 15 }),
    sheet: fiche({ ageYears: 19 }),
  });
  assertEquals(dateMineure.body.ageYears, 15);
  assertEquals(dateMineure.from.ageYears, "personal");
  assertEquals(dateMineure.conflicts.includes("age_minor_conflict"), true);
});

Deno.test("⑤ bis — un désaccord ENTRE ADULTES ne déclenche pas la protection", () => {
  const r = resolveMouth({
    memberId: "m1",
    userId: "u1",
    personal: personnel({ ageYears: 34 }),
    sheet: fiche({ ageYears: 41 }),
  });
  // La date personnelle fait autorité, sans arbitrage protecteur.
  assertEquals(r.body.ageYears, 34);
  assertEquals(r.from.ageYears, "personal");
  assertEquals(r.conflicts.includes("age_disagreement"), true);
  assertEquals(r.conflicts.includes("age_minor_conflict"), false);
});

Deno.test("⑥ ÂGE INCONNU: on n'invente aucune date, la fiche reprend la main", () => {
  const r = resolveMouth({
    memberId: "m1",
    userId: "u1",
    personal: personnel({ ageYears: null }),
    sheet: fiche({ ageYears: 12 }),
  });
  assertEquals(r.body.ageYears, 12);
  assertEquals(r.from.ageYears, "member_sheet");
  // ⚠️ AUCUN CONFLIT D'ÂGE: il n'y a rien à contredire. Le décor porte par
  // ailleurs un désaccord de poids, qui n'a rien à voir avec cette ligne.
  assertEquals(r.conflicts.filter((c) => c.startsWith("age_")), []);

  // Et quand PERSONNE ne sait, ça reste `null` — jamais une bande convertie.
  const rien = resolveMouth({
    memberId: "m1",
    userId: "u1",
    personal: personnel({ ageYears: null }),
    sheet: fiche({ ageYears: null }),
  });
  assertEquals(rien.body.ageYears, null);
  assertEquals(rien.from.ageYears, "absent");
});

Deno.test("⑦ BOUCHE SANS COMPTE: la fiche est l'autorité, pas un repli", () => {
  const r = resolveMouth({
    memberId: "m2",
    userId: null,
    personal: null,
    sheet: fiche({ ageYears: 8, weightKg: 26, heightCm: 128 }),
  });
  assertEquals(r.body.weightKg, 26);
  assertEquals(r.from.weightKg, "member_sheet");
  assertEquals(r.from.ageYears, "member_sheet");
  assertEquals(r.conflicts, []);
});

Deno.test("⑦ bis — sans compte ET sans fiche: tout est `absent`, rien n'est zéro", () => {
  const r = resolveMouth({
    memberId: "m3",
    userId: null,
    personal: null,
    sheet: null,
  });
  for (const champ of MOUTH_FACT_FIELDS) {
    assertEquals(r.from[champ], "absent", champ);
  }
  assertEquals(r.body.weightKg, null);
  assertEquals(r.body.activityAxes, { day: null, sport: null, asked: false });
});

Deno.test("⑧ LES DEUX AXES NE SE MÉLANGENT PAS entre les deux sources", () => {
  // ⛔ `activityFactorOf` lit le COUPLE. En recomposer un depuis deux
  // personnes produirait un facteur que personne n'a décrit.
  const r = resolveMouth({
    memberId: "m1",
    userId: "u1",
    personal: personnel({
      activityAxes: { day: "on_feet", sport: null, asked: true },
    }),
    sheet: fiche({
      activityAxes: { day: "seated", sport: "5_plus", asked: true },
    }),
  });
  assertEquals(r.body.activityAxes, {
    day: "on_feet",
    sport: null,
    asked: true,
  });
  assertEquals(r.from.activityAxes, "personal");
});

Deno.test("⑧ bis — personne n'a répondu aux axes: la fiche sert si ELLE a répondu", () => {
  const r = resolveMouth({
    memberId: "m1",
    userId: "u1",
    personal: personnel({
      activityAxes: { day: null, sport: null, asked: false },
    }),
    sheet: fiche({
      activityAxes: { day: "seated", sport: "none", asked: true },
    }),
  });
  assertEquals(r.body.activityAxes.day, "seated");
  assertEquals(r.from.activityAxes, "member_sheet");
});

Deno.test("le décompte de provenances part sur la ligne, et il COMPTE", () => {
  // ⛔ SANS CE COMPTEUR, UN LOT DÉBRANCHÉ RESSEMBLE À UN LOT QUI MARCHE.
  const tally = mouthFactTally([
    resolveMouth({
      memberId: "m1",
      userId: "u1",
      personal: personnel(),
      sheet: fiche(),
    }),
    resolveMouth({
      memberId: "m2",
      userId: null,
      personal: null,
      sheet: fiche({ ageYears: 8 }),
    }),
  ]);
  assertEquals(tally["weightKg.personal"], 1);
  assertEquals(tally["weightKg.member_sheet"], 1);
  assertEquals(tally["conflict.weight_sheet_stale"], 1);
});
