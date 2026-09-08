// ═══════════════════════════════════════════════════════════════════════════
// LOT B.7 — CE QUE LA PERSONNE PENSE DE LA FOURCHETTE
//
// ── CE QUE CES TESTS TIENNENT, PAR ORDRE DE CE QU'IL EN COÛTE DE LE PERDRE ──
//
//   * LE GESTE NE DÉPLACE AUCUN CHIFFRE. C'est la propriété qui justifie
//     l'existence de ce lot après le désarmement de la correction: on apprend
//     de quel côté l'estimation se trompe, on ne la réécrit pas. La perdre,
//     c'est rouvrir par un autre nom la lane qu'on vient de fermer.
//   * LES TROIS VERDICTS SONT DISTINCTS À L'ACCUSÉ. Trois boutons qui rendent
//     la même phrase sont trois boutons dont deux ne servent à rien — et
//     personne ne s'en apercevrait, puisque l'écriture, elle, est correcte.
//   * PAS DE DÉCLARATION SANS CHIFFRE. Les quatre portes de `energy_gate`
//     effacent l'estimation à l'ingestion. Calibrer une fourchette que
//     personne n'a vue fausserait la seule mesure que ce geste sert.
//   * `written` DÉCIDE DE L'ACCUSÉ. Un « c'est noté » sur une écriture ratée
//     est indétectable par la personne: rien à l'écran ne dirait que sa
//     déclaration s'est perdue.
// ═══════════════════════════════════════════════════════════════════════════

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  ENERGY_BAND_COPY_PACKS,
  ENERGY_BAND_TOKEN_PREFIX,
  ENERGY_BAND_VERDICTS,
  energyBandButtons,
  energyBandToken,
  parseEnergyBandToken,
  renderEnergyBandAck,
} from "./energy_band_feedback.ts";
import {
  ENERGY_BAND_FEEDBACK_KEY,
  writeEnergyBandFeedback,
} from "./energy_band_feedback_io.ts";
import { ENERGY_FIX_TOKEN_PREFIX } from "./energy_correction.ts";

const EVENT = "11111111-2222-4333-8444-555555555555";
const USER = "99999999-8888-4777-8666-555555555555";
const NOW = new Date("2026-09-08T18:00:00.000Z");

// ---------------------------------------------------------------------------
// LE JETON
// ---------------------------------------------------------------------------

Deno.test("le jeton porte le verdict ET la ligne visée", () => {
  for (const v of ENERGY_BAND_VERDICTS) {
    const id = energyBandToken(v, EVENT);
    assert(id.startsWith(ENERGY_BAND_TOKEN_PREFIX));
    assertEquals(parseEnergyBandToken(id), { verdict: v, eventId: EVENT });
  }
});

Deno.test("⛔ IL NE PARTAGE AUCUN PRÉFIXE AVEC LA CORRECTION DÉSARMÉE", () => {
  // `KEEL_KCAL_` est désarmé mais TOUJOURS LISTÉ — des bulles en portent
  // encore. Un vocabulaire qui le contiendrait ferait répondre deux lecteurs au
  // même tap, et le premier gagnerait en silence. C'est le piège `KEEL_WE` que
  // `weigh_in.ts` documente, transposé.
  assert(!ENERGY_BAND_TOKEN_PREFIX.startsWith(ENERGY_FIX_TOKEN_PREFIX));
  assert(!ENERGY_FIX_TOKEN_PREFIX.startsWith(ENERGY_BAND_TOKEN_PREFIX));
});

Deno.test("le lecteur rend `null` sur tout ce qui n'est pas à lui", () => {
  for (
    const bad of [
      "",
      "KEEL_BANDFB_",
      `KEEL_BANDFB_about|${EVENT}|extra`,
      "KEEL_BANDFB_about|not-a-uuid",
      `KEEL_BANDFB_maybe|${EVENT}`,
      `KEEL_KCAL_${EVENT}`,
      `KEEL_SLOTMEAL_photo|2026-09-08|lunch`,
    ]
  ) {
    assertEquals(parseEnergyBandToken(bad), null, bad);
  }
});

