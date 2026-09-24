// ⟳ 2026-09-24 — SORTI DE `HouseholdPage.tsx` (découpage, lot 4c), À L'IDENTIQUE.
// Le brouillon d'une bouche et ses trois champs.
// Le fichier d'origine l'atteint par ses imports; il ré-exporte ce qu'il exportait.

import type { MemberAgeState, MemberGoal } from "../../api/household";
import GoalTiles from "../../components/GoalTiles";
import { t } from "../../i18n/t";
import { Field, inputClass } from "../../components/ui/Field";
import { goalLabel } from "./labels.ts";

/** Ce qu'un formulaire de bouche porte. Un seul type pour les trois usages. */
export interface MouthDraft {
  firstName: string;
  /** `""` = « ne touche pas ». Voir `saveMember`: le roster ne rend pas la date. */
  birthDate: string;
  /**
   * `""` = RIEN DE COCHÉ — et l'écran ne sait plus rien produire d'autre que
   * les trois jetons (chantier P3, 2026-09-03: l'option vide « Aucune
   * direction particulière » est retirée des cinq `<select>`). Une ligne à
   * `goal = null` en base s'ouvre sur `""` et reste à `""` tant que le maître
   * ne choisit pas; `null` reste valide EN BASE (part standard, D3.3).
   */
  goal: MemberGoal | "";
}

/**
 * LES TROIS CHAMPS, UNE SEULE FOIS DANS LE FICHIER.
 *
 * Le maître se décrit avec, on ajoute une bouche avec, et on corrige une bouche
 * avec. Trois copies de ce bloc divergeraient sur le seul détail qui compte —
 * ce qu'on fait d'un champ vide — et personne ne saurait laquelle est la règle.
 */
export function MouthFields(
  { draft, onChange, mine, showKeptDateHint, goalEditable = true, ageState, radioName }: {
    draft: MouthDraft;
    onChange: (next: MouthDraft) => void;
    /** Change le libellé de l'objectif, rien d'autre. */
    mine?: boolean;
    /**
     * L'ÉTAT D'ÂGE QUI FILTRE LES DIRECTIONS — REQUIS, jamais optionnel. C'est
     * l'appelant qui le dérive (`ageStateOfTypedDate`: la date TAPÉE gagne sur
     * le roster), parce que ce formulaire ne connaît ni la ligne ni le jour.
     * Un défaut ici (`"unknown"`) ferait proposer trois directions à un enfant
     * — exactement l'écran d'avant ce lot.
     */
    ageState: MemberAgeState;
    /** Le `name` des boutons radio — unique par formulaire sur la page. */
    radioName: string;
    /** Vrai quand la ligne PORTE déjà une date qu'on ne peut pas préremplir. */
    showKeptDateHint?: boolean;
    /**
     * FAUX dès que la bouche a un COMPTE (D1, 2026-08-11). Son objectif vit
     * alors dans son « about you » (`student_goals`), et la base refuse
     * `keel_household_set_member_goal` avec `has_account`. Laisser le sélecteur
     * afficherait un contrôle qui échoue à tous les coups — pire qu'un contrôle
     * absent, parce qu'il promet.
     */
    goalEditable?: boolean;
  },
) {
  return (
    <div className="flex flex-col gap-3">
      <Field
        label={t("household.member.first_name")}
        hint={t("household.member.first_name_hint")}
      >
        <input
          // `min-w-0`: un enfant flex ne rétrécit pas sous son contenu sans lui,
          // et la ligne déborde à 320 px (leçon `flex-child-min-width-auto`).
          className={`${inputClass} min-w-0`}
          value={draft.firstName}
          maxLength={40}
          onChange={(e) => onChange({ ...draft, firstName: e.target.value })}
        />
      </Field>
      <Field
        label={t("household.member.birth_date")}
        // D18 — SUR MA PROPRE LIGNE, CE CHAMP EST CELUI DE MON « ABOUT YOU »:
        // il écrit `profiles.birth_date` (voir `saveMember`). Le dire évite la
        // question qui suit sinon — « faut-il la remettre là-bas ? » — et la
        // réponse fausse qui va avec.
        hint={mine
          ? t("household.member.birth_date_mine")
          : showKeptDateHint
          ? t("household.member.birth_date_kept")
          : t("household.member.birth_date_hint")}
      >
        <input
          className={`${inputClass} min-w-0`}
          type="date"
          value={draft.birthDate}
          // La base refuse une date future (`bad_birth_date`); le champ le dit
          // avant l'aller-retour, il ne le REMPLACE pas.
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => onChange({ ...draft, birthDate: e.target.value })}
        />
      </Field>
      <Field
        label={mine ? t("household.member.goal_mine") : t("household.member.goal")}
        hint={goalEditable ? undefined : t("household.member.goal_from_profile")}
      >
        {goalEditable
          ? (
            // TROIS TUILES, AUCUNE PRÉ-SÉLECTION, ET UNE SEULE POUR UN MINEUR
            // — le même composant que la fiche et que l'entonnoir.
            <GoalTiles
              name={radioName}
              ariaLabel={mine ? t("household.member.goal_mine") : t("household.member.goal")}
              value={draft.goal}
              ageState={ageState}
              labelOf={goalLabel}
              onChange={(g) => onChange({ ...draft, goal: g })}
            />
          )
          : (
            <p className="text-sm text-ink">
              {/* « — » ET PLUS « Aucune direction particulière »: une lecture
                  qui nomme une quatrième direction en fabrique une. */}
              {draft.goal ? goalLabel(draft.goal) : "—"}
            </p>
          )}
      </Field>
    </div>
  );
}
