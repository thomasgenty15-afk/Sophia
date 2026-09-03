/**
 * UN PLAN PAR PERSONNE — « QUI MANGE QUOI », ENFIN À L'ÉCRAN.
 *
 * ── LE TROU QUE CETTE VUE FERME ───────────────────────────────────────────
 * « Ta semaine d'un coup d'œil » montre UN plan: petit-déjeuner, déjeuner,
 * après-midi, dîner, sept jours. Dans un foyer de deux, elle ne dit pas qui
 * mange quoi. Demande du propriétaire, 2026-08-14:
 *
 *   « Normalement il devrait y avoir autant de vues que de personnes dans le
 *   foyer. Là on sait pas qui mange quoi. Chacun doit savoir ce qu'il mange
 *   séparément, et il faut une vue qui combine tout — voir ce que chacun mange
 *   en parallèle. Une ligne par personne. »
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ON NE GÉNÈRE RIEN, ET C'EST TOUT L'ARBITRAGE.
 *
 * `member_portions` porte un objet PAR BOUCHE depuis toujours, calculé sur SES
 * données (corps, objectif résolu, allergies, rythme). Il n'y avait rien à
 * calculer: il n'y avait qu'un écran manquant. ZÉRO APPEL MODÈLE PASSE PAR
 * CETTE VUE, SUR AUCUN CHEMIN — elle rend une colonne déjà écrite.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QU'ELLE REMPLACE, ET POURQUOI CE N'EST PAS UNE PERTE ───────────────
 * « À table » (`plan/TableCard.tsx`) a été retirée le même jour: elle listait
 * une instruction de service par bouche SOUS le plan, loin des plats qu'elles
 * servaient — « on comprend rien, c'est flou ». Cette vue porte LES MÊMES
 * PARTS, dans la grille, à côté du plat qu'elles servent. Ce n'est pas une
 * perte, c'est un déplacement.
 *
 * ── ⛔ LES GARDES D'AFFICHAGE, QUI SONT DES RÈGLES PRODUIT ────────────────
 *
 * 1. AUCUN OBJECTIF, AUCUN POIDS, AUCUNE CALORIE, AUCUN « POURQUOI » DE PART.
 *    `portion_note` est une INSTRUCTION DE SERVICE. C'est la RÈGLE, et elle
 *    reste. ⚠️ L'INSTRUCTION EST PUBLIQUE, LE MOTIF QUI LA PRODUIT NE L'EST
 *    PAS. (Règle recopiée de l'en-tête de `TableCard.tsx`, supprimée le
 *    2026-08-14. Une règle dont le seul porteur disparaît est une règle qu'on
 *    redécouvrira par un incident.)
 *
 *    ⛔ CE QUI SUIT A ÉTÉ CORRIGÉ LE 2026-08-19 (lot D) — CE COMMENTAIRE
 *    PROMETTAIT UNE GARANTIE QUE LE CODE N'ARME PAS. Il disait
 *    « garantie sans MOTIF ni vocabulaire de corps par `sanitizePortionNote`
 *    côté serveur ». La moitié « vocabulaire de corps » est vraie; la moitié
 *    « sans motif » ne l'est pas, et c'est la moitié qui rassure.
 *
 *    CE QUE `sanitizePortionNote` TIENT VRAIMENT: une LISTE FERMÉE de
 *    vocabulaire de corps et d'objectif (`FORBIDDEN_PORTION_TERMS`,
 *    `household_portions.ts`) — poids, maigrir, silhouette, calories/kcal/BMI,
 *    taille et tour de taille possessifs, mesures, âge, sèche, le mot `régime`
 *    lui-même, et les six valeurs de `MEMBER_GOALS`. Une note qui mord est mise
 *    à `null`, jamais réécrite.
 *
 *    CE QU'ELLE NE TIENT PAS, mesuré le 2026-08-19 en appelant la fonction
 *    directement, notes rendues INTACTES:
 *      · « One ladle of the vegan chilli »            → passe
 *      · « Serve her the pescatarian plate »          → passe
 *      · « Half a portion of the halal chicken »      → passe
 *      · « Give her the gluten-free pasta »           → passe
 *      · « Keep the sesame away from her plate »      → passe
 *    (contre-épreuve, la liste mord bien: « A smaller share, for her fat
 *    loss » et « elle fait attention à son poids » sont mises à `null`.)
 *
 *    Autrement dit: le NOM d'un régime et une CONTRAINTE MÉDICALE ne sont pas
 *    filtrés. Le mot `regime` est dans la liste, les régimes ne le sont pas.
 *
 *    ⚠️ CE QUE ÇA COÛTE À CETTE VUE, PRÉCISÉMENT — et c'est moins que la
 *    phrase d'origine ne le laissait croire dans l'autre sens. Sur 101 plans
 *    de foyer en base, 18 nomment un régime en clair; les 29 occurrences sont
 *    TOUTES dans le champ `why` d'un plat (« A non-vegan plate for Roxane… »),
 *    que cette vue ne rend PAS: `HouseholdDishView` ne le porte pas et
 *    `DishListByDay` n'affiche que jour/moment/titre. ZÉRO occurrence dans les
 *    336 `portion_note` de la base. Le trou est donc RÉEL et NON EXERCÉ ici:
 *    rien ne l'empêche d'arriver, seul le modèle ne l'a pas encore écrit à cet
 *    endroit-là — la forme exacte de faux vert que ce dépôt paie en boucle.
 *
 *    ⛔ N'ARME PAS LE FILTRE DEPUIS CETTE VUE. Un filtrage côté écran serait
 *    une seconde garde, divergente de la première, et c'est celle qu'on relit
 *    le moins qui déciderait. L'extension du verrou de sortie est un lot à part
 *    (`applyKeelOutputLocks` ne reçoit aujourd'hui ni titres de préparation ni
 *    `portion_note`), et elle doit porter la tolérance des négations — sans
 *    elle, « Keep the sesame away » se ferait mordre par son propre allergène.
 *
 * 2. UN MINEUR N'A JAMAIS D'OBJECTIF AFFICHÉ, et la ceinture est STRUCTURELLE:
 *    les seules entrées de ce composant sont `MemberPortionView` et
 *    `HouseholdDishView`, dont AUCUN champ ne peut porter un objectif. Il n'y
 *    a pas de discipline à tenir ici — il n'y a nulle part où en mettre un.
 *
 * 3. ⛔ `isOwner`-ONLY, ET C'EST LA GARDE LA PLUS IMPORTANTE. Cette vue montre
 *    la part de TOUT LE MONDE. `MyShareCard` interdit explicitement « la part
 *    d'un autre » à un secondaire, et cette vue-ci serait le contournement de
 *    cette règle si elle lui était rendue. Elle est sûre pour le MAÎTRE et
 *    pour lui seul, exactement comme la carte de référence l'était: c'est lui
 *    qui a saisi les bouches, leurs corps et leurs directions; il n'apprend
 *    rien qu'il n'ait écrit.
 *    ⚠️ SI UN LOT FUTUR REND CETTE VUE À QUELQU'UN D'AUTRE, IL DOIT D'ABORD
 *    RÉPONDRE À « QUI A LE DROIT DE LIRE LA PART DE QUI », ET LA RÉPONSE N'EST
 *    PAS « TOUT LE FOYER ».
 *
 * ── LE DÉFAUT D'AFFICHAGE: PARALLÈLE, ET C'EST UNE DÉCISION ───────────────
 * La question qui a produit ce lot — « on sait pas qui mange quoi » — est une
 * question de COMPARAISON, et une comparaison a besoin des deux côtés. Ouvrir
 * sur « une personne » obligerait à choisir un nom avant de voir quoi que ce
 * soit, c'est-à-dire à répondre à la question avant de l'avoir posée.
 * L'individuel est à un clic, et il reste la seule vue utile pour lire la
 * semaine d'une bouche qui n'a pas de compte — le maître la lit à sa place:
 * la vue existe, l'accès non.
 *
 * ── 320 px ────────────────────────────────────────────────────────────────
 * La géométrie vient de `PlanGrid`: table, colonne de gauche COLLANTE,
 * `overflow-x-auto`, `min-w`. Sept colonnes ne tiennent pas à 320 px et
 * laisser la page partir de travers emporterait tout l'écran. La table défile
 * DANS son conteneur; le corps de la page, jamais.
 */

