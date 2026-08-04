import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  acknowledgementClaimSentenceIndexes,
  containsAcknowledgementClaim,
  detectCompletedFactReport,
  guardKeelAckWithoutCommittedEffect,
  keelAckGuardTriggerCount,
  keelUnboundReportClarifyQuestion,
  recordKeelAckGuardTrigger,
  resetKeelAckGuardTriggerCount,
} from "./keel_ack_without_effect_guard.ts";

// ===========================================================================
// 1. LE DÉTECTEUR DE FAIT ACCOMPLI — pur, EN + FR
// ===========================================================================

Deno.test("W8 détecteur: le défaut mesuré est reconnu comme fait accompli, avec l'objet cité", () => {
  const detection = detectCompletedFactReport(
    "j'ai fait ma marche de 30 minutes",
  );
  assertEquals(detection.reports_completed_fact, true);
  assertEquals(detection.reason_code, "completed_fact");
  assertEquals(detection.locale, "fr");
  // L'objet est CITÉ (pas reformulé), possessif retourné en 2e personne.
  assertEquals(detection.reported_object, "ta marche de 30 minutes");
});

Deno.test("W8 détecteur FR: passé composé, passé récent, locution accomplie, négation", () => {
  const positives: Array<[string, string | null]> = [
    ["j'ai mangé mes 3 œufs ce matin", "tes 3 œufs ce matin"],
    ["j'ai pris mon magnésium hier soir", "ton magnésium hier soir"],
    ["je viens de terminer ma séance", "ta séance"],
    ["j'ai bien dormi", null],
    ["c'est fait", null],
    ["je suis allé courir ce matin", "courir ce matin"],
    // Le fait NÉGATIF est un fait: il doit produire un `missed`, donc un
    // accusé sans écriture y est exactement aussi mensonger.
    ["j'ai pas fait ma marche aujourd'hui", "ta marche aujourd'hui"],
  ];
  for (const [message, expectedObject] of positives) {
    const detection = detectCompletedFactReport(message);
    assertEquals(
      detection.reports_completed_fact,
      true,
      `attendu fait accompli: ${message}`,
    );
    assertEquals(detection.locale, "fr", message);
    assertEquals(detection.reported_object, expectedObject, message);
  }
});

Deno.test("W8 détecteur EN: preterit, present perfect, négation", () => {
  const positives: Array<[string, string | null]> = [
    ["I did my 30-minute walk", "your 30-minute walk"],
    ["I ate 3 eggs this morning", "3 eggs this morning"],
    ["I took my magnesium", "your magnesium"],
    ["I've already finished the session", "the session"],
    ["I didn't do my walk today", "your walk today"],
    ["it's done", null],
  ];
  for (const [message, expectedObject] of positives) {
    const detection = detectCompletedFactReport(message);
    assertEquals(
      detection.reports_completed_fact,
      true,
      `attendu fait accompli: ${message}`,
    );
    assertEquals(detection.locale, "en", message);
    assertEquals(detection.reported_object, expectedObject, message);
  }
});

Deno.test("W8 détecteur: PRÉMISSE FAUSSE — une intention future n'est jamais un fait", () => {
  const futures = [
    "je vais faire ma marche ce soir",
    "je compte prendre mon magnésium après le dîner",
    "je le ferai demain",
    "on verra si ça tient",
    "I'll do my walk tonight",
    "I'm going to take my magnesium later",
    "we plan to start tomorrow",
  ];
  for (const message of futures) {
    const detection = detectCompletedFactReport(message);
    assertEquals(
      detection.reports_completed_fact,
      false,
      `ne doit PAS être un fait: ${message}`,
    );
    assertEquals(detection.reason_code, "future_intent", message);
  }
});

Deno.test("W8 détecteur: PRÉMISSE FAUSSE — une question n'est jamais un fait", () => {
  const questions = [
    "tu l'as noté ?",
    "est-ce que c'est enregistré ?",
    "tu peux vérifier mon suivi ?",
    "did you log my walk?",
    "is that recorded?",
    "what should I take at lunch?",
    "et pour le dîner ?",
  ];
  for (const message of questions) {
    const detection = detectCompletedFactReport(message);
    assertEquals(
      detection.reports_completed_fact,
      false,
      `ne doit PAS être un fait: ${message}`,
    );
    assertEquals(detection.reason_code, "question", message);
  }
});

Deno.test("W8 détecteur: la question de STATUT bat le marqueur de fait co-listé", () => {
  // Le tour dominant est une LECTURE. L'absence d'écriture y est la réponse,
  // pas un accusé fantôme — la famille readout/verify couvre ce cas.
  const detection = detectCompletedFactReport(
    "j'ai fait ma marche, tu l'as notée ?",
  );
  assertEquals(detection.reports_completed_fact, false);
  assertEquals(detection.reason_code, "question");
});

