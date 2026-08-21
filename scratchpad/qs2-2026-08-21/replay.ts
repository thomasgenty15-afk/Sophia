// Q-S2 — REJEU À BLANC, LECTURE SEULE. Script jetable.
//
// Il n'ouvre AUCUNE connexion et n'écrit RIEN : il lit trois dumps JSON
// produits par `psql ... copy (...) to stdout` et applique le code de
// PRODUCTION aux textes archivés.
//
// Ce qui est importé de la production (jamais recopié) :
//   - applyKeelOutputLocks            (la ceinture entière, telle qu'appelée
//                                      par router/run.ts:2904)
//   - findMedicalConstraintViolations (la moitié médicale, telle quelle)
//   - safetyConstraintTokens          (quels champs deviennent des jetons)
//   - surfaceFormsFor                 (les formes de surface)
//   - findForbiddenMatches            (le moteur, avec sa politique de négation)
//   - householdAllergenRefs           (la lane foyer)
//
// La SEULE chose reconstruite ici est le prédicat de sévérité d'une ligne —
// c'est-à-dire très exactement la ligne que S2 propose de changer
// (`safety_constraints.ts:591`). `assertFidelity()` prouve que la
// reconstruction rend le MÊME résultat que la production quand on la restreint
// à {medical}.

import {
  applyKeelOutputLocks,
} from "../../supabase/functions/sophia-brain/skills/_shared/keel_output_locks.ts";
import {
  findMedicalConstraintViolations,
  safetyConstraintTokens,
  type StudentSafetyConstraint,
} from "../../supabase/functions/_shared/keel/safety_constraints.ts";
import {
  findForbiddenMatches,
  type ForbiddenTerm,
} from "../../supabase/functions/_shared/keel/forbidden_matcher.ts";
import { surfaceFormsFor } from "../../supabase/functions/_shared/keel/allergen_surface_forms.ts";
import { householdAllergenRefs } from "../../supabase/functions/_shared/keel/household_safety.ts";

type ConstraintRow = {
  id: string;
  user_id: string;
  kind: string;
  allergen_ref: string | null;
  substance_ref: string | null;
  medication_class: string | null;
  condition_ref: string | null;
  diet_ref: string | null;
  severity: string;
  declared_by: string;
  notes: string | null;
  content_locale: string;
};
type MessageRow = {
  id: string;
  user_id: string;
  role: string;
  content: string;
  created_at: string;
};
type HouseholdAllergyRow = { user_id: string; label: string };

const here = new URL(".", import.meta.url);
const read = <T>(name: string): T =>
  JSON.parse(Deno.readTextFileSync(new URL(name, here)));

const constraintRows = read<ConstraintRow[]>("constraints.json");
const messages = read<MessageRow[]>("messages.json");
const householdRows = read<HouseholdAllergyRow[]>("household_allergies.json");

// ── projection ligne -> objet du domaine, comme loadStudentSafetyConstraints
function toConstraint(row: ConstraintRow): StudentSafetyConstraint {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind as StudentSafetyConstraint["kind"],
    allergenRef: row.allergen_ref,
    substanceRef: row.substance_ref,
    medicationClass: row.medication_class,
    conditionRef: row.condition_ref,
    dietRef: row.diet_ref,
    severity: row.severity as StudentSafetyConstraint["severity"],
    declaredBy: row.declared_by as "student" | "coach",
    notes: row.notes,
    contentLocale: row.content_locale,
  };
}

const ownConstraints = new Map<string, StudentSafetyConstraint[]>();
for (const row of constraintRows) {
  const list = ownConstraints.get(row.user_id) ?? [];
  list.push(toConstraint(row));
  ownConstraints.set(row.user_id, list);
}

// La lane foyer : `severity: 'medical'` en dur (household_safety.ts:209).
const householdConstraints = new Map<string, StudentSafetyConstraint[]>();
for (const row of householdRows) {
  const list = householdConstraints.get(row.user_id) ?? [];
  for (const ref of householdAllergenRefs(row.label)) {
    list.push({
      id: `household:${row.user_id}:${ref}`,
      userId: row.user_id,
      kind: "allergy",
      allergenRef: ref,
      substanceRef: null,
      medicationClass: null,
      conditionRef: null,
      dietRef: null,
      severity: "medical",
      declaredBy: "student",
      notes: null,
      contentLocale: "",
    });
  }
  householdConstraints.set(row.user_id, list);
}

function beltConstraintsFor(userId: string): StudentSafetyConstraint[] {
  return [
    ...(ownConstraints.get(userId) ?? []),
    ...(householdConstraints.get(userId) ?? []),
  ];
}

