import React from "react";

import { supabase } from "../../lib/supabase";
import { allergenLabel, hasWideCoverage } from "../copy/allergens";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";

// CE QUE L'ÉLÈVE NE PEUT PAS MANGER — la carte que le COACH lit.
//
// POURQUOI ELLE EXISTE
// --------------------
// L'élève déclare ses allergies sur `/app/health`, et le produit s'en sert tout
// seul: la génération de semaine les évite, le verrou de sortie remplace tout
// message où Sophia suggérerait un allergène médical. Mais le coach, lui,
// PRESCRIT. Un coach qui écrit un programme sans savoir que son élève est
// anaphylactique à l'arachide écrit un programme qu'il faudra défaire.
//
// LE SIGNAL QUI COMPTE VRAIMENT: LA COUVERTURE
// --------------------------------------------
// Un allergène du CATALOGUE est reconnu sous ses autres noms — `peanut` couvre
// « satay », « groundnut », « PB », « nut butter ». Une saisie libre n'est
// reconnue que sous le mot écrit: un élève qui a tapé « fruits de mer » est
// protégé de « fruits de mer », pas de « crevettes ».
//
// Ce n'est PAS « protégé / non protégé » — le matcher compare toujours le token
// lui-même, donc la protection existe, elle est simplement étroite. Le coach est
// la seule personne qui puisse la rendre large: en reformulant la contrainte
// avec l'élève, ou en la redéclarant sous le terme standard. D'où ce signal ici,
// et nulle part ailleurs.
//
// LECTURE SOUS LE JWT DU COACH. Aucune edge function, aucune impersonation: la
// policy `student_safety_constraints_select_coach` décide. Un coach qui n'a pas
// cet élève ne lit rien, et cette carte affiche « rien à afficher » — ce qui est
// la bonne réponse, pas une erreur.

const COLUMNS =
  "id, kind, allergen_ref, substance_ref, medication_class, severity, " +
  "declared_by, notes, created_at";

interface ConstraintRow {
  id: string;
  kind: string;
  allergen_ref: string | null;
  substance_ref: string | null;
  medication_class: string | null;
  severity: string;
  declared_by: string;
  notes: string | null;
  created_at: string;
}

const KIND_LABEL: Record<string, string> = {
  allergy: "Allergy",
  intolerance: "Intolerance",
  medical: "Medication",
  religious: "Religious or ethical",
  dislike: "Dislike",
};

export default function StudentConstraintsCard({ studentId }: { studentId: string }) {
  const [rows, setRows] = React.useState<ConstraintRow[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await supabase
        .from("student_safety_constraints")
        .select(COLUMNS)
        .eq("user_id", studentId)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      // R7 à la frontière: une lecture en échec est DITE, jamais rendue comme
      // une liste vide. « Cet élève n'a aucune allergie » et « je n'ai pas pu
      // lire ses allergies » ne doivent pas se ressembler à l'écran.
      if (res.error) {
        setFailed(true);
        return;
      }
      setRows((res.data ?? []) as unknown as ConstraintRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (failed) {
    return (
      <Card tone="warning" className="mt-6">
        <p className="text-sm text-amber-900">
          Their constraints could not be loaded just now — do not read this
          screen as "nothing to avoid".
        </p>
      </Card>
    );
  }
  if (rows === null) return null;

  return (
    <Card className="mt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        What they cannot eat
      </p>
      {rows.length === 0
        ? (
          <p className="mt-3 text-sm text-gray-500">
            Nothing declared. They can add allergies, intolerances and
            medication themselves from their Health screen.
          </p>
        )
        : (
          <ul className="mt-3 space-y-3">
            {rows.map((row) => {
              const ref = row.allergen_ref ?? row.substance_ref ??
                row.medication_class ?? "";
              // La couverture se lit dans la table du VERROU, pas dans le
              // catalogue de l'écran: `milk`, `eggs`, `soya`, `crustacean` sont
              // couverts sans être proposés. Les signaler « en leurs propres
              // mots » enverrait le coach renégocier un terme déjà standard.
              const narrow = row.allergen_ref !== null && !hasWideCoverage(ref);
              return (
                <li key={row.id} className="border-t border-gray-100 pt-3 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {allergenLabel(ref)}
                    </span>
                    <Badge tone="neutral">{KIND_LABEL[row.kind] ?? row.kind}</Badge>
                    {row.severity === "medical" && <Badge tone="critical">Medical</Badge>}
                    {row.declared_by === "coach" && <Badge tone="info">You added this</Badge>}
                  </div>
                  {row.notes && (
                    <p className="mt-1 text-sm text-gray-600">{row.notes}</p>
                  )}
                  {narrow && (
                    <p className="mt-1 text-xs text-amber-800">
                      In their own words — matched on that word alone. If there
                      is a standard name for it, it is worth agreeing on one.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
    </Card>
  );
}
