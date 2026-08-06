import React from "react";

import { useAuth } from "../../context/AuthContext";
import {
  CONSTRAINT_KINDS,
  type ConstraintKind,
  type ConstraintSeverity,
  constraintRef,
  declareConstraint,
  DuplicateConstraintError,
  loadActiveConstraints,
  retractConstraint,
  type SafetyConstraintRow,
} from "../api/safetyConstraints";
import {
  ALLERGEN_OPTIONS,
  allergenLabel,
  hasWideCoverage,
  normalizeAllergenInput,
} from "../copy/allergens";
import KeelAppShell from "../components/KeelAppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";

// KEEL — /app/health.
//
// L'ENDROIT OÙ L'ÉLÈVE DIT CE QU'IL NE PEUT PAS MANGER.
//
// La table `student_safety_constraints` existait, riche, et alimentait déjà la
// génération de repas, la génération de semaine, le résolveur de substitution et
// le VERROU DE SORTIE qui remplace tout message où Sophia suggérerait un
// allergène médical. Il n'existait aucune surface pour la remplir: la seule
// façon de déclarer une allergie était de le dire en conversation. Une ceinture
// armée sur un coffre vide.
//
// TROIS DÉCISIONS QUI GOUVERNENT CET ÉCRAN
// ----------------------------------------
//  1. UNE PAGE À PART, pas une section du plan. Ce que l'élève déclare ici vaut
//     pour toutes les semaines à venir, pas pour celle-ci; et c'est l'endroit
//     stable qu'on peut lier depuis l'onboarding, la conversation et l'espace
//     coach.
//
//  2. LISTE FERMÉE D'ABORD, SAISIE LIBRE ENSUITE — et la différence est DITE.
//     Un allergène du catalogue est reconnu sous ses autres noms (`peanut`
//     couvre « satay », « PB », « nut butter »); une saisie libre n'est reconnue
//     que sous le mot écrit. Ce n'est PAS « protégé / non protégé »: le matcher
//     compare toujours le token lui-même. L'écran doit dire la nuance exacte,
//     parce qu'un élève qui croit être couvert sur « fruits de mer » ne relira
//     jamais.
//
//  3. ON RETIRE, ON N'ÉDITE PAS. Une déclaration ne se réécrit pas — le trigger
//     `student_safety_constraints_retraction_only` l'interdit en base. Corriger
//     une allergie, c'est en déclarer une autre et retirer l'ancienne, et la
//     trace des deux reste.
//
// I18N HAND-OFF (W9 possède `frontend/src/keel/i18n/en.ts`; ce fichier ne
// l'écrit pas). `COPY` ci-dessous est le hand-off littéral: ses clés sont les
// clés de message à ajouter, ses valeurs les chaînes anglaises exactes.

const COPY = {
  "health.title": "What you cannot eat",
  "health.subtitle":
    "Allergies, intolerances, medication. Your coach builds around these, and the chat will never suggest them to you.",
  "health.list.title": "Active",
  "health.list.empty":
    "Nothing declared yet. Add anything that has to stay off your plate.",
  "health.list.declared_by_coach": "Added by your coach",
  "health.list.coverage_full": "Recognised under its other names",
  "health.list.coverage_word_only": "Recognised only as written",
  "health.list.coverage_hint":
    "Written in your own words, so it is matched on that word alone. Your coach can see it and add the standard form.",
  "health.list.retract": "Remove",
  "health.list.retracting": "Removing…",
  "health.add.title": "Add one",
  "health.add.kind_label": "What kind",
  "health.add.what_label": "What exactly",
  "health.add.what_hint": "Pick from the list when it is there — it is matched more widely.",
  "health.add.other_option": "Something else…",
  "health.add.other_label": "Name it",
  "health.add.other_placeholder": "e.g. kiwi",
  "health.add.severity_label": "How strict",
  "health.add.severity_medical": "Medical — never, under any circumstance",
  "health.add.severity_strict": "Strict — I avoid it",
  "health.add.severity_preference": "Preference — I would rather not",
  "health.add.severity_hint":
    "Medical is not just stronger: it is the only one that makes the chat refuse to mention it at all.",
  "health.add.notes_label": "Anything to add (optional)",
  "health.add.notes_placeholder": "e.g. traces are fine, cooked is fine…",
  "health.add.submit": "Add",
  "health.add.saving": "Adding…",
  "health.add.error_no_ref": "Name what has to stay off your plate.",
  "health.add.error_duplicate": "That one is already on your list.",
  "health.kind.allergy": "Allergy",
  "health.kind.intolerance": "Intolerance",
  "health.kind.medical": "Medication",
  "health.kind.religious": "Religious or ethical",
  "health.kind.dislike": "Dislike",
  "health.loading": "Loading…",
  "health.error": "Could not load this. {message}",
} as const;

