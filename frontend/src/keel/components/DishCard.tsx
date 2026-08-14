import React from "react";

import { type GeneratedDish } from "../api/mealGeneration";
import { type DishEnergyView } from "../api/mealEnergy";
import { dishDayLabel, dishSlotLabel, mealCopy } from "../api/mealLabels";
import { type DishSessionView } from "../lib/dishSession";
import { type DishTick } from "../lib/useMealTicks";
import { DishEnergyLine } from "./plan/EnergyReadout";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";

// UN PLAT, RENDU UNE SEULE FOIS.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// Le plat était rendu dans `MealBuilder` (« ce que je viens de composer ») et
// devait l'être une seconde fois dans `/app/today` (« ce que je mange
// aujourd'hui »). Deux rendus du même objet finissent par diverger, et ici la
// divergence se paierait sur la seule chose qui compte: l'élève lirait des
// ingrédients sur un écran et pas sur l'autre, sans aucun moyen de savoir
// lequel des deux ment.
//
// LE PLAT ENTIER, PAS SON TITRE. Le titre seul (« Chicken thighs, rice,
// spinach ») oblige à rouvrir un autre écran pour cuisiner. Un plat se lit là
// où on le mange: les ingrédients avec leurs quantités, et la méthode.
//
// ── LA DOCTRINE NE S'AFFICHE JAMAIS ────────────────────────────────────────
// Même règle que le moteur: les convictions du coach ENTRENT dans la
// composition et n'en RESSORTENT pas. `GeneratedDish` ne porte même pas
// `honours_belief_keys` (le client `api/mealGeneration.ts` refuse de le
// recopier), donc ce composant n'a rien à afficher par accident.
//
// C'est l'inverse d'une ligne de semaine (`WeekPlanItem.source_belief_claim`),
// qui cite la conviction exprès — et ce n'est pas une incohérence: une ligne de
// méthode est une LECTURE de la conviction, qu'il faut pouvoir juger; un plat
// est un dîner que la méthode a servi à composer, et l'annoter de la méthode
// transformerait un repas en leçon.
//
// ── UNE SEULE CASE, ET ELLE NE MESURE PAS L'OBÉISSANCE ─────────────────────
// `tick` est OPTIONNEL, et son absence est le défaut: un `DishCard` sans lui
// est strictement en lecture. C'est ce qui garde la règle d'origine vraie là où
// elle l'était — aucun statut, aucune série, aucun « l'a-t-il suivi », parce
// que personne n'a rien prescrit.
//
// Ce que la case dit, quand elle est là: « j'ai mangé ça ». Un fait rapporté
// par l'élève, pas une consigne validée. Elle n'ouvre aucun score et ne crédite
// aucune ligne de plan (`_shared/keel/meal_tick.ts`: sans référence
// structurée, l'évaluateur ne crédite rien); elle compte pour la COUVERTURE —
// « cet élève rapporte ce qu'il mange » — et strictement rien d'autre.
//
// QUI DÉCIDE DE L'AFFICHER: l'appelant, et seulement sur les plats
// d'aujourd'hui. Le pourquoi de cette borne est dans `lib/useMealTicks.ts`
// (une coche est datée du jour où on tape, donc elle n'a de sens que sur ce
// qu'on mange ce jour-là).

/**
 * CE JOUR-CI EST-IL LE JOUR DE CUISSON, OU UN JOUR DE RESTES ?
 *
 * Défaut mesuré, et il est grossier: un plat en lot est placé sur chaque jour
 * qu'il couvre, et il y répétait ses quantités ENTIÈRES. « chicken thighs
 * 1,200 g » apparaissait lundi, mardi, mercredi et jeudi — quatre fois. Un
 * élève qui lit ça comprend qu'il doit acheter et cuire 4,8 kg de poulet.
 * (La liste de courses, elle, était juste: 2 kg au total.)
 *
 * `null` = ce plat se cuisine ici, ou ne se cuisine qu'une fois: quantités et
 * méthode complètes. Un jeton de jour = on mange le lot cuit CE jour-là, et la
 * carte se replie sur ce qu'il faut vraiment faire — sortir la boîte.
 */
export type ServedFrom = string | null;

/** La préparation dans laquelle ce plat puise, résolue par l'appelant. */
export interface DishSource {
  title: string;
  cookOn: string | null;
}

