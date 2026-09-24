// ⟳ 2026-09-24 — SORTI DE `SetupPage.tsx` (découpage, lot 4b), À L'IDENTIQUE.
// L'étape 3 (qui n'est plus montée, gardée pour son harnais) et ses cartes:
// une personne à table, sa ligne libre, le champ de la ligne.
// Le fichier d'origine l'importe; il ré-exporte ce qu'il exportait.

import React from "react";
import { Button } from "../../components/ui/Button";
import { Card, SectionLabel } from "../../components/ui/Card";
import { Field, inputClass } from "../../components/ui/Field";
import {
  EATING_OCCASIONS,
  type EatingOccasion,
  MEAL_SIZES,
  type MealSize,
  type EatingOccasionSlot,
} from "../../api/mealGeneration";
import {
  DIET_ANSWERS,
  type DietAnswer,
  type FunnelMissId,
  type FunnelMouth,
  type FunnelPlanAnswers,
} from "../../api/onboarding";
import { t } from "../../i18n/t";
import { DRAFT_NOTE_MAX_CHARS, type MemberHabitsView } from "../../api/householdHabits";
import { occasionLabel } from "./labels.ts";

// ───────────────────────────────────────────────────────────────────────────
// ÉTAPE 3
// ───────────────────────────────────────────────────────────────────────────

/**
 * ÉTAPE 3 — LA TABLE: UNE CARTE PAR PERSONNE, LE TITULAIRE COMPRIS.
 *
 * ── CE QUE CETTE ÉTAPE EXISTE POUR RENDRE POSSIBLE ────────────────────────
 * Le rythme était UNE valeur pour toute la maison, et l'écran l'assumait:
 * « demandé une fois, pour toute la maison — ça appartient à qui cuisine ».
 * C'était vrai du code et faux de la vie: un ado qui saute le petit-déjeuner et
 * un petit qui goûte à 16 h ne mangent pas aux mêmes moments.
 *
 * ── LA REFONTE DU 2026-08-14, ET ELLE A ÉTÉ DEMANDÉE QUATRE FOIS ──────────
 * L'étape portait DEUX cadres qui ne se ressemblaient pas: en tête, le régime
 * du titulaire et « les moments de LA MAISON »; en dessous, une carte par autre
 * bouche, avec ses moments, son régime, et un dépliant « ce qu'elle mange
 * d'habitude ». Le titulaire n'avait donc ni ses moments à lui (les siens
 * s'appelaient « la maison »), ni sa ligne de préférences; et les autres
 * n'avaient pas la même carte que lui. Ses mots: « c'est la même disposition
 * pour le maître et les autres personnes du foyer, il y a aucune information
 * différente. »
 *
 * Il n'y a donc plus qu'UN composant, `PersonTableCard`, monté une fois par
 * bouche, avec TROIS blocs dans le MÊME ordre pour tout le monde:
 *
 *   1. LE RÉGIME — les quatre réponses de `DIET_ANSWERS`.
 *   2. LES MOMENTS, AVEC LEUR TAILLE — `MEAL_SIZES` sur chaque moment coché.
 *   3. UNE LIGNE LIBRE — ce que cette personne mange d'habitude, en toutes
 *      lettres.
 *
 * ⚠️ LE MAÎTRE EST UNE LIGNE `household_members` COMME LES AUTRES, et c'est ce
 * qui rend cette uniformité possible sans inventer un second modèle. Ce qui
 * DIFFÈRE est le chemin d'écriture, pas la carte, et c'est la base qui le
 * décide (D1: « pour une bouche avec compte, son about-you fait autorité »):
 *
 *   · le régime et les moments d'un COMPTE vivent dans son « about you »
 *     (`student_safety_constraints` + `practical_constraints`), et les deux RPC
 *     par-bouche refusent `has_account` — la carte du maître écrit donc par
 *     `saveOwnDiet` / `savePlanAnswers`, au « Continuer », comme avant;
 *   · une bouche SANS compte écrit sur sa ligne, tout de suite, par
 *     `keel_household_set_member_diet` et `keel_household_set_member_rhythm`;
 *   · la LIGNE LIBRE, elle, passe par la MÊME RPC pour tout le monde
 *     (`keel_household_set_member_habits`, qui n'a pas de refus `has_account`
 *     — une habitude n'a pas de second domicile).
 *
 * Le roster tranche ensuite, une fois, pour tout le monde: l'écran ne refait
 * jamais cette résolution.
 *
 * ── CE QUI A ÉTÉ RETIRÉ, ET POURQUOI ─────────────────────────────────────
 * `HouseholdHabitsCard` ne vit plus ici. Elle portait un titre (« Ce qu'elle
 * mange d'habitude »), un dépliant « Fermer », un couple de boutons radio par
 * moment, et la phrase « Aucun moment de repas n'est encore posé pour cette
 * personne » quand le rythme était vide — c'est-à-dire, sur un entonnoir où le
 * rythme se coche À CÔTÉ, un cadre qui demandait d'aller cocher ailleurs avant
 * de pouvoir répondre. La zone de texte libre la remplace, sur la même table et
 * la même RPC: `household_member_habits.note` n'est pas perdue, elle est ce que
 * le champ affiche et réécrit. La carte complète reste sur `/app/household`,
 * qui est le bon endroit pour la RELIRE.
 *
 * ⚠️ ET LES `slots` DÉJÀ SAISIS SONT REPASSÉS TELS QUELS. La RPC REMPLACE la
 * ligne entière: enregistrer la note avec `[]` effacerait en silence les
 * habitudes par moment posées sur `/app/household`. L'écran renvoie donc ce
 * qu'il a lu.
 *
 * ⚠️ RIEN N'EST PRÉ-COCHÉ, NULLE PART. Ni le régime (`null` ≠ « mange de
 * tout »), ni les moments d'une bouche (`null` = « aux moments de la maison »),
 * ni la taille (`null` = « il n'a pas dit »). « Coche automatique = faits faux
 * indémentables » est une cicatrice de ce dépôt, et sur une question de régime
 * c'est une question de sécurité.
 *
 * ⚠️ AUCUN DÉCOMPTE de qui a rempli quoi. Pas de pastille « à compléter », pas
 * de total. « 2 personnes n'ont rien dit » se lit « il en reste 2 à relancer »,
 * et c'est la corvée que ce produit promet de supprimer (FF-050 §1).
 */
