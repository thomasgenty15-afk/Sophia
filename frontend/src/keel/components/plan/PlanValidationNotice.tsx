import { type MessageKey, t } from "../../i18n/t";
import { formatDateLong } from "../../i18n/format";
import {
  type PlanValidationView,
  visibleControls,
  visibleDefects,
} from "../../api/planValidation";
import { type MemberPortionView } from "../../api/mealGeneration";

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · ÉTAPE C5 — CE QU'UN PLAN LIVRÉ NE TIENT PAS, À L'ÉCRAN
// ══════════════════════════════════════════════════════════════════════════
//
// Autorité : `docs/keel/PLAN-CLOTURE-APRES-SIX-TIRS-2026-09-11.md`, § C5 ④ ⑤.
//
// ── ⛔ CE QU'IL NE FAIT JAMAIS, ET CHAQUE LIGNE EST UNE RÈGLE DU PLAN ──────
//
//   · IL NE DIT JAMAIS « CONFORME ». Un plan sans écart ne rend RIEN — pas de
//     pastille verte, pas de « tous les contrôles sont passés ». Deux raisons,
//     et les deux sont écrites : « version conforme sans faux avertissement »,
//     et surtout « une sortie incomplète ne peut pas être présentée comme
//     complète » — or `conforme` n'exige pas que tous les dénominateurs aient
//     tourné. Une pastille verte serait exactement cette affirmation-là.
//   · IL N'AFFICHE AUCUN NOMBRE DU SERVEUR. Ni kcal, ni grammes, ni
//     pourcentage. Le producteur ne persiste même pas les `detail` qui en
//     portent — voir `plan_validation.ts`. Le seul nombre rendu ici est un
//     COMPTE de contrôles incomplets, qui n'est l'énergie de personne.
//   · IL SE TAIT SUR L'ÉNERGIE QUAND LA PORTE EST FERMÉE. `showEnergy` est
//     `useMealEnergy().showing`, faux notamment quand un plancher TCA, l'âge ou
//     le coach protègent la personne du sujet. `visibleDefects` retire alors
//     les cinq causes de la famille calorique — et si c'était tout ce qu'il y
//     avait à dire, le bloc entier disparaît.
//
// ── ⚠️ IL NE DÉCIDE PAS DU DROIT DE VOIR, IL LE REÇOIT ────────────────────
// Même discipline que `EnergyReadout` : la règle vit chez l'appelant
// (`MealBuilder`, qui monte déjà `useMealEnergy`), le composant rend.

/** Le jour tel que la personne le lit. `null` quand il n'y a rien à dire. */
function dayText(day: string | null): string | null {
  if (day === null) return null;
  // ⛔ DEUX FORMES ARRIVENT ICI, ET C'EST LA GARDE ELLE-MÊME. Les causes de
  // CASE portent le jeton du plan (`sun`), celles de JOURNÉE une date ISO
  // (`2026-09-13`) — voir `final_plan_gate.ts`, où la date est entrée dans
  // l'identité du refus à l'étape C4. Traiter les deux pareil rendrait
  // « 2026-09-13, dîner » ou un jeton brut.
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return formatDateLong(day);
  // ⚠️ UNE TABLE ÉCRITE, PAS UN GABARIT `day.long.${token}`. Un gabarit oblige
  // à un `as never` sur `MessageKey`, c'est-à-dire à ÉTEINDRE la vérification
  // — et ce dépôt a déjà mesuré ce que coûte un `as` sur un type étranger
  // (« 200 en log, null en silence »). Ici le compilateur recense les sept.
  const DAYS: Record<string, MessageKey> = {
    mon: "day.long.mon",
    tue: "day.long.tue",
    wed: "day.long.wed",
    thu: "day.long.thu",
    fri: "day.long.fri",
    sat: "day.long.sat",
    sun: "day.long.sun",
  };
  const key = DAYS[day.trim().toLowerCase()];
  // ⚠️ R7 : un jeton hors vocabulaire sort TEL QUEL. Il se voit, il se
  // rapporte — au lieu de disparaître sous une phrase passe-partout.
  return key === undefined ? day : t(key);
}

/**
 * LE MOMENT TEL QUE LA PERSONNE LE LIT.
 *
 * ⚠️ UNE TABLE ÉCRITE, PAS `api/labels.ts::slotLabel`. Ce module-là construit
 * ses clés dynamiquement (`labelIn(namespace, token)`) pour NEUF vocabulaires,
 * et l'importer traînait `when`, `amount`, `sentence` et `question` jusqu'à
 * `/app/setup` — quatre coutures au scanner, pour un seul libellé. Ici les six
 * moments du produit sont recensés par le compilateur.
 */
function slotText(slot: string): string {
  const SLOTS: Record<string, MessageKey> = {
    breakfast: "slot.breakfast",
    snack_am: "slot.snack_am",
    lunch: "slot.lunch",
    snack_pm: "slot.snack_pm",
    dinner: "slot.dinner",
    before_bed: "slot.before_bed",
  };
  const key = SLOTS[slot.trim().toLowerCase()];
  // ⚠️ R7 : un jeton hors vocabulaire sort TEL QUEL — il se voit et se rapporte.
  return key === undefined ? slot : t(key);
}

