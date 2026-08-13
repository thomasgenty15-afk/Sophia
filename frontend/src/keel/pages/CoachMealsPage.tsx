import React from "react";

import { supabase } from "../../lib/supabase";
import { loadSlotVocabulary } from "../api/keelClient";
import { foodGroupLabel, slotLabel } from "../api/labels";
import {
  archiveRecipe,
  createRecipe,
  loadCoachRecipes,
  type MealIdea,
  restoreRecipe,
  signRecipeImages,
  uploadRecipeImage,
} from "../api/mealPlanModel";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";
import { t } from "../i18n/t";

/**
 * KEEL — /coach/meals. LA BIBLIOTHÈQUE DE RECETTES DU COACH.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CET ÉCRAN N'EXISTAIT PAS, ALORS QUE TOUT LE RESTE EXISTAIT
 * ---------------------------------------------------------------------------
 * Le 2026-08-04, la bibliothèque a été livrée ENTIÈREMENT sauf sa surface: la
 * table (`meal_ideas.image_path`, migration 20260804210000), le bucket privé,
 * la fonction edge `coach-recipe-image-v1`, la policy de lecture élève, l'écran
 * élève `/app/meals`, et jusqu'à l'API cliente complète dans
 * `api/mealPlanModel.ts` — `loadCoachRecipes`, `createRecipe`, `archiveRecipe`,
 * `restoreRecipe`, `uploadRecipeImage`, `signRecipeImages`. Six fonctions
 * exportées, ZÉRO appelant. Le coach pouvait donc « mettre des photos » au sens
 * où le serveur l'acceptait, et nulle part au sens où il l'aurait fait.
 *
 * D'où la règle en tête de `KeelAppShell`: une route sans lien est une
 * fonctionnalité que personne n'a. Ici il n'y avait même pas de route. Cet
 * écran arrive donc avec son entrée de nav dans le même changement.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CET ÉCRAN N'EST PAS, ET C'EST LE PLUS IMPORTANT
 * ---------------------------------------------------------------------------
 * Ce n'est PAS un planificateur. On n'y assigne rien à personne, il n'y a pas
 * de grille jour × créneau, pas de nom d'élève. Le coach écrit un plat UNE
 * fois et toute sa cohorte le lit — la policy `meal_ideas_student_read` rend
 * les recettes actives du coach sans exiger le moindre placement.
 *
 * C'est exactement ce que le pivot a acheté en supprimant `meal_plan_entries`:
 * un coach de quarante élèves ne compose pas quarante semaines. Toute
 * fonctionnalité ajoutée ici qui demanderait un geste PAR ÉLÈVE serait hors
 * modèle (docs/keel/MODEL.md).
 *
 * ---------------------------------------------------------------------------
 * LA PHOTO NE PASSE JAMAIS PAR LE NAVIGATEUR
 * ---------------------------------------------------------------------------
 * Il n'existe aucune policy sur `storage.objects` (arbitrage W1): `anon` et
 * `authenticated` sont structurellement incapables de toucher un bucket. Donc
 * l'upload ET l'affichage passent par `coach-recipe-image-v1`, qui tient le
 * service role et vérifie la propriété. Ce qu'on stocke en base est un CHEMIN;
 * l'affichage demande une URL signée courte à chaque rendu — la stocker la
 * ferait expirer dans la colonne.
 *
 * ORDRE OBLIGÉ À LA CRÉATION: la ligne d'abord, la photo ensuite. Le chemin est
 * `<coach_id>/<recipe_id>.<ext>` et la fonction edge refuse un `recipe_id` qui
 * n'est pas déjà une recette du coach. Il n'y a donc pas de photo « en attente
 * de sa recette », et pas d'objet orphelin si la création échoue.
 */

