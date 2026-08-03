// PIVOT C4 — weekly_flow.ts.
//
// Ce que ces tests protègent:
//   * "le jeton ne porte pas d'identité" — propriété de SÉCURITÉ. Un user_id
//     dans un jeton qui fait l'aller-retour par un client est une écriture
//     dans le dossier d'autrui pour qui sait éditer une chaîne.
//   * "une valeur hors bornes est écartée, jamais ramenée au bord" — un 500 kg
//     ramené à 400 est une donnée fausse qui a l'air vraie.
//   * "aucun formulaire de mesures corporelles pendant une crise".

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  buildWeeklyFlowToken,
  decideWeeklyFlow,
  parseWeeklyFlowResponse,
  parseWeeklyFlowToken,
  renderWeeklyFlowAck,
  WEEKLY_AXES,
  WEEKLY_SCALE_LABELS_EN,
  weeklyBiofeedbackPayload,
  weeklyFlowJson,
} from "./weekly_flow.ts";

// ---------------------------------------------------------------------------
// Le jeton
// ---------------------------------------------------------------------------

Deno.test("the flow token carries the week and NOTHING that identifies a student", () => {
  const token = buildWeeklyFlowToken("2026-08-03");
  assertEquals(parseWeeklyFlowToken(token), "2026-08-03");
  // La propriété tient par ce qui est ABSENT: pas d'uuid, pas de téléphone.
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}/i.test(token), "the token must not embed a uuid");
  assert(!/\+?\d{9,}/.test(token), "the token must not embed a phone number");
});

Deno.test("a foreign or malformed token is not ours", () => {
  for (const bad of ["", null, undefined, "KEEL_PULSE_GOOD", "KEEL_WEEKLY_", "KEEL_WEEKLY_lundi"]) {
    assertEquals(parseWeeklyFlowToken(bad), null, String(bad));
  }
});

// ---------------------------------------------------------------------------
// Lire la réponse
// ---------------------------------------------------------------------------

const FULL = JSON.stringify({
  energy: "4",
  hunger: "3",
  sleep: "2",
  digestion: "5",
  mood: "4",
  training: "3",
  weight_kg: "78.4",
  waist_cm: "86",
});

Deno.test("a complete answer is read whole", () => {
  const r = parseWeeklyFlowResponse(FULL);
  assertEquals(r.biofeedback, {
    energy: 4, hunger: 3, sleep: 2, digestion: 5, mood: 4, training: 3,
  });
  assertEquals(r.weightKg, 78.4);
  assertEquals(r.waistCm, 86);
  assertEquals(r.issues, []);
});

Deno.test("the decimal COMMA works — half of Europe types it", () => {
  const r = parseWeeklyFlowResponse(JSON.stringify({ weight_kg: "78,4" }));
  assertEquals(r.weightKg, 78.4);
});

Deno.test("an out-of-range value is dropped and NAMED, never clamped", () => {
  // 500 ramené à 400 est une donnée fausse qui a l'air vraie, et elle
  // contaminerait la moyenne 7 jours que /app/progress affiche.
  const r = parseWeeklyFlowResponse(JSON.stringify({ weight_kg: "500", energy: "9" }));
  assertEquals(r.weightKg, null);
  assertEquals(r.biofeedback.energy, undefined);
  assert(r.issues.some((i) => i.includes("weight_kg") && i.includes("500")));
  assert(r.issues.some((i) => i.includes("energy")));
});

Deno.test("skipping the numbers still records the week", () => {
  // La mesure de vivabilité ne doit jamais être l'otage d'une balance.
  const r = parseWeeklyFlowResponse(JSON.stringify({
    energy: "3", hunger: "3", sleep: "3", digestion: "3", mood: "3", training: "3",
    weight_kg: "", waist_cm: "",
  }));
  assertEquals(Object.keys(r.biofeedback).length, 6);
  assertEquals(r.weightKg, null);
  assertEquals(r.waistCm, null);
  // Vide n'est pas une anomalie: c'est un choix que ce produit respecte.
  assertEquals(r.issues, []);
});

Deno.test("garbage in response_json degrades without throwing", () => {
  for (const bad of ["not json", "[]", "null", '"a string"']) {
    const r = parseWeeklyFlowResponse(bad);
    assertEquals(r.biofeedback, {});
    assert(r.issues.length > 0, bad);
  }
});

Deno.test("the payload keeps weight WITH the axes, in one place", () => {
  const r = parseWeeklyFlowResponse(FULL);
  const payload = weeklyBiofeedbackPayload(r);
  assertEquals(payload.energy, 4);
  assertEquals(payload.weight_kg, 78.4);
  assertEquals(payload.source, "whatsapp_flow");
});