import React from "react";

import type { HouseholdDishView, MemberPortionView } from "../../api/household";
import { dishDayLabel, dishSlotLabel } from "../../api/mealLabels";
import {
  buildPersonWeek,
  buildPlanByPerson,
  type PersonRow,
} from "../../lib/planByPersonModel";
import { t } from "../../i18n/t";
import { Card, SectionLabel } from "../ui/Card";
import { inputClass } from "../ui/Field";
import DishListByDay from "./DishListByDay";

export interface PlanByPersonProps {
  /** Les jours de la fenêtre, DANS L'ORDRE DU PLAN. */
  days: readonly string[];
  /** Les dates des colonnes, même longueur et même ordre que `days`. */
  dates: readonly string[];
  /** Aujourd'hui, pour souligner sa colonne. */
  today: string;
  dishes: readonly HouseholdDishView[];
  portions: readonly MemberPortionView[];
  /**
   * ⛔ REQUIS, ET `false` EST UNE AFFIRMATION. Un appelant qui ne sait pas
   * encore s'il est maître ne doit pas hériter d'un défaut permissif: cette
   * vue rend la part de tout le monde. Cicatrice du dépôt — « paramètre de
   * garde optionnel = garde désarmée ».
   */
  isOwner: boolean;
}

type Mode = "together" | "one";