/**
 * LA LIGNE D'UN ÉCART : ce qui ne tient pas, où, et pour qui.
 *
 * ⚠️ LE NOM DE LA PERSONNE VIENT DE `member_portions` DU MÊME PLAN, jamais
 * d'une relecture du foyer : un plan composé la semaine dernière doit nommer
 * les bouches qu'il servait, pas celles d'aujourd'hui. Sans correspondance, on
 * ne nomme personne — un identifiant brut à l'écran n'aide personne.
 */
function defectLine(args: {
  cause: string;
  day: string | null;
  slot: string | null;
  memberId: string | null;
  term: string | null;
  names: ReadonlyMap<string, string>;
}): string {
  const key = validationCauseKey(args.cause);
  const head = key ? t(key) : args.cause;
  const parts: string[] = [head];
  const jour = dayText(args.day);
  if (jour !== null && args.slot !== null) {
    parts.push(t("plan.validation.at", { day: jour, slot: slotText(args.slot) }));
  } else if (jour !== null) {
    parts.push(jour);
  } else if (args.slot !== null) {
    parts.push(slotText(args.slot));
  }
  const name = args.memberId === null ? undefined : args.names.get(args.memberId);
  if (name) parts.push(t("plan.validation.for", { name }));
  if (args.term !== null) parts.push(t("plan.validation.term", { term: args.term }));
  return parts.join(" · ");
}


// ══════════════════════════════════════════════════════════════════════════
// LES TABLES DE CLÉS, ICI ET PAS DANS `api/planValidation.ts`
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ CONTRAINTE MESURÉE, PAS UN RANGEMENT. Le module d'API est importé par
// `api/mealGeneration.ts`, donc par `/`, `/join-household`, `/app/chat` et
// `/app/today`. Le scanner de coutures suit le graphe d'imports: y laisser une
// clé `plan.validation.*` faisait « atteindre » le namespace `plan` à quatre
// pages qui ne l'ont pas déclaré. Ce composant, lui, n'est importé que par les
// deux écrans qui l'affichent.

/**
 * LA CLÉ DE PHRASE D'UNE CAUSE. `null` = cause inconnue de cet écran (R7).
 *
 * ⛔ LES VINGT-NEUF CAUSES DU SERVEUR SONT RECENSÉES, et elles se groupent par
 * ce que la PERSONNE doit comprendre — pas par le module qui les produit. Une
 * référence pendante et un identifiant de session inconnu sont le même fait à
 * l'écran (« une ligne du plan pointe dans le vide ») ; les distinguer
 * afficherait notre plomberie.
 *
 * ⛔ `null` PLUTÔT QU'UNE PHRASE PASSE-PARTOUT, comme `edgeRefusalKey` : une
 * cause ajoutée côté serveur et oubliée ici sort telle quelle, donc se voit et
 * se rapporte — au lieu de disparaître sous « une erreur est survenue ».
 */
const CAUSE_KEYS: Record<string, MessageKey> = {
  // ── une case sans ce qu'il faut pour manger ─────────────────────────────
  cell_without_dish: "plan.validation.cause.missing_meal",
  cell_without_portion: "plan.validation.cause.missing_meal",
  mouth_unfed: "plan.validation.cause.missing_meal",
  boxes_none_delivered: "plan.validation.cause.missing_meal",
  box_missing: "plan.validation.cause.missing_meal",
  // ── la cible d'énergie ──────────────────────────────────────────────────
  cell_energy_off: "plan.validation.cause.energy_off",
  day_energy_off: "plan.validation.cause.energy_off",
  mouth_energy_short: "plan.validation.cause.energy_off",
  // ⛔ LA PROTÉINE A SA PROPRE PHRASE, ET C'EST LE § C5 ⑤ : « une sortie
  // utilisable mais sous un plancher nutritionnel ne peut pas être présentée
  // comme ayant atteint l'objectif ». La fondre dans « la cible d'énergie »
  // ferait lire « à quelques calories près » un plan qui manque sa protéine.
  protein_floor_short: "plan.validation.cause.protein_short",
  cell_energy_unmeasurable: "plan.validation.cause.unmeasurable",
  // ── les courses ─────────────────────────────────────────────────────────
  ingredient_not_bought: "plan.validation.cause.shopping_missing",
  ingredient_short_bought: "plan.validation.cause.shopping_short",
  // ⟳ 2026-09-15 · BÊTA 2C — le manque dans l'AUTRE sens: on fait acheter une
  // nourriture qu'aucune recette du plan n'emploie. Sa propre phrase, parce que
  // « il en manque » et « on en achète pour rien » ne se réparent pas pareil.
  ingredient_bought_unused: "plan.validation.cause.shopping_unused",
  shopping_undated: "plan.validation.cause.shopping_undated",
  unclassified_perishable: "plan.validation.cause.shopping_undated",
  perishable_bought_too_early: "plan.validation.cause.shopping_too_early",
  // ── la fenêtre de cuisson ───────────────────────────────────────────────
  eaten_before_cooked: "plan.validation.cause.cooking_window",
  eaten_too_late: "plan.validation.cause.cooking_window",
  cook_day_unplaced: "plan.validation.cause.cooking_window",
  preparation_without_session: "plan.validation.cause.cooking_window",
  session_day_mismatch: "plan.validation.cause.cooking_window",
  // ── les références qui pointent dans le vide ────────────────────────────
  uses_dangling: "plan.validation.cause.dangling",
  box_item_dangling: "plan.validation.cause.dangling",
  session_cites_unknown: "plan.validation.cause.dangling",
  title_promises_missing_preparation: "plan.validation.cause.dangling",
  // ── les interdits ───────────────────────────────────────────────────────
  table_exclusion_served: "plan.validation.cause.forbidden",
  member_exclusion_served: "plan.validation.cause.forbidden",
  regime_forbidden_component: "plan.validation.cause.forbidden",
  house_rule_served: "plan.validation.cause.forbidden",
};

