// KEEL — LA BIBLIOTHÈQUE DE RECETTES DU COACH.
//
// CE QUI A CHANGÉ, ET POURQUOI
// ----------------------------
// Ce module composait la semaine de repas d'UN élève: `meal_plan_entries`
// plaçait une recette sur un jour et un créneau pour une personne nommée. C'est
// de la planification 1:1, et KEEL est 1:N — le coach écrit UN programme et UNE
// doctrine, l'élève compose sa semaine (PLAN-NUIT, amendement 2). Un coach de
// quarante élèves ne compose pas quarante semaines.
//
// Pire, la policy de lecture de l'élève EXIGEAIT ce placement: une recette
// écrite mais non épinglée n'était visible par personne, et l'écran élève
// affichait « votre coach n'a pas encore proposé d'idées » à un coach qui en
// avait écrit vingt. La bibliothèque était structurellement invisible.
//
// Désormais: le coach publie une bibliothèque GLOBALE, tous ses élèves la
// lisent. `meal_plan_entries` a été supprimée (migration 20260804210000).
//
// LA PHOTO NE PASSE PAS PAR ICI. Il n'existe aucune policy sur
// `storage.objects`: le navigateur est structurellement incapable de toucher un
// bucket (arbitrage W1). L'upload et la signature passent par
// `coach-recipe-image-v1`, qui tient le service role et vérifie la propriété.

import { supabase } from "../../lib/supabase";

export interface MealIdea {
  id: string;
  coach_id: string;
  title: string;
  description: string | null;
  slot_key: string | null;
  food_group_refs: string[];
  image_path: string | null;
  content_locale: string;
  status: string;
  created_at: string;
}

const COLUMNS =
  "id, coach_id, title, description, slot_key, food_group_refs, image_path, " +
  "content_locale, status, created_at";

/**
 * R7 à la frontière réseau. Le client navigateur n'a pas de générique
 * `Database`, donc PostgREST type chaque `.select(...)` en
 * `GenericStringError`. Même convention que `keelClient.ts :: unwrap`: la forme
 * opaque est traversée ici, une seule fois.
 */
function unwrap(
  result: { data: unknown; error: { message: string } | null },
  what: string,
): unknown {
  if (result.error) {
    throw new Error(`[keel/recipes] ${what} failed: ${result.error.message}`);
  }
  if (result.data === null || result.data === undefined) {
    throw new Error(`[keel/recipes] ${what} returned no row (write-through violated)`);
  }
  return result.data;
}

/**
 * Les recettes du coach connecté — actives ET archivées.
 *
 * Le coach voit ses archives: une recette retirée de la vue des élèves reste la
 * sienne, et la faire disparaître de son propre écran l'obligerait à la
 * réécrire pour la republier.
 */
export async function loadCoachRecipes(coachId: string): Promise<MealIdea[]> {
  const result = await supabase
    .from("meal_ideas")
    .select(COLUMNS)
    .eq("coach_id", coachId)
    .order("created_at", { ascending: false });
  if (result.error) {
    throw new Error(`[keel/recipes] load failed: ${result.error.message}`);
  }
  return (result.data ?? []) as unknown as MealIdea[];
}

/**
 * Les recettes que l'ÉLÈVE peut voir.
 *
 * Aucun filtre sur le coach ici: la policy `meal_ideas_student_read` ne rend que
 * les recettes actives des coachs actifs de cet élève. Refiltrer côté client
 * donnerait une seconde définition de « visible », et c'est la divergence entre
 * les deux qui produit les fuites.
 */
export async function loadStudentRecipes(): Promise<MealIdea[]> {
  const result = await supabase
    .from("meal_ideas")
    .select(COLUMNS)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (result.error) {
    throw new Error(`[keel/recipes] student load failed: ${result.error.message}`);
  }
  return (result.data ?? []) as unknown as MealIdea[];
}

export interface CreateRecipeInput {
  coachId: string;
  title: string;
  description: string | null;
  slotKey: string | null;
  foodGroupRefs: string[];
  contentLocale: string;
}

/** Écrit la recette et rend la ligne RELUE. */
export async function createRecipe(input: CreateRecipeInput): Promise<MealIdea> {
  return unwrap(
    await supabase
      .from("meal_ideas")
      .insert({
        coach_id: input.coachId,
        author_kind: "coach",
        title: input.title,
        description: input.description,
        slot_key: input.slotKey,
        food_group_refs: input.foodGroupRefs,
        content_locale: input.contentLocale,
        status: "active",
      })
      .select(COLUMNS)
      .single(),
    "create",
  ) as MealIdea;
}

/**
 * Retire une recette de la vue des élèves. Ce n'est PAS une suppression: la
 * ligne passe en `archived`, et le coach la garde. Supprimer casserait aussi
 * l'objet photo sans que rien ne le nettoie.
 */
export async function archiveRecipe(id: string, coachId: string): Promise<MealIdea> {
  return unwrap(
    await supabase
      .from("meal_ideas")
      .update({ status: "archived" })
      .eq("id", id)
      .eq("coach_id", coachId)
      .select(COLUMNS)
      .single(),
    "archive",
  ) as MealIdea;
}

export async function restoreRecipe(id: string, coachId: string): Promise<MealIdea> {
  return unwrap(
    await supabase
      .from("meal_ideas")
      .update({ status: "active" })
      .eq("id", id)
      .eq("coach_id", coachId)
      .select(COLUMNS)
      .single(),
    "restore",
  ) as MealIdea;
}

// ---------------------------------------------------------------------------
// LA PHOTO — par la fonction edge, jamais par le bucket directement
// ---------------------------------------------------------------------------

// `unknown` ne satisfait pas `FunctionInvokeOptions['body']` de supabase-js, et
// les deux appelants passent un objet littéral: on dit ce qui est vrai.
async function callRecipeImage(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("coach-recipe-image-v1", {
    body,
  });
  if (error) {
    throw new Error(`[keel/recipes] image call failed: ${error.message}`);
  }
  return (data ?? {}) as Record<string, unknown>;
}

/**
 * Téléverse la photo d'une recette. Le fichier est lu en base64 ici; la
 * fonction edge vérifie les OCTETS (pas l'en-tête déclaré) et refuse un
 * désaccord entre les deux.
 */
export async function uploadRecipeImage(args: {
  recipeId: string;
  file: File;
}): Promise<string> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("could not read the file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(args.file);
  });
  const out = await callRecipeImage({
    action: "upload",
    recipe_id: args.recipeId,
    mime_type: args.file.type,
    base64,
  });
  const path = String(out.image_path ?? "").trim();
  if (!path) throw new Error("[keel/recipes] upload returned no path");
  return path;
}

/**
 * Des URL signées, courtes, pour afficher les photos.
 *
 * Un chemin qu'on n'a pas le droit de voir est OMIS de la réponse, jamais
 * remplacé par une URL vide: la recette s'affiche alors sans photo, ce qui est
 * vrai. La map est donc à consulter avec `?.`, et l'absence est normale.
 */
export async function signRecipeImages(
  paths: readonly string[],
): Promise<Record<string, string>> {
  const wanted = [...new Set(paths.filter((p) => p && p.trim() !== ""))];
  if (wanted.length === 0) return {};
  const out = await callRecipeImage({ action: "sign", paths: wanted });
  const urls = out.urls;
  return (urls && typeof urls === "object" ? urls : {}) as Record<string, string>;
}
