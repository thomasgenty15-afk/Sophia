import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { fromFileUrl } from "jsr:@std/path@1";

import {
  loadTrackingReport,
  TRACKING_MAX_WINDOW_DAYS,
  TrackingRefusalError,
  WEIGHT_SERIES_MAX_DAYS,
} from "./tracking_window_io.ts";
import {
  DESCRIBE_MAX_BACKFILL_DAYS,
  DESCRIBE_MAX_CHARS,
  describeMissedSlot,
} from "./tracking_describe_io.ts";

/**
 * L'ASSEMBLAGE DU SUIVI — ce qui se prouve SANS base.
 *
 * ── POURQUOI DES ÉPREUVES DE SOURCE ICI ──────────────────────────────────
 * Deux propriétés de ce module ne sont pas des valeurs de retour, ce sont des
 * ORDRES et des FILTRES:
 *   ① `loadEnergyGate` est la PREMIÈRE lecture, et son refus sort avant qu'une
 *     ligne de plan, de fait ou de pesée soit lue;
 *   ② chaque requête porte son `.eq("user_id", …)`, parce que ce module tourne
 *     en `service_role` où RLS ne s'applique pas.
 * Les vérifier par un faux client demanderait de simuler tout `loadEnergyGate`
 * — quatre tables et deux modules — pour éprouver une propriété qui est, elle,
 * lisible à l'œil. C'est l'idiome que `energy_target_test.ts` emploie déjà pour
 * refuser Mifflin dans `directedRange`: on relit la source, et la mutation le
 * prouve.
 */
const IO_SOURCE = Deno.readTextFileSync(
  fromFileUrl(new URL("./tracking_window_io.ts", import.meta.url)),
);

/** Les commentaires blanchis: une note qui cite un appel n'est pas un appel. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

const IO_CODE = stripComments(IO_SOURCE);

/** Un client qui EXPLOSE: sert à prouver qu'aucune requête n'a été tentée. */
function forbiddenDb(): never {
  throw new Error("aucune requête ne doit partir sur ce chemin");
}
// deno-lint-ignore no-explicit-any
const NO_DB = { from: forbiddenDb, rpc: forbiddenDb } as any;

// ══════════════════════════════════════════════════════════════════════════
// ① LA PORTE EST LA PREMIÈRE LECTURE
// ══════════════════════════════════════════════════════════════════════════

Deno.test("A7 io — `loadEnergyGate` est appelé AVANT toute autre lecture", () => {
  const body = IO_CODE.slice(IO_CODE.indexOf("export async function loadTrackingReport"));
  assert(body.length > 0, "loadTrackingReport a disparu");
  const gateAt = body.indexOf("loadEnergyGate(");
  assert(gateAt > 0, "`loadEnergyGate` n'est plus appelé dans l'assemblage");
  for (const reader of [
    "loadPlans(",
    'from("protocol_events")',
    "loadBodyMeasures(",
    "loadCompositionIndex(",
    "loadStudentBody(",
    'from("cooking_session_states")',
    'from("grocery_wave_states")',
  ]) {
    const at = body.indexOf(reader);
    if (at < 0) continue;
    assert(
      at > gateAt,
      `${reader} est lu AVANT la porte — la ceinture ne serait plus la première instruction`,
    );
  }
});

