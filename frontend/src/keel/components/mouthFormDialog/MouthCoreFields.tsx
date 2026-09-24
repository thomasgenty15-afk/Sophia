// ⟳ 2026-09-24 — SORTI DE `MouthFormDialog.tsx` (découpage, lot 4a), À L'IDENTIQUE.
// Les blocs 1-3 de la fiche, en ligne.
// Le fichier d'origine ré-exporte ce qu'il exportait: aucun appelant ne change
// d'import.

import React from "react";

import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { t } from "../../i18n/t";
import { MEMBER_GENDERS } from "../../api/household";
import GoalTiles from "../GoalTiles";
import type { MemberGender } from "../../api/household";
import { type MouthVoice, voiced, whoOf } from "../../lib/mouthVoice";
import {
  ageStateOfDraft,
  blockList,
  type MouthFormDraft,
  missingRequiredBlocks,
  submitIsHeld,
  foldMinorGoal,
} from "../../lib/mouthForm";
import type { MouthCoreFieldsProps } from "./types.ts";
import { goalLabel } from "./labels.ts";
import { RequiredBlock } from "./blocks.tsx";
import { TargetAndPaceFields } from "./TargetAndPaceFields.tsx";
import { MouthPreferencesButton } from "./MouthPreferencesButton.tsx";
import { MouthActivityAxesFields } from "./ActivityAndAppetiteFields.tsx";

