// CE QUE L'ÉLÈVE A DIT SUR SA BOUFFE — de la conversation à la composition.
//
// ── LA BOUCLE OUVERTE QUE ÇA FERME ─────────────────────────────────────────
// L'élève écrit « je déteste le brocoli » dans la bulle. Le memorizer l'extrait
// (mesuré le 2026-08-03 sur un vrai élève KEEL: l'aversion, deux contextes de
// vie, et même une rétractation résolue). Et les deux générateurs de plan n'en
// savaient RIEN — vérifié par grep, aucune occurrence de `memory_items`. Le
// plan composé trois jours plus tard remettait du brocoli.
//
// ── MIROIR DE `_shared/keel/food_preference_promotion.ts` ──────────────────
// Même posture que `mealTicks.ts` vis-à-vis de `meal_tick.ts`: la règle vit
// côté serveur, ce fichier la reflète pour l'écran. Les tests des deux côtés
// portent les mêmes cas, et le module serveur reste la référence.
//
// ── AUCUNE FONCTION EDGE ───────────────────────────────────────────────────
// `rls_memory_items_select_own` autorise l'élève à lire ses propres souvenirs,
// et `student_goals` est déjà écrit depuis l'écran par les deux cartes
// voisines. Rien ici n'a besoin de service_role.

import { supabase } from "../../lib/supabase";

/** La clé lue par les deux générateurs. */
export const FOOD_PREFERENCES_KEY = "food_preferences";
/** Les ids déjà traités. JAMAIS servi au modèle (garde côté serveur). */
export const FOOD_PREFERENCES_DISMISSED_KEY = "food_preferences_dismissed";

/** La clé alimentaire de `memory/domain_keys.v1.json`. */
const FOOD_DOMAIN_KEY = "sante.alimentation";
/** Le memorizer refuse déjà de créer sous 0,55; on demande plus pour proposer. */
const MIN_CONFIDENCE = 0.7;

export interface FoodPreferenceProposal {
  memoryItemId: string;
  text: string;
}

interface MemoryRow {
  id: string;
  kind: string;
  status: string;
  content_text: string;
  normalized_summary: string | null;
  domain_keys: string[] | null;
  confidence: number | null;
  sensitivity_level: string | null;
}

export function keptFrom(pc: Record<string, unknown> | null | undefined): string[] {
  const raw = (pc ?? {})[FOOD_PREFERENCES_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v ?? "").trim()).filter(Boolean);
}

export function dismissedFrom(
  pc: Record<string, unknown> | null | undefined,
): string[] {
  const raw = (pc ?? {})[FOOD_PREFERENCES_DISMISSED_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v ?? "").trim()).filter(Boolean);
}

/**
 * Les propositions à montrer.
 *
 * Elles ne sont JAMAIS persistées avant d'être gardées, et c'est délibéré: tout
 * ce qui entre dans `practical_constraints` part dans le prompt du générateur
 * de plan hebdo, qui sérialise le jsonb en entier. Une proposition rangée là
 * serait servie au modèle comme un fait acquis avant que l'élève ne l'ait vue.
 */
export async function loadFoodPreferenceProposals(args: {
  userId: string;
  practicalConstraints: Record<string, unknown> | null;
}): Promise<FoodPreferenceProposal[]> {
  const kept = new Set(keptFrom(args.practicalConstraints).map((k) => k.toLowerCase()));
  const dismissed = new Set(dismissedFrom(args.practicalConstraints));

  const { data, error } = await supabase
    .from("memory_items")
    .select(
      "id, kind, status, content_text, normalized_summary, domain_keys, confidence, sensitivity_level",
    )
    .eq("user_id", args.userId)
    // LA LIGNE MÉDICALE, posée DANS la requête et pas seulement au filtrage:
    // `sensitive` et `safety` ne doivent même pas traverser le réseau vers un
    // écran de préférences. Le dur a sa table.
    .eq("sensitivity_level", "normal")
    // `active` seulement: `candidate` = le système de mémoire ne l'a pas
    // retenu, `hidden_by_user` = l'élève a déjà dit non.
    .eq("status", "active")
    .contains("domain_keys", [FOOD_DOMAIN_KEY])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`[keel/api] loadFoodPreferenceProposals: ${error.message}`);

  const out: FoodPreferenceProposal[] = [];
  const seen = new Set<string>();
  for (const row of (data ?? []) as MemoryRow[]) {
    const id = String(row.id ?? "").trim();
    if (!id || dismissed.has(id)) continue;
    // `event` est un fait daté (« j'ai mangé une pizza mardi »), pas un goût:
    // le promouvoir mettrait une pizza dans toutes les semaines à venir.
    if (row.kind !== "fact" && row.kind !== "statement") continue;
    if (Number(row.confidence ?? 0) < MIN_CONFIDENCE) continue;

    const text = String(row.normalized_summary ?? "").trim() ||
      String(row.content_text ?? "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (kept.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ memoryItemId: id, text });
  }
  return out;
}

/**
 * Écrit la décision, SANS écraser les autres clés.
 *
 * Motif des deux cartes voisines: chacune possède ses clés et fusionne le
 * reste. Deux cartes ouvertes côte à côte ne doivent pas se désécrire.
 */
export async function saveFoodPreferences(args: {
  userId: string;
  practicalConstraints: Record<string, unknown> | null;
  kept: readonly string[];
  dismissed: readonly string[];
}): Promise<void> {
  const { error } = await supabase
    .from("student_goals")
    .update({
      practical_constraints: {
        ...(args.practicalConstraints ?? {}),
        [FOOD_PREFERENCES_KEY]: args.kept.map((k) => k.trim()).filter(Boolean),
        [FOOD_PREFERENCES_DISMISSED_KEY]: [...new Set(args.dismissed)],
      },
    })
    .eq("user_id", args.userId);
  if (error) throw new Error(`[keel/api] saveFoodPreferences: ${error.message}`);
}