/** Le plafond de la fonction edge (`MAX_DECODED_BYTES`), redit ici pour que le
 *  refus arrive AVANT de lire 8 Mo en base64 dans l'onglet du coach. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

interface FoodGroupRow {
  slug: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "no_coach" }
  | { kind: "ready" };

interface DraftRecipe {
  title: string;
  description: string;
  slotKey: string;
  groups: string[];
}

const BLANK: DraftRecipe = { title: "", description: "", slotKey: "", groups: [] };

export default function CoachMealsPage() {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [coachId, setCoachId] = React.useState<string | null>(null);
  const [recipes, setRecipes] = React.useState<MealIdea[]>([]);
  const [slots, setSlots] = React.useState<{ key: string }[]>([]);
  const [groups, setGroups] = React.useState<FoodGroupRow[]>([]);
  const [draft, setDraft] = React.useState<DraftRecipe>(BLANK);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);

  /**
   * Les URL signées, par chemin. Volontairement HORS du state des recettes:
   * une URL vit dix minutes, une recette vit des mois, et les mêler ferait
   * qu'un re-render de la liste périmerait des images encore valides.
   */
  const [signed, setSigned] = React.useState<Record<string, string>>({});

  const refreshRecipes = React.useCallback(async (id: string) => {
    const rows = await loadCoachRecipes(id);
    setRecipes(rows);
    // Un chemin qu'on n'a pas le droit de voir est OMIS de la réponse, jamais
    // remplacé par une URL vide: la recette s'affiche alors sans photo, ce qui
    // est vrai.
    const paths = rows.map((r) => r.image_path).filter((p): p is string => !!p);
    setSigned(paths.length > 0 ? await signRecipeImages(paths) : {});
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) throw new Error("no session");

        const coach = await supabase
          .from("coaches")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        if (coach.error) throw new Error(coach.error.message);
        const id = (coach.data as { id: string } | null)?.id ?? null;
        if (!id) {
          if (!cancelled) setState({ kind: "no_coach" });
          return;
        }

        const [slotRows, groupRows] = await Promise.all([
          loadSlotVocabulary(),
          supabase.from("food_groups").select("slug"),
        ]);
        if (groupRows.error) throw new Error(groupRows.error.message);

        await refreshRecipes(id);
        if (cancelled) return;
        setCoachId(id);
        setSlots(slotRows as unknown as { key: string }[]);
        setGroups((groupRows.data ?? []) as FoodGroupRow[]);
        setState({ kind: "ready" });
      } catch (error) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshRecipes]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setFailure(null);
    try {
      await fn();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const submit = () =>
    run("create", async () => {
      if (!coachId) return;
      const title = draft.title.trim();
      if (title === "") throw new Error(t("coach.meals.title_required"));
      await createRecipe({
        coachId,
        title,
        description: draft.description.trim() || null,
        slotKey: draft.slotKey || null,
        foodGroupRefs: draft.groups,
        contentLocale: "en",
      });
      setDraft(BLANK);
      await refreshRecipes(coachId);
    });

  /**
   * La photo, après coup, sur une recette qui existe déjà.
   *
   * Le refus de taille est LOCAL et arrive avant la lecture du fichier: la
   * fonction edge le refuserait de toute façon, mais après que le coach ait
   * attendu l'encodage base64 de plusieurs mégaoctets pour rien.
   */
  const attachPhoto = (recipe: MealIdea, file: File | null) =>
    run(`photo:${recipe.id}`, async () => {
      if (!file || !coachId) return;
      if (file.size > MAX_PHOTO_BYTES) {
        throw new Error(t("coach.meals.photo_too_big"));
      }
      await uploadRecipeImage({ recipeId: recipe.id, file });
      await refreshRecipes(coachId);
    });

  const toggleArchive = (recipe: MealIdea) =>
    run(`status:${recipe.id}`, async () => {
      if (!coachId) return;
      if (recipe.status === "archived") {
        await restoreRecipe(recipe.id, coachId);
      } else {
        await archiveRecipe(recipe.id, coachId);
      }
      await refreshRecipes(coachId);
    });

  if (state.kind === "loading") {
    return (
      <KeelAppShell variant="coach" title={t("coach.meals.title")}>
        <p className="text-sm text-ink-soft">{t("coach.meals.loading")}</p>
      </KeelAppShell>
    );
  }
  if (state.kind === "no_coach") {
    return (
      <KeelAppShell variant="coach" title={t("coach.meals.title")}>
        <Card tone="dashed" className="p-8 text-center">
          <p className="max-w-[62ch] text-sm text-ink-soft">{t("coach.meals.no_coach_profile")}</p>
        </Card>
      </KeelAppShell>
    );
  }
  if (state.kind === "error") {
    return (
      <KeelAppShell variant="coach" title={t("coach.meals.title")}>
        <Card tone="warning">
          <p className="text-sm text-ink">{t("coach.meals.load_error")}</p>
          <p className="mt-1 break-words text-xs text-ink-soft">{state.message}</p>
        </Card>
      </KeelAppShell>
    );
  }

  const active = recipes.filter((r) => r.status !== "archived");
  const archived = recipes.filter((r) => r.status === "archived");

  return (
    <KeelAppShell
      variant="coach"
      title={t("coach.meals.title")}
      subtitle={t("coach.meals.subtitle")}
    >
      <div className="space-y-6">
        {failure ? (
          <Card tone="warning">
            <p className="break-words text-sm text-ink">{failure}</p>
          </Card>
        ) : null}

        <Card>
          <SectionLabel>{t("coach.meals.add_title")}</SectionLabel>
          <div className="mt-4 space-y-4">
            <Field
              label={t("coach.meals.field_title")}
              htmlFor="recipe-title"
              hint={t("coach.meals.field_title_hint")}
            >
              <input
                id="recipe-title"
                className={inputClass}
                maxLength={120}
                value={draft.title}
                onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
              />
            </Field>

            <Field
              label={t("coach.meals.field_description")}
              htmlFor="recipe-description"
              hint={t("coach.meals.field_description_hint")}
            >
              <textarea
                id="recipe-description"
                rows={4}
                maxLength={2000}
                className={inputClass}
                value={draft.description}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, description: e.target.value }))}
              />
            </Field>

            {/* Les créneaux viennent de `slot_vocabulary`, jamais d'une liste
                tapée dans un fichier React: c'est la même table qui donne les
                titres de l'écran élève. */}
            <Field
              label={t("coach.meals.field_slot")}
              htmlFor="recipe-slot"
              hint={t("coach.meals.field_slot_hint")}
            >
              <select
                id="recipe-slot"
                className={inputClass}
                value={draft.slotKey}
                onChange={(e) => setDraft((p) => ({ ...p, slotKey: e.target.value }))}
              >
                <option value="">{t("coach.meals.field_slot_any")}</option>
                {slots.map((s) => (
                  <option key={s.key} value={s.key}>{slotLabel(s.key)}</option>
                ))}
              </select>
            </Field>

            {/* `food_groups.slug` est le SEUL vocabulaire alimentaire du
                produit. Pas de grammes, pas de calories — refusé au contrat, et
                un trigger valide ce tableau contre la table. */}
            <Field
              label={t("coach.meals.field_groups")}
              hint={t("coach.meals.field_groups_hint")}
            >
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => {
                  const on = draft.groups.includes(g.slug);
                  return (
                    <button
                      key={g.slug}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setDraft((p) => ({
                          ...p,
                          groups: on
                            ? p.groups.filter((s) => s !== g.slug)
                            : [...p.groups, g.slug],
                        }))}
                      className={[
                        // Un groupe coché est un CHOIX, donc une action: la
                        // marque a le droit d'y entrer (charte §2), ce que
                        // `bg-gray-900` disait déjà sans jeton.
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        on
                          ? "border-fig-700 bg-fig-700 text-paper"
                          : "border-line-strong bg-paper text-ink-soft hover:bg-fig-50",
                      ].join(" ")}
                    >
                      {foodGroupLabel(g.slug)}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Button
              variant="primary"
              onClick={submit}
              disabled={busy !== null || draft.title.trim() === ""}
            >
              {busy === "create" ? t("coach.meals.submitting") : t("coach.meals.submit")}
            </Button>
          </div>
        </Card>

        <section>
          <SectionLabel>{t("coach.meals.list_title")}</SectionLabel>
          <p className="mt-1 text-xs text-ink-soft">
            {t("coach.meals.count_active", { count: active.length })}
            {archived.length > 0
              ? ` · ${t("coach.meals.count_archived", { count: archived.length })}`
              : ""}
          </p>

          {recipes.length === 0 ? (
            <Card tone="dashed" className="mt-3 p-8 text-center">
              <h2 className="text-base font-semibold text-ink">
                {t("coach.meals.empty_title")}
              </h2>
              <p className="mx-auto mt-2 max-w-[62ch] text-sm leading-6 text-ink-soft">
                {t("coach.meals.empty_body")}
              </p>
            </Card>
          ) : (
            <ul className="mt-3 space-y-3">
              {recipes.map((recipe) => (
                <RecipeRow
                  key={recipe.id}
                  recipe={recipe}
                  imageUrl={recipe.image_path ? signed[recipe.image_path] ?? null : null}
                  busy={busy}
                  onPhoto={(file) => attachPhoto(recipe, file)}
                  onToggleArchive={() => toggleArchive(recipe)}
                />
              ))}
            </ul>
          )}

          <p className="mt-3 max-w-[62ch] text-xs leading-5 text-ink-soft">
            {t("coach.meals.archive_hint")}
          </p>
        </section>
      </div>
    </KeelAppShell>
  );
}

