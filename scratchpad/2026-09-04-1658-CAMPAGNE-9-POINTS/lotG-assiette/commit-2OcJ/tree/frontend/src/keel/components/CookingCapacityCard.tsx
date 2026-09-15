import React from "react";

import { supabase } from "../../lib/supabase";
import { t } from "../i18n/t";
import { mergePracticalConstraints } from "../api/practicalConstraints";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
import { Field, inputClass } from "./ui/Field";

// CE QUE L'ÉLÈVE PEUT VRAIMENT FAIRE — les quatre contraintes que le moteur
// devine aujourd'hui à sa place.
//
// POURQUOI CETTE CARTE
// --------------------
// Le générateur compose des sessions de cuisine, des préparations et une liste
// de courses sans rien savoir de quatre choses qui décident de tout:
//
//   quels jours on peut cuisiner  — il propose dimanche à quelqu'un qui
//                                    travaille le dimanche;
//   combien de temps par session  — il écrit une session de 50 minutes à
//                                    quelqu'un qui en a vingt;
//   quel niveau de recette        — il propose un curry en huit étapes à
//                                    quelqu'un qui sait faire cuire des pâtes.
//
// Un plan parfait et inapplicable est la première cause d'abandon; c'est écrit
// noir sur blanc dans le commentaire de `student_goals.situation`, et ces
// trois-là sont exactement ce qui le rend inapplicable.
//
// ── LE BUDGET EST PARTI D'ICI LE 2026-08-13, ET C'EST UNE DÉCISION ────────
// Il y avait une quatrième entrée: « serré / normal / confortable ». Elle a
// été retirée pour DEUX raisons qui tiennent ensemble.
//
// Le mot d'abord: il partait au modèle tel quel, et « serré » ne désigne pas
// la même semaine pour une personne seule et pour une table de cinq. C'est
// maintenant un MONTANT, qui se compare à un panier.
//
// Le lieu ensuite: un réglage de profil s'écrit une fois et s'applique en
// silence à toutes les semaines suivantes, y compris celle où on reçoit du
// monde et celle d'après les vacances. La question se pose donc À CHAQUE
// COMPOSITION, sur l'écran qui compose (`MealBuilder`, l'entrée, le foyer),
// avec le dernier chiffre pré-rempli — un défaut proposé, pas un réglage
// caché. `practical_constraints.budget_amount` reste sa maison: c'est de là
// que le générateur le lit, et de là que le champ se pré-remplit.
//
// ── LE PATRON, ET IL EST EMPRUNTÉ ──────────────────────────────────────────
// `EatingRhythmCard` possède UNE clé de `practical_constraints` et fait
// `{ ...practicalConstraints, eating_rhythm }` pour ne pas écraser le reste.
// Cette carte possède les siennes et applique la même discipline: deux cartes
// écrivent la même colonne jsonb, et celle qui étale mal efface le travail de
// l'autre sans un bruit.
//
// `cooking_time_min` existait dans la colonne depuis le premier jour du pivot
// — lue par le générateur, remplie par personne. Cette carte est ce qui la
// réveille; `cook_days`, `recipe_difficulty` et `variety` sont neuves.

// ⚠️ LE `COPY` LOCAL DE CETTE CARTE EST PARTI DANS LE SEED (lot 6), sous
// `plan.cooking.*`. Vingt-huit phrases hors de `t()`, donc invisibles à la garde
// de langue comme au scanner de coutures — et l'un des trois catalogues
// parallèles qui empêchaient `/app/plan` de basculer.


export interface CookingCapacityCardProps {
  /** `false` tant qu'aucune ligne `student_goals` n'existe: rien à mettre à jour. */
  hasGoal: boolean;
  /** Dans la fenêtre de réglages: sans cadre, sans titre, sans repli. */
  embedded?: boolean;
  /** Les autres clés de `practical_constraints`, à ne pas écraser. */
  practicalConstraints: Record<string, unknown>;
  onSaved: () => void | Promise<void>;
}

function readString(raw: unknown, allowed: readonly string[], fallback: string): string {
  const value = String(raw ?? "").trim();
  return allowed.includes(value) ? value : fallback;
}

