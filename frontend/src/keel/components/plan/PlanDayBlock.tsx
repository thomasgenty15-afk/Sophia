import React from "react";

import type {
  CookingSession,
  GeneratedDish,
  MealPreparation,
  MemberPortionView,
  ShoppingItem,
} from "../../api/mealGeneration";
import type { BoxEnergyView, DayEnergyView, DishEnergyView } from "../../api/mealEnergy";
import type { WaveAssignment } from "../../api/groceryWaves";
import { aisleLabel, dishDayLabel, dishSlotLabel, mealCopy } from "../../api/mealLabels";
import { DayEnergyLine } from "./EnergyReadout";
import { Badge } from "../ui/Badge";
import { sessionsForDish } from "../../lib/dishSession";
import { groupByAisle } from "../../lib/mealBuilderModel";
import { groupDayBySlot } from "../../lib/planDaySlots";
import { boxLinesForDish, boxLinesForSession } from "../../lib/mealBoxes";
import { thawLineFor } from "../../lib/thawLine";
import FoldSection, { BoxingFold } from "./FoldSection";
// ⟳ LOT C (2026-09-11) — la quantité d'un ingrédient vient de la donnée
// structurée finale (`lib/ingredientQuantity.ts`), lue par `RecipeBody`; la
// liste de courses n'a AUCUNE donnée structurée et garde son texte.
import { RecipeBody } from "./RecipeBody";
import AnchoredPanel from "../ui/AnchoredPanel";
import DayPersonSplit from "./DayPersonSplit";
import DishCard, { type DishReplaceControl } from "../DishCard";
import { Card } from "../ui/Card";
import { type DishTick } from "../../lib/useMealTicks";
import { useBottomFold } from "../../lib/useBottomFold";
import { FoldCloser } from "../ui/FoldCloser";

// LOT 1 — LE BLOC D'UN JOUR. Extrait de `PlanResult` pour être RENDU DEUX FOIS
// par le même parent: dans la vue « toute la semaine » et dans la vue « un
// jour ». Deux corps de jour écrits séparément divergeraient au premier
// correctif — c'est l'argument exact qui a sorti `PlanResult` de `MealBuilder`.
//
// ── UN JOUR PORTE TOUT CE QUI LUI ARRIVE ───────────────────────────────────
// La session de cuisine qui tombe ce jour-là, la vague de courses qui tombe ce
// jour-là, puis les plats. Rien de neuf n'est calculé: la session est déjà
// dans `cookingSessions` (elle n'était lue que par `sessionsForDish`), la vague
// vient de `planGroceryWaves` (module serveur réexporté, résolue par le
// parent). Un moment sans plat ne s'affiche pas (retiré le 2026-09-23).
// « Tes sessions de cuisine » et la liste de courses complète RESTENT — ce
// bloc est leur déclinaison au jour, pas leur remplaçant.
//
// ── LA FRONTIÈRE AVEC LE PARENT ────────────────────────────────────────────
// Ce bloc REND un jour; il ne résout aucune fenêtre. La date de son groupe, la
// jointure jeton→date (`windowDates`) et la sélection du jour vivent chez
// l'appelant: une seconde résolution ici serait la « seconde liste de jours »
// que le lot interdit (deux dérivations du même plan divergent).
//
// ── CE QUI N'ARRIVERA JAMAIS ICI ───────────────────────────────────────────
// Les mêmes interdits que `PlanResult`: pas de doctrine, pas de coche inventée,
// et AUCUNE durée de session sur la carte d'un PLAT (`active_minutes` /
// `total_minutes` appartiennent aux préparations et aux sessions — les
// recopier sous un plat donnerait à un assemblage le temps d'une cuisson).
// La durée qui s'affiche ici est celle de la CARTE DE SESSION, sa surface
// légitime — jamais celle d'un plat.

