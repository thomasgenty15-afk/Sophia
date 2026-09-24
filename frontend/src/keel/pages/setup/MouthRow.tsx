// ⟳ 2026-09-24 — SORTI DE `SetupPage.tsx` (découpage, lot 4b), À L'IDENTIQUE.
// La ligne d'une bouche inscrite, et sa fiche dans le vocabulaire de
// `MouthFormDraft` (`mouthDraftFromRow`).
// Le fichier d'origine l'importe; il ré-exporte ce qu'il exportait.

import React from "react";
import { Button } from "../../components/ui/Button";
import { Field, inputClass } from "../../components/ui/Field";
import type {
  DayActivityLevel,
  SportFrequency,
  ActivityLevel,
} from "../../../../../supabase/functions/_shared/keel/tokens.ts";
import {
  MEMBER_GENDERS,
  type MemberGender,
  goalForAge,
  type MemberGoal,
} from "../../api/household";
import GoalTiles from "../../components/GoalTiles";
import ActivityAxesTiles from "../../components/ActivityAxesTiles";
import { BIRTH_DATE_ON_FILE, type FunnelMouth } from "../../api/onboarding";
import { MouthPreferencesButton, TargetAndPaceFields } from "../../components/MouthFormDialog";
import { emptyMouthDraft as emptyMouthFormDraft, type MouthFormDraft } from "../../lib/mouthForm";
import type { MemberTargetView } from "../../api/mouthProfile";
import { funnelMouthAgeState } from "../../lib/mouthCardTarget";
import { browserLocalDate } from "../../lib/useMealTicks";
import { t } from "../../i18n/t";
import { goalLabel } from "./labels.ts";
import { MouthRowSummary } from "./MouthRowSummary.tsx";

/**
 * LA FICHE D'UNE BOUCHE INSCRITE, DANS LE VOCABULAIRE DE `MouthFormDraft`.
 *
 * ⚠️ ELLE PORTE LE CORPS ET L'ÂGE, PAS SEULEMENT LES DEUX NOMBRES DE LA CIBLE,
 * et ce n'est pas du zèle: `paceControlFor` borne le curseur SUR CE CORPS-LÀ.
 * Un brouillon réduit à `{goal, targetWeightKg}` proposerait un rythme calculé
 * sur un corps inexistant — c'est-à-dire un nombre inventé qui entrerait dans
 * un calcul d'énergie avec l'autorité d'une mesure.
 *
 * ⚠️ LA DATE DE NAISSANCE NE TRAVERSE PAS, ET LE ROSTER EN EST LA CAUSE: il ne
 * rend JAMAIS la date d'une bouche (le foyer doit savoir qu'il y a un enfant à
 * table, pas son âge). `BIRTH_DATE_ON_FILE` est une MARQUE de présence, pas une
 * date — la laisser passer ferait calculer un âge sur une chaîne sentinelle.
 * Une bouche dont l'âge n'est pas lisible ici reçoit donc le plancher adulte,
 * qui est le comportement documenté de `targetWeightStateFor` sans date.
 */
function mouthDraftFromRow(
  m: FunnelMouth,
  target: MemberTargetView | null,
): MouthFormDraft {
  return {
    ...emptyMouthFormDraft(),
    firstName: m.firstName,
    goal: m.goal ?? "",
    heightCm: m.heightCm === null ? "" : String(m.heightCm),
    weightKg: m.weightKg === null ? "" : String(m.weightKg),
    gender: m.gender ?? "",
    activityLevel: m.activityLevel ?? "",
    targetWeightKg: target?.targetWeightKg == null
      ? ""
      : String(target.targetWeightKg),
    paceKgPerWeek: target?.paceKgPerWeek == null
      ? ""
      : String(target.paceKgPerWeek),
  };
}