export default function PlanByPerson(props: PlanByPersonProps): React.ReactElement | null {
  const [mode, setMode] = React.useState<Mode>("together");
  const [who, setWho] = React.useState<string | null>(null);

  const model = buildPlanByPerson({
    days: props.days,
    dishes: props.dishes,
    portions: props.portions,
  });

  // ── LES TROIS SILENCES, ET AUCUN NE S'EXPLIQUE À L'ÉCRAN ────────────────
  // Une carte « tu n'as pas encore de parts » apprendrait à lire un vide, et
  // « pas de part » n'est pas « une part ordinaire ». Même règle que
  // `MyShareCard` et que la carte de fusion: on se tait.
  if (!props.isOwner) return null;
  // ⚠️ DEUX BOUCHES AU MOINS. À une seule, « qui mange quoi » n'a pas de sujet:
  // il n'y a personne à côté de qui se lire, et la ligne unique répéterait ce
  // que le plan dit déjà. La composition à 1 est le chemin MAJORITAIRE du
  // produit (l'entrée est à 1), donc ce cas doit se taire, pas se dégrader.
  if (props.portions.length < 2) return null;
  if (model.groups.length === 0) return null;

  const selected = props.portions.find((p) => p.memberId === who) ?? props.portions[0];

  return (
    <Card className="mb-3">
      <SectionLabel>{t("plan.person.title")}</SectionLabel>
      <p className="mt-1 text-sm leading-6 text-ink-soft">{t("plan.person.hint")}</p>

      {/* ── LE CHOIX DE VUE ──────────────────────────────────────────────
          Deux boutons plutôt qu'un menu: il y a exactement deux états, ils
          tiennent tous les deux à l'écran, et un menu à deux entrées cache la
          moitié de ce qu'il propose. `aria-pressed` porte l'état — la couleur
          seule ne le dirait pas à un lecteur d'écran. */}
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("plan.person.title")}>
        {(["together", "one"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            // Le contour d'un CONTRÔLE tient le seuil 3:1 de WCAG 1.4.11, donc
            // `line-strong` (3,84:1) et jamais `line` (1,30:1, décoratif).
            className={`min-h-6 rounded-part border px-2.5 py-0.5 text-xs ${
              mode === m
                ? "border-line-strong bg-fig-50 font-semibold text-ink"
                : "border-line-strong bg-paper text-ink-soft hover:bg-fig-50"
            }`}
          >
            {t(m === "together" ? "plan.person.mode_together" : "plan.person.mode_one")}
          </button>
        ))}
      </div>

      {mode === "together"
        ? <Together model={model} dates={props.dates} today={props.today} />
        : (
          <OnePerson
            person={selected}
            people={props.portions}
            onPick={setWho}
            days={model.days}
            dishes={props.dishes}
          />
        )}
    </Card>
  );
}