export interface PlanDayBlockProps {
  /** Le groupe de `groupByDay` — le jour, et ses plats. `day: null` = sans jour. */
  group: { day: string | null; dishes: readonly GeneratedDish[] };
  /**
   * La date de ce groupe, résolue par l'APPELANT (`dishDate` sur
   * `windowDates`). `null` = jeton hors fenêtre.
   */
  date: string | null;
  today: string;
  preparations: readonly MealPreparation[];
  /**
   * LES PLATS DU PLAN ENTIER — pour les CONTENANTS d'une session de cuisine.
   *
   * ⚠️ PAS `group.dishes`, ET C'EST LA RAISON D'ÊTRE DE LA PROP. Une session du
   * dimanche remplit des boîtes pour des repas du mardi et du jeudi: la table de
   * pesée d'une session lit donc TOUS les repas qui prélèvent sur ses
   * casseroles, pas ceux du jour où elle tombe.
   *
   * ⚠️ REQUISE, `[]` pour « aucun », jamais `T?`. « Paramètre de garde optionnel
   * = garde désarmée »: un `?` n'aurait fait remonter aucun appelant au
   * compilateur, et la carte de session aurait perdu sa pesée en silence.
   */
  allDishes: readonly GeneratedDish[];
  cookingSessions: readonly CookingSession[];
  /**
   * LA VAGUE DE COURSES QUI TOMBE CE JOUR — résolue par le parent
   * (`waveForDate`, jointure par DATE via `windowDates`). `null` = rien à
   * acheter ce jour-là, et le bloc se tait.
   */
  wave: WaveAssignment | null;
  /** La liste entière — la vague la désigne par INDEX, jamais par terme. */
  shoppingList: readonly ShoppingItem[];
  /**
   * ⟳ 2026-09-09 — LA PHRASE DE TIMING DU JOUR, ou `null`.
   *
   * « Courses et cuisson dès le matin, pour être prêt à midi. » Elle vivait
   * dans une carte EN TÊTE DU PLAN, au-dessus du rail des jours, et ne nommait
   * aucun jour: on lisait une consigne de matinée sans savoir de quelle
   * matinée. Signalé tel quel: *« si ça concerne le mercredi, ça devrait être
   * sur le mercredi »*.
   *
   * Elle introduit exactement les deux blocs qui la suivent — les courses, puis
   * la cuisson — donc c'est ici qu'elle a sa place, et pas ailleurs.
   *
   * ⚠️ REQUISE, `null` pour « rien à dire », jamais `?`. C'est le parent qui
   * sait quel jour la phrase concerne (`starts_on`, `lead_day`); un `?` aurait
   * laissé un appelant l'oublier, et la phrase serait redevenue invisible —
   * c'est-à-dire le défaut d'origine, sans un seul rouge pour le dire.
   */
  timingLine: string | null;
  /**
   * LOT 3 — LES PARTS PAR BOUCHE DU PLAN RENDU (`member_portions`). REQUISE,
   * pas optionnelle: un `?` ferait de la séparation par personne une prop
   * morte chez l'appelant qui oublie, et le jour se lirait comme un jour sans
   * plat dédié — c'est-à-dire comme avant ce lot, sans un seul rouge.
   *
   * `[]` = plan individuel (la lane `generate-meal-v1` n'en écrit aucune), ou
   * lecteur qui n'a pas à voir les parts. Alors ni prénom ni part ne sortent,
   * et le jour se rend à plat.
   */
  portions: readonly MemberPortionView[];
  tick?: (dish: GeneratedDish, date: string | null) => DishTick | null;
  energy?: (dish: GeneratedDish) => DishEnergyView | null;
  dayEnergy?: (day: string | null) => DayEnergyView | null;
  /** ⟳ 2026-09-04 — le kcal d'un contenant à UN nom, pour le Boxing de la session et la carte. */
  boxEnergy?: (boxId: string) => BoxEnergyView | null;
  /**
   * ⟳ 2026-09-24 — `"compact"` = une ligne par plat (l'aperçu), `"full"` = la
   * carte d'avant (`/app/plan`). REQUISE: c'est l'appelant qui sait quel écran
   * il rend, et un défaut ferait basculer l'un des deux en silence.
   */
  dishLayout: "full" | "compact";
  /** ⟳ 2026-09-24 — « Remplacer » sur un plat, même forme que `tick`. Absent hors aperçu. */
  dishReplace?: (dish: GeneratedDish) => DishReplaceControl | null;
}

