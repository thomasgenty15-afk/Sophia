/**
 * S3 — L'ARME DU LOT, ET ELLE EST ÉPROUVÉE DEPUIS `energy_gate.ts`.
 *
 * ⛔ ── CE QUE CE FICHIER REFUSE D'ÊTRE ────────────────────────────────────
 * Un `grep` n'est pas une exécution. Le défaut que `S3` referme a survécu
 * précisément parce qu'il se lisait bien: `escalateMinorStudent` existe, il est
 * testé, il est correct — et il avait **zéro appelant**. Tout ce fichier
 * APPELLE: les portes, la chaîne, et l'escalade contre une base feinte.
 *
 * ⚠️ ── ET IL PART DE `energy_gate.ts`, PAS DE `student_age.ts` ────────────
 * `weekPlanAgeGate` est une fonction pure de quatre lignes; la prouver seule
 * prouve une arithmétique, pas un produit. Ce qui gouverne un chiffre est la
 * porte ② de `energySafetyGates`, et c'est par elle qu'on entre ici — puis par
 * `canShowEnergy` (chaîne + interrupteur) et `canSizeFromTarget` (le moteur).
 * Les trois sont exercées sur les TROIS populations.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";

import { assessBirthDate, weekPlanAgeGate } from "./student_age.ts";
import {
  canShowEnergy,
  canSizeFromTarget,
  energySafetyGates,
} from "./energy_gate.ts";
import {
  ageGateCensus,
  ageGateLogLine,
  escalateMinorIfNeeded,
} from "./student_age_wiring.ts";

const TODAY = "2026-08-22";

/** Les TROIS populations du compteur `age_gate`, construites par la vraie fonction. */
const POPULATIONS = [
  { label: "adult", raw: "1990-01-01" },
  { label: "minor", raw: "2011-05-20" },
  // Le plan l'appelle « absent »; le dépôt l'appelle `unknown`. Même population.
  { label: "absent", raw: null },
] as const;

// ---------------------------------------------------------------------------
// ① LA CHAÎNE, DEPUIS `energy_gate.ts`, SUR LES TROIS POPULATIONS
// ---------------------------------------------------------------------------

Deno.test("S3 — les trois portes du chiffre, exercées depuis `energy_gate.ts`", () => {
  const seen = new Map<string, string>();
  for (const { label, raw } of POPULATIONS) {
    const ageVerdict = assessBirthDate(raw, TODAY);

    // ── ①②③ — la chaîne de SÉCURITÉ, celle qui décide qu'un chiffre est
    //    PRODUIT. C'est elle que `household_portions.ts` et `mouth_anchor.ts`
    //    appellent par bouche, et c'est la ligne `energy_gate.ts:275` que ce
    //    lot a modifiée.
    const safety = energySafetyGates({
      restrictionFlag: false,
      ageVerdict,
      coachCounting: "no_position",
    });
    // ── ①②③④ — la même chaîne, plus l'interrupteur de l'élève.
    const show = canShowEnergy({
      restrictionFlag: false,
      ageVerdict,
      coachCounting: "no_position",
      studentSwitch: true,
    });
    // ── LE MOTEUR — dimensionner une part À PARTIR d'une énergie.
    const size = canSizeFromTarget({ safety });

    // Les trois portes disent la MÊME chose de la même personne. Un désaccord
    // ici serait un chemin par lequel un grammage sort sans que l'affichage le
    // sache, ou l'inverse.
    assertEquals(safety.open, show.show, label);
    assertEquals(safety.open, size.size, label);
    assertEquals(safety.reason, show.reason, label);
    assertEquals(safety.reason, size.reason, label);
    seen.set(label, safety.reason);
  }

  assertEquals(seen.get("adult"), "open");
  assertEquals(seen.get("minor"), "minor");
  // ⛔ LE FAIT DU LOT. Avant le 2026-08-22 cette ligne valait `"open"`, sur
  // **1 193 profils de 1 313** (90,9 %), dont **17 mineurs avérés** en base.
  assertEquals(seen.get("absent"), "age_unknown");
  // Et les trois motifs sont DISTINCTS: `absent` ne se dit pas `minor` — le
  // premier se répare en demandant une date, le second prévient un coach.
  assertEquals(new Set(seen.values()).size, 3);
});