export function MouthCoreFields(
  props: MouthCoreFieldsProps,
): React.ReactElement {
  // LA VOIX, ET CE QUE `{who}` VAUT — voir `lib/mouthVoice.ts`.
  const voice: MouthVoice = props.subject.isSelf ? "self" : "other";
  const who = whoOf(props.draft.firstName, t("household.mouth.who_fallback"));
  const { onChange, subject, todayLocalIso } = props;
  // ── LE BROUILLON PLIÉ À SON ÂGE (chantier P3, 2026-09-03) ───────────────
  // Tout ce que cette fiche LIT passe par le pli — les tuiles, le curseur, ce
  // qui retient le bouton, l'`aria-required` de l'activité; tout ce qu'elle
  // ÉCRIT (`set`) va dans le brouillon BRUT de l'appelant. Le seul lecteur du
  // brouillon brut est `GoalTiles`, qui a besoin de la direction d'origine
  // pour NOMMER celle que le pli a remplacée. Voir `foldMinorGoal`.
  const draft = foldMinorGoal(props.draft, todayLocalIso).draft;
  // ⚠️ MISE À JOUR FONCTIONNELLE. React groupe les mises à jour d'un même tick:
  // deux champs touchés coup sur coup partiraient sinon du MÊME état de départ,
  // et le second effacerait le premier. Mesuré sur `SetupPage` le 2026-08-12.
  const set = (patch: Partial<MouthFormDraft>) =>
    onChange((prev) => ({ ...prev, ...patch }));

  const missing = missingRequiredBlocks(draft);
  const held = submitIsHeld(draft, todayLocalIso);
  const ageState = ageStateOfDraft(draft, todayLocalIso);

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {/* ⛔ LA PHRASE D'INTRODUCTION EST PARTIE (2026-09-09) ─────────────
            « Trois choses dont on a besoin, trois que tu peux sauter… » décrivait
            LE FORMULAIRE au lieu de dire quoi que ce soit de la personne — et ce
            qu'elle promettait est déjà dit par ce que l'écran FAIT: les trois
            blocs qui retiennent le bouton portent leur cadre, et la ligne
            « il manque… » les nomme à côté du geste. Décision de l'utilisateur
            (« ça n'apporte pas de valeur »). La clé `household.mouth.intro` est
            partie des deux packs avec elle.
            ⚠️ CE QUI NE DOIT PAS REVENIR ICI à sa place: une phrase qui dit
            comment la fiche se remplit. Ce qui manque se dit à côté du bouton
            qui le lève, jamais en tête. */}

        {/* ── BLOC 1 · QUI C'EST ─────────────────────────────────────────── */}
        <RequiredBlock
          title={t("household.mouth.identity")}
          hint={t(voiced("household.mouth.identity_hint", voice), { who })}
        >
          <Field
            label={t("setup.people.first_name")}
            hint={t(voiced("setup.mouths.first_name_hint", voice), { who })}
            htmlFor="mouth-first-name"
          >
            <input
              id="mouth-first-name"
              type="text"
              maxLength={40}
              value={draft.firstName}
              onChange={(e) => set({ firstName: e.target.value })}
              className={inputClass}
            />
          </Field>
          {/* ── ⛔ LE `hint` A ÉTÉ RETIRÉ LE 2026-09-20 ──────────────────────
              Il disait: « On ne demande jamais si c'est un adulte ou un
              enfant : la date de naissance le dit. » C'était la réponse à une
              question que personne ne pose — il répondait à un choix de
              CONCEPTION (pourquoi il n'y a pas de case « enfant ») devant
              quelqu'un qui remplit un champ de date. Retiré sur demande, avec
              le reste de ce qui alourdissait cette fiche.

              ⚠️ CE QUE LA PHRASE PROTÉGEAIT TIENT TOUJOURS, ET AILLEURS: la
              règle « on ne demande jamais adulte ou enfant » est écrite dans
              l'en-tête de `lib/mouthForm.ts`, elle est tenue par l'ABSENCE de
              champ `kind` dans le brouillon, et un test refuse son retour.
              C'était une note de conception affichée à l'utilisateur, pas une
              garde. */}
          <Field
            label={t("setup.people.birth_date")}
            htmlFor="mouth-birth-date"
          >
            <input
              id="mouth-birth-date"
              type="date"
              max={todayLocalIso}
              value={draft.birthDate}
              onChange={(e) => set({ birthDate: e.target.value })}
              className={inputClass}
            />
          </Field>
          {/* L'ÉTAT D'ÂGE EST RENDU, JAMAIS DEMANDÉ. Il dit à qui remplit ce
              que le produit a compris — et surtout quand il n'a RIEN compris,
              cas où aucune direction ne s'appliquera. */}
          {draft.birthDate.trim() !== "" && ageState === "unknown" ? (
            <p className="rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              {t("household.mouth.age_unknown")}
            </p>
          ) : null}
        </RequiredBlock>

        {/* ── BLOC 2 · LE CORPS ───────────────────────────────────────────
            ⚠️ IL EST PASSÉ DEVANT LA DIRECTION LE 2026-08-18, SUR UNE MESURE.
            Le curseur de rythme est BORNÉ par ce corps: tant qu'il manque, le
            bloc de la direction ne peut rendre qu'une phrase (`needs_body`) —
            et cette phrase renvoyait vers un bloc situé PLUS BAS dans la même
            fenêtre. Mesuré au navigateur sur la fiche du maître, qui s'ouvre
            avec un corps vide; rapporté par l'utilisateur comme « je ne vois ni
            le poids visé ni le rythme ». La cause du silence n'était pas le
            calcul, c'était l'ordre. Voir `MOUTH_FORM_BLOCKS`. */}
        <RequiredBlock
          title={t(voiced("household.mouth.body", voice), { who })}
          hint={t("household.mouth.body_hint")}
        >
          {/* ── ⟳ TROIS ÉTIQUETTES, PLUS TROIS PLACEHOLDERS — A5, 2026-09-03 ─
              Les trois contrôles n'avaient qu'un `placeholder` (doublé d'un
              `aria-label`), c'est-à-dire un libellé QUI S'EFFACE AU MOMENT OÙ
              ON SAISIT: absent de toute fiche remplie, donc illisible dès
              qu'on relit ce qu'on vient de taper.

              La carte d'ajout de l'entonnoir avait été corrigée le 2026-09-01
              — « chacun des quatre porte enfin une ÉTIQUETTE » — mais cette
              fiche-ci ne l'avait pas suivie, et c'est cette fiche-ci qui reste
              maintenant que l'entonnoir la monte à son tour (A5, unification).
              La correction MONTE dans le composant partagé, elle ne redescend
              pas dans une copie: c'est tout l'objet du lot.

              ⚠️ LES `id` ET LES `aria-label` NE BOUGENT PAS. Le `<label for>`
              s'ajoute par-dessus, il ne remplace rien — les tests qui visent
              `mouth-height` continuent de viser le même contrôle.

              ⚠️ BORNES DE `keel_household_set_member_body` (30–260 cm,
              2–400 kg) et pas celles de `profiles`: une bouche peut être un
              enfant de trois ans, que les bornes adultes refuseraient. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("setup.people.height")} htmlFor="mouth-height">
              <input
                id="mouth-height"
                type="number"
                inputMode="numeric"
                min={30}
                max={260}
                aria-label={t("setup.people.height")}
                value={draft.heightCm}
                onChange={(e) => set({ heightCm: e.target.value })}
                className={`${inputClass} min-w-0`}
              />
            </Field>
            <Field label={t("setup.people.weight")} htmlFor="mouth-weight">
              <input
                id="mouth-weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                min={2}
                max={400}
                aria-label={t("setup.people.weight")}
                value={draft.weightKg}
                onChange={(e) => set({ weightKg: e.target.value })}
                className={`${inputClass} min-w-0`}
              />
            </Field>
            <Field label={t("setup.people.gender")} htmlFor="mouth-gender">
              <select
                id="mouth-gender"
                aria-label={t("setup.people.gender")}
                value={draft.gender}
                onChange={(e) =>
                  set({ gender: e.target.value as MemberGender | "" })}
                className={`${inputClass} min-w-0`}
              >
                <option value="">—</option>
                {MEMBER_GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {t(
                      `household.body.gender_${g}` as "household.body.gender_female",
                    )}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* ── LE TOUT-OU-RIEN DU CORPS, ET IL EST NOMMÉ — A5, 2026-09-03 ───
              ⛔ CETTE LIGNE NOMME UN REFUS DE LA BASE, pas une préférence de
              mise en page. `keel_household_set_member_body` rend
              `body_incomplete` dès qu'un des trois manque, et le moteur SAUTE
              une bouche sans corps — elle reçoit la part de tout le monde, en
              silence. Taille et poids saisis, sexe laissé sur « — », c'est un
              corps qui n'existe nulle part.

              Elle vivait sur la carte d'ajout de l'entonnoir
              (`setup.mouths.body_together`), et cette carte vient d'être
              remplacée par CETTE fiche (A5). Sans ce déménagement, la seule
              phrase du produit qui annonce `body_incomplete` avant le clic
              serait partie avec les champs qu'elle commentait.

              ⛔ NE PAS LA SUPPRIMER PARCE QUE LES TROIS CHAMPS ONT DÉSORMAIS
              DES ÉTIQUETTES. Les étiquettes disent ce QU'EST chaque champ;
              elle seule dit que les trois vont ENSEMBLE. */}
          <p className="-mt-1 text-sm leading-6 text-ink-soft">
            {t("setup.mouths.body_together")}
          </p>

          {/* ── ⛔ ICI SE TENAIENT LES QUATRE CRANS D'ACTIVITÉ ───────────────
              Retirés le 2026-09-06. Ils demandaient en UNE question ce que les
              deux grilles juste en dessous demandent en deux, et l'entonnoir
              avait déjà tranché le 2026-08-19: les quatre crans mélangeaient la
              journée et le sport, donc quelqu'un d'assis qui court deux fois par
              semaine ne pouvait dire que l'un des deux — il cochait « Sport 2 à
              3 fois » et héritait de PAL 1,80 quand le croisement vaut ~1,60.
              **239 kcal/jour fabriqués par la forme de la question.**

              CETTE FICHE-CI N'AVAIT PAS SUIVI, et le lot A5 (2026-09-03) l'a
              montée dans l'étape 2 telle quelle: l'écran posait alors la même
              question DEUX FOIS, dans les deux formes, celle d'avant au-dessus
              de celle d'après.

              ⛔ ET LA QUESTION EN TROP RETENAIT LE BOUTON, pendant que les deux
              qui comptent ne le retenaient pas. `missingRequiredBlocks` exigeait
              `activityLevel` dès que la direction bougeait; `activityFactorOf`,
              lui, JETTE ce cran dès que les deux axes sont remplis (`crossed`
              l'emporte sur `legacy`). On bloquait donc l'inscription sur une
              réponse dont on savait déjà qu'on ne la lirait pas — et si un seul
              axe manquait, c'est le cran qui gagnait, c'est-à-dire très
              exactement le PAL faux que la scission avait retiré.

              ⚠️ LA COLONNE, ELLE, RESTE, ET IL NE FAUT PAS LA VIDER.
              `p_activity_level` est un paramètre REQUIS de la RPC, `legacy` est
              le repli NOMMÉ des fiches qui n'ont répondu qu'à lui, et le
              brouillon continue de le porter d'un bout à l'autre: ce qui a été
              déclaré autrefois est renvoyé tel quel. On a retiré le CONTRÔLE,
              pas la donnée. Son vocabulaire reste lisible dans
              `SetupPage.tsx` (`ACTIVITY_KEYS`), gardé exprès pour ça. */}

        </RequiredBlock>

        {/* ── BLOC 3 · CE QU'ELLE VISE — ET SES DEUX CHAMPS DÉPLIABLES ────
            ⟳ 2026-09-06 — LE TITRE NOMME L'INTENTION, PLUS L'EFFET. Il disait
            « Le sens dans lequel la balance va »: vrai du calcul, faux de la
            question. Voir la note du catalogue, et `setup.people.goal` sur la
            carte du titulaire, qui portait déjà ces mots-là. */}
        <RequiredBlock
          title={t(voiced("household.mouth.direction", voice))}
          hint={t("household.mouth.direction_hint")}
        >
          {/* TROIS CHOIX, PAS SIX — ET UN SEUL POUR UN MINEUR (2026-09-03).
              L'axe qui fait bifurquer un plan est la DIRECTION DE LA BALANCE:
              descend, monte, ne bouge pas. La liste vient de `goalsForAge`,
              dérivée de `GOAL_TOKENS` — une seule liste, six sélecteurs, et un
              test la confronte au CHECK de la base ET à la garde d'âge lue sur
              le disque. Les tuiles sont le MÊME composant que les cinq autres
              sites (`GoalTiles`): aucune pré-sélection, aucune option vide.

              ⚠️ `value` EST LE BROUILLON BRUT, EXPRÈS: c'est la seule lecture
              non pliée de cette fiche, parce que la phrase de bascule doit
              nommer la direction d'ORIGINE. Le pli, lui, est dans `checked`. */}
          <GoalTiles
            name="mouth-goal"
            ariaLabel={t(voiced("household.mouth.direction", voice))}
            value={props.draft.goal}
            ageState={ageState}
            labelOf={goalLabel}
            // CHANGER DE DIRECTION VIDE LA CIBLE ET LE RYTHME. Les deux
            // n'ont de sens que sous la direction qui les a produits, et
            // `household_members_target_needs_direction_check` refuse
            // une cible sur `maintenance`. Les garder en mémoire les
            // ferait repartir au prochain basculement, vers une
            // violation de contrainte.
            onChange={(g) => set({ goal: g, targetWeightKg: "", paceKgPerWeek: "" })}
          />

          {/* ── LES DEUX CHAMPS QUI SE DÉPLIENT ─────────────────────────
              Ils sont un COMPOSANT À PART depuis le 2026-08-18, parce que
              l'entonnoir d'inscription les monte aussi — et qu'une seconde
              copie de ces quatre états divergerait au premier correctif. */}
          <TargetAndPaceFields
            draft={draft}
            onChange={onChange}
            todayLocalIso={todayLocalIso}
            // `mouth` — les `id` d'origine, inchangés: cette fiche est SEULE
            // sur sa page (`/app/household`), et les renommer casserait les
            // tests qui les mesurent sans rien réparer.
            idPrefix="mouth"
            voice={voice}
            who={who}
          />
        </RequiredBlock>

        {/* ── ② LES DEUX AXES — SOUS LA DIRECTION, ET PAS DANS LE CORPS ───
            ⟳ 2026-09-06 · DEMANDÉ À L'ÉCRAN. Ils étaient dans le bloc du corps
            depuis le 2026-08-20, et l'argument était le CALCUL: le corps dit
            combien on pèse, l'activité dit ce qu'on en fait, `meal_envelope.ts`
            multiplie les deux, et l'écart entre les deux extrêmes du croisement
            vaut ~47 % de l'enveloppe. Rien de tout ça n'a bougé — mais ce n'est
            pas l'ordre de la LECTURE.

            La carte du titulaire avait déjà fait ce déplacement le 2026-09-01,
            avec ses mots: « d'abord CE QU'EST ce corps (naissance, sexe, taille,
            poids), ensuite CE QU'IL VISE, ensuite CE QU'IL FAIT de ses
            journées ». Les deux fiches se lisent l'une sous l'autre dans
            l'étape 2 depuis A5; celle-ci suit la même route.

            ⛔ ET ELLES RESTENT EN LIGNE, HORS DES PRÉFÉRENCES. Les ranger
            derrière le bouton en ferait une option, alors qu'elles
            dimensionnent chaque part. Elles sont hors des trois cadres
            obligatoires parce qu'elles ne retiennent rien — et c'est ce que le
            cadre dit.

            ⛔ ① ET ⑤ NE SONT PAS ICI (2026-08-20, soir). Ils décrivent une
            habitude de table, pas un corps: ils vivent dans la fenêtre des
            préférences (`MouthEatingHabitsFields`). */}
        <MouthActivityAxesFields
          voice={voice}
          who={who}
          value={{
            dayActivity: draft.dayActivity,
            sportFrequency: draft.sportFrequency,
            appetite: draft.appetite,
          }}
          onChange={(patch) => set(patch)}
        />

        {/* ── LE BOUTON QUI OUVRE LES PRÉFÉRENCES ─────────────────────────
            Les blocs 4-6 vivent DERRIÈRE lui depuis le 2026-08-18: ils affinent
            un plan, ils ne le structurent pas. Ce qui le précède — qui c'est, où
            va la balance, quel corps — décide de la forme des assiettes, donc
            reste en ligne, sans clic.

            ⚠️ CE QUI A ÉTÉ RENSEIGNÉ DERRIÈRE EST DIT SOUS LE BOUTON. Sans ce
            récapitulatif, fermer la fenêtre se lit comme perdre ce qu'on vient
            de taper: le brouillon le garde, mais l'écran n'en montrait plus
            rien — et « un geste qui ne fait rien est indiscernable d'un geste
            qui a marché » vaut aussi dans l'autre sens. */}
        <MouthPreferencesButton
          busy={props.busy}
          onOpen={props.onOpenPreferences}
          voice={voice}
          who={who}
        />

        {/* ── LE REFUS, PUIS CE QUI RETIENT, PUIS LE GESTE ───────────────── */}
        {props.failure !== null ? (
          <p className="rounded-card border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900">
            {props.failure}
          </p>
        ) : null}
        {/* ⚠️ CE QUI RETIENT LE BOUTON EST NOMMÉ, ET IL EST À CÔTÉ DU BOUTON.
            Un bouton grisé sans phrase est le mode d'échec n°1 de ce dépôt: le
            geste ne fait rien, et rien ne dit ce qui le lèverait. */}
        {missing.length > 0 ? (
          <p className="rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            {t("household.mouth.held", {
              blocks: blockList(
                missing.map((b) =>
                  t(
                    `household.mouth.block_${b}` as "household.mouth.block_identity",
                  )
                ),
              ),
            })}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={props.busy || held}
            onClick={props.onSubmit}
          >
            {subject.existing
              ? t("household.mouth.save")
              : t("household.mouth.add")}
          </Button>
          {/* ⛔ PLUS DE « PLUS TARD » ICI. Cette fiche est EN LIGNE depuis le
              2026-08-18: il n'y a plus de fenêtre à quitter, et un bouton de
              sortie sur une carte de page ne mène nulle part. La sortie qui
              reste est celle de la fenêtre des préférences, chez elle. */}
        </div>
      </div>
    </div>
  );
}
