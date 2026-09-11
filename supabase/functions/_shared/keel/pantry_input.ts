/**
 * CE QUE LA PERSONNE DIT AVOIR DÉJÀ — lu défensivement, une seule fois.
 *
 * ⛔ CE MODULE EXISTE POUR UNE RAISON DE PARITÉ, PAS D'ESTHÉTIQUE. `readPantry`
 * vivait à l'intérieur de `generate-meal-v1`, donc le garde-manger n'existait
 * que sur la lane individuelle: la lane du foyer écrivait `pantry: []` en dur,
 * et un foyer ne pouvait JAMAIS cuisiner avec ce qu'il a déjà. Le chantier du
 * moteur unique supprime la lane individuelle; sans ce déplacement, la
 * fonctionnalité partirait avec elle, en silence.
 *
 * ⚠️ AUCUNE RÈGLE N'A CHANGÉ EN DÉMÉNAGEANT: mêmes plafonds (60 lignes,
 * 120 caractères pour le terme, 60 pour la quantité), même rejet d'une ligne
 * sans terme, même `issues` nommée quand on tronque. Un déplacement qui
 * ajusterait « en passant » ferait porter au chantier une décision qu'il n'a
 * pas prise.
 */

import type { PantryItem } from "./meal_generation.ts";

/** Au-delà, on tronque ET on le dit: une liste silencieusement coupée ment. */
export const PANTRY_MAX_ITEMS = 60;

export function readPantry(raw: unknown, issues: string[]): PantryItem[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: PantryItem[] = [];
  for (const entry of list) {
    if (out.length >= PANTRY_MAX_ITEMS) {
      issues.push(
        `pantry: more than ${PANTRY_MAX_ITEMS} items, the rest was ignored`,
      );
      break;
    }
    const item =
      (entry && typeof entry === "object" ? entry : { term: entry }) as Record<
        string,
        unknown
      >;
    const term = String(item.term ?? "").trim().slice(0, 120);
    if (!term) continue;
    const quantity = String(item.quantity ?? "").trim().slice(0, 60) || null;
    out.push({ term, quantity });
  }
  return out;
}