/**
 * ⚠️ EXPORTÉ POUR ÊTRE RENDU, comme `MouthsStep` — voir
 * `pages/setupTableStepTarget.int.test.ts`. Ce qui doit être prouvé est que
 * l'étape 3 PORTE le poids visé et le curseur de rythme, et un test de source
 * dirait la même chose sur du texte.
 */
export function TableStep({
  draft,
  onChange,
  mouths,
  onMouthRhythm,
  onMouthDiet,
  busy,
  missing,
  selfDiet,
  onSelfDiet,
  selfFirstName,
  selfMemberId,
  habits,
  onSaveNote,
}: {
  draft: FunnelPlanAnswers;
  onChange: React.Dispatch<React.SetStateAction<FunnelPlanAnswers | null>>;
  mouths: readonly FunnelMouth[];
  onMouthRhythm: (mouth: FunnelMouth, rhythm: readonly EatingOccasionSlot[]) => void;
  /** Le régime d'une bouche. Re-cliquer la réponse posée l'efface. */
  onMouthDiet: (mouth: FunnelMouth, diet: DietAnswer) => void;
  busy: boolean;
  missing: readonly FunnelMissId[];
  /** Le régime du maître — REQUIS, `""` = pas encore répondu. */
  selfDiet: DietAnswer | "";
  onSelfDiet: (diet: DietAnswer) => void;
  selfFirstName: string;
  /**
   * MA LIGNE DE FOYER — `null` quand il n'y a pas de foyer du tout (le compte
   * solo). C'est la SEULE différence de carte qui subsiste, et elle n'est pas
   * une différence entre les gens: `household_member_habits` est clée sur un
   * `member_id`, donc un compte sans foyer n'a nulle part où ranger sa ligne
   * libre. Il n'y a alors qu'UNE carte à l'écran, donc rien à côté de quoi
   * elle pourrait paraître amputée.
   */
  selfMemberId: string | null;
  /** `null` = la lecture n'a pas eu lieu. La carte s'en sert comme garde. */
  habits: Map<string, MemberHabitsView> | null;
  onSaveNote: (memberId: string, note: string | null) => Promise<boolean>;
  /*
   * ⛔ PAS DE `selfTarget` ICI, ET C'EST UNE CORRECTION DE PLACEMENT.
   *
   * Le poids visé et le curseur de rythme ont été montés sur cette étape le
   * 2026-08-18, sur une lecture trop littérale de « dans le cadre de l'étape
   * 3 ». L'utilisateur a mesuré le résultat le jour même: il choisit « Perdre
   * du poids » à l'étape 2 et RIEN n'apparaît — les deux champs vivaient deux
   * écrans plus loin, sur la carte du planning, sous une question à laquelle il
   * n'était pas encore arrivé. Ils sont désormais sous la direction qui les
   * débloque (`SelfStep`), et leur écrivain avec eux (`saveSelf`).
   *
   * ⛔ NE PAS LES REMETTRE ICI. Cette étape dit QUAND et COMMENT on mange; où
   * va la balance est une question de personne, pas de planning.
   */
}) {
  /**
   * LE REFUS DES MOMENTS TOMBE SUR LA CARTE DU TITULAIRE, ET C'EST EXACT.
   *
   * `eating_rhythm` (`wrong`) porte sur `practical_constraints`, c'est-à-dire
   * sur SA ligne à lui — celle qui dimensionne la grille du plan, et sur
   * laquelle les autres bouches se replient quand elles n'ont rien dit. Le
   * poser sur le champ qui le lève est la règle de cet écran: un motif affiché
   * ailleurs que sur son contrôle est une trace, pas un message.
   */
  const rhythmError = missing.includes("eating_rhythm")
    ? t("setup.missing.eating_rhythm")
    : undefined;

  /**
   * ⚠️ LE RÉGIME RETENAIT L'ÉTAPE SANS QUE RIEN NE LE DISE, ET C'EST LE PIRE
   * DES DEUX MONDES: un bouton principal qui ne fait RIEN.
   *
   * L'étape 3 ne retient que sur deux motifs — `eating_rhythm` et `own_diet`.
   * Le premier avait son message sur son champ; le second était calculé,
   * transmis à ce composant dans `missing`… et jamais lu. Quelqu'un qui avait
   * coché ses moments mais pas répondu au régime appuyait sur « Continuer »,
   * l'écran ne bougeait pas, et AUCUN mot n'apparaissait nulle part.
   *
   * Mesuré le 2026-08-15 sur un compte réel (`tho@gmail.com`):
   * `practical_constraints` portait `eating_rhythm`, pas `diet`.
   *
   * ⚠️ SEULEMENT SUR LA CARTE DU TITULAIRE. `own_diet` est le motif de SON
   * régime; les autres bouches ne retiennent l'étape sur rien (leur régime est
   * un `better`), donc leur poser un message rouge accuserait quelqu'un qui n'a
   * rien à corriger — la faute exacte que `rhythmError` évite déjà.
   */
  const dietError = missing.includes("own_diet")
    ? t("setup.missing.own_diet")
    : undefined;

  return (
    <Card>
      <SectionLabel>{t("setup.table.title")}</SectionLabel>
      <p className="mt-2 text-sm text-ink-soft">{t("setup.table.intro")}</p>

      <ul className="mt-4 space-y-4">
        {/* ── LE TITULAIRE, PREMIER ET PAREIL ─────────────────────────────
            Premier parce que c'est lui qui remplit, et que sa carte donne la
            forme de toutes les autres. Pareil parce que c'est exactement ce
            qui a été demandé. */}
        <li className="rounded-card border border-line-strong bg-fig-50/40 p-4">
          <PersonTableCard
            firstName={selfFirstName}
            memberId={selfMemberId}
            diet={selfDiet === "" ? null : selfDiet}
            onDiet={onSelfDiet}
            rhythm={draft.eatingRhythm}
            onRhythm={(next) =>
              onChange((prev) => (prev === null ? prev : { ...prev, eatingRhythm: next }))}
            rhythmError={rhythmError}
            dietError={dietError}
            fallsBackToHouse={false}
            readOnly={false}
            busy={busy}
            habits={habits}
            onSaveNote={onSaveNote}
          />
        </li>

        {mouths.map((m) => (
          <li
            key={m.memberId ?? m.firstName}
            className="rounded-card border border-line-strong bg-fig-50/40 p-4"
          >
            <PersonTableCard
              firstName={m.firstName}
              memberId={m.memberId}
              diet={m.diet}
              onDiet={(diet) => onMouthDiet(m, diet)}
              rhythm={m.eatingSlots ?? []}
              onRhythm={(next) => onMouthRhythm(m, next)}
              rhythmError={undefined}
              // Le régime d'une autre bouche ne retient l'étape sur rien.
              dietError={undefined}
              // `null` = personne ne l'a dit ⇒ elle mange aux moments de la
              // maison. On le DIT sous la rangée décochée plutôt que de
              // pré-cocher les moments du foyer sur sa ligne.
              fallsBackToHouse={m.eatingSlots === null}
              // ── UNE BOUCHE QUI A UN COMPTE N'EST PAS ÉDITABLE ICI ───────
              // La base refuse (`has_account`) sur le régime comme sur les
              // moments: ils vivent dans SON « about you ». On garde les trois
              // mêmes blocs, dans le même ordre, en lecture — « il n'y a rien
              // ici » et « ça se règle ailleurs » ne sont pas la même phrase.
              // Sa ligne libre, elle, reste écrivable: la RPC des habitudes n'a
              // pas de refus `has_account`, une habitude n'a pas de second
              // domicile.
              readOnly={m.claimed}
              busy={busy}
              habits={habits}
              onSaveNote={onSaveNote}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * UNE PERSONNE À TABLE — LA MÊME CARTE POUR TOUT LE MONDE.
 *
 * Trois blocs, toujours dans cet ordre: le régime, puis les moments avec leur
 * taille, puis la ligne libre. L'ordre n'est pas un goût — c'est celui de ce
 * qui ÉCARTE le plus: un régime rend un plat entier inexécutable, un moment
 * absent en rend un de trop, une préférence rend le plat moins juste.
 */
function PersonTableCard({
  firstName,
  memberId,
  diet,
  onDiet,
  rhythm,
  onRhythm,
  rhythmError,
  dietError,
  fallsBackToHouse,
  readOnly,
  busy,
  habits,
  onSaveNote,
}: {
  firstName: string;
  memberId: string | null;
  /** `null` = personne n'a demandé. JAMAIS rendu comme « mange de tout ». */
  diet: DietAnswer | null;
  onDiet: (diet: DietAnswer) => void;
  rhythm: readonly EatingOccasionSlot[];
  onRhythm: (next: readonly EatingOccasionSlot[]) => void;
  /** Le motif de l'étape, rendu SUR le champ qui le lève. */
  rhythmError: string | undefined;
  /** Idem pour le régime. `undefined` sur toute carte qui ne retient rien. */
  dietError: string | undefined;
  fallsBackToHouse: boolean;
  readOnly: boolean;
  busy: boolean;
  habits: Map<string, MemberHabitsView> | null;
  onSaveNote: (memberId: string, note: string | null) => Promise<boolean>;
  /* ⛔ AUCUNE CIBLE SUR CETTE CARTE — voir `TableStep` juste au-dessus. */
}) {
  const picked = new Map(rhythm.map((o) => [o.slot, o.size]));

  /**
   * COCHER / DÉCOCHER UN MOMENT — et l'ordre de sortie est celui de LA JOURNÉE.
   *
   * ⚠️ DÉCOCHER EMPORTE LA TAILLE, ET C'EST VOULU. On pourrait garder la taille
   * de côté pour la restituer si on recoche (c'est ce que fait
   * `EatingRhythmCard`, qui a un brouillon local et un bouton « Enregistrer »).
   * Ici, chaque clic EST l'écriture: garder une taille qu'aucun contrôle
   * n'affiche plus, pour la réécrire plus tard sur la ligne de quelqu'un, c'est
   * exactement le fait indémentable qu'on refuse partout ailleurs. Ce qui est à
   * l'écran est ce qui sera écrit.
   */
  const toggleSlot = (slot: EatingOccasion) => {
    const next = new Map(picked);
    if (next.has(slot)) next.delete(slot);
    else next.set(slot, null);
    onRhythm(
      EATING_OCCASIONS.filter((s) => next.has(s)).map((s) => ({
        slot: s,
        size: next.get(s) ?? null,
      })),
    );
  };

  /** Re-cliquer la taille active la retire: « il n'a pas dit » reste joignable. */
  const setSize = (slot: EatingOccasion, size: MealSize) => {
    const next = new Map(picked);
    next.set(slot, next.get(slot) === size ? null : size);
    onRhythm(
      EATING_OCCASIONS.filter((s) => next.has(s)).map((s) => ({
        slot: s,
        size: next.get(s) ?? null,
      })),
    );
  };

  return (
    <>
      <span className="text-base font-semibold text-ink">{firstName || "—"}</span>

      {/* ── ① LE RÉGIME ────────────────────────────────────────────────────
          RIEN N'EST PRÉ-ALLUMÉ. `null` veut dire « on n'a pas demandé », et
          c'est distinct d'« elle mange de tout »: allumer `omnivore` par défaut
          écrirait à l'écran une réponse que personne n'a donnée — et sur une
          question de sécurité alimentaire, ces deux-là ne sont pas la même
          chose.

          MÊMES BOUTONS, MÊME LISTE, MÊMES MOTS pour tout le monde
          (`DIET_ANSWERS` + `setup.people.diet_*`): deux jeux de libellés
          divergeraient, et l'écran offrirait à l'un une case que le moteur
          n'honore pas chez l'autre. */}
      <div className="mt-3">
        <Field
          label={t("setup.table.diet_label")}
          hint={t("setup.table.diet_hint")}
          error={dietError}
        >
          <div className="flex flex-wrap gap-2">
            {DIET_ANSWERS.map((answer) => (
              <Button
                key={answer}
                size="sm"
                variant={diet === answer ? "primary" : "secondary"}
                disabled={busy || readOnly}
                onClick={() => onDiet(answer)}
              >
                {t(`setup.people.diet_${answer}` as "setup.people.diet_omnivore")}
              </Button>
            ))}
          </div>
        </Field>
      </div>

      {/* ── ② LES MOMENTS, AVEC LEUR TAILLE ────────────────────────────────
          LA TAILLE N'APPARAÎT QUE SUR UN MOMENT COCHÉ: une taille à côté d'un
          moment qu'on ne prend pas est une question sans objet, et six d'entre
          elles font une carte illisible. Même règle et même vocabulaire que
          `EatingRhythmCard`, qui posait la même question dans « À propos de
          toi » — ⟳ SUPPRIMÉE LE 2026-09-19 (« on ne pose plus jamais ces
          questions »): ce bloc-ci est donc le DERNIER endroit du produit où
          une taille de part se règle, et il n'est lui-même pas monté
          (`TableStep` n'a plus d'appelant). Même `MEAL_SIZES`, parce que la
          base refuse un quatrième jeton (`bad_rhythm`) et que le moteur ne
          saurait pas le lire. */}
      <div className="mt-3">
        <Field
          label={t("setup.table.moments_label")}
          hint={t("setup.table.moments_hint")}
          error={rhythmError}
        >
          <ul className="space-y-2">
            {EATING_OCCASIONS.map((slot) => {
              const on = picked.has(slot);
              // ⛔ EMPILÉ, ET PAS UNE LIGNE — C'EST UNE MESURE, PAS UN GOÛT.
              // `EatingRhythmCard` (supprimée le 2026-09-19) mettait le moment
              // et sa taille côte à côte; elle vivait dans une carte de premier
              // niveau. Ici la rangée est au fond
              // de trois cadres (`Card`, la fiche de la personne `p-4`, la
              // rangée `px-3`): mesuré au navigateur à 320 px, « Gros » sortait
              // du cadre par la droite. Empilés, ils tiennent à toute largeur et
              // l'ordre de lecture reste celui de la décision — je mange à ce
              // moment, puis c'est gros.
              return (
                <li
                  key={slot}
                  className={`rounded-card border px-3 py-2 ${
                    on ? "border-ink bg-fig-50" : "border-line"
                  }`}
                >
                  {/* `accent-ink`, ET CE N'EST PAS DÉCORATIF: sans lui, une case
                      cochée prend la couleur d'accent du SYSTÈME — bleue sur
                      les réglages par défaut de macOS et de Windows. */}
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-ink"
                      checked={on}
                      disabled={busy || readOnly}
                      onChange={() => toggleSlot(slot)}
                    />
                    <span className="text-sm font-medium text-ink">
                      {occasionLabel(slot)}
                    </span>
                  </label>
                  {on ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ink-soft">
                        {t("meals.rhythm.size_label")}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {MEAL_SIZES.map((size) => {
                          const active = picked.get(slot) === size;
                          return (
                            <button
                              key={size}
                              type="button"
                              aria-pressed={active}
                              disabled={busy || readOnly}
                              onClick={() => setSize(slot, size)}
                              // MÊME VOCABULAIRE QUE `EatingRhythmCard`: une
                              // valeur retenue est un fait saisi, donc l'encre
                              // pleine et jamais la marque. `line-strong`
                              // (3,84:1) sur l'inactive parce que c'est la
                              // bordure d'un CONTRÔLE (WCAG 1.4.11).
                              className={`rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
                                active
                                  ? "border-ink bg-ink text-paper"
                                  : "border-line-strong text-ink hover:bg-fig-50"
                              }`}
                            >
                              {t(`setup.table.size_${size}` as "setup.table.size_small")}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Field>
        {fallsBackToHouse ? (
          <p className="mt-2 text-xs text-ink-soft">{t("setup.table.same_as_house")}</p>
        ) : null}
        {readOnly ? (
          <p className="mt-2 text-xs text-ink-soft">{t("setup.table.from_profile")}</p>
        ) : null}
      </div>

      {/* ── ③ LA LIGNE LIBRE ───────────────────────────────────────────────
          Ce que cette personne mange VRAIMENT, en toutes lettres: « le matin je
          mange des fruits, une pizza le vendredi soir ». Les deux blocs
          au-dessus disent ce qu'on ne franchit pas et QUAND on mange; celui-ci
          dit ce qu'il y a dans l'assiette quand ce n'est pas le plat de la
          maison.

          ⚠️ SANS FOYER, PAS DE LIGNE — et on n'affiche donc pas le champ.
          `household_member_habits` est clée sur un `member_id`: rendre un
          champ qui ne peut pas s'enregistrer serait pire que son absence,
          parce qu'il promet. */}
      {memberId !== null ? (
        <div className="mt-3">
          <PersonNoteField
            memberId={memberId}
            habits={habits}
            busy={busy}
            onSave={onSaveNote}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * LA LIGNE LIBRE D'UNE PERSONNE — et sa garde de chargement.
 *
 * ⚠️ LE CHAMP N'EXISTE PAS AVANT LA LECTURE, et c'est la seule forme qui
 * tienne: le `useState` ci-dessous est initialisé depuis ce qui a été LU, et il
 * ne s'initialise qu'une fois. Un formulaire figé au montage sur du vide
 * affiche ce vide, puis l'ÉCRASE au premier Save — cicatrice
 * `mount-snapshot-forms-need-a-loading-gate`. `habits === null` veut dire « la
 * lecture n'a pas eu lieu »; une Map vide veut dire « lu, personne n'a rien
 * dit », et ce sont deux états différents.
 */
function PersonNoteField({
  memberId,
  habits,
  busy,
  onSave,
}: {
  memberId: string;
  habits: Map<string, MemberHabitsView> | null;
  busy: boolean;
  onSave: (memberId: string, note: string | null) => Promise<boolean>;
}) {
  if (habits === null) {
    return (
      <Field label={t("setup.table.note_label")} hint={t("setup.table.note_hint")}>
        <p className="text-sm text-ink-soft">{t("household.habits.loading")}</p>
      </Field>
    );
  }
  return (
    <NoteEditor
      // LA SIGNATURE DE CE QUI A ÉTÉ LU. Un rafraîchissement qui rapporte autre
      // chose que ce qu'on a tapé REMONTE le champ: c'est la vérité du serveur
      // qui gagne, et elle s'affiche au lieu de rester cachée sous un brouillon.
      // Une lecture identique ne change pas la clé, donc la saisie en cours
      // survit à un rafraîchissement de fond.
      key={`${memberId}:${habits.get(memberId)?.note ?? ""}`}
      note={habits.get(memberId)?.note ?? ""}
      busy={busy}
      onSave={(note) => onSave(memberId, note)}
    />
  );
}

/** Le champ lui-même — monté SEULEMENT une fois la lecture faite. */
function NoteEditor({
  note: initial,
  busy,
  onSave,
}: {
  note: string;
  busy: boolean;
  onSave: (note: string | null) => Promise<boolean>;
}) {
  const [note, setNote] = React.useState(initial);
  const [saved, setSaved] = React.useState(false);

  return (
    <Field label={t("setup.table.note_label")} hint={t("setup.table.note_hint")}>
      {/* `break-words` NON: c'est un `textarea`, il enroule tout seul. Le
          `maxLength` est celui du SERVEUR, importé (`DRAFT_NOTE_MAX_CHARS`):
          une seconde constante ici divergerait au premier ajustement, et
          l'écran aurait tort contre la base — donc un refus que personne ne
          peut anticiper. */}
      <textarea
        className={inputClass}
        rows={3}
        maxLength={DRAFT_NOTE_MAX_CHARS}
        placeholder={t("setup.table.note_placeholder")}
        value={note}
        disabled={busy}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={async () => {
            // `null` EFFACE, la chaîne vide n'est pas exprimable: la base
            // refuse le vide (`bad_note`, 1..280), et « j'ai effacé ce que
            // j'avais écrit » arrive donc comme `null`. Même forme que
            // `setMemberRhythm` avec son `empty_rhythm`.
            const ok = await onSave(note.trim() || null);
            if (ok) setSaved(true);
          }}
        >
          {t("household.habits.save")}
        </Button>
        {saved ? (
          <span className="text-xs text-emerald-700">{t("household.habits.saved")}</span>
        ) : null}
      </div>
    </Field>
  );
}