export function MouthRow(props: {
  mouth: FunnelMouth;
  onGoal: (goal: MemberGoal) => void;
  onBirthDate: (date: string) => void;
  onAllergyAnswer: (labels: string[]) => void;
  /* ⛔ ICI VIVAIT `prefsDraft` — le brouillon de préférences de cette ligne.
     Son SEUL lecteur était le récapitulatif sous la porte, retiré le
     2026-09-20. Une prop qu'on calcule pour personne est la première qu'on
     oublie de mettre à jour, et elle traînait derrière elle toute une
     lecture (`knownPrefs`). Les deux partent ensemble. */
  onOpenPreferences: () => void;
  onSavePreferences: () => void;
  onBody: (
    heightCm: string,
    weightKg: string,
    gender: MemberGender | "",
    activityLevel: ActivityLevel | null,
    // ② Les deux axes voyagent avec le corps: une seule porte, un seul geste.
    dayActivity: DayActivityLevel | null,
    sportFrequency: SportFrequency | null,
  ) => void;
  onRemove: () => void;
  confirmRemove: boolean;
  onConfirmRemove: () => void;
  /**
   * CETTE CARTE EST-ELLE EN ÉDITION ? REQUIS — jamais optionnel.
   *
   * ── LE DÉFAUT QUE CE MODE FERME ─────────────────────────────────────────
   * La carte d'une personne inscrite était un formulaire OUVERT en permanence:
   * dix contrôles qui écrivent en base au moindre clic, empilés sous chaque
   * prénom. Trois personnes, trente contrôles armés — et rien pour dire lequel
   * on est en train de changer. Demandé le 2026-08-19: « si on clique pas sur
   * modifier on peut rien modifier (à part "renseigner ses préférences
   * alimentaires") ».
   *
   * ⚠️ LA FENÊTRE DES PRÉFÉRENCES RESTE OUVERTE HORS ÉDITION, et c'est une
   * exception NOMMÉE, pas un oubli: elle a son propre bouton d'enregistrement,
   * donc elle ne peut rien écrire par mégarde.
   */
  editing: boolean;
  onToggleEdit: () => void;
  /** Écrit ce qui est prêt — appelé à la SORTIE d'un champ, pas par un bouton. */
  onSaveAndClose: (fields: {
    birthDate: string;
    heightCm: string;
    weightKg: string;
    gender: MemberGender | "";
    activityLevel: ActivityLevel | null;
  /**
   * ② LES DEUX AXES (2026-08-20). `null` = pas répondu — le cran ci-dessus
   * reste alors le repli nommé, et il rend le nombre d'avant.
   */
  dayActivity: DayActivityLevel | null;
  sportFrequency: SportFrequency | null;
    targetWeightKg: string;
    paceKgPerWeek: string;
  }) => void;
  /**
   * SA CIBLE ET SON RYTHME, TELS QU'ILS SONT EN BASE — `null` = pas encore lu.
   *
   * ⛔ LA GARDE DE LECTURE EST OBLIGATOIRE ICI, et elle ne protège pas un
   * affichage: `keel_household_set_member_target` REMPLACE la paire. Un
   * formulaire monté sur du vide non lu EFFACERAIT la cible déjà posée au
   * premier enregistrement. Voir `loadMemberTargets`.
   */
  target: MemberTargetView | null;
  /**
   * SA DATE DE NAISSANCE — `""` quand il n'y en a pas, `null` quand la lecture
   * n'a pas eu lieu. REQUIS, et les deux cas sont distincts: sur `null` on ne
   * sème rien plutôt que d'écrire un vide par-dessus une date en base.
   */
  birthDate: string | null;
  onTarget: (targetWeightKg: string, paceKgPerWeek: string) => void;
  // ⛔ LES SIX PROPS D'INVITATION SONT PARTIES AVEC LEUR PANNEAU (2026-09-20).
  // Voir la pierre tombale en bas de ce composant.
  busy: boolean;
}) {
  const m = props.mouth;
  /**
   * LA DATE AFFICHÉE — SEMÉE DEPUIS LA BASE DEPUIS LE 2026-08-19.
   *
   * Elle partait vide, et le champ restait vide même sur une date enregistrée:
   * « autant l'afficher — parce que quand je déplie, elle ne s'affiche pas non
   * plus ». La cause n'était pas ici, elle était en base — le roster ne rend
   * jamais la date d'une bouche. Une porte scopée au maître la rend maintenant
   * (`keel_household_member_birth_date_for_owner`).
   */
  const [date, setDate] = React.useState(props.birthDate ?? "");
  // ⚠️ UN `useState`, PAS UN `useRef`. C'est le motif « ajuster l'état pendant
  // le rendu »: la clé de semence doit elle-même être un état, sinon elle ne
  // participe pas au rendu qui la compare (`react-hooks/refs`).
  const [dateSeededFrom, setDateSeededFrom] = React.useState(props.birthDate);
  if (dateSeededFrom !== props.birthDate) {
    setDateSeededFrom(props.birthDate);
    setDate(props.birthDate ?? "");
  }
  // ── ⛔ SEMÉS DEPUIS LA BASE, ET C'EST LA MOITIÉ QUI MANQUAIT ─────────────
  // Ces trois champs partaient VIDES, et le bloc qui les portait ne se rendait
  // que si le corps était INCONNU. Conséquence, signalée le 2026-08-19 sur la
  // capture d'une carte en édition: « on n'a pas accès à date de naissance,
  // poids etc. » — une fois le corps saisi, plus aucun écran de l'entonnoir ne
  // permettait de le CORRIGER. Une faute de frappe sur un poids était
  // définitive.
  //
  // ⚠️ ET LA SEMENCE EST OBLIGATOIRE POUR OUVRIR LE BLOC:
  // `keel_household_set_member_body` est tout-ou-rien. Rendre les champs vides
  // sur un corps connu ferait qu'un « Enregistrer » les repose à vide — la
  // cicatrice `mount-snapshot-forms-need-a-loading-gate`, prise par le bout qui
  // coûte une donnée.
  const [bodyHeight, setBodyHeight] = React.useState(
    m.heightCm === null ? "" : String(m.heightCm),
  );
  const [bodyWeight, setBodyWeight] = React.useState(
    m.weightKg === null ? "" : String(m.weightKg),
  );
  const [bodyGender, setBodyGender] = React.useState<MemberGender | "">(
    m.gender ?? "",
  );
  /**
   * LE CRAN, SEMÉ DEPUIS LA BASE.
   *
   * ── ⛔ IL PARTAIT DE `null`, ET C'EST CE QUI A FAIT CROIRE À UNE PERTE ────
   * Ce brouillon ne servait QUE tant que le corps manquait; quand il était
   * connu, une AUTRE branche rendait les tuiles sur `m.activityLevel`, donc la
   * valeur enregistrée s'affichait. Cette branche a disparu le 2026-08-19 avec
   * la réouverture du corps en édition — et les tuiles sont restées sur ce
   * brouillon vide.
   *
   * Résultat, signalé le jour même: « j'ai l'impression que ses journées
   * comment elles sont ne s'enregistre pas ». Vérifié en base: `trains_some`
   * y était. Rien n'était perdu — l'écran ne relisait plus ce qu'il avait
   * écrit, ce qui est la même chose du point de vue de qui remplit.
   */
  const [bodyActivity, setBodyActivity] = React.useState<ActivityLevel | null>(
    m.activityLevel,
  );
  // ② LES DEUX AXES — même état, même re-semence, même écrivain que le cran
  // au-dessus. Les séparer ferait deux gestes d'enregistrement sur une seule
  // porte, et c'est celui qu'on regarde le moins qui écraserait l'autre.
  const [bodyDayActivity, setBodyDayActivity] = React.useState<
    DayActivityLevel | null
  >(m.dayActivity);
  const [bodySportFrequency, setBodySportFrequency] = React.useState<
    SportFrequency | null
  >(m.sportFrequency);
  /**
   * ── ⚠️ ET IL SE RE-SÈME APRÈS CHAQUE ÉCRITURE ────────────────────────────
   * `load(false)` relit la base et rend une nouvelle valeur; un `useState`
   * initialisé une fois garderait la photo d'avant l'enregistrement. Le
   * symptôme serait le même que celui qu'on referme, décalé d'un geste.
   */
  const bodySeed = `${m.heightCm ?? ""}|${m.weightKg ?? ""}|${m.gender ?? ""}|` +
    `${m.activityLevel ?? ""}|${m.dayActivity ?? ""}|${m.sportFrequency ?? ""}`;
  const [bodySeededFrom, setBodySeededFrom] = React.useState(bodySeed);
  if (bodySeededFrom !== bodySeed) {
    setBodySeededFrom(bodySeed);
    setBodyHeight(m.heightCm === null ? "" : String(m.heightCm));
    setBodyWeight(m.weightKg === null ? "" : String(m.weightKg));
    setBodyGender(m.gender ?? "");
    setBodyActivity(m.activityLevel);
    setBodyDayActivity(m.dayActivity);
    setBodySportFrequency(m.sportFrequency);
  }
  const onFile = m.birthDate === BIRTH_DATE_ON_FILE;
  /**
   * ÉCRIT CE QUI EST PRÊT — appelé à la SORTIE d'un champ, jamais par un bouton.
   *
   * ⚠️ `onBlur` ET PAS `onChange`, ET C'EST UNE MESURE, PAS UN GOÛT. Sur un
   * champ numérique, `onChange` part à chaque frappe: taper « 169 » écrirait
   * 1, puis 16, puis 169 — trois allers-retours, dont deux valeurs que personne
   * n'a voulues et que la relecture pourrait rendre entre-temps. À la sortie du
   * champ, la valeur est celle que la personne a fini d'écrire.
   *
   * ⚠️ ET IL PASSE TOUJOURS TOUT L'ÉTAT DE LA CARTE. Les trois du corps partent
   * ensemble (la RPC est tout-ou-rien) et la cible a besoin du corps: envoyer
   * seulement le champ qu'on vient de quitter ferait écrire une ligne partielle
   * que la base refuse — ou pire, qu'elle accepte à moitié.
   */
  const saveNow = () =>
    props.onSaveAndClose({
      birthDate: date,
      heightCm: bodyHeight,
      weightKg: bodyWeight,
      gender: bodyGender,
      activityLevel: bodyActivity,
      dayActivity: bodyDayActivity,
      sportFrequency: bodySportFrequency,
      targetWeightKg: targetDraft.targetWeightKg,
      paceKgPerWeek: targetDraft.paceKgPerWeek,
    });
  /**
   * LE BROUILLON DE SA CIBLE — SEMÉ SUR LA LECTURE, PAS SUR DU VIDE.
   *
   * ⚠️ `TargetAndPaceFields` parle le vocabulaire de `MouthFormDraft`: il lui
   * faut le CORPS et l'ÂGE pour borner le curseur, pas seulement les deux
   * nombres. On lui construit donc une fiche complète à partir de ce que la
   * base a rendu pour cette bouche — jamais un brouillon vide, qui ferait
   * proposer un rythme calculé sur un corps inexistant.
   *
   * ⚠️ ET IL SE RE-SÈME QUAND LA LECTURE CHANGE. Sans la clé, changer la
   * direction dans le sélecteur juste au-dessus (qui écrit et relit) laisserait
   * le brouillon sur l'ancienne, et les deux champs resteraient repliés sur une
   * direction qui, elle, vient de bouger.
   */
  const [targetDraft, setTargetDraft] = React.useState<MouthFormDraft>(() =>
    mouthDraftFromRow(m, props.target)
  );
  const targetSeed = `${m.goal ?? ""}|${props.target?.targetWeightKg ?? ""}|${
    props.target?.paceKgPerWeek ?? ""
  }|${m.heightCm ?? ""}|${m.weightKg ?? ""}|${m.gender ?? ""}`;
  const [seededFrom, setSeededFrom] = React.useState(targetSeed);
  if (seededFrom !== targetSeed) {
    setSeededFrom(targetSeed);
    setTargetDraft(mouthDraftFromRow(m, props.target));
  }
  // ── L'ÂGE DE CETTE LIGNE, DATE TAPÉE COMPRISE (chantier P3) ──────────────
  // C'est lui qui filtre les tuiles et qui replie la cible: le brouillon de
  // cible ne porte PAS la date (le roster ne la rend jamais, voir
  // `mouthDraftFromRow`), donc `foldMinorGoal` y serait aveugle — on plie ici,
  // sur l'état d'âge que la ligne connaît, avec la même règle (`goalForAge`).
  const rowAge = funnelMouthAgeState(m, date, browserLocalDate());
  const rowShownGoal = goalForAge(m.goal ?? "", rowAge);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * LA DATE ENTRE DANS LE BROUILLON DE CIBLE — 2026-09-19
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ── LE DÉFAUT, REPRODUIT À L'ÉCRAN ────────────────────────────────────
   * Signalé: « le curseur n'apparaît pas dans le cas d'une perte de poids ».
   * Vérifié sur une bouche ajoutée puis rouverte par « Modifier », en
   * `fat_loss`, avec sa taille, son poids et son sexe: « Poids visé » se
   * dépliait, **le curseur non**. Sur la fiche d'AJOUT, les deux apparaissent —
   * et c'est ce qui désigne la cause.
   *
   * ── LA CAUSE ──────────────────────────────────────────────────────────
   * `mouthDraftFromRow` ne porte PAS la date de naissance (« le roster ne la
   * rend jamais », et c'était vrai quand il a été écrit). Or le curseur se
   * borne sur l'entretien estimé, et `estimatedMaintenanceKcal` rend `null`
   * sans BANDE D'ÂGE (`meal_envelope.ts` ~1067) — donc `paceCeilingFor` rend
   * `null`, donc `paceControlFor` rend `needs_body`, donc pas de curseur. Le
   * champ « Poids visé », lui, passe par un autre chemin et s'affichait: d'où
   * une fiche qui promet un rythme et n'en donne pas.
   *
   * ── POURQUOI ICI, ET PAS DANS LA SEMENCE ──────────────────────────────
   * La date EST connue de la ligne: `date`, semée par la porte scopée au
   * maître (`keel_household_member_birth_date_for_owner`) et remplaçable au
   * clavier. La mettre dans `targetDraft` obligerait à la remettre dans la CLÉ
   * de semence — et chaque frappe dans le champ date re-sèmerait le brouillon,
   * donc effacerait un poids visé en cours de saisie. On la DÉRIVE, comme la
   * direction juste au-dessus: le brouillon garde ce qu'on y tape, la fiche
   * voit l'âge que la ligne connaît.
   */
  const rowTargetDraft: MouthFormDraft = {
    ...(rowShownGoal === targetDraft.goal
      ? targetDraft
      : { ...targetDraft, goal: rowShownGoal, targetWeightKg: "", paceKgPerWeek: "" }),
    birthDate: date,
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {/* LE PRÉNOM EN TÊTE DE SECTION, et pas une ligne de texte parmi
            d'autres: c'est ce qui dit « ici commence quelqu'un d'autre ». */}
        <span className="min-w-0 text-base font-semibold text-ink">
          {m.firstName || "—"}
        </span>
        {/* ── ⛔ ICI SE TENAIT LA PASTILLE « Un adulte / Un enfant » ────────
            Retirée le 2026-09-20, sur la décision de l'utilisateur: « le
            toggle adulte, en vrai on s'en fout, faut le virer, ça pollue le
            regard ». Elle avait été mise là pour rendre le début de chaque
            ligne lisible; ce travail est fait depuis par le PRÉNOM en gras et
            par le cadre de la carte, et elle ne restait qu'en doublon d'un
            fait que la date de naissance dit déjà.

            ⚠️ `m.kind` N'EST PAS MORT POUR AUTANT: il décide encore quelles
            directions cette bouche peut porter (`goalsForAge`) et quel motif
            la retient (`adult_without_birth_date`). C'est son AFFICHAGE qui
            part, pas la donnée. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* ── RETIRER, EN DEUX CLICS ────────────────────────────────────
              Un clic arme, le second exécute — et le libellé CHANGE entre les
              deux, donc on ne confirme pas en cliquant deux fois au même
              endroit sans lire. Pas de modale: on est dans un couloir, et une
              boîte de dialogue qui se ferme mal y devient une impasse.

              ⚠️ `danger` ET PAS `primary`: dans tout le produit le rouge dit
              l'échec ou le refus, et un geste destructeur emprunte ce sens. La
              figue est réservée à l'action principale de l'écran — ici,
              « Continue ».

              Le maître n'a pas ce bouton (`m.claimed` est vrai pour lui et sa
              ligne ne descend pas ici), et la base refuserait de toute façon:
              `cannot_remove_owner`. */}
          {/* ── « MODIFIER », ET IL EST LA PORTE DE TOUT LE RESTE ─────────
              Hors édition, cette carte ne montre que ce qu'on SAIT d'elle.
              Le bouton est ce qui arme les contrôles — sinon dix champs
              écrivant en base au moindre clic restaient ouverts en permanence
              sous chaque prénom. */}
          {/* ── ⛔ UN SEUL ENREGISTREMENT PAR CARTE (2026-08-19) ────────────
              Il y en avait QUATRE — un sous la date, un sous le corps, un sous
              la cible, un sous les préférences —, et deux d'entre eux sont
              apparus le jour même en rouvrant ces blocs en édition. Réaction
              immédiate: « je comprends pas pourquoi d'un coup j'ai des
              enregistrer pour l'activité et la date de naissance ».

              Quatre boutons du même nom sur une carte, c'est quatre fois la
              question « qu'est-ce que celui-là enregistre, au juste » — et
              trois occasions d'en oublier un.

              ⛔ ET LA RÉPONSE N'EST PAS « UN SEUL BOUTON » NON PLUS. Premier
              essai le même jour: « Terminé » écrivait tout. Tranché dans la
              foulée — « le seul bouton enregistrer c'est pour le shaker, le
              reste s'enregistre automatiquement ». C'est juste: un formulaire
              qui garde des réponses en mémoire jusqu'à un clic final est un
              formulaire qui les perd au premier rechargement, et ce couloir en
              a déjà fait perdre.

              CHAQUE CHAMP ÉCRIT DONC TOUT SEUL — à la sortie du champ pour ce
              qui se tape, au clic pour ce qui se choisit.

              ⚠️ SEUL LE SHAKER GARDE SON BOUTON: il n'est pas un champ de la
              personne mais un OBJET qu'on ajoute, et il ne part qu'entier.

              ── ⟳ 2026-09-20 · « Terminé » EN HAUT DEVIENT « Enregistrer » EN
                 BAS, ET CE N'EST PAS UN RENOMMAGE ─────────────────────────
              Rapporté à l'écran: « pour les personnes en plus, je n'ai pas de
              bouton enregistrer comme je l'ai avec le compte maître ». Vrai
              au pied de la lettre — le seul geste de sortie était un
              « Terminé » en TÊTE de carte, à l'opposé du dernier champ rempli
              et sous un nom qui ne promet rien.

              Le nouveau bouton appelle `saveNow()` AVANT de refermer, et c'est
              ce qui rend le nom exact: sans lui, le dernier champ quitté par
              un clic sur le bouton lui-même partirait bien (le `blur` précède
              le `click`), mais un contrôle choisi sans jamais rendre le focus
              ne serait couvert par rien de nommé. Le mot « Enregistrer » ne
              décrit donc plus l'écriture au fil de l'eau, il décrit CE
              bouton-là.

              ⚠️ IL N'EST PAS DANS L'EN-TÊTE, et « Modifier » si. Les deux
              cartes de cet écran suivent le même gabarit depuis ce jour: on
              OUVRE par le haut, on SORT par le bas. */}
          {props.editing ? null : (
            <Button
              variant="secondary"
              size="sm"
              disabled={props.busy}
              onClick={props.onToggleEdit}
            >
              {t("setup.mouths.edit")}
            </Button>
          )}
          {props.confirmRemove ? (
            <Button
              variant="danger"
              size="sm"
              disabled={props.busy}
              onClick={props.onRemove}
            >
              {t("setup.mouths.remove_confirm")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={props.busy}
              onClick={props.onConfirmRemove}
            >
              {t("setup.mouths.remove")}
            </Button>
          )}
        </div>
      </div>

      {/* ═══ CE QUI SUIT NE S'OUVRE QU'AU BOUTON « MODIFIER » ═══════════════
          Hors édition, la carte rend un RÉSUMÉ de ce qu'on sait — pas dix
          champs armés. Voir la prop `editing`. */}
      {props.editing ? (
        <>
      {/* LA DATE NE SE PRÉREMPLIT PAS, ET C'EST LA BASE QUI LE DÉCIDE: le
          roster NE REND JAMAIS la date d'une bouche (le foyer doit savoir qu'il
          y a un enfant à table, pas son âge). On sait seulement qu'elle EXISTE,
          parce que l'âge n'est plus `unknown`. */}
      {/* ── ⛔ LE CHAMP EXISTE MÊME QUAND UNE DATE EST DÉJÀ EN BASE ──────────
          Il n'était rendu que si la date MANQUAIT — et à la place, une phrase
          disait « laisse ce champ vide pour la garder, ou choisis une nouvelle
          date pour la remplacer ». Elle parlait d'un champ qui n'était PAS à
          l'écran. On ne pouvait donc pas corriger une date de naissance, et la
          phrase promettait le contraire.

          ⚠️ IL RESTE VIDE, ET C'EST LA BASE QUI LE DÉCIDE: le roster ne rend
          JAMAIS la date d'une bouche (le foyer doit savoir qu'il y a un enfant
          à table, pas son âge). On ne peut donc pas la préremplir — d'où la
          phrase, qui est maintenant vraie. */}
      {/* ⚠️ L'AIDE DU CHAMP CHANGE SELON CE QUE LA BASE PORTE, et ce n'est pas
          cosmétique: le champ reste VIDE même quand une date est enregistrée
          (le roster ne rend jamais la date d'une bouche — le foyer doit savoir
          qu'il y a un enfant à table, pas son âge). Un champ vide sous une aide
          générique se lit donc comme « ça ne s'est pas enregistré », ce qui a
          été signalé le 2026-08-19 alors que la date ÉTAIT en base. La phrase
          « déjà enregistrée » était bien là — mais en paragraphe séparé
          au-dessus, où elle ne se rattachait à rien. */}
      <Field
        label={t("setup.people.birth_date")}
        hint={onFile
          ? t("household.member.birth_date_kept")
          : t("setup.people.birth_date_hint")}
        htmlFor={`setup-mouth-date-${m.memberId}`}
      >
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={`setup-mouth-date-${m.memberId}`}
              type="date"
              value={date}
              max={browserLocalDate()}
              onChange={(e) => setDate(e.target.value)}
              onBlur={saveNow}
              // `min-w-0` EST LA CORRECTION, pas du confort: `min-width: auto`
              // sur un enfant flex l'empêche de rétrécir, et la ligne déborde à
              // 320 px.
              className={`${inputClass} min-w-0 flex-1`}
            />
          </div>
      </Field>

      {/* ⚠️ UN ENFANT QUI A UN COMPTE VOIT LA MÊME CHOSE QUE LES AUTRES.
          Cette ligne portait `m.claimed && m.kind === "child" ? null : …`: sur
          un mineur déjà inscrit, l'écran ne rendait RIEN — ni le champ, ni la
          phrase qui dit où il vit. C'est l'ancienne règle « un mineur n'a pas
          d'objectif », renversée le 2026-08-18, et c'était en plus le pire des
          deux mondes: un blanc ne dit pas « ça se règle ailleurs ».

          ⟳ 2026-09-03 (chantier P3): les tuiles remplacent le `<select>` et son
          option vide. Un mineur SANS compte ne voit qu'une tuile, « Manger
          normalement » (`goalsForAge` — la base refuse le reste depuis
          `20260822041500`); son âge vient de `funnelMouthAgeState`, date tapée
          comprise, et une direction héritée est pliée et DITE. Un clic écrit
          tout de suite (`onGoal`), donc il n'y a plus rien à « dé-choisir ». */}
      {(
        m.claimed ? (
          // ⚠️ D1 DU CHANTIER FOYER: dès qu'une bouche a un compte, son objectif
          // vit dans SON « about you ». Le champ n'est donc pas ici — et le dire
          // évite qu'on cherche un réglage qui n'existe plus à cet endroit.
          <p className="text-xs text-ink-soft">{t("setup.mouths.goal_from_profile")}</p>
        ) : (
          <Field label={t("setup.mouths.goal")} htmlFor={`setup-mouth-g-${m.memberId}`}>
            <GoalTiles
              id={`setup-mouth-g-${m.memberId}`}
              name={`setup-mouth-g-${m.memberId}`}
              ariaLabel={t("setup.mouths.goal")}
              value={m.goal ?? ""}
              ageState={rowAge}
              disabled={props.busy}
              labelOf={goalLabel}
              onChange={(g) => props.onGoal(g)}
            />
          </Field>
        )
      )}

      {/* LE CORPS, QUAND IL MANQUE. Même raison que le bloc d'allergies
          ci-dessous: sans champ sur la ligne, `canGenerate` réclamerait un
          corps que rien ne permettrait de donner — un bouton gris et rien à
          faire. C'est le cas nominal d'une bouche saisie sur
          `/app/household`, ou d'une reprise. */}
      {/* ── ⛔ LE CORPS SE RÉÉDITE, MÊME QUAND IL EST DÉJÀ LÀ ────────────────
          Cette condition était `heightCm === null || weightKg === null ||
          gender === null`: le bloc DISPARAISSAIT dès que les trois étaient
          saisis. L'intention était bonne (ne pas redemander ce qu'on sait), le
          résultat ne l'était pas — plus aucun écran de l'entonnoir ne
          permettait de corriger un poids, et « Modifier » ouvrait une carte où
          justement les faits qu'on veut modifier étaient absents. Signalé le
          2026-08-19, capture à l'appui.

          Ce qui reste vrai de l'intention est porté par la SEMENCE: les champs
          arrivent remplis, donc on ne redemande rien — on montre, et on laisse
          corriger. */}
              {/* ⛔ L'AIDE (« Les trois ensemble, ou aucun des trois. »,
                  `setup.mouths.body_hint`) EST PARTIE LE 2026-09-20, sur
                  demande. La RÈGLE, elle, n'a pas bougé: `isUsableMouthHeight`
                  et `isUsableMouthWeight` retiennent toujours l'étape, et les
                  motifs `member_height_cm` / `member_weight_kg` nomment le champ
                  qui manque, sur la carte de la bonne personne. Ce qui est
                  retiré est l'annonce, pas la garde. */}
              <Field label={t("setup.mouths.body")}>
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                type="number"
                inputMode="numeric"
                min={30}
                max={260}
                placeholder={t("setup.people.height")}
                aria-label={t("setup.people.height")}
                value={bodyHeight}
                onChange={(e) => setBodyHeight(e.target.value)}
                onBlur={saveNow}
                className={`${inputClass} min-w-0`}
              />
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={2}
                max={400}
                placeholder={t("setup.people.weight")}
                aria-label={t("setup.people.weight")}
                value={bodyWeight}
                onChange={(e) => setBodyWeight(e.target.value)}
                onBlur={saveNow}
                className={`${inputClass} min-w-0`}
              />
              <select
                aria-label={t("setup.people.gender")}
                value={bodyGender}
                // UN `select` SE VALIDE AU CHOIX, pas à la sortie: il n'y a
                // pas de frappe intermédiaire à attendre.
                onChange={(e) => {
                  setBodyGender(e.target.value as MemberGender);
                  props.onSaveAndClose({
                    birthDate: date,
                    heightCm: bodyHeight,
                    weightKg: bodyWeight,
                    gender: e.target.value as MemberGender,
                    activityLevel: bodyActivity,
                    dayActivity: bodyDayActivity,
                    sportFrequency: bodySportFrequency,
                    targetWeightKg: targetDraft.targetWeightKg,
                    paceKgPerWeek: targetDraft.paceKgPerWeek,
                  });
                }}
                className={`${inputClass} min-w-0`}
              >
                <option value="">{t("setup.people.gender")}</option>
                {MEMBER_GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {t(`household.body.gender_${g}` as "household.body.gender_female")}
                  </option>
                ))}
              </select>
            </div>
            {/* LE CRAN VOYAGE AVEC LE BOUTON D'À CÔTÉ, ET IL LE DOIT. La RPC
                refuse `body_incomplete` tant que les trois ne sont pas là:
                une tuile qui écrirait toute seule ici rendrait un refus
                incompréhensible sur un geste qui a l'air d'avoir marché. */}
            {/* ⚠️ « Ses journées » ET PAS « La journée de {prénom} »: cette
                rangée est DÉJÀ dépliée sous le prénom de la personne, qui la
                titre. La fiche d'ajout, elle, n'a pas ce titre au-dessus — elle
                nomme donc la personne dans la question. Deux voix, un seul
                catalogue d'options. */}
            <ActivityAxesTiles
              dayLabel={t("setup.day_activity.member_label")}
              sportLabel={t("setup.sport.member_label")}
              dayHint={null}
              sportHint={null}
              day={bodyDayActivity}
              sport={bodySportFrequency}
              onDay={setBodyDayActivity}
              onSport={setBodySportFrequency}
              busy={props.busy}
              idPrefix={`setup-row-${m.memberId}`}
            />
          </div>
        </Field>


          {/* ── OÙ VA SA BALANCE, ET À QUELLE VITESSE ──────────────────────
              ⛔ CES DEUX CHAMPS N'EXISTAIENT PAS SUR CETTE CARTE, ET C'EST LA
              DONNÉE QUI ÉTAIT INATTEIGNABLE. Ils ne vivaient que sur la fiche
              d'AJOUT: une bouche inscrite sans direction, puis passée à
              « Perdre du poids » depuis le sélecteur juste au-dessus, ne
              pouvait JAMAIS recevoir de cible depuis cet écran — et rien ne le
              disait. Signalé le 2026-08-19.

              ⚠️ ILS SE REPLIENT TOUT SEULS SUR UNE DIRECTION QUI NE BOUGE PAS
              (`TargetAndPaceFields` rend `null`), donc la carte ne pose la
              question que quand elle a un sens.

              ⚠️ ET LA GARDE DE LECTURE EST AU-DESSUS, pas ici: `props.target`
              à `null` veut dire « pas encore lu », et on ne monte alors aucun
              champ — `setMemberTarget` REMPLACE la paire, un formulaire ouvert
              sur du vide non lu effacerait la cible déjà posée. */}
          {props.target !== null ? (
            <>
              <div onBlur={saveNow}>
              <TargetAndPaceFields
                voice="other"
                who={m.firstName.trim() || t("household.mouth.who_fallback")}
                // Pliée à l'âge de la ligne — voir `rowTargetDraft`.
                draft={rowTargetDraft}
                onChange={setTargetDraft}
                todayLocalIso={browserLocalDate()}
                // ⚠️ PRÉFIXE PAR MEMBRE. Trois cartes peuvent être à l'écran,
                // et deux `id` identiques feraient qu'un libellé désigne le
                // curseur de quelqu'un d'autre.
                idPrefix={`setup-row-${m.memberId}`}
              />
              </div>
            </>
          ) : null}
        </>
      ) : (
        // ── HORS ÉDITION: CE QU'ON SAIT, ET RIEN QU'ON PUISSE TOUCHER ──────
        // ⚠️ UN RÉSUMÉ, PAS UN BLANC. « Il n'y a rien ici » et « ça se règle
        // derrière Modifier » ne sont pas la même phrase — c'est la règle que
        // cette page applique déjà à une bouche qui a un compte.
        <MouthRowSummary
          mouth={m}
          target={props.target}
          birthDate={props.birthDate}
          voice="other"
        />
      )}

      {/* ── LA MÊME PORTE QUE POUR LES DEUX AUTRES FICHES ────────────────
          ⛔ ICI SE TENAIT UN TROISIÈME CHAMP D'ALLERGIES EN LIGNE, rendu
          seulement quand la question n'avait pas de réponse. Il est passé dans
          la fenêtre le 2026-08-18, avec les deux autres.

          ⚠️ ET IL EST MONTRÉ MÊME QUAND LES ALLERGIES SONT DÉJÀ RÉPONDUES,
          contrairement à ce qu'il remplace: la fenêtre ne porte plus seulement
          la question de sécurité — elle porte aussi ce que cette bouche mange
          déjà, ce qu'elle n'aime pas, et son régime. Le garder conditionné à
          `allergiesReviewed` rendrait ces trois blocs-là inatteignables pour
          toute bouche dont on a déjà déclaré les allergies.

          ── ⟳ 2026-09-20 · MAIS PLUS HORS ÉDITION ─────────────────────────
          Même geste que sur la carte du titulaire, même raison: sous un résumé
          replié, ce cadre ajoutait un bouton et deux lignes de récapitulatif
          par personne — sur un écran replié exactement pour tenir. Elle reste
          la seule porte vers les allergies, et « Modifier » la rouvre. */}
      {/* LA BARRE DE FIN DE CARTE — la porte à gauche, le geste de sortie à
          droite. Voir la note longue sur « Modifier » en tête de carte, et
          celle de `action` dans `MouthPreferencesButton` pour l'ordre.

          ⛔ ET LE QUATRIÈME « Enregistrer » S'EN VA AUSSI. Il y en avait un
          sous le bouton des préférences, qui n'écrivait que ce que la fenêtre
          avait collecté — donc un de plus à côté d'un autre. Celui-ci le
          couvre: `saveNow()` emporte toute la carte. */}
      {props.editing ? (
        <MouthPreferencesButton
          busy={props.busy}
          onOpen={props.onOpenPreferences}
          voice="other"
          who={m.firstName.trim() || t("household.mouth.who_fallback")}
          action={
            <Button
              variant="secondary"
              disabled={props.busy}
              onClick={() => {
                saveNow();
                props.onToggleEdit();
              }}
            >
              {t("household.member.save")}
            </Button>
          }
        />
      ) : null}

      {/* ══════════════════════════════════════════════════════════════════
          ⛔ ICI SE TENAIT « Lui donner son propre accès ? » — RETIRÉ 2026-09-20
          ══════════════════════════════════════════════════════════════════

          Quatre-vingts lignes: un bouton, un panneau dépliant, trois phrases
          d'explication, un champ e-mail, un bouton d'envoi et le lien à
          recopier — sur CHAQUE personne d'une liste qui peut en porter huit,
          au milieu d'un couloir dont le seul travail est d'obtenir un premier
          plan. Décision de l'utilisateur: « lui donner son propre accès aussi,
          à cette étape de l'onboarding, on peut l'oublier ».

          ⚠️ LA FONCTIONNALITÉ N'EST PAS SUPPRIMÉE, ELLE A UN AUTRE DOMICILE.
          `/app/household` porte la même invitation, avec ses propres libellés
          (`household.invite.*`) et la même porte en base
          (`keel_household_invite`, FF-048 R2). C'est la SURFACE D'ENTONNOIR
          qui part, pas le droit d'inviter — et le retirer d'ici ne laisse donc
          personne sans chemin.

          ⚠️ LES CLÉS `setup.access.*` SURVIVENT AU CATALOGUE, désarmées. Les
          effacer obligerait à trancher la même question dans `en.ts`, et
          l'étape peut vouloir les reprendre; ce qui compte est qu'aucun
          composant ne les rende plus. */}
    </div>
  );
}
