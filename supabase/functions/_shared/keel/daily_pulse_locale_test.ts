// KEEL — LA LANGUE DU MESSAGE DU SOIR.
//
// ── CE QUE CETTE CEINTURE PROTÈGE ──────────────────────────────────────────
// `daily_pulse.ts` portait `PULSE_QUESTION_EN`, `PULSE_AXIS_QUESTION_EN`,
// `LEVEL_LABELS_EN` et `AXIS_LABELS_EN`. Le suffixe `_EN` était l'aveu: aucune
// jumelle `_FR` n'existait. Or l'appelant de production (`keel-daily-pulse-v1`)
// résolvait DÉJÀ une locale — il ne la passait qu'à la bande du soir et au
// récapitulatif. Un élève `fr-FR` recevait donc, tous les soirs, un fait
// français suivi de « How was today? » et de trois boutons anglais.
//
// ── POURQUOI CHAQUE ÉPREUVE EST BIDIRECTIONNELLE ───────────────────────────
// Une assertion sur le seul français reste VERTE devant un français codé en
// dur — c'est exactement le défaut qu'on retire. Chaque test vérifie donc les
// deux sens: `fr-FR` rend le pack français, ET `en-US` rend un texte qui ne
// porte aucun marqueur français tout en restant NON VIDE.

import { assert, assertEquals, assertNotEquals, assertThrows } from "jsr:@std/assert@1";
import {
  PULSE_AXES,
  PULSE_LEVELS,
  pulseAxisButtons,
  pulseAxisQuestion,
  pulseLevelButtonId,
  pulseLevelButtons,
  pulseQuestion,
  readPulseReply,
  renderPulseAck,
  renderPulseAxisQuestion,
  renderPulseMessage,
  renderPulseQuestion,
} from "./daily_pulse.ts";

/**
 * Les marqueurs qui ne peuvent PAS apparaître dans un fil anglais.
 *
 * Pas un détecteur de langue: une liste de chaînes que seul le pack français
 * produit. On cherche une fuite précise, pas à deviner une langue.
 */
const FRENCH_MARKERS = [
  "Ta journée",
  "Qu'est-ce qui",
  "Noté",
  "Énergie",
  "Sommeil",
  "Ça va",
];

function assertNoFrenchLeak(text: string, where: string): void {
  for (const marker of FRENCH_MARKERS) {
    assert(
      !text.includes(marker),
      `${where}: le marqueur français "${marker}" a fuité dans « ${text} »`,
    );
  }
}

// ---------------------------------------------------------------------------
// LES DEUX QUESTIONS
// ---------------------------------------------------------------------------

Deno.test("la question du soir suit la locale, dans les deux sens", () => {
  assertEquals(pulseQuestion("fr-FR"), "Ta journée ?");
  const en = pulseQuestion("en-US");
  assertEquals(en, "How was today?");
  assertNoFrenchLeak(en, "pulseQuestion(en-US)");
  assert(en.trim().length > 0);
  assertNotEquals(pulseQuestion("fr-FR"), pulseQuestion("en-US"));
});

Deno.test("la question d'axe suit la locale, dans les deux sens", () => {
  assertEquals(pulseAxisQuestion("fr-FR"), "Qu'est-ce qui a coincé ?");
  const en = pulseAxisQuestion("en-US");
  assertEquals(en, "What was hard?");
  assertNoFrenchLeak(en, "pulseAxisQuestion(en-US)");
});

Deno.test("les deux questions rendent AVEC leurs boutons, dans chaque langue", () => {
  // L'invariance « une question ne part jamais sans ses boutons » ne dépend pas
  // de la langue: `readPulseReply` ne lit que des identifiants, et une question
  // au clavier ne serait jamais mesurée. Un pack qui la casserait rendrait le
  // tap muet pour toute une langue.
  for (const locale of ["en-US", "fr-FR"]) {
    const level = renderPulseQuestion(locale);
    assertEquals(level.buttons.length, 3, locale);
    assert(level.body.trim().length > 0, locale);
    const axis = renderPulseAxisQuestion(locale);
    assertEquals(axis.buttons.length, 3, locale);
    assert(axis.body.trim().length > 0, locale);
  }
});

// ---------------------------------------------------------------------------
// LES BOUTONS — les libellés bougent, les IDENTIFIANTS jamais (R1)
// ---------------------------------------------------------------------------

Deno.test("les libellés se traduisent, les identifiants restent des jetons ASCII", () => {
  const en = pulseLevelButtons("en-US");
  const fr = pulseLevelButtons("fr-FR");
  assertEquals(en.map((b) => b.id), fr.map((b) => b.id));
  assertNotEquals(en.map((b) => b.title), fr.map((b) => b.title));
  for (const b of [...fr, ...pulseAxisButtons("fr-FR")]) {
    // R1: le payload voyage et revient. Un identifiant accentué serait un tap
    // que `readPulseReply` ne saurait plus lire.
    assert(/^[A-Z0-9_]+$/.test(b.id), `identifiant non ASCII: ${b.id}`);
    assertEquals(readPulseReply(b.id).kind === "none", false, b.id);
  }
});

Deno.test("le pack français tient le plafond de 20 caractères, comme l'anglais", () => {
  for (const locale of ["en-US", "fr-FR"]) {
    for (const b of [...pulseLevelButtons(locale), ...pulseAxisButtons(locale)]) {
      assert(b.title.length <= 20, `${locale} · ${b.title} (${b.title.length})`);
      assert(b.title.trim().length > 0, `${locale} · libellé vide`);
    }
  }
});