export default function PlanDayBlock(props: PlanDayBlockProps) {
  const { group, date } = props;
  // LA SESSION DU JOUR. La donnée arrive déjà ici (elle n'était lue que par
  // `sessionsForDish`); un jour sans session rend simplement rien. `group.day`
  // et `session.day` sont tous deux des JETONS — aucune conversion, donc
  // aucune divergence possible.
  const sessions = props.cookingSessions.filter((s) => s.day === group.day);
  // LOT 3 — LES MOMENTS DE CE JOUR, ET QUI MANGE QUOI À CHACUN. Une seule
  // dérivation: les plats du groupe, tels que `groupByDay` les a rangés.
  const slotGroups = groupDayBySlot({
    dishes: group.dishes,
    portions: props.portions,
  });
  const quiet = group.dishes.length === 0 && sessions.length === 0 &&
    props.wave === null;
  // ⟳ 2026-09-24 (retour du propriétaire) — SUR L'APERÇU, DES TITRES PLUS
  // PETITS: « les titres sont hyper gros » à côté d'un tableau en 13 px et de
  // cartes en 14 px. L'ordre reste celui du 2026-09-23 (jour > moment >
  // personne > plat), les tailles descendent: jour 16 px gras (la serif de
  // la charte ne passe jamais sous 20 px, elle n'a donc pas de place ici),
  // moment 12 px en capitales, plat 14 px (`DishCard compact`). Le plan
  // adopté (`dishLayout="full"`) garde ses tailles.
  const compact = props.dishLayout === "compact";
  // ⟳ 2026-09-25 — LA ZONE « COURSES ET CUISINE »: là si la journée porte une
  // phrase de timing, une vague de courses ou une session; son titre nomme ce
  // qu'elle contient ce jour-là.
  const hasGroceries = Boolean(props.wave && props.wave.indices.length > 0);
  const hasCooking = sessions.length > 0;
  const hasPrep = Boolean(props.timingLine) || hasGroceries || hasCooking;
  const prepTitle = hasGroceries && !hasCooking
    ? mealCopy("meals.result.zone_groceries")
    : hasCooking && !hasGroceries
    ? mealCopy("meals.result.zone_cooking")
    : mealCopy("meals.result.zone_prep");
  return (
    <div>
      {/* ⟳ 2026-09-23 — LE JOUR EST LE TITRE LE PLUS FORT DU BLOC. Il était
          en `text-sm`, plus petit que le titre d'un plat (`text-base`), et le
          moment juste dessous avait la même allure que « Pour Thomas »: on ne
          voyait ni où commençait un jour ni où commençait un repas. Demandé:
          « le jour doit être plus important que les moments ». Ordre voulu:
          jour (serif, `text-sub`, filet dessous) > moment (`text-sm` capitales,
          encre pleine) > personne (`text-label`, encre secondaire) > plat.
          Le nom du jour est seul dans le `h3`; les repères et la somme restent
          en sans, à côté, pour que la serif ne passe jamais sous 19 px. */}
      {group.day && (
        <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-2">
          <h3 className={compact ? "text-base font-semibold text-ink" : "font-display text-sub text-ink"}>
            {dishDayLabel(group.day)}
          </h3>
          {/* OÙ ON EN EST DANS LE PLAN. Sans repère, une semaine qui
              commence mercredi se lit comme une semaine en retard: on ne
              sait pas si le premier jour affiché est passé, courant ou à
              venir. */}
          {/* ⛔ « AUJOURD'HUI » EST UNE POSITION, PAS UN ÉTAT. L'émeraude
              était ici un faux état: dans tout le produit elle dit « ok »,
              et un jour n'est ni réussi ni raté. Le repère passe donc à la
              forme — le cran `text-label` de la charte, en encre pleine,
              contre l'encre secondaire du jour passé juste en dessous. */}
          {date === props.today && (
            <span className="text-label font-semibold text-ink">
              {mealCopy("meals.result.today")}
            </span>
          )}
          {date !== null && date < props.today && (
            <span className="text-label font-normal text-ink-soft">
              {mealCopy("meals.result.past")}
            </span>
          )}
          {/* FF-059 · SURFACE B — LA SOMME DU JOUR, sur le titre du jour.
              `ml-auto` la pousse à droite: elle accompagne le jour, elle
              ne le remplace pas. */}
          <span className="ml-auto">
            <DayEnergyLine energy={props.dayEnergy?.(group.day) ?? null} />
          </span>
        </div>
      )}
      <div className="space-y-5">
        {/* ══════════════════════════════════════════════════════════════════
            ⟳ 2026-09-25 — DEUX ZONES PAR JOUR: CE QU'ON PRÉPARE, CE QU'ON MANGE.
            ══════════════════════════════════════════════════════════════════
            Demandé: « départager plus clairement ce qui relève des sessions de
            cuisine et des courses, et les repas en tant que tels ». Les deux se
            suivaient en cartes identiques, et rien ne disait où finissait la
            préparation et où commençait le repas.

            · « Courses et cuisine » — un panneau teinté (`paper-2`, filet
              `line`, rayon `fiche`): la phrase de timing, les courses, la ou
              les sessions. Son titre dit ce qu'il contient ce jour-là.
            · « Au menu » — sur le papier, sans panneau: les moments et leurs
              plats, comme avant.
            Les titres de zone sont en figue et en casse normale, avec une
            icône: les moments, juste en dessous, restent en capitales noires. */}
        {hasPrep && (
          <section data-tour="day-prep" className="space-y-3 rounded-fiche border border-line bg-paper-2 p-3 sm:p-4">
            <DayZoneTitle icon={hasCooking ? "pot" : "cart"} title={prepTitle} />
            {/* ── LA PHRASE DE TIMING, AVANT LES DEUX GESTES QU'ELLE ANNONCE ────
                Elle dit « courses et cuisson »; les courses et la cuisson sont
                juste en dessous. Au-dessus du rail des jours, elle annonçait deux
                blocs qu'on ne voyait pas encore. */}
            {/* ⚠️ TEST DE VÉRITÉ, PAS `=== null`. Les tests montent ce composant
                hors de `tsconfig.app.json` (les `*.test.*` en sont exclus): un
                appelant qui oublie la prop passe `undefined`, et `undefined !==
                null` aurait rendu une carte VIDE. Une carte vide est pire qu'une
                phrase manquante — elle se voit et ne dit rien. */}
            {props.timingLine
              ? <p className="break-words text-sm text-ink">{props.timingLine}</p>
              : null}
            {/* ══════════════════════════════════════════════════════════════════
                LE BLOC D'UN JOUR SUIT L'ORDRE DES GESTES: ACHETER, CUISINER, MANGER.
                ══════════════════════════════════════════════════════════════════

                ── CE QUI A CHANGÉ LE 2026-08-20 ────────────────────────────────
                Les courses étaient SOUS la session de cuisine. On lisait donc quoi
                faire des casseroles avant de savoir s'il fallait encore aller
                chercher de quoi les remplir. Demandé: « la liste de course doit
                toujours être en haut de la journée ».

                ⛔ ET ON NE POSE PAS DE MARQUEUR D'ÉTAPE (1/2/3) SUR CES TROIS
                BLOCS. Deux des trois manquent la plupart des jours — la majorité
                des jours n'ont ni vague de courses ni session — et un « 1 » sur le
                seul bloc présent affirmerait une séquence qui n'existe pas ce
                jour-là. L'ordre porte l'information; le numéro mentirait. */}
            {/* ── LES COURSES DU JOUR, EN TÊTE ───────────────────────────────────
                La vague qui TOMBE ce jour-là, dépliable vers sa liste par rayons.
                ⚠️ PLIÉE, AVEC SON COMPTE. Dépliée en tête, elle enterrerait la
                cuisine sous vingt lignes; le compte suffit à décider si on sort.
                La fenêtre de courses complète reste — et c'est elle qui porte les
                ratures: en tenir un second jeu ici ferait deux mémoires pour la
                même liste, et c'est celle qu'on ne regarde pas qui gagnerait. */}
            {props.wave && props.wave.indices.length > 0 && (
              <div data-tour="day-groceries">
                <DayGroceriesCard wave={props.wave} shoppingList={props.shoppingList} />
              </div>
            )}
            {/* ── LA SESSION DE CUISINE DU JOUR ───────────────────────────────────
                Ce qu'on fait avant de manger. Carte compacte, dépliable vers le
                déroulé; la fenêtre « tes sessions de cuisine » reste la vue
                d'ensemble. Son dernier bloc est le Boxing. */}
            {sessions.length > 0 && (
              // `data-tour`: repère de la visite du plan de démonstration.
              <div data-tour="day-session" className="space-y-3">
              {sessions.map((session, index) => (
                <DaySessionCard
                  key={`${session.day}-${index}`}
                  session={session}
                  preparations={props.preparations}
                  // ⟳ 2026-09-09 — pour la phrase de la veille (« sors la dinde du
                  // congélateur »), lue sur la liste, jamais sur le déroulé du modèle.
                  shoppingList={props.shoppingList}
                  // LES REPAS QUE CETTE SESSION MET EN BOÎTES — tout le plan, jamais
                  // le seul jour rendu: une session du dimanche remplit les boîtes du
                  // mardi.
                  allDishes={props.allDishes}
                  // LES PRÉNOMS DES BOÎTES. Même source que la séparation par personne
                  // juste en dessous (`props.portions`): une seule liste de bouches
                  // pour tout ce bloc, jamais deux.
                  portions={props.portions}
                  boxEnergy={props.boxEnergy}
                />
              ))}
              </div>
            )}
          </section>
        )}
        {slotGroups.length > 0 && (
          <section data-tour="day-menu" className="space-y-3">
            <DayZoneTitle icon="menu" title={mealCopy("meals.result.zone_menu")} />
            {/* ── LOT 3 · LES PLATS, MOMENT PAR MOMENT ───────────────────────────
                Le regroupement est PUR (`groupDayBySlot`) et il ne lit aucun titre:
                l'attribution vient de `dish.member_id`, le prénom de la ligne
                membre recopiée dans `member_portions` (F5). Un moment sans plat
                dédié se rend comme avant — c'est le cas majoritaire, et il ne paie
                rien. */}
            {slotGroups.map((slotGroup) => (
              <section key={`${group.day}-${slotGroup.slot ?? "no_slot"}`} className="pt-2">
                {/* ══════════════════════════════════════════════════════════════
                    LE MOMENT EST UN TITRE, PLUS UNE PASTILLE SUR LA CARTE.
                    ══════════════════════════════════════════════════════════════
                    « Au lieu d'avoir des tags "petit déjeuner", il faudrait que ce
                    soit des sections claires » (2026-08-19). Le regroupement
                    existait déjà (`groupDayBySlot`); il n'était pas MONTRÉ, donc
                    pour savoir ce qu'on mange à midi il fallait balayer les cartes
                    et lire chaque pastille.

                    ⚠️ MUET SUR UN PLAT SANS MOMENT, et c'est le seul cas où la
                    pastille manquait aussi: `dishSlotLabel(null)` rend `null`, et
                    inventer « Repas » prescrirait un horaire que le moteur n'a pas
                    écrit. Ces plats-là ferment la marche, sans titre.

                    ⚠️ UN JETON INCONNU GARDE SON MOT. `dishSlotLabel` rend le jeton
                    brut plutôt que de jeter — des plats en base portent `snack`, et
                    les faire disparaître d'un plan vivant coûterait plus cher qu'un
                    titre imparfait. */}
                {slotGroup.slot !== null && (
                  <h5
                    className={`mb-2 ${compact ? "text-xs" : "text-sm"} font-semibold uppercase tracking-wide text-ink`}
                  >
                    {dishSlotLabel(slotGroup.slot)}
                  </h5>
                )}
                <DayPersonSplit
                  group={slotGroup}
                  // LE CÂBLAGE DE LA CARTE RESTE ICI, où il était déjà:
                  // `DayPersonSplit` PLACE les cartes sous le bon en-tête et ne lit
                  // aucun champ d'un plat — c'est ce qui rend structurellement
                  // impossible qu'un objectif ou un chiffre de corps entre dans la
                  // séparation.
                  renderDish={(dish, key, annotation) => (
                    <DishCard
                      key={key}
                      dish={dish}
                      // ── QUI EST À TABLE, ET CE QUE CHACUN EN FAIT ─────────────
                      //
                      // ⛔ DESCENDUS DANS LA CARTE LE 2026-08-21, ET C'EST LE
                      // CORRECTIF. Ils se rendaient SOUS elle, dans
                      // `DayPersonSplit`, rattachés par la seule proximité — et
                      // contre une bordure, aucun écart ne rattache rien: « c'est
                      // entre les deux, on comprend pas ».
                      //
                      // ⚠️ CALCULÉS LÀ-BAS, RENDUS ICI, et le partage est le même
                      // que pour `boxes`: seul `DayPersonSplit` sait ce que l'en-tête
                      // de la voie a déjà nommé (`annotation.shares[].name === null`)
                      // et si le plat s'annonce lui-même. La carte reçoit une liste
                      // prête, jamais la règle.
                      eaters={annotation.eaters}
                      shares={annotation.shares}
                      // LES PRÉPARATIONS QUE CE PLAT CONSOMME, résolues ici: le
                      // plat ne porte que des `id`, et une carte qui irait les
                      // chercher elle-même dupliquerait la résolution sur les deux
                      // écrans qui la montent.
                      sources={dish.uses
                        .map((u) => ({
                          use: u,
                          prep: props.preparations.find((p) => p.id === u.preparation_id),
                        }))
                        .filter((e): e is { use: typeof e.use; prep: MealPreparation } =>
                          Boolean(e.prep)
                        )
                        .map(({ prep }) => ({
                          title: prep.title,
                          cookOn: prep.cook_on,
                        }))}
                      // ── LA BOÎTE DE CE REPAS, RÉSOLUE ICI ────────────────────
                      // Résolue ICI, comme `sources` juste au-dessus, et pour la
                      // même raison: la jointure boîte → prénoms passe par
                      // `member_portions`, que la carte ne reçoit pas. Une carte
                      // qui irait les chercher elle-même dupliquerait la résolution
                      // sur les deux écrans qui la montent.
                      boxes={boxLinesForDish(dish, props.portions)}
                      tick={props.tick?.(dish, date)}
                      energy={props.energy?.(dish) ?? null}
                      boxEnergy={props.boxEnergy}
                      // ── LA SESSION QUI A FAIT SON LOT (2026-08-14) ─────────────
                      // RÉSOLUE ICI, comme `sources` juste au-dessus, et pour la
                      // même raison: le plat ne porte que des `id`, et une carte
                      // qui irait chercher les sessions elle-même dupliquerait la
                      // résolution sur les deux écrans qui la montent.
                      sessions={sessionsForDish(dish, props.cookingSessions, props.preparations)}
                      // LE TITRE DE SECTION JUSTE AU-DESSUS A DÉJÀ NOMMÉ LE MOMENT.
                      // Garder la pastille ferait dire « Déjeuner » deux fois à
                      // trois centimètres d'écart, sur chaque carte du plan.
                      slotBadge={false}
                      // ⛔ 2026-09-25 — PLUS DE PLI « Voir le détail » (retiré sur
                      // demande): la carte rend tout son détail.
                      // ⟳ 2026-09-24 — SUR L'APERÇU, UN CRAN DE PLUS: le titre seul,
                      // qui s'ouvre sur la carte ci-dessus.
                      compact={props.dishLayout === "compact"}
                      replace={props.dishReplace?.(dish) ?? null}
                    />
                  )}
                />
              </section>
            ))}
            {/* ⛔ 2026-09-23 — LA LISTE DES MOMENTS SANS PLAT EST PARTIE
                (« Petit-déjeuner — rien ici », « Déjeuner — absent »…), sur
                demande: « ça sert à rien, ça pollue l'UI ». La prop `moments` et
                la grille qui la remplissait dans `PlanResult` sont parties avec. */}
            {/* UN JOUR OÙ IL N'Y A VRAIMENT RIEN LE DIT — sans rythme déclaré, la
                grille ne sait rien motiver, et un bloc muet sous un titre de jour
                se lirait comme une panne. */}
          </section>
        )}
        {quiet && (
          <p className="text-sm text-ink-soft">
            {mealCopy("meals.result.day_nothing")}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * LA CARTE DE SESSION DU JOUR — compacte, dépliable vers le déroulé.
 *
 * ⚠️ COMPOSANT À PART, ET PAS UN `useState` DANS LE BLOC (patron
 * `SessionLink`): l'état d'ouverture n'existe que là où il y a quelque chose à
 * ouvrir.
 *
 * LA DURÉE AFFICHÉE EST CELLE DE LA SESSION, SUR LA CARTE DE LA SESSION — sa
 * surface légitime, comme dans « tes sessions de cuisine ». Elle ne descend
 * jamais sur la carte d'un plat.
 */
/**
 * ⟳ 2026-09-25 — LE TITRE D'UNE ZONE DU JOUR (« Courses et cuisine »,
 * « Au menu »): une icône dans une pastille `fig-100`, le mot en `fig-800`.
 * Casse normale: les moments du repas, un cran en dessous, sont en capitales.
 */
function DayZoneTitle({ icon, title }: { icon: "cart" | "pot" | "menu"; title: string }) {
  return (
    <h4 className="flex items-center gap-2 text-sm font-semibold text-fig-800">
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fig-100 text-fig-700"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {icon === "cart" && (
            <>
              <path d="M1.5 2.5h2l1.5 7h7.25l1.5-5H4.1" />
              <path d="M6.25 13h.01M11.5 13h.01" strokeWidth="2.4" />
            </>
          )}
          {icon === "pot" && (
            <>
              <path d="M3 7h10v3.5A2.5 2.5 0 0 1 10.5 13h-5A2.5 2.5 0 0 1 3 10.5V7Z" />
              <path d="M1.5 7h13" />
              <path d="M6.5 2.5c-.5.6-.5 1.4 0 2M9.5 2.5c-.5.6-.5 1.4 0 2" />
            </>
          )}
          {icon === "menu" && (
            <>
              <path d="M4 1.75v4a1.5 1.5 0 0 0 3 0v-4M5.5 1.75v12.5" />
              <path d="M11.75 14.25V1.75c-1.5.75-2.25 2.5-2.25 4.5V9h2.25" />
            </>
          )}
        </svg>
      </span>
      {title}
    </h4>
  );
}

function DaySessionCard(props: {
  /** ⟳ 2026-09-04 — le kcal d'un contenant à UN nom, pour le Boxing de la session. */
  boxEnergy?: (boxId: string) => BoxEnergyView | null;
  session: CookingSession;
  preparations: readonly MealPreparation[];
  allDishes: readonly GeneratedDish[];
  portions: readonly MemberPortionView[];
  /** ⟳ 2026-09-09 — la liste entière: la phrase de la veille lit `freeze_on_purchase`. */
  shoppingList: readonly ShoppingItem[];
}) {
  // ⟳ 2026-09-25 — « Voir le détail » en haut, « Masquer le détail » en BAS
  // (`useBottomFold`).
  const { open, openFold, closeFromBottom, topRef } = useBottomFold();
  const panelId = React.useId();
  const { session } = props;
  const thaw = thawLineFor(session, props.preparations, props.shoppingList);
  // LES `id` INCONNUS SONT ÉCARTÉS, PAS RENDUS TELS QUELS — même règle que
  // `sessionsForDish`: un slug de lot ne veut rien dire à table.
  const preps = session.preparation_ids
    .map((id) => props.preparations.find((p) => p.id === id))
    .filter((p): p is MealPreparation => p !== undefined);
  const boxLines = boxLinesForSession(
    session.preparation_ids,
    props.allDishes,
    props.portions,
    props.preparations,
  );
  /**
   * ⟳ 2026-09-09 — Y A-T-IL QUELQUE CHOSE À OUVRIR ? Le bouton était gardé par
   * `session.run_through` SEUL, du temps où c'était la seule chose repliée.
   * Maintenant que le corps entier est sous le pli, cette garde-là replierait
   * les casseroles et la pesée d'une session sans déroulé DERRIÈRE AUCUN
   * BOUTON: un contenu rendu incollectable par sa propre porte. Les trois
   * morceaux sont donc nommés, et `BoxTable` se tait déjà sur `[]`.
   */
  const hasBody = preps.length > 0 || boxLines.length > 0 ||
    Boolean(session.run_through);

  return (
    <Card>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-sm font-semibold text-ink">
          {mealCopy("meals.result.day_session")}
        </p>
        {session.total_minutes !== null && (
          <span className="text-xs font-normal tabular-nums text-ink-soft">
            {mealCopy("meals.sessions.session_time").replace(
              "{n}",
              String(session.total_minutes),
            )}
          </span>
        )}
        {/* ⟳ 2026-09-25 — LE COMPTE DES PRÉPARATIONS, à côté de la durée. */}
        {preps.length > 0 && (
          <span className="text-xs font-normal tabular-nums text-ink-soft">
            {"· "}
            {preps.length === 1
              ? mealCopy("meals.sessions.preps_one")
              : mealCopy("meals.sessions.preps_many", { n: preps.length })}
          </span>
        )}
        {hasBody && !open && (
          <button
            ref={topRef}
            type="button"
            aria-expanded={false}
            aria-controls={panelId}
            onClick={openFold}
            // L'idiome du kit pour déplier (patron `CookingSessions`): le
            // soulignement porte l'affordance, la teinte ne la porte pas.
            // `min-h-6` = plancher tactile de 24 px.
            className="ml-auto min-h-6 shrink-0 text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
          >
            {mealCopy("meals.result.day_session_show")}
          </button>
        )}
      </div>
      {/* ⟳ 2026-09-09 — LE GESTE DE LA VEILLE, AVANT LES CASSEROLES ET HORS DU
          DÉPLIANT: on le lit la veille au soir, pas au moment de cuisiner. Il
          est DÉTERMINISTE (la liste de courses), et il contredit au besoin un
          déroulé du modèle qui dirait « acheter frais le jour même ». */}
      {/* ⟳ 2026-09-25 — CE QU'ON CUISINE, CARTE FERMÉE: les noms des
          préparations, sur une ligne. On sait ce que la session produit sans
          l'ouvrir; ouverte, chaque bloc porte son nom et la ligne se tait. */}
      {!open && preps.some((p) => p.title !== "") && (
        <p className="mt-1 break-words text-sm text-ink-soft">
          {preps.map((p) => p.title).filter((t) => t !== "").join(" · ")}
        </p>
      )}
      {thaw && (
        <p className="mt-2 flex flex-wrap items-baseline gap-2 text-sm leading-6 text-ink">
          <Badge tone="caution">{mealCopy("meals.shopping.freeze")}</Badge>
          <span>{thaw}</span>
        </p>
      )}
      {/* ══════════════════════════════════════════════════════════════════
          ⟳ 2026-09-09 — LE CORPS DE LA SESSION EST SOUS LE PLI, SUR DEMANDE.
          ══════════════════════════════════════════════════════════════════

          Demandé le 2026-09-09: « les sessions de cuisine étaient
          automatiquement déroulées, il faut que ce soit déroulé sur commande ».
          Un jour de cuisine rendait ici la matière de chaque casserole, sa
          méthode, la table de pesée ET le déroulé — la carte faisait un écran
          à elle seule, sur un bloc dont la question est « qu'est-ce qui se
          passe ce jour-là ».

          ⚠️ CE QUI RESTE DEHORS EST CE QU'ON LIT SANS OUVRIR: le titre, la
          durée, et la phrase de la veille. Cette dernière est dehors DEUX FOIS
          pour la même raison — elle se lit le soir d'avant, pas devant la
          casserole, et le badge « à congeler » de la carte des courses a déjà
          payé ce défaut-là: sous un dépliant, personne ne l'a vu.

          ⛔ ET LE BOUTON N'EST PLUS GARDÉ PAR `run_through`. Voir `hasBody`. */}
      {open && hasBody && (
        <div id={panelId}>
      {/* ══════════════════════════════════════════════════════════════════
          UNE CASSEROLE À LA FOIS: SON NOM, COMMENT ON LA CUIT, SES BOÎTES.
          ══════════════════════════════════════════════════════════════════

          ── CE QU'ON LISAIT AVANT (2026-08-19) ──────────────────────────
          Les titres collés par un point médian — « Poulet rôti et légumes
          d'été · Œufs durs » — puis UNE table de pesée qui aplatissait les
          boîtes des DEUX casseroles. On lisait donc quatre lignes de prénoms
          et de grammes sans savoir laquelle allait dans quel bac. Signalé:
          « il dit de faire des barquettes de 450 grammes mais on sait pas à
          quoi ça correspond ».

          ⛔ ET LE `method` N'ÉTAIT NULLE PART SUR CETTE CARTE. Il est écrit
          par le modèle (« comment cuire la fournée »), et il ne s'affichait
          que dans « Tes sessions de cuisine ». La question posée était « les
          cuissons seront plus détaillées que ça, pas en mode preview ? » — la
          réponse est non, c'est le même objet: le détail existait, il n'était
          pas rendu ici.

          ⚠️ CHAQUE PESÉE SOUS SA CASSEROLE, et c'est ce qui règle le « 450 g
          de quoi ». `BoxTable` n'ajoute plus son propre sous-titre quand elle
          ne reçoit qu'une préparation: le titre est déjà juste au-dessus.

          ⚠️ LE `method` EST VISIBLE DÈS QUE LA SESSION EST OUVERTE: c'est la
          recette qu'on vient chercher en cliquant « Voir le détail ». */}
      {/* ══════════════════════════════════════════════════════════════════
          ⟳ 2026-09-25 — DEUX SECTIONS, FAITES PAREIL: « Préparation » puis
          « Boxing », toutes deux repliables (demandé tel quel). Le « Déroulé
          global » n'est plus une troisième section teintée: c'est un bouton au
          bout de la ligne « Préparation », qui l'ouvre dans une bulle.

          ⚠️ LES DEUX SONT REPLIÉES À L'OUVERTURE DE LA SESSION (⟳ 2026-09-25,
          demandé: « Voir le détail » ne doit pas ouvrir la préparation). Cela
          renverse le « un clic, pas deux » du 2026-09-23.
          ⚠️ UNE SEULE RECETTE ⇒ PAS DE DÉROULÉ GLOBAL: il ne ferait que redire
          sa méthode (mesuré: le pain grillé du mercredi). */}
      {preps.length > 0 && (
        <FoldSection
          title={mealCopy("meals.sessions.preparation_title")}
          meta={mealCopy("meals.sessions.preparation_meta")}
          tone="plain"
          icon="pot"
          action={session.run_through && preps.length !== 1
            ? <OverviewButton text={session.run_through} />
            : undefined}
        >
      {preps.map((prep) => (
        // ⟳ 2026-09-25 — UNE PRÉPARATION = UN BLOC (« l'UI pourrait être
        // beaucoup plus cool »): son nom en tête, puis les ingrédients et la
        // méthode côte à côte (`RecipeBody`). Le bloc encastré de la charte
        // (`paper-2` + `line`), comme les autres informations rattachées à une
        // carte.
        //
        // ── CE QU'IL Y A DEDANS, AVANT DE DIRE QUOI EN FAIRE ───────────────
        // « Dans cette session de cuisine on comprend pas du tout qu'est-ce que
        // ça concerne comme légume » (2026-08-19): la matière d'abord. Les
        // quantités sont celles de la FOURNÉE ENTIÈRE — les grammes qu'on
        // ACHÈTE; ceux du Boxing, plus bas, sortent en boîtes. Cru contre prêt.
        <article
          key={prep.id}
          className="mt-3 rounded-card border border-line bg-paper-2 p-3 first:mt-0 sm:p-4"
        >
          {/* ⟳ 2026-09-25 — PLUS DE TEMPS PAR PRÉPARATION ICI (« ça prend de
              la place pour rien »): la durée de la session est déjà en tête
              de carte. */}
          {prep.title !== "" && (
            <h4 className="break-words text-sm font-semibold text-ink">{prep.title}</h4>
          )}
          <RecipeBody ingredients={prep.ingredients} method={prep.method} />
        </article>
      ))}
        </FoldSection>
      )}
      {/* ══════════════════════════════════════════════════════════════════
          LES CONTENANTS QUE CETTE SESSION DOIT REMPLIR.
          ══════════════════════════════════════════════════════════════════

          ── CE QUI A CHANGÉ LE 2026-08-19 ────────────────────────────────
          La pesée était SOUS CHAQUE CASSEROLE, et elle listait des bacs par
          aliment: « Christèle 340 g / iku 420 g » sous le poulet, puis la même
          chose sous le quinoa. Devant le frigo, ces couvercles ne décidaient
          rien — « Boîte iku » était sur cinq d'entre eux.

          ⚠️ ELLE EST DONC UNE FOIS, EN BAS, ET ELLE LISTE DES REPAS. Ce qu'une
          session produit, ce sont des contenants: « jeudi midi », « jeudi
          soir ». Chacun tient tout ce que son repas sortira, toutes casseroles
          confondues — c'est un contenant en MOINS, et c'est voulu.

          ⟳ 2026-09-23 — DANS SA PROPRE SECTION REPLIÉE (`BoxingFold`), dont le
          titre porte le compte. */}
      {/* ⟳ 2026-09-23 — REPLIÉ AUSSI, avec le compte dans son titre. */}
      <BoxingFold lines={boxLines} boxEnergy={props.boxEnergy} />
      <FoldCloser
        panelId={panelId}
        label={mealCopy("meals.result.day_session_hide")}
        onClose={closeFromBottom}
      />
        </div>
      )}
    </Card>
  );
}

/**
 * ⟳ 2026-09-25 — LE « DÉROULÉ GLOBAL », AU BOUT DE LA LIGNE « PRÉPARATION ».
 *
 * Demandé: « au bout de la ligne de préparation, une icône où on met
 * déroulé global ». Une icône de liste et le mot, qui ouvrent une bulle
 * (`AnchoredPanel`, la même que « Quelles cuissons ? »): l'ordre des gestes
 * entre les casseroles se lit à la demande, sans une section de plus.
 *
 * Le conteneur `relative` porte le bouton ET la bulle: c'est la frontière du
 * « clic ailleurs ». La bulle s'aligne sur le bord droit et défile en
 * elle-même: un déroulé de modèle n'a aucune longueur garantie.
 */
function OverviewButton({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <span className="relative flex shrink-0 items-center">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-6 items-center gap-1.5 text-xs font-medium hover:text-ink ${
          open ? "text-ink" : "text-ink-soft"
        }`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M6 4h7M6 8h7M6 12h7" />
          <circle cx="3" cy="4" r="0.6" fill="currentColor" />
          <circle cx="3" cy="8" r="0.6" fill="currentColor" />
          <circle cx="3" cy="12" r="0.6" fill="currentColor" />
        </svg>
        <span className="underline underline-offset-2">
          {mealCopy("meals.sessions.overview_title")}
        </span>
      </button>
      {open && (
        <AnchoredPanel
          title={mealCopy("meals.sessions.overview_title")}
          onDismiss={() => setOpen(false)}
          footer={
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-6 text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
            >
              {mealCopy("meals.sessions.overview_close")}
            </button>
          }
        >
          <p className="max-h-[50vh] overflow-y-auto break-words text-sm leading-6 text-ink">
            {text}
          </p>
        </AnchoredPanel>
      )}
    </span>
  );
}

/**
 * LES COURSES DU JOUR — le compte, dépliable vers la liste de LA vague, par
 * rayons (même découpe que la fenêtre de courses, même accesseur `groupByAisle`
 * sur les INDEX d'origine).
 *
 * ⛔ AUCUNE CASE À COCHER ICI. Les ratures vivent dans la fenêtre de courses,
 * en mémoire chez elle: un second jeu de coches serait une seconde mémoire
 * pour la même liste, et les deux divergeraient au premier aller-retour.
 */
function DayGroceriesCard(props: {
  wave: WaveAssignment;
  shoppingList: readonly ShoppingItem[];
}) {
  // ⟳ 2026-09-25 — « Voir la liste » en haut, « Masquer la liste » en BAS.
  const { open, openFold, closeFromBottom, topRef } = useBottomFold();
  const panelId = React.useId();
  const count = props.wave.indices.length;
  const inWave = new Set(props.wave.indices);
  // ⟳ LOT C (2026-09-04) — LES LIGNES QUI PARTENT AU CONGÉLATEUR EN RENTRANT.
  // Dérivé de la vague, jamais recalculé: `freezeIndices` vient de la ligne que
  // le serveur a écrite (`freeze_on_purchase`). Même marque que sur la liste de
  // courses complète (`ShoppingListPanel`): deux rendus du même geste.
  const freezeAtPurchase = new Set(props.wave.freezeIndices);
  // ⟳ 2026-09-09 — CE QUI PART AU CONGÉLATEUR, VISIBLE MÊME CARTE REPLIÉE. Le
  // badge par ligne vivait sous le dépliant, donc derrière un clic sur une
  // liste de 46 lignes: personne ne l'a vu. Le geste du jour des courses est
  // la seule chose de cette carte qu'on ne peut pas rater.
  const frozenLines = props.wave.freezeIndices
    .map((index) => ({ index, item: props.shoppingList[index] }))
    .filter((e) => e.item !== undefined);
  const groups = groupByAisle(props.shoppingList)
    .map((g) => ({
      aisle: g.aisle,
      items: g.items.filter((entry) => inWave.has(entry.index)),
    }))
    .filter((g) => g.items.length > 0);
  return (
    <Card>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-sm font-semibold text-ink">
          {count === 1
            ? mealCopy("meals.result.day_groceries_one")
            : mealCopy("meals.result.day_groceries_many", { n: count })}
        </p>
        {!open && (
          <button
            ref={topRef}
            type="button"
            aria-expanded={false}
            aria-controls={panelId}
            onClick={openFold}
            className="ml-auto min-h-6 shrink-0 text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
          >
            {mealCopy("meals.result.day_groceries_show")}
          </button>
        )}
      </div>
      {frozenLines.length > 0 && (
        <div className="mt-2">
          <p className="flex flex-wrap items-baseline gap-2 text-sm font-semibold text-ink">
            <Badge tone="caution">{mealCopy("meals.shopping.freeze")}</Badge>
            {frozenLines.length === 1
              ? mealCopy("meals.shopping.freeze_block_one")
              : mealCopy("meals.shopping.freeze_block_many", { n: frozenLines.length })}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {frozenLines.map(({ index, item }) => (
              <li key={`freeze-${index}`} className="flex flex-wrap items-baseline gap-2 text-sm text-ink">
                <span className="break-words">{item.term}</span>
                {item.quantity && <span className="tabular-nums text-ink-soft">{item.quantity}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {open && (
        <div id={panelId} className="mt-4">
          {/* ⟳ 2026-09-25 — UN BLANC AVANT ET APRÈS CHAQUE RAYON, ET DEUX
              COLONNES QUAND LA LARGEUR LE PERMET (« pour que ce soit moins
              long »; une seule sur téléphone). Des colonnes CSS et pas une
              grille: les rayons n'ont pas la même longueur, et une grille
              alignerait leurs hauteurs par rangée. `break-inside-avoid`: un
              rayon ne se coupe jamais entre deux colonnes. */}
          <div className="sm:columns-2 sm:gap-x-8">
          {groups.map((g) => (
            <div key={g.aisle} className="mb-6 break-inside-avoid">
              {/* Le cran d'étiquette de la charte, comme la fenêtre de
                  courses — même rayon, même mot, même forme. */}
              <h4 className="text-label font-semibold uppercase text-ink-soft">
                {aisleLabel(g.aisle)}
              </h4>
              <ul className="mt-3 flex flex-col gap-0.5">
                {g.items.map(({ item, index }) => (
                  <li
                    key={`${item.term}-${index}`}
                    className="flex flex-wrap items-baseline gap-2 text-sm text-ink"
                  >
                    <span className="break-words">{item.term}</span>
                    {item.quantity && (
                      <span className="text-ink-soft">{item.quantity}</span>
                    )}
                    {/* ⟳ LOT C — `caution`, pas `info`: le bleu d'`info` est
                        celui de la case à cocher native de la liste complète,
                        et la même marque doit se lire pareil aux deux endroits. */}
                    {freezeAtPurchase.has(index) && (
                      <Badge tone="caution">{mealCopy("meals.shopping.freeze")}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          </div>
          <FoldCloser
            panelId={panelId}
            label={mealCopy("meals.result.day_groceries_hide")}
            onClose={closeFromBottom}
          />
        </div>
      )}
    </Card>
  );
}
