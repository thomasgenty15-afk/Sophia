/**
 * S3 — LE CÂBLAGE DE LA CEINTURE D'ÂGE DANS UNE LANE.
 *
 * Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, vague 1, lot `S3`.
 *
 * ── POURQUOI CE MODULE EXISTE, ALORS QUE TOUT CE QU'IL FAIT TIENT EN DIX ────
 * ── LIGNES CHEZ SON APPELANT ───────────────────────────────────────────────
 *
 * Parce que ces dix lignes-là ont déjà disparu une fois, et personne ne l'a vu.
 *
 * `escalateMinorStudent` (`student_body_io.ts`) est écrit, testé, correct — et
 * il avait **ZÉRO appelant** au 2026-08-22, commentaires et tests retirés. Son
 * unique appelant historique était `generate-week-plan-v1`, retiré du dépôt le
 * 2026-08-19 ; le retrait a emporté la ligne d'appel sans emporter la fonction.
 * Résultat mesuré: **une seule** ligne `contract_change_requests` de type
 * `minor_student` existe en base, du **2026-08-12**, et aucune depuis. Une
 * garde qui a mordu une fois puis plus jamais est indiscernable d'une garde qui
 * protège — c'est le mode d'échec principal de ce dépôt.
 *
 * Ce module est donc là pour que la DÉCISION survive dans l'histoire même
 * quand son point d'appel vit dans un fichier qu'un lot ne peut pas commiter
 * (décision §⑨ n° 15 du plan: « un module partagé neuf entre dans le commit »).
 * Le jour où une seconde lane doit escalader, elle appelle ceci; elle ne
 * réécrit pas la règle.
 *
 * ── CE QU'IL NE FAIT PAS, ET C'EST LA MOITIÉ QUI COMPTE ────────────────────
 *
 * ⛔ **Il ne refuse RIEN.** Ni le plan, ni le repas, ni la conversation. Un
 * mineur reçoit son plan; ce qu'il ne reçoit pas est un CHIFFRE, et cette
 * décision-là appartient à `energySafetyGates` (porte ② et ②bis), pas à ce
 * module. Le confondre reviendrait à fermer 91 % des comptes — 1 193 profils
 * sur 1 313 n'ont pas de date de naissance — au nom d'une garde d'enfance.
 *
 * PARTIELLEMENT PUR: `ageGateCensus` est pur (aucune I/O, aucune horloge);
 * `escalateMinorIfNeeded` écrit, et c'est écrit dans son nom.
 */

import type { BirthDateVerdict } from "./student_age.ts";
import { weekPlanAgeGate } from "./student_age.ts";
import { ageStateFromVerdict, type MemberAgeState } from "./household.ts";
import { escalateMinorStudent, type MinorEscalation } from "./student_body_io.ts";

type Db = { from(table: string): any };

/**
 * LE COMPTEUR `age_gate` — LES TROIS POPULATIONS, Y COMPRIS CELLE QUI PASSE.
 *
 * ⚠️ `population` VIENT D'`ageStateFromVerdict`, ET CE N'EST PAS UN DÉTAIL.
 * Le plan écrit le compteur `age_gate{minor, adult, absent}`. Les trois
 * populations existent déjà dans le dépôt sous les noms `minor` / `adult` /
 * `unknown` (`MemberAgeState`, le jumeau TypeScript de `keel_age_state`), et
 * c'est cette projection-là qui gouverne les grammages du foyer. En inventer
 * une quatrième ici pour coller au mot « absent » aurait donné deux comptages
 * du même fait, qui divergent au premier statut ajouté. On garde donc le
 * vocabulaire canonique — `unknown` EST la population que le plan appelle
 * « absent » — et on rend `reason` À CÔTÉ, qui, lui, distingue la date
 * manquante (`unknown_birth_date`) de la date illisible
 * (`unusable_birth_date`).
 */
