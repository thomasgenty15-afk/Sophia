import React from "react";

import type { AwayDay } from "../api/mealGeneration";
import {
  type EatingOccasion,
  type EatingOccasionSlot,
} from "../api/mealGeneration";
import { dishDayLabel, mealCopy } from "../api/mealLabels";
import { plural } from "../i18n/plural";
import {
  type AwayMark,
  awayKindOf,
  mergeAwayMarks,
  type PresenceState,
  presenceStateOf,
} from "../lib/presenceMarks";
import { Button } from "./ui/Button";
import Modal from "./ui/Modal";

// QUELS REPAS, QUELS JOURS — la grille qui remplace « choisir des jours ».
//
// ── CE QU'ELLE CORRIGE ─────────────────────────────────────────────────────
// La fenêtre se choisissait en jours entiers: on prenait « du 8 au 14 » et le
// moteur remplissait TOUS les moments de TOUS ces jours. Un élève qui déjeune à
// la cantine le mardi recevait donc un déjeuner de mardi — et surtout, il
// l'ACHETAIT: la ligne partait dans la liste de courses comme les autres.
//
// Il n'existait aucun endroit pour dire « ce moment-là, non ». Ni case, ni
// champ: la seule issue était la prose libre, que rien ne lisait.
//
// ── LES LIGNES VIENNENT DU RYTHME, PAS D'UNE LISTE FIXE ────────────────────
// Trois repas déclarés font trois lignes; ajouter la collation de 17h en fait
// quatre. Une grille à six lignes fixes demanderait à chacun de décocher les
// moments qu'il ne prend jamais — c'est-à-dire de redire ici ce qu'il a déjà
// dit dans « How your day runs », et de le redire à chaque génération.
//
// ── TOUT EST COCHÉ, ET DÉCOCHER EST LE GESTE ───────────────────────────────
// Le cas courant est « je mange tout ce que j'ai déclaré ». Partir de zéro
// obligerait à cocher vingt-huit cases pour une semaine ordinaire.
//
// ── CE QUI EST DÉCOCHÉ SE SOUVIENT ─────────────────────────────────────────
// Écrit dans `practical_constraints.away_days`, la clé que FF-002 avait posée
// pour l'absence récurrente. Pas une seconde clé pour la même chose: deux
// mécanismes divergeraient, et c'est celui qu'on regarde le moins qui garderait
// l'ancien état.
//
// PAR JOUR DE SEMAINE, ET C'EST SANS AMBIGUÏTÉ ICI. Une fenêtre fait AU PLUS
// sept jours (`MAX_WINDOW_DAYS`, et la base l'impose), donc chaque jour de
// semaine y apparaît au plus une fois: « ce mardi » et « les mardis » sont la
// même colonne. Recocher est ce qui oublie — la grille est l'interface de sa
// propre mémoire.

// ── LE TROISIÈME ÉTAT (L3, 2026-08-18) ─────────────────────────────────────
// Une case n'a plus deux états mais trois: à table, dehors, absent. Les deux
// derniers retirent la part; ce qui les sépare est que « dehors » garde le
// droit à un conseil chiffré au midi et « absent » non.
//
// ⚠️ LA GRILLE EST L'AUTORITÉ, ET C'EST LA RÈGLE DU LOT (§2.2 bis). La réponse
// hebdomadaire (« la semaine, tu manges au bureau ? ») PRÉ-REMPLIT ces cases;
// elle ne les décide pas. Ce qu'on coche ici gagne toujours — sinon on aurait
// fait le geste et il n'aurait rien changé.
//
// ⚠️ IL S'ALLUME PAR `onSaveMarks`, ET LE DEUX-ÉTATS RESTE LE DÉFAUT. Trois
// écrans montent cette grille aujourd'hui et n'ont pas tous à connaître le
// troisième état: sans `onSaveMarks` la grille rend EXACTEMENT la case à cocher
// d'hier, et écrit par `onSave`. C'est ce qui rend ce lot additif.

