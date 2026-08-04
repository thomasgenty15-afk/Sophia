// KEEL — student_age.ts.
//
// Le test qui porte la décision produit :
//   * « une date ABSENTE ne bloque personne »
//     -- c'est la condition de désarmement de la ceinture. Sans elle, la garde
//        censée protéger des enfants enfermerait dehors la totalité des élèves
//        existants, dont aucun n'a jamais eu de date de naissance à donner.
//   * « un mineur avéré ne fait pas générer de plan »
//     -- et le contre-factuel: le même élève, un jour après ses 18 ans, passe.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  ageBandOf,
  ageOnDate,
  assessBirthDate,
  birthDateWritable,
  KEEL_MINOR_AGE,
  usableAge,
  weekPlanAgeGate,
} from "./student_age.ts";

const TODAY = "2026-08-04";

Deno.test("ageOnDate: arithmétique de calendrier, pas de division par 365.25", () => {
  assertEquals(ageOnDate("1990-08-04", "2026-08-04"), 36, "le jour même de l'anniversaire");
  assertEquals(ageOnDate("1990-08-05", "2026-08-04"), 35, "la veille");
  assertEquals(ageOnDate("1990-08-03", "2026-08-04"), 36, "le lendemain");
});

Deno.test("ageOnDate: le 29 février ne décale rien", () => {
  // Une année bissextile est exactement là où une division par 365.25 dérape.
  assertEquals(ageOnDate("2000-02-29", "2026-02-28"), 25);
  assertEquals(ageOnDate("2000-02-29", "2026-03-01"), 26);
});

Deno.test("assessBirthDate: absent", () => {
  assertEquals(assessBirthDate(null, TODAY).status, "absent");
  assertEquals(assessBirthDate("", TODAY).status, "absent");
  assertEquals(assessBirthDate("   ", TODAY).status, "absent");
  assertEquals(assessBirthDate(undefined, TODAY).status, "absent");
});

Deno.test("assessBirthDate: illisible", () => {
  for (const raw of ["hier", "04/08/1990", "1990-8-4", "1990", "2010-02-30"]) {
    assertEquals(
      assessBirthDate(raw, TODAY).status,
      "unreadable",
      `${raw} devrait être illisible`,
    );
  }
});

Deno.test("assessBirthDate: le 30 février n'entre pas par la porte de derrière", () => {
  // `new Date("2010-02-30")` rend le 2 mars SANS se plaindre. Sans la relecture
  // dans `assessBirthDate`, cette date entrerait en base comme valide.
  assertEquals(assessBirthDate("2010-02-30", TODAY).status, "unreadable");
  assertEquals(assessBirthDate("2010-02-28", TODAY).status, "minor");
});

Deno.test("assessBirthDate: les dates absurdes du §5.2, nommées une par une", () => {
  const y1900 = assessBirthDate("1900-01-01", TODAY);
  assertEquals(y1900.status, "implausible", "1900 = 126 ans");

  const tomorrow = assessBirthDate("2026-08-05", TODAY);
  assertEquals(tomorrow.status, "future", "demain");

  const twelve = assessBirthDate("2014-01-01", TODAY);
  assertEquals(twelve.status, "minor", "un enfant de 12 ans");
  assert(twelve.status === "minor" && twelve.age === 12);
});

Deno.test("assessBirthDate: la frontière des 18 ans, des deux côtés", () => {
  // Exactement 18 ans aujourd'hui.
  const onBirthday = assessBirthDate("2008-08-04", TODAY);
  assertEquals(onBirthday.status, "adult");
  assert(onBirthday.status === "adult" && onBirthday.age === KEEL_MINOR_AGE);

  // Un jour de moins.
  const dayBefore = assessBirthDate("2008-08-05", TODAY);
  assertEquals(dayBefore.status, "minor");
  assert(dayBefore.status === "minor" && dayBefore.age === 17);
});

Deno.test("assessBirthDate: refuse de deviner « aujourd'hui »", () => {
  // Une garde qui se trompe de date du jour se trompe sur l'âge. Elle throw
  // plutôt que de rendre un verdict sur une date inventée.
  assertThrows(() => assessBirthDate("1990-01-01", "pas une date"));
  assertThrows(() => assessBirthDate("1990-01-01", ""));
});

