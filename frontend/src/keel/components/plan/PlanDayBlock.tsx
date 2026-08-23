import React from "react";

import type {
  CookingSession,
  GeneratedDish,
  MealPreparation,
  MemberPortionView,
  ShoppingItem,
} from "../../api/mealGeneration";
import type { DayEnergyView, DishEnergyView } from "../../api/mealEnergy";
import type { WaveAssignment } from "../../api/groceryWaves";
import { aisleLabel, dishDayLabel, dishSlotLabel, mealCopy } from "../../api/mealLabels";
import { DayEnergyLine } from "./EnergyReadout";
import { sessionForDish } from "../../lib/dishSession";
import { groupByAisle } from "../../lib/mealBuilderModel";
import { type DayMoment } from "../../lib/planDayView";
import { groupDayBySlot } from "../../lib/planDaySlots";
import { boxLinesForDish, boxLinesForSession } from "../../lib/mealBoxes";
import { BoxTable } from "./BoxTable";
import DayPersonSplit from "./DayPersonSplit";
import DishCard from "../DishCard";
import { Card } from "../ui/Card";
import { type DishTick } from "../../lib/useMealTicks";

// LOT 1 — LE BLOC D'UN JOUR. Extrait de `PlanResult` pour être RENDU DEUX FOIS
// par le même parent: dans la vue « toute la semaine » et dans la vue « un
// jour ». Deux corps de jour écrits séparément divergeraient au premier
// correctif — c'est l'argument exact qui a sorti `PlanResult` de `MealBuilder`.
//
// ── UN JOUR PORTE TOUT CE QUI LUI ARRIVE ───────────────────────────────────
// La session de cuisine qui tombe ce jour-là, la vague de courses qui tombe ce
// jour-là, puis les plats. Rien de neuf n'est calculé: la session est déjà
// dans `cookingSessions` (elle n'était lue que par `sessionForDish`), la vague
// vient de `planGroceryWaves` (module serveur réexporté, résolue par le
// parent), le motif d'une case vide vient de la grille déjà construite.
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
   * LES MOMENTS DU JOUR, lus dans la grille (`dayMoments`). `[]` = on ne dit
   * rien — c'est le choix du parent: en vue semaine, la grille au-dessus porte
   * déjà ces silences, et les répéter sous sept jours ferait vingt lignes de
   * bruit. En vue jour, ils sont le détail qu'on est venu lire.
   */
  moments: readonly DayMoment[];
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
}

