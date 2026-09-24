import { supabase } from "../../lib/supabase";
import {
  readRejectedDishes,
  type RejectedDish,
} from "../../../../supabase/functions/_shared/keel/rejected_dishes.ts";

// ⟳ 2026-09-24 — LA LISTE DES PLATS REFUSÉS, CÔTÉ ÉCRAN.
//
// ⛔ LE LECTEUR EST CELUI DU SERVEUR, IMPORTÉ, JAMAIS RECOPIÉ: le générateur et
// cet écran doivent lire la même liste de la même façon (le module est pur,
// sans import — Rollup n'en garde que ce qui sert).
//
// ⛔ L'ÉCRAN NE RÉÉCRIT JAMAIS LA LISTE. Le seul geste est « Enlever », et il
// passe par `keel_remove_rejected_dish` (session de la personne), qui retire
// UNE clé dans un `update` atomique. Réécrire la colonne depuis une copie lue
// plus tôt effacerait un refus écrit entre-temps par une autre adresse.

export type { RejectedDish };

/** La liste, lue du `practical_constraints` déjà chargé par la page. */
export function rejectedDishesFrom(constraints: Record<string, unknown>): RejectedDish[] {
  return readRejectedDishes(constraints);
}

export async function removeRejectedDish(key: string): Promise<void> {
  const { data, error } = await supabase.rpc("keel_remove_rejected_dish", { p_key: key });
  if (error) throw new Error("rejected_remove_failed");
  const out = (data ?? {}) as Record<string, unknown>;
  // `update` sans ligne répond sans erreur: c'est le `ok` de la fonction qui dit
  // si quelque chose a été retiré.
  if (out.ok !== true) throw new Error(String(out.reason ?? "rejected_remove_failed"));
}
