import React from "react";

import {
  type EatingOccasion,
  type EatingOccasionSlot,
} from "../api/mealGeneration";
import { dishDayLabel, mealCopy } from "../api/mealLabels";
import { plural } from "../i18n/plural";
import {
  type AwayMark,
  mergeAwayMarks,
  type PresenceState,
  presenceStateOf,
} from "../lib/presenceMarks";
import {
  type GridCell,
  lineStateOf,
  lineToggleTarget,
} from "../lib/presenceAbsence";
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

// ── DEUX ÉTATS: À TABLE OU ABSENT ──────────────────────────────────────────
// ⟳ 2026-09-24 — le troisième état « dehors » (sélecteur à trois choix, allumé
// par `onSaveMarks`) est retiré: aucun écran ne le montait. Une case est cochée
// (à table) ou décochée (absent).

export interface MealPickerGridProps {
  open: boolean;
  onClose: () => void;
  /** Les jours de la fenêtre, dans l'ordre, en jetons (`mon`…`sun`). */
  days: readonly string[];
  /** Les dates correspondantes, même longueur et même ordre. */
  dates: readonly string[];
  /** Les moments d'une journée normale — les lignes de la grille. */
  rhythm: readonly EatingOccasionSlot[];
  /** Ce qui est déjà écarté, toutes semaines confondues (`parseAwayMarks`). */
  away: readonly AwayMark[];
  /** Reçoit la liste COMPLÈTE à écrire, jours hors fenêtre compris. */
  onSave: (next: AwayMark[]) => void | Promise<void>;
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
   * `away_days`. Une carte qui porterait aussi « à table » aurait deux façons de
   * dire « il mange ici » — celle de l'écran et celle de la base — et c'est
   * celle qu'on regarde le moins qui garderait l'ancien état.
   */
  const [state, setState] = React.useState<Map<string, PresenceState>>(
    new Map(),
  );

  const key = (day: string, slot: string) => `${day}|${slot}`;

  const marks = props.away;

  /**
   * L'ÉTAT PART DE CE QUI EST ENREGISTRÉ, et se resynchronise quand ça change.
   *
   * Même mécanique que `EatingRhythmCard`: l'initialiseur d'un `useState` ne
   * tourne qu'au montage, et cette grille est montée en permanence par la
   * fenêtre (`Modal` rend `null` sans démonter l'appelant). Sans resynchro,
   * rouvrir après une sauvegarde afficherait l'état d'avant.
   */
  const savedPrint = JSON.stringify(
    marks.map((a) => [a.day, a.slots.join(",")]),
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

  /** LE GESTE: la case bascule entre « à table » et « absent ». */
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
    void props.onSave(next);
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
  setCell: (day: string, slot: string, at: PresenceState) => void;
  toggle: (day: string, slot: string) => void;
  save: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const key = (day: string, slot: string) => `${day}|${slot}`;
  const rows = props.rhythm;
  const state = props.state;
  const setCell = props.setCell;
  const toggle = props.toggle;
  const save = props.save;
  const offCount = state.size;

  // ── TOUTE UNE LIGNE, TOUTE UNE COLONNE (2026-09-23) ───────────────────────
  // Demandé: « si je sais que tous les dîners de la semaine je ne vais pas être
  // présent, je décoche dîner et toute la ligne s'enlève » — et pareil pour un
  // jour entier. La case d'en-tête est cochée quand toute la ligne est à table,
  // à moitié quand elle est mêlée. Cliquer retire toute la ligne tant qu'un de
  // ses repas est encore à table; une ligne entièrement retirée revient.
  const lineState = (cells: readonly GridCell[]) => lineStateOf(state, cells);
  const toggleLine = (cells: readonly GridCell[]) => {
    const next = lineToggleTarget(state, cells);
    for (const [d, s] of cells) setCell(d, s, next);
  };
  const rowCells = (slot: string) => props.days.map((d): GridCell => [d, slot]);
  const columnCells = (day: string) => rows.map((r): GridCell => [day, r.slot]);

  return (
    <>
      <p className="mb-3 text-sm text-ink-soft">
        {mealCopy("meals.picker.subtitle")}
      </p>
      {rows.length > 0 && (
        <p className="-mt-1 mb-3 text-xs text-ink-soft">
          {mealCopy("meals.picker.bulk_hint")}
        </p>
      )}

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
              {/* `26rem`: une colonne de CASES À COCHER y fait ~49 px. */}
              <table className="w-full border-collapse text-sm min-w-[26rem]">
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
                    {props.days.map((day, i) => {
                      const line = lineState(columnCells(day));
                      return (
                        <th
                          key={`${day}-${i}`}
                          scope="col"
                          className="px-1 py-2 text-center text-xs font-medium text-ink-soft"
                        >
                          {/* Le jour, puis la date. Sur une fenêtre qui traverse
                              deux mois, « Sat » seul ne dit pas lequel. */}
                          <label className="flex cursor-pointer flex-col items-center gap-1">
                            {/* La case de colonne AU-DESSUS du jour: elle
                                coiffe la colonne qu'elle retire. */}
                            <LineCheckbox
                                state={line}
                                onToggle={() => toggleLine(columnCells(day))}
                                label={mealCopy("meals.picker.column_all", {
                                  day: dishDayLabel(day) ?? day,
                                })}
                              />
                            <span className="block">
                              {(dishDayLabel(day) ?? day).slice(0, 3)}
                            </span>
                            {/* La date était en `gray-400` — 2,84:1, sous le
                                seuil du texte. Elle passe à `ink-soft` (6,11:1)
                                et se distingue du jour par la GRAISSE, pas par
                                un gris de plus. */}
                            <span className="block font-normal text-ink-soft">
                              {props.dates[i]?.slice(8) ?? ""}
                            </span>
                          </label>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.slot} className="border-t border-line">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 whitespace-nowrap bg-paper py-2 pr-3 text-left font-normal text-ink"
                      >
                        <label className="flex cursor-pointer items-center gap-2">
                          <LineCheckbox
                            state={lineState(rowCells(row.slot))}
                            onToggle={() => toggleLine(rowCells(row.slot))}
                            label={mealCopy("meals.picker.row_all", {
                              meal: occasionLabel(row.slot),
                            })}
                          />
                          {occasionLabel(row.slot)}
                        </label>
                      </th>
                      {props.days.map((day, i) => {
                        const at = state.get(key(day, row.slot)) ?? "at_table";
                        const label = `${occasionLabel(row.slot)} — ${
                          dishDayLabel(day) ?? day
                        }`;
                        return (
                          <td key={`${day}-${i}`} className="px-1 py-2 text-center">
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

/**
 * LA CASE D'EN-TÊTE — cochée quand toute la ligne est à table, à moitié quand
 * elle est mêlée. `indeterminate` n'existe qu'en propriété DOM, pas en
 * attribut: il se pose par la référence.
 */
function LineCheckbox(props: {
  state: "all" | "none" | "mixed";
  onToggle: () => void;
  label: string;
}) {
  const mixed = props.state === "mixed";
  return (
    <input
      type="checkbox"
      className="h-4 w-4 accent-fig-700"
      checked={props.state === "all"}
      ref={(el) => {
        if (el) el.indeterminate = mixed;
      }}
      aria-checked={mixed ? "mixed" : props.state === "all"}
      data-line=""
      onChange={props.onToggle}
      aria-label={props.label}
    />
  );
}