Deno.test("S3 — ⛔ LE CAS QUI PASSE: le CHIFFRE se ferme, le SERVICE reste ouvert", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE TEST QUI FAIT LE LOT. Sans lui, `S3` serait indiscernable d'une garde
  // qui bloque tout — le mode d'échec principal de ce dépôt, et le risque
  // nommé dans la fiche: « fermer sur `absent` bloquerait tout en ressemblant
  // à une garde qui marche ».
  //
  // Ce que la table prouve, colonne par colonne: la personne SANS date reçoit
  // exactement ce qu'elle recevait hier (`allowed: true` — son plan, son repas,
  // sa conversation), et perd exactement une chose (`numberAllowed: false`).
  // ══════════════════════════════════════════════════════════════════════════
  const absent = assessBirthDate(null, TODAY);
  const gate = weekPlanAgeGate(absent);
  assertEquals(gate.allowed, true, "le plan d'une personne sans date SORT");
  assertEquals(gate.numberAllowed, false, "et il sort SANS chiffre");

  // L'adulte avéré, lui, garde le chiffre: c'est l'autre moitié du cas qui
  // passe, et sans elle la « garde » pourrait être un `return false` constant.
  const adult = assessBirthDate("1990-01-01", TODAY);
  assertEquals(weekPlanAgeGate(adult).allowed, true);
  assertEquals(weekPlanAgeGate(adult).numberAllowed, true);
  assertEquals(
    canShowEnergy({
      restrictionFlag: false,
      ageVerdict: adult,
      coachCounting: "no_position",
      studentSwitch: true,
    }),
    { show: true, reason: "open" },
  );

  // Et le mineur AVÉRÉ: son plan n'est pas refusé par cette chaîne non plus.
  // `allowed` est `false` pour lui — c'est la décision d'origine du produit,
  // écrite dans l'en-tête de `student_age.ts` — mais la lane du REPAS le sert
  // délibérément (lot 1G de `generate-meal-v1`), et rien dans `energy_gate.ts`
  // ne peut refuser quoi que ce soit: ces fonctions rendent un objet, elles ne
  // lèvent pas et ne portent aucun jeton de refus de service.
  const minor = assessBirthDate("2011-05-20", TODAY);
  const closed = energySafetyGates({
    restrictionFlag: false,
    ageVerdict: minor,
    coachCounting: "no_position",
  });
  assertEquals(closed, { open: false, reason: "minor" });
});

Deno.test("S3 — ① le plancher TCA gagne toujours, sur les trois populations", () => {
  // La porte ②bis est INSÉRÉE dans une chaîne ordonnée. La preuve qu'elle n'a
  // pas déplacé l'ordre: un plancher levé sort `restriction_floor` quel que
  // soit l'âge, y compris sur les deux populations que ②bis ferme.
  for (const { label, raw } of POPULATIONS) {
    assertEquals(
      energySafetyGates({
        restrictionFlag: true,
        ageVerdict: assessBirthDate(raw, TODAY),
        coachCounting: "no_counting",
      }),
      { open: false, reason: "restriction_floor" },
      label,
    );
  }
});

Deno.test("S3 — ②bis PRÉCÈDE ③: un âge inconnu ne s'impute pas au coach", () => {
  // Sinon le journal enverrait chercher la réparation chez le coach — « ta
  // doctrine ne compte pas » — alors que ce qui manque est une date.
  assertEquals(
    energySafetyGates({
      restrictionFlag: false,
      ageVerdict: assessBirthDate(null, TODAY),
      coachCounting: "no_counting",
    }),
    { open: false, reason: "age_unknown" },
  );
});

// ---------------------------------------------------------------------------
// ② LE COMPTEUR — les trois populations, y compris celle qui passe
// ---------------------------------------------------------------------------

Deno.test("S3 — `ageGateCensus` compte les TROIS populations, pas seulement les refus", () => {
  const census = POPULATIONS.map(({ raw }) => ageGateCensus(assessBirthDate(raw, TODAY)));
  assertEquals(census.map((c) => c.population), ["adult", "minor", "unknown"]);
  assertEquals(census.map((c) => c.numberAllowed), [true, false, false]);
  assertEquals(
    census.map((c) => c.reason),
    ["adult", "minor", "unknown_birth_date"],
  );
  // L'âge sort pour les deux populations qui en ont un, et `null` pour l'autre.
  assertEquals(census.map((c) => c.age), [36, 15, null]);
});

Deno.test("S3 — la ligne de journal porte l'ÂGE, jamais la date de naissance", () => {
  const line = ageGateLogLine("u-1", assessBirthDate("2011-05-20", TODAY));
  assertEquals(line.tag, "keel.age_gate");
  assertEquals(line.age_population, "minor");
  assertEquals(line.number_allowed, false);
  assertEquals(line.age, 15);
  // Même arbitrage que `minorEscalationRow`: un journal n'a aucun usage d'une
  // date de naissance qu'il n'ait d'un âge.
  assert(!/\d{4}-\d{2}-\d{2}/.test(JSON.stringify(line)), JSON.stringify(line));
});

