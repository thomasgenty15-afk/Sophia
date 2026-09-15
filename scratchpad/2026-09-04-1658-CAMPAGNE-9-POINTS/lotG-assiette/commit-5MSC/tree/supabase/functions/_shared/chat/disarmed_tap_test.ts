import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

import {
  armsQuestion,
  judgeTapFreshness,
  NEVER_DISARMED_PURPOSES,
} from "./disarmed_tap.ts";
import { judgeTap } from "./disarmed_tap_io.ts";

/**
 * FF-062 R13 — LE DERNIER MESSAGE TUE LE PRÉCÉDENT.
 *
 * ══ CE QUE CES ÉPREUVES TIENNENT ═════════════════════════════════════════
 *
 * · un tap venant du dernier message à boutons est honoré;
 * · un tap venant d'un message plus ancien est refusé, et le refus est NOMMÉ;
 * · un message proactif SANS boutons ne désarme RIEN — il ne remplace pas une
 *   question, il ne demande rien. C'est la seule nuance qui sépare cette règle
 *   de « le dernier message gagne »;
 * · les TRANSACTIONNELS sont hors règle;
 * · sans `reply_to`, on ne refuse pas: on ne sait pas d'où vient le tap, et
 *   refuser sur une ignorance ferait taire les clients anciens;
 * · une lecture en panne n'empêche personne de taper (fail-open).
 *
 * ⚠️ AUCUN ÉTAT N'EST ÉCRIT PAR CETTE RÈGLE. Le fait est déjà en base — l'ordre
 * des messages — et un drapeau dans `chat_messages.metadata` serait effaçable
 * par l'élève (`rls_chat_messages_update_own` + `GRANT ALL TO authenticated`).
 */

const OLD = "11111111-1111-4111-8111-111111111111";
const NEW = "22222222-2222-4222-8222-222222222222";

// ---------------------------------------------------------------------------
// LA DÉCISION, PURE
// ---------------------------------------------------------------------------

Deno.test("le tap du DERNIER message à boutons est honoré", () => {
  assertEquals(
    judgeTapFreshness({
      replyTo: NEW,
      latestArmedId: NEW,
      replyToPurpose: "keel_daily_pulse",
    }),
    { disarmed: false, reason: "current" },
  );
});

Deno.test("⛔ le tap d'un message REMPLACÉ est refusé, et le refus se nomme", () => {
  const verdict = judgeTapFreshness({
    replyTo: OLD,
    latestArmedId: NEW,
    replyToPurpose: "keel_daily_pulse",
  });
  assertEquals(verdict.disarmed, true);
  if (!verdict.disarmed) return;
  assertEquals(verdict.reason, "superseded");
  assertEquals(
    verdict.latestId,
    NEW,
    "le refus dit QUI l'a remplacé: sans ça, un taux de refus élevé est " +
      "illisible — trop court, ou trop de messages ?",
  );
});

Deno.test("sans `reply_to`, on n'invente rien: fail-open NOMMÉ", () => {
  // Un client ancien n'envoie pas `reply_to`. Refuser sur une ignorance le
  // ferait taire entièrement, et le motif distinct est ce qui permettra de
  // voir la bascule dans les journaux.
  assertEquals(
    judgeTapFreshness({
      replyTo: null,
      latestArmedId: NEW,
      replyToPurpose: null,
    }),
    { disarmed: false, reason: "no_reply_to" },
  );
  assertEquals(
    judgeTapFreshness({ replyTo: "   ", latestArmedId: NEW, replyToPurpose: null }),
    { disarmed: false, reason: "no_reply_to" },
  );
});

Deno.test("aucun message armé en base ⇒ rien à comparer, on honore", () => {
  assertEquals(
    judgeTapFreshness({
      replyTo: OLD,
      latestArmedId: null,
      replyToPurpose: null,
    }),
    { disarmed: false, reason: "no_armed_message" },
  );
});

Deno.test("les TRANSACTIONNELS sont hors règle", () => {
  // Une fin d'accès ne se fait pas remplacer par un bilan du soir.
  for (const purpose of NEVER_DISARMED_PURPOSES) {
    assertEquals(
      judgeTapFreshness({
        replyTo: OLD,
        latestArmedId: NEW,
        replyToPurpose: purpose,
      }),
      { disarmed: false, reason: "transactional" },
      `${purpose} ne doit jamais être désarmé`,
    );
  }
});

// ---------------------------------------------------------------------------
// LA LECTURE, contre une base doublée
// ---------------------------------------------------------------------------

function stubChat(rows: Array<Record<string, unknown>>, fail = false) {
  return {
    from: (_table: string) => {
      // deno-lint-ignore no-explicit-any
      const b: any = {};
      for (const m of ["select", "eq", "order", "limit"]) b[m] = () => b;
      const result = fail
        ? { data: null, error: { message: "boom" } }
        : { data: rows, error: null };
      // deno-lint-ignore no-explicit-any
      b.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
      return b;
    },
  };
}

/** Les lignes arrivent du plus RÉCENT au plus ancien (`created_at desc`). */
const armed = (id: string, purpose = "keel_daily_pulse") => ({
  id,
  metadata: { purpose, buttons: [{ payload: "KEEL_PULSE_X", label: "ok" }] },
});
const bare = (id: string, purpose = "keel_daily_pulse") => ({
  id,
  metadata: { purpose, buttons: [] },
});

