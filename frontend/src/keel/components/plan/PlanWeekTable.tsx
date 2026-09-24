import type { MemberDayEnergyView } from "../../api/mealEnergy";
import { dishDayLabel, mealCopy } from "../../api/mealLabels";

// ⟳ 2026-09-24 — LA SEMAINE EN UN TABLEAU, EN TÊTE DU PLAN (aperçu et
// `/app/plan`).
//
// Demandé: « en haut du modal, une indication de s'il y a des courses ou une
// session de cuisine sur chaque journée, et par personne le nombre de
// calories ». Il remplace « Toute la semaine », retiré du rail le même jour:
// on juge la semaine ici, on lit un jour en dessous.
//
// ── CE COMPOSANT REND, IL NE CALCULE RIEN ──────────────────────────────────
// Les jours de courses, les durées de cuisine et les chiffres arrivent prêts:
// les vagues viennent de `waveAssignments` (module serveur réexporté), les
// durées des sessions du plan, les totaux de `meal-energy-v1`. Une seconde
// règle ici divergerait de la première au premier correctif.
//
// ── ⛔ LES CALORIES NE SE DÉCIDENT PAS ICI ─────────────────────────────────
// `memberDayEnergy` ne répond que pour une personne dont les boîtes passent
// déjà leurs portes côté serveur (adulte, objectif de perte ou de prise, rien
// de fermé). Pour les autres il rend `null` et la case dit « — ». Aucune ligne
// de personne ne s'affiche tant qu'AUCUN chiffre n'existe: une grille de tirets
// sous les yeux d'une personne que les portes protègent lui dirait qu'un
// chiffre existe et lui est caché.
//
// ── ⚠️ JAMAIS LE NOM DE JOUR COMPLET ───────────────────────────────────────
// Même contenu que le rail (`slice(0, 3)` + quantième). `planWeekCarriedDays`
// exige que le nom complet d'un jour n'apparaisse que dans SON bloc: l'écrire
// ici le ferait apparaître deux fois.

export interface PlanWeekTablePerson {
  memberId: string;
  /** Le prénom, tel que la ligne membre l'écrit. Jamais traduit. */
  name: string;
}

export interface PlanWeekTableProps {
  /** Les jetons dans l'ordre du PLAN (`windowDayOrder`). */
  dayOrder: readonly string[];
  /** Jeton → date (`windowDates`). */
  dayDates: Record<string, string>;
  today: string;
  /** Le jour lu en dessous: sa colonne est marquée. `null` = aucun. */
  selectedDay: string | null;
  /** Les jours où tombe une vague de courses qui porte au moins une ligne. */
  groceryDays: ReadonlySet<string>;
  /**
   * La cuisine du jour: la somme des durées de ses sessions, en minutes;
   * `null` = une session dont la durée n'est pas connue. Jour absent = pas de
   * session.
   */
  cookingMinutes: ReadonlyMap<string, number | null>;
  /** Les personnes du plan, dans l'ordre de `member_portions`. */
  people: readonly PlanWeekTablePerson[];
  /** Le total du jour d'une personne, ou `null`. Absent = aucun chiffre du tout. */
  memberDayEnergy?: (memberId: string, day: string) => MemberDayEnergyView | null;
}

/** « 1 h 20 », « 2 h », « 45 min » — le libellé vient du catalogue. */
function durationText(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded < 60) return mealCopy("meals.same_day.minutes", { n: rounded });
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0
    ? mealCopy("meals.week_table.hours", { h })
    : mealCopy("meals.week_table.hours_minutes", { h, m: String(m).padStart(2, "0") });
}

