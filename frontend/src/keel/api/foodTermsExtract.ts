import { supabase } from "../../lib/supabase";
import { uiLocale } from "../i18n/runtime";

// KEEL — DU TEXTE LIBRE AUX BULLES, côté navigateur (2026-09-20).
//
// L'extraction vit dans `food-terms-extract-v1`: un appel modèle court, effort
// bas, qui rend la liste des aliments nommés dans une phrase. Ce module
// l'appelle, et il porte le DERNIER repli — celui d'une fonction injoignable.
//
// ── ⛔ TROIS PROVENANCES, ET ELLES SONT NOMMÉES ─────────────────────────────
//   `model`   = le modèle a répondu; sa liste fait foi, même vide;
//   `split`   = la fonction a répondu, mais le modèle non: elle a découpé le
//               texte sur ses séparateurs (`_shared/keel/food_terms_extract.ts`);
//   `offline` = la fonction elle-même n'a pas répondu: le découpage est fait
//               ICI, sur les mêmes séparateurs.
//
// Dans les trois cas, ce que la personne a tapé ne se perd pas. Une bulle est
// ce qui sera enregistré — pour une allergie, dans l'union de sécurité —, et
// « rien » n'est jamais la réponse à une panne.
//
// ⚠️ LE DÉCOUPAGE LOCAL EST LE MÊME QUE CELUI DU MOTEUR, RECOPIÉ. Deux copies
// d'une règle finissent par diverger, et le dépôt l'a déjà mesuré sur
// `normalizeAllergenInput` (d'où son test d'équivalence sur corpus). Celle-ci
// est tenue courte exprès — une expression, pas une grammaire — et elle ne sert
// que quand le serveur est hors d'atteinte, c'est-à-dire quand le moteur ne
// peut de toute façon pas parler.

export type FoodTermsKind = "allergy" | "dislike";
export type FoodTermsVia = "model" | "split" | "offline";

const TERM_MAX_LENGTH = 80;
const TERMS_MAX = 20;

function cleanTerm(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/^[\s"'“”‘’.,;:!?()-]+|[\s"'“”‘’.,;:!?()-]+$/g, "")
    .trim()
    .toLowerCase()
    .slice(0, TERM_MAX_LENGTH);
}

/** Le repli quand la fonction est injoignable — voir l'en-tête. */
export function splitFoodTermsOffline(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const piece of String(text ?? "").split(/[,;\n/|]+|\s+(?:et|and|&)\s+/i)) {
    const term = cleanTerm(piece);
    if (!term || seen.has(term)) continue;
    seen.add(term);
    out.push(term);
    if (out.length >= TERMS_MAX) break;
  }
  return out;
}

export async function extractFoodTerms(args: {
  text: string;
  kind: FoodTermsKind;
}): Promise<{ terms: string[]; via: FoodTermsVia }> {
  const text = args.text.trim();
  if (!text) return { terms: [], via: "offline" };
  const { data, error } = await supabase.functions.invoke("food-terms-extract-v1", {
    body: { text, kind: args.kind, locale: uiLocale() },
  });
  if (error) return { terms: splitFoodTermsOffline(text), via: "offline" };
  const row = (data ?? {}) as { terms?: unknown; via?: unknown };
  if (!Array.isArray(row.terms) || !row.terms.every((t) => typeof t === "string")) {
    return { terms: splitFoodTermsOffline(text), via: "offline" };
  }
  const via: FoodTermsVia = row.via === "split" ? "split" : "model";
  return { terms: (row.terms as string[]).map(cleanTerm).filter(Boolean), via };
}
