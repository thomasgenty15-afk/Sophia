/**
 * LA PART DU RÉCLAMÉ — CE QUE LE FOYER A DÉJÀ COMPOSÉ POUR LUI.
 *
 * Contrat: `scratchpad/PLAN-ECRAN-DEMANDE-CONTRAT.md` §4.5, §1.4, §6.1, §6.2.
 *
 * ── LE TROU QUE CETTE CARTE FERME ─────────────────────────────────────────
 * Aujourd'hui un secondaire arrive sur `/app/plan` et lit « c'est le foyer qui
 * cuisine pour toi », sans bouton, puis « rien à montrer ». Il ne voit NI ce
 * que la maison cuisine NI sa propre part — alors que les deux existent en base
 * et sont lisibles par RLS. `loadMealPlans` est scopé `.eq("user_id", …)`, et
 * ce scope est JUSTE: ce dépôt a déjà rendu la ligne d'un élève à son coach
 * faute de ce filtre. La part se lit par une SECONDE requête, `loadHouseholdMeal`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ON NE GÉNÈRE RIEN, ET C'EST TOUT L'ARBITRAGE.
 *
 * « Quand le maître crée le plan, ça crée automatiquement le plan pour le
 * compte réclamé en prenant ses datas » — c'est déjà le cas, et depuis
 * toujours. `member_portions` porte un objet PAR BOUCHE, calculé sur SES
 * données (corps, objectif résolu, allergies, rythme). Il n'y avait rien à
 * calculer: il n'y avait qu'un écran manquant. Zéro appel modèle passe par
 * cette carte, sur aucun chemin.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── ⛔ « JE VALIDE » N'APPELLE PAS `keel_validate_meal_plan` ───────────────
 * Cette RPC veut dire « JE PRENDS LA MAIN, RETIREZ-MOI DU PLAN COMMUN »: elle
 * est consommée par la machinerie de fusion et elle REFUSE un plan
 * `plan_kind='household'` (`not_a_personal_plan`). La détourner ferait SORTIR
 * DU FOYER quelqu'un qui voulait dire oui. Le geste de prise de main a déjà sa
 * surface, séparée et explicite sur les conséquences: `TakeTheHandCard`.
 *
 * Ici « je valide » est un ACCUSÉ LÉGER, sans effet sur le plan du foyer, parce
 * que la composition n'attend JAMAIS personne — « et s'il valide pas alors go ».
 * ⚠️ IL NE SURVIT PAS À UN RECHARGEMENT: il n'existe aucune table pour ça et ce
 * lot n'en pose aucune. C'est une question ouverte, écrite comme telle dans
 * `scratchpad/RAPPORT-LOT-E-20260813.md`, pas un oubli.
 *
 * ── CE QUE CETTE CARTE N'AFFICHE JAMAIS ───────────────────────────────────
 *   · AUCUN OBJECTIF, aucun poids, aucune calorie, aucun « pourquoi » de part.
 *     `portion_note` est une INSTRUCTION DE SERVICE — « une part plus grande de
 *     poulet et de riz » se lit à table, « parce que tu prends de la masse » ne
 *     se lit pas. La garantie est côté serveur (`sanitizePortionNote`,
 *     `_shared/keel/household_portions.ts`), et c'est exactement ce qui permet
 *     d'afficher l'instruction: elle est publique, le motif ne l'est pas.
 *   · LA PART D'UN AUTRE. Il voit SA part et les plats COMMUNS — jamais la
 *     ligne de quelqu'un d'autre. La garde est `sharePresentedTo`, et elle
 *     compare `member_id`: rien d'autre à l'écran ne distinguerait deux lignes.
 *   · AUCUNE PHRASE QUI LUI REPROCHE DE NE RIEN FAIRE. Être composé dans le
 *     plan du foyer est la posture NORMALE et la plus courante, pas un manque —
 *     même règle que l'en-tête de `TakeTheHandCard`.
 *   · NI `why` NI INGRÉDIENTS des plats communs: `HouseholdDishView` ne porte
 *     que titre, jour et moment, et c'est délibéré (le « pourquoi » d'un plat
 *     est écrit pour la personne qu'il sert, et ce bloc est lu par tout le foyer).
 *
 * ── ⛔ AUCUN PARAMÈTRE DE GARDE OPTIONNEL ─────────────────────────────────
 * `meMemberId` est REQUIS: sans lui, `mine` ne peut pas être VÉRIFIÉE, et une
 * carte titrée « Ta part » qui rend la ligne d'un autre ne se voit pas.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 DEUX POINTS DE JONCTION OUVERTS — LIRE AVANT DE CROIRE CETTE CARTE MORTE
 *
 * 1. POUR LOT D (`StudentWeekPlanPage.tsx:2143`). Le site de montage passe
 *    `mine={null}` EN DUR, donc cette carte se tait TOUJOURS aujourd'hui. Le
 *    fichier appartient à Lot D et Lot E ne l'ouvre pas. La ligne qui l'allume,
 *    avec l'import `selectMyShare` de `api/myShare.ts`:
 *
 *        mine={selectMyShare({
 *          portions: householdMeal?.portions ?? [],
 *          meMemberId: household?.me?.memberId ?? null,
 *          isOwner,
 *        })}
 *
 *    ⚠️ `isOwner` EST LA MOITIÉ DE LA RÈGLE: le maître A une ligne dans
 *    `member_portions`, et il ne doit PAS voir cette carte — il a le plan.
 *    C'est `selectMyShare` qui porte ce refus, pas la carte: elle ne connaît
 *    pas la place, le site de montage si.
 *
 * 2. ✅ FERMÉ PAR LOT C — « DEMANDER UNE MODIF » A UNE DESTINATION.
 *    Lot E avait raison de ne PAS rendre ce bouton: il n'avait aucune
 *    destination, et un geste ABSENT vaut mieux qu'un geste MUET.
 *
 *    ⚠️ SA DESTINATION N'EST PAS UN CANAL VERS LE MAÎTRE, ET IL NE FAUT PAS EN
 *    FABRIQUER UN. Il n'existe AUCUN canal 1:1 dans ce produit, et aucune table
 *    ne reçoit la demande de modification d'un secondaire — `meal_plan_feedback`
 *    est le retour de FIN de fenêtre, questions fermées, une ligne par
 *    `meal_id`, pas ça. La phrase devient une NOTE DE BROUILLON: elle compose un
 *    APERÇU de sa propre semaine, qu'il voit, qu'il reprend et qu'il adopte s'il
 *    veut. C'est ce que le modèle autorise — il compose lui-même.
 *
 *    ⛔ `plan.mine.change_sent` (« C'est parti au foyer. ») N'EST DONC JAMAIS
 *    AFFICHÉE, ET LA CLÉ RESTE ORPHELINE EXPRÈS. Rien ne part au foyer. Cette
 *    phrase était écrite pour un canal qui n'existe pas; l'afficher parce
 *    qu'elle est là ferait exactement le bouton muet que Lot E a refusé de
 *    rendre. La retirer du seed est un geste i18n, hors de la colonne de ce lot.
 * ══════════════════════════════════════════════════════════════════════════
 */

