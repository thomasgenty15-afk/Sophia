import React from "react";

import { t } from "../i18n/t";
import { householdErrorKey } from "../copy/planRefusals";
import type { WorkLunch } from "../lib/presenceMarks";
import { commitMemberWorkLunch } from "../lib/workLunchCommit";
import { type WorkLunchPerson, workLunchIsAskable } from "../lib/workLunchForm";
import PersonWorkLunch from "./PersonWorkLunch";
import { SectionLabel } from "./ui/Card";

// LE DÉJEUNER EN SEMAINE, DANS LA FICHE D'UNE BOUCHE — A6 (P6), 2026-09-03.
//
// Conception: scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md §2.2,
// ANALYSE 2026-09-03-1237 §6, MASTER PROMPT 2026-09-03-1308 §5.3.
//
// ── SA PLACE: AU-DESSUS DE LA GRILLE QU'ELLE PRÉ-REMPLIT ──────────────────
// La question vivait à l'étape 3 de l'entonnoir (`WorkLunchCard`, toutes les
// bouches dans une carte), deux écrans avant la grille que sa réponse coche.
// Elle vit maintenant dans `MemberRow` de `/app/household`, juste au-dessus du
// bouton « sa semaine » qui ouvre `MealPickerGrid`: la réponse et ce qu'elle
// coche sur le MÊME écran. « Pré-remplir n'est pas décider, la grille gagne »
// (§2.2 bis) ne se lit que si la grille est à portée de main.
//
// ── À QUI ELLE SE POSE — `age_state`, JAMAIS UN `kind` ────────────────────
// Aux majeurs du roster (`HouseholdMemberView.ageState`, c'est-à-dire
// `keel_household_member_age`, l'autorité qui rend `not_adult` à l'écriture),
// compte ou pas. `unknown` n'est pas interrogé: « ne pas savoir » n'est pas
// « savoir que c'est un adulte ». Le filtre est `workLunchIsAskable`, le seul.
//
// ⛔ `userId` NE FILTRE RIEN, ET C'EST ÉCRIT EN BASE. La porte SQL n'a PAS de
// refus `has_account` — « où quelqu'un déjeune est un FAIT », dit son
// commentaire —, contrairement au régime et aux moments. Filtrer ici
// retirerait la question à des gens à qui la base accepte de répondre.
// (Arbitrage pris le 2026-08-18 dans `lib/workLunchRoster.ts`, module retiré
// avec l'étape; il est reporté ici pour ne pas mourir avec lui.)
//
// ── ⛔ CE QUE CETTE CARTE N'A PAS LE DROIT DE FAIRE ────────────────────────
// ÉCRIRE AU MONTAGE. La porte SQL `keel_household_set_member_work_lunch`
// ré-applique son pré-remplissage à CHAQUE écriture, même identique (mesuré
// par L3-B): elle retire puis réécrit les cinq midis « dehors », y compris
// celui que la personne venait de décocher à la main dans la grille. Il n'y a
// donc AUCUN `useEffect` ici — ni qui lise, ni qui écrive —, et chaque geste
// passe par `commitMemberWorkLunch`, qui compare à ce qui est ENREGISTRÉ
// (`saved`) et pas au brouillon qu'on vient de changer.
//
// ── LE BROUILLON EST FIGÉ AU MONTAGE, DONC IL LUI FAUT UNE PORTE ──────────
// `answers === null` veut dire « la lecture n'a pas eu lieu ». La carte ne
// rend alors AUCUN contrôle: afficher la question vierge pendant que la
// lecture court, c'est montrer « personne ne mange au bureau » à un foyer qui
// a répondu — et le premier clic l'écrirait. Une `Map` vide veut dire « lu,
// personne n'a répondu », ce qui est une information tout à fait différente.
// Cicatrice `mount-snapshot-forms-need-a-loading-gate`.
//
// ── LES TROIS GARDES, ET OÙ ELLES SONT MESURÉES ───────────────────────────
//   ① `workLunchWriteIsNeeded` contre le `saved` serveur — dans
//      `commitMemberWorkLunch` (`lib/workLunchCommit.ts`), module pur;
//   ② la relecture AVANT `onSaved` — dans `commitWorkLunch`, que la page
//      passe en `onSave`;
//   ③ `null` ≠ `Map` vide — dans `readWorkLunchAnswers`, module pur, et dans
//      la porte de rendu ci-dessous.
// `memberWorkLunchCard.int.test.ts` tient les trois.