export interface MealPickerGridProps {
  open: boolean;
  onClose: () => void;
  /** Les jours de la fenêtre, dans l'ordre, en jetons (`mon`…`sun`). */
  days: readonly string[];
  /** Les dates correspondantes, même longueur et même ordre. */
  dates: readonly string[];
  /** Les moments d'une journée normale — les lignes de la grille. */
  rhythm: readonly EatingOccasionSlot[];
  /**
   * Ce qui est déjà écarté, toutes semaines confondues.
   *
   * ⚠️ LES ENTRÉES PEUVENT PORTER `kind` (ce sont alors des `AwayMark`), et le
   * type ne bouge pas: une marque EST une absence. Un appelant qui lit la
   * colonne avec `parseAwayMarks` fait apparaître « dehors » sans changer une
   * signature; un appelant qui passe des absences nues voit l'écran d'hier.
   */
  away: readonly AwayDay[];
  /** Reçoit la liste COMPLÈTE à écrire, fusion comprise. */
  onSave: (next: AwayDay[]) => void | Promise<void>;
  /**
   * LA PORTE DU TROIS-ÉTATS. Fournie, elle remplace `onSave` et reçoit la
   * liste complète AVEC les jetons.
   *
   * Elle n'est pas un réglage d'affichage: c'est un écrivain. Une grille à
   * trois états dont l'écriture retomberait sur `onSave` perdrait le jeton au
   * premier enregistrement — la personne aurait coché « dehors » et relirait
   * « absent ».
   */
  onSaveMarks?: (next: AwayMark[]) => void | Promise<void>;
  busy: boolean;
}

/** `mealLabels` nomme déjà chaque créneau: pas de seconde table de libellés. */
function occasionLabel(slot: EatingOccasion): string {
  return mealCopy(`meals.slot.${slot}` as Parameters<typeof mealCopy>[0]);
}