export default function CookingCapacityCard(props: CookingCapacityCardProps) {
  const pc = props.practicalConstraints ?? {};
  const [open, setOpen] = React.useState(false);
  const [difficulty, setDifficulty] = React.useState(
    () => readString(pc.recipe_difficulty, ["simple", "normal", "keen"], "normal"),
  );
  const [variety, setVariety] = React.useState(
    () => readString(pc.variety, ["repeat", "some", "varied"], "some"),
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);


  async function save() {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("not signed in");

      // La fusion, et la garantie qu'une ligne a bougé, appartiennent au
      // module: un update qui ne matche rien répond 204 sans erreur, et cette
      // carte affichait alors « Saved » sur une saisie partie nulle part.
      await mergePracticalConstraints({
        userId: uid,
        current: props.practicalConstraints,
        patch: {
          recipe_difficulty: difficulty,
          variety,
        },
        source: "CookingCapacityCard",
      });
      setFlash(t("plan.cooking.saved"));
      await props.onSaved();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // LE FORMULAIRE, une seule fois — voir la même hissée dans `EatingRhythmCard`.
  const editor = (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("plan.cooking.difficulty_label")} htmlFor="cap-difficulty">
                <select
                  id="cap-difficulty"
                  className={inputClass}
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  <option value="simple">{t("plan.cooking.difficulty_simple")}</option>
                  <option value="normal">{t("plan.cooking.difficulty_normal")}</option>
                  <option value="keen">{t("plan.cooking.difficulty_keen")}</option>
                </select>
              </Field>

              <Field label={t("plan.cooking.variety_label")} htmlFor="cap-variety">
                <select
                  id="cap-variety"
                  className={inputClass}
                  value={variety}
                  onChange={(e) => setVariety(e.target.value)}
                >
                  <option value="repeat">{t("plan.cooking.variety_repeat")}</option>
                  <option value="some">{t("plan.cooking.variety_some")}</option>
                  <option value="varied">{t("plan.cooking.variety_varied")}</option>
                </select>
              </Field>

            </div>

            {!props.hasGoal && (
              <p className="text-sm text-ink-soft">{t("plan.cooking.no_goal")}</p>
            )}
            {/* ROUGE = ÉCHEC, et la teinte ne bouge pas — seul le cran suit le
                kit: `red-700` est la valeur de `Field` (6,13:1 sur `paper`),
                `red-600` était en dessous. */}
            {error && <p className="text-sm text-red-700">{error}</p>}

            {/* ⛔ `secondary`, ET C'EST UNE DÉMOTION VOULUE. Cette carte est une
                des QUATRE sections de la même fenêtre, et les trois autres
                enregistrent en `secondary`: une seule action figue par vue
                rendue (kit §2). La figue de `/app/plan` appartient à « composer
                ma semaine » — le geste pour lequel on vient. */}
            <Button variant="secondary" onClick={() => void save()} disabled={busy || !props.hasGoal}>
              {busy ? t("plan.cooking.saving") : t("plan.cooking.save")}
            </Button>
          </div>
  );

  // Dans la fenêtre: `SetupSection` porte le cadre, la couleur et le titre.
  if (props.embedded) {
    return (
      <>
        {editor}
        {flash && <p className="mt-3 text-sm text-emerald-700">{flash}</p>}
      </>
    );
  }

  return (
    // MÊME EN-TÊTE QUE LES CARTES VOISINES, et c'est le sujet.
    //
    // Cette carte portait son titre HORS de l'encadré et son ouverture dans un
    // BOUTON posé sous le résumé, là où « Your goal » et « How your day runs »
    // ont un lien « Change » discret en haut à droite. Trois cartes qui font la
    // même chose de trois façons obligent à relire chacune pour comprendre
    // qu'elles se plient toutes — et le bouton pleine hauteur ajoutait une
    // ligne de plus à un empilement déjà long avant les repas.
    <Card>
      <div className="flex items-start justify-between gap-3">
        <SectionLabel className="mb-0">{t("plan.cooking.title")}</SectionLabel>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          // UN LIEN, DONC LA MARQUE (charte §2: « la teinte de marque marque la
          // navigation et l'action »). `fig-700` sur `paper` = 9,98:1.
          className="shrink-0 text-xs font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
        >
          {open ? t("plan.cooking.summary_close") : t("plan.cooking.summary_edit")}
        </button>
      </div>

      <>
        {/* LE RÉSUMÉ NE LISTE PLUS LES JOURS DE CUISINE: ils ne vivent plus
            ici. Ce qui reste dans cette carte est ce qui décrit la CUISINE de
            quelqu'un (le niveau de recette, la répétition acceptée), pas la
            semaine qu'il est en train de commander. */}
        {!open && flash && (
          <div className="mt-2">
            <p className="text-sm text-emerald-700">{flash}</p>
          </div>
        )}

        {open && <div className="mt-4">{editor}</div>}
      </>
    </Card>
  );
}