/**
 * UNE RECETTE DE LA BIBLIOTHÈQUE.
 *
 * L'état `archived` est un BADGE et une opacité, pas une disparition: la
 * recette reste celle du coach, et le seul geste de retrait est de la rendre
 * invisible aux élèves. Rien sur cet écran ne supprime — ça casserait aussi
 * l'objet photo, que rien ne nettoierait.
 */
function RecipeRow({
  recipe,
  imageUrl,
  busy,
  onPhoto,
  onToggleArchive,
}: {
  recipe: MealIdea;
  imageUrl: string | null;
  busy: string | null;
  onPhoto: (file: File | null) => void;
  onToggleArchive: () => void;
}) {
  const archivedRow = recipe.status === "archived";
  const uploading = busy === `photo:${recipe.id}`;

  return (
    <li>
      <Card className={archivedRow ? "opacity-60" : ""}>
        <div className="flex flex-wrap gap-4 sm:flex-nowrap">
          <div className="w-full sm:w-40 sm:shrink-0">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={t("coach.meals.photo_alt", { title: recipe.title })}
                className="h-32 w-full rounded-card object-cover sm:h-28"
              />
            ) : (
              <div className="flex h-32 w-full items-center justify-center rounded-card border border-dashed border-line-strong sm:h-28">
                <span className="text-xs text-ink-soft" aria-hidden="true">—</span>
              </div>
            )}
            {/* Un <input type="file"> caché dans un <label>: le contrôle natif
                ne se style pas, et le coach ne doit voir qu'un bouton. */}
            <label className="mt-2 block cursor-pointer text-xs font-medium text-fig-700 underline">
              {uploading
                ? t("coach.meals.photo_uploading")
                : recipe.image_path
                ? t("coach.meals.photo_replace")
                : t("coach.meals.photo_add")}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={busy !== null}
                onChange={(e) => {
                  onPhoto(e.target.files?.[0] ?? null);
                  // Remis à zéro: sans ça, re-choisir LE MÊME fichier après un
                  // échec n'émet pas de `change` et le bouton paraît mort.
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-ink">{recipe.title}</span>
              <Badge tone={archivedRow ? "neutral" : "positive"}>
                {archivedRow
                  ? t("coach.meals.status_archived")
                  : t("coach.meals.status_active")}
              </Badge>
            </div>

            <p className="mt-1 text-xs text-ink-soft">
              {recipe.slot_key ? slotLabel(recipe.slot_key) : t("coach.meals.any_slot")}
            </p>

            {recipe.description ? (
              <p className="mt-2 max-w-[62ch] whitespace-pre-line text-sm leading-6 text-ink">
                {recipe.description}
              </p>
            ) : null}

            {recipe.food_group_refs.length > 0 ? (
              <p className="mt-2 text-xs text-ink-soft">
                {recipe.food_group_refs.map(foodGroupLabel).join(" · ")}
              </p>
            ) : null}

            <div className="mt-3">
              <Button size="sm" onClick={onToggleArchive} disabled={busy !== null}>
                {archivedRow ? t("coach.meals.restore") : t("coach.meals.archive")}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </li>
  );
}
