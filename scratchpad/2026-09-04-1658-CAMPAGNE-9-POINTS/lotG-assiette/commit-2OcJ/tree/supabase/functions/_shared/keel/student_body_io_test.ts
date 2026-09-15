// KEEL — C5 ① · L'ESCALADE « MINEUR » DOIT POUVOIR ATTERRIR.
//
// ═══════════════════════════════════════════════════════════════════════════
// LE DÉFAUT QUE CE FICHIER EXISTE POUR NE PAS RECOMMETTRE
// ═══════════════════════════════════════════════════════════════════════════
//
// Mesuré en HTTP réel le 2026-08-12, sur `generate-week-plan-v1`:
//
//     HTTP=500  {"ok":false,"error":"[object Object]"}   en 5,5 s
//     system_error_logs: 'null value in column "content_locale" of relation
//       "contract_change_requests" violates not-null constraint | code=23502'
//     select count(*) from contract_change_requests
//       where reason_code='minor_student';  →  0
//
// La ceinture « élève mineur » BLOQUAIT bien la génération — mais par un 500,
// c'est-à-dire par accident. Le `409 minor_student` était inatteignable, aucune
// ligne d'escalade n'a jamais existé, et le coach n'a jamais appris qu'un
// mineur avait été bloqué. La copie de `escalateRestrictionSignal` avait perdu
// `content_locale`, colonne `not null` SANS DÉFAUT.
//
// ⚠️ POURQUOI AUCUN TEST NE POUVAIT LE VOIR: la ligne naissait à l'intérieur
// d'un `.insert({…})`, donc elle n'existait pas avant d'être écrite. Elle est
// désormais construite par `minorEscalationRow`, qui se lit sans base.
//
// ⚠️ UNE GARDE A BESOIN D'UN CAS QUI PASSE. Le test central ci-dessous n'est
// pas « content_locale est là »: c'est « CHAQUE colonne `not null` sans défaut
// de la DDL est fournie ». Il lit la migration, donc il mordra sur la PROCHAINE
// colonne obligatoire ajoutée à cette table — pas seulement sur celle-ci.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  MINOR_ESCALATION_CONTENT_LOCALE,
  minorEscalationRow,
} from "./student_body_io.ts";

const MIGRATIONS = new URL("../../../migrations/", import.meta.url);

async function ccrDdl(): Promise<string> {
  const sql = await Deno.readTextFile(
    new URL("20260727090000_keel_p0_commitments.sql", MIGRATIONS),
  );
  const at = sql.indexOf(
    "create table if not exists public.contract_change_requests (",
  );
  assert(at >= 0, "la DDL de contract_change_requests a bougé de migration");
  const end = sql.indexOf("\n);", at);
  assert(end > at, "la DDL n'est pas refermée");
  return sql.slice(at, end);
}

/**
 * Les colonnes que Postgres EXIGE de l'écrivain: `not null` et sans `default`.
 *
 * Les `check (... in (...))` s'étalent sur plusieurs lignes; on ne garde donc
 * que les lignes qui COMMENCENT une colonne (deux mots puis un type), ce qui
 * exclut les suites de contrainte et les commentaires.
 */
function requiredColumns(ddl: string): string[] {
  const out: string[] = [];
  for (const raw of ddl.split("\n")) {
    const line = raw.replace(/--.*$/, "").trim();
    const m = /^([a-z_]+)\s+(uuid|text|jsonb|timestamptz|boolean|integer|date)\b/
      .exec(line);
    if (!m) continue;
    if (!/\bnot null\b/.test(line)) continue;
    if (/\bdefault\b/.test(line)) continue;
    out.push(m[1]);
  }
  return out;
}

Deno.test("C5 ① — CHAQUE COLONNE OBLIGATOIRE DE LA DDL EST FOURNIE", async () => {
  const ddl = await ccrDdl();
  const required = requiredColumns(ddl);
  // Le test doit d'abord prouver qu'il LIT quelque chose: une DDL mal découpée
  // rendrait une liste vide, et une liste vide passe toujours.
  assert(
    required.includes("content_locale"),
    `la lecture de la DDL n'a pas vu content_locale (vu: ${required.join(", ")})`,
  );
  assert(required.includes("user_id"), "la lecture de la DDL n'a pas vu user_id");

  const row = minorEscalationRow(
    "11111111-1111-1111-1111-111111111111",
    15,
  ) as unknown as Record<string, unknown>;
  for (const col of required) {
    assert(
      Object.prototype.hasOwnProperty.call(row, col),
      `contract_change_requests.${col} est \`not null\` sans défaut, et ` +
        `l'escalade « mineur » ne l'écrit pas — l'insert rendra 23502, donc ` +
        `un 500, donc aucune escalade et aucun 409.`,
    );
    assert(
      row[col] !== null && row[col] !== undefined && row[col] !== "",
      `contract_change_requests.${col} est fournie mais vide`,
    );
  }
});

Deno.test("C5 ① — LA LANGUE EST CELLE DE LA PROSE DE LA LIGNE, PAS DE L'ÉLÈVE", () => {
  // D'où vient la valeur: du FRÈRE. `restrictionEffect` type sa ligne
  // `content_locale: "en"` — un littéral — parce que la prose est écrite en dur
  // en anglais par le module. R3 sépare `ui_locale` / `conversation_locale` /
  // `content_locale`: cette colonne dit la langue du TEXTE DE LA LIGNE.
  //
  // ⚠️ CE TEST ÉCHOUE SI LA PHRASE EST TRADUITE SANS BOUGER LA CONSTANTE. C'est
  // exactement ce qu'on veut: `profiles.locale` ici ferait mentir la colonne.
  assertEquals(MINOR_ESCALATION_CONTENT_LOCALE, "en");
  const row = minorEscalationRow("u1", 16);
  assertEquals(row.content_locale, MINOR_ESCALATION_CONTENT_LOCALE);
  // Une phrase anglaise, mot pour mot: si elle devient française, la constante
  // doit la suivre.
  assert(row.student_words.includes("under 18"));
  assert(row.student_words.includes("professional framework"));
});

Deno.test("C5 ① — L'ÂGE PART, LA DATE DE NAISSANCE NON", () => {
  const row = minorEscalationRow("u1", 14);
  assert(row.student_words.includes("14"));
  // Le coach a besoin de savoir qu'il accompagne un mineur et de combien, pas
  // de sa date de naissance.
  assert(!/\d{4}-\d{2}-\d{2}/.test(row.student_words));
});

Deno.test("C5 ① — LE CODE DE RAISON EST CELUI QUE LE CHECK AUTORISE", async () => {
  // `minor_student` a été ajouté au CHECK par 20260804171000. Une ligne dont le
  // code n'y est pas rendrait 23514 — le même mode d'échec, un numéro plus
  // loin.
  const row = minorEscalationRow("u1", 15);
  const sql = await Deno.readTextFile(
    new URL("20260804171000_plan_inputs_direction_and_body.sql", MIGRATIONS),
  );
  assert(
    sql.includes(`'${row.reason_code}'`),
    `${row.reason_code} n'est pas dans le CHECK de reason_code`,
  );
  assertEquals(row.reason_code, "minor_student");
  assertEquals(row.raised_by, "system");
  assertEquals(row.urgency, "immediate");
  assertEquals(row.status, "open");
});