export interface MemberWorkLunchCardProps {
  /** LA bouche de cette ligne, avec son `ageState` du roster. */
  person: WorkLunchPerson;
  /**
   * CE QUI EST ENREGISTRÉ, par `member_id`, pour tout le foyer. `null` = LA
   * LECTURE N'A PAS EU LIEU — et c'est la garde, pas un détail: une `Map` vide
   * veut dire « lu, personne n'a répondu ».
   */
  answers: Map<string, WorkLunch | null> | null;
  /** Le motif d'une lecture ratée, rendu près de la carte qui manque. */
  readError: string | null;
  busy: boolean;
  /**
   * LE GESTE COMPLET — écrire, relire les réponses, relire la page — tel que
   * `commitWorkLunch` l'ordonne. Rend le refus de la base, nommé. `ok: false`
   * n'est jamais une exception.
   */
  onSave: (
    memberId: string,
    answer: WorkLunch,
  ) => Promise<{ ok: boolean; reason: string | null }>;
}

export default function MemberWorkLunchCard(props: MemberWorkLunchCardProps) {
  const memberId = props.person.memberId;
  const saved = props.answers?.get(memberId ?? "") ?? null;

  /**
   * LE BROUILLON, ET IL SE RESYNCHRONISE QUAND LA BASE CHANGE.
   *
   * Même mécanique que `MealPickerGrid`: l'initialiseur d'un `useState` ne
   * tourne qu'au montage, et cette carte reste montée tant que la fiche est
   * ouverte. Sans resynchro, la réponse enregistrée à l'instant ne reviendrait
   * jamais du serveur et le prochain clic partirait d'un état périmé.
   */
  const savedPrint = props.answers === null
    ? null
    : JSON.stringify(
      saved === null ? null : [saved.atWork, saved.mode, saved.microwave],
    );
  const [draft, setDraft] = React.useState<WorkLunch | null>(saved);
  const [syncedFrom, setSyncedFrom] = React.useState<string | null>(savedPrint);
  if (savedPrint !== null && syncedFrom !== savedPrint) {
    setSyncedFrom(savedPrint);
    setDraft(saved);
  }

  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function commit(next: WorkLunch) {
    if (!memberId) return;
    setDraft(next);
    setError(null);
    setPending(true);
    try {
      // ⛔ LA GARDE EST DANS LE MODULE PUR, PAS ICI. `saved` est ce que la page
      // a LU; comparer au brouillon dirait toujours « ça a changé ».
      const res = await commitMemberWorkLunch({
        saved,
        next,
        commit: (answer) => props.onSave(memberId, answer),
      });
      if (!res.ok) {
        // LE REFUS SOUS LE GESTE QUI L'A DÉCLENCHÉ. Un refus rendu ailleurs se
        // lit comme un bouton mort — trois fois dans `SetupPage`.
        const reason = res.reason ?? "";
        const key = householdErrorKey(reason);
        setError(key ? t(key) : reason || "—");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  // PAS UN MAJEUR, OU PAS DE LIGNE ⇒ PAS DE CARTE. Un titre suivi du vide se
  // lit comme un écran cassé; et la base refuserait la réponse (`not_adult`).
  if (!workLunchIsAskable(props.person)) return null;

  return (
    <div className="border-t border-line pt-3">
      <SectionLabel>{t("setup.work_lunch.title")}</SectionLabel>
      <p className="mb-2 text-xs text-ink-soft">{t("setup.work_lunch.intro")}</p>
      {props.readError !== null
        ? (
          // LE REFUS PRÈS DU GESTE — ici, près de la carte qui manque. Un
          // écran qui afficherait « lecture… » pour toujours sur une lecture
          // tombée ne dit pas qu'il faut réessayer. Et on ne pose PAS la
          // question par-dessus: `saved` serait périmé, donc la garde aussi.
          <p className="text-sm text-red-700">{props.readError}</p>
        )
        : props.answers === null
        ? (
          <p className="text-sm text-ink-soft">
            {t("setup.work_lunch.loading")}
          </p>
        )
        : (
          <PersonWorkLunch
            person={props.person}
            answer={draft}
            busy={props.busy || pending}
            error={error ?? undefined}
            onAnswer={(next) => void commit(next)}
          />
        )}
    </div>
  );
}