/**
 * CÔTE À CÔTE — LE PLAT UNE FOIS, PUIS UNE LIGNE PAR BOUCHE.
 *
 * ⚠️ LE PLAT N'EST PAS RÉPÉTÉ SOUS CHAQUE BOUCHE, ET C'EST UN FAIT, PAS UNE
 * ÉCONOMIE DE PLACE. Deux bouches sans profil réclamé mangent LE MÊME PLAT: la
 * divergence est dans la PART. Répéter l'intitulé sur chaque ligne affirmerait
 * une individualisation du plat qui n'existe pas dans le moteur, et ferait
 * lire deux plans là où il y en a un.
 */
function Together(
  props: {
    model: ReturnType<typeof buildPlanByPerson>;
    dates: readonly string[];
    today: string;
  },
) {
  return (
    <div className="mt-3 overflow-x-auto">
      {/* ⚠️ LA LARGEUR MINIMALE SUIT LE NOMBRE DE JOURS, ET C'EST MESURÉ.
          `PlanGrid` porte un `min-w-[30rem]` fixe, qui lui va parce que ses
          cases portent un TITRE. Les cases d'ici portent une PHRASE de service
          (« 1 portion of chicken with plenty of roasted vegetables »): à 30rem
          les colonnes tombaient à ~3rem et rendaient un mot par ligne.
          Mais un minimum fixe assez large pour sept jours DÉBORDE sur un plan
          de trois — mesuré le 2026-08-14 à 1280 px: conteneur 702, table 736,
          la dernière colonne coupée alors qu'il restait de la place. Le
          minimum est donc calculé: la colonne des prénoms plus 7rem par jour.
          Trois jours tiennent, sept défilent, et le défilement reste DANS le
          conteneur — le corps de la page ne part jamais de travers. */}
      <table
        className="w-full border-collapse text-sm"
        style={{ minWidth: `${8 + props.model.days.length * 7}rem` }}
      >
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 bg-paper py-2 pr-3 text-left text-xs font-medium text-ink-soft"
            >
              {t("plan.person.dish_row")}
            </th>
            {props.model.days.map((day, i) => {
              const isToday = props.dates[i] === props.today;
              return (
                <th
                  key={`${day}-${i}`}
                  scope="col"
                  // ⛔ AUJOURD'HUI EST UNE POSITION, PAS UN ÉTAT — même
                  // arbitrage que `PlanGrid`: l'émeraude dit « ok » partout
                  // dans le produit, et être aujourd'hui n'est pas une
                  // réussite. La position se dit par la FORME.
                  className={`min-w-[7rem] px-2 py-2 text-left text-xs ${
                    isToday ? "font-semibold text-ink" : "font-medium text-ink-soft"
                  }`}
                >
                  <span className="block">{(dishDayLabel(day) ?? day).slice(0, 3)}</span>
                  <span className="block font-normal text-ink-soft">
                    {props.dates[i]?.slice(8) ?? ""}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        {props.model.groups.map((group) => (
          // UN `tbody` PAR MOMENT. Le groupe est l'unité de lecture:
          // « au dîner, voilà le plat, et voilà ce que chacun prend ».
          <tbody key={group.slot} className="border-t border-line-strong">
            <tr className="align-top">
              <th
                scope="row"
                className="sticky left-0 z-10 whitespace-nowrap bg-paper py-2 pr-3 text-left font-medium text-ink"
              >
                {dishSlotLabel(group.slot) ?? group.slot}
              </th>
              {group.dishes.map((title, i) => (
                <td key={`${group.slot}-dish-${i}`} className="px-2 py-2">
                  {title
                    ? (
                      // TRONQUÉ À DEUX LIGNES. Sans ça, la grille devient aussi
                      // haute que la liste qu'elle résume et ne résume plus
                      // rien. Le titre entier reste au survol, ET il est de
                      // toute façon rendu en entier par la carte du plat, plus
                      // haut sur la MÊME page: rien ne se perd.
                      //
                      // ⚠️ PAS DE `block` À CÔTÉ DE `line-clamp-2`, ET C'EST
                      // MESURÉ, PAS UN GOÛT. `line-clamp` n'agit que sur un
                      // `display: -webkit-box`; la classe `block` gagne dans la
                      // feuille et rend la troncature INERTE. Relevé le
                      // 2026-08-14 au navigateur, à 320 px:
                      // `getComputedStyle` = `display: block`,
                      // `-webkit-line-clamp: 2`, hauteur 77 px pour quatre
                      // lignes rendues. La paire `line-clamp-2 block` est donc
                      // une troncature qui ne tronque pas — elle vit aussi dans
                      // `PlanGrid.tsx`, où elle a le même effet: aucun.
                      <span className="line-clamp-2 leading-snug text-ink" title={title}>
                        {title}
                      </span>
                    )
                    : null}
                </td>
              ))}
            </tr>
            {group.people.map((person) => (
              <PersonLine key={`${group.slot}-${person.memberId}`} person={person} slot={group.slot} />
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** LA LIGNE D'UNE BOUCHE — un prénom, et ce qu'elle prend chaque jour. */
function PersonLine(props: { person: PersonRow; slot: string }) {
  return (
    <tr className="border-t border-line align-top">
      <th
        scope="row"
        // ⚠️ `font-normal` ET `ink-soft`: le sujet de la ligne est la PART, pas
        // le prénom. Un prénom en gras sur chaque ligne ferait lire un annuaire.
        // `break-words` n'est pas décoratif — un prénom long déborde la colonne
        // collante et emporte la page à 320 px.
        className="sticky left-0 z-10 bg-paper py-1.5 pl-3 pr-3 text-left font-normal text-ink-soft break-words"
      >
        {props.person.displayName}
      </th>
      {props.person.cells.map((cell, i) => (
        <td key={`${props.slot}-${props.person.memberId}-${i}`} className="px-2 py-1.5">
          {/* ⚠️ LA PART N'EST JAMAIS TRONQUÉE, ET C'EST L'INVERSE DU TITRE
              JUSTE AU-DESSUS. Un titre coupé se retrouve en entier sur la carte
              du plat, plus haut sur la même page; une instruction de service
              coupée ne se retrouve NULLE PART. Et le repli habituel — « le
              texte entier est au survol » — n'existe pas sur un téléphone, qui
              est précisément l'écran où la coupe mordrait: « 1 portion of
              chicken with plenty of roasted vegetables » tient sur quatre
              lignes à 320 px. La ligne est le contenu de cette vue: elle se lit
              entière ou la vue ne sert à rien. */}
          {/* ══════════════════════════════════════════════════════════════
              LOT C — SON PLAT À ELLE, QUAND LE PLAN LUI EN A COMPOSÉ UN.

              ⛔ AVANT CE LOT, LE PLAT DÉDIÉ ÉTAIT INVISIBLE ICI ET VISIBLE
              PARTOUT AILLEURS. Il n'était attribuable à personne (`dishes[]`
              ne portait aucun `member_id`), donc il apparaissait dans la
              semaine de tout le monde, et la ligne « le plat » pouvait
              afficher le plat d'une seule personne à toute la table.

              Il est mis EN AVANT de la part: quand quelqu'un mange autre chose
              que la table, c'est le premier fait de sa case — la part vient
              préciser, elle ne remplace pas.

              ⚠️ UN TITRE, ET RIEN D'AUTRE. La règle des gardes d'affichage de
              cette vue ne bouge pas: ni objectif, ni « pourquoi », ni
              ingrédient. Un titre de plat est déjà lisible par tout le foyer.
              ══════════════════════════════════════════════════════════════ */}
          {cell.ownDish
            ? (
              <span className="block font-medium leading-snug text-ink">
                {cell.ownDish}
              </span>
            )
            : null}
          {/* ⚠️ LA PART N'EST JAMAIS TRONQUÉE — voir le bloc au-dessus. */}
          {cell.note
            ? <span className="block leading-snug text-ink">{cell.note}</span>
            : null}
        </td>
      ))}
    </tr>
  );
}

/**
 * UNE PERSONNE — SA SEMAINE SEULE.
 *
 * ── POUR QUI ELLE EXISTE ──────────────────────────────────────────────────
 * Un titulaire lit sa part dans `MyShareCard`, sur son propre écran. Une
 * bouche SANS COMPTE n'a aucun écran du tout — `loadMealPlans` est scopé sur
 * un `user_id` qu'elle n'a pas. Cette vue-ci est la sienne, lue par le maître
 * à sa place: la vue existe, l'accès non.
 *
 * ⚠️ ELLE OUVRE PAR L'INSTRUCTION GÉNÉRALE, et la vue parallèle la tait.
 * Ce n'est pas une incohérence: la même phrase répétée dans vingt-six cases
 * cesse d'être lue, alors qu'en tête d'UNE semaine elle est la première chose
 * à savoir — c'est la phrase qu'on dit à voix haute en servant.
 */
function OnePerson(
  props: {
    person: MemberPortionView | undefined;
    people: readonly MemberPortionView[];
    onPick: (memberId: string) => void;
    days: readonly string[];
    dishes: readonly HouseholdDishView[];
  },
) {
  const person = props.person;
  if (!person) return null;
  const week = buildPersonWeek({ days: props.days, dishes: props.dishes, person });

  return (
    <div className="mt-3">
      <label htmlFor="plan-by-person-who" className="block text-sm font-medium text-ink">
        {t("plan.person.pick")}
      </label>
      {/* `inputClass` DU KIT, ET PAS UNE CLASSE RECOPIÉE: il porte
          `text-base lg:text-sm` (sans quoi Safari iOS zoome à l'ouverture du
          menu et ne dézoome pas) et `min-w-0` (sans quoi un enfant flex déborde
          la page à 320 px). */}
      <select
        id="plan-by-person-who"
        className={`${inputClass} mt-1`}
        value={person.memberId}
        onChange={(e) => props.onPick(e.target.value)}
      >
        {props.people.map((p) => (
          // LE LIBELLÉ EST UN PRÉNOM, ET RIEN D'AUTRE. Pas d'objectif à côté,
          // pas de badge « au régime », pas de « n'a pas de compte »: la liste
          // se lit à table, et nommer une absence que la personne ne peut pas
          // combler est un reproche déguisé.
          <option key={p.memberId} value={p.memberId}>{p.displayName}</option>
        ))}
      </select>

      {/* SA PART, EN TÊTE. `plan.person.standard` quand il n'y a pas
          d'instruction: une part standard EST une réponse. */}
      <p className="mt-3 text-sm leading-6 text-ink break-words">
        {person.portionNote ?? t("plan.person.standard")}
      </p>

      {/* LOT 1 — le rendu par jour est EXTRAIT (`DishListByDay`): la même
          liste sert « ce que la maison cuisine » et « ta part », et trois
          copies divergeraient. `buildPersonWeek` reste la seule découpe de
          CETTE vue — le filtrage par personne lui appartient. */}
      <div className="mt-3">
        {/* ⛔ AUCUNE CASE, ET C'EST L'INTERDIT DE FF-058 R11 (A8.1). Cette
            vue est celle du MAÎTRE qui parcourt la semaine de CHAQUE bouche.
            Une case y serait le maître déclarant la consommation d'un profil
            réclamé à sa place — or la consommation est un fait de PERSONNE.
            La garde est double et le dit deux fois: `buildPersonWeek` n'émet
            aucune position (`dishIndex: null`), et ce montage passe `null`. */}
        <DishListByDay groups={week} bindTick={null} />
      </div>
    </div>
  );
}
