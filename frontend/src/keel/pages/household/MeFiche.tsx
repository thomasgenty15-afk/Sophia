// ⟳ 2026-09-24 — SORTI DE `HouseholdPage.tsx` (découpage, lot 4c), À L'IDENTIQUE.
// La fiche du titulaire: `OwnFiche`, `MeFiche`, `MeSheetForm`, `MePrefsForm`.
// Le fichier d'origine l'atteint par ses imports; il ré-exporte ce qu'il exportait.

import React from "react";
import { type AllergyView, type HouseholdMemberView, goalForAge, type MemberGoal } from "../../api/household";
import type { EatingOccasion } from "../../api/mealGeneration";
import { ageStateOfTypedDate, draftFromKnown, emptyMouthDraft, type KnownMouth, type MouthFormDraft, submitIsHeld } from "../../lib/mouthForm";
import { allergenLabel } from "../../copy/allergens";
import { useEatingStructure } from "../../lib/useEatingStructure";
import { MouthCoreFields, MouthPreferencesFields } from "../../components/MouthFormDialog";
import Modal from "../../components/ui/Modal";
import { t } from "../../i18n/t";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { SectionLabel } from "../../components/ui/Card";
import { goalLabel } from "./labels.ts";
import { type MouthDraft, MouthFields } from "./MouthFields.tsx";

/**
 * CE QUI N'APPARTIENT QU'À LA FICHE DU TITULAIRE — un seul objet, exprès.
 *
 * ⚠️ IL VOYAGE D'UN SEUL BLOC de la page à `MembersCard` puis à `MeFiche`.
 * Cinq props éparses auraient laissé un appelant en passer quatre: la fiche se
 * serait rendue, et son seul chemin d'écriture aurait été muet.
 */
export interface OwnFiche {
  /**
   * D5 — SA FICHE COMPLÈTE, ou `null`.
   *
   * `null` REMET LE FORMULAIRE DE REPLI (prénom · date · direction), et ce
   * n'est pas décoratif: c'est le seul qui n'écrase rien quand une des deux
   * lectures qui REMPLACENT n'a pas abouti, et le seul qui CRÉE la ligne
   * `student_goals`. Voir `knownMouthForOwner`.
   */
  sheet: null | {
    known: KnownMouth;
    todayLocalIso: string;
    failure: string | null;
    onSave: (draft: MouthFormDraft) => Promise<boolean>;
  };
  /**
   * LES MOMENTS SUR LESQUELS SA FICHE L'INTERROGE. REQUIS — non passé, la
   * fenêtre reviendrait aux six créneaux en dur, le défaut signalé le
   * 2026-08-19. `habitSlotsFor` porte la cascade.
   */
  slots: readonly EatingOccasion[];
  /** Tant que sa ligne `student_goals` n'existe pas, la composition refuse. */
  needsGoalRow: boolean;
  /**
   * D1 — l'objectif d'un titulaire vit dans son « about you ». On ne l'offre
   * dans le repli que tant que sa ligne N'EXISTE PAS: c'est la CRÉATION qui
   * supprime la falaise.
   */
  goalEditable: boolean;
  /** Le chemin d'écriture du repli — il porte `alsoCreateGoalRow`. */
  onSave: (patch: {
    firstName: string;
    birthDate: string | null;
    goal: MemberGoal | null;
  }) => Promise<boolean>;
}

