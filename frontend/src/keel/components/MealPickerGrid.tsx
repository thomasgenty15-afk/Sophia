import React from "react";

import type { AwayDay } from "../api/mealGeneration";
import {
  type EatingOccasion,
  type EatingOccasionSlot,
} from "../api/mealGeneration";
import { dishDayLabel, mealCopy } from "../api/mealLabels";
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

export interface MealPickerGridProps {
  open: boolean;
  onClose: () => void;
  /** Les jours de la fenêtre, dans l'ordre, en jetons (`mon`…`sun`). */
  days: readonly string[];
  /** Les dates correspondantes, même longueur et même ordre. */
  dates: readonly string[];
  /** Les moments d'une journée normale — les lignes de la grille. */
  rhythm: readonly EatingOccasionSlot[];
  /** Ce qui est déjà écarté, toutes semaines confondues. */
  away: readonly AwayDay[];
  /** Reçoit la liste COMPLÈTE à écrire, fusion comprise. */
  onSave: (next: AwayDay[]) => void | Promise<void>;
  busy: boolean;
}

/** `mealLabels` nomme déjà chaque créneau: pas de seconde table de libellés. */
function occasionLabel(slot: EatingOccasion): string {
  return mealCopy(`meals.slot.${slot}` as Parameters<typeof mealCopy>[0]);
}

export default function MealPickerGrid(props: MealPickerGridProps) {
  /** Les cases DÉCOCHÉES, en `jour|créneau`. Le coché est l'absence d'entrée. */
  const [off, setOff] = React.useState<Set<string>>(new Set());

  const key = (day: string, slot: string) => `${day}|${slot}`;

  /**
   * L'ÉTAT PART DE CE QUI EST ENREGISTRÉ, et se resynchronise quand ça change.
   *
   * Même mécanique que `EatingRhythmCard`: l'initialiseur d'un `useState` ne
   * tourne qu'au montage, et cette grille est montée en permanence par la
   * fenêtre (`Modal` rend `null` sans démonter l'appelant). Sans resynchro,
   * rouvrir après une sauvegarde afficherait l'état d'avant.
   */
  const savedPrint = JSON.stringify(
    props.away.map((a) => [a.day, a.slots.join(",")]),
  );
  const [syncedFrom, setSyncedFrom] = React.useState<string | null>(null);
  if (syncedFrom !== savedPrint) {
    setSyncedFrom(savedPrint);
    const next = new Set<string>();
    for (const a of props.away) {
      // Journée entière: on coche l'absence sur CHAQUE moment du rythme, parce
      // que la grille n'a pas de case « toute la journée » — et en avoir une
      // ferait deux façons de dire la même chose.
      const slots = a.slots.length > 0 ? a.slots : props.rhythm.map((r) => r.slot);
      for (const s of slots) next.add(key(a.day, s));
    }
    setOff(next);
  }

  const toggle = (day: string, slot: string) =>
    setOff((prev) => {
      const next = new Set(prev);
      const k = key(day, slot);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  function save() {
    // ── LA FUSION, ET ELLE N'EST PAS UN DÉTAIL ──────────────────────────
    // La grille ne montre que les jours de CETTE fenêtre. Une fenêtre de trois
    // jours ne dit rien des quatre autres, et écraser `away_days` avec ce
    // qu'elle montre effacerait « mardi midi » parce qu'on a composé un
    // week-end. Les jours hors fenêtre sont donc repris tels quels.
    const inWindow = new Set(props.days);
    const kept = props.away.filter((a) => !inWindow.has(a.day));

    const fresh: AwayDay[] = [];
    for (const day of props.days) {
      const slots = props.rhythm
        .map((r) => r.slot)
        .filter((s) => off.has(key(day, s)));
      if (slots.length === 0) continue;
      // TOUS les moments du rythme décochés = la journée entière. On écrit la
      // forme courte: c'est celle que FF-002 a définie, et elle survit à un
      // changement de rythme — ajouter un petit-déjeuner plus tard ne doit pas
      // ressusciter un samedi où l'élève n'est jamais là.
      fresh.push({
        day,
        slots: slots.length === props.rhythm.length ? [] : slots,
      });
    }
    void props.onSave([...kept, ...fresh]);
  }

  const rows = props.rhythm;
  const offCount = off.size;

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={mealCopy("meals.picker.title")}
      size="lg"
    >
      <p className="mb-3 text-sm text-gray-600">
        {mealCopy("meals.picker.subtitle")}
      </p>

      {rows.length === 0
        ? (
          <p className="text-sm text-gray-600">
            {mealCopy("meals.picker.no_rhythm")}
          </p>
        )
        : (
          <>
            {/* La grille défile DANS son conteneur: sept colonnes de cases ne
                tiennent pas à 320 px, et laisser la page partir de travers
                emporterait tout l'écran. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[26rem] border-collapse text-sm">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 z-10 bg-gray-50 py-2 pr-3 text-left text-xs font-medium text-gray-500"
                    >
                      {mealCopy("meals.picker.meal")}
                    </th>
                    {props.days.map((day, i) => (
                      <th
                        key={`${day}-${i}`}
                        scope="col"
                        className="px-1 py-2 text-center text-xs font-medium text-gray-500"
                      >
                        {/* Le jour, puis la date. Sur une fenêtre qui traverse
                            deux mois, « Sat » seul ne dit pas lequel. */}
                        <span className="block">
                          {(dishDayLabel(day) ?? day).slice(0, 3)}
                        </span>
                        <span className="block font-normal text-gray-400">
                          {props.dates[i]?.slice(8) ?? ""}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.slot} className="border-t border-gray-100">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 whitespace-nowrap bg-gray-50 py-2 pr-3 text-left font-normal text-gray-900"
                      >
                        {occasionLabel(row.slot)}
                      </th>
                      {props.days.map((day, i) => {
                        const on = !off.has(key(day, row.slot));
                        return (
                          <td key={`${day}-${i}`} className="px-1 py-2 text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-gray-900"
                              checked={on}
                              onChange={() => toggle(day, row.slot)}
                              aria-label={`${occasionLabel(row.slot)} — ${
                                dishDayLabel(day) ?? day
                              }`}
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
            <p className="mt-3 text-xs leading-5 text-gray-500">
              {offCount === 0
                ? mealCopy("meals.picker.all_on")
                : mealCopy("meals.picker.some_off").replace(
                  "{n}",
                  String(offCount),
                )}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={save} disabled={props.busy}>
                {props.busy
                  ? mealCopy("meals.picker.saving")
                  : mealCopy("meals.picker.save")}
              </Button>
              <button
                type="button"
                onClick={props.onClose}
                className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-900"
              >
                {mealCopy("meals.picker.cancel")}
              </button>
            </div>
          </>
        )}
    </Modal>
  );
}