type CopyKey = keyof typeof COPY;

function c(key: CopyKey, params?: Record<string, string>): string {
  const template: string = COPY[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => params[name] ?? whole);
}

function kindLabel(kind: string): string {
  const key = `health.kind.${kind}` as CopyKey;
  return key in COPY ? c(key) : kind;
}

/**
 * Le champ qui portera le slug.
 *
 * `medical` (un médicament) va dans `medication_class`; tout le reste dans
 * `allergen_ref`. `substance_ref` reste au chemin conversationnel: c'est le
 * vocabulaire fermé des molécules (`SUBSTANCE_REFS`), et un formulaire d'élève
 * n'a pas à y écrire — un slug inventé dedans casserait des lectures qui
 * l'attendent fermé.
 */
function refFieldFor(kind: ConstraintKind): "allergen_ref" | "medication_class" {
  return kind === "medical" ? "medication_class" : "allergen_ref";
}

const OTHER = "__other__";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

export default function StudentHealthPage() {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [rows, setRows] = React.useState<SafetyConstraintRow[]>([]);

  const [kind, setKind] = React.useState<ConstraintKind>("allergy");
  const [choice, setChoice] = React.useState<string>(ALLERGEN_OPTIONS[0]?.slug ?? OTHER);
  const [freeText, setFreeText] = React.useState("");
  const [severity, setSeverity] = React.useState<ConstraintSeverity>("medical");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [retracting, setRetracting] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!userId) return;
    try {
      setRows(await loadActiveConstraints(userId));
      setState({ kind: "ready" });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [userId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // Un MÉDICAMENT ne se choisit pas dans un catalogue d'allergènes. Le bascule
  // sur la saisie libre est donc automatique, et l'inverse aussi — sinon un
  // élève qui change d'avis garde un slug de la liste sur un médicament.
  const catalogApplies = kind !== "medical";
  const effectiveChoice = catalogApplies ? choice : OTHER;
  const usesFreeText = effectiveChoice === OTHER;

  // Le slug tel qu'il PARTIRA en base, calculé pendant la frappe: c'est lui
  // qu'on interroge sur la couverture, pas le texte brut. « Milk », « milk »
  // et « MILK  » sont le même slug, donc la même promesse.
  const freeTextRef = usesFreeText ? normalizeAllergenInput(freeText) : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const ref = usesFreeText ? freeTextRef : effectiveChoice;
    if (!ref) {
      setFormError(c("health.add.error_no_ref"));
      return;
    }
    setSaving(true);
    try {
      await declareConstraint({
        userId,
        kind,
        severity,
        ref,
        refField: refFieldFor(kind),
        notes: notes.trim() || null,
        // R2: la ligne dit sa propre langue. Les surfaces KEEL sont anglaises.
        contentLocale: "en-GB",
      });
      setFreeText("");
      setNotes("");
      await refresh();
    } catch (error) {
      setFormError(
        error instanceof DuplicateConstraintError
          ? c("health.add.error_duplicate")
          : error instanceof Error
          ? error.message
          : String(error),
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: SafetyConstraintRow) {
    setRetracting(row.id);
    setFormError(null);
    try {
      await retractConstraint({ id: row.id, userId, reason: "student_removed" });
      await refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setRetracting(null);
    }
  }

  if (state.kind === "loading") {
    return (
      <KeelAppShell title={c("health.title")} subtitle={c("health.subtitle")}>
        <p className="text-sm text-gray-500">{c("health.loading")}</p>
      </KeelAppShell>
    );
  }

  if (state.kind === "error") {
    return (
      <KeelAppShell title={c("health.title")} subtitle={c("health.subtitle")}>
        <Card tone="warning">
          <p className="text-sm text-amber-900">
            {c("health.error", { message: state.message })}
          </p>
        </Card>
      </KeelAppShell>
    );
  }

  return (
    <KeelAppShell title={c("health.title")} subtitle={c("health.subtitle")}>
      <div className="space-y-8">
        <section>
          <SectionLabel>{c("health.list.title")}</SectionLabel>
          {rows.length === 0
            ? (
              <Card tone="dashed">
                <p className="text-sm text-gray-500">{c("health.list.empty")}</p>
              </Card>
            )
            : (
              <ul className="space-y-3">
                {rows.map((row) => {
                  const ref = constraintRef(row);
                  // La couverture ne vaut que pour un allergène: un médicament
                  // n'a pas de formes de surface alimentaires, et afficher
                  // « reconnu seulement sous ce mot » sur une classe de
                  // médicament inventerait une inquiétude sans objet.
                  const showsCoverage = row.allergen_ref !== null;
                  // La table du VERROU, pas le catalogue de l'écran: on ne
                  // propose qu'une entrée par danger (`dairy`), mais le verrou
                  // couvre aussi `milk`, `lactose`, `casein`, `eggs`, `soya`,
                  // `crustacean`, `shrimp`. Un élève qui a tapé « milk » est
                  // reconnu sous ses autres noms, et l'écran doit le dire.
                  const wide = ref !== null && hasWideCoverage(ref);
                  return (
                    <li key={row.id}>
                      <Card>
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-gray-900">
                                {allergenLabel(ref ?? "")}
                              </span>
                              <Badge tone="neutral">{kindLabel(row.kind)}</Badge>
                              {row.severity === "medical" && (
                                <Badge tone="critical">
                                  {c("health.add.severity_medical").split(" — ")[0]}
                                </Badge>
                              )}
                              {row.declared_by === "coach" && (
                                <Badge tone="info">
                                  {c("health.list.declared_by_coach")}
                                </Badge>
                              )}
                            </div>
                            {row.notes && (
                              <p className="mt-1 text-sm text-gray-600">{row.notes}</p>
                            )}
                            {showsCoverage && (
                              <p className="mt-2 text-xs text-gray-500">
                                {wide
                                  ? c("health.list.coverage_full")
                                  : `${c("health.list.coverage_word_only")} — ${
                                    c("health.list.coverage_hint")
                                  }`}
                              </p>
                            )}
                          </div>
                          <Button
                            onClick={() => void remove(row)}
                            disabled={retracting === row.id}
                          >
                            {retracting === row.id
                              ? c("health.list.retracting")
                              : c("health.list.retract")}
                          </Button>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
        </section>

        <section>
          <SectionLabel>{c("health.add.title")}</SectionLabel>
          <Card>
            <form className="space-y-4" onSubmit={(e) => void submit(e)}>
              <Field label={c("health.add.kind_label")} htmlFor="health-kind">
                <select
                  id="health-kind"
                  className={inputClass}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ConstraintKind)}
                >
                  {CONSTRAINT_KINDS.map((k) => (
                    <option key={k} value={k}>{kindLabel(k)}</option>
                  ))}
                </select>
              </Field>

              {catalogApplies && (
                <Field
                  label={c("health.add.what_label")}
                  hint={c("health.add.what_hint")}
                  htmlFor="health-what"
                >
                  <select
                    id="health-what"
                    className={inputClass}
                    value={choice}
                    onChange={(e) => setChoice(e.target.value)}
                  >
                    {ALLERGEN_OPTIONS.map((option) => (
                      <option key={option.slug} value={option.slug}>{option.label}</option>
                    ))}
                    <option value={OTHER}>{c("health.add.other_option")}</option>
                  </select>
                </Field>
              )}

              {usesFreeText && (
                <Field
                  label={c("health.add.other_label")}
                  // La saisie libre n'est pas synonyme d'étroit: `milk`,
                  // `eggs`, `soya` sont couverts sans être dans la liste. Le
                  // dire PENDANT la frappe évite de promettre étroit ici et
                  // large sur la fiche trois secondes plus tard.
                  hint={freeTextRef !== null && hasWideCoverage(freeTextRef)
                    ? c("health.list.coverage_full")
                    : c("health.list.coverage_hint")}
                  htmlFor="health-other"
                >
                  <input
                    id="health-other"
                    className={inputClass}
                    value={freeText}
                    placeholder={c("health.add.other_placeholder")}
                    onChange={(e) => setFreeText(e.target.value)}
                  />
                </Field>
              )}

              <Field
                label={c("health.add.severity_label")}
                hint={c("health.add.severity_hint")}
                htmlFor="health-severity"
              >
                <select
                  id="health-severity"
                  className={inputClass}
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as ConstraintSeverity)}
                >
                  <option value="medical">{c("health.add.severity_medical")}</option>
                  <option value="strict">{c("health.add.severity_strict")}</option>
                  <option value="preference">{c("health.add.severity_preference")}</option>
                </select>
              </Field>

              <Field label={c("health.add.notes_label")} htmlFor="health-notes">
                <input
                  id="health-notes"
                  className={inputClass}
                  value={notes}
                  placeholder={c("health.add.notes_placeholder")}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? c("health.add.saving") : c("health.add.submit")}
              </Button>
            </form>
          </Card>
        </section>
      </div>
    </KeelAppShell>
  );
}