/**
 * MA FICHE — LA PREMIÈRE DE LA LISTE, ET UNE FICHE COMME LES AUTRES.
 *
 * ── ⟳ 2026-09-09 · ELLE ÉTAIT UNE CARTE À PART, ET C'ÉTAIT UN DOUBLON ─────
 * `MeCard` vivait au-dessus de « qui mange ici », et la liste en dessous
 * portait AUSSI la ligne du titulaire: deux fiches pour la même personne, deux
 * boutons « Modifier », deux fenêtres qui écrivent les mêmes colonnes.
 * Signalé à l'écran (« qui mange ici, ça fait un peu doublon »).
 *
 * Elle est maintenant le PREMIER ÉLÉMENT DE LA LISTE, et `MembersCard` retire
 * la ligne du titulaire quand elle la rend — une personne, une fiche.
 *
 * ⚠️ CE QU'ELLE PORTE EN PLUS DE LA FENÊTRE DE LA FICHE, et pourquoi. En
 * retirant sa ligne de la liste, on lui retirait quatre choses que `MemberRow`
 * lui donnait: son déjeuner de semaine, ses absences, ses allergies déjà
 * enregistrées, et les deux cartes de son compte. Elles sont donc ici. Ce sont
 * les MÊMES composants montés à un second endroit (chacun lit et écrit
 * lui-même), jamais des copies — la règle que `KitchenEquipmentCard` porte
 * déjà entre l'entonnoir et cet écran.
 *
 * ⛔ ELLE N'EST RENDUE QU'AU MAÎTRE. Un profil réclamé garde SA ligne dans la
 * liste (elle est éditable depuis A5 point 6), et sa direction se règle dans
 * son « about you » sur `/app/plan`: lui donner cette fiche-ci lui montrerait
 * un corps et des allergies que la base lui refuse (`not_owner`).
 *
 * ⚠️ EXPORTÉE POUR SON HARNAIS, et pas par commodité: ce qui se prouve est
 * « QU'EST-CE QUE LE LECTEUR VOIT » — que la fiche repliée ne porte AUCUN
 * formulaire, et que les deux formulaires possibles ne coexistent jamais.
 */
