import { supabase } from "../../lib/supabase";

// LE PDF D'UNE COMPOSITION — `meal-document-v1`, enfin relié à un écran.
//
// ── ENCORE UN MOTEUR SANS APPELANT ─────────────────────────────────────────
// La fonction existe, complète: elle construit le PDF (`_shared/keel/meal_pdf`),
// le dépose dans un bucket privé, écrit `student_meal_documents`, et rend une
// URL signée. Le seul endroit du dépôt qui la nommait était la liste du
// coverage-guard. Un élève ne pouvait pas emporter sa liste au magasin.
//
// ── `send` RESTE À FAUX, ET C'EST LE POINT ─────────────────────────────────
// La fonction sait aussi ANNONCER le document dans la bulle. C'est opt-in côté
// serveur, et ça le reste ici: un bouton « exporter » est un geste silencieux.
// L'élève qui télécharge sa liste n'a pas demandé un message, et lui en écrire
// un ferait de chaque export une notification.
//
// ── LE PDF PORTE LA LISTE ENTIÈRE ──────────────────────────────────────────
// Il est construit côté serveur à partir de la LIGNE, donc il ignore les « j'ai
// déjà ça » cochés à l'écran — qui sont volontairement éphémères et ne quittent
// jamais le navigateur. L'écran le dit avant qu'on clique; le découvrir au
// supermarché serait pire.

export interface MealDocument {
  documentId: string;
  filename: string;
  /** Signée, valable une heure. Le bucket est privé et le reste. */
  downloadUrl: string | null;
}

/**
 * Construit le PDF de cette composition et rend de quoi le télécharger.
 *
 * Les motifs d'échec du moteur (`meal_id_required`, `meal_not_found`) remontent
 * NOMMÉS: les traduire en « une erreur est survenue » perdrait la seule
 * information qui permet de comprendre.
 */
export async function requestMealDocument(mealId: string): Promise<MealDocument> {
  const { data, error } = await supabase.functions.invoke("meal-document-v1", {
    body: { meal_id: mealId },
  });
  if (error) {
    const detail = await readInvokeError(error);
    throw new Error(detail || `[keel/mealDocument] ${error.message}`);
  }
  const payload = (data ?? {}) as Record<string, unknown>;
  const doc = (payload.document ?? {}) as Record<string, unknown>;
  return {
    documentId: String(doc.id ?? ""),
    filename: String(doc.filename ?? "shopping-list.pdf"),
    downloadUrl: typeof payload.download_url === "string"
      ? payload.download_url
      : null,
  };
}

async function readInvokeError(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown })?.context;
  if (!context || typeof (context as Response).json !== "function") return null;
  try {
    const body = await (context as Response).json();
    const named = String((body as Record<string, unknown>)?.error ?? "").trim();
    return named || null;
  } catch {
    return null;
  }
}