export default function DishCard(
  { dish, tick, servedFrom = null, sources = [], energy = null, session = null }: {
    dish: GeneratedDish;
    tick?: DishTick | null;
    servedFrom?: ServedFrom;
    /** Les préparations que ce plat consomme. Vide = il se fait de zéro. */
    sources?: readonly DishSource[];
    /**
     * LA SESSION DE CUISINE DONT CE PLAT TIRE SON LOT — résolue par l'appelant.
     *
     * `null` est le défaut ET le cas le plus fréquent: un plat cuisiné de zéro
     * n'a pas de lot, donc pas de session, donc pas de bouton. C'est aussi ce
     * que reçoit tout appelant qui ne tient pas les sessions (`/app/today`,
     * qui rend la journée et non le planning) — la carte ne va PAS les
     * chercher elle-même: elle serait alors un second lecteur du même plan,
     * et deux lecteurs finissent par se contredire.
     */
    session?: DishSessionView | null;
    /**
     * FF-059 — L'ÉNERGIE DE CE PLAT, quand les quatre portes sont ouvertes.
     *
     * `null` est le défaut ET le cas le plus fréquent: un élève sous plancher
     * TCA, un mineur, un élève dont le coach ne compte pas, un élève qui a
     * éteint — pour tous ceux-là, la réponse du serveur ne contient AUCUN
     * chiffre, donc l'appelant n'a rien à passer. La carte ne teste aucun droit:
     * elle ne peut pas afficher ce qui n'existe pas dans son arbre de props.
     *
     * C'est ce qui répond à l'angle adversarial « une prop React qui fuit »:
     * la prop existe, la donnée non.
     */
    energy?: DishEnergyView | null;
  },
) {
  // CE PLAT PUISE-T-IL DANS UNE PRÉPARATION ?
  //
  // La recette et les quantités du LOT vivent dans la session de cuisine, et
  // les répéter ici ferait racheter et recuire ce qui est déjà au frigo (défaut
  // mesuré: « 1,200 g de cuisses » sur quatre jours). Le modèle s'en charge —
  // un plat en lot ne porte plus que ce qu'on AJOUTE à l'assiette.
  //
  // ⚠️ CE DRAPEAU NE MASQUE PLUS RIEN DEPUIS LE 2026-08-14. Il choisit un
  // LIBELLÉ: « comment » pour une recette, « au moment de servir » pour le
  // geste du repas. Masquer `method` sur ces plats-là supprimait la seule
  // phrase qui leur restait à dire.
  const leftover = servedFrom !== null || sources.length > 0;
  // Une case a besoin d'un libellé qui lui appartient: le même plat est rendu
  // sur `/app/plan` et `/app/today`, et un `id` en dur ferait pointer deux
  // libellés vers la même case.
  const tickId = React.useId();
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{dish.title}</span>
        {dish.slot && <Badge tone="neutral">{dishSlotLabel(dish.slot)}</Badge>}
        {/* FF-059 — LE CHIFFRE, à côté du plat et pas au-dessus. C'est un fait
            SUR CE PLAT, du même rang que son créneau: le mettre en tête de
            carte en ferait le sujet, et le sujet reste le dîner. */}
        <DishEnergyLine energy={energy} />
        {tick && (
          <span className="ml-auto flex items-center gap-2">
            {/* Une case est un CONTRÔLE: sa bordure doit tenir le seuil 3:1 de
                WCAG 1.4.11, donc `line-strong` (3,84:1) et jamais `line`
                (1,30:1). L'anneau de focus est celui de la charte, `fig-600`
                (7,36:1) — la marque marque bien l'action, et le focus en est une.
                `rounded-part` = 4px, la petite pièce du vocabulaire de rayon. */}
            <input
              id={tickId}
              type="checkbox"
              className="h-4 w-4 rounded-part border-line-strong text-ink focus:ring-fig-600 disabled:opacity-50"
              checked={tick.checked}
              disabled={tick.busy}
              onChange={tick.onToggle}
            />
            <label
              htmlFor={tickId}
              className={`text-sm ${tick.checked ? "text-ink" : "text-ink-soft"}`}
            >
              {mealCopy("meals.tick.label")}
            </label>
          </span>
        )}
      </div>
      {dish.why && <p className="mt-1 text-sm text-ink-soft">{dish.why}</p>}

      {/* LE JOUR DE CUISSON, QUAND CE N'EST PAS AUJOURD'HUI. C'est la seule
          chose à faire ce jour-là, donc c'est la seule chose affichée.
          ⚠️ `bg-gray-50` NE DEVIENT PAS `bg-paper`: `paper` est le remplissage de
          la carte elle-même, donc le bloc disparaîtrait. `paper-2` (1,08:1 sur
          `paper`) est le second fond nommé par la charte — c'est l'idiome du
          fronton de `ui/Modal.tsx` — et le trait `line` garantit l'arête même là
          où le remplissage ne se voit pas. */}
      {sources.length > 0 && (
        <div className="mt-3 space-y-1 rounded-card border border-line bg-paper-2 px-3 py-2">
          {sources.map((source, i) => (
            <p key={`${source.title}-${i}`} className="text-sm text-ink">
              {mealCopy("meals.result.from_prep")
                .replace("{title}", source.title)
                .replace(
                  "{day}",
                  (source.cookOn ? dishDayLabel(source.cookOn) : null) ??
                    source.cookOn ?? "—",
                )}
            </p>
          ))}
        </div>
      )}
      {sources.length === 0 && servedFrom !== null && (
        <p className="mt-3 rounded-card border border-line bg-paper-2 px-3 py-2 text-sm text-ink">
          {mealCopy("meals.result.from_batch").replace(
            "{day}",
            dishDayLabel(servedFrom) ?? servedFrom,
          )}
        </p>
      )}

      {dish.ingredients.length > 0 && (
        <ul className="mt-3 space-y-1">
          {dish.ingredients.map((ing, i) => (
            <li
              key={`${ing.term}-${i}`}
              className="flex flex-wrap items-baseline gap-2 text-sm text-ink"
            >
              <span>{ing.term}</span>
              {ing.quantity && <span className="text-ink-soft">{ing.quantity}</span>}
              {ing.in_pantry && (
                <Badge tone="positive">{mealCopy("meals.result.in_pantry")}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* ── LE GESTE À FAIRE DEVANT CE PLAT-LÀ (2026-08-14) ─────────────────
          `method` était masqué sur EXACTEMENT les plats qui en ont le plus
          besoin. Un plat cuisiné de zéro montrait sa recette; celui qui a
          besoin qu'on dise « réchauffe 10 min, tranche le poulet, ajoute la
          salade » ne montrait rien — ni ici, ni dans les sessions de cuisine
          (qui portent les GROSSES cuissons, pas le geste du repas). Le geste du
          soir n'apparaissait donc nulle part dans le produit.

          Le masquage avait sa raison, et elle tient toujours: ce qu'on ne veut
          pas revoir, c'est la RECETTE DU LOT recopiée sous chaque jour, avec
          ses quantités entières (« 1 200 g de cuisses » sur quatre jours). Le
          prompt de composition demande déjà autre chose au modèle — « a dish
          that draws on a preparation does NOT repeat its recipe. Its method is
          what you do at that meal » — et c'est ce qu'il écrit vraiment: 476
          plats en lot mesurés en base le 2026-08-14, 0 méthode vide, 111
          caractères de moyenne, 247 au pire. Un geste, pas un pavé.

          ⚠️ DEUX MOTS, PAS UN. Le libellé change avec le cas
          (`meals.result.assemble` vs `meals.result.method`): sous « Comment »,
          un assemblage se lirait comme la recette qu'on vient justement de ne
          pas répéter.
          ⚠️ AUCUNE DURÉE N'EST AJOUTÉE. Si le modèle ne dit pas combien de
          temps, l'écran ne l'estime pas: `active_minutes` vit sur les
          PRÉPARATIONS, et le reprendre ici donnerait à un assemblage le temps
          d'une cuisson.
          ⚠️ RIEN NE S'AFFICHE SANS TEXTE. Pas de libellé au-dessus du vide. */}
      {dish.method && (
        <p className="mt-3 text-sm text-ink">
          <span className="font-medium text-ink">
            {mealCopy(leftover ? "meals.result.assemble" : "meals.result.method")}:
          </span>{" "}
          {dish.method}
        </p>
      )}

      {/* ── LE PLAT ET LA SESSION QUI A FAIT SON LOT (2026-08-14) ───────────
          Le chemin `dish.uses[].preparation_id → cooking_sessions[]
          .preparation_ids` existait ENTIÈREMENT dans la donnée, et n'était
          nulle part à l'écran: « tes sessions de cuisine » porte les grosses
          cuissons sans dire quel plat en sort, et cette carte disait d'où
          venait son lot (`sources`, plus haut) sans dire dans quelle session
          il avait été fait. Le bouton ne fait que rendre ce lien visible.

          ⚠️ IL EST POSÉ JUSTE SOUS LE GESTE DU SOIR, ET C'EST DÉLIBÉRÉ: les
          deux se lisent ENSEMBLE. « Réchauffe une portion et presse un citron »
          ne dit pas d'où vient la portion; « la session du mercredi, où on a
          fait le poulet, le riz et les légumes » le dit. Le geste n'est pas
          recopié dans le dépliant — il est déjà là, une ligne au-dessus, et
          l'écrire deux fois sur la même carte ferait relire la même phrase.

          ⚠️ DISCRET PAR DÉFAUT. Fermé, c'est un contrôle de texte souligné —
          l'idiome de `CookingSessions` pour déplier une recette. Le planning
          se lit d'un coup d'œil; il ne doit pas devenir une liste de recettes
          dépliées.

          ⛔ AUCUNE DURÉE. `active_minutes` et `total_minutes` vivent sur les
          préparations et sur la session; les recopier ici donnerait à un
          assemblage le temps d'une cuisson. Elles ont déjà leur surface. */}
      {session && <SessionLink session={session} />}
    </Card>
  );
}

/**
 * LE DÉPLIANT DE LA SESSION.
 *
 * ⚠️ COMPOSANT À PART, ET PAS UN `useState` DE PLUS DANS `DishCard`. La carte
 * est rendue jusqu'à vingt-six fois sur `/app/plan`: un état ouvert/fermé de
 * plus dans son corps se recrée à chaque rendu de la liste, et surtout il
 * existerait pour les plats qui n'ont AUCUNE session. Ici, l'état n'existe que
 * là où il y a quelque chose à ouvrir.
 */
function SessionLink({ session }: { session: DishSessionView }) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        // L'IDIOME DU KIT POUR DÉPLIER, repris de `CookingSessions`: le
        // soulignement porte l'affordance, la teinte ne la porte pas — la
        // figue reste à l'action principale de l'écran. `min-h-6` est le
        // plancher de 24 px de WCAG 2.5.8, que `text-xs` seul n'atteint pas.
        className="min-h-6 text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
      >
        {mealCopy(open ? "meals.result.session_hide" : "meals.result.session_open")}
      </button>
      {open && (
        <div
          id={panelId}
          // ⚠️ `data-preparation-id` N'EST PAS UN ORNEMENT DE TEST. C'est
          // l'identifiant QUI A FAIT LE LIEN entre ce plat et cette session.
          // Il ne s'affiche pas — un slug de lot ne veut rien dire à table —
          // mais il rend la jointure auditable dans le DOM, sans relire le
          // code. Une jointure invisible est une jointure qu'on ne sait pas
          // prouver juste.
          data-preparation-id={session.viaPreparationId}
          // `paper-2` (1,08:1 sur `paper`) est le second fond nommé par la
          // charte, et le trait `line` garantit l'arête même là où le
          // remplissage ne se voit pas. Même bloc que `sources`, plus haut:
          // c'est la même famille d'information — d'où vient ce plat.
          className="mt-2 rounded-card border border-line bg-paper-2 px-3 py-2"
        >
          <p className="text-sm font-medium text-ink">
            {dishDayLabel(session.day) ?? session.day}
          </p>
          {/* CE QUI EST SORTI DE LA MÊME CASSEROLÉE. C'est la moitié que le
              plat n'avait nulle part: « le poulet, le riz et les légumes ont
              été faits ensemble ». Muet quand la session ne nomme aucune
              préparation connue — pas de libellé au-dessus du vide. */}
          {session.preparations.length > 0 && (
            <p className="mt-1 text-sm leading-6 text-ink-soft break-words">
              {mealCopy("meals.result.session_also").replace(
                "{titles}",
                session.preparations.join(", "),
              )}
            </p>
          )}
          {/* LE DÉROULÉ, tel que le modèle l'a écrit. `break-words` n'est pas
              décoratif: c'est du texte VENU DU MODÈLE, donc des mots dont
              personne ne contrôle la longueur, et à 320 px un mot insécable
              fait défiler LE CORPS DE LA PAGE. */}
          {session.runThrough && (
            <p className="mt-1 text-sm leading-6 text-ink break-words">
              {session.runThrough}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