export default function PlanDayBlock(props: PlanDayBlockProps) {
  const { group, date } = props;
  // LA SESSION DU JOUR. La donnée arrive déjà ici (elle n'était lue que par
  // `sessionForDish`); un jour sans session rend simplement rien. `group.day`
  // et `session.day` sont tous deux des JETONS — aucune conversion, donc
  // aucune divergence possible.
  const sessions = props.cookingSessions.filter((s) => s.day === group.day);
  // LES SILENCES DU JOUR — tout moment dont la case n'est pas un plat. Les
  // plats, eux, sont déjà les cartes dessous: les redire ici les doublerait.
  const silences = props.moments.filter((m) => m.cell.kind !== "dish");
  // LOT 3 — LES MOMENTS DE CE JOUR, ET QUI MANGE QUOI À CHACUN. Une seule
  // dérivation: les plats du groupe, tels que `groupByDay` les a rangés.
  const slotGroups = groupDayBySlot({
    dishes: group.dishes,
    portions: props.portions,
  });
  const quiet = group.dishes.length === 0 && sessions.length === 0 &&
    props.wave === null && silences.length === 0;
  return (
    <div>
      {group.day && (
        <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-ink">
          {dishDayLabel(group.day)}
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
        </h3>
      )}
      <div className="space-y-3">
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
          <DayGroceriesCard wave={props.wave} shoppingList={props.shoppingList} />
        )}
        {/* ── LA SESSION DE CUISINE DU JOUR ───────────────────────────────────
            Ce qu'on fait avant de manger. Carte compacte, dépliable vers le
            déroulé; la fenêtre « tes sessions de cuisine » reste la vue
            d'ensemble. Son dernier bloc est le Boxing. */}
        {sessions.map((session, index) => (
          <DaySessionCard
            key={`${session.day}-${index}`}
            session={session}
            preparations={props.preparations}
            // LES REPAS QUE CETTE SESSION MET EN BOÎTES — tout le plan, jamais
            // le seul jour rendu: une session du dimanche remplit les boîtes du
            // mardi.
            allDishes={props.allDishes}
            // LES PRÉNOMS DES BOÎTES. Même source que la séparation par personne
            // juste en dessous (`props.portions`): une seule liste de bouches
            // pour tout ce bloc, jamais deux.
            portions={props.portions}
          />
        ))}
        {/* ── LOT 3 · LES PLATS, MOMENT PAR MOMENT ───────────────────────────
            Le regroupement est PUR (`groupDayBySlot`) et il ne lit aucun titre:
            l'attribution vient de `dish.member_id`, le prénom de la ligne
            membre recopiée dans `member_portions` (F5). Un moment sans plat
            dédié se rend comme avant — c'est le cas majoritaire, et il ne paie
            rien. */}
        {slotGroups.map((slotGroup) => (
          <section key={`${group.day}-${slotGroup.slot ?? "no_slot"}`}>
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
              <h4 className="mb-2 text-label font-semibold uppercase tracking-wide text-ink-soft">
                {dishSlotLabel(slotGroup.slot)}
              </h4>
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
                  // ── LA SESSION QUI A FAIT SON LOT (2026-08-14) ─────────────
                  // RÉSOLUE ICI, comme `sources` juste au-dessus, et pour la
                  // même raison: le plat ne porte que des `id`, et une carte
                  // qui irait chercher les sessions elle-même dupliquerait la
                  // résolution sur les deux écrans qui la montent.
                  session={sessionForDish(dish, props.cookingSessions, props.preparations)}
                  // LE TITRE DE SECTION JUSTE AU-DESSUS A DÉJÀ NOMMÉ LE MOMENT.
                  // Garder la pastille ferait dire « Déjeuner » deux fois à
                  // trois centimètres d'écart, sur chaque carte du plan.
                  slotBadge={false}
                />
              )}
            />
          </section>
        ))}
        {/* ── LES MOMENTS SANS PLAT, ET LEUR MOTIF ───────────────────────────
            Les trois silences voulus se ressemblent entre eux (« rien ici, et
            c'est normal ») et ne ressemblent PAS au quatrième — même règle et
            mêmes textes que la grille, dont ces lignes sont la lecture. */}
        {silences.length > 0 && (
          <ul className="flex flex-col gap-1">
            {silences.map(({ slot, cell }) => (
              <li key={slot} className="text-xs text-ink-soft">
                <span className="font-medium">{dishSlotLabel(slot) ?? slot}</span>
                {" — "}
                {cell.kind === "away" && (
                  <span className="italic">{mealCopy("meals.grid.away")}</span>
                )}
                {/* ⛔ MÊME TROU QUE DANS LA GRILLE, ET IL COÛTE PLUS CHER ICI.
                    La ligne se rendait « Déjeuner — » et s'arrêtait là: un tiret
                    suivi de rien. C'est le moment PRÉCIS où le produit a le
                    droit de dire un ordre de grandeur (« vise autour de 700 »),
                    donc celui où un silence se lit comme une panne. */}
                {cell.kind === "eating_out" && (
                  <span className="italic">
                    {mealCopy("meals.grid.eating_out")}
                  </span>
                )}
                {cell.kind === "fixed_intake" && (
                  <span className="italic">{cell.label}</span>
                )}
                {cell.kind === "leftovers" && (
                  <span className="italic">{mealCopy("meals.grid.leftovers")}</span>
                )}
                {/* LE SEUL QUI SOIT UN DÉFAUT — il ne doit ressembler à aucun
                    des trois autres. Même ambre que la grille. */}
                {cell.kind === "empty" && (
                  <span
                    className="text-amber-700"
                    title={mealCopy("meals.grid.empty_hint")}
                  >
                    {mealCopy("meals.grid.empty")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {/* UN JOUR OÙ IL N'Y A VRAIMENT RIEN LE DIT — sans rythme déclaré, la
            grille ne sait rien motiver, et un bloc muet sous un titre de jour
            se lirait comme une panne. */}
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
function DaySessionCard(props: {
  session: CookingSession;
  preparations: readonly MealPreparation[];
  allDishes: readonly GeneratedDish[];
  portions: readonly MemberPortionView[];
}) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  const { session } = props;
  // LES `id` INCONNUS SONT ÉCARTÉS, PAS RENDUS TELS QUELS — même règle que
  // `sessionForDish`: un slug de lot ne veut rien dire à table.
  const preps = session.preparation_ids
    .map((id) => props.preparations.find((p) => p.id === id))
    .filter((p): p is MealPreparation => p !== undefined);

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
        {session.run_through && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            // L'idiome du kit pour déplier (patron `CookingSessions`): le
            // soulignement porte l'affordance, la teinte ne la porte pas.
            // `min-h-6` = plancher tactile de 24 px.
            className="ml-auto min-h-6 shrink-0 text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
          >
            {mealCopy(
              open
                ? "meals.result.day_session_hide"
                : "meals.result.day_session_show",
            )}
          </button>
        )}
      </div>
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

          ⚠️ LE `method` EST VISIBLE, PAS SOUS LE DÉPLIANT. C'est l'instruction
          du jour; la replier reviendrait à demander d'ouvrir un panneau pour
          savoir quoi faire de la casserole qu'on a devant soi. Le dépliant
          porte le DÉROULÉ — l'ORDRE des gestes entre les casseroles —, qui est
          une autre question. */}
      {preps.map((prep) => (
        <div key={prep.id} className="mt-3 first:mt-2">
          {prep.title !== "" && (
            <p className="text-sm font-semibold text-ink">{prep.title}</p>
          )}
          {/* ── CE QU'IL Y A DEDANS, AVANT DE DIRE QUOI EN FAIRE ───────────
              « Dans cette session de cuisine on comprend pas du tout qu'est-ce
              que ça concerne comme légume, les légumes rôtis » (2026-08-19).
              La carte donnait un titre et un mode d'emploi, jamais la matière:
              « Légumes d'été rôtis » ne dit ni lesquels ni combien, et on ne
              peut pas cuisiner ça.

              ⚠️ LES QUANTITÉS SONT CELLES DE LA FOURNÉE ENTIÈRE — le moteur
              les demande ainsi (`"quantity": "<for the WHOLE batch>"`). Ce
              sont les grammes qu'on ACHÈTE et qu'on met dans la casserole; les
              grammes de la pesée, juste en dessous, sont ceux qui sortent en
              boîtes. Les deux nombres sont différents et le restent: c'est
              cru contre prêt.

              ⚠️ MUET SANS QUANTITÉ, jamais « ? ». Un terme sans nombre reste
              une matière qu'on reconnaît en rayon; un point d'interrogation
              donnerait à un silence l'air d'une panne. */}
          {prep.ingredients.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {prep.ingredients.map((ing, i) => (
                <li
                  key={`${ing.term}-${i}`}
                  className="flex flex-wrap items-baseline gap-2 break-words text-sm text-ink"
                >
                  <span>{ing.term}</span>
                  {ing.quantity && (
                    <span className="tabular-nums text-ink-soft">{ing.quantity}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {prep.method && (
            <p className="mt-2 text-sm leading-6 text-ink-soft">{prep.method}</p>
          )}

        </div>
      ))}
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

          ⚠️ DEHORS DU DÉPLIANT, avec les durées: c'est ce qu'on lit en décidant
          de se mettre à cuisiner. Le dépliant porte le DÉROULÉ, qui est une
          autre question. */}
      <BoxTable
        lines={boxLinesForSession(session.preparation_ids, props.allDishes, props.portions)}
        context="session"
      />
      {open && session.run_through && (
        <p id={panelId} className="mt-2 text-sm leading-6 text-ink">
          {session.run_through}
        </p>
      )}
    </Card>
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
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  const count = props.wave.indices.length;
  const inWave = new Set(props.wave.indices);
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
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="ml-auto min-h-6 shrink-0 text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
        >
          {mealCopy(
            open
              ? "meals.result.day_groceries_hide"
              : "meals.result.day_groceries_show",
          )}
        </button>
      </div>
      {open && (
        <div id={panelId} className="mt-2">
          {groups.map((g) => (
            <div key={g.aisle} className="mt-2 first:mt-0">
              {/* Le cran d'étiquette de la charte, comme la fenêtre de
                  courses — même rayon, même mot, même forme. */}
              <h4 className="text-label font-semibold uppercase text-ink-soft">
                {aisleLabel(g.aisle)}
              </h4>
              <ul className="mt-1 flex flex-col gap-0.5">
                {g.items.map(({ item, index }) => (
                  <li
                    key={`${item.term}-${index}`}
                    className="flex flex-wrap items-baseline gap-2 text-sm text-ink"
                  >
                    <span className="break-words">{item.term}</span>
                    {item.quantity && (
                      <span className="text-ink-soft">{item.quantity}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