export default function PlanWeekTable(props: PlanWeekTableProps) {
  const { dayOrder } = props;
  if (dayOrder.length === 0) return null;

  const energyOf = props.memberDayEnergy;
  const rows = props.people.map((person) => ({
    person,
    cells: dayOrder.map((day) => energyOf?.(person.memberId, day) ?? null),
  }));
  // LES LIGNES DE PERSONNES N'EXISTENT QUE S'IL Y A UN CHIFFRE — voir l'en-tête.
  const anyFigure = rows.some((row) => row.cells.some((cell) => cell !== null));
  const anyPartial = anyFigure &&
    rows.some((row) => row.cells.some((cell) => cell !== null && !cell.complete));

  const columnTone = (day: string) =>
    day === props.selectedDay ? "bg-fig-50" : "";

  return (
    <div>
      {/* LE DÉFILEMENT EST DANS LE TABLEAU, jamais sur la page: à 320 px, sept
          colonnes et un prénom ne tiennent pas, et un tableau qui déborde
          emporterait tout l'écran avec lui. */}
      <div className="overflow-x-auto rounded-card border border-line">
        <table className="w-full min-w-max border-collapse text-xs">
          <caption className="sr-only">{mealCopy("meals.week_table.caption")}</caption>
          <thead>
            <tr className="border-b border-line">
              <td className="sticky left-0 bg-paper px-2 py-1.5" />
              {dayOrder.map((day) => {
                const isToday = props.dayDates[day] === props.today;
                return (
                  <th
                    key={day}
                    scope="col"
                    className={`px-2 py-1.5 text-center font-normal ${columnTone(day)} ${
                      isToday ? "font-semibold text-ink" : "text-ink-soft"
                    }`}
                  >
                    <span className="block">{(dishDayLabel(day) ?? day).slice(0, 3)}</span>
                    <span className="block tabular-nums">{props.dayDates[day]?.slice(8) ?? ""}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <th scope="row" className="sticky left-0 bg-paper px-2 py-1.5 text-left font-medium text-ink">
                {mealCopy("meals.week_table.groceries")}
              </th>
              {dayOrder.map((day) => (
                <td key={day} className={`px-2 py-1.5 text-center text-ink ${columnTone(day)}`}>
                  {props.groceryDays.has(day)
                    ? (
                      <>
                        <span aria-hidden="true">●</span>
                        <span className="sr-only">{mealCopy("meals.week_table.yes")}</span>
                      </>
                    )
                    : null}
                </td>
              ))}
            </tr>
            <tr className={anyFigure ? "border-b border-line" : ""}>
              <th scope="row" className="sticky left-0 bg-paper px-2 py-1.5 text-left font-medium text-ink">
                {mealCopy("meals.week_table.cooking")}
              </th>
              {dayOrder.map((day) => {
                const minutes = props.cookingMinutes.get(day);
                return (
                  <td
                    key={day}
                    className={`whitespace-nowrap px-2 py-1.5 text-center tabular-nums text-ink ${columnTone(day)}`}
                  >
                    {minutes === undefined
                      ? null
                      : minutes === null
                      ? (
                        <>
                          <span aria-hidden="true">●</span>
                          <span className="sr-only">{mealCopy("meals.week_table.yes")}</span>
                        </>
                      )
                      : durationText(minutes)}
                  </td>
                );
              })}
            </tr>
            {anyFigure &&
              rows.map(({ person, cells }, index) => (
                <tr
                  key={person.memberId}
                  data-member-id={person.memberId}
                  className={index < rows.length - 1 ? "border-b border-line" : ""}
                >
                  <th
                    scope="row"
                    // Un prénom n'a aucune longueur garantie: il passe à la
                    // ligne plutôt que d'élargir la colonne collée à gauche.
                    className="sticky left-0 max-w-[9rem] break-words bg-paper px-2 py-1.5 text-left font-medium text-ink"
                  >
                    {mealCopy("meals.week_table.person_kcal", { name: person.name })}
                  </th>
                  {cells.map((cell, i) => (
                    <td
                      key={dayOrder[i]}
                      className={`whitespace-nowrap px-2 py-1.5 text-center tabular-nums ${
                        cell === null ? "text-ink-soft" : "text-ink"
                      } ${columnTone(dayOrder[i])}`}
                    >
                      {cell === null ? "—" : `${cell.kcal}${cell.complete ? "" : "*"}`}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {anyPartial && (
        <p className="mt-1 text-xs text-ink-soft">{mealCopy("meals.week_table.partial_note")}</p>
      )}
    </div>
  );
}