Deno.test("W8 détecteur: pas de faux positif sur les tours non-rapport", () => {
  const neutrals = [
    "j'ai une question sur les protéines",
    "j'ai un problème avec mon plan",
    "j'ai envie de sucre là",
    "I have a question about the plan",
    "I run every morning, what should I add?",
    "salut",
    "",
  ];
  for (const message of neutrals) {
    const detection = detectCompletedFactReport(message);
    assertEquals(
      detection.reports_completed_fact,
      false,
      `faux positif sur: ${message}`,
    );
  }
});

// ===========================================================================
// 2. LE DÉTECTEUR DE FORMULE D'ACCUSÉ — pur, EN + FR
// ===========================================================================

Deno.test("W8 accusé: les formules FR et EN sont reconnues, glyphe ✅ compris", () => {
  const acks = [
    "C'est pris en compte ✅",
    "Noté, ta marche est enregistrée.",
    "Noté.",
    "J'ai bien noté ton magnésium.",
    "Je note ça dans ton suivi.",
    "Ajouté à ton suivi.",
    "Ta séance est bien cochée.",
    "Recorded.",
    "I've logged your walk.",
    "That's logged.",
    "Marked as done.",
    "Taken into account.",
    "Checked it off.",
    "Got it.",
    "Got it, I logged that against your plan.",
  ];
  for (const text of acks) {
    assert(containsAcknowledgementClaim(text), `accusé non détecté: ${text}`);
  }
});

Deno.test("W8 accusé: l'écoute nue n'est pas un accusé", () => {
  const nonAcks = [
    "Got it, that makes sense — how did it feel?",
    "Tu as l'air fatigué, on en parle ?",
    "Ta ligne mouvement est prévue mercredi.",
    "That line is scheduled for Wednesday.",
    "Je n'ai rien écrit sur ce tour.",
  ];
  for (const text of nonAcks) {
    assertEquals(
      containsAcknowledgementClaim(text),
      false,
      `faux positif d'accusé: ${text}`,
    );
  }
});

Deno.test("W8 accusé: seules les phrases fautives sont indexées", () => {
  const indexes = acknowledgementClaimSentenceIndexes(
    "Bravo pour la régularité. C'est pris en compte ✅ Comment tu te sens ?",
  );
  // La phrase d'accusé est isolée; l'ouverture et la question restent.
  assertEquals(indexes.length, 1);
});

// ===========================================================================
// 3. LA CEINTURE — cas nominal (le défaut mesuré)
// ===========================================================================

Deno.test("W8 ceinture: le défaut mesuré est neutralisé et DÉGRADÉ en question de liage", () => {
  const result = guardKeelAckWithoutCommittedEffect({
    text: "Super, c'est pris en compte ✅ Continue comme ça !",
    userMessage: "j'ai fait ma marche de 30 minutes",
    isKeelStudent: true,
    committedEffectCount: 0,
  });
  assertEquals(result.triggered, true);
  assertEquals(result.reason_code, "ack_without_committed_effect");
  assertEquals(result.stripped_sentences, 1);
  // Plus aucune formule d'accusé dans le rendu final.
  assertEquals(containsAcknowledgementClaim(result.text), false);
  // Le dégradé est UTILE: il nomme le trou et cite l'objet rapporté.
  assertStringIncludes(result.text, "ta marche de 30 minutes");
  assertStringIncludes(result.text, "ligne de ton plan");
  // Ce qui n'était pas un accusé survit.
  assertStringIncludes(result.text, "Continue comme ça");
});

Deno.test("W8 ceinture: rendu 100% accusé ⇒ le dégradé remplace tout, jamais du silence", () => {
  const result = guardKeelAckWithoutCommittedEffect({
    text: "C'est noté ✅",
    userMessage: "j'ai pris mon magnésium",
    isKeelStudent: true,
    committedEffectCount: 0,
  });
  assertEquals(result.triggered, true);
  assert(result.text.trim().length > 0, "le dégradé ne peut pas être vide");
  assertEquals(containsAcknowledgementClaim(result.text), false);
  assertStringIncludes(result.text, "ton magnésium");
});

Deno.test("W8 ceinture: rendu EN sur message EN — la langue du dégradé suit le lexique qui a mordu", () => {
  const result = guardKeelAckWithoutCommittedEffect({
    text: "Nice work. Logged ✅",
    userMessage: "I did my 30-minute walk",
    isKeelStudent: true,
    committedEffectCount: 0,
  });
  assertEquals(result.triggered, true);
  assertStringIncludes(result.text, "your 30-minute walk");
  assertStringIncludes(result.text, "which line of your plan");
  assertEquals(containsAcknowledgementClaim(result.text), false);
});

