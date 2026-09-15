import { assert, assertEquals, assertThrows } from "jsr:@std/assert@^1.0.0";

import {
  correctEnergy,
  energyFixButton,
  ENERGY_FIX_TOKEN_PREFIX,
  energyFixToken,
  parseEnergyFixToken,
  renderEnergyFixAck,
} from "./energy_correction.ts";
import {
  ENERGY_BASIS_MARKERS,
  ENERGY_KCAL_MAX,
  ENERGY_KCAL_MIN,
} from "./meal_analysis.ts";
import { applyEnergyFix } from "./energy_correction_io.ts";

/**
 * FF-062 R11 — CORRIGER LE CHIFFRE LE FAIT CHANGER DE BASE.
 *
 * ══ CE QUE CES ÉPREUVES TIENNENT ═════════════════════════════════════════
 *
 * · la correction bascule la base `photo_estimate` → `declared_quantities`,
 *   et c'est TOUT l'objet du geste: sans ça, « modifier » est un champ de
 *   décoration;
 * · le chiffre corrigé PORTE SA BASE dans l'accusé (couche 4 de
 *   `CALORIE_REVERSAL`), et il ne prétend jamais venir d'une photo;
 * · ⛔ ON NE CRÉE JAMAIS un chiffre là où il n'y en avait pas — une ligne sans
 *   `energy_estimate` est une ligne dont la porte des quatre gardes était
 *   FERMÉE, et y écrire par ce chemin la contournerait avec un jeton que le
 *   client a forgé;
 * · le vide est un REFUS, pas une suppression;
 * · hors bornes = refusé et NOMMÉ, jamais ramené au bord.
 */

const USER = "44444444-4444-4444-8444-444444444444";
const EVENT = "77777777-7777-4777-8777-777777777777";

// ---------------------------------------------------------------------------
// LE JETON
// ---------------------------------------------------------------------------

Deno.test("⛔ LE JETON EST DISJOINT DES HUIT AUTRES", () => {
  assertEquals(energyFixToken(EVENT), `KEEL_KCAL_${EVENT}`);
  assertEquals(parseEnergyFixToken(`KEEL_KCAL_${EVENT}`), EVENT);
  for (
    const foreign of [
      "KEEL_WEIGHIN_2026-03-10",
      "KEEL_WEEKLY_2026-03-08",
      "KEEL_SLOTMEAL_photo|2026-03-10|lunch",
      "KEEL_PULSE_HARD",
      `KEEL_KCAL_${EVENT}-extra`,
      "KEEL_KCAL_",
      "KEEL_KCAL_pas-un-uuid",
      null,
    ]
  ) {
    assertEquals(parseEnergyFixToken(foreign), null, String(foreign));
  }
  assert(ENERGY_FIX_TOKEN_PREFIX.startsWith("KEEL_"));
});

Deno.test("un jeton ne se fabrique pas sur autre chose qu'un uuid", () => {
  // Il JETTE plutôt que de rendre `KEEL_KCAL_undefined`: un jeton qui ne se
  // reparse pas produit un formulaire que le serveur refuse APRÈS que la
  // personne l'a rempli.
  assertThrows(() => energyFixToken(""));
  assertThrows(() => energyFixToken("42"));
});

// ---------------------------------------------------------------------------
// LA BASCULE
// ---------------------------------------------------------------------------

Deno.test("⛔ CORRIGER FAIT BASCULER LA BASE — c'est TOUT l'objet de R11", () => {
  const out = correctEnergy("750");
  assert(out.ok);
  if (!out.ok) return;
  assertEquals(out.estimate, {
    kcal: 750,
    basis: "declared_quantities",
    confidence_band: "high",
  });
});

Deno.test("le chiffre s'arrondit, et la virgule décimale passe", () => {
  const a = correctEnergy("620,4");
  assert(a.ok);
  if (!a.ok) return;
  assertEquals(a.estimate.kcal, 620);
});

Deno.test("⛔ LE VIDE EST UN REFUS, PAS UNE SUPPRESSION", () => {
  // « Modifier » puis valider à blanc ne doit pas effacer l'estimation: la
  // personne a ouvert un champ, elle n'a pas demandé le silence.
  assertEquals(correctEnergy(""), { ok: false, reason: "empty" });
  assertEquals(correctEnergy("   "), { ok: false, reason: "empty" });
  assertEquals(correctEnergy(null), { ok: false, reason: "empty" });
});