Deno.test("un verdict inconnu ne se fabrique pas non plus", () => {
  assertThrows(() => energyBandToken("about", "pas-un-uuid"));
});

// ---------------------------------------------------------------------------
// LES MOTS
// ---------------------------------------------------------------------------

Deno.test("trois boutons, dans l'ordre, et `about` en premier", () => {
  for (const locale of ["en-US", "fr-FR"]) {
    const b = energyBandButtons({ locale, eventId: EVENT });
    assertEquals(b.length, 3);
    assertEquals(
      b.map((x) => parseEnergyBandToken(x.payload)?.verdict),
      ["about", "more", "less"],
      // Poser un désaccord en premier suggère que le chiffre est douteux avant
      // même qu'on l'ait lu.
      `${locale}: l'ordre place un désaccord avant l'accord`,
    );
    for (const x of b) assert(x.label.trim() !== "", locale);
  }
});

Deno.test("⛔ AUCUN CHIFFRE DANS LES TROIS ACCUSÉS", () => {
  // Demander « combien ? » rouvrirait la correction par un autre nom. Et un
  // accusé qui rendrait un nombre laisserait croire que la déclaration a
  // déplacé l'estimation.
  for (const locale of ["en-US", "fr-FR"]) {
    for (const v of ENERGY_BAND_VERDICTS) {
      const text = renderEnergyBandAck({ locale, verdict: v, written: true });
      assertEquals(/\d/.test(text), false, `${locale}/${v}: ${text}`);
    }
  }
});

Deno.test("les trois verdicts rendent trois accusés DISTINCTS", () => {
  // Trois boutons qui rendent la même phrase sont trois boutons dont deux ne
  // servent à rien — et personne ne s'en apercevrait, puisque l'écriture est
  // correcte.
  for (const locale of ["en-US", "fr-FR"]) {
    const said = ENERGY_BAND_VERDICTS.map((v) =>
      renderEnergyBandAck({ locale, verdict: v, written: true })
    );
    assertEquals(new Set(said).size, 3, locale);
  }
});

Deno.test("une écriture ratée ne prétend RIEN, dans les deux langues", () => {
  for (const locale of ["en-US", "fr-FR"]) {
    for (const v of ENERGY_BAND_VERDICTS) {
      const ko = renderEnergyBandAck({ locale, verdict: v, written: false });
      const ok = renderEnergyBandAck({ locale, verdict: v, written: true });
      assert(ko !== ok, `${locale}/${v}`);
      // ⛔ ET IL DIT QUE RIEN D'AUTRE N'A BOUGÉ. Sans cette moitié, quelqu'un
      // pourrait croire que son repas lui-même s'est perdu.
      assert(
        locale.startsWith("fr")
          ? ko.includes("déjà noté")
          : ko.includes("already logged"),
        ko,
      );
    }
  }
});

Deno.test("les deux packs portent les mêmes clés", () => {
  const en = Object.keys(ENERGY_BAND_COPY_PACKS.en).sort();
  const fr = Object.keys(ENERGY_BAND_COPY_PACKS.fr).sort();
  assertEquals(en, fr);
});

// ---------------------------------------------------------------------------
// L'ÉCRITURE — ET CE QU'ELLE NE TOUCHE PAS
// ---------------------------------------------------------------------------

interface Row {
  recognized: Record<string, unknown> | null;
}

function stubDb(row: Row | null, opts: { failWrite?: boolean } = {}) {
  const writes: Record<string, unknown>[] = [];
  // deno-lint-ignore no-explicit-any
  const api: any = {
    from: () => api,
    select: () => api,
    eq: () => api,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
    update(payload: Record<string, unknown>) {
      writes.push(payload);
      // deno-lint-ignore no-explicit-any
      const after: any = {
        eq: () => after,
        select: () => after,
        maybeSingle: () =>
          Promise.resolve(
            opts.failWrite
              ? { data: null, error: null }
              : { data: { id: EVENT }, error: null },
          ),
      };
      return after;
    },
  };
  return { api, writes };
}