export function MeFiche(
  {
    me,
    fiche,
    allergies,
    busy,
    todayLocalIso,
    onRemoveAllergy,
  }: {
    me: HouseholdMemberView;
    /** Tout ce qui n'appartient qu'à SA fiche — voir `MembersCard`. */
    fiche: OwnFiche;
    /** SES allergies, déjà filtrées. La fenêtre les LISTE et les retire. */
    allergies: AllergyView[];
    busy: boolean;
    /**
     * `YYYY-MM-DD` LOCAL, REQUIS — jamais une horloge lue ici. L'âge qui filtre
     * les directions se lit sur la date TAPÉE dans le formulaire de repli.
     */
    todayLocalIso: string;
    onRemoveAllergy: (id: string) => void;
    /**
     * ⟳ 2026-09-19 — SIX PROPS SONT PARTIES AVEC LEURS BLOCS, et il faut savoir
     * lesquelles avant d'en rebrancher une:
     *
     *   `rhythm` · `awayWindow` · `onSaveAway`  — la grille d'absences;
     *   `workLunch` · `workLunchError` · `onSaveWorkLunch` — le déjeuner en
     *      semaine;
     *   `practicalConstraints` · `hasGoal` · `onSavedOwnConstraints` — les deux
     *      cartes du compte (« comment se passe ta journée », « ce que Sophia
     *      sait »).
     *
     * Aucune des trois questions n'a disparu du produit: elles vivent sur
     * `/app/plan` et dans l'entonnoir. Ce qui part est le DOUBLON de cette
     * fiche-ci. Voir le pavé de `MePrefsForm`.
     */
  },
) {
  const { sheet: sheet2, needsGoalRow, goalEditable, slots, onSave } = fiche;
  const [draft, setDraft] = React.useState<MouthDraft>({
    firstName: me.displayName === "—" ? "" : me.displayName,
    birthDate: "",
    goal: (me.goal as MemberGoal | null) ?? "",
  });
  const [saved, setSaved] = React.useState(false);
  // ── D5 · L'ÉTAT DE LA FENÊTRE ──────────────────────────────────────────
  // ⚠️ LES HOOKS SONT INCONDITIONNELS, même quand `sheet` est `null`: une
  // fiche qui gagne sa fenêtre à la deuxième lecture changerait sinon de
  // nombre de hooks entre deux rendus.
  /**
   * QUELLE FENÊTRE EST OUVERTE — 2026-09-19.
   *
   * ⛔ UN ÉTAT À TROIS VALEURS, PAS DEUX BOOLÉENS: deux booléens ont un
   * quatrième état inexprimable à l'écran (les deux ouvertes) mais écrivable
   * en TypeScript — c'est-à-dire deux `createPortal` empilés, que ce dépôt
   * n'a jamais essayés.
   */
  const [sheet, setSheet] = React.useState<"identity" | "preferences" | null>(
    null,
  );
  // ⚠️ SEMÉ DÈS LE PREMIER RENDU, ET RE-SEMÉ À CHAQUE LECTURE DIFFÉRENTE (voir
  // l'effet juste en dessous). L'initialiseur seul laisserait la fiche montrer
  // du vide pendant un battement — « un formulaire qui affiche du vide non lu
  // finit toujours par le faire écrire ».
  //
  // ⚠️ ET IL VIT ICI, PAS DANS LA FENÊTRE: `Modal` démonte ses enfants en se
  // fermant, donc un brouillon posé plus bas serait perdu au premier clic à
  // côté.
  const [sheetDraft, setSheetDraft] = React.useState<MouthFormDraft>(() =>
    sheet2 === null ? emptyMouthDraft() : draftFromKnown(sheet2.known)
  );
  /**
   * ⚠️ ON SÈME SUR LA LECTURE, PAS AU MONTAGE, ET C'EST LA MOITIÉ QUI COMPTE.
   *
   * `setHabits` comme `setTarget` REMPLACENT ce qu'elles trouvent: un brouillon
   * figé au montage rendrait, au deuxième Save, la photo d'AVANT le premier.
   * C'est la cicatrice « `current` périmé efface l'écriture d'avant ».
   *
   * La dépendance est la VALEUR lue, sérialisée: un re-rendu qui rend le même
   * `known` ne touche à rien, donc une saisie en cours survit à tout ce qui
   * n'est pas une lecture différente.
   */
  const knownKey = JSON.stringify(sheet2?.known ?? null);
  React.useEffect(() => {
    if (sheet2 === null) return;
    setSheetDraft(draftFromKnown(sheet2.known));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownKey]);
  // L'ÂGE DU FORMULAIRE DE REPLI: la date tapée gagne sur le roster.
  const meAge = ageStateOfTypedDate(draft.birthDate, me.ageState, todayLocalIso);

  /* ⛔ `filledBlocks` A ÉTÉ RETIRÉ D'ICI — ⟳ 2026-09-21. Il ne servait qu'au
     résumé de la carte, parti le même jour (voir le pavé à son ancienne
     place, sous les deux portes). `filledPreferenceBlocks` reste employé par
     le cadre repliable du formulaire, où le résumé est la contrepartie du
     repli; c'est cet appel-ci, et lui seul, qui n'avait plus de lecteur. */

  return (
    <li className="rounded-card border border-line bg-paper-2 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{me.displayName}</span>
        {me.role === "owner" ? <Badge>{t("household.members.owner")}</Badge> : null}
        {me.goal ? <Badge>{goalLabel(me.goal as MemberGoal)}</Badge> : null}
        {allergies.map((a) => (
          // ⚠️ `allergenLabel` ET PAS LE JETON NU: le catalogue écrit des SLUGS.
          <Badge key={a.id} tone="critical">{allergenLabel(a.label)}</Badge>
        ))}
        {/* MÊME AFFORDANCE QUE LES AUTRES FICHES tant qu'il n'y a rien à
            débloquer. Quand la ligne d'objectif manque, ce bouton est le seul
            geste qui ouvre la composition: il prend alors la teinte de marque,
            et la fiche dit juste en dessous ce qu'il lève. */}
        {needsGoalRow
          ? (
            <Button
              className="ml-auto"
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => setSheet("identity")}
            >
              {t("household.me.open")}
            </Button>
          )
          : (
            /* ── DEUX PORTES, COMME SUR CHAQUE AUTRE LIGNE (2026-09-19) ────
               ⛔ SEULEMENT HORS `needsGoalRow`. Tant que la ligne d'objectif
               manque, il n'y a qu'UN geste sur cette carte — celui qui ouvre
               la composition —, et lui donner un voisin le noierait. */
            /* ── DEUX PORTES, EN BOUTONS — ⟳ 2026-09-21 ───────────────────
               Elles étaient deux textes soulignés, et le motif écrit ici
               disait: « PAS DEUX BOUTONS PLEINS: huit bouches feraient seize
               actions principales ». Renversé sur demande — « ils vont pas
               dans la DA ceux-là ».

               ⚠️ `secondary`, ET C'EST CE QUI GARDE LA MOITIÉ VRAIE DE
               L'ANCIEN MOTIF. Un bouton de contour n'est pas une action
               principale: huit bouches font seize portes lisibles, pas seize
               appels à cliquer. Le plein (`primary`) reste réservé au geste
               qui débloque la composition, juste au-dessus. */
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => setSheet("identity")}
              >
                {t("household.member.frame_identity")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => setSheet("preferences")}
              >
                {t("household.member.frame_preferences")}
              </Button>
            </span>
          )}
      </div>

      {/* ⚠️ UN ÉTAT, PAS UNE PRÉSENTATION. Tant que la ligne `student_goals`
          n'existe pas, `generate-household-meal-v1` rend `goal_required` (409)
          — et on le découvrait après avoir saisi tout le foyer. */}
      {/* ⛔ LE RÉSUMÉ DE LA CARTE EST PARTI — ⟳ 2026-09-21, SUR DEMANDE.
          « Rien de renseigné — le plan se compose sans. Ça se remplit plus
          tard. » / « Déjà renseigné : … » s'écrivait une fois par bouche, sous
          deux portes qui disent déjà où aller.

          ⚠️ CE QU'IL PAYAIT: « une réponse repliée est une réponse invisible »
          (2026-08-19). Ce qui rend le retrait tenable est que les deux portes
          restent, visibles et nommées — ce n'est plus un repli muet, c'est une
          carte sans commentaire.

          ⚠️ L'AVERTISSEMENT D'OBJECTIF, LUI, RESTE. Il ne résume rien: il dit
          qu'une composition RENDRA 409 tant que la ligne manque. */}
      {needsGoalRow
        ? (
          <p className="mt-1 text-xs leading-5 text-amber-800">
            {t("household.me.unlock")}
          </p>
        )
        : null}

      {/* ══════════════════════════════════════════════════════════════════
          DEUX FENÊTRES, DEUX CONTENUS — 2026-09-19
          ══════════════════════════════════════════════════════════════════

          Le détail de ce qui part, et de ce qui le garde ailleurs, est sur
          `MePrefsForm`. Ce qui se lit ici est la mécanique: UN état à trois
          valeurs, donc jamais deux `createPortal` empilés — `Modal` rend `null`
          quand il est fermé, et `sheet` n'en ouvre qu'un.

          ⚠️ ELLES SE DÉMONTENT EN SE FERMANT, et c'est voulu: rouvrir une
          fenêtre la rouvre sur ce que la BASE dit. Le brouillon, lui, vit dans
          la ligne (`sheetDraft`) — il survit donc au passage d'une fenêtre à
          l'autre, ce qui est exactement ce que le bouton « Renseigner tes
          préférences » a besoin de faire. */}
      <Modal
        open={sheet === "identity"}
        onClose={() => setSheet(null)}
        title={me.displayName === "—"
          ? t("household.me.open")
          : t("household.member.identity_title_named", { name: me.displayName })}
        size="lg"
        closeAsIcon
        closeLabel={t("common.close")}
      >
        <div className="flex flex-col gap-3">
          {sheet2 !== null
            ? (
              <MeSheetForm
                draft={sheetDraft}
                onChange={setSheetDraft}
                todayLocalIso={sheet2.todayLocalIso}
                busy={busy}
                failure={sheet2.failure}
                // LE PONT ENTRE LES DEUX FENÊTRES: on ferme celle-ci et on
                // ouvre l'autre, sur le MÊME brouillon.
                onOpenPreferences={() => setSheet("preferences")}
                onSubmit={() => {
                  void (async () => {
                    const ok = await sheet2.onSave(sheetDraft);
                    // ON NE FERME QUE SUR UN SUCCÈS: un refus doit rester SOUS
                    // le geste, dans la fenêtre qui porte le champ fautif.
                    if (ok) setSheet(null);
                  })();
                }}
              />
            )
            : (
              /* ── LE REPLI — LES TROIS CHAMPS ────────────────────────────
                 `sheet2 === null` veut dire qu'une des deux lectures qui
                 REMPLACENT n'a pas abouti. Ce formulaire-ci n'écrit que prénom,
                 date et direction: il n'écrase rien de ce qu'on n'a pas lu, et
                 il reste le seul chemin qui CRÉE la ligne d'objectif.

                 ⚠️ LES DEUX NE COEXISTENT JAMAIS: deux formulaires qui écrivent
                 les mêmes trois colonnes, c'est la garantie qu'un jour l'un des
                 deux cessera d'écrire ce que l'autre écrit. */
              <>
                <MouthFields
                  draft={draft}
                  onChange={(next) => {
                    setSaved(false);
                    setDraft(next);
                  }}
                  mine
                  showKeptDateHint={me.ageState !== "unknown"}
                  goalEditable={goalEditable}
                  ageState={meAge}
                  radioName="household-goal-me"
                />
                {/* L'INCITATION EST INTÉGRÉE, et elle est vraie: un objectif
                    posé sur une bouche sans âge est enregistré et NON APPLIQUÉ
                    (`goalApplies`). Le taire ferait un champ qui ne fait rien. */}
                {me.goal && me.ageState === "unknown" ? (
                  <p className="text-sm text-amber-800">
                    {t("household.member.goal_inactive")}
                  </p>
                ) : null}
                <div className="flex items-center gap-3">
                  <Button
                    variant={needsGoalRow ? "primary" : "secondary"}
                    disabled={busy || !draft.firstName.trim()}
                    onClick={async () => {
                      const ok = await onSave({
                        firstName: draft.firstName,
                        birthDate: draft.birthDate || null,
                        // PLIÉE À L'ÂGE, comme à l'écran.
                        goal: goalForAge(draft.goal, meAge) || null,
                      });
                      setSaved(ok);
                      if (ok) setDraft((d) => ({ ...d, birthDate: "" }));
                    }}
                  >
                    {t("household.member.save")}
                  </Button>
                  {saved ? (
                    <span className="text-sm text-ink-soft">
                      {t("household.member.saved")}
                    </span>
                  ) : null}
                </div>
              </>
            )}
        </div>
      </Modal>

      <Modal
        open={sheet === "preferences"}
        onClose={() => setSheet(null)}
        title={me.displayName === "—"
          ? t("household.mouth.preferences_title")
          : t("household.mouth.preferences_title_named", { name: me.displayName })}
        size="lg"
        closeAsIcon
        closeLabel={t("common.close")}
      >
        <div className="flex flex-col gap-3">
          {sheet2 !== null ? (
            <MePrefsForm
              draft={sheetDraft}
              onChange={setSheetDraft}
              todayLocalIso={sheet2.todayLocalIso}
              busy={busy}
              slots={slots}
              // ══════════════════════════════════════════════════════════
              // « TERMINÉ » ENREGISTRE, PUIS FERME — 2026-09-19
              // ══════════════════════════════════════════════════════════
              //
              // ⛔ LE PIÈGE QUE LE DÉCOUPAGE VENAIT DE CRÉER. Tant que les
              // goûts étaient un accordéon, le bouton « Enregistrer » de la
              // fiche était SOUS eux, dans la même fenêtre: « Terminé » ne
              // faisait que replier, et ça se voyait. En fenêtre séparée, le
              // même bouton est le SEUL geste de fin — et il n'écrivait rien.
              // « Un geste qui ne fait rien est indiscernable d'un geste qui a
              // marché », le mode d'échec n°1 de ce dépôt.
              //
              // ⛔ ET C'EST LA MÊME PORTE, PAS UNE SECONDE. `sheet2.onSave` est
              // exactement ce que « Enregistrer » appelle sur l'autre fenêtre:
              // un brouillon, un écrivain. Deux écrivains sur le même
              // brouillon finiraient par ne pas écrire la même chose.
              //
              // ⚠️ ET IL NE TENTE RIEN QUAND LA FICHE EST RETENUE. `persistMouth`
              // écrit AUSSI le corps: sur un brouillon incomplet il poserait une
              // taille et un poids à ZÉRO. La fenêtre d'identité, elle, nomme ce
              // qui manque à côté de son bouton (`submitIsHeld` y grise déjà le
              // geste) — on referme donc sans écrire, et le brouillon survit
              // dans la ligne.
              onClose={() => {
                if (submitIsHeld(sheetDraft, sheet2.todayLocalIso)) {
                  setSheet(null);
                  return;
                }
                void (async () => {
                  const ok = await sheet2.onSave(sheetDraft);
                  if (ok) setSheet(null);
                })();
              }}
            />
          ) : null}

          {/* ── SES ALLERGIES DÉJÀ ENREGISTRÉES ──────────────────────────
              LA LISTE ET LE RETRAIT, JAMAIS UN SECOND CHAMP D'AJOUT: on ajoute
              dans le catalogue juste au-dessus (`add_allergy` n'a pas de
              « poser la liste »), et deux champs qui ajoutent la même chose
              finiraient par ne pas ajouter la même chose.

              ⚠️ ELLE NE SE REND QUE S'IL Y A QUELQUE CHOSE À RETIRER. C'est ce
              qui la garde compatible avec « cette fenêtre, c'est la fiche de
              goûts et rien d'autre »: sur un compte sans allergie — le cas de
              la capture du 2026-09-19 — elle n'existe pas. Sans elle, une
              allergie enregistrée n'aurait plus AUCUN endroit où se retirer. */}
          {allergies.length > 0 ? (
            <div className="border-t border-line pt-3">
              <SectionLabel>{t("household.constraint.kind.allergy")}</SectionLabel>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {allergies.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-red-700">
                      {allergenLabel(a.label)}
                    </span>
                    <button
                      className="text-ink-soft underline"
                      disabled={busy}
                      onClick={() => onRemoveAllergy(a.id)}
                    >
                      {t("household.allergy.remove")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Modal>
    </li>
  );
}

/**
 * LE CORPS DE LA FICHE DU TITULAIRE — 2026-09-09.
 *
 * ⚠️ UN COMPOSANT À PART, ET C'EST UNE CONTRAINTE DE PREUVE, PAS UN GOÛT. Même
 * raison que `AddMouthForm`, écrite juste en dessous: `Modal` passe par
 * `createPortal(…, document.body)`, et `renderToStaticMarkup` ne rend RIEN d'un
 * portail. Monté à travers le chrome, ce formulaire serait une chaîne vide, et
 * chaque assertion qui le vise serait verte quoi qu'il arrive.
 *
 * ⛔ ET IL N'OUVRE PAS DE SECONDE FENÊTRE. Le bouton des préférences (dans
 * `MouthCoreFields`) bascule l'accordéon qui est JUSTE EN DESSOUS, dans la même
 * fenêtre.
 */
export function MeSheetForm(
  { draft, onChange, todayLocalIso, busy, failure, onOpenPreferences, onSubmit }: {
    draft: MouthFormDraft;
    onChange: React.Dispatch<React.SetStateAction<MouthFormDraft>>;
    todayLocalIso: string;
    busy: boolean;
    failure: string | null;
    /**
     * LE PONT VERS L'AUTRE FENÊTRE. REQUIS — `MouthCoreFields` rend le bouton
     * quoi qu'il arrive; sans geste branché, il ne ferait rien.
     */
    onOpenPreferences: () => void;
    onSubmit: () => void;
  },
) {
  // `/app/household` ne rend cette fiche QUE pour le compte courant: sa ligne
  // EXISTE (`existing`), elle a un compte (`hasAccount`), et la fiche lui parle
  // à la deuxième personne (`isSelf`).
  const subject = { existing: true, hasAccount: true, isSelf: true } as const;

  return (
    <div className="flex flex-col gap-4">
      <MouthCoreFields
        draft={draft}
        onChange={onChange}
        subject={subject}
        todayLocalIso={todayLocalIso}
        busy={busy}
        failure={failure}
        // ⟳ 2026-09-19 — IL OUVRE L'AUTRE FENÊTRE, il ne déplie plus un
        // accordéon: les deux moitiés de la fiche sont deux `Modal` distincts.
        onOpenPreferences={onOpenPreferences}
        onSubmit={onSubmit}
      />
    </div>
  );
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA SECONDE FENÊTRE DU TITULAIRE — SES GOÛTS, ET RIEN D'AUTRE (2026-09-19)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QUE CE DÉCOUPAGE REMPLACE, ET POURQUOI ─────────────────────────────
 * La fiche était UNE fenêtre: le formulaire d'identité, puis un accordéon de
 * goûts, puis le déjeuner en semaine, puis « comment se passe ta journée »,
 * puis « ce que Sophia sait », puis la grille d'absences. Six sujets sous un
 * seul prénom, dont deux posaient DEUX FOIS la même question — les moments de
 * la journée se cochaient dans l'accordéon ET dans la carte du dessous, avec
 * une taille en plus d'un côté.
 *
 * Décision du propriétaire, 2026-09-19: deux fenêtres, deux contenus, et rien
 * d'autre dedans. Ce qui posait la question en double est parti (la carte de
 * rythme), la grille d'absences aussi.
 *
 * ⚠️ CE QUI N'EST PAS PERDU, ET C'EST CE QUI REND LE RETRAIT ACCEPTABLE:
 *   · « comment se passe ta journée » et « ce que Sophia sait » vivent sur
 *     `/app/plan` (`StudentWeekPlanPage`), qui les monte toujours;
 *   · le déjeuner en semaine se pose dans l'entonnoir (`SetupPage`);
 *   · la grille d'absences est celle de `/app/plan` et de l'entonnoir.
 * Aucune de ces quatre surfaces n'a bougé — c'est le DOUBLON de la fiche du
 * foyer qui part.
 *
 * ⚠️ UN COMPOSANT À PART, ET C'EST UNE CONTRAINTE DE PREUVE: `Modal` passe par
 * `createPortal(…, document.body)`, dont `renderToStaticMarkup` ne rend RIEN.
 * Monté à travers le chrome, ce formulaire serait une chaîne vide et chaque
 * assertion qui le vise serait verte quoi qu'il arrive.
 */
export function MePrefsForm(
  { draft, onChange, todayLocalIso, busy, slots, onClose }: {
    draft: MouthFormDraft;
    onChange: React.Dispatch<React.SetStateAction<MouthFormDraft>>;
    todayLocalIso: string;
    busy: boolean;
    /** Les moments sur lesquels sa fiche l'interroge. REQUIS — voir `OwnFiche`. */
    slots: readonly EatingOccasion[];
    onClose: () => void;
  },
) {
  const subject = { existing: true, hasAccount: true, isSelf: true } as const;
  // ⚠️ FF-060 — MÊME VERROU QU'À L'INSCRIPTION. Sans lui, cette fiche laisserait
  // décocher un moment que le parcours d'inscription venait de verrouiller: deux
  // écrans, deux réponses, et celui qui ment est le second.
  const structure = useEatingStructure({
    draft,
    // LA FENÊTRE EST OUVERTE QUAND CE CORPS EST MONTÉ: `Modal` démonte ses
    // enfants en se fermant, donc le montage EST la porte.
    active: true,
    todayLocalIso,
    // LA FICHE DU TITULAIRE, ET ELLE SEULE.
    subject: "self",
  });

  return (
    <MouthPreferencesFields
      draft={draft}
      onChange={onChange}
      subject={subject}
      busy={busy}
      structure={structure}
      onClose={onClose}
      slots={slots}
      // ⟳ `with_the_card` DEPUIS LE 2026-09-01: le stock d'un compte est
      // `student_goals.practical_constraints`, et c'est le bouton de la fiche
      // qui l'écrit (`ownShakerWriter`). Voir `ShakerPort`.
      shakerPort={{ kind: "with_the_card" }}
    />
  );
}