export interface AgeGateCensus {
  /** `minor` · `adult` · `unknown`. Le `unknown` du plan s'écrit « absent ». */
  population: MemberAgeState;
  /** `adult` · `minor` · `unknown_birth_date` · `unusable_birth_date`. */
  reason: ReturnType<typeof weekPlanAgeGate>["reason"];
  /**
   * ⛔ LE FAIT QUE CE LOT MESURE. `false` sur `minor` ET sur `unknown`. Un
   * compteur qui ne rendrait que la population ne dirait pas si la porte a
   * effectivement mordu — et un lot désarmé ressemblerait trait pour trait à
   * un lot qui marche.
   */
  numberAllowed: boolean;
  /** L'âge en années révolues, ou `null` quand il n'y en a pas d'exploitable. */
  age: number | null;
}

/** Le recensement d'un verdict. Pur: il ne lit rien et n'écrit rien. */
export function ageGateCensus(verdict: BirthDateVerdict): AgeGateCensus {
  const gate = weekPlanAgeGate(verdict);
  return {
    population: ageStateFromVerdict(verdict),
    reason: gate.reason,
    numberAllowed: gate.numberAllowed,
    age: gate.age,
  };
}

/**
 * LA LIGNE DE JOURNAL DU COMPTEUR, CONSTRUITE À PART DE SON `console.log`.
 *
 * Même discipline que `minorEscalationRow`: un objet qui naît à l'intérieur
 * d'un `console.log` n'est visible d'aucun test. Ici il existe avant d'être
 * écrit, donc le seuil du lot (« `absent` non nul dès le premier run ») se
 * vérifie sans pile vivante.
 */
export function ageGateLogLine(
  userId: string,
  verdict: BirthDateVerdict,
): Record<string, unknown> {
  const census = ageGateCensus(verdict);
  return {
    tag: "keel.age_gate",
    user_id: userId,
    age_population: census.population,
    age_reason: census.reason,
    number_allowed: census.numberAllowed,
    // ⚠️ L'ÂGE, PAS LA DATE. Même arbitrage que `minorEscalationRow`: un
    // journal n'a aucun usage d'une date de naissance qu'il n'ait d'un âge.
    age: census.age,
  };
}

/** Ce qu'`escalateMinorIfNeeded` rend quand il n'y avait rien à escalader. */
export interface MinorEscalationSkipped {
  escalated: false;
  reason: "not_a_minor";
  contractChangeRequestId: null;
}

/**
 * LE COACH EST-IL PRÉVENU ? — LE REBRANCHEMENT DE `escalateMinorStudent`.
 *
 * ── LA CONDITION EST `minor` AVÉRÉ, ET SEULEMENT LUI ──────────────────────
 * ⛔ Ne PAS escalader sur `unknown`. Prévenir un coach que son élève « est
 * peut-être mineur » sur 1 193 comptes sans date, c'est une boîte de réception
 * qu'il cesse de lire — et la première alerte réelle s'y noierait. « On ne sait
 * pas » se répare en DEMANDANT la date (P4), pas en alertant un tiers.
 *
 * ── BEST-EFFORT, ET C'EST UN ARBITRAGE ÉCRIT ──────────────────────────────
 * Cette fonction ne lève pas: elle rend. Un hoquet d'écriture sur
 * `contract_change_requests` ne doit pas refuser le dîner d'un enfant — le
 * refus n'est pas ce que ce chantier a décidé (le CHIFFRE est déjà fermé par
 * `energySafetyGates`, en amont et sans I/O). L'appelant journalise ce qu'il
 * reçoit; il ne conditionne rien dessus.
 *
 * L'idempotence par ligne ouverte est celle de `escalateMinorStudent`, et elle
 * n'est PAS recopiée ici: l'élève va recomposer son repas tous les jours, et
 * trente alertes pour un seul fait ne sont pas trente fois plus d'information.
 */
export async function escalateMinorIfNeeded(
  db: Db,
  params: { userId: string; verdict: BirthDateVerdict },
): Promise<MinorEscalation | MinorEscalationSkipped> {
  const census = ageGateCensus(params.verdict);
  if (census.population !== "minor" || census.age === null) {
    return { escalated: false, reason: "not_a_minor", contractChangeRequestId: null };
  }
  return await escalateMinorStudent(db, {
    userId: params.userId,
    age: census.age,
  });
}