Deno.test("hors bornes = refusé et NOMMÉ, jamais ramené au bord", () => {
  // Un 50 000 ramené à 5 000 produirait une donnée fausse qui a l'air vraie —
  // et elle remplacerait un chiffre qui, lui, était honnête sur son origine.
  for (const bad of ["0", "-200", "50000", `${ENERGY_KCAL_MAX + 1}`]) {
    const out = correctEnergy(bad);
    assertEquals(out.ok, false, bad);
    if (out.ok) return;
    assertEquals(out.reason, "out_of_range");
  }
  assertEquals(correctEnergy("beaucoup"), { ok: false, reason: "not_a_number" });
  // Les deux bornes elles-mêmes passent.
  assert(correctEnergy(String(ENERGY_KCAL_MIN)).ok);
  assert(correctEnergy(String(ENERGY_KCAL_MAX)).ok);
});

// ---------------------------------------------------------------------------
// LES MOTS
// ---------------------------------------------------------------------------

Deno.test("⛔ L'ACCUSÉ PORTE LE CHIFFRE **ET** SA BASE, dans les deux langues", () => {
  // Couche 4 de CALORIE_REVERSAL: tout rendu qui affiche un kcal affiche aussi
  // sa base. Un « 750 kcal, c'est noté » serait un chiffre nu.
  for (const locale of ["en-US", "fr-FR"]) {
    const pack = locale.startsWith("fr") ? "fr" : "en";
    const text = renderEnergyFixAck({
      locale,
      outcome: correctEnergy("750"),
    });
    assert(text.includes("750 kcal"), text);
    assert(
      text.includes(ENERGY_BASIS_MARKERS[pack].declared_quantities),
      `${locale}: le chiffre corrigé est nu — ${text}`,
    );
    // ⛔ ET IL NE PRÉTEND PLUS VENIR D'UNE PHOTO.
    assertEquals(
      text.includes(ENERGY_BASIS_MARKERS[pack].photo_estimate),
      false,
      text,
    );
  }
});

Deno.test("un refus DIT que le chiffre n'a pas bougé", () => {
  // Le pire accusé possible ici serait le silence: la personne a tapé un
  // nombre, elle doit savoir si sa correction a pris.
  for (const locale of ["en-US", "fr-FR"]) {
    for (
      const outcome of [
        { ok: false as const, reason: "empty" as const },
        { ok: false as const, reason: "not_a_number" as const },
        {
          ok: false as const,
          reason: "out_of_range" as const,
          min: ENERGY_KCAL_MIN,
          max: ENERGY_KCAL_MAX,
        },
        { ok: false as const, reason: "stale" as const },
        { ok: false as const, reason: "failed" as const },
      ]
    ) {
      const text = renderEnergyFixAck({ locale, outcome });
      assert(text.trim() !== "", `${locale}/${outcome.reason}`);
      // Un refus ne cite AUCUN chiffre de repas: il n'y a rien à rapporter.
      assertEquals(
        /\d+\s*kcal/i.test(text),
        outcome.reason === "out_of_range",
        `${locale}/${outcome.reason}: ${text}`,
      );
    }
  }
});

Deno.test("le bouton porte le jeton et un libellé dans chaque langue", () => {
  for (const locale of ["en-US", "fr-FR"]) {
    const b = energyFixButton({ locale, eventId: EVENT });
    assertEquals(parseEnergyFixToken(b.payload), EVENT);
    assert(b.label.trim() !== "");
  }
  assert(
    energyFixButton({ locale: "fr-FR", eventId: EVENT }).label !==
      energyFixButton({ locale: "en-US", eventId: EVENT }).label,
    "le libellé n'est pas traduit",
  );
});

// ---------------------------------------------------------------------------
// L'ÉCRITURE — contre une base doublée
// ---------------------------------------------------------------------------

function stubEvent(recognized: Record<string, unknown> | null) {
  const updates: Array<Record<string, unknown>> = [];
  const db = {
    from: (_t: string) => {
      // deno-lint-ignore no-explicit-any
      const b: any = {};
      for (const m of ["select", "eq"]) b[m] = () => b;
      b.update = (payload: Record<string, unknown>) => {
        updates.push(payload);
        return b;
      };
      b.maybeSingle = () =>
        Promise.resolve(
          updates.length > 0
            // Un UPDATE relu rend la ligne touchée.
            ? { data: { id: EVENT }, error: null }
            : { data: recognized === null ? null : { recognized }, error: null },
        );
      return b;
    },
  };
  return { db, updates };
}

