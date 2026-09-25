// ⟳ 2026-09-24 — SORTI DE `SetupPage.tsx` (découpage, lot 4b), À L'IDENTIQUE.
// L'étape 2: ma fiche.
// Le fichier d'origine l'importe; il ré-exporte ce qu'il exportait.

import React from "react";
import { Button } from "../../components/ui/Button";
import { Card, SectionLabel } from "../../components/ui/Card";
import { Field, inputClass } from "../../components/ui/Field";
import { MEMBER_GENDERS, type MemberGender } from "../../api/household";
import GoalTiles from "../../components/GoalTiles";
import ActivityAxesTiles from "../../components/ActivityAxesTiles";
import type { FunnelBranch, FunnelPerson } from "../../api/onboarding";
import { MouthPreferencesButton, TargetAndPaceFields } from "../../components/MouthFormDialog";
import { ageStateOfTypedDate, foldMinorGoal, type MouthFormDraft } from "../../lib/mouthForm";
import type { MemberTargetView } from "../../api/mouthProfile";
import { browserLocalDate } from "../../lib/useMealTicks";
import { t } from "../../i18n/t";
import type { SelfDraft } from "./types.ts";
import { goalLabel } from "./labels.ts";
import { MouthRowSummary } from "./MouthRowSummary.tsx";