export default function MealPickerGrid(props: MealPickerGridProps) {
  /**
   * L'ÉTAT DE CHAQUE CASE MONTRÉE, en `jour|créneau`.
   *
   * ⚠️ `at_table` N'A PAS D'ENTRÉE, et ce n'est pas une économie: c'est la même
   * convention qu'en base, où être à table est l'ABSENCE d'entrée dans
   * `away_days`. Une carte qui porterait les trois états aurait deux façons de
   * dire « il mange ici » — celle de l'écran et celle de la base — et c'est
   * celle qu'on regarde le moins qui garderait l'ancien état.
   */
  const [state, setState] = React.useState<Map<string, PresenceState>>(
    new Map(),
  );

  const key = (day: string, slot: string) => `${day}|${slot}`;

  /** Les absences reçues, relues AVEC leur sens. */
  const marks: AwayMark[] = React.useMemo(
    () =>
      props.away.map((a) => ({
        day: a.day,
        slots: a.slots,
        kind: awayKindOf(a),
      })),
    [props.away],
  );

  /**
   * L'ÉTAT PART DE CE QUI EST ENREGISTRÉ, et se resynchronise quand ça change.
   *
   * Même mécanique que `EatingRhythmCard`: l'initialiseur d'un `useState` ne
   * tourne qu'au montage, et cette grille est montée en permanence par la
   * fenêtre (`Modal` rend `null` sans démonter l'appelant). Sans resynchro,
   * rouvrir après une sauvegarde afficherait l'état d'avant.
   *
   * ⚠️ L'EMPREINTE PORTE LE JETON. Sans lui, passer un midi d'« absent » à
   * « dehors » laisserait l'empreinte identique — donc la grille rouverte
   * montrerait l'état d'avant, et l'écrirait au premier enregistrement.
   */
  const savedPrint = JSON.stringify(
    marks.map((a) => [a.day, a.slots.join(","), a.kind]),
  );
  const [syncedFrom, setSyncedFrom] = React.useState<string | null>(null);
  if (syncedFrom !== savedPrint) {
    setSyncedFrom(savedPrint);
    const next = new Map<string, PresenceState>();
    for (const day of props.days) {
      for (const r of props.rhythm) {
        // Journée entière: `presenceStateOf` la rend sur CHAQUE moment du
        // rythme, parce que la grille n'a pas de case « toute la journée » — et
        // en avoir une ferait deux façons de dire la même chose.
        const at = presenceStateOf(marks, day, r.slot);
        if (at !== "at_table") next.set(key(day, r.slot), at);
      }
    }
    setState(next);
  }

  const setCell = (day: string, slot: string, at: PresenceState) =>
    setState((prev) => {
      const next = new Map(prev);
      const k = key(day, slot);
      if (at === "at_table") next.delete(k);
      else next.set(k, at);
      return next;
    });

  /**
   * LE GESTE DU DEUX-ÉTATS: la case bascule entre « à table » et « absent ».
   *
   * ⚠️ ELLE NE PASSE JAMAIS PAR « DEHORS ». Un écran qui ne connaît pas le
   * troisième état ne doit pas pouvoir l'écrire par accident — mais une case
   * qui ARRIVE « dehors » et qu'on ne touche pas le reste (voir `save`).
   */
  const toggle = (day: string, slot: string) => {
    const at = state.get(key(day, slot));
    setCell(day, slot, at === undefined ? "away" : "at_table");
  };

  function save() {
    const next = mergeAwayMarks({
      days: props.days,
      rhythm: props.rhythm,
      existing: marks,
      cells: state,
    });
    // `onSave` REÇOIT AUSSI LES JETONS — mais SEULEMENT CEUX QU'ON LUI A
    // DONNÉS, et c'est là que la garde s'arrête.
    //
    // ⛔ MESURÉ AU NAVIGATEUR LE 2026-08-18 (L3-B), ET CE N'EST PAS THÉORIQUE.
    // Les trois écrans qui montent cette grille lisent la colonne avec
    // `parseAwayDays` (`api/household.ts:awayFrom` pour `/app/household` et
    // `MealBuilder`, `StudentWeekPlanPage` pour la lane élève) — et
    // `parseAwayDays` NE GARDE QUE `day` ET `slots`. Le jeton n'arrive donc
    // jamais jusqu'ici: `marks` est tout entier `away`, et `mergeAwayMarks`
    // réécrit `kind: "away"` PAR-DESSUS. Cinq midis « dehors » posés par la
    // réponse hebdomadaire ont été effacés en OUVRANT puis ENREGISTRANT la
    // grille du foyer, SANS toucher une seule case, pendant que
    // `work_lunch` continuait de dire `outside`.
    //
    // ⚠️ CE N'EST PAS UNE RÉGRESSION AUJOURD'HUI, parce que rien n'écrit encore
    // de « dehors »: aucun écran n'appelle `setMemberWorkLunch`, ni ne passe
    // `onSaveMarks`. ÇA LE DEVIENT AU MOMENT PRÉCIS OÙ L6 BRANCHE LE
    // FORMULAIRE. La réparation est chez l'APPELANT, pas ici — il n'y a rien à
    // préserver dans un tableau dont le jeton a déjà été retiré: il faut lui
    // donner `parseAwayMarks(raw, "household")` au lieu de `awayFrom(raw,
    // "household")`, sur LES TROIS points de montage à la fois.
    void (props.onSaveMarks ? props.onSaveMarks(next) : props.onSave(next));
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={mealCopy("meals.picker.title")}
      size="lg"
    >
      <MealPickerGridBody
        days={props.days}
        dates={props.dates}
        rhythm={props.rhythm}
        state={state}
        threeState={Boolean(props.onSaveMarks)}
        setCell={setCell}
        toggle={toggle}
        save={save}
        onClose={props.onClose}
        busy={props.busy}
      />
    </Modal>
  );
}

/**
 * LA GRILLE ELLE-MÊME, SANS SA FENÊTRE — et l'état est resté DEHORS.
 *
 * ⚠️ LA SÉPARATION N'EST PAS COSMÉTIQUE, ET LE SENS COMPTE. `Modal` rend
 * `null` quand elle est fermée: tout ce qui vit SOUS elle est démonté, donc un
 * état posé ici disparaîtrait à chaque fermeture — et une grille modifiée ne
 * survivrait pas à un clic à côté. L'état reste donc dans le composant du
 * dessus, qui reste monté; ce corps-ci ne fait que rendre ce qu'on lui donne.
 *
 * ⚠️ ET IL EST EXPORTÉ POUR ÊTRE MESURÉ. `Modal` passe par `createPortal` vers
 * `document.body`; ce dépôt n'a ni jsdom ni testing-library, donc un test qui
 * monterait la fenêtre entière tomberait sur « document is not defined » — et
 * la seule issue serait de ne pas tester le rendu du tout, c'est-à-dire de
 * retomber sur des tests de source verts sur du code mort.
 */