Deno.test("⛔ ON NE CRÉE JAMAIS UN CHIFFRE QUE LA PORTE A FERMÉ", async () => {
  // LE CAS QUI COMPTE. Une ligne sans `energy_estimate` est une ligne dont les
  // quatre gardes étaient fermées à l'ingestion — plancher TCA, mineur, coach
  // qui ne compte pas, affichage éteint. Y écrire par ce chemin contournerait
  // la garde la plus sensible du produit, avec un jeton forgé par le client.
  const { db, updates } = stubEvent({ portion_band: "moderate" });
  const out = await applyEnergyFix(db as never, {
    userId: USER,
    eventId: EVENT,
    raw: "750",
  });
  // ⚠️ `stale`, PAS `failed` — MESURÉ EN RUN RÉEL LE 2026-09-02. L'accusé
  // disait « quelque chose a mal tourné de mon côté, réessaie »: rien n'avait
  // mal tourné, et « réessaie » invite à rejouer une requête qui ne peut jamais
  // aboutir.
  assertEquals(out, { ok: false, reason: "stale" });
  assertEquals(updates.length, 0, "aucune écriture ne doit partir");
});

Deno.test("un chiffre EXISTANT est remplacé, et rien d'autre ne bouge", async () => {
  const { db, updates } = stubEvent({
    portion_band: "moderate",
    detected_foods: [{ label: "salmon" }],
    energy_estimate: { kcal: 620, basis: "photo_estimate", confidence_band: "low" },
  });
  const out = await applyEnergyFix(db as never, {
    userId: USER,
    eventId: EVENT,
    raw: "750",
  });
  assertEquals(out, { ok: true, kcal: 750, basis: "declared_quantities" });
  assertEquals(updates.length, 1);
  const written = updates[0].recognized as Record<string, unknown>;
  assertEquals(written.energy_estimate, {
    kcal: 750,
    basis: "declared_quantities",
    confidence_band: "high",
  });
  // ⛔ LA LECTURE DE LA PHOTO RESTE CE QUE LE MODÈLE A RENDU. La personne a
  // corrigé UN nombre, pas réécrit ce qu'on a vu dans son assiette.
  assertEquals(written.portion_band, "moderate");
  assertEquals(written.detected_foods, [{ label: "salmon" }]);
});

Deno.test("une ligne introuvable n'écrit rien et le dit", async () => {
  const { db, updates } = stubEvent(null);
  assertEquals(
    await applyEnergyFix(db as never, {
      userId: USER,
      eventId: EVENT,
      raw: "750",
    }),
    { ok: false, reason: "stale" },
  );
  assertEquals(updates.length, 0);
});

Deno.test("⛔ `stale` NE DIT PAS « réessaie », ET `failed` LE DIT", () => {
  // Les trois états de `stale` — la ligne n'existe pas, n'est pas la vôtre, ne
  // porte aucun chiffre — ne changeront pas en réessayant. Inviter à rejouer
  // est faux, et sur un jeton forgé c'est une invitation à insister.
  for (const locale of ["en-US", "fr-FR"]) {
    const stale = renderEnergyFixAck({
      locale,
      outcome: { ok: false, reason: "stale" },
    });
    const failed = renderEnergyFixAck({
      locale,
      outcome: { ok: false, reason: "failed" },
    });
    assert(stale !== failed, `${locale}: les deux phrases sont identiques`);
    const retry = locale.startsWith("fr") ? "réessay" : "try again";
    assertEquals(
      stale.toLowerCase().includes(retry),
      false,
      `${locale}: « ${stale} » invite à rejouer une requête sans issue`,
    );
    assert(
      failed.toLowerCase().includes(retry),
      `${locale}: une vraie panne DOIT inviter à réessayer`,
    );
  }
});

Deno.test("un chiffre refusé n'atteint jamais la base", async () => {
  const { db, updates } = stubEvent({
    energy_estimate: { kcal: 620, basis: "photo_estimate", confidence_band: "low" },
  });
  const out = await applyEnergyFix(db as never, {
    userId: USER,
    eventId: EVENT,
    raw: "50000",
  });
  assertEquals(out.ok, false);
  if (out.ok) return;
  assertEquals(out.reason, "out_of_range");
  assertEquals(updates.length, 0, "le refus est pur: aucune lecture, aucune écriture");
});