// ---------------------------------------------------------------------------
// ③ L'ESCALADE — APPELÉE, contre une base feinte. Pas lue.
// ---------------------------------------------------------------------------

/**
 * Une base feinte qui répond comme PostgREST: le chaînage rend l'objet
 * `{data, error}` que `escalateMinorStudent` déstructure.
 *
 * ⚠️ Elle ENREGISTRE ce qu'on lui écrit. Un espion qui ne retient rien ne
 * distingue pas « l'escalade a été appelée » de « l'escalade a été appelée et
 * n'a rien fait ».
 */
function fakeDb(existingOpen: string | null) {
  const inserted: Array<Record<string, unknown>> = [];
  const db = {
    from(_table: string) {
      const selectResult = {
        data: existingOpen === null ? [] : [{ id: existingOpen }],
        error: null,
      };
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: () => selectResult,
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return {
            select: () => ({ single: () => ({ data: { id: "ccr-neuf" }, error: null }) }),
          };
        },
      };
      return chain;
    },
  };
  return { db, inserted };
}

Deno.test("S3 — ⛔ L'ESCALADE EST APPELÉE POUR DE VRAI, et elle écrit sa ligne", async () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE SECOND TEST QUI FAIT LE LOT. `escalateMinorStudent` avait ZÉRO appelant
  // au 2026-08-22 — commentaires et tests retirés — et **une seule** ligne en
  // base, du 2026-08-12. Ce test ne cherche pas un appel dans du texte: il en
  // provoque un, et lit la ligne écrite.
  // ══════════════════════════════════════════════════════════════════════════
  const { db, inserted } = fakeDb(null);
  const out = await escalateMinorIfNeeded(db, {
    userId: "11111111-1111-1111-1111-111111111111",
    verdict: assessBirthDate("2011-05-20", TODAY),
  });
  assertEquals(out.escalated, true);
  assertEquals(out.reason, "raised");
  assertEquals(out.contractChangeRequestId, "ccr-neuf");

  assertEquals(inserted.length, 1);
  const row = inserted[0];
  assertEquals(row.reason_code, "minor_student");
  assertEquals(row.raised_by, "system");
  assertEquals(row.urgency, "immediate");
  assertEquals(row.status, "open");
  assertEquals(row.user_id, "11111111-1111-1111-1111-111111111111");
  // L'âge dérivé du verdict, pas un nombre recalculé au point d'appel: une
  // seconde arithmétique d'âge divergerait au premier fuseau horaire.
  assert(String(row.student_words).includes("15"), String(row.student_words));
});

Deno.test("S3 — l'escalade est IDEMPOTENTE: une ligne ouverte n'en fait pas une seconde", async () => {
  // Trente alertes pour un seul fait ne sont pas trente fois plus
  // d'information: c'est une boîte de réception que le coach cesse de lire, et
  // l'élève recompose son repas tous les jours.
  const { db, inserted } = fakeDb("ccr-deja-la");
  const out = await escalateMinorIfNeeded(db, {
    userId: "u-1",
    verdict: assessBirthDate("2011-05-20", TODAY),
  });
  assertEquals(out.escalated, false);
  assertEquals(out.reason, "already_open");
  assertEquals(out.contractChangeRequestId, "ccr-deja-la");
  assertEquals(inserted.length, 0);
});

Deno.test("S3 — ⛔ AUCUNE escalade sur un âge INCONNU, ni sur un adulte", async () => {
  // La garde de la garde. Escalader sur `unknown` alerterait un coach pour
  // **1 193 comptes** sans date: la première alerte réelle s'y noierait, et la
  // ligne de `contract_change_requests` dirait un fait qu'on n'a pas.
  // ⚠️ `"2030-01-01"` et pas une date proche: relu le 2026-08-22, un banc qui
  // datait le « futur » à quelques jours rendait un nourrisson — donc un
  // MINEUR, donc une escalade légitime — et le test rougissait à raison.
  for (const raw of [null, "1990-01-01", "n'importe quoi", "2030-01-01"]) {
    const { db, inserted } = fakeDb(null);
    const out = await escalateMinorIfNeeded(db, {
      userId: "u-1",
      verdict: assessBirthDate(raw, TODAY),
    });
    assertEquals(out.escalated, false, String(raw));
    assertEquals(out.reason, "not_a_minor", String(raw));
    // Pas seulement « il n'a pas escaladé »: il n'a RIEN écrit.
    assertEquals(inserted.length, 0, String(raw));
  }
});
