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
  WEEKLY_AXIS_LABELS_EN,
  WEEKLY_LABEL_MAX_CHARS,
  WEEKLY_SCALE_LABELS_EN,
  weeklyTemplateFlowComponents,
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

Deno.test("a malformed FIELD is never coerced into a plausible measurement", () => {
  // `String(["80"])` vaut "80": un tableau produisait un poids de 80 kg sorti
  // de nulle part, plausible et faux — le défaut exact que les bornes
  // existent pour empêcher, sur une forme que personne ne surveillait.
  const r = parseWeeklyFlowResponse(JSON.stringify({
    weight_kg: ["80"],
    waist_cm: { v: 86 },
    energy: ["3"],
    hunger: true,
    sleep: "3",
  }));
  assertEquals(r.weightKg, null);
  assertEquals(r.waistCm, null);
  assertEquals(r.biofeedback.energy, undefined);
  assertEquals(r.biofeedback.hunger, undefined);
  // Le reste de la réponse survit: une case cassée n'annule pas la semaine.
  assertEquals(r.biofeedback.sleep, 3);
  for (const field of ["weight_kg", "waist_cm", "energy", "hunger"]) {
    assert(r.issues.some((i) => i.startsWith(`${field}:`)), `${field} non nommé`);
  }
});

Deno.test("PRÉMISSE FAUSSE: chaînes et nombres restent lisibles", () => {
  // La ceinture de forme ne doit pas mordre sur ce que Meta envoie vraiment
  // (des chaînes), ni sur un nombre JSON si le formulaire venait à en émettre.
  const r = parseWeeklyFlowResponse(JSON.stringify({
    energy: "4", hunger: "3", sleep: 2, digestion: "3", mood: "3", training: "3",
    weight_kg: 78.4,
  }));
  assertEquals(r.biofeedback.energy, 4);
  assertEquals(r.biofeedback.sleep, 2);
  assertEquals(r.weightKg, 78.4);
  assertEquals(r.issues, []);
});

