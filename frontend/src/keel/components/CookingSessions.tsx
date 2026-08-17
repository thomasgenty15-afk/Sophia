import React from "react";

import {
  type CookingSession,
  type GeneratedDish,
  type MealPreparation,
  type MemberPortionView,
} from "../api/mealGeneration";
import { dishDayLabel, mealCopy } from "../api/mealLabels";
import { plural } from "../i18n/plural";
import { boxLinesFor } from "../lib/preparationBoxes";
import { daysFedBy } from "../lib/planGridModel";
import { Card } from "./ui/Card";
import Modal from "./ui/Modal";
import { BoxTable } from "./plan/BoxTable";

// LES SESSIONS DE CUISINE — quand on cuisine, et dans quel ordre.
//
// POURQUOI CETTE SECTION EXISTE
// -----------------------------
// Le plan disait QUOI manger et jamais QUAND cuisiner. « Make the whole batch
// once » apparaissait sur quatre jours différents sans qu'aucun ne soit le jour
// de la casserole, et l'élève devait deviner.
//
// LE DÉROULÉ EST LE CHAMP QUI COMPTE, et c'est le seul qu'un plat ne peut pas
// porter: l'ordre des gestes se joue ENTRE les préparations — le riz pendant
// que le four tourne, le chili qui mijote à côté. C'est ce qu'on lit le
// dimanche soir avant de commencer.
//
// ── LE TEMPS, EN DEUX NOMBRES ──────────────────────────────────────────────
// Le plan ne disait NULLE PART combien de temps quoi que ce soit prenait. Un
// plat annonçait « From Turkey meatballs — cooked on Thursday » et l'élève
// n'avait aucun moyen de savoir si son jeudi y passait vingt minutes ou deux
// heures. Ce n'était pas un défaut d'affichage: la donnée n'existait pas.
//
// Elle existe maintenant, et en DEUX nombres parce qu'ils répondent à deux
// questions différentes: « les mains dessus » décide si on s'y met ce soir,
// « en tout » décide si on a la fenêtre. Un rôti fait 10 actives et 50 totales,
// et c'est précisément cet écart qui rend le lot possible.
//
// ── LA RECETTE SE DÉPLIE ───────────────────────────────────────────────────
// Ingrédients et méthode de chaque préparation étaient dépliés en permanence,
// donc la SECTION — qui répond à « quand est-ce que je cuisine » — faisait
// plusieurs écrans et noyait sa propre réponse. Ce qui reste toujours visible
// est ce qu'on lit pour PLANIFIER: le jour, le déroulé, ce que ça produit,
// combien de temps. La recette est ce qu'on ouvre une fois devant la casserole.
//
// ── CE QU'UNE CASSEROLE NOURRIT (2026-08-14) ───────────────────────────────
// Le bloc « ce que tu cuisines » (`plan/KitchenBlock.tsx`) disait la même chose
// que cette fenêtre, en moins bien: mêmes préparations, mêmes jours de cuisson,
// sans le temps de session, sans les portions faites, sans le travail actif.
// Il est parti — SAUF une ligne, qu'il portait SEUL: les jours qu'une
// préparation nourrit. Vérifié avant le retrait: cette fenêtre ne recevait
// aucun plat, donc ce lien n'y était pas seulement absent, il y était
// impossible. Il est ici maintenant, sous chaque préparation.
//
// ── LES QUANTITÉS VIVENT ICI, PAS DANS LES PLATS ───────────────────────────
// Une préparation porte les ingrédients de TOUT le lot: 600 g de poulet pour
// quatre portions. Les plats qui y puisent n'affichent plus que ce qu'on ajoute
// à l'assiette. C'est le correctif du défaut mesuré — « chicken thighs 1,200 g »
// répété sur quatre jours, qui se lisait comme 4,8 kg à acheter.
//
// ── LA CHARTE, LE 2026-08-13 ──────────────────────────────────────────────
// Treize neutres `gray-*` sont passés aux jetons de la charte « la fiche »
// (`ink` · `ink-soft` · `line`), et cette fenêtre n'a AUCUNE couleur saturée:
// elle ne rend aucun état — pas un verdict, pas une adhérence, pas une alerte.
// Un jour de cuisine et une durée sont des données, pas des faits jugés.
// ⚠️ N'y introduis pas de teinte pour distinguer les sessions entre elles: la
// frontière est portée par la carte, le jour en tête et l'espace. Autorité:
// `docs/keel/CHARTE-VITRINE.md` §2.