Deno.test("weekPlanAgeGate: la ceinture mord SEULEMENT sur un mineur", () => {
  const minor = weekPlanAgeGate(assessBirthDate("2014-01-01", TODAY));
  assertEquals(minor.allowed, false);
  assertEquals(minor.reason, "minor");
  assertEquals(minor.age, 12);
});

Deno.test("weekPlanAgeGate: DÉSARMEMENT — une date absente ne bloque personne", () => {
  // LE test du lot. Tous les élèves d'avant ce chantier sont dans ce cas: la
  // colonne existait, personne ne la leur a jamais demandée. Une ceinture qui
  // mord ici est une panne de service déguisée en protection de l'enfance.
  const gate = weekPlanAgeGate(assessBirthDate(null, TODAY));
  assertEquals(gate.allowed, true);
  assertEquals(gate.reason, "unknown_birth_date");
  assertEquals(gate.age, null);
});

Deno.test("weekPlanAgeGate: une date inexploitable ne bloque pas non plus", () => {
  // Elle est refusée à l'ÉCRITURE (`birthDateWritable`). Si elle est quand même
  // en base — import, écriture antérieure à ce module — elle vaut « on ne sait
  // pas », pas « c'est un enfant ».
  for (const raw of ["1900-01-01", "2026-08-05", "n'importe quoi"]) {
    const gate = weekPlanAgeGate(assessBirthDate(raw, TODAY));
    assertEquals(gate.allowed, true, raw);
    assertEquals(gate.reason, "unusable_birth_date", raw);
  }
});

Deno.test("weekPlanAgeGate: CONTRE-FACTUEL — le même élève, un jour plus tard", () => {
  // La veille de ses 18 ans: bloqué. Le jour même: passe. Rien d'autre n'a
  // changé, ce qui est la seule façon de prouver que c'est bien l'âge qui décide.
  const dob = "2008-08-04";
  assertEquals(weekPlanAgeGate(assessBirthDate(dob, "2026-08-03")).allowed, false);
  assertEquals(weekPlanAgeGate(assessBirthDate(dob, "2026-08-04")).allowed, true);
});

Deno.test("birthDateWritable: on refuse d'enregistrer ce qui est faux, jamais un mineur", () => {
  assertEquals(birthDateWritable(assessBirthDate("2014-01-01", TODAY)).ok, true, "un mineur s'enregistre");
  assertEquals(birthDateWritable(assessBirthDate("1990-01-01", TODAY)).ok, true);
  assertEquals(birthDateWritable(assessBirthDate(null, TODAY)).ok, true, "l'absence n'est pas une faute");

  const future = birthDateWritable(assessBirthDate("2026-08-05", TODAY));
  assertEquals(future.ok, false);
  assert(!future.ok && future.reason === "future");

  const old = birthDateWritable(assessBirthDate("1900-01-01", TODAY));
  assert(!old.ok && old.reason === "implausible");

  const junk = birthDateWritable(assessBirthDate("04/08/1990", TODAY));
  assert(!junk.ok && junk.reason === "unreadable");
});

Deno.test("usableAge: un âge, ou rien — jamais un nombre inventé", () => {
  assertEquals(usableAge(assessBirthDate("1990-08-04", TODAY)), 36);
  assertEquals(usableAge(assessBirthDate("2014-01-01", TODAY)), 12);
  assertEquals(usableAge(assessBirthDate(null, TODAY)), null);
  assertEquals(usableAge(assessBirthDate("1900-01-01", TODAY)), null);
});

Deno.test("ageBandOf: des bandes, pas un nombre", () => {
  assertEquals(ageBandOf(18), "18_29");
  assertEquals(ageBandOf(29), "18_29");
  assertEquals(ageBandOf(30), "30_44");
  assertEquals(ageBandOf(44), "30_44");
  assertEquals(ageBandOf(45), "45_59");
  assertEquals(ageBandOf(59), "45_59");
  assertEquals(ageBandOf(60), "60_plus");
  assertEquals(ageBandOf(95), "60_plus");
});

Deno.test("ageBandOf: pas de bande pour un âge inconnu ou mineur", () => {
  assertEquals(ageBandOf(null), null);
  // Un mineur ne reçoit pas de bande parce qu'il ne reçoit pas de plan: une
  // bande « mineur » passée au modèle serait une invitation à composer quand
  // même.
  assertEquals(ageBandOf(12), null);
  assertEquals(ageBandOf(17), null);
  assertEquals(ageBandOf(Number.NaN), null);
});