// ---------------------------------------------------------------------------
// Décider l'envoi
// ---------------------------------------------------------------------------

const SENDABLE = {
  localDow: 0,
  localHour: 19,
  answeredThisWeek: false,
  safetyBand: null,
  restrictionFlagged: false,
  hasActivePlan: true,
  flowId: "1234567890",
};

Deno.test("Sunday evening, plan adopted, not yet answered -> send", () => {
  assertEquals(decideWeeklyFlow(SENDABLE), { decision: "send" });
});

Deno.test("NO body-measurement form during a safety episode", () => {
  // La garde la plus importante des six. Le poids est la métrique la plus
  // associée aux troubles alimentaires; le demander au mauvais moment fait un
  // dégât qu'aucune donnée ne justifie.
  for (const band of ["low", "medium", "high", "critical"] as const) {
    assertEquals(
      decideWeeklyFlow({ ...SENDABLE, safetyBand: band }),
      { decision: "skip", reason: "safety_active" },
      band,
    );
  }
});

Deno.test("NO weight question to a student under the eating-disorder floor", () => {
  // /app/progress masque déjà TOUS les chiffres à cet élève (doctrine W3.2).
  // Le lui demander par WhatsApp pendant qu'un écran refuse de le lui montrer
  // serait une incohérence qui fait du dégât.
  assertEquals(
    decideWeeklyFlow({ ...SENDABLE, restrictionFlagged: true }),
    { decision: "skip", reason: "restriction_flagged" },
  );
});

Deno.test("opt-out outranks everything, including safety", () => {
  assertEquals(
    decideWeeklyFlow({ ...SENDABLE, optedOut: true, safetyBand: "high" }),
    { decision: "skip", reason: "opted_out" },
  );
});

Deno.test("no published Flow -> silence, never a broken message", () => {
  assertEquals(
    decideWeeklyFlow({ ...SENDABLE, flowId: null }),
    { decision: "skip", reason: "flow_not_configured" },
  );
  assertEquals(
    decideWeeklyFlow({ ...SENDABLE, flowId: "   " }),
    { decision: "skip", reason: "flow_not_configured" },
  );
});

Deno.test("one check-in per week", () => {
  assertEquals(
    decideWeeklyFlow({ ...SENDABLE, answeredThisWeek: true }),
    { decision: "skip", reason: "already_answered_this_week" },
  );
});

Deno.test("any day but Sunday, or any hour outside 18-21 local, is not now", () => {
  for (const dow of [1, 2, 3, 4, 5, 6]) {
    assertEquals(
      decideWeeklyFlow({ ...SENDABLE, localDow: dow }),
      { decision: "skip", reason: "outside_window" },
      `dow ${dow}`,
    );
  }
  for (const hour of [8, 17, 21, 23]) {
    assertEquals(
      decideWeeklyFlow({ ...SENDABLE, localHour: hour }),
      { decision: "skip", reason: "outside_window" },
      `hour ${hour}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Le formulaire et le parseur ne peuvent pas diverger
// ---------------------------------------------------------------------------

Deno.test("every axis the form asks for is an axis the parser reads", () => {
  // Le formulaire est publié CHEZ META et le parseur vit ici: rien ne les tient
  // ensemble au déploiement. Ce test est la seule chose qui les empêche de
  // dériver l'un de l'autre.
  const json = JSON.stringify(weeklyFlowJson());
  for (const axis of WEEKLY_AXES) {
    assert(json.includes(`"name":"${axis}"`), `${axis} missing from the form`);
  }
});

Deno.test("the form offers exactly the 1-5 scale the parser accepts", () => {
  const json = weeklyFlowJson();
  const screen = (json.screens as Array<Record<string, unknown>>)[0];
  const form = ((screen.layout as Record<string, unknown>).children as Array<
    Record<string, unknown>
  >)[1];
  const first = (form.children as Array<Record<string, unknown>>)[0];
  const options = first["data-source"] as Array<{ id: string }>;
  assertEquals(options.map((o) => o.id), Object.keys(WEEKLY_SCALE_LABELS_EN));
});

Deno.test("the ack returns no number to the student", () => {
  const r = parseWeeklyFlowResponse(FULL);
  const ack = renderWeeklyFlowAck(r);
  // Renvoyer « -0,4 kg cette semaine » ferait de ce formulaire une pesée
  // commentée — exactement l'usage que /app/progress évite.
  assert(!/\d/.test(ack), ack);
});
