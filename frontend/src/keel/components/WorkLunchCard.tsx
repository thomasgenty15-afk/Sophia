import React from "react";

import { t } from "../i18n/t";
import { householdErrorKey } from "../copy/planRefusals";
import type { WorkLunch } from "../lib/presenceMarks";
import {
  askableWorkLunchPeople,
  type WorkLunchPerson,
  workLunchAfterAtWork,
  workLunchAfterMicrowave,
  workLunchAfterMode,
  workLunchNeedsColdMeal,
  workLunchPrefillCount,
  workLunchQuestions,
  workLunchWriteIsNeeded,
} from "../lib/workLunchForm";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
import { Field } from "./ui/Field";

// LE DÉJEUNER DE LA SEMAINE — la question que le plan ne posait à personne.
//
// Conception: scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md §2.2.
//
// ── SA PLACE: APRÈS L'ÉQUIPEMENT, AVANT LES MOMENTS ───────────────────────
// « Les moyens de cuisson AVANT les disponibilités » (§2). L'équipement dit
// AVEC QUOI on cuisine; cette carte dit QUI est là le midi. Les poser dans
// l'autre ordre ferait planifier des cuissons impossibles.
//
// ── ⛔ CE QUE CETTE CARTE N'A PAS LE DROIT DE FAIRE ────────────────────────
// ÉCRIRE AU MONTAGE. La porte SQL ré-applique le pré-remplissage à CHAQUE
// écriture, même identique (mesuré par L3-B): une réponse ré-émise « pour être
// sûr » ressuscite les cinq midis « dehors », y compris celui que la personne
// venait de décocher à la main dans la grille. Il n'y a donc AUCUN `useEffect`
// qui écrit ici, et chaque geste passe par `workLunchWriteIsNeeded`.
//
// ── LE BROUILLON EST FIGÉ AU MONTAGE, DONC IL LUI FAUT UNE PORTE ──────────
// `answers === null` veut dire « la lecture n'a pas eu lieu ». La carte ne rend
// alors AUCUN contrôle: afficher sept questions vierges pendant que la lecture
// court, c'est montrer « personne ne mange au bureau » à un foyer qui a répondu
// — et le premier clic l'écrirait. Cicatrice `mount-snapshot-forms-need-a-loading-gate`.
//
// ── PRÉ-REMPLIR N'EST PAS DÉCIDER (§2.2 bis) ──────────────────────────────
// La carte DIT ce que la réponse va cocher, et elle dit que la grille gagne.
// Une réponse hebdomadaire qui ne se laisserait pas contredire ferait
// disparaître un repas que quelqu'un vient de déclarer à la main.

export interface WorkLunchCardProps {
  /** Les bouches de la table. La carte filtre elle-même les majeurs. */
  people: readonly WorkLunchPerson[];
  /**
   * CE QUI EST ENREGISTRÉ, par `member_id`. `null` = LA LECTURE N'A PAS EU LIEU
   * — et c'est la garde, pas un détail: une `Map` vide veut dire « lu, personne
   * n'a répondu », ce qui est une information tout à fait différente.
   */
  answers: Map<string, WorkLunch | null> | null;
  busy: boolean;
  /** Rend le refus de la base, nommé. `ok: false` n'est jamais une exception. */
  onSave: (
    memberId: string,
    answer: WorkLunch,
  ) => Promise<{ ok: boolean; reason: string | null }>;
}

