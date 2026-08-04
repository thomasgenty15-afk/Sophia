import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { detectMemorySignals } from "./signal_detection.ts";

const cases: Array<[string, keyof ReturnType<typeof detectMemorySignals>]> = [
  ["ok", "trivial"],
  ["d'accord", "trivial"],
  ["merci", "trivial"],
  ["ca marche", "trivial"],
  ["en fait ce n'etait pas Lina", "correction"],
  ["je me suis trompe sur la date", "correction"],
  ["non mais c'etait plutot lundi", "correction"],
  ["pas mon pere mais mon frere", "correction"],
  ["oublie ce que je viens de dire", "forget"],
  ["supprime cette memoire", "forget"],
  ["ne garde pas ca", "forget"],
  ["n'enregistre pas cette info", "forget"],
  ["j'ai envie de me tuer", "safety"],
  ["je suis en danger", "safety"],
  ["urgence violence chez moi", "safety"],
  ["j'en peux plus de vivre", "safety"],
  ["changement de sujet: le travail", "explicit_topic_switch"],
  ["rien a voir mais mon manager", "explicit_topic_switch"],
  ["revenons a ma routine", "explicit_topic_switch"],
  ["hier soir j'ai craque", "dated_reference"],
  ["ce matin j'ai marche", "dated_reference"],
  ["vendredi dernier c'etait dur", "dated_reference"],
  ["dans deux jours je le vois", "dated_reference"],
  ["j'ai rate ma routine", "action_related"],
  ["pas fait mon check-in", "action_related"],
  ["mon objectif de marche", "action_related"],
  ["rechute cannabis hier", "sensitive"],
  ["ma rupture me fait honte", "sensitive"],
  ["probleme d'argent avec ma famille", "sensitive"],
  ["tu te souviens de mes schemas?", "cross_topic_profile_query"],
  ["qu'est-ce que tu sais de moi globalement?", "cross_topic_profile_query"],
  ["je suis nul et incapable", "high_emotion"],
];

const correctionAndForgetCases: Array<
  [string, "correction" | "forget"]
> = [
  ["non c'est pas ca", "correction"],
  ["tu as mal compris", "correction"],
  ["corrige ca", "correction"],
  ["corrige cette info", "correction"],
  ["en fait ce n'etait pas Lina", "correction"],
  ["je me suis trompe sur la date", "correction"],
  ["non mais c'etait plutot lundi", "correction"],
  ["pas mon pere mais mon frere", "correction"],
  ["ce n'est plus vrai", "correction"],
  ["ce n'etait pas ca", "correction"],
  ["c'etait pas Tania", "correction"],
  ["plutot mardi, pas lundi", "correction"],
  ["oublie ca", "forget"],
  ["oublie cette info", "forget"],
  ["supprime cette info", "forget"],
  ["supprime cette memoire", "forget"],
  ["efface cette memoire", "forget"],
  ["retire ca", "forget"],
  ["ne retiens pas ca", "forget"],
  ["ne garde pas cette info", "forget"],
  ["ne memorise pas ca", "forget"],
  ["n'enregistre pas cette info", "forget"],
  ["delete this", "forget"],
  ["forget this", "forget"],
];

Deno.test("detectMemorySignals covers deterministic MVP phrases", () => {
  for (const [phrase, signal] of cases) {
    const detected = detectMemorySignals(phrase)[signal] as {
      detected: boolean;
    };
    assertEquals(detected.detected, true, `${signal} should match: ${phrase}`);
  }
});

Deno.test("detectMemorySignals covers correction/delete phrases for sprint 8", () => {
  for (const [phrase, signal] of correctionAndForgetCases) {
    const detected = detectMemorySignals(phrase)[signal];
    assertEquals(detected.detected, true, `${signal} should match: ${phrase}`);
    assertEquals(
      detectMemorySignals(phrase).retrieval_hints.includes("correction"),
      true,
      `correction hint should be present: ${phrase}`,
    );
  }
});

Deno.test("detectMemorySignals derives retrieval mode and hints", () => {
  assertEquals(
    detectMemorySignals("je suis en danger").retrieval_mode,
    "safety_first",
  );
  assertEquals(
    detectMemorySignals("tu te souviens de mes schemas?").retrieval_mode,
    "cross_topic_lookup",
  );
  assertEquals(
    detectMemorySignals("hier j'ai rate ma routine").retrieval_hints,
    ["dated_reference", "action_related"],
  );
  assertEquals(
    detectMemorySignals("en fait oublie ca").retrieval_hints,
    ["correction"],
  );
});

Deno.test("advice_seeking: demande de conseil détectée, message neutre non (P4-D, rose-hard16 R1-B03)", () => {
  const positive = detectMemorySignals(
    "coucou. bon là c'est vendredi et je rentre du boulot, t'aurais un conseil pour m'aider à bien la passer ?",
  );
  if (!positive.advice_seeking.detected) {
    throw new Error("advice_seeking attendu détecté sur une demande de conseil");
  }
  const paraphrase = detectMemorySignals(
    "comment je fais pour tenir ce soir sans craquer ?",
  );
  if (!paraphrase.advice_seeking.detected) {
    throw new Error("advice_seeking attendu détecté sur la paraphrase");
  }
  const negative = detectMemorySignals("ok merci, bonne soirée à toi aussi");
  if (negative.advice_seeking.detected) {
    throw new Error("advice_seeking ne doit pas se déclencher sur un ack");
  }
});