Deno.test("a MISSING axis is named as missing, never as an out-of-range zero", () => {
  // `Number("")` vaut 0: un axe absent ressortait « 0 is outside 1-5 », soit un
  // chiffre inventé dans le seul canal censé dire ce qui a été écarté. Le
  // formulaire déclare ces six champs `required`: leur absence signale un Flow
  // publié qui a divergé de ce fichier, et c'est CETTE information qui compte.
  const r = parseWeeklyFlowResponse(JSON.stringify({ energy: "4" }));
  assertEquals(r.biofeedback, { energy: 4 });
  for (const axis of ["hunger", "sleep", "digestion", "mood", "training"]) {
    assert(r.issues.includes(`${axis}: missing, dropped`), `${axis}: ${r.issues.join(" | ")}`);
  }
  assert(!r.issues.some((i) => i.includes("outside")), r.issues.join(" | "));
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
  askedThisWeek: false,
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

// ---------------------------------------------------------------------------
// Une QUESTION par semaine (le triple-envoi du dimanche soir)
// ---------------------------------------------------------------------------

Deno.test("asked once, silent student -> the 19:40 and 20:40 ticks stay quiet", () => {
  // Reproduit le défaut mesuré le 2026-08-03: la fenêtre est 18h-21h, le cron
  // passe à :40, et `answeredThisWeek` ne bouge pas tant que l'élève se tait.
  // Trois ticks produisaient trois envois réels — trois lignes
  // `whatsapp_outbound_messages` status='sent' pour un seul dimanche.
  for (const hour of [18, 19, 20]) {
    const first = decideWeeklyFlow({ ...SENDABLE, localHour: hour });
    assertEquals(first, { decision: "send" }, `tick ${hour}h, jamais demandé`);
    assertEquals(
      decideWeeklyFlow({ ...SENDABLE, localHour: hour, askedThisWeek: true }),
      { decision: "skip", reason: "already_asked_this_week" },
      `tick ${hour}h, déjà demandé`,
    );
  }
});

Deno.test("PRÉMISSE FAUSSE: the belt does not bite when nothing was asked", () => {
  // Règle 4 du socle QA: toute ceinture porte un test qui prouve qu'elle ne
  // mord PAS quand le problème n'existe pas. Sans lui, « plus aucun doublon »
  // est indiscernable de « plus aucun envoi ».
  assertEquals(decideWeeklyFlow({ ...SENDABLE, askedThisWeek: false }), {
    decision: "send",
  });
});

Deno.test("a student who ANSWERED outranks a student who was merely asked", () => {
  // L'ordre compte pour le compte-rendu: un dimanche où tout le monde a répondu
  // ne doit pas se lire « déjà demandé ».
  assertEquals(
    decideWeeklyFlow({ ...SENDABLE, answeredThisWeek: true, askedThisWeek: true }),
    { decision: "skip", reason: "already_answered_this_week" },
  );
});

Deno.test("the ask-belt never outranks a clinical guard", () => {
  // Une ceinture anti-doublon ne doit jamais devenir la raison rapportée à la
  // place d'un plancher TCA ou d'une crise: le compte-rendu servirait alors à
  // masquer le signal clinique.
  assertEquals(
    decideWeeklyFlow({ ...SENDABLE, askedThisWeek: true, restrictionFlagged: true }),
    { decision: "skip", reason: "restriction_flagged" },
  );
  assertEquals(
    decideWeeklyFlow({ ...SENDABLE, askedThisWeek: true, safetyBand: "high" }),
    { decision: "skip", reason: "safety_active" },
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

Deno.test("no axis label is long enough for Meta to truncate it", () => {
  // Meta ne refuse pas un label trop long, il le COUPE — en silence, et
  // seulement sur les petits écrans. Un « Energy through the d… » ne se voit
  // pas d'ici. La limite se tient donc au commit, pas à la publication.
  for (const axis of WEEKLY_AXES) {
    const label = WEEKLY_AXIS_LABELS_EN[axis];
    assert(
      label.length <= WEEKLY_LABEL_MAX_CHARS,
      `${axis}: "${label}" fait ${label.length} caractères, max ${WEEKLY_LABEL_MAX_CHARS}`,
    );
  }
});

Deno.test("the ack returns no number to the student", () => {
  const r = parseWeeklyFlowResponse(FULL);
  const ack = renderWeeklyFlowAck(r);
  // Renvoyer « -0,4 kg cette semaine » ferait de ce formulaire une pesée
  // commentée — exactement l'usage que /app/progress évite.
  assert(!/\d/.test(ack), ack);
});

// ---------------------------------------------------------------------------
// Le repli template hors fenêtre 24h
// ---------------------------------------------------------------------------

Deno.test("the template button carries the week token and NOTHING else", () => {
  // Même propriété de sécurité que le chemin natif, sur le chemin de repli.
  // Elle serait vide si le repli glissait un identifiant dans le jeton: le
  // jeton fait l'aller-retour par le client, et qui sait éditer une chaîne
  // écrirait dans le dossier d'autrui.
  const token = buildWeeklyFlowToken("2026-08-03");
  const components = weeklyTemplateFlowComponents(token) as Array<
    Record<string, unknown>
  >;
  assertEquals(components.length, 1);
  assertEquals(components[0].type, "button");
  assertEquals(components[0].sub_type, "flow");
  assertEquals(components[0].index, "0");

  const params = components[0].parameters as Array<Record<string, unknown>>;
  assertEquals(params.length, 1);
  assertEquals(params[0].type, "action");
  const action = params[0].action as Record<string, unknown>;
  assertEquals(Object.keys(action), ["flow_token"]);
  assertEquals(action.flow_token, token);
});

Deno.test("the fallback token is read back by the SAME parser as the native path", () => {
  // Un jeton que `parseWeeklyFlowToken` ne sait pas relire est un bilan reçu
  // et jeté: l'élève a rempli le formulaire, la semaine reste vide.
  const token = buildWeeklyFlowToken("2026-08-03");
  const components = weeklyTemplateFlowComponents(token) as Array<
    Record<string, unknown>
  >;
  const params = components[0].parameters as Array<Record<string, unknown>>;
  const action = params[0].action as Record<string, unknown>;
  assertEquals(parseWeeklyFlowToken(String(action.flow_token)), "2026-08-03");
});