Deno.test("W8 ceinture: IDEMPOTENCE — le dégradé ne se re-déclenche pas sur lui-même", () => {
  const first = guardKeelAckWithoutCommittedEffect({
    text: "C'est pris en compte ✅",
    userMessage: "j'ai fait ma marche de 30 minutes",
    isKeelStudent: true,
    committedEffectCount: 0,
  });
  assertEquals(first.triggered, true);
  const second = guardKeelAckWithoutCommittedEffect({
    text: first.text,
    userMessage: "j'ai fait ma marche de 30 minutes",
    isKeelStudent: true,
    committedEffectCount: 0,
  });
  assertEquals(second.triggered, false);
  assertEquals(second.reason_code, "disarmed_no_ack_claim");
  assertEquals(second.text, first.text);
});

// ===========================================================================
// 4. CONDITIONS DE DÉSARMEMENT (doctrine P9) — chacune avec son test
//    prémisse-fausse: le rendu SORT INTACT.
// ===========================================================================

Deno.test("W8 désarmement 3 (LE principal): un effet committé ⇒ l'accusé est VRAI, rien n'est touché", () => {
  const text = "C'est pris en compte ✅";
  const result = guardKeelAckWithoutCommittedEffect({
    text,
    userMessage: "j'ai fait ma marche de 30 minutes",
    isKeelStudent: true,
    committedEffectCount: 1,
  });
  assertEquals(result.triggered, false);
  assertEquals(result.reason_code, "disarmed_effect_committed");
  assertEquals(result.text, text);
});

Deno.test("W8 désarmement 4: intention future ⇒ ne rien écrire est CORRECT (protocol_events append-only)", () => {
  const text = "C'est noté ✅";
  const result = guardKeelAckWithoutCommittedEffect({
    text,
    userMessage: "je vais faire ma marche ce soir",
    isKeelStudent: true,
    committedEffectCount: 0,
  });
  assertEquals(result.triggered, false);
  assertEquals(result.reason_code, "disarmed_future_intent");
  assertEquals(result.text, text);
});

Deno.test("W8 désarmement 5: question ⇒ lecture, l'absence d'écriture EST la réponse", () => {
  const text = "Oui, c'est bien noté ✅";
  for (
    const message of [
      "tu l'as noté ?",
      "did you log my walk?",
      "j'ai fait ma marche, tu l'as notée ?",
    ]
  ) {
    const result = guardKeelAckWithoutCommittedEffect({
      text,
      userMessage: message,
      isKeelStudent: true,
      committedEffectCount: 0,
    });
    assertEquals(result.triggered, false, message);
    assertEquals(result.reason_code, "disarmed_question", message);
    assertEquals(result.text, text, message);
  }
});

Deno.test("W8 désarmement 1: hors élève KEEL, aucune ligne de protocole n'existe", () => {
  const text = "C'est pris en compte ✅";
  const result = guardKeelAckWithoutCommittedEffect({
    text,
    userMessage: "j'ai fait ma marche de 30 minutes",
    isKeelStudent: false,
    committedEffectCount: 0,
  });
  assertEquals(result.triggered, false);
  assertEquals(result.reason_code, "disarmed_not_keel_student");
  assertEquals(result.text, text);
});

Deno.test("W8 désarmement 2: tour de crise ⇒ zéro effet durable est le comportement CORRECT", () => {
  const text = "Je suis là avec toi. C'est noté ✅";
  const result = guardKeelAckWithoutCommittedEffect({
    text,
    userMessage: "j'ai pris mes médicaments",
    isKeelStudent: true,
    committedEffectCount: 0,
    isSafetyTurn: true,
  });
  assertEquals(result.triggered, false);
  assertEquals(result.reason_code, "disarmed_safety_turn");
  assertEquals(result.text, text);
});

Deno.test("W8 désarmement 2bis: plancher TCA ⇒ la question de liage serait de la pression d'adhérence", () => {
  const text = "Ce que tu me racontes compte. C'est noté ✅";
  const result = guardKeelAckWithoutCommittedEffect({
    text,
    userMessage: "j'ai mangé trois fois aujourd'hui",
    isKeelStudent: true,
    committedEffectCount: 0,
    isRestrictionFloorTurn: true,
  });
  assertEquals(result.triggered, false);
  assertEquals(result.reason_code, "disarmed_restriction_floor_turn");
  assertEquals(result.text, text);
});