export default function CookingSessions(
  { sessions, preparations, dishes, portions, open, onClose }: {
    sessions: readonly CookingSession[];
    preparations: readonly MealPreparation[];
    /**
     * ── LOT 4 · LES PARTS, POUR LES PRÉNOMS DES BOÎTES ────────────────────
     *
     * ⚠️ POUR LES PRÉNOMS, ET POUR RIEN D'AUTRE. `member_portions[].display_name`
     * EST le prénom de la ligne membre (F5, recopié par le moteur), et c'est la
     * seule source de prénom autorisée sur ce chemin — jamais un titre de plat,
     * jamais un prénom deviné dans une phrase.
     *
     * ⚠️ REQUISE, `[]` pour « aucune », JAMAIS `?` AVEC UN DÉFAUT — et ce n'est
     * pas une préférence de style, c'est un défaut MESURÉ le 2026-08-17 par la
     * vérification du LOT 4. Le `portions?` d'origine a laissé le montage de
     * `KitchenToday` (`/app/today`) sans parts sans un seul rouge: sa table de
     * pesée rendait « Une boîte — 120 g » trois fois de suite, trois grammages
     * différents et aucun nom — c'est-à-dire une instruction de pesée que
     * personne ne peut exécuter. « Paramètre de garde optionnel = garde
     * désarmée », et le reste de ce lot applique déjà la règle (`boxMemberIds`,
     * `preparations` sur `groupDayBySlot`, `dedicatedDishesAsked`).
     *
     * `[]` reste légitime et fréquent: un plan personnel n'a aucune part, et un
     * lecteur qui n'a pas le droit de les voir non plus. La table rend alors ses
     * grammes sans nom — l'instruction de pesée reste vraie — plutôt que de
     * disparaître ou d'afficher un identifiant. La différence est qu'un appelant
     * doit désormais l'ÉCRIRE.
     */
    portions: readonly MemberPortionView[];
    /**
     * ── CE QUE `KitchenBlock` PORTAIT, ET QU'IL EMPORTAIT EN PARTANT ───────
     *
     * Les plats, pour savoir QUELS JOURS chaque préparation nourrit. Un plat en
     * lot est déjà placé sur chacun des jours qu'il couvre; sans cette lecture,
     * « rôti du dimanche » ne dit pas qu'on en mange lundi, mardi ET mercredi,
     * et le lien « une casserole → trois jours » n'existe plus nulle part une
     * fois les jours repliés.
     *
     * ⚠️ MESURÉ LE 2026-08-14, ET C'EST CE QUI A DÉCIDÉ L'ORDRE DU CHANTIER:
     * cette fenêtre ne recevait AUCUN plat, donc le lien n'y était pas
     * seulement invisible — il était impossible. Retirer le bloc cuisine sans
     * ce prop aurait emporté le seul endroit qui montre qu'une cuisson nourrit
     * plusieurs jours.
     *
     * ⚠️ AUCUN CHAMP NEUF. `daysFedBy` dérive des `dish.uses` déjà rendus; un
     * second champ à tenir d'accord divergerait du premier.
     */
    dishes: readonly GeneratedDish[];
    /**
     * DANS UNE FENÊTRE, comme la liste de courses, et ouverte depuis le même
     * rang de boutons.
     *
     * Cette section vivait dépliée en bas de l'écran, après sept jours de
     * plats. Elle répond pourtant à une question qu'on se pose AVANT de lire
     * les repas — « quand est-ce que je cuisine » — et il fallait faire défiler
     * toute la semaine pour la trouver.
     *
     * LE COMPOSANT RESTE MONTÉ QUAND ELLE EST FERMÉE (`Modal` rend `null`, il
     * ne démonte pas): les recettes qu'on a dépliées survivent à un
     * aller-retour vers un plat.
     */
    open: boolean;
    onClose: () => void;
  },
) {
  // Les recettes ouvertes, par `id` de préparation. Un `Set` et pas un booléen
  // par session: on ouvre la recette qu'on cuisine, pas toutes celles du jour.
  const [openPreps, setOpenPreps] = React.useState<Set<string>>(new Set());
  const togglePrep = (id: string) =>
    setOpenPreps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (sessions.length === 0) return null;
  const byId = new Map(preparations.map((p) => [p.id, p]));

  return (
    <Modal open={open} onClose={onClose} title={mealCopy("meals.sessions.title")}>
      <p className="mb-3 text-sm text-ink-soft">
        {mealCopy("meals.sessions.subtitle")}
      </p>
      <div className="space-y-3">
        {sessions.map((session, index) => {
          const preps = session.preparation_ids
            .map((id) => byId.get(id))
            .filter((p): p is MealPreparation => p !== undefined);
          return (
            <Card key={`${session.day}-${index}`}>
              <h3 className="flex flex-wrap items-baseline gap-2 text-sm font-semibold text-ink">
                {dishDayLabel(session.day) ?? session.day}
                {/* LA DURÉE DE LA SESSION, au mur — c'est ce qu'on regarde pour
                    savoir si on cale ça ce soir. Elle vient du modèle et n'est
                    PAS la somme des préparations: les cuissons se chevauchent,
                    et additionner transformerait un dimanche confortable en une
                    corvée de quatre heures que personne ne commence. */}
                {session.total_minutes !== null && (
                  <span className="text-xs font-normal tabular-nums text-ink-soft">
                    {mealCopy("meals.sessions.session_time").replace(
                      "{n}",
                      String(session.total_minutes),
                    )}
                  </span>
                )}
              </h3>

              {session.run_through && (
                <p className="mt-2 text-sm leading-6 text-ink">
                  {session.run_through}
                </p>
              )}

              {preps.map((prep) => (
                <SessionPreparation
                  key={prep.id}
                  prep={prep}
                  feeds={daysFedBy(prep.id, dishes)}
                  portions={portions}
                  open={openPreps.has(prep.id)}
                  onToggle={() => togglePrep(prep.id)}
                />
              ))}
            </Card>
          );
        })}
      </div>
    </Modal>
  );
}