// ── la ceinture, paramétrée par l'ensemble des sévérités ────────────────────
// Corps identique à findMedicalConstraintViolations (safety_constraints.ts
// 585-615), à ceci près que le filtre de la l. 591 est un paramètre.
function violationsForSeverities(
  text: string,
  constraints: readonly StudentSafetyConstraint[],
  severities: ReadonlySet<string>,
) {
  const terms: ForbiddenTerm[] = [];
  for (const constraint of constraints) {
    if (!severities.has(constraint.severity)) continue;
    for (const token of safetyConstraintTokens(constraint)) {
      terms.push({
        ruleId: constraint.id,
        token,
        surfaceForms: surfaceFormsFor(token),
      });
    }
  }
  return findForbiddenMatches(text, terms, {});
}

const MEDICAL_ONLY = new Set(["medical"]);
const MEDICAL_AND_STRICT = new Set(["medical", "strict"]);

// ── état des lieux des populations ─────────────────────────────────────────
const bySeverity: Record<string, number> = {};
const tokenBearingBySeverity: Record<string, number> = {};
for (const row of constraintRows) {
  bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1;
  if (safetyConstraintTokens(toConstraint(row)).length > 0) {
    tokenBearingBySeverity[row.severity] =
      (tokenBearingBySeverity[row.severity] ?? 0) + 1;
  }
}

const strictTokens = new Set<string>();
for (const row of constraintRows) {
  if (row.severity !== "strict") continue;
  for (const t of safetyConstraintTokens(toConstraint(row))) strictTokens.add(t);
}

// ── le rejeu ───────────────────────────────────────────────────────────────
const assistantTurns = messages.filter((m) => m.role === "assistant");

let fidelityMismatches = 0;
let biteMedical = 0;
let biteStrict = 0;
let armedTurns = 0; // tours dont l'auteur porte >= 1 contrainte active
let beltBlockedByProduction = 0; // via applyKeelOutputLocks tel quel
const newBites: {
  id: string;
  user: string;
  tokens: string[];
  excerpt: string;
  created_at: string;
}[] = [];
const tokenTally: Record<string, number> = {};

for (const turn of assistantTurns) {
  const constraints = beltConstraintsFor(turn.user_id);
  if (constraints.length > 0) armedTurns++;
  const text = String(turn.content ?? "");

  // ① fidélité : notre reconstruction {medical} == la production
  const prod = findMedicalConstraintViolations(text, constraints);
  const mine = violationsForSeverities(text, constraints, MEDICAL_ONLY);
  if (prod.length !== mine.length) fidelityMismatches++;

  // ② la ceinture ENTIÈRE, telle que run.ts l'appelle (medical d'aujourd'hui)
  const locked = applyKeelOutputLocks({
    text,
    isKeelStudent: true, // vérifié : les 32 porteurs sont keel_role='student'
    safetyConstraints: constraints,
    doctrine: null,
    coachDisplayName: null,
    retractedConstraintRefs: null,
  });
  if (locked.reason === "blocked_medical_constraint") beltBlockedByProduction++;

  if (prod.length > 0) biteMedical++;

  // ③ la ceinture ÉLARGIE à strict
  const widened = violationsForSeverities(text, constraints, MEDICAL_AND_STRICT);
  if (widened.length > 0) {
    biteStrict++;
    if (prod.length === 0) {
      const toks = [...new Set(widened.map((v) => v.token))];
      for (const t of toks) tokenTally[t] = (tokenTally[t] ?? 0) + 1;
      newBites.push({
        id: turn.id,
        user: turn.user_id,
        tokens: toks,
        excerpt: text.slice(
          Math.max(0, widened[0].index - 60),
          widened[0].index + 80,
        ).replace(/\s+/g, " "),
        created_at: turn.created_at,
      });
    }
  }
}

const pct = (n: number, d: number) => d === 0 ? "n/a" : (100 * n / d).toFixed(2);

console.log(JSON.stringify(
  {
    populations: {
      contraintes_actives: constraintRows.length,
      par_severite: bySeverity,
      porteuses_de_jeton_par_severite: tokenBearingBySeverity,
      jetons_strict: [...strictTokens].sort(),
      lignes_foyer_projetees: [...householdConstraints.values()].flat().length,
    },
    corpus: {
      chat_messages_total: messages.length,
      tours_assistant: assistantTurns.length,
      tours_assistant_armes: armedTurns,
    },
    resultat: {
      tours_total: assistantTurns.length,
      mordent_avec_medical: biteMedical,
      mordent_avec_medical_via_applyKeelOutputLocks: beltBlockedByProduction,
      mordent_si_strict: biteStrict,
      nouveaux_mordus: biteStrict - biteMedical,
      pct_si_strict_sur_tours_assistant: pct(biteStrict, assistantTurns.length),
      pct_si_strict_sur_toutes_lignes: pct(biteStrict, messages.length),
      pct_si_strict_sur_tours_armes: pct(biteStrict, armedTurns),
    },
    fidelite: {
      ecarts_reconstruction_vs_production: fidelityMismatches,
    },
    nouveaux_mordus_par_jeton: tokenTally,
    echantillon: newBites.slice(0, 25),
  },
  null,
  2,
));