// ───────────────────────────────────────────────────────────────────────────
// ÉTAPE 2 — MOI
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ EXPORTÉ POUR ÊTRE RENDU PAR UN TEST, pas pour être réutilisé ailleurs —
 * même raison que `MouthsStep` juste en dessous. C'est ICI que se joue le
 * défaut rapporté le 2026-08-18 (« je choisis Perdre du poids et rien
 * n'apparaît »), et un test de SOURCE serait resté vert dessus: le montage
 * fautif se trouvait deux écrans plus loin, dans un fichier qui contenait bien
 * le mot `TargetAndPaceFields`. Voir `pages/setupSelfStepTarget.int.test.ts`.
 */
export function SelfStep(props: {
  draft: SelfDraft;
  onChange: React.Dispatch<React.SetStateAction<SelfDraft | null>>;
  branch: FunnelBranch;
  /** `null` en solo: « Continue » fait déjà tout, et deux boutons mentiraient. */
  onSave: (() => void) | null;
  busy: boolean;
  /**
   * SON POIDS VISÉ ET SON RYTHME — `null` = LA LECTURE N'A PAS EU LIEU.
   *
   * ⚠️ REQUIS, JAMAIS OPTIONNEL. Ces deux valeurs existent peut-être déjà en
   * base (`/app/household` et `/app/plan` les écrivent): un formulaire figé sur
   * du vide NON LU les écraserait au « Continuer ». Et un `?` en ferait une
   * prop qu'on oublie de passer — c'est exactement ce qui vient d'arriver à ces
   * deux champs, montés sur l'étape du planning au lieu de celle-ci.
   */
  target: null | {
    draft: MouthFormDraft;
    onChange: React.Dispatch<React.SetStateAction<MouthFormDraft>>;
    todayLocalIso: string;
  };
  /**
   * LE GESTE QUI OUVRE LES PRÉFÉRENCES — `null` tant que la lecture n'a pas eu
   * lieu, et REQUIS dans les deux cas.
   *
   * ⚠️ C'EST LA SEULE PORTE VERS LES ALLERGIES depuis le 2026-08-18. Les rendre
   * inatteignables serait pire que de les avoir laissées en ligne: `canGenerate`
   * réclame la réponse, et l'écran n'offrirait aucun champ pour la donner.
   */
  onOpenPreferences: (() => void) | null;
  /**
   * ── ⟳ 2026-09-20 · LA CARTE SE REPLIE UNE FOIS ENREGISTRÉE ──────────────
   *
   * Demandé à l'écran: la fiche du titulaire restait dépliée pour toujours,
   * et sur une famille elle poussait les autres bouches — celles qu'il reste
   * à saisir — sous la ligne de flottaison.
   *
   * ⚠️ LE REPLI SE DÉCLENCHE SUR L'ENREGISTREMENT RÉUSSI, JAMAIS SUR LE CLIC.
   * Une ligne de bouche déjà inscrite écrit champ par champ, donc la replier
   * ne peut rien perdre; cette carte-ci est un BROUILLON qu'un seul geste
   * écrit. Replier au clic replierait aussi un enregistrement qui a échoué —
   * c'est-à-dire cacher les champs fautifs pendant qu'un refus s'affiche en
   * haut de la page.
   *
   * ⛔ ET ELLE NE SE REPLIE PAS EN SOLO. `onSave` y vaut `null` (« Continuer »
   * enregistre et avance), donc il n'existe aucun moment où le repli aurait un
   * sens — et une carte repliée sans geste pour l'avoir repliée se lit comme
   * un écran qui a perdu son formulaire. La garde est prise ici plutôt que
   * chez l'appelant: c'est cette carte qui sait que ses deux états dépendent
   * de `onSave`.
   */
  editing: boolean;
  onToggleEdit: () => void;
  /**
   * CE QU'ON SAIT DE LUI **EN BASE** — et surtout pas le brouillon.
   *
   * `null` = la lecture n'a pas rendu. Le résumé d'une carte repliée doit se
   * lire sur les faits relus par `load`: nourri du brouillon, il afficherait
   * comme enregistré exactement ce qui ne l'est pas, et le repli deviendrait
   * la preuve visuelle d'une écriture qui n'a pas eu lieu.
   */
  saved: { person: FunnelPerson; target: MemberTargetView | null } | null;
}) {
  const { draft, onChange, branch, onSave, busy, target } = props;
  // Voir `editing` ci-dessus: sans `onSave`, il n'y a pas de geste qui replie.
  const editing = onSave === null ? true : props.editing;
  /**
   * LE GESTE DE SORTIE DE LA CARTE — en bas, et seulement en édition.
   *
   * Repliée, il n'y a rien à enregistrer et « Modifier » l'a remplacé en tête
   * de carte. Il voyage jusqu'à la barre de fin par le `action` de la porte
   * des préférences: les deux y sont sur une ligne, la porte à gauche et lui
   * à droite — l'avance est à droite sur cette page, voir la note du
   * 2026-08-19 sur la barre de bas d'écran.
   */
  const saveButton = onSave !== null && editing
    ? (
      <Button variant="secondary" disabled={busy} onClick={onSave}>
        {t("household.member.save")}
      </Button>
    )
    : null;
  // ⚠️ MISE À JOUR FONCTIONNELLE, ET CE N'EST PAS UN TIC DE STYLE. Un
  // `onChange({ ...draft, ...patch })` fusionne depuis le `draft` de LA
  // FERMETURE, c'est-à-dire l'état du dernier rendu. React groupe les mises à
  // jour d'un même tick: deux réponses cochées coup sur coup partent alors du
  // MÊME état de départ, et la seconde efface la première. Mesuré sur cet
  // écran le 2026-08-12 — trois moments de repas cochés d'affilée n'en
  // laissaient qu'un, et rien ne le signalait.
  const set = (patch: Partial<SelfDraft>) =>
    onChange((prev) => (prev === null ? prev : { ...prev, ...patch }));
  return (
    <Card>
      {/* ── ⟳ 2026-09-20 · « MODIFIER » EN HAUT À DROITE ───────────────────
          Demandé à l'écran: « la carte du compte maître en étant rétractée
          doit avoir "modifier" en haut à droite comme la carte des gens qui
          mangent dans la famille ». Les deux cartes de cet écran portent donc
          le même gabarit — titre à gauche, gestes à droite — et le geste de
          SORTIE, lui, est en bas des deux (« Enregistrer »). Un seul bouton
          qui changerait de nom au milieu de la carte faisait chercher
          « Modifier » là où « Enregistrer » venait d'être. */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel>{t("setup.people.title")}</SectionLabel>
        {onSave !== null && !editing ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={props.onToggleEdit}
          >
            {t("setup.mouths.edit")}
          </Button>
        ) : null}
      </div>
      {/* ⛔ « Toi aussi, tu manges ici. Tu es la première place à table, pas
          la personne qui la tient. » RETIRÉ LE 2026-08-19. Elle expliquait
          le MODÈLE (le titulaire est une bouche comme les autres) à
          quelqu'un qui remplit un formulaire. Le modèle est déjà rendu par
          la structure de l'écran — sa carte est la première d'une liste de
          cartes identiques —, et une phrase qui explique ce que la mise en
          page dit déjà est du bruit. */}

      <div className="mt-4 space-y-4">
        {/* ═══ CE QUI SUIT NE SE VOIT QU'EN ÉDITION ══════════════════════════
            Repliée, la carte rend le MÊME résumé qu'une ligne de bouche — et
            c'est pour ça qu'il est partagé. L'indentation du bloc n'a pas
            bougé avec l'ajout de cette porte: la réindenter aurait noyé le
            geste dans deux cents lignes de diff blanc. */}
        {editing ? (
        <>
        {/* LE PRÉNOM N'EST DEMANDÉ QUE S'IL Y A UN FOYER — rien, dans le chemin
            individuel, ne lit le prénom du mangeur. Voir `FUNNEL_QUESTIONS`. */}
        {branch !== "solo" ? (
          <Field
            label={t("setup.people.first_name")}
            htmlFor="setup-first-name"
          >
            <input
              id="setup-first-name"
              type="text"
              maxLength={40}
              value={draft.firstName}
              onChange={(e) => set({ firstName: e.target.value })}
              className={inputClass}
            />
          </Field>
        ) : null}

        {/* ══════════════════════════════════════════════════════════════
            LA DISPOSITION DE CETTE CARTE — 2026-09-01
            ══════════════════════════════════════════════════════════════

            Deux paires, puis l'objectif, puis les journées. Demandé à l'écran,
            et l'ordre raconte quelque chose: d'abord CE QU'EST ce corps
            (naissance, sexe, taille, poids), ensuite CE QU'IL VISE, ensuite CE
            QU'IL FAIT de ses journées.

            ⟳ CE QUI A BOUGÉ, ET CE QUE ÇA COÛTE ──────────────────────────
            Le sexe était seul, sous les journées: il rejoint la naissance. Le
            poids était seul, sous la taille: ils font paire. Et
            `ActivityAxesTiles` DESCEND sous l'objectif.

            ⛔ CETTE DERNIÈRE ROMPT UNE ADJACENCE QUI ÉTAIT ARGUMENTÉE, et son
            commentaire est réécrit plutôt que laissé à contredire le code.
            L'activité était « à côté de la taille et du poids parce que c'est
            la TROISIÈME ENTRÉE DE LA MÊME ÉQUATION »: le corps dit combien on
            pèse, l'activité ce qu'on en fait, et `meal_envelope.ts` multiplie
            les deux. C'est toujours vrai du CALCUL — ce n'est plus l'ordre de
            la LECTURE, et l'écart entre les deux extrêmes de l'activité
            (38 % de l'enveloppe) n'a pas bougé d'un point pour autant.

            ⚠️ CE QUI NE CHANGE PAS, ET IL NE FAUT PAS Y TOUCHER:
              · le corps reste AU-DESSUS de la direction — le curseur de
                `TargetAndPaceFields` est borné par lui, et sans corps il ne
                rend qu'un `needs_body`;
              · le poids visé reste COLLÉ à la direction qui le débloque.
                Décision du 2026-08-18, mesurée à l'écran: « je choisis Perdre
                du poids et rien n'apparaît ». */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("setup.people.birth_date")}
            htmlFor="setup-birth-date"
          >
            <input
              id="setup-birth-date"
              type="date"
              value={draft.birthDate}
              max={browserLocalDate()}
              onChange={(e) => set({ birthDate: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label={t("setup.people.gender")} htmlFor="setup-gender">
            <select
              id="setup-gender"
              value={draft.gender}
              onChange={(e) => set({ gender: e.target.value as MemberGender })}
              className={inputClass}
            >
              <option value="">—</option>
              {MEMBER_GENDERS.map((g) => (
                <option key={g} value={g}>
                  {t(`household.body.gender_${g}` as "household.body.gender_female")}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("setup.people.height")}
            htmlFor="setup-height"
          >
            <input
              id="setup-height"
              type="number"
              inputMode="numeric"
              min={90}
              max={250}
              value={draft.heightCm}
              onChange={(e) => set({ heightCm: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field
            label={t("setup.people.weight")}
            htmlFor="setup-weight"
          >
            <input
              id="setup-weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={25}
              max={400}
              value={draft.weightKg}
              onChange={(e) => set({ weightKg: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>

        {/* ── TROIS TUILES, AUCUNE PRÉ-SÉLECTION (chantier P3, 2026-09-03) ──
            L'option vide « — » est partie avec les quatre autres `<select>`
            du dépôt: elle se lisait comme une quatrième direction. L'`id` du
            groupe garde le nom du champ d'avant, parce que c'est lui que le
            harnais de cette carte mesure pour l'ORDRE (corps, puis direction,
            puis cible). */}
        <Field label={t("setup.people.goal")} htmlFor="setup-goal">
          <GoalTiles
            id="setup-goal"
            name="setup-goal"
            ariaLabel={t("setup.people.goal")}
            value={draft.goal}
            ageState={ageStateOfTypedDate(draft.birthDate, "unknown", browserLocalDate())}
            labelOf={goalLabel}
            onChange={(g) => set({ goal: g })}
          />
        </Field>

        {/* ── OÙ VA LA BALANCE, ET À QUELLE VITESSE — JUSTE SOUS LA DIRECTION
            Décision de l'utilisateur, mot pour mot (2026-08-18): « quand
            quelqu'un renseigne qu'il veut perdre ou gagner du poids, alors se
            débloquent deux choses: le poids visé, et le curseur pour dire
            combien par semaine ».

            ⚠️ ILS ÉTAIENT MONTÉS DEUX ÉCRANS PLUS LOIN, sur l'étape du
            planning, et cet écran-ci — celui où l'on choisit justement sa
            direction — n'en portait AUCUN. Mesuré à l'écran par l'utilisateur:
            « je choisis Perdre du poids et rien n'apparaît ». Un champ qui
            n'est pas sous la question qui le débloque est un champ absent.

            ⚠️ ET LE CORPS EST DEMANDÉ AU-DESSUS, dans cette même carte: taille,
            poids et sexe précèdent la direction. C'est ce qui rend le curseur
            possible — son plafond est BORNÉ par ce corps —, et quand il manque
            quand même, `TargetAndPaceFields` le DIT (`needs_body`) plutôt que
            de laisser un blanc. Ne pas redescendre le corps sous la direction:
            un curseur muet se lit comme une fonctionnalité absente, et c'est le
            défaut que `MOUTH_FORM_BLOCKS` a déjà payé une fois.

            `null` = la cible n'a pas encore été lue ⇒ AUCUN champ. Voir la
            prop. */}
        {target !== null ? (
          <TargetAndPaceFields
            // Pliée à l'âge: sous une direction repliée, rien ne se déplie.
            draft={foldMinorGoal(target.draft, target.todayLocalIso).draft}
            onChange={target.onChange}
            todayLocalIso={target.todayLocalIso}
            // ⚠️ PRÉFIXE PROPRE À CETTE CARTE. La bouche qu'on ajoute porte les
            // deux mêmes contrôles PLUS BAS SUR LA MÊME PAGE: sans préfixes
            // distincts, deux `id` identiques feraient qu'un libellé désigne le
            // contrôle de quelqu'un d'autre.
            idPrefix="setup-self"
            // C'EST MA CARTE: la voix est « tu », et `who` ne sert donc jamais.
            voice="self"
            who=""
          />
        ) : null}

        {/* L'ACTIVITÉ, À CÔTÉ DE LA TAILLE ET DU POIDS — parce que c'est la
            TROISIÈME ENTRÉE DE LA MÊME ÉQUATION, pas une préférence. Le corps
            dit combien on pèse, l'activité dit ce qu'on en fait, et
            `meal_envelope.ts` multiplie les deux. La ranger ailleurs (ou
            « plus tard ») en ferait une option, et l'écart entre ses deux
            extrêmes est de 38 % de l'enveloppe.

            ⛔ DEUX GRILLES DEPUIS LE 2026-08-20, ET PLUS UNE. Les quatre crans
            mélangeaient la journée et le sport, et forçaient à n'en dire qu'un:
            239 kcal/jour fabriqués par la forme de la question. Voir
            `ActivityAxesTiles`. */}
        <ActivityAxesTiles
          // ⚠️ LA VOIX EST À LA PAGE, LES SIX OPTIONS SONT AU COMPOSANT. Cette
          // carte est celle du titulaire: « Tes journées », pas « Ses
          // journées ». Les deux `null` sont l'absence d'aide sous la grille —
          // les tuiles portent déjà la leur, et une phrase de plus au-dessus
          // n'y ajoutait rien ici (elle en ajoute sur la fiche d'une bouche,
          // qui doit dire où s'arrête chaque axe).
          dayLabel={t("setup.day_activity.label")}
          sportLabel={t("setup.sport.label")}
          dayHint={null}
          sportHint={null}
          day={draft.dayActivity}
          sport={draft.sportFrequency}
          onDay={(next) => set({ dayActivity: next })}
          onSport={(next) => set({ sportFrequency: next })}
          busy={busy}
          idPrefix="setup-self"
        />
        </>
        ) : props.saved !== null ? (
          <MouthRowSummary
            mouth={props.saved.person}
            target={props.saved.target}
            // ⚠️ LA DATE VIENT D'ICI, PAS D'UNE SECONDE LECTURE. Une bouche a
            // besoin de `loadMemberBirthDates` parce que le roster ne rend
            // jamais sa date; celle du titulaire est dans ses faits. `""` et
            // pas `null`: le contrat de ce résumé réserve `null` à « la
            // lecture n'a pas rendu », et elle a rendu.
            birthDate={props.saved.person.birthDate ?? ""}
            voice="self"
          />
        ) : null}

        {/* ⚠️ LE RÉGIME A DÉMÉNAGÉ À L'ÉTAPE 3 (« comment on mange »), et
            l'ordre d'origine EST CASSÉ PAR CE DÉPLACEMENT. Le commentaire
            d'ici disait: « le régime avant les allergies — l'ordre évite de
            cocher poisson sous allergie quand la vraie réponse est je suis
            végétarien ». Les allergies restent sur CETTE étape, le régime est
            désormais sur la suivante: quelqu'un peut donc déclarer une
            allergie au poisson avant d'avoir pu dire qu'il est végétarien.
            Arbitrage assumé, demandé à l'écran le 2026-08-14 — l'étape 2 dit
            QUI sont les gens, l'étape 3 dit COMMENT ils mangent, et poser la
            même question à deux endroits selon la personne était pire. */}

        {/* ── ⛔ ICI SE TENAIENT LES ALLERGIES, EN LIGNE ────────────────────
            Retirées le 2026-08-18, sur la décision de l'utilisateur: « le
            reste — allergies, habitudes, ce qu'on n'aime pas, le shaker —
            dans une pop-up accessible depuis "Renseigner ses préférences
            alimentaires" ».

            ⚠️ ET IL N'EN RESTE AUCUN AILLEURS SUR CET ÉCRAN. Le formulaire
            d'ajout et chaque ligne de bouche portaient le leur; les trois
            passent par la MÊME fenêtre. Un champ d'allergie resté en ligne
            pendant que la fenêtre en porte un autre, ce sont deux formulaires
            sur la même colonne — le défaut qu'on vient de refermer, pas un
            détail de mise en page.

            ⚠️ CE QUI STRUCTURE LE PLAN RESTE EN LIGNE, ce qui l'affine passe
            derrière le bouton. Une allergie affine: elle écarte des aliments
            d'un plan dont la FORME est déjà décidée par le corps, la direction
            et le rythme — tous au-dessus, sans clic. */}
        {/* ── ⟳ 2026-09-20 · ELLE DISPARAÎT AVEC LES CHAMPS ────────────────
            Elle restait rendue sous le résumé d'une carte repliée, avec son
            récapitulatif — donc trois lignes de plus par personne sur un écran
            replié EXPRÈS pour tenir. Demandé à l'écran: « on peut enlever la
            partie préférences alimentaires qui s'affiche toujours, il faut que
            ce soit hyper simple et clair ».

            ⚠️ CE QUI RENDAIT L'EXCEPTION LÉGITIME A DISPARU AVEC ELLE. La
            porte restait ouverte hors édition parce qu'elle « ne peut rien
            écrire par mégarde »; c'était vrai, mais ça répondait à la question
            du RISQUE, pas à celle de la PLACE. Elle reste la seule porte vers
            les allergies, et « Modifier » la rouvre en un clic. */}
        {/* ⛔ LE GESTE EST RENDU MÊME QUAND LA PORTE NE PEUT PAS L'ÊTRE, et
            c'est pour ça qu'il est dans une variable plutôt que seulement
            dans le `action` ci-dessous. La porte demande une lecture faite
            (`target`); « Enregistrer », lui, ne demande rien. Le plier dans la
            porte le ferait disparaître pendant la fenêtre où la lecture n'a
            pas rendu — un formulaire rempli sans bouton pour l'écrire. */}
        {editing && props.onOpenPreferences !== null && target !== null
          ? (
            <MouthPreferencesButton
              busy={busy}
              onOpen={props.onOpenPreferences}
              voice="self"
              who=""
              action={saveButton}
            />
          )
          : saveButton}


      </div>
    </Card>
  );
}