import React from "react";

import type { HouseholdDishView, MemberPortionView } from "../../api/household";
import { dishDayLabel, dishSlotLabel } from "../../api/mealLabels";
import { sharePresentedTo } from "../../api/myShare";
import { t } from "../../i18n/t";
import { Button } from "../ui/Button";
import { Card, SectionLabel } from "../ui/Card";
import { inputClass } from "../ui/Field";

export interface MyShareCardProps {
  /** MA ligne de `member_portions`. `null` = rien à montrer, la carte se tait. */
  mine: MemberPortionView | null;
  /** Les plats du foyer, pour le contexte. `[]` = la carte n'en montre aucun. */
  householdDishes: readonly HouseholdDishView[];
  /** Ma bouche. REQUIS: sans elle, `mine` ne peut pas être vérifiée. */
  meMemberId: string | null;
  onApprove: () => Promise<void>;
  onRequestChange: (text: string) => Promise<void>;
  busy: boolean;
}

export default function MyShareCard(props: MyShareCardProps): React.ReactElement | null {
  const { mine, householdDishes, meMemberId, onApprove, onRequestChange, busy } = props;

  const [approved, setApproved] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  /**
   * LE CHAMP EST FERMÉ TANT QU'ON NE L'A PAS DEMANDÉ.
   *
   * Une zone de texte ouverte en permanence sous « Ta part » se lit comme une
   * chose à remplir, et être servi par le foyer est la posture NORMALE — pas un
   * manque. C'est la même règle que l'en-tête de cette carte: aucune phrase qui
   * reproche de ne rien faire.
   */
  const [changeOpen, setChangeOpen] = React.useState(false);
  const [changeText, setChangeText] = React.useState("");

  // LA GARDE D'IDENTITÉ, ET ELLE EST AVANT TOUT LE RESTE. Elle vit dans
  // `api/myShare.ts` avec la sélection qui la partage: la règle « jamais la
  // part d'un autre » est écrite à UN endroit.
  const share = sharePresentedTo({ mine, meMemberId });
  // SANS PART, PAS DE CARTE — et pas de phrase qui explique l'absence. Une
  // carte « tu n'as pas encore de part » apprendrait à lire un vide, et « pas
  // de part » n'est pas « une part ordinaire ». C'est aussi le comportement du
  // maître, qui n'a pas une part: il a le plan.
  if (!share) return null;

  return (
    <Card className="mb-3">
      <SectionLabel>{t("plan.mine.title")}</SectionLabel>

      {/* ── SA PART, EN TÊTE ────────────────────────────────────────────
          L'instruction de service est le CONTENU de cette carte: elle passe à
          `ink`, la liste des préparations reste en `ink-soft`. C'est la phrase
          qu'on lit à voix haute en servant. `plan.mine.standard` quand il n'y
          a pas d'instruction: une part standard EST une réponse. */}
      {/* ⚠️ `break-words` N'EST PAS DÉCORATIF, IL EST MESURÉ. Ces trois blocs
          portent du texte VENU DU MODÈLE — instruction de service, note de
          préparation, titre de plat — donc des mots dont personne ne contrôle
          la longueur. Relevé le 2026-08-13 à 320 px, dans la vraie feuille de
          l'app, avec un titre composé de 39 caractères insécables
          (« Kartoffelgratinmitschinkenundkaesesauce », plausible en allemand):
          sans lui, `document.scrollWidth` = 327 pour `clientWidth` = 320 —
          LE CORPS DE LA PAGE DÉFILE HORIZONTALEMENT. Avec lui: 320/320, et
          zéro élément en débordement. */}
      <p className="text-sm leading-6 text-ink break-words">
        {share.portionNote ?? t("plan.mine.standard")}
      </p>
      {share.shares.length > 0
        ? (
          <ul className="mt-1 flex flex-col gap-0.5 pl-4 text-sm text-ink-soft break-words">
            {share.shares.map((s) => <li key={s.preparationId}>{s.note}</li>)}
          </ul>
        )
        : null}

      {/* ── PUIS LES PLATS DE LA MAISON ─────────────────────────────────
          SOUS sa part, jamais au-dessus: la carte s'appelle « Ta part », et
          elle répond d'abord à ça. Pour un secondaire qui n'a pas pris la
          main, c'est le SEUL endroit du produit où il lit ce qu'on cuisine —
          `loadMealPlans` est scopé sur son `user_id` et ne lui rend rien.
          `border-line` (décoratif) et non `border-line-strong`: c'est une
          division À L'INTÉRIEUR d'une carte, pas un second cadre. */}
      {householdDishes.length > 0
        ? (
          <div className="mt-4 border-t border-line pt-3">
            <SectionLabel className="mb-2">{t("plan.mine.household_dishes")}</SectionLabel>
            <ul className="flex flex-col gap-0.5 text-sm text-ink-soft break-words">
              {householdDishes.map((dish, i) => (
                // La clé porte l'INDEX en plus du titre: deux jours peuvent
                // servir le même plat, et deux `<li>` de même clé perdent
                // l'un des deux au rendu.
                <li key={`${dish.day ?? ""}:${dish.slot ?? ""}:${dish.title}:${i}`}>
                  {[dishDayLabel(dish.day), dishSlotLabel(dish.slot)]
                    .filter(Boolean)
                    .join(" · ")}
                  {dish.day || dish.slot ? " — " : ""}
                  {dish.title}
                </li>
              ))}
            </ul>
          </div>
        )
        : null}

      {/* ── LE GESTE, EN DERNIER ────────────────────────────────────────
          Après sa part ET après les plats: « il n'y a plus qu'à valider » se
          dit une fois qu'on a tout lu. Même ordre que `TakeTheHandCard`, qui
          dit ce que le geste coûte avant de l'offrir.

          ⚠️ `secondary` ET NON `primary`: une seule action figue par vue
          rendue (`KIT-CONTRAT` §2). Sur `/app/plan` la figue est déjà prise
          par « composer la semaine » (`MealBuilder`, `type="submit"`), qui est
          rendu en même temps que cette carte pour un secondaire — il peut
          toujours prendre la main. */}
      <div className="mt-4">
        {approved
          ? <p className="text-sm text-ink-soft">{t("plan.mine.approved")}</p>
          : (
            <Button
              // TAILLE `md` (le défaut), comme `TakeTheHandCard`: c'est le
              // geste PRINCIPAL de sa carte, pas un geste de ligne. `sm` est
              // réservé aux actions rendues dans une liste.
              variant="secondary"
              disabled={busy || working}
              onClick={async () => {
                setWorking(true);
                setFailure(null);
                try {
                  await onApprove();
                  // L'ACCUSÉ EST POSÉ APRÈS L'APPEL, jamais avant: si
                  // l'appelant échoue un jour, « Validé. » serait un fait
                  // faux, et un fait faux affiché est indémentable.
                  setApproved(true);
                } catch (e) {
                  setFailure(e instanceof Error ? e.message : String(e));
                } finally {
                  setWorking(false);
                }
              }}
            >
              {t("plan.mine.approve")}
            </Button>
          )}

        {/* ── « DEMANDER UNE MODIF » — LE GESTE QUE LOT C ARME ─────────────
            APRÈS « je valide », et en second: dire oui est le cas courant, et
            le geste le plus offert doit être celui qu'on fait le plus souvent.

            ⚠️ IL N'ENVOIE RIEN À PERSONNE. Il ouvre un champ dont la phrase
            devient une NOTE DE BROUILLON — un aperçu de sa propre semaine.
            Aucune copie ne dit « envoyé »: il n'existe aucun canal 1:1, et une
            phrase qui le laisserait croire ferait attendre une réponse qui ne
            viendra jamais. */}
        {!changeOpen
          ? (
            <Button
              variant="ghost"
              className="ml-2"
              disabled={busy || working}
              onClick={() => setChangeOpen(true)}
            >
              {t("plan.mine.request_change")}
            </Button>
          )
          : (
            <div className="mt-3">
              <label
                htmlFor="my-share-change"
                className="block text-sm font-semibold text-ink"
              >
                {t("plan.mine.change_label")}
              </label>
              {/* LA MÊME PHRASE D'ATTENTE QUE LE BROUILLON, parce que c'est
                  littéralement le même champ: ce qu'on écrit ici part comme
                  `draft_note`, et sert à REFAIRE un aperçu. Un second texte
                  d'aide décrirait autrement une seule et même chose. */}
              <p className="mt-1 text-sm leading-6 text-ink-soft">
                {t("plan.draft.note_hint")}
              </p>
              <textarea
                id="my-share-change"
                className={`${inputClass} mt-2 min-h-20`}
                value={changeText}
                placeholder={t("plan.draft.note_placeholder")}
                // ⛔ PAS DE `maxLength`: le navigateur couperait la phrase EN
                // SILENCE, et la demande partirait tronquée sans que personne
                // ne le sache. Le serveur est le seul juge (280 signes).
                disabled={busy || working}
                onChange={(e) => setChangeText(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={busy || working || changeText.trim() === ""}
                  onClick={async () => {
                    setWorking(true);
                    setFailure(null);
                    try {
                      await onRequestChange(changeText);
                      // LE CHAMP SE REFERME UNE FOIS LA PHRASE PARTIE — et
                      // AUCUN accusé n'est posé: la preuve que la demande a
                      // été entendue, c'est l'aperçu qui s'ouvre par-dessus.
                      // Un « c'est envoyé » ici serait un fait faux, et un
                      // fait faux affiché est indémentable.
                      setChangeOpen(false);
                      setChangeText("");
                    } catch (e) {
                      setFailure(e instanceof Error ? e.message : String(e));
                    } finally {
                      setWorking(false);
                    }
                  }}
                >
                  {t("plan.draft.cta")}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy || working}
                  onClick={() => {
                    setChangeOpen(false);
                    setChangeText("");
                  }}
                >
                  {t("plan.draft.discard")}
                </Button>
              </div>
            </div>
          )}

        {/* ⛔ LE ROUGE RESTE: famille « échec » du produit, et un motif nommé
            est un FAIT. `red-700` sur `paper` = 6,13:1, la valeur du kit. */}
        {failure
          ? <p className="mt-2 text-sm leading-6 text-red-700 break-words">{failure}</p>
          : null}
      </div>
    </Card>
  );
}