Deno.test("⛔ UN PROACTIF SANS BOUTONS NE DÉSARME RIEN", () => {
  // LE CAS QUI SÉPARE CETTE RÈGLE DE « LE DERNIER MESSAGE GAGNE ».
  // Un fait du soir sans bande part après une question posée la veille. Il ne
  // la remplace pas: il ne demande rien. La désarmer fermerait une question à
  // laquelle la personne pouvait encore répondre, pour un message qui ne lui
  // demandait rien.
  return judgeTap(
    stubChat([bare("33333333-3333-4333-8333-333333333333"), armed(OLD)]) as never,
    { userId: "u", replyTo: OLD },
  ).then((verdict) => {
    assertEquals(verdict, { disarmed: false, reason: "current" });
  });
});

Deno.test("une question plus récente désarme la précédente", async () => {
  const verdict = await judgeTap(
    stubChat([armed(NEW), bare("x"), armed(OLD)]) as never,
    { userId: "u", replyTo: OLD },
  );
  assertEquals(verdict.disarmed, true);
  if (!verdict.disarmed) return;
  assertEquals(verdict.latestId, NEW);
});

Deno.test("une lecture en panne n'empêche personne de taper", async () => {
  // Le pire cas d'un fail-open est un tap tardif honoré — le comportement
  // d'avant cette règle. Le pire cas de l'inverse est un produit qui refuse
  // TOUS les taps parce que Postgres bégaye, ce qui est indiscernable d'une
  // panne totale du point de vue de la personne.
  const verdict = await judgeTap(stubChat([], true) as never, {
    userId: "u",
    replyTo: OLD,
  });
  assert(!verdict.disarmed);
});

Deno.test("un `reply_to` absent court-circuite avant toute lecture", async () => {
  // Aucune requête ne doit partir: c'est la moitié des taps tant que les
  // clients anciens n'ont pas tourné.
  let queried = false;
  const spy = {
    from: () => {
      queried = true;
      // deno-lint-ignore no-explicit-any
      const b: any = {};
      for (const m of ["select", "eq", "order", "limit"]) b[m] = () => b;
      // deno-lint-ignore no-explicit-any
      b.then = (res: any) => Promise.resolve({ data: [], error: null }).then(res);
      return b;
    },
  };
  const verdict = await judgeTap(spy as never, { userId: "u", replyTo: null });
  assertEquals(verdict, { disarmed: false, reason: "no_reply_to" });
  assert(!queried, "aucune lecture ne doit partir sans `reply_to`");
});

// ===========================================================================
// UN BOUTON QUI NAVIGUE N'ARME RIEN — 2026-09-04
//
// ── LE DÉFAUT QUE CETTE RÈGLE EMPÊCHE ─────────────────────────────────────
// La bulle « J'ai noté pour Tom : pas de poisson · Voir » ne demande rien: son
// bouton ouvre un écran dans le navigateur et n'atteint jamais le serveur. Sans
// cette règle, elle serait « le dernier message porteur de boutons » — donc
// elle DÉSARMERAIT la question posée juste avant, et la personne verrait
// « Léa / Zoé » en tapant dans le vide.
// ===========================================================================

Deno.test("une bulle qui ne porte QUE « Voir » n'arme pas de question", () => {
  assertEquals(
    armsQuestion([{ payload: "KEEL_VIEW_ABOUT_YOU|preferences" }]),
    false,
  );
});

Deno.test("une bulle SANS bouton n'arme rien non plus", () => {
  assertEquals(armsQuestion([]), false);
  assertEquals(armsQuestion(null), false);
  assertEquals(armsQuestion(undefined), false);
});

Deno.test("LE CAS QUI PASSE — une question, elle, arme", () => {
  // Sans lui, les refus ci-dessus seraient vrais d'une fonction qui rend
  // toujours `false`: plus rien ne désarmerait jamais rien, et un tap sur une
  // bulle de la semaine dernière écrirait.
  assertEquals(
    armsQuestion([
      { payload: "KEEL_MEMCLAR_PICK|aaaaaaaa-1111-4111-8111-111111111111|0" },
    ]),
    true,
  );
  assertEquals(armsQuestion([{ payload: "KEEL_FEEDBACK_x|cooked|yes" }]), true);
});

Deno.test("⛔ UNE QUESTION QUI PORTE AUSSI « Voir » ARME QUAND MÊME", () => {
  // La règle porte sur ce que la bulle DEMANDE, pas sur ce qu'elle contient.
  // Un « au moins un bouton qui n'est pas de navigation » — et non « aucun
  // bouton de navigation » — parce qu'une question peut légitimement offrir un
  // raccourci vers l'écran à côté de ses réponses.
  assertEquals(
    armsQuestion([
      { payload: "KEEL_MEMCLAR_NONE|aaaaaaaa-1111-4111-8111-111111111111" },
      { payload: "KEEL_VIEW_ABOUT_YOU|notes" },
    ]),
    true,
  );
});

Deno.test("une charge vide ne compte pas comme un bouton", () => {
  assertEquals(armsQuestion([{ payload: "" }, { payload: "   " }]), false);
});