export function MealPickerGridBody(props: {
  days: readonly string[];
  dates: readonly string[];
  rhythm: readonly EatingOccasionSlot[];
  /** L'état de chaque case montrée. Une case absente est « à table ». */
  state: ReadonlyMap<string, PresenceState>;
  /** Trois choix nommés au lieu d'une case à cocher. */
  threeState: boolean;
  setCell: (day: string, slot: string, at: PresenceState) => void;
  toggle: (day: string, slot: string) => void;
  save: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const key = (day: string, slot: string) => `${day}|${slot}`;
  const rows = props.rhythm;
  const threeState = props.threeState;
  const state = props.state;
  const setCell = props.setCell;
  const toggle = props.toggle;
  const save = props.save;
  const offCount = state.size;
  const outCount = [...state.values()].filter((s) => s === "eating_out").length;

  return (
    <>
      <p className="mb-3 text-sm text-ink-soft">
        {mealCopy("meals.picker.subtitle")}
      </p>

      {rows.length === 0
        ? (
          <p className="text-sm text-ink-soft">
            {mealCopy("meals.picker.no_rhythm")}
          </p>
        )
        : (
          <>
            {/* La grille défile DANS son conteneur: sept colonnes de cases ne
                tiennent pas à 320 px, et laisser la page partir de travers
                emporterait tout l'écran. */}
            <div className="overflow-x-auto">
              {/* ⚠️ LA LARGEUR MINIMALE DÉPEND DU CONTRÔLE, ET C'EST MESURÉ.
                  `26rem` a été posé pour des CASES À COCHER — une colonne y
                  fait ~49 px, ce qui suffit à une coche et à rien d'autre. Le
                  choix à trois états y rentre le libellé le plus long
                  (« Eating here », 64 px de texte plus la flèche) dans 49 px:
                  mesuré à 320 px le 2026-08-18, « Eating here » et « Eating
                  out » se rendent tous les deux « Eating », c'est-à-dire
                  IDENTIQUES — exactement les deux états que ce lot existe pour
                  séparer. Le conteneur défile déjà (`overflow-x-auto`), donc
                  élargir ne fait pas partir la page: `document.scrollWidth`
                  reste à 320. */}
              <table
                className={`w-full border-collapse text-sm ${
                  threeState ? "min-w-[52rem]" : "min-w-[26rem]"
                }`}
              >
                <thead>
                  <tr>
                    <th
                      scope="col"
                      // ⚠️ `bg-paper` ET PAS `bg-paper-2`: cette colonne est
                      // COLLÉE, donc son fond doit être celui de la fenêtre
                      // pour que les cases passent DESSOUS sans se voir. Le
                      // `gray-50` d'avant était déjà un aplat visible sur du
                      // blanc — le défaut se lisait au premier défilement.
                      className="sticky left-0 z-10 bg-paper py-2 pr-3 text-left text-xs font-medium text-ink-soft"
                    >
                      {mealCopy("meals.picker.meal")}
                    </th>
                    {props.days.map((day, i) => (
                      <th
                        key={`${day}-${i}`}
                        scope="col"
                        className="px-1 py-2 text-center text-xs font-medium text-ink-soft"
                      >
                        {/* Le jour, puis la date. Sur une fenêtre qui traverse
                            deux mois, « Sat » seul ne dit pas lequel. */}
                        <span className="block">
                          {(dishDayLabel(day) ?? day).slice(0, 3)}
                        </span>
                        {/* La date était en `gray-400` — 2,84:1, sous le seuil
                            du texte. Elle passe à `ink-soft` (6,11:1) et se
                            distingue du jour par la GRAISSE, pas par un gris de
                            plus. */}
                        <span className="block font-normal text-ink-soft">
                          {props.dates[i]?.slice(8) ?? ""}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.slot} className="border-t border-line">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 whitespace-nowrap bg-paper py-2 pr-3 text-left font-normal text-ink"
                      >
                        {occasionLabel(row.slot)}
                      </th>
                      {props.days.map((day, i) => {
                        const at = state.get(key(day, row.slot)) ?? "at_table";
                        const label = `${occasionLabel(row.slot)} — ${
                          dishDayLabel(day) ?? day
                        }`;
                        return (
                          <td key={`${day}-${i}`} className="px-1 py-2 text-center">
                            {threeState
                              ? (
                                // TROIS ÉTATS, TROIS CHOIX NOMMÉS. Une case à
                                // cocher ne sait dire que oui ou non; un cycle
                                // sur trois positions oblige à cliquer deux fois
                                // pour revenir, sans jamais dire où l'on va. Un
                                // choix explicite se lit, s'annonce au lecteur
                                // d'écran, et tient dans une colonne étroite.
                                <select
                                  className="w-full min-w-0 rounded-input border border-line bg-paper px-1 py-1 text-xs text-ink"
                                  value={at}
                                  onChange={(e) =>
                                    setCell(
                                      day,
                                      row.slot,
                                      e.target.value as PresenceState,
                                    )}
                                  aria-label={label}
                                >
                                  <option value="at_table">
                                    {mealCopy("meals.picker.state_at_table")}
                                  </option>
                                  <option value="eating_out">
                                    {mealCopy("meals.picker.state_eating_out")}
                                  </option>
                                  <option value="away">
                                    {mealCopy("meals.picker.state_away")}
                                  </option>
                                </select>
                              )
                              : (
                                <input
                                  type="checkbox"
                                  // `accent-*` COMPTE COMME UNE COULEUR, et
                                  // celle-ci était `gray-900`. Une case à cocher
                                  // est un CONTRÔLE: la teinte de marque y est
                                  // chez elle (charte §2 — la figue marque
                                  // l'action), et elle n'entre pas dans une
                                  // pastille pour autant.
                                  className="h-4 w-4 accent-fig-700"
                                  checked={at === "at_table"}
                                  onChange={() => toggle(day, row.slot)}
                                  aria-label={label}
                                />
                              )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* CE QUE ÇA VEUT DIRE, dit une fois et sous la grille — pas au
                survol de chaque case. Décocher n'est pas « je gère moi-même »:
                le moment sort complètement de la composition. */}
            <p className="mt-3 text-xs leading-5 text-ink-soft">
              {offCount === 0
                ? mealCopy("meals.picker.all_on")
                : plural(
                  offCount,
                  mealCopy("meals.picker.some_off_one", { n: offCount }),
                  mealCopy("meals.picker.some_off_many", { n: offCount }),
                )}
            </p>

            {/* CE QUE « DEHORS » VEUT DIRE, dit SÉPARÉMENT du décompte des
                absences — parce que ce n'est pas la même chose. Le repas sort
                du plan, il ne sort pas de la journée: c'est le seul état où le
                produit gardera le droit de dire un ordre de grandeur. Sans
                cette phrase, les deux états se lisent comme un seul avec deux
                mots, et personne ne sait lequel choisir. */}
            {threeState && outCount > 0 && (
              <p className="mt-1 text-xs leading-5 text-ink-soft">
                {plural(
                  outCount,
                  mealCopy("meals.picker.some_out_one", { n: outCount }),
                  mealCopy("meals.picker.some_out_many", { n: outCount }),
                )}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={save} disabled={props.busy}>
                {props.busy
                  ? mealCopy("meals.picker.saving")
                  : mealCopy("meals.picker.save")}
              </Button>
              {/* ANNULER EST LE GESTE QU'ON PEUT IGNORER, et le kit a une
                  variante pour ça (`ghost`). Ce bouton se maintenait à la main
                  en `gray-500` souligné — une sixième façon de dessiner un
                  bouton dans un produit qui en a déjà cinq nommées. */}
              <Button variant="ghost" size="sm" onClick={props.onClose}>
                {mealCopy("meals.picker.cancel")}
              </Button>
            </div>
          </>
        )}
    </>
  );
}
