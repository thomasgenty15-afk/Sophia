import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { keelOutageTemplate, stripKeelAckWithoutCommittedEffect } from "./run.ts";
import { containsAcknowledgementClaim } from "../skills/_shared/keel_ack_without_effect_guard.ts";

const ACK = "C'est pris en compte ✅";
const FACT = "j'ai fait ma marche de 30 minutes";

function frameWithLane(committed: unknown[]) {
  return {
    turn_id: "turn-w8",
    user_id: "student-w8",
    direct_effect_lane: {
      requested_effects: [],
      allowed_effects: [],
      committed_effects: committed,
      blocked_effects: [],
    },
  } as never;
}

Deno.test("W8 adaptateur: LANE ABSENTE (le défaut mesuré) — le dispatcher n'a rien émis, l'accusé saute", () => {
  // C'est LE chemin où toute la famille ledger-first est muette:
  // `direct_effect_lane` n'existe pas, `buildDirectEffectConfirmationContext`
  // rendrait null, il n'y a rien à réconcilier — et le composeur accusait.
  const out = stripKeelAckWithoutCommittedEffect(
    ACK,
    { turn_id: "turn-w8", user_id: "student-w8" } as never,
    FACT,
    true,
  );
  assertEquals(containsAcknowledgementClaim(out), false);
  assertStringIncludes(out, "ta marche de 30 minutes");
});

Deno.test("W8 adaptateur: lane présente mais ZÉRO commit — l'accusé saute aussi", () => {
  const out = stripKeelAckWithoutCommittedEffect(
    ACK,
    frameWithLane([]),
    FACT,
    true,
  );
  assertEquals(containsAcknowledgementClaim(out), false);
});

Deno.test("W8 adaptateur: UN commit relu ⇒ désarmement, le rendu sort intact", () => {
  const out = stripKeelAckWithoutCommittedEffect(
    ACK,
    frameWithLane([{ type: "log_protocol_event", target_title: "Walk 30 min" }]),
    FACT,
    true,
  );
  assertEquals(out, ACK);
});

Deno.test("W8 adaptateur: hors élève KEEL, aucun tour n'est touché", () => {
  const out = stripKeelAckWithoutCommittedEffect(
    ACK,
    frameWithLane([]),
    FACT,
    false,
  );
  assertEquals(out, ACK);
});

Deno.test("W8 adaptateur: message vide ou rendu vide ⇒ no-op (fail-open)", () => {
  assertEquals(
    stripKeelAckWithoutCommittedEffect("", frameWithLane([]), FACT, true),
    "",
  );
  assertEquals(
    stripKeelAckWithoutCommittedEffect(ACK, frameWithLane([]), "", true),
    ACK,
  );
  assertEquals(
    stripKeelAckWithoutCommittedEffect(ACK, null, undefined, true),
    ACK,
  );
});

// ===========================================================================
// W12-V — LE TEXTE D'AVARIE PARLE LA LANGUE DE LA REPONSE
//
// Mesure du 27/07, run reel sur un `keel_role='student'` en-US avec une cle
// modele invalide : le seul texte visible du tour etait
// « J'ai un souci technique sur ce tour. » — du francais code EN DUR, sur le
// chemin le plus probable en demo (reseau, quota, cle). La langue vient
// desormais de `resolveResponseLocale`, source unique (R3).
// ===========================================================================

Deno.test("W12-V avarie: la sortie par defaut du pilote est en ANGLAIS", () => {
  const text = keelOutageTemplate();
  assertStringIncludes(text, "technical problem");
  assertEquals(/[\u00e9\u00e8\u00ea\u00e0\u00e7\u00f9]/.test(text), false, text);
  // Elle dit ce qui est VRAI : rien n'a ete ecrit. Meme contrat que la
  // ceinture accuse-fantome — une avarie n'accuse jamais reception.
  assertEquals(containsAcknowledgementClaim(text), false, text);
});

Deno.test("W12-V avarie: desarmement — une locale francaise rend la copie francaise", () => {
  // Condition de desarmement (doctrine P9) : la correction n'a pas SUPPRIME le
  // francais, elle l'a mis derriere la locale. Le jour ou le pilote rend la
  // chaine a `resolveResponseLocale`, cette branche redevient atteignable.
  assertStringIncludes(keelOutageTemplate("fr-FR"), "souci technique");
  assertStringIncludes(keelOutageTemplate("en-US"), "technical problem");
});
