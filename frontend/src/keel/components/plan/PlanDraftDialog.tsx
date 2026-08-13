/**
 * LA FENÊTRE DE BROUILLON — POINT DE MONTAGE, POSÉ PAR LOT D, ÉCRIT PAR LOT C.
 *
 * ── POURQUOI CE FICHIER EXISTE AVANT D'AVOIR UN CORPS ─────────────────────
 * C'est le mode d'échec n°1 de ce dépôt: construire un lot et ne pas le
 * brancher. `request_report.ts` et `request_report_gate.ts` sont complets,
 * testés et VERTS — et n'ont aucun appelant en production. Le composant est
 * donc MONTÉ d'abord, avec ses props exactes, et rempli ensuite.
 *
 * ⚠️ LES PROPS SONT LE CONTRAT, PAS UNE ÉBAUCHE. Lot C écrit le corps sans les
 * changer; l'écran compile contre elles dès aujourd'hui.
 *
 * ⛔ AUCUN PARAMÈTRE DE GARDE OPTIONNEL. L'absence s'écrit `T | null`, jamais
 * `x?: T` — sept paramètres optionnels ont déjà été des gardes désarmées ici,
 * et « un `?` rend l'oubli invisible à la compilation ».
 */

import type { GeneratedMealResult } from "../../api/mealGeneration";

export interface PlanDraftDialogProps {
  open: boolean;
  onClose: () => void;
  /** Le brouillon rendu par le serveur. `null` = rien à montrer. */
  draft: GeneratedMealResult | null;
  /** Les phrases de Lot A. `[]` = rien à expliquer, et ce n'est pas un manque. */
  rationale: readonly string[];
  /** Refait un brouillon avec la phrase. REQUIS, jamais optionnel. */
  onRemix: (note: string) => Promise<void>;
  /** Écrit le plan pour de bon. */
  onAdopt: () => Promise<void>;
  /** Une composition est en cours. */
  busy: boolean;
}

/**
 * PLACEHOLDER. Il rend `null` — donc l'écran est exact aujourd'hui: il n'y a
 * pas encore de brouillon à montrer, et rien ne ment à l'utilisateur.
 */
export default function PlanDraftDialog(props: PlanDraftDialogProps) {
  // `void props` plutôt qu'un paramètre nommé `_`: la configuration eslint de
  // ce dépôt n'a pas d'`argsIgnorePattern`, donc `_` est signalé comme inutilisé.
  // Écrit ainsi, le contrat est REÇU et visiblement pas encore lu.
  void props;
  return null;
}