Deno.test("aucun libellé français ne fuit dans le jeu anglais", () => {
  for (const b of [...pulseLevelButtons("en-US"), ...pulseAxisButtons("en-US")]) {
    assertNoFrenchLeak(b.title, "boutons en-US");
  }
});

// ---------------------------------------------------------------------------
// LE MESSAGE ENTIER — l'endroit exact où la fuite se voyait
// ---------------------------------------------------------------------------

Deno.test("le message du soir français ne recolle pas la question anglaise", () => {
  // LE DÉFAUT, REPRODUIT: le fait et la bande arrivaient déjà en français
  // (`composeRecapBody` et `buildEveningStrip` reçoivent la locale), et la
  // question se collait en anglais entre eux. Un seul message, deux langues.
  const fr = renderPulseMessage({
    memory: null,
    recapBody: "Coché aujourd'hui : flocons d'avoine.",
    ask: true,
    strip: null,
    locale: "fr-FR",
  });
  assertEquals(
    fr.body,
    "Coché aujourd'hui : flocons d'avoine.\n\nTa journée ?",
  );
  assertEquals(fr.buttons.map((b) => b.title), ["Ça va", "Bof", "Dur"]);

  const en = renderPulseMessage({
    memory: null,
    recapBody: "Ticked off today: Oats.",
    ask: true,
    strip: null,
    locale: "en-US",
  });
  assertEquals(en.body, "Ticked off today: Oats.\n\nHow was today?");
  assertNoFrenchLeak(en.body, "renderPulseMessage(en-US)");
  for (const b of en.buttons) assertNoFrenchLeak(b.title, "boutons du message");
});

Deno.test("sans question, la locale ne change rien au corps — elle ne s'invite pas", () => {
  // Le fait du jour est rendu AILLEURS et arrive déjà traduit. Ce module ne
  // doit pas le retoucher: un pack qui préfixerait ou suffixerait le
  // récapitulatif écrirait par-dessus la voix du coach.
  const body = "Coché aujourd'hui : flocons d'avoine.";
  for (const locale of ["en-US", "fr-FR"]) {
    const out = renderPulseMessage({
      memory: null,
      recapBody: body,
      ask: false,
      strip: null,
      locale,
    });
    assertEquals(out.body, body);
    assertEquals(out.buttons.length, 0);
  }
});

// ---------------------------------------------------------------------------
// L'ACCUSÉ — celui qui part quand l'élève TAPE
// ---------------------------------------------------------------------------

Deno.test("l'accusé suit la locale et ne commente toujours rien", () => {
  const fr = [
    renderPulseAck("good", null, "fr-FR"),
    renderPulseAck("hard", "hunger", "fr-FR"),
    renderPulseAck("mixed", "sleep", "fr-FR"),
  ];
  const en = [
    renderPulseAck("good", null, "en-US"),
    renderPulseAck("hard", "hunger", "en-US"),
    renderPulseAck("mixed", "sleep", "en-US"),
  ];
  for (const ack of fr) {
    assert(ack.startsWith("Noté"), ack);
    assert(ack.length <= 20, ack);
  }
  for (const ack of en) {
    assertNoFrenchLeak(ack, "renderPulseAck(en-US)");
    assert(ack.trim().length > 0);
    assert(ack.length <= 20, ack);
    // La règle qui ne dépend d'aucune langue: on accuse le geste, on se tait.
    assert(!/courage|tomorrow|demain|bravo|dommage|better/i.test(ack), ack);
  }
  for (const ack of fr) {
    assert(!/courage|demain|bravo|dommage|essaie/i.test(ack), ack);
  }
});

// ---------------------------------------------------------------------------
// R7 — une langue non livrée JETTE, elle ne retombe pas en silence
// ---------------------------------------------------------------------------

Deno.test("R7 — une langue sans pack jette plutôt que de rendre un message mi-anglais", () => {
  // Le repli silencieux est ce que `localePackKey` existe pour interdire: un
  // message à moitié traduit se découvre chez un client, pas dans un test.
  // La dégradation légitime a lieu UNE fois, dans `clampToDeliveredLocale`,
  // en amont de la chaîne.
  assertThrows(() => pulseQuestion("de-DE"));
  assertThrows(() => pulseLevelButtons("de-DE"));
  assertThrows(() => renderPulseAck("good", null, "de-DE"));
  assertThrows(() =>
    renderPulseMessage({
      memory: null,
      recapBody: "x",
      ask: true,
      strip: null,
      locale: "de-DE",
    })
  );
});

// ---------------------------------------------------------------------------
// LA TOTALITÉ DES PACKS — une clé manquante ne doit pas rendre `undefined`
// ---------------------------------------------------------------------------

Deno.test("chaque niveau et chaque axe a un libellé dans CHAQUE pack", () => {
  for (const locale of ["en-US", "fr-FR"]) {
    const levels = pulseLevelButtons(locale);
    assertEquals(levels.length, PULSE_LEVELS.length, locale);
    const axes = pulseAxisButtons(locale);
    assertEquals(axes.length, PULSE_AXES.length, locale);
    for (const b of [...levels, ...axes]) {
      assertNotEquals(b.title, "undefined", `${locale} · ${b.id}`);
    }
    // L'ordre des identifiants est le contrat de lecture: il ne dépend pas du
    // pack, et un pack qui le réordonnerait ferait enregistrer « Dur » pour un
    // élève qui a tapé « Ça va ».
    assertEquals(
      levels.map((b) => b.id),
      PULSE_LEVELS.map((l) => pulseLevelButtonId(l)),
      locale,
    );
  }
});