// ⟳ 2026-09-15 — NON EXPORTÉES, ET C'EST LA RÈGLE `react-refresh` QUI LE
// DEMANDE: un fichier qui exporte autre chose qu'un composant casse le
// rechargement à chaud. Les deux n'avaient AUCUN appelant hors de ce fichier —
// mesuré sur tout le dépôt — et l'`export` était donc une porte sans personne
// derrière. Les tables restent ICI pour la raison écrite au-dessus.
function validationCauseKey(cause: string): MessageKey | null {
  return CAUSE_KEYS[cause.trim()] ?? null;
}

/**
 * LES CONTRÔLES INCOMPLETS ET NON APPLICABLES, MIS EN MOTS.
 *
 * Vocabulaire fermé, produit par `finalGateDelivery` et `planValidationRecord`.
 * `null` pour un contrôle inconnu : il sort tel quel, comme une cause inconnue.
 */
const CONTROL_KEYS: Record<string, MessageKey> = {
  shopping_quantity: "plan.validation.control.shopping_quantity",
  cell_energy: "plan.validation.control.cell_energy",
  protein_floor: "plan.validation.control.protein_floor",
  mouth_energy: "plan.validation.control.mouth_energy",
  protein_floor_protected: "plan.validation.control.protein_floor_protected",
  shopping_not_purchasable: "plan.validation.control.shopping_not_purchasable",
};

function validationControlKey(control: string): MessageKey | null {
  return CONTROL_KEYS[control.trim()] ?? null;
}

export function PlanValidationNotice(props: {
  validation: PlanValidationView | null;
  /** Les parts du MÊME plan — la seule source des noms de bouches. */
  portions: readonly MemberPortionView[];
  /** `useMealEnergy().showing` : la porte d'affichage calorique de la personne. */
  showEnergy: boolean;
}) {
  const v = props.validation;
  // ⛔ `null` = LA GARDE N'A PAS TOURNÉ, OU LE PLAN EST PLUS VIEUX QUE CE LOT.
  // On se tait. Afficher « aucun écart » serait affirmer une mesure qui n'a pas
  // eu lieu.
  if (v === null) return null;
  const defects = visibleDefects(v.defects, props.showEnergy);
  const incomplete = visibleControls(v.incomplete, props.showEnergy);
  // ⛔ RIEN À DIRE ⇒ RIEN À L'ÉCRAN. C'est le cas `conforme`, et c'est aussi le
  // cas d'un plan dont les seuls écarts sont derrière une porte fermée.
  if (defects.length === 0 && incomplete.length === 0) return null;
  const names = new Map(props.portions.map((p) => [p.memberId, p.displayName]));

  return (
    <div
      data-testid="plan-validation"
      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-ink"
    >
      <p className="font-medium">{t("plan.validation.title")}</p>
      {defects.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-ink-soft">
          {defects.map((d, i) => (
            <li key={`${d.cause}-${d.day ?? ""}-${d.slot ?? ""}-${i}`}>
              {defectLine({
                cause: d.cause,
                day: d.day,
                slot: d.slot,
                memberId: d.memberId,
                term: d.term,
                names,
              })}
            </li>
          ))}
        </ul>
      )}
      {incomplete.length > 0 && (
        <>
          {/* ⛔ UNE SECTION À PART, ET JAMAIS ADDITIONNÉE AUX ÉCARTS. « On n'a
              pas pu vérifier » n'accuse pas le plan — les fondre ferait
              compter comme un défaut ce qui est un trou de la BASE (un
              garde-manger sans quantité, un conditionnement non convertible). */}
          <p className="mt-2 font-medium">{t("plan.validation.incomplete_title")}</p>
          <ul className="mt-1 list-disc pl-5 text-ink-soft">
            {incomplete.map((c) => {
              const key = validationControlKey(c.control);
              return (
                <li key={c.control}>
                  {t("plan.validation.control_line", {
                    control: key ? t(key) : c.control,
                    count: c.count,
                  })}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="mt-2 text-xs text-ink-soft">{t("plan.validation.intact")}</p>
    </div>
  );
}

export default PlanValidationNotice;