Deno.test("A7 io — sous plancher, l'assemblage sort avant les lectures", () => {
  const body = IO_CODE.slice(IO_CODE.indexOf("export async function loadTrackingReport"));
  const floorAt = body.indexOf('gate.reason === "restriction_floor"');
  assert(floorAt > 0, "la sortie sous plancher a disparu de l'assemblage");
  // Toutes les lectures qui suivent la porte doivent suivre aussi la sortie.
  for (const reader of ["loadPlans(", "loadBodyMeasures(", "loadStudentBody("]) {
    const at = body.indexOf(reader);
    if (at < 0) continue;
    assert(at > floorAt, `${reader} est lu avant la sortie sous plancher`);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ② LE FILTRE DE PROPRIÉTAIRE — RLS N'EN TIENT PAS LIEU
// ══════════════════════════════════════════════════════════════════════════

Deno.test("A7 io — chaque requête porte son propriétaire, ou son couple de foyer", () => {
  // Chaque `.from("…")` du module, avec ce qui le suit jusqu'au prochain.
  const parts = IO_CODE.split(/\.from\(/).slice(1);
  assert(parts.length >= 4, `seulement ${parts.length} requêtes trouvées`);
  for (const part of parts) {
    const table = part.slice(0, part.indexOf(")")).replace(/["'\s]/g, "");
    const chain = part.slice(0, 900);
    const hasOwner = chain.includes('.eq("user_id"');
    // L'EXCEPTION, ET ELLE EST GARDÉE DEUX FOIS: le plan `household` d'un
    // membre porte le `user_id` du maître. On ne retire pas le filtre, on le
    // remplace par le COUPLE — les deux `eq`, jamais l'un des deux.
    const hasHouseholdPair = chain.includes('.eq("plan_kind", "household")') &&
      chain.includes('.eq("household_id"');
    assert(
      hasOwner || hasHouseholdPair,
      `la requête sur \`${table}\` n'a ni \`.eq("user_id")\` ni le couple de foyer`,
    );
  }
});

Deno.test("A7 io — le plan du foyer ne se lit JAMAIS par un retrait nu du propriétaire", () => {
  const at = IO_CODE.indexOf('.eq("plan_kind", "household")');
  assert(at > 0, "la portée foyer a disparu");
  const chain = IO_CODE.slice(at, at + 400);
  assert(
    chain.includes('.eq("household_id"'),
    "le `plan_kind` est filtré sans le `household_id`: charge forgée citant le plan d'un autre foyer (run H2)",
  );
});

// ══════════════════════════════════════════════════════════════════════════
// ③ LA FENÊTRE — des refus NOMMÉS, et aucune requête avant
// ══════════════════════════════════════════════════════════════════════════

Deno.test("A7 io — une fenêtre malformée est refusée sans toucher la base", async () => {
  for (const [from, to] of [
    ["", "2026-09-03"],
    ["2026-09-03", ""],
    ["hier", "2026-09-03"],
    ["2026-09-04", "2026-09-03"],
  ]) {
    const error = await assertRejects(
      () => loadTrackingReport(NO_DB, { userId: "u1", from, to }),
      TrackingRefusalError,
    );
    assertEquals((error as TrackingRefusalError).token, "bad_window");
  }
});

Deno.test("A7 io — une fenêtre trop large est refusée, et la borne est celle du module", async () => {
  // ⚠️ PARAMÉTRÉ PAR LA CONSTANTE, PUIS ÉPROUVÉ DE PART ET D'AUTRE: un test qui
  // recalculerait sa borne depuis `TRACKING_MAX_WINDOW_DAYS` seul resterait
  // vert si la constante changeait. On vérifie donc qu'UN jour de plus refuse
  // et que la borne exacte passe la validation.
  const to = "2026-09-03";
  const tooWide = new Date(Date.parse(`${to}T00:00:00Z`));
  tooWide.setUTCDate(tooWide.getUTCDate() - TRACKING_MAX_WINDOW_DAYS);
  const error = await assertRejects(
    () =>
      loadTrackingReport(NO_DB, {
        userId: "u1",
        from: tooWide.toISOString().slice(0, 10),
        to,
      }),
    TrackingRefusalError,
  );
  assertEquals((error as TrackingRefusalError).token, "window_too_wide");
  assertEquals(TRACKING_MAX_WINDOW_DAYS, 92);
  assertEquals(WEIGHT_SERIES_MAX_DAYS, 3650);
});

// ══════════════════════════════════════════════════════════════════════════
// ④ « DÉCRIRE » — les refus qui tombent AVANT la moindre requête
// ══════════════════════════════════════════════════════════════════════════

Deno.test("A7 décrire — un créneau, une date et un texte sont validés sans base", async () => {
  const ok = { userId: "u1", localDate: "2026-09-02", slot: "lunch", text: "une salade" };

  assertEquals(
    (await describeMissedSlot(NO_DB, { ...ok, slot: "brunch" })).reason,
    "bad_slot",
  );
  // Les cinq MOMENTS horaires ne sont pas des créneaux déclarables: le
  // vocabulaire du suivi est celui des six occasions (D7.6).
  assertEquals(
    (await describeMissedSlot(NO_DB, { ...ok, slot: "midday" })).reason,
    "bad_slot",
  );
  assertEquals(
    (await describeMissedSlot(NO_DB, { ...ok, localDate: "02/09/2026" })).reason,
    "bad_date",
  );
  assertEquals(
    (await describeMissedSlot(NO_DB, { ...ok, text: "   " })).reason,
    "empty_text",
  );
  assertEquals(
    (await describeMissedSlot(NO_DB, { ...ok, text: "a".repeat(DESCRIBE_MAX_CHARS + 1) }))
      .reason,
    "text_too_long",
  );
  // Et l'identité manquante ne devient jamais une écriture anonyme.
  assertEquals(
    (await describeMissedSlot(NO_DB, { ...ok, userId: "" })).ok,
    false,
  );
  assertEquals(DESCRIBE_MAX_CHARS, 600);
  assertEquals(DESCRIBE_MAX_BACKFILL_DAYS, 14);
});

Deno.test("A7 décrire — aucun refus ne rend un chiffre, et la porte précède l'écriture", () => {
  const source = stripComments(
    Deno.readTextFileSync(
      fromFileUrl(new URL("./tracking_describe_io.ts", import.meta.url)),
    ),
  );
  const gateAt = source.indexOf("loadEnergyGate(");
  const insertAt = source.indexOf(".insert(");
  assert(gateAt > 0, "la porte a disparu du chemin `décrire`");
  assert(insertAt > gateAt, "on écrit avant d'avoir résolu le jour de la personne");
  // ⛔ AUCUN CHIFFRE STOCKÉ (FF-059 R5). Ce chemin n'écrit pas d'énergie, et le
  // seul champ `energy` qu'il rend est `null`.
  assert(
    !source.includes("energy_estimate"),
    "le chemin `décrire` écrit une estimation d'énergie — un chiffre stocké",
  );
  // ⛔ ET JAMAIS `as_planned`: le plancher ne produit que `off_plan` ou `null`,
  // et le compléter fabriquerait de l'adhérence à partir d'un silence.
  assert(
    !source.includes('"as_planned"'),
    "le chemin `décrire` écrit `as_planned` — de l'adhérence fabriquée",
  );
});