export default function WorkLunchCard(props: WorkLunchCardProps) {
  const people = askableWorkLunchPeople(props.people);

  /**
   * LE BROUILLON, PAR BOUCHE — et il se resynchronise quand la base change.
   *
   * Même mécanique que `MealPickerGrid`: l'initialiseur d'un `useState` ne
   * tourne qu'au montage, et cette carte reste montée pendant toute l'étape.
   * Sans resynchro, la réponse enregistrée à l'instant ne reviendrait jamais du
   * serveur et le prochain clic partirait d'un état périmé.
   */
  const savedPrint = JSON.stringify(
    [...(props.answers ?? new Map<string, WorkLunch | null>())]
      .map(([id, a]) => [id, a?.atWork ?? null, a?.mode ?? null, a?.microwave ?? null])
      .sort(),
  );
  const [draft, setDraft] = React.useState<Map<string, WorkLunch | null>>(
    new Map(),
  );
  const [syncedFrom, setSyncedFrom] = React.useState<string | null>(null);
  if (props.answers !== null && syncedFrom !== savedPrint) {
    setSyncedFrom(savedPrint);
    setDraft(new Map(props.answers));
  }

  const [pending, setPending] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Map<string, string>>(new Map());

  async function commit(memberId: string, next: WorkLunch) {
    // ⛔ LA GARDE, ET ELLE EST AVANT TOUT LE RESTE. Comparer au BROUILLON ne
    // dirait rien: il vient d'être changé par le clic. On compare à ce qui est
    // ENREGISTRÉ — c'est cette écriture-là qui recoche les midis.
    const saved = props.answers?.get(memberId) ?? null;
    setDraft((prev) => new Map(prev).set(memberId, next));
    if (!workLunchWriteIsNeeded(saved, next)) return;

    setErrors((prev) => {
      const m = new Map(prev);
      m.delete(memberId);
      return m;
    });
    setPending(memberId);
    try {
      const res = await props.onSave(memberId, next);
      if (!res.ok) {
        // LE REFUS SOUS LE GESTE QUI L'A DÉCLENCHÉ. Un refus rendu ailleurs se
        // lit comme un bouton mort — trois fois dans `SetupPage`.
        const reason = res.reason ?? "";
        const key = householdErrorKey(reason);
        setErrors((prev) =>
          new Map(prev).set(memberId, key ? t(key) : reason || "—")
        );
      }
    } catch (e) {
      setErrors((prev) =>
        new Map(prev).set(memberId, e instanceof Error ? e.message : String(e))
      );
    } finally {
      setPending(null);
    }
  }

  // AUCUN MAJEUR À LA TABLE ⇒ AUCUNE CARTE. Un titre suivi du vide se lit comme
  // un écran cassé; et la question n'a littéralement personne à qui se poser.
  if (people.length === 0) return null;

  return (
    <Card>
      <SectionLabel>{t("setup.work_lunch.title")}</SectionLabel>
      <p className="mt-2 text-sm text-ink-soft">{t("setup.work_lunch.intro")}</p>

      {props.answers === null
        ? (
          <p className="mt-4 text-sm text-ink-soft">
            {t("setup.work_lunch.loading")}
          </p>
        )
        : (
          <ul className="mt-4 space-y-4">
            {people.map((person) => (
              <li
                key={person.memberId}
                className="rounded-card border border-line-strong bg-fig-50/40 p-4"
              >
                <PersonWorkLunch
                  person={person}
                  answer={draft.get(person.memberId!) ?? null}
                  busy={props.busy || pending === person.memberId}
                  error={errors.get(person.memberId!)}
                  onAnswer={(next) => void commit(person.memberId!, next)}
                />
              </li>
            ))}
          </ul>
        )}
    </Card>
  );
}

/**
 * DEUX BOUTONS, UNE QUESTION — le vocabulaire de sélection de cet écran.
 *
 * `aria-pressed` parce que la couleur seule ne porte jamais un état: sans lui,
 * un lecteur d'écran annonce deux boutons dont aucun ne dit lequel est la
 * réponse.
 */
function Choice(props: {
  label: string;
  hint?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string | null;
  onPick: (value: string) => void;
  busy: boolean;
}) {
  return (
    <Field label={props.label} hint={props.hint}>
      <div className="flex flex-wrap gap-2">
        {props.options.map((o) => {
          const on = props.value === o.value;
          return (
            <Button
              key={o.value}
              size="sm"
              variant={on ? "primary" : "secondary"}
              aria-pressed={on}
              disabled={props.busy}
              onClick={() => props.onPick(o.value)}
            >
              {o.label}
            </Button>
          );
        })}
      </div>
    </Field>
  );
}

