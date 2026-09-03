import { t } from "../i18n/t";
import type { WorkLunch } from "../lib/presenceMarks";
import {
  type WorkLunchPerson,
  workLunchAfterAtWork,
  workLunchAfterMicrowave,
  workLunchAfterMode,
  workLunchNeedsColdMeal,
  workLunchPrefillCount,
  workLunchQuestions,
} from "../lib/workLunchForm";
import { Button } from "./ui/Button";
import { Field } from "./ui/Field";

// LE DÉJEUNER D'UNE PERSONNE — les trois questions dépliées, et rien d'autre.
//
// Conception: scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md §2.2.
//
// ── D'OÙ IL VIENT (A6, 2026-09-03) ────────────────────────────────────────
// C'était la fonction privée `PersonWorkLunch` de `WorkLunchCard.tsx`, la carte
// de l'étape 3 de l'entonnoir qui posait la question à TOUTES les bouches d'un
// coup. La question a déménagé sur `/app/household`, dans la fiche de chaque
// personne, juste au-dessus de la grille qu'elle pré-remplit — la réponse et
// ce qu'elle coche sur le même écran (§2.2 bis: « pré-remplir n'est pas
// décider, la grille gagne »). La carte à N personnes n'a plus de site; celle-ci
// est ce qu'il en reste: UNE personne, UNE réponse, et le dire avant de faire.
//
// ── CE QUE CE COMPOSANT NE SAIT PAS, EXPRÈS ───────────────────────────────
// Il ne lit rien, n'écrit rien, ne compare rien: il rend une réponse et remonte
// la suivante. La garde d'écriture (`workLunchWriteIsNeeded`), la porte de
// lecture (`answers === null`) et la relecture après écriture vivent dans
// `MemberWorkLunchCard` et `lib/workLunchCommit.ts`, où elles sont mesurables.
//
// ⚠️ LE PRÉNOM N'EST PLUS RÉPÉTÉ EN TÊTE. La ligne du foyer le porte déjà
// au-dessus; les questions, elles, le NOMMENT toujours ({name}) — une question
// qui ne désigne personne, à une table de quatre, ne désigne personne (F5).

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

export default function PersonWorkLunch(props: {
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
