// La confirmation d'opt-out — le message le plus sensible du produit.
//
// LE DÉFAUT QUE CES TESTS FERMENT (observé en QA le 2026-08-03): la consigne de
// tour était en français et CITAIT la phrase à produire. Le modèle recopiait la
// citation telle quelle, donc un élève anglophone recevait « Sophia ne te
// contactera plus sur WhatsApp. You can pick this back up from the website. »
//
// Ce qu'on vérifie n'est pas une formulation — c'est la PROPRIÉTÉ qui a
// manqué: une consigne de tour décrit une intention, elle ne dicte pas une
// surface. Dès qu'une phrase de sortie est écrite entre guillemets, une langue
// est codée en dur sans que la revue le voie.

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import { handleStopOptOut } from "./handlers_optout.ts";

type Captured = {
  contextOverride: string;
  purpose: string;
  inboundText: string;
};

function harness() {
  const captured: Captured[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        updates.push(patch);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  };
  // deno-lint-ignore no-explicit-any
  const replyWithBrain = (args: any) => {
    captured.push({
      contextOverride: String(args.contextOverride ?? ""),
      purpose: String(args.purpose ?? ""),
      inboundText: String(args.inboundText ?? ""),
    });
    return Promise.resolve();
  };
  return { admin, replyWithBrain, captured, updates };
}

async function runStop(profileLocale: string | null) {
  const h = harness();
  await handleStopOptOut({
    admin: h.admin,
    userId: "u1",
    fromE164: "+447700900001",
    alreadyConfirmed: false,
    enabled: true,
    nowIso: "2026-08-03T16:00:00.000Z",
    replyWithBrain: h.replyWithBrain,
    requestId: "r1",
    replyToWaMessageId: "wamid.1",
    profileLocale,
  });
  return h;
}

Deno.test("the turn instruction does not hardcode a language", async () => {
  const h = await runStop("en-GB");
  assertEquals(h.captured.length, 1);
  const instruction = h.captured[0].contextOverride;

  // La phrase exacte qui partait en français chez un élève anglophone.
  assert(
    !instruction.includes("ne te contactera plus"),
    "la consigne ne doit plus citer la phrase de sortie",
  );
  // Aucune consigne en français: c'est le mécanisme, pas cette phrase-là.
  for (const marker of ["Confirme", "Explique", "CONSIGNE DE TOUR", "L'utilisateur"]) {
    assert(
      !instruction.includes(marker),
      `consigne encore en français: ${marker}`,
    );
  }
});

Deno.test("the instruction states intent, never a sentence to copy", async () => {
  const h = await runStop("en-GB");
  const instruction = h.captured[0].contextOverride;
  // Une phrase entre guillemets dans une consigne EST une copy codée en dur:
  // le modèle la recopie, et la langue de l'élève ne compte plus.
  assert(
    !/["“][A-Za-z].{15,}["”]/.test(instruction),
    `la consigne dicte une surface au lieu d'une intention: ${instruction}`,
  );
});

Deno.test("the response language travels with the instruction, last", async () => {
  const h = await runStop("en-GB");
  const instruction = h.captured[0].contextOverride;
  assertStringIncludes(instruction, "RESPONSE_LANGUAGE:");
  // EN DERNIER: la récence l'emporte chez les modèles, et ce dépôt a payé
  // l'oscillation de langue entre deux tours (CONTRACT R3).
  assert(
    instruction.trimEnd().endsWith(
      "slot keys, day tokens, units, or any machine-read identifier (R1).",
    ),
    "le bloc RESPONSE_LANGUAGE doit clore la consigne",
  );
});

Deno.test("the three facts the confirmation must carry are still required", async () => {
  const h = await runStop("en-GB");
  const instruction = h.captured[0].contextOverride.toLowerCase();
  // « Stable wording » devient une contrainte de CONTENU, pas de mots: on ne
  // messagera plus, on peut reprendre depuis le site, on n'argumente pas.
  assertStringIncludes(instruction, "not message them on whatsapp any more");
  assertStringIncludes(instruction, "website");
  assertStringIncludes(instruction, "do not argue");
  assertEquals(h.captured[0].purpose, "optout_confirmation_ai");
});

Deno.test("an already-confirmed opt-out sends nothing a second time", async () => {
  const h = harness();
  await handleStopOptOut({
    admin: h.admin,
    userId: "u1",
    fromE164: "+447700900001",
    alreadyConfirmed: true,
    enabled: true,
    nowIso: "2026-08-03T16:00:00.000Z",
    replyWithBrain: h.replyWithBrain,
    requestId: "r1",
    profileLocale: "en-GB",
  });
  assertEquals(h.captured.length, 0);
  assertEquals(h.updates.length, 0);
});

Deno.test("the opt-out is recorded even so", async () => {
  const h = await runStop(null);
  assertEquals(h.updates.length, 1);
  assert("whatsapp_optout_confirmed_at" in h.updates[0]);
});