function PersonWorkLunch(props: {
  person: WorkLunchPerson;
  answer: WorkLunch | null;
  busy: boolean;
  error: string | undefined;
  onAnswer: (next: WorkLunch) => void;
}) {
  const answer = props.answer;
  const shown = workLunchQuestions(answer);
  // Le prénom est la clé de tout l'affichage (règle F5). Une question qui ne
  // nomme personne, à une table de quatre, ne désigne personne.
  const name = props.person.firstName.trim() || "—";
  const prefill = workLunchPrefillCount(answer);

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-ink">{name}</p>

      <Choice
        label={t("setup.work_lunch.at_work", { name })}
        options={[
          { value: "yes", label: t("setup.work_lunch.yes") },
          { value: "no", label: t("setup.work_lunch.no") },
        ]}
        value={answer === null ? null : answer.atWork ? "yes" : "no"}
        onPick={(v) => props.onAnswer(workLunchAfterAtWork(answer, v === "yes"))}
        busy={props.busy}
      />

      {shown.includes("mode") && (
        <Choice
          label={t("setup.work_lunch.mode", { name })}
          options={[
            { value: "lunchbox", label: t("setup.work_lunch.mode_lunchbox") },
            { value: "outside", label: t("setup.work_lunch.mode_outside") },
          ]}
          value={answer?.mode ?? null}
          onPick={(v) =>
            props.onAnswer(
              workLunchAfterMode(answer, v === "outside" ? "outside" : "lunchbox"),
            )}
          busy={props.busy}
        />
      )}

      {shown.includes("microwave") && (
        <Choice
          label={t("setup.work_lunch.microwave")}
          options={[
            { value: "yes", label: t("setup.work_lunch.yes") },
            { value: "no", label: t("setup.work_lunch.no") },
          ]}
          value={answer?.microwave === null || answer?.microwave === undefined
            ? null
            : answer.microwave
            ? "yes"
            : "no"}
          onPick={(v) => props.onAnswer(workLunchAfterMicrowave(answer, v === "yes"))}
          busy={props.busy}
        />
      )}

      {/* ── CE QUE LA RÉPONSE VA FAIRE, DIT AVANT DE LE FAIRE (§2.3) ────────
          Le nombre est CALCULÉ (`workLunchPrefillCount`), jamais écrit à la
          main: une semaine de travail qui changerait de longueur changerait
          aussi cette phrase, au lieu de la laisser mentir. */}
      {prefill > 0 && (
        <p className="text-sm text-ink-soft">
          {t("setup.work_lunch.outside_note", { n: prefill })}
        </p>
      )}
      {answer?.mode === "lunchbox" && (
        <p className="text-sm text-ink-soft">
          {t("setup.work_lunch.lunchbox_note")}
        </p>
      )}
      {/* La SEULE contrainte que la gamelle ajoute, et elle est réelle: sans
          micro-ondes, le repas doit être BON FROID. On ne l'invente pas sur un
          silence — `microwave === null` ne dit rien. */}
      {workLunchNeedsColdMeal(answer) && (
        <p className="text-sm text-ink-soft">{t("setup.work_lunch.cold_note")}</p>
      )}
      {/* ⚠️ LA PHRASE QUI TIENT §2.2 BIS, ET ELLE N'EST PAS DÉCORATIVE. Sans
          elle, quelqu'un qui répond « au bureau » croit avoir décidé de ses
          cinq midis pour toujours. Elle n'apparaît qu'une fois la question
          répondue: la promettre avant de demander serait du bruit. */}
      {answer !== null && answer.atWork && (
        <p className="text-sm text-ink-soft">{t("setup.work_lunch.grid_wins")}</p>
      )}

      {props.error && <p className="text-sm text-red-700">{props.error}</p>}
    </div>
  );
}