Deno.test("⛔ LA DÉCLARATION NE DÉPLACE NI LE CHIFFRE NI SA BASE", () => {
  // C'est la propriété qui justifie ce lot après le désarmement de la
  // correction. La perdre, c'est rouvrir par un autre nom la lane qu'on vient
  // de fermer.
  const estimate = { kcal: 620, basis: "photo_estimate", confidence_band: "low" };
  const { api, writes } = stubDb({
    recognized: { energy_estimate: estimate, detected_foods: ["oats"] },
  });
  return writeEnergyBandFeedback(api, {
    userId: USER,
    eventId: EVENT,
    verdict: "more",
    now: NOW,
  }).then((out) => {
    assertEquals(out, { ok: true, already: false });
    assertEquals(writes.length, 1);
    const written = writes[0].recognized as Record<string, unknown>;
    // Le chiffre et sa base, INTACTS — comparés à l'objet d'origine.
    assertEquals(written.energy_estimate, estimate);
    // Et tout le reste du sac est préservé par étalement.
    assertEquals(written.detected_foods, ["oats"]);
    assertEquals(written[ENERGY_BAND_FEEDBACK_KEY], {
      verdict: "more",
      at: NOW.toISOString(),
    });
  });
});

Deno.test("PAS DE DÉCLARATION SANS CHIFFRE", async () => {
  // Les quatre portes de `energy_gate` effacent l'estimation à l'ingestion.
  // Calibrer une fourchette que personne n'a vue fausserait la mesure.
  const { api, writes } = stubDb({ recognized: { detected_foods: ["oats"] } });
  assertEquals(
    await writeEnergyBandFeedback(api, {
      userId: USER,
      eventId: EVENT,
      verdict: "about",
      now: NOW,
    }),
    { ok: false, reason: "no_estimate" },
  );
  assertEquals(writes.length, 0);
});

Deno.test("une ligne absente rend `stale`, jamais un succès muet", async () => {
  const { api } = stubDb(null);
  assertEquals(
    await writeEnergyBandFeedback(api, {
      userId: USER,
      eventId: EVENT,
      verdict: "about",
      now: NOW,
    }),
    { ok: false, reason: "stale" },
  );
});

Deno.test("⛔ ZÉRO LIGNE MISE À JOUR N'EST PAS UN SUCCÈS", async () => {
  // Un `update` qui ne touche rien rend `204` sans erreur. Sans cette garde,
  // l'accusé dirait « c'est noté » sur une ligne que personne n'a écrite —
  // c'est la cicatrice `rls-is-not-a-substitute-for-eq-user-id`.
  const { api } = stubDb(
    { recognized: { energy_estimate: { kcal: 620, basis: "photo_estimate" } } },
    { failWrite: true },
  );
  assertEquals(
    await writeEnergyBandFeedback(api, {
      userId: USER,
      eventId: EVENT,
      verdict: "less",
      now: NOW,
    }),
    { ok: false, reason: "stale" },
  );
});

Deno.test("ré-appuyer le MÊME verdict n'écrit pas deux fois", async () => {
  const { api, writes } = stubDb({
    recognized: {
      energy_estimate: { kcal: 620, basis: "photo_estimate" },
      [ENERGY_BAND_FEEDBACK_KEY]: { verdict: "more", at: "2026-09-08T10:00:00.000Z" },
    },
  });
  assertEquals(
    await writeEnergyBandFeedback(api, {
      userId: USER,
      eventId: EVENT,
      verdict: "more",
      now: NOW,
    }),
    { ok: true, already: true },
  );
  assertEquals(writes.length, 0);
  // ⚠️ MAIS CHANGER D'AVIS S'ÉCRIT. Quelqu'un qui corrige son propre verdict
  // dit quelque chose de neuf, et le taire perdrait précisément l'information
  // la plus utile.
  const second = stubDb({
    recognized: {
      energy_estimate: { kcal: 620, basis: "photo_estimate" },
      [ENERGY_BAND_FEEDBACK_KEY]: { verdict: "more", at: "2026-09-08T10:00:00.000Z" },
    },
  });
  assertEquals(
    await writeEnergyBandFeedback(second.api, {
      userId: USER,
      eventId: EVENT,
      verdict: "less",
      now: NOW,
    }),
    { ok: true, already: false },
  );
  assertEquals(second.writes.length, 1);
});