/**
 * UNE PRÉPARATION DANS SA SESSION — et elle est EXPORTÉE pour une seule raison.
 *
 * ⚠️ `ui/Modal` REND PAR `createPortal` VERS `document.body`, et ce dépôt teste
 * en environnement `node` (`vitest.config.ts`, ni jsdom ni testing-library): la
 * fenêtre entière ne peut PAS être montée par `renderToStaticMarkup`. Sans cette
 * extraction, la table de pesée et le pluriel réparé ne seraient vérifiables que
 * par des littéraux de source — et deux vérificateurs de ce chantier ont trouvé
 * cette semaine des tests de source VERTS sur du code mort. On teste la valeur
 * rendue, donc on extrait ce qui se rend.
 */
export function SessionPreparation(
  { prep, feeds, portions, open, onToggle }: {
    prep: MealPreparation;
    /** Les jours que cette casserole nourrit. `[]` = préparation orpheline. */
    feeds: readonly string[];
    portions: readonly MemberPortionView[];
    open: boolean;
    onToggle: () => void;
  },
) {
  return (
                <div
                  className="mt-4 border-t border-line pt-3 first:border-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-ink">
                      {prep.title}
                      {/* ── LE PLURIEL MORT, RÉPARÉ (LOT 4) ─────────────────
                          « — 1 servings » s'affichait sur toute préparation
                          d'UNE portion — le cas NOMINAL aux barreaux ② et ③ de
                          la fusion, donc précisément sur le plat dédié que le
                          chantier vient de rendre visible. `plural()` porte la
                          seule divergence des deux langues (`i18n/plural.ts`:
                          « 0 jour » contre « 0 days »), et les deux formes
                          viennent du seed — aucun « s » n'est fabriqué en
                          code (R7). */}
                      <span className="ml-2 font-normal text-ink-soft">
                        {plural(
                          prep.servings_made,
                          mealCopy("meals.sessions.makes_one", { n: prep.servings_made }),
                          mealCopy("meals.sessions.makes", { n: prep.servings_made }),
                        )}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={onToggle}
                      aria-expanded={open}
                      // ⚠️ PAS DE FIGUE ICI, ET C'EST LA FORME DU KIT. Déplier
                      // une recette n'est ni une navigation ni l'action
                      // principale de la fenêtre: c'est le contrôle de texte
                      // souligné que `ui/Modal` emploie déjà pour sa propre
                      // fermeture (`text-ink-soft … hover:text-ink`). Le
                      // soulignement porte l'affordance, la teinte ne la porte
                      // pas — et la fenêtre n'a ainsi aucune action marquée à se
                      // disputer avec l'écran qui l'a ouverte.
                      className="shrink-0 text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
                    >
                      {open
                        ? mealCopy("meals.sessions.recipe_hide")
                        : mealCopy("meals.sessions.recipe_show")}
                    </button>
                  </div>

                  {/* LES DEUX TEMPS RESTENT VISIBLES, RECETTE FERMÉE: c'est
                      l'information qu'on lit pour planifier, pas pour cuisiner.
                      La replier avec la recette obligerait à ouvrir chaque
                      préparation pour savoir si le jeudi tient. */}
                  {(prep.active_minutes !== null || prep.total_minutes !== null) && (
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-ink-soft">
                      {prep.active_minutes !== null && (
                        <span>
                          {mealCopy("meals.sessions.active").replace(
                            "{n}",
                            String(prep.active_minutes),
                          )}
                        </span>
                      )}
                      {prep.total_minutes !== null && (
                        <span>
                          {mealCopy("meals.sessions.total").replace(
                            "{n}",
                            String(prep.total_minutes),
                          )}
                        </span>
                      )}
                    </p>
                  )}

                  {/* CE QUE CETTE CASSEROLE NOURRIT — la phrase que le bloc
                      « ce que tu cuisines » portait seul jusqu'au 2026-08-14.
                      Elle vit DEHORS de la recette dépliée, avec les deux
                      durées: c'est ce qu'on lit pour PLANIFIER (« si je fais ce
                      lot dimanche, mes lundi, mardi et mercredi sont faits »),
                      pas ce qu'on lit devant la casserole.
                      ⚠️ MUETTE QUAND AUCUN PLAT NE LA CITE. Une préparation
                      orpheline rend `[]`, et « couvre  » sans jour serait pire
                      que rien. */}
                  {feeds.length > 0 && (
                    <p className="mt-1 text-xs text-ink-soft">
                      {mealCopy("meals.kitchen.feeds").replace(
                        "{days}",
                        feeds.map((d) => dishDayLabel(d) ?? d).join(", "),
                      )}
                    </p>
                  )}

                  {/* ── LA TABLE DE PESÉE (LOT 4) ────────────────────────────
                      DEHORS de la recette dépliée, avec les durées et les jours
                      nourris: c'est une INSTRUCTION DE SESSION — « voilà ce que
                      tu mets dans quelle boîte » — et on la lit en même temps
                      qu'on décide de se mettre à cuisiner, pas une fois la
                      casserole ouverte. La replier obligerait à déplier chaque
                      préparation pour savoir combien peser. */}
                  <BoxTable lines={boxLinesFor(prep, portions)} />

                  {open && (
                    <>
                      {prep.ingredients.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {prep.ingredients.map((ing, i) => (
                            <li
                              key={`${ing.term}-${i}`}
                              className="flex flex-wrap items-baseline gap-2 text-sm text-ink"
                            >
                              <span>{ing.term}</span>
                              {ing.quantity && (
                                <span className="text-ink-soft">{ing.quantity}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {prep.method && (
                        <p className="mt-2 text-sm leading-6 text-ink">{prep.method}</p>
                      )}
                    </>
                  )}
                </div>
  );
}
