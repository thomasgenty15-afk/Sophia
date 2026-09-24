// ⟳ 2026-09-24 — SORTI DE `SetupPage.tsx` (découpage, lot 4b), À L'IDENTIQUE.
// L'étape 2b: les autres bouches.
// Le fichier d'origine l'importe; il ré-exporte ce qu'il exportait.

import React from "react";
import { Button } from "../../components/ui/Button";
import { Card, SectionLabel } from "../../components/ui/Card";
import type {
  DayActivityLevel,
  SportFrequency,
  ActivityLevel,
} from "../../../../../supabase/functions/_shared/keel/tokens.ts";
import type { MemberGender, MemberGoal } from "../../api/household";
import { type FunnelMouth, HOUSEHOLD_MAX_MOUTHS } from "../../api/onboarding";
import { MouthCoreFields } from "../../components/MouthFormDialog";
import type { MouthFormDraft } from "../../lib/mouthForm";
import type { MemberTargetView } from "../../api/mouthProfile";
import { browserLocalDate } from "../../lib/useMealTicks";
import { t } from "../../i18n/t";
import { type MouthDraft, mouthDraftHasContent } from "./mouthDraft.ts";
import { MouthRow } from "./MouthRow.tsx";

// ───────────────────────────────────────────────────────────────────────────
// ÉTAPE 2b — LES AUTRES BOUCHES
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ EXPORTÉ POUR ÊTRE RENDU, pas pour être réutilisé ailleurs.
 *
 * `SetupPage` entier ne se monte pas sous `renderToStaticMarkup` (session,
 * routeur, deux appels modèle), et ce qui doit être prouvé ici est le CONTENU
 * du formulaire d'ajout — qu'il ne demande plus « adulte ou enfant », et qu'il
 * propose les trois directions. Un test de source aurait dit la même chose sur
 * du texte; ce dépôt a déjà vu des tests de source rester verts sur du code
 * mort. Voir `pages/setupMouthsStep.int.test.ts`.
 */