Deno.test("W8 désarmement 6: pas de formule d'accusé ⇒ rien à retirer", () => {
  const text = "Comment tu te sens après ça ?";
  const result = guardKeelAckWithoutCommittedEffect({
    text,
    userMessage: "j'ai fait ma marche de 30 minutes",
    isKeelStudent: true,
    committedEffectCount: 0,
  });
  assertEquals(result.triggered, false);
  assertEquals(result.reason_code, "disarmed_no_ack_claim");
  assertEquals(result.text, text);
});

// ===========================================================================
// 5. PURETÉ + OBSERVABILITÉ
// ===========================================================================

Deno.test("W8 pureté: la garde ne mute rien; le compteur est explicite côté appelant", () => {
  resetKeelAckGuardTriggerCount();
  for (let i = 0; i < 3; i += 1) {
    guardKeelAckWithoutCommittedEffect({
      text: "C'est pris en compte ✅",
      userMessage: "j'ai fait ma marche",
      isKeelStudent: true,
      committedEffectCount: 0,
    });
  }
  // 3 déclenchements, ZÉRO incrément: la garde est pure.
  assertEquals(keelAckGuardTriggerCount(), 0);
  assertEquals(recordKeelAckGuardTrigger(), 1);
  assertEquals(recordKeelAckGuardTrigger(), 2);
  assertEquals(keelAckGuardTriggerCount(), 2);
  resetKeelAckGuardTriggerCount();
  assertEquals(keelAckGuardTriggerCount(), 0);
});

Deno.test("W8 dégradé: les 4 formes de prose de repli sont non vides et sans accusé", () => {
  const variants = [
    keelUnboundReportClarifyQuestion("fr", "ta marche de 30 min"),
    keelUnboundReportClarifyQuestion("fr", null),
    keelUnboundReportClarifyQuestion("en", "your 30-minute walk"),
    keelUnboundReportClarifyQuestion("en", null),
  ];
  for (const variant of variants) {
    assert(variant.trim().length > 20, variant);
    assertEquals(containsAcknowledgementClaim(variant), false, variant);
    // Le dégradé POSE UNE QUESTION: c'est ce qui ramène l'élève au liage.
    assert(variant.includes("?"), variant);
  }
});

// ===========================================================================
// W12-V — LE RENDU RESTE UNE CHAÎNE UTF-16 BIEN FORMÉE
//
// Défaut mesuré (vérification finale W12): le découpage en phrases utilisait
// une classe de caractères SANS drapeau `u`. `🟢` y entrait comme ses deux
// demi-surrogates, et `\uD83D` est aussi la moitié haute de 🙂 / 🎉 / 🙏. La
// coupe tombait DANS la paire: « Recorded 🙂 » sortait en
// `"\uDE42\n\nI couldn't tell…"` — mal formé, rendu « � » chez l'élève.
//
// La ceinture accusé-fantôme est le garde le plus exposé du produit et l'accusé
// terminé par un émoji est le style de composeur le plus courant: ce test est
// la condition de non-régression de la correction, pas une curiosité Unicode.
// ===========================================================================

Deno.test("W12-V: un accusé terminé par un émoji astral ne laisse aucun demi-surrogate", () => {
  const replies = [
    "Recorded 🙂",
    "Noté, ta marche est enregistrée 🙂",
    "I logged it 🎉🙂",
    "C'est bien noté 🙏",
    "That's logged ✅ Nice one.",
  ];
  for (const text of replies) {
    const result = guardKeelAckWithoutCommittedEffect({
      text,
      userMessage: "I did my 30 minute walk",
      isKeelStudent: true,
      committedEffectCount: 0,
    });
    assertEquals(result.triggered, true, text);
    // Le test de bonne formation, écrit sans `toWellFormed` pour ne pas
    // dépendre d'une version de runtime: aucun point de code du rendu ne doit
    // tomber dans la plage des surrogates (D800-DFFF). Un point de code y
    // tombe si et seulement si il est ORPHELIN — une paire valide est
    // itérée comme un seul point de code hors plage.
    const orphans = [...result.text]
      .map((c) => c.codePointAt(0) ?? 0)
      .filter((cp) => cp >= 0xd800 && cp <= 0xdfff);
    assertEquals(orphans, [], `lone surrogate(s) in the render of: ${text}`);
  }
});

Deno.test("W12-V: le glyphe de coche reste un terminateur, la phrase légitime survit", () => {
  // La condition de désarmement de la correction ci-dessus: passer en `u` ne
  // doit RIEN changer au comportement voulu du découpage.
  const result = guardKeelAckWithoutCommittedEffect({
    text: "That's logged ✅ Nice one.",
    userMessage: "I did my 30 minute walk",
    isKeelStudent: true,
    committedEffectCount: 0,
  });
  assertEquals(result.triggered, true);
  assertStringIncludes(result.text, "Nice one.");
  assertEquals(containsAcknowledgementClaim("That's logged ✅"), true);
});
