import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  beginModelWait,
  endModelWait,
  markWorkPhase,
  modelWaitMs,
  peekWorkMs,
  startWorkClock,
  takeWorkTimeReport,
} from "./model_wait.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.test("une attente du modèle se compte, et seulement pendant qu'elle dure", async () => {
  const id = "req-simple";
  beginModelWait(id);
  await pause(40);
  endModelWait(id);
  const waited = modelWaitMs(id);
  assert(waited >= 35 && waited < 200, `attente mesurée ${waited} ms`);
  await pause(30);
  assertEquals(Math.round(modelWaitMs(id)), Math.round(waited), "le temps hors appel ne compte pas");
  takeWorkTimeReport(id);
});

// Le classement de la note court EN PARALLÈLE de la composition: deux appels
// qui se chevauchent ne doivent compter qu'une fois, sinon le « travail »
// (écoulé moins attente) deviendrait négatif.
Deno.test("deux appels qui se chevauchent ne comptent qu'une fois", async () => {
  const id = "req-overlap";
  beginModelWait(id);
  beginModelWait(id);
  await pause(40);
  endModelWait(id);
  await pause(40);
  endModelWait(id);
  const waited = modelWaitMs(id);
  assert(waited >= 70 && waited < 140, `attente mesurée ${waited} ms (attendu ~80, jamais ~120)`);
  takeWorkTimeReport(id);
});

Deno.test("le bilan découpe le travail aux marqueurs et retire l'attente", async () => {
  const id = "req-phases";
  startWorkClock(id, performance.now());
  await pause(20); // prep: travail
  markWorkPhase(id, "composing");
  beginModelWait(id);
  await pause(60); // attente du modèle: ne compte pas
  endModelWait(id);
  markWorkPhase(id, "checking");
  await pause(20); // travail
  const report = takeWorkTimeReport(id)!;
  assertEquals(report.phases.map((p) => p.stage), ["prep", "composing", "checking"]);
  assert(report.model_wait_ms >= 55, `attente ${report.model_wait_ms}`);
  assert(report.phases[1].work_ms < 20, `l'étape du modèle compte ${report.phases[1].work_ms} ms de travail`);
  assert(report.work_ms < report.total_ms - 50, "le travail exclut l'attente");
  assertEquals(takeWorkTimeReport(id), null, "le bilan oublie la requête");
});

// ⟳ 2026-09-25 — un worker tué par la limite CPU ne lit jamais son bilan de
// fin: la marque journalisée pendant la composition est son dernier chiffre.
Deno.test("peekWorkMs lit le travail dépensé sans clore le bilan", async () => {
  assertEquals(peekWorkMs("req-inconnue"), null, "une requête sans horloge n'a pas de chiffre");
  const id = "req-peek";
  startWorkClock(id, performance.now());
  await pause(20);
  beginModelWait(id);
  await pause(60); // attente du modèle: ne compte pas
  endModelWait(id);
  const peeked = peekWorkMs(id);
  assert(peeked !== null && peeked >= 15 && peeked < 55, `travail lu ${peeked} ms (attendu ~20, jamais ~80)`);
  const report = takeWorkTimeReport(id);
  assert(report !== null, "la lecture n'a pas consommé le bilan");
  assert(report.work_ms >= peeked, "le bilan de fin inclut ce qui avait été lu");
  assertEquals(peekWorkMs(id), null, "après le bilan, la requête est oubliée");
});