export function MouthsStep(props: {
  mouths: FunnelMouth[];
  /** Plafond de LA BRANCHE: solo 0, couple 1, famille 7. */
  maxOthers: number;
  draft: MouthDraft;
  onDraftChange: React.Dispatch<React.SetStateAction<MouthDraft>>;
  onAdd: () => void;
  /**
   * La phrase qui retient, ou `null`. REQUISE — jamais optionnelle: un
   * paramètre de garde facultatif est une garde désarmée, et celle-ci est la
   * seule chose qui relie le refus au bouton qui le lève.
   */
  held: string | null;
  /** Le refus d'un geste de cette carte, ou `null`. REQUIS, même raison. */
  failure: string | null;
  /**
   * LE PRÉNOM QUE « CONTINUER » VIENT D'ENREGISTRER, ou `null`. REQUIS — et
   * pour la même raison que les deux au-dessus: c'est la seule chose qui dise
   * qu'un bouton d'AVANCEMENT a créé quelqu'un. Le rendre facultatif le
   * laisserait non passé, et l'ajout redeviendrait muet sans que rien ne casse.
   */
  added: string | null;
  /**
   * Vide le brouillon ET REFERME la fiche. REQUIS: sans lui, une fiche ouverte
   * est un cul-de-sac — c'est le « Retirer » demandé le 2026-08-19.
   */
  onDiscard: () => void;
  /**
   * LA FICHE D'AJOUT EST-ELLE DÉPLIÉE ? REQUIS — jamais optionnel: non passé,
   * il vaudrait `undefined`, la fiche serait toujours repliée, et le bouton
   * d'ajout n'ouvrirait rien. Une garde facultative est une garde désarmée.
   */
  formOpen: boolean;
  /** La déplie. REQUIS, même raison: c'est la seule porte d'entrée. */
  onOpenForm: () => void;
  onGoal: (mouth: FunnelMouth, goal: MemberGoal) => void;
  onBirthDate: (mouth: FunnelMouth, date: string) => void;
  onAllergyAnswer: (mouth: FunnelMouth, labels: string[]) => void;
  /** Ouvre la fenêtre sur le brouillon d'AJOUT. REQUIS — seule porte. */
  onOpenDraftPreferences: () => void;
  /** Ouvre la fenêtre sur une bouche DÉJÀ inscrite. REQUIS, même raison. */
  onOpenMouthPreferences: (mouth: FunnelMouth) => void;
  /**
   * LE BROUILLON DE PRÉFÉRENCES D'UNE BOUCHE INSCRITE — celui qui est ouvert,
   * ou `null`. C'est lui que le récapitulatif de sa ligne rend.
   */
  mouthPrefs: { memberId: string; draft: MouthFormDraft } | null;
  /* ⛔ ICI VIVAIT `knownPrefs` — ce que la base porte pour une bouche, en
     vocabulaire de brouillon. Elle n'existait que pour nourrir le
     récapitulatif sous la porte des préférences, retiré le 2026-09-20.

     ⚠️ ELLE PORTAIT UNE DÉCISION QU'IL FAUDRA REPRENDRE SI LE RÉCAPITULATIF
     REVIENT: elle ne semait PAS les dégoûts, parce que leur porte n'a
     qu'`add`/`remove` — les compter aurait dit « renseignés » sur une lecture
     qui n'a pas eu lieu. Un récapitulatif qui invente est pire qu'un
     récapitulatif court. */
  /** Enregistre ce brouillon-là. REQUIS: sans lui la fenêtre ne promet rien. */
  onSaveMouthPreferences: (mouth: FunnelMouth) => void;
  onBody: (
    mouth: FunnelMouth,
    heightCm: string,
    weightKg: string,
    gender: MemberGender | "",
    activityLevel: ActivityLevel | null,
    // ② Les deux axes voyagent avec le corps: une seule porte, un seul geste.
    dayActivity: DayActivityLevel | null,
    sportFrequency: SportFrequency | null,
  ) => void;
  onRemove: (mouth: FunnelMouth) => void;
  /**
   * LA CARTE EN ÉDITION, ou `null`. REQUIS — jamais optionnel: non passé, il
   * vaudrait `undefined`, aucune carte ne s'ouvrirait, et « Modifier » serait
   * un bouton mort. Une garde facultative est une garde désarmée.
   */
  editingMemberId: string | null;
  onToggleEdit: (mouth: FunnelMouth) => void;
  /** Voir `MouthRow`: un seul geste écrit tout ce qui est prêt, puis referme. */
  onSaveAndClose: (
    mouth: FunnelMouth,
    fields: {
      birthDate: string;
      heightCm: string;
      weightKg: string;
      gender: MemberGender | "";
      activityLevel: ActivityLevel | null;
      dayActivity: DayActivityLevel | null;
      sportFrequency: SportFrequency | null;
      targetWeightKg: string;
      paceKgPerWeek: string;
    },
  ) => void;
  /**
   * LES CIBLES LUES, ou `null` tant que la lecture n'a pas eu lieu. REQUIS, et
   * la garde compte double ici: `setMemberTarget` REMPLACE la paire.
   */
  targets: Map<string, MemberTargetView> | null;
  /**
   * LES DATES LUES, ou `null` tant que la lecture n'a pas eu lieu. REQUIS —
   * `undefined` ferait taire la garde et le champ repartirait vide.
   */
  birthDates: Map<string, string> | null;
  onTarget: (
    mouth: FunnelMouth,
    targetWeightKg: string,
    paceKgPerWeek: string,
  ) => void;
  confirmRemove: string | null;
  onConfirmRemove: (memberId: string | null) => void;
  busy: boolean;
}) {
  const draft = props.draft;
  // ── ⛔ ICI SE TENAIT `set`, LE POSEUR DE CHAMP DE CETTE CARTE ─────────────
  // Il écrivait le brouillon champ par champ pour les dix contrôles recopiés
  // à la main. `MouthCoreFields` reçoit maintenant `onDraftChange` DIRECTEMENT
  // et pose ses propres champs — avec sa propre mise à jour fonctionnelle, pour
  // la même raison qu'ici: React groupe les mises à jour d'un même tick, et deux
  // champs touchés coup sur coup partiraient sinon du même état de départ.
  const householdFull = props.mouths.length + 1 >= HOUSEHOLD_MAX_MOUTHS;
  const branchFull = props.mouths.length >= props.maxOthers;
  /**
   * LA FICHE EST-ELLE DÉPLIÉE ?
   *
   * ⚠️ « OU LE BROUILLON A DU CONTENU » N'EST PAS UNE COMMODITÉ, C'EST LA
   * GARDE. Le brouillon survit à des gestes qui ne passent pas par ce
   * composant (« Continuer » qui échoue, une reprise d'étape, un refus
   * d'ajout): sans ce second membre, une fiche déjà remplie pourrait se
   * retrouver REPLIÉE, donc invisible — et « Continuer » l'enregistrerait
   * quand même, ce qui est très exactement le défaut qu'on referme.
   */
  const formOpen = props.formOpen || mouthDraftHasContent(draft);

  return (
    <Card>
      <SectionLabel>{t("setup.mouths.title")}</SectionLabel>

      {/* ── ⛔ LE REFUS EST RENDU ICI, DEHORS, ET C'EST UNE CORRECTION ───────
          Il ne vivait QUE dans l'encadré pointillé du formulaire d'ajout. Or ce
          formulaire est REPLIÉ par défaut depuis le 2026-08-19 — donc tout
          refus d'un geste de cette carte (enregistrer les préférences d'une
          bouche, retirer quelqu'un, poser un corps) tombait dans un bloc que
          personne ne voyait.
          
          C'est le mode d'échec n°1 de ce dépôt, et il a coûté une matinée: on a
          cherché pourquoi les préférences « ne s'enregistraient pas » alors que
          l'écran avait peut-être déjà dit pourquoi, dans un cadre fermé.

          ⚠️ IL RESTE AUSSI À CÔTÉ DU FORMULAIRE D'AJOUT quand celui-ci est
          ouvert: un refus d'ajout doit se lire à côté de la fiche fautive. Deux
          rendus, deux portées, pas de doublon — celui-ci ne sort que hors
          formulaire. */}
      {props.failure !== null && !formOpen ? (
        <p className="mt-4 rounded-card border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900">
          {props.failure}
        </p>
      ) : null}

      {/* ── « CONTINUER » VIENT DE CRÉER QUELQU'UN, ET IL LE DIT ────────────
          L'absorption du brouillon par le bouton principal date du 2026-08-15
          et reste voulue. Ce qui manquait est l'accusé: on appuyait sur un
          bouton d'AVANCEMENT et une personne apparaissait, sans un mot.
          Signalé le 2026-08-19 — « ça m'a rajouté une personne que je voulais
          pas ». La phrase nomme la personne ET la sortie, parce qu'un accusé
          qui ne dit pas comment le défaire est un fait accompli. */}
      {props.added !== null ? (
        <p className="mt-4 rounded-card border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
          {t("setup.mouths.added_by_next", { name: props.added })}
        </p>
      ) : null}

      {props.mouths.length > 0 ? (
        // ── UNE PERSONNE, UNE SECTION ENCADRÉE ──────────────────────────────
        // C'était `divide-y divide-line`: un filet à 1,30:1 entre des blocs de
        // dix champs chacun. Mesuré sur un compte réel le 2026-08-13 — trois
        // personnes empilées, et l'écran se lisait comme UN formulaire de
        // trente champs dont on ne voyait pas où l'un finissait. Le prénom
        // n'était qu'un mot de plus dans le flux.
        //
        // Chaque bouche prend donc un cadre (`line-strong`, 3,84:1 — le
        // contour qui borde un CONTRÔLE), un fond légèrement décollé du papier,
        // et son prénom en tête de section. On voit trois blocs avant de lire
        // un seul champ.
        <ul className="mt-4 space-y-4">
          {props.mouths.map((m) => (
            <li
              key={m.memberId ?? m.firstName}
              className="rounded-card border border-line-strong bg-fig-50/40 p-4"
            >
              <MouthRow
                mouth={m}
                onGoal={(goal) => props.onGoal(m, goal)}
                onBirthDate={(date) => props.onBirthDate(m, date)}
                onAllergyAnswer={(labels) => props.onAllergyAnswer(m, labels)}
                // ── ⛔ LA BASE, PAS LE BROUILLON EN COURS D'ÉDITION ─────
                // Cette ligne rendait `emptyMouthDraft()` pour toute bouche
                // dont la fenêtre n'était PAS ouverte — donc le récapitulatif
                // disait « Rien de renseigné pour l'instant » sur tout le
                // monde, tout le temps, quoi qu'on ait saisi. Signalé le
                // 2026-08-19: « toutes les préférences alimentaires de tout le
                // monde ont sauté ». Elles avaient bien sauté en base (autre
                // défaut, corrigé sur `onClose`), mais même remplies l'écran
                // n'en aurait rien montré.
                //
                // Le brouillon ouvert gagne quand il existe: c'est ce qu'on est
                // en train de taper, et il est plus frais que la lecture.
                onOpenPreferences={() => props.onOpenMouthPreferences(m)}
                onSavePreferences={() => props.onSaveMouthPreferences(m)}
                onBody={(h, w, g, a, day, sport) =>
                  props.onBody(m, h, w, g, a, day, sport)}
                editing={props.editingMemberId === m.memberId}
                onToggleEdit={() => props.onToggleEdit(m)}
                onSaveAndClose={(fields) => props.onSaveAndClose(m, fields)}
                birthDate={props.birthDates === null
                  ? null
                  : props.birthDates.get(m.memberId ?? "") ?? ""}
                target={props.targets === null
                  ? null
                  : props.targets.get(m.memberId ?? "") ??
                    { targetWeightKg: null, paceKgPerWeek: null }}
                onTarget={(w, p) => props.onTarget(m, w, p)}
                onRemove={() => props.onRemove(m)}
                confirmRemove={props.confirmRemove === m.memberId}
                onConfirmRemove={() =>
                  props.onConfirmRemove(
                    props.confirmRemove === m.memberId ? null : m.memberId ?? null,
                  )}
                busy={props.busy}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {householdFull ? (
        // LE PLAFOND EST EN BASE (`household_full`). Cet écran ne fait que le
        // DIRE — « une limite d'UI n'est pas une limite ».
        <p className="mt-4 text-xs text-ink-soft">{t("setup.mouths.full")}</p>
      ) : branchFull ? null : formOpen ? (
        // LE FORMULAIRE D'AJOUT EST ENCADRÉ EN POINTILLÉ, et les personnes déjà
        // là en trait plein: le pointillé dit « pas encore quelqu'un ». Sans
        // cadre, il se lisait comme la suite de la dernière carte — donc comme
        // des champs vides SUR une personne existante.
        <div className="mt-4 space-y-4 rounded-card border border-dashed border-line-strong p-4">
          {/* ── ⟳ 2026-09-20 · LE CADRE DIT DE QUI IL PARLE ────────────────
              Il s'ouvrait directement sur « Qui c'est » — le titre du premier
              bloc de la fiche —, et rien au-dessus ne disait que ce bloc
              concerne quelqu'un qui n'existe pas encore. Signalé à l'écran:
              « le "qui c'est", on ne comprend pas facilement que c'est pour
              une nouvelle personne ».

              Le pointillé portait déjà ce sens, et il ne suffit pas: il le dit
              à qui connaît la convention, et cette convention s'apprend en
              comparant deux cadres — donc seulement une fois qu'une personne
              est déjà inscrite juste au-dessus. Le premier ajout, celui qui
              compte, n'a rien à comparer.

              ⛔ UN TITRE, ET RIEN SOUS LUI. Il y a eu une seconde ligne —
              « Elle n'est pas encore à table. » — retirée le jour même sur
              demande. Le titre porte déjà le fait; une phrase qui le répète en
              dessous est du remplissage sur l'écran qu'on vient d'alléger.

              ⛔ LE TITRE NE PREND PAS LE PRÉNOM TAPÉ, contrairement aux cartes
              au-dessus. Un prénom en gras ferait de cette fiche une carte de
              plus, c'est-à-dire quelqu'un qui est DÉJÀ à table — l'exact
              contraire de ce qu'on cherche à dire. */}
          <p className="text-base font-semibold text-ink">
            {t("setup.mouths.new_title")}
          </p>

          {/* ══════════════════════════════════════════════════════════════
              UN SEUL FORMULAIRE DE PERSONNE DANS LE DÉPÔT — A5, 2026-09-03
              ══════════════════════════════════════════════════════════════

              ⛔ ICI VIVAIENT DIX CHAMPS RECOPIÉS À LA MAIN, et c'est le mode
              d'échec n°1 de ce dépôt appliqué à un formulaire: prénom, date de
              naissance, sexe, taille, poids, la ligne du tout-ou-rien du corps,
              les tuiles de direction, la cible et son curseur, les deux axes
              d'activité — puis le bouton des préférences, le refus, la retenue
              et le bouton d'ajout. `/app/household` montait `MouthCoreFields`
              pour EXACTEMENT la même personne, avec les mêmes colonnes et les
              mêmes portes SQL derrière.

              DEUX FORMULAIRES POUR LA MÊME PERSONNE, ET ILS AVAIENT DÉJÀ
              DIVERGÉ. Trois écarts mesurés le 2026-09-03, avant ce lot:
                · la fiche du foyer NOMME ce qui retient l'enregistrement
                  (`household.mouth.held` + `missingRequiredBlocks`, bloc par
                  bloc); celle-ci ne disait rien — le bouton partait, et la
                  base refusait plus loin;
                · la fiche du foyer groupe en TROIS blocs obligatoires nommés
                  (`RequiredBlock`: qui c'est · son corps · sa direction);
                  celle-ci empilait dix champs à plat, sans dire lesquels vont
                  ensemble;
                · l'appétit et les trois cases du repas (`MouthAppetiteFields`,
                  dans le bloc du corps) n'étaient PAS collectables ici — une
                  bouche ajoutée depuis l'entonnoir naissait sans eux, et le
                  moteur retombait sur ses conventions sans que rien ne le dise.

              ⚠️ CE QUI NE CHANGE PAS, ET QUI EST LA MOITIÉ DU LOT: les bornes
              du corps (30–260 cm, 2–400 kg) sont celles de
              `keel_household_set_member_body`, pas celles de `profiles` — une
              bouche peut être un enfant de trois ans. `MouthCoreFields` porte
              DÉJÀ ces bornes-là, parce qu'il a toujours servi des bouches.
              L'unification ne les élargit ni ne les resserre.

              ⚠️ LA VOIX RESTE « IL OU ELLE ». `subject.isSelf: false` fait
              parler la fiche à la troisième personne, et `whoOf` NOMME la
              personne au lieu de deviner son genre (`lib/mouthVoice.ts`). La
              carte du titulaire, juste au-dessus, garde `voice="self"`.

              ⚠️ ET LES `id` NE SE COGNENT PAS. `MouthCoreFields` porte les
              `id` `mouth-*` (il était seul sur `/app/household`); sur cette
              page, la carte du titulaire est en `setup-self-*` et chaque
              bouche inscrite en `setup-row-<memberId>-*`. Vérifié: aucun
              `mouth-*` ailleurs dans ce fichier. */}
          <MouthCoreFields
            draft={draft}
            onChange={props.onDraftChange}
            // `existing: false` — on l'AJOUTE, donc le bouton dit « Ajouter »
            // et non « Enregistrer ». `hasAccount: false` — une bouche qu'on
            // saisit n'a jamais de compte au moment où on la saisit.
            // `isSelf: false` — la carte du titulaire est une autre carte.
            subject={{ existing: false, hasAccount: false, isSelf: false }}
            todayLocalIso={browserLocalDate()}
            busy={props.busy}
            // ⚠️ LE REFUS DESCEND DANS LA FICHE, et il n'est pas rendu deux
            // fois: le rendu du haut de carte est explicitement gardé par
            // `!formOpen`. Un refus d'ajout se lit à côté de la fiche fautive.
            failure={props.failure}
            onOpenPreferences={props.onOpenDraftPreferences}
            onSubmit={props.onAdd}
          />

          {/* ── CE QUI RETIENT LA BRANCHE, ET CE N'EST PAS CE QUI RETIENT LA
              FICHE ────────────────────────────────────────────────────────
              `MouthCoreFields` rend déjà sa propre retenue: « il manque son
              corps », bloc par bloc, à côté du bouton qui les lève. CELLE-CI
              est d'une autre nature — « il manque encore une personne », et
              elle vient de la réponse à l'étape 1. Les deux se lisent ensemble
              sans se répéter, et fondre l'une dans l'autre ferait disparaître
              la sortie: pour qui n'est finalement que deux, elle passe par la
              PREMIÈRE question, pas par ce formulaire.

              ⚠️ REQUISE, JAMAIS OPTIONNELLE (voir la prop): un paramètre de
              garde facultatif est une garde désarmée. */}
          {props.held !== null ? (
            <p className="rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              {props.held}
            </p>
          ) : null}

          {/* ── CE QUE LE BOUTON PRINCIPAL FERA DE CETTE FICHE, DIT AVANT ────
              Il y avait ici, avant le 2026-08-15, un avertissement qui disait
              l'inverse: « "Continuer" ne l'enregistre pas ». Il est parti avec
              le défaut qu'il avouait — le bouton absorbe désormais la fiche.
              Mais la phrase est partie SANS ÊTRE REMPLACÉE, et c'est ce trou
              qu'un compte réel a payé le 2026-08-19: « Continuer » a inscrit
              quelqu'un que la personne ne voulait pas.

              ⚠️ ELLE PARLE DE « CONTINUER », PAS DU BOUTON « AJOUTER » DE LA
              FICHE. Les deux inscrivent la même personne — c'est justement ce
              qu'elle existe pour dire: même si on ne touche pas « Ajouter »,
              le bouton d'AVANCEMENT en bas de page le fera. Elle reste donc
              sous la fiche, juste au-dessus de l'échappatoire qu'elle nomme. */}
          {draft.firstName.trim() !== "" ? (
            <p className="text-xs leading-5 text-ink-soft">
              {t("setup.mouths.next_will_save", { name: draft.firstName.trim() })}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {/* ── « RETIRER », ET IL EST LÀ QUOI QU'IL ARRIVE ────────────────
                ⚠️ IL ÉTAIT CONDITIONNÉ À `mouthDraftHasContent(draft)`, sous
                le libellé « Effacer cette fiche », au motif qu'un effacement
                posé sous un formulaire vide « invite à se demander ce qu'il
                effacerait ». L'argument tenait quand la fiche était toujours à
                l'écran; il tombe dès qu'elle s'OUVRE sur un geste — parce
                qu'alors elle a quelque chose à défaire même vide: elle-même.
                Demandé mot pour mot après le signalement du 2026-08-19 —
                « quand une personne clique sur ajouter sans faire exprès, ça
                se déplie et il peut vouloir le supprimer tout simplement ».
                Un geste qui s'ouvre sans se refermer est un piège.

                Et il porte « Retirer », le MÊME mot que sur la carte d'une
                personne inscrite. Les conséquences diffèrent (ici on referme
                une fiche, là on retire quelqu'un de la base) mais l'intention
                que l'utilisateur exprime est la même — « que ce bloc ne soit
                plus là » —, et c'est elle qu'un libellé doit nommer. Le trait
                plein contre le pointillé, et la confirmation en deux temps
                côté personne, portent la différence. */}
            <Button variant="ghost" disabled={props.busy} onClick={props.onDiscard}>
              {t("setup.mouths.remove")}
            </Button>
          </div>
        </div>
      ) : (
        // ── REPLIÉ: RIEN QU'UN BOUTON ──────────────────────────────────────
        // Le formulaire était monté EN PERMANENCE sous la liste des bouches,
        // et c'est ce qui a produit le signalement: un bloc en forme de
        // personne, avec les mêmes champs et le même bouton de préférences
        // qu'une bouche inscrite, posé là sans que personne l'ait demandé.
        // « Je peux toujours pas supprimer le truc qui s'est ajouté tout
        // seul » — et il avait raison de chercher: on ne pouvait pas.
        // Maintenant il n'existe que si on l'a ouvert, et « Retirer » le
        // referme.
        //
        // ⟳ 2026-09-24 — CENTRÉ QUAND PERSONNE N'EST ENCORE INSCRIT, sur
        // demande: c'est alors le seul contenu de la carte. Dès qu'une
        // personne est là, il se range sous la liste, à gauche.
        <div
          className={props.mouths.length === 0
            ? "mt-4 flex justify-center py-6"
            : "mt-4"}
        >
          <Button variant="secondary" disabled={props.busy} onClick={props.onOpenForm}>
            {t("setup.mouths.add")}
          </Button>
        </div>
      )}
    </Card>
  );
}
